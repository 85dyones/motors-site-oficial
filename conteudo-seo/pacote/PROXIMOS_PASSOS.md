# Handoff da frente de conteúdo — 2026-09-11

Para quem pegar isto noutro worktree. Diz **onde as coisas estão**, **o que falta**
e — o mais importante neste repositório — **o que já foi tentado e recusado, com a
medição da recusa**, para ninguém refazer o caminho que o dado já fechou.

Companheiro de [`ESTADO.md`](ESTADO.md), que é a conferência do pacote contra o
repo. Este arquivo é a fila.

---

## 1. Onde as coisas estão

`origin/main` = `d70e2e3` (conferido em 11/09, não andou durante o trabalho).

| Branch | SHA | Estado |
|---|---|---|
| `feat/ficha-sem-carro-nao-e-beco` | `2085a11` | **empurrado**, PR não aberto |
| `docs/pacote-de-conteudo` | `212d65a` | **empurrado**, PR não aberto |

Worktrees usados (podem ser descartados depois do merge):

```
C:/Users/Lenovo/Documents/motors-claude/ficha-sem-carro        feat/ficha-sem-carro-nao-e-beco
C:/Users/Lenovo/Documents/motors-claude/pacote-de-conteudo     docs/pacote-de-conteudo
```

⚠️ **`C:/Users/Lenovo/Documents/motors-claude/motors-site-oficial` é o diretório
primário da sessão e tem trabalho de OUTRA sessão em curso** — em 11/09 estava no
branch `f05/pr0-conferir-antes-de-mexer`, 17 commits à frente do `main`, com
`PDPClientWrapper.tsx` e `coerencia-da-pericia.test.ts` modificados e
`BootstrapDeTags.tsx` novo, nada disso commitado. Não trabalhe lá: a outra sessão
troca o branch embaixo de você. Abra worktree próprio.

---

## 2. O que trava agora

**Abrir os dois PRs.** Os branches estão no remoto; os PRs, não. Duas portas fechadas:

- **Claude in Chrome não conecta** — sem ele, não há sessão logada do GitHub.
- **`gh` não está autenticado** e não há `GH_TOKEN`/`GITHUB_TOKEN` no ambiente. O
  `git push` passa porque usa o Windows Credential Manager; o `gh` não usa.

Destrava com `gh auth login` num terminal interativo, ou abrindo na mão:

```
https://github.com/85dyones/motors-site-oficial/compare/main...feat/ficha-sem-carro-nao-e-beco?quick_pull=1
https://github.com/85dyones/motors-site-oficial/compare/main...docs/pacote-de-conteudo?quick_pull=1
```

> **Não busque a credencial guardada para chamar a API por fora.** Foi decidido
> assim nesta sessão: mexer no cofre de senhas por conta própria não é papel do
> agente, nem com o PR pedido.

---

## 3. Fila técnica, em ordem

### 3.1 O 404 em inglês nos hubs — o próximo PR, e é o mesmo defeito

`/carros/{marca-inexistente}` e `/carros/{marca}/{modelo-inexistente}` chamam
`notFound()` e **não têm `not-found.tsx` em nível nenhum acima**. Medido no build:

```
/carros/marcainexistente               404 · "404: This page could not be found."
/carros/volkswagen/modeloinexistente   404 · "404: This page could not be found."
```

Visível na tela, com a moldura da marca em volta. É R5, é o mesmo defeito que o PR
do 404 fechou para a ficha.

**Como fazer:** um `not-found.tsx` em `src/app/[categoria]/` atende os dois hubs de
uma vez, e **não** rouba o da ficha — o boundary mais próximo vence, e o de
`[ficha]/` continua ganhando no seu subtree (inclusive para `[legado]/page.tsx`).

**A copy é outra**, não reaproveite a da ficha: marca que a loja nunca teve não é
"endereço que não abre ficha". E vale reler a armadilha de `usePathname` em 3.4.

### 3.2 Link contextual na ficha — R4 e R8, o maior item aberto de linkagem

Medido no HTML servido, comparando a ficha com uma página que só tem moldura:

```
/privacidade                          2 /avaliacao   1 /financiamento   2 /guias
/carros/chevrolet/spin/spin-8100626   2 /avaliacao   1 /financiamento   2 /guias
```

Contagens idênticas: **o corpo da ficha dá zero link contextual.**

