# As ondas de conteúdo — o que vem depois da Onda 1

Worktree próprio: `C:/Users/Lenovo/Documents/motors-claude/wt-ondas-seo`, branch
inicial `conteudo/ondas-seo`, criado em 17/09/2026 a pedido do dono para tratar
**só** da sequência das ondas e da linkagem entre as peças.

O desenho das ondas é do pacote (`conteudo-seo/pacote/00-guia-normativo.md`,
§4.2). Este arquivo não o repete: ele diz **onde paramos**, **o que cada onda
seguinte precisa antes de existir** e **como a linkagem funciona de verdade no
site** — que é o ponto onde o pacote descreve uma coisa e o código faz outra.

---

## 1. Onde paramos (17/09/2026)

| Onda | Estado |
|---|---|
| 0 — Estrutura | `/guias`, hub, rodapé, schema e sitemap no ar. **Faltam dois itens:** a R8 (mapeamento motorização → guia na ficha) e a `/garantia` reescrita, que é o PR #90 e espera a revisão do contrato pelo dono. |
| 1 — Procedência | **Publicada em 17/09.** As 8 peças estão na tabela `guias`, listadas em `/guias` e no sitemap. O que mudou do markdown para o banco está em `conteudo-seo/guias-onda-1-mudancas.md`. |
| 2 — Mecânica e garantia | Não escrita. Pré-requisito do pacote: `/garantia` no ar. |
| 3 — Quilometragem e lado de compra | Não escrita. Depende de dado próprio (estudo comercial). |
| 4 — Crédito | Não escrita. Depois de o domínio ter autoridade de tema. |

Sobra da Onda 1, para o dono decidir: o rascunho `o-que-a-pericia-cautelar-nao-verifica`
continua em rascunho e cobre tema vizinho ao da peça 01.

---

## 2. A linkagem — o que o site faz hoje

O corpo do guia é **texto puro**. O renderizador (`src/app/guias/[slug]/page.tsx`)
não lê markdown e não aceita link escrito no texto: o único link que nasce dentro
de um parágrafo vem de `src/lib/linksNoTexto.ts`, que hoje conhece quatro termos:

```
Avaliação Express  → /avaliacao
perícia cautelar   → /garantia
laudo cautelar     → /garantia
financiamento      → /financiamento
```

A regra é "primeira ocorrência de cada destino por página". Consequência prática,
medida na Onda 1: as peças se citam pelo **título**, em texto, e nenhuma dessas
menções vira link. O pacote pede o contrário (R1, R3 e R7 — ver `README.md` do
pacote), e é essa a dívida que a frente das ondas carrega.

**O caminho, na ordem:**

1. Ensinar `TERMOS_COM_DESTINO` a apontar para as peças publicadas — um termo por
   peça, escrito como a peça é citada no texto das outras. Isso liga a Onda 1
   inteira sem reescrever nenhuma peça, e liga as ondas seguintes no mesmo
   movimento.
2. Só então escrever peça nova. Peça nova nasce já citando as anteriores pelos
   termos que viram link.
3. Ao fim de cada onda: conferir os links internos, o hub `/guias`, o sitemap e a
   inspeção de URL no Search Console (checklist §4.3 do guia normativo).

**Cuidado que a implementação exige:** o termo casa em QUALQUER página, não só nos
guias — ficha, hub e páginas institucionais usam o mesmo componente. Termo curto
demais ("garantia", "leilão") vira link onde ninguém pediu. O termo tem de ser a
expressão da peça ("chassi remarcado", "vistoria de transferência"), e as travas
que prendem isso hoje são `tests/links-no-texto-do-faq.test.ts`,
`tests/faq-linka-na-pagina.test.ts` e `tests/links-entre-guias.test.ts`.

### Passo 1, FEITO em 17/09

Os 8 títulos e 4 termos temáticos entraram em `TERMOS_COM_DESTINO`, a rota do
guia passou a receber o próprio caminho (sem isso a peça linkaria para si mesma)
e a segmentação passou a andar até a primeira ocorrência LIVRE — antes ela
olhava só a primeira ocorrência, e um termo curto dentro de um título perdia o
link no texto inteiro.

