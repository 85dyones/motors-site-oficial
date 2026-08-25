# Achados de revisão — financeiro, investidores e agenda

Levantados em 2026-08-25 por uma revisão de código sobre `main..HEAD`, antes de
abrir PR do trabalho de SEO. **Nada aqui foi corrigido.**

## Por que este documento existe

A branch `claude/site-structural-improvements-oly9rf` não sai do `main`: ela
está empilhada sobre ~49 commits de financeiro e investidores (PRs #8–#12,
mergeados na branch anterior). A revisão, portanto, varreu 191 arquivos — bem
além dos 67 do trabalho de SEO.

Dos 14 achados, **1 era do SEO** (corrigido na mesma rodada) e **13 são deste
outro trecho**. Decisão do dono em 2026-08-25: corrigir só os do SEO naquela
branch e registrar estes aqui, para virarem trabalho próprio com teste próprio —
misturar dois assuntos numa branch de 2.000 linhas é como um deles passa sem ser
lido.

**Todos passam na suíte atual.** Os 1.120 testes estão verdes e o `tsc` está
limpo: cada item abaixo é uma lacuna que os testes de hoje não cobrem, não uma
regressão que alguém quebrou.

> ⚠️ A revisão foi de passe único, autoverificada, sem segunda opinião
> independente. Antes de corrigir, **reproduza**. Os dois primeiros valem
> reprodução em banco de teste hoje: corrompem dado em produção sem emitir erro.

---

## 🔴 1 · Conciliação casa linha de uma conta com movimentação de outra

**`src/lib/conciliacao.ts:155`**

O motor indexa cada linha do extrato só por `fitid`, mas a chave no banco é
`(conta, fitid)` — e a migração `20260822130000` documenta e testa exatamente
esse caso: *"o MESMO fitid em OUTRA conta bancária é transação diferente"*.

**Como reproduzir.** Importe dois OFX do mesmo período, conta `12345-6` (banco A)
e `99999-9` (banco B), ambos com o FITID `001`. Em `conciliar()`,
`candidatosPorLinha.set(linha.fitid, …)` da linha B sobrescreve a da linha A,
`linhasPorMovimentacao` conta em dobro e `linhaResolvida.add(linha.fitid)` marca
**as duas** resolvidas numa iteração só.

**O estrago.** A linha A é casada automaticamente contra a movimentação de B, e a
linha B some do relatório de "só no banco" — que é a razão de a ferramenta
existir. Depois, `api/financeiro/conciliacao/route.ts:226` grava
`movimentacao_id` na primeira linha que `linhasDoBanco.find(l => l.fitid === c.fitid)`
devolver, que pode ser a da conta errada.

**Correção sugerida.** Chavear por `${conta}|${fitid}` em todos os mapas e sets
do motor, e no `find` da rota.

---

## 🔴 2 · Aporte de investidor vai para o livro-razão aposentado

**`src/app/api/financeiro/investidores/participacoes/route.ts:214`** (leitura na
linha 76)

A migração `20260822210000` fez de `movimentacoes_investidor` o livro único e
reconstruiu a view `investidor_posicao` para somar dele — *"duas verdades sobre o
dinheiro do sócio é o pior resultado possível desta fusão"*. Esta rota continua
inserindo e lendo `investidor_movimentos`, o antigo. E é para cá que
`InvestidoresGestao.tsx:538` posta (`{recurso:'movimento', tipo, valor}`).

**Como reproduzir.** Registre um aporte de R$ 50.000 pelo `InvestidoresGestao`.
A linha aparece naquele painel, **não** aparece no `InvestidoresPainel`
logo acima na mesma tela, e o `/investidor` do próprio sócio mostra saldo
R$ 50.000 menor.

**Correção sugerida.** Apontar inserção e leitura para `movimentacoes_investidor`,
como `/api/financeiro/investidores/movimentacoes` e `/investidor/page.tsx:109` já
fazem. Conferir se há linhas órfãs na tabela antiga antes de desativá-la.

---

## 🟠 3 · Recorrente criada pelo check nasce sem `proxima_geracao`

**`src/app/api/financeiro/contas/route.ts:204`**

`despesas_recorrentes.proxima_geracao` é `DATE` sem default. O insert (linhas
179–198) omite a coluna; o POST de `/api/financeiro/recorrentes` calcula e grava.
`/recorrentes/gerar` filtra `.lte('proxima_geracao', hoje)`, e NULL nunca
satisfaz `lte`.

