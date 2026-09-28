import { liberadoEmPreparacao } from "./coerenciaDoCadastro";

/**
 * O tempo do carro "em preparação": quanto falta para ele chegar ao pátio.
 *
 * Pedido do dono em 28/09/2026 — "com um countdown na área externa criando
 * expectativa". O card e a TV mostram DIAS; a ficha mostra o relógio. Desenho:
 * docs/superpowers/specs/2026-09-28-em-preparacao-design.md
 *
 * ---------------------------------------------------------------------------
 * O "agora" entra por parâmetro, com valor padrão
 * ---------------------------------------------------------------------------
 * A regra `react-hooks/purity` recusa `new Date()` no corpo de componente. O
 * relógio É uma função do tempo; a impureza mora aqui, num lugar só e à vista,
 * e os testes passam o instante que quiserem.
 */

const FUSO = "America/Sao_Paulo";

/**
 * Um instante: `Date`, ou milissegundos como devolve `Date.now()`. O número
 * existe para o relógio da ficha, que guarda o tempo em estado e não pode
 * construir `Date` no corpo do componente (`react-hooks/purity`).
 */
export type Instante = Date | number;

const emMs = (instante: Instante) => (typeof instante === "number" ? instante : instante.getTime());

/** "2026-10-03": o dia do calendário de São Paulo em que o instante cai. */
function diaEmSaoPaulo(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Dias de CALENDÁRIO entre dois instantes, contados em São Paulo.
 *
 * Não é horas ÷ 24: faltando 16 horas numa segunda às 10h, a previsão é
 * terça às 2h — "amanhã" no calendário, e a divisão diria "hoje".
 */
function diasDeCalendario(de: Date, ate: Date): number {
  const inicio = Date.parse(`${diaEmSaoPaulo(de)}T00:00:00Z`);
  const fim = Date.parse(`${diaEmSaoPaulo(ate)}T00:00:00Z`);
  return Math.round((fim - inicio) / 86_400_000);
}

export type ChegadaAoPatio =
  | { fase: "a-caminho"; dias: number; data: Date }
  | { fase: "a-qualquer-momento"; diasDeAtraso: number; data: Date };

/**
 * Em que pé está a chegada, ou `null` quando o carro não está em preparação.
 *
 * Passada a data, o carro continua no ar e a frase deixa de prometer dia —
 * decisão do dono em 28/09 ("continua no ar").
 */
export function chegadaAoPatio(
  veiculo: { em_preparacao?: unknown; previsao_chegada_em?: unknown },
  agora: Instante = Date.now(),
): ChegadaAoPatio | null {
  if (!liberadoEmPreparacao(veiculo)) return null;
  const data = new Date(veiculo.previsao_chegada_em as string);
  const instante = new Date(emMs(agora));
  if (instante.getTime() < data.getTime()) {
    return { fase: "a-caminho", dias: diasDeCalendario(instante, data), data };
  }
  return { fase: "a-qualquer-momento", diasDeAtraso: diasDeCalendario(data, instante), data };
}

/** A faixa do card, da TV e do balcão. */
export function faixaDaChegada(chegada: ChegadaAoPatio): string {
  if (chegada.fase === "a-qualquer-momento") return "EM PREPARAÇÃO · CHEGA A QUALQUER MOMENTO";
  if (chegada.dias <= 0) return "EM PREPARAÇÃO · CHEGA HOJE";
  if (chegada.dias === 1) return "EM PREPARAÇÃO · CHEGA AMANHÃ";
  return `EM PREPARAÇÃO · CHEGA EM ${chegada.dias} DIAS`;
}

/** Há quantos dias a previsão passou; `null` quando não passou ou não há previsão. */
export function diasDePrevisaoVencida(
  veiculo: { em_preparacao?: unknown; previsao_chegada_em?: unknown },
  agora: Instante = Date.now(),
): number | null {
  const chegada = chegadaAoPatio(veiculo, agora);
  return chegada?.fase === "a-qualquer-momento" ? chegada.diasDeAtraso : null;
}

export interface Relogio {
  dias: number;
  horas: number;
  minutos: number;
  segundos: number;
}

/** O que falta até a data, em partes; `null` quando a data já passou. */
export function relogioAte(data: Date, agora: Instante): Relogio | null {
  const total = Math.floor((data.getTime() - emMs(agora)) / 1000);
  if (total <= 0) return null;
  return {
    dias: Math.floor(total / 86_400),
    horas: Math.floor((total % 86_400) / 3_600),
    minutos: Math.floor((total % 3_600) / 60),
    segundos: total % 60,
  };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** "05d 04h 00m 00s" — largura fixa, para o relógio não tremer a cada segundo. */
export function formatarRelogio(r: Relogio): string {
  return `${doisDigitos(r.dias)}d ${doisDigitos(r.horas)}h ${doisDigitos(r.minutos)}m ${doisDigitos(r.segundos)}s`;
}

function partesEmSaoPaulo(instante: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    ano: parte("year"),
    mes: parte("month"),
    dia: parte("day"),
    hora: parte("hour"),
    minuto: parte("minute"),
  };
}

/** "03/10 às 14h", ou "03/10 às 14h30" — a data que a ficha escreve. */
export function dataDaPrevisao(iso: string): string {
  const p = partesEmSaoPaulo(new Date(iso));
  return `${p.dia}/${p.mes} às ${p.hora}h${p.minuto === "00" ? "" : p.minuto}`;
}

/**
 * O valor do `<input type="datetime-local">` a partir do que o banco guarda.
 *
 * O campo não tem fuso: mostra o horário de São Paulo, que é o da loja, e não
 * o do computador de quem abriu o painel.
 */
export function paraCampoDataHora(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const p = partesEmSaoPaulo(new Date(iso));
  return `${p.ano}-${p.mes}-${p.dia}T${p.hora}:${p.minuto}`;
}

/**
 * O instante que o banco guarda, a partir do campo do painel.
 *
 * `-03:00` fixo: o Brasil não tem horário de verão desde 2019 (Decreto
 * 9.772). Se ele voltar, esta é a linha a mudar.
 */
export function doCampoDataHora(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const instante = new Date(`${valor}:00-03:00`);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}
