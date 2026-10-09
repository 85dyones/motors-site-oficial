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
`/api/avaliacao` — volta `null` e o lead sai sem `Authorization`, sem erro
nenhum. `tests/settings-leitura-privilegiada.test.ts` falha se isso voltar.

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

> A consulta de margens (`/api/financeiro/margens/consulta`), que validava o
> mesmo `Bearer` no sentido de entrada, foi **aposentada em 2026-08-28** com o
> módulo de caixa. O workflow "Consulta Margens Mínimo - Motors" já estava
> desligado no n8n e agora não tem endpoint — pode ser arquivado.

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
| `intencao_busca` | objeto livre, `{}` por padrão. No canal `Garagem Match Profiler` (desde 2026-09-25) traz o pedido e os carros — ver abaixo |

**`intencao_busca` do Garagem Profiler.** O `perfil_curadoria` que o
`CarMatch` monta **não** chega aqui: a rota repassa só os campos da tabela
acima. Por isso o que o consultor precisa ler vai em `intencao_busca`:

```json
{
  "aiQuery": "",
  "budgetTab": "presets",
  "modo": "carros",
  "orcamento": "de R$ 75 mil a R$ 115 mil",
  "filtros": ["de R$ 75 mil a R$ 115 mil", "4 portas ou mais"],
  "afrouxados": [],
  "prazo": "No próximo mês",
  "perfil": {
    "leva": "Família, criança na cadeirinha",
    "jeitos": ["SUV", "Sedã"],
    "cambio": "Prefiro automático",
    "nao_pode_faltar": ["Câmera de ré"]
  },
  "na_faixa": 4,
  "carros": [
    {
      "id": "8449096",
      "nome": "Kia Soul 2016",
      "preco": 76900,
      "lugar": "principal",
      "manchete": "O mais barato dos três. Sobram R$ 38.100 do seu teto.",
      "pesa_contra": "Não atende 2020 ou mais novo: é 2016."
    }
  ]
}
```

`modo` é `carros` (QUERO VER ESTE — `carros` traz os escolhidos, ou os três
do resultado), `aviso` (ME AVISE QUANDO CHEGAR — `carros` vazio) ou `ajuda`
(a consulta ao estoque falhou — `carros` vazio). `lugar` é `principal`,
`tambem`, `outro-caminho`, `abaixo-da-faixa` ou, desde a fase 2, `ja-pensou`
(a carta "Já pensou neste?", que só entra quando o cliente tocou FAZ SENTIDO;
nela a `manchete` lista o que o carro ganha e `pesa_contra` o que muda).
`filtros`, `afrouxados`, `perfil.jeitos` e `perfil.nao_pode_faltar` são
listas: um nó que concatene o objeto em texto precisa tratá-las, senão sai
`[object Object]`. A `mensagem` do lead já nomeia os carros em texto corrido.

**POR MÊS (2026-09-27).** Quando o cliente responde o orçamento pela parcela,
`budgetTab` vem `"porMes"` e `intencao_busca` ganha:

```json
"por_mes": {
  "parcela": 1500,
  "entrada": 20000,
  "prazo": 48,
  "ocupacao": "CLT (carteira assinada)",
  "troca": true
}
```

`entrada` é a **estimativa do cliente** (dinheiro e o que ele espera que o
carro da troca cubra), não avaliação da loja; `troca: true` diz só que há
carro para avaliar. Cada item de `carros` ganha `parcela` (a estimativa que a
tela mostrou, pela média de mercado de 12 bancos; `null` fora do POR MÊS), e o
primeiro filtro vira `"parcela até R$ 1.500/mês em 48×, com R$ 20 mil de
entrada"`. Fora do POR MÊS, `por_mes` vem `null`.

