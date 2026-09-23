# Destaques com ordem, e filtros no estoque — design

**Data:** 2026-09-21 (revisto em 2026-09-22) · **Superfícies:** `/admin/site/destaques` (nova), `/admin/estoque`, home, `/vitrine` · **Status:** desenho aprovado, não implementado

> Queixa do dono, 2026-09-21: *"o mecanismo de destaques da home está com erro,
> ele não aceita alteração, era pra termos opção de trocar, mas nem filtrar é
> possível, apenas inserir ou remover, mas como saber quem já está lá?
> precisamos ter condição de filtrar melhor o estoque na área interna, além dos
> filtros atuais"*

---

## 1. O defeito, medido — não é erro de gravação

**MEDIDO em 2026-09-21, contra o banco de produção**, lendo `site_settings` com
a chave de serviço:

| linha | marcados | `updated_at` |
|---|---|---|
| `carousel_vehicles` | 9 | 2026-09-21T20:34:25Z |
| `destaques_da_semana` | — | **a linha não existe** |

Os 9 de `carousel_vehicles`, na ordem gravada, cruzados com `estoque_motors`:

| # | id | carro | situação |
|---|---|---|---|
| 1 | 8324691 | Chevrolet Camaro SS | arquivado |
| 2 | 8296347 | Hyundai i30 | arquivado |
| 3 | 8307965 | Chevrolet Onix Plus Turbo LT | arquivado |
| 4 | 8171616 | Fiat Titano | **vivo** — R$ 170.900 |
| 5 | 8121860 | VW Saveiro Trendline | arquivado |
| 6 | 8429524 | VW Spacefox | **vivo** — R$ 45.900 |
| 7 | 8358193 | VW Saveiro Trendline | **vivo** — R$ 55.900 |
| 8 | 8107703 | Chevrolet Onix Sedan Plus | vendido |
| 9 | 8464513 | Fiat Toro Volcano | **vivo** — R$ 106.900 |

**A gravação funciona. O site é que descarta.** `POST /api/settings` grava a
lista inteira e devolve `{ success: true }`; o painel pinta o aviso verde
"Destacados no carrossel da home". Só que `src/app/page.tsx:138-143` faz:

```ts
const curados = (settings.carouselVehicleIds as string[])
  .map((id) => disponiveis.find((v) => v.id === id))
  .filter(Boolean);
const slidesHero = (curados.length > 0 ? curados : disponiveis).slice(0, 3);
```

`curados` = os 4 vivos, na ordem marcada → `[Titano, Spacefox, Saveiro, Toro]`.
O `.slice(0, 3)` corta o Toro. **O carro marcado por último é o primeiro a não
caber**, porque a lista é *append-only*:

```ts
// src/components/admin/TabelaDeEstoque.tsx:302
const proximos = marcar
  ? [...new Set([...destacados, ...selecionadosVisiveis])]   // sempre no FIM
  : destacados.filter((id) => !selecionadosVisiveis.includes(id));
```

Marcar não tem como trocar nada: só empilha atrás de uma fila cheia. Não existe
erro para aparecer, porque não há falha — há descarte silencioso.

### 1.1 Uma lista servindo dois donos — a origem do defeito

| consumidor | o que lê hoje | capacidade |
|---|---|---|
| banner da home (`src/app/page.tsx:143`) | `curados.slice(0, 3)` | **3** |
| TV do showroom (`src/app/vitrine/page.tsx:45`) | `curados` **inteiro** | sem teto, pagina de 4 em 4 |

O Fiat Toro que não aparece na home **está no ar na TV do showroom agora**. A
mesma lista alimenta uma superfície com teto de 3 e outra sem teto nenhum: é
matematicamente impossível curá-la bem para as duas. Curar para a TV (marcar
muitos) entope o banner; curar para o banner (marcar 3) esvazia a TV.

**É esta a raiz, e a §2 a resolve separando as listas.**

### 1.2 A grade da home é 100% sorteio

