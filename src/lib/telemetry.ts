import { generateEventId, getMatchParams } from "./tracking-identity";
import {
  containerAssumeOsEventos,
  pushCliqueTelefone,
  pushCliqueWhatsApp,
  pushLead,
  pushVeiculo,
  type ContextoDeContato,
  type TipoDeLead,
} from "./dataLayer";

// Vertical do catálogo Meta Commerce Manager usado pela Motors Store.
// Trocar para "vehicle" se o catálogo migrar de vertical (decisão em aberto).
export const META_CONTENT_TYPE = "product";

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
 * Forma curta do ag_uid para texto que o CLIENTE lê: os 8 primeiros
 * caracteres do UUID, em maiúsculas ("0DCB1CDC"). Devolve "" quando não há
 * rastreio utilizável (ex.: "ag_ref_nao_localizado") — código de erro interno
 * não é coisa de aparecer em mensagem de WhatsApp.
 *
 * A referência visível existe para um caso só: a mensagem chegou no WhatsApp
 * da loja sem casar com o POST de /api/leads (o envio falhou, ou o cliente
 * digitou um número no modal e mandou de outro). Oito caracteres bastam para
 * localizar o visitante de olho — a nota do Chatwoot e a CAPI carregam o
 * UUID inteiro, que começa por estes mesmos oito.
 *
 * O ag_uid COMPLETO segue viajando no JSON do lead (`ag_uid`) e como
 * `externalId` da CAPI. Encurtar aqui é apresentação, não rastreio.
 */
export function refCurta(agUid?: string): string {
  const uid = agUid ?? getActiveAgUid();
  return /^[0-9a-f]{8}-/i.test(uid) ? uid.slice(0, 8).toUpperCase() : "";
}

/**
 * Sufixo pronto para as mensagens pré-preenchidas: " (Ref: 0DCB1CDC)", ou ""
 * quando não há referência — a mensagem termina limpa, sem "(Ref: )" órfão.
 */
export function sufixoRef(agUid?: string): string {
  const ref = refCurta(agUid);
  return ref ? ` (Ref: ${ref})` : "";
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
  utm_term: string | null;
  gclid: string | null;
  /**
   * Os dois substitutos do `gclid`, acrescentados em 27/08.
   *
   * O Google entrega `gbraid` (tráfego iOS/app) ou `wbraid` (web, boa parte do
   * inventário de PMax e YouTube) NO LUGAR do `gclid` — não junto dele. Sem
   * capturá-los, o upload de conversão offline volta com "click id inválido"
   * justamente no tráfego que a campanha nova vai comprar.
   */
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
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
    utm_term: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    fbclid: null,
  };

  if (typeof window === "undefined") return result;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    // A lista É o contrato: chave que não está aqui não é lida da URL nem
    // persistida, e some sem erro. Foi o que aconteceu com `gbraid`/`wbraid`
    // até 27/08.
    const keys: (keyof UtmParameters)[] = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "gbraid", "wbraid", "fbclid"];

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

/**
 * Espelha no CAPI um evento que acabou de ser disparado no browser.
 *
 * O `eventId` é o mesmo dos dois lados — é ele que faz o Events Manager
 * marcar "Desduplicado" em vez de contar duas vezes. IP e User-Agent não vão
 * daqui: o servidor lê dos headers, porque cliente não é fonte confiável
 * para isso (regra 4 do TRACKING_SPEC.md).
 *
 * Fire-and-forget de propósito. Falha de integração nunca pode travar o
 * fluxo do usuário — quem chama já seguiu adiante.
 *
 * `Lead` não passa por aqui: ele é espelhado dentro de `/api/leads`, que já
 * é servidor e tem o e-mail e o telefone para hashear. `ViewContent` também
 * não: o disparo dele vive no `PDPClientWrapper`, que é quem conhece o
 * veículo inteiro para montar o `custom_data`.
 */
function espelharNoCapi(
  eventName: "Contact" | "Search" | "CompleteRegistration",
  eventId: string,
  customData: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;

  try {
    const { fbp, fbc } = getMatchParams();

    fetch("/api/capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        eventId,
        eventSourceUrl: window.location.href,
        fbp,
        fbc,
        externalId: getActiveAgUid(),
        customData,
      }),
      keepalive: true, // o clique costuma navegar para fora (WhatsApp); sem isto o POST morre com a página
    }).catch((err) =>
      console.warn(`[CAPI] ${eventName} dispatch failed (non-blocking):`, err),
    );
  } catch (err) {
    console.warn(`[CAPI] ${eventName} dispatch skipped (non-blocking):`, err);
  }
}

