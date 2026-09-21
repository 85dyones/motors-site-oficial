# Onda 5 — modelo a modelo: hub primeiro, guia depois

**Data:** 2026-09-21 · **Estado:** aprovado pelo dono, aguardando revisão da especificação

---

## 0. Por que este documento existe

O dono está tocando esta frente com **duas sessões ao mesmo tempo** — uma no Claude Code (com acesso ao repositório, ao banco e ao Search Console) e outra no Claude Chat (sem esses acessos). O risco declarado por ele: *"para não correr o risco de o Claude Code falar algo e o Claude Chat outro"*.

**Este arquivo é a fonte única.** Quem discordar dele está errado até o arquivo mudar. Ele é auto-suficiente de propósito: os números medidos estão transcritos aqui, então a sessão sem acesso não precisa adivinhar nem pedir.

Três categorias, sempre marcadas:

- **MEDIDO** — número apurado, com data e método. Não reescrever de cabeça.
- **DECIDIDO** — escolha do dono ou minha, já fechada.
- **PENDENTE** — falta resposta do dono. **Não vai ao ar enquanto não for respondido.**

---

## 1. MEDIDO — Search Console, 21/09/2026

Fonte: API do Search Console pela conta de serviço (`conteudo-seo/gsc.js`), propriedade `sc-domain:motorsstore.com.br`. Janela pedida: **2026-06-21 a 2026-09-19**.

> A propriedade foi criada e verificada em 21/09/2026. Antes disso **não existia nenhuma propriedade** na conta do dono — qualquer relatório de indexação anterior a esta data veio de outra conta e não serve de base.

**A amostra é de ~1 mês, não de 3.** Apesar da janela de três meses, o gráfico só tem dados **a partir de 18/08/2026**. Tudo aqui é sinal jovem: serve para ordenar prioridade, não para concluir tamanho de mercado.

**Agregado da propriedade** (interface, filtro 3 meses, tipo de pesquisa Web): 100 cliques · 1.560 impressões · CTR 6,4% · **posição média 15,7**.

**O que a API devolve** são os ~100 termos do topo, que somam ~936 impressões e 81 cliques. A diferença para o total é a cauda longa e as consultas que o Google anonimiza — é esperado, não é erro.

**O achado que ordena tudo:** cerca de **80 dos 100 cliques vêm do nome da loja** ("motors store" e variações, posições 3 a 5). O site ranqueia para si mesmo e quase nada mais.

**Consultas não-marca, por impressão:**

| consulta | impressões | posição |
|---|---|---|
| bmw seminovo | 74 | 43,5 |
| peugeot 2008 seminovo | 35 | 20,8 |
| 2008 seminovo | 35 | 19,5 |
| citroen seminovo | 33 | 43,2 |
| citroen seminovos | 30 | 44,4 |
| bmw seminovos curitiba | 13 | 27,0 |
| cruze seminovo curitiba | 11 | 22,7 |
| argo seminovo curitiba | 6 | 22,2 |
| argo usado curitiba | 5 | 26,2 |
| chevrolet seminovos curitiba | 3 | 33,0 |

**A forma da busca é sempre a mesma:** `<modelo> seminovo|usado [curitiba]`. É esse o padrão que o conteúdo tem que responder.

**Páginas por impressão:** `/` 895 · `/carros/bmw` 113 · `/carros/peugeot/2008` 90 · `/carros/citroen` 67 · `/sobre` 35 · `/contato` 33.

Aparecem também consultas de dúvida, sinal de que o formato guia pega: `chassi remarcado o que é` (posição 90) e `como consultar se o carro tem passagem por leilão` (posição 73). E o guia `carro-reprovado-cautelar-como-vender` **já recebeu clique**.

## 2. MEDIDO — estoque, 21/09/2026

Fonte: `estoque_motors`, leitura com `begin read only`, filtro `estado_cadastro='publicado' and vendido=false`.

**38 carros à venda, 33 modelos distintos.** Quase um exemplar de cada.

**Modelos com mais de um exemplar parado** — são os que travam o pátio:

| modelo | unidades | faixa |
|---|---|---|
| Fiat Argo | 2 | R$ 72.900 – 78.900 |
| Fiat Toro | 2 | R$ 106.900 – 129.900 |
| Ford Ka | 2 | R$ 53.900 |
| Renault Kwid | 2 | R$ 49.900 – 58.900 |
| VW Saveiro | 2 | R$ 55.900 – 62.900 |

**Correção de premissa do plano:** o plano das ondas (§5, 18/09) dizia "28 dos 40 carros até R$ 50 mil". **Não vale mais** — hoje são ~8 de 38 abaixo de R$ 50 mil. O perfil do estoque subiu de faixa. Quem escrever assumindo "carro de entrada" vai errar o tom.

**A demanda e o estoque quase não se cruzam.** Os modelos mais buscados — 2008, Citroën, Cruze — **não estão no pátio**. O único que cruza é o **Argo**.

## 3. DECIDIDO — a estratégia

Palavras do dono, 21/09: *"vamos focar nos modelos do pátio e depois nas buscas... precisamos girar o pátio e aos poucos ir trazendo volume de buscas... podemos trabalhar todos os termos de busca mais ativos e virar um UPSell de consignados, usando o mecanismo de consiga pra mim... colocamos conteúdo forte e trabalhamos a exclusividade da nossa seleção"*.

Disso saem três decisões:

1. **Ordem: pátio antes, busca depois.** Girar o que está parado é a prioridade; volume de busca se constrói aos poucos.
2. **O descasamento vira motor, não problema.** Modelo com busca e sem estoque não é beco: a peça captura *"consiga pra mim"* e alimenta consignação e compra. O mecanismo **já existe e já está no ar** — `EncomendaDeCarro` / `EncomendaDaFichaPerdida`, montado nos hubs de marca e de modelo e em todos os cinco `not-found`.
3. **Hub primeiro, guia depois** — ver §4.

## 4. DECIDIDO — hub primeiro, guia depois

O plano das ondas (§5) previa "um guia por modelo, ligado ao hub do modelo". **A medição inverteu isso.**

`/carros/peugeot/2008` está na **posição 19,5** com 90 impressões. Ele já tem:
- título casando com a busca exata: `2008 Seminovo em Curitiba | Motors Store`;
- meta description citando perícia cautelar, troca, financiamento e Bacacheri;
- **a Encomenda montada**, mesmo sem nenhum carro do modelo no pátio.

O que falta é **conteúdo sobre o carro**. O hub já tem posição e já tem o formulário; um guia novo teria que conquistar posição do zero.

**Portanto:** o conteúdo de modelo entra primeiro no **hub**, pela tabela `textos_de_hub` (aplicador `scripts/aplicar-hubs.js`, o mesmo usado em 17/09 para 30 hubs). O guia em `/guias/<modelo>-usado` continua previsto, como **aprofundamento** ("o que checar num Ka usado"), não como porta de entrada.

## 5. DECIDIDO — o recorte da primeira leva

### Leva 1 — girar o pátio (5 peças, cobre 10 dos 38 carros)

Critério: modelo com **mais de um exemplar parado**. Não é opinião — é risco de estoque medido.

1. **Fiat Argo** — 2 no pátio **e** demanda medida (11 impressões, posição ~24). O único que cruza os dois lados; começar por ele.
2. **Ford Ka** — 2
3. **Renault Kwid** — 2
4. **VW Saveiro** — 2
5. **Fiat Toro** — 2

### Leva 2 — motor de consignado (4 peças)

Critério: demanda medida, sem estoque. A peça responde à busca e oferece o *"consiga pra mim"*.

6. **Peugeot 2008** — 77 impressões, posição 19,5. A melhor posição do site fora do próprio nome.
7. **BMW seminovo** — 99 impressões, posição 43,5.
8. **Citroën seminovo** — 65 impressões, posição 43,2.
9. **Chevrolet Cruze** — 11 impressões, posição 22,7.

**Atenção, e é desvio consciente do plano:** BMW e Citroën **não são modelo, são marca**. A busca real é `bmw seminovo`, não `x1 seminovo`. Essas duas peças saem como **conteúdo de marca**, no hub de marca (`/carros/bmw`, `/carros/citroen`), não de modelo. O dono aprovou o desvio.

## 6. PENDENTE — não escrever enquanto não responder

Nenhum destes vai ao ar por suposição.

1. **A loja compra e revende Peugeot 2008, Citroën e Chevrolet Cruze?** Perguntado em 21/09, sem resposta até agora. Se a loja não trabalha Citroën, a peça atrai a pessoa errada e o *"consiga pra mim"* vira promessa vazia. **Bloqueia as peças 6, 8 e 9.**
2. **Pode usar "de cada dez avaliados, três entram"?** O número está no site, mas a `REGUA_DO_GUIA` exige amostra, período e método declarados. Perguntado em 21/09, sem resposta. **Sem isso, a exclusividade se argumenta pela perícia cautelar e pelo que o contrato garante — não por número.**

## 7. Regras que não mudam

Valem as de sempre, e estão escritas nos arquivos da casa, não aqui:

- Editorial: `conteudo-seo/pacote/00-guia-normativo.md` e a `REGUA_DO_GUIA` em `src/lib/guias.ts`.
- Fatos da casa: `conteudo-seo/pacote/guias/ONDA-3-FATOS.md`. **Fato que não está lá não se afirma.**
- Nome de motor ou câmbio ligado a falha **exige fonte oficial** (recall, campanha, investigação), registrada em `conteudo-seo/pacote/guias/ONDA-2-1-FONTES.md`, com a origem declarada na própria frase. A loja vende esses carros.
- Banco: ensaio com ROLLBACK primeiro; `--gravar` **só com ordem explícita do dono**.
- `main`: só por lote verificado com CI verde.

## 8. O que NÃO fazer

- **Não reescrever os números de cabeça.** Os de §1 e §2 são medidos, com data. Se ficarem velhos, medir de novo e atualizar aqui — não estimar.
- **Não usar o relatório de indexação antigo** ("127 não indexadas × 85 indexadas"). Não veio da conta do dono. O número dela, medido em 21/09, é **149 não indexadas × 135 indexadas**.
- **Não assumir "carro de entrada"** — ver a correção de premissa em §2.
- **Não escrever guia antes do hub.** A ordem é a do §4, e ela veio da medição.
- **Não começar a Onda 4** (crédito) antes da Onda 5. Ordem do dono em 21/09.

## 9. Próximo passo

Plano de implementação, pela skill `writing-plans`, cobrindo: forma da peça de hub, como o texto entra em `textos_de_hub` sem quebrar as travas existentes, quais testes prendem o quê, e a ordem de gravação.
