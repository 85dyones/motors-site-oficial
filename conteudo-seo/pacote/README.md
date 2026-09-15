# Pacote de conteúdo e linkagem — Motors Store

Tudo que foi produzido para a frente de conteúdo e SEO do `motors-site-oficial`. Destino sugerido no repositório: `conteudo-seo/pacote/`.

**Leia `00-guia-normativo.md` primeiro.** Ele é a política. Quando houver dúvida sobre onde colocar um link, se um tema pode ser publicado ou qual âncora usar, a resposta está lá — e as regras R1 a R8 são citadas pelos outros arquivos sem serem repetidas.

---

## Índice

```
00-guia-normativo.md              política de temas + arquitetura de linkagem (R1–R8, T1–T8)

produto/
  01-bloco-resultado-pericia.md   ⛔ BLOQUEIA a publicação dos guias
  02-not-found-ficha.md           🔥 prioridade máxima — custa dinheiro hoje
  03-faq-templates.md             conteúdo do FAQ em ~50 páginas
  04-schema-jsonld.md             blocos JSON-LD prontos
  05-hub-guias.md                 rota e template de /guias

paginas/
  garantia.md                     reescrita completa da /garantia
  avaliacao.md                    correção da /avaliacao

guias/                            as 8 peças da Onda 1, prontas para publicar
  01-laudo-cautelar-carro-usado.md            PILAR
  02-resultados-laudo-cautelar.md
  03-pericia-cautelar-curitiba.md             ⚠ faltam os valores locais
  04-consultar-carro-leilao-sinistro.md
  05-chassi-remarcado.md                      ⚠ pede revisão jurídica
  06-cautelar-x-vistoria-transferencia.md
  07-carro-reprovado-cautelar-como-vender.md  ⚠ pede revisão jurídica
  08-o-que-reprova-pericia-cautelar.md        estudo de dados próprio
```

---

## Ordem de implementação

### Fase 0 — independentes, começar já

| # | O quê | Arquivo |
|---|---|---|
| 1 | `not-found.tsx` da ficha | `produto/02-not-found-ficha.md` |
| 2 | CTAs da ficha viram `<a href>` | `00-guia-normativo.md`, Parte 3 |
| 3 | Conteúdo do FAQ, fase 1 | `produto/03-faq-templates.md` |
| 4 | Relacionados de 1 para 5 | `00-guia-normativo.md`, 2.3 |
| 5 | Nó `#dealer` do schema | `produto/04-schema-jsonld.md` |
| 6 | Array de imagens e campos do `Car` | `produto/04-schema-jsonld.md` |
| 7 | Módulo de faixa de preço na home e no `/estoque` | `00-guia-normativo.md`, 2.2 |
| 8 | `/contato` e `/motos` no rodapé | `00-guia-normativo.md`, 2.2 |

O item 1 é o mais urgente de todos. Hoje, carro vendido devolve o 404 nativo do Next em inglês, com anúncio pago da Meta apontando para lá.

### Fase 1 — a rota `/guias`

Construir rota, template, schema e slot no rodapé. **Hub com `noindex` e sem nenhum link de entrada** até as peças subirem.

→ `produto/05-hub-guias.md`

### Fase 2 — o bloqueador

Bloco "Resultado da perícia" na ficha do veículo.

→ `produto/01-bloco-resultado-pericia.md`

⛔ **As 8 peças da Onda 1 afirmam que o resultado da perícia está publicado na ficha. Nenhuma sobe antes disso.** É a única dependência de produto de todo o pacote.

### Fase 3 — publicação

Tudo junto, em bloco: as 8 peças, o hub sai do `noindex`, link no rodapé, sitemap regenerado, R8 na ficha ligada, `/garantia` e `/avaliacao` no ar.

Guia não é post. Publicar em bloco é o certo — o raciocínio está na Parte 4 do guia normativo.

---

## O que não é trabalho de código

Trava a publicação, mas roda em paralelo. **Nenhum item abaixo é do Code.**

