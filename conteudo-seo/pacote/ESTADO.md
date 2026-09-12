# Estado do pacote contra o repositório — conferência de 2026-09-11

> A fila do que falta, com os branches em aberto e as armadilhas de ambiente,
> está em [`PROXIMOS_PASSOS.md`](PROXIMOS_PASSOS.md). Este arquivo é o retrato;
> aquele é o handoff.

O pacote foi escrito contra uma foto do site que envelheceu. Este arquivo diz o
que **já está no ar**, o que **continua aberto** e o que **foi decidido
diferente** — para ninguém reimplementar o que existe nem esperar por algo que
já rodou.

Tudo abaixo foi medido contra `origin/main` (`d70e2e3`), contra o banco de
produção e contra `motorsstore.com.br`. Onde não deu para medir, está escrito.

> Método: quando a afirmação é sobre o que a página **serve**, ela foi medida no
> HTML servido — nunca em `src/`. A diferença já produziu conclusão errada neste
> repositório (ver o docblock de `lib/linksNoTexto.ts`).

---

## Fase 0 — os oito itens

| # | Item | Estado | Onde |
|---|---|---|---|
| 1 | `not-found.tsx` da ficha | **Era o único aberto.** Entregue em 11/09 | `src/app/[categoria]/[marca]/[modelo]/[ficha]/not-found.tsx` |
| 2 | CTAs da ficha viram `<a href>` | **Aberto, e reenquadrado** — ver abaixo | — |
| 3 | Menção nominal vira link no FAQ (R3) | **Feito** | `src/lib/linksNoTexto.ts` |
| 4 | Relacionados de 1 para 5 | **Feito, com regra própria** — ver abaixo | `src/lib/similares.ts` |
| 5 | Nó `#dealer` do schema | **Feito** | `src/lib/grafoDaFicha.ts` |
| 6 | Array de imagens e campos do `Car` | **Feito** | `src/lib/schemaVeiculo.ts` |
| 7 | Faixa de preço na home e no `/estoque` | **Feito** | `src/components/modernist/FaixasDePreco.tsx` |
| 8 | `/contato` e `/motos` no rodapé | **Metade** — ver abaixo | `src/lib/colunasDoRodape.ts` |

### Item 2 — o que está aberto não é o que o pacote pediu

Medido no HTML servido, comparando a ficha com uma página que só tem cabeçalho e
rodapé:

```
/privacidade                          2 /avaliacao   1 /financiamento   2 /guias
/carros/chevrolet/spin/spin-8100626   2 /avaliacao   1 /financiamento   2 /guias
```

Contagens idênticas: **tudo o que a ficha linka para essas três páginas vem da
moldura.** O corpo da ficha dá zero link contextual — R4 e R8 do guia normativo
continuam por fazer, e é o maior item de linkagem ainda aberto.

