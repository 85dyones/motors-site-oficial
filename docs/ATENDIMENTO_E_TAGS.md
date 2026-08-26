# ATENDIMENTO_E_TAGS.md

O atendimento de ponta a ponta — SDR geral, distribuição por time e resgate —
e o sistema de tags e referência que o torna rastreável no Chatwoot.

É o terceiro documento da família de integração. `WEBHOOKS_N8N.md` descreve o
que o site **emite**; `MOTOR_DE_GATILHOS.md`, o que o site **responde**. Este
descreve o que existe **entre os dois** — a conversa — e é, hoje, quase todo
uma lista do que falta.

Levantado em 2026-08-26 a partir do código deste repositório. As sete
decisões que o travavam foram respondidas pelo dono **no mesmo dia** — estão
registradas na §10, e as duas que pediam estudo viraram as §8 e §9.

---

## ⚠️ Limite de verificação — leia antes de tudo

**Nem o Chatwoot nem o n8n foram inspecionados neste levantamento.** Tudo aqui
sai do código e dos documentos deste repositório. Consequências práticas:

- **A instância existe** (decisão C1, 2026-08-26): `app.chat.v2o5.com.br`,
  conta `3`, caixa de entrada `11` — a do WhatsApp, confirmada pelo dono, mesma
  família de domínio do n8n. Versão **4.17.0, com Captain liberado**. Mas ela
  **não foi aberta neste levantamento**: exige login. O que este documento diz
  sobre a configuração interna dela (etiquetas já existentes, agentes, times)
  segue sendo hipótese a conferir.
- O repositório continua **não tocando o Chatwoot em nenhum ponto**: zero
  variável de ambiente, zero chamada, zero rota. As três menções ao nome
  (`src/lib/telemetry.ts`, `tests/ref-de-atendimento.test.ts`,
  `AUDITORIA.md §1.7`) são todas *comentário sobre uma integração que não
  existe no código*.
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

**A linha que separa robô de gente (decisão C2):** a primeira linha é robô
puro — e ele só responde quem escreveu. O resgate é pessoa. Isso não é
detalhe de organograma, é o que define o risco do sistema inteiro: robô que
responde é tráfego de entrada; resgate que dispara sozinho seria tráfego de
saída em lote, que é o que queima número de WhatsApp (ver o aviso da §8).

Cinco exigências saem daí, e é por elas que o resto do documento se organiza:

1. **Toda conversa carrega uma referência** que casa com o lead do painel.
2. **Toda conversa carrega tags** que dizem origem, etapa, time e motivo.
3. **A passagem de bastão é um ato registrado**, não um agente clicando.
4. **O resgate é uma fila com régua**, não um cron com `IF`.
5. **A saída de cena do robô é a parte crítica**, não a entrada. Com a
   primeira linha sozinha, o que decide se o cliente é bem atendido é a hora
   em que o robô chama gente.

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

Nove buracos, cada um com a prova ao lado. **Um deles — o 3.2 — foi fechado em
2026-08-26**; fica aqui, marcado, porque a razão dele existir explica metade do
desenho das §§4 e 5, e apagá-la deixaria as duas sem chão.

### 3.1 🔴 O Chatwoot não está integrado — em nenhum sentido

`grep -ril chatwoot` devolve quatro arquivos, todos comentário. Sem
`CHATWOOT_URL`, sem `CHATWOOT_API_TOKEN`, sem `account_id`, sem inbox mapeada.
Nada no site cria contato, abre conversa, aplica rótulo ou escreve nota.

### 3.2 ✅ A referência visível não tinha par no banco — RESOLVIDO em 2026-08-26

`/api/leads` insere `nome, telefone, interesse, canal, veiculo_id, email,
event_id` — **e não insere `ag_uid`**. Nenhuma migração menciona a coluna
(`grep -rn ag_uid supabase/migrations/` = vazio).

Ou seja: o cliente lê `(Ref: 0DCB1CDC)` na própria mensagem, manda para a loja,
e **não há consulta possível** que devolva o lead correspondente. O código
curto resolve o caso "casar de olho" e só; o `ag_uid` inteiro existe no payload
do n8n e no `externalId` da CAPI, dois lugares onde o atendente não vai olhar.

