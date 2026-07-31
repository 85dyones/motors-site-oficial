import crypto from "crypto";

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
    });
    if (!res.ok) {
      console.warn(`[Meta CAPI] Erro ${res.status} no evento "${event.eventName}":`, await res.text().catch(() => ""));
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.warn(`[Meta CAPI] Falha de rede (não bloqueante) no evento "${event.eventName}":`, err);
    return { ok: false, status: 0 };
  }
}
