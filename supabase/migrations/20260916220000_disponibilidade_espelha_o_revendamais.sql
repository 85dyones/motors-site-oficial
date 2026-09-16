-- ============================================================================
-- A disponibilidade espelha o RevendaMais: quem sai do feed vira VENDIDO
-- ============================================================================
-- Decisão do dono em 2026-09-16, literal:
--
--   "o site precisa reconhecer o status de "pre-venda" e "vendido" do revenda
--    e migrar o carro para vendido, a disponibilidade precisa espelhar o
--    revenda mais. mas precisam ter alguns dias como vendido, seguindo a
--    proposta do ensaio, para não quebrar o processo."
--
-- O defeito que a motivou: Voyage 8393824, Celta 8416946 e Peugeot 2008
-- 8417265 saíram do feed em 08/09 e ficaram oito dias anunciados como à venda.
-- Desde a F0-q (30/08) nada no banco reage à saída do feed: "fora do feed"
-- virou `estado_cadastro <> 'publicado'`, arquivar é ato de gente, e o sync só
-- carimba `last_seen_at` de quem VEIO. O passivo dos três é a migração
-- anterior (20260916210000); esta é o mecanismo.
--
-- ---------------------------------------------------------------------------
-- O que o feed sabe, medido em 16/09
-- ---------------------------------------------------------------------------
-- O XML `companyFeed/id/7762/type/sitedaloja` (o do nó "Buscar XML
-- RevendaMais") traz 42 tags por anúncio e NENHUMA de status: não há STATUS,
-- SITUACAO, RESERVADO, VENDIDO nem PRE_VENDA. `CONDITION` é "USADO" nos 44,
-- `DATE` é a data em que o arquivo foi gerado e `LAST_UPDATE` é a última
-- edição do anúncio. O feed não diz "pré-venda" nem "vendido": ele OMITE o
-- carro. A ausência é o único sinal.
--
-- Então "espelhar" aqui é: saiu do feed → VENDIDO; voltou ao feed → à venda.
-- Pré-venda e venda chegam pela mesma porta e com a mesma cara. Separá-las
-- (um selo RESERVADO, por exemplo) exige um dado que este feed não publica.
--
-- ---------------------------------------------------------------------------
-- Por que uma função, e não o upsert
-- ---------------------------------------------------------------------------
-- 1. O upsert do n8n é um POST por anúncio: ele só enxerga quem ESTÁ no feed.
--    Quem saiu não passa por nó nenhum. "Quem sumiu" precisa da lista inteira
--    de uma vez, e a lista só existe inteira no fim do ciclo.
-- 2. A trava (`estoque_motors_trava_do_sync`, versão viva em 20260908160000)
--    descarta em silêncio o que o sync escreve fora de seis colunas, e
--    `vendido` não é uma delas. Continua não sendo, de propósito: aberta no
--    upsert, a coluna deixaria o robô DESMARCAR, a cada seis horas, a venda
--    que a loja marcou no painel e o RevendaMais ainda anuncia (o Honda Fit
--    8321599, vendido em 14/08, estava no feed de 16/09). A função é
--    SECURITY DEFINER: dentro dela o `current_user` é o dono do banco, a trava
--    não a reconhece como sync, e a escrita passa — só por esta porta e só
--    pelas duas regras abaixo.
-- 3. A data da venda precisa existir. A régua do vendido (`lib/publicacao.ts`)
--    lê a data do `historico_veiculo`; `vendido = true` sem histórico deixa a
--    ficha no relógio do proxy e tira o carro do catálogo de anúncios na hora,
--    sem a janela de 7 dias. A função escreve a coluna E o histórico, como o
--    painel — e é isso que dá ao carro "alguns dias como vendido": 90 na
--    ficha e no sitemap, 7 no catálogo como `out_of_stock`.
--
-- ---------------------------------------------------------------------------
-- As regras
-- ---------------------------------------------------------------------------
-- SAIU: `origem = 'sync'`, `publicado`, à venda, fora da lista de agora e sem
--   confirmação do feed há pelo menos a MARGEM → `vendido = true` e histórico
--   ("false" → "true", autor "RevendaMais (sync)", agora).
-- VOLTOU: vendido, `publicado`, de volta à lista, e a ÚLTIMA mudança de
--   `vendido` foi do próprio sync → à venda de novo (a pré-venda que caiu).
--   Venda marcada por GENTE nunca é desfeita aqui: só aparece no retorno, em
--   `vendidos_na_mao_e_ainda_no_feed`.
-- NUNCA: `origem = 'painel'` (não tem feed); `rascunho` e `arquivado` (quem
--   decide é a loja); `veiculos_vendidos` (é a venda do Ciclo, com cliente e
--   contrato — o sync não tem esses dados e não inventa venda).
--
-- Os dois números NÃO são novos — são réguas que o repositório já tinha:
--
--   MARGEM = 24 horas: `MARGEM_FORA_DO_FEED_MS` (`lib/estoqueTabela.ts`), a
--     mesma a partir da qual o painel avisa "fora do feed há N dias". Quatro
--     ciclos seguidos sem o carro; um ciclo perdido é rotina. Com as duas
--     iguais, o carro vira VENDIDO no mesmo ciclo em que o painel começaria a
--     avisar. `tests/disponibilidade-espelha-o-revendamais.test.ts` trava a
--     igualdade. Encurtar é decisão do dono, e se faz nos dois lugares.
--   PISO = metade: `FRACAO_MINIMA_DO_CICLO` (`lib/supabase.ts`). Feed com
--     menos da metade dos publicados à venda é coleta quebrada, não venda.
--
-- Proteções: lista vazia → FEED_VAZIO; abaixo do piso → FEED_SUSPEITO. As duas
-- levantam erro (HTTP 400 no PostgREST): a execução do n8n falha, o workflow de
-- erro avisa, e nada é marcado — em vez de uma coleta quebrada vender meio
-- pátio.
--
-- `p_gravar` nasce FALSO: sem ele a chamada é ensaio e devolve o que FARIA.
-- ============================================================================

create or replace function public.reconciliar_disponibilidade_do_feed(
  p_ids    bigint[],
  p_gravar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $funcao$
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
$funcao$;

comment on function public.reconciliar_disponibilidade_do_feed(bigint[], boolean) is
  'A disponibilidade espelha o RevendaMais (decisão do dono, 2026-09-16). Recebe a lista inteira de ids do feed no fim do ciclo do n8n. SAIU (sync, publicado, à venda, fora da lista há 24 h ou mais) → vendido + histórico com autor "RevendaMais (sync)". VOLTOU (vendido pelo próprio sync e de novo na lista) → à venda. Nunca toca origem painel, rascunho, arquivado nem veiculos_vendidos; nunca desfaz venda marcada por gente. p_gravar falso = ensaio. FEED_VAZIO e FEED_SUSPEITO (menos da metade dos publicados à venda) barram tudo. Só a chave de serviço executa.';

-- Default ACL do Supabase concede EXECUTE a anon/authenticated em função nova,
-- e o Postgres concede a PUBLIC por cima. Os três saem: um anônimo com esta
-- função na mão venderia o pátio inteiro mandando uma lista curta.
revoke all on function public.reconciliar_disponibilidade_do_feed(bigint[], boolean) from public, anon, authenticated;
grant execute on function public.reconciliar_disponibilidade_do_feed(bigint[], boolean) to service_role;

-- ============================================================================
-- Autoconferência — prova pelo EFEITO, chamando como o n8n chama
-- ============================================================================
-- A sonda cria um carro de mentira, publica, e passa por todas as regras. Tudo
-- roda dentro de um `begin ... exception` desfeito de propósito: plpgsql não
-- tem SAVEPOINT, e o desvio é este — a variável atribuída dentro do bloco
-- SOBREVIVE ao rollback dele. Assim nem o `--gravar` deixa rastro da sonda.
--
-- A lista de "feed" da sonda é o pátio real à venda MENOS a sonda. Nenhum carro
-- de verdade pode entrar em "sairam" (todos estão na lista) nem em "voltaram"
-- (a lista só tem quem está à venda).
do $aceite$
declare
  f constant text := 'public.reconciliar_disponibilidade_do_feed(bigint[], boolean)';
  c_autor constant text := 'RevendaMais (sync)';
  v_id constant integer := 7000016;

  falhas           int := 0;
  v_nativo         integer;
  v_feed           bigint[];
  r                jsonb;
  v_vendidos_antes int;
  v_ciclo_antes    int;
  v_previa         text;

  -- o que a sonda viu
  s_terminou         boolean := false;
  s_ensaio_sairam    jsonb;
  s_ensaio_vendido   boolean;
  s_gravou_sairam    jsonb;
  s_gravou_vendido   boolean;
  s_hist_marcou      int;
  s_lastmod_andou    boolean;
  s_outros_intocados boolean;
  s_ciclo_intocado   boolean;
  s_repetiu_sairam   jsonb;
  s_hist_repetiu     int;
  s_voltou           jsonb;
  s_voltou_vendido   boolean;
  s_gente_voltaram   jsonb;
  s_gente_na_mao     jsonb;
  s_gente_vendido    boolean;
  s_nativo_sairam    jsonb;
  s_erro_vazio       text;
  s_erro_nulo        text;
  s_erro_suspeito    text;
begin
  -- ── 1. Quem executa ────────────────────────────────────────────────────────
  if has_function_privilege('anon', f, 'execute') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon executa a reconciliação';
  end if;
  if has_function_privilege('authenticated', f, 'execute') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated executa a reconciliação';
  end if;
  if not has_function_privilege('service_role', f, 'execute') then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role (o n8n) não executa a reconciliação';
  end if;
  if not exists (
    select 1 from pg_proc
     where oid = f::regprocedure
       and prosecdef
       and 'search_path=public' = any (proconfig)
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a função não é SECURITY DEFINER com search_path fixo';
  end if;

  if exists (select 1 from public.estoque_motors where id = v_id) then
    raise exception 'ACEITE: o id de sonda % já existe em estoque_motors — troque o id da sonda', v_id;
  end if;

  -- ── 2. A sonda ─────────────────────────────────────────────────────────────
  begin
    select count(*) into v_vendidos_antes from public.estoque_motors where vendido is true;
    select count(*) into v_ciclo_antes from public.veiculos_vendidos;

    -- Nasce como o sync faria: id da faixa do feed, visto há dois dias. O
    -- `conteudo_atualizado_em` antigo é o que permite ver o lastmod andar
    -- dentro de uma transação só, onde `now()` não muda.
    insert into public.estoque_motors
      (id, marca, modelo, preco, ano, last_seen_at, conteudo_atualizado_em)
    values
      (v_id, 'AceiteDisponibilidade', 'SaiuDoFeed', 50000, 2020,
       now() - interval '2 days', now() - interval '3 days');
    update public.estoque_motors set estado_cadastro = 'publicado' where id = v_id;

    select array_agg(id::bigint)
      into v_feed
      from public.estoque_motors
     where origem = 'sync'
       and estado_cadastro = 'publicado'
       and coalesce(vendido, false) = false
       and id <> v_id;

    -- 2a. Ensaio: diz o que faria e não grava.
    r := public.reconciliar_disponibilidade_do_feed(v_feed, false);
    s_ensaio_sairam := r -> 'sairam';
    select vendido into s_ensaio_vendido from public.estoque_motors where id = v_id;

    -- 2b. Grava, como o n8n: chave de serviço.
    set local role service_role;
    r := public.reconciliar_disponibilidade_do_feed(v_feed, true);
    reset role;
    s_gravou_sairam := r -> 'sairam';
    select vendido, conteudo_atualizado_em > now() - interval '3 days'
      into s_gravou_vendido, s_lastmod_andou
      from public.estoque_motors where id = v_id;
    select count(*) into s_hist_marcou
      from public.historico_veiculo
     where veiculo_id = v_id and campo = 'vendido'
       and valor_anterior = 'false' and valor_novo = 'true'
       and autor_id is null and autor_nome = c_autor;
    s_outros_intocados :=
      (select count(*) from public.estoque_motors where vendido is true and id <> v_id) = v_vendidos_antes;
    s_ciclo_intocado := (select count(*) from public.veiculos_vendidos) = v_ciclo_antes;

    -- 2c. Repetir não marca de novo nem duplica o histórico.
    r := public.reconciliar_disponibilidade_do_feed(v_feed, true);
    s_repetiu_sairam := r -> 'sairam';
    select count(*) into s_hist_repetiu
      from public.historico_veiculo where veiculo_id = v_id and campo = 'vendido';

    -- 2d. Voltou ao feed (a pré-venda caiu): o sync desfaz o que ELE marcou.
    r := public.reconciliar_disponibilidade_do_feed(v_feed || v_id::bigint, true);
    s_voltou := r -> 'voltaram';
    select vendido into s_voltou_vendido from public.estoque_motors where id = v_id;

    -- 2e. Venda marcada por GENTE, com o carro ainda no feed: fica vendido.
    update public.estoque_motors set vendido = true where id = v_id;
    insert into public.historico_veiculo
      (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
    values
      (v_id, 'vendido', 'false', 'true', gen_random_uuid(), 'Aceite (painel)', clock_timestamp());
    r := public.reconciliar_disponibilidade_do_feed(v_feed || v_id::bigint, true);
    s_gente_voltaram := r -> 'voltaram';
    s_gente_na_mao := r -> 'vendidos_na_mao_e_ainda_no_feed';
    select vendido into s_gente_vendido from public.estoque_motors where id = v_id;

    -- 2f. Carro do painel nunca esteve no feed: nunca "sai" dele. O carimbo
    -- antigo é posto de propósito (a trava deixa `last_seen_at` passar), para
    -- que só a guarda de `origem` o separe de "sairam" — sem ela, o carimbo
    -- nulo do nativo esconderia a falta da guarda.
    insert into public.estoque_motors (marca, modelo, preco, ano)
    values ('AceiteDisponibilidade', 'Nativo', 60000, 2023)
    returning id into v_nativo;
    update public.estoque_motors set estado_cadastro = 'publicado' where id = v_nativo;
    update public.estoque_motors set last_seen_at = now() - interval '2 days' where id = v_nativo;
    r := public.reconciliar_disponibilidade_do_feed(v_feed, false);
    s_nativo_sairam := r -> 'sairam';

    -- 2g. Coleta quebrada não vende o pátio.
    begin
      perform public.reconciliar_disponibilidade_do_feed('{}'::bigint[], true);
    exception when others then
      s_erro_vazio := sqlerrm;
    end;
    begin
      perform public.reconciliar_disponibilidade_do_feed(null, true);
    exception when others then
      s_erro_nulo := sqlerrm;
    end;
    begin
      perform public.reconciliar_disponibilidade_do_feed(array[v_id::bigint], true);
    exception when others then
      s_erro_suspeito := sqlerrm;
    end;

    s_terminou := true;
    raise exception 'DESFAZ_A_SONDA';
  exception when others then
    if sqlerrm <> 'DESFAZ_A_SONDA' then
      falhas := falhas + 1;
      raise warning 'FALHOU: a sonda parou no meio — %', sqlerrm;
    end if;
  end;

  -- ── 3. O que a sonda viu ─────────────────────────────────────────────────
  if s_terminou then
    if coalesce(jsonb_array_length(s_ensaio_sairam), -1) <> 1
       or (s_ensaio_sairam -> 0 ->> 'id')::int is distinct from v_id then
      falhas := falhas + 1;
      raise warning 'FALHOU: o ensaio devia listar só a sonda em "sairam" — veio %', s_ensaio_sairam;
    end if;
    if s_ensaio_vendido is not false then
      falhas := falhas + 1;
      raise warning 'FALHOU: o ensaio gravou (vendido = %)', s_ensaio_vendido;
    end if;
    if coalesce(jsonb_array_length(s_gravou_sairam), -1) <> 1 or s_gravou_vendido is not true then
      falhas := falhas + 1;
      raise warning 'FALHOU: chamada como service_role não marcou a sonda (sairam = %, vendido = %) — a trava engoliu?',
        s_gravou_sairam, s_gravou_vendido;
    end if;
    if s_hist_marcou <> 1 then
      falhas := falhas + 1;
      raise warning 'FALHOU: % linhas de histórico da marcação (esperado 1) — sem ela a carência não tem data', s_hist_marcou;
    end if;
    if s_lastmod_andou is not true then
      falhas := falhas + 1;
      raise warning 'FALHOU: o lastmod não andou com a marcação';
    end if;
    if s_outros_intocados is not true then
      falhas := falhas + 1;
      raise warning 'FALHOU: outro carro além da sonda virou vendido';
    end if;
    if s_ciclo_intocado is not true then
      falhas := falhas + 1;
      raise warning 'FALHOU: veiculos_vendidos mudou — o sync não registra venda do Ciclo';
    end if;
    if coalesce(jsonb_array_length(s_repetiu_sairam), -1) <> 0 or s_hist_repetiu <> 1 then
      falhas := falhas + 1;
      raise warning 'FALHOU: repetir a chamada marcou de novo (sairam = %, histórico = %)', s_repetiu_sairam, s_hist_repetiu;
    end if;
    if coalesce(jsonb_array_length(s_voltou), -1) <> 1 or s_voltou_vendido is not false then
      falhas := falhas + 1;
      raise warning 'FALHOU: a volta ao feed não devolveu à venda (voltaram = %, vendido = %)', s_voltou, s_voltou_vendido;
    end if;
    if coalesce(jsonb_array_length(s_gente_voltaram), -1) <> 0 or s_gente_vendido is not true then
      falhas := falhas + 1;
      raise warning 'FALHOU: o feed desfez venda marcada por gente (voltaram = %, vendido = %)', s_gente_voltaram, s_gente_vendido;
    end if;
    if coalesce(jsonb_array_length(s_gente_na_mao), -1) <> 1 then
      falhas := falhas + 1;
      raise warning 'FALHOU: venda de gente ainda no feed não apareceu no retorno — veio %', s_gente_na_mao;
    end if;
    if coalesce(jsonb_array_length(s_nativo_sairam), -1) <> 0 then
      falhas := falhas + 1;
      raise warning 'FALHOU: carro do painel entrou em "sairam" — veio %', s_nativo_sairam;
    end if;
    if coalesce(s_erro_vazio, '') not like 'FEED_VAZIO%' or coalesce(s_erro_nulo, '') not like 'FEED_VAZIO%' then
      falhas := falhas + 1;
      raise warning 'FALHOU: lista vazia ou nula não barrou (%, %)', s_erro_vazio, s_erro_nulo;
    end if;
    if coalesce(s_erro_suspeito, '') not like 'FEED_SUSPEITO%' then
      falhas := falhas + 1;
      raise warning 'FALHOU: lista de um carro só não barrou — veio %', s_erro_suspeito;
    end if;
  end if;

  -- ── 4. Nada da sonda sobrou ────────────────────────────────────────────────
  if exists (select 1 from public.estoque_motors where id = v_id or marca = 'AceiteDisponibilidade')
     or exists (select 1 from public.historico_veiculo where veiculo_id = v_id) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a sonda deixou linha no banco';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na reconciliação com o feed', falhas;
  end if;

  -- ── 5. A prévia do primeiro ciclo com p_gravar ─────────────────────────────
  -- Sem a lista do feed aqui, a prévia usa o que o banco sabe: quem ficou fora
  -- do último ciclo. Na primeira chamada de verdade, estes viram VENDIDO assim
  -- que completarem 24 horas fora.
  select string_agg(
           format('%s %s %s %s (fora há %s dias)', e.id, e.marca, e.modelo, e.ano,
                  floor(extract(epoch from (a.ancora - e.last_seen_at)) / 86400)),
           '; ' order by e.last_seen_at)
    into v_previa
    from public.estoque_motors e
    cross join (select max(last_seen_at) as ancora from public.estoque_motors) as a
   where e.origem = 'sync'
     and e.estado_cadastro = 'publicado'
     and coalesce(e.vendido, false) = false
     and e.last_seen_at < a.ancora - interval '30 minutes';

  raise notice 'Aceite verificado: ensaio não grava; service_role marca e escreve histórico; repetir não duplica; a volta ao feed desfaz só o que o sync marcou; venda de gente, carro do painel e veiculos_vendidos intocados; FEED_VAZIO e FEED_SUSPEITO barram. Fora do último ciclo, publicados à venda: %',
    coalesce(v_previa, 'nenhum');
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260916220000', 'disponibilidade_espelha_o_revendamais')
  on conflict (version) do nothing;