`destaques_da_semana` não existe no banco: `montarDestaquesDaSemana` recebe
`selecionados: []` e as 6 vagas saem inteiras do Fisher-Yates. A curadoria
desenhada em `2026-09-09-destaques-da-semana-design.md` foi construída e
**nunca foi usada** — provável causa: são dois pares de botões de nome vizinho
na mesma barra ("Destacar na home" = banner; "Pôr nos destaques da semana" =
grade), sem nada na tela dizendo que são listas diferentes com destinos
diferentes.

### 1.3 Por que o dono não consegue se desentupir sozinho

Para abrir vaga ele precisa remover um dos 3 da frente. Remover exige
selecionar a linha na tabela — e `filtrarLinhas`
(`src/lib/estoqueTabela.ts:397`) só filtra por **estado** e por **texto**
(marca, modelo, versão, id, placa):

```ts
if (estado !== "todos" && l.estado !== estado) return false;
if (!busca) return true;
const alvo = normalizarBusca([l.marca, l.modelo, l.versao, l.id, l.placa]...);
```

Não há filtro de destaque. A única pista na tela é um `· na home` miúdo dentro
da linha (`TabelaDeEstoque.tsx:835`), entre **119** linhas. E 5 dos 9 marcados
estão arquivados — sob o chip "Publicados" (35) eles nem aparecem; moram em
"Arquivados" (44). A lista está entupida de carros que o dono não tem como ver.

---

## 2. As decisões

Tomadas pelo dono em 2026-09-21 e 2026-09-22, nesta ordem:

- **DECIDIDO — tela própria, com ordenação.** Entre "empurrar o último para
  fora", "bloquear quando cheio" e "tela própria", ele escolheu a tela própria.
  A tabela de estoque continua sendo onde se **adiciona**; a ordem, a remoção e
  a limpeza passam a ter lugar.
- **DECIDIDO — fila ordenada com linha de corte**, e não vagas fixas. O array
  de ids continua sendo o contrato; o que muda é que o corte, hoje invisível,
  passa a ser desenhado.
- **DECIDIDO (22/09) — a TV vira lista própria.** *"pode deixar separado a TV
  do site, inclusive... pode ficar na mesma tela de configuração, mas são
  coisas separadas."* Três listas, três destinos, uma tela só.
- **DECIDIDO (22/09) — os dois tetos sobem:** o banner da home de **3 para 4**
  slides, e a TV de **4 para 6** carros por página. Ver §3.3 para o que cada um
  custa em leiaute.
- **DECIDIDO — limpar os 5 mortos.** Confirmado pelo dono. Não muda nada do que
  está no ar: eles já são descartados pelo `filter(Boolean)` antes do corte.
- **DECIDIDO — filtros novos no estoque:** faixa de preço; marca e carroceria;
  tempo em estoque e desempenho (parados há X dias, sem lead, sem visita). Ano
  e quilometragem ficaram **de fora** por escolha dele.
- **DECIDIDO — o filtro "nos destaques" entra de qualquer forma.** É a resposta
  direta a *"como saber quem já está lá?"*.

### 2.1 As três listas

| lista | linha em `site_settings` | consumidor | teto |
|---|---|---|---|
| Banner da home | `carousel_vehicles` (a que já existe) | `page.tsx` | 4 slides |
| Grade da semana | `destaques_da_semana` | `page.tsx` | 6 vagas |
| TV do showroom | **`vitrine_tv`** (nova) | `vitrine/page.tsx` | sem teto, pagina de 6 em 6 |

`carousel_vehicles` **fica com o banner** em vez de ir para a TV. O motivo é
conservador: se a linha nova falhar em ser criada por qualquer razão, o que
sobrevive é o comportamento da home, que é a superfície pública e indexada. A
TV é peça de showroom, `robots: noindex`, e degrada para o caminho sem
curadoria sem prejuízo de SEO nem de cliente.

### 2.2 A separação sem migração de banco

A `/vitrine` passa a ler, nesta ordem:

