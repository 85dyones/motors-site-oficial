# Conteúdo SEO do estoque — Motors Store

Worktree dedicada a escrever `descricao_seo` para todo o estoque, com a Motors Store posicionada como potência **geolocal em Curitiba e região** e **digital para o Brasil**.

Branch: `claude/conteudo-seo-curitiba`, criada de `claude/magical-chebyshev-80c51c` (722041c) — que é onde `descricao_seo` passou a existir.

---

## 1. O que a loja é, segundo o que dá para verificar

Tudo abaixo sai do repositório ou do banco de produção. Nada aqui é suposição de mercado.

**Endereço e alcance.** Rua Ernesto Piazzetta, 98 — Bacacheri, Curitiba/PR, 82510-350. WhatsApp (41) 99842-6127. Instagram `@motorsstore.oficial`. O texto institucional já assume os dois eixos: *"agende uma visita ao nosso showroom no Bacacheri, pertinho da Rua Canadá"* e *"logística de entrega para todo o Brasil"*.

**A tese da loja**, em `src/lib/aboutSettings.json`, é escassez por curadoria — não preço:

> "Vendemos menos carros do que poderíamos." De cada dez veículos avaliados, aceitamos três.

**Provas que a loja alega:** perícia cautelar em 100% do estoque, crivo de 120 pontos, 163 famílias atendidas, média 4.8 no Google, preço no anúncio sem "consulte-nos".

**Vocabulário da casa** (decisão de 2026-08-14): *Garagem Motors* é o lugar, *diário de bordo* é o registro, *procedência* é o ativo. "Procedência" é palavra da casa e deve aparecer no texto dos carros. "Caderneta" está aposentada.

## 2. O estoque real, medido em 2026-08-17

43 veículos no último ciclo de sync (41 à venda, 2 vendidos). Gerado por `conteudo-seo/levantar-estoque.js` em `conteudo-seo/estoque.json`.

| Faixa | Unidades |
|---|---|
| Até R$ 50 mil | 11 |
| R$ 50–100 mil | **24** |
| R$ 100–200 mil | 6 |
| Acima de R$ 200 mil | 2 |

Preço de R$ 13.900 a R$ 318.900, **mediana R$ 62.900**.

**Carroceria:** 22 hatch, 9 SUV, 6 sedã, 4 motocicletas, 2 picapes.
**Marcas:** Chevrolet 8, VW 7, Fiat/Honda/Ford 4 cada, Hyundai 3, BMW 2, Kia 2, Renault 2 — e unidades de Toyota, Jeep, Mitsubishi, Mercedes-Benz, Nissan, Harley-Davidson.

Média de 15,2 fotos por veículo.

### O descompasso que precisa ser encarado antes de escrever

A comunicação institucional é de curadoria premium. O estoque é majoritariamente **popular e seminovo de volume**: metade entre R$ 50 e 100 mil, mais hatches que qualquer outra coisa. Os dois BMWs e a Mercedes são exceção, não a régua.

Isso não invalida a tese — significa que o texto de cada carro tem de fazer a curadoria caber num Onix, não só num X4. Um Onix "aprovado no laudo, com procedência rastreada, entre os 3 de cada 10 que passam" é uma promessa forte e verificável. Um Onix descrito com adjetivo de luxo é ruído que o comprador de Onix não compra.

## 3. Estado do texto, veículo a veículo

| Estado | Qtd | O que significa |
|---|---|---|
| `blurb-institucional` | **30** | `descricao` é o texto de boas-vindas da loja, igual para todos |
| `texto-proprio` | 10 | tem texto real do veículo — revisar, não reescrever do zero |
| `sem-texto` | 3 | veio "Sem descrição informada" do RevendaMais |
| `pronto` | 0 | ninguém escreveu `descricao_seo` ainda |

**33 veículos precisam de texto novo. 10 precisam de revisão.**

