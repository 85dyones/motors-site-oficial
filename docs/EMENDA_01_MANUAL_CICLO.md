# Emenda 01 ao Manual Motors Ciclo

**Ao:** `MANUAL_MOTORS_CICLO.md`, Versão 1.0 — Agosto 2026
**Data da proposta:** 2026-08-13
**Status:** ⬜ proposta · ⬜ aprovada · ⬜ publicada como v1.1
**Origem:** decisão do dono em 2026-08-13 — adiar telemetria e abrir o programa pela área do cliente.

> Redigida porque o manual é a fonte de verdade do projeto e divergência entre
> manual e realidade não se resolve no código. Cada artigo abaixo indica o que
> o manual diz hoje, o que passa a dizer, e por quê. Enquanto esta emenda não
> for aprovada e datada, **o texto vigente é o da v1.0** — e o gatilho do §1.4
> permanece inatingível, o que mantém a recompra desligada.

---

## Motivação

A v1.0 pressupõe telemetria embarcada em três pontos: o gatilho de ativação da
recompra (§1.4), um dos quatro componentes do Índice Ciclo (§5.6) e a origem do
KM conhecido (§5.2). O provedor de rastreamento nunca foi contratado — é a
pergunta §5.8 da `AUDITORIA.md`, aberta desde 2026-08-03.

Sem emenda, a consequência é aritmética: `serie_telemetria >= 6 meses` nunca
começa a contar, o gatilho nunca abre, e o Bloco B inteiro — a recompra, que o
§1.1 chama de peça que atrai o cliente — fica adiado por tempo indeterminado.

A saída não é afrouxar o gatilho. É trocar a fonte do dado por uma **melhor
para o fim a que ele serve**. O §1.4 protege uma coisa só: que a Motors não
escreva uma opção de venda sem curva de depreciação própria com KM real. E KM
lido pela oficina no ato da revisão, com nota de serviço anexada, é dado mais
confiável do que odômetro reportado por telemetria — menos frequente, mais
verificável, e com documento fiscal por trás.

É isso que a caderneta de revisões passa a produzir.

---

## E1 — §1.4, condição de ativação da recompra

**Hoje (v1.0, §1.4):**

```
conformidade_revisao >= 70%   por 3 meses consecutivos
E veiculos_monitorados >= 150
E serie_telemetria >= 6 meses
```

**Passa a ser:**

```
conformidade_revisao >= 70%   por 3 meses consecutivos
E veiculos_monitorados >= 150
E serie_caderneta >= 6 meses
```

Onde:

- **`serie_caderneta`** = meses consecutivos com registro diário ininterrupto de
  `conformidade_diaria`, contados a partir do primeiro veículo com Ciclo ativo.
  A série não pode ter buraco: dia sem cálculo zera a contagem.
- **`veiculos_monitorados`** passa a significar veículos com Ciclo ativo **e
  caderneta viva** — ao menos uma revisão confirmada pela loja nos últimos 12
  meses, ou ainda dentro da janela da primeira revisão.

As demais condições, os limiares de 70% e 150 veículos, e o parágrafo
"Enquanto o gatilho não abre" permanecem **inalterados**.

**Permanece igualmente inalterado o §5.5:** `fator_retencao` continua exigindo
série histórica própria de depreciação por modelo. Esta emenda troca a fonte do
KM, não dispensa a curva. A recompra segue desligada até que ambos existam.

---

## E2 — §5.6, Índice Ciclo sem o componente de condução

**Hoje (v1.0, §5.6):** quatro componentes, pesos 40 / 25 / 20 / 15, com a regra
de neutralidade para quem recusa telemetria de condução.

**Passa a valer, enquanto não houver provedor contratado:**

```
indice_total = 50,00 × conformidade_revisao_pct
             + 31,25 × aderencia_km_pct
             + 18,75 × ausencia_sinistro
```

São os pesos originais 40 / 25 / 15 renormalizados pela divisão por 0,80 — isto
é, **exatamente a redistribuição proporcional que o §5.6 já manda fazer** quando
um cliente recusa. A diferença é que o componente não falta por recusa
individual, e sim por ausência estrutural da fonte.

Regras que a emenda torna explícitas:

1. `indice_ciclo.score_conducao` grava **`NULL`**, nunca `0`. A série precisa
   registrar "componente inexistente", não "nota zero" — se um dia a telemetria
   entrar, a diferença entre os dois é o que permite comparar períodos.