```ts
const idsDaTv = Array.isArray(settings.vitrineTv)
  ? settings.vitrineTv                  // lista própria, quando já existe
  : (settings.carouselVehicleIds ?? []); // herança, até a primeira gravação
```

**Nenhuma migração SQL.** Enquanto `vitrine_tv` não existir, a TV mostra
exatamente o que mostra hoje. A tela nova grava as três listas no primeiro
"Publicar alterações", e a herança se aposenta sozinha. O fallback fica com um
comentário datado e sai do código quando a linha existir em produção.

⚠️ **Janela conhecida e aceita:** entre a subida do código e a primeira
gravação na tela nova, editar o banner ainda arrasta a TV junto — é o
comportamento de hoje, não uma regressão nova. A primeira publicação fecha a
janela. Quem implementar deve publicar uma vez na tela logo após o deploy.

### O que NÃO muda

- **`montarDestaquesDaSemana` fica intacta.** O sorteio continua preenchendo o
  que a curadoria não preencher — é a rede que mantém a grade cheia quando
  ninguém curou nada, que é exatamente o estado de hoje.
- **`/api/settings` quase não muda.** Ela já aceita `carouselVehicleIds` e
  `destaquesDaSemana`; ganha só o bloco de `vitrineTv`, idêntico aos vizinhos.
- **Nenhuma consulta nova ao banco no painel.** Preço, marca, tipo,
  `diasEmEstoque`, `leads`, `visitas`, `destacado` e `naSemana` já viajam em
  `LinhaDeEstoque` (`src/lib/estoqueTabela.ts:63`). Os filtros são recorte em
  memória.

---

## 3. A tela `/admin/site/destaques`

Irmã de `/admin/site/areas`, e deliberadamente no mesmo molde: função pura em
`src/lib/`, setas ▲/▼, estado sujo com **Descartar** / **Publicar alterações**.
Nenhuma biblioteca de arrastar entra no projeto — `AreasDoSite.tsx` já resolveu
ordenação com dois botões e `moverArea`, e repetir o padrão é mais barato que
introduzir uma dependência nova.

Três seções na mesma página. Elas ficam juntas justamente porque são
**separadas**: a confusão entre as listas é metade do defeito, e vê-las
lado a lado, cada uma com o seu destino escrito, é o que ensina a diferença.

```
┌─ 1 · BANNER DA HOME ───────── 4 vagas · rotativo, 1 por vez ────┐
│  1 ▲▼ ✕  Fiat Titano 2.2 4x4           R$ 170.900   no ar       │
│  2 ▲▼ ✕  VW Spacefox 1.6 Trend         R$  45.900   no ar       │
│  3 ▲▼ ✕  VW Saveiro Trendline 1.6      R$  55.900   no ar       │
│  4 ▲▼ ✕  Fiat Toro Volcano AT9         R$ 106.900   no ar       │
│ ────────── daqui para baixo NÃO aparece no banner ───────────── │
│                    (nada abaixo do corte)                        │
└──────────────────────────────────────────────────────────────────┘

┌─ 2 · GRADE DA SEMANA ──────────────── 6 vagas · seção 01 ───────┐
│  Nenhum carro curado. As 6 vagas estão sendo sorteadas.          │
│  [ escolher carros no estoque → ]                                │
└──────────────────────────────────────────────────────────────────┘

┌─ 3 · TV DO SHOWROOM ──────── sem teto · roda de 6 em 6, 8s ─────┐
│  1 ▲▼ ✕  Fiat Titano 2.2 4x4           R$ 170.900   página 1    │
│  2 ▲▼ ✕  VW Spacefox 1.6 Trend         R$  45.900   página 1    │
│  3 ▲▼ ✕  VW Saveiro Trendline 1.6      R$  55.900   página 1    │
│  4 ▲▼ ✕  Fiat Toro Volcano AT9         R$ 106.900   página 1    │
│                                                                  │
│  Volta completa: 32 segundos.                                    │
└──────────────────────────────────────────────────────────────────┘

⚠ 5 carros marcados saíram do estoque e não aparecem em lugar nenhum:
  Camaro SS · Hyundai i30 · Onix Plus · Saveiro Trendline · Onix Sedan
  [ limpar os 5 ]
```

