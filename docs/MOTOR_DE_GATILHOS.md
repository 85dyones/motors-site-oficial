# MOTOR_DE_GATILHOS.md

O motor de engajamento do Motors Ciclo — manual v1.1 §4, §7.2 e §7.3.

Este documento é o irmão de sentido inverso do `WEBHOOKS_N8N.md`: lá o site
emite e o n8n recebe; aqui o n8n chama e **o site responde**. Levantado do
código em 2026-08-15, junto com a implementação.

---

## A divisão de trabalho

```
Banco (montar_fila_de_gatilhos)   →  QUEM recebe, POR QUAL gatilho, SE pode hoje
Site (src/lib/ciclo/motor.ts)     →  O QUE a mensagem diz
n8n (2 workflows)                 →  QUANDO acordar e ENTREGAR na Evolution
```

O Pacote 3 manda: "regras de frequência do §4.3 aplicadas **no servidor**, não
no workflow — o workflow pode ser reconfigurado por engano; a regra não pode."
Consequência prática: um workflow do n8n reconfigurado, duplicado ou rodado à
mão **não consegue** furar a janela de 21 dias, mandar mensagem de madrugada,
contatar quem não consentiu canal ou mandar duas mensagens no mesmo dia para o
mesmo cliente. Quem garante é a função no banco, que só o `service_role`
executa.

## Os gatilhos que existem hoje

| Gatilho | Manual | Tipo | Cadência | Isento da janela de 21 dias? |
|---|---|---|---|---|
| `elegibilidade_em_risco` | §4.2 nº 7 | régua vencida | imediato · D+7 · D+21, e o 3º passo marca `em_risco` | sim (§4.3, texto do manual) |
| `boas_vindas` | — (transacional) | ato: venda fechada | uma vez por veículo | sim — a ratificar |
| `revisao_verificada` | — (transacional) | ato: carimbo da loja | uma vez por revisão | sim — a ratificar |
| `pedido_de_avaliacao` | — (pedido do dono, 2026-10-03) | pós-venda: avaliação da loja no Google | uma vez por **cliente** (não por veículo), de D+3 a D+30 da `data_venda`; só venda de 03/10/2026 em diante | **não** |
| `revisao_programada` | §4.2 nº 1 | janela §1.5 | D−15 · D−3 · D+7, ou antecipado por KM −800 | **não** |

Prioridade em colisão (§4.4): risco (10) < boas-vindas (15) < verificada (25)
< pedido de avaliação (40) < lembrete (60) — número menor atende primeiro,
risco de perda vem antes de tudo, sempre. Um cliente com vários gatilhos no
dia recebe **um**.

### `pedido_de_avaliacao` (2026-10-03)

O único gatilho que não é do Ciclo: fala com **todo comprador** registrado em
`veiculos_vendidos`, com ou sem adesão ao programa. As decisões, todas do dono:

- **Quando:** do 3º ao 30º dia depois da `data_venda`. Venda com mais de 30
  dias não recebe mais o pedido.
- **Uma vez por cliente**, não por veículo. Quem comprou dois carros recebe um
  pedido, pela venda mais recente. `falha_envio` não conta como pedido feito.
- **Quem:** todo comprador com WhatsApp consentido (ver o ponto em aberto (b)).
- **Só WhatsApp.** É o único gatilho que não cai para o e-mail: a mensagem é
  de WhatsApp e o transporte de e-mail não existe. Quem não tem
  `consentimento_canais.whatsapp = true` **e** telefone cadastrado não entra
  na fila, mesmo com e-mail consentido: aparece em `suprimidos` com
  `sem_whatsapp_consentido`, `canal` nulo, e **nenhum evento é gravado** em
  `eventos_ciclo` (nem reserva, nem `falha_envio`). Os outros quatro gatilhos
  seguem com a regra de antes: WhatsApp, senão e-mail.
- **Não é isento** da janela de 21 dias, nem de domingo, horário, quarentena
  ou colisão.
- **Nasce DESLIGADO**, por chave de ambiente: ver "A chave de desligar", logo
  abaixo.

#### A chave de desligar (`CICLO_PEDIDO_DE_AVALIACAO`)

