/**
 * A consulta de placa em NÍVEIS (dono, 19/10/2026: "a consulta de veículos
 * podia ter um sistema de preços de consulta, como as de CPF e CNPJ").
 *
 * Até aqui a placa era um produto só da APIBrasil, o Veículos Total (R$ 30),
 * lido por `lerRespostaDaApiBrasil` (`consultaDePlaca.ts`). Agora são quatro
 * níveis, escolhidos na tela pelo preço (levantamento da doc da APIBrasil em
 * 19/10/2026, escolha do dono):
 *
 *   básico ........ Base Estadual + Recall + FIPE
 *   intermediário . o básico + Check List (indícios de leilão, sinistro, chassi)
 *   econômico ..... o intermediário + Histórico de Proprietários (10 de 10)
 *   completo ...... Veículos Total, como era
 *
 * e o APROFUNDAR: de uma consulta guardada da mesma placa, sobe de nível
 * pagando só os produtos que faltam. Por isso cada produto vira um FRAGMENTO
 * — a leitura dele, já sem dado pessoal — que fica guardado na linha e é
 * reaproveitado; o retrato é montado juntando os fragmentos.
 *
 * Nada de dado pessoal sai daqui (regra do dono, 06/10/2026): o nome e o
 * documento do proprietário e do financiado, que a Base Estadual e o
 * Histórico de Proprietários trazem, não são lidos. Texto livre do
 * fornecedor passa por `semDocumentos`, e as mensagens de restrição do
 * Detran (que podem citar comprador ou financiado pelo nome) viram só a
 * categoria (`classificarRestricao`). A tranca do banco olha os NOMES das
 * chaves; o texto é responsabilidade daqui.
 *
 * Os preços NÃO estão aqui: vêm de `parametros_consulta_veiculo`. O que está
 * aqui é o catálogo (que produto traz o quê) e a política do fornecedor.
 */
import { cnpjValido } from "./cnpj";
import {
  dataDoFornecedor,
  decodificarChassi,
  numeroDoFornecedor,
  type Apontamento,
  type BlocoQueNaoVeio,
  type DebitosDoRetrato,
  type FipeDoRetrato,
  type GravameDoRetrato,
  type PontoDaFipe,
  type RetratoDaConsulta,
} from "./consultaDePlaca";

// ─────────────────────────────────────────────────────────────────────────────
// O catálogo
// ─────────────────────────────────────────────────────────────────────────────

export type ProdutoDeVeiculo = "estadual" | "recall" | "fipe" | "check-list" | "historico-proprietarios" | "veiculos-total";

/** As dez checagens do quadro (`quadroDeChecagens`), na ordem da tela. */
export const CHECAGENS = ["leilao", "sinistro", "gravame", "roubo_furto", "renajud", "restricoes", "debitos", "donos", "chassi", "recall"] as const;
export type ChaveDaChecagem = (typeof CHECAGENS)[number];

export interface ProdutoDaPlaca {
  id: ProdutoDeVeiculo;
  nome: string;
  /** O que ele confere das dez. */
  confere: ChaveDaChecagem[];
  /**
   * Cobra mesmo quando responde erro. A doc só diz que NÃO cobra no Débitos
   * Resumidos (fora do catálogo); para os outros vale o aviso padrão dela:
   * "parâmetro errado repetido continua cobrando".
   */
  cobraEmErro: boolean;
}

export const PRODUTOS_DA_PLACA: Record<ProdutoDeVeiculo, ProdutoDaPlaca> = {
  estadual: { id: "estadual", nome: "Base Estadual (Detran)", confere: ["gravame", "roubo_furto", "renajud", "restricoes", "debitos", "chassi"], cobraEmErro: true },
  recall: { id: "recall", nome: "Recall", confere: ["recall"], cobraEmErro: true },
  fipe: { id: "fipe", nome: "FIPE", confere: [], cobraEmErro: true },
  "check-list": { id: "check-list", nome: "Check List (leilão, sinistro, chassi)", confere: ["leilao", "sinistro", "chassi"], cobraEmErro: true },
  "historico-proprietarios": { id: "historico-proprietarios", nome: "Histórico de Proprietários", confere: ["donos"], cobraEmErro: true },
  "veiculos-total": { id: "veiculos-total", nome: "Veículos Total", confere: [...CHECAGENS], cobraEmErro: true },
};

export const NIVEIS_DA_PLACA_IDS = ["basico", "intermediario", "economico", "completo"] as const;
export type NivelDaPlaca = (typeof NIVEIS_DA_PLACA_IDS)[number];

export interface NivelDaConsultaDePlaca {
  id: NivelDaPlaca;
  rotulo: string;
  traz: string;
  deixaDeFora: string | null;
  produtos: ProdutoDeVeiculo[];
}