Era o furo mais barato de fechar e o que mais comprometia a promessa de
rastreabilidade. **Fechado pelo pacote A1** (§7): a migração
`20260826120000_ag_uid_no_lead.sql` cria `leads.ag_uid` e a coluna gerada
`leads.ref_curta`, `/api/leads` passa a gravar o rastreio, e o kanban A8 ganhou
busca pelo código. Coberto por `tests/busca-por-ref.test.ts`.

A cobertura começa na data: lead recebido antes de 2026-08-26 não tem
referência guardada, e não há backfill possível — o `ag_uid` daquelas linhas
não existe em lugar nenhum deste banco. A tela diz isso quando a busca não
acha, para o atendente não concluir que digitou errado.

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

`time_sdr` é a única sem gente atrás: quem a carrega é o robô da primeira
linha. As outras quatro são pessoas, e a §10.2 diz quais viram papel no
painel.

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

Com as três réguas da §8 no lugar, `resgate_em-curso` não diz qual delas está
rodando; quem diz é o `custom_attributes.resgate_regua` (`curto` ou `longo`) e
o passo. Etiqueta é para bater o olho; atributo é para consultar.

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

### A1 — Fechar o furo da referência ✅ **feito em 2026-08-26**

- `leads.ag_uid` (rastreio inteiro) e `leads.ref_curta` — esta **gerada** como
  `upper(left(ag_uid,8))` e indexada. Gerada porque o PostgREST não expressa
  predicado funcional (a busca cairia em `ilike`, sem índice) e porque coluna
  escrita poderia divergir do `ag_uid`.
- `/api/leads` grava o rastreio, filtrado pelo **mesmo** `refCurta()` que
  decide se o cliente vê a referência na mensagem. As duas pontas não podem
  discordar: se discordassem, voltaria a existir código impresso sem lead
  correspondente.
- Busca por referência no kanban A8: aceita `0DCB1CDC`, `0dcb1cdc`,
  `(Ref: 0DCB1CDC)` e o UUID inteiro colado; avisa quando o prefixo casa com
  mais de um lead; e distingue "a busca não achou" de "não há lead nenhum".
- `tests/busca-por-ref.test.ts` — 26 asserções, incluindo a que segura o
  `ref_curta` como coluna gerada.

✅ **Migração aplicada em produção em 2026-08-26** (confirmado pelo dono). Como
ela carrega autoconferência que estoura em `raise exception`, ter aplicado
limpo **é** a prova de que as duas colunas existem, que `ref_curta` é gerada de
verdade (`attgenerated = 's'`), que a expressão devolve `0DCB1CDC` e que o
índice está no lugar. A busca por referência está no ar.

### A2 — Vocabulário travado em código 🔴

`src/lib/atendimentoTags.ts` + teste de correspondência `canal → origem_` e
`situacao → etapa_`. Antes disso, **ler o esquema de `lead_tags`** e decidir
entre reaproveitar e derrubar.

### A3 — A ponte Chatwoot ↔ site 🔴

- Coordenadas fechadas pela C1: `CHATWOOT_URL=https://app.chat.v2o5.com.br`,
  `CHATWOOT_ACCOUNT_ID=3`, `CHATWOOT_INBOX_ID=11`. O **token de API fica em
  env na Vercel e no n8n, nunca no painel** — mesma decisão de 2026-08-12 que
  vale para o `N8N_SECRET_TOKEN`: uma fonte só, e é a env.
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

Depende de A3. Robô puro (C2), como Agent Bot do Chatwoot (§9). Escopo
mínimo: saudação, confirmação do veículo de interesse, três perguntas de
qualificação, e escalonamento — pelas duas condições que o manual §7.2 já
fixou (*"cliente pede, ou intenção de compra detectada"*), mais uma terceira
que o robô puro obriga: **não entendeu, passa**. Robô que insiste em entender
é pior que robô que desiste rápido.

A trava inegociável: o agente **nunca** afirma preço, disponibilidade ou
condição de pagamento que não tenha lido de `/api/estoque`. O que não está
lá, ele não diz — passa para humano.

### A5 — Distribuição por time 🟠

- Papéis `pos_venda` e `sdr_resgate` em `PERFIS`, com linha própria na
  matriz da A17. **`sdr` de primeira linha não nasce** — é robô, e robô não é
  usuário do painel; `admin_financeiro` também não, porque `financeiro` já
  existe e só ganha a superfície de atendimento (§10.2).
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
- Ancoragem: `leads.atualizado_em` + `situacao`. As **três réguas da §8**
  (alarme em 24 h; curto em D+5/12/23/40; longo em D+90/D+270 só com carro
  que case), e desfecho pelo vocabulário do motor, que já existe e já é
  idempotente.
