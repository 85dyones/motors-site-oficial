import { NextRequest, NextResponse } from "next/server";
import { sendCapiEvent, type CapiEvent } from "../../../lib/meta-capi";
import { getCachedSettings } from "../../../lib/settings";

export const dynamic = "force-dynamic";

const ALLOWED_EVENTS: ReadonlyArray<CapiEvent["eventName"]> = [
  "ViewContent",
  "Lead",
  "Contact",
  "Search",
  "CompleteRegistration",
];

/**
 * Rota pública (sem captcha) chamada pelo browser para espelhar eventos que não
 * passam por /api/leads — principalmente ViewContent. Rate-limitada em proxy.ts.
 * Nunca confiar em `value`/`content_type` etc. sem validar: qualquer um pode
 * fazer POST aqui e tentar poluir o dataset do Meta.
 */
function sanitizeCustomData(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (Array.isArray(input.content_ids)) {
    const ids = input.content_ids.filter((id): id is string => typeof id === "string" && id.length <= 100).slice(0, 50);
    if (ids.length > 0) out.content_ids = ids;
  }
  if (typeof input.content_type === "string" && ["product", "vehicle"].includes(input.content_type)) {
    out.content_type = input.content_type;
  }
  if (typeof input.content_name === "string") {
    out.content_name = input.content_name.slice(0, 200);
  }
  if (typeof input.value === "number" && Number.isFinite(input.value) && input.value >= 0 && input.value <= 100_000_000) {
    out.value = input.value;
  }
  if (typeof input.currency === "string" && /^[A-Z]{3}$/.test(input.currency)) {
    out.currency = input.currency;
  }
  if (typeof input.search_string === "string") {
    out.search_string = input.search_string.slice(0, 200);
  }
  if (typeof input.content_category === "string") {
    out.content_category = input.content_category.slice(0, 100);
  }

  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (body && typeof body === "object") {
      const { eventName, eventId, eventSourceUrl, fbp, fbc, externalId, customData } = body as Record<string, unknown>;

      // Validação como variáveis tipadas (em vez de um boolean solto) para que o
      // TypeScript consiga estreitar eventName/eventId corretamente logo abaixo.
      const validEventName =
        typeof eventName === "string" && (ALLOWED_EVENTS as readonly string[]).includes(eventName)
          ? (eventName as CapiEvent["eventName"])
          : null;
      const validEventId = typeof eventId === "string" && eventId.length > 0 ? eventId : null;

      if (validEventName && validEventId) {
        const { companySettings } = await getCachedSettings();
        const pixelId = companySettings?.metaPixelId || null;

        if (pixelId) {
          await sendCapiEvent({
            eventName: validEventName,
            eventId: validEventId,
            eventSourceUrl: typeof eventSourceUrl === "string" ? eventSourceUrl : null,
            userData: {
              fbp: typeof fbp === "string" ? fbp : null,
              fbc: typeof fbc === "string" ? fbc : null,
              externalId: typeof externalId === "string" ? externalId : null,
              clientIpAddress:
                request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
                request.headers.get("x-real-ip"),
              clientUserAgent: request.headers.get("user-agent"),
            },
            customData:
              customData && typeof customData === "object"
                ? sanitizeCustomData(customData as Record<string, unknown>)
                : undefined,
            pixelId,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[api/capi] Falha não-bloqueante:", err);
  }

  // Sempre 204, mesmo em caso de payload inválido/pixel não configurado —
  // não vazar informação sobre a configuração de tracking para quem chama.
  return new NextResponse(null, { status: 204 });
}
