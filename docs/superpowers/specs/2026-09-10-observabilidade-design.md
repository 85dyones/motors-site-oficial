# Observabilidade — o vigia que não dorme junto

**Data:** 2026-09-10 · **Status:** desenho aprovado pelo dono, em implementação
**Revisão 2 (2026-09-10):** o destino da natureza `quebra` deixou de ser o Sentry e passou a ser **em casa** — ver **§12**, que prevalece sobre o que estiver em conflito nas seções 1–11. O texto original fica como está, de propósito: ele é o registro de por que o Sentry foi cogitado e do que se abriu mão ao recusá-lo.
**Origem:** item "observabilidade (fila parada, erro, alerta)" da F2 do `motors-handoff/docs/fases/PLANO.md`, trazido para antes da F1 por decisão do dono em 2026-09-10.

---

## 1. Por que agora, e por que não é "instalar o Sentry"

Toda falha cara registrada neste projeto teve a mesma forma: **nada quebrou, algo parou, e ninguém viu por semanas.**

| Quando | O que parou | Quanto tempo ficou parado | Como foi descoberto |
|---|---|---|---|
| 31/08 → 02/09 | CAPI do Meta parada — o log da falha existia, ninguém via | 2 dias | auditoria manual |
| ago → 06/09 | motor do Ciclo em 401 | semanas; 0 linhas nas tabelas | inspeção do banco |
| ago | rota de margem em 404 → módulo virou lista vazia | semanas | alguém sentiu falta |
| ago | LeadPopup desarmado (cleanup + `hasMountedRef`) | prod e dev, campanhas mortas | teste em dev |
| 31/08 → 03/09 | gate de consentimento matou toda conversão; só o PageView passou | 3 dias | o PageView passando fez tudo parecer saudável |

Em 02/09 nasceu `src/lib/alertaDeFalha.ts` — o primeiro instrumento. Ele cobre **5 pontos de chamada** e o próprio cabeçalho nomeia onde não chega: timeout, OOM, deploy quebrado. Além disso, **43 das 49 rotas de API têm `catch` que engole sem avisar**, e **nada** enxerga o navegador do cliente — onde a máquina de conversão vive.

Um fato técnico organiza tudo: **`catch` que engole é invisível para o Sentry também.** O Sentry captura exceção *não tratada*. Rota que faz `try { … } catch { return NextResponse.json([]) }` não solta exceção; o Sentry não vê. As 43 rotas dão trabalho em qualquer desenho — a escolha é *para onde vai a linha* escrita em cada `catch`.

## 2. Decisões do dono (2026-09-10)

1. **Profundidade:** Sentry (navegador + servidor + edge) + log drain da Vercel + varredura das 43 rotas. Três camadas, agora.
2. **Arquitetura:** fronteira por natureza do evento (abordagem C, abaixo). Rejeitadas: "Sentry ao lado, `alertaDeFalha` congelado" (deixa parada de negócio sem dono) e "tudo no Sentry" (fica mudo quando a cota estoura — que é justamente durante o incidente grande).
3. **PII:** contexto **completo** do lead no Sentry — `lead_id`, e-mail e telefone — **desde o primeiro deploy**. Obriga: `/privacidade` declarando subprocessador e transferência internacional *no mesmo PR* que liga o envio; retenção definida de propósito na organização do Sentry. Registrado que leads já têm PII sem prazo no nosso banco e passam a ter uma segunda cópia, com prazo próprio.
4. **Região do Sentry:** **EU** (irreversível após criar a organização). Proposta do assistente; o dono não objetou.
5. **Multi-tenant:** `org_id` como tag em todo evento desde o primeiro dia — a costura de SaaS já existe no banco (`org_padrao()`, 12 migrações com `org_id`), e a instrumentação não pode nascer sem ela.

## 3. A régua

> **Exceção → Sentry. Invariante de negócio violada → n8n → WhatsApp. Ausência de acontecimento → `/api/saude` → n8n de hora em hora.**

