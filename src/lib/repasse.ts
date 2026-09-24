/**
 * Repasse Motors — o carro vendido no estado, sem a garantia da loja.
 *
 * Spec: docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md (§4, §5).
 *
 * Os campos espelham as colunas de `public.repasses`, como `Veiculo` espelha
 * `estoque_motors`. Tudo o que é conta — reparo orçado, "você gasta",
 * diferença para a FIPE — é DERIVADO aqui e nunca vira coluna: um total
 * gravado discordaria dos itens no primeiro orçamento editado.
 *
 * ATENÇÃO ao nome: "repasse" aqui é a seção pública de carros no estado. Não
 * é `modalidade_tipo = 'repasse'` (carro que ENTROU vindo de outro lojista,
 * `veiculo_entradas`) nem o repasse de investidores (`investidores.ts`).
 */
import { CARENCIA_VENDIDO_DIAS } from "./carenciaDoVendido";
import { slugificar } from "./veiculoUrl";

/** Reprovado não existe de propósito: carro reprovado não entra (dono, 24/09). */
export const LAUDOS_DO_REPASSE = ["aprovado", "aprovado_com_apontamento", "nao_feito"] as const;
export type LaudoDoRepasse = (typeof LAUDOS_DO_REPASSE)[number];

export const SITUACOES_DO_REPASSE = [
  "rascunho",
  "em_validacao",
  "publicado",
  "reservado",
  "vendido",
  "arquivado",
] as const;
export type SituacaoDoRepasse = (typeof SITUACOES_DO_REPASSE)[number];

export const CARROCERIAS_DO_REPASSE = ["hatch", "seda", "suv", "picape", "outro"] as const;
export type CarroceriaDoRepasse = (typeof CARROCERIAS_DO_REPASSE)[number];

/** As faixas do formulário da lista. Mínimo incluso, teto excluso; `max: null` = sem teto. */
export const FAIXAS_DO_REPASSE = [
  { id: "ate-30", rotulo: "Até R$ 30 mil", min: 0, max: 30000 },
  { id: "30-50", rotulo: "De R$ 30 mil a R$ 50 mil", min: 30000, max: 50000 },
  { id: "50-80", rotulo: "De R$ 50 mil a R$ 80 mil", min: 50000, max: 80000 },
  { id: "acima-80", rotulo: "Acima de R$ 80 mil", min: 80000, max: null },
] as const;
export type FaixaDoRepasse = (typeof FAIXAS_DO_REPASSE)[number]["id"];

export const FILTROS_DO_REPASSE = ["todos", "com-laudo", "sem-laudo", "reparo-orcado"] as const;
export type FiltroDoRepasse = (typeof FILTROS_DO_REPASSE)[number];

export type EtiquetaDoRepasse = "REPARO ORÇADO" | "COM LAUDO" | "SEM LAUDO";

export interface ItemDeEstado {
  descricao: string;
  local: string;
  /** URL pública da foto do defeito (variante web). */
  foto: string | null;
  /** Orçamento do conserto em reais; null quando não há (ex.: estético). */
  orcamento: number | null;
  estetico: boolean;
}

export interface Repasse {
  id: string;
  slug: string;
  marca: string;
  modelo: string;
  versao: string | null;
  ano_modelo: number;
  ano_fabricacao: number | null;
  quilometragem: number;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
  carroceria: CarroceriaDoRepasse | null;
  preco: number;
  fipe_valor: number | null;
  fipe_codigo: string | null;
  fipe_mes_referencia: string | null;
  laudo: LaudoDoRepasse | null;
  laudo_apontamento: string | null;
  leilao_consta: boolean | null;
  leilao_detalhe: string | null;
  sinistro_consta: boolean | null;
  sinistro_detalhe: string | null;
  historico_consultado_em: string | null;
  resumo: string | null;
  motivo: string | null;
  itens_de_estado: ItemDeEstado[];
  sem_defeitos_conhecidos: boolean;
  oficina_do_orcamento: string | null;
  orcamento_em: string | null;
  web_full_images: string[];
  whatsapp_images: string[];
  situacao: SituacaoDoRepasse;
  lojistas_desde: string | null;
  aberto_ao_publico_em: string | null;
  reservado_em: string | null;
  vendido_em: string | null;
  arquivado_em: string | null;
  created_at: string;
}

export interface ContaDoRepasse {
  preco: number;
  reparoOrcado: number;
  voceGasta: number;
  fipe: number | null;
  /** FIPE menos o que você gasta. Negativo acima da tabela; null sem FIPE. */
  abaixoDaFipe: number | null;
}

type ParaConta = Pick<Repasse, "preco" | "fipe_valor" | "itens_de_estado">;

