import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * As rotas dos veículos de interesse, EXECUTADAS (05/10/2026).
 *
 *   GET    /api/leads/[id]                       `veiculos`, `veiculos_disponivel`, `pendencias_de_veiculo`
 *   POST   /api/leads/[id]/veiculos              adicionar um carro
 *   PATCH  /api/leads/[id]/veiculos/[opcao]      resolver, reabrir, anotar, tornar principal
 *   DELETE /api/leads/[id]/veiculos/[opcao]      apagar (Admin)
 *   POST   /api/leads/[id]/veiculos/resolver     resolver em lote
 *   PATCH  /api/leads/[id]/dados                 o `veiculo_id` antigo, pelo caminho novo
 *   PATCH  /api/leads/gerenciar                  o ganho escolhe o carro único
 *   GET    /api/estoque/busca                    o seletor de carro
 *   GET    /api/estoque/[id]/interesse           o relatório de um carro
 *   GET    /api/estoque/interesse                o ranking
 *
 * O que se trava aqui:
 *   - o ESCOPO antes de tudo: o vendedor no lead do colega e o Gestor no lead
 *     sem responsável recebem 404 sem que `leads_veiculos` seja lida ou
 *     gravada; Marketing, 403; perfil desativado, 403. Com a RLS de `leads`
 *     aberta à equipe (produção hoje) e fechada por escopo;
 *   - a opção de OUTRO lead não é alcançada pelo id;
 *   - a tabela e as funções AUSENTES (o código vai ao ar antes da migração):
 *     o detalhe responde como sempre, as escritas dizem 503
 *     `veiculos_indisponivel`, os relatórios vêm vazios e o desfecho não trava;
 *   - o veículo principal (`leads.veiculo_id`) acompanha as opções;
 *   - a busca não deixa curinga nem vírgula virar filtro, e a placa sai só
 *     com os quatro últimos caracteres;
 *   - o relatório não leva lead, nome, telefone nem autor.
 *
 * Banco em memória. `leads_veiculos` se comporta como a migração 20261005120000
 * a escreve: o gatilho recusa carro que não existe e carimba autor, retrato e
 * resolução; as constraints e o índice único parcial recusam pelo nome.
 */

type Linha = Record<string, unknown>;
interface Erro {
  message: string;
  code?: string;
}

let banco: Record<string, Linha[]>;
/** Falha de leitura E de gravação, por tabela. */
let falhas: Record<string, Erro | undefined>;
/** Falha só de gravação, por tabela. */
let falhasAoGravar: Record<string, Erro | undefined>;
/** Falha de uma função (`rpc`), por nome. */
let falhasDoRpc: Record<string, Erro | undefined>;
let linhaDoTempo: string[];
/** O `select` de cada leitura, por tabela: o que a rota PEDIU ao banco. */
let colunasPedidas: Record<string, string[]>;
/** Cada `or(...)` que chegou ao banco. */
let filtrosOr: string[];
let usuario: string | null;
let rlsPorEscopo: boolean;
/** A view `estoque_motors_equipe` (20261001150000) existe? */
let viewDaEquipe: boolean;
let relogio: number;
let proximoId: number;

const { leadNoEscopo, visaoDeLeads } = await import("../src/lib/escopoDeLeads");

const quemPede = (): Linha | undefined => (banco.profiles ?? []).find((p) => p.id === usuario);
const ehEquipeAtiva = (): boolean => {
  const p = quemPede();
  return p?.is_active === true && (p.papeis as string[]).some((x) => x !== "cliente" && x !== "investidor");
};
const ehAdmin = (): boolean => ehEquipeAtiva() && (quemPede()!.papeis as string[]).includes("admin");

function leadsVisiveis(): Linha[] {
  if (!rlsPorEscopo) return ehEquipeAtiva() ? banco.leads : [];
  const p = quemPede();
  const visao = visaoDeLeads(p?.is_active === true ? (p.papeis as string[]) : [], p?.full_name as string);
  return banco.leads.filter((l) => leadNoEscopo(visao, l.responsavel as string | null));
}

/** O que a sessão alcança de cada tabela (a RLS). */
function alcance(tabela: string): Linha[] {
  if (tabela === "leads") return leadsVisiveis();
  if (tabela === "leads_veiculos") {
    const visiveis = new Set(leadsVisiveis().map((l) => l.id));
    return banco.leads_veiculos.filter((v) => visiveis.has(v.lead_id));
  }
  if (tabela === "estoque_motors_equipe") return ehEquipeAtiva() ? banco.estoque_motors : [];
  return banco[tabela] ?? [];
}

const agora = () => new Date(Date.UTC(2026, 9, 5, 12, 0, (relogio += 1))).toISOString();

const violou = (tipo: "check" | "unique", nome: string): Erro => ({
  code: tipo === "check" ? "23514" : "23505",
  message:
    tipo === "check"
      ? `new row for relation "leads_veiculos" violates check constraint "${nome}"`
      : `duplicate key value violates unique constraint "${nome}"`,
});

const MOTIVOS = ["preco", "parcela", "km", "ano_versao", "cor", "estado", "opcionais", "troca", "outro_da_loja", "comprou_fora", "desistiu", "vendido", "outro"];

/** As constraints e o índice único parcial de `leads_veiculos`. */
function regrasDaOpcao(nova: Linha, outras: Linha[]): Erro | null {
  if (!["em_avaliacao", "escolhido", "descartado"].includes(nova.situacao as string)) return violou("check", "leads_veiculos_situacao_valida");
  if (nova.motivo_descarte !== null && !MOTIVOS.includes(nova.motivo_descarte as string)) return violou("check", "leads_veiculos_motivo_valido");
  if ((nova.situacao === "descartado") !== (nova.motivo_descarte !== null)) return violou("check", "leads_veiculos_motivo_so_no_descarte");
  if (nova.motivo_descarte === "outro" && !String(nova.nota ?? "").trim()) return violou("check", "leads_veiculos_outro_pede_nota");
  if (outras.some((o) => o.lead_id === nova.lead_id && String(o.veiculo_id) === String(nova.veiculo_id))) {
    return violou("unique", "leads_veiculos_lead_veiculo_unico");
  }
  if (nova.situacao === "escolhido" && outras.some((o) => o.lead_id === nova.lead_id && o.situacao === "escolhido")) {
    return violou("unique", "leads_veiculos_um_escolhido_por_lead");
  }
  return null;
}

