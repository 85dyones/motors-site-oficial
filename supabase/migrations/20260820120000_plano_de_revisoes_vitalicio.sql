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
-- 0. O retrato do ANTES — a guarda contra reescrita que perde comportamento
-- ---------------------------------------------------------------------------
-- Guarda contra reescrita que perde comportamento.
-- `create or replace` de uma função viva é substituição total, e o repositório
-- já provou duas coisas: a definição viva pode não estar no arquivo homônimo, e
-- um grep em minúsculas não acha `CREATE OR REPLACE` maiúsculo vindo de
-- `pg_get_functiondef`. Esta tabela guarda o que existia ANTES; a conferência
-- no fim exige que nada tenha sumido.
create temp table _definicoes_antes on commit drop as
  select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('fechar_venda_ciclo','carimbar_revisao',
                       'montar_fila_de_gatilhos','calcular_conformidade_diaria');


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

  -- ---- a primeira janela de revisão (§1.5) ----
  -- UMA, não três. As seguintes nascem em `abrir_proxima_janela`, a cada
  -- revisão confirmada: a Garagem é vitalícia até a próxima venda do carro
  -- (dono, 2026-08-20), e série fixa secava no ano 3.
  perform public.abrir_proxima_janela(v_veiculo);

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
    'primeira_revisao', (select numero_revisao from public.plano_revisoes
                          where veiculo_vendido_id = v_veiculo
                          order by numero_revisao limit 1)
  );
end;
$$;

revoke all on function public.fechar_venda_ciclo(jsonb) from public, anon;
grant execute on function public.fechar_venda_ciclo(jsonb) to authenticated, service_role;


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
  if m.recusada_em is not null then
    raise exception 'REVISAO_JA_RECUSADA' using errcode = 'check_violation';
  end if;

  -- ---- recusa: fica no rastro, com o motivo, e fora da conformidade ----
  if not p_aceitar then
    if coalesce(trim(p_motivo), '') = '' then
      raise exception 'RECUSA_SEM_MOTIVO' using errcode = 'check_violation';
    end if;
    update public.manutencoes
       set observacoes = coalesce(observacoes || E'\n', '') ||
                         'RECUSADA em ' || to_char(now(), 'YYYY-MM-DD') || ': ' || trim(p_motivo),
           recusada_em      = now(),
           motivo_recusa    = trim(p_motivo),
           dentro_da_janela = false
     where id = p_manutencao;
    return jsonb_build_object('resultado', 'recusada');
  end if;

  -- ---- carimbo exige a prova: a foto da etiqueta nova, com o KM legível ----
  if coalesce(trim(m.url_etiqueta_atual), '') = '' then
    raise exception 'CARIMBO_SEM_ETIQUETA' using errcode = 'check_violation';
  end if;

  -- ---- casa com a janela do plano, se for revisão programada ----
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
      -- Sem janela não é "atrasou": é "não se aplica". `false` aqui acusava de
      -- fora da janela quem revisou certo num veículo cujo plano tinha secado
      -- — o defeito do D2. A conformidade do §5.7 já só conta `true`, então
      -- `null` não entra no numerador nem inventa atraso.
      v_dentro := null;
    end if;
  end if;

  update public.manutencoes
     set confirmada_em    = now(),
         confirmada_por   = auth.uid(),
         dentro_da_janela = v_dentro,
         numero_revisao   = coalesce(m.numero_revisao, janela.numero_revisao)
   where id = p_manutencao;

  insert into public.leituras_odometro (veiculo_vendido_id, km, origem, registrada_em)
  values (m.veiculo_vendido_id, m.km_registrado, 'revisao', m.data_servico::timestamptz);

  -- O 3º passo do gatilho 7 marca `em_risco` (§7.3), e a mensagem que o
  -- cliente recebe promete que tem volta. É aqui que ela volta: verificada a
  -- revisão, e não sobrando nenhuma outra janela vencida em aberto, o status
  -- retorna. Promessa sem este bloco seria promessa que o sistema não cumpre.
  update public.contratos_ciclo cc
     set status_elegibilidade = 'elegivel'
   where cc.veiculo_vendido_id = m.veiculo_vendido_id
     and cc.status_elegibilidade = 'em_risco'
     and not exists (
           select 1 from public.plano_revisoes pr
            where pr.veiculo_vendido_id = m.veiculo_vendido_id
              and pr.manutencao_id is null
              and pr.janela_fim < current_date);

  -- A próxima janela nasce aqui, e é a ÚLTIMA coisa que a função faz. Se
  -- nascesse antes do bloco de elegibilidade acima, uma revisão lançada com
  -- `data_servico` antigo produziria janela já vencida, que bloquearia a volta
  -- de `em_risco` para `elegivel` — a promessa que a mensagem do §7.3 faz ao
  -- cliente. Se a janela nova nascer vencida, quem cuida dela é o gatilho 7
  -- amanhã, que é onde ela pertence.
  perform public.abrir_proxima_janela(m.veiculo_vendido_id);

  return jsonb_build_object(
    'resultado', 'carimbada',
    'dentro_da_janela', v_dentro,
    'numero_revisao', coalesce(m.numero_revisao, janela.numero_revisao)
  );
