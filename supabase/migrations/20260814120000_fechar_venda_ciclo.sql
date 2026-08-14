-- ==========================================================
-- Pacote 2 — fechamento da venda (tela A19), manual v1.1 §3
-- ==========================================================
--
-- O §0 do manual: "nenhuma venda é dada como concluída sem o registro completo
-- do par cliente-veículo. Um campo não preenchido hoje é um gatilho perdido em
-- 2029." O §3.2 manda que a validação seja bloqueante, não aviso.
--
-- Por que isso vira função de banco, e não seis inserts na rota:
--
-- Fechar uma venda escreve em até seis tabelas — cliente, veículo vendido,
-- leitura de odômetro, plano de revisões, financiamento e contrato. Pelo
-- cliente JS não há transação: se a quarta escrita falha, as três primeiras
-- ficam. O resultado seria exatamente o que o manual proíbe — uma venda
-- registrada pela metade, que ninguém vê como incompleta porque o cliente e o
-- veículo estão lá.
--
-- Aqui é tudo ou nada. E a validação mora junto: mesmo que alguém chame o
-- PostgREST direto, sem passar pela rota nem pelo formulário, o registro
-- incompleto não entra.
--
-- SECURITY INVOKER (o padrão): a função roda com o papel de quem chamou, então
-- a RLS do Pacote 1 continua valendo. A guarda de `is_staff` no topo é para dar
-- erro claro em vez de "violates row-level security policy".
-- ==========================================================

create or replace function public.fechar_venda_ciclo(dados jsonb)
  returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  faltando   text[] := '{}';
  v_cliente  uuid;
  v_veiculo  uuid;
  v_data     date;
  v_km       int;
  v_fin      jsonb := dados->'financiamento';
  tem_fin    boolean := false;
