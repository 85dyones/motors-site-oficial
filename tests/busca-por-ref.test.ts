import { describe, it, expect, vi, beforeEach } from "vitest";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import {
  AVISO_DE_REF_INVALIDA,
  normalizarRef,
  padraoDaRef,
  resumoDaBusca,
} from "../src/lib/leadsKanban";
import { refCurta, sufixoRef } from "../src/lib/telemetry";

/**
 * O "(Ref: 0DCB1CDC)" passa a ter onde ser procurado — EXECUTADO.
 *
 * Desde 2026-08-19 a mensagem pré-preenchida de WhatsApp de quem tem rastreio
 * termina com os 8 primeiros caracteres do `ag_uid`, e o comentário de
 * `refCurta` diz para que eles existem: achar o lead quando a conversa chega
 * de outro número. Desde 2026-09-02 `/api/leads` grava o `ag_uid`. Faltava o
 * caminho de volta, e é ele que este arquivo prova, em três degraus:
 *
 *   1. o que o atendente cola vira o código que o cliente leu (`normalizarRef`);
 *   2. o código vira um filtro que devolve EXATAMENTE os leads cuja mensagem o
 *      mostrou — medido contra `refCurta`, a função que o imprime, e não contra
 *      uma lista escrita à mão (`padraoDaRef`);
 *   3. a rota, chamada de verdade contra um banco em memória, recusa quem não
 *      vê lead antes de ler qualquer coisa, e devolve o lead achado com tudo o
 *      que o card da fila tem.
 *
 * A fiação da tela — o campo que não some, o Atualizar que repete a busca —
 * está em `busca-por-ref-fiacao.test.ts`, que precisa de `jsdom`.
 *
 * Portado de 26/08 (commit 5bab534, que não chegou ao `main`). O que mudou no
 * caminho: aquela versão lia uma coluna gerada, `ref_curta`, que não existe
 * no `main` — aqui o filtro é `ilike` sobre o próprio `ag_uid`; e as asserções
 * que liam o TEXTO da rota viraram chamadas à rota.
 */

const UUID = "0dcb1cdc-fb39-4a39-99c9-923f025619f4";

/**
 * `ilike` como o Postgres o lê: `%` é qualquer sequência, `_` é um caractere,
 * o resto é literal e a caixa não conta. NULL não casa com padrão nenhum.
 *
 * Sem escape (`\%`) de propósito: só passa por aqui o que `padraoDaRef`
 * produz, e ele não produz nenhum.
 */
function casaIlike(padrao: string, valor: unknown): boolean {
  if (typeof valor !== "string") return false;
  const corpo = padrao
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, "[\\s\\S]*")
    .replace(/_/g, "[\\s\\S]");
  return new RegExp(`^${corpo}$`, "i").test(valor);
}

