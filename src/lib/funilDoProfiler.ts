/**
 * O funil do Garagem Profiler (`/carro-perfeito`), contado por dia — sem
 * identificador nenhum.
 *
 * A leitura de 10 dias (06/10/2026) achou zero lead do canal desde 25/09, e
 * nenhuma forma de saber se pouca gente abre o quiz ou se as pessoas desistem
 * numa pergunta: o GA4 recebe `profiler_step`, mas perde quem recusou o
 * rastreamento e só separa os passos com dimensão personalizada, que não vale
 * para trás. A spec previa um "contador diário do funil, sem identificador"
 * (fase 2), e o dono disse "Sim".
 *
 * O que vai ao banco é só (dia, passo) → contagem, na tabela
 * `profiler_funil_diario` (migração 20261006120000). Nada de ag_uid, IP,
 * sessão ou horário: um número por passo por dia. Por isso conta todo mundo,
 * inclusive quem recusou o rastreamento — não há o que rastrear.
 *
 * Cada passo conta UMA vez por rodada do quiz: quem volta da 03 para a 02 não
 * vira duas pessoas na 02. A rodada recomeça no REFAZER.
 */

/** Os passos, na lista fechada do CHECK da tabela. */
export const PASSOS_DO_FUNIL = [
  /** Abriu a página. */
  "intro",
  /** Começou o quiz. */
  "q1",
  "q2",
  "q3",
  "q4",
  "q5",
  /** Viu os três carros. */
  "results",
  /** Respondeu a 01 pela aba POR MÊS. */
  "por_mes",
  /** Lead enviado e aceito pela rota, por modo. */
  "lead_carros",
  "lead_aviso",
  "lead_ajuda",
] as const;

export type PassoDoFunil = (typeof PASSOS_DO_FUNIL)[number];

/** O passo, se for da lista; senão `null`. O corpo vem do navegador. */
export function passoDoFunil(bruto: unknown): PassoDoFunil | null {
  return typeof bruto === "string" && (PASSOS_DO_FUNIL as readonly string[]).includes(bruto)
    ? (bruto as PassoDoFunil)
    : null;
}

/** Para onde o navegador manda o passo. */
export const ROTA_DO_FUNIL = "/api/profiler/passo";

/**
 * Manda o passo ao servidor sem segurar a tela: `sendBeacon` sobrevive à troca
 * de página (o lead abre o WhatsApp logo depois), e o `fetch` com `keepalive`
 * cobre o navegador sem beacon. Falha é silêncio — contagem perdida não pode
 * virar erro para quem está escolhendo carro.
 */
export function enviarPassoDoFunil(passo: PassoDoFunil): void {
  if (typeof window === "undefined") return;
  const corpo = JSON.stringify({ passo });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(ROTA_DO_FUNIL, new Blob([corpo], { type: "application/json" }))) return;
    }
    void fetch(ROTA_DO_FUNIL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Contagem perdida, nada mais.
  }
}

/**
 * O contador de uma rodada do quiz: cada passo sai uma vez só, até
 * `recomecar()`. `enviar` é injetado para o teste ver o que sairia.
 */
export function criarContadorDaRodada(enviar: (passo: PassoDoFunil) => void = enviarPassoDoFunil) {
  const contados = new Set<PassoDoFunil>();
  return {
    contar(bruto: string): void {
      const passo = passoDoFunil(bruto);
      if (!passo || contados.has(passo)) return;
      contados.add(passo);
      enviar(passo);
    },
    /**
     * REFAZER começa uma rodada nova — exceto a abertura da página: quem
     * refaz não abriu a página de novo, então `intro` segue contado.
     */
    recomecar(): void {
      const abriu = contados.has("intro");
      contados.clear();
      if (abriu) contados.add("intro");
    },
  };
}
