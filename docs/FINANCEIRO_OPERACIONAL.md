# Financeiro operacional — a linha geral

Registrado em **2026-08-21**, a partir do briefing do dono (Dyones) com a
adm/financeira (Sinthia). É o documento que responde "para onde o financeiro
do painel vai": hoje o dia a dia dela é fragmentado entre o RevendaMais, o
banco e planilhas soltas — e a meta declarada é **migrar tudo para cá**, com
automação (avisos por WhatsApp via n8n) e visão gerencial (relatório diário,
não só o DRE mensal).

A regra de leitura é a de sempre: o que está **Entregue** tem teste e tela; o
que está **Na fila** é decisão registrada, não promessa de prazo.

---

## 1. O briefing — o que a operação pediu

Palavras dela, na ordem em que chegaram:

| Pedido | Literal |
|---|---|
| **P1 — Ver o que vence no dia** | "Você diz para ver o que precisa ser pago no dia né... isso aí eu já não tenho uma ferramenta no revenda que seja facilitada" |
| **P2 — Separar fornecedor de cliente** | "O que eu solicitei uma vez... separar nos cadastros o que é fornecedor e o que é cliente, pois ali no revenda é tudo junto... por isso não faço o controle de contas a pagar por lá" |
| **P3 — Lançamento após o pagamento, por carro** | "Faço os lançamentos após os pagamentos serem realizados... em cada carro específico e quando é outra despesa... direto no financeiro" |
| **P4 — Conciliação bancária** | "Outra coisa que faço por lá é a conciliação bancária" |
| **P5 — Relatório diário** | "Os relatórios que puxamos realmente é só pelo DRE mensal... seria interessante uma ferramenta para verificarmos os relatórios diários" |
| **P6 — Controle de investidores** | "Controlar melhor o que eles investem e o que fazem retirada... independente se a retirada é um carro de repasse... precisa estar bem certinho os valores de entrada e saída e os gastos que teve com o veículo" |

E do dono, na mesma conversa: usuário de teste para ela, avisos automáticos
por WhatsApp (vencimento e conta subindo para aprovação) e, sobre os
investidores, "um painel que mostrasse isso pra eles também".

## 2. Mapa: pedido → estado

| Pedido | Estado | Onde |
|---|---|---|
| P1 — o que vence no dia | ✅ **Entregue 2026-08-21** | Tela **Pagamentos do Dia** (`/admin/financeiro/dia`): vencidas em aberto, vence hoje, a receber, com baixa em um clique sem sair da tela |
| P2 — fornecedor ≠ cliente | ✅ **Já existia** | `parceiros.tipo` separa desde o módulo original (Cadastros Auxiliares). O pedido era dor do RevendaMais — aqui já nasce resolvido |
| P3 — lançamento por carro | ✅ **Já existia** | `contas.veiculo_id` vincula despesa ao carro e alimenta a **Margem por Veículo** (A11); despesa sem carro vai direto ao financeiro |
| P4 — conciliação bancária | 📋 **Na fila** | Ver §4. Exige extrato bancário (OFX/API) — decisão de fornecedor antes de tela |
| P5 — relatório diário | ✅ **Entregue 2026-08-21** | A mesma tela do dia: qualquer data vira o relatório dela — liquidadas, entradas, saídas e movimento do caixa |
| P6 — investidores | ✅ **Entregue 2026-08-21** | Tela **Investidores** (`/admin/financeiro/investidores`): aportes, retiradas (inclusive em carro de repasse, vinculada ao veículo) e saldo por investidor |
| Aviso de vencimento no WhatsApp | ✅ **Já existia** | `conta_vencida` no Formato C (`WEBHOOKS_N8N.md`) — 3 dias antes, 1 dia, no dia e 7 dias após |
| Aviso de aporte/retirada | ✅ **Entregue 2026-08-21** | Evento `investidor_movimento` no Formato C, mesmo destino do `adm-motors` |
| Conta subindo para aprovação | ✅ **Entregue 2026-08-21** | Fluxo de agendamento (§3): agendar pagamento nasce `aguardando_aprovacao`, evento `conta_aguardando_aprovacao` avisa, o **Gestor** decide em **Aprovações** |
| Painel externo para o investidor | ✅ **Entregue 2026-08-21** | Área `/investidor` (§3), fora do painel: o sócio entra por link mágico e vê o próprio saldo e extrato, sob RLS |

## 3. O que o pacote de 2026-08-21 entregou

### Pagamentos do Dia (`/admin/financeiro/dia`)