- **Fila de trabalho, não disparo** (C2): o banco decide quem entra e monta a
  mensagem sugerida; quem envia é a pessoa do `time_sdr-resgate`, pelo
  Chatwoot. É o que mantém a mensagem pertinente — e o que tira o número da
  loja da rota de disparo em lote.
- Um workflow só, pelo mesmo motivo do orquestrador diário: a deduplicação
  acontece dentro de **uma** chamada da fila.

### A7 — Reanimar a avaliação 🟡

Ligar `sdr-captura-lead` (ou apontar o Formato B para `lead-entrada` e separar
por `tipo`), e alinhar o UTM plano/aninhado que `WEBHOOKS_N8N.md` já lista como
pendência.

---

## 8. A régua do resgate

Decisão C4. O dono pediu sistema fundamentado em pesquisa, não número
inventado — as fontes estão no fim do documento.

### 8.1 A evidência, em quatro linhas

| Achado | Fonte | O que muda aqui |
|---|---|---|
| Responder em 5 min em vez de 30 multiplica por 21 a chance de qualificar | MIT / InsideSales, 2007, +15 mil leads | Velocidade é problema da **entrada**, não do resgate. Daí a régua 1 cutucar a equipe, não o cliente. |
| 93% dos leads convertidos são alcançados até a **6ª tentativa** | Velocify, 3,5 milhões de leads | O teto útil de toques é ~6, contando o contato original. Além disso é perseguição, não persistência. |
| O vendedor médio para na **1,3ª tentativa** | InsideSales | O buraco não é a régua — é ninguém executá-la. Por isso a fila existe. |
| A maioria das revendas encerra o lead em 30 dias; lead de **90 a 365 dias** converte perto do lead novo *quando a abordagem é pertinente* | prática do setor automotivo | Existe uma segunda janela, meses depois. Ela só funciona com motivo. |

### 8.2 Três réguas, não uma

Um número só para "parado há N dias" trata coisas diferentes como iguais.
Lead novo parado há um dia é falha de atendimento; lead em negociação parado
há uma semana é esfriamento; lead perdido há seis meses é base fria. Cada um
pede resposta diferente.

**Régua 1 — `sem_primeiro_contato`. Não é resgate, é alarme.**

- Entrada: `situacao = novo` sem movimento há **24 h**.
- Destino: **a equipe**, não o cliente — mesmo desenho de
  `/api/ciclo/vendas-incompletas`.
- Por quê: o estudo do MIT mede a janela em minutos. Vinte e quatro horas já
  está fora de qualquer curva, e mandar mensagem automática ao cliente aqui
  esconderia o problema em vez de resolvê-lo.

**Régua 2 — `resgate_curto`. Esfriou dentro do ciclo de compra.**

- Entrada: sem movimento há **5 dias**, com `situacao` em `em_contato`,
  `proposta`, `visita` ou `negociacao`.
- **Quatro passos: D+5 · D+12 · D+23 · D+40**, contados da última
  movimentação.
- Espaçamento **crescente** (5 → 7 → 11 → 17 dias). Persistência que aperta
  vira perseguição; persistência que afrouxa continua sendo persistência.
- Somados ao contato original e ao que o comercial já fez, chega aos ~6
  toques do teto útil da Velocify.
- Sem resposta nos quatro: `situacao = perdido` com `motivo_sem-resposta`, e
  o lead passa à régua 3.

**Régua 3 — `resgate_longo`. A base fria — e é a que a pesquisa do setor
defende.**

- Entrada: `perdido`, ou sem movimento há **90 dias**.
- **Dois passos, com 180 dias entre eles**: D+90 e D+270 da última
  movimentação.
- **Só dispara com motivo.** O lead carrega `intencao_busca` e
  `interesse_veiculo-*` desde a origem; a régua só o põe na fila quando há
  carro no pátio que casa com o que aquela pessoa procurava. Sem casamento,
  não entra. *"Oi, ainda tem interesse?"* seis meses depois é exatamente o
  que queima uma base.
- Depois dos dois passos: **quarentena de 365 dias**.

### 8.3 Quem entrega — e por que isso é a decisão mais importante da régua

