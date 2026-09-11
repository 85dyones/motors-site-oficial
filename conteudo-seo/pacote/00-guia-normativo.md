# Guia Definitivo — Política de Guias e Linkagem Interna
### Motors Store · motorsstore.com.br
**Versão 4** — Pilar 2 sem camada legal, modelo de publicação por ondas

Consolida os seis audits desta série (linkagem interna, visibilidade em IA, estratégia de conteúdo, clusterização de keywords, schema e links quebrados) e o documento de brainstorm de temas.

Este documento é normativo. Quando houver dúvida sobre publicar um tema ou onde colocar um link, a resposta está aqui — e se não estiver, o documento é que precisa ser atualizado.

---

# Parte 1 — Política de temas

## 1.1 A régua

Um tema só entra na fila se passar nos **cinco critérios**. Não é pontuação, é eliminatória: falhou em um, não publica.

**1. Pergunta real, verificada**
Alguém digita isso. Verificado no Search Console (`node conteudo-seo/gsc.js`) ou no Keyword Planner do Google Ads. Nunca por suposição, nunca por estimativa de terceiro.

**2. Cadeira vazia**
Existe um ângulo que **só uma loja que reprova sete de cada dez carros pode escrever**. Se um blog genérico, uma empresa de vistoria ou um escritório de advocacia escreveria igual, o tema não é seu.

Este é o critério que mais reprova, e é o mais importante. A pesquisa mostrou que o espaço de procedência é ocupado por quem vende o exame e por quem vende litígio. Ninguém escreve do lado de quem recusa o carro.

**3. Saída comercial única**
Todo guia termina em **exatamente uma** página do site: `/estoque`, uma listagem, `/avaliacao`, `/financiamento` ou `/garantia`. Se você não consegue nomear a saída antes de escrever, não é um guia — é um post, e post não entra em `/guias`.

Este critério é o que separa conteúdo de comprador de conteúdo de setor. Peça cujo leitor natural é outro lojista reprova aqui, por melhor que seja.

**4. Não canibaliza**
Nenhuma página existente já mira a keyword primária. Se mira, o trabalho é **editar a página existente**, não criar guia novo.

**5. Sobrevive doze meses**
Nada sazonal, nada preso a um veículo específico do estoque.

## 1.2 O que não publicamos

| Categoria | Motivo |
|---|---|
| Definição genérica de crédito no nível nacional | Serasa, SPC e meutudo são intransponíveis. Só entramos pelo recorte operacional ou local |
| "Quanto vale meu carro" no termo puro | FIPE e Webmotors dominam. Entramos por "quanto a **loja** paga" |
| Consórcio, aluguel, assinatura | Produto que não vendemos |
| Leilão como oportunidade | Público oposto à nossa tese. Só tratamos leilão como **risco a identificar** |
| Motors Ciclo | Produto ainda não operacional publicamente |
| Custo de capital, CDI de pátio, margem de revenda | Público é lojista, não comprador. Reprovam no critério 3 — ver 1.7 |
| Qualquer tema cujo ângulo dependa de publicar deságio | Ver 1.3 |

## 1.3 Travas editoriais

**T1 — Deságio de compra.** Publicamos **a lógica**, nunca os multiplicadores. RENAVE, NF-e de entrada, passivo de multas e Renajud com atraso de sistema, tributação sobre revenda, provisionamento de garantia legal, custo de capital imobilizado — tudo isso é conteúdo, e é conteúdo excelente. Percentual sobre FIPE é operação e fica no ERP.

**T2 — Vocabulário da FIPE.** As expressões "abaixo da FIPE" e "desconto" são proibidas na `/avaliacao`, e a regra se estende a **todo conteúdo de lado de compra** que aponte para ela.

O enquadramento correto não é "por que pagamos menos que a FIPE". É **"o que a loja assume quando compra o seu carro"**. Mesmo argumento, centro de gravidade no que é absorvido e não no que é descontado. A FIPE entra como índice mal compreendido, não como referência que estamos furando.

