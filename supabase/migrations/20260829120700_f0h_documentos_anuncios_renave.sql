-- ============================================================================
-- F0-h — `documentos`, `anuncios` (versionado, append-only) e
--         `renave_operacoes` (espelho NEUTRO de integradora)
-- ============================================================================
-- Specs 50 e 60. O anúncio versionado integra o contrato (CDC art. 30) — é
-- prova, então é imutável. O RENAVE nasce como espelho neutro (decisão da
-- análise de 28/08): operação, status, protocolo, chave da NF-e e payload
-- jsonb — SEM acoplar ao formato de nenhuma integradora, porque a escolha é
-- da F0-humana e a integração por API é F3.
-- ============================================================================

create table if not exists public.documentos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.org_padrao(),
  tipo        text not null check (tipo in ('DUT','CRV','CNH','contrato','laudo','termo','NF')),
  owner_tipo  text not null check (owner_tipo in ('veiculo','pessoa','negocio')),
  owner_id    uuid not null,
  titulo      text,
  url         text,
  validade    date,
  pendente    boolean not null default false,
  detalhe     jsonb not null default '{}'::jsonb,
  criado_em   timestamptz not null default now(),
  criado_por  uuid
);
comment on table public.documentos is
  'Documentos por dono (spec 60): veículo, pessoa ou negócio. Pendência bloqueia ENTREGA_LIBERADA — o gate entra com o fluxo de entrega (F1); a marca nasce aqui.';

create index if not exists documentos_owner_idx
  on public.documentos (owner_tipo, owner_id);
create index if not exists documentos_pendentes_idx
  on public.documentos (owner_tipo, owner_id) where pendente;

create table if not exists public.anuncios (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default public.org_padrao(),
  veiculo_id  uuid not null references public.veiculos(id),
  portal      text not null,
  id_externo  text,
  status      text not null default 'publicado'
              check (status in ('publicado','despublicado','erro')),
  erro        text,
  -- A fotografia do que foi ofertado: texto, fotos, preço, km, data.
  versao      jsonb not null,
  criado_em   timestamptz not null default now(),
  criado_por  uuid
);
comment on table public.anuncios is
  'Anúncio VERSIONADO (spec 50): cada publicação é uma linha imutável presa à unidade — o anúncio integra o contrato (CDC art. 30) e isto é prova. Status novo = linha nova; o integrador de portais chega na F2.';

create index if not exists anuncios_veiculo_idx
  on public.anuncios (veiculo_id, criado_em desc);

drop trigger if exists anuncios_append_only on public.anuncios;
create trigger anuncios_append_only
  before update or delete on public.anuncios
  for each row execute function public.nucleo_bloquear_mutacao();

create table if not exists public.renave_operacoes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  veiculo_id     uuid not null references public.veiculos(id),
  operacao       text not null check (operacao in
                 ('entrada','saida','consignacao','transferencia','retomado')),
  status         text not null default 'pendente',
  protocolo      text,
  chave_nfe      text,
  payload        jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
comment on table public.renave_operacoes is
  'Espelho NEUTRO das cinco operações da Res. CONTRAN 1.026/2026 (spec 60). Status/protocolo/chave vêm da integradora escolhida na F0-humana; a integração por API é F3. O desenho não assume integradora nenhuma de propósito — payload jsonb absorve o formato dela.';

create index if not exists renave_operacoes_veiculo_idx
  on public.renave_operacoes (veiculo_id, criado_em desc);

-- RLS staff (D-T1.5): documentos e renave com UPDATE (status evolui); anúncios sem.
alter table public.documentos enable row level security;
alter table public.anuncios enable row level security;
alter table public.renave_operacoes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['documentos','anuncios','renave_operacoes'] loop
    execute format('drop policy if exists nucleo_staff_le on public.%I', t);
    execute format(
      'create policy nucleo_staff_le on public.%I for select to authenticated
       using (public.is_staff(auth.uid()) and org_id = public.org_padrao())', t);
    execute format('drop policy if exists nucleo_staff_insere on public.%I', t);
    execute format(
      'create policy nucleo_staff_insere on public.%I for insert to authenticated
       with check (public.is_staff(auth.uid()) and org_id = public.org_padrao())', t);
  end loop;

  foreach t in array array['documentos','renave_operacoes'] loop
    execute format('drop policy if exists nucleo_staff_atualiza on public.%I', t);
    execute format(
      'create policy nucleo_staff_atualiza on public.%I for update to authenticated
       using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
       with check (public.is_staff(auth.uid()) and org_id = public.org_padrao())', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------------------------
do $$
declare
  v uuid;
  a uuid;
  falhas int := 0;
begin
  insert into public.veiculos (chassi, marca, modelo)
  values ('ACEITE-F0H-000000001', 'Teste', 'Aceite') returning id into v;

  -- 1. Documento com tipo fora do vocabulário da spec 60: recusa.
  begin
    insert into public.documentos (tipo, owner_tipo, owner_id)
    values ('boleto', 'veiculo', v);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 2. Anúncio publicado é imutável: UPDATE recusado.
  insert into public.anuncios (veiculo_id, portal, versao)
  values (v, 'site', '{"preco": 50000, "titulo": "aceite"}')
  returning id into a;
  begin
    update public.anuncios set versao = '{"preco": 1}'::jsonb where id = a;
    falhas := falhas + 1;
  exception when raise_exception then null; end;

  -- 3. Operação RENAVE fora das cinco da Res. 1.026: recusa.
  begin
    insert into public.renave_operacoes (veiculo_id, operacao)
    values (v, 'licenciamento');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % brecha(s)', falhas;
  end if;

  alter table public.anuncios disable trigger anuncios_append_only;
  delete from public.anuncios where id = a;
  alter table public.anuncios enable trigger anuncios_append_only;
  delete from public.veiculos where id = v;

  raise notice 'F0-h OK: vocabulários fechados e anúncio imutável (é prova).';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120700', 'f0h_documentos_anuncios_renave')
  on conflict (version) do nothing;
