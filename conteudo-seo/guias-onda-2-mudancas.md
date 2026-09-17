# Onda 2 — o que mudou do markdown para o banco

As cinco peças de mecânica (`conteudo-seo/pacote/guias/09..13-*.md`) viraram
`conteudo-seo/guias-onda-2.json`. Este arquivo registra, frase por frase, o que
mudou no caminho — e o que não mudou, que é quase tudo.

A conversão foi feita por script, e o script confere: **cada parágrafo do JSON
existe, palavra por palavra, no markdown de origem**. Nada foi reescrito na
passagem. O que ficou de fora foi só o que é de implementação: frontmatter,
blocos `Title:`/`Meta description:` (que viraram `titulo_seo` e `descricao`),
tabela de links internos, schema, pendências e conferência editorial.

---

## As três correções de conteúdo, e por quê

### 1. O limite de quilometragem da garantia saiu das peças 12 e 13

As duas diziam "dentro do limite de quilometragem previsto no contrato". O dono
confirmou em 17/09/2026 que o limite **existe**, e não informou o valor.

Fui ler o contrato padrão de venda que ele mandou: a cláusula quarta fala em
**prazo** — 90 dias, art. 26, II do CDC — e **não cita quilometragem em lugar
nenhum**. Mandar o comprador procurar no contrato uma linha que não está lá é
pior do que não falar do limite: ele lê, não acha, e passa a duvidar do resto da
página.

Saiu a atribuição, nas três ocorrências (corpo da 13, FAQ da 12 e FAQ da 13). Ela
volta quando o dono informar **o número e onde ele está escrito**. A trava está
em `tests/guias-onda-2-lote.test.ts`, no bloco "nenhum número que a casa não
mediu".

### 2. A peça 12 citava o pilar com o título errado

Estava "Motores turbo de baixa cilindrada: o que checar"; o título da peça 09 é
"Motor turbo de baixa cilindrada usado: o que checar". `segmentarComLinks` casa
**termo exato** — citação aproximada nunca viraria link, e o leitor veria uma
referência a um guia que o site não abre.

### 3. As peças 10 e 11 não diziam onde o laudo está

Citavam o laudo cautelar só para dizer o que ele **não** alcança. A regra 1 da
casa, decidida em 16/09/2026, é que o laudo fica com o vendedor e sai a pedido —
e a trava positiva da Onda 1 já cobrava essa frase das oito primeiras. As duas
ganharam a oração; nenhuma outra palavra mudou.

---

## O que a conversão faz, mecanicamente

| Markdown | JSON |
|---|---|
| `url: /guias/<slug>` | `slug` |
| `# H1` | `titulo` |
| `**Title:**` | `titulo_seo` |
| `**Meta description:**` | `descricao` |
| cada `## H2` até o FAQ | uma entrada de `corpo`, com os parágrafos |
| `[Rótulo →](/garantia)` | `saida.rotulo` + `saida.href` |
| `## FAQ` | `faq` |
| `about` do schema | `sobre` |

O `saida.apoio` é a única linha escrita na conversão: o markdown não tem um
campo para ela. São frases curtas, tiradas do fecho de cada peça, e o teste do
lote as mede junto com o resto.

---

## O que NÃO entrou

- **`publicado_em` e `atualizado_por`:** são de quem grava.
- **Links escritos no corpo.** O renderizador (`src/app/guias/[slug]/page.tsx`)
  serve parágrafo como texto puro: `[texto](/destino)` apareceria com os
  colchetes na tela. Quem cria link é `TERMOS_COM_DESTINO`
  (`src/lib/linksNoTexto.ts`), e as cinco peças entraram lá neste mesmo lote —
  cinco títulos e quatro assuntos.
- **Tabela e lista.** A anatomia do guia normativo pede tabela quando há
  comparação; a régua de escrita da onda proíbe markdown no corpo. Prevaleceu a
  régua: as comparações já nasceram em parágrafo.

---

## A malha de links depois desta onda

Medida com o código de verdade, nas treze peças (as oito da Onda 1 e estas
cinco): **41 links entre peças**, contra 20 antes. Nenhuma página linka para ela
mesma, nenhuma ficou sem link para uma vizinha, e as treze continuam levando a
`/garantia`. O número está travado em `tests/links-entre-guias.test.ts`.

O ganho não é só das peças novas: a Onda 1 passou a ser citada por elas, e é por
isso que o pilar do laudo cautelar agora sai com seis links para vizinhas.

---

## O que ainda falta do dono

1. **O limite de quilometragem da garantia da loja** — o número e onde ele está
   escrito (ver acima).
2. **A garantia de três meses cobre turbocompressor?** O turbo não está na lista
   de cobertura nem na de exclusões. É a primeira pergunta de quem compra turbo,
   e a peça 09 hoje não afirma nem nega: encaminha para `/garantia`.
3. **Falha de item de manutenção que destrói item coberto** — correia é
   manutenção e está fora por escrito; o que acontece quando ela leva junto os
   internos do motor é pergunta de contrato.
4. **Revisão jurídica da peça 13** (vício oculto). Ela descreve o conceito em
   termos gerais, sem artigo, sem prazo, sem afirmar obrigação da loja, e manda
   quem tem dúvida ao Procon ou a um advogado. Ainda assim é a peça de maior
   exposição da onda.
5. **Existe roteiro de test-drive padronizado na avaliação?** A peça 12 afirma
   que quem testa o câmbio é o time, no volante. É dedução a partir dos gatilhos
   confirmados. Se o roteiro existir, vira frase própria — e é um ativo que
   nenhuma revenda publica.
6. **Publicar ou não os motores por nome.** As peças descrevem a tecnologia sem
   nomear fabricante ou família de motor. Nomear as tornaria mais úteis e mais
   arriscadas, porque a loja vende esses carros. Decisão reversível.
