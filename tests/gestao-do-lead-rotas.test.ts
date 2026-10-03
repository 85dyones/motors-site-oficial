import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * As rotas da gestão do lead, EXECUTADAS (03/10/2026).
 *
 *   GET   /api/leads/[id]             o detalhe
 *   POST  /api/leads/[id]/interacoes  registrar interação
 *   POST  /api/leads/[id]/chegou      "Chegou na loja"
 *   PATCH /api/leads/[id]/dados       dados do negócio
 *   GET   /api/leads/gerenciar        a última interação e a busca única
 *
 * O que se trava aqui:
 *   - cada perfil só alcança o lead do seu escopo (`lib/escopoDeLeads`): o
 *     vendedor no lead do colega e o Gestor no lead sem responsável recebem
 *     404; Marketing, Financeiro, perfil desativado e quem não é da equipe,
 *     403, sem nome, telefone nem texto de registro na resposta;
 *   - a GUARDA vem antes: recusado, o pedido não lê `leads_interacoes` nem
 *     `leads_eventos`, não chama a função e não grava nada. No banco essas
 *     tabelas são de toda a equipe e a função alcança qualquer lead;
 *   - vale com a RLS de `leads` aberta (como produção está) e fechada por
 *     escopo (a migração 20261003130000): os dois bancos, as mesmas respostas;
 *   - os códigos de validação, e que a função só recebe o que aceita.
 *
 * Banco em memória: as rotas são chamadas de verdade, com as funções de
 * `lib/` que usam. `linhaDoTempo` anota cada leitura, gravação e chamada de
 * função, na ordem.
 */

type Linha = Record<string, unknown>;
interface Erro {
  message: string;
  code?: string;
}

let banco: Record<string, Linha[]>;
let falhas: Record<string, Erro | undefined>;
let falhasAoGravar: Record<string, Erro | undefined>;
let linhaDoTempo: string[];
let usuario: string | null;
let rpcs: Array<{ nome: string; args: Linha }>;
let erroDoRpc: Erro | null;
/** A RLS de `leads` fechada por escopo (20261003130000) já foi aplicada? */
let rlsPorEscopo: boolean;
/** Roda logo antes de um `update` em `leads` chegar ao banco. */
let antesDeGravarLead: (() => void) | null;
let proximoId: number;

const { leadNoEscopo, visaoDeLeads } = await import("../src/lib/escopoDeLeads");

function quemPede(): Linha | undefined {
  return (banco.profiles ?? []).find((p) => p.id === usuario);
}

/** O que a sessão alcança em `leads` quando a RLS é a do escopo. */
function visiveisPelaRls(linhas: Linha[]): Linha[] {
  if (!rlsPorEscopo) return linhas;
  const perfil = quemPede();
  const visao = visaoDeLeads(perfil?.is_active === true ? (perfil.papeis as string[]) : [], perfil?.full_name as string);
  return linhas.filter((l) => leadNoEscopo(visao, l.responsavel as string | null));
}