O blurb dos 30 é literalmente este, repetido: *"seja bem vindo a loja virtual motors store! a loja fora da curva. uma loja conceito, de curitiba/pr para o brasil!…"* — inclusive no BMW X4 de R$ 318.900.

### Dois buracos de dado que limitam o teto do texto

Medido no banco, nos 43 veículos:

- **`laudo_pericia`: 0 de 43 preenchidos.**
- **`opcionais`: 1 de 43 preenchido.**

**Resolvido para o `laudo_pericia` em 2026-08-17:** o dono confirmou que todos os veículos passam por perícia cautelar, e o campo vazio é falha de lançamento no sistema. O texto pode afirmar o exame. O campo continua devendo ser preenchido — a promessa pública é que o laudo fica na ficha do carro, e hoje não fica.

**`opcionais` segue aberto**, e tira a matéria-prima mais óbvia de diferenciação entre dois carros do mesmo modelo. É o próximo lote (§7).

## 4. Objetivo

Ser encontrada por duas buscas diferentes, com o mesmo estoque:

**Geolocal** — "seminovo Curitiba", "carro usado Bacacheri", "revenda confiável Curitiba", "[modelo] usado Curitiba". Aqui o ativo é endereço, laudo, showroom, atendimento presencial, região.

**Digital nacional** — "[marca] [modelo] [ano] [versão] usado", com o comprador podendo estar em qualquer lugar. Aqui o ativo é ficha completa, fotos, transparência de preço e a logística de entrega.

Um texto só precisa servir aos dois sem virar salada de palavra-chave. A regra prática: **o veículo é o assunto, a loja é o contexto** — hoje está invertido nos 30.

## 5. Como escrever — o padrão

`descricao_seo` alimenta dois consumidores (ver `src/app/api/feed/xml/route.ts` e o `generateMetadata` da PDP):

- **feed dos portais** — texto do anúncio;
- **meta description** do Google — cortada em 155 caracteres pelo `truncateString`.

Daí o formato: **as duas primeiras linhas têm de funcionar sozinhas em 155 caracteres**, e o resto complementa no portal.

**Estrutura sugerida:**

1. Modelo, ano, versão e o fato mais forte do carro (km baixa, único dono, 4x4, automático).
2. O que a Motors Store garante nele — procedência, laudo, garantia de motor e câmbio.
3. Âncora geolocal — Curitiba/Bacacheri — e a nota de entrega nacional quando fizer sentido.

**Regras:**

- Nunca afirmar laudo aprovado sem o dado. Enquanto `laudo_pericia` estiver vazio, falar de *processo* ("todo veículo passa por perícia independente antes de entrar na vitrine"), não de *resultado*.
- Sem "consulte-nos", sem preço implícito — a loja se orgulha de preço no anúncio.
- Nada de repetir marca/modelo em looping. O título do feed já os carrega.
- Usar "procedência" como palavra da casa.
- Cada texto único. Dois Onix na mesma vitrine não podem ter a mesma frase — foi esse o defeito que originou este trabalho.

### Exemplo trabalhado

Veículo real do estoque: **VW Saveiro 1.6 MSI Robust CS**, modelo 2023 / fab. 2022, 98.595 km, branca, manual, flex, R$ 65.900, 11 fotos.

**Hoje:**

> seja bem vindo a loja virtual motors store! a loja fora da curva. uma loja conceito, de curitiba/pr para o brasil!…

**Proposta** (os 155 primeiros caracteres, que viram a meta description, em negrito):

> **Saveiro Robust 1.6 MSI 2023, cabine simples, câmbio manual e motor flex — picape de trabalho com procedência rastreada e garantia de motor e câmbio.** Passou por perícia independente antes de entrar na vitrine. R$ 65.900 no anúncio, sem "consulte-nos". Showroom no Bacacheri, em Curitiba, com entrega para todo o Brasil.

O corte em 155 entrega um anúncio completo; o portal recebe o resto.

