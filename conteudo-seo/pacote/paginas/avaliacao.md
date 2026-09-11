# `/avaliacao` — Correção

Dois problemas apontados no audit e ainda abertos:

1. **Vocabulário proibido.** O bloco "COMO A PROPOSTA É FEITA" contém "A compra da loja fica abaixo da FIPE". Viola a trava T2, que é regra sua.
2. **Beco sem saída.** A página não tem breadcrumb e não tem nenhum link no corpo. Só o rodapé. Viola a R5.

Este arquivo corrige os dois. O formulário não muda.

**Antes de aplicar:** confira contra o texto que está no ar. Escrevi a partir do que foi crawleado, e a página pode ter mudado desde então.

---

## 1. Breadcrumb

Adicionar, no mesmo padrão das outras páginas:

```
Home / Avaliação
```

Com `BreadcrumbList` no schema. Hoje é a única página de nível 1 sem ele.

---

## 2. Substituir o bloco "COMO A PROPOSTA É FEITA"

### O que sai

Qualquer frase que use "abaixo da FIPE", "desconto", ou que enquadre a proposta como uma subtração a partir de um valor de referência. O enquadramento correto não é o quanto se tira — é o que a loja passa a assumir.

### O que entra

**H2 — Como a proposta é feita**

> A Tabela FIPE é uma referência de mercado, construída a partir de preços praticados. Ela não é um preço fixo de compra nem de venda — é o ponto de partida da conversa, e é assim que a gente usa.
>
> O valor que a Motors Store oferece considera três coisas, nesta ordem:
>
> **O carro.** Estado real, histórico documental, revisões registradas, quilometragem proporcional ao ano e resultado da perícia cautelar. É o que mais pesa, e de longe.
>
> **O que a loja assume junto.** Quando o carro entra no nosso estoque, ele deixa de ser um anúncio e passa a ser responsabilidade nossa: nota fiscal de entrada, transferência pelo RENAVE, qualquer débito ou restrição que apareça depois, preparação, perícia, e a garantia de três meses de motor e câmbio que o próximo comprador vai ter. Nada disso existe numa venda entre particulares.
>
> **O giro.** Quanto tempo aquele modelo, naquela cor, naquela faixa, costuma levar para sair do nosso showroom.
>
> A proposta vem por escrito, com o raciocínio aberto. Se não fizer sentido para você, não tem problema nenhum — a avaliação é gratuita e não obriga a nada.

> **Trava T1:** nenhum percentual, nenhum multiplicador, nenhuma referência a quanto se tira da FIPE. A lógica é conteúdo; o número é operação e fica no ERP.

---

## 3. Bloco novo — o que valoriza e o que pesa contra

Entra depois do anterior. Converte, porque responde à pergunta que a pessoa está fazendo antes mesmo de preencher o formulário.

**H2 — O que valoriza e o que pesa contra**

| Valoriza | Pesa contra |
|---|---|
| Revisões documentadas, com nota | Histórico de manutenção sem registro |
| Único dono ou poucos donos | Passagem por leilão |
| Quilometragem proporcional ao ano | Sinistro estrutural |
| Manual e segunda chave | Divergência de numeração |
| Pneus e itens de desgaste em dia | Reparo mal executado |
| Documentação limpa e em dia | Débitos, restrição ou multa em aberto |

> Nenhum item da coluna da direita inviabiliza uma proposta por si só. Eles mudam o valor, e a gente explica quanto e por quê quando apresenta o número.

---

## 4. Bloco novo — e se o carro não passar na perícia?

**H2 — E se o meu carro não passar na perícia?**

> Acontece, e com frequência: de cada dez carros que avaliamos, três entram no showroom.
>
> Reprovar na perícia não significa que o carro não vale nada nem que ninguém compra. Significa que ele não entra na nossa vitrine, porque a gente vende com garantia e publica o resultado da perícia na ficha de cada carro. Nesses casos, a conversa continua por outro caminho, e a gente é transparente sobre qual.
>
> O que a gente não faz é receber o carro sem te dizer o que encontrou.

> Este bloco é o diferencial real desta página. Nenhum concorrente publica a taxa de recusa.

---

## 5. FAQ da página

Três perguntas. A genérica de troca **não entra** aqui — seria link para a própria página.

**A avaliação tem algum custo?**
Não. A Avaliação Express é gratuita e não gera compromisso. Você manda os dados do veículo, um consultor analisa e retorna com a proposta pelo WhatsApp. Se não fechar, está tudo certo.

**Posso usar o valor como entrada?**
Pode. É o uso mais comum: o valor do seu carro entra como entrada e o restante pode ser **[financiado](/financiamento)**, com a proposta indo para múltiplos bancos ao mesmo tempo.

**Vocês compram carro com financiamento em aberto?**
Compramos. A quitação entra no acerto e a transferência só acontece depois que o gravame é baixado. É um processo comum aqui, só exige um pouco mais de documentação.

---

## 6. Bloco de saída (R5)

No fim da página, depois do FAQ. É o que tira a `/avaliacao` da condição de beco sem saída.

**H2 — Depois da avaliação**

> **Já sabe qual carro quer?**
> [Ver os seminovos disponíveis](/estoque) — todos com perícia cautelar aprovada.
>
> **Vai precisar financiar a diferença?**
> [Simule a parcela](/financiamento) com o estoque real da loja.
>
> **Quer saber o que o próximo comprador recebe?**
> [Como funciona a garantia de três meses](/garantia) de motor e câmbio.

> **Fase 2**, quando a Onda 3 publicar: acrescentar link para `/guias/vender-carro-curitiba` e `/guias/quanto-a-loja-paga-pelo-meu-carro`.

---

## 7. Schema

`WebPage` + `BreadcrumbList` + `FAQPage`. O `Service` de Avaliação Express já está previsto no `hasOfferCatalog` do nó `#dealer`.

```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://motorsstore.com.br/avaliacao#webpage",
  "url": "https://motorsstore.com.br/avaliacao",
  "name": "Avaliação Express | Motors Store",
  "description": "Avaliação gratuita do seu carro usado em Curitiba, com proposta por escrito e sem compromisso. O valor pode entrar como entrada em um seminovo.",
  "inLanguage": "pt-BR",
  "isPartOf": { "@id": "https://motorsstore.com.br/#website" },
  "about": { "@id": "https://motorsstore.com.br/#dealer" }
}
```

---

## 8. SEO

**Primária:** avaliação de carro usado curitiba
**Secundárias:** vender meu carro para loja curitiba · quanto vale meu carro na troca · quem compra carro usado em curitiba

**Title:** `Avaliação Express: quanto vale seu carro | Motors Store`
**Meta description:** `Avaliação gratuita e sem compromisso do seu usado em Curitiba. Proposta por escrito, e o valor entra como entrada no seu próximo carro.`

---

## Checklist

- [ ] Nenhuma ocorrência de "abaixo da FIPE" ou "desconto" na página
- [ ] Nenhum percentual ou multiplicador de avaliação
- [ ] Breadcrumb presente, com schema
- [ ] Pelo menos três links de saída no corpo
- [ ] FAQ sem link para a própria página
- [ ] `FAQPage` idêntico ao visível
- [ ] Formulário intocado
- [ ] Equipe de vendas alinhada com o bloco da perícia — a página passa a dizer publicamente que 7 em 10 não entram
