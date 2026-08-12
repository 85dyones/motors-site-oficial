# `supabase/` — migrações versionadas

Inaugurado no **Pacote 0.5** (2026-08-03). Até então o projeto não tinha
migração nenhuma, apesar de `CLAUDE.md:62` exigir: *"Migrações do Supabase são
versionadas em `supabase/migrations/`. Nunca altere schema direto pelo painel."*

## Estrutura

```
supabase/
├── migrations/     aplicadas em ordem por `supabase db push`
├── pendente/       SQL pronto, MAS que não pode ser aplicado ainda
├── manutencao/     correção de DADO, pontual — nunca vira migração
└── README.md
```

`pendente/` e `manutencao/` não são a mesma coisa, e a diferença importa:

- **`pendente/`** é antessala de **migração de schema**: o arquivo espera um
  passo manual (um cutover coordenado, por exemplo) e, depois de aplicado,
  **move para `migrations/`**. Um arquivo esquecido lá é um passo que ninguém
  deu — `tests/migracoes.test.ts` falha se sobrar algum.
- **`manutencao/`** é **correção de dado** que roda uma vez e fica arquivada
  como registro do que foi feito. Não descreve o estado desejado do schema,
  então nunca vira migração e não entra em `db push`. Cada arquivo traz a
  conferência antes e a verificação depois; o passo destrutivo fica comentado,
  para não rodar por copiar-colar distraído.

`pendente/` não é uma convenção do Supabase CLI — é uma salvaguarda deste
projeto. Ver o passo 4 do runbook abaixo para o motivo.

## Migrações

| Arquivo | O que faz |
|---|---|
| `20260803120000_baseline_inventario.sql` | Versiona a tabela de inventário, que nunca esteve sob controle de versão. Schema **reconstruído**, não verificado. |
| `20260803120100_renomear_veiculos_para_estoque_motors.sql` | `veiculos` → `estoque_motors` + view de compatibilidade. |
| `20260804193000_remover_view_compat_veiculos.sql` | Remove a view de compatibilidade após o cutover. |
| `20260804200000_adicionar_last_seen_at.sql` | Reconciliação com o feed: quem não veio no último sync não é exibido. |
| `20260807120000_midia_paga_e_auditoria.sql` | Módulo de mídia paga (telas A13/A14) + trilha de auditoria (A17), com RLS. Auditoria é append-only por ausência de policy de UPDATE/DELETE. |
| `20260807160000_ficha_propria_do_painel.sql` | Ficha própria do painel em `estoque_motors`: `placa`, `motor`, `cor_interna`, `donos_anteriores`, `garantia_fabrica`, `preco_compra`. **Nunca entram no mapeamento do sync n8n** — ver contrato abaixo. |
| `20260812120000_rls_leitura_de_site_settings.sql` | Fecha a leitura anônima de `site_settings`. `anon` passa a ver só o recorte que alimenta páginas públicas; `webhooks` (com `apiSecretToken`), `stock_overrides` (com `preco_compra`) e `bank_balances` exigem sessão ou chave de serviço. Autoconferência vira `anon` e tenta ler. **Aplicada em produção em 2026-08-12.** |
| `20260812150000_rls_escrita_de_site_settings.sql` | Fecha a **escrita** anônima de `site_settings` — o gêmeo do §3.4 que ficou de fora de `20260808120000`. Até 2026-08-12 um `PATCH` com a anon key respondia 200. INSERT/UPDATE passam a exigir `authenticated`; DELETE segue sem policy. Autoconferência vira `anon` e tenta o UPDATE. **Aplicada em produção em 2026-08-12.** |

## Runbook — aplicar migração quando `api.supabase.com` falha

Sintoma: `Failed to fetch (api.supabase.com)` em `supabase login`, `link` ou
`db push`. Diagnosticado em 2026-08-07.

**Não é o banco.** Medido no dia: o PostgREST do projeto responde 200 e
`api.supabase.com` responde `Unauthorized` — a rede alcança os dois. O que
falha é a **API de gerenciamento**, usada por `login` e `link`. Duas causas
somam:

