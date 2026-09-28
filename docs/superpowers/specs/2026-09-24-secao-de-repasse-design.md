# Seção de repasse (Repasse Motors) — design

**Data:** 2026-09-24 · **Superfícies:** `/repasse`, `/repasse/[carro]` (novas), `/admin/repasse` (nova), `/api/leads`, menu, rodapé, `/estoque` · **Status:** desenho visual aprovado, desenho técnico aprovado, não implementado

**Desenho visual (fonte da verdade do layout e do texto):** artifact Design
`https://claude.ai/artifact/HT3AksbDXw57LtLBnVeDMp`, versão 5 — 11 pranchas
(página desktop em duas partes, celular em três, ficha desktop, ficha no celular
com a barra fixa, card e estados, página vazia, portas de entrada).

> Pedido do dono, 2026-09-24: *"precisamos criar uma sessão com oportunidades de
> repasse da motors, carros que não possuem garantia da loja, são comprados no
> estado atual. Pesquise sobre a modalidade repasse de carros, ajude a criar algo
> diferenciado para motors, com conteúdo explicativo e otimizada para
> conversões."*

Marcação usada neste arquivo: **MEDIDO** (lido no código ou na web, com a fonte),
**DECIDIDO** (resposta do dono, com a data), **PENDENTE** (falta resposta; não vai
ao ar como afirmação).

---

## 1. O conceito: "Repasse às claras"

Todo concorrente de Curitiba anuncia repasse com um aviso genérico de "sem
garantia". A Motors anuncia o repasse com a conta aberta. Cada carro mostra:

1. **Se tem laudo cautelar** — etiqueta `COM LAUDO` (aprovado, ou aprovado com
   apontamento, e aí o apontamento vem escrito) ou `SEM LAUDO`. Quando tem, o
   laudo **sai a pedido**, antes de qualquer sinal (mesma regra do estoque desde
   16/09: nenhum texto promete laudo publicado).
2. **A conta** — preço à vista, reparo orçado (quando há), "você gasta", FIPE do mês
   e a diferença para a FIPE **em reais**.
3. **A ficha de estado** — os defeitos conhecidos, com foto e orçamento quando
   existe. É a lista que o comprador assina junto com o contrato.
4. **O exame no pátio** — com o mecânico do comprador, em hora marcada.

A página qualifica: diz para quem o repasse **não** serve (quem precisa financiar,
quer garantia ou quer o carro pronto) e manda essa pessoa para o estoque com
garantia. O lead fica na casa; o repasse recebe só comprador à vista.

**MEDIDO (pesquisa de 24/09):** repasse é tradicionalmente B2B, 15% a 35% abaixo
da FIPE, contato quase sempre por WhatsApp; seis ou mais operações dedicadas só em
Curitiba (Repasse Curitiba, Carro Repasse, Repasse São José…); nenhuma publica
motivo, lista de defeitos ou orçamento de reparo. O Repasse São José financia e
vende para PF e PJ (texto do anúncio trazido pelo dono).

---

## 2. Decisões do dono

