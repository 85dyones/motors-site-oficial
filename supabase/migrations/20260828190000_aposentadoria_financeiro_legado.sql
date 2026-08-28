-- ============================================================================
-- Aposentadoria do módulo financeiro legado (o caixa)
-- ============================================================================
--
-- Decisão do dono em 2026-08-28, na análise de impacto do motors-handoff:
-- "aposente o financeiro atual, pra não haver conflitos, nada ali tem dado
-- real, construa do zero". O financeiro renasce sobre o razão de partidas
-- dobradas do handoff (spec 30) — e o razão quer criar `plano_contas`, nome
-- que este legado ocupava (conflito C5/C6 da análise).
--
-- O que esta migração DERRUBA (verificado contra produção em 2026-08-28):
--
--   contas ..................... 4 linhas, todas lançamentos de teste de
--                                2026-08-24 sem veiculo_id: "compra teste
--                                peças" R$ 250, "teste receita" R$ 1.500,
--                                "conta de água" R$ 600, "Pagamento Paulão da
--                                Regulagem" R$ 600 (aguardando_aprovacao)
--   compras_produtos ........... 0 linhas
--   despesas_recorrentes ....... 0 linhas
--   movimentacoes .............. 0 linhas
--   categorias_financeiras ..... 18 linhas — categorias seed, sem lançamento
--   plano_contas ............... 0 linhas (o hierárquico legado; o nome fica
--                                livre para o razão da spec 30)
--   notificacoes_financeiras ... 0 linhas
--   extrato_bancario ........... 0 linhas (conciliação por OFX, nunca usada)
--
--   funções: atualizar_contas_vencidas, lancar_do_extrato,
--            carimbar_decisao_de_alcada, carimbar_decisao_de_recorrente
--            (as duas últimas eram as funções dos triggers de alçada em
--            contas/despesas_recorrentes — morrem junto)
--
-- O que FICA de pé, de propósito:
--
--   parceiros ................... 0 linhas, mas é a porta de criação da
--                                 agenda de pessoas (/api/pessoas POST cria
--                                 aqui) — pedido do dono de 2026-08-24. Deixa
--                                 de ser "do financeiro" e passa a ser o
--                                 cadastro de fornecedores da agenda.
--   investidores + movimentacoes_investidor + investidor_veiculos +
--   investidor_movimentos ....... decisão do dono na mesma conversa:
--                                 "investidores fica, precisamos deste
--                                 modelo, mas temos que adequar ao novo
--                                 financeiro". 1 ficha (Senoyd, fusão do
--                                 perfil em 22/08), zero movimentações.
--   funil_etapas ................ é do funil de leads, não do financeiro.
--   agenda_de_pessoas (view) .... intacta — todas as fontes dela sobrevivem.
--   has_finance_access .......... as policies de parceiros e investidores
--                                 continuam usando.
--   is_admin .................... policies de profiles e das tabelas de
--                                 investidor continuam usando.
--
-- Sem backfill e sem substituto imediato: o razão nasce em migração própria,
-- na fase F0/F1 do handoff, com vocabulário novo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Trava de sanidade: se apareceu volume real desde a análise, PARE.
--
-- A contagem verificada hoje está no cabeçalho. Estes limites são folgados o
-- bastante para mais um punhado de testes e apertados o bastante para impedir
-- que uma virada de uso real (alguém começou a lançar de verdade entre a
-- análise e o apply) seja destruída em silêncio.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'contas', 'compras_produtos', 'despesas_recorrentes', 'movimentacoes',
    'notificacoes_financeiras', 'extrato_bancario'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'ja nao existe: %', t;
      continue;
    end if;
    execute format('select count(*) from public.%I', t) into n;
    raise notice 'aposentando %: % linha(s)', t, n;
    if n > 50 then
      raise exception
        'APOSENTADORIA ABORTADA: public.% tem % linhas — acima da trava de 50. '
        'A premissa "nada ali tem dado real" precisa ser reconferida com o dono.',
        t, n;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Derrubar na ordem das dependências (sem CASCADE: se algo não listado
--    depender de uma tabela, é melhor a migração FALHAR no ensaio do que
--    levar junto um objeto que ninguém decidiu derrubar).
-- ----------------------------------------------------------------------------

-- As FKs são todas internas ao conjunto (conferido em pg_constraint no
-- ensaio): notificacoes/compras/movimentacoes → contas; extrato_bancario →
-- movimentacoes; contas e recorrentes → categorias. A ordem abaixo segue as
-- setas de dependência.
drop table if exists public.notificacoes_financeiras;
drop table if exists public.compras_produtos;
drop table if exists public.extrato_bancario;
drop table if exists public.movimentacoes;

-- O núcleo do caixa.
drop table if exists public.contas;
drop table if exists public.despesas_recorrentes;

-- Cadastros que só o caixa usava.
drop table if exists public.categorias_financeiras;
drop table if exists public.plano_contas;

-- ----------------------------------------------------------------------------
-- 2. Funções órfãs — por oid, para não depender de adivinhar assinatura.
--    (`has_finance_access` e `is_admin` NÃO entram: têm dependentes vivos.)
-- ----------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure::text as assinatura
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in (
        'atualizar_contas_vencidas',
        'lancar_do_extrato',
        'carimbar_decisao_de_alcada',
        'carimbar_decisao_de_recorrente'
      )
  loop
    execute format('drop function %s', f.assinatura);
    raise notice 'funcao aposentada: %', f.assinatura;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Autoconferência: prova pelo efeito, não pela intenção.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  n bigint;
begin
  -- 3a. O que devia morrer, morreu.
  foreach t in array array[
    'contas', 'compras_produtos', 'despesas_recorrentes', 'movimentacoes',
    'categorias_financeiras', 'plano_contas', 'notificacoes_financeiras',
    'extrato_bancario'
  ] loop
    if to_regclass('public.' || t) is not null then
      raise exception 'ACEITE FALHOU: public.% sobreviveu ao drop', t;
    end if;
  end loop;

  -- 3b. O que devia ficar, ficou.
  foreach t in array array[
    'parceiros', 'investidores', 'movimentacoes_investidor',
    'investidor_veiculos', 'investidor_movimentos', 'funil_etapas'
  ] loop
    if to_regclass('public.' || t) is null then
      raise exception 'ACEITE FALHOU: public.% deveria sobreviver e sumiu', t;
    end if;
  end loop;

  -- 3c. A agenda continua respondendo — exercita a view de verdade, inclusive
  -- o LEFT JOIN em funil_etapas e o ramo de parceiros.
  select count(*) into n from public.agenda_de_pessoas;
  raise notice 'agenda_de_pessoas responde: % pessoa(s)', n;

  -- 3d. As funções compartilhadas sobreviveram.
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'has_finance_access'
  ) then
    raise exception 'ACEITE FALHOU: has_finance_access sumiu — policies de parceiros/investidores quebradas';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'is_admin'
  ) then
    raise exception 'ACEITE FALHOU: is_admin sumiu — policies de profiles quebradas';
  end if;

  -- 3e. A ficha do investidor real não foi tocada.
  select count(*) into n from public.investidores;
  raise notice 'investidores preservados: % ficha(s)', n;

  raise notice 'APOSENTADORIA OK: caixa legado fora, agenda e investidores de pé.';
end $$;

-- ----------------------------------------------------------------------------
-- 4. Auto-registro no livro-razão (ver supabase/README.md — obrigatório).
-- ----------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260828190000', 'aposentadoria_financeiro_legado')
  on conflict (version) do nothing;