1. O projeto **nunca foi linkado** (não há `supabase/config.toml` nem
   `.temp/`), e `db push` sem link precisa da API de gerenciamento.
2. `db.<ref>.supabase.co` é **IPv6-only** (sem registro A). Em rede sem IPv6
   funcional, a conexão direta ao banco também falha — e o erro se parece com
   o mesmo "failed to fetch".

### Caminho que não passa pela API de gerenciamento

Use `--db-url` com o **session pooler**, que tem IPv4
(`aws-0-sa-east-1.pooler.supabase.com` → 54.94.90.106). A string sai do
dashboard em **Connect → Session pooler** (porta 5432; a 6543, de transaction
mode, não serve para DDL).

⚠️ A URI contém a senha do banco: não a cole em chat, ticket ou commit.

**Passo 1 — conferir o histórico remoto ANTES de empurrar:**

```
supabase migration list --db-url "<uri-do-session-pooler>"
```

**Passo 2 — só então:**

```
supabase db push --db-url "<uri-do-session-pooler>"
```

### 🔴 Por que o passo 1 não é opcional

Se `supabase_migrations.schema_migrations` estiver **vazia** no remoto, o push
tenta reaplicar o histórico inteiro — e o baseline não é seguro nesse cenário:

- `20260803120000` faz `CREATE TABLE IF NOT EXISTS public.veiculos`. Como
  `veiculos` virou `estoque_motors` no cutover, o `IF NOT EXISTS` não protege
  nada: **cria uma tabela `veiculos` vazia** e, em seguida, policies públicas
  de INSERT/UPDATE sobre ela.
- `20260804193000` faz `DROP VIEW IF EXISTS public.veiculos`. Sobre uma
  *tabela*, isso é erro (`is not a view`) e **aborta o push no meio**,
  deixando a tabela fantasma para trás.

Se a lista vier vazia, registre as quatro antigas como aplicadas — elas estão,
de fato — e só depois empurre as novas:

```
supabase migration repair --status applied 20260803120000 20260803120100 20260804193000 20260804200000 --db-url "<uri-do-session-pooler>"
```

(É o mesmo remédio que o cabeçalho do baseline já previa.)

### Alternativa: SQL Editor do dashboard

Cole o conteúdo **integral e sem edição** de cada arquivo de
`supabase/migrations/`, na ordem do nome. Isso não viola o `CLAUDE.md:62`
("nunca altere schema direto pelo painel"): a regra existe contra schema *não
versionado*, e aqui o arquivo versionado continua sendo a fonte de verdade —
o que muda é só o transporte. Depois, quando o CLI voltar a funcionar, alinhe
o histórico com `supabase migration repair --status applied <timestamp>` para
cada uma aplicada por essa via.

## ⚠️ Contrato com o sync — campos do painel

Decisão do dono em 2026-08-07: o RevendaMais será descontinuado em breve, e os
campos que o feed não fornece são preenchidos **pelo painel**. A regra, literal:
*"se o campo não existe no sync, não sobrescreva, mantenha o atual, mesmo que
seja em branco."*

O upsert do workflow n8n (`Antigravity - Sincronizador de Estoque`) só escreve
as colunas que ele nomeia. As colunas da migração `20260807160000` ficam FORA
desse mapeamento — é isso que preserva o que foi digitado no painel a cada
ciclo. **Não adicione essas colunas ao workflow**: o feed não as tem, e o
upsert as sobrescreveria com vazio. Quando o RevendaMais desligar, o sync para
e todas as colunas passam a ser do painel, sem migração extra.

---

## ⚠️ Runbook do cutover `veiculos` → `estoque_motors`

**Este rename não é uma migração isolada. É um cutover coordenado em 4 passos,
e dois deles são manuais.**

