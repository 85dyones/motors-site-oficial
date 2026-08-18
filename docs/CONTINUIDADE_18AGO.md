# Continuidade — 18 de agosto

Estado para retomar numa conversa nova. `main` = `origin/main` em `5546a87`,
working tree limpo, **606 testes verdes**, typecheck e build limpos.

Relatório completo da revisão que originou este trabalho:
<https://claude.ai/code/artifact/7787f2df-1471-4b51-8d28-a62da17e1904>

---

## 1. Feito nesta sessão

### Resgate do trabalho solto — **concluído**

Todos os worktrees estão limpos. Nada mais pendente de commit.

| Commit | O que era |
|---|---|
| `64fd1f3` | Estilos de slider (pegador visível, 24px de toque). **Existia só na máquina**, nunca empurrado — resgatado por cherry-pick |
| `ae9e9ae` | Cabeçalho: a barra completa ligava em `sm:` e era **amputada entre 768–1024px** (o `globals.css` corta `overflow-x`). Agora vale de `lg:`, telefone em `xl:` |
| `6bdaff9` | Popups de lead: `autoFocus` condicional (o teclado virtual empurrava o botão de enviar para fora da tela), `max-h` com `dvh`, cabeçalho sticky, trava de rolagem do body |
| — | Alteração redundante do feed XML no worktree `nice-panini` **descartada** (já estava no main) |

### Correções — **concluídas**, todas em `5546a87`

> ⚠️ Um `git add -A` juntou as quatro correções num commit só. O conteúdo está
> correto e testado, mas o commit mistura assuntos — se for preciso reverter,
> reverta arquivo a arquivo, não o commit inteiro.

**C1 — custo de aquisição vazando para o Comercial** (estava em produção).
A rota do formulário de venda devolvia `preco_compra` sob o gate *"Fechar
venda do Ciclo"* (Admin **e** Comercial), mas o campo pertence a *"Ver custo
de aquisição e margem"*, onde a matriz exclui o Comercial. O valor ia para o
estado do componente de cliente. Agora o campo **nem é buscado** quando o
perfil não pode vê-lo. Admin e Financeiro seguem com o pré-preenchimento.

**C2 — `falha_envio` queimava o gatilho para sempre** (migração
`20260818120000`, ⏳ **ainda não aplicada**).
`boas_vindas` e `revisao_verificada` deduplicavam sem excluir `falha_envio`;
os outros dois gatilhos excluíam. Como o canal e-mail não tem transporte, quem
desligasse o WhatsApp mantendo o e-mail **nunca mais** receberia a boas-vindas,
nem religando. Violava a regra 2 ("a recusa nunca penaliza").

**R3 — idempotência do motor** (mesma migração `20260818120000`).
A rota afirmava que a reserva impedia envio duplicado; não impedia. Agora a
montagem **com reserva** é serializada por `pg_advisory_xact_lock`.

**R2 — vínculo da Garagem sem e-mail confirmado** (migração `20260818130000`,
⏳ **ainda não aplicada**).
`reivindicar_garagem()` ligava a conta pelo e-mail sem exigir
`email_confirmed_at` — a segurança dependia do checkbox "cadastro público
fechado" no painel. Agora exige a confirmação, com autoconferência que prova a
recusa.

**R1 — a Garagem dizia "não há veículo" quando a consulta falhava**.
`clientes`, `veiculos_vendidos` e a RPC de vínculo eram lidos sem checar
`error`. Agora há uma tela própria de indisponibilidade que **assume o erro em
vez de transferi-lo**, e a exportação de LGPD não emite mais um documento
afirmando que a Motors não tem veículo do titular.

> As duas migrações foram **ensaiadas em transação revertida** contra a
> produção (`BEGIN … ROLLBACK`) e passaram, incluindo as autoconferências.

---

## 2. Falta fazer — código

> **Atualização de 18/08, sessão seguinte — TUDO desta seção resolvido:**
>
> - **2.1 e 2.2 feitos.** As duas migrações aplicadas pelo dono e provadas
>   pelo efeito; livro-razão em 27/27. Toda migração agora termina com rodapé
>   de auto-registro (convenção no `supabase/README.md`), e o aplicador
>   node+pg está versionado em `supabase/manutencao/aplicar-migracao.js`.
> - **2.3 inteiro corrigido**, um commit por achado: #9 `95cb261` (token
>   próprio `CICLO_MOTOR_TOKEN` + comparação constante + rate limit), #8
>   `a35387b`, #7 `1309882`, #10 `ca63492` (**migração `20260818140000`
>   ensaiada, ⏳ aplicação pendente**), #11 `b3b8e47`, #13 `a56e1fb`.
> - **Pendências novas do dono:** gravar a `20260818140000`; gerar
>   `CICLO_MOTOR_TOKEN` na Vercel + credencial própria no n8n **antes do
>   deploy** deste lote (sem ela o motor responde 503 — e há divergência
>   sobre os 2 workflows estarem ligados ou não: conferir no n8n).
> - A recomendação de SEO (§6) foi entregue: `docs/RECOMENDACAO_SEO.md`.
>
> A seção original segue abaixo como estava.

