/**
 * Recomendação de avaliação — a faixa de compra sugerida ao consultor.
 *
 * Isto NÃO vai para a tela do cliente. O cliente nunca vê um valor de oferta
 * antes da vistoria presencial; o que ele vê é a referência FIPE. A
 * recomendação é calculada no SERVIDOR (`/api/avaliacao`), grava no lead
 * (`leads.avaliacao`) e viaja no JSON do n8n, para o consultor abrir o card já
 * com a faixa e a conta que a produziu.
 *
 * ---------------------------------------------------------------------------
 * A régua é a curva de deságio da spec 11, lida do banco
 * ---------------------------------------------------------------------------
 * Troca decidida pelo dono em 2026-09-24, depois do diagnóstico que comparou as
 * duas réguas em 14 perfis de carro. A anterior (três faixas fixas no código,
 * de 2026-08-06: 10% / 15–20% / "30% ou mais") ignorava o km fora da faixa de
 * avarias — um Gol 2011 com 250 mil km saía com o mesmo 10% de um Corolla 2023
 * — e dava 10% a carro novo, que a loja anuncia na FIPE.
 *
 * A curva mora em `parametros_avaliacao`, com vigência datada (spec 11 e
 * migração f0f): nenhum número da régua está aqui. O que está aqui é como
 * compor os parâmetros, e essa composição é a leitura que a spec faz:
 *
 *   base ........................ todo carro parte de `base_pp`
 *   km .......................... o desvio sobre `km_por_ano` × idade cai num
 *                                 dos `degraus_km`; km abaixo do esperado não
 *                                 é prêmio (0 p.p.)
 *   mecânica / funilaria ........ "requer atenção" e "amassados leves" são
 *                                 avaria leve (`avaria_leve_pp`); "ruim" e
 *                                 "avariado" são avaria séria
 *                                 (`avaria_seria_pp`). Cada uma soma. "Pequenos
 *                                 riscos de uso" é desgaste normal: 0.
 *   estado excepcional .......... mecânica excelente + funilaria impecável + km
 *                                 dentro do esperado: `estado_excepcional_pp`
 *                                 (negativo) entra só no LIMITE DE BAIXO da
 *                                 faixa. A spec exige justificativa e hodômetro
 *                                 verificado — o site não verifica nada, então
 *                                 a faixa diz "até X% se a vistoria confirmar".
 *   piso / teto ................. o deságio nunca fica abaixo de `piso_pct`; se
 *                                 o de baixo passa de `teto_pct`, não é compra:
 *                                 é recusar ou encaminhar como repasse.
 *   pendência de documento ...... o formulário não pergunta. Vira aviso para a
 *                                 vistoria com o intervalo de `pendencia_pp`.
 *
 * Os intervalos das avarias viram a faixa: o de baixo soma os mínimos, o de
 * cima soma os máximos. É por isso que a recomendação é sempre uma faixa, e
 * que cada componente vai junto (`componentes`): o número se explica.
 *
 * O "teto de compra" completo da spec (FIPE × (1 − deságio) − preparação −
 * margem alvo) não cabe aqui: preparação e margem só existem depois da
 * vistoria. O valor sugerido é o da curva, antes deles.
 */

export type EstadoMecanico = "excelente" | "bom" | "atencao" | "ruim";
export type EstadoConservacao = "impecavel" | "riscos" | "reparos" | "avariado";

/**
 * O resumo da faixa, para quem lê o card ou o n8n sem abrir a conta.
 *   excepcional .... o estado excepcional entrou (a confirmar na vistoria)
 *   com_avarias .... alguma avaria leve ou séria entrou
 *   padrao ......... só base e km
 *   acima_do_teto .. o deságio de baixo já passa do teto: não é compra
 */
export type FaixaAvaliacao = "excepcional" | "com_avarias" | "padrao" | "acima_do_teto";

/** A régua que produziu a recomendação — vai junto no retrato do lead. */
export const REGRA_DA_CURVA = "curva_spec11";

export interface ComponenteDoDesagio {
  /** "base", "km", "mecânica", "funilaria" ou "estado excepcional". */
  nome: string;
  pp_min: number;
  pp_max: number;
  motivo: string;
}

