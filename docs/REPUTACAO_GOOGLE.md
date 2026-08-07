# Avaliações do Google — como ligar

A seção "04 — REPUTAÇÃO" da home lê o Places API **no servidor**, uma vez por
dia. Não há tabela, migração, workflow do n8n nem widget de terceiro: o cache do
próprio Next segura o resultado por 24 horas.

O visitante nunca fala com o Google — quem chama é o servidor, na renderização.

| Onde | O quê |
|---|---|
| `src/lib/avaliacoesGoogle.ts` | A chamada, o cache e as regras de exibição |
| `src/components/GoogleReviewsFeed.tsx` | A seção da home |
| `tests/avaliacoes-google.test.ts` | Ordenação, formato e o parsing da resposta |

---

## 1. Ligar (uma vez só)

1. **Projeto no Google Cloud** — pode ser o mesmo já usado no Google Ads.
2. **Habilitar a `Places API (New)`.**
3. **Ativar o faturamento no projeto.** É o ponto que costuma travar: o Places
   API exige cartão cadastrado **mesmo para usar a franquia gratuita**. Com
   uma leitura por dia são ~30 chamadas/mês, dentro da franquia com folga —
   mas sem cartão a API recusa a chamada.
4. **Criar uma chave de API** e restringi-la ao Places API. Ela é lida só no
   servidor; nunca prefixe com `NEXT_PUBLIC_`, ou ela vai para o bundle.
5. **Achar o `place_id` da loja** — pelo Place ID Finder do Google, ou por uma
   busca por texto na própria API.

No `.env.local` (e nas variáveis do projeto na Vercel):

```
GOOGLE_PLACES_API_KEY=...
GOOGLE_PLACE_ID=ChIJ...
```

Sem as duas variáveis a seção simplesmente não é renderizada — é o
comportamento correto em desenvolvimento local.

---

## 2. Verificar

```bash
npx vitest run tests/avaliacoes-google.test.ts
```

No site, a home deve mostrar a nota, o total de avaliações e até cinco
avaliações com texto. Se não aparecer nada, o log do servidor diz o motivo: o
corpo da resposta do Places API é registrado junto com o status, e é ele que
distingue chave sem a API habilitada, faturamento desligado e `place_id`
errado — os três dão erro parecido.

---

## 3. Os limites deste caminho

O Places API devolve **no máximo 5 avaliações**, e não dá para escolher quais.
Também não traz as respostas da loja.

Quem resolve as duas coisas é a **Business Profile API** — só para quem é dono
do perfil, o que é o caso da Motors. Ela traz o acervo inteiro e as respostas,
sem exigir cartão, mas em troca pede solicitação de acesso ao Google (aprovação
leva dias), OAuth2 com refresh token e um sync que guarde o resultado.

`PainelReputacao`, em `avaliacoesGoogle.ts`, é a fronteira desenhada para essa
troca: trocar a origem não mexe no componente. Duas armadilhas, para quando for:

- `starRating` na Business Profile API é **enum** (`"FIVE"`), não número.
- A tela de consentimento OAuth precisa estar **publicada**. Em *Testing*, o
  refresh token do Google expira em 7 dias — o sync funciona a semana toda e
  morre no sábado, sem erro visível no site.

---

## 4. O que não fazer

**Não calcular a média a partir das avaliações recebidas.** São 5 de dezenas.
A média exibida é a que a API devolve em `rating`.

**Não filtrar por nota.** As regras de exibição do Google proíbem, e uma seção
onde nenhuma crítica nunca aparece é lida como maquiada. `selecionarParaVitrine`
ordena por data e não olha a nota; há teste fixando isso.

**Não editar o texto da avaliação.** Nem corrigir ortografia, nem cortar. É
depoimento de cliente.

**Não expor a chave no cliente.** `GOOGLE_PLACES_API_KEY` é lida em Server
Component. Com o prefixo `NEXT_PUBLIC_` ela seria publicada no bundle e
qualquer um gastaria a franquia da loja.
