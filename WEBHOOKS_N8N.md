# WEBHOOKS_N8N.md

Contrato dos webhooks que o site emite para o n8n. **O site é o emissor; este
documento descreve o que ele manda.** Se um workflow do n8n espera algo que não
está aqui, o workflow está errado ou o contrato mudou sem aviso — as duas coisas
são bug.

Levantado em 2026-08-10 a partir do código. Travado por
`tests/webhooks-contrato.test.ts`: mudar um campo sem atualizar este arquivo
quebra o teste de propósito.

---

## Configuração

Tudo vive na linha `webhooks` de `site_settings` (Supabase), editável em
**Painel → Integrações e webhooks**. Variáveis de ambiente são só fallback.

Desde 2026-08-12 essa linha **não é legível pela chave `anon`** (migração
`20260812120000_rls_leitura_de_site_settings.sql`). Consequência prática para
quem mexer aqui: todo caminho de servidor que precise dela tem de ler por
`getCachedSettings`, que usa `SUPABASE_SERVICE_ROLE_KEY`. Um `select` direto
com o cliente da requisição num endpoint sem sessão — `/api/leads`,
`/api/avaliacao`, `/api/financeiro/margens/consulta` — volta `null` e o lead
sai sem `Authorization`, sem erro nenhum. `tests/settings-leitura-privilegiada.test.ts`
falha se isso voltar.

| Campo no painel | Env de fallback | Padrão de código |
|---|---|---|
| `webhookUrl` | `N8N_WEBHOOK_LEAD_URL` | `https://n8n.v2o5.com.br/webhook/lead-entrada` |
| `webhookPropostaUrl` | — (cai em `webhookUrl`) | mesma URL acima |
| `webhookDuvidasUrl` | — (cai em `webhookUrl`) | mesma URL acima |
| `webhookAvaliacaoUrl` | `N8N_WEBHOOK_AVALIACAO_URL` | `https://n8n.v2o5.com.br/webhook/sdr-captura-lead` |
| `webhookNotificacoesUrl` | `N8N_ADMIN_WEBHOOK_URL` | **nenhum — vazio** |
| `apiSecretToken` | `N8N_SECRET_TOKEN` | vazio |

**Autenticação:** quando o token está preenchido, todo POST leva
`Authorization: Bearer <token>`. Quando está vazio, o header simplesmente não
vai. Para os webhooks de lead e de avaliação isso segue opcional — **qualquer
um que descubra a URL consegue injetar lead falso**. O `adm-motors` é a
exceção: desde 2026-08-12 o nó de webhook exige `headerAuth`, e um POST sem o
Bearer certo leva 403.

> ⚠️ **Não preencha `apiSecretToken` pelo painel.** O token oficial vive em
> `N8N_SECRET_TOKEN` na Vercel, e o campo do painel fica vazio de propósito —
> decisão do dono em 2026-08-12. A motivação original era a RLS: `site_settings`
> era legível pela chave anônima e digitar o token no painel era publicá-lo. A
> RLS foi fechada no mesmo dia (migração
> `20260812120000_rls_leitura_de_site_settings`), mas a decisão fica: uma fonte
> só, e é a env.
>
> Efeito colateral da RLS, para registro histórico: entre a aplicação da
> migração e o merge do código compensatório (ambos em 2026-08-12), `/api/leads`
> e `/api/avaliacao` liam a linha `webhooks` com o cliente sem sessão, recebiam
> vazio e rodavam no fallback de env/código. Para lead o fallback coincidia com
> o caminho certo (`lead-entrada`); para avaliação apontava para
> `sdr-captura-lead`, desligado — os webhooks de avaliação dessa janela se
> perderam (os pedidos ficaram na tabela `leads`). Com `86b6e5f` no ar, as duas
> rotas leem por `getCachedSettings` e as URLs do painel voltaram a valer.