begin
  -- ---- quem pode ----
  if not public.is_staff(auth.uid()) then
    raise exception 'Fechamento de venda é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  -- ---- os campos que o §3.1 chama de "venda não fecha sem" ----
  --
  -- `array_append`, e não o operador `||`: com um literal sem tipo à direita,
  -- o Postgres resolve `anyarray || anyarray` e tenta ler 'cpf_cnpj' como
  -- array, falhando com "malformed array literal".
  if coalesce(trim(dados->>'cpf_cnpj'), '')      = '' then faltando := array_append(faltando, 'cpf_cnpj');      end if;
  if coalesce(trim(dados->>'nome'), '')          = '' then faltando := array_append(faltando, 'nome');          end if;
  if coalesce(trim(dados->>'telefone_e164'), '') = '' then faltando := array_append(faltando, 'telefone_e164'); end if;
  -- v1.1: o e-mail entrou porque é por ele que o cliente recebe o link da
  -- Caderneta — e a caderneta é a fonte do dado de conformidade do §1.4.
  if coalesce(trim(dados->>'email'), '')         = '' then faltando := array_append(faltando, 'email');         end if;
  if coalesce(trim(dados->>'chassi'), '')        = '' then faltando := array_append(faltando, 'chassi');        end if;
  if coalesce(trim(dados->>'placa'), '')         = '' then faltando := array_append(faltando, 'placa');         end if;
  if coalesce(trim(dados->>'marca'), '')         = '' then faltando := array_append(faltando, 'marca');         end if;
  if coalesce(trim(dados->>'modelo'), '')        = '' then faltando := array_append(faltando, 'modelo');        end if;
  if dados->>'ano_fabricacao' is null                 then faltando := array_append(faltando, 'ano_fabricacao'); end if;
  if dados->>'ano_modelo'     is null                 then faltando := array_append(faltando, 'ano_modelo');     end if;
  if dados->>'data_venda'     is null                 then faltando := array_append(faltando, 'data_venda');     end if;
  if dados->>'km_na_venda'    is null                 then faltando := array_append(faltando, 'km_na_venda');    end if;
  if dados->>'valor_venda'    is null                 then faltando := array_append(faltando, 'valor_venda');    end if;
  -- Consentimento não se "preenche": ou foi dado no ato, ou não foi.
  if coalesce((dados->>'consentimento_lgpd')::boolean, false) is not true then
    faltando := array_append(faltando, 'consentimento_lgpd');
  end if;

  -- ---- financiamento: nenhum ou todos ----
  if v_fin is not null and v_fin <> 'null'::jsonb then
    tem_fin := (
      coalesce(trim(v_fin->>'instituicao'), '') <> '' or
      v_fin->>'valor_financiado' is not null or
      v_fin->>'taxa_mensal' is not null or
      v_fin->>'prazo_meses' is not null or
      v_fin->>'valor_parcela' is not null or
      v_fin->>'data_primeira_parcela' is not null
    );
  end if;

  if tem_fin then
    if coalesce(trim(v_fin->>'instituicao'), '') = '' then faltando := array_append(faltando, 'instituicao'); end if;
    if v_fin->>'valor_financiado'      is null then faltando := array_append(faltando, 'valor_financiado');      end if;
    -- "o campo que mais será omitido e o mais valioso" (§3.1): sem ele não há
    -- saldo devedor (§5.1) nem equity mining (§5.4).
    if v_fin->>'taxa_mensal'           is null then faltando := array_append(faltando, 'taxa_mensal');           end if;
    if v_fin->>'prazo_meses'           is null then faltando := array_append(faltando, 'prazo_meses');           end if;
    if v_fin->>'valor_parcela'         is null then faltando := array_append(faltando, 'valor_parcela');         end if;
    if v_fin->>'data_primeira_parcela' is null then faltando := array_append(faltando, 'data_primeira_parcela'); end if;
  end if;

  if array_length(faltando, 1) > 0 then
    raise exception 'VENDA_INCOMPLETA: %', array_to_string(faltando, ',')
      using errcode = 'check_violation';
  end if;

  v_data := (dados->>'data_venda')::date;
  v_km   := (dados->>'km_na_venda')::int;

  if v_km < 0 then
    raise exception 'VENDA_INVALIDA: km_na_venda' using errcode = 'check_violation';
  end if;
  if (dados->>'valor_venda')::numeric <= 0 then
    raise exception 'VENDA_INVALIDA: valor_venda' using errcode = 'check_violation';
  end if;

  -- ---- o cliente: pode já existir (segundo carro) ----
  insert into public.clientes
    (cpf_cnpj, nome, telefone_e164, email, consentimento_lgpd_em,
     consentimento_canais, origem_primeiro_contato)
  values (
    trim(dados->>'cpf_cnpj'),
    trim(dados->>'nome'),
    trim(dados->>'telefone_e164'),
    trim(dados->>'email'),
    now(),
    coalesce(dados->'consentimento_canais',
             '{"whatsapp":false,"email":false,"sms":false}'::jsonb),
    coalesce(dados->>'origem_primeiro_contato', 'venda')
  )
  on conflict (cpf_cnpj) do update set
    nome                  = excluded.nome,
    telefone_e164         = excluded.telefone_e164,
    email                 = coalesce(excluded.email, public.clientes.email),
    consentimento_lgpd_em = coalesce(public.clientes.consentimento_lgpd_em, excluded.consentimento_lgpd_em),
    consentimento_canais  = excluded.consentimento_canais
  returning id into v_cliente;

  -- ---- o veículo ----
  begin
    insert into public.veiculos_vendidos
      (cliente_id, estoque_id, chassi, placa, marca, modelo, versao,
       ano_fabricacao, ano_modelo, data_venda, km_na_venda, valor_venda,
       custo_aquisicao, aderiu_ciclo, vendedor)
    values (
      v_cliente,
      nullif(dados->>'estoque_id', '')::int,
      upper(trim(dados->>'chassi')),
      upper(trim(dados->>'placa')),
      trim(dados->>'marca'),
      trim(dados->>'modelo'),
      nullif(trim(coalesce(dados->>'versao', '')), ''),
      (dados->>'ano_fabricacao')::int,
      (dados->>'ano_modelo')::int,
      v_data,
      v_km,
      (dados->>'valor_venda')::numeric,
      nullif(dados->>'custo_aquisicao', '')::numeric,
      coalesce((dados->>'aderiu_ciclo')::boolean, false),
      nullif(trim(coalesce(dados->>'vendedor', '')), '')
    )
    returning id into v_veiculo;
  exception when unique_violation then
    raise exception 'CHASSI_JA_REGISTRADO: %', upper(trim(dados->>'chassi'))
      using errcode = 'unique_violation';
  end;

  -- ---- a primeira notação de KM é o KM de saída na compra (v1.1 §5.2) ----
  insert into public.leituras_odometro (veiculo_vendido_id, km, origem, registrada_em)
  values (v_veiculo, v_km, 'venda', v_data::timestamptz);

  -- ---- o plano de revisões (§1.5): 10.000 km ou 12 meses, janela de 30 dias ----
  insert into public.plano_revisoes
    (veiculo_vendido_id, numero_revisao, km_previsto, janela_inicio, janela_fim)
  select
    v_veiculo,
    n,
    v_km + (n * 10000),
    (v_data + (n * interval '12 months') - interval '30 days')::date,
    (v_data + (n * interval '12 months') + interval '30 days')::date
  from generate_series(1, 3) as n;

  -- ---- financiamento ----
  if tem_fin then
    insert into public.contratos_financiamento
      (veiculo_vendido_id, instituicao, valor_financiado, valor_entrada,
       taxa_mensal, prazo_meses, valor_parcela, data_primeira_parcela)
    values (
      v_veiculo,
      trim(v_fin->>'instituicao'),
      (v_fin->>'valor_financiado')::numeric,
      nullif(v_fin->>'valor_entrada', '')::numeric,
      (v_fin->>'taxa_mensal')::numeric,
      (v_fin->>'prazo_meses')::int,
      (v_fin->>'valor_parcela')::numeric,
      (v_fin->>'data_primeira_parcela')::date
    );
  end if;

  -- ---- contrato do Ciclo ----
  -- Os campos `recompra_*` NÃO são preenchidos aqui, nem por parâmetro: o
  -- gatilho do §1.4 não abriu (regra 5 do CLAUDE.md). Contrato vendido hoje é
  -- Essencial ou Garantido, sem cláusula de recompra.
  if coalesce((dados->>'aderiu_ciclo')::boolean, false) then
    insert into public.contratos_ciclo
      (veiculo_vendido_id, plano, garantia_meses, garantia_fim, mensalidade)
    values (
      v_veiculo,
      coalesce(nullif(trim(coalesce(dados->>'plano', '')), ''), 'essencial'),
      coalesce(nullif(dados->>'garantia_meses', '')::int, 12),
      (v_data + (coalesce(nullif(dados->>'garantia_meses', '')::int, 12) || ' months')::interval)::date,
      nullif(dados->>'mensalidade', '')::numeric
    );
  end if;

  return jsonb_build_object(
    'cliente_id', v_cliente,
    'veiculo_vendido_id', v_veiculo,
    'revisoes_previstas', 3
  );