C2 diz: robô no atendimento, pessoa no resgate. Então o resgate **não é
disparo automático** — é **fila de trabalho**. O banco decide quem entra e
quando, o site monta a mensagem sugerida, e a pessoa do `time_sdr-resgate`
envia pelo Chatwoot. Três ganhos, e o terceiro é grande:

1. a mensagem sai pertinente de verdade, porque quem envia vê o carro que
   casou;
2. o desfecho volta pelo vocabulário do motor, que já existe e já é
   idempotente;
3. **o número da loja não vira disparador em massa.**

> ⚠️ **O risco que justifica o item 3.** Todo envio deste projeto sai pela
> Evolution API, que fala com o WhatsApp por protocolo não oficial (Baileys).
> Ao longo de 2026 o banimento de número nesse regime deixou de ser risco
> teórico e virou rotina, e **disparo em lote é o gatilho mais citado**. O
> desenho acima reduz muito a exposição: o robô só responde quem escreveu
> (tráfego de entrada), e o resgate sai da mão de uma pessoa, no ritmo de uma
> pessoa. Se um dia o resgate virar automático, ele precisa de **número
> separado do número principal da loja** — perder o número do atendimento não
> é perder um canal, é perder o negócio.

### 8.4 O que a fila herda sem reescrever

Todas já implementadas e provadas no motor de gatilhos: nunca domingo, nunca
entre 20h e 8h, nunca sem consentimento do canal, nunca duas mensagens no
mesmo dia para a mesma pessoa. Mais duas próprias do resgate:

- **Cliente do Ciclo vence lead frio.** Quem já comprou e tem gatilho de
  pós-venda no dia não recebe resgate. Ninguém deve ler *"ainda quer aquele
  Onix?"* no dia em que a revisão do carro dele vence.
- **Resposta em qualquer passo encerra a régua** e devolve a conversa ao time
  humano: `time_sdr-resgate` → `time_comercial`.

---

## 9. Quem conduz o diálogo — a recomendação

Decisão C3. O dono pediu recomendação para verificar.

> **Revisada em 2026-08-26**, depois da conferência pedida na §9.4. A instância
> roda **Chatwoot 4.17.0 com Captain liberado** — e o Captain 4.x tem
> *custom tools*, que era exatamente a peça cuja ausência tornaria a §9.5
> impossível. A recomendação mudou de "agente no n8n" para **Captain**; o
> raciocínio antigo segue abaixo porque continua valendo como plano B, e
> porque as quatro razões da §9.2 são o que faz o Captain ganhar por margem
> ainda maior.

**Recomendação: o Captain do próprio Chatwoot.** O agente no n8n é o plano B;
Typebot e respostas rápidas estão fora.

### 9.0 Por que o Captain, e não o agente no n8n

O que decide é a §9.2 aplicada a ele mesmo: **cada razão para preferir n8n a
Typebot vale mais forte ainda para preferir Captain a n8n.** Ele é zero
infraestrutura nova — vive dentro do Chatwoot que a loja já roda e já
licenciou. Não há workflow que possa ficar desligado em silêncio, que é o modo
de falha campeão deste projeto. E o handoff deixa de ser algo que a gente
implementa e passa a ser lógica do produto: o 4.x inclusive pula a passagem
quando a conversa já não está `pending`.

A objeção que sobrava era a §9.5 — um agente que não consulta o estoque
inventaria preço. **As *custom tools* resolvem isso nativamente:** define-se um
endpoint, o esquema dos parâmetros que o Captain deve extrair da conversa, e
uma descrição de quando usá-lo; ele decide sozinho a hora de chamar.
Autenticação aceita Bearer, GET e POST, e o teto é de 15 ferramentas por conta
— folgado para as duas ou três que este caso pede.

**O que o Captain cobra em troca, e é honesto dizer:** a configuração dele
mora no painel do Chatwoot, **não no git**. Este repositório tem regra
explícita e cara sobre isso — *"migrações são versionadas; nunca altere schema
direto pelo painel"* — e o prompt, as ferramentas e os limiares do Captain
seriam exatamente o tipo de estado que ninguém revisa e ninguém consegue
reverter. Mitigação obrigatória: **um instantâneo da configuração versionado
neste repositório a cada mudança**, nem que seja um JSON exportado à mão. Sem
isso, o dia em que o robô começar a responder errado ninguém saberá o que
mudou nem quando.