> ⚠️ `webhookNotificacoesUrl` não tem padrão de código. Se ninguém preencheu no
> painel e a env não existe, todo evento administrativo sai por um
> `console.info` e morre sem erro. Ver "Modos de falha".
>
> Em produção ele **está** preenchido, apontando para
> `https://n8n.v2o5.com.br/webhook/adm-motors` (confirmado em 2026-08-12). O
> workflow desse endereço está **ativo com `headerAuth`** desde o mesmo dia —
> POST sem o Bearer certo leva 403. Entre 2026-07-07 e 2026-08-12 ele esteve
> desligado: os eventos administrativos daquele período levaram **404** e
> viraram `console.warn`, sem retentativa.

> ⚠️ Preencher o token liga uma trava do lado de **entrada** também:
> `/api/financeiro/margens/consulta` valida o mesmo `Bearer` e passa a devolver
> 401 sem ele. O chamador é o workflow "Consulta Margens Mínimo - Motors", hoje
> desligado e com o literal `SEU_TOKEN_CONFIGURADO` no header — precisa ser
> atualizado antes de ser ligado.

---

## Formato A — Lead de atendimento

**Origem:** `POST /api/leads` → `src/app/api/leads/route.ts`
**Destino:** `webhookPropostaUrl` se `canal === "WhatsApp Proposta"`,
`webhookDuvidasUrl` se `canal === "WhatsApp Dúvidas"`, senão `webhookUrl`.

Os três apontam para a mesma URL por padrão e mandam **exatamente o mesmo
JSON**. Quem separa proposta de dúvida é o campo `canal` de dentro do corpo,
não o endereço. Configurar URLs distintas no painel é opcional.

```json
{
  "remoteJid": "5541999990000@s.whatsapp.net",
  "telefone": "5541999990000",
  "canal": "WhatsApp PDP",
  "mensagem": "",
  "tipo": "lead_whatsapp",
  "cliente": { "nome": "Fulano", "email": "", "whatsapp": "(41) 99999-0000" },
  "veiculo": null,
  "utm": {},
  "intencao_busca": {},
  "ag_uid": "ag_ref_nao_localizado",
  "created_at": "2026-08-10T17:00:00.000Z"
}
```

| Campo | Garantia |
|---|---|
| `remoteJid` | `""` quando não há telefone — **não** assuma que sempre existe |
| `telefone` | só dígitos, com `55` na frente; `""` se o visitante não informou |
| `canal` | `"N/A"` se ausente. Valores em uso: `WhatsApp Proposta`, `WhatsApp Dúvidas`, `WhatsApp Usado na Troca`, `Agendamento Test-Drive`, `Simulação de Financiamento`, `Appraisal Chat`, `Garagem Match Profiler`, `Lead Popup`, `Formulário Contato`. Históricos que a rota ainda aceita: `WhatsApp Card`, `WhatsApp PDP`, `CarMatch Recommendations` |
| `tipo` | `"lead_whatsapp"` por padrão |
| `cliente.nome` | **único campo obrigatório** — a rota rejeita com 400 sem ele |
| `cliente.email` / `cliente.whatsapp` | podem ser `""` |
| `veiculo` | objeto do estoque ou `null` |
| `ag_uid` | `"ag_ref_nao_localizado"` quando não há cookie |

**Captcha:** todo canal que nasce no modal de captura (`LeadCaptureModal`)
exige token Turnstile válido — ou seja, todos os valores em uso acima, exceto
`Formulário Contato`, cujo formulário não renderiza Turnstile. Sem token a
rota devolve 400/403 e **nada é enviado ao n8n** (nem gravado em `leads`).
Desde 2026-08-19 isso inclui o `Lead Popup`: o clique no CTA da campanha
deixou de postar lead com nome fixo "Lead Popup" — o visitante confirma o
nome real no mesmo modal dos outros fluxos, e só então o lead sai.

---

## Formato B — Avaliação de veículo