describe("normalizarRef — o que o atendente cola vira o código que o cliente leu", () => {
  it.each([
    ["o código, como o cliente o lê", "0DCB1CDC"],
    ["em minúsculas — ninguém digita em caixa alta", "0dcb1cdc"],
    ["com o rótulo e os parênteses da mensagem", " (Ref: 0DCB1CDC) "],
    ["com o rótulo colado — o `e` de Ref é hexadecimal e não pode ser engolido", "Ref:0DCB1CDC"],
    ["com a palavra por extenso", "referência 0dcb1cdc"],
    ["o UUID inteiro, colado de uma nota", UUID],
    ["o UUID no meio de um texto", `ag_uid: ${UUID}`],
  ])("aceita %s", (_caso, entrada) => {
    expect(normalizarRef(entrada)).toBe("0DCB1CDC");
  });

  it("aceita a mensagem INTEIRA, com o sufixo de verdade no fim", () => {
    // O sufixo é montado por `sufixoRef`, e não escrito à mão: se o formato da
    // mensagem mudar, é aqui que a busca descobre. A versão de 26/08 lia esta
    // mesma mensagem como `EEEE2022` — juntava todo hexadecimal do texto.
    const mensagem = `Olá! Tenho interesse no Onix 2022, podem me passar mais detalhes?${sufixoRef(UUID)}`;
    expect(normalizarRef(mensagem)).toBe(refCurta(UUID));
    expect(refCurta(UUID)).toBe("0DCB1CDC");
  });

  it.each([
    ["incompleta", "0DCB"],
    ["com um caractere a mais", "0DCB1CDCF"],
    // A versão de 26/08 devolvia `41999990`: uma referência de aparência
    // perfeita, uma busca vazia, e o atendente concluindo que o lead não existe.
    ["o telefone digitado no campo errado", "41999990000"],
    ["a mensagem sem referência", "Olá, tudo bem? Vi o carro no site."],
    // E esta virava `AEFACAAD`.
    ["o sentinela de quem chegou sem rastreio", "ag_ref_nao_localizado"],
    ["o vazio", ""],
    ["o que não é hexadecimal", "zzzzzzzz"],
  ])("recusa %s, em vez de buscar e não achar", (_caso, entrada) => {
    expect(normalizarRef(entrada)).toBe("");
  });

  it("recusa duas referências diferentes no mesmo texto — não adivinha o cliente", () => {
    expect(normalizarRef("Oi (Ref: 0DCB1CDC)\nOi de novo (Ref: 1234ABCD)")).toBe("");
    // A MESMA referência repetida não é ambiguidade.
    expect(normalizarRef(`(Ref: 0DCB1CDC) ${UUID}`)).toBe("0DCB1CDC");
  });
});

describe("padraoDaRef — o inverso exato de refCurta", () => {
  /** Os `ag_uid` que um lead pode ter, inclusive os que NÃO imprimem referência. */
  const RASTREIOS: Array<string | null> = [
    UUID,
    UUID.toUpperCase(),
    // o vizinho: um caractere de diferença no fim do prefixo
    "0dcb1cdd-fb39-4a39-99c9-923f025619f4",
    // nove hexadecimais antes do hífen — `refCurta` não imprime nada
    "0dcb1cdcf-b39-4a39-99c9-923f025619f4",
    // o código no meio, e não no começo
    "a0dcb1cdc-fb39-4a39-99c9-923f02561",
    "ag_ref_nao_localizado",
    "",
    null,
  ];

  it("o banco devolve exatamente os leads cuja mensagem mostrou a referência", () => {
    const ref = refCurta(UUID);
    for (const uid of RASTREIOS) {
      expect(casaIlike(padraoDaRef(ref), uid), String(uid)).toBe(refCurta(uid ?? "") === ref);
    }
    // Sem vacuidade: a lista tem quem casa e quem não casa.
    expect(RASTREIOS.filter((uid) => refCurta(uid ?? "") === ref)).toHaveLength(2);
  });

  it("o curinga não entra pela URL: só aceita a referência normalizada", () => {
    expect(casaIlike(padraoDaRef("0DCB1CDC"), UUID)).toBe(true);
    for (const torta of ["0dcb1cdc", "%", "0DCB1CD%", "0DCB_CDC", "0DCB1CDC-%", ""]) {
      expect(() => padraoDaRef(torta), JSON.stringify(torta)).toThrow();
    }
  });
});

