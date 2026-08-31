-- ============================================================================
-- F0-d — `veiculo_custos` (previsto × realizado) e `veiculo_precos` (piso)
-- ============================================================================
-- Spec 00. Custo tem dono (veiculo_id) e competência; preço tem vigência —
-- piso/preço calculados do custo real são F1, mas o lugar deles nasce agora.
-- ============================================================================

create table if not exists public.veiculo_custos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default public.org_padrao(),
  veiculo_id   uuid not null references public.veiculos(id),
  categoria    text not null,
  fornecedor   text,
  valor        numeric(12,2) not null check (valor >= 0),
  competencia  date not null default current_date,
  previsto     boolean not null default false,
  titulo_id    uuid,
  anexo_url    text,
  observacoes  text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid
);
comment on table public.veiculo_custos is
  'Custos por unidade (spec 00): previsto × realizado. Toda despesa tem dono. O razão (fatia e) contabiliza via CUSTO_LANCADO; titulo_id fica para o financeiro novo.';

create index if not exists veiculo_custos_veiculo_idx
  on public.veiculo_custos (veiculo_id, competencia);

create table if not exists public.veiculo_precos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  veiculo_id     uuid not null references public.veiculos(id),
  fipe_valor     numeric(12,2),
  preco_anuncio  numeric(12,2),
  preco_minimo   numeric(12,2),
  vigente_desde  timestamptz not null default now(),
  criado_por     uuid,
  constraint piso_nao_excede_anuncio check (
    preco_minimo is null or preco_anuncio is null or preco_minimo <= preco_anuncio
  )
);
comment on table public.veiculo_precos is
  'Histórico de preço da unidade (spec 00): FIPE, anúncio e piso, com vigência. Venda abaixo do piso sem aprovação é bloqueio do fechamento (spec 20, F1).';

create index if not exists veiculo_precos_veiculo_idx
  on public.veiculo_precos (veiculo_id, vigente_desde desc);

alter table public.veiculo_custos enable row level security;
alter table public.veiculo_precos enable row level security;

drop policy if exists nucleo_staff_le on public.veiculo_custos;
create policy nucleo_staff_le on public.veiculo_custos
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists nucleo_staff_insere on public.veiculo_custos;
create policy nucleo_staff_insere on public.veiculo_custos
  for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists nucleo_staff_atualiza on public.veiculo_custos;
create policy nucleo_staff_atualiza on public.veiculo_custos
  for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_le on public.veiculo_precos;
create policy nucleo_staff_le on public.veiculo_precos
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists nucleo_staff_insere on public.veiculo_precos;
create policy nucleo_staff_insere on public.veiculo_precos
  for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

do $$
declare
  v uuid;
  falhas int := 0;
begin
  insert into public.veiculos (chassi, marca, modelo)
  values ('ACEITE-F0D-000000001', 'Teste', 'Aceite') returning id into v;

  -- custo negativo: recusa.
  begin
    insert into public.veiculo_custos (veiculo_id, categoria, valor)
    values (v, 'preparacao', -1);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- piso acima do anúncio: recusa.
  begin
    insert into public.veiculo_precos (veiculo_id, preco_anuncio, preco_minimo)
    values (v, 50000, 60000);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram', falhas;
  end if;

  delete from public.veiculos where id = v;
  raise notice 'F0-d OK: custo negativo e piso>anúncio recusados.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120300', 'f0d_custos_e_precos')
  on conflict (version) do nothing;