**O pré-requisito que o Captain não dispensa:** `GET /api/estoque` **exige
sessão de navegador** (`supabase.auth.getUser()`, 401 sem ela) — o Captain não
tem cookie. Precisa de uma rota de leitura própria, com Bearer, devolvendo só
o que o robô pode dizer: marca, modelo, versão, ano, km, preço público e
disponibilidade. Nunca `preco_compra`, nunca placa. Esse trabalho existiria
igual com o agente no n8n; não é diferença entre os dois, é item do A4.

### 9.0-b O plano B, e o que o resto desta seção ainda vale

### 9.1 O mecanismo que decide

O Chatwoot tem estado nativo para isto. Caixa de entrada com agent bot faz
toda conversa nova nascer em **`pending`**; o bot recebe `message_created` por
webhook, responde pela API de mensagens, e **passa para humano mudando o
status para `open`**. O agente devolve ao bot voltando a `pending`.

Ou seja: a passagem de bastão é **estado do Chatwoot, não cola nossa**. Numa
montagem com Typebot, transferir contexto, pausar o bot e sincronizar estado
entre as duas ferramentas é código que nós escrevemos e mantemos.

### 9.2 As quatro razões, na ordem em que pesam

1. **Menos peça para quebrar.** O n8n já está no ar, já tem as credenciais
   provadas (Evolution, Supabase) e já é quem conversa com o site. Typebot
   seria um quarto serviço para hospedar, atualizar e vigiar — e o modo de
   falha campeão deste projeto é exatamente *"serviço no ar, mas desligado e
   em silêncio"*: há cinco assim hoje.
2. **WhatsApp não tem botão.** A pessoa escreve *"tem esse em preto?"* e
   *"quanto fica de entrada?"*. Árvore de decisão trava nisso; agente que
   classifica texto livre, não.
3. **O handoff é o ponto crítico do robô puro** (exigência 5 da §1). Com o
   robô sozinho na primeira linha, o que decide se o cliente é bem atendido é
   a hora de sair de cena. Estado nativo vale mais que editor visual.
4. **Uma coisa de cada vez.** Adicionar Typebot é adicionar mais uma coisa que
   pode ficar desligada.

### 9.3 Onde o Typebot ganharia — e por que não aqui

Se o diálogo fosse formulário rígido de campos fixos, e a edição precisasse
ser feita por quem não mexe em n8n. Não é o caso: C2 põe o robô no WhatsApp,
em texto livre.

### 9.4 A conferência que estava pendente — respondida

**Chatwoot 4.17.0, Captain liberado na VPS** (confirmado pelo dono em
2026-08-26). É o que motivou a revisão no topo desta seção.

**Sem custo adicional** (dono, 2026-08-26): o Captain roda na VPS da loja e o
provedor de IA já está resolvido ali. O item de custo que eu tinha deixado
aberto está fechado.

Mas ele fecha e abre outro, que não é de dinheiro e importa mais: **qual modelo
está atrás do Captain.** As *custom tools* da §9.0 dependem de chamada de
função — o modelo precisa ler a descrição da ferramenta, decidir sozinho que
aquele momento pede consultar o estoque, e extrair marca e modelo da frase do
cliente. Modelo pequeno rodando local faz isso de forma irregular: às vezes
chama, às vezes responde de cabeça. E responder de cabeça sobre preço é
exatamente o que a §9.5 existe para impedir.

Então a conferência muda de pergunta, não some:

1. **Que modelo o Captain está usando** — e se ele suporta *function calling*
   com confiabilidade.
2. **Um teste de mesa antes de abrir para cliente:** dez perguntas de preço e
   disponibilidade, incluindo carro que NÃO está no pátio. O aceite é duro —
   dez em dez consultando a ferramenta, e a resposta sobre o carro ausente
   sendo "vou verificar e te retorno" com passagem para humano, nunca um preço
   inventado. Nove em dez não passa: a décima é um cliente recebendo número
   errado por escrito.

### 9.5 A trava, seja qual for a ferramenta escolhida

O agente **nunca** afirma preço, disponibilidade ou condição de pagamento que
não tenha lido do estoque. O que não está lá, ele não diz — passa para humano.
É a mesma regra que o resto do projeto aplica a número que não se inventa.

Com o Captain isso vira uma *custom tool* de leitura, apontada para a rota
nova da §9.0 e descrita como *"consulta o estoque da loja por marca, modelo ou
faixa de preço"*. A régua de segurança das ferramentas vale aqui integralmente:
escopo apertado, e **nenhuma ferramenta de escrita** na primeira linha — um
robô que agenda, cancela ou promete desconto tem raio de explosão que não se
confia a quem entrou hoje.

