# AUDITORIA — Pacote 0, Motors Ciclo

**Data:** 2026-08-03
**Escopo:** somente leitura. Nenhuma alteração de código, schema ou configuração.
**Base:** `supabase_schema.sql`, código em `src/`, `Antigravity - Sincronizador de Estoque (veiculos).json`, `TRACKING_SPEC.md`, histórico git.

---

> ## 📌 Decisões tomadas — 2026-08-03 (Pacote 0.5)
>
> Registradas aqui porque `CLAUDE.md` manda documentar divergência entre manual e
> realidade neste arquivo. **O corpo da auditoria abaixo é o texto original e não foi
> reescrito** — ele descreve o estado em que o projeto foi encontrado. Onde estas
> decisões o superam, elas vencem.
>
> | # | Questão | Decisão |
> |---|---|---|
> | §5.1 | `veiculos` ou `estoque_motors`? | **Renomear para `estoque_motors`.** Contraria a recomendação registrada em §4/§5.1 (que era manter `veiculos`); o dono optou por alinhar o banco aos documentos. Executado no Pacote 0.5 como cutover de 4 passos — ver `supabase/README.md`. |
> | §5.2 | Nome da tabela da rede parceira | **`parceiros_ciclo`**, tabela nova. Não estender `parceiros`, que segue sendo fornecedor/cliente do financeiro. A criação é do Pacote 1. |
>
> **Não resolvidas** — seguem bloqueando o Pacote 1: §5.3 (schema real),
> §5.4 (base histórica), §5.6 (qual projeto é produção), §5.7 (infra de teste de RLS).
>
> §5.7 foi *parcialmente* resolvida: o runner (Vitest) está instalado e rodando, mas
> testar policy de RLS ainda exige uma instância Supabase de teste — decisão de infra
> em aberto.

> ## 📌 Decisões tomadas — 2026-08-13 (Ciclo sem telemetria)
>
> | # | Questão | Decisão |
> |---|---|---|
> | §1.4 | O gatilho exige `serie_telemetria >= 6 meses` e não há provedor contratado | **Telemetria adiada.** A fase zero da recompra é a área do cliente com diário de bordo ("Garagem Motors"); o gatilho passa a contar pela série de procedência — **emenda do manual pendente de publicação pelo dono** (v1.1). A loja valida cada revisão pelo comprovante/nota de serviço; só registro confirmado conta para `conformidade_revisao`. |
> | §5.6 | Índice Ciclo sem componente de condução | **Ratificado:** o Índice nasce com 3 componentes renormalizados (50 / 31,25 / 18,75) para toda a base, `score_conducao` fica `NULL` — nunca zero. Preserva a regra 2 por construção. |
> | R1 | Cliente e staff no mesmo pool `auth.users` | **Criar a role `cliente`** — privilégio mínimo, padrão de todo signup; papel de staff só via `app_metadata` (chave de serviço); policies internas passam a exigir `is_staff()`. Migração `20260813120000_role_cliente_e_is_staff.sql`, gates de rota e testes em `tests/role-cliente.test.ts`. **Aplicada em produção em 2026-08-13** — verificado: 17 policies com `is_staff`, zero policies internas em `USING (true)`. |
> | D3 | Autenticação do cliente | **Link mágico por e-mail** (não OTP por telefone). Custo zero, sem fornecedor novo. Torna o e-mail campo bloqueante no fechamento da venda. Configuração em `docs/AREA_DO_CLIENTE_AUTH.md`. |
> | D4 | Registro de odômetro pelo cliente | **Aprovado**, opt-in. Dado declarado, nunca verificado; não registrar jamais penaliza. |
> | D5 | Janelas de revisão | **10.000 km ou 12 meses**, o que ocorrer primeiro; tolerância de 30 dias ou 1.000 km, aplicada à régua que venceu. Calcado na prática publicada de VW, Honda, Toyota e Chevrolet — não em estimativa. Substituível quando houver acordo próprio com a rede parceira. |
> | D6 | Quem confirma revisão | **Comercial ou Administrador.** |
> | D9 | Dono operacional da fila de verificação | **Comercial**, com Administrador como revisor e responsável final — **arranjo transitório**, até existir papel `pos_venda` próprio. Não existe papel SDR no painel: `leads_sdr`/`sdr_qualificacao` são tabelas de fluxo do n8n, e `sdr-captura-lead` é webhook desligado. |
>
> Emenda ao manual redigida em `docs/EMENDA_01_MANUAL_CICLO.md` (artigos E1–E7),
> **aguardando aprovação e data do dono** para virar a v1.1. Enquanto não for
> aprovada, o texto vigente é o da v1.0 e o gatilho do §1.4 segue inatingível.
>
> **Seguem sem decisão:** D7 (qual chave o fluxo SDR do n8n usa — bloqueia
> fechar a RLS das seis tabelas expostas), D8 (nome público do produto e escopo
> da fase 1) e a nomeação do dono de pós-venda.

## Limite de verificação — leia antes de tudo

**O banco em produção não foi inspecionado.** Duas vias falharam:

- O MCP do Supabase exige autorização OAuth, impossível nesta sessão.
- `.env.local` existe, mas **as 18 variáveis estão todas vazias** — inclusive
  `NEXT_PUBLIC_SUPABASE_URL` e as chaves. Sem credencial, sem consulta.

Consequência prática: com env vazio, `getEstoque()` cai no fallback e serve
`MOCK_ESTOQUE` (5 veículos fictícios em `src/lib/supabase.ts:17`). Quem rodar o
projeto localmente hoje **não está vendo o estoque real** e pode concluir
erradamente que a integração está quebrada.

