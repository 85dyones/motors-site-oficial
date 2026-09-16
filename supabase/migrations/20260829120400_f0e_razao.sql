-- ============================================================================
-- F0-e — O razão operacional (spec 30): plano de contas, lançamentos,
--         partidas dobradas com dimensões, e regra de contabilização como DADO
-- ============================================================================
-- Decisão 2 do handoff: "Todo evento de negócio emite lançamento balanceado
-- (débito = crédito, constraint deferida). Contas a pagar/receber são VISÕES
-- do razão, nunca uma segunda verdade. Escopo: resultado operacional — sem
-- SPED/ECD/apuração de tributos."
--
-- Números de negócio NÃO moram aqui: comissão fica SEM seed (o valor é do
-- dono, pendência declarada) — a estrutura nasce, o número espera.
-- ============================================================================

create table if not exists public.plano_contas (
  codigo    text primary key,
  org_id    uuid not null default public.org_padrao(),
  nome      text not null,
  natureza  text not null check (natureza in ('ativo','passivo','receita','custo','despesa','imposto')),
  criado_em timestamptz not null default now()
);
comment on table public.plano_contas is
  'As 15 contas do razão operacional (spec 30). O nome plano_contas ficou livre com a aposentadoria do caixa legado (20260828190000) — este é OUTRO desenho: seed fixo, razão por partidas, sem hierarquia.';

insert into public.plano_contas (codigo, nome, natureza) values
  ('1.1.1', 'Caixa e bancos',                          'ativo'),
  ('1.1.2', 'A receber',                               'ativo'),
  ('1.1.3', 'Estoque de veículos',                     'ativo'),
  ('2.1.1', 'Fornecedores',                            'passivo'),
  ('2.1.2', 'A pagar pessoal e comissões',             'passivo'),
  ('2.1.3', 'Sinais recebidos',                        'passivo'),
  ('2.1.4', 'Terceiros a pagar (consignação/parceria)','passivo'),
  ('3.1.1', 'Receita de venda',                        'receita'),
  ('3.1.2', 'Receita de repasse',                      'receita'),
  ('3.2.1', 'Receitas acessórias',                     'receita'),
  ('4.1.1', 'CMV',                                     'custo'),
  ('4.2.1', 'Mídia',                                   'despesa'),
  ('4.3.1', 'Comissões',                               'despesa'),
  ('4.4.1', 'Despesas operacionais',                   'despesa'),
  ('5.1.1', 'Impostos sobre venda',                    'imposto')
on conflict (codigo) do nothing;

create table if not exists public.lancamentos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default public.org_padrao(),
  evento_id        uuid references public.veiculo_eventos(id),
  descricao        text,
  data_competencia date not null default current_date,
  data_caixa       date,
  estorna_id       uuid references public.lancamentos(id),
  criado_em        timestamptz not null default now(),
  criado_por       uuid not null
);
comment on table public.lancamentos is
  'Cabeçalho do lançamento (spec 30). Append-only: correção é estorno com contrapartida (estorna_id). Fechamento de período trava o passado — entra com o financeiro da F1/F3.';

create table if not exists public.partidas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default public.org_padrao(),
  lancamento_id uuid not null references public.lancamentos(id),
  conta_codigo  text not null references public.plano_contas(codigo),
  -- Convenção da spec 30: valor > 0 é débito, valor < 0 é crédito.
  valor         numeric(14,2) not null check (valor <> 0),
  -- As dimensões que fazem o razão responder perguntas de loja:
  veiculo_id    uuid references public.veiculos(id),
  modalidade    public.modalidade_tipo,
  saida         public.saida_tipo,
  vendedor_id   uuid,
  campanha_id   text,
  centro_custo  text,
  pessoa        text,
  lote_id       uuid,
  criado_em     timestamptz not null default now()
);
comment on table public.partidas is
  'Partidas dobradas com dimensões (spec 30). Débito positivo, crédito negativo; a constraint deferida exige soma zero por lançamento no COMMIT. Append-only.';