end;
$$;

comment on function public.fechar_venda_ciclo(jsonb) is
  'Fecha a venda em uma transação: cliente, veículo, KM de saída, plano de '
  'revisões e, quando houver, financiamento e contrato do Ciclo. Levanta '
  'VENDA_INCOMPLETA com a lista de campos quando falta qualquer obrigatório '
  'do manual §3.1. Restrita a staff.';

revoke all on function public.fechar_venda_ciclo(jsonb) from public, anon;
grant execute on function public.fechar_venda_ciclo(jsonb) to authenticated, service_role;


-- ==========================================================
-- Autoconferência — o aceite do Pacote 2
-- ==========================================================
--
-- "É impossível marcar uma venda como concluída com campo obrigatório vazio.
--  Confirme por teste, não por inspeção visual."
--
-- Roda como um usuário de staff sintético, tenta fechar vendas incompletas e
-- exige que TODAS falhem; depois fecha uma completa e confere o grafo inteiro.
-- Apaga tudo no fim.

do $$
declare
  uid_staff uuid;
  retorno   jsonb;
  v_vv      uuid;
  qtd       integer;
  ok        boolean;
begin
  -- `profiles.id` referencia `auth.users`, então não há como inventar um staff
  -- sintético aqui: a autoconferência empresta a identidade de um usuário de
  -- staff que já exista. Nada do que ela cria sobrevive ao bloco.
  select id into uid_staff
    from public.profiles
   where role in ('admin', 'comercial', 'financeiro', 'marketing')
     and is_active = true
   order by created_at
   limit 1;

if uid_staff is null then
  raise notice 'Autoconferência do Pacote 2 PULADA: não há usuário de staff neste banco.';
