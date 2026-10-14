import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * As rotas do Copiloto de Mídia com o banco trocado por um falso.
 *
 * As do SCRIPT (`/acoes`, `/acoes/resultado`, `/diagnostico`) entram pelo
 * segredo e falam com a chave de serviço; as do PAINEL (`/decisao`,
 * `/desfazer`, `/regras`) entram pela sessão, conferem a matriz e falam com o
 * banco pela PRÓPRIA sessão — é a sessão que carimba a autoria lá dentro.
 */

type Resultado = { data?: unknown; error?: { message: string; code?: string } | null; count?: number };

const estado = {
  segredoValido: "a".repeat(64),
  usuario: null as { id: string } | null,
  papeis: ["marketing"] as string[],
  regras: { data: [linhaDeRegras()], error: null } as Resultado,
  ultimoDiagnostico: [] as Array<{ recebido_em: string }>,
  aprovadas: [] as unknown[],
  reservadas: [] as unknown[],
  contagens: { total: 9, doSite: 7, comGclid: 2, comUtmGoogle: 3 },
  erroDaSessao: null as { message: string; code: string } | null,
};

const chamadas: {
  admin: Array<{ nome: string; args: Record<string, unknown> }>;
  sessao: Array<{ nome: string; args: Record<string, unknown> }>;
  tabelas: string[];
  /** Cada consulta executada: a tabela e os filtros encadeados. */
  consultas: string[];
} = {
  admin: [],
  sessao: [],
  tabelas: [],
  consultas: [],
};

function linhaDeRegras(hora = 0) {
  return {
    id: "r1",
    gasto_minimo_termo: "10.00",
    gasto_minimo_grupo: "50.00",
    gasto_minimo_campanha: "100.00",
    ritmo_alto_pct: 90,
    ritmo_baixo_pct: 50,
    reducao_verba_pct: 30,
    iq_baixo: 3,
    leads_gclid_minimos: 2,
    cliques_minimos_gclid: 30,
    perda_por_verba_pct: 10,
    perda_por_ranking_pct: 30,
    concorrentes: ["loja rival"],
    cidades_fora: [],
    palavras_informativas: ["como"],
    hora_do_diagnostico: hora,
    criado_por_nome: null,
    vigencia_desde: "2026-10-14",
  };
}

/** Um construtor de consulta que aceita qualquer encadeamento e responde pelo que viu. */
function consulta(tabela: string) {
  chamadas.tabelas.push(tabela);
  const visto: string[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "is", "eq", "order", "limit", "gte", "lt", "or", "not", "ilike", "in"]) {
    q[m] = (...args: unknown[]) => {
      visto.push(`${m}:${JSON.stringify(args)}`);
      return q;
    };
  }
  q.then = (ok: (r: Resultado) => unknown) => {
    const tudo = visto.join(" ");
    chamadas.consultas.push(`${tabela} ${tudo}`);
    let r: Resultado = { data: [], error: null };
    if (tabela === "midia_copiloto_parametros") r = estado.regras;
    else if (tabela === "midia_copiloto_diagnosticos") r = { data: estado.ultimoDiagnostico, error: null };
    else if (tabela === "midia_copiloto_acoes") r = { data: estado.aprovadas, error: null };
    else if (tabela === "leads") {
      const n = tudo.includes("gclid") ? estado.contagens.comGclid : tudo.includes("utm_source") ? estado.contagens.comUtmGoogle : tudo.includes("canal") ? estado.contagens.doSite : estado.contagens.total;
      r = { count: n, error: null };
    }
    return Promise.resolve(r).then(ok);
  };
  return q;
}

vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.admin.push({ nome, args });
      if (nome === "midia_confere_segredo") return { data: args.p_valor === estado.segredoValido, error: null };
      if (nome === "org_padrao") return { data: "org-da-loja", error: null };
      if (nome === "midia_copiloto_reservar_acoes") return { data: estado.reservadas, error: null };
      if (nome === "midia_copiloto_registrar_resultado") return { data: args.p_situacao, error: null };
      if (nome === "midia_copiloto_gravar_diagnostico") {
        const p = args.p as { achados: unknown[]; propostas: unknown[] };
        return { data: { diagnostico: "d1", achados: p.achados.length, propostas: p.propostas.length, puladas: 0, descartadas: 0 }, error: null };
      }
      return { data: null, error: { message: `rpc desconhecida: ${nome}` } };
    },
    from: (tabela: string) => consulta(tabela),
  }),
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.usuario } }) },
    from: (tabela: string) =>
      tabela === "profiles"
        ? { select: () => ({ eq: () => ({ single: async () => ({ data: { role: estado.papeis[0], papeis: estado.papeis, is_active: true } }) }) }) }
        : consulta(tabela),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.sessao.push({ nome, args });
      if (estado.erroDaSessao) return { data: null, error: estado.erroDaSessao };
      if (nome === "midia_copiloto_decidir") return { data: (args.p_acoes as string[]).length, error: null };
      if (nome === "midia_copiloto_desfazer") return { data: "novo-id", error: null };
      return { data: {}, error: null };
    },
  }),
}));

const { POST: postAcoes } = await import("../src/app/api/marketing/copiloto/acoes/route");
const { POST: postResultado } = await import("../src/app/api/marketing/copiloto/acoes/resultado/route");
const { POST: postDiagnostico } = await import("../src/app/api/marketing/copiloto/diagnostico/route");
const { POST: postDecisao } = await import("../src/app/api/marketing/copiloto/decisao/route");
const { POST: postDesfazer } = await import("../src/app/api/marketing/copiloto/desfazer/route");
const { POST: postRegras } = await import("../src/app/api/marketing/copiloto/regras/route");

const SEGREDO = { "x-motors-segredo": "a".repeat(64) };
const ID = "0c7f3b8e-1d2a-4f5b-9c6d-7e8f9a0b1c2d";
const req = (corpo: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(corpo) }) as unknown as NextRequest;
const chamou = (nome: string) => [...chamadas.admin, ...chamadas.sessao].some((c) => c.nome === nome);

const RETRATO = {
  conta: { id: "123-456-7890", moeda: "BRL", fuso: "America/Sao_Paulo", autoTagging: true },
  de: "2026-10-06",
  ate: "2026-10-12",
  previa: false,
  termos: [{ termo: "loja rival seminovos", status: "NONE", campanhaId: "111", campanha: "Pesquisa", grupoId: "222", grupo: "G", custo: 40, cliques: 12, impressoes: 90, conversoes: 0 }],
  palavras: [],
  anuncios: [],
  recursos: [],
  conversoes: [],
  campanhas: [],
  grupos: [],
  erros: {},
};

beforeEach(() => {
  chamadas.admin = [];
  chamadas.sessao = [];
  chamadas.tabelas = [];
  chamadas.consultas = [];
  estado.usuario = null;
  estado.papeis = ["marketing"];
  estado.regras = { data: [linhaDeRegras()], error: null };
  estado.ultimoDiagnostico = [];
  estado.aprovadas = [];
  estado.reservadas = [];
  estado.erroDaSessao = null;
});