Tudo abaixo é derivado de código versionado. Onde produção pode divergir, está na
seção 5 como pergunta em aberto — não como fato.

---

## 1. Inventário do que existe

### 1.1 Repositório

A raiz do repositório git é `motors-site-oficial/`, subpasta do diretório de trabalho.
`CLAUDE.md`, `docs/`, `supabase_schema.sql` e `TRACKING_SPEC.md` estão nela.

| Item | Valor |
|---|---|
| Framework | Next.js **16.2.6**, React **19.2.4** |
| Router | **App Router** (`src/app/`), sem Pages Router |
| Estilo | Tailwind CSS v4 (`@tailwindcss/postcss`) |
| Linguagem | TypeScript 5, strict via `tsconfig.json` |
| Middleware | `src/proxy.ts` — nome não convencional, exporta `proxy()` e `config.matcher` |
| Deploy | Vercel (`motors-site-oficial.vercel.app`, hardcoded em vários pontos) |
| Nome do pacote | `motors-leads-antigravity` — legado, não bate com o nome do produto |

Dependências relevantes: `@supabase/ssr`, `@supabase/supabase-js`, `@upstash/ratelimit`,
`@upstash/redis`, `@aws-sdk/client-s3`.

**Não há framework de teste instalado.** Nem Jest, nem Vitest, nem Playwright, nem script
`test` em `package.json`. Os critérios de aceite dos Pacotes 1–9 exigem teste automatizado
("confirme por teste, não por inspeção visual"). Hoje não há onde escrevê-los.

`docs/`, `TRACKING_SPEC.md` e `SETUP_MANUAL.md` estão **untracked** no git.

### 1.2 Banco de dados

`supabase_schema.sql` (524 linhas) define **11 tabelas**. É um script idempotente escrito
para colar no SQL Editor do painel — o próprio cabeçalho instrui isso.

| Tabela | Papel | RLS |
|---|---|---|
| `site_settings` | Config do site em `jsonb`, chaveada por `id` (`company`, `about`, `webhooks`, `popups`, `quick_tags`, `stock_overrides`) | SELECT do recorte público para `anon`, completo para `authenticated` (desde `20260812120000`); INSERT/UPDATE admin |
| `veiculos` | **Inventário.** Ver alerta abaixo | SELECT/INSERT/UPDATE **`USING (true)`** |
| `profiles` | Usuários **internos**. `role IN ('admin','comercial','financeiro')`, FK para `auth.users` | Própria linha; admin vê todas |
| `categorias_financeiras` | Categorias de receita/despesa | `has_finance_access()` |
| `parceiros` | **Fornecedor/cliente do financeiro** — ver conflito 3.2 | `has_finance_access()` |
| `contas` | Contas a pagar e a receber | `has_finance_access()` |
| `despesas_recorrentes` | Despesas fixas | `has_finance_access()` |
| `compras_produtos` | Compras de peças e material | `has_finance_access()` |
| `movimentacoes` | Extrato / log de auditoria | `has_finance_access()` |
| `notificacoes_financeiras` | Fila de notificação de vencimento | `has_finance_access()` |
| `plano_contas` | Plano de contas contábil, hierárquico | SELECT público; escrita financeiro |

Funções: `is_admin()`, `has_finance_access()`, `handle_new_user()`, `atualizar_contas_vencidas()`.
Trigger: `on_auth_user_created` em `auth.users`.

**`veiculos` nunca é criada por este script.** Só sofre `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS` (`laudo_pericia`, `opcionais`, `tipo`, `perfil_uso`, `status_tag`,
`status_tag_color`, `vendido`). A tabela nasceu fora de controle de versão — provavelmente
criada pelo n8n ou à mão no painel. **Seu schema real é desconhecido.**

**Não existe nenhuma tabela de cliente, lead, venda, contrato, apólice, manutenção ou
telemetria.** Nenhuma. A busca por `clientes`, `leads`, `vendas`, `chassi`, `cpf_cnpj`
retorna zero ocorrências fora de `docs/`.

### 1.3 `estoque_motors` não existe

`CLAUDE.md` e o manual §2 afirmam que a base gira em torno de `estoque_motors`. **Ela não
existe em lugar nenhum do código.** A tabela de inventário chama-se **`veiculos`**, e é
assim em todos os 9 pontos de acesso: `src/lib/supabase.ts:440,471,480`,
`src/app/api/financeiro/margens/route.ts:21,64`,
`src/app/api/financeiro/margens/consulta/route.ts:40,49,62`,
`src/lib/webhook-dispatcher.ts:53`, `src/components/ConfiguracoesClientWrapper.tsx:489`,
e no nó Supabase do workflow n8n.

`CLAUDE.md:30` também cita `veiculos_vendidos` como "padrão já existente no repositório".
**Não existe.** O nome aparece apenas em `docs/MANUAL_MOTORS_CICLO.md`.

### 1.4 Como `veiculos` é populada

Workflow n8n `Antigravity - Sincronizador de Estoque (veiculos)`:

```
Schedule (a cada 6h) ─┐
                      ├→ HTTP GET XML RevendaMais → XML→JSON → split ADS.AD
Trigger manual ───────┘     → Code (classificação) → Supabase "Create a row" (veiculos)
```

- **Fonte:** XML público do RevendaMais (`app.revendamais.com.br/.../sitedaloja/<hash>.xml`)
- **Frequência:** a cada 6 horas
- **Chave de identidade:** `id = parseInt(carro.ID)` — o **ID do anúncio no RevendaMais**,
  um inteiro. Não é chassi, não é placa, não é UUID.
