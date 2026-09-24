/**
 * A avaliação do site guardada no próprio lead — coluna `leads.avaliacao`
 * (migração 20260924190000).
 *
 * ---------------------------------------------------------------------------
 * Por que existe
 * ---------------------------------------------------------------------------
 * Até 24/09/2026, `/api/avaliacao` gravava do pedido só o `interesse` ("Ford
 * Ka 1.0 … 2019"). Quilometragem, estado, FIPE, observações e a faixa de
 * compra sugerida iam apenas para o webhook do n8n. Resultado: o card do
 * kanban não mostrava nada disso, o consultor perguntava tudo de novo no
 * WhatsApp, e a loja não tinha como conferir a régua de compra contra o que
 * pagou de verdade — as três avaliações no banco naquele dia não tinham km,
 * estado nem FIPE.
 *
 * Este módulo tem as duas pontas: `montarAvaliacaoDoLead` (servidor, na
 * gravação) e `lerAvaliacaoDoLead` (painel, na leitura). A leitura é
 * defensiva de propósito: a coluna é jsonb, e um retrato torto não pode
 * derrubar o kanban inteiro.
 *
 * O cliente nunca vê nada disto: a recomendação é insumo do consultor. Ver
 * `lib/avaliacaoRecomendacao.ts`.
 */
import type { TipoFipe } from "./consultaFipe";
import {
  fipeParaNumero,
  ROTULO_CONSERVACAO,
  ROTULO_MECANICA,
  type EstadoConservacao,
  type EstadoMecanico,
  type RecomendacaoAvaliacao,
} from "./avaliacaoRecomendacao";
import { valorDoDesfecho } from "./funil";

/**
 * A régua que produziu a recomendação. Vai junto no retrato porque a régua
 * vai mudar (a curva de `parametros_avaliacao`, spec 11), e a recalibração
 * precisa saber qual régua sugeriu cada número.
 */
export const REGRA_DA_RECOMENDACAO = "tres_faixas_2026_08_06";

export interface AvaliacaoDoLead {
  versao: 1;
  tipo_veiculo: TipoFipe;
  marca: string;
  modelo: string;
  ano: number | null;
  /** Marca, modelo e ano digitados porque a FIPE não respondeu. */
  veiculo_digitado: boolean;
  quilometragem: number | null;
  estado_mecanico: EstadoMecanico | null;
  estado_conservacao: EstadoConservacao | null;
  observacoes: string | null;
  fipe: { valor: number; codigo: string | null; mes_referencia: string | null } | null;
  regra: string;
  recomendacao: RecomendacaoAvaliacao;
}

/** Tetos por campo. O corpo vem de formulário público. */
const TETOS = { marca: 60, modelo: 120, observacoes: 1000, fipe_codigo: 20, mes_referencia: 40 };

const TIPOS: readonly TipoFipe[] = ["carros", "motos", "caminhoes"];

function texto(valor: unknown, teto: number): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const limpo = String(valor).trim();
  return limpo ? limpo.slice(0, teto) : null;
}

function ehMecanica(v: unknown): v is EstadoMecanico {
  return typeof v === "string" && v in ROTULO_MECANICA;
}

function ehConservacao(v: unknown): v is EstadoConservacao {
  return typeof v === "string" && v in ROTULO_CONSERVACAO;
}

/**
 * O retrato que vai para `leads.avaliacao`, montado a partir do corpo do POST.
 *
 * A recomendação entra PRONTA, calculada pela rota com os mesmos fatos: ela é
 * recalculada no servidor e nunca copiada do corpo — o cliente é público e
 * não dita o preço que o consultor lê.
 */