else

  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ---- 1. venda sem consentimento não fecha ----
  ok := false;
  begin
    perform public.fechar_venda_ciclo(jsonb_build_object(
      'cpf_cnpj','00000000191','nome','Teste','telefone_e164','+554199990000',
      'email','t@exemplo.invalido','chassi','AUTOCONF-2-A','placa','AAA0A00',
      'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
      'data_venda',current_date,'km_na_venda',1000,'valor_venda',50000
    ));
  exception when check_violation then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: venda sem consentimento LGPD foi aceita';
  end if;

  -- ---- 2. venda sem e-mail não fecha (v1.1) ----
  ok := false;
  begin
    perform public.fechar_venda_ciclo(jsonb_build_object(
      'cpf_cnpj','00000000191','nome','Teste','telefone_e164','+554199990000',
      'chassi','AUTOCONF-2-B','placa','AAA0A00',
      'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
      'data_venda',current_date,'km_na_venda',1000,'valor_venda',50000,
      'consentimento_lgpd',true
    ));
  exception when check_violation then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: venda sem e-mail foi aceita';
  end if;

  -- ---- 3. financiamento sem taxa_mensal não fecha ----
  ok := false;
  begin
    perform public.fechar_venda_ciclo(jsonb_build_object(
      'cpf_cnpj','00000000191','nome','Teste','telefone_e164','+554199990000',
      'email','t@exemplo.invalido','chassi','AUTOCONF-2-C','placa','AAA0A00',
      'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
      'data_venda',current_date,'km_na_venda',1000,'valor_venda',50000,
      'consentimento_lgpd',true,
      'financiamento', jsonb_build_object(
        'instituicao','Banco','valor_financiado',30000,
        'prazo_meses',48,'valor_parcela',900,'data_primeira_parcela',current_date)
    ));
  exception when check_violation then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: financiamento sem taxa_mensal foi aceito';
  end if;

  -- ---- 4. a venda completa fecha, e fecha inteira ----
  retorno := public.fechar_venda_ciclo(jsonb_build_object(
    'cpf_cnpj','00000000191','nome','Cliente Autoconferência',
    'telefone_e164','+554199990000','email','t@exemplo.invalido',
    'chassi','AUTOCONF-2-OK','placa','AAA0A00',
    'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
    'data_venda',current_date,'km_na_venda',30000,'valor_venda',50000,
    'consentimento_lgpd',true,'aderiu_ciclo',true,
    'financiamento', jsonb_build_object(
      'instituicao','Banco','valor_financiado',30000,'taxa_mensal',0.0175,
      'prazo_meses',48,'valor_parcela',900,'data_primeira_parcela',current_date)
  ));
  v_vv := (retorno->>'veiculo_vendido_id')::uuid;

  select count(*) into qtd from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 3 then
    raise exception 'ACEITE FALHOU: plano de revisões saiu com % linhas, esperava 3', qtd;
  end if;

  -- A primeira notação de KM é o KM de saída (v1.1 §5.2).
  select count(*) into qtd from public.leituras_odometro
   where veiculo_vendido_id = v_vv and origem = 'venda' and km = 30000;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: KM de saída não virou leitura de odômetro';
  end if;

  -- A primeira janela abre 30 dias antes de 12 meses.
  select count(*) into qtd from public.plano_revisoes
   where veiculo_vendido_id = v_vv and numero_revisao = 1
     and km_previsto = 40000
     and janela_inicio = (current_date + interval '12 months' - interval '30 days')::date
     and janela_fim    = (current_date + interval '12 months' + interval '30 days')::date;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: a janela da 1ª revisão não bate com o §1.5';
  end if;

  -- Regra 5: contrato nasce sem recompra.
  select count(*) into qtd from public.contratos_ciclo
   where veiculo_vendido_id = v_vv
     and recompra_habilitada = false and recompra_valor is null;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: contrato do Ciclo nasceu com recompra';
  end if;

  -- ---- 5. o mesmo chassi não entra duas vezes ----
  ok := false;
  begin
    perform public.fechar_venda_ciclo(jsonb_build_object(
      'cpf_cnpj','00000000272','nome','Outro','telefone_e164','+554199990001',
      'email','o@exemplo.invalido','chassi','AUTOCONF-2-OK','placa','BBB0B00',
      'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
      'data_venda',current_date,'km_na_venda',1000,'valor_venda',50000,
      'consentimento_lgpd',true
    ));
  exception when unique_violation then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: o mesmo chassi foi vendido duas vezes';
  end if;

  reset role;

  -- ---- 6. quem não é staff não fecha venda ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin
    perform public.fechar_venda_ciclo(jsonb_build_object(
      'cpf_cnpj','00000000353','nome','Cliente','telefone_e164','+554199990002',
      'email','c@exemplo.invalido','chassi','AUTOCONF-2-D','placa','CCC0C00',
      'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
      'data_venda',current_date,'km_na_venda',1000,'valor_venda',50000,
      'consentimento_lgpd',true
    ));
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: quem não é staff fechou uma venda';
  end if;
  reset role;

  -- ---- limpeza ----
  delete from public.contratos_financiamento where veiculo_vendido_id = v_vv;
  delete from public.contratos_ciclo         where veiculo_vendido_id = v_vv;
  delete from public.plano_revisoes          where veiculo_vendido_id = v_vv;
  delete from public.leituras_odometro       where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos       where id = v_vv;
  delete from public.clientes                where cpf_cnpj in ('00000000191','00000000272','00000000353');

  raise notice 'Aceite do Pacote 2 verificado: venda incompleta não fecha, completa fecha inteira.';

end if;
end $$;