**Fase 2 (perguntas-fato, 2026-09-25).** `perfil` traz as respostas das
perguntas 02 a 05 como o cliente as tocou (rótulo, não id); pergunta pulada
ou não respondida vem `""` ou `[]` — a 03 some para quem leva carga, e a 04
some quando tudo o que sobrou tem o mesmo câmbio. `prazo` deixou de ser
pergunta do quiz e virou escolha opcional no resultado: vem `""` quando o
cliente não tocou. `na_faixa` é quantos carros passavam em tudo na faixa
(`null` quando a consulta ao estoque falhou). Leads do Profiler anteriores à
fase 2 não têm `perfil` nem `na_faixa`. O mesmo objeto, validado, é gravado
em `leads.perfil` e aparece no card do kanban (`lib/perfilDoLead.ts`).

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
  "veiculo_digitado": false,
  "recomendacao": { },
  "ag_uid": "...",
  "utm_source": "...", "utm_medium": "...", "utm_campaign": "...",
  "created_at": "2026-08-10T17:00:00.000Z"
}
```

**`recomendacao` é interna.** É a faixa de compra sugerida ao consultor, sempre
recalculada no servidor a partir do estado, da km e do ano — nunca copiada do
corpo da requisição, porque o cliente é público e não pode ditar o preço que o
consultor lê. **O cliente nunca vê esse valor no site** (desde 2026-09-24 o
formulário nem a calcula mais). Regra em `src/lib/avaliacaoRecomendacao.ts`.

Desde 2026-09-24 a régua é a **curva de deságio de `parametros_avaliacao`**
(spec 11), no lugar das três faixas fixas de 2026-08-06. O formato mudou:

- `faixa`: `excepcional` · `com_avarias` · `padrao` · `acima_do_teto` (antes:
  `otimo` · `reparos_leves` · `avarias_maiores`);
- `desconto_min` / `desconto_max`: sempre número (antes o máximo podia ser
  `null`);
- `componentes`: a conta, um item por parcela (`nome`, `pp_min`, `pp_max`,
  `motivo`) — base, km contra o esperado para a idade, avarias, estado
  excepcional;
- `acima_do_teto`, `km_esperado`, `km_desvio`, `regra`, `parametros_id`,
  `parametros_desde`: novos. `regra` é `curva_spec11_<data>` — a data é a da
  composição da conta no código; compare pelo prefixo `curva_spec11`;
- `km_esperado` e `km_desvio` são `null` sem km ou sem ano-modelo legível
  (o degrau de km fica para a vistoria e vira um item de `sinais`);
- `km_acima_do_limite`: **saiu** (a curva não tem mais limite fixo de 150 mil
  km; o km entra pelo desvio sobre o esperado);
- `sinais`, `faixa_label`, `resumo`: seguem, com o mesmo sentido. `sinais`
  agora traz também o alerta de hodômetro (km baixo demais para a idade);
- `valor_sugerido_min` / `valor_sugerido_max`: seguem, e vêm **`null`**
  quando `acima_do_teto` é `true` (não é compra: recusar ou repasse) ou
  quando a FIPE do envio não é legível.

`recomendacao` pode chegar **`null`**: quando a linha vigente de
`parametros_avaliacao` não é legível, a avaliação segue sem sugestão — nunca
com uma régua inventada no código.

`quilometragem` é `null` quando não informada — não é `0`.

`veiculo_digitado` (desde 2026-09-24) é `true` quando a Tabela FIPE não
respondeu no formulário e o cliente digitou marca, modelo e ano à mão. Nesse
caso `fipe_*` chegam vazios e a `recomendacao` vem sem valor sugerido — o
consultor confere a FIPE. Campo aditivo: o workflow que não o lê segue igual.

O mesmo pedido fica gravado no lead (`leads.avaliacao`, migração
`20260924190000`), com a recomendação e a régua que a produziu — é de lá que o
card do kanban lê. O webhook deixou de ser o único lugar onde esses dados
existem.

---

## Formato C — Evento administrativo

**Origem:** `src/lib/webhook-dispatcher.ts`
**Destino:** `webhookNotificacoesUrl`
**Header extra:** `X-Admin-Event: <nome do evento>`

```json
{
  "event": "investidor_movimento",
  "timestamp": "2026-08-10T17:00:00.000Z",
  "data": { }
}
```

O conteúdo de `data` depende do prefixo do evento, e vem **enriquecido** — o
dispatcher resolve ids em nomes legíveis antes de enviar:

| Prefixo | `data` contém |
|---|---|
| `investidor_` | `id, investidor, tipo, valor, data, descricao, forma_pagamento, veiculo, observacoes` |
| qualquer outro | o payload cru, sem enriquecimento |

`veiculo` vem como `"BMW 320i (2022)"`, não como id. `valor` é number.

O evento do prefixo `investidor_` hoje é um só: `investidor_movimento`, emitido
a cada aporte ou retirada registrado no painel (2026-08-21). `investidor` vem
como nome, `tipo` é `"aporte"` ou `"retirada"` e `valor` é **sempre positivo** —
o lado mora em `tipo`. `veiculo` só vem preenchido quando a movimentação é um
carro de repasse.

> **Aposentados em 2026-08-28**, junto com o módulo de caixa (decisão do dono:
> nada ali tinha dado real, e o financeiro renasce sobre o razão do handoff):
> os prefixos `conta_` (criada, paga, atualizada, deletada, aguardando
> aprovação, aprovada, recusada), `recorrente_` (idem), `compra_registrada`,
> `fornecedor_criado` e o `conta_vencida` — o único que não saía do dispatcher
> (a rota `/api/financeiro/notificacoes/processar` montava o envelope à mão, e
> foi aposentada junto). O contrato completo desses eventos está no git deste
> arquivo; quando o razão emitir eventos financeiros, eles entram aqui com
> nomes novos, e os templates antigos do `adm-motors` podem ser removidos.

**Liga/desliga por evento:** `webhooks.events[nomeDoEvento] === false` bloqueia
o disparo. Ausente = habilitado.

---

## Sentido inverso — o n8n pergunta, o site responde

Duas rotas invertem a direção deste documento: aqui o site é o **chamado**, não
o emissor. Quem bate é o n8n, sem sessão, com um Bearer próprio.

| Rota | Segredo | O que devolve |
|---|---|---|
| `POST /api/ciclo/motor/fila` | `CICLO_MOTOR_TOKEN` | A fila de gatilhos do Motors Ciclo (manual §4.1). |
| `POST /api/funil/alertas` | `FUNIL_MOTOR_TOKEN` | A fila de avisos do funil de leads: lead sem dono, lead parado e lead a transferir. |
| `POST /api/chatwoot/eventos` | `CHATWOOT_WEBHOOK_TOKEN` | Nada de útil no corpo — é o Chatwoot **contando** o que houve. Cria o lead e para o relógio da estagnação. |

**Cada uma tem o SEU segredo, sem fallback entre eles.** Segredo mede acesso: a
base de leads do site e a base de clientes do Ciclo são dois conjuntos de dados
e dois workflows, e quem tem a credencial de um não deveria puxar o outro. Um
`||` para o token vizinho economizaria uma variável de ambiente e criaria uma
escada de privilégio silenciosa — foi exatamente o achado #9 da revisão de
2026-08-18, quando a porta do Ciclo aceitava o token de margens.

Sem a variável configurada, a rota responde **503** e não 401: o problema é de
configuração nossa, e 401 mandaria o n8n tentar outro token para sempre.

### `POST /api/funil/alertas` (2026-08-28)

```
Authorization: Bearer $FUNIL_MOTOR_TOKEN
{ "reservar": true }
```

```jsonc
{
  "ok": true, "reservado": true, "total": 2,
  "fila": [{
    "lead_id": "…",
    "aviso": "transferencia",          // atribuicao | estagnacao | transferencia
    "lead": { "nome": "…", "whatsapp": "5541…", "interesse": "Onix 2020",
              "etapa": "Proposta", "minutos_parado": 7300 },
    "destinatario": { "nome": "Carla", "whatsapp": "5541…" },
    "responsavel_anterior": "Bruno",
    "mensagem": "…"                     // pronto para a Evolution
  }],
  "suprimidos": [{ "lead_id": "…", "suprimido_por": "alerta_recente", … }]
}
```

O workflow acorda de hora em hora, chama com `reservar: true` e envia
`mensagem` para `destinatario.whatsapp`. **Nenhuma regra de horário ou de prazo
mora no workflow** — quem decide quem está parado, se pode avisar agora e para
quem vai o lead transferido é `montar_fila_do_funil`, no banco. Um workflow
desligado atrasa mensagem; um workflow reconfigurado por engano não consegue
redistribuir a carteira de um vendedor.

`"reservar": false` é prévia: mostra o que aconteceria, não grava e não
transfere. **A transferência só acontece com `reservar: true`**, no mesmo
comando que produz a mensagem — não existe troca de dono sem alguém ser
avisado.

`suprimidos` traz o que ficou de fora **com o motivo**. Fila que descarta em
silêncio é fila que ninguém audita.

O workflow está versionado em `Motors Funil — Alertas de Estagnação.json`, na
raiz. Importe, crie a credencial Header Auth `FUNIL_MOTOR_TOKEN`
(`Authorization: Bearer <token>`), preencha `WHATSAPP_GESTAO` no nó
*Distribuir os avisos* e ative — ele é importado desligado de propósito.

Ele acorda de hora em hora todo dia: a régua de horário é da ROTA, não do
cron, para não existir em dois lugares. E a execução termina vermelha se algum
aviso de vendedor não for entregue — a rota já transferiu o lead nesse ponto, e
entrega que falha calada é transferência sem aviso.

A régua completa está em `docs/FUNIL_DE_VENDAS.md`.

### `POST /api/chatwoot/eventos` (2026-09-15)

O webhook do Chatwoot, recebido **direto** — sem o n8n no meio. Quem quiser
mediar pelo n8n pode: o corpo é repassado verbatim e o contrato é o mesmo.

```
POST /api/chatwoot/eventos?token=$CHATWOOT_WEBHOOK_TOKEN
{ "event": "message_created", "message_type": "outgoing",
  "conversation": { "id": 412, "status": "open", "inbox_id": 11,
                    "meta": { "sender": { "id": 88, "name": "Fulano",
                                          "phone_number": "+5541999990000" } } },
  "sender": { "id": 3, "type": "user", "name": "Ana" } }