*Pendência aberta: a expressão reapareceu no bloco "COMO A PROPOSTA É FEITA" da `/avaliacao`. Corrigir.*

**T3 — Coerência com as próprias páginas e com o próprio produto.** Nenhum guia pode afirmar algo que contradiga uma página do site **ou criticar uma prática que a casa adota**. Se o guia estiver certo e a página errada, corrige-se a página primeiro. Se o guia critica algo que nós fazemos, o guia é que está errado.

Caso resolvido: a tese "garantia de motor e câmbio é mentira", vinda do brainstorm, atacava o produto da própria casa. Foi descartada. O Pilar 2 passa a ser descritivo — explica as camadas em vez de acusar o mercado.

**T4 — Registro.** Rigor técnico sim, agressividade não. Explicamos como as coisas funcionam; não denunciamos o mercado, não ironizamos o leitor e não nomeamos concorrente. Convenção de mercado se descreve, não se ataca — sobretudo quando é a nossa também.

**T5 — Conteúdo jurídico.** Citamos artigo e jurisprudência, explicamos em linguagem simples, e encerramos encaminhando a Procon ou advogado. Loja não emite parecer.

**T6 — Dados.** Todo número publicado precisa de origem própria e metodologia declarada no texto (recorte, período, tamanho da amostra). Número sem origem não entra, mesmo que seja verdadeiro.

**T7 — Avaliações.** Nunca marcar `AggregateRating` com nota própria.

## 1.4 Os oito pilares

| Pilar | Hub | Estado | Papel |
|---|---|---|---|
| 1. Procedência e perícia cautelar | `/guias/laudo-cautelar-carro-usado` | A criar | Diferencial. Prioridade máxima |
| 2. Garantia e cobertura | `/garantia` (reescrita pronta) | Liberado | Descritivo, não acusatório. Baixa concorrência |
| 3. Mecânica de risco do seminovo moderno | `/guias/motores-turbo-usados-o-que-checar` | A criar | **Novo.** Volume alto, zero revenda escrevendo |
| 4. Crédito e financiamento | `/financiamento` (página existente) | Expandir | Maior causa de perda de lead |
| 5. Quilometragem e depreciação | `/guias/quilometragem-valor-carro` | A criar | 2ª causa de perda + diferencial de compra |
| 6. Vender ou trocar | `/guias/vender-carro-curitiba` | A criar | Alimenta o estoque |
| 7. Comprar em Curitiba | `/estoque` (hub existente) | Otimizar | Comercial, casado com o estoque real |
| 8. Motors Ciclo | — | Congelado | Lançamento futuro |

**Regra de hub:** os pilares 2, 4 e 7 **não ganham guia próprio** — os hubs já existem como páginas do site. Criar guia paralelo é canibalização direta. Só as pontas informacionais viram guia, e todas linkam para o hub.

### Pilar 2 — Garantia e cobertura (reenquadrado)

Duas camadas, e a página `/garantia` é o hub:

1. **Garantia Motors Store** — 3 meses, motor e caixa, sem carência, sem franquia. Padrão do mercado, cumprido sem discussão
2. **Garantia estendida** — seguro de terceiro, registrado na SUSEP, opcional, contratado no ato. *Depende de parceria ainda não fechada*

| Spoke | Query | Dif. |
|---|---|---|
| Garantia de carro usado em loja: o que está coberto | garantia de carro usado de loja | Baixa |
| Garantia estendida em carro usado vale a pena? | garantia estendida carro usado vale a pena | Média |

**T8 — Não fazemos conteúdo educativo sobre garantia legal.** *(decisão editorial)*

A definição de bem durável no CDC é ampla, e trazê-la voluntariamente para material comercial amplia o escopo de expectativa sem contrapartida. As peças deste pilar descrevem **o que a loja entrega** — cobertura, prazo, o que não entra, como acionar. Não enumeram direitos previstos em lei nem explicam artigos.

