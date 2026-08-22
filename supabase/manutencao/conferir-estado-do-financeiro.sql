-- ===========================================================================
-- Conferência do módulo financeiro — SOMENTE LEITURA
-- ===========================================================================
-- Cole no SQL Editor do Supabase e rode. Não altera nada: só pergunta ao banco
-- se ele tem o que as migrações prometeram. Toda linha deve sair com ok = true.
--
-- Por que existe, se as migrações já se autoconferem:
--
--   A autoconferência de uma migração prova o estado DELA no momento em que
--   rodou, e some junto com a transação. Esta consulta pergunta ao banco de
--   PRODUÇÃO, hoje, em qualquer dia — inclusive depois de alguém ter mexido
--   pelo painel do Supabase, que é justamente o caminho que o projeto proíbe e
--   que nenhuma migração consegue impedir.
--
--   É também o que responde "aplicou mesmo?" sem ninguém ter que abrir seis
--   telas. Uma linha vermelha aqui aponta exatamente o que falta.
--
-- Se alguma linha vier false, o remédio quase sempre é reaplicar a migração
-- correspondente (a coluna `de_onde_vem` diz qual) — elas são idempotentes:
-- rodar de novo em banco já correto não faz nada.
-- ===========================================================================

with conferencias as (

  -- 1. O livro-razão: as duas migrações de 22/08 registradas -----------------
  -- Registrar acontece na MESMA transação que aplica; se a versão está aqui,
  -- a migração inteira passou, autoconferência incluída.
  select
    1 as ordem,
    '1. Livro-razão: conciliação bancária (20260822120000)' as conferencia,
    (select count(*) = 1 from supabase_migrations.schema_migrations
      where version = '20260822120000') as ok,
    'supabase/migrations/20260822120000_conciliacao_bancaria.sql' as de_onde_vem

  union all select
    2,
    '2. Livro-razão: aprovação de recorrente (20260822150000)',
    (select count(*) = 1 from supabase_migrations.schema_migrations
      where version = '20260822150000'),
    'supabase/migrations/20260822150000_aprovacao_de_recorrente.sql'

  -- 2. Conciliação bancária --------------------------------------------------
  union all select
    3,
    '3. Tabela extrato_bancario existe',
    (select count(*) = 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'extrato_bancario'
        and c.relkind = 'r'),
    '20260822120000'

  union all select
    4,
    '4. RLS LIGADA em extrato_bancario',
    -- Sem isto a tabela fica legível por qualquer usuário autenticado. É a
    -- única linha desta lista em que "false" é incidente, não pendência.
    (select coalesce(bool_and(c.relrowsecurity), false) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'extrato_bancario'),
    '20260822120000'

  union all select
    5,
    '5. As 4 policies de extrato_bancario (ler, importar, conciliar, apagar)',
    (select count(*) = 4 from pg_policies
      where schemaname = 'public' and tablename = 'extrato_bancario'),
    '20260822120000'

  union all select
    6,
    '6. Índice único (conta, fitid) — a idempotência da reimportação',
    -- Reimportar é o fluxo NORMAL: ela baixa "últimos 30 dias" toda semana e
    -- os arquivos se sobrepõem. Sem este índice, cada importação duplica.
    (select count(*) = 1 from pg_indexes
      where schemaname = 'public' and indexname = 'idx_extrato_conta_fitid'),
    '20260822120000'

  union all select
    7,
    '7. Índice único da movimentação — o um-para-um da conciliação',
    -- O motor já garante um-para-um em memória; o índice garante contra duas
    -- pessoas conciliando ao mesmo tempo, que o motor não tem como ver.
    (select count(*) = 1 from pg_indexes
      where schemaname = 'public' and indexname = 'idx_extrato_movimentacao'),
    '20260822120000'

  -- 3. Aprovação do cadastro de recorrente -----------------------------------
  union all select
    8,
    '8. Coluna despesas_recorrentes.aprovacao_status',
    (select count(*) = 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'despesas_recorrentes'
        and column_name = 'aprovacao_status'),
    '20260822150000'

  union all select
    9,
    '9. Recorrente existente nasceu ''aprovada'' (nada parou de gerar)',
    -- O default retroativo é o que impede a migração de congelar as
    -- recorrentes que já rodavam antes dela existir.
    (select count(*) = 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'despesas_recorrentes'
        and column_name = 'aprovacao_status'
        and column_default like '%aprovada%'
        and is_nullable = 'NO'),
    '20260822150000'

  union all select
    10,
    '10. CHECK dos três estados (aprovada, aguardando, recusada)',
    (select count(*) = 1 from pg_constraint
      where conname = 'despesas_recorrentes_aprovacao_status_check'),
    '20260822150000'

  union all select
    11,
    '11. Trigger que carimba quem decidiu e quando',
    -- O carimbo é do BANCO, não da rota: rota esquece, trigger não.
    (select count(*) = 1 from pg_trigger
      where tgname = 'trg_carimbar_decisao_de_recorrente' and not tgisinternal),
    '20260822150000'

  -- 4. As duas funções de que tudo isso depende ------------------------------
  -- Não são de 22/08, mas as policies acima chamam as duas: se sumirem, a
  -- conciliação para de ler sem dar erro nenhum — só volta vazia.
  union all select
    12,
    '12. has_finance_access() existe e lê `papeis` (multi-papel)',
    (select count(*) = 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'has_finance_access'
        and pg_get_functiondef(p.oid) like '%papeis%'),
    '20260821120000 / 20260821180000'

  union all select
    13,
    '13. is_admin() existe e lê `papeis` (só admin apaga)',
    (select count(*) = 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'is_admin'
        and pg_get_functiondef(p.oid) like '%papeis%'),
    '20260821210000'

  union all select
    14,
    '14. reivindicar_investidor() existe (vínculo pelo e-mail)',
    (select count(*) = 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'reivindicar_investidor'),
    '20260821180000'
)
select
  case when ok then '✅' else '❌ FALTA' end as status,
  conferencia,
  de_onde_vem
from conferencias
order by ordem;
