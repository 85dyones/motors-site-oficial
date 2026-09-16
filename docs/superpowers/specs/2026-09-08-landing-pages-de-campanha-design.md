# Landing pages de campanha — design

**Data:** 2026-09-08
**Estado:** aprovado pelo dono no brainstorming de 08/09, aguardando plano de implementação
**Primeira entrega:** `/pole-position-2026`, campanha de 12 a 20 de setembro de 2026

---

## 1. O problema

O site sabe publicar duas coisas: ficha de veículo e página de conteúdo escrita no
código. Não sabe publicar **ação pontual da loja** — feirão, lote, parceria,
condição de mês. Toda campanha até hoje foi anúncio apontando para `/estoque`, o
que gasta a verba levando a pessoa a uma vitrine que não fala da campanha.

O pedido do dono, em 08/09: *"preciso ser capaz de criar landing pages para o
site, idealmente definindo o url e o corpo aceitando código, assim posso pedir
apoio na criação do design e ter controle sobre isso"*.

---

## 2. As quatro decisões que fecharam o desenho

Perguntadas e respondidas no brainstorming de 08/09. Elas são a razão de o
sistema ser pequeno; qualquer uma diferente exigiria arquitetura maior.

| # | Pergunta | Decisão | O que ela elimina |
|---|----------|---------|-------------------|
| 1 | Para que serve a primeira LP? | **Ação pontual da loja** — com prazo, e podendo listar carros | Elimina HTML congelado no banco: o estoque muda sozinho |
| 2 | Quem publica, sem depender de quê? | **Só o dono, pedindo ao Claude** — PR e deploy servem | Elimina CMS, editor visual, sanitização de HTML, RLS nova |
| 3 | O que o CTA entrega ao consultor? | **Um CTA de campanha só** — lead sem veículo, `interesse` = nome da campanha | Elimina modal por card e wrapper de veículo na LP |
| 4 | Quanta liberdade o design tem? | **Página em branco** — layout próprio, sem header | Elimina sistema de blocos; em troca, exige casca própria |

**O "corpo aceitando código" está atendido no sentido mais forte:** o corpo *é*
código. Uma LP é um `page.tsx` no repositório, com JSX livre.

---

## 3. Arquitetura

Quatro peças. **Nenhuma tabela nova, nenhuma migração, nenhuma mudança em
`/api/leads`.**

### 3.1 O registro — `src/lib/campanhas.ts`

Fonte única de verdade sobre toda campanha, viva ou morta.

```ts
export interface Campanha {
  /** Sem reuso, e carrega o ano. Ver §6.1 — o 301 fica em cache eterno. */
  slug: string;
  /** Vai para `interesse` do lead. É o que o consultor lê. */
  nome: string;
  /** ISO. A página só responde 200 entre estas duas datas. */
  inicio: string;
  fim: string;
  /** Para onde o 301 aponta depois de `fim`. */
  destinoAposFim: string;
  /** Uma linha para o sitemap e para o card de compartilhamento. */
  descricao: string;
}
```

Quatro consumidores leem daqui, e é isso que impede a lista de redirects órfãos
que o dono levantou como risco na decisão #3 do endereço:

- **`src/app/sitemap.ts`** — lista as campanhas vivas hoje;
- **a própria página** — compara a data e redireciona quando vencida;
- **`src/components/MolduraDoSite.tsx`** — sabe que a rota é campanha e larga a
  moldura;
- **o CTA** — lê `nome` para carimbar o lead.

A aposentadoria de uma campanha é **uma data no mesmo objeto onde ela nasceu** —
não uma entrada numa lista paralela que ninguém limpa.

### 3.2 A casca — `src/app/(campanha)/layout.tsx`

Route group entre parênteses: **não aparece na URL**. `/pole-position-2026` fica
na raiz, como o dono pediu, sem prefixo `/campanha/`.

