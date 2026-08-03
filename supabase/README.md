# `supabase/` — migrações versionadas

Inaugurado no **Pacote 0.5** (2026-08-03). Até então o projeto não tinha
migração nenhuma, apesar de `CLAUDE.md:62` exigir: *"Migrações do Supabase são
versionadas em `supabase/migrations/`. Nunca altere schema direto pelo painel."*

## Estrutura

```
supabase/
├── migrations/     aplicadas em ordem por `supabase db push`
├── pendente/       SQL pronto, MAS que não pode ser aplicado ainda
└── README.md
```

`pendente/` não é uma convenção do Supabase CLI — é uma salvaguarda deste
projeto. Ver o passo 4 do runbook abaixo para o motivo.

## Migrações

| Arquivo | O que faz |
|---|---|
| `20260803120000_baseline_inventario.sql` | Versiona a tabela de inventário, que nunca esteve sob controle de versão. Schema **reconstruído**, não verificado. |
| `20260803120100_renomear_veiculos_para_estoque_motors.sql` | `veiculos` → `estoque_motors` + view de compatibilidade. |

---

## ⚠️ Runbook do cutover `veiculos` → `estoque_motors`

**Este rename não é uma migração isolada. É um cutover coordenado em 4 passos,
e dois deles são manuais.**

A tabela de inventário é escrita por um agente externo — o workflow n8n
`Antigravity - Sincronizador de Estoque`, que roda a cada 6 horas. Renomear a
tabela sem tocar no workflow faz o sync apontar para um nome que não existe
mais. Ele não quebra alto: o estoque simplesmente para de atualizar, e o site
segue servindo dados cada vez mais velhos até alguém notar.

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

### Passo 3 — atualizar o workflow n8n 🔧 MANUAL

Em `n8n.v2o5.com.br`, workflow `Antigravity - Sincronizador de Estoque`:
o nó Supabase **`Create a row`** precisa apontar para `estoque_motors`.

O JSON neste repositório já foi atualizado e pode ser reimportado — mas ele é
uma **cópia exportada**, não o workflow ao vivo. Editar o arquivo não muda o que
está rodando.

Dois pontos a verificar enquanto estiver lá, ambos levantados em `AUDITORIA.md`:

- **`"active": false`** na cópia exportada (§5.9). Ou o workflow em produção é
  outro, ou o sync está parado. Vale descobrir qual antes de confiar no cutover.
- O nó é **`Create a row` — insert, não upsert** (§1.4). Como as reexecuções a
  cada 6h evitam duplicata é indeterminado pelo arquivo. Não é problema do
  rename, mas é a hora de olhar.

### Passo 4 — remover a view de compatibilidade

**Só depois de confirmar que o passo 3 funcionou**, com pelo menos um ciclo de
sync bem sucedido.

O SQL está em `pendente/PASSO_4_remover_view_compat_veiculos.sql`, **fora de
`migrations/` de propósito**: se estivesse dentro, o `supabase db push` do passo
2 aplicaria a remoção na mesma execução que cria a view, fechando a janela de
compatibilidade no instante em que ela é aberta.

Ao aplicar, mova o arquivo para `migrations/` com timestamp novo, para que o
histórico registre a remoção.

Guarda automatizada: `tests/migracoes.test.ts` falha se esse arquivo aparecer
em `migrations/`.

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
  `.mcp.json`. **`CLAUDE.md:21` está errado** — diz `lanatcqpskcmifuxfatn`.
  Como `CLAUDE.md` está no `.gitignore`, a correção não é versionável; vale
  decidir se ele deveria sair de lá.
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