Isso é escolha de comunicação, não de conformidade. **Nenhuma peça pode afirmar ou sugerir que a garantia contratual é a única cobertura existente**, e nenhum documento de venda pode conter cláusula de renúncia — cláusula desse tipo é nula e cria exposição real, ao contrário da omissão editorial, que não cria nenhuma.

**Fora do pilar por decorrência:** "comprei carro usado com defeito: o que fazer" saiu da fila. Sem tratar direitos, a peça fica oca e não compete com os escritórios de advocacia que dominam a query. Melhor não publicar do que publicar uma versão que não sustenta o próprio título.

**Trava de conformidade para conteúdo sobre garantia estendida:** a contratação é opcional por norma. Nenhuma peça pode sugerir que é condição de preço, de financiamento ou de entrega do veículo. Venda casada é vedada pelo art. 39, I do CDC.

### Pilar 3 — Mecânica de risco (novo)

O território mais promissor que apareceu, e o único em que nenhuma revenda brasileira está escrevendo. Volume de busca real, dificuldade baixa, e amarra direto no critério de captação: é a explicação técnica de por que sete em dez são recusados.

| Spoke | Query | Dif. |
|---|---|---|
| Correia dentada banhada em óleo | correia banhada em óleo problema | Baixa |
| Injeção direta e carbonização de válvulas | carbonização de válvulas injeção direta | Baixa |
| Câmbio de dupla embreagem a seco em usado | câmbio dupla embreagem problema | Média |
| O que a inspeção de loja vê e o que não vê | vistoria mecânica carro usado o que verifica | Baixa |
| Vício oculto: por que a certeza absoluta não existe | vício oculto carro usado | Média |

O material do brainstorm sobre micropartes, fadiga de material e a tabela "inspeção real x inspeção ideal" é a base do último spoke. Aquela tabela, sozinha, é o tipo de ativo que modelo de linguagem cita.

## 1.5 URL e nomenclatura

**Padrão:** `/guias/{slug}`

Não `/blog`. "Blog" sinaliza conteúdo perecível; "guias" sinaliza referência permanente — que é o posicionamento certo e o que faz um modelo de linguagem tratar a página como fonte.

- Slug derivado da keyword primária, sem stopwords, sem data
- Um tema, uma URL, para sempre. Atualiza-se conteúdo e `dateModified`

**Nomes de serviço — pendência a resolver antes de construir rota nova.**
Existem hoje três nomes para coisas parecidas: `/carro-perfeito` (rota), "Garagem Profiler" (nome no site) e "Match de Garagem" (nome na política de privacidade). E há a intenção de criar captura de lead para carro que não está no estoque, sob a ideia "vamos achar o carro perfeito".

São dois serviços diferentes e não podem dividir o mesmo nome:

- **Cruzar perfil com o estoque que existe** → é o `/carro-perfeito` atual. Fixar um nome público único e corrigir a política de privacidade.
- **Buscar carro que não está no estoque** → rota própria (`/encomende-seu-carro`, `/busca-personalizada` ou equivalente).

Enquanto dividirem o nome, a linkagem das páginas sem estoque fica ambígua e o schema de serviço fica errado.

## 1.6 Anatomia de um guia

- **H1** — a pergunta que a pessoa digitou, até 60 caracteres
- **Primeiro parágrafo** — responde em duas frases. É o trecho que vira featured snippet e resposta de IA. Não abrir com contexto
- **3 a 6 H2**, cada um uma sub-pergunta real
- **Tabela sempre que houver comparação.** É o formato que modelo de linguagem extrai melhor
- **Bloco final "o que fazer agora"** com a saída comercial única, uma vez só
- **FAQ de 3 a 4 perguntas**, do mesmo array que alimenta o `FAQPage`
- **Schema:** `Article` + `BreadcrumbList` + `FAQPage`
- **Extensão:** 1.500–2.000 palavras para spoke, 2.500–3.000 para pilar