A tabela de inventário é escrita por um agente externo — o workflow n8n
`Antigravity - Sincronizador de Estoque`. Renomear a tabela sem tocar no
workflow faz o sync apontar para um nome que não existe mais. Ele não quebra
alto: o estoque simplesmente para de atualizar, e o site segue servindo dados
cada vez mais velhos até alguém notar.

> **Correção de 2026-08-04:** este documento afirmava que o sync roda a cada 6
> horas. O workflow ao vivo tem **só um `manualTrigger`** e está `active: false`
> — não há agendamento nenhum. O "a cada 6h" vinha de uma cópia versionada que
> não corresponde ao que roda. Ver passo 3.

A view de compatibilidade criada no passo 2 existe exatamente para cobrir a
janela entre os passos 2 e 3.

### Passo 1 — deploy do código ✅ feito no Pacote 0.5

Os 10 pontos de acesso já usam `estoque_motors`. Enquanto o passo 2 não roda,
esse código aponta para uma tabela que ainda não tem esse nome.

> **Portanto: os passos 1 e 2 precisam ir juntos.** Se o deploy do código subir
> sozinho, o site cai no fallback e passa a servir `MOCK_ESTOQUE` — 5 veículos
> fictícios (`src/lib/supabase.ts:17`), em produção, sem erro visível.
> Se preferir margem de segurança, rode o passo 2 **antes** do deploy: a view de
> compatibilidade faz o código antigo continuar funcionando normalmente.

Guarda automatizada: `npm test` → `tests/nomenclatura-estoque.test.ts`.

### Passo 2 — aplicar as migrações

```bash
supabase db push
```

Cria `estoque_motors` e a view `veiculos` que aponta para ela. A partir daqui
**os dois nomes funcionam** — código novo e workflow antigo convivem.

Confirme que o rename ocorreu:

```sql
SELECT relname, relkind FROM pg_class
WHERE relname IN ('veiculos', 'estoque_motors');
-- esperado: estoque_motors = 'r' (tabela), veiculos = 'v' (view)
```

### Passo 3 — atualizar o workflow n8n 🔧 MANUAL, **PENDENTE**

> 🔴 **Os passos 3 e 4 foram executados fora de ordem.** O passo 4 foi aplicado
> em 2026-08-04 sem o passo 3. A view não existe mais e o workflow ao vivo
> ainda apontava para o nome antigo: **o sync está quebrado agora**, e só volta
> quando o workflow corrigido for importado.

A cópia exportada em 2026-08-04 revelou que **o workflow ao vivo não é o que
estava versionado aqui**. Diferenças que importam:

| | cópia antiga do repo | workflow ao vivo |
|---|---|---|
| nó de escrita | `Create a row` (nó Supabase, credencial) | `Upsert Veículo (HTTP)` (`httpRequest`) |
| alvo | `estoque_motors` | `/rest/v1/veiculos` ← **quebrado** |
| agendamento | `scheduleTrigger` a cada 6h | **só `manualTrigger`** |
| duplicatas | insert (AUDITORIA §1.4) | `Prefer: resolution=merge-duplicates` — upsert de verdade |
| credencial | credencial do n8n | **`service_role` JWT inline nos headers** |

Resolve AUDITORIA §5.9 e §1.4: o insert-sem-upsert já estava resolvido ao vivo;
o `"active": false` é real e o agendamento de 6h **não existe** no workflow que
roda — o sync só acontece quando alguém clica.

`Antigravity - Sincronizador de Estoque (estoque_motors).json` neste repositório
é a versão corrigida (alvo `estoque_motors`, campo `combustivel` restaurado),
com o JWT trocado por `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}` — **este repositório
é público e não pode conter a chave**. Importar exige configurar essa variável
no n8n.

### Passo 4 — remover a view de compatibilidade ✅ APLICADO 2026-08-04

Aplicado à mão pelo dono. Verificado: `public.veiculos` responde 404 /
`PGRST205`, `estoque_motors` segue servindo.

