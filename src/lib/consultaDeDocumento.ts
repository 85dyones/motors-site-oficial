/**
 * Consulta de CPF e de CNPJ pela APIBrasil — a parte pura (dono, 18/10/2026).
 *
 * "Vamos criar uma consulta cpf e uma cnpj na API, para verificar tudo, em
 * tiers": três níveis de cada um com os produtos que o dono escolheu, e os
 * pacotes completos. Não existe produto único que traga tudo dos quatro de
 * cada documento (levantamento de 18/10/2026 na doc da APIBrasil); existem
 * combinações mais baratas que trazem quase tudo, e o dono pediu as opções
 * lado a lado, para escolher na hora:
 *
 *   CPF  · básico: Lite + Receita Federal · dados: CPF Dados · crédito:
 *          Análise de Crédito Plus PF · completo econômico: Acerta Essencial
 *          Plus + CPF Dados · completo integral: CPF Dados + Análise de
 *          Crédito Plus PF (Lite e Receita saem: o Plus PF já traz nome, mãe,
 *          nascimento e situação na Receita).
 *   CNPJ · básico: CNPJ Cadastral + Receita Federal PJ V3 · dados: Cadastral
 *          Premium · crédito: Análise de Crédito Basic PJ · completo
 *          econômico: API CNPJ + CNPJ Cadastral + Dossiê de Crédito PJ ·
 *          completo com score: o econômico + Cadastral + Score PJ · completo
 *          integral: os quatro.
 *
 * Os preços aqui são os da documentação do fornecedor em 18/10/2026 e servem
 * só para a tela dizer "até R$ X" ANTES de cobrar. O custo gravado é o que a
 * resposta de cada produto diz (`valor_consulta`/`tax`).
 *
 * Cada leitor de produto transforma a resposta em seções do relatório
 * (`relatorioDeDocumento.ts`). O formato de vários produtos só é conhecido
 * pelo exemplo da doc; o que não for reconhecido vira "não veio", e a resposta
 * bruta fica guardada para remontar o relatório sem pagar de novo.
 */
import { cnpjValido, formatarCnpj, soCaracteresDoCnpj } from "./cnpj";
import { cpfValido, formatarCpf, soDigitosDoCpf } from "./cpf";
import type { EstadoDoItem, LinhaDoRelatorio, RelatorioDeDocumento, SecaoDoRelatorio, TabelaDoRelatorio, TipoDeDocumento } from "./relatorioDeDocumento";

// ─────────────────────────────────────────────────────────────────────────────
// O catálogo
// ─────────────────────────────────────────────────────────────────────────────

export type IdDoProduto =
  | "cpf-lite"
  | "receita-federal"
  | "cpf-dados"
  | "analise-credito-plus-pf"
  | "acerta-essencial-positivo"
  | "cnpj"
  | "cnpj-cadastral"
  | "cadastral-premium-pj"
  | "receita-federal-pj-v3"
  | "analise-credito-basic-pj"
  | "dossie-credito-pj"
  | "cadastral-score-pj";

export interface ProdutoDaApiBrasil {
  id: IdDoProduto;
  nome: string;
  documento: TipoDeDocumento;
  /** `/api/v2/{rota}/{cpf|cnpj}/credits`. Só a API CNPJ usa "dados". */
  rota: "consulta" | "dados";
  /** R$, da doc em 18/10/2026. Só para a estimativa. */
  precoDeReferencia: number;
}

export const PRODUTOS: Record<IdDoProduto, ProdutoDaApiBrasil> = {
  "cpf-lite": { id: "cpf-lite", nome: "CPF Lite", documento: "cpf", rota: "consulta", precoDeReferencia: 0.12 },
  "receita-federal": { id: "receita-federal", nome: "CPF Receita Federal", documento: "cpf", rota: "consulta", precoDeReferencia: 0.34 },
  "cpf-dados": { id: "cpf-dados", nome: "CPF Dados", documento: "cpf", rota: "consulta", precoDeReferencia: 4.5 },
  "analise-credito-plus-pf": { id: "analise-credito-plus-pf", nome: "Análise de Crédito Plus PF", documento: "cpf", rota: "consulta", precoDeReferencia: 29.02 },
  "acerta-essencial-positivo": { id: "acerta-essencial-positivo", nome: "Acerta Essencial Plus", documento: "cpf", rota: "consulta", precoDeReferencia: 4.49 },
  cnpj: { id: "cnpj", nome: "API CNPJ (Receita)", documento: "cnpj", rota: "dados", precoDeReferencia: 0.04 },
  "cnpj-cadastral": { id: "cnpj-cadastral", nome: "CNPJ Cadastral", documento: "cnpj", rota: "consulta", precoDeReferencia: 0.55 },
  "cadastral-premium-pj": { id: "cadastral-premium-pj", nome: "CNPJ Cadastral Premium", documento: "cnpj", rota: "consulta", precoDeReferencia: 3.75 },
  "receita-federal-pj-v3": { id: "receita-federal-pj-v3", nome: "Receita Federal PJ V3", documento: "cnpj", rota: "consulta", precoDeReferencia: 6.35 },
  "analise-credito-basic-pj": { id: "analise-credito-basic-pj", nome: "Análise de Crédito Basic PJ", documento: "cnpj", rota: "consulta", precoDeReferencia: 10.06 },
  "dossie-credito-pj": { id: "dossie-credito-pj", nome: "Dossiê de Crédito PJ", documento: "cnpj", rota: "consulta", precoDeReferencia: 4.4 },
  "cadastral-score-pj": { id: "cadastral-score-pj", nome: "Cadastral + Score PJ", documento: "cnpj", rota: "consulta", precoDeReferencia: 1.3 },
};

export const NIVEIS = ["basico", "dados", "credito", "completo_economico", "completo_score", "completo_integral"] as const;
export type Nivel = (typeof NIVEIS)[number];

export interface NivelDaConsulta {
  id: Nivel;
  rotulo: string;
  /** O que traz, em uma linha para a tela. */
  traz: string;
  /** O que fica de fora, quando é um pacote econômico. */
  deixaDeFora: string | null;
  produtos: IdDoProduto[];
}

export const NIVEIS_DO_CPF: NivelDaConsulta[] = [
  { id: "basico", rotulo: "Básico", traz: "Nome, mãe, nascimento, sexo e situação na Receita (com a data).", deixaDeFora: null, produtos: ["cpf-lite", "receita-federal"] },
  {
    id: "dados",
    rotulo: "Dados",
    traz: "Endereço, faixa de renda, PEP, óbito, sanções (CEIS/CNEP), processos criminais, mandado de prisão e listas restritivas.",
    deixaDeFora: null,
    produtos: ["cpf-dados"],
  },
  {
    id: "credito",
    rotulo: "Crédito",
    traz: "Decisão do bureau, scores, débitos, protestos, cheques, ações cíveis, consultas anteriores, telefone e endereço.",
    deixaDeFora: null,
    produtos: ["analise-credito-plus-pf"],
  },
  {
    id: "completo_economico",
    rotulo: "Completo econômico",
    traz: "Dados + crédito: score, pendências, protestos, cheques, ações, consultas anteriores, telefone, renda e compliance.",
    deixaDeFora: "A frase de decisão do bureau, os outros modelos de score e o detalhe de cheques.",
    produtos: ["acerta-essencial-positivo", "cpf-dados"],
  },
  {
    id: "completo_integral",
    rotulo: "Completo integral",
    traz: "Tudo dos três níveis: o crédito completo com decisão e todos os scores, e o compliance.",
    deixaDeFora: "Só a data da situação na Receita (o Plus PF traz a situação).",
    produtos: ["cpf-dados", "analise-credito-plus-pf"],
  },
];