function consulta(tabela: string) {
  const filtros: Array<(l: Linha) => boolean> = [];
  let operacao: "select" | "insert" | "update" | "delete" = "select";
  let carga: Linha = {};
  let ordens: Array<{ coluna: string; crescente: boolean }> = [];
  let colunas = "*";
  let limite = Infinity;
  const recortar = (l: Linha): Linha =>
    colunas === "*" ? { ...l } : Object.fromEntries(colunas.split(",").map((c) => [c.trim(), l[c.trim()] ?? null]));

  const achadas = (): Linha[] => {
    let linhas = alcance(tabela).filter((l) => filtros.every((f) => f(l)));
    for (const { coluna, crescente } of [...ordens].reverse()) {
      const v = (l: Linha) => (typeof l[coluna] === "number" ? (l[coluna] as number) : String(l[coluna] ?? ""));
      linhas = [...linhas].sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * (crescente ? 1 : -1));
    }
    return linhas.slice(0, limite);
  };

  const existe = (): Erro | null => {
    if (tabela === "estoque_motors_equipe" && !viewDaEquipe) {
      return { code: "PGRST205", message: "Could not find the table 'public.estoque_motors_equipe' in the schema cache" };
    }
    return falhas[tabela] ?? null;
  };

  const executar = async (): Promise<{ data: Linha[] | null; error: Erro | null }> => {
    linhaDoTempo.push(`${operacao} ${tabela}`);
    const falha = existe() ?? (operacao === "select" ? null : (falhasAoGravar[tabela] ?? null));
    if (falha) return { data: null, error: falha };

    if (operacao === "select") {
      (colunasPedidas[tabela] ??= []).push(colunas);
      return { data: achadas().map(recortar), error: null };
    }

    if (operacao === "insert") {
      if (tabela !== "leads_veiculos") throw new Error(`insert em ${tabela}: o dublê não conhece`);
      // A policy de inclusão: só em lead que a sessão enxerga.
      if (!leadsVisiveis().some((l) => l.id === carga.lead_id)) {
        return { data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "leads_veiculos"' } };
      }
      // O gatilho: com sessão, só entra carro que existe; o retrato vem do estoque.
      const carro = banco.estoque_motors.find((e) => String(e.id) === String(carga.veiculo_id));
      if (!carro) {
        return {
          data: null,
          error: { code: "23503", message: `O veículo ${carga.veiculo_id} não está no estoque: só entra como opção do lead um carro que existe.` },
        };
      }
      const nova: Linha = {
        id: `0000000${(proximoId += 1)}`.slice(-8) + "-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        lead_id: carga.lead_id,
        veiculo_id: carga.veiculo_id,
        veiculo_rotulo: [carro.marca, carro.modelo, carro.versao, carro.ano].join(" ").toLowerCase(),
        veiculo_preco: carro.preco,
        situacao: carga.situacao ?? "em_avaliacao",
        motivo_descarte: carga.motivo_descarte ?? null,
        nota: carga.nota ?? null,
        adicionado_por: quemPede()?.full_name ?? null,
        resolvido_por: null,
        criado_em: agora(),
        resolvido_em: null,
      };
      const recusa = regrasDaOpcao(nova, banco.leads_veiculos);
      if (recusa) return { data: null, error: recusa };
      banco.leads_veiculos.push(nova);
      return { data: [recortar(nova)], error: null };
    }

    if (operacao === "delete") {
      if (tabela !== "leads_veiculos") throw new Error(`delete em ${tabela}: o dublê não conhece`);
      // A policy de exclusão: só o admin. Para os outros, zero linhas, sem erro.
      const alvos = ehAdmin() ? achadas() : [];
      banco.leads_veiculos = banco.leads_veiculos.filter((l) => !alvos.includes(l));
      return { data: alvos.map(recortar), error: null };
    }

    // update
    const alvos = achadas();
    if (tabela === "leads_veiculos") {
      for (const l of alvos) {
        const nova = { ...l, ...carga };
        const recusa = regrasDaOpcao(nova, banco.leads_veiculos.filter((o) => o !== l));
        if (recusa) return { data: null, error: recusa };
        if (nova.situacao !== l.situacao) {
          const aberta = nova.situacao === "em_avaliacao";
          nova.resolvido_em = aberta ? null : agora();
          nova.resolvido_por = aberta ? null : (quemPede()?.full_name ?? null);
        }
        Object.assign(l, nova);
      }
    } else {
      for (const l of alvos) Object.assign(l, carga);
    }
    return { data: alvos.map(recortar), error: null };
  };

  /** `coluna.ilike.*x*` e `coluna.eq.v`, separados por vírgula. */
  const ramoDoOr = (ramo: string) => {
    const m = /^(\w+)\.(ilike|eq)\.(.*)$/.exec(ramo);
    if (!m) throw new Error(`or "${ramo}": o dublê não conhece`);
    const [, coluna, operador, valor] = m;
    if (operador === "eq") return (l: Linha) => l[coluna] !== null && l[coluna] !== undefined && String(l[coluna]) === valor;
    // No PostgREST `*` é o curinga `%`; `%` e `_` crus também o seriam.
    const fonte = [...valor].map((c) => (c === "*" || c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))).join("");
    const padrao = new RegExp(`^${fonte}$`, "i");
    return (l: Linha) => typeof l[coluna] === "string" && padrao.test(l[coluna] as string);
  };

  const q = {
    select: (pedidas = "*") => {
      colunas = pedidas;
      return q;
    },
    insert: (linha: Linha) => {
      operacao = "insert";
      carga = linha;
      return q;
    },
    update: (campos: Linha) => {
      operacao = "update";
      carga = campos;
      return q;
    },
    delete: () => {
      operacao = "delete";
      return q;
    },
    order: (coluna: string, opcoes?: { ascending?: boolean }) => {
      ordens = [...ordens, { coluna, crescente: opcoes?.ascending ?? true }];
      return q;
    },
    limit: (n: number) => {
      limite = n;
      return q;
    },
    eq: (coluna: string, valor: unknown) => {
      filtros.push((l) => l[coluna] !== null && l[coluna] !== undefined && String(l[coluna]) === String(valor));
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
      filtros.push((l) => valores.map(String).includes(String(l[coluna])));
      return q;
    },
    or: (expressao: string) => {
      filtrosOr.push(expressao);
      const ramos = expressao.split(",").map(ramoDoOr);
      filtros.push((l) => ramos.some((r) => r(l)));
      return q;
    },
    single: async () => {
      const r = await executar();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    maybeSingle: async () => {
      const r = await executar();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => executar().then(ok, erro),
  };
  return q;
}

/** O que as funções do banco NUNCA devolvem, e que o dublê devolve para provar que a rota não repassa. */
const VAZAMENTO = { lead_id: "a0000000-0000-4000-8000-000000000001", nome: "Joana", telefone: "5541991176299", resolvido_por: "Ana" };

async function rpc(nome: string, args: Linha = {}) {
  linhaDoTempo.push(`rpc ${nome}`);
  if (falhasDoRpc[nome]) return { data: null, error: falhasDoRpc[nome] };
  // A guarda das duas funções: equipe ativa, pela sessão.
  if (!ehEquipeAtiva()) return { data: null, error: { code: "42501", message: "O resumo de interesse por veículo é restrito à equipe." } };
  const resumir = (linhas: Linha[]) => {
    const fechado = (v: Linha) => banco.leads.find((l) => l.id === v.lead_id)?.desfecho != null;
    const descartes = linhas.filter((v) => v.situacao === "descartado");
    const porMotivo = new Map<string, number>();
    for (const d of descartes) porMotivo.set(d.motivo_descarte as string, (porMotivo.get(d.motivo_descarte as string) ?? 0) + 1);
    const datas = linhas.map((v) => v.criado_em as string).sort();
    return {
      total: linhas.length,
      em_avaliacao: linhas.filter((v) => v.situacao === "em_avaliacao").length,
      sem_resolucao: linhas.filter((v) => v.situacao === "em_avaliacao" && fechado(v)).length,
      escolhido: linhas.filter((v) => v.situacao === "escolhido").length,
      descartado: descartes.length,
      motivos: [...porMotivo].map(([motivo, total]) => ({ motivo, total, ...VAZAMENTO })),
      notas: descartes.filter((d) => String(d.nota ?? "").trim()).map((d) => ({ motivo: d.motivo_descarte, nota: d.nota, em: d.resolvido_em, ...VAZAMENTO })),
      primeiro_interesse_em: datas[0] ?? null,
      ultimo_interesse_em: datas.at(-1) ?? null,
    };
  };
  if (nome === "resumo_de_interesse_do_veiculo") {
    const linhas = banco.leads_veiculos.filter((v) => String(v.veiculo_id) === String(args.p_veiculo));
    return { data: [{ veiculo_id: args.p_veiculo, ...resumir(linhas), ...VAZAMENTO }], error: null };
  }
  if (nome === "interesse_por_veiculo") {
    const ids = new Set([...banco.estoque_motors.map((e) => String(e.id)), ...banco.leads_veiculos.map((v) => String(v.veiculo_id))]);
    const linhas = [...ids].map((id) => {
      const carro = banco.estoque_motors.find((e) => String(e.id) === id);
      const dele = banco.leads_veiculos.filter((v) => String(v.veiculo_id) === id);
      const r = resumir(dele);
      return {
        veiculo_id: Number(id),
        veiculo_rotulo: carro ? [carro.marca, carro.modelo, carro.versao, carro.ano].join(" ").toLowerCase() : dele[0].veiculo_rotulo,
        no_estoque: Boolean(carro),
        vendido: carro ? carro.vendido === true : null,
        preco_atual: carro?.preco ?? null,
        ...r,
        motivo_principal: r.motivos[0]?.motivo ?? null,
        ...VAZAMENTO,
      };
    });
    return { data: linhas.sort((a, b) => b.total - a.total || a.veiculo_id - b.veiculo_id), error: null };
  }
  throw new Error(`rpc inesperada: ${nome}`);
}

const CLIENTE = {
  auth: { getUser: async () => ({ data: { user: usuario ? { id: usuario } : null } }) },
  from: (tabela: string) => consulta(tabela),
  rpc,
};
const SERVICO = { from: vi.fn(() => { throw new Error("os veículos de interesse não usam a chave de serviço"); }) };
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => CLIENTE,
  createAdminSupabaseClient: () => SERVICO,
}));

const detalhe = await import("../src/app/api/leads/[id]/route");
const veiculos = await import("../src/app/api/leads/[id]/veiculos/route");
const umaOpcao = await import("../src/app/api/leads/[id]/veiculos/[opcao]/route");
const lote = await import("../src/app/api/leads/[id]/veiculos/resolver/route");
const dados = await import("../src/app/api/leads/[id]/dados/route");
const gerenciar = await import("../src/app/api/leads/gerenciar/route");
const busca = await import("../src/app/api/estoque/busca/route");
const relatorio = await import("../src/app/api/estoque/[id]/interesse/route");
const ranking = await import("../src/app/api/estoque/interesse/route");
const { registrarInteresseDaCaptura } = await import("../src/lib/veiculosDeInteresse-servidor");
const { ETAPAS_PADRAO } = await import("../src/lib/funil");

// ----------------------------------------------------------------------------
// A fixture
// ----------------------------------------------------------------------------

const DA_ANA = "a0000000-0000-4000-8000-000000000001";
const DA_ANA_SEM_CARRO = "a0000000-0000-4000-8000-000000000002";
const DA_BIA = "b0000000-0000-4000-8000-000000000001";
const SEM_DONO = "c0000000-0000-4000-8000-000000000001";
const INEXISTENTE = "f0000000-0000-4000-8000-00000000dead";

const OP_ONIX = "10000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OP_UNO = "20000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OP_DA_BIA = "30000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OP_INEXISTENTE = "99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ONIX = 8203724;
const UNO = 8009174;
const HB20 = 8100001;
const VENDIDO = 8100002;
const FORA_DO_ESTOQUE = 7000001;

/** O que nunca pode chegar a quem não vê o lead, nem sair num relatório. */
const PESSOAL = ["Joana", "Marcos", "Rita", "5541991176299", "5541988887777"];

const PGRST205: Erro = { code: "PGRST205", message: "Could not find the table 'public.leads_veiculos' in the schema cache" };
const PGRST202: Erro = { code: "PGRST202", message: "Could not find the function public.resumo_de_interesse_do_veiculo(p_veiculo) in the schema cache" };

const lead = (id: string, extra: Linha): Linha => ({
  id,
  nome: "Cliente",
  telefone: "5541900000000",
  interesse: null,
  canal: "PDP",
  situacao: "proposta",
  responsavel: null,
  created_at: "2026-09-25T12:00:00Z",
  ultimo_movimento_em: "2026-09-25T12:00:00Z",
  desfecho: null,
  transferencias: 0,
  ag_uid: null,
  veiculo_id: null,
  ...extra,
});

const opcao = (id: string, leadId: string, veiculo: number, rotulo: string, extra: Linha = {}): Linha => ({
  id,
  lead_id: leadId,
  veiculo_id: veiculo,
  veiculo_rotulo: rotulo,
  veiculo_preco: 60000,
  situacao: "em_avaliacao",
  motivo_descarte: null,
  nota: null,
  adicionado_por: null,
  resolvido_por: null,
  criado_em: "2026-09-25T12:00:00Z",
  resolvido_em: null,
  ...extra,
});

beforeEach(() => {
  usuario = "u-ana";
  falhas = {};
  falhasAoGravar = {};
  falhasDoRpc = {};
  linhaDoTempo = [];
  colunasPedidas = {};
  filtrosOr = [];
  rlsPorEscopo = false;
  viewDaEquipe = true;
  relogio = 0;
  proximoId = 40;
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
      { id: "u-saiu", full_name: "Ana", role: "admin", papeis: ["admin", "comercial"], is_active: false },
      { id: "u-cliente", full_name: "Zé", role: "cliente", papeis: [], is_active: true },
    ],
    leads: [
      lead(DA_ANA, { nome: "Joana", telefone: "5541991176299", interesse: "Onix 2020", responsavel: "Ana", veiculo_id: ONIX }),
      lead(DA_ANA_SEM_CARRO, { nome: "Paulo", responsavel: "Ana" }),
      lead(DA_BIA, { nome: "Marcos", telefone: "5541988887777", responsavel: "Bia", veiculo_id: HB20 }),
      lead(SEM_DONO, { nome: "Rita", situacao: "novo", responsavel: null, veiculo_id: ONIX }),
    ],
    leads_veiculos: [
      opcao(OP_ONIX, DA_ANA, ONIX, "chevrolet onix lt 1.0 2020", { veiculo_preco: 62900, criado_em: "2026-09-25T12:00:00Z" }),
      opcao(OP_UNO, DA_ANA, UNO, "fiat uno mille fire economy 2013", { veiculo_preco: 23900, adicionado_por: "Ana", criado_em: "2026-09-27T12:00:00Z" }),
      opcao(OP_DA_BIA, DA_BIA, HB20, "hyundai hb20 comfort 1.0 2019", { criado_em: "2026-09-22T12:00:00Z" }),
    ],
    leads_interacoes: [],
    leads_eventos: [],
    atendimentos: [],
    funil_etapas: ETAPAS_PADRAO.map((e) => ({ ...e })),
    funil_motivos: [
      { chave: "a_vista", rotulo: "À vista", tipo: "ganho", ordem: 1, ativo: true, escopo: "ambos" },
      { chave: "sem_resposta", rotulo: "Sem resposta", tipo: "perdido", ordem: 2, ativo: true, escopo: "ambos" },
    ],
    estoque_motors: [
      { id: ONIX, marca: "chevrolet", modelo: "onix", versao: "lt 1.0", ano: 2020, quilometragem: 45000, preco: 59900, vendido: false, estado_cadastro: "publicado", url_imagem: "https://fotos/onix.jpg", placa: "ABC1D23", chassi: "9BWAG45U0KT000001", renavam: "01234567890", preco_compra: 41000 },
      { id: UNO, marca: "fiat", modelo: "uno mille", versao: "fire economy", ano: 2013, quilometragem: 120000, preco: 23900, vendido: false, estado_cadastro: "publicado", url_imagem: "", placa: "XYZ-9876", chassi: "9BD15822AD6000002", renavam: "09876543210", preco_compra: 15000 },
      { id: HB20, marca: "hyundai", modelo: "hb20", versao: "comfort 1.0", ano: 2019, quilometragem: 60000, preco: 58900, vendido: false, estado_cadastro: "rascunho", url_imagem: null, placa: null, chassi: null, renavam: null, preco_compra: 40000 },
      { id: VENDIDO, marca: "chevrolet", modelo: "onix plus", versao: "premier", ano: 2022, quilometragem: 30000, preco: 89900, vendido: true, estado_cadastro: "publicado", url_imagem: null, placa: "QWE4R56", chassi: null, renavam: null, preco_compra: 70000 },
    ],
  };
});