> ⛔ **Não faça o que a Fase 0 item 2 do README manda** ("CTAs da ficha viram
> `<a href>`"). O CTA da ficha é o modal de captura, que leva o contexto do
> veículo; convertê-lo troca lead qualificado por clique genérico. Já foi recusado
> uma vez. O trabalho é **acrescentar** link, não converter.

R8 pede mapeamento motorização → guia. Hoje há **1** guia publicado, então o
mapeamento não tem para onde apontar — ver 3.6.

### 3.3 Custo e resiliência da 404 nova — barato, e a revisão insistiu

Duas coisas ficaram escritas como nota no docblock de `not-found.tsx`, e as duas
têm conserto barato:

- **Egresso.** `recortesDoEstoque` são dois `getEstoque()` completos (`select *`),
  ~489 KB cada, **~977 KB por render**. A rota é `revalidate = 3600` com
  `dynamicParams = true`, e o espaço de endereços falsos é **ilimitado** — ao
  contrário dos 103 hubs. Um scanner de ~5 mil caminhos distintos come a cota de
  5 GB do Supabase free. Conserto sugerido pela revisão: `unstable_cache` com
  chave fixa em volta de `recortesDoEstoque`, que colapsa de O(caminhos) para
  O(1) por hora. `getEstoque` não tem cache em lugar nenhum do projeto.
- **Sem `error.tsx` em `src/app`.** Numa pane do Supabase, `getVeiculoById` engole
  e cai na contingência (`[]`) → `notFound()` → a 404 chama `recortesDoEstoque()`,
  que **estoura** `EstoqueIndisponivelError`. Antes do PR a pane dava 404; agora dá
  500 sem moldura — o beco em inglês voltando por outra porta.

### 3.4 Três armadilhas de ambiente que custam tempo

1. **`usePathname` numa rota prerenderizada some do HTML servido.** O Next adia a
   subárvore para o cliente e manda uma referência no payload RSC. O teste em
   vitest dubla `usePathname`, renderiza tudo e fica verde — falso verde perfeito.
   Nenhuma saída que sustente a R5 pode morar atrás dele.
2. **Junction de `node_modules` não serve para `next build`.** O Turbopack recusa
   com *"Symlink [project]/node_modules is invalid, it points out of the filesystem
   root"*. Serve para `vitest`. Worktree novo precisa de `npm ci` de verdade.
3. **`preview_start` roda no cwd da sessão, não no worktree.** Para ver a página,
   `next build` + `next start -p <porta livre>` pelo Bash, e confira o log — porta
   ocupada por servidor velho dá 200 falso.

---

## 4. O protocolo do pacote — o que sobrou

A Fase 0 está praticamente feita (ver `ESTADO.md` para item a item). O que resta:

### 4.1 Hub `/motos` — Fase 0, item 8

`motos` existe como **segmento de ficha** (`SEGMENTOS_DE_PDP`), mas `/motos`
responde **404** — e `/carros` também. Nenhum dos dois tem hub; o hub é `/estoque`.
Link no rodapé para `/motos` hoje seria link quebrado: ou se cria a página, ou o
item sai da lista.

### 4.2 Bloco estruturado da perícia — Fase 2, **o bloqueador da Onda 1**

As 8 peças afirmam que o resultado da perícia está publicado na ficha. Hoje a ficha
mostra `pericia` (o status, ex. `PERÍCIA APROVADA`) e `laudo_pericia` (texto livre),
num acordeão que só abre com a perícia aprovada.

Não existe o bloco da spec (`produto/01-bloco-resultado-pericia.md`): data, empresa,
número do laudo, os três eixos com status, apontamentos linha a linha, nota de
rodapé fixa e `additionalProperty` no `Car`.

**Antes da tela, falta o dado.** São duas colunas de texto em `estoque_motors`; o
resultado estruturado precisa existir como campo, transcrito na entrada do veículo.
E a spec exige, por escrito, validação com quem responde pela LGPD — o laudo em PDF
**não vai para o site** (nome, CPF e endereço do proprietário anterior).

### 4.3 Publicar a Onda 1 — Fase 3

**1 guia publicado**, e não é nenhum dos oito:

```
guias (estado = publicado) → 1
  o-que-a-pericia-cautelar-nao-verifica
```

Publicar **não é abrir PR**: os guias vivem na tabela `guias` (migração
`20260906160000`) e se escrevem em `/admin/guias`. As 8 peças estão prontas em
`conteudo-seo/pacote/guias/`.

Pendências que travam e **não são de código** (lista completa no README do pacote):
revisão jurídica das peças 05 e 07, os valores de perícia em Curitiba na peça 03,
e a revisão do contrato de venda antes da `/garantia` reescrita.

---

## 5. Decisões que são do dono, não do código

| Assunto | Situação |
|---|---|
| `canal` do lead da 404 | Continua `"Encomenda"`, igual ao dos hubs. O que separa é o `caminho`, que leva o endereço morto. Mudar mexe em `montarEncomenda`, compartilhado com 37 hubs. |
| Limite dos similares na ficha | A spec pede 4 a 6; `escolherSimilares` usa 3 (parâmetro `limite`). |
| Frase do lead sem contexto | `mensagemDaEncomenda` grava "Vi que não tem no estoque agora" mesmo na página que mostra seis carros. O PR tirou o **sujeito** da afirmação, não a afirmação — a frase é compartilhada. |

---

## 6. O que NÃO refazer

Três caminhos já foram tentados e fechados **com medição**. Estão aqui para não
serem reabertos por parecerem óbvios:

- **"Carro vendido cai no 404."** Não cai. Responde **200** com o selo durante a
  carência de 90 dias, e **301** para o hub do modelo depois. Conferido contra oito
  vendidos em produção — todos 200. O `notFound()` da ficha é id que nunca existiu,
  ficha apagada, URL velha de portal ou link torto.
- **"Ordenar a grade por `first_seen_at`."** Só **13 dos 88** disponíveis têm o
  carimbo; `created_at` está nas 88 mas não é mapeado para `Veiculo`. Ordenar por
  chegada congelaria a seção nesses treze para sempre. Ficou amostra igualmente
  espaçada ao longo do preço vigente, extremos inclusos (`patioEmDestaque`).
- **"Similares na 404, com a cascata da spec."** A cascata parte do veículo da
  página, e a página existe justamente quando não há veículo — id desconhecido não
  tem carroceria nem preço para comparar.
