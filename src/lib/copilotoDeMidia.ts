/**
 * Copiloto de Mídia — a parte pura (spec
 * `docs/superpowers/specs/2026-10-14-copiloto-de-midia-design.md`).
 *
 * De 6 a 12/10/2026 o Google Ads gastou R$ 357 com zero conversão, e em 21
 * dias só 2 de 62 leads chegaram com `gclid`. O GTM e o site medem certo: o
 * que faltava era alguém olhar, todo dia, PARA ONDE o dinheiro foi (termos de
 * pesquisa, verba, anúncio parado, medição) e transformar o achado em mudança
 * na conta — com uma pessoa aprovando antes.
 *
 * O caminho, uma vez por dia:
 *   1. o script da conta (`scripts/google-ads-script.js`) lê a conta e manda o
 *      retrato (`DiagnosticoDaConta`, validado por `validarDiagnostico`);
 *   2. `diagnosticar` cruza o retrato com os leads do site e com as regras da
 *      loja (`ParametrosDoCopiloto`, tabela com vigência) e devolve achados e
 *      propostas;
 *   3. Administrador ou Marketing aprova ou recusa cada proposta no painel;
 *   4. na rodada seguinte o script busca o que foi aprovado, aplica pela
 *      AdsApp, lê de volta e devolve o resultado (`validarResultados`).
 *
 * O que o copiloto pode mudar é uma lista fechada (`TIPOS_DE_ACAO`), e nela a
 * única exclusão é a de negativa (`remover_negativa`, o desfazer de uma
 * negativa). Nada aqui conhece token de API nem fala com terceiro: o script
 * roda DENTRO da conta, com o segredo que a sincronização de hora em hora já
 * usa.
 */

import { ACAO_COPILOTO_DE_MIDIA } from "./permissoes";

export { ACAO_COPILOTO_DE_MIDIA };

/** Quem aprova: a mesma régua da linha da matriz. A RLS e as funções repetem. */
export const PAPEIS_DO_COPILOTO = ["admin", "marketing"] as const;

export const MIGRACAO_DO_COPILOTO = "20261014150000_copiloto_de_midia";

/** A migração que traz o Meta para o copiloto (17/10/2026). */
export const MIGRACAO_DO_COPILOTO_META = "20261017150000_copiloto_meta";

/** As contas que o copiloto conhece. Cada ação e cada retrato é de uma. */
export const PLATAFORMAS_DO_COPILOTO = ["google", "meta"] as const;
export type PlataformaDoCopiloto = (typeof PLATAFORMAS_DO_COPILOTO)[number];

export const ROTULO_DA_PLATAFORMA: Record<PlataformaDoCopiloto, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
};

export const ehPlataformaDoCopiloto = (v: unknown): v is PlataformaDoCopiloto =>
  typeof v === "string" && (PLATAFORMAS_DO_COPILOTO as readonly string[]).includes(v);

/**
 * Quem aplica o aprovado em cada conta, para as frases da tela: no Google, o
 * script colado na conta; no Meta, a rodada agendada da sincronização (de
 * hora em hora), com o token de gestão.
 */
export const QUEM_APLICA: Record<PlataformaDoCopiloto, string> = {
  google: "o script",
  meta: "a rodada do Meta",
};

export const NOME_DA_CONTA: Record<PlataformaDoCopiloto, string> = {
  google: "conta do Google Ads",
  meta: "conta do Meta",
};

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulário — as listas fechadas do banco são estas (o teste confere)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O que o copiloto sabe fazer. A única exclusão é `remover_negativa`, e ela só
 * nasce como o desfazer de uma negativa: o copiloto nunca apaga palavra-chave,
 * anúncio, grupo, conjunto nem campanha.
 *
 * Os quatro do fim são do Meta (17/10/2026): no Meta não há negativa, e o
 * "grupo" é o conjunto de anúncios. `mudar_verba` é das duas plataformas.
 */
export const TIPOS_DE_ACAO = [
  "negativar",
  "remover_negativa",
  "pausar_grupo",
  "reativar_grupo",
  "mudar_verba",
  "pausar_conjunto",
  "reativar_conjunto",
  "pausar_anuncio",
  "reativar_anuncio",
] as const;
export type TipoDeAcao = (typeof TIPOS_DE_ACAO)[number];

/** O que cada plataforma aceita — o CHECK `midia_copiloto_acoes_tipo_da_plataforma`. */
export const TIPOS_DA_PLATAFORMA: Record<PlataformaDoCopiloto, readonly TipoDeAcao[]> = {
  google: ["negativar", "remover_negativa", "pausar_grupo", "reativar_grupo", "mudar_verba"],
  meta: ["pausar_conjunto", "reativar_conjunto", "pausar_anuncio", "reativar_anuncio", "mudar_verba"],
};

export const SITUACOES_DA_ACAO = [
  "proposta",
  "aprovada",
  "recusada",
  "descartada",
  "em_aplicacao",
  "aplicada",
  "falhou",
  "sem_efeito",
] as const;
export type SituacaoDaAcao = (typeof SITUACOES_DA_ACAO)[number];

/** Enquanto está numa destas, a mesma `chave` não ganha proposta nova. */
export const SITUACOES_ABERTAS = ["proposta", "aprovada", "em_aplicacao"] as const satisfies readonly SituacaoDaAcao[];

/** O que o script pode devolver. */
export const SITUACOES_DO_RESULTADO = ["aplicada", "falhou", "sem_efeito"] as const satisfies readonly SituacaoDaAcao[];
export type SituacaoDoResultado = (typeof SITUACOES_DO_RESULTADO)[number];

export const CORRESPONDENCIAS = ["exata", "frase"] as const;
export type Correspondencia = (typeof CORRESPONDENCIAS)[number];

export const REGRAS = [
  "termos_sem_conversao",
  "ritmo_de_verba",
  "anuncios_parados",
  "medicao",
  "cliques_e_leads",
  "qualidade",
  // Meta (17/10/2026). `ritmo_de_verba` serve às duas.
  "meta_sem_lead",
  "meta_custo_por_lead",
  "meta_qualidade",
  "meta_medicao",
] as const;
export type Regra = (typeof REGRAS)[number];

export const GRUPOS_DE_TERMO = ["concorrente", "cidade", "informativo", "outros"] as const;
export type GrupoDeTermo = (typeof GRUPOS_DE_TERMO)[number];

export const GRAVIDADES = ["alta", "media", "baixa"] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

/** O desfazer de cada ação. Verba desfaz para o valor de antes. */
export const DESFAZ: Record<TipoDeAcao, TipoDeAcao> = {
  negativar: "remover_negativa",
  remover_negativa: "negativar",
  pausar_grupo: "reativar_grupo",
  reativar_grupo: "pausar_grupo",
  mudar_verba: "mudar_verba",
  pausar_conjunto: "reativar_conjunto",
  reativar_conjunto: "pausar_conjunto",
  pausar_anuncio: "reativar_anuncio",
  reativar_anuncio: "pausar_anuncio",
};

export const ROTULO_DO_TIPO: Record<TipoDeAcao, string> = {
  negativar: "Negativar",
  remover_negativa: "Remover negativa",
  pausar_grupo: "Pausar grupo",
  reativar_grupo: "Reativar grupo",
  mudar_verba: "Mudar verba",
  pausar_conjunto: "Pausar conjunto",
  reativar_conjunto: "Reativar conjunto",
  pausar_anuncio: "Pausar anúncio",
  reativar_anuncio: "Reativar anúncio",
};

export const ROTULO_DA_SITUACAO: Record<SituacaoDaAcao, string> = {
  proposta: "Proposta",
  aprovada: "Aprovada — aplica na próxima rodada",
  recusada: "Recusada",
  descartada: "Substituída",
  em_aplicacao: "Aplicando",
  aplicada: "Aplicada",
  falhou: "Falhou",
  sem_efeito: "Já estava assim",
};

export const ROTULO_DA_REGRA: Record<Regra, string> = {
  termos_sem_conversao: "Termos com gasto sem conversão",
  ritmo_de_verba: "Ritmo de verba",
  anuncios_parados: "Anúncios parados",
  medicao: "Medição",
  cliques_e_leads: "Cliques × leads com gclid",
  qualidade: "Índice de qualidade",
  meta_sem_lead: "Gasto sem lead no CRM",
  meta_custo_por_lead: "Custo por lead",
  meta_qualidade: "Leads sem qualificação",
  meta_medicao: "Pixel × CRM",
};

export const ROTULO_DO_GRUPO: Record<GrupoDeTermo, string> = {
  concorrente: "Concorrente",
  cidade: "Outra cidade",
  informativo: "Informativo",
  outros: "Outros",
};

export const ROTULO_DA_GRAVIDADE: Record<Gravidade, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

/** Negativa no Google Ads: até 10 palavras e 80 caracteres. */
export const PALAVRAS_DA_NEGATIVA = 10;
export const CARACTERES_DA_NEGATIVA = 80;

/** Teto de propostas por diagnóstico: o resto continua nos achados. */
export const MAX_PROPOSTAS = 60;

/** Quantos exemplos um achado carrega. */
const EXEMPLOS = 12;

