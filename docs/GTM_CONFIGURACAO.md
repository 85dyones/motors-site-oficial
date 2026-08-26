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

## 0.5 · O container já existe — o que falta nele

> **Estado em 2026-08-25.** O container **`GTM-TB665RN9`** ("Motors Store -
> dataLayer + Ads conversions") foi criado com 9 tags GA4, 2 conversões do
> Google Ads, 9 gatilhos e 13 variáveis. Os **nomes dos 9 eventos batem
> exatamente** com o que `src/lib/dataLayer.ts` empurra, e `view_vehicle` já
> chega com `vehicle.*` e `ecommerce.items` no formato certo.
>
> As seções 1 a 5 abaixo descrevem a configuração completa, para referência.
> Esta seção lista só o que **falta**, na ordem de custo.

> **Conferido em 26/08 contra a v3 do export** (`gtm-motorsstore-import-v3.json`):
> os **10 eventos** e os **25 caminhos de variável** batem exatamente com o que
> `src/lib/dataLayer.ts` publica — nenhum sobrando, nenhum faltando. Os itens 1
> e 2 abaixo **foram resolvidos na v3**. Restou um, novo, no item 3.

### ~~1 · O filtro do `pos_lead`~~ — RESOLVIDO na v3

O gatilho `ev - click_whatsapp (conversao)` existe, com a condição
`{{dlv - pos_lead}}` **EQUALS** `true` **negada**, e `Ads - conv_whatsapp`
passou a disparar nele. O clique pós-lead deixa de virar conversão. ✅

### ~~2 · `curadoria` na tabela de valor~~ — RESOLVIDO na v3

`js - valor do lead` ganhou `curadoria` nas duas tabelas (taxa `0.10`, fallback
`420`) e passou a cair para o `vehicle_price` plano quando o `vehicle.price`
não existe. ✅

### ⚠️ 3 · O remarketing dinâmico nunca vai carregar o item

`Ads - Remarketing dinamico` dispara em **`ev - page_context`** e lê
`dynx_itemid` de `{{dlv - vehicle.id}}`.

`page_context` é o evento que **zera** o veículo — é ele que impede o carro de
uma ficha de vazar para a página seguinte (ver `pushCamadaGlobal`). Quando a
tag dispara, `vehicle` acabou de virar `null` no mesmo push. **`dynx_itemid`
sai sempre vazio**, e sem item não há remarketing dinâmico: só o `dynx_pagetype`
chega.

Isso não depende de ordem de execução — a limpeza está dentro do próprio evento
em que a tag dispara.

**Correção, uma tela:** em `Ads - Remarketing dinamico` → Acionamento,
**acrescentar** `ev - view_vehicle` ao lado de `ev - page_context`. Na ficha a
tag passa a disparar duas vezes: a primeira com o tipo de página, a segunda já
com o item. Tag de remarketing não é conversão, então disparar duas vezes não
distorce nada.

### Uma observação, não um problema

`GA4 - view_vehicle` está com `sendEcommerceData: false` e a variável
`ecommerce.items` saiu do container. O site continua publicando o espelho de
e-commerce em `pushVeiculo` — de propósito: é barato e volta a servir no dia em
que a opção for religada. Enquanto isso, os relatórios de item do GA4 não se
alimentam do `view_vehicle`. Se o objetivo for tê-los, é só religar a opção na
tag; o dado já está lá.

### Anexo · como o filtro do `pos_lead` foi montado (histórico)

Até a v2, a tag **`Ads - conv_whatsapp`** estava no gatilho cru de `click_whatsapp`. Na
ficha, no pop-up e na avaliação o site abre o WhatsApp **assim que o lead é
registrado**: o mesmo envio dispara `generate_lead` e, logo depois,
`click_whatsapp`. As duas viram conversão. Ver a seção §2 abaixo para o porquê
isso é o pior tipo de erro de medição.

Três telas no painel do GTM:

1. **Variáveis → Nova → Variável da camada de dados.** Nome `dlv - pos_lead`,
   nome da variável `pos_lead`, versão 2. Salvar.
2. **Acionadores → Novo → Evento personalizado.** Nome
   `ev - click_whatsapp (conversão)`, nome do evento `click_whatsapp`. Marcar
   *Alguns eventos personalizados* e definir a condição
   **`dlv - pos_lead` — não é igual a — `true`**. Salvar.
3. **Tags → `Ads - conv_whatsapp` → Acionamento.** Remover
   `ev - click_whatsapp` e escolher `ev - click_whatsapp (conversão)`. Salvar.

O gatilho cru continua servindo `GA4 - click_whatsapp`: para relatório de
comportamento, o clique pós-lead **é** informação. O que ele não pode virar é
conversão.

### 2 · `curadoria` na tabela de valor

`js - valor do lead` conhece `proposta`, `financiamento`, `avaliacao` e
`contato`. O site também emite **`curadoria`** (`TipoDeLead`, em
`src/lib/dataLayer.ts`), que hoje cai no fallback de R$ 100. Acrescentar às duas
tabelas do script — sugestão: taxa `0.10`, fallback `420`, iguais a `proposta`,
porque é lead de mesma intenção.

### 3 · Três variáveis novas de veículo (§11.1 do plano)

O `view_vehicle` passou a levar mais três campos. Criar como **Variável da
camada de dados**, versão 2:

| Nome no GTM | Variável | Para quê |
|---|---|---|
| `dlv - vehicle.price_range` | `vehicle.price_range` | Público de remarketing por faixa — devolve o mesmo `slug` de `/estoque/ate-60-mil` |
| `dlv - vehicle.owners` | `vehicle.owners` | `donos_anteriores` |
| `dlv - vehicle.has_report` | `vehicle.has_report` | O laudo está na ficha |

`price_range` é o que mais muda lance: sem ele o Ads não separa quem olhou
carro de entrada de quem olhou o topo da vitrine.

⚠️ **`has_report` diz que o DOCUMENTO está na ficha, não que o exame
aconteceu.** `conteudo-seo/POSICIONAMENTO.md` registra a confirmação do dono em
17/08: **todos** os veículos passam por perícia cautelar, e `laudo_pericia`
vazio é falha de lançamento. Por isso o campo **só sai quando há laudo** — nunca
como `false`. Não montar público de "sem laudo" com ele.

### 4 · Conversões otimizadas em `Ads - conv_lead` (quando der)

A tag não manda e-mail nem telefone. **Nada se perdeu** — o caminho equivalente
no código nunca esteve ativo, porque `googleAdsId` e `googleAdsConversionLabel`
seguem vazios no painel do site —, mas dado de identidade com hash melhora
bastante o casamento de conversão no Ads. Fica como próximo passo, não como
pendência.

### O que o §11.1 pediu e NÃO deu para entregar

- **`days_in_stock`** — o mais valioso dos cinco, e o único que depende de dado
  que não existe. `estoque_motors` tem `last_seen_at` e
  `conteudo_atualizado_em`, mas nenhum **`first_seen_at`**: não há como saber
  há quantos dias o veículo entrou. Usar `last_seen_at` daria o oposto (para
  carro disponível é sempre ~hoje). Precisa de coluna nova e de o sincronizador
  gravá-la no primeiro encontro — mudança de schema e de n8n, não de front-end.
  Enquanto não existir, a alocação de verba por encalhe do §1.2 fica sem base.
- **`store_id`** — fora de propósito. O dono confirmou em 25/08 que a operação
  é **uma loja só**, na Rua Ernesto Piazzetta. O §10.3 do plano menciona uma
  segunda unidade sem perfil; a decisão do dono é a que vale. Se um dia houver
  filial de verdade, o campo entra aqui e nos eventos de contato.

### A ordem de publicar

Aplicar os itens 1 e 2 e **publicar o container ANTES** de preencher o `gtmId`
no painel do site. Enquanto o campo está vazio o container não é carregado
(`IntegrationsTracker`), então publicar não muda nada em produção — e o filtro
do `pos_lead` precisa estar de pé antes do primeiro clique medido.

### ⚠️ O interruptor do handoff — e por que ele é separado do ID

Em **26/08** este passo custou medição. O container estava configurado no
painel e **carregando** em produção, mas **vazio** — importado sem as tags. O
código inferia do `gtmId` que podia se recolher, cedeu a vez para quem não
media nada, e o `generate_lead` parou de chegar ao GA4.

**Container carregando ≠ container medindo**, e de dentro do site não dá para
distinguir os dois. Só quem publicou sabe.

Por isso o painel tem, além do ID, a caixa **"O container já publica os
eventos"** (`gtmAssumeEventos`, default desmarcada):

| Estado | Quem manda `generate_lead` e a conversão do Ads |
|---|---|
| desmarcada | o site, por `gtag` — como sempre foi |
| marcada | o container |

**Marcar somente depois** de importar as tags, publicar e conferir no Modo de
Visualização que os eventos disparam. Preencher o ID sozinho não muda nada além
de carregar o container.

### O que o site faz sozinho a partir daí

`src/lib/telemetry.ts` **cede a vez ao container** no instante em que a caixa
acima é marcada: para de mandar `generate_lead` e a conversão do Ads por
`gtag`, e deixa o `dataLayer` alimentando as tags. Não há deploy a coordenar
com a edição do painel — a regra vive no código, em
`containerAssumeOsEventos()` (`src/lib/dataLayer.ts`).

⚠️ **Não preencher `googleAdsId` nem `googleAdsConversionLabel` no painel do
site.** Com o container ligado eles são redundantes; o código os ignora, mas
são o gesto de duas linhas que reativaria o caminho paralelo se a regra acima
for removida algum dia.

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
| `dlv - lead_id` | `lead_id` |
| `dlv - vehicle.price_range` | `vehicle.price_range` |
| `dlv - vehicle.owners` | `vehicle.owners` |
| `dlv - vehicle.has_report` | `vehicle.has_report` |
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

1. **Tag Assistant**: abrir o site e confirmar que existe **uma única**
   configuração do GA4 `G-KBL1MFN9E3` na página. Duas = todo `page_view` em
   dobro.
   *Não confundir com as 9 tags de evento do container:* elas usam
   `measurementIdOverride` e não criam uma segunda configuração. A única
   configuração é a do código (`IntegrationsTracker`, via `gtag('config', …)`),
   e é ela que manda o `page_view`.
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

## 7. Quem manda cada evento — atualizado em 2026-08-25

> A versão anterior desta seção dizia que os eventos ficavam fora do GTM e que a
> migração exigiria "remover as tags do código **no mesmo deploy** em que o
> container assume — janela em que qualquer descompasso zera a medição".
> O diagnóstico estava certo; a conclusão, não. **A janela não precisa existir.**

O problema real é que **quem liga o container é o dono, no painel** — o
`IntegrationsTracker` só injeta o GTM quando `companySettings.gtmId` existe, e
esse valor vem do banco, não do repositório. Um deploy não sabe quando isso vai
acontecer, então as duas saídas óbvias erram para lados opostos:

| | |
|---|---|
| apagar o `gtag` no deploy | GA4 sem `generate_lead` até o dono digitar o ID |
| manter os dois | tudo em dobro a partir do segundo em que ele digitar |

A saída é o código **medir enquanto o container está ausente e sair de cena
sozinho quando ele chega** — `containerAssumeOsEventos()`, em
`src/lib/dataLayer.ts`. Sem lacuna, sem sobreposição, e sem sincronizar deploy
com edição de painel.

**O container manda** (quando o `gtmId` está preenchido): `generate_lead`,
`click_whatsapp`, `click_to_call`, `click_directions`, `view_vehicle`,
`financing_simulation`, `view_specs`, `form_start`, `view_gallery`, e as duas
conversões do Google Ads.

**O código manda, sempre:** o Meta Pixel e a CAPI, intocados — e três eventos
GA4 que o container não tem: `view_item`, `complete_registration` e `search`.
`view_item` fica de propósito: é evento recomendado do GA4 e sustenta relatório
de item e público de remarketing que `view_vehicle`, sendo nome customizado,
não sustenta.

**O código manda enquanto o container não estiver ligado:** `generate_lead` e a
conversão do Ads. É a rede de segurança — e ela se recolhe sozinha.
