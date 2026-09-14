# O 404 dos hubs, e as pendências do #70 — desenho

Data: 2026-09-13 · Decisões do dono tomadas nesta data, uma pergunta por vez.
Fonte do defeito: `PROXIMOS_PASSOS.md` §3.1 (branch `docs/pacote-de-conteudo`, PR #71) e a seção "PR 1.6" do plano de observabilidade.

## O defeito

`/carros/marcainexistente` e `/carros/volkswagen/modeloinexistente` caem no 404 de fábrica do Next: em inglês, sem link, dentro da moldura do site. É a R5 do guia normativo, o mesmo defeito que o #70 fechou para a ficha.

## Fatos medidos (branch `feat/ficha-sem-carro-nao-e-beco`, `2085a11`)

- `notFound()` dos hubs: `src/app/[categoria]/[marca]/page.tsx:101` e `[modelo]/page.tsx:128`. O `dados` é nulo em três casos: categoria inválida (só `carros` e `motos` valem), marca fora do histórico, e modelo fora do histórico daquela marca. Marca ou modelo conhecido e zerado **não** é 404: responde 200 com o hub vazio.
- Não existe `not-found.tsx` nem `error.tsx` em `src/app/` ou `src/app/[categoria]/`. O único é o da ficha.
- A metadata do não encontrado já está em português: "Marca não encontrada" (`[marca]/page.tsx:59`) e "Modelo não encontrado" (`[modelo]/page.tsx:64`), ambas com `index: false`.
- `not-found.tsx` não recebe params. O `grep "<form"` vazio de 11/09 (medido no #70) tem outra causa, achada em 14/09: a página inteira — não só o bloco de `usePathname` — sai da casca de erro do Next, e não do HTML visível. `usePathname` nunca foi isolado como causa; ver "Achado de 14/09" abaixo.
- `recortesDoEstoque` (`src/lib/hubsDeEstoque.ts:471`) não tem cache.
  - O hub chama a função duas vezes por render: no `generateMetadata` e na página.
  - O não encontrado da ficha lê o estoque inteiro, cerca de 977 KB por render, e o espaço de endereços falsos é ilimitado.
  - Chamam a mesma função: hubs, a própria ficha, `/estoque`, `/estoque/[recorte]`, sitemap, rodapé, `PaginaGeoView`, `/garantia`, `/financiamento`, `/api/ney` e `/api/hubs/textos`.
  - Nada revalida o estoque por evento: os hubs contam com o ISR de 1 h.
- Na pane do Supabase, `recortesDoEstoque` estoura `EstoqueIndisponivelError` (`src/lib/supabase.ts:839`). No não encontrado da ficha isso vira 500 sem moldura; antes dava 404.
- `Veiculo` (`src/types/index.ts:261`) não tem campo `Date`.

## Correções de fato (14/09)

- **Já existe cache sobre o estoque, fora do não encontrado.** O rodapé (`src/lib/navegacaoDoRodape.ts:92-105`) e o `/api/ney` (`src/app/api/ney/route.ts:269-278`) já guardam `recortesDoEstoque` em `unstable_cache` de 1 h. O rodapé faz `catch` DENTRO da callback e por isso guarda o rodapé vazio de uma pane por uma hora — não copiar esse desenho. A decisão "cache só no não encontrado" continua valendo para os hubs, a `/estoque` e o sitemap: são eles que leem fresco.
- **Item velho no `unstable_cache` sobrevive a uma falha de revalidação.** Com o cache frio, a exceção da callback sobe e nada é gravado. Com um item já guardado, a revalidação que falha é engolida e o valor velho continua sendo servido — a página de pane só aparece com o cache frio.
- **`EstoqueIndisponivelError` só é lançado em produção.** Fora dela `getEstoque` devolve `MOCK_ESTOQUE`. Nos testes a pane é sempre dublada — nenhum teste desta spec observa a exceção de verdade.
- **`cache()` do React não memoiza no Vitest.** O build que o Vitest carrega é o de cliente, em que `cache(fn)` só repassa a chamada. A deduplicação por requisição só se testa com `cache` dublado.
- **Linhas corrigidas:** o recorte antigo da ficha (hoje em `[ficha]/not-found.tsx`) vai até a linha 144, não 137 — `marcasComEstoque` está em 142-144 e entra no recorte. O `cache(` de referência em `src/lib/secaoDeGuias.ts` está na linha 154; a 148 é só o docblock.

## Decisões do dono (13/09)

1. O 1.6 **sai empilhado no #70**. Antes dele, fecham-se no #70 as duas pendências dele, que valem igual para os hubs.
2. **Dois arquivos de não encontrado**, um para marca e um para modelo, cada um com título e texto próprios já no HTML servido.
3. **Cache só no não encontrado.** O resto continua lendo fresco. Na pane, o não encontrado segue 404 com moldura. Sem `error.tsx`.

## Parte 1 — as pendências do #70 (no branch do #70)

1. **Uma leitura por render.** `recortesDoEstoque` passa a usar o `cache()` do React, o mesmo de `src/lib/secaoDeGuias.ts:154`. Memoiza por requisição, sem atraso entre requisições.
2. **Leitura com cache para o não encontrado.** Uma função nova em `src/lib/hubsDeEstoque.ts` (nome de trabalho `recorteDoNaoEncontrado`):
   - monta **só** o que a página de não encontrado mostra (hoje calculado em `[ficha]/not-found.tsx:106-144`): amostra do pátio, índice de marcas (slug, nome, contagem), hubs de marca e de carroceria;
   - guarda esse recorte em `unstable_cache` com chave fixa e `revalidate: 3600`;
   - só as páginas de não encontrado a chamam.
3. **Tamanho do item.** Por guardar o recorte pronto, o item fica pequeno, longe do teto de 2 MB do cache de dados. O tamanho serializado é medido antes do merge, contra a produção, por um teste temporário que nunca é commitado — só o número medido fica, anotado no docblock.
4. **Pane.** A página de não encontrado captura só `EstoqueIndisponivelError` e renderiza título, texto e "Ver todo o estoque", sem amostra e sem blocos. Continua 404. Exceção não entra no cache, então a requisição seguinte tenta de novo.
5. **Troca aceita.** A amostra do não encontrado pode ter até 1 h de atraso. Um carro vendido nessa janela ainda aparece ali; a ficha dele responde 200 com o selo de vendido, então o link não morre.

## Parte 2 — o PR 1.6 (branch novo a partir do #70)

1. **`NaoEncontradoNoEstoque`** (componente de servidor em `src/components/`), extraído de `[ficha]/not-found.tsx`.
   - Recebe título, texto, trilha e o bloco de encomenda.
   - Usa a leitura com cache e o tratamento de pane da parte 1.
   - A ficha passa a usá-lo **sem mudar o que renderiza**: os testes do #70 ficam sem alteração, e isso é a prova da extração.
2. **`src/app/[categoria]/[marca]/not-found.tsx`** cobre marca que nunca passou pelo estoque, e também categoria inválida.
   - Título: **"Não encontramos esta marca"**.
   - Texto: **"Este endereço não abre nenhuma página de marca."**, seguido da amostra do pátio, das marcas em estoque, das faixas de preço, das carrocerias e de "Ver todo o estoque".
   - O texto fala do endereço, e não da marca, porque `/foo/volkswagen` também cai aqui, e dizer que a marca nunca passou pelo estoque seria falso.
   - **Ganha um bloco do cliente (14/09)**, o mesmo da ficha e do modelo, que lê só o primeiro segmento do caminho — numa lista fechada via `ehSegmentoDePdp` (`carros` ou `motos`) — para dar o `segmento` do formulário; quem vem de `/motos` lê "moto". O `caminho` do lead leva o endereço inteiro, como no #70. O slug da marca digitada nunca vira `marca`, em lugar nenhum. Nada da R5 depende do bloco.
3. **`src/app/[categoria]/[marca]/[modelo]/not-found.tsx`** cobre modelo que nunca passou pelo estoque.
   - Título: **"Não encontramos este modelo"**. Texto: **"Este endereço não abre nenhuma página de modelo."** O resto é igual.
   - O bloco do cliente lê o caminho. Se a marca tem estoque, mostra o link no formato do #70 — "Ver 2 Volkswagen no estoque", "Ver Honda no estoque" — e não o literal "Ver {Marca} no estoque (N)". Se a marca está zerada, só leva a marca ao formulário. O modelo digitado nunca é usado.
4. **`src/lib/fichaPerdida.ts`** ganha a leitura de caminho de 3 segmentos, com o mesmo formato de retorno. Hoje ele devolve vazio abaixo de 4. O bloco do cliente do #70 recebe o nível ("ficha" ou "modelo") como prop serializável, nunca como função.
5. **Metadata:** sem mudança.

## Testes

- **Padrão:** o de `tests/ficha-sem-veiculo.test.ts`: `renderToStaticMarkup(await NotFound())`, com a leitura dublada e `usePathname` dublado.
- **Parte 1:**
  - a página chama a leitura com cache, e não `recortesDoEstoque` (dublê que conta chamadas; mutação no ponto de chamada, não na função nova);
  - na pane, responde 404 com "Ver todo o estoque" e sem amostra;
  - no caso normal, amostra e blocos ficam iguais.
- **Parte 2, nas duas páginas:**
  - título e frase inteiros, sem inglês;
  - sem "vendid", "saiu" ou "não está mais";
  - "Ver todo o estoque" presente;
  - `/carros/foo` não imprime "Foo";
  - `/carros/volkswagen/foo` linka a Volkswagen e não imprime "Foo";
  - os três arquivos de não encontrado existem cada um no seu segmento.
- **Travas da suíte cheia** que leem essas páginas: `promessa-publica`, `genero-e-concordancia`, `hub-vazio-tem-formulario`, `hub-sem-estoque`, `texto-do-hub-chega-na-pagina`.

## Achado de 14/09 — a casca do 404 de rota casada não tem corpo no HTML servido

**Fato, medido com curl.** Ficha inexistente em produção, no preview do #70 e no da parte 1, e `/carros/marca-que-nao-existe`: todas respondem 404 com `<html id="__next_error__">`, `noindex` no head, `<body>` só com um `<div hidden>` vazio, e o digest `NEXT_HTTP_ERROR_FALLBACK;404` no payload. Título, texto, "VER TODO O ESTOQUE" e a amostra só existem dentro de `self.__next_f`; o navegador desenha a página inteira a partir desse payload. Uma rota que não casa (sete segmentos) sai com HTML de verdade, porque cai no `/_not-found` — outro boundary.

**Causa, no Next 16.2.6.** Em `node_modules/next/dist/server/app-render/app-render.js:1959-2038`, o erro de HTTP fallback escapa do SSR e vira `ErrorApp`, com a casca de `getErrorRSCPayload` (:1125-1139); o payload da renderização principal vai inline (:2035-2038). Um `includes` sobre o HTML inteiro acha o texto e fica verde — e também acha o "This page could not be found" do layout raiz, que viaja como prop.

**O que isso desfaz.** O `grep "<form"` vazio de 11/09, que a spec e o #70 leram como prova de que `usePathname` adiava só aquele bloco, tem outra explicação: a página inteira — título e texto incluídos, que não usam `usePathname` — está fora do HTML visível, dentro da mesma casca. `usePathname` nunca foi isolado como causa; a suspeita ficou por não ter havido, até aqui, um teste que comparasse o bloco do cliente contra o resto da página na mesma resposta.

**Decisão do dono (14/09).** Aceitar a casca: o 404 e o `noindex` ficam, o critério de verificação passa a ser o payload da resposta — não mais "no HTML servido" —, e a casca fica documentada nos arquivos que a citavam como causa. Toda checagem de preview passa a separar três fatos, nunca um só:

(a) o HTML sem `<script>` contém `__next_error__` e `noindex` (a casca);
(b) o HTML inteiro contém o título e o texto (o payload, de onde o navegador desenha);
(c) o status HTTP é 404.

E soma um passo visual, no painel Browser: título em português no DOM depois do navegador desenhar a página, e nenhum "This page could not be found".

## Verificação

No preview da Vercel de cada branch (é protegido, então com link de acesso temporário), nunca num servidor local: o `preview_start` sobe no diretório principal, e não no worktree. "Responde com o texto" quer dizer os três fatos (a), (b) e (c) do achado acima — não mais "no HTML servido".
- **#70:** ficha inexistente responde 404 com o texto em português.
- **1.6:** `/carros/marcainexistente` e `/carros/volkswagen/modeloinexistente` respondem 404 com os títulos novos, e a ficha inexistente segue com o texto do #70.

## Fora do escopo

- Pane nos hubs de verdade: continuam 500, como hoje.
- Egresso do hub falso: o próprio hub ainda lê o estoque uma vez antes do 404 (hoje lê duas).
- Decisões do dono ainda abertas, que vêm do #70: o `canal` "Encomenda" compartilhado com os hubs, o limite de similares na ficha, e a frase "Vi que não tem no estoque agora".

## Ordem de entrega

1. **#70:** commit das pendências. Depois, suíte cheia, mutações, qa-guardian, push e preview.
2. **1.6:** branch a partir do #70. Depois, suíte cheia, mutações, qa-guardian, push, preview, e PR com base no #70.
