import { NextRequest, NextResponse } from "next/server";
import { sendCapiEvent, type CapiEvent } from "../../../lib/meta-capi";
import { getCachedSettings } from "../../../lib/settings";
import { createAdminSupabaseClient } from "../../../lib/supabase-server";

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

        /**
         * Quem já foi lead volta identificado — e é isso que sobe a
         * correspondência.
         *
         * Decisão do dono em 2026-09-01, depois de a mídia medir o ViewContent
         * em 4,4/10: cobertura de 100% em `user_agent`, `fbp` e `external_id`,
         * e ZERO em `em`/`ph`. Correspondência ruim, num orçamento apertado, é
         * dinheiro comprando o público errado.
         *
         * O `Lead` já mandava e-mail e telefone com hash — ele acontece dentro
         * de `/api/leads`, que tem os dois na mão. O que faltava era o evento
         * de NAVEGAÇÃO: quem abre uma ficha não digita nada, então o servidor
         * precisa reconhecê-lo. O `ag_uid` chega aqui como `externalId`, e
         * desde 02/09 ele também é gravado no lead — antes disso a coluna
         * existia e estava vazia em 100% das linhas, e esta busca não teria o
         * que achar.
         *
         * ⚠️ A PII **não volta para o navegador**. É lida aqui, hasheada em
         * `sendCapiEvent` (SHA-256) e enviada ao Meta. A rota responde 204 sem
         * corpo em qualquer caso — quem chama nunca descobre se o visitante é
         * conhecido, o que impede transformar este endereço público em oráculo
         * de "este ag_uid tem cadastro".
         *
         * Melhor esforço: falha aqui não pode derrubar o evento. Sem o lead, o
         * evento vai como ia antes — anônimo, e ainda assim melhor que nada.
         */
        let email: string | null = null;
        let telefone: string | null = null;
        const uidDoLead =
          typeof externalId === "string" &&
          externalId.length > 0 &&
          externalId !== "ag_ref_nao_localizado"
            ? externalId
            : null;

        if (uidDoLead) {
          try {
            const supabase = createAdminSupabaseClient();
            const { data } = await supabase
              .from("leads")
              // O mais recente: quem preencheu duas vezes tem duas linhas, e a
              // última é a que descreve a pessoa hoje. `leads_ag_uid_idx` cobre
              // exatamente esta ordem (migração 20260902130000).
              .select("email, telefone")
              .eq("ag_uid", uidDoLead)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            email = data?.email || null;
            telefone = data?.telefone || null;
          } catch (erro) {
            console.warn("[api/capi] Enriquecimento por ag_uid falhou (não bloqueante):", erro);
          }
        }

        /**
         * Fila no n8n em vez de entrega direta ao Meta.
         *
         * Decidido em 2026-08-06: o n8n já é a peça de integração do projeto,
         * dá fila, retry e visibilidade de graça, e evita mais um serviço só
         * para isso. Precisa ser um webhook DIFERENTE do de leads — ver o
         * comentário no ponto de envio.
         *
         * Sem a variável, o comportamento anterior continua valendo: entrega
         * direta. Assim configurar depois não é pré-requisito para publicar.
         */
        const webhookTracking = process.env.N8N_WEBHOOK_TRACKING_URL?.trim() || null;

        const evento = {
          eventName: validEventName,
          eventId: validEventId,
          eventSourceUrl: typeof eventSourceUrl === "string" ? eventSourceUrl : null,
          userData: {
            // Do lead, quando o visitante já é conhecido. `sendCapiEvent`
            // normaliza e hasheia os dois antes de sair daqui.
            email,
            phone: telefone,
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
        };

        if (webhookTracking) {
          // Caminho preferido: o n8n enfileira, repete em caso de falha do
          // Meta e dá visibilidade do que passou. Este é o fluxo de volume
          // (Contact é o evento mais frequente do site) e por isso usa um
          // webhook PRÓPRIO, separado do de leads: enxurrada de tracking não
          // pode degradar a entrega de lead, que é o caminho do dinheiro.
          //
          // ⚠️ ESTE RAMO MANDA `email` E `phone` EM CLARO. O hash acontece em
          // `sendCapiEvent`, que é o OUTRO caminho — aqui o objeto vai como
          // está, e a PII de quem já é lead atravessaria a rede e ficaria no
          // histórico de execução do n8n.
          //
          // Não acontece hoje: `N8N_WEBHOOK_TRACKING_URL` não existe na Vercel
          // (confirmado pelo dono em 2026-09-02), e o workflow que atenderia
          // este endereço também não — o que existe é "My workflow 2", de
          // maio, parado, e que lê `body.record`, formato que esta rota não
          // manda. Ligar aquilo quebraria tudo em silêncio.
          //
          // Quem for construir a fila de verdade: ou hasheia ANTES de postar
          // aqui, ou o n8n hasheia antes de falar com o Meta. Enfileirar PII em
          // claro para ganhar retry é troca ruim.
          await fetch(webhookTracking, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(process.env.N8N_SECRET_TOKEN
                ? { Authorization: `Bearer ${process.env.N8N_SECRET_TOKEN}` }
                : {}),
            },
            body: JSON.stringify({ ...evento, pixelId, recebidoEm: new Date().toISOString() }),
          });
        } else if (pixelId) {
          // Sem webhook configurado, segue direto para o Meta — é o
          // comportamento anterior, mantido para não desligar o tracking se
          // a variável não estiver preenchida.
          await sendCapiEvent({ ...evento, pixelId });
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