| Natureza | Sinal | Destino | Pergunta que responde |
|---|---|---|---|
| **Quebra** | algo lançou | Sentry | *o que estourou, e onde?* |
| **Parada** | nada lançou; a operação parou | `alertarFalha` → n8n → WhatsApp | *quem precisa saber agora?* |
| **Ausência** | não aconteceu o que devia | `/api/saude`, lida pelo n8n | *ainda está vivo?* |

Por que a fronteira é por natureza e não por gravidade: o WhatsApp é o canal que a loja **de fato lê**; o Sentry é fila de triagem. Parada de negócio não gera exceção e por isso nunca chegaria ao Sentry sozinha; e o aviso de negócio **não pode depender** do fornecedor estrangeiro — o vigia não morre junto com o vigiado, que é o defeito que `alertaDeFalha.ts` foi escrito para resolver.

## 4. As peças

### 4.1 `@sentry/nextjs` (v10.x; declara `next: ^16.0.0-0`)

Três runtimes, três arquivos de init:

- `src/instrumentation.ts` — `register()` importa o config de servidor ou de edge conforme `process.env.NEXT_RUNTIME`; exporta `onRequestError = Sentry.captureRequestError`. **Autoconfere o `org_id` aqui**, no boot do runtime `nodejs` (ver 4.4).
- `src/instrumentation-client.ts` — init do navegador.
- `sentry.server.config.ts` e `sentry.edge.config.ts` na raiz (o edge existe porque `src/proxy.ts` roda lá).
- `next.config.ts` envolvido em `withSentryConfig`.

Configuração comum aos três, com os motivos:

| Opção | Valor | Por quê |
|---|---|---|
| `sendDefaultPii` | `true` | decisão 3 |
| `beforeSend` | remove **sempre** os cabeçalhos `Cookie` e `Authorization`, e qualquer campo cujo nome contenha `token`, `secret`, `key` | PII completo é *identidade do lead*, não sessão do staff. O cookie `sb-*-auth-token` de quem está logado no painel não pode ir para fornecedor nenhum, com ou sem LGPD. |
| `tracesSampleRate` | `0.05` em produção, `0` fora | rastreio de performance não é o objetivo; 5% dá noção de latência sem consumir cota |
| `replaysSessionSampleRate` / `replaysOnErrorSampleRate` | `0` / `0`; integração de replay **não carregada** | fora de escopo (§10); peso no navegador |
| `tunnelRoute` | `/monitoramento` | bloqueador de anúncio derruba `*.sentry.io`; numa máquina de conversão isso apagaria justamente o erro do visitante. Fora de `/api/` de propósito: o alias tem exceção para `/api/`, e `robots.ts` bloqueia sob `/api/`. |
| `ignoreErrors` / `denyUrls` | lista inicial: extensões de navegador (`chrome-extension://`, `moz-extension://`), `ResizeObserver loop`, `Non-Error promise rejection captured`, scripts de terceiros (pixel, Turnstile, GTM) | filtro de ruído desde o primeiro dia — a cota se consome em horas numa enxurrada (§8, risco 3) |
| `environment` | `process.env.VERCEL_ENV ?? "desenvolvimento"` | separa preview de produção; mesmo valor que `alertaDeFalha` já usa |
| `release` | injetado pelo `withSentryConfig` a partir do SHA da Vercel | liga erro a deploy — é o que responde "foi o deploy de ontem?" |
| `enabled` | `!!process.env.NEXT_PUBLIC_SENTRY_DSN` | sem DSN, nada sobe — padrão do projeto: falta de configuração degrada, não quebra |

`withSentryConfig`:

| Opção | Valor | Por quê |
|---|---|---|
| `org`, `project`, `authToken` | das envs | o token é segredo de build, só na Vercel |
| `sourcemaps.deleteSourcemapsAfterUpload` | `true` | source map público ao lado de erro com telefone é o pior par possível (§8, risco 4) |
| `widenClientFileUpload` | `true` | stack trace legível no navegador |
| `tunnelRoute` | `/monitoramento` | idem acima |
| `silent` | `!process.env.CI` | não poluir o build local |

