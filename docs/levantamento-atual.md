# Levantamento do estado atual — kickoff da F0

**Produzido em 2026-08-28**, conforme o `motors-handoff/docs/fases/KICKOFF-PROMPT.md`.
Fontes: consultas ao banco de produção no mesmo dia (contagens, colunas, livro-razão,
cron, policies), varredura do código com `arquivo:linha`, e a análise de impacto
"Handoff × Sistema Vivo" (artifact, v3). Este documento é a fotografia sobre a qual
a F0 começa — quando ele e o banco divergirem, o banco vence e este arquivo se corrige.

Contexto imediato: no próprio dia 28/08 o **módulo de caixa foi aposentado**
(migração `20260828190000`; decisão do dono) e a **Emenda 02** levou o manual do
Ciclo à v1.2 (recompra por % da FIPE). O terreno que a F0 encontra já está limpo
dos dois maiores conflitos que a análise apontou.

---

## 1. O banco de produção hoje (40 tabelas, 5 views)

Por domínio, com linhas estimadas em 28/08:

| Domínio | Objetos | Estado |
|---|---|---|
| **Site/estoque** | `estoque_motors` (105 em 01/09 — o site exibe os `estado_cadastro='publicado'`: 38 à venda + 24 vendidos na carência; 42 arquivados fora), `site_settings` (8 linhas jsonb), `historico_veiculo` (append-only, ~36) | produção viva |
| **Leads/funil** | `leads` (~11), `leads_eventos` (~21), `funil_etapas` (8 — seed de 28/08), `funil_motivos` (~19), `atendimentos`, `leads_erros`, `ia_classificacoes`, `contacts` | frente ativa de outra sessão (funil de vendas, 28/08) |
| **Agenda de pessoas** | view `agenda_de_pessoas` (une `parceiros` + `clientes` + `parceiros_ciclo` + `investidores` + `leads`), `parceiros` (0 — porta de criação do `/api/pessoas`) | pedido do dono de 24/08; **ficou na aposentadoria** |
| **Investidores** | `investidores` (1 ficha), `movimentacoes_investidor`, `investidor_veiculos`, `investidor_movimentos`, view `investidor_posicao` | **ficou por decisão do dono** ("precisamos deste modelo"); telas em `/admin/investidores`, portal em `/investidor` |
| **Motors Ciclo / Garagem** | as 13 do manual: `clientes`, `veiculos_vendidos`, `contratos_ciclo`, `contratos_financiamento`, `apolices_seguro`, `parceiros_ciclo`, `manutencoes`, `plano_revisoes`, `leituras_odometro`, `conformidade_diaria`, `telemetria_resumo`, `indice_ciclo`, `eventos_ciclo` + matview `vw_ciclo_estado`, views `vw_ciclo_estado_painel`, `vw_vendas_incompletas` | no ar, **0 linhas em tudo** — porte ao núcleo é sem backfill |
| **Mídia paga** | `midia_campanhas`, `midia_anuncios`, `midia_leituras`, `midia_ajustes` | alimentação manual |
| **Auth/painel** | `profiles` (~5; `papeis[]` + espelho `role`), `auditoria_admin` (~28, append-only), `notificacoes_admin` (~19) | produção viva |
| **Legado fechado** | `lead_tags`, `leads_sdr`, `sdr_qualificacao`, `tracking_events` | RLS fechada em `20260815120000`; não usar |
| **Aposentado em 28/08** | ~~contas, compras_produtos, despesas_recorrentes, movimentacoes, categorias_financeiras, plano_contas, notificacoes_financeiras, extrato_bancario~~ | **não existem mais** — o nome `plano_contas` está livre para a spec 30 |

Funções relevantes: `is_staff()`, `tem_papel()`, `papeis_validos()`, `sincronizar_papeis()`,
`is_admin()`, `has_finance_access()` (vivas — policies de parceiros/investidores),
`cliclo`: `fechar_venda_ciclo`, `carimbar_revisao`, `calcular/rodar_conformidade_diaria`,
`montar_fila_de_gatilhos`, `registrar_desfecho_ciclo`, `reivindicar_garagem`,
`reivindicar_investidor`, `vincular_auth_por_email`, `km_estimado`, `completude_por_vendedor`.

Cron (pg_cron): `conformidade-diaria` (30 2 * * *) e `abertura-de-janelas` (0 3 * * *).
Storage: buckets `diario-de-bordo` (privado, delete protegido por trigger) e `branding`.