- **Operação:** nó `Create a row` — **insert, não upsert**. Como reconcilia reexecuções a
  cada 6h é indeterminado a partir deste arquivo.
- **`"active": false`** nesta cópia exportada. Ou o workflow real em produção é outro, ou
  a sincronização está parada.

Campos gravados: `id, marca, modelo, versao, ano, ano_fabricacao, preco, preco_original,
preco_promocional, quilometragem, cambio, combustivel, cor, tipo, perfil_uso, url_imagem,
link_conversao, pericia, descricao, whatsapp_images, web_full_images`.

**`placa` não é sincronizada. `chassi` não existe no XML nem no mapeamento.** O front
declara `placa` no tipo `Veiculo` mas usa o default `"V-REF100"` quando ausente
(`src/lib/supabase.ts:358`) — indício forte de que a coluna está vazia em produção.

### 1.5 Rotas

**Públicas:** `/` · `/carros/[marca]/[modelo]/[versao]/[slug]` (ISR 3600s) ·
`/destaques/[tag]` (ISR 60s) · `/contato` · `/sobre` · `/privacidade` · `/configuracoes` ·
`/login` · `/test`

**Autenticadas (staff):** `/admin/configuracoes` · `/admin/financeiro` + 8 subrotas ·
`/admin/usuarios`

**API pública:** `/api/leads` · `/api/avaliacao` · `/api/capi` · `/api/match` ·
`/api/feed/xml` (catálogo Google/Meta, cache 3h) · `/api/llms-full.txt` ·
`/api/settings` · `/api/auth/callback`

**API protegida:** `/api/financeiro/*` · `/api/users/*` (middleware + verificação de role) ·
`/api/upload-branding` e `/api/settings` POST (checagem de sessão dentro da própria rota)

Rate limit Upstash: 5/h em `/api/leads` e `/api/avaliacao`, 60/h em `/api/capi`.
Anti-spam Cloudflare Turnstile nos formulários de lead.

**Nenhuma rota autenticada de cliente final existe.** Toda a área logada é interna.

### 1.6 Auth

Supabase Auth, **e-mail + senha apenas** (`signInWithPassword` em
`src/app/actions/auth.ts:15`). Sem OTP, sem telefone, sem OAuth, sem magic link — a busca
por `signInWithOtp`/`verifyOtp`/`signInWithOAuth` retorna zero.

Autorização em `src/proxy.ts:132-178`: lê `profiles.role` e aplica regras por rota. Há
**fallback por e-mail hardcoded** (`motors@motorsstoreoficial.com.br`, `dyones@gmail.com`)
tanto no middleware quanto nas policies RLS de `site_settings`.

O Pacote 6 pede **auth por telefone com OTP**. É provider novo, não configurado hoje, e
exige decisão sobre SMS (custo, entregabilidade, fornecedor).

### 1.7 Integrações

| Integração | Estado | Onde |
|---|---|---|
| RevendaMais → estoque | XML → n8n a cada 6h → `veiculos` | JSON do workflow |
| RevendaMais → financeiro | Import manual em lote, colado no painel → `contas` | `/api/financeiro/importar-revenda` |
| n8n (leads) | Webhook `lead-entrada`, Bearer token | `/api/leads` |
| n8n (avaliação) | Webhook `sdr-captura-lead` | `/api/avaliacao` |
| n8n (admin) | Webhook de eventos financeiros, com liga/desliga por evento | `src/lib/webhook-dispatcher.ts` |
| Meta Pixel + CAPI | **Implementado**, com dedup por `event_id` | `src/lib/meta-capi.ts`, `/api/capi` |
| Google Ads Enhanced Conv. | **Implementado** | `src/lib/telemetry.ts:201-212` |
| GA4 / GTM | Configurável no painel | `IntegrationsTracker.tsx` |
| Upstash Redis | Rate limit | `src/proxy.ts` |
| Cloudflare Turnstile | Captcha | `src/components/Turnstile.tsx` |
| AWS S3 | Upload de branding | `/api/upload-branding` |

**Não existe integração com financeira, corretora, oficina ou provedor de rastreamento.**
Nenhuma. Evolution API, Typebot e Chatwoot são citados em `CLAUDE.md` mas vivem inteiramente
no n8n — o repositório não os toca.

### 1.8 TRACKING_SPEC.md — o que está feito

| Fase | Escopo | Estado |
|---|---|---|
| 0 | `content_type`, Pixel ID, `content_ids` no Lead | ✅ implementada |
| 1 | `event_id`, `_fbp`/`_fbc`/`fbclid` | ✅ `src/lib/tracking-identity.ts` |
| 2 | CAPI server-side | ✅ `/api/leads` + `/api/capi` |
| 3 | Google Ads Enhanced Conversions | ✅ `telemetry.ts` |
| 4 | Consent Mode v2 / Limited Data Use | ⛔ **bloqueada por decisão jurídica** |

A Fase 4 está deliberadamente parada. `TRACKING_SPEC.md:478-480` instrui levar ao jurídico
antes de mexer, mantendo o bloqueio total como padrão conservador.

Eventos ativos hoje: `ViewContent`, `Lead`, `CompleteRegistration`, `Search`, `Contact`,
`PageView`. O Pacote 9 **adiciona** aos existentes — nenhum é renomeado (regra 7 do CLAUDE.md).

### 1.9 Assets reaproveitáveis

Vale registrar o que já existe e o Ciclo não precisa reinventar:

- **`src/lib/finance-calculator.ts`** — já implementa Tabela Price (PMT), IOF de crédito PF
  e TAC. É a base do §5.1, embora o Ciclo precise da operação inversa (saldo devedor), não
  da parcela. **Ver conflito 3.6.**