end;
$$;

comment on function public.carimbar_revisao(uuid, boolean, text) is
  'Confirma (ou recusa, com motivo) um registro do diário de bordo. Carimbar '
  'exige a foto da etiqueta nova, casa a revisão com a janela do plano, '
  'calcula dentro_da_janela pela régua do §1.5 e grava o KM como leitura '
  'verificada. Recusa marca recusada_em/motivo_recusa e sai da fila. '
  'Transacional e restrita a staff.';

revoke all on function public.carimbar_revisao(uuid, boolean, text) from public, anon;
grant execute on function public.carimbar_revisao(uuid, boolean, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Os quatro gatilhos calam quando o carro sai da Garagem
-- ---------------------------------------------------------------------------
-- ⚠️ O bloco abaixo é a definição VIVA, copiada de
-- `20260818120000_falha_envio_nao_penaliza.sql` — que a extraiu do banco com
-- `pg_get_functiondef`, e por isso vem em MAIÚSCULAS. Não normalizar o caso:
-- a caixa é o rastro de que o texto saiu do banco e não foi redigitado.
--
-- Uma versão anterior desta migração copiou a definição de
-- `20260814180000_motor_de_gatilhos.sql`, que tem o nome da função no arquivo
-- mas NÃO é a definição viva: aplicá-la teria apagado o `pg_advisory_xact_lock`
-- (mensagem duplicada sob concorrência) e os dois guardas de `falha_envio` em
-- `boas_vindas` e `revisao_verificada` (cliente com envio falho nunca mais
-- receberia nenhuma das duas — regra 2, "a recusa nunca penaliza").
--
-- A ÚNICA alteração sobre a fonte é o `and vv.saiu_em is null` na CTE `veic`.

CREATE OR REPLACE FUNCTION public.montar_fila_de_gatilhos(p_agora timestamp with time zone DEFAULT now(), p_reservar boolean DEFAULT false, p_gatilhos text[] DEFAULT NULL::text[])
 RETURNS TABLE(evento_id uuid, veiculo_vendido_id uuid, cliente_id uuid, nome text, telefone_e164 text, email text, placa text, marca text, modelo text, ano_modelo integer, gatilho text, prioridade integer, passo integer, canal text, contexto jsonb, suprimido_por text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
-- Os nomes da tabela de retorno (veiculo_vendido_id, gatilho, canal…) são os
-- mesmos das colunas que a consulta lê. Sem esta diretiva, cada um deles vira
-- "column reference is ambiguous" — e o corpo não referencia variável de saída
-- em lugar nenhum, porque tudo sai por RETURN QUERY.
#variable_conflict use_column
declare
  v_local  timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_hoje   date      := (p_agora at time zone 'America/Sao_Paulo')::date;
  v_relogio text;
begin
  -- Uma montagem por vez. Sem isto, duas execuções sobrepostas (retry do n8n
  -- após timeout, execução manual durante o cron) avaliam os mesmos
  -- `not exists` no snapshot de cada transação e reservam o mesmo gatilho
  -- duas vezes. O lock é de transação: sai sozinho no commit ou no rollback,
  -- e só morde quando p_reservar = true, que é quando há escrita.
  if p_reservar then
    perform pg_advisory_xact_lock(hashtext('motor_de_gatilhos'));
  end if;

  -- §4.3: nenhum contato entre 20h e 8h, nem aos domingos. Vale para todo
  -- gatilho, sem isenção — inclusive os transacionais.
  if extract(dow from v_local) = 0 then
    v_relogio := 'domingo';
  elsif extract(hour from v_local) < 8 or extract(hour from v_local) >= 20 then
    v_relogio := 'fora_do_horario';
  end if;

  return query
  with veic as (
    select vv.id as vv_id, vv.cliente_id, c.nome, c.telefone_e164, c.email,
           coalesce(c.consentimento_canais, '{}'::jsonb) as canais,
           vv.placa, vv.marca, vv.modelo, vv.ano_modelo,
           vv.km_na_venda, vv.data_venda
      from public.veiculos_vendidos vv
      join public.clientes c on c.id = vv.cliente_id
     where vv.aderiu_ciclo
       -- Carro que saiu da Garagem não recebe mais nada. Aqui corta os quatro
       -- gatilhos de uma vez, em vez de repetir a condição em cada um.
       and vv.saiu_em is null
  ),

  -- ---- janelas de revisão ainda não cumpridas -------------------------
  -- `manutencao_id is null` = nenhuma revisão carimbada casou com esta
  -- janela. A data "prevista" é o meio da janela por construção
  -- (janela_inicio = prevista − tolerância, janela_fim = prevista + tolerância);
  -- lê-la do meio faz a cadência continuar certa se a tolerância mudar.
  janelas as (
    select v.*, pr.numero_revisao, pr.km_previsto, pr.janela_inicio, pr.janela_fim,
           (pr.janela_inicio + ((pr.janela_fim - pr.janela_inicio) / 2))::date as prevista
      from veic v
      join public.plano_revisoes pr on pr.veiculo_vendido_id = v.vv_id
     where pr.manutencao_id is null
  ),

  -- ---- gatilho: boas-vindas (transacional, uma vez por veículo) --------
  g_boas_vindas as (
    select v.vv_id, 'boas_vindas'::text as gatilho, 15 as prioridade, 1 as passo,
           jsonb_build_object(
             'data_venda',     v.data_venda,
             'km_na_venda',    v.km_na_venda,
             'plano',          cc.plano,
             'garantia_meses', cc.garantia_meses,
             'garantia_fim',   cc.garantia_fim,
             'primeira_revisao', (
               select jsonb_build_object(
                        'numero',        pr.numero_revisao,
                        'janela_inicio', pr.janela_inicio,
                        'janela_fim',    pr.janela_fim,
                        'km_previsto',   pr.km_previsto)
                 from public.plano_revisoes pr
                where pr.veiculo_vendido_id = v.vv_id
                order by pr.numero_revisao limit 1)
           ) as contexto
      from veic v
      join public.contratos_ciclo cc on cc.veiculo_vendido_id = v.vv_id
     where not exists (
             select 1 from public.eventos_ciclo e
              where e.veiculo_vendido_id = v.vv_id
                and e.gatilho = 'boas_vindas'
                -- 'falha_envio' quer dizer "não consegui entregar", e isso
                -- nunca pode ser lido como "já avisei" (regra 2).
                and coalesce(e.desfecho, '') <> 'falha_envio')
  ),

  -- ---- gatilho: revisão verificada (transacional, uma vez por revisão) --
  -- O carimbo é o ativo do programa (§5.7). O cliente precisa saber que o
  -- dele entrou — é o que transforma "fiz a revisão" em "tenho procedência".
  g_verificada as (
    select v.vv_id, 'revisao_verificada'::text, 25, 1,
           jsonb_build_object(
             'manutencao_id',    m.id,
             'numero_revisao',   m.numero_revisao,
             'data_servico',     m.data_servico,
             'km_registrado',    m.km_registrado,
             'dentro_da_janela', m.dentro_da_janela,
             'confirmada_em',    m.confirmada_em)
      from veic v
      join public.manutencoes m on m.veiculo_vendido_id = v.vv_id
     where m.confirmada_em is not null
       and m.tipo = 'revisao_programada'
       and not exists (
             select 1 from public.eventos_ciclo e
              where e.gatilho = 'revisao_verificada'
                and e.payload->>'manutencao_id' = m.id::text
                and coalesce(e.desfecho, '') <> 'falha_envio')
  ),

  -- ---- gatilho 1: revisão programada — cadência D−15 · D−3 · D+7 -------
  -- §7.3. O passo sai da contagem do que já foi disparado para ESTA revisão:
  -- três passos e encerra, sem estado extra para manter em lugar nenhum.
  revisao_base as (
    select j.*,
           (select count(*) from public.eventos_ciclo e
             where e.veiculo_vendido_id = j.vv_id
               and e.gatilho = 'revisao_programada'
               and coalesce(e.desfecho, '') <> 'falha_envio'
               and (e.payload->>'numero_revisao') = j.numero_revisao::text
           )::int + 1 as passo,
           (select (max(e.enviado_em) at time zone 'America/Sao_Paulo')::date
              from public.eventos_ciclo e
             where e.veiculo_vendido_id = j.vv_id
               and e.gatilho = 'revisao_programada'
               and coalesce(e.desfecho, '') <> 'falha_envio'
               and (e.payload->>'numero_revisao') = j.numero_revisao::text
           ) as ultimo_aviso,
           public.km_estimado(j.vv_id, v_hoje) as km_hoje
      from janelas j
     where j.janela_fim >= v_hoje
  ),
  g_revisao as (
    select r.vv_id, 'revisao_programada'::text, 60, r.passo,
           jsonb_build_object(
             'numero_revisao', r.numero_revisao,
             'janela_inicio',  r.janela_inicio,
             'janela_fim',     r.janela_fim,
             'prevista',       r.prevista,
             'km_previsto',    r.km_previsto,
             'km_estimado',    r.km_hoje,
             'dias_para_o_fim', r.janela_fim - v_hoje,
             'antecipado_por_km', (r.passo = 1 and r.km_previsto is not null
                                   and r.km_hoje is not null
                                   and r.km_hoje >= r.km_previsto - 800
                                   and v_hoje < r.prevista - 15))
      from revisao_base r
     where r.passo <= 3
       and (
             -- pela data: D−15, D−3, D+7 (§7.3)
             v_hoje >= (r.prevista - (case r.passo when 1 then 15 when 2 then 3 else -7 end))
             -- ou pelo odômetro, e só no primeiro aviso: "KM −800" (§4.2)
             or (r.passo = 1 and r.km_previsto is not null and r.km_hoje is not null
                 and r.km_hoje >= r.km_previsto - 800)
           )
       -- A cadência é uma sequência de INTERVALOS, não de datas soltas. Ver o
       -- comentário do gatilho 7 abaixo: sem isto, quem entra atrasado recebe
       -- os três avisos em três dias seguidos.
       and (r.passo = 1
            or v_hoje >= r.ultimo_aviso + (case r.passo when 2 then 12 else 10 end))
  ),

  -- ---- gatilho 7: elegibilidade em risco — imediato · D+7 · D+21 -------
  -- `janela_fim` já contém a tolerância do §1.5 (prevista + 30 dias). Passar
  -- dela É a "revisão atrasada > 30 dias" do §4.2. O terceiro passo marca
  -- `status_elegibilidade = em_risco`, como manda o §7.3.
  risco_base as (
    select j.*,
           (select count(*) from public.eventos_ciclo e
             where e.veiculo_vendido_id = j.vv_id
               and e.gatilho = 'elegibilidade_em_risco'
               and coalesce(e.desfecho, '') <> 'falha_envio'
               and (e.payload->>'numero_revisao') = j.numero_revisao::text
           )::int + 1 as passo,
           (select (max(e.enviado_em) at time zone 'America/Sao_Paulo')::date
              from public.eventos_ciclo e
             where e.veiculo_vendido_id = j.vv_id
               and e.gatilho = 'elegibilidade_em_risco'
               and coalesce(e.desfecho, '') <> 'falha_envio'
               and (e.payload->>'numero_revisao') = j.numero_revisao::text
           ) as ultimo_aviso
      from janelas j
     where j.janela_fim < v_hoje
  ),
  g_risco as (
    select r.vv_id, 'elegibilidade_em_risco'::text, 10, r.passo,
           jsonb_build_object(
             'numero_revisao', r.numero_revisao,
             'janela_inicio',  r.janela_inicio,
             'janela_fim',     r.janela_fim,
             'km_previsto',    r.km_previsto,
             'dias_de_atraso', v_hoje - r.janela_fim,
             'marca_em_risco', (r.passo = 3))
      from risco_base r
     where r.passo <= 3
       and v_hoje >= r.janela_fim + (case r.passo when 1 then 0 when 2 then 7 else 21 end)
       -- "Imediato · D+7 · D+21" é uma sequência de INTERVALOS, não três datas
       -- soltas. Um veículo que entra no motor já 35 dias atrasado tem os três
       -- marcos vencidos ao mesmo tempo — e sem esta linha receberia as três
       -- mensagens em três dias seguidos. Os intervalos são os do §7.3: 7 dias
       -- entre o 1º e o 2º, 14 entre o 2º e o 3º.
       and (r.passo = 1
            or v_hoje >= r.ultimo_aviso + (case r.passo when 2 then 7 else 14 end))
  ),

  unidos as (
    select * from g_boas_vindas
    union all select * from g_verificada
    union all select * from g_revisao
    union all select * from g_risco
  ),
  filtrados as (
    select * from unidos u
     where p_gatilhos is null or u.gatilho = any(p_gatilhos)
  ),

  -- ---- canal: opt-in por canal (§6.3 D). Sem consentimento, não sai. ----
  com_canal as (
    select f.*, v.cliente_id, v.nome, v.telefone_e164, v.email,
           v.placa, v.marca, v.modelo, v.ano_modelo,
           case
             when coalesce((v.canais->>'whatsapp')::boolean, false)
                  and coalesce(v.telefone_e164, '') <> '' then 'whatsapp'
             when coalesce((v.canais->>'email')::boolean, false)
                  and coalesce(v.email, '') <> ''         then 'email'
             else null
           end as canal
      from filtrados f
      join veic v on v.vv_id = f.vv_id
  ),

  classificado as (
    select c.*,
           case
             when v_relogio is not null then v_relogio
             when c.canal is null       then 'sem_canal_consentido'

             -- §4.3: três gatilhos consecutivos sem resposta → 90 dias parado.
             when exists (
               select 1 from (
                 select e.desfecho, e.enviado_em
                   from public.eventos_ciclo e
                   join public.veiculos_vendidos vq on vq.id = e.veiculo_vendido_id
                  where vq.cliente_id = c.cliente_id
                    and coalesce(e.desfecho, '') <> 'falha_envio'
                  order by e.enviado_em desc
                  limit 3
               ) tres
               having count(*) = 3
                  and count(*) filter (where tres.desfecho = 'sem_resposta') = 3
                  and max(tres.enviado_em) > p_agora - interval '90 days'
             ) then 'quarentena'

             -- §4.3: 1 contato por cliente a cada 21 dias, qualquer gatilho.
             when c.gatilho not in ('elegibilidade_em_risco', 'boas_vindas', 'revisao_verificada')
              and exists (
                select 1 from public.eventos_ciclo e
                  join public.veiculos_vendidos vq on vq.id = e.veiculo_vendido_id
                 where vq.cliente_id = c.cliente_id
                   and coalesce(e.desfecho, '') <> 'falha_envio'
                   and e.enviado_em > p_agora - interval '21 days'
              ) then 'janela_de_21_dias'

             else null
           end as suprimido_por
      from com_canal c
  ),

  -- §4.4: risco de perder elegibilidade vem antes de oportunidade, sempre.
  -- Suprimido ordena por último para não gastar o rn de quem pode sair.
  ordenado as (
    select cl.*,
           row_number() over (
             partition by cl.cliente_id
             order by (cl.suprimido_por is not null), cl.prioridade, cl.passo desc, cl.vv_id
           ) as rn
      from classificado cl
  ),
  marcado as (
    select o.*,
           coalesce(o.suprimido_por,
                    case when o.rn > 1 then 'colisao_prioridade' end) as sup
      from ordenado o
  ),

  reservado as (
    insert into public.eventos_ciclo (veiculo_vendido_id, gatilho, canal, payload, enviado_em)
    select m.vv_id, m.gatilho, m.canal,
           m.contexto || jsonb_build_object('passo', m.passo),
           p_agora
      from marcado m
     where p_reservar and m.sup is null
    returning id, veiculo_vendido_id, gatilho
  ),
  em_risco as (
    update public.contratos_ciclo cc
       set status_elegibilidade = 'em_risco'
     where p_reservar
       and cc.status_elegibilidade = 'elegivel'
       and cc.veiculo_vendido_id in (
             select m.vv_id from marcado m
              where m.sup is null
                and m.gatilho = 'elegibilidade_em_risco'
                and m.passo = 3)
    returning cc.veiculo_vendido_id
  )

  select r.id, m.vv_id, m.cliente_id, m.nome, m.telefone_e164, m.email,
         m.placa, m.marca, m.modelo, m.ano_modelo,
         m.gatilho, m.prioridade, m.passo, m.canal,
         m.contexto || jsonb_build_object(
           'passo', m.passo,
           'em_risco_marcado', exists (select 1 from em_risco er where er.veiculo_vendido_id = m.vv_id)
         ),
         m.sup
    from marcado m
    left join reservado r on r.veiculo_vendido_id = m.vv_id and r.gatilho = m.gatilho
   order by (m.sup is not null), m.prioridade, m.nome;
end;
$function$
;

comment on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) is
  'Monta (e opcionalmente reserva) a fila do motor de gatilhos. Reserva é '
  'serializada por advisory lock de transação. Desfecho falha_envio nunca '
  'conta como contato feito — regra 2 do CLAUDE.md.';

revoke all on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) from public, anon, authenticated;
grant execute on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) to service_role;


