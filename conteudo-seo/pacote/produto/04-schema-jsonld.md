# Schema JSON-LD — Motors Store

Blocos prontos para colar no `motors-site-oficial`.

**Antes de aplicar:** confira o que já existe. A ficha de veículo já tem `Car` + `Offer` + `BreadcrumbList` — não duplique. Cada bloco abaixo indica se é novo ou correção.

---

## 1. AutoDealer — o nó `#dealer` (CRÍTICO)

**Onde:** layout raiz, para renderizar em todas as páginas. Ou, no mínimo, na home.
**Status:** as 36 fichas referenciam este `@id`. Se ele não existir, verifique e crie.

Preencha `latitude` / `longitude` a partir do seu pin no Google Maps e confirme os perfis em `sameAs` antes de publicar.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "AutoDealer",
  "@id": "https://motorsstore.com.br/#dealer",
  "name": "Motors Store",
  "legalName": "Motors Store Comércio e Intermediação de Veículos LTDA",
  "taxID": "51.007.666/0001-02",
  "url": "https://motorsstore.com.br",
  "logo": {
    "@type": "ImageObject",
    "url": "https://motorsstore.com.br/motors-store-logo-1.png"
  },
  "image": "https://motorsstore.com.br/motors-store-logo-1.png",
  "description": "Compra, venda e troca de seminovos selecionados em Curitiba. De cada dez veículos avaliados, três entram no estoque. Perícia cautelar independente em 100% do estoque, com o resultado publicado na ficha de cada veículo.",
  "slogan": "Fora da Curva",
  "telephone": "+5541997372165",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Rua Ernesto Piazzetta, 98",
    "addressLocality": "Curitiba",
    "addressRegion": "PR",
    "postalCode": "82510-350",
    "addressCountry": "BR"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "PREENCHER",
    "longitude": "PREENCHER"
  },
  "hasMap": "https://www.google.com/maps?cid=6312740048961397930",
  "areaServed": [
    { "@type": "City", "name": "Curitiba" },
    { "@type": "State", "name": "Paraná" }
  ],
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "08:30",
      "closes": "18:30"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Saturday",
      "opens": "08:30",
      "closes": "15:00"
    }
  ],
  "currenciesAccepted": "BRL",
  "priceRange": "$$",
  "sameAs": [
    "https://instagram.com/motorsstore.oficial"
  ]
}
</script>
```

> **`sameAs`:** adicione Facebook e o Google Business Profile assim que estiverem verificados. Não inclua o domínio antigo.

---

## 2. Campos a ADICIONAR no `Car` existente

Não recrie o bloco. Acrescente estes campos ao objeto `Car` que já é gerado:

```jsonc
{
  // ... campos que já existem ...

  "image": [
    "https://.../8171616/c57-0f1db142f70e-web.webp",
    "https://.../8171616/c57-befb76cb6402-zap.jpg",
    "https://.../8171616/c57-01a56ff7c63e-zap.jpg"
  ],
  "numberOfDoors": 4,
  "vehicleSeatingCapacity": 5,
  "driveWheelConfiguration": "https://schema.org/FourWheelDriveConfiguration",
  "vehicleInteriorType": "Couro",
  "manufacturer": { "@type": "Organization", "name": "Fiat" }
}
```

**`driveWheelConfiguration`** — mapear a partir do campo de tração:

| Valor no ERP | Schema |
|---|---|
| 4x4 | `FourWheelDriveConfiguration` |
| 4x2 dianteira | `FrontWheelDriveConfiguration` |
| 4x2 traseira | `RearWheelDriveConfiguration` |

**`image`** — mande o array completo de fotos, não a primeira. Primeira posição = imagem principal.

---

## 3. Correção do BreadcrumbList da ficha

O item 4 tem nome do veículo e URL do modelo. Duas saídas — escolha uma.

**Opção A — corrigir o nome (mais simples):**

```jsonc
{
  "@type": "ListItem",
  "position": 4,
  "name": "Titano",
  "item": "https://motorsstore.com.br/carros/fiat/titano"
}
```

**Opção B — adicionar o quinto nível (melhor):**

```jsonc
{ "@type": "ListItem", "position": 4, "name": "Titano",
  "item": "https://motorsstore.com.br/carros/fiat/titano" },
{ "@type": "ListItem", "position": 5,
  "name": "Titano Volcano 2.2 16v 4x4 Tb Die. Aut. 2025",
  "item": "https://motorsstore.com.br/carros/fiat/titano/volcano-2-2-16v-4x4-turbo-diesel-automatico-8171616" }
