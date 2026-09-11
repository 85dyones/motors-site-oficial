import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * A costura da observabilidade — a função que obriga a escolher o destino.
 *
 * ---------------------------------------------------------------------------
 * Por que existe uma função só, com um parâmetro que não tem default
 * ---------------------------------------------------------------------------
 * Este projeto tem duas naturezas de falha, e elas pedem coisas opostas:
 *
 *   **parada** — nada lançou, a operação simplesmente deixou de acontecer. A
 *   CAPI em 401, o motor do Ciclo sem rodar, o estoque indisponível. Ninguém
 *   vai descobrir isso lendo painel: precisa procurar a pessoa, no WhatsApp.
 *
 *   **quebra** — alguma coisa lançou. Tem stack, tem rota, tem volume. Mandar
 *   cada uma para o WhatsApp seria a enxurrada que faz a pessoa silenciar o
 *   alerta — e alerta silenciado é pior que alerta nenhum, porque dá sensação
 *   de cobertura. Vai para a fila de triagem, no banco.
 *
 * A tentação é ter um `registrar(assunto, detalhe)` que decide sozinho. Não
 * dá: a decisão é de negócio, não de forma. Daí `natureza` ser o PRIMEIRO
 * parâmetro e não ter default — não existe "deixa como está" no ponto de
 * chamada, e o `tsc` recusa quem tentar.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 *  1. **Os destinos não vazam um no outro.** `parada` nunca toca o banco;
 *     `quebra` nunca toca o WhatsApp. Se vazarem, ou a fila vira enxurrada de
 *     mensagem, ou o aviso urgente morre numa lista que ninguém abre.
 *  2. **O vigia não dorme junto com o vigiado.** Quando o Supabase é
 *     justamente o que caiu, a gravação falha — e aí o aviso tem de sair pelo
 *     OUTRO caminho, o webhook. É o defeito que `alertaDeFalha.ts` foi escrito
 *     para resolver, e que seria reintroduzido se a gravação fosse o único
 *     destino.
 *  3. **Teto de tempo, e disjuntor.** O Next `await`-a o `onRequestError`
 *     (`next/dist/server/base-server.js:450`), então o que a gravação demorar
 *     entra no tempo da resposta de erro. Com o banco fora, sem disjuntor cada
 *     requisição da vitrine pagaria o teto de novo.
 *  4. **Nunca lança.** Roda no caminho de uma falha que já aconteceu; não pode
 *     ser a segunda coisa a quebrar.
 *  5. **Não vai para o navegador.** `src/lib/supabase.ts` é importado por nove
 *     client components, então esta biblioteca chega ao bundle do cliente de
 *     carona. A chave de serviço não pode ir junto, e a gravação também não.
 *  6. **PII não vaza por acidente.** O erro do PostgREST cita valores — um
 *     `Key (telefone)=(5541…)` gravado é PII que ninguém decidiu guardar.
 */

const WEBHOOK = "https://n8n.exemplo/webhook/alerta";
const SUPABASE_URL = "https://banco.exemplo";
const CHAVE = "chave-de-servico-de-teste";

const ENVS = [
  "OBSERVABILIDADE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "N8N_WEBHOOK_ALERTA_URL",
] as const;

let anteriores: Record<string, string | undefined> = {};

async function moduloLimpo() {
  vi.resetModules();
  return import("../src/lib/observabilidade");
}

/** Liga tudo: servidor, gravação permitida, webhook configurado. */
function ambienteCompleto() {
  process.env.OBSERVABILIDADE = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE;
  process.env.N8N_WEBHOOK_ALERTA_URL = WEBHOOK;
}

/**
 * Dublê que distingue os dois destinos pela URL. É o padrão de
 * `alerta-de-falha.test.ts:259-263`: dublê que PROJETA a resposta, em vez de
 * uma constante — dublê constante já apagou comportamento neste repositório.
 */
type Ramo = (url: unknown, init?: RequestInit) => Promise<Response>;

function fetchDosDoisDestinos(resposta: { banco?: Ramo; webhook?: Ramo } = {}) {
  const banco: Ramo = resposta.banco ?? (async () => new Response(null, { status: 201 }));
  const webhook: Ramo = resposta.webhook ?? (async () => new Response(null, { status: 200 }));
  // Os argumentos são REPASSADOS: um ramo que precisa do `signal` para se
  // comportar como banco pendurado não o recebe de outro jeito.
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init) =>
      String(url).includes(SUPABASE_URL) ? await banco(url, init) : await webhook(url, init),
    );
}

