/**
 * O exame no pátio: quais dias e turnos a ficha oferece (spec §7.2, decisão
 * 12 do PR 3).
 *
 * Os próximos três dias de loja aberta DEPOIS de hoje, em Curitiba; turnos
 * manhã e tarde — o sábado fecha às 15h e ainda tem as duas metades. O
 * horário vem de `HORARIO_DA_LOJA`, sem segunda fonte.
 *
 * A rota de leads aceita um pouco mais do que a ficha oferece AGORA
 * (`diaAceitoParaOExame`): a ficha fica 60 s em cache e uma aba pode ficar
 * aberta de véspera, mostrando o dia que já virou hoje. Aceitar de hoje até o
 * fim da janela não deixa ninguém marcar domingo, ontem ou mês que vem; a
 * equipe confirma o horário pelo WhatsApp de qualquer jeito.
 */
import { dataEmCuritiba, ddmm, diaDaSemana, ehData, lojaAbreNoDia, somarDias } from "./horarioDaLoja";

export const TURNOS_DO_EXAME = ["manha", "tarde"] as const;
export type TurnoDoExame = (typeof TURNOS_DO_EXAME)[number];

export const NOME_DO_TURNO: Record<TurnoDoExame, string> = { manha: "Manhã", tarde: "Tarde" };

export const QUANTOS_DIAS_DE_EXAME = 3;

const SIGLAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export interface DiaDoExame {
  /** "AAAA-MM-DD" — o valor que o formulário manda. */
  data: string;
  /** "Sex 25" — o botão. */
  rotulo: string;
  /** "Sex 25/09" — a mensagem do lead. */
  rotuloCompleto: string;
}

export function rotuloDoDia(data: string): string {
  return `${SIGLAS[diaDaSemana(data)]} ${data.slice(8, 10)}`;
}

export function rotuloCompletoDoDia(data: string): string {
  return `${SIGLAS[diaDaSemana(data)]} ${ddmm(data)}`;
}

export function diasDoExame(agora: Date, quantos: number = QUANTOS_DIAS_DE_EXAME): DiaDoExame[] {
  const hoje = dataEmCuritiba(agora);
  const dias: DiaDoExame[] = [];
  // Catorze é só teto de segurança: com a loja aberta seis dias por semana,
  // três dias de exame cabem em quatro de calendário.
  for (let adiante = 1; dias.length < quantos && adiante <= 14; adiante++) {
    const data = somarDias(hoje, adiante);
    if (lojaAbreNoDia(data)) dias.push({ data, rotulo: rotuloDoDia(data), rotuloCompleto: rotuloCompletoDoDia(data) });
  }
  return dias;
}

export function diaAceitoParaOExame(data: unknown, agora: Date): data is string {
  if (typeof data !== "string" || !ehData(data) || !lojaAbreNoDia(data)) return false;
  const janela = diasDoExame(agora);
  const ultimo = janela.length > 0 ? janela[janela.length - 1].data : null;
  return ultimo !== null && data >= dataEmCuritiba(agora) && data <= ultimo;
}

export function turnoDoExame(valor: unknown): TurnoDoExame | null {
  return TURNOS_DO_EXAME.find((turno) => turno === valor) ?? null;
}
