-- ============================================================================
-- F0-b — `veiculos` (identidade) e `veiculo_entradas` (as cinco portas)
-- ============================================================================
-- Specs 00 e 10 do handoff. Constraints carregam a regra de negócio — a tela
-- pode errar, o banco não deixa passar. Decisões de convivência: D-T1.1 (nome),
-- D-T1.3 (fornecedor é campo, não tabela), D-T1.4 (elo estoque_id), D-T1.5 (RLS).
-- ============================================================================

-- ATENÇÃO ao nome (D-T1.1): esta NÃO é a ex-`veiculos` do feed (renomeada para
-- `estoque_motors` em 2026-08-03). É a identidade do núcleo: uuid + chassi.
create table if not exists public.veiculos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default public.org_padrao(),
  chassi          text not null,
  placa           text,
  renavam         text,
  marca           text not null,
  modelo          text not null,
  versao          text,
  ano             integer,
  ano_fabricacao  integer,
  fipe_codigo     text,
  km_atual        integer check (km_atual is null or km_atual >= 0),
  -- D-T1.4: o elo com a linha do site (estoque_motors.id, integer do anúncio
  -- RevendaMais ou da faixa nativa do painel). SEM FK de propósito: os ciclos
  -- de vida são independentes na janela; a conferência diária acusa divergência.
  estoque_id      integer unique,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (org_id, chassi)
);
comment on table public.veiculos is
  'Identidade do núcleo (handoff spec 00): uuid + chassi único por org. Não confundir com a ex-veiculos do feed — hoje estoque_motors, que segue sendo a leitura do site até a F2. Elo entre os dois mundos: estoque_id (D-T1.4).';

create table if not exists public.veiculo_entradas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  veiculo_id     uuid not null references public.veiculos(id),
  modalidade     public.modalidade_tipo not null,
  posse          public.posse_tipo not null,
  data_entrada   date not null default current_date,
  valor_entrada  numeric(12,2) not null default 0 check (valor_entrada >= 0),
  ativa          boolean not null default true,

  -- Fornecedor como CAMPO (D-T1.3): compra_direta e repasse pagam alguém.
  fornecedor_nome         text,
  fornecedor_documento    text,
  fornecedor_tipo_pessoa  text check (fornecedor_tipo_pessoa in ('pf','pj')),
  forma_pagamento         text,
  prazo_pagamento         text,
  nf_ref                  text,

  -- troca: a venda de origem é obrigatória (FK entra na fatia g, com negocios).
  venda_origem_id uuid,

  -- consignação: valor do dono e remuneração combinada; custo de entrada é ZERO.
  consig_prazo_dias         integer,
  consig_valor_dono         numeric(12,2),
  consig_remuneracao_tipo   text check (consig_remuneracao_tipo in ('fixa','percentual')),
  consig_remuneracao_valor  numeric(12,2),

  -- parceria: preço travado + margem acordada + regresso.
  parceria_parceiro             text,
  parceria_preco_entrada        numeric(12,2),
  parceria_margem_acordada      numeric(12,2),
  parceria_exclusividade        boolean,
  parceria_dut_em_poder_de      text,
  parceria_regresso_prazo_dias  integer,

  -- repasse (entrada): loja de origem e giro alvo.
  repasse_loja_origem    text,
  repasse_giro_alvo_dias integer,

  observacoes  text,
  criado_em    timestamptz not null default now(),
  criado_por   uuid,

  -- As constraints que SÃO a regra (spec 00/10):
  constraint troca_exige_venda
    check (modalidade <> 'troca' or venda_origem_id is not null),
  constraint consignacao_sem_custo
    check (modalidade <> 'consignacao' or valor_entrada = 0),
  constraint parceria_exige_preco
    check (modalidade <> 'parceria' or parceria_preco_entrada is not null),
  constraint terceiro_sem_posse
    check ((posse = 'terceiro') = (modalidade in ('consignacao','parceria'))),
  -- Lote é momento B (spec 10). Este CHECK sai quando o momento B chegar.
  constraint lote_momento_b
    check (modalidade <> 'lote')
);
comment on table public.veiculo_entradas is
  'Uma linha por entrada (spec 10). O formulário muda por modalidade; aqui as regras valem para qualquer formulário. Correção e estorno são EVENTOS com motivo (spec 10) — a fatia c traz veiculo_eventos.';