create index if not exists partidas_lancamento_idx on public.partidas (lancamento_id);
create index if not exists partidas_veiculo_idx    on public.partidas (veiculo_id) where veiculo_id is not null;
create index if not exists partidas_conta_idx      on public.partidas (conta_codigo, criado_em);

-- ----------------------------------------------------------------------------
-- Balanço zero por lançamento — constraint trigger DEFERIDA (spec 00/30):
-- dentro da transação as pernas entram uma a uma; no COMMIT, soma zero ou nada.
-- ----------------------------------------------------------------------------
create or replace function public.nucleo_conferir_balanco()
returns trigger
language plpgsql
as $$
declare
  alvo uuid;
  soma numeric;
  pernas int;
begin
  -- O mesmo guarda serve às duas mesas: na partida, o alvo é o lançamento
  -- dela; no cabeçalho, é o próprio id (pega lançamento que nasce sem perna).
  if tg_table_name = 'lancamentos' then
    alvo := new.id;
  else
    alvo := new.lancamento_id;
  end if;

  select coalesce(sum(valor), 0), count(*)
    into soma, pernas
    from public.partidas
   where lancamento_id = alvo;

  if pernas < 2 then
    raise exception 'Lançamento % com % perna(s): partidas dobradas exigem ao menos débito e crédito.',
      alvo, pernas using errcode = 'raise_exception';
  end if;

  if soma <> 0 then
    raise exception 'Lançamento % desbalanceado: soma das partidas = % (débito=+, crédito=−; precisa fechar em zero).',
      alvo, soma using errcode = 'raise_exception';
  end if;

  return null;
end;
$$;

drop trigger if exists partidas_balanco_zero on public.partidas;
create constraint trigger partidas_balanco_zero
  after insert on public.partidas
  deferrable initially deferred
  for each row execute function public.nucleo_conferir_balanco();

drop trigger if exists lancamentos_tem_partidas on public.lancamentos;
create constraint trigger lancamentos_tem_partidas
  after insert on public.lancamentos
  deferrable initially deferred
  for each row execute function public.nucleo_conferir_balanco();

-- Append-only nas duas (D-T1.6) — mesma função da fatia c.
drop trigger if exists lancamentos_append_only on public.lancamentos;
create trigger lancamentos_append_only
  before update or delete on public.lancamentos
  for each row execute function public.nucleo_bloquear_mutacao();

drop trigger if exists partidas_append_only on public.partidas;
create trigger partidas_append_only
  before update or delete on public.partidas
  for each row execute function public.nucleo_bloquear_mutacao();

-- ----------------------------------------------------------------------------
-- Regra é dado: contabilização por evento e comissão, com vigência datada.
-- ----------------------------------------------------------------------------
create table if not exists public.regras_contabilizacao (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  evento         public.evento_tipo not null,
  -- `papel` distingue as pernas do mesmo evento (receita, cmv, comissão…).
  papel          text not null,
  modalidade     public.modalidade_tipo,
  saida          public.saida_tipo,
  conta_debito   text not null references public.plano_contas(codigo),
  conta_credito  text not null references public.plano_contas(codigo),
  base_valor     text not null,
  descricao      text,
  vigencia_desde date not null default current_date,
  vigencia_ate   date,
  criado_em      timestamptz not null default now()
);
comment on table public.regras_contabilizacao is
  'Evento → contas (spec 30), como DADO com vigência. A contabilização automática (mesma transação do evento) liga na F1; os seeds abaixo transcrevem os exemplos da spec.';