/** `%x%` do `ilike` como expressão regular, com `\%` e `\_` literais. */
function padraoDoIlike(padrao: string): RegExp {
  let fonte = "";
  for (let i = 0; i < padrao.length; i += 1) {
    const c = padrao[i];
    if (c === "\\" && i + 1 < padrao.length) fonte += padrao[(i += 1)].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%") fonte += ".*";
    else if (c === "_") fonte += ".";
    else fonte += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${fonte}$`, "i");
}

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let atualizacao: Linha | null = null;
  let ordem: { coluna: string; crescente: boolean } | null = null;
  let colunas = "*";
  let limite = Infinity;
  /** O `select` recorta: a resposta só leva o que a rota pediu ao banco. */
  const recortar = (l: Linha): Linha =>
    colunas === "*" ? { ...l } : Object.fromEntries(colunas.split(",").map((c) => [c.trim(), l[c.trim()] ?? null]));
  const casar = (coluna: string, padrao: string) => (l: Linha) =>
    typeof l[coluna] === "string" && padraoDoIlike(padrao).test(l[coluna] as string);

  const linhas = () => {
    const base = tabela === "leads" ? visiveisPelaRls(banco.leads ?? []) : (banco[tabela] ?? []);
    let achadas = base.filter((l) => filtros.every((f) => f(l)));
    if (ordem) {
      const { coluna, crescente } = ordem;
      const v = (l: Linha) => String(l[coluna] ?? "");
      achadas = [...achadas].sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * (crescente ? 1 : -1));
    }
    return achadas.slice(0, limite);
  };

  const executar = async () => {
    const falha = falhas[tabela];
    if (atualizacao) {
      const falhaAoGravar = falhasAoGravar[tabela] ?? falha;
      linhaDoTempo.push(`update ${tabela}`);
      if (falhaAoGravar) return { data: null, error: falhaAoGravar };
      if (tabela === "leads") antesDeGravarLead?.();
      const alcancadas = linhas();
      for (const l of alcancadas) {
        // O gatilho do rastro: a mudança de etapa deixa a linha `etapa`.
        if ("situacao" in atualizacao && atualizacao.situacao !== l.situacao) {
          (banco.leads_eventos ??= []).push({
            id: `ev-${(proximoId += 1)}`,
            lead_id: l.id,
            tipo: "etapa",
            de: l.situacao,
            para: atualizacao.situacao,
            autor: quemPede()?.full_name ?? null,
            automatico: false,
            detalhe: null,
            criado_em: new Date().toISOString(),
          });
        }
        Object.assign(l, atualizacao);
      }
      return { data: alcancadas.map(recortar), error: null };
    }
    linhaDoTempo.push(`select ${tabela}`);
    if (falha) return { data: null, error: falha };
    return { data: linhas().map(recortar), error: null };
  };

  const q = {
    select: (pedidas = "*") => {
      colunas = pedidas;
      return q;
    },
    order: (coluna: string, opcoes?: { ascending?: boolean }) => {
      ordem = { coluna, crescente: opcoes?.ascending ?? true };
      return q;
    },
    limit: (n: number) => {
      limite = n;
      return q;
    },
    eq: (coluna: string, valor: unknown) => {
      filtros.push((l) => String(l[coluna]) === String(valor) && l[coluna] !== null && l[coluna] !== undefined);
      return q;
    },
    neq: (coluna: string, valor: unknown) => {
      filtros.push((l) => l[coluna] !== valor);
      return q;
    },
    not: (coluna: string, operador: string, valor: unknown) => {
      if (operador !== "is" || valor !== null) throw new Error(`not ${operador}: o dublê não conhece`);
      filtros.push((l) => l[coluna] !== null && l[coluna] !== undefined);
      return q;
    },
    is: (coluna: string, valor: unknown) => {
      if (valor !== null) throw new Error("is: o dublê só conhece null");
      filtros.push((l) => l[coluna] === null || l[coluna] === undefined);
      return q;
    },
    in: (coluna: string, valores: unknown[]) => {
      filtros.push((l) => valores.includes(l[coluna]));
      return q;
    },
    ilike: (coluna: string, padrao: string) => {
      filtros.push(casar(coluna, padrao));
      return q;
    },
    // Só a forma que a busca monta: `coluna.ilike.padrao,coluna.ilike.padrao`.
    or: (expressao: string) => {
      const ramos = expressao.split(",").map((ramo) => {
        const m = /^(\w+)\.ilike\.(.+)$/.exec(ramo);
        if (!m) throw new Error(`or "${ramo}": o dublê não conhece`);
        return casar(m[1], m[2]);
      });
      filtros.push((l) => ramos.some((r) => r(l)));
      return q;
    },
    update: (campos: Linha) => {
      atualizacao = campos;
      return q;
    },
    single: async () => {
      const r = await executar();
      return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
    },
    maybeSingle: async () => {
      const r = await executar();
      return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => executar().then(ok, erro),
  };
  return q;
}

/**
 * `registrar_interacao_do_lead`, como a migração 20260923150000 a escreve:
 * recusa quem não é da equipe e o lead que não existe, grava o registro e, com
 * passo, o próximo passo no lead. Alcança QUALQUER lead pelo id: é por isso
 * que a guarda é da rota.
 */
async function rpc(nome: string, args: Linha) {
  rpcs.push({ nome, args });
  linhaDoTempo.push(`rpc ${nome}`);
  if (erroDoRpc) return { data: null, error: erroDoRpc };
  if (nome !== "registrar_interacao_do_lead") throw new Error(`rpc inesperada: ${nome}`);
  const lead = banco.leads.find((l) => l.id === args.p_lead);
  if (!lead) return { data: null, error: { code: "P0002", message: "LEAD_NAO_ENCONTRADO" } };
  const autor = (quemPede()?.full_name as string | undefined) ?? null;
  const id = `int-${(proximoId += 1)}`;
  const agora = new Date().toISOString();
  banco.leads_interacoes.push({
    id,
    lead_id: lead.id,
    tipo: args.p_tipo,
    resultado: args.p_resultado ?? null,
    texto: args.p_texto ?? null,
    autor,
    passo_texto: args.p_passo ?? null,
    passo_vence_em: args.p_vence_em ?? null,
    importada: false,
    criado_em: agora,
  });
  if (args.p_passo) {
    Object.assign(lead, {
      proximo_passo: args.p_passo,
      proximo_passo_vence_em: args.p_vence_em,
      proximo_passo_definido_em: agora,
      proximo_passo_definido_por: autor,
    });
  }
  lead.ultimo_contato_em = agora;
  return { data: id, error: null };
}

const CLIENTE = {
  auth: { getUser: async () => ({ data: { user: usuario ? { id: usuario } : null } }) },
  from: (tabela: string) => consulta(tabela),
  rpc,
};
const SERVICO = { from: vi.fn(() => { throw new Error("a gestão do lead não usa a chave de serviço"); }) };
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
  createAdminSupabaseClient: () => SERVICO,
}));

const detalhe = await import("../src/app/api/leads/[id]/route");
const interacoes = await import("../src/app/api/leads/[id]/interacoes/route");
const chegou = await import("../src/app/api/leads/[id]/chegou/route");
const dados = await import("../src/app/api/leads/[id]/dados/route");
const gerenciar = await import("../src/app/api/leads/gerenciar/route");
const { ETAPAS_PADRAO } = await import("../src/lib/funil");

// ----------------------------------------------------------------------------
// A fixture
// ----------------------------------------------------------------------------

/** Sábado, 03/10/2026, 12:00 em São Paulo. */
const AGORA = new Date("2026-10-03T15:00:00Z");

const DA_ANA = "a0000000-0000-4000-8000-000000000001";
const DA_ANA_2 = "a0000000-0000-4000-8000-000000000002";
const DA_BIA = "b0000000-0000-4000-8000-000000000001";
const SEM_DONO = "c0000000-0000-4000-8000-000000000001";
const FECHADO = "d0000000-0000-4000-8000-000000000001";
const NEGOCIANDO = "e0000000-0000-4000-8000-000000000001";
const INEXISTENTE = "f0000000-0000-4000-8000-00000000dead";

/** O que nunca pode chegar a quem não vê o lead. */
const PESSOAL = ["Joana", "Marcos", "Rita", "5541991176299", "5541988887777", "pediu fotos do interior", "achou caro"];

const lead = (id: string, extra: Linha): Linha => ({
  id,
  nome: "Cliente",
  telefone: "5541900000000",
  email: null,
  interesse: null,
  canal: "PDP",
  situacao: "proposta",
  responsavel: null,
  observacoes: null,
  created_at: "2026-09-25T12:00:00Z",
  ultimo_movimento_em: "2026-09-25T12:00:00Z",
  ultimo_contato_em: null,
  desfecho: null,
  transferencias: 0,
  ag_uid: null,
  veiculo_id: null,
  proximo_passo: null,
  proximo_passo_vence_em: null,
  proximo_passo_definido_em: null,
  proximo_passo_definido_por: null,
  carro_na_troca: null,
  faixa_entrada: null,
  pagamento_pretendido: null,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  usuario = "u-ana";
  falhas = {};
  falhasAoGravar = {};
  linhaDoTempo = [];
  rpcs = [];
  erroDoRpc = null;
  rlsPorEscopo = false;
  antesDeGravarLead = null;
  proximoId = 0;
  SERVICO.from.mockClear();
  banco = {
    profiles: [
      { id: "u-admin", full_name: "Dono", role: "admin", papeis: ["admin"], is_active: true },
      { id: "u-gestor", full_name: "Gil", role: "gestor", papeis: ["gestor"], is_active: true },
      { id: "u-sdr", full_name: "Felipe", role: "sdr", papeis: ["sdr"], is_active: true },
      { id: "u-ana", full_name: "Ana", role: "comercial", papeis: ["comercial"], is_active: true },
      { id: "u-bia", full_name: "Bia", role: "comercial", papeis: ["comercial"], is_active: true },
      { id: "u-mkt", full_name: "Mari", role: "marketing", papeis: ["marketing"], is_active: true },
      { id: "u-fin", full_name: "Fabi", role: "financeiro", papeis: ["financeiro"], is_active: true },
      // Saiu da loja: o perfil foi desativado e a sessão segue viva. Os leads
      // "da Ana" não são dele, mas ele era Comercial e Admin.
      { id: "u-saiu", full_name: "Ana", role: "admin", papeis: ["admin", "comercial"], is_active: false },
      { id: "u-cliente", full_name: "Zé", role: "cliente", papeis: [], is_active: true },
    ],
    leads: [
      lead(DA_ANA, {
        nome: "Joana",
        telefone: "5541991176299",
        interesse: "Onix 2020",
        responsavel: "Ana",
        created_at: "2026-09-25T12:00:00Z",
        ag_uid: "0dcb1cdc-fb39-4a39-99c9-923f025619f4",
        veiculo_id: 8203724,
        transferencias: 3,
        proximo_passo: "Cobrar retorno da proposta",
        proximo_passo_vence_em: "2026-10-03T19:30:00Z",
        proximo_passo_definido_em: "2026-10-02T12:00:00Z",
        proximo_passo_definido_por: "Ana",
        utm_campaign: "Seminovos Outubro",
      }),
      lead(DA_ANA_2, { nome: "Paulo", responsavel: "Ana", created_at: "2026-09-20T12:00:00Z" }),
      lead(DA_BIA, { nome: "Marcos", telefone: "5541988887777", responsavel: "Bia", created_at: "2026-09-22T12:00:00Z" }),
      lead(SEM_DONO, { nome: "Rita", situacao: "novo", responsavel: null, created_at: "2026-09-28T12:00:00Z" }),
      lead(FECHADO, {
        nome: "Caio",
        responsavel: "Ana",
        situacao: "perdido",
        desfecho: "perdido",
        desfecho_motivo: "preco",
        created_at: "2026-09-10T12:00:00Z",
      }),
      lead(NEGOCIANDO, { nome: "Lia", responsavel: "Ana", situacao: "negociacao", created_at: "2026-09-18T12:00:00Z" }),
    ],
    leads_interacoes: [
      {
        id: "i-1",
        lead_id: DA_ANA,
        tipo: "whatsapp",
        resultado: null,
        texto: "pediu fotos do interior",
        autor: "Ana",
        passo_texto: "Cobrar retorno da proposta",
        passo_vence_em: "2026-10-03T19:30:00Z",
        importada: false,
        criado_em: "2026-10-02T12:00:00Z",
      },
      {
        id: "i-0",
        lead_id: DA_ANA,
        tipo: "ligacao",
        resultado: "nao_atendeu",
        texto: null,
        autor: "Ana",
        passo_texto: null,
        passo_vence_em: null,
        importada: false,
        criado_em: "2026-09-30T12:00:00Z",
      },
      {
        id: "i-b",
        lead_id: DA_BIA,
        tipo: "nota",
        resultado: null,
        texto: "achou caro",
        autor: "Bia",
        passo_texto: null,
        passo_vence_em: null,
        importada: false,
        criado_em: "2026-10-01T12:00:00Z",
      },
    ],
    leads_eventos: [
      { id: "e-1", lead_id: DA_ANA, tipo: "entrada", de: null, para: "novo", autor: null, automatico: true, detalhe: { canal: "PDP", interesse: "Onix 2020" }, criado_em: "2026-09-25T12:00:00Z" },
      { id: "e-2", lead_id: DA_ANA, tipo: "etapa", de: "novo", para: "proposta", autor: "Ana", automatico: false, detalhe: null, criado_em: "2026-09-26T12:00:00Z" },
      { id: "e-b", lead_id: DA_BIA, tipo: "responsavel", de: null, para: "Bia", autor: "Dono", automatico: false, detalhe: null, criado_em: "2026-09-22T13:00:00Z" },
    ],
    atendimentos: [
      { lead_id: DA_ANA, chatwoot_conversation_id: 4821, com_assistente: false, humano_assumiu_em: null, iniciado_em: "2026-09-25T12:05:00", created_at: "2026-09-25T12:05:00", tags: ["quer-comprar"] },
    ],
    funil_etapas: ETAPAS_PADRAO.map((e) => ({ ...e, ...(e.chave === "visita" ? { rotulo: "Visita agendada" } : {}) })),
    funil_motivos: [
      { chave: "preco", rotulo: "Preço acima do que o cliente queria pagar", tipo: "perdido", ordem: 1, ativo: true },
      { chave: "antigo", rotulo: "Motivo antigo", tipo: "perdido", ordem: 2, ativo: false },
    ],
    estoque_motors: [
      { id: 8203724, marca: "Chevrolet", modelo: "Onix", versao: "LT 1.0", ano: 2020, quilometragem: 45000, preco: 62900, vendido: false },
    ],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pedido = (metodo: string, corpo?: unknown) =>
  new Request("http://x/api/leads/x", {
    method: metodo,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }),
  }) as never;

const PASSO = { proximo_passo: "Ligar de novo", proximo_passo_vence_em: "2026-10-04T10:00:00-03:00" };

/** As quatro rotas de `/api/leads/[id]`, com um pedido que valeria. */
const ROTAS: Array<[string, (id: string) => Promise<Response>]> = [
  ["GET detalhe", (id) => detalhe.GET(pedido("GET"), ctx(id))],
  ["POST interacoes", (id) => interacoes.POST(pedido("POST", { tipo: "nota", texto: "Liguei", ...PASSO }), ctx(id))],
  ["POST chegou", (id) => chegou.POST(pedido("POST", {}), ctx(id))],
  ["PATCH dados", (id) => dados.PATCH(pedido("PATCH", { faixa_entrada: "ate_5k" }), ctx(id))],
];

/** Nada foi lido do histórico, nada foi gravado, a função não foi chamada. */
function esperarNadaAlemDaGuarda(caso: string) {
  expect(rpcs, caso).toEqual([]);
  expect(linhaDoTempo.filter((x) => x.startsWith("update")), caso).toEqual([]);
  expect(linhaDoTempo, caso).not.toContain("select leads_interacoes");
  expect(linhaDoTempo, caso).not.toContain("select leads_eventos");
  expect(linhaDoTempo, caso).not.toContain("select atendimentos");
  expect(linhaDoTempo, caso).not.toContain("select estoque_motors");
}

function esperarSemPessoa(corpo: unknown, caso: string) {
  const texto = JSON.stringify(corpo);
  for (const dado of PESSOAL) expect(texto, `${caso}: ${dado}`).not.toContain(dado);
}

// ----------------------------------------------------------------------------
// O escopo, nas quatro rotas e nos dois bancos
// ----------------------------------------------------------------------------

describe.each([
  ["RLS de leads aberta à equipe (produção hoje)", false],
  ["RLS de leads fechada por escopo (20261003130000)", true],
])("o escopo nas rotas de /api/leads/[id] — %s", (_nome, fechada) => {
  beforeEach(() => {
    rlsPorEscopo = fechada;
  });

  it("sem sessão: 401, sem leitura nenhuma", async () => {
    usuario = null;
    for (const [rota, chamar] of ROTAS) {
      const r = await chamar(DA_ANA);
      expect(r.status, rota).toBe(401);
      expect(await r.json(), rota).toEqual({ error: "Não autorizado" });
    }
    expect(linhaDoTempo).toEqual([]);
  });

  it("Marketing e Financeiro: 403, e a tabela de leads nem é lida", async () => {
    for (const quem of ["u-mkt", "u-fin"]) {
      usuario = quem;
      for (const [rota, chamar] of ROTAS) {
        const caso = `${quem} em ${rota}`;
        const r = await chamar(DA_ANA);
        expect(r.status, caso).toBe(403);
        const corpo = await r.json();
        expect(corpo, caso).toEqual({ error: "Seu perfil não vê leads" });
        esperarSemPessoa(corpo, caso);
      }
    }
    expect(linhaDoTempo.filter((x) => x !== "select profiles")).toEqual([]);
  });

  it("perfil desativado: sem acesso, mesmo tendo sido Admin e Comercial", async () => {
    usuario = "u-saiu";
    for (const [rota, chamar] of ROTAS) {
      const r = await chamar(DA_ANA);
      expect(r.status, rota).toBe(403);
      const corpo = await r.json();
      expect(corpo, rota).toEqual({ error: "Acesso restrito à equipe" });
      esperarSemPessoa(corpo, rota);
    }
    expect(linhaDoTempo.filter((x) => x !== "select profiles")).toEqual([]);
  });

  it("cliente da Garagem (authenticated, fora da equipe): 403", async () => {
    usuario = "u-cliente";
    for (const [rota, chamar] of ROTAS) {
      const r = await chamar(DA_ANA);
      expect(r.status, rota).toBe(403);
    }
    expect(linhaDoTempo.filter((x) => x !== "select profiles")).toEqual([]);
  });

  it("vendedor no lead do colega: 404 'Lead não encontrado', antes do histórico e da função", async () => {
    for (const [rota, chamar] of ROTAS) {
      linhaDoTempo = [];
      const r = await chamar(DA_BIA);
      expect(r.status, rota).toBe(404);
      const corpo = await r.json();
      expect(corpo, rota).toEqual({ error: "Lead não encontrado" });
      esperarSemPessoa(corpo, rota);
      esperarNadaAlemDaGuarda(rota);
    }
    // E o lead da Bia ficou como estava.
    const daBia = banco.leads.find((l) => l.id === DA_BIA);
    expect(daBia).toMatchObject({ situacao: "proposta", proximo_passo: null, faixa_entrada: null });
    expect(banco.leads_interacoes.filter((i) => i.lead_id === DA_BIA)).toHaveLength(1);
  });

  it("Gestor e SDR no lead sem responsável: 404, igual", async () => {
    for (const quem of ["u-gestor", "u-sdr"]) {
      usuario = quem;
      for (const [rota, chamar] of ROTAS) {
        linhaDoTempo = [];
        const caso = `${quem} em ${rota}`;
        const r = await chamar(SEM_DONO);
        expect(r.status, caso).toBe(404);
        expect(await r.json(), caso).toEqual({ error: "Lead não encontrado" });
        esperarNadaAlemDaGuarda(caso);
      }
    }
    expect(banco.leads.find((l) => l.id === SEM_DONO)).toMatchObject({ situacao: "novo", proximo_passo: null });
  });

  it("vendedor no lead sem responsável: 404", async () => {
    for (const [rota, chamar] of ROTAS) {
      const r = await chamar(SEM_DONO);
      expect(r.status, rota).toBe(404);
    }
    expect(rpcs).toEqual([]);
  });

  it("lead que não existe, e id que nem UUID é: o mesmo 404, sem tocar no histórico", async () => {
    usuario = "u-admin";
    for (const id of [INEXISTENTE, "lead-1", "1 or 1=1", ""]) {
      for (const [rota, chamar] of ROTAS) {
        linhaDoTempo = [];
        const caso = `${rota} com "${id}"`;
        const r = await chamar(id);
        expect(r.status, caso).toBe(404);
        expect(await r.json(), caso).toEqual({ error: "Lead não encontrado" });
        esperarNadaAlemDaGuarda(caso);
      }
    }
  });

  it("quem enxerga, alcança: o vendedor no dele, Gestor e SDR nos designados, o Admin em todos", async () => {
    const casos: Array<[string, string]> = [
      ["u-ana", DA_ANA],
      ["u-gestor", DA_BIA],
      ["u-sdr", DA_ANA],
      ["u-admin", SEM_DONO],
      ["u-admin", DA_BIA],
    ];
    for (const [quem, id] of casos) {
      usuario = quem;
      for (const [rota, chamar] of ROTAS) {
        const r = await chamar(id);
        expect(r.status, `${quem} em ${rota}`).toBe(200);
      }
    }
  });

  it("a guarda vem ANTES: o lead é lido, e só depois o histórico ou a função", async () => {
    for (const [rota, chamar] of ROTAS) {
      linhaDoTempo = [];
      expect((await chamar(DA_ANA)).status, rota).toBe(200);
      const guarda = linhaDoTempo.indexOf("select leads");
      expect(guarda, rota).toBeGreaterThan(-1);
      for (const depois of ["select leads_interacoes", "select leads_eventos", "rpc registrar_interacao_do_lead", "update leads"]) {
        const quando = linhaDoTempo.indexOf(depois);
        if (quando !== -1) expect(quando, `${rota}: ${depois}`).toBeGreaterThan(guarda);
      }
    }
  });

  it("leitura do lead que falha é 500 com o erro, e não 'lead não encontrado'", async () => {
    falhas.leads = { message: "banco fora do ar" };
    for (const [rota, chamar] of ROTAS) {
      const r = await chamar(DA_ANA);
      expect(r.status, rota).toBe(500);
      expect(await r.json(), rota).toEqual({ error: "banco fora do ar" });
    }
    expect(rpcs).toEqual([]);
  });

  it("nenhuma destas rotas usa a chave de serviço", async () => {
    for (const [, chamar] of ROTAS) await chamar(DA_ANA);
    expect(SERVICO.from).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// GET /api/leads/[id]
// ----------------------------------------------------------------------------

describe("GET /api/leads/[id] — o detalhe", () => {
  const ler = async (id: string) => {
    const r = await detalhe.GET(pedido("GET"), ctx(id));
    return { status: r.status, d: await r.json() };
  };

  it("o lead, com a conversa, as etiquetas, a referência e o que a fila já entrega", async () => {
    const { status, d } = await ler(DA_ANA);
    expect(status).toBe(200);
    expect(d.lead).toMatchObject({
      id: DA_ANA,
      nome: "Joana",
      telefone: "5541991176299",
      interesse: "Onix 2020",
      canal: "PDP",
      situacao: "proposta",
      responsavel: "Ana",
      transferencias: 3,
      ref: "0DCB1CDC",
      utm_campaign: "Seminovos Outubro",
      chatwoot_conversation_id: 4821,
      com_assistente: false,
      humano_assumiu_em: null,
      etiquetas: ["quer-comprar"],
      carro_na_troca: null,
      faixa_entrada: null,
      pagamento_pretendido: null,
    });
    expect(d.etapa).toEqual({ chave: "proposta", rotulo: "Proposta", tipo: "aberta" });
    expect(d.aberto).toBe(true);
    expect(d.avisos).toEqual([]);
    expect(d.escopo).toBe("meus");
    expect(d.podeRemoverResponsavel).toBe(false);
  });

  it("o próximo passo, com quem definiu e a situação no relógio da loja", async () => {
    const { d } = await ler(DA_ANA);
    expect(d.passo).toEqual({
      texto: "Cobrar retorno da proposta",
      vence_em: "2026-10-03T19:30:00Z",
      definido_em: "2026-10-02T12:00:00Z",
      definido_por: "Ana",
      situacao: "hoje",
      rotulo: "HOJE · 16:30",
    });
    expect((await ler(DA_ANA_2)).d.passo).toBeNull();
  });

  it("a estagnação, pela régua do card: parado desde o último toque", async () => {
    banco.funil_etapas.find((e) => e.chave === "proposta")!.estagnacao_minutos = 2880;
    banco.leads.find((l) => l.id === DA_ANA)!.ultimo_contato_em = "2026-09-30T15:00:00Z";
    const { d } = await ler(DA_ANA);
    // Três dias parado contra dois de prazo.
    expect(d.estagnacao).toEqual({ nivel: "estagnado", minutos_parado: 4320, parado_desde: "2026-09-30T15:00:00.000Z" });
    // Com o assistente na conversa, o relógio não corre.
    banco.atendimentos[0].com_assistente = true;
    expect((await ler(DA_ANA)).d.estagnacao).toMatchObject({ nivel: "ok", minutos_parado: 0 });
  });

  it("o histórico unificado, do mais novo para o mais antigo, com as frases do rastro", async () => {
    const { d } = await ler(DA_ANA);
    expect(d.historico.map((i: Linha) => [i.id, i.origem])).toEqual([
      ["interacao:i-1", "humana"],
      ["interacao:i-0", "humana"],
      ["evento:e-2", "sistema"],
      ["evento:e-1", "sistema"],
    ]);
    expect(d.historico[0]).toMatchObject({
      tipo: "whatsapp",
      rotulo: "WhatsApp",
      autor: "Ana",
      texto: "pediu fotos do interior",
      proximoPasso: { texto: "Cobrar retorno da proposta", vence_em: "2026-10-03T19:30:00Z" },
    });
    expect(d.historico[1]).toMatchObject({ rotulo: "Ligação", texto: "Não atendeu", resultado: "nao_atendeu" });
    expect(d.historico[2].texto).toBe("Movido de Novo para Proposta.");
    expect(d.historico[3]).toMatchObject({ autor: "Sistema", texto: "Lead recebido na etapa Novo, pelo canal PDP. Interesse: Onix 2020." });
    // Nada do lead da Bia.
    expect(JSON.stringify(d)).not.toContain("achou caro");
    expect(JSON.stringify(d.historico)).not.toContain("Bia");
  });

  it("o desfecho no histórico usa o nome do motivo, mesmo o desativado", async () => {
    banco.leads_eventos.push({
      id: "e-f", lead_id: FECHADO, tipo: "desfecho", de: null, para: "perdido", autor: "Ana", automatico: false,
      detalhe: { motivo: "antigo", valor: null, nota: null }, criado_em: "2026-09-12T12:00:00Z",
    });
    const { d } = await ler(FECHADO);
    expect(d.historico[0].texto).toBe("Fechado como Perdido. Motivo: Motivo antigo.");
    // A caixa de desfecho só oferece os ativos.
    expect(d.motivos.map((m: Linha) => m.chave)).toEqual(["preco"]);
  });

  it("as duas sugestões da etapa, com a data calculada", async () => {
    const { d } = await ler(DA_ANA);
    expect(d.sugestoes).toEqual([
      { texto: "Cobrar retorno da proposta", quando: "amanhã 10:00", vence_em: "2026-10-04T13:00:00.000Z" },
      { texto: "Enviar simulação de financiamento", quando: "hoje 17:00", vence_em: "2026-10-03T20:00:00.000Z" },
    ]);
  });

  it("o carro de interesse vem do estoque: nome, km e preço", async () => {
    const { d } = await ler(DA_ANA);
    expect(d.veiculo).toEqual({ id: 8203724, nome: "Chevrolet Onix LT 1.0 2020", km: 45000, preco: 62900, vendido: false });
    expect((await ler(DA_ANA_2)).d.veiculo).toBeNull();
  });

  it("carro que saiu do estoque: sem vínculo para mostrar, e o lead continua vindo", async () => {
    banco.estoque_motors = [];
    const { status, d } = await ler(DA_ANA);
    expect(status).toBe(200);
    expect(d.veiculo).toBeNull();
    expect(d.lead.veiculo_id).toBe(8203724);
  });

  it("os vizinhos são os da MESMA coluna, no escopo de quem pede, na ordem do quadro", async () => {
    // A coluna Proposta, do mais novo para o mais antigo: Joana (25/09),
    // Marcos, da Bia (22/09), Paulo (20/09). A Ana não vê o Marcos.
    expect((await ler(DA_ANA)).d.vizinhos).toEqual({ anterior: null, proximo: DA_ANA_2 });
    expect((await ler(DA_ANA_2)).d.vizinhos).toEqual({ anterior: DA_ANA, proximo: null });

    usuario = "u-admin";
    expect((await ler(DA_ANA)).d.vizinhos).toEqual({ anterior: null, proximo: DA_BIA });
    expect((await ler(DA_BIA)).d.vizinhos).toEqual({ anterior: DA_ANA, proximo: DA_ANA_2 });
    // Outra coluna, sozinho nela.
    expect((await ler(SEM_DONO)).d.vizinhos).toEqual({ anterior: null, proximo: null });
    expect((await ler(DA_ANA)).d).toMatchObject({ escopo: "todos", podeRemoverResponsavel: true });
  });

  it("lead fechado: fora de coluna, sem vizinhos e sem sugestão de próximo passo", async () => {
    const { d } = await ler(FECHADO);
    expect(d.aberto).toBe(false);
    expect(d.vizinhos).toEqual({ anterior: null, proximo: null });
    expect(d.sugestoes).toEqual([]);
    expect(d.estagnacao.nivel).toBe("ok");
    expect(d.etapa).toEqual({ chave: "perdido", rotulo: "Perdido", tipo: "perdido" });
  });

  it("traz o que o cabeçalho precisa: etapas em ordem, motivos ativos e quem recebe lead", async () => {
    const { d } = await ler(DA_ANA);
    expect(d.etapas.map((e: Linha) => e.chave)).toEqual(ETAPAS_PADRAO.map((e) => e.chave));
    expect(d.atendentes).toEqual([{ nome: "Ana" }, { nome: "Bia" }]);
    expect(d.funilPendente).toBe(false);
  });

  it("histórico ilegível não derruba o detalhe: o lead vem, e a falha vem em `avisos`", async () => {
    falhas.leads_interacoes = { message: "tempo esgotado" };
    falhas.leads_eventos = { message: "tempo esgotado" };
    const { status, d } = await ler(DA_ANA);
    expect(status).toBe(200);
    expect(d.lead.nome).toBe("Joana");
    expect(d.historico).toEqual([]);
    expect(d.avisos).toEqual([
      "Não deu para ler os registros deste lead: tempo esgotado",
      "Não deu para ler o rastro deste lead: tempo esgotado",
    ]);
  });

  it("sem a tabela do funil (migração pendente): o funil fixo, e a resposta diz", async () => {
    falhas.funil_etapas = { code: "PGRST205", message: "sem tabela" };
    const { d } = await ler(DA_ANA);
    expect(d.funilPendente).toBe(true);
    expect(d.etapa).toEqual({ chave: "proposta", rotulo: "Proposta", tipo: "aberta" });
    expect(d.avisos).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// POST /api/leads/[id]/interacoes
// ----------------------------------------------------------------------------

describe("POST /api/leads/[id]/interacoes", () => {
  const registrar = async (id: string, corpo: unknown) => {
    const r = await interacoes.POST(pedido("POST", corpo), ctx(id));
    return { status: r.status, d: await r.json() };
  };

  it("grava pela função, com os argumentos que ela espera, e devolve o lead e o item novo", async () => {
    const { status, d } = await registrar(DA_ANA, { tipo: "ligacao", resultado: "atendeu", texto: " Vem amanhã ", ...PASSO });
    expect(status).toBe(200);
    expect(rpcs).toEqual([
      {
        nome: "registrar_interacao_do_lead",
        args: {
          p_lead: DA_ANA,
          p_tipo: "ligacao",
          p_resultado: "atendeu",
          p_texto: "Vem amanhã",
          p_passo: "Ligar de novo",
          p_vence_em: "2026-10-04T13:00:00.000Z",
        },
      },
    ]);
    expect(d).toEqual({
      ok: true,
      interacao_id: "int-1",
      lead: {
        id: DA_ANA,
        situacao: "proposta",
        responsavel: "Ana",
        desfecho: null,
        proximo_passo: "Ligar de novo",
        proximo_passo_vence_em: "2026-10-04T13:00:00.000Z",
        proximo_passo_definido_em: AGORA.toISOString(),
        proximo_passo_definido_por: "Ana",
        ultimo_contato_em: AGORA.toISOString(),
        ultimo_movimento_em: "2026-09-25T12:00:00Z",
        ultima_interacao: { tipo: "ligacao", quando: AGORA.toISOString(), texto: "Vem amanhã", autor: "Ana" },
      },
      item: {
        id: "interacao:int-1",
        origem: "humana",
        tipo: "ligacao",
        rotulo: "Ligação",
        autor: "Ana",
        quando: AGORA.toISOString(),
        texto: "Vem amanhã",
        resultado: "atendeu",
        proximoPasso: { texto: "Ligar de novo", vence_em: "2026-10-04T13:00:00.000Z" },
      },
    });
  });

  it("lead aberto sem próximo passo: 400 com `proximo_passo_obrigatorio`, e a função não é chamada", async () => {
    for (const corpo of [
      { tipo: "nota", texto: "Liguei" },
      { tipo: "nota", texto: "Liguei", proximo_passo: "Ligar de novo" },
      { tipo: "nota", texto: "Liguei", proximo_passo_vence_em: PASSO.proximo_passo_vence_em },
    ]) {
      const { status, d } = await registrar(DA_ANA, corpo);
      expect(status, JSON.stringify(corpo)).toBe(400);
      expect(d.codigo, JSON.stringify(corpo)).toBe("proximo_passo_obrigatorio");
      expect(d.error).toMatch(/próximo passo/);
    }
    expect(rpcs).toEqual([]);
  });

  it("lead fechado dispensa o próximo passo", async () => {
    const { status, d } = await registrar(FECHADO, { tipo: "nota", texto: "Cliente voltou a perguntar" });
    expect(status).toBe(200);
    expect(rpcs[0].args).toMatchObject({ p_passo: null, p_vence_em: null });
    expect(d.item.proximoPasso).toBeUndefined();
  });

  it("os outros códigos de validação, todos 400 e todos antes da função", async () => {
    const casos: Array<[unknown, string]> = [
      [{ tipo: "email", texto: "x", ...PASSO }, "tipo_invalido"],
      [null, "tipo_invalido"],
      [{ tipo: "nota", texto: "x", resultado: "atendeu", ...PASSO }, "resultado_invalido"],
      [{ tipo: "ligacao", resultado: "ocupado", ...PASSO }, "resultado_invalido"],
      [{ tipo: "whatsapp", texto: "  ", ...PASSO }, "interacao_vazia"],
      [{ tipo: "ligacao", ...PASSO }, "interacao_vazia"],
      [{ tipo: "nota", texto: "x", proximo_passo: "Ligar", proximo_passo_vence_em: "2026-10-04T10:00" }, "data_invalida"],
    ];
    for (const [corpo, codigo] of casos) {
      const { status, d } = await registrar(DA_ANA, corpo);
      expect(status, codigo).toBe(400);
      expect(d.codigo, JSON.stringify(corpo)).toBe(codigo);
      expect(typeof d.error).toBe("string");
    }
    const fechado = await registrar(FECHADO, { tipo: "nota", texto: "x", proximo_passo: "Ligar" });
    expect(fechado).toMatchObject({ status: 400, d: { codigo: "proximo_passo_incompleto" } });
    expect(rpcs).toEqual([]);
  });

  it("corpo inválido não fura a guarda: fora do escopo é 404, e não o 400 da validação", async () => {
    const { status } = await registrar(DA_BIA, { tipo: "email" });
    expect(status).toBe(404);
  });

  it("o erro da função vira resposta: lead apagado no meio, função ausente, sessão fora da equipe", async () => {
    const casos: Array<[Erro, number, string]> = [
      [{ code: "P0002", message: "LEAD_NAO_ENCONTRADO" }, 404, "Lead não encontrado"],
      [{ code: "42501", message: "Registrar interação é restrito à equipe." }, 403, "Acesso restrito à equipe"],
      [{ code: "23514", message: "O próximo passo precisa de texto e de data, juntos." }, 400, "O próximo passo precisa de texto e de data, juntos."],
      [{ code: "XX000", message: "erro interno" }, 500, "erro interno"],
    ];
    for (const [erro, status, mensagem] of casos) {
      erroDoRpc = erro;
      const r = await registrar(DA_ANA, { tipo: "nota", texto: "x", ...PASSO });
      expect(r.status, erro.code).toBe(status);
      expect(r.d.error, erro.code).toBe(mensagem);
    }
    erroDoRpc = { code: "PGRST202", message: "Could not find the function" };
    const r = await registrar(DA_ANA, { tipo: "nota", texto: "x", ...PASSO });
    expect(r.status).toBe(503);
    expect(r.d.error).toContain("20260923150000_gestao_do_lead.sql");
  });

  it("gravou e não deu para reler: 200 com aviso, e não erro por uma escrita que valeu", async () => {
    falhas.leads_interacoes = { message: "tempo esgotado" };
    const { status, d } = await registrar(DA_ANA, { tipo: "nota", texto: "x", ...PASSO });
    expect(status).toBe(200);
    expect(d).toEqual({
      ok: true,
      interacao_id: "int-1",
      lead: null,
      item: null,
      aviso: "O registro foi gravado, mas não deu para reler o lead. Abra o lead de novo para ver como ficou.",
    });
  });

  it("o Admin registra no lead sem responsável, e o Gestor no lead de qualquer vendedor", async () => {
    usuario = "u-admin";
    expect((await registrar(SEM_DONO, { tipo: "nota", texto: "x", ...PASSO })).status).toBe(200);
    usuario = "u-gestor";
    const r = await registrar(DA_BIA, { tipo: "nota", texto: "x", ...PASSO });
    expect(r.status).toBe(200);
    expect(r.d.item.autor).toBe("Gil");
  });
});

// ----------------------------------------------------------------------------
// POST /api/leads/[id]/chegou
// ----------------------------------------------------------------------------

describe("POST /api/leads/[id]/chegou", () => {
  const chegar = async (id: string, corpo: unknown = {}) => {
    const r = await chegou.POST(pedido("POST", corpo), ctx(id));
    return { status: r.status, d: await r.json() };
  };

  it("registra a visita, define 'Atender na loja' para agora e move para a etapa de visita", async () => {
    const { status, d } = await chegar(DA_ANA);
    expect(status).toBe(200);
    expect(rpcs).toEqual([
      {
        nome: "registrar_interacao_do_lead",
        args: {
          p_lead: DA_ANA,
          p_tipo: "visita",
          p_resultado: null,
          p_texto: "Chegou na loja.",
          p_passo: "Atender na loja",
          p_vence_em: AGORA.toISOString(),
        },
      },
    ]);
    expect(linhaDoTempo.filter((x) => x.startsWith("rpc") || x.startsWith("update"))).toEqual([
      "rpc registrar_interacao_do_lead",
      "update leads",
    ]);
    expect(banco.leads.find((l) => l.id === DA_ANA)).toMatchObject({
      situacao: "visita",
      proximo_passo: "Atender na loja",
      proximo_passo_vence_em: AGORA.toISOString(),
    });
    expect(d).toMatchObject({
      ok: true,
      movido: true,
      situacao: "visita",
      responsavel_avisado: false,
      lead: { id: DA_ANA, situacao: "visita", proximo_passo: "Atender na loja" },
      item: { tipo: "visita", rotulo: "Visita à loja", autor: "Ana", texto: "Chegou na loja.", proximoPasso: { texto: "Atender na loja" } },
    });
  });

  it("não afirma que o responsável foi avisado: nem na resposta, nem no histórico", async () => {
    const { d } = await chegar(DA_ANA);
    expect(d.responsavel_avisado).toBe(false);
    expect(JSON.stringify(d)).not.toMatch(/avisado no|WhatsApp/i);

    const r = await detalhe.GET(pedido("GET"), ctx(DA_ANA));
    const { historico, passo } = await r.json();
    // O registro do vendedor e o movimento que o gatilho anotou, e só.
    expect(historico.slice(0, 2).map((i: Linha) => i.texto)).toEqual([
      "Chegou na loja.",
      "Movido de Proposta para Visita agendada.",
    ]);
    for (const item of historico) expect(item.texto).not.toMatch(/avisad/i);
    // Na tela, o passo que acabou de vencer se lê "Agora".
    expect(passo).toMatchObject({ texto: "Atender na loja", situacao: "hoje", rotulo: "AGORA" });
  });

  it("o texto de quem atendeu no balcão entra no registro", async () => {
    await chegar(DA_ANA, { texto: " Veio com a esposa " });
    expect(rpcs[0].args.p_texto).toBe("Veio com a esposa");
  });

  it("só move para FRENTE: quem já está na visita ou na negociação não volta de etapa", async () => {
    const { status, d } = await chegar(NEGOCIANDO);
    expect(status).toBe(200);
    expect(d).toMatchObject({ movido: false, situacao: "negociacao" });
    expect(rpcs).toHaveLength(1);
    expect(linhaDoTempo).not.toContain("update leads");
    expect(banco.leads.find((l) => l.id === NEGOCIANDO)).toMatchObject({ situacao: "negociacao", proximo_passo: "Atender na loja" });

    banco.leads.find((l) => l.id === DA_ANA_2)!.situacao = "visita";
    expect((await chegar(DA_ANA_2)).d).toMatchObject({ movido: false, situacao: "visita" });
    expect(linhaDoTempo).not.toContain("update leads");
  });

  it("lead fechado: 409 `lead_fechado`, sem registro e sem movimento (mover reabriria o negócio)", async () => {
    const { status, d } = await chegar(FECHADO);
    expect(status).toBe(409);
    expect(d.codigo).toBe("lead_fechado");
    expect(rpcs).toEqual([]);
    expect(linhaDoTempo).not.toContain("update leads");
    expect(banco.leads.find((l) => l.id === FECHADO)).toMatchObject({ situacao: "perdido", desfecho: "perdido" });
  });

  it("etapa de visita desativada, virada em desfecho ou ausente: 422, e nada é gravado", async () => {
    const visita = banco.funil_etapas.find((e) => e.chave === "visita")!;
    for (const estrago of [{ ativa: false }, { tipo: "ganho" }]) {
      Object.assign(visita, { ativa: true, tipo: "aberta" }, estrago);
      const { status, d } = await chegar(DA_ANA);
      expect(status, JSON.stringify(estrago)).toBe(422);
      expect(d.codigo).toBe("etapa_de_visita_ausente");
    }
    banco.funil_etapas = banco.funil_etapas.filter((e) => e.chave !== "visita");
    expect((await chegar(DA_ANA)).status).toBe(422);
    expect(rpcs).toEqual([]);
    expect(banco.leads.find((l) => l.id === DA_ANA)!.situacao).toBe("proposta");
  });

  it("o movimento falhou depois da visita registrada: 500 `movimento_falhou`, dizendo o que ficou", async () => {
    falhasAoGravar.leads = { message: "tempo esgotado" };
    const { status, d } = await chegar(DA_ANA);
    expect(status).toBe(500);
    expect(d.codigo).toBe("movimento_falhou");
    expect(d.error).toBe(
      'A visita foi registrada, mas não deu para mover o lead para "Visita agendada": tempo esgotado Mova o card pelo quadro.',
    );
    expect(d.interacao_id).toBe("int-1");
    expect(banco.leads_interacoes.at(-1)).toMatchObject({ lead_id: DA_ANA, tipo: "visita" });
  });

  it("o lead trocou de dono entre a guarda e o movimento: o update com escopo não o alcança, e a rota diz", async () => {
    antesDeGravarLead = () => {
      banco.leads.find((l) => l.id === DA_ANA)!.responsavel = "Bia";
    };
    const { status, d } = await chegar(DA_ANA);
    expect(status).toBe(500);
    expect(d.codigo).toBe("movimento_falhou");
    expect(banco.leads.find((l) => l.id === DA_ANA)!.situacao).toBe("proposta");
  });

  it("erro da função: nada é movido", async () => {
    erroDoRpc = { code: "XX000", message: "erro interno" };
    const { status, d } = await chegar(DA_ANA);
    expect(status).toBe(500);
    expect(d).toEqual({ error: "erro interno" });
    expect(linhaDoTempo).not.toContain("update leads");
  });
});

// ----------------------------------------------------------------------------
// PATCH /api/leads/[id]/dados
// ----------------------------------------------------------------------------

describe("PATCH /api/leads/[id]/dados", () => {
  const gravar = async (id: string, corpo: unknown) => {
    const r = await dados.PATCH(pedido("PATCH", corpo), ctx(id));
    return { status: r.status, d: await r.json() };
  };

  it("grava os dados do negócio e devolve como ficaram", async () => {
    const { status, d } = await gravar(DA_ANA, {
      carro_na_troca: " Gol 2015 ",
      faixa_entrada: "de_10k_a_20k",
      pagamento_pretendido: "com_troca",
      email: "joana@exemplo.com",
    });
    expect(status).toBe(200);
    expect(d).toEqual({
      ok: true,
      dados: {
        id: DA_ANA,
        carro_na_troca: "Gol 2015",
        faixa_entrada: "de_10k_a_20k",
        pagamento_pretendido: "com_troca",
        email: "joana@exemplo.com",
        veiculo_id: 8203724,
      },
    });
    expect(banco.leads.find((l) => l.id === DA_ANA)).toMatchObject({
      carro_na_troca: "Gol 2015",
      faixa_entrada: "de_10k_a_20k",
      pagamento_pretendido: "com_troca",
      email: "joana@exemplo.com",
      // O que não veio não muda.
      veiculo_id: 8203724,
      responsavel: "Ana",
      situacao: "proposta",
    });
  });

  it("nulo limpa; o que não veio fica", async () => {
    Object.assign(banco.leads.find((l) => l.id === DA_ANA)!, { faixa_entrada: "ate_5k", carro_na_troca: "Gol" });
    expect((await gravar(DA_ANA, { faixa_entrada: null, veiculo_id: null })).status).toBe(200);
    expect(banco.leads.find((l) => l.id === DA_ANA)).toMatchObject({ faixa_entrada: null, veiculo_id: null, carro_na_troca: "Gol" });
  });

  it("campo fora da lista é recusado, e NADA do pedido é gravado", async () => {
    for (const campo of ["responsavel", "situacao", "desfecho", "nome", "telefone", "proximo_passo"]) {
      const { status, d } = await gravar(DA_ANA, { faixa_entrada: "ate_5k", [campo]: null });
      expect(status, campo).toBe(400);
      expect(d.codigo, campo).toBe("campo_desconhecido");
    }
    expect(linhaDoTempo).not.toContain("update leads");
    expect(banco.leads.find((l) => l.id === DA_ANA)).toMatchObject({ responsavel: "Ana", faixa_entrada: null });
  });

  it("os códigos de validação: valores fora das listas do banco, e corpo vazio", async () => {
    const casos: Array<[unknown, string]> = [
      [{ faixa_entrada: "ate_5mil" }, "faixa_entrada_invalida"],
      [{ pagamento_pretendido: "pix" }, "pagamento_pretendido_invalido"],
      [{ email: "joana" }, "email_invalido"],
      [{ veiculo_id: "abc" }, "veiculo_invalido"],
      [{}, "sem_campos"],
      ["não é json", "sem_campos"],
    ];
    for (const [corpo, codigo] of casos) {
      const { status, d } = await gravar(DA_ANA, corpo);
      expect(status, codigo).toBe(400);
      expect(d.codigo, codigo).toBe(codigo);
    }
    expect(linhaDoTempo).not.toContain("update leads");
  });

  it("o carro de interesse tem de estar no estoque: 422 `veiculo_desconhecido`", async () => {
    const { status, d } = await gravar(DA_ANA_2, { veiculo_id: 999 });
    expect(status).toBe(422);
    expect(d).toEqual({ error: "Este carro não está no estoque.", codigo: "veiculo_desconhecido" });
    expect(linhaDoTempo).not.toContain("update leads");

    expect((await gravar(DA_ANA_2, { veiculo_id: 8203724 })).status).toBe(200);
    expect(banco.leads.find((l) => l.id === DA_ANA_2)!.veiculo_id).toBe(8203724);
  });

  it("o escopo vale também na escrita: lead que trocou de dono depois da guarda não é gravado", async () => {
    antesDeGravarLead = () => {
      banco.leads.find((l) => l.id === DA_ANA)!.responsavel = "Bia";
    };
    const { status, d } = await gravar(DA_ANA, { faixa_entrada: "ate_5k" });
    expect(status).toBe(404);
    expect(d).toEqual({ error: "Lead não encontrado" });
    expect(banco.leads.find((l) => l.id === DA_ANA)!.faixa_entrada).toBeNull();
  });

  it("gravação que falha é 500 com o erro", async () => {
    falhasAoGravar.leads = { message: "violação de regra" };
    const { status, d } = await gravar(DA_ANA, { faixa_entrada: "ate_5k" });
    expect(status).toBe(500);
    expect(d).toEqual({ error: "violação de regra" });
  });
});

// ----------------------------------------------------------------------------
// GET /api/leads/gerenciar — o que o card novo e a busca única pedem
// ----------------------------------------------------------------------------

describe("GET /api/leads/gerenciar — a última interação e o próximo passo", () => {
  const fila = async (busca = "") => {
    const r = await gerenciar.GET(new Request(`http://x/api/leads/gerenciar${busca}`) as never);
    return { status: r.status, d: await r.json() };
  };
  const porId = (d: { leads: Linha[] }, id: string) => d.leads.find((l) => l.id === id)!;

  it("cada lead traz a última interação e o próximo passo; quem não tem, traz nulo", async () => {
    const { status, d } = await fila();
    expect(status).toBe(200);
    expect(porId(d, DA_ANA)).toMatchObject({
      ultima_interacao: { tipo: "whatsapp", quando: "2026-10-02T12:00:00Z", texto: "pediu fotos do interior", autor: "Ana" },
      proximo_passo: "Cobrar retorno da proposta",
      proximo_passo_vence_em: "2026-10-03T19:30:00Z",
    });
    expect(porId(d, DA_ANA_2)).toMatchObject({ ultima_interacao: null, proximo_passo: null, proximo_passo_vence_em: null });
    expect(d.avisos).toEqual([]);
  });

  it("UMA leitura de interações para a fila inteira, e só dos leads da resposta", async () => {
    usuario = "u-admin";
    const { d } = await fila();
    expect(d.leads).toHaveLength(6);
    expect(linhaDoTempo.filter((x) => x === "select leads_interacoes")).toHaveLength(1);
    expect(porId(d, DA_BIA).ultima_interacao).toMatchObject({ texto: "achou caro", autor: "Bia" });

    // O vendedor não recebe o registro do lead do colega.
    usuario = "u-ana";
    const daAna = (await fila()).d;
    expect(daAna.leads.map((l: Linha) => l.id)).not.toContain(DA_BIA);
    expect(JSON.stringify(daAna)).not.toContain("achou caro");
  });

  it("os campos de sempre continuam na resposta: o quadro de hoje segue funcionando", async () => {
    const { d } = await fila();
    for (const campo of ["leads", "escopo", "atendentes", "etapas", "motivos", "funilPendente", "podeConfigurar", "busca", "etiquetasDisponiveis", "etiquetasEditaveis"]) {
      expect(d, campo).toHaveProperty(campo);
    }
    expect(d.busca).toBeNull();
    expect(porId(d, DA_ANA)).toMatchObject({ chatwoot_conversation_id: 4821, com_assistente: false, etiquetas: ["quer-comprar"] });
  });

  it("interações ilegíveis não derrubam a fila: os leads vêm, e a resposta avisa", async () => {
    falhas.leads_interacoes = { message: "tempo esgotado" };
    const { status, d } = await fila();
    expect(status).toBe(200);
    expect(d.leads.length).toBeGreaterThan(0);
    expect(porId(d, DA_ANA).ultima_interacao).toBeNull();
    expect(d.avisos).toEqual(["Não deu para ler a última interação dos leads. O resto da fila está completo."]);
  });

  it("no teto de linhas, a resposta avisa que pode faltar a última interação de alguém", async () => {
    banco.leads_interacoes = Array.from({ length: 1000 }, (_, i) => ({
      id: `i-${i}`,
      lead_id: DA_ANA,
      tipo: "nota",
      texto: `nota ${i}`,
      autor: "Ana",
      criado_em: new Date(AGORA.getTime() - i * 60_000).toISOString(),
    }));
    const { d } = await fila();
    expect(porId(d, DA_ANA).ultima_interacao).toMatchObject({ texto: "nota 0" });
    expect(d.avisos).toEqual([
      "Há registros demais para ler de uma vez: a última interação de alguns leads pode não aparecer.",
    ]);
  });

  it("fila vazia não lê interações", async () => {
    usuario = "u-bia";
    banco.leads = banco.leads.filter((l) => l.responsavel !== "Bia");
    const { d } = await fila();
    expect(d.leads).toEqual([]);
    expect(linhaDoTempo).not.toContain("select leads_interacoes");
  });

  it("perfil desativado: 403, sem fila", async () => {
    usuario = "u-saiu";
    const { status, d } = await fila();
    expect(status).toBe(403);
    expect(d).toEqual({ error: "Acesso restrito à equipe" });
    expect(linhaDoTempo).not.toContain("select leads");
  });
});