Livro-razão de migrações: `supabase_migrations.schema_migrations`, semeado em
`20260815120000`. **Toda migração termina com o rodapé de auto-registro** — regra do
`supabase/README.md`, que também é o runbook de aplicação (`aplicar-migracao.js`,
ensaio com ROLLBACK antes de `--gravar`; o CLI do Supabase não está instalado e a
API de gerenciamento já falhou aqui).

---

## 2. O contrato de leitura de `estoque_motors` — INTOCÁVEL até a F2

É o item que o kickoff manda fixar: na F2 a tabela vira **projeção do núcleo
preservando exatamente este shape**. Três camadas formam o contrato:

### 2.1 As 43 colunas físicas (produção, 28/08)

`id` (**integer** — é o ID do anúncio no RevendaMais, não uuid), `marca`, `modelo`,
`versao`, `ano`, `ano_fabricacao`, `preco`, `preco_original`, `preco_promocional`,
`quilometragem`, `cambio`, `combustivel`, `cor`, `tipo`, `perfil_uso`, `url_imagem`,
`link_conversao`, `pericia`, `whatsapp_images` (jsonb), `web_full_images` (jsonb),
`created_at`, `descricao`, `laudo_pericia`, `opcionais`, `status_tag`,
`status_tag_color`, `vendido`, `last_seen_at`, `placa`, `motor`, `cor_interna`,
`donos_anteriores`, `garantia_fabrica`, `preco_compra`, `conteudo_atualizado_em`,
`descricao_seo`, `chassi`, `valor_fipe`, `codigo_fipe`, `first_seen_at`,
`modelo_override`, `versao_override`, `perfis_uso` (array).

Notas de contrato:
- O tipo `Veiculo` declara `fipe` e a coluna **não existe** — sai sempre vazia
  (registrado no baseline). Não criar na projeção.
- `placa`, `motor`, `cor_interna`, `donos_anteriores`, `garantia_fabrica`,
  `preco_compra` são a **ficha própria do painel** — o sync do RevendaMais
  **nunca** os mapeia (contrato no `supabase/README.md`). Na F2, a projeção
  precisa preservá-los vindos do núcleo, não do feed.

### 2.2 O mapper canônico e a régua de exibição

- `src/lib/supabase.ts` — `mapVeiculoDbToVeiculo()` (linha ~204) é o único
  tradutor DB→`Veiculo`. **Não devolve `preco_compra` nem `placa`** (decisão de
  segurança); deriva os booleanos de marketing (`cautelar_100`, `baixa_km`,
  `unico_dono`, `oportunidade_patio`…).
- `getEstoque()` filtra por **`estado_cadastro = 'publicado'`** — corrigido em
  01/09; a descrição anterior ("janela do último sync", `last_seen_at`, fração
  0,5 do ciclo de 6 h) descrevia o ramo `apenasDoUltimoSync`
  (`src/lib/supabase.ts:560-624`), que a `20260830120000_f0q` aposentou. Ele
  ainda existe como fallback e **está morto em produção**: o `select` só cai
  nele se nenhuma linha tiver `estado_cadastro`, e o backfill preencheu as 105.
  A projeção da F2 precisa reproduzir a semântica NOVA — estado declarado, não
  janela de relógio. Foi essa a razão declarada da f0q: com importação manual,
  importar UM carro o tornaria "o ciclo mais recente" e derrubaria os outros 38.
- `stock_overrides` **não é tabela**: é a linha `site_settings.id='stock_overrides'`
  mesclada por spread em 3 pontos (browser via `ThemeContext`/`applyLocalOverrides`,
  servidor, gravação em `/api/settings`) com a whitelist pública
  `CAMPOS_PUBLICOS_DE_OVERRIDE` (`src/lib/settings.ts:~141`) segurando o que vaza.
  Dívida ativa: `preco_compra` e `vendido` já viveram só no JSON — a carga da F0
  precisa reconciliar antes de virar custo/CMV no razão.

### 2.3 Quem lê (travado por teste)

`tests/nomenclatura-estoque.test.ts` trava **9 arquivos, 15 acessos** `.from("estoque_motors")`:
`lib/supabase.ts` (5), `lib/estoqueEscrita.ts` (2), `api/estoque/[id]` (2),
`api/ciclo/vendas/estoque` (1 — único que devolve chassi/placa, atrás do gate da
venda), `lib/webhook-dispatcher.ts` (1), `app/investidor/page.tsx` (1),
`api/investidores/participacoes` (1), `admin/estoque/page` (1), `admin/estoque/[id]` (1).
Consumidores públicos via `getEstoque`: home, `/estoque`, destaques, sobre, vitrine,
balcão, sitemap, feed XML do catálogo, `llms-full.txt`, `/api/match`, PDP.
Qualquer mudança de shape quebra esse conjunto — e o teste acusa.