### 3.1 A linha de corte

**É o coração da tela**: o descarte silencioso da §1 virado desenho. Cada
seção a posiciona no seu próprio teto, e o rótulo abaixo dela diz a verdade
daquela seção — "NÃO aparece no banner", "NÃO aparece na grade". A TV não tem
teto, então **não tem linha de corte**; no lugar dela vai o número que importa
ali: quantos segundos leva uma volta completa (itens × 8s), porque é o que
decide se a lista está longa demais para uma TV de showroom.

### 3.2 Os mortos

Ficam num bloco só, no rodapé, **fora da contagem de vagas das três seções**,
com uma ação única de limpeza que varre as três listas. A tela precisa dizer,
em texto, que limpar não muda nada do que está no ar — senão o botão assusta e
ninguém aperta. Hoje esse botão resolveria 5 ids de uma vez.

### 3.3 Os dois tetos que sobem, e o que custam

**Banner: 3 → 4 slides.** Não é uma linha só, e a medição desmente a primeira
impressão. Os indicadores do hero são botões de largura fixa numa linha flex
(`HeroHome.tsx:238-246`): `w-[76px]`, `gap-4` no mobile. A conta:

| slides | largura da régua | cabe em 343px (celular de 375px)? |
|---|---|---|
| 3 (hoje) | 3×76 + 2×16 = **260px** | sim |
| 4 | 4×76 + 3×16 = **352px** | **não, por 9px** |
| 5 | 5×76 + 4×16 = **484px** | não |

O próprio código já registra a aperto: *"No mobile a linha não cabe (3
indicadores + placa de 280px > 360px), então o rodapé empilha"*. Então subir
para 4 exige **mexer na régua de indicadores** — encolher o botão para
`w-[64px]` abaixo de `sm` (4×64 + 3×16 = 304px, cabe com folga) e manter
`w-[76px]` de `sm` para cima. É mudança de CSS responsivo, com teste de
leiaute, não um número trocado.

**5 slides fica fora de escopo**: exigiria régua rolável ou quebra de linha, e
o dono pediu "aumentar", não "aumentar ao máximo". 4 é o passo que cabe sem
redesenhar o rodapé do hero.

**TV: `POR_PAGINA` 4 → 6.** Aqui o custo é tipográfico. O rodapé da TV
(`VitrineTV.tsx:211`) é uma faixa de largura total: uma célula fixa "A SEGUIR"
(~10vw) e o resto dividido em `flex-1`, cada célula com `px-[1.77vw]` e o nome
do carro em `text-[1.15vw]` com `truncate`.

Largura útil ≈ 90vw (100vw menos a célula fixa "A SEGUIR"). O nome mais longo
do estoque, "Volkswagen Saveiro", tem 18 caracteres e ocupa ~9vw no corpo
apertado (1vw, ~0,5em por caractere).

| células | respiro lateral | largura de conteúdo | nome do carro |
|---|---|---|---|
| 4 (hoje) | 1,77vw × 2 | 90/4 − 3,54 = **~19vw** | folgado |
| 6 | 1,2vw × 2 | 90/6 − 2,4 = **~12,6vw** | **cabe, com ~3,6vw de folga** |
| 8 | 1,2vw × 2 | 90/8 − 2,4 = **~8,9vw** | não cabe — trunca |

⚠️ **A coluna do respiro é o que torna a tabela honesta.** A versão anterior
deste documento dava ~11,4vw para 6 células e ~7,7vw para 8, porque calculava
as duas com o respiro ANTIGO (1,77vw) — embora o aperto para 1,2vw seja parte
da mesma mudança que permite as 6. Os números certos são mais folgados; a
conclusão não muda, e é ela que decide: **6 cabe, 8 não.**