| Tema | DECIDIDO |
|---|---|
| Público | Consumidor final **e** lojista, em trilhas separadas (24/09) |
| Origem dos carros | Hoje ficam **fora de qualquer sistema** — WhatsApp e grupos (24/09) |
| Preço | Aberto, com FIPE e diferença **em R$** (24/09) |
| Etiquetas | **COM LAUDO · SEM LAUDO · REPARO ORÇADO**. "Fora do perfil" entra nas outras; "veio em lote" não atrai (24/09, revisão do desenho) |
| Linguagem | **Nunca** dizer que um carro "não girou": tira o apelo (24/09) |
| CDC | **Não citar CDC nem direitos do consumidor** — *"cada um que corra atrás da informação"*. Na comparação, só a garantia da loja (24/09) |
| Leilão e sinistro | Sem promessa geral: cada carro declara o seu histórico (24/09) |
| Documento do consumidor | **Ficha de estado** assinada com o contrato. Não é termo de isenção — mantém verdadeira a frase da `/garantia` (24/09) |
| Exame | **Só no pátio**, com o mecânico do comprador (24/09) |
| Pagamento | **Só à vista**, PIX ou TED. Sem financiamento, sem troca (24/09, reconfirmado depois da spec) |
| Laudo | **Aprovado** e **aprovado com apontamento** entram — o apontamento vai escrito na ficha e no card. **Reprovado não entra** no repasse (24/09) |
| Ficha de estado | O modelo passa pelo jurídico antes do primeiro uso (24/09) |
| Abrir para todos | **Manual, por um switch** no painel — sem data marcada de antemão (24/09) |
| `/privacidade` | Texto da §7.4 **aprovado** pelo dono (24/09) — entra no PR 3 |
| Documentação | Documento **sem restrição e sem débito**; **transferência por conta de quem compra** (24/09) |
| Lojista | Aviso antes do site **+** condição de lote **+** atendimento direto com nota no CNPJ (24/09) |
| Quem cadastra | **Qualquer perfil** da equipe cadastra (24/09) |
| Quem valida | **Administrador, Gestor e Comercial** ("gerente" = Gestor, confirmado 24/09) |
| SDR | **Cadastra e não valida** (24/09). O papel entra por outro branch (`integracao/quem-entra-24-09`): quem mesclar por último acrescenta a coluna do SDR às duas linhas da matriz |
| "Só lojistas" no site | O público **vê** o carro com a camada "por enquanto, só para lojistas cadastrados" (24/09, depois da revisão final) |
| Aviso à lista | **Manual, pelo Chatwoot**: o site guarda quem está na lista e o perfil de cada um; o painel mostra quem combina (24/09) |
| Nome | **Repasse Motors**, selo "Repasse às claras", rota `/repasse` (24/09) |
| Menu | `REPASSE` na barra **só a partir de 1281 px**; sempre no menu do celular e no rodapé (24/09) |
| Arquitetura | Tabelas próprias, painel próprio, quatro PRs (24/09) |

---

## 3. Medições que condicionam o desenho

- **`estoque_motors` não serve de casa.** Todo leitor dela (vitrine, hubs, sitemap,
  catálogo da Meta, `llms.txt`, RPCs) teria de aprender a excluir o repasse; um
  esquecido e o carro no estado aparece como "o carro que passou". E o CLAUDE.md
  mantém a tabela intocada até a F2.
- **"Repasse" já tem três sentidos no código** — retirada de investidor
  (`src/lib/investidores.ts`), modalidade de entrada do carro vindo de outro
  lojista (`modalidade_tipo` em `20260829120000_f0a_org_e_enums.sql`,
  `veiculo_entradas.repasse_loja_origem`) e o texto de `src/lib/paginasGeo.ts:55-57`.
  Os nomes novos usam o prefixo `repasse` só em objetos da seção pública e
  **não reusam o enum `modalidade_tipo`**.
- **Fotos:** `processarFotoDeVeiculo` (`src/lib/imageProcessor.ts`) é genérico;
  `caminhoDaFoto` (`src/lib/fotosDoVeiculo.ts`) exige `estoqueId` numérico. O
  bucket `veiculos` aceita escrita de qualquer staff em qualquer pasta e leitura
  pública (`20260829180000_f0p_storage_das_fotos_do_veiculo.sql:62-89`).
  `MINIMO_DE_FOTOS = 4` (`src/lib/coerenciaDoCadastro.ts:224`).
- **FIPE:** não há cliente no servidor. A `/avaliacao` consulta direto
  `https://parallelum.com.br/fipe/api/v1` no navegador
  (`src/components/AutoAvaliacao.tsx`) e grava `fipe_valor`, `fipe_codigo`,
  `fipe_mes_referencia`.
