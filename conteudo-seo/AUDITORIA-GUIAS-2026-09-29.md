# Auditoria dos guias de 29/09/2026: o que mudou e como gravar

Pedido do dono: "abra o PR e alinhe tudo", depois da auditoria de texto
(humanizer), linkagem interna e visibilidade em IA dos 26 guias.

## O que a auditoria mediu

- O texto servido dos 26 guias bate com os JSON deste diretório (26 de 26).
- Fora do índice `/guias`, 22 dos 26 guias não recebiam link de nenhuma das
  182 outras páginas do sitemap. Entre si, trocavam 143 links.
- `/avaliacao`, `/financiamento`, o home e os hubs de modelo não linkavam guia
  nenhum; `/garantia` linkava dois, e nenhum era de garantia.
- "O que reprova um carro na perícia cautelar", a única peça com número da
  operação, recebia 2 links de guia e 0 do site.
- O `llms.txt` não citava `/guias`.
- O detector de `tests/marcasDeIA.ts` dava zero nos 26. Sobravam marcas
  estruturais: "O que fazer agora" como último `<h2>` dos 26, "Na prática,"
  abrindo frase, fechos de efeito e o mesmo "está em \"Título\"" repetido.

## O que mudou no texto dos guias (JSON)

Só `corpo`. `slug`, `titulo`, `titulo_seo`, `descricao`, `faq`, `saida`,
`sobre` e `estado` ficaram iguais.