export function temLaudo(r: Pick<Repasse, "laudo">): boolean {
  return r.laudo === "aprovado" || r.laudo === "aprovado_com_apontamento";
}

export function contaDoRepasse(r: ParaConta): ContaDoRepasse {
  const reparoOrcado = r.itens_de_estado.reduce(
    (soma, item) =>
      typeof item.orcamento === "number" && item.orcamento > 0 ? soma + item.orcamento : soma,
    0,
  );
  const voceGasta = r.preco + reparoOrcado;
  const fipe = typeof r.fipe_valor === "number" && r.fipe_valor > 0 ? r.fipe_valor : null;
  return {
    preco: r.preco,
    reparoOrcado,
    voceGasta,
    fipe,
    abaixoDaFipe: fipe === null ? null : fipe - voceGasta,
  };
}

export function etiquetaDoRepasse(r: ParaConta & Pick<Repasse, "laudo">): EtiquetaDoRepasse {
  if (contaDoRepasse(r).reparoOrcado > 0) return "REPARO ORÇADO";
  return temLaudo(r) ? "COM LAUDO" : "SEM LAUDO";
}

/** Laudo e reparo são eixos independentes: um carro pode estar em dois filtros. */
export function passaNoFiltro(r: ParaConta & Pick<Repasse, "laudo">, filtro: FiltroDoRepasse): boolean {
  switch (filtro) {
    case "todos":
      return true;
    case "com-laudo":
      return temLaudo(r);
    case "sem-laudo":
      return !temLaudo(r);
    case "reparo-orcado":
      return contaDoRepasse(r).reparoOrcado > 0;
  }
}

/** Publicado e ainda sem o switch "abrir para todos" (spec §5). */
export function soParaLojistas(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">): boolean {
  return r.situacao === "publicado" && r.aberto_ao_publico_em === null;
}

const DIA_MS = 86_400_000;

/** Publicado, reservado, e vendido dentro da mesma carência do estoque. */
export function aparecePublicamente(r: Pick<Repasse, "situacao" | "vendido_em">, agora: Date): boolean {
  if (r.situacao === "publicado" || r.situacao === "reservado") return true;
  if (r.situacao !== "vendido" || !r.vendido_em) return false;
  const vendido = new Date(r.vendido_em).getTime();
  if (Number.isNaN(vendido)) return false;
  return agora.getTime() - vendido <= CARENCIA_VENDIDO_DIAS * DIA_MS;
}

/** `marca-modelo-versao-ano-xxxxxx`: legível e único pelos 6 primeiros do uuid. */
export function slugDoRepasse(r: Pick<Repasse, "id" | "marca" | "modelo" | "versao" | "ano_modelo">): string {
  const base = slugificar([r.marca, r.modelo, r.versao ?? "", String(r.ano_modelo)].join(" "));
  const sufixo = r.id.replace(/-/g, "").slice(0, 6).toLowerCase();
  return `${base}-${sufixo}`;
}

/** Em que faixa da lista um preço cai — é por ela que o painel casa inscrito e carro. */
export function faixaDoPreco(preco: number): FaixaDoRepasse {
  for (const faixa of FAIXAS_DO_REPASSE) {
    if (preco >= faixa.min && (faixa.max === null || preco < faixa.max)) return faixa.id;
  }
  return "acima-80";
}

/**
 * O piso do `check` de `ano_modelo` e `ano_fabricacao` em
 * 20260924180000_repasse_fundacao.sql. É mais alto que o `ANO_MINIMO` da casa
 * (1900): abaixo dele o banco recusa, então o painel recusa antes, com
 * mensagem. `tests/migracao-do-repasse.test.ts` confere que os dois batem.
 */
export const PISO_DO_ANO_NO_BANCO = 1950;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de repasse é uuid; qualquer outra coisa na URL vira 404 antes do banco. */
export function ehIdDeRepasse(id: string): boolean {
  return UUID.test(id);
}

/** Como a situação aparece no painel. */
export const NOME_DA_SITUACAO: Record<SituacaoDoRepasse, string> = {
  rascunho: "Rascunho",
  em_validacao: "Em validação",
  publicado: "Publicado",
  reservado: "Reservado",
  vendido: "Vendido",
  arquivado: "Arquivado",
};

/** "R$ 36.900": sem centavos, como o resto do site mostra preço de carro. */
export function emReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * O repasse como o PAINEL o vê: a linha inteira, com as colunas que a
 * leitura anônima não recebe (quem criou, quem validou, a nota da devolução).
 * Nunca vai para página pública.
 */
export interface RepasseDoPainel extends Repasse {
  criado_por: string | null;
  enviado_em: string | null;
  validado_por: string | null;
  validado_em: string | null;
  devolvido_com: string | null;
  updated_at: string | null;
}