- **Leads:** `leads.veiculo_id` é `bigint` (`20260807210000_leads.sql:60`), não
  cabe o id de um repasse; não há coluna jsonb livre. `intencao_busca` só viaja
  no payload do n8n. `ACOES_DE_LEADS` é lista fechada
  (`src/lib/turnstile.ts`), e ação fora dela dá 403 silencioso no `siteverify`.
  `TipoDeLead` (`src/lib/dataLayer.ts:588`) — a convenção da Encomenda é reusar
  `"curadoria"` porque a tag do GTM não conhece valor novo.
- **Menu:** 59 px de folga em 1024 px (docblock de `src/lib/menuDoCabecalho.ts`);
  um item novo custa rótulo + 16 px (1024–1280) ou + 28 px (1281+). `CONTATO` já
  usa `hidden 2xl:block` em `src/components/Header.tsx`.
- **Carência do vendido:** `CARENCIA_VENDIDO_DIAS = 90` (`src/lib/publicacao.ts:30`).
- **Horário da loja:** `HORARIO` em `src/lib/paginasGeo.ts:43` e
  `openingHoursSpecification` em `src/lib/schemaLoja.ts:278`.
- **JSON-LD da ficha** sai de uma função testada (`src/lib/grafoDaFicha.ts` +
  `tests/ficha-publica-o-grafo.test.ts`), nunca montado no JSX.
- **Travas de texto:** `tests/paginas-institucionais.test.ts` varre todo `.ts/.tsx`
  público atrás de "N meses" perto de "garantia"; `tests/textos-sem-marcas-de-ia.test.ts`
  só alcança o que é importado nele — um arquivo novo de texto precisa ser somado
  à lista.

---

## 4. Dados

Uma migração aditiva (PR 1), no padrão da casa: cabeçalho explicando a decisão,
`org_id uuid not null default public.org_padrao()`, RLS com policy por papel,
bloco de aceite (`DO $$ … $$`) e rodapé de auto-registro no livro-razão.
**Ensaio com ROLLBACK antes; `--gravar` só com ordem explícita do dono.**

### 4.1 `repasses`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `org_id` | `uuid` | `default org_padrao()` |
| `slug` | `text unique not null` | `marca-modelo-versao-ano-<6 do id>`, normalizado |
| `marca`, `modelo`, `versao` | `text` | marca e modelo obrigatórios |
| `ano_modelo`, `ano_fabricacao` | `smallint` | `ano_modelo` obrigatório |
| `quilometragem` | `integer not null` | |
| `cambio`, `combustivel`, `cor` | `text` | |
| `carroceria` | `text` | `check in ('hatch','seda','suv','picape','outro')` — casa com o perfil da lista |
| `preco` | `numeric(12,2) not null` | `check (preco > 0)` |
| `fipe_valor` | `numeric(12,2)` | |
| `fipe_codigo`, `fipe_mes_referencia` | `text` | mês por extenso, como a API devolve |
| `laudo` | enum `laudo_do_repasse` (`aprovado`, `aprovado_com_apontamento`, `nao_feito`) | **nulo até alguém escolher** — publicar exige escolha explícita. Não existe `reprovado`: carro reprovado não entra (DECIDIDO 24/09) |
| `laudo_apontamento` | `text` | obrigatório quando `aprovado_com_apontamento`; aparece no card e na ficha |
| `leilao_consta`, `sinistro_consta` | `boolean` | nulos até informar |
| `leilao_detalhe`, `sinistro_detalhe` | `text` | obrigatório quando `consta = true` |
| `historico_consultado_em` | `date` | |
| `resumo` | `text` | linha do card, até 140 caracteres |
| `motivo` | `text` | parágrafo "Por que está no repasse" da ficha |
| `itens_de_estado` | `jsonb not null default '[]'` | `check (jsonb_typeof = 'array')`; item = `{descricao, local, foto, orcamento \| null, estetico}` |
| `sem_defeitos_conhecidos` | `boolean not null default false` | alternativa explícita à lista vazia |
| `oficina_do_orcamento` | `text` | obrigatória quando algum item tem orçamento |
| `orcamento_em` | `date` | idem |
| `web_full_images`, `whatsapp_images` | `jsonb not null default '[]'` | mesmos nomes do estoque, para reusar galeria e card |
| `situacao` | enum `situacao_do_repasse` | ver §5 |
| `lojistas_desde`, `aberto_ao_publico_em` | `timestamptz` | "só lojistas" = publicado **e** `aberto_ao_publico_em is null`; o switch "abrir para todos" grava `now()` |
| `reservado_em`, `vendido_em`, `arquivado_em` | `timestamptz` | |
| `criado_por`, `validado_por` | `uuid` | |
| `enviado_em`, `validado_em` | `timestamptz` | |
| `devolvido_com` | `text` | nota de quem devolve para rascunho |
| `created_at`, `updated_at` | `timestamptz` | trigger de `updated_at` |