// ─────────────────────────────────────────────────────────────────────────────
// As regras da loja (tabela `midia_copiloto_parametros`, com vigência)
// ─────────────────────────────────────────────────────────────────────────────

export interface ParametrosDoCopiloto {
  /** R$ em 7 dias: termo "outros" sem conversão vira proposta a partir disto. */
  gastoMinimoTermo: number;
  /** R$ em 7 dias: grupo sem conversão vira proposta de pausa a partir disto. */
  gastoMinimoGrupo: number;
  /** R$ em 7 dias: campanha sem conversão que gasta a verba inteira vira proposta de verba. */
  gastoMinimoCampanha: number;
  /** % da verba de 7 dias gasta a partir do qual a campanha "gasta a verba inteira". */
  ritmoAltoPct: number;
  /** % abaixo do qual a verba está sobrando. */
  ritmoBaixoPct: number;
  /** Quanto a proposta tira da verba de quem gasta tudo sem converter. */
  reducaoVerbaPct: number;
  /** Índice de qualidade igual ou abaixo disto é achado. */
  iqBaixo: number;
  /** Leads com gclid, contra zero conversão no Google, que provam a medição quebrada. */
  leadsGclidMinimos: number;
  /** Cliques pagos a partir dos quais "nenhum lead com gclid" vira achado de atenção. */
  cliquesMinimosGclid: number;
  /** % de impressão perdida por verba para dizer que a campanha é limitada pela verba. */
  perdaPorVerbaPct: number;
  /** % de impressão perdida por classificação para culpar lance e qualidade. */
  perdaPorRankingPct: number;
  /** Nomes de concorrentes (a loja escreve; o código não conhece nenhum). */
  concorrentes: string[];
  /** Cidades que a loja NÃO atende. */
  cidadesFora: string[];
  /** Palavras de quem pesquisa e não compra. */
  palavrasInformativas: string[];
  /** Hora local a partir da qual o diagnóstico do dia é pedido ao script. */
  horaDoDiagnostico: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// O retrato que o script manda
// ─────────────────────────────────────────────────────────────────────────────

export interface Janela {
  de: string;
  ate: string;
}

export interface TermoDePesquisa {
  termo: string;
  /** `search_term_view.status`: ADDED, EXCLUDED, ADDED_EXCLUDED, NONE. */
  status: string | null;
  campanhaId: string;
  campanha: string;
  grupoId: string | null;
  grupo: string | null;
  custo: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
}

export interface PalavraChave {
  id: string;
  texto: string;
  correspondencia: string | null;
  campanhaId: string;
  campanha: string;
  grupoId: string | null;
  grupo: string | null;
  /** 1 a 10; `null` quando o Google ainda não deu nota. */
  iq: number | null;
  iqAnuncio: string | null;
  iqPagina: string | null;
  iqCtr: string | null;
  custo: number;
  cliques: number;
  conversoes: number;
}

export interface AnuncioNaConta {
  id: string;
  campanhaId: string;
  campanha: string;
  grupoId: string;
  grupo: string;
  /** APPROVED, APPROVED_LIMITED, AREA_OF_INTEREST_ONLY, DISAPPROVED, UNKNOWN. */
  aprovacao: string | null;
  /** REVIEW_IN_PROGRESS, REVIEWED, UNDER_APPEAL, ELIGIBLE_MAY_SERVE. */
  revisao: string | null;
  motivos: string[];
}

export interface RecursoComProblema {
  id: string;
  tipo: string | null;
  texto: string | null;
  campanhaId: string;
  campanha: string;
  grupoId: string | null;
  grupo: string | null;
  situacao: string | null;
  motivos: string[];
}

export interface AcaoDeConversao {
  id: string;
  nome: string;
  situacao: string | null;
  tipo: string | null;
  categoria: string | null;
  primaria: boolean;
  ultimos7: number;
  ultimos30: number;
  ultimoDia: string | null;
}

export interface CampanhaNoDiagnostico {
  id: string;
  nome: string;
  tipo: string | null;
  situacao: string | null;
  verba: number | null;
  verbaCompartilhada: boolean;
  motivos: string[];
  custo7: number;
  cliques7: number;
  impressoes7: number;
  conversoes7: number;
  custoMes: number | null;
  /** Parcela de impressões perdida por verba (0 a 1). Só Pesquisa. */
  perdaPorVerba: number | null;
  /** Parcela perdida por classificação (lance e qualidade). */
  perdaPorRanking: number | null;
}

export interface GrupoNoDiagnostico {
  id: string;
  nome: string;
  campanhaId: string;
  campanha: string;
  custo7: number;
  cliques7: number;
  conversoes7: number;
}

export const SECOES = ["conta", "termos", "palavras", "anuncios", "recursos", "conversoes", "campanhas", "grupos"] as const;
export type Secao = (typeof SECOES)[number];

export interface DiagnosticoDaConta {
  conta: { id: string; moeda: string | null; fuso: string | null; autoTagging: boolean | null };
  janela: Janela;
  /** O script rodou em "Visualizar": leu de verdade, mas não aplicou nada. */
  previa: boolean;
  termos: TermoDePesquisa[];
  palavras: PalavraChave[];
  anuncios: AnuncioNaConta[];
  recursos: RecursoComProblema[];
  conversoes: AcaoDeConversao[];
  campanhas: CampanhaNoDiagnostico[];
  grupos: GrupoNoDiagnostico[];
  /** Seção que o script não conseguiu ler, com a mensagem do Google. */
  erros: Partial<Record<Secao, string>>;
}

/** Tetos de sanidade: a conta tem dezenas de campanhas, não milhares. */
export const LIMITES = {
  termos: 2000,
  palavras: 2000,
  anuncios: 2000,
  recursos: 500,
  conversoes: 200,
  campanhas: 500,
  grupos: 2000,
} as const;

export type Validacao<T> = { ok: true; valor: T } | { ok: false; erro: string };

const FORMA_DO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const ehDia = (v: unknown): v is string => typeof v === "string" && FORMA_DO_DIA.test(v) && !Number.isNaN(Date.parse(v));
const ehId = (v: unknown): v is string => typeof v === "string" && /^\d{1,20}$/.test(v);
const ehNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

class Recusa extends Error {}

/** Texto aparado, cortado no teto; vazio ou ausente vira `null`. */
function textoOuNulo(v: unknown, teto = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, teto) : null;
}

function texto(v: unknown, onde: string, teto = 300): string {
  const t = textoOuNulo(v, teto);
  if (t === null) throw new Recusa(`${onde} vazio`);
  return t;
}

function id(v: unknown, onde: string): string {
  if (!ehId(v)) throw new Recusa(`${onde} precisa ser o ID numérico`);
  return v;
}

function idOuNulo(v: unknown, onde: string): string | null {
  return v == null || v === "" ? null : id(v, onde);
}

function numero(v: unknown, onde: string): number {
  if (!ehNumero(v)) throw new Recusa(`${onde} precisa ser número ≥ 0`);
  return v;
}

function numeroOuNulo(v: unknown, onde: string): number | null {
  return v == null ? null : numero(v, onde);
}

function textos(v: unknown, teto = 20): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => textoOuNulo(x, 120)).filter((x): x is string => x !== null).slice(0, teto);
}

function lista<T>(corpo: Record<string, unknown>, chave: Secao & keyof typeof LIMITES, ler: (x: Record<string, unknown>, onde: string) => T): T[] {
  const v = corpo[chave];
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Recusa(`\`${chave}\` precisa ser uma lista`);
  if (v.length > LIMITES[chave]) throw new Recusa(`\`${chave}\` passou de ${LIMITES[chave]} linhas`);
  return v.map((x, i) => {
    if (!x || typeof x !== "object") throw new Recusa(`${chave}[${i}] não é um objeto`);
    return ler(x as Record<string, unknown>, `${chave}[${i}]`);
  });
}

/**
 * Valida o retrato que o script manda. Defeito de forma recusa o retrato
 * inteiro (o script colado na conta está desatualizado, e é isso que o painel
 * precisa saber); seção que o Google não deixou ler chega vazia e com a
 * mensagem em `erros`, e as regras a tratam como desconhecida, nunca como
 * "sem problema".
 */