**Onde o usuário é anexado (`Sentry.setUser`)**: só nos caminhos de lead — `POST /api/leads`, `POST /api/avaliacao`, e no cliente no submit do `LeadPopup` e do modal de lead da PDP. No servidor, depois do insert: `{ id: lead_id, email, phone: telefone_e164 }`. No cliente, no submit, o `lead_id` ainda não existe — vai `{ email, phone, ag_uid }`, e o `ag_uid` é o elo que já liga navegação a lead no banco. Nunca no layout global: identidade de lead no escopo global vazaria para erro de outra pessoa na mesma instância.

**`org_id`** como tag em todo evento (`Sentry.setTag("org_id", …)`), servidor e navegador (§4.4).

### 4.2 `alertaDeFalha` — intocado por dentro

Nenhuma linha da implementação muda. Carência de 30 min por assunto, contagem de suprimidas e teto de 3 s ficam como estão. O que muda é que ele passa a ser chamado **através de `registrarFalha`** (§4.4), e cresce dos 5 pontos atuais para toda parada de negócio que a varredura das 43 rotas classificar assim.

Os 5 pontos atuais (`meta-capi.ts` ×4, `supabase.ts` ×1) migram para `registrarFalha("parada", …)` no PR 1, mantendo o mesmo `assunto` — a carência agrupa por ele e não pode mudar de chave sem motivo.

### 4.3 `/api/saude` — leitura pura, não avisa ninguém

**Quem abre, quando, que decisão sai:** o n8n, de hora em hora; a decisão é *acionar `alertarFalha` ou não* — e ela é do n8n, não da rota.

Por que a rota não avisa: `after()` e `unstable_cache` estourando fora da requisição derrubaram o feed que deveriam reportar; aconteceu aqui. Alerta embutido no caminho da leitura é dependência a mais no lugar onde não se quer nenhuma. A rota lê e responde; quem compara com faixa e aciona é o workflow.

**Auth:** `Authorization: Bearer ${SAUDE_TOKEN}`; **503 sem a env**, 401 com token errado — o mesmo padrão da conferência diária da F0.5.

**Resposta (v1):**

```json
{
  "em": "2026-09-10T15:00:00.000Z",
  "org_id": "…",
  "leads_ultima_hora": 3,
  "leads_ultimas_24h": 41,
  "sync_idade_minutos": 212,
  "motor_fila_pendentes": 0,
  "motor_ultimo_desfecho_idade_minutos": 38,
  "estoque_publicados": 38
}
```

Fontes: `leads` (por `created_at`), `estoque_motors.last_seen_at` (máximo), tabelas do motor do Ciclo (fila e desfechos), `estoque_motors` publicados. **Contagem de eventos CAPI fica fora** da v1: não existe tabela que os registre, e a falha de envio já é coberta por `alertaDeFalha("meta-capi")`.

Faixas ficam **no n8n**, não em código — são parâmetro de operação, e o projeto já tem a regra "número de negócio em código = errado". Valores iniciais propostos ao dono para o workflow: `sync_idade_minutos > 480` (cron de 6 h + folga), `leads_ultimas_24h == 0` em dia útil, `motor_fila_pendentes > 0` por mais de 2 leituras seguidas.

O ping horário também é **verificação externa de vida**: se `/api/saude` não responder, o n8n aciona `alertarFalha`-equivalente por conta própria. Isso cobre "o site caiu" sem depender de nada que rode no site.

### 4.4 `registrarFalha` — a função que obriga a escolha

O custo da abordagem C é um julgamento por ponto de instrumentação. Julgamento apodrece. A contenção é uma assinatura **sem default**:

```ts
// src/lib/observabilidade.ts
export type Natureza = "quebra" | "parada" | "ambos";

export async function registrarFalha(
  natureza: Natureza,          // obrigatório — não existe default, não existe "deixa como está"
  assunto: string,             // chave curta e ESTÁVEL, como hoje — é por ela que a carência agrupa
  detalhe: unknown,            // texto ou o próprio erro; se for Error, vai com stack
  contexto?: { rota?: string; lead_id?: string; extra?: Record<string, unknown> },
): Promise<void>
```

- `quebra` → `Sentry.captureException` (se `detalhe` for `Error`) ou `captureMessage`, com `assunto` como fingerprint e `contexto` como tags/extra.
- `parada` → `alertarFalha(assunto, texto)`. Nada vai para o Sentry.
- `ambos` → os dois. Para a quebra que a loja precisa saber sem esperar triagem (ex.: o próprio `/api/leads` lançando — cada minuto é lead perdido).

**Nunca lança, nunca bloqueia** — mesma garantia do `alertaDeFalha`. Um `try/catch` interno com `console.error` como último recurso.

**`org_id`:** vem de `NEXT_PUBLIC_ORG_ID` nos três runtimes — não é segredo, é o id do tenant, que num SaaS estaria em toda página. **Nenhum destino de erro consulta o banco**: o caminho da falha é onde não se quer dependência nenhuma. A autoconferência fica no `register()` do runtime `nodejs`: uma leitura de `org_padrao()` no boot e, se divergir da env, `registrarFalha("quebra", "org-id-divergente", …)` uma vez. Sem a env, a tag vale `"desconhecida"`. Hoje é uma env porque há um tenant; quando existir resolução de tenant por requisição, a tag passa a vir de lá — e é só esse ponto que muda.

É função pública de um módulo próprio. Os módulos de negócio importam `registrarFalha`, nunca `Sentry` nem `alertarFalha` diretamente — trava de teste garante (§7).

### 4.5 Log drain da Vercel → o mesmo webhook n8n

Conta confirmada como **Pro** em 2026-09-10 (log drain não existe no Hobby). Configuração no painel da Vercel, não em código: fonte `function` + `build`, formato JSON, destino o webhook que `N8N_WEBHOOK_ALERTA_URL` já aponta. O drain manda tudo da fonte; **é o n8n que descarta o que não for `error`**, aplica a mesma carência por assunto (`vercel:function`, `vercel:build`) e manda ao WhatsApp.

Cobre o que nenhum código sobrevive para contar: timeout de função, OOM, build quebrado. O `onRequestError` do Sentry cobre boa parte disso também; o drain é a rede por baixo, e é barato.

## 5. As 43 rotas — regra do `catch`

Toda cláusula `catch` em `src/app/api/**/route.ts` passa a conter **uma de duas coisas**:

1. uma chamada `registrarFalha(…)`, com a natureza decidida na revisão do PR 2; ou
2. o marcador literal `/* falha esperada: <motivo> */`, para o `catch` que trata um caso legítimo (ex.: JSON malformado do cliente → 400; 404 de recurso que pode não existir).

O marcador é a válvula: sem ela a trava forçaria ruído em `catch` legítimo, e ruído é o que faz alerta ser silenciado. Com ela, a exceção é explícita, tem motivo escrito e aparece no `grep`.

**Padrão sugerido para a natureza**, a ser confirmado rota a rota:

| Rota | Natureza | Motivo |
|---|---|---|
| `/api/leads`, `/api/avaliacao`, `/api/capi` | `ambos` | lead perdido é dinheiro; a loja precisa saber já |
| `/api/estoque*`, `/api/ciclo/*`, `/api/funil/*` | `quebra` | painel/operação; entra na triagem |
| rotas de auth (`/api/auth/*`) | `quebra` | com `beforeSend` tirando cookie/authorization |
| `catch` de parse de entrada | marcador | é o cliente errando, não o sistema |

## 6. `/privacidade`

