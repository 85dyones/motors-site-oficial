# ATENDIMENTO_E_TAGS.md

O atendimento de ponta a ponta — SDR geral, distribuição por time e resgate —
e o sistema de tags e referência que o torna rastreável no Chatwoot.

É o terceiro documento da família de integração. `WEBHOOKS_N8N.md` descreve o
que o site **emite**; `MOTOR_DE_GATILHOS.md`, o que o site **responde**. Este
descreve o que existe **entre os dois** — a conversa — e é, hoje, quase todo
uma lista do que falta.

Levantado em 2026-08-26 a partir do código deste repositório.

---

## ⚠️ Limite de verificação — leia antes de tudo

**Nem o Chatwoot nem o n8n foram inspecionados neste levantamento.** Tudo aqui
sai do código e dos documentos deste repositório. Consequências práticas:

- Não está confirmado que existe instância de Chatwoot no ar. O repositório
  **não a toca em nenhum ponto**: zero variável de ambiente, zero chamada,
  zero rota. As três menções ao nome (`src/lib/telemetry.ts`,
  `tests/ref-de-atendimento.test.ts`, `AUDITORIA.md §1.7`) são todas
  *comentário sobre uma integração que não existe no código*.
- O estado dos workflows do n8n descrito abaixo vem de `WEBHOOKS_N8N.md` e
  `MOTOR_DE_GATILHOS.md`, apurado em 12 e 15/08. Doze dias se passaram. Antes
  de agir, confira no painel do n8n.

Onde este documento afirma "não existe", a afirmação é sobre **este
repositório** e é verificável por `grep`. Onde é sobre o n8n ou o Chatwoot,
está marcado como tal.

---

## 1. O desenho pedido

```
        entrada (site, WhatsApp, Meta, orgânico)
                        │
                        ▼
              ┌──────────────────┐
              │  SDR automatizado │   atendimento geral, qualifica
              └──────────────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   Comercial       Pós-vendas      Administrativo-
                                     financeiro
        │               │                │
        └───────────────┴────────────────┘
                        │  sem desfecho por N dias
                        ▼
              ┌──────────────────┐
              │   SDR-resgate     │   reativa, cadência própria
              └──────────────────┘
```

Quatro exigências saem daí, e é por elas que o resto do documento se organiza:

1. **Toda conversa carrega uma referência** que casa com o lead do painel.
2. **Toda conversa carrega tags** que dizem origem, etapa, time e motivo.
3. **A passagem de bastão é um ato registrado**, não um agente clicando.
4. **O resgate é uma fila com régua**, não um cron com `IF`.

---

## 2. O que já está pronto

### 2.1 Site → n8n — os três formatos (produção)

Contrato completo em `WEBHOOKS_N8N.md`. Resumo do que interessa ao atendimento:

| Formato | Origem | Destino | Estado |
|---|---|---|---|
| A — lead de atendimento | `POST /api/leads` | `lead-entrada` | ✅ no ar |
| B — avaliação de veículo | `POST /api/avaliacao` | `sdr-captura-lead` | ⚠️ workflow **desligado** |
| C — evento administrativo | `webhook-dispatcher.ts` | `adm-motors` | ✅ no ar, com `headerAuth` |

O Formato A já entrega ao n8n **quase tudo** que uma tag precisaria: `canal`
(11 valores em uso), `veiculo` (objeto inteiro do estoque), `utm`,
`intencao_busca`, `ag_uid`, `telefone` normalizado e `remoteJid` pronto para a
Evolution. **A matéria-prima da taxonomia já viaja no webhook** — só não há
ninguém do outro lado transformando-a em rótulo.

### 2.2 n8n → site — o motor de gatilhos (produção, workflows desligados)

Quatro rotas, documentadas em `MOTOR_DE_GATILHOS.md`, todas atrás de
`CICLO_MOTOR_TOKEN`:

- `POST /api/ciclo/motor/fila` — o banco decide quem recebe, por qual gatilho,
  se pode hoje; `reservar: true` grava a reserva no mesmo SQL (idempotência).