### 2.1 Aplicar as duas migrações novas

```
supabase/migrations/20260818120000_falha_envio_nao_penaliza.sql
supabase/migrations/20260818130000_vinculo_exige_email_confirmado.sql
```

Ambas ensaiadas e aprovadas. **Depois de aplicar, registrar no livro-razão** —
ver 2.2.

### 2.2 D6 — nenhuma migração se auto-registra

O livro-razão `supabase_migrations.schema_migrations` foi criado e semeado com
19 versões pela `20260815120000`. **Nenhuma das posteriores se registra
sozinha**, e o runbook não avisa que é preciso fazê-lo à mão. Já falhou duas
vezes: `20260817120000` e `20260817130000` estão aplicadas (verifiquei pelo
efeito — as colunas existem e estão preenchidas) e **fora do livro-razão**.

O que fazer:
1. registrar as duas de 17/08 e as duas de 18/08 no livro-razão;
2. acrescentar ao rodapé de toda migração futura o `insert … on conflict do
   nothing` que se auto-registra;
3. documentar isso no runbook do `supabase/README.md`.

### 2.3 Achados do agente ainda não corrigidos

| # | O quê | Onde |
|---|---|---|
| 7 | `/api/ciclo/vendas` reporta `garagem: "conta_criada"` sem checar se o vínculo gravou — `error` descartado em dois pontos | `api/ciclo/vendas/route.ts:139-155` |
| 8 | O `catch` da fila devolve a vez sem conferir se conseguiu; se falhar, queima a janela de 21 dias do cliente | `api/ciclo/motor/fila/route.ts:96-103` |
| 9 | Token do motor é **o mesmo** da consulta de margens: quem tem a credencial de margens puxa nome, telefone e placa da base do Ciclo. Comparação de token não é constante no tempo, e a rota não está no matcher do proxy (sem rate limit) | `lib/ciclo/autorizacaoDoMotor.ts:52` |
| 10 | `registrar_desfecho_ciclo` sobrescreve desfecho já gravado — um retry pode virar `convertido` em `sem_resposta` | `20260814180000:624-633` |
| 11 | Foto sobe ao bucket **antes** do POST; se o POST recusar, o arquivo fica órfão | `GaragemVeiculo.tsx:394-405` |
| 13 | `consentimento_canais` nasce **pré-marcado** no formulário de venda — frágil sob LGPD | `FechamentoDeVenda.tsx:70` |

### 2.4 Pacotes incompletos

- **Pacote 1**: falta o **job de refresh diário** da matview `vw_ciclo_estado`.
- **Pacote 2**: faltam a **rotina noturna de vendas incompletas** e o **painel
  de completude por vendedor**.
- **Pacote 4**: a série de conformidade **só avança por clique** no painel —
  decidir se ganha cron.

---

## 3. Falta fazer — documentação

> **Atualização de 18/08 — D1 a D5 TODAS fechadas** (commit `c6d2b28`).
> Uma correção de rota: o D3 era pior do que descrito aqui — o
> `supabase_schema.sql` não recriava só leitura pública, recriava **escrita
> anônima** em `estoque_motors` (`update`/`insert` com `USING (true)`).
> Ganhou uma guarda que aborta a execução inteira, provada em transação
> revertida, mais a nota prometida no `supabase/README.md`. O texto original
> segue abaixo.


Nada disso foi feito ainda. Ordem por dano:

**D1 — o guia de auth instrui o erro que ele mesmo corrige.**
`docs/AREA_DO_CLIENTE_AUTH.md:69-70` manda usar `{{ .ConfirmationURL }}`;
trinta linhas acima o mesmo documento explica que esse formato quebra o login
e que o correto é `token_hash` → `/api/auth/confirm`. **Apagar o parágrafo
:69-70.**

**D2 — instrução que derrubaria quatro workflows do n8n.**
`docs/VIRADA_DE_DOMINIO.md:382` lista o "301 do endereço da Vercel" como
acabamento, mas o mesmo documento (`:44-47`) e o `MOTOR_DE_GATILHOS.md:116-118`
registram que **quatro workflows apontam para o alias**. Riscar o item com o
motivo.

**D3 — `supabase_schema.sql` é uma arma carregada.**
Recria `Allow public read/update/insert access` sobre `site_settings` e
`estoque_motors` — as policies que três migrações derrubaram. Colar o arquivo
reabre a escrita anônima. E `VIRADA_DE_DOMINIO.md:368` manda "ver a nota no
`supabase/README`" — **essa nota não existe**. Criar a nota, ou aposentar o
arquivo.

