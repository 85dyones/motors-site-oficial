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


-- ---------------------------------------------------------------------------
-- Recorte de `atendimentos`: só o que a fila do funil lê
-- ---------------------------------------------------------------------------
-- Entra pela `20261010140000_transferencia_espera_o_prazo_do_novo_dono.sql`,
-- que reescreve `montar_fila_do_funil` com o lateral do atendimento mais
-- recente do lead (desde a 20260916150000). Só as colunas que esse lateral
-- lê; o resto da tabela (Chatwoot, etiquetas, SLA) não muda a régua.
create table public.atendimentos (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid references public.leads (id) on delete cascade,
  iniciado_em       timestamptz,
  humano_assumiu_em timestamptz,
  com_assistente    boolean,
  created_at        timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Recorte do núcleo F0: só `parametros_avaliacao`, na forma que a f0f deixa
-- ---------------------------------------------------------------------------
-- Entra pela migração `20260924220000_curva_km_por_ano.sql`, que acrescenta
-- `km_por_ano` à curva de deságio. As migrações da F0 não entram na CADEIA:
-- o aceite delas diz "F0-x OK", não "Aceite verificado", e a f0b em diante
-- pressupõe `estoque_motors` e metade do núcleo — trazê-las faria o vermelho
-- ser sobre o andaime, não sobre a migração.
--
-- Copiado fielmente, e só o que a curva precisa para existir como existe em
-- produção:
--   * a org e `org_padrao()` ......... 20260829120000_f0a_org_e_enums.sql:13-43
--   * `nucleo_so_encerra_vigencia()` .. 20260829120400_f0e_razao.sql:183-198
--   * tabela, gatilho, semente, RLS ... 20260829120500_f0f_parametros.sql:15-33,63-66,74-86,101-122
--   * uma curva vigente por org ....... 20260829121000_f0j_unicidade_de_vigencia.sql:30-32
--   * anon fora, TRUNCATE fora ........ 20260829140000_f0l (:31, :45) e 20260829150000_f0m (:73, :87)
--
-- ⚠️ Mesma regra de `clientes` e `leads`: se a F0 entrar na cadeia um dia,
-- este recorte sai daqui — `create table if not exists` faria a de lá virar
-- no-op e as duas divergiriam em silêncio.
create table public.orgs (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  criada_em  timestamptz not null default now()
);
alter table public.orgs enable row level security;
insert into public.orgs (nome) values ('Motors Store');

create or replace function public.org_padrao()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.orgs order by criada_em limit 1
$$;
revoke all on function public.org_padrao() from public;
grant execute on function public.org_padrao() to authenticated, service_role;

create or replace function public.nucleo_so_encerra_vigencia()
returns trigger
language plpgsql
as $$
begin
  if old.vigencia_ate is not null then
    raise exception 'Linha de % já encerrada: parâmetro histórico não se edita — insira vigência nova.',
      tg_table_name using errcode = 'raise_exception';
  end if;
  if to_jsonb(new) - 'vigencia_ate' <> to_jsonb(old) - 'vigencia_ate' then
    raise exception 'Parâmetro vigente de % não sofre UPDATE de valor (D-T1.7): encerre a vigência e insira linha nova.',
      tg_table_name using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

create table public.parametros_avaliacao (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null default public.org_padrao(),
  base_pp                numeric(5,2) not null,
  estado_excepcional_pp  numeric(5,2) not null,
  piso_pct               numeric(5,2) not null,
  teto_pct               numeric(5,2) not null,
  degraus_km             jsonb not null,
  avaria_leve_pp         numrange not null,
  avaria_seria_pp        numrange not null,
  pendencia_pp           numrange not null,
  descricao              text,
  vigencia_desde         date not null default current_date,
  vigencia_ate           date,
  criado_em              timestamptz not null default now(),
  constraint piso_abaixo_do_teto check (piso_pct < teto_pct)
);

create trigger parametros_avaliacao_vigencia
  before update on public.parametros_avaliacao
  for each row execute function public.nucleo_so_encerra_vigencia();

insert into public.parametros_avaliacao
  (base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,
   avaria_leve_pp, avaria_seria_pp, pendencia_pp, descricao)
values
  (20, -5, 15, 40,
   '[{"desvio_km_ate": 5000,  "pp": 0},
     {"desvio_km_ate": 15000, "pp": 2},
     {"desvio_km_ate": 30000, "pp": 4},
     {"desvio_km_ate": 50000, "pp": 7},
     {"desvio_km_ate": null,  "pp": 10}]'::jsonb,
   numrange(2, 4, '[]'), numrange(8, 12, '[]'), numrange(3, 5, '[]'),
   'Seed da spec 11: base 20 p.p., estado excepcional −5 (piso 15%), teto 40%. Km baixo não é prêmio — é alerta de hodômetro.');

alter table public.parametros_avaliacao enable row level security;
create policy nucleo_staff_le on public.parametros_avaliacao for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
create policy nucleo_staff_insere on public.parametros_avaliacao for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
create policy nucleo_staff_atualiza on public.parametros_avaliacao for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

create unique index parametros_avaliacao_um_vigente
  on public.parametros_avaliacao (org_id)
  where vigencia_ate is null;

revoke all on public.orgs, public.parametros_avaliacao from anon;
revoke truncate on public.orgs, public.parametros_avaliacao from authenticated;


-- ---------------------------------------------------------------------------
-- Recorte de `estoque_motors`: só o que os veículos de interesse do lead leem
-- ---------------------------------------------------------------------------
-- Entra pela migração `20261005120000_veiculos_de_interesse.sql`, que LÊ o
-- estoque (o retrato do carro na opção do lead, o ranking por veículo) e não
-- escreve nele. A baseline do estoque (20260803120000) não entra na CADEIA:
-- ela e as que vêm depois trazem o sync, a ficha do painel e as fotos.
--
-- Copiado da baseline, só as colunas lidas — a chave é `bigint` (o código do
-- anúncio no RevendaMais), e é ela que `leads.veiculo_id` guarda, sem FK:
--   * id, marca, modelo, versao, ano, preco ... 20260803120000_baseline_inventario.sql:42-57
--   * vendido .................................. supabase_schema.sql:230 (bootstrap)
--
-- Dois carros de semente, em minúsculas como o sync grava: o aceite da
-- migração precisa de UM carro de verdade para provar a inclusão com sessão
-- (o gatilho recusa carro que não existe), e ele não grava no estoque nem na
-- sonda. O segundo tem a versão embutida no modelo, o caso de `nomeDoVeiculo`.
--
-- RLS ligada e sem policy: quem lê aqui são funções SECURITY DEFINER. Em
-- produção a tabela tem policies e grants por coluna (20261001150000) que este
-- recorte não reproduz.
--
-- ⚠️ Mesma regra dos outros recortes: se a baseline entrar na cadeia um dia,
-- este sai daqui.
create table public.estoque_motors (
  id       bigint primary key,
  marca    text,
  modelo   text,
  versao   text,
  ano      integer,
  preco    numeric,
  vendido  boolean default false
);
alter table public.estoque_motors enable row level security;
revoke all on public.estoque_motors from anon, authenticated;

insert into public.estoque_motors (id, marca, modelo, versao, ano, preco, vendido) values
  (7950008, 'fiat', 'uno', 'mille fire economy', 2013, 28900, false),
  (7950009, 'bmw',  'x4 m40i 3.0 m sport', 'm40i 3.0 m sport', 2022, 489900, false);