export function montarAvaliacaoDoLead(
  corpo: Record<string, unknown>,
  recomendacao: RecomendacaoAvaliacao,
): AvaliacaoDoLead {
  const tipo = TIPOS.includes(corpo.tipo_veiculo as TipoFipe) ? (corpo.tipo_veiculo as TipoFipe) : "carros";
  const ano = Number(corpo.ano);
  const km = corpo.quilometragem;
  const fipeValor = fipeParaNumero(typeof corpo.fipe_valor === "string" ? corpo.fipe_valor : null);

  return {
    versao: 1,
    tipo_veiculo: tipo,
    marca: texto(corpo.marca, TETOS.marca) ?? "",
    modelo: texto(corpo.modelo, TETOS.modelo) ?? "",
    ano: Number.isInteger(ano) && ano > 1900 && ano < 2100 ? ano : null,
    veiculo_digitado: corpo.veiculo_digitado === true,
    quilometragem: typeof km === "number" && Number.isFinite(km) && km >= 0 ? Math.round(km) : null,
    estado_mecanico: ehMecanica(corpo.estado_mecanico) ? corpo.estado_mecanico : null,
    estado_conservacao: ehConservacao(corpo.estado_conservacao) ? corpo.estado_conservacao : null,
    observacoes: texto(corpo.observacoes, TETOS.observacoes),
    fipe:
      fipeValor === null
        ? null
        : {
            valor: fipeValor,
            codigo: texto(corpo.fipe_codigo, TETOS.fipe_codigo),
            mes_referencia: texto(corpo.fipe_mes_referencia, TETOS.mes_referencia),
          },
    regra: REGRA_DA_RECOMENDACAO,
    recomendacao,
  };
}

/**
 * O retrato lido do banco, ou `null` quando não há (lead que não veio da
 * avaliação, ou anterior a 24/09) ou quando ele não tem a forma mínima.
 */
export function lerAvaliacaoDoLead(bruto: unknown): AvaliacaoDoLead | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const a = bruto as Partial<AvaliacaoDoLead>;
  if (typeof a.marca !== "string" || typeof a.modelo !== "string") return null;
  const r = a.recomendacao;
  if (!r || typeof r !== "object" || typeof r.resumo !== "string") return null;
  return a as AvaliacaoDoLead;
}

/** "mecânica boa · pequenos riscos de uso", para o card. */
export function estadoPorExtenso(a: Pick<AvaliacaoDoLead, "estado_mecanico" | "estado_conservacao">): string {
  return [
    a.estado_mecanico ? ROTULO_MECANICA[a.estado_mecanico] : null,
    a.estado_conservacao ? ROTULO_CONSERVACAO[a.estado_conservacao] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Acima disto é dedo pesado, não carro. */
export const TETO_DO_VALOR_DA_AVALIACAO = 100_000_000;

export type LeituraDeValor = { ok: true; valor: number | null } | { ok: false };

/**
 * O valor ofertado ou pago que o consultor digitou no card.
 *
 * Vazio limpa (`null`). O resto passa por `valorDoDesfecho`, o mesmo leitor do
 * "Valor da venda" do fechamento: ponto de milhar e vírgula decimal. A
 * diferença é que aqui o inválido RECUSA em vez de virar nulo — "abc" num
 * campo que já tinha R$ 55.000 não pode apagar o número em silêncio.
 */
export function lerValorDaAvaliacao(v: unknown): LeituraDeValor {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    return { ok: true, valor: null };
  }
  const n = valorDoDesfecho(typeof v === "string" ? v.replace(/^\s*R\$\s*/i, "").trim() : v);
  if (n === null || n >= TETO_DO_VALOR_DA_AVALIACAO) return { ok: false };
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

/**
 * O PostgREST respondeu que a coluna nova não existe: a migração ainda não
 * foi aplicada. `PGRST204` é o código da escrita ("Could not find the
 * 'avaliacao' column of 'leads' in the schema cache"); `42703` é o do
 * Postgres, quando o cache já sabe da tabela. Nenhum dos dois é o
 * `PGRST205`/`42P01` de `ehTabelaOuColunaAusente`, que fala da tabela.
 */
export function colunaDaAvaliacaoAusente(erro: unknown): boolean {
  const e = erro as { code?: string; message?: string } | null;
  if (!e) return false;
  return (e.code === "PGRST204" || e.code === "42703") && /avaliacao/.test(e.message ?? "");
}
