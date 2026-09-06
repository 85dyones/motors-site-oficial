# Busca sob encomenda — design

**Data:** 2026-09-06 · **Origem:** handoff "CTA de captura de lead nas páginas sem estoque" (06/09/2026) · **Status:** desenho aprovado, não implementado

Metade dos hubs de marca e modelo está sem carro, continua indexada, continua
recebendo busca — e termina num link `wa.me` que não deixa rastro. Este
documento troca essa lista de espera passiva por uma oferta ativa: **Busca sob
encomenda**.

O handoff é a fonte do problema e da copy. Onde este desenho diverge dele, a
divergência está marcada e justificada — são seis, e a maior é que **não existe
tabela nova**.

---

## 1. O que a produção diz

Medido em `zwbqmzgnagfeqinqkolp` em 2026-09-06, com a chave de serviço:

```
estoque_motors ........ 110 linhas
  publicado ...........  61      arquivado ... 43      rascunho ... 6
  na vitrine ..........  38      (publicado e não vendido)

leads ................. 14 linhas
```

As marcas sem nenhum veículo à venda batem **exatamente** com a lista do §11 do
handoff:

```
/carros/citroen   /carros/toyota   /carros/mercedes-benz   /motos/jtz   /motos/suzuki
```

O `/carros/citroen` é a maior fonte de impressão não-marca do site (67
impressões, posição 43,7 — Search Console, 18/08 a 04/09) e não tem um Citroën.
A demanda chega e o site não faz nada com ela. O problema do handoff está
confirmado.

### 1.1 Três correções ao handoff, antes de qualquer código

**O projeto Supabase do §7 está errado.** O handoff manda criar a tabela em
`lanatcqpskcmifuxfatn`. A produção é `zwbqmzgnagfeqinqkolp` — confirmado no
`.env.local` e no `CLAUDE.md`, que registra esse ref exato como a ambiguidade
§3.9/§5.6 da `AUDITORIA.md`, resolvida em 2026-08-08. Seguir o §7 ao pé da letra
criaria a tabela num projeto que nunca foi produção.

**O §7 contradiz o §8.** O §8 abre com *"reusar o funil existente, não construir
outro"*, e o §7 propõe tabela e endpoint paralelos. Ver §2.

**O §9 já está feito.** *"O bloco 'Enquanto isso, no estoque de hoje' repete os
mesmos 3 veículos"* deixou de ser verdade em 2026-09-01: a página de modelo
prioriza a mesma marca (`daMesmaMarca`), a de marca prioriza o mesmo segmento
(`doSegmento`). O `/carros/citroen` cai nos 3 genéricos porque **não há nenhum
Citroën** para mostrar — não há vizinho de marca. Nada a fazer aqui.

---

## 2. Arquitetura de dados — nenhuma tabela, nenhum endpoint

O `POST /api/leads` já faz, hoje, tudo que o §8 pede: Turnstile, disparo para o
n8n (`lead-entrada`, que alimenta Evolution API e Chatwoot), gravação em `leads`
com a chave de serviço, CAPI do Meta com dedup por `event_id`, e o `ag_uid` que
liga quem navegou a quem virou lead.

E a tabela `leads` em produção **já tem todas as colunas que o §7 queria criar**:

| §7 pede | `leads` já tem |
|---|---|
| `modelo_desejado` | `modelo_interesse` (text) |
| `ano_min`, `investimento`, `tem_troca`, `prazo` | `respostas_raw` (**jsonb**) |
| `utm jsonb` | `utm_source/medium/campaign/term/content`, `fbclid`, `gclid` |
| `fbp`, `fbc`, `user_agent` | idem, mesmos nomes |
| `status` | `situacao` (default `'novo'`, FK para `funil_etapas.chave`) |
| `consultor`, `atualizado_em` | `responsavel`, `atualizado_em` |
| `observacao` | `observacoes` |
| — | `disponivel_estoque` (boolean) — literalmente "tinha no pátio?" |

