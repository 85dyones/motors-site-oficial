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
| P2 — fornecedor ≠ cliente | ✅ **Já existia**, ampliado em 2026-08-24 | `parceiros.tipo` separa desde o módulo original. Desde 24/08 os quatro cadastros de gente da casa (financeiro, Ciclo, rede de serviço e investidores) aparecem juntos em **Clientes e fornecedores** (`/admin/clientes`) — ver §3 |
| P3 — lançamento por carro | ✅ **Já existia** | `contas.veiculo_id` vincula despesa ao carro e alimenta a **Margem por Veículo** (A11); despesa sem carro vai direto ao financeiro |
| P4 — conciliação bancária | ✅ **Entregue 2026-08-22** | Tela **Conciliação Bancária** (`/admin/financeiro/conciliacao`): sobe o OFX do banco, casa com o caixa e mostra o que sobrou dos dois lados — e o que está no banco e fora do sistema vira lançamento ali mesmo, sem redigitar |
| P5 — relatório diário | ✅ **Entregue 2026-08-21** | A mesma tela do dia: qualquer data vira o relatório dela — liquidadas, entradas, saídas e movimento do caixa |
| P6 — investidores | ✅ **Entregue 2026-08-21** | Tela **Investidores** (`/admin/financeiro/investidores`): aportes, retiradas (inclusive em carro de repasse, vinculada ao veículo) e saldo por investidor |
| Aviso de vencimento no WhatsApp | ✅ **Já existia** | `conta_vencida` no Formato C (`WEBHOOKS_N8N.md`) — 3 dias antes, 1 dia, no dia e 7 dias após |
| Aviso de aporte/retirada | ✅ **Entregue 2026-08-21** | Evento `investidor_movimento` no Formato C, mesmo destino do `adm-motors` |
| Conta subindo para aprovação | ✅ **Entregue 2026-08-21** | Fluxo de agendamento (§3): agendar pagamento nasce `aguardando_aprovacao`, evento `conta_aguardando_aprovacao` avisa, o **Gestor** decide em **Aprovações** |
| Painel externo para o investidor | ✅ **Entregue 2026-08-21** | Área `/investidor` (§3), fora do painel: o sócio entra por link mágico e vê o próprio saldo e extrato, sob RLS. Desde 2026-08-22 o card no painel mostra se ele já acessa, e aponta o que falta quando não |

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
- **O card diz se o investidor já acessa o painel dele** —
  `estadoDeAcessoDoInvestidor` (lib pura) devolve três estados, e o terceiro é
  o que justifica a régua existir:
  - `com_acesso`: `perfil_id` preenchido — entrou, vê o próprio extrato.
  - `aguardando`: e-mail no cadastro, vínculo ainda não feito — falta o Admin
    criar a conta com papel `investidor` (A17) *no mesmo e-mail*, ou falta o
    primeiro login dele.
  - `sem_email`: **não é espera, é impossibilidade.** `reivindicar_investidor()`
    casa conta e investidor pelo e-mail; cadastro sem e-mail não tem por onde
    casar. Sem isso na tela, o cadastro pareceria pendente para sempre e a loja
    procuraria o defeito na conta do Auth ou no papel do usuário — quando ele
    está num campo vazio que ela mesma deixou. É o único selo em vermelho, e o
    único que a própria pessoa desta tela resolve.

  Em investidor **inativo** o selo some: acesso pendente de quem saiu não é
  pendência, e alerta que ninguém vai resolver ensina a ignorar os outros.
  Conceder a conta continua sendo poder do Admin — a matriz A17 não muda por
  causa disso; a tela só torna visível o que já era verdade.

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

#### O cadastro de recorrente também sobe (2026-08-22)

O flanco que a primeira versão deixou aberto de propósito e que esta seção
registrava como pendência. A **geração** mensal continua passando direto — o
compromisso já foi assumido, e mandar cada parcela à fila criaria uma
avalanche de aprovações idênticas todo mês, o tipo de burocracia que faz a
operação parar de usar a ferramenta. Mas o **cadastro** de uma recorrente nova
é a decisão de gasto mais pesada do módulo: assinar R$ 1.200/mês compromete
R$ 14.400 no ano sem que exista uma única conta a pagar ainda. É exatamente o
exemplo que derrubou a alçada por valor.

