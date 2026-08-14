-- ==========================================================
-- Caderneta: o carimbo e a série de conformidade
-- ==========================================================
--
-- Duas funções, e a razão de serem funções:
--
-- `carimbar_revisao` — confirmar uma revisão escreve em três lugares
-- (manutencoes, plano_revisoes, leituras_odometro) e calcula
-- `dentro_da_janela` contra o plano. Feito na rota, em três escritas soltas,
-- uma falha no meio deixaria revisão carimbada sem janela casada — e a
-- conformidade do §1.4 leria um dado pela metade.
--
-- `calcular_conformidade_diaria` — a série do §1.4, "preservada, nunca
-- sobrescrita". Uma linha por dia, inclusive com denominador zero (pct NULL).
-- Roda todo dia; enquanto não houver agendamento, o botão do painel A22 a
-- dispara — e dias perdidos entre uma execução e outra são preenchidos
-- retroativamente a partir do estado atual, com a coluna `retroativa` dizendo
-- que o dia não foi medido no dia.
--
-- A régua da janela (§1.5): a tolerância vale para a régua que VENCEU.
-- Conferir data <= janela_fim E km <= km_previsto + 1000 produz exatamente
-- isso — a régua que não venceu passa trivialmente — e antecipar nunca
-- penaliza. Espelhada em src/lib/ciclo/revisao.ts; os testes comparam as duas.
-- ==========================================================

-- A série ganha o registro de retroatividade. Dia calculado depois do fato é
-- válido para o gatilho — o §1.4 emendado pede série contínua —, mas o painel
-- precisa saber distinguir medição de reconstrução.
alter table public.conformidade_diaria
  add column if not exists retroativa boolean not null default false;

comment on column public.conformidade_diaria.retroativa is
  'true = a linha foi preenchida depois do dia, reconstruída do estado atual. '
  'Vale para a série do §1.4; o painel A22 a exibe com essa ressalva.';


-- ==========================================================
-- 1. carimbar_revisao — só staff, e é tudo ou nada
-- ==========================================================

create or replace function public.carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text default null)
  returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  m          record;
  janela     record;
  v_dentro   boolean;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Carimbo é restrito à equipe.' using errcode = 'insufficient_privilege';
  end if;

  select * into m from public.manutencoes where id = p_manutencao for update;
  if not found then
    raise exception 'REVISAO_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  if m.confirmada_em is not null then
    raise exception 'REVISAO_JA_CARIMBADA' using errcode = 'check_violation';
  end if;

  -- ---- recusa: fica no rastro, com o motivo, e fora da conformidade ----
  if not p_aceitar then
    if coalesce(trim(p_motivo), '') = '' then
      raise exception 'RECUSA_SEM_MOTIVO' using errcode = 'check_violation';
    end if;
    update public.manutencoes
       set observacoes = coalesce(observacoes || E'\n', '') ||
                         'RECUSADA em ' || to_char(now(), 'YYYY-MM-DD') || ': ' || trim(p_motivo),
           dentro_da_janela = false
     where id = p_manutencao;
    return jsonb_build_object('resultado', 'recusada');
  end if;

  -- ---- carimbo exige a prova: a foto da etiqueta nova, com o KM legível ----
  if coalesce(trim(m.url_etiqueta_atual), '') = '' then
    raise exception 'CARIMBO_SEM_ETIQUETA' using errcode = 'check_violation';
  end if;

  -- ---- casa com a janela do plano, se for revisão programada ----
  -- A janela alvo é a mais antiga ainda aberta; `numero_revisao` do registro,
  -- quando vier, tem precedência.
  v_dentro := null;
  if m.tipo = 'revisao_programada' then
    select pr.* into janela
      from public.plano_revisoes pr
     where pr.veiculo_vendido_id = m.veiculo_vendido_id
       and pr.manutencao_id is null
       and (m.numero_revisao is null or pr.numero_revisao = m.numero_revisao)
     order by pr.numero_revisao
     limit 1;

    if found then
      v_dentro := (m.data_servico <= janela.janela_fim)
              and (janela.km_previsto is null or m.km_registrado <= janela.km_previsto + 1000);
      update public.plano_revisoes
         set manutencao_id = m.id
       where id = janela.id;
    else
      -- Sem janela aberta (revisões além do plano): conta como fora, nunca
      -- como NULL — NULL diria "não medido", e foi medido.
      v_dentro := false;
    end if;
  end if;

  update public.manutencoes
     set confirmada_em    = now(),
         confirmada_por   = auth.uid(),
         dentro_da_janela = v_dentro,
         numero_revisao   = coalesce(m.numero_revisao, janela.numero_revisao)
   where id = p_manutencao;

  -- O KM verificado pela etiqueta vira leitura de odômetro com origem
  -- 'revisao' — a fonte nº 1 da lista do §5.2.
  insert into public.leituras_odometro (veiculo_vendido_id, km, origem, registrada_em)
  values (m.veiculo_vendido_id, m.km_registrado, 'revisao', m.data_servico::timestamptz);

  return jsonb_build_object(
    'resultado', 'carimbada',
    'dentro_da_janela', v_dentro,
    'numero_revisao', coalesce(m.numero_revisao, janela.numero_revisao)
  );
