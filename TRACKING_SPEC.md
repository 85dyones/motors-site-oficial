# Especificação Técnica — Camada de Conversão (Meta + Google)

**Projeto:** `motors-site-oficial` (Next.js 16 / React 19 / App Router / TypeScript)
**Objetivo:** fazer o site novo alimentar corretamente o Meta e o Google Ads, habilitando anúncios de catálogo (Advantage+) e otimização por lead real.
**Data:** 30/07/2026 · **Auditada e atualizada em:** 06/08/2026

> **Comece pela [Auditoria de 2026-08-06](#auditoria-de-2026-08-06)**, no fim do
> documento: as Fases 0 a 2 já estão implementadas, e o que está em aberto hoje
> é um preenchimento de painel (Fase 3) e a Fase 5, nova.

---

## 0. Contexto — por que este trabalho existe

Diagnóstico do pixel atual (`Pixel Motors Store`, ID `1410450786690090`), janela de 28 dias:

| Métrica | Valor | Situação |
|---|---|---|
| PageView | 23.920 | Tráfego real, ~850/dia |
| ViewContent | 230 | ~1% dos pageviews |
| ViewContent **com `content_ids`** | **0** | Causa raiz |
| Lead | 0 | — |
| Purchase | 0 | — |
| Contact | 3 | Em 28 dias |
| Taxa de correspondência com o catálogo | **0%** | Bloqueia catálogo |
| Eventos GA4 poluindo o pixel | ~7.200 | `user_engagement`, `scroll`, `form_start`, `click` |

**Consequência:** o catálogo `Estoque Motors Store` (ID `617519794775501`, 35 produtos) não consegue fazer remarketing dinâmico, e as campanhas só conseguem otimizar para "conversa iniciada" em vez de lead qualificado.

**O site novo já resolve boa parte disso.** Esta spec cobre o que falta.

### Estado atual do repositório

> Atualizado em 2026-08-06, depois do redesign Modernist. A tabela original
> desta seção listava `HeroSection.tsx` como superfície de lead da home; ele
> deixou de ser renderizado quando a home foi reescrita.

| Arquivo | Papel |
|---|---|
| `src/components/IntegrationsTracker.tsx` | Inicializa GA4, Google Ads e Meta Pixel; dispara PageView; persiste `_fbc` a partir do `fbclid` |
| `src/lib/telemetry.ts` | Funções client-side de tracking (`trackVehicleView`, `trackLeadSubmission`, `trackContactClick`, `trackCarMatch`, `trackAppraisalSubmit`) |
| `src/lib/tracking-identity.ts` | `generateEventId` e leitura de `_fbp`/`_fbc` (Fase 1) |
| `src/lib/meta-capi.ts` | Envio server-side ao Meta, com hash de PII (Fase 2) |
| `src/app/api/leads/route.ts` | Recebe lead, valida Turnstile, envia para webhook n8n e espelha `Lead` no CAPI |
| `src/app/api/capi/route.ts` | Rota genérica de CAPI, com whitelist de eventos e rate limit no `proxy.ts` |
| `src/app/api/feed/xml/route.ts` | Gera feed do catálogo; emite `<g:id>${car.id}</g:id>`; pula `car.vendido` |
| `src/app/carros/[marca]/[modelo]/[versao]/[slug_completo_com_id]/page.tsx` | PDP (página de detalhe do veículo) |

**Superfícies que disparam evento hoje** — todas passam `eventId`, `fbp`, `fbc`
e `eventSourceUrl` no POST para `/api/leads`:

| Superfície | Evento |
|---|---|
| `PDPClientWrapper.tsx` | `ViewContent` (browser + CAPI), `Lead`, `Contact` |
| `CarMatch.tsx` (`/carro-perfeito`) | `Search`, `Lead`, `Contact` |
| `AutoAvaliacao.tsx` (`/avaliacao`) | `CompleteRegistration`, `Lead`, `Contact` |
| `ContatoClientWrapper.tsx` (`/contato`) | `Lead`, `Contact` |
| `LeadPopup.tsx` (global, no layout) | `Lead`, `Contact` |
| `Header.tsx` e `page.tsx`, via `modernist/BotaoWhatsApp.tsx` | `Contact` |
| `Footer.tsx` (global) | `Contact` — telefone e WhatsApp |

> **`HeroSection.tsx` e `VehicleGrid.tsx` são código morto** desde o redesign:
> só se importam entre si e não são renderizados por nenhuma rota. As chamadas
> de tracking dentro deles nunca disparam. Não usar como referência.

**Alinhamento de ID já está correto:** o feed emite `car.id` e o pixel envia `content_ids: [vehicle.id]` — mesma origem. Não alterar isso.

---

## Fase 0 — Correções imediatas (minutos)

### 0.1 Adicionar `content_type` ao ViewContent

**Arquivo:** `src/lib/telemetry.ts`, função `trackVehicleView` (~linha 212)

```typescript
// ANTES
window.fbq("track", "ViewContent", {
  content_ids: [vehicle.id],
  content_name: `${vehicle.marca} ${vehicle.modelo}`,
  value: vehicle.preco,
  currency: "BRL"
});

// DEPOIS
window.fbq("track", "ViewContent", {
  content_ids: [vehicle.id],
  content_type: "product",          // ← obrigatório para casar com o catálogo
  content_name: `${vehicle.marca} ${vehicle.modelo}`,
  value: vehicle.preco,
  currency: "BRL"
});
```

> **Se o catálogo for migrado para o vertical `vehicles`** (decisão em aberto), este valor passa a ser `"vehicle"`. Deixar como constante exportada para facilitar a troca:
> ```typescript
> export const META_CONTENT_TYPE = "product"; // trocar para "vehicle" se migrar o vertical
> ```

### 0.2 Confirmar que o Pixel ID está configurado

**Arquivo:** `src/components/IntegrationsTracker.tsx` (~linha 22)

```typescript
const metaPixelId = companySettings?.metaPixelId || "";
```

O GA4 tem fallback fixo (`G-CZ4B4RYF61`), o Meta não. Se `companySettings.metaPixelId` estiver vazio no Supabase, **o pixel simplesmente não inicializa**.

**Ação:** confirmar que `site_settings` contém `metaPixelId = "1410450786690090"`. Adicionar um `console.warn` explícito quando estiver vazio, para não falhar em silêncio.

### 0.3 Adicionar `content_type` e `content_ids` ao Lead

**Arquivo:** `src/lib/telemetry.ts`, função `trackLeadSubmission` (~linha 177)

Hoje o evento `Lead` não envia o ID do veículo, mesmo tendo `vehicle.id` disponível na assinatura:

```typescript
window.fbq("track", "Lead", {
  content_ids: vehicle.id ? [vehicle.id] : undefined,
  content_type: META_CONTENT_TYPE,
  content_name: `${vehicle.marca} ${vehicle.modelo}`,
  value: vehicle.preco,
  currency: "BRL"
});
```

### Critério de aceite da Fase 0

- [ ] Meta Events Manager → Testar Eventos: `ViewContent` aparece com `content_type` e `content_ids` preenchidos ao abrir uma PDP
- [ ] Commerce Manager → Catálogo → Eventos: taxa de correspondência sai de 0% em até 48h

---

## Fase 1 — `event_id` e parâmetros de correspondência

Esta fase é **pré-requisito da Fase 2**. Adicionar CAPI sem `event_id` faz o Meta contar o mesmo lead duas vezes.

### 1.1 Criar `src/lib/tracking-identity.ts`

Módulo novo, responsável por gerar IDs de evento e capturar os parâmetros de correspondência.

```typescript
/**
 * Gera um ID único por evento, compartilhado entre browser e servidor
 * para deduplicação no Meta.
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
  fbp: string | null;   // cookie _fbp — gerado pelo próprio pixel
  fbc: string | null;   // cookie _fbc — derivado do fbclid
  externalId: string | null; // ag_uid já existente no projeto
}

export function getMatchParams(): MatchParams {
  return {
    fbp: readCookie("_fbp"),
    fbc: readCookie("_fbc") || buildFbcFromUrl(),
    externalId: getActiveAgUid?.() ?? null,
  };
}

/**
 * Se o usuário chegou por anúncio, a URL traz ?fbclid=...
 * O pixel normalmente grava o _fbc sozinho, mas em navegação SPA
 * pode perder. Este fallback monta no formato exigido pelo Meta:
 * fb.{subdomainIndex}.{creationTime}.{fbclid}
 */
function buildFbcFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbclid) return null;
  return `fb.1.${Date.now()}.${fbclid}`;
}
```

> Importar `getActiveAgUid` de `src/lib/telemetry.ts` — a função já existe e faz fallback entre localStorage, `window.ag_uid` e cookie.

### 1.2 Persistir o `fbclid` no primeiro acesso

O `fbclid` só aparece na URL de entrada. Se o usuário navegar antes de converter, ele se perde. Gravar em cookie de primeira parte no primeiro carregamento:

**Arquivo:** `src/components/IntegrationsTracker.tsx`, dentro do `useEffect` de inicialização

```typescript
// Persistir _fbc por 90 dias se veio fbclid na URL e o cookie ainda não existe
const fbclid = new URLSearchParams(window.location.search).get("fbclid");
if (fbclid && !document.cookie.includes("_fbc=")) {
  const fbc = `fb.1.${Date.now()}.${fbclid}`;
  document.cookie = `_fbc=${fbc}; path=/; max-age=7776000; SameSite=Lax`;
}
```

### 1.3 Passar `eventID` em todos os `fbq('track', ...)`

Toda função de tracking em `telemetry.ts` passa a gerar um `event_id` e devolvê-lo, para que o servidor use o mesmo valor.

```typescript
export function trackVehicleView(vehicle: {...}): string | null {
  // ...
  const eventId = generateEventId("ViewContent");

  if (window.fbq) {
    window.fbq("track", "ViewContent", {
      content_ids: [vehicle.id],
      content_type: META_CONTENT_TYPE,
      content_name: `${vehicle.marca} ${vehicle.modelo}`,
      value: vehicle.preco,
      currency: "BRL"
    }, { eventID: eventId });   // ← terceiro argumento
  }

  return eventId;
}
```

> **Atenção:** o `eventID` vai no **terceiro** argumento do `fbq`, fora do objeto de `custom_data`. Colocar dentro do segundo objeto não funciona.

Aplicar em: `trackVehicleView`, `trackLeadSubmission`, `trackContactClick`, `trackCarMatch`, `trackAppraisalSubmit`.

### Critério de aceite da Fase 1

- [ ] Abrir PDP com `?fbclid=teste123` na URL → cookie `_fbc` criado
- [ ] `document.cookie` contém `_fbp` após o pixel inicializar
- [ ] Cada evento no Events Manager mostra um `Event ID` preenchido

---

## Fase 2 — Conversions API (server-side)

Hoje **100% do tracking é browser-side**. Bloqueador de anúncio, Safari/ITP e iOS derrubam uma fatia relevante dos eventos. O CAPI espelha os mesmos eventos pelo servidor.

### 2.1 Variáveis de ambiente novas

```bash
META_PIXEL_ID=1410450786690090
META_CAPI_ACCESS_TOKEN=          # System User token, Events Manager → Configurações
META_CAPI_TEST_EVENT_CODE=       # só em dev; remover em produção
META_GRAPH_API_VERSION=          # conferir a versão corrente na doc do Meta
```

> **Não hardcodar a versão da Graph API.** Verificar qual é a versão estável atual em `developers.facebook.com/docs/graph-api/changelog` no momento da implementação.

### 2.2 Criar `src/lib/meta-capi.ts`

```typescript
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
  eventTime?: number;          // unix seconds; default = agora
  eventSourceUrl?: string | null;
  actionSource?: "website";
  userData: CapiUserData;
  customData?: Record<string, unknown>;
}

export async function sendCapiEvent(event: CapiEvent): Promise<{ ok: boolean; status: number }> {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION;

  if (!pixelId || !token || !version) {
    console.warn("[Meta CAPI] Variáveis de ambiente ausentes; evento ignorado.");
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
    data: [{
      event_name: event.eventName,
      event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      event_source_url: event.eventSourceUrl ?? undefined,
      action_source: event.actionSource ?? "website",
      user_data: userData,
      custom_data: event.customData ?? undefined,
    }],
    ...(process.env.META_CAPI_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE }
      : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${pixelId}/events?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      console.warn(`[Meta CAPI] Erro ${res.status}:`, await res.text().catch(() => ""));
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    console.warn("[Meta CAPI] Falha de rede (não bloqueante):", err);
    return { ok: false, status: 0 };
  }
}
```

### 2.3 Disparar CAPI dentro de `/api/leads`

**Arquivo:** `src/app/api/leads/route.ts`

Este é o ponto ideal: a rota já é server-side, já tem os dados do cliente (nome, email, whatsapp), já resolve `ag_uid` e já tem acesso aos headers.

Inserir **depois** do envio ao webhook n8n (passo 5) e **antes** do retorno, seguindo o mesmo padrão não-bloqueante já usado no arquivo:

```typescript
// 5.5 Meta CAPI — espelha o evento Lead disparado no browser
try {
  await sendCapiEvent({
    eventName: "Lead",
    eventId: body.eventId,               // ← vem do client, mesmo do fbq
    eventSourceUrl: body.eventSourceUrl,
    userData: {
      email: cliente.email,
      phone: rawWhatsapp,
      fbp: body.fbp,
      fbc: body.fbc,
      externalId: resolvedAgUid,
      clientIpAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip"),
      clientUserAgent: request.headers.get("user-agent"),
    },
    customData: {
      content_ids: veiculo?.id ? [String(veiculo.id)] : undefined,
      content_type: "product",
      content_name: veiculo ? `${veiculo.marca} ${veiculo.modelo}` : undefined,
      value: veiculo?.preco,
      currency: "BRL",
    },
  });
} catch (capiError) {
  console.warn("[Meta CAPI] Falha não-bloqueante no lead:", capiError);
}
```

> **Regra do projeto já estabelecida e que deve ser mantida:** falha de integração **nunca** pode bloquear o redirect do cliente para o WhatsApp. O comentário do webhook n8n no arquivo original já diz isso explicitamente — seguir o mesmo padrão.

**Contrato do body:** o cliente passa a enviar `eventId`, `eventSourceUrl`, `fbp` e `fbc` no POST para `/api/leads`. Atualizar os componentes que chamam essa rota (`LeadCaptureModal.tsx`, `PDPClientWrapper.tsx`, `LeadPopup.tsx`, `CarMatch.tsx`, `AutoAvaliacao.tsx`).

### 2.4 Criar `/api/capi` para os demais eventos

Rota genérica para os eventos que não passam por `/api/leads` — principalmente `ViewContent`.

**Arquivo novo:** `src/app/api/capi/route.ts`

- `POST` recebe `{ eventName, eventId, eventSourceUrl, fbp, fbc, externalId, customData }`
- Extrai IP e User-Agent dos headers (nunca confiar no client para isso)
- Chama `sendCapiEvent`
- **Aplicar rate limit com Upstash** — o projeto já usa `@upstash/ratelimit`, seguir o padrão existente
- Whitelist de `eventName`: rejeitar qualquer valor fora da lista permitida
- Retornar `204` sempre que possível, para não vazar informação

> **Segurança:** esta rota é pública. Sem rate limit ela vira vetor de poluição do dataset. Não aceitar `value` arbitrário sem validação.

### Critério de aceite da Fase 2

- [ ] Events Manager → Testar Eventos com `test_event_code`: evento aparece com origem "Servidor"
- [ ] Events Manager → o mesmo evento mostra **"Desduplicado"**, não contagem dobrada
- [ ] Qualidade da Correspondência de Evento (EMQ) do Lead ≥ 6.0
- [ ] Derrubar a rota n8n propositalmente → o lead ainda redireciona para o WhatsApp normalmente

---

## Fase 3 — Google Ads Enhanced Conversions

O `googleAdsId` já é inicializado em `IntegrationsTracker.tsx`, mas não há ação de conversão com dados de usuário.

### 3.1 Pré-requisito no painel

No Google Ads: **Objetivos → Conversões → Configurações → Conversões otimizadas**, ativar e aceitar os termos. Sem isso o `user_data` enviado é descartado silenciosamente.

### 3.2 Enviar `user_data` junto da conversão

**Arquivo:** `src/lib/telemetry.ts`, em `trackLeadSubmission`

```typescript
if (window.gtag && googleAdsId) {
  // Enhanced Conversions: o gtag hasheia no client, enviar em texto puro
  window.gtag("set", "user_data", {
    email: cliente.email || undefined,
    phone_number: formattedPhoneE164 || undefined,  // formato +5541999998888
  });

  window.gtag("event", "conversion", {
    send_to: `${googleAdsId}/${conversionLabel}`,
    value: vehicle.preco,
    currency: "BRL",
    transaction_id: eventId,   // mesmo ID do Meta, evita conversão duplicada
  });
}
```

> **`conversionLabel` precisa vir das configurações**, não hardcoded. Adicionar `googleAdsConversionLabel` ao `site_settings`, no mesmo padrão de `metaPixelId` e `ga4Id`.

> **Formato do telefone difere entre plataformas:** Google exige E.164 **com** `+` (`+5541999998888`); Meta exige **sem** `+` (`5541999998888`). Não reaproveitar a mesma string entre os dois.

### 3.3 Feed do Google Merchant / páginas para DSA

O `api/feed/xml/route.ts` já gera o feed do catálogo. Verificar se o mesmo feed atende o formato de página do Google Ads para as campanhas DSA — se não, criar uma rota irmã.

> Contexto: há uma migração DSA → AI Max prevista para fevereiro/2027. Manter o feed desacoplado da campanha facilita essa transição.

### Critério de aceite da Fase 3

- [ ] Google Ads → Conversões: status "Conversões otimizadas ativas, recebendo dados"
- [ ] Diagnóstico de tag sem alerta de "dados de usuário ausentes"

---

## Fase 4 — Consentimento (decisão de produto, não só técnica)

### Situação atual

`IntegrationsTracker.tsx` e todas as funções de `telemetry.ts` fazem:

```typescript
const consent = localStorage.getItem("ag_cookie_consent");
if (consent !== "accepted") return;
```

Isso bloqueia **100%** do rastreamento para quem não clica "aceitar" — incluindo quem simplesmente ignora o banner. É a postura mais conservadora possível diante da LGPD, e o custo é que essa fatia de visitantes fica invisível para medição.

### Alternativa

**Consent Mode v2** (Google) e **Limited Data Use** (Meta) permitem enviar sinais sem cookies para quem não consentiu, com conversões modeladas em vez de apagão total.

```typescript
// Google Consent Mode v2 — declarar ANTES de qualquer gtag('config')
gtag("consent", "default", {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
  wait_for_update: 500,
});

// Ao aceitar:
gtag("consent", "update", {
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
  analytics_storage: "granted",
});
```

### ⚠️ Esta fase não deve ser implementada sem decisão explícita

A escolha entre bloqueio total e consent mode envolve apetite de risco jurídico do cliente, não só engenharia. **Levar a quem cuida do jurídico da Motors Store antes de mexer.** Se não houver definição, manter o comportamento atual (bloqueio total), que é o mais conservador.

---

## Resumo da ordem de execução

| Fase | Escopo | Depende de | Impacto | Situação |
|---|---|---|---|---|
| **0** | `content_type`, Pixel ID, `content_ids` no Lead | — | Destrava o catálogo | ✅ feita |
| **1** | `event_id`, `_fbp`/`_fbc`/`fbclid` | Fase 0 | Base para CAPI | ✅ feita |
| **2** | CAPI em `/api/leads` e `/api/capi` | Fase 1 | Recupera eventos perdidos | ✅ feita no código |
| **3** | Enhanced Conversions | Fase 1 | Otimização no Google | ⚠️ código pronto, **inerte** |
| **4** | Consent mode | Decisão jurídica | Cobertura de medição | ⏸️ parada, por decisão |
| **5** | Espelhar `Contact`, `Search` e `CompleteRegistration` no CAPI | Fase 2 | Fecha a cobertura server-side | ✅ feita — **conferir Upstash antes de publicar** |

---

## Auditoria de 2026-08-06

Conferência fase a fase do código contra esta spec, feita depois do redesign
Modernist (que trocou home, catálogo, PDP, destaques, contato, Profiler e
Avaliação de lugar).

### O que já está de pé

- **Fase 0** — `META_CONTENT_TYPE` exportado e usado em `ViewContent` e `Lead`;
  `content_ids` presente no `Lead`; `console.warn` explícito quando o
  `metaPixelId` está vazio. O `metaPixelId` **está configurado** em
  `site_settings` com `1410450786690090`.
- **Fase 1** — `tracking-identity.ts` existe; `_fbc` é persistido por 90 dias a
  partir do `fbclid`, fora do gate de consentimento (só a captura do
  parâmetro; o evento continua gated); as cinco funções de tracking passam
  `eventID` no **terceiro** argumento do `fbq`.
- **Fase 2** — `meta-capi.ts` com hash SHA-256 de e-mail e telefone; `Lead`
  espelhado dentro de `/api/leads`; `/api/capi` com whitelist de cinco eventos,
  IP e User-Agent lidos dos headers, resposta sempre `204` e rate limit Upstash
  no `proxy.ts`. As seis superfícies que postam em `/api/leads` mandam
  `eventId`, `fbp`, `fbc` e `eventSourceUrl`.

### ⚠️ Bloqueio ativo: Fase 3 não está rodando

O código de Enhanced Conversions está correto em `telemetry.ts`, mas a guarda é:

```typescript
if (window.gtag && options?.googleAdsId && options?.googleAdsConversionLabel) {
```

e **os dois campos estão vazios** em `site_settings`. Nenhuma conversão chega
ao Google Ads hoje — nem otimizada, nem comum. Não é defeito de código: é
preenchimento no painel.

**Ação:** cadastrar `googleAdsId` e `googleAdsConversionLabel` em
Configurações → Integrações. Sem os dois, o bloco inteiro é pulado em silêncio.

### Verificar no Vercel

Não dá para conferir a partir do repositório; conferir no painel do projeto:

- `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_GRAPH_API_VERSION` —
  sem os três, `sendCapiEvent` desiste e loga um `console.warn`.
- `META_CAPI_TEST_EVENT_CODE` — precisa estar **vazia** em produção.
- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` — sem elas o rate
  limit de `/api/capi` é ignorado (regra 6 abaixo).

### Corrigido nesta rodada

- **Rodapé sem `Contact`.** Telefone e WhatsApp do rodapé aparecem em todas as
  páginas e eram os únicos CTAs de contato do site que não disparavam evento.
  Passam a chamar `trackContactClick` com os rótulos `Rodapé - WhatsApp` e
  `Rodapé - Telefone`. Evento adicionado, nenhum renomeado — regra 7 do
  CLAUDE.md preservada.

---

## Fase 5 — Espelhar os demais eventos no CAPI

**Implementada em 2026-08-06.** Os cinco eventos agora chegam ao servidor.

O POST foi embrulhado numa função só, `espelharNoCapi` em `telemetry.ts`,
chamada de dentro de `trackContactClick`, `trackCarMatch` e
`trackAppraisalSubmit`. Embrulhar na própria função de tracking, em vez de
repetir o `fetch` em cada call site, é o que garante que as 7 superfícies de
`Contact` estejam cobertas sem sete chances de esquecer uma.

| Evento | Onde é espelhado |
|---|---|
| `Lead` | dentro de `/api/leads` — já é servidor e tem e-mail e telefone para hashear |
| `ViewContent` | no `PDPClientWrapper`, que conhece o veículo inteiro para montar o `custom_data` |
| `Contact`, `Search`, `CompleteRegistration` | `espelharNoCapi`, a partir de `telemetry.ts` |

Dois detalhes que valem registro:

- O `fetch` usa **`keepalive: true`**. O clique de contato costuma navegar
  para fora (WhatsApp em outra aba, `tel:` no discador); sem isso o POST
  morre junto com a página e o evento se perde justamente no clique que mais
  importa.
- IP e User-Agent **não** vão no corpo. O servidor lê dos headers, seguindo a
  regra 4 — cliente não é fonte confiável para isso.

### ⚠️ Antes de publicar

`Contact` é o evento mais frequente do site. **Confirmar que
`UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` estão preenchidas no
Vercel** — sem elas o rate limit de `/api/capi` é ignorado (o `proxy.ts` loga
o bypass e segue), e a rota fica exposta com volume muito maior que antes.

**Critério de aceite:** no Events Manager, `Contact` aparece com origem
"Servidor" e marcado como **"Desduplicado"**, não com contagem dobrada.

---

## Regras gerais para a implementação

1. **Nada de integração bloqueante.** Falha de pixel, CAPI ou webhook nunca pode travar o fluxo do usuário. O padrão `try/catch` + `console.warn` já usado em `/api/leads` é a referência.
2. **Não inventar IDs.** `content_ids` sempre a partir de `car.id` — a mesma fonte do feed. Se divergirem, a correspondência volta a zero.
3. **Não hardcodar credenciais.** Pixel ID, labels de conversão e tokens vêm de `site_settings` (Supabase) ou de variáveis de ambiente, seguindo o padrão de `ga4Id` / `metaPixelId`.
4. **Não confiar no client para IP e User-Agent.** Extrair sempre dos headers no servidor.
5. **Não enviar PII sem hash para o Meta.** E-mail e telefone sempre SHA-256, normalizados. O Google Ads é a exceção: o `gtag` hasheia no client.
6. **Rate limit em rota pública.** `/api/capi` precisa do Upstash, seguindo o padrão já presente no projeto.
7. **Testar com `test_event_code` antes de publicar**, e removê-lo em produção.

---

## Referências de configuração

| Item | Valor |
|---|---|
| Meta Pixel ID | `1410450786690090` |
| Meta Catalog ID | `617519794775501` |
| Meta Business ID | `1318713333562215` |
| Ad Account ID | `802008949148808` |
| Página Facebook | `783652398162743` |
| GA4 (fallback no código) | `G-CZ4B4RYF61` |
| GA4 (em uso, via `site_settings`) | `G-KBL1MFN9E3` |
| Google Ads ID | **não cadastrado** — ver Fase 3 |
| Label de conversão do Google Ads | **não cadastrado** — ver Fase 3 |

> **Pendência conhecida no catálogo:** existem 3 feeds primários no mesmo catálogo (`Estoque_140726`, `estoque atualizado Motors`, `Novo feed de dados para Estoque Motors Store`) e o diagnóstico acusa erro de upload. Consolidar em um único feed primário apontando para `api/feed/xml` com atualização agendada. Não faz parte desta spec, mas afeta o resultado final.
