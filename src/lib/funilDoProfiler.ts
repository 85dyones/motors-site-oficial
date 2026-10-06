import { rastreamentoRecusado } from "./telemetry";

/**
 * O funil do Garagem Profiler (`/carro-perfeito`), contado por dia — sem
 * identificador nenhum.
 *
 * A leitura de 10 dias (06/10/2026) achou zero lead do canal desde 25/09, e
 * nenhuma forma de saber se pouca gente abre o quiz ou se as pessoas desistem
 * numa pergunta: o GA4 recebe `profiler_step`, mas só separa os passos com
 * dimensão personalizada, que não vale para trás, e os logs da Vercel não
 * respondem em janela longa. A spec previa um "contador diário do funil, sem
 * identificador" (fase 2), e o dono disse "Sim": um número por passo por dia,
 * no nosso banco, legível a qualquer hora.
 *
 * O que vai ao banco é só (dia, passo) → contagem, na tabela
 * `profiler_funil_diario` (migração 20261006120000). Nada de ag_uid, IP,
 * sessão ou horário: um número por passo por dia.
 *
 * Quem recusou o rastreamento em /privacidade não envia passo. Contar também
 * essa pessoa é a pergunta 8 da spec ("o contador anônimo roda mesmo com
 * recusa de rastreamento?"), ainda em aberto com o dono: até ele responder,
 * vale a leitura mais estreita da recusa.
 *
 * Cada passo conta UMA vez por rodada do quiz: quem volta da 03 para a 02 não
 * vira duas pessoas na 02. A rodada recomeça no REFAZER.
 *
 * Ao ler: passo PULADO não conta. A 03 some para quem leva carga, e a 04 some
 * quando o câmbio não separa os carros que sobraram (depende do estoque do
 * dia). Então `q4` menor que `q3` pode ser pulo, e não desistência — a
 * desistência se lê contra o passo seguinte que todos veem (`q5`, `results`).
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
  // Pergunta 8 da spec em aberto: por ora, recusa é recusa.
  if (rastreamentoRecusado()) return;
  const corpo = JSON.stringify({ passo });
  // O beacon pode recusar (`false`) ou lançar — nos dois casos, o `fetch`.
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(ROTA_DO_FUNIL, new Blob([corpo], { type: "application/json" }))) return;
    }
  } catch {
    // segue para o fetch
  }
  try {
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