export interface RecomendacaoAvaliacao {
  regra: string;
  /** O `id` da linha de `parametros_avaliacao` usada, e desde quando ela vale. */
  parametros_id: string;
  parametros_desde: string;
  faixa: FaixaAvaliacao;
  /** Rótulo legível, para o consultor ler direto no card do lead. */
  faixa_label: string;
  /** Deságio sugerido sobre a FIPE, em pontos percentuais. */
  desconto_min: number;
  desconto_max: number;
  acima_do_teto: boolean;
  componentes: ComponenteDoDesagio[];
  /** O que o consultor precisa conferir, uma linha por aviso. */
  sinais: string[];
  km_esperado: number | null;
  km_desvio: number | null;
  /** Valor sugerido em reais, quando a FIPE numérica está disponível e a
   *  faixa é de compra (não passa do teto). */
  valor_sugerido_min: number | null;
  valor_sugerido_max: number | null;
  resumo: string;
}

export const ROTULO_MECANICA: Record<EstadoMecanico, string> = {
  excelente: "mecânica excelente",
  bom: "mecânica boa",
  atencao: "mecânica requer atenção",
  ruim: "mecânica ruim",
};

export const ROTULO_CONSERVACAO: Record<EstadoConservacao, string> = {
  impecavel: "funilaria impecável",
  riscos: "pequenos riscos de uso",
  reparos: "amassados leves",
  avariado: "avariado / batido",
};

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

const pct = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const km = (n: number) => `${Math.round(n).toLocaleString("pt-BR")} km`;

/**
 * Converte o texto que a API da FIPE devolve ("R$ 67.142,00") em número.
 * Devolve `null` quando não dá para ler — melhor omitir o valor sugerido do
 * que mandar um número errado para o consultor.
 */
export function fipeParaNumero(fipeValor: string | null | undefined): number | null {
  if (!fipeValor) return null;
  const digitos = String(fipeValor).replace(/[^\d]/g, "");
  if (!digitos) return null;
  const numero = Number(digitos) / 100;
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Os parâmetros, lidos da linha vigente de `parametros_avaliacao`
// ─────────────────────────────────────────────────────────────────────────────

export interface DegrauDeKm {
  /** Desvio máximo coberto por este degrau; `null` é "daí para cima". */
  ate: number | null;
  pp: number;
}

export interface ParametrosDaCurva {
  id: string;
  vigenciaDesde: string;
  basePp: number;
  excepcionalPp: number;
  pisoPct: number;
  tetoPct: number;
  kmPorAno: number;
  degrausKm: DegrauDeKm[];
  avariaLeve: [number, number];
  avariaSeria: [number, number];
  pendencia: [number, number];
}

function numero(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** `numrange` como o PostgREST devolve: "[2,4]" (ou com parêntese nas pontas). */
function intervalo(v: unknown): [number, number] | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^[[(]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*[\])]$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) && a <= b ? [a, b] : null;
}

function degraus(v: unknown): DegrauDeKm[] | null {
  const lista = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const lidos: DegrauDeKm[] = [];
  for (const d of lista) {
    if (!d || typeof d !== "object") return null;
    const { desvio_km_ate, pp } = d as { desvio_km_ate?: unknown; pp?: unknown };
    const valor = numero(pp);
    const ate = desvio_km_ate === null ? null : numero(desvio_km_ate);
    if (valor === null || (desvio_km_ate !== null && ate === null)) return null;
    lidos.push({ ate, pp: valor });
  }
  // Do menor desvio para o maior; o degrau aberto (`null`) por último.
  lidos.sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
  // Um degrau aberto no meio deixaria os de depois inalcançáveis.
  if (lidos.slice(0, -1).some((d) => d.ate === null)) return null;
  return lidos;
}

/**
 * A linha de `parametros_avaliacao` em forma de régua, ou `null` se qualquer
 * campo não fizer sentido. Régua ilegível não vira régua inventada: sem ela, a
 * avaliação segue SEM sugestão, e o consultor decide sozinho, como decidiria
 * sem o site.
 */
