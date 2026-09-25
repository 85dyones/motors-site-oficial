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
  type ComponenteDoDesagio,
  type EstadoConservacao,
  type EstadoMecanico,
  type RecomendacaoAvaliacao,
} from "./avaliacaoRecomendacao";

/**
 * A régua dos retratos gravados entre 2026-09-24 e a troca pela curva (as três
 * faixas fixas de 2026-08-06). Não calcula mais nada: fica para o card saber
 * dizer por qual régua aquele número saiu.
 */
export const REGRA_TRES_FAIXAS = "tres_faixas_2026_08_06";

/** Sem régua legível no envio: o retrato sai sem recomendação. */
export const SEM_REGUA = "sem_regua";

/**
 * A recomendação como o painel a lê: campo a campo, cada um conferido no tipo
 * — nada passa "como veio". Serve aos dois formatos gravados: o da curva (com
 * `componentes` e `parametros_desde`) e o das três faixas (sem eles, que aqui
 * viram lista vazia e `null`).
 */
export interface RecomendacaoLida {
  regra: string | null;
  resumo: string;
  sinais: string[];
  componentes: ComponenteDoDesagio[];
  acima_do_teto: boolean;
  faixa: string | null;
  faixa_label: string | null;
  parametros_id: string | null;
  parametros_desde: string | null;
  desconto_min: number | null;
  desconto_max: number | null;
  km_esperado: number | null;
  km_desvio: number | null;
  valor_sugerido_min: number | null;
  valor_sugerido_max: number | null;
}

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
  /** `null` quando não havia régua legível no envio. */
  recomendacao: RecomendacaoLida | null;
}

/** Tetos por campo. O corpo vem de formulário público. */
const TETOS = { marca: 60, modelo: 120, observacoes: 1000, fipe_codigo: 20, mes_referencia: 40 };

const TIPOS: readonly TipoFipe[] = ["carros", "motos", "caminhoes"];

function texto(valor: unknown, teto: number): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const limpo = String(valor).trim();
  return limpo ? limpo.slice(0, teto) : null;
}

// `hasOwn`, e não `in`: com `in`, "constructor" passava como estado e o card
// mostrava "function Object() { [native code] }" (revisão de 24/09).
function ehMecanica(v: unknown): v is EstadoMecanico {
  return typeof v === "string" && Object.hasOwn(ROTULO_MECANICA, v);
}

function ehConservacao(v: unknown): v is EstadoConservacao {
  return typeof v === "string" && Object.hasOwn(ROTULO_CONSERVACAO, v);
}

/**
 * Tetos de sanidade para o que o formulário público diz sobre o carro. São
 * escolhas, não medições: acima de R$ 20 milhões de FIPE ou de 3 milhões de km
 * não há veículo que a loja avalie, e o número só pode ser erro ou fraude. O
 * formulário já corta o km em 7 dígitos; o teto aqui vale para quem chama a
 * rota sem o formulário.
 */
export const TETO_DA_FIPE_DO_FORMULARIO = 20_000_000;
export const TETO_DO_KM_DO_FORMULARIO = 3_000_000;

/**
 * A FIPE que o corpo do POST traz, em número — ou `null` se não houver, não
 * for legível ou passar do teto.
 *
 * Ela vem do NAVEGADOR (a cascata roda lá), então não é dado conferido: quem
 * chama a rota à mão escolhe o número. O teto tira o absurdo; o plausível
 * inventado só a vistoria pega, e por isso o card diz "FIPE no site".
 */
export function fipeDoCorpo(valor: unknown): number | null {
  const n = fipeParaNumero(typeof valor === "string" ? valor : null);
  return n !== null && n < TETO_DA_FIPE_DO_FORMULARIO ? n : null;
}

/** O km do corpo: número inteiro de 0 ao teto, ou `null`. Texto não vale. */
export function quilometragemDoCorpo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor <= TETO_DO_KM_DO_FORMULARIO
    ? Math.round(valor)
    : null;
}

/**
 * O retrato que vai para `leads.avaliacao`, montado a partir do corpo do POST.
 *
 * A recomendação entra PRONTA, calculada pela rota com os mesmos fatos: ela é
 * recalculada no servidor e nunca copiada do corpo — o cliente é público e
 * não dita a FAIXA que o consultor lê. A base dela, a FIPE, ainda vem do
 * navegador: ver `fipeDoCorpo`. `null` é "sem régua no envio".
 */
export function montarAvaliacaoDoLead(
  corpo: Record<string, unknown>,
  recomendacao: RecomendacaoAvaliacao | null,
): AvaliacaoDoLead {
  const tipo = TIPOS.includes(corpo.tipo_veiculo as TipoFipe) ? (corpo.tipo_veiculo as TipoFipe) : "carros";
  const ano = Number(corpo.ano);
  const fipeValor = fipeDoCorpo(corpo.fipe_valor);

  return {
    versao: 1,
    tipo_veiculo: tipo,
    marca: texto(corpo.marca, TETOS.marca) ?? "",
    modelo: texto(corpo.modelo, TETOS.modelo) ?? "",
    ano: Number.isInteger(ano) && ano > 1900 && ano < 2100 ? ano : null,
    veiculo_digitado: corpo.veiculo_digitado === true,
    quilometragem: quilometragemDoCorpo(corpo.quilometragem),
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
    regra: recomendacao?.regra ?? SEM_REGUA,
    recomendacao,
  };
}

