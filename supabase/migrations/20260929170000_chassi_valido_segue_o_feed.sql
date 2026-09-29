-- ============================================================================
-- Chassi: só VIN sem I/O/Q, e o válido segue o feed — emenda à 20260929120000
-- ============================================================================
-- Achados da revisão da PR 85dyones/motors-site-oficial#174, sobre a migração
-- `20260929120000_documentos_do_feed_preenchem_o_vazio` (já aplicada):
--
-- 1. CHASSI ERRADO CONGELAVA. A regra "preenche o vazio, nunca troca" valia
--    para o chassi, e o chassi do carro do feed não tem outro autor: o painel
--    não o edita (não está em CAMPOS_NOSSOS nem em `camposGravaveis`), e a
--    venda da A19 corrige no formulário, não no estoque. Um chassi errado no
--    RevendaMais, uma vez gravado, só sairia por SQL — e a correção feita lá
--    nunca chegaria aqui. Caso real, medido em 29/09: a Spin 8446229 e o Logan
--    8506571 têm a letra O no lugar de zero no RevendaMais, e só não foram
--    gravados porque o preenchimento daquele dia os deixou de fora à mão.
--
--    Duas regras, juntas:
--    - Chassi com I, O ou Q NUNCA é gravado, venha de onde vier no feed. O
--      padrão VIN (ISO 3779) não usa essas três letras justamente por
--      confundirem com 1 e 0 — então elas no chassi são erro de digitação,
--      sempre. O Fusca 1976 (8310901, chassi de 8 posições, anterior ao VIN)
--      não tem nenhuma delas e continua valendo.
--    - O chassi VÁLIDO segue o feed, como a FIPE: é o RevendaMais que o tem, e é
--      lá que ele se corrige. Placa NÃO muda de regra: o painel a edita, e a
--      placa muda de verdade na vida do carro (a conversão para Mercosul).
--
-- 2. MOTOR "0.0". O feed diz "não sei o motor" com `0.0`, e só o nó do n8n o
--    filtrava. Um nó desatualizado gravaria "0.0", que a regra do vazio
--    congelaria e o JSON-LD publicaria como `engineType`. Agora o banco
--    recusa também — no preenchimento e no INSERT.
--
-- 3. A GUARDA DE COLISÃO DA TRAVA NÃO ERA ENSAIADA. No upsert, o
--    `marcar_origem` zera o documento alheio antes de a trava rodar, então a
--    autoconferência nunca chegava ao `not exists` da trava. Mas um UPDATE
--    direto (o preenchimento de 29/09 foi assim) só tem ela. Aqui ela é
--    ensaiada por UPDATE como `service_role`.
--
-- 4. AS BUSCAS DE COLISÃO NÃO USAVAM O ÍNDICE. `estoque_motors_placa_unica` e
--    `_chassi_unico` são parciais (`… is not null and btrim(…) <> ''`); sem o
--    mesmo predicado na consulta, o planejador não pode usá-los. Agora usa.
--
-- O resto da trava é o da `20260929120000`, inteiro: as seis colunas de sempre,
-- placa e motor preenchem o vazio, FIPE segue o feed quando tem valor, lastmod
-- só pelo motor (e por preço e opcionais). O ramo do carro nativo no INSERT não
-- muda — lá a duplicidade TEM de estourar.
-- ============================================================================


-- ----------------------------------------------------------
-- 1. A trava
-- ----------------------------------------------------------
create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
declare
  preco_mudou      boolean;
  opcionais_mudou  boolean;
  placa_do_feed    text;
  chassi_do_feed   text;
  motor_do_feed    text;
  motor_preenchido boolean := false;
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

    -- O que o feed mandou, já na forma canônica e sem o que é "não sei".
    -- Quando o upsert não manda a coluna, NEW repete OLD.
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

    -- Placa: o feed PREENCHE o vazio, nunca troca — o painel a edita. O
    -- documento de OUTRO carro não entra: estouraria o índice único e mataria
    -- o lote. O predicado da busca é o do índice parcial, para ele ser usado.
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

    -- Chassi: o VÁLIDO segue o feed — o painel não o edita, e é no RevendaMais
    -- que ele se corrige. Inválido ou ausente não apaga o que está lá.
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

    -- A FIPE segue o feed quando ele tem valor. Zero e vazio são como o feed
    -- diz "não sei": não apagam o que está lá.
    if new.valor_fipe > 0 then
      old.valor_fipe := new.valor_fipe;
    end if;

    if nullif(btrim(new.codigo_fipe), '') is not null then
      old.codigo_fipe := btrim(new.codigo_fipe);
    end if;

    -- `last_seen_at`, `portas`, placa, chassi e FIPE continuam FORA da conta:
    -- são passagem do robô, ficha técnica e dado interno. Preço, opcional e
    -- motor mudam o que a página diz ao comprador.
    if preco_mudou or opcionais_mudou or motor_preenchido then
      old.conteudo_atualizado_em := now();
    end if;

    return old;
  end if;

  if new.origem is distinct from old.origem then
    new.origem := old.origem;
  end if;

  return new;
