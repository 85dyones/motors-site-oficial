-- ============================================================================
-- F0-n — A ordem dos eventos, e a integridade que faltava
-- ============================================================================
-- Segunda leva do ataque adversarial de 2026-08-29.
--
-- B1 é o achado mais importante da revisão inteira, e o mais silencioso:
--
--   `veiculo_eventos.criado_em` usava `now()`, que no Postgres é o instante da
--   TRANSAÇÃO, não do comando. Dois eventos gravados no mesmo `begin` recebem
--   carimbo IDÊNTICO, e o desempate da projeção caía no `id` — que é
--   `gen_random_uuid()`, aleatório. A sonda provou: ENTRADA e VENDA na mesma
--   transação projetaram `{VENDA, ENTRADA}` e o carro VENDIDO apareceu como
--   `estoque`. Cara ou coroa a cada par.
--
--   Não é laboratório: o fechamento atômico da F1 emite PRE_VENDA_LANCADA,
--   VENDA e NF_EMITIDA na mesma transação POR DESENHO, e a carga inicial emite
--   ENTRADA + PREPARACAO_INICIO junto. É o bug de "vendido não sai da vitrine"
--   que este projeto já pagou uma vez, renascendo na camada do núcleo.
--
--   `clock_timestamp()` marca o instante do COMANDO; a coluna `seq` (identity)
--   desempata o que cair no mesmo microssegundo. Aditivo e barato: a tabela
--   tem 0 linhas.
--
-- E mais: B5 (duas pré-vendas vigentes no mesmo veículo), S1 (chassi e
-- modalidade reescritos por UPDATE livre, sem evento nem motivo), S2
-- (confirmação citando entrada de OUTRO veículo, e `criado_em` forjado
-- anulando o CHECK de validade), S3 (pré-venda nascendo já vencida), S4
-- (preço negativo), S5 (o guarda do balanço lendo o razão pela RLS de quem
-- insere — falha fechado hoje, mas a premissa morre quando a F1 refinar as
-- policies por papel).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B1 — ordem determinística da linha do tempo
-- ----------------------------------------------------------------------------
alter table public.veiculo_eventos
  alter column criado_em set default clock_timestamp();

alter table public.veiculo_eventos
  add column if not exists seq bigint generated always as identity;

comment on column public.veiculo_eventos.seq is
  'Desempate da ordem quando dois eventos caem no mesmo instante. `criado_em` sozinho não basta: até 2026-08-29 usava now() (instante da TRANSAÇÃO) e o desempate caía no uuid aleatório — um carro vendido projetava "estoque" em metade dos casos.';

create index if not exists veiculo_eventos_ordem_idx
  on public.veiculo_eventos (veiculo_id, criado_em, seq);

create or replace view public.veiculo_situacao
with (security_invoker = true) as
select
  v.id           as veiculo_id,
  v.org_id,
  public.calcula_situacao(
    coalesce(
      array_agg(e.tipo order by e.criado_em, e.seq) filter (where e.id is not null),
      '{}'::public.evento_tipo[]
    )
  )              as situacao,
  count(e.id)    as eventos,
  max(e.criado_em) as ultimo_evento_em
from public.veiculos v
left join public.veiculo_eventos e on e.veiculo_id = v.id
group by v.id, v.org_id;

revoke all on public.veiculo_situacao from anon;

-- ----------------------------------------------------------------------------
-- B5 — uma reserva vigente por veículo (a irmã da aquisição única ativa)
-- ----------------------------------------------------------------------------
create unique index if not exists negocios_uma_pre_venda_por_veiculo
  on public.negocios (veiculo_id) where estado = 'pre_venda';

-- ----------------------------------------------------------------------------
-- S3 — pré-venda não nasce (nem vira) vencida; `now()` não cabe em CHECK
-- S1 — a entrada não se reescreve: só `ativa` muda por UPDATE
-- ----------------------------------------------------------------------------
create or replace function public.negocios_validade_no_futuro()
returns trigger
language plpgsql
as $$
declare
  entrando_em_pre_venda boolean;
  mexeu_na_validade boolean;
begin
  if new.estado <> 'pre_venda' then
    return new;  -- proposta, fechado e cancelado não têm reserva a vencer
  end if;

  entrando_em_pre_venda := (tg_op = 'INSERT') or (old.estado is distinct from 'pre_venda');
  mexeu_na_validade     := (tg_op = 'INSERT') or (new.validade is distinct from old.validade);

  -- A régua vale quando a reserva NASCE ou quando alguém mexe no prazo dela.
  -- Uma pré-venda que venceu sozinha continua editável de propósito: é assim
  -- que a tela registra o desfecho ("validade vencida → libera o carro",
  -- spec 20). Barrar o UPDATE aqui deixaria a reserva vencida presa para
  -- sempre — o oposto do que a regra quer.
  if (entrando_em_pre_venda or mexeu_na_validade)
     and (new.validade is null or new.validade <= now()) then
    raise exception 'Pré-venda com validade no passado (%): a reserva existe para vencer no futuro — sem prazo à frente a fila nunca libera o carro.',
      new.validade using errcode = 'raise_exception';
  end if;

  return new;
