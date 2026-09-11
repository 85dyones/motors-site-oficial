# Bloco de FAQ — conteúdo por template

Resolve dois itens do guia de uma vez: a duplicação da 2.5 e a regra R3 (menção nominal vira link).

Hoje o mesmo bloco de quatro perguntas se repete em ~50 páginas trocando só o substantivo, e cita "Avaliação Express", "financiamento" e "garantia" pelo nome sem linkar para nenhum. Este arquivo é o conteúdo; o componente é um só.

---

## Regra de composição

Toda página monta **quatro perguntas**, nesta ordem:

1. **Uma específica do recorte** — muda por template. Seção 2 abaixo
2. **Troca** → link para `/avaliacao`
3. **Financiamento** → link para `/financiamento`
4. **Garantia** → link para `/garantia`

Cada genérica carrega **exatamente um** link comercial. É o que tira `/avaliacao` e `/financiamento` da condição de receber só rodapé.

---

## 1. As três genéricas

Idênticas em todas as páginas. Um array só, importado pelo componente.

### Troca

**P:** Vocês aceitam meu carro usado na troca?

**R:** Aceitamos. A avaliação é feita no showroom, com base na Tabela FIPE e no giro do nosso estoque, e o valor entra como entrada no carro novo. Dá para começar online pela **[Avaliação Express](/avaliacao)** — você manda os dados do veículo e um consultor retorna com a proposta.

### Financiamento

**P:** Tem financiamento? Em quantas vezes?

**R:** Sim. Trabalhamos com múltiplos bancos e a proposta vai para mais de um ao mesmo tempo, o que aumenta a chance de aprovação e melhora a condição. Você pode **[simular a parcela](/financiamento)** com o estoque real da loja. A simulação é estimativa; a condição final depende de análise de crédito.

### Garantia

**P:** O carro tem garantia?

**R:** Tem. Todo carro sai com **[três meses de garantia de motor e câmbio](/garantia)**, sem carência e sem franquia. Antes disso ele passou por perícia cautelar independente — a garantia existe para cobrir o que a perícia não tem como enxergar.

---

## 2. A pergunta específica, por template

### `/estoque`

**P:** O que um carro precisa ter para entrar nesse estoque?

**R:** Passar na perícia cautelar independente, que roda antes do anúncio. Reprovam sinistro estrutural, passagem por leilão, divergência de numeração e desgaste crônico grave. De cada dez veículos que avaliamos, três entram no showroom. Os outros sete seguem para outro lugar do mercado.

### `/carros/{marca}`

**P:** O que olhar num {Marca} usado antes de fechar?

**R:** Além do histórico documental, o que pesa é a mecânica específica da linha: intervalo de correia, tipo de injeção, comportamento do câmbio e o custo de peça de reposição. É o que a nossa inspeção verifica antes de o carro entrar. Se algum ponto crítico aparece, o veículo não é anunciado.

> Se der para variar por marca sem virar manutenção eterna, vale — mas a versão genérica acima funciona nas 13.

### `/carros/{marca}/{modelo}` — com estoque

**P:** {Modelo} usado dá problema? O que costuma aparecer?

**R:** Como todo carro usado, depende muito mais de histórico e manutenção do que do modelo em si. Na inspeção do {Modelo} a gente olha com atenção o conjunto de motor e câmbio, o histórico de revisões e sinais de reparo estrutural. Os que estão anunciados aqui passaram por esse crivo.

### `/carros/{marca}/{modelo}` — sem estoque

**P:** Vocês conseguem buscar um {Modelo} para mim?

**R:** Conseguimos. Nem tudo que procuramos está no showroom no momento — se o {Modelo} é o que você quer, deixa o contato que a gente avisa assim que um entrar, ou vai atrás de um que atenda o seu perfil. O critério de aprovação é o mesmo: só entra o que passa na perícia.

> Link para a captura de lead de busca personalizada. **Depende da decisão de nome** pendente na 1.5 do guia — `/carro-perfeito` já é outro serviço.

### `/estoque/{carroceria}`

**P:** O que muda ao avaliar {carroceria} usada?

**R:** O uso típico muda o que importa na inspeção. {carroceria} costuma rodar em condição mais exigente, então suspensão, embreagem e sinais de sobrecarga pesam mais na análise do que pesariam em outro perfil de veículo. O laudo é o mesmo para qualquer categoria; o que muda é onde a gente olha mais de perto.

> Ajustar a segunda frase por carroceria. Picape e utilitário → sobrecarga e chassi. Hatch e sedan → uso urbano, embreagem, histórico de aplicativo. SUV → suspensão e câmbio.

### `/estoque/{faixa}`

**P:** Nessa faixa, o que mais reprova um carro?

**R:** Sinistro de médio porte, passagem por leilão e divergência de numeração. São exatamente as coisas que fazem um veículo custar menos do que deveria — e o motivo de a perícia cautelar vir antes do anúncio, não depois da venda.

> Esta já existe em `/estoque/ate-60-mil` e é o padrão que as outras devem seguir. Manter.

### `/destaques/{tag}`

**P:** Como vocês escolhem os carros desse destaque?

**R:** O recorte muda conforme o destaque — quilometragem, ano, faixa de preço —, mas o critério de entrada é sempre o mesmo. Todo carro listado aqui já está no estoque, o que significa que já passou pela perícia cautelar independente.

---

## 3. Implementação

**Um componente, dois inputs.** O array das três genéricas é importado direto. A específica vem por prop, montada no server component da página com os dados que ele já tem (marca, modelo, carroceria, faixa).

**O schema sai do mesmo array.** O `FAQPage` é gerado das mesmas quatro perguntas que renderizam o acordeão — nunca duplicar o texto à mão. Texto marcado divergente do visível é violação de diretriz.

**Os links são âncora descritiva, não "clique aqui".** As três genéricas acima já vêm com a âncora certa embutida. Se o componente renderizar markdown, ok; se não, passar como elemento React com `<Link>`.

---

## 4. Fase 2 — quando a Onda 1 publicar

Os guias ainda não existem, então **nada abaixo entra agora**. Quando a Onda 1 subir, acrescentar estes links nas respostas que já os mencionam por nome:

| Onde | Trecho | Destino |
|---|---|---|
| `/estoque` específica | "perícia cautelar independente" | `/guias/laudo-cautelar-carro-usado` |
| `/estoque` específica | "de cada dez, três entram" | `/guias/o-que-reprova-pericia-cautelar` |
| Genérica de garantia | "perícia cautelar independente" | `/guias/laudo-cautelar-carro-usado` |
| `/estoque/{faixa}` específica | "passagem por leilão" | `/guias/consultar-carro-leilao-sinistro` |
| `/carros/{marca}` específica | "intervalo de correia", "tipo de injeção" | `/guias/motores-turbo-usados-o-que-checar` |
| `/destaques` específica | "perícia cautelar independente" | `/guias/laudo-cautelar-carro-usado` |

Depois disso, cada página passa a ter de dois a três links contextuais saindo do FAQ — que é o que fecha a R3 por completo.

---

## Checklist

- [ ] Componente único, genéricas por import e específica por prop
- [ ] `FAQPage` gerado do mesmo array
- [ ] Três links comerciais presentes em toda página: `/avaliacao`, `/financiamento`, `/garantia`
- [ ] Nenhuma âncora genérica
- [ ] Específica da `/estoque/ate-60-mil` preservada como está
- [ ] Link de busca personalizada nas páginas sem estoque — bloqueado até a decisão de nome
- [ ] Fase 2 fora deste PR
