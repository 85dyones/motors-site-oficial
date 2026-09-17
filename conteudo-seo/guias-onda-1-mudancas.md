# Onda 1 — o que mudou do markdown para o banco

O que está em `conteudo-seo/guias-onda-1.json` **não é** cópia literal de
`conteudo-seo/pacote/guias/01..08-*.md`. Mudou por dois motivos, e este arquivo
separa os dois:

1. **A decisão do dono de 16/09/2026 sobre o laudo.** As oito peças afirmavam
   que o resultado da perícia fica publicado na ficha do veículo. Não fica mais:
   o laudo é da loja e está disponível para consulta com o vendedor. Todas as
   trocas por esse motivo estão listadas peça a peça, com o antes e o depois.
2. **A conversão de markdown para o formato da tabela.** O renderizador não lê
   markdown; tabela, lista, negrito e link precisaram virar frase.

Nada mais foi reescrito. Onde o texto original está intacto, ele está intacto.

> **Como ler:** cada peça tem *Decisão do laudo* (o que a decisão 2 obrigou a
> mudar), *Conversão* (o que o formato obrigou) e, quando houver, *Outras
> correções* — que são as únicas mudanças fora dessas duas causas, e estão
> separadas justamente para você aprovar ou recusar uma a uma.

---

## A decisão de formato: markdown → `corpo`

Medido em `src/app/guias/[slug]/page.tsx`, `src/lib/guiasDoBanco.ts` e
`src/lib/linksNoTexto.ts`:

| O que o markdown tem | O que o renderizador faz | O que eu fiz |
|---|---|---|
| `## Título` | vira `<h2>` (`secao.titulo`) | uma seção de `corpo` por `##`, título verbatim |
| `### Subtítulo` | **não existe** — só há `h2` | o texto do `###` abre o primeiro parágrafo do bloco, na forma `Rótulo — texto`, que é a convenção do próprio pacote (`**Pequena monta** — danos que…`) |
| Parágrafo | `<p>` com **texto puro** | idem, sem marcação |
| `**negrito**`, `*itálico*` | apareceriam com os asteriscos na tela | marcação removida, palavras mantidas |
| Lista de itens curtos | apareceria com os hifens | uma frase, itens separados por ponto e vírgula |
| Lista de itens com rótulo e explicação | idem | um parágrafo por item, rótulo e explicação juntos |
| Tabela | apareceria com as barras | um parágrafo por coluna (ou por linha, quando a comparação é por linha) |
| `[texto](/destino)` | apareceria com colchetes e parênteses | vira texto — ver abaixo |
| Nota editorial em `>` | seria publicada | removida (é recado para a equipe) |

**Por que `###` não virou seção própria.** Três medições:
`secao.titulo` é `<h2>` e não há `h3` no template, então promover achataria a
hierarquia (o subtema viraria irmão do tema); `normalizarCorpo` **descarta**
seção sem parágrafo, e em `01` o bloco "Os três eixos que a perícia examina"
não tem texto próprio antes dos `###` — promovê-los apagaria o pai; e a anatomia
do guia normativo pede 3 a 6 `H2`, contagem que as peças já esticam (6 na 01,
7 nas cinco do meio, 9 na 08) e que a promoção levaria a 9, 8 e 11 nas quatro
peças com `###` (01, 02, 07 e 08).

**Onde entra o parágrafo de abertura.** O markdown abre com duas frases antes do
primeiro `##`, e o renderizador não tem lugar para parágrafo sem seção. Elas
entraram como os **dois primeiros parágrafos da primeira seção** de cada peça —
continuam sendo o primeiro texto do corpo, que é o que o guia normativo pede
(featured snippet). A alternativa seria inventar um `H2` ("Em resumo") nas oito;
preferi não inventar título.

**Links.** O corpo não aceita link nenhum: o renderizador só cria link pelos
quatro termos de `src/lib/linksNoTexto.ts` ("Avaliação Express" → `/avaliacao`,
"perícia cautelar" e "laudo cautelar" → `/garantia`, "financiamento" →
`/financiamento`), uma vez por destino por página. Então:

- **Link entre as oito peças virou texto.** Quando a âncora se sustenta sozinha
  ("a perícia não examina esses conjuntos"), ficou só o texto. Quando era
  dêitica ("está aqui", "neste levantamento", "é o assunto deste guia"), o
  destino passou a ser **nomeado pelo título do outro guia**, para o leitor
  achá-lo em `/guias`. Estão listados peça a peça.