- `POST /api/ciclo/motor/desfecho` — `convertido | recusado | sem_resposta |
  agendado | falha_envio`, com regra de não-regressão.
- `GET /api/ciclo/motor/verificacao` e `GET /api/ciclo/vendas-incompletas` —
  avisos internos.

**Este é o desenho a copiar para o resgate.** O Pacote 3 já fixou a regra:
*"regras de frequência aplicadas no servidor, não no workflow — o workflow
pode ser reconfigurado por engano; a regra não pode."* As supressões
(`domingo`, `fora_do_horario`, `sem_canal_consentido`, `quarentena`,
`janela_de_21_dias`, `colisao_prioridade`) e o vocabulário de desfecho existem,
estão testados e valem tal e qual para lead frio.

**O que o motor cobre e o que não cobre:** ele atende **quem já comprou** —
`boas_vindas`, `revisao_programada`, `revisao_verificada`,
`elegibilidade_em_risco` são todos gatilhos de pós-venda, ancorados em
`veiculos_vendidos`. **Lead que nunca converteu não tem gatilho nenhum.**

### 2.3 O painel — a tabela `leads` e o kanban A8

- Tabela `leads` (migrações `20260807210000` e `20260811130000`), schema
  híbrido: as colunas do kanban (`telefone`, `interesse`, `canal`,
  `veiculo_id`, `situacao`, `responsavel`, `observacoes`, `atualizado_em`)
  penduradas sobre uma tabela de marketing preexistente que já traz
  `event_id`, `utm_*`, `fbclid`, `gclid`, `capi_meta_*`, `score`,
  `telefone_raw`.
- Sete etapas travadas por constraint: `novo`, `em_contato`, `proposta`,
  `visita`, `negociacao`, `fechado`, `perdido`.
- Kanban em `src/components/admin/LeadsKanban.tsx`, com arrastar **e** botões.
- RLS fechada: leitura/escrita só `authenticated`, insert só pela chave de
  serviço via `/api/leads`.
- Papéis existentes (`src/lib/permissoes.ts`): `admin`, `gestor`, `marketing`,
  `comercial`, `financeiro` — mais `cliente` e `investidor` fora da matriz.

### 2.4 A referência visível — a única peça feita **para** o Chatwoot

`refCurta()` / `sufixoRef()` em `src/lib/telemetry.ts`, travadas por
`tests/ref-de-atendimento.test.ts`. Toda mensagem pré-preenchida de WhatsApp
termina em `" (Ref: 0DCB1CDC)"` — os 8 primeiros caracteres do `ag_uid`, em
maiúsculas.

O comentário no código diz para que ela existe, textualmente: *"oito
caracteres bastam para localizar o visitante de olho — a nota do Chatwoot e a
CAPI carregam o UUID inteiro"*.

**A nota do Chatwoot não é escrita por nada.** A metade do site está pronta e
provada; a metade do Chatwoot nunca foi construída. E há um furo a mais, na
seção 3.

### 2.5 O cemitério do SDR antigo

Seis tabelas criadas por fluxo de n8n fora deste repositório, todas mortas e
com RLS fechada em 2026-08-15 (`20260815120000_fechar_superficie_exposta.sql`):

`atendimentos` · `ia_classificacoes` · **`lead_tags`** · `leads_sdr` ·
`sdr_qualificacao` · `tracking_events`

Cinco com zero linhas desde sempre; `tracking_events` parada em 2026-06-06.
Sem policy nenhuma, de propósito: `service_role` atravessa, o resto não passa.
A migração registra o caminho de volta — *"quando o SDR renascer, é apontar o
workflow para a credencial de service key"*.

**`lead_tags` existe e está vazia.** O esquema dela não foi lido neste
levantamento e não está documentado em lugar nenhum. Antes de criar tabela
nova de tag, leia essa — pode ser reaproveitamento, pode ser lixo a derrubar.