end;
$$;

comment on function public.estoque_motors_trava_do_sync() is
  'O sync do RevendaMais manda em SEIS colunas — preco, preco_original, preco_promocional, last_seen_at, portas e opcionais —; atualiza valor_fipe e codigo_fipe quando manda valor (zero e vazio não apagam); o CHASSI segue o feed quando o do feed é válido (sem I, O nem Q — ISO 3779); e PREENCHE placa e motor só quando estão vazios (motor 0.0 é "não sei"). Nunca grava documento que já é de outro carro. Nenhuma outra coluna. Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio para não matar o lote do feed. Allowlist por construção. Move conteudo_atualizado_em (o lastmod) quando muda PREÇO ou OPCIONAIS ou quando preenche o MOTOR — nunca por last_seen_at, portas, placa, chassi ou FIPE.';


-- ----------------------------------------------------------
-- 2. O INSERT do feed
-- ----------------------------------------------------------
-- O da `20260929120000`, com as mesmas duas recusas da trava (chassi com
-- I/O/Q, motor 0.0) e o predicado do índice parcial nas buscas. No upsert do
-- PostgREST este gatilho roda antes do conflito, também para o carro que já
-- existe; o que ele deixa em NEW é o EXCLUDED do UPDATE.
create or replace function public.estoque_motors_marcar_origem()
returns trigger
language plpgsql
as $$
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
$$;


-- ==========================================================
-- Autoconferência
-- ==========================================================
-- O upsert REAL do PostgREST (`insert … on conflict (id) do update set col =
-- excluded.col`) e, onde só ela protege, o UPDATE direto como `service_role`.
-- Linhas de ensaio na faixa do feed, fora do estoque real, apagadas no fim. O
-- lastmod de ensaio nasce ONTEM: `now()` é constante na transação, e com o
-- default a checagem de "não moveu" não conseguiria falhar.
do $$
declare
  id_a    integer := 7000031;  -- carro do feed com chassi e placa
  id_b    integer := 7000032;  -- outro carro, dono dos documentos que colidem
  id_c    integer := 7000033;  -- importação nova com chassi inválido e motor 0.0
  id_d    integer := 7000034;  -- carro em branco
  ontem   timestamptz := now() - interval '1 day';
  depois  public.estoque_motors%rowtype;
  falhas  int := 0;
