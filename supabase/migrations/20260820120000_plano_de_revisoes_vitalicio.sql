-- ==========================================================
-- O plano de revisões deixa de secar na terceira (D2)
-- ==========================================================
--
-- `fechar_venda_ciclo` gravava `generate_series(1, 3)`: exatamente três
-- revisões, 30.000 km ou três anos. O dono confirmou em 2026-08-20 que a
-- Garagem Motors é vitalícia por força de expressão, **até a próxima venda do
-- carro**. Da quarta revisão em diante o plano ficava sem linha — e sem linha:
--
--   * `carimbar_revisao` marcava a revisão CERTA como `dentro_da_janela =
--     false`, punindo o cliente pela ausência de uma linha que o sistema
--     deveria ter criado;
--   * `montar_fila_de_gatilhos` perdia `revisao_programada` e
--     `elegibilidade_em_risco`, porque monta as janelas por INNER JOIN;
--   * a conformidade do §5.7 passava a contar o veículo como "em dia" para
--     sempre, inflando o indicador que guarda o gatilho do §1.4.
--
-- A correção não é uma série maior — seria inventar número, e continuaria
-- finita. É geração sob demanda: uma janela por vez, ancorada no último fato
-- real. É também a reprojeção que o §1.5 promete ("reprojetado a cada revisão
-- confirmada") e que nunca foi escrita.
--
-- Desenho: docs/superpowers/specs/2026-08-20-plano-de-revisoes-vitalicio-design.md
-- ==========================================================


-- ---------------------------------------------------------------------------
-- 1. O fim do vitalício: "até a próxima venda do carro"
-- ---------------------------------------------------------------------------
-- Sem isto, um plano que se regenera para sempre continua lembrando de revisão
-- quem já vendeu o carro. `contratos_ciclo.status_elegibilidade = 'perdida'`
-- NÃO serve: é elegibilidade de recompra, não o carro deixar de ser do cliente.
--
-- Sem lista fechada de motivos, de propósito: fixá-la agora seria inventar o
-- vocabulário do negócio antes de a loja ter visto um caso.

alter table public.veiculos_vendidos
  add column if not exists saiu_em      date,
  add column if not exists motivo_saida text;

comment on column public.veiculos_vendidos.saiu_em is
  'Data em que o carro deixou de ser do cliente. Preenchida, desliga o gerador '
  'de janelas, os quatro gatilhos e a escrita do cliente no diário de bordo — '
  'a LEITURA do histórico continua, porque o dado é dele.';

comment on column public.veiculos_vendidos.motivo_saida is
  'Texto livre, obrigatório quando há saiu_em. Sem lista fechada enquanto a '
  'loja não tiver visto os casos reais.';

alter table public.veiculos_vendidos
  drop constraint if exists veiculos_vendidos_saida_com_motivo;
alter table public.veiculos_vendidos
  add constraint veiculos_vendidos_saida_com_motivo
  check (saiu_em is null or coalesce(trim(motivo_saida), '') <> '');


-- ---------------------------------------------------------------------------
-- 2. O gerador — a única função que conhece a régua do §1.5
-- ---------------------------------------------------------------------------
-- Quando o plano por modelo existir (o dono mandou levantar as recomendações
-- de fabricante sob demanda, 2026-08-20), muda o CORPO desta função e mais
-- nada: nem o fechamento da venda, nem o carimbo, nem o cron precisam saber.

create or replace function public.abrir_proxima_janela(p_vv uuid)
  returns uuid
  language plpgsql
  set search_path = public
as $$
declare
  v          record;
  marco      record;
  v_data     date;
  v_km       int;
  v_numero   int;
  v_prevista date;
  v_id       uuid;
begin
  select saiu_em, data_venda, km_na_venda into v
    from public.veiculos_vendidos where id = p_vv;
  if not found or v.saiu_em is not null then
    return null;
  end if;

  -- Um veículo tem no máximo UMA janela aberta. Janela vencida e não cumprida
  -- CONTINUA sendo a janela aberta: não se abre a próxima por cima da anterior,
  -- ou quem atrasou ganharia prazo novo de graça.
  if exists (
        select 1 from public.plano_revisoes
         where veiculo_vendido_id = p_vv and manutencao_id is null) then
    return null;
  end if;

  -- O marco é o último fato real. A venda é o piso; a última revisão
  -- confirmada substitui, se houver.
  --
  -- ⚠️ `select ... into` sem linha ZERA o alvo. Por isso a leitura do marco vai
  -- para um record separado e só sobrescreve dentro do `if found` — atribuir
  -- direto perderia a venda em todo veículo sem revisão confirmada.
  v_data := v.data_venda;
  v_km   := v.km_na_venda;

  -- "Confirmada" é `confirmada_em is not null`, e só. Recusada nunca vira
  -- marco. Confirmada FORA da janela vira: ela aconteceu, e o KM que a prova
  -- atestou é o ponto real mais recente. `dentro_da_janela` mede conformidade,
  -- não existência — usá-la aqui puniria o atraso duas vezes.
  select m.data_servico, m.km_registrado into marco
    from public.manutencoes m
   where m.veiculo_vendido_id = p_vv
     and m.tipo = 'revisao_programada'
     and m.confirmada_em is not null
   order by m.data_servico desc, m.km_registrado desc
   limit 1;
  if found then
    v_data := marco.data_servico;
    v_km   := marco.km_registrado;
  end if;

  select coalesce(max(numero_revisao), 0) + 1 into v_numero
    from public.plano_revisoes where veiculo_vendido_id = p_vv;

  -- §1.5: 10.000 km ou 12 meses, o que ocorrer primeiro, tolerância de 30 dias.
  v_prevista := (v_data + interval '12 months')::date;

  insert into public.plano_revisoes
    (veiculo_vendido_id, numero_revisao, km_previsto, janela_inicio, janela_fim)
  values (
    p_vv,
    v_numero,
    v_km + 10000,
    (v_prevista - interval '30 days')::date,
    (v_prevista + interval '30 days')::date
  )
  on conflict (veiculo_vendido_id, numero_revisao) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.abrir_proxima_janela(uuid) is
  'Abre a PRÓXIMA janela de revisão do veículo, se couber: não faz nada se ele '
  'saiu da Garagem ou já tem janela aberta. Ancora no último fato real — a '
  'última revisão programada confirmada, ou a venda. É a régua do §1.5 num '
  'lugar só, e é o ponto de extensão do plano por modelo.';

-- Direitos de INVOCADOR, de propósito: a RLS de `plano_revisoes` já barra quem
-- não é staff, e o cron roda como dono da tabela. `authenticated` precisa do
-- execute porque `fechar_venda_ciclo` e `carimbar_revisao` são invoker-rights
-- e a chamada aninhada exige o privilégio de quem chamou.
revoke all on function public.abrir_proxima_janela(uuid) from public, anon;
grant execute on function public.abrir_proxima_janela(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Autoconferência 1 — o gerador
-- ---------------------------------------------------------------------------
do $ac$
declare
  v_cli uuid;
  v_vv  uuid;
  v_j   uuid;
  j     record;
begin
  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email)
  values ('AC-D2-GERADOR', 'Autoconferência D2', '+554199990002',
          'ac-d2-gerador@exemplo.invalido')
  returning id into v_cli;

  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda, aderiu_ciclo)
  values (v_cli, 'AUTOCONF-D2-GERADOR', 'ACD0A01', 'Volkswagen', 'Gol',
          2020, 2021, (current_date - interval '1 day')::date, 40000, 50000, true)
  returning id into v_vv;

  -- 1. a primeira janela nasce do marco da venda
  v_j := public.abrir_proxima_janela(v_vv);
  if v_j is null then
    raise exception 'ACEITE FALHOU: não abriu a primeira janela';
  end if;

  select * into j from public.plano_revisoes where id = v_j;
  if j.numero_revisao <> 1 then
    raise exception 'ACEITE FALHOU: a primeira janela saiu como nº %', j.numero_revisao;
  end if;
  if j.km_previsto <> 50000 then
    raise exception 'ACEITE FALHOU: km_previsto saiu % (esperado 40000 + 10000)', j.km_previsto;
  end if;
  if j.janela_fim - j.janela_inicio <> 60 then
    raise exception 'ACEITE FALHOU: a janela tem % dias (esperado 60)',
      j.janela_fim - j.janela_inicio;
  end if;

  -- 2. um veículo tem no máximo UMA janela aberta
  if public.abrir_proxima_janela(v_vv) is not null then
    raise exception 'ACEITE FALHOU: abriu segunda janela com a primeira em aberto';
  end if;

  -- 3. veículo que saiu da Garagem não ganha janela
  delete from public.plano_revisoes where veiculo_vendido_id = v_vv;
  update public.veiculos_vendidos
     set saiu_em = current_date, motivo_saida = 'revendido'
   where id = v_vv;
  if public.abrir_proxima_janela(v_vv) is not null then
    raise exception 'ACEITE FALHOU: veículo com saiu_em ganhou janela';
  end if;

  -- 4. saída sem motivo não passa. `begin/exception` porque plpgsql não tem
  --    SAVEPOINT; as variáveis do bloco sobrevivem ao rollback interno.
  begin
    update public.veiculos_vendidos
       set saiu_em = current_date, motivo_saida = null
     where id = v_vv;
    raise exception 'ACEITE FALHOU: aceitou saiu_em sem motivo';
  exception when check_violation then
    null;
  end;

  delete from public.plano_revisoes    where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos where id = v_vv;
  delete from public.clientes          where id = v_cli;

  raise notice 'Autoconferência D2/gerador: OK.';
end $ac$;