create table if not exists public.regras_comissao (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  saida          public.saida_tipo not null,
  modo           text not null check (modo in ('fixa','percentual')),
  base           text check (base in ('valor_venda','margem_liquida')),
  valor          numeric(12,4) not null check (valor >= 0),
  descricao      text,
  vigencia_desde date not null default current_date,
  vigencia_ate   date,
  criado_em      timestamptz not null default now(),
  constraint percentual_exige_base check (modo <> 'percentual' or base is not null)
);
comment on table public.regras_comissao is
  'Comissão por saída (spec 20/30), como DADO. SEM SEED de propósito: o valor e a base são decisão do dono (pendência declarada no levantamento do handoff) — a F1 não liga comissão sem a linha existir aqui.';

-- D-T1.7: linha vigente só aceita o encerramento da vigência.
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

drop trigger if exists regras_contabilizacao_vigencia on public.regras_contabilizacao;
create trigger regras_contabilizacao_vigencia
  before update on public.regras_contabilizacao
  for each row execute function public.nucleo_so_encerra_vigencia();

drop trigger if exists regras_comissao_vigencia on public.regras_comissao;
create trigger regras_comissao_vigencia
  before update on public.regras_comissao
  for each row execute function public.nucleo_so_encerra_vigencia();

-- Seeds: transcrição dos exemplos da spec 30 (nada inventado).
insert into public.regras_contabilizacao
  (evento, papel, modalidade, conta_debito, conta_credito, base_valor, descricao)