describe("POST /api/marketing/copiloto/acoes (script)", () => {
  it("sem segredo: 401, e nada é reservado", async () => {
    const r = await postAcoes(req({ previa: false, fuso: "America/Sao_Paulo" }));
    expect(r.status).toBe(401);
    expect(chamou("midia_copiloto_reservar_acoes")).toBe(false);
  });

  it("fuso inválido: 400", async () => {
    const r = await postAcoes(req({ previa: false, fuso: "Marte/Base" }, SEGREDO));
    expect(r.status).toBe(400);
  });

  it("rodada de verdade: reserva no banco e diz que o diagnóstico está devido", async () => {
    estado.reservadas = [
      { id: ID, tipo: "mudar_verba", campanha_id_externo: "111", grupo_id_externo: null, texto: null, correspondencia: null, verba_atual: "50.00", verba_nova: "35.00" },
    ];
    const r = await postAcoes(req({ previa: false, fuso: "America/Sao_Paulo" }, SEGREDO));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.diagnosticoDevido).toBe(true);
    expect(corpo.acoes).toEqual([{ id: ID, tipo: "mudar_verba", campanhaId: "111", grupoId: null, texto: null, correspondencia: null, verbaAtual: 50, verbaNova: 35 }]);
    expect(chamou("midia_copiloto_reservar_acoes")).toBe(true);
  });

  it("prévia: lista o aprovado sem reservar nada", async () => {
    estado.aprovadas = [{ id: ID, tipo: "negativar", campanha_id_externo: "111", grupo_id_externo: null, texto: "x", correspondencia: "exata", verba_atual: null, verba_nova: null }];
    const r = await postAcoes(req({ previa: true, fuso: "America/Sao_Paulo" }, SEGREDO));
    expect((await r.json()).acoes).toHaveLength(1);
    expect(chamou("midia_copiloto_reservar_acoes")).toBe(false);
  });

  it("toda leitura com a chave de serviço filtra a loja do script", async () => {
    await postAcoes(req({ previa: true, fuso: "America/Sao_Paulo" }, SEGREDO));
    const daLoja = (tabela: string) => chamadas.consultas.filter((c) => c.startsWith(`${tabela} `));
    for (const tabela of ["midia_copiloto_parametros", "midia_copiloto_diagnosticos", "midia_copiloto_acoes"]) {
      expect(daLoja(tabela).length, tabela).toBeGreaterThan(0);
      for (const c of daLoja(tabela)) expect(c, tabela).toContain('eq:["org_id","org-da-loja"]');
    }
  });

  it("diagnóstico de hoje já recebido: não está devido", async () => {
    estado.ultimoDiagnostico = [{ recebido_em: new Date().toISOString() }];
    const r = await postAcoes(req({ previa: false, fuso: "America/Sao_Paulo" }, SEGREDO));
    expect((await r.json()).diagnosticoDevido).toBe(false);
  });

  it("migração não aplicada: 503 com o nome da migração", async () => {
    estado.regras = { data: null, error: { message: 'relation "midia_copiloto_parametros" does not exist', code: "42P01" } };
    const r = await postAcoes(req({ previa: false, fuso: "America/Sao_Paulo" }, SEGREDO));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/20261014150000_copiloto_de_midia/);
  });
});

describe("POST /api/marketing/copiloto/diagnostico (script)", () => {
  it("sem segredo: 401 e nada é gravado", async () => {
    const r = await postDiagnostico(req(RETRATO));
    expect(r.status).toBe(401);
    expect(chamou("midia_copiloto_gravar_diagnostico")).toBe(false);
  });

  it("retrato torto: 400 e nada é gravado", async () => {
    const r = await postDiagnostico(req({ ...RETRATO, de: "ontem" }, SEGREDO));
    expect(r.status).toBe(400);
    expect(chamou("midia_copiloto_gravar_diagnostico")).toBe(false);
  });

  it("retrato certo: conta os leads da janela, aplica as regras e grava numa chamada só", async () => {
    const r = await postDiagnostico(req(RETRATO, SEGREDO));
    expect(r.status).toBe(200);
    const g = chamadas.admin.find((c) => c.nome === "midia_copiloto_gravar_diagnostico")!;
    const p = g.args.p as { resumo: { leads: unknown }; propostas: Array<{ texto: string; correspondencia: string }> };
    expect(p.resumo.leads).toEqual({ total: 9, doSite: 7, comGclid: 2, comUtmGoogle: 3 });
    expect(p.propostas.map((x) => `${x.correspondencia}:${x.texto}`)).toContain("frase:loja rival");
    expect(chamadas.tabelas.filter((t) => t === "leads")).toHaveLength(4);
    // O clique do iPhone conta: gbraid e wbraid vêm no lugar do gclid.
    expect(chamadas.consultas.some((c) => c.startsWith("leads ") && /gclid\.not\.is\.null,gbraid\.not\.is\.null,wbraid\.not\.is\.null/.test(c))).toBe(true);
  });
});

