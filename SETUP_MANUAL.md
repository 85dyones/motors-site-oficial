# Setup Manual: Tracking Meta/Google Ads

Guia passo a passo para finalizar a configuração após o código (2026-07-31).

---

## 1. Variáveis de Ambiente (Produção)

### 1.1 Obter `META_CAPI_ACCESS_TOKEN`

1. Acesse **Facebook Events Manager**: https://business.facebook.com/events_manager
2. No menu esquerdo, vá para **Configurações** (ou Settings)
3. Clique em **Conversions API** (ou "Conversions API Settings")
4. Procure por **Gerar token de acesso** (Generate Access Token)
5. **Importante**: Use um token de **System User** (não pessoal)
   - Se não tiver um System User, crie em **Configurações de negócios** → **Usuários do sistema**
   - O System User precisa ter permissão **Admin** na conta de negócios
6. Copie o token gerado (será mostrado uma única vez)
7. Cole em `.env.local` (produção) como:
   ```
   META_CAPI_ACCESS_TOKEN=<token_aqui>
   ```

### 1.2 Confirmar `META_GRAPH_API_VERSION`

1. Visite: https://developers.facebook.com/docs/graph-api/changelog
2. Procure a versão **estável atual** (stable release)
   - Em 07/2026 era `v25.0`; pode ter avançado para `v26.0` ou mais
3. Copie a versão e confirme em `.env.local`:
   ```
   META_GRAPH_API_VERSION=v25.0
   ```
   (substitua `v25.0` pela versão atual se diferente)

### 1.3 Confirmar `META_PIXEL_ID`

1. Em Facebook Events Manager, clique no seu Pixel (no menu esquerdo)
2. Procure por **Configurações do Pixel** → **ID do Pixel**
3. Copie o ID (ex: `1410450786690090`)
4. Confirme que este ID também está em **Supabase** (`site_settings.company.metaPixelId`):
   - Acesse seu painel admin do Motors
   - Vá para **Configurações** → **Integração Meta**
   - Confirme o Pixel ID lá
   - Se vazio, preencha com o ID correto

### 1.4 Outros env vars

Todos os demais já devem estar configurados (Supabase, Turnstile, n8n, Upstash). Confira em `.env.example` se algo não foi preenchido.

---

## 2. Google Ads: Ativar Conversões Otimizadas

### 2.1 Habilitar Enhanced Conversions

1. Acesse sua conta **Google Ads**: https://ads.google.com/
2. Clique no ícone de engrenagem ⚙️ (Ferramentas) → **Configurações**
3. No menu esquerdo, procure **Conversões**
4. Clique em **Resumo de conversão** (Conversion Summary) ou **Configurações de conversão**
5. Procure por **Conversões otimizadas** (Enhanced Conversions) ou **Dados do usuário**
6. Clique em **Ativar** (Enable)
7. Leia e aceite os termos (LGPD-compliance)
8. Salve

**Ou via UI direta:**
- Meu Negócio → Objetivos → Conversões → Configurações (Settings) → Enhanced Conversions → Ativar

### 2.2 Confirmar `googleAdsConversionLabel`

1. Na mesma página de **Conversões**, procure a conversão que você quer rastrear
2. Copie o **Rótulo de conversão** (Conversion Label) — é um código tipo `AW-123456789/abcDefg_HiJk-LMnOp`
3. Acesse seu painel admin do Motors
4. Vá para **Configurações** → **Integração Google Ads**
5. Procure o campo `googleAdsConversionLabel`
6. Se vazio, preencha com o label copiado
7. Salve

---

## 3. Verificar Configurações no Painel Admin (motors-site-oficial)

### 3.1 Acessar as Configurações

1. Abra o site Motors (produção ou staging)
2. Faça login como admin
3. Vá para **Configurações** (Settings)
4. Procure a seção **Integração** ou **Tracking**

### 3.2 Campos Críticos

Confirme que **todos** estão preenchidos:

| Campo | Obrigatório? | Onde obter | Valor esperado |
|-------|-------------|----------|-----------------|
| `metaPixelId` | ✅ Sim | Facebook Events Manager → Pixel ID | `1410450786690090` ou similar |
| `googleAdsId` | ✅ Sim | Google Ads → Ferramentas → Configurações → Conta | `AW-123456789` |
| `googleAdsConversionLabel` | ✅ Sim | Google Ads → Conversões → Rótulo | `AW-123456789/abcDefg_HiJk-LMnOp` |
| `ga4Id` | ✅ Sim | Google Analytics 4 → Admin → Propriedade → ID da propriedade | `G-CZ4B4RYF61` (padrão) |
| `whatsappRaw` | ✅ Sim | Seu número WhatsApp da empresa | `5511999999999` (sem "+" nem formatação) |