**Gancho não é título.** Uma tese provocativa é uma abertura excelente e uma URL péssima. Ninguém busca "a ilusão da cautelar" ou "curadoria negativa"; busca "laudo cautelar garante motor" e "o que reprova na perícia". A tese vira o primeiro parágrafo; a query vira o H1 e o slug.

## 1.7 Conteúdo institucional — fora de `/guias`

Material forte cujo leitor natural é o setor, não o comprador. Não vai para `/guias` porque reprova no critério 3, mas não se perde:

| Peça | Destino |
|---|---|
| O custo de carregar ferro: o CDI no pátio | LinkedIn, Instagram institucional |
| A ilusão da FIPE: manifesto de posicionamento | Página institucional ou `/sobre` ampliada |
| RENAVE, NF-e e a formalização do estoque | LinkedIn. Base narrativa do Motors Ciclo |

Estas peças constroem entidade e autoridade de marca — que é problema real, dada a colisão com "Usa Motors" e "ACX Motors". Só não constroem tráfego de comprador.

---

# Parte 2 — Arquitetura de linkagem interna

## 2.1 As oito regras

**R1 — Todo guia linka para o pilar do seu cluster. O pilar linka para todos os spokes.**

**R2 — Todo guia tem exatamente uma saída comercial, e ela aparece uma vez.**
Três CTAs diferentes ao longo do texto diluem os três.

**R3 — Menção nominal vira link.**
"Avaliação Express", "laudo cautelar", "garantia de motor e câmbio", "financiamento", "perícia cautelar" — sempre que aparecerem nominalmente, no corpo ou no FAQ, viram link. Nunca texto puro.

Regra de maior impacto do documento. O bloco de FAQ replicado em cerca de cinquenta páginas cita os três serviços pelo nome e não linka para nenhum. É uma alteração de componente.

**R4 — Ficha de veículo não é beco sem saída.**
Toda ficha linka para: 4 a 6 relacionados, a carroceria, a faixa de preço, o guia de perícia, `/financiamento` e `/avaliacao`.

**R5 — Nenhuma página termina sem saída. Dead-end é bug.**

**R6 — Página sem estoque linka para onde há estoque.**
Modelo zerado linka para a carroceria correspondente, não só para outros modelos zerados. É aqui que entra a captura de busca personalizada.

**R7 — Âncora descreve o destino.**
Nunca "clique aqui", "ver todos", "saiba mais", nem o path da URL.

**R8 — Ficha linka para o guia de mecânica da sua motorização.** *(novo)*
O mapeamento sai de campos que o ERP já tem e que o schema já publica:

| Condição no veículo | Guia linkado |
|---|---|
| 3 cilindros turbo / 1.0 turbo | Correia banhada em óleo · Carbonização |
| Injeção direta | Carbonização de válvulas |
| Câmbio de dupla embreagem | DCT a seco em usado |
| Qualquer veículo | O que a inspeção de loja vê e o que não vê |

Isso resolve dois problemas de uma vez: tira a ficha da condição de beco sem saída e coloca o argumento técnico no exato momento da decisão. Uma ficha de 1.0 turbo que explica por que aquele motor exige óleo na especificação certa — e que a loja verificou isso — vende diferente de uma que não explica.

## 2.2 Matriz por template