export const NIVEIS_DA_PLACA: NivelDaConsultaDePlaca[] = [
  {
    id: "basico",
    rotulo: "Básico",
    traz: "Cadastro do Detran, financiamento, roubo e furto, bloqueio judicial, restrições, débitos com valores, situação do chassi, recall e FIPE.",
    deixaDeFora: "Leilão, sinistro e donos anteriores.",
    produtos: ["estadual", "recall", "fipe"],
  },
  {
    id: "intermediario",
    rotulo: "Intermediário",
    traz: "O básico mais o Check List: indício de leilão, de sinistro (perda total, salvados, seguradora) e de chassi adulterado, e uso como táxi, locadora ou frota.",
    deixaDeFora: "Donos anteriores.",
    produtos: ["estadual", "recall", "fipe", "check-list"],
  },
  {
    id: "economico",
    rotulo: "Econômico 10/10",
    traz: "O intermediário mais o histórico de proprietários: as dez checagens.",
    deixaDeFora: "Leilão e sinistro vêm como indício (sem o detalhe do leilão), e não há KM, anúncios nem precificador.",
    produtos: ["estadual", "recall", "fipe", "check-list", "historico-proprietarios"],
  },
  {
    id: "completo",
    rotulo: "Completo",
    traz: "Veículos Total: as dez checagens com o leilão detalhado, histórico de KM, anúncios, análise de risco e FIPE com histórico.",
    deixaDeFora: null,
    produtos: ["veiculos-total"],
  },
];

export const nivelDaPlaca = (id: unknown): NivelDaConsultaDePlaca | null => NIVEIS_DA_PLACA.find((n) => n.id === id) ?? null;
export const ordemDoNivel = (id: NivelDaPlaca) => NIVEIS_DA_PLACA_IDS.indexOf(id);

export type PrecosDaPlaca = Partial<Record<ProdutoDeVeiculo, number>>;

/** A soma da tabela vigente para uma lista de produtos; `null` se algum não tem preço. */
export function precoDosProdutos(produtos: ProdutoDeVeiculo[], precos: PrecosDaPlaca): number | null {
  let soma = 0;
  for (const p of produtos) {
    const v = precos[p];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    soma += v;
  }
  return Math.round(soma * 100) / 100;
}

/**
 * O que falta comprar para chegar a `alvo` tendo `jaTem`. O completo é um
 * produto só (Veículos Total): não se monta com pedaços, então subir para ele
 * paga ele inteiro.
 */
export function produtosQueFaltam(alvo: NivelDaPlaca, jaTem: ProdutoDeVeiculo[]): ProdutoDeVeiculo[] {
  const nivel = nivelDaPlaca(alvo);
  if (!nivel) return [];
  return nivel.produtos.filter((p) => !jaTem.includes(p));
}