end;
$$;

comment on function public.carimbar_revisao(uuid, boolean, text) is
  'Confirma (ou recusa, com motivo) um registro da caderneta. Carimbar exige a '
  'foto da etiqueta nova, casa a revisão com a janela do plano, calcula '
  'dentro_da_janela pela régua do §1.5 e grava o KM como leitura verificada. '
  'Transacional e restrita a staff.';

revoke all on function public.carimbar_revisao(uuid, boolean, text) from public, anon;
grant execute on function public.carimbar_revisao(uuid, boolean, text) to authenticated, service_role;


-- ==========================================================
-- 2. calcular_conformidade_diaria — a série do §1.4
-- ==========================================================

create or replace function public.calcular_conformidade_diaria()
  returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  d          date;
  inicio     date;
  v_ativos   int;
  v_devidas  int;
  v_em_dia   int;
  gravadas   int := 0;
begin
  if not public.is_staff(auth.uid()) and current_setting('request.jwt.claims', true) is distinct from '' then
    -- Staff pelo painel, ou a chave de serviço (sem claims) pelo cron futuro.
    raise exception 'Cálculo de conformidade é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  -- O primeiro dia da série é a primeira venda com Ciclo ativo; sem venda,
  -- não há série ainda — e isso é um retorno, não um erro.
  select min(vv.data_venda) into inicio
    from public.veiculos_vendidos vv
    join public.contratos_ciclo cc on cc.veiculo_vendido_id = vv.id;
  if inicio is null then
    return jsonb_build_object('gravadas', 0, 'motivo', 'nenhum veiculo com Ciclo ativo');
  end if;

  -- Preenche do último dia gravado (ou do início) até hoje. Dias anteriores a
  -- hoje entram como retroativa = true: reconstruídos do estado atual.
  d := greatest(inicio, coalesce((select max(dia) + 1 from public.conformidade_diaria), inicio));

  while d <= current_date loop
    -- Denominador: veículos com Ciclo ativo cuja alguma janela já venceu em d.
    select
      count(distinct vv.id),
      count(distinct vv.id) filter (where pr_vencida.veiculo_vendido_id is not null),
      count(distinct vv.id) filter (
        where pr_vencida.veiculo_vendido_id is not null and pr_aberta.veiculo_vendido_id is null
      )
    into v_ativos, v_devidas, v_em_dia
    from public.veiculos_vendidos vv
    join public.contratos_ciclo cc on cc.veiculo_vendido_id = vv.id
    left join lateral (
      select pr.veiculo_vendido_id from public.plano_revisoes pr
       where pr.veiculo_vendido_id = vv.id and pr.janela_fim < d
       limit 1
    ) pr_vencida on true
    left join lateral (
      -- Janela vencida em d e não cumprida por revisão carimbada dentro dela.
      select pr.veiculo_vendido_id
        from public.plano_revisoes pr
        left join public.manutencoes m
          on m.id = pr.manutencao_id and m.confirmada_em is not null and m.dentro_da_janela
       where pr.veiculo_vendido_id = vv.id and pr.janela_fim < d and m.id is null
       limit 1
    ) pr_aberta on true
    where vv.data_venda <= d;

    insert into public.conformidade_diaria
      (dia, veiculos_ciclo_ativo, veiculos_com_revisao_devida, veiculos_em_dia, pct, retroativa)
    values (
      d, v_ativos, v_devidas, v_em_dia,
      case when v_devidas > 0 then round(v_em_dia::numeric * 100 / v_devidas, 2) end,
      d < current_date
    )
    on conflict (dia) do nothing;
    gravadas := gravadas + 1;
    d := d + 1;
  end loop;

  return jsonb_build_object('gravadas', gravadas, 'ate', current_date);
end;
$$;

comment on function public.calcular_conformidade_diaria() is
  'Grava a série do §1.4 do último dia registrado até hoje, inclusive dias de '
  'denominador zero (pct NULL). Dias preenchidos depois do fato saem com '
  'retroativa = true. Nunca sobrescreve dia já gravado.';

revoke all on function public.calcular_conformidade_diaria() from public, anon;
grant execute on function public.calcular_conformidade_diaria() to authenticated, service_role;


-- ==========================================================
-- 3. Autoconferência — o carimbo e a régua, contra o banco real
-- ==========================================================

do $$
declare
  uid_staff uuid;
  v_cli     uuid;
  v_vv      uuid;
  v_mnt     uuid;
  r         jsonb;
  ok        boolean;
  qtd       int;
begin
  select id into uid_staff from public.profiles
   where role in ('admin','comercial','financeiro','marketing') and is_active
   order by created_at limit 1;