| Template | Deve linkar para | Nunca |
|---|---|---|
| **Home** | `/estoque`, 3 faixas de preço, `/avaliacao`, `/financiamento`, `/garantia`, hub `/guias`, destaques vigentes | Campanha sazonal expirada em slot fixo |
| **`/estoque`** | 13 marcas, 7 carrocerias, **3 faixas de preço**, fichas | — |
| **Marca** | Modelos com estoque, carrocerias, faixas, guias via FAQ | Mais de 2 modelos com estoque zero |
| **Modelo (com estoque)** | Fichas, outros modelos da marca, a carroceria | — |
| **Modelo (sem estoque)** | **A carroceria**, captura de busca personalizada, `/estoque` | Só outros modelos zerados |
| **Carroceria** | Fichas, faixas de preço, marcas | — |
| **Faixa de preço** | Fichas, carrocerias, `/financiamento` | — |
| **Ficha de veículo** | 4–6 relacionados, carroceria, faixa, `/financiamento`, `/avaliacao`, `/garantia`, guia de perícia, **guia de mecânica da motorização (R8)** | Um único relacionado sem critério |
| **Guia** | Pilar do cluster, 2–4 spokes irmãos, **uma** saída comercial | Mais de uma saída comercial |
| **`/avaliacao`** | `/estoque`, `/financiamento`, `/garantia`, guia de venda | Terminar sem saída |
| **`/garantia`** | Guia do CDC, guia de vício oculto, `/estoque` | — |
| **Rodapé** | Institucionais + **`/contato`** + hub `/guias` + `/motos` | Módulos que variam entre páginas |

## 2.3 Regra de relacionados na ficha

Cascata, nesta ordem: **mesma carroceria** → **mesma faixa de preço (±20%)** → **mesma marca**. Mínimo 4, máximo 6.

Hoje a ficha traz um relacionado e sem critério — uma picape diesel de R$ 170 mil aparece ligada a um furgão.

## 2.4 Âncoras

| Não | Sim |
|---|---|
| `/estoque` (o path como texto) | `Estoque` ou `Seminovos em Curitiba` |
| `VER TODOS` | `Ver todas as picapes seminovas` |
| `VER TODO O ESTOQUE` (na página de um hatch) | `Ver hatches seminovos em Curitiba` |
| `SAIBA MAIS` | `Como funciona a garantia de motor e câmbio` |

## 2.5 Duplicação de FAQ

O mesmo bloco de quatro perguntas se repete em cerca de cinquenta páginas com troca só do substantivo. É conteúdo duplicado em escala.

**Padrão a seguir:** a `/estoque/ate-60-mil` já resolveu — abre com pergunta específica da faixa e mantém as demais genéricas.

**Regra:** primeira pergunta específica do recorte, três genéricas depois. O texto marcado no `FAQPage` precisa ser idêntico ao visível.

---

# Parte 3 — Correções pendentes, em ordem

## Bloqueadores

**1. `motorsstoreoficial.com.br` no ar.** O servidor responde e o robots.txt bloqueia crawler. Verificar com `curl -I` se há 301. Se não houver, configurar — e liberar o robots.txt do domínio antigo, porque o crawler precisa ler o redirect.

**2. E-mail LGPD no domínio antigo.** A `/privacidade` designa `contato@motorsstoreoficial.com.br` como canal de direitos do titular. Criar caixa nova, testar, editar a página, manter forward por 12 meses.

**3. URL de veículo vendido.** O catálogo do Meta aponta para o feed do próprio site, então cada carro vendido é uma URL com anúncio ativo em cima. Testar com `curl -I` numa URL de veículo vendido nos últimos 60 dias.

- **200 com página de "vendido"** — ideal
- **301 para o modelo** — aceitável
- **404** — prioridade máxima

**4. NAP fragmentado.** Mobiauto, NaPista, SóCarrão, Chaves na Mão (corrigir categoria de imóveis para veículos), Receita Federal, Google Business Profile.

**5. Publicar a `/garantia` reescrita.** Copy deck pronto (`motors-store-pagina-garantia.md`), versão 3. A camada 1 sai agora; os blocos `[C2]` ficam fora até a parceria de garantia estendida existir.

Dependência real antes de subir, e ela não é do site: **revisar o contrato de venda.** Cláusula de renúncia a garantia legal é nula e é o único ponto desta frente que gera exposição de verdade. Omitir o assunto na página é decisão editorial legítima; ter a cláusula no contrato não é a mesma coisa.