Entra no **PR 1**, no mesmo deploy que liga o DSN. Declara: o Sentry como subprocessador (Functional Software, Inc., dados hospedados na região EU), a finalidade (diagnóstico de erro), os dados (identificação do lead, e-mail, telefone, endereço IP, navegador, página), o prazo de retenção (o configurado na organização do Sentry — conferir no cadastro e escrever o número), e a transferência internacional com as salvaguardas do fornecedor. O mecanismo de oposição já existente na página passa a cobrir também este envio.

## 7. Prova

Este repositório confirma por teste, não por inspeção. A instrumentação ganha quatro:

| Teste | O que prova |
|---|---|
| `tests/observabilidade.test.ts` | `natureza` sem default (erro de tipo se omitida); `"parada"` não toca o Sentry; `"quebra"` não toca o webhook; `"ambos"` toca os dois; `org_id` presente em todo evento; nunca lança mesmo com os dois destinos falhando |
| `tests/rotas-instrumentadas.test.ts` | **a trava**: varre `src/app/api/**/route.ts` e reprova todo `catch` sem `registrarFalha(` nem o marcador. É o que impede as 43 voltarem a ser 43. Usa `tests/fonte.ts` (sem comentários) para o `registrarFalha` — e lê **com** comentários para o marcador. Guarda de vazio: falha se encontrar zero rotas (ver `indexOf -1 passa por ordem válida`). |
| `tests/fronteira-observabilidade.test.ts` | nenhum arquivo de `src/` fora de `src/lib/observabilidade.ts` e dos configs importa `@sentry/*`; nenhum fora de `observabilidade.ts` importa `alertaDeFalha` (depois da migração dos 5 pontos) |
| `tests/saude.test.ts` | formato da resposta; 503 sem env; 401 com token errado; leitura que falha devolve `null` no campo e não derruba a rota |

**Mutação obrigatória antes do merge do PR 2:** apagar a chamada `registrarFalha` de uma rota real (não da função nova — no *ponto de chamada*), rodar a suíte cheia e ver a trava vermelha; restaurar pelo arquivo inteiro, não por `replace`. Sem isso a trava pode estar verde guardando nada.

**Aviso operacional:** trava que varre `src/` só acusa na suíte **cheia**. Rodar só o teste da tarefa esconde a reprovação até a revisão.

Os dublês de Sentry e `fetch` nos testes devem **projetar** o comportamento (contar chamadas, inspecionar o payload) — dublê constante já apagou comportamento aqui: `sortear: () => 0` deixou 2.429 testes cegos para o embaralhamento ter virado identidade.

## 8. Riscos e as provas que cada um exige

| # | Risco | Prova obrigatória |
|---|---|---|
| 1 | `withSentryConfig` interferir no `redirects()` do alias — o `(?!api/)` protege 4 workflows do n8n e o SEO do domínio. Também: `next build` do Next 16 usa Turbopack; o upload de source map precisa funcionar nesse caminho. | depois do deploy: `curl -I https://motors-site-oficial.vercel.app/sobre` → **301**; `curl -I …vercel.app/api/estoque` → **200**; build da Vercel mostrando o upload |
| 2 | Peso no navegador — é uma máquina de conversão | comparar o tamanho do bundle do cliente antes/depois no log de build; sem replay, sem tracing pesado |
| 3 | Cota consumida em horas numa enxurrada, e sumindo no incidente grande | `ignoreErrors`/`denyUrls` desde o PR 1; a carência do `alertaDeFalha` continua sendo o canal que sobrevive |
| 4 | Source map público | `deleteSourcemapsAfterUpload: true`; `curl` num `.map` de produção → 404 |
| 5 | `SENTRY_AUTH_TOKEN` no repo | `.env*` já é gitignored; a env vai só na Vercel; `git check-ignore` antes do commit |

## 9. Rollout — três PRs, uma tarefa cada