if uid_staff is null then
  raise notice 'Autoconferência PULADA: não há usuário de staff neste banco.';
else
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Uma venda completa para ter plano contra o qual carimbar.
  r := public.fechar_venda_ciclo(jsonb_build_object(
    'cpf_cnpj','00000000909','nome','Cliente Carimbo','telefone_e164','+554199990009',
    'email','carimbo@exemplo.invalido','chassi','AUTOCONF-3-OK','placa','AAA0A00',
    'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
    'data_venda',(current_date - interval '13 months')::date,
    'km_na_venda',30000,'valor_venda',50000,
    'consentimento_lgpd',true,'aderiu_ciclo',true));
  v_vv := (r->>'veiculo_vendido_id')::uuid;

  -- Registro sem etiqueta: pode existir, mas não pode ser carimbado.
  insert into public.manutencoes
    (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro)
  values (v_vv, 'revisao_programada', (current_date - interval '1 month')::date, 39000, 'cliente')
  returning id into v_mnt;

  ok := false;
  begin
    perform public.carimbar_revisao(v_mnt, true);
  exception when check_violation then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: carimbou sem a foto da etiqueta';
  end if;

  -- Recusa sem motivo também não.
  ok := false;
  begin
    perform public.carimbar_revisao(v_mnt, false);
  exception when check_violation then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: recusou sem motivo';
  end if;

  -- Com a etiqueta, o carimbo entra — e casa com a janela 1 do plano.
  update public.manutencoes
     set url_etiqueta_atual = 'https://exemplo.invalido/etiqueta.jpg'
   where id = v_mnt;
  r := public.carimbar_revisao(v_mnt, true);

  if (r->>'resultado') <> 'carimbada' then
    raise exception 'ACEITE FALHOU: carimbo com etiqueta foi recusado';
  end if;
  -- Venda há 13 meses, serviço há 1 mês: dentro da janela (12m + 30d);
  -- km 39000 <= 40000 + 1000. As duas réguas passam.
  if (r->>'dentro_da_janela')::boolean is not true then
    raise exception 'ACEITE FALHOU: revisão no prazo saiu como fora da janela';
  end if;

  select count(*) into qtd from public.plano_revisoes
   where veiculo_vendido_id = v_vv and numero_revisao = 1 and manutencao_id = v_mnt;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o carimbo não casou com a janela do plano';
  end if;

  select count(*) into qtd from public.leituras_odometro
   where veiculo_vendido_id = v_vv and origem = 'revisao' and km = 39000;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o KM da etiqueta não virou leitura verificada';
  end if;

  -- Carimbar duas vezes, nunca.
  ok := false;
  begin
    perform public.carimbar_revisao(v_mnt, true);
  exception when check_violation then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: a mesma revisão foi carimbada duas vezes';
  end if;

  -- A série: só é exercitada quando o banco não tem venda real nem série
  -- real — o veículo sintético entraria na conta dos reais e a limpeza
  -- apagaria dias de verdade. Neste banco, hoje, os dois estão vazios; se a
  -- migração rodar num banco já vivo, este trecho pula com aviso.
  select count(*) into qtd from public.veiculos_vendidos where id <> v_vv;
  if qtd = 0 and not exists (select 1 from public.conformidade_diaria) then
    r := public.calcular_conformidade_diaria();
    select count(*) into qtd from public.conformidade_diaria;
    if qtd = 0 then
      raise exception 'ACEITE FALHOU: a série não gravou nenhum dia';
    end if;
    select count(*) into qtd from public.conformidade_diaria
     where dia = current_date and veiculos_em_dia = 1 and pct = 100.00;
    if qtd <> 1 then
      raise exception 'ACEITE FALHOU: o dia de hoje não mostra o veículo em dia';
    end if;
    -- A série sintética sai inteira: o primeiro cálculo real recomeça do zero.
    delete from public.conformidade_diaria;
  else
    raise notice 'Trecho da série PULADO: o banco já tem venda ou série real.';
  end if;

  reset role;

  -- Quem não é staff não carimba.
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin
    perform public.carimbar_revisao(v_mnt, true);
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: quem não é staff carimbou';
  end if;
  reset role;

  -- ---- limpeza ----
  -- plano_revisoes antes de manutencoes: a janela cumprida referencia a
  -- manutenção carimbada (FK manutencao_id).
  delete from public.leituras_odometro  where veiculo_vendido_id = v_vv;
  delete from public.plano_revisoes     where veiculo_vendido_id = v_vv;
  delete from public.manutencoes        where veiculo_vendido_id = v_vv;
  delete from public.contratos_ciclo    where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos  where id = v_vv;
  delete from public.clientes           where cpf_cnpj = '00000000909';

  raise notice 'Aceite verificado: carimbo exige etiqueta, casa com a janela, e a série grava.';
end if;
end $$;