## Produto — bloqueia a Onda 1

**6. Publicar o resultado da perícia na ficha do veículo.**

Spec completo em `motors-store-bloco-resultado-pericia.md`.

**O laudo em PDF não vai para o site** — traz nome, CPF e endereço do proprietário anterior, dado de terceiro que não é nosso para publicar. O que vai é o **resultado técnico estruturado**: data, empresa, número do laudo, os três eixos com status, e os apontamentos descritos.

É melhor que o PDF: legível no celular, indexável pelo Google, comparável entre veículos e alimenta schema. E declarar por que o documento completo não está publicado é, em si, sinal de cuidado.

Dependência: o resultado precisa existir como campo estruturado no ERP, transcrito na entrada do veículo. Esse mesmo registro é o que falta para a peça 8 ganhar contagem por motivo na segunda edição.

## Linkagem

**7. CTAs da ficha viram `<a href>`.** As 36 fichas dão zero link contextual para `/financiamento` e `/avaliacao`.

**8. Menção nominal vira link no componente de FAQ.** Cerca de cinquenta páginas, uma alteração.

**9. Relacionados de 1 para 5, com a cascata do 2.3.**

**10. Mapeamento motorização → guia na ficha (R8).**

**11. Módulo de faixa de preço na home e no `/estoque`.**

**12. `/avaliacao` ganha breadcrumb e bloco de saída.**

**13. `/contato` e hub `/guias` no rodapé. Hub `/motos`.**

**14. Trocar o destaque sazonal expirado da home.**

## Técnico

**15. Revalidação do ISR.** Produziu link para rota inexistente e contagens divergentes entre páginas.

**16. Nó `#dealer` do schema.** As 36 fichas referenciam `https://motorsstore.com.br/#dealer`. Confirmar que existe na home.

**17. Breadcrumb da ficha.** Item de posição 4 tem nome do veículo e URL do modelo.

**18. Array de imagens no `Car`.** 22 fotos por veículo, uma declarada.

---

# Parte 4 — Modelo de publicação

## 4.1 Ondas, não semanas

Guia não é post. Não há sinal de frescor a preservar, não há penalidade por volume em conteúdo substantivo, e o relógio de ranqueamento — de três a seis meses — começa na publicação. Escalonar por semanas atrasa metade do portfólio em um trimestre sem ganhar nada.

Três razões concretas para publicar em bloco:

- **O grafo de links só fecha com o cluster inteiro.** Publicar spoke a spoke significa voltar dez vezes para inserir link nas peças antigas. A regra R1 é impraticável em drip.
- **Autoridade tópica é avaliada por seção**, não por página. Cluster completo diz "este site cobre o assunto"; peças soltas não dizem nada.
- **Recuperação por IA ignora cadência.** Só olha se o corpus existe e é recuperável — que foi o pior resultado dos audits.

E o argumento que normalmente justifica o drip não se sustenta aqui: o Search Console leva de quatro a oito semanas para dar sinal útil. Num calendário de doze semanas, a peça da semana oito seria escrita antes de o dado da semana um significar algo. O drip cobra o custo do atraso sem entregar o aprendizado.

**O único limite real é qualidade.** A estratégia se apoia no critério 2 — o ângulo que só a casa pode escrever — e isso exige input próprio peça a peça. A onda é o portão de qualidade; o intervalo entre ondas é tempo de produção, não cronograma de SEO. Se três ondas ficarem prontas no mesmo mês, publicar no mesmo mês é melhor.

## 4.2 As ondas

### Onda 0 — Estrutura
*Pré-requisito: nenhum. Rápida.*

- Rota `/guias` e hub da seção
- Links no rodapé e na navegação
- Schema `Article` + `BreadcrumbList` + `FAQPage` no template
- R8 na ficha de veículo: mapeamento motorização → guia
- `/garantia` reescrita (camada 1 + nota legal)