describe("resumoDaBusca — o aviso da busca que achou", () => {
  it("um lead em aberto: só diz quantos", () => {
    expect(resumoDaBusca("0DCB1CDC", [{ ag_uid: UUID }])).toEqual({
      frases: ["1 lead com a referência 0DCB1CDC."],
      fechados: 0,
    });
  });

  it("diz quando o lead achado já foi fechado — senão o quadro vazio parece 'não achei'", () => {
    const { frases, fechados } = resumoDaBusca("0DCB1CDC", [{ ag_uid: UUID, desfecho: "perdido" }]);
    expect(fechados).toBe(1);
    expect(frases.join(" ")).toContain("lista de Fechados");
  });

  it("dois leads do mesmo rastreio são o mesmo aparelho, não coincidência", () => {
    const { frases, fechados } = resumoDaBusca("0DCB1CDC", [
      { ag_uid: UUID },
      { ag_uid: UUID.toUpperCase(), desfecho: "ganho" },
    ]);
    expect(frases[0]).toBe("2 leads com a referência 0DCB1CDC.");
    expect(fechados).toBe(1);
    expect(frases.join(" ")).toContain("mesmo aparelho");
    expect(frases.join(" ")).not.toContain("confira");
  });

  it("rastreios diferentes com o mesmo prefixo mandam conferir antes de responder", () => {
    const { frases } = resumoDaBusca("0DCB1CDC", [
      { ag_uid: UUID },
      { ag_uid: "0dcb1cdc-0000-4000-8000-000000000000" },
    ]);
    expect(frases.join(" ")).toContain("confira nome e telefone");
  });
});

// ---------------------------------------------------------------------------
// A rota, chamada de verdade
// ---------------------------------------------------------------------------

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const { GET } = await import("../src/app/api/leads/gerenciar/route");

type Linha = Record<string, unknown>;

/** O que a rota pediu a uma tabela: é o que o banco em memória obedece. */
interface Pedido {
  tabela: string;
  eq: Record<string, unknown>;
  em: Record<string, unknown[]>;
  ilike: Array<[string, string]>;
  ordem?: { coluna: string; crescente: boolean };
  limite?: number;
}

let papel: string;
let LEADS: Linha[];
let ATENDIMENTOS: Linha[];
let pedidos: Pedido[];
/** Simula o banco sem a coluna `ag_uid`: só a leitura que filtra por ela falha. */
let semColunaAgUid: boolean;

/**
 * Um construtor de consulta do supabase-js: anota o pedido, encadeia, e
 * resolve no fim — pelo `await` ou por `single`/`maybeSingle`.
 */
function consulta(
  tabela: string,
  ler: (p: Pedido) => unknown,
  falhar: (p: Pedido) => { code: string; message: string } | null = () => null,
) {
  const p: Pedido = { tabela, eq: {}, em: {}, ilike: [] };
  pedidos.push(p);
  const resposta = () => {
    const erro = falhar(p);
    return erro ? { data: null, error: erro } : { data: ler(p), error: null };
  };
  const q: any = {
    select: () => q,
    eq: (coluna: string, valor: unknown) => {
      p.eq[coluna] = valor;
      return q;
    },
    in: (coluna: string, valores: unknown[]) => {
      p.em[coluna] = valores;
      return q;
    },
    ilike: (coluna: string, padrao: string) => {
      p.ilike.push([coluna, padrao]);
      return q;
    },
    order: (coluna: string, opcoes?: { ascending?: boolean }) => {
      p.ordem = { coluna, crescente: opcoes?.ascending ?? true };
      return q;
    },
    limit: (n: number) => {
      p.limite = n;
      return q;
    },
    single: async () => resposta(),
    maybeSingle: async () => resposta(),
    then: (ok: any, falha: any) => Promise.resolve(resposta()).then(ok, falha),
  };
  return q;
}

/** A ordem do SQL: filtra, ordena e SÓ ENTÃO corta. */
function lerLeads(p: Pedido): Linha[] {
  let linhas = LEADS.filter((l) => p.ilike.every(([coluna, padrao]) => casaIlike(padrao, l[coluna])));
  if (p.ordem) {
    const { coluna, crescente } = p.ordem;
    // Comparação de bytes, e não `localeCompare`: as datas são ISO, e a ordem
    // do texto é a ordem do tempo.
    const valor = (l: Linha) => String(l[coluna]);
    linhas = [...linhas].sort(
      (a, b) => (valor(a) < valor(b) ? -1 : valor(a) > valor(b) ? 1 : 0) * (crescente ? 1 : -1),
    );
  }
  return p.limite === undefined ? linhas : linhas.slice(0, p.limite);
}