### 2.4 O sync que alimenta

> 🔴 **Corrigido em 2026-09-01.** Este parágrafo descrevia o sync de antes de
> 29-30/08 e sobreviveu à virada. As três afirmações abaixo eram falsas quando
> conferidas contra o n8n vivo (workflow `wfYIjBaxaFFnvAYa`) e contra o banco:
> o cron de 6 h, o "já aproveita em parte" e o "intocado até a F2".

Workflow n8n "Antigravity — Sincronizador de Estoque" (`wfYIjBaxaFFnvAYa`),
feed do RevendaMais → upsert em `estoque_motors` (carimbo `last_seen_at`).

**Acionamento: manual.** O workflow está `active: false` e o nó
`scheduleTrigger` "Agendamento (a cada 6h)" está marcado `disabled` — conferido
na API do n8n em 01/09; o workflow foi alterado em 30/08 18:38. Sobrou o
gatilho manual. Foi a decisão do dono de 30/08 (`docs/PLANO_F0.md:44-52`).

**E, mesmo acionado, ele só INSERE.** A trava total (`20260829130000_f0k` +
`20260830120000_f0q:115-120`) devolve `OLD` em todo UPDATE que venha da
`service_role` ou que mexa em `last_seen_at` — silenciosamente, com 200 no
PostgREST. Carro novo nasce `origem='sync'`, `estado_cadastro='rascunho'`.

**O que o upsert grava: 22 colunas** — `id`, `marca`, `modelo`, `versao`, `ano`,
`ano_fabricacao`, `preco`, `preco_original`, `preco_promocional`,
`quilometragem`, `cambio`, `combustivel`, `cor`, `tipo`, `perfil_uso`,
`url_imagem`, `link_conversao`, `pericia`, `descricao`, `whatsapp_images`,
`web_full_images`, `last_seen_at`.

