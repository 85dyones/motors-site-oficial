-- ============================================================================
-- Documentos do feed — placa, chassi, motor e FIPE chegam ao cadastro interno
-- ============================================================================
-- Queixa do dono em 2026-09-29:
--
--   "o sistema não está trazendo informações da ficha do veículo para o
--    cadastro interno, dados que constam no revenda como placa, chassis e
--    outros campos do veículo chegam em branco"
--
-- Medido no mesmo dia, feed contra banco: dos 44 carros do feed que existem em
-- `estoque_motors`, 23 estão sem placa e 23 sem chassi — e o RevendaMais tem os
-- dois para todos eles. O feed traz PLATE em 45/45, CHASSI em 42/45, MOTOR em
-- 45/45, FIPE em 43/45 e VALOR_FIPE em 45/45. Onde os dois lados têm valor, eles
-- batem (0 divergências), e nenhum documento do feed pertence a outro carro.
--
-- ---------------------------------------------------------------------------
-- Por que o dado morria, e por que em DOIS lugares
-- ---------------------------------------------------------------------------
-- 1. O n8n. O nó "Classificação e Regras de Negócio" monta `placa`, `chassi`,
--    `motor`, `valor_fipe` e `codigo_fipe` desde 17/08 — mas o corpo do
--    "Upsert Veículo (HTTP)" nunca os nomeou. O dado chegava e morria no
--    mapeamento. `docs/levantamento-atual.md` registrou isso em 01/09 ("são três
--    linhas no n8n, não uma migração") e ficou por fazer.
--
-- 2. Esta trava. Três linhas no n8n resolveriam só o carro NOVO: o INSERT não
--    passa por aqui. O carro que já está no banco — os 23 — recebe o upsert
--    como UPDATE, e `estoque_motors_trava_do_sync` é allowlist por construção:
--    parte de OLD e copia só o permitido. Documento não estava na lista, e seria
--    descartado em silêncio a cada importação, para sempre. Sem esta migração,
--    o conserto do n8n é trabalho que parece feito — o mesmo recado que a
--    `20260908160000` deixou sobre os opcionais.
--
-- ---------------------------------------------------------------------------
-- A regra: placa, chassi e motor o feed PREENCHE o vazio, nunca TROCA
-- ---------------------------------------------------------------------------
-- Opcional e preço o feed sobrescreve (decisões de 02/09 e 08/09). Estes três
-- não, e por três motivos:
--
-- - "sem override" (30/08) continua valendo para o que a loja escreveu.
--   `placa` e `motor` são campos da ficha própria do painel (CAMPOS_NOSSOS,
--   20260807160000): quem corrigiu uma placa no painel não pode vê-la desfeita
--   pela próxima importação.
-- - Placa e chassi não mudam na vida do carro. Se o banco já tem um, ou é o
--   mesmo do feed (medido: 0 divergências), ou alguém o corrigiu à mão — e nos
--   dois casos o certo é ficar como está.
-- - Vazio é o único estado em que não há decisão de ninguém a proteger.
--
-- Efeito conhecido: se o painel APAGAR a placa, o próximo ciclo a traz de volta
-- do RevendaMais. Vazio, para esta regra, é "o feed pode preencher".
--
-- ---------------------------------------------------------------------------
-- A FIPE é outra coisa: ela SEGUE o feed, sempre que o feed tem valor
-- ---------------------------------------------------------------------------
-- `valor_fipe` e `codigo_fipe` não são da loja — o painel não os edita (não
-- estão em CAMPOS_NOSSOS nem em `camposGravaveis`), e o RevendaMais é a única
-- fonte. E o valor muda todo mês: preenchido uma vez e congelado, ele viraria a
-- FIPE de setembro para sempre, e um valor errado só sairia por SQL. Então o
-- feed atualiza os dois a cada ciclo — mas só quando MANDA valor: o `0` e o
-- vazio com que o feed diz "não sei" nunca apagam o que já está lá.
--
-- ---------------------------------------------------------------------------
-- A guarda de duplicidade não pode matar o lote
-- ---------------------------------------------------------------------------
-- `estoque_motors_placa_unica` e `estoque_motors_chassi_unico` (f0o) barram o
-- mesmo documento em dois carros. Com o upsert passando a mandar documento, um
-- carro do feed cujo documento já pertence a OUTRA linha — o mesmo carro
-- cadastrado no painel durante a convivência, ou reanunciado no RevendaMais com
-- id novo — estouraria `unique_violation`. O nó HTTP falharia, o n8n pararia, e
-- a reconciliação da disponibilidade (que roda depois do upsert) não rodaria.
--
-- Mesma decisão da trava desde a f0k: ignorar em silêncio, não estourar. O
-- documento que colide não é gravado; o resto do carro segue. Nos dois caminhos:
-- no INSERT (`estoque_motors_marcar_origem`) e no preenchimento (a trava).
--
-- A forma gravada é a CANÔNICA — caixa alta, sem hífen nem espaço —, a mesma
-- dos índices únicos e de `cadastrar_veiculo_nativo`. O feed manda a placa em
-- minúsculas; sem isso, `abc1d23` e `ABC1D23` seriam dois carros para o resto
-- do sistema.
--
-- ---------------------------------------------------------------------------
-- O que NÃO muda
-- ---------------------------------------------------------------------------
-- - `conteudo_atualizado_em` (o lastmod) não se move por placa, chassi nem
--   FIPE: são internos, não saem na página. O MOTOR move — ele está na lista de
--   conteúdo de `marcar_conteudo_atualizado` (20260817120000) e sai no JSON-LD
--   público (`vehicleEngine`). É a mesma conta que a `20260908160000` fez para
--   os opcionais: a página mudou, o recrawl é desejado. Aqui ele é explícito
--   porque a trava devolve OLD e descartaria o carimbo daquele gatilho.
-- - `renavam`: o feed não tem a tag. Continua sendo campo do painel.
-- - O carro nativo (id ≥ 900000001): o ramo dele no INSERT fica como está — lá
--   a colisão DEVE estourar, porque é a guarda de duplicidade do cadastro.
-- - Tudo o mais que a trava barrava continua barrado.
-- ============================================================================


-- ----------------------------------------------------------
-- 1. A trava ganha o preenchimento do vazio
-- ----------------------------------------------------------
-- Parte da versão viva (`20260908160000`), inteira. O bloco novo vem depois das
-- seis colunas que o sync já escrevia.
create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
declare
  preco_mudou     boolean;
  opcionais_mudou boolean;
  placa_do_feed    text;
  chassi_do_feed   text;
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

    -- Documentos e ficha interna: o feed PREENCHE o vazio, nunca troca o que
    -- existe. Quando o upsert não manda a coluna, NEW repete OLD — e vazio com
    -- vazio não preenche nada.
    placa_do_feed  := nullif(upper(replace(replace(btrim(new.placa),  '-', ''), ' ', '')), '');
    chassi_do_feed := nullif(upper(replace(replace(btrim(new.chassi), '-', ''), ' ', '')), '');

    -- O documento que já é de OUTRO carro não entra: estouraria o índice único
    -- e mataria o lote do feed. Mesma expressão dos índices da f0o.
    if nullif(btrim(old.placa), '') is null
       and placa_do_feed is not null
       and not exists (
         select 1 from public.estoque_motors o
          where o.id <> old.id
            and upper(replace(replace(btrim(o.placa), '-', ''), ' ', '')) = placa_do_feed
       ) then
      old.placa := placa_do_feed;
    end if;

    if nullif(btrim(old.chassi), '') is null
       and chassi_do_feed is not null
       and not exists (
         select 1 from public.estoque_motors o
          where o.id <> old.id
            and upper(replace(replace(btrim(o.chassi), '-', ''), ' ', '')) = chassi_do_feed
       ) then
      old.chassi := chassi_do_feed;
    end if;

    if nullif(btrim(old.motor), '') is null and nullif(btrim(new.motor), '') is not null then
      old.motor := btrim(new.motor);
      motor_preenchido := true;
    end if;

    -- A FIPE segue o feed quando ele tem valor. Zero e vazio são como o feed
    -- diz "não sei" — o nó do n8n já os converte em nulo, e aqui a mesma régua
    -- vale para quem escrever direto: não apagam o que está lá.
    if new.valor_fipe > 0 then
      old.valor_fipe := new.valor_fipe;
    end if;

    if nullif(btrim(new.codigo_fipe), '') is not null then
      old.codigo_fipe := btrim(new.codigo_fipe);
    end if;

    -- `last_seen_at`, `portas`, placa, chassi e FIPE continuam FORA da conta:
    -- passar o robô, corrigir ficha técnica e completar dado interno não são
    -- motivo de pedir recrawl. Preço, opcional e motor são — os três mudam o
    -- que a página diz ao comprador.
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
  'O sync do RevendaMais manda em SEIS colunas — preco, preco_original, preco_promocional, last_seen_at, portas e opcionais —, atualiza valor_fipe e codigo_fipe quando manda valor (zero e vazio não apagam), e PREENCHE placa, chassi e motor só quando estão vazios (nunca troca valor existente, nunca grava documento que já é de outro carro). Nenhuma outra. Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio para não matar o lote do feed. Allowlist por construção. Move conteudo_atualizado_em (o lastmod) quando muda PREÇO ou OPCIONAIS ou quando preenche o MOTOR — nunca por last_seen_at, portas, placa, chassi ou FIPE.';


-- ----------------------------------------------------------
-- 2. O INSERT do feed: forma canônica, e colisão vira vazio
-- ----------------------------------------------------------
-- Parte da versão viva (`20260830120000`, f0q). Muda só o ramo do feed.
--
-- ⚠️ No upsert do PostgREST (`INSERT … ON CONFLICT (id) DO UPDATE`) este
-- gatilho roda ANTES da checagem de conflito — também para o carro que já
-- existe —, e o que ele deixar em NEW é o que o UPDATE recebe como EXCLUDED.
-- Por isso a busca de colisão exclui a própria linha (`o.id is distinct from
-- new.id`): sem isso, o carro que já tem a placa colidiria consigo mesmo.
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

    -- Documento que já é de outro carro não derruba a importação: o carro entra
    -- sem ele, em rascunho, e a revisão no painel é quem decide o que fazer.
    if new.placa is not null and exists (
      select 1 from public.estoque_motors o
       where o.id is distinct from new.id
         and upper(replace(replace(btrim(o.placa), '-', ''), ' ', '')) = new.placa
    ) then
      raise notice 'Carro % do feed: a placa pertence a outro carro — não gravada.', new.id;
      new.placa := null;
    end if;

    if new.chassi is not null and exists (
      select 1 from public.estoque_motors o
       where o.id is distinct from new.id
         and upper(replace(replace(btrim(o.chassi), '-', ''), ' ', '')) = new.chassi
    ) then
      raise notice 'Carro % do feed: o chassi pertence a outro carro — não gravado.', new.id;
      new.chassi := null;
    end if;
  end if;

  -- Carro novo nasce rascunho, venha de onde vier. Publicar é ATO de quem
  -- publica (linha "Publicar ou despublicar veículo" da A17) — nunca efeito
  -- colateral de uma importação. Aceitar `estado_cadastro` do payload deixaria
  -- o robô publicar sozinho, que é o que a decisão de 2026-08-30 desfez.
  new.estado_cadastro := 'rascunho';

  return new;
end;
$$;


-- ==========================================================
-- Autoconferência
-- ==========================================================
-- Ensaia o upsert REAL do PostgREST (`insert … on conflict (id) do update set
-- col = excluded.col`), que é o que o n8n dispara: os dois gatilhos juntos,
-- na ordem em que o banco os roda. Linhas de ensaio na faixa do feed, fora do
-- estoque real, apagadas no fim.
--
-- ⚠️ O lastmod de ensaio nasce ONTEM, e não no default. `now()` é o instante da
-- transação: com o default, o carimbo da linha e o de qualquer movimento seriam
-- o MESMO valor, e a checagem de "não moveu" passaria sempre. A primeira versão
-- desta autoconferência tinha exatamente esse ponto cego — a revisão provou
-- que um mutante que movia o lastmod por placa passava por ela.
do $$
declare
  id_a     integer := 7000021;  -- carro do feed já no banco, documentos em branco
  id_b     integer := 7000022;  -- outro carro, dono dos documentos que colidem
  id_c     integer := 7000023;  -- importação nova que chega com documento alheio
  id_d     integer := 7000024;  -- carro em branco que tenta herdar documento alheio
  ontem    timestamptz := now() - interval '1 day';
  antes    public.estoque_motors%rowtype;
  depois   public.estoque_motors%rowtype;
  falhas   int := 0;
begin
  if exists (select 1 from public.estoque_motors where id in (id_a, id_b, id_c, id_d)) then
    raise exception 'AUTOCONFERÊNCIA: ids de ensaio já existem no estoque — escolha outros';
  end if;
  if exists (
    select 1 from public.estoque_motors
     where upper(replace(replace(btrim(placa), '-', ''), ' ', '')) in ('ZZA9Z91', 'ZZB9Z92', 'ZZC9Z93')
        or upper(replace(replace(btrim(chassi), '-', ''), ' ', '')) in ('9ZZZZZZZZZZ000091', '9ZZZZZZZZZZ000092')
  ) then
    raise exception 'AUTOCONFERÊNCIA: documentos de ensaio já existem no estoque — escolha outros';
  end if;

  -- O carro antigo do feed: importado quando o upsert ainda não mandava
  -- documento. O motor a loja já tinha digitado no painel.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, motor, descricao, last_seen_at, conteudo_atualizado_em)
  values (id_a, 'AceiteDoc', 'Antigo', 50000, 2022, '1.6', 'descrição da loja', now(), ontem);
  -- O dono dos documentos da colisão.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, placa, chassi, last_seen_at)
  values (id_b, 'AceiteDoc', 'Dono', 60000, 2021, 'ZZB9Z92', '9ZZZZZZZZZZ000092', now());
  insert into public.estoque_motors (id, marca, modelo, preco, ano, last_seen_at, conteudo_atualizado_em)
  values (id_d, 'AceiteDoc', 'Vazio', 40000, 2020, now(), ontem);

  select * into antes from public.estoque_motors where id = id_a;
  if antes.conteudo_atualizado_em is distinct from ontem then
    raise exception 'AUTOCONFERÊNCIA: o lastmod de ensaio não nasceu ontem — as checagens de carimbo ficariam cegas';
  end if;

  -- 1. O upsert do feed PREENCHE o vazio, na forma canônica, e não troca o
  --    motor que a loja digitou. `clock_timestamp()`: `now()` repetiria o
  --    carimbo do insert acima e o gatilho não reconheceria o sync.
  insert into public.estoque_motors
    (id, marca, modelo, preco, ano, placa, chassi, motor, valor_fipe, codigo_fipe, descricao, last_seen_at)
  values
    (id_a, 'AceiteDoc', 'Antigo', 50000, 2022, 'zza-9z91', ' 9zzzzzzzzzz000091 ', '1.0', 55000, '005340-6',
     'DESCRIÇÃO DO FEED — NÃO DEVE PASSAR', clock_timestamp())
  on conflict (id) do update set
    placa = excluded.placa, chassi = excluded.chassi, motor = excluded.motor,
    valor_fipe = excluded.valor_fipe, codigo_fipe = excluded.codigo_fipe,
    descricao = excluded.descricao, last_seen_at = excluded.last_seen_at;

  select * into depois from public.estoque_motors where id = id_a;
  if depois.placa is distinct from 'ZZA9Z91' then
    falhas := falhas + 1;
    raise warning 'FALHA: placa não preenchida na forma canônica (valor: %)', depois.placa;
  end if;
  if depois.chassi is distinct from '9ZZZZZZZZZZ000091' then
    falhas := falhas + 1;
    raise warning 'FALHA: chassi não preenchido na forma canônica (valor: %)', depois.chassi;
  end if;
  if depois.motor is distinct from '1.6' then
    falhas := falhas + 1;
    raise warning 'FALHA: o feed trocou o motor que a loja digitou (valor: %)', depois.motor;
  end if;
  if depois.valor_fipe is distinct from 55000::numeric or depois.codigo_fipe is distinct from '005340-6' then
    falhas := falhas + 1;
    raise warning 'FALHA: FIPE não preenchida (% / %)', depois.valor_fipe, depois.codigo_fipe;
  end if;
  if depois.descricao is distinct from antes.descricao then
    falhas := falhas + 1;
    raise warning 'FALHA: `descricao` passou pela trava e não deveria';
  end if;
  if depois.conteudo_atualizado_em is distinct from ontem then
    falhas := falhas + 1;
    raise warning 'FALHA: placa, chassi ou FIPE moveram o carimbo de conteúdo (lastmod)';
  end if;

  -- 2. Placa, chassi e motor o feed NÃO TROCA; a FIPE ele atualiza.
  insert into public.estoque_motors
    (id, marca, modelo, preco, ano, placa, chassi, motor, valor_fipe, codigo_fipe, last_seen_at)
  values
    (id_a, 'AceiteDoc', 'Antigo', 50000, 2022, 'ZZC9Z93', '9ZZZZZZZZZZ000093', '2.0', 99000, '999999-9', clock_timestamp())
  on conflict (id) do update set
    placa = excluded.placa, chassi = excluded.chassi, motor = excluded.motor,
    valor_fipe = excluded.valor_fipe, codigo_fipe = excluded.codigo_fipe,
    last_seen_at = excluded.last_seen_at;

  select * into depois from public.estoque_motors where id = id_a;
  if depois.placa is distinct from 'ZZA9Z91' or depois.chassi is distinct from '9ZZZZZZZZZZ000091'
     or depois.motor is distinct from '1.6' then
    falhas := falhas + 1;
    raise warning 'FALHA: o feed sobrescreveu documento existente (placa=%, chassi=%, motor=%)',
      depois.placa, depois.chassi, depois.motor;
  end if;
  if depois.valor_fipe is distinct from 99000::numeric or depois.codigo_fipe is distinct from '999999-9' then
    falhas := falhas + 1;
    raise warning 'FALHA: a FIPE não seguiu o feed (% / %)', depois.valor_fipe, depois.codigo_fipe;
  end if;
  if depois.conteudo_atualizado_em is distinct from ontem then
    falhas := falhas + 1;
    raise warning 'FALHA: atualizar a FIPE moveu o lastmod';
  end if;

  -- 2b. O "não sei" do feed (zero, vazio) não apaga a FIPE.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, valor_fipe, codigo_fipe, last_seen_at)
  values (id_a, 'AceiteDoc', 'Antigo', 50000, 2022, 0, '', clock_timestamp())
  on conflict (id) do update set
    valor_fipe = excluded.valor_fipe, codigo_fipe = excluded.codigo_fipe, last_seen_at = excluded.last_seen_at;

  select * into depois from public.estoque_motors where id = id_a;
  if depois.valor_fipe is distinct from 99000::numeric or depois.codigo_fipe is distinct from '999999-9' then
    falhas := falhas + 1;
    raise warning 'FALHA: o zero/vazio do feed apagou a FIPE (% / %)', depois.valor_fipe, depois.codigo_fipe;
  end if;

  -- 3. O painel continua editando a placa (sem carimbo, sem service_role).
  update public.estoque_motors set placa = 'ZZC9Z93' where id = id_a;
  select * into depois from public.estoque_motors where id = id_a;
  if depois.placa is distinct from 'ZZC9Z93' then
    falhas := falhas + 1;
    raise warning 'FALHA: o painel não conseguiu corrigir a placa (valor: %)', depois.placa;
  end if;

  -- 4. Preencher com documento de OUTRO carro: não grava, e não estoura.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, placa, chassi, last_seen_at)
  values (id_d, 'AceiteDoc', 'Vazio', 40000, 2020, 'zzb9z92', '9zzzzzzzzzz000092', clock_timestamp())
  on conflict (id) do update set
    placa = excluded.placa, chassi = excluded.chassi, last_seen_at = excluded.last_seen_at;

  select * into depois from public.estoque_motors where id = id_d;
  if depois.placa is not null or depois.chassi is not null then
    falhas := falhas + 1;
    raise warning 'FALHA: carro herdou documento de outro (placa=%, chassi=%)', depois.placa, depois.chassi;
  end if;

  -- 4b. Motor preenchido muda a página (JSON-LD): o lastmod SE MOVE.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, motor, last_seen_at)
  values (id_d, 'AceiteDoc', 'Vazio', 40000, 2020, '1.0', clock_timestamp())
  on conflict (id) do update set
    motor = excluded.motor, last_seen_at = excluded.last_seen_at;

  select * into depois from public.estoque_motors where id = id_d;
  if depois.motor is distinct from '1.0' then
    falhas := falhas + 1;
    raise warning 'FALHA: motor vazio não foi preenchido (valor: %)', depois.motor;
  end if;
  if depois.conteudo_atualizado_em is not distinct from ontem then
    falhas := falhas + 1;
    raise warning 'FALHA: preencher o motor não moveu o lastmod';
  end if;

  -- 5. Importação NOVA com documento de outro carro: entra, sem ele, e não estoura.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, placa, chassi, last_seen_at)
  values (id_c, 'AceiteDoc', 'Novo', 45000, 2023, 'ZZB-9Z92', '9ZZZZZZZZZZ000092', clock_timestamp())
  on conflict (id) do update set
    placa = excluded.placa, chassi = excluded.chassi, last_seen_at = excluded.last_seen_at;

  select * into depois from public.estoque_motors where id = id_c;
  if not found then
    falhas := falhas + 1;
    raise warning 'FALHA: a importação nova com documento alheio não entrou';
  elsif depois.placa is not null or depois.chassi is not null
        or depois.origem is distinct from 'sync' or depois.estado_cadastro is distinct from 'rascunho' then
    falhas := falhas + 1;
    raise warning 'FALHA: importação nova (placa=%, chassi=%, origem=%, estado=%)',
      depois.placa, depois.chassi, depois.origem, depois.estado_cadastro;
  end if;

  -- 6. O carro que já tem o documento não colide consigo mesmo ao ser reimportado.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, placa, chassi, last_seen_at)
  values (id_b, 'AceiteDoc', 'Dono', 60000, 2021, 'zzb9z92', '9zzzzzzzzzz000092', clock_timestamp())
  on conflict (id) do update set
    placa = excluded.placa, chassi = excluded.chassi, last_seen_at = excluded.last_seen_at;

  select * into depois from public.estoque_motors where id = id_b;
  if depois.placa is distinct from 'ZZB9Z92' or depois.chassi is distinct from '9ZZZZZZZZZZ000092' then
    falhas := falhas + 1;
    raise warning 'FALHA: reimportar o dono do documento o apagou (placa=%, chassi=%)', depois.placa, depois.chassi;
  end if;

  delete from public.estoque_motors where id in (id_a, id_b, id_c, id_d);

  if falhas = 0 then
    raise notice 'Autoconferência OK: placa, chassi e motor preenchem o vazio sem trocar o que existe; a FIPE segue o feed sem ser apagada pelo "não sei"; documento alheio não entra nem estoura o lote; o lastmod só se move pelo motor.';
  else
    raise exception 'Autoconferência falhou em % ponto(s).', falhas;
  end if;
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260929120000', 'documentos_do_feed_preenchem_o_vazio')
  on conflict (version) do nothing;