const lead = (id: string, ag_uid: string | null, created_at: string, extra: Linha = {}): Linha => ({
  id,
  nome: `Cliente ${id}`,
  telefone: "5541999990000",
  situacao: "novo",
  ag_uid,
  created_at,
  desfecho: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  papel = "comercial";
  pedidos = [];
  semColunaAgUid = false;
  LEADS = [
    lead("mesmo-1", UUID, "2026-09-10T12:00:00.000Z"),
    lead("mesmo-2", UUID, "2026-09-12T12:00:00.000Z", { situacao: "proposta" }),
    lead("vizinho", "0dcb1cdd-fb39-4a39-99c9-923f025619f4", "2026-09-11T12:00:00.000Z"),
    lead("nove-hex", "0dcb1cdcf-b39-4a39-99c9-923f025619f4", "2026-09-11T13:00:00.000Z"),
    lead("sem-rastreio", null, "2026-09-13T12:00:00.000Z"),
  ];
  ATENDIMENTOS = [
    {
      lead_id: "mesmo-2",
      chatwoot_conversation_id: 77,
      com_assistente: false,
      humano_assumiu_em: "2026-09-12T12:10:00.000Z",
      iniciado_em: "2026-09-12T12:05:00.000Z",
      created_at: "2026-09-12T12:05:00.000Z",
    },
  ];

  CLIENTE.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      // A primeira leitura é o perfil de quem chama; a outra, a lista de atendentes.
      return consulta(tabela, (p) =>
        p.eq.id
          ? { role: papel, papeis: [papel] }
          : [{ full_name: "Ana Atendente", role: "comercial", papeis: ["comercial"] }],
      );
    }
    if (tabela === "leads") {
      return consulta(tabela, lerLeads, (p) =>
        semColunaAgUid && p.ilike.some(([coluna]) => coluna === "ag_uid")
          ? { code: "42703", message: "column leads.ag_uid does not exist" }
          : null,
      );
    }
    if (tabela === "atendimentos") {
      return consulta(tabela, (p) =>
        ATENDIMENTOS.filter((a) => (p.em.lead_id ?? []).includes(a.lead_id)),
      );
    }
    if (tabela === "funil_etapas") return consulta(tabela, () => ETAPAS_PADRAO);
    if (tabela === "funil_motivos") return consulta(tabela, () => []);
    throw new Error(`tabela inesperada: ${tabela}`);
  });
});

const chamar = (query = "") => GET(new Request(`http://x/api/leads/gerenciar${query}`) as any);

const ids = (corpo: { leads: Linha[] }) => corpo.leads.map((l) => l.id);