2. Todo cliente fica matematicamente equivalente a um cliente que recusou e teve
   o componente redistribuído. **A regra de neutralidade é preservada por
   construção**, e o teste de aceite que o plano de implementação exige para o
   Pacote 5 continua válido e obrigatório.
3. `aderencia_km_pct` passa a ser apurada sobre os pontos de KM da caderneta
   (carimbos) e das leituras declaradas (E4), não sobre série mensal contínua.
   Menor granularidade, mesma definição.

Quando houver provedor, os pesos voltam a 40 / 25 / 20 / 15 sem nova emenda —
a v1.0 volta a valer no ponto em que a fonte existir.

---

## E3 — §5.2, origem do KM conhecido

**Hoje (v1.0, §5.2):** `km_conhecido` vem da telemetria ou da última manutenção;
`rodagem_mensal` é a média entre os dois últimos registros de manutenção; sem
histórico, 1.100 km/mês.

**Passa a ser:** a fórmula não muda. Muda a lista de fontes de `km_conhecido`,
em ordem de precedência:

| Ordem | Fonte | Verificação |
|---|---|---|
| 1 | Revisão confirmada pela loja (carimbo) | Nota de serviço anexada |
| 2 | Vistoria de entrada ou de avaliação | Registro interno |
| 3 | Leitura declarada pelo cliente (E4) | Declarada, não verificada |

O padrão de 1.100 km/mês até o primeiro registro **permanece** — é o número da
v1.0 e não está sendo revisado aqui.

Toda exibição de KM ao cliente indica a origem e a data. KM declarado aparece
como declarado; nunca é apresentado com o mesmo peso de um carimbo.

---

## E4 — §2, três estruturas novas no modelo de dados

O §2 da v1.0 define `manutencoes` como o lugar onde "o dado nasce", mas não
define **a janela contra a qual a conformidade é medida** nem como uma revisão
é atestada. A emenda acrescenta:

**a) `plano_revisoes`** — a janela contratada, gerada no fechamento da venda.
Uma linha por revisão prevista, com número, KM previsto, início e fim da janela,
e o vínculo com a `manutencoes` que a cumpriu. Sem ela, `dentro_da_janela` não
tem contra o que ser calculada.

**b) O carimbo, em `manutencoes`** — quatro campos:

| Campo | Para quê |
|---|---|
| `origem_registro` | `loja`, `parceiro` ou `cliente` |
| `confirmada_em` | Nulo = registrado, sem carimbo |
| `confirmada_por` | Quem da equipe validou |
| `url_comprovante` | A nota de serviço |

**Regra que define o programa inteiro:** registro do cliente nasce **sem
carimbo e não conta** para `conformidade_revisao`. Só conta revisão com
`confirmada_em` preenchido e `dentro_da_janela = true`. É a transcrição fiel do
§1.4, que exige revisão "feita na rede dentro da janela contratada" — e é
também o que neutraliza fraude: registrar não é o ativo, o carimbo é.

**A loja valida contra a nota de serviço** (decisão do dono, 2026-08-13). Sem
comprovante legível, o registro fica pendente e não entra na conformidade.

**c) `leituras_odometro`** — KM declarado pelo cliente entre revisões, opt-in
(decisão D4, aprovada em 2026-08-13). Dado pessoal não previsto na v1.0, por
isso entra por emenda e não por implementação.

Regras: é declarado, nunca verificado; recalibra `rodagem_mensal` e a pontaria
do gatilho de revisão; **não registrar nunca penaliza o cliente** — mesma
lógica da regra de neutralidade do §5.6; e o cliente desliga o lembrete quando
quiser, pelo bloco "Meus dados".

---

## E5 — §6.3, autenticação da área do cliente

**Hoje (v1.0, §6.3):** "Autenticada por telefone com OTP."

**Passa a ser:** autenticada por **link mágico enviado por e-mail** (decisão do
dono, 2026-08-13).

Motivo: OTP por telefone exige contratar provedor de SMS e tem custo por
mensagem; o link mágico já é nativo do Supabase Auth, que o projeto usa, com
custo zero e sem fornecedor novo. A troca também simplifica o modelo de
identidade — um usuário do Supabase por cliente, no mesmo pool do painel, com
papel `cliente` (ver E7).

