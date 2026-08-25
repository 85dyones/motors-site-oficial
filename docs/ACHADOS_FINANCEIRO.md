# Achados de revisão — financeiro, investidores e agenda

Levantados em 2026-08-25 por uma revisão de código sobre `main..HEAD` da branch
de SEO (`claude/site-structural-improvements-oly9rf`), antes de abrir o PR dela.
**Os treze estão corrigidos nesta branch**, cada um com teste próprio.

## Por que este documento existe

A branch de SEO não sai do `main`: ela está empilhada sobre ~49 commits de
financeiro e investidores (PRs #8–#12). A revisão, portanto, varreu 191
arquivos — bem além dos 67 do trabalho de SEO.

Dos 14 achados, **1 era do SEO** (corrigido lá na mesma rodada) e **13 eram
deste outro trecho**. Decisão do dono em 2026-08-25: corrigir só os do SEO
naquela branch e registrar estes, para virarem trabalho próprio com teste
próprio — misturar dois assuntos numa branch de 2.000 linhas é como um deles
passa sem ser lido.

**Todos passavam na suíte.** Não eram regressões: eram lacunas que os testes de
então não cobriam. Nenhum emitia erro em lugar nenhum — é por isso que nenhum
tinha sido notado.

> ⚠️ A revisão foi de passe único, autoverificada, sem segunda opinião
> independente. **As correções abaixo passam em teste, mas nenhuma foi
> exercitada contra o banco de produção.** Os dois primeiros mexem em dinheiro
> e merecem reprodução em banco de teste antes do deploy.

## O que passou a guardar cada um

| # | Achado | Onde | Teste |
|---|--------|------|-------|
| 1 | Conciliação casava linha de uma conta com movimentação de outra | `lib/conciliacao.ts` | `conciliacao.test.ts` |
| 2 | Aporte de investidor ia para o razão aposentado | `investidores/participacoes/route.ts` | `achados-financeiro.test.ts` |
| 3 | Recorrente do check nascia sem `proxima_geracao` | `contas/route.ts`, `lib/recorrentes.ts` | `achados-financeiro.test.ts` |
| 4 | Cancelar conta em aprovação devolvia 200 sem escrever | `contas/[id]/route.ts` | `achados-financeiro.test.ts` |
| 5 | Filtro "Em aberto" escondia conta parcial | `ContasList.tsx`, `lib/alcada.ts` | `contas-lista-paginada.test.ts` |
| 6 | Recorrente do dono pulava a fila | `lib/alcada.ts` | `achados-financeiro.test.ts` |
| 7 | PUT convertia pago em agendado sem trilha | `contas/[id]/route.ts` | `achados-financeiro.test.ts` |
| 8 | 409 inalcançável virava 500 cru | `recorrentes/[id]/aprovar/route.ts` | `achados-financeiro.test.ts` |
| 9 | Total da manhã somado sobre página truncada | `financeiro/dia/route.ts` | `achados-financeiro.test.ts` |
| 10 | Investidor via JSON cru quando o perfil falhava | `proxy.ts` | `achados-financeiro.test.ts` |
| 11 | `profiles` inteiro carregado para filtrar dois | `investidores/participacoes/route.ts` | `achados-financeiro.test.ts` |
| 12 | Helper duplicado sombreando o importado | `UserManagement.tsx` | `achados-financeiro.test.ts` |
| 13 | Whitelist aceitava chave de `Object.prototype` | `lib/agenda.ts` | `achados-financeiro.test.ts` |

---

## 🔴 1 · Conciliação casava linha de uma conta com movimentação de outra

**`src/lib/conciliacao.ts`** · corrigido

O motor indexava cada linha do extrato só por `fitid`, mas a chave no banco é
`(conta, fitid)` — e a migração `20260822130000` documenta e testa exatamente
esse caso: *"o MESMO fitid em OUTRA conta bancária é transação diferente"*.

**O estrago.** Dois OFX do mesmo período, contas diferentes, ambos com FITID
`001`: `candidatosPorLinha.set(linha.fitid, …)` da segunda sobrescrevia a da
primeira, e `linhaResolvida.add(linha.fitid)` marcava **as duas** resolvidas
numa iteração só. A linha A era casada automaticamente contra a movimentação de
B, e a linha B sumia do relatório de "só no banco" — que é a razão de a
ferramenta existir.

**A correção.** `chaveDaLinha(linha)` = `${conta}\u0000${fitid}`, exportada e
usada em todos os mapas e sets do motor, no `find` da rota e no mapa da tela.
`Casamento` e `Sugestao` passaram a carregar `conta` junto do `fitid`. O
separador é `\u0000` porque não ocorre em número de conta nem em FITID: um
separador que aparece no dado é um separador que se pode forjar.

## 🔴 2 · Aporte de investidor ia para o razão aposentado

**`src/app/api/financeiro/investidores/participacoes/route.ts`** · corrigido

A migração `20260822210000` fez de `movimentacoes_investidor` o livro único e
reconstruiu `investidor_posicao` para somar dele — *"duas verdades sobre o
dinheiro do sócio é o pior resultado possível desta fusão"*. Esta rota
continuava inserindo, lendo e apagando em `investidor_movimentos`, o antigo. O
aporte aparecia no painel de gestão, **não** aparecia no painel logo acima na
mesma tela, e o `/investidor` do próprio sócio mostrava saldo menor.

**O que o achado original não tinha visto.** O razão único é chaveado pela
**ficha** (`investidores.id`), não pelo perfil de acesso — o sócio pode aportar
sem nunca abrir o sistema. Apontar a rota para a tabela certa sem traduzir a
identidade violaria a FK, e a linha não entraria.

**A correção.** `fichaDoPerfil()` faz a travessia `profiles.id` → ficha, criando
a ficha se ainda não houver (a fusão só criou para quem já tinha lançamento no
razão antigo; um investidor marcado depois não tem nenhuma). A corrida de duas
abas termina em `23505`, e aí a ficha que a outra criou é a resposta. A leitura
volta a traduzir para `profiles.id`, que é como a tela agrupa.

## 🟠 3 · Recorrente do check nascia sem `proxima_geracao`

**`src/app/api/financeiro/contas/route.ts`** · corrigido

`despesas_recorrentes.proxima_geracao` é `DATE` sem default. O insert omitia a
coluna; `/recorrentes/gerar` filtra `.lte('proxima_geracao', hoje)`, e NULL
nunca satisfaz `lte`. Como `/admin/financeiro/recorrentes` virou redirect, o
check "Repete — é despesa fixa" é **hoje o único caminho** para criar
recorrente: a linha ficava `ativa`, `aprovada`, e mês após mês gerava zero
contas, sem erro em lugar nenhum.

**A correção.** O cálculo virou `src/lib/recorrentes.ts` — puro e testável.
Eram duas escadas de frequência em dois arquivos (`recorrentes/route.ts` e
`recorrentes/gerar/route.ts`) e um terceiro chamador sem nenhuma; agora é uma
só, usada pelos três.

A data gravada é a do período **seguinte**, não a da parcela: a primeira parcela
já vira conta na mesma requisição, e apontar para ela faria o gerador duplicá-la
no primeiro dia em que rodasse.

## 🟠 4 · Cancelar conta em aprovação devolvia 200 sem escrever

**`src/app/api/financeiro/contas/[id]/route.ts`** · corrigido

A rota via `atual.status === 'aguardando_aprovacao'` e fazia
`delete updateData.status`: o UPDATE gravava só o `updated_at`. Voltava 200, a
tela dizia "Lançamento cancelado — o registro fica no histórico", e o refresh
mostrava a conta ainda aguardando. É a mesma falha de "escrita que reporta
sucesso sem escrever" que o código ao redor documenta em três lugares.

**A correção.** Cancelar é permitido a partir da fila — é o botão que
`ContasList` oferece a uma conta parada nela, e desistir não é aprovar. O que
não é cancelar recebe 409 dizendo por quê, em vez de um 200 que mente.

## 🟠 5 · Filtro "Em aberto" escondia conta paga pela metade

**`src/components/financeiro/ContasList.tsx`** · corrigido

`EM_ABERTO = "pendente,vencido,aguardando_aprovacao"` era o filtro inicial e
omitia `parcial` — enquanto `alcada.ts`, `financeiroDia.aberta()` e o próprio
`podeDarBaixa` da mesma tela sempre o incluíram. Conta paga em parte, com
dinheiro ainda devido, não aparecia na tela que abre por padrão.

**A correção.** `STATUS_EM_ABERTO` e `STATUS_DA_LISTA_EM_ABERTO` passaram a ser
exportados de `lib/alcada`, e as três telas derivam de lá. Duas listas é como
uma delas fica para trás.

## 🟠 6 · Recorrente do dono pulava a fila

**`src/lib/alcada.ts`** · corrigido

O comentário dizia que recorrente vai à fila *"pela mesma régua do agendamento —
e com mais razão"*, mas o corpo era `!podeDecidirAprovacao(perfis)`: a regra de
antes de 2026-08-24, que `precisaDeAprovacao` abandonou justamente porque
anulava a fila (*"o dono é admin, admin aprova, então TODO lançamento dele
pulava"*). O dono marcava "Repete" numa despesa de R$ 1.200/mês, a linha nascia
`aprovada`, sem `aprovacao_decidida_por`, e nada aparecia em Aprovações —
enquanto um `pagar` avulso idêntico, do mesmo usuário, era obrigado a passar.

**A correção.** `recorrenteNovaPrecisaDeAprovacao()` deixou de receber os
papéis. A pergunta era o defeito: enquanto a função a aceitasse, alguém a
responderia de novo.

## 🟠 7 · PUT convertia pago em agendado sem trilha de aprovação

**`src/app/api/financeiro/contas/[id]/route.ts`** · corrigido

O bloco de re-enfileiramento inteiro estava dentro de
`if (!podeDecidirAprovacao(...))`. Admin criava um `pagar` com `status:'pago'`
(escrituração, passa direto) e depois fazia PUT `{status:'pendente'}`: como ele
pode decidir, o bloco era pulado e a conta virava pagamento agendado **ativo**
com `aprovacao_decidida_por` e `aprovacao_decidida_em` nulos — indistinguível,
no razão, de um que ninguém revisou. É a porta de evasão que o bloco existe para
fechar.

**A correção.** O re-enfileiramento saiu de dentro da régua de papel e vale para
quem quer que seja, como o POST faz desde 2026-08-24. A régua de papel continua
governando só a regra 1 (conta na fila não muda de status por edição).

## 🟡 8 · O 409 de "não está aguardando" era inalcançável

**`src/app/api/financeiro/recorrentes/[id]/aprovar/route.ts`** · corrigido

Duas pessoas abrem Aprovações; a primeira decide. A segunda clica na mesma
linha: o UPDATE guardado por `.eq('aprovacao_status','aguardando')` casa 0
linhas, e o `.single()` do supabase-js devolve **erro** `PGRST116`, não
`data: null`. O `if (error)` genérico disparava primeiro — HTTP 500 com a
mensagem crua do PostgREST, onde a resposta certa era "alguém já decidiu esta".

**A correção.** `PGRST116` é reconhecido como o caso de 0 linhas antes do erro
genérico.

## 🟡 9 · O total da manhã era somado sobre página truncada

**`src/app/api/financeiro/dia/route.ts`** · corrigido

O PostgREST devolve no máximo 1000 linhas por chamada — restrição que
`/api/pessoas/duplicatas` já enuncia. As três consultas não tinham `range` nem
`count`, e o resultado ia direto para `resumoDoDia`. Passando de ~1000 contas em
aberto (a loja chegou a 709 em agosto), `pagarVencidas` e os totais em dinheiro
da tela que abre toda manhã eram somas da primeira página, apresentadas como o
total.

**A correção.** Varredura em lotes com `.range()` e ordem estável, teto de 20
lotes, e `completo: false` na resposta quando o teto é atingido —
`DiaOperacional` mostra o aviso. Um total truncado que não se declara é
indistinguível de um exato.

## 🟡 10 · Investidor via JSON cru quando a leitura de perfil falhava

**`src/proxy.ts`** · corrigido

`isInvestidorPath` foi acrescentado ao portão externo e ao redirect de não
autenticado quando a área nasceu, e ficou de fora do `catch` da verificação de
papel. Se o select em `profiles` falhasse, o investidor logado recebia
`{"error":"Erro na verificação de autorização"}` como corpo da página, com 403,
em vez do redirect para `/login` que `/admin` recebe do mesmo handler.

**A correção.** O `catch` cobre as duas áreas. Continua falhando fechado — o que
estava errado era a forma: JSON cru é resposta de API, e nenhuma das duas é API.

## ⚪ 11 · Carregava `profiles` inteiro para filtrar dois investidores

**`src/app/api/financeiro/investidores/participacoes/route.ts`** · corrigido

`select(...)` sem filtro, sem limit e sem range, e o `.filter(ehInvestidor)`
acontecendo em JavaScript. Todo cliente da Garagem e todo membro da equipe era
serializado do Postgres e trafegado a cada carga da tela.

**A correção.** `.or("papeis.cs.{investidor},role.eq.investidor")` faz o recorte
no banco. O `or` cobre as duas formas porque `ehInvestidor` cobre: `papeis` é a
régua desde 2026-08-19, e `role` é o espelho que linha antiga ainda pode ter
sozinha. O filtro em JS fica como última palavra, para as duas definições não
divergirem.

## ⚪ 12 · Cópia local sombreava o helper compartilhado

**`src/components/admin/UserManagement.tsx`** · corrigido

A linha 14 importava `ehPapelDePainel` de `lib/permissoes`; uma cópia local
dentro do componente sombreava o import, e as quatro chamadas resolviam para
ela. `PERFIS` ganhando um papel — como `gestor` acabou de ganhar — passaria a
ter de ser pensado em dois lugares, e a mudança no helper compartilhado não
chegaria justamente à tela cujo trabalho é exibir essa distinção.

**A correção.** A cópia saiu.

## ⚪ 13 · Whitelist em objeto literal aceitava chave herdada

**`src/lib/agenda.ts`** · corrigido

`CAMPOS_EDITAVEIS[origem]` e `ORIGENS[origem]` são literais, então chaves de
`Object.prototype` passavam pela verificação. PATCH `/api/pessoas/{id}` com
`{origem:'financeiro', toString:'x'}` fazia `mapa['toString']` devolver a função
nativa; o campo não entrava em `recusados` e a requisição chegava ao PostgREST
como update de coluna inexistente — 500 cru, em vez do 400 deliberado "Campo não
editável". Do mesmo jeito, `DELETE ?origem=constructor` passava por
`!ORIGENS[origem]` e produzia "Registro de undefined não se apaga".

**A correção.** `Object.hasOwn` nos dois lugares, e `origemConhecida()`
exportada para a rota do DELETE fazer a mesma pergunta.

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

## O que ficou de fora, e por quê

Duas coisas foram notadas durante a correção e **não** foram mexidas, para a
branch continuar com um assunto só:

1. **Quem aprova ainda pode marcar como paga, por PUT, uma conta parada na
   fila.** Nem a regra 1 nem a 2 pegam esse caso, e `ContasList` não oferece o
   botão (`podeDarBaixa` exclui `aguardando_aprovacao`), então não há caminho
   pela tela. É um caminho de API, anterior a este trabalho e fora dos treze.
2. **`exigirFinanceiro` em `participacoes/route.ts` aceita admin e financeiro,
   mas não gestor** — enquanto a RLS de `investidores` e
   `movimentacoes_investidor` aceita os três (`has_finance_access`). O gestor
   recebe 403 numa tela que o banco lhe deixaria abrir. Também anterior e fora
   dos treze.
