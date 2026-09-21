# Conformidade com o laudo "Auditoria Google Ads + site" (20/09/2026)

Revisão feita em 21/09/2026 contra o `main` em `bef9c44` e contra os dois PRs
abertos (#103 e #128). Reverificada no mesmo dia, com o `main` ainda em `bef9c44`:
**os quatro itens do §6 continuam abertos**, e a reverificação alargou o item 3 —
ver a tabela do §3.2.

O laudo mistura, de propósito, três naturezas de achado: o que se conserta no
**código**, o que se conserta no **painel do Google Ads / GTM / Perfil da
Empresa**, e o que se conserta no **dado cadastral**. Este documento separa as
três, porque só a primeira é auditável aqui — e porque a leitura "o laudo tem 40
itens abertos" é falsa: boa parte já está no ar, e três itens do laudo descrevem
o código de forma imprecisa.

Baseline de teste desta revisão: `npm test` — 209 arquivos, 3.733 testes verdes,
10 skipped (os de sempre). Nenhum código de produção foi alterado por este
documento.

Um achado que não está no laudo e que a revisão do código encontrou: a suíte que
guarda o `<h1>` da home **é cega para o defeito que o laudo mediu naquele mesmo
`<h1>`**, porque o extrator de texto do teste troca toda tag por um espaço. Está
no §3.7, e muda o conserto: ele precisa vir com trava nova.

---

## 1. Os dois PRs abertos não tocam em nenhum item do laudo

| PR | O que é | Relação com o laudo |
|---|---|---|
| **#103** `feat/meta-no-ato` | Meta Pixel sobe no parse do HTML | **Nenhuma.** O laudo registra o Pixel como carregando e não pede mudança. Não conflita. |
| **#128** `claude/motors-repos-improvement-jd1dsi` | Documento de avaliação de sete repos abertos | **Nenhuma.** Documento único em `docs/`, sem código. |

Duas observações de manutenção, independentes do laudo:

- Os dois PRs estão atrás do `main`. O #103 tem base em `f689059` e o #128 em
  `1d97b7a`; o `main` está em `bef9c44`. Ambos precisam do merge da base antes de
  qualquer avaliação de CI ter valor.
- O #103 nasce de `metaPixelId: ""` em `lib/companySettings.json:19`, e esse valor
  **continua vazio** — a premissa do PR segue válida.

**A conclusão que importa:** o Bloco 0 do laudo tem itens de código em aberto e
**nenhum PR aberto os cobre.** Não há trabalho em andamento sobre eles.

---

## 2. Já em conformidade — não mexer

Itens que o laudo pede e que o código **já entrega**. Registrados com a fonte
para ninguém "consertar" o que está certo.

| Item do laudo | Onde está | Situação |
|---|---|---|
| **Bloco 0.5** — 302 → 301 no domínio antigo | `next.config.ts:164-245`, todas as regras com `permanent: true` | ✅ Feito nos PRs #131/#132, já no `main` |
| **Bloco 0.5** — mapear URLs legadas em 404 | `next.config.ts:190-231`: `/multipla/marca/:marca` → `/carros/:marca`, `/multipla/*` e `/busca/*` → `/estoque`, `/politica-de-privacidade` → `/privacidade`, e as raízes `/carros`, `/motos`, `/destaques` | ✅ Feito. Medido nas 57 URLs do sitemap antigo |
| **Bloco 0.5** — manter o domínio antigo no ar | `next.config.ts:242-245`: regra de host para os dois `antigos` | ✅ Feito |
| **Bloco 0.7** — destino de `/pole-position-2026` | `lib/campanhas.ts` (`fim: "2026-09-20"`, `destinoAposFim: "/estoque"`) + `page.tsx:177-178` `permanentRedirect` + `sitemap.ts:212` só lista `campanhasVivas` | ✅ **Já resolvido, e sozinho.** Ver §4.2 |
| **Bloco 3.7** — cluster de perícia cautelar em Curitiba | `conteudo-seo/pacote/guias/01..08` — laudo cautelar, resultados, perícia em Curitiba, leilão/sinistro, chassi remarcado, cautelar × vistoria, reprovação | ✅ Escrito (Onda 1) |
| Preparação para busca por IA | `app/robots.ts:50,56` (GPTBot, ClaudeBot, Google-Extended) + `public/llms.txt` + `/api/llms-full.txt` | ✅ Como o laudo descreve |
| Schema JSON-LD em todas as camadas | `lib/schemaLoja.ts`, `schemaListagem.ts`, `schemaVeiculo.ts`, `schemaGuia.ts` | ✅ Como o laudo descreve |
| Canonical self-referencing absoluto | `[modelo]/page.tsx:111-114`, `estoque/page.tsx:74` | ✅ |
| Fragmentação do T-Cross por versão no slug | `lib/hubsDeEstoque.ts:168` `ehRotuloSujo` + `:294-298` `canonicalDe` → o hub sujo aponta o canônico para o limpo | ⚠️ **Mitigado, não eliminado.** Ver §3.9 |

---

## 3. Fora de conformidade — itens de código, em aberto

Ordenados por custo/benefício, não pela ordem do laudo.

### 3.1 O link de telefone do **cabeçalho** não dispara nada — `conv_ligacao` continua sem dado

**Este é o único defeito real de rastreamento do laudo, e a causa é mais estreita
do que o laudo supõe.**

O evento existe: `lib/dataLayer.ts:578` `pushCliqueTelefone()` empurra
`event: "click_to_call"`, e `lib/telemetry.ts:894` o chama a partir de
`trackContactClick("phone", …)`.

Existem **dois** links `tel:` no site, e só um está ligado:

| Onde | Dispara? |
|---|---|
| Rodapé — `lib/colunasDoRodape.ts:85` com `contato: "phone"`, consumido pelo `onClick` de `components/Footer.tsx:97-104` | ✅ sim |
| **Cabeçalho — `components/Header.tsx:140-145`** | ❌ **não.** O `<a href="tel:…">` não tem `onClick` |

O link do cabeçalho é `hidden … xl:block`: só aparece a partir de 1280px — exatamente
a largura de quem audita no desktop. É o que o laudo clicou.

O comentário em `telemetry.ts:871-874` afirma que "todo CTA de WhatsApp e de
telefone do site já passa por aqui". **Para o telefone isso é falso desde que o
cabeçalho ganhou o número.** O comentário precisa cair junto com o conserto.

**Conserto:** pendurar `trackContactClick("phone", "Cabeçalho - Telefone")` no
`<a>` de `Header.tsx`. Uma linha, mais o teste que trava as duas pontas.

> **Correção ao laudo:** o laudo pede "um `click_telefone` no mesmo padrão do
> `click_whatsapp`". Criar um evento novo com esse nome seria um erro: o nome da
> casa é `click_to_call`, ele já está mapeado na tag 202 do container
> (`docs/GTM_CONFIGURACAO.md`) e renomear quebraria a tag publicada. O que falta
> é **fiação**, não evento.

### 3.2 A home manda `stock_count: null` e nunca se corrige

`lib/dataLayer.ts:366` zera `stock_count` a cada troca de página, de propósito, e
quem repõe o número é o componente `<ContagemDeEstoque>`.

Ele está em `/estoque` (`estoque/page.tsx:141`), nos recortes
(`estoque/[recorte]/page.tsx:235`), em `/financiamento` (`:102`) e nas duas
páginas geográficas (`PaginaGeoView.tsx:48`).

**Não está em `app/page.tsx`.** A home calcula `const total = disponiveis.length`
na linha 125 e o usa no hero (`:185 totalEstoque={total}`), mas nunca o empurra
para o `dataLayer`. O laudo mediu certo: a home declara 38 veículos na tela e
`null` na camada de dados.

**Conserto:** `<ContagemDeEstoque total={total} />` na home. Uma linha.

**Mas o problema é maior do que a home, e só aparece cruzando com o §3.8.** Das
seis páginas que contam estoque, **uma só acerta**:

| Página | `revalidate` | Empurra `stock_count`? | O que chega ao GA4 |
|---|---|---|---|
| `app/estoque/page.tsx` | 60 s | sim (`:141`) | ✅ número fresco |
| `app/page.tsx` (home) | 60 s | **não** | ❌ `null` |
| `app/estoque/[recorte]/page.tsx` | **3600** s | sim (`:235`) | ⚠️ até 1 h atrasado |
| `app/financiamento/page.tsx` | **3600** s | sim (`:102`) | ⚠️ até 1 h atrasado |
| `app/seminovos-curitiba/page.tsx` | **3600** s | sim (via `PaginaGeoView.tsx:48`) | ⚠️ até 1 h atrasado |
| `app/seminovos-bacacheri/page.tsx` | **3600** s | sim (via `PaginaGeoView.tsx:48`) | ⚠️ até 1 h atrasado |

Ou seja: `stock_count` no `dataLayer` hoje é **`null` na página de maior tráfego
ou número de até uma hora atrás em quatro das cinco restantes.** Só `/estoque`
publica o número certo.

O conserto de uma linha na home não basta sozinho — sem o §3.8 junto, a home passa
a empurrar o número certo enquanto quatro páginas continuam empurrando o velho, e
o relatório fica pior de ler, não melhor: passa a haver divergência **entre
páginas** onde antes havia um `null` honesto.

### 3.3 `capitalizeWords` transforma `HB20` em `Hb20` — e afeta título, H1 e meta

`lib/supabase.ts:266-274`. O helper faz `charAt(0).toUpperCase() + slice(1).toLowerCase()`
palavra por palavra, sem dicionário de siglas. `formatBrand` (`:276-281`) tem uma
allowlist de **quatro** marcas — `BMW`, `BYD`, `GWM`, `GM` — e nada para modelos.

Consequências medidas pelo laudo, todas vindas desta função:

- `HB20` → **`Hb20`**, em `<title>`, `<h1>` e meta description ao mesmo tempo;
- `CITROEN` → **`Citroen`**, sem trema;
- `HR-V` → `Hr-v`, `C-180` → `C-180` (o comentário de `:421-423` já reconhece o
  caso e o resolve **só para o override manual**, não para o valor do feed);
- versões inteiras em caixa baixa;
- `VirtusHighline` → `Virtushighline`, sem o espaço entre modelo e versão.

O override de painel (`modelo_override`, `versao_override`) escapa da moagem de
propósito — é a válvula de escape existente, carro por carro. O que não existe é
o **dicionário** que o laudo pede, e é ele que corrige os 137 hubs de uma vez.

**Conserto:** um mapa de grafias canônicas (`HB20`, `HR-V`, `T-Cross`, `Citroën`,
`M40i`, `C-180`…) aplicado depois do `capitalizeWords`, mais title-case de versão.
Módulo puro, testável, sem tocar no banco.

### 3.4 O `<title>` das páginas de modelo briga com as palavras-chave da campanha

`[categoria]/[marca]/[modelo]/page.tsx:96-97`:

```
`${hub.nome} ${Novo} em Curitiba a partir de ${menor}`
```

Os três problemas do laudo estão todos nessa linha:

1. **sem a marca** — `hub.nome` é "Onix", não "Chevrolet Onix" (a marca existe em
   `hub.marca` e já é usada na `description` de `:100` e no card de `:118`);
2. **"Seminovo", não "Usado"** — `seminovo(hub.genero)` em `:93`. A campanha compra
   `[onix plus usado curitiba]` e `[hb20 usado curitiba]`: o site e o Ads estão
   otimizando para palavras diferentes;
3. **preço dinâmico dentro do `<title>`** — `${menor}` muda a cada rotação de
   estoque.

O alvo do laudo é `Chevrolet Onix Usado em Curitiba | Motors Store`.

**Ressalva de quem escreveu o código, e ela é boa:** o comentário de `:87-91`
explica que o gênero vem do hub porque "quem procura escreve *saveiro usada
curitiba*". Trocar "seminovo" por "usado" **não pode perder a concordância** —
"Saveiro Usada", não "Saveiro Usado". O `seminovo(hub.genero)` precisa virar
`usado(hub.genero)`, não uma string fixa.

### 3.5 CNPJ e razão social: a fiação existe, o dado está vazio

`components/Footer.tsx:166-169` já renderiza a linha legal condicionalmente:

```
© {ano} {name.toUpperCase()}{cnpj ? ` · CNPJ ${cnpj}` : ""}
```

E `lib/companySettings.json:10` traz `"cnpj": ""`. **Não é bug de código — é campo
não preenchido**, e o laudo confirmou em produção que nada aparece.

Faltam, além disso:
- **razão social** — não existe campo para ela em `companySettings.json` nem em
  `types/index.ts`;
- `legalName` e `taxID` no `AutoDealer` de `lib/schemaLoja.ts` (conferido: nenhum
  dos dois é emitido).

**Conserto:** preencher `cnpj` no painel resolve o rodapé sozinho. Razão social e
os dois campos de schema pedem campo novo.

### 3.6 O contador dentro do `<h1>`

`components/modernist/PaginaDeEstoque.tsx:251-255`. O número é um `<span>` dentro
do `<h1>`, com espaço antes — "Hyundai Hb20 seminovo em Curitiba 2", como o laudo
leu.

O comentário de `:245-250` **já chegou à mesma conclusão do laudo** ("tirar o
número do `<h1>` seria melhor para o rastreador") e parou por um motivo concreto:
num título que quebra linha, o número passaria a flutuar ao lado da primeira
palavra em vez de seguir a última, e isso não se confere sem estoque real na tela.

Não é esquecimento — é decisão adiada com razão registrada. Fica como decisão de
quem olha a tela, não de quem lê o diff.

### 3.7 O `<h1>` da home concatena duas frases sem espaço

`components/modernist/HeroHome.tsx:185-197`. O `<h1>` tem dois `<span>` irmãos:
"Seminovos selecionados em Curitiba" (`:189`) e "FORA / DA CURVA" (`:193-195`).
Entre eles o JSX não deixa nó de texto, então o `textContent` cola as duas frases.

Reproduzido fora do repo, com o mesmo HTML: são **duas** junções, não uma.

| Extrator | Resultado |
|---|---|
| `textContent` (o que muitos rastreadores usam) | `Seminovos selecionados em Curitiba`**`FORA`**`DA CURVA` |
| `innerText` (honra `<br>` e caixa de bloco) | as três linhas separadas — lê bem |
| `textoAcessivel` do teste da casa | `Seminovos selecionados em Curitiba FORA DA CURVA` — limpo |

O laudo reportou a primeira junção (`CuritibaFORA`). A segunda — `FORADA`, no
`<br>` entre "FORA" e "DA CURVA" (`:193-195`) — sai do mesmo mecanismo e o laudo
não a registrou, provavelmente por ter normalizado o `<br>` na leitura.

Isso muda o conserto: um separador só, entre os dois spans externos, fecha
`CuritibaFORA` e **deixa `FORADA` de pé.** As duas junções precisam de nó de texto.

O desenho está certo e não precisa mudar. O conserto é um `{" "}` em cada uma das
duas junções: nó de texto de verdade, entra no `textContent`, e **não pinta
pixel** — o primeiro span é `display: flex`, logo caixa de nível de bloco, e o
espaço entre duas caixas de bloco não rende nada visível; no caso do `<br>`, o
espaço cai no fim da linha quebrada.

**Não usar `sr-only` aqui.** `tests/h1-da-home-com-praca.test.ts` tem um caso
("nenhuma técnica de esconder texto aparece dentro do h1") que reprova
explicitamente `sr-only` e `hidden` dentro do `<h1>`, e a razão está escrita no
arquivo: texto escondido dentro do `<h1>` perde o peso do texto visível e ganha o
risco do texto oculto.

**E aqui está o achado que o laudo não podia ver: o teste que guarda este bloco é
cego para este defeito, por construção.** O extrator `textoAcessivel`
(`tests/h1-da-home-com-praca.test.ts:68-76`) faz
`.replace(/<[^>]+>/g, " ")` — troca **toda** tag por um espaço — e só então
colapsa o espaço em branco. Ou seja: o teste inventa exatamente o separador que
falta no DOM real. As cinco travas do arquivo passam verdes enquanto o navegador
serve `CuritibaFORA`.

Isso significa que o conserto do §3.7 precisa vir **com uma trava nova**, que leia
a concatenação como o DOM a entrega (sem normalizar tag em espaço) — senão o
defeito volta no próximo refactor do hero e o teste continuará dizendo que está
tudo bem.

### 3.8 `/estoque` e as páginas geográficas divergem na contagem — e a causa é o `revalidate`

O laudo registrou "duas delas dizem 38 veículos e `/estoque` diz 36" e não
diagnosticou. A causa está em três linhas:

| Página | `revalidate` |
|---|---|
| `app/estoque/page.tsx:37` | **60** s |
| `app/page.tsx:91` | **60** s |
| `app/estoque/[recorte]/page.tsx` | **3600** s |
| `app/financiamento/page.tsx:30` | **3600** s |
| `app/seminovos-curitiba/page.tsx:11` | **3600** s |
| `app/seminovos-bacacheri/page.tsx:11` | **3600** s |

Todas contam pelo mesmo caminho (`disponiveisDe(getEstoque())`, via
`recortesDoEstoque` em `hubsDeEstoque.ts:488-505`) — o número é o mesmo no
instante do render. O que difere é **quando** cada uma renderiza: as de 3600 s
podem servir contagem de até uma hora atrás enquanto `/estoque` se atualiza a cada
minuto. Estoque que caiu de 38 para 36 produz exatamente o que o laudo viu.

São **quatro** páginas atrasadas, não duas: a revisão de 21/09 encontrou
`/estoque/[recorte]` e `/financiamento` no mesmo grupo, e as duas **empurram o
número para o `dataLayer`** (ver a tabela do §3.2). O laudo só comparou as
geográficas com `/estoque` porque foram as que ele abriu.

**Conserto:** alinhar o `revalidate` das quatro em 60 s. Elas custam a mesma
leitura que `/estoque` já faz de minuto em minuto.

**Ressalva honesta:** 3600 s pode ter sido escolha e não descuido — página
perene que quase não muda não precisa revalidar de minuto em minuto, e há custo
de leitura (`hubsDeEstoque.ts:653-662` mede ~977 KB por render de
`recortesDoEstoque`). Se a escolha for manter 3600 s, então a saída é a inversa e
igualmente válida: **tirar o `<ContagemDeEstoque>` dessas quatro** e deixar o
`stock_count` como `null` nelas, em vez de publicar número velho. O que não se
sustenta é o estado de hoje, que publica número velho como se fosse fresco.

### 3.9 `noindex,follow` nos hubs cronicamente vazios

Hoje só existe `robots: { index: false, follow: true }` para hub **inexistente**
(`[modelo]/page.tsx:64` e `[marca]/page.tsx:59`) — ou seja, para o 404.

O hub que existe e está perenemente sem estoque (Fusca, Kombi, Parati, Classic,
Celta, no exemplo do laudo) é indexável. São ~137 URLs de marca/modelo para ~38
veículos, e o risco que o laudo levanta é de classificação thin no conjunto.

O empty-state com captura de lead já existe e é melhor que 404 — o laudo concorda.
O que falta é a régua de `noindex` para os cronicamente zerados.

Relacionado: os hubs de rótulo sujo (`t-cross-highline-250-tsi-aut`) **já** apontam
canonical para o limpo (`hubsDeEstoque.ts:294-298`), o que resolve a diluição de
sinal. A URL continua existindo e respondendo 200 — mitigado, não eliminado.

### 3.10 Autor, bio e data visíveis nos guias

> **Correção ao laudo:** o laudo diz que "nenhum dos 27 guias tem autor, bio ou
> data". No **JSON-LD** os três campos relevantes existem:
> `lib/schemaGuia.ts:47-49` emite `datePublished`, `dateModified` e
> `author: REFERENCIA_DA_LOJA`.

O que de fato falta:

1. **autor pessoa.** O `author` aponta para o `#dealer` — a loja. O próprio
   docblock de `schemaGuia.ts:23-27` já registra que "autor PESSOA é sinal de
   E-E-A-T mais forte que autor organização" e que o campo vira `Person` quando um
   consultor assinar o texto. É teto conhecido, não descuido.
2. **assinatura visível.** `app/guias/[slug]/page.tsx` renderiza trilha, `<h1>`
   (`:167-169`) e corpo — **nenhuma data e nenhum byline na tela.** O dado existe
   em `guia.publicadoEm` / `guia.atualizadoEm` e não chega ao leitor.

O item 2 é o barato e é o que o laudo realmente quer: a data e a assinatura na
página, onde o leitor as vê.

### 3.11 Página de bairro: só Bacacheri, sem vizinhos

`lib/paginasGeo.ts` declara **duas** páginas: `seminovos-curitiba` (`:47`) e
`seminovos-bacacheri` (`:127`). O laudo pede Bacacheri reforçada **mais 3 a 5
bairros vizinhos** onde a loja de fato atende.

Registro do laudo que dá a medida do custo: a Sancove mantém
`/curitiba-bacacheri` e a loja dela fica no Hauer. A barra da concorrência é
baixa.

### 3.12 Itens do Bloco 3 ainda não iniciados

- **Boilerplate em caixa baixa na descrição das fichas** → texto real por carro.
  A cascata está em `lib/schemaVeiculo.ts:179-181`
  (`descricao_seo || descricao || fallback`); é conteúdo, não código.
- **Canibalização `/estoque` × `/seminovos-curitiba` × `/seminovos-bacacheri`.**
  As três existem e o texto introdutório de cada uma é diferente (o laudo
  reconhece e elogia). O corpo listável é o mesmo. Nenhuma decisão de
  diferenciação foi tomada.

---

## 4. Onde o laudo descreve o código de forma imprecisa

Três registros, para que o plano não gaste esforço onde não há defeito.

### 4.1 O evento de telefone existe

Ver §3.1. `pushCliqueTelefone` / `click_to_call` está em `dataLayer.ts:578` e
funciona no rodapé. Criar um `click_telefone` novo quebraria a tag 202 já
publicada. O buraco é o `onClick` do cabeçalho.

### 4.2 `/pole-position-2026` já tem estratégia de expiração — e ela já disparou

O laudo diz que a página "está indexada e no sitemap, sem estratégia de
expiração". O código faz as duas coisas que o laudo pediria:

- `app/(campanha)/pole-position-2026/page.tsx:177-178` →
  `permanentRedirect("/estoque")` quando `campanhaAcabou(CAMPANHA, new Date())`;
- `app/sitemap.ts:212` só lista `campanhasVivas(new Date())`.

Com `fim: "2026-09-20"` e as contas feitas no fuso de Curitiba
(`campanhas.ts`, constante `FUSO`), **a página redireciona desde a madrugada de
hoje, 21/09, e já saiu do sitemap.** O item 7 do Bloco 0 está fechado sem
intervenção.

O `<title>` "Pole Position | Motors Store — 12 a 20 de setembro" (`:48`) continua
no arquivo, mas nenhum visitante o recebe: o `permanentRedirect` roda antes do
render.

### 4.3 Os guias têm data e autor no dado estruturado

Ver §3.10. Faltam autor **pessoa** e assinatura **visível**, não os campos.

---

## 5. Fora do repositório — não auditável aqui

Registrado para fechar a conta do laudo. Nada abaixo tem código a mudar.

**Google Ads (painel):** concluir verificação do anunciante; aceitar termos dos
anúncios de formulário de lead; ativar "Estoque - 8 carros" com R$ 36/dia; reduzir
ou pausar a campanha de marca; pausar as palavras-chave de baixo volume; eleger
**uma** conversão Principal e rebaixar as outras a Secundária; incluir
"Local actions - Directions" nas metas da conta; forçar opção de local
**Presença**; conferir a URL final dos 5 RSAs de modelo; completar os RSAs para
12–15 títulos e 4 descrições; sitelinks no nível de grupo; recursos de imagem,
preço e promoção; resolver a incoerência `"quanto vale"` × sitelink de avaliação;
rever Joinville/Ponta Grossa; investigar a segunda conta não configurada.

**Perfil da Empresa no Google:** vincular o GBP à conta e criar o recurso de
local (o laudo chama isto de "o maior furo de recursos da conta"); operação de
avaliações.

**GTM:** conferir se as tags de conversão do Ads estão penduradas em
`click_whatsapp` e no envio de formulário; mapear a tag 202 (`click_to_call`) para
`conv_ligacao` — o lado do site desta fiação é o §3.1.

**Search Console:** ferramenta de mudança de endereço; relatório de páginas do
domínio antigo para medir a cobertura real de 404.

**Texto de anúncio:** trocar "Laudo disponível na ficha" por "Resultado da perícia
na ficha". Conferido: essa redação **não existe no repositório** — nem em `src/`,
nem em `docs/`, nem em `conteudo-seo/`. É texto de painel. O lado do site já está
correto e é conservador: `lib/textoDoLaudo.ts` diz "o laudo está disponível para
consulta, solicite ao vendedor a qualquer tempo", travado por
`tests/coerencia-da-pericia.test.ts`.

**Nota sobre `googleAdsId`:** `companySettings.json:20` está vazio e isso é
**deliberado** — `components/IntegrationsTracker.tsx:278-295` documenta que o bloco
nunca rodou em produção e adverte para não preencher o campo sem ler o §5 do
`TRACKING_SPEC.md`. A tag `AW-18360613832` que o laudo viu carregando vem pelo
GTM. Não confundir com lacuna.

---

## 6. O que eu faria primeiro

Quatro itens de código, todos pequenos, que fecham o que o Bloco 0 e o Bloco 1
ainda devem ao site:

1. **`onClick` no telefone do cabeçalho** (§3.1) — é o único defeito de
   rastreamento do laudo e o que destrava `conv_ligacao`.
2. **`stock_count` coerente em todo o site** (§3.2 + §3.8) — a home empurrando o
   número, e as quatro páginas de 3600 s deixando de empurrar número velho (ou
   caindo para 60 s). **Os dois juntos, nunca só o primeiro.**
3. **Dicionário de normalização** (§3.3) — o maior retorno por esforço do site
   inteiro, nas palavras do laudo, e pré-requisito para reescrever os titles
   (§3.4) sem publicar `Hb20` num título novo.
4. **`<title>` das páginas de modelo** (§3.4) — depois do item 3, e preservando a
   concordância de gênero.

Duas dependências que a revisão de 21/09 tornou explícitas, e que mudam a ordem
em relação à primeira leitura:

- **§3.2 sozinho piora o relatório.** Pôr o `<ContagemDeEstoque>` na home sem
  mexer no §3.8 faz a home publicar o número certo enquanto quatro páginas
  publicam o de uma hora atrás — divergência entre páginas onde antes havia um
  `null` honesto. Por isso os dois viraram **um** item.
- **§3.4 depois do §3.3.** Reescrever o `<title>` antes do dicionário publicaria
  "Hyundai **Hb20** Usado em Curitiba": trocaria um defeito por outro no mesmo
  lugar.
