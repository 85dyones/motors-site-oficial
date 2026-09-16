# Destaques da semana — curadoria e preenchimento — design

**Data:** 2026-09-09 · **Superfície:** home, seção 01 · **Status:** desenho aprovado, não implementado

A grade "Destaques da semana" é a área mais nobre da home e hoje **não tem
curadoria nenhuma**. O nome é só o título da seção: não há semana, não há
escolha, não há rodízio.

> Direção do dono, 2026-09-08: *"Precisamos ter então formas de ordenar
> aleatório ou por seleção, nesta parte tão nobre do display, deixar ao acaso é
> perder valor."*

---

## 1. O que a produção diz hoje

`src/app/page.tsx:141`, no `main` (e idêntico nos quatro worktrees conferidos):

```ts
const destaquesSemana = disponiveis.slice(0, 6);
```

`disponiveis` é `estoque.filter((v) => !v.vendido)` (`:122`) sobre `getEstoque()`,
que consulta `estoque_motors` com `.order("preco", { ascending: false })`
(`src/lib/supabase.ts:897`). A coluna `preco` é o **preço efetivo** — o que o
cliente paga hoje.

**Na prática, a seção mostra os 6 carros mais caros que estão no ar.** Antes do
`slice` já passaram três filtros: `estado_cadastro = 'publicado'` (com válvula
que serve o estoque inteiro se zerar), `publicavel()` (hoje reprova quem tem
menos de 4 fotos) e `!vendido`.

Não há sorteio, janela de tempo, nem campo de destaque. A lista só muda quando
alguém mexe em preço, publica, arquiva ou vende — e a home revalida a cada 60s
(`page.tsx:87`). Se o topo da tabela de preço não mudar, os mesmos 6 carros
ficam ali por meses.

Já existe uma lista de curadoria no projeto, `carouselVehicleIds` (linha
`carousel_vehicles` de `site_settings`), marcada em lote pelo `/admin/estoque` e
lida por duas superfícies: o carrossel do hero (3 primeiros) e a TV do showroom
`/vitrine` (a lista inteira). **A grade é a única que ignora tudo isso.**

---

## 2. As decisões do dono

Tomadas em conversa nos dias 2026-09-08 e 2026-09-09.

| # | Decisão | O que ficou de fora |
|---|---|---|
| **D1** | **Seleção é o modo principal.** O dono marca os carros e troca quando quiser | "rodízio é o principal", "sempre curado sem automático" |
| **D2** | **Lista própria para a grade**, separada da do hero | compartilhar a lista do hero (com ou sem pular os 3 do banner) |
| **D3** | Quando faltar carro marcado, o preenchimento é **sorteado a cada revalidação** | rodízio semanal com semente fixa; preço desc; encolher a grade |
| **D4** | Marcou mais de 6 → aparecem **os 6 primeiros marcados**, na ordem em que foram marcados | sortear entre os marcados |
| **D5** | O sorteio **não repete** carro que está no banner naquele momento | deixar repetir |