Estado dos fluxos SDR no n8n, conforme `WEBHOOKS_N8N.md`:

- `sdr-captura-lead` — **desligado**. É o destino do Formato B; avaliação de
  veículo hoje não vira atendimento nenhum.
- `manychat-lead` — **500 em qualquer POST** ("No authentication data defined
  on node!"). O fluxo do ManyChat está morto.
- `sdr-manychat-motors` — credencial da Evolution trocada em 12/08, mas
  depende do `manychat-lead` acima.

**Não existe SDR automatizado em produção hoje.** Um lead do site chega ao
`lead-entrada` e ao Supabase; ninguém responde por robô.

---

## 3. O que não existe

Nove buracos, cada um com a prova ao lado.

### 3.1 🔴 O Chatwoot não está integrado — em nenhum sentido

`grep -ril chatwoot` devolve quatro arquivos, todos comentário. Sem
`CHATWOOT_URL`, sem `CHATWOOT_API_TOKEN`, sem `account_id`, sem inbox mapeada.
Nada no site cria contato, abre conversa, aplica rótulo ou escreve nota.

### 3.2 🔴 A referência visível não tem par no banco

`/api/leads` insere `nome, telefone, interesse, canal, veiculo_id, email,
event_id` — **e não insere `ag_uid`**. Nenhuma migração menciona a coluna
(`grep -rn ag_uid supabase/migrations/` = vazio).

Ou seja: o cliente lê `(Ref: 0DCB1CDC)` na própria mensagem, manda para a loja,
e **não há consulta possível** que devolva o lead correspondente. O código
curto resolve o caso "casar de olho" e só; o `ag_uid` inteiro existe no payload
do n8n e no `externalId` da CAPI, dois lugares onde o atendente não vai olhar.

É o furo mais barato de fechar e o que mais compromete a promessa de
rastreabilidade — está no Pacote A1 abaixo.

### 3.3 🔴 Não há vocabulário de tag

Nenhuma lista canônica, nenhum arquivo de constantes, nenhum teste travando os
nomes. O `src/lib/tagUtils.ts` é de *destaque de veículo* (CarMatch/vitrine),
não de atendimento — não confunda os dois.

Sem vocabulário travado, cada agente inventa o rótulo, e três meses depois
existem `pos venda`, `pós-venda`, `posvenda` e `PV` na mesma conta.

### 3.4 🔴 Não há contrato de entrada Chatwoot → site

O motor de gatilhos provou o desenho — token próprio, falha fechada, banco
decide e n8n entrega. **Não existe o equivalente para atendimento**: nenhuma
rota `/api/atendimento/*`, nenhum token, nenhum registro de que uma conversa
existiu.

### 3.5 🔴 Não existe conceito de time

`leads.responsavel` é **texto livre**, escolhido de propósito na migração
(*"consultor pode sair da empresa e o histórico do lead continua legível"*).
Não há coluna de time, não há `pos_venda` nem `sdr` em `PERFIS`
(`src/lib/permissoes.ts:17`), não há regra de distribuição, não há registro de
passagem de bastão.

`AUDITORIA.md` já registra isso como arranjo transitório na decisão D9:
*"Comercial, com Administrador como revisor — até existir papel `pos_venda`
próprio"*.

### 3.6 🔴 Não existe fila de resgate

O motor cobre pós-venda. Para lead frio não há gatilho, não há régua de
frequência, não há quarentena, não há desfecho. `leads.atualizado_em` existe e
é a âncora natural de "há quantos dias este lead não anda" — ninguém a lê para
esse fim.

### 3.7 🟡 O kanban e a conversa não se falam

Mover o card de `novo` para `proposta` no painel não produz nada fora do
painel. Fechar a conversa no Chatwoot não move o card. Duas verdades sobre o
mesmo lead, divergindo em silêncio.

### 3.8 🟡 O Formato A não tem chave de idempotência

Já registrado em `WEBHOOKS_N8N.md`: *"se o visitante clicar duas vezes, chegam
dois eventos indistinguíveis. `ag_uid` identifica a sessão, não o evento."*
Com Chatwoot no meio isso deixa de ser incômodo e vira duas conversas para a
mesma pessoa — e duas contagens de SLA.

### 3.9 🟡 A avaliação de veículo não entra no funil

Formato B aponta para `sdr-captura-lead`, desligado. Quem pede avaliação fica
gravado em `leads` e mais nada. É a outra ponta do negócio (captação de
estoque) e hoje não tem atendimento automatizado nenhum.

---

## 4. Proposta — o referenciamento

**Uma referência, três lugares, nenhuma tradução.**

| Lugar | Campo | Valor |
|---|---|---|
| Mensagem do cliente | texto | `(Ref: 0DCB1CDC)` — o que já existe |
| `leads` | `ag_uid` (nova coluna) | UUID inteiro |
| Contato do Chatwoot | `custom_attributes.ag_uid` | UUID inteiro |
| Conversa do Chatwoot | `custom_attributes.ref` | `0DCB1CDC` |
| Conversa do Chatwoot | `custom_attributes.lead_id` | UUID da linha em `leads` |

`ref` é para o humano ler e casar; `lead_id` é o vínculo de máquina, e é ele
que o painel usa. Os dois convivem porque respondem a perguntas diferentes —
"é este aqui?" e "abre a ficha".

**Colisão:** 8 hex = ~4,3 bilhões de combinações. No volume da loja, o risco é
teórico; ainda assim a nota privada carrega o UUID inteiro, e a busca do
painel deve avisar quando o prefixo devolver mais de uma linha em vez de
escolher a primeira.

**Quando não há `ag_uid`** (cliente chamou direto no WhatsApp, sem passar pelo
site): a conversa nasce sem `ref` e recebe a tag `origem_direto`. Inventar um
código nesse caso seria fingir rastreio que não houve — a regra da casa vale
aqui igual.

---

## 5. Proposta — o vocabulário de tags

**Restrição real do Chatwoot:** rótulo aceita **só letras, números, hífen e
sublinhado** — dois-pontos não passa na validação. Por isso a convenção é
`prefixo_valor`, com hífen dentro do valor. Como a lista de rótulos é
alfabética, o prefixo agrupa sozinho.

### 5.1 `origem_` — de onde a conversa nasceu (uma só, imutável)

Deriva direto do `canal` do Formato A, sem tradução criativa:

| Tag | `canal` de origem |
|---|---|
| `origem_pdp` | `WhatsApp Proposta`, `WhatsApp Dúvidas`, `WhatsApp PDP`, `WhatsApp Card` |
| `origem_troca` | `WhatsApp Usado na Troca` |
| `origem_test-drive` | `Agendamento Test-Drive` |
| `origem_financiamento` | `Simulação de Financiamento` |
| `origem_avaliacao` | `Appraisal Chat` + todo o Formato B |
| `origem_carmatch` | `Garagem Match Profiler`, `CarMatch Recommendations` |
| `origem_popup` | `Lead Popup` |
| `origem_contato` | `Formulário Contato` |
| `origem_direto` | conversa sem `ag_uid` — chegou fora do site |

### 5.2 `time_` — quem é dono agora (uma só, muda na passagem)

`time_sdr` · `time_comercial` · `time_pos-venda` · `time_admin-financeiro` ·
`time_sdr-resgate`

Uma conversa tem exatamente uma. A troca é o ato de distribuição — e o ato
gera evento (seção 6).

### 5.3 `etapa_` — em que pé está (uma só, espelha o kanban)

`etapa_novo` · `etapa_em-contato` · `etapa_proposta` · `etapa_visita` ·
`etapa_negociacao` · `etapa_fechado` · `etapa_perdido`

**Os mesmos sete valores da constraint `leads_situacao_valida`**, com hífen no
lugar do sublinhado. Vocabulário novo aqui seria uma terceira verdade sobre o
mesmo lead.

### 5.4 `interesse_` — sobre o quê (zero ou mais)

`interesse_veiculo-<id>` — o `veiculo_id` do estoque, quando a conversa nasceu
numa ficha. É o que permite responder "quantas conversas este carro gerou" sem
abrir uma a uma.

### 5.5 `motivo_` — por que parou (zero ou mais, só em `etapa_perdido`)

`motivo_preco` · `motivo_ja-comprou` · `motivo_sem-resposta` ·
`motivo_credito-negado` · `motivo_carro-vendido` · `motivo_fora-de-area`

Lista fechada de propósito. Motivo de perda em texto livre não vira relatório.

### 5.6 `resgate_` — controle da reativação (uma só)

`resgate_apto` · `resgate_em-curso` · `resgate_recusou` · `resgate_quarentena`

Espelho da régua do banco, para o agente ver o estado sem sair do Chatwoot.
**Quem manda continua sendo o banco** — a tag é reflexo, nunca comando.

### 5.7 Onde o vocabulário mora

Em `src/lib/atendimentoTags.ts`, com teste travando a lista e a correspondência
`canal → origem_` e `situacao → etapa_`. O padrão é o mesmo de
`webhooks-contrato.test.ts`: mudar um valor sem atualizar o documento quebra a
suíte de propósito.

---

## 6. Proposta — atributos personalizados e o registro do bastão

**Conversa** (`custom_attributes`):

| Chave | Origem |
|---|---|
| `ref` | `refCurta(ag_uid)` |
| `lead_id` | UUID da linha em `leads` |
| `veiculo_id` | `estoque_motors.id`, quando houver |
| `utm_source` / `utm_campaign` | Formato A |
| `time_atual` | espelho da tag `time_` |
| `distribuido_em` | ISO da última passagem de bastão |

**Contato** (`custom_attributes`): `ag_uid`, `cliente_id` (quando a pessoa já
comprou e existe em `clientes`), `consentimento_whatsapp` — lido de
`clientes.consentimento_canais`, para o agente não abrir conversa com quem
desligou o canal.

**A nota privada de abertura** é o que o `refCurta` sempre esperou: `ag_uid`
inteiro, veículo com link para a ficha, UTM, `intencao_busca`, e o link direto
para o lead no painel.

**A passagem de bastão é evento, não clique.** Trocar a tag `time_` dispara
webhook do Chatwoot → n8n → site, que grava a passagem. Sem isso não há como
responder "quanto tempo o lead ficou no SDR antes de chegar no comercial", que
é a pergunta que motiva o pedido inteiro.

---

## 7. O que falta desenvolver — em pacotes

Ordem é dependência, não preferência.

### A1 — Fechar o furo da referência 🔴 *pré-requisito de tudo*

- Coluna `ag_uid text` em `leads` + índice em `upper(left(ag_uid,8))`.
- `/api/leads` passa a gravá-la (já tem o valor resolvido em `resolvedAgUid`).
- Busca por `Ref` no kanban A8, avisando em caso de prefixo ambíguo.
- Teste: lead gravado com `ag_uid` é encontrado pelo código curto.

Sem A1, tag nenhuma leva a lugar nenhum. É meia migração e um `insert`.

### A2 — Vocabulário travado em código 🔴

`src/lib/atendimentoTags.ts` + teste de correspondência `canal → origem_` e
`situacao → etapa_`. Antes disso, **ler o esquema de `lead_tags`** e decidir
entre reaproveitar e derrubar.

### A3 — A ponte Chatwoot ↔ site 🔴

- Credenciais no n8n e as envs do lado do site.
- No Formato A: buscar/criar contato por telefone, abrir conversa, aplicar
  `origem_`, `interesse_`, `etapa_novo`, `time_sdr`, gravar
  `custom_attributes`, postar a nota privada.
- Volta: `POST /api/atendimento/evento`, token **próprio**
  (`CHATWOOT_WEBHOOK_TOKEN` — não reaproveite `N8N_SECRET_TOKEN` nem
  `CICLO_MOTOR_TOKEN`; segredo mede acesso, e isto é um acesso novo), falha
  fechada, atrás do rate limit do proxy.
- Tabela `atendimentos_conversas` ligando `lead_id ↔ conversation_id`, com
  histórico de passagem de bastão.
- Idempotência do 3.8 entra aqui: chave `ag_uid + canal + veiculo_id` numa
  janela curta evita a conversa dupla do clique duplo.

### A4 — O SDR automatizado 🟠

Depende de A3. Decisão pendente de fluxo (seção 8). Escopo mínimo: saudação,
confirmação do veículo de interesse, três perguntas de qualificação, e
escalonamento — pelas duas condições que o manual §7.2 já fixou (*"cliente
pede, ou intenção de compra detectada"*).

### A5 — Distribuição por time 🟠

- Papéis `sdr` e `pos_venda` em `PERFIS`, com linha própria na matriz da A17.
- Coluna `time` em `leads`, alimentada pela tag `time_`.
- Régua de roteamento **no servidor**: qualificado → comercial; cliente com
  venda fechada → pós-venda; assunto de pagamento/documentação →
  administrativo-financeiro.
- Espelho no kanban: a coluna "Responsável" passa a mostrar time + pessoa.

### A6 — SDR-resgate 🟠

- Função `montar_fila_de_resgate()` no banco, irmã de
  `montar_fila_de_gatilhos()` — **as regras no servidor, não no workflow**.
- Reaproveita inteiras as supressões que já existem: `domingo`,
  `fora_do_horario`, `sem_canal_consentido`, `quarentena`,
  `janela_de_21_dias`, `colisao_prioridade`.
- Ancoragem: `leads.atualizado_em` + `situacao` fora de `fechado`/`perdido`.
- Cadência a definir (seção 8) e desfecho pelo vocabulário do motor, que já
  existe e já é idempotente.
- Um workflow só, pelo mesmo motivo do orquestrador diário: a deduplicação
  acontece dentro de **uma** chamada da fila.

### A7 — Reanimar a avaliação 🟡

Ligar `sdr-captura-lead` (ou apontar o Formato B para `lead-entrada` e separar
por `tipo`), e alinhar o UTM plano/aninhado que `WEBHOOKS_N8N.md` já lista como
pendência.

---

## 8. Decisões que dependem do dono

Nenhuma delas é técnica, e todas travam um pacote acima.

1. **Existe instância de Chatwoot no ar?** Qual URL, qual conta, quais inboxes.
   Trava A3 inteiro.
2. **Quem é o SDR?** Robô puro, humano com apoio de robô, ou os dois em
   turnos? Trava A4 — e trava o papel `sdr` da A5.
3. **Qual ferramenta faz o diálogo?** Typebot (citado no manual §7.1), agente
   de IA no n8n, ou o próprio Chatwoot com respostas rápidas. Muda o desenho
   de A4 por inteiro.
4. **Quantos dias sem movimento até o resgate?** E quantos passos, com que
   espaçamento? O motor usa 21 dias de janela e 3 passos para pós-venda —
   lead frio provavelmente pede mais curto. Trava A6.
5. **Quem responde pelo administrativo-financeiro no atendimento?** Hoje o
   Formato C avisa a equipe por WhatsApp, mas não abre conversa com cliente.
6. **O pós-venda ganha papel próprio agora?** A decisão D9 do `AUDITORIA.md`
   está declarada como transitória desde 13/08. A5 é a hora de resolver.
7. **Qual é a fonte de verdade da etapa** — o kanban ou o Chatwoot? A proposta
   da seção 5.3 assume espelho bidirecional com o painel mandando; se for o
   contrário, A5 muda.

---

## Registro

Documento criado em 2026-08-26. Nada aqui está aplicado: é levantamento e
proposta. A seção 2 é verificável no código de hoje; a seção 3 é verificável
por ausência; as seções 4 a 7 são desenho, e mudam com as respostas da seção 8.
