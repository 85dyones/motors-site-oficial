import type { EstadoDaChecagem } from "../../../lib/consultaDePlaca";
import type { Gravidade, SituacaoDaAcao } from "../../../lib/copilotoDeMidia";

export const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * O Google cobra no mês até a verba diária × 30,4 (a média de dias do mês). É
 * a régua dele, e é ela que diz quanto um real a mais por dia pesa no mês.
 */
export const DIAS_DO_MES_NO_GOOGLE = 30.4;

/** "2026-10-06" → "06/10", sem passar por `Date` (que mudaria o dia pelo fuso). */
export const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

/** `agora` vem da leitura do servidor: o mesmo texto no servidor e no navegador. */
export function haQuanto(iso: string, agora: number): string {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** A forma de cada gravidade: o rótulo escrito vem sempre ao lado. */
export const SINAL_DA_GRAVIDADE: Record<Gravidade, EstadoDaChecagem> = {
  alta: "impeditivo",
  media: "atencao",
  baixa: "nao_conferido",
};

export const SINAL_DA_SITUACAO: Record<SituacaoDaAcao, EstadoDaChecagem> = {
  proposta: "nao_conferido",
  aprovada: "atencao",
  em_aplicacao: "atencao",
  aplicada: "ok",
  sem_efeito: "ok",
  falhou: "impeditivo",
  recusada: "nao_conferido",
  descartada: "nao_conferido",
};