export function validarDiagnostico(corpo: unknown): Validacao<DiagnosticoDaConta> {
  try {
    if (!corpo || typeof corpo !== "object") throw new Recusa("corpo não é um objeto JSON");
    const c = corpo as Record<string, unknown>;
    if (!ehDia(c.de) || !ehDia(c.ate)) throw new Recusa("`de` e `ate` precisam ser YYYY-MM-DD");
    if (c.de > c.ate) throw new Recusa("`de` é depois de `ate`");

    const conta = (c.conta && typeof c.conta === "object" ? c.conta : {}) as Record<string, unknown>;
    const idDaConta = textoOuNulo(conta.id, 20);
    if (!idDaConta || !/^[\d-]+$/.test(idDaConta)) throw new Recusa("`conta.id` precisa ser o número da conta");

    const erros: Partial<Record<Secao, string>> = {};
    if (c.erros && typeof c.erros === "object") {
      for (const s of SECOES) {
        const msg = textoOuNulo((c.erros as Record<string, unknown>)[s], 500);
        if (msg) erros[s] = msg;
      }
    }

    const valor: DiagnosticoDaConta = {
      conta: {
        id: idDaConta,
        moeda: textoOuNulo(conta.moeda, 3),
        fuso: fusoValido(conta.fuso) ? conta.fuso : null,
        autoTagging: typeof conta.autoTagging === "boolean" ? conta.autoTagging : null,
      },
      janela: { de: c.de, ate: c.ate },
      previa: c.previa === true,
      termos: lista(c, "termos", (t, o) => ({
        termo: texto(t.termo, `${o}.termo`, 200),
        status: textoOuNulo(t.status, 30),
        campanhaId: id(t.campanhaId, `${o}.campanhaId`),
        campanha: texto(t.campanha, `${o}.campanha`),
        grupoId: idOuNulo(t.grupoId, `${o}.grupoId`),
        grupo: textoOuNulo(t.grupo),
        custo: numero(t.custo, `${o}.custo`),
        cliques: numero(t.cliques, `${o}.cliques`),
        impressoes: numero(t.impressoes, `${o}.impressoes`),
        conversoes: numero(t.conversoes, `${o}.conversoes`),
      })),
      palavras: lista(c, "palavras", (k, o) => {
        const iq = numeroOuNulo(k.iq, `${o}.iq`);
        if (iq !== null && (iq < 1 || iq > 10)) throw new Recusa(`${o}.iq fora de 1 a 10`);
        return {
          id: id(k.id, `${o}.id`),
          texto: texto(k.texto, `${o}.texto`, 200),
          correspondencia: textoOuNulo(k.correspondencia, 20),
          campanhaId: id(k.campanhaId, `${o}.campanhaId`),
          campanha: texto(k.campanha, `${o}.campanha`),
          grupoId: idOuNulo(k.grupoId, `${o}.grupoId`),
          grupo: textoOuNulo(k.grupo),
          iq,
          iqAnuncio: textoOuNulo(k.iqAnuncio, 30),
          iqPagina: textoOuNulo(k.iqPagina, 30),
          iqCtr: textoOuNulo(k.iqCtr, 30),
          custo: numero(k.custo, `${o}.custo`),
          cliques: numero(k.cliques, `${o}.cliques`),
          conversoes: numero(k.conversoes, `${o}.conversoes`),
        };
      }),
      anuncios: lista(c, "anuncios", (a, o) => ({
        id: id(a.id, `${o}.id`),
        campanhaId: id(a.campanhaId, `${o}.campanhaId`),
        campanha: texto(a.campanha, `${o}.campanha`),
        grupoId: id(a.grupoId, `${o}.grupoId`),
        grupo: texto(a.grupo, `${o}.grupo`),
        aprovacao: textoOuNulo(a.aprovacao, 30),
        revisao: textoOuNulo(a.revisao, 30),
        motivos: textos(a.motivos),
      })),
      recursos: lista(c, "recursos", (r, o) => ({
        id: id(r.id, `${o}.id`),
        tipo: textoOuNulo(r.tipo, 40),
        texto: textoOuNulo(r.texto, 200),
        campanhaId: id(r.campanhaId, `${o}.campanhaId`),
        campanha: texto(r.campanha, `${o}.campanha`),
        grupoId: idOuNulo(r.grupoId, `${o}.grupoId`),
        grupo: textoOuNulo(r.grupo),
        situacao: textoOuNulo(r.situacao, 40),
        motivos: textos(r.motivos),
      })),
      conversoes: lista(c, "conversoes", (a, o) => ({
        id: id(a.id, `${o}.id`),
        nome: texto(a.nome, `${o}.nome`),
        situacao: textoOuNulo(a.situacao, 30),
        tipo: textoOuNulo(a.tipo, 60),
        categoria: textoOuNulo(a.categoria, 60),
        primaria: a.primaria === true,
        ultimos7: numero(a.ultimos7, `${o}.ultimos7`),
        ultimos30: numero(a.ultimos30, `${o}.ultimos30`),
        ultimoDia: a.ultimoDia == null ? null : ehDia(a.ultimoDia) ? a.ultimoDia : (() => { throw new Recusa(`${o}.ultimoDia precisa ser YYYY-MM-DD`); })(),
      })),
      campanhas: lista(c, "campanhas", (k, o) => {
        const fracao = (v: unknown, onde: string) => {
          const n = numeroOuNulo(v, onde);
          if (n !== null && n > 1) throw new Recusa(`${onde} precisa ser fração de 0 a 1`);
          return n;
        };
        return {
          id: id(k.id, `${o}.id`),
          nome: texto(k.nome, `${o}.nome`),
          tipo: textoOuNulo(k.tipo, 40),
          situacao: textoOuNulo(k.situacao, 30),
          verba: numeroOuNulo(k.verba, `${o}.verba`),
          verbaCompartilhada: k.verbaCompartilhada === true,
          motivos: textos(k.motivos),
          custo7: numero(k.custo7, `${o}.custo7`),
          cliques7: numero(k.cliques7, `${o}.cliques7`),
          impressoes7: numero(k.impressoes7, `${o}.impressoes7`),
          conversoes7: numero(k.conversoes7, `${o}.conversoes7`),
          custoMes: numeroOuNulo(k.custoMes, `${o}.custoMes`),
          perdaPorVerba: fracao(k.perdaPorVerba, `${o}.perdaPorVerba`),
          perdaPorRanking: fracao(k.perdaPorRanking, `${o}.perdaPorRanking`),
        };
      }),
      grupos: lista(c, "grupos", (g, o) => ({
        id: id(g.id, `${o}.id`),
        nome: texto(g.nome, `${o}.nome`),
        campanhaId: id(g.campanhaId, `${o}.campanhaId`),
        campanha: texto(g.campanha, `${o}.campanha`),
        custo7: numero(g.custo7, `${o}.custo7`),
        cliques7: numero(g.cliques7, `${o}.cliques7`),
        conversoes7: numero(g.conversoes7, `${o}.conversoes7`),
      })),
      erros,
    };
    return { ok: true, valor };
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, erro: e.message };
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Texto: a mesma régua para o termo, o concorrente e a cidade
// ─────────────────────────────────────────────────────────────────────────────

/** Minúsculas, pontuação vira espaço, espaços colapsados. Mantém o acento. */
export function limparTermo(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^0-9a-zÀ-ɏ]+/g, " ")
    .trim();
}

/** "São Tomé" → "sao tome": é assim que termo e lista se comparam. */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Onde a expressão aparece no termo, palavra inteira, e com que grafia o
 * próprio termo a escreveu — é essa grafia que vira negativa: o Google não
 * estende a negativa a variações de acento, e a negativa "sao tome" não
 * bloqueia quem digitou "são tomé".
 */
export function acharNoTermo(termo: string, expressao: string): string | null {
  const original = limparTermo(termo).split(" ").filter(Boolean);
  const comparavel = original.map(semAcento);
  const alvo = semAcento(limparTermo(expressao)).split(" ").filter(Boolean);
  if (alvo.length === 0 || alvo.length > comparavel.length) return null;
  for (let i = 0; i + alvo.length <= comparavel.length; i++) {
    if (alvo.every((p, j) => comparavel[i + j] === p)) return original.slice(i, i + alvo.length).join(" ");
  }
  return null;
}

/** O texto cabe numa negativa do Google? */
export function cabeNaNegativa(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && t.length <= CARACTERES_DA_NEGATIVA && t.split(/\s+/).length <= PALAVRAS_DA_NEGATIVA;
}

export interface Classificacao {
  grupo: GrupoDeTermo;
  /** A expressão da lista que casou, na grafia do termo. `null` em informativo e outros. */
  expressao: string | null;
}

