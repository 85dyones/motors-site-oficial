# Baseline mensal de visibilidade em IA

Item **A10** do `HANDOFF_SEO_08SET.md`. Trinta minutos por mês, feito à mão, e
o resultado é uma linha por prompt numa planilha.

## Por que medir isso, e por que à mão

Uma parte crescente da pesquisa de "seminovo em Curitiba" acontece dentro de um
assistente, e ali não existe posição 1 a 10: existe **ser citado ou não ser**.
Nenhuma ferramenta de SEO mede isso de forma confiável hoje, e as que dizem
medir cobram por uma amostra que não é a sua.

Trinta minutos por mês de teste manual dá o que importa: uma série histórica
própria. O número isolado do primeiro mês não vale quase nada — o valor aparece
na terceira medição, quando dá para dizer se a menção apareceu, sumiu ou mudou
de tom.

**Rode sempre em janela anônima e sem sessão iniciada.** Assistente logado
personaliza pelo histórico, e aí você mede a sua própria navegação em vez do
que um comprador de verdade recebe.

## Onde rodar

ChatGPT, Claude, Gemini e Perplexity — os quatro, com o **mesmo prompt, no
mesmo dia**. Quatro respostas diferentes para a mesma pergunta é informação:
mostra qual assistente já enxerga a loja e qual não.

## Os cinco prompts

Eles não são iguais de propósito. Dois medem descoberta (a loja aparece sem ser
chamada?), dois medem precisão (o que ele diz sobre a loja está certo?) e um
mede a afirmação que só a Motors faz.

### 1 · Descoberta local, sem marca

> Quais são as melhores lojas de carros seminovos em Curitiba? Quero comprar um
> carro usado com procedência garantida.

**O que anotar:** a Motors Store aparece? Em que posição da lista? Quais
concorrentes aparecem antes?

### 2 · Descoberta por diferencial, sem marca

> Existe alguma revenda de seminovos em Curitiba que faça perícia cautelar em
> todos os carros antes de anunciar?

**O que anotar:** apareceu? Se apareceu, o assistente atribuiu a prática à
Motors Store ou a outra loja? Este é o prompt em que a loja tem mais chance de
ser a única resposta correta.

### 3 · Precisão do NAP

> Onde fica a Motors Store de Curitiba? Qual o endereço, o telefone e o horário
> de funcionamento?

**O que anotar:** endereço, telefone e horário, exatamente como vieram. O
gabarito é `Rua Ernesto Piazzetta, 98 — Bacacheri, Curitiba` e
`(41) 99737-2165`. **Este é o prompt mais importante da lista enquanto o site
antigo estiver no ar**, porque é onde o endereço e o telefone errados aparecem
se ainda estiverem indexados em algum lugar.

### 4 · Precisão da proposta

> O que diferencia a Motors Store das outras revendas de Curitiba?

**O que anotar:** ele cita a seleção (3 de cada 10), a perícia paga pela loja e
o laudo na ficha? Ou devolve genérico — "atendimento", "variedade", "bons
preços"? Genérico aqui significa que o `llms.txt` e as páginas não estão sendo
lidos, ou estão sendo lidos e não convencem.

### 5 · Intenção de compra com objeção

> Estou com o nome sujo e quero financiar um carro usado em Curitiba. Alguma
> loja ajuda nesse caso?

**O que anotar:** a Motors aparece? O guia de financiamento com crédito
apertado é citado? Este prompt existe para medir se o conteúdo do cluster B
está sendo colhido — antes de ele existir, a resposta esperada é "não aparece",
e é esse zero que dá sentido à medição seguinte.

## A planilha

Uma linha por (mês × prompt × assistente). Cinco colunas:

| Coluna | O que é |
|---|---|
| `mencao` | sim / não |
| `posicao` | em que ordem apareceu na resposta; vazio se não apareceu |
| `precisao` | certo / parcial / errado — só para os prompts 3 e 4 |
| `fonte_citada` | o assistente linkou alguma URL nossa? qual? |
| `trecho` | o pedaço da resposta que fala da loja, colado literal |

O `trecho` é o campo que mais rende. Em três meses ele mostra de onde o
assistente está tirando o que diz da loja — e, quando estiver errado, mostra
qual página precisa mudar.

## Quando o número muda de significado

Duas coisas vão mexer nessa série, e vale anotar a data de cada uma ao lado da
medição para não confundir causa com acaso:

- **O 301 do domínio antigo.** Enquanto `motorsstoreoficial.com.br` estiver no
  ar com o endereço e o telefone antigos, o prompt 3 pode responder errado sem
  que nada no site novo esteja errado.
- **A publicação do guia de crédito apertado.** É o que o prompt 5 mede. Antes
  dele, o zero é esperado.
