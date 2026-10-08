# Consulta de placa

`/admin/consulta-placa` — o retrato de um carro oferecido à loja, para compra
ou na troca. Pedido do dono em 06/10/2026.

## O que a tela responde

1. **Pode comprar?** A faixa do topo: *Não comprar como está*, *Comprar só com
   ressalvas* ou *Sem impedimento na consulta*. Forma, cor e texto.
2. **O que foi conferido?** O quadro de dez checagens, na ordem em que a loja
   reprova: leilão, sinistro, financiamento, roubo e furto, bloqueio judicial,
   restrições do Detran, débitos, donos anteriores, numeração do chassi e
   recall. Bloco que não veio aparece como *Não conferido*, nunca como *Ok*.
3. **Por quanto?** A faixa de compra, pela curva de deságio vigente
   (`parametros_avaliacao`), recalculada com o km e o estado informados.
4. **Para onde vai o preço?** A FIPE mês a mês, a faixa de compra em cada mês
   e três meses de projeção pelo ritmo dos últimos seis.

O veredito é o dos registros. Vistoria e perícia cautelar continuam valendo.

## A aba "Por modelo" (sem custo)

A tela abre nesta aba. Ela responde, antes de gastar uma consulta de placa:
**vale olhar este modelo, e para onde a tabela dele está indo?**

Escolhe-se marca, modelo e ano-modelo (a mesma cascata da `/avaliacao`). A tela mostra:

- **O alerta de tendência**, com forma, cor e rótulo escrito: `Estável`,
  `Atenção` (desvalorizando) ou `Alerta` (desvalorizando cada vez mais rápido).
  Nenhum percentual de "caiu muito" está no código: o alerta só compara a
  série com ela mesma (últimos seis meses contra os seis anteriores) e a queda
  de um ano com a diferença de preço para o ano-modelo seguinte.
- **O que a tendência custa**: meses seguidos de queda, quanto de tabela cada
  mês de pátio leva, a FIPE em três meses se o ritmo continuar, e a faixa do
  período.
- **A faixa de compra** pela curva de deságio vigente, a mesma da aba da placa.
- **Três gráficos**: FIPE e valor de compra em 24 meses com projeção, variação
  mês a mês, e o mesmo modelo ano a ano (com a tabela dos mesmos números).

De onde vem: só a tabela FIPE pública (Parallelum v2, token gratuito
`FIPE_API_TOKEN`, o mesmo da `/avaliacao`). Cada mês lido fica em
`fipe_historico`, e valor de tabela de mês fechado não muda: a primeira
análise de um modelo gasta cerca de 30 chamadas do teto diário do token, e as
seguintes, nenhuma (no mês seguinte, só os meses novos). Sem a migração
`20261006190000_fipe_historico` a aba funciona, mas não guarda nada.

**O plano gratuito da FIPE só libera os meses mais recentes.** Em 07 e
08/10/2026, com o token em produção, outubro, setembro e agosto vieram e julho
para trás respondeu 402 (Payment Required). O 402 não é tratado como falha: a
leitura para, o mês mais novo recusado fica na memória da instância do
servidor por 6 horas contadas do 402 (instância nova gasta até 3 chamadas para
reaprender) e a tela diz quantos meses o plano não cobre. O mês corrente é
sempre consultado: se ele voltar com valor, o corte cai na hora.
Com isso, gráfico de 24 meses e alerta de desvalorização (pede 6 meses) só
funcionam com o plano pago da FIPE (Pro, fipe.api.br). Assinado o plano, nada
muda no código: em até 6 horas o corte expira e os meses passam a vir.

**Desde 08/10/2026 a tela é "Consulta de veículos" (`/admin/consulta-veiculos`;
o endereço antigo redireciona), com três abas:**

1. **FIPE · grátis** (`modo: "pontual"`): só o mês corrente do ano escolhido e
   dos anos vizinhos, na FIPE pública. Valor de hoje, ano a ano e faixa de
   compra. Nunca chama a APIBrasil.
2. **Por modelo · paga** (`modo: "completa"`): a série de 24 meses. O que a
   FIPE gratuita entrega vem dela; os meses que ela corta (402) vêm da "Tabela
   Fipe Crédito" da APIBrasil (`lib/apiBrasilFipe.ts`, R$ 0,06 por mês). Antes
   de cobrar, a tela pede `estimar: true` e mostra "até N meses (até R$ X)"
   (`APIBRASIL_FIPE_PRECO`); N é um teto (todo mês da série não guardado) e,
   sem o "sim", nada é consultado. Regras da parte paga:
   - só começa com o valor de HOJE do ano escolhido em mãos;
   - não roda se o histórico guardado não pôde ser lido (cobraria de novo);
   - grava em lotes de 6 durante a leitura e para aos 40 s (a rota tem 60):
     o que foi pago não se perde se a leitura parar;
   - para em falta de saldo, token recusado, 3 falhas seguidas ou 3 "não
     tinha o carro" antes de qualquer valor (o suspeito é o pedido);
   - "não tinha" só é guardado se a mesma leitura trouxe algum valor pago;
   - resposta com o carro de exemplo ou outro ano-modelo é falha;
   - em homologação os valores de exemplo são conferidos e descartados.