1. O último `<h2>` de cada guia deixou de ser "O que fazer agora" e passou a
   dizer o assunto da seção ("Antes de pedir a avaliação", "A papelada, na
   ordem"...). A lista está no fim deste arquivo.
2. Cinco fechos de efeito reescritos: Perícia cautelar em Curitiba ("Quanto
   demora"), Laudo cautelar x vistoria ("A diferença que mais importa"), O que
   reprova ("O que é recuperável"), Chassi remarcado ("A adulteração é crime",
   dois parágrafos viraram um) e Laudo cautelar: o que verifica (o segundo
   parágrafo da abertura foi para o fim do primeiro).
3. "Na prática," saiu do começo de frase onde não acrescentava nada.
4. Citações novas, que viram link pelo linkador:
   - Meu carro reprovou → "Vício oculto em carro usado: o que é e o que não é"
     e "Onde vender carro em Curitiba e o que cada opção pede".
   - Vício oculto → "Carro de loja ou de particular: o que o preço inclui".
5. Sete citações com o verbo trocado, para o "está em" não se repetir na mesma
   seção (O que a loja assume, Onde vender carro em Curitiba, Carro de loja ou
   de particular). O título citado continua o mesmo, byte a byte, porque é ele
   que o linkador casa.

## Como gravar

Os JSON são a fonte; o site lê o banco. Nada foi gravado pelo PR #175. Depois do
merge, com o `.env.local` de produção:

```
node conteudo-seo/aplicar-guias.mjs --json=conteudo-seo/guias-onda-1.json            # confere e ensaia
node conteudo-seo/aplicar-guias.mjs --json=conteudo-seo/guias-onda-1.json --gravar    # grava, com backup
```

Repetir para `guias-onda-2.json`, `guias-onda-2-garantia.json` e
`guias-onda-3.json`. O script faz backup antes de gravar e o upsert é por slug.
As páginas revalidam em até uma hora.

Enquanto o banco não for gravado, o site continua servindo o texto de 21/09. As
mudanças de código deste PR não dependem disso: o linkador, os blocos de guias
e o índice agrupado funcionam com o texto antigo e com o novo.

## Gravado em 30/09/2026

Gravado no projeto de produção (`zwbqmzgnagfeqinqkolp`) pelo SQL do Supabase,
sem o script, porque só o `corpo` mudou e só as seções alteradas foram trocadas
(`jsonb_set` por índice). Antes:

- backup em `backup.guias_20260930` (as 26 linhas inteiras);
- conferência de que o `md5(corpo::text)` de cada guia no banco era igual ao dos
  JSON de 21/09 (commit `780eb5b`), para não sobrescrever edição feita pelo
  painel.

Cada `update` exigia o md5 da base e conferia o md5 do resultado contra o dos
JSON deste PR; qualquer diferença abortava o lote inteiro. Os dois lotes
passaram, e os 26 `corpo` no banco batem com `guias-onda-*.json`. Título, FAQ,
`saida` e demais campos não foram tocados.

Para desfazer:

```sql
update public.guias g set corpo = b.corpo from backup.guias_20260930 b where b.slug = g.slug;
```

## Forma escaneável, gravada em 30/09/2026 à tarde

O dono pediu para atacar os blocos imensos de texto: escaneáveis por buscador
e por IA, maçantes para quem lê. O PR #189 mudou a página (índice "Neste
guia", abertura em corpo maior, corpo 16/17px) e a FORMA dos 26 guias, sem
trocar palavra: listas, subtítulos e parágrafos partidos entre frases. As
marcas estão em `src/lib/blocosDoGuia.ts` ("- " vira item, "### " vira
subtítulo, "---" fecha o último subtítulo).

Gravado em produção pelo SQL do Supabase, do mesmo jeito da manhã:

- backup em `backup.guias_20260930b` (as 26 linhas inteiras, já com o texto
  da manhã);
- o md5 de cada `corpo` no banco conferido contra o dos JSON anteriores ao
  #189, para não sobrescrever edição feita pelo painel;
- só as seções que mudaram foram trocadas (`jsonb_set` por índice), cada
  `update` exigindo o md5 da base e conferindo o do resultado.

Os quatro lotes passaram, e os 26 `corpo` no banco batem com os
`guias-onda-*.json` do #189. Para desfazer só esta etapa:

```sql
update public.guias g set corpo = b.corpo from backup.guias_20260930b b where b.slug = g.slug;
```

## Os 26 últimos `<h2>`

| Guia | Último `<h2>` |
| --- | --- |
| laudo-cautelar-carro-usado | Antes de sinalizar valor num carro usado |
| resultados-laudo-cautelar | Com o laudo em mãos |
| pericia-cautelar-curitiba | Para agendar a perícia em Curitiba |
| consultar-carro-leilao-sinistro | Para checar leilão antes de comprar |
| chassi-remarcado | Antes de dar sinal num carro com remarcação |
| cautelar-x-vistoria-transferencia | Os dois exames na ordem certa |
| carro-reprovado-cautelar-como-vender | Para vender o carro reprovado |
| o-que-reprova-pericia-cautelar | Como usar esses motivos na sua compra |
| motores-turbo-usados-o-que-checar | O roteiro para ver um turbo usado |
| correia-dentada-banhada-em-oleo | O que pedir num motor de correia banhada |
| carbonizacao-valvulas-injecao-direta | O que checar num motor de injeção direta |
| cambio-dupla-embreagem-usado | O teste do câmbio antes de fechar |
| vicio-oculto-carro-usado | Antes de fechar a compra |
| test-drive-carro-usado | O roteiro resumido |
| garantia-carro-usado-loja | Antes de assinar, e depois |
| garantia-estendida-vale-a-pena | Antes de contratar um plano |
| quanto-vale-meu-carro-usado | Antes de pedir a avaliação |
| carro-na-troca | Antes de visitar as lojas |
| vender-carro-financiado | Antes de levar o carro financiado à loja |
| consignacao-de-carro | Como escolher entre consignar e vender |
| o-que-a-loja-assume-na-compra | Antes de vender para a loja |
| vender-sozinho-ou-para-loja | Se for vender sozinho |
| documentos-para-vender-carro | A papelada, na ordem |
| vender-carro-curitiba | Como escolher o caminho |
| tabela-fipe-nao-e-preco-de-venda | Como consultar e usar a FIPE |
| carro-de-loja-ou-particular | Antes de comprar, de loja ou de particular |