Se qualquer campo estiver vazio:
- Localize o valor (passo anterior)
- Edite o campo no painel
- Salve/Submit

---

## 4. Testar Cada Fase

### 4.1 Teste de Consentimento (Pré-requisito)

Antes de qualquer teste, o site deve estar com consentimento **ativo**:

1. Abra o site: https://motors-site-oficial.vercel.app/ (ou seu domínio)
2. Você deve ver um banner de **consentimento LGPD** (cookie consent)
3. Clique em **Aceitar** (ou similar)
4. Abre o DevTools (F12) → Console
5. Execute:
   ```javascript
   localStorage.getItem("ag_cookie_consent")
   ```
   Resultado esperado: `"accepted"`

Se retornar `null` ou `"rejected"`, o rastreamento não vai funcionar. Confirme que o banner está funcionando e que você aceitou.

### 4.2 Fase 0: Catálogo e content_type

**O quê testar**: ViewContent event chega ao Meta Pixel com `content_type` e `content_ids`.

1. Abra **Facebook Events Manager**
2. Vá para seu Pixel → **Visualizar dados em tempo real** (Real-time data)
3. Abra uma **página de produto (PDP)** no site
4. Espere 5-10 segundos
5. Em Events Manager, você deve ver um evento **ViewContent** com:
   - `content_type`: "product"
   - `content_ids`: ["ID_do_veiculo"] ou similar

**Se não aparecer**:
- Confirmou consentimento? (passo 4.1)
- Pixel ID está correto? (seção 2.2)
- Console mostra erros? (F12 → Console)

---

### 4.3 Fase 1: event_id, _fbp, _fbc

**O quê testar**: Lead event tem `event_id` único, cookies `_fbp`/`_fbc` presentes.

1. Abra **DevTools** (F12) → **Aplicativo** (Application) → **Cookies**
2. Procure por `_fbp` e `_fbc`
   - `_fbp`: deve existir (criado automaticamente pelo Meta Pixel)
   - `_fbc`: pode ser criado automaticamente ou vir de URL parameter `fbclid`
3. Abra **Console**, execute:
   ```javascript
   document.cookie
   ```
   Procure por `_fbp=...` e `_fbc=...`
4. Agora preencha um formulário de lead (ex: Contato, PDP, CarMatch)
5. Vá para **Events Manager** → **Real-time data**
6. Procure por evento **Lead** — deve ter um campo `event_id` com valor tipo `Lead.550e8400-e29b-41d4-a716-446655440000`

**Se não aparecer**:
- Pixel ID correto?
- Consentimento aceito?
- Console mostra warnings (procure por `[Meta CAPI]` ou `[IntegrationsTracker]`)?

---

### 4.4 Fase 2: Meta Conversions API (Server-Side)

**O quê testar**: Lead event chega via servidor (CAPI), não só via browser.

1. Preencha um formulário de lead (ex: Contato ou PDP)
2. Vá para **Events Manager** → **Testar Eventos** (Test Events)
3. Procure o `event_id` do lead que você criou (copie do Console quando enviou o lead)
4. Em **Events Manager**, procure por dois eventos com o **mesmo `event_id`**:
   - Um com `source: "web"` (browser)
   - Um com `source: "conversions_api"` (servidor CAPI)
5. O segundo indica que a CAPI funcionou

**Se apenas o browser aparecer**:
- `META_CAPI_ACCESS_TOKEN` preenchido em `.env.local`?
- `META_GRAPH_API_VERSION` correto?
- Console do servidor (logs do Vercel/deploy) mostra algum erro de CAPI?

---

### 4.5 Fase 3: Google Ads Enhanced Conversions

**O quê testar**: Dados do usuário (email, telefone) chegam ao Google Ads.

1. Preencha um formulário de lead com **email e telefone válidos**
2. Abra **Google Ads** → **Ferramentas** → **Tag Assistant** ou **Google Tag Assistant (Legacy)**
3. Inspecione a página, procure por **eventos `conversion`** disparados
4. Expanda o evento, procure por campo `user_data`:
   - Deve conter hash SHA-256 do email
   - Deve conter hash SHA-256 do telefone (em formato DDI sem "+")
5. Confirme que o evento tem `transaction_id` = ao `event_id` do Meta (dedup entre plataformas)

