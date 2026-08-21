-- ---------------------------------------------------------------------------
-- Andaime de teste — o mínimo do Supabase e do bootstrap de 2026-08-03 para
-- que as migrações versionadas rodem contra um Postgres LIMPO.
--
-- Por que existe (AUDITORIA §5.7, aberta desde 2026-08-03): as migrações
-- deste projeto carregam autoconferência — um bloco `do $$` que levanta
-- exceção se o aceite não valer contra o banco. Só que ninguém nunca as
-- EXECUTOU antes de empurrar: o aceite só era conhecido quando o `db push`
-- rodava em produção. A auditoria dizia que testar RLS exigia instância
-- Supabase e que Docker não estava instalado; acontece que um Postgres local
-- basta, desde que alguém escreva o pedaço de Supabase que as migrações
-- pressupõem. É este arquivo.
--
-- ⚠️ Este andaime NÃO é a produção e não deve virar fonte de verdade de
-- schema — ele é deliberadamente o MENOR recorte que faz a cadeia rodar. Quem
-- precisar cobrir uma migração que toca outra tabela acrescenta a tabela aqui
-- e a migração na lista de `tests/migracoes-executam.test.ts`.
-- ---------------------------------------------------------------------------
-- Papéis são do CLUSTER, não do banco: recriar o banco não os apaga, então a
-- criação precisa ser idempotente para o andaime rodar duas vezes seguidas.
do $andaime$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $andaime$;

create schema if not exists auth;
create schema if not exists supabase_migrations;

create table supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  statements text[]
);

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text,
  role text,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function auth.uid() returns uuid as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid;
$$ language sql stable;

create or replace function auth.jwt() returns jsonb as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$ language sql stable;

grant usage on schema public, auth to anon, authenticated, service_role;

-- O que o bootstrap do Supabase declara e o andaime precisa espelhar: tabela
-- criada depois, no schema public, já nasce com GRANT para os papéis do PostgREST.
-- Sem isto a RLS fica irrelevante — o acesso morre antes, no privilégio.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ---- o bootstrap (supabase_schema.sql §6 e §7), na forma de 2026-08-03 ----
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'comercial',
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_admin(user_id uuid) returns boolean as $$
  select exists (select 1 from public.profiles where id = user_id and role = 'admin');
$$ language sql security definer set search_path = public;

create or replace function public.has_finance_access(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id and role in ('admin', 'financeiro') and is_active = true
  );
$$ language sql security definer set search_path = public;

create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', 'Novo Usuário'), 'comercial');
  return new;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.categorias_financeiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null, tipo text not null check (tipo in ('receita','despesa')),
  cor text, icone text, ativa boolean default true, created_at timestamptz default now()
);
create table public.parceiros (
  id uuid primary key default gen_random_uuid(),
  nome text not null, tipo text not null check (tipo in ('fornecedor','cliente','ambos')),
  documento text, telefone text, email text,
  created_by uuid references public.profiles(id), created_at timestamptz default now()
);
create table public.contas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('pagar','receber')),
  descricao text not null, valor decimal(12,2) not null,
  data_emissao date not null default current_date,
  data_vencimento date not null, data_pagamento date,
  status text not null default 'pendente'
    check (status in ('pendente','pago','vencido','cancelado','parcial')),
  categoria_id uuid references public.categorias_financeiras(id),
  veiculo_id text, fornecedor text, cliente text, forma_pagamento text,
  parcela_atual integer default 1, total_parcelas integer default 1,
  grupo_parcela uuid, recorrencia_id uuid, observacoes text,
  comprovante_url text, notificado boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.despesas_recorrentes (
  id uuid primary key default gen_random_uuid(),
  descricao text not null, valor decimal(12,2) not null,
  categoria_id uuid references public.categorias_financeiras(id),
  fornecedor text, frequencia text not null, dia_vencimento integer,
  forma_pagamento text, ativa boolean default true, proxima_geracao date,
  observacoes text, created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create table public.compras_produtos (
  id uuid primary key default gen_random_uuid(),
  descricao text not null, fornecedor text not null,
  valor_total decimal(12,2) not null, quantidade integer default 1,
  valor_unitario decimal(12,2), data_compra date not null default current_date,
  categoria text, veiculo_id text, nota_fiscal text,
  status text default 'recebido',
  conta_id uuid references public.contas(id) on delete set null,
  created_by uuid references public.profiles(id), created_at timestamptz default now()
);
create table public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid references public.contas(id) on delete set null,
  tipo text not null check (tipo in ('entrada','saida')),
  valor decimal(12,2) not null, descricao text not null,
  data_movimentacao date not null default current_date, forma_pagamento text,
  created_by uuid references public.profiles(id), created_at timestamptz default now()
);
create table public.notificacoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid references public.contas(id) on delete cascade,
  tipo text not null, mensagem text not null, enviada boolean default false,
  canal text default 'webhook', enviada_em timestamptz, created_at timestamptz default now()
);

do $$
declare t text;
begin
  foreach t in array array['categorias_financeiras','parceiros','contas',
                           'despesas_recorrentes','compras_produtos','movimentacoes',
                           'notificacoes_financeiras']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Finance access %1$s" on public.%1$I
                      for all using (public.has_finance_access(auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end $$;

grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant usage on schema supabase_migrations to service_role;

create or replace function public.atualizar_contas_vencidas() returns void as $$
begin
  update public.contas set status = 'vencido', updated_at = now()
   where status = 'pendente' and data_vencimento < current_date;
end;
$$ language plpgsql security definer;
