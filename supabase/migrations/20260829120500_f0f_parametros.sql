-- ============================================================================
-- F0-f — `parametros_avaliacao` (curva de deságio, spec 11) e
--         `ciclo_parametros` (faixas da recompra, Emenda 02 / manual v1.2)
-- ============================================================================
-- Decisão 3 do handoff: regra é dado, com vigência datada e tela de edição no
-- admin (a tela é F1; a tabela e o guarda nascem agora). Registro antigo guarda
-- os parâmetros do dia em que foi criado — por isso o guarda D-T1.7.
--
-- Os seeds transcrevem a spec 11 e a Emenda 02. Os percentuais de recompra são
-- SEED A VALIDAR contra o praticado da casa por perfil (manual v1.2 §5.5;
-- pendência D13) — validação é pré-requisito do primeiro contrato, não desta
-- migração.
-- ============================================================================

create table if not exists public.parametros_avaliacao (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null default public.org_padrao(),
  -- Curva da spec 11, em pontos percentuais sobre a FIPE:
  base_pp                numeric(5,2) not null,
  estado_excepcional_pp  numeric(5,2) not null,
  piso_pct               numeric(5,2) not null,
  teto_pct               numeric(5,2) not null,
  -- Degraus de km (desvio vs 15.000 × idade) e faixas de avaria/pendência:
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
comment on table public.parametros_avaliacao is
  'Curva de deságio sobre a FIPE (spec 11), com vigência. Mudar a régua não altera avaliações passadas — cada avaliação persiste o breakdown do dia. Acima do teto: recusar ou encaminhar como repasse.';

create table if not exists public.ciclo_parametros (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null default public.org_padrao(),
  -- Régua de revisões (Emenda 01, já operando na Garagem):
  intervalo_km             integer not null,
  intervalo_meses          integer not null,
  janela_dias              integer not null,
  janela_km                integer not null,
  doc_prazo_dias           integer not null,
  recupera_dias            integer not null,
  max_recuperacoes_ciclo   integer not null,
  franquia_km_ano          integer not null,
  -- Faixas de recompra (Emenda 02, manual v1.2 §5.5) — % sobre a FIPE vigente
  -- no exercício: {"em_dia":{"troca":85,"dinheiro":80},"recuperada":{...}}.
  percentuais              jsonb not null,
  seed_validado_em         date,  -- D13: null até bater contra o praticado por perfil
  excludentes              text[] not null,
  descricao                text,
  vigencia_desde           date not null default current_date,
  vigencia_ate             date,
  criado_em                timestamptz not null default now()
);
comment on table public.ciclo_parametros is
  'Parâmetros do Motors Ciclo como DADO (Emenda 02): o contrato guarda os do dia da assinatura. seed_validado_em nulo = percentual ainda não batido contra o praticado da casa — nenhum contrato assina antes disso (manual v1.2 §1.4). A trava pleno×FIPE ≤ praticado − margem alvo aplica-se na F1, com a margem alvo que o dono ainda vai fixar (Anexo 9).';

-- D-T1.7 nas duas.
drop trigger if exists parametros_avaliacao_vigencia on public.parametros_avaliacao;
create trigger parametros_avaliacao_vigencia
  before update on public.parametros_avaliacao
  for each row execute function public.nucleo_so_encerra_vigencia();

drop trigger if exists ciclo_parametros_vigencia on public.ciclo_parametros;
create trigger ciclo_parametros_vigencia
  before update on public.ciclo_parametros
  for each row execute function public.nucleo_so_encerra_vigencia();

-- Seeds — transcrição literal da spec 11 e da Emenda 02.
insert into public.parametros_avaliacao
  (base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,
   avaria_leve_pp, avaria_seria_pp, pendencia_pp, descricao)
select
  20, -5, 15, 40,
  '[{"desvio_km_ate": 5000,  "pp": 0},
    {"desvio_km_ate": 15000, "pp": 2},
    {"desvio_km_ate": 30000, "pp": 4},
    {"desvio_km_ate": 50000, "pp": 7},
    {"desvio_km_ate": null,  "pp": 10}]'::jsonb,
  numrange(2, 4, '[]'), numrange(8, 12, '[]'), numrange(3, 5, '[]'),
  'Seed da spec 11: base 20 p.p., estado excepcional −5 (piso 15%), teto 40%. Km baixo não é prêmio — é alerta de hodômetro.'
where not exists (select 1 from public.parametros_avaliacao);

insert into public.ciclo_parametros
  (intervalo_km, intervalo_meses, janela_dias, janela_km, doc_prazo_dias,
   recupera_dias, max_recuperacoes_ciclo, franquia_km_ano, percentuais,
   excludentes, descricao)
select
  10000, 12, 30, 1000, 30, 60, 1, 15000,
  '{"em_dia": {"troca": 85, "dinheiro": 80}, "recuperada": {"troca": 80, "dinheiro": 75}, "fora": null}'::jsonb,
  array['sinistro_media_ou_grande_monta','gravame_nao_quitado','adulteracao'],
  'Seed da Emenda 02 (manual v1.2 §5.5): faixa "fora" é extinção (avaliação normal). seed_validado_em nulo até D13 — bater contra o praticado por perfil antes do primeiro contrato.'
where not exists (select 1 from public.ciclo_parametros);

-- RLS: staff lê; UPDATE = só encerramento (trigger); INSERT staff (linha nova
-- de vigência). Tela com papel refina na F1.
alter table public.parametros_avaliacao enable row level security;
alter table public.ciclo_parametros enable row level security;

do $$
declare t text;
begin
  foreach t in array array['parametros_avaliacao','ciclo_parametros'] loop
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
  pa record;
  cp record;
  falhas int := 0;
begin
  select * into pa from public.parametros_avaliacao where vigencia_ate is null;
  if pa.base_pp <> 20 or pa.piso_pct <> 15 or pa.teto_pct <> 40 then
    raise exception 'ACEITE FALHOU: curva seed diverge da spec 11 (base=%, piso=%, teto=%)',
      pa.base_pp, pa.piso_pct, pa.teto_pct;
  end if;
  if jsonb_array_length(pa.degraus_km) <> 5 then
    raise exception 'ACEITE FALHOU: degraus_km com % faixas (esperava 5)', jsonb_array_length(pa.degraus_km);
  end if;

  select * into cp from public.ciclo_parametros where vigencia_ate is null;
  if cp.intervalo_km <> 10000 or cp.intervalo_meses <> 12
     or cp.janela_dias <> 30 or cp.janela_km <> 1000 or cp.franquia_km_ano <> 15000 then
    raise exception 'ACEITE FALHOU: régua de revisões diverge da Emenda 01/02';
  end if;
  if (cp.percentuais->'em_dia'->>'troca')::int <> 85
     or (cp.percentuais->'recuperada'->>'dinheiro')::int <> 75 then
    raise exception 'ACEITE FALHOU: faixas de recompra divergem da Emenda 02';
  end if;
  if cp.seed_validado_em is not null then
    raise exception 'ACEITE FALHOU: seed não pode nascer validado — D13 é do dono';
  end if;

  -- Guarda D-T1.7 vale aqui também.
  begin
    update public.ciclo_parametros set franquia_km_ano = 20000 where id = cp.id;
    falhas := falhas + 1;
  exception when raise_exception then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: parâmetro vigente aceitou edição';
  end if;

  raise notice 'F0-f OK: curva spec 11 e faixas Emenda 02 semeadas (seed NÃO validado, como deve), vigência trancada.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120500', 'f0f_parametros')
  on conflict (version) do nothing;