A porta da manhã: régua de KPIs (a pagar hoje, vencidas em aberto, a receber,
liquidado, movimento do caixa) e as listas do dia com baixa inline — a baixa
reusa `/api/financeiro/contas/[id]/pagar`, que já grava a movimentação e
dispara `conta_paga`. Trocar a data transforma a mesma tela no **relatório
diário** (P5): à noite, a data de hoje mostra o que foi pago e o que entrou.

O recorte é a lib pura `src/lib/financeiroDia.ts` (`resumoDoDia`), provada em
`tests/financeiro-dia.test.ts` — inclusive o detalhe de fuso: o dia "de hoje"
é o de **Curitiba**, não o UTC, porque às 21h o `toISOString()` já virou para
amanhã e é à noite que o caixa fecha.

### Investidores (`/admin/financeiro/investidores`)

Cadastro próprio (não em `parceiros` — investidor não é fornecedor nem
cliente) + extrato de aportes e retiradas. As decisões que seguram o "bem
certinho" do pedido:

- **Saldo é derivado, nunca gravado** — `resumoDeInvestidores` recalcula do
  extrato a cada leitura; não existe número para dessincronizar.
- **`valor` é sempre positivo; o lado mora em `tipo`** — o desenho dos
  contadores de `conta_vencida`.
- **Retirada em carro exige dizer qual carro** (`veiculo_id`, o código
  RevendaMais) — sem isso o repasse não amarra na margem do veículo e a
  bagunça que o briefing descreve volta.
- **Investidor com movimentação não pode ser apagado** (FK sem ON DELETE);
  quem sai do negócio é **desativado**. Corrigir lançamento errado é excluir
  e lançar de novo — não há edição de valor, de propósito.
- Cada lançamento dispara `investidor_movimento` (Formato C) — o n8n decide
  quem avisa; é o primeiro tijolo do "painel para eles saberem também".

Tabelas, RLS e CHECKs em `20260821120000_financeiro_operacional.sql`, com
autoconferência; a lib espelhada por teste (`tests/investidores.test.ts` falha
se o vocabulário do SQL e o do TypeScript divergirem).

### Aprovação de agendamento (`/admin/financeiro/aprovacoes`)

> **A régua mudou no mesmo dia em que nasceu.** A primeira versão aplicava a
> linha do design doc — "alçada de R$ 1.500 no gerente". O dono desfez, com o
> pacote já pronto: *"essa regra de 1.500 reais não faz sentido no
> financeiro"*. O registro fica porque a razão vale para a próxima régua que
> alguém propuser: **numa revenda, valor não mede risco**. R$ 1.200 de
> despesa nova recorrente compromete mais caixa que R$ 40.000 de um carro já
> negociado e coberto pela venda. Qualquer limite em reais ou barra o normal
> ou libera o perigoso — e obriga alguém a defender um número arbitrário.

O que decide é o **ato**:

| Ato | O que é | Vai ao Gestor? |
|---|---|---|
| **Agendar** | conta a pagar que fica em aberto — dinheiro que ainda vai sair | **Sim** |
| **Registrar** | conta a pagar já quitada — escrituração do que aconteceu | Não |
| Receber | qualquer conta a receber | Não — alçada é sobre gasto |

- Agendamento lançado por quem não aprova nasce `aguardando_aprovacao`, e o
  evento `conta_aguardando_aprovacao` avisa no WhatsApp — o pedido literal do
  dono. Registro retroativo passa direto: o dinheiro já saiu, e travar o
  registro só esconderia o rastro — além de ser o fluxo diário da Sinthia
  ("faço os lançamentos após os pagamentos serem realizados").
- O **Gestor** decide na tela **Aprovações** — o lançamento inteiro de uma vez
  (parcelas andam juntas). Aprovar → `pendente`; recusar → `cancelado` com
  **motivo obrigatório**. Quem/quando/por quê fica em
  `aprovacao_decidida_por/em/motivo`; o instante é carimbado por trigger,
  mesmo que a rota esqueça.
- Quem **pode** aprovar não gera pendência para si mesmo: pedir que o Gestor
  aprove o próprio agendamento é burocracia sem revisor.
- Vale na **edição** também: transformar um registro liquidado em agendamento
  devolve a conta para a fila, e quem não aprova não muda o status de uma
  conta aguardando (só a rota de decisão muda).
- Agendamento aguardando **não** envelhece para `vencido` (não é dívida
  reconhecida, é pedido em análise) e **não pode ser pago** — a rota de baixa
  recusa. A autoconferência da migração prova os dois lados.