O achado que faz o "página em branco" funcionar sem perder dinheiro: no
`src/app/layout.tsx`, `IntegrationsTracker`, `CamadaDeDados` e
`AntigravityTracker` estão **fora** do `MolduraDoSite`. Uma LP pode largar
header e rodapé **sem perder Pixel, CAPI nem GA4**.

**Correção pontual que este desenho exige.** Hoje `MolduraDoSite` esconde num
pacote só quatro coisas: header, rodapé, `LeadPopup` e `CookieConsentBanner`.
Numa LP queremos os três primeiros fora e o aviso de cookies **dentro** — sumir
com ele é perda de conformidade, não de estilo. O componente passa a separar
*moldura de navegação* de *aviso legal*. As rotas que já usam a regra
(`/vitrine`, `/admin`) mantêm o comportamento atual: são telas da loja, não do
cliente.

### 3.3 O CTA — `src/components/campanha/CtaDeCampanha.tsx`

Client component. Mesmo caminho da PDP: botão → `LeadCaptureModal` →
`POST /api/leads` → `window.open(wa.me)`.

**Economia descoberta lendo o endpoint:** `interesse` já cai em `body.mensagem`
como segundo fallback (`src/app/api/leads/route.ts`). Mandar
`mensagem: "Pole Position"` faz o consultor ver a origem **sem tocar em
`/api/leads`**.

Única mudança fora do componente, em `src/lib/turnstile.ts`:

```ts
export const ACOES = { /* … */ campanha: "campanha" } as const;
export const ACOES_DE_LEADS = [ /* … */ ACOES.campanha ] as const;
```

Sem isso o token é recusado na origem — que é exatamente a trava projetada para
superfície nova não nascer sem conferência.

**Correção sobre `canal`, feita ao ler o código.** O rascunho deste spec dizia
para deixar `canal` como `"site"`. Está errado, e o próprio repositório refuta:
`src/lib/encomenda.ts` — escrito em 08/09, no PR #59 — estabelece o padrão oposto
e o documenta, *"o lead da encomenda cai no mesmo Kanban, e o que o distingue é
`canal`"*, gravando `canal: "Encomenda"`. A LP segue esse padrão: **`canal`
recebe o nome da campanha**, que é a etiqueta lida no Kanban antes de abrir a
conversa.

A divisão entre os três campos, então:

| campo | valor | quem lê |
|-------|-------|---------|
| `canal` | `"Pole Position"` | o consultor, no Kanban |
| `mensagem` → `interesse` | frase **na voz do cliente** | o consultor, ao abrir |
| `intencao_busca` | `{ campanha: slug, caminho }` | n8n e Motor de Gatilhos |

`mensagem` não é etiqueta. `mensagemDaEncomenda` documenta que a frase se escreve
na voz do cliente — é ele quem manda o texto — e a da campanha segue a mesma
regra e as mesmas proibições: sem prazo que a loja não controla, sem FIPE, sem
"abaixo da tabela".

**O modal serve sem adaptação:** `isEmailValid` é `!email.trim() || regex`, isto
é, e-mail vazio é válido. Nome e WhatsApp bastam, e a LP não paga fricção de um
campo a mais.

### 3.4 A metadata, que é obrigatória e não opcional

Toda LP declara a sua, via `generateMetadata` e `montarCompartilhamento` — o
mesmo caminho de `/garantia` e das demais páginas públicas:

- **`title` e `description`** próprios;
- **`alternates.canonical`** apontando para a própria LP. Sem isso a página
  herda o card do layout raiz, que deliberadamente **não** declara canonical
  para não anunciar a home como canônica de todo mundo;
- **`openGraph` / `twitter`** com imagem própria da campanha.

**A imagem de compartilhamento tem uma armadilha conhecida neste repositório:**
`robots.ts` bloqueia `/api/`, e um `og:image` servido sob esse caminho responde
200 no navegador e chega **sem imagem** no WhatsApp — que é justamente por onde
uma campanha circula. A arte da LP entra como arquivo estático em `public/`, com
dimensão real declarada (o card já saiu com logo deformado uma vez por declarar
1200×630 num arquivo 1024×513).