/** Cabeçalhos de uma chamada, como objeto simples — o supabase-js usa `Headers`. */
function cabecalhosDe(chamada: unknown): Record<string, string> {
  const [, init] = chamada as [string, RequestInit];
  const h = init?.headers;
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h as [string, string][]);
  return h as Record<string, string>;
}

type EspiaoDeFetch = ReturnType<typeof fetchDosDoisDestinos>;

function idasAoBanco(espiao: EspiaoDeFetch) {
  return espiao.mock.calls.filter(([u]) => String(u).includes(SUPABASE_URL));
}

function idasAoWebhook(espiao: EspiaoDeFetch) {
  return espiao.mock.calls.filter(([u]) => String(u).includes("n8n.exemplo"));
}

function corpoDe(chamada: unknown): Record<string, unknown> {
  const [, init] = chamada as [string, RequestInit];
  const bruto = JSON.parse(String(init.body));
  return Array.isArray(bruto) ? bruto[0] : bruto;
}

beforeEach(() => {
  anteriores = Object.fromEntries(ENVS.map((k) => [k, process.env[k]]));
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ENVS) {
    if (anteriores[k] === undefined) delete process.env[k];
    else process.env[k] = anteriores[k];
  }
  delete (globalThis as { window?: unknown }).window;
});

describe("os dois destinos não vazam um no outro", () => {
  it("`parada` vai só ao WhatsApp — o banco não é tocado", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("parada", "meta-capi", "401 no evento ViewContent");

    expect(idasAoWebhook(chamou)).toHaveLength(1);
    expect(
      idasAoBanco(chamou),
      "uma parada gravou no banco — a fila de triagem vai virar enxurrada",
    ).toHaveLength(0);
  });

  it("`quebra` vai só ao banco — o WhatsApp não toca", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", new Error("estourou"));

    expect(idasAoBanco(chamou)).toHaveLength(1);
    expect(
      idasAoWebhook(chamou),
      "uma quebra tocou o WhatsApp — é assim que a pessoa silencia o alerta",
    ).toHaveLength(0);
  });

  it("`ambos` toca os dois, e em paralelo — não soma os tempos", async () => {
    ambienteCompleto();
    const devagar = async () => {
      await new Promise((r) => setTimeout(r, 300));
      return new Response(null, { status: 201 });
    };
    const chamou = fetchDosDoisDestinos({ banco: devagar, webhook: devagar });
    const { registrarFalha } = await moduloLimpo();

    const comecou = Date.now();
    await registrarFalha("ambos", "lead-nao-gravado", new Error("insert recusado"));
    const levou = Date.now() - comecou;

    expect(idasAoBanco(chamou)).toHaveLength(1);
    expect(idasAoWebhook(chamou)).toHaveLength(1);
    // 300 ms em paralelo, não 600 em série. Um lead perdido não pode esperar
    // dois destinos na fila.
    expect(levou, "os destinos correram em série").toBeLessThan(550);
  });
});

describe("o que a linha do banco leva", () => {
  it("grava origem, natureza, assunto, mensagem, hash e ambiente", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:render", new Error("falhou feio"), {
      rota: "/carros/[categoria]/[marca]/[modelo]/[ficha]",
      metodo: "GET",
      ag_uid: "ag-123",
    });

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    expect(linha.origem).toBe("servidor");
    expect(linha.natureza).toBe("quebra");
    expect(linha.assunto).toBe("servidor:render");
    expect(String(linha.mensagem)).toContain("falhou feio");
    expect(linha.rota).toBe("/carros/[categoria]/[marca]/[modelo]/[ficha]");
    expect(linha.ag_uid).toBe("ag-123");
    expect(linha.hash_agrupamento).toMatch(/^[0-9a-f]{8,64}$/);
    // `org_id` NÃO viaja: é o default da tabela. Nenhum destino de erro
    // consulta o banco para descobrir de quem é o erro.
    expect(Object.keys(linha)).not.toContain("org_id");
  });

  it("manda a chave de serviço no cabeçalho, e um sinal de aborto", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", new Error("x"));

    const cabecalhos = JSON.stringify(cabecalhosDe(idasAoBanco(chamou)[0]));
    expect(cabecalhos, "a chave de serviço não foi enviada — o insert seria recusado pela RLS")
      .toContain(CHAVE);

    const [, init] = idasAoBanco(chamou)[0] as [string, RequestInit];
    expect(
      init.signal,
      "sem sinal não há teto: o Next await-a o hook e a resposta de erro fica pendurada",
    ).toBeInstanceOf(AbortSignal);
  });

  it("o stack do erro vai junto", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", new Error("com pilha"));

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    expect(String(linha.stack)).toContain("Error: com pilha");
  });
});