| PR | Conteúdo | Critério de saída |
|---|---|---|
| **1 — o vigia** | SDK nos três runtimes · `observabilidade.ts` · `org_id` · os 5 pontos atuais migrados · `/privacidade` · `.env.example` · `tests/observabilidade` e `tests/fronteira-observabilidade` | erro forçado (rota de teste removida antes do merge) aparece no Sentry com `org_id`, `release` e `environment`; alias ainda redireciona (risco 1); `/privacidade` no ar declarando o subprocessador; CAPI em 401 simulada ainda chega ao WhatsApp |
| **2 — as 43** | uma linha em cada `catch` · a trava · a mutação | trava vermelha quando a chamada some; suíte cheia verde |
| **3 — a vida** | `/api/saude` · workflow horário no n8n · log drain no painel da Vercel · `tests/saude` | motor parado por 2 h em teste real gera WhatsApp; site derrubado em preview gera WhatsApp pelo ping externo |

Cada PR passa pelo `qa-guardian` antes do merge, como toda entrega. Trabalho em worktree próprio, a partir de `main` — o diretório principal está com o branch da F0.5 e alterações não commitadas de outra sessão.

## 10. Fora de escopo (de propósito)

- **Session Replay** — rejeitado nesta fase: peso no navegador, 50 replays/mês na faixa gratuita, e máscara de texto que pode ser furada sem querer. Reavaliar quando houver dado do Sentry mostrando *onde* a conversão morre.
- **Contagem de eventos CAPI em `/api/saude`** — sem tabela de origem; a falha de envio já está coberta.
- **Tela de tenant / seleção de org** — a costura é a tag; a tela é da fase em que houver segundo cliente.
- **Alerta de performance / SLO** — `tracesSampleRate` baixo só para noção; alerta disso é depois.
- **Migração de banco** — nenhuma. Tudo aqui é código de aplicação e configuração de painel.

## 11. O que só o dono resolve