values
  ('ENTRADA', 'aquisicao', 'compra_direta', '1.1.3', '2.1.1', 'valor_entrada',
   'Compra direta: estoque contra fornecedores'),
  ('ENTRADA', 'aquisicao', 'troca', '1.1.3', '3.1.1', 'credito_de_troca',
   'Troca: o crédito concedido é custo do carro que entra e desconto na venda de origem'),
  ('VENDA', 'receita', null, '1.1.2', '3.1.1', 'valor_venda',
   'Venda varejo: a receber contra receita'),
  ('VENDA', 'cmv', null, '4.1.1', '1.1.3', 'custo_da_unidade',
   'Baixa do estoque no CMV'),
  ('VENDA', 'parte_do_dono', null, '1.1.2', '2.1.4', 'parte_do_dono',
   'Venda de unidade de terceiro (consignação/parceria): a parte do dono vira passivo'),
  ('VENDA', 'comissao', null, '4.3.1', '2.1.2', 'valor_comissao',
   'Comissão do consultor — o VALOR vem de regras_comissao, ainda sem seed'),
  ('REPASSE_SAIDA', 'receita', null, '1.1.2', '3.1.2', 'valor_venda',
   'Repasse: receita em conta própria, fora da margem média do varejo'),
  ('REPASSE_SAIDA', 'cmv', null, '4.1.1', '1.1.3', 'custo_da_unidade',
   'Baixa do estoque no CMV — mesma perna da venda'),
  ('SINAL', 'sinal', null, '1.1.1', '2.1.3', 'valor_sinal',
   'Só o sinal toca o razão antes do fechamento (spec 20)'),
  ('CANCELAMENTO_SINAL', 'estorno_sinal', null, '2.1.3', '1.1.1', 'valor_sinal',
   'Devolução do sinal no cancelamento')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS: staff lê; escrita de lançamento/partida também staff (a F1 encapsula em
-- função Postgres atômica); regras: leitura staff, escrita fica para a tela de
-- edição com papel (F1) — por ora só INSERT de staff, sem DELETE.
-- ----------------------------------------------------------------------------
alter table public.plano_contas enable row level security;
alter table public.lancamentos enable row level security;
alter table public.partidas enable row level security;
alter table public.regras_contabilizacao enable row level security;
alter table public.regras_comissao enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['plano_contas','lancamentos','partidas','regras_contabilizacao','regras_comissao'] loop
    execute format('drop policy if exists nucleo_staff_le on public.%I', t);
    execute format(
      'create policy nucleo_staff_le on public.%I for select to authenticated
       using (public.is_staff(auth.uid()) and org_id = public.org_padrao())', t);
    execute format('drop policy if exists nucleo_staff_insere on public.%I', t);
    execute format(
      'create policy nucleo_staff_insere on public.%I for insert to authenticated
       with check (public.is_staff(auth.uid()) and org_id = public.org_padrao())', t);
  end loop;

  -- Regras precisam encerrar vigência: UPDATE permitido (o trigger D-T1.7 limita ao encerramento).
  foreach t in array array['regras_contabilizacao','regras_comissao'] loop
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
  n int;
  l uuid;
  r uuid;
  falhas int := 0;
begin
  select count(*) into n from public.plano_contas;
  if n <> 15 then
    raise exception 'ACEITE FALHOU: plano de contas com % linhas (esperava 15)', n;
  end if;

  -- 1. Lançamento desbalanceado morre no COMMIT (forçado aqui com IMMEDIATE).
  begin
    set constraints all immediate;
    insert into public.lancamentos (descricao, criado_por)
    values ('aceite desbalanceado', '00000000-0000-0000-0000-000000000000')
    returning id into l;
    falhas := falhas + 1; -- lançamento sem partidas deveria ter falhado já aqui
  exception when raise_exception then null; end;
  set constraints all deferred;

  -- 2. Lançamento equilibrado passa (2 pernas somando zero).
  insert into public.lancamentos (descricao, criado_por)
  values ('aceite equilibrado', '00000000-0000-0000-0000-000000000000')
  returning id into l;
  insert into public.partidas (lancamento_id, conta_codigo, valor)
  values (l, '1.1.1', 100.00), (l, '2.1.3', -100.00);
  set constraints all immediate;  -- valida agora; se desbalanceasse, estourava
  set constraints all deferred;

  -- 3. Partida órfã desbalanceando lançamento já fechado: recusa.
  begin
    insert into public.partidas (lancamento_id, conta_codigo, valor)
    values (l, '1.1.1', 50.00);
    set constraints all immediate;
    falhas := falhas + 1;
  exception when raise_exception then null; end;
  set constraints all deferred;

  -- 4. UPDATE em partida: recusa (append-only).
  begin
    update public.partidas set valor = 999 where lancamento_id = l and valor = 100.00;
    falhas := falhas + 1;
  exception when raise_exception then null; end;

  -- 5. Regra vigente não aceita UPDATE de valor… (numa linha SINTÉTICA:
  -- linha encerrada não reabre nem para aceite — o guarda vale para todos.)
  insert into public.regras_contabilizacao
    (evento, papel, conta_debito, conta_credito, base_valor, descricao)
  values ('BLOQUEIO', 'aceite_f0e', '1.1.1', '2.1.1', 'aceite', 'linha de aceite — apagada ao fim')
  returning id into r;
  begin
    update public.regras_contabilizacao set base_valor = 'outro' where id = r;
    falhas := falhas + 1;
  exception when raise_exception then null; end;

  -- …mas aceita encerrar a vigência.
  update public.regras_contabilizacao set vigencia_ate = current_date where id = r;

  -- 6. E encerrada, nem a vigência se mexe mais.
  begin
    update public.regras_contabilizacao set vigencia_ate = null where id = r;
    falhas := falhas + 1;
  exception when raise_exception then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % brecha(s) no razão', falhas;
  end if;

  -- Limpeza dos sintéticos (dentro da transação da migração).
  delete from public.regras_contabilizacao where id = r;
  alter table public.partidas disable trigger partidas_append_only;
  alter table public.lancamentos disable trigger lancamentos_append_only;
  delete from public.partidas where lancamento_id = l;
  delete from public.lancamentos where id = l;
  alter table public.partidas enable trigger partidas_append_only;
  alter table public.lancamentos enable trigger lancamentos_append_only;

  raise notice 'F0-e OK: 15 contas, balanço zero deferido segurando, append-only segurando, vigência D-T1.7 segurando.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829120400', 'f0e_razao')
  on conflict (version) do nothing;