**Origem:** `POST /api/avaliacao` → `src/app/api/avaliacao/route.ts`
**Destino:** `webhookAvaliacaoUrl`

Note que os UTMs aqui são **planos no topo**, e não aninhados em `utm` como no
Formato A. É inconsistente com o Formato A, mas está em produção — não mude sem
alinhar o workflow.

```json
{
  "remoteJid": "5541999990000@s.whatsapp.net",
  "telefone": "5541999990000",
  "marca": "BMW", "modelo": "320i", "ano": 2022,
  "estado": "...", "estado_mecanico": "...", "estado_conservacao": "...",
  "quilometragem": 30000,
  "observacoes": "", "nome": "Fulano", "tipo_veiculo": "carro",
  "fipe_valor": "", "fipe_codigo": "", "fipe_mes_referencia": "",
  "recomendacao": { },
  "ag_uid": "...",
  "utm_source": "...", "utm_medium": "...", "utm_campaign": "...",
  "created_at": "2026-08-10T17:00:00.000Z"
}
```

**`recomendacao` é interna.** É a faixa de compra sugerida ao consultor, sempre
recalculada no servidor a partir do estado e da km — nunca copiada do corpo da
requisição, porque o cliente é público e não pode ditar o preço que o consultor
lê. **O cliente nunca vê esse valor no site.** Regra em
`src/lib/avaliacaoRecomendacao.ts`.

`quilometragem` é `null` quando não informada — não é `0`.

---

## Formato C — Evento administrativo

**Origem:** `src/lib/webhook-dispatcher.ts` e
`/api/financeiro/notificacoes/processar`
**Destino:** `webhookNotificacoesUrl`
**Header extra:** `X-Admin-Event: <nome do evento>`

```json
{
  "event": "conta_criada",
  "timestamp": "2026-08-10T17:00:00.000Z",
  "data": { }
}
```

O conteúdo de `data` depende do prefixo do evento, e vem **enriquecido** — o
dispatcher resolve ids em nomes legíveis antes de enviar:

| Prefixo | `data` contém |
|---|---|
| `conta_` | `id, tipo, descricao, valor, vencimento, pagamento, status, categoria, parceiro, forma_pagamento, parcela` |
| `recorrente_` | `id, descricao, valor, frequencia, dia_vencimento, categoria, fornecedor, forma_pagamento, ativa` |
| `compra_` | `id, descricao, valor, data_compra, categoria, fornecedor, veiculo, nota_fiscal, status` |
| `fornecedor_` | `id, nome, tipo, documento, telefone, email` |
| `investidor_` | `id, investidor, tipo, valor, data, descricao, forma_pagamento, veiculo, observacoes` |
| qualquer outro | o payload cru, sem enriquecimento |

`categoria` vem como `"🔧 Peça de Reposição"` (ícone + nome), não como id.
`veiculo` vem como `"BMW 320i (2022)"`, não como id. `valor` é number.

O evento do prefixo `investidor_` hoje é um só: `investidor_movimento`, emitido
a cada aporte ou retirada registrado no painel (2026-08-21). `investidor` vem
como nome, `tipo` é `"aporte"` ou `"retirada"` e `valor` é **sempre positivo** —
o lado mora em `tipo`, como nos contadores de `conta_vencida`. `veiculo` só vem
preenchido quando a movimentação é um carro de repasse.

**Liga/desliga por evento:** `webhooks.events[nomeDoEvento] === false` bloqueia
o disparo. Ausente = habilitado.

### `conta_vencida` — a segunda origem do Formato C

`conta_vencida` é o único evento que **não** sai do dispatcher. Quem emite é
`POST /api/financeiro/notificacoes/processar`, e ele monta o envelope à mão.