export interface TrackLeadOptions {
  // Aceita um event_id já gerado (ex: quando o caller precisa do mesmo ID
  // no payload do CAPI antes de confirmar que o pixel do browser deve disparar).
  presetEventId?: string;
  // Google Ads Enhanced Conversions — omitir quaisquer dos dois desativa o envio.
  googleAdsId?: string | null;
  googleAdsConversionLabel?: string | null;
  email?: string | null;
  phoneE164?: string | null; // formato +5541999998888 (COM o "+" — diferente do Meta)
  /**
   * Que formulário gerou o lead. Vai só para o `dataLayer`: é o que permite
   * criar uma conversão por tipo no Ads (proposta vale mais que dúvida) sem
   * inventar um evento novo para cada um.
   */
  tipoDeLead?: TipoDeLead;
  formId?: string;
}

export function trackLeadSubmission(
  vehicle: { id?: string; marca: string; modelo: string; preco: number },
  message: string,
  options?: TrackLeadOptions
): string | null {
  if (typeof window === "undefined") return null;

  try {
    // O id sobe para antes do push: ele é o `lead_id` que o container lê, e o
    // mesmo valor que já viaja no `eventID` do Meta e no `transaction_id` do
    // Ads. Um id só nas três plataformas é o que permite conferir uma contra a
    // outra. Estava sendo gerado depois do portão de consentimento, e o push
    // acontece antes dele — daí chegar sempre vazio no `dataLayer`.
    const eventId = options?.presetEventId || generateEventId("Lead");

    pushLead(options?.tipoDeLead ?? "proposta", {
      vehicle_id: vehicle.id,
      vehicle_name: `${vehicle.marca} ${vehicle.modelo}`,
      vehicle_price: vehicle.preco,
      form_id: options?.formId,
      lead_id: eventId,
    });

    const consent = localStorage.getItem("ag_cookie_consent");
    if (consent !== "accepted") return null;

    // Com o container no ar, quem manda `generate_lead` para o GA4 é a tag 204
    // — com mais parâmetro do que este `gtag` jamais mandou (`vehicle.*`
    // inteiro, `lead_id`, valor calculado por tipo de lead). Enviar dos dois
    // lados contaria cada lead duas vezes, e o GA4 não apaga evento retroativo.
    // Ver a nota do sinalizador em `lib/dataLayer.ts`.
    const oContainerAssume = containerAssumeOsEventos();

    // Google Analytics 4 Event
    if (window.gtag && !oContainerAssume) {
      window.gtag("event", "generate_lead", {
        currency: "BRL",
        value: vehicle.preco,
        item_name: `${vehicle.marca} ${vehicle.modelo}`,
        description: message
      });
    }

    // Google Ads Enhanced Conversions — requer "Conversões otimizadas" ativado
    // no painel do Google Ads, senão o user_data é descartado silenciosamente.
    //
    // Também cede a vez ao container: a tag 210 (`Ads - conv_lead`) dispara na
    // mesma submissão. Hoje este caminho está inerte, porque `googleAdsId` e
    // `googleAdsConversionLabel` estão vazios no painel — mas preencher os dois
    // campos com o container ligado ressuscitaria a dupla contagem, e é um
    // gesto de duas linhas no painel, sem nenhum aviso.
    if (window.gtag && !oContainerAssume && options?.googleAdsId && options?.googleAdsConversionLabel) {
      window.gtag("set", "user_data", {
        email: options.email || undefined,
        phone_number: options.phoneE164 || undefined,
      });
      window.gtag("event", "conversion", {
        send_to: `${options.googleAdsId}/${options.googleAdsConversionLabel}`,
        value: vehicle.preco,
        currency: "BRL",
        transaction_id: eventId, // mesmo ID do Meta, evita dupla atribuição da conversão
      });
    }

    // Meta Pixel Event
    if (window.fbq) {
      window.fbq("track", "Lead", {
        content_ids: vehicle.id ? [vehicle.id] : undefined,
        content_type: META_CONTENT_TYPE,
        content_name: `${vehicle.marca} ${vehicle.modelo}`,
        value: vehicle.preco,
        currency: "BRL"
      }, { eventID: eventId });
    }

    console.log(`[Telemetry Tracking] Event Logged: Lead - ${vehicle.marca} ${vehicle.modelo} (${eventId})`);
    return eventId;
  } catch (err) {
    console.warn("[Telemetry Tracking] Failed to log lead event:", err);
    return null;
  }
}