-- ---------------------------------------------------------------------------
-- 4. A conformidade do §1.4 também para de contar o carro que saiu
-- ---------------------------------------------------------------------------
-- Copiada da fonte VIVA (`20260814150000_carimbo_e_conformidade.sql`, a única
-- que define esta função), com uma linha somada ao `where` e nada mais.
--
-- Sem isto, o veículo que sai da Garagem deprime para sempre o indicador que
-- guarda o gatilho do §1.4 — e `conformidade_diaria` grava com
-- `on conflict (dia) do nothing`, então nenhum dia errado se corrige depois.

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
    where vv.data_venda <= d
      -- Carro que saiu da Garagem sai também da conta. Sem isto, a janela
      -- aberta que ele deixou para trás nunca é cumprida: ~13 meses depois
      -- ele entra em `veiculos_com_revisao_devida` e nunca em
      -- `veiculos_em_dia`, para sempre — e `on conflict (dia) do nothing`
      -- torna cada dia errado imutável.
      and vv.saiu_em is null;

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


-- ---------------------------------------------------------------------------
-- 5. O ex-dono lê o diário, mas não escreve mais nele
-- ---------------------------------------------------------------------------
-- As policies de SELECT NÃO mudam: o histórico é dado do cliente, e o §6.3 não
-- prevê apagá-lo porque o carro trocou de mãos.