export const NIVEIS_DO_CNPJ: NivelDaConsulta[] = [
  {
    id: "basico",
    rotulo: "Básico",
    traz: "Dados da Receita (situação, CNAEs, Simples/MEI, endereço, telefone), faixa de faturamento e os sócios com PEP/óbito.",
    deixaDeFora: null,
    produtos: ["cnpj-cadastral", "receita-federal-pj-v3"],
  },
  {
    id: "dados",
    rotulo: "Dados",
    traz: "Cadastro enriquecido: inscrição estadual, telefones, e-mails, endereços, sócios com % e participações em outras empresas.",
    deixaDeFora: null,
    produtos: ["cadastral-premium-pj"],
  },
  {
    id: "credito",
    rotulo: "Crédito",
    traz: "Negativações, protestos, cheques sem fundo, ações judiciais, consultas anteriores e quadro societário. Sem score.",
    deixaDeFora: null,
    produtos: ["analise-credito-basic-pj"],
  },
  {
    id: "completo_economico",
    rotulo: "Completo econômico",
    traz: "Receita, sócios com PEP/óbito, pendências, protestos, cheques, ações e quadro societário.",
    deixaDeFora: "Inscrição estadual, lista de e-mails, % de participação dos sócios e contagem de consultas anteriores.",
    produtos: ["cnpj", "cnpj-cadastral", "dossie-credito-pj"],
  },
  {
    id: "completo_score",
    rotulo: "Completo com score",
    traz: "O completo econômico mais o score e o risco de inadimplência da empresa.",
    deixaDeFora: "O mesmo do econômico.",
    produtos: ["cnpj", "cnpj-cadastral", "dossie-credito-pj", "cadastral-score-pj"],
  },
  {
    id: "completo_integral",
    rotulo: "Completo integral",
    traz: "Os quatro produtos dos três níveis. Sem score (nenhum dos quatro traz).",
    deixaDeFora: null,
    produtos: ["cnpj-cadastral", "receita-federal-pj-v3", "cadastral-premium-pj", "analise-credito-basic-pj"],
  },
];

export const niveisDe = (tipo: TipoDeDocumento) => (tipo === "cpf" ? NIVEIS_DO_CPF : NIVEIS_DO_CNPJ);
export const nivelDe = (tipo: TipoDeDocumento, nivel: Nivel) => niveisDe(tipo).find((n) => n.id === nivel) ?? null;
export const precoDeReferencia = (n: NivelDaConsulta) => Math.round(n.produtos.reduce((s, p) => s + PRODUTOS[p].precoDeReferencia, 0) * 100) / 100;

export const FINALIDADES = {
  financiamento: "Financiamento",
  venda_a_prazo: "Venda a prazo",
  compra_de_veiculo: "Compra do veículo do cliente",
  cadastro_de_cliente: "Cadastro de cliente",
  cadastro_de_fornecedor: "Cadastro de fornecedor",
  prevencao_a_fraude: "Prevenção a fraude",
} as const;
export type Finalidade = keyof typeof FINALIDADES;

// ─────────────────────────────────────────────────────────────────────────────
// O pedido
// ─────────────────────────────────────────────────────────────────────────────

export interface PedidoDeDocumento {
  tipo: TipoDeDocumento;
  /** Normalizado: 11 dígitos, ou 14 posições de CNPJ (pode ser alfanumérico). */
  documento: string;
  nivel: Nivel;
  finalidade: Finalidade;
}

export type LeituraDoPedido = { ok: true; pedido: PedidoDeDocumento } | { ok: false; motivo: string };

/** Confere o que a tela mandou. A declaração de que o titular está negociando é obrigatória. */
export function lerPedidoDeDocumento(corpo: unknown): LeituraDoPedido {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const tipo = c.tipo === "cpf" || c.tipo === "cnpj" ? c.tipo : null;
  if (!tipo) return { ok: false, motivo: "Escolha CPF ou CNPJ." };
  const bruto = typeof c.documento === "string" ? c.documento : "";
  const documento = tipo === "cpf" ? soDigitosDoCpf(bruto) : soCaracteresDoCnpj(bruto);
  if (tipo === "cpf" ? !cpfValido(documento) : !cnpjValido(documento)) return { ok: false, motivo: tipo === "cpf" ? "CPF inválido: confira os dígitos." : "CNPJ inválido: confira os dígitos." };
  const nivel = (NIVEIS as readonly string[]).includes(String(c.nivel)) ? (c.nivel as Nivel) : null;
  if (!nivel || !nivelDe(tipo, nivel)) return { ok: false, motivo: "Escolha o nível da consulta." };
  const finalidade = typeof c.finalidade === "string" && c.finalidade in FINALIDADES ? (c.finalidade as Finalidade) : null;
  if (!finalidade) return { ok: false, motivo: "Diga a finalidade da consulta (é exigência da LGPD)." };
  if (c.titularCiente !== true) return { ok: false, motivo: "Confirme que o titular está em negociação com a loja." };
  return { ok: true, pedido: { tipo, documento, nivel, finalidade } };
}

export const documentoFormatado = (tipo: TipoDeDocumento, documento: string) => (tipo === "cpf" ? formatarCpf(documento) : formatarCnpj(documento));

// ─────────────────────────────────────────────────────────────────────────────
// Ler o que o fornecedor devolve
// ─────────────────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** `pegar(o, "a.b.0.c")`. */
export function pegar(origem: unknown, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((atual, chave) => {
    if (Array.isArray(atual)) return atual[Number(chave)];
    const o = obj(atual);
    return o ? o[chave] : undefined;
  }, origem);
}

/** Um valor do fornecedor como texto da tela. Vazio, "null" e "[omitido]" viram `null`. */
export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString("pt-BR") : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t.toLowerCase() === "null" || t === "[omitido]" ? null : t;
}

