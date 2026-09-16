import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * `/api/erros` — a porta por onde o erro do navegador entra.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 *  1. **204 em todo caminho.** É rota pública chamada por `sendBeacon` de
 *     dentro de uma página que já quebrou. 4xx faria o navegador registrar um
 *     segundo erro por cima do primeiro; 5xx poria a porta de erro na fila de
 *     erro.
 *  2. **O cliente não decide `origem` nem o grupo.** Deixar `origem` vir do
 *     corpo permitiria forjar linha de erro de SERVIDOR; deixar o hash vir de
 *     fora permitiria escolher em que grupo da triagem a linha cai — que é o
 *     mesmo que escolher o que a loja vê.
 *  3. **`text/plain` é o caminho principal, não a exceção.** `sendBeacon` com
 *     string manda `text/plain`, o único tipo CORS-safelisted que serve.
 *     Exigir `application/json` recusaria justamente o caminho normal.
 *  4. **O proxy não é tocado.** O matcher de `src/proxy.ts` cobre
 *     `/api/leads` e `/api/avaliacao`; mexer nele por causa de uma rota de
 *     diagnóstico é mexer no caminho de conversão.
 */

const SUPABASE_URL = "https://banco.exemplo";
const CHAVE = "chave-de-servico-de-teste";

const ENVS = [
  "OBSERVABILIDADE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "N8N_WEBHOOK_ALERTA_URL",
] as const;

let anteriores: Record<string, string | undefined> = {};

async function rotaLimpa() {
  vi.resetModules();
  return import("../src/app/api/erros/route");
}