**Alternativa mais fácil (via Google Ads):**
1. Em Google Ads, vá para **Conversões** → sua conversão
2. Procure por **Status de dados do usuário** (User Data Status)
3. Deve mostrar **"Dados recebidos"** (Data received) com data/hora
4. Se vazio, espere mais 24h ou revise se o formulário está sendo preenchido corretamente

---

## 5. Consolidar Feeds de Catálogo (Opcional, fora do código)

### 5.1 Localizar os 3 Feeds Duplicados

1. Acesse **Facebook Commerce Manager**: https://business.facebook.com/commerce_manager
2. Vá para **Catálogos** (Catalogs)
3. Procure seu catálogo (ex: "Motors Veículos")
4. Clique em **Feeds** (Product Feeds)
5. Procure por 3 feeds com nomes similares (ex: "Veículos Feed", "Veículos Feed (Copy)", "Veículos Feed v2")

### 5.2 Consolidar (Mesclar)

Opção A: **Usar um único feed** (recomendado)
1. Edite o feed principal para apontar para a URL único de feed (o endpoint `/api/feed/xml/route.ts` do site)
2. Delete os outros 2 feeds
3. Aguarde 24-48h para reprocessamento

Opção B: **Usar Feed Rule** (mais avançado)
1. Em **Configurações do Catálogo**, procure por **Regras de Feed**
2. Crie uma regra que mescla dados de múltiplos feeds
3. Aplique ao catálogo principal

**Validar após consolidação:**
- Vá para **Configurações do Catálogo** → **Diagnóstico**
- Match rate deve passar de 0% para ~80%+ (dependendo do feed)

---

## 6. Checklist Final

Antes de considerar "pronto":

- [ ] `.env.local` (produção) tem `META_CAPI_ACCESS_TOKEN` preenchido
- [ ] `.env.local` tem `META_GRAPH_API_VERSION` confirmado (v25.0 ou atual)
- [ ] Painel admin tem `metaPixelId` preenchido
- [ ] Painel admin tem `googleAdsId` preenchido
- [ ] Painel admin tem `googleAdsConversionLabel` preenchido
- [ ] Google Ads: "Conversões otimizadas" ativado
- [ ] Fase 0: ViewContent com `content_type` aparece em Events Manager
- [ ] Fase 1: Lead event com `event_id` aparece em Events Manager
- [ ] Fase 2: Mesma Lead com `event_id` aparece 2x (browser + CAPI)
- [ ] Fase 3: Google Ads recebe dados do usuário (confirmar em Tag Assistant ou Google Ads UI)
- [ ] Catálogo consolidado (3 feeds → 1)
- [ ] Match rate do catálogo subiu (antes 0% → depois 80%+)

---

## 7. Troubleshooting Rápido

| Sintoma | Causa Provável | Solução |
|---------|---------------|-----------| 
| Nenhum evento aparece em Events Manager | Pixel ID errado ou consentimento não aceito | Confirmar seção 1.3 e 4.1 |
| ViewContent mas sem `content_ids` | Código antigo ou campo não preenchido em POST | Conferir se build rodou (`npm run build`) |
| Lead aparece só via browser, não CAPI | Token CAPI inválido ou token expirado | Gerar novo token (seção 1.1) |
| Google Ads: "Nenhum dado recebido" | Enhanced Conversions não ativado ou email/tel não são válidos | Ativar seção 2.1 e testar com emails/tels reais |
| Match rate do catálogo segue em 0% | Feeds duplicados ou URL do feed errada | Consolidar feeds (seção 5) e revisar endpoint `/api/feed/xml` |

---

## 8. Próximos Passos (Opcional)

Após validar Fases 0-3:

1. **Fase 4 (Consent Mode v2)** — não foi implementado (pendência de aprovação legal)
   - Se aprovado por compliance, abrir nova sessão com `TRACKING_SPEC.md` §4
2. **Otimização de EMQ** (Estimated Match Rate)
   - Alimentar mais dados do usuário (nome, cidade, estado, CEP)
   - Requer mudança em `src/lib/meta-capi.ts` para aceitar mais campos de `user_data`
3. **Dynamic Ads e Conversão Otimizada** — já está no catálogo
   - Monitorar performance em Ads Manager

---

**Dúvidas?** Consulte:
- TRACKING_SPEC.md (especificação completa)
- `.env.example` (todas as variáveis)
- Console do navegador (F12) — procure por `[IntegrationsTracker]`, `[Meta CAPI]`, etc.
- Logs do Vercel (se houver erro no servidor)