Repare no que o exemplo **não** diz: não afirma laudo aprovado (o campo está vazio), não chama de "seminovo impecável" uma picape com 98 mil km, e não esconde a quilometragem — para picape de trabalho ela é contexto, não defeito. Texto que promete o que o dado não sustenta volta como reclamação na mesa de negociação.

## 6. Fila de trabalho

O dado está em `conteudo-seo/estoque.json`, com `estado_do_texto` por veículo.

1. **Resolver o bloqueio do laudo** — decisão do dono (§3).
2. **3 sem texto** — Fiat Strada Ranch 2025 entre eles, e com 1 foto só (problema à parte, vale reportar).
3. **30 com blurb**, na ordem de valor. Os 8 acima de R$ 100 mil são a cabeça da fila, e 6 deles estão no blurb:

   | Preço | Estado | Veículo |
   |---|---|---|
   | R$ 318.900 | blurb | BMW X4 M40i 3.0 V6 Turbo |
   | R$ 229.900 | blurb | Chevrolet Camaro SS 6.2 V8 |
   | R$ 170.900 | próprio | Fiat Titano Volcano 2.2 4x4 |
   | R$ 146.900 | blurb | Kia Bongo K-2500 |
   | R$ 140.900 | blurb | Toyota Corolla GR-Sport 2.0 |
   | R$ 125.900 | **sem texto** | Fiat Strada Ranch T200AT |
   | R$ 105.900 | blurb | BMW 320i 2.0 Sport GP |
   | R$ 105.900 | próprio | Jeep Renegade S T270 1.3 4x4 |

   Um X4 de R$ 318.900 anunciado com texto de boas-vindas genérico é o caso mais caro da lista.
4. **10 com texto próprio** — revisar contra o padrão; alguns já são bons (a Fiat Titano abre com modelo, ano e proposta, que é exatamente a estrutura acima).
5. **Gravar** pelo painel (aba "Texto e SEO") ou por script na coluna `descricao_seo`.

O trigger `estoque_motors_conteudo_atualizado` move `conteudo_atualizado_em` a cada gravação, então o sitemap avisa os portais sozinho. Nada além de escrever é necessário.

## 7. Respondido pelo dono em 2026-08-17

- **Laudo.** Todos os veículos passam por perícia cautelar — o campo vazio é falha de lançamento, não ausência do exame. **O texto pode afirmar.** O campo continua devendo ser preenchido: a promessa pública é que o laudo fica na ficha do carro.
- **Posicionamento.** "Premium" descartado. Ver `POSICIONAMENTO.md` — o termo é **seleção**, frase-mãe "o carro que passou".
- **Geografia.** Local: raio de 50 km de Curitiba. Digital: Paraná inteiro e Santa Catarina até Balneário Camboriú.
- **Motos.** Deixam de ser exceção. Mesma régua de texto e de seleção.
- **Concorrência.** Pesquisada — resultado em `POSICIONAMENTO.md`.
- **Aprovação.** Rascunhos sobem direto; marketing ou admin aprovam no painel. Confirmado no código: `descricao_seo` é editável por Admin, Marketing e Comercial (`ACAO_DO_CAMPO_DE_VEICULO` em `src/lib/permissoes.ts`).

### Ainda aberto

- **Volume de busca por modelo na região** — ordenaria a fila melhor que o preço. Precisa de ferramenta de keyword, não de repositório.
- **Nomenclatura de motos** — o site fala "carros" e as rotas são `/carros/...`. Decidir antes de o volume de motos crescer.
## 9. Opcionais — o dado sempre existiu

**A pesquisa de ficha de fábrica não foi necessária, e teria sido pior.** O feed do RevendaMais traz `<ACCESSORIES>` por veículo, com os itens que a própria loja cadastrou — em formato de lista separada por vírgula, exatamente o que a PDP espera (`veiculo.opcionais.split(",")`).