function ambienteCompleto() {
  process.env.OBSERVABILIDADE = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE;
  // Sem Redis: o limitador degrada para bypass, como em `src/proxy.ts:80-82`.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

/** Como o `sendBeacon` de verdade manda: string, `text/plain`. */
function comoBeacon(corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return new Request("https://motorsstore.com.br/api/erros", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", ...cabecalhos },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

function espiaoDeFetch() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response(null, { status: 201 }));
}

function idasAoBanco(espiao: ReturnType<typeof espiaoDeFetch>) {
  return espiao.mock.calls.filter(([u]) => String(u).includes(SUPABASE_URL));
}

function linhaGravada(espiao: ReturnType<typeof espiaoDeFetch>): Record<string, unknown> {
  const [, init] = idasAoBanco(espiao)[0] as [string, RequestInit];
  const bruto = JSON.parse(String(init.body));
  return Array.isArray(bruto) ? bruto[0] : bruto;
}

const EVENTO = {
  tipo: "erro",
  mensagem: "TypeError: x is not a function",
  stack: "TypeError: x\n    at f (/_next/static/chunks/app.js:1:1)",
  url: "https://motorsstore.com.br/estoque",
  navegador: "Mozilla/5.0",
  release: "d70e2e3",
  ag_uid: "ag-abc123",
};

beforeEach(() => {
  anteriores = Object.fromEntries(ENVS.map((k) => [k, process.env[k]]));
  vi.restoreAllMocks();
});

afterEach(() => {
  for (const k of ENVS) {
    if (anteriores[k] === undefined) delete process.env[k];
    else process.env[k] = anteriores[k];
  }
});

describe("o caminho normal", () => {
  it("aceita text/plain e grava a linha", async () => {
    ambienteCompleto();
    const chamou = espiaoDeFetch();
    const { POST } = await rotaLimpa();

    const res = await POST(comoBeacon(EVENTO));

    expect(res.status).toBe(204);
    const linha = linhaGravada(chamou);
    expect(linha.origem).toBe("navegador");
    expect(linha.assunto).toBe("navegador:erro");
    expect(String(linha.mensagem)).toContain("x is not a function");
    expect(linha.ag_uid).toBe("ag-abc123");
    expect(linha.release).toBe("d70e2e3");
    expect(linha.hash_agrupamento).toMatch(/^[0-9a-f]{8,64}$/);
  });

  it("a origem é FORÇADA — o corpo não escolhe", async () => {
    /* Sem isto, qualquer visitante forja linha de erro de servidor e a triagem
       passa a mostrar defeito que nunca existiu. */
    ambienteCompleto();
    const chamou = espiaoDeFetch();
    const { POST } = await rotaLimpa();

    await POST(comoBeacon({ ...EVENTO, origem: "servidor", natureza: "ambos" }));

    const linha = linhaGravada(chamou);
    expect(linha.origem).toBe("navegador");
    expect(linha.natureza).toBe("quebra");
  });

  it("o hash é calculado no servidor — o corpo não escolhe o grupo", async () => {
    ambienteCompleto();
    const chamou = espiaoDeFetch();
    const { POST } = await rotaLimpa();

    await POST(comoBeacon({ ...EVENTO, hash_agrupamento: "deadbeef" }));

    expect(linhaGravada(chamou).hash_agrupamento).not.toBe("deadbeef");
  });

  it("campos grandes são cortados", async () => {
    ambienteCompleto();
    const chamou = espiaoDeFetch();
    const { POST } = await rotaLimpa();

    await POST(comoBeacon({ ...EVENTO, mensagem: "m".repeat(3000), stack: "s".repeat(9000) }));

    const linha = linhaGravada(chamou);
    expect(String(linha.mensagem).length).toBeLessThanOrEqual(500);
    expect(String(linha.stack).length).toBeLessThanOrEqual(4000);
  });

  it("release e ag_uid fora de forma viram nulo, não campo livre", async () => {
    ambienteCompleto();
    const chamou = espiaoDeFetch();
    const { POST } = await rotaLimpa();

    await POST(
      comoBeacon({ ...EVENTO, release: "'; drop table erros; --", ag_uid: "não é uid <script>" }),
    );

    const linha = linhaGravada(chamou);
    expect(linha.release).toBeNull();
    expect(linha.ag_uid).toBeNull();
  });
});

describe("o que a porta recusa — sempre com 204", () => {
  it.each([
    ["corpo maior que o teto", "x".repeat(20_000)],
    ["JSON inválido", "{isto não é json"],
    ["array em vez de objeto", "[1,2,3]"],
    ["string solta", '"só um texto"'],
    ["objeto sem mensagem", '{"tipo":"erro"}'],
  ])("%s → 204 e nada gravado", async (_nome, corpo) => {
    ambienteCompleto();
    const chamou = espiaoDeFetch();
    const { POST } = await rotaLimpa();

    const res = await POST(comoBeacon(corpo));

    expect(res.status).toBe(204);
    expect(idasAoBanco(chamou)).toHaveLength(0);
  });

  it("beacon de outro site é descartado", async () => {
    ambienteCompleto();
    const chamou = espiaoDeFetch();
    const { POST } = await rotaLimpa();

    const res = await POST(comoBeacon(EVENTO, { origin: "https://outro.site" }));

    expect(res.status).toBe(204);
    expect(idasAoBanco(chamou)).toHaveLength(0);
  });

  it("sem OBSERVABILIDADE, descarta — e o site segue igual", async () => {
    ambienteCompleto();
    delete process.env.OBSERVABILIDADE;
    const chamou = espiaoDeFetch();
    const { POST } = await rotaLimpa();

    const res = await POST(comoBeacon(EVENTO));

    expect(res.status).toBe(204);
    expect(chamou).not.toHaveBeenCalled();
  });

  it("banco fora ainda devolve 204", async () => {
    // A porta de erro não pode gerar erro.
    ambienteCompleto();
    process.env.N8N_WEBHOOK_ALERTA_URL = "https://n8n.exemplo/webhook/alerta";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes(SUPABASE_URL)) throw new TypeError("fetch failed");
      return new Response(null, { status: 200 });
    });
    const { POST } = await rotaLimpa();

    const res = await POST(comoBeacon(EVENTO));

    expect(res.status).toBe(204);
  });
});

describe("a fronteira com o caminho de conversão", () => {
  it("o proxy NÃO foi tocado", () => {
    /* O matcher de `src/proxy.ts` cobre `/api/leads` e `/api/avaliacao`. Pôr
       `/api/erros` lá seria mexer no caminho de conversão por causa de uma
       rota de diagnóstico — e o rate-limit desta rota mora nela mesma. */
    const proxy = lerCodigo("src/proxy.ts");
    expect(proxy).not.toContain("/api/erros");
    expect(proxy).not.toContain("observabilidade");
  });

  it("o rate-limit mora na própria rota, com prefixo próprio", () => {
    const rota = lerCodigo("src/app/api/erros/route.ts");
    expect(rota).toContain("Ratelimit.slidingWindow(");
    expect(rota).toContain('prefix: "@upstash/ratelimit/erros"');
    // Teto global além do por-IP: limite por IP não segura botnet, e sem ele a
    // tabela cresceria sem fim.
    expect(rota).toContain("erros:global");
  });
});