Consequências operacionais que a emenda registra:

1. **O e-mail passa a ser obrigatório no fechamento da venda.** O §0 já exige o
   registro completo do par cliente-veículo; esta emenda torna o e-mail um
   campo bloqueante do formulário de fechamento, e não opcional.
2. Cliente sem e-mail utilizável não perde o programa: a caderneta continua
   sendo alimentada pela loja, e a comunicação segue por WhatsApp. Ele perde o
   acesso à área logada, não o direito ao carimbo.
3. WhatsApp permanece o canal de engajamento (§7.3). O e-mail é porta de
   entrada, não canal de relacionamento.

Os cinco blocos A–E do §6.3 permanecem como estão. A fase 1 entrega A (reduzido),
D (reduzido) e E; os blocos B e C dependem de financiamento capturado e de
`valor_mercado` (§5.3), que ainda não têm fonte.

---

## E6 — Modelo de revisões programadas

A v1.0 fala em "janela contratada" sem fixá-la. Fixamos aqui, calcada na prática
publicada das montadoras — **não em estimativa**:

### Intervalo

**10.000 km ou 12 meses, o que ocorrer primeiro.**

É o intervalo publicado por Volkswagen, Honda, Toyota e Chevrolet para uso
normal, e o padrão que o cliente brasileiro já reconhece. Adotar um intervalo
próprio criaria a conversa "por que a Motors pede revisão antes da montadora".

### Tolerância

**A tolerância se aplica à régua que venceu:**

| Venceu por | Tolerância |
|---|---|
| Tempo (12 meses) | 30 dias |
| Quilometragem (10.000 km) | 1.000 km |

É a tolerância publicada pela Toyota no programa Toyota 10 (um mês ou 1.000 km),
e espelha a lógica do próprio vencimento: se o que venceu foi o calendário, a
folga é de calendário; se foi o odômetro, a folga é de odômetro.

**Antecipar nunca penaliza.** Revisão feita antes do previsto cumpre a janela e
reinicia a contagem a partir da data e do KM registrados.

### Marco zero e projeção

Para seminovo, o marco é a **venda**, não a fabricação:

```
revisão N prevista em:  km_venda + (N × 10.000 km)
                    ou  data_venda + (N × 12 meses)
                    — o que o veículo atingir primeiro

data prevista estimada = projeção de §5.2 sobre a rodagem conhecida
janela_inicio = data prevista − 30 dias
janela_fim    = data prevista + 30 dias  (ou km previsto + 1.000)
```

A data prevista é **recalculada a cada novo ponto de KM** — carimbo ou leitura
declarada. Um cliente que roda 15.000 km/ano (o teto do §1.2) vence pela régua
de KM em cerca de 8 meses; quem roda pouco vence pelo calendário. O sistema não
escolhe: aplica o que ocorrer primeiro, como a montadora faz.

### Horizonte

O contrato do Ciclo é de 36 meses (§0), o que gera **3 revisões por calendário**
e mais, se a rodagem antecipar. O `plano_revisoes` é gerado inteiro no
fechamento da venda e reprojetado a cada carimbo.

> **Este artigo é o mais provável de precisar de ajuste.** Ele foi construído
> sobre a prática de mercado porque não havia número interno definido; assim que
> a Motors tiver acordo próprio com a rede parceira, os intervalos passam a vir
> do contrato com a rede, e este artigo é substituído.

---

## E7 — Papéis, e quem valida

**Decisão do dono (D6, 2026-08-13):** confirma revisão quem tem papel
**Comercial** ou **Administrador**.

**Decisão operacional (D9), tomada em 2026-08-13:** enquanto não existir
estrutura de pós-venda, o **dono da fila de carimbos é o Comercial**, com o
Administrador como revisor e responsável final. Justificativa: é o papel que já
opera o kanban de leads e fala com o cliente; a fila de carimbos é a mesma
natureza de trabalho — atender um registro que chegou e dar um desfecho. O
Administrador entra quando há recusa ou divergência de comprovante, porque
recusar carimbo tem consequência contratual para o cliente.

Isso é **arranjo transitório e está declarado como tal.** Quando o volume
justificar, a estrutura correta é um papel `pos_venda` próprio, dono da fila de
carimbos, dos lembretes de revisão e do relacionamento durante os 36 meses. O
manual deve nomear essa pessoa — é a pergunta do Anexo item 6, ainda sem
resposta.