Medido sobre o lote publicado, com as funções do próprio site:

| | antes | depois |
|---|---|---|
| páginas de guia que linkam outra peça | 0 de 8 | **8 de 8** |
| links entre peças | 0 | **20** |
| link para `/garantia` nas peças | 8 de 8 | 8 de 8 (não foi expulso) |
| autolink | — | nenhum |

### Passo 2, FEITO em 17/09 (#122)

As duas alavancas abaixo foram aprovadas pelo dono e estão no ar. A frase é uma
só, `TEXTO_PONTE_DO_GUIA` em `textoDoLaudo.ts`, usada nas três superfícies —
uma verdade só sobre a perícia é a régua da casa. O componente
`PonteDoGuiaDoLaudo` renderiza a frase com o link nos dois blocos da ficha, e
a resposta comum do FAQ recebeu a mesma frase.

**Medido, o que cada superfície passa a linkar:** a resposta do FAQ sai com dois
destinos (`/garantia` pela expressão "perícia cautelar" e a peça pilar pelo
título) em 107 hubs; as 70 fichas ganham o link para a peça pilar, nos dois
estados do bloco do laudo.

### O desenho das duas alavancas, para a próxima onda repetir

O ganho maior não está dentro dos guias: está nas páginas que apontam para eles.
Dos 31 hubs com texto editado, só `/estoque/ate-60-mil` ganhava link para guia,
porque era o único cujo texto citava um assunto de peça ("chassi remarcado") —
o texto do hub é escrito sobre o carro, não sobre o exame.

As duas alavancas que resolveram isso, com o alcance medido no sitemap de 17/09
(200 URLs):

1. **O bloco de perguntas frequentes** é renderizado em **107 hubs** (20 de
   marca, 71 de modelo, 16 recortes) mais as institucionais. UMA frase na
   resposta sobre laudo cautelar — citando a peça pilar pelo título — vira link
   contextual em todas elas. É a maior alavanca de link interno do site, e custa
   uma linha em `textoDosHubs.ts`.
2. **O bloco do laudo na ficha** (`BlocoLaudoPendente`, texto em
   `textoDoLaudo.ts`) aparece nas **70 fichas**. Hoje ele não passa pelo
   linkador; passar, mais uma frase citando a peça pilar, liga o estoque inteiro
   à Onda 1.

As duas mexiam em texto público e foram ao dono, que aprovou em 17/09. A régua fica para a Onda 2: peça nova nasce citada na superfície que fala do assunto dela — o FAQ, o bloco da ficha, ou o texto do hub.

---

## 3. Onda 2 — escrita em 17/09/2026

O pré-requisito caiu no mesmo dia: o **#90** foi mesclado, e a `/garantia` no ar
já é a versão alinhada às peças — com o diferencial que o contrato cobre, as
exclusões listadas, o plano estendido descrito como garantia mecânica e os 120
pontos atribuídos à cautelar.

O dono respondeu o briefing na mesma data, e as respostas viraram
`fatos-da-casa`: perícia mecânica só nos carros que levantam suspeita, troca de
óleo e filtros em todo carro, mais de quinze oficinas parceiras, o que a loja
não compra num turbo pequeno e num dupla embreagem, e as regras do plano da
Gestauto. **Nada fora dessa lista foi afirmado como prática da loja.**

As sete peças, e o que cada uma ficou devendo:

| Peça | Estado | O que ainda falta da casa |
|---|---|---|
| Motor turbo de baixa cilindrada (pilar) | no ar | nada — o turbo de fábrica coberto entrou em 18/09 |
| Correia dentada banhada em óleo | no ar | falha de item de manutenção que destrói item coberto entra na garantia? |
| Carbonização de válvulas em injeção direta | no ar | faixa de preço medida em Curitiba (hoje é ordem de grandeza declarada) |
| Câmbio de dupla embreagem em usado | no ar | nada — o roteiro de rodagem foi aprovado em 18/09 e a peça o descreve |
| Vício oculto em carro usado | no ar | nada — revisão jurídica feita em 18/09 |
| Garantia de carro usado em loja (pilar do Pilar 2) | no ar | levar os 5.000 km para o contrato (hoje só o site diz) |
| Garantia estendida vale a pena? | no ar | o teto de reparo por prazo (o manual é o mesmo nos três) |
| Test-drive de carro usado: o que observar, na ordem | escrita em 18/09 | nada — nasceu do roteiro que o dono aprovou; sai por `/estoque` |