- **`src/lib/webhook-dispatcher.ts`** — padrão maduro de despacho para n8n: Bearer token,
  liga/desliga por evento em `site_settings`, enriquecimento de payload, falha não-bloqueante.
  Molde direto para o motor de gatilhos do Pacote 3.
- **`notificacoes_financeiras` + `/api/financeiro/notificacoes/processar`** — rotina que
  varre vencimentos, monta mensagem e marca `enviada`. É exatamente a forma da rotina noturna
  do Pacote 2 e do log `eventos_ciclo` do Pacote 3.
- **`atualizar_contas_vencidas()`** — precedente de função SQL agendada.
- **`is_admin()` / `has_finance_access()`** — padrão `SECURITY DEFINER` que evita recursão
  em RLS. O Pacote 1 vai precisar do equivalente para `cliente_id` do JWT.

---

## 2. Mapa de correspondência — manual §2 vs. realidade

| Entidade do manual | Existe? | Nome real | Observação |
|---|---|---|---|
| `estoque_motors` | **Parcial, outro nome** | `veiculos` | Só inventário ativo. PK inteira (ID RevendaMais), sem `chassi`, `placa` provavelmente vazia |
| `clientes` | **Não** | — | Nem tabela, nem coluna, nem CPF em lugar algum |
| `veiculos_vendidos` | **Não** | — | O mais próximo: `veiculos.vendido` (boolean) + `contas.cliente` (texto livre) |
| `contratos_financiamento` | **Não** | — | Nenhum dado de financiamento é persistido. Só simulação efêmera no browser |
| `apolices_seguro` | **Não** | — | Sem integração com corretora |
| `contratos_ciclo` | **Não** | — | O produto não existe em banco |
| `manutencoes` | **Não** | — | Nenhum registro de passagem por oficina |
| `parceiros` | **Colisão de nome** | `parceiros` | Existe, mas é `fornecedor\|cliente\|ambos` do financeiro. Ver 3.2 |
| `telemetria_resumo` | **Não** | — | Sem provedor de rastreamento |
| `indice_ciclo` | **Não** | — | — |
| `eventos_ciclo` | **Não** | — | Análogo estrutural: `notificacoes_financeiras` |
| `vw_ciclo_estado` | **Não** | — | Nenhuma view ou materialized view no projeto |

**Leitura honesta: 1 de 12 entidades existe parcialmente, 1 colide de nome, 10 não existem.**

O manual §2 abre com "a base atual gira em torno de `estoque_motors` — inventário". A
premissa está certa no espírito e errada no nome. Não há **nada** do eixo cliente-veículo.

### O que hoje mais se parece com uma venda

Não há registro de venda. O que existe, espalhado:

- `veiculos.vendido` — boolean, marcado à mão no painel
- `veiculos.preco_compra` — custo de aquisição (nunca exposto ao front, por decisão de
  segurança em `src/lib/supabase.ts:380`)
- `contas` com `tipo='receber'`, `veiculo_id` (TEXT), `cliente` (TEXT livre)
- `/admin/financeiro/margens` cruza os três para calcular margem por veículo

**Não existe: comprador identificado, CPF, chassi, data de venda, KM na venda, condições de
financiamento, consentimento.** O manual §0 diz que nenhuma venda é concluída sem o par
cliente-veículo. Hoje **nenhuma venda registra o par**. Não é um gap de implementação — é a
ausência do eixo inteiro.

### Leads: capturados, nunca persistidos

Os dois fluxos de lead — `/api/leads` e `/api/avaliacao` — **não gravam nada em banco**.
Montam payload, disparam POST para o n8n e chamam `logLeadCaptured()`, que é um
`console.log` (`src/lib/telemetry.ts:26-34`).

Isso importa para o mutirão de retroalimentação do manual §3.3: **a base histórica de leads
não está no Supabase.** Está no n8n, no Chatwoot ou no CRM. Onde exatamente, e se é
recuperável, é pergunta em aberto (5.4).

---

## 3. Conflitos e riscos

### 3.1 🔴 Documentação e código divergem em nomes centrais

`estoque_motors` e `veiculos_vendidos` são citados em `CLAUDE.md` **e** no manual como
existentes. Nenhum dos dois existe. Um agente que confie no `CLAUDE.md` criará
`veiculos_vendidos.estoque_id → estoque_motors(id)` apontando para uma tabela inexistente,
e a migração falhará — ou pior, criará `estoque_motors` vazia ao lado de `veiculos`, e o
segundo modelo de inventário concorrente que o Pacote 0 existe para evitar nasce ali.

**Precisa de decisão explícita antes do Pacote 1** (ver 5.1).

### 3.2 🔴 Colisão de nome em `parceiros`

Ambos existem, com o mesmo nome e propósitos incompatíveis:

| | Existente (`supabase_schema.sql:292`) | Manual §2.1 |
|---|---|---|
| `tipo` | `fornecedor \| cliente \| ambos` | `oficina \| seguradora \| despachante \| estetica \| pneus` |
| Campos | `documento`, `telefone`, `email`, `created_by` | `cidade`, `comissao_pct`, `ativo` |
| RLS | `has_finance_access()` | cliente lê próprias linhas |
| Uso | `/api/financeiro/parceiros`, formulário de cadastro | rede de oficinas do Ciclo |

