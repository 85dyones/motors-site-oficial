-- ============================================================================
-- Retrato do schema da produção (motors-oficial), 125 migrações registradas,
-- a última 20261010140000. Gerado pelo workflow esquema-base a partir do
-- motors-plataforma, conferido igual à produção em 12/10/2026.
--
-- NÃO EDITE À MÃO e NÃO mova para migrations/: ver "base/" em supabase/README.md.
-- Uso: num projeto Supabase NOVO e VAZIO, numa transação só:
--   psql "$URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/base/esquema_da_producao.sql
-- Fica de fora: dado de qualquer tabela, segredos do Vault, tarefas do pg_cron
-- e o webhook do banco que manda tracking_events para o n8n.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 00_extensoes
-- ---------------------------------------------------------------------------
create extension if not exists "pg_cron" with schema pg_catalog;
create schema if not exists extensions;
create extension if not exists "pg_net" with schema extensions;
create schema if not exists extensions;
create extension if not exists "pg_stat_statements" with schema extensions;
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
create schema if not exists vault;
create extension if not exists "supabase_vault" with schema vault;
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------------------------------------------------------------------------
-- 05_registro_estrutura
-- ---------------------------------------------------------------------------
--
-- PostgreSQL database dump
--

\restrict esquemabase

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text,
    created_by text,
    idempotency_key text,
    rollback text[]
);


--
-- Name: schema_migrations schema_migrations_idempotency_key_key; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: supabase_migrations; Owner: -
--

ALTER TABLE supabase_migrations.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict esquemabase


-- ---------------------------------------------------------------------------
-- 08_sem_padrao_do_supabase
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10_public
-- ---------------------------------------------------------------------------
--
-- PostgreSQL database dump
--

\restrict esquemabase

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: evento_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.evento_tipo AS ENUM (
    'ENTRADA',
    'CORRECAO_ENTRADA',
    'ESTORNO_ENTRADA',
    'COMPRA_TERCEIRO',
    'DEVOLUCAO_TERCEIRO',
    'PREPARACAO_INICIO',
    'PREPARACAO_FIM',
    'CUSTO_LANCADO',
    'BLOQUEIO',
    'DESBLOQUEIO',
    'PUBLICACAO',
    'DESPUBLICACAO',
    'MIDIA_ATRIBUIDA',
    'PRE_VENDA_LANCADA',
    'SINAL',
    'CANCELAMENTO_SINAL',
    'PRE_VENDA_CANCELADA',
    'VENDA',
    'REPASSE_SAIDA',
    'ESTORNO_VENDA',
    'NF_EMITIDA',
    'ENTREGA_LIBERADA',
    'CICLO_ABERTO',
    'REVISAO_REGISTRADA',
    'CONFORMIDADE_ALTERADA',
    'RECOMPRA_EXERCIDA',
    'CHAMADO_ABERTO',
    'REPARO_CONCLUIDO',
    'PRAZO_VENCIDO'
);


--
-- Name: laudo_do_repasse; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.laudo_do_repasse AS ENUM (
    'aprovado',
    'aprovado_com_apontamento',
    'nao_feito'
);


--
-- Name: modalidade_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.modalidade_tipo AS ENUM (
    'compra_direta',
    'troca',
    'consignacao',
    'parceria',
    'repasse',
    'lote'
);


--
-- Name: posse_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.posse_tipo AS ENUM (
    'propria',
    'terceiro'
);


--
-- Name: saida_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.saida_tipo AS ENUM (
    'varejo',
    'repasse',
    'devolucao_terceiro'
);


--
-- Name: situacao_do_repasse; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.situacao_do_repasse AS ENUM (
    'rascunho',
    'em_validacao',
    'publicado',
    'reservado',
    'vendido',
    'arquivado'
);


--
-- Name: abrir_proxima_janela(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.abrir_proxima_janela(p_vv uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION abrir_proxima_janela(p_vv uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.abrir_proxima_janela(p_vv uuid) IS 'Abre a PRÓXIMA janela de revisão do veículo, se couber: não faz nada se ele saiu da Garagem ou já tem janela aberta. Ancora no último fato real — a última revisão programada confirmada, ou a venda. É a régua do §1.5 num lugar só, e é o ponto de extensão do plano por modelo.';


--
-- Name: atualizar_consentimento_canais(boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atualizar_consentimento_canais(p_whatsapp boolean, p_email boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cliente uuid;
  v_atual   jsonb;
  v_novo    jsonb;
begin
  if auth.uid() is null then
    raise exception 'SEM_SESSAO' using errcode = 'insufficient_privilege';
  end if;
  if p_whatsapp is null or p_email is null then
    raise exception 'CONSENTIMENTO_INVALIDO' using errcode = 'check_violation';
  end if;

  select id, coalesce(consentimento_canais, '{}'::jsonb)
    into v_cliente, v_atual
    from public.clientes
   where auth_user_id = auth.uid();

  if v_cliente is null then
    raise exception 'CLIENTE_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  -- Preserva o que existir além dos dois canais (hoje `sms`, que não tem
  -- transporte e por isso não vira botão) e carimba a data da escolha: prova
  -- de consentimento sem tabela nova. Chave extra não atrapalha o motor, que
  -- lê `canais->>'whatsapp'` e `canais->>'email'`.
  v_novo := v_atual
            || jsonb_build_object(
                 'whatsapp', p_whatsapp,
                 'email',    p_email,
                 'atualizado_em', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                 'atualizado_por', 'cliente'
               );

  update public.clientes
     set consentimento_canais = v_novo,
         updated_at = now()
   where id = v_cliente;

  return jsonb_build_object('ok', true, 'consentimento_canais', v_novo);
end;
$$;


--
-- Name: FUNCTION atualizar_consentimento_canais(p_whatsapp boolean, p_email boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.atualizar_consentimento_canais(p_whatsapp boolean, p_email boolean) IS 'O cliente liga/desliga os canais de comunicação (§6.3-D). SECURITY DEFINER de escopo estreito: escreve só consentimento_canais, só da própria linha. Policy de UPDATE abriria cpf_cnpj e auth_user_id junto, porque o grant da tabela não é por coluna e o papel é o mesmo da equipe.';


--
-- Name: autor_atual(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.autor_atual() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select nullif(trim(p.full_name), '')
    from public.profiles p
   where p.id = auth.uid();
$$;


--
-- Name: cadastrar_veiculo_nativo(jsonb, public.modalidade_tipo, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cadastrar_veiculo_nativo(dados jsonb, modalidade_entrada public.modalidade_tipo DEFAULT 'compra_direta'::public.modalidade_tipo, autor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $_$
declare
  linha        jsonb  := dados - 'modalidade' - 'id' - 'origem' - 'last_seen_at' - 'first_seen_at';
  colunas      text;
  novo_id      integer;
  novo_veiculo uuid;
  chassi_txt   text   := upper(btrim(coalesce(dados->>'chassi', '')));
  custo        numeric := nullif(dados->>'preco_compra', '')::numeric;
  posse_calc   public.posse_tipo;
  usuario      uuid   := coalesce(autor, auth.uid());
begin
  if chassi_txt = '' then
    raise exception 'CHASSI_OBRIGATORIO: o veículo do painel nasce no núcleo, e lá o chassi é a identidade (uma linha por chassi, por org). Sem ele não há como impedir o mesmo carro entrar duas vezes nem escriturar no RENAVE.'
      using errcode = 'raise_exception';
  end if;

  -- Troca fica de fora da F0: `troca_exige_venda` pede a venda de origem, e
  -- negócio ainda não existe na operação. Tentar registrá-la aqui produziria
  -- uma entrada mentindo sobre de onde o carro veio.
  if modalidade_entrada = 'troca' then
    raise exception 'TROCA_EXIGE_VENDA: troca não existe sem a venda que a gerou (spec 10). Registre a venda primeiro — na F0, use compra direta, consignação, parceria ou repasse.'
      using errcode = 'raise_exception';
  end if;

  posse_calc := case
    when modalidade_entrada in ('consignacao', 'parceria') then 'terceiro'
    else 'propria'
  end::public.posse_tipo;

  -- Documento entra em forma CANÔNICA, não como o operador digitou. A revisão
  -- já tinha apontado ("placa entra crua no banco"), e o RENAVE e a NF-e vão
  -- pedir a forma sem separador. Normalizar aqui — e não só no índice — é o
  -- que faz duas grafias da mesma placa serem o mesmo carro em toda consulta,
  -- não apenas na hora de barrar o duplicado.
  linha := linha
    || jsonb_build_object('chassi', chassi_txt)
    || case
         when nullif(btrim(coalesce(dados->>'placa', '')), '') is null then '{}'::jsonb
         else jsonb_build_object(
           'placa', upper(replace(replace(btrim(dados->>'placa'), '-', ''), ' ', ''))
         )
       end
    || case
         when nullif(btrim(coalesce(dados->>'renavam', '')), '') is null then '{}'::jsonb
         else jsonb_build_object(
           'renavam', replace(replace(btrim(dados->>'renavam'), '-', ''), '.', '')
         )
       end;

  if modalidade_entrada = 'parceria' and custo is null then
    raise exception 'PARCERIA_EXIGE_PRECO: parceria tem preço travado (spec 10) — informe o valor acordado com o parceiro.'
      using errcode = 'raise_exception';
  end if;

  -- 3.1 A linha que o site lê. O trigger da f0k infere origem e o carimbo do
  -- sync a partir da FAIXA do id; o índice único de documento recusa o carro
  -- repetido.
  --
  -- O INSERT nomeia SÓ as colunas que vieram no jsonb, e é de propósito.
  -- `jsonb_populate_record` devolveria a linha inteira com NULO no que faltou,
  -- e **NULO EXPLÍCITO não aciona DEFAULT** — dois ensaios morreram assim, um
  -- em `id`, outro em `conteudo_atualizado_em`, e viriam mais a cada coluna
  -- nova com default. Nomeando o que existe, todo default do banco continua
  -- valendo, hoje e nas colunas que ainda serão criadas.
  select string_agg(quote_ident(c.column_name), ', ')
    into colunas
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'estoque_motors'
     and c.column_name <> 'id'
     and linha ? c.column_name;

  if colunas is null then
    raise exception 'CADASTRO_VAZIO: nenhum campo conhecido de estoque_motors veio no cadastro.'
      using errcode = 'raise_exception';
  end if;

  execute format(
    'insert into public.estoque_motors (id, %1$s)
     select $1, %1$s from jsonb_populate_record(null::public.estoque_motors, $2)
     returning id',
    colunas
  )
  into novo_id
  using nextval('public.estoque_motors_nativo_seq'), linha;

  -- 3.2 A identidade do núcleo, amarrada à linha do site por `estoque_id`.
  insert into public.veiculos (
    chassi, placa, renavam, marca, modelo, versao, ano, ano_fabricacao,
    km_atual, estoque_id
  )
  values (
    chassi_txt,
    nullif(upper(btrim(coalesce(dados->>'placa', ''))), ''),
    nullif(btrim(coalesce(dados->>'renavam', '')), ''),
    dados->>'marca',
    dados->>'modelo',
    nullif(dados->>'versao', ''),
    nullif(dados->>'ano', '')::integer,
    nullif(dados->>'ano_fabricacao', '')::integer,
    nullif(dados->>'quilometragem', '')::integer,
    novo_id
  )
  returning id into novo_veiculo;

  -- 3.3 A aquisição. Os campos por modalidade que a F0 conhece; o formulário
  -- completo de cada porta é a F1 (spec 10).
  insert into public.veiculo_entradas (
    veiculo_id, modalidade, posse, valor_entrada,
    consig_valor_dono, parceria_preco_entrada, parceria_parceiro,
    fornecedor_nome, criado_por
  )
  values (
    novo_veiculo,
    modalidade_entrada,
    posse_calc,
    case when modalidade_entrada in ('consignacao', 'parceria') then 0
         else coalesce(custo, 0) end,
    case when modalidade_entrada = 'consignacao' then custo end,
    case when modalidade_entrada = 'parceria' then custo end,
    case when modalidade_entrada = 'parceria' then nullif(dados->>'fornecedor', '') end,
    nullif(dados->>'fornecedor', ''),
    usuario
  );

  -- 3.4 E a história começa.
  insert into public.veiculo_eventos (veiculo_id, tipo, usuario_id, payload)
  values (
    novo_veiculo,
    'ENTRADA',
    coalesce(usuario, '00000000-0000-0000-0000-000000000000'),
    jsonb_build_object(
      'origem', 'cadastro_nativo',
      'modalidade', modalidade_entrada,
      'estoque_id', novo_id
    )
  );

  return jsonb_build_object(
    'estoque_id', novo_id,
    'veiculo_id', novo_veiculo,
    'modalidade', modalidade_entrada
  );
end;
$_$;


--
-- Name: FUNCTION cadastrar_veiculo_nativo(dados jsonb, modalidade_entrada public.modalidade_tipo, autor uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cadastrar_veiculo_nativo(dados jsonb, modalidade_entrada public.modalidade_tipo, autor uuid) IS 'O nascimento do veículo do painel, atômico: linha do site + identidade do núcleo + aquisição + evento ENTRADA. Decisão do dono em 2026-08-29 ("precisa entrar já") — sem isto o cadastro criava carro sem história, e a conferência diária acusaria a divergência todo dia.';


--
-- Name: calcula_situacao(public.evento_tipo[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calcula_situacao(tipos public.evento_tipo[]) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  t public.evento_tipo;
  s text := 'estoque';  -- sem evento: unidade recém-criada, tratada como estoque
begin
  foreach t in array tipos loop
    case t
      -- aquisição (re)abre a vida em estoque
      when 'ENTRADA', 'COMPRA_TERCEIRO' then s := 'estoque';
      when 'PREPARACAO_INICIO'          then s := 'preparacao';
      when 'PREPARACAO_FIM'             then s := 'estoque';
      when 'BLOQUEIO'                   then s := 'fora';
      when 'DESBLOQUEIO'                then s := 'estoque';
      when 'PRE_VENDA_LANCADA'          then s := 'reservado';
      when 'PRE_VENDA_CANCELADA'        then s := 'estoque';
      when 'VENDA', 'REPASSE_SAIDA'     then s := 'vendido';
      when 'ESTORNO_VENDA'              then s := 'estoque';
      when 'DEVOLUCAO_TERCEIRO'         then s := 'devolvido';
      when 'ESTORNO_ENTRADA'            then s := 'fora';
      else null;  -- custo, publicação, sinal, NF, Ciclo, pós-venda: não movem situação
    end case;
  end loop;
  return s;
end;
$$;


--
-- Name: FUNCTION calcula_situacao(tipos public.evento_tipo[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.calcula_situacao(tipos public.evento_tipo[]) IS 'Projeção pura da situação (spec 00): estoque | preparacao | reservado | vendido | devolvido | fora. A tabela-verdade vive na autoconferência da migração 20260829120800 — mudou a função, mude a tabela junto.';


--
-- Name: calcular_conformidade_diaria(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calcular_conformidade_diaria() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION calcular_conformidade_diaria(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.calcular_conformidade_diaria() IS 'Grava a série do §1.4 do último dia registrado até hoje, inclusive dias de denominador zero (pct NULL). Dias preenchidos depois do fato saem com retroativa = true. Nunca sobrescreve dia já gravado.';


--
-- Name: carimbar_cabecalho_dos_guias(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.carimbar_cabecalho_dos_guias() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- Vazio e espaço em branco entram e viram NULO. Não é rejeição: limpar o
  -- campo é operação legítima, e o banco só grava a forma canônica do
  -- "ausente". Espaço na ponta de um `<title>` não é conteúdo, e é justamente
  -- ele que separa "vazio" de "quase vazio" numa tela onde ninguém vê a
  -- diferença.
  new.titulo_seo := nullif(btrim(coalesce(new.titulo_seo, '')), '');
  new.resumo := nullif(btrim(coalesce(new.resumo, '')), '');

  -- A data de modificação é do servidor, e não depende de a rota lembrar. Só
  -- em UPDATE: num INSERT o valor informado vence, que é o que permitiria
  -- migrar um texto sem reescrever a data dele para "agora".
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
  end if;

  -- Autor: quem manda é a sessão. Num UPDATE, `new.atualizado_por` chega
  -- herdado da linha antiga — sem esta linha o PRIMEIRO autor ficaria
  -- congelado para sempre, que é o defeito que `textos_de_hub` carrega hoje e
  -- que `guias` já corrigiu. `auth.uid()` é nulo quando quem escreve é a chave
  -- de serviço ou uma migração; a coluna aceita nulo, e "sem autor" é a
  -- verdade nesse caso.
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;

  return new;
end $$;


--
-- Name: carimbar_guia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.carimbar_guia() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- `dateModified` é do servidor, e não depende de a rota lembrar. Só em
  -- UPDATE: num INSERT o valor dado vence, que é o que permite semear um texto
  -- publicado em 05/09 sem reescrever a data para "agora".
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
  end if;

  -- A primeira publicação carimba a si mesma — e é o gatilho, não a rota, que
  -- responde pela constraint `guias_publicado_tem_data` logo acima. Gatilho
  -- BEFORE roda antes do CHECK, então publicar sem informar a data funciona.
  if new.estado = 'publicado' and new.publicado_em is null then
    new.publicado_em := now();
  end if;

  -- Autor: quem manda é a sessão. Num UPDATE, `new.atualizado_por` chega
  -- herdado da linha antiga — sem esta linha o PRIMEIRO autor ficaria
  -- congelado para sempre, que é o defeito que `textos_de_hub` carrega hoje.
  -- `auth.uid()` é nulo quando quem escreve é a chave de serviço; a coluna
  -- aceita nulo de propósito, e "sem autor" é a verdade nesse caso.
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;

  return new;
end $$;


--
-- Name: carimbar_revisao(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text) IS 'Confirma (ou recusa, com motivo) um registro do diário de bordo. Carimbar exige a foto da etiqueta nova, casa a revisão com a janela do plano, calcula dentro_da_janela pela régua do §1.5 e grava o KM como leitura verificada. Recusa marca recusada_em/motivo_recusa e sai da fila. Transacional e restrita a staff.';


--
-- Name: carimbar_texto_de_hub(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.carimbar_texto_de_hub() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.atualizado_em := now();
  -- `auth.uid()` é nulo quando quem escreve é a chave de serviço; a coluna
  -- aceita nulo de propósito, e "sem autor" é a verdade nesse caso.
  if new.atualizado_por is null then
    new.atualizado_por := auth.uid();
  end if;
  return new;
end $$;


--
-- Name: ciclo_seed_validado_so_pelo_dono(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ciclo_seed_validado_so_pelo_dono() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.seed_validado_em is not null and public.nucleo_chamada_de_api() then
    raise exception 'seed_validado_em é decisão do dono (manual v1.2 §1.4, pendência D13): os percentuais precisam ser batidos contra o praticado da casa por perfil antes de virarem contrato. Não se carimba pela API.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;


--
-- Name: cliente_atual(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cliente_atual() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from public.clientes where auth_user_id = auth.uid() limit 1;
$$;


--
-- Name: FUNCTION cliente_atual(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cliente_atual() IS 'O `clientes.id` do cliente logado, ou NULL. NULL faz toda policy de cliente falhar fechado — sessão sem cadastro não vê nada.';


--
-- Name: completude_por_vendedor(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.completude_por_vendedor(p_desde date DEFAULT NULL::date, p_ate date DEFAULT NULL::date) RETURNS TABLE(vendedor_id uuid, vendedor_nome text, vendas bigint, vendas_completas bigint, campos_pendentes bigint, completude numeric, posicao bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with base as (
    select v.vendedor_id, v.vendedor_nome, v.pendencias
      from public.vw_vendas_incompletas v
     where (p_desde is null or v.data_venda >= p_desde)
       and (p_ate   is null or v.data_venda <= p_ate)
  ), agregado as (
    select
      b.vendedor_id                                        as vendedor_id,
      b.vendedor_nome                                      as vendedor_nome,
      count(*)                                             as vendas,
      count(*) filter (where cardinality(b.pendencias) = 0) as vendas_completas,
      sum(cardinality(b.pendencias))                       as campos_pendentes,
      round(
        1 - sum(cardinality(b.pendencias))::numeric / (count(*) * 5),
        4
      )                                                    as completude
    from base b
    group by b.vendedor_id, b.vendedor_nome
  )
  select
    a.vendedor_id,
    a.vendedor_nome,
    a.vendas,
    a.vendas_completas,
    a.campos_pendentes,
    a.completude,
    rank() over (order by a.completude desc, a.vendas desc) as posicao
  from agregado a
  order by posicao, a.vendedor_nome;
$$;


--
-- Name: FUNCTION completude_por_vendedor(p_desde date, p_ate date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.completude_por_vendedor(p_desde date, p_ate date) IS 'Ranking de completude do registro por vendedor (§3.2, meta §9 >= 80%). Janela opcional; null = tudo. Lê a view restrita a staff, então herda o corte de acesso dela.';


--
-- Name: confirmacoes_carimbar_instante(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirmacoes_carimbar_instante() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: consultas_de_modelo_carimbar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consultas_de_modelo_carimbar() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  -- Com sessão (o painel, pelo PostgREST), org, autoria e hora são as da
  -- sessão, informe o cliente o que informar. Sem sessão (chave de serviço),
  -- os valores informados são aceitos.
  if auth.uid() is not null then
    new.org_id          := public.org_padrao();
    new.criado_por      := auth.uid();
    new.criado_por_nome := public.autor_atual();
    new.criado_em       := now();
  end if;
  return new;
end;
$$;


--
-- Name: FUNCTION consultas_de_modelo_carimbar(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.consultas_de_modelo_carimbar() IS 'Gatilho de consultas_de_modelo: com sessão, grava org, autor (id e nome) e hora pela sessão, e não pelo que o cliente mandou. Equivalente a consultas_de_placa_carimbar(), que escreve em colunas de outro nome.';


--
-- Name: consultas_de_placa_carimbar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consultas_de_placa_carimbar() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  -- Com sessão (o painel, pelo PostgREST), autoria e hora são as da sessão,
  -- informe o cliente o que informar. Sem sessão (chave de serviço), os
  -- valores informados são aceitos.
  if auth.uid() is not null then
    new.org_id              := public.org_padrao();
    new.consultado_por      := auth.uid();
    new.consultado_por_nome := public.autor_atual();
    new.criado_em           := now();
  end if;
  return new;
end;
$$;


--
-- Name: FUNCTION consultas_de_placa_carimbar(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.consultas_de_placa_carimbar() IS 'Gatilho de consultas_de_placa: com sessão, grava org, autor e hora pela sessão, e não pelo que o cliente mandou.';


--
-- Name: desfecho_pode_gravar(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desfecho_pode_gravar(p_atual text, p_novo text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p_atual is null
      or p_novo = p_atual
      or (case p_novo  when 'convertido' then 3 when 'recusado' then 3 when 'agendado' then 2 else 1 end)
       > (case p_atual when 'convertido' then 3 when 'recusado' then 3 when 'agendado' then 2 else 1 end)
      or (p_atual in ('convertido', 'recusado') and p_novo in ('convertido', 'recusado'));
$$;


--
-- Name: FUNCTION desfecho_pode_gravar(p_atual text, p_novo text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.desfecho_pode_gravar(p_atual text, p_novo text) IS 'Régua do achado #10: desfecho não regride. Ranques falha_envio/sem_resposta=1, agendado=2, recusado/convertido=3; grava igual, subida, ou correção entre terminais. falha_envio↮sem_resposta é deliberado — regra 2.';


--
-- Name: e_veiculo_do_cliente(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.e_veiculo_do_cliente(vv_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.veiculos_vendidos vv
     where vv.id = vv_id
       and vv.cliente_id = public.cliente_atual()
  );
$$;


--
-- Name: FUNCTION e_veiculo_do_cliente(vv_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.e_veiculo_do_cliente(vv_id uuid) IS 'Este veículo vendido pertence ao cliente logado? É a régua de toda tabela filha do par cliente-veículo.';


--
-- Name: escopo_de_leads(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.escopo_de_leads() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce((
    select case
             when 'admin' = any (p.papeis)               then 'todos'
             when p.papeis && array['gestor', 'sdr']     then 'designados'
             when 'comercial' = any (p.papeis)           then 'meus'
             else 'nenhum'
           end
      from public.profiles p
     where p.id = auth.uid()
       and p.is_active = true
  ), 'nenhum');
$$;


--
-- Name: FUNCTION escopo_de_leads(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.escopo_de_leads() IS 'Quais leads a sessão enxerga: todos (admin), designados (gestor, sdr — os que têm responsável), meus (comercial) ou nenhum. Espelha escopoDeLeads de src/lib/escopoDeLeads.ts. Lê profiles.papeis de perfil ativo; sem sessão, sem perfil ou perfil desativado é nenhum. A régua da RLS de leads desde 20261003130000.';


--
-- Name: estoque_motors_marcar_origem(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estoque_motors_marcar_origem() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
begin
  if new.id >= 900000001 then
    new.origem := 'painel';
    new.last_seen_at := null;
    if new.first_seen_at is null then
      new.first_seen_at := now();
    end if;
  else
    new.origem := coalesce(new.origem, 'sync');

    new.placa  := nullif(upper(replace(replace(btrim(new.placa),  '-', ''), ' ', '')), '');
    new.chassi := nullif(upper(replace(replace(btrim(new.chassi), '-', ''), ' ', '')), '');

    -- VIN não usa I, O nem Q (ISO 3779): no chassi, elas são erro de digitação.
    if new.chassi ~ '[IOQ]' then
      raise notice 'Carro % do feed: chassi com I, O ou Q não é VIN — não gravado.', new.id;
      new.chassi := null;
    end if;

    -- `0.0` é como o feed diz que não sabe o motor.
    if btrim(new.motor) ~ '^0+([.,]0+)?$' then
      new.motor := null;
    end if;

    -- Documento que já é de outro carro não derruba a importação: o carro entra
    -- sem ele, em rascunho, e a revisão no painel é quem decide o que fazer.
    if new.placa is not null and exists (
      select 1 from public.estoque_motors o
       where o.placa is not null and btrim(o.placa) <> ''
         and o.id is distinct from new.id
         and upper(replace(replace(btrim(o.placa), '-', ''), ' ', '')) = new.placa
    ) then
      raise notice 'Carro % do feed: a placa pertence a outro carro — não gravada.', new.id;
      new.placa := null;
    end if;

    if new.chassi is not null and exists (
      select 1 from public.estoque_motors o
       where o.chassi is not null and btrim(o.chassi) <> ''
         and o.id is distinct from new.id
         and upper(replace(replace(btrim(o.chassi), '-', ''), ' ', '')) = new.chassi
    ) then
      raise notice 'Carro % do feed: o chassi pertence a outro carro — não gravado.', new.id;
      new.chassi := null;
    end if;
  end if;

  -- Carro novo nasce rascunho, venha de onde vier. Publicar é ATO de quem
  -- publica (linha "Publicar ou despublicar veículo" da A17) — nunca efeito
  -- colateral de uma importação.
  new.estado_cadastro := 'rascunho';

  return new;
end;
$_$;


--
-- Name: estoque_motors_trava_do_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estoque_motors_trava_do_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
declare
  preco_mudou      boolean;
  opcionais_mudou  boolean;
  ficha_mudou      boolean := false;
  placa_do_feed    text;
  chassi_do_feed   text;
  motor_do_feed    text;
  motor_preenchido boolean := false;
  cambio_do_feed      text;
  combustivel_do_feed text;
  cor_do_feed         text;
  c_autor constant text := 'RevendaMais (sync)';
begin
  if current_user = 'service_role'
     or new.last_seen_at is distinct from old.last_seen_at then

    preco_mudou :=
         new.preco             is distinct from old.preco
      or new.preco_original    is distinct from old.preco_original
      or new.preco_promocional is distinct from old.preco_promocional;

    opcionais_mudou := new.opcionais is distinct from old.opcionais;

    old.preco             := new.preco;
    old.preco_original    := new.preco_original;
    old.preco_promocional := new.preco_promocional;
    old.last_seen_at      := new.last_seen_at;
    old.portas            := new.portas;
    old.opcionais         := new.opcionais;

    -- ------------------------------------------------------------------
    -- Ficha técnica: segue o feed, e cada troca vai para o histórico — só no
    -- carro DO FEED. O nativo nunca recebe escrita do sync; o que chega nele
    -- por service_role é manutenção, e não pode sair assinado "RevendaMais".
    -- Texto comparado e gravado sem espaço nas pontas: espaço do feed não é
    -- troca de cor.
    -- ------------------------------------------------------------------
    if old.origem is distinct from 'painel' then
      cambio_do_feed      := nullif(btrim(new.cambio), '');
      combustivel_do_feed := nullif(btrim(new.combustivel), '');
      cor_do_feed         := nullif(btrim(new.cor), '');

      if new.quilometragem > 0 and new.quilometragem is distinct from old.quilometragem then
        insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
        values (old.id, 'quilometragem', old.quilometragem::text, new.quilometragem::text, null, c_autor, clock_timestamp());
        old.quilometragem := new.quilometragem;
        ficha_mudou := true;
      end if;

      if new.ano between 1900 and 2100 and new.ano is distinct from old.ano then
        insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
        values (old.id, 'ano', old.ano::text, new.ano::text, null, c_autor, clock_timestamp());
        old.ano := new.ano;
        ficha_mudou := true;
      end if;

      if new.ano_fabricacao between 1900 and 2100 and new.ano_fabricacao is distinct from old.ano_fabricacao then
        insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
        values (old.id, 'ano_fabricacao', old.ano_fabricacao::text, new.ano_fabricacao::text, null, c_autor, clock_timestamp());
        old.ano_fabricacao := new.ano_fabricacao;
        ficha_mudou := true;
      end if;

      if cambio_do_feed is not null and upper(cambio_do_feed) <> 'N/D'
         and cambio_do_feed is distinct from btrim(old.cambio) then
        insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
        values (old.id, 'cambio', old.cambio, cambio_do_feed, null, c_autor, clock_timestamp());
        old.cambio := cambio_do_feed;
        ficha_mudou := true;
      end if;

      if combustivel_do_feed is not null and upper(combustivel_do_feed) <> 'N/D'
         and combustivel_do_feed is distinct from btrim(old.combustivel) then
        insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
        values (old.id, 'combustivel', old.combustivel, combustivel_do_feed, null, c_autor, clock_timestamp());
        old.combustivel := combustivel_do_feed;
        ficha_mudou := true;
      end if;

      if cor_do_feed is not null and upper(cor_do_feed) <> 'N/D'
         and cor_do_feed is distinct from btrim(old.cor) then
        insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
        values (old.id, 'cor', old.cor, cor_do_feed, null, c_autor, clock_timestamp());
        old.cor := cor_do_feed;
        ficha_mudou := true;
      end if;
    end if;

    -- ------------------------------------------------------------------
    -- Documentos (20260929120000 / 20260929170000), sem mudança.
    -- ------------------------------------------------------------------
    placa_do_feed  := nullif(upper(replace(replace(btrim(new.placa),  '-', ''), ' ', '')), '');
    chassi_do_feed := nullif(upper(replace(replace(btrim(new.chassi), '-', ''), ' ', '')), '');
    -- VIN não usa I, O nem Q (ISO 3779): no chassi, elas são erro de digitação.
    if chassi_do_feed ~ '[IOQ]' then
      chassi_do_feed := null;
    end if;
    motor_do_feed := nullif(btrim(new.motor), '');
    -- `0.0` é como o feed diz que não sabe o motor.
    if motor_do_feed ~ '^0+([.,]0+)?$' then
      motor_do_feed := null;
    end if;

    -- Placa: o feed PREENCHE o vazio, nunca troca — o painel a edita.
    if nullif(btrim(old.placa), '') is null
       and placa_do_feed is not null
       and not exists (
         select 1 from public.estoque_motors o
          where o.placa is not null and btrim(o.placa) <> ''
            and o.id <> old.id
            and upper(replace(replace(btrim(o.placa), '-', ''), ' ', '')) = placa_do_feed
       ) then
      old.placa := placa_do_feed;
    end if;

    -- Chassi: o VÁLIDO segue o feed — o painel não o edita.
    if chassi_do_feed is not null
       and chassi_do_feed is distinct from
           nullif(upper(replace(replace(btrim(old.chassi), '-', ''), ' ', '')), '')
       and not exists (
         select 1 from public.estoque_motors o
          where o.chassi is not null and btrim(o.chassi) <> ''
            and o.id <> old.id
            and upper(replace(replace(btrim(o.chassi), '-', ''), ' ', '')) = chassi_do_feed
       ) then
      old.chassi := chassi_do_feed;
    end if;

    -- Motor: o feed PREENCHE o vazio, nunca troca — o painel o edita.
    if nullif(btrim(old.motor), '') is null and motor_do_feed is not null then
      old.motor := motor_do_feed;
      motor_preenchido := true;
    end if;

    -- A FIPE segue o feed quando ele tem valor. Zero e vazio não apagam.
    if new.valor_fipe > 0 then
      old.valor_fipe := new.valor_fipe;
    end if;

    if nullif(btrim(new.codigo_fipe), '') is not null then
      old.codigo_fipe := btrim(new.codigo_fipe);
    end if;

    -- O lastmod se move quando muda o que a página diz ao comprador: preço,
    -- opcionais, a ficha técnica e o motor preenchido. `last_seen_at`,
    -- `portas`, placa, chassi e FIPE seguem fora da conta.
    if preco_mudou or opcionais_mudou or ficha_mudou or motor_preenchido then
      old.conteudo_atualizado_em := now();
    end if;

    return old;
  end if;

  if new.origem is distinct from old.origem then
    new.origem := old.origem;
  end if;

  return new;
end;
$_$;


--
-- Name: FUNCTION estoque_motors_trava_do_sync(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.estoque_motors_trava_do_sync() IS 'O sync do RevendaMais manda em SEIS colunas — preco, preco_original, preco_promocional, last_seen_at, portas e opcionais —; a FICHA TÉCNICA (quilometragem, ano, ano_fabricacao, cambio, combustivel, cor) segue o feed no carro do feed (nunca no nativo; texto sem espaço nas pontas), registrando cada troca no historico_veiculo como "RevendaMais (sync)" (N/D, ano fora de 1900–2100 e km 0 são "não sei" e não apagam nada); atualiza valor_fipe e codigo_fipe quando manda valor; o CHASSI segue o feed quando é válido (sem I, O nem Q); e PREENCHE placa e motor só quando estão vazios. Marca, modelo e versão continuam barrados (título e URL). Nunca grava documento que já é de outro carro. Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio. Allowlist por construção. Move conteudo_atualizado_em quando muda PREÇO, OPCIONAIS ou a FICHA TÉCNICA, ou quando preenche o MOTOR.';


--
-- Name: fechar_venda_ciclo(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fechar_venda_ciclo(dados jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION fechar_venda_ciclo(dados jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fechar_venda_ciclo(dados jsonb) IS 'Fecha a venda em uma transação: cliente, veículo, KM de saída, plano de revisões e, quando houver, financiamento e contrato do Ciclo. Levanta VENDA_INCOMPLETA com a lista de campos quando falta qualquer obrigatório do manual §3.1. Restrita a staff.';


--
-- Name: financiamento_bancos_validos(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.financiamento_bancos_validos(p text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select coalesce(
           p is not null
           and array_ndims(p) = 1
           and cardinality(p) between 1 and 30
           and not exists (select 1
                             from unnest(p) as b(nome)
                            where b.nome is null
                               or btrim(b.nome, E' \t\r\n') = ''),
           false)
$$;


--
-- Name: FUNCTION financiamento_bancos_validos(p text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.financiamento_bancos_validos(p text[]) IS 'Régua de parametros_financiamento.bancos_parceiros (CHECK parametros_financiamento_bancos_validos): lista de uma dimensão, de 1 a 30 nomes, nenhum nulo, vazio ou só espaço/tab/quebra de linha. Função porque CHECK não aceita subconsulta; IMMUTABLE, só olha o argumento.';


--
-- Name: org_padrao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_padrao() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from public.orgs order by criada_em limit 1
$$;


--
-- Name: FUNCTION org_padrao(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.org_padrao() IS 'O uuid da org Motors — DEFAULT de org_id no núcleo. STABLE: uma leitura por statement.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: parametros_financiamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_financiamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    taxa_excelente_am numeric(5,2) NOT NULL,
    taxa_regular_am numeric(5,2) NOT NULL,
    taxa_risco_am numeric(5,2) NOT NULL,
    ano_de_referencia smallint NOT NULL,
    ano_mais_antigo smallint NOT NULL,
    bancos_parceiros text[] NOT NULL,
    fonte_das_taxas text NOT NULL,
    descricao text,
    criado_por uuid,
    vigencia_desde date DEFAULT CURRENT_DATE NOT NULL,
    vigencia_ate date,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT parametros_financiamento_ano_de_referencia_na_faixa CHECK (((ano_de_referencia >= 2020) AND (ano_de_referencia <= 2100))),
    CONSTRAINT parametros_financiamento_ano_mais_antigo_na_faixa CHECK (((ano_mais_antigo >= 1950) AND (ano_mais_antigo <= ano_de_referencia))),
    CONSTRAINT parametros_financiamento_bancos_validos CHECK (public.financiamento_bancos_validos(bancos_parceiros)),
    CONSTRAINT parametros_financiamento_fonte_preenchida CHECK (((char_length(btrim(fonte_das_taxas, ' 	
'::text)) >= 1) AND (char_length(btrim(fonte_das_taxas, ' 	
'::text)) <= 200))),
    CONSTRAINT parametros_financiamento_taxas_em_ordem CHECK (((taxa_excelente_am <= taxa_regular_am) AND (taxa_regular_am <= taxa_risco_am))),
    CONSTRAINT parametros_financiamento_taxas_na_faixa CHECK (((taxa_excelente_am > (0)::numeric) AND (taxa_excelente_am <= (10)::numeric) AND (taxa_regular_am > (0)::numeric) AND (taxa_regular_am <= (10)::numeric) AND (taxa_risco_am > (0)::numeric) AND (taxa_risco_am <= (10)::numeric))),
    CONSTRAINT parametros_financiamento_vigencia_em_ordem CHECK (((vigencia_ate IS NULL) OR (vigencia_ate >= vigencia_desde)))
);


--
-- Name: TABLE parametros_financiamento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.parametros_financiamento IS 'Condições do simulador de financiamento do site (ficha do carro, /financiamento, Garagem Profiler), como DADO com vigência (2026-09-28): taxas estimadas por perfil, ano de referência da idade do carro, ano mais antigo financiável, bancos parceiros e fonte das taxas. Uma vigente por org (parametros_financiamento_um_vigente); valor vigente não sofre UPDATE (D-T1.7) — a única escrita é financiamento_nova_vigencia, que encerra a vigente e insere a nova na mesma transação, só para admin e financeiro (matriz A17). Staff lê pela RLS; o site lê pela chave de serviço; anon nada.';


--
-- Name: COLUMN parametros_financiamento.taxa_excelente_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.taxa_excelente_am IS 'Taxa estimada do perfil bom, em % AO MÊS (1.79 = 1,79% a.m.; quem lê divide por 100). Seed: 1º quartil das 18 instituições do Banco Central, jul–set/2026.';


--
-- Name: COLUMN parametros_financiamento.taxa_regular_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.taxa_regular_am IS 'Taxa estimada do perfil regular, em % ao mês. Seed: mediana das 18 instituições do Banco Central, jul–set/2026.';


--
-- Name: COLUMN parametros_financiamento.taxa_risco_am; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.taxa_risco_am IS 'Taxa estimada do perfil de risco, em % ao mês. Seed: 3º quartil das 18 instituições do Banco Central, jul–set/2026. Excelente ≤ regular ≤ risco (CHECK parametros_financiamento_taxas_em_ordem).';


--
-- Name: COLUMN parametros_financiamento.ano_de_referencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.ano_de_referencia IS 'Ano contra o qual a idade do carro é medida (idade = ano_de_referencia − ano do carro). NÃO é o ano do relógio: se fosse, em 1º de janeiro todo carro envelheceria e as parcelas subiriam sozinhas. Muda junto com as taxas, numa vigência nova.';


--
-- Name: COLUMN parametros_financiamento.ano_mais_antigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.ano_mais_antigo IS 'Carro com ano MENOR que este não recebe estimativa de parcela ("sem estimativa"). 2009 por decisão do dono em 2026-09-28: "temos bancos parceiros que parcelam carros até 2009, abaixo disso muito difícil".';


--
-- Name: COLUMN parametros_financiamento.bancos_parceiros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.bancos_parceiros IS 'Agentes financiadores citados no texto de crédito, na ordem de exibição. Só nomes: o "entre outros" é da tela. 1 a 30, sem vazio (CHECK parametros_financiamento_bancos_validos); a função apara e tira repetidos.';


--
-- Name: COLUMN parametros_financiamento.fonte_das_taxas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.fonte_das_taxas IS 'De onde as taxas saíram, como vai na tela ("Parcela estimada pela <fonte>"). 1 a 200 caracteres aparada (CHECK parametros_financiamento_fonte_preenchida).';


--
-- Name: COLUMN parametros_financiamento.descricao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.descricao IS 'Nota livre de quem abriu a vigência: o que mudou e por quê.';


--
-- Name: COLUMN parametros_financiamento.criado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_financiamento.criado_por IS 'Quem abriu a vigência: auth.uid() carimbado por financiamento_nova_vigencia, nunca declarado pelo corpo. Nulo só na semente da migração. Sem FK de propósito: on delete set null seria UPDATE, que o guarda D-T1.7 recusa.';


--
-- Name: financiamento_nova_vigencia(numeric, numeric, numeric, integer, integer, text[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.financiamento_nova_vigencia(p_taxa_excelente_am numeric, p_taxa_regular_am numeric, p_taxa_risco_am numeric, p_ano_de_referencia integer, p_ano_mais_antigo integer, p_bancos_parceiros text[], p_fonte_das_taxas text, p_descricao text DEFAULT NULL::text) RETURNS public.parametros_financiamento
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_quem     uuid := auth.uid();
  v_bancos   text[];
  v_vigente  uuid;
  v_nova     public.parametros_financiamento;
begin
  if v_quem is null then
    raise exception 'Nova vigência das condições de financiamento sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;
  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'financeiro')) then
    raise exception 'Só Administrador ou Financeiro mudam as condições de financiamento (matriz A17, "Editar texto legal e condições de financiamento").'
      using errcode = '42501';
  end if;
  select coalesce(array_agg(nome order by primeira), '{}')
    into v_bancos
    from (select btrim(x, E' \t\r\n') as nome, min(n) as primeira
            from unnest(p_bancos_parceiros) with ordinality as u(x, n)
           where btrim(x, E' \t\r\n') <> ''
           group by btrim(x, E' \t\r\n')) s;
  select id into v_vigente
    from public.parametros_financiamento
   where org_id = public.org_padrao()
     and vigencia_ate is null
   for update;
  if found then
    update public.parametros_financiamento
       set vigencia_ate = current_date
     where id = v_vigente;
  end if;
  insert into public.parametros_financiamento
    (taxa_excelente_am, taxa_regular_am, taxa_risco_am,
     ano_de_referencia, ano_mais_antigo, bancos_parceiros,
     fonte_das_taxas, descricao, criado_por, vigencia_desde)
  values
    (p_taxa_excelente_am, p_taxa_regular_am, p_taxa_risco_am,
     p_ano_de_referencia, p_ano_mais_antigo, v_bancos,
     btrim(p_fonte_das_taxas, E' \t\r\n'),
     nullif(btrim(p_descricao, E' \t\r\n'), ''),
     v_quem, current_date)
  returning * into v_nova;
  return v_nova;
end;
$$;


--
-- Name: FUNCTION financiamento_nova_vigencia(p_taxa_excelente_am numeric, p_taxa_regular_am numeric, p_taxa_risco_am numeric, p_ano_de_referencia integer, p_ano_mais_antigo integer, p_bancos_parceiros text[], p_fonte_das_taxas text, p_descricao text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.financiamento_nova_vigencia(p_taxa_excelente_am numeric, p_taxa_regular_am numeric, p_taxa_risco_am numeric, p_ano_de_referencia integer, p_ano_mais_antigo integer, p_bancos_parceiros text[], p_fonte_das_taxas text, p_descricao text) IS 'Única escrita de parametros_financiamento. Exige sessão (auth.uid()) e papel admin ou financeiro (matriz A17) — senão 42501. Apara os bancos, tira vazios e repetidos mantendo a ordem; trava a vigente, encerra com vigencia_ate = hoje e insere a nova com vigencia_desde = hoje e criado_por = auth.uid(), na mesma transação. Sem vigente, só insere. Devolve a linha nova.';


--
-- Name: funil_exige_desfecho(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.funil_exige_desfecho() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.funil_etapas where tipo = 'ganho'   and ativa) then
    raise exception
      'O funil precisa de ao menos uma etapa de GANHO ativa — sem ela não há '
      'onde registrar venda fechada.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.funil_etapas where tipo = 'perdido' and ativa) then
    raise exception
      'O funil precisa de ao menos uma etapa de PERDIDO ativa — sem ela o '
      'motivo da perda deixa de ser coletado e o relatório seca em silêncio.'
      using errcode = 'check_violation';
  end if;
  return null;
end $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name, role, papeis)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    case
      when new.raw_app_meta_data->>'role'
           in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor')
        then new.raw_app_meta_data->>'role'
      else 'cliente'
    end,
    case
      when new.raw_app_meta_data->>'role'
           in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor')
        then array[new.raw_app_meta_data->>'role']
      else array['cliente']
    end
  );
  return new;
end;
$$;


--
-- Name: has_finance_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_finance_access(user_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'gestor', 'financeiro']
  );
$$;


--
-- Name: FUNCTION has_finance_access(user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_finance_access(user_id uuid) IS 'Quem abre o financeiro: admin, gestor ou financeiro, por `papeis` (multi-papel). O gestor foi reposto em 2026-08-22 — uma migração paralela o havia removido sem intenção.';


--
-- Name: interesse_por_veiculo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.interesse_por_veiculo() RETURNS TABLE(veiculo_id bigint, veiculo_rotulo text, no_estoque boolean, vendido boolean, preco_atual numeric, total integer, em_avaliacao integer, sem_resolucao integer, escolhido integer, descartado integer, motivo_principal text, motivos jsonb, ultimo_interesse_em timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_column
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'O interesse por veículo é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with linhas as (
    select v.veiculo_id as carro, v.veiculo_rotulo as rotulo, v.situacao,
           v.motivo_descarte, v.criado_em,
           (l.desfecho is not null) as lead_encerrado
      from public.leads_veiculos v
      join public.leads l on l.id = v.lead_id
     where v.org_id = public.org_padrao()
  ),
  por_carro as (
    select x.carro,
           count(*)::integer                                                    as n_total,
           (count(*) filter (where x.situacao = 'em_avaliacao'))::integer       as n_aval,
           (count(*) filter (where x.situacao = 'em_avaliacao'
                               and x.lead_encerrado))::integer                  as n_sem,
           (count(*) filter (where x.situacao = 'escolhido'))::integer          as n_esc,
           (count(*) filter (where x.situacao = 'descartado'))::integer         as n_desc,
           max(x.criado_em)                                                     as ultimo,
           (array_agg(x.rotulo order by x.criado_em desc))[1]                   as rotulo
      from linhas x
     group by x.carro
  ),
  motivos_por_carro as (
    select m.carro,
           jsonb_agg(jsonb_build_object('motivo', m.motivo_descarte, 'total', m.n)
                     order by m.n desc, m.motivo_descarte)                      as lista,
           (array_agg(m.motivo_descarte order by m.n desc, m.motivo_descarte))[1] as principal
      from (select y.carro, y.motivo_descarte, count(*)::integer as n
              from linhas y
             where y.situacao = 'descartado'
             group by y.carro, y.motivo_descarte) m
     group by m.carro
  )
  select coalesce(e.id, c.carro),
         coalesce(public.rotulo_de_veiculo(e.marca, e.modelo, e.versao, e.ano),
                  c.rotulo,
                  'Veículo nº ' || coalesce(e.id, c.carro)),
         e.id is not null,
         case when e.id is not null then coalesce(e.vendido, false) end,
         e.preco,
         coalesce(c.n_total, 0),
         coalesce(c.n_aval, 0),
         coalesce(c.n_sem, 0),
         coalesce(c.n_esc, 0),
         coalesce(c.n_desc, 0),
         mc.principal,
         coalesce(mc.lista, '[]'::jsonb),
         c.ultimo
    from public.estoque_motors e
    full join por_carro c on c.carro = e.id
    left join motivos_por_carro mc on mc.carro = coalesce(e.id, c.carro)
   order by coalesce(c.n_total, 0) desc, c.ultimo desc nulls last, coalesce(e.id, c.carro);
end;
$$;


--
-- Name: FUNCTION interesse_por_veiculo(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.interesse_por_veiculo() IS 'O ranking: uma linha por carro do estoque (com ou sem interesse) MAIS os carros que já saíram do estoque e têm histórico (no_estoque = false, vendido e preco_atual nulos, rótulo do retrato). Contagens como no resumo; motivo_principal é o descarte mais citado. Ordenado do mais considerado ao menos. Só agregados. Restrito à equipe ativa.';


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and 'admin' = any(papeis)
  );
$$;


--
-- Name: FUNCTION is_admin(user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_admin(user_id uuid) IS 'É admin e está ativo. Desde 2026-08-21 olha `papeis`, não `role` — quem tem admin como papel secundário era negado em silêncio. Versionada pela primeira vez nesta data; antes vivia só no bootstrap.';


--
-- Name: is_staff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff(user_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr']
  );
$$;


--
-- Name: FUNCTION is_staff(user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_staff(user_id uuid) IS 'Tem ALGUM papel de painel (admin/gestor/comercial/financeiro/marketing/sdr) e está ativo. `cliente` (Garagem) e `investidor` são authenticated, mas nunca staff por isso sozinhos. O SDR entrou em 2026-09-23.';


--
-- Name: km_estimado(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.km_estimado(p_vv uuid, p_data date) RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with extremos as (
    select
      (select km  from public.leituras_odometro
        where veiculo_vendido_id = p_vv order by registrada_em, km limit 1)          as km_ini,
      (select registrada_em::date from public.leituras_odometro
        where veiculo_vendido_id = p_vv order by registrada_em, km limit 1)          as dia_ini,
      (select km  from public.leituras_odometro
        where veiculo_vendido_id = p_vv order by registrada_em desc, km desc limit 1) as km_fim,
      (select registrada_em::date from public.leituras_odometro
        where veiculo_vendido_id = p_vv order by registrada_em desc, km desc limit 1) as dia_fim
  )
  select case
           when km_fim is null                then null
           when dia_fim <= dia_ini            then km_fim
           when km_fim  <= km_ini             then km_fim
           else km_fim + (
             ((km_fim - km_ini)::numeric / (dia_fim - dia_ini))
             * greatest(p_data - dia_fim, 0)
           )::int
         end
    from extremos;
$$;


--
-- Name: FUNCTION km_estimado(p_vv uuid, p_data date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.km_estimado(p_vv uuid, p_data date) IS 'KM projetado pela média do próprio veículo, a partir de leituras_odometro. Serve só para ANTECIPAR o lembrete de revisão (§4.2, "KM −800"). Nunca entra em conformidade nem em índice: estimativa não penaliza ninguém.';


--
-- Name: leads_antes_de_atualizar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leads_antes_de_atualizar() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_tipo   text;
  v_humano boolean := auth.uid() is not null;
begin
  if new.situacao is distinct from old.situacao then
    new.ultimo_movimento_em := now();

    select tipo into v_tipo from public.funil_etapas where chave = new.situacao;

    if v_tipo in ('ganho', 'perdido', 'descartado') then
      -- A etapa terminal carimba o desfecho na hora. O MOTIVO continua vazio
      -- de propósito: quem escolhe é a pessoa, na tela.
      if new.desfecho is distinct from v_tipo then
        new.desfecho    := v_tipo;
        new.desfecho_em := now();
      end if;
    elsif old.desfecho is not null and new.desfecho is not distinct from old.desfecho then
      -- Voltou para o funil: o negócio reabriu. Vale igual para o descarte —
      -- spam marcado por engano volta a ser lead, e não pode arrastar o
      -- carimbo antigo.
      new.desfecho        := null;
      new.desfecho_em     := null;
      new.desfecho_motivo := null;
      new.desfecho_valor  := null;
      new.desfecho_nota   := null;
    end if;
  end if;

  if new.responsavel is distinct from old.responsavel then
    new.responsavel_anterior := old.responsavel;
    new.responsavel_desde    := now();
  end if;

  if v_humano and (
       new.situacao    is distinct from old.situacao
    or new.responsavel is distinct from old.responsavel
    or new.observacoes is distinct from old.observacoes
    or new.desfecho    is distinct from old.desfecho
    -- 2026-09-23: combinar o próximo passo é atender.
    or new.proximo_passo_definido_em is distinct from old.proximo_passo_definido_em
  ) then
    new.ultimo_contato_em := now();
    new.alertado_em := null;
  end if;

  new.atualizado_em := now();
  return new;
end $$;


--
-- Name: leads_credito_do_resgate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leads_credito_do_resgate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_ultimo_credito timestamptz;
  v_parado         boolean;
  v_reaberto       boolean;
begin
  -- Sem sessão é o motor (o rodízio): não é trabalho de ninguém.
  if auth.uid() is null then
    return new;
  end if;

  -- Tirar o dono não é passar o lead. E o lead que continua fechado depois da
  -- passagem não voltou ao jogo: resgate é lead aberto nas mãos do Comercial.
  if nullif(trim(coalesce(new.responsavel, '')), '') is null or new.desfecho is not null then
    return new;
  end if;

  -- Só quem é SDR — e não também Comercial (decisão do dono, 25/09: *"só quem
  -- é SDR mesmo"*). O Comercial com papel de SDR passando para um colega é o
  -- Comercial trabalhando, não resgate.
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and 'sdr' = any (p.papeis)
       and not ('comercial' = any (p.papeis))
  ) then
    return new;
  end if;

  -- Passar é dar o lead ao Comercial ativo — a régua de `recebeLead` e do
  -- rodízio. Nome de ninguém, ou de quem não recebe lead, não é passagem.
  if not exists (
    select 1 from public.profiles c
     where c.is_active
       and 'comercial' = any (c.papeis)
       and nullif(trim(c.full_name), '') = trim(new.responsavel)
  ) then
    return new;
  end if;

  -- Só o lead PARADO ou REABERTO (decisão do dono, 25/09). Medido pelo que o
  -- rastro guardou DESDE A ÚLTIMA PASSAGEM CREDITADA deste lead — e não pelo
  -- relógio de agora: o trabalho do SDR é justamente reaquecer a conversa, e
  -- cada resposta dele no Chatwoot, anotação ou troca de etapa zera o relógio.
  -- Na hora de passar, o lead resgatado quase nunca "está" parado; ele ESTEVE.
  -- "Desde a última" faz o mesmo esfriamento contar uma vez só: o SDR que
  -- passa A→B→A não ganha três.
  select max(e.criado_em) into v_ultimo_credito
    from public.leads_eventos e
   where e.lead_id = new.id
     and e.tipo = 'etiqueta'
     and e.detalhe->>'origem' = 'passagem_do_sdr';

  -- Parado: o motor deu o lead como parado — avisou (estagnação, atribuição,
  -- transferência) ou transferiu. É a mesma régua do motor, lida do que ele
  -- fez, e não recalculada aqui.
  v_parado := exists (
    select 1 from public.leads_eventos e
     where e.lead_id = new.id
       and e.automatico
       and e.tipo in ('alerta', 'transferencia')
       and (v_ultimo_credito is null or e.criado_em > v_ultimo_credito)
  );

  -- Reaberto: voltou de uma etapa terminal (ganho, perdido, descarte) para o
  -- funil — antes da passagem, ou junto com ela, no mesmo UPDATE.
  v_reaberto := (old.desfecho is not null and new.desfecho is null) or exists (
    select 1
      from public.leads_eventos e
      join public.funil_etapas de   on de.chave   = e.de
      join public.funil_etapas para on para.chave = e.para
     where e.lead_id = new.id
       and e.tipo = 'etapa'
       and de.tipo <> 'aberta'
       and para.tipo = 'aberta'
       and (v_ultimo_credito is null or e.criado_em > v_ultimo_credito)
  );

  if not (v_parado or v_reaberto) then
    return new;
  end if;

  insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico, detalhe, criado_em)
  values (
    new.id, 'etiqueta', null, 'resgate, reaquecido',
    -- Autor nulo, neste rastro, quer dizer "o motor". SDR sem nome no perfil
    -- não pode virar motor: fica o começo do id, e o id inteiro no detalhe.
    coalesce(public.autor_atual(), 'SDR ' || left(auth.uid()::text, 8)), false,
    jsonb_build_object(
      'origem',           'passagem_do_sdr',
      'sdr_id',           auth.uid(),
      'etiquetas',        jsonb_build_array('resgate', 'reaquecido'),
      'motivos',          to_jsonb(array_remove(array[
                            case when v_parado   then 'parado'   end,
                            case when v_reaberto then 'reaberto' end], null)),
      'responsavel_de',   old.responsavel,
      'responsavel_para', new.responsavel
    ),
    -- O relógio de PAREDE, e não o da transação: "desde a última passagem
    -- creditada" compara este carimbo com os eventos seguintes, e duas
    -- passagens na mesma transação (o aceite abaixo) teriam o mesmo `now()`.
    clock_timestamp()
  );

  return new;
end $$;


--
-- Name: FUNCTION leads_credito_do_resgate(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.leads_credito_do_resgate() IS 'O crédito do SDR (2026-09-25): quando uma sessão de SDR (sem papel comercial) passa para alguém do Comercial ativo um lead que, desde a última passagem creditada, o motor deu como parado ou que foi reaberto, o rastro ganha um evento ''etiqueta'' com origem passagem_do_sdr, as etiquetas resgate e reaquecido, os motivos e o sdr_id. Medir por lead distinto.';


--
-- Name: leads_registrar_no_rastro(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leads_registrar_no_rastro() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_autor    text    := public.autor_atual();
  v_auto     boolean := auth.uid() is null;
begin
  if tg_op = 'INSERT' then
    insert into public.leads_eventos (lead_id, tipo, para, autor, automatico, detalhe)
    values (new.id, 'entrada', new.situacao, v_autor, v_auto,
            jsonb_build_object('canal', new.canal, 'interesse', new.interesse));
    return new;
  end if;

  if new.situacao is distinct from old.situacao then
    insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico)
    values (new.id, 'etapa', old.situacao, new.situacao, v_autor, v_auto);
  end if;

  if new.responsavel is distinct from old.responsavel then
    insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico)
    values (new.id,
            case when v_auto then 'transferencia' else 'responsavel' end,
            old.responsavel, new.responsavel, v_autor, v_auto);
  end if;

  if new.desfecho is distinct from old.desfecho
     or new.desfecho_motivo is distinct from old.desfecho_motivo then
    insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico, detalhe)
    values (new.id, 'desfecho', old.desfecho, new.desfecho, v_autor, v_auto,
            jsonb_build_object('motivo', new.desfecho_motivo,
                               'valor',  new.desfecho_valor,
                               'nota',   new.desfecho_nota));
  end if;

  return new;
end $$;


--
-- Name: leads_veiculos_carimbar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leads_veiculos_carimbar() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_sessao boolean := auth.uid() is not null;
  v_autor  text;
  v_carro  record;
begin
  if v_sessao then
    v_autor := public.autor_atual();
  end if;

  if tg_op = 'INSERT' then
    select e.marca, e.modelo, e.versao, e.ano, e.preco
      into v_carro
      from public.estoque_motors e
     where e.id = new.veiculo_id;

    if found then
      if nullif(btrim(new.veiculo_rotulo), '') is null then
        new.veiculo_rotulo := coalesce(
          public.rotulo_de_veiculo(v_carro.marca, v_carro.modelo, v_carro.versao, v_carro.ano),
          'Veículo nº ' || new.veiculo_id);
      end if;
      if v_sessao or new.veiculo_preco is null then
        new.veiculo_preco := v_carro.preco;
      end if;
    elsif v_sessao then
      raise exception
        'O veículo % não está no estoque: só entra como opção do lead um carro que existe.',
        new.veiculo_id
        using errcode = 'foreign_key_violation',
              constraint = 'leads_veiculos_veiculo_no_estoque';
    end if;

    if v_sessao then
      new.criado_em      := now();
      new.adicionado_por := v_autor;
      if new.situacao = 'em_avaliacao' then
        new.resolvido_em  := null;
        new.resolvido_por := null;
      else
        new.resolvido_em  := now();
        new.resolvido_por := v_autor;
      end if;
    elsif new.situacao is distinct from 'em_avaliacao' then
      new.resolvido_em := coalesce(new.resolvido_em, now());
    end if;

    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if new.lead_id is distinct from old.lead_id
     or new.veiculo_id is distinct from old.veiculo_id then
    raise exception
      'A opção não troca de lead nem de carro: adicione o outro carro e descarte este.'
      using errcode = 'check_violation',
            constraint = 'leads_veiculos_par_imutavel';
  end if;

  if v_sessao then
    new.org_id         := old.org_id;
    new.criado_em      := old.criado_em;
    new.adicionado_por := old.adicionado_por;
    new.veiculo_rotulo := old.veiculo_rotulo;
    new.veiculo_preco  := old.veiculo_preco;
  end if;

  if new.situacao is distinct from old.situacao then
    if new.situacao = 'em_avaliacao' then
      new.resolvido_em  := null;
      new.resolvido_por := null;
    elsif v_sessao then
      new.resolvido_em  := now();
      new.resolvido_por := v_autor;
    else
      -- Sem sessão: vale o que foi informado; sem nada informado, agora.
      if new.resolvido_em is not distinct from old.resolvido_em then
        new.resolvido_em := now();
      end if;
      if new.resolvido_por is not distinct from old.resolvido_por then
        new.resolvido_por := null;
      end if;
    end if;
  elsif v_sessao then
    new.resolvido_em  := old.resolvido_em;
    new.resolvido_por := old.resolvido_por;
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION leads_veiculos_carimbar(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.leads_veiculos_carimbar() IS 'Gatilho de leads_veiculos: com sessão, carimba adicionado_por/criado_em na inclusão (e os congela), copia rótulo e preço do estoque, recusa carro que não existe e carimba resolvido_por/resolvido_em quando a situação muda. Sem sessão aceita o informado. A linha nunca troca de lead nem de carro. Não escreve em leads nem em estoque_motors.';


--
-- Name: limpar_erros_antigos(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limpar_erros_antigos(dias integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_apagadas integer;
begin
  if dias is null or dias < 7 then
    raise exception
      'RETENCAO_CURTA_DEMAIS: limpar_erros_antigos exige dias >= 7 (recebeu %). Com 0 isto seria um TRUNCATE.',
      coalesce(dias::text, 'null')
      using errcode = 'invalid_parameter_value';
  end if;

  delete from public.erros
   where criado_em < now() - (dias || ' days')::interval;

  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;


--
-- Name: FUNCTION limpar_erros_antigos(dias integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.limpar_erros_antigos(dias integer) IS 'Retenção de 90 dias da fila de erros (spec §12): apaga o que passou de `dias` e devolve quantas linhas saíram. Recusa `dias < 7` — a segunda camada da promessa de PII depende de esta rotina rodar, e um zero digitado errado apagaria a prova em vez de expirá-la. Chamada pelo n8n; só a chave de serviço executa.';


--
-- Name: marcar_conteudo_atualizado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_conteudo_atualizado() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if (
       new.marca             is distinct from old.marca             or
       new.modelo            is distinct from old.modelo            or
       new.versao            is distinct from old.versao            or
       new.ano               is distinct from old.ano               or
       new.ano_fabricacao    is distinct from old.ano_fabricacao    or
       new.quilometragem     is distinct from old.quilometragem     or
       new.cambio            is distinct from old.cambio            or
       new.combustivel       is distinct from old.combustivel       or
       new.cor               is distinct from old.cor               or
       new.preco             is distinct from old.preco             or
       new.preco_original    is distinct from old.preco_original    or
       new.preco_promocional is distinct from old.preco_promocional or
       new.url_imagem        is distinct from old.url_imagem        or
       new.whatsapp_images   is distinct from old.whatsapp_images   or
       new.web_full_images   is distinct from old.web_full_images   or
       new.pericia           is distinct from old.pericia           or
       new.descricao         is distinct from old.descricao         or
       new.descricao_seo     is distinct from old.descricao_seo     or
       new.laudo_pericia     is distinct from old.laudo_pericia     or
       new.opcionais         is distinct from old.opcionais         or
       new.tipo              is distinct from old.tipo              or
       new.status_tag        is distinct from old.status_tag        or
       new.vendido           is distinct from old.vendido           or
       new.motor             is distinct from old.motor             or
       new.cor_interna       is distinct from old.cor_interna       or
       new.donos_anteriores  is distinct from old.donos_anteriores  or
       new.garantia_fabrica  is distinct from old.garantia_fabrica
     ) then
    new.conteudo_atualizado_em := now();
  else
    -- Preserva o carimbo antigo E descarta o valor que o cliente tenha mandado
    -- na coluna: quem decide aqui é o banco. Ver a migração anterior.
    new.conteudo_atualizado_em := old.conteudo_atualizado_em;
  end if;

  return new;
end;
$$;


--
-- Name: marcar_vendedor_da_sessao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_vendedor_da_sessao() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.vendedor_id := coalesce(new.vendedor_id, auth.uid());
  return new;
end;
$$;


--
-- Name: marketing_desfazer_importacao(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketing_desfazer_importacao(p_importacao uuid) RETURNS TABLE(contatos_removidos integer, registros_removidos integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_contatos   integer;
  v_registros  integer;
begin
  -- A linha travada: um lote atrasado da mesma importação espera, e depois
  -- não acha mais a importação (e levanta erro, sem gravar órfão).
  perform 1 from public.marketing_importacoes i where i.id = p_importacao for update;

  -- Conta antes de apagar: depois, o cascade já levou tudo.
  select count(*) into v_contatos
    from public.marketing_contatos c
   where c.importacao_id = p_importacao;
  select count(*) into v_registros
    from public.marketing_interesses r
   where r.importacao_id = p_importacao
      or r.contato_id in (select c.id from public.marketing_contatos c
                           where c.importacao_id = p_importacao);

  delete from public.marketing_importacoes i where i.id = p_importacao;

  return query select v_contatos, v_registros;
end;
$$;


--
-- Name: FUNCTION marketing_desfazer_importacao(p_importacao uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.marketing_desfazer_importacao(p_importacao uuid) IS 'Desfaz uma importação da base de marketing: apaga a linha dela, e o ON DELETE CASCADE leva (1) os registros que ela gravou, (2) os contatos que ELA criou e, com cada contato, (3) os registros que OUTRAS importações penduraram nele e (4) os envios de SMS feitos a ele (sms_envios.contato_id). NÃO desfaz a fusão: o contato que já existia e foi enriquecido por ela (virou cliente, ganhou canal ou data) continua como ficou. O pedido de saída (sms_descadastros) não é tocado. Devolve quantos contatos e quantos registros foram embora, contados antes de apagar (os registros de (1) e de (3)). Importação inexistente devolve 0 e 0, sem erro. Só service_role executa.';


--
-- Name: marketing_importar_lote(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketing_importar_lote(p_importacao uuid, p_contatos jsonb) RETURNS TABLE(contatos_novos integer, contatos_atualizados integer, registros_novos integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_org    uuid;
  v_novos  integer := 0;
  v_atual  integer := 0;
  v_reg    integer := 0;
begin
  -- A importação tem de existir, e a linha dela fica travada até o fim: dois
  -- lotes da mesma importação ao mesmo tempo entram em fila, e os contadores
  -- somam certo. A org dos contatos é a da importação.
  select i.org_id into v_org
    from public.marketing_importacoes i
   where i.id = p_importacao
     for update;
  if not found then
    raise exception 'marketing_importar_lote: a importação % não existe', p_importacao
      using errcode = 'no_data_found';
  end if;
  if p_contatos is null or jsonb_typeof(p_contatos) <> 'array' then
    raise exception 'marketing_importar_lote: p_contatos tem de ser um array JSON'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Uma instrução só: ou o lote entra inteiro, ou não entra.
  with
  -- Os elementos com celular válido. O resto (fixo, número torto, elemento que
  -- não é objeto) é ignorado, e não derruba o lote.
  elem as materialized (
    select t.ord, t.e, t.e->>'telefone' as telefone
      from jsonb_array_elements(p_contatos) with ordinality as t(e, ord)
     where jsonb_typeof(t.e) = 'object'
       and (t.e->>'telefone') ~ '^55[1-9][0-9]9[0-9]{8}$'
  ),
  reg as materialized (
    select el.telefone, el.ord, r.o,
           nullif(btrim(r.r->>'origem_id'), '')              as origem_id,
           r.r->>'tipo'                                      as tipo,
           nullif(r.r->>'veiculo_id', '')::bigint            as veiculo_id,
           nullif(btrim(r.r->>'marca'), '')                  as marca,
           nullif(btrim(r.r->>'modelo'), '')                 as modelo,
           nullif(btrim(r.r->>'placa'), '')                  as placa,
           nullif(btrim(r.r->>'canal'), '')                  as canal,
           nullif(btrim(r.r->>'marcador'), '')               as marcador,
           nullif(r.r->>'ocorreu_em', '')::timestamptz       as ocorreu_em
      from elem el
     cross join lateral jsonb_array_elements(
                  case when jsonb_typeof(el.e->'registros') = 'array'
                       then el.e->'registros' else '[]'::jsonb end)
                with ordinality as r(r, o)
     where jsonb_typeof(r.r) = 'object'
  ),
  -- Os canais de cada pessoa no lote, sem repetir, na ordem em que aparecem.
  canal_lote as (
    select el.telefone, btrim(c.canal) as canal, min(array[el.ord, c.o]) as pos
      from elem el
     cross join lateral jsonb_array_elements_text(
                  case when jsonb_typeof(el.e->'canais') = 'array'
                       then el.e->'canais' else '[]'::jsonb end)
                with ordinality as c(canal, o)
     where btrim(c.canal) <> ''
     group by el.telefone, btrim(c.canal)
  ),
  datas as (
    select r.telefone,
           min(r.ocorreu_em)        as menor,
           max(r.ocorreu_em)        as maior,
           bool_or(r.tipo = 'compra') as comprou
      from reg r
     group by r.telefone
  ),
  -- Uma linha por celular. O mesmo celular duas vezes no lote é fundido aqui,
  -- pela mesma regra da fusão com o banco: o `on conflict do update` não
  -- aceita tocar a mesma linha duas vezes numa instrução.
  pessoa as (
    select el.telefone,
           (array_agg(nullif(btrim(el.e->>'nome'), '') order by el.ord)
              filter (where nullif(btrim(el.e->>'nome'), '') is not null))[1]   as nome,
           (array_agg(nullif(btrim(el.e->>'email'), '') order by el.ord)
              filter (where nullif(btrim(el.e->>'email'), '') is not null))[1]  as email,
           coalesce(bool_or(el.e->'cliente' = 'true'::jsonb), false)           as cliente,
           max(nullif(el.e->>'comprou_em', '')::timestamptz)                    as comprou_em,
           coalesce(bool_or(el.e->'sem_interesse' = 'true'::jsonb), false)     as sem_interesse,
           min(nullif(el.e->>'primeiro_em', '')::timestamptz)                   as primeiro_em,
           max(nullif(el.e->>'ultimo_em', '')::timestamptz)                     as ultimo_em
      from elem el
     group by el.telefone
  ),
  pronto as (
    select p.telefone, p.nome, p.email,
           -- Cliente é quem veio marcado, quem tem data de compra, ou quem
           -- traz um registro de compra.
           (p.cliente or p.comprou_em is not null or coalesce(d.comprou, false)) as cliente,
           p.comprou_em, p.sem_interesse,
           coalesce((select array_agg(c.canal order by c.pos)
                       from canal_lote c where c.telefone = p.telefone), '{}') as canais,
           -- As datas dos registros também são contato. `least` e `greatest`
           -- ignoram nulo; a data que faltou no registro (e vira now() lá
           -- embaixo) NÃO conta: importar hoje não é ter falado com a pessoa hoje.
           least(p.primeiro_em, p.ultimo_em, d.menor)     as primeiro_em,
           greatest(p.primeiro_em, p.ultimo_em, d.maior)  as ultimo_em,
           exists (select 1 from public.marketing_contatos x
                    where x.org_id = v_org and x.telefone = p.telefone) as ja_existia
      from pessoa p
      left join datas d on d.telefone = p.telefone
  ),
  gravado as (
    insert into public.marketing_contatos as c
      (org_id, telefone, nome, email, cliente, comprou_em, sem_interesse, canais,
       primeiro_contato_em, ultimo_contato_em, importacao_id)
    select v_org, n.telefone, n.nome, n.email, n.cliente, n.comprou_em, n.sem_interesse, n.canais,
           n.primeiro_em, n.ultimo_em, p_importacao
      from pronto n
    on conflict (org_id, telefone) do update
       set nome                = coalesce(c.nome, excluded.nome),
           email               = coalesce(c.email, excluded.email),
           cliente             = c.cliente or excluded.cliente,
           comprou_em          = greatest(c.comprou_em, excluded.comprou_em),
           sem_interesse       = c.sem_interesse or excluded.sem_interesse,
           canais              = c.canais || array(select u.canal
                                                    from unnest(excluded.canais) with ordinality as u(canal, o)
                                                   where u.canal <> all (c.canais)
                                                   order by u.o),
           primeiro_contato_em = least(c.primeiro_contato_em, excluded.primeiro_contato_em),
           ultimo_contato_em   = greatest(c.ultimo_contato_em, excluded.ultimo_contato_em),
           atualizado_em       = now()
           -- importacao_id fica: é de quem CRIOU o contato.
    returning c.id, c.telefone
  ),
  registrado as (
    insert into public.marketing_interesses
      (org_id, contato_id, importacao_id, origem_id, tipo, veiculo_id, marca, modelo, placa,
       canal, marcador, ocorreu_em)
    select v_org, g.id, p_importacao, r.origem_id, r.tipo, r.veiculo_id, r.marca, r.modelo, r.placa,
           r.canal, r.marcador, coalesce(r.ocorreu_em, now())
      from reg r
      join gravado g on g.telefone = r.telefone
           -- Sem id na origem e sem data: o now() de cada importação é outro,
           -- e o índice único não reconheceria a repetição. Fica de fora
           -- quando a pessoa já tem registro sem origem do mesmo tipo e carro.
     where not (r.origem_id is null
                and r.ocorreu_em is null
                and exists (select 1 from public.marketing_interesses x
                             where x.contato_id = g.id
                               and x.origem_id is null
                               and x.tipo = r.tipo
                               and coalesce(x.veiculo_id, 0) = coalesce(r.veiculo_id, 0)
                               and coalesce(lower(x.marca), '') = coalesce(lower(r.marca), '')
                               and coalesce(lower(x.modelo), '') = coalesce(lower(r.modelo), '')))
     order by r.ord, r.o
    on conflict do nothing
    returning 1
  )
  select (select count(*) from pronto n where not n.ja_existia),
         (select count(*) from pronto n where n.ja_existia),
         (select count(*) from registrado)
    into v_novos, v_atual, v_reg;

  update public.marketing_importacoes i
     set contatos_novos       = i.contatos_novos + v_novos,
         contatos_atualizados = i.contatos_atualizados + v_atual,
         registros_novos      = i.registros_novos + v_reg
   where i.id = p_importacao;

  return query select v_novos, v_atual, v_reg;
end;
$_$;


--
-- Name: FUNCTION marketing_importar_lote(p_importacao uuid, p_contatos jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.marketing_importar_lote(p_importacao uuid, p_contatos jsonb) IS 'Grava um lote de pessoas da base de marketing (até 400 por chamada, com folga) numa instrução só. p_contatos é um array JSON; cada elemento: {telefone, nome, email, cliente, comprou_em, sem_interesse, canais[], primeiro_em, ultimo_em, registros[{origem_id, tipo, veiculo_id, marca, modelo, placa, canal, marcador, ocorreu_em}]}. Celular novo vira contato; celular que já existe é FUNDIDO: nome e e-mail ficam os antigos (o novo só preenche vazio), cliente e sem_interesse são antigo OU novo, comprou_em é o mais recente, canais se unem sem repetir, primeiro e último contato são o menor e o maior (contando as datas dos registros). Registro repetido não entra (ver os dois índices únicos de marketing_interesses). Elemento com telefone fora do formato é ignorado; qualquer outro dado inválido (tipo, placa, data) recusa o lote INTEIRO, sem gravar nada. Importação inexistente levanta erro (P0002). Soma os três contadores na linha da importação e os devolve; contatos_atualizados conta quem já existia, tenha mudado ou não. Só service_role executa.';


--
-- Name: marketing_resumo_da_base(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marketing_resumo_da_base() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with c as (
    select k.id, k.cliente, k.comprou_em, k.sem_interesse, k.canais
      from public.marketing_contatos k
     where k.org_id = public.org_padrao()
  ),
  -- "Com carro": pelo menos um interesse (não compra) com marca ou modelo.
  com_carro as (
    select distinct r.contato_id
      from public.marketing_interesses r
     where r.org_id = public.org_padrao()
       and r.tipo = 'interesse'
       and (r.marca is not null or r.modelo is not null)
  ),
  canais as (
    select u.canal, count(distinct c.id) as pessoas
      from c
     cross join lateral unnest(c.canais) as u(canal)
     group by u.canal
     order by pessoas desc, u.canal
     limit 30
  ),
  marcas as (
    select upper(r.marca) as marca, count(distinct r.contato_id) as pessoas
      from public.marketing_interesses r
     where r.org_id = public.org_padrao()
       and r.tipo = 'interesse'
       and r.marca is not null
     group by upper(r.marca)
     order by pessoas desc, upper(r.marca)
     limit 15
  )
  select jsonb_build_object(
    'pessoas',                (select count(*) from c),
    'clientes',               (select count(*) from c where c.cliente),
    'com_data_de_compra',     (select count(*) from c where c.comprou_em is not null),
    'sem_interesse',          (select count(*) from c where c.sem_interesse),
    'interessados_com_carro', (select count(*) from c
                                where not c.cliente
                                  and exists (select 1 from com_carro v where v.contato_id = c.id)),
    'interessados_sem_carro', (select count(*) from c
                                where not c.cliente
                                  and not exists (select 1 from com_carro v where v.contato_id = c.id)),
    'canais', coalesce((select jsonb_agg(jsonb_build_object('canal', x.canal, 'pessoas', x.pessoas)
                                         order by x.pessoas desc, x.canal)
                          from canais x), '[]'::jsonb),
    'marcas', coalesce((select jsonb_agg(jsonb_build_object('marca', x.marca, 'pessoas', x.pessoas)
                                         order by x.pessoas desc, x.marca)
                          from marcas x), '[]'::jsonb));
$$;


--
-- Name: FUNCTION marketing_resumo_da_base(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.marketing_resumo_da_base() IS 'O retrato da base de marketing da org, para a tela: SÓ contagem, nenhuma pessoa. {pessoas, clientes, com_data_de_compra, sem_interesse, interessados_com_carro, interessados_sem_carro, canais[{canal, pessoas}] (até 30, do maior para o menor), marcas[{marca, pessoas}] (até 15)}. Interessado é quem não é cliente; "com carro" é ter ao menos um registro de tipo interesse com marca ou modelo. marcas conta pessoas distintas por marca em maiúsculas, só nos registros de interesse. Só service_role executa.';


--
-- Name: meu_nome_de_responsavel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.meu_nome_de_responsavel() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select nullif(btrim(p.full_name), '')
    from public.profiles p
   where p.id = auth.uid()
     and p.is_active = true;
$$;


--
-- Name: FUNCTION meu_nome_de_responsavel(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.meu_nome_de_responsavel() IS 'O full_name aparado do perfil ativo da sessão — o texto que leads.responsavel guarda quando o lead é dela. NULL sem sessão, sem perfil ativo ou sem nome: quem não tem nome não tem lead "seu".';


--
-- Name: midia_confere_segredo(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.midia_confere_segredo(p_nome text, p_valor text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p_nome in ('midia_cron_segredo', 'midia_google_segredo')
     and coalesce(length(p_valor), 0) >= 32
     and exists (
       select 1 from vault.decrypted_secrets
        where name = p_nome and decrypted_secret = p_valor
     );
$$;


--
-- Name: midia_gravar_lote(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.midia_gravar_lote(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_plat   text := p->>'plataforma';
  v_de     date := (p->>'de')::date;
  v_ate    date := (p->>'ate')::date;
  c        jsonb;
  a        jsonb;
  v_camp   uuid;
  v_n_camp int := 0;
  v_n_dias int := 0;
  v_fora   int;
  v_ins    int;
begin
  if v_plat is null or v_plat not in ('meta', 'google') then
    raise exception 'plataforma inválida: %', v_plat using errcode = 'invalid_parameter_value';
  end if;
  if v_de is null or v_ate is null or v_de > v_ate then
    raise exception 'janela inválida: % a %', v_de, v_ate using errcode = 'invalid_parameter_value';
  end if;

  for c in select * from jsonb_array_elements(coalesce(p->'campanhas', '[]'::jsonb)) loop
    select count(*) into v_fora
      from jsonb_array_elements(coalesce(c->'dias', '[]'::jsonb)) d
     where (d->>'dia')::date not between v_de and v_ate;
    if v_fora > 0 then
      raise exception 'campanha %: % dia(s) fora da janela % a %', c->>'id_externo', v_fora, v_de, v_ate
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.midia_campanhas as m
      (nome, plataforma, origem, id_externo, objetivo, orcamento_diario, situacao,
       no_ar_desde, alcance_total, sincronizado_em)
    values
      (c->>'nome', v_plat, v_plat, c->>'id_externo', c->>'objetivo',
       (c->>'orcamento_diario')::numeric, c->>'situacao',
       (c->>'no_ar_desde')::timestamptz, (c->>'alcance_total')::integer, now())
    on conflict (plataforma, id_externo) do update set
      nome             = excluded.nome,
      objetivo         = coalesce(excluded.objetivo, m.objetivo),
      orcamento_diario = excluded.orcamento_diario,
      situacao         = excluded.situacao,
      no_ar_desde      = coalesce(excluded.no_ar_desde, m.no_ar_desde),
      alcance_total    = coalesce(excluded.alcance_total, m.alcance_total),
      sincronizado_em  = now()
    returning m.id into v_camp;

    for a in select * from jsonb_array_elements(coalesce(c->'anuncios', '[]'::jsonb)) loop
      insert into public.midia_anuncios as an (campanha_id, id_externo, nome)
      values (v_camp, a->>'id_externo', a->>'nome')
      on conflict (campanha_id, id_externo) do update set nome = excluded.nome;
    end loop;

    delete from public.midia_diario
     where campanha_id = v_camp and dia between v_de and v_ate;

    insert into public.midia_diario
      (campanha_id, anuncio_id, dia, investido, impressoes, cliques, conversoes)
    select v_camp,
           an.id,
           (d->>'dia')::date,
           coalesce((d->>'investido')::numeric, 0),
           coalesce((d->>'impressoes')::integer, 0),
           coalesce((d->>'cliques')::integer, 0),
           coalesce((d->>'conversoes')::numeric, 0)
      from jsonb_array_elements(coalesce(c->'dias', '[]'::jsonb)) d
      left join public.midia_anuncios an
        on an.campanha_id = v_camp and an.id_externo = d->>'anuncio_id_externo';
    get diagnostics v_ins = row_count;

    update public.midia_campanhas
       set no_ar_desde = (
             select min(dia)::timestamptz from public.midia_diario
              where campanha_id = v_camp and impressoes > 0)
     where id = v_camp and no_ar_desde is null;

    v_n_camp := v_n_camp + 1;
    v_n_dias := v_n_dias + v_ins;
  end loop;

  return jsonb_build_object('campanhas', v_n_camp, 'dias', v_n_dias);
end;
$$;


--
-- Name: montar_fila_de_gatilhos(timestamp with time zone, boolean, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.montar_fila_de_gatilhos(p_agora timestamp with time zone DEFAULT now(), p_reservar boolean DEFAULT false, p_gatilhos text[] DEFAULT NULL::text[]) RETURNS TABLE(evento_id uuid, veiculo_vendido_id uuid, cliente_id uuid, nome text, telefone_e164 text, email text, placa text, marca text, modelo text, ano_modelo integer, gatilho text, prioridade integer, passo integer, canal text, contexto jsonb, suprimido_por text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: FUNCTION montar_fila_de_gatilhos(p_agora timestamp with time zone, p_reservar boolean, p_gatilhos text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.montar_fila_de_gatilhos(p_agora timestamp with time zone, p_reservar boolean, p_gatilhos text[]) IS 'Monta (e opcionalmente reserva) a fila do motor de gatilhos. Reserva é serializada por advisory lock de transação. Desfecho falha_envio nunca conta como contato feito — regra 2 do CLAUDE.md.';


--
-- Name: montar_fila_do_funil(timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.montar_fila_do_funil(p_agora timestamp with time zone DEFAULT now(), p_reservar boolean DEFAULT false) RETURNS TABLE(lead_id uuid, nome text, telefone text, interesse text, canal text, situacao text, etapa text, minutos_parado integer, aviso text, responsavel text, responsavel_whatsapp text, novo_responsavel text, novo_whatsapp text, suprimido_por text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_local   timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_relogio text;
begin
  if extract(dow from v_local) = 0 then
    v_relogio := 'fora_do_horario';
  elsif extract(hour from v_local) < 8 or extract(hour from v_local) >= 20 then
    v_relogio := 'fora_do_horario';
  end if;

  return query
  with base as (
    select
      l.id,
      l.nome,
      l.telefone,
      l.interesse,
      l.canal,
      l.situacao,
      e.rotulo                                     as etapa,
      e.estagnacao_minutos,
      e.transferencia_minutos,
      e.protegida,
      -- `nullif(trim(...), '')`: `responsavel` é texto livre e uma gravação
      -- antiga pode ter deixado string vazia. Sem isto, `l.responsavel is
      -- null` daria falso para um lead que, na prática, não tem dono — e ele
      -- ficaria fora da atribuição automática para sempre, sem erro nenhum.
      nullif(trim(l.responsavel), '')       as responsavel,
      l.transferencias,
      l.alertado_em,
      l.responsavel_desde,
      -- 2026-09-05: a entrega do assistente ao humano é mais um marco do
      -- relógio. Nulo não muda nada — `greatest` ignora nulo.
      greatest(l.ultimo_movimento_em, l.ultimo_contato_em, atd.humano_assumiu_em) as parado_desde
    from public.leads l
    join public.funil_etapas e on e.chave = l.situacao
    -- O atendimento mais recente deste lead, quando existe. O `limit 1`
    -- também protege a contagem: sem ele, um lead com três conversas viraria
    -- três linhas na fila e três mensagens no WhatsApp do vendedor.
    left join lateral (
      select a.humano_assumiu_em, a.com_assistente
        from public.atendimentos a
       where a.lead_id = l.id
       order by coalesce(a.iniciado_em, a.created_at) desc, a.created_at desc, a.id desc
       limit 1
    ) atd on true
    where l.desfecho is null
      and e.tipo = 'aberta'
      -- Enquanto o assistente está no circuito, nenhuma métrica de controle
      -- conta. Sem atendimento, `com_assistente` vem nulo e o coalesce mantém
      -- o lead na fila — o comportamento de sempre.
      and not coalesce(atd.com_assistente, false)
  ),
  medido as (
    select b.*,
           floor(extract(epoch from (p_agora - b.parado_desde)) / 60)::int as minutos
      from base b
  ),
  classificado as (
    select
      m.*,
      -- O dono atual, com o número dele. LEFT JOIN por nome porque
      -- `leads.responsavel` é TEXTO e não FK (migração 20260807210000): o
      -- consultor que saiu da empresa continua legível no histórico, e o
      -- LEFT devolve NULL em vez de sumir com o lead.
      dono.telefone as responsavel_whatsapp,
      prox.nome     as novo_responsavel,
      prox.telefone as novo_whatsapp,
      case
        when m.responsavel is null
             and m.estagnacao_minutos is not null
             and m.minutos >= m.estagnacao_minutos            then 'atribuicao'
        when m.transferencia_minutos is not null
             and not m.protegida
             and m.minutos >= m.transferencia_minutos
             -- 2026-10-10: o dono atual também tem o prazo inteiro. Sem isto,
             -- o lead transferido seguia "parado" (a transferência não é
             -- contato) e voltava a ser transferido na rodada seguinte — de
             -- hora em hora, entre os vendedores. Antes do prazo, cai na
             -- estagnação abaixo, que a marca da transferência segura 20 h.
             and (m.responsavel_desde is null
                  or m.responsavel_desde
                     <= p_agora - make_interval(mins => m.transferencia_minutos)) then 'transferencia'
        when m.estagnacao_minutos is not null
             and m.minutos >= m.estagnacao_minutos             then 'estagnacao'
      end as aviso
    from medido m
    left join lateral (
      select nullif(trim(p.telefone_e164), '') as telefone
        from public.profiles p
       where m.responsavel is not null
         and trim(coalesce(p.full_name, '')) = trim(m.responsavel)
         and p.is_active
       limit 1
    ) dono on true
    left join lateral (
      select trim(p.full_name) as nome, trim(p.telefone_e164) as telefone
        from public.profiles p
       where p.is_active
         -- Só o Comercial (2026-09-23). Era `&& array['comercial','admin']`,
         -- e o admin sem comercial recebia lead transferido.
         and 'comercial' = any(p.papeis)
         and coalesce(trim(p.full_name), '')    <> ''
         and coalesce(trim(p.telefone_e164), '') <> ''
         and (m.responsavel is null
              or trim(p.full_name) is distinct from trim(m.responsavel))
       order by (
         select count(*) from public.leads x
          where trim(coalesce(x.responsavel, '')) = trim(p.full_name)
            and x.desfecho is null
       ) asc, trim(p.full_name) asc
       limit 1
    ) prox on true
  ),
  fila as (
    select
      c.*,
      case
        when v_relogio is not null then v_relogio
        when c.aviso in ('atribuicao', 'transferencia') and c.novo_responsavel is null
          then 'sem_vendedor_disponivel'
        when c.aviso = 'estagnacao' and c.responsavel_whatsapp is null
          then 'vendedor_sem_whatsapp'
        when c.aviso = 'estagnacao'
             and c.alertado_em is not null
             and c.alertado_em > p_agora - interval '20 hours'
          then 'alerta_recente'
      end as suprimido_por
    from classificado c
    where c.aviso is not null
  ),
  -- ---- a reserva: acontece no MESMO comando que monta a fila ----
  -- Duas execuções sobrepostas do workflow mandariam a mesma mensagem duas
  -- vezes se a gravação viesse depois. E a transferência só existe aqui
  -- dentro: trocar o dono de um lead sem que ninguém seja avisado seria a
  -- pior versão desta funcionalidade.
  cutucados as (
    update public.leads l
       set alertado_em = p_agora,
           alertas     = l.alertas + 1
      from fila f
     where p_reservar
       and f.suprimido_por is null
       and f.aviso = 'estagnacao'
       and l.id = f.id
    returning l.id
  ),
  transferidos as (
    update public.leads l
       set responsavel   = f.novo_responsavel,
           alertado_em   = p_agora,
           alertas       = l.alertas + 1,
           transferencias = l.transferencias
                            + case when f.aviso = 'transferencia' then 1 else 0 end
      from fila f
     where p_reservar
       and f.suprimido_por is null
       and f.aviso in ('atribuicao', 'transferencia')
       and l.id = f.id
    returning l.id
  ),
  rastro as (
    insert into public.leads_eventos (lead_id, tipo, de, para, automatico, detalhe)
    select f.id, 'alerta', f.responsavel,
           coalesce(f.novo_responsavel, f.responsavel), true,
           jsonb_build_object('aviso', f.aviso,
                              'minutos_parado', f.minutos,
                              'etapa', f.situacao)
      from fila f
     where p_reservar and f.suprimido_por is null
    returning id
  )
  select
    f.id, f.nome, f.telefone, f.interesse, f.canal, f.situacao, f.etapa,
    f.minutos, f.aviso, f.responsavel, f.responsavel_whatsapp,
    f.novo_responsavel, f.novo_whatsapp, f.suprimido_por
  from fila f
  order by
    case f.aviso when 'atribuicao' then 1 when 'transferencia' then 2 else 3 end,
    f.minutos desc;
end $$;


--
-- Name: FUNCTION montar_fila_do_funil(p_agora timestamp with time zone, p_reservar boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.montar_fila_do_funil(p_agora timestamp with time zone, p_reservar boolean) IS 'A fila de avisos do funil (2026-08-28): lead parado, lead sem dono e lead a transferir, com o WhatsApp de quem precisa saber. `p_reservar = true` grava o aviso E aplica a transferência no mesmo comando — transferir sem avisar seria trocar o dono de um lead às escondidas. Devolve também o que foi suprimido, com o motivo. Desde 2026-09-05 o relógio só corre depois que o assistente sai do circuito: o lead cujo atendimento mais recente está `com_assistente` fica fora da fila, e `humano_assumiu_em` reinicia a contagem. Desde 2026-09-23 só quem tem comercial em papeis é candidato a novo dono — admin não entra por ser admin, e o SDR não recebe lead. Desde 2026-10-10 o lead só é transferido de novo depois que o dono atual teve o mesmo prazo de transferência (`responsavel_desde`): acabou o vaivém de hora em hora entre vendedores.';


--
-- Name: negocios_validade_no_futuro(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.negocios_validade_no_futuro() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: nucleo_bloquear_fechamento_manual(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nucleo_bloquear_fechamento_manual() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.estado = 'fechado' and public.nucleo_chamada_de_api() then
    raise exception 'Fechar negócio é ato atômico da F1 (spec 20): VENDA + contabilização + disparos na mesma transação, por função SECURITY DEFINER. UPDATE direto pela API não fecha.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;


--
-- Name: nucleo_bloquear_mutacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nucleo_bloquear_mutacao() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'Tabela % é append-only (handoff, decisão 1): % é proibido — corrija com evento/estorno, nunca edição.',
    tg_table_name, tg_op
    using errcode = 'raise_exception';
end;
$$;


--
-- Name: nucleo_carimbar_autor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nucleo_carimbar_autor() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if public.nucleo_chamada_de_api() then
    if auth.uid() is null then
      raise exception 'Escrita em % sem sessão: a autoria da trilha não pode ficar em branco nem ser declarada pelo corpo.',
        tg_table_name using errcode = 'raise_exception';
    end if;
    case tg_table_name
      when 'veiculo_eventos'                then new.usuario_id    := auth.uid();
      when 'auditoria'                      then new.usuario_id    := auth.uid();
      when 'lancamentos'                    then new.criado_por    := auth.uid();
      when 'confirmacoes_disponibilidade'   then new.confirmada_por := auth.uid();
      else null;
    end case;
  end if;
  return new;
end;
$$;


--
-- Name: nucleo_chamada_de_api(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nucleo_chamada_de_api() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select current_user in ('authenticated', 'anon', 'service_role')
$$;


--
-- Name: FUNCTION nucleo_chamada_de_api(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nucleo_chamada_de_api() IS 'A chamada veio de fora (PostgREST/anon/service key) ou de dentro (função SECURITY DEFINER, migração)? Substitui o GUC `nucleo.fechamento_atomico`, que qualquer sessão podia setar.';


--
-- Name: nucleo_conferir_balanco(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nucleo_conferir_balanco() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION nucleo_conferir_balanco(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nucleo_conferir_balanco() IS 'SECURITY DEFINER desde 2026-08-29: como INVOKER, a soma das partidas era lida sob a RLS de quem insere. Falhava fechado hoje (todo staff vê tudo), mas a corretude do razão não pode depender dessa premissa — ela morre quando a F1 refinar as policies por papel.';


--
-- Name: nucleo_so_encerra_vigencia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nucleo_so_encerra_vigencia() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: papeis_validos(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.papeis_validos(p text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p is not null
     and array_length(p, 1) >= 1
     and p <@ array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr',
                    'cliente', 'investidor']
     and array_length(p, 1) = (select count(distinct x) from unnest(p) x);
$$;


--
-- Name: FUNCTION papeis_validos(p text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.papeis_validos(p text[]) IS 'Vocabulário de `profiles.papeis` — os seis de painel (admin, gestor, marketing, comercial, financeiro, sdr) mais os de área própria (cliente, investidor). Espelha PERFIS + PAPEIS_SEM_PAINEL de src/lib/permissoes.ts, e um teste trava os dois lados.';


--
-- Name: pessoas_dos_leads(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pessoas_dos_leads() RETURNS TABLE(id uuid, nome text, telefone text, email text, ativo boolean, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select l.id,
           l.nome::text,
           l.telefone::text,
           l.email::text,
           (l.desfecho is null or l.desfecho = 'ganho'),
           l.created_at
      from public.leads l
     -- Só para a equipe ativa. Em `(select …)`: avaliado uma vez por consulta.
     where (select public.is_staff((select auth.uid())));
  $$;


--
-- Name: FUNCTION pessoas_dos_leads(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.pessoas_dos_leads() IS 'O DIRETÓRIO dos leads: id, nome, telefone, e-mail, ativo (em aberto ou ganho) e data de entrada de TODOS os leads, para a equipe ativa (is_staff) — independente do escopo da RLS de leads. Decisão do dono em 2026-10-05: a agenda é de todos, o lead não. Nunca devolve etapa, responsável, interesse, observações, próximo passo, desfecho ou valor. Cliente, investidor, perfil desativado e chamada sem sessão recebem zero linhas. Alimenta o ramo de leads de agenda_de_pessoas.';


--
-- Name: recebe_lead_pelo_nome(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recebe_lead_pelo_nome(p_nome text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- Só responde a quem tem escopo: não vira consulta de "quem trabalha na
  -- loja" na mão de um cliente da Garagem.
  select public.escopo_de_leads() <> 'nenhum'
     and nullif(btrim(p_nome), '') is not null
     and exists (
       select 1 from public.profiles c
        where c.is_active = true
          and 'comercial' = any (c.papeis)
          and nullif(btrim(c.full_name), '') = btrim(p_nome)
     );
$$;


--
-- Name: FUNCTION recebe_lead_pelo_nome(p_nome text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.recebe_lead_pelo_nome(p_nome text) IS 'O nome é de alguém do Comercial ativo? A régua de recebeLead (src/lib/permissoes.ts), do rodízio e do crédito do SDR, para o with check da RLS de leads: é a quem um lead pode ser passado.';


--
-- Name: reconciliar_disponibilidade_do_feed(bigint[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconciliar_disponibilidade_do_feed(p_ids bigint[], p_gravar boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  -- Quem assina no histórico. É por ESTE nome, com `autor_id` nulo, que a volta
  -- ao feed reconhece a marcação do robô. Marcação de gente tem `autor_id`.
  c_autor  constant text     := 'RevendaMais (sync)';
  -- `MARGEM_FORA_DO_FEED_MS` de `lib/estoqueTabela.ts`. Mudou lá, muda aqui.
  c_margem constant interval := interval '24 hours';
  -- `FRACAO_MINIMA_DO_CICLO` de `lib/supabase.ts`.
  c_piso   constant numeric  := 0.5;

  v_ids      bigint[];
  v_no_feed  integer;
  v_a_venda  integer;
  v_sairam   bigint[];
  v_voltaram bigint[];
  v_na_mao   bigint[];
  v_feitos   bigint[];
begin
  select coalesce(array_agg(distinct x order by x), '{}'::bigint[])
    into v_ids
    from unnest(coalesce(p_ids, '{}'::bigint[])) as x
   where x is not null and x > 0;

  v_no_feed := cardinality(v_ids);

  if v_no_feed = 0 then
    raise exception 'FEED_VAZIO: nenhum id chegou do feed. Nada foi marcado.'
      using errcode = 'invalid_parameter_value';
  end if;

  select count(*)
    into v_a_venda
    from public.estoque_motors
   where origem = 'sync'
     and estado_cadastro = 'publicado'
     and coalesce(vendido, false) = false;

  if v_no_feed < ceil(c_piso * v_a_venda) then
    raise exception 'FEED_SUSPEITO: o feed trouxe % anúncios e o site tem % publicados à venda. Menos da metade é coleta quebrada, não venda. Nada foi marcado.',
      v_no_feed, v_a_venda
      using errcode = 'invalid_parameter_value';
  end if;

  -- ---- SAIU ------------------------------------------------------------------
  select coalesce(array_agg(e.id::bigint order by e.id), '{}'::bigint[])
    into v_sairam
    from public.estoque_motors e
   where e.origem = 'sync'
     and e.estado_cadastro = 'publicado'
     and coalesce(e.vendido, false) = false
     and e.id <> all (v_ids)
     and e.last_seen_at is not null
     and e.last_seen_at <= now() - c_margem;

  -- ---- VOLTOU (só o que o sync marcou) ----------------------------------------
  select coalesce(array_agg(e.id::bigint order by e.id), '{}'::bigint[])
    into v_voltaram
    from public.estoque_motors e
    join lateral (
      select h.valor_novo, h.autor_id, h.autor_nome
        from public.historico_veiculo h
       where h.veiculo_id = e.id
         and h.campo = 'vendido'
       order by h.registrado_em desc
       limit 1
    ) as ultima on true
   where e.origem = 'sync'
     and e.estado_cadastro = 'publicado'
     and e.vendido is true
     and e.id = any (v_ids)
     and ultima.valor_novo = 'true'
     and ultima.autor_id is null
     and ultima.autor_nome = c_autor;

  -- ---- Vendido por gente e ainda anunciado: só o retorno conta -----------------
  select coalesce(array_agg(e.id::bigint order by e.id), '{}'::bigint[])
    into v_na_mao
    from public.estoque_motors e
   where e.origem = 'sync'
     and e.vendido is true
     and e.id = any (v_ids)
     and e.id <> all (v_voltaram);

  if p_gravar and cardinality(v_sairam) > 0 then
    with feitos as (
      update public.estoque_motors
         set vendido = true
       where id = any (v_sairam)
         and coalesce(vendido, false) = false
      returning id
    )
    select coalesce(array_agg(id::bigint order by id), '{}'::bigint[])
      into v_feitos
      from feitos;

    -- A trava devolve OLD em silêncio quando reconhece o sync. Se um dia ela
    -- passar a reconhecer esta função, o UPDATE "funciona" e não grava nada —
    -- e isso tem de estourar aqui, não aparecer como carro à venda daqui a uma
    -- semana.
    if exists (select 1 from public.estoque_motors where id = any (v_feitos) and vendido is not true) then
      raise exception 'TRAVA_ENGOLIU: a marcação de vendido não chegou ao banco. Nada foi marcado.';
    end if;

    insert into public.historico_veiculo
      (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
    select x, 'vendido', 'false', 'true', null, c_autor, clock_timestamp()
      from unnest(v_feitos) as x;
  end if;

  if p_gravar and cardinality(v_voltaram) > 0 then
    with feitos as (
      update public.estoque_motors
         set vendido = false
       where id = any (v_voltaram)
         and vendido is true
      returning id
    )
    select coalesce(array_agg(id::bigint order by id), '{}'::bigint[])
      into v_feitos
      from feitos;

    if exists (select 1 from public.estoque_motors where id = any (v_feitos) and vendido is true) then
      raise exception 'TRAVA_ENGOLIU: a volta à venda não chegou ao banco. Nada foi alterado.';
    end if;

    insert into public.historico_veiculo
      (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
    select x, 'vendido', 'true', 'false', null, c_autor, clock_timestamp()
      from unnest(v_feitos) as x;
  end if;

  return jsonb_build_object(
    'gravou',           p_gravar,
    'anuncios_no_feed', v_no_feed,
    'a_venda_no_site',  v_a_venda,
    'margem_horas',     (extract(epoch from c_margem) / 3600)::int,
    'sairam', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id,
               'carro', concat_ws(' ', e.marca, e.modelo, e.ano),
               'visto_no_feed_em', e.last_seen_at
             ) order by e.id), '[]'::jsonb)
        from public.estoque_motors e
       where e.id = any (v_sairam)
    ),
    'voltaram', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id,
               'carro', concat_ws(' ', e.marca, e.modelo, e.ano)
             ) order by e.id), '[]'::jsonb)
        from public.estoque_motors e
       where e.id = any (v_voltaram)
    ),
    'vendidos_na_mao_e_ainda_no_feed', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id,
               'carro', concat_ws(' ', e.marca, e.modelo, e.ano),
               'estado', e.estado_cadastro
             ) order by e.id), '[]'::jsonb)
        from public.estoque_motors e
       where e.id = any (v_na_mao)
    )
  );
end;
$$;


--
-- Name: FUNCTION reconciliar_disponibilidade_do_feed(p_ids bigint[], p_gravar boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reconciliar_disponibilidade_do_feed(p_ids bigint[], p_gravar boolean) IS 'A disponibilidade espelha o RevendaMais (decisão do dono, 2026-09-16). Recebe a lista inteira de ids do feed no fim do ciclo do n8n. SAIU (sync, publicado, à venda, fora da lista há 24 h ou mais) → vendido + histórico com autor "RevendaMais (sync)". VOLTOU (vendido pelo próprio sync e de novo na lista) → à venda. Nunca toca origem painel, rascunho, arquivado nem veiculos_vendidos; nunca desfaz venda marcada por gente. p_gravar falso = ensaio. FEED_VAZIO e FEED_SUSPEITO (menos da metade dos publicados à venda) barram tudo. Só a chave de serviço executa.';


--
-- Name: registrar_contato_do_lead(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_contato_do_lead(p_lead uuid, p_canal text DEFAULT 'whatsapp'::text, p_autor text DEFAULT NULL::text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_agora    timestamptz := now();
  v_servico  boolean := coalesce(auth.role(), '') = 'service_role';
begin
  -- A chave de serviço é o webhook do Chatwoot e o n8n. Ela não vem de
  -- navegador: quem a tem já escreve em `leads` direto, então reconhecê-la
  -- aqui não amplia acesso nenhum — só para de recusar quem já podia.
  if not (v_servico or public.is_staff(auth.uid())) then
    raise exception 'Registrar contato é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.leads
     set ultimo_contato_em = v_agora,
         -- Atendeu: a cobrança de hoje deixa de valer.
         alertado_em       = null
   where id = p_lead;

  if not found then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  insert into public.leads_eventos (lead_id, tipo, para, autor, automatico, detalhe)
  values (
    p_lead, 'contato', p_canal,
    -- O nome vindo do Chatwoot quando há; senão o do usuário do painel. A
    -- ordem importa: na chamada de serviço `autor_atual()` é nulo, e na
    -- chamada do painel `p_autor` não é passado.
    coalesce(nullif(trim(p_autor), ''), public.autor_atual()),
    false,
    jsonb_build_object('canal', p_canal, 'via_servico', v_servico)
  );

  return v_agora;
end $$;


--
-- Name: FUNCTION registrar_contato_do_lead(p_lead uuid, p_canal text, p_autor text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_contato_do_lead(p_lead uuid, p_canal text, p_autor text) IS 'Marca que alguém falou com o lead (2026-08-28; aberta ao integrador em 2026-09-15). Reinicia o relógio da estagnação e deixa a linha no rastro. Chamada pelo botão do card e pelo webhook do Chatwoot — atender pelo Chatwoot é atender, e antes disso o motor não enxergava.';


--
-- Name: registrar_desfecho_ciclo(uuid, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_desfecho_ciclo(p_evento uuid, p_desfecho text, p_valor numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_atual text;
begin
  if p_desfecho not in ('convertido', 'recusado', 'sem_resposta', 'agendado', 'falha_envio') then
    raise exception 'DESFECHO_INVALIDO' using errcode = 'check_violation';
  end if;

  -- `for update` fecha a janela entre ler e gravar: dois desfechos
  -- simultâneos para o mesmo evento se serializam aqui, e o segundo é
  -- avaliado contra o que o primeiro deixou.
  select desfecho into v_atual
    from public.eventos_ciclo
   where id = p_evento
     for update;

  if not found then
    raise exception 'EVENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  if not public.desfecho_pode_gravar(v_atual, p_desfecho) then
    return jsonb_build_object(
      'ok', true,
      'evento_id', p_evento,
      'desfecho', v_atual,
      'sobrescrita_ignorada', true
    );
  end if;

  update public.eventos_ciclo
     set desfecho      = p_desfecho,
         valor_gerado  = coalesce(p_valor, valor_gerado),
         respondido_em = case
                           when p_desfecho in ('convertido', 'recusado', 'agendado')
                             then coalesce(respondido_em, now())
                           else respondido_em
                         end
   where id = p_evento;

  return jsonb_build_object('ok', true, 'evento_id', p_evento, 'desfecho', p_desfecho);
end;
$$;


--
-- Name: FUNCTION registrar_desfecho_ciclo(p_evento uuid, p_desfecho text, p_valor numeric); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_desfecho_ciclo(p_evento uuid, p_desfecho text, p_valor numeric) IS 'Fecha um evento do motor. falha_envio devolve a vez ao cliente: a linha fica como rastro mas não conta para a janela de 21 dias do §4.3. Desfecho não regride (achado #10): sobrescrita rebaixadora é ignorada com sobrescrita_ignorada=true na resposta, nunca erro — retry é operação normal.';


--
-- Name: registrar_etiquetas_do_lead(uuid, text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_etiquetas_do_lead(p_lead uuid, p_antes text[], p_depois text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_antes  text[] := coalesce(p_antes,  '{}');
  v_depois text[] := coalesce(p_depois, '{}');
  v_id     uuid;
begin
  -- A linha "Ver e mover leads no kanban" da matriz (lib/permissoes.ts).
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and p.papeis && array['admin', 'comercial', 'sdr']
  ) then
    raise exception 'Registrar etiquetas é de quem move lead no kanban.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Uma conversa do Chatwoot não chega perto disto; passar daqui é lixo, e o
  -- rastro é só de inserção — o que entra, fica.
  if cardinality(v_antes) > 100 or cardinality(v_depois) > 100
     or exists (select 1 from unnest(v_antes || v_depois) as e where length(e) > 255) then
    raise exception 'ETIQUETAS_GRANDES_DEMAIS' using errcode = 'invalid_parameter_value';
  end if;

  if not exists (select 1 from public.leads where id = p_lead) then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico, detalhe)
  values (
    p_lead, 'etiqueta',
    nullif(array_to_string(v_antes,  ', '), ''),
    nullif(array_to_string(v_depois, ', '), ''),
    public.autor_atual(), false,
    jsonb_build_object(
      'origem',    'card',
      'antes',     to_jsonb(v_antes),
      'depois',    to_jsonb(v_depois),
      'incluidas', to_jsonb(array(select e from unnest(v_depois) as e where e <> all (v_antes))),
      'retiradas', to_jsonb(array(select e from unnest(v_antes)  as e where e <> all (v_depois)))
    )
  )
  returning id into v_id;

  return v_id;
end $$;


--
-- Name: FUNCTION registrar_etiquetas_do_lead(p_lead uuid, p_antes text[], p_depois text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_etiquetas_do_lead(p_lead uuid, p_antes text[], p_depois text[]) IS 'Grava no rastro do lead uma edição de etiquetas feita no card (2026-09-25): antes, depois, o que entrou e o que saiu, e quem fez. As etiquetas em si moram no Chatwoot; o rastro é a prova que não depende dele. Restrita a quem move lead no kanban (admin, comercial, sdr ativos).';


--
-- Name: registrar_interacao_do_lead(uuid, text, text, text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_interacao_do_lead(p_lead uuid, p_tipo text, p_resultado text DEFAULT NULL::text, p_texto text DEFAULT NULL::text, p_passo text DEFAULT NULL::text, p_vence_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_passo_concluido timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id    uuid;
  v_autor text := public.autor_atual();
  v_passo text := nullif(trim(p_passo), '');
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Registrar interação é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.leads where id = p_lead) then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  -- Passo sem data, ou data sem passo, é meio compromisso: o card não saberia
  -- o que mostrar nem quando avisar.
  if (v_passo is null) <> (p_vence_em is null) then
    raise exception 'O próximo passo precisa de texto e de data, juntos.'
      using errcode = 'check_violation';
  end if;

  insert into public.leads_interacoes
    (lead_id, tipo, resultado, texto, autor, passo_texto, passo_vence_em)
  values
    (p_lead, p_tipo, p_resultado, nullif(trim(p_texto), ''), v_autor, v_passo, p_vence_em)
  returning id into v_id;

  if v_passo is not null then
    -- O passo novo substitui o do lead. Quem reinicia o relógio é o gatilho
    -- `leads_antes_de_atualizar` (`proximo_passo_definido_em` mudou).
    update public.leads
       set proximo_passo              = v_passo,
           proximo_passo_vence_em     = p_vence_em,
           proximo_passo_definido_em  = now(),
           proximo_passo_definido_por = v_autor
     where id = p_lead;
  else
    -- Sem passo novo o relógio reinicia sempre; o passo só sai quando é o
    -- que o vendedor concluiu (o carimbo bate). Nota de atendimento, ou passo
    -- que mudou depois do CONCLUIR, ficam.
    update public.leads
       set ultimo_contato_em          = now(),
           alertado_em                = null,
           proximo_passo              = case when v_conclui then null else proximo_passo end,
           proximo_passo_vence_em     = case when v_conclui then null else proximo_passo_vence_em end,
           proximo_passo_definido_em  = case when v_conclui then null else proximo_passo_definido_em end,
           proximo_passo_definido_por = case when v_conclui then null else proximo_passo_definido_por end
      from (select p_passo_concluido is not null
                   and l.proximo_passo_definido_em = p_passo_concluido as v_conclui
              from public.leads l where l.id = p_lead) as decisao
     where id = p_lead;
  end if;

  return v_id;
end $$;


--
-- Name: FUNCTION registrar_interacao_do_lead(p_lead uuid, p_tipo text, p_resultado text, p_texto text, p_passo text, p_vence_em timestamp with time zone, p_passo_concluido timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.registrar_interacao_do_lead(p_lead uuid, p_tipo text, p_resultado text, p_texto text, p_passo text, p_vence_em timestamp with time zone, p_passo_concluido timestamp with time zone) IS 'Grava um registro do vendedor e, se vier, o próximo passo no lead — numa transação só (2026-09-23). O passo é opcional (2026-10-09): sem ele o lead mantém o que tinha, ou o perde quando `p_passo_concluido` é o carimbo (`proximo_passo_definido_em`) do passo em vigor — o CONCLUIR sem passo novo. Reinicia o relógio da estagnação. SECURITY DEFINER com guarda de staff: `leads_interacoes` não tem policy de INSERT.';


--
-- Name: reivindicar_garagem(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reivindicar_garagem() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_qtd   int;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('vinculados', 0);
  end if;

  -- A prova de posse do e-mail. Sem ela, o vínculo dependia de o cadastro
  -- público estar fechado no painel — configuração, não código.
  if not exists (
       select 1 from auth.users u
        where u.id = auth.uid()
          and u.email_confirmed_at is not null
     ) then
    return jsonb_build_object('vinculados', 0, 'motivo', 'email_nao_confirmado');
  end if;

  -- `auth_user_id` é UNIQUE: um usuário ↔ um cliente. Quando o mesmo e-mail
  -- tiver mais de um cliente sem vínculo (a pessoa física e a empresa dela),
  -- a reivindicação pega o mais antigo e o resto fica para a loja resolver —
  -- dois CPFs num e-mail é exceção operacional, não fluxo. E quem já está
  -- vinculado a um cliente não reivindica outro.
  update public.clientes c
     set auth_user_id = auth.uid()
   where c.id = (
           select c2.id from public.clientes c2
            where c2.auth_user_id is null
              and c2.email is not null
              and lower(c2.email) = v_email
            order by c2.created_at
            limit 1
         )
     and not exists (
           select 1 from public.clientes c3 where c3.auth_user_id = auth.uid()
         );
  get diagnostics v_qtd = row_count;

  return jsonb_build_object('vinculados', v_qtd);
end;
$$;


--
-- Name: FUNCTION reivindicar_garagem(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reivindicar_garagem() IS 'Liga a conta do Auth ao cliente pelo e-mail, e SÓ com e-mail confirmado (email_confirmed_at). A confirmação é a prova de posse que o vínculo pressupõe — antes de 2026-08-18 ela dependia do cadastro público estar fechado no painel, que é configuração e não código.';


--
-- Name: reivindicar_investidor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reivindicar_investidor() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_qtd   int;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('vinculados', 0);
  end if;

  if not exists (
       select 1 from auth.users u
        where u.id = auth.uid()
          and u.email_confirmed_at is not null
     ) then
    return jsonb_build_object('vinculados', 0, 'motivo', 'email_nao_confirmado');
  end if;

  -- `perfil_id` é único: uma conta ↔ um investidor. Havendo mais de um
  -- cadastro sem vínculo no mesmo e-mail, pega o mais antigo e o resto fica
  -- para a loja resolver — e quem já está vinculado não reivindica outro.
  update public.investidores i
     set perfil_id = auth.uid()
   where i.id = (
           select i2.id from public.investidores i2
            where i2.perfil_id is null
              and i2.email is not null
              and lower(i2.email) = v_email
            order by i2.created_at
            limit 1
         )
     and not exists (
           select 1 from public.investidores i3 where i3.perfil_id = auth.uid()
         );

  get diagnostics v_qtd = row_count;
  return jsonb_build_object('vinculados', v_qtd);
end;
$$;


--
-- Name: FUNCTION reivindicar_investidor(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reivindicar_investidor() IS 'Liga a conta do Auth ao investidor pelo e-mail, e SÓ com e-mail confirmado. Gêmea de reivindicar_garagem() — mesma prova de posse.';


--
-- Name: resumo_de_interesse_do_veiculo(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumo_de_interesse_do_veiculo(p_veiculo bigint) RETURNS TABLE(veiculo_id bigint, total integer, em_avaliacao integer, sem_resolucao integer, escolhido integer, descartado integer, motivos jsonb, notas jsonb, primeiro_interesse_em timestamp with time zone, ultimo_interesse_em timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_column
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'O resumo de interesse por veículo é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with linhas as (
    select v.situacao, v.motivo_descarte, v.nota, v.criado_em, v.resolvido_em,
           (l.desfecho is not null) as lead_encerrado
      from public.leads_veiculos v
      join public.leads l on l.id = v.lead_id
     where v.veiculo_id = p_veiculo
       and v.org_id = public.org_padrao()
  )
  select p_veiculo,
         count(*)::integer,
         (count(*) filter (where x.situacao = 'em_avaliacao'))::integer,
         (count(*) filter (where x.situacao = 'em_avaliacao' and x.lead_encerrado))::integer,
         (count(*) filter (where x.situacao = 'escolhido'))::integer,
         (count(*) filter (where x.situacao = 'descartado'))::integer,
         coalesce((
           select jsonb_agg(jsonb_build_object('motivo', m.motivo_descarte, 'total', m.n)
                            order by m.n desc, m.motivo_descarte)
             from (select y.motivo_descarte, count(*)::integer as n
                     from linhas y
                    where y.situacao = 'descartado'
                    group by y.motivo_descarte) m
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object('motivo', n.motivo_descarte,
                                               'nota', btrim(n.nota),
                                               'em', n.resolvido_em)
                            order by n.resolvido_em desc, n.motivo_descarte, n.nota)
             from (select y.motivo_descarte, y.nota, y.resolvido_em
                     from linhas y
                    where y.situacao = 'descartado'
                      and nullif(btrim(y.nota), '') is not null
                    order by y.resolvido_em desc
                    limit 200) n
         ), '[]'::jsonb),
         min(x.criado_em),
         max(x.criado_em)
    from linhas x;
end;
$$;


--
-- Name: FUNCTION resumo_de_interesse_do_veiculo(p_veiculo bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.resumo_de_interesse_do_veiculo(p_veiculo bigint) IS 'O retorno real dos leads sobre UM carro (estoque_motors.id), da loja inteira: quantos consideraram (total), quantos seguem em avaliação (em_avaliacao; sem_resolucao é a parte cujo lead já foi encerrado sem resolver a opção), escolhido, descartado, motivos ([{motivo,total}], do mais citado ao menos) e notas dos descartes ([{motivo,nota,em}], as 200 mais recentes). Sempre uma linha; zeros se ninguém considerou. Só agregados: sem nome, telefone, lead nem autor. Restrito à equipe ativa.';


--
-- Name: rodar_abertura_de_janelas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rodar_abertura_de_janelas() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    SET "TimeZone" TO 'America/Sao_Paulo'
    AS $$
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


--
-- Name: FUNCTION rodar_abertura_de_janelas(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rodar_abertura_de_janelas() IS 'Ponto de entrada do pg_cron para o plano vitalício. Fixa o fuso de Curitiba e se apresenta como chamador sem JWT. É um portão que pula a checagem de staff: NUNCA conceder execute a authenticated ou anon.';


--
-- Name: rodar_conformidade_diaria(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rodar_conformidade_diaria() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    SET "TimeZone" TO 'America/Sao_Paulo'
    AS $$
begin
  perform set_config('request.jwt.claims', '', true);
  return public.calcular_conformidade_diaria();
end;
$$;


--
-- Name: FUNCTION rodar_conformidade_diaria(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rodar_conformidade_diaria() IS 'Ponto de entrada do pg_cron para a série do §1.4. Fixa o fuso de Curitiba e se apresenta como chamador sem JWT. É um portão que pula a checagem de staff: NUNCA conceder execute a authenticated ou anon.';


--
-- Name: rotulo_de_veiculo(text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rotulo_de_veiculo(p_marca text, p_modelo text, p_versao text, p_ano integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select nullif(btrim(concat_ws(' ',
           nullif(btrim(p_marca), ''),
           nullif(btrim(p_modelo), ''),
           case when nullif(btrim(p_versao), '') is not null
                 and position(lower(btrim(p_versao))
                              in lower(concat_ws(' ', btrim(p_marca), btrim(p_modelo)))) = 0
                then btrim(p_versao) end,
           case when p_ano is not null
                 and not (p_ano::text = any (regexp_split_to_array(
                            btrim(concat_ws(' ', p_marca, p_modelo, p_versao)), '\s+')))
                then p_ano::text end
         )), '');
$$;


--
-- Name: FUNCTION rotulo_de_veiculo(p_marca text, p_modelo text, p_versao text, p_ano integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.rotulo_de_veiculo(p_marca text, p_modelo text, p_versao text, p_ano integer) IS 'O nome de um carro para guardar como retrato: marca, modelo, versão (se o modelo já não a embute) e ano (se já não está no nome). NULL quando não sobra nada. Espelha nomeDoVeiculo de src/lib/nomeDoVeiculo.ts; a caixa é a do estoque.';


--
-- Name: sincronizar_papeis(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_papeis() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    -- Quem informou só `role` (handle_new_user, telas antigas) ganha o array.
    if new.papeis is null or array_length(new.papeis, 1) is null then
      new.papeis := array[coalesce(new.role, 'cliente')];
    end if;
    new.role := new.papeis[1];
    return new;
  end if;

  -- UPDATE: quem mudou manda. Se `papeis` mudou, ele é a fonte; se só `role`
  -- mudou, ele vira o primário e os demais papéis são preservados.
  if new.papeis is distinct from old.papeis then
    new.role := new.papeis[1];
  elsif new.role is distinct from old.role then
    new.papeis := array[new.role] || array_remove(old.papeis, new.role);
  end if;

  return new;
end;
$$;


--
-- Name: sms_devolver_presos(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sms_devolver_presos(p_campanha uuid, p_minutos integer DEFAULT 10) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_quantos integer;
begin
  update public.sms_envios e
     set situacao = 'falhou',
         erro     = 'O envio foi interrompido antes da resposta do fornecedor; pode ter sido entregue.'
   where e.campanha_id = p_campanha
     and e.situacao = 'enviando'
     and e.fornecedor_id is null
     and coalesce(e.tentado_em, e.criado_em)
           < now() - make_interval(mins => greatest(coalesce(p_minutos, 10), 1));
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;


--
-- Name: FUNCTION sms_devolver_presos(p_campanha uuid, p_minutos integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sms_devolver_presos(p_campanha uuid, p_minutos integer) IS 'Fecha os envios de uma campanha que ficaram em enviando há mais de p_minutos (padrão 10, mínimo 1) SEM fornecedor_id — a função do servidor morreu entre reservar e ouvir o fornecedor. Marca falhou, com o motivo em erro, e devolve quantos. NÃO devolve à fila: o SMS pode ter saído, e reenviar sozinho é arriscar mensagem em dobro. Só service_role executa.';


--
-- Name: sms_registrar_clique(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sms_registrar_clique(p_codigo text) RETURNS TABLE(destino text, campanha_codigo text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with clicado as (
    update public.sms_envios e
       set cliques   = e.cliques + 1,
           clicou_em = coalesce(e.clicou_em, now())
     where e.codigo = p_codigo
    returning e.campanha_id
  )
  select c.destino, c.codigo
    from clicado k
    join public.sms_campanhas c on c.id = k.campanha_id;
$$;


--
-- Name: FUNCTION sms_registrar_clique(p_codigo text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sms_registrar_clique(p_codigo text) IS 'O clique em /s/<codigo>: soma 1 em cliques, guarda o primeiro clicou_em e devolve o destino (caminho da ficha) e o código da campanha, para a rota redirecionar com as marcas de UTM. Código desconhecido devolve zero linhas, sem erro. Não devolve dado de pessoa. Só service_role executa.';


--
-- Name: sms_envios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_envios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    campanha_id uuid NOT NULL,
    lead_id uuid,
    telefone text NOT NULL,
    nome text,
    codigo text NOT NULL,
    texto text NOT NULL,
    partes integer DEFAULT 1 NOT NULL,
    situacao text DEFAULT 'na_fila'::text NOT NULL,
    fornecedor_id text,
    custo numeric(10,4),
    erro text,
    tentado_em timestamp with time zone,
    enviado_em timestamp with time zone,
    aceito_em timestamp with time zone,
    na_operadora_em timestamp with time zone,
    cliques integer DEFAULT 0 NOT NULL,
    clicou_em timestamp with time zone,
    respondeu_em timestamp with time zone,
    resposta text,
    saiu_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    contato_id uuid,
    CONSTRAINT sms_envios_cliques_validos CHECK ((cliques >= 0)),
    CONSTRAINT sms_envios_codigo_valido CHECK ((codigo ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{7}$'::text)),
    CONSTRAINT sms_envios_custo_valido CHECK (((custo IS NULL) OR (custo >= (0)::numeric))),
    CONSTRAINT sms_envios_partes_validas CHECK (((partes >= 1) AND (partes <= 3))),
    CONSTRAINT sms_envios_resposta_curta CHECK (((resposta IS NULL) OR (char_length(resposta) <= 500))),
    CONSTRAINT sms_envios_situacao_valida CHECK ((situacao = ANY (ARRAY['na_fila'::text, 'enviando'::text, 'enviado'::text, 'falhou'::text]))),
    CONSTRAINT sms_envios_telefone_valido CHECK ((telefone ~ '^55[1-9][0-9]9[0-9]{8}$'::text))
);


--
-- Name: TABLE sms_envios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sms_envios IS 'Os destinatários de cada campanha de SMS (2026-10-07): uma linha por número por campanha, com a mensagem final, o código do link curto e o que voltou do fornecedor. DADO PESSOAL (telefone, nome, resposta). O painel NÃO lê: sem privilégio e sem policy para authenticated, porque o papel Marketing opera as campanhas e não lê contato de lead. Só o servidor, com a chave de serviço, que devolve à tela contagem, primeiro nome e telefone mascarado. Vai embora com a campanha, com o lead e com o contato da base. Ver 20261007120000_sms_campanhas.sql.';


--
-- Name: COLUMN sms_envios.lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.lead_id IS 'O lead do site de onde o número veio, quando a pessoa é um. ON DELETE CASCADE: eliminar o lead (LGPD, art. 18, VI) leva o envio junto. Pode vir junto com contato_id (a mesma pessoa nas duas fontes) ou os dois nulos.';


--
-- Name: COLUMN sms_envios.telefone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.telefone IS 'Só dígitos, com 55 e DDD, celular de 9 dígitos ("5541999990000") — o que telefoneParaSms devolve. Fixo não entra. NUNCA vai inteiro para o navegador.';


--
-- Name: COLUMN sms_envios.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.nome IS 'O nome da pessoa (do lead ou do contato da base) quando o público foi montado. A tela mostra só o primeiro.';


--
-- Name: COLUMN sms_envios.codigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.codigo IS 'O código do link curto deste destinatário: /s/<codigo>. Sete caracteres do mesmo alfabeto do código da campanha.';


--
-- Name: COLUMN sms_envios.texto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.texto IS 'A mensagem FINAL enviada a este número: o molde com as variáveis trocadas, sem acento e com o rodapé de saída.';


--
-- Name: COLUMN sms_envios.partes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.partes IS 'Quantos SMS o fornecedor cobra por esta mensagem: 1 a 3 (PARTES_MAXIMAS).';


--
-- Name: COLUMN sms_envios.situacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.situacao IS 'na_fila; enviando (reservado por sms_reservar_envios); enviado (o fornecedor aceitou); falhou (recusado, ou interrompido antes da resposta — ver erro).';


--
-- Name: COLUMN sms_envios.fornecedor_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.fornecedor_id IS 'O id que a APIBrasil devolveu ao aceitar o SMS. É por ele que o webhook de retorno acha a linha.';


--
-- Name: COLUMN sms_envios.custo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.custo IS 'O que o fornecedor disse ter cobrado por este SMS, em reais. Nulo se não disse.';


--
-- Name: COLUMN sms_envios.tentado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.tentado_em IS 'Quando o envio foi reservado para sair. É dele que sms_devolver_presos conta os minutos.';


--
-- Name: COLUMN sms_envios.enviado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.enviado_em IS 'Quando o fornecedor recebeu o SMS para envio (a resposta ao pedido). É por ele que o descanso de uma campanha acha quem recebeu há pouco.';


--
-- Name: COLUMN sms_envios.na_operadora_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.na_operadora_em IS 'Quando o fornecedor avisou que a operadora recebeu (sent_to_carrier). É o mais perto de "entregue" que ele informa.';


--
-- Name: COLUMN sms_envios.cliques; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.cliques IS 'Quantas vezes o link curto foi aberto. Só sms_registrar_clique soma.';


--
-- Name: COLUMN sms_envios.clicou_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.clicou_em IS 'O PRIMEIRO clique. Os seguintes somam em cliques e não mexem aqui.';


--
-- Name: COLUMN sms_envios.resposta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.resposta IS 'O texto que a pessoa respondeu, até 500 caracteres. Dado pessoal.';


--
-- Name: COLUMN sms_envios.saiu_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.saiu_em IS 'Quando a resposta foi um pedido de saída (ver sms_descadastros).';


--
-- Name: COLUMN sms_envios.contato_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_envios.contato_id IS 'O contato da base importada (marketing_contatos) de onde o número veio, quando a pessoa é um. ON DELETE CASCADE: eliminar o contato, ou desfazer a importação que o criou, leva o envio junto.';


--
-- Name: sms_reservar_envios(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sms_reservar_envios(p_campanha uuid, p_limite integer) RETURNS SETOF public.sms_envios
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Só com a campanha em `enviando`. A linha fica travada para leitura até o
  -- fim da reserva: quem interrompe a campanha espera este lote, e o próximo
  -- já encontra a situação nova.
  perform 1
     from public.sms_campanhas c
    where c.id = p_campanha and c.situacao = 'enviando'
      for share;
  if not found then
    return;
  end if;

  -- O lote: os mais antigos da fila, entre 1 e 200 (nulo conta como 1). `skip
  -- locked` é o que impede duas chamadas simultâneas de receber a mesma linha:
  -- a que chega depois pula o que a primeira já travou.
  return query
    with lote as materialized (
      select f.id
        from public.sms_envios f
       where f.campanha_id = p_campanha
         and f.situacao = 'na_fila'
       order by f.criado_em, f.id
       limit greatest(1, least(coalesce(p_limite, 1), 200))
         for update skip locked
    )
    update public.sms_envios e
       set situacao   = 'enviando',
           tentado_em = now()
      from lote
     where e.id = lote.id
    returning e.*;
end;
$$;


--
-- Name: FUNCTION sms_reservar_envios(p_campanha uuid, p_limite integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sms_reservar_envios(p_campanha uuid, p_limite integer) IS 'Reserva um lote de envios de uma campanha de SMS: os mais antigos da fila (entre 1 e 200) passam a enviando, com tentado_em = now(), e são devolvidos. FOR UPDATE SKIP LOCKED: duas chamadas ao mesmo tempo não recebem a mesma linha. Só reserva com a campanha em enviando; senão devolve vazio. Só service_role executa.';


--
-- Name: tem_papel(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tem_papel(user_id uuid, papel text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
     where id = user_id and is_active = true and papel = any(papeis)
  );
$$;


--
-- Name: tocar_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tocar_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: veiculo_entradas_so_encerra(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.veiculo_entradas_so_encerra() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: veiculos_chassi_imutavel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.veiculos_chassi_imutavel() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.chassi is distinct from old.chassi then
    raise exception 'Chassi é a identidade do veículo (spec 00) e não se troca: linha errada se corrige criando a certa, não reescrevendo esta.'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$$;


--
-- Name: vincular_auth_por_email(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vincular_auth_por_email(p_cliente uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid;
begin
  -- O candidato: usuário do Auth com o mesmo e-mail do cliente. O mais
  -- recente vence se houver duplicata histórica no Auth (não deveria haver —
  -- GoTrue impõe e-mail único por instância — mas ORDER BY custa nada).
  select u.id into v_uid
    from auth.users u
    join public.clientes c on lower(c.email) = lower(u.email)
   where c.id = p_cliente
     and c.auth_user_id is null
     and c.email is not null
   order by u.created_at desc
   limit 1;

  if v_uid is null then
    return jsonb_build_object('vinculado', false);
  end if;

  -- `auth_user_id` é UNIQUE: se este usuário já estiver preso a OUTRO
  -- cliente (dois CPFs com o mesmo e-mail — pai e filho, por exemplo), o
  -- update abaixo estoura em vez de roubar o vínculo. É o comportamento
  -- certo: e-mail compartilhado entre clientes é decisão de gente, não desta
  -- função.
  update public.clientes
     set auth_user_id = v_uid
   where id = p_cliente
     and auth_user_id is null;

  return jsonb_build_object('vinculado', true, 'auth_user_id', v_uid);
end;
$$;


--
-- Name: FUNCTION vincular_auth_por_email(p_cliente uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.vincular_auth_por_email(p_cliente uuid) IS 'Liga clientes.auth_user_id ao usuário do Auth de mesmo e-mail. Usada pela rota de fechamento de venda quando o e-mail já tinha conta. Nunca rouba vínculo existente e nunca toca em papel.';


--
-- Name: clientes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cpf_cnpj text NOT NULL,
    nome text NOT NULL,
    telefone_e164 text NOT NULL,
    email text,
    data_nascimento date,
    cep text,
    consentimento_lgpd_em timestamp with time zone,
    consentimento_canais jsonb DEFAULT '{"sms": false, "email": false, "whatsapp": false}'::jsonb,
    origem_primeiro_contato text,
    auth_user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: COLUMN clientes.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clientes.auth_user_id IS 'Usuário do Supabase Auth que entra na Caderneta. NULL = cliente sem acesso à área logada; ele não perde o programa, só a tela (manual v1.1 §6.3).';


--
-- Name: funil_etapas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funil_etapas (
    chave text NOT NULL,
    rotulo text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    tipo text DEFAULT 'aberta'::text NOT NULL,
    estagnacao_minutos integer,
    transferencia_minutos integer,
    protegida boolean DEFAULT false NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    cor text,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT funil_etapas_estagnacao_minutos_check CHECK (((estagnacao_minutos IS NULL) OR (estagnacao_minutos > 0))),
    CONSTRAINT funil_etapas_tipo_valido CHECK ((tipo = ANY (ARRAY['aberta'::text, 'ganho'::text, 'perdido'::text, 'descartado'::text]))),
    CONSTRAINT funil_etapas_transferencia_minutos_check CHECK (((transferencia_minutos IS NULL) OR (transferencia_minutos > 0)))
);


--
-- Name: TABLE funil_etapas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.funil_etapas IS 'As etapas do funil de vendas, editáveis pelo painel (2026-08-28). Antes disto elas eram um `const` dentro de LeadsKanban.tsx mais um CHECK na tabela leads — mudar o funil exigia deploy E migração. `chave` é estável e é o que `leads.situacao` grava; `rotulo` é o que se lê na tela.';


--
-- Name: COLUMN funil_etapas.estagnacao_minutos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.funil_etapas.estagnacao_minutos IS 'Minutos parado até o aviso no WhatsApp do vendedor. Em MINUTOS porque o prazo do topo do funil (15 min para um lead novo) não cabe em horas.';


--
-- Name: COLUMN funil_etapas.protegida; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.funil_etapas.protegida IS 'Avisa mas nunca transfere. Nasce true em `visita` e `negociacao` por decisão do dono em 2026-08-28: tirar o lead de quem já tem visita marcada quebra um compromisso com o cliente, não só com o vendedor.';


--
-- Name: investidores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investidores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    documento text,
    telefone text,
    email text,
    ativo boolean DEFAULT true NOT NULL,
    observacoes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    perfil_id uuid
);


--
-- Name: TABLE investidores; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.investidores IS 'Quem aporta capital na operação (briefing 2026-08-21). Não é fornecedor nem cliente — por isso não vive em `parceiros`. Desativa, não apaga.';


--
-- Name: COLUMN investidores.perfil_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.investidores.perfil_id IS 'A conta com que este investidor entra em /investidor. NULL enquanto ele só existe como registro financeiro — o vínculo é opcional de propósito: controlar o dinheiro de um sócio não exige dar login a ele.';


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text,
    created_at timestamp with time zone DEFAULT now(),
    origem_canal text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    fbclid text,
    gclid text,
    ip text,
    user_agent text,
    nome text,
    email text,
    telefone_raw text,
    telefone_normalizado text,
    telefone_variacao2 text,
    cnpj text,
    empresa text,
    score integer DEFAULT 0,
    status_qualificacao text DEFAULT 'pendente'::text,
    motivo_reprovacao text,
    respostas_raw jsonb,
    capi_meta_status text DEFAULT 'aguardando'::text,
    capi_meta_response jsonb,
    capi_meta_sent_at timestamp with time zone,
    gec_status text DEFAULT 'aguardando'::text,
    gec_response jsonb,
    gec_sent_at timestamp with time zone,
    fbc text,
    fbp text,
    modelo_interesse text,
    disponivel_estoque boolean DEFAULT false,
    preco_estoque_min numeric(10,2),
    keyword_origem text,
    telefone text,
    interesse text,
    canal text,
    veiculo_id bigint,
    situacao text DEFAULT 'novo'::text NOT NULL,
    responsavel text,
    observacoes text,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    ag_uid text,
    ref_curta text GENERATED ALWAYS AS (upper("left"(ag_uid, 8))) STORED,
    desfecho text,
    desfecho_em timestamp with time zone,
    desfecho_motivo text,
    desfecho_valor numeric(12,2),
    desfecho_nota text,
    ultimo_movimento_em timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_contato_em timestamp with time zone,
    responsavel_desde timestamp with time zone,
    responsavel_anterior text,
    transferencias integer DEFAULT 0 NOT NULL,
    alertado_em timestamp with time zone,
    alertas integer DEFAULT 0 NOT NULL,
    proximo_passo text,
    proximo_passo_vence_em timestamp with time zone,
    proximo_passo_definido_em timestamp with time zone,
    proximo_passo_definido_por text,
    carro_na_troca text,
    faixa_entrada text,
    pagamento_pretendido text,
    avaliacao jsonb,
    avaliacao_valor_ofertado numeric(12,2),
    avaliacao_valor_pago numeric(12,2),
    repasse_id uuid,
    perfil jsonb,
    CONSTRAINT leads_avaliacao_e_objeto CHECK (((avaliacao IS NULL) OR (jsonb_typeof(avaliacao) = 'object'::text))),
    CONSTRAINT leads_avaliacao_valor_ofertado_valido CHECK (((avaliacao_valor_ofertado IS NULL) OR ((avaliacao_valor_ofertado > (0)::numeric) AND (avaliacao_valor_ofertado < (100000000)::numeric)))),
    CONSTRAINT leads_avaliacao_valor_pago_valido CHECK (((avaliacao_valor_pago IS NULL) OR ((avaliacao_valor_pago > (0)::numeric) AND (avaliacao_valor_pago < (100000000)::numeric)))),
    CONSTRAINT leads_desfecho_valido CHECK (((desfecho IS NULL) OR (desfecho = ANY (ARRAY['ganho'::text, 'perdido'::text, 'descartado'::text])))),
    CONSTRAINT leads_faixa_entrada_valida CHECK (((faixa_entrada IS NULL) OR (faixa_entrada = ANY (ARRAY['sem_entrada'::text, 'ate_5k'::text, 'de_5k_a_10k'::text, 'de_10k_a_20k'::text, 'acima_20k'::text])))),
    CONSTRAINT leads_pagamento_pretendido_valido CHECK (((pagamento_pretendido IS NULL) OR (pagamento_pretendido = ANY (ARRAY['a_vista'::text, 'financiado'::text, 'com_troca'::text, 'consorcio'::text])))),
    CONSTRAINT leads_perfil_e_objeto CHECK (((perfil IS NULL) OR (jsonb_typeof(perfil) = 'object'::text)))
);


--
-- Name: TABLE leads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.leads IS 'Contatos captados no site. ATENÇÃO: schema híbrido — a tabela original é de marketing (event_id, utm_*, fbclid, gclid, capi_meta_*, score, telefone_raw) e as colunas do kanban (telefone, interesse, canal, veiculo_id, situacao, responsavel, observacoes, atualizado_em) foram acrescentadas por ALTER em 2026-08-07. A migração que "cria" a tabela é no-op em produção. PII (nome, telefone) — retenção indeterminada por decisão do dono; exclusão manual em /api/leads/gerenciar.';


--
-- Name: COLUMN leads.respostas_raw; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.respostas_raw IS 'As respostas do formulário que gerou o lead, como vieram. Na Busca sob encomenda (canal "Busca sob encomenda"): marca, modelo_desejado, investimento, pagina_origem, ano_min, tem_troca, prazo, observacao. Os opcionais gravam `null`, nunca ausência de chave — "não respondeu" e "campo não existe" precisam ser distinguíveis na leitura.';


--
-- Name: COLUMN leads.modelo_interesse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.modelo_interesse IS 'O veículo que o lead PEDIU, em texto legível ("Citroën C3"). Preenchido pela Busca sob encomenda desde 2026-09-06; nulo nos leads que nascem numa ficha, onde o veículo é `veiculo_id`. Coluna herdada da ferramenta de marketing que criou esta tabela.';


--
-- Name: COLUMN leads.disponivel_estoque; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.disponivel_estoque IS 'O que a pessoa pediu estava à venda no momento do lead? `false` nos pedidos de Busca sob encomenda, que existem justamente porque o hub estava vazio. É o corte que separa demanda atendida de demanda perdida.';


--
-- Name: COLUMN leads.telefone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.telefone IS 'Somente dígitos, com DDI 55. PII: nunca expor em rota pública nem em log.';


--
-- Name: COLUMN leads.ag_uid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.ag_uid IS 'UUID de rastreio da sessao do visitante, o mesmo que vai no webhook do n8n (ag_uid) e no externalId da CAPI. NULL quando o visitante chegou sem cookie de rastreio: o literal "ag_ref_nao_localizado" NAO e gravado — codigo de erro interno nao vira dado. NULL tambem em todo lead anterior a 2026-08-26, que e quando a coluna nasceu.';


--
-- Name: COLUMN leads.ref_curta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.ref_curta IS 'O "(Ref: 0DCB1CDC)" que o cliente le na mensagem pre-preenchida — os 8 primeiros do ag_uid em caixa alta. GERADA: o banco calcula, ninguem escreve, e por isso ela nunca discorda do ag_uid. E por ela que o painel acha o lead a partir do codigo que chegou no WhatsApp. Espelha refCurta() em src/lib/telemetry.ts.';


--
-- Name: COLUMN leads.desfecho; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.desfecho IS 'Como o negócio terminou: ganho, perdido ou descartado (2026-08-28). `descartado` é o lead que nunca foi lead — spam, teste, contato equivocado — e existe para SAIR da conta: a taxa de conversão é ganhos/(ganhos+perdidos), e sem o terceiro tipo cada robô que preenche o formulário baixa o número da loja.';


--
-- Name: COLUMN leads.desfecho_motivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.desfecho_motivo IS 'Chave de `funil_motivos`. É a coluna que o relatório agrupa — e a razão de a etapa terminal, sozinha, não bastar.';


--
-- Name: COLUMN leads.ultimo_contato_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.ultimo_contato_em IS 'O relógio da estagnação. Qualquer toque HUMANO no lead o reinicia — mover de etapa, anotar, trocar de dono, abrir a conversa no WhatsApp pelo card. A transferência automática NÃO reinicia: senão o lead transferido nasceria com o prazo zerado e o dono novo teria o dobro do tempo do antigo.';


--
-- Name: COLUMN leads.proximo_passo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.proximo_passo IS 'O que o vendedor combinou fazer a seguir (2026-09-23). Opcional desde 2026-10-09: nem todo atendimento termina com um passo combinado. Só o meio passo (texto sem data ou data sem texto) é recusado, aqui e em `decidirInteracao` (lib/gestaoDoLead). É o que o card mostra.';


--
-- Name: COLUMN leads.proximo_passo_vence_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.proximo_passo_vence_em IS 'Quando o próximo passo vence. Ordena a Lista do dia (Atrasados / Hoje / Próximos).';


--
-- Name: COLUMN leads.faixa_entrada; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.faixa_entrada IS 'Quanto o cliente pretende dar de entrada, em faixas: sem_entrada, ate_5k, de_5k_a_10k, de_10k_a_20k, acima_20k.';


--
-- Name: COLUMN leads.pagamento_pretendido; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.pagamento_pretendido IS 'Como o cliente pretende pagar. As MESMAS chaves dos motivos de ganho (a_vista, financiado, com_troca, consorcio), para a caixa de ganho abrir com o motivo que casa pré-selecionado. Check e não FK: motivo é editável e desativável, e desativar não pode apagar a intenção registrada no lead.';


--
-- Name: COLUMN leads.avaliacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.avaliacao IS 'Retrato do formulário público /avaliacao no instante do envio: tipo de veículo, marca, modelo, ano, quilometragem, estado mecânico e de conservação, observações, a FIPE consultada (valor, código, mês de referência) e a recomendação de faixa de compra COM a regra que a produziu (src/lib/avaliacaoRecomendacao.ts). Montado no servidor e gravado pela chave de serviço em /api/avaliacao — a recomendação é recalculada lá, nunca copiada do corpo da requisição. O cliente nunca vê a recomendação: só a equipe lê (RLS is_staff). É retrato, não ficha: nenhuma tela o edita (o PATCH de /api/leads/gerenciar não aceita o campo); o que a vistoria apurou vai para avaliacao_valor_ofertado/pago. Nulo nos leads que não vieram da avaliação e nos anteriores a 2026-09-24. Sempre objeto JSON (CHECK leads_avaliacao_e_objeto).';


--
-- Name: COLUMN leads.avaliacao_valor_ofertado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.avaliacao_valor_ofertado IS 'Quanto o consultor OFERECEU pelo carro depois da vistoria, em R$. Preenchido pelo consultor no card do kanban (PATCH /api/leads/gerenciar). Nulo = ainda não houve oferta. Posto ao lado da recomendação guardada em `avaliacao`, mostra quanto a régua do site erra antes da vistoria. Maior que zero e menor que R$ 100 milhões (CHECK leads_avaliacao_valor_ofertado_valido).';


--
-- Name: COLUMN leads.avaliacao_valor_pago; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.avaliacao_valor_pago IS 'Quanto a loja PAGOU de fato pelo carro, em R$ — o dado que recalibra a régua de compra (FIPE consultada x recomendação x valor pago). Preenchido pelo consultor no card do kanban (PATCH /api/leads/gerenciar) quando a compra fecha. Nulo = não comprou, ou ainda não. Maior que zero e menor que R$ 100 milhões (CHECK leads_avaliacao_valor_pago_valido).';


--
-- Name: COLUMN leads.perfil; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.perfil IS 'Retrato do quiz do Garagem Profiler (/carro-perfeito) no instante do envio: orçamento, o que o carro vai levar, jeitos/carrocerias, câmbio, o que não pode faltar, prazo, filtros afrouxados, os carros escolhidos (id, nome, preço, lugar, manchete, pesa contra), o texto livre da aba DESCREVER e quantos carros passavam na faixa. Montado e validado no servidor por montarPerfilDoLead (src/lib/perfilDoLead.ts) em /api/leads a partir de intencao_busca, e gravado pela chave de serviço. É o que o cliente DISSE ao site, não dado auditado: preços e carros vêm do navegador, e o id do carro é o número do anúncio, sem FK. Só a equipe lê (RLS is_staff). É retrato, não ficha: nenhuma tela o edita (o PATCH de /api/leads/gerenciar não aceita o campo). Nulo nos leads que não vieram do Profiler e nos anteriores a 2026-09-25. Sempre objeto JSON (CHECK leads_perfil_e_objeto).';


--
-- Name: parceiros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parceiros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    tipo text NOT NULL,
    documento text,
    telefone text,
    email text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    ativo boolean DEFAULT true NOT NULL,
    cidade text,
    observacoes text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT parceiros_tipo_check CHECK ((tipo = ANY (ARRAY['fornecedor'::text, 'cliente'::text, 'ambos'::text])))
);


--
-- Name: COLUMN parceiros.ativo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parceiros.ativo IS 'Falso = some das listas de escolha, permanece no histórico (2026-08-24). Fornecedor com conta paga no passado nunca pode ser apagado.';


--
-- Name: parceiros_ciclo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parceiros_ciclo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    nome text NOT NULL,
    cidade text,
    comissao_pct numeric(5,2),
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agenda_de_pessoas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.agenda_de_pessoas WITH (security_invoker='true') AS
 SELECT 'financeiro'::text AS origem,
    p.id,
    p.nome,
    p.tipo AS papel,
    NULL::text AS especialidade,
    p.documento,
    p.telefone,
    p.email,
    p.cidade,
    p.observacoes,
    p.ativo,
    p.created_at
   FROM public.parceiros p
UNION ALL
 SELECT 'ciclo'::text AS origem,
    c.id,
    c.nome,
    'cliente'::text AS papel,
    NULL::text AS especialidade,
    c.cpf_cnpj AS documento,
    c.telefone_e164 AS telefone,
    c.email,
    NULL::text AS cidade,
    NULL::text AS observacoes,
    true AS ativo,
    c.created_at
   FROM public.clientes c
UNION ALL
 SELECT 'rede'::text AS origem,
    r.id,
    r.nome,
    'prestador'::text AS papel,
    r.tipo AS especialidade,
    NULL::text AS documento,
    NULL::text AS telefone,
    NULL::text AS email,
    r.cidade,
    NULL::text AS observacoes,
    COALESCE(r.ativo, true) AS ativo,
    r.created_at
   FROM public.parceiros_ciclo r
UNION ALL
 SELECT 'investidores'::text AS origem,
    i.id,
    i.nome,
    'investidor'::text AS papel,
    NULL::text AS especialidade,
    i.documento,
    i.telefone,
    i.email,
    NULL::text AS cidade,
    i.observacoes,
    i.ativo,
    i.created_at
   FROM public.investidores i
UNION ALL
 SELECT 'lead'::text AS origem,
    COALESCE(l.id, d.id) AS id,
    COALESCE(l.nome, d.nome) AS nome,
    'lead'::text AS papel,
    COALESCE(e.rotulo, l.situacao) AS especialidade,
    NULL::text AS documento,
    COALESCE(l.telefone, d.telefone) AS telefone,
    COALESCE(l.email, d.email) AS email,
    NULL::text AS cidade,
    NULLIF(concat_ws(' — '::text, NULLIF(TRIM(BOTH FROM l.interesse), ''::text), NULLIF(TRIM(BOTH FROM l.observacoes), ''::text)), ''::text) AS observacoes,
    COALESCE(d.ativo, ((l.desfecho IS NULL) OR (l.desfecho = 'ganho'::text))) AS ativo,
    COALESCE(l.created_at, d.created_at) AS created_at
   FROM ((public.leads l
     FULL JOIN public.pessoas_dos_leads() d(id, nome, telefone, email, ativo, created_at) ON ((d.id = l.id)))
     LEFT JOIN public.funil_etapas e ON ((e.chave = l.situacao)));


--
-- Name: VIEW agenda_de_pessoas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.agenda_de_pessoas IS 'Clientes, fornecedores, prestadores, investidores e leads num formato só (2026-08-24; leads em 2026-08-28). security_invoker: a RLS de cada tabela-base vale na pele de quem consulta. A PESSOA de origem lead (nome, telefone, e-mail, ativo, data) é de toda a equipe ativa, por pessoas_dos_leads(); a parte COMERCIAL (especialidade = etapa do funil; observacoes = interesse e anotações) só aparece para quem enxerga o lead pela RLS de leads, e vem NULL para os demais (2026-10-05). Lead ativo = em aberto ou ganho. Fontes unidas neste banco: parceiros, clientes, parceiros_ciclo, investidores, leads. Fonte ausente aqui significa tabela ausente no banco, não filtro.';


--
-- Name: anuncios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anuncios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    veiculo_id uuid NOT NULL,
    portal text NOT NULL,
    id_externo text,
    status text DEFAULT 'publicado'::text NOT NULL,
    erro text,
    versao jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    CONSTRAINT anuncios_status_check CHECK ((status = ANY (ARRAY['publicado'::text, 'despublicado'::text, 'erro'::text])))
);


--
-- Name: TABLE anuncios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.anuncios IS 'Anúncio VERSIONADO (spec 50): cada publicação é uma linha imutável presa à unidade — o anúncio integra o contrato (CDC art. 30) e isto é prova. Status novo = linha nova; o integrador de portais chega na F2.';


--
-- Name: apolices_seguro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apolices_seguro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    seguradora text NOT NULL,
    numero_apolice text,
    corretora_parceira text,
    premio numeric(12,2),
    comissao_motors numeric(12,2),
    vigencia_inicio date NOT NULL,
    vigencia_fim date NOT NULL,
    renovada_em date
);


--
-- Name: atendimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.atendimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    chatwoot_contact_id bigint,
    chatwoot_conversation_id bigint,
    inbox_id integer,
    status_conversa text,
    team_id integer,
    tags text[],
    iniciado_em timestamp without time zone,
    encerrado_em timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    humano_assumiu_em timestamp with time zone,
    com_assistente boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN atendimentos.lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.atendimentos.lead_id IS 'O lead que originou o atendimento, quando há. NULO é caso legítimo: quem escreve no WhatsApp sem passar por formulário nunca teve lead. Também fica nulo quando o lead é eliminado a pedido do titular.';


--
-- Name: COLUMN atendimentos.chatwoot_conversation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.atendimentos.chatwoot_conversation_id IS 'Id da conversa no Chatwoot. Escrito pelo n8n a partir do webhook; é o que o card do kanban usa para abrir a conversa no lugar do wa.me. Único: uma linha por conversa.';


--
-- Name: COLUMN atendimentos.humano_assumiu_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.atendimentos.humano_assumiu_em IS 'Quando um humano assumiu esta conversa, tirando o assistente do circuito. Entra como mais um candidato no greatest() de `parado_desde`: a transferência REINICIA o relógio do SLA, e um atendimento humano posterior continua valendo por cima dela. Nulo é o caso normal — ou o assistente ainda está com a conversa, ou ela nunca passou por ele. Escrito pelo n8n.';


--
-- Name: COLUMN atendimentos.com_assistente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.atendimentos.com_assistente IS 'O assistente (Ney) está com esta conversa AGORA. Enquanto for verdade, o lead não estagna, não é transferido e conta zero minuto parado. O padrão é FALSE de propósito: ausência de informação tem de significar o comportamento de sempre, senão o SLA se desliga sozinho e em silêncio. Escrito pelo n8n a partir do webhook do Chatwoot.';


--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    usuario_id uuid NOT NULL,
    acao text NOT NULL,
    alvo text,
    detalhe jsonb DEFAULT '{}'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE auditoria; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.auditoria IS 'Trilha do núcleo (D-T1.2) — convive com auditoria_admin, que segue sendo do painel legado. Append-only como veiculo_eventos.';


--
-- Name: auditoria_admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria_admin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    acao text NOT NULL,
    detalhe text,
    autor_id uuid,
    autor_nome text,
    registrado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE auditoria_admin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.auditoria_admin IS 'Trilha de ações sensíveis do painel (A17): permissões, paleta, texto legal. Append-only via RLS — sem policy de UPDATE/DELETE.';


--
-- Name: cabecalho_dos_guias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cabecalho_dos_guias (
    secao text DEFAULT 'guias'::text NOT NULL,
    titulo_seo text,
    resumo text,
    atualizado_por uuid,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cabecalho_dos_guias_linha_unica CHECK ((secao = 'guias'::text)),
    CONSTRAINT cabecalho_dos_guias_resumo_teto CHECK (((resumo IS NULL) OR (length(resumo) <= 300))),
    CONSTRAINT cabecalho_dos_guias_titulo_seo_teto CHECK (((titulo_seo IS NULL) OR (length(titulo_seo) <= 300)))
);


--
-- Name: TABLE cabecalho_dos_guias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cabecalho_dos_guias IS 'Override do cabeçalho da seção /guias (título de busca e resumo). Linha única, e tabela vazia é o estado normal: sem linha, ou com campo nulo/vazio, vale o texto de src/lib/guias.ts. O NOME da seção não está aqui de propósito — ele alimenta seis superfícies e fica no código, com trava de teste.';


--
-- Name: COLUMN cabecalho_dos_guias.secao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cabecalho_dos_guias.secao IS 'Chave fixa: guias. O CHECK e a PK juntos garantem uma linha só — não existe segunda seção com cabeçalho editável.';


--
-- Name: COLUMN cabecalho_dos_guias.titulo_seo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cabecalho_dos_guias.titulo_seo IS 'O <title> da aba, SEM o sufixo " | Motors Store", que a página acrescenta. Nulo ou vazio = TITULO_SEO_DA_SECAO.';


--
-- Name: COLUMN cabecalho_dos_guias.resumo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cabecalho_dos_guias.resumo IS 'O resumo que serve quatro superfícies (sob o h1, meta description, card de compartilhamento e preview do painel). Nulo ou vazio = RESUMO_DA_SECAO. O teto de 300 é sanidade; a régua de 155 é aviso de interface, não recusa do banco.';


--
-- Name: COLUMN cabecalho_dos_guias.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cabecalho_dos_guias.atualizado_em IS 'Carimbado pelo servidor em todo UPDATE. Num INSERT o valor informado vence.';


--
-- Name: ciclo_parametros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ciclo_parametros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    intervalo_km integer NOT NULL,
    intervalo_meses integer NOT NULL,
    janela_dias integer NOT NULL,
    janela_km integer NOT NULL,
    doc_prazo_dias integer NOT NULL,
    recupera_dias integer NOT NULL,
    max_recuperacoes_ciclo integer NOT NULL,
    franquia_km_ano integer NOT NULL,
    percentuais jsonb NOT NULL,
    seed_validado_em date,
    excludentes text[] NOT NULL,
    descricao text,
    vigencia_desde date DEFAULT CURRENT_DATE NOT NULL,
    vigencia_ate date,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ciclo_parametros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ciclo_parametros IS 'Parâmetros do Motors Ciclo como DADO (Emenda 02): o contrato guarda os do dia da assinatura. seed_validado_em nulo = percentual ainda não batido contra o praticado da casa — nenhum contrato assina antes disso (manual v1.2 §1.4). A trava pleno×FIPE ≤ praticado − margem alvo aplica-se na F1, com a margem alvo que o dono ainda vai fixar (Anexo 9).';


--
-- Name: confirmacoes_disponibilidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.confirmacoes_disponibilidade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    veiculo_id uuid NOT NULL,
    entrada_id uuid NOT NULL,
    confirmada_por uuid NOT NULL,
    valida_ate timestamp with time zone NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT validade_no_futuro CHECK ((valida_ate > criado_em))
);


--
-- Name: TABLE confirmacoes_disponibilidade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.confirmacoes_disponibilidade IS 'A trava anti venda dupla de unidade de terceiro (spec 00/10): sinal e venda exigem confirmação VIGENTE do dono/parceiro. Append-only desde 2026-08-29 — prorrogar validade seria reescrever um fato datado; quem precisa de prazo novo pede confirmação nova.';


--
-- Name: conformidade_diaria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conformidade_diaria (
    dia date NOT NULL,
    veiculos_ciclo_ativo integer NOT NULL,
    veiculos_com_revisao_devida integer NOT NULL,
    veiculos_em_dia integer NOT NULL,
    pct numeric(5,2),
    calculada_em timestamp with time zone DEFAULT now() NOT NULL,
    retroativa boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN conformidade_diaria.pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conformidade_diaria.pct IS 'NULL quando não há veículo com revisão devida. NULL não é zero: zero seria dizer que ninguém cumpriu, e a diferença importa na série do §1.4.';


--
-- Name: COLUMN conformidade_diaria.retroativa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conformidade_diaria.retroativa IS 'true = a linha foi preenchida depois do dia, reconstruída do estado atual. Vale para a série do §1.4; o painel A22 a exibe com essa ressalva.';


--
-- Name: consultas_de_modelo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consultas_de_modelo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    tipo text NOT NULL,
    marca_codigo text NOT NULL,
    modelo_codigo text NOT NULL,
    ano text NOT NULL,
    rotulo text NOT NULL,
    codigo_fipe text,
    modo text NOT NULL,
    referencia date NOT NULL,
    fipe_atual numeric(12,2) NOT NULL,
    meses_na_serie integer DEFAULT 0 NOT NULL,
    chamadas_pagas integer DEFAULT 0 NOT NULL,
    custo numeric(10,2),
    homologacao boolean DEFAULT false NOT NULL,
    criado_por uuid DEFAULT auth.uid() NOT NULL,
    criado_por_nome text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consultas_de_modelo_chamadas_validas CHECK ((chamadas_pagas >= 0)),
    CONSTRAINT consultas_de_modelo_codigos_validos CHECK (((marca_codigo ~ '^[0-9]{1,6}$'::text) AND (modelo_codigo ~ '^[0-9]{1,6}$'::text) AND (ano ~ '^[0-9]{4}-[0-9]{1,2}$'::text))),
    CONSTRAINT consultas_de_modelo_custo_valido CHECK (((custo IS NULL) OR (custo >= (0)::numeric))),
    CONSTRAINT consultas_de_modelo_fipe_valida CHECK ((fipe_atual > (0)::numeric)),
    CONSTRAINT consultas_de_modelo_meses_validos CHECK ((meses_na_serie >= 0)),
    CONSTRAINT consultas_de_modelo_modo_valido CHECK ((modo = ANY (ARRAY['pontual'::text, 'completa'::text]))),
    CONSTRAINT consultas_de_modelo_referencia_e_mes CHECK ((EXTRACT(day FROM referencia) = (1)::numeric)),
    CONSTRAINT consultas_de_modelo_rotulo_valido CHECK (((length(btrim(rotulo)) >= 1) AND (length(btrim(rotulo)) <= 200))),
    CONSTRAINT consultas_de_modelo_tipo_valido CHECK ((tipo = ANY (ARRAY['carros'::text, 'motos'::text, 'caminhoes'::text])))
);


--
-- Name: TABLE consultas_de_modelo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consultas_de_modelo IS 'Registro de cada análise de modelo concluída na tela "Consulta de veículos" (abas de modelo), pedido do dono em 2026-10-08: o histórico pesquisável da equipe e a conta do que se gastou. Uma linha por análise que deu certo. Só inclusão: ninguém edita nem apaga. Lê e inclui quem a matriz deixa consultar placa (Administrador, Gestor, Comercial). Os VALORES por mês moram em fipe_historico. Ver 20261008120000_consultas_de_modelo.sql.';


--
-- Name: COLUMN consultas_de_modelo.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.tipo IS 'O tipo de veículo na API da FIPE: carros, motos ou caminhoes.';


--
-- Name: COLUMN consultas_de_modelo.marca_codigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.marca_codigo IS 'Código da marca na API da FIPE (o da cascata de seleção), só dígitos.';


--
-- Name: COLUMN consultas_de_modelo.modelo_codigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.modelo_codigo IS 'Código do modelo na API da FIPE (o da cascata de seleção), só dígitos.';


--
-- Name: COLUMN consultas_de_modelo.ano; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.ano IS 'Ano-modelo e combustível como a API da FIPE os junta: "2022-1".';


--
-- Name: COLUMN consultas_de_modelo.rotulo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.rotulo IS 'O nome legível do modelo analisado ("VW - VolksWagen T-Cross Highline 1.4 TSI 2022"), até 200 caracteres. É por ele que a busca do histórico procura.';


--
-- Name: COLUMN consultas_de_modelo.codigo_fipe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.codigo_fipe IS 'O código FIPE oficial do modelo ("005528-0"), quando a API o devolveu.';


--
-- Name: COLUMN consultas_de_modelo.modo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.modo IS '''pontual'' (grátis: só o mês corrente) ou ''completa'' (a série, com os meses fora do plano gratuito pagos à APIBrasil).';


--
-- Name: COLUMN consultas_de_modelo.referencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.referencia IS 'O mês de tabela da análise, sempre no dia 1º (o mesmo formato de fipe_historico.referencia).';


--
-- Name: COLUMN consultas_de_modelo.fipe_atual; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.fipe_atual IS 'O valor FIPE do modelo no mês de referência, em reais.';


--
-- Name: COLUMN consultas_de_modelo.meses_na_serie; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.meses_na_serie IS 'Quantos meses a série da análise trouxe com valor.';


--
-- Name: COLUMN consultas_de_modelo.chamadas_pagas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.chamadas_pagas IS 'Quantas chamadas pagas ao fornecedor esta análise fez (o chamadasPagas de mercadoPorModelo-servidor). Zero no modo pontual.';


--
-- Name: COLUMN consultas_de_modelo.custo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.custo IS 'O que o fornecedor cobrou por esta análise, em reais, como ele informou. Nulo se ele não disse; zero em homologação.';


--
-- Name: COLUMN consultas_de_modelo.homologacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.homologacao IS 'A análise rodou no modo de teste do fornecedor: não foi cobrada e os valores pagos eram de exemplo. Não entra na conta do gasto.';


--
-- Name: COLUMN consultas_de_modelo.criado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.criado_por IS 'auth.uid() de quem analisou. Com sessão, é o gatilho que grava; sem sessão (chave de serviço) quem grava tem de informar.';


--
-- Name: COLUMN consultas_de_modelo.criado_por_nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.criado_por_nome IS 'Nome de quem analisou (autor_atual()), para continuar legível quando a pessoa sair da loja. Com sessão, é o gatilho que grava.';


--
-- Name: COLUMN consultas_de_modelo.criado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_modelo.criado_em IS 'Quando a análise foi registrada. Com sessão, é o gatilho que grava (now()): é a data que conta no gasto do mês.';


--
-- Name: consultas_de_placa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consultas_de_placa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    placa text NOT NULL,
    produto text NOT NULL,
    homologacao boolean DEFAULT false NOT NULL,
    retrato jsonb NOT NULL,
    custo numeric(10,2),
    consultado_por uuid,
    consultado_por_nome text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consultas_de_placa_custo_valido CHECK (((custo IS NULL) OR (custo >= (0)::numeric))),
    CONSTRAINT consultas_de_placa_placa_valida CHECK ((placa ~ '^[A-Z]{3}[0-9]([0-9]|[A-Z])[0-9]{2}$'::text)),
    CONSTRAINT consultas_de_placa_produto_conhecido CHECK ((produto = 'veiculos-total'::text)),
    CONSTRAINT consultas_de_placa_retrato_da_placa CHECK ((homologacao OR ((retrato ->> 'placa'::text) = placa))),
    CONSTRAINT consultas_de_placa_retrato_e_objeto CHECK ((jsonb_typeof(retrato) = 'object'::text)),
    CONSTRAINT consultas_de_placa_sem_dado_pessoal CHECK (((retrato)::text !~* '"(proprietario|pronome|pronomeAnterior|cpfCnpj|cpf|documentoFinanciado|restricaoArrendatario|restricaoDocArrendatario|email|cellphone)"\s*:'::text))
);


--
-- Name: TABLE consultas_de_placa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consultas_de_placa IS 'Consultas de placa feitas à APIBrasil para avaliar carro oferecido à loja (2026-10-06). Uma linha por consulta PAGA; a mais recente de cada placa é a que o painel abre, e é ela que evita cobrar a mesma placa duas vezes. Só inclusão: ninguém edita nem apaga. Lê e inclui quem a matriz deixa (Administrador, Gestor, Comercial). Ver 20261006180000_consultas_de_placa.sql.';


--
-- Name: COLUMN consultas_de_placa.placa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_placa.placa IS 'A placa consultada, em maiúsculas e sem separador (ABC1234 ou ABC1D23).';


--
-- Name: COLUMN consultas_de_placa.produto; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_placa.produto IS 'O produto do fornecedor que respondeu. Hoje só ''veiculos-total'' (APIBrasil).';


--
-- Name: COLUMN consultas_de_placa.homologacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_placa.homologacao IS 'A consulta rodou no modo de teste do fornecedor: não foi cobrada e o retrato é o exemplo dele, de outra placa. Nunca serve para decidir compra.';


--
-- Name: COLUMN consultas_de_placa.retrato; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_placa.retrato IS 'O retrato do carro, montado por lerRespostaDaApiBrasil (src/lib/consultaDePlaca.ts) por lista positiva de campos. SEM dado pessoal: nome e CPF de proprietário e de financiado não entram, e o CHECK consultas_de_placa_sem_dado_pessoal recusa as chaves. A resposta crua do fornecedor não é gravada em lugar nenhum.';


--
-- Name: COLUMN consultas_de_placa.custo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_placa.custo IS 'O que o fornecedor cobrou por esta consulta, em reais, como ele informou (campo `tax`). Nulo se ele não disse; zero em homologação.';


--
-- Name: COLUMN consultas_de_placa.consultado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_placa.consultado_por IS 'auth.uid() de quem consultou. Com sessão, é o gatilho que grava.';


--
-- Name: COLUMN consultas_de_placa.consultado_por_nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultas_de_placa.consultado_por_nome IS 'Nome de quem consultou (autor_atual()), para continuar legível quando a pessoa sair da loja.';


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telefone character varying(20) NOT NULL,
    nome text,
    email text,
    cidade text,
    estado text,
    cliente_ativo boolean DEFAULT false,
    primeira_origem text,
    primeiro_atendimento timestamp without time zone,
    ultimo_atendimento timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: contratos_ciclo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos_ciclo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    plano text NOT NULL,
    garantia_meses integer NOT NULL,
    garantia_fim date NOT NULL,
    mensalidade numeric(12,2),
    recompra_habilitada boolean DEFAULT false,
    recompra_valor numeric(12,2),
    recompra_janela_ini date,
    recompra_janela_fim date,
    km_limite_anual integer DEFAULT 15000,
    status_elegibilidade text DEFAULT 'elegivel'::text,
    motivo_perda text,
    assinado_em timestamp with time zone,
    url_contrato text
);


--
-- Name: contratos_financiamento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contratos_financiamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    instituicao text NOT NULL,
    valor_financiado numeric(12,2) NOT NULL,
    valor_entrada numeric(12,2),
    taxa_mensal numeric(8,6) NOT NULL,
    prazo_meses integer NOT NULL,
    valor_parcela numeric(12,2) NOT NULL,
    data_primeira_parcela date NOT NULL,
    sistema_amortizacao text DEFAULT 'PRICE'::text,
    status text DEFAULT 'ativo'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: documentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    tipo text NOT NULL,
    owner_tipo text NOT NULL,
    owner_id uuid NOT NULL,
    titulo text,
    url text,
    validade date,
    pendente boolean DEFAULT false NOT NULL,
    detalhe jsonb DEFAULT '{}'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    CONSTRAINT documentos_owner_tipo_check CHECK ((owner_tipo = ANY (ARRAY['veiculo'::text, 'pessoa'::text, 'negocio'::text]))),
    CONSTRAINT documentos_tipo_check CHECK ((tipo = ANY (ARRAY['DUT'::text, 'CRV'::text, 'CNH'::text, 'contrato'::text, 'laudo'::text, 'termo'::text, 'NF'::text])))
);


--
-- Name: TABLE documentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.documentos IS 'Documentos por dono (spec 60): veículo, pessoa ou negócio. Pendência bloqueia ENTREGA_LIBERADA — o gate entra com o fluxo de entrega (F1); a marca nasce aqui.';


--
-- Name: erros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    origem text NOT NULL,
    natureza text NOT NULL,
    assunto text NOT NULL,
    mensagem text NOT NULL,
    stack text,
    rota text,
    metodo text,
    url text,
    navegador text,
    release text,
    ambiente text DEFAULT 'desconhecido'::text NOT NULL,
    digest text,
    ag_uid text,
    lead_id uuid,
    hash_agrupamento text NOT NULL,
    suprimidas integer DEFAULT 0 NOT NULL,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    resolvido_em timestamp with time zone,
    resolvido_por uuid,
    CONSTRAINT erros_assunto_com_teto CHECK ((length(assunto) <= 80)),
    CONSTRAINT erros_hash_em_hex CHECK ((hash_agrupamento ~ '^[0-9a-f]{8,64}$'::text)),
    CONSTRAINT erros_mensagem_com_teto CHECK ((length(mensagem) <= 2000)),
    CONSTRAINT erros_natureza_valida CHECK ((natureza = ANY (ARRAY['quebra'::text, 'ambos'::text]))),
    CONSTRAINT erros_origem_valida CHECK ((origem = ANY (ARRAY['navegador'::text, 'servidor'::text]))),
    CONSTRAINT erros_stack_com_teto CHECK ((length(stack) <= 8000)),
    CONSTRAINT erros_suprimidas_nao_negativa CHECK ((suprimidas >= 0))
);


--
-- Name: TABLE erros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.erros IS 'Fila de triagem da natureza `quebra` (spec de observabilidade §12). Escrita SEMPRE pela chave de serviço — onRequestError, /api/erros e catch de rota; o staff só marca como resolvido. ⚠️ `mensagem` e `stack` podem conter PII por acidente (erro do PostgREST cita valores): a higienização é da APLICAÇÃO, o banco não garante. Retenção de 90 dias por `limpar_erros_antigos()`, chamada pelo n8n.';


--
-- Name: COLUMN erros.natureza; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros.natureza IS 'Só `quebra` e `ambos`. `parada` não é linha desta tabela — parada de negócio vai para o WhatsApp (§3), e é justamente o alerta que não pode depender do que quebrou.';


--
-- Name: COLUMN erros.digest; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros.digest IS 'O digest que o Next atribui ao erro de servidor. É o que liga a linha gravada pelo navegador (error.tsx só recebe o digest) à linha que o servidor já gravou pelo mesmo erro — em produção o boundary explícito NÃO dispara o evento `error` da window.';


--
-- Name: COLUMN erros.ag_uid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros.ag_uid IS 'Identificador de navegação que /api/leads já grava. É o elo com o lead sem copiar nome, e-mail ou telefone para cá — a ficha do lead já os tem, e uma segunda cópia seria uma segunda retenção.';


--
-- Name: COLUMN erros.lead_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros.lead_id IS 'NULO na v1: o insert das rotas de lead não tem `.select()`, então o id não existe no instante do erro. Nasce para o PR 3. `on delete set null` porque `leads` tem exclusão do titular (LGPD art. 18, VI).';


--
-- Name: COLUMN erros.hash_agrupamento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros.hash_agrupamento IS 'FNV-1a do assunto + mensagem normalizada (números → `#`, uuid → `<uuid>`), calculado em TypeScript. O CHECK aqui garante só a FORMA (hex, 8–64): a normalização vive num lugar só, porque a captura do navegador roda antes de qualquer banco e a app é a única escritora.';


--
-- Name: COLUMN erros.suprimidas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros.suprimidas IS 'Quantas ocorrências do MESMO hash a carência de 10 s engoliu antes desta linha. Enxurrada em página quente daria uma gravação por requisição; o contador vive na instância e viaja na linha seguinte — mesmo desenho da carência de `alertaDeFalha`.';


--
-- Name: COLUMN erros.resolvido_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erros.resolvido_por IS 'Quem, no staff, marcou como resolvido. ⚠️ Nada no banco amarra este valor a `auth.uid()` hoje — o grant por coluna impede reescrever a MENSAGEM, não atribuir a resolução a um colega. Se a tela do PR 2 expuser o campo, o guarda (`with check ... resolvido_por = auth.uid()`) entra lá, com a régua de reabertura decidida junto.';


--
-- Name: estoque_motors_nativo_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.estoque_motors_nativo_seq
    AS integer
    START WITH 900000001
    INCREMENT BY 1
    MINVALUE 900000001
    NO MAXVALUE
    CACHE 1;


--
-- Name: SEQUENCE estoque_motors_nativo_seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON SEQUENCE public.estoque_motors_nativo_seq IS 'Ids dos veículos nascidos no painel. Faixa disjunta da do feed (6,1M–8,4M) — por isso o INSERT do sync nunca colide com nativo.';


--
-- Name: estoque_motors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estoque_motors (
    id integer DEFAULT nextval('public.estoque_motors_nativo_seq'::regclass) NOT NULL,
    marca character varying(100) NOT NULL,
    modelo character varying(100) NOT NULL,
    versao character varying(100),
    ano integer NOT NULL,
    ano_fabricacao integer,
    preco numeric(12,2) NOT NULL,
    preco_original numeric(12,2),
    preco_promocional numeric(12,2),
    quilometragem integer,
    cambio character varying(50),
    combustivel character varying(50),
    cor character varying(50),
    tipo character varying(50),
    perfil_uso character varying(50),
    url_imagem text,
    link_conversao text,
    pericia character varying(100),
    whatsapp_images jsonb,
    web_full_images jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    descricao text,
    laudo_pericia text,
    opcionais text,
    status_tag text,
    status_tag_color text,
    vendido boolean DEFAULT false,
    last_seen_at timestamp with time zone DEFAULT now(),
    placa text,
    motor text,
    cor_interna text,
    donos_anteriores integer,
    garantia_fabrica text,
    preco_compra numeric(12,2),
    conteudo_atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    descricao_seo text,
    chassi text,
    valor_fipe numeric(12,2),
    codigo_fipe text,
    first_seen_at timestamp with time zone DEFAULT now(),
    modelo_override text,
    versao_override text,
    perfis_uso text[],
    origem text DEFAULT 'sync'::text NOT NULL,
    renavam text,
    estado_cadastro text DEFAULT 'rascunho'::text NOT NULL,
    portas smallint,
    em_preparacao boolean DEFAULT false NOT NULL,
    previsao_chegada_em timestamp with time zone,
    CONSTRAINT estoque_motors_em_preparacao_tem_data CHECK (((NOT em_preparacao) OR (previsao_chegada_em IS NOT NULL))),
    CONSTRAINT estoque_motors_estado_valido CHECK ((estado_cadastro = ANY (ARRAY['rascunho'::text, 'publicado'::text, 'arquivado'::text]))),
    CONSTRAINT estoque_motors_origem_valida CHECK ((origem = ANY (ARRAY['sync'::text, 'painel'::text]))),
    CONSTRAINT estoque_motors_portas_plausivel CHECK (((portas IS NULL) OR ((portas >= 1) AND (portas <= 8))))
);


--
-- Name: TABLE estoque_motors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.estoque_motors IS 'Inventário, espelho do feed XML do RevendaMais (sync n8n a cada 6h). Renomeada de `veiculos` em 2026-08-03 para alinhar com CLAUDE.md e o manual do Motors Ciclo. Schema ainda não verificado — AUDITORIA.md §5.3.';


--
-- Name: COLUMN estoque_motors.last_seen_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.last_seen_at IS 'Instante do último upsert vindo do feed RevendaMais. Carimbado pelo workflow n8n. Linhas com carimbo anterior ao ciclo mais recente sairam do feed e nao sao exibidas no site — ver getEstoque() em src/lib/supabase.ts.';


--
-- Name: COLUMN estoque_motors.placa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.placa IS 'Preenchida pelo painel. NUNCA entra no mapeamento do sync n8n — ver contrato na migração 20260807160000.';


--
-- Name: COLUMN estoque_motors.motor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.motor IS 'Ficha própria do painel (ex.: "2.0 turbo · 249 cv"). Fora do sync.';


--
-- Name: COLUMN estoque_motors.cor_interna; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.cor_interna IS 'Ficha própria do painel. Fora do sync — `cor` (externa) é do feed.';


--
-- Name: COLUMN estoque_motors.donos_anteriores; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.donos_anteriores IS 'Ficha própria do painel. Fora do sync.';


--
-- Name: COLUMN estoque_motors.garantia_fabrica; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.garantia_fabrica IS 'Ficha própria do painel (ex.: "Até 03/2027"). Fora do sync.';


--
-- Name: COLUMN estoque_motors.preco_compra; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.preco_compra IS 'Preenchido pelo painel; casa definitiva do valor que hoje vive em stock_overrides. Fora do sync. Não exposto ao site público.';


--
-- Name: COLUMN estoque_motors.conteudo_atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.conteudo_atualizado_em IS 'Instante da ultima mudanca real no conteudo publico do anuncio (preco, fotos, km, descricao, vendido...). Mantido pelo trigger estoque_motors_conteudo_atualizado — NAO escreva nesta coluna direto, o trigger descarta o valor enviado. Alimenta o lastmod do sitemap.xml.';


--
-- Name: COLUMN estoque_motors.descricao_seo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.descricao_seo IS 'Descricao curta para portais e meta description. Campo do PAINEL: o sync do RevendaMais nao escreve aqui (ver CAMPOS_NOSSOS em lib/estoqueEscrita). Vazia, o codigo cai em `descricao` e so depois no texto generico.';


--
-- Name: COLUMN estoque_motors.chassi; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.chassi IS 'Chassi vindo do feed da RevendaMais (tag CHASSI). Documentação interna: nunca no mapper público. Alimenta o fechamento de venda da A19.';


--
-- Name: COLUMN estoque_motors.valor_fipe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.valor_fipe IS 'VALOR_FIPE do feed. Referência de mercado do veículo em estoque — não confundir com a FIPE do carro de troca, que é outra consulta.';


--
-- Name: COLUMN estoque_motors.codigo_fipe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.codigo_fipe IS 'Código FIPE do feed (tag FIPE), quando a RevendaMais o informa.';


--
-- Name: COLUMN estoque_motors.first_seen_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.first_seen_at IS 'Instante em que o veiculo apareceu no feed pela primeira vez. Preenchido pelo DEFAULT no INSERT do upsert; preservado nos updates porque o n8n nao manda esta coluna no corpo. NAO acrescentar ao payload do sincronizador: isso zeraria a idade de todo o patio a cada sync. NULL nas linhas anteriores a 2026-08-26 — idade desconhecida, e o site omite o campo em vez de inventar. Ver days_in_stock em src/lib/dataLayer.ts.';


--
-- Name: COLUMN estoque_motors.modelo_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.modelo_override IS 'Nome do modelo escrito por nos, quando o feed manda a versao inteira no lugar ("Ka Sedan 1.0 SE Flex 4p" em vez de "Ka"). NULL = usar o valor do feed. Decide a URL da ficha e o agrupamento do hub de modelo. NAO acrescentar ao payload do sincronizador: o sync sobrescreveria a correcao. Ver CAMPOS_NOSSOS em src/lib/estoqueEscrita.ts.';


--
-- Name: COLUMN estoque_motors.versao_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.versao_override IS 'Versao escrita por nos. Mesmo contrato do modelo_override: NULL = feed, e fora do payload do sincronizador. Existe em par com ele porque corrigir so o modelo deixaria a versao repetindo o texto que saiu dali.';


--
-- Name: COLUMN estoque_motors.perfis_uso; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.perfis_uso IS 'Para que o carro serve, um ou varios: familia, primeiro-carro, urbano, estrada, trabalho, performance, off-road, economico. Vocabulario fechado em src/lib/perfisDeUso.ts, e cada valor vira /estoque/{slug}. Campo do painel: NAO acrescentar ao payload do sincronizador. NULL significa que a linha ainda le o perfil_uso singular.';


--
-- Name: COLUMN estoque_motors.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.origem IS 'Quem é dono desta linha: `sync` (RevendaMais, via n8n) ou `painel` (cadastro nativo do /admin, 2026-08-29). O sync só escreve nas suas — ver trigger estoque_motors_trava_do_sync. As 104 linhas anteriores nasceram `sync` pelo default, que é o que elas são.';


--
-- Name: COLUMN estoque_motors.renavam; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.renavam IS 'Documento interno, como `placa` e `chassi`: NUNCA sai no mapper público. O sync do RevendaMais não o conhece — é campo do painel, sobrevive a todo ciclo.';


--
-- Name: COLUMN estoque_motors.estado_cadastro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.estado_cadastro IS 'Quem decide o que está no ar: a loja, não o robô (decisão do dono, 2026-08-30). `rascunho` é onde todo carro nasce — importado do RevendaMais ou cadastrado no painel — e só sai por ato de quem publica. Substituiu a janela de `last_seen_at` como régua de visibilidade: com importação manual, aquela janela esvaziaria o site sozinha.';


--
-- Name: COLUMN estoque_motors.portas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.portas IS 'Número de portas, do <DOORS> do feed RevendaMais. NULL = não se aplica (moto) ou não informado — o feed manda 0 para moto, e a importação converte. Vira numberOfDoors no JSON-LD do veículo; nunca deduzir da carroceria (Kombi, cabine simples e cupê quebram a dedução).';


--
-- Name: COLUMN estoque_motors.em_preparacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.em_preparacao IS 'Carro que chegou e ainda não está pronto para o pátio. Com previsao_chegada_em, libera a publicação com 1 foto (a de cadastro) e o site mostra a contagem até a data; o feed de anúncios o recusa até ter 4 fotos. A equipe desmarca quando o carro fica pronto — a caixa não se desliga sozinha. Coluna do painel: o sync do RevendaMais não a escreve.';


--
-- Name: COLUMN estoque_motors.previsao_chegada_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.estoque_motors.previsao_chegada_em IS 'Quando o carro em preparação deve chegar ao pátio. Obrigatória com em_preparacao (CHECK estoque_motors_em_preparacao_tem_data). Depois da data o carro continua no ar com "chega a qualquer momento" (decisão do dono, 28/09/2026) e o painel acusa a previsão vencida.';


--
-- Name: estoque_motors_equipe; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.estoque_motors_equipe WITH (security_barrier='true') AS
 SELECT id,
    marca,
    modelo,
    versao,
    ano,
    ano_fabricacao,
    preco,
    preco_original,
    preco_promocional,
    quilometragem,
    cambio,
    combustivel,
    cor,
    tipo,
    perfil_uso,
    url_imagem,
    link_conversao,
    pericia,
    whatsapp_images,
    web_full_images,
    created_at,
    descricao,
    laudo_pericia,
    opcionais,
    status_tag,
    status_tag_color,
    vendido,
    last_seen_at,
    placa,
    motor,
    cor_interna,
    donos_anteriores,
    garantia_fabrica,
    preco_compra,
    conteudo_atualizado_em,
    descricao_seo,
    chassi,
    valor_fipe,
    codigo_fipe,
    first_seen_at,
    modelo_override,
    versao_override,
    perfis_uso,
    origem,
    renavam,
    estado_cadastro,
    portas,
    em_preparacao,
    previsao_chegada_em
   FROM public.estoque_motors e
  WHERE public.is_staff(auth.uid());


--
-- Name: VIEW estoque_motors_equipe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.estoque_motors_equipe IS 'O estoque inteiro, com placa, chassi, renavam, custo e FIPE, para quem é da equipe (is_staff). Roda como dona de propósito: o authenticated não lê essas colunas na tabela desde 20261001150000. Só leitura. Coluna nova em estoque_motors exige recriar esta view na mesma migração.';


--
-- Name: eventos_ciclo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eventos_ciclo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    gatilho text NOT NULL,
    canal text,
    payload jsonb,
    enviado_em timestamp with time zone DEFAULT now(),
    respondido_em timestamp with time zone,
    desfecho text,
    valor_gerado numeric(12,2)
);


--
-- Name: fipe_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fipe_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    tipo text NOT NULL,
    marca_codigo text NOT NULL,
    modelo_codigo text NOT NULL,
    ano text NOT NULL,
    referencia date NOT NULL,
    valor numeric(12,2),
    codigo_fipe text,
    marca text,
    modelo text,
    combustivel text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fipe_historico_codigos_validos CHECK (((marca_codigo ~ '^[0-9]{1,6}$'::text) AND (modelo_codigo ~ '^[0-9]{1,6}$'::text) AND (ano ~ '^[0-9]{4}-[0-9]{1,2}$'::text))),
    CONSTRAINT fipe_historico_referencia_e_mes CHECK ((EXTRACT(day FROM referencia) = (1)::numeric)),
    CONSTRAINT fipe_historico_tipo_valido CHECK ((tipo = ANY (ARRAY['carros'::text, 'motos'::text, 'caminhoes'::text]))),
    CONSTRAINT fipe_historico_valor_valido CHECK (((valor IS NULL) OR (valor > (0)::numeric)))
);


--
-- Name: TABLE fipe_historico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fipe_historico IS 'Valores da tabela FIPE por (modelo, ano-modelo, mês de referência), lidos da API pública pelo token gratuito da loja (2026-10-06). É o que deixa a aba "Por modelo" de /admin/consulta-placa montar a série sem gastar o teto diário a cada abertura. Só inclusão. Sem dado de pessoa: é tabela pública de preço. Ver 20261006190000_fipe_historico.sql.';


--
-- Name: COLUMN fipe_historico.marca_codigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fipe_historico.marca_codigo IS 'Código da marca na API da FIPE (o da cascata de seleção), só dígitos.';


--
-- Name: COLUMN fipe_historico.modelo_codigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fipe_historico.modelo_codigo IS 'Código do modelo na API da FIPE (o da cascata de seleção), só dígitos.';


--
-- Name: COLUMN fipe_historico.ano; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fipe_historico.ano IS 'Ano-modelo e combustível como a API da FIPE os junta: "2022-1".';


--
-- Name: COLUMN fipe_historico.referencia; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fipe_historico.referencia IS 'O mês da tabela, sempre no dia 1º (2026-10-01 é a tabela de outubro/2026).';


--
-- Name: COLUMN fipe_historico.valor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fipe_historico.valor IS 'O preço médio daquele mês, em reais. NULO é resposta: naquele mês a FIPE ainda não tinha este ano-modelo, e a linha existe para não perguntar de novo.';


--
-- Name: COLUMN fipe_historico.codigo_fipe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.fipe_historico.codigo_fipe IS 'O código FIPE oficial do modelo ("005528-0"), quando a API o devolveu.';


--
-- Name: funil_motivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.funil_motivos (
    chave text NOT NULL,
    rotulo text NOT NULL,
    tipo text NOT NULL,
    ordem integer DEFAULT 0 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    escopo text DEFAULT 'ambos'::text NOT NULL,
    CONSTRAINT funil_motivos_escopo_valido CHECK ((escopo = ANY (ARRAY['compra'::text, 'avaliacao'::text, 'ambos'::text]))),
    CONSTRAINT funil_motivos_tipo_valido CHECK ((tipo = ANY (ARRAY['ganho'::text, 'perdido'::text, 'descartado'::text])))
);


--
-- Name: TABLE funil_motivos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.funil_motivos IS 'Por que o negócio foi ganho ou perdido (2026-08-28). Lista fechada e editável: texto livre não agrega em relatório — "preço", "Preço" e "achou caro" viram três linhas no mesmo gráfico.';


--
-- Name: COLUMN funil_motivos.escopo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.funil_motivos.escopo IS 'Para que negócio este motivo existe (2026-09-05): compra, avaliacao ou ambos. A caixa de desfecho escolhe a lista pelo canal do lead — quem só quer vender o carro dele não perde por "financiamento reprovado".';


--
-- Name: guias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guias (
    slug text NOT NULL,
    titulo text NOT NULL,
    titulo_seo text,
    descricao text NOT NULL,
    corpo jsonb DEFAULT '[]'::jsonb NOT NULL,
    faq jsonb DEFAULT '[]'::jsonb NOT NULL,
    saida jsonb,
    sobre text[],
    estado text DEFAULT 'rascunho'::text NOT NULL,
    publicado_em timestamp with time zone,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guias_corpo_forma CHECK (
CASE
    WHEN (jsonb_typeof(corpo) <> 'array'::text) THEN false
    ELSE (jsonb_array_length(jsonb_path_query_array(corpo, '$[*]?((@."titulo".type() == "string" && @."paragrafos".type() == "array") && !(exists (@."paragrafos"[*]?(@.type() != "string"))))'::jsonpath)) = jsonb_array_length(corpo))
END),
    CONSTRAINT guias_estado_valido CHECK ((estado = ANY (ARRAY['rascunho'::text, 'publicado'::text]))),
    CONSTRAINT guias_faq_forma CHECK (
CASE
    WHEN (jsonb_typeof(faq) <> 'array'::text) THEN false
    ELSE (jsonb_array_length(jsonb_path_query_array(faq, '$[*]?(@."pergunta".type() == "string" && @."resposta".type() == "string")'::jsonpath)) = jsonb_array_length(faq))
END),
    CONSTRAINT guias_publicado_tem_corpo CHECK (
CASE
    WHEN (estado <> 'publicado'::text) THEN true
    WHEN (jsonb_typeof(corpo) <> 'array'::text) THEN false
    ELSE (jsonb_array_length(corpo) > 0)
END),
    CONSTRAINT guias_publicado_tem_data CHECK (((estado <> 'publicado'::text) OR (publicado_em IS NOT NULL))),
    CONSTRAINT guias_publicado_tem_saida CHECK (((estado <> 'publicado'::text) OR (saida IS NOT NULL))),
    CONSTRAINT guias_publicado_tem_texto CHECK (((estado <> 'publicado'::text) OR ((length(btrim(titulo)) > 0) AND (length(btrim(descricao)) > 0)))),
    CONSTRAINT guias_saida_forma CHECK (((saida IS NULL) OR ((jsonb_typeof(saida) = 'object'::text) AND (jsonb_typeof((saida -> 'rotulo'::text)) = 'string'::text) AND (jsonb_typeof((saida -> 'href'::text)) = 'string'::text) AND (jsonb_typeof((saida -> 'apoio'::text)) = 'string'::text)))),
    CONSTRAINT guias_slug_formato CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 90)))
);


--
-- Name: TABLE guias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.guias IS 'O conteúdo editorial de /guias. Aqui o banco é FONTE (sem linha a página não existe), e não override como textos_de_hub. Leitura pública só do estado publicado.';


--
-- Name: COLUMN guias.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.slug IS 'Fecha a URL /guias/{slug}. Minúsculas, dígitos e hífen.';


--
-- Name: COLUMN guias.titulo_seo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.titulo_seo IS 'O <title> da aba. Nulo cai para o titulo com o sufixo da loja, em lib/guiasDoBanco.ts — e por isso o seed guarda a forma exata, com o NAO em caixa alta.';


--
-- Name: COLUMN guias.corpo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.corpo IS 'Seções do texto: [{titulo, paragrafos: [texto]}]. Formato garantido por CHECK — jsonb aqui é estrutura, não saco.';


--
-- Name: COLUMN guias.faq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.faq IS 'Perguntas do fim da página: [{pergunta, resposta}]. As MESMAS strings vão para o FAQPage do JSON-LD.';


--
-- Name: COLUMN guias.saida; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.saida IS 'A saída comercial: {rotulo, href, apoio}. Obrigatória para publicar — guia sem destino é conteúdo que não devolve nada.';


--
-- Name: COLUMN guias.sobre; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.sobre IS 'Assuntos do about do Article. Nulo e {} significam a mesma coisa: nenhum.';


--
-- Name: COLUMN guias.estado; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.estado IS 'rascunho | publicado. Rascunho não sai no site nem no sitemap, e a RLS impede que ele seja lido sem sessão de staff.';


--
-- Name: COLUMN guias.publicado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.publicado_em IS 'datePublished — a PRIMEIRA publicação. Carimbado pelo gatilho; nunca limpo ao despublicar.';


--
-- Name: COLUMN guias.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guias.atualizado_em IS 'dateModified. Carimbado pelo servidor em todo UPDATE; num INSERT o valor dado vence, e é assim que a migração preserva a data do texto que já estava no ar.';


--
-- Name: historico_veiculo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico_veiculo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_id bigint NOT NULL,
    campo text NOT NULL,
    valor_anterior text,
    valor_novo text,
    autor_id uuid,
    autor_nome text,
    registrado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE historico_veiculo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.historico_veiculo IS 'Alterações campo a campo feitas no editor de veículo (A15). Append-only via RLS — sem policy de UPDATE/DELETE.';


--
-- Name: ia_classificacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ia_classificacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    modelo_llm text,
    categoria text,
    subcategoria text,
    confianca numeric(5,2),
    motivo text,
    payload jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: indice_ciclo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.indice_ciclo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    competencia date NOT NULL,
    score_revisao numeric(5,2),
    score_km numeric(5,2),
    score_conducao numeric(5,2),
    score_sinistro numeric(5,2),
    indice_total numeric(5,2) NOT NULL,
    valor_recompra_atual numeric(12,2)
);


--
-- Name: investidor_movimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investidor_movimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    investidor_id uuid NOT NULL,
    tipo text NOT NULL,
    valor numeric(12,2) NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    descricao text,
    veiculo_id bigint,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT investidor_movimentos_tipo_check CHECK ((tipo = ANY (ARRAY['aporte'::text, 'retirada'::text]))),
    CONSTRAINT investidor_movimentos_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: TABLE investidor_movimentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.investidor_movimentos IS 'Razão do investidor: aportes e retiradas. Valor sempre positivo — o sinal está em `tipo`.';


--
-- Name: movimentacoes_investidor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimentacoes_investidor (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    investidor_id uuid NOT NULL,
    tipo text NOT NULL,
    valor numeric(12,2) NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    descricao text NOT NULL,
    forma_pagamento text,
    veiculo_id text,
    observacoes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT movimentacoes_investidor_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'cartao_credito'::text, 'cartao_debito'::text, 'boleto'::text, 'transferencia'::text, 'cheque'::text, 'financiamento'::text, 'veiculo'::text]))),
    CONSTRAINT movimentacoes_investidor_tipo_check CHECK ((tipo = ANY (ARRAY['aporte'::text, 'retirada'::text]))),
    CONSTRAINT movimentacoes_investidor_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: TABLE movimentacoes_investidor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.movimentacoes_investidor IS 'Aportes e retiradas por investidor. `valor` é sempre positivo — o lado mora em `tipo`. Retirada em carro de repasse leva `veiculo_id`.';


--
-- Name: COLUMN movimentacoes_investidor.veiculo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.movimentacoes_investidor.veiculo_id IS 'Código RevendaMais em estoque_motors.id, sem FK — o carro pode sair do feed e o registro financeiro fica.';


--
-- Name: investidor_posicao; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.investidor_posicao WITH (security_invoker='true') AS
 SELECT i.perfil_id AS investidor_id,
    (COALESCE(sum(m.valor) FILTER (WHERE (m.tipo = 'aporte'::text)), (0)::numeric))::numeric(12,2) AS aporte_total,
    (COALESCE(sum(m.valor) FILTER (WHERE (m.tipo = 'retirada'::text)), (0)::numeric))::numeric(12,2) AS retirado_total,
    ((COALESCE(sum(m.valor) FILTER (WHERE (m.tipo = 'aporte'::text)), (0)::numeric) - COALESCE(sum(m.valor) FILTER (WHERE (m.tipo = 'retirada'::text)), (0)::numeric)))::numeric(12,2) AS saldo_investido
   FROM (public.investidores i
     JOIN public.movimentacoes_investidor m ON ((m.investidor_id = i.id)))
  WHERE (i.perfil_id IS NOT NULL)
  GROUP BY i.perfil_id;


--
-- Name: VIEW investidor_posicao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.investidor_posicao IS 'Aporte total, retirado e saldo por investidor, somados do razão único (`movimentacoes_investidor`) desde a fusão de 2026-08-22. security_invoker: cada um agrega só o que a RLS já lhe deixava ler.';


--
-- Name: investidor_veiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investidor_veiculos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    investidor_id uuid NOT NULL,
    veiculo_id bigint NOT NULL,
    valor_investido numeric(12,2) NOT NULL,
    data_entrada date DEFAULT CURRENT_DATE NOT NULL,
    observacao text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    investidor_cadastro_id uuid,
    CONSTRAINT investidor_veiculos_valor_investido_check CHECK ((valor_investido >= (0)::numeric))
);


--
-- Name: TABLE investidor_veiculos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.investidor_veiculos IS 'Participação de um investidor na compra de um veículo do estoque.';


--
-- Name: lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lancamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    evento_id uuid,
    descricao text,
    data_competencia date DEFAULT CURRENT_DATE NOT NULL,
    data_caixa date,
    estorna_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid NOT NULL
);


--
-- Name: TABLE lancamentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lancamentos IS 'Cabeçalho do lançamento (spec 30). Append-only: correção é estorno com contrapartida (estorna_id). Fechamento de período trava o passado — entra com o financeiro da F1/F3.';


--
-- Name: lead_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    tag text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: leads_erros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads_erros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    evento text,
    payload jsonb,
    resposta jsonb,
    criado_em timestamp with time zone DEFAULT now()
);


--
-- Name: leads_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    tipo text NOT NULL,
    de text,
    para text,
    autor text,
    automatico boolean DEFAULT false NOT NULL,
    detalhe jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leads_eventos_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'etapa'::text, 'responsavel'::text, 'transferencia'::text, 'contato'::text, 'desfecho'::text, 'alerta'::text, 'nota'::text, 'etiqueta'::text])))
);


--
-- Name: TABLE leads_eventos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.leads_eventos IS 'O rastro do lead: cada mudança de etapa, de dono, cada aviso e cada desfecho (2026-08-28). É a fonte dos relatórios de funil — `leads` guarda o estado, esta tabela guarda a história. Cascateia na exclusão do lead: pedido de eliminação do titular (LGPD art. 18, VI) leva o rastro junto.';


--
-- Name: leads_interacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads_interacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    tipo text NOT NULL,
    resultado text,
    texto text,
    autor text,
    passo_texto text,
    passo_vence_em timestamp with time zone,
    importada boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    CONSTRAINT leads_interacoes_diz_alguma_coisa CHECK (((NULLIF(TRIM(BOTH FROM texto), ''::text) IS NOT NULL) OR ((tipo = 'ligacao'::text) AND (resultado IS NOT NULL)))),
    CONSTRAINT leads_interacoes_resultado_so_em_ligacao CHECK (((resultado IS NULL) OR (tipo = 'ligacao'::text))),
    CONSTRAINT leads_interacoes_resultado_valido CHECK (((resultado IS NULL) OR (resultado = ANY (ARRAY['atendeu'::text, 'nao_atendeu'::text, 'caixa_postal'::text])))),
    CONSTRAINT leads_interacoes_tipo_valido CHECK ((tipo = ANY (ARRAY['nota'::text, 'ligacao'::text, 'whatsapp'::text, 'visita'::text])))
);


--
-- Name: TABLE leads_interacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.leads_interacoes IS 'Os registros do vendedor sobre o lead (2026-09-23): nota, ligação, WhatsApp e visita, com autor, data e o próximo passo que cada um definiu. Separada de `leads_eventos` (o rastro do sistema); a tela junta as duas na leitura. Escrita só por `registrar_interacao_do_lead`. Cascateia na exclusão do lead (LGPD art. 18, VI). Ver docs/GESTAO_DO_LEAD.md.';


--
-- Name: COLUMN leads_interacoes.org_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_interacoes.org_id IS 'A org do registro (2026-09-25). Default org_padrao(): quem grava — registrar_interacao_do_lead, que não lista a coluna — não precisa saber dela. A policy de leitura do staff filtra por ela (org_id = org_padrao()). Chegou depois da tabela: as linhas anteriores receberam a org padrão pelo default. Ver 20260925130000_leads_interacoes_org_id.sql.';


--
-- Name: leads_sdr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads_sdr (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    telefone character varying(20),
    nome text,
    email text,
    origem text,
    marca text,
    modelo text,
    versao text,
    ano text,
    score integer DEFAULT 0,
    status_sdr text,
    chatwoot_contact_id bigint,
    chatwoot_conversation_id bigint,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: TABLE leads_sdr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.leads_sdr IS 'Tabela de fluxo do SDR no n8n (desligado). RLS fechada em 2026-08-15 — D7 resolvida por evidência: o n8n usa service key. Sem policy de propósito: quem opera é o service_role, que atravessa. PII dentro.';


--
-- Name: leads_veiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads_veiculos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    lead_id uuid NOT NULL,
    veiculo_id bigint NOT NULL,
    veiculo_rotulo text NOT NULL,
    veiculo_preco numeric(12,2),
    situacao text DEFAULT 'em_avaliacao'::text NOT NULL,
    motivo_descarte text,
    nota text,
    adicionado_por text,
    resolvido_por text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    resolvido_em timestamp with time zone,
    CONSTRAINT leads_veiculos_motivo_so_no_descarte CHECK (((situacao = 'descartado'::text) = (motivo_descarte IS NOT NULL))),
    CONSTRAINT leads_veiculos_motivo_valido CHECK (((motivo_descarte IS NULL) OR (motivo_descarte = ANY (ARRAY['preco'::text, 'parcela'::text, 'km'::text, 'ano_versao'::text, 'cor'::text, 'estado'::text, 'opcionais'::text, 'troca'::text, 'outro_da_loja'::text, 'comprou_fora'::text, 'desistiu'::text, 'vendido'::text, 'outro'::text])))),
    CONSTRAINT leads_veiculos_nota_cabe CHECK (((nota IS NULL) OR (char_length(nota) <= 2000))),
    CONSTRAINT leads_veiculos_outro_pede_nota CHECK (((motivo_descarte IS DISTINCT FROM 'outro'::text) OR (NULLIF(btrim(nota), ''::text) IS NOT NULL))),
    CONSTRAINT leads_veiculos_preco_valido CHECK (((veiculo_preco IS NULL) OR (veiculo_preco >= (0)::numeric))),
    CONSTRAINT leads_veiculos_resolucao_carimbada CHECK ((((situacao = 'em_avaliacao'::text) = (resolvido_em IS NULL)) AND ((situacao <> 'em_avaliacao'::text) OR (resolvido_por IS NULL)))),
    CONSTRAINT leads_veiculos_rotulo_preenchido CHECK (((btrim(veiculo_rotulo) <> ''::text) AND (char_length(veiculo_rotulo) <= 200))),
    CONSTRAINT leads_veiculos_situacao_valida CHECK ((situacao = ANY (ARRAY['em_avaliacao'::text, 'escolhido'::text, 'descartado'::text])))
);


--
-- Name: TABLE leads_veiculos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.leads_veiculos IS 'Os veículos de interesse do lead (2026-10-05): uma linha por (lead, carro do estoque). Cada opção termina escolhida ou descartada com motivo — a fonte do relatório por veículo. leads.veiculo_id segue sendo o veículo PRINCIPAL e é mantido pelo painel, não por gatilho. RLS: a linha acompanha a visibilidade do lead. Ver 20261005120000_veiculos_de_interesse.sql.';


--
-- Name: COLUMN leads_veiculos.org_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.org_id IS 'A org do registro. Default org_padrao(); as policies e os relatórios filtram por ela.';


--
-- Name: COLUMN leads_veiculos.veiculo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.veiculo_id IS 'estoque_motors.id (bigint, o código do anúncio), SEM FK: o carro sai do feed e o histórico dele precisa continuar sendo dele. Com sessão, o gatilho só aceita carro que existe no estoque na hora de adicionar.';


--
-- Name: COLUMN leads_veiculos.veiculo_rotulo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.veiculo_rotulo IS 'Retrato do nome do carro quando foi adicionado ("fiat uno mille fire economy 2013", na caixa do estoque). Vazio na inclusão, o gatilho preenche com rotulo_de_veiculo(). É o que resta legível quando o carro sai do estoque.';


--
-- Name: COLUMN leads_veiculos.veiculo_preco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.veiculo_preco IS 'Preço do carro (estoque_motors.preco) quando foi adicionado; com sessão, é sempre o do estoque. Nas linhas da carga inicial (sem adicionado_por) é o preço do dia da carga, 2026-10, e nulo se o carro já tinha saído.';


--
-- Name: COLUMN leads_veiculos.situacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.situacao IS 'em_avaliacao (o lead ainda considera), escolhido (no máximo um por lead) ou descartado (exige motivo_descarte).';


--
-- Name: COLUMN leads_veiculos.motivo_descarte; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.motivo_descarte IS 'Por que o lead descartou ESTE carro. Chaves: preco (Preço acima do que queria), parcela (Parcela ou financiamento não fechou), km (Quilometragem), ano_versao (Ano ou versão), cor (Cor), estado (Estado de conservação), opcionais (Faltou opcional), troca (Avaliação da troca não fechou), outro_da_loja (Preferiu outro carro da loja), comprou_fora (Comprou em outro lugar), desistiu (Desistiu da compra), vendido (O carro foi vendido antes), outro (Outro — exige nota). Os rótulos moram no painel.';


--
-- Name: COLUMN leads_veiculos.nota; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.nota IS 'Comentário livre sobre a opção. Obrigatório com motivo `outro`. ⚠️ A nota de um descarte SAI no resumo do veículo, sem autor e sem lead: não escrever nome nem telefone de cliente aqui.';


--
-- Name: COLUMN leads_veiculos.adicionado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.adicionado_por IS 'Nome de quem adicionou (autor_atual()), carimbado pelo gatilho. NULL = carga inicial ou sistema.';


--
-- Name: COLUMN leads_veiculos.resolvido_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.resolvido_por IS 'Nome de quem marcou escolhido ou descartado, carimbado pelo gatilho. NULL enquanto em_avaliacao, e nas linhas resolvidas pela carga inicial.';


--
-- Name: COLUMN leads_veiculos.resolvido_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads_veiculos.resolvido_em IS 'Quando a opção saiu de em_avaliacao. Volta a NULL se for reaberta.';


--
-- Name: leituras_odometro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leituras_odometro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    km integer NOT NULL,
    origem text NOT NULL,
    registrada_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leituras_odometro_origem_check CHECK ((origem = ANY (ARRAY['venda'::text, 'cliente'::text, 'revisao'::text, 'vistoria'::text])))
);


--
-- Name: TABLE leituras_odometro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.leituras_odometro IS 'KM entre revisões. Declarado, nunca verificado — quem verifica é a etiqueta no carimbo. Não registrar NUNCA penaliza o cliente (mesma regra do §5.6).';


--
-- Name: manutencoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manutencoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    parceiro_id uuid,
    tipo text NOT NULL,
    numero_revisao integer,
    data_servico date NOT NULL,
    km_registrado integer NOT NULL,
    valor_servico numeric(12,2),
    comissao_motors numeric(12,2),
    dentro_da_janela boolean,
    itens jsonb,
    observacoes text,
    origem_registro text DEFAULT 'loja'::text NOT NULL,
    confirmada_em timestamp with time zone,
    confirmada_por uuid,
    url_etiqueta_anterior text,
    url_etiqueta_atual text,
    url_nota_servico text,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    recusada_em timestamp with time zone,
    motivo_recusa text,
    CONSTRAINT manutencoes_origem_registro_check CHECK ((origem_registro = ANY (ARRAY['loja'::text, 'parceiro'::text, 'cliente'::text])))
);


--
-- Name: TABLE manutencoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.manutencoes IS 'A caderneta. Registro do cliente nasce sem carimbo e não conta para a conformidade — quem valida é a loja, contra a foto da etiqueta de troca de óleo (anterior e nova, com o KM legível). Manual v1.1 §5.7.';


--
-- Name: COLUMN manutencoes.recusada_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.manutencoes.recusada_em IS 'Quando a loja recusou o lançamento. Pendente = confirmada_em IS NULL AND recusada_em IS NULL. Sem esta coluna, recusado e pendente são o mesmo estado para quem consulta — e a fila nunca esvazia.';


--
-- Name: marketing_contatos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_contatos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    telefone text NOT NULL,
    nome text,
    email text,
    cliente boolean DEFAULT false NOT NULL,
    comprou_em timestamp with time zone,
    sem_interesse boolean DEFAULT false NOT NULL,
    canais text[] DEFAULT '{}'::text[] NOT NULL,
    primeiro_contato_em timestamp with time zone,
    ultimo_contato_em timestamp with time zone,
    importacao_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_contatos_compra_e_de_cliente CHECK (((comprou_em IS NULL) OR cliente)),
    CONSTRAINT marketing_contatos_telefone_valido CHECK ((telefone ~ '^55[1-9][0-9]9[0-9]{8}$'::text))
);


--
-- Name: TABLE marketing_contatos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_contatos IS 'A base de marketing importada (2026-10-07): uma PESSOA por linha, identificada pelo celular, vinda do RevendaMais ou de planilha. NÃO é a tabela leads, de propósito: leads é a fila de trabalho do vendedor, e a base antiga enterraria o kanban; as campanhas de SMS leem as duas. DADO PESSOAL (telefone, nome, e-mail). O painel NÃO lê: sem privilégio e sem policy para authenticated, porque o papel Marketing opera a importação e as campanhas e não lê contato. Só o servidor, com a chave de serviço, que devolve à tela contagem (marketing_resumo_da_base). Quem escreve é marketing_importar_lote. Ver 20261007120000_sms_campanhas.sql.';


--
-- Name: COLUMN marketing_contatos.telefone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.telefone IS 'A identidade da pessoa: só dígitos, com 55 e DDD, celular de 9 dígitos ("5541999990000") — o que telefoneParaSms devolve. Um por org.';


--
-- Name: COLUMN marketing_contatos.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.nome IS 'O primeiro nome que chegou para este celular. Importações seguintes não o trocam.';


--
-- Name: COLUMN marketing_contatos.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.email IS 'O primeiro e-mail que chegou para este celular. Importações seguintes não o trocam.';


--
-- Name: COLUMN marketing_contatos.cliente; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.cliente IS 'Já comprou na loja. Uma vez verdadeiro, nenhuma importação o desfaz.';


--
-- Name: COLUMN marketing_contatos.comprou_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.comprou_em IS 'A data da compra mais recente, quando a origem diz. É o que um upsell futuro vai usar. Só existe em quem é cliente.';


--
-- Name: COLUMN marketing_contatos.sem_interesse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.sem_interesse IS 'Marcado na origem como "não tem interesse" (MARCADORES_SEM_INTERESSE): não entra em público de campanha nenhuma. Uma vez verdadeiro, fica.';


--
-- Name: COLUMN marketing_contatos.canais; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.canais IS 'Por onde a pessoa chegou (OLX, Site, Instagram...), sem repetir, na ordem em que os canais apareceram. É o que o filtro de canal da campanha lê.';


--
-- Name: COLUMN marketing_contatos.primeiro_contato_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.primeiro_contato_em IS 'O contato mais antigo que se conhece desta pessoa.';


--
-- Name: COLUMN marketing_contatos.ultimo_contato_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.ultimo_contato_em IS 'O contato mais recente que se conhece. É dele que a janela da campanha por perfil conta os dias.';


--
-- Name: COLUMN marketing_contatos.importacao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.importacao_id IS 'A importação que CRIOU o contato (as seguintes o enriquecem e não mexem aqui). ON DELETE CASCADE: desfazer essa importação leva o contato.';


--
-- Name: COLUMN marketing_contatos.atualizado_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_contatos.atualizado_em IS 'A última vez que uma importação tocou este contato, tenha mudado algo ou não.';


--
-- Name: marketing_importacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_importacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    origem text NOT NULL,
    arquivo text,
    linhas integer DEFAULT 0 NOT NULL,
    contatos_novos integer DEFAULT 0 NOT NULL,
    contatos_atualizados integer DEFAULT 0 NOT NULL,
    registros_novos integer DEFAULT 0 NOT NULL,
    criado_por uuid,
    criado_por_nome text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_importacoes_arquivo_curto CHECK (((arquivo IS NULL) OR (char_length(arquivo) <= 200))),
    CONSTRAINT marketing_importacoes_contadores_validos CHECK (((contatos_novos >= 0) AND (contatos_atualizados >= 0) AND (registros_novos >= 0))),
    CONSTRAINT marketing_importacoes_linhas_validas CHECK ((linhas >= 0)),
    CONSTRAINT marketing_importacoes_origem_valida CHECK ((origem = ANY (ARRAY['revenda_mais'::text, 'planilha'::text])))
);


--
-- Name: TABLE marketing_importacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_importacoes IS 'Os arquivos importados para a base de marketing (2026-10-07): uma linha por arquivo, com de onde veio, quantas linhas tinha e o que entrou. É por ela que uma importação se desfaz: apagar a linha leva, por ON DELETE CASCADE, os registros que ela gravou e os contatos que ela criou (ver marketing_desfazer_importacao). O painel NÃO lê (sem privilégio e sem policy para authenticated); só o servidor, com a chave de serviço. Ver 20261007120000_sms_campanhas.sql.';


--
-- Name: COLUMN marketing_importacoes.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_importacoes.origem IS 'revenda_mais (a exportação do RevendaMais) ou planilha (CSV ou Excel comum). ORIGENS_DE_IMPORTACAO em src/lib/baseDeMarketing.ts.';


--
-- Name: COLUMN marketing_importacoes.arquivo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_importacoes.arquivo IS 'O nome do arquivo enviado, até 200 caracteres. Só para a pessoa reconhecer a importação na lista.';


--
-- Name: COLUMN marketing_importacoes.linhas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_importacoes.linhas IS 'Quantas linhas o arquivo tinha, contadas por quem leu. Gravado pelo servidor ao abrir a importação.';


--
-- Name: COLUMN marketing_importacoes.contatos_novos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_importacoes.contatos_novos IS 'Pessoas que esta importação CRIOU. Somado por marketing_importar_lote a cada lote.';


--
-- Name: COLUMN marketing_importacoes.contatos_atualizados; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_importacoes.contatos_atualizados IS 'Pessoas que já existiam e esta importação tocou, somadas a cada lote: quem vem em dois lotes, ou num lote repetido, conta em cada um.';


--
-- Name: COLUMN marketing_importacoes.registros_novos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_importacoes.registros_novos IS 'Registros (carros de interesse e compras) que esta importação gravou. O que já existia não conta.';


--
-- Name: COLUMN marketing_importacoes.criado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_importacoes.criado_por IS 'auth.uid() de quem importou, gravado pelo servidor a partir da sessão.';


--
-- Name: COLUMN marketing_importacoes.criado_por_nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_importacoes.criado_por_nome IS 'Nome de quem importou, para continuar legível quando a pessoa sair da loja.';


--
-- Name: marketing_interesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_interesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    contato_id uuid NOT NULL,
    importacao_id uuid,
    origem_id text,
    tipo text NOT NULL,
    veiculo_id bigint,
    marca text,
    modelo text,
    placa text,
    canal text,
    marcador text,
    ocorreu_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_interesses_placa_valida CHECK ((placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'::text)),
    CONSTRAINT marketing_interesses_tipo_valido CHECK ((tipo = ANY (ARRAY['interesse'::text, 'compra'::text])))
);


--
-- Name: TABLE marketing_interesses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_interesses IS 'Os carros de cada pessoa da base de marketing (2026-10-07): um registro por carro que ela olhou (interesse) ou comprou (compra). É o que as campanhas por carro leem ("quem se interessou por este modelo"). Liga a pessoa ao carro: DADO PESSOAL. O painel NÃO lê (sem privilégio e sem policy para authenticated); só o servidor, com a chave de serviço. Vai embora com o contato e com a importação que o gravou. Ver 20261007120000_sms_campanhas.sql.';


--
-- Name: COLUMN marketing_interesses.contato_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.contato_id IS 'A pessoa. ON DELETE CASCADE: eliminar o contato leva os registros dele.';


--
-- Name: COLUMN marketing_interesses.importacao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.importacao_id IS 'A importação que gravou este registro. ON DELETE CASCADE: desfazê-la o leva.';


--
-- Name: COLUMN marketing_interesses.origem_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.origem_id IS 'O id da linha na origem (o Id do lead no RevendaMais). Único por org quando existe: é o que impede a mesma linha de entrar duas vezes. NULO em planilha comum. Ids de fontes com numeração própria colidem: ver o aviso no cabeçalho da migração.';


--
-- Name: COLUMN marketing_interesses.tipo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.tipo IS 'interesse (a pessoa olhou o carro) ou compra (comprou; faz dela cliente e não conta como interesse). A linha que só diz "é cliente" não vira registro: vira marketing_contatos.cliente.';


--
-- Name: COLUMN marketing_interesses.veiculo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.veiculo_id IS 'O carro no estoque do site (estoque_motors.id), quando se sabe qual é. SEM chave estrangeira, de propósito: o carro sai do estoque e o registro fica.';


--
-- Name: COLUMN marketing_interesses.marca; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.marca IS 'A marca como veio da origem. Comparada pela marca canônica (lib/familiaDoModelo.ts).';


--
-- Name: COLUMN marketing_interesses.modelo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.modelo IS 'Modelo e versão como vieram ("TIGUAN ALLSPACE R-LINE 350 TSI 2.0 4X4"). Comparado pela família do modelo.';


--
-- Name: COLUMN marketing_interesses.placa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.placa IS 'A placa, quando a origem traz: sete caracteres, maiúsculos, no padrão antigo (ABC1234) ou Mercosul (ABC1D23).';


--
-- Name: COLUMN marketing_interesses.canal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.canal IS 'Por onde ESTE contato chegou (OLX, Site...).';


--
-- Name: COLUMN marketing_interesses.marcador; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.marcador IS 'O marcador que a linha tinha na origem ("Não tem interesse", "Cliente nosso!").';


--
-- Name: COLUMN marketing_interesses.ocorreu_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_interesses.ocorreu_em IS 'Quando o interesse (ou a compra) aconteceu. Sem data na origem, é a hora da importação.';


--
-- Name: midia_ajustes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.midia_ajustes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campanha_id uuid NOT NULL,
    descricao text NOT NULL,
    autor_nome text,
    registrado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE midia_ajustes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.midia_ajustes IS 'Registro de ajustes da campanha ("subiu orçamento", "trocou capa") — as marcas na linha do tempo da tela A14. É o que permite dizer depois o que causou uma variação.';


--
-- Name: midia_anuncios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.midia_anuncios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campanha_id uuid NOT NULL,
    nome text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    id_externo text
);


--
-- Name: TABLE midia_anuncios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.midia_anuncios IS 'Anúncios (criativos) dentro de uma campanha — as linhas da tabela de criativos da tela A14.';


--
-- Name: midia_campanhas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.midia_campanhas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    plataforma text NOT NULL,
    objetivo text,
    orcamento_diario numeric(12,2),
    publico text,
    atribuicao text,
    situacao text DEFAULT 'no_ar'::text NOT NULL,
    no_ar_desde timestamp with time zone,
    criada_em timestamp with time zone DEFAULT now() NOT NULL,
    origem text DEFAULT 'manual'::text NOT NULL,
    id_externo text,
    alcance_total integer,
    sincronizado_em timestamp with time zone,
    CONSTRAINT midia_campanhas_origem_check CHECK ((origem = ANY (ARRAY['manual'::text, 'meta'::text, 'google'::text]))),
    CONSTRAINT midia_campanhas_origem_coerente CHECK ((((origem = 'manual'::text) AND (id_externo IS NULL)) OR ((origem = plataforma) AND (id_externo IS NOT NULL)))),
    CONSTRAINT midia_campanhas_plataforma_check CHECK ((plataforma = ANY (ARRAY['meta'::text, 'google'::text]))),
    CONSTRAINT midia_campanhas_situacao_check CHECK ((situacao = ANY (ARRAY['no_ar'::text, 'pausada'::text, 'planejada'::text, 'encerrada'::text])))
);


--
-- Name: TABLE midia_campanhas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.midia_campanhas IS 'Campanhas de mídia paga (Meta/Google) — tela A13/A14 do painel. Alimentada à mão enquanto não há sync com as APIs de anúncio.';


--
-- Name: COLUMN midia_campanhas.alcance_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.midia_campanhas.alcance_total IS 'Alcance da vida inteira da campanha, como a plataforma informa (só Meta). Não soma entre dias nem entre anúncios — por isso não mora em midia_diario.';


--
-- Name: midia_diario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.midia_diario (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campanha_id uuid NOT NULL,
    anuncio_id uuid,
    dia date NOT NULL,
    investido numeric(12,2) DEFAULT 0 NOT NULL,
    impressoes integer DEFAULT 0 NOT NULL,
    cliques integer DEFAULT 0 NOT NULL,
    conversoes numeric(12,2) DEFAULT 0 NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT midia_diario_cliques_check CHECK ((cliques >= 0)),
    CONSTRAINT midia_diario_conversoes_check CHECK ((conversoes >= (0)::numeric)),
    CONSTRAINT midia_diario_impressoes_check CHECK ((impressoes >= 0)),
    CONSTRAINT midia_diario_investido_check CHECK ((investido >= (0)::numeric))
);


--
-- Name: TABLE midia_diario; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.midia_diario IS 'Desempenho por dia (e por anúncio, no Meta) vindo das plataformas. Escrito só por midia_gravar_lote, que apaga e regrava a janela do lote.';


--
-- Name: midia_leituras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.midia_leituras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campanha_id uuid NOT NULL,
    anuncio_id uuid,
    registrado_em timestamp with time zone DEFAULT now() NOT NULL,
    investido numeric(12,2) DEFAULT 0 NOT NULL,
    impressoes integer DEFAULT 0 NOT NULL,
    alcance integer DEFAULT 0 NOT NULL,
    cliques integer DEFAULT 0 NOT NULL,
    conversas integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE midia_leituras; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.midia_leituras IS 'Snapshots cumulativos de desempenho, digitados na tela A14 ("Atualizar leitura"). A mais recente por anúncio é o estado atual; o histórico é a linha do tempo.';


--
-- Name: midia_sincronizacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.midia_sincronizacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plataforma text NOT NULL,
    gatilho text NOT NULL,
    iniciada_em timestamp with time zone DEFAULT now() NOT NULL,
    terminada_em timestamp with time zone,
    ok boolean NOT NULL,
    campanhas integer,
    dias integer,
    erro text,
    CONSTRAINT midia_sincronizacoes_plataforma_check CHECK ((plataforma = ANY (ARRAY['meta'::text, 'google'::text])))
);


--
-- Name: TABLE midia_sincronizacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.midia_sincronizacoes IS 'Uma linha por rodada de sincronização — é daqui que o painel diz "Meta há 12 min" ou "falhou às 14h: token expirado".';


--
-- Name: negocio_pagamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negocio_pagamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    negocio_id uuid NOT NULL,
    tipo text NOT NULL,
    valor numeric(12,2) NOT NULL,
    status text DEFAULT 'previsto'::text NOT NULL,
    financeira text,
    retorno_previsto numeric(12,2),
    troca_avaliacao_id uuid,
    detalhes jsonb DEFAULT '{}'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financiamento_exige_financeira CHECK (((tipo <> 'financiamento'::text) OR (financeira IS NOT NULL))),
    CONSTRAINT negocio_pagamentos_status_check CHECK ((status = ANY (ARRAY['previsto'::text, 'confirmado'::text, 'liquidado'::text]))),
    CONSTRAINT negocio_pagamentos_tipo_check CHECK ((tipo = ANY (ARRAY['pix'::text, 'dinheiro'::text, 'cartao'::text, 'financiamento'::text, 'sinal'::text, 'troca'::text, 'acessorio'::text, 'garantia'::text]))),
    CONSTRAINT negocio_pagamentos_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: TABLE negocio_pagamentos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.negocio_pagamentos IS 'A composição apurada (spec 20): cada linha caminha previsto → confirmado → liquidado. O fechamento bloqueia com qualquer linha em previsto ou soma ≠ preço — regra da função atômica da F1.';


--
-- Name: negocios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negocios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    veiculo_id uuid NOT NULL,
    estado text DEFAULT 'proposta'::text NOT NULL,
    preco numeric(12,2),
    validade timestamp with time zone,
    comprador_nome text,
    comprador_contato text,
    lead_id bigint,
    vendedor_id uuid,
    observacoes text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT negocios_estado_check CHECK ((estado = ANY (ARRAY['proposta'::text, 'pre_venda'::text, 'fechado'::text, 'cancelado'::text]))),
    CONSTRAINT negocios_preco_check CHECK (((preco IS NULL) OR (preco > (0)::numeric))),
    CONSTRAINT pre_venda_exige_validade CHECK (((estado <> 'pre_venda'::text) OR (validade IS NOT NULL)))
);


--
-- Name: TABLE negocios; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.negocios IS 'O negócio da spec 20. Estados: proposta (nada travado) → pre_venda (reserva com validade) → fechado | cancelado. O fechamento atômico chega na F1; até lá, mudar estado para fechado é proibido por trigger.';


--
-- Name: notificacoes_admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificacoes_admin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event text NOT NULL,
    referencia_id text,
    prioridade text,
    destinatarios text,
    valor numeric,
    descricao text,
    payload_original jsonb,
    evento_em timestamp with time zone,
    processado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE notificacoes_admin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notificacoes_admin IS 'Rastro dos eventos administrativos processados pelo workflow adm-motors (n8n). Escrita só pela chave de serviço; leitura no painel autenticado. Dados financeiros internos da loja — sem PII de cliente.';


--
-- Name: COLUMN notificacoes_admin.referencia_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notificacoes_admin.referencia_id IS 'id do registro de origem, sem FK de propósito: precisa sobreviver à exclusão do registro.';


--
-- Name: orgs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orgs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    criada_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE orgs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.orgs IS 'Costura multi-tenant do handoff: uma linha só (Motors Store). Sem UI, sem cobrança.';


--
-- Name: parametros_avaliacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_avaliacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    base_pp numeric(5,2) NOT NULL,
    estado_excepcional_pp numeric(5,2) NOT NULL,
    piso_pct numeric(5,2) NOT NULL,
    teto_pct numeric(5,2) NOT NULL,
    degraus_km jsonb NOT NULL,
    avaria_leve_pp numrange NOT NULL,
    avaria_seria_pp numrange NOT NULL,
    pendencia_pp numrange NOT NULL,
    descricao text,
    vigencia_desde date DEFAULT CURRENT_DATE NOT NULL,
    vigencia_ate date,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    km_por_ano integer NOT NULL,
    CONSTRAINT parametros_avaliacao_km_por_ano_positivo CHECK ((km_por_ano > 0)),
    CONSTRAINT piso_abaixo_do_teto CHECK ((piso_pct < teto_pct))
);


--
-- Name: TABLE parametros_avaliacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.parametros_avaliacao IS 'Curva de deságio sobre a FIPE (spec 11), com vigência. Mudar a régua não altera avaliações passadas — cada avaliação persiste o breakdown do dia. Acima do teto: recusar ou encaminhar como repasse.';


--
-- Name: COLUMN parametros_avaliacao.km_por_ano; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.parametros_avaliacao.km_por_ano IS 'Quilometragem esperada por ano de idade do carro (2026-09-24). O km esperado é km_por_ano × idade em anos; o desvio (km − km_por_ano × idade) cai nos degraus_km. 15.000 é a régua da spec 11 ("desvio vs 15.000 × idade") e a mesma franquia de 15.000 km/ano do Manual do Ciclo (§1.2 / Emenda 02) — mas é parâmetro desta curva, separado de ciclo_parametros.franquia_km_ano. Sem default: cada vigência nova diz o seu; mudar é encerrar a vigência e inserir linha nova (D-T1.7). Maior que zero (CHECK parametros_avaliacao_km_por_ano_positivo). Lido por lerParametrosDaCurva (src/lib/avaliacaoRecomendacao.ts): sem ele, a avaliação sai sem sugestão.';


--
-- Name: partidas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partidas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    lancamento_id uuid NOT NULL,
    conta_codigo text NOT NULL,
    valor numeric(14,2) NOT NULL,
    veiculo_id uuid,
    modalidade public.modalidade_tipo,
    saida public.saida_tipo,
    vendedor_id uuid,
    campanha_id text,
    centro_custo text,
    pessoa text,
    lote_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partidas_valor_check CHECK ((valor <> (0)::numeric))
);


--
-- Name: TABLE partidas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.partidas IS 'Partidas dobradas com dimensões (spec 30). Débito positivo, crédito negativo; a constraint deferida exige soma zero por lançamento no COMMIT. Append-only.';


--
-- Name: plano_contas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plano_contas (
    codigo text NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    nome text NOT NULL,
    natureza text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plano_contas_natureza_check CHECK ((natureza = ANY (ARRAY['ativo'::text, 'passivo'::text, 'receita'::text, 'custo'::text, 'despesa'::text, 'imposto'::text])))
);


--
-- Name: TABLE plano_contas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.plano_contas IS 'As 15 contas do razão operacional (spec 30). O nome plano_contas ficou livre com a aposentadoria do caixa legado (20260828190000) — este é OUTRO desenho: seed fixo, razão por partidas, sem hierarquia.';


--
-- Name: plano_revisoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plano_revisoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    numero_revisao integer NOT NULL,
    km_previsto integer,
    janela_inicio date NOT NULL,
    janela_fim date NOT NULL,
    manutencao_id uuid,
    criada_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'cliente'::text NOT NULL,
    avatar_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    telefone_e164 text,
    papeis text[] DEFAULT ARRAY['cliente'::text] NOT NULL,
    CONSTRAINT profiles_papeis_check CHECK (public.papeis_validos(papeis)),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'gestor'::text, 'comercial'::text, 'financeiro'::text, 'marketing'::text, 'sdr'::text, 'cliente'::text, 'investidor'::text])))
);


--
-- Name: COLUMN profiles.telefone_e164; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.telefone_e164 IS 'WhatsApp do usuário, com DDI (+5541999998888). Dois consumidores: a rotina noturna de venda incompleta (2026-08-19) e o motor do funil, que avisa o vendedor de lead parado (2026-08-28). Vazio = não recebe aviso, e a fila devolve `vendedor_sem_whatsapp` como motivo da supressão.';


--
-- Name: COLUMN profiles.papeis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.papeis IS 'Todos os papéis do usuário. `papeis[1]` é o primário e espelha `role`, mantido por trigger para o código que ainda lê a coluna singular.';


--
-- Name: regras_comissao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regras_comissao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    saida public.saida_tipo NOT NULL,
    modo text NOT NULL,
    base text,
    valor numeric(12,4) NOT NULL,
    descricao text,
    vigencia_desde date DEFAULT CURRENT_DATE NOT NULL,
    vigencia_ate date,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT percentual_exige_base CHECK (((modo <> 'percentual'::text) OR (base IS NOT NULL))),
    CONSTRAINT regras_comissao_base_check CHECK ((base = ANY (ARRAY['valor_venda'::text, 'margem_liquida'::text]))),
    CONSTRAINT regras_comissao_modo_check CHECK ((modo = ANY (ARRAY['fixa'::text, 'percentual'::text]))),
    CONSTRAINT regras_comissao_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- Name: TABLE regras_comissao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.regras_comissao IS 'Comissão por saída (spec 20/30), como DADO. SEM SEED de propósito: o valor e a base são decisão do dono (pendência declarada no levantamento do handoff) — a F1 não liga comissão sem a linha existir aqui.';


--
-- Name: regras_contabilizacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regras_contabilizacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    evento public.evento_tipo NOT NULL,
    papel text NOT NULL,
    modalidade public.modalidade_tipo,
    saida public.saida_tipo,
    conta_debito text NOT NULL,
    conta_credito text NOT NULL,
    base_valor text NOT NULL,
    descricao text,
    vigencia_desde date DEFAULT CURRENT_DATE NOT NULL,
    vigencia_ate date,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE regras_contabilizacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.regras_contabilizacao IS 'Evento → contas (spec 30), como DADO com vigência. A contabilização automática (mesma transação do evento) liga na F1; os seeds abaixo transcrevem os exemplos da spec.';


--
-- Name: renave_operacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.renave_operacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    veiculo_id uuid NOT NULL,
    operacao text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    protocolo text,
    chave_nfe text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT renave_operacoes_operacao_check CHECK ((operacao = ANY (ARRAY['entrada'::text, 'saida'::text, 'consignacao'::text, 'transferencia'::text, 'retomado'::text])))
);


--
-- Name: TABLE renave_operacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.renave_operacoes IS 'Espelho NEUTRO das cinco operações da Res. CONTRAN 1.026/2026 (spec 60). Status/protocolo/chave vêm da integradora escolhida na F0-humana; a integração por API é F3. O desenho não assume integradora nenhuma de propósito — payload jsonb absorve o formato dela.';


--
-- Name: repasse_avisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repasse_avisos (
    repasse_id uuid NOT NULL,
    inscrito_id uuid NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    avisado_por uuid,
    avisado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: repasse_inscritos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repasse_inscritos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    lead_id uuid,
    trilha text NOT NULL,
    nome text NOT NULL,
    whatsapp text NOT NULL,
    faixa text,
    carrocerias text[] DEFAULT '{}'::text[] NOT NULL,
    cnpj text,
    loja_cidade text,
    cnpj_conferido_em timestamp with time zone,
    cnpj_conferido_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inscrito_carrocerias_da_lista CHECK ((carrocerias <@ ARRAY['hatch'::text, 'seda'::text, 'suv'::text, 'picape'::text, 'moto'::text, 'outro'::text])),
    CONSTRAINT inscrito_lojista_tem_cnpj CHECK (((trilha <> 'lojista'::text) OR (NULLIF(TRIM(BOTH FROM cnpj), ''::text) IS NOT NULL))),
    CONSTRAINT repasse_inscritos_faixa_check CHECK (((faixa IS NULL) OR (faixa = ANY (ARRAY['ate-30'::text, '30-50'::text, '50-80'::text, 'acima-80'::text])))),
    CONSTRAINT repasse_inscritos_trilha_check CHECK ((trilha = ANY (ARRAY['consumidor'::text, 'lojista'::text])))
);


--
-- Name: TABLE repasse_inscritos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.repasse_inscritos IS 'Lista do repasse (spec 2026-09-24 §4.2). Sair da lista APAGA a linha — é o que a /privacidade promete.';


--
-- Name: repasses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repasses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    slug text NOT NULL,
    marca text NOT NULL,
    modelo text NOT NULL,
    versao text,
    ano_modelo smallint NOT NULL,
    ano_fabricacao smallint,
    quilometragem integer NOT NULL,
    cambio text,
    combustivel text,
    cor text,
    carroceria text,
    preco numeric(12,2) NOT NULL,
    fipe_valor numeric(12,2),
    fipe_codigo text,
    fipe_mes_referencia text,
    laudo public.laudo_do_repasse,
    laudo_apontamento text,
    leilao_consta boolean,
    leilao_detalhe text,
    sinistro_consta boolean,
    sinistro_detalhe text,
    historico_consultado_em date,
    resumo text,
    motivo text,
    itens_de_estado jsonb DEFAULT '[]'::jsonb NOT NULL,
    sem_defeitos_conhecidos boolean DEFAULT false NOT NULL,
    oficina_do_orcamento text,
    orcamento_em date,
    web_full_images jsonb DEFAULT '[]'::jsonb NOT NULL,
    whatsapp_images jsonb DEFAULT '[]'::jsonb NOT NULL,
    situacao public.situacao_do_repasse DEFAULT 'rascunho'::public.situacao_do_repasse NOT NULL,
    lojistas_desde timestamp with time zone,
    aberto_ao_publico_em timestamp with time zone,
    reservado_em timestamp with time zone,
    vendido_em timestamp with time zone,
    arquivado_em timestamp with time zone,
    criado_por uuid,
    enviado_em timestamp with time zone,
    validado_por uuid,
    validado_em timestamp with time zone,
    devolvido_com text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT repasse_apontamento_tem_texto CHECK (((laudo IS DISTINCT FROM 'aprovado_com_apontamento'::public.laudo_do_repasse) OR (NULLIF(TRIM(BOTH FROM laudo_apontamento), ''::text) IS NOT NULL))),
    CONSTRAINT repasse_arquivado_tem_data CHECK (((situacao <> 'arquivado'::public.situacao_do_repasse) OR (arquivado_em IS NOT NULL))),
    CONSTRAINT repasse_completo_fora_do_rascunho CHECK (((situacao = ANY (ARRAY['rascunho'::public.situacao_do_repasse, 'arquivado'::public.situacao_do_repasse])) OR ((laudo IS NOT NULL) AND (leilao_consta IS NOT NULL) AND (sinistro_consta IS NOT NULL) AND (historico_consultado_em IS NOT NULL) AND (fipe_valor IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM fipe_mes_referencia), ''::text) IS NOT NULL) AND (carroceria IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM resumo), ''::text) IS NOT NULL) AND (NULLIF(TRIM(BOTH FROM motivo), ''::text) IS NOT NULL) AND ((leilao_consta IS FALSE) OR (NULLIF(TRIM(BOTH FROM leilao_detalhe), ''::text) IS NOT NULL)) AND ((sinistro_consta IS FALSE) OR (NULLIF(TRIM(BOTH FROM sinistro_detalhe), ''::text) IS NOT NULL)) AND (sem_defeitos_conhecidos OR (jsonb_array_length(itens_de_estado) > 0)) AND ((NOT jsonb_path_exists(itens_de_estado, '$[*]?(@."orcamento" > 0)'::jsonpath)) OR ((NULLIF(TRIM(BOTH FROM oficina_do_orcamento), ''::text) IS NOT NULL) AND (orcamento_em IS NOT NULL)))))),
    CONSTRAINT repasse_publicado_tem_data CHECK (((situacao <> ALL (ARRAY['publicado'::public.situacao_do_repasse, 'reservado'::public.situacao_do_repasse, 'vendido'::public.situacao_do_repasse])) OR (lojistas_desde IS NOT NULL))),
    CONSTRAINT repasse_reservado_tem_data CHECK (((situacao <> 'reservado'::public.situacao_do_repasse) OR (reservado_em IS NOT NULL))),
    CONSTRAINT repasse_vendido_tem_data CHECK (((situacao <> 'vendido'::public.situacao_do_repasse) OR (vendido_em IS NOT NULL))),
    CONSTRAINT repasses_ano_fabricacao_check CHECK (((ano_fabricacao IS NULL) OR ((ano_fabricacao >= 1950) AND (ano_fabricacao <= 2100)))),
    CONSTRAINT repasses_ano_modelo_check CHECK (((ano_modelo >= 1950) AND (ano_modelo <= 2100))),
    CONSTRAINT repasses_carroceria_check CHECK (((carroceria IS NULL) OR (carroceria = ANY (ARRAY['hatch'::text, 'seda'::text, 'suv'::text, 'picape'::text, 'moto'::text, 'outro'::text])))),
    CONSTRAINT repasses_fipe_valor_check CHECK (((fipe_valor IS NULL) OR (fipe_valor > (0)::numeric))),
    CONSTRAINT repasses_itens_de_estado_check CHECK ((jsonb_typeof(itens_de_estado) = 'array'::text)),
    CONSTRAINT repasses_preco_check CHECK ((preco > (0)::numeric)),
    CONSTRAINT repasses_quilometragem_check CHECK ((quilometragem >= 0)),
    CONSTRAINT repasses_resumo_check CHECK (((resumo IS NULL) OR (char_length(resumo) <= 140))),
    CONSTRAINT repasses_web_full_images_check CHECK ((jsonb_typeof(web_full_images) = 'array'::text)),
    CONSTRAINT repasses_whatsapp_images_check CHECK ((jsonb_typeof(whatsapp_images) = 'array'::text))
);


--
-- Name: TABLE repasses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.repasses IS 'Repasse Motors: carro vendido no estado, sem a garantia da loja (spec 2026-09-24). Não confundir com modalidade_tipo = repasse (entrada vinda de outro lojista).';


--
-- Name: saude_da_atribuicao_dos_leads; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.saude_da_atribuicao_dos_leads WITH (security_invoker='true') AS
 SELECT ((created_at AT TIME ZONE 'America/Sao_Paulo'::text))::date AS dia,
    COALESCE(canal, '(sem canal)'::text) AS canal,
    count(*) AS leads,
    count(event_id) AS com_event_id,
    count(fbp) AS com_fbp,
    count(fbc) AS com_fbc,
    count(gclid) AS com_gclid,
    count(fbclid) AS com_fbclid,
    count(utm_source) AS com_utm_source,
    count(veiculo_id) AS com_veiculo_id
   FROM public.leads l
  GROUP BY (((created_at AT TIME ZONE 'America/Sao_Paulo'::text))::date), COALESCE(canal, '(sem canal)'::text);


--
-- Name: VIEW saude_da_atribuicao_dos_leads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.saude_da_atribuicao_dos_leads IS 'Preenchimento dos identificadores de mídia por dia (America/Sao_Paulo) e canal. Só contagens, sem PII. security_invoker: vale a RLS de leads. Canal WhatsApp vem do Chatwoot e não tem identificador web por natureza. Ver supabase/migrations/20260921090901_saude_da_atribuicao_dos_leads.sql.';


--
-- Name: sdr_qualificacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sdr_qualificacao (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    prazo_compra text,
    forma_pagamento text,
    possui_troca boolean,
    veiculo_troca text,
    entrada_disponivel boolean,
    score_final integer,
    classificacao text,
    resumo text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id text NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sms_campanhas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_campanhas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    nome text NOT NULL,
    codigo text NOT NULL,
    veiculo_id bigint,
    veiculo_rotulo text,
    destino text NOT NULL,
    criterio text NOT NULL,
    janela_dias integer,
    mensagem text NOT NULL,
    situacao text DEFAULT 'rascunho'::text NOT NULL,
    homologacao boolean DEFAULT false NOT NULL,
    criado_por uuid,
    criado_por_nome text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    enviada_em timestamp with time zone,
    interrompida_em timestamp with time zone,
    canais text[] DEFAULT '{}'::text[] NOT NULL,
    descanso_dias integer DEFAULT 0 NOT NULL,
    compra_ha_meses integer,
    CONSTRAINT sms_campanhas_carro_do_criterio CHECK ((((veiculo_id IS NULL) = (veiculo_rotulo IS NULL)) AND ((veiculo_id IS NOT NULL) OR (criterio <> ALL (ARRAY['mesmo_veiculo'::text, 'mesmo_modelo'::text, 'mesma_marca'::text, 'faixa_de_preco'::text]))))),
    CONSTRAINT sms_campanhas_codigo_valido CHECK ((codigo ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{7}$'::text)),
    CONSTRAINT sms_campanhas_compra_so_de_cliente CHECK (((compra_ha_meses IS NULL) OR (criterio = ANY (ARRAY['clientes'::text, 'todos'::text])))),
    CONSTRAINT sms_campanhas_compra_valida CHECK (((compra_ha_meses IS NULL) OR (compra_ha_meses = ANY (ARRAY[12, 18, 24, 36])))),
    CONSTRAINT sms_campanhas_criterio_valido CHECK ((criterio = ANY (ARRAY['mesmo_veiculo'::text, 'mesmo_modelo'::text, 'mesma_marca'::text, 'faixa_de_preco'::text, 'interessados'::text, 'clientes'::text, 'todos'::text]))),
    CONSTRAINT sms_campanhas_descanso_valido CHECK ((descanso_dias = ANY (ARRAY[0, 7, 15, 30]))),
    CONSTRAINT sms_campanhas_destino_e_caminho CHECK ((destino ~ '^/[^/]'::text)),
    CONSTRAINT sms_campanhas_janela_valida CHECK (((janela_dias IS NULL) OR (janela_dias = ANY (ARRAY[30, 90, 180, 365])))),
    CONSTRAINT sms_campanhas_mensagem_tem_link CHECK ((POSITION(('{link}'::text) IN (mensagem)) > 0)),
    CONSTRAINT sms_campanhas_nome_valido CHECK (((char_length(nome) >= 1) AND (char_length(nome) <= 80) AND (btrim(nome) <> ''::text))),
    CONSTRAINT sms_campanhas_sem_carro_sem_variavel CHECK (((veiculo_id IS NOT NULL) OR ((POSITION(('{carro}'::text) IN (mensagem)) = 0) AND (POSITION(('{preco}'::text) IN (mensagem)) = 0)))),
    CONSTRAINT sms_campanhas_situacao_valida CHECK ((situacao = ANY (ARRAY['rascunho'::text, 'enviando'::text, 'enviada'::text, 'interrompida'::text])))
);


--
-- Name: TABLE sms_campanhas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sms_campanhas IS 'Campanhas de SMS (2026-10-07), criadas em /admin/marketing/sms e enviadas pela APIBrasil. Uma linha por campanha: o carro (quando há), o critério de público (por carro ou por perfil), os canais, o descanso, o molde da mensagem e a situação. SEM dado de pessoa: os destinatários ficam em sms_envios, que o painel não lê. Administrador e Marketing leem; ninguém escreve pelo painel (quem grava é o servidor, com a chave de serviço, depois de autorizar pela matriz). Ver 20261007120000_sms_campanhas.sql.';


--
-- Name: COLUMN sms_campanhas.nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.nome IS 'O nome que a equipe deu à campanha. 1 a 80 caracteres (TAMANHO_MAXIMO_DO_NOME).';


--
-- Name: COLUMN sms_campanhas.codigo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.codigo IS 'Sete caracteres de 23456789abcdefghjkmnpqrstuvwxyz (ALFABETO_DO_CODIGO, sem 0/o e 1/l/i). Vai no utm_campaign com que o clique chega à ficha: sms-<codigo>.';


--
-- Name: COLUMN sms_campanhas.veiculo_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.veiculo_id IS 'O carro da campanha: estoque_motors.id. SEM chave estrangeira, de propósito: o carro sai do estoque e a campanha fica. Obrigatório nos critérios por carro; NULO em campanha por perfil sem carro (o link leva ao estoque).';


--
-- Name: COLUMN sms_campanhas.veiculo_rotulo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.veiculo_rotulo IS 'Retrato do nome do carro quando a campanha foi criada. Sobrevive à venda. Nulo quando, e só quando, veiculo_id é nulo.';


--
-- Name: COLUMN sms_campanhas.destino; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.destino IS 'O caminho da ficha para onde o link curto leva, sem domínio: começa com ''/'' e não com ''//''. As marcas de UTM são postas pelo código (destinoDoClique).';


--
-- Name: COLUMN sms_campanhas.criterio; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.criterio IS 'Quem recebe (CRITERIOS_DE_PUBLICO em src/lib/smsCampanhas.ts). Por carro, em relação ao carro da campanha: mesmo_veiculo, mesmo_modelo, mesma_marca ou faixa_de_preco. Por perfil, sem olhar que carro a pessoa viu: interessados (procurou a loja e não comprou), clientes (já comprou) ou todos.';


--
-- Name: COLUMN sms_campanhas.janela_dias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.janela_dias IS 'Há quantos dias, no máximo, o interesse aconteceu (por perfil: o último contato): 30, 90, 180 ou 365. NULO é sem limite (JANELAS_DE_INTERESSE).';


--
-- Name: COLUMN sms_campanhas.mensagem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.mensagem IS 'O MOLDE, com as variáveis ({nome}, {carro}, {preco}, {link}). Tem de conter {link}: sem ele não há como medir quem abriu. Sem carro, não pode conter {carro} nem {preco}. A mensagem final de cada destinatário fica em sms_envios.texto.';


--
-- Name: COLUMN sms_campanhas.situacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.situacao IS 'rascunho (público montado, nada saiu), enviando (os lotes estão saindo; só nesta situação sms_reservar_envios reserva), enviada ou interrompida.';


--
-- Name: COLUMN sms_campanhas.homologacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.homologacao IS 'A campanha rodou no modo de teste do fornecedor: nenhum SMS saiu de verdade.';


--
-- Name: COLUMN sms_campanhas.criado_por; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.criado_por IS 'auth.uid() de quem criou, gravado pelo servidor a partir da sessão.';


--
-- Name: COLUMN sms_campanhas.criado_por_nome; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.criado_por_nome IS 'Nome de quem criou, para continuar legível quando a pessoa sair da loja.';


--
-- Name: COLUMN sms_campanhas.canais; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.canais IS 'Só quem chegou por estes canais (OLX, Site, Instagram...). VAZIO é todos.';


--
-- Name: COLUMN sms_campanhas.descanso_dias; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.descanso_dias IS 'O descanso: quem recebeu QUALQUER campanha há menos de tantos dias fica de fora desta. 0 desliga; 7, 15 ou 30 (DESCANSOS_EM_DIAS).';


--
-- Name: COLUMN sms_campanhas.compra_ha_meses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_campanhas.compra_ha_meses IS 'Só quem comprou há PELO MENOS tantos meses ("hora de trocar seu carro"): 12, 18, 24 ou 36 (TEMPOS_DESDE_A_COMPRA). NULO não filtra. Só existe com o critério clientes ou todos; com o filtro ligado, quem não tem data de compra conhecida (marketing_contatos.comprou_em) fica de fora.';


--
-- Name: sms_descadastros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_descadastros (
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    telefone text NOT NULL,
    origem text NOT NULL,
    campanha_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_descadastros_origem_valida CHECK ((origem = ANY (ARRAY['resposta'::text, 'painel'::text]))),
    CONSTRAINT sms_descadastros_telefone_valido CHECK ((telefone ~ '^55[1-9][0-9]9[0-9]{8}$'::text))
);


--
-- Name: TABLE sms_descadastros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sms_descadastros IS 'Números que pediram para não receber mais SMS da loja (2026-10-07). É o direito de oposição (LGPD, art. 18, § 2º) ao legítimo interesse: vale para TODAS as campanhas, e montarPublico tira esses números antes de qualquer envio. DADO PESSOAL: o painel não lê (sem privilégio e sem policy para authenticated); só o servidor, com a chave de serviço. Não some com a campanha nem com o lead: apagar a saída faria o número voltar a receber.';


--
-- Name: COLUMN sms_descadastros.telefone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_descadastros.telefone IS 'Só dígitos, com 55 e DDD — o mesmo formato de sms_envios.telefone.';


--
-- Name: COLUMN sms_descadastros.origem; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_descadastros.origem IS 'resposta (a pessoa respondeu SAIR a um SMS) ou painel (a equipe registrou o pedido).';


--
-- Name: COLUMN sms_descadastros.campanha_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sms_descadastros.campanha_id IS 'A campanha a que a pessoa respondeu, quando houve. Apagar a campanha deixa nulo aqui e a saída continua valendo.';


--
-- Name: telemetria_resumo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telemetria_resumo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veiculo_vendido_id uuid NOT NULL,
    competencia date NOT NULL,
    km_percorrido integer NOT NULL,
    km_odometro_fim integer,
    horas_uso numeric(8,2),
    freadas_bruscas integer DEFAULT 0,
    aceleracoes_bruscas integer DEFAULT 0,
    excessos_velocidade integer DEFAULT 0,
    pct_noturno numeric(5,2),
    consentimento_conducao boolean DEFAULT false,
    fonte text
);


--
-- Name: textos_de_hub; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.textos_de_hub (
    caminho text NOT NULL,
    titulo text,
    paragrafos text[],
    atualizado_por uuid,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE textos_de_hub; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.textos_de_hub IS 'Override do texto das páginas de hub (marca, modelo, carroceria, perfil, faixa). Linha ausente ou campo nulo = usa o texto gerado por lib/textoDosHubs.ts. Chaveada pelo caminho servido.';


--
-- Name: COLUMN textos_de_hub.caminho; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.textos_de_hub.caminho IS 'O caminho da página, começando com barra e sem barra final — o mesmo que caminhosDosHubs() devolve.';


--
-- Name: tracking_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracking_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    ag_uid uuid NOT NULL,
    event_name text DEFAULT 'PageView'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    url_path text,
    utm_source text DEFAULT 'organic'::text,
    utm_medium text DEFAULT 'none'::text,
    utm_campaign text DEFAULT 'none'::text,
    utm_term text,
    utm_content text,
    click_id text,
    raw_network_data jsonb
);


--
-- Name: TABLE tracking_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tracking_events IS 'Eventos de tracking de um fluxo antigo do n8n, parado desde 2026-06. O tracking de produção (TRACKING_SPEC.md) é Pixel/CAPI e não passa aqui. RLS fechada em 2026-08-15; as linhas históricas ficam.';


--
-- Name: veiculo_custos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculo_custos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    veiculo_id uuid NOT NULL,
    categoria text NOT NULL,
    fornecedor text,
    valor numeric(12,2) NOT NULL,
    competencia date DEFAULT CURRENT_DATE NOT NULL,
    previsto boolean DEFAULT false NOT NULL,
    titulo_id uuid,
    anexo_url text,
    observacoes text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    CONSTRAINT veiculo_custos_valor_check CHECK ((valor >= (0)::numeric))
);


--
-- Name: TABLE veiculo_custos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.veiculo_custos IS 'Custos por unidade (spec 00): previsto × realizado. Toda despesa tem dono. O razão (fatia e) contabiliza via CUSTO_LANCADO; titulo_id fica para o financeiro novo.';


--
-- Name: veiculo_entradas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculo_entradas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    veiculo_id uuid NOT NULL,
    modalidade public.modalidade_tipo NOT NULL,
    posse public.posse_tipo NOT NULL,
    data_entrada date DEFAULT CURRENT_DATE NOT NULL,
    valor_entrada numeric(12,2) DEFAULT 0 NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    fornecedor_nome text,
    fornecedor_documento text,
    fornecedor_tipo_pessoa text,
    forma_pagamento text,
    prazo_pagamento text,
    nf_ref text,
    venda_origem_id uuid,
    consig_prazo_dias integer,
    consig_valor_dono numeric(12,2),
    consig_remuneracao_tipo text,
    consig_remuneracao_valor numeric(12,2),
    parceria_parceiro text,
    parceria_preco_entrada numeric(12,2),
    parceria_margem_acordada numeric(12,2),
    parceria_exclusividade boolean,
    parceria_dut_em_poder_de text,
    parceria_regresso_prazo_dias integer,
    repasse_loja_origem text,
    repasse_giro_alvo_dias integer,
    observacoes text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    CONSTRAINT consignacao_sem_custo CHECK (((modalidade <> 'consignacao'::public.modalidade_tipo) OR (valor_entrada = (0)::numeric))),
    CONSTRAINT lote_momento_b CHECK ((modalidade <> 'lote'::public.modalidade_tipo)),
    CONSTRAINT parceria_exige_preco CHECK (((modalidade <> 'parceria'::public.modalidade_tipo) OR (parceria_preco_entrada IS NOT NULL))),
    CONSTRAINT terceiro_sem_posse CHECK (((posse = 'terceiro'::public.posse_tipo) = (modalidade = ANY (ARRAY['consignacao'::public.modalidade_tipo, 'parceria'::public.modalidade_tipo])))),
    CONSTRAINT troca_exige_venda CHECK (((modalidade <> 'troca'::public.modalidade_tipo) OR (venda_origem_id IS NOT NULL))),
    CONSTRAINT veiculo_entradas_consig_remuneracao_tipo_check CHECK ((consig_remuneracao_tipo = ANY (ARRAY['fixa'::text, 'percentual'::text]))),
    CONSTRAINT veiculo_entradas_fornecedor_tipo_pessoa_check CHECK ((fornecedor_tipo_pessoa = ANY (ARRAY['pf'::text, 'pj'::text]))),
    CONSTRAINT veiculo_entradas_valor_entrada_check CHECK ((valor_entrada >= (0)::numeric))
);


--
-- Name: TABLE veiculo_entradas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.veiculo_entradas IS 'Uma linha por entrada (spec 10). O formulário muda por modalidade; aqui as regras valem para qualquer formulário. Correção e estorno são EVENTOS com motivo (spec 10) — a fatia c traz veiculo_eventos.';


--
-- Name: veiculo_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculo_eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    veiculo_id uuid NOT NULL,
    tipo public.evento_tipo NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    usuario_id uuid NOT NULL,
    motivo text,
    criado_em timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    seq bigint NOT NULL,
    CONSTRAINT motivo_obrigatorio_em_correcoes CHECK (((tipo <> ALL (ARRAY['CORRECAO_ENTRADA'::public.evento_tipo, 'ESTORNO_ENTRADA'::public.evento_tipo, 'ESTORNO_VENDA'::public.evento_tipo])) OR ((motivo IS NOT NULL) AND (length(TRIM(BOTH FROM motivo)) > 0))))
);


--
-- Name: TABLE veiculo_eventos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.veiculo_eventos IS 'A linha do tempo imutável do veículo (handoff, decisão 1). Nada aqui se edita ou apaga — corrigiu, é evento novo com motivo. Situação/custo/margem derivam daqui.';


--
-- Name: COLUMN veiculo_eventos.seq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.veiculo_eventos.seq IS 'Desempate da ordem quando dois eventos caem no mesmo instante. `criado_em` sozinho não basta: até 2026-08-29 usava now() (instante da TRANSAÇÃO) e o desempate caía no uuid aleatório — um carro vendido projetava "estoque" em metade dos casos.';


--
-- Name: veiculo_eventos_seq_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.veiculo_eventos ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.veiculo_eventos_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: veiculo_precos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculo_precos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    veiculo_id uuid NOT NULL,
    fipe_valor numeric(12,2),
    preco_anuncio numeric(12,2),
    preco_minimo numeric(12,2),
    vigente_desde timestamp with time zone DEFAULT now() NOT NULL,
    criado_por uuid,
    CONSTRAINT piso_nao_excede_anuncio CHECK (((preco_minimo IS NULL) OR (preco_anuncio IS NULL) OR (preco_minimo <= preco_anuncio))),
    CONSTRAINT precos_nao_negativos CHECK (((COALESCE(fipe_valor, (0)::numeric) >= (0)::numeric) AND (COALESCE(preco_anuncio, (0)::numeric) >= (0)::numeric) AND (COALESCE(preco_minimo, (0)::numeric) >= (0)::numeric)))
);


--
-- Name: TABLE veiculo_precos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.veiculo_precos IS 'Histórico de preço da unidade (spec 00): FIPE, anúncio e piso, com vigência. Venda abaixo do piso sem aprovação é bloqueio do fechamento (spec 20, F1).';


--
-- Name: veiculos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid DEFAULT public.org_padrao() NOT NULL,
    chassi text NOT NULL,
    placa text,
    renavam text,
    marca text NOT NULL,
    modelo text NOT NULL,
    versao text,
    ano integer,
    ano_fabricacao integer,
    fipe_codigo text,
    km_atual integer,
    estoque_id integer,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT veiculos_km_atual_check CHECK (((km_atual IS NULL) OR (km_atual >= 0)))
);


--
-- Name: TABLE veiculos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.veiculos IS 'Identidade do núcleo (handoff spec 00): uuid + chassi único por org. Não confundir com a ex-veiculos do feed — hoje estoque_motors, que segue sendo a leitura do site até a F2. Elo entre os dois mundos: estoque_id (D-T1.4).';


--
-- Name: veiculo_situacao; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.veiculo_situacao WITH (security_invoker='true') AS
 SELECT v.id AS veiculo_id,
    v.org_id,
    public.calcula_situacao(COALESCE(array_agg(e.tipo ORDER BY e.criado_em, e.seq) FILTER (WHERE (e.id IS NOT NULL)), '{}'::public.evento_tipo[])) AS situacao,
    count(e.id) AS eventos,
    max(e.criado_em) AS ultimo_evento_em
   FROM (public.veiculos v
     LEFT JOIN public.veiculo_eventos e ON ((e.veiculo_id = v.id)))
  GROUP BY v.id, v.org_id;


--
-- Name: VIEW veiculo_situacao; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.veiculo_situacao IS 'A situação de cada unidade, derivada dos eventos. security_invoker: a RLS de quem pergunta vale — anon não vê nada do núcleo (D-T1.5).';


--
-- Name: veiculos_vendidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiculos_vendidos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    estoque_id integer,
    chassi text NOT NULL,
    placa text NOT NULL,
    marca text NOT NULL,
    modelo text NOT NULL,
    versao text,
    ano_fabricacao integer NOT NULL,
    ano_modelo integer NOT NULL,
    data_venda date NOT NULL,
    km_na_venda integer NOT NULL,
    valor_venda numeric(12,2) NOT NULL,
    custo_aquisicao numeric(12,2),
    aderiu_ciclo boolean DEFAULT false,
    vendedor text,
    created_at timestamp with time zone DEFAULT now(),
    vendedor_id uuid,
    saiu_em date,
    motivo_saida text,
    CONSTRAINT veiculos_vendidos_saida_com_motivo CHECK (((saiu_em IS NULL) OR (COALESCE(TRIM(BOTH FROM motivo_saida), ''::text) <> ''::text)))
);


--
-- Name: COLUMN veiculos_vendidos.vendedor_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.veiculos_vendidos.vendedor_id IS 'Quem fechou a venda, observado da sessão — não digitado. A coluna vendedor (texto) permanece para a base histórica do §3.3, que não tem profile.';


--
-- Name: COLUMN veiculos_vendidos.saiu_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.veiculos_vendidos.saiu_em IS 'Data em que o carro deixou de ser do cliente. Preenchida, desliga o gerador de janelas, os quatro gatilhos e a escrita do cliente no diário de bordo — a LEITURA do histórico continua, porque o dado é dele.';


--
-- Name: COLUMN veiculos_vendidos.motivo_saida; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.veiculos_vendidos.motivo_saida IS 'Texto livre, obrigatório quando há saiu_em. Sem lista fechada enquanto a loja não tiver visto os casos reais.';


--
-- Name: vw_ciclo_estado; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.vw_ciclo_estado AS
 SELECT vv.id AS veiculo_vendido_id,
    c.id AS cliente_id,
    c.nome,
    c.telefone_e164,
    vv.placa,
    vv.marca,
    vv.modelo,
    vv.ano_modelo,
    vv.data_venda,
    ((CURRENT_DATE - vv.data_venda) / 30) AS meses_desde_venda,
    vv.km_na_venda,
    COALESCE(m.km_ultimo, vv.km_na_venda) AS km_conhecido,
    m.data_ultima_manutencao,
    cc.recompra_valor,
    cc.recompra_janela_ini,
    cc.recompra_janela_fim,
    cc.status_elegibilidade,
    cc.garantia_fim,
    ap.vigencia_fim AS seguro_vence_em,
    cf.instituicao,
    cf.valor_parcela,
    cf.prazo_meses,
    cf.data_primeira_parcela,
    cf.taxa_mensal,
    cf.valor_financiado
   FROM (((((public.veiculos_vendidos vv
     JOIN public.clientes c ON ((c.id = vv.cliente_id)))
     LEFT JOIN public.contratos_ciclo cc ON ((cc.veiculo_vendido_id = vv.id)))
     LEFT JOIN LATERAL ( SELECT max(manutencoes.km_registrado) AS km_ultimo,
            max(manutencoes.data_servico) AS data_ultima_manutencao
           FROM public.manutencoes
          WHERE ((manutencoes.veiculo_vendido_id = vv.id) AND (manutencoes.confirmada_em IS NOT NULL))) m ON (true))
     LEFT JOIN LATERAL ( SELECT apolices_seguro.vigencia_fim
           FROM public.apolices_seguro
          WHERE (apolices_seguro.veiculo_vendido_id = vv.id)
          ORDER BY apolices_seguro.vigencia_fim DESC
         LIMIT 1) ap ON (true))
     LEFT JOIN LATERAL ( SELECT contratos_financiamento.id,
            contratos_financiamento.veiculo_vendido_id,
            contratos_financiamento.instituicao,
            contratos_financiamento.valor_financiado,
            contratos_financiamento.valor_entrada,
            contratos_financiamento.taxa_mensal,
            contratos_financiamento.prazo_meses,
            contratos_financiamento.valor_parcela,
            contratos_financiamento.data_primeira_parcela,
            contratos_financiamento.sistema_amortizacao,
            contratos_financiamento.status,
            contratos_financiamento.created_at
           FROM public.contratos_financiamento
          WHERE ((contratos_financiamento.veiculo_vendido_id = vv.id) AND (contratos_financiamento.status = 'ativo'::text))
         LIMIT 1) cf ON (true))
  WITH NO DATA;


--
-- Name: vw_ciclo_estado_painel; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_ciclo_estado_painel AS
 SELECT veiculo_vendido_id,
    cliente_id,
    nome,
    telefone_e164,
    placa,
    marca,
    modelo,
    ano_modelo,
    data_venda,
    meses_desde_venda,
    km_na_venda,
    km_conhecido,
    data_ultima_manutencao,
    recompra_valor,
    recompra_janela_ini,
    recompra_janela_fim,
    status_elegibilidade,
    garantia_fim,
    seguro_vence_em,
    instituicao,
    valor_parcela,
    prazo_meses,
    data_primeira_parcela,
    taxa_mensal,
    valor_financiado
   FROM public.vw_ciclo_estado
  WHERE public.is_staff(auth.uid());


--
-- Name: VIEW vw_ciclo_estado_painel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.vw_ciclo_estado_painel IS 'Recorte de vw_ciclo_estado para o painel. A matview não respeita RLS; esta view é o único caminho de leitura com sessão, e ela exige is_staff.';


--
-- Name: vw_vendas_incompletas; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_vendas_incompletas AS
 SELECT vv.id AS veiculo_vendido_id,
    vv.data_venda,
    vv.placa,
    vv.marca,
    vv.modelo,
    vv.vendedor_id,
    COALESCE(p.full_name, vv.vendedor, '(sem vendedor)'::text) AS vendedor_nome,
    p.telefone_e164 AS vendedor_telefone,
    c.id AS cliente_id,
    c.nome AS cliente_nome,
    array_remove(ARRAY[
        CASE
            WHEN (vv.vendedor_id IS NULL) THEN 'vendedor'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (COALESCE(TRIM(BOTH FROM vv.versao), ''::text) = ''::text) THEN 'versao'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (COALESCE(TRIM(BOTH FROM c.cep), ''::text) = ''::text) THEN 'cep'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (c.data_nascimento IS NULL) THEN 'data_nascimento'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((NOT COALESCE(((c.consentimento_canais ->> 'whatsapp'::text))::boolean, false)) AND (NOT COALESCE(((c.consentimento_canais ->> 'email'::text))::boolean, false)) AND (NOT COALESCE(((c.consentimento_canais ->> 'sms'::text))::boolean, false))) THEN 'consentimento_canais'::text
            ELSE NULL::text
        END], NULL::text) AS pendencias
   FROM ((public.veiculos_vendidos vv
     JOIN public.clientes c ON ((c.id = vv.cliente_id)))
     LEFT JOIN public.profiles p ON ((p.id = vv.vendedor_id)))
  WHERE (public.is_staff(auth.uid()) OR (CURRENT_USER = 'service_role'::name));


--
-- Name: VIEW vw_vendas_incompletas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.vw_vendas_incompletas IS 'Uma linha por venda, com as pendências do registro (§3.2). Régua de 5 campos que o formulário deixa passar em branco — os obrigatórios do §3.1 não entram porque fechar_venda_ciclo já os recusa. Restrita a staff.';


--
-- Name: anuncios anuncios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anuncios
    ADD CONSTRAINT anuncios_pkey PRIMARY KEY (id);


--
-- Name: apolices_seguro apolices_seguro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apolices_seguro
    ADD CONSTRAINT apolices_seguro_pkey PRIMARY KEY (id);


--
-- Name: atendimentos atendimentos_chatwoot_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_chatwoot_conversation_id_key UNIQUE (chatwoot_conversation_id);


--
-- Name: atendimentos atendimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_pkey PRIMARY KEY (id);


--
-- Name: auditoria_admin auditoria_admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria_admin
    ADD CONSTRAINT auditoria_admin_pkey PRIMARY KEY (id);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- Name: cabecalho_dos_guias cabecalho_dos_guias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cabecalho_dos_guias
    ADD CONSTRAINT cabecalho_dos_guias_pkey PRIMARY KEY (secao);


--
-- Name: ciclo_parametros ciclo_parametros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ciclo_parametros
    ADD CONSTRAINT ciclo_parametros_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: clientes clientes_cpf_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_cpf_cnpj_key UNIQUE (cpf_cnpj);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: confirmacoes_disponibilidade confirmacoes_disponibilidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confirmacoes_disponibilidade
    ADD CONSTRAINT confirmacoes_disponibilidade_pkey PRIMARY KEY (id);


--
-- Name: conformidade_diaria conformidade_diaria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conformidade_diaria
    ADD CONSTRAINT conformidade_diaria_pkey PRIMARY KEY (dia);


--
-- Name: consultas_de_modelo consultas_de_modelo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultas_de_modelo
    ADD CONSTRAINT consultas_de_modelo_pkey PRIMARY KEY (id);


--
-- Name: consultas_de_placa consultas_de_placa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultas_de_placa
    ADD CONSTRAINT consultas_de_placa_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_telefone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_telefone_key UNIQUE (telefone);


--
-- Name: contratos_ciclo contratos_ciclo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_ciclo
    ADD CONSTRAINT contratos_ciclo_pkey PRIMARY KEY (id);


--
-- Name: contratos_ciclo contratos_ciclo_veiculo_vendido_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_ciclo
    ADD CONSTRAINT contratos_ciclo_veiculo_vendido_id_key UNIQUE (veiculo_vendido_id);


--
-- Name: contratos_financiamento contratos_financiamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_financiamento
    ADD CONSTRAINT contratos_financiamento_pkey PRIMARY KEY (id);


--
-- Name: documentos documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_pkey PRIMARY KEY (id);


--
-- Name: erros erros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erros
    ADD CONSTRAINT erros_pkey PRIMARY KEY (id);


--
-- Name: eventos_ciclo eventos_ciclo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_ciclo
    ADD CONSTRAINT eventos_ciclo_pkey PRIMARY KEY (id);


--
-- Name: fipe_historico fipe_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fipe_historico
    ADD CONSTRAINT fipe_historico_pkey PRIMARY KEY (id);


--
-- Name: fipe_historico fipe_historico_um_por_mes; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fipe_historico
    ADD CONSTRAINT fipe_historico_um_por_mes UNIQUE (org_id, tipo, marca_codigo, modelo_codigo, ano, referencia);


--
-- Name: funil_etapas funil_etapas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funil_etapas
    ADD CONSTRAINT funil_etapas_pkey PRIMARY KEY (chave);


--
-- Name: funil_motivos funil_motivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.funil_motivos
    ADD CONSTRAINT funil_motivos_pkey PRIMARY KEY (chave);


--
-- Name: guias guias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guias
    ADD CONSTRAINT guias_pkey PRIMARY KEY (slug);


--
-- Name: historico_veiculo historico_veiculo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_veiculo
    ADD CONSTRAINT historico_veiculo_pkey PRIMARY KEY (id);


--
-- Name: ia_classificacoes ia_classificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ia_classificacoes
    ADD CONSTRAINT ia_classificacoes_pkey PRIMARY KEY (id);


--
-- Name: indice_ciclo indice_ciclo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indice_ciclo
    ADD CONSTRAINT indice_ciclo_pkey PRIMARY KEY (id);


--
-- Name: indice_ciclo indice_ciclo_veiculo_vendido_id_competencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indice_ciclo
    ADD CONSTRAINT indice_ciclo_veiculo_vendido_id_competencia_key UNIQUE (veiculo_vendido_id, competencia);


--
-- Name: investidor_movimentos investidor_movimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidor_movimentos
    ADD CONSTRAINT investidor_movimentos_pkey PRIMARY KEY (id);


--
-- Name: investidor_veiculos investidor_veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidor_veiculos
    ADD CONSTRAINT investidor_veiculos_pkey PRIMARY KEY (id);


--
-- Name: investidor_veiculos investidor_veiculos_unicos; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidor_veiculos
    ADD CONSTRAINT investidor_veiculos_unicos UNIQUE (investidor_id, veiculo_id);


--
-- Name: investidores investidores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidores
    ADD CONSTRAINT investidores_pkey PRIMARY KEY (id);


--
-- Name: lancamentos lancamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_pkey PRIMARY KEY (id);


--
-- Name: lead_tags lead_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_tags
    ADD CONSTRAINT lead_tags_pkey PRIMARY KEY (id);


--
-- Name: leads_erros leads_erros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_erros
    ADD CONSTRAINT leads_erros_pkey PRIMARY KEY (id);


--
-- Name: leads leads_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_event_id_key UNIQUE (event_id);


--
-- Name: leads_eventos leads_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_eventos
    ADD CONSTRAINT leads_eventos_pkey PRIMARY KEY (id);


--
-- Name: leads_interacoes leads_interacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_interacoes
    ADD CONSTRAINT leads_interacoes_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: leads_sdr leads_sdr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_sdr
    ADD CONSTRAINT leads_sdr_pkey PRIMARY KEY (id);


--
-- Name: leads_sdr leads_sdr_telefone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_sdr
    ADD CONSTRAINT leads_sdr_telefone_key UNIQUE (telefone);


--
-- Name: leads_veiculos leads_veiculos_lead_veiculo_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_veiculos
    ADD CONSTRAINT leads_veiculos_lead_veiculo_unico UNIQUE (lead_id, veiculo_id);


--
-- Name: leads_veiculos leads_veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_veiculos
    ADD CONSTRAINT leads_veiculos_pkey PRIMARY KEY (id);


--
-- Name: leituras_odometro leituras_odometro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras_odometro
    ADD CONSTRAINT leituras_odometro_pkey PRIMARY KEY (id);


--
-- Name: manutencoes manutencoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manutencoes
    ADD CONSTRAINT manutencoes_pkey PRIMARY KEY (id);


--
-- Name: marketing_contatos marketing_contatos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_contatos
    ADD CONSTRAINT marketing_contatos_pkey PRIMARY KEY (id);


--
-- Name: marketing_contatos marketing_contatos_telefone_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_contatos
    ADD CONSTRAINT marketing_contatos_telefone_unico UNIQUE (org_id, telefone);


--
-- Name: marketing_importacoes marketing_importacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_importacoes
    ADD CONSTRAINT marketing_importacoes_pkey PRIMARY KEY (id);


--
-- Name: marketing_interesses marketing_interesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_interesses
    ADD CONSTRAINT marketing_interesses_pkey PRIMARY KEY (id);


--
-- Name: midia_ajustes midia_ajustes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_ajustes
    ADD CONSTRAINT midia_ajustes_pkey PRIMARY KEY (id);


--
-- Name: midia_anuncios midia_anuncios_campanha_id_externo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_anuncios
    ADD CONSTRAINT midia_anuncios_campanha_id_externo_key UNIQUE (campanha_id, id_externo);


--
-- Name: midia_anuncios midia_anuncios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_anuncios
    ADD CONSTRAINT midia_anuncios_pkey PRIMARY KEY (id);


--
-- Name: midia_campanhas midia_campanhas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_campanhas
    ADD CONSTRAINT midia_campanhas_pkey PRIMARY KEY (id);


--
-- Name: midia_campanhas midia_campanhas_plataforma_id_externo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_campanhas
    ADD CONSTRAINT midia_campanhas_plataforma_id_externo_key UNIQUE (plataforma, id_externo);


--
-- Name: midia_diario midia_diario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_diario
    ADD CONSTRAINT midia_diario_pkey PRIMARY KEY (id);


--
-- Name: midia_diario midia_diario_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_diario
    ADD CONSTRAINT midia_diario_unico UNIQUE NULLS NOT DISTINCT (campanha_id, anuncio_id, dia);


--
-- Name: midia_leituras midia_leituras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_leituras
    ADD CONSTRAINT midia_leituras_pkey PRIMARY KEY (id);


--
-- Name: midia_sincronizacoes midia_sincronizacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_sincronizacoes
    ADD CONSTRAINT midia_sincronizacoes_pkey PRIMARY KEY (id);


--
-- Name: movimentacoes_investidor movimentacoes_investidor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_investidor
    ADD CONSTRAINT movimentacoes_investidor_pkey PRIMARY KEY (id);


--
-- Name: negocio_pagamentos negocio_pagamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocio_pagamentos
    ADD CONSTRAINT negocio_pagamentos_pkey PRIMARY KEY (id);


--
-- Name: negocios negocios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios
    ADD CONSTRAINT negocios_pkey PRIMARY KEY (id);


--
-- Name: notificacoes_admin notificacoes_admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificacoes_admin
    ADD CONSTRAINT notificacoes_admin_pkey PRIMARY KEY (id);


--
-- Name: orgs orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_pkey PRIMARY KEY (id);


--
-- Name: parametros_avaliacao parametros_avaliacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_avaliacao
    ADD CONSTRAINT parametros_avaliacao_pkey PRIMARY KEY (id);


--
-- Name: parametros_financiamento parametros_financiamento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_financiamento
    ADD CONSTRAINT parametros_financiamento_pkey PRIMARY KEY (id);


--
-- Name: parceiros_ciclo parceiros_ciclo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros_ciclo
    ADD CONSTRAINT parceiros_ciclo_pkey PRIMARY KEY (id);


--
-- Name: parceiros parceiros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros
    ADD CONSTRAINT parceiros_pkey PRIMARY KEY (id);


--
-- Name: partidas partidas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partidas
    ADD CONSTRAINT partidas_pkey PRIMARY KEY (id);


--
-- Name: plano_contas plano_contas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_contas
    ADD CONSTRAINT plano_contas_pkey PRIMARY KEY (codigo);


--
-- Name: plano_revisoes plano_revisoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_revisoes
    ADD CONSTRAINT plano_revisoes_pkey PRIMARY KEY (id);


--
-- Name: plano_revisoes plano_revisoes_veiculo_vendido_id_numero_revisao_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_revisoes
    ADD CONSTRAINT plano_revisoes_veiculo_vendido_id_numero_revisao_key UNIQUE (veiculo_vendido_id, numero_revisao);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: regras_comissao regras_comissao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_comissao
    ADD CONSTRAINT regras_comissao_pkey PRIMARY KEY (id);


--
-- Name: regras_contabilizacao regras_contabilizacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_contabilizacao
    ADD CONSTRAINT regras_contabilizacao_pkey PRIMARY KEY (id);


--
-- Name: renave_operacoes renave_operacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renave_operacoes
    ADD CONSTRAINT renave_operacoes_pkey PRIMARY KEY (id);


--
-- Name: repasse_avisos repasse_avisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repasse_avisos
    ADD CONSTRAINT repasse_avisos_pkey PRIMARY KEY (repasse_id, inscrito_id);


--
-- Name: repasse_inscritos repasse_inscritos_org_id_trilha_whatsapp_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repasse_inscritos
    ADD CONSTRAINT repasse_inscritos_org_id_trilha_whatsapp_key UNIQUE (org_id, trilha, whatsapp);


--
-- Name: repasse_inscritos repasse_inscritos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repasse_inscritos
    ADD CONSTRAINT repasse_inscritos_pkey PRIMARY KEY (id);


--
-- Name: repasses repasses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repasses
    ADD CONSTRAINT repasses_pkey PRIMARY KEY (id);


--
-- Name: repasses repasses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repasses
    ADD CONSTRAINT repasses_slug_key UNIQUE (slug);


--
-- Name: sdr_qualificacao sdr_qualificacao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_qualificacao
    ADD CONSTRAINT sdr_qualificacao_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: sms_campanhas sms_campanhas_codigo_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_campanhas
    ADD CONSTRAINT sms_campanhas_codigo_unico UNIQUE (codigo);


--
-- Name: sms_campanhas sms_campanhas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_campanhas
    ADD CONSTRAINT sms_campanhas_pkey PRIMARY KEY (id);


--
-- Name: sms_descadastros sms_descadastros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_descadastros
    ADD CONSTRAINT sms_descadastros_pkey PRIMARY KEY (org_id, telefone);


--
-- Name: sms_envios sms_envios_codigo_unico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_envios
    ADD CONSTRAINT sms_envios_codigo_unico UNIQUE (codigo);


--
-- Name: sms_envios sms_envios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_envios
    ADD CONSTRAINT sms_envios_pkey PRIMARY KEY (id);


--
-- Name: sms_envios sms_envios_um_por_telefone; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_envios
    ADD CONSTRAINT sms_envios_um_por_telefone UNIQUE (campanha_id, telefone);


--
-- Name: telemetria_resumo telemetria_resumo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetria_resumo
    ADD CONSTRAINT telemetria_resumo_pkey PRIMARY KEY (id);


--
-- Name: telemetria_resumo telemetria_resumo_veiculo_vendido_id_competencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetria_resumo
    ADD CONSTRAINT telemetria_resumo_veiculo_vendido_id_competencia_key UNIQUE (veiculo_vendido_id, competencia);


--
-- Name: textos_de_hub textos_de_hub_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.textos_de_hub
    ADD CONSTRAINT textos_de_hub_pkey PRIMARY KEY (caminho);


--
-- Name: tracking_events tracking_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_event_id_key UNIQUE (event_id);


--
-- Name: tracking_events tracking_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking_events
    ADD CONSTRAINT tracking_events_pkey PRIMARY KEY (id);


--
-- Name: veiculo_custos veiculo_custos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_custos
    ADD CONSTRAINT veiculo_custos_pkey PRIMARY KEY (id);


--
-- Name: veiculo_entradas veiculo_entradas_id_veiculo_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_entradas
    ADD CONSTRAINT veiculo_entradas_id_veiculo_uk UNIQUE (id, veiculo_id);


--
-- Name: veiculo_entradas veiculo_entradas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_entradas
    ADD CONSTRAINT veiculo_entradas_pkey PRIMARY KEY (id);


--
-- Name: veiculo_eventos veiculo_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_eventos
    ADD CONSTRAINT veiculo_eventos_pkey PRIMARY KEY (id);


--
-- Name: veiculo_precos veiculo_precos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_precos
    ADD CONSTRAINT veiculo_precos_pkey PRIMARY KEY (id);


--
-- Name: veiculos veiculos_estoque_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_estoque_id_key UNIQUE (estoque_id);


--
-- Name: veiculos veiculos_org_id_chassi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_org_id_chassi_key UNIQUE (org_id, chassi);


--
-- Name: estoque_motors veiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estoque_motors
    ADD CONSTRAINT veiculos_pkey PRIMARY KEY (id);


--
-- Name: veiculos veiculos_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculos
    ADD CONSTRAINT veiculos_pkey1 PRIMARY KEY (id);


--
-- Name: veiculos_vendidos veiculos_vendidos_chassi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculos_vendidos
    ADD CONSTRAINT veiculos_vendidos_chassi_key UNIQUE (chassi);


--
-- Name: veiculos_vendidos veiculos_vendidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculos_vendidos
    ADD CONSTRAINT veiculos_vendidos_pkey PRIMARY KEY (id);


--
-- Name: anuncios_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anuncios_veiculo_idx ON public.anuncios USING btree (veiculo_id, criado_em DESC);


--
-- Name: auditoria_admin_registro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auditoria_admin_registro_idx ON public.auditoria_admin USING btree (registrado_em DESC);


--
-- Name: ciclo_parametros_um_vigente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ciclo_parametros_um_vigente ON public.ciclo_parametros USING btree (org_id) WHERE (vigencia_ate IS NULL);


--
-- Name: consultas_de_modelo_recentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consultas_de_modelo_recentes_idx ON public.consultas_de_modelo USING btree (org_id, criado_em DESC);


--
-- Name: consultas_de_modelo_rotulo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consultas_de_modelo_rotulo_idx ON public.consultas_de_modelo USING btree (org_id, lower(rotulo) text_pattern_ops);


--
-- Name: consultas_de_placa_placa_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consultas_de_placa_placa_idx ON public.consultas_de_placa USING btree (org_id, placa, criado_em DESC);


--
-- Name: documentos_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documentos_owner_idx ON public.documentos USING btree (owner_tipo, owner_id);


--
-- Name: documentos_pendentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documentos_pendentes_idx ON public.documentos USING btree (owner_tipo, owner_id) WHERE pendente;


--
-- Name: erros_abertos_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erros_abertos_idx ON public.erros USING btree (org_id, criado_em DESC) WHERE (resolvido_em IS NULL);


--
-- Name: erros_digest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erros_digest_idx ON public.erros USING btree (digest) WHERE (digest IS NOT NULL);


--
-- Name: erros_hash_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erros_hash_criado_idx ON public.erros USING btree (hash_agrupamento, criado_em DESC);


--
-- Name: erros_org_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erros_org_criado_idx ON public.erros USING btree (org_id, criado_em DESC);


--
-- Name: estoque_motors_chassi_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX estoque_motors_chassi_unico ON public.estoque_motors USING btree (upper(replace(replace(btrim(chassi), '-'::text, ''::text), ' '::text, ''::text))) WHERE ((chassi IS NOT NULL) AND (btrim(chassi) <> ''::text));


--
-- Name: estoque_motors_conteudo_atualizado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estoque_motors_conteudo_atualizado_em_idx ON public.estoque_motors USING btree (conteudo_atualizado_em DESC);


--
-- Name: estoque_motors_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estoque_motors_estado_idx ON public.estoque_motors USING btree (estado_cadastro) WHERE (estado_cadastro = 'publicado'::text);


--
-- Name: estoque_motors_first_seen_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estoque_motors_first_seen_at_idx ON public.estoque_motors USING btree (first_seen_at);


--
-- Name: estoque_motors_last_seen_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estoque_motors_last_seen_at_idx ON public.estoque_motors USING btree (last_seen_at DESC);


--
-- Name: estoque_motors_perfis_uso_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX estoque_motors_perfis_uso_idx ON public.estoque_motors USING gin (perfis_uso);


--
-- Name: estoque_motors_placa_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX estoque_motors_placa_unica ON public.estoque_motors USING btree (upper(replace(replace(btrim(placa), '-'::text, ''::text), ' '::text, ''::text))) WHERE ((placa IS NOT NULL) AND (btrim(placa) <> ''::text));


--
-- Name: estoque_motors_renavam_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX estoque_motors_renavam_unico ON public.estoque_motors USING btree (replace(replace(btrim(renavam), '-'::text, ''::text), '.'::text, ''::text)) WHERE ((renavam IS NOT NULL) AND (btrim(renavam) <> ''::text));


--
-- Name: fipe_historico_recentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fipe_historico_recentes_idx ON public.fipe_historico USING btree (org_id, criado_em DESC);


--
-- Name: historico_veiculo_por_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historico_veiculo_por_veiculo_idx ON public.historico_veiculo USING btree (veiculo_id, registrado_em DESC);


--
-- Name: idx_ap_vigencia_fim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ap_vigencia_fim ON public.apolices_seguro USING btree (vigencia_fim);


--
-- Name: idx_atendimento_conversa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimento_conversa ON public.atendimentos USING btree (chatwoot_conversation_id);


--
-- Name: idx_atendimento_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimento_lead ON public.atendimentos USING btree (lead_id);


--
-- Name: idx_atendimento_lead_recente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_atendimento_lead_recente ON public.atendimentos USING btree (lead_id, COALESCE(iniciado_em, created_at) DESC, created_at DESC) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_cf_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cf_status ON public.contratos_financiamento USING btree (status) WHERE (status = 'ativo'::text);


--
-- Name: idx_cf_veiculo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cf_veiculo ON public.contratos_financiamento USING btree (veiculo_vendido_id);


--
-- Name: idx_cl_auth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cl_auth_user ON public.clientes USING btree (auth_user_id);


--
-- Name: idx_contacts_telefone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_telefone ON public.contacts USING btree (telefone);


--
-- Name: idx_ev_veiculo_gat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ev_veiculo_gat ON public.eventos_ciclo USING btree (veiculo_vendido_id, gatilho, enviado_em DESC);


--
-- Name: idx_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_created ON public.tracking_events USING btree (created_at DESC);


--
-- Name: idx_events_uid_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_uid_name ON public.tracking_events USING btree (ag_uid, event_name);


--
-- Name: idx_ic_veiculo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ic_veiculo ON public.indice_ciclo USING btree (veiculo_vendido_id, competencia DESC);


--
-- Name: idx_investidor_veiculos_ficha; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_investidor_veiculos_ficha ON public.investidor_veiculos USING btree (investidor_cadastro_id, veiculo_id) WHERE (investidor_cadastro_id IS NOT NULL);


--
-- Name: idx_investidores_perfil; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_investidores_perfil ON public.investidores USING btree (perfil_id) WHERE (perfil_id IS NOT NULL);


--
-- Name: idx_leads_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_created ON public.leads USING btree (created_at DESC);


--
-- Name: idx_leads_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_nome ON public.leads USING btree (nome);


--
-- Name: idx_leads_status_capi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status_capi ON public.leads USING btree (capi_meta_status) WHERE (status_qualificacao = 'aprovado'::text);


--
-- Name: idx_leads_status_gec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_status_gec ON public.leads USING btree (gec_status) WHERE (status_qualificacao = 'aprovado'::text);


--
-- Name: idx_lo_veiculo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lo_veiculo ON public.leituras_odometro USING btree (veiculo_vendido_id, registrada_em DESC);


--
-- Name: idx_mn_pendentes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mn_pendentes ON public.manutencoes USING btree (criada_em DESC) WHERE (confirmada_em IS NULL);


--
-- Name: idx_mn_pendentes_reais; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mn_pendentes_reais ON public.manutencoes USING btree (criada_em) WHERE ((confirmada_em IS NULL) AND (recusada_em IS NULL));


--
-- Name: idx_mn_veiculo_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mn_veiculo_data ON public.manutencoes USING btree (veiculo_vendido_id, data_servico DESC);


--
-- Name: idx_mov_investidor_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mov_investidor_data ON public.movimentacoes_investidor USING btree (data);


--
-- Name: idx_mov_investidor_investidor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mov_investidor_investidor ON public.movimentacoes_investidor USING btree (investidor_id);


--
-- Name: idx_mov_investidor_veiculo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mov_investidor_veiculo ON public.movimentacoes_investidor USING btree (veiculo_id) WHERE (veiculo_id IS NOT NULL);


--
-- Name: idx_parceiros_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parceiros_ativo ON public.parceiros USING btree (ativo);


--
-- Name: idx_parceiros_documento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parceiros_documento ON public.parceiros USING btree (documento);


--
-- Name: idx_parceiros_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parceiros_nome ON public.parceiros USING btree (nome);


--
-- Name: idx_pr_janela; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pr_janela ON public.plano_revisoes USING btree (janela_fim) WHERE (manutencao_id IS NULL);


--
-- Name: idx_vce_veiculo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_vce_veiculo ON public.vw_ciclo_estado USING btree (veiculo_vendido_id);


--
-- Name: idx_vv_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vv_cliente ON public.veiculos_vendidos USING btree (cliente_id);


--
-- Name: idx_vv_data_venda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vv_data_venda ON public.veiculos_vendidos USING btree (data_venda);


--
-- Name: idx_vv_vendedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vv_vendedor ON public.veiculos_vendidos USING btree (vendedor_id);


--
-- Name: investidor_movimentos_por_investidor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investidor_movimentos_por_investidor ON public.investidor_movimentos USING btree (investidor_id, data DESC);


--
-- Name: investidor_veiculos_por_investidor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX investidor_veiculos_por_investidor ON public.investidor_veiculos USING btree (investidor_id);


--
-- Name: leads_ag_uid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_ag_uid_idx ON public.leads USING btree (ag_uid, created_at DESC) WHERE (ag_uid IS NOT NULL);


--
-- Name: INDEX leads_ag_uid_idx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.leads_ag_uid_idx IS 'Serve a busca do /api/capi: o lead mais recente de um ag_uid, para enriquecer o evento de navegação com em/ph. Parcial porque a coluna só passou a ser gravada em 2026-09-02.';


--
-- Name: leads_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_criado_idx ON public.leads USING btree (created_at DESC);


--
-- Name: leads_desfecho_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_desfecho_idx ON public.leads USING btree (desfecho, desfecho_em DESC);


--
-- Name: leads_eventos_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_eventos_lead_idx ON public.leads_eventos USING btree (lead_id, criado_em DESC);


--
-- Name: leads_eventos_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_eventos_tipo_idx ON public.leads_eventos USING btree (tipo, criado_em DESC);


--
-- Name: leads_interacoes_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_interacoes_lead_idx ON public.leads_interacoes USING btree (lead_id, criado_em DESC);


--
-- Name: leads_parados_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_parados_idx ON public.leads USING btree (ultimo_movimento_em) WHERE (desfecho IS NULL);


--
-- Name: leads_proximo_passo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_proximo_passo_idx ON public.leads USING btree (proximo_passo_vence_em) WHERE (desfecho IS NULL);


--
-- Name: leads_ref_curta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_ref_curta_idx ON public.leads USING btree (ref_curta) WHERE (ref_curta IS NOT NULL);


--
-- Name: leads_repasse_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_repasse_id_idx ON public.leads USING btree (repasse_id) WHERE (repasse_id IS NOT NULL);


--
-- Name: leads_responsavel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_responsavel_idx ON public.leads USING btree (responsavel);


--
-- Name: leads_situacao_criado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_situacao_criado_idx ON public.leads USING btree (situacao, created_at DESC);


--
-- Name: leads_veiculos_um_escolhido_por_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leads_veiculos_um_escolhido_por_lead ON public.leads_veiculos USING btree (lead_id) WHERE (situacao = 'escolhido'::text);


--
-- Name: leads_veiculos_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_veiculos_veiculo_idx ON public.leads_veiculos USING btree (veiculo_id, situacao);


--
-- Name: marketing_contatos_importacao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_contatos_importacao_idx ON public.marketing_contatos USING btree (importacao_id);


--
-- Name: marketing_contatos_ultimo_contato_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_contatos_ultimo_contato_idx ON public.marketing_contatos USING btree (org_id, ultimo_contato_em DESC);


--
-- Name: marketing_importacoes_recentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_importacoes_recentes_idx ON public.marketing_importacoes USING btree (org_id, criado_em DESC);


--
-- Name: marketing_interesses_contato_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_interesses_contato_idx ON public.marketing_interesses USING btree (contato_id);


--
-- Name: marketing_interesses_importacao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_interesses_importacao_idx ON public.marketing_interesses USING btree (importacao_id);


--
-- Name: marketing_interesses_origem_unica; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketing_interesses_origem_unica ON public.marketing_interesses USING btree (org_id, origem_id) WHERE (origem_id IS NOT NULL);


--
-- Name: marketing_interesses_sem_origem_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX marketing_interesses_sem_origem_unico ON public.marketing_interesses USING btree (contato_id, tipo, COALESCE(veiculo_id, (0)::bigint), COALESCE(lower(marca), ''::text), COALESCE(lower(modelo), ''::text), ocorreu_em) WHERE (origem_id IS NULL);


--
-- Name: marketing_interesses_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX marketing_interesses_veiculo_idx ON public.marketing_interesses USING btree (veiculo_id) WHERE (veiculo_id IS NOT NULL);


--
-- Name: midia_diario_dia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX midia_diario_dia_idx ON public.midia_diario USING btree (dia DESC);


--
-- Name: midia_leituras_campanha_registro_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX midia_leituras_campanha_registro_idx ON public.midia_leituras USING btree (campanha_id, registrado_em DESC);


--
-- Name: midia_sincronizacoes_plataforma_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX midia_sincronizacoes_plataforma_idx ON public.midia_sincronizacoes USING btree (plataforma, iniciada_em DESC);


--
-- Name: negocio_pagamentos_negocio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX negocio_pagamentos_negocio_idx ON public.negocio_pagamentos USING btree (negocio_id);


--
-- Name: negocios_uma_pre_venda_por_veiculo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX negocios_uma_pre_venda_por_veiculo ON public.negocios USING btree (veiculo_id) WHERE (estado = 'pre_venda'::text);


--
-- Name: negocios_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX negocios_veiculo_idx ON public.negocios USING btree (veiculo_id, estado);


--
-- Name: notificacoes_admin_processado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notificacoes_admin_processado_idx ON public.notificacoes_admin USING btree (processado_em DESC);


--
-- Name: parametros_avaliacao_um_vigente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX parametros_avaliacao_um_vigente ON public.parametros_avaliacao USING btree (org_id) WHERE (vigencia_ate IS NULL);


--
-- Name: parametros_financiamento_um_vigente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX parametros_financiamento_um_vigente ON public.parametros_financiamento USING btree (org_id) WHERE (vigencia_ate IS NULL);


--
-- Name: partidas_conta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partidas_conta_idx ON public.partidas USING btree (conta_codigo, criado_em);


--
-- Name: partidas_lancamento_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partidas_lancamento_idx ON public.partidas USING btree (lancamento_id);


--
-- Name: partidas_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partidas_veiculo_idx ON public.partidas USING btree (veiculo_id) WHERE (veiculo_id IS NOT NULL);


--
-- Name: regras_comissao_uma_vigente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX regras_comissao_uma_vigente ON public.regras_comissao USING btree (saida) WHERE (vigencia_ate IS NULL);


--
-- Name: regras_contabilizacao_uma_vigente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX regras_contabilizacao_uma_vigente ON public.regras_contabilizacao USING btree (evento, papel, modalidade, saida) NULLS NOT DISTINCT WHERE (vigencia_ate IS NULL);


--
-- Name: renave_operacoes_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX renave_operacoes_veiculo_idx ON public.renave_operacoes USING btree (veiculo_id, criado_em DESC);


--
-- Name: repasse_avisos_inscrito_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repasse_avisos_inscrito_id_idx ON public.repasse_avisos USING btree (inscrito_id);


--
-- Name: repasse_inscritos_lead_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repasse_inscritos_lead_id_idx ON public.repasse_inscritos USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: repasses_situacao_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX repasses_situacao_idx ON public.repasses USING btree (situacao);


--
-- Name: sms_campanhas_recentes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_campanhas_recentes_idx ON public.sms_campanhas USING btree (org_id, criado_em DESC);


--
-- Name: sms_envios_contato_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_envios_contato_idx ON public.sms_envios USING btree (contato_id) WHERE (contato_id IS NOT NULL);


--
-- Name: sms_envios_enviado_em_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_envios_enviado_em_idx ON public.sms_envios USING btree (enviado_em) WHERE (enviado_em IS NOT NULL);


--
-- Name: sms_envios_fila_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_envios_fila_idx ON public.sms_envios USING btree (campanha_id, situacao);


--
-- Name: sms_envios_fornecedor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_envios_fornecedor_idx ON public.sms_envios USING btree (fornecedor_id) WHERE (fornecedor_id IS NOT NULL);


--
-- Name: sms_envios_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sms_envios_lead_idx ON public.sms_envios USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: veiculo_custos_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veiculo_custos_veiculo_idx ON public.veiculo_custos USING btree (veiculo_id, competencia);


--
-- Name: veiculo_entradas_uma_ativa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX veiculo_entradas_uma_ativa ON public.veiculo_entradas USING btree (veiculo_id) WHERE ativa;


--
-- Name: veiculo_entradas_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veiculo_entradas_veiculo_idx ON public.veiculo_entradas USING btree (veiculo_id);


--
-- Name: veiculo_eventos_ordem_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veiculo_eventos_ordem_idx ON public.veiculo_eventos USING btree (veiculo_id, criado_em, seq);


--
-- Name: veiculo_eventos_tipo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veiculo_eventos_tipo_idx ON public.veiculo_eventos USING btree (tipo, criado_em);


--
-- Name: veiculo_eventos_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veiculo_eventos_veiculo_idx ON public.veiculo_eventos USING btree (veiculo_id, criado_em);


--
-- Name: veiculo_precos_veiculo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veiculo_precos_veiculo_idx ON public.veiculo_precos USING btree (veiculo_id, vigente_desde DESC);


--
-- Name: anuncios anuncios_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER anuncios_append_only BEFORE DELETE OR UPDATE ON public.anuncios FOR EACH ROW EXECUTE FUNCTION public.nucleo_bloquear_mutacao();


--
-- Name: auditoria auditoria_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditoria_append_only BEFORE DELETE OR UPDATE ON public.auditoria FOR EACH ROW EXECUTE FUNCTION public.nucleo_bloquear_mutacao();


--
-- Name: auditoria auditoria_carimbar_autor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auditoria_carimbar_autor BEFORE INSERT ON public.auditoria FOR EACH ROW EXECUTE FUNCTION public.nucleo_carimbar_autor();


--
-- Name: ciclo_parametros ciclo_parametros_seed_do_dono; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ciclo_parametros_seed_do_dono BEFORE INSERT OR UPDATE ON public.ciclo_parametros FOR EACH ROW EXECUTE FUNCTION public.ciclo_seed_validado_so_pelo_dono();


--
-- Name: ciclo_parametros ciclo_parametros_vigencia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ciclo_parametros_vigencia BEFORE UPDATE ON public.ciclo_parametros FOR EACH ROW EXECUTE FUNCTION public.nucleo_so_encerra_vigencia();


--
-- Name: clientes clientes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clientes_updated_at BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();


--
-- Name: confirmacoes_disponibilidade confirmacoes_carimbar_autor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER confirmacoes_carimbar_autor BEFORE INSERT ON public.confirmacoes_disponibilidade FOR EACH ROW EXECUTE FUNCTION public.nucleo_carimbar_autor();


--
-- Name: confirmacoes_disponibilidade confirmacoes_carimbar_instante; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER confirmacoes_carimbar_instante BEFORE INSERT ON public.confirmacoes_disponibilidade FOR EACH ROW EXECUTE FUNCTION public.confirmacoes_carimbar_instante();


--
-- Name: confirmacoes_disponibilidade confirmacoes_disponibilidade_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER confirmacoes_disponibilidade_append_only BEFORE DELETE OR UPDATE ON public.confirmacoes_disponibilidade FOR EACH ROW EXECUTE FUNCTION public.nucleo_bloquear_mutacao();


--
-- Name: consultas_de_modelo consultas_de_modelo_carimbo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consultas_de_modelo_carimbo BEFORE INSERT ON public.consultas_de_modelo FOR EACH ROW EXECUTE FUNCTION public.consultas_de_modelo_carimbar();


--
-- Name: consultas_de_placa consultas_de_placa_carimbo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consultas_de_placa_carimbo BEFORE INSERT ON public.consultas_de_placa FOR EACH ROW EXECUTE FUNCTION public.consultas_de_placa_carimbar();


--
-- Name: estoque_motors estoque_motors_conteudo_atualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estoque_motors_conteudo_atualizado BEFORE UPDATE ON public.estoque_motors FOR EACH ROW EXECUTE FUNCTION public.marcar_conteudo_atualizado();


--
-- Name: estoque_motors estoque_motors_marcar_origem; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estoque_motors_marcar_origem BEFORE INSERT ON public.estoque_motors FOR EACH ROW EXECUTE FUNCTION public.estoque_motors_marcar_origem();


--
-- Name: estoque_motors estoque_motors_trava_do_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER estoque_motors_trava_do_sync BEFORE UPDATE ON public.estoque_motors FOR EACH ROW EXECUTE FUNCTION public.estoque_motors_trava_do_sync();


--
-- Name: lancamentos lancamentos_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lancamentos_append_only BEFORE DELETE OR UPDATE ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.nucleo_bloquear_mutacao();


--
-- Name: lancamentos lancamentos_carimbar_autor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lancamentos_carimbar_autor BEFORE INSERT ON public.lancamentos FOR EACH ROW EXECUTE FUNCTION public.nucleo_carimbar_autor();


--
-- Name: lancamentos lancamentos_tem_partidas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER lancamentos_tem_partidas AFTER INSERT ON public.lancamentos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.nucleo_conferir_balanco();


--
-- Name: negocios negocios_sem_fechamento_manual; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER negocios_sem_fechamento_manual BEFORE INSERT OR UPDATE ON public.negocios FOR EACH ROW EXECUTE FUNCTION public.nucleo_bloquear_fechamento_manual();


--
-- Name: negocios negocios_validade_no_futuro; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER negocios_validade_no_futuro BEFORE INSERT OR UPDATE ON public.negocios FOR EACH ROW EXECUTE FUNCTION public.negocios_validade_no_futuro();


--
-- Name: parametros_avaliacao parametros_avaliacao_vigencia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER parametros_avaliacao_vigencia BEFORE UPDATE ON public.parametros_avaliacao FOR EACH ROW EXECUTE FUNCTION public.nucleo_so_encerra_vigencia();


--
-- Name: parametros_financiamento parametros_financiamento_vigencia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER parametros_financiamento_vigencia BEFORE UPDATE ON public.parametros_financiamento FOR EACH ROW EXECUTE FUNCTION public.nucleo_so_encerra_vigencia();


--
-- Name: partidas partidas_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER partidas_append_only BEFORE DELETE OR UPDATE ON public.partidas FOR EACH ROW EXECUTE FUNCTION public.nucleo_bloquear_mutacao();


--
-- Name: partidas partidas_balanco_zero; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER partidas_balanco_zero AFTER INSERT ON public.partidas DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.nucleo_conferir_balanco();


--
-- Name: regras_comissao regras_comissao_vigencia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER regras_comissao_vigencia BEFORE UPDATE ON public.regras_comissao FOR EACH ROW EXECUTE FUNCTION public.nucleo_so_encerra_vigencia();


--
-- Name: regras_contabilizacao regras_contabilizacao_vigencia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER regras_contabilizacao_vigencia BEFORE UPDATE ON public.regras_contabilizacao FOR EACH ROW EXECUTE FUNCTION public.nucleo_so_encerra_vigencia();


--
-- Name: repasses repasses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER repasses_updated_at BEFORE UPDATE ON public.repasses FOR EACH ROW EXECUTE FUNCTION public.tocar_updated_at();


--
-- Name: cabecalho_dos_guias trg_carimbar_cabecalho_dos_guias; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_carimbar_cabecalho_dos_guias BEFORE INSERT OR UPDATE ON public.cabecalho_dos_guias FOR EACH ROW EXECUTE FUNCTION public.carimbar_cabecalho_dos_guias();


--
-- Name: guias trg_carimbar_guia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_carimbar_guia BEFORE INSERT OR UPDATE ON public.guias FOR EACH ROW EXECUTE FUNCTION public.carimbar_guia();


--
-- Name: textos_de_hub trg_carimbar_texto_de_hub; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_carimbar_texto_de_hub BEFORE INSERT OR UPDATE ON public.textos_de_hub FOR EACH ROW EXECUTE FUNCTION public.carimbar_texto_de_hub();


--
-- Name: funil_etapas trg_funil_exige_desfecho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_funil_exige_desfecho AFTER INSERT OR DELETE OR UPDATE ON public.funil_etapas DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.funil_exige_desfecho();


--
-- Name: leads trg_leads_antes_de_atualizar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_antes_de_atualizar BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.leads_antes_de_atualizar();


--
-- Name: leads trg_leads_credito_do_resgate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_credito_do_resgate AFTER UPDATE OF responsavel ON public.leads FOR EACH ROW WHEN ((old.responsavel IS DISTINCT FROM new.responsavel)) EXECUTE FUNCTION public.leads_credito_do_resgate();


--
-- Name: leads trg_leads_rastro_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_rastro_insert AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.leads_registrar_no_rastro();


--
-- Name: leads trg_leads_rastro_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_rastro_update AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.leads_registrar_no_rastro();


--
-- Name: leads_veiculos trg_leads_veiculos_carimbar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_leads_veiculos_carimbar BEFORE INSERT OR UPDATE ON public.leads_veiculos FOR EACH ROW EXECUTE FUNCTION public.leads_veiculos_carimbar();


--
-- Name: profiles trg_sincronizar_papeis; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sincronizar_papeis BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sincronizar_papeis();


--
-- Name: veiculos_vendidos trg_vendedor_da_sessao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vendedor_da_sessao BEFORE INSERT ON public.veiculos_vendidos FOR EACH ROW EXECUTE FUNCTION public.marcar_vendedor_da_sessao();


--
-- Name: veiculo_entradas veiculo_entradas_so_encerra; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER veiculo_entradas_so_encerra BEFORE UPDATE ON public.veiculo_entradas FOR EACH ROW EXECUTE FUNCTION public.veiculo_entradas_so_encerra();


--
-- Name: veiculo_eventos veiculo_eventos_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER veiculo_eventos_append_only BEFORE DELETE OR UPDATE ON public.veiculo_eventos FOR EACH ROW EXECUTE FUNCTION public.nucleo_bloquear_mutacao();


--
-- Name: veiculo_eventos veiculo_eventos_carimbar_autor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER veiculo_eventos_carimbar_autor BEFORE INSERT ON public.veiculo_eventos FOR EACH ROW EXECUTE FUNCTION public.nucleo_carimbar_autor();


--
-- Name: veiculos veiculos_chassi_imutavel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER veiculos_chassi_imutavel BEFORE UPDATE ON public.veiculos FOR EACH ROW EXECUTE FUNCTION public.veiculos_chassi_imutavel();


--
-- Name: anuncios anuncios_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anuncios
    ADD CONSTRAINT anuncios_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: apolices_seguro apolices_seguro_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apolices_seguro
    ADD CONSTRAINT apolices_seguro_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: atendimentos atendimentos_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.atendimentos
    ADD CONSTRAINT atendimentos_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: cabecalho_dos_guias cabecalho_dos_guias_atualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cabecalho_dos_guias
    ADD CONSTRAINT cabecalho_dos_guias_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: confirmacoes_disponibilidade confirmacao_entrada_do_mesmo_veiculo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confirmacoes_disponibilidade
    ADD CONSTRAINT confirmacao_entrada_do_mesmo_veiculo FOREIGN KEY (entrada_id, veiculo_id) REFERENCES public.veiculo_entradas(id, veiculo_id);


--
-- Name: confirmacoes_disponibilidade confirmacoes_disponibilidade_entrada_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confirmacoes_disponibilidade
    ADD CONSTRAINT confirmacoes_disponibilidade_entrada_id_fkey FOREIGN KEY (entrada_id) REFERENCES public.veiculo_entradas(id);


--
-- Name: confirmacoes_disponibilidade confirmacoes_disponibilidade_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confirmacoes_disponibilidade
    ADD CONSTRAINT confirmacoes_disponibilidade_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: contratos_ciclo contratos_ciclo_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_ciclo
    ADD CONSTRAINT contratos_ciclo_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: contratos_financiamento contratos_financiamento_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contratos_financiamento
    ADD CONSTRAINT contratos_financiamento_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: erros erros_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erros
    ADD CONSTRAINT erros_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: eventos_ciclo eventos_ciclo_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eventos_ciclo
    ADD CONSTRAINT eventos_ciclo_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: guias guias_atualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guias
    ADD CONSTRAINT guias_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: indice_ciclo indice_ciclo_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.indice_ciclo
    ADD CONSTRAINT indice_ciclo_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: investidor_movimentos investidor_movimentos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidor_movimentos
    ADD CONSTRAINT investidor_movimentos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: investidor_movimentos investidor_movimentos_investidor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidor_movimentos
    ADD CONSTRAINT investidor_movimentos_investidor_id_fkey FOREIGN KEY (investidor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: investidor_veiculos investidor_veiculos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidor_veiculos
    ADD CONSTRAINT investidor_veiculos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: investidor_veiculos investidor_veiculos_investidor_cadastro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidor_veiculos
    ADD CONSTRAINT investidor_veiculos_investidor_cadastro_id_fkey FOREIGN KEY (investidor_cadastro_id) REFERENCES public.investidores(id);


--
-- Name: investidor_veiculos investidor_veiculos_investidor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidor_veiculos
    ADD CONSTRAINT investidor_veiculos_investidor_id_fkey FOREIGN KEY (investidor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: investidores investidores_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidores
    ADD CONSTRAINT investidores_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: investidores investidores_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investidores
    ADD CONSTRAINT investidores_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES public.profiles(id);


--
-- Name: lancamentos lancamentos_estorna_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_estorna_id_fkey FOREIGN KEY (estorna_id) REFERENCES public.lancamentos(id);


--
-- Name: lancamentos lancamentos_evento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lancamentos
    ADD CONSTRAINT lancamentos_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES public.veiculo_eventos(id);


--
-- Name: leads leads_desfecho_motivo_do_funil; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_desfecho_motivo_do_funil FOREIGN KEY (desfecho_motivo) REFERENCES public.funil_motivos(chave) ON UPDATE CASCADE;


--
-- Name: leads_erros leads_erros_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_erros
    ADD CONSTRAINT leads_erros_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: leads_eventos leads_eventos_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_eventos
    ADD CONSTRAINT leads_eventos_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: leads_interacoes leads_interacoes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_interacoes
    ADD CONSTRAINT leads_interacoes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: leads leads_repasse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_repasse_id_fkey FOREIGN KEY (repasse_id) REFERENCES public.repasses(id) ON DELETE SET NULL;


--
-- Name: leads leads_situacao_do_funil; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_situacao_do_funil FOREIGN KEY (situacao) REFERENCES public.funil_etapas(chave) ON UPDATE CASCADE;


--
-- Name: leads leads_veiculo_do_estoque; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_veiculo_do_estoque FOREIGN KEY (veiculo_id) REFERENCES public.estoque_motors(id) ON DELETE SET NULL;


--
-- Name: leads_veiculos leads_veiculos_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads_veiculos
    ADD CONSTRAINT leads_veiculos_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: leituras_odometro leituras_odometro_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leituras_odometro
    ADD CONSTRAINT leituras_odometro_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: manutencoes manutencoes_parceiro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manutencoes
    ADD CONSTRAINT manutencoes_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES public.parceiros_ciclo(id);


--
-- Name: manutencoes manutencoes_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manutencoes
    ADD CONSTRAINT manutencoes_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: marketing_contatos marketing_contatos_importacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_contatos
    ADD CONSTRAINT marketing_contatos_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES public.marketing_importacoes(id) ON DELETE CASCADE;


--
-- Name: marketing_interesses marketing_interesses_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_interesses
    ADD CONSTRAINT marketing_interesses_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.marketing_contatos(id) ON DELETE CASCADE;


--
-- Name: marketing_interesses marketing_interesses_importacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_interesses
    ADD CONSTRAINT marketing_interesses_importacao_id_fkey FOREIGN KEY (importacao_id) REFERENCES public.marketing_importacoes(id) ON DELETE CASCADE;


--
-- Name: midia_ajustes midia_ajustes_campanha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_ajustes
    ADD CONSTRAINT midia_ajustes_campanha_id_fkey FOREIGN KEY (campanha_id) REFERENCES public.midia_campanhas(id) ON DELETE CASCADE;


--
-- Name: midia_anuncios midia_anuncios_campanha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_anuncios
    ADD CONSTRAINT midia_anuncios_campanha_id_fkey FOREIGN KEY (campanha_id) REFERENCES public.midia_campanhas(id) ON DELETE CASCADE;


--
-- Name: midia_diario midia_diario_anuncio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_diario
    ADD CONSTRAINT midia_diario_anuncio_id_fkey FOREIGN KEY (anuncio_id) REFERENCES public.midia_anuncios(id) ON DELETE CASCADE;


--
-- Name: midia_diario midia_diario_campanha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_diario
    ADD CONSTRAINT midia_diario_campanha_id_fkey FOREIGN KEY (campanha_id) REFERENCES public.midia_campanhas(id) ON DELETE CASCADE;


--
-- Name: midia_leituras midia_leituras_anuncio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_leituras
    ADD CONSTRAINT midia_leituras_anuncio_id_fkey FOREIGN KEY (anuncio_id) REFERENCES public.midia_anuncios(id) ON DELETE CASCADE;


--
-- Name: midia_leituras midia_leituras_campanha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.midia_leituras
    ADD CONSTRAINT midia_leituras_campanha_id_fkey FOREIGN KEY (campanha_id) REFERENCES public.midia_campanhas(id) ON DELETE CASCADE;


--
-- Name: movimentacoes_investidor movimentacoes_investidor_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_investidor
    ADD CONSTRAINT movimentacoes_investidor_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: movimentacoes_investidor movimentacoes_investidor_investidor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimentacoes_investidor
    ADD CONSTRAINT movimentacoes_investidor_investidor_id_fkey FOREIGN KEY (investidor_id) REFERENCES public.investidores(id);


--
-- Name: negocio_pagamentos negocio_pagamentos_negocio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocio_pagamentos
    ADD CONSTRAINT negocio_pagamentos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES public.negocios(id);


--
-- Name: negocios negocios_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negocios
    ADD CONSTRAINT negocios_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: parceiros parceiros_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parceiros
    ADD CONSTRAINT parceiros_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: partidas partidas_conta_codigo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partidas
    ADD CONSTRAINT partidas_conta_codigo_fkey FOREIGN KEY (conta_codigo) REFERENCES public.plano_contas(codigo);


--
-- Name: partidas partidas_lancamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partidas
    ADD CONSTRAINT partidas_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos(id);


--
-- Name: partidas partidas_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partidas
    ADD CONSTRAINT partidas_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: plano_revisoes plano_revisoes_manutencao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_revisoes
    ADD CONSTRAINT plano_revisoes_manutencao_id_fkey FOREIGN KEY (manutencao_id) REFERENCES public.manutencoes(id);


--
-- Name: plano_revisoes plano_revisoes_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plano_revisoes
    ADD CONSTRAINT plano_revisoes_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: regras_contabilizacao regras_contabilizacao_conta_credito_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_contabilizacao
    ADD CONSTRAINT regras_contabilizacao_conta_credito_fkey FOREIGN KEY (conta_credito) REFERENCES public.plano_contas(codigo);


--
-- Name: regras_contabilizacao regras_contabilizacao_conta_debito_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regras_contabilizacao
    ADD CONSTRAINT regras_contabilizacao_conta_debito_fkey FOREIGN KEY (conta_debito) REFERENCES public.plano_contas(codigo);


--
-- Name: renave_operacoes renave_operacoes_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.renave_operacoes
    ADD CONSTRAINT renave_operacoes_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: repasse_avisos repasse_avisos_inscrito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repasse_avisos
    ADD CONSTRAINT repasse_avisos_inscrito_id_fkey FOREIGN KEY (inscrito_id) REFERENCES public.repasse_inscritos(id) ON DELETE CASCADE;


--
-- Name: repasse_avisos repasse_avisos_repasse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repasse_avisos
    ADD CONSTRAINT repasse_avisos_repasse_id_fkey FOREIGN KEY (repasse_id) REFERENCES public.repasses(id) ON DELETE CASCADE;


--
-- Name: repasse_inscritos repasse_inscritos_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repasse_inscritos
    ADD CONSTRAINT repasse_inscritos_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: sms_descadastros sms_descadastros_campanha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_descadastros
    ADD CONSTRAINT sms_descadastros_campanha_id_fkey FOREIGN KEY (campanha_id) REFERENCES public.sms_campanhas(id) ON DELETE SET NULL;


--
-- Name: sms_envios sms_envios_campanha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_envios
    ADD CONSTRAINT sms_envios_campanha_id_fkey FOREIGN KEY (campanha_id) REFERENCES public.sms_campanhas(id) ON DELETE CASCADE;


--
-- Name: sms_envios sms_envios_contato_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_envios
    ADD CONSTRAINT sms_envios_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.marketing_contatos(id) ON DELETE CASCADE;


--
-- Name: sms_envios sms_envios_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_envios
    ADD CONSTRAINT sms_envios_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: telemetria_resumo telemetria_resumo_veiculo_vendido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telemetria_resumo
    ADD CONSTRAINT telemetria_resumo_veiculo_vendido_id_fkey FOREIGN KEY (veiculo_vendido_id) REFERENCES public.veiculos_vendidos(id);


--
-- Name: textos_de_hub textos_de_hub_atualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.textos_de_hub
    ADD CONSTRAINT textos_de_hub_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: veiculo_custos veiculo_custos_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_custos
    ADD CONSTRAINT veiculo_custos_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: veiculo_entradas veiculo_entradas_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_entradas
    ADD CONSTRAINT veiculo_entradas_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: veiculo_entradas veiculo_entradas_venda_origem_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_entradas
    ADD CONSTRAINT veiculo_entradas_venda_origem_fk FOREIGN KEY (venda_origem_id) REFERENCES public.negocios(id);


--
-- Name: veiculo_eventos veiculo_eventos_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_eventos
    ADD CONSTRAINT veiculo_eventos_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: veiculo_precos veiculo_precos_veiculo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculo_precos
    ADD CONSTRAINT veiculo_precos_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES public.veiculos(id);


--
-- Name: veiculos_vendidos veiculos_vendidos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculos_vendidos
    ADD CONSTRAINT veiculos_vendidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);


--
-- Name: veiculos_vendidos veiculos_vendidos_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiculos_vendidos
    ADD CONSTRAINT veiculos_vendidos_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES public.profiles(id);


--
-- Name: investidores Acesso do financeiro a investidores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Acesso do financeiro a investidores" ON public.investidores USING (public.has_finance_access(auth.uid())) WITH CHECK (public.has_finance_access(auth.uid()));


--
-- Name: profiles Admins manage all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage all profiles" ON public.profiles USING (public.is_admin(auth.uid()));


--
-- Name: profiles Admins read all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: estoque_motors Allow public read access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access" ON public.estoque_motors FOR SELECT USING (true);


--
-- Name: site_settings Escrita de settings com sessao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrita de settings com sessao" ON public.site_settings FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: estoque_motors Escrita do painel autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Escrita do painel autenticado" ON public.estoque_motors FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: parceiros Finance partners access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Finance partners access" ON public.parceiros USING (public.has_finance_access(auth.uid()));


--
-- Name: movimentacoes_investidor Financeiro corrige movimentacoes_investidor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Financeiro corrige movimentacoes_investidor" ON public.movimentacoes_investidor FOR UPDATE USING (public.has_finance_access(auth.uid())) WITH CHECK (public.has_finance_access(auth.uid()));


--
-- Name: investidor_movimentos Financeiro gerencia movimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Financeiro gerencia movimentos" ON public.investidor_movimentos USING (public.has_finance_access(auth.uid())) WITH CHECK (public.has_finance_access(auth.uid()));


--
-- Name: investidor_veiculos Financeiro gerencia participacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Financeiro gerencia participacoes" ON public.investidor_veiculos USING (public.has_finance_access(auth.uid())) WITH CHECK (public.has_finance_access(auth.uid()));


--
-- Name: movimentacoes_investidor Financeiro lanca em movimentacoes_investidor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Financeiro lanca em movimentacoes_investidor" ON public.movimentacoes_investidor FOR INSERT WITH CHECK (public.has_finance_access(auth.uid()));


--
-- Name: movimentacoes_investidor Financeiro le movimentacoes_investidor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Financeiro le movimentacoes_investidor" ON public.movimentacoes_investidor FOR SELECT USING (public.has_finance_access(auth.uid()));


--
-- Name: site_settings Insercao de settings com sessao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insercao de settings com sessao" ON public.site_settings FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: estoque_motors Insercao do painel autenticado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insercao do painel autenticado" ON public.estoque_motors FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: investidores Investidor le o proprio cadastro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Investidor le o proprio cadastro" ON public.investidores FOR SELECT USING ((perfil_id = auth.uid()));


--
-- Name: movimentacoes_investidor Investidor le o proprio extrato; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Investidor le o proprio extrato" ON public.movimentacoes_investidor FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.investidores i
  WHERE ((i.id = movimentacoes_investidor.investidor_id) AND (i.perfil_id = auth.uid())))));


--
-- Name: investidor_movimentos Investidor le os proprios movimentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Investidor le os proprios movimentos" ON public.investidor_movimentos FOR SELECT USING ((investidor_id = auth.uid()));


--
-- Name: investidor_veiculos Investidor le os proprios veiculos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Investidor le os proprios veiculos" ON public.investidor_veiculos FOR SELECT USING ((investidor_id = auth.uid()));


--
-- Name: site_settings Leitura anonima do recorte publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura anonima do recorte publico" ON public.site_settings FOR SELECT TO anon USING ((id = ANY (ARRAY['company'::text, 'about'::text, 'popups'::text, 'quick_tags'::text, 'carousel_vehicles'::text, 'procedencia'::text, 'instagram_curadoria'::text, 'areas_home'::text])));


--
-- Name: site_settings Leitura completa com sessao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura completa com sessao" ON public.site_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: movimentacoes_investidor Somente admin apaga movimentacoes_investidor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Somente admin apaga movimentacoes_investidor" ON public.movimentacoes_investidor FOR DELETE USING (public.is_admin(auth.uid()));


--
-- Name: profiles Users read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: anuncios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anuncios ENABLE ROW LEVEL SECURITY;

--
-- Name: apolices_seguro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apolices_seguro ENABLE ROW LEVEL SECURITY;

--
-- Name: apolices_seguro apolices_seguro_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apolices_seguro_cliente_le ON public.apolices_seguro FOR SELECT TO authenticated USING (public.e_veiculo_do_cliente(veiculo_vendido_id));


--
-- Name: apolices_seguro apolices_seguro_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY apolices_seguro_staff ON public.apolices_seguro TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: atendimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: atendimentos atendimentos_leitura_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY atendimentos_leitura_staff ON public.atendimentos FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: auditoria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

--
-- Name: auditoria_admin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auditoria_admin ENABLE ROW LEVEL SECURITY;

--
-- Name: auditoria_admin auditoria_admin_insercao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auditoria_admin_insercao ON public.auditoria_admin FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: auditoria_admin auditoria_admin_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auditoria_admin_leitura ON public.auditoria_admin FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: repasse_avisos aviso_validador_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aviso_validador_le ON public.repasse_avisos FOR SELECT TO authenticated USING (((public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text) OR public.tem_papel(auth.uid(), 'comercial'::text)) AND (org_id = public.org_padrao())));


--
-- Name: cabecalho_dos_guias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cabecalho_dos_guias ENABLE ROW LEVEL SECURITY;

--
-- Name: cabecalho_dos_guias cabecalho_dos_guias_escrita_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cabecalho_dos_guias_escrita_staff ON public.cabecalho_dos_guias TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: cabecalho_dos_guias cabecalho_dos_guias_leitura_publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cabecalho_dos_guias_leitura_publica ON public.cabecalho_dos_guias FOR SELECT TO authenticated, anon USING (true);


--
-- Name: ciclo_parametros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ciclo_parametros ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes clientes_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clientes_cliente_le ON public.clientes FOR SELECT TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: clientes clientes_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clientes_staff ON public.clientes TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: confirmacoes_disponibilidade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.confirmacoes_disponibilidade ENABLE ROW LEVEL SECURITY;

--
-- Name: conformidade_diaria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conformidade_diaria ENABLE ROW LEVEL SECURITY;

--
-- Name: conformidade_diaria conformidade_diaria_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conformidade_diaria_staff ON public.conformidade_diaria TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: consultas_de_modelo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consultas_de_modelo ENABLE ROW LEVEL SECURITY;

--
-- Name: consultas_de_modelo consultas_de_modelo_inclusao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consultas_de_modelo_inclusao ON public.consultas_de_modelo FOR INSERT TO authenticated WITH CHECK (((org_id = public.org_padrao()) AND (criado_por = auth.uid()) AND (public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text) OR public.tem_papel(auth.uid(), 'comercial'::text))));


--
-- Name: POLICY consultas_de_modelo_inclusao ON consultas_de_modelo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY consultas_de_modelo_inclusao ON public.consultas_de_modelo IS 'Inclui a análise quem a matriz deixa consultar, e só em nome próprio (criado_por = auth.uid(); o gatilho consultas_de_modelo_carimbo já o garante, esta é a segunda tranca). Não há policy de UPDATE nem de DELETE: só inclusão.';


--
-- Name: consultas_de_modelo consultas_de_modelo_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consultas_de_modelo_leitura ON public.consultas_de_modelo FOR SELECT TO authenticated USING (((org_id = public.org_padrao()) AND (public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text) OR public.tem_papel(auth.uid(), 'comercial'::text))));


--
-- Name: POLICY consultas_de_modelo_leitura ON consultas_de_modelo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY consultas_de_modelo_leitura ON public.consultas_de_modelo IS 'Lê o histórico de análises quem a matriz deixa consultar: Administrador, Gestor e Comercial, com conta ativa.';


--
-- Name: consultas_de_placa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consultas_de_placa ENABLE ROW LEVEL SECURITY;

--
-- Name: consultas_de_placa consultas_de_placa_inclusao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consultas_de_placa_inclusao ON public.consultas_de_placa FOR INSERT TO authenticated WITH CHECK (((org_id = public.org_padrao()) AND (public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text) OR public.tem_papel(auth.uid(), 'comercial'::text))));


--
-- Name: POLICY consultas_de_placa_inclusao ON consultas_de_placa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY consultas_de_placa_inclusao ON public.consultas_de_placa IS 'Inclui a consulta quem a matriz deixa consultar. Não há policy de UPDATE nem de DELETE: só inclusão.';


--
-- Name: consultas_de_placa consultas_de_placa_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consultas_de_placa_leitura ON public.consultas_de_placa FOR SELECT TO authenticated USING (((org_id = public.org_padrao()) AND (public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text) OR public.tem_papel(auth.uid(), 'comercial'::text))));


--
-- Name: POLICY consultas_de_placa_leitura ON consultas_de_placa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY consultas_de_placa_leitura ON public.consultas_de_placa IS 'Lê a consulta quem a matriz deixa consultar: Administrador, Gestor e Comercial, com conta ativa.';


--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contratos_ciclo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contratos_ciclo ENABLE ROW LEVEL SECURITY;

--
-- Name: contratos_ciclo contratos_ciclo_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contratos_ciclo_cliente_le ON public.contratos_ciclo FOR SELECT TO authenticated USING (public.e_veiculo_do_cliente(veiculo_vendido_id));


--
-- Name: contratos_ciclo contratos_ciclo_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contratos_ciclo_staff ON public.contratos_ciclo TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: contratos_financiamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contratos_financiamento ENABLE ROW LEVEL SECURITY;

--
-- Name: contratos_financiamento contratos_financiamento_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contratos_financiamento_cliente_le ON public.contratos_financiamento FOR SELECT TO authenticated USING (public.e_veiculo_do_cliente(veiculo_vendido_id));


--
-- Name: contratos_financiamento contratos_financiamento_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contratos_financiamento_staff ON public.contratos_financiamento TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: documentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

--
-- Name: erros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.erros ENABLE ROW LEVEL SECURITY;

--
-- Name: erros erros_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY erros_staff_le ON public.erros FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: erros erros_staff_resolve; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY erros_staff_resolve ON public.erros FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: estoque_motors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estoque_motors ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos_ciclo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.eventos_ciclo ENABLE ROW LEVEL SECURITY;

--
-- Name: eventos_ciclo eventos_ciclo_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY eventos_ciclo_staff ON public.eventos_ciclo TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: fipe_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fipe_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: fipe_historico fipe_historico_inclusao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fipe_historico_inclusao ON public.fipe_historico FOR INSERT TO authenticated WITH CHECK (((org_id = public.org_padrao()) AND (public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text) OR public.tem_papel(auth.uid(), 'comercial'::text))));


--
-- Name: POLICY fipe_historico_inclusao ON fipe_historico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY fipe_historico_inclusao ON public.fipe_historico IS 'Inclui o mês lido quem consulta placa. Sem UPDATE nem DELETE: valor publicado não se corrige.';


--
-- Name: fipe_historico fipe_historico_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fipe_historico_leitura ON public.fipe_historico FOR SELECT TO authenticated USING (((org_id = public.org_padrao()) AND (public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text) OR public.tem_papel(auth.uid(), 'comercial'::text))));


--
-- Name: POLICY fipe_historico_leitura ON fipe_historico; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY fipe_historico_leitura ON public.fipe_historico IS 'Lê o histórico quem consulta placa: Administrador, Gestor e Comercial, com conta ativa.';


--
-- Name: funil_etapas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funil_etapas ENABLE ROW LEVEL SECURITY;

--
-- Name: funil_etapas funil_etapas_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY funil_etapas_escrita ON public.funil_etapas TO authenticated USING ((public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text))) WITH CHECK ((public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text)));


--
-- Name: funil_etapas funil_etapas_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY funil_etapas_leitura ON public.funil_etapas FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: funil_motivos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.funil_motivos ENABLE ROW LEVEL SECURITY;

--
-- Name: funil_motivos funil_motivos_escrita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY funil_motivos_escrita ON public.funil_motivos TO authenticated USING ((public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text))) WITH CHECK ((public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text)));


--
-- Name: funil_motivos funil_motivos_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY funil_motivos_leitura ON public.funil_motivos FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: guias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guias ENABLE ROW LEVEL SECURITY;

--
-- Name: guias guias_escrita_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guias_escrita_staff ON public.guias TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: guias guias_leitura_publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guias_leitura_publica ON public.guias FOR SELECT TO authenticated, anon USING ((estado = 'publicado'::text));


--
-- Name: historico_veiculo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historico_veiculo ENABLE ROW LEVEL SECURITY;

--
-- Name: historico_veiculo historico_veiculo_insercao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY historico_veiculo_insercao ON public.historico_veiculo FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: historico_veiculo historico_veiculo_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY historico_veiculo_leitura ON public.historico_veiculo FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: ia_classificacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ia_classificacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: indice_ciclo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.indice_ciclo ENABLE ROW LEVEL SECURITY;

--
-- Name: indice_ciclo indice_ciclo_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY indice_ciclo_cliente_le ON public.indice_ciclo FOR SELECT TO authenticated USING (public.e_veiculo_do_cliente(veiculo_vendido_id));


--
-- Name: indice_ciclo indice_ciclo_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY indice_ciclo_staff ON public.indice_ciclo TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: repasse_inscritos inscrito_validador_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inscrito_validador_le ON public.repasse_inscritos FOR SELECT TO authenticated USING (((public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'gestor'::text) OR public.tem_papel(auth.uid(), 'comercial'::text)) AND (org_id = public.org_padrao())));


--
-- Name: investidor_movimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investidor_movimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: investidor_veiculos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investidor_veiculos ENABLE ROW LEVEL SECURITY;

--
-- Name: investidores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investidores ENABLE ROW LEVEL SECURITY;

--
-- Name: lancamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_atualizacao_por_escopo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_atualizacao_por_escopo ON public.leads FOR UPDATE TO authenticated USING (COALESCE(
CASE ( SELECT public.escopo_de_leads() AS escopo_de_leads)
    WHEN 'todos'::text THEN true
    WHEN 'designados'::text THEN (btrim(COALESCE(responsavel, ''::text)) <> ''::text)
    WHEN 'meus'::text THEN (btrim(responsavel) = ( SELECT public.meu_nome_de_responsavel() AS meu_nome_de_responsavel))
    ELSE false
END, false)) WITH CHECK (COALESCE(
CASE ( SELECT public.escopo_de_leads() AS escopo_de_leads)
    WHEN 'todos'::text THEN true
    WHEN 'designados'::text THEN ((btrim(COALESCE(responsavel, ''::text)) <> ''::text) AND ((responsavel_desde IS DISTINCT FROM now()) OR public.recebe_lead_pelo_nome(responsavel)))
    WHEN 'meus'::text THEN ((btrim(responsavel) = ( SELECT public.meu_nome_de_responsavel() AS meu_nome_de_responsavel)) OR public.recebe_lead_pelo_nome(responsavel))
    ELSE false
END, false));


--
-- Name: POLICY leads_atualizacao_por_escopo ON leads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY leads_atualizacao_por_escopo ON public.leads IS 'Atualiza quem enxerga. Só o admin deixa lead sem responsável; os demais passam o lead a alguém do Comercial ativo. 20261003130000.';


--
-- Name: leads_erros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads_erros ENABLE ROW LEVEL SECURITY;

--
-- Name: leads_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: leads_eventos leads_eventos_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_eventos_staff ON public.leads_eventos FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: leads leads_exclusao_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_exclusao_admin ON public.leads FOR DELETE TO authenticated USING ((( SELECT public.escopo_de_leads() AS escopo_de_leads) = 'todos'::text));


--
-- Name: POLICY leads_exclusao_admin ON leads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY leads_exclusao_admin ON public.leads IS 'Eliminação a pedido do titular (LGPD art. 18, VI): só o admin.';


--
-- Name: leads_interacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads_interacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: leads_interacoes leads_interacoes_leitura_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_interacoes_leitura_staff ON public.leads_interacoes FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: leads leads_leitura_por_escopo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_leitura_por_escopo ON public.leads FOR SELECT TO authenticated USING (COALESCE(
CASE ( SELECT public.escopo_de_leads() AS escopo_de_leads)
    WHEN 'todos'::text THEN true
    WHEN 'designados'::text THEN (btrim(COALESCE(responsavel, ''::text)) <> ''::text)
    WHEN 'meus'::text THEN ((btrim(responsavel) = ( SELECT public.meu_nome_de_responsavel() AS meu_nome_de_responsavel)) OR ((responsavel_desde = now()) AND (btrim(responsavel_anterior) = ( SELECT public.meu_nome_de_responsavel() AS meu_nome_de_responsavel)) AND (btrim(COALESCE(responsavel, ''::text)) <> ''::text)))
    ELSE false
END, false));


--
-- Name: POLICY leads_leitura_por_escopo ON leads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY leads_leitura_por_escopo ON public.leads IS 'Admin lê todos; gestor e sdr, os que têm responsável; comercial, os dele (e o que acabou de passar, só na transação da passagem). 20261003130000.';


--
-- Name: leads_sdr; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads_sdr ENABLE ROW LEVEL SECURITY;

--
-- Name: leads_veiculos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads_veiculos ENABLE ROW LEVEL SECURITY;

--
-- Name: leads_veiculos leads_veiculos_atualizacao_pelo_lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_veiculos_atualizacao_pelo_lead ON public.leads_veiculos FOR UPDATE TO authenticated USING (((org_id = public.org_padrao()) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE (l.id = leads_veiculos.lead_id))))) WITH CHECK (((org_id = public.org_padrao()) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE (l.id = leads_veiculos.lead_id)))));


--
-- Name: POLICY leads_veiculos_atualizacao_pelo_lead ON leads_veiculos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY leads_veiculos_atualizacao_pelo_lead ON public.leads_veiculos IS 'Resolve a opção (escolhe, descarta, reabre, anota) quem enxerga o lead.';


--
-- Name: leads_veiculos leads_veiculos_exclusao_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_veiculos_exclusao_admin ON public.leads_veiculos FOR DELETE TO authenticated USING ((public.is_admin(auth.uid()) AND (org_id = public.org_padrao()) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE (l.id = leads_veiculos.lead_id)))));


--
-- Name: POLICY leads_veiculos_exclusao_admin ON leads_veiculos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY leads_veiculos_exclusao_admin ON public.leads_veiculos IS 'Apagar a opção é só do admin: descartar é o gesto de todo dia, e deixa motivo.';


--
-- Name: leads_veiculos leads_veiculos_inclusao_pelo_lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_veiculos_inclusao_pelo_lead ON public.leads_veiculos FOR INSERT TO authenticated WITH CHECK (((org_id = public.org_padrao()) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE (l.id = leads_veiculos.lead_id)))));


--
-- Name: POLICY leads_veiculos_inclusao_pelo_lead ON leads_veiculos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY leads_veiculos_inclusao_pelo_lead ON public.leads_veiculos IS 'Adiciona carro ao lead quem enxerga o lead.';


--
-- Name: leads_veiculos leads_veiculos_leitura_pelo_lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_veiculos_leitura_pelo_lead ON public.leads_veiculos FOR SELECT TO authenticated USING (((org_id = public.org_padrao()) AND (EXISTS ( SELECT 1
   FROM public.leads l
  WHERE (l.id = leads_veiculos.lead_id)))));


--
-- Name: POLICY leads_veiculos_leitura_pelo_lead ON leads_veiculos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY leads_veiculos_leitura_pelo_lead ON public.leads_veiculos IS 'Lê a opção quem lê o lead dela: a RLS de leads decide (is_staff até a 20261003130000; o escopo depois).';


--
-- Name: leituras_odometro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leituras_odometro ENABLE ROW LEVEL SECURITY;

--
-- Name: leituras_odometro leituras_odometro_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leituras_odometro_cliente_le ON public.leituras_odometro FOR SELECT TO authenticated USING (public.e_veiculo_do_cliente(veiculo_vendido_id));


--
-- Name: leituras_odometro leituras_odometro_cliente_registra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leituras_odometro_cliente_registra ON public.leituras_odometro FOR INSERT TO authenticated WITH CHECK ((public.e_veiculo_do_cliente(veiculo_vendido_id) AND (origem = 'cliente'::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.veiculos_vendidos vv
  WHERE ((vv.id = leituras_odometro.veiculo_vendido_id) AND (vv.saiu_em IS NOT NULL)))))));


--
-- Name: leituras_odometro leituras_odometro_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leituras_odometro_staff ON public.leituras_odometro TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: manutencoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manutencoes ENABLE ROW LEVEL SECURITY;

--
-- Name: manutencoes manutencoes_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY manutencoes_cliente_le ON public.manutencoes FOR SELECT TO authenticated USING (public.e_veiculo_do_cliente(veiculo_vendido_id));


--
-- Name: manutencoes manutencoes_cliente_registra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY manutencoes_cliente_registra ON public.manutencoes FOR INSERT TO authenticated WITH CHECK ((public.e_veiculo_do_cliente(veiculo_vendido_id) AND (origem_registro = 'cliente'::text) AND (confirmada_em IS NULL) AND (confirmada_por IS NULL) AND (dentro_da_janela IS NULL) AND (NOT (EXISTS ( SELECT 1
   FROM public.veiculos_vendidos vv
  WHERE ((vv.id = manutencoes.veiculo_vendido_id) AND (vv.saiu_em IS NOT NULL)))))));


--
-- Name: manutencoes manutencoes_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY manutencoes_staff ON public.manutencoes TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: marketing_contatos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_contatos ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_importacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_importacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_interesses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_interesses ENABLE ROW LEVEL SECURITY;

--
-- Name: midia_ajustes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.midia_ajustes ENABLE ROW LEVEL SECURITY;

--
-- Name: midia_ajustes midia_ajustes_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY midia_ajustes_autenticados ON public.midia_ajustes TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: midia_anuncios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.midia_anuncios ENABLE ROW LEVEL SECURITY;

--
-- Name: midia_anuncios midia_anuncios_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY midia_anuncios_autenticados ON public.midia_anuncios TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: midia_campanhas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.midia_campanhas ENABLE ROW LEVEL SECURITY;

--
-- Name: midia_campanhas midia_campanhas_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY midia_campanhas_autenticados ON public.midia_campanhas TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: midia_diario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.midia_diario ENABLE ROW LEVEL SECURITY;

--
-- Name: midia_diario midia_diario_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY midia_diario_leitura ON public.midia_diario FOR SELECT TO authenticated USING (true);


--
-- Name: midia_leituras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.midia_leituras ENABLE ROW LEVEL SECURITY;

--
-- Name: midia_leituras midia_leituras_autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY midia_leituras_autenticados ON public.midia_leituras TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: midia_sincronizacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.midia_sincronizacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: midia_sincronizacoes midia_sincronizacoes_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY midia_sincronizacoes_leitura ON public.midia_sincronizacoes FOR SELECT TO authenticated USING (true);


--
-- Name: movimentacoes_investidor; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.movimentacoes_investidor ENABLE ROW LEVEL SECURITY;

--
-- Name: negocio_pagamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.negocio_pagamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: negocios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.negocios ENABLE ROW LEVEL SECURITY;

--
-- Name: notificacoes_admin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notificacoes_admin ENABLE ROW LEVEL SECURITY;

--
-- Name: notificacoes_admin notificacoes_admin_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notificacoes_admin_leitura ON public.notificacoes_admin FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));


--
-- Name: ciclo_parametros nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.ciclo_parametros FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: documentos nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.documentos FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: negocio_pagamentos nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.negocio_pagamentos FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: negocios nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.negocios FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: parametros_avaliacao nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.parametros_avaliacao FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: regras_comissao nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.regras_comissao FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: regras_contabilizacao nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.regras_contabilizacao FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: renave_operacoes nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.renave_operacoes FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_custos nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.veiculo_custos FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_entradas nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.veiculo_entradas FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculos nucleo_staff_atualiza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_atualiza ON public.veiculos FOR UPDATE TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao()))) WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: anuncios nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.anuncios FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: auditoria nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.auditoria FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: ciclo_parametros nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.ciclo_parametros FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: confirmacoes_disponibilidade nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.confirmacoes_disponibilidade FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: documentos nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.documentos FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: lancamentos nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.lancamentos FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: negocio_pagamentos nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.negocio_pagamentos FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: negocios nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.negocios FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: parametros_avaliacao nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.parametros_avaliacao FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: partidas nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.partidas FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: plano_contas nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.plano_contas FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: regras_comissao nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.regras_comissao FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: regras_contabilizacao nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.regras_contabilizacao FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: renave_operacoes nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.renave_operacoes FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_custos nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.veiculo_custos FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_entradas nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.veiculo_entradas FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_eventos nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.veiculo_eventos FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_precos nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.veiculo_precos FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculos nucleo_staff_insere; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_insere ON public.veiculos FOR INSERT TO authenticated WITH CHECK ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: anuncios nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.anuncios FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: auditoria nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.auditoria FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: ciclo_parametros nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.ciclo_parametros FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: confirmacoes_disponibilidade nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.confirmacoes_disponibilidade FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: documentos nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.documentos FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: lancamentos nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.lancamentos FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: negocio_pagamentos nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.negocio_pagamentos FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: negocios nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.negocios FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: parametros_avaliacao nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.parametros_avaliacao FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: parametros_financiamento nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.parametros_financiamento FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: partidas nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.partidas FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: plano_contas nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.plano_contas FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: regras_comissao nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.regras_comissao FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: regras_contabilizacao nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.regras_contabilizacao FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: renave_operacoes nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.renave_operacoes FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_custos nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.veiculo_custos FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_entradas nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.veiculo_entradas FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_eventos nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.veiculo_eventos FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculo_precos nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.veiculo_precos FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: veiculos nucleo_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nucleo_staff_le ON public.veiculos FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: orgs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros_avaliacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros_avaliacao ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros_financiamento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros_financiamento ENABLE ROW LEVEL SECURITY;

--
-- Name: parceiros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;

--
-- Name: parceiros_ciclo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parceiros_ciclo ENABLE ROW LEVEL SECURITY;

--
-- Name: parceiros_ciclo parceiros_ciclo_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parceiros_ciclo_cliente_le ON public.parceiros_ciclo FOR SELECT TO authenticated USING (((ativo = true) AND (public.cliente_atual() IS NOT NULL)));


--
-- Name: parceiros_ciclo parceiros_ciclo_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parceiros_ciclo_staff ON public.parceiros_ciclo TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: partidas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partidas ENABLE ROW LEVEL SECURITY;

--
-- Name: plano_contas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;

--
-- Name: plano_revisoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plano_revisoes ENABLE ROW LEVEL SECURITY;

--
-- Name: plano_revisoes plano_revisoes_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plano_revisoes_cliente_le ON public.plano_revisoes FOR SELECT TO authenticated USING (public.e_veiculo_do_cliente(veiculo_vendido_id));


--
-- Name: plano_revisoes plano_revisoes_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plano_revisoes_staff ON public.plano_revisoes TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: regras_comissao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regras_comissao ENABLE ROW LEVEL SECURITY;

--
-- Name: regras_contabilizacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regras_contabilizacao ENABLE ROW LEVEL SECURITY;

--
-- Name: renave_operacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.renave_operacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: repasses repasse_anon_le_publicados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY repasse_anon_le_publicados ON public.repasses FOR SELECT TO anon USING ((situacao = ANY (ARRAY['publicado'::public.situacao_do_repasse, 'reservado'::public.situacao_do_repasse, 'vendido'::public.situacao_do_repasse])));


--
-- Name: repasse_avisos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repasse_avisos ENABLE ROW LEVEL SECURITY;

--
-- Name: repasse_inscritos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repasse_inscritos ENABLE ROW LEVEL SECURITY;

--
-- Name: repasses repasse_staff_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY repasse_staff_le ON public.repasses FOR SELECT TO authenticated USING ((public.is_staff(auth.uid()) AND (org_id = public.org_padrao())));


--
-- Name: repasses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.repasses ENABLE ROW LEVEL SECURITY;

--
-- Name: sdr_qualificacao; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sdr_qualificacao ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_campanhas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_campanhas ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_campanhas sms_campanhas_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_campanhas_leitura ON public.sms_campanhas FOR SELECT TO authenticated USING (((org_id = public.org_padrao()) AND (public.tem_papel(auth.uid(), 'admin'::text) OR public.tem_papel(auth.uid(), 'marketing'::text))));


--
-- Name: POLICY sms_campanhas_leitura ON sms_campanhas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY sms_campanhas_leitura ON public.sms_campanhas IS 'Lê a campanha quem a matriz deixa criar e enviar: Administrador e Marketing, com conta ativa. Não há policy de INSERT, UPDATE nem DELETE: o painel não escreve.';


--
-- Name: sms_descadastros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_descadastros ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_envios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_envios ENABLE ROW LEVEL SECURITY;

--
-- Name: telemetria_resumo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telemetria_resumo ENABLE ROW LEVEL SECURITY;

--
-- Name: telemetria_resumo telemetria_resumo_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telemetria_resumo_cliente_le ON public.telemetria_resumo FOR SELECT TO authenticated USING (public.e_veiculo_do_cliente(veiculo_vendido_id));


--
-- Name: telemetria_resumo telemetria_resumo_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telemetria_resumo_staff ON public.telemetria_resumo TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: textos_de_hub; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.textos_de_hub ENABLE ROW LEVEL SECURITY;

--
-- Name: textos_de_hub textos_de_hub_escrita_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY textos_de_hub_escrita_staff ON public.textos_de_hub TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: textos_de_hub textos_de_hub_leitura_publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY textos_de_hub_leitura_publica ON public.textos_de_hub FOR SELECT TO authenticated, anon USING (true);


--
-- Name: tracking_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculo_custos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veiculo_custos ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculo_entradas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veiculo_entradas ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculo_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veiculo_eventos ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculo_precos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veiculo_precos ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculos_vendidos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veiculos_vendidos ENABLE ROW LEVEL SECURITY;

--
-- Name: veiculos_vendidos veiculos_vendidos_cliente_le; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY veiculos_vendidos_cliente_le ON public.veiculos_vendidos FOR SELECT TO authenticated USING ((cliente_id = public.cliente_atual()));


--
-- Name: veiculos_vendidos veiculos_vendidos_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY veiculos_vendidos_staff ON public.veiculos_vendidos TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION abrir_proxima_janela(p_vv uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.abrir_proxima_janela(p_vv uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.abrir_proxima_janela(p_vv uuid) TO authenticated;
GRANT ALL ON FUNCTION public.abrir_proxima_janela(p_vv uuid) TO service_role;


--
-- Name: FUNCTION atualizar_consentimento_canais(p_whatsapp boolean, p_email boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.atualizar_consentimento_canais(p_whatsapp boolean, p_email boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.atualizar_consentimento_canais(p_whatsapp boolean, p_email boolean) TO authenticated;
GRANT ALL ON FUNCTION public.atualizar_consentimento_canais(p_whatsapp boolean, p_email boolean) TO service_role;


--
-- Name: FUNCTION autor_atual(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.autor_atual() TO anon;
GRANT ALL ON FUNCTION public.autor_atual() TO authenticated;
GRANT ALL ON FUNCTION public.autor_atual() TO service_role;


--
-- Name: FUNCTION cadastrar_veiculo_nativo(dados jsonb, modalidade_entrada public.modalidade_tipo, autor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cadastrar_veiculo_nativo(dados jsonb, modalidade_entrada public.modalidade_tipo, autor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cadastrar_veiculo_nativo(dados jsonb, modalidade_entrada public.modalidade_tipo, autor uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cadastrar_veiculo_nativo(dados jsonb, modalidade_entrada public.modalidade_tipo, autor uuid) TO service_role;


--
-- Name: FUNCTION calcula_situacao(tipos public.evento_tipo[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calcula_situacao(tipos public.evento_tipo[]) TO anon;
GRANT ALL ON FUNCTION public.calcula_situacao(tipos public.evento_tipo[]) TO authenticated;
GRANT ALL ON FUNCTION public.calcula_situacao(tipos public.evento_tipo[]) TO service_role;


--
-- Name: FUNCTION calcular_conformidade_diaria(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.calcular_conformidade_diaria() FROM PUBLIC;
GRANT ALL ON FUNCTION public.calcular_conformidade_diaria() TO authenticated;
GRANT ALL ON FUNCTION public.calcular_conformidade_diaria() TO service_role;


--
-- Name: FUNCTION carimbar_cabecalho_dos_guias(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.carimbar_cabecalho_dos_guias() TO anon;
GRANT ALL ON FUNCTION public.carimbar_cabecalho_dos_guias() TO authenticated;
GRANT ALL ON FUNCTION public.carimbar_cabecalho_dos_guias() TO service_role;


--
-- Name: FUNCTION carimbar_guia(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.carimbar_guia() TO anon;
GRANT ALL ON FUNCTION public.carimbar_guia() TO authenticated;
GRANT ALL ON FUNCTION public.carimbar_guia() TO service_role;


--
-- Name: FUNCTION carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text) TO service_role;


--
-- Name: FUNCTION carimbar_texto_de_hub(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.carimbar_texto_de_hub() TO anon;
GRANT ALL ON FUNCTION public.carimbar_texto_de_hub() TO authenticated;
GRANT ALL ON FUNCTION public.carimbar_texto_de_hub() TO service_role;


--
-- Name: FUNCTION ciclo_seed_validado_so_pelo_dono(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ciclo_seed_validado_so_pelo_dono() TO anon;
GRANT ALL ON FUNCTION public.ciclo_seed_validado_so_pelo_dono() TO authenticated;
GRANT ALL ON FUNCTION public.ciclo_seed_validado_so_pelo_dono() TO service_role;


--
-- Name: FUNCTION cliente_atual(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cliente_atual() TO anon;
GRANT ALL ON FUNCTION public.cliente_atual() TO authenticated;
GRANT ALL ON FUNCTION public.cliente_atual() TO service_role;


--
-- Name: FUNCTION completude_por_vendedor(p_desde date, p_ate date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.completude_por_vendedor(p_desde date, p_ate date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.completude_por_vendedor(p_desde date, p_ate date) TO authenticated;
GRANT ALL ON FUNCTION public.completude_por_vendedor(p_desde date, p_ate date) TO service_role;


--
-- Name: FUNCTION confirmacoes_carimbar_instante(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.confirmacoes_carimbar_instante() TO anon;
GRANT ALL ON FUNCTION public.confirmacoes_carimbar_instante() TO authenticated;
GRANT ALL ON FUNCTION public.confirmacoes_carimbar_instante() TO service_role;


--
-- Name: FUNCTION consultas_de_modelo_carimbar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consultas_de_modelo_carimbar() FROM PUBLIC;
GRANT ALL ON FUNCTION public.consultas_de_modelo_carimbar() TO service_role;


--
-- Name: FUNCTION consultas_de_placa_carimbar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consultas_de_placa_carimbar() FROM PUBLIC;
GRANT ALL ON FUNCTION public.consultas_de_placa_carimbar() TO service_role;


--
-- Name: FUNCTION desfecho_pode_gravar(p_atual text, p_novo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.desfecho_pode_gravar(p_atual text, p_novo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.desfecho_pode_gravar(p_atual text, p_novo text) TO service_role;


--
-- Name: FUNCTION e_veiculo_do_cliente(vv_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.e_veiculo_do_cliente(vv_id uuid) TO anon;
GRANT ALL ON FUNCTION public.e_veiculo_do_cliente(vv_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.e_veiculo_do_cliente(vv_id uuid) TO service_role;


--
-- Name: FUNCTION escopo_de_leads(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.escopo_de_leads() FROM PUBLIC;
GRANT ALL ON FUNCTION public.escopo_de_leads() TO authenticated;
GRANT ALL ON FUNCTION public.escopo_de_leads() TO service_role;


--
-- Name: FUNCTION estoque_motors_marcar_origem(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.estoque_motors_marcar_origem() TO anon;
GRANT ALL ON FUNCTION public.estoque_motors_marcar_origem() TO authenticated;
GRANT ALL ON FUNCTION public.estoque_motors_marcar_origem() TO service_role;


--
-- Name: FUNCTION estoque_motors_trava_do_sync(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.estoque_motors_trava_do_sync() TO anon;
GRANT ALL ON FUNCTION public.estoque_motors_trava_do_sync() TO authenticated;
GRANT ALL ON FUNCTION public.estoque_motors_trava_do_sync() TO service_role;


--
-- Name: FUNCTION fechar_venda_ciclo(dados jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fechar_venda_ciclo(dados jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fechar_venda_ciclo(dados jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fechar_venda_ciclo(dados jsonb) TO service_role;


--
-- Name: FUNCTION financiamento_bancos_validos(p text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.financiamento_bancos_validos(p text[]) TO anon;
GRANT ALL ON FUNCTION public.financiamento_bancos_validos(p text[]) TO authenticated;
GRANT ALL ON FUNCTION public.financiamento_bancos_validos(p text[]) TO service_role;


--
-- Name: FUNCTION org_padrao(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.org_padrao() FROM PUBLIC;
GRANT ALL ON FUNCTION public.org_padrao() TO authenticated;
GRANT ALL ON FUNCTION public.org_padrao() TO service_role;


--
-- Name: TABLE parametros_financiamento; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.parametros_financiamento TO authenticated;
GRANT ALL ON TABLE public.parametros_financiamento TO service_role;


--
-- Name: FUNCTION financiamento_nova_vigencia(p_taxa_excelente_am numeric, p_taxa_regular_am numeric, p_taxa_risco_am numeric, p_ano_de_referencia integer, p_ano_mais_antigo integer, p_bancos_parceiros text[], p_fonte_das_taxas text, p_descricao text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.financiamento_nova_vigencia(p_taxa_excelente_am numeric, p_taxa_regular_am numeric, p_taxa_risco_am numeric, p_ano_de_referencia integer, p_ano_mais_antigo integer, p_bancos_parceiros text[], p_fonte_das_taxas text, p_descricao text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.financiamento_nova_vigencia(p_taxa_excelente_am numeric, p_taxa_regular_am numeric, p_taxa_risco_am numeric, p_ano_de_referencia integer, p_ano_mais_antigo integer, p_bancos_parceiros text[], p_fonte_das_taxas text, p_descricao text) TO authenticated;
GRANT ALL ON FUNCTION public.financiamento_nova_vigencia(p_taxa_excelente_am numeric, p_taxa_regular_am numeric, p_taxa_risco_am numeric, p_ano_de_referencia integer, p_ano_mais_antigo integer, p_bancos_parceiros text[], p_fonte_das_taxas text, p_descricao text) TO service_role;


--
-- Name: FUNCTION funil_exige_desfecho(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.funil_exige_desfecho() TO anon;
GRANT ALL ON FUNCTION public.funil_exige_desfecho() TO authenticated;
GRANT ALL ON FUNCTION public.funil_exige_desfecho() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_finance_access(user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_finance_access(user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.has_finance_access(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.has_finance_access(user_id uuid) TO service_role;


--
-- Name: FUNCTION interesse_por_veiculo(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.interesse_por_veiculo() FROM PUBLIC;
GRANT ALL ON FUNCTION public.interesse_por_veiculo() TO authenticated;
GRANT ALL ON FUNCTION public.interesse_por_veiculo() TO service_role;


--
-- Name: FUNCTION is_admin(user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin(user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(user_id uuid) TO service_role;


--
-- Name: FUNCTION is_staff(user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_staff(user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_staff(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_staff(user_id uuid) TO service_role;


--
-- Name: FUNCTION km_estimado(p_vv uuid, p_data date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.km_estimado(p_vv uuid, p_data date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.km_estimado(p_vv uuid, p_data date) TO authenticated;
GRANT ALL ON FUNCTION public.km_estimado(p_vv uuid, p_data date) TO service_role;


--
-- Name: FUNCTION leads_antes_de_atualizar(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leads_antes_de_atualizar() TO anon;
GRANT ALL ON FUNCTION public.leads_antes_de_atualizar() TO authenticated;
GRANT ALL ON FUNCTION public.leads_antes_de_atualizar() TO service_role;


--
-- Name: FUNCTION leads_credito_do_resgate(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leads_credito_do_resgate() TO anon;
GRANT ALL ON FUNCTION public.leads_credito_do_resgate() TO authenticated;
GRANT ALL ON FUNCTION public.leads_credito_do_resgate() TO service_role;


--
-- Name: FUNCTION leads_registrar_no_rastro(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leads_registrar_no_rastro() TO anon;
GRANT ALL ON FUNCTION public.leads_registrar_no_rastro() TO authenticated;
GRANT ALL ON FUNCTION public.leads_registrar_no_rastro() TO service_role;


--
-- Name: FUNCTION leads_veiculos_carimbar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.leads_veiculos_carimbar() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leads_veiculos_carimbar() TO service_role;


--
-- Name: FUNCTION limpar_erros_antigos(dias integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.limpar_erros_antigos(dias integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.limpar_erros_antigos(dias integer) TO service_role;


--
-- Name: FUNCTION marcar_conteudo_atualizado(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.marcar_conteudo_atualizado() TO anon;
GRANT ALL ON FUNCTION public.marcar_conteudo_atualizado() TO authenticated;
GRANT ALL ON FUNCTION public.marcar_conteudo_atualizado() TO service_role;


--
-- Name: FUNCTION marcar_vendedor_da_sessao(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.marcar_vendedor_da_sessao() TO anon;
GRANT ALL ON FUNCTION public.marcar_vendedor_da_sessao() TO authenticated;
GRANT ALL ON FUNCTION public.marcar_vendedor_da_sessao() TO service_role;


--
-- Name: FUNCTION marketing_desfazer_importacao(p_importacao uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.marketing_desfazer_importacao(p_importacao uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketing_desfazer_importacao(p_importacao uuid) TO service_role;


--
-- Name: FUNCTION marketing_importar_lote(p_importacao uuid, p_contatos jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.marketing_importar_lote(p_importacao uuid, p_contatos jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketing_importar_lote(p_importacao uuid, p_contatos jsonb) TO service_role;


--
-- Name: FUNCTION marketing_resumo_da_base(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.marketing_resumo_da_base() FROM PUBLIC;
GRANT ALL ON FUNCTION public.marketing_resumo_da_base() TO service_role;


--
-- Name: FUNCTION meu_nome_de_responsavel(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meu_nome_de_responsavel() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meu_nome_de_responsavel() TO authenticated;
GRANT ALL ON FUNCTION public.meu_nome_de_responsavel() TO service_role;


--
-- Name: FUNCTION midia_confere_segredo(p_nome text, p_valor text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.midia_confere_segredo(p_nome text, p_valor text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.midia_confere_segredo(p_nome text, p_valor text) TO service_role;


--
-- Name: FUNCTION midia_gravar_lote(p jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.midia_gravar_lote(p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.midia_gravar_lote(p jsonb) TO service_role;


--
-- Name: FUNCTION montar_fila_de_gatilhos(p_agora timestamp with time zone, p_reservar boolean, p_gatilhos text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.montar_fila_de_gatilhos(p_agora timestamp with time zone, p_reservar boolean, p_gatilhos text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.montar_fila_de_gatilhos(p_agora timestamp with time zone, p_reservar boolean, p_gatilhos text[]) TO service_role;


--
-- Name: FUNCTION montar_fila_do_funil(p_agora timestamp with time zone, p_reservar boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.montar_fila_do_funil(p_agora timestamp with time zone, p_reservar boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.montar_fila_do_funil(p_agora timestamp with time zone, p_reservar boolean) TO service_role;


--
-- Name: FUNCTION negocios_validade_no_futuro(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.negocios_validade_no_futuro() TO anon;
GRANT ALL ON FUNCTION public.negocios_validade_no_futuro() TO authenticated;
GRANT ALL ON FUNCTION public.negocios_validade_no_futuro() TO service_role;


--
-- Name: FUNCTION nucleo_bloquear_fechamento_manual(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.nucleo_bloquear_fechamento_manual() TO anon;
GRANT ALL ON FUNCTION public.nucleo_bloquear_fechamento_manual() TO authenticated;
GRANT ALL ON FUNCTION public.nucleo_bloquear_fechamento_manual() TO service_role;


--
-- Name: FUNCTION nucleo_bloquear_mutacao(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.nucleo_bloquear_mutacao() TO anon;
GRANT ALL ON FUNCTION public.nucleo_bloquear_mutacao() TO authenticated;
GRANT ALL ON FUNCTION public.nucleo_bloquear_mutacao() TO service_role;


--
-- Name: FUNCTION nucleo_carimbar_autor(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.nucleo_carimbar_autor() TO anon;
GRANT ALL ON FUNCTION public.nucleo_carimbar_autor() TO authenticated;
GRANT ALL ON FUNCTION public.nucleo_carimbar_autor() TO service_role;


--
-- Name: FUNCTION nucleo_chamada_de_api(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.nucleo_chamada_de_api() TO anon;
GRANT ALL ON FUNCTION public.nucleo_chamada_de_api() TO authenticated;
GRANT ALL ON FUNCTION public.nucleo_chamada_de_api() TO service_role;


--
-- Name: FUNCTION nucleo_conferir_balanco(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.nucleo_conferir_balanco() TO anon;
GRANT ALL ON FUNCTION public.nucleo_conferir_balanco() TO authenticated;
GRANT ALL ON FUNCTION public.nucleo_conferir_balanco() TO service_role;


--
-- Name: FUNCTION nucleo_so_encerra_vigencia(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.nucleo_so_encerra_vigencia() TO anon;
GRANT ALL ON FUNCTION public.nucleo_so_encerra_vigencia() TO authenticated;
GRANT ALL ON FUNCTION public.nucleo_so_encerra_vigencia() TO service_role;


--
-- Name: FUNCTION papeis_validos(p text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.papeis_validos(p text[]) TO anon;
GRANT ALL ON FUNCTION public.papeis_validos(p text[]) TO authenticated;
GRANT ALL ON FUNCTION public.papeis_validos(p text[]) TO service_role;


--
-- Name: FUNCTION pessoas_dos_leads(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pessoas_dos_leads() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pessoas_dos_leads() TO authenticated;
GRANT ALL ON FUNCTION public.pessoas_dos_leads() TO service_role;


--
-- Name: FUNCTION recebe_lead_pelo_nome(p_nome text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recebe_lead_pelo_nome(p_nome text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recebe_lead_pelo_nome(p_nome text) TO authenticated;
GRANT ALL ON FUNCTION public.recebe_lead_pelo_nome(p_nome text) TO service_role;


--
-- Name: FUNCTION reconciliar_disponibilidade_do_feed(p_ids bigint[], p_gravar boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reconciliar_disponibilidade_do_feed(p_ids bigint[], p_gravar boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reconciliar_disponibilidade_do_feed(p_ids bigint[], p_gravar boolean) TO service_role;


--
-- Name: FUNCTION registrar_contato_do_lead(p_lead uuid, p_canal text, p_autor text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_contato_do_lead(p_lead uuid, p_canal text, p_autor text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_contato_do_lead(p_lead uuid, p_canal text, p_autor text) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_contato_do_lead(p_lead uuid, p_canal text, p_autor text) TO service_role;


--
-- Name: FUNCTION registrar_desfecho_ciclo(p_evento uuid, p_desfecho text, p_valor numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_desfecho_ciclo(p_evento uuid, p_desfecho text, p_valor numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_desfecho_ciclo(p_evento uuid, p_desfecho text, p_valor numeric) TO service_role;


--
-- Name: FUNCTION registrar_etiquetas_do_lead(p_lead uuid, p_antes text[], p_depois text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_etiquetas_do_lead(p_lead uuid, p_antes text[], p_depois text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_etiquetas_do_lead(p_lead uuid, p_antes text[], p_depois text[]) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_etiquetas_do_lead(p_lead uuid, p_antes text[], p_depois text[]) TO service_role;


--
-- Name: FUNCTION registrar_interacao_do_lead(p_lead uuid, p_tipo text, p_resultado text, p_texto text, p_passo text, p_vence_em timestamp with time zone, p_passo_concluido timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_interacao_do_lead(p_lead uuid, p_tipo text, p_resultado text, p_texto text, p_passo text, p_vence_em timestamp with time zone, p_passo_concluido timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_interacao_do_lead(p_lead uuid, p_tipo text, p_resultado text, p_texto text, p_passo text, p_vence_em timestamp with time zone, p_passo_concluido timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_interacao_do_lead(p_lead uuid, p_tipo text, p_resultado text, p_texto text, p_passo text, p_vence_em timestamp with time zone, p_passo_concluido timestamp with time zone) TO service_role;


--
-- Name: FUNCTION reivindicar_garagem(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reivindicar_garagem() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reivindicar_garagem() TO authenticated;
GRANT ALL ON FUNCTION public.reivindicar_garagem() TO service_role;


--
-- Name: FUNCTION reivindicar_investidor(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reivindicar_investidor() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reivindicar_investidor() TO authenticated;
GRANT ALL ON FUNCTION public.reivindicar_investidor() TO service_role;


--
-- Name: FUNCTION resumo_de_interesse_do_veiculo(p_veiculo bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resumo_de_interesse_do_veiculo(p_veiculo bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resumo_de_interesse_do_veiculo(p_veiculo bigint) TO authenticated;
GRANT ALL ON FUNCTION public.resumo_de_interesse_do_veiculo(p_veiculo bigint) TO service_role;


--
-- Name: FUNCTION rodar_abertura_de_janelas(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rodar_abertura_de_janelas() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rodar_abertura_de_janelas() TO service_role;


--
-- Name: FUNCTION rodar_conformidade_diaria(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rodar_conformidade_diaria() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rodar_conformidade_diaria() TO service_role;


--
-- Name: FUNCTION rotulo_de_veiculo(p_marca text, p_modelo text, p_versao text, p_ano integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rotulo_de_veiculo(p_marca text, p_modelo text, p_versao text, p_ano integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rotulo_de_veiculo(p_marca text, p_modelo text, p_versao text, p_ano integer) TO authenticated;
GRANT ALL ON FUNCTION public.rotulo_de_veiculo(p_marca text, p_modelo text, p_versao text, p_ano integer) TO service_role;


--
-- Name: FUNCTION sincronizar_papeis(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sincronizar_papeis() TO anon;
GRANT ALL ON FUNCTION public.sincronizar_papeis() TO authenticated;
GRANT ALL ON FUNCTION public.sincronizar_papeis() TO service_role;


--
-- Name: FUNCTION sms_devolver_presos(p_campanha uuid, p_minutos integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sms_devolver_presos(p_campanha uuid, p_minutos integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sms_devolver_presos(p_campanha uuid, p_minutos integer) TO service_role;


--
-- Name: FUNCTION sms_registrar_clique(p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sms_registrar_clique(p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sms_registrar_clique(p_codigo text) TO service_role;


--
-- Name: TABLE sms_envios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sms_envios TO service_role;


--
-- Name: FUNCTION sms_reservar_envios(p_campanha uuid, p_limite integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sms_reservar_envios(p_campanha uuid, p_limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sms_reservar_envios(p_campanha uuid, p_limite integer) TO service_role;


--
-- Name: FUNCTION tem_papel(user_id uuid, papel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tem_papel(user_id uuid, papel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.tem_papel(user_id uuid, papel text) TO authenticated;
GRANT ALL ON FUNCTION public.tem_papel(user_id uuid, papel text) TO service_role;


--
-- Name: FUNCTION tocar_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tocar_updated_at() TO anon;
GRANT ALL ON FUNCTION public.tocar_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.tocar_updated_at() TO service_role;


--
-- Name: FUNCTION veiculo_entradas_so_encerra(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.veiculo_entradas_so_encerra() TO anon;
GRANT ALL ON FUNCTION public.veiculo_entradas_so_encerra() TO authenticated;
GRANT ALL ON FUNCTION public.veiculo_entradas_so_encerra() TO service_role;


--
-- Name: FUNCTION veiculos_chassi_imutavel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.veiculos_chassi_imutavel() TO anon;
GRANT ALL ON FUNCTION public.veiculos_chassi_imutavel() TO authenticated;
GRANT ALL ON FUNCTION public.veiculos_chassi_imutavel() TO service_role;


--
-- Name: FUNCTION vincular_auth_por_email(p_cliente uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vincular_auth_por_email(p_cliente uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vincular_auth_por_email(p_cliente uuid) TO service_role;


--
-- Name: TABLE clientes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.clientes TO authenticated;
GRANT ALL ON TABLE public.clientes TO service_role;


--
-- Name: TABLE funil_etapas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.funil_etapas TO authenticated;
GRANT ALL ON TABLE public.funil_etapas TO service_role;


--
-- Name: TABLE investidores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.investidores TO anon;
GRANT ALL ON TABLE public.investidores TO authenticated;
GRANT ALL ON TABLE public.investidores TO service_role;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leads TO anon;
GRANT ALL ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;


--
-- Name: TABLE parceiros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.parceiros TO anon;
GRANT ALL ON TABLE public.parceiros TO authenticated;
GRANT ALL ON TABLE public.parceiros TO service_role;


--
-- Name: TABLE parceiros_ciclo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.parceiros_ciclo TO authenticated;
GRANT ALL ON TABLE public.parceiros_ciclo TO service_role;


--
-- Name: TABLE agenda_de_pessoas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agenda_de_pessoas TO authenticated;
GRANT ALL ON TABLE public.agenda_de_pessoas TO service_role;


--
-- Name: TABLE anuncios; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.anuncios TO authenticated;
GRANT ALL ON TABLE public.anuncios TO service_role;


--
-- Name: TABLE apolices_seguro; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.apolices_seguro TO authenticated;
GRANT ALL ON TABLE public.apolices_seguro TO service_role;


--
-- Name: TABLE atendimentos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.atendimentos TO authenticated;
GRANT ALL ON TABLE public.atendimentos TO service_role;


--
-- Name: TABLE auditoria; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.auditoria TO authenticated;
GRANT ALL ON TABLE public.auditoria TO service_role;


--
-- Name: TABLE auditoria_admin; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auditoria_admin TO anon;
GRANT ALL ON TABLE public.auditoria_admin TO authenticated;
GRANT ALL ON TABLE public.auditoria_admin TO service_role;


--
-- Name: TABLE cabecalho_dos_guias; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cabecalho_dos_guias TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cabecalho_dos_guias TO authenticated;
GRANT ALL ON TABLE public.cabecalho_dos_guias TO service_role;


--
-- Name: TABLE ciclo_parametros; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.ciclo_parametros TO authenticated;
GRANT ALL ON TABLE public.ciclo_parametros TO service_role;


--
-- Name: TABLE confirmacoes_disponibilidade; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.confirmacoes_disponibilidade TO authenticated;
GRANT ALL ON TABLE public.confirmacoes_disponibilidade TO service_role;


--
-- Name: TABLE conformidade_diaria; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.conformidade_diaria TO authenticated;
GRANT ALL ON TABLE public.conformidade_diaria TO service_role;


--
-- Name: TABLE consultas_de_modelo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.consultas_de_modelo TO authenticated;
GRANT ALL ON TABLE public.consultas_de_modelo TO service_role;


--
-- Name: TABLE consultas_de_placa; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.consultas_de_placa TO authenticated;
GRANT ALL ON TABLE public.consultas_de_placa TO service_role;


--
-- Name: TABLE contacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contacts TO anon;
GRANT ALL ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;


--
-- Name: TABLE contratos_ciclo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contratos_ciclo TO authenticated;
GRANT ALL ON TABLE public.contratos_ciclo TO service_role;


--
-- Name: TABLE contratos_financiamento; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.contratos_financiamento TO authenticated;
GRANT ALL ON TABLE public.contratos_financiamento TO service_role;


--
-- Name: TABLE documentos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.documentos TO authenticated;
GRANT ALL ON TABLE public.documentos TO service_role;


--
-- Name: TABLE erros; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.erros TO authenticated;
GRANT ALL ON TABLE public.erros TO service_role;


--
-- Name: COLUMN erros.resolvido_em; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(resolvido_em) ON TABLE public.erros TO authenticated;


--
-- Name: COLUMN erros.resolvido_por; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(resolvido_por) ON TABLE public.erros TO authenticated;


--
-- Name: SEQUENCE estoque_motors_nativo_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.estoque_motors_nativo_seq TO anon;
GRANT ALL ON SEQUENCE public.estoque_motors_nativo_seq TO authenticated;
GRANT ALL ON SEQUENCE public.estoque_motors_nativo_seq TO service_role;


--
-- Name: TABLE estoque_motors; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.estoque_motors TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.estoque_motors TO authenticated;
GRANT ALL ON TABLE public.estoque_motors TO service_role;


--
-- Name: COLUMN estoque_motors.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(id) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.marca; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(marca) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(marca) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.modelo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(modelo) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(modelo) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.versao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(versao) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(versao) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.ano; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ano) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(ano) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.ano_fabricacao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ano_fabricacao) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(ano_fabricacao) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.preco; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(preco) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(preco) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.preco_original; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(preco_original) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(preco_original) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.preco_promocional; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(preco_promocional) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(preco_promocional) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.quilometragem; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(quilometragem) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(quilometragem) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.cambio; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(cambio) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(cambio) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.combustivel; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(combustivel) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(combustivel) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.cor; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(cor) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(cor) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.tipo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(tipo) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(tipo) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.perfil_uso; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(perfil_uso) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(perfil_uso) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.url_imagem; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(url_imagem) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(url_imagem) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.link_conversao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(link_conversao) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(link_conversao) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.pericia; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(pericia) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(pericia) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.whatsapp_images; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(whatsapp_images) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(whatsapp_images) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.web_full_images; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(web_full_images) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(web_full_images) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(created_at) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.descricao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(descricao) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(descricao) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.laudo_pericia; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(laudo_pericia) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(laudo_pericia) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.opcionais; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(opcionais) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(opcionais) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.status_tag; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status_tag) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(status_tag) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.status_tag_color; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status_tag_color) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(status_tag_color) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.vendido; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(vendido) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(vendido) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.last_seen_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_seen_at) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(last_seen_at) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.motor; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(motor) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(motor) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.cor_interna; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(cor_interna) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(cor_interna) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.donos_anteriores; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(donos_anteriores) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(donos_anteriores) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.garantia_fabrica; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(garantia_fabrica) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(garantia_fabrica) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.conteudo_atualizado_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(conteudo_atualizado_em) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(conteudo_atualizado_em) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.descricao_seo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(descricao_seo) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(descricao_seo) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.first_seen_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(first_seen_at) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(first_seen_at) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.modelo_override; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(modelo_override) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(modelo_override) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.versao_override; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(versao_override) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(versao_override) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.perfis_uso; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(perfis_uso) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(perfis_uso) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.origem; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(origem) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(origem) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.estado_cadastro; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(estado_cadastro) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(estado_cadastro) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.portas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(portas) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(portas) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.em_preparacao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(em_preparacao) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(em_preparacao) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: COLUMN estoque_motors.previsao_chegada_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(previsao_chegada_em) ON TABLE public.estoque_motors TO anon;
GRANT SELECT(previsao_chegada_em) ON TABLE public.estoque_motors TO authenticated;


--
-- Name: TABLE estoque_motors_equipe; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.estoque_motors_equipe TO authenticated;
GRANT ALL ON TABLE public.estoque_motors_equipe TO service_role;


--
-- Name: TABLE eventos_ciclo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.eventos_ciclo TO authenticated;
GRANT ALL ON TABLE public.eventos_ciclo TO service_role;


--
-- Name: TABLE fipe_historico; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.fipe_historico TO authenticated;
GRANT ALL ON TABLE public.fipe_historico TO service_role;


--
-- Name: TABLE funil_motivos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.funil_motivos TO authenticated;
GRANT ALL ON TABLE public.funil_motivos TO service_role;


--
-- Name: TABLE guias; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.guias TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.guias TO authenticated;
GRANT ALL ON TABLE public.guias TO service_role;


--
-- Name: TABLE historico_veiculo; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.historico_veiculo TO anon;
GRANT ALL ON TABLE public.historico_veiculo TO authenticated;
GRANT ALL ON TABLE public.historico_veiculo TO service_role;


--
-- Name: TABLE ia_classificacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ia_classificacoes TO service_role;


--
-- Name: TABLE indice_ciclo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.indice_ciclo TO authenticated;
GRANT ALL ON TABLE public.indice_ciclo TO service_role;


--
-- Name: TABLE investidor_movimentos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.investidor_movimentos TO anon;
GRANT ALL ON TABLE public.investidor_movimentos TO authenticated;
GRANT ALL ON TABLE public.investidor_movimentos TO service_role;


--
-- Name: TABLE movimentacoes_investidor; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.movimentacoes_investidor TO anon;
GRANT ALL ON TABLE public.movimentacoes_investidor TO authenticated;
GRANT ALL ON TABLE public.movimentacoes_investidor TO service_role;


--
-- Name: TABLE investidor_posicao; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.investidor_posicao TO anon;
GRANT ALL ON TABLE public.investidor_posicao TO authenticated;
GRANT ALL ON TABLE public.investidor_posicao TO service_role;


--
-- Name: TABLE investidor_veiculos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.investidor_veiculos TO anon;
GRANT ALL ON TABLE public.investidor_veiculos TO authenticated;
GRANT ALL ON TABLE public.investidor_veiculos TO service_role;


--
-- Name: TABLE lancamentos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.lancamentos TO authenticated;
GRANT ALL ON TABLE public.lancamentos TO service_role;


--
-- Name: TABLE lead_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lead_tags TO service_role;


--
-- Name: TABLE leads_erros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leads_erros TO anon;
GRANT ALL ON TABLE public.leads_erros TO authenticated;
GRANT ALL ON TABLE public.leads_erros TO service_role;


--
-- Name: TABLE leads_eventos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leads_eventos TO authenticated;
GRANT ALL ON TABLE public.leads_eventos TO service_role;


--
-- Name: TABLE leads_interacoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.leads_interacoes TO authenticated;
GRANT ALL ON TABLE public.leads_interacoes TO service_role;


--
-- Name: TABLE leads_sdr; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leads_sdr TO service_role;


--
-- Name: TABLE leads_veiculos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.leads_veiculos TO authenticated;
GRANT ALL ON TABLE public.leads_veiculos TO service_role;


--
-- Name: TABLE leituras_odometro; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.leituras_odometro TO authenticated;
GRANT ALL ON TABLE public.leituras_odometro TO service_role;


--
-- Name: TABLE manutencoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.manutencoes TO authenticated;
GRANT ALL ON TABLE public.manutencoes TO service_role;


--
-- Name: TABLE marketing_contatos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketing_contatos TO service_role;


--
-- Name: TABLE marketing_importacoes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketing_importacoes TO service_role;


--
-- Name: TABLE marketing_interesses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketing_interesses TO service_role;


--
-- Name: TABLE midia_ajustes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.midia_ajustes TO anon;
GRANT ALL ON TABLE public.midia_ajustes TO authenticated;
GRANT ALL ON TABLE public.midia_ajustes TO service_role;


--
-- Name: TABLE midia_anuncios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.midia_anuncios TO anon;
GRANT ALL ON TABLE public.midia_anuncios TO authenticated;
GRANT ALL ON TABLE public.midia_anuncios TO service_role;


--
-- Name: TABLE midia_campanhas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.midia_campanhas TO anon;
GRANT ALL ON TABLE public.midia_campanhas TO authenticated;
GRANT ALL ON TABLE public.midia_campanhas TO service_role;


--
-- Name: TABLE midia_diario; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.midia_diario TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.midia_diario TO authenticated;
GRANT ALL ON TABLE public.midia_diario TO service_role;


--
-- Name: TABLE midia_leituras; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.midia_leituras TO anon;
GRANT ALL ON TABLE public.midia_leituras TO authenticated;
GRANT ALL ON TABLE public.midia_leituras TO service_role;


--
-- Name: TABLE midia_sincronizacoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.midia_sincronizacoes TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.midia_sincronizacoes TO authenticated;
GRANT ALL ON TABLE public.midia_sincronizacoes TO service_role;


--
-- Name: TABLE negocio_pagamentos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.negocio_pagamentos TO authenticated;
GRANT ALL ON TABLE public.negocio_pagamentos TO service_role;


--
-- Name: TABLE negocios; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.negocios TO authenticated;
GRANT ALL ON TABLE public.negocios TO service_role;


--
-- Name: TABLE notificacoes_admin; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notificacoes_admin TO anon;
GRANT ALL ON TABLE public.notificacoes_admin TO authenticated;
GRANT ALL ON TABLE public.notificacoes_admin TO service_role;


--
-- Name: TABLE orgs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.orgs TO authenticated;
GRANT ALL ON TABLE public.orgs TO service_role;


--
-- Name: TABLE parametros_avaliacao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.parametros_avaliacao TO authenticated;
GRANT ALL ON TABLE public.parametros_avaliacao TO service_role;


--
-- Name: TABLE partidas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.partidas TO authenticated;
GRANT ALL ON TABLE public.partidas TO service_role;


--
-- Name: TABLE plano_contas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.plano_contas TO authenticated;
GRANT ALL ON TABLE public.plano_contas TO service_role;


--
-- Name: TABLE plano_revisoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.plano_revisoes TO authenticated;
GRANT ALL ON TABLE public.plano_revisoes TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE regras_comissao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.regras_comissao TO authenticated;
GRANT ALL ON TABLE public.regras_comissao TO service_role;


--
-- Name: TABLE regras_contabilizacao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.regras_contabilizacao TO authenticated;
GRANT ALL ON TABLE public.regras_contabilizacao TO service_role;


--
-- Name: TABLE renave_operacoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.renave_operacoes TO authenticated;
GRANT ALL ON TABLE public.renave_operacoes TO service_role;


--
-- Name: TABLE repasse_avisos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.repasse_avisos TO authenticated;
GRANT ALL ON TABLE public.repasse_avisos TO service_role;


--
-- Name: TABLE repasse_inscritos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.repasse_inscritos TO authenticated;
GRANT ALL ON TABLE public.repasse_inscritos TO service_role;


--
-- Name: TABLE repasses; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.repasses TO authenticated;
GRANT ALL ON TABLE public.repasses TO service_role;


--
-- Name: COLUMN repasses.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.slug; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(slug) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.marca; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(marca) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.modelo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(modelo) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.versao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(versao) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.ano_modelo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ano_modelo) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.ano_fabricacao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ano_fabricacao) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.quilometragem; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(quilometragem) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.cambio; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(cambio) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.combustivel; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(combustivel) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.cor; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(cor) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.carroceria; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(carroceria) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.preco; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(preco) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.fipe_valor; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(fipe_valor) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.fipe_codigo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(fipe_codigo) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.fipe_mes_referencia; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(fipe_mes_referencia) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.laudo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(laudo) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.laudo_apontamento; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(laudo_apontamento) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.leilao_consta; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(leilao_consta) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.leilao_detalhe; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(leilao_detalhe) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.sinistro_consta; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(sinistro_consta) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.sinistro_detalhe; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(sinistro_detalhe) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.historico_consultado_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(historico_consultado_em) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.resumo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(resumo) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.motivo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(motivo) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.itens_de_estado; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(itens_de_estado) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.sem_defeitos_conhecidos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(sem_defeitos_conhecidos) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.oficina_do_orcamento; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(oficina_do_orcamento) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.orcamento_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(orcamento_em) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.web_full_images; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(web_full_images) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.whatsapp_images; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(whatsapp_images) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.situacao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(situacao) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.lojistas_desde; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(lojistas_desde) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.aberto_ao_publico_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(aberto_ao_publico_em) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.reservado_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(reservado_em) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.vendido_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(vendido_em) ON TABLE public.repasses TO anon;


--
-- Name: COLUMN repasses.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.repasses TO anon;


--
-- Name: TABLE saude_da_atribuicao_dos_leads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.saude_da_atribuicao_dos_leads TO authenticated;
GRANT ALL ON TABLE public.saude_da_atribuicao_dos_leads TO service_role;


--
-- Name: TABLE sdr_qualificacao; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sdr_qualificacao TO service_role;


--
-- Name: TABLE site_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_settings TO anon;
GRANT ALL ON TABLE public.site_settings TO authenticated;
GRANT ALL ON TABLE public.site_settings TO service_role;


--
-- Name: TABLE sms_campanhas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.sms_campanhas TO authenticated;
GRANT ALL ON TABLE public.sms_campanhas TO service_role;


--
-- Name: TABLE sms_descadastros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sms_descadastros TO service_role;


--
-- Name: TABLE telemetria_resumo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.telemetria_resumo TO authenticated;
GRANT ALL ON TABLE public.telemetria_resumo TO service_role;


--
-- Name: TABLE textos_de_hub; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.textos_de_hub TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.textos_de_hub TO authenticated;
GRANT ALL ON TABLE public.textos_de_hub TO service_role;


--
-- Name: TABLE tracking_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tracking_events TO service_role;


--
-- Name: TABLE veiculo_custos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.veiculo_custos TO authenticated;
GRANT ALL ON TABLE public.veiculo_custos TO service_role;


--
-- Name: TABLE veiculo_entradas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.veiculo_entradas TO authenticated;
GRANT ALL ON TABLE public.veiculo_entradas TO service_role;


--
-- Name: TABLE veiculo_eventos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.veiculo_eventos TO authenticated;
GRANT ALL ON TABLE public.veiculo_eventos TO service_role;


--
-- Name: SEQUENCE veiculo_eventos_seq_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.veiculo_eventos_seq_seq TO anon;
GRANT ALL ON SEQUENCE public.veiculo_eventos_seq_seq TO authenticated;
GRANT ALL ON SEQUENCE public.veiculo_eventos_seq_seq TO service_role;


--
-- Name: TABLE veiculo_precos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.veiculo_precos TO authenticated;
GRANT ALL ON TABLE public.veiculo_precos TO service_role;


--
-- Name: TABLE veiculos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.veiculos TO authenticated;
GRANT ALL ON TABLE public.veiculos TO service_role;


--
-- Name: TABLE veiculo_situacao; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.veiculo_situacao TO authenticated;
GRANT ALL ON TABLE public.veiculo_situacao TO service_role;


--
-- Name: TABLE veiculos_vendidos; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,DELETE,UPDATE ON TABLE public.veiculos_vendidos TO authenticated;
GRANT ALL ON TABLE public.veiculos_vendidos TO service_role;


--
-- Name: COLUMN veiculos_vendidos.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.cliente_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(cliente_id) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.estoque_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(estoque_id) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.chassi; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(chassi) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.placa; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(placa) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.marca; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(marca) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.modelo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(modelo) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.versao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(versao) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.ano_fabricacao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ano_fabricacao) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.ano_modelo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(ano_modelo) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.data_venda; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(data_venda) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.km_na_venda; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(km_na_venda) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.valor_venda; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(valor_venda) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.aderiu_ciclo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(aderiu_ciclo) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.vendedor; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(vendedor) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.vendedor_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(vendedor_id) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.saiu_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(saiu_em) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: COLUMN veiculos_vendidos.motivo_saida; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(motivo_saida) ON TABLE public.veiculos_vendidos TO authenticated;


--
-- Name: TABLE vw_ciclo_estado; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_ciclo_estado TO service_role;


--
-- Name: TABLE vw_ciclo_estado_painel; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_ciclo_estado_painel TO authenticated;
GRANT ALL ON TABLE public.vw_ciclo_estado_painel TO service_role;


--
-- Name: TABLE vw_vendas_incompletas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.vw_vendas_incompletas TO authenticated;
GRANT ALL ON TABLE public.vw_vendas_incompletas TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

\unrestrict esquemabase


-- ---------------------------------------------------------------------------
-- 20_fora_do_public
-- ---------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('branding', 'branding', 't', null, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('diario-de-bordo', 'diario-de-bordo', 'f', 15728640, '{image/jpeg,image/png,image/webp,image/heic,image/heif}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('veiculos', 'veiculos', 't', 15728640, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
create policy "Give anon users access to JPG images in folder 1ym05q3_0" on storage.objects as PERMISSIVE for SELECT to public using (((bucket_id = 'branding'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));
create policy "Give anon users access to JPG images in folder 1ym05q3_1" on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'branding'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));
create policy "Give anon users access to JPG images in folder 1ym05q3_2" on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'branding'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));
create policy "Give anon users access to JPG images in folder 1ym05q3_3" on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'branding'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));
create policy "Give anon users access to PNG images in folder 1ym05q3_0" on storage.objects as PERMISSIVE for SELECT to public using (((bucket_id = 'branding'::text) AND (storage.extension(name) = 'png'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));
create policy "Give anon users access to PNG images in folder 1ym05q3_1" on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'branding'::text) AND (storage.extension(name) = 'png'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));
create policy "Give anon users access to PNG images in folder 1ym05q3_2" on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'branding'::text) AND (storage.extension(name) = 'png'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));
create policy "Give anon users access to PNG images in folder 1ym05q3_3" on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'branding'::text) AND (storage.extension(name) = 'png'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text)));
create policy "Give users access to own folder 1ym05q3_0" on storage.objects as PERMISSIVE for SELECT to public using (((bucket_id = 'branding'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));
create policy "Give users access to own folder 1ym05q3_1" on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'branding'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));
create policy "Give users access to own folder 1ym05q3_2" on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'branding'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));
create policy "Give users access to own folder 1ym05q3_3" on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'branding'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));
create policy "Permitir atualização para usuários autenticados no bucket br" on storage.objects as PERMISSIVE for UPDATE to public using (((bucket_id = 'branding'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Permitir deleção para usuários autenticados no bucket brandi" on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'branding'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Permitir leitura pública no bucket branding" on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'branding'::text));
create policy "Permitir upload para usuários autenticados no bucket branding" on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'branding'::text) AND (auth.role() = 'authenticated'::text)));
create policy diario_cliente_envia on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'diario-de-bordo'::text) AND ((storage.foldername(name))[1] IN ( SELECT (vv.id)::text AS id
   FROM public.veiculos_vendidos vv
  WHERE (vv.cliente_id = public.cliente_atual())))));
create policy diario_cliente_le on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'diario-de-bordo'::text) AND ((storage.foldername(name))[1] IN ( SELECT (vv.id)::text AS id
   FROM public.veiculos_vendidos vv
  WHERE (vv.cliente_id = public.cliente_atual())))));
create policy diario_staff_apaga on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'diario-de-bordo'::text) AND public.is_staff(auth.uid())));
create policy diario_staff_envia on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'diario-de-bordo'::text) AND public.is_staff(auth.uid())));
create policy diario_staff_le on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'diario-de-bordo'::text) AND public.is_staff(auth.uid())));
create policy veiculos_leitura_publica on storage.objects as PERMISSIVE for SELECT to anon, authenticated using ((bucket_id = 'veiculos'::text));
create policy veiculos_staff_apaga on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'veiculos'::text) AND public.is_staff(auth.uid())));
create policy veiculos_staff_atualiza on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'veiculos'::text) AND public.is_staff(auth.uid()))) with check (((bucket_id = 'veiculos'::text) AND public.is_staff(auth.uid())));
create policy veiculos_staff_envia on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'veiculos'::text) AND public.is_staff(auth.uid())));
alter publication supabase_realtime add table public.tracking_events;

-- ---------------------------------------------------------------------------
-- 30_registro
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name) values ('20260803120000', 'baseline_inventario') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260803120100', 'renomear_veiculos_para_estoque_motors') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260804193000', 'remover_view_compat_veiculos') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260804200000', 'adicionar_last_seen_at') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260807120000', 'midia_paga_e_auditoria') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260807160000', 'ficha_propria_do_painel') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260807190000', 'historico_veiculo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260807210000', 'leads') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260808120000', 'rls_escrita_autenticada_estoque') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260811130000', 'leads_insert_destravado') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260812120000', 'rls_leitura_de_site_settings') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260812150000', 'rls_escrita_de_site_settings') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260812160000', 'notificacoes_admin') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260813120000', 'role_cliente_e_is_staff') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260813150000', 'ciclo_fundacao_de_dados') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260814120000', 'fechar_venda_ciclo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260814150000', 'carimbo_e_conformidade') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260814180000', 'motor_de_gatilhos') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260815120000', 'fechar_superficie_exposta') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260815180000', 'garagem_vinculo_do_cliente') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260815210000', 'storage_do_diario_de_bordo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260815230000', 'consentimento_do_cliente') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260817120000', 'conteudo_atualizado_em') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260817130000', 'descricao_seo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260817140000', 'documento_do_estoque_e_cep') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260818120000', 'falha_envio_nao_penaliza') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260818130000', 'vinculo_exige_email_confirmado') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260818140000', 'desfecho_nao_regride') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260819120000', 'cron_da_conformidade') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260819130000', 'cron_da_matview_do_ciclo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260819140000', 'completude_da_venda') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260819150000', 'papeis_multiplos') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260820120000', 'plano_de_revisoes_vitalicio') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260821120000', 'financeiro_operacional') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260821150000', 'alcada_de_aprovacao') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260821180000', 'papeis_gestor_e_investidor') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260821210000', 'exclusao_financeira_so_admin') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260822120000', 'perfil_investidor') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260822130000', 'conciliacao_bancaria') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260822150000', 'aprovacao_de_recorrente') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260822180000', 'lancar_do_extrato_atomico') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260822210000', 'fundir_investidores') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260824150000', 'conta_absorve_insumo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260824190000', 'agenda_de_pessoas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260826030000', 'first_seen_at') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260826150000', 'modelo_e_versao_override') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260826200000', 'corrige_where_do_ka') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260826210000', 'desfaz_override_do_ka_15') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260826230000', 'perfis_uso') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260828120000', 'funil_de_vendas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260828160000', 'desfecho_sem_oportunidade') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260828190000', 'aposentadoria_financeiro_legado') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120000', 'f0a_org_e_enums') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120100', 'f0b_veiculos_e_entradas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120200', 'f0c_eventos_e_auditoria') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120300', 'f0d_custos_e_precos') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120400', 'f0e_razao') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120500', 'f0f_parametros') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120600', 'f0g_negocios') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120700', 'f0h_documentos_anuncios_renave') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829120800', 'f0i_situacao') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829121000', 'f0j_unicidade_de_vigencia') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829130000', 'f0k_cadastro_nativo_e_trava_do_sync') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829140000', 'f0l_fechar_superficie_anon_do_nucleo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829150000', 'f0m_autoria_privilegio_e_guardas_forjaveis') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829160000', 'f0n_ordem_dos_eventos_e_integridade') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829170000', 'f0o_entrada_no_nucleo_e_duplicidade') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260829180000', 'f0p_storage_das_fotos_do_veiculo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260830120000', 'f0q_estado_do_cadastro_e_fim_do_override') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260831140000', 'atendimento_chatwoot_legivel_pelo_painel') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260831150000', 'atendimento_o_grant_que_faltava') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260831160000', 'texto_do_hub_editavel') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260901120000', 'laudo_cautelar_texto_padrao') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260901130000', 'textos_dos_hubs') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260901140000', 'perua_absorve_wagon') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260902120000', 'preco_e_do_revendamais') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260902130000', 'indice_do_ag_uid_no_lead') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260902150000', 'preco_do_sync_move_o_lastmod') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260904120000', 'portas_do_veiculo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260905120000', 'motivo_por_escopo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260906120000', 'sem_retorno_por_ultimo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260906160000', 'guias_no_banco') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260907120000', 'cabecalho_dos_guias') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260908160000', 'opcionais_vem_do_feed') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260910120000', 'erros_do_site') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260912120000', 'retencao_de_erros_agendada') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260913170000', 'pericia_padrao_da_casa_nos_em_analise') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260915120000', 'contato_pelo_chatwoot') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260916150000', 'sla_conta_depois_do_assistente') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260916170000', 'motivos_de_ganho_por_escopo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260916210000', 'os_tres_vendidos_de_08_09') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260916220000', 'disponibilidade_espelha_o_revendamais') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260921090901', 'saude_da_atribuicao_dos_leads') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260923130000', 'papel_sdr') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260923130100', 'rodizio_so_comercial') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260923150000', 'gestao_do_lead') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260924120000', 'midia_paga_sincronizada') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260924180000', 'repasse_fundacao') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260924190000', 'avaliacao_no_lead') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260924200000', 'repasse_escrita_pela_rota') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260924220000', 'curva_km_por_ano') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260925120000', 'repasse_carrocerias_da_lista') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260925130000', 'leads_interacoes_org_id') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260925180000', 'etiquetas_do_lead') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260925200000', 'perfil_no_lead') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260928120000', 'parametros_financiamento') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260928150000', 'em_preparacao') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260929120000', 'documentos_do_feed_preenchem_o_vazio') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260929170000', 'chassi_valido_segue_o_feed') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260929200000', 'ficha_tecnica_segue_o_feed') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260929210000', 'ficha_tecnica_so_no_carro_do_feed') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260929220000', 'leitura_anonima_sem_documento_nem_custo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260930120000', 'classe_a_no_lugar_de_a250') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261001150000', 'documento_e_custo_so_para_a_equipe') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261001180000', 'custo_do_vendido_fora_da_sessao') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261002120000', 'repasse_moto') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261003130000', 'leads_rls_por_escopo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261005120000', 'veiculos_de_interesse') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261005150000', 'agenda_para_toda_a_equipe') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261006180000', 'consultas_de_placa') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261006190000', 'fipe_historico') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261007120000', 'sms_campanhas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261008120000', 'consultas_de_modelo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261009120000', 'concluir_passo_sem_proximo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261010140000', 'transferencia_espera_o_prazo_do_novo_dono') on conflict do nothing;