A sétima entrou porque o produto existe: o dono confirmou os três prazos
vendidos e mandou seguir o padrão do manual da Gestauto. O que ela **não** faz é
chamar o plano de seguro — o registro SUSEP do manual cobre a administradora, e
não o comprador.

**Enxugada em 18/09/2026**, por ordem do dono ("não vamos falar de detalhes tanto
assim da garantia estendida, é um serviço que vendemos e o terceiro especifica"):
a `/garantia` e os guias deixaram de reproduzir o manual do plano. Fica o que é da
loja — o plano existe, é opcional, é à parte, e o manual vem antes da assinatura —,
e onde o leitor precisa decidir, a frase virou pergunta a fazer antes de contratar.

**A malha de links da seção:** 20 links entre peças antes da onda, 60 depois,
medidos com o código de verdade nas dezesseis peças. Nenhuma linka para ela mesma,
nenhuma ficou sem vizinha, e todas terminam em `/garantia` ou `/estoque`.

---

## 4. Como cada lote roda aqui

O mesmo caminho da Onda 1, que já está provado:

1. Markdown em `conteudo-seo/pacote/guias/`, no formato do pacote (frontmatter,
   title, meta, corpo, FAQ).
2. Conversão para o formato da tabela num JSON de lote, e um relatório de
   mudanças — o arquivo por onde o dono revisa.
3. `node conteudo-seo/aplicar-guias.mjs --json=<lote>` confere e ensaia dentro de
   transação com ROLLBACK; `--gravar` publica com backup; `--reverter` desfaz.
4. PR pelo fluxo verificado (`preparar-lote.js` → CI verde no SHA → `mesclar-lote.js`),
   com as 5 checagens do Actions.
5. Publicar é gravar no banco, não mesclar: o conteúdo vive na tabela `guias`.

**Travas que valem para todo texto novo**, e que já pegaram erro real:
- o laudo fica com o vendedor e sai a pedido — nunca "na ficha", nunca
  "assim que aprovado" (`tests/coerencia-da-pericia.test.ts`);
- ranking de motivo de reprovação só com amostra, período e método declarados
  (`REGUA_DO_GUIA`, item 4, mudado em 17/09 com a confirmação do dono);
- número sem medição não entra (CLAUDE.md).

---

## 5. As próximas ondas — as bases primeiro (18/09/2026)

O pedido do dono: dominar o SEO do mercado automotivo — todo termo grande de busca
vai ter um guia, um dia — mas cobrindo as bases antes. **Base, aqui, é a busca mais
perto do dinheiro da loja**, e a ordem sai de dois dados da própria casa, não de
opinião:

- **O estoque é de carro de entrada.** Em 18/09, 28 dos 40 carros da vitrine
  custavam até R$ 50 mil, e 30 até R$ 60 mil. Esse comprador depende de crédito e quase sempre tem um
  carro para dar na troca.
- **O funil já tem nome para o que faz a venda cair** (`funil_motivos`): preço acima
  do que o cliente queria pagar, crédito reprovado, condições de pagamento ou
  entrada, avaliação do usado abaixo do esperado, avaliação recusada, não aceitou
  consignação. Cada um é uma objeção que um guia pode desmontar antes da conversa.
  O que ainda não existe é contagem: `leads` tinha 14 linhas e `negocios`, zero.

### Onda 2.1 — nomear motores e câmbios (rápida, sobre o que já está no ar)

Autorizado pelo dono em 18/09 ("é conteúdo de domínio público"). As peças de
mecânica passam a dizer quais motores e câmbios o leitor encontra no mercado —
turbos pequenos, correia banhada em óleo, injeção direta, dupla embreagem —, com
**fonte pública conferida item por item** (manual do fabricante, recall, material
técnico). Nome de motor com defeito atribuído sem fonte não entra: a loja vende
esses carros.

### Onda 3 — troca, venda e preço (saída `/avaliacao` e `/estoque`)

**No ar desde 18/09/2026, 16:13 UTC**, por ordem do dono ("grave tudo"): as dez peças, lote
`conteudo-seo/guias-onda-3.json`, escritas com os fatos que ele confirmou no mesmo dia
(`conteudo-seo/pacote/guias/ONDA-3-FATOS.md`). Na mesma gravação, os oito guias da Onda 2
passaram para a versão enxuta do plano estendido. Malha medida: 144 links entre as 26
peças. A peça de documentos descreve a transição da Resolução Contran nº 1.027/2026 (DOU
de 18/08/2026, noventa dias para os Detrans se adequarem).

O que ainda falta da casa, para a próxima volta nestas peças: se a avaliação é gratuita;
a data que dispara os oito dias na compra direta; o que a loja faz com saldo negativo; a
diferença entre consignação presencial e digital, e o que acontece no fim do prazo; se a
procuração continua depois da Resolução 1.027; quem paga multa anterior que chega depois.

| Peça | Papel | Objeção do funil que desmonta |
|---|---|---|
| Quanto vale meu carro usado: como a loja chega no número | **Pilar** | avaliação abaixo do esperado; avaliação recusada |
| Carro na troca: como funciona e o que muda no preço | troca como entrada | condições de pagamento ou entrada |
| Carro financiado: dá para vender ou trocar? | volume alto, público exato | condições de pagamento |
| Consignação de carro: como funciona | a loja já oferece | não aceitou consignação |
| O que a loja assume quando compra o seu carro | quitação, transferência, débitos | avaliação recusada |
| Vender sozinho ou para a loja: o que muda além do preço | segurança física e jurídica | vendeu para outro |
| Documentos para vender carro no Paraná | inclui a comunicação de venda ao Detran-PR | — |
| Onde vender carro em Curitiba | local | vendeu para outro |
| FIPE não é preço de venda: o que a tabela diz | volume alto, os dois lados | preço acima do esperado |
| Carro de loja ou de particular: o que o preço inclui | perícia, garantia, transferência | preço acima do esperado |

O **estudo de dados nº 2** do pacote — por que o carro vale menos do que o dono
acha — fica para quando houver amostra: o time registra o motivo de cada avaliação
que não fecha (`desfecho_motivo`, as categorias já existem) e a peça sai com
amostra, período e método declarados, como a régua exige.

### Onda 4 — crédito (saída `/financiamento`)

Financiamento de carro usado: como a análise funciona (pilar) · entrada: quanto dar
e o que ela muda · autônomo e MEI · financiamento sem entrada · e, por último,
score baixo — a maior dor e a maior dificuldade, pelo recorte que os bancos não
escrevem: o que acontece quando a mesma proposta vai para vários bancos.

### Onda 5 — modelo a modelo (a cauda longa)

Um guia por modelo, na ordem do que a loja mais vende e avalia (no histórico do
estoque: Volkswagen, Chevrolet, Fiat, Ford e Honda na frente), cada um ligado ao hub
do modelo — é onde "todo termo grande vai ter um guia" deixa de ser frase: "Onix
usado: o que checar", "Saveiro usada", "EcoSport usada", "HB20 usado", "Fit usado",
"Kwid usado", "208 usado" e assim por diante, com o motor e o câmbio de cada versão
pelo nome.

### O que faz isso escalar

- **O processo das Ondas 1 e 2**, que já está provado: briefing de fatos da casa
  (perguntas de sim ou não), dois agentes escrevendo em paralelo com o arquivo de
  fatos, revisão, conversão, travas por lote, PR verificado e gravação com ordem.
- **Medição de verdade.** Hoje a prioridade sai do estoque e do funil; para ordenar a
  cauda longa por demanda real, falta ver o que o Search Console já registra de
  impressão e posição.