**Decisão: reusar.** O argumento decisivo não é economia de schema, é quem lê o
lead. O §13 tira o painel de gestão do escopo ("vai para o `motors-erp`"). Com
tabela nova e sem painel, o pedido cai num lugar que ninguém na loja abre — a
única notificação seria o ping do n8n, e um lead que some quando o WhatsApp
rola é um lead perdido. Em `leads`, ele nasce dentro do kanban A1/A8 que a loja
já usa, com etapa, responsável e desfecho.

### 2.1 O que a rota grava a mais

Quando o corpo do POST traz o bloco `busca_encomenda`:

```
canal ................. "Busca sob encomenda"
modelo_interesse ...... "Citroën C3"        (o carro pedido, legível)
respostas_raw ......... { pagina_origem, marca, modelo_desejado, ano_min,
                          investimento, tem_troca, prazo, observacao }
disponivel_estoque .... false
```

`nome`, `telefone`, `interesse`, `email`, `canal`, `veiculo_id`, `event_id` e
`ag_uid` continuam vindo do caminho que já existe. `situacao` fica no default.

**A gravação das colunas novas é condicionada ao bloco.** Sem ele, a rota
escreve exatamente o que escreve hoje — é o que impede que a ficha de veículo, o
pop-up e o `/contato` mudem de comportamento por tabela (regra 7 do `CLAUDE.md`:
não quebrar o tracking existente).

### 2.2 Migração

**Nenhuma é necessária para a feature funcionar.** As colunas existem e a
gravação usa a chave de serviço, que ignora RLS.

Uma migração **opcional e só de documentação** (`comment on column`) é
recomendada: `respostas_raw`, `modelo_interesse` e `disponivel_estoque` vieram da
ferramenta de marketing que criou a tabela `leads` antes da disciplina de
migrações deste repositório — nenhuma migração as criou e **nenhum código as
lê hoje**. Passar a escrever nelas sem registrar o que elas significam agora é
dívida para quem abrir o banco em seis meses.

---

## 3. Componente

`src/components/BuscaSobEncomenda.tsx`, `"use client"`, renderizado a partir do
server component `PaginaDeEstoque`.

