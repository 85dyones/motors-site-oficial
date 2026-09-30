# Gravação de 30/09/2026: textos de hub escaneáveis

O dono pediu para atacar os blocos de texto imensos, que são "escaneáveis pelos
LLMs e buscadores, mas maçantes para os leitores". Depois dos guias (PR #189),
vieram os hubs de estoque.

## O que mudou no site (PR #195)

- `PaginaDeEstoque`: o texto do hub se divide no primeiro parágrafo que começa
  com `### `. O que vem antes (chamada e abertura curta) fica junto do título; do
  `###` em diante, a página desenha depois da grade de carros, com o `###` como
  `<h2>` e linhas `- ` como lista. Texto sem `###` (/garantia, /financiamento,
  bairros) sai igual.
- Textos gerados (`textoDosHubs.ts`): ganham o subtítulo "Como o carro chega à
  vitrine" antes dos parágrafos de seleção e perícia.
- Painel de textos dos hubs: um aviso explica o que `### ` e `- ` fazem.

## O que foi gravado

`public.textos_de_hub`: os 31 caminhos, a partir de
`textos-de-hub-humanizados.json` (versão do PR #195). Só mudaram `paragrafos` e
`atualizado_em`. Forma de cada texto: chamada, abertura de até 55 palavras,
`### subtítulo`, listas e fechamento.

A reescrita passou pelo humanizer e pela revisão do qa-guardian. Ela não traz
fato novo e mantém a garantia da correia da Chevrolet só nos dois hubs da marca,
com todas as condições. Também preserva as menções a troca, financiamento e
Bacacheri.

## Backup

`backup.textos_de_hub_20260930` (31 linhas), cópia integral feita no mesmo bloco
da gravação.

## Como foi conferido

- Antes: o md5 de `to_jsonb(paragrafos)::text` das 31 linhas do banco bateu com a
  versão anterior do JSON. O update só gravava a linha cujo md5 ainda era esse, e
  o bloco abortaria se gravasse menos de 31.
- Depois: os 31 md5 do banco bateram com os calculados a partir do JSON do
  repositório.
- No ar: `/carros/chevrolet/onix` e `/estoque/van` mostram a abertura curta em
  cima e o subtítulo e as listas depois dos carros, sem `###` à mostra.

## Para desfazer

```sql
update public.textos_de_hub h set paragrafos = b.paragrafos, atualizado_em = now()
from backup.textos_de_hub_20260930 b where h.caminho = b.caminho;
```

Com o texto antigo (sem `###`), a página volta a mostrar tudo em cima, como antes.