begin
  if exists (select 1 from public.estoque_motors where id in (id_a, id_b, id_c, id_d)) then
    raise exception 'AUTOCONFERÊNCIA: ids de ensaio já existem no estoque — escolha outros';
  end if;
  if exists (
    select 1 from public.estoque_motors
     where upper(replace(replace(btrim(placa), '-', ''), ' ', '')) in ('ZZA9Z31', 'ZZB9Z32', 'ZZC9Z33')
        or upper(replace(replace(btrim(chassi), '-', ''), ' ', ''))
           in ('9ZZZZZZZZZZ000031', '9ZZZZZZZZZZ000032', '9ZZZZZZZZZZ000033', 'BJ438831')
  ) then
    raise exception 'AUTOCONFERÊNCIA: documentos de ensaio já existem no estoque — escolha outros';
  end if;

  insert into public.estoque_motors (id, marca, modelo, preco, ano, placa, chassi, last_seen_at, conteudo_atualizado_em)
  values (id_a, 'AceiteChassi', 'ComDoc', 50000, 2022, 'ZZA9Z31', '9ZZZZZZZZZZ000031', now(), ontem);
  insert into public.estoque_motors (id, marca, modelo, preco, ano, placa, chassi, last_seen_at)
  values (id_b, 'AceiteChassi', 'Dono', 60000, 2021, 'ZZB9Z32', '9ZZZZZZZZZZ000032', now());
  insert into public.estoque_motors (id, marca, modelo, preco, ano, last_seen_at, conteudo_atualizado_em)
  values (id_d, 'AceiteChassi', 'Vazio', 40000, 2020, now(), ontem);

  -- 1. Chassi com O (o erro real do RevendaMais) não troca o chassi válido.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, chassi, last_seen_at)
  values (id_a, 'AceiteChassi', 'ComDoc', 50000, 2022, '9ZZZZZZZZZZOOOO31', clock_timestamp())
  on conflict (id) do update set chassi = excluded.chassi, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_a;
  if depois.chassi is distinct from '9ZZZZZZZZZZ000031' then
    falhas := falhas + 1;
    raise warning 'FALHA: chassi com O substituiu o válido (valor: %)', depois.chassi;
  end if;

  -- 2. Chassi VÁLIDO diferente segue o feed — a correção do RevendaMais chega.
  --    Placa diferente NÃO segue: o painel a edita. Nenhum dos dois move o lastmod.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, placa, chassi, last_seen_at)
  values (id_a, 'AceiteChassi', 'ComDoc', 50000, 2022, 'ZZC9Z33', '9zzzzzzzzzz000033', clock_timestamp())
  on conflict (id) do update set placa = excluded.placa, chassi = excluded.chassi, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_a;
  if depois.chassi is distinct from '9ZZZZZZZZZZ000033' then
    falhas := falhas + 1;
    raise warning 'FALHA: o chassi válido não seguiu o feed (valor: %)', depois.chassi;
  end if;
  if depois.placa is distinct from 'ZZA9Z31' then
    falhas := falhas + 1;
    raise warning 'FALHA: o feed trocou a placa existente (valor: %)', depois.placa;
  end if;
  if depois.conteudo_atualizado_em is distinct from ontem then
    falhas := falhas + 1;
    raise warning 'FALHA: chassi ou placa moveram o lastmod';
  end if;

  -- 3. Feed sem chassi não apaga o que está lá.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, chassi, last_seen_at)
  values (id_a, 'AceiteChassi', 'ComDoc', 50000, 2022, null, clock_timestamp())
  on conflict (id) do update set chassi = excluded.chassi, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_a;
  if depois.chassi is distinct from '9ZZZZZZZZZZ000033' then
    falhas := falhas + 1;
    raise warning 'FALHA: feed sem chassi apagou o chassi (valor: %)', depois.chassi;
  end if;

  -- 4. A guarda da PRÓPRIA trava, sem o marcar_origem na frente: UPDATE direto
  --    como service_role com documentos de outro carro — não grava, não estoura.
  set local role service_role;
  update public.estoque_motors set placa = 'zzb-9z32', chassi = '9ZZZZZZZZZZ000032' where id = id_d;
  reset role;
  select * into depois from public.estoque_motors where id = id_d;
  if depois.placa is not null or depois.chassi is not null then
    falhas := falhas + 1;
    raise warning 'FALHA: UPDATE direto herdou documento de outro carro (placa=%, chassi=%)', depois.placa, depois.chassi;
  end if;
  set local role service_role;
  update public.estoque_motors set chassi = '9ZZZZZZZZZZ000032' where id = id_a;
  reset role;
  select * into depois from public.estoque_motors where id = id_a;
  if depois.chassi is distinct from '9ZZZZZZZZZZ000033' then
    falhas := falhas + 1;
    raise warning 'FALHA: seguir o feed trouxe chassi de outro carro (valor: %)', depois.chassi;
  end if;

  -- 5. Motor 0.0 é "não sei": não preenche e não move o lastmod.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, motor, last_seen_at)
  values (id_d, 'AceiteChassi', 'Vazio', 40000, 2020, '0.0', clock_timestamp())
  on conflict (id) do update set motor = excluded.motor, last_seen_at = excluded.last_seen_at;
  set local role service_role;
  update public.estoque_motors set motor = '0.0' where id = id_d;
  reset role;
  select * into depois from public.estoque_motors where id = id_d;
  if depois.motor is not null then
    falhas := falhas + 1;
    raise warning 'FALHA: motor 0.0 foi gravado (valor: %)', depois.motor;
  end if;
  if depois.conteudo_atualizado_em is distinct from ontem then
    falhas := falhas + 1;
    raise warning 'FALHA: motor 0.0 moveu o lastmod';
  end if;

  -- 6. Importação nova com chassi inválido e motor 0.0: entra, sem os dois.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, placa, chassi, motor, last_seen_at)
  values (id_c, 'AceiteChassi', 'Novo', 45000, 2023, 'ZZC-9Z33', '9zzzzzzzzzzoooo33', '0.0', clock_timestamp())
  on conflict (id) do update set placa = excluded.placa, chassi = excluded.chassi, motor = excluded.motor,
    last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_c;
  if not found then
    falhas := falhas + 1;
    raise warning 'FALHA: a importação nova não entrou';
  elsif depois.chassi is not null or depois.motor is not null or depois.placa is distinct from 'ZZC9Z33'
        or depois.origem is distinct from 'sync' or depois.estado_cadastro is distinct from 'rascunho' then
    falhas := falhas + 1;
    raise warning 'FALHA: importação nova (placa=%, chassi=%, motor=%, origem=%, estado=%)',
      depois.placa, depois.chassi, depois.motor, depois.origem, depois.estado_cadastro;
  end if;

  -- 7. O Fusca continua: chassi antigo, curto, sem I/O/Q, entra.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, chassi, last_seen_at)
  values (id_d, 'AceiteChassi', 'Vazio', 40000, 2020, 'bj438831', clock_timestamp())
  on conflict (id) do update set chassi = excluded.chassi, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_d;
  if depois.chassi is distinct from 'BJ438831' then
    falhas := falhas + 1;
    raise warning 'FALHA: chassi antigo sem I/O/Q não entrou (valor: %)', depois.chassi;
  end if;

  delete from public.estoque_motors where id in (id_a, id_b, id_c, id_d);

  if falhas = 0 then
    raise notice 'Autoconferência OK: chassi com I/O/Q nunca entra; o válido segue o feed sem trazer documento alheio; placa e motor só preenchem o vazio; motor 0.0 é "não sei"; a guarda da trava vale no UPDATE direto.';
  else
    raise exception 'Autoconferência falhou em % ponto(s).', falhas;
  end if;
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260929170000', 'chassi_valido_segue_o_feed')
  on conflict (version) do nothing;