drop policy if exists manutencoes_cliente_registra on public.manutencoes;
create policy manutencoes_cliente_registra on public.manutencoes
  for insert to authenticated
  with check (
    public.e_veiculo_do_cliente(veiculo_vendido_id)
    -- Não pode se declarar loja nem parceiro.
    and origem_registro = 'cliente'
    -- Não pode nascer carimbado. O carimbo é da loja, e é o que separa
    -- "registrei" de "vale para a conformidade".
    and confirmada_em is null
    and confirmada_por is null
    -- Nem pode se declarar dentro da janela: quem calcula é a loja.
    and dentro_da_janela is null
    -- E não escreve em carro que já saiu da Garagem.
    and not exists (
          select 1 from public.veiculos_vendidos vv
           where vv.id = veiculo_vendido_id and vv.saiu_em is not null)
  );

drop policy if exists leituras_odometro_cliente_registra on public.leituras_odometro;
create policy leituras_odometro_cliente_registra on public.leituras_odometro
  for insert to authenticated
  with check (
    public.e_veiculo_do_cliente(veiculo_vendido_id)
    and origem = 'cliente'
    and not exists (
          select 1 from public.veiculos_vendidos vv
           where vv.id = veiculo_vendido_id and vv.saiu_em is not null)
  );


-- ---------------------------------------------------------------------------
-- 6. A rede de segurança
-- ---------------------------------------------------------------------------
-- Os dois primeiros chamadores cobrem o caminho feliz. Este cobre o resto:
-- veículo importado, venda registrada por fora, janela apagada à mão. Como
-- `abrir_proxima_janela` já recusa quem tem janela aberta, rodar todo dia é
-- barato e idempotente.