export function trackVehicleView(
  vehicle: {
    id: string;
    marca: string;
    modelo: string;
    preco: number;
    /** Campos extras alimentam só o `dataLayer`; o pixel continua com o que já mandava. */
    versao?: string | null;
    ano?: number | string | null;
    quilometragem?: number | null;
    cambio?: string | null;
    combustivel?: string | null;
    tipo?: string | null;
    cor?: string | null;
    nome?: string;
    /** Donos anteriores e laudo — `owners` e `has_report` do §11.1 do plano. */
    donos?: number | null;
    temLaudo?: boolean;
    /** Data de chegada, para o `days_in_stock`. */
    primeiraVez?: string | null;
  },
): string | null {
  if (typeof window === "undefined") return null;

  try {
    // A camada de dados é publicada ANTES do gate de consentimento, e só ela:
    // escrever num array em memória não envia nada. Quem envia é o GTM, que só
    // carrega depois do aceite — e processa a fila que já estiver aqui. Ver a
    // nota de consentimento em `lib/dataLayer.ts`.
    pushVeiculo({
      id: vehicle.id,
      marca: vehicle.marca,
      modelo: vehicle.modelo,
      versao: vehicle.versao,
      ano: vehicle.ano,
      preco: vehicle.preco,
      quilometragem: vehicle.quilometragem,
      cambio: vehicle.cambio,
      combustivel: vehicle.combustivel,
      tipo: vehicle.tipo,
      cor: vehicle.cor,
      nome: vehicle.nome || `${vehicle.marca} ${vehicle.modelo}`,
      donos: vehicle.donos,
      temLaudo: vehicle.temLaudo,
      primeiraVez: vehicle.primeiraVez,
    });

    const consent = localStorage.getItem("ag_cookie_consent");
    if (consent !== "accepted") return null;

    const eventId = generateEventId("ViewContent");

    // Google Analytics 4 Event
    if (window.gtag) {
      window.gtag("event", "view_item", {
        currency: "BRL",
        value: vehicle.preco,
        items: [{
          item_id: vehicle.id,
          item_name: `${vehicle.marca} ${vehicle.modelo}`,
          price: vehicle.preco
        }]
      });
    }

    // Meta Pixel Event
    if (window.fbq) {
      window.fbq("track", "ViewContent", {
        content_ids: [vehicle.id],
        content_type: META_CONTENT_TYPE,
        content_name: `${vehicle.marca} ${vehicle.modelo}`,
        value: vehicle.preco,
        currency: "BRL"
      }, { eventID: eventId });
    }

    console.log(`[Telemetry Tracking] Event Logged: ViewContent - ${vehicle.marca} ${vehicle.modelo} (${eventId})`);
    return eventId;
  } catch (err) {
    console.warn("[Telemetry Tracking] Failed to log view item event:", err);
    return null;
  }
}

export function trackAppraisalSubmit(category: string, brand: string, model: string, year: string, fipe: number): string | null {
  if (typeof window === "undefined") return null;

  try {
    // A avaliação é a outra ponta do negócio (§1.4b): alimenta captação de
    // estoque e costuma ter CPL menor que a landing de venda. Ela precisa ser
    // uma conversão distinta no Ads, e é o `lead_type` que separa as duas.
    pushLead("avaliacao");

    const consent = localStorage.getItem("ag_cookie_consent");
    if (consent !== "accepted") return null;

    const eventId = generateEventId("CompleteRegistration");

    // Google Analytics 4 Event
    if (window.gtag) {
      window.gtag("event", "complete_registration", {
        category: category,
        brand: brand,
        model: model,
        value: fipe,
        currency: "BRL"
      });
    }

    // Meta Pixel Event
    if (window.fbq) {
      window.fbq("track", "CompleteRegistration", {
        content_name: `Avaliacao ${category} - ${brand} ${model}`,
        value: fipe,
        currency: "BRL"
      }, { eventID: eventId });
    }

    espelharNoCapi("CompleteRegistration", eventId, {
      content_name: `Avaliacao ${category} - ${brand} ${model}`,
      value: fipe,
      currency: "BRL",
    });

    console.log(`[Telemetry Tracking] Event Logged: CompleteRegistration - Appraisal ${category} (${eventId})`);
    return eventId;
  } catch (err) {
    console.warn("[Telemetry Tracking] Failed to log registration event:", err);
    return null;
  }
}