const pedido = (metodo: string, corpo?: unknown, url = "http://x/api") =>
  new Request(url, {
    method: metodo,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } }),
  }) as never;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ctxDaOpcao = (id: string, op: string) => ({ params: Promise.resolve({ id, opcao: op }) });

const resposta = async (r: Response) => ({ status: r.status, d: await r.json() });
const lerDetalhe = async (id: string) => resposta(await detalhe.GET(pedido("GET"), ctx(id)));
const adicionar = async (id: string, corpo: unknown) => resposta(await veiculos.POST(pedido("POST", corpo), ctx(id)));
const resolver = async (id: string, op: string, corpo: unknown) => resposta(await umaOpcao.PATCH(pedido("PATCH", corpo), ctxDaOpcao(id, op)));
const apagar = async (id: string, op: string) => resposta(await umaOpcao.DELETE(pedido("DELETE"), ctxDaOpcao(id, op)));
const resolverLote = async (id: string, corpo: unknown) => resposta(await lote.POST(pedido("POST", corpo), ctx(id)));
const buscar = async (q: string | null) =>
  resposta(await busca.GET(pedido("GET", undefined, `http://x/api/estoque/busca${q === null ? "" : `?q=${encodeURIComponent(q)}`}`)));

const doLead = (id: string) => banco.leads.find((l) => l.id === id)!;
const aOpcao = (id: string) => banco.leads_veiculos.find((v) => v.id === id)!;
const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const gravacoes = () => linhaDoTempo.filter((x) => /^(insert|update|delete) /.test(x));

/** As quatro escritas em opções, com um pedido que valeria no lead da Ana. */
const ESCRITAS: Array<[string, (id: string, op: string) => Promise<{ status: number; d: Linha }>]> = [
  ["POST veiculos", (id) => adicionar(id, { veiculo_id: HB20 })],
  ["PATCH opcao", (id, op) => resolver(id, op, { situacao: "descartado", motivo_descarte: "preco" })],
  ["DELETE opcao", (id, op) => apagar(id, op)],
  ["POST resolver", (id, op) => resolverLote(id, [{ opcao: op, situacao: "escolhido" }])],
];

function esperarSemPessoa(corpo: unknown, caso: string) {
  const texto = JSON.stringify(corpo);
  for (const dado of PESSOAL) expect(texto, `${caso}: ${dado}`).not.toContain(dado);
}

// ----------------------------------------------------------------------------
// O escopo, nos dois bancos
// ----------------------------------------------------------------------------

