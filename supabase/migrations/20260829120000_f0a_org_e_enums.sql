-- ============================================================================
-- F0-a — A org e os enums do núcleo (spec 00 do handoff)
-- ============================================================================
-- Primeira migração do núcleo do sistema de operação (docs/PLANO_F0.md,
-- aprovado pelo dono em 2026-08-29; decisões de convivência em
-- docs/MAPA_CONVIVENCIA_SCHEMA.md). Tudo aditivo: nada aqui toca o que existe.
--
-- "Costura de SaaS, um tenant": org_padrao() devolve o uuid da Motors e é o
-- DEFAULT de org_id em toda tabela nova do núcleo. Nenhuma tela de tenant,
-- nenhum provisionamento — só a coluna e a disciplina.
-- ============================================================================

create table if not exists public.orgs (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  criada_em  timestamptz not null default now()
);
comment on table public.orgs is
  'Costura multi-tenant do handoff: uma linha só (Motors Store). Sem UI, sem cobrança.';

alter table public.orgs enable row level security;
-- Sem policy nenhuma de propósito: nem anon nem authenticated leem a lista de
-- orgs; quem precisa do id usa org_padrao(), SECURITY DEFINER.

-- Seed idempotente da org única.
insert into public.orgs (nome)
select 'Motors Store'
where not exists (select 1 from public.orgs);

create or replace function public.org_padrao()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.orgs order by criada_em limit 1
$$;
comment on function public.org_padrao() is
  'O uuid da org Motors — DEFAULT de org_id no núcleo. STABLE: uma leitura por statement.';

revoke all on function public.org_padrao() from public;
grant execute on function public.org_padrao() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Enums (spec 00, transcritos)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.posse_tipo as enum ('propria','terceiro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.modalidade_tipo as enum
    ('compra_direta','troca','consignacao','parceria','repasse','lote');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.saida_tipo as enum ('varejo','repasse','devolucao_terceiro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.evento_tipo as enum (
    'ENTRADA','CORRECAO_ENTRADA','ESTORNO_ENTRADA',
    'COMPRA_TERCEIRO','DEVOLUCAO_TERCEIRO',
    'PREPARACAO_INICIO','PREPARACAO_FIM','CUSTO_LANCADO','BLOQUEIO','DESBLOQUEIO',
    'PUBLICACAO','DESPUBLICACAO','MIDIA_ATRIBUIDA',
    'PRE_VENDA_LANCADA','SINAL','CANCELAMENTO_SINAL','PRE_VENDA_CANCELADA',
    'VENDA','REPASSE_SAIDA','ESTORNO_VENDA','NF_EMITIDA','ENTREGA_LIBERADA',
    'CICLO_ABERTO','REVISAO_REGISTRADA','CONFORMIDADE_ALTERADA','RECOMPRA_EXERCIDA',
    'CHAMADO_ABERTO','REPARO_CONCLUIDO','PRAZO_VENCIDO'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------------------------
do $$
declare
  o uuid;
  n int;
begin
  o := public.org_padrao();
  if o is null then
    raise exception 'ACEITE FALHOU: org_padrao() devolveu NULL';
  end if;

  select count(*) into n from public.orgs;
  if n <> 1 then
    raise exception 'ACEITE FALHOU: esperava 1 org, achei %', n;
  end if;

  select count(*) into n from pg_type t
  join pg_namespace ns on ns.oid = t.typnamespace
  where ns.nspname = 'public'
    and t.typname in ('posse_tipo','modalidade_tipo','saida_tipo','evento_tipo');
  if n <> 4 then
    raise exception 'ACEITE FALHOU: esperava 4 enums do núcleo, achei %', n;
  end if;

  select count(*) into n
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = 'evento_tipo';
  if n <> 29 then
    raise exception 'ACEITE FALHOU: evento_tipo com % valores (esperava 29)', n;
  end if;

  -- orgs não pode nascer legível: sem policy, RLS ligada.
  if exists (select 1 from pg_policies where schemaname='public' and tablename='orgs') then
    raise exception 'ACEITE FALHOU: orgs nasceu com policy — deveria ser ilegível';
  end if;

  raise notice 'F0-a OK: org % semeada, 4 enums, evento_tipo com 29 valores.', o;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120000', 'f0a_org_e_enums')
  on conflict (version) do nothing;