---

### 9.6 Trocar o modelo do Captain para o Claude — é possível, e são três campos

Levantado em 2026-08-26, a pedido do dono. O Captain nasce apontado para a
OpenAI (`gpt-4o-mini` é o padrão), mas o campo de endereço é editável, e a
Anthropic publica uma camada de compatibilidade com a API da OpenAI. As duas
pontas se encontram sem gateway, sem proxy e sem uma linha de código.

No **Super Admin Console → Settings → Captain** do Chatwoot auto-hospedado:

| Campo | O que pôr |
|---|---|
| OpenAI API Endpoint | `https://api.anthropic.com/v1/` |
| OpenAI API Key | a chave da Anthropic (o campo se chama "OpenAI", o conteúdo não precisa ser) |
| OpenAI Model | `claude-opus-5` |

**A parte que importa para este projeto: chamada de ferramenta funciona.** A
tabela de compatibilidade marca como *fully supported* o `tools[].function`
inteiro (nome, descrição e `parameters`), o `parallel_tool_calls`, o
`tool_calls` da resposta e as mensagens de papel `tool` com `tool_call_id`. Ou
seja, as *custom tools* da §9.0 — e com elas a trava da §9.5 — atravessam a
camada intactas. Era a única coisa que precisava valer.

#### As quatro ressalvas, em ordem de peso

1. **A Anthropic não vende essa camada como caminho de produção.** O texto
   dela é explícito: *"primarily intended to test and compare model
   capabilities, and is not considered a long-term or production-ready
   solution for most use cases"* — com a promessa de seguir funcional e sem
   quebra, mas com a prioridade na API nativa. Para um robô que fala com
   cliente, isso é um risco a assumir de olhos abertos, não uma nota de
   rodapé.
2. **`strict` é ignorado.** A camada aceita o campo e não o aplica, então o
   JSON da chamada de ferramenta **não tem garantia** de seguir o esquema que
   o Captain declarou. Na prática costuma sair certo; o ponto é que a garantia
   formal não existe, e o teste de mesa da §9.4 passa a ter de olhar também
   *a forma* do que chegou na rota, não só se a rota foi chamada.
3. **Acaba o "sem custo adicional".** Este é o ponto que muda a conta da C3: o
   Captain na VPS não cobra, mas a API da Anthropic cobra por token. E a
   camada de compatibilidade **não suporta cache de prompt**, então o prompt de
   sistema e o material de apoio são cobrados por inteiro a cada mensagem — é
   o que faz o lado da entrada dominar o gasto.
4. **Mensagem de sistema no meio da conversa é achatada.** A camada concatena
   todas as `system`/`developer` numa só, no começo. Não afeta o desenho
   atual, mas afeta o dia em que alguém quiser injetar instrução no meio do
   atendimento.

#### A ordem de grandeza do custo

Com preço de tabela em 2026-06 — Opus 5 a US$ 5/US$ 25 por milhão de tokens
(entrada/saída), Sonnet 5 a US$ 2/US$ 10, Haiku 4.5 a US$ 1/US$ 5 — e uma
conversa hipotética de dez trocas, com ~3 mil tokens de contexto por vez e
~150 de resposta:

| Modelo | Por conversa (ordem de grandeza) |
|---|---|
| `claude-opus-5` | ~US$ 0,19 |
| `claude-sonnet-5` | ~US$ 0,08 |
| `claude-haiku-4-5` | ~US$ 0,04 |

**Estes números são estimativa, não medição** — o multiplicador de verdade é o
tamanho do prompt de sistema do Captain e o quanto de material de apoio ele
carrega, e nenhum dos dois existe ainda. Servem para dizer se a conversa é de
centavos ou de reais; não servem para orçamento. A escolha do modelo é do dono.

#### A recomendação

**Use a camada exatamente para o que ela foi feita: comparar.** O teste das dez
perguntas da §9.4 é literalmente "test and compare model capabilities" — rode-o
duas vezes, uma com o modelo atual da VPS e outra apontando para o
`claude-opus-5`, e decida com o resultado na mão em vez de com suposição sobre
qualidade de chamada de ferramenta. Se o modelo local passar dez em dez, ele
ganha por custo e por não depender de rede. Se não passar, aí a conversa sobre
pagar por token tem base.

---

## 10. Decisões tomadas em 2026-08-26