/**
 * O retrato lido do banco, ou `null` quando não há (lead que não veio da
 * avaliação, ou anterior a 24/09) ou quando falta o mínimo: `versao: 1`, marca
 * e modelo. A recomendação pode faltar (régua indisponível no envio) sem
 * derrubar o retrato: o card mostra o carro e diz que não houve sugestão.
 *
 * Cada campo que o card lê é conferido e normalizado aqui, e não só os três
 * do mínimo. A primeira versão conferia só esses três e devolvia o resto como
 * veio: um retrato com `fipe: 5` ou sem `sinais` fazia o card lançar — e sem
 * `error.tsx` no painel, um lead torto derrubava `/admin/leads` inteira. Quem
 * grava torto existe: o staff pode escrever na coluna pelo PostgREST (ver o
 * cabeçalho da migração), e um `versao: 2` futuro pode mudar a forma.
 */
export function lerAvaliacaoDoLead(bruto: unknown): AvaliacaoDoLead | null {
  if (!ehObjeto(bruto)) return null;
  const a = bruto;
  if (a.versao !== 1 || typeof a.marca !== "string" || typeof a.modelo !== "string") return null;
  const r = a.recomendacao;

  const f = a.fipe;
  const fipeValor = ehObjeto(f) ? numeroOuNulo(f.valor) : null;

  return {
    versao: 1,
    tipo_veiculo: TIPOS.includes(a.tipo_veiculo as TipoFipe) ? (a.tipo_veiculo as TipoFipe) : "carros",
    marca: a.marca,
    modelo: a.modelo,
    ano: numeroOuNulo(a.ano),
    veiculo_digitado: a.veiculo_digitado === true,
    quilometragem: numeroOuNulo(a.quilometragem),
    estado_mecanico: ehMecanica(a.estado_mecanico) ? a.estado_mecanico : null,
    estado_conservacao: ehConservacao(a.estado_conservacao) ? a.estado_conservacao : null,
    observacoes: textoOuNulo(a.observacoes),
    fipe:
      ehObjeto(f) && fipeValor !== null && fipeValor > 0
        ? { valor: fipeValor, codigo: textoOuNulo(f.codigo), mes_referencia: textoOuNulo(f.mes_referencia) }
        : null,
    regra: typeof a.regra === "string" ? a.regra : "desconhecida",
    recomendacao: lerRecomendacao(r),
  };
}

/**
 * A recomendação gravada, conferida campo a campo. Sem `resumo` legível, é
 * `null`. A versão anterior conferia só `resumo`, `sinais` e `componentes` e
 * espalhava o resto como veio: `parametros_desde: ["2026-08-30"]` passava e o
 * card lançava no `split`.
 */
function lerRecomendacao(r: unknown): RecomendacaoLida | null {
  if (!ehObjeto(r) || typeof r.resumo !== "string") return null;
  const componentes = Array.isArray(r.componentes)
    ? r.componentes.flatMap((c): ComponenteDoDesagio[] => {
        if (!ehObjeto(c) || typeof c.nome !== "string") return [];
        const min = numeroOuNulo(c.pp_min);
        const max = numeroOuNulo(c.pp_max);
        if (min === null || max === null) return [];
        return [{ nome: c.nome, pp_min: min, pp_max: max, motivo: typeof c.motivo === "string" ? c.motivo : "" }];
      })
    : [];
  return {
    regra: textoOuNulo(r.regra),
    resumo: r.resumo,
    sinais: Array.isArray(r.sinais) ? r.sinais.filter((x): x is string => typeof x === "string") : [],
    componentes,
    acima_do_teto: r.acima_do_teto === true,
    faixa: textoOuNulo(r.faixa),
    faixa_label: textoOuNulo(r.faixa_label),
    parametros_id: textoOuNulo(r.parametros_id),
    parametros_desde: textoOuNulo(r.parametros_desde),
    desconto_min: numeroOuNulo(r.desconto_min),
    desconto_max: numeroOuNulo(r.desconto_max),
    km_esperado: numeroOuNulo(r.km_esperado),
    km_desvio: numeroOuNulo(r.km_desvio),
    valor_sugerido_min: numeroOuNulo(r.valor_sugerido_min),
    valor_sugerido_max: numeroOuNulo(r.valor_sugerido_max),
  };
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function numeroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
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
 * Como se escreve dinheiro no card: "55000", "55.000", "55.000,50" ou
 * "55000,5" — milhar com ponto em grupos de três, decimal com vírgula e até
 * dois dígitos. "R$" na frente é tolerado.
 */
const VALOR_ESCRITO = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/;

/**
 * O valor ofertado ou pago que o consultor digitou no card.
 *
 * Vazio limpa (`null`). O inválido RECUSA em vez de virar nulo — "abc" num
 * campo que já tinha R$ 55.000 não pode apagar o número em silêncio. E o
 * ambíguo também recusa: a primeira versão reaproveitava o leitor do "Valor
 * da venda" (`valorDoDesfecho`), que tira todo ponto antes de ler, e lia
 * "55000.50" como 5.500.050, "55,000" como 55 e `true` como 1 (revisão de
 * 24/09). Dinheiro do razão da compra não admite chute: ou a forma é uma das
 * de `VALOR_ESCRITO`, ou é número de verdade, ou é recusa.
 */
export function lerValorDaAvaliacao(v: unknown): LeituraDeValor {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    return { ok: true, valor: null };
  }
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string") {
    const limpo = v.trim().replace(/^R\$\s*/i, "");
    if (!VALOR_ESCRITO.test(limpo)) return { ok: false };
    n = Number(limpo.replace(/\./g, "").replace(",", "."));
  } else {
    return { ok: false };
  }
  if (!Number.isFinite(n) || n <= 0 || n >= TETO_DO_VALOR_DA_AVALIACAO) return { ok: false };
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