> Hub vazio não é problema. Hub linkando para página que não existe é — cai direto no relatório de links quebrados. Publicar a estrutura **antes** da Onda 1, nunca junto.

### Onda 1 — Procedência
*Pré-requisito: **resultado da perícia publicado na ficha** (ver Parte 3, item 6). Saída: `/estoque` e `/avaliacao`.*

> ⚠ **Bloqueador.** As oito peças afirmam que o resultado da perícia está publicado na ficha. Nenhuma pode subir antes de a funcionalidade estar no ar. É a única dependência de produto da onda inteira.

| Peça | Papel |
|---|---|
| Laudo cautelar: o que verifica e o que não verifica | **Pilar** |
| Perícia cautelar em Curitiba: onde, quanto custa, quanto demora | Local, dificuldade baixa |
| Os 7 motivos pelos quais recusamos um carro | **Dado próprio.** Atrai link e citação de IA |
| Aprovado, com apontamento e reprovado | Resolve confusão de base |
| Como saber se um carro passou por leilão | Volume alto |
| Chassi remarcado: quando é legal e quando é fraude | Nuance técnica. Referenciado pelo pilar |
| Laudo cautelar x vistoria de transferência | Comparação, formato tabela |
| Meu carro reprovou na cautelar. Quem compra? | Conversão em `/avaliacao` |

### Onda 2 — Mecânica e garantia
*Pré-requisito: `/garantia` no ar. Saída: `/estoque` e `/garantia`.*

| Peça | Papel |
|---|---|
| Motores turbo de baixa cilindrada: o que checar | **Pilar** |
| Correia dentada banhada em óleo: por que ela falha | Volume alto, zero revenda escrevendo |
| Carbonização de válvulas em injeção direta | Par técnico |
| Câmbio de dupla embreagem em usado | Média dificuldade |
| Vício oculto: por que certeza absoluta não existe | Ponte para garantia |
| Garantia de carro usado em loja: o que está coberto | Descritivo. Tom da T4, escopo da T8 |

> **Garantia estendida vale a pena em carro usado?** entra nesta onda **apenas se** a parceria estiver assinada. Sem produto, a peça não tem saída comercial e reprova no critério 3.

### Onda 3 — Quilometragem e lado de compra
*Saída: `/avaliacao` e listagens.*

| Peça | Papel |
|---|---|
| Quilometragem e valor do carro | **Pilar** + ferramenta km × desvalorização |
| Carro com quilometragem alta vale a pena? | 2ª causa de perda de lead |
| A falácia do carro de garagem pouco rodado | Contrarian. Inverte o cluster |
| Quantos km por ano é normal | Hodômetro e adulteração |
| Por que o seu carro vale menos do que você acha | **Estudo de dados nº 2.** Sujeito a T1 e T2 |
| O que a loja assume quando compra o seu carro | **Sujeito a T1 e T2** |
| Vender sozinho ou para a loja: o que muda além do preço | Segurança física e jurídica |
| Onde vender meu carro em Curitiba | Local |
| Documentos para vender carro | Inclui comunicação de venda ao Detran-PR |

> **Os dois estudos de dados.** A Onda 1 publica a recusa **técnica** — o que há de errado no carro. A Onda 3 publica a recusa **comercial** — quantas avaliações não fecham porque o valor esperado pelo dono não encontra o mercado. São amostras separadas, nunca somadas, e cada peça declara a sua.
>
> A segunda é a de maior efeito comercial das duas: ela qualifica o lead antes do clique, que é o objetivo declarado da frente inteira. Quem lê e ajusta a expectativa chega na avaliação pronto para conversar; quem lê e desiste economiza o tempo de todo mundo.
>
> **Enquadramento obrigatório (T4):** a peça explica **de onde vem** a expectativa — FIPE lida como piso, preço de anúncio confundido com preço de venda, valor de compra lembrado como referência, apego. Nunca sugere que o dono está sendo ganancioso ou ingênuo. O alvo é o mecanismo, não a pessoa.