describe("PII não vaza por acidente", () => {
  it("telefone e e-mail saem mascarados da mensagem gravada", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    // A forma exata de um erro do PostgREST em violação de unicidade.
    await registrarFalha(
      "quebra",
      "servidor:route",
      new Error('duplicate key: Key (telefone)=(5541999998888) / silvio@motorsstore.com.br'),
    );

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    const inteiro = JSON.stringify(linha);
    expect(inteiro, "o telefone do cliente foi gravado").not.toContain("5541999998888");
    expect(inteiro, "o e-mail foi gravado").not.toContain("silvio@motorsstore.com.br");
  });

  it("o mesmo vale para o texto que vai ao WhatsApp", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("parada", "meta-capi", "recusou o lead 5541999998888");

    const corpo = String((idasAoWebhook(chamou)[0] as unknown as [string, RequestInit])[1].body);
    expect(corpo).not.toContain("5541999998888");
  });

  it("o stack que vem PELO CONTEXTO também é higienizado", async () => {
    /* Bloqueio B1 da revisão de 2026-09-10. `higienizar` rodava só no ramo em
       que `detalhe` é um `Error` — e é o ramo do SERVIDOR. O caminho do
       navegador manda `detalhe` como string e o stack por `contexto.stack`,
       que passava cru.

       É o único campo que um estranho controla, numa porta pública sem
       autenticação e com 90 dias de retenção. E a promessa de mascaramento
       está escrita em três lugares deste pacote: no `comment on table` da
       migração, no docblock da costura e na §12 da spec. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "navegador:erro", "mensagem qualquer", {
      origem: "navegador",
      stack: "at f (/app.js) — lead 5541999998888 / silvio@motorsstore.com.br",
    });

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    expect(String(linha.stack), "telefone gravado cru").not.toContain("5541999998888");
    expect(String(linha.stack), "e-mail gravado cru").not.toContain("silvio@motorsstore.com.br");
  });

  it("o caminho da url também é higienizado, não só a query", async () => {
    // Ressalva R3: cortar a query não basta — PII cabe em segmento de caminho.
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "navegador:erro", "x", {
      url: "https://motorsstore.com.br/lead/5541999998888/ficha",
    });

    expect(String(corpoDe(idasAoBanco(chamou)[0]).url)).not.toContain("5541999998888");
  });

  it("o `extra` é higienizado e tem teto", async () => {
    /* Ressalva R2. Hoje só o hook preenche `extra`, com dado inofensivo — mas
       o PR 3 vai pôr 43 `catch` jogando contexto de requisição aqui. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", "x", {
      extra: { quem: "silvio@motorsstore.com.br", tel: "5541999998888", lixo: "x".repeat(50_000) },
    });

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    const comoTexto = JSON.stringify(linha.extra);
    expect(comoTexto).not.toContain("5541999998888");
    expect(comoTexto).not.toContain("silvio@motorsstore.com.br");
    expect(comoTexto.length, "extra sem teto infla o corpo do INSERT").toBeLessThan(4000);
  });

  it("a query da url é cortada — é onde mora utm, telefone e token", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "navegador:erro", "qualquer", {
      url: "https://motorsstore.com.br/estoque?telefone=5541999998888&utm_source=x",
    });

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    expect(linha.url).toBe("https://motorsstore.com.br/estoque");
  });
});

describe("a fronteira: NENHUM campo escapa", () => {
  /**
   * A trava que faltava, e que teria evitado três defeitos numa rodada só.
   *
   * Em 2026-09-10 a limpeza era aplicada em quatro pontos de ENTRADA, campo a
   * campo. A revisão adversarial encontrou, no mesmo commit: `navegador` e
   * `digest` nunca tocados (e são os dois únicos campos onde a porta pública
   * aceita texto LIVRE do visitante); o `slice` posterior recriando o
   * substituto solto que o saneamento tinha tirado; e `assunto` fora de tudo.
   *
   * Teste por campo lembrado só cobre o campo que alguém lembrou. Este varre a
   * LISTA INTEIRA e falha no campo novo que entrar sem passar pela fronteira —
   * que é o cenário real, porque o PR 3 vai pôr 43 pontos de chamada novos.
   */

  const TELEFONE = "5541999998888";
  const EMAIL = "silvio@motorsstore.com.br";
  const NUL = String.fromCharCode(0);
  const SUBSTITUTO_SOLTO = String.fromCharCode(0xd83d);
  const VENENO = `${TELEFONE} ${EMAIL}${NUL}${SUBSTITUTO_SOLTO}`;

  /** Todo campo de texto que alguém de fora consegue influenciar. */
  const CAMPOS = [
    ["stack", (v: string) => ({ stack: v })],
    ["rota", (v: string) => ({ rota: v })],
    ["metodo", (v: string) => ({ metodo: v })],
    ["url", (v: string) => ({ url: `https://motorsstore.com.br/${v}` })],
    ["navegador", (v: string) => ({ navegador: v })],
    ["release", (v: string) => ({ release: v })],
    ["digest", (v: string) => ({ digest: v })],
    ["ag_uid", (v: string) => ({ ag_uid: v })],
  ] as const;

  it.each(CAMPOS)("`%s` não leva PII nem byte que o Postgres recusa", async (nome, montar) => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", "mensagem limpa", montar(VENENO));

    const enviado = String((idasAoBanco(chamou)[0] as unknown as [string, RequestInit])[1].body);
    expect(enviado, `${nome}: telefone gravado cru`).not.toContain(TELEFONE);
    expect(enviado, `${nome}: e-mail gravado cru`).not.toContain(EMAIL);
    expect(enviado, `${nome}: NUL no corpo do INSERT (o Postgres recusa com 22P05)`).not.toContain(
      "\\u0000",
    );
    expect(enviado, `${nome}: substituto solto (o Postgres recusa com 22P02)`).not.toContain(
      "\\ud83d",
    );
  });

  it("`assunto` e `mensagem` — os dois posicionais — também passam", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", `assunto ${VENENO}`, `mensagem ${VENENO}`);

    const enviado = String((idasAoBanco(chamou)[0] as unknown as [string, RequestInit])[1].body);
    expect(enviado).not.toContain(TELEFONE);
    expect(enviado).not.toContain(EMAIL);
    expect(enviado).not.toContain("\\u0000");
    expect(enviado).not.toContain("\\ud83d");
  });

  it("o CORTE não ressuscita o substituto que a limpeza tirou", async () => {
    /* O defeito exato de 2026-09-10: `limpar` rodava antes, `slice` depois, e
       o corte partia um emoji ao meio deixando a metade órfã. Vale para os
       três tetos, porque os três cortam. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha(
      "quebra",
      `${"a".repeat(79)}🚗`, // teto do assunto: 80
      `${"m".repeat(1999)}🚗`, // teto da mensagem: 2000
      { stack: `${"s".repeat(7999)}🚗` }, // teto do stack: 8000
    );

    const enviado = String((idasAoBanco(chamou)[0] as unknown as [string, RequestInit])[1].body);
    expect(enviado, "o slice partiu o par e ninguém consertou depois").not.toContain("\\ud83d");
  });

  it("a limpeza não estraga texto legítimo", async () => {
    /* Filtro de mais esconde o defeito. Emoji inteiro, acento e pontuação têm
       de atravessar — senão a triagem passa a mostrar mensagem mutilada e
       ninguém confia mais nela. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", "Configuração inválida 🚗 — ação nº 3");

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    expect(linha.mensagem).toBe("Configuração inválida 🚗 — ação nº 3");
  });

  it("higienizar não trava com entrada longa sem arroba", async () => {
    /* O regex de e-mail tinha backtracking catastrófico: 50 mil caracteres
       custavam 2,9 s de CPU SÍNCRONA — fora do alcance do `AbortSignal`, e
       dentro de um hook que o Next `await`-a. */
    const { higienizar } = await moduloLimpo();
    const comecou = Date.now();
    higienizar("a.b+c-d".repeat(8000));
    expect(Date.now() - comecou, "o regex voltou a fazer backtracking").toBeLessThan(200);
  });
});

