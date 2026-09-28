/**
 * O horário da loja, estruturado — a fonte única do exame no pátio e do
 * `openingHoursSpecification` do `AutoDealer` (decisão 12 do PR 3).
 *
 * Até 25/09 o horário existia em código duas vezes: uma frase para leitura em
 * `paginasGeo.ts` (`HORARIO`) e um literal no `schemaDaLoja`. O exame no
 * pátio precisa CALCULAR com ele (quais são os próximos dias de loja aberta),
 * e calcular em cima de uma frase seria a terceira cópia. Esta constante é a
 * fonte; `schemaDaLoja` passou a lê-la (o JSON-LD saiu idêntico, e
 * `tests/horario-e-exame.test.ts` o prende), e a frase de `paginasGeo.ts` é
 * conferida contra ela pelo mesmo teste.
 *
 * Curitiba é UTC−3 fixo: o Brasil não tem horário de verão desde 2019. O dia
 * "de hoje" é o de Curitiba, não o do servidor — a Vercel roda em UTC, e às
 * 22h de quarta em Curitiba já é quinta lá.
 */

/** 0 = domingo, como `Date.getUTCDay()`. */
export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ExpedienteDaLoja {
  dias: readonly DiaDaSemana[];
  /** "HH:MM", como o schema.org pede. */
  abre: string;
  fecha: string;
}

/** Segunda a sexta das 8h30 às 18h30; sábado das 8h30 às 15h. */
export const HORARIO_DA_LOJA: readonly ExpedienteDaLoja[] = [
  { dias: [1, 2, 3, 4, 5], abre: "08:30", fecha: "18:30" },
  { dias: [6], abre: "08:30", fecha: "15:00" },
];

const DIAS_EM_INGLES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** O `openingHoursSpecification` do `AutoDealer`. */
export function especificacaoDoHorario() {
  return HORARIO_DA_LOJA.map((expediente) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: expediente.dias.map((dia) => DIAS_EM_INGLES[dia]),
    opens: expediente.abre,
    closes: expediente.fecha,
  }));
}

/** "08:30" → "8h30"; "15:00" → "15h" — como `paginasGeo.ts` escreve para o leitor. */
export function horaParaLer(hhmm: string): string {
  const [hora, minuto] = hhmm.split(":");
  return `${Number(hora)}h${minuto === "00" ? "" : minuto}`;
}

const DESLOCAMENTO_DE_CURITIBA_MS = -3 * 60 * 60 * 1000;
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A data de Curitiba naquele instante, "AAAA-MM-DD". */
export function dataEmCuritiba(instante: Date): string {
  return new Date(instante.getTime() + DESLOCAMENTO_DE_CURITIBA_MS).toISOString().slice(0, 10);
}

/** "AAAA-MM-DD" que existe no calendário ("2026-02-31" não existe). */
export function ehData(data: string): boolean {
  const partes = DATA.exec(data);
  if (!partes) return false;
  const dia = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
  return dia.toISOString().slice(0, 10) === data;
}

/** Meio-dia UTC: nenhuma soma de dias cruza a virada por fuso. */
export function somarDias(data: string, dias: number): string {
  const dia = new Date(`${data}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}

export function diaDaSemana(data: string): DiaDaSemana {
  return new Date(`${data}T12:00:00Z`).getUTCDay() as DiaDaSemana;
}

export function lojaAbreNoDia(data: string): boolean {
  const dia = diaDaSemana(data);
  return HORARIO_DA_LOJA.some((expediente) => expediente.dias.includes(dia));
}

/** "AAAA-MM-DD" → "25/09". */
export function ddmm(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/**
 * "25/09" de uma coluna do banco: `date` ("2026-09-22") passa direto;
 * `timestamptz` vira a data de Curitiba. Valor ilegível devolve null.
 */
export function ddmmEmCuritiba(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (DATA.test(valor)) return ehData(valor) ? ddmm(valor) : null;
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? null : ddmm(dataEmCuritiba(instante));
}

/** O instante cai no mesmo dia de Curitiba que `agora`? */
export function ehHojeEmCuritiba(valor: string | null | undefined, agora: Date): boolean {
  if (!valor) return false;
  const instante = new Date(valor);
  return !Number.isNaN(instante.getTime()) && dataEmCuritiba(instante) === dataEmCuritiba(agora);
}