create or replace function public.rodar_abertura_de_janelas()
  returns jsonb
  language plpgsql
  set search_path = public
  set timezone = 'America/Sao_Paulo'
as $$
declare
  v_vv    uuid;
  abertas int := 0;
begin
  perform set_config('request.jwt.claims', '', true);

  for v_vv in
    select vv.id
      from public.veiculos_vendidos vv
     where vv.saiu_em is null
       and not exists (
             select 1 from public.plano_revisoes pr
              where pr.veiculo_vendido_id = vv.id and pr.manutencao_id is null)
  loop
    if public.abrir_proxima_janela(v_vv) is not null then
      abertas := abertas + 1;
    end if;
  end loop;

  return jsonb_build_object('abertas', abertas);
end;
$$;

comment on function public.rodar_abertura_de_janelas() is
  'Ponto de entrada do pg_cron para o plano vitalício. Fixa o fuso de Curitiba '
  'e se apresenta como chamador sem JWT. É um portão que pula a checagem de '
  'staff: NUNCA conceder execute a authenticated ou anon.';

revoke all on function public.rodar_abertura_de_janelas() from public, anon, authenticated;
grant execute on function public.rodar_abertura_de_janelas() to service_role;

-- `0 3 * * *` em UTC = **meia-noite em Curitiba**, logo depois de a
-- conformidade fechar o dia às 23h30 (`conformidade-diaria`, '30 2 * * *').
-- A ordem importa: janela aberta hoje entra na série de amanhã e nunca altera
-- um dia já gravado. `cron.schedule` com nome existente ATUALIZA o
-- agendamento, então reaplicar esta migração não duplica job.
select cron.schedule(
  'abertura-de-janelas',
  '0 3 * * *',
  $cron$select public.rodar_abertura_de_janelas();$cron$
);


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