O workflow n8n lê **21 tags** do XML e `ACCESSORIES` não é uma delas. Por isso `opcionais` estava em 1 de 43: não porque a loja não tem o dado, mas porque ele se perdia no caminho.

Extraído e gravado em 2026-08-17: **21 dos 43 veículos** têm acessórios declarados, de 1 a 44 itens cada. Os outros 22 estão vazios no próprio RevendaMais — é cadastro que falta lá, não aqui.

Isso também respondeu, com dado em vez de palpite, perguntas que eu tinha evitado nos textos: "7 lugares" aparece declarado onde existe.

### ⚠️ Isto é correção de uma vez só

`extrair-acessorios.js` resolve o presente. **A correção definitiva é acrescentar `ACCESSORIES` ao mapeamento do n8n** — sem isso, todo ciclo de sync continua ignorando o campo, e veículo novo entra sem opcionais de novo.

## 10. Decisões do dono em 2026-08-17 (segunda rodada)

- **FIPE não aparece.** O feed traz `VALOR_FIPE` real, mas exibir foi descartado — não é o ideal para a loja. O campo continua sem uso; a tese de transparência se sustenta no preço no anúncio, sem comparativo.
- **O laudo não fica na ficha.** Está disponível para consulta mediante solicitação. Consequências: nenhum dos 41 textos promete laudo na ficha (conferido — só afirmam que o veículo passou pela perícia), e o texto **que está no ar** também não promete: `site_settings.about` diz *"Laudo Cautelar 100% Aprovado: Zero histórico de leilão, sinistro ou adulteração"*. Só o fallback `src/lib/aboutSettings.json` do repositório ainda carrega a frase *"O laudo de cada carro fica na ficha dele"* — corrigir para não aparecer numa queda do banco.

### ⚠️ Override de teste no ar

O BMW X4 (`7947766`), o carro mais caro da vitrine, tem override do painel com `descricao` = `<ul><li>Teste de ajuste descritivo supabase</li></ul>`. Está sendo renderizado na PDP. Feed e meta description estão salvos porque agora vêm de `descricao_seo`, mas o corpo da página mostra o texto de teste. Remoção é pelo painel.

### Outros campos que o feed traz e o sync descarta

| Tag | Conteúdo | Por que importa |
|---|---|---|
| ~~`VALOR_FIPE`~~ | valor real (ex.: `109359.00`) | **Descartado pelo dono em 2026-08-17** — exibir FIPE não é o ideal para a loja. Fica registrado que o dado existe, caso a decisão mude |
| `DOORS` | `4` | Ficha técnica |
| `HP` | `185` (parcial) | Ficha técnica |
| `CONDITION` | `USADO` | Já derivado da km, mas é a fonte |
| `VIDEO` | — | Mídia na PDP |
| `CHASSI`, `PLATE` | — | **Internos.** Nunca no mapper público — ver a nota de `placa` em `supabase.ts` |

## 8. Estado da execução

**31 rascunhos gravados em produção em 2026-08-17** (`aplicar-rascunhos.js --gravar`). Conferido pelo efeito, simulando a cadeia do feed:

| | antes | depois |
|---|---|---|
| Anúncios com texto próprio | 1 distinto em 41 | **41 distintos em 41** |
| Meta descriptions distintas | — | **41 em 41** |
| Fonte `descricao_seo` | 0 | 31 |
| Fonte `descricao` (texto que já era próprio) | — | 10 |

Os 31 tiveram `conteudo_atualizado_em` movido pelo trigger, então o `lastmod` do sitemap já avisa os portais a reprocessar.

**Faltam os 10 com texto próprio** — são distintos entre si e não estão quebrados, mas foram escritos antes do frame de seleção. Revisar contra `POSICIONAMENTO.md`.

Para reverter tudo: `node conteudo-seo/aplicar-rascunhos.js --reverter`.