O orquestrador pede a fila sem filtro. Sem uma chave, aplicar a migração
bastaria para o pedido sair sozinho, antes de o dono aprovar a mensagem e a
base legal (bloqueio B3 da revisão do PR #233). A chave separa as duas coisas:
a migração pode estar aplicada e o gatilho continua parado.

- **Só o valor exato `ligado` liga.** Ausente, vazia, `true`, `1`, `LIGADO`,
  `ligado ` com espaço: tudo desligado. Não há `trim` nem conversão de caixa,
  de propósito — errar o valor deixa o gatilho parado, que é o lado seguro.
- **Como funciona:** a rota da fila nunca passa `p_gatilhos` nulo ao banco
  (nulo, no SQL, é "todos"). Passa sempre a lista explícita dos gatilhos
  ligados; com a chave desligada, são os quatro do Ciclo. A função filtra por
  essa lista na CTE `filtrados`, **antes** do canal, da janela de 21 dias, da
  colisão de prioridade e da reserva. Então, desligado, o pedido não toma a
  vez do lembrete de revisão (40 contra 60), não aparece em `suprimidos` e não
  grava nada em `eventos_ciclo`.
- **Para ligar** (nesta ordem): (1) migração
  `20261003131500_pedido_de_avaliacao.sql` aplicada; (2) aprovação do dono
  para o texto e para os dois pontos em aberto abaixo; (3)
  `CICLO_PEDIDO_DE_AVALIACAO=ligado` na Vercel, em Production; (4) Redeploy;
  (5) um ensaio: `POST /api/ciclo/motor/fila` com
  `{"reservar": false, "gatilhos": ["pedido_de_avaliacao"]}` — **200** quer
  dizer chave ligada no deploy que está no ar, **422 "Gatilho desligado"** quer
  dizer que a env não chegou (valor errado ou faltou o Redeploy).
- **Para desligar, sem migração e sem mexer no n8n:** apagar o valor da env
  na Vercel (ou trocar por qualquer coisa que não seja `ligado`) e Redeploy.
  A próxima fila já sai sem o pedido. O que já foi enviado fica registrado em
  `eventos_ciclo` e continua contando na janela de 21 dias do cliente, como
  qualquer contato.
- **Filtro `gatilhos` pedindo o gatilho desligado leva 422** (`Gatilho
  desligado: pedido_de_avaliacao.`), e não uma fila vazia com 200: é a mesma
  regra do nome desconhecido. ⚠️ Consequência: se um dia o orquestrador passar
  a mandar `gatilhos` com os cinco nomes, desligar a chave derruba a chamada
  inteira (os quatro do Ciclo junto) até o nome sair do workflow. Hoje ele não
  manda filtro, e é assim que deve ficar.
- **Corte da base histórica:** só venda com `data_venda >= 2026-10-03`. O
  corte é uma linha da consulta, sem backfill em `eventos_ciclo`.
- **Passo único**, prioridade 40. O contexto que o banco entrega é
  `{ data_venda }`; nome, placa, marca e modelo saem pelas colunas da fila.

O texto mora em `pedidoDeAvaliacao()` (`src/lib/ciclo/motor.ts`) e o link em
`LINK_DE_AVALIACAO_NO_GOOGLE` (`src/lib/schemaLoja.ts`), montado a partir do
`place_id`. Regras do dono para o texto, travadas em `tests/ciclo-motor.test.ts`:
não pede nota, não condiciona o pedido a ter gostado, não oferece nada em
troca, não vende, e não cita o programa (quem recebe pode não ter aderido).

> **Dois pontos em aberto, para o dono decidir** (nenhum foi resolvido no
> código; o comportamento descrito é o que sai hoje). O antigo ponto (c),
> sobre quem só consentiu e-mail, deixou de existir: virou a regra "só
> WhatsApp", acima.
>
> - **(a) Quem aderiu ao Ciclo quase não recebe o pedido.** A boas-vindas sai
>   primeiro (prioridade 15, isenta) e conta como contato. Como o pedido não é
>   isento, ele fica suprimido por `janela_de_21_dias` até o 21º dia depois da
>   boas-vindas: só sai entre D+21 e D+30, ou não sai (basta um domingo, outro
>   contato ou uma falha nesse intervalo curto).
> - **(b) Comprador sem Ciclo só entra se houver consentimento gravado.** A
>   fila exige `clientes.consentimento_canais.whatsapp = true`. Se o fechamento
>   de uma venda sem adesão não marca WhatsApp como canal consentido, esse
>   comprador aparece todo dia em `suprimidos` como `sem_whatsapp_consentido`,
>   do D+3 ao D+30, e nunca recebe. Não gera evento.

Os demais gatilhos do §4.2 ficam de fora por falta de matéria-prima, não de
esqueleto: seguro e garantia dependem de `apolices_seguro`/`contratos_ciclo`
povoados, IPVA depende do calendário PR por final de placa (número que não se
inventa), equity mining depende de financiamento capturado, e **recompra está
bloqueada pela regra 5 até o §1.4 abrir**.

As regras que a fila aplica antes de entregar, na ordem em que suprimem:
`domingo` / `fora_do_horario` (20h–8h) → `sem_whatsapp_consentido` (só no
`pedido_de_avaliacao`, que não cai para o e-mail) / `sem_canal_consentido`
(opt-in por canal do §6.3-D; recusa nunca penaliza, só silencia) → `quarentena` (3 sem
resposta seguidos = 90 dias) → `janela_de_21_dias` → `colisao_prioridade`.
Tudo que foi suprimido volta na resposta **com o motivo** — fila que descarta
em silêncio não se audita.

## O contrato das rotas

Autenticação nas três: `Authorization: Bearer <token>` obrigatório, com token
**próprio do motor** — `CICLO_MOTOR_TOKEN` na Vercel, sem fallback. Até
2026-08-18 era o mesmo token do sentido site→n8n (achado #9 da revisão): quem
tivesse a credencial de margens puxava nome, telefone e placa da base do
Ciclo. Segredo mede acesso — dado de cliente e ficha de margem são acessos
diferentes, então são segredos diferentes. Sem token configurado no
servidor a rota responde **503** (problema nosso); token errado leva **401**.
Falha fechada, como `/api/financeiro/margens/consulta`. As três rotas também
estão atrás de rate limit no proxy (240/h por IP — folga para a rajada de
desfechos do lote diário, inviável para força bruta).

#### Onde o token vive do lado do n8n

**Não é credencial.** Mapeado em 2026-08-18, depurando um 401: cada rota do
motor é chamada por um **nó HTTP Request**, seguido de um **nó Code** que só
confere a resposta e estoura alto (`Fila indisponível: HTTP <status>`) — é
por isso que o erro aparece como `VmCodeWrapper` no stack trace, apontando
para o Code quando o problema está no HTTP acima dele.

O `CICLO_MOTOR_TOKEN` fica no **env da instância do n8n**, e o cabeçalho é
montado no nó HTTP como `Bearer {{ $env.CICLO_MOTOR_TOKEN }}`.

Três armadilhas, todas com o mesmo sintoma (401 indistinguível de token
errado):

1. **Variável nova exige recriar o container** — sem isso `$env` vem
   `undefined` e o header sai `Bearer undefined`. Probe seguro num nó Code:
   `Boolean($env.CICLO_MOTOR_TOKEN)`, que não imprime o segredo.
2. **"Specify Headers" precisa estar em *Using Fields Below*** — no HTTP
   Request v4 o cabeçalho simplesmente não é enviado sem isso.
3. **O prefixo `Bearer ` faz parte do valor** — o site compara a string
   inteira.

> ⚠️ **A credencial "Motors — Webhooks do site (Bearer)" é do sentido
> OPOSTO.** Ela guarda os nós Webhook que *recebem* do site (leads, avaliação,
> admin) e o valor dela é `Bearer <N8N_SECRET_TOKEN>`. Trocar o valor dela
> não conserta o motor e **quebra a entrada de leads** — aconteceu em 18/08.
> E o n8n nunca devolve segredo de credencial pela API: sobrescreveu, o valor
> antigo só existe na Vercel e no `.env.local`.

### `POST /api/ciclo/motor/fila`

Corpo: `{ "reservar": true|false, "gatilhos": ["..."]? }`.

- `reservar: true` grava cada linha entregue em `eventos_ciclo` **no mesmo
  comando SQL** que monta a fila. A linha é a reserva; duas execuções
  sobrepostas não duplicam mensagem. `false` = ensaio, só olhar.
- `gatilhos` filtra; nome desconhecido leva **422** com a lista dos válidos —
  typo no workflow não pode virar "hoje não tinha ninguém".
  Gatilho conhecido mas desligado por chave (hoje, só o `pedido_de_avaliacao`)
  também leva **422**, com `Gatilho desligado: ...`.
- Sem `gatilhos`, a rota pede ao banco a lista explícita dos gatilhos
  **ligados**, nunca "todos".

Resposta: `{ ok, reservado, total, fila: [{ evento_id, veiculo_vendido_id,
cliente_id, nome, placa, gatilho, passo, canal, numero_whatsapp, email,
mensagem }], suprimidos: [{ ..., suprimido_por }],
desfechos_nao_registrados: [{ evento_id, gatilho }] }`.

`desfechos_nao_registrados` (2026-08-18, achado #8) é sempre presente e
normalmente vazio: são devoluções de vez que **não gravaram** — eventos
reservados cuja mensagem não montou E cujo `falha_envio` falhou ao registrar.
Cada id listado está contando como contato indevidamente; reprocessar pelo
endpoint de desfecho.

A `mensagem` já vem pronta, no vocabulário da marca (diário de bordo,
procedência — nunca "caderneta", nunca "recompra"). O n8n não monta texto.

### `POST /api/ciclo/motor/desfecho`

Corpo: `{ "evento_id": uuid, "desfecho": "convertido|recusado|sem_resposta|agendado|falha_envio", "valor_gerado"?: number }`.

`falha_envio` é o obrigatório do lado do n8n: reserva que não virou mensagem
devolve a vez ao cliente — a linha fica de rastro, mas não conta para a janela
de 21 dias nem para a quarentena. Não existe desfecho "enviado": a linha
existir já diz isso. Evento inexistente leva 404.

**Desfecho não regride** (2026-08-18, achado #10): retry é operação normal,
então repetir o mesmo desfecho é idempotente (e pode corrigir
`valor_gerado`), mas rebaixar — `convertido` → `sem_resposta`, por exemplo —
é ignorado: a resposta volta `200` com o desfecho que ficou e
`sobrescrita_ignorada: true`, nunca erro. Subida é permitida (`sem_resposta`
→ `convertido` é resposta tardia real; `agendado` → `recusado` é progressão)
e a correção humana entre `convertido` ↔ `recusado` também. `falha_envio` ↮
`sem_resposta` não se comunicam em nenhum sentido — regra 2. A régua vive em
`desfecho_pode_gravar()` no banco, autoconferida na migração
`20260818140000`.

### `GET /api/ciclo/motor/verificacao`

O aviso interno (equipe, não cliente): a fila da A21 sem carimbo. Resposta traz
`mensagem` pronta para WhatsApp — **`null` quando a fila está vazia**, e aí o
workflow não manda nada. Pendente = `confirmada_em IS NULL AND recusada_em IS
NULL`; a recusa ganhou coluna própria nesta migração exatamente para sair da
fila.

### `GET /api/ciclo/vendas-incompletas`

Não é gatilho de cliente — é a rotina de cadastro do §3.2, e mora aqui porque
usa a mesma porta (`CICLO_MOTOR_TOKEN`) e o mesmo desenho: **o banco decide, o
n8n entrega**.

Resposta: `{ ok, total_vendas_incompletas, avisos: [{ vendedor_id,
vendedor_nome, vendas, campos_pendentes, numero_whatsapp, mensagem }],
sem_telefone: [...], sem_atribuicao: [...] }`.

A `mensagem` já vem pronta e **não carrega ranking**: cutucar não é cobrar, e
mandar posição por WhatsApp é como um indicador honesto vira número maquiado.
O ranking vive no painel (`/admin/ciclo/completude`), para a gestão ver o
conjunto.

Os dois últimos campos são sempre presentes e normalmente vazios.
`sem_telefone` é vendedor sem `profiles.telefone_e164` — cadastro faltando na
A17, não erro de execução. `sem_atribuicao` é venda sem `vendedor_id`: fica
fora do ranking e de qualquer cobrança, porque atribuí-la a alguém seria
cobrar a pessoa errada.

**Sem cron no banco.** Uma view está sempre fresca, então agendar um cálculo
seria agendar nada — quem acorda é o workflow.

## Os workflows no n8n (criados DESLIGADOS em 2026-08-15)

| id | nome | cron | faz |
|---|---|---|---|
| `jzBHXQuyVFZQMzdz` | Motors Ciclo — Orquestrador Diário | `0 9 * * *` | fila com reserva → Evolution → `falha_envio` quando não entrega |
| `ZcYncW5GEuUKVwmF` | Motors Ciclo — Aviso de Verificação (equipe) | `30 9 * * 1-6` | fila de verificação → WhatsApp da equipe (5541998089550) |

Por que **um** orquestrador e não um workflow por gatilho: a deduplicação do
§4.4 acontece dentro de **uma** chamada da fila. Chamadas separadas por
gatilho não se veem — e como boas-vindas é isenta da janela de 21 dias, um
cliente com dois gatilhos receberia duas mensagens no mesmo dia. Boas-vindas,
lembrete de revisão, risco, revisão verificada e pedido de avaliação são
**linhas da mesma fila**, não fluxos separados.

Por isso o `pedido_de_avaliacao` (2026-10-03) **não deve pedir mudança no
n8n**: o corpo que o orquestrador manda está registrado como
`{"reservar": true}`, sem `gatilhos` (`docs/HANDOFF_ALIAS_DA_VERCEL.md`), então
o gatilho novo chega pela mesma chamada assim que a migração estiver aplicada,
o deploy no ar **e a chave `CICLO_PEDIDO_DE_AVALIACAO=ligado`** (nasce
desligada; sem ela a rota nem pede o gatilho ao banco). ⚠️ O JSON do orquestrador não está no repositório: isso
é o que os documentos dizem, não uma leitura do workflow vivo. Conferir o
corpo do nó HTTP no n8n antes de aplicar a migração; se houver filtro
`gatilhos`, o nome novo precisa entrar nele.

Escolhas herdadas dos incidentes deste repositório: cadeia linear, sem fan-out
paralelo (ordem de ramo é geometria do canvas); todo nó HTTP com
`fullResponse` + `neverError` e um Code logo depois que **estoura** em status
ruim — execução verde com zero envio é o modo de falha que já aconteceu;
credenciais existentes e provadas (`Motors — Webhooks do site (Bearer)`,
`Evolution — apikey (v2o5)`), nenhum token no JSON do workflow.

A URL apontada é `motorsstore.com.br` **desde 2026-09-06**. Até então era o
alias `motors-site-oficial.vercel.app`, e este parágrafo dizia que trocar era
"opcional" — deixou de ser: o alias serve conteúdo duplicado ao Google, e o
301 que resolve isso precisava abrir uma exceção para `/api/*` justamente
porque estes nós entravam por lá. Tirar os workflows do alias é o que permite
fechar a exceção. Ver `docs/VIRADA_DE_DOMINIO.md`.

O cron é 9h, não as 6h do §4.1: o motor não usa a matview `vw_ciclo_estado`
(consulta as tabelas direto, o volume atual não pede materialização), e às 6h
a regra de horário do §4.3 suprimiria tudo. Quando houver volume, o REFRESH
entra às 6h e o orquestrador continua às 9h.

## Antes de ligar (nesta ordem)

0. **Deploy do código** — as rotas só existem no ar depois do push do `main`
   (a Vercel deploya do GitHub). Rodar o orquestrador contra um deploy sem as
   rotas dá `404` no primeiro nó — foi literalmente o primeiro erro real deste
   motor, em 2026-08-15, porque o commit estava só local. O guia de leitura:
   **404 = deploy velho; 503 = env faltando; 401 = token errado OU deploy
   velho.** O 401 é ambíguo desde 2026-08-18, quando o token do motor virou
   `CICLO_MOTOR_TOKEN`: com o código antigo no ar, a credencial NOVA e correta
   também leva 401 — o servidor ainda espera o segredo antigo. Custou uma tarde
   de caça a credencial nesse dia. **Antes de mexer em credencial do n8n,
   confirme em Deployments que o commit no topo é o esperado e está `Ready`.**
1. **Confirmar as envs na Vercel** — `SUPABASE_SERVICE_ROLE_KEY` e
   `CICLO_MOTOR_TOKEN` (token próprio do motor desde 2026-08-18; gere um
   segredo novo, não copie o `N8N_SECRET_TOKEN`). Sem qualquer uma, as rotas
   respondem 503 e o workflow para no primeiro nó (alto, como desenhado).
2. **Rodar o orquestrador uma vez à mão** no n8n (Execute Workflow) e ler a
   execução: com a base vazia, o esperado é fila `total: 0` e nenhum envio.
   Isso prova as duas credenciais em execução real — a regra da casa.
3. **Ativar os dois workflows** no painel do n8n.
4. Se um dia o mutirão da base histórica (§3.3) rodar: **repetir o bloco 4 da
   migração** (`suprimido_base_anterior`) antes de reativar — senão o motor
   manda boas-vindas para venda de 2023.

## Decisões tomadas aqui que o dono pode querer rever

- **Isenção da janela de 21 dias para `boas_vindas` e `revisao_verificada`**
  (o §4.3 só isenta os gatilhos 6 e 7). Racional: respondem a um ato do
  cliente; segurar o "seu carro entrou no programa" por causa de um lembrete
  recente quebraria a promessa no momento da adesão. Horário e consentimento
  não têm isenção para ninguém.
- **Cadência como intervalo, não data absoluta**: quem entra atrasado no
  gatilho não recebe os três passos em dias seguidos — respeita o espaçamento
  do §7.3 entre um aviso e o próximo. O ensaio da migração pegou isso.
- **Sem opt-out por palavra-chave**: a saída prometida no texto é "responder
  por aqui" — quem desliga o canal é a equipe, no painel do cliente. Prometer
  "responda SAIR" sem handler seria promessa vazia. Quando existir Typebot no
  meio (§7.1), esta decisão muda de figura.
- **Canal e-mail ainda não envia**: cliente só com consentimento de e-mail
  entra na fila com `canal: "email"`, o orquestrador registra `falha_envio` e
  segue. O dado de consentimento não se perde; o transporte é que não existe.
  (SMTP/provedor de e-mail é decisão pendente.) Vale para os quatro gatilhos
  do Ciclo. O `pedido_de_avaliacao` não passa por aqui: é só WhatsApp e, sem
  ele, sai suprimido (`sem_whatsapp_consentido`) sem gravar evento.
- O botão da **conformidade diária segue manual** (pendência já conhecida);
  este pacote não criou cron para ela.

- **`pedido_de_avaliacao` tem dois pontos em aberto** (adesão ao Ciclo e
  consentimento de quem não aderiu): ver a nota na seção do gatilho, acima.

## Registro de aplicação

Migração `20260814180000_motor_de_gatilhos.sql` aplicada em produção em
2026-08-15 via session pooler (mesmo runbook do `supabase/README.md`; sem
livro-razão `schema_migrations`, como as anteriores). Ensaiada antes em
transação revertida, com a autoconferência passando contra o banco real.

Migração `20261003131500_pedido_de_avaliacao.sql` (o gatilho
`pedido_de_avaliacao`): **ainda não aplicada em produção** em 2026-10-03. O
código que a acompanha (texto da mensagem, nome aceito no filtro da rota)
pode ir ao ar antes dela sem efeito: enquanto a função do banco não devolver o
gatilho, nada muda na fila. E, com a chave `CICLO_PEDIDO_DE_AVALIACAO`
desligada (o padrão), a migração também pode ser aplicada sem efeito: a rota
pede ao banco só os quatro gatilhos do Ciclo. A ordem inversa não manda mensagem errada, mas é
ruidosa: com a migração aplicada e o deploy antigo no ar, a rota não tem texto
para o gatilho, devolve a vez (`falha_envio`) e ninguém recebe.
