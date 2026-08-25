# Configuração do Google Tag Manager — Motors Store

Escrito em 2026-08-25, junto com a camada de dados. Este documento é para ser
**copiado para dentro do GTM**, não lido e interpretado: cada nome aqui é o
nome exato que o site emite.

A camada em si está em `src/lib/dataLayer.ts`, travada por
`tests/camada-de-dados.test.ts`. O contrato de tracking mais amplo (Pixel, CAPI,
conversões otimizadas) está em `TRACKING_SPEC.md`.

---

## 0. Antes de qualquer tag

**O site já carrega o container** — falta só o ID. Painel → Configurações →
Dados da concessionária → **GTM**. Aceita o ID puro (`GTM-XXXXXXX`) ou o snippet
inteiro colado; o código extrai só o ID (`sanitizeGtmId`, em
`src/components/IntegrationsTracker.tsx`).

> ⚠️ **Não configure GA4, Google Ads nem Meta Pixel DENTRO do container.**
> Os três já são carregados pelo `IntegrationsTracker`, no código. Duplicar
> qualquer um deles conta todo `page_view` em dobro e inutiliza a propriedade.
> O GTM aqui serve para **eventos** e para tags de terceiros — não para
> reinstalar o que já está instalado.

O container só carrega **depois do aceite de cookies** (LGPD). Os pushes da
camada acontecem antes, e isso é de propósito: o GTM processa a fila que já
existe no `dataLayer` quando inicializa, então o contexto anterior ao aceite não
se perde.

---

## 1. Variáveis da camada de dados

Criar todas como **Variável da camada de dados**, versão 2, com o nome exato:

| Nome sugerido no GTM | Nome da variável de camada de dados |
|---|---|
| `dlv - page_type` | `page_type` |
| `dlv - store_city` | `store_city` |
| `dlv - stock_count` | `stock_count` |
| `dlv - vehicle.id` | `vehicle.id` |
| `dlv - vehicle.name` | `vehicle.name` |
| `dlv - vehicle.brand` | `vehicle.brand` |
| `dlv - vehicle.model` | `vehicle.model` |
| `dlv - vehicle.price` | `vehicle.price` |
| `dlv - vehicle.body_type` | `vehicle.body_type` |
| `dlv - vehicle.model_year` | `vehicle.model_year` |
| `dlv - lead_type` | `lead_type` |
| `dlv - form_id` | `form_id` |
| `dlv - whatsapp_location` | `whatsapp_location` |
| `dlv - call_location` | `call_location` |
| `dlv - pos_lead` | `pos_lead` |
| `dlv - vehicle_id` | `vehicle_id` |
| `dlv - vehicle_price` | `vehicle_price` |
| `dlv - installments` | `installments` |
| `dlv - down_payment` | `down_payment` |
| `dlv - images_viewed` | `images_viewed` |
| `dlv - directions_source` | `directions_source` |
| `dlv - ecommerce.items` | `ecommerce.items` |

`vehicle_id` e `vehicle.id` são coisas diferentes: o primeiro vem dos eventos de
interação (clique, lead), o segundo do objeto publicado por `view_vehicle`.

---

## 2. Gatilhos

Todos do tipo **Evento personalizado**, com o nome do evento exato.

| Gatilho | Evento | Condição extra |
|---|---|---|
| `ev - page_context` | `page_context` | — |
| `ev - view_vehicle` | `view_vehicle` | — |
| `ev - click_whatsapp` | `click_whatsapp` | — |
| **`ev - click_whatsapp (conversão)`** | `click_whatsapp` | **`dlv - pos_lead` NÃO é igual a `true`** |
| `ev - click_to_call` | `click_to_call` | — |
| `ev - generate_lead` | `generate_lead` | — |
| `ev - financing_simulation` | `financing_simulation` | — |
| `ev - form_start` | `form_start` | — |
| `ev - view_gallery` | `view_gallery` | — |
| `ev - view_specs` | `view_specs` | — |
| `ev - click_directions` | `click_directions` | — |

### ⚠️ O gatilho de conversão do WhatsApp e o `pos_lead`

Na ficha, no pop-up, na curadoria e na avaliação, o site abre o WhatsApp com a
mensagem pronta **assim que o lead é registrado**. O mesmo envio dispara
`generate_lead` e, logo depois, `click_whatsapp`.

Se os dois virarem conversão principal sem filtro, **cada lead conta duas vezes
e o CPA aparente cai pela metade**. É o pior tipo de erro de medição, porque
parece boa notícia — e o algoritmo de lances passa a comprar com base num
retorno que não existe.

Esses cliques carregam `pos_lead: true`. Use o gatilho
`ev - click_whatsapp (conversão)` para a conversão do Ads, e o
`ev - click_whatsapp` cru só para relatório de comportamento.

---

## 3. Tags de evento GA4

Tipo **Evento do Google Analytics**, ID de medição `G-KBL1MFN9E3` (o mesmo do
painel — **não criar propriedade nova**, o histórico está nessa).