-- ---------------------------------------------------------------------------
-- Autoconferência 2 — os chamadores
-- ---------------------------------------------------------------------------
do $ac$
declare
  uid_staff uuid;
  r         jsonb;
  v_vv      uuid;
  v_cli     uuid;
  v_m       uuid;
  v_dentro  boolean;
  j         record;
  qtd       int;
  n         int;
  v_seg     timestamptz := '2026-08-17 09:00:00-03';  -- segunda, 9h: dentro do §4.3
begin
  select id into uid_staff from public.profiles
   where role in ('admin','comercial','financeiro','marketing') and is_active
   order by created_at limit 1;

if uid_staff is null then
  raise notice 'Autoconferência D2/chamadores PULADA: não há usuário de staff neste banco.';
else
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Venda de 13 anos atrás, para caber 12 revisões todas no passado.
  r := public.fechar_venda_ciclo(jsonb_build_object(
    'cpf_cnpj','AC-D2-CHAMADORES','nome','Cliente D2','telefone_e164','+554199990003',
    'email','ac-d2-chamadores@exemplo.invalido',
    'chassi','AUTOCONF-D2-CHAMADORES','placa','ACD0B02',
    'marca','Chevrolet','modelo','Onix','ano_fabricacao',2012,'ano_modelo',2013,
    'data_venda',(current_date - interval '13 years')::date,
    'km_na_venda',30000,'valor_venda',50000,
    'consentimento_lgpd',true,'aderiu_ciclo',true,
    'consentimento_canais', jsonb_build_object('whatsapp',true,'email',true,'sms',false)));
  v_vv  := (r->>'veiculo_vendido_id')::uuid;
  v_cli := (r->>'cliente_id')::uuid;

  -- 1. a venda cria UMA janela, número 1
  select count(*) into qtd from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: a venda criou % janelas (deveria ser 1)', qtd;
  end if;
  if (r->>'primeira_revisao')::int <> 1 then
    raise exception 'ACEITE FALHOU: retorno primeira_revisao = %', r->>'primeira_revisao';
  end if;

  -- 2. o plano NÃO SECA: doze revisões carimbadas, doze janelas novas
  for n in 1..12 loop
    insert into public.manutencoes
      (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro,
       url_etiqueta_atual)
    values (v_vv, 'revisao_programada',
            (current_date - interval '13 years' + (n * interval '12 months'))::date,
            30000 + (n * 10000), 'loja', 'https://exemplo.invalido/etiqueta.jpg')
    returning id into v_m;
    perform public.carimbar_revisao(v_m, true, null);
  end loop;

  select count(*) into qtd from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 13 then
    raise exception 'ACEITE FALHOU: depois de 12 revisões o plano tem % janelas (esperado 13)', qtd;
  end if;

  select * into j from public.plano_revisoes
   where veiculo_vendido_id = v_vv and manutencao_id is null;
  if j.numero_revisao <> 13 then
    raise exception 'ACEITE FALHOU: a janela aberta é a nº % (esperado 13)', j.numero_revisao;
  end if;

  -- 3. e ela é ancorada na 12ª revisão, não na venda
  if j.km_previsto <> 160000 then
    raise exception 'ACEITE FALHOU: a 13ª janela prevê % km (esperado 150000 + 10000)',
      j.km_previsto;
  end if;

  -- 4. recusa não gera janela nova, e a anterior segue aberta
  insert into public.manutencoes
    (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro,
     url_etiqueta_atual)
  values (v_vv, 'revisao_programada', current_date, 165000, 'loja',
          'https://exemplo.invalido/etiqueta.jpg')
  returning id into v_m;
  perform public.carimbar_revisao(v_m, false, 'Etiqueta ilegível');

  select count(*) into qtd from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 13 then
    raise exception 'ACEITE FALHOU: recusa gerou janela (plano ficou com %)', qtd;
  end if;

  -- 5. o gatilho fala do veículo ativo…
  set local role none;
  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli;
  if qtd = 0 then
    raise exception 'ACEITE FALHOU: veículo ativo com janela aberta não produziu gatilho';
  end if;

  -- …e cala quando o carro sai da Garagem
  update public.veiculos_vendidos
     set saiu_em = current_date, motivo_saida = 'revendido'
   where id = v_vv;
  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: veículo com saiu_em ainda produz % gatilho(s)', qtd;
  end if;

  -- 6. sem janela aberta, o carimbo não acusa atraso: null, nunca false
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  delete from public.plano_revisoes
   where veiculo_vendido_id = v_vv and manutencao_id is null;

  insert into public.manutencoes
    (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro,
     url_etiqueta_atual)
  values (v_vv, 'revisao_programada', current_date, 170000, 'loja',
          'https://exemplo.invalido/etiqueta.jpg')
  returning id into v_m;
  perform public.carimbar_revisao(v_m, true, null);

  select dentro_da_janela into v_dentro from public.manutencoes where id = v_m;
  if v_dentro is not null then
    raise exception 'ACEITE FALHOU: revisão sem janela saiu dentro_da_janela = %', v_dentro;
  end if;

  set local role none;

  delete from public.eventos_ciclo     where veiculo_vendido_id = v_vv;
  delete from public.leituras_odometro where veiculo_vendido_id = v_vv;
  delete from public.plano_revisoes    where veiculo_vendido_id = v_vv;
  delete from public.manutencoes       where veiculo_vendido_id = v_vv;
  delete from public.contratos_ciclo   where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos where id = v_vv;
  delete from public.clientes          where id = v_cli;

  raise notice 'Autoconferência D2/chamadores: OK.';