| # | Questão | Decisão do dono |
|---|---|---|
| C1 | Existe instância de Chatwoot? | **Sim.** `app.chat.v2o5.com.br`, conta `3`, caixa de entrada `11` — mesma família de domínio do n8n. Destrava A3. |
| C2 | Quem é o SDR? | **Robô puro** na primeira linha. Pessoa entra **só no resgate/reativação**. |
| C3 | Ferramenta do diálogo | **Captain**, o agente do próprio Chatwoot — instância em 4.17.0 com ele liberado, e as *custom tools* do 4.x resolvem a trava do estoque nativamente (§9.0). Agente no n8n fica como plano B. Duas condições: rota de leitura com Bearer para o robô, e instantâneo da configuração versionado no repositório. |
| C4 | Régua do resgate | **Três réguas** (§8): alarme interno em 24 h; curto em D+5/12/23/40; longo em D+90 e D+270, só com carro que case. |
| C5 | Administrativo-financeiro no atendimento | **Criar a função** `time_admin-financeiro`. Pessoas a definir depois. |
| C6 | Papel de pós-venda | **Sim**, papel próprio no painel. Encerra o arranjo transitório da D9 do `AUDITORIA.md`. |
| C7 | Fonte de verdade da etapa | **O kanban manda, a operação é pelo Chatwoot** — escrita passante, §10.1. |

### 10.1 O que "o kanban manda, mas precisa ser operacional" significa

O atendente vive no Chatwoot; é lá que a mão dele está. Mas a verdade sobre o
lead é uma linha da tabela `leads`. Conciliar os dois sem criar duas verdades
é **escrita passante**:

1. O atendente troca a etiqueta `etapa_` na conversa — o gesto natural, onde
   ele já está.
2. O Chatwoot avisa o n8n, que chama `POST /api/atendimento/evento`.
3. **O site decide**: valida contra as sete etapas, aplica a régua de
   não-regressão (mesma ideia do `desfecho_pode_gravar()` que já existe no
   motor) e grava.
4. O site **devolve ao Chatwoot a etiqueta que de fato ficou**. Se o atendente
   tentou algo inválido, o rótulo volta sozinho — correção visível, não
   divergência silenciosa.
5. Mover o card no kanban percorre o mesmo caminho ao contrário.

Um valor, um dono, dois controles remotos.

### 10.2 Os papéis que nascem daqui

C2, C5 e C6 juntos dizem quais papéis o painel ganha — e, tão importante
quanto, quais **não** ganha:

| Papel | Situação |
|---|---|
| `pos_venda` | **Novo.** Dono da fila de verificação, dos lembretes de revisão e das conversas `time_pos-venda`. Encerra o arranjo transitório da D9. |
| `sdr_resgate` | **Novo.** É a pessoa da C2 — opera a fila das réguas 2 e 3. |
| `sdr` de primeira linha | **Não nasce.** É robô, e robô não é usuário do painel. `time_sdr` existe como etiqueta de conversa, não como papel de gente. |
| `admin_financeiro` | **Não nasce.** `financeiro` já está em `PERFIS` e só ganha a superfície de atendimento; `time_admin-financeiro` é a etiqueta. Papel novo aqui duplicaria linha da matriz. |

### 10.3 O que ainda falta decidir

Uma coisa só, e ela é da C5: **quem** atende pelo administrativo-financeiro. A
função está criada; as pessoas o dono resolve depois, como combinado. Até lá
`time_admin-financeiro` existe e as conversas ficam sem dono nomeado — o que é
visível no painel, e não silencioso.

---

### 10.4 O que mudou depois de 26/08

| Quando | O quê |
|---|---|
| 2026-08-26 | As sete decisões (§10). |
| 2026-08-26 | **C3 revisada** no mesmo dia: Chatwoot 4.17.0 com Captain liberado, e a caixa `11` confirmada como a do WhatsApp. A recomendação passou de agente no n8n para Captain (§9.0). |
| 2026-08-26 | **Pacote A1 implementado** — `ag_uid`, `ref_curta` gerada, gravação em `/api/leads` e busca no kanban A8. |
| 2026-08-26 | **Migração do A1 aplicada em produção.** A autoconferência passou junto (ela estoura se não passar), então a busca por referência está no ar. |
| 2026-08-26 | **Captain sem custo adicional** — roda na VPS. O item de custo da §9.4 fecha; entra no lugar a conferência do modelo e o teste de mesa das dez perguntas. |
| 2026-08-26 | **Levantado como apontar o Captain para o Claude** (§9.6): três campos no Super Admin Console, chamada de ferramenta funciona pela camada de compatibilidade, e quatro ressalvas — a maior é que a Anthropic não vende essa camada como caminho de produção. Sem decisão ainda; o teste das dez perguntas é o que decide. |