D4 e D5 foram recomendação minha, aceitas em 2026-09-09 ("pode ser a sua
recomendação"). D3 foi escolhido **contra** a minha recomendação de rodízio
semanal — e o motivo que eu tinha dado para preferir o semanal (custo de
transformação de imagem) **não existe**; ver §4.

---

## 3. Comportamento

A grade monta nesta ordem:

1. **Os carros marcados**, na ordem em que foram marcados, até 6
2. **Preenchimento sorteado** até completar 6, entre os disponíveis que não
   estão marcados nem no banner
3. Se o estoque não tiver 6, mostra o que há — a grade encolhe, sem buraco

O sorteio acontece a cada regeneração da página: no máximo a cada 60s, que é o
`revalidate` da home. Quem recarrega duas vezes no mesmo minuto vê a mesma
grade; quem volta depois vê outra.

Carro marcado que foi vendido, arquivado ou caiu no bloqueio de fotos
**simplesmente não aparece** — a lista guarda ids, e quem manda é o estoque.
Não é preciso desmarcar.

---

## 4. O custo do rodízio, medido

Fica registrado para a discussão não reabrir. Medido na produção em 2026-09-09,
lendo o HTML servido:

| Página | `<img>` | Pelo otimizador da Vercel | Direto do bucket |
|---|---|---|---|
| Home | 11 | **1 fonte** (a BMW X1, único carro ainda no carro57) | 8 |
| `/estoque` | 11 | a mesma 1 | 6 lazy |
| PDP (galeria) | 31 | 23 fontes | 3 |

O card manda `unoptimized` para foto nossa (`primitivos.tsx:317`), e desde a
migração das fotos para o bucket em 31/08 isso vale para todo o estoque. **A
foto da home não encosta no otimizador**, então trocar quais 6 carros aparecem
custa **zero transformação**.

O teto real é outro e não muda com o rodízio: a organização Supabase está no
plano **free** (5 GB de egress/mês), a foto de card tem 137 KB de média e uma
visita à home baixa ~8 delas — algo como 4.500 visitas/mês. Cada visitante baixa
a mesma quantidade de fotos independentemente de *quais* carros a grade mostra.

O custo que existia — a imagem otimizada da PDP voltando a ser cobrada a cada
4 h por `X-Vercel-Cache: STALE` — foi tratado noutro PR
(`perf(imagens): o cache para de recomprar a mesma foto a cada 4 horas`) e não
tem relação com esta seção.

---

## 5. Onde vive o dado

Linha nova em `site_settings`:

| | |
|---|---|
| id da linha | `destaques_da_semana` |
| chave no objeto de settings | `destaquesDaSemana` |
| formato | array de ids de veículo, como `carouselVehicleIds` |

- **Fora** de `recortePublicoDeSettings` e **fora** da whitelist da RLS anônima.
  Quem lê é o servidor, com a chave de serviço; nada no navegador precisa dela.
  Linha nova nasce privada por desenho da migração
  `20260812120000_rls_leitura_de_site_settings.sql` — é o comportamento
  desejado, não um esquecimento.
- `src/app/api/settings/route.ts` ganha a chave no destructure e um ramo de
  upsert, copiando o caminho do `carouselVehicleIds`.
- `src/lib/settings.ts` ganha a linha no `find` e no retorno.
- **Nenhuma migração.** Não há schema novo: `site_settings` é chave-valor.
- Invalidação já existe: o POST chama `revalidateTag`, e a home é ISR de 60s.
  Marcou no painel, aparece na loja em até 1 minuto.

---

## 6. Onde vive a regra

Módulo novo, `src/lib/destaquesDaSemana.ts`:

```ts
montarDestaquesDaSemana({
  disponiveis,   // Veiculo[] — já filtrado e ordenado por getEstoque
  selecionados,  // string[] — ids marcados no painel, na ordem da marcação
  excluir,       // string[] — ids que estão no banner agora
  sortear,       // () => number — injetado; Math.random por padrão
}): Veiculo[]    // no máximo 6
```

O sorteador entra **injetado**. É o que torna o aleatório testável sem teste
intermitente, e é o ponto que a mutação vai atacar. `page.tsx` só chama — a
decisão sai do JSX, que é onde ela mora hoje.

---

## 7. Onde se edita

`/admin/estoque`, ação em lote nova ao lado da que já existe. Ficam duas, com o
nome do que o operador vê na home:

| Ação | O que alimenta |
|---|---|
| Destacar no carrossel da home *(já existe)* | Banner do hero (3 primeiros) + TV `/vitrine` |
| **Pôr nos destaques da semana** *(nova)* | Só a grade da home |

Com contador honesto quando passar do teto — `10 marcados · a grade mostra 6`.
Campo que some sem avisar é defeito conhecido deste painel; a régua de fotos e o
histórico de veículo já custaram isso.

---

## 8. Testes

- seleção preservada na ordem em que foi marcada
- preenchimento nunca repete carro da grade nem do banner
- teto de 6 com lista maior; a ordem é a da marcação
- lista vazia → 6 sorteados
- estoque com menos de 6 → mostra o que há, sem buraco
- id marcado que não está mais em `disponiveis` → some sozinho
- o sorteio é o **único** ponto não determinístico: com `sortear` fixo, a saída é
  reproduzível
- mutação no ponto de chamada (`page.tsx`), não só na função: renderizar e
  contar a saída
- a trava existente de `tests/vitrine.test.ts` continua verde — os dois
  `VER OS {total} VEÍCULOS`, um antes e um depois da grade

## 9. O que não muda

- **hero** e **`/vitrine`** seguem lendo `carouselVehicleIds`
- o link ao lado do título segue dizendo o total do estoque, não o da grade —
  regra 6 do `CLAUDE.md` ("vitrine ordena, nunca esconde") e trava de
  `tests/vitrine.test.ts`
- nenhuma migração, nenhuma RLS desligada, nenhum evento de tracking renomeado

## 10. Fora de escopo

- reordenar a seleção arrastando (a ordem é a da marcação)
- rodízio semanal automático com semente fixa — foi considerado e recusado (D3)
- recarimbar o `cacheControl` das ~1.050 fotos que já estão no bucket: é o
  passe próprio citado no §4, noutro PR