**6 é o teto real desta faixa sem redesenhá-la.** Acima disso a TV vira uma
fileira de reticências, que num aparelho visto de longe é pior que mostrar
menos carros. O ajuste que acompanha: `px-[1.77vw]` cai para `px-[1.2vw]` e o
nome para `text-[1vw]` — medidos para 6 caber sem truncar os nomes do estoque
atual.

### 3.4 Estado e gravação

Mesmo desenho de `AreasDoSite.tsx`: a tela edita uma cópia local, mostra
"Alteração não publicada" enquanto `sujo`, e só **Publicar alterações** chama
`POST /api/settings` — uma vez, com as três listas. Difere de propósito da
tabela de estoque, que grava a cada clique: aqui o dono mexe na ordem várias
vezes seguidas antes de estar satisfeito, e gravar a cada seta faria uma dezena
de escritas e de invalidações de cache para uma decisão só.

---

## 4. `src/lib/destaquesDoPainel.ts` — o módulo novo

Toda a regra em funções puras, testáveis sem React, no molde de
`src/lib/areasDoSite.ts`.

```ts
/** As três vitrines que uma lista pode alimentar. */
export type Vitrine = "banner" | "grade" | "tv";

/** Quantas vagas cada vitrine tem. `null` = sem teto. */
export const VAGAS: Record<Vitrine, number | null> = {
  banner: 4,   // era 3 — ver §3.3
  grade: 6,    // = VAGAS_NA_GRADE, importada, não duplicada
  tv: null,
};

export type DestinoDoDestaque =
  | "no_ar"        // dentro do teto da sua vitrine (ou sem teto)
  | "fora_do_teto" // vivo, mas além da última vaga
  | "fora_do_ar";  // vendido, arquivado, sem foto, ou fora do estoque

export interface ItemDestacado {
  id: string;
  rotulo: string;              // "Fiat Titano 2.2 4x4"
  preco: number | null;
  posicao: number;             // 1-based, na lista inteira
  posicaoViva: number | null;  // 1-based entre os vivos; null se fora do ar
  destino: DestinoDoDestaque;
  motivoForaDoAr: string | null; // "vendido" | "arquivado" | "sem foto"
}

export function montarPainelDeDestaques(
  ids: string[], linhas: LinhaDeEstoque[], vitrine: Vitrine,
): ItemDestacado[];

/** Espelha `moverArea`. Fora dos limites, devolve a lista intacta. */
export function moverDestaque(
  ids: string[], id: string, direcao: "cima" | "baixo",
): string[];

export function removerDestaque(ids: string[], id: string): string[];

/** Tira os ids que não estão vivos. Não mexe na ordem do resto. */
export function limparForaDoAr(ids: string[], linhas: LinhaDeEstoque[]): string[];

/** Volta completa da TV, em segundos. `itens * INTERVALO_MS / 1000`. */
export function voltaCompletaEmSegundos(itens: number): number;
```

`posicaoViva` é o que a linha de corte lê — e é por isso que existe separada de
`posicao`. Cortar por `posicao` poria a régua no lugar errado sempre que
houvesse um morto acima dela: hoje o Titano é o **4º** da lista e o **1º** do
banner. Uma tela que mostrasse "vaga 4" ao lado do primeiro slide estaria
mentindo com número.

**"Vivo" tem três condições, e elas moram em dois lugares.** `getEstoque`
aplica as duas primeiras — `estado_cadastro === "publicado"`
(`src/lib/supabase.ts:1017`) e `publicavel(l)` (`:1048`, que hoje reprova quem
tem menos de 4 fotos); `disponiveisDe` (`src/lib/regrasEstoque.ts:57`) aplica a
terceira, e é só `!vendido`.

O módulo **não reimplementa nenhuma das três**: lê o que a página do admin já
resolveu em `LinhaDeEstoque` — `estado`, `vendido` e `bloqueios`. Duas réguas
para a mesma pergunta é precisamente o defeito que
`src/app/admin/estoque/page.tsx` já documenta na contagem de fotos, onde contar
no objeto mapeado em vez de na linha crua fazia a tela escrever "1/8 fotos" ao
lado de um bloqueio dizendo "0 de 8".

