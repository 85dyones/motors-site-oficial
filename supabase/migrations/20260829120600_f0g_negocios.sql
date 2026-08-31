-- ============================================================================
-- F0-g — `negocios`, `negocio_pagamentos` e `confirmacoes_disponibilidade`
-- ============================================================================
-- Spec 20: proposta → pre_venda → fechado | cancelado; composição em linhas
-- previsto → confirmado → liquidado; unidade de terceiro só vende com
-- confirmação de disponibilidade vigente. O fechamento ATÔMICO (função
-- Postgres que valida tudo e dispara VENDA + contabilização) é F1 — aqui
-- nascem as mesas e as regras que ele vai exigir.
--
-- Comprador é CAMPO (D-T1.3): o cadastro unificado de pessoas é decisão da F1.
-- E a FK que faltava na fatia b entra agora: troca referencia a venda de origem.
-- ============================================================================

create table if not exists public.negocios (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default public.org_padrao(),
  veiculo_id        uuid not null references public.veiculos(id),
  estado            text not null default 'proposta'
                    check (estado in ('proposta','pre_venda','fechado','cancelado')),
  preco             numeric(12,2) check (preco is null or preco > 0),
  validade          timestamptz,
  comprador_nome    text,
  comprador_contato text,
  lead_id           bigint,
  vendedor_id       uuid,
  observacoes       text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  -- Pré-venda reserva o carro por prazo: sem validade, a fila trava (spec 20).
  constraint pre_venda_exige_validade
    check (estado <> 'pre_venda' or validade is not null)
);
comment on table public.negocios is
  'O negócio da spec 20. Estados: proposta (nada travado) → pre_venda (reserva com validade) → fechado | cancelado. O fechamento atômico chega na F1; até lá, mudar estado para fechado é proibido por trigger.';

create table if not exists public.negocio_pagamentos (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null default public.org_padrao(),
  negocio_id         uuid not null references public.negocios(id),
  tipo               text not null check (tipo in
                     ('pix','dinheiro','cartao','financiamento','sinal','troca','acessorio','garantia')),
  valor              numeric(12,2) not null check (valor > 0),
  status             text not null default 'previsto'
                     check (status in ('previsto','confirmado','liquidado')),
  financeira         text,
  retorno_previsto   numeric(12,2),
  troca_avaliacao_id uuid,
  detalhes           jsonb not null default '{}'::jsonb,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint financiamento_exige_financeira
    check (tipo <> 'financiamento' or financeira is not null)
);
comment on table public.negocio_pagamentos is
  'A composição apurada (spec 20): cada linha caminha previsto → confirmado → liquidado. O fechamento bloqueia com qualquer linha em previsto ou soma ≠ preço — regra da função atômica da F1.';

create index if not exists negocio_pagamentos_negocio_idx
  on public.negocio_pagamentos (negocio_id);
create index if not exists negocios_veiculo_idx
  on public.negocios (veiculo_id, estado);

create table if not exists public.confirmacoes_disponibilidade (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  veiculo_id     uuid not null references public.veiculos(id),
  entrada_id     uuid not null references public.veiculo_entradas(id),
  confirmada_por uuid not null,
  valida_ate     timestamptz not null,
  criado_em      timestamptz not null default now(),
  constraint validade_no_futuro check (valida_ate > criado_em)
);
comment on table public.confirmacoes_disponibilidade is
  'A trava anti venda dupla de unidade de terceiro (spec 00/10): sinal e venda exigem confirmação VIGENTE do dono/parceiro. Validade curta de propósito.';

-- O elo que a fatia b deixou anunciado: troca referencia a venda de origem.
do $$ begin
  alter table public.veiculo_entradas
    add constraint veiculo_entradas_venda_origem_fk
    foreign key (venda_origem_id) references public.negocios(id);
exception when duplicate_object then null; end $$;

-- Fechamento é função atômica da F1: até ela existir, ninguém marca 'fechado'
-- na mão. O guarda cai quando a função chegar (SECURITY DEFINER dela desliga
-- via GUC local, mesma técnica do disable de trigger em migração).
create or replace function public.nucleo_bloquear_fechamento_manual()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'fechado' and coalesce(current_setting('nucleo.fechamento_atomico', true), '') <> 'on' then
    raise exception 'Fechar negócio é ato atômico da F1 (spec 20): VENDA + contabilização + disparos na mesma transação. Sem a função, não há fechamento manual.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

drop trigger if exists negocios_sem_fechamento_manual on public.negocios;
create trigger negocios_sem_fechamento_manual
  before insert or update on public.negocios
  for each row execute function public.nucleo_bloquear_fechamento_manual();

-- RLS staff (D-T1.5).
alter table public.negocios enable row level security;
alter table public.negocio_pagamentos enable row level security;
alter table public.confirmacoes_disponibilidade enable row level security;

do $$
declare t text;
begin
  foreach t in array array['negocios','negocio_pagamentos','confirmacoes_disponibilidade'] loop
    execute format('drop policy if exists nucleo_staff_le on public.%I', t);
    execute format(
      'create policy nucleo_staff_le on public.%I for select to authenticated
       using (public.is_staff(auth.uid()) and org_id = public.org_padrao())', t);
    execute format('drop policy if exists nucleo_staff_insere on public.%I', t);
    execute format(
      'create policy nucleo_staff_insere on public.%I for insert to authenticated
       with check (public.is_staff(auth.uid()) and org_id = public.org_padrao())', t);
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
  neg uuid;
  falhas int := 0;
begin
  insert into public.veiculos (chassi, marca, modelo)
  values ('ACEITE-F0G-000000001', 'Teste', 'Aceite') returning id into v;

  insert into public.negocios (veiculo_id, preco, comprador_nome)
  values (v, 50000, 'Comprador Aceite') returning id into neg;

  -- 1. Pré-venda sem validade: recusa.
  begin
    update public.negocios set estado = 'pre_venda' where id = neg;
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 2. Fechamento manual sem a função atômica: recusa.
  begin
    update public.negocios set estado = 'fechado' where id = neg;
    falhas := falhas + 1;
  exception when raise_exception then null; end;

  -- 3. Linha de pagamento com tipo fora do vocabulário: recusa.
  begin
    insert into public.negocio_pagamentos (negocio_id, tipo, valor)
    values (neg, 'bitcoin', 1000);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 4. Financiamento sem financeira: recusa.
  begin
    insert into public.negocio_pagamentos (negocio_id, tipo, valor)
    values (neg, 'financiamento', 30000);
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 5. Troca apontando venda de origem inexistente: recusa (FK nova).
  begin
    insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada, venda_origem_id)
    values (v, 'troca', 'propria', 20000, gen_random_uuid());
    falhas := falhas + 1;
  exception when foreign_key_violation then null; end;

  -- 6. Confirmação de disponibilidade já vencida: recusa.
  begin
    insert into public.confirmacoes_disponibilidade (veiculo_id, entrada_id, confirmada_por, valida_ate)
    values (v, gen_random_uuid(), '00000000-0000-0000-0000-000000000000', now() - interval '1 hour');
    falhas := falhas + 1;
  exception when foreign_key_violation or check_violation then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % brecha(s) na pré-venda', falhas;
  end if;

  delete from public.negocio_pagamentos where negocio_id = neg;
  delete from public.negocios where id = neg;
  delete from public.veiculos where id = v;

  raise notice 'F0-g OK: 6 violações recusadas — inclusive fechamento manual antes da função atômica.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120600', 'f0g_negocios')
  on conflict (version) do nothing;