`CREATE TABLE IF NOT EXISTS parceiros` com a definição do manual **falha em silêncio** — a
tabela já existe, o `IF NOT EXISTS` engole, e as colunas do Ciclo nunca aparecem. O erro só
surge em runtime, ao inserir. Precisa de nome novo (`parceiros_ciclo`? `oficinas_rede`?) ou
de extensão explícita da tabela existente. Decisão de nomenclatura, não técnica (5.2).

### 3.3 🔴 FK para uma tabela que se apaga sozinha

O manual §2.1 propõe `veiculos_vendidos.estoque_id uuid references estoque_motors(id)`.
Dois problemas:

1. **Tipo incompatível.** `veiculos.id` é o ID inteiro do anúncio RevendaMais, não UUID.
   O código já convive com essa ambiguidade: `getVeiculoById` tenta string, depois número
   (`src/lib/supabase.ts:470-485`), e `contas.veiculo_id` é TEXT.
2. **Alvo volátil.** `veiculos` é espelho de um feed externo, reescrito a cada 6h. Quando o
   carro é vendido, ele sai do XML — exatamente o momento em que o registro de 36 meses
   precisa da referência. Uma FK rígida ou bloqueia a sincronização, ou apaga em cascata o
   histórico do cliente.

Recomendação: `veiculos_vendidos` **copia** os dados do veículo (marca, modelo, ano, preço)
em vez de referenciá-los, e guarda `estoque_id_origem` como referência solta, sem FK.
Snapshot, não ponteiro. É o que o manual já faz de fato ao duplicar `marca`/`modelo`/`versao`
em `veiculos_vendidos` — só falta tornar explícito que a FK não deve existir.

### 3.4 🔴 `veiculos` é publicamente gravável

Conforme `supabase_schema.sql:188-198`:

```sql
CREATE POLICY "Allow public read access"   ON public.veiculos FOR SELECT USING (true);
CREATE POLICY "Allow public update access" ON public.veiculos FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public insert access" ON public.veiculos FOR INSERT WITH CHECK (true);
```

Sem restrição de role. A anon key é pública por natureza — vai no bundle do browser. Como
está escrito, **qualquer pessoa pode alterar preço, marcar veículo como vendido ou inserir
veículos**.

Isso não é acidente de configuração: o painel admin depende disso.
`ConfiguracoesClientWrapper.tsx:489` faz `.update()` em `veiculos` **do lado do cliente**,
com a anon key. Fechar a policy quebra o painel de estoque. Corrigir exige mover essa
escrita para uma API route com service role — trabalho fora do escopo do Ciclo, mas que
toca a mesma tabela que o Pacote 1 vai referenciar.

Fora de escopo do Pacote 0. **Registrado como risco de produção, para decisão do dono.**
Não verificável sem acesso ao banco — produção pode ter sido endurecida à mão.

### 3.4-b ✅ `site_settings` era publicamente gravável — FECHADO em 2026-08-12

O irmão do §3.4 que ficou para trás. `20260808120000` fechou a escrita de `estoque_motors`;
`site_settings` tem o mesmo defeito e não entrou naquela migração.

Diferente do §3.4, **este não é dedução a partir do arquivo de schema — foi medido contra
produção**, ao conferir o resultado de `20260812120000`:

```
[UPDATE] Allow public update access | roles={public} | USING (true) WITH CHECK (true)
[INSERT] Allow public insert access | roles={public} | WITH CHECK (true)
```

Prova: `PATCH /rest/v1/site_settings?id=eq.company` com a anon key e nada mais respondeu
**200** e devolveu a linha. (A prova regravou `updated_at` com o valor que já estava lá —
nenhum dado foi alterado.)

Por que é pior que o vazamento de leitura que motivou `20260812120000`: ler o
`apiSecretToken` é ruim, mas **escrever** é controle do site sem login. Reescrever
`webhooks.webhookUrl` desvia todo lead do site — e o site não acusa, porque o disparo é
não-bloqueante por projeto. Reescrever `company.whatsappRaw` troca o número em todo botão
de WhatsApp da loja.

**Corrigido e aplicado em 2026-08-12** por
`supabase/migrations/20260812150000_rls_escrita_de_site_settings.sql`, em transação e com
backup das 8 linhas antes (fora do repositório). Estado no ar depois:

```
[INSERT] Insercao de settings com sessao | roles={authenticated}
[SELECT] Leitura anonima do recorte publico | roles={anon}
[SELECT] Leitura completa com sessao | roles={authenticated}
[UPDATE] Escrita de settings com sessao | roles={authenticated}
```

Reconferido pelo mesmo caminho da prova: o `PATCH` anônimo agora afeta 0 linhas, e a
leitura pública segue devolvendo as 6 linhas do recorte. DELETE continua sem policy —
ausência é negação.

Fechar não quebrou nada porque nada no navegador escreve nesta tabela: o painel salva por
`/api/settings` POST, que exige sessão e usa o cliente autenticado do usuário.

### 3.4-c 🔴 Seis tabelas sem RLS, e uma `veiculos` órfã (2026-08-12)

Varredura de `pg_policies` e `pg_class` contra produção no mesmo dia:

**Sem RLS nenhuma** (`relrowsecurity = false`), portanto legíveis pelo anônimo:
`atendimentos`, `ia_classificacoes`, `lead_tags`, `leads_sdr`, `sdr_qualificacao`,
`tracking_events`. Cinco estão vazias hoje; `tracking_events` tem 5 linhas e o anônimo
**as lê de fato** (13 colunas, incluindo `ag_uid`, `click_id` e `utm_*`) — é a prova de
que as outras também sairiam no dia em que forem preenchidas.