describe("GET /api/leads/gerenciar?ref= — a busca, executada", () => {
  it("Comercial acha os leads da referência, e só eles", async () => {
    const r = await chamar(`?ref=${encodeURIComponent("(Ref: 0dcb1cdc)")}`);
    expect(r.status).toBe(200);
    const corpo = await r.json();

    // O esperado sai de `refCurta` — a função que imprime a referência na
    // mensagem —, e não de uma lista escrita à mão.
    const esperados = LEADS.filter((l) => refCurta((l.ag_uid as string | null) ?? "") === "0DCB1CDC").map(
      (l) => l.id,
    );
    expect(esperados).toHaveLength(2);
    expect([...ids(corpo)].sort()).toEqual([...esperados].sort());
    expect(corpo.busca).toEqual({ ref: "0DCB1CDC" });
  });

  it("o lead achado vem com tudo o que o card da fila tem", async () => {
    // Uma resposta de outro formato desenharia o funil padrão no lugar do
    // configurado, e o card perderia o Chatwoot e o relógio do assistente.
    const corpo = await (await chamar("?ref=0DCB1CDC")).json();
    const comConversa = corpo.leads.find((l: Linha) => l.id === "mesmo-2");
    expect(comConversa.chatwoot_conversation_id).toBe(77);
    expect(comConversa.com_assistente).toBe(false);
    expect(comConversa.humano_assumiu_em).toBe("2026-09-12T12:10:00.000Z");
    expect(corpo.etapas).toHaveLength(ETAPAS_PADRAO.length);
    expect(corpo.atendentes).toEqual([{ nome: "Ana Atendente" }]);
  });

  it("o filtro vai para o BANCO: acha o lead que está além dos 500 da fila", async () => {
    // O caso de uso da busca é justamente o lead que não está à vista.
    // Filtrar a lista já lida acharia só entre os 500 mais recentes.
    LEADS = [
      lead("antigo", UUID, "2026-09-02T21:00:00.000Z"),
      ...Array.from({ length: 520 }, (_, i) =>
        lead(
          `novo-${i}`,
          `ffffffff-0000-4000-8000-${String(i).padStart(12, "0")}`,
          new Date(Date.UTC(2026, 8, 15, 0, 0, i)).toISOString(),
        ),
      ),
    ];

    const fila = await (await chamar()).json();
    expect(fila.leads).toHaveLength(500);
    expect(ids(fila)).not.toContain("antigo");

    const busca = await (await chamar("?ref=0DCB1CDC")).json();
    expect(ids(busca)).toEqual(["antigo"]);
  });

  it("quem fica no agregado recebe 403 — e a tabela de leads nem é lida", async () => {
    // A busca devolve nome e telefone. Um agregado de busca por código não
    // agregaria nada e ainda diria se o lead existe.
    papel = "marketing";
    for (const entrada of ["0DCB1CDC", "0DCB"]) {
      pedidos = [];
      const r = await chamar(`?ref=${entrada}`);
      expect(r.status, entrada).toBe(403);
      const corpo = await r.json();
      expect(corpo, entrada).not.toHaveProperty("leads");
      expect(corpo, entrada).not.toHaveProperty("total");
      expect(pedidos.map((p) => p.tabela), entrada).not.toContain("leads");
    }
  });

  it("sem `?ref=`, quem fica no agregado continua recebendo só a contagem", async () => {
    papel = "marketing";
    const corpo = await (await chamar()).json();
    expect(corpo.somenteAgregado).toBe(true);
    expect(corpo.total).toBe(LEADS.length);
    expect(JSON.stringify(corpo)).not.toContain("Cliente");
  });

  it("o que não é referência é 400, com a frase da tela, sem ler o banco", async () => {
    for (const entrada of ["0DCB", "41999990000", "Olá, tudo bem?", ""]) {
      pedidos = [];
      const r = await chamar(`?ref=${encodeURIComponent(entrada)}`);
      expect(r.status, JSON.stringify(entrada)).toBe(400);
      expect((await r.json()).error).toBe(AVISO_DE_REF_INVALIDA);
      expect(pedidos.map((p) => p.tabela), JSON.stringify(entrada)).not.toContain("leads");
    }
  });

  it("sem `?ref=` a fila é a de sempre, e a resposta diz que é fila", async () => {
    const corpo = await (await chamar()).json();
    expect(corpo.leads).toHaveLength(LEADS.length);
    expect(corpo.busca).toBeNull();
    expect(pedidos.find((p) => p.tabela === "leads")?.ilike).toEqual([]);
  });

  it("sem a coluna `ag_uid`, a busca vira erro legível — e não trava o painel em 'migração pendente'", async () => {
    // `migracaoPendente` põe a tela inteira em "a tabela de leads ainda não
    // existe", e ela não sai dali sem recarregar a página.
    semColunaAgUid = true;
    const r = await chamar("?ref=0DCB1CDC");
    expect(r.status).toBe(500);
    const corpo = await r.json();
    expect(corpo).not.toHaveProperty("migracaoPendente");
    expect(corpo.error).toContain("ag_uid");

    // A fila, que não filtra pela coluna, segue como sempre.
    expect((await chamar()).status).toBe(200);
  });
});