-- Uma aquisição ativa por veículo (spec 00) — unique parcial.
create unique index if not exists veiculo_entradas_uma_ativa
  on public.veiculo_entradas (veiculo_id) where ativa;

create index if not exists veiculo_entradas_veiculo_idx
  on public.veiculo_entradas (veiculo_id);

-- ----------------------------------------------------------------------------
-- RLS (D-T1.5): só staff, org fixa; DELETE não existe.
-- ----------------------------------------------------------------------------
alter table public.veiculos enable row level security;
alter table public.veiculo_entradas enable row level security;

drop policy if exists nucleo_staff_le on public.veiculos;
create policy nucleo_staff_le on public.veiculos
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_insere on public.veiculos;
create policy nucleo_staff_insere on public.veiculos
  for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_atualiza on public.veiculos;
create policy nucleo_staff_atualiza on public.veiculos
  for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_le on public.veiculo_entradas;
create policy nucleo_staff_le on public.veiculo_entradas
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_insere on public.veiculo_entradas;
create policy nucleo_staff_insere on public.veiculo_entradas
  for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists nucleo_staff_atualiza on public.veiculo_entradas;
create policy nucleo_staff_atualiza on public.veiculo_entradas
  for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());

-- ----------------------------------------------------------------------------
-- Autoconferência: violar cada constraint e exigir a recusa.
-- ----------------------------------------------------------------------------
do $$
declare
  v uuid;
  falhas int := 0;
begin
  -- D-T1.1: RLS ligada e NENHUMA policy para anon/public em veiculos.
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename in ('veiculos','veiculo_entradas')
      and ('anon' = any(roles) or 'public' = any(roles))
  ) then
    raise exception 'ACEITE FALHOU: policy pública/anon no núcleo — o fantasma de AUDITORIA §3.4-c';
  end if;

  insert into public.veiculos (chassi, marca, modelo)
  values ('ACEITE-F0B-000000001', 'Teste', 'Aceite') returning id into v;

  -- 1. troca sem venda de origem: recusa.
  begin
    insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada)
    values (v, 'troca', 'propria', 1000);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 2. consignação com custo: recusa.
  begin
    insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada)
    values (v, 'consignacao', 'terceiro', 500);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 3. parceria sem preço travado: recusa.
  begin
    insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada)
    values (v, 'parceria', 'terceiro', 0);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 4. compra_direta com posse de terceiro: recusa (e o inverso também).
  begin
    insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada)
    values (v, 'compra_direta', 'terceiro', 30000);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 5. lote antes do momento B: recusa.
  begin
    insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada)
    values (v, 'lote', 'propria', 10000);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 6. segunda aquisição ATIVA do mesmo veículo: recusa.
  insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada, fornecedor_nome)
  values (v, 'compra_direta', 'propria', 30000, 'Fornecedor Aceite');
  begin
    insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada, fornecedor_nome)
    values (v, 'compra_direta', 'propria', 31000, 'Fornecedor Aceite 2');
    falhas := falhas + 1;
  exception when unique_violation then null; end;

  -- 7. chassi duplicado na org: recusa.
  begin
    insert into public.veiculos (chassi, marca, modelo)
    values ('ACEITE-F0B-000000001', 'Teste', 'Duplicado');
    falhas := falhas + 1;
  exception when unique_violation then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram pelas constraints', falhas;
  end if;

  -- Limpeza dos sintéticos (o DO roda como dono da migração, fora da RLS).
  delete from public.veiculo_entradas where veiculo_id = v;
  delete from public.veiculos where id = v;

  raise notice 'F0-b OK: 7 violações recusadas, RLS sem porta pública, sintéticos limpos.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120100', 'f0b_veiculos_e_entradas')
  on conflict (version) do nothing;