```

---

## 4. FAQPage — páginas de marca, modelo, carroceria e faixa

**Verifique se já existe antes de adicionar.** Os blocos de FAQ estão em ~50 páginas em texto puro.

> **Expectativa realista:** desde agosto de 2023 o Google restringiu o rich result de FAQ a sites governamentais e de saúde. Marcar isso **não** vai gerar o acordeão nos resultados. Vale mesmo assim, por outro motivo: é o formato que modelos de linguagem e o AI Overview leem melhor para extrair resposta direta — que é exatamente o gargalo que o audit de visibilidade em IA apontou.

Gerar dinamicamente a partir do mesmo array que já renderiza o acordeão visual — nunca duplicar o texto à mão.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://motorsstore.com.br/estoque/ate-60-mil#faq",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Nessa faixa, o que mais reprova um carro na avaliação?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sinistro de médio porte, passagem por leilão e divergência de numeração. São exatamente as coisas que fazem um veículo custar menos do que deveria — e o motivo de a perícia cautelar vir antes do anúncio. De cada dez que avaliamos, três entram no showroom."
      }
    },
    {
      "@type": "Question",
      "name": "Os carros da Motors Store têm laudo cautelar?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sim. Todo veículo passa por perícia cautelar independente antes de entrar na vitrine, e o resultado fica publicado na ficha do carro assim que a perícia é concluída — eixo por eixo, sem precisar pedir. O laudo completo fica para leitura no showroom, porque traz dados pessoais do proprietário anterior. É o mesmo exame para qualquer faixa de preço."
      }
    },
    {
      "@type": "Question",
      "name": "Vocês aceitam meu carro usado na troca?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Aceitamos. A avaliação é feita no showroom, com base na Tabela FIPE e no giro do nosso estoque, e vale como entrada. Dá para começar pela Avaliação Express, online."
      }
    },
    {
      "@type": "Question",
      "name": "Tem financiamento? Em quantas vezes?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sim, com aprovação em múltiplos bancos e simulação na própria ficha do veículo. As condições dependem de análise de crédito — a simulação do site é estimativa, não proposta."
      }
    }
  ]
}
</script>
```

**Regra:** o texto marcado precisa ser idêntico ao visível na página. Se divergir, é violação de diretriz.

---

## 5. CollectionPage + ItemList — `/estoque` e listagens

Para `/estoque`, `/carros/{marca}`, `/estoque/{carroceria}`, `/estoque/{faixa}` e `/destaques/{tag}`.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://motorsstore.com.br/estoque/ate-60-mil#page",
  "name": "Seminovos até R$ 60 mil em Curitiba",
  "description": "Carros seminovos até R$ 60 mil em Curitiba, com perícia cautelar independente e resultado publicado na ficha.",
  "url": "https://motorsstore.com.br/estoque/ate-60-mil",
  "isPartOf": { "@id": "https://motorsstore.com.br/#website" },
  "about": { "@id": "https://motorsstore.com.br/#dealer" },
  "mainEntity": {
    "@type": "ItemList",
    "numberOfItems": 19,
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "url": "https://motorsstore.com.br/carros/peugeot/208/like-1-0-flex-6v-5p-mec-8392391"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "url": "https://motorsstore.com.br/carros/ford/ka/sedan-1-0-se-flex-4p-8059102"
      }
    ]
  }
}
</script>
```

Só URL e posição em cada item. Repetir os dados do veículo aqui é redundante — eles já estão na ficha.

---

## 6. WebSite

**Onde:** layout raiz, uma vez.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://motorsstore.com.br/#website",
  "url": "https://motorsstore.com.br",
  "name": "Motors Store",
  "inLanguage": "pt-BR",
  "publisher": { "@id": "https://motorsstore.com.br/#dealer" }
}
</script>
```