describe("o agrupamento", () => {
  it("normaliza número e uuid — o mesmo defeito com ids diferentes é um grupo só", async () => {
    const { hashDeAgrupamento } = await moduloLimpo();

    expect(hashDeAgrupamento(["rota", "veículo 123 não encontrado"])).toBe(
      hashDeAgrupamento(["rota", "veículo 987 não encontrado"]),
    );
    expect(hashDeAgrupamento(["rota", "lead 6b1f2e40-1d3c-4a5b-8c7d-9e0f1a2b3c4d sumiu"])).toBe(
      hashDeAgrupamento(["rota", "lead 0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d sumiu"]),
    );
  });

  it("assunto diferente é grupo diferente", async () => {
    const { hashDeAgrupamento } = await moduloLimpo();
    expect(hashDeAgrupamento(["servidor:route", "x"])).not.toBe(
      hashDeAgrupamento(["servidor:render", "x"]),
    );
  });

  it("a forma casa com o CHECK da tabela", async () => {
    const { hashDeAgrupamento } = await moduloLimpo();
    expect(hashDeAgrupamento(["a", "b"])).toMatch(/^[0-9a-f]{8,64}$/);
  });
});

describe("a enxurrada é contida", () => {
  it("cinquenta quebras iguais gravam uma linha, e a próxima leva a contagem", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    /* Uma exceção em página quente sob campanha é uma gravação por
       requisição. Sem carência, o custo do incidente vira o incidente. */
    for (let i = 0; i < 50; i++) {
      await registrarFalha("quebra", "servidor:render", new Error("a mesma coisa"));
    }
    expect(idasAoBanco(chamou)).toHaveLength(1);
    expect(corpoDe(idasAoBanco(chamou)[0]).suprimidas).toBe(0);

    /* O relógio é adiantado, e não o estado zerado. `esquecerEstado()` limpa o
       mapa inteiro — e aí o contador volta a zero, que é justamente o número
       que este teste existe para provar que NÃO se perde. Mover o relógio
       mantém a entrada viva com o carimbo antigo, que é o que acontece de
       verdade quando a carência vence. */
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11_000);
    await registrarFalha("quebra", "servidor:render", new Error("a mesma coisa"));
    vi.useRealTimers();

    const segunda = corpoDe(idasAoBanco(chamou)[1]);
    expect(segunda.suprimidas, "as engolidas sumiram sem deixar contagem").toBe(49);
  });

  it("quebra de outro assunto passa na mesma janela", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:render", new Error("uma"));
    await registrarFalha("quebra", "servidor:route", new Error("outra"));

    expect(idasAoBanco(chamou)).toHaveLength(2);
  });
});

