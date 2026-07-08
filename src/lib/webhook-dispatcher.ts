import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Dispatches an administrative event webhook payload if configured and enabled.
 */
export async function dispatchAdminWebhook(event: string, payload: any) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("[WebhookDispatcher] Supabase keys missing, skipping dispatch.");
      return;
    }
    
    // 1. Fetch webhook settings
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: row } = await supabase
      .from("site_settings")
      .select("data")
      .eq("id", "webhooks")
      .maybeSingle();

    if (!row || !row.data) {
      console.info("[WebhookDispatcher] Webhook settings not found in database, skipping dispatch.");
      return;
    }

    const webhooks = row.data;
    const notificationsUrl = webhooks.webhookNotificacoesUrl || process.env.N8N_ADMIN_WEBHOOK_URL;
    
    if (!notificationsUrl) {
      console.info("[WebhookDispatcher] Notifications webhook URL is not configured, skipping dispatch.");
      return;
    }

    // 2. Check if event is enabled in the checklist
    // If events object is not set yet, default to true for backward compatibility
    const eventsConfig = webhooks.events || {};
    const isEnabled = eventsConfig[event] !== false; // default to true if not defined

    if (!isEnabled) {
      console.info(`[WebhookDispatcher] Event "${event}" is disabled by configuration.`);
      return;
    }

    // 3. Dispatch the payload
    console.log(`[WebhookDispatcher] Dispatching administrative event "${event}" to ${notificationsUrl}`);
    const res = await fetch(notificationsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Event": event,
        ...(process.env.N8N_SECRET_TOKEN ? { "Authorization": `Bearer ${process.env.N8N_SECRET_TOKEN}` } : {})
      },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload
      })
    });

    if (res.ok) {
      console.log(`[WebhookDispatcher] Successfully dispatched event "${event}" to webhook.`);
    } else {
      const text = await res.text().catch(() => "");
      console.warn(`[WebhookDispatcher] Webhook returned status ${res.status} for event "${event}": ${text}`);
    }
  } catch (err: any) {
    console.error(`[WebhookDispatcher] Failed to dispatch event "${event}":`, err.message);
  }
}