Isso contraria `CLAUDE.md` ("RLS é obrigatório em toda tabela com dado de cliente"):
`leads_sdr` tem `nome`, `telefone`, `email`; `sdr_qualificacao` tem `entrada_disponivel` e
`forma_pagamento`. Mesmo padrão de [[leads-pii-retencao-indeterminada]] — porta aberta,
ainda sem nada atrás dela.

**Não corrigido de propósito:** não se sabe quem grava nessas tabelas. Se o fluxo SDR do
n8n usar a anon key em vez da chave de serviço, ligar RLS quebra a gravação em silêncio.
Precisa ser confirmado antes.

**`public.veiculos` voltou a existir como TABELA** (`relkind = 'r'`, 0 linhas) com
`Allow public insert/update access`. É o resíduo que a memória previa: reexecutar o
baseline `20260803120000` faz `CREATE TABLE IF NOT EXISTS public.veiculos` e recria as
policies públicas. Ninguém lê essa tabela — `estoque_motors` segue com 88 linhas, intacta.
Dois efeitos: escrita anônima numa tabela morta, e um futuro `supabase db push` **aborta**
em `20260804193000` (`DROP VIEW IF EXISTS public.veiculos`), porque agora é table, não view.

### 3.5 🟡 Não há migrações versionadas

`CLAUDE.md:62` afirma: *"Migrações do Supabase são versionadas em `supabase/migrations/`.
Nunca altere schema direto pelo painel."*

**`supabase/` não existe.** Não há CLI do Supabase, não há migração, não há lockfile. Existe
um único `supabase_schema.sql` cujo cabeçalho instrui: *"Execute este script no SQL Editor
do seu Dashboard do Supabase"* — exatamente o que a regra proíbe.

Corolário: **não é possível afirmar que produção bate com o script.** Colunas podem ter sido
adicionadas à mão. `veiculos` sequer é criada ali. O Pacote 1 precisa inaugurar o versionamento,
e a primeira migração precisa ser um baseline honesto do que existe — o que exige antes ler o
schema real.

### 3.6 🟡 Taxas de juros inventadas já em produção

`src/lib/finance-calculator.ts:64-72` escolhe a taxa por pontuação de risco presumido:

```typescript
if (pontos >= 80)      taxa_mensal = 0.0145;  // 1,45% a.m.
else if (pontos >= 45) taxa_mensal = 0.0195;  // 1,95% a.m.
else                   taxa_mensal = 0.0265;  // 2,65% a.m.
```

Mais `tac = 950.00` ("tarifa média do mercado"). A origem desses números não está documentada
em lugar nenhum. A pontuação é heurística própria (ocupação + % de entrada + idade do carro).

Colide com `CLAUDE.md:65` — *"Não invente número"*. O Pacote 7 (vitrine por parcela, manual
§6.1) herda essas premissas e passa a exibi-las como "parcela estimada com premissas
visíveis". Se as premissas forem inventadas, tornar visível não conserta — publica o problema.

Já está em produção na calculadora, então não é regressão. Mas antes do Pacote 7 é preciso
saber de onde vêm (5.5).

### 3.7 🟡 Consentimento atual é binário, o manual exige granular

Hoje: uma chave `localStorage` chamada `ag_cookie_consent`, com valor `"accepted"` ou
`"rejected"` (`CookieConsentBanner.tsx:21,28`). Todas as funções de tracking checam
`if (consent !== "accepted") return`.

O manual exige (§10, §6.3-D): consentimento **por canal** (whatsapp/email/sms), **por
categoria** (localização, telemetria de condução, manutenção), com **timestamp**, **canal de
coleta**, revogável, e — pelo `clientes.consentimento_lgpd_em` — persistido no servidor.

São modelos diferentes, não versões do mesmo. O atual é consentimento de cookie de
navegação anônima; o do Ciclo é consentimento de titular identificado. Precisam coexistir,
não se substituir. E o do Ciclo não pode viver em `localStorage` — precisa de banco, porque
é prova legal.

Interação com a Fase 4 do TRACKING_SPEC: aquela decisão jurídica pendente e esta são a mesma
conversa com o jurídico. **Vale levar juntas.**

### 3.8 🟡 Sem infraestrutura de teste, os critérios de aceite não podem ser cumpridos

Os Pacotes 1, 2, 3, 5, 6 e 7 exigem prova por teste automatizado — RLS cruzada retornando
vazio, venda incompleta bloqueada, índice neutro sob recusa de consentimento,
reprodutibilidade da curva. Nada disso é verificável hoje.

Escolher e instalar o runner é pré-requisito do Pacote 1, não tarefa dele. Não está previsto
em nenhum pacote do plano (5.7).

### 3.9 ✅ Ambiguidade sobre qual é o projeto Supabase — RESOLVIDA em 2026-08-08

`CLAUDE.md:21` dizia `lanatcqpskcmifuxfatn`. `.mcp.json`, o `.env.local` e o
sincronizador do n8n sempre apontaram `zwbqmzgnagfeqinqkolp` — e o dono
confirmou que este é o de produção. Era documentação desatualizada, não dois
ambientes: o `CLAUDE.md` foi corrigido.

### 3.10 🟢 Divergências menores de conteúdo

`site_settings` traz endereço em São Paulo (Av. Europa) e o texto institucional fala de "uma
década na Avenida Europa", enquanto `CLAUDE.md` e o texto de CTA situam a loja em
Curitiba/Bacacheri. São dados-semente (`isCustom: false`), provavelmente sobrescritos em
produção pelo painel. Sem impacto no Ciclo; registrado por completude.

---

## 4. Recomendação de sequência

O plano original continua correto na ordem. Os ajustes abaixo são **inserções antes do
Pacote 1** e refinamentos de escopo, não reordenação.