Derivados em código (lib pura, testada), nunca coluna:
`reparo_orcado = soma de itens_de_estado[].orcamento`;
`voce_gasta = preco + reparo_orcado`;
`abaixo_da_fipe = fipe_valor - voce_gasta`;
etiqueta = `REPARO ORÇADO` se `reparo_orcado > 0`, senão `COM LAUDO` (aprovado ou
aprovado com apontamento) ou `SEM LAUDO`.
Os filtros da página **não são exclusivos**: um carro com laudo e reparo entra em
"Com laudo" e em "Reparo orçado".

**RLS.** Staff (`is_staff`) lê e escreve; a validação é conferida na rota (§5),
não na policy. `anon` lê só `situacao in ('publicado','reservado','vendido')`, com
**privilégio por coluna** (`revoke select … from anon` + `grant select (colunas
públicas) … to anon`): ficam de fora `criado_por`, `validado_por`, `enviado_em`,
`validado_em`, `devolvido_com`. Autoconferência no fim da migração, como a de
`site_settings` (`20260812120000`): nenhuma policy de escrita para `anon`/`public`.
A carência do vendido é aplicada no código, como no estoque.

### 4.2 `repasse_inscritos` (a lista do repasse)

`id`, `org_id`, referência ao lead gravado, `trilha` (`consumidor` \| `lojista`),
`nome`, `whatsapp`, `faixa` (as quatro faixas do formulário), `carrocerias text[]`,
`cnpj`, `loja_cidade`, `cnpj_conferido_em`, `cnpj_conferido_por`, `created_at`.
**Sem leitura anônima.** Inserção só pela rota de leads (chave de serviço); staff
lê, atualiza e apaga.

**Sair da lista apaga a linha** (e, em cascata, os avisos dela). Não há "inativo":
é o que a `/privacidade` promete na §7.4, e a tela de inscritos (§6) é o executor
dessa promessa. O lead de contato segue a regra geral de retenção.

**DECIDIDO (24/09):** o dono escolheu que "o site guarda quem está na lista e o
perfil de cada um". É dado pessoal novo — a `/privacidade` muda antes de o
formulário ir ao ar (esboço na §7.4).

### 4.3 `repasse_avisos`

`repasse_id`, `inscrito_id`, `avisado_por`, `avisado_em`,
`unique (repasse_id, inscrito_id)`. Só staff. Evita avisar duas vezes a mesma
pessoa do mesmo carro.

### 4.4 `leads`

`add column if not exists repasse_id uuid references repasses(id)` — para o lead
do exame no pátio aparecer no painel junto do carro.

### 4.5 Fotos

Sem migração. Pasta `repasse/<repasse_id>/<lote>-<variante>.webp` no bucket
`veiculos`, com `caminhoDaFotoDoRepasse()` novo em `src/lib/fotosDoVeiculo.ts`
(o atual exige id numérico). Foto de defeito usa o mesmo caminho; o item da ficha
guarda a URL `web`. `ehFotoPropria` já reconhece o bucket, então o `next/image`
serve sem otimizador, como no estoque.

---

## 5. Estados, validação e permissões

```
rascunho ──enviar──▶ em_validacao ──validar──▶ publicado ◀──▶ reservado
   ▲                     │                        │               │
   └──────devolver───────┘                        └──▶ vendido ◀──┘ ──▶ arquivado
```