/** "R$ 1.234,56" a partir do que o fornecedor manda ("1234.56", "1.234,56", 1234.56). */
export function reais(v: unknown): string | null {
  const n = numeroDoFornecedor(v);
  return n === null ? texto(v) : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Número do fornecedor: aceita 4.4, "4,400", "4.971,310", "10000.00". */
export function numeroDoFornecedor(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.replace(/[^\d,.-]/g, "");
  if (t === "") return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** "20220121" ou "2022-01-21" → "21/01/2022"; o resto volta como veio. */
export function data(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const compacta = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compacta) return `${compacta[3]}/${compacta[2]}/${compacta[1]}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return t;
}

const linha = (rotulo: string, valor: string | null, estado?: EstadoDoItem): LinhaDoRelatorio => (estado ? { rotulo, valor, estado } : { rotulo, valor });

/** Um item de lista de formato desconhecido, em uma linha: "chave: valor · chave: valor". */
export function itemEmTexto(item: unknown): string | null {
  const o = obj(item);
  if (!o) return texto(item);
  const partes = Object.entries(o)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => {
      const t = texto(v);
      return t ? `${k.replace(/_/g, " ")}: ${t}` : null;
    })
    .filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** Tabela de uma lista cujo formato a doc não mostra: uma coluna com o item inteiro. */
const tabelaGenerica = (titulo: string, itens: unknown[]): TabelaDoRelatorio => ({ titulo, colunas: ["Registro"], linhas: itens.map((i) => [itemEmTexto(i)]) });

const tabela = (titulo: string, itens: unknown[], colunas: Array<[string, (i: unknown) => string | null]>): TabelaDoRelatorio => ({
  titulo,
  colunas: colunas.map(([c]) => c),
  linhas: itens.map((i) => colunas.map(([, f]) => f(i))),
});

const simNao = (v: unknown): string | null => (v === true ? "Sim" : v === false ? "Não" : texto(v));
/** Indicador de risco: "Sim" é atenção (ou impeditivo), "Não" é ok, nulo é "não informado". */
const indicador = (rotulo: string, v: unknown, grave = false): LinhaDoRelatorio =>
  linha(rotulo, simNao(v), v === true || v === "S" ? (grave ? "impeditivo" : "atencao") : v === false || v === "N" ? "ok" : undefined);

/** Lista de ocorrências: quantos, com estado (zero é ok). */
const contagem = (rotulo: string, v: unknown, grave = false): LinhaDoRelatorio => {
  if (v === null || v === undefined) return linha(rotulo, null);
  const n = Array.isArray(v) ? v.length : (numeroDoFornecedor(v) ?? 0);
  return linha(rotulo, n === 0 ? "Nenhum registro" : `${n} ${n === 1 ? "registro" : "registros"}`, n === 0 ? "ok" : grave ? "impeditivo" : "atencao");
};

const endereco = (partes: unknown[]) => {
  const t = partes.map(texto).filter(Boolean).join(", ");
  return t === "" ? null : t;
};

/** O que cada leitor entrega. */
export interface LeituraDoProduto {
  titular: string | null;
  resumo: LinhaDoRelatorio[];
  secoes: SecaoDoRelatorio[];
}

const secao = (titulo: string, origem: IdDoProduto, linhas: LinhaDoRelatorio[], tabelas: TabelaDoRelatorio[] = []): SecaoDoRelatorio => ({
  titulo,
  origem: PRODUTOS[origem].nome,
  linhas,
  tabelas,
});

const situacaoRegular = (v: unknown): EstadoDoItem | undefined => {
  const t = texto(v)?.toUpperCase();
  if (!t) return undefined;
  return /^(REGULAR|ATIV[AO])$/.test(t) ? "ok" : "atencao";
};

/** Situação cadastral do CNPJ na Receita pelo código. */
const SITUACAO_DO_CNPJ: Record<string, string> = { "01": "NULA", "1": "NULA", "02": "ATIVA", "2": "ATIVA", "03": "SUSPENSA", "3": "SUSPENSA", "04": "INAPTA", "4": "INAPTA", "08": "BAIXADA", "8": "BAIXADA" };

// ── CPF ──────────────────────────────────────────────────────────────────────

function lerCpfLite(d: unknown): LeituraDoProduto {
  return {
    titular: texto(pegar(d, "nome")),
    resumo: [],
    secoes: [
      secao("Identificação", "cpf-lite", [
        linha("Nome", texto(pegar(d, "nome"))),
        linha("Nome da mãe", texto(pegar(d, "nome_mae"))),
        linha("Nascimento", data(pegar(d, "data_nascimento"))),
        linha("Idade", texto(pegar(d, "idade"))),
      ]),
    ],
  };
}

function lerReceitaFederal(d: unknown): LeituraDoProduto {
  const c = pegar(d, "content.nome.conteudo");
  const situacao = pegar(c, "situacao_receita");
  return {
    titular: texto(pegar(c, "nome")),
    resumo: [linha("Situação na Receita", texto(situacao), situacaoRegular(situacao))],
    secoes: [
      secao("Receita Federal", "receita-federal", [
        linha("Nome", texto(pegar(c, "nome"))),
        linha("Nome da mãe", texto(pegar(c, "mae"))),
        linha("Nascimento", data(pegar(c, "data_nascimento"))),
        linha("Idade", texto(pegar(c, "idade"))),
        linha("Sexo", texto(pegar(c, "sexo"))),
        linha("Situação", texto(situacao), situacaoRegular(situacao)),
        linha("Situação desde", data(pegar(c, "situacao_receita_data"))),
      ]),
    ],
  };
}

const LISTAS_DE_COMPLIANCE: Array<[string, string, boolean]> = [
  ["mandado_prisao", "Mandado de prisão", true],
  ["processos_criminais", "Processos criminais", true],
  ["trabalho_analogo_escravidao", "Trabalho análogo à escravidão", true],
  ["ceis", "CEIS (empresas inidôneas e suspensas)", false],
  ["cnep", "CNEP (empresas punidas)", false],
  ["lista_restritiva_internacional", "Listas restritivas internacionais", false],
  ["inelegibilidade_improbidade_administrativa", "Inelegibilidade e improbidade", false],
  ["embargos_ambientais", "Embargos ambientais", false],
  ["participacao_sociedade_risco", "Participação em sociedade de risco", false],
  ["processos_eleitorais", "Processos eleitorais", false],
  ["midias_negativas", "Mídias negativas", false],
];

function lerCpfDados(d: unknown): LeituraDoProduto {
  const r = pegar(d, "resultado");
  const ind = pegar(r, "indicadores");
  const listas = LISTAS_DE_COMPLIANCE.map(([chave, rotulo, grave]) => contagem(rotulo, pegar(r, chave), grave));
  const comRegistro = LISTAS_DE_COMPLIANCE.filter(([chave]) => lista(pegar(r, chave)).length > 0);
  const pep = pegar(ind, "pep");
  const obito = pegar(ind, "obito");
  const alertas = comRegistro.length + (pep === true ? 1 : 0) + (obito === true ? 1 : 0);
  return {
    titular: texto(pegar(r, "nome")),
    resumo: [
      linha(
        "Compliance (PEP, óbito, sanções, processos)",
        alertas === 0 ? "Nada encontrado" : `${alertas} ${alertas === 1 ? "apontamento" : "apontamentos"}`,
        alertas === 0 ? "ok" : comRegistro.some(([, , grave]) => grave) || obito === true ? "impeditivo" : "atencao",
      ),
      linha("Faixa de renda", texto(pegar(r, "financeiro.faixa_renda_descricao"))),
    ],
    secoes: [
      secao("Cadastro", "cpf-dados", [
        linha("Nome", texto(pegar(r, "nome"))),
        linha("Nome social", texto(pegar(r, "nome_social"))),
        linha("Nome da mãe", texto(pegar(r, "nome_mae"))),
        linha("Nascimento", data(pegar(r, "data_nascimento"))),
        linha("Idade", texto(pegar(r, "idade"))),
        linha("Gênero", texto(pegar(r, "genero"))),
        linha("Situação do CPF", texto(pegar(r, "documento.status")), situacaoRegular(pegar(r, "documento.status"))),
        linha(
          "Endereço",
          endereco([
            pegar(r, "endereco.logradouro"),
            pegar(r, "endereco.numero"),
            pegar(r, "endereco.complemento"),
            pegar(r, "endereco.bairro"),
            pegar(r, "endereco.cidade"),
            pegar(r, "endereco.estado"),
            pegar(r, "endereco.cep"),
          ]),
        ),
        linha("Faixa de renda", texto(pegar(r, "financeiro.faixa_renda_descricao"))),
        linha("Ocupação", texto(pegar(r, "classificacao_profissao_natureza_ocupacao"))),
      ]),
      secao(
        "Indicadores e compliance",
        "cpf-dados",
        [
          indicador("Pessoa politicamente exposta (PEP)", pep),
          indicador("Óbito", obito, true),
          indicador("Agente público", pegar(ind, "agente_publico")),
          indicador("Beneficiário de programa social", pegar(ind, "beneficiario_social")),
          indicador("Restrição regulatória", pegar(ind, "restricao_regulatoria")),
          indicador("CPF duplicado", pegar(ind, "cpf_duplicado")),
          indicador("Interdição judicial", pegar(ind, "interdicao_judicial"), true),
          indicador("Ligação com paraísos fiscais", pegar(ind, "paraisos_fiscais")),
          ...listas,
        ],
        comRegistro.map(([chave, rotulo]) => tabelaGenerica(rotulo, lista(pegar(r, chave)))),
      ),
    ],
  };
}

function lerCreditoPlusPf(d: unknown): LeituraDoProduto {
  const r = pegar(d, "resultado");
  const id = pegar(r, "identificacao");
  const loc = pegar(r, "localizacao");
  const aprova = texto(pegar(r, "decisao.aprova"));
  const scores = lista(pegar(r, "score_classificacao_varios_modelos"));
  const telefones = [1, 2, 3]
    .map((i) => [texto(pegar(loc, `ddd_${i}`)), texto(pegar(loc, `telefone_${i}`))])
    .filter(([, t]) => t)
    .map(([ddd, t]) => `(${(ddd ?? "").replace(/^0+/, "")}) ${t}`)
    .join(" · ");
  const debitos = pegar(r, "debitos");
  const protestos = pegar(r, "titulos_protestados");
  const acoes = pegar(r, "relacao_de_acoes_civeis");
  const ccf = pegar(r, "relacao_devolucoes_informadas_pelo_ccf");
  return {
    titular: texto(pegar(id, "nomes")),
    resumo: [
      linha("Decisão do bureau", texto(pegar(r, "decisao.texto")), aprova === "S" ? "ok" : aprova === "N" ? "impeditivo" : undefined),
      linha("Score (principal)", [texto(pegar(scores, "0.score")), texto(pegar(scores, "0.nome_score"))].filter(Boolean).join(" · ") || null),
      contagem("Débitos", debitos),
      contagem("Protestos", protestos),
    ],
    secoes: [
      secao("Identificação", "analise-credito-plus-pf", [
        linha("Nome", texto(pegar(id, "nomes"))),
        linha("Nome da mãe", texto(pegar(id, "nome_mae"))),
        linha("Nascimento", data(pegar(id, "data_nascimento"))),
        linha("Sexo", texto(pegar(id, "sexo_consultado"))),
        linha("Situação na Receita", texto(pegar(id, "situacao_receita")), situacaoRegular(pegar(id, "situacao_receita"))),
        linha("Estado civil", texto(pegar(id, "estado_civil"))),
        linha("Escolaridade", texto(pegar(id, "grau_instrucao"))),
        linha("Dependentes", texto(pegar(id, "numero_dependentes"))),
        linha("RG", [texto(pegar(id, "numero_rg")), texto(pegar(id, "orgao_emissor"))].filter(Boolean).join(" · ") || null),
        linha("Título de eleitor", texto(pegar(id, "titulo_eleitor"))),
        linha(
          "Endereço",
          endereco([pegar(loc, "tipo_logradouro"), pegar(loc, "nome_logradouro"), pegar(loc, "numero_logradouro"), pegar(loc, "complemento"), pegar(loc, "bairro"), pegar(loc, "cidade"), pegar(loc, "unidade_federativa"), pegar(loc, "cep")]),
        ),
        linha("Telefones", telefones || null),
      ]),
      secao(
        "Crédito",
        "analise-credito-plus-pf",
        [
          linha("Decisão", texto(pegar(r, "decisao.texto")), aprova === "S" ? "ok" : aprova === "N" ? "impeditivo" : undefined),
          contagem("Débitos", debitos),
          linha("Total devedor", reais(pegar(r, "resumo_ocorrencias_de_debitos.total_devedor"))),
          contagem("Títulos protestados", protestos),
          contagem("Cheques devolvidos (CCF)", ccf),
          contagem("Cheques sustados", pegar(r, "cheque_talao_sustado")),
          contagem("Ações cíveis", acoes),
          linha("Consultas nos últimos 90 dias", texto(pegar(r, "resumo_consultas_anteriores_90_dias.total"))),
        ],
        [
          tabela("Scores", scores, [
            ["Modelo", (i) => texto(pegar(i, "nome_score"))],
            ["Score", (i) => texto(pegar(i, "score"))],
            ["Classificação", (i) => texto(pegar(i, "classificacao"))],
            ["Leitura", (i) => texto(pegar(i, "texto"))],
          ]),
          ...(lista(debitos).length ? [tabelaGenerica("Débitos", lista(debitos))] : []),
          ...(lista(protestos).length ? [tabelaGenerica("Protestos", lista(protestos))] : []),
          ...(lista(acoes).length ? [tabelaGenerica("Ações cíveis", lista(acoes))] : []),
          ...(lista(ccf).length ? [tabelaGenerica("Cheques devolvidos", lista(ccf))] : []),
          tabela("Consultas anteriores", lista(pegar(r, "consultas_anteriores")), [
            ["Data", (i) => texto(pegar(i, "data"))],
            ["Quem consultou", (i) => texto(pegar(i, "informante"))],
            ["Tipo", (i) => texto(pegar(i, "tipo_ocorrencia"))],
          ]),
        ],
      ),
    ],
  };
}

/** O Acerta Essencial Plus devolve um envelope próprio (`response.data.dados[0]`); aceita as variações. */
function raizDoAcerta(d: unknown): unknown {
  for (const caminho of ["dados.0", "data.dados.0", "response.data.dados.0", ""]) {
    const c = caminho ? pegar(d, caminho) : d;
    if (pegar(c, "acertaEssencialPositivo.consultaCredito")) return c;
  }
  return d;
}

function lerAcertaPlus(d: unknown): LeituraDoProduto {
  const raiz = raizDoAcerta(d);
  const cc = pegar(raiz, "acertaEssencialPositivo.consultaCredito");
  const dc = pegar(cc, "dadosCadastrais");
  const resumoDe = (chave: string) => pegar(cc, `resumoConsulta.${chave}`);
  const qtd = (chave: string, lista_: unknown) => numeroDoFornecedor(pegar(resumoDe(chave), "quantidadeTotal")) ?? lista(lista_).length;
  const pend = pegar(cc, "pendenciasFinanceiras");
  const prot = pegar(cc, "protestos");
  const contar = (rotulo: string, chave: string, lista_: unknown, grave = false): LinhaDoRelatorio => {
    const n = qtd(chave, lista_);
    const valor = reais(pegar(resumoDe(chave), "valorTotal"));
    return linha(rotulo, n === 0 ? "Nenhum registro" : `${n} ${n === 1 ? "registro" : "registros"}${valor ? ` · ${valor}` : ""}`, n === 0 ? "ok" : grave ? "impeditivo" : "atencao");
  };
  const listas: Array<[string, unknown]> = [
    ["Pendências financeiras", pend],
    ["Protestos", prot],
    ["Cheques sem fundo", pegar(cc, "chequesSemFundo")],
    ["Cheques sustados", pegar(cc, "chequesSustados")],
    ["Ações cíveis", pegar(cc, "acoesCiveis")],
    ["Crédito obtido", pegar(cc, "creditoObtido")],
    ["Participação em empresas", pegar(cc, "participacaoEmEmpresas")],
  ];
  return {
    titular: texto(pegar(dc, "nome")),
    resumo: [
      linha("Score", [texto(pegar(cc, "score.score")), texto(pegar(cc, "score.mensagem"))].filter(Boolean).join(" · ") || null),
      contar("Pendências financeiras", "pendenciasFinanceiras", pend),
      contar("Protestos", "protestos", prot),
    ],
    secoes: [
      secao("Cadastro", "acerta-essencial-positivo", [
        linha("Nome", texto(pegar(dc, "nome"))),
        linha("Nome da mãe", texto(pegar(dc, "nomeMae"))),
        linha("Nascimento", data(pegar(dc, "dataNascimento"))),
        linha("Situação na Receita", texto(pegar(dc, "situacao")), situacaoRegular(pegar(dc, "situacao"))),
        linha("Estado civil", texto(pegar(dc, "estadoCivil"))),
        linha("Escolaridade", texto(pegar(dc, "grauInstrucao"))),
        linha("Endereço", endereco([pegar(dc, "endereco"), pegar(dc, "bairro"), pegar(dc, "cidade"), pegar(dc, "uf"), pegar(dc, "cep")])),
        linha("Telefone", texto(pegar(dc, "telefone"))),
        linha("Renda presumida", texto(pegar(dc, "rendaPresumida"))),
      ]),
      secao(
        "Crédito",
        "acerta-essencial-positivo",
        [
          linha("Score", texto(pegar(cc, "score.score"))),
          linha("Probabilidade de inadimplência", texto(pegar(cc, "score.probabilidade"))),
          linha("Leitura do score", texto(pegar(cc, "score.mensagem"))),
          linha("Score rating", texto(pegar(raiz, "scoreRating.score"))),
          contar("Pendências financeiras", "pendenciasFinanceiras", pend),
          contar("Protestos", "protestos", prot),
          contar("Cheques sem fundo", "chequesSemFundo", pegar(cc, "chequesSemFundo")),
          contar("Cheques sustados", "chequesSustados", pegar(cc, "chequesSustados")),
          contar("Ações cíveis", "acoesCiveis", pegar(cc, "acoesCiveis")),
          contagem("Protesto nacional", pegar(raiz, "protestoNacional.ocorrencias") ?? pegar(d, "protestoNacional.ocorrencias")),
        ],
        [
          ...listas.filter(([, l]) => lista(l).length > 0).map(([t, l]) => tabelaGenerica(t, lista(l))),
          tabela("Consultas anteriores", lista(pegar(cc, "historicoConsultas")), [
            ["Data", (i) => texto(pegar(i, "data"))],
            ["Empresa", (i) => texto(pegar(i, "empresa"))],
          ]),
        ],
      ),
    ],
  };
}

// ── CNPJ ─────────────────────────────────────────────────────────────────────

function lerApiCnpj(d: unknown): LeituraDoProduto {
  const c = obj(pegar(d, "cnpj")) ? pegar(d, "cnpj") : pegar(d, "dados");
  const codigo = texto(pegar(c, "situacao_cadastral"));
  const situacao = codigo ? (SITUACAO_DO_CNPJ[codigo] ?? codigo) : null;
  return {
    titular: texto(pegar(c, "empresa.razao_social")),
    resumo: [linha("Situação na Receita", situacao, situacaoRegular(situacao))],
    secoes: [
      secao(
        "Receita Federal",
        "cnpj",
        [
          linha("Razão social", texto(pegar(c, "empresa.razao_social"))),
          linha("Nome fantasia", texto(pegar(c, "nome_fantasia"))),
          linha("Situação", situacao, situacaoRegular(situacao)),
          linha("Situação desde", data(pegar(c, "data_situacao_cadastral"))),
          linha("Motivo", texto(pegar(c, "motivo_situacao.descricao"))),
          linha("Início das atividades", data(pegar(c, "data_inicio_atividades"))),
          linha("Matriz ou filial", texto(pegar(c, "matriz_filial")) === "1" ? "Matriz" : texto(pegar(c, "matriz_filial")) === "2" ? "Filial" : null),
          linha("Capital social", reais(pegar(c, "empresa.capital_social"))),
          linha("CNAE principal", [texto(pegar(c, "cnae_fiscal")), texto(pegar(c, "cnae.0.descricao"))].filter(Boolean).join(" · ") || null),
          linha("CNAEs secundários", texto(pegar(c, "cnae_fiscal_secundaria"))),
          linha("Simples Nacional", texto(pegar(c, "simples.opcao_simples")) === "S" ? "Optante" : texto(pegar(c, "simples.opcao_simples")) === "N" ? "Não optante" : null),
          linha("MEI", texto(pegar(c, "simples.opcao_mei")) === "S" ? "Sim" : texto(pegar(c, "simples.opcao_mei")) === "N" ? "Não" : null),
          linha(
            "Endereço",
            endereco([pegar(c, "tipo_logradouro"), pegar(c, "logradouro"), pegar(c, "numero"), pegar(c, "complemento"), pegar(c, "bairro"), pegar(c, "municipio.descricao"), pegar(c, "uf"), pegar(c, "cep")]),
          ),
          linha("Telefone", texto(pegar(c, "telefone1")) ? `(${texto(pegar(c, "ddd1")) ?? ""}) ${texto(pegar(c, "telefone1"))}` : null),
        ],
        [
          tabela("Quadro de sócios (Receita)", lista(pegar(c, "socios")), [
            ["Nome", (i) => texto(pegar(i, "nome_socio"))],
            ["CPF/CNPJ", (i) => texto(pegar(i, "cnpj_cpf_socio"))],
            ["Qualificação", (i) => texto(pegar(i, "qualificacao.descricao"))],
            ["Entrada", (i) => data(pegar(i, "data_entrada_sociedade"))],
          ]),
        ],
      ),
    ],
  };
}

function lerCnpjCadastral(d: unknown): LeituraDoProduto {
  const r = pegar(d, "resultado");
  return {
    titular: texto(pegar(r, "nome")),
    resumo: [linha("Faixa de faturamento", reais(pegar(r, "financeiro.faixa_renda_valor")))],
    secoes: [
      secao(
        "Cadastro e sócios",
        "cnpj-cadastral",
        [
          linha("Razão social", texto(pegar(r, "nome"))),
          linha("Abertura", data(pegar(r, "data_nascimento"))),
          linha("Porte", texto(pegar(r, "size"))),
          linha("Situação", texto(pegar(r, "documento.status")), situacaoRegular(pegar(r, "documento.status"))),
          linha("Natureza jurídica", texto(pegar(r, "legalNatureDescription"))),
          linha("Capital social", reais(pegar(r, "financeiro.social_capital"))),
          linha("Faixa de faturamento", reais(pegar(r, "financeiro.faixa_renda_valor"))),
          linha("Endereço", endereco([pegar(r, "endereco.logradouro"), pegar(r, "endereco.numero"), pegar(r, "endereco.complemento"), pegar(r, "endereco.bairro"), pegar(r, "endereco.cidade"), pegar(r, "endereco.estado"), pegar(r, "endereco.cep")])),
        ],
        [
          tabela("Sócios", lista(pegar(r, "members")), [
            ["Nome", (i) => texto(pegar(i, "nome"))],
            ["Documento", (i) => texto(pegar(i, "documento.numero"))],
            ["Nascimento", (i) => data(pegar(i, "data_nascimento"))],
            ["PEP", (i) => simNao(pegar(i, "indicadores.pep"))],
            ["Óbito", (i) => simNao(pegar(i, "indicadores.obito"))],
            ["Restrição regulatória", (i) => simNao(pegar(i, "indicadores.restricao_regulatoria"))],
          ]),
        ],
      ),
    ],
  };
}

function lerCnpjPremium(d: unknown): LeituraDoProduto {
  const p = pegar(d, "cadastralPremiumPJ");
  const dc = pegar(p, "dadosCadastrais");
  const socios = lista(pegar(p, "socios"));
  const comRestricao = socios.filter((s) => pegar(s, "temRestricoes") === true).length;
  return {
    titular: texto(pegar(dc, "razaoSocial")),
    resumo: socios.length ? [linha("Sócios com restrição", comRestricao === 0 ? "Nenhum" : String(comRestricao), comRestricao === 0 ? "ok" : "atencao")] : [],
    secoes: [
      secao(
        "Cadastro enriquecido",
        "cadastral-premium-pj",
        [
          linha("Razão social", texto(pegar(dc, "razaoSocial"))),
          linha("Nome fantasia", texto(pegar(dc, "nomeFantasia"))),
          linha("Situação", texto(pegar(dc, "situacao")), situacaoRegular(pegar(dc, "situacao"))),
          linha("Fundação", data(pegar(dc, "dataFundacao"))),
          linha("Natureza jurídica", texto(pegar(dc, "naturezaJuridica"))),
          linha("Ramo de atividade", texto(pegar(dc, "ramoAtividade"))),
          linha("Capital inicial", texto(pegar(dc, "capitalInicial"))),
          linha("Inscrição estadual", texto(pegar(dc, "inscricaoEstadual"))),
          linha("E-mails", lista(pegar(p, "emails")).map((e) => texto(pegar(e, "email"))).filter(Boolean).join(" · ") || null),
        ],
        [
          tabela("Telefones", lista(pegar(p, "telefones")), [
            ["Telefone", (i) => [texto(pegar(i, "ddd")), texto(pegar(i, "numero"))].filter(Boolean).join(" ") || null],
            ["Tipo", (i) => texto(pegar(i, "tipo"))],
          ]),
          tabela("Endereços", lista(pegar(p, "enderecos")), [
            ["Endereço", (i) => endereco([pegar(i, "logradouro"), pegar(i, "numero"), pegar(i, "bairro"), pegar(i, "cidade"), pegar(i, "uf"), pegar(i, "cep")])],
          ]),
          tabela("Sócios", socios, [
            ["Nome", (i) => texto(pegar(i, "nome"))],
            ["CPF", (i) => texto(pegar(i, "cpf"))],
            ["Cargo", (i) => texto(pegar(i, "cargo"))],
            ["Participação", (i) => (texto(pegar(i, "percentualParticipacao")) ? `${texto(pegar(i, "percentualParticipacao"))}%` : null)],
            ["Restrições", (i) => simNao(pegar(i, "temRestricoes"))],
          ]),
          ...(lista(pegar(p, "administradores")).length ? [tabelaGenerica("Administradores", lista(pegar(p, "administradores")))] : []),
          tabela(
            "Participações dos sócios em outras empresas",
            lista(pegar(p, "participacoesPorSocios")).flatMap((s) => lista(pegar(s, "participacoes")).map((x) => ({ socio: pegar(s, "socioNome"), ...(obj(x) ?? {}) }))),
            [
              ["Sócio", (i) => texto(pegar(i, "socio"))],
              ["Empresa", (i) => texto(pegar(i, "empresa"))],
              ["CNPJ", (i) => texto(pegar(i, "cnpj"))],
              ["Participação", (i) => (texto(pegar(i, "participacaoEmPorcentagem")) ? `${texto(pegar(i, "participacaoEmPorcentagem"))}%` : null)],
            ],
          ),
        ],
      ),
    ],
  };
}

function lerReceitaPjV3(d: unknown): LeituraDoProduto {
  const r = pegar(d, "results");
  const codigo = texto(pegar(r, "situacao_cadastral.codigo"));
  const situacao = codigo ? (SITUACAO_DO_CNPJ[codigo] ?? codigo) : null;
  return {
    titular: texto(pegar(r, "nome_empresarial")),
    resumo: [linha("Situação na Receita", situacao, situacaoRegular(situacao))],
    secoes: [
      secao(
        "Receita Federal",
        "receita-federal-pj-v3",
        [
          linha("Razão social", texto(pegar(r, "nome_empresarial"))),
          linha("Nome fantasia", texto(pegar(r, "nome_fantasia"))),
          linha("Abertura", data(pegar(r, "data_abertura"))),
          linha("Situação", situacao, situacaoRegular(situacao)),
          linha("Situação desde", data(pegar(r, "situacao_cadastral.data"))),
          linha("Motivo", texto(pegar(r, "situacao_cadastral.motivo"))),
          linha("Natureza jurídica", [texto(pegar(r, "natureza_juridica.codigo")), texto(pegar(r, "natureza_juridica.descricao"))].filter(Boolean).join(" · ") || null),
          linha("CNAE principal", [texto(pegar(r, "cnae_principal.codigo")), texto(pegar(r, "cnae_principal.descricao"))].filter(Boolean).join(" · ") || null),
          linha("Capital social", reais(pegar(r, "capital_social"))),
          linha("Simples Nacional", simNao(pegar(r, "informacoes_adicionais.optante_simples"))),
          linha("MEI", simNao(pegar(r, "informacoes_adicionais.optante_mei"))),
          linha(
            "Endereço",
            endereco([pegar(r, "endereco.tipo_logradouro"), pegar(r, "endereco.logradouro"), pegar(r, "endereco.numero"), pegar(r, "endereco.complemento"), pegar(r, "endereco.bairro"), pegar(r, "endereco.municipio.descricao"), pegar(r, "endereco.uf"), pegar(r, "endereco.cep")]),
          ),
          linha("Telefones", lista(pegar(r, "telefones")).map((t) => [texto(pegar(t, "ddd")), texto(pegar(t, "numero"))].filter(Boolean).join(" ")).filter(Boolean).join(" · ") || null),
          linha("E-mail", texto(pegar(r, "correio_eletronico"))),
        ],
        [
          tabela("CNAEs secundários", lista(pegar(r, "cnae_secundarias")), [
            ["Código", (i) => texto(pegar(i, "codigo"))],
            ["Descrição", (i) => texto(pegar(i, "descricao"))],
          ]),
          tabela("Quadro de sócios", lista(pegar(r, "socios")), [
            ["Nome", (i) => texto(pegar(i, "nome"))],
            ["Documento", (i) => texto(pegar(i, "documento"))],
            ["Qualificação", (i) => texto(pegar(i, "qualificacao"))],
            ["Desde", (i) => data(pegar(i, "data_inclusao"))],
          ]),
        ],
      ),
    ],
  };
}

function lerCreditoBasicPj(d: unknown): LeituraDoProduto {
  const r = pegar(d, "resultado");
  const dc = pegar(r, "dados_cadastrais");
  const neg = pegar(r, "negativacoes");
  const protestosTotal = pegar(r, "protestos.0.total_protestos");
  return {
    titular: texto(pegar(dc, "nome_empresa")),
    resumo: [contagem("Negativações", pegar(neg, "apontamentos")), contagem("Protestos", protestosTotal ?? null), contagem("Ações judiciais", pegar(neg, "acoes_judiciais_apontamentos"))],
    secoes: [
      secao(
        "Crédito da empresa",
        "analise-credito-basic-pj",
        [
          linha("Empresa", texto(pegar(dc, "nome_empresa"))),
          linha("Situação", texto(pegar(dc, "status_empresa")), situacaoRegular(pegar(dc, "status_empresa"))),
          linha("NIRE", texto(pegar(dc, "nire"))),
          linha("Filiais", texto(pegar(dc, "contagem_filiais"))),
          contagem("Negativações", pegar(neg, "apontamentos")),
          contagem("Cheques sem fundo (CCF)", pegar(neg, "ccf_apontamentos")),
          contagem("Ações judiciais", pegar(neg, "acoes_judiciais_apontamentos")),
          contagem("Protestos", protestosTotal ?? null),
          linha("Valor protestado", reais(pegar(r, "protestos.0.valor_protestados_total"))),
          linha("Consultas nos últimos 30 dias", texto(pegar(r, "consultas.contagem_consultas_ultimos_30_dias"))),
          linha("Consultas de 31 a 60 dias", texto(pegar(r, "consultas.contagem_consultas_31_a_60_dias"))),
          linha("Consultas de 61 a 90 dias", texto(pegar(r, "consultas.contagem_consultas_61_a_90_dias"))),
          linha("Consultas há mais de 90 dias", texto(pegar(r, "consultas.contagem_consultas_mais_90_dias"))),
        ],
        [
          ...(lista(pegar(neg, "apontamentos")).length ? [tabelaGenerica("Negativações", lista(pegar(neg, "apontamentos")))] : []),
          ...(lista(pegar(neg, "acoes_judiciais_apontamentos")).length ? [tabelaGenerica("Ações judiciais", lista(pegar(neg, "acoes_judiciais_apontamentos")))] : []),
          tabela("Quadro societário", lista(pegar(r, "quadro_societario.socios")), [
            ["Nome", (i) => texto(pegar(i, "nomes"))],
            ["CPF/CNPJ", (i) => texto(pegar(i, "cpf_cnpj"))],
            ["Relação", (i) => texto(pegar(i, "descricao_relacionamento"))],
            ["Participação", (i) => (texto(pegar(i, "percentual_participacao")) ? `${texto(pegar(i, "percentual_participacao"))}%` : null)],
          ]),
        ],
      ),
    ],
  };
}

/** Os blocos do Dossiê com `quantidade_ocorrencia` e `ocorrencias`, de formato pouco documentado. */
const BLOCOS_DO_DOSSIE: Array<[string, string, boolean]> = [
  ["pend_financeiras", "Pendências financeiras", false],
  ["pend_refin", "Refinanciamentos (REFIN)", false],
  ["protestos", "Protestos", false],
  ["ch_sem_fundos_bacen", "Cheques sem fundo (Bacen)", false],
  ["ch_sem_fundos_varejo", "Cheques sem fundo (varejo)", false],
  ["acoes_civeis", "Ações cíveis", false],
  ["contumacia", "Contumácia (atraso recorrente)", true],
];

function lerDossiePj(d: unknown): LeituraDoProduto {
  const c = pegar(d, "credcadastral");
  const rf = pegar(c, "dados_receita_federal");
  const emp = pegar(c, "informacoes_da_empresa");
  const qtd = (bloco: string) => numeroDoFornecedor(pegar(c, `${bloco}.quantidade_ocorrencia`) ?? pegar(c, `${bloco}.quantidade_ocorrencias`));
  const linhaDoBloco = ([bloco, rotulo, grave]: [string, string, boolean]): LinhaDoRelatorio | null => {
    if (pegar(c, bloco) === undefined) return null;
    const n = qtd(bloco);
    const valor = reais(pegar(c, `${bloco}.valor_total`));
    if (n === null) return linha(rotulo, null);
    return linha(rotulo, n === 0 ? "Nenhum registro" : `${n} ${n === 1 ? "registro" : "registros"}${valor ? ` · ${valor}` : ""}`, n === 0 ? "ok" : grave ? "impeditivo" : "atencao");
  };
  const ocorrencias = BLOCOS_DO_DOSSIE.flatMap(([bloco, rotulo]) => {
    const l = lista(pegar(c, `${bloco}.ocorrencias`));
    return l.length ? [tabelaGenerica(rotulo, l)] : [];
  });
  const quadro = lista(pegar(c, "quadro_societario.ocorrencias") ?? pegar(c, "quadro_societario.socios") ?? pegar(c, "quadro_societario"));
  const adm = lista(pegar(c, "administradores_da_empresa.ocorrencias") ?? pegar(c, "administradores_da_empresa"));
  const linhasDeCredito = BLOCOS_DO_DOSSIE.map(linhaDoBloco).filter((l): l is LinhaDoRelatorio => l !== null);
  return {
    titular: texto(pegar(rf, "razao_social")) ?? texto(pegar(emp, "razao_social")),
    resumo: [linhaDoBloco(BLOCOS_DO_DOSSIE[0]), linhaDoBloco(BLOCOS_DO_DOSSIE[2])].filter((l): l is LinhaDoRelatorio => l !== null),
    secoes: [
      secao(
        "Dossiê de crédito",
        "dossie-credito-pj",
        [
          linha("Razão social", texto(pegar(rf, "razao_social")) ?? texto(pegar(emp, "razao_social"))),
          linha("Razão social anterior", texto(pegar(emp, "razao_social_anterior"))),
          linha("Situação", texto(pegar(rf, "situacao_receita")) ?? texto(pegar(emp, "situacao")), situacaoRegular(pegar(rf, "situacao_receita") ?? pegar(emp, "situacao"))),
          linha("Atividade principal", texto(pegar(rf, "atividade_economica_principal")) ?? texto(pegar(emp, "cnae_primario"))),
          linha("Porte", texto(pegar(emp, "porte"))),
          linha("Capital social", reais(pegar(emp, "capital_social"))),
          ...linhasDeCredito,
          linha("Último protesto", data(pegar(c, "protestos.ultimo_protesto"))),
          linha("Telefones", lista(pegar(c, "somente_telefone.dados")).map((t) => [texto(pegar(t, "ddd")), texto(pegar(t, "num_telefone"))].filter(Boolean).join(" ")).filter(Boolean).join(" · ") || null),
        ],
        [
          ...ocorrencias,
          ...(quadro.length ? [tabelaGenerica("Quadro societário", quadro)] : []),
          ...(adm.length ? [tabelaGenerica("Administradores", adm)] : []),
        ],
      ),
    ],
  };
}

function lerScorePj(d: unknown): LeituraDoProduto {
  const c = pegar(d, "credcadastral");
  const scores = lista(pegar(c, "scores.ocorrencias"));
  const risco = texto(pegar(scores, "0.risco"))?.toUpperCase();
  return {
    titular: texto(pegar(c, "dados_receita_federal.razao_social")),
    resumo: [
      linha(
        "Score da empresa",
        [texto(pegar(scores, "0.score")), risco ? `risco ${risco.toLowerCase()}` : null].filter(Boolean).join(" · ") || null,
        risco === "BAIXO" ? "ok" : risco === "ALTO" || risco === "MUITO ALTO" ? "impeditivo" : risco ? "atencao" : undefined,
      ),
    ],
    secoes: [
      secao(
        "Score",
        "cadastral-score-pj",
        [contagem("Alertas e restrições", pegar(c, "informacoes_alertas_restricoes.quantidade_ocorrencia"))],
        [
          tabela("Scores", scores, [
            ["Score", (i) => texto(pegar(i, "score"))],
            ["Risco", (i) => texto(pegar(i, "risco"))],
            ["Probabilidade de inadimplência", (i) => (texto(pegar(i, "probabilidade_inadimplencia")) ? `${texto(pegar(i, "probabilidade_inadimplencia"))}%` : null)],
            ["Classificação", (i) => texto(pegar(i, "classificacao"))],
          ]),
        ],
      ),
    ],
  };
}

export const LEITORES: Record<IdDoProduto, (dados: unknown) => LeituraDoProduto> = {
  "cpf-lite": lerCpfLite,
  "receita-federal": lerReceitaFederal,
  "cpf-dados": lerCpfDados,
  "analise-credito-plus-pf": lerCreditoPlusPf,
  "acerta-essencial-positivo": lerAcertaPlus,
  cnpj: lerApiCnpj,
  "cnpj-cadastral": lerCnpjCadastral,
  "cadastral-premium-pj": lerCnpjPremium,
  "receita-federal-pj-v3": lerReceitaPjV3,
  "analise-credito-basic-pj": lerCreditoBasicPj,
  "dossie-credito-pj": lerDossiePj,
  "cadastral-score-pj": lerScorePj,
};

// ─────────────────────────────────────────────────────────────────────────────
// Montar o relatório
// ─────────────────────────────────────────────────────────────────────────────

export type RespostaDoProduto = { produto: IdDoProduto; ok: true; dados: unknown } | { produto: IdDoProduto; ok: false; motivo: string };

const temConteudo = (s: SecaoDoRelatorio) => s.linhas.some((l) => l.valor !== null) || s.tabelas.some((t) => t.linhas.length > 0);

/**
 * Junta as respostas num relatório. Seção sem nenhum valor é tratada como
 * "não veio" (o formato mudou, ou o fornecedor não tinha): melhor dizer que
 * faltou do que mostrar uma seção de "não informado".
 */
export function montarRelatorio(
  pedido: Pick<PedidoDeDocumento, "tipo" | "documento" | "nivel">,
  respostas: RespostaDoProduto[],
  extra: { geradoEm: string; homologacao: boolean },
): RelatorioDeDocumento {
  const nivel = nivelDe(pedido.tipo, pedido.nivel);
  const faltou: RelatorioDeDocumento["faltou"] = [];
  const secoes: SecaoDoRelatorio[] = [];
  const resumo: LinhaDoRelatorio[] = [];
  let titular: string | null = null;
  for (const r of respostas) {
    const nome = PRODUTOS[r.produto].nome;
    if (!r.ok) {
      faltou.push({ produto: nome, motivo: r.motivo });
      continue;
    }
    let leitura: LeituraDoProduto;
    try {
      leitura = LEITORES[r.produto](r.dados);
    } catch {
      faltou.push({ produto: nome, motivo: "a resposta veio num formato que o painel não reconheceu; ela ficou guardada." });
      continue;
    }
    const comConteudo = leitura.secoes.filter(temConteudo);
    if (comConteudo.length === 0) {
      faltou.push({ produto: nome, motivo: "respondeu sem os dados esperados (titular não encontrado, ou formato diferente; a resposta ficou guardada)." });
      continue;
    }
    titular ??= leitura.titular;
    secoes.push(...comConteudo);
    // No resumo, o primeiro que disser algo sobre um rótulo vale (o mais completo vem antes no nível).
    for (const l of leitura.resumo) if (l.valor !== null && !resumo.some((x) => x.rotulo === l.rotulo)) resumo.push(l);
  }
  return {
    tipo: pedido.tipo,
    documento: documentoFormatado(pedido.tipo, pedido.documento),
    titular,
    nivel: nivel?.rotulo ?? pedido.nivel,
    geradoEm: extra.geradoEm,
    homologacao: extra.homologacao,
    resumo,
    secoes,
    faltou,
  };
}