**Por que `"use client"` não viola o critério §12.2** (*"renderizado no HTML do
servidor, não só após hidratação"*): no Next, um client component montado por um
server component é renderizado no servidor na primeira resposta. A diretiva
governa a hidratação e o bundle, não a presença no HTML. O bloco, o título, o
parágrafo e os botões saem prontos para o Googlebot; só a interação do
formulário depende do JavaScript. Isto é travado por teste (§6), não assumido.

### 3.1 Entrada por prop opt-in

`PaginaDeEstoque` é compartilhado por muito mais que os 42 alvos:
`/estoque/[recorte]`, `/financiamento`, `/garantia`, e as páginas de bairro via
`PaginaGeoView`. Mexer no estado vazio dele muda todas elas de uma vez.

Por isso o bloco entra por uma prop nova, opcional. Quem não a passa mantém o
`avisarHref` de hoje, byte por byte. Só `[categoria]/[marca]/page.tsx` e
`[categoria]/[marca]/[modelo]/page.tsx` passam.

```ts
export interface PedidoDeBusca {
  marca: string;              // "Citroën"
  modelo?: string;            // "C3" — ausente na página de marca
  caminho: string;            // "/carros/citroen"
  genero: Genero;             // de generoDoVeiculo — moto é feminino
  modelosConhecidos?: string[];
}
```

A **variante sai de `modelo`**: ausente → página de marca; presente → página de
modelo. Uma regra derivada, não duas props que podem discordar entre si.

### 3.2 Estados

1. **Repouso** — título, parágrafo, botões.
2. **Aberto** — o CTA primário expande o formulário *inline*. Não é modal: o
   §6.2 é explícito, e o modal também esconderia a oferta do HTML servido.
3. **Enviando** — botão desabilitado, campos travados.
4. **Sucesso** — confirmação + "Falar agora no WhatsApp" com o resumo do pedido
   pré-preenchido. Se `tem_troca = sim`, oferece também o `/avaliacao`.
5. **Erro** — mensagem curta e o `wa.me` de hoje como saída. Nunca se perde o
   contato porque o nosso servidor falhou.

### 3.3 Campos

Primeiro passo, quatro visíveis: `nome`, `whatsapp` (máscara BR, 10–11 dígitos),
`modelo_desejado` (pré-preenchido com `{Modelo}` quando houver), `investimento`
(as mesmas faixas do `/estoque`).

Recolhido em "detalhar mais (opcional)": `ano_min`, `tem_troca`, `prazo`,
`observacao` (máx. 300).

**Divergência do §6.3.** O handoff marca `tem_troca` como obrigatório e, duas
linhas abaixo, manda pôr no recolhido tudo que não são os quatro primeiros —
que ele chama de "opcional". Campo obrigatório atrás de um botão que diz
"opcional" produz erro de validação apontando para o que não está na tela.
Aqui `tem_troca` é **opcional**; o gancho com `/avaliacao` sobrevive na tela de
sucesso.

### 3.4 Botões

**Divergência do §5.** A variante A do handoff troca "ver todo o estoque" por
"me ajuda a escolher", e com isso remove da página de marca o único botão
explícito para o catálogo. A **regra 6 do `CLAUDE.md`** é literal: *"'Ver todo o
estoque' sempre acessível"*.

- **marca:** `[Procure esse carro pra mim]` · `[Ver todo o estoque]` · `[Não sei
  qual modelo — me ajuda a escolher]` → `/carro-perfeito`
- **modelo:** `[Procure esse {Modelo} pra mim]` · `[Ver o que tem hoje no
  estoque]`

Classes existentes: `mt-btn`, `mt-btn-primario`, `mt-btn-contorno`, `mt-foco`
(`src/app/modernist.css`). Nada de cor nova — o §10 do handoff descreve o que
essas classes já fazem.

### 3.5 Anti-spam

Ação nova `busca_encomenda` em `ACOES` **e em `ACOES_DE_LEADS`**
(`src/lib/turnstile.ts`). As duas: a segunda lista é a que `/api/leads` aceita, e
sem ela o token volta assinado pela Cloudflare e a rota o recusa com
`action-nao-prevista` — uma falha que parece captcha quebrado e não é. Mais um
honeypot simples, com nome que não colide com coluna de `leads`.

Chaves: as de produção já registradas para `motorsstore.com.br`; em Preview e
Development, as chaves públicas de teste da Cloudflare, declaradas — sem
fallback silencioso, e sem `localhost` no widget de produção (§6.4).

---

## 4. Copy

Tokens: `{Marca}`, `{Modelo}`, `{MarcaModelo}`.

**Marca:**

> ### Sem {Marca} hoje. A gente busca o seu.
> Você diz o modelo, o ano e quanto quer investir. Um consultor procura e volta
> com as opções que encontrar — cada uma pela mesma **perícia cautelar
> independente** por que passa todo veículo antes da vitrine, com o **laudo
> cautelar independente** na ficha assim que aprovado.
>
> **Sem taxa, sem compromisso.**

**Modelo:**

> ### Nenhum {MarcaModelo} no estoque agora. Quer que a gente ache?
> Diz o ano, a versão e o quanto pretende investir. Um consultor procura e te
> chama no WhatsApp com o que encontrar — depois da **perícia cautelar
> independente**, com o **laudo cautelar independente** na ficha assim que
> aprovado.
>
> **Sem taxa, sem compromisso.**

**Painel:** "Busca sob encomenda — {MarcaModelo}"
**Rodapé:** "A Motors Store não cobra pela busca. Você só decide quando o carro
estiver na sua frente, com o laudo cautelar independente."
**Confirmação:** "Recebido. Um consultor vai te chamar no WhatsApp com o que
encontrar."

### 4.1 Perícia e laudo são complementares, não sinônimos

Direção do dono, 2026-09-06: **perícia é o processo de aquisição do laudo**. Não
são termos concorrentes nem intercambiáveis — um é o exame, o outro é o
documento que sai dele. Toda citação ao documento diz **"laudo cautelar
independente"**, por extenso.

O banco já separava os dois e ninguém tinha nomeado a regra:
`estoque_motors.pericia` é o estado do processo, `estoque_motors.laudo_pericia` é
o documento.

As duas expressões aparecem lado a lado de propósito no parágrafo acima: é o que
ensina ao leitor que são coisas diferentes.

**O site ainda não segue essa regra em 13 pontos de copy pública**, mais um caso
de campo trocado. Eles não entram aqui — vão num PR próprio, só de vocabulário,
por decisão do dono em 2026-09-06 (uma tarefa por PR, e o alcance inclui home,
`/estoque`, `/garantia` e o feed XML que alimenta portais externos). A lista
está no §8.

### 4.2 O que a copy não diz

Decisão do dono em 2026-09-06 (§14.1 do handoff): **não citar os canais de
busca.** A versão do handoff — "rede de repasse entre lojistas e desmobilizações
de frota" — sai. O consultor "procura e volta com o que encontrar".

**A copy não crava prazo de resposta** — revisão da decisão do §14.2, tomada em
2026-09-06 durante a implementação.

O dono tinha confirmado "retorno em até 48h úteis". A frase reprovou em
`tests/promessa-publica.test.ts`, trava de 04/09 que proíbe afirmar prazo de
resposta que o sistema não mede — construída depois que *"proposta em menos de
10 minutos"* apareceu em doze superfícies sem nada medindo o tempo.

O levantamento: o funil **mede** tempo até o primeiro contato
(`leads.ultimo_contato_em`, prazo por etapa em `funil_etapas`, card parado
pintado no kanban) — mas em relógio. **"Hora útil" não é calculada em lugar
nenhum**, e é justamente a parte que a promessa qualificava. Somado a isso, o
follow-up de 48h que daria corpo ao número vive no n8n (§8.1) e está fora do
escopo de código.

Decisão do dono: o selo fica em **"Sem taxa, sem compromisso."** O prazo volta
quando houver medição de hora útil. As três alternativas consideradas — trocar
por "em até 2 dias" (que o funil mede e a trava não alcança) ou isentar o
arquivo — foram recusadas: a primeira mantém uma promessa sem o mecanismo, a
segunda abriria a primeira exceção de superfície pública numa lista feita para
arquivo interno.

Proibições herdadas do `/avaliacao`, valendo aqui: não prometer preço, desconto
ou valor abaixo da FIPE; não prometer prazo de entrega; não dizer "garantimos
que encontramos" — o compromisso é procurar e responder; a oferta é sempre do
**consultor**, nunca de um sistema.

### 4.3 Gênero

A copy passa por `generoDoVeiculo` (`um()`, `seminovo()`, `O()`), como as páginas
já fazem. Sem isso, `/motos/suzuki` diria "A gente busca **o** seu" para uma
moto. Os quatro hubs de moto no escopo tornam isso obrigatório, não cosmético.

---

## 5. Escopo de páginas

As 42 do §11: marca e modelo, **carros e motos** (decisão do dono, 2026-09-06,
respondendo ao §14.4). É coerente com a própria lista do §11, que já traz quatro
páginas de moto.

Fora: `/estoque/[recorte]` (carroceria, perfil, faixa) e as páginas de bairro.
Em "SUVs até 60 mil" o visitante não pediu um carro específico — o formulário
perderia o objeto e viraria o `/carro-perfeito`, que já existe.

A lista de 42 não vira constante no código. A regra é
`veiculos.length === 0` na página que passou a prop; o estoque gira toda semana e
a página tem que se virar sozinha nos dois estados. A lista serve ao QA e à
medição do antes/depois.

---

## 6. Testes

| # | Trava |
|---|---|
| 1 | Grade vazia **e** prop presente → bloco aparece no HTML do servidor (`renderToStaticMarkup`). |
| 2 | Grade cheia → bloco não aparece, mesmo com a prop. |
| 3 | Sem a prop → o botão `avisarHref` de hoje continua, idêntico. |
| 4 | "Ver todo o estoque" presente nas **duas** variantes (regra 6). |
| 5 | Moto usa feminino; carro, masculino. |
| 6 | O POST monta `canal`, `busca_encomenda` e o `eventId` compartilhado com o Pixel. |
| 7 | A rota grava `modelo_interesse`/`respostas_raw`/`disponivel_estoque` **só** com o bloco no corpo — PDP, pop-up e `/contato` inalterados. |
| 8 | CAPI ganha `content_category: "busca-encomenda"` sem alterar o evento da ficha. |
| 9 | `busca_encomenda` está em `ACOES` **e** em `ACOES_DE_LEADS`. |
| 10 | Falha do endpoint cai no `wa.me` com o pedido na mensagem. |

Armadilhas conhecidas deste repositório, a respeitar ao escrever os testes:
mutação tem que ser no ponto de chamada (renderizar o componente e contar a
saída, não testar a função isolada); `endsWith("/")` falha no Windows; asserção
que ancora `\n` quebra com CRLF; `indexOf` de −1 passa por ordem válida.

---

## 7. Fora do escopo de código

**§8.4 Google Enhanced Conversions.** O caminho existe em
`src/lib/telemetry.ts:526`, mas está **inerte**: `googleAdsId` e
`googleAdsConversionLabel` estão vazios no painel, e a tag 210 do GTM assume os
eventos. Preencher os dois campos ressuscitaria dupla contagem — é um gesto de
duas linhas no painel, sem aviso nenhum. Tarefa de GTM, não de código.

**§8.1 n8n** — etiqueta `busca-encomenda` no Chatwoot, ping do consultor de
plantão, follow-up de 48h. O repositório entrega o `canal` no payload do
`lead-entrada`; o roteamento roda na instância e é entrega separada.

**§8.2 Captain (Ney)** — treinar o serviço para quando o cliente pedir modelo
fora do snapshot. Vive em `motors-captain`.

**§13 do handoff** — automação da busca, painel de gestão dos pedidos, cobrança
pelo serviço.

---

## 8. Anexo: os 13 pontos do PR de vocabulário

Citam o documento sem "cautelar independente" (10):

```
src/app/page.tsx:81                     src/app/page.tsx:103
src/app/estoque/page.tsx:136            src/app/estoque/[recorte]/page.tsx:132
src/app/garantia/page.tsx:41            src/app/garantia/page.tsx:79
src/app/destaques/[tag]/page.tsx:78     src/app/api/feed/xml/route.ts:101
src/components/CarMatch.tsx:829         src/components/modernist/HeroHome.tsx:174
```

Dizem "laudo cautelar" sem o "independente" (3):

```
src/lib/procedencia.ts:20               src/lib/textoDosHubs.ts:554
src/components/PDPClientWrapper.tsx:1233
```

E um caso que mistura os dois conceitos: `src/lib/supabase.ts:62` grava
`pericia: "Laudo Cautelar Aprovado"` — nome de documento dentro do campo de
estado do processo. O `garantia/page.tsx:79` é o mais sintomático: *"o laudo de
perícia fica na ficha"* trata perícia como adjetivo do laudo.

---

## 9. Divergências do handoff, em uma lista

1. **Projeto Supabase**: `zwbqmzgnagfeqinqkolp`, não `lanatcqpskcmifuxfatn`.
2. **Sem tabela nova e sem endpoint novo**: `leads` + `/api/leads`.
3. **Três botões na variante de marca**, para não perder "ver todo o estoque".
4. **`tem_troca` opcional**, para não esconder campo obrigatório atrás de
   "opcional".
5. **Vocabulário**: perícia é o processo, laudo cautelar independente é o
   documento; "laudo cautelar" e "preço fechado" saem.
6. **Sem citar os canais de busca** (decisão do dono).

E duas partes do handoff que não geram trabalho: o §9 (já implementado em
01/09) e o §8.4 (inerte por decisão de medição).