/** Concorrente vence cidade, que vence informativo. Uma classe por termo. */
export function classificarTermo(termo: string, p: Pick<ParametrosDoCopiloto, "concorrentes" | "cidadesFora" | "palavrasInformativas">): Classificacao {
  for (const [grupo, listaDoGrupo] of [
    ["concorrente", p.concorrentes],
    ["cidade", p.cidadesFora],
  ] as const) {
    for (const nome of listaDoGrupo) {
      const achado = acharNoTermo(termo, nome);
      if (achado) return { grupo, expressao: achado };
    }
  }
  if (p.palavrasInformativas.some((palavra) => acharNoTermo(termo, palavra) !== null)) return { grupo: "informativo", expressao: null };
  return { grupo: "outros", expressao: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// O diagnóstico
// ─────────────────────────────────────────────────────────────────────────────

/** Os leads do site na mesma janela, só contagem (de `leads`). */
export interface LeadsDaJanela {
  total: number;
  /** Fora o canal que nasce no Chatwoot, que não tem como carregar gclid. */
  doSite: number;
  /**
   * Com identificador de clique do Google: `gclid`, ou `gbraid`/`wbraid`, que
   * vêm NO LUGAR dele no iPhone, no app e em parte do PMax/YouTube. Contar só
   * o `gclid` daria o iPhone por perdido.
   */
  comGclid: number;
  /** utm_source começando por "google" e utm_medium de mídia paga (cpc, ppc, paid…). */
  comUtmGoogle: number;
}

export interface Achado {
  regra: Regra;
  grupo: GrupoDeTermo | null;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
  evidencias: Record<string, unknown>;
}

export interface Proposta {
  /** Índice do achado que a originou, em `achados`. */
  achado: number;
  chave: string;
  tipo: TipoDeAcao;
  campanhaId: string;
  campanhaNome: string;
  grupoId: string | null;
  grupoNome: string | null;
  /** Só no Meta: o anúncio (de `pausar_anuncio`). O "grupo" do Meta é o conjunto. */
  anuncioId?: string | null;
  anuncioNome?: string | null;
  texto: string | null;
  correspondencia: Correspondencia | null;
  verbaAtual: number | null;
  verbaNova: number | null;
  motivo: string;
  /** O que esse alvo gastou nos 7 dias sem converter — o teto do que a mudança poupa. */
  economia7d: number | null;
  evidencias: Record<string, unknown>;
}

export interface ResumoDoDiagnostico {
  custo7: number;
  cliques7: number;
  impressoes7: number;
  conversoes7: number;
  /** Gasto em termos com zero conversão (todos os termos, não só os de proposta). */
  custoSemConversao: number;
  leads: LeadsDaJanela;
  /** `false` quando alguma regra de medição acusou problema, ou não deu para ler. */
  medicaoConfiavel: boolean;
  achados: Record<Gravidade, number>;
  propostas: number;
  secoesComErro: Secao[];
}

export interface ResultadoDoDiagnostico {
  resumo: ResumoDoDiagnostico;
  achados: Achado[];
  propostas: Proposta[];
}

const arred = (n: number) => Math.round(n * 100) / 100;
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${Math.round(n)}%`;
const soma = <T>(xs: T[], f: (x: T) => number) => arred(xs.reduce((s, x) => s + f(x), 0));

/** Situações em que o anúncio pode rodar (ainda que limitado). */
const APROVADO = new Set(["APPROVED", "APPROVED_LIMITED", "AREA_OF_INTEREST_ONLY"]);

/**
 * A identidade da negativa. Com o acento: "são tomé" e "sao tome" são DUAS
 * negativas no Google (negativa não pega variação), e a chave não pode fundi-las.
 */
const chaveDaNegativa = (campanhaId: string, correspondencia: Correspondencia, texto: string) =>
  `negativar:${campanhaId}:${correspondencia}:${texto}`;

function regraDosTermos(d: DiagnosticoDaConta, p: ParametrosDoCopiloto, achados: Achado[], propostas: Proposta[]): void {
  if (d.erros.termos) {
    achados.push({
      regra: "termos_sem_conversao",
      grupo: null,
      gravidade: "media",
      titulo: "Os termos de pesquisa não puderam ser lidos",
      detalhe: `O script não leu os termos de pesquisa (${d.erros.termos}). Sem eles não há proposta de negativa hoje.`,
      evidencias: {},
    });
    return;
  }

  // Termo já negativado (EXCLUDED, ADDED_EXCLUDED) não gasta mais; termo que
  // é palavra-chave (ADDED) não se negativa — seria bloquear a própria compra.
  const semConversao = d.termos.filter((t) => t.custo > 0 && t.conversoes === 0 && !(t.status ?? "").includes("EXCLUDED"));
  const daPalavra = semConversao.filter((t) => t.status === "ADDED");
  const candidatos = semConversao.filter((t) => t.status !== "ADDED");

  const porGrupo = new Map<GrupoDeTermo, Array<TermoDePesquisa & { expressao: string | null }>>();
  for (const t of candidatos) {
    const c = classificarTermo(t.termo, p);
    porGrupo.set(c.grupo, [...(porGrupo.get(c.grupo) ?? []), { ...t, expressao: c.expressao }]);
  }

  for (const grupo of GRUPOS_DE_TERMO) {
    const termos = (porGrupo.get(grupo) ?? []).sort((a, b) => b.custo - a.custo);
    if (termos.length === 0) continue;
    const abaixo = grupo === "outros" ? termos.filter((t) => t.custo < p.gastoMinimoTermo) : [];
    const custo = soma(termos, (t) => t.custo);
    const indice = achados.length;
    achados.push({
      regra: "termos_sem_conversao",
      grupo,
      gravidade: grupo === "outros" ? (custo >= p.gastoMinimoCampanha ? "media" : "baixa") : "alta",
      titulo: `${ROTULO_DO_GRUPO[grupo]}: ${termos.length} ${termos.length === 1 ? "termo gastou" : "termos gastaram"} ${reais(custo)} sem conversão`,
      detalhe:
        grupo === "concorrente"
          ? "Gente procurando outra loja pelo nome. A negativa é por expressão (correspondência de frase) na campanha que pagou o clique."
          : grupo === "cidade"
            ? "Pesquisas com cidade que a loja marcou como fora da área. A negativa é pela cidade, em frase, na campanha que pagou o clique."
            : grupo === "informativo"
              ? "Quem pesquisa para saber, não para comprar. A negativa é do termo exato: a palavra sozinha poderia bloquear busca boa."
              : abaixo.length > 0
                ? `Sem classe. Viram proposta os que gastaram a partir de ${reais(p.gastoMinimoTermo)}; ${abaixo.length} abaixo disso ficam só aqui.`
                : `Sem classe, e cada um gastou pelo menos ${reais(p.gastoMinimoTermo)}. A negativa é do termo exato.`,
      evidencias: {
        custo,
        cliques: soma(termos, (t) => t.cliques),
        termos: termos.slice(0, 50).map((t) => ({ termo: t.termo, campanha: t.campanha, custo: t.custo, cliques: t.cliques })),
      },
    });

    if (grupo === "concorrente" || grupo === "cidade") {
      // Uma negativa por expressão e campanha, cobrindo todos os termos dela.
      const porAlvo = new Map<string, typeof termos>();
      for (const t of termos) {
        const k = `${t.campanhaId}|${t.expressao}`;
        porAlvo.set(k, [...(porAlvo.get(k) ?? []), t]);
      }
      for (const cobertos of porAlvo.values()) {
        const t = cobertos[0];
        const textoDaNegativa = t.expressao!;
        if (!cabeNaNegativa(textoDaNegativa)) continue;
        const economia = soma(cobertos, (x) => x.custo);
        propostas.push({
          achado: indice,
          chave: chaveDaNegativa(t.campanhaId, "frase", textoDaNegativa),
          tipo: "negativar",
          campanhaId: t.campanhaId,
          campanhaNome: t.campanha,
          grupoId: null,
          grupoNome: null,
          texto: textoDaNegativa,
          correspondencia: "frase",
          verbaAtual: null,
          verbaNova: null,
          motivo: `${ROTULO_DO_GRUPO[grupo]}: "${textoDaNegativa}" apareceu em ${cobertos.length} ${cobertos.length === 1 ? "termo" : "termos"} e gastou ${reais(economia)} em 7 dias sem conversão.`,
          economia7d: economia,
          evidencias: { termos: cobertos.slice(0, EXEMPLOS).map((x) => ({ termo: x.termo, custo: x.custo, cliques: x.cliques })) },
        });
      }
    } else {
      for (const t of termos) {
        if (grupo === "outros" && t.custo < p.gastoMinimoTermo) continue;
        const textoDaNegativa = limparTermo(t.termo);
        if (!cabeNaNegativa(textoDaNegativa)) continue;
        propostas.push({
          achado: indice,
          chave: chaveDaNegativa(t.campanhaId, "exata", textoDaNegativa),
          tipo: "negativar",
          campanhaId: t.campanhaId,
          campanhaNome: t.campanha,
          grupoId: null,
          grupoNome: null,
          texto: textoDaNegativa,
          correspondencia: "exata",
          verbaAtual: null,
          verbaNova: null,
          motivo: `${ROTULO_DO_GRUPO[grupo]}: gastou ${reais(t.custo)} em ${t.cliques} ${t.cliques === 1 ? "clique" : "cliques"} nos 7 dias, sem conversão.`,
          economia7d: arred(t.custo),
          evidencias: { termos: [{ termo: t.termo, custo: t.custo, cliques: t.cliques }], grupo: t.grupo },
        });
      }
    }
  }

  if (daPalavra.length > 0) {
    const custo = soma(daPalavra, (t) => t.custo);
    achados.push({
      regra: "termos_sem_conversao",
      grupo: null,
      gravidade: custo >= p.gastoMinimoCampanha ? "media" : "baixa",
      titulo: `${daPalavra.length} ${daPalavra.length === 1 ? "termo que é palavra-chave gastou" : "termos que são palavra-chave gastaram"} ${reais(custo)} sem conversão`,
      detalhe:
        "O termo é a própria palavra-chave da conta. Negativar seria desligar a palavra; o copiloto não propõe. Se ela não serve, pause a palavra no Google Ads.",
      evidencias: { termos: daPalavra.slice(0, EXEMPLOS).map((t) => ({ termo: t.termo, campanha: t.campanha, custo: t.custo })) },
    });
  }
}

/**
 * Medição: `true` quando nada acusa problema. A seção ilegível conta como
 * problema — zero conversão de uma conta que não se consegue ler não é prova
 * de nada, e as regras que pausam e cortam verba dependem desta resposta.
 */
function regraDaMedicao(d: DiagnosticoDaConta, leads: LeadsDaJanela, p: ParametrosDoCopiloto, achados: Achado[]): boolean {
  let confiavel = true;
  const acusar = (gravidade: Gravidade, titulo: string, detalhe: string, evidencias: Record<string, unknown> = {}) => {
    achados.push({ regra: "medicao", grupo: null, gravidade, titulo, detalhe, evidencias });
    if (gravidade === "alta") confiavel = false;
  };

  if (d.erros.conta) {
    acusar("alta", "A configuração da conta não pôde ser lida", `O script não leu a conta (${d.erros.conta}). Não dá para saber se a marcação automática está ligada.`);
  } else if (d.conta.autoTagging === false) {
    acusar(
      "alta",
      "A marcação automática (gclid) está desligada",
      "Sem ela o Google não acrescenta o gclid ao endereço do clique: nenhum lead chega com gclid e nenhuma conversão do site é atribuída ao anúncio. Ligue em Google Ads → Administrador → Configurações da conta → Marcação automática.",
    );
  }

  if (d.erros.conversoes) {
    acusar("alta", "As ações de conversão não puderam ser lidas", `O script não leu as conversões (${d.erros.conversoes}).`);
  } else {
    const primarias = d.conversoes.filter((a) => a.primaria && a.situacao === "ENABLED");
    if (primarias.length === 0) {
      acusar(
        "alta",
        "Nenhuma ação de conversão primária ativa",
        "Sem ação primária, a coluna Conversões fica em zero e os lances automáticos não têm o que buscar.",
        { acoes: d.conversoes.map((a) => ({ nome: a.nome, situacao: a.situacao, primaria: a.primaria })) },
      );
    } else if (primarias.every((a) => a.ultimos30 === 0)) {
      acusar(
        "alta",
        "Nenhuma conversão primária registrada em 30 dias",
        "As ações primárias estão ativas e não registraram nada no mês. Ou a tag não dispara, ou o tráfego não converte: o cruzamento com os leads do site, abaixo, separa uma coisa da outra.",
        { acoes: primarias.map((a) => ({ nome: a.nome, ultimoDia: a.ultimoDia })) },
      );
    } else {
      const caladas = primarias.filter((a) => a.ultimos30 === 0);
      if (caladas.length > 0) {
        acusar(
          "media",
          `${caladas.length} ${caladas.length === 1 ? "ação primária sem registro" : "ações primárias sem registro"} em 30 dias`,
          "Outras ações registram; estas não. Confira se a tag delas ainda existe no GTM, ou rebaixe-as para secundárias.",
          { acoes: caladas.map((a) => ({ nome: a.nome, ultimoDia: a.ultimoDia })) },
        );
      }
    }
  }

  // O site sabe que o lead veio de um clique (gclid na linha) e o Google não
  // contou a conversão. Poucos leads não provam nada: o Google conta a
  // conversão no dia do CLIQUE, e o gclid guardado há semanas cai fora da
  // janela. A partir de `leadsGclidMinimos` contra zero, é a medição.
  if (!d.erros.campanhas) {
    const conversoes = soma(d.campanhas, (c) => c.conversoes7);
    const evidencias = { leadsComGclid: leads.comGclid, conversoesNoGoogle: conversoes };
    if (leads.comGclid >= p.leadsGclidMinimos && conversoes === 0) {
      acusar(
        "alta",
        "Lead com gclid no site e nenhuma conversão no Google",
        `Entraram ${leads.comGclid} leads com gclid nos 7 dias e o Google não registrou conversão nenhuma. A tag de conversão não está chegando ao Google.`,
        evidencias,
      );
    } else if (leads.comGclid > conversoes) {
      acusar(
        "baixa",
        "Mais leads com gclid do que conversões no Google",
        `Entraram ${leads.comGclid} leads com gclid nos 7 dias e o Google registrou ${conversoes}. Pode ser só o calendário (o Google conta a conversão no dia do clique); se a diferença crescer, confira a tag.`,
        evidencias,
      );
    }
  }

  return confiavel;
}

function regraDosCliquesELeads(d: DiagnosticoDaConta, leads: LeadsDaJanela, p: ParametrosDoCopiloto, achados: Achado[]): void {
  if (d.erros.campanhas) return;
  const cliques = soma(d.campanhas, (c) => c.cliques7);
  if (cliques === 0) return;
  const taxa = (leads.comGclid / cliques) * 100;
  const evidencias = { cliques, ...leads, taxaPct: arred(taxa) };
  const perdidoNoCaminho = leads.comUtmGoogle > leads.comGclid;

  let gravidade: Gravidade = "baixa";
  let detalhe = `De ${cliques} cliques pagos, ${leads.comGclid} ${leads.comGclid === 1 ? "virou lead" : "viraram lead"} com gclid (${taxa.toFixed(1).replace(".", ",")}%). O site recebeu ${leads.doSite} ${leads.doSite === 1 ? "lead" : "leads"} de formulário no período, ${leads.total} contando o WhatsApp.`;
  if (perdidoNoCaminho) {
    gravidade = "media";
    detalhe += ` ${leads.comUtmGoogle - leads.comGclid} chegaram com utm de Google pago e SEM identificador de clique (nem gclid, nem gbraid/wbraid, o gclid do iPhone). O identificador se perde entre o clique e o formulário: redirecionamento, página que não guarda o parâmetro, ou marcação automática desligada no dia do clique.`;
  } else if (cliques >= p.cliquesMinimosGclid && leads.comGclid === 0) {
    gravidade = "media";
    detalhe +=
      " Nenhum lead com gclid (nem gbraid/wbraid, o gclid do iPhone). Ou o clique pago não está virando lead (veja os termos de pesquisa), ou o identificador se perde entre o clique e o formulário.";
  }
  achados.push({
    regra: "cliques_e_leads",
    grupo: null,
    gravidade,
    titulo: `${cliques} cliques → ${leads.comGclid} ${leads.comGclid === 1 ? "lead" : "leads"} com gclid`,
    detalhe,
    evidencias,
  });
}

function regraDoRitmo(d: DiagnosticoDaConta, p: ParametrosDoCopiloto, medicaoConfiavel: boolean, achados: Achado[], propostas: Proposta[]): void {
  if (d.erros.campanhas) {
    achados.push({
      regra: "ritmo_de_verba",
      grupo: null,
      gravidade: "media",
      titulo: "As campanhas não puderam ser lidas",
      detalhe: `O script não leu verba e gasto das campanhas (${d.erros.campanhas}).`,
      evidencias: {},
    });
    return;
  }
  for (const c of d.campanhas) {
    if (c.situacao !== "ENABLED" || c.verba === null || c.verba <= 0) continue;
    if (c.impressoes7 === 0) continue; // é "anúncio parado", não ritmo
    const ritmo = (c.custo7 / (c.verba * 7)) * 100;
    const base = { verba: c.verba, custo7: c.custo7, ritmoPct: arred(ritmo), conversoes7: c.conversoes7, perdaPorVerba: c.perdaPorVerba, perdaPorRanking: c.perdaPorRanking };

    if (ritmo >= p.ritmoAltoPct && c.conversoes7 === 0 && c.custo7 >= p.gastoMinimoCampanha) {
      const indice = achados.length;
      achados.push({
        regra: "ritmo_de_verba",
        grupo: null,
        gravidade: "alta",
        titulo: `${c.nome}: gasta a verba inteira sem conversão`,
        detalhe: `Gastou ${reais(c.custo7)} em 7 dias (${pct(ritmo)} da verba de ${reais(c.verba)}/dia) e não converteu.${medicaoConfiavel ? "" : " A medição está com problema (veja acima): por isso o copiloto não propõe cortar a verba hoje."}`,
        evidencias: base,
      });
      if (!medicaoConfiavel) continue;
      if (c.verbaCompartilhada) {
        achados[indice].detalhe += " A verba é compartilhada com outras campanhas: mude pelo Google Ads, o copiloto não mexe em verba compartilhada.";
        continue;
      }
      const nova = Math.max(1, Math.round(c.verba * (1 - p.reducaoVerbaPct / 100)));
      if (nova === c.verba) continue;
      propostas.push({
        achado: indice,
        chave: `verba:${c.id}`,
        tipo: "mudar_verba",
        campanhaId: c.id,
        campanhaNome: c.nome,
        grupoId: null,
        grupoNome: null,
        texto: null,
        correspondencia: null,
        verbaAtual: c.verba,
        verbaNova: nova,
        motivo: `Gastou ${reais(c.custo7)} em 7 dias sem conversão, ${pct(ritmo)} da verba. Corta ${p.reducaoVerbaPct}% até as negativas e a medição mostrarem resultado.`,
        economia7d: arred((c.verba - nova) * 7),
        evidencias: base,
      });
    } else if (ritmo >= p.ritmoAltoPct && c.conversoes7 > 0 && (c.perdaPorVerba ?? 0) * 100 >= p.perdaPorVerbaPct) {
      achados.push({
        regra: "ritmo_de_verba",
        grupo: null,
        gravidade: "baixa",
        titulo: `${c.nome}: limitada pela verba e convertendo`,
        detalhe: `Converteu ${c.conversoes7} em 7 dias e perdeu ${pct((c.perdaPorVerba ?? 0) * 100)} das impressões por falta de verba. Aumentar a verba é decisão de quem paga: o copiloto não propõe aumento.`,
        evidencias: base,
      });
    } else if (ritmo < p.ritmoBaixoPct) {
      const ranking = c.perdaPorRanking ?? 0;
      achados.push({
        regra: "ritmo_de_verba",
        grupo: null,
        gravidade: "baixa",
        titulo: `${c.nome}: gasta ${pct(ritmo)} da verba`,
        detalhe:
          ranking * 100 >= p.perdaPorRankingPct
            ? `A verba sobra porque o anúncio perde ${pct(ranking * 100)} das impressões por classificação (lance ou índice de qualidade), não por falta de busca.`
            : "A verba sobra: há pouca busca para as palavras-chave da campanha, ou o lance está baixo.",
        evidencias: base,
      });
    }
  }
}

function regraDosGrupos(d: DiagnosticoDaConta, p: ParametrosDoCopiloto, medicaoConfiavel: boolean, achados: Achado[], propostas: Proposta[]): void {
  if (d.erros.grupos) return;
  const gastadores = d.grupos.filter((g) => g.custo7 >= p.gastoMinimoGrupo && g.conversoes7 === 0).sort((a, b) => b.custo7 - a.custo7);
  if (gastadores.length === 0) return;
  const custo = soma(gastadores, (g) => g.custo7);
  const indice = achados.length;
  achados.push({
    regra: "ritmo_de_verba",
    grupo: null,
    gravidade: "media",
    titulo: `${gastadores.length} ${gastadores.length === 1 ? "grupo gastou" : "grupos gastaram"} ${reais(custo)} sem conversão`,
    detalhe: medicaoConfiavel
      ? `Cada um passou de ${reais(p.gastoMinimoGrupo)} em 7 dias sem converter. Pausar o grupo para o gasto dele; as negativas, acima, cortam só o termo ruim. Grupo pausado reativa pelo "Desfazer".`
      : "A medição está com problema (veja acima): zero conversão pode ser falta de medição, e por isso o copiloto não propõe pausar grupo hoje.",
    evidencias: { grupos: gastadores.slice(0, EXEMPLOS).map((g) => ({ grupo: g.nome, campanha: g.campanha, custo7: g.custo7, cliques7: g.cliques7 })) },
  });
  if (!medicaoConfiavel) return;
  for (const g of gastadores) {
    // Os outros grupos que GASTARAM na campanha também estão propostos? Grupo
    // sem gasto na semana não está rodando: aprovar todos para a campanha.
    const rodando = d.grupos.filter((x) => x.campanhaId === g.campanhaId && x.custo7 > 0);
    const ultimo = rodando.every((x) => x.custo7 >= p.gastoMinimoGrupo && x.conversoes7 === 0);
    propostas.push({
      achado: indice,
      chave: `pausar_grupo:${g.id}`,
      tipo: "pausar_grupo",
      campanhaId: g.campanhaId,
      campanhaNome: g.campanha,
      grupoId: g.id,
      grupoNome: g.nome,
      texto: null,
      correspondencia: null,
      verbaAtual: null,
      verbaNova: null,
      motivo: `Gastou ${reais(g.custo7)} em ${g.cliques7} cliques nos 7 dias, sem conversão.${ultimo ? " Os outros grupos que gastaram na campanha também estão propostos: aprovar todos desliga a campanha." : ""}`,
      economia7d: arred(g.custo7),
      evidencias: { custo7: g.custo7, cliques7: g.cliques7 },
    });
  }
}

function regraDosAnunciosParados(d: DiagnosticoDaConta, achados: Achado[]): void {
  const parado = (gravidade: Gravidade, titulo: string, detalhe: string, evidencias: Record<string, unknown>) =>
    achados.push({ regra: "anuncios_parados", grupo: null, gravidade, titulo, detalhe, evidencias });

  if (!d.erros.campanhas) {
    const semImpressao = d.campanhas.filter((c) => c.situacao === "ENABLED" && c.impressoes7 === 0);
    if (semImpressao.length > 0) {
      parado(
        "alta",
        `${semImpressao.length} ${semImpressao.length === 1 ? "campanha ativa sem" : "campanhas ativas sem"} impressão em 7 dias`,
        "Ativa e sem aparecer para ninguém. O motivo que o Google dá está ao lado de cada uma.",
        { campanhas: semImpressao.map((c) => ({ campanha: c.nome, motivos: c.motivos })) },
      );
    }
  }

  if (d.erros.anuncios) {
    parado("media", "Os anúncios não puderam ser lidos", `O script não leu os anúncios (${d.erros.anuncios}).`, {});
  } else {
    const porGrupo = new Map<string, AnuncioNaConta[]>();
    for (const a of d.anuncios) porGrupo.set(a.grupoId, [...(porGrupo.get(a.grupoId) ?? []), a]);
    const semAnuncio = d.erros.grupos ? [] : d.grupos.filter((g) => !porGrupo.has(g.id));
    const travados = [...porGrupo.values()].filter((as) => !as.some((a) => APROVADO.has(a.aprovacao ?? "")));
    const reprovados = travados.filter((as) => as.some((a) => a.aprovacao === "DISAPPROVED"));
    const emRevisao = travados.filter((as) => !as.some((a) => a.aprovacao === "DISAPPROVED"));
    if (reprovados.length + semAnuncio.length > 0) {
      parado(
        "alta",
        `${reprovados.length + semAnuncio.length} ${reprovados.length + semAnuncio.length === 1 ? "grupo ativo sem" : "grupos ativos sem"} anúncio rodando`,
        "Grupo ativo cujos anúncios estão todos reprovados, ou sem anúncio ativo nenhum. Ele não aparece, e as palavras-chave dele ficam paradas.",
        {
          grupos: [
            ...reprovados.map((as) => ({ grupo: as[0].grupo, campanha: as[0].campanha, motivos: [...new Set(as.flatMap((a) => a.motivos))] })),
            ...semAnuncio.map((g) => ({ grupo: g.nome, campanha: g.campanha, motivos: ["sem anúncio ativo"] })),
          ].slice(0, EXEMPLOS),
        },
      );
    }
    if (emRevisao.length > 0) {
      parado(
        "baixa",
        `${emRevisao.length} ${emRevisao.length === 1 ? "grupo esperando" : "grupos esperando"} revisão do Google`,
        "Nenhum anúncio do grupo foi aprovado ainda. Normal até um dia útil depois de criar ou editar.",
        { grupos: emRevisao.slice(0, EXEMPLOS).map((as) => ({ grupo: as[0].grupo, campanha: as[0].campanha })) },
      );
    }
    const avulsos = d.anuncios.filter((a) => a.aprovacao === "DISAPPROVED" || a.aprovacao === "APPROVED_LIMITED");
    const soltos = avulsos.filter((a) => !travados.some((as) => as[0].grupoId === a.grupoId));
    if (soltos.length > 0) {
      parado(
        "media",
        `${soltos.length} ${soltos.length === 1 ? "anúncio reprovado ou limitado" : "anúncios reprovados ou limitados"}`,
        "O grupo ainda roda com outro anúncio, mas este não aparece (ou aparece para menos gente). O motivo é o tópico de política do Google.",
        { anuncios: soltos.slice(0, EXEMPLOS).map((a) => ({ anuncio: a.id, grupo: a.grupo, campanha: a.campanha, aprovacao: a.aprovacao, motivos: a.motivos })) },
      );
    }
  }

  if (d.erros.recursos) {
    parado("baixa", "Os recursos (títulos, sitelinks) não puderam ser lidos", `O script não leu os recursos (${d.erros.recursos}).`, {});
  } else if (d.recursos.length > 0) {
    parado(
      "media",
      `${d.recursos.length} ${d.recursos.length === 1 ? "recurso reprovado ou limitado" : "recursos reprovados ou limitados"}`,
      "Título, descrição, sitelink ou frase de destaque que o Google não está mostrando.",
      { recursos: d.recursos.slice(0, EXEMPLOS).map((r) => ({ tipo: r.tipo, texto: r.texto, campanha: r.campanha, situacao: r.situacao, motivos: r.motivos })) },
    );
  }
}

function regraDaQualidade(d: DiagnosticoDaConta, p: ParametrosDoCopiloto, achados: Achado[]): void {
  if (d.erros.palavras) return;
  const baixas = d.palavras.filter((k) => k.iq !== null && k.iq <= p.iqBaixo && k.custo > 0).sort((a, b) => b.custo - a.custo);
  if (baixas.length === 0) return;
  achados.push({
    regra: "qualidade",
    grupo: null,
    gravidade: "baixa",
    titulo: `${baixas.length} ${baixas.length === 1 ? "palavra-chave" : "palavras-chave"} com índice de qualidade até ${p.iqBaixo}`,
    detalhe:
      "Índice baixo encarece cada clique. O componente abaixo da média diz onde mexer: anúncio (texto que não fala da busca), página (a página de destino) ou CTR esperada.",
    evidencias: {
      palavras: baixas.slice(0, EXEMPLOS).map((k) => ({
        palavra: k.texto,
        campanha: k.campanha,
        iq: k.iq,
        anuncio: k.iqAnuncio,
        pagina: k.iqPagina,
        ctr: k.iqCtr,
        custo: k.custo,
      })),
    },
  });
}

const ORDEM_DA_GRAVIDADE: Record<Gravidade, number> = { alta: 0, media: 1, baixa: 2 };

/**
 * As regras, na ordem em que uma depende da outra: a medição vem antes porque
 * é ela que diz se "zero conversão" é prova ou falta de dado — e só com prova
 * o copiloto propõe pausar grupo ou cortar verba. Negativa de concorrente,
 * cidade e informativo não depende disso: é intenção errada, converta ou não.
 */
export function diagnosticar(d: DiagnosticoDaConta, leads: LeadsDaJanela, p: ParametrosDoCopiloto): ResultadoDoDiagnostico {
  const achados: Achado[] = [];
  const propostas: Proposta[] = [];

  const medicaoConfiavel = regraDaMedicao(d, leads, p, achados);
  regraDosCliquesELeads(d, leads, p, achados);
  regraDosTermos(d, p, achados, propostas);
  regraDoRitmo(d, p, medicaoConfiavel, achados, propostas);
  regraDosGrupos(d, p, medicaoConfiavel, achados, propostas);
  regraDosAnunciosParados(d, achados);
  regraDaQualidade(d, p, achados);

  // A mesma chave duas vezes (o mesmo termo em dois grupos da campanha): fica
  // a de maior economia, que já soma o que importa.
  const unicas = new Map<string, Proposta>();
  for (const pr of propostas) {
    const ja = unicas.get(pr.chave);
    if (!ja) unicas.set(pr.chave, pr);
    else ja.economia7d = arred((ja.economia7d ?? 0) + (pr.economia7d ?? 0));
  }
  const escolhidas = [...unicas.values()].sort((a, b) => (b.economia7d ?? 0) - (a.economia7d ?? 0)).slice(0, MAX_PROPOSTAS);

  // Ordena os achados por gravidade e reaponta as propostas.
  const ordem = achados.map((a, i) => ({ a, i })).sort((x, y) => ORDEM_DA_GRAVIDADE[x.a.gravidade] - ORDEM_DA_GRAVIDADE[y.a.gravidade] || x.i - y.i);
  const novoIndice = new Map(ordem.map((o, n) => [o.i, n]));
  const achadosOrdenados = ordem.map((o) => o.a);
  for (const pr of escolhidas) pr.achado = novoIndice.get(pr.achado)!;

  const contagem: Record<Gravidade, number> = { alta: 0, media: 0, baixa: 0 };
  for (const a of achadosOrdenados) contagem[a.gravidade]++;

  return {
    resumo: {
      custo7: soma(d.campanhas, (c) => c.custo7),
      cliques7: soma(d.campanhas, (c) => c.cliques7),
      impressoes7: soma(d.campanhas, (c) => c.impressoes7),
      conversoes7: soma(d.campanhas, (c) => c.conversoes7),
      custoSemConversao: soma(
        d.termos.filter((t) => t.conversoes === 0),
        (t) => t.custo,
      ),
      leads,
      medicaoConfiavel,
      achados: contagem,
      propostas: escolhidas.length,
      secoesComErro: SECOES.filter((s) => d.erros[s]),
    },
    achados: achadosOrdenados,
    propostas: escolhidas,
  };
}

/** O JSON que `public.midia_copiloto_gravar_diagnostico(jsonb)` lê. */
export function diagnosticoParaBanco(d: DiagnosticoDaConta, r: ResultadoDoDiagnostico) {
  return {
    conta: d.conta.id,
    de: d.janela.de,
    ate: d.janela.ate,
    previa: d.previa,
    dados: d,
    resumo: r.resumo,
    erros: d.erros,
    achados: r.achados.map((a) => ({
      regra: a.regra,
      grupo: a.grupo,
      gravidade: a.gravidade,
      titulo: a.titulo,
      detalhe: a.detalhe,
      evidencias: a.evidencias,
    })),
    propostas: r.propostas.map((pr) => ({
      achado: pr.achado,
      chave: pr.chave,
      tipo: pr.tipo,
      campanha_id_externo: pr.campanhaId,
      campanha_nome: pr.campanhaNome,
      grupo_id_externo: pr.grupoId,
      grupo_nome: pr.grupoNome,
      texto: pr.texto,
      correspondencia: pr.correspondencia,
      verba_atual: pr.verbaAtual,
      verba_nova: pr.verbaNova,
      motivo: pr.motivo,
      economia_7d: pr.economia7d,
      evidencias: pr.evidencias,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O vaivém com o script
// ─────────────────────────────────────────────────────────────────────────────

/** Uma ação aprovada, na forma que o script lê. */
export interface AcaoParaOScript {
  id: string;
  tipo: TipoDeAcao;
  campanhaId: string;
  grupoId: string | null;
  texto: string | null;
  correspondencia: Correspondencia | null;
  verbaAtual: number | null;
  verbaNova: number | null;
}

export interface ResultadoDaAcao {
  id: string;
  situacao: SituacaoDoResultado;
  /** O que o script leu da conta DEPOIS de aplicar. */
  lido: Record<string, unknown>;
  erro: string | null;
}

const FORMA_DO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && FORMA_DO_UUID.test(v);

/** Teto de resultados por chamada: é o teto da reserva. */
export const MAX_RESULTADOS = 50;

export function validarResultados(corpo: unknown): Validacao<ResultadoDaAcao[]> {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "corpo não é um objeto JSON" };
  const lista = (corpo as Record<string, unknown>).resultados;
  if (!Array.isArray(lista)) return { ok: false, erro: "`resultados` precisa ser uma lista" };
  if (lista.length > MAX_RESULTADOS) return { ok: false, erro: `mais de ${MAX_RESULTADOS} resultados` };
  const valor: ResultadoDaAcao[] = [];
  for (const [i, bruto] of lista.entries()) {
    const r = (bruto ?? {}) as Record<string, unknown>;
    if (!ehUuid(r.id)) return { ok: false, erro: `resultados[${i}].id não é uuid` };
    if (!(SITUACOES_DO_RESULTADO as readonly string[]).includes(r.situacao as string)) {
      return { ok: false, erro: `resultados[${i}].situacao precisa ser ${SITUACOES_DO_RESULTADO.join(", ")}` };
    }
    const lido = r.lido && typeof r.lido === "object" && !Array.isArray(r.lido) ? (r.lido as Record<string, unknown>) : {};
    if (JSON.stringify(lido).length > 4000) return { ok: false, erro: `resultados[${i}].lido grande demais` };
    const erro = textoOuNulo(r.erro, 500);
    if (r.situacao === "falhou" && !erro) return { ok: false, erro: `resultados[${i}] falhou sem dizer por quê` };
    valor.push({ id: r.id, situacao: r.situacao as SituacaoDoResultado, lido, erro });
  }
  return { ok: true, valor };
}

// ─────────────────────────────────────────────────────────────────────────────
// O que o painel manda
// ─────────────────────────────────────────────────────────────────────────────

export interface PedidoDeDecisao {
  ids: string[];
  decisao: "aprovar" | "recusar";
  nota: string | null;
}

export function validarDecisao(corpo: unknown): Validacao<PedidoDeDecisao> {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "corpo não é um objeto JSON" };
  const c = corpo as Record<string, unknown>;
  if (c.decisao !== "aprovar" && c.decisao !== "recusar") return { ok: false, erro: "decisão é aprovar ou recusar" };
  if (!Array.isArray(c.ids) || c.ids.length === 0 || c.ids.length > 200 || !c.ids.every(ehUuid)) {
    return { ok: false, erro: "ids precisa ser uma lista de 1 a 200 uuids" };
  }
  return { ok: true, valor: { ids: [...new Set(c.ids as string[])], decisao: c.decisao, nota: textoOuNulo(c.nota, 500) } };
}

/**
 * Pedido de verba (16/10/2026, pedido do dono): a mudança de verba que uma
 * PESSOA pede no painel — o aumento, que o diagnóstico nunca propõe, porque
 * aumento é decisão de quem paga. Nasce proposta e passa pela mesma aprovação;
 * o script aplica e lê de volta. A verba de agora e o nome da campanha não vêm
 * daqui: o banco lê da sincronização (`midia_copiloto_pedir_verba`).
 */
export const MIGRACAO_DO_PEDIDO_DE_VERBA = "20261016200000_copiloto_pedido_de_verba";

/**
 * Teto do pedido: a verba nova vai até 10× a de agora. É o teto do script
 * (`mudarVerba`: acima disso, `falhou` sem mexer) e o do CHECK
 * `midia_copiloto_acoes_pedido_na_faixa` — o teste confere que os três batem.
 * Um zero a mais digitado não chega à conta.
 */
export const TETO_DO_PEDIDO_DE_VERBA = 10;

/** Quem pediu, quando o perfil não tem nome — a mesma frase do banco. */
export const QUEM_PEDIU_SEM_NOME = "alguém da equipe";

/** O teto de verba diária do CHECK `midia_copiloto_acoes_verba_na_faixa`. */
export const VERBA_DIARIA_MAXIMA = 100_000;

export interface PedidoDeVerba {
  /** O ID da campanha no Google Ads (`midia_campanhas.id_externo`). */
  campanhaId: string;
  /** Por dia, em reais, com até dois centavos. */
  verbaNova: number;
  motivo: string | null;
}

export function validarPedidoDeVerba(corpo: unknown): Validacao<PedidoDeVerba> {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "corpo não é um objeto JSON" };
  const c = corpo as Record<string, unknown>;
  if (typeof c.campanhaId !== "string" || !/^[0-9]{1,20}$/.test(c.campanhaId)) {
    return { ok: false, erro: "campanhaId precisa ser o ID numérico da campanha no Google Ads" };
  }
  const v = c.verbaNova;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > VERBA_DIARIA_MAXIMA) {
    return { ok: false, erro: `a verba nova precisa ser maior que zero e até ${reais(VERBA_DIARIA_MAXIMA)} por dia` };
  }
  if (Math.abs(Math.round(v * 100) - v * 100) > 1e-6) return { ok: false, erro: "a verba vai até os centavos" };
  if (c.motivo !== undefined && c.motivo !== null && typeof c.motivo !== "string") return { ok: false, erro: "motivo precisa ser texto" };
  if (typeof c.motivo === "string" && c.motivo.trim().length > 500) return { ok: false, erro: "o motivo vai até 500 caracteres" };
  return { ok: true, valor: { campanhaId: c.campanhaId, verbaNova: Math.round(v * 100) / 100, motivo: textoOuNulo(c.motivo, 500) } };
}

/** Uma lista digitada (vírgula ou linha), como o banco a guarda: minúscula, aparada, sem repetir. */
export function normalizarLista(v: unknown): string[] {
  const bruto = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[\n,;]/) : [];
  return [...new Set(bruto.map((x) => x.trim().toLowerCase()).filter(Boolean))];
}

/**
 * As regras que a tela manda. O banco tem os mesmos limites em CHECK; conferir
 * aqui é só para a mensagem sair em português e apontar o campo.
 */
export function validarRegras(corpo: unknown): Validacao<ParametrosDoCopiloto> {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "corpo não é um objeto JSON" };
  const c = corpo as Record<string, unknown>;
  const n = (chave: string) => (typeof c[chave] === "number" ? (c[chave] as number) : Number(c[chave]));
  const p: ParametrosDoCopiloto = {
    gastoMinimoTermo: n("gastoMinimoTermo"),
    gastoMinimoGrupo: n("gastoMinimoGrupo"),
    gastoMinimoCampanha: n("gastoMinimoCampanha"),
    ritmoAltoPct: n("ritmoAltoPct"),
    ritmoBaixoPct: n("ritmoBaixoPct"),
    reducaoVerbaPct: n("reducaoVerbaPct"),
    iqBaixo: n("iqBaixo"),
    leadsGclidMinimos: n("leadsGclidMinimos"),
    cliquesMinimosGclid: n("cliquesMinimosGclid"),
    perdaPorVerbaPct: n("perdaPorVerbaPct"),
    perdaPorRankingPct: n("perdaPorRankingPct"),
    concorrentes: normalizarLista(c.concorrentes),
    cidadesFora: normalizarLista(c.cidadesFora),
    palavrasInformativas: normalizarLista(c.palavrasInformativas),
    horaDoDiagnostico: n("horaDoDiagnostico"),
  };
  const inteiro = (x: number, de: number, ate: number) => Number.isInteger(x) && x >= de && x <= ate;
  for (const chave of ["gastoMinimoTermo", "gastoMinimoGrupo", "gastoMinimoCampanha"] as const) {
    if (!(p[chave] > 0 && p[chave] <= 100000)) return { ok: false, erro: "Os mínimos de gasto vão de R$ 0,01 a R$ 100.000." };
  }
  if (!inteiro(p.ritmoAltoPct, 1, 100) || !inteiro(p.ritmoBaixoPct, 1, 100) || p.ritmoBaixoPct >= p.ritmoAltoPct) {
    return { ok: false, erro: "O ritmo baixo precisa ser menor que o alto, os dois de 1% a 100%." };
  }
  if (!inteiro(p.reducaoVerbaPct, 5, 90)) return { ok: false, erro: "O corte de verba vai de 5% a 90%." };
  if (!inteiro(p.iqBaixo, 1, 10)) return { ok: false, erro: "O índice de qualidade baixo vai de 1 a 10." };
  if (!inteiro(p.horaDoDiagnostico, 0, 23)) return { ok: false, erro: "A hora do diagnóstico vai de 0 a 23." };
  if (!inteiro(p.leadsGclidMinimos, 1, 100)) return { ok: false, erro: "Os leads com gclid que provam a medição quebrada vão de 1 a 100." };
  if (!inteiro(p.cliquesMinimosGclid, 1, 100000)) return { ok: false, erro: "Os cliques mínimos do achado de gclid vão de 1 a 100.000." };
  if (!inteiro(p.perdaPorVerbaPct, 1, 100) || !inteiro(p.perdaPorRankingPct, 1, 100)) {
    return { ok: false, erro: "A impressão perdida por verba e por classificação vai de 1% a 100%." };
  }
  for (const [nome, l] of [
    ["concorrentes", p.concorrentes],
    ["cidades fora da área", p.cidadesFora],
    ["palavras informativas", p.palavrasInformativas],
  ] as const) {
    if (l.length > 200) return { ok: false, erro: `A lista de ${nome} passa de 200 itens.` };
    const ruim = l.find((x) => x.length < 2 || x.length > 60);
    if (ruim !== undefined) return { ok: false, erro: `Na lista de ${nome}, "${ruim}" precisa ter de 2 a 60 caracteres.` };
  }
  return { ok: true, valor: p };
}

/** Data e hora locais de um instante, no fuso da conta. */
function diaEHora(agora: Date, fuso: string): { dia: string; hora: number } {
  const dia = agora.toLocaleDateString("en-CA", { timeZone: fuso });
  const hora = Number(agora.toLocaleString("en-US", { timeZone: fuso, hour: "numeric", hourCycle: "h23" }));
  return { dia, hora };
}

/**
 * O script deve ler a conta agora? Uma vez por dia: depois da hora marcada
 * (os números de ontem já assentaram) e se ainda não chegou diagnóstico hoje.
 * Prévia não conta — quem clicou "Visualizar" estava testando a instalação.
 */
export function diagnosticoDevido(ultimoRecebidoEm: string | null, agora: Date, fuso: string, horaDoDiagnostico: number): boolean {
  const { dia, hora } = diaEHora(agora, fuso);
  if (hora < horaDoDiagnostico) return false;
  if (!ultimoRecebidoEm) return true;
  return diaEHora(new Date(ultimoRecebidoEm), fuso).dia < dia;
}

/** O fuso que o script informa é IANA de verdade? (`toLocaleString` explode com fuso inválido.) */
export function fusoValido(fuso: unknown): fuso is string {
  if (typeof fuso !== "string" || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(fuso)) return false;
  try {
    new Date().toLocaleString("en-US", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/** Uma frase do que a ação faz, para a tela e para a trilha. */
export function descreverAcao(a: {
  tipo: TipoDeAcao;
  campanhaNome: string;
  grupoNome?: string | null;
  anuncioNome?: string | null;
  texto?: string | null;
  correspondencia?: Correspondencia | null;
  verbaAtual?: number | null;
  verbaNova?: number | null;
}): string {
  const negativa = a.correspondencia === "exata" ? `[${a.texto}]` : `"${a.texto}"`;
  switch (a.tipo) {
    case "negativar":
      return `Negativar ${negativa} na campanha ${a.campanhaNome}`;
    case "remover_negativa":
      return `Remover a negativa ${negativa} da campanha ${a.campanhaNome}`;
    case "pausar_grupo":
      return `Pausar o grupo ${a.grupoNome ?? "?"} (${a.campanhaNome})`;
    case "reativar_grupo":
      return `Reativar o grupo ${a.grupoNome ?? "?"} (${a.campanhaNome})`;
    case "mudar_verba":
      return `Verba de ${a.campanhaNome}: ${reais(a.verbaAtual ?? 0)} → ${reais(a.verbaNova ?? 0)} por dia`;
    case "pausar_conjunto":
      return `Pausar o conjunto ${a.grupoNome ?? "?"} (${a.campanhaNome})`;
    case "reativar_conjunto":
      return `Reativar o conjunto ${a.grupoNome ?? "?"} (${a.campanhaNome})`;
    case "pausar_anuncio":
      return `Pausar o anúncio ${a.anuncioNome ?? "?"} (${a.grupoNome ?? "?"} · ${a.campanhaNome})`;
    case "reativar_anuncio":
      return `Reativar o anúncio ${a.anuncioNome ?? "?"} (${a.grupoNome ?? "?"} · ${a.campanhaNome})`;
  }
}