`VAGAS.grade` **importa** `VAGAS_NA_GRADE` de `destaquesDaSemana.ts` em vez de
repetir o `6`. Dois seis digitados em arquivos diferentes divergem no dia em
que um deles mudar, e o sintoma seria a tela desenhando a régua numa vaga e a
home cortando noutra.

---

## 5. Os filtros novos em `/admin/estoque`

`FiltroDeEstado` continua sendo o chip de estado. O que entra é um segundo
nível, recolhível, abaixo da régua atual — os chips de estado não mudam de
lugar nem de comportamento, porque são a pergunta mais frequente da tela.

`filtrarLinhas` ganha opções, todas opcionais e todas ausentes por padrão:

```ts
export interface OpcoesDeFiltro {
  estado?: FiltroDeEstado;        // já existe
  busca?: string;                 // já existe
  destaque?: "banner" | "grade" | "tv" | "qualquer" | "nenhum";
  precoMin?: number; precoMax?: number;
  marca?: string;                 // exata, da lista que o estoque tem
  tipo?: string;                  // carroceria, idem
  paradoHaDias?: number;          // diasEmEstoque >= N
  semLead?: boolean;              // leads === 0
  semVisita?: boolean;            // visitas === 0  (ignorado se GA4 mudo)
}
```

Notas que o código precisa carregar:

- **`semVisita` só vale quando há GA4.** A página já sabe disso
  (`visitasDisponiveis`); sem credencial, `visitas` é `null` em toda linha e o
  filtro esconderia o estoque inteiro. Quando `visitasDisponiveis` é falso, o
  controle não é desenhado.
- **`marca` e `tipo` saem do estoque carregado**, não de uma constante. Lista
  fixa ofereceria marca que a loja não tem e esconderia a que ela tem.
  (`CARROCERIAS` de `classificacaoVeiculo.ts` segue sendo a fonte do *select*
  de escrita na barra de ações — são coisas diferentes: lá se grava, aqui se
  filtra.)
- **`destaque: "nenhum"`** é a pergunta inversa e vale tanto quanto a direta:
  *"o que nunca foi destacado?"* — é a lista de onde sai o próximo rodízio.
- **`LinhaDeEstoque` ganha `naTv: boolean`**, irmão de `destacado` e `naSemana`,
  alimentado pela lista nova em `admin/estoque/page.tsx`.
- **Um resumo do recorte** ao lado do contador ("35 publicados · 12 parados há
  90+ dias · 4 no banner"), porque filtro combinado sem resumo é como o
  descarte da §1: some gente e ninguém sabe por quê.

### A barra de ações fica honesta

Enquanto a tela nova não existe, a barra de ações mente por omissão. Três
mudanças pequenas nela, independentes do resto:

1. Os botões ganham o destino e o teto no rótulo: **"Destacar na home (banner ·
   4 vagas)"**, **"Pôr nos destaques da semana (grade · 6 vagas)"**, e o par
   novo **"Pôr na TV do showroom"**.
2. O aviso de lotação, que hoje só existe para a grade
   (`TabelaDeEstoque.tsx:661`), passa a existir para o **banner** — a lista que
   o dono usa e a única sem aviso nenhum. Com atalho:
   *"9 marcados · o banner mostra 4 · [ordenar →]"*.
3. A TV não ganha aviso de lotação, porque não tem teto — ganha o tempo de
   volta completa, que é o seu limite real.

---

## 6. Testes

Vitest, no molde de `tests/destaques-da-semana.test.ts` (dublês magros, só os
campos que a regra lê).

**`tests/destaques-do-painel.test.ts`** — o módulo novo:
- `posicaoViva` ignora os mortos acima — a regressão de fato deste desenho;
- o 5º vivo do banner sai como `fora_do_teto`; o 5º vivo da TV sai como
  `no_ar`, porque `VAGAS.tv` é `null`;