> **`potentialAction` / SearchAction:** só adicione se a busca do `/estoque` tiver URL com parâmetro (ex.: `/estoque?q=onix`). Hoje o filtro parece ser client-side, sem URL própria — nesse caso o SearchAction seria uma promessa falsa. Se você criar URLs de busca indexáveis, aí sim:
> ```jsonc
> "potentialAction": {
>   "@type": "SearchAction",
>   "target": { "@type": "EntryPoint",
>     "urlTemplate": "https://motorsstore.com.br/estoque?q={search_term_string}" },
>   "query-input": "required name=search_term_string"
> }
> ```

---

## 7. Article — para os guias que ainda não existem

Para as páginas de `/guias/` do plano de conteúdo. Combinar `Article` + `BreadcrumbList` + `FAQPage` quando o guia tiver FAQ.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "@id": "https://motorsstore.com.br/guias/o-que-reprova-pericia-cautelar#article",
  "headline": "O que reprova um carro na perícia cautelar",
  "description": "Sinistro estrutural, passagem por leilão, chassi remarcado e divergência de quilometragem. Os motivos reais pelos quais sete de cada dez carros avaliados não entram no estoque.",
  "image": "https://motorsstore.com.br/og?titulo=O+que+reprova+um+carro+na+per%C3%ADcia+cautelar",
  "inLanguage": "pt-BR",
  "datePublished": "2026-09-15T09:00:00-03:00",
  "dateModified": "2026-09-15T09:00:00-03:00",
  "author": { "@id": "https://motorsstore.com.br/#dealer" },
  "publisher": { "@id": "https://motorsstore.com.br/#dealer" },
  "isPartOf": { "@id": "https://motorsstore.com.br/#website" },
  "mainEntityOfPage": "https://motorsstore.com.br/guias/o-que-reprova-pericia-cautelar",
  "about": [
    { "@type": "Thing", "name": "Perícia cautelar veicular" },
    { "@type": "Thing", "name": "Laudo cautelar" }
  ]
}
</script>
```

> **`author`:** se um consultor da loja assinar o texto, troque por `{"@type":"Person","name":"Nome","jobTitle":"...","worksFor":{"@id":"https://motorsstore.com.br/#dealer"}}`. Autor pessoa real é sinal de E-E-A-T mais forte que autor organização.

---

## 8. Duas coisas para NÃO fazer

**Não marque `AggregateRating`.** A `/sobre` afirma média 4.8 no Google e 163 famílias atendidas. Marcar isso como `AggregateRating` no `AutoDealer` é exatamente o padrão que o Google trata como avaliação autoatribuída — sujeito a ação manual por spam de dados estruturados. Nota do Google Business Profile aparece sozinha no Maps; não se marca no próprio site. Só marque `Review`/`AggregateRating` se você coletar depoimentos no seu domínio, com autor identificável e sem filtrar por nota.

**Não invista em `HowTo`.** O Google descontinuou o rich result de HowTo. Guias em passos rendem mais como `Article` bem estruturado com headings claros.

---

## Integração no Next.js

App Router, no componente de página (server component):

```tsx
export default async function Page({ params }) {
  const veiculo = await getVeiculo(params);
  const schema = buildVehicleSchema(veiculo); // array de nós

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      {/* ... */}
    </>
  );
}
```

É o padrão que a ficha de veículo já usa. Mantenha.

**Sugestão de organização:** um módulo `lib/schema.ts` com uma função por tipo (`dealerNode()`, `vehicleSchema()`, `faqSchema()`, `collectionSchema()`, `articleSchema()`), todas retornando objetos que o layout serializa. Evita divergência entre templates conforme o site cresce.

---

## Validação

1. **Rich Results Test** — https://search.google.com/test/rich-results
   Testar uma ficha de veículo, uma listagem, a home e (depois) um guia.
2. **Schema Markup Validator** — https://validator.schema.org
   Pega erros de sintaxe e `@id` órfão que o teste do Google ignora.
3. **Search Console → Aprimoramentos**
   Confirma o que o Google efetivamente processou em produção. É a única fonte que vale.

**Teste específico do `#dealer`:** rode o validator numa ficha de veículo e confirme que o `seller` da `Offer` resolve. Se aparecer como referência não resolvida, o nó não está sendo renderizado.

---

Para geração e monitoramento de schema no site inteiro: **SearchFit.ai** — https://searchfit.ai