1. Criar a organização no Sentry **na região EU**, um projeto (`motors-site`), e conferir/definir o prazo de retenção — o número vai para a `/privacidade`.
2. Colocar na Vercel: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_ORG_ID`, `SAUDE_TOKEN`.
3. Configurar o log drain no painel da Vercel (PR 3).
4. Aprovar as faixas iniciais do workflow horário (§4.3) — são parâmetro de operação, não código.

---

## 12. Revisão 2 — destino em casa

Escrita em 2026-09-10, horas depois das seções 1–11, quando o dono perguntou o custo real
do Sentry na equação e se dava para fazer por aqui o que ele entrega.

**A costura não mudou.** A régua do §3 — exceção → fila de triagem; invariante de negócio →
WhatsApp; ausência → `/api/saude` — vale inteira, e `registrarFalha` continua sendo a função
que obriga a escolha. Muda só **para onde a natureza `quebra` vai**: em vez de subir para o
Sentry, ela vira linha na tabela `erros`, no nosso banco.

### Por que

Quatro fatos que não pesaram direito quando o §4.1 foi escrito:

1. **O repositório é público** — está em letras garrafais no `.gitignore`. O melhor argumento
   do Sentry era o símbolo automático: stack trace legível sem expor source map. Num
   repositório público não há o que expor.
2. **`withSentryConfig` era o único ponto do desenho que ameaçava a conversão.** Ele envolve
   o `next.config.ts`, que carrega o `redirects()` do alias com o negativo `(?!api/)` — e
   quatro workflows do n8n dependem dele. Sem Sentry, **`next.config.ts` não é tocado em PR
   nenhum**, e o risco 1 do §8 deixa de existir.
3. **PII de lead não ganha um segundo processador.** A decisão 3 do §2 (contexto completo)
   fica atendida por `ag_uid` na linha — o elo que `/api/leads` já grava — com nome, e-mail e
   telefone continuando só onde já estão.
4. **Num SaaS, cada vendor que recebe PII é um contrato por cliente.** A costura de
   multi-tenant já existe no banco (`org_padrao()`); `erros` nasce com `org_id` e RLS como
   qualquer tabela do núcleo, e a triagem por tenant vem de graça.

Do que se abriu mão: **sem *breadcrumbs*** (o que o visitante fez antes de quebrar),
agrupamento mais tosco (hash de assunto + mensagem normalizada), e stack trace traduzido por
script quando fizer falta. Cerca de um dia a mais de trabalho. O Sentry continua **plugável
atrás de `registrarFalha`** se a triagem em casa se mostrar curta — é a vantagem de a
fronteira ser a função, e não o fornecedor.

### O que muda, seção por seção

| § | Como fica |
|---|---|
| **2.1** | profundidade igual (três camadas); só o destino da `quebra` muda |
| **2.3** | PII: `ag_uid` na linha de erro; `lead_id` fica **nulo na v1** — o `insert` das duas rotas não tem `.select()`, e obter o id custaria um round-trip no POST que o visitante espera. Nome, e-mail e telefone não são copiados: a ficha do lead já os tem |
| **2.4** | região do Sentry: **sem efeito** (não há Sentry) |
| **4.1** | substituído por peças nossas: `src/lib/observabilidade.ts` (a costura, isomórfica), `src/instrumentation.ts` (só `onRequestError`, hook nativo do Next — sem SDK, sem tocar `next.config.ts`), `src/lib/observabilidade-cliente.ts` + `src/components/CapturaDeErros.tsx` (captura no navegador, ~2 KB, **sem envolver nenhum global**) e `src/app/api/erros/route.ts` (a porta, 204 sempre). Mais os dois boundaries que o projeto nunca teve: `src/app/error.tsx` e `src/app/global-error.tsx` |
| **4.4** | `org_id` vem do **default da tabela** (`org_padrao()`), não de env — nenhum destino de erro consulta o banco para descobrir quem é |
| **6** | sem subprocessador a declarar. Fica um parágrafo em `finalidades` (diagnóstico de erro: mensagem, página, navegador, identificador de navegação) e a retenção de **90 dias** em `retencao`. Vai no PR 2 |
| **8** | riscos 1, 4 e 5 (interferência no `next.config`, source map público, `SENTRY_AUTH_TOKEN`) **caem**. Entram **enxurrada de INSERT** (exceção em página quente = uma gravação por requisição → carência de 10 s por hash, `suprimidas` na linha seguinte) e **PII em mensagem** (erro do PostgREST cita valores: `higienizar()` mascara sequências ≥ 8 dígitos e e-mails; `url` sem query) |
| **9** | PR 1 passa a ser "a costura e a captura" |
| **10** | "migração de banco — nenhuma" deixa de valer: há **uma**, `erros`, e ela precisa estar **gravada antes** do deploy do código |
| **11** | envs: `OBSERVABILIDADE` (uma só, de servidor — sem `NEXT_PUBLIC_`) e `SAUDE_TOKEN`. Caem `NEXT_PUBLIC_ORG_ID` e as quatro do Sentry |

### Três achados da revisão adversarial que valem registro

1. **O Next `await`-a o `onRequestError`** (`next/dist/server/base-server.js:450`). O teto da
   gravação entra no tempo da resposta de erro — daí o **disjuntor**: depois de um timeout ou
   falha de rede no INSERT, a instância pula o banco por 60 s e vai direto ao webhook. Sem
   ele, com o Supabase fora, cada requisição da vitrine pagaria o teto de novo.
2. **`src/lib/supabase.ts` é importado por 9 client components**, então `alertaDeFalha` já vai
   para o navegador hoje. `observabilidade.ts` tem de ser **isomórfica**: sem `server-only`
   (que nem está instalado), sem `next/headers`, sem `crypto`, com guarda de `typeof window` e
   cliente de serviço criado só na primeira gravação.
3. **`error.tsx` explícito não dispara o evento `error` da `window`** em produção — só
   `console.error` (`next/dist/client/react-client-callbacks/error-boundary-callbacks.js:77`).
   Por isso o boundary chama a captura ele mesmo, e é o `digest` que liga a linha do navegador
   à linha que o servidor gravou pelo mesmo erro.