- `moverDestaque` nos dois extremos devolve a lista intacta;
- `limparForaDoAr` preserva a ordem dos que ficam;
- `VAGAS.grade === VAGAS_NA_GRADE` — a trava contra o seis duplicado;
- **um caso com a fotografia real de 2026-09-21** (os 9 ids, 5 mortos): com o
  teto em 4, os quatro vivos ficam `no_ar` e o Toro **deixa de ser cortado**.
  É o caso que, se um dia quebrar, quebra pelo motivo certo.

**`tests/estoque-filtros.test.ts`** — `filtrarLinhas`:
- cada filtro novo isolado, e dois combinados;
- **sem nenhuma opção, devolve tudo** — a trava contra um default que filtre;
- `semVisita` com `visitas: null` não esconde a linha.

**`tests/vitrine-lista-propria.test.ts`** — a separação:
- com `vitrineTv` gravada, a TV lê a dela e **ignora** `carouselVehicleIds`;
- **sem** `vitrineTv`, a TV cai na herança e mostra o que mostra hoje. É o teste
  que protege a janela da §2.2.

**Leiaute**, no molde de `tests/hero-destaque-visivel.test.ts`:
- a régua de indicadores com 4 slides cabe em 343px (§3.3);
- a faixa da TV com 6 células não trunca "Volkswagen Saveiro".

**`tests/sem-beco-sem-saida.test.ts` não é afetado, e isto foi conferido.** A
régua do dono de 2026-09-20 ("nenhum endereço termina em beco") vale para o
endereço **público que não existe** — a lista do teste é explícita e só nomeia
rotas dinâmicas da vitrine (`[marca]`, `[modelo]`, `[ficha]`, `guias/[slug]`,
`estoque/[recorte]`, `destaques/[tag]`) mais a raiz, que cobre o resto do site.
`/admin/site/destaques` é rota **estática e autenticada**: ela sempre casa, não
tem segmento dinâmico para errar, e o corpo da casa (vitrine + formulário de
encomenda) não faz sentido atrás do login. **Nenhum `not-found.tsx` novo.**

---

## 7. Ordem de execução

1. `src/lib/destaquesDoPainel.ts` + testes — TDD, sem tela.
2. `filtrarLinhas` + testes — TDD, sem tela.
3. Os três ajustes da barra de ações (§5, fim). **Entregam valor sozinhos.**
4. A separação da TV: `vitrineTv` em `settings.ts`, o bloco em `/api/settings`,
   o fallback em `vitrine/page.tsx` + os testes da §6.
5. Os dois tetos: banner 3→4 (com a régua responsiva) e `POR_PAGINA` 4→6 (com
   o ajuste tipográfico) + os testes de leiaute.
6. A tela `/admin/site/destaques` + `SidebarNav` (grupo "Site", vizinha de
   "Áreas e conteúdo").
7. O painel de filtros na tabela.
8. **Publicar uma vez na tela nova**, para fechar a janela da §2.2.

Os passos 1-3 já desentopem o dono: com o aviso de lotação e o atalho, ele
descobre *por que* o carro não aparece antes mesmo da tela existir. O passo 5
sozinho já faz o Fiat Toro voltar ao banner.

---

## 8. O que este desenho não faz

- **Não reordena de dentro da tabela de estoque.** Marcar lá continua sendo
  "entra no fim da fila". Quem ordena é a tela nova. Duas portas de ordenação
  divergiriam.
- **Não sobe o banner para 5** nem a TV para 8 — os dois custam redesenho de
  rodapé, e a medição da §3.3 mostra onde cada um quebra.
- **Não migra dados no banco.** A separação da TV é por fallback de leitura
  (§2.2), e a primeira publicação na tela resolve.
- **Não cria rodízio automático por tempo.** O sorteio já cobre o vazio; girar
  sozinho o que foi curado é o oposto de curadoria.
- **Não mexe em `montarDestaquesDaSemana`.** A grade continua com a regra de
  2026-09-09, que está certa e nunca foi exercitada.
