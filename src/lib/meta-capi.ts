import crypto from "crypto";

/** Teto da chamada ao Graph. Ver a nota no `fetch`, onde ele é aplicado. */
const TEMPO_LIMITE_MS = 5000;

/** Normaliza e hasheia conforme exigência do Meta: lowercase, trim, SHA-256 hex. */
function hash(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** Telefone: só dígitos, com DDI, sem "+". Ex: 5541999998888 */
function hashPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const withDdi = digits.startsWith("55") ? digits : `55${digits}`;
  return crypto.createHash("sha256").update(withDdi).digest("hex");
}

export interface CapiUserData {
  email?: string | null;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

export interface CapiEvent {
  eventName: "ViewContent" | "Lead" | "Contact" | "Search" | "CompleteRegistration";
  eventId: string;
  eventTime?: number; // unix seconds; default = agora
  eventSourceUrl?: string | null;
  actionSource?: "website";
  userData: CapiUserData;
  customData?: Record<string, unknown>;
  // Pixel ID já resolvido de site_settings (companySettings.metaPixelId).
  // Se omitido, cai para META_PIXEL_ID do ambiente.
  pixelId?: string | null;
}

export async function sendCapiEvent(event: CapiEvent): Promise<{ ok: boolean; status: number }> {
  const pixelId = event.pixelId || process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION;

  if (!pixelId || !token || !version) {
    console.warn(
      `[Meta CAPI] Configuração ausente (pixelId=${!!pixelId} token=${!!token} version=${!!version}); evento "${event.eventName}" ignorado.`
    );
    return { ok: false, status: 0 };
  }

  const userData: Record<string, unknown> = {};
  const em = hash(event.userData.email);
  const ph = hashPhone(event.userData.phone);
  const externalId = hash(event.userData.externalId);

  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (externalId) userData.external_id = [externalId];
  if (event.userData.fbp) userData.fbp = event.userData.fbp;
  if (event.userData.fbc) userData.fbc = event.userData.fbc;
  if (event.userData.clientIpAddress) userData.client_ip_address = event.userData.clientIpAddress;
  if (event.userData.clientUserAgent) userData.client_user_agent = event.userData.clientUserAgent;

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        event_source_url: event.eventSourceUrl ?? undefined,
        action_source: event.actionSource ?? "website",
        user_data: userData,
        custom_data: event.customData ?? undefined,
      },
    ],
    ...(process.env.META_CAPI_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE }
      : {}),
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      /**
       * Tempo limite explícito — `fetch` não tem um.
       *
       * Sem isto, um Graph lento segura a função serverless até o teto da
       * plataforma. Com uma requisição a cada ficha aberta, é assim que uma
       * lentidão do Meta vira fila de funções presas e conta de execução —
       * justamente quando a campanha traz volume, que é quando o Meta também
       * está mais carregado.
       *
       * Cinco segundos é folgado: a chamada normal responde em menos de um.
       * Estourar aqui é `AbortError`, tratado no `catch` como qualquer falha
       * de rede — o evento se perde, e o do navegador já foi.
       */
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!res.ok) {
      // `console.error`, não `warn`: é o nível que o filtro de erro da Vercel
      // enxerga, e é sobre ele que se liga alerta. Um CAPI recusando evento em
      // silêncio já custou um mês a este projeto (ver o gate de consentimento,
      // 31/08 a 02/09) — o log existia e ninguém o via porque era `warn`.
      console.error(
        `[Meta CAPI] FALHA ${res.status} no evento "${event.eventName}":`,
        await res.text().catch(() => ""),
      );
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    const expirou = err instanceof Error && err.name === "TimeoutError";
    console.error(
      `[Meta CAPI] FALHA ${expirou ? `por tempo limite (${TEMPO_LIMITE_MS}ms)` : "de rede"} ` +
        `no evento "${event.eventName}":`,
      err,
    );
    return { ok: false, status: 0 };
  }
}