export function lerParametrosDaCurva(linha: unknown): ParametrosDaCurva | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  const basePp = numero(l.base_pp);
  const excepcionalPp = numero(l.estado_excepcional_pp);
  const pisoPct = numero(l.piso_pct);
  const tetoPct = numero(l.teto_pct);
  const kmPorAno = numero(l.km_por_ano);
  const degrausKm = degraus(l.degraus_km);
  const avariaLeve = intervalo(l.avaria_leve_pp);
  const avariaSeria = intervalo(l.avaria_seria_pp);
  const pendencia = intervalo(l.pendencia_pp);
  if (
    typeof l.id !== "string" ||
    basePp === null ||
    excepcionalPp === null ||
    pisoPct === null ||
    tetoPct === null ||
    pisoPct >= tetoPct ||
    kmPorAno === null ||
    kmPorAno <= 0 ||
    !degrausKm ||
    !avariaLeve ||
    !avariaSeria ||
    !pendencia
  ) {
    return null;
  }
  return {
    id: l.id,
    vigenciaDesde: typeof l.vigencia_desde === "string" ? l.vigencia_desde : "",
    basePp,
    excepcionalPp,
    pisoPct,
    tetoPct,
    kmPorAno,
    degrausKm,
    avariaLeve,
    avariaSeria,
    pendencia,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A conta
// ─────────────────────────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Idade do carro, em anos, para o km esperado.
 *
 * Contada de 1º de janeiro do ano-modelo, com fração: um 2020 em setembro de
 * 2026 tem 6,7 anos. O ano-modelo costuma adiantar o de fabricação, e o carro
 * de um ano-modelo é vendido ao longo do ano anterior e do próprio — 1º de
 * janeiro é o meio desse intervalo. Mínimo de um ano: carro recém-comprado não
 * pode ter o esperado perto de zero e ganhar degrau de km por rodar 3 mil km.
 */
export function idadeEmAnos(anoModelo: number, hoje: Date): number {
  const inicio = Date.UTC(anoModelo, 0, 1);
  return Math.max(1, (hoje.getTime() - inicio) / (365.25 * DIA_MS));
}

function degrauDoDesvio(desvio: number, lista: DegrauDeKm[]): number {
  if (desvio <= 0) return 0;
  const achado = lista.find((d) => d.ate === null || desvio <= d.ate);
  return achado ? achado.pp : lista[lista.length - 1].pp;
}

export function recomendarAvaliacao(entrada: {
  estadoMecanico: string;
  estadoConservacao: string;
  quilometragem: number | null;
  anoModelo: number | null;
  fipeValor?: string | null;
  parametros: ParametrosDaCurva | null;
  hoje?: Date;
}): RecomendacaoAvaliacao | null {
  const p = entrada.parametros;
  if (!p) return null;

  const hoje = entrada.hoje ?? new Date();
  const mecanica = entrada.estadoMecanico as EstadoMecanico;
  const conservacao = entrada.estadoConservacao as EstadoConservacao;
  const componentes: ComponenteDoDesagio[] = [];
  const sinais: string[] = [];

  componentes.push({ nome: "base", pp_min: p.basePp, pp_max: p.basePp, motivo: "todo carro parte daqui" });

  // Km contra o esperado para a idade.
  let kmEsperado: number | null = null;
  let kmDesvio: number | null = null;
  let kmPp = 0;
  const quilometragem =
    typeof entrada.quilometragem === "number" && entrada.quilometragem >= 0 ? entrada.quilometragem : null;
  const anoModelo =
    typeof entrada.anoModelo === "number" && Number.isInteger(entrada.anoModelo) && entrada.anoModelo > 1900
      ? entrada.anoModelo
      : null;
  if (quilometragem === null || anoModelo === null) {
    sinais.push(
      quilometragem === null
        ? "km não informado: o degrau de km fica para a vistoria"
        : "ano-modelo ilegível: o degrau de km fica para a vistoria",
    );
  } else {
    const idade = idadeEmAnos(anoModelo, hoje);
    kmEsperado = Math.round(p.kmPorAno * idade);
    kmDesvio = Math.round(quilometragem - kmEsperado);
    kmPp = degrauDoDesvio(kmDesvio, p.degrausKm);
    const idadeTexto = idade.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    componentes.push({
      nome: "km",
      pp_min: kmPp,
      pp_max: kmPp,
      motivo:
        kmDesvio > 0
          ? `${km(quilometragem)}: ${km(kmDesvio)} acima dos ${km(kmEsperado)} esperados para ${idadeTexto} anos`
          : `${km(quilometragem)}: dentro dos ${km(kmEsperado)} esperados para ${idadeTexto} anos`,
    });
  }

  // Avarias, cada uma somando o seu intervalo.
  const avarias: Array<[string, "leve" | "seria" | null, string]> = [
    [
      "mecânica",
      mecanica === "atencao" ? "leve" : mecanica === "ruim" ? "seria" : null,
      ROTULO_MECANICA[mecanica] ?? "",
    ],
    [
      "funilaria",
      conservacao === "reparos" ? "leve" : conservacao === "avariado" ? "seria" : null,
      ROTULO_CONSERVACAO[conservacao] ?? "",
    ],
  ];
  let temAvaria = false;
  for (const [nome, tipo, rotulo] of avarias) {
    if (!tipo) continue;
    temAvaria = true;
    const [a, b] = tipo === "leve" ? p.avariaLeve : p.avariaSeria;
    componentes.push({
      nome,
      pp_min: a,
      pp_max: b,
      motivo: `${rotulo} — avaria ${tipo === "leve" ? "leve" : "séria"}, o orçamento na vistoria define o ponto`,
    });
  }

  // Estado excepcional: só candidato, só no limite de baixo.
  const candidatoExcepcional =
    mecanica === "excelente" && conservacao === "impecavel" && kmPp === 0 && kmDesvio !== null;
  if (candidatoExcepcional) {
    componentes.push({
      nome: "estado excepcional",
      pp_min: p.excepcionalPp,
      pp_max: 0,
      motivo: "candidato: vale só com justificativa e hodômetro verificados na vistoria",
    });
  }

  let descontoMin = componentes.reduce((s, c) => s + c.pp_min, 0);
  let descontoMax = componentes.reduce((s, c) => s + c.pp_max, 0);
  if (descontoMin < p.pisoPct) descontoMin = p.pisoPct;
  if (descontoMax < descontoMin) descontoMax = descontoMin;

  const acimaDoTeto = descontoMin > p.tetoPct;
  if (!acimaDoTeto && descontoMax > p.tetoPct) {
    sinais.push(
      `o limite de cima passaria do teto de ${pct(p.tetoPct)}% — se a vistoria chegar lá, não é compra: é recusar ou repasse`,
    );
    descontoMax = p.tetoPct;
  }

  sinais.push(
    `documento e procedência não são perguntados no site: pendência soma de ${pct(p.pendencia[0])} a ${pct(p.pendencia[1])} p.p.`,
  );

  const faixa: FaixaAvaliacao = acimaDoTeto
    ? "acima_do_teto"
    : candidatoExcepcional
      ? "excepcional"
      : temAvaria
        ? "com_avarias"
        : "padrao";

  const intervaloTexto =
    descontoMin === descontoMax ? `${pct(descontoMin)}%` : `de ${pct(descontoMin)}% a ${pct(descontoMax)}%`;
  const faixaLabel = acimaDoTeto
    ? `Acima do teto de ${pct(p.tetoPct)}% (${intervaloTexto}): recusar ou encaminhar como repasse`
    : candidatoExcepcional
      ? `Deságio ${intervaloTexto} sobre a FIPE — ${pct(descontoMin)}% só se a vistoria confirmar o estado excepcional`
      : `Deságio ${intervaloTexto} sobre a FIPE`;

  const fipe = fipeParaNumero(entrada.fipeValor);
  // O maior deságio produz o MENOR valor: min de valor ↔ max de deságio.
  const valorSugeridoMin = fipe !== null && !acimaDoTeto ? Math.round(fipe * (1 - descontoMax / 100)) : null;
  const valorSugeridoMax = fipe !== null && !acimaDoTeto ? Math.round(fipe * (1 - descontoMin / 100)) : null;

  let resumo = faixaLabel;
  if (valorSugeridoMin !== null && valorSugeridoMax !== null) {
    resumo +=
      valorSugeridoMin === valorSugeridoMax
        ? ` — ${formatarReais(valorSugeridoMax)}`
        : ` — de ${formatarReais(valorSugeridoMin)} a ${formatarReais(valorSugeridoMax)}`;
  }

  return {
    regra: REGRA_DA_CURVA,
    parametros_id: p.id,
    parametros_desde: p.vigenciaDesde,
    faixa,
    faixa_label: faixaLabel,
    desconto_min: descontoMin,
    desconto_max: descontoMax,
    acima_do_teto: acimaDoTeto,
    componentes,
    sinais,
    km_esperado: kmEsperado,
    km_desvio: kmDesvio,
    valor_sugerido_min: valorSugeridoMin,
    valor_sugerido_max: valorSugeridoMax,
    resumo,
  };
}