### Onda 4 — Crédito
*Depois de o domínio ter autoridade de tema.*

Autônomo e MEI · financiamento sem entrada · carro como entrada · e, por último, **score baixo** — a maior dor comercial e a maior dificuldade da lista, e apenas pelo recorte que os bureaus não conseguem escrever: o que acontece quando a mesma proposta vai para cinco bancos.

## 4.3 Ao publicar cada onda

- [ ] Todos os links internos entre as peças da onda conferidos antes do deploy
- [ ] Hub `/guias` atualizado com as peças novas
- [ ] Sitemap regenerado e submetido
- [ ] Inspeção de URL no Search Console para o pilar da onda
- [ ] Rich Results Test em uma peça de cada tipo

# Parte 5 — Medição

Com os scripts em `conteudo-seo/`, o dado é próprio e grátis. Search Console é a fonte de verdade.

**Antes de aprovar tema:** `node conteudo-seo/gsc.js` para confirmar se a query já traz impressão. Query com impressão e sem clique é a fila mais barata que existe — a página já aparece, só não convence.

**Acompanhamento mensal**

| Métrica | Fonte | O que indica |
|---|---|---|
| Impressões nas queries do cluster | GSC | Se o tema está sendo reconhecido |
| Posição média por guia | GSC | Se o cluster está amadurecendo |
| Queries novas sem página correspondente | GSC | Fila de temas seguinte |
| Links contextuais para `/avaliacao` e `/financiamento` | Crawl | Se R3 e R5 foram aplicadas |
| Páginas com uma única saída | Crawl | Dead-ends remanescentes |

**Marcos**

- **90 dias** — 24 URLs de conteúdo indexadas; primeiras posições em cauda longa de procedência e mecânica; `/avaliacao` e `/financiamento` saindo de zero link contextual
- **180 dias** — orgânico informacional em 30% das sessões; leads de avaliação com origem orgânica

**O KPI que importa mais que todos:** taxa de reprovação de crédito nos leads de origem orgânica **versus** leads de Meta. Se o conteúdo está qualificando antes do clique, é ali que aparece primeiro.

---

# Checklist pré-publicação

**Tema**
- [ ] Passou nos cinco critérios da 1.1
- [ ] Query confirmada no GSC ou Keyword Planner
- [ ] Nenhuma página existente mira a keyword primária
- [ ] O leitor natural é comprador ou vendedor de carro, não lojista
- [ ] Ângulo que só a Motors Store pode escrever, escrito em uma frase

**Texto**
- [ ] H1 é a query, não a tese. A tese está no primeiro parágrafo
- [ ] H1 até 60 caracteres
- [ ] Primeiro parágrafo responde em duas frases
- [ ] Pelo menos uma tabela, se houver comparação
- [ ] Nenhum número sem origem e metodologia (T6)
- [ ] Nenhum multiplicador de deságio (T1)
- [ ] Nenhuma ocorrência de "abaixo da FIPE" ou "desconto" em peça de lado de compra (T2)
- [ ] Nada que contradiga uma página existente do site (T3)
- [ ] Nenhuma agressão ao leitor; nenhum concorrente nomeado (T4)
- [ ] Conteúdo jurídico encaminha a Procon ou advogado (T5)

**Links**
- [ ] Linka para o pilar do cluster
- [ ] Linka para 2 a 4 spokes irmãos
- [ ] **Uma** saída comercial, no bloco final
- [ ] Toda menção nominal a serviço é link
- [ ] Nenhuma âncora genérica

**Técnico**
- [ ] `Article` + `BreadcrumbList` + `FAQPage`
- [ ] FAQ do schema idêntico ao visível
- [ ] URL em `/guias/{slug}`, sem data
- [ ] Adicionado ao hub `/guias` e ao rodapé
- [ ] Validado no Rich Results Test
