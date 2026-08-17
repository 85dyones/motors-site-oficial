-- ==========================================================
-- O que o feed já mandava e a gente jogava fora — e o CEP do cliente
-- ==========================================================
--
-- O XML da RevendaMais traz, em todo anúncio, três campos que o
-- sincronizador não lia: `PLATE` (42/42 preenchidos), `CHASSI` (40/42) e
-- `VALOR_FIPE` (42/42). Medido no feed real em 2026-08-17.
--
-- Consequência prática: no fechamento de venda (tela A19) o vendedor digitava
-- à mão chassi e placa — os dois campos mais chatos e mais fáceis de errar do
-- formulário — enquanto os valores certos chegavam de graça a cada 6 horas e
-- eram descartados no nó de mapeamento do n8n.
--
-- ⚠️ `chassi` e `placa` são **documentação do veículo, uso interno**. Não
-- entram no mapper público: `mapVeiculoDbToVeiculo` monta o objeto campo a
-- campo, sem espalhar a linha, e `placa` só sai com `incluirPlaca` explícito
-- em contexto autenticado. Quem mexer aqui tem que manter isso verdadeiro.
-- ==========================================================

alter table public.estoque_motors
  add column if not exists chassi      text,
  add column if not exists valor_fipe  numeric(12,2),
  add column if not exists codigo_fipe text;

comment on column public.estoque_motors.chassi is
  'Chassi vindo do feed da RevendaMais (tag CHASSI). Documentação interna: '
  'nunca no mapper público. Alimenta o fechamento de venda da A19.';

comment on column public.estoque_motors.valor_fipe is
  'VALOR_FIPE do feed. Referência de mercado do veículo em estoque — não '
  'confundir com a FIPE do carro de troca, que é outra consulta.';

comment on column public.estoque_motors.codigo_fipe is
  'Código FIPE do feed (tag FIPE), quando a RevendaMais o informa.';


-- ==========================================================
-- fechar_venda_ciclo passa a aceitar o CEP do cliente
-- ==========================================================
--
-- `clientes.cep` existe desde a fundação (é campo do §2.1) e nunca teve quem
-- o preenchesse: a função não lia a chave. Com a consulta de CEP no
-- formulário, o vendedor digita 8 dígitos, confere o endereço na tela — e o
-- dado chega ao banco.
--
-- **Só o CEP.** Logradouro, bairro e cidade NÃO são gravados: são dado pessoal
-- que o §2.1 não prevê, e ampliar o que se guarda sobre o cliente é decisão do
-- dono, não efeito colateral de uma facilidade de digitação. A consulta serve
-- para conferir, não para colecionar.
--
-- ⚠️ Esta função é **a original de `20260814120000`, com três linhas a mais**
-- — gerada por substituição sobre o arquivo dela, não redigitada. A primeira
-- tentativa foi reescrever de cabeça, e o diff mostrou o preço: a detecção de
-- financiamento afrouxou, os campos de erro viraram `financiamento.instituicao`
-- (que a tela não destaca) e a validação mudou de ordem. Se um dia precisar
-- mexer aqui de novo, parta do arquivo, não da memória.

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
    (cpf_cnpj, nome, telefone_e164, email, cep, consentimento_lgpd_em,
     consentimento_canais, origem_primeiro_contato)
  values (
    trim(dados->>'cpf_cnpj'),
    trim(dados->>'nome'),
    trim(dados->>'telefone_e164'),
    trim(dados->>'email'),
    -- CEP entrou em 2026-08-17, junto com a consulta automática do formulário.
    -- Só dígitos, e string vazia vira NULL para não gravar '' no lugar de nada.
    nullif(regexp_replace(coalesce(dados->>'cep', ''), '\D', '', 'g'), ''),
    now(),
    coalesce(dados->'consentimento_canais',
             '{"whatsapp":false,"email":false,"sms":false}'::jsonb),
    coalesce(dados->>'origem_primeiro_contato', 'venda')
  )
  on conflict (cpf_cnpj) do update set
    nome                  = excluded.nome,
    telefone_e164         = excluded.telefone_e164,
    email                 = coalesce(excluded.email, public.clientes.email),
    cep                   = coalesce(excluded.cep, public.clientes.cep),
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