Até 2026-08-12 essa rota mandava uma forma própria — `{ tipo:
"notificacao_financeira", subtipo, conta, mensagem }`, sem `event` e sem `data`.
O `adm-motors` rejeitava com "Payload inválido" e o template de `conta_vencida`
nunca rodou. Hoje ela emite o Formato C, com os mesmos campos do prefixo
`conta_` mais três:

| Campo extra | Significado |
|---|---|
| `subtipo` | `"vencimento_proximo"` (3 ou 1 dia antes) ou `"vencido"` (no dia ou 7 dias depois) — é o mesmo valor gravado em `notificacoes_financeiras.tipo` |
| `dias_atraso` | dias vencidos; `0` quando ainda não venceu ou vence hoje |
| `dias_para_vencer` | dias restantes; `0` quando já venceu |

Os dois contadores são sempre `>= 0`: quem lê não precisa interpretar sinal.
O evento cobre os dois lados do vencimento porque é isso que o rótulo do painel
promete — "Contas Vencidas / Alertas de Vencimento" é um checkbox só.

**`mensagem` não vai no corpo.** Quem formata texto de WhatsApp é o n8n, para os
onze eventos. A rota ainda monta o seu próprio texto, mas só para gravar em
`notificacoes_financeiras` como registro do que motivou o aviso — os dois textos
não são o mesmo e não precisam ser.

Essa rota **grava o registro só quando o webhook responde ok**. Enquanto o n8n
recusar, ela reprocessa as mesmas contas a cada execução.

---

## Modos de falha — o que o n8n não vê

Isto é o que mais importa para quem depura do outro lado.

1. **Lead nunca bloqueia.** Se o webhook do Formato A responde 500, cai a
   conexão ou expira, o site **segue normalmente** e o visitante vai para o
   WhatsApp. O erro vira `console.warn` na Vercel. Deliberado: perder o
   registro é ruim, travar o contato é pior. Consequência: **não dá para
   confiar no n8n como registro completo de leads.** A tabela `leads` do
   Supabase é a fonte, gravada em paralelo (também sem bloquear).

2. **Formato C pode nunca sair.** `webhookNotificacoesUrl` vazio + env ausente
   = todo evento administrativo morre num `console.info`. Sem erro, sem alerta,
   sem retentativa. É o mesmo padrão que já matou o módulo de margem por
   veículo neste projeto.

   Desde a RLS de `site_settings` (2026-08-12) há um segundo jeito de cair
   nesse buraco: o dispatcher lê a linha `webhooks` com
   `SUPABASE_SERVICE_ROLE_KEY` **ou a anônima como fallback** — e a anônima
   agora recebe vazio. Se a service key não estiver na Vercel, todo Formato C
   morre no mesmo `console.info` ("settings not found"), com URL e tudo
   preenchidos no painel.

3. **Sem retentativa em nenhum formato.** Um POST, um `fetch`, sem fila e sem
   backoff. n8n fora do ar por 10 minutos = os leads daquele intervalo existem
   só no Supabase.

4. **Sem idempotência.** Não há chave de deduplicação no corpo. Se o visitante
   clicar duas vezes, chegam dois eventos indistinguíveis. `ag_uid` identifica
   a sessão, não o evento.

---

## Pendências conhecidas

- [x] **Fechar a leitura anônima de `site_settings`** — resolvido em 2026-08-12
      por `supabase/migrations/20260812120000_rls_leitura_de_site_settings.sql`.
      A tabela inteira respondia à chave `anon`, a mesma que vai no bundle do
      navegador: `apiSecretToken` saía para qualquer visitante que falasse com
      o PostgREST direto, pulando o `/api/settings`. Agora o anônimo lê só o
      recorte que alimenta as páginas públicas; `webhooks`, `stock_overrides` e
      `bank_balances` exigem sessão ou a chave de serviço.