- **Link para peça de onda futura**: nenhum existia no corpo do markdown, então
  nada a fazer (a regra do README continua valendo).
- **As tabelas "Links internos"** dos oito arquivos pedem 53 links, dos quais 45
  são no corpo (os outros 8 são o CTA, que virou o cartão de saída). Os 45 são
  impossíveis hoje. Ficam pendentes — ver *Riscos*, ao fim.

Os links que o renderizador vai criar sozinho, peça a peça, saem no modo
conferência do aplicador (`node conteudo-seo/aplicar-guias.mjs`).

---

## 01 · `laudo-cautelar-carro-usado`

### Decisão do laudo — 3 trechos

**1. Seção "Por que o laudo antes do anúncio muda tudo"**

- **Antes:** "A gente inverte isso. A perícia cautelar independente roda
  **antes** de o carro entrar na vitrine, por conta da loja, e **o resultado da
  perícia fica publicado na ficha do veículo** — eixo por eixo, com os
  apontamentos descritos, antes de você perguntar e antes de qualquer proposta."
- **Depois:** "A gente inverte isso. A perícia cautelar independente roda antes
  de o carro entrar na vitrine, por conta da loja, e o laudo está disponível
  para consulta com o vendedor — eixo por eixo, com os apontamentos descritos,
  antes de qualquer proposta."
- "antes de você perguntar" saiu junto: era a promessa de não precisar pedir.

**2. Mesma seção, parágrafo seguinte**

- **Antes:** "O laudo **completo** não vai para o site por um motivo específico:
  ele traz nome, CPF e endereço do proprietário anterior, e esse dado não é
  nosso para publicar. O documento inteiro fica disponível para leitura no
  showroom, antes de qualquer assinatura."
- **Depois:** "O laudo não vai para o site por um motivo específico: ele traz
  nome, CPF e endereço do proprietário anterior, e esse dado não é nosso para
  publicar. Ele fica com o vendedor, e é só pedir para ler o documento inteiro,
  antes de qualquer assinatura."
- O "completo" existia para contrastar com o resultado que ficava na ficha; sem
  a ficha, ele passou a insinuar que uma parte vai para o site. E "leitura no
  showroom" era mais estreito que a frase oficial, que não prende o pedido ao
  balcão.

**3. Fecho, seção "O que fazer agora"**

- **Antes:** "**Todo carro no nosso estoque já passou por essa etapa, e o
  resultado da perícia está publicado na ficha de cada um. Não precisa pedir:
  abra e leia.**"
- **Depois:** "Todo carro no nosso estoque já passou por essa etapa antes de
  entrar na vitrine, e o laudo está disponível para consulta com o vendedor: é
  só pedir."

### Conversão

- Lista de sete itens do que o laudo **não** faz → uma frase com ponto e vírgula
  ("…não mede compressão dos cilindros; não avalia bomba de alta pressão…").
- Tabela "O laudo cautelar responde / não responde" → dois parágrafos, um por
  coluna, com as cinco perguntas de cada lado na ordem original.
- `### 1. Identificação`, `### 2. Estrutura`, `### 3. Histórico` → rótulo abrindo
  o parágrafo ("Identificação — verifica se o carro é o carro."). A numeração
  1-2-3 saiu: a ordem é a dos parágrafos e a seção já anuncia três eixos.
- Lista de quatro casos de "segunda opinião" → um parágrafo por caso.
- FAQ, "Quanto custa e quanto demora": `[guia da cidade](/guias/pericia-cautelar-curitiba)`
  → `no guia "Perícia cautelar em Curitiba: onde fazer e quanto custa"`.
- `saida`: `/estoque` (front matter), rótulo "Ver os seminovos disponíveis" (a
  âncora do markdown, sem a seta). `apoio` é novo — ver *Riscos*.

---

## 02 · `resultados-laudo-cautelar`

### Decisão do laudo — 1 trecho

**Fecho, seção "O que fazer agora"**

- **Antes:** "**No nosso estoque, o critério é definido antes de o carro chegar
  à vitrine: de cada dez avaliados, três entram.** E o resultado da perícia de
  cada um está publicado na ficha, eixo por eixo — inclusive os apontamentos,
  quando existem."