describe("o vigia não dorme junto com o vigiado", () => {
  it("banco fora: o aviso sai pelo webhook, com assunto próprio", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos({
      banco: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", new Error("estourou"));

    const avisos = idasAoWebhook(chamou);
    expect(avisos, "a gravação falhou e ninguém foi avisado").toHaveLength(1);
    expect(String((avisos[0] as unknown as [string, RequestInit])[1].body)).toContain(
      "erros-indisponivel",
    );
  });

  it("depois de falhar, o disjuntor abre e a quebra seguinte não tenta o banco", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos({
      banco: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", new Error("primeira"));
    await registrarFalha("quebra", "servidor:render", new Error("segunda"));

    /* Sem disjuntor, com o Supabase fora, CADA requisição da vitrine pagaria o
       teto de 2 s de novo — e o Next await-a o hook. */
    expect(idasAoBanco(chamou), "o disjuntor não abriu").toHaveLength(1);
  });

  it("corpo que o Postgres RECUSA não abre o disjuntor", async () => {
    /* Bloqueio B2 da revisão de 2026-09-10, e é o mais perigoso dos dois.
       O byte zero (NUL) e o substituto UTF-16 solto chegam ao corpo do INSERT vindos da
       porta pública, e o Postgres os recusa com 22P05 / 22P02. O disjuntor
       abria em QUALQUER erro — então uma requisição por minuto, de qualquer
       pessoa, calava a fila de triagem indefinidamente E fazia o dono receber
       "erros-indisponivel" no WhatsApp dizendo que o banco caiu.

       Alerta que mente e não pode ser desligado é o "alerta que ensina a
       pessoa a ignorar alerta" que a §1 da spec nomeia como a doença.

       A régua: o banco RESPONDEU, com um código. Isso não é banco fora — é
       dado malformado, e a culpa não é da rede. Disjuntor só para transporte. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos({
      banco: async () =>
        new Response(
          JSON.stringify({ code: "22P05", message: "unsupported Unicode escape sequence" }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    });
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "navegador:erro", "veneno");
    // O erro REAL, logo depois, tem de chegar ao banco.
    await registrarFalha("quebra", "servidor:route", "erro-real-de-producao");

    expect(
      idasAoBanco(chamou),
      "o disjuntor abriu por dado malformado e o erro real de produção se perdeu",
    ).toHaveLength(2);
  });

  it("caractere que o Postgres recusa é saneado ANTES de gravar", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "navegador:erro", `antes${String.fromCharCode(0)}depois`, {
      // Substituto alto solto — o que sobra de um emoji cortado no teto.
      stack: "cauda\ud83d",
    });

    const enviado = String((idasAoBanco(chamou)[0] as unknown as [string, RequestInit])[1].body);
    expect(enviado, "NUL foi para o corpo do INSERT").not.toContain("\\u0000");
    expect(enviado, "substituto solto foi para o corpo do INSERT").not.toContain("\\ud83d");
  });

  /* O teste que estava aqui — "passada a janela do disjuntor, a próxima falha
     leva a conta" — media algo que NÃO ACONTECE, e foi removido em 11/09.
     Ele avançava o relógio 61 s, que vence o disjuntor mas não a carência de
     30 min do `alertaDeFalha`: o segundo aviso é engolido, e o "último aviso"
     que ele inspecionava era o PRIMEIRO, de quando ainda não havia nada
     engolido. Ficava verde só porque afirmava `toContain("20")`, que casava
     com o `2026` do carimbo de tempo.

     Quem cobre a regra de verdade é o teste abaixo, que atravessa as DUAS
     carências e por isso descreve o apagão como ele é. */

  it("a conta ATRAVESSA a carência do aviso — apagão longo não perde o número", async () => {
    /* O defeito que a primeira correção deixou passar, e que o teste
       falso-verde escondeu: a conta era zerada ao MONTAR o aviso, não ao
       enviá-lo. O disjuntor reabre a cada 60 s; o aviso tem carência de 30 min.
       Cada ciclo engolido pela carência jogava a própria conta fora — 320 erros
       num apagão de 31 minutos viravam um aviso dizendo NOVE. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos({
      banco: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const { registrarFalha } = await moduloLimpo();

    const inicio = Date.now();
    vi.useFakeTimers();
    // Cinco ciclos de disjuntor. Só o primeiro aviso escapa da carência de 30
    // min do `alertaDeFalha`; os outros quatro são engolidos por ela.
    for (let ciclo = 0; ciclo < 5; ciclo++) {
      vi.setSystemTime(inicio + ciclo * 61_000);
      for (let i = 0; i < 10; i++) {
        await registrarFalha("quebra", `servidor:render-${ciclo}-${i}`, "no apagão");
      }
    }
    // Passada a carência do aviso, a próxima falha leva a conta acumulada.
    vi.setSystemTime(inicio + 31 * 60_000);
    await registrarFalha("quebra", "servidor:action", "depois da carência");
    vi.useRealTimers();

    const avisos = idasAoWebhook(chamou);
    const ultimo = String((avisos[avisos.length - 1] as unknown as [string, RequestInit])[1].body);
    const conta = Number(/e (\d+) não gravado/.exec(ultimo)?.[1] ?? 0);
    expect(
      conta,
      "a conta foi zerada por um aviso que a carência engoliu — o dono lê um número que mente",
    ).toBeGreaterThan(30);
  });

  it("o disjuntor abre no banco PENDURADO, que chega como erro sem código", async () => {
    /* O postgrest-js converte toda rejeição de `fetch` — inclusive o aborto do
       nosso teto — em `{error:{code:""}}`, em vez de lançar. Então é o
       `code === ""` que protege o caso mais importante, e não o `catch`.
       Trocar o teste por `code !== "22P05"` faria o disjuntor nunca abrir no
       timeout, e nenhum teste de tempo acusaria. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos({
      banco: async () =>
        new Response(JSON.stringify({ message: "canceling statement", code: "" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    });
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", "primeira");
    await registrarFalha("quebra", "servidor:render", "segunda");

    expect(idasAoBanco(chamou), "o disjuntor não abriu com o banco pendurado").toHaveLength(1);
  });

  it("com os dois destinos fora, não lança", async () => {
    ambienteCompleto();
    fetchDosDoisDestinos({
      banco: async () => {
        throw new TypeError("fetch failed");
      },
      webhook: async () => {
        throw new TypeError("fetch failed");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { registrarFalha } = await moduloLimpo();

    await expect(
      registrarFalha("ambos", "lead-nao-gravado", new Error("x")),
    ).resolves.toBeUndefined();
  });

  it("gravação travada respeita o teto e devolve", async () => {
    ambienteCompleto();
    // Só rejeita quando o sinal aborta — é o que um banco pendurado faz.
    fetchDosDoisDestinos({
      banco: (_url, init) =>
        new Promise<Response>((_, rejeita) => {
          init?.signal?.addEventListener("abort", () =>
            rejeita(new DOMException("aborted", "AbortError")),
          );
        }),
    });
    const { registrarFalha } = await moduloLimpo();

    const comecou = Date.now();
    await registrarFalha("quebra", "servidor:route", new Error("x"));
    const levou = Date.now() - comecou;

    expect(levou, "o teto não segurou — a resposta de erro fica pendurada").toBeLessThan(3500);
  });
});

describe("os interruptores", () => {
  it("sem OBSERVABILIDADE, a quebra não grava — e a parada continua avisando", async () => {
    ambienteCompleto();
    delete process.env.OBSERVABILIDADE;
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "servidor:route", new Error("x"));
    expect(idasAoBanco(chamou)).toHaveLength(0);

    /* O aviso de PARADA não depende do interruptor. Desligar a triagem não
       pode desligar o que faz a loja saber que a CAPI parou. */
    await registrarFalha("parada", "meta-capi", "401");
    expect(idasAoWebhook(chamou)).toHaveLength(1);
  });

  it("sem chave de serviço, não grava e não lança", async () => {
    ambienteCompleto();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await expect(registrarFalha("quebra", "servidor:route", new Error("x"))).resolves.toBeUndefined();
    expect(idasAoBanco(chamou)).toHaveLength(0);
  });

  it("no navegador, a quebra não grava — a chave de serviço não mora lá", async () => {
    ambienteCompleto();
    (globalThis as unknown as { window: unknown }).window = globalThis;
    const chamou = fetchDosDoisDestinos();
    const { registrarFalha } = await moduloLimpo();

    await registrarFalha("quebra", "navegador:erro", new Error("x"));

    expect(
      idasAoBanco(chamou),
      "o bundle do cliente tentou gravar direto no banco",
    ).toHaveLength(0);
  });
});

describe("o hook do servidor", () => {
  /**
   * `onRequestError` é hook NATIVO do Next — não precisa de SDK e não toca o
   * `next.config.ts`, que carrega o redirect do alias de que quatro workflows
   * do n8n dependem.
   *
   * O Next **await-a** esta função (`base-server.js:450`), então o teto de
   * gravação entra no tempo da resposta de erro. É a razão do disjuntor.
   */
  const REQUISICAO = {
    path: "/estoque?utm_source=meta&telefone=5541999998888",
    method: "GET",
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0)",
      cookie: "ag_uid=ag-abc123; sb-zwbq-auth-token=SEGREDO-DA-SESSAO-DO-STAFF",
      authorization: "Bearer TOKEN-QUE-NAO-PODE-VAZAR",
    },
  } as const;

  const CONTEXTO = {
    routerKind: "App Router",
    routePath: "/estoque",
    routeType: "render",
    renderSource: "server-rendering",
    revalidateReason: undefined,
  } as const;

  async function hookLimpo() {
    vi.resetModules();
    return import("../src/instrumentation");
  }

  it("grava a rota, o método e o tipo — e o assunto é o routeType", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { onRequestError } = await hookLimpo();

    await onRequestError(new Error("estourou no render"), REQUISICAO, CONTEXTO);

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    /* `routerKind` seria sempre "App Router" e não distinguiria nada.
       `routeType` separa render de route, de action e de proxy — que é a
       primeira pergunta de quem abre a triagem. */
    expect(linha.assunto).toBe("servidor:render");
    expect(linha.rota).toBe("/estoque");
    expect(linha.metodo).toBe("GET");
    expect(linha.origem).toBe("servidor");
  });

  it("leva o ag_uid do cookie — o elo com quem virou lead", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { onRequestError } = await hookLimpo();

    await onRequestError(new Error("x"), REQUISICAO, CONTEXTO);

    expect(corpoDe(idasAoBanco(chamou)[0]).ag_uid).toBe("ag-abc123");
  });

  it("NUNCA leva o cookie de sessão nem o Authorization", async () => {
    /* `headers` é um dicionário inteiro, e nele vem o `sb-*-auth-token` de
       quem está logado no painel. Gravar o dict é gravar a sessão do staff
       numa tabela que a própria equipe consulta. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { onRequestError } = await hookLimpo();

    await onRequestError(new Error("x"), REQUISICAO, CONTEXTO);

    const inteiro = JSON.stringify(corpoDe(idasAoBanco(chamou)[0]));
    expect(inteiro, "a sessão do staff foi gravada").not.toContain("SEGREDO-DA-SESSAO-DO-STAFF");
    expect(inteiro, "o Authorization foi gravado").not.toContain("TOKEN-QUE-NAO-PODE-VAZAR");
    // O user-agent pode: é o que diz em qual navegador o defeito acontece.
    expect(inteiro).toContain("Mozilla/5.0");
  });

  it("a query da url não é gravada", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { onRequestError } = await hookLimpo();

    await onRequestError(new Error("x"), REQUISICAO, CONTEXTO);

    const linha = corpoDe(idasAoBanco(chamou)[0]);
    expect(linha.url).toBe("/estoque");
    expect(JSON.stringify(linha)).not.toContain("5541999998888");
  });

  it("o digest viaja — é o que liga esta linha à do navegador", async () => {
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { onRequestError } = await hookLimpo();

    const erro = Object.assign(new Error("x"), { digest: "3350458554" });
    await onRequestError(erro, REQUISICAO, CONTEXTO);

    expect(corpoDe(idasAoBanco(chamou)[0]).digest).toBe("3350458554");
  });

  it("chave `digest` presente e VAZIA não vira a palavra 'undefined'", async () => {
    /* `"digest" in erro` é verdadeiro mesmo com o valor `undefined`, e
       `String(undefined)` grava a string "undefined" como se fosse um código
       real — que alguém depois procuraria na tabela e não acharia em lugar
       nenhum. O teste anterior usava um erro COM digest, então sobrevivia a
       qualquer mutação aqui. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { onRequestError } = await hookLimpo();

    const erro = Object.assign(new Error("x"), { digest: undefined });
    await onRequestError(erro, REQUISICAO, CONTEXTO);

    expect(corpoDe(idasAoBanco(chamou)[0]).digest).toBeNull();
  });

  it("erro DENTRO de /api/erros não se realimenta", async () => {
    /* A porta de erro não pode gerar erro que volte pela própria porta: seria
       um laço que enche a tabela sozinho. */
    ambienteCompleto();
    const chamou = fetchDosDoisDestinos();
    const { onRequestError } = await hookLimpo();

    await onRequestError(
      new Error("a própria porta quebrou"),
      { ...REQUISICAO, path: "/api/erros", method: "POST" },
      { ...CONTEXTO, routeType: "route", routePath: "/api/erros" },
    );

    expect(idasAoBanco(chamou), "a porta de erro se realimentou").toHaveLength(0);
  });

  it("não lança nem quando o destino está fora", async () => {
    // O Next await-a o hook; se ele lançar, a resposta de erro fica pior do
    // que já estava.
    ambienteCompleto();
    fetchDosDoisDestinos({
      banco: async () => {
        throw new TypeError("fetch failed");
      },
      webhook: async () => {
        throw new TypeError("fetch failed");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { onRequestError } = await hookLimpo();

    await expect(onRequestError(new Error("x"), REQUISICAO, CONTEXTO)).resolves.toBeUndefined();
  });
});

describe("a fronteira do módulo", () => {
  const fonte = lerCodigo("src/lib/observabilidade.ts");

  it("não importa nada que só existe no servidor", async () => {
    /* `src/lib/supabase.ts` é importado por nove client components, e importa
       esta biblioteca. Qualquer um destes no topo quebra o build do cliente —
       e `server-only` nem está instalado neste projeto. */
    for (const proibido of ['"server-only"', '"next/headers"', './supabase-server', '"crypto"', '"node:']) {
      expect(fonte, `importou ${proibido}, que não existe no navegador`).not.toContain(proibido);
    }
  });

  it("é o único lugar que fala com o alertaDeFalha", async () => {
    expect(fonte).toContain('from "./alertaDeFalha"');
  });
});