### 3.5 As amarras

Um teste que varre `src/app/(campanha)/*/` e **reprova se uma pasta não estiver
no registro**. Mesma filosofia da `action` obrigatória do Turnstile: LP que
esquecer de se registrar não passa na suíte, em vez de ir ao ar sem sitemap,
sem card de compartilhamento e sem plano de morte.

Segundo teste: toda campanha do registro tem `nome`, `fim` e `destinoAposFim`
não vazios, e `fim` posterior a `inicio`.

> **Nota de implementação (Windows).** A varredura compara caminhos montados com
> `path.join`. Comparar com `endsWith("/algo")` falha nesta máquina — já
> aconteceu neste repositório e deixou um teste verde guardando o defeito.

---

## 4. O que este desenho NÃO toca

Declarado para o revisor não procurar:

- **`/api/leads`** — nenhuma linha. O `interesse` sai do fallback existente.
- **Banco** — nenhuma migração, nenhuma tabela, nenhuma policy.
- **`estoque_motors`** — a LP lê pelo mesmo caminho das outras páginas públicas.
- **`TRACKING_SPEC.md`** — nenhum evento renomeado ou removido. A LP dispara
  `Lead`, o mesmo que as outras cinco superfícies já disparam.
- **Endereço, telefone e Instagram** — vêm de `companySettings`
  (`getCachedSettings`), como nas demais páginas públicas. Nada hardcode na LP.

---

## 5. A primeira LP — Pole Position

Conteúdo conferido contra o folder `FINAL - MOTORS STORE.pdf`, passado pelo dono
em 08/09.

```
slug            pole-position-2026
nome            Pole Position
inicio          2026-09-12
fim             2026-09-20
destinoAposFim  /estoque
```

**Chamada:** *"Pole Position — a largada para grandes oportunidades"*.
**Tema visual do folder:** automobilismo. McLaren-Honda #12 e curva de autódromo
com zebras.

**Os seis argumentos**, na ordem do folder:

1. **Lives com ofertas relâmpago** — bônus que podem chegar a R$ 10 mil
2. **Carros selecionados** — escolhidos e avaliados um a um
3. **Primeira parcela em até 120 dias** — *conforme as condições de financiamento*
4. **Transferência + tanque cheio** — *em veículos selecionados*
5. **Garantia Motors Store**
6. **Perícia cautelar aprovada**

### 5.1 Conferência do conteúdo contra o que o site sustenta

Feita antes de escrever, porque LP é comunicação pública e o repositório já tem
regra sobre o que pode ser afirmado.

- **Perícia (item 6) — confere.** A afirmação de processo *"todo veículo passa
  por perícia cautelar antes de entrar na vitrine"* foi restaurada como
  verdadeira por decisão do dono em 2026-09-04 (commit `673b048`). A LP pode
  afirmá-la nos mesmos termos da `/garantia`.
- **Garantia (item 5) — confere, com cuidado de tom.** `POSICIONAMENTO.md` é
  explícito: os 90 dias são o mínimo legal para venda por PJ e **não se vendem
  como diferencial**. A LP afirma a garantia com clareza e deixa o diferencial
  na perícia, como a `/garantia` já faz.
- **Itens 1, 3 e 4 — ressalvas do folder vão junto, literais.** "Podem chegar a",
  "conforme as condições de financiamento" e "em veículos selecionados" são
  parte da afirmação, não letra miúda a ser aparada no digital.
- **Nada de recompra.** A LP não menciona percentual de FIPE nem recompra: a
  regra 5 do `CLAUDE.md` proíbe comunicação pública da cláusula antes de parecer
  jurídico e provisionamento. O folder não menciona, e a LP também não vai.

### 5.2 CTA

