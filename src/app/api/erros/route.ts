import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { registrarFalha } from "../../../lib/observabilidade";
import { ipDoVisitante } from "../../../lib/turnstile";
import { SITE_URL } from "../../../lib/site";

/**
 * A porta por onde o erro do navegador entra.
 *
 * ---------------------------------------------------------------------------
 * 204 em TODO caminho — inclusive quando ela mesma falha
 * ---------------------------------------------------------------------------
 * É rota pública, chamada por `sendBeacon` de dentro de uma página que já
 * quebrou. Devolver 4xx faria o navegador registrar um segundo erro por cima
 * do primeiro; devolver 5xx colocaria a porta de erro na fila de erro. E o
 * corpo da resposta não informa nada de propósito: quem chama não precisa
 * saber se gravou, e um atacante não precisa saber se a fila existe.
 *
 * ---------------------------------------------------------------------------
 * `request.text()`, nunca `request.json()`
 * ---------------------------------------------------------------------------
 * `sendBeacon` com corpo em string manda `text/plain;charset=UTF-8` — o único
 * tipo CORS-safelisted que serve. Exigir `application/json` aqui recusaria
 * justamente o caminho principal. Então lemos texto e fazemos o `JSON.parse`
 * nós mesmos, dentro de `try`.
 *
 * ---------------------------------------------------------------------------
 * O que o cliente NÃO decide
 * ---------------------------------------------------------------------------
 * `origem` é forçada a `"navegador"` e o `hash_agrupamento` é calculado no
 * servidor. Deixar qualquer um dos dois vir do corpo permitiria a quem
 * quisesse forjar linha de erro de servidor, ou escolher em que grupo da
 * triagem ela cai — que é o mesmo que escolher o que a loja vê.
 *
 * O rate-limit mora AQUI, e não no `src/proxy.ts`: o matcher do proxy cobre
 * `/api/leads` e `/api/avaliacao`, e editá-lo seria mexer no caminho de
 * conversão por causa de uma rota de diagnóstico.
 */

export const dynamic = "force-dynamic";

/** Teto do corpo. O evento montado no cliente cabe com folga em 16 KB. */
const TETO_DO_CORPO = 16_384;

/** Tetos por campo — os mesmos do cliente e dos CHECK da tabela. */
const TETOS = { mensagem: 500, stack: 4000, url: 500, navegador: 300, digest: 64, ag_uid: 64 };

const TIPOS = new Set(["erro", "rejeicao", "boundary"]);

let porIp: Ratelimit | null = null;
let global: Ratelimit | null = null;

function limitadores() {
  if (porIp && global) return { porIp, global };

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { porIp: null, global: null };

  try {
    const redis = new Redis({ url, token });
    porIp = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "@upstash/ratelimit/erros",
    });
    // Teto GLOBAL, de chave fixa: o limite por IP não segura uma botnet, e sem
    // ele a tabela cresceria sem fim. 600/h é ~14 mil linhas por dia no pior
    // caso — muito acima do tráfego real e ainda assim finito.
    global = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(600, "1 h"),
      prefix: "@upstash/ratelimit/erros-global",
    });
    return { porIp, global };
  } catch {
    // Redis fora é bypass, como em `src/proxy.ts:80-82`. A retenção de 90 dias
    // é a rede por baixo.
    return { porIp: null, global: null };
  }
}

/** Texto de um campo, cortado no teto. Qualquer outro tipo vira `null`. */
function texto(valor: unknown, teto: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo.slice(0, teto) : null;
}

export async function POST(request: Request) {
  try {
    // Interruptor: sem a env, a porta existe e descarta. O site segue igual.
    if (process.env.OBSERVABILIDADE !== "1") {
      return new NextResponse(null, { status: 204 });
    }

    /* Beacon de OUTRO site não interessa. `Origin` ausente é aceito: alguns
       navegadores o omitem em `sendBeacon` de mesma origem. */
    const origem = request.headers.get("origin");
    if (origem) {
      const nosso = new URL(SITE_URL).host;
      let host: string;
      try {
        host = new URL(origem).host;
      } catch {
        return new NextResponse(null, { status: 204 });
      }
      if (host !== nosso && !host.startsWith("localhost")) {
        return new NextResponse(null, { status: 204 });
      }
    }

    const { porIp: limiteIp, global: limiteGlobal } = limitadores();
    if (limiteIp && limiteGlobal) {
      const ip = ipDoVisitante(request as { headers: Headers }) ?? "sem-ip";
      const [umIp, todos] = await Promise.all([
        limiteIp.limit(ip),
        limiteGlobal.limit("erros:global"),
      ]);
      if (!umIp.success || !todos.success) return new NextResponse(null, { status: 204 });
    }

    /* O corpo é medido DEPOIS de lido: `content-length` pode faltar ou mentir,
       e confiar nele deixaria a porta aberta para corpo grande. */
    const bruto = await request.text();
    if (bruto.length > TETO_DO_CORPO) return new NextResponse(null, { status: 204 });

    let corpo: unknown;
    try {
      corpo = JSON.parse(bruto);
    } catch {
      return new NextResponse(null, { status: 204 });
    }
    if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
      return new NextResponse(null, { status: 204 });
    }

    // Allowlist: só estes campos, só string. Nada é percorrido em profundidade
    // — objeto aninhado não é lido, então não há como inflar o custo por aí.
    const c = corpo as Record<string, unknown>;

    const mensagem = texto(c.mensagem, TETOS.mensagem);
    if (!mensagem) return new NextResponse(null, { status: 204 });

    const tipo = typeof c.tipo === "string" && TIPOS.has(c.tipo) ? c.tipo : "erro";
    const release = texto(c.release, 64);

    await registrarFalha("quebra", `navegador:${tipo}`, mensagem, {
      // Forçada: o cliente não escolhe de que origem a linha é.
      origem: "navegador",
      stack: texto(c.stack, TETOS.stack),
      url: texto(c.url, TETOS.url) ?? undefined,
      navegador: texto(c.navegador, TETOS.navegador),
      // A forma de um SHA da Vercel. Qualquer outra coisa é descartada em vez
      // de virar campo livre.
      release: release && /^[0-9a-f]{7,40}$/.test(release) ? release : null,
      digest: texto(c.digest, TETOS.digest),
      ag_uid: (() => {
        const v = texto(c.ag_uid, TETOS.ag_uid);
        return v && /^[\w-]+$/.test(v) ? v : null;
      })(),
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    /* A porta de erro não pode gerar erro. Nem `console.error` aqui: o
       `onRequestError` já ignora esta rota justamente para não formar laço, e
       um log por requisição maliciosa seria o próprio ataque. */
    return new NextResponse(null, { status: 204 });
  }
}