/** Os níveis para onde dá para subir a partir de uma consulta com `jaTem`, com o que falta em cada um. */
export function niveisParaAprofundar(atual: NivelDaPlaca, jaTem: ProdutoDeVeiculo[]): Array<{ nivel: NivelDaConsultaDePlaca; faltam: ProdutoDeVeiculo[] }> {
  return NIVEIS_DA_PLACA.filter((n) => ordemDoNivel(n.id) > ordemDoNivel(atual)).map((n) => ({ nivel: n, faltam: produtosQueFaltam(n.id, jaTem) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Ler o fornecedor
// ─────────────────────────────────────────────────────────────────────────────

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function texto(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t.toLowerCase() === "null" || t === "[omitido]" ? null : t;
}
function inteiro(v: unknown): number | null {
  const n = numeroDoFornecedor(v);
  return n !== null && Number.isInteger(n) ? n : null;
}
function pegar(origem: unknown, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((atual, chave) => (Array.isArray(atual) ? atual[Number(chave)] : objeto(atual)?.[chave]), origem);
}
/** "1", 1, true, "S", "SIM" → sim. */
const sim = (v: unknown) => v === true || v === 1 || /^(1|s|sim|true)$/i.test(texto(v) ?? "");
/** "0", 0, false, "N", "NAO" → não. Qualquer outra coisa é "não informado". */
const nao = (v: unknown) => v === false || v === 0 || /^(0|n|n[aã]o|false)$/i.test(texto(v) ?? "");

/**
 * Texto livre do fornecedor, sem número de documento: CPF e CNPJ (com ou sem
 * máscara) e qualquer sequência de 11 ou 14 dígitos viram "[omitido]". Vale
 * para o que pode ir ao banco ou à tela (motivo de erro, texto do recall,
 * descrição de item). Nome de pessoa não se reconhece por regex: por isso as
 * mensagens de restrição do Detran não são guardadas como texto, só
 * classificadas (`classificarRestricao`).
 */
export function semDocumentos(t: string): string {
  return t
    .replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, "[omitido]")
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[omitido]")
    .replace(/\*{3}\.?\d{3}\.?\d{3}-?\*{2}/g, "[omitido]")
    .replace(/(?<!\d)(\d{11}|\d{14})(?!\d)/g, "[omitido]");
}

/**
 * As mensagens de restrição do Detran viram categorias fixas: a mensagem
 * crua pode trazer nome e documento de comprador, vendedor ou financiado
 * ("COMUNICACAO DE VENDA - COMPRADOR FULANO CPF …"), e nenhuma regex
 * reconhece nome. Fica o tipo da restrição; o texto, nunca.
 */
const CATEGORIAS_DE_RESTRICAO: Array<[RegExp, string]> = [
  [/renajud|judicial/i, "Restrição judicial"],
  [/roubo|furto/i, "Roubo ou furto"],
  [/aliena|financ|gravame|arrend|reserva de dom/i, "Alienação ou financiamento"],
  [/comunica[cç][aã]o de venda/i, "Comunicação de venda"],
  [/administr/i, "Restrição administrativa"],
  [/tribut|ipva/i, "Restrição tributária"],
  [/ambient|ibama/i, "Restrição ambiental"],
  [/guincho|p[aá]tio|remo[cç]/i, "Veículo em pátio ou removido"],
  [/baix/i, "Baixa do veículo"],
  [/bloque/i, "Bloqueio"],
];
export function classificarRestricao(mensagem: string): string {
  return CATEGORIAS_DE_RESTRICAO.find(([re]) => re.test(mensagem))?.[1] ?? "Outra restrição (detalhe no Detran)";
}

/** A leitura do envelope de um produto: erro, custo e o miolo. */
export type ChamadaDaPlaca =
  | { ok: true; dados: unknown; custo: number | null; homologacao: boolean }
  | { ok: false; status: number | null; motivo: string; daConta: boolean; podeTerCobrado: boolean; custo: number | null };

/** O custo: `valor_consulta`, ou o "tarifado em R$ X" da mensagem. `tax` não serve (doc: varia entre APIs). */
export function custoDaResposta(c: Objeto | null): number | null {
  if (!c) return null;
  if (typeof c.valor_consulta === "number" && Number.isFinite(c.valor_consulta)) return c.valor_consulta >= 0 ? c.valor_consulta : null;
  const valorDoHistorico = pegar(c, "consulta.valor");
  if (pegar(c, "consulta.debitado") === true && typeof valorDoHistorico === "number" && valorDoHistorico >= 0) return valorDoHistorico;
  for (const m of [c.message, c.msg].filter((x): x is string => typeof x === "string")) {
    // Só "foi tarifado em R$ X", e nunca "não foi tarifado… limite 990000".
    if (/n[aã]o\s+foi\s+tarifad/i.test(m)) continue;
    const achou = m.match(/foi\s+tarifad[oa]\s+em\s+R\$\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (achou) {
      const n = numeroDoFornecedor(achou[1]);
      return n !== null && n >= 0 ? n : null;
    }
  }
  return null;
}

/**
 * Lê o envelope de um produto. Puro. O Histórico de Proprietários tem envelope
 * próprio (`status`, `msg`, `consulta`, `dados`, sem `error` nem `data`).
 */
export function lerChamadaDaPlaca(status: number, corpo: unknown, produto: ProdutoDeVeiculo): ChamadaDaPlaca {
  const cobra = PRODUTOS_DA_PLACA[produto].cobraEmErro;
  const falha = (motivo: string, extra: { daConta?: boolean; podeTerCobrado: boolean; custo?: number | null }): ChamadaDaPlaca => ({
    ok: false,
    status,
    motivo,
    daConta: extra.daConta ?? false,
    podeTerCobrado: extra.podeTerCobrado || (extra.custo ?? 0) > 0,
    custo: extra.custo ?? null,
  });
  if (status === 402) return falha("a conta da APIBrasil está sem saldo", { daConta: true, podeTerCobrado: false });
  if (status === 401 || status === 403) return falha("a APIBrasil recusou o token da loja", { daConta: true, podeTerCobrado: false });
  if (status >= 500) return falha(`a APIBrasil está fora do ar (HTTP ${status})`, { podeTerCobrado: cobra });
  const c = objeto(corpo);
  if (!c) return falha("a APIBrasil respondeu algo ilegível", { podeTerCobrado: true });
  const custo = custoDaResposta(c);
  const homologacao = c.homolog === true || c.homolog === "true" || c.api_limit_for === "homolog";

  if (produto === "historico-proprietarios") {
    const dados = objeto(c.dados);
    const msg = texto(c.msg) ?? texto(c.message);
    // O erro vence o miolo: HTTP de erro com `status: true` não é resposta boa.
    if (status >= 400 || c.status === false || c.error === true) {
      return falha(msg ? `a APIBrasil recusou: ${semDocumentos(msg).slice(0, 200)}` : `a APIBrasil recusou a consulta (HTTP ${status})`, { podeTerCobrado: cobra, custo });
    }
    if (c.status === true && dados) return { ok: true, dados, custo, homologacao };
    // Pode vir no envelope padrão.
    const padrao = objeto(c.data);
    if (padrao) return { ok: true, dados: objeto(padrao.dados) ?? padrao, custo, homologacao };
    return falha("a APIBrasil respondeu sem os dados", { podeTerCobrado: true, custo });
  }

  if (status >= 400 || c.error === true) {
    const msg = semDocumentos(texto(c.message) ?? "").slice(0, 200);
    if (/saldo insuficiente|sem saldo|cr[ée]dito insuficiente/i.test(msg)) return falha("a conta da APIBrasil está sem saldo", { daConta: true, podeTerCobrado: false, custo });
    return falha(msg ? `a APIBrasil recusou: ${msg}` : `a APIBrasil recusou a consulta (HTTP ${status})`, { podeTerCobrado: cobra, custo });
  }
  if (c.data === null || c.data === undefined) return falha("a APIBrasil respondeu sem os dados", { podeTerCobrado: true, custo });
  return { ok: true, dados: c.data, custo, homologacao };
}

// ─────────────────────────────────────────────────────────────────────────────
// Os fragmentos: a leitura de cada produto, sem dado pessoal
// ─────────────────────────────────────────────────────────────────────────────

/** A parte do cadastro que um produto pode trazer. */
export type VeiculoDoFragmento = Partial<RetratoDaConsulta["veiculo"]>;

export interface FragmentoEstadual {
  veiculo: VeiculoDoFragmento;
  /** "EM CIRCULACAO", etc. */
  situacao: string | null;
  situacaoDoChassi: string | null;
  baixado: boolean | null;
  restricao: { financiamento: boolean | null; geral: boolean | null; renajud: boolean | null; rouboFurto: boolean | null };
  /** O agente e a data; o financiado nunca. */
  financiamento: { agente: string | null; tipo: string | null; dataInclusao: string | null } | null;
  /** `null` = não informado. Pendência confirmada sem valor legível entra em `debitosSemValor`. */
  debitos: DebitosDoRetrato;
  debitosSemValor: string[];
  /** As restrições do Detran por CATEGORIA (`classificarRestricao`), sem o texto cru. */
  restricoesListadas: string[];
  /** Só quando o faturado foi EMPRESA (CNPJ é dado público de empresa); pessoa física nunca. */
  cnpjDoFaturamento: string | null;
}

export interface FragmentoRecall {
  /** 0 = sem pendência; >0 = pendente; `null` = a resposta não diz. */
  pendentes: number | null;
  texto: string | null;
}

export interface FragmentoFipe {
  fipe: FipeDoRetrato | null;
  veiculo: VeiculoDoFragmento;
}

export interface ItemDoCheckList {
  chave: string;
  descricao: string | null;
  /** `null` quando o item veio sem contagem. */
  quantidade: number | null;
}

export interface FragmentoCheckList {
  itens: ItemDoCheckList[];
}

export interface TransferenciaDoVeiculo {
  /** AAAA-MM-DD. */
  data: string | null;
  uf: string | null;
  municipio: string | null;
  /** O tipo do dono, nunca quem: "pessoa" ou "empresa". */
  dono: "pessoa" | "empresa" | null;
}

export interface FragmentoHistorico {
  total: number | null;
  transferencias: TransferenciaDoVeiculo[];
}

export interface FragmentosDaPlaca {
  estadual?: FragmentoEstadual;
  recall?: FragmentoRecall;
  fipe?: FragmentoFipe;
  "check-list"?: FragmentoCheckList;
  "historico-proprietarios"?: FragmentoHistorico;
}

/** O `status_retorno` do fornecedor diz se a consulta foi concluída (código 1); ausente, não decide. */
function concluida(o: Objeto): boolean {
  const s = objeto(o.status_retorno);
  if (!s) return true;
  return texto(s.codigo) === "1";
}

export function lerEstadual(d: unknown): FragmentoEstadual | null {
  const b = objeto(pegar(d, "bin_estadual")) ?? objeto(d);
  // Sem o bloco de restrições (ou com a consulta não concluída) não há o que conferir:
  // uma resposta que só ecoa a placa não pode virar "nada consta".
  const r = objeto(b?.restricoes);
  if (!b || !r || !concluida(b)) return null;
  const debitosSemValor: string[] = [];
  const pendencia = (chave: string, nome: string): number | null => {
    const o = objeto(r[chave]);
    if (!o) return null;
    if (nao(o.existe_pendencia)) return 0;
    const valor = numeroDoFornecedor(o.valor_pendencia);
    if (sim(o.existe_pendencia) && (valor === null || valor <= 0)) debitosSemValor.push(nome);
    // Sem a confirmação "0" ou "1", o valor sozinho só vale se for legível.
    return sim(o.existe_pendencia) || valor !== null ? valor : null;
  };
  const flag = (v: unknown): boolean | null => (sim(v) ? true : nao(v) ? false : null);
  const f = objeto(r.financiamento);
  const agente = texto(f?.nome_agente_financeiro);
  const tipoDoc = texto(b.tipo_documento_do_faturado);
  const docFaturado = (texto(b.numero_identificacao_do_faturado) ?? "").replace(/\D/g, "");
  const marcaModelo = texto(b.marca_modelo);
  return {
    veiculo: {
      descricao: marcaModelo,
      marca: marcaModelo?.split("/")[0]?.trim() || null,
      anoFabricacao: inteiro(b.ano_fabricacao),
      anoModelo: inteiro(b.ano_modelo),
      cor: texto(b.cor_veiculo),
      combustivel: texto(b.combustivel),
      categoria: texto(b.categoria_veiculo),
      tipo: texto(b.tipo_veiculo),
      procedencia: texto(b.procedencia),
      municipio: texto(b.municipio),
      uf: texto(b.uf),
      potenciaCv: inteiro(b.potencia_veiculo),
      cilindradas: inteiro(b.cilindrada),
      chassi: texto(b.chassi),
      motor: texto(b.numero_motor),
      renavam: texto(b.renavam),
      ultimaAtualizacao: dataDoFornecedor(b.data_atualizacao),
      emissaoDoCrv: dataDoFornecedor(b.data_emissao_ultimo_crv),
    },
    situacao: texto(b.situacao),
    situacaoDoChassi: texto(b.situacao_chassi),
    baixado: flag(r.veiculo_baixado),
    restricao: {
      financiamento: flag(r.existe_restricao_financiamento),
      geral: flag(r.existe_restricao_geral),
      renajud: flag(r.existe_restricao_renajud),
      rouboFurto: flag(r.existe_restricao_roubo_furto),
    },
    financiamento: agente || texto(f?.tipo_restricao_financiamento) ? { agente, tipo: texto(f?.tipo_restricao_financiamento), dataInclusao: dataDoFornecedor(f?.data_inclusao) } : null,
    debitos: { ipva: pendencia("ipva", "IPVA"), licenciamento: pendencia("licenciamento", "licenciamento"), multas: pendencia("multas", "multas"), dpvat: pendencia("dpvat", "DPVAT") },
    debitosSemValor,
    restricoesListadas: [
      ...new Set(
        lista(r.mensagens_restricoes)
          .map((m) => texto(objeto(m)?.mensagem) ?? texto(m))
          .filter((m): m is string => m !== null && !/homologa|nada consta|sem restri/i.test(m))
          .map(classificarRestricao),
      ),
    ],
    // Lista POSITIVA: só faturado PJ com CNPJ válido. "FÍSICA", "PF", tipo vazio com CPF completado com zeros: nada.
    cnpjDoFaturamento: /^(j|juridica|cnpj|pj)$/i.test((tipoDoc ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")) && docFaturado.length === 14 && cnpjValido(docFaturado) ? docFaturado : null,
  };
}

export function lerRecall(d: unknown): FragmentoRecall | null {
  const o = objeto(d);
  if (!o) return null;
  const bruto = texto(o.msg) ?? texto(o.message) ?? texto(o.descricaoRetorno);
  const msg = bruto ? semDocumentos(bruto).slice(0, 300) : null;
  const pendentesListados = lista(o.recallsPendente).length + lista(pegar(o, "recall.recallsPendente")).length;
  if (pendentesListados > 0) return { pendentes: pendentesListados, texto: msg };
  if (!msg) return { pendentes: null, texto: null };
  // Frase por frase, e a pendência primeiro: "possui recall pendente. Não há outros recalls" é pendente.
  let pendente = false;
  let semPendencia = false;
  for (const frase of msg.split(/[.;!\n]+/)) {
    if (!/recall/i.test(frase)) continue;
    const negada = /\bn[aã]o\b|\bnenhum/i.test(frase);
    if (!negada && /(possui|h[aá]|consta|tem|existe)[^.]*recall|recall[^.]*(pendente|em aberto)/i.test(frase)) pendente = true;
    else if (negada) semPendencia = true;
  }
  return { pendentes: pendente ? 1 : semPendencia ? 0 : null, texto: msg };
}

export function lerFipeDaPlaca(d: unknown): FragmentoFipe | null {
  const itens = lista(pegar(d, "data")).map(objeto).filter((x): x is Objeto => x !== null);
  const principal = itens.find((i) => i.principal === true) ?? itens[0] ?? null;
  const v = objeto(pegar(d, "veiculo"));
  if (!principal && !v) return null;
  const historico: PontoDaFipe[] = [];
  for (const p of lista(principal?.historico)) {
    const o = objeto(p);
    const m = texto(o?.mes)?.match(/^(\d{4})-(\d{2})/);
    const valor = numeroDoFornecedor(o?.valor);
    if (!m || valor === null || valor <= 0) continue;
    historico.push({ ano: Number(m[1]), mes: Number(m[2]), valor });
  }
  historico.sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  return {
    fipe: principal
      ? {
          codigo: texto(principal.codigoFipe),
          marca: texto(principal.marca),
          modelo: texto(principal.modelo),
          versao: null,
          valorAtual: numeroDoFornecedor(principal.valor) ?? historico[historico.length - 1]?.valor ?? null,
          valorZeroKm: null,
          historico,
        }
      : null,
    veiculo: {
      anoFabricacao: inteiro(principal?.anoFabricacao),
      anoModelo: inteiro(principal?.anoModelo),
      cor: texto(v?.cor),
      combustivel: texto(v?.combustivel) ?? texto(principal?.combustivel),
      potenciaCv: inteiro(v?.potencia),
      cilindradas: inteiro(v?.cilindradas),
      municipio: texto(v?.municipio),
      uf: texto(v?.uf),
    },
  };
}

/** Cada item do Check List é `{descricao, ocorrencias[], quantidade_ocorrencias, relevancia}`; os que a doc não lista entram com a chave dele. */
export function lerCheckList(d: unknown): FragmentoCheckList | null {
  const raiz = objeto(pegar(d, "veicular.check_list_veicular")) ?? objeto(pegar(d, "check_list_veicular"));
  if (!raiz || !concluida(raiz)) return null;
  const itens: ItemDoCheckList[] = [];
  for (const [chave, valor] of Object.entries(raiz)) {
    const o = objeto(valor);
    if (!o || !("quantidade_ocorrencias" in o || "ocorrencias" in o)) continue;
    // A lista de ocorrências vem vazia mesmo quando há registro (exemplo da doc): ela só vale
    // como contagem quando traz alguma coisa. Quantidade ilegível com lista vazia é "não informado".
    const quantidade = inteiro(o.quantidade_ocorrencias) ?? (Array.isArray(o.ocorrencias) && o.ocorrencias.length > 0 ? o.ocorrencias.length : null);
    const descricao = texto(o.descricao);
    itens.push({ chave, descricao: descricao ? semDocumentos(descricao).slice(0, 200) : null, quantidade });
  }
  return itens.length ? { itens } : null;
}

export function lerHistorico(d: unknown): FragmentoHistorico | null {
  const o = objeto(d);
  if (!o) return null;
  const registros = lista(o.registros);
  const total = inteiro(o.total_registros) ?? (Array.isArray(o.registros) ? registros.length : null);
  if (total === null) return null;
  return {
    total,
    transferencias: registros
      .map(objeto)
      .filter((r): r is Objeto => r !== null)
      .map((r) => {
        const tipo = (texto(r.tp_doc) ?? "").toUpperCase();
        return {
          data: dataDoFornecedor(r.data_transferencia),
          uf: texto(r.uf),
          municipio: texto(r.municipio),
          dono: tipo === "J" || tipo === "CNPJ" ? ("empresa" as const) : tipo === "F" || tipo === "CPF" ? ("pessoa" as const) : null,
        };
      })
      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "")),
  };
}

/** O leitor de cada produto do nível (o Veículos Total tem o seu, `lerRespostaDaApiBrasil`). */
export const LEITORES_DA_PLACA: { [P in Exclude<ProdutoDeVeiculo, "veiculos-total">]: (dados: unknown) => FragmentosDaPlaca[P] | null } = {
  estadual: lerEstadual,
  recall: lerRecall,
  fipe: lerFipeDaPlaca,
  "check-list": lerCheckList,
  "historico-proprietarios": lerHistorico,
};

// ─────────────────────────────────────────────────────────────────────────────
// Montar o retrato a partir dos fragmentos
// ─────────────────────────────────────────────────────────────────────────────

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataPorExtenso = (iso: string | null) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "data não informada";
};

/**
 * Como cada item do Check List vira apontamento. `null` = só informativo.
 * Leilão, perda total e chassi adulterado reprovam, como no Veículos Total.
 */
const PESO_DO_CHECK_LIST: Record<string, { chave: string; gravidade: "impeditivo" | "atencao"; titulo: string } | null> = {
  leiloes: { chave: "leilao", gravidade: "impeditivo", titulo: "Passagem por leilão (indício do Check List)" },
  historico_indenizacao_integral: { chave: "sinistro", gravidade: "impeditivo", titulo: "Indenização integral por seguradora (perda total)" },
  comercio_lojas_salvados: { chave: "sinistro", gravidade: "impeditivo", titulo: "Comercializado em loja de salvados" },
  seguradora: { chave: "sinistro", gravidade: "atencao", titulo: "Transferido para seguradora" },
  historico_acidentes: { chave: "sinistro", gravidade: "atencao", titulo: "Histórico de acidente" },
  historico_danos_avarias: { chave: "sinistro", gravidade: "atencao", titulo: "Histórico de danos e avarias" },
  relatorio_embarque_guincho: { chave: "sinistro", gravidade: "atencao", titulo: "Embarque em guincho" },
  hist_restricao_emissao_apolice_seguros: { chave: "sinistro", gravidade: "atencao", titulo: "Apólice de seguro recusada" },
  indicio_chassi_adulterado: { chave: "chassi_adulterado", gravidade: "impeditivo", titulo: "Indício de chassi adulterado ou clonagem" },
  utilizacao_em_crimes: { chave: "chassi_adulterado", gravidade: "impeditivo", titulo: "Indício de uso em crime" },
  indicio_busca_aprensao_futuro_leilao: { chave: "restricao_financeira", gravidade: "atencao", titulo: "Indício de busca e apreensão (retomada pelo banco)" },
  viatura_policial: { chave: "uso_anterior", gravidade: "atencao", titulo: "Já foi viatura policial" },
  frota_locadora: { chave: "locadora", gravidade: "atencao", titulo: "Registro em locadora" },
  frota_taxi: { chave: "uso_anterior", gravidade: "atencao", titulo: "Já foi táxi" },
  indicio_taxi_app: { chave: "uso_anterior", gravidade: "atencao", titulo: "Indício de uso em aplicativo" },
  frota_publica: { chave: "uso_anterior", gravidade: "atencao", titulo: "Já foi frota pública" },
  frota_empresa_privada: { chave: "uso_anterior", gravidade: "atencao", titulo: "Já foi frota de empresa" },
  frota_seguranca_privada: { chave: "uso_anterior", gravidade: "atencao", titulo: "Já foi frota de segurança privada" },
  frota_entidade_religiosa: null,
};

/** Os blocos que cada checagem perde quando o produto que a confere não está na consulta. */
const QUEM_CONFERE: Record<ChaveDaChecagem, { chave: string; titulo: string; detalhe: string }> = {
  leilao: { chave: "leilao", titulo: "Leilão", detalhe: "A passagem por leilão NÃO foi conferida neste nível." },
  sinistro: { chave: "sinistro", titulo: "Sinistro", detalhe: "O indício de sinistro NÃO foi conferido neste nível." },
  gravame: { chave: "gravame", titulo: "Financiamento", detalhe: "O financiamento NÃO foi conferido nesta consulta." },
  roubo_furto: { chave: "roubo_furto", titulo: "Roubo e furto", detalhe: "Roubo e furto NÃO foram conferidos nesta consulta." },
  renajud: { chave: "renajud", titulo: "Bloqueio judicial", detalhe: "O Renajud NÃO foi conferido nesta consulta." },
  restricoes: { chave: "base_estadual", titulo: "Base estadual (Detran)", detalhe: "As restrições do Detran NÃO foram conferidas nesta consulta." },
  debitos: { chave: "debitos", titulo: "Débitos", detalhe: "Débitos e multas NÃO foram conferidos nesta consulta." },
  donos: { chave: "proprietarios", titulo: "Donos anteriores", detalhe: "O histórico de proprietários NÃO foi conferido neste nível." },
  chassi: { chave: "chassi", titulo: "Numeração do chassi", detalhe: "A numeração do chassi NÃO foi conferida nesta consulta." },
  recall: { chave: "recall", titulo: "Recall", detalhe: "O recall NÃO foi conferido nesta consulta." },
};

const VEICULO_VAZIO: RetratoDaConsulta["veiculo"] = {
  descricao: null,
  marca: null,
  anoFabricacao: null,
  anoModelo: null,
  cor: null,
  combustivel: null,
  categoria: null,
  tipo: null,
  procedencia: null,
  municipio: null,
  uf: null,
  potenciaCv: null,
  cilindradas: null,
  chassi: null,
  motor: null,
  renavam: null,
  ultimaAtualizacao: null,
  emissaoDoCrv: null,
};

/** Junta o cadastro: o primeiro produto que trouxe o campo vale (Base Estadual antes da FIPE). */
function juntarVeiculo(...partes: Array<VeiculoDoFragmento | undefined>): RetratoDaConsulta["veiculo"] {
  const v = { ...VEICULO_VAZIO } as Record<string, unknown>;
  for (const p of partes) {
    if (!p) continue;
    for (const [k, valor] of Object.entries(p)) if (v[k] === null && valor !== null && valor !== undefined) v[k] = valor;
  }
  return v as RetratoDaConsulta["veiculo"];
}

/**
 * O retrato de uma consulta por nível. `confere` são as checagens que o
 * nível cobre (pelos produtos que RESPONDERAM): o que não está lá vira "não
 * conferido" — nunca "ok".
 */
export function montarRetratoPorNivel(placa: string, nivel: NivelDaPlaca, fragmentos: FragmentosDaPlaca, produtosQueFalharam: ProdutoDeVeiculo[] = []): RetratoDaConsulta {
  const est = fragmentos.estadual;
  const rec = fragmentos.recall;
  const fip = fragmentos.fipe;
  const chk = fragmentos["check-list"];
  const his = fragmentos["historico-proprietarios"];

  const apontamentos: Apontamento[] = [];
  const add = (chave: string, gravidade: "impeditivo" | "atencao", titulo: string, detalhe: string) => apontamentos.push({ chave, gravidade, titulo, detalhe });

  // ── Base Estadual ──
  const gravames: GravameDoRetrato[] = [];
  if (est) {
    if (est.restricao.financiamento === true || est.financiamento) {
      const aberto = est.restricao.financiamento !== false;
      gravames.push({
        agente: est.financiamento?.agente ?? null,
        situacao: est.financiamento?.tipo ?? (aberto ? "Restrição de financiamento" : null),
        dataInclusao: est.financiamento?.dataInclusao ?? null,
        atual: true,
        baixado: !aberto,
      });
      if (aberto) {
        add(
          "gravame",
          "impeditivo",
          "Financiamento em aberto",
          `${est.financiamento?.agente ?? "Agente financeiro não informado"}${est.financiamento?.dataInclusao ? `, incluído em ${dataPorExtenso(est.financiamento.dataInclusao)}` : ""}. Só transfere depois da quitação e da baixa.`,
        );
      }
    }
    if (est.restricao.rouboFurto === true) add("roubo_furto", "impeditivo", "Roubo ou furto em aberto", "A base do Detran registra restrição de roubo ou furto. Não é compra.");
    if (est.restricao.renajud === true) add("renajud", "impeditivo", "Bloqueio judicial (Renajud)", "Há restrição judicial registrada no Renajud. Não transfere enquanto durar.");
    if (est.restricao.geral === true) {
      add(
        "restricao_outra",
        "impeditivo",
        "Restrição no Detran",
        est.restricoesListadas.length ? `O Detran registra: ${est.restricoesListadas.join("; ")}. O detalhe fica na consulta do Detran.` : "O Detran registra restrição; a base não detalhou qual.",
      );
    }
    if (est.baixado === true) add("situacao", "impeditivo", "Veículo baixado", "O cadastro diz que o veículo foi baixado. Não volta a circular.");
    else if (est.situacao && !/circula/i.test(est.situacao)) add("situacao", "impeditivo", "Situação do veículo", `O cadastro diz "${est.situacao}", e não "em circulação".`);
    if (est.situacaoDoChassi && !/^(regular|normal)$/i.test(est.situacaoDoChassi)) {
      add("chassi_situacao", "impeditivo", "Situação do chassi", `O Detran registra o chassi como "${est.situacaoDoChassi}". Conferir a numeração na perícia.`);
    }
    const itens: Array<[string, number | null]> = [
      ["IPVA", est.debitos.ipva],
      ["licenciamento", est.debitos.licenciamento],
      ["multas", est.debitos.multas],
      ["DPVAT", est.debitos.dpvat],
    ];
    const abertos = itens.filter(([, v]) => v !== null && v > 0) as Array<[string, number]>;
    if (abertos.length > 0) {
      add("debitos", "atencao", "Débitos em aberto", `${abertos.map(([n, v]) => `${n} ${reais(v)}`).join(", ")}. Somam ${reais(abertos.reduce((s, [, v]) => s + v, 0))}.`);
    }
    if (est.debitosSemValor.length > 0) {
      add("debitos", "atencao", "Débito sem valor informado", `O Detran confirma pendência de ${est.debitosSemValor.join(", ")}, sem dizer o valor. Conferir antes de fechar.`);
    }
  }

  // ── Check List ──
  let leilaoRegistros = 0;
  let sinistroConsta = false;
  if (chk) {
    for (const item of chk.itens) {
      if (item.quantidade === null || item.quantidade <= 0) continue;
      const peso = PESO_DO_CHECK_LIST[item.chave];
      if (peso === null) continue;
      const titulo = peso?.titulo ?? item.descricao ?? item.chave.replace(/_/g, " ");
      add(peso?.chave ?? "check_list", peso?.gravidade ?? "atencao", titulo, `${item.quantidade} ${item.quantidade === 1 ? "ocorrência" : "ocorrências"} no Check List.${item.descricao ? ` ${item.descricao}.` : ""}`);
      if (peso?.chave === "leilao") leilaoRegistros += item.quantidade;
      if (peso?.chave === "sinistro") sinistroConsta = true;
    }
  }

  // ── Recall ──
  if (rec?.pendentes && rec.pendentes > 0) add("recall", "atencao", "Recall pendente", rec.texto ?? "Há chamado de recall sem atendimento.");

  // Histórico de proprietários: só conta e lista as transferências. Empresa no histórico é comum
  // (concessionária, locadora); a locadora sai do Check List e do CNAE do faturamento.

  // ── O chassi pelo próprio número ──
  const veiculo = juntarVeiculo(est?.veiculo, fip?.veiculo);
  const anos = [veiculo.anoFabricacao, veiculo.anoModelo].filter((a): a is number => a !== null);
  const chassi = decodificarChassi(veiculo.chassi, anos);
  if (chassi && chassi.confereComOCadastro === false) {
    add("chassi_ano", "atencao", "Ano do chassi diferente do cadastro", `O chassi indica ${chassi.ano}, e o cadastro diz ${veiculo.anoFabricacao ?? "?"}/${veiculo.anoModelo ?? "?"}. Conferir a numeração na perícia.`);
  }

  // ── O que este nível conferiu, checagem por checagem, pelo VALOR lido ──
  // Ter o produto não basta: flag vazia, quantidade ilegível ou bloco ausente é "não conferido",
  // nunca "ok" (revisão de 19/10/2026: flags "" no econômico davam "apto").
  const quantidadeDo = (chave: string) => chk?.itens.find((i) => i.chave === chave)?.quantidade ?? null;
  const cobertura: Record<ChaveDaChecagem, boolean> = {
    leilao: quantidadeDo("leiloes") !== null,
    sinistro: quantidadeDo("historico_indenizacao_integral") !== null && quantidadeDo("comercio_lojas_salvados") !== null,
    gravame: est?.restricao.financiamento != null,
    roubo_furto: est?.restricao.rouboFurto != null,
    renajud: est?.restricao.renajud != null,
    restricoes: est != null && est.restricao.geral !== null && est.baixado !== null && est.situacao !== null,
    // Item a item: o débito conferido é o que tem valor, ou pendência confirmada sem valor.
    debitos:
      est != null &&
      (
        [
          ["ipva", "IPVA"],
          ["licenciamento", "licenciamento"],
          ["multas", "multas"],
          ["dpvat", "DPVAT"],
        ] as const
      ).every(([k, nome]) => est.debitos[k] !== null || est.debitosSemValor.includes(nome)),
    donos: his?.total != null,
    chassi: Boolean(est?.situacaoDoChassi) || quantidadeDo("indicio_chassi_adulterado") !== null,
    recall: rec?.pendentes != null,
  };

  const naoVeio: BlocoQueNaoVeio[] = [];
  for (const c of CHECAGENS) if (!cobertura[c]) naoVeio.push(QUEM_CONFERE[c]);
  for (const p of produtosQueFalharam) {
    if (p === "fipe") naoVeio.push({ chave: "fipe", titulo: "Tabela FIPE", detalhe: "A FIPE do fornecedor não veio nesta consulta." });
  }
  if (!fip?.fipe || fip.fipe.valorAtual === null) {
    if (!naoVeio.some((b) => b.chave === "fipe")) naoVeio.push({ chave: "fipe", titulo: "Tabela FIPE", detalhe: "O valor FIPE não veio: a faixa de compra não pode ser calculada." });
  }

  return {
    placa,
    veiculo,
    fipe: fip?.fipe ?? null,
    primeiroFaturamento: { para: est?.cnpjDoFaturamento ? "empresa" : null, cnpj: est?.cnpjDoFaturamento ?? null, uf: null },
    gravames,
    debitos: est ? est.debitos : null,
    leilao: { consta: leilaoRegistros > 0, registros: leilaoRegistros, descricao: null },
    sinistro: { consta: sinistroConsta, descricao: null },
    rouboFurto: { consta: est?.restricao.rouboFurto === true, ativa: est?.restricao.rouboFurto === true },
    locadora: chk ? apontamentos.some((a) => a.chave === "locadora") : null,
    recallsPendentes: rec?.pendentes ?? null,
    risco: { indice: null, parecer: null },
    anuncios: [],
    leiturasDeKm: [],
    pessoas: { donosNoHistorico: his?.total ?? 0, financiadosDistintos: 0 },
    chassi,
    gratuito: null,
    apontamentos,
    naoVeio,
    nivel,
    cobertura,
    transferencias: his?.transferencias ?? [],
  };
}