- **Depois:** "No nosso estoque, o critério é definido antes de o carro chegar à
  vitrine: de cada dez avaliados, três entram. E o laudo está disponível para
  consulta com o vendedor, eixo por eixo — inclusive os apontamentos, quando
  existem."
- "de cada um" saiu de propósito: "o laudo de cada veículo" é a forma que a
  `REGUA_DO_GUIA` nomeia como proibida, porque afirma laudo público para todos.

### Conversão

- Lista dos cinco apontamentos → uma frase com ponto e vírgula.
- `### A diferença que realmente importa: a monta` → abre o parágrafo ("A
  diferença que realmente importa: a monta. Quando um carro sofre acidente…").
- Lista das quatro causas de reprovação → uma frase com ponto e vírgula.
- **Tabela dos três resultados (8 linhas × 3 colunas) → três parágrafos**, um por
  resultado, cada um percorrendo as oito linhas na ordem (identificação,
  estrutura, histórico, circulação, financiamento, seguro, revenda, margem).
  Nenhuma célula se perdeu; a única que virou silêncio é o "—" de histórico na
  coluna "Reprovado", que já era ausência.
- `[a perícia não examina esses conjuntos](/guias/laudo-cautelar-carro-usado)` →
  texto, sem mais nada (a frase se sustenta).
- `[é o assunto deste guia](/guias/carro-reprovado-cautelar-como-vender)` → "é o
  assunto do guia \"Meu carro reprovou no laudo cautelar. E agora?\"".
- FAQ: `Vale [simular antes de fechar](/financiamento)` → "Vale simular o
  **financiamento** antes de fechar" — a palavra faz o renderizador criar o link
  para `/financiamento` sozinho. É o único link do markdown que sobreviveu como
  link de verdade.
- FAQ: `[neste levantamento](/guias/o-que-reprova-pericia-cautelar)` → "no
  levantamento \"O que reprova um carro na perícia cautelar\"".

---

## 03 · `pericia-cautelar-curitiba`

Peça com valores aprovados por você em 17/09. **Nenhum número foi tocado.**

### Decisão do laudo — 2 trechos

**1. Seção "Quando o laudo já vem feito"**

- **Antes:** "Aqui, a perícia cautelar independente roda **antes** de o veículo
  entrar na vitrine, por conta da loja, e o resultado fica publicado na ficha do
  carro. O comprador não paga, não agenda e não precisa nem pedir — lê antes de
  se envolver com o negócio, em vez de descobrir um problema depois. O laudo
  completo fica para leitura no showroom, já que ele carrega dados pessoais do
  dono anterior."
- **Depois:** "Aqui, a perícia cautelar independente roda antes de o veículo
  entrar na vitrine, por conta da loja, e o laudo está disponível para consulta
  com o vendedor. O comprador não paga e não agenda: pede, e lê antes de se
  envolver com o negócio, em vez de descobrir um problema depois. O documento
  não vai para o site porque carrega dados pessoais do dono anterior."

**2. Fecho, seção "O que fazer agora"**

- **Antes:** "**Se preferir pular essa etapa: os carros do nosso estoque já
  passaram por ela, e o resultado de cada perícia está publicado na ficha.**"
- **Depois:** "Se preferir pular essa etapa: os carros do nosso estoque já
  passaram por ela antes de entrar na vitrine, e o laudo está disponível para
  consulta com o vendedor."

### Conversão

- **Nota editorial removida:** o bloco `> **Confirmar antes de publicar.**
  Substituir [X] e [Y] por valores levantados diretamente com as empresas da
  cidade, com data da consulta no rodapé do texto. Trava T6.` — é recado para a
  equipe, e os valores já estão no texto. **Sobra dele uma pendência sua:** a
  data da consulta não está em lugar nenhum do texto (ver *Riscos*).
- Lista do que pedir ao contratar (cinco itens) → uma frase com ponto e vírgula.
- Quatro parágrafos de rótulo em negrito ("Valor venal do veículo.", "Nível do
  laudo."…) → mesmos parágrafos, sem os asteriscos.
- `[a diferença entre eles está aqui](/guias/resultados-laudo-cautelar)` → "a
  diferença entre eles está no guia \"Laudo cautelar: aprovado, com apontamento
  ou reprovado\"".
- FAQ: `[A diferença completa está aqui](/guias/cautelar-x-vistoria-transferencia)`
  → "A diferença completa está no guia \"Laudo cautelar x vistoria de
  transferência\"".
- "Quatro variáveis movem o número dentro dessa faixa**:**" → ponto final, porque
  a lista que vinha depois virou parágrafos.
- Espaço duplo em "BM Vistorias —  Perícia Automotiva" normalizado.

---

## 04 · `consultar-carro-leilao-sinistro`

### Decisão do laudo — 1 trecho

**Fecho, seção "O que fazer agora"**

- **Antes:** "**No nosso estoque as duas já foram feitas, e o resultado publicado
  na ficha cobre as duas — inspeção física e pesquisa de histórico.**"
- **Depois:** "No nosso estoque as duas já foram feitas, e o laudo está
  disponível para consulta com o vendedor — ele cobre as duas, inspeção física e
  pesquisa de histórico."

### Conversão

- **Nota editorial removida:** o bloco `> **Verificação de T3 antes de
  publicar.** A Motors Store compra lotes de desmobilização de frota…` — a
  pendência está marcada como resolvida no próprio arquivo, e o texto já
  distingue as origens de leilão.
- Lista do que a base oficial registra (cinco itens) → uma frase com ponto e
  vírgula, com as glosas de cada item mantidas.
- Cinco origens de leilão e seis sinais físicos → um parágrafo por item.
- `[perícia cautelar](/guias/laudo-cautelar-carro-usado)` e
  `[muda o patamar do negócio](/guias/resultados-laudo-cautelar)` → texto, sem
  mais nada.
- FAQ: `[Onde fazer em Curitiba](/guias/pericia-cautelar-curitiba).` → "Onde
  fazer na cidade está no guia \"Perícia cautelar em Curitiba: onde fazer e
  quanto custa\"." (a âncora era a frase inteira; sem link ela ficava solta).

---

## 05 · `chassi-remarcado`

**Peça revisada pelo jurídico.** Nenhuma palavra do bloco legal foi alterada:
artigo 311, Lei 14.562/2023, Resolução CONTRAN 968/2022, a lista de condutas do
parágrafo 2º, a ressalva de que não é parecer e o encaminhamento a advogado,
Procon e delegacia estão **verbatim**. O que mudou foi o fecho comercial e o
formato da tabela — confirme se o jurídico precisa reler a conversão da tabela.

### Decisão do laudo — 1 trecho

**Fecho, seção "O que fazer agora"**

- **Antes:** "**No nosso estoque essa conferência já foi feita, e o resultado
  dela está publicado na ficha do carro, eixo de identificação incluído.**"
- **Depois:** "No nosso estoque essa conferência já foi feita antes de o carro
  entrar na vitrine, e o laudo, eixo de identificação incluído, está disponível
  para consulta com o vendedor."

### Conversão

- Lista dos cinco pontos de identificação → uma frase com ponto e vírgula,
  mantendo a glosa de cada ponto ("com destruição programada se removidas").
- Lista das quatro razões legítimas de regravação → uma frase com ponto e
  vírgula.
- **Tabela "Como diferenciar na prática" (7 linhas × 2 colunas) → dois
  parágrafos**, um por coluna, percorrendo as sete linhas na ordem. Todas as
  células estão lá; o rótulo da linha "Consistência" virou a própria afirmação
  ("a numeração bate em todos os pontos" / "a numeração diverge entre pontos, ou
  com o registro"), porque como rótulo solto não dizia nada.
- "O teste de três perguntas" → parágrafo de abertura e três parágrafos
  numerados ("1.", "2.", "3."), com o texto intacto. A frase seguinte fala "a
  terceira pergunta", e continua fazendo sentido.
- `[não consta em documento nenhum](/guias/consultar-carro-leilao-sinistro)` e
  `[perícia cautelar](/guias/laudo-cautelar-carro-usado)` (FAQ) → texto, sem
  mais nada.

---

## 06 · `cautelar-x-vistoria-transferencia`

### Decisão do laudo — 1 trecho

**Fecho, seção "O que fazer agora"**

- **Antes:** "**Nos nossos carros o cautelar já foi feito antes do anúncio, e o
  resultado está publicado na ficha para você ler antes de decidir.** O que
  sobra é a parte burocrática — e nela a gente ajuda."
- **Depois:** "Nos nossos carros o cautelar já foi feito antes do anúncio, e o
  laudo está disponível para consulta com o vendedor: é só pedir e ler antes de
  decidir. O que sobra é a parte burocrática — e nela a gente ajuda."

### Conversão

- **A tabela de abertura (11 linhas × 2 colunas) → dois parágrafos**, um por
  exame, cada um percorrendo as onze linhas na ordem (obrigatoriedade, para
  quem, quem faz, identificação, equipamentos, estrutura, pintura, leilão,
  sinistro, momento, resultado). É a peça de comparação da onda, e era o caso
  mais delicado: o que a tabela dizia com "Não" em negrito, o parágrafo diz com
  "não avalia", "não mede", "não pesquisa".
- Lista dos cinco itens fora do escopo → uma frase com ponto e vírgula.
- "Ordem correta: perícia cautelar → decisão → negociação → pagamento → vistoria
  de transferência." — as setas ficaram, porque são caracteres e aparecem na
  tela como no markdown.
- `[A conferência cruzada é o que expõe adulteração bem feita](/guias/chassi-remarcado)`
  e `[cautelar faz](/guias/laudo-cautelar-carro-usado)` (FAQ) → texto, sem mais
  nada.
- `[guia de Curitiba](/guias/pericia-cautelar-curitiba)` → "o guia \"Perícia
  cautelar em Curitiba: onde fazer e quanto custa\"".

---

## 07 · `carro-reprovado-cautelar-como-vender`

**Peça revisada pelo jurídico.** O bloco "O que você é obrigado a informar", o
encaminhamento a advogado e Procon, a menção ao artigo 311 e à Lei 14.562/2023 e
o bloco "O que não fazer" estão **verbatim**.

### Decisão do laudo — 1 trecho

**Seção "O que a gente faz"**

- **Antes:** "…é o padrão que a gente assumiu para vender com garantia e com o
  resultado da perícia publicado na ficha de cada carro."
- **Depois:** "…é o padrão que a gente assumiu para vender com garantia e com o
  laudo da perícia disponível para consulta com o vendedor."

> Mantido de propósito, porque **não** é a mesma coisa: "Entregue o laudo. Se
> você já pagou por uma perícia, o documento vai junto na negociação." Ali o
> laudo é o do leitor, que está vendendo o carro dele — é o dever de informar,
> revisado pelo jurídico, e não a promessa da loja.

### Conversão

- `### Divergência ou adulteração de numeração`, `### Sinistro estrutural`,
  `### Passagem por leilão`, `### Apontamento grave não estrutural` → rótulo
  abrindo o parágrafo. Em "Sinistro estrutural" os dois parágrafos do markdown
  viraram um só, porque o segundo tinha duas linhas e nenhum rótulo próprio.
- Quatro canais de compra e cinco preparativos de venda → um parágrafo por item.
- `[O que é remarcação regular e o que é adulteração](/guias/chassi-remarcado).`
  → "O guia \"Chassi remarcado: quando é legal e quando é crime\" separa o que é
  remarcação regular do que é adulteração." (a âncora era a frase inteira).
- `[A diferença entre os tipos está aqui](/guias/consultar-carro-leilao-sinistro)`
  → "A diferença entre os tipos está no guia \"Como saber se um carro passou por
  leilão\"".
- `[onde fazer em Curitiba](/guias/pericia-cautelar-curitiba)` → "o guia
  \"Perícia cautelar em Curitiba: onde fazer e quanto custa\" diz onde".
- FAQ: `[A diferença entre os tipos de resultado](/guias/resultados-laudo-cautelar)`
  → texto, sem mais nada.
- `saida`: **`/avaliacao`** (front matter) — é a única peça da onda que aponta
  para lá.

### Outras correções

- "A Motors faz perícia em todos os **carrros**" → "carros".
- FAQ "A Motors Store compra carro reprovado?": "pode haver outro
  caminho**,quando** não houver" → "pode haver outro caminho**; quando** não
  houver" (faltava o espaço, e a vírgula emendava duas orações).

---

## 08 · `o-que-reprova-pericia-cautelar`

### Decisão do laudo — 2 trechos

**1. Fecho, seção "O que fazer agora"**

- **Antes:** "**Os carros do nosso estoque são os que passaram por esse filtro, e
  o resultado da perícia de cada um está publicado na ficha. Confira você
  mesmo.**"
- **Depois:** "Os carros do nosso estoque são os que passaram por esse filtro, e
  o laudo está disponível para consulta com o vendedor. Peça e confira você
  mesmo."

**2. FAQ "De 57 carros vocês compraram só 10?"**

- **Antes:** "O critério é fechado porque vendemos com garantia e **publicamos o
  resultado da perícia na ficha**: assumimos o que entra, por escrito."
- **Depois:** "O critério é fechado porque vendemos com garantia e com o laudo da
  perícia disponível para consulta com o vendedor: assumimos o que entra, por
  escrito."

### Conversão

- **A "Nota de método" não foi publicada.** Ela vem antes do `#` do texto, é
  endereçada à equipe ("Decisão registrada", "o texto padrão do site continua…",
  "Vale lembrar que o texto padrão subestima a seletividade real") e o que ela
  tem de publicável — amostra de 57, 30 dias, um motivo determinante por carro,
  a proporção varia — já está no corpo, em "Como levantamos isso".
- **A tabela do levantamento → uma frase:** "Nos 57 avaliados: passagem por
  leilão, 16 veículos, 28%; quilometragem não condizente, 13 veículos, 23%;
  reparos mal executados, 10 veículos, 18%; outros motivos técnicos, 8 veículos,
  14%; e comprados, 10 veículos, 18%." A linha "Total avaliado 57 100%" virou o
  "Nos 57 avaliados" que abre a frase.
- `### Alta demais` e `### Baixa demais` → rótulo abrindo o parágrafo.
- Lista dos sete itens que envelhecem com o carro parado, lista dos seis defeitos
  de execução e lista dos quatro "demais motivos" → uma frase cada, com ponto e
  vírgula.
- As três recomendações finais → três parágrafos numerados ("1.", "2.", "3.").
- `[O que esse exame cobre — e o que não cobre](/guias/laudo-cautelar-carro-usado).`
  → "O guia \"Laudo cautelar: o que verifica e o que não verifica\" mostra o que
  esse exame cobre — e o que não cobre."
- `[a diferença entre os tipos está aqui](/guias/consultar-carro-leilao-sinistro)`
  → nomeia o guia.
- `[com implicação que vai além do comercial](/guias/chassi-remarcado)` e
  `[o resultado de um laudo tem três níveis, não dois](/guias/resultados-laudo-cautelar)`
  → texto, sem mais nada.
- FAQ: `[A diferença, e o que fazer se foi o seu carro](/guias/carro-reprovado-cautelar-como-vender).`
  → "O guia \"Meu carro reprovou no laudo cautelar. E agora?\" explica a
  diferença e o que fazer se foi o seu carro."

### Outras correções

- Seção "3. Reparos mal executados — 10 veículos" abria com "O **segundo** mais
  frequente" — e o segundo é quilometragem, com 13, como a tabela da própria
  peça diz. Virou "O **terceiro** mais frequente". (Era a segunda vez que a
  expressão aparecia no texto.)

---

## Riscos e pendências — o que eu não decidi por você

**1. O `apoio` do cartão de saída é texto novo.** A tabela exige
`{rotulo, href, apoio}`, e o markdown só dá o rótulo e o destino. Escrevi o
`apoio` de cada peça recortando a própria frase de fecho dela, sem a parte da
ficha. São estas oito, e é o único texto do lote que não vem do pacote:

| Peça | `apoio` |
|---|---|
| 01 | Todo carro no nosso estoque passou pela perícia cautelar antes de entrar na vitrine. |
| 02 | No nosso estoque, o critério é definido antes de o carro chegar à vitrine: de cada dez avaliados, três entram. |
| 03 | Se preferir pular essa etapa: os carros do nosso estoque já passaram por ela. |
| 04 | No nosso estoque, a pesquisa de histórico e a perícia física já foram feitas. |
| 05 | No nosso estoque, a conferência de identificação já foi feita. |
| 06 | Nos nossos carros o cautelar já foi feito antes do anúncio. |
| 07 | Avaliar é gratuito, e você fica sabendo o que foi encontrado — entrando no nosso estoque ou não. |
| 08 | Os carros do nosso estoque são os que passaram por esse filtro. |

**2. Dois cartões para o mesmo lugar.** O renderizador acrescenta, depois da
saída comercial, um cartão fixo "Ver o estoque". Como sete das oito peças têm
`/estoque` como saída, o fim da página fica com dois cartões apontando para lá.
É código, não conteúdo (`src/app/guias/[slug]/page.tsx`), e o conserto é uma
condicional — fica como item separado, não entrou aqui.

**3. Canibalização com o rascunho que já está no banco.** A linha
`o-que-a-pericia-cautelar-nao-verifica` cobre "o que a perícia **não** verifica";
a peça 01 cobre "o que verifica **e o que não**" e é o pilar da onda. O critério
4 do guia normativo manda editar a página existente em vez de criar guia novo.
O lote **não toca** nesse rascunho — a decisão é sua: mantê-lo em rascunho,
fundi-lo no pilar, ou publicar os dois assumindo a sobreposição. Some-se que o
texto dele ainda diz "o laudo fica na ficha do carro assim que a perícia é
aprovada", em dois lugares, e por isso não pode subir como está.

**4. Três metas passam de 155 caracteres**, que é a régua da casa: 01 com 157,
04 com 163, 08 com 157. São as metas do pacote, palavra por palavra — não as
encurtei porque é copy de SEO aprovada. O corte do Google na 04 cai em "por que
leilão não é sinônimo de sinis…".

**5. As peças são mais curtas que a régua do plano.** Corpo mais FAQ, no JSON:
1.388 (01), 1.213 (02), 1.027 (03), 1.164 (04), 1.189 (05), 1.025 (06), 1.173
(07) e 1.507 (08) palavras. O guia normativo pede 1.500 a 2.000 para spoke e
2.500 a 3.000 para o **pilar** — e o pilar é a 01, com 1.388. A conta do front
matter ("~2.600 palavras") incluía tabela de links, schema e conferência
editorial, que não vão para o site.

Isso **não** é perda de conversão: medido palavra a palavra contra o corpo
publicável do markdown, o JSON fica entre 94% e 106% (passa de 100% onde a
tabela virou frase, porque frase precisa de conectivo). Os 94% são a peça 08, e
são a "Nota de método" que não foi publicada.

**6. Linkagem interna: R1, R3 e R7 continuam abertas.** As tabelas "Links
internos" pedem 45 links no corpo das peças, e o renderizador não faz link no
corpo. Hoje cada página sai com um ou dois links automáticos, todos para
`/garantia` e `/financiamento` — nenhum entre as oito peças. Enquanto isso não
mudar, o cluster não fecha o grafo que o guia normativo desenha. Duas saídas
possíveis, as duas de código: aceitar link de markdown no parágrafo, ou dar ao
renderizador um mapa de "título de guia → slug".

**7. `spatialCoverage` (peça 03) e o nó `Dataset` (peça 08)** não existem em
`src/lib/schemaGuia.ts` — as peças pedem os dois nas notas de schema. Ficam de
fora até alguém mexer no schema.

**8. A data da consulta dos preços (peça 03) não está no texto.** A nota
editorial pedia "data da consulta no rodapé", e o corpo não tem onde pôr rodapé.
Se você quiser a data no ar — e a T6 gosta dela —, o lugar natural é o fim do
primeiro parágrafo da seção "O que faz o preço mudar". No mesmo texto, a faixa
de Curitiba e a faixa do Brasil são a mesma (R$ 150 a R$ 750), então a peça
local não chega a dar um número local; não mexi porque os valores são os que
você aprovou.

**9. O período da amostra da peça 08 é relativo.** "Nos últimos 30 dias" envelhece
no dia seguinte à publicação; o próprio pacote deixou `"temporalCoverage":
"[MÊS/ANO]"` em aberto. Trocar por "Em [mês] de 2026" resolve, e é decisão sua
porque muda um número publicado.

**10. `titulo_seo` sem padrão de marca.** Duas peças (01 e 04) terminam em
"| Motors Store"; as outras seis não. Deixei como o pacote escreveu: acrescentar
o sufixo empurraria os títulos para 65-70 caracteres, e o SERP corta perto de
60.

**11. A `REGUA_DO_GUIA` do painel diz "nada de ranking de motivo de reprovação:
a distribuição real não está publicada".** A peça 08 é exatamente um ranking — e
publica a distribuição, com amostra, período e critério de contagem (T6). Se ela
subir, a régua do painel (`src/lib/guias.ts`) fica desatualizada e vale reescrever
o item. O aplicador marca isso como aviso, não como erro.