```

**Duas formas de autenticar, e as duas existem por necessidade.**
`Authorization: Bearer` é a preferida e é o que o n8n usa. O `?token=` existe
porque o webhook **nativo** do Chatwoot (Configurações → Integrações →
Webhooks) não tem campo de cabeçalho — só URL. Sem essa metade, ligar o
Chatwoot direto seria impossível e o lead voltaria a depender do n8n para
existir. Token em URL entra em log de proxy: por isso ele é um segredo de
menor valor, próprio desta rota, e **não deve ser reaproveitado de nenhuma
outra** — a régua de "segredo mede acesso" de 2026-08-18 vale aqui igual.

O que cada evento faz:

| Evento | Efeito |
|---|---|
| `message_created` + `incoming` | Abre/atualiza o atendimento e **cria o lead** se o telefone ainda não tem um. |
| `message_created` + `outgoing` **de agente humano** | Chama `registrar_contato_do_lead` — reinicia `ultimo_contato_em` e zera `alertado_em`. |
| `message_created` + `outgoing` **automática** | Ignorado, de propósito (ver abaixo). |
| `conversation_*` | Atualiza status e `encerrado_em`. Nunca cria lead. |

> ⚠️ **Robô não atende.** Mensagem de saída só para o relógio quando um agente
> humano a escreveu (`sender.type === "user"`, ou com e-mail de login). Um
> autoatendimento sai como `outgoing` igual a uma resposta de gente — e se
> contasse, o primeiro "Olá! Recebemos seu contato" congelaria o lead para
> sempre: nunca mais estagnado, nunca mais transferido, nunca mais cobrado de
> ninguém. O funil ficaria verde com a carteira parada, sem erro nenhum na
> tela. Na dúvida a rota DESCARTA: continuar cobrando é recuperável com um
> clique no card; parar de cobrar é silencioso.

**Ela nunca devolve erro fora de autenticação.** O Chatwoot desativa webhook
que responde erro com frequência, e webhook desativado reabre exatamente o
buraco que esta rota veio tapar. O que deu errado sai no corpo (`acao`,
`detalhe`) e no log, onde dá para auditar — não no status.

**O que ela conserta**, medido em produção em 2026-09-15, antes de existir:

- 41 das 46 linhas de `atendimentos` com `lead_id` nulo. Quem escrevia direto
  no WhatsApp — a maioria — nunca aparecia no kanban, porque só `/api/leads`
  (o formulário do site) gravava em `leads`.
- 4 registros de `contato` no rastro contra 15 `transferencia` automáticas.
  `registrar_contato_do_lead` tinha `grant` para `service_role` desde
  2026-08-28 e o recusava na primeira linha, porque a guarda era
  `is_staff(auth.uid())` e `auth.uid()` é nulo na chave de serviço — grant
  válido e inútil ao mesmo tempo, o espelho do defeito de 2026-08-31.
  Corrigido pela migração `20260915120000_contato_pelo_chatwoot.sql`.

#### Trocar o token derruba a entrada, se for só de um lado (2026-10-08)

O token vive em **dois lugares**: na Vercel (`CHATWOOT_WEBHOOK_TOKEN`) e na
URL do webhook no Chatwoot (`?token=`). Trocar um sem o outro fecha a porta.

Foi o que aconteceu em 2026-09-23. A variável foi editada na Vercel às 12:13
UTC e o site, republicado no mesmo commit oito segundos depois; a URL no
Chatwoot ficou com o valor antigo. A última entrega aceita foi às 00:59 UTC
de 23/09; da das 12:40 em diante, todas levaram 401 (log da Vercel:
`[Chatwoot] 401 — {"agente":"rest-client/2.1.0 … ruby/3.4.4p34",
"veio_query":true}`). Por quinze dias:

- nenhum `contato` pelo Chatwoot no rastro (24 só em 22/09; zero desde
  então), então resposta de consultor não reiniciou relógio nenhum;
- nenhum lead do canal `WhatsApp` criado, e 74 conversas novas ficaram em
  `atendimentos` sem `lead_id`. Quem continuou gravando `atendimentos` foi o
  workflow do n8n, e não esta rota, por isso a tabela parecia viva;
- 1.583 transferências e 1.662 avisos automáticos em 40 leads, de 30–50
  transferências por dia para 150–220;
- a atribuição pelo Chatwoot (2026-10-03) e a volta da resolução da conversa
  (2026-10-06) nunca rodaram em produção: os eventos delas também batiam
  no 401.

O parser não tinha mudado, e não era ele: a entrega morria na porta, antes
de o corpo ser lido. O defeito de verdade foi o 401 ficar só no log. Desde
então, **401 de quem trouxe credencial** (`?token=` não vazio, ou
`Authorization: Bearer`) é parada de negócio:
`registrarFalha("parada", "chatwoot-entrada-recusada")` vai ao WhatsApp pelo
`alertaDeFalha`. A carência é de 30 minutos por assunto **e por instância**
da função, em memória: com várias instâncias, ou logo depois de um deploy,
pode sair mais de um aviso. Recusa sem credencial (inclusive `?token=` vazio
e `Authorization: Basic`) é varredura e fica só no log. O alerta nunca leva o
token nem o `User-Agent` de quem bateu.

A falta da variável (503) avisa por `chatwoot-entrada-sem-token` com
qualquer requisição, com ou sem credencial: sem ela ninguém entra, então
quem bater está mostrando uma porta que de fato está fechada.

⚠️ O que isso não barra: um estranho que mande `?token=qualquer-coisa` faz o
alerta sair, no ritmo da carência. Separar isso de um defeito real pediria
um sinal que ele não fabrica, como quanto tempo faz desde a última entrega
aceita, e a rota não guarda isso hoje.

**Para trocar o token sem derrubar a entrada:**

1. Gerar o valor novo.
2. No Chatwoot (Configurações → Integrações → Webhooks), editar a URL do
   webhook do site com `?token=<novo>`. Daqui até o passo 4, as entregas
   levam 401, e o alerta avisa.
3. Na Vercel, trocar `CHATWOOT_WEBHOOK_TOKEN` pelo mesmo valor e
   **republicar**: variável nova só vale no deploy seguinte.
4. Conferir no log da Vercel uma linha `[Chatwoot] {"evento":…}` depois do
   deploy, e no banco um `contato` novo pelo Chatwoot:
   `select max(criado_em) from leads_eventos where tipo = 'contato' and
   detalhe->>'via_servico' = 'true';`

Fazer 2 e 3 em seguida deixa a janela em poucos minutos. Para nenhuma
entrega cair, aceitar os dois tokens durante a troca pediria código, e
não houve pedido para isso.

---

## Fora do repositório — o que não se conserta aqui

O `AUDITORIA.md §1.7` já registra: *"Evolution API, Typebot e Chatwoot são
citados em `CLAUDE.md` mas vivem inteiramente no n8n — o repositório não os
toca."* Continua verdade, com uma exceção nova e estreita: a rota de entrada
acima, que só **escuta** o Chatwoot. O site nunca ENVIA mensagem.

Consequência prática, registrada em 2026-09-15 a partir do relato do dono de
que *"o chatwoot não envia mensagem com foto ou vídeo em anexo para os
clientes"*: **nada neste repositório pode causar ou corrigir isso.** O caminho
do anexo é Chatwoot → Evolution API → WhatsApp, e ele não passa por código
daqui em nenhum ponto.

E no mesmo dia o log do Evolution (EasyPanel) mostrou a causa, que é de
CREDENCIAL e não de mídia:

```
ERROR [ChatwootService]
ApiError: Unauthorized
  url: 'https://app.chat.v2o5.com.br//api/v1/accounts/1/contacts/filter'
  status: 401  body: { error: 'Invalid Access Token' }