**Os quatro campos do feed continuam sendo descartados.** `VALOR_FIPE` e
`CHASSI` são lidos pelo nó "Classificação e Regras de Negócio"; `ACCESSORIES` e
`PLATE` não são sequer referenciados. Mas **nenhum dos quatro entra no corpo do
upsert** — o dado chega e morre no nó de mapeamento. A migração
`20260817140000_documento_do_estoque_e_cep.sql` criou `chassi`, `valor_fipe` e
`codigo_fipe` exatamente para acabar com isso ("três campos que o sincronizador
não lia", medidos 42/42, 40/42 e 42/42 no feed real), e o corpo do upsert nunca
foi atualizado. O que está preenchido no banco hoje veio de outro caminho e está
parcial: dos 38 da vitrine, 27 com chassi, 25 com `codigo_fipe`, 21 com
`valor_fipe`. **Corrigir isso são três linhas no upsert do n8n, não uma
migração.**

**Fotos: fechado em 31/08.** Os ativos saíram do `s3.carro57.com.br` para o
bucket `veiculos` do nosso Storage — 37 dos 38 publicados à venda (o 38º,
`8392516`, não tem foto nenhuma). Vendidos e arquivados seguem apontando para o
carro57 de propósito: quando aquele link morrer, essas fichas já terão saído do
ar pela carência de `publicacao.ts`.

---

## 3. O /admin hoje (pós-aposentadoria)

Telas: visão geral (KPIs de estoque/leads/mídia), leads kanban + funil
(etapas editáveis, ganhos e perdas — frente de 28/08), clientes e fornecedores
(agenda), estoque (tabela + editor A15), 4 telas do Ciclo (registrar venda, fila de
verificação, completude, conformidade), mídia paga, **investidores** (aportes e
participações — o que restou do financeiro), site/configurações, usuários (matriz A17).
Portais de terceiros públicos: `/garagem` (cliente) e `/investidor` (sócio).

Autorização em três camadas convergindo em `ehStaff`:
1. `src/proxy.ts` — matcher + gates por caminho (usuários=admin; investidores=
   admin/gestor/financeiro; agenda=admin/gestor/comercial/financeiro; configurações
   nega financeiro/gestor; áreas de terceiros com porteiro próprio).
2. `src/app/admin/layout.tsx` — defesa em profundidade (`profiles.papeis`).
3. `src/lib/permissoes.ts` — a matriz A17 (`PERFIS`: admin, gestor, marketing,
   comercial, financeiro; `PAPEIS_SEM_PAINEL`: cliente, investidor;
   `podeFazer`/`campoNegadoAoPerfil`; multi-papel vence o mais permissivo).
   No banco: `profiles.papeis[]` + `is_staff()`; **a régua real não é
   `app_metadata`** — nota para a fusão dos CLAUDE.md.

Padrões: design Modernist; "o que for negado some da interface, não fica cinza";
números monetários em `tabular-nums`; formulários guardados campo a campo pela matriz.

---

## 4. Integrações n8n ativas (o que a F0 não pode quebrar)

**Site → n8n** (Bearer `N8N_SECRET_TOKEN`, header `X-Admin-Event`):
- `webhook-dispatcher` → `adm-motors`: hoje emite `investidor_movimento` e eventos
  de usuário; os eventos do caixa foram aposentados em 28/08 (WEBHOOKS_N8N.md).
- `/api/leads` → `lead-entrada` (com roteamento proposta/dúvidas), `/api/avaliacao`
  → avaliação (recomendação interna no JSON — consultor decide), `/api/capi` → tracking.

**n8n → site** (Bearer próprio por rota, comparação em tempo constante):
- Motor do Ciclo: `/api/ciclo/motor/fila|desfecho|verificacao` (cron 0 9 * * *,
  workflow `jzBHXQuyVFZQMzdz`) + `/api/ciclo/vendas-incompletas` (rotina noturna).
- Funil: `/api/funil/alertas` (`FUNIL_MOTOR_TOKEN`).
- A consulta de margens foi aposentada; o workflow "Consulta Margens Mínimo"
  (já desligado) pode ser arquivado.

WhatsApp: Evolution API vive **inteiramente no n8n** — o site só formata
(telefone em dígitos, texto pronto). `next.config.ts` mantém a exceção de
redirect do alias Vercel porque 4 workflows chamam o site por ele.

---

## 5. Conflitos schema existente × spec 00 — apontados ANTES de migrar

O que o kickoff manda declarar. Estado após 28/08:

| # | Conflito | Estado / recomendação |
|---|---|---|
| 1 | `plano_contas` (spec 30) já existia | ✅ **resolvido** — aposentadoria liberou o nome |
| 2 | `veiculos` (spec 00) é o **ex-nome** de `estoque_motors` (renomeada 03/08; view compat removida 04/08; o baseline reexecutado já recriou `public.veiculos` por acidente uma vez — `AUDITORIA.md` §3.4-c) | nome está livre, mas carregado. **Recomendação: manter `veiculos` como manda a spec**, com comentário de tabela apontando a história, e uma autoconferência na migração que falhe se a tabela nascer com policies públicas (o modo de falha já visto) |
| 3 | `auditoria` (spec 00) × `auditoria_admin` existente | conviver: `auditoria` nasce para o núcleo (org_id, append-only); `auditoria_admin` segue com o painel legado até fusão decidida |
| 4 | Cadastro de **pessoas do núcleo** não existe na spec 00 (entradas citam fornecedor; negócios citam cliente) — e hoje há três cadastros: `clientes` (Ciclo), `parceiros` (agenda), `investidores` | decisão de desenho na F0, com o db-architect: ou o núcleo referencia os cadastros existentes, ou nasce `pessoas` e a agenda passa a lê-lo. **Não criar um quarto cadastro sem mapa** |
| 5 | Identidade do veículo: núcleo = chassi/uuid × site = `id integer` do anúncio RevendaMais (e `contas.veiculo_id TEXT` morreu com o caixa) | tabela de correspondência na carga (F0) e na projeção (F2) — o site continua emitindo o `id integer` de hoje |
| 6 | `org_id default org_padrao()` só nas tabelas novas | aditivo, sem conflito — tabelas existentes ficam como estão nesta janela |
| 7 | RLS da projeção F2 | `estoque_motors` hoje tem leitura anônima (o site é público) — a projeção precisa preservar exatamente essas policies |
| 8 | `veiculos_vendidos` (Ciclo) × núcleo | 0 linhas; no porte (F1/F2) vira leitura do núcleo — mapa de campos previsto na spec 40, mecânica já decidida pela Emenda 02 |

---

## 6. O que a F0 reusa pronto

- `supabase/manutencao/aplicar-migracao.js` — ensaio BEGIN/ROLLBACK contra produção
  antes de `--gravar` (o staging que o projeto não tem), livro-razão com rodapé.
- `supabase/testes/` — andaime que roda migrações num Postgres local.
- O padrão de **autoconferência dentro da migração** (RAISE EXCEPTION no aceite).
- 87 arquivos de teste (vitest) incluindo os guardas de nomenclatura, colunas,
  rotas, permissões e migrações.
- A análise "Handoff × Sistema Vivo" (artifact) — dossiês de RENAVE/NF-e, mercado
  de integradoras e critérios de decisão para a trilha do dono.