Duas colunas de estado, e não uma: `despesas_recorrentes.ativa` é o
interruptor da operação ("esta recorrente gera conta?"); `aprovacao_status` é
a decisão do Gestor. Sobrepô-los faria "reativar" virar "aprovar" sem que
ninguém tivesse decidido nada. A geração exige **as duas**.

O default é `aprovada`, e isso é deliberado: toda recorrente que já existe
está rodando hoje — aluguel, energia, internet. Nascer `aguardando`
congelaria o pagamento de tudo até alguém clicar, e a primeira consequência
da migração seria a loja deixar de pagar contas. Retroatividade aqui é dano,
não rigor.

A fila de **Aprovações** passa a mostrar os dois tipos na mesma tela, com as
recorrentes primeiro — o Gestor tem um lugar só para olhar, e separá-las em
páginas diferentes faria a segunda ser esquecida.

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

### Conciliação bancária (`/admin/financeiro/conciliacao`)

O último dos seis pedidos da adm/financeira a sair do RevendaMais.

**A fonte é OFX, e a escolha tem razão.** OFX é um arquivo que o banco já
entrega hoje pelo internet banking, de graça, sem contrato nem certificação.
Open Finance dá extrato ao vivo e custa contrato, prazo e fornecedor — decisão
de negócio que pode acontecer depois sem jogar nada fora: o motor
(`lib/conciliacao.ts`) não sabe de onde veio a linha, e o schema não fala de
OFX em lugar nenhum. Trocar a fonte um dia não mexe no resto.

