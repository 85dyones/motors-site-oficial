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

## Pendências que bloqueiam o Pacote 1

Herdadas de `AUDITORIA.md` e **não resolvidas** no Pacote 0.5:

- **§5.3 — o schema real de `estoque_motors` é desconhecido.** O baseline é
  reconstruído a partir do workflow n8n, dos `ALTER TABLE` de
  `supabase_schema.sql` e das colunas lidas pelo código. Os tipos são a parte
  mais frágil. Rodar `supabase db pull` e substituir o baseline assim que
  houver credencial.
- **§5.6 — qual projeto Supabase é produção.** `CLAUDE.md:21` diz
  `lanatcqpskcmifuxfatn`; `.mcp.json` diz `zwbqmzgnagfeqinqkolp`. **Resolver
  antes de rodar `db push`** — é a diferença entre migrar produção e migrar
  outra coisa.
- **`.env.local` com 15 de 18 variáveis vazias**, incluindo as do Supabase.
- **§5.7 — testes de RLS** (Pacote 1) exigem instância Supabase de teste, local
  via CLI ou branch do projeto. Decisão de infra ainda em aberto.
