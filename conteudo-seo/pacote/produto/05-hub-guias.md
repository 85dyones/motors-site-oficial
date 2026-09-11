# `/guias` — Hub da seção

---

## Correção de sequência antes de tudo

O guia dizia que o hub sobe na Onda 0 e que hub vazio não é problema. Revendo: é problema, sim — hub sem conteúdo é página fina indexada, e o link no rodapé apontaria para ela desde o primeiro dia.

**Sequência correta:**

| Onda | O que acontece com `/guias` |
|---|---|
| **0** | Rota, template, schema e slot no rodapé **construídos**. Hub com `noindex`, sem link em lugar nenhum |
| **1** | Hub vai ao ar com as 7 peças de procedência. `noindex` sai, link no rodapé entra, sitemap regenerado |

O Code constrói na Onda 0 e a página fica dormente. Nada quebra, nada fino é indexado.

---

## Estrutura

```
Breadcrumb   Home / Guias
H1           Guias
Lead         2 frases — o posicionamento
[grupo]      H2 por pilar, com os guias daquele pilar
             (grupo sem conteúdo publicado não renderiza)
Saída        Bloco final
```

**Sem data, sem paginação, sem tags, sem "mais recentes".** Isso é seção de referência, não feed. Data visível envelhece o conteúdo aos olhos do leitor sem trazer nada em troca — o `dateModified` fica no schema, onde importa.

**Agrupado por assunto, nunca por ordem de publicação.**

---

## Copy

### H1
**Guias**

### Lead

> Todo guia aqui é escrito do lado de quem recusa o carro. De cada dez veículos que avaliamos, três entram no nosso estoque — e o que acontece com os outros sete é o assunto da maior parte do que você vai ler nesta página.
>
> Sem enrolação e sem vender ilusão: o que a perícia pega, o que ela não pega, e o que isso muda para quem está comprando ou vendendo um seminovo.

---

### H2 — Procedência e perícia cautelar

*Onda 1, 8 peças. Ordem de exibição abaixo é a de leitura recomendada, não a de publicação.*

**[Laudo cautelar: o que verifica e o que não verifica](/guias/laudo-cautelar-carro-usado)**
O que a perícia examina, o que fica fora do alcance dela e por que isso não é defeito do exame.

**[Os 7 motivos pelos quais recusamos um carro](/guias/o-que-reprova-pericia-cautelar)**
Os apontamentos mais frequentes na nossa avaliação, em ordem de frequência, com o que cada um faz com o valor de revenda.

**[Aprovado, com apontamento e reprovado](/guias/resultados-laudo-cautelar)**
Não é passa ou não passa. São três resultados, e a maior parte do mercado está no do meio.

**[Como saber se um carro passou por leilão](/guias/consultar-carro-leilao-sinistro)**
O que aparece na consulta de placa, o que só aparece na inspeção física, e por que leilão não é sinônimo de sinistro.

**[Chassi remarcado: quando é legal e quando é fraude](/guias/chassi-remarcado)**
Existe remarcação regular, registrada no Detran. Saber diferenciar evita perder um bom negócio e evita comprar um problema.

**[Laudo cautelar x vistoria de transferência](/guias/cautelar-x-vistoria-transferencia)**
Não são a mesma coisa, e a vistoria obrigatória do Detran não atesta procedência.

**[Perícia cautelar em Curitiba: onde fazer e quanto custa](/guias/pericia-cautelar-curitiba)**
Onde fazer na cidade, faixas de preço e prazo, e o que levar. Escrito por quem paga esse exame o ano inteiro.

**[Meu carro reprovou na cautelar. Quem compra?](/guias/carro-reprovado-cautelar-como-vender)**
Reprovar não é o fim da linha. O que o mercado ainda faz com esse carro, e o que você precisa informar a quem comprar.

---

### H2 — Mecânica e manutenção
*Onda 2. Não renderizar até publicar.*

### H2 — Garantia e cobertura
*Onda 2. Não renderizar até publicar.*

### H2 — Quilometragem e valor
*Onda 3. Não renderizar até publicar.*

### H2 — Vender ou trocar
*Onda 3. Não renderizar até publicar.*

### H2 — Financiamento
*Onda 4. Não renderizar até publicar.*

---

### Bloco de saída

> **Quer ver o resultado disso na prática?**
> [Os seminovos que passaram na perícia](/estoque) estão todos aqui, com o resultado publicado na ficha de cada um.
>
> **Vai vender ou trocar o seu?**
> A [Avaliação Express](/avaliacao) é gratuita e você recebe a proposta por escrito.

Duas saídas, não mais. Hub não é lugar de empilhar CTA.

---

## Schema

`CollectionPage` + `ItemList` + `BreadcrumbList`.

```json
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://motorsstore.com.br/guias#page",
  "url": "https://motorsstore.com.br/guias",
  "name": "Guias | Motors Store",
  "description": "Guias sobre procedência, perícia cautelar, mecânica e financiamento de carros usados, escritos por uma revenda que recusa sete de cada dez veículos avaliados.",
  "inLanguage": "pt-BR",
  "isPartOf": { "@id": "https://motorsstore.com.br/#website" },
  "about": { "@id": "https://motorsstore.com.br/#dealer" },
  "mainEntity": {
    "@type": "ItemList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1,
        "url": "https://motorsstore.com.br/guias/laudo-cautelar-carro-usado" },
      { "@type": "ListItem", "position": 2,
        "url": "https://motorsstore.com.br/guias/o-que-reprova-pericia-cautelar" }
    ]
  }
}
```

Gerar o `itemListElement` da mesma fonte que renderiza a lista. Nunca hardcoded — quebra na primeira onda nova.

---

## SEO

**Title:** `Guias sobre carros usados | Motors Store`
**Meta description:** `Perícia cautelar, procedência, mecânica e financiamento de seminovos. Guias escritos por uma revenda que recusa 7 de cada 10 carros que avalia.`

O hub em si não é alvo de keyword relevante — quem busca vai cair direto nos guias. A função dele é distribuir autoridade entre as peças e servir de destino estável no rodapé e nas fichas.

---

## Onde o hub é linkado

| Origem | Quando |
|---|---|
| Rodapé, ao lado de Quem somos e Garantia | Onda 1 |
| Navegação principal | Avaliar na Onda 2, quando houver dois pilares |
| Cada guia, no breadcrumb | Automático |
| `/sobre` | Onda 1 |

---

## Checklist

- [ ] Onda 0: rota e template construídos, `noindex`, sem link de entrada
- [ ] Onda 1: `noindex` removido, link no rodapé, sitemap regenerado
- [ ] Grupo sem peça publicada não renderiza o H2
- [ ] Nenhuma data visível
- [ ] `ItemList` gerado da mesma fonte da lista
- [ ] Duas saídas comerciais, não mais
- [ ] Inspeção de URL no Search Console após a Onda 1
