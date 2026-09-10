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