- [x] **Fechar a ESCRITA anônima de `site_settings`** — aplicado em produção em
      2026-08-12 (`20260812150000_rls_escrita_de_site_settings.sql`). Até
      então, `PATCH` com a anon key respondia 200: qualquer pessoa reescrevia
      `webhookUrl` e desviava todo lead do site, sem login e sem rastro no
      painel. Agora INSERT/UPDATE exigem `authenticated`. Detalhes e prova em
      `AUDITORIA.md §3.4-b`.
- [x] **Subir o código que acompanha a RLS** — mergeado no `main` em 2026-08-12
      (`86b6e5f`). Com ele no ar, `/api/leads` e `/api/avaliacao` voltam a
      enxergar as URLs do painel via `getCachedSettings`; na janela entre a
      migração e o deploy, o webhook de avaliação caiu no fallback
      `sdr-captura-lead` (desligado) e se perdeu — os pedidos ficaram gravados
      na tabela `leads`.
- [x] Confirmar que `webhookNotificacoesUrl` está preenchido em produção —
      está, e aponta para o `adm-motors` (2026-08-12)
- [x] `apiSecretToken` **passou a ser obrigatório em
      `/api/financeiro/margens/consulta`** (2026-08-12). Só naquela rota, e
      por um motivo específico: ela agora lê `contas` e `compras_produtos` com
      a chave de serviço, então a RLS deixou de ser a rede de segurança que
      segurava o dado financeiro. Sem token configurado (nem no painel nem em
      `N8N_SECRET_TOKEN`) a rota responde **503**, não 200 aberto. Como
      `apiSecretToken` está vazio no banco por decisão, a rota depende de
      `N8N_SECRET_TOKEN` existir na Vercel — se sumir, a ficha de margem para
      de responder de forma visível, não silenciosa.
- [x] Decidir se o token passa a ser obrigatório nos webhooks — sim. O
      `adm-motors` exige `headerAuth` desde 2026-08-12; lead e avaliação
      entram na sequência (item abaixo). Com a leitura de `site_settings`
      fechada, o valor até PODERIA voltar ao campo do painel sem vazar; a
      decisão vigente continua sendo fonte única em `N8N_SECRET_TOKEN` na
      Vercel, com o campo do painel vazio de propósito.
- [ ] Confirmar que `SUPABASE_SERVICE_ROLE_KEY` existe na Vercel — depois da
      RLS, é ela que mantém o dispatcher e o `getCachedSettings` enxergando a
      linha `webhooks` (ver "Modos de falha", item 2)
- [ ] Ligar `headerAuth` também nos webhooks de lead e de avaliação — combinado
      em 2026-08-12; aguarda o deploy pós-merge carregar o `N8N_SECRET_TOKEN`
      novo e a confirmação da chave de serviço acima
- [x] Trocar a apikey da Evolution por credencial do n8n — feito em 2026-08-12
      nos dois (`adm-motors` e `sdr-manychat-motors`), credencial
      "Evolution — apikey (v2o5)"
- [x] Substituir o `NoOp` do ramo de log — agora é INSERT em
      `notificacoes_admin` (migração de tabela própria; ver nota de versão no
      arquivo), RLS de leitura `TO authenticated`, escrita só pela chave de
      serviço do n8n
- [ ] **`manychat-lead` responde 500 para qualquer POST** — "No authentication
      data defined on node!": a credencial "Motors auth" do webhook não resolve.
      Pré-existente (verificado em 2026-08-12: nó idêntico antes e depois das
      mudanças do dia, zero execuções registradas). Enquanto estiver assim, o
      fluxo do ManyChat está morto; consertar exige recriar a credencial e
      atualizar o segredo do lado do ManyChat
- [ ] A credencial `supabase_motors` antiga do n8n aponta para um host que não
      conecta; a válida é "Supabase Motors (zwbqmzgnagfeqinqkolp)". O workflow
      parado "leads REVENDA supabase motors" ainda referencia a antiga
- [ ] Alinhar UTM: aninhado no Formato A, plano no Formato B
- [ ] Avaliar chave de idempotência para o clique duplo