describe.each([
  ["RLS de leads aberta à equipe (produção hoje)", false],
  ["RLS de leads fechada por escopo (20261003130000)", true],
])("o escopo nas rotas de /api/leads/[id]/veiculos — %s", (_nome, fechada) => {
  beforeEach(() => {
    rlsPorEscopo = fechada;
  });

  it("sem sessão: 401, sem leitura nenhuma", async () => {
    usuario = null;
    for (const [rota, chamar] of ESCRITAS) {
      const { status, d } = await chamar(DA_ANA, OP_ONIX);
      expect(status, rota).toBe(401);
      expect(d, rota).toEqual({ error: "Não autorizado" });
    }
    expect(linhaDoTempo).toEqual([]);
  });

  it("Marketing e Financeiro: 403, e nem `leads` nem `leads_veiculos` são lidas", async () => {
    for (const quem of ["u-mkt", "u-fin"]) {
      usuario = quem;
      for (const [rota, chamar] of ESCRITAS) {
        const { status, d } = await chamar(DA_ANA, OP_ONIX);
        expect(status, `${quem} em ${rota}`).toBe(403);
        expect(d, `${quem} em ${rota}`).toEqual({ error: "Seu perfil não vê leads" });
      }
    }
    expect(linhaDoTempo.filter((x) => x !== "select profiles")).toEqual([]);
  });

  it("perfil desativado e cliente da Garagem: 403", async () => {
    for (const quem of ["u-saiu", "u-cliente"]) {
      usuario = quem;
      for (const [rota, chamar] of ESCRITAS) {
        const { status, d } = await chamar(DA_ANA, OP_ONIX);
        expect(status, `${quem} em ${rota}`).toBe(403);
        expect(d, `${quem} em ${rota}`).toEqual({ error: "Acesso restrito à equipe" });
      }
    }
    expect(linhaDoTempo.filter((x) => x !== "select profiles")).toEqual([]);
  });

  it("vendedor no lead do colega: 404, ANTES de ler ou gravar `leads_veiculos`", async () => {
    const antes = copia(banco.leads_veiculos);
    for (const [rota, chamar] of ESCRITAS) {
      linhaDoTempo = [];
      const { status, d } = await chamar(DA_BIA, OP_DA_BIA);
      expect(status, rota).toBe(404);
      expect(d, rota).toEqual({ error: "Lead não encontrado" });
      esperarSemPessoa(d, rota);
      expect(linhaDoTempo, rota).toEqual(["select profiles", "select leads"]);
    }
    expect(banco.leads_veiculos).toEqual(antes);
    expect(doLead(DA_BIA).veiculo_id).toBe(HB20);
  });

  it("Gestor e SDR no lead sem responsável: 404; o Admin alcança", async () => {
    for (const quem of ["u-gestor", "u-sdr"]) {
      usuario = quem;
      for (const [rota, chamar] of ESCRITAS) {
        const { status } = await chamar(SEM_DONO, OP_ONIX);
        expect(status, `${quem} em ${rota}`).toBe(404);
      }
    }
    expect(gravacoes()).toEqual([]);
    usuario = "u-admin";
    expect((await adicionar(SEM_DONO, { veiculo_id: UNO })).status).toBe(200);
  });

  it("lead que não existe e id que não é UUID: 404", async () => {
    for (const id of [INEXISTENTE, "42", "' or 1=1 --"]) {
      for (const [rota, chamar] of ESCRITAS) expect((await chamar(id, OP_ONIX)).status, `${id} em ${rota}`).toBe(404);
    }
    expect(gravacoes()).toEqual([]);
  });

  it("a opção de OUTRO lead não é alcançada pelo id: 404, e ela fica como estava", async () => {
    // A Ana enxerga o lead dela e manda o id da opção do lead da Bia. Com a
    // RLS aberta à equipe, o banco deixaria: quem segura é a rota.
    const antes = copia(aOpcao(OP_DA_BIA));
    const patch = await resolver(DA_ANA, OP_DA_BIA, { situacao: "descartado", motivo_descarte: "preco" });
    expect(patch.status).toBe(404);
    expect(patch.d).toEqual({ error: "Opção não encontrada neste lead.", codigo: "opcao_nao_encontrada" });
    const emLote = await resolverLote(DA_ANA, [{ opcao: OP_DA_BIA, situacao: "escolhido" }]);
    expect(emLote.status).toBe(404);
    expect(emLote.d).toMatchObject({ codigo: "opcao_nao_encontrada", opcao: OP_DA_BIA });
    usuario = "u-admin";
    expect((await apagar(DA_ANA, OP_DA_BIA)).status).toBe(404);
    expect(aOpcao(OP_DA_BIA)).toEqual(antes);
    expect(gravacoes()).toEqual([]);
  });

  it("o detalhe do lead do colega continua 404, sem ler as opções", async () => {
    const { status, d } = await lerDetalhe(DA_BIA);
    expect(status).toBe(404);
    esperarSemPessoa(d, "detalhe");
    expect(linhaDoTempo).not.toContain("select leads_veiculos");
  });

  it("cada perfil no lead que enxerga: adiciona", async () => {
    for (const quem of ["u-ana", "u-gestor", "u-sdr", "u-admin"]) {
      usuario = quem;
      banco.leads_veiculos = banco.leads_veiculos.filter((v) => !(v.lead_id === DA_ANA && v.veiculo_id === HB20));
      expect((await adicionar(DA_ANA, { veiculo_id: HB20 })).status, quem).toBe(200);
    }
    expect(SERVICO.from).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// GET /api/leads/[id]
// ----------------------------------------------------------------------------

describe("GET /api/leads/[id] — os veículos de interesse", () => {
  it("as opções do lead, o principal primeiro, com o preço da época e o de hoje", async () => {
    const { status, d } = await lerDetalhe(DA_ANA);
    expect(status).toBe(200);
    expect(d.veiculos_disponivel).toBe(true);
    expect(d.veiculos).toEqual([
      {
        id: OP_ONIX,
        veiculo_id: ONIX,
        rotulo: "Chevrolet Onix LT 1.0 2020",
        preco_na_epoca: 62900,
        preco_atual: 59900,
        km: 45000,
        no_estoque: true,
        vendido: false,
        situacao: "em_avaliacao",
        motivo_descarte: null,
        motivo_rotulo: null,
        nota: null,
        adicionado_por: null,
        criado_em: "2026-09-25T12:00:00Z",
        resolvido_por: null,
        resolvido_em: null,
        principal: true,
      },
      {
        id: OP_UNO,
        veiculo_id: UNO,
        rotulo: "Fiat Uno Mille Fire Economy 2013",
        preco_na_epoca: 23900,
        preco_atual: 23900,
        km: 120000,
        no_estoque: true,
        vendido: false,
        situacao: "em_avaliacao",
        motivo_descarte: null,
        motivo_rotulo: null,
        nota: null,
        adicionado_por: "Ana",
        criado_em: "2026-09-27T12:00:00Z",
        resolvido_por: null,
        resolvido_em: null,
        principal: false,
      },
    ]);
    expect(d.pendencias_de_veiculo).toEqual([
      { opcao: OP_ONIX, veiculo_id: ONIX, rotulo: "Chevrolet Onix LT 1.0 2020" },
      { opcao: OP_UNO, veiculo_id: UNO, rotulo: "Fiat Uno Mille Fire Economy 2013" },
    ]);
    expect(d.avisos).toEqual([]);
    // O campo de um carro só continua onde estava.
    expect(d.veiculo).toMatchObject({ id: ONIX, preco: 59900, vendido: false });
    expect(d.lead.veiculo_id).toBe(ONIX);
  });

  it("só as opções DESTE lead, e o estoque lido sem coluna interna", async () => {
    const { d } = await lerDetalhe(DA_ANA);
    expect(JSON.stringify(d.veiculos)).not.toContain(OP_DA_BIA);
    for (const colunas of colunasPedidas.estoque_motors) expect(colunas).not.toMatch(/placa|chassi|renavam|preco_compra|fipe|\*/);
  });

  it("o motivo vem com o rótulo, e a opção resolvida sai das pendências", async () => {
    Object.assign(aOpcao(OP_UNO), { situacao: "descartado", motivo_descarte: "km", nota: "rodado demais", resolvido_por: "Ana", resolvido_em: "2026-10-01T12:00:00Z" });
    const { d } = await lerDetalhe(DA_ANA);
    expect(d.veiculos[1]).toMatchObject({ situacao: "descartado", motivo_descarte: "km", motivo_rotulo: "Quilometragem", nota: "rodado demais", resolvido_por: "Ana" });
    expect(d.pendencias_de_veiculo.map((p: Linha) => p.opcao)).toEqual([OP_ONIX]);
  });

  it("opção de carro que saiu do estoque: o retrato fica", async () => {
    banco.leads_veiculos.push(opcao(OP_INEXISTENTE, DA_ANA, FORA_DO_ESTOQUE, "ford ka se 1.0 2018", { veiculo_preco: 39900, criado_em: "2026-09-28T12:00:00Z" }));
    const { d } = await lerDetalhe(DA_ANA);
    expect(d.veiculos[2]).toMatchObject({ rotulo: "Ford Ka SE 1.0 2018", preco_na_epoca: 39900, preco_atual: null, no_estoque: false, vendido: null });
  });

  it("lead sem carro: lista vazia", async () => {
    const { d } = await lerDetalhe(DA_ANA_SEM_CARRO);
    expect(d).toMatchObject({ veiculos: [], veiculos_disponivel: true, pendencias_de_veiculo: [], veiculo: null });
  });

  it("o principal sem linha (a captura não registrou): vem como opção `id: null`, na frente", async () => {
    banco.leads_veiculos = banco.leads_veiculos.filter((v) => v.id !== OP_ONIX);
    const { d } = await lerDetalhe(DA_ANA);
    expect(d.veiculos.map((v: Linha) => [v.id, v.veiculo_id, v.principal])).toEqual([
      [null, ONIX, true],
      [OP_UNO, UNO, false],
    ]);
    expect(d.veiculos[0]).toMatchObject({ rotulo: "chevrolet onix lt 1.0 2020", preco_atual: 59900, no_estoque: true, situacao: "em_avaliacao" });
    // Sem linha, não há o que resolver nela.
    expect(d.pendencias_de_veiculo.map((p: Linha) => p.opcao)).toEqual([OP_UNO]);
  });

  it("leitura das opções que falha por outro motivo: o lead vem, com o aviso", async () => {
    falhas.leads_veiculos = { code: "57014", message: "canceling statement due to statement timeout" };
    const { status, d } = await lerDetalhe(DA_ANA);
    expect(status).toBe(200);
    expect(d).toMatchObject({ veiculos: [], veiculos_disponivel: true });
    expect(d.avisos).toEqual(["Não deu para ler os veículos de interesse: canceling statement due to statement timeout"]);
    expect(d.veiculo).toMatchObject({ id: ONIX });
  });
});

// ----------------------------------------------------------------------------
// A tabela ainda não existe
// ----------------------------------------------------------------------------

describe.each([
  ["PGRST205 (o PostgREST não acha a tabela)", PGRST205],
  ["42P01 (o Postgres não acha a relação)", { code: "42P01", message: 'relation "public.leads_veiculos" does not exist' }],
])("antes da migração 20261005120000 — %s", (_nome, erro) => {
  beforeEach(() => {
    falhas.leads_veiculos = erro;
    falhasDoRpc.resumo_de_interesse_do_veiculo = PGRST202;
    falhasDoRpc.interesse_por_veiculo = PGRST202;
  });

  it("o detalhe responde como sempre: o carro único como uma opção, e `veiculos_disponivel: false`", async () => {
    const { status, d } = await lerDetalhe(DA_ANA);
    expect(status).toBe(200);
    expect(d.veiculos_disponivel).toBe(false);
    expect(d.veiculos).toEqual([
      {
        id: null,
        veiculo_id: ONIX,
        rotulo: "chevrolet onix lt 1.0 2020",
        preco_na_epoca: null,
        preco_atual: 59900,
        km: 45000,
        no_estoque: true,
        vendido: false,
        situacao: "em_avaliacao",
        motivo_descarte: null,
        motivo_rotulo: null,
        nota: null,
        adicionado_por: null,
        criado_em: "2026-09-25T12:00:00Z",
        resolvido_por: null,
        resolvido_em: null,
        principal: true,
      },
    ]);
    expect(d.pendencias_de_veiculo).toEqual([]);
    // Nenhum aviso: tabela ausente não é falha para mostrar ao vendedor.
    expect(d.avisos).toEqual([]);
    expect(d.veiculo).toMatchObject({ id: ONIX });
    expect((await lerDetalhe(DA_ANA_SEM_CARRO)).d).toMatchObject({ veiculos: [], veiculos_disponivel: false });
  });

  it("as escritas: 503 `veiculos_indisponivel`, com frase sem jargão, e nada gravado", async () => {
    usuario = "u-admin";
    for (const [rota, chamar] of ESCRITAS) {
      const { status, d } = await chamar(DA_ANA, OP_ONIX);
      expect(status, rota).toBe(503);
      expect(d, rota).toEqual({
        error: "A lista de veículos de interesse ainda não está ativa. Por enquanto, o lead segue com um carro só.",
        codigo: "veiculos_indisponivel",
      });
    }
    expect(gravacoes()).toEqual([]);
    expect(doLead(DA_ANA).veiculo_id).toBe(ONIX);
  });

  it("o `veiculo_id` do PATCH de dados grava só a coluna, como sempre", async () => {
    const r = await resposta(await dados.PATCH(pedido("PATCH", { veiculo_id: UNO }), ctx(DA_ANA_SEM_CARRO)));
    expect(r.status).toBe(200);
    expect(r.d.dados.veiculo_id).toBe(UNO);
    expect(doLead(DA_ANA_SEM_CARRO).veiculo_id).toBe(UNO);
    expect(gravacoes()).toEqual(["update leads"]);
  });

  it("fechar como ganho não trava nem inventa campo", async () => {
    const r = await resposta(await gerenciar.PATCH(pedido("PATCH", { id: DA_ANA, situacao: "fechado", desfecho_motivo: "a_vista" })));
    expect(r).toEqual({ status: 200, d: { ok: true } });
    expect(doLead(DA_ANA).situacao).toBe("fechado");
  });

  it("os relatórios: 200 com `veiculos_disponivel: false`", async () => {
    const um = await resposta(await relatorio.GET(pedido("GET"), ctx(String(ONIX))));
    expect(um.status).toBe(200);
    expect(um.d).toMatchObject({ veiculos_disponivel: false, relatorio: null, veiculo: { id: ONIX } });
    const todos = await resposta(await ranking.GET());
    expect(todos).toEqual({ status: 200, d: { veiculos_disponivel: false, veiculos: [] } });
  });
});

// ----------------------------------------------------------------------------
// POST /api/leads/[id]/veiculos
// ----------------------------------------------------------------------------

describe("POST /api/leads/[id]/veiculos — adicionar", () => {
  it("o primeiro carro de um lead sem principal vira o principal", async () => {
    const { status, d } = await adicionar(DA_ANA_SEM_CARRO, { veiculo_id: UNO });
    expect(status).toBe(200);
    expect(d).toMatchObject({ ok: true, criada: true, principal_veiculo_id: UNO });
    expect(d.veiculos).toHaveLength(1);
    expect(d.veiculos[0]).toMatchObject({
      id: d.opcao,
      veiculo_id: UNO,
      rotulo: "Fiat Uno Mille Fire Economy 2013",
      preco_na_epoca: 23900,
      situacao: "em_avaliacao",
      adicionado_por: "Ana",
      principal: true,
    });
    expect(doLead(DA_ANA_SEM_CARRO).veiculo_id).toBe(UNO);
    // A rota não manda retrato nem autor: o gatilho carimba.
    expect(gravacoes()).toEqual(["insert leads_veiculos", "update leads"]);
  });

  it("o segundo carro entra em avaliação e o principal NÃO muda", async () => {
    const { status, d } = await adicionar(DA_ANA, { veiculo_id: HB20 });
    expect(status).toBe(200);
    expect(d.principal_veiculo_id).toBe(ONIX);
    expect(d.veiculos.map((v: Linha) => [v.veiculo_id, v.principal])).toEqual([[ONIX, true], [UNO, false], [HB20, false]]);
    expect(doLead(DA_ANA).veiculo_id).toBe(ONIX);
    expect(gravacoes()).toEqual(["insert leads_veiculos"]);
    expect(d.pendencias_de_veiculo).toHaveLength(3);
  });

  it("`principal: true` adiciona e já torna o principal", async () => {
    const { d } = await adicionar(DA_ANA, { veiculo_id: HB20, principal: true });
    expect(d).toMatchObject({ criada: true, principal_veiculo_id: HB20 });
    expect(doLead(DA_ANA).veiculo_id).toBe(HB20);
    expect(d.veiculos[0]).toMatchObject({ veiculo_id: HB20, principal: true });
  });

  it("carro que já é opção: 409 `veiculo_repetido`; com `principal`, só troca o principal", async () => {
    const repetido = await adicionar(DA_ANA, { veiculo_id: UNO });
    expect(repetido.status).toBe(409);
    expect(repetido.d).toEqual({ error: "Este carro já está entre as opções do lead.", codigo: "veiculo_repetido", opcao: OP_UNO });
    expect(gravacoes()).toEqual([]);

    const troca = await adicionar(DA_ANA, { veiculo_id: UNO, principal: true });
    expect(troca.status).toBe(200);
    expect(troca.d).toMatchObject({ criada: false, opcao: OP_UNO, principal_veiculo_id: UNO });
    expect(banco.leads_veiculos.filter((v) => v.lead_id === DA_ANA)).toHaveLength(2);
    expect(gravacoes()).toEqual(["update leads"]);
  });

  it("carro que não está no estoque: 422 `veiculo_desconhecido` (quem recusa é o gatilho)", async () => {
    const { status, d } = await adicionar(DA_ANA, { veiculo_id: FORA_DO_ESTOQUE });
    expect(status).toBe(422);
    expect(d).toEqual({ error: "Este carro não está no estoque.", codigo: "veiculo_desconhecido" });
    expect(banco.leads_veiculos).toHaveLength(3);
  });

  it("dois cliques no mesmo carro: o segundo perde para a unicidade, 409", async () => {
    // A leitura não viu a opção (o outro clique gravou depois dela): o banco recusa.
    falhasAoGravar.leads_veiculos = violou("unique", "leads_veiculos_lead_veiculo_unico");
    const { status, d } = await adicionar(DA_ANA, { veiculo_id: HB20 });
    expect(status).toBe(409);
    expect(d.codigo).toBe("veiculo_repetido");
  });

  it("com outro carro escolhido, `principal` é recusado: o escolhido é o principal", async () => {
    aOpcao(OP_ONIX).situacao = "escolhido";
    const { status, d } = await adicionar(DA_ANA, { veiculo_id: HB20, principal: true });
    expect(status).toBe(409);
    expect(d.codigo).toBe("principal_ja_escolhido");
    expect(gravacoes()).toEqual([]);
    // Sem `principal`, entra normalmente.
    expect((await adicionar(DA_ANA, { veiculo_id: HB20 })).status).toBe(200);
    expect(doLead(DA_ANA).veiculo_id).toBe(ONIX);
  });

  it.each([
    [null, "corpo_invalido"],
    [{}, "veiculo_invalido"],
    [{ veiculo_id: "onix" }, "veiculo_invalido"],
    [{ veiculo_id: -1 }, "veiculo_invalido"],
    [{ veiculo_id: HB20, principal: 1 }, "principal_invalido"],
    [{ veiculo_id: HB20, lead_id: DA_BIA }, "campo_desconhecido"],
  ])("corpo %j → 400 %s, sem ler a tabela", async (corpo, codigo) => {
    const { status, d } = await adicionar(DA_ANA, corpo);
    expect(status).toBe(400);
    expect(d.codigo).toBe(codigo);
    expect(linhaDoTempo).not.toContain("select leads_veiculos");
    expect(gravacoes()).toEqual([]);
  });

  it("gravou e a releitura falhou: diz que gravou, com o aviso", async () => {
    const real = CLIENTE.from;
    let leituras = 0;
    CLIENTE.from = (tabela: string) => {
      if (tabela === "leads_veiculos" && linhaDoTempo.includes("insert leads_veiculos")) leituras += 1;
      if (leituras > 0 && tabela === "leads_veiculos") falhas.leads_veiculos = { code: "57014", message: "timeout" };
      return real(tabela);
    };
    try {
      const { status, d } = await adicionar(DA_ANA, { veiculo_id: HB20 });
      expect(status).toBe(200);
      expect(d).toMatchObject({ ok: true, criada: true, veiculos: null });
      expect(d.aviso).toContain("foi gravada");
      expect(banco.leads_veiculos.some((v) => v.lead_id === DA_ANA && v.veiculo_id === HB20)).toBe(true);
    } finally {
      CLIENTE.from = real;
    }
  });
});

// ----------------------------------------------------------------------------
// PATCH /api/leads/[id]/veiculos/[opcao]
// ----------------------------------------------------------------------------

describe("PATCH /api/leads/[id]/veiculos/[opcao] — resolver, reabrir, tornar principal", () => {
  it("descartar com motivo: o gatilho carimba quem e quando", async () => {
    const { status, d } = await resolver(DA_ANA, OP_UNO, { situacao: "descartado", motivo_descarte: "km", nota: " rodado demais " });
    expect(status).toBe(200);
    expect(d).toMatchObject({ ok: true, opcao: OP_UNO, principal_veiculo_id: ONIX });
    expect(d.veiculos[1]).toMatchObject({ id: OP_UNO, situacao: "descartado", motivo_descarte: "km", motivo_rotulo: "Quilometragem", nota: "rodado demais", resolvido_por: "Ana" });
    expect(d.veiculos[1].resolvido_em).toMatch(/^2026-10-05T/);
    expect(d.pendencias_de_veiculo.map((p: Linha) => p.opcao)).toEqual([OP_ONIX]);
    // Descartar quem não é o principal não toca em `leads`.
    expect(gravacoes()).toEqual(["update leads_veiculos"]);
  });

  it("escolher torna o carro o principal", async () => {
    const { status, d } = await resolver(DA_ANA, OP_UNO, { situacao: "escolhido" });
    expect(status).toBe(200);
    expect(d.principal_veiculo_id).toBe(UNO);
    expect(doLead(DA_ANA).veiculo_id).toBe(UNO);
    expect(d.veiculos[0]).toMatchObject({ id: OP_UNO, situacao: "escolhido", principal: true });
    expect(gravacoes()).toEqual(["update leads_veiculos", "update leads"]);
  });

  it("escolher com outro já escolhido: o anterior é reaberto antes, e o índice único nunca é violado", async () => {
    Object.assign(aOpcao(OP_ONIX), { situacao: "escolhido", resolvido_por: "Ana", resolvido_em: "2026-10-01T12:00:00Z" });
    const { status, d } = await resolver(DA_ANA, OP_UNO, { situacao: "escolhido" });
    expect(status).toBe(200);
    expect(aOpcao(OP_ONIX)).toMatchObject({ situacao: "em_avaliacao", resolvido_por: null, resolvido_em: null });
    expect(aOpcao(OP_UNO).situacao).toBe("escolhido");
    expect(doLead(DA_ANA).veiculo_id).toBe(UNO);
    expect(gravacoes()).toEqual(["update leads_veiculos", "update leads_veiculos", "update leads"]);
    expect(d.pendencias_de_veiculo.map((p: Linha) => p.opcao)).toEqual([OP_ONIX]);
  });

  it("a escolha que falha depois da reabertura devolve o escolhido anterior ao lugar", async () => {
    Object.assign(aOpcao(OP_ONIX), { situacao: "escolhido", resolvido_em: "2026-10-01T12:00:00Z" });
    // A segunda gravação (a escolha nova) falha.
    const real = CLIENTE.from;
    let gravadas = 0;
    CLIENTE.from = (tabela: string) => {
      const q = real(tabela);
      if (tabela !== "leads_veiculos") return q;
      const update = q.update;
      q.update = (campos: Linha) => {
        gravadas += 1;
        if (gravadas === 2) falhasAoGravar.leads_veiculos = { code: "57014", message: "timeout" };
        else delete falhasAoGravar.leads_veiculos;
        return update(campos);
      };
      return q;
    };
    try {
      const { status, d } = await resolver(DA_ANA, OP_UNO, { situacao: "escolhido" });
      expect(status).toBe(500);
      expect(d).toMatchObject({ codigo: "erro_do_banco", opcao: OP_UNO, gravadas: [] });
    } finally {
      CLIENTE.from = real;
    }
    expect(aOpcao(OP_ONIX).situacao).toBe("escolhido");
    expect(aOpcao(OP_UNO).situacao).toBe("em_avaliacao");
    expect(doLead(DA_ANA).veiculo_id).toBe(ONIX);
  });

  it("descartar o principal passa o principal à outra opção em avaliação", async () => {
    const { status, d } = await resolver(DA_ANA, OP_ONIX, { situacao: "descartado", motivo_descarte: "preco" });
    expect(status).toBe(200);
    expect(d.principal_veiculo_id).toBe(UNO);
    expect(doLead(DA_ANA).veiculo_id).toBe(UNO);
    expect(d.veiculos.map((v: Linha) => [v.id, v.situacao, v.principal])).toEqual([
      [OP_UNO, "em_avaliacao", true],
      [OP_ONIX, "descartado", false],
    ]);
  });

  it("descartar o principal sem outra opção em avaliação: o principal fica onde está", async () => {
    Object.assign(aOpcao(OP_UNO), { situacao: "descartado", motivo_descarte: "km", resolvido_em: "2026-10-01T12:00:00Z" });
    const { d } = await resolver(DA_ANA, OP_ONIX, { situacao: "descartado", motivo_descarte: "preco" });
    expect(d.principal_veiculo_id).toBe(ONIX);
    expect(gravacoes()).toEqual(["update leads_veiculos"]);
    expect(d.pendencias_de_veiculo).toEqual([]);
  });

  it("reabrir limpa o motivo e a resolução, e guarda a nota", async () => {
    Object.assign(aOpcao(OP_UNO), { situacao: "descartado", motivo_descarte: "km", nota: "rodado demais", resolvido_por: "Ana", resolvido_em: "2026-10-01T12:00:00Z" });
    const { status, d } = await resolver(DA_ANA, OP_UNO, { situacao: "em_avaliacao" });
    expect(status).toBe(200);
    expect(d.veiculos[1]).toMatchObject({ situacao: "em_avaliacao", motivo_descarte: null, motivo_rotulo: null, nota: "rodado demais", resolvido_por: null, resolvido_em: null });
  });

  it("`principal: true` troca o principal sem mexer na opção", async () => {
    const antes = copia(aOpcao(OP_UNO));
    const { status, d } = await resolver(DA_ANA, OP_UNO, { principal: true });
    expect(status).toBe(200);
    expect(d.principal_veiculo_id).toBe(UNO);
    expect(aOpcao(OP_UNO)).toEqual(antes);
    expect(gravacoes()).toEqual(["update leads"]);
  });

  it("`principal: true` com outro carro escolhido: 409", async () => {
    aOpcao(OP_ONIX).situacao = "escolhido";
    const { status, d } = await resolver(DA_ANA, OP_UNO, { principal: true });
    expect(status).toBe(409);
    expect(d.codigo).toBe("principal_ja_escolhido");
    expect(gravacoes()).toEqual([]);
  });

  it.each([
    [{ situacao: "descartado" }, "motivo_de_descarte_obrigatorio"],
    [{ situacao: "descartado", motivo_descarte: "caro" }, "motivo_invalido"],
    [{ situacao: "descartado", motivo_descarte: "outro" }, "nota_obrigatoria"],
    [{ situacao: "escolhido", motivo_descarte: "preco" }, "motivo_so_no_descarte"],
    [{ situacao: "vendido" }, "situacao_invalida"],
    [{ nota: 5 }, "nota_invalida"],
    [{ nota: "x".repeat(2001) }, "nota_longa"],
    [{ principal: false }, "principal_invalido"],
    [{ principal: true, situacao: "descartado", motivo_descarte: "km" }, "principal_descartado"],
    [{ veiculo_id: HB20 }, "campo_desconhecido"],
    [{ lead_id: DA_BIA, situacao: "escolhido" }, "campo_desconhecido"],
    [{}, "sem_campos"],
    [null, "corpo_invalido"],
  ])("corpo %j → 400 %s, e nada gravado", async (corpo, codigo) => {
    const { status, d } = await resolver(DA_ANA, OP_UNO, corpo);
    expect(status).toBe(400);
    expect(d.codigo).toBe(codigo);
    expect(gravacoes()).toEqual([]);
  });

  it("opção que não existe, e id que não é UUID: 404 `opcao_nao_encontrada`", async () => {
    for (const op of [OP_INEXISTENTE, "42"]) {
      const { status, d } = await resolver(DA_ANA, op, { situacao: "escolhido" });
      expect(status, op).toBe(404);
      expect(d.codigo, op).toBe("opcao_nao_encontrada");
    }
  });

  it("o que só o banco sabe volta com o código da constraint", async () => {
    falhasAoGravar.leads_veiculos = violou("unique", "leads_veiculos_um_escolhido_por_lead");
    const { status, d } = await resolver(DA_ANA, OP_UNO, { situacao: "escolhido" });
    expect(status).toBe(409);
    expect(d).toMatchObject({ codigo: "ja_ha_escolhido", opcao: OP_UNO, gravadas: [] });
    expect(doLead(DA_ANA).veiculo_id).toBe(ONIX);
  });

  it("a opção gravou e o principal não: 500 `principal_nao_atualizado`, dizendo o que ficou", async () => {
    falhasAoGravar.leads = { code: "57014", message: "timeout" };
    const { status, d } = await resolver(DA_ANA, OP_UNO, { situacao: "escolhido" });
    expect(status).toBe(500);
    expect(d.codigo).toBe("principal_nao_atualizado");
    expect(d.error).toContain("A opção foi gravada");
    expect(aOpcao(OP_UNO).situacao).toBe("escolhido");
  });
});

// ----------------------------------------------------------------------------
// DELETE /api/leads/[id]/veiculos/[opcao]
// ----------------------------------------------------------------------------

describe("DELETE /api/leads/[id]/veiculos/[opcao] — só o Administrador", () => {
  it("vendedor, Gestor e SDR: 403 `so_admin`, e a opção fica", async () => {
    for (const quem of ["u-ana", "u-gestor", "u-sdr"]) {
      usuario = quem;
      const { status, d } = await apagar(DA_ANA, OP_UNO);
      expect(status, quem).toBe(403);
      expect(d.codigo, quem).toBe("so_admin");
    }
    expect(aOpcao(OP_UNO)).toBeDefined();
    expect(linhaDoTempo).not.toContain("delete leads_veiculos");
  });

  it("o Admin apaga; o principal não muda se a opção não era ele", async () => {
    usuario = "u-admin";
    const { status, d } = await apagar(DA_ANA, OP_UNO);
    expect(status).toBe(200);
    expect(d).toMatchObject({ ok: true, apagada: OP_UNO, principal_veiculo_id: ONIX });
    expect(d.veiculos.map((v: Linha) => v.id)).toEqual([OP_ONIX]);
    expect(gravacoes()).toEqual(["delete leads_veiculos"]);
  });

  it("apagar o principal: passa à opção em avaliação; sem nenhuma, fica vazio", async () => {
    usuario = "u-admin";
    expect((await apagar(DA_ANA, OP_ONIX)).d.principal_veiculo_id).toBe(UNO);
    expect(doLead(DA_ANA).veiculo_id).toBe(UNO);
    const ultimo = await apagar(DA_ANA, OP_UNO);
    expect(ultimo.d).toMatchObject({ veiculos: [], principal_veiculo_id: null });
    expect(doLead(DA_ANA).veiculo_id).toBeNull();
  });

  it("opção que não existe: 404", async () => {
    usuario = "u-admin";
    expect((await apagar(DA_ANA, OP_INEXISTENTE)).d.codigo).toBe("opcao_nao_encontrada");
  });
});

// ----------------------------------------------------------------------------
// POST /api/leads/[id]/veiculos/resolver
// ----------------------------------------------------------------------------

describe("POST /api/leads/[id]/veiculos/resolver — o lote do fechamento", () => {
  it("resolve tudo de uma vez: um escolhido, o outro descartado com motivo", async () => {
    const { status, d } = await resolverLote(DA_ANA, [
      { opcao: OP_UNO, situacao: "escolhido" },
      { opcao: OP_ONIX, situacao: "descartado", motivo_descarte: "outro_da_loja" },
    ]);
    expect(status).toBe(200);
    expect(d).toMatchObject({ ok: true, resolvidas: 2, principal_veiculo_id: UNO, pendencias_de_veiculo: [] });
    expect(aOpcao(OP_UNO)).toMatchObject({ situacao: "escolhido", resolvido_por: "Ana" });
    expect(aOpcao(OP_ONIX)).toMatchObject({ situacao: "descartado", motivo_descarte: "outro_da_loja" });
    expect(doLead(DA_ANA).veiculo_id).toBe(UNO);
  });

  it("troca o escolhido no mesmo lote, na ordem que o índice único aceita", async () => {
    Object.assign(aOpcao(OP_ONIX), { situacao: "escolhido", resolvido_em: "2026-10-01T12:00:00Z" });
    const { status } = await resolverLote(DA_ANA, [
      { opcao: OP_UNO, situacao: "escolhido" },
      { opcao: OP_ONIX, situacao: "descartado", motivo_descarte: "preco" },
    ]);
    expect(status).toBe(200);
    expect(aOpcao(OP_ONIX).situacao).toBe("descartado");
    expect(aOpcao(OP_UNO).situacao).toBe("escolhido");
  });

  it("um item inválido e NADA é gravado; a resposta diz qual", async () => {
    const { status, d } = await resolverLote(DA_ANA, [
      { opcao: OP_UNO, situacao: "escolhido" },
      { opcao: OP_ONIX, situacao: "descartado" },
    ]);
    expect(status).toBe(400);
    expect(d).toMatchObject({ codigo: "motivo_de_descarte_obrigatorio", opcao: OP_ONIX });
    expect(gravacoes()).toEqual([]);
    expect(aOpcao(OP_UNO).situacao).toBe("em_avaliacao");
  });

  it("dois escolhidos no mesmo lote: 400 `varios_escolhidos`", async () => {
    const { status, d } = await resolverLote(DA_ANA, [
      { opcao: OP_UNO, situacao: "escolhido" },
      { opcao: OP_ONIX, situacao: "escolhido" },
    ]);
    expect(status).toBe(400);
    expect(d.codigo).toBe("varios_escolhidos");
    expect(gravacoes()).toEqual([]);
  });

  it.each([
    [{ resolucoes: [] }, "lote_invalido"],
    [[], "lote_vazio"],
    [[{ opcao: "x", situacao: "escolhido" }], "opcao_invalida"],
    [[{ opcao: OP_UNO }], "situacao_invalida"],
    [[{ opcao: OP_UNO, situacao: "escolhido" }, { opcao: OP_UNO, situacao: "em_avaliacao" }], "opcao_repetida"],
  ])("corpo %j → 400 %s, sem ler a tabela", async (corpo, codigo) => {
    const { status, d } = await resolverLote(DA_ANA, corpo);
    expect(status).toBe(400);
    expect(d.codigo).toBe(codigo);
    expect(linhaDoTempo).not.toContain("select leads_veiculos");
  });

  it("gravação que falha no meio: a resposta diz o que já ficou gravado", async () => {
    const real = CLIENTE.from;
    let gravadas = 0;
    CLIENTE.from = (tabela: string) => {
      const q = real(tabela);
      if (tabela !== "leads_veiculos") return q;
      const update = q.update;
      q.update = (campos: Linha) => {
        gravadas += 1;
        if (gravadas === 2) falhasAoGravar.leads_veiculos = { code: "57014", message: "timeout" };
        return update(campos);
      };
      return q;
    };
    try {
      const { status, d } = await resolverLote(DA_ANA, [
        { opcao: OP_ONIX, situacao: "descartado", motivo_descarte: "preco" },
        { opcao: OP_UNO, situacao: "descartado", motivo_descarte: "km" },
      ]);
      expect(status).toBe(500);
      expect(d).toMatchObject({ codigo: "erro_do_banco", opcao: OP_UNO, gravadas: [OP_ONIX] });
    } finally {
      CLIENTE.from = real;
    }
    expect(aOpcao(OP_ONIX).situacao).toBe("descartado");
    expect(aOpcao(OP_UNO).situacao).toBe("em_avaliacao");
  });
});

// ----------------------------------------------------------------------------
// PATCH /api/leads/[id]/dados — o caminho antigo
// ----------------------------------------------------------------------------

describe("PATCH /api/leads/[id]/dados — `veiculo_id` passa por adicionar + tornar principal", () => {
  const gravar = async (id: string, corpo: unknown) => resposta(await dados.PATCH(pedido("PATCH", corpo), ctx(id)));

  it("carro novo: vira opção do lead e o principal, junto com os outros campos", async () => {
    const { status, d } = await gravar(DA_ANA, { veiculo_id: HB20, faixa_entrada: "ate_5k" });
    expect(status).toBe(200);
    expect(d.dados).toMatchObject({ veiculo_id: HB20, faixa_entrada: "ate_5k" });
    expect(doLead(DA_ANA)).toMatchObject({ veiculo_id: HB20, faixa_entrada: "ate_5k" });
    expect(banco.leads_veiculos.filter((v) => v.lead_id === DA_ANA).map((v) => v.veiculo_id)).toEqual([ONIX, UNO, HB20]);
    // O anterior continua opção, em avaliação: trocar o principal não descarta.
    expect(aOpcao(OP_ONIX).situacao).toBe("em_avaliacao");
    // Um `update` só em `leads`.
    expect(gravacoes()).toEqual(["insert leads_veiculos", "update leads"]);
  });

  it("carro que já é opção: só troca o principal", async () => {
    expect((await gravar(DA_ANA, { veiculo_id: UNO })).status).toBe(200);
    expect(doLead(DA_ANA).veiculo_id).toBe(UNO);
    expect(gravacoes()).toEqual(["update leads"]);
  });

  it("com outro carro escolhido: 409, e nada muda", async () => {
    aOpcao(OP_ONIX).situacao = "escolhido";
    const { status, d } = await gravar(DA_ANA, { veiculo_id: HB20, faixa_entrada: "ate_5k" });
    expect(status).toBe(409);
    expect(d.codigo).toBe("principal_ja_escolhido");
    expect(gravacoes()).toEqual([]);
  });

  it("carro fora do estoque continua 422, antes de tocar em `leads_veiculos`", async () => {
    const { status, d } = await gravar(DA_ANA, { veiculo_id: FORA_DO_ESTOQUE });
    expect(status).toBe(422);
    expect(d.codigo).toBe("veiculo_desconhecido");
    expect(linhaDoTempo).not.toContain("select leads_veiculos");
  });

  it("`null` limpa só o principal; as opções ficam", async () => {
    expect((await gravar(DA_ANA, { veiculo_id: null })).status).toBe(200);
    expect(doLead(DA_ANA).veiculo_id).toBeNull();
    expect(banco.leads_veiculos.filter((v) => v.lead_id === DA_ANA)).toHaveLength(2);
  });

  it("sem `veiculo_id` no pedido, `leads_veiculos` nem é lida", async () => {
    expect((await gravar(DA_ANA, { faixa_entrada: "ate_5k" })).status).toBe(200);
    expect(linhaDoTempo.some((x) => x.endsWith("leads_veiculos"))).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// PATCH /api/leads/gerenciar — o desfecho
// ----------------------------------------------------------------------------

describe("PATCH /api/leads/gerenciar — o ganho e os veículos", () => {
  /** A etapa de ganho do funil padrão tem a chave `fechado`; o que conta é o TIPO dela. */
  const fechar = async (id: string, tipo: "ganho" | "perdido", motivo: string) =>
    resposta(await gerenciar.PATCH(pedido("PATCH", { id, situacao: tipo === "ganho" ? "fechado" : "perdido", desfecho_motivo: motivo })));

  it("ganho com UMA opção em avaliação: ela vira a escolhida, sozinha", async () => {
    const { status, d } = await fechar(DA_BIA_DA_ANA(), "ganho", "a_vista");
    expect(status).toBe(200);
    expect(d).toEqual({ ok: true, veiculo_escolhido: OP_DA_BIA });
    expect(aOpcao(OP_DA_BIA)).toMatchObject({ situacao: "escolhido", resolvido_por: "Ana" });
    expect(doLead(DA_BIA).veiculo_id).toBe(HB20);
  });

  it("e o principal acompanha, se apontava para outro carro", async () => {
    DA_BIA_DA_ANA();
    doLead(DA_BIA).veiculo_id = null;
    expect((await fechar(DA_BIA, "ganho", "a_vista")).d.veiculo_escolhido).toBe(OP_DA_BIA);
    expect(doLead(DA_BIA).veiculo_id).toBe(HB20);
  });

  it("ganho com duas opções: nada é escolhido, e as duas vêm como pendência", async () => {
    const { status, d } = await fechar(DA_ANA, "ganho", "a_vista");
    expect(status).toBe(200);
    expect(d.veiculo_escolhido).toBeUndefined();
    expect(d.pendencias_de_veiculo.map((p: Linha) => p.opcao)).toEqual([OP_ONIX, OP_UNO]);
    expect(banco.leads_veiculos.every((v) => v.situacao === "em_avaliacao")).toBe(true);
    // O desfecho NÃO é bloqueado por opção pendente.
    expect(doLead(DA_ANA).situacao).toBe("fechado");
  });

  it("ganho com a única opção já descartada: o descarte não é sobrescrito", async () => {
    DA_BIA_DA_ANA();
    Object.assign(aOpcao(OP_DA_BIA), { situacao: "descartado", motivo_descarte: "preco", resolvido_em: "2026-10-01T12:00:00Z" });
    const { d } = await fechar(DA_BIA, "ganho", "a_vista");
    expect(d).toEqual({ ok: true });
    expect(aOpcao(OP_DA_BIA).situacao).toBe("descartado");
  });

  it("ganho com um carro já escolhido: fica como está", async () => {
    aOpcao(OP_UNO).situacao = "escolhido";
    const { d } = await fechar(DA_ANA, "ganho", "a_vista");
    expect(d.veiculo_escolhido).toBeUndefined();
    expect(d.pendencias_de_veiculo.map((p: Linha) => p.opcao)).toEqual([OP_ONIX]);
    expect(aOpcao(OP_UNO).situacao).toBe("escolhido");
  });

  it("perdido com uma opção: não escolhe; ela vem como pendência", async () => {
    DA_BIA_DA_ANA();
    const { d } = await fechar(DA_BIA, "perdido", "sem_resposta");
    expect(d.veiculo_escolhido).toBeUndefined();
    expect(d.pendencias_de_veiculo).toEqual([{ opcao: OP_DA_BIA, veiculo_id: HB20, rotulo: "Hyundai HB20 Comfort 1.0 2019" }]);
    expect(aOpcao(OP_DA_BIA).situacao).toBe("em_avaliacao");
  });

  it("mover entre colunas não lê `leads_veiculos`", async () => {
    const r = await resposta(await gerenciar.PATCH(pedido("PATCH", { id: DA_ANA, situacao: "negociacao" })));
    expect(r).toEqual({ status: 200, d: { ok: true } });
    expect(linhaDoTempo.some((x) => x.endsWith("leads_veiculos"))).toBe(false);
  });

  it("a escolha que falha não derruba o desfecho", async () => {
    DA_BIA_DA_ANA();
    falhasAoGravar.leads_veiculos = { code: "57014", message: "timeout" };
    const { status, d } = await fechar(DA_BIA, "ganho", "a_vista");
    expect(status).toBe(200);
    expect(d.ok).toBe(true);
    expect(d.veiculo_escolhido).toBeUndefined();
    expect(doLead(DA_BIA).situacao).toBe("fechado");
  });

  /** O lead da Bia passa a ser da Ana: um lead com UMA opção, à vista de quem pede. */
  function DA_BIA_DA_ANA(): string {
    doLead(DA_BIA).responsavel = "Ana";
    return DA_BIA;
  }
});

// ----------------------------------------------------------------------------
// GET /api/estoque/busca
// ----------------------------------------------------------------------------

describe("GET /api/estoque/busca — o seletor de carro", () => {
  it("quem busca é equipe ativa que vê lead", async () => {
    for (const [quem, status] of [["u-ana", 200], ["u-gestor", 200], ["u-sdr", 200], ["u-admin", 200], ["u-mkt", 403], ["u-fin", 403], ["u-saiu", 403], ["u-cliente", 403]] as const) {
      usuario = quem;
      linhaDoTempo = [];
      expect((await buscar("onix")).status, quem).toBe(status);
      if (status !== 200) expect(linhaDoTempo, quem).toEqual(["select profiles"]);
    }
    usuario = null;
    expect((await buscar("onix")).status).toBe(401);
  });

  it("por marca, modelo, versão e ano, cada palavra em qualquer um; o que o seletor mostra", async () => {
    const { status, d } = await buscar("onix 2020");
    expect(status).toBe(200);
    expect(d).toEqual({
      veiculos: [
        { id: ONIX, rotulo: "Chevrolet Onix LT 1.0 2020", ano: 2020, km: 45000, preco: 59900, placa_final: "1D23", foto: "https://fotos/onix.jpg", vendido: false, publicado: true },
      ],
      termos: ["onix", "2020"],
    });
  });

  it("vendido e fora da vitrine vêm, com a etiqueta; à venda primeiro", async () => {
    const { d } = await buscar("onix");
    expect(d.veiculos.map((v: Linha) => [v.id, v.vendido])).toEqual([[ONIX, false], [VENDIDO, true]]);
    const hb20 = (await buscar("HB20")).d.veiculos[0];
    expect(hb20).toEqual({ id: HB20, rotulo: "Hyundai HB20 Comfort 1.0 2019", ano: 2019, km: 60000, preco: 58900, vendido: false, publicado: false });
  });

  it("pelo código do carro", async () => {
    expect((await buscar(String(UNO))).d.veiculos.map((v: Linha) => v.id)).toEqual([UNO]);
  });

  it("pela placa, com ou sem hífen; a resposta só leva os quatro últimos", async () => {
    for (const q of ["ABC1D23", "abc1d", "xyz-9876", "9876"]) {
      const { d } = await buscar(q);
      expect(d.veiculos, q).toHaveLength(1);
    }
    // Digitada com hífen, a placa é procurada também sem ele.
    expect((await buscar("abc-1d23")).d.veiculos.map((v: Linha) => v.id)).toEqual([ONIX]);
    // O contrário o banco não faz: placa GRAVADA com hífen não casa com a
    // digitada sem (não há coluna normalizada). Fica registrado no contrato.
    expect((await buscar("XYZ9876")).d.veiculos).toEqual([]);
    const texto = JSON.stringify((await buscar("chevrolet")).d) + JSON.stringify((await buscar("fiat")).d);
    for (const inteira of ["ABC1D23", "XYZ-9876", "XYZ9876", "QWE4R56"]) expect(texto).not.toContain(inteira);
    expect(texto).toContain('"placa_final":"1D23"');
    expect(texto).toContain('"placa_final":"9876"');
    expect(texto).not.toContain('"placa"');
  });

  it("a placa vem pela view da equipe, e chassi, renavam e custo nem são pedidos", async () => {
    await buscar("onix");
    expect(linhaDoTempo).toContain("select estoque_motors_equipe");
    expect(linhaDoTempo).not.toContain("select estoque_motors");
    for (const colunas of colunasPedidas.estoque_motors_equipe) {
      expect(colunas).not.toMatch(/chassi|renavam|preco_compra|fipe|\*/);
    }
    const texto = JSON.stringify((await buscar("chevrolet")).d);
    for (const interno of ["9BWAG45U0KT000001", "01234567890", "41000", "70000"]) expect(texto).not.toContain(interno);
  });

  it("sem a view (antes da 20261001150000) lê a tabela; erro de permissão NÃO cai na tabela", async () => {
    viewDaEquipe = false;
    expect((await buscar("onix")).d.veiculos).toHaveLength(2);
    expect(linhaDoTempo).toContain("select estoque_motors");

    viewDaEquipe = true;
    linhaDoTempo = [];
    falhas.estoque_motors_equipe = { code: "42501", message: "permission denied for view estoque_motors_equipe" };
    const { status, d } = await buscar("onix");
    expect(status).toBe(500);
    expect(d.veiculos).toBeUndefined();
    expect(linhaDoTempo).not.toContain("select estoque_motors");
  });

  it("menos de dois caracteres: 400 `busca_curta`, sem consulta", async () => {
    for (const q of [null, "", " ", "o", "%", "**", "_"]) {
      const { status, d } = await buscar(q);
      expect(status, String(q)).toBe(400);
      expect(d.codigo, String(q)).toBe("busca_curta");
    }
    expect(linhaDoTempo.filter((x) => x.includes("estoque"))).toEqual([]);
  });

  it("curinga não lista o estoque: %, _ e * saem do termo antes do filtro", async () => {
    for (const q of ["%%", "__", "**", "%_*"]) expect((await buscar(q)).status, q).toBe(400);
    // Com letras em volta, o curinga vira espaço: "o%x" procura "o" E "x", não "o<qualquer coisa>x".
    for (const q of ["on%x", "on_x", "on*x", "u*o"]) {
      filtrosOr = [];
      await buscar(q);
      const valores = filtrosOr.join(",").replace(/\.ilike\.\*/g, ".ilike.").replace(/\*(,|$)/g, "$1");
      expect(valores, q).not.toMatch(/[%_*\\]/);
    }
    // "o_ix" casaria com "onix" se o `_` chegasse ao banco como curinga.
    expect((await buscar("zz o_ix")).d.veiculos).toEqual([]);
    expect((await buscar("fiat u%o")).d.veiculos.map((v: Linha) => v.id)).toEqual([UNO]);
  });

  it("vírgula, parêntese e aspas não abrem outro ramo no `or`", async () => {
    // Se a vírgula passasse, `id.gt.0` viraria um ramo e o dublê recusaria o operador.
    const { status, d } = await buscar('zzz,id.gt.0) or (vendido.is.null "');
    expect(status).toBe(200);
    expect(d.veiculos).toEqual([]);
    for (const expressao of filtrosOr) {
      for (const ramo of expressao.split(",")) expect(ramo).toMatch(/^(marca|modelo|versao|placa)\.ilike\.\*[^()"]*\*$|^(ano|id)\.eq\.\d+$/);
    }
  });

  it("no máximo doze", async () => {
    for (let i = 0; i < 20; i += 1) {
      banco.estoque_motors.push({ id: 9000000 + i, marca: "volkswagen", modelo: "gol", versao: "1.0", ano: 2015, quilometragem: 90000, preco: 35000, vendido: false, estado_cadastro: "publicado", url_imagem: null, placa: null });
    }
    expect((await buscar("gol")).d.veiculos).toHaveLength(12);
  });
});

// ----------------------------------------------------------------------------
// Os relatórios
// ----------------------------------------------------------------------------

describe("GET /api/estoque/[id]/interesse e /api/estoque/interesse — o relatório por veículo", () => {
  const ler = async (id: string | number) => resposta(await relatorio.GET(pedido("GET"), ctx(String(id))));

  beforeEach(() => {
    banco.leads_veiculos.push(
      opcao("40000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa", DA_BIA, ONIX, "chevrolet onix lt 1.0 2020", { situacao: "descartado", motivo_descarte: "preco", nota: "queria 5 mil a menos", resolvido_por: "Bia", resolvido_em: "2026-10-02T12:00:00Z", criado_em: "2026-09-20T12:00:00Z" }),
      opcao("50000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SEM_DONO, ONIX, "chevrolet onix lt 1.0 2020", { situacao: "descartado", motivo_descarte: "preco", resolvido_em: "2026-10-03T12:00:00Z", criado_em: "2026-09-28T12:00:00Z" }),
      opcao("60000000-aaaa-4aaa-8aaa-aaaaaaaaaaaa", DA_ANA_SEM_CARRO, ONIX, "chevrolet onix lt 1.0 2020", { situacao: "escolhido", resolvido_por: "Ana", resolvido_em: "2026-10-04T12:00:00Z", criado_em: "2026-09-30T12:00:00Z" }),
    );
  });

  it("toda a equipe ativa lê (Marketing e Financeiro também); fora dela, não", async () => {
    for (const [quem, status] of [["u-ana", 200], ["u-mkt", 200], ["u-fin", 200], ["u-gestor", 200], ["u-admin", 200], ["u-saiu", 403], ["u-cliente", 403]] as const) {
      usuario = quem;
      linhaDoTempo = [];
      expect((await ler(ONIX)).status, quem).toBe(status);
      expect((await resposta(await ranking.GET())).status, quem).toBe(status);
      if (status !== 200) expect(linhaDoTempo, quem).toEqual(["select profiles", "select profiles"]);
    }
    usuario = null;
    expect((await ler(ONIX)).status).toBe(401);
    expect((await resposta(await ranking.GET())).status).toBe(401);
  });

  it("pela sessão de quem abriu, nunca pela chave de serviço", async () => {
    await ler(ONIX);
    await ranking.GET();
    expect(linhaDoTempo.filter((x) => x.startsWith("rpc"))).toEqual(["rpc resumo_de_interesse_do_veiculo", "rpc interesse_por_veiculo"]);
    expect(SERVICO.from).not.toHaveBeenCalled();
  });

  it("o relatório de um carro: totais, percentuais, motivos com rótulo, notas e datas", async () => {
    const { status, d } = await ler(ONIX);
    expect(status).toBe(200);
    expect(d).toEqual({
      veiculos_disponivel: true,
      veiculo: { id: ONIX, rotulo: "Chevrolet Onix LT 1.0 2020", km: 45000, preco: 59900, vendido: false },
      relatorio: {
        veiculo_id: ONIX,
        total: 4,
        em_avaliacao: 1,
        sem_resolucao: 0,
        escolhido: 1,
        descartado: 2,
        percentuais: { em_avaliacao: 25, sem_resolucao: 0, escolhido: 25, descartado: 50 },
        motivo_principal: { motivo: "preco", rotulo: "Preço acima do que queria", total: 2, percentual: 100 },
        motivos: [{ motivo: "preco", rotulo: "Preço acima do que queria", total: 2, percentual: 100 }],
        notas: [{ texto: "queria 5 mil a menos", motivo: "preco", motivo_rotulo: "Preço acima do que queria", em: "2026-10-02T12:00:00Z" }],
        primeiro_interesse_em: "2026-09-20T12:00:00Z",
        ultimo_interesse_em: "2026-09-30T12:00:00Z",
      },
    });
  });

  it("nenhum dado de pessoa sai, nem o que a função devolvesse a mais", async () => {
    // O dublê devolve lead, nome, telefone e autor em cada nível: nada disso passa.
    for (const corpo of [(await ler(ONIX)).d, (await resposta(await ranking.GET())).d]) {
      const texto = JSON.stringify(corpo);
      for (const dado of [...PESSOAL, "Bia", "Ana", DA_ANA, DA_BIA, "lead_id", "telefone", "nome", "resolvido_por", "adicionado_por", "responsavel"]) {
        expect(texto, dado).not.toContain(dado);
      }
    }
  });

  it("carro que ninguém considerou: zeros; carro fora do estoque: sem cabeçalho", async () => {
    expect((await ler(VENDIDO)).d.relatorio).toMatchObject({ total: 0, motivos: [], notas: [], motivo_principal: null, percentuais: { descartado: 0 } });
    const fora = await ler(FORA_DO_ESTOQUE);
    expect(fora.status).toBe(200);
    expect(fora.d).toMatchObject({ veiculo: null, relatorio: { veiculo_id: FORA_DO_ESTOQUE, total: 0 } });
  });

  it("id que não é código de carro: 400 `veiculo_invalido`, sem chamar a função", async () => {
    for (const id of ["onix", "-1", "1.5", "0"]) {
      const { status, d } = await ler(id);
      expect(status, id).toBe(400);
      expect(d.codigo, id).toBe("veiculo_invalido");
    }
    expect(linhaDoTempo.filter((x) => x.startsWith("rpc"))).toEqual([]);
  });

  it("a função que recusa a sessão: 403; outro erro: 500", async () => {
    falhasDoRpc.resumo_de_interesse_do_veiculo = { code: "42501", message: "O resumo de interesse por veículo é restrito à equipe." };
    expect((await ler(ONIX)).status).toBe(403);
    falhasDoRpc.interesse_por_veiculo = { code: "57014", message: "timeout" };
    const r = await resposta(await ranking.GET());
    expect(r.status).toBe(500);
    expect(r.d.codigo).toBe("erro_do_banco");
  });

  it("o ranking: do mais considerado ao menos, com o motivo principal e o rótulo na grafia da tela", async () => {
    const { status, d } = await resposta(await ranking.GET());
    expect(status).toBe(200);
    expect(d.veiculos_disponivel).toBe(true);
    expect(d.veiculos.map((v: Linha) => [v.veiculo_id, v.total])).toEqual([[ONIX, 4], [UNO, 1], [HB20, 1], [VENDIDO, 0]]);
    expect(d.veiculos[0]).toEqual({
      veiculo_id: ONIX,
      rotulo: "Chevrolet Onix LT 1.0 2020",
      no_estoque: true,
      vendido: false,
      preco_atual: 59900,
      total: 4,
      em_avaliacao: 1,
      sem_resolucao: 0,
      escolhido: 1,
      descartado: 2,
      motivo_principal: "preco",
      motivo_principal_rotulo: "Preço acima do que queria",
      motivos: [{ motivo: "preco", rotulo: "Preço acima do que queria", total: 2, percentual: 100 }],
      ultimo_interesse_em: "2026-09-30T12:00:00Z",
    });
  });
});

// ----------------------------------------------------------------------------
// A captura do site
// ----------------------------------------------------------------------------

describe("registrarInteresseDaCaptura — o lead do site ganha a primeira opção", () => {
  type Passo = { linha: Linha; erro: Erro | null };
  const cliente = (respostas: Array<Erro | null>) => {
    const passos: Passo[] = [];
    return {
      passos,
      from: (tabela: string) => ({
        insert: async (linha: Linha) => {
          expect(tabela).toBe("leads_veiculos");
          const erro = respostas[passos.length] ?? null;
          passos.push({ linha, erro });
          return { data: null, error: erro };
        },
      }),
    };
  };
  const chamar = (c: ReturnType<typeof cliente>, ...resto: [string | null | undefined, unknown, (string | null)?]) =>
    registrarInteresseDaCaptura(c as never, ...resto);

  it("grava lead e carro, e deixa o retrato para o gatilho", async () => {
    const c = cliente([null]);
    await chamar(c, DA_ANA, "8203724", "Onix 2020");
    expect(c.passos.map((p) => p.linha)).toEqual([{ lead_id: DA_ANA, veiculo_id: ONIX }]);
  });

  it("carro que já saiu do estoque (o `not null` do rótulo): tenta de novo com o interesse do lead", async () => {
    const c = cliente([{ code: "23502", message: 'null value in column "veiculo_rotulo"' }, null]);
    await chamar(c, DA_ANA, FORA_DO_ESTOQUE, "  Ford Ka 2018 ");
    expect(c.passos.map((p) => p.linha)).toEqual([
      { lead_id: DA_ANA, veiculo_id: FORA_DO_ESTOQUE },
      { lead_id: DA_ANA, veiculo_id: FORA_DO_ESTOQUE, veiculo_rotulo: "Ford Ka 2018" },
    ]);
    const semInteresse = cliente([{ code: "23502", message: "null value" }, null]);
    await chamar(semInteresse, DA_ANA, FORA_DO_ESTOQUE, null);
    expect(semInteresse.passos[1].linha.veiculo_rotulo).toBe(`Veículo nº ${FORA_DO_ESTOQUE}`);
  });

  it("sem lead ou sem carro: não grava", async () => {
    const c = cliente([]);
    await chamar(c, null, ONIX);
    await chamar(c, DA_ANA, null);
    await chamar(c, DA_ANA, "onix-2020-slug");
    await chamar(c, DA_ANA, 0);
    expect(c.passos).toEqual([]);
  });

  it("a captura chama, depois de gravar o lead, fora do caminho de erro, e sem depender do resultado", () => {
    // A rota de captura tem dependências demais para rodar aqui; a fiação é
    // conferida no texto: a chamada vem logo depois de o id do lead existir,
    // no ramo em que a gravação deu certo, e o retorno dela não é lido.
    const fonte = readFileSync(join(__dirname, "..", "src", "app", "api", "leads", "route.ts"), "utf8");
    const trecho = fonte.slice(fonte.indexOf("if (erroLead) {"), fonte.indexOf("} catch (erroPersistencia"));
    expect(trecho).toMatch(
      /\} else \{[\s\S]*idDoLead = typeof idGravado === "string" \? idGravado : null;[\s\S]*\n\s+await registrarInteresseDaCaptura\(supabaseAdmin, idDoLead, veiculo\?\.id, interesse\);/,
    );
    expect(fonte.match(/registrarInteresseDaCaptura\(/g)).toHaveLength(1);
  });

  it("nunca lança: tabela ausente, erro do banco e cliente que explode", async () => {
    await expect(chamar(cliente([PGRST205]), DA_ANA, ONIX)).resolves.toBeUndefined();
    await expect(chamar(cliente([{ code: "57014", message: "timeout" }]), DA_ANA, ONIX)).resolves.toBeUndefined();
    const explode = { from: () => { throw new Error("sem chave de serviço"); } };
    await expect(registrarInteresseDaCaptura(explode as never, DA_ANA, ONIX)).resolves.toBeUndefined();
  });
});