**D4 — o sync: decidido, falta alinhar.**
O dono confirmou: **o sync é para rodar**. O `supabase/README.md:176-179, 228`
afirma que o workflow tem só `manualTrigger` e está inativo; duas migrações de
17/08 afirmam cron de 6h; e o estoque foi de 78 → 94. **Ação:** conferir no n8n
se o workflow está ativo com cron de 6h e, se estiver, corrigir o README (a
cópia versionada divergiu do que está no ar — já aconteceu em 04/08).

**D5 — um terço do histórico do banco não documentado.**
A tabela de `supabase/README.md:34-52` para em 14/08: **8 das 25 migrações**
não aparecem. O diagrama de estrutura descreve `pendente/`, que não existe
mais, e omite `seeds/` e `templates/`. E há um `⏳ ainda não aplicada` na
`20260814150000`, que está aplicada desde 15/08.

> O dono autorizou wipeout dos dados (são de teste, recuperáveis), inclusive do
> financeiro. **Não foi preciso usar** — nada nas correções exigiu apagar dado.
> A autorização fica registrada para o caso de o mutirão da base histórica
> precisar.

---

## 4. Pendências do dono

| # | O quê | Por quê |
|---|---|---|
| 1 | **Fechar a primeira venda pela tela A19** | Todas as tabelas do Ciclo estão **vazias**: 0 clientes, 0 vendas, 0 revisões, 0 dias de série. O programa está inteiro no ar e nunca produziu um dado. Sem isso o relógio de 6 meses do §1.4 não começa |
| 2 | **Checklist do painel do Supabase** (6 itens) | Template do link mágico **recolado no formato `token_hash`**, cadastro público fechado, Redirect URLs, SMTP, teste de recebimento. Sem isso ninguém entra na Garagem |
| 3 | **Ligar os 2 workflows do n8n** | Criados **desligados** em 15/08. Rodar o orquestrador à mão, ler a execução, então ativar |
| 4 | **Conferir o sync no n8n** | Ver D4 — três documentos discordam e o dono já disse que é para rodar |
| 5 | **Clicar "Calcular série de hoje"** | `conformidade_diaria` tem 0 dias; a série do §1.4 nunca começou |
| 6 | `TURNSTILE_SECRET_KEY` real | Sem ela o código usa a chave de **teste** da Cloudflare, que aceita qualquer token — o captcha é decorativo |
| 7 | Envs do Upstash | Rate limit nunca disparou |
| 8 | Dar dono à fila de verificação | D9 é transitório; sem responsável nada entra na conformidade |
| 9 | `manychat-lead` responde 500 | Fluxo ManyChat morto desde 12/08 |
| 10 | Base histórica de vendas (§5.4) e origem das taxas (§5.5) | Decisões antigas, ainda sem resposta |

**Leads = 0** não é defeito: o dono confirmou que **ainda não rodaram leads**.
A rota foi testada em produção e valida corretamente.

---

## 5. Fatos verificados nesta sessão

Para não re-investigar:

- `main` = `origin/main` = `5546a87`; **todos os worktrees limpos**; 3 stashes
  antigos intactos (auto-declarados superados; apagar é irreversível)
- **Zero tabelas sem RLS** em produção; a `veiculos` fantasma **foi derrubada**
- As 9 policies `{public}` do financeiro **não são buraco**: todas passam por
  `has_finance_access()`/`is_admin()`, e o `anon` lê **0 linhas** em todas
- Livro-razão com 23 versões; **2 migrações aplicadas fora dele** (as de SEO)
- Domínio `motorsstore.com.br` no ar: canonical, `og:url` e `Sitemap:` corretos
- Deploy **em dia** com o main
- `CLAUDE.md` **está** no `.gitignore` (linha 59) e **não** é rastreado — as 7
  regras invioláveis somem num clone. (Um agente afirmou o contrário; medi.)
- `SUPABASE_SERVICE_ROLE_KEY`: **não está ausente** (confirmado pelo dono). A
  sonda sem token devolve 401, não 503, então não serve de prova
- `estoque_motors` = 94 veículos

---

## 6. Recomendação de SEO — pendente de escrever

O dono pediu a recomendação de SEO para o projeto e ela **não foi entregue**
nesta sessão (o contexto acabou antes). É o primeiro item a tratar na conversa
nova.

Pontos de partida já levantados:

- O domínio virou em 15/08 e o canonical/sitemap/og já respondem certo — mas
  **falta o 301 do alias da Vercel**, e ele não pode ser feito ingenuamente
  porque **quatro workflows do n8n apontam para o alias** (ver D2). A saída
  provável é redirecionar só as rotas de página e preservar `/api/*`
- `descricao_seo` existe e está preenchida em **41 dos 94** veículos — os
  outros 53 caem no texto genérico
- Existe trabalho de conteúdo em `conteudo-seo/` e integração com o Search
  Console (`gsc.js`), de 17/08
- `TRACKING_SPEC.md` tem **zero** menções a ciclo/garagem — o Pacote 9
  (eventos de ciclo no tracking) não foi iniciado
- Posicionamento definido: **"seleção", não "premium"**; frase-mãe *"o carro
  que passou"*; alcance local 50 km, digital PR+SC