describe("POST /api/marketing/copiloto/acoes/resultado (script)", () => {
  it("resultado torto: 400 e nada é registrado", async () => {
    const r = await postResultado(req({ resultados: [{ id: ID, situacao: "falhou", lido: {} }] }, SEGREDO));
    expect(r.status).toBe(400);
    expect(chamou("midia_copiloto_registrar_resultado")).toBe(false);
  });

  it("registra cada resultado e devolve a conta", async () => {
    const r = await postResultado(
      req({ resultados: [{ id: ID, situacao: "aplicada", lido: { negativa: true } }, { id: ID, situacao: "sem_efeito", lido: {} }] }, SEGREDO),
    );
    expect(await r.json()).toEqual({ ok: true, aplicadas: 1, semEfeito: 1, falhas: 0, ignoradas: 0 });
  });
});

describe("as rotas do painel", () => {
  it("sem sessão: 401; comercial: 403; e o banco não é chamado", async () => {
    expect((await postDecisao(req({ ids: [ID], decisao: "aprovar" }))).status).toBe(401);
    estado.usuario = { id: "u1" };
    estado.papeis = ["comercial"];
    expect((await postDecisao(req({ ids: [ID], decisao: "aprovar" }))).status).toBe(403);
    expect((await postDesfazer(req({ id: ID }))).status).toBe(403);
    expect((await postRegras(req({}))).status).toBe(403);
    expect(chamadas.sessao).toEqual([]);
  });

  it("decisão: pela SESSÃO, com os ids e a nota", async () => {
    estado.usuario = { id: "u1" };
    const r = await postDecisao(req({ ids: [ID], decisao: "aprovar", nota: "ok" }));
    expect(await r.json()).toEqual({ pedidas: 1, mudaram: 1 });
    expect(chamadas.sessao[0]).toEqual({ nome: "midia_copiloto_decidir", args: { p_acoes: [ID], p_decisao: "aprovar", p_nota: "ok" } });
    expect(chamadas.admin).toEqual([]);
  });

  it("decisão torta: 400; o banco recusando o papel: 403", async () => {
    estado.usuario = { id: "u1" };
    expect((await postDecisao(req({ ids: ["1"], decisao: "aprovar" }))).status).toBe(400);
    estado.erroDaSessao = { message: "Só Administrador ou Marketing", code: "42501" };
    expect((await postDecisao(req({ ids: [ID], decisao: "recusar" }))).status).toBe(403);
  });

  it("desfazer: uuid ou 400", async () => {
    estado.usuario = { id: "u1" };
    expect((await postDesfazer(req({ id: "x" }))).status).toBe(400);
    const r = await postDesfazer(req({ id: ID }));
    expect(await r.json()).toEqual({ id: "novo-id" });
  });

  it("regras: valida e manda as listas normalizadas", async () => {
    estado.usuario = { id: "u1" };
    const corpo = {
      gastoMinimoTermo: 10,
      gastoMinimoGrupo: 50,
      gastoMinimoCampanha: 100,
      ritmoAltoPct: 90,
      ritmoBaixoPct: 50,
      reducaoVerbaPct: 30,
      iqBaixo: 3,
      leadsGclidMinimos: 2,
      cliquesMinimosGclid: 30,
      perdaPorVerbaPct: 10,
      perdaPorRankingPct: 30,
      horaDoDiagnostico: 7,
      concorrentes: " Loja Rival \n loja rival",
      cidadesFora: "",
      palavrasInformativas: "como",
    };
    expect((await postRegras(req({ ...corpo, ritmoBaixoPct: 95 }))).status).toBe(400);
    expect((await postRegras(req(corpo))).status).toBe(200);
    const rpc = chamadas.sessao.find((c) => c.nome === "midia_copiloto_nova_vigencia")!;
    expect(rpc.args).toMatchObject({ p_concorrentes: ["loja rival"], p_cidades_fora: [], p_palavras_informativas: ["como"], p_hora_do_diagnostico: 7 });
  });
});
