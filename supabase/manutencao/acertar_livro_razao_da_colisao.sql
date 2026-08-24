-- ===========================================================================
-- A colisão de 20260822120000 — diagnóstico e acerto do livro-razão
-- ===========================================================================
-- ✅ APLICADO EM PRODUÇÃO em 2026-08-22. O livro-razão de lá agora diz:
--
--      20260822120000 | perfil_investidor
--      20260822130000 | conciliacao_bancaria
--
-- Fica arquivado como registro do que foi feito, e porque a parte 1 continua
-- servindo de diagnóstico se a dúvida voltar. Rodar de novo é inofensivo: a
-- parte 2 só age enquanto o nome estiver errado.
--
-- O estado que ele encontrou em produção NÃO foi o previsto no cenário
-- original: as DUAS versões já estavam registradas, e era só o nome de
-- `20260822120000` que estava errado. As condições do UPDATE cobriram isso
-- sem ajuste — mas vale a nota, porque a parte 1 abaixo ainda descreve
-- "(nenhum registro)" como o normal para a linha 2, e não foi o caso aqui.
--
-- ⚠️ RODE A PARTE 1 PRIMEIRO E LEIA O RESULTADO. A parte 2 está comentada de
-- propósito: o que ela deve fazer depende do que a parte 1 encontrar.
--
-- ---------------------------------------------------------------------------
-- O que aconteceu
-- ---------------------------------------------------------------------------
-- Em 2026-08-22, dois trabalhos paralelos criaram migrações com o MESMO
-- número:
--
--   20260822120000_conciliacao_bancaria.sql   (aplicada em produção)
--   20260822120000_perfil_investidor.sql      (foi para `main`)
--
-- `version` é chave primária de `supabase_migrations.schema_migrations`, e
-- todo rodapé de auto-registro daqui usa `on conflict (version) do nothing`.
-- Resultado: a segunda a rodar registra NADA e não reclama. Pior, um
-- `supabase db push` consulta o livro-razão, vê `20260822120000` presente e
-- **pula o arquivo inteiro** — o código vai para produção referenciando
-- tabelas que nunca foram criadas.
--
-- A conciliação cedeu o número e virou `20260822130000` (ver o cabeçalho do
-- arquivo dela). Só que produção JÁ tinha aplicado a conciliação sob o número
-- antigo, então o livro-razão de lá diz `20260822120000 = conciliacao_bancaria`
-- — o nome certo para o arquivo errado, e nenhuma linha para a versão nova.
--
-- ---------------------------------------------------------------------------
-- Por que isso não conserta sozinho
-- ---------------------------------------------------------------------------
-- Um `db push` futuro veria `20260822130000` ausente e reaplicaria a
-- conciliação — que é idempotente, então não quebraria — e veria
-- `20260822120000` presente e continuaria pulando `perfil_investidor` para
-- sempre. O livro-razão precisa dizer a verdade sobre o que rodou.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1 — Diagnóstico (somente leitura, rode e leia)
-- ---------------------------------------------------------------------------
select
  '1. o que o livro-razão diz sobre 20260822120000' as pergunta,
  coalesce((select name from supabase_migrations.schema_migrations
             where version = '20260822120000'), '(nenhum registro)') as resposta,
  'esperado: perfil_investidor. Se disser conciliacao_bancaria, a colisão está de pé.' as leitura

union all select
  '2. e sobre 20260822130000 (a conciliação renumerada)',
  coalesce((select name from supabase_migrations.schema_migrations
             where version = '20260822130000'), '(nenhum registro)'),
  'esperado: conciliacao_bancaria. "(nenhum registro)" é o normal ANTES do acerto.'

union all select
  '3. a conciliação chegou a rodar? (a tabela existe?)',
  case when to_regclass('public.extrato_bancario') is not null
       then 'SIM — extrato_bancario existe' else 'NÃO' end,
  'se SIM, ela rodou sob o número antigo e o acerto da parte 2 se aplica.'

union all select
  '4. e perfil_investidor? (as tabelas dela existem?)',
  case when to_regclass('public.investidor_veiculos') is not null
       then 'SIM — investidor_veiculos existe'
       else 'NÃO — foi PULADA pela colisão' end,
  'se NÃO, o código de participação por veículo está em produção sem tabela: '
  'aplique 20260822120000_perfil_investidor.sql à mão depois do acerto.'

union all select
  '5. o gestor sobreviveu ao vocabulário?',
  case when public.papeis_validos(array['gestor'])
       then 'SIM' else 'NÃO — papel inatribuível' end,
  'se NÃO, quem já é gestor tem uma linha que o CHECK recusa e nenhum UPDATE '
  'no perfil dele funciona. 20260822210000_fundir_investidores.sql repõe.'

union all select
  '6. o gestor abre o financeiro?',
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname='public' and p.proname='has_finance_access'
                       and pg_get_functiondef(p.oid) like '%gestor%')
       then 'SIM' else 'NÃO — acesso removido sem intenção' end,
  'mesma migração repõe.';

-- ---------------------------------------------------------------------------
-- PARTE 2 — O acerto (DESCOMENTE só depois de ler a parte 1)
-- ---------------------------------------------------------------------------
-- Aplique quando a parte 1 disser, na linha 1, `conciliacao_bancaria`. O que
-- ele faz, numa transação:
--
--   a) registra a conciliação sob o número NOVO, que é o que o repositório
--      tem hoje — sem isso, um `db push` a reaplicaria (inofensivo, mas o
--      livro-razão continuaria mentindo);
--   b) devolve o número ANTIGO a `perfil_investidor`, que é a dona dele em
--      `main`. Se a linha 4 disse NÃO, este passo é o que impede o `db push`
--      de continuar pulando o arquivo — mas ele sozinho NÃO cria as tabelas:
--      aplique a migração à mão depois.
--
-- Não apaga nada e é idempotente: rodar duas vezes dá o mesmo resultado.
--
-- begin;
--
--   insert into supabase_migrations.schema_migrations (version, name)
--     values ('20260822130000', 'conciliacao_bancaria')
--     on conflict (version) do nothing;
--
--   -- Só corrige se ainda estiver com o nome errado — assim rodar de novo
--   -- depois de alguém já ter aplicado `perfil_investidor` não desfaz nada.
--   update supabase_migrations.schema_migrations
--      set name = 'perfil_investidor'
--    where version = '20260822120000'
--      and name = 'conciliacao_bancaria'
--      -- e só quando a conciliação já tiver casa própria no livro-razão,
--      -- senão o acerto perderia o registro dela.
--      and exists (select 1 from supabase_migrations.schema_migrations
--                   where version = '20260822130000');
--
--   -- Confira ANTES de confirmar. Esperado: duas linhas, cada versão com o
--   -- nome do seu próprio arquivo.
--   select version, name from supabase_migrations.schema_migrations
--    where version in ('20260822120000', '20260822130000') order by version;
--
-- commit;   -- ou `rollback;` se a conferência acima não bater
--
-- ---------------------------------------------------------------------------
-- Depois do acerto
-- ---------------------------------------------------------------------------
-- Se a linha 4 do diagnóstico disse NÃO, aplique à mão, nesta ordem:
--   1. supabase/migrations/20260822120000_perfil_investidor.sql
--   2. supabase/migrations/20260822210000_fundir_investidores.sql
-- A segunda repõe o gestor nas três réguas que a primeira remove sem querer,
-- e funde os dois módulos de investidor. Inverter a ordem desfaz a reposição.
-- Se a linha 4 disse SIM, só a segunda basta.
--
-- Depois, `manutencao/conferir-estado-do-financeiro.sql` tem que sair todo ✅.