| Pendência | Bloqueia |
|---|---|
| Revisar o contrato de venda — cláusula de renúncia a garantia legal é nula | `paginas/garantia.md` |
| Revisão jurídica das peças 05 e 07 | as duas peças |
| Levantar valores de perícia em Curitiba (`[X]` e `[Y]`) | `guias/03` |
| Conferir a redação sobre origem dos lotes de frota | `guias/04` |
| Conferir a redação sobre repasse | `guias/07` |
| Validar o bloco de perícia com quem responde pela LGPD | `produto/01` |
| Decidir o nome do serviço de busca de carro fora do estoque | FAQ das páginas sem estoque |
| `curl -I` no domínio antigo e configurar 301 se não houver | nada, mas limita o resultado de tudo |
| Trocar o e-mail LGPD da `/privacidade` para o domínio novo | nada |
| Unificar NAP em Mobiauto, NaPista, SóCarrão, Chaves na Mão, Receita | nada, mas limita o resultado de tudo |

---

## Invariantes — não violar ao implementar

Do guia normativo. Estão aqui porque é fácil quebrá-las sem perceber ao editar copy.

**T1** — Nenhum multiplicador ou percentual de deságio, em nenhum texto público.
**T2** — As expressões "abaixo da FIPE" e "desconto" não aparecem na `/avaliacao` nem em conteúdo de lado de compra.
**T3** — Nenhuma página contradiz outra, nem critica prática que a casa adota.
**T8** — Não fazemos conteúdo educativo sobre garantia legal. A `/garantia` descreve o que a loja entrega.

**Sobre a perícia:** o site publica **o resultado estruturado**, nunca o laudo em PDF. O documento completo contém nome, CPF e endereço do proprietário anterior. A lista do que nunca entra está em `produto/01`.

**Sobre "três em dez":** mantido como texto padrão em todas as páginas. A peça `guias/08` publica a amostra real de um mês (10 em 57) e declara que a proporção varia. As duas convivem porque estão rotuladas como coisas diferentes — medição de 30 dias e critério operacional.

**Regras de linkagem mais quebradas na prática:**
- **R3** — menção nominal a "Avaliação Express", "laudo cautelar", "garantia de motor e câmbio" ou "financiamento" vira link. Nunca texto puro.
- **R5** — nenhuma página termina sem saída. Dead-end é bug.
- **R7** — âncora descreve o destino. Nunca "clique aqui", "ver todos" ou o path da URL.

---

## Links para peças que ainda não existem

As peças da Onda 1 e as páginas referenciam seis URLs de ondas futuras. **Não implementar como link** — deixar como texto até a peça existir, ou o relatório de links quebrados acusa.

```
/guias/motores-turbo-usados-o-que-checar        Onda 2
/guias/cambio-dupla-embreagem-usado             Onda 2
/guias/vicio-oculto-carro-usado                 Onda 2
/guias/garantia-estendida-carro-usado-vale-a-pena   Onda 2, e só se a parceria existir
/guias/vender-carro-curitiba                    Onda 3
/guias/quanto-a-loja-paga-pelo-meu-carro        Onda 3
```

Cada arquivo marca os seus. Os blocos `[C2]` em `paginas/garantia.md` seguem a mesma regra: ficam fora até a parceria de garantia estendida ser assinada.

---

## Formato dos arquivos de guia

Cada peça em `guias/` traz, na ordem:

1. **Frontmatter** — URL, pilar, papel, keyword primária e secundárias, saída comercial
2. **Title e meta description** prontos
3. **O texto publicável**, em markdown
4. **FAQ** — alimenta o `FAQPage`, e o texto marcado precisa ser idêntico ao visível
5. **Tabela de links internos** — trecho de origem e destino
6. **Notas de schema**
7. **Pendências**, quando houver
8. **Conferência editorial** contra as travas

O corpo publicável é o que está entre o título `#` e o separador que antecede a seção de FAQ. As seções seguintes são instruções de implementação e **não vão para o site**.