- Importação do RevendaMais e geração de recorrente passam direto: são
  compromisso que já existe, não decisão nova — forçá-los criaria avalanche
  de aprovação exatamente na virada que queremos.

**Quem decide sai da matriz, não de uma lista no código.** `podeDecidirAprovacao`
pergunta à linha "Aprovar agendamento financeiro" da A17; dar esse poder a um
papel novo é uma linha na matriz, não uma edição na lib.

#### Quem aprova não apaga a prova (2026-08-21)

Separação de funções, decidida junto com "quem aprova pagamento no dia a dia
é o Gestor". O problema concreto: quem libera um agendamento poderia, em
seguida, apagar a conta, a movimentação de caixa que a baixa gerou e a trilha
da própria decisão — `aprovacao_decidida_por/em/motivo` mora na linha de
`contas`. Some tudo junto, sem log, e a conciliação do mês seguinte não tem
como perceber.

**Excluir lançamento financeiro passa a ser exclusivo do Admin.** Gestor e
Financeiro **cancelam** (`status = 'cancelado'`, que preserva a linha e o
rastro) — e a interface troca o botão em vez de deixar um lixo que devolve
403: o doc manda o negado sumir, não ficar cinza.

O recorte importa: fecham `contas`, `movimentacoes`, `compras_produtos` e
`movimentacoes_investidor` — registro de dinheiro. Continuam abertos
`parceiros`, `categorias_financeiras` e `despesas_recorrentes`: são cadastro
e modelo, e apagar o modelo de uma recorrente não apaga conta nenhuma já
gerada por ele.

A régua vale nos **dois** lados: a RLS não tem policy de DELETE para o
financeiro (o Postgres simplesmente não apaga — não existe "quase apagou"), e
as rotas checam antes para o erro sair legível. No caminho apareceu o
**terceiro gêmeo** do bug multi-papel: `is_admin` também lia `role = 'admin'`,
então quem tem admin como papel **secundário** não era admin para o banco —
já valia para as policies de `profiles` e passaria a valer para a exclusão.
Corrigido na mesma migração.

### Dois papéis novos: `gestor` e `investidor`

Pedido do dono junto com a mudança da régua: *"precisamos de duas novas roles
também, investidor e gestor, que terá o poder de aprovar os agendamentos
financeiro, ajustar valores de negócios de carro, entrada e saída, bem como
acesso aos relatórios"*.

**Eles não são da mesma natureza — e essa é a decisão central do pacote.**

**Quem é o Gestor**, registrado em 2026-08-21 porque a resposta muda o
desenho: é uma **terceira pessoa, o proprietário da Motors** — não um
contratado externo. Ele é o orquestrador do negócio de investimento, e por
isso enxerga e controla os aportes e retiradas dos sócios. Enquanto ele não
entra, **o dono aprova como `admin`**; no dia a dia, quem libera pagamento é
o Gestor.

| | `gestor` | `investidor` |
|---|---|---|
| Natureza | papel **de painel** | papel **fora do painel**, como `cliente` |
| `is_staff()` | sim | **não** |
| Onde vive | `/admin` | `/investidor` (molde da Garagem) |
| O que faz | aprova agendamento, ajusta entrada e saída do carro, lê relatórios | confere o próprio saldo e extrato — **só leitura** |

Fosse o investidor um perfil de painel, herdaria de uma vez tudo que as telas
liberam "para quem está logado no /admin". Ele fica fora de `PERFIS`, e é só
isso que o mantém do lado de fora: `perfisDe` descarta o que não está lá, e
`ehStaff` responde `false` sem lista de exclusão em lugar nenhum.

O que o **Gestor** ganhou na matriz A17, linha a linha: "Aprovar agendamento
financeiro" (nova), "Ver relatórios gerenciais e DRE" (nova — relatório nunca
teve linha própria e vinha de carona no acesso ao módulo), "Alterar preço até
5%" e "acima de 5%" (a **saída** do negócio, sem revisão: mandá-lo a revisão
seria negar a própria alçada), "Ver custo de aquisição e margem" (a
**entrada**), "Lançar e aprovar contas a pagar" e o controle de investidores.
O que ele **não** ganhou: as três travas do doc (paleta, ficha técnica travada,
texto legal), conteúdo de site, leads, publicação e convite de usuário —
nenhuma delas foi pedida, e papel novo herda por decisão, não por inércia.

