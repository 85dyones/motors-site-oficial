/**
 * O gatilho de ativação da recompra — manual v1.1 §1.4, emendado.
 *
 *   conformidade_revisao >= 70%   por 3 meses consecutivos
 *   E veiculos_monitorados >= 150
 *   E serie_caderneta >= 6 meses
 *
 * Este módulo calcula o estado de cada condição a partir da série de
 * `conformidade_diaria`. Os limiares vêm do manual — nenhum é inventado aqui,
 * e nenhum é configurável: o §1.4 existe exatamente para que ninguém possa
 * afrouxar a régua num momento de entusiasmo.
 *
 * Enquanto o gatilho não abre, a recompra segue desligada (regra 5). Este
 * painel é o que a diretoria acompanha — "ninguém precisa argumentar".
 */

export const LIMIAR_DE_CONFORMIDADE = 70; // %
export const MESES_CONSECUTIVOS_EXIGIDOS = 3;
export const MINIMO_DE_MONITORADOS = 150;
export const MESES_DE_SERIE_EXIGIDOS = 6;

export interface DiaDaSerie {
  dia: string; // ISO date
  veiculos_ciclo_ativo: number;
  veiculos_com_revisao_devida: number;
  veiculos_em_dia: number;
  pct: number | null; // NULL = ninguém com revisão devida naquele dia
  retroativa: boolean;
}

/** "2026-08" de um ISO date. */
const mesDe = (iso: string) => iso.slice(0, 7);

const mesAnterior = (mes: string): string => {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};

/**
 * Meses-calendário consecutivos, já encerrados, em que a conformidade se
 * manteve >= 70% — contados de trás para a frente a partir do último mês
 * completo.
 *
 * Um mês qualifica quando tem ao menos um dia MEDIDO (pct não-nulo) e nenhum
 * dia medido abaixo do limiar. Mês inteiro sem medição — ninguém com revisão
 * devida — NÃO qualifica e zera a contagem: o gatilho abre com dado, não com
 * vácuo. É a leitura conservadora; se o dono quiser a outra, é emenda.
 */
export function mesesConsecutivosConformes(serie: DiaDaSerie[], hoje: string): number {
  if (serie.length === 0) return 0;

  const porMes = new Map<string, { medidos: number; minimo: number }>();
  for (const d of serie) {
    const mes = mesDe(d.dia);
    if (!porMes.has(mes)) porMes.set(mes, { medidos: 0, minimo: Infinity });
    if (d.pct !== null) {
      const m = porMes.get(mes)!;
      m.medidos += 1;
      m.minimo = Math.min(m.minimo, d.pct);
    }
  }

  // O mês corrente ainda não fechou: começa do anterior.
  let mes = mesAnterior(mesDe(hoje));
  let consecutivos = 0;
  while (porMes.has(mes)) {
    const m = porMes.get(mes)!;
    if (m.medidos === 0 || m.minimo < LIMIAR_DE_CONFORMIDADE) break;
    consecutivos += 1;
    mes = mesAnterior(mes);
  }
  return consecutivos;
}

export interface EstadoDaSerie {
  /** Meses completos de registro diário ininterrupto, até o último dia gravado. */
  meses: number;
  inicio: string | null;
  atualizada_ate: string | null;
  /** true quando o último dia gravado não é hoje — a série precisa ser recalculada. */
  desatualizada: boolean;
  /** Fração de dias reconstruídos depois do fato (0..1). */
  fracao_retroativa: number;
}

/**
 * `serie_caderneta` do §1.4 emendado: meses consecutivos com registro diário
 * ininterrupto. A função de cálculo preenche buracos retroativamente, então a
 * série é contínua por construção — mas dias reconstruídos saem marcados, e o
 * painel mostra a fração, porque medição e reconstrução não valem o mesmo aos
 * olhos de quem audita.
 */
export function estadoDaSerie(serie: DiaDaSerie[], hoje: string): EstadoDaSerie {
  if (serie.length === 0) {
    return { meses: 0, inicio: null, atualizada_ate: null, desatualizada: true, fracao_retroativa: 0 };
  }
  const dias = [...serie].sort((a, b) => (a.dia < b.dia ? -1 : 1));
  const inicio = dias[0].dia;
  const fim = dias[dias.length - 1].dia;

  // Continuidade: o intervalo em dias tem que bater com a contagem de linhas.
  const espera =
    Math.round(
      (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000,
    ) + 1;
  const continua = espera === dias.length;

  // Meses completos entre início e fim (14/02 → 14/08 = 6).
  const [ia, im, id] = inicio.split("-").map(Number);
  const [fa, fm, fd] = fim.split("-").map(Number);
  let meses = (fa - ia) * 12 + (fm - im) - (fd < id ? 1 : 0);
  if (meses < 0) meses = 0;

  const retro = dias.filter((d) => d.retroativa).length;

  return {
    meses: continua ? meses : 0,
    inicio,
    atualizada_ate: fim,
    desatualizada: fim < hoje,
    fracao_retroativa: retro / dias.length,
  };
}

export interface CondicaoDoGatilho {
  rotulo: string;
  atual: number;
  alvo: number;
  unidade: string;
  atingida: boolean;
}

export interface EstadoDoGatilho {
  aberto: boolean;
  condicoes: CondicaoDoGatilho[];
}

/** As três condições do §1.4, lado a lado, com o veredito inequívoco. */
export function estadoDoGatilho(
  serie: DiaDaSerie[],
  monitorados: number,
  hoje: string,
): EstadoDoGatilho {
  const consecutivos = mesesConsecutivosConformes(serie, hoje);
  const s = estadoDaSerie(serie, hoje);

  const condicoes: CondicaoDoGatilho[] = [
    {
      rotulo: `Conformidade ≥ ${LIMIAR_DE_CONFORMIDADE}% por meses consecutivos`,
      atual: consecutivos,
      alvo: MESES_CONSECUTIVOS_EXIGIDOS,
      unidade: "meses",
      atingida: consecutivos >= MESES_CONSECUTIVOS_EXIGIDOS,
    },
    {
      rotulo: "Veículos monitorados (Ciclo ativo com caderneta viva)",
      atual: monitorados,
      alvo: MINIMO_DE_MONITORADOS,
      unidade: "veículos",
      atingida: monitorados >= MINIMO_DE_MONITORADOS,
    },
    {
      rotulo: "Série da caderneta, contínua",
      atual: s.meses,
      alvo: MESES_DE_SERIE_EXIGIDOS,
      unidade: "meses",
      atingida: s.meses >= MESES_DE_SERIE_EXIGIDOS,
    },
  ];

  return { aberto: condicoes.every((c) => c.atingida), condicoes };
}
