/**
 * Gera um ID único por evento, compartilhado entre browser e servidor
 * para deduplicação no Meta (Events Manager mostra "Desduplicado" quando
 * o mesmo event_id chega via Pixel e via Conversions API).
 */
export function generateEventId(eventName: string): string {
  const random = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${eventName}.${random}`;
}

/** Lê um cookie pelo nome (client-side). */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface MatchParams {
  fbp: string | null; // cookie _fbp — gerado pelo próprio pixel
  fbc: string | null; // cookie _fbc — derivado do fbclid
}

/**
 * Se o usuário chegou por anúncio, a URL traz ?fbclid=...
 * O pixel normalmente grava o _fbc sozinho, mas em navegação SPA (ou se o
 * pixel ainda não carregou) pode perder. Este fallback monta no formato
 * exigido pelo Meta: fb.{subdomainIndex}.{creationTime}.{fbclid}
 */
function buildFbcFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbclid) return null;
  return `fb.1.${Date.now()}.${fbclid}`;
}

/**
 * Parâmetros de correspondência do Meta capturados no browser.
 * `externalId` (ag_uid) não entra aqui de propósito: todo call site já
 * resolve o ag_uid via getActiveAgUid() para outros fins, então é passado
 * separadamente ao montar o payload — evita import circular com telemetry.ts.
 */
export function getMatchParams(): MatchParams {
  return {
    fbp: readCookie("_fbp"),
    fbc: readCookie("_fbc") || buildFbcFromUrl(),
  };
}