revoke all on function public.fechar_venda_ciclo(jsonb) from public, anon;
grant execute on function public.fechar_venda_ciclo(jsonb) to authenticated, service_role;


-- ==========================================================
-- Autoconferência
-- ==========================================================

do $ac$
declare
  uid_staff uuid;
  r         jsonb;
  v_cep     text;
  qtd       int;
  v_cli     uuid;
  ok        boolean;
begin
  select count(*) into qtd from information_schema.columns
   where table_schema = 'public' and table_name = 'estoque_motors'
     and column_name in ('chassi', 'valor_fipe', 'codigo_fipe');
  if qtd <> 3 then
    raise exception 'ACEITE FALHOU: faltam colunas no estoque (achei %)', qtd;
  end if;

  select id into uid_staff from public.profiles
   where role in ('admin','comercial','financeiro','marketing') and is_active
   order by created_at limit 1;

  if uid_staff is null then
    raise notice 'Autoconferência PULADA: não há usuário de staff neste banco.';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- CEP com máscara entra só com dígitos.
    r := public.fechar_venda_ciclo(jsonb_build_object(
      'cpf_cnpj','00000000707','nome','Cliente CEP','telefone_e164','+554199990007',
      'email','cep@exemplo.invalido','chassi','AUTOCONF-CEP-1','placa','CEP0A00',
      'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
      'data_venda',current_date,'km_na_venda',10000,'valor_venda',50000,
      'cep','80010-010',
      'consentimento_lgpd',true));
    v_cli := (r->>'cliente_id')::uuid;

    -- Segunda venda do MESMO cliente, sem CEP: não pode apagar o anterior.
    perform public.fechar_venda_ciclo(jsonb_build_object(
      'cpf_cnpj','00000000707','nome','Cliente CEP','telefone_e164','+554199990007',
      'email','cep@exemplo.invalido','chassi','AUTOCONF-CEP-2','placa','CEP0A01',
      'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
      'data_venda',current_date,'km_na_venda',10000,'valor_venda',50000,
      'consentimento_lgpd',true));

    -- A régua do financiamento não pode ter afrouxado: valor sem instituição
    -- continua sendo venda incompleta.
    ok := false;
    begin
      perform public.fechar_venda_ciclo(jsonb_build_object(
        'cpf_cnpj','00000000708','nome','Cliente Fin','telefone_e164','+554199990008',
        'email','fin@exemplo.invalido','chassi','AUTOCONF-CEP-3','placa','CEP0A02',
        'marca','M','modelo','X','ano_fabricacao',2020,'ano_modelo',2021,
        'data_venda',current_date,'km_na_venda',10000,'valor_venda',50000,
        'consentimento_lgpd',true,
        'financiamento', jsonb_build_object('valor_financiado', 30000)));
    exception when check_violation then ok := true;
    end;
    if not ok then
      raise exception 'ACEITE FALHOU: financiamento pela metade passou';
    end if;

    set local role none;

    select cep into v_cep from public.clientes where id = v_cli;
    if v_cep <> '80010010' then
      raise exception 'ACEITE FALHOU: o CEP gravou como "%" (esperava só dígitos)', v_cep;
    end if;

    delete from public.plano_revisoes    where veiculo_vendido_id in
      (select id from public.veiculos_vendidos where cliente_id = v_cli);
    delete from public.leituras_odometro where veiculo_vendido_id in
      (select id from public.veiculos_vendidos where cliente_id = v_cli);
    delete from public.veiculos_vendidos where cliente_id = v_cli;
    delete from public.clientes          where id = v_cli;

    raise notice 'Autoconferência do CEP e das colunas do estoque: OK.';
  end if;
end $ac$;
