# Handoff — tirar o alias da Vercel do circuito

O que sobrou depois de 2026-09-06, e que **só se resolve fora do
repositório**. Cada tarefa aqui tem o porquê, o passo e como conferir.

Contexto completo em [`VIRADA_DE_DOMINIO.md`](VIRADA_DE_DOMINIO.md) →
"O alias saiu do circuito".

---

## O que já está feito — não refazer

| | Estado |
|---|---|
| Páginas do alias → apex | **308**, desde 19/08 (`next.config.ts`) |
| Workflows do n8n no alias | **zero ativos**, desde 06/09 |
| Cópias JSON no repo | alinhadas ao apex |

O que **não** está feito é a exceção `(?!api/)` do `next.config.ts`: enquanto
ela existir, `/api/*` continua respondendo 200 pelo alias. Ela só cai depois
da Tarefa B abaixo.

---

## Tarefa A — o token do motor do Ciclo · **urgente, e independente do alias**

**O sintoma:** o Orquestrador Diário do Ciclo tem **zero execuções bem-sucedidas
em todo o histórico**. Todo dia às 9h ele bate em `/api/ciclo/motor/fila` e
recebe `401 {"error":"Não autorizado"}`. O mesmo vale para o Aviso de
Verificação, às 9h30. O padrão aparece desde 25/08 no histórico do n8n, e
**não** é sequela da recriação dos workflows em 04/09.

**A causa, isolada:** `src/lib/ciclo/autorizacaoDoMotor.ts` responde **503**
quando `CICLO_MOTOR_TOKEN` está ausente e **401** quando o cabeçalho não
confere. Veio 401 ⇒ a variável **existe** na Vercel; o valor que o n8n manda é
que não bate. (A credencial do n8n foi editada em 03/09 e continuou errada.)

### O passo

1. **Vercel** → o projeto → Settings → Environment Variables → `CICLO_MOTOR_TOKEN`,
   ambiente **Production**. Revele e copie o valor.
2. **n8n** (`n8n.v2o5.com.br`) → Credentials → **`CICLO_MOTOR_TOKEN`**
   (tipo *Header Auth*, id `gtQsydcfsiaOUHNl`). Dois campos:
   - **Name:** `Authorization`
   - **Value:** `Bearer <o valor copiado>` — **com o `Bearer ` na frente**.
     A rota compara contra a string inteira `Bearer ${token}`; o valor cru,
     sem o prefixo, dá exatamente o mesmo 401.
3. Salve.

> Se preferir girar o segredo em vez de descobrir o atual: escolha um valor
> novo, grave nos **dois** lugares e **redeploy** a Vercel (variável de
> servidor vale no próximo deploy).

### Como conferir

No n8n, abra `Motors Ciclo — Aviso de Verificação (equipe)` e clique em
**Execute Workflow**. O nó `Ler a fila de verificação` tem `neverError`, então
ele **não fica vermelho** — abra a saída dele e olhe o `statusCode`:

- `200` → resolvido.
- `401` → o valor ainda não bate (confira o prefixo `Bearer `).
- `503` → a variável sumiu da Vercel.

Escolha esse workflow, e não o Orquestrador: ele só **lê**. Ver o aviso sobre
`reservar` na Tarefa D.

---

## Tarefa B — a URL do feed no Google Merchant · **destrava fechar a exceção**

**Por que existe:** o feed do catálogo é servido por `/api/feed/xml`. Se o
Merchant ainda busca esse endereço **pelo alias**, fechar a exceção `(?!api/)`
faria o catálogo passar a depender de o buscador seguir um 308 — e catálogo é
anúncio no ar.

### ✅ O lado do Meta já foi conferido (2026-09-06) — e não é bloqueio

Lido pela API do Meta. **Nenhum feed do Meta aponta para o nosso site**, nem
pelo alias, nem pelo apex:

| Catálogo | Feeds | URL agendada |
|---|---|---|
| Dyones Oliveira Motors Store (`1669630410945715`, *vehicles*) | 1, semanal (sex 16:25) | `app.revendamais.com.br/…/610b8629….xml` |
| Estoque Motors Store (`617519794775501`, *commerce*) | 4 | **nenhum tem agendamento** — carga manual |

O Meta consome o XML da **RevendaMais**, não o nosso. Fechar a exceção não o
afeta.

> ⚠️ **Achado colateral, e vale mais que a tarefa:** esses catálogos estão
> quebrados. O único feed agendado falha desde **10/07** (`result: failed`, 0
> itens). O feed principal do outro catálogo falhou em **25/08**, também com 0
> itens, e os 45 produtos que ele mostra vêm de uma carga manual que não se
> renova — o site tem ~38. Se há anúncio dinâmico rodando, está sobre dado
> velho. Isto é tarefa própria, não deste handoff.