end;
$$;

drop trigger if exists negocios_validade_no_futuro on public.negocios;
create trigger negocios_validade_no_futuro
  before insert or update on public.negocios
  for each row execute function public.negocios_validade_no_futuro();

create or replace function public.veiculo_entradas_so_encerra()
returns trigger
language plpgsql
as $$
begin
  -- Correção e estorno de entrada são EVENTOS com motivo (spec 10), nunca
  -- edição: converter uma consignação em compra própria por UPDATE apagaria a
  -- história de quem era o dono do carro. O que se pode mexer aqui é encerrar
  -- a aquisição (`ativa`), que é o que a venda e a devolução fazem.
  if to_jsonb(new) - 'ativa' is distinct from to_jsonb(old) - 'ativa' then
    raise exception 'Entrada não se edita (spec 10): corrija por CORRECAO_ENTRADA/ESTORNO_ENTRADA com motivo. Por UPDATE, só `ativa`.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

drop trigger if exists veiculo_entradas_so_encerra on public.veiculo_entradas;
create trigger veiculo_entradas_so_encerra
  before update on public.veiculo_entradas
  for each row execute function public.veiculo_entradas_so_encerra();

create or replace function public.veiculos_chassi_imutavel()
returns trigger
language plpgsql
as $$
begin
  if new.chassi is distinct from old.chassi then
    raise exception 'Chassi é a identidade do veículo (spec 00) e não se troca: linha errada se corrige criando a certa, não reescrevendo esta.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

drop trigger if exists veiculos_chassi_imutavel on public.veiculos;
create trigger veiculos_chassi_imutavel
  before update on public.veiculos
  for each row execute function public.veiculos_chassi_imutavel();