| Tag | Gatilho | Nome do evento | Parâmetros |
|---|---|---|---|
| `GA4 - view_vehicle` | `ev - view_vehicle` | `view_vehicle` | `vehicle_id`, `vehicle_price`, `body_type` |
| `GA4 - click_whatsapp` | `ev - click_whatsapp` | `click_whatsapp` | `whatsapp_location`, `pos_lead`, `vehicle_id` |
| `GA4 - click_to_call` | `ev - click_to_call` | `click_to_call` | `call_location` |
| `GA4 - generate_lead` | `ev - generate_lead` | `generate_lead` | `lead_type`, `form_id`, `vehicle_price` |
| `GA4 - financing_simulation` | `ev - financing_simulation` | `financing_simulation` | `vehicle_id`, `installments`, `down_payment` |
| `GA4 - form_start` | `ev - form_start` | `form_start` | `form_id` |
| `GA4 - view_gallery` | `ev - view_gallery` | `view_gallery` | `vehicle_id`, `images_viewed` |
| `GA4 - click_directions` | `ev - click_directions` | `click_directions` | `directions_source` |

Marcar como **evento-chave** no GA4 apenas: `click_whatsapp`, `click_to_call`,
`generate_lead` e `financing_simulation`.

---

## 4. Conversões no Google Ads

| Ação de conversão | Gatilho | Tipo | Contagem | Janela | Valor |
|---|---|---|---|---|---|
| WhatsApp | `ev - click_whatsapp (conversão)` | **Principal** | Uma | 30 dias | variável |
| Lead — proposta | `ev - generate_lead` + `lead_type` = `proposta` | **Principal** | Uma | 30 dias | variável |
| Lead — avaliação | `ev - generate_lead` + `lead_type` = `avaliacao` | **Principal** | Uma | 30 dias | fixo |
| Lead — contato/curadoria | `ev - generate_lead` + demais `lead_type` | Secundária | Uma | 30 dias | fixo |
| Clique para ligar | `ev - click_to_call` | **Principal** | Uma | 30 dias | fixo |
| Simulação de financiamento | `ev - financing_simulation` | Secundária | Uma | 30 dias | fixo, menor |
| Como chegar | `ev - click_directions` | Secundária | Uma | 7 dias | fixo, menor |

**Regra de ouro:** só macro-evento vira Principal. Marcar `view_vehicle`,
`view_gallery`, `view_specs` ou `form_start` como conversão ensina o algoritmo a
comprar curioso.

**Contagem sempre "Uma"** nesta vertical: uma pessoa que manda três mensagens é
um lead, não três.

---

## 5. Remarketing dinâmico

Tag de **Remarketing do Google Ads**, com:

| Parâmetro | Valor |
|---|---|
| `dynx_itemid` | `{{dlv - vehicle.id}}` |
| `dynx_pagetype` | `{{js - dynx pagetype}}` |
| `dynx_totalvalue` | `{{dlv - vehicle.price}}` |

Variável `js - dynx pagetype` (JavaScript personalizado):

```js
function () {
  var mapa = {
    home: "home",
    inventory: "searchresults",
    brand: "searchresults",
    model: "searchresults",
    bodytype: "searchresults",
    pricerange: "searchresults",
    highlight: "searchresults",
    geo: "searchresults",
    vehicle_detail: "offerdetail",
    appraisal: "conversionintent",
    financing: "conversionintent",
    advisor: "conversionintent",
    contact: "conversionintent"
  };
  return mapa[{{dlv - page_type}}] || "other";
}
```

O `dynx_itemid` **precisa ser idêntico** ao `<g:id>` do feed
(`/api/feed/xml`) e ao `sku` do JSON-LD da ficha. Os três saem da mesma coluna
do estoque; se algum dia divergirem, o anúncio dinâmico sai em branco.

---

## 6. Checklist antes de publicar o contêiner

1. **Tag Assistant**: abrir o site e confirmar que existe **uma única** tag do
   GA4 `G-KBL1MFN9E3` na página. Duas = tudo contado em dobro.
2. **Modo de visualização**: percorrer home → `/estoque` → ficha → clicar no
   WhatsApp e conferir, na ordem: `page_context` (com o `page_type` certo),
   `stock_count`, `view_vehicle` (com `ecommerce` zerado antes) e
   `click_whatsapp`.
3. **Enviar um lead de teste pela ficha** e confirmar que o `click_whatsapp`
   seguinte vem com `pos_lead: true` — e que ele **não** aciona o gatilho de
   conversão.
4. **GA4 → DebugView**: os eventos-chave aparecendo com os parâmetros.
5. **Google Ads → Conversões**: status "Ativa, recebendo conversões" em até 24h.
6. No dia seguinte, comparar o volume de `page_view` com a média dos 7 dias
   anteriores. Variação maior que ±10% indica duplicação ou perda.

---

## 7. O que continua fora do GTM, e por quê

`gtag.js`, o Google Ads e o Meta Pixel seguem carregados pelo código
(`IntegrationsTracker`), com os eventos de negócio disparados por
`src/lib/telemetry.ts` e espelhados na CAPI. A migração completa para o GTM é
possível, mas exige remover as tags do código **no mesmo deploy** em que o
container assume — janela em que qualquer descompasso zera a medição. Enquanto
não houver motivo forte, os dois caminhos convivem: o código garante o mínimo,
o container dá autonomia para o resto.
