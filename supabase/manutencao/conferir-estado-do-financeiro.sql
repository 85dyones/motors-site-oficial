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
    '1. Livro-razão: conciliação bancária (20260822130000)' as conferencia,
    (select count(*) = 1 from supabase_migrations.schema_migrations
      where version = '20260822130000') as ok,
    'supabase/migrations/20260822130000_conciliacao_bancaria.sql' as de_onde_vem

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
    '20260822130000'

  union all select
    4,
    '4. RLS LIGADA em extrato_bancario',
    -- Sem isto a tabela fica legível por qualquer usuário autenticado. É a
    -- única linha desta lista em que "false" é incidente, não pendência.
    (select coalesce(bool_and(c.relrowsecurity), false) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'extrato_bancario'),
    '20260822130000'

  union all select
    5,
    '5. As 4 policies de extrato_bancario (ler, importar, conciliar, apagar)',
    (select count(*) = 4 from pg_policies
      where schemaname = 'public' and tablename = 'extrato_bancario'),
    '20260822130000'

  union all select
    6,
    '6. Índice único (conta, fitid) — a idempotência da reimportação',
    -- Reimportar é o fluxo NORMAL: ela baixa "últimos 30 dias" toda semana e
    -- os arquivos se sobrepõem. Sem este índice, cada importação duplica.
    (select count(*) = 1 from pg_indexes
      where schemaname = 'public' and indexname = 'idx_extrato_conta_fitid'),
    '20260822130000'

  union all select
    7,
    '7. Índice único da movimentação — o um-para-um da conciliação',
    -- O motor já garante um-para-um em memória; o índice garante contra duas
    -- pessoas conciliando ao mesmo tempo, que o motor não tem como ver.
    (select count(*) = 1 from pg_indexes
      where schemaname = 'public' and indexname = 'idx_extrato_movimentacao'),
    '20260822130000'

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
    '12. has_finance_access() lê `papeis` E inclui o gestor',
    -- Perguntar só por `papeis` não bastava: em 2026-08-22 uma migração
    -- paralela reescreveu esta função a partir do que conhecia, manteve
    -- `papeis` e DERRUBOU o `gestor`. A checagem antiga saía verde com o
    -- acesso do Gestor desligado — falso verde no que mais importava.
    (select count(*) = 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'has_finance_access'
        and pg_get_functiondef(p.oid) like '%papeis%'
        and pg_get_functiondef(p.oid) like '%gestor%'),
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

  union all select
    15,
    '15. Livro-razão: lançar do extrato atômico (20260822180000)',
    (select count(*) = 1 from supabase_migrations.schema_migrations
      where version = '20260822180000'),
    'supabase/migrations/20260822180000_lancar_do_extrato_atomico.sql'

  union all select
    16,
    '16. lancar_do_extrato() existe — sem ela a conciliação deixa órfã',
    -- Se esta faltar, a tela cai no caminho antigo de três escritas com
    -- rollback por DELETE, que é no-op silencioso para o financeiro: sobra
    -- conta paga que a próxima importação lança de novo.
    (select count(*) = 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'lancar_do_extrato'),
    '20260822180000'

  union all select
    17,
    '17. lancar_do_extrato() é security definer E confere has_finance_access',
    -- Existir não basta numa função `security definer`: ela roda com os
    -- poderes do DONO, então as policies das tabelas não a limitam. Quem
    -- guarda a porta é ela mesma. Uma versão sem essa checagem deixaria
    -- qualquer usuário autenticado lançar no caixa — inclusive um
    -- `investidor`, que nem entra no painel.
    (select count(*) = 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'lancar_do_extrato'
        and p.prosecdef                                   -- é security definer
        and pg_get_functiondef(p.oid) like '%has_finance_access%'),
    '20260822180000'

  union all select
    19,
    '19. Livro-razão: fusão dos investidores (20260822210000)',
    (select count(*) = 1 from supabase_migrations.schema_migrations
      where version = '20260822210000'),
    'supabase/migrations/20260822210000_fundir_investidores.sql'

  union all select
    20,
    '20. O gestor existe nas TRÊS réguas do papel',
    -- As três, juntas. Repor duas e esquecer a terceira deixa o papel meio
    -- existindo, que é pior que não existir: falha só em alguns caminhos.
    -- A do CHECK é a mais traiçoeira — quem já é gestor fica com uma linha
    -- que o CHECK recusa, e nenhum UPDATE no perfil dele funciona.
    (select
       -- (a) o CHECK da coluna `role`
       (select count(*) = 1 from pg_constraint
         where conname = 'profiles_role_check'
           and pg_get_constraintdef(oid) like '%gestor%')
       -- (b) o vocabulário de `papeis`
       and (select count(*) = 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'papeis_validos'
               and pg_get_functiondef(p.oid) like '%gestor%')
       -- (c) a porta do financeiro
       and (select count(*) = 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'has_finance_access'
               and pg_get_functiondef(p.oid) like '%gestor%')),
    '20260822210000'

  union all select
    21,
    '21. investidor_posicao soma do razão ÚNICO',
    -- Se ela ainda somar `investidor_movimentos`, a tela do sócio e o painel
    -- do financeiro mostram saldos DIFERENTES para a mesma pessoa no mesmo
    -- dia — duas verdades sobre o dinheiro dele, que é o pior resultado
    -- possível da fusão.
    (select count(*) = 1 from pg_views
      where schemaname = 'public' and viewname = 'investidor_posicao'
        and definition like '%movimentacoes_investidor%'),
    '20260822210000'

  union all select
    22,
    '22. A participação por veículo aponta para a ficha do investidor',
    -- `investidor_cadastro_id` é o que liga a participação ao cadastro que
    -- sobrevive sem login. Só se aplica onde a migração paralela rodou;
    -- por isso o `or` — tabela ausente não é falha aqui.
    (select to_regclass('public.investidor_veiculos') is null
         or exists (select 1 from information_schema.columns
                     where table_schema = 'public'
                       and table_name = 'investidor_veiculos'
                       and column_name = 'investidor_cadastro_id')),
    '20260822210000'

  union all select
    23,
    '23. Livro-razão: a conta absorveu o insumo (20260824150000)',
    (select count(*) = 1 from supabase_migrations.schema_migrations
      where version = '20260824150000'),
    'supabase/migrations/20260824150000_conta_absorve_insumo.sql'

  union all select
    24,
    '24. contas tem quantidade, valor_unitario e nota_fiscal',
    -- Sem as três, o formulário grava campo que não existe e o lançamento de
    -- insumo falha inteiro — depois de a pessoa ter preenchido tudo.
    (select count(*) = 3 from information_schema.columns
      where table_schema = 'public' and table_name = 'contas'
        and column_name in ('quantidade', 'valor_unitario', 'nota_fiscal')),
    '20260824150000'

  union all select
    25,
    '25. Os três campos de insumo são OPCIONAIS',
    -- A esmagadora maioria das contas não tem unidade. Se qualquer um dos
    -- três virasse NOT NULL, lançar aluguel passaria a exigir quantidade.
    (select count(*) = 3 from information_schema.columns
      where table_schema = 'public' and table_name = 'contas'
        and column_name in ('quantidade', 'valor_unitario', 'nota_fiscal')
        and is_nullable = 'YES'),
    '20260824150000'

  union all select
    26,
    '26. Livro-razão: a agenda de pessoas (20260824190000)',
    (select count(*) = 1 from supabase_migrations.schema_migrations
      where version = '20260824190000'),
    'supabase/migrations/20260824190000_agenda_de_pessoas.sql'

  union all select
    27,
    '27. A view agenda_de_pessoas existe',
    -- Sem ela a tela /admin/clientes abre e não lista nada: o PostgREST
    -- devolve 404 da relação e o componente mostra "nenhum cadastro para
    -- estes filtros" — indistinguível de uma base vazia.
    (select to_regclass('public.agenda_de_pessoas') is not null),
    '20260824190000'

  union all select
    28,
    '28. A agenda respeita RLS (security_invoker LIGADO)',
    -- ESTA É A CONFERÊNCIA QUE NÃO PODE FALHAR. Sem a opção, a view roda com
    -- os privilégios de quem a criou (o dono do banco, que ignora RLS) e vira
    -- um cano que despeja a base inteira de CPFs para qualquer usuário
    -- autenticado — inclusive o cliente da Garagem, que é `authenticated` e
    -- não é staff. Se der ❌, a tela de clientes precisa sair do ar até a
    -- migração ser reaplicada.
    (select coalesce(
              (select option_value = 'true'
                 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace,
                      pg_options_to_table(c.reloptions)
                where n.nspname = 'public'
                  and c.relname = 'agenda_de_pessoas'
                  and option_name = 'security_invoker'),
              false)),
    '20260824190000'

  union all select
    29,
    '29. anon NÃO alcança a agenda de pessoas',
    -- O bootstrap do Supabase dá `grant all` por default privilege a todo
    -- mundo, `anon` incluído. A migração revoga; se alguém recriar a view à
    -- mão sem revogar, o privilégio volta sozinho.
    (select not has_table_privilege('anon', 'public.agenda_de_pessoas', 'select')),
    '20260824190000'

  union all select
    30,
    '30. parceiros tem ativo, cidade e observacoes',
    -- Sem `ativo`, desativar fornecedor vira excluir — e fornecedor com conta
    -- paga no passado não pode sumir do histórico.
    (select count(*) = 3 from information_schema.columns
      where table_schema = 'public' and table_name = 'parceiros'
        and column_name in ('ativo', 'cidade', 'observacoes')),
    '20260824190000'

  union all select
    18,
    '18. Nenhuma das 4 tabelas de razão aceita DELETE fora do admin',
    -- A linha de 21/08 ("quem aprova não apaga a prova") dita em SQL. Vale
    -- conferir sempre: uma policy de DELETE a mais, criada pelo painel do
    -- Supabase num aperto, não apareceria em lugar nenhum do repositório.
    (select count(*) = 0 from pg_policies
      where schemaname = 'public'
        and tablename in ('contas','movimentacoes','compras_produtos','movimentacoes_investidor')
        and cmd in ('DELETE','ALL')
        and coalesce(qual, '') not like '%is_admin%'),
    '20260821210000'
)
select
  case when ok then '✅' else '❌ FALTA' end as status,
  conferencia,
  de_onde_vem
from conferencias
order by ordem;