| Ato | Quem | Regra |
|---|---|---|
| Criar e editar rascunho | qualquer perfil | — |
| Enviar para validação | qualquer perfil | exige o checklist completo |
| Devolver para rascunho | validadores | exige `devolvido_com` |
| Validar e publicar | Administrador, Gestor, Comercial | escolhe **"só para lojistas"** (grava `lojistas_desde = now()`) ou **"aberto a todos"** (grava as duas datas com `now()`) |
| Abrir para todos | Administrador, Gestor, Comercial | **switch manual** no editor, sem data marcada; grava `aberto_ao_publico_em = now()`. Não volta atrás |
| Editar carro publicado | validadores | quem não valida pede a um validador que devolva o carro para rascunho |
| Reservar, vender | validadores | `vendido` fica na página por `CARENCIA_VENDIDO_DIAS` e depois some sozinho — a regra é de código, como no estoque |
| Arquivar | validadores | ato manual, para tirar um carro antes da carência ou desistir do repasse |

Duas linhas novas em `MATRIZ_DE_PERMISSOES` (`src/lib/permissoes.ts`), na ordem
`[admin, gestor, marketing, comercial, financeiro]`:

- "Cadastrar carro de repasse" — `[faz, faz, faz, faz, faz]`
- "Validar e publicar repasse" — `[faz, faz, nao_ve, faz, nao_ve]`

**Checklist para enviar** (`checklistDoRepasse()`, lib pura com testes): pelo
menos `MINIMO_DE_FOTOS` fotos; marca, modelo, ano, km, carroceria e preço;
`fipe_valor` e `fipe_mes_referencia`; `laudo` escolhido, com `laudo_apontamento`
quando aprovado com apontamento; `leilao_consta` e
`sinistro_consta` informados, com detalhe quando `true`, e
`historico_consultado_em`; `resumo` e `motivo`; ao menos um item na ficha de
estado **ou** `sem_defeitos_conhecidos`; **todo item com foto**; havendo
orçamento, `oficina_do_orcamento` e `orcamento_em`; `resumo` e `motivo` sem os
termos proibidos da §9 (a regra do dono vale para o texto digitado no painel,
não só para o texto fixo).

---

## 6. Painel — `/admin/repasse`

Item "Repasse" no `SidebarNav`. Gate de papel repetido em cada tela, como o resto
do painel; campo que o perfil não grava não é renderizado.

| Tela | Quem abre, quando | Decisão que sai dela |
|---|---|---|
| **Lista** `/admin/repasse` — abas por situação, contagem, "aguardando validação" no topo para validadores | Comercial e Gestor, todo dia | validar, reservar, vender, arquivar |
| **Editor** `/admin/repasse/novo` e `/[id]` — dados, consulta FIPE, fotos, ficha de estado (linhas com foto e orçamento), histórico, textos, painel do checklist, botões por permissão | Quem decide mandar um carro para o repasse, na hora em que decide | enviar para validação; devolver; publicar |
| **Inscritos que combinam** (dentro do editor de um carro publicado) — lojistas primeiro enquanto "só lojistas", depois consumidores cuja faixa e carroceria casam; mensagem pronta para copiar e botão "avisado" | Comercial, logo depois de publicar e de novo depois de ligar o switch "abrir para todos" | quem avisar no Chatwoot; quando abrir para todos |
| **Inscritos** `/admin/repasse/inscritos` | Comercial, quando entra lojista novo ou alguém pede para sair | marcar CNPJ conferido; tirar alguém da lista (apaga o perfil) |

A consulta FIPE sai de `AutoAvaliacao.tsx` para uma lib reusável
(`src/lib/consultaFipe.ts`: marcas → modelos → anos → valor), chamada no
navegador como hoje. O valor fica editável; o mês vem da API.

---

## 7. Site público

### 7.1 `/repasse`

Server component, `revalidate = 60`. Ordem das seções igual às pranchas "Página
/repasse" do Design: herói escuro com o seletor de trilha, faixa das quatro provas,
lote, faixa "precisa financiar?", "já saíram", a conta aberta (com o exemplo de
sinistro declarado), tabela repasse × estoque, "serve para você?", como comprar,
lista do repasse, perguntas, rodapé.