3. **Por placa · paga**: a consulta de placa de sempre.
4. **Histórico** (08/10/2026): todas as consultas da equipe numa lista com
   pesquisa (`GET /api/consulta-placa/historico?q=&tipo=`). Cada análise de
   modelo que dá certo fica em `consultas_de_modelo` (migração
   `20261008120000_consultas_de_modelo`: quem, quando, modo, FIPE, meses e
   custo; nome e hora carimbados pelo banco). Abrir um item NÃO chama ninguém:
   o modelo abre com `modo: "guardado"` (só `fipe_historico`), a placa da
   consulta guardada. "Atualizar dados" roda a análise da aba, que busca só o
   que falta (na paga, com a pergunta do custo). Sem a migração, a lista mostra
   os modelos pelo que está guardado, sem quem nem custo.

**Imprimir / salvar PDF**: o botão chama a impressão do navegador; sai só a aba
aberta, com um cabeçalho da loja e sem menu, formulário nem botões (CSS de
`@media print` em `modernist.css`, `.nao-imprimir` e `.so-impressao`).

O que ela NÃO sabe: nada do carro em si. Leilão, sinistro, gravame e débito só
existem na aba da placa.

Miolo em `src/lib/mercadoPorModelo.ts` (puro) e
`src/lib/mercadoPorModelo-servidor.ts`; rota `POST /api/consulta-placa/modelo`.

## De onde vem cada dado

| Dado | Fonte | Custo |
|---|---|---|
| Cadastro, gravame, leilão, sinistro, roubo e furto, débitos, restrições, série da FIPE | APIBrasil, produto "Veículos Total" | cobrado por consulta |
| Empresa que comprou o carro zero (pelo CNPJ de faturamento) | BrasilAPI | sem custo |
| FIPE do mês conferida na tabela pública (pelo código FIPE) | BrasilAPI | sem custo |
| Ano e origem pelo chassi | conta local | sem custo |
| Faixa de compra | curva de deságio da loja | sem custo |

A parte sem custo nunca derruba a consulta: o que falhar aparece em
"Consultas sem custo que não vieram".

## O que protege o saldo

- Placa já consultada reabre do banco, sem custo. A tela procura primeiro lá.
- Placa nova pede confirmação antes de gastar.
- Uma chamada por consulta, sem nova tentativa. Em estouro de prazo a tela
  avisa que a consulta pode ter sido cobrada.
- Tabela ausente ou token faltando são descobertos antes de pagar.
- Consulta paga que não pôde ser gravada volta na tela mesmo assim, com aviso,
  e entra na fila de erros (`consulta-de-placa-nao-gravada`).
- Saldo zerado avisa pelo WhatsApp (`apibrasil-sem-saldo`).

## Dado pessoal

A resposta do fornecedor traz nome e CPF de proprietário e de financiado. Não
são gravados nem devolvidos à tela: o retrato é montado por lista positiva
(`src/lib/consultaDePlaca.ts`) e a tabela recusa as chaves
(`consultas_de_placa_sem_dado_pessoal`). Ficam só contagens.

## Quem usa

Administrador, Gestor e Comercial: linha "Consultar placa de veículo (consulta
paga)" da matriz. Trilho, página, rota e RLS cobram a mesma régua.

## Para ligar

1. Aplicar as migrações `20261006180000_consultas_de_placa` (aba da placa) e
   `20261006190000_fipe_historico` (aba do modelo).
2. Na Vercel, `APIBRASIL_TOKEN` em Production. Em Preview e Development,
   também `APIBRASIL_HOMOLOGACAO=1`: o fornecedor responde com um carro de
   exemplo e não cobra.

## O que ainda não está aqui

- **Triagem barata antes da consulta completa** (FIPE por placa + leilão). Os
  dois produtos existem na APIBrasil, mas o formato da resposta deles só dá
  para conferir com o token em mãos.
- **Base estadual do Paraná.** Na comparação de 06/10 a placa do PR voltou sem
  esse bloco. A tela mostra a falta; a fonte para cobri-la está por decidir.
- **Registro da decisão** (aprovado ou recusado, com motivo) por avaliação.