export function trackCarMatch(tags: string[], resultsCount: number): string | null {
  if (typeof window === "undefined") return null;

  try {
    const consent = localStorage.getItem("ag_cookie_consent");
    if (consent !== "accepted") return null;

    const eventId = generateEventId("Search");

    // Google Analytics 4 Event
    if (window.gtag) {
      window.gtag("event", "search", {
        search_term: tags.join(", "),
        results_count: resultsCount
      });
    }

    // Meta Pixel Event
    if (window.fbq) {
      window.fbq("track", "Search", {
        search_string: tags.join(", "),
        content_category: "CarMatch Recommendation"
      }, { eventID: eventId });
    }

    espelharNoCapi("Search", eventId, {
      search_string: tags.join(", "),
      content_category: "CarMatch Recommendation",
    });

    console.log(`[Telemetry Tracking] Event Logged: Search - CarMatch (${eventId})`);
    return eventId;
  } catch (err) {
    console.warn("[Telemetry Tracking] Failed to log search event:", err);
    return null;
  }
}

export function trackContactClick(
  method: "whatsapp" | "phone",
  label: string = "",
  /** Veículo de onde partiu o clique, quando houver — a ficha sabe, o rodapé não. */
  contexto: ContextoDeContato = {},
): string | null {
  if (typeof window === "undefined") return null;

  try {
    // Todo CTA de WhatsApp e de telefone do site já passa por aqui (é o que a
    // regra 7 garantiu quando o redesign moveu os botões). Pendurar o push
    // neste ponto cobre header, rodapé, ficha, pop-up e curadoria de uma vez,
    // sem tocar em cada chamada — e sem mexer no que já era disparado.
    if (method === "whatsapp") {
      pushCliqueWhatsApp(label || "desconhecido", contexto);
    } else {
      pushCliqueTelefone(label || "desconhecido", contexto);
    }

    const consent = localStorage.getItem("ag_cookie_consent");
    if (consent !== "accepted") return null;

    const eventId = generateEventId("Contact");

    // Google Analytics 4 Event
    //
    // Com o container no ar, quem reporta este clique é a tag 201
    // (`click_whatsapp`) ou a 202 (`click_to_call`) — cada uma com o nome do
    // que de fato aconteceu.
    //
    // ⚠️ Este ramo mandava `generate_lead` — o MESMO nome do formulário
    // efetivamente enviado — para um clique que só abre a conversa. E a nota
    // que estava aqui descrevia o defeito como resolvido pelo container,
    // enquanto o portão que faria isso valer (`gtmAssumeEventos`) segue
    // fechado. Ou seja: a correção estava escrita, não aplicada.
    //
    // Corrigido em 27/08 mandando o nome do que de fato aconteceu, em vez de
    // apagar o disparo. Apagar dependeria de o container estar publicado e
    // com as tags 201/202 no ar; com o nome certo, o evento existe nos dois
    // mundos e nenhum deles infla a contagem de leads.
    if (window.gtag && !containerAssumeOsEventos()) {
      window.gtag("event", method === "whatsapp" ? "click_whatsapp" : "click_to_call", {
        method: method,
        description: label,
      });
    }

    // Meta Pixel Event
    if (window.fbq) {
      window.fbq("track", "Contact", {
        content_name: label,
        content_category: method
      }, { eventID: eventId });
    }

    espelharNoCapi("Contact", eventId, {
      content_name: label,
      content_category: method,
    });

    console.log(`[Telemetry Tracking] Event Logged: Contact Click - ${method} (${eventId})`);
    return eventId;
  } catch (err) {
    console.warn("[Telemetry Tracking] Failed to log contact click event:", err);
    return null;
  }
}