**Papel `cliente`:** criado em 2026-08-13 (migração
`20260813120000_role_cliente_e_is_staff.sql`, já aplicada em produção). Cliente
autentica no mesmo pool do painel mas **nunca é equipe**: não entra em
`/admin`, não lê `leads`, `site_settings` completo, histórico ou auditoria. A
régua é a função `is_staff()`, e todo papel de painel passa a viajar em
`app_metadata`, que só a chave de serviço grava.

**Sobre o SDR:** não existe papel SDR no painel — e é bom registrar isso, porque
o nome circula no projeto. O que existe são as tabelas `leads_sdr` e
`sdr_qualificacao`, criadas por fluxo do n8n fora deste repositório, e um
webhook `sdr-captura-lead` hoje desligado. Se o SDR virar usuário do painel,
será um papel novo, com linha própria na matriz do A17 — e entra na mesma
conversa da estrutura de pós-venda.

---

## O que esta emenda NÃO altera

Explicitamente, para não haver leitura por omissão:

1. **A recompra continua bloqueada.** Nenhum contrato com cláusula de recompra,
   nenhum campo `recompra_*` preenchido, nenhuma peça de comunicação
   mencionando recompra — até o gatilho do §1.4 emendado abrir **e** o
   `fator_retencao` do §5.5 existir a partir de série própria.
2. **A regra de neutralidade do §5.6 continua valendo integralmente.** Recusa
   nunca penaliza — nem de telemetria, quando houver, nem do registro de
   odômetro.
3. **A recomendação de troca continua calculada e não sobrescrevível** (§6.3-C).
4. **Nenhum traçado bruto de GPS será armazenado**, quando a telemetria entrar.
5. Os limiares de 70% e 150 veículos, os prazos de contrato e as cadências de
   comunicação do §7.3 seguem como na v1.0.

---

## Registro das decisões de 2026-08-13

| # | Questão | Decisão | Artigo |
|---|---|---|---|
| D1 | Gatilho §1.4 sem telemetria | Série da caderneta; loja valida pela nota de serviço | E1 |
| D2 | Índice sem componente de condução | 3 componentes renormalizados, `score_conducao NULL` | E2 |
| D3 | Autenticação do cliente | Link mágico por e-mail | E5 |
| D4 | Leitura de odômetro declarada | Aprovada, opt-in | E4 |
| D5 | Janelas de revisão | 10.000 km ou 12 meses; tolerância 30 dias / 1.000 km | E6 |
| D6 | Quem carimba | Comercial ou Administrador | E7 |
| D9 | Dono operacional | Comercial, com Admin como revisor — transitório | E7 |
| — | Risco de auth compartilhado | Papel `cliente` + `is_staff()` — aplicado em produção | E7 |

**Ainda sem decisão:** D7 (chave usada pelo fluxo SDR do n8n, que bloqueia
fechar a RLS das seis tabelas expostas), D8 (nome público do produto e se o
Dossiê de Procedência entra na fase 1), e a nomeação do dono de pós-venda.

---

## Vigência

Esta emenda entra em vigor quando o dono a aprovar e datar abaixo, momento em
que o `MANUAL_MOTORS_CICLO.md` passa a **Versão 1.1** com os artigos E1–E7
incorporados ao corpo, e este arquivo permanece como registro do que mudou e
por quê.

**Aprovada por:** _______________________  **Data:** ____/____/______

---

### Fontes do artigo E6

- [Revisões | Volkswagen do Brasil](https://www.vw.com.br/pt/servicos-e-acessorios/servicos-e-produtos/Revisoes.html) — 10.000 km ou 12 meses, o que ocorrer primeiro
- [Honda Customer Service — quando realizar a revisão](https://www.honda.com.br/pos-venda/automoveis/duvida-detalhe/como-saber-quando-e-hora-de-realizar-revisao-do-seu-honda) — mesma regra
- [Termos e Condições da Extensão de Garantia Toyota 10](https://www.toyota.com.br/meu-toyota/servicos/garantia/termos-e-condicoes) — tolerância de 1 mês ou 1.000 km
- [Guia por marca — intervalos de revisão no Brasil (2026)](https://consultadeplaca.net/blog/quantos-km-revisao-obrigatoria-carro-brasil-intervalo-2026) — consolidado por montadora, incluindo Chevrolet