O SQL vivia em `pendente/`, **fora de `migrations/` de propósito**: se estivesse
dentro, o `supabase db push` do passo 2 aplicaria a remoção na mesma execução
que cria a view, fechando a janela de compatibilidade no instante em que ela é
aberta. Com a janela já fechada, foi movido para
`migrations/20260804193000_remover_view_compat_veiculos.sql`.

Guarda automatizada: `tests/migracoes.test.ts` exige que a remoção esteja
versionada, venha depois da migração que cria a view, seja idempotente, e que
`pendente/` não acumule passo manual esquecido.

### Rollback

Antes do passo 4, o rollback é barato — os dois nomes funcionam:

```sql
DROP VIEW IF EXISTS public.veiculos;
ALTER TABLE public.estoque_motors RENAME TO veiculos;
```

E reverter o deploy do código. Depois do passo 4, o workflow n8n já estará em
`estoque_motors` e o rollback exige desfazer o passo 3 também.

---

## Estado do cutover — verificado em 2026-08-03

Migrações aplicadas com sucesso. Verificado por consulta direta ao banco
(somente leitura), não pela mensagem de sucesso do `db push`:

| Verificação | Resultado |
|---|---|
| `estoque_motors` existe, com dados reais | ✅ 78 linhas, 27 colunas |
| A tabela é a original renomeada, não uma criada pelo baseline | ✅ tem `created_at`, coluna que o baseline não criava |
| View de compatibilidade `veiculos` responde | ✅ mesmas 78 linhas, mesmas colunas |
| `getEstoque()` da vitrine funciona | ✅ retorna estoque real |

**Passos 3 e 4 continuam pendentes** — o workflow n8n ainda aponta para o nome
antigo, e é a view de compatibilidade que o mantém funcionando. Enquanto ela
existir, o cutover parece completo sem estar.

## Resolvido no cutover

- **§5.6 — qual projeto é produção: `zwbqmzgnagfeqinqkolp`.** É o que estava em
  `.mcp.json`, no `.env.local` e no sincronizador do n8n. O `CLAUDE.md` dizia
  `lanatcqpskcmifuxfatn`; **corrigido em 2026-08-08**, com o dono confirmando o
  ref. Como `CLAUDE.md` está no `.gitignore`, essa correção vive só na máquina
  de quem trabalha no projeto — vale decidir se ele deveria sair de lá, senão a
  próxima cópia do repositório volta com o ref errado.
- **§5.3 — schema real conhecido.** O baseline foi corrigido contra o banco.
  A reconstrução original errava em 4 pontos: declarava `placa`, `fipe` e
  `preco_compra`, que não existem, e omitia `created_at`.

## 🔴 Dois bugs de produção que a verificação revelou

Nenhum é regressão do rename — as colunas nunca existiram. O rename só forçou
a primeira leitura real do schema, que os expôs.

- **`/api/financeiro/margens`** seleciona `preco_compra` explicitamente. A query
  falha inteira (`column estoque_motors.preco_compra does not exist`) e o painel
  de margens não lista nada.
- **`/api/financeiro/margens/consulta`** busca por `placa`, que também não
  existe. Aqui a falha é **silenciosa**: o código ignora o `error` e cai no
  fallback por ID. A busca por placa nunca funcionou.

Decisão pendente: criar as colunas e popular, ou remover as leituras do código.

## Pendências que ainda bloqueiam o Pacote 1

- **§5.4 — onde está a base histórica de vendas e leads.** Nenhum lead é
  persistido no Supabase; `/api/leads` e `/api/avaliacao` só repassam ao n8n.
  Bloqueia o planejamento do mutirão do manual §3.3, não a criação do schema.
- **§5.7 — testes de RLS** exigem instância Supabase de teste. O runner já
  existe; falta o alvo. Docker não está instalado nesta máquina, então
  `supabase start` exige instalar Docker Desktop — ou usar um segundo projeto
  Supabase como alvo de teste.
- **Tipo das colunas de imagem** (`whatsapp_images`, `web_full_images`):
  PostgREST não distingue `jsonb` de `text[]`. `supabase db pull` resolve.