**A área do investidor** (`/investidor`) segue o desenho da Garagem: entrada
por link mágico, sem `/login` próprio; leitura **sob a sessão**, nunca com
chave de serviço (com ela, um filtro errado entregaria o extrato de um sócio
ao outro, e não haveria segunda barreira); policies `for select` apenas — ele
confere, não lança; e o vínculo conta↔investidor se faz sozinho pelo e-mail
via `reivindicar_investidor()`, a gêmea de `reivindicar_garagem()`, **com a
mesma exigência de e-mail confirmado**.

### A correção que o briefing revelou

`has_finance_access` — a régua de RLS de **todas** as tabelas do módulo
financeiro — ainda lia `role` singular. Desde os papéis múltiplos
(2026-08-19), quem tem `financeiro` como **segundo** papel carrega
`role = 'comercial'` e era negado pelo banco inteiro: via o menu (o
SidebarNav lê `papeis`), abria a tela e recebia lista vazia. A migração
redefine a função sobre `papeis` — e a versiona pela primeira vez; antes ela
só existia no bootstrap histórico.

E o banco não estava sozinho: o **`proxy.ts`** e o **`SidebarNav`** liam a
mesma coluna singular. O proxy comparava `role !== "financeiro"` (403 na API,
redirect no painel) e o trilho filtrava os grupos por um papel só — então a
mesma pessoa não via o menu, não abria a rota e não lia a tabela, por três
motivos independentes. Os dois foram corrigidos para `perfisDe(...)` no
pacote dos papéis; `tests/papeis-gestor-investidor.test.ts` trava os três
lados.

## 4. Na fila — em ordem de dor

1. **Conciliação bancária (P4).** Importação de OFX dos bancos usados hoje
   (Itaú, Bradesco, Stone) casando extrato × `movimentacoes`. Antes de
   qualquer tela: decidir se entra OFX manual ou Open Finance — custo e
   prazo muito diferentes.
2. **Migração RevendaMais → painel.** O importador já existe
   (`/admin/financeiro/importar`); a virada de chave é operacional: rodar as
   duas pontas em paralelo um mês, conferir DRE contra DRE, e só então
   desligar o lançamento de lá. O usuário de teste da Sinthia é o primeiro
   passo — criar com papel `financeiro` na A17 (multi-papel já funciona).
3. **Aprovação no cadastro de recorrente.** A geração mensal passa direto de
   propósito (compromisso já assumido) — mas o CADASTRO de uma recorrente
   nova, que é decisão de gasto como qualquer agendamento, hoje também passa.
   Fechar esse flanco quando o fluxo de aprovação estiver rodado na prática.
4. **Convite de investidor pela A17.** Hoje o Admin cria a conta com papel
   `investidor` e o vínculo se faz pelo e-mail no primeiro acesso. Falta o
   caminho feliz na tela de usuários: convidar direto do cadastro do
   investidor, sem passar por duas telas.

## 5. Onde está cada coisa

| Peça | Arquivo |
|---|---|
| Migração (função + tabelas + RLS) | `supabase/migrations/20260821120000_financeiro_operacional.sql` |
| Migração (status + trilha da aprovação) | `supabase/migrations/20260821150000_alcada_de_aprovacao.sql` |
| Migração (papéis gestor e investidor) | `supabase/migrations/20260821180000_papeis_gestor_e_investidor.sql` |
| Migração (exclusão só do admin) | `supabase/migrations/20260821210000_exclusao_financeira_so_admin.sql` |
| Régua do dia | `src/lib/financeiroDia.ts` · `tests/financeiro-dia.test.ts` |
| Régua de investidores | `src/lib/investidores.ts` · `tests/investidores.test.ts` |
| Régua da aprovação | `src/lib/alcada.ts` · `tests/alcada-aprovacao.test.ts` |
| Os dois papéis novos | `src/lib/permissoes.ts` · `tests/papeis-gestor-investidor.test.ts` |
| Rotas | `src/app/api/financeiro/dia/` · `src/app/api/financeiro/investidores/` · `src/app/api/financeiro/contas/[id]/aprovar/` |
| Telas | `src/components/financeiro/DiaOperacional.tsx` · `InvestidoresPainel.tsx` · `AprovacoesPendentes.tsx` |
| Área do investidor | `src/app/investidor/page.tsx` · `src/components/investidor/` |
| Eventos novos | `investidor_movimento`, `conta_aguardando_aprovacao`, `conta_aprovada`, `conta_recusada` — contrato em `WEBHOOKS_N8N.md` (Formato C) |
| Permissão | as linhas "Aprovar agendamento financeiro", "Ver relatórios gerenciais e DRE" e "Controlar aportes e retiradas de investidores" em `src/lib/permissoes.ts` |