### Pacote 0.5 — Pré-requisitos (novo, bloqueia o Pacote 1)

Curto, e nada abaixo pode avançar sem ele:

1. **Resolver a nomenclatura** — `veiculos` vs. `estoque_motors` (5.1). Recomendo manter
   `veiculos` e corrigir `CLAUDE.md` e o manual. Renomear tabela em produção quebra o
   workflow n8n, o feed XML do Google/Meta e o painel de margens, para ganhar apenas
   cosmética.
2. **Preencher `.env.local`** e confirmar que `getEstoque()` traz estoque real, não o mock.
   Sem isso ninguém consegue validar coisa alguma localmente.
3. **Autorizar o MCP do Supabase** e extrair o schema real de `veiculos` — tipo do `id`,
   presença de `placa`, colunas fora do script.
4. **Instalar runner de teste** (Vitest é o de menor atrito com Next 16 + TS).
5. **Inaugurar `supabase/migrations/`** com um baseline do schema real, incluindo o
   `CREATE TABLE veiculos` que nunca foi versionado.

### Pacote 1 — Fundação de dados (ajustes)

- `veiculos_vendidos` **sem FK** para `veiculos`. Snapshot dos campos + `estoque_id_origem`
  solto (conflito 3.3).
- Renomear a tabela de rede parceira para evitar a colisão (conflito 3.2).
- A helper de RLS por cliente segue o padrão `SECURITY DEFINER` de `is_admin()` — o problema
  de recursão já foi resolvido ali, não repetir a descoberta.
- `chassi` é `unique not null` no manual, mas **não vem do RevendaMais**. Só pode ser
  preenchido no formulário de venda (Pacote 2). Ordem correta; vale registrar que a base
  histórica não terá chassi sem digitação.

### Pacote 2 — Captura na venda (elevar prioridade)

**É o gargalo real, e é maior do que o plano sugere.** Não existe nenhum formulário de venda,
nenhuma tela de fechamento, nenhuma noção de "vendedor" além de `profiles.role='comercial'`.
Não é adicionar validação a um formulário existente — é construir o formulário, e com ele o
primeiro fluxo de escrita de dado pessoal do projeto.

Enquanto ele não existir, os Pacotes 3–9 operam sobre tabelas vazias.

### Pacote 3 — Motor de gatilhos (reduzir escopo)

Boa parte já tem molde: `webhook-dispatcher.ts` para o despacho,
`notificacoes_financeiras`/`processar` para a varredura e marcação. Reaproveitar em vez de
projetar do zero.

A regra de frequência do §4.3 **no servidor** (não no workflow) está certa e é a parte que
não tem precedente aqui.

### Pacote 4 — Painel de conformidade (manter cedo)

Sem alteração. Depende de `manutencoes` (Pacote 1) e de dado real (Pacote 2), mas o cálculo
e o painel podem ir ao ar exibindo zero — e o manual §1.4 quer justamente a série desde o
dia 1.

### Pacote 5 — Telemetria (bloqueado por fornecedor)

Não há provedor de rastreamento contratado nem integração de qualquer tipo. Antes de
codificar, é preciso saber quem é o fornecedor e o que a API dele entrega — se não entregar
agregado mensal, a regra de nunca armazenar traçado bruto (CLAUDE.md regra 1) vira restrição
de arquitetura na ingestão, não só de schema.

### Pacote 6 — Área do cliente (dependência nova)

Auth por telefone com OTP é **provider novo**. Exige habilitar SMS no Supabase, escolher
fornecedor, e absorver o custo por mensagem. Nada disso está no lugar. Tratar como
subtarefa de infraestrutura antes do primeiro bloco de UI.

### Pacotes 7–9

Sem ajuste de sequência.

- **7:** herda as premissas de taxa do conflito 3.6 — resolver antes.
- **9:** os eventos existentes são bem estruturados (`event_id`, dedup CAPI). Estender é
  seguro; o diff antes/depois pedido no aceite é factível.

### Bloco B

Permanece bloqueado. Nada nesta auditoria toca recompra, e o gatilho §1.4 não pode nem
começar a ser medido antes do Pacote 4 estar no ar com dado real.

---

## 5. Perguntas em aberto

Nenhuma foi estimada. Todas bloqueiam ou alteram decisões concretas.

### 5.1 🔴 `veiculos` ou `estoque_motors`? — bloqueia o Pacote 1

`CLAUDE.md` e o manual dizem `estoque_motors`; o código inteiro usa `veiculos`. Foi renome
planejado e nunca executado? Documentação escrita sem consultar o código? Ou existe um
segundo projeto Supabase onde `estoque_motors` de fato existe (ver 5.6)?

**Recomendação:** manter `veiculos`, corrigir os documentos. Renomear quebraria o workflow
n8n, o feed XML de anúncios e o painel de margens em troca de nada funcional.

### 5.2 🔴 Que nome dar à tabela da rede parceira? — bloqueia o Pacote 1

`parceiros` está ocupado por outro conceito, em uso, com API e formulário. Criar
`parceiros_ciclo`/`oficinas_rede`, ou estender a tabela existente com os campos do Ciclo e
ampliar o CHECK de `tipo`? Estender mistura domínios sob a mesma RLS financeira; separar
duplica o cadastro de quem for oficina **e** fornecedor.

### 5.3 🔴 Qual o schema real de `veiculos`?

A tabela nunca foi versionada. Preciso saber:
- `id` é `int`, `bigint` ou `text`? (`contas.veiculo_id` é TEXT — o join já é frouxo)
- A coluna `placa` existe? Está preenchida? O sync não a alimenta e o front usa default
- Que colunas existem além das 7 do `ALTER TABLE`?
- Há registro histórico de veículos já vendidos, ou o sync os remove?