-- ----------------------------------------------------------------------------
-- S2 — a confirmação é do PAR veículo+entrada, e o instante é do banco
-- ----------------------------------------------------------------------------
do $$ begin
  alter table public.veiculo_entradas
    add constraint veiculo_entradas_id_veiculo_uk unique (id, veiculo_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.confirmacoes_disponibilidade
    add constraint confirmacao_entrada_do_mesmo_veiculo
    foreign key (entrada_id, veiculo_id)
    references public.veiculo_entradas (id, veiculo_id);
exception when duplicate_object then null; end $$;

create or replace function public.confirmacoes_carimbar_instante()
returns trigger
language plpgsql
as $$
begin
  -- `criado_em` vinha do corpo, e com ele o CHECK `valida_ate > criado_em`
  -- virava decorativo: bastava dizer que a confirmação nasceu há dois dias.
  new.criado_em := now();
  if new.valida_ate <= new.criado_em then
    raise exception 'Confirmação de disponibilidade já nasceria vencida: a trava anti venda dupla exige validade no futuro.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;

drop trigger if exists confirmacoes_carimbar_instante on public.confirmacoes_disponibilidade;
create trigger confirmacoes_carimbar_instante
  before insert on public.confirmacoes_disponibilidade
  for each row execute function public.confirmacoes_carimbar_instante();

-- ----------------------------------------------------------------------------
-- S4 — preço não é negativo
-- ----------------------------------------------------------------------------
do $$ begin
  alter table public.veiculo_precos
    add constraint precos_nao_negativos check (
      coalesce(fipe_valor, 0) >= 0
      and coalesce(preco_anuncio, 0) >= 0
      and coalesce(preco_minimo, 0) >= 0
    );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- S5 — o guarda do balanço enxerga o razão inteiro, não o recorte de quem insere
-- ----------------------------------------------------------------------------
create or replace function public.nucleo_conferir_balanco()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid;
  soma numeric;
  pernas int;
begin
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
comment on function public.nucleo_conferir_balanco() is
  'SECURITY DEFINER desde 2026-08-29: como INVOKER, a soma das partidas era lida sob a RLS de quem insere. Falhava fechado hoje (todo staff vê tudo), mas a corretude do razão não pode depender dessa premissa — ela morre quando a F1 refinar as policies por papel.';

-- ----------------------------------------------------------------------------
-- Autoconferência — reproduz as sondas que reprovaram, e exige recusa
-- ----------------------------------------------------------------------------
do $$
declare
  v uuid;
  v2 uuid;
  e1 uuid;
  neg uuid;
  ent uuid;
  ent2 uuid;
  situacao_obtida text;
  falhas int := 0;
begin
  insert into public.veiculos (chassi, marca, modelo)
  values ('ACEITE-F0N-000000001', 'Teste', 'Aceite') returning id into v;
  insert into public.veiculos (chassi, marca, modelo)
  values ('ACEITE-F0N-000000002', 'Teste', 'Outro') returning id into v2;

  -- B1: os dois eventos na MESMA transação, com o uuid "errado" de propósito
  -- (o da VENDA menor que o da ENTRADA, que era o que sorteava a inversão).
  insert into public.veiculo_eventos (id, veiculo_id, tipo, usuario_id)
  values ('ffffffff-ffff-4fff-8fff-ffffffffffff', v, 'ENTRADA',
          '00000000-0000-0000-0000-000000000000');
  insert into public.veiculo_eventos (id, veiculo_id, tipo, usuario_id)
  values ('00000000-0000-4000-8000-000000000001', v, 'VENDA',
          '00000000-0000-0000-0000-000000000000');

  select situacao into situacao_obtida from public.veiculo_situacao where veiculo_id = v;
  if situacao_obtida <> 'vendido' then
    falhas := falhas + 1;
    raise warning 'B1 FALHOU: carro vendido projetou "%" — a ordem ainda é sorteio', situacao_obtida;
  end if;

  -- B5: segunda pré-venda vigente no mesmo veículo.
  insert into public.negocios (veiculo_id, estado, validade, preco, comprador_nome)
  values (v2, 'pre_venda', now() + interval '3 days', 59000, 'Comprador A')
  returning id into neg;
  begin
    insert into public.negocios (veiculo_id, estado, validade, preco, comprador_nome)
    values (v2, 'pre_venda', now() + interval '3 days', 58000, 'Comprador B');
    falhas := falhas + 1;
    raise warning 'B5 FALHOU: dois compradores reservaram o mesmo carro';
  exception when unique_violation then null; end;

  -- S3: pré-venda nascendo vencida.
  begin
    insert into public.negocios (veiculo_id, estado, validade, preco)
    values (v, 'pre_venda', now() - interval '10 days', 1000);
    falhas := falhas + 1;
    raise warning 'S3 FALHOU: pré-venda nasceu vencida';
  exception when raise_exception then null; end;

  -- S1: a consignação virando compra própria por UPDATE.
  insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada, consig_prazo_dias)
  values (v, 'consignacao', 'terceiro', 0, 30) returning id into ent;
  begin
    update public.veiculo_entradas
       set modalidade = 'compra_direta', posse = 'propria', valor_entrada = 1
     where id = ent;
    falhas := falhas + 1;
    raise warning 'S1 FALHOU: entrada foi reescrita sem evento nem motivo';
  exception when raise_exception then null; end;

  -- …mas encerrar a aquisição continua possível (é o que a venda faz).
  update public.veiculo_entradas set ativa = false where id = ent;
  if (select ativa from public.veiculo_entradas where id = ent) then
    falhas := falhas + 1;
    raise warning 'S1 FALHOU pelo outro lado: não dá para encerrar a entrada';
  end if;
  update public.veiculo_entradas set ativa = true where id = ent;

  -- S1-b: chassi trocado.
  begin
    update public.veiculos set chassi = 'OUTROCHASSI999' where id = v;
    falhas := falhas + 1;
    raise warning 'S1-b FALHOU: chassi foi trocado';
  exception when raise_exception then null; end;

  -- S2: confirmação do veículo A citando entrada do veículo B.
  insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada, parceria_preco_entrada, parceria_parceiro)
  values (v2, 'parceria', 'terceiro', 0, 40000, 'Parceiro Aceite') returning id into ent2;
  begin
    insert into public.confirmacoes_disponibilidade (veiculo_id, entrada_id, confirmada_por, valida_ate)
    values (v, ent2, '00000000-0000-0000-0000-000000000000', now() + interval '2 hours');
    falhas := falhas + 1;
    raise warning 'S2 FALHOU: confirmação aceitou entrada de outro veículo';
  exception when foreign_key_violation then null; end;

  -- S2-b: `criado_em` forjado para burlar a validade.
  begin
    insert into public.confirmacoes_disponibilidade (veiculo_id, entrada_id, confirmada_por, valida_ate, criado_em)
    values (v, ent, '00000000-0000-0000-0000-000000000000',
            now() - interval '1 day', now() - interval '2 days');
    falhas := falhas + 1;
    raise warning 'S2-b FALHOU: confirmação vencida entrou com criado_em forjado';
  exception when raise_exception then null; end;

  -- S4: preço negativo.
  begin
    insert into public.veiculo_precos (veiculo_id, preco_anuncio, preco_minimo)
    values (v, -50000, -60000);
    falhas := falhas + 1;
    raise warning 'S4 FALHOU: preço negativo entrou';
  exception when check_violation then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % brecha(s) seguem abertas', falhas;
  end if;

  -- Limpeza (dentro da transação da migração).
  alter table public.veiculo_eventos disable trigger veiculo_eventos_append_only;
  delete from public.veiculo_eventos where veiculo_id in (v, v2);
  alter table public.veiculo_eventos enable trigger veiculo_eventos_append_only;
  delete from public.negocios where veiculo_id in (v, v2);
  delete from public.veiculo_entradas where veiculo_id in (v, v2);
  delete from public.veiculos where id in (v, v2);

  raise notice 'F0-n OK: ordem determinística (vendido projeta vendido), reserva única, entrada e chassi imutáveis, confirmação coerente, preço não-negativo.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829160000', 'f0n_ordem_dos_eventos_e_integridade')
  on conflict (version) do nothing;