end if;
end $ac$;


-- ---------------------------------------------------------------------------
-- Autoconferência 2b — as policies de escrita do cliente
-- ---------------------------------------------------------------------------
-- Fora do portão de staff, porque não depende de usuário nenhum.
--
-- ⚠️ Prova pela DEFINIÇÃO da policy, não pelo efeito. Exercer a regra exigiria
-- um usuário do Auth que NÃO fosse staff: as policies são OR, e a `_staff`
-- deixaria qualquer membro da equipe passar, tornando o teste vazio. Criar
-- usuário em `auth.users` dentro da migração é caro e frágil. O que esta
-- conferência garante é que a migração de fato reescreveu as duas policies com
-- o guarda — que é o que ela pode falhar em fazer.
do $ac$
declare
  qtd int;
begin
  select count(*) into qtd from pg_policies
   where schemaname = 'public'
     and policyname in ('manutencoes_cliente_registra', 'leituras_odometro_cliente_registra')
     and with_check like '%saiu_em%';
  if qtd <> 2 then
    raise exception 'ACEITE FALHOU: % de 2 policies de escrita do cliente olham saiu_em', qtd;
  end if;

  -- E as de LEITURA continuam sem o guarda: o ex-dono não perde o histórico.
  select count(*) into qtd from pg_policies
   where schemaname = 'public'
     and policyname in ('manutencoes_cliente_le', 'leituras_odometro_cliente_le')
     and coalesce(qual, '') like '%saiu_em%';
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: a saída tirou do cliente a leitura do próprio diário';
  end if;

  raise notice 'Autoconferência D2/policies: OK.';
end $ac$;


-- ---------------------------------------------------------------------------
-- Autoconferência 3 — a rede de segurança
-- ---------------------------------------------------------------------------
do $ac$
declare
  v_cli uuid;
  v_vv  uuid;
  qtd   int;
  v_job record;
  v_pode boolean;
