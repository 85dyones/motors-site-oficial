import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { ler, semComentarios } from "./fonte";
import nextConfig from "../next.config";

/**
 * Cache de imagem, dos dois lados — e por que ele é dinheiro.
 *
 * ---------------------------------------------------------------------------
 * Lado 1: o otimizador da Vercel
 * ---------------------------------------------------------------------------
 * A Vercel cobra transformação em todo cache MISS **e em todo STALE**. Medido
 * na produção em 2026-09-09, numa foto da galeria de uma PDP:
 *
 *     Cache-Control: public, max-age=14400, must-revalidate
 *     X-Vercel-Cache: STALE     Age: 471857   (5,5 dias)
 *
 * Os 14400s eram o padrão do Next 16 (`minimumCacheTTL` não estava declarado),
 * e o TTL efetivo é `Math.max(minimumCacheTTL, max-age da origem)`. A mesma
 * foto voltava a ser cobrada a cada 4 h de uso.
 *
 * ---------------------------------------------------------------------------
 * Lado 2: o carimbo do Storage
 * ---------------------------------------------------------------------------
 * A foto do card e a logo do cabeçalho saem DIRETO do bucket, sem passar pelo
 * otimizador (`unoptimized`). Para elas quem decide o cache é o `cacheControl`
 * do upload — e o padrão do Storage é 3600s. Com ele, navegador e borda
 * rebaixam o mesmo arquivo de hora em hora, gastando o egress de um plano
 * free de 5 GB/mês.
 *
 * ---------------------------------------------------------------------------
 * A premissa que sustenta os dois, e o que ela não cobre
 * ---------------------------------------------------------------------------
 * Cache longo só mente quando **a mesma URL passa a ter conteúdo diferente**.
 * Nos dois buckets públicos o caminho é novo a cada envio — `novoLote()` e
 * `loteDaOrigem()` nas fotos, `type-timestamp-hex` na logo — e nenhum upload
 * substitui arquivo existente.
 *
 * Fora do código, a policy `veiculos_staff_atualiza` deixa a equipe trocar
 * bytes no mesmo caminho pelo painel do Supabase. Não é caminho que o site
 * percorre, e a saída para ele é `vercel cache invalidate --srcimg`.
 *
 * O diário de bordo fica de fora de propósito: bucket privado, foto de
 * cliente, lido por URL assinada, em volume que não move o egress.
 */

describe("o otimizador não recobra a mesma foto a cada poucas horas", () => {
  /** 30 dias. Abaixo disso o STALE volta a ser rotina. */
  const PISO = 2592000;

  it("o minimumCacheTTL vale, e é longo", () => {
    // A afirmação é sobre a CONFIGURAÇÃO EFETIVA, não sobre o texto do
    // arquivo. Ler a fonte com regex reprovaria `60 * 60 * 24 * 31` — que é o
    // mesmo número — e aprovaria o campo declarado FORA de `images`, onde o
    // Next o ignora e o padrão de 4 h volta a valer.
    const ttl = nextConfig.images?.minimumCacheTTL;

    expect(
      ttl,
      "images.minimumCacheTTL não está na configuração efetiva — fora de `images` o Next ignora e assume 4 h",
    ).toBeTypeOf("number");

    expect(
      ttl,
      `minimumCacheTTL de ${ttl}s deixa a mesma foto ser cobrada de novo dentro do mês`,
    ).toBeGreaterThanOrEqual(PISO);
  });
});

/** Onde se sobe arquivo neste repositório. */
const RAIZES = ["src", join("supabase", "manutencao"), "scripts"];

/** 30 dias: o piso do que se considera cache longo. */
const CACHE_LONGO = 2592000;

function valorDaConstante(rel: string, nome: string): string {
  // Montada por concatenação, sem barra invertida nenhuma: uma barra dentro
  // de string neste arquivo já virou `s` uma vez no caminho até o disco, e a
  // busca passou a procurar o que não existe. Casa a declaração exatamente
  // como o prettier a formata; reformatação quebra alto, que é o certo.
  const achado = ler(rel).match(new RegExp("const " + nome + ' = "([^"]+)"'));
  if (!achado) throw new Error("não achei a constante " + nome + " em " + rel);
  return achado[1];
}

/**
 * Os buckets públicos de caminho imutável. O das fotos é lido da fonte para
 * não drifar se alguém renomear; `branding` é literal no código, não tem
 * constante.
 */
const BUCKET_DAS_FOTOS = valorDaConstante("src/lib/fotosDoVeiculo.ts", "BUCKET_DE_FOTOS");
const BUCKETS_PUBLICOS = [BUCKET_DAS_FOTOS, "branding"];

interface ChamadaDeUpload {
  arquivo: string;
  bucket: string;
  opcoes: string;
}