- **Lote:** ilha cliente `LoteDoRepasse` recebe os carros já lidos no servidor;
  os filtros (Todos, Com laudo, Sem laudo, Reparo orçado) e a ordenação agem no
  cliente, e o HTML inicial traz todos os cards com seus links (o problema medido
  do `useSearchParams` servir zero link não se aplica).
- **Card "só para lojistas":** aparece para todos com a camada "Só para lojistas ·
  por enquanto, só para lojistas cadastrados", o botão "Cadastrar meu CNPJ" e o
  link "Avise quando abrir para todos", que leva à lista na trilha consumidor
  (prancha "Card do repasse e estados"). Sem data: abrir é manual.
- **Vazio:** sem carro publicado, a página vira a prancha "Página /repasse sem
  carro aberto" — lista do repasse, "já saíram" e três carros do estoque com
  garantia. Nunca beco.
- **JSON-LD:** `BreadcrumbList`, `ItemList` dos carros abertos, `FAQPage`,
  `AutoDealer` e `WebSite`, por `blocoJsonLd`.

### 7.2 `/repasse/[carro]`

`revalidate = 60`, `dynamicParams = true`. Prancha "Ficha do carro de repasse":
galeria (com fotos de defeito marcadas), a conta, os dois botões (WhatsApp e
"marcar exame no pátio"), por que está no repasse, ficha de estado, histórico e
documentos (laudo — "aprovado", "aprovado com apontamento: \<texto\>" ou "não
feito" —, leilão, sinistro, documento, transferência, data da consulta),
"o que não vem", o formulário do exame e três parecidos do estoque com garantia
(mesma faixa de preço ou carroceria, `CardVeiculo`). No celular, barra fixa com
preço, diferença para a FIPE e "Quero este".

- **Exame no pátio:** os dias oferecidos são os próximos três dias de loja aberta
  e os turnos são manhã e tarde, calculados do horário que já está no código
  (`HORARIO` e `openingHoursSpecification`) — sem segunda fonte de horário.
- **Grafo:** `grafoDoRepasse()` (`Car` + `Offer` em BRL, `itemCondition`
  `UsedCondition`, `availability` `InStock` / `SoldOut`; `BreadcrumbList`,
  `AutoDealer`, `WebSite`) + teste no molde de `ficha-publica-o-grafo`.
- **Vendido:** a ficha fica no ar pela carência com "VENDIDO", a lista do repasse
  e os parecidos. **Arquivado ou inexistente:** `not-found.tsx` com
  `NaoEncontradoNoEstoque` e a lista do repasse no lugar da encomenda.
- **Sitemap:** `/repasse` e as fichas publicadas e reservadas, numa leitura
  paralela a mais em `src/app/sitemap.ts`, com o próprio `.catch()`.

### 7.3 Textos

Todo texto fixo da seção vive em `src/lib/paginaDoRepasse.ts`, transcrito das
pranchas da versão 5 do Design. A garantia do estoque só aparece pelas constantes
de `src/lib/paginasInstitucionais.ts` ("três meses ou 5.000 quilômetros, o que
vier primeiro"). Nada sobre CDC ou direitos. Laudo sempre "sai a pedido".
**Exceção ao Design:** a linha de consentimento dos formulários da lista é a da
§7.4, não o "Ao enviar, você concorda com a política de privacidade" das pranchas.

### 7.4 `/privacidade` — texto aprovado

A lista do repasse é dado pessoal com finalidade nova (aviso por WhatsApp), então
a política muda **antes** de o formulário ir ao ar — a mesma régua do registro de
erros de 11/09. Quatro inserções em `src/app/privacidade/page.tsx`, no tom da
página. **APROVADO pelo dono em 24/09.**

**Em "Quais dados coletamos"**, depois do parágrafo dos formulários:

> **Quando você entra na lista do repasse.** Pedimos nome e WhatsApp, a faixa de
> preço e os tipos de carro que você procura. Se você é lojista, pedimos também o
> CNPJ, o nome da loja e a cidade.

**Em "Para que usamos"**, item novo:

> **Avisar sobre carros de repasse.** Quem está na lista recebe pelo WhatsApp os
> carros de repasse que combinam com a faixa e os tipos informados. Lojistas
> cadastrados recebem o aviso antes de o carro abrir para todos. Quem envia é uma
> pessoa da nossa equipe, não um disparo automático.

**Em "Bases legais"**, item novo:

> **Consentimento** — para a lista do repasse. Você escolhe entrar e pode sair
> quando quiser, pedindo pelo WhatsApp ou pelos canais da seção Como falar conosco.

(O comentário do código nessa seção registra que o item "Consentimento" saiu em
31/08 porque os cookies deixaram de depender dele. Ele volta com outra
finalidade; o comentário precisa dizer isso.)

**Em "Por quanto tempo guardamos"**, parágrafo novo:

> **Os dados da lista do repasse** ficam guardados enquanto você estiver na lista.
> Quando você sai, apagamos a faixa de preço, os tipos de carro e, no caso de
> lojistas, o CNPJ e os dados da loja. O registro de contato segue a regra do
> parágrafo acima.

**Linha de consentimento nos formulários da lista** (substitui a das pranchas):

> Ao entrar na lista, você aceita receber avisos de repasse pelo WhatsApp e pode
> sair quando quiser. [Política de privacidade](/privacidade#dados).

O formulário do **exame no pátio** não é lista: mantém a linha atual, porque o
dado serve só para marcar o horário (execução de procedimentos preliminares, base
que a página já declara).

---

## 8. Leads e rastreamento

| Formulário | `canal` | Grava | `formId` |
|---|---|---|---|
| Lista, trilha consumidor | `repasse` | lead + `repasse_inscritos` (faixa, carrocerias) | `form-lista-repasse` |
| Lista, trilha lojista | `repasse-lojista` | lead + `repasse_inscritos` (CNPJ, loja e cidade) | `form-lista-repasse-lojista` |
| Exame no pátio | `repasse-exame` | lead com `repasse_id`; dia, turno e "leva mecânico" no `interesse` | `form-exame-repasse` |

- **Uma porta só:** tudo entra por `/api/leads`. O corpo leva
  `intencao_busca.repasse` estruturado; a rota, quando o canal começa com
  `repasse`, valida com função pura e grava `repasse_inscritos` ou `repasse_id`.
  Mudança **aditiva** — nenhum campo existente muda de sentido.
- **Turnstile:** `ACOES.repasse = "repasse"` em `ACOES` e em `ACOES_DE_LEADS`,
  com o par de testes do molde `campanha-cta` (a lista contém a ação; cada
  formulário declara `action={ACOES.repasse}`).
- **Montagem do payload** em lib pura (`src/lib/leadDoRepasse.ts`), no molde de
  `src/lib/encomenda.ts`: testável sem DOM. Componentes no molde de
  `EncomendaDeCarro.tsx`: `eventId` antes do POST, `agUid`/UTM/`fbp`/`fbc` lidos
  no envio, `captchaBloqueado` separado de `erro`.
- **Conversão:** `trackLeadSubmission(…, { tipoDeLead: "curadoria", formId })`
  só depois do 2xx — `curadoria` pela convenção da Encomenda; o `formId`
  distingue. Nenhum evento existente é renomeado.
- **WhatsApp:** `BotaoWhatsApp` com `origem` `repasse-card`, `repasse-ficha`,
  `repasse-barra` e `repasse-perguntas`; mensagem de `mensagemDoRepasse()` e
  `mensagemDeExameNoPatio()` novas em `src/lib/mensagensDoVeiculo.ts`, com a
  referência do carro para o atendente achá-lo no painel. `tests/pre-voo-das-conversoes.test.ts`
  continua valendo: nenhum `wa.me` fora de `trackContactClick`.
- **Sem `view_item`/`ViewContent` com id de repasse:** esses ids não existem no
  catálogo da Meta; entraria dado órfão. Fica para quando houver catálogo próprio.

---

## 9. Travas de teste

Cada trava nasce provada: o teste precisa **reprovar** com o defeito real
inserido antes de ser confiado (regra `trava-so-vale-se-reprovar`).

- `tests/pagina-do-repasse.test.ts` — sobre `paginaDoRepasse.ts`:
  - proíbe `gir(ou|ar)`, `fora do perfil`, `veio em lote`, `direito`, `consumidor`,
    `CDC`, `código de defesa`, `premium`, `exclusiv`, `melhor preço`,
    `consulte-nos`, `a partir de R$`, `de cada dez`, `três em dez`, `%`;
  - toda menção à garantia do estoque usa a constante;
  - todo "laudo" vem com "a pedido".
- A mesma lista (`TERMOS_PROIBIDOS_DO_REPASSE`) é usada pelo checklist do painel
  para barrar `resumo` e `motivo` digitados.
- `paginaDoRepasse.ts` entra na lista de `tests/textos-sem-marcas-de-ia.test.ts`
  e as perguntas entram em `tests/links-no-texto-do-faq.test.ts`.
- `checklistDoRepasse`, a conta derivada e a etiqueta: testes de lib pura.
- `grafoDoRepasse`: conta e confere os nós.
- Turnstile: o par de testes da §8.

---

## 10. Portas de entrada e texto existente

- **Menu:** `{ href: "/repasse", rotulo: "REPASSE" }` depois de `ESTOQUE`; na barra
  com `hidden desktop:block` (1281 px+), sempre no menu do celular. **Remedir no
  Chrome** e reescrever a tabela do docblock de `menuDoCabecalho.ts` antes de
  mesclar.
- **Rodapé:** "Repasse" na coluna Comprar.
- **`/estoque`:** faixa escura depois da grade — só quando há ao menos um carro
  aberto; sem carro, a faixa não aparece (nada de promessa vazia).
- **Home:** faixa clara com três carros, só com três ou mais abertos.
- **`src/lib/paginasGeo.ts:55-57`:** sai a oração "Os outros sete vão para repasse
  antes de chegar à vitrine" — ela faz o leitor supor que o repasse é o carro
  reprovado. O resto da frase não é assunto desta spec.
- **Guia 07, item T3:** a frase da `/garantia` ("na venda ao consumidor, não
  pedimos termo de isenção") segue verdadeira, porque a ficha de estado não é
  termo de isenção. Fechar o item no `.md` do guia.

---

## 11. PENDENTE

1. **Revisão jurídica do modelo da ficha de estado** — decidida (24/09), é tarefa
   da loja antes do primeiro carro vendido, não do código.

Respondidas em 24/09 e já incorporadas acima: pagamento só à vista; abrir para
todos por switch manual; laudo aprovado com apontamento entra, reprovado não;
texto da `/privacidade` aprovado.

---

## 12. Fatiamento

Uma tarefa por PR; cada um só abre com o CI concluído e verde nos cinco jobs e
passa pelo `qa-guardian` antes do merge.

| PR | Conteúdo | Depende de |
|---|---|---|
| 1 · Dados | migração (§4), tipos e leituras em `src/lib/repasse*.ts`, linhas da matriz de permissões, `checklistDoRepasse`, conta derivada, etiqueta, `caminhoDaFotoDoRepasse`, `consultaFipe` extraída, testes | ordem do dono para `--gravar` |
| 2 · Painel | §5 e §6 | PR 1 gravado |
| 3 · Site e leads | §7, §8, §9, e a `/privacidade` da §7.4 no mesmo PR | PR 1 gravado |
| 4 · Portas | §10, com a remedição do menu | PR 3 no ar |

## 13. Fora do escopo

Financiamento no repasse · disparo automático para a lista · catálogo da
Meta/Merchant com os repasses · integração com o núcleo do handoff (F2) · upload
e publicação do PDF do laudo · lances ou negociação pelo site · área logada do
lojista.