A última é decisiva: se veículos vendidos somem de `veiculos`, o mutirão do manual §3.3 não
tem de onde puxar dado de estoque para as vendas passadas.

### 5.4 🔴 Onde está a base histórica de vendas e leads?

Nenhum lead é persistido no Supabase — `/api/leads` e `/api/avaliacao` só repassam ao n8n.
O manual §3.3 pede mutirão sobre 36 meses com meta de 60% de cobertura. Antes de planejá-lo:

- As vendas passadas estão no RevendaMais? Em planilha? Em contrato de papel?
- O n8n guarda histórico dos leads recebidos, ou só encaminha?
- Existe CRM? O `CLAUDE.md` cita Chatwoot — ele é a base de clientes de fato?
- Qual sistema tem CPF do comprador hoje?

Sem essas respostas o Pacote 2 fica sem lastro e o mutirão é inplanejável.

### 5.5 🟡 De onde vêm as taxas de 1,45% / 1,95% / 2,65% e a TAC de R$ 950? — antes do Pacote 7

São de financeira parceira real, média de mercado, ou estimativa? Se estimativa, o Pacote 7
não pode publicá-las como "premissas visíveis" sem violar `CLAUDE.md:65`.

Pergunta associada: existe financeira parceira formalizada? O manual §6.1 fala em
"pré-aprovação integrada às financeiras parceiras" — hoje não há integração nenhuma.

### 5.6 ✅ Qual projeto Supabase é produção? — RESPONDIDA em 2026-08-08

`zwbqmzgnagfeqinqkolp`, confirmado pelo dono. O `lanatcqpskcmifuxfatn` do
`CLAUDE.md` era documentação obsoleta e foi corrigido. Todas as migrações
aplicadas até aqui rodaram no projeto certo.

### 5.7 ✅ Qual framework de teste adotar? — RESPONDIDA (Vitest, 2026-08-03; RLS, 2026-08-21)

Vitest entrou no Pacote 0.5 e é o runner desde então. A segunda metade da
pergunta — *"testar policy de RLS exige instância Supabase de teste"* — ficou
aberta 18 dias porque a resposta assumida era "precisa de Docker", e Docker
não estava instalado.

**A premissa estava errada.** Um Postgres local basta. O que faltava não era
infraestrutura, era escrever o pedaço de Supabase que as migrações pressupõem
— `auth.users`, `auth.uid()`, `auth.jwt()`, os papéis do PostgREST e os
*default privileges* do schema `public`. São ~190 linhas, em
`supabase/testes/andaime.sql`.

Com ele, `tests/migracoes-executam.test.ts` aplica a cadeia num banco
descartável e **cobra o aceite de cada migração** — o `do $$` que já existia em
todas elas e que, até aqui, só era executado quando o `db push` rodava em
produção. Sem Postgres alcançável, esses testes são pulados, não falham.

O custo do atraso ficou visível na primeira execução: quatro migrações já
empurradas passaram, mas o andaime revelou uma dependência implícita que
ninguém tinha notado — as tabelas novas dependiam dos *default privileges* do
Supabase para serem acessíveis por `authenticated`. Em produção funcionou; num
Postgres sem essa configuração, a RLS seria irrelevante porque o acesso morre
antes, no privilégio.

### 5.8 🟡 Quem é o provedor de rastreamento? — bloqueia o Pacote 5

Sem contrato, sem API, sem formato conhecido. Se o provedor só expuser posição bruta e não
agregado mensal, a agregação precisa acontecer na ingestão, e isso muda a arquitetura do
pacote.

### 5.9 🟡 O workflow de sincronização de estoque está ativo?

O JSON no repositório tem `"active": false` e usa `Create a row` (insert, não upsert). Ou o
workflow real em produção é outro, ou a sincronização está parada. E se é insert puro rodando
a cada 6h, como duplicatas são evitadas?

Importa para o Pacote 1: se `veiculos` é reescrita destrutivamente, qualquer referência
vinda de `veiculos_vendidos` precisa sobreviver a isso.

### 5.10 🟢 O consentimento do Ciclo e a Fase 4 do tracking vão juntos ao jurídico?

A Fase 4 do `TRACKING_SPEC.md` já espera parecer jurídico. O consentimento granular do
manual §10 é a mesma conversa. Levar separado gasta duas rodadas.

### 5.11 🟢 Quem é o dono operacional do programa?

O próprio manual pergunta (Anexo, item 6). Continua sem resposta no código. Várias decisões
acima precisam de alguém que decida.

---

## Resumo em cinco linhas

1. **O eixo cliente-veículo não existe.** Nem tabela, nem coluna, nem CPF, nem lead
   persistido. 10 das 12 entidades do manual §2 precisam ser criadas do zero.
2. **`estoque_motors` não existe** — a tabela é `veiculos`, populada do RevendaMais a cada
   6h, com chave inteira do anúncio, sem chassi e provavelmente sem placa.
3. **Três colisões travam o Pacote 1:** nome do inventário, colisão em `parceiros`, e FK
   para uma tabela reescrita por feed externo.
4. **Faltam pré-requisitos que nenhum pacote prevê:** migrações versionadas, framework de
   teste, env preenchido, e leitura do schema real.
5. **O Pacote 2 é o gargalo**, e é maior do que o plano sugere — não é validar um formulário,
   é construí-lo.

**Pacote 0 concluído. Aguardando revisão. Pacote 1 não iniciado.**
