-- ============================================================================
-- F0-c — `veiculo_eventos` (append-only) e `auditoria` do núcleo
-- ============================================================================
-- Decisão 1 do handoff: "Evento é a fonte da verdade. veiculo_eventos é
-- imutável (sem UPDATE/DELETE — trigger + RLS). Situação, dias em estoque,
-- custo e margem são projeções." D-T1.6: append-only é trigger + ausência de
-- policy, os dois. D-T1.2: esta auditoria é do núcleo; auditoria_admin segue
-- com o painel.
-- ============================================================================

create table if not exists public.veiculo_eventos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.org_padrao(),
  veiculo_id  uuid not null references public.veiculos(id),
  tipo        public.evento_tipo not null,
  payload     jsonb not null default '{}'::jsonb,
  usuario_id  uuid not null,
  motivo      text,
  criado_em   timestamptz not null default now(),

  -- Correção e estorno nunca são edição: são eventos COM MOTIVO (specs 10/20).
  constraint motivo_obrigatorio_em_correcoes check (
    tipo not in ('CORRECAO_ENTRADA','ESTORNO_ENTRADA','ESTORNO_VENDA')
    or (motivo is not null and length(trim(motivo)) > 0)
  )
);
comment on table public.veiculo_eventos is
  'A linha do tempo imutável do veículo (handoff, decisão 1). Nada aqui se edita ou apaga — corrigiu, é evento novo com motivo. Situação/custo/margem derivam daqui.';

create index if not exists veiculo_eventos_veiculo_idx
  on public.veiculo_eventos (veiculo_id, criado_em);
create index if not exists veiculo_eventos_tipo_idx
  on public.veiculo_eventos (tipo, criado_em);

create table if not exists public.auditoria (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.org_padrao(),
  usuario_id  uuid not null,
  acao        text not null,
  alvo        text,
  detalhe     jsonb not null default '{}'::jsonb,
  criado_em   timestamptz not null default now()
);
comment on table public.auditoria is
  'Trilha do núcleo (D-T1.2) — convive com auditoria_admin, que segue sendo do painel legado. Append-only como veiculo_eventos.';

-- ----------------------------------------------------------------------------
-- Append-only: uma função, quatro futuros usos (eventos, auditoria, e as
-- append-only das fatias e/h — partidas, lancamentos, anuncios).
-- ----------------------------------------------------------------------------
create or replace function public.nucleo_bloquear_mutacao()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tabela % é append-only (handoff, decisão 1): % é proibido — corrija com evento/estorno, nunca edição.',
    tg_table_name, tg_op
    using errcode = 'raise_exception';
end;
$$;

drop trigger if exists veiculo_eventos_append_only on public.veiculo_eventos;
create trigger veiculo_eventos_append_only
  before update or delete on public.veiculo_eventos
  for each row execute function public.nucleo_bloquear_mutacao();

drop trigger if exists auditoria_append_only on public.auditoria;
create trigger auditoria_append_only
  before update or delete on public.auditoria
  for each row execute function public.nucleo_bloquear_mutacao();

-- RLS: staff lê e insere; UPDATE/DELETE não têm policy (segunda tranca).
alter table public.veiculo_eventos enable row level security;
alter table public.auditoria enable row level security;

drop policy if exists nucleo_staff_le on public.veiculo_eventos;
create policy nucleo_staff_le on public.veiculo_eventos
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_insere on public.veiculo_eventos;
create policy nucleo_staff_insere on public.veiculo_eventos
  for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_le on public.auditoria;
create policy nucleo_staff_le on public.auditoria
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_insere on public.auditoria;
create policy nucleo_staff_insere on public.auditoria
  for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

-- ----------------------------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------------------------
do $$
declare
  v uuid;
  e uuid;
  falhas int := 0;
begin
  insert into public.veiculos (chassi, marca, modelo)
  values ('ACEITE-F0C-000000001', 'Teste', 'Aceite') returning id into v;

  insert into public.veiculo_eventos (veiculo_id, tipo, usuario_id, payload)
  values (v, 'ENTRADA', '00000000-0000-0000-0000-000000000000', '{"aceite": true}')
  returning id into e;

  -- 1. UPDATE em evento: recusa pelo trigger.
  begin
    update public.veiculo_eventos set payload = '{"editado": true}' where id = e;
    falhas := falhas + 1;
  exception when raise_exception then null; end;

  -- 2. DELETE em evento: recusa pelo trigger.
  begin
    delete from public.veiculo_eventos where id = e;
    falhas := falhas + 1;
  exception when raise_exception then null; end;

  -- 3. Estorno sem motivo: recusa pelo CHECK.
  begin
    insert into public.veiculo_eventos (veiculo_id, tipo, usuario_id)
    values (v, 'ESTORNO_ENTRADA', '00000000-0000-0000-0000-000000000000');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 4. Nenhuma policy de UPDATE/DELETE pode existir nas duas.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('veiculo_eventos','auditoria')
      and lower(cmd) in ('update','delete')
  ) then
    falhas := falhas + 1;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % brecha(s) na imutabilidade', falhas;
  end if;

  -- Limpeza dos sintéticos: o trigger não distingue aceite de operação — e não
  -- deve. Desligamos SÓ dentro desta transação de migração, e religamos já.
  alter table public.veiculo_eventos disable trigger veiculo_eventos_append_only;
  delete from public.veiculo_eventos where id = e;
  alter table public.veiculo_eventos enable trigger veiculo_eventos_append_only;
  delete from public.veiculos where id = v;

  raise notice 'F0-c OK: evento imutável (UPDATE/DELETE recusados), motivo obrigatório em estorno, sem policy de mutação.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120200', 'f0c_eventos_e_auditoria')
  on conflict (version) do nothing;