**Um** CTA — o mesmo botão e o mesmo modal, ancorado em dois pontos da página
(topo e fim) para quem lê tudo e para quem não lê. Não são dois destinos.

- **Rótulo:** `Quero as condições do Pole Position`.
- **Lead gravado:** `interesse = "Pole Position"`, sem `veiculo_id`, com UTM.
- **WhatsApp:** mensagem pronta citando a campanha.

**Custo aceito pelo dono na decisão #3, registrado aqui para não virar surpresa:**
o consultor recebe o contato sabendo a campanha e **não** o carro; e o evento de
CAPI vai sem `content_ids`.

---

## 6. Riscos conhecidos

### 6.1 O 301 fica em cache eterno no navegador

`permanentRedirect` responde 308, e navegador não reconsulta. Slug reusado no ano
seguinte herdaria o redirect do anterior e a campanha nova nunca abriria.

**Mitigação, que é regra e não recomendação:** o slug carrega o ano e nunca se
reusa. `pole-position-2026`, `pole-position-2027`. O teste do registro checa que
não há dois slugs iguais.

### 6.2 O tema do visitante briga com a arte do folder

O script anti-flicker do layout raiz sobrescreve as variáveis `--brand-*`
conforme o tema salvo no `localStorage` do visitante — são quatro
(`motors-modernist`, `luxury-light`, `stealth-dark`, `sport-nardo`). Uma LP que
use os tokens aparece em dourado para quem tem `stealth-dark` salvo.

**Mitigação:** LP de campanha declara cor literal e ignora os tokens de tema. É
consequência direta da decisão #4 — página em branco tem paleta própria.

### 6.3 A LP vencida não redireciona no instante

Com ISR, o 301 entra na próxima revalidação. **`revalidate = 300`**: cinco
minutos de atraso na manhã de 21/09, sem pagar renderização por visita.

### 6.4 Indexação em 8 dias é improvável — e tudo bem

A campanha vive 12 a 20/09. O Google dificilmente indexa e ranqueia nesse prazo,
então o tráfego será de anúncio, link e Instagram — não de busca. O canonical e a
entrada no sitemap continuam valendo por outro motivo: evitam leitura de conteúdo
duplicado enquanto a página existe, e deixam o 301 com o que preservar depois.
**Não se deve prometer resultado de SEO com esta LP.**

### 6.5 Prazo

Hoje é 08/09; a campanha começa 12/09. São quatro dias, e a LP precisa estar no
ar antes do primeiro anúncio. O plano deve entregar `/pole-position-2026`
funcionando antes de qualquer generalização do sistema.

---

## 7. Ordem de implementação

Uma tarefa por PR, conforme `CLAUDE.md`.

1. **Registro + casca + amarras** — `campanhas.ts`, `(campanha)/layout.tsx`, a
   separação no `MolduraDoSite`, o `sitemap.ts` e os dois testes.
2. **O CTA** — `CtaDeCampanha.tsx` e a `action` no `turnstile.ts`.
3. **A LP Pole Position** — o design, com o conteúdo do §5.

Toda entrega passa pelo `qa-guardian` antes do merge.

---

## 8. Fora de escopo

Declarado para não crescer sozinho:

- Editor de LP no `/admin` — a decisão #2 dispensou.
- Blocos reutilizáveis de layout — a decisão #4 dispensou.
- Grade de veículos curada por campanha — a decisão #3 tirou o CTA dos cards; se
  a LP listar carros, eles linkam para a ficha, e a seleção não precisa de
  ferramenta nova nesta entrega.
- Teste A/B, contador regressivo, captura por e-mail.

---

## 9. Quando parar e perguntar

Além do que o `CLAUDE.md` já manda:

- Se a campanha pedir para afirmar número que não esteja no folder nem no banco.
- Se pedirem para a LP mencionar recompra ou percentual de FIPE.
- Se a LP precisar de dado pessoal além do que `/api/leads` já coleta.