function arquivosDe(raiz: string): string[] {
  if (!existsSync(raiz)) return [];
  let achados: string[] = [];
  for (const nome of readdirSync(raiz)) {
    if (nome === "node_modules" || nome === ".next" || nome === ".git") continue;
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) achados = achados.concat(arquivosDe(caminho));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/**
 * A fonte com o CONTEÚDO das strings apagado, preservando o comprimento.
 *
 * É o que permite contar parênteses sem que um `mensagem: "falhou :("` dentro
 * das opções desalinhe o recorte. Os índices continuam valendo para a fonte
 * original, porque cada caractere apagado vira um espaço.
 */
function semConteudoDeString(fonte: string): string {
  let saida = "";
  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === '"' || c === "'" || c === "`") {
      const aspas = c;
      saida += c;
      i += 1;
      while (i < fonte.length) {
        if (fonte[i] === "\\") {
          saida += "  ";
          i += 2;
          continue;
        }
        if (fonte[i] === aspas) {
          saida += aspas;
          i += 1;
          break;
        }
        saida += fonte[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }
    saida += c;
    i += 1;
  }
  return saida;
}

/** Os argumentos da chamada, contando parênteses fora de string. */
function argumentosDaChamada(fonte: string, mascara: string, indiceDoAbre: number): string {
  let profundidade = 0;
  for (let i = indiceDoAbre; i < mascara.length; i++) {
    if (mascara[i] === "(") profundidade += 1;
    else if (mascara[i] === ")") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(indiceDoAbre + 1, i);
    }
  }
  return "";
}

/**
 * Toda chamada `.upload(...)`, com o bucket do `.from(...)` que a precede.
 *
 * O `.from(` só conta quando o argumento PARECE bucket — constante `BUCKET_*`
 * ou string literal. Sem esse filtro, o `Array.from(arquivos)` e o
 * `Buffer.from(dados)` que existem nesses mesmos arquivos viram o bucket
 * detectado, e a trava passa a medir a ordem das linhas em vez do destino.
 */
function uploadsDe(arquivo: string, fonte: string): ChamadaDeUpload[] {
  const mascara = semConteudoDeString(fonte);
  const achados: ChamadaDeUpload[] = [];

  const buckets = [...fonte.matchAll(/\.from\(\s*(BUCKET_[A-Z_]+|"([A-Za-z0-9_-]+)"|'([A-Za-z0-9_-]+)')\s*\)/g)];
  const chamada = /\.upload\(/g;
  let m: RegExpExecArray | null;

  while ((m = chamada.exec(mascara)) !== null) {
    const indiceDoAbre = m.index + m[0].length - 1;
    const inicio = m.index;
    const anterior = buckets.filter((b) => (b.index ?? 0) < inicio).pop();
    const cru = anterior ? anterior[2] ?? anterior[3] ?? anterior[1] : "(sem from)";
    achados.push({
      arquivo: arquivo.split(sep).join("/"),
      bucket: cru === "BUCKET_DE_FOTOS" ? BUCKET_DAS_FOTOS : cru,
      opcoes: argumentosDaChamada(fonte, mascara, indiceDoAbre),
    });
  }

  return achados;
}

const UPLOADS: ChamadaDeUpload[] = RAIZES.flatMap((raiz) =>
  arquivosDe(raiz).flatMap((arquivo) => uploadsDe(arquivo, semComentarios(ler(arquivo)))),
);

describe("quem sobe arquivo em bucket público carimba cache longo", () => {
  it("a varredura enxerga os uploads de cada bucket público", () => {
    // Sem este caso, um erro no varredor deixaria a trava abaixo passando por
    // vacuidade — verde sem ler nada, que é o pior defeito de um teste de
    // fonte. A contagem é POR BUCKET: um total fixo quebraria à toa no dia em
    // que alguém fundisse dois ramos de upload num só.
    for (const bucket of BUCKETS_PUBLICOS) {
      expect(
        UPLOADS.filter((u) => u.bucket === bucket).length,
        'nenhum upload encontrado no bucket "' + bucket + '" — o varredor perdeu o alvo',
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("todo upload em bucket público declara cache de pelo menos 30 dias", () => {
    for (const upload of UPLOADS.filter((u) => BUCKETS_PUBLICOS.includes(u.bucket))) {
      const onde = upload.arquivo + ' (bucket "' + upload.bucket + '")';

      expect(
        /cacheControl\s*:/.test(upload.opcoes),
        onde + ": upload sem cacheControl — volta ao padrão de 1 h do Storage",
      ).toBe(true);

      // Literal, e não expressão: o valor precisa ser conferível aqui. Um
      // `cacheControl: String(31536000)` satisfaria o caso acima e escaparia
      // da conferência de valor — foi assim que a primeira versão desta trava
      // deixou passar exatamente o caso que ela existia para pegar.
      const literal = upload.opcoes.match(/cacheControl\s*:\s*["'](\d+)["']/);
      expect(
        literal,
        onde + ": cacheControl precisa ser string literal de segundos para ser conferível aqui",
      ).not.toBeNull();

      expect(
        Number(literal![1]),
        onde + ": cacheControl de " + literal?.[1] + "s é curto demais para caminho imutável",
      ).toBeGreaterThanOrEqual(CACHE_LONGO);
    }
  });
});