### O passo que sobrou

**Google** → Merchant Center → *Produtos* → *Feeds* → o feed → veja a URL. Se
disser `motors-site-oficial.vercel.app`, troque para
**`https://motorsstore.com.br/api/feed/xml`**. Só este ficou por sua conta:
não há ferramenta de Merchant Center do meu lado, só de Meta.

> **Anúncio ativo não recomeça do zero.** O `g:id` do feed é o id do veículo,
> não a URL — o Merchant reaproveita os produtos existentes e só atualiza os
> links. Já verificado na virada de 15/08.

### Depois da B, a exceção cai

**Só a B trava.** A Tarefa A é urgente, mas independente: os workflows do motor já
chamam o apex, então o token não muda nada no 301. Fechada a B, some o motivo
de `/api/*` escapar. São duas linhas:

- `next.config.ts`: o `source` vira `/:caminho*` (sem o `(?!api/)`).
- `tests/redirect-do-alias.test.ts`: o caso *"NÃO toca em /api"* hoje **exige**
  a exceção — ele passa a afirmar o contrário. Não apague o teste: inverta a
  asserção, para o dia em que alguém reintroduzir a exceção sem contexto.

---

## Tarefa C — conferir o **Site URL** do Supabase · achado de 06/09

Isto **não** é a linha de *Redirect URLs* (essa é inofensiva — ver abaixo). É a
`Site URL`, e ela importa mais do que parece.

**Por quê:** o link mágico da Garagem vai por `token_hash` para
`/api/auth/confirm`, e essa URL é montada a partir da **Site URL**. A rota
termina com `NextResponse.redirect(\`${origin}/...\`)` — **relativo ao host que
a serviu**. E `/api/auth/confirm` está sob `/api/`, ou seja, **isento do 301**.

Encadeando: se a Site URL ainda for o alias, o cliente clica no link, a sessão
é criada **no alias**, o cookie é gravado **no domínio do alias**, e o redirect
seguinte o joga numa página que leva 308 para o apex — onde ele **não tem
cookie**. Login que "funciona" e termina deslogado.

**O passo:** Supabase → Authentication → URL Configuration → **Site URL** deve
ser `https://motorsstore.com.br`. Se já for, não há nada a fazer.

### E a *Redirect URLs*? Pode remover, sem impacto

A entrada `https://motors-site-oficial.vercel.app/api/auth/callback` pode sair
quando você quiser. Três razões, todas conferidas no código em 06/09:

1. **Nenhuma chamada passa `emailRedirectTo` ou `redirectTo`** — nem a Garagem,
   nem a área do investidor, nem a recuperação de senha, nem o convite de
   usuário. A allowlist só é consultada quando alguém pede um destino; ninguém
   pede.
2. **Os e-mails não usam esse caminho.** Vão por `token_hash` para
   `/api/auth/confirm` — a rota `/api/auth/callback` trata `?code=` (PKCE), e
   nada no repositório gera link para ela.
3. **Não há OAuth.** Nenhum `signInWithOAuth` no código.

Ou seja: é superfície parada. Remover não quebra login nenhum — inclusive
link mágico já enviado, porque nenhum deles aponta para lá.

---

## Tarefa D — o que só o tempo prova

Editar workflow **ativo com gatilho de agenda** pela API já congelou o cron
nesta instância (04/09): ele segue `active: true` e não dispara. Depois da
migração de 06/09 o canário do agendador (Vigia da Vitrine, 5 min) continuou
batendo — mas isso prova a instância, não estes dois workflows.

**A prova é o disparo natural**, no dia seguinte:

```bash
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "https://n8n.v2o5.com.br/api/v1/executions?workflowId=9zYClIJd22nEBWQO&limit=3"
```

Espere um `startedAt` de hoje. Se **não** houver, o cron congelou: o conserto
conhecido é **recriar** o workflow (`POST /workflows` com os mesmos nós), não
desativar e ativar.

> ⚠️ **Sobre rodar o Orquestrador à mão.** O corpo dele é
> `{"reservar": true}` — a reserva grava em `eventos_ciclo` e é o que impede
> mensagem duplicada. **Enquanto a Tarefa A não estiver feita, rodar à mão é
> inofensivo** (morre no 401 antes de reservar ou enviar). Depois dela, uma
> execução manual é um **envio real** de WhatsApp para cliente. Para só testar
> a porta, use o Aviso de Verificação, que lê e não reserva.
>
> E execução manual **não prova o cron** — ela pula o gatilho de agenda, que é
> justamente a peça que congela.