Como `/admin/financeiro/recorrentes` virou redirect no mesmo trabalho, o check
"Repete — é despesa fixa" da `ContaForm` é **hoje o único caminho** para criar
recorrente. Resultado: a linha fica `ativa=true`, `aprovacao_status='aprovada'`,
e mês após mês zero contas são geradas, sem erro em lugar nenhum.

**Correção sugerida.** Calcular `proxima_geracao` no insert, reusando a mesma
função do POST de recorrentes.

---

## 🟠 4 · Cancelar conta em aprovação devolve 200 sem escrever nada

**`src/app/api/financeiro/contas/[id]/route.ts:93`**

Usuário `financeiro` (não aprovador, então vê o botão "Cancelar") cancela um
agendamento na fila. A rota vê `atual.status === 'aguardando_aprovacao'` e faz
`delete updateData.status`: o UPDATE grava só `updated_at`. Volta 200, a tela diz
"Lançamento cancelado — o registro fica no histórico", e o refresh mostra a conta
ainda aguardando aprovação.

É a mesma falha de "escrita que reporta sucesso sem escrever" que o código ao
redor documenta em três lugares diferentes.

**Correção sugerida.** Permitir `cancelado` a partir de `aguardando_aprovacao`,
ou devolver 409 dizendo por que não pode.

---

## 🟠 5 · O filtro "Em aberto" esconde conta paga pela metade

**`src/components/financeiro/ContasList.tsx:8`**

`EM_ABERTO = "pendente,vencido,aguardando_aprovacao"` é o filtro inicial. Toda
outra definição de "em aberto" no mesmo trabalho inclui `parcial`:
`alcada.ts` (`{pendente,vencido,parcial}`), `financeiroDia.aberta()` (idem) e o
próprio `ContasList.podeDarBaixa`.

Conta paga em parte — dinheiro ainda devido — não aparece na tela que abre por
padrão. É o mesmo sepultamento silencioso que aquele trabalho existia para
resolver.

**Correção sugerida.** Incluir `parcial`, e derivar a constante de `alcada.ts`
para não haver duas listas.

---

## 🟠 6 · Recorrente do dono pula a fila de aprovação

**`src/lib/alcada.ts:140`**