describe("GET /api/leads/gerenciar?busca= — a busca única", () => {
  const buscar = async (termo: string) => {
    const r = await gerenciar.GET(new Request(`http://x/api/leads/gerenciar?busca=${encodeURIComponent(termo)}`) as never);
    const d = await r.json();
    return { status: r.status, d, ids: ((d.leads ?? []) as Linha[]).map((l) => l.id).sort() };
  };

  it("por nome: contém, sem distinguir caixa", async () => {
    const r = await buscar("joa");
    expect(r.status).toBe(200);
    expect(r.ids).toEqual([DA_ANA]);
    expect(r.d.busca).toEqual({ termo: "joa", tipo: "nome" });
    expect((await buscar("JOANA")).ids).toEqual([DA_ANA]);
  });

  it("por telefone: os dígitos contidos, como quer que tenham sido digitados", async () => {
    for (const termo of ["(41) 99117-6299", "+55 41 99117-6299", "6299", "99117"]) {
      const r = await buscar(termo);
      expect(r.ids, termo).toEqual([DA_ANA]);
      expect(r.d.busca.tipo, termo).toBe("telefone");
    }
  });

  it("por referência: os oito caracteres, ou a mensagem inteira do cliente", async () => {
    for (const termo of ["0dcb1cdc", "Olá! Tenho interesse no Onix. (Ref: 0DCB1CDC)"]) {
      const r = await buscar(termo);
      expect(r.ids, termo).toEqual([DA_ANA]);
      expect(r.d.busca, termo).toEqual({ termo, tipo: "ref", ref: "0DCB1CDC" });
    }
  });

  it("oito dígitos: acha pelo telefone E pela referência", async () => {
    usuario = "u-admin";
    // O fim de um telefone...
    banco.leads.find((l) => l.id === DA_BIA)!.telefone = "5541912345678";
    // ...e o começo de um rastreio.
    banco.leads.find((l) => l.id === SEM_DONO)!.ag_uid = "12345678-fb39-4a39-99c9-923f025619f4";
    const r = await buscar("12345678");
    expect(r.ids).toEqual([DA_BIA, SEM_DONO].sort());
    expect(r.d.busca.tipo).toBe("telefone");
  });

  it("obedece ao escopo: o vendedor não acha o lead do colega nem o sem responsável", async () => {
    expect((await buscar("Marcos")).ids).toEqual([]);
    expect((await buscar("8888-7777")).ids).toEqual([]);
    expect((await buscar("Rita")).ids).toEqual([]);

    usuario = "u-gestor";
    expect((await buscar("Marcos")).ids).toEqual([DA_BIA]);
    expect((await buscar("Rita")).ids).toEqual([]);

    usuario = "u-admin";
    expect((await buscar("Rita")).ids).toEqual([SEM_DONO]);
  });

  it("acha lead fechado também: a tela é que diz que ele está fora do quadro", async () => {
    expect((await buscar("Caio")).ids).toEqual([FECHADO]);
  });

  it("os curingas do termo são texto: '%' não lista a loja", async () => {
    usuario = "u-admin";
    expect((await buscar("%%")).ids).toEqual([]);
    expect((await buscar("J_ana")).ids).toEqual([]);
  });

  it("termo vazio ou curto demais: 400 `busca_invalida`, sem leitura de leads", async () => {
    for (const termo of ["", " ", "a", "12"]) {
      const r = await buscar(termo);
      expect(r.status, termo).toBe(400);
      expect(r.d.codigo, termo).toBe("busca_invalida");
    }
    expect(linhaDoTempo).not.toContain("select leads");
  });

  it("Marketing e Financeiro: 403, nem a contagem (ela diria se o cliente existe)", async () => {
    for (const quem of ["u-mkt", "u-fin"]) {
      usuario = quem;
      const r = await buscar("Joana");
      expect(r.status, quem).toBe(403);
      expect(r.d, quem).toEqual({ error: "Seu perfil não busca leads" });
    }
    expect(linhaDoTempo).not.toContain("select leads");
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("`?ref=` continua como era, e ganha do `?busca=` quando vêm os dois", async () => {
    const r = await gerenciar.GET(new Request("http://x/api/leads/gerenciar?ref=0DCB1CDC&busca=Paulo") as never);
    const d = await r.json();
    expect(d.leads.map((l: Linha) => l.id)).toEqual([DA_ANA]);
    expect(d.busca).toEqual({ ref: "0DCB1CDC" });
  });
});