O que **não** deve ser feito é a redação literal do item ("CTAs da ficha viram
`<a href>`"). O CTA da ficha é o modal de captura de lead, que leva o contexto do
veículo junto; trocá-lo por um link genérico troca um lead qualificado por um
clique. A decisão já tinha sido tomada assim uma vez. O trabalho certo é
**acrescentar** link contextual, não converter o CTA.

### Item 4 — a cascata foi substituída por algo melhor

O pacote pede "mesma carroceria → mesma faixa (±20%) → mesma marca". O que existe
é `escolherSimilares`: banda assimétrica de preço (0,7× a 1,4×) com bônus de 0,08
para carroceria igual, porque o cadastro de `tipo` vem do RevendaMais e é
falível — carroceria como chave primária pôs um Bongo e um Polo na página de um
Camaro. O docblock conta o caso.

**Divergência que sobra:** o limite. O pacote pede 4 a 6; a ficha usa 3
(`escolherSimilares`, parâmetro `limite`). Decisão do dono, não do código.

### Item 8 — falta o hub `/motos`

`/contato` e `/guias` estão no rodapé. `motos` existe como **segmento de ficha**
(`SEGMENTOS_DE_PDP`, então `/motos/honda/cg-160/…` responde), mas a página
`/motos` não existe: responde 404, e `/carros` também — nenhum dos dois segmentos
tem hub próprio, o hub é `/estoque`. Link no rodapé para `/motos` hoje seria link
quebrado; ou se cria a página, ou o item sai da lista.

---

## Fase 1 — a rota `/guias`

**Feita, e além do que o pacote desenhou.** Existe `/guias`, `/guias/[slug]`,
schema, sitemap, item no rodapé e no menu — e o conteúdo **não vive em código**:
mora na tabela `guias` (migração `20260906160000`) e é escrito e editado em
`/admin/guias`. Pedido do dono em 06/09: *"preciso ser capaz de gerar novos guias
e editar os criados no painel"*.

Consequência prática para a Onda 1: **publicar uma peça não é abrir PR.** É
carregar o texto na tabela, pelo painel ou por script.

---

## Fase 2 — o bloco "Resultado da perícia"

**Parcial, e é isto que segura a Onda 1.**

O que a ficha mostra hoje: `pericia` (o status, ex.: `PERÍCIA APROVADA`) e
`laudo_pericia` (texto livre), num acordeão que só abre com a perícia aprovada —
afirmar laudo limpo sobre carro não periciado é o defeito que essa guarda existe
para impedir.

O que a spec `produto/01` pede e **não existe**: data, empresa, número do laudo,
os três eixos com status, os apontamentos linha a linha, a nota de rodapé fixa, e
o `additionalProperty` no `Car`.

Antes de construir a tela, falta o dado: o resultado estruturado precisa existir
como campo, transcrito na entrada do veículo. Hoje são duas colunas de texto em
`estoque_motors` (`pericia`, `laudo_pericia`). E a spec pede, por escrito,
validação com quem responde pela LGPD.

---

## Fase 3 — publicação

**1 guia publicado, e não é nenhum dos oito.** Consultado no banco em 11/09:

```
guias (estado = publicado) → 1
  o-que-a-pericia-cautelar-nao-verifica
```

As oito peças da Onda 1 continuam inteiras e não publicadas. As pendências que o
próprio README lista como "não é trabalho de código" seguem valendo: revisão
jurídica das peças 05 e 07, os valores de perícia em Curitiba na peça 03, e a
revisão do contrato de venda antes da `/garantia` reescrita.

---

## O 404 em inglês não acabou — sobraram dois hubs

O `not-found.tsx` entregue em 11/09 cobre a rota da **ficha**. Os hubs de marca
e de modelo chamam `notFound()` e não têm `not-found.tsx` em nível nenhum acima
deles. Medido no build de produção:

```
/carros/marcainexistente               404 · "404: This page could not be found."
/carros/volkswagen/modeloinexistente   404 · "404: This page could not be found."
```

Visível na tela, em inglês, com o cabeçalho e o rodapé da marca em volta — o
mesmo defeito, nas mesmas palavras. É o próximo item da mesma frente, e é R5.

Não entrou no PR da ficha por escolha: a copy certa aqui é outra (marca que a
loja nunca teve não é "endereço que não abre ficha"), e um `not-found.tsx` em
`src/app/[categoria]/` atende os dois hubs de uma vez sem tocar no da ficha, que
continua vencendo por ser o mais próximo.

---

## O que mudou no mundo desde que o pacote foi escrito

**Carro vendido não cai mais em 404.** O pacote descreve a ficha vendida caindo
no 404 nativo. Não é mais verdade: durante a carência de 90 dias a ficha responde
**200** com o selo e os similares, e depois vira **301** para o hub do modelo
(`publicacao.arquivar`). Conferido em produção contra três vendidos — todos 200.

O 404 continuava existindo, e continuava em inglês, mas para outro público: id
que nunca existiu, ficha apagada, URL velha de portal, link torto. Foi esse o
buraco que o `not-found.tsx` fechou — e é por isso que a página nova **não**
tenta mostrar "similares ao carro que você queria": não existe o carro para
comparar.