O comentário diz que recorrente vai para a fila *"pela mesma régua do agendamento
— e com mais razão"*, mas o corpo é `!podeDecidirAprovacao(perfis)`: a regra de
antes de 2026-08-24, que `precisaDeAprovacao` justamente abandonou (*"o dono é
admin, admin aprova, então TODO lançamento dele pulava a fila"*).

**Como reproduzir.** Dono (admin) marca "Repete" numa despesa de R$ 1.200/mês.
`sobeRecorrente` é falso, a linha nasce `aprovacao_status:'aprovada'`, nada
aparece em Aprovações e não há `aprovacao_decidida_por` — enquanto um pagar
avulso idêntico, do mesmo usuário, é obrigado a passar pela fila.

**Correção sugerida.** Usar a mesma régua de `precisaDeAprovacao`.

---

## 🟠 7 · PUT converte pago em agendado sem trilha de aprovação

**`src/app/api/financeiro/contas/[id]/route.ts:85`**

O bloco de re-enfileiramento inteiro está dentro de
`if (!podeDecidirAprovacao(...))`. O POST não faz isso: desde 2026-08-24 ele
ignora quem está lançando e registra auto-aprovação por
`aprovacaoEhDoProprioAutor`.

**Como reproduzir.** Admin cria um `pagar` com `status:'pago'` (escrituração,
passa direto) e depois faz PUT `{status:'pendente'}`. Como `podeDecidirAprovacao`
é verdadeiro, as linhas 85–101 são puladas e a conta vira `pendente`: pagamento
agendado ativo com `aprovacao_decidida_por` e `aprovacao_decidida_em` nulos,
indistinguível no razão de um que ninguém revisou. O comentário acima do bloco
diz que é essa "porta de evasão" que ele existe para fechar.

---

## 🟡 8 · O 409 de "não está aguardando" é inalcançável

**`src/app/api/financeiro/recorrentes/[id]/aprovar/route.ts:77`**

Duas pessoas abrem Aprovações; a primeira aprova. A segunda clica na mesma linha.
O UPDATE guardado por `.eq('aprovacao_status','aguardando')` casa 0 linhas, e o
`.single()` do supabase-js devolve **erro** `PGRST116`, não `data: null`. O
`if (error)` da linha 74 dispara primeiro: HTTP 500 com a mensagem crua do
PostgREST, em vez do 409 explicativo. As linhas 77–82 nunca executam.

**Correção sugerida.** Tratar `PGRST116` como o caso de 0 linhas antes do
`if (error)` genérico.

---

## 🟡 9 · O total da manhã é somado sobre página truncada

**`src/app/api/financeiro/dia/route.ts:35`**

O próprio repositório enuncia a restrição em `/api/pessoas/duplicatas`: *"o
PostgREST devolve no máximo 1000 linhas por chamada"*. Aqui
`.in('status',[...]).lte('data_vencimento', data)` não tem `range` nem `count`, e
o resultado vai direto para `resumoDoDia`.

Passando de ~1000 contas em aberto — a loja já chegou a 709 em agosto —
`pagarVencidas` e os totais em dinheiro da tela que abre toda manhã são somas da
primeira página, apresentadas como o total. É o mesmo defeito que a lista de
contas acabou de ser paginada para eliminar.

---

## 🟡 10 · Investidor vê JSON cru quando a leitura de perfil falha

**`src/proxy.ts:335`**

`isInvestidorPath` foi acrescentado ao portão externo (linha 178) e ao redirect de
não autenticado (linha 210), mas o `catch` da linha 335 ainda testa só
`isAdminPath`. Se o select em `profiles` falhar (blip de conexão, erro de
schema), o investidor logado recebe `{"error":"Erro na verificação de
autorização"}` como corpo da página, com 403, em vez do redirect para `/login`
que `/admin` recebe do mesmo handler. Falha fechado — mas mostra um blob de JSON
onde deveria haver página.

---

## ⚪ 11 · Carrega `profiles` inteiro para filtrar dois investidores

**`src/app/api/financeiro/investidores/participacoes/route.ts:60`**

`select('id, full_name, email, role, papeis, is_active')` sem filtro, sem limit e
sem range, e o `.filter(ehInvestidor)` acontece em JavaScript. Todo cliente da
Garagem e todo membro da equipe é serializado do Postgres e trafegado a cada
carga de `/admin/financeiro/investidores`. `.contains('papeis', ['investidor'])`
faz a mesma seleção no banco.

---

## ⚪ 12 · Cópia local sombreia o helper compartilhado

**`src/components/admin/UserManagement.tsx:281`**

A linha 14 importa `ehPapelDePainel` de `lib/permissoes`; a 281 declara uma cópia
local dentro do componente. As quatro chamadas (284, 507, 607, 730) resolvem para
a local, e o import fica morto. `PERFIS` ganhando um papel — como `gestor`
acabou de ganhar — passa a ter de ser pensado em dois lugares, e uma mudança no
helper compartilhado não chega justamente à tela cujo trabalho é exibir essa
distinção.

---

## ⚪ 13 · Whitelist em objeto literal aceita chave herdada

**`src/lib/agenda.ts:237`**

`CAMPOS_EDITAVEIS[origem]` e `ORIGENS[origem]` são literais, então chaves de
`Object.prototype` passam pela verificação.

**Como reproduzir.** PATCH `/api/pessoas/{id}` com
`{origem:'financeiro', toString:'x'}`: `mapa['toString']` devolve a função nativa
em vez de `undefined`, o campo não entra em `recusados` e a requisição chega ao
PostgREST como update de coluna inexistente — 500 cru, em vez do 400 deliberado
"Campo não editável". Do mesmo jeito, `DELETE ?origem=constructor` passa por
`!ORIGENS[origem]` e produz "Registro de undefined não se apaga".

**Correção sugerida.** `Object.hasOwn(mapa, campo)`, ou um `Map`.

---

## Candidatos investigados e descartados

Ficam registrados para não serem reabertos: `schemaVeiculo.numberOfPreviousOwners`
(o mapper já devolve `undefined`, não `null`); a opção "sem entrada" da
`CalculadoraFinanciamento` (o handler zera o percentual); a ordem de efeito de
`ContagemDeEstoque` (o `CamadaDeDados` é irmão anterior e descarrega primeiro);
a saída de "Despesas recorrentes" e "Compras de insumos" da navegação (as duas
viraram redirect de propósito); `next/image` no `CardVeiculo` (o host está em
`remotePatterns`); e o `permanentRedirect` da ficha arquivada (o histórico inclui
vendidos, então o hub do modelo sempre existe).
