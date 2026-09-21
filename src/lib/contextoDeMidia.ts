/**
 * O contexto de mídia de um lead: de onde ele veio, na forma que a linha de
 * `leads` guarda.
 *
 * ---------------------------------------------------------------------------
 * Por que isto existe (2026-09-21)
 * ---------------------------------------------------------------------------
 * A tabela `leads` nasceu de marketing e tem, desde o começo, as colunas
 * `utm_*`, `gclid`, `fbclid`, `fbp` e `fbc`. As duas rotas que gravam lead
 * vindo do site — `/api/leads` e `/api/avaliacao` — RECEBIAM esses valores no
 * corpo do POST, repassavam ao n8n e à CAPI, e não gravavam nenhum. Medido em
 * 2026-09-20: 0 de 14 leads com qualquer um deles preenchido, inclusive os 4
 * que vieram de formulário com `event_id`.
 *
 * Sem isso na linha, três coisas ficam impossíveis mais adiante: subir
 * conversão offline para o Google Ads quando o negócio fecha (precisa do
 * `gclid`), reenviar ao Meta um evento que falhou (precisa de `fbp`/`fbc`), e
 * dizer de qual campanha veio uma venda. O dado chegava e era jogado fora.
 *
 * ---------------------------------------------------------------------------
 * Regras
 * ---------------------------------------------------------------------------
 * - O corpo vem do visitante: tudo é conferido como texto, aparado, e vazio
 *   vira `null` para `count(coluna)` continuar significando "preenchido".
 * - Valor acima do limite é DESCARTADO, não cortado. Um `gclid` truncado é pior
 *   que nenhum: o upload offline volta "click id inválido" e ninguém sabe por
 *   quê. Os valores reais ficam bem abaixo de 500 caracteres.
 * - A régua de consentimento não mora aqui. `fbp`/`fbc` já chegam `null` de
 *   quem se opôs (`getMatchParamsRespeitandoRecusa`), e os parâmetros de
 *   campanha viajam com o lead por decisão registrada em `getUtmParameters`.
 *   Esta função só grava o que o cliente já decidiu mandar.
 * - `gbraid`/`wbraid` ficam de fora: a tabela não tem coluna para eles, e
 *   gravar coluna inexistente faria o `insert` INTEIRO falhar — perdendo o
 *   lead, não só o parâmetro. Entram junto com a migração que criar as colunas.
 * - IP e User-Agent também ficam de fora, e é decisão: a CAPI os lê do header
 *   na hora, e guardá-los na linha muda o que /privacidade declara.
 */

export const LIMITE_DO_PARAMETRO = 500;

export interface ContextoDeMidia {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  fbp: string | null;
  fbc: string | null;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo || limpo.length > LIMITE_DO_PARAMETRO) return null;
  return limpo;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/**
 * Lê do corpo do POST o que vai para as colunas de mídia de `leads`.
 *
 * Formato esperado, o mesmo que as superfícies do site já mandam: os
 * parâmetros de campanha dentro de `utm` (saída de `getUtmParameters`), e
 * `fbp`/`fbc` na raiz (saída de `getMatchParamsRespeitandoRecusa`).
 */
export function contextoDeMidiaDoLead(corpo: unknown): ContextoDeMidia {
  const raiz = objeto(corpo);
  const utm = objeto(raiz.utm);

  return {
    utm_source: texto(utm.utm_source),
    utm_medium: texto(utm.utm_medium),
    utm_campaign: texto(utm.utm_campaign),
    utm_term: texto(utm.utm_term),
    utm_content: texto(utm.utm_content),
    gclid: texto(utm.gclid),
    fbclid: texto(utm.fbclid),
    fbp: texto(raiz.fbp),
    fbc: texto(raiz.fbc),
  };
}