begin
  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email)
  values ('AC-D2-CRON', 'Autoconferência D2 cron', '+554199990004',
          'ac-d2-cron@exemplo.invalido')
  returning id into v_cli;

  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda, aderiu_ciclo)
  values (v_cli, 'AUTOCONF-D2-CRON', 'ACD0C03', 'Ford', 'Ka',
          2019, 2020, (current_date - interval '2 days')::date, 25000, 40000, true)
  returning id into v_vv;

  -- Veículo sem janela nenhuma — o caso que a rede de segurança existe para
  -- cobrir: importação, venda antiga, qualquer caminho fora dos dois primeiros.
  perform public.rodar_abertura_de_janelas();

  select count(*) into qtd
    from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o cron abriu % janelas para veículo sem plano', qtd;
  end if;

  -- Rodar de novo não duplica.
  perform public.rodar_abertura_de_janelas();
  select count(*) into qtd
    from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o cron duplicou janela (ficaram %)', qtd;
  end if;

  -- Veículo que saiu não entra na varredura.
  delete from public.plano_revisoes where veiculo_vendido_id = v_vv;
  update public.veiculos_vendidos
     set saiu_em = current_date, motivo_saida = 'perda total'
   where id = v_vv;
  perform public.rodar_abertura_de_janelas();
  select count(*) into qtd
    from public.plano_revisoes where veiculo_vendido_id = v_vv;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: o cron abriu janela para veículo com saiu_em';
  end if;

  -- O job existe, está ativo e com o agendamento esperado.
  select * into v_job from cron.job where jobname = 'abertura-de-janelas';
  if not found then
    raise exception 'ACEITE FALHOU: o job abertura-de-janelas não foi agendado';
  end if;
  if v_job.schedule <> '0 3 * * *' then
    raise exception 'ACEITE FALHOU: o agendamento saiu "%"', v_job.schedule;
  end if;
  if not v_job.active then
    raise exception 'ACEITE FALHOU: o job nasceu inativo';
  end if;

  -- O portão NÃO está aberto para quem não é equipe. Esta é a linha que
  -- impede o pulo da checagem de staff virar escada.
  for v_pode in
    select has_function_privilege(r, 'public.rodar_abertura_de_janelas()', 'execute')
      from unnest(array['anon', 'authenticated']) as r
  loop
    if v_pode then
      raise exception 'ACEITE FALHOU: anon ou authenticated pode executar o portão do cron';
    end if;
  end loop;

  delete from public.plano_revisoes    where veiculo_vendido_id = v_vv;
  delete from public.leituras_odometro where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos where id = v_vv;
  delete from public.clientes          where id = v_cli;

  raise notice 'Autoconferência D2/cron: OK.';
end $ac$;


-- ---------------------------------------------------------------------------
-- Autoconferência 4 — nada se perdeu na reescrita
-- ---------------------------------------------------------------------------
-- O par do retrato tirado na seção 0. Cada `create or replace` acima é uma
-- SUBSTITUIÇÃO TOTAL: o que não foi copiado, sumiu. Esta conferência lê a
-- definição nova de cada função direto do catálogo e cobra que todo marcador
-- que existia antes continue existindo.
--
-- Ela é a técnica que pegou a versão errada de `montar_fila_de_gatilhos` desta
-- própria migração — copiada do arquivo homônimo em vez da definição viva, sem
-- `pg_advisory_xact_lock` e com dois guardas de `falha_envio` a menos.
--
-- O agrupamento por `proname` é de propósito: se uma sobrecarga desaparecer, o
-- texto agregado de DEPOIS encolhe e a conferência morde do mesmo jeito.
do $ac$
declare
  a         record;
  v_depois  text;
  marcador  text;
  antes_n   int;
  depois_n  int;
begin
  for a in
    select proname, string_agg(def, E'\n') as def
      from _definicoes_antes group by proname
  loop
    select coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'), '') into v_depois
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = a.proname;

    if coalesce(v_depois, '') = '' then
      raise exception 'ACEITE FALHOU (nada-se-perdeu): a função % sumiu do schema public.',
        a.proname;
    end if;

    foreach marcador in array array[
      'pg_advisory_xact_lock', 'array_append', 'is_staff', 'unique_violation',
      'CARIMBO_SEM_ETIQUETA', 'suprimido_por', 'consentimento_canais',
      'em_risco', 'cep', 'dentro_da_janela'
    ]
    loop
      if position(marcador in a.def) > 0 and position(marcador in v_depois) = 0 then
        raise exception
          'ACEITE FALHOU (nada-se-perdeu): a função % perdeu "%" na reescrita.',
          a.proname, marcador;
      end if;
    end loop;

    -- Presença não basta. A versão errada de `montar_fila_de_gatilhos` TAMBÉM
    -- contém a string 'falha_envio' — só que 6 vezes em vez de 9, porque perdeu
    -- os guardas de `boas_vindas` e `revisao_verificada`. Quem só olha presença
    -- deixa passar exatamente o defeito que motivou esta conferência.
    antes_n  := (length(a.def)   - length(replace(a.def,   'falha_envio', ''))) / length('falha_envio');
    depois_n := (length(v_depois) - length(replace(v_depois, 'falha_envio', ''))) / length('falha_envio');
    if depois_n < antes_n then
      raise exception
        'ACEITE FALHOU (nada-se-perdeu): a função % caiu de % para % ocorrências de "falha_envio".',
        a.proname, antes_n, depois_n;
    end if;
  end loop;

  raise notice 'Autoconferência D2/nada-se-perdeu: OK.';
end $ac$;


-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha: quem aplica
-- por psql/pg precisa deste rodapé, senão a versão fica invisível para o
-- `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260820120000', 'plano_de_revisoes_vitalicio')
  on conflict (version) do nothing;
