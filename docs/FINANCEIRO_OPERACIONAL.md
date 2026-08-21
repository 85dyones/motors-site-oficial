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
| Conta subindo para aprovação | 📋 **Na fila** | Ver §4 — depende do fluxo de alçada (a linha de R$ 1.500 da matriz A17 ainda não tem tela) |
| Painel externo para o investidor | 📋 **Na fila** | Ver §4 — o dado já existe; falta decidir a porta (área logada própria? resumo por WhatsApp?) |

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

### A correção que o briefing revelou

`has_finance_access` — a régua de RLS de **todas** as tabelas do módulo
financeiro — ainda lia `role` singular. Desde os papéis múltiplos
(2026-08-19), quem tem `financeiro` como **segundo** papel carrega
`role = 'comercial'` e era negado pelo banco inteiro: via o menu (o
SidebarNav lê `papeis`), abria a tela e recebia lista vazia. A migração
redefine a função sobre `papeis` — e a versiona pela primeira vez; antes ela
só existia no bootstrap histórico.

## 4. Na fila — em ordem de dor

1. **Fluxo de aprovação com alçada + aviso.** A matriz A17 sempre disse
   "alçada de R$ 1.500" para o Financeiro, mas nenhuma tela aplica. Desenho
   provável: conta acima da alçada nasce `aguardando_aprovacao`, evento
   `conta_aprovacao` no Formato C avisa o Admin no WhatsApp, aprovação vira
   registro (quem, quando). É o "contas que subiram pra aprovação" do dono.
2. **Conciliação bancária (P4).** Importação de OFX dos bancos usados hoje
   (Itaú, Bradesco, Stone) casando extrato × `movimentacoes`. Antes de
   qualquer tela: decidir se entra OFX manual ou Open Finance — custo e
   prazo muito diferentes.
3. **Painel externo do investidor.** O dado e o evento já existem; falta a
   porta. A infraestrutura da Garagem (área logada de cliente) serve de
   molde — mas investidor **não** é `cliente` da Garagem; seria papel novo,
   e papel novo passa pela matriz A17 primeiro.
4. **Migração RevendaMais → painel.** O importador já existe
   (`/admin/financeiro/importar`); a virada de chave é operacional: rodar as
   duas pontas em paralelo um mês, conferir DRE contra DRE, e só então
   desligar o lançamento de lá. O usuário de teste da Sinthia é o primeiro
   passo — criar com papel `financeiro` na A17 (multi-papel já funciona).

## 5. Onde está cada coisa

| Peça | Arquivo |
|---|---|
| Migração (função + tabelas + RLS) | `supabase/migrations/20260821120000_financeiro_operacional.sql` |
| Régua do dia | `src/lib/financeiroDia.ts` · `tests/financeiro-dia.test.ts` |
| Régua de investidores | `src/lib/investidores.ts` · `tests/investidores.test.ts` |
| Rotas | `src/app/api/financeiro/dia/` · `src/app/api/financeiro/investidores/` |
| Telas | `src/components/financeiro/DiaOperacional.tsx` · `InvestidoresPainel.tsx` |
| Evento novo | `investidor_movimento` — contrato em `WEBHOOKS_N8N.md` (Formato C) |
| Permissão | linha "Controlar aportes e retiradas de investidores" em `src/lib/permissoes.ts` |