**O extrato é PROVA, não lançamento.** A tabela `extrato_bancario` não entra
em cálculo de saldo e nenhuma linha dela vira movimentação sozinha. O caixa do
sistema continua sendo `movimentacoes`, alimentado pela baixa de conta. Isso é
o oposto de "importar o extrato para dentro do caixa", que parece prático e
destrói a conciliação: se o extrato virasse lançamento, tudo fecharia sempre —
e a pergunta que a ferramenta existe para responder ("o que saiu da conta e
ninguém lançou?") não teria mais como ser feita.

**O que sobra é o resultado, não a falha.** A tentação de um motor de
conciliação é maximizar o casamento, porque tela limpa parece sucesso. O valor
está no que não casa: linha no banco sem contraparte é tarifa, juros ou débito
que ninguém lançou; lançamento sem linha no banco é pagamento registrado que
nunca compensou. Por isso as duas listas grandes da tela são justamente essas,
e "conciliado" é uma seção fechada no rodapé.

As regras do motor:

- **Valor exato**, em centavos — conciliação com tolerância de valor não é
  conciliação: R$ 1.234,56 e R$ 1.234,65 são coisas diferentes, e juntá-las
  transforma erro de digitação em conta fechada.
- **Data com folga de 3 dias** — é onde a tolerância é legítima: a data do
  sistema é a do ATO, a do banco é a da COMPENSAÇÃO, e sexta compensa segunda.
- **Um para um**, aplicado no motor *e* por índice único no banco.
- **Empate nunca vira escolha.** Dois candidatos do mesmo valor viram
  SUGESTÃO para uma pessoa confirmar — escolher sozinho entre dois pagamentos
  iguais é onde um motor de conciliação erra caro e em silêncio. O vínculo
  feito por gente é marcado `manual`, e a auditoria separa um do outro.
- **Determinístico**: a conciliação roda de novo a cada importação, e um motor
  que muda de ideia entre duas execuções destrói a confiança de quem fecha o
  mês.

**Reimportar é o fluxo normal**, não exceção: ela baixa "últimos 30 dias" toda
semana e os arquivos se sobrepõem. O `FITID` — o identificador que o *banco* dá
à transação — é a chave da idempotência, único por `(conta, fitid)` porque dois
bancos podem emitir o mesmo número sem relação nenhuma entre as transações.

**Lançar direto do extrato fecha o ciclo.** "No banco e fora do sistema" era um
achado que a pessoa levava para outra tela e redigitava — valor, data e
descrição, três chances de errar — e o achado seguia aberto até ela voltar e
conciliar à mão. Agora a própria linha abre o lançamento
(`POST /api/financeiro/conciliacao/[id]/lancar`), que cria em sequência a conta
**já paga**, a movimentação correspondente e o vínculo da linha; se o segundo ou
o terceiro passo falha, os anteriores são desfeitos — meia conciliação deixaria
uma conta paga duplicando o que a próxima importação lançaria de novo.

Duas decisões dentro desse gesto:

- **Categoria é obrigatória — e só aqui.** `contas.categoria_id` é nulo em todo
  o resto do módulo e continua sendo. Mas este é o único caminho em que o
  lançamento nasce de uma EVIDÊNCIA e não da intenção de alguém: valor, data e
  descrição vêm prontos do banco, e a classificação é a única coisa que uma
  pessoa acrescenta. Sem ela o gesto produziria número sem significado — que é
  como o DRE vira uma pilha de "Outros", exatamente o que o relatório existe
  para não ser.
- **Não passa por aprovação, e está certo.** É registro retroativo: o dinheiro
  já se moveu e o banco atesta. Mandar à fila do Gestor pediria que ele
  aprovasse fato consumado — a mesma razão pela qual lançar conta já paga passa
  direto (`lib/alcada.ts`).

**O bug que essa entrega teve, e o que ele ensinou.** A primeira versão fazia
as três escritas em sequência na rota e, se uma falhasse, desfazia as
anteriores com `.delete()`. Estava errado de um jeito que só aparecia para
quem usa a tela: DELETE nessas tabelas é do Admin e mais ninguém, e **RLS que
recusa DELETE não levanta erro** — apaga zero linhas e devolve sucesso. Para a
adm/financeira o rollback era um no-op silencioso, e o que sobrava era uma
conta paga órfã que a próxima importação do OFX lançaria de novo: o oposto do
que a conciliação existe para fazer.

A correção não foi abrir permissão de apagar — isso desfaria "quem aprova não
apaga a prova" para consertar um detalhe de implementação, e usar chave de
serviço na rota daria o mesmo poder por outra porta. Foi **tirar a necessidade
de desfazer**: `lancar_do_extrato()` (`20260822180000`) faz os três passos numa
transação, e o Postgres reverte tudo sozinho se qualquer um falhar. De quebra
fechou um buraco que já existia para o Admin também: três viagens HTTP não são
atômicas, e uma queda no meio deixava a mesma sujeira — ninguém tinha visto
porque só o Admin conseguia limpar, e limpar já era o plano B.

A lição que vale além deste caso: **num Postgres com RLS, `delete` que a
policy recusa é indistinguível de `delete` que não achou nada.** Toda limpeza
compensatória escrita na aplicação carrega essa armadilha; a saída é não
precisar de compensação.

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

### A unificação de 2026-08-24 — dois menus a menos

Pedido do dono, e ele estava certo: *"insumo é um tipo de compra, recorrência
é um tipo de vencimento, pode ser um check no cadastro da conta a pagar... o
painel vai filtrar isso em contas fixas, variáveis"*.

O schema já concordava sem que ninguém tivesse reparado: `compras_produtos`
sempre teve `conta_id`, e a rota de compras sempre criou uma conta junto. A
compra nunca foi uma ilha — era um satélite com três campos a mais e um menu
próprio. Os três campos (`quantidade`, `valor_unitario`, `nota_fiscal`) vieram
para `contas`, e o menu sumiu.

**O que NÃO veio junto.** `compras_produtos.status` é um eixo de RECEBIMENTO
("a peça chegou?"), não de pagamento ("foi paga?"). O dono foi consultado e
descartou: *"não uso hoje, provavelmente não irei, são poucos os insumos"*.
Campo que ninguém preenche não é neutro — vira ruído que faz duvidar do resto
da tela.

**A recorrente continua em tabela própria, e isso não é inconsistência.** Uma
regra não é uma dívida: `despesas_recorrentes` não tem vencimento, tem
frequência. Virar linha em `contas` a faria entrar em toda soma do DRE e em
todo "o que vence hoje", e seria preciso um flag para excluí-la de tudo — pior
que a tabela separada. O que sumiu foi a TELA; o motor ficou. O check no
formulário cria a regra por trás e a manda para a fila do Gestor.

**O filtro deriva, não etiqueta.** "Fixa" sai de `recorrencia_id is not null`,
"compra de item" sai de `quantidade is not null`. Derivar de coluna que já
existe impede o terceiro estado — a conta marcada "fixa" sem recorrência
nenhuma por trás.

**A margem continua certa.** `compras_produtos` para de receber linha nova mas
mantém o histórico, e cada compra antiga tem conta vinculada. `FinanceMargens`
já filtrava por `conta_id` para não contar duas vezes, então lançamento novo
(só conta) e antigo (compra + conta) convivem sem distorcer o custo do carro.

**As rotas antigas redirecionam.** `/admin/financeiro/compras` e
`/admin/financeiro/recorrentes` continuam existindo só para mandar quem chega
a `contas-pagar`. Link salvo, favorito e aba aberta há três dias não podem
virar 404.

### A agenda de pessoas — quatro cadastros, uma tela (2026-08-24)

*"Precisamos ter uma aba clientes, hoje temos os cadastros auxiliares, mas não
tá legal, o revenda tem uma área de clientes sejam internos ou externos,
fornecedores... pra organizar tudo e termos como gerenciar."*

**O diagnóstico: quatro agendas que ninguém sabia que eram quatro.** A pergunta
*"quem é essa pessoa e o que ela tem comigo?"* era respondida por quatro
tabelas que nunca se falaram — `clientes` (quem comprou um carro, com CPF único
e consentimento de LGPD), `parceiros` (quem recebe ou paga no financeiro),
`parceiros_ciclo` (a rede de oficina, seguradora, despachante) e `investidores`
(quem aporta capital). O mesmo CNPJ podia estar em duas delas com grafias
diferentes, e a única porta era a aba "Parceiros" dos cadastros auxiliares, que
via um quarto do universo e se chamava "auxiliar".

**A decisão: unir a VISTA, não as TABELAS.** A tentação era fundir tudo em
`pessoas` e migrar dados. Três razões concretas dizem que não:

1. `clientes.cpf_cnpj` é UNIQUE e `parceiros.documento` não é — há parceiro sem
   documento. Fundir exigiria inventar chave para quem não tem, ou perder linha.
2. `clientes` carrega `consentimento_lgpd_em`. Consentimento não se copia entre
   tabelas: quem consentiu, consentiu naquele registro. É risco jurídico, não
   técnico.
3. `clientes.id` é destino de FK em seis tabelas do Ciclo, com contrato de 36
   meses atrás. Renumerar é reescrever história de veículo vendido.

O dono não pediu uma tabela. Pediu **um lugar para gerenciar**. A view
`agenda_de_pessoas` faz isso hoje, sem tocar num byte, e deixa a fusão física
para o dia em que alguém sentir falta dela.

**A trava que essa view não pode perder: `security_invoker`.** View no Postgres
roda, por padrão, com os privilégios de quem a criou — e quem cria migração aqui
é o dono do banco, que ignora RLS. Uma view comum sobre `clientes` seria um cano
que despeja a base inteira de CPFs para qualquer `authenticated`, inclusive o
cliente da Garagem. A autoconferência da migração checa isso de duas formas: lê
o *reloption* e, além disso, **veste a pele de um não-staff e tenta ler** —
falsificar a opção deixa a segunda checagem vermelha com "quem não é staff leu 1
linha(s) de cliente pela agenda".

**Marketing fica de fora.** A linha vizinha da A17 ("Ver e mover leads no
kanban") já lhe nega o contato individual: *"Marketing vê só o volume
agregado"*. Uma agenda de CPF, telefone e e-mail não pode ser a porta lateral
que devolve o que o kanban nega. A régua está em três lugares que precisam
concordar — a matriz, o item do trilho e o gate do proxy — e há teste de
fronteira para cada um.

**A conferência de repetidos.** Botão "Procurar cadastros repetidos" varre os
quatro cadastros e separa **prova** (mesmo documento) de **suspeita** (mesmo
nome) — existem dois "João da Silva", e alerta que erra vira alerta ignorado. A
varredura é do CONJUNTO, em páginas, com teto: quando estoura, a resposta diz
`completo: false` e a tela avisa que a análise foi parcial. Analisar uma fatia e
apresentá-la como o todo é o defeito que enterrou um lançamento na posição 709.

**O que mudou de casa.** "Cadastros auxiliares" virou **Plano de contas** — só a
árvore contábil, que é dado fixo versionado em código. Os parceiros foram para
**Clientes e fornecedores** (`/admin/clientes`), e a tela antiga carrega um aviso
apontando para lá.

**Um resto encontrado no caminho.** A régua horizontal do financeiro
(`FinanceHeaderNav`) ainda listava "Compras de Insumos" e "Despesas
Recorrentes", cujas páginas viraram redirecionamento em 24/08. O trilho lateral
tinha sido limpo; a régua ficou para trás. Item de menu que pula para outro
lugar é pior que item a menos.

## 4. Na fila — em ordem de dor

1. **Migração RevendaMais → painel.** O importador já existe
   (`/admin/financeiro/importar`); a virada de chave é operacional: rodar as
   duas pontas em paralelo um mês, conferir DRE contra DRE, e só então
   desligar o lançamento de lá. O usuário de teste da Sinthia é o primeiro
   passo — criar com papel `financeiro` na A17 (multi-papel já funciona).
2. **Atalho de convite do investidor.** O Admin já cria a conta com papel
   `investidor` na A17, o vínculo se faz sozinho pelo e-mail no primeiro
   acesso, e o card do investidor agora **mostra em que pé está esse acesso**
   (ver abaixo). Falta só o caminho curto: convidar direto do cadastro do
   investidor, em vez de passar por duas telas. Deixado por último de
   propósito — criar conta é poder do Admin, e um botão de convite no
   financeiro convida a afrouxar isso.

## 5. Onde está cada coisa

| Peça | Arquivo |
|---|---|
| Migração (função + tabelas + RLS) | `supabase/migrations/20260821120000_financeiro_operacional.sql` |
| Migração (status + trilha da aprovação) | `supabase/migrations/20260821150000_alcada_de_aprovacao.sql` |
| Migração (papéis gestor e investidor) | `supabase/migrations/20260821180000_papeis_gestor_e_investidor.sql` |
| Migração (exclusão só do admin) | `supabase/migrations/20260821210000_exclusao_financeira_so_admin.sql` |
| Migração (conciliação bancária) | `supabase/migrations/20260822130000_conciliacao_bancaria.sql` |
| Migração (aprovação de recorrente) | `supabase/migrations/20260822150000_aprovacao_de_recorrente.sql` |
| Migração (lançar do extrato atômico) | `supabase/migrations/20260822180000_lancar_do_extrato_atomico.sql` |
| Migração (conta absorve o insumo) | `supabase/migrations/20260824150000_conta_absorve_insumo.sql` |
| Migração (agenda de pessoas) | `supabase/migrations/20260824190000_agenda_de_pessoas.sql` |
| Régua do dia | `src/lib/financeiroDia.ts` · `tests/financeiro-dia.test.ts` |
| Régua de investidores | `src/lib/investidores.ts` · `tests/investidores.test.ts` |
| Régua da aprovação | `src/lib/alcada.ts` · `tests/alcada-aprovacao.test.ts` |
| Régua da agenda de pessoas | `src/lib/agenda.ts` · `tests/agenda.test.ts` |
| Leitor de OFX e motor de conciliação | `src/lib/ofx.ts` · `src/lib/conciliacao.ts` · `tests/conciliacao.test.ts` |
| Os dois papéis novos | `src/lib/permissoes.ts` · `tests/papeis-gestor-investidor.test.ts` |
| Rotas | `src/app/api/financeiro/dia/` · `src/app/api/financeiro/investidores/` · `src/app/api/financeiro/contas/[id]/aprovar/` |
| Lançar a partir do extrato | `src/app/api/financeiro/conciliacao/[id]/lancar/route.ts` + `lancar_do_extrato()` em `20260822180000` |
| Conferência do banco (somente leitura) | `supabase/manutencao/conferir-estado-do-financeiro.sql` |
| Telas | `src/components/financeiro/DiaOperacional.tsx` · `InvestidoresPainel.tsx` · `AprovacoesPendentes.tsx` |
| Área do investidor | `src/app/investidor/page.tsx` · `src/components/investidor/` |
| Tela da conciliação | `src/components/financeiro/ConciliacaoBancaria.tsx` |
| Tela da agenda de pessoas | `src/app/admin/clientes/page.tsx` · `src/components/admin/AgendaDePessoas.tsx` |
| Rotas da agenda | `src/app/api/pessoas/` (lista, `[id]` roteado por origem, `duplicatas`) |
| Eventos novos | `investidor_movimento`, `conta_aguardando_aprovacao`, `conta_aprovada`, `conta_recusada` — contrato em `WEBHOOKS_N8N.md` (Formato C) |
| Permissão | as linhas "Aprovar agendamento financeiro", "Ver relatórios gerenciais e DRE", "Controlar aportes e retiradas de investidores" e "Gerenciar clientes e fornecedores" em `src/lib/permissoes.ts` |
