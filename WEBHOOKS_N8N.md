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

| Campo no painel | Env de fallback | Padrão de código |
|---|---|---|
| `webhookUrl` | `N8N_WEBHOOK_LEAD_URL` | `https://n8n.v2o5.com.br/webhook/lead-entrada` |
| `webhookPropostaUrl` | — (cai em `webhookUrl`) | mesma URL acima |
| `webhookDuvidasUrl` | — (cai em `webhookUrl`) | mesma URL acima |
| `webhookAvaliacaoUrl` | `N8N_WEBHOOK_AVALIACAO_URL` | `https://n8n.v2o5.com.br/webhook/sdr-captura-lead` |
| `webhookNotificacoesUrl` | `N8N_ADMIN_WEBHOOK_URL` | **nenhum — vazio** |
| `apiSecretToken` | `N8N_SECRET_TOKEN` | vazio |

**Autenticação:** quando `apiSecretToken` está preenchido, todo POST leva
`Authorization: Bearer <token>`. Quando está vazio, o header simplesmente não
vai — o n8n precisa aceitar os dois casos, ou o token precisa ser obrigatório
dos dois lados. Hoje é opcional, o que significa que **qualquer um que
descubra a URL do webhook consegue injetar lead falso**.

> ⚠️ `webhookNotificacoesUrl` não tem padrão de código. Se ninguém preencheu no
> painel e a env não existe, todo evento administrativo sai por um
> `console.info` e morre sem erro. Ver "Modos de falha".

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
| `canal` | `"N/A"` se ausente. Valores em uso: `WhatsApp Card`, `WhatsApp PDP`, `CarMatch Recommendations`, `Appraisal Chat`, `WhatsApp Proposta`, `WhatsApp Dúvidas` |
| `tipo` | `"lead_whatsapp"` por padrão |
| `cliente.nome` | **único campo obrigatório** — a rota rejeita com 400 sem ele |
| `cliente.email` / `cliente.whatsapp` | podem ser `""` |
| `veiculo` | objeto do estoque ou `null` |
| `ag_uid` | `"ag_ref_nao_localizado"` quando não há cookie |

**Captcha:** os canais listados acima exigem token Turnstile válido; sem ele a
rota devolve 400/403 e **nada é enviado ao n8n**.

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
| qualquer outro | o payload cru, sem enriquecimento |

`categoria` vem como `"🔧 Peça de Reposição"` (ícone + nome), não como id.
`veiculo` vem como `"BMW 320i (2022)"`, não como id. `valor` é number.

**Liga/desliga por evento:** `webhooks.events[nomeDoEvento] === false` bloqueia
o disparo. Ausente = habilitado.

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

3. **Sem retentativa em nenhum formato.** Um POST, um `fetch`, sem fila e sem
   backoff. n8n fora do ar por 10 minutos = os leads daquele intervalo existem
   só no Supabase.

4. **Sem idempotência.** Não há chave de deduplicação no corpo. Se o visitante
   clicar duas vezes, chegam dois eventos indistinguíveis. `ag_uid` identifica
   a sessão, não o evento.

---

## Pendências conhecidas

- [ ] Confirmar que `webhookNotificacoesUrl` está preenchido em produção
- [ ] Decidir se `apiSecretToken` passa a ser obrigatório (hoje a URL sozinha
      basta para injetar lead)
- [ ] Alinhar UTM: aninhado no Formato A, plano no Formato B
- [ ] Avaliar chave de idempotência para o clique duplo
