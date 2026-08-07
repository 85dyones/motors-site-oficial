/**
 * Grade por horário e regras fixas da música do showroom — tela A18 do design
 * doc do admin.
 *
 * O que a A18 acrescenta ao que a 08 já tinha:
 *
 *  · a playlist e o volume trocam **por hora do dia**, não por veículo na tela.
 *    O doc explica por quê, e a razão é boa: "amarrar música a carro dá
 *    sensação de comercial e o cliente percebe";
 *  · **teto de volume 70%** — o painel do balcão não passa disso;
 *  · o abaixamento do CHAMAR CONSULTOR **volta sozinho em 90 s**.
 *
 * Os três números vêm do doc. Não estime nenhum deles.
 *
 * Este módulo é puro: recebe a grade e um instante, devolve a faixa que vale.
 * Sem `Date.now()` por dentro — quem chama passa a data, e é isso que deixa a
 * regra testável.
 */

/** Regra 2 da A18: "Teto de volume 70%". */
export const TETO_VOLUME = 70;

/** Regra 2 da A18: o abaixamento "volta sozinho" nesse prazo. */
export const DURACAO_ATENDIMENTO_MS = 90_000;

/**
 * Dias que uma faixa cobre.
 *
 * A grade desenhada usa três conjuntos: "Seg a sex", "Sábado" e "Qualquer dia"
 * (a linha "Sob demanda"). Domingo não aparece — a loja não abre.
 */
export type DiasDaFaixa = "semana" | "sabado" | "todos";

export type FaixaHoraria = {
  id: string;
  /** Minutos desde a meia-noite. `09:00` → 540. */
  inicioMin: number;
  fimMin: number;
  dias: DiasDaFaixa;
  /** URI da playlist no Spotify. Vazio = faixa desligada. */
  playlistUri: string;
  playlistNome: string;
  volume: number;
  /**
   * Faixa "Sob demanda" da grade: não entra no rodízio automático, só existe
   * para o consultor acionar pelo painel. Sem isto ela concorreria com a
   * faixa do horário e trocaria a música sozinha no meio do expediente.
   */
  sobDemanda: boolean;
};

export type GradeMusica = {
  /** Desligado, a TV não toca nada e o painel do balcão segue funcionando à mão. */
  ativa: boolean;
  faixas: FaixaHoraria[];
};

export const GRADE_VAZIA: GradeMusica = { ativa: false, faixas: [] };

/** `"09:00"` → `540`. Devolve `null` no que não for `HH:MM` válido. */
export function minutosDeHora(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** `540` → `"09:00"`. */
export function horaDeMinutos(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function diaCasa(dias: DiasDaFaixa, diaDaSemana: number): boolean {
  if (dias === "todos") return true;
  if (dias === "sabado") return diaDaSemana === 6;
  return diaDaSemana >= 1 && diaDaSemana <= 5;
}

/**
 * A faixa que vale neste instante, ou `null` fora do expediente.
 *
 * Faixas `sobDemanda` nunca entram aqui — ver o comentário no tipo.
 *
 * Quando duas faixas se sobrepõem, ganha a **mais específica**: "Sábado" vence
 * "Qualquer dia". Sem esse desempate, a ordem no array decidiria a música da
 * loja, e reordenar linhas na tabela do painel mudaria o som sem que ninguém
 * tivesse mexido em horário nenhum.
 */
export function faixaVigente(grade: GradeMusica, agora: Date): FaixaHoraria | null {
  if (!grade.ativa) return null;

  const minutos = agora.getHours() * 60 + agora.getMinutes();
  const dia = agora.getDay();

  const candidatas = grade.faixas.filter(
    (f) =>
      !f.sobDemanda &&
      f.playlistUri &&
      diaCasa(f.dias, dia) &&
      minutos >= f.inicioMin &&
      minutos < f.fimMin,
  );

  if (candidatas.length === 0) return null;

  const peso = (d: DiasDaFaixa) => (d === "sabado" ? 0 : d === "semana" ? 1 : 2);
  return candidatas.reduce((melhor, f) => (peso(f.dias) < peso(melhor.dias) ? f : melhor));
}

/** Nenhum caminho pode mandar volume acima do teto — nem a grade, nem o painel. */
export function limitarVolume(valor: number): number {
  return Math.max(0, Math.min(TETO_VOLUME, Math.round(valor)));
}

/**
 * Saneia o que veio do banco.
 *
 * A grade é JSON num `site_settings`, então pode chegar com qualquer forma —
 * inclusive de uma versão anterior do painel. Linha sem horário utilizável é
 * descartada em vez de virar uma faixa que casa com o dia inteiro.
 */
export function normalizarGrade(bruto: unknown): GradeMusica {
  if (!bruto || typeof bruto !== "object") return GRADE_VAZIA;
  const g = bruto as { ativa?: unknown; faixas?: unknown };
  if (!Array.isArray(g.faixas)) return GRADE_VAZIA;

  const faixas = g.faixas
    .map((f, i): FaixaHoraria | null => {
      if (!f || typeof f !== "object") return null;
      const r = f as Record<string, unknown>;
      const inicio = typeof r.inicioMin === "number" ? r.inicioMin : null;
      const fim = typeof r.fimMin === "number" ? r.fimMin : null;
      const sobDemanda = r.sobDemanda === true;

      // Fora do "sob demanda", uma faixa sem intervalo válido não tem como
      // valer nunca — e um fim antes do início casaria com nada.
      if (!sobDemanda && (inicio === null || fim === null || fim <= inicio)) return null;

      const dias: DiasDaFaixa =
        r.dias === "sabado" || r.dias === "todos" || r.dias === "semana"
          ? r.dias
          : "semana";

      return {
        id: typeof r.id === "string" && r.id ? r.id : `faixa-${i}`,
        inicioMin: inicio ?? 0,
        fimMin: fim ?? 0,
        dias,
        playlistUri: typeof r.playlistUri === "string" ? r.playlistUri : "",
        playlistNome: typeof r.playlistNome === "string" ? r.playlistNome : "",
        volume: limitarVolume(typeof r.volume === "number" ? r.volume : 0),
        sobDemanda,
      };
    })
    .filter((f): f is FaixaHoraria => f !== null);

  return { ativa: g.ativa === true, faixas };
}
