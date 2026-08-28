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

-- O `nullif` de FORA é o que faltava: `set_config('request.jwt.claims', '')`
-- é como se dispensa a sessão no meio de um aceite, e `''::jsonb` explode com
-- "invalid input syntax for type json". O Supabase de verdade trata string
-- vazia como ausência de claims — aqui era só o `auth.jwt()` logo abaixo que
-- fazia isso. A divergência só aparecia quando alguma coisa lia `auth.uid()`
-- DEPOIS de dispensar a sessão, que é o que um gatilho em `leads` faz.
create or replace function auth.uid() returns uuid as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid;
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

-- ---------------------------------------------------------------------------
-- Recorte do Ciclo (migração 20260813150000), só o que a agenda de pessoas lê
-- ---------------------------------------------------------------------------
-- A migração `20260824190000_agenda_de_pessoas.sql` une três cadastros numa
-- view. Dois deles nascem na migração do Ciclo, que NÃO está na cadeia de
-- teste — ela toca treze tabelas e traria para cá metade do programa.
--
-- Entram aqui só as duas tabelas que a view lê, com as colunas que ela lê,
-- copiadas fielmente da migração original. Sem elas a view seria testada na
-- forma degradada (uma fonte só) e o teste passaria sem ver o que a produção
-- vê — que é o modo de falha que este projeto vem perseguindo o mês inteiro.
--
-- ⚠️ Se a migração do Ciclo entrar na cadeia um dia, estas duas saem daqui:
-- `create table if not exists` faria a de lá virar no-op e as colunas
-- divergiriam em silêncio.

-- O `is_staff` do bootstrap de 2026-08-13, na forma anterior ao multi-papel —
-- a cadeia o substitui por `create or replace` quando
-- `20260819150000_papeis_multiplos.sql` roda. Ele precisa existir ANTES,
-- porque as policies abaixo o referenciam na hora de nascer.
create or replace function public.is_staff(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and role in ('admin', 'comercial', 'financeiro', 'marketing')
       and is_active = true
  );
$$ language sql security definer set search_path = public;

create table public.clientes (
  id                uuid primary key default gen_random_uuid(),
  cpf_cnpj          text unique not null,
  nome              text not null,
  telefone_e164     text not null,
  email             text,
  data_nascimento   date,
  cep               text,
  consentimento_lgpd_em  timestamptz,
  consentimento_canais   jsonb default '{"whatsapp":false,"email":false,"sms":false}',
  origem_primeiro_contato text,
  auth_user_id      uuid unique,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table public.parceiros_ciclo (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,
  nome          text not null,
  cidade        text,
  comissao_pct  numeric(5,2),
  ativo         boolean default true,
  created_at    timestamptz default now()
);

alter table public.clientes        enable row level security;
alter table public.parceiros_ciclo enable row level security;

create policy clientes_staff on public.clientes
  for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy parceiros_ciclo_staff on public.parceiros_ciclo
  for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

grant select, insert, update, delete
  on public.clientes, public.parceiros_ciclo to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- `leads`, na forma que a migração 20260807210000 deixa
-- ---------------------------------------------------------------------------
-- Entra pelo mesmo motivo de `clientes` e `parceiros_ciclo`: a migração do
-- funil (20260828120000) reconstrói a view `agenda_de_pessoas` com um ramo de
-- leads, troca a RLS da tabela e pendura gatilhos nela. Sem o recorte aqui, a
-- cadeia testaria a migração na forma degradada — a que produção nunca vê.
--
-- A migração de leads não entra na CADEIA porque ela é ADITIVA sobre uma
-- tabela vestigial de marketing que este andaime não reproduz (event_id,
-- utm_*, capi_*), e a migração seguinte (20260811130000) faz
-- `alter column event_id drop not null` — que num banco do zero falharia.
-- O que interessa ao funil são as colunas do kanban, e são estas.
--
-- ⚠️ A policy permissiva abaixo é copiada de propósito: é justamente ela que
-- a migração do funil derruba. Sem reproduzi-la, o aceite provaria que a
-- porta está fechada num banco onde ela nunca esteve aberta.
create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  email         text,
  telefone      text,
  interesse     text,
  canal         text,
  veiculo_id    bigint,
  situacao      text not null default 'novo',
  responsavel   text,
  observacoes   text,
  atualizado_em timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint leads_situacao_valida check (
    situacao in ('novo', 'em_contato', 'proposta', 'visita',
                 'negociacao', 'fechado', 'perdido')
  )
);

alter table public.leads enable row level security;

create policy leads_leitura on public.leads
  for select to authenticated using (true);
create policy leads_atualizacao on public.leads
  for update to authenticated using (true) with check (true);
create policy leads_exclusao on public.leads
  for delete to authenticated using (true);

grant select, insert, update, delete on public.leads to authenticated, service_role;