WARN  [ChatwootService] conversation not found
```

A leitura, em ordem de causa: o Evolution não consegue se autenticar na API do
Chatwoot (401) → `contacts/filter` falha → ele não resolve o contato → cai no
`conversation not found`. **Texto continua saindo** porque o caminho
Chatwoot → Evolution é o webhook de saída, que não exige o Evolution
autenticar de volta; **anexo não sai** porque o fluxo de mídia precisa da API
do Chatwoot, que é justamente a que está respondendo 401.

Três coisas para conferir no Evolution, todas fora daqui:

1. **`CHATWOOT_ACCOUNT_ID` = 1 confere com a conta do token?** O Chatwoot
   responde 401 — e não 403 — quando o token é válido mas não pertence
   àquela conta. Há um indício forte de que a conta mudou: em
   `atendimentos`, os ids de conversa saltam de 55–107 (4 e 5 de setembro,
   até 10:22) direto para 400+ (a partir das 15:03 do dia 5). Id de conversa
   é sequencial por conta; um salto desses no mesmo dia é troca de conta ou
   de instalação, não crescimento normal.
2. **O token de acesso** — regenerado ou expirado. É o `CHATWOOT_TOKEN` do
   Evolution, e ele precisa ser de um usuário com acesso à conta acima.
3. **A URL com barra a mais** — `app.chat.v2o5.com.br//api/v1/...`. Vem de
   barra no fim de `CHATWOOT_URL`. Costuma ser inofensivo porque o servidor
   normaliza, mas é gratuito de arrumar e tira uma variável da conta.

Nenhuma das três é editável por commit neste repositório — são variáveis de
ambiente do container do Evolution.

> Vale para a rota de entrada acima: ela escuta o **Chatwoot**, não o
> Evolution. Conversa que o Chatwoot registra vira lead no painel mesmo com o
> 401 de pé, porque o Chatwoot avisa o site por conta própria. Consertar o
> token faz a mídia voltar a sair; não é pré-requisito para o lead subir.

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
- [x] `apiSecretToken` passou a ser obrigatório em
      `/api/financeiro/margens/consulta` (2026-08-12) — item encerrado em
      2026-08-28, quando a rota foi **aposentada** junto com o módulo de
      caixa. A lição continua valendo para qualquer rota nova que leia com a
      chave de serviço: token obrigatório, 503 sem configuração, nunca 200
      aberto. Se `N8N_SECRET_TOKEN` sumir da Vercel, quem para de forma
      visível são os Bearer dos webhooks de saída — os tokens das rotas de
      entrada (motor do Ciclo, funil) são variáveis próprias.
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
