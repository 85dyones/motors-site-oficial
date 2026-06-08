export interface TelemetryLeadPayload {
  marca: string;
  modelo: string;
  ano: number | string;
  estado: string;
  nome: string;
  telefone: string;
  agUid: string;
  status: number;
}

export interface TelemetryMatchPayload {
  tags: string[];
  maxBudget?: number;
  resultsCount: number;
  matchedVehicles: string[];
  agUid?: string;
}

export function logLeadCaptured(payload: TelemetryLeadPayload) {
  console.log(`[Telemetry] [Lead Capture] [${new Date().toISOString()}] Lead successfully registered.`, {
    ag_uid: payload.agUid,
    nome: payload.nome,
    veiculo: `${payload.marca} ${payload.modelo} (${payload.ano})`,
    estado: payload.estado,
    webhook_status: payload.status,
  });
}

export function logCarMatchQueried(payload: TelemetryMatchPayload) {
  console.log(`[Telemetry] [Car Match] [${new Date().toISOString()}] Match query processed.`, {
    ag_uid: payload.agUid || "ag_ref_nao_localizado",
    tags: payload.tags,
    maxBudget: payload.maxBudget,
    resultsCount: payload.resultsCount,
    recommended: payload.matchedVehicles,
  });
}

/**
 * Safely and robustly retrieves the active ag_uid on the client-side.
 * Falls back across LocalStorage, global window object, and browser cookies.
 */
export function getActiveAgUid(): string {
  if (typeof window === "undefined") return "ag_ref_nao_localizado";
  
  try {
    const uid = localStorage.getItem("ag_uid");
    if (uid) return uid;
  } catch (e) {}

  if ((window as any).ag_uid) {
    return (window as any).ag_uid;
  }

  try {
    const match = document.cookie.match(/(?:^|; )ag_uid=([^;]*)/);
    if (match && match[1]) return match[1];
  } catch (e) {}

  return "ag_ref_nao_localizado";
}

/**
 * Logs the initiation of a client-side flow.
 * Format: [Antigravity Tracking] Iniciando fluxo [Nome do Fluxo] para o UID: [ag_uid]
 */
export function logFlowInitiated(flowName: string, agUid: string) {
  console.log(`[Antigravity Tracking] Iniciando fluxo ${flowName} para o UID: ${agUid}`);
}

/**
 * Logs backend API request performance and detailed failure cases.
 * Successful format: [Antigravity API Telemetry] [METHOD] [path] completed in [ms]ms with status [statusCode]
 * Failure case also logs a descriptive error containing request body, status, and response time.
 */
export function logApiTelemetry(
  method: string,
  path: string,
  durationMs: number,
  statusCode: number,
  requestBody?: any,
  errorDetails?: any
) {
  console.log(`[Antigravity API Telemetry] ${method} ${path} completed in ${durationMs}ms with status ${statusCode}`);

  if (statusCode >= 400) {
    console.error(`[Antigravity API Telemetry Failure] Detailed failure log:`, {
      method,
      path,
      statusCode,
      durationMs,
      requestBody: requestBody || null,
      error: errorDetails || "Unknown or unhandled exception",
    });
  }
}

/**
 * Logs theme changes for the client-side UI configurator.
 * Format: [Antigravity Theme] Interface atualizada para o Preset/Cores: [themeName]
 */
export function logThemeChanged(themeName: string) {
  console.log(`[Antigravity Theme] Interface atualizada para o Preset/Cores: ${themeName}`);
}

export interface UtmParameters {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
}

/**
 * Parses UTM parameters from URL search query or falls back to localStorage.
 * Automatically persists parameters found in the URL.
 */
export function getUtmParameters(): UtmParameters {
  const result: UtmParameters = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
  };

  if (typeof window === "undefined") return result;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const keys: (keyof UtmParameters)[] = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];

    keys.forEach((key) => {
      // 1. Try URL context first
      let val = urlParams.get(key);
      
      // 2. If present in URL, persist it in localStorage (prefixed with ag_)
      if (val) {
        localStorage.setItem(`ag_${key}`, val);
      } else {
        // 3. Fallback to localStorage
        val = localStorage.getItem(`ag_${key}`) || localStorage.getItem(key);
      }

      result[key] = val || null;
    });
  } catch (e) {
    console.warn("[Telemetry] Failed to parse UTM parameters:", e);
  }

  return result;
}