---

## Fontes

Da §8, na ordem em que aparecem:

- [Lead Response Time: Every Study (MIT, HBR, Drift)](https://ainora.lt/blog/lead-response-time-statistics-every-study-2026)
  — compilação dos estudos de tempo de resposta, incluindo o MIT/InsideSales
  de 2007 (mais de 15 mil leads)
- [B2B Sales Follow-Up Statistics: Touches, Timing & Reply Data](https://www.cirrusinsight.com/blog/sales-follow-up-statistics)
  — a cadência de ~6 toques e o dado da Velocify (3,5 milhões de leads)
- [Follow-Up Statistics That Actually Hold Up](https://conciergr.com/blog/follow-up-statistics-sales)
  — a 1,3ª tentativa média e o alcance de 80% com 6+ tentativas
- [Dealership lead reactivation in 2026: the playbook](https://www.useclearline.com/blog/dealership-lead-reactivation-ai-tools-2026)
  — o corte de 30 dias da revenda média e a conversão do lead de 90–365 dias
- [Ultimate Guide to CRM Database Reactivation](https://www.visquanta.com/blog/crm-database-reactivation-guide)
  — os 5 a 8 toques da reativação de base fria

Da §8.3 e da §9:

- [How to Use Evolution API Without Getting Banned on WhatsApp (2026)](https://wasenderapi.com/blog/how-to-use-evolution-api-without-getting-banned-on-whatsapp-2026-guide)
  e [API Oficial vs Evolution API: o que muda na prática](https://blog.tipefy.com/api-oficial-do-whatsapp-vs-evolution-api-e-baileys-o-que-muda-na-pratica-para-sua-empresa)
  — o risco de banimento do protocolo não oficial. **Ambos são de fornecedor
  que vende a alternativa oficial**; o viés é declarado, e é por isso que o
  aviso da §8.3 recomenda mitigação e não troca de fornecedor.
- [How to use Agent bots — documentação do Chatwoot](https://www.chatwoot.com/hc/user-guide/articles/1677497472-how-to-use-agent-bots)
  — o `pending` → `open` que sustenta a §9.1
- [How to add labels — documentação do Chatwoot](https://www.chatwoot.com/hc/user-guide/articles/1677496066-how-to-add-labels)
  — a validação de rótulo que impõe o `familia_valor` da §5
- [Captain Custom Tools](https://www.chatwoot.com/blog/captain-custom-tools) e
  [Lesson 5: AI Actions](https://www.chatwoot.com/hc/user-guide/articles/1777328078-lesson-5-ai-actions)
  — as ferramentas que sustentam a §9.0: endpoint, esquema de parâmetros,
  autenticação Bearer, GET e POST, teto de 15 por conta
- [How to enable Captain on self-hosted installations](https://www.chatwoot.com/hc/user-guide/articles/1755284287-how-to-enable-captain-on-self_hosted-installations)
  — os campos do Super Admin Console (chave, modelo, endereço) da §9.6
- [OpenAI SDK compatibility — documentação da Anthropic](https://platform.claude.com/docs/en/api/openai-sdk)
  — o endereço base, a tabela campo a campo que confirma a chamada de
  ferramenta, o `strict` ignorado, a ausência de cache de prompt e o aviso de
  que a camada não é caminho de produção. Tudo da §9.6 sai daqui.

---

## Registro

Documento criado em 2026-08-26; as sete decisões chegaram no mesmo dia e estão
na §10, com o histórico de revisões na §10.4.

**O pacote A1 saiu do papel e está em produção** — é a única parte deste
documento que virou código, e a única que já roda. O resto (A2 a A7) segue
desenho.

A §2 é verificável no código de hoje; a §3, por ausência — menos a §3.2, que
deixou de ser ausência; as §§4 a 7 são desenho; as §§8 e 9 são desenho
fundamentado, com as fontes acima.

O próximo passo é o **A2**, o vocabulário travado em código — e antes dele,
ler o esquema da `lead_tags` que já existe vazia no banco, para decidir entre
reaproveitar e derrubar.
