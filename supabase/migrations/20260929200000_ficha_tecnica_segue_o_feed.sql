-- ============================================================================
-- Ficha técnica segue o feed — km, ano, cor, câmbio e combustível do RevendaMais
-- ============================================================================
-- Queixa do dono em 2026-09-29:
--
--   "alterei a quilometragem de um veículo no revenda, mas ele não alterou no
--    site, preciso que tudo seja conferido no sync, os ajustes estão no revenda"
--
-- E as três decisões, perguntadas no mesmo dia:
--   1. o sync traz a ficha técnica do RevendaMais a cada ciclo (e não o painel
--      ganhando campo de km);
--   2. modelo e versão NÃO — mudar o nome muda título e URL da ficha, e o painel
--      já tem `modelo_override`/`versao_override` para corrigir sem mexer nela;
--   3. o km vem como estiver lá, e é publicado — "deixe um alerta em casos
--      discrepantes, mas publique". O caso que motivou: a Spin 8446229 (2014)
--      está com km = 1 no RevendaMais e 186.600 no site.
--
-- ---------------------------------------------------------------------------
-- Por que o km não mudava
-- ---------------------------------------------------------------------------
-- O n8n SEMPRE mandou marca, modelo, versão, ano, ano de fabricação, km,
-- câmbio, combustível e cor no upsert. Quem descartava era a trava: desde a
-- f0q (30/08, "sem override") ela devolve a linha antiga e só copia a allowlist
-- — preço (02/09), portas (04/09), opcionais (08/09) e os documentos (29/09).
-- A ficha técnica nunca entrou. Por isso esta correção é só no banco: o
-- workflow vivo já manda os campos, sem precisar reimportar nada.
--
-- ---------------------------------------------------------------------------
-- A regra
-- ---------------------------------------------------------------------------
-- - `quilometragem`, `ano`, `ano_fabricacao`, `cambio`, `combustivel` e `cor`
--   SEGUEM o feed, como o preço.
-- - O "não sei" do nó do n8n nunca apaga o que está lá: ele manda `N/D` para
--   texto ausente e `0` para número ausente (`parseInt(x || 0)`). Ano fora de
--   1900–2100 é o mesmo "não sei". E km 0 também: o nó não distingue tag
--   ausente de zero, e um feed que um dia viesse sem MILEAGE zeraria o km do
--   site inteiro. Carro de seminovos indo a 0 km pelo sync não é caso real.
-- - Toda mudança fica no `historico_veiculo`, campo a campo, assinada
--   "RevendaMais (sync)" — a mesma assinatura da reconciliação da
--   disponibilidade (20260916220000). É o que torna o sync CONFERÍVEL: o que ele
--   trocou, de quê para quê, e quando. E é de onde o alerta de km do painel
--   (`lib/kmDiscrepante.ts`) lê a queda de quilometragem.
-- - Move o lastmod: km, ano, cor, câmbio e combustível estão na lista de
--   conteúdo de `marcar_conteudo_atualizado` (20260817120000) — a página mudou.
--
-- O que NÃO muda: marca, modelo e versão continuam barrados (decisão 2 acima;
-- `marca` vai junto porque também está no título e na URL). Descrição, fotos,
-- laudo, perícia e o que mais o painel escreve, idem. O resto da trava é o da
-- `20260929170000`, inteiro.
-- ============================================================================

create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
declare
  preco_mudou      boolean;
  opcionais_mudou  boolean;
  ficha_mudou      boolean := false;
  placa_do_feed    text;
  chassi_do_feed   text;
  motor_do_feed    text;
  motor_preenchido boolean := false;
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
    -- Ficha técnica: segue o feed, e cada troca vai para o histórico.
    -- ------------------------------------------------------------------
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

    if nullif(btrim(new.cambio), '') is not null and upper(btrim(new.cambio)) <> 'N/D'
       and new.cambio is distinct from old.cambio then
      insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
      values (old.id, 'cambio', old.cambio, new.cambio, null, c_autor, clock_timestamp());
      old.cambio := new.cambio;
      ficha_mudou := true;
    end if;

    if nullif(btrim(new.combustivel), '') is not null and upper(btrim(new.combustivel)) <> 'N/D'
       and new.combustivel is distinct from old.combustivel then
      insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
      values (old.id, 'combustivel', old.combustivel, new.combustivel, null, c_autor, clock_timestamp());
      old.combustivel := new.combustivel;
      ficha_mudou := true;
    end if;

    if nullif(btrim(new.cor), '') is not null and upper(btrim(new.cor)) <> 'N/D'
       and new.cor is distinct from old.cor then
      insert into public.historico_veiculo (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
      values (old.id, 'cor', old.cor, new.cor, null, c_autor, clock_timestamp());
      old.cor := new.cor;
      ficha_mudou := true;
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
$$;

comment on function public.estoque_motors_trava_do_sync() is
  'O sync do RevendaMais manda em SEIS colunas — preco, preco_original, preco_promocional, last_seen_at, portas e opcionais —; a FICHA TÉCNICA (quilometragem, ano, ano_fabricacao, cambio, combustivel, cor) segue o feed, registrando cada troca no historico_veiculo como "RevendaMais (sync)" (N/D, ano fora de 1900–2100 e km 0 são "não sei" e não apagam nada); atualiza valor_fipe e codigo_fipe quando manda valor; o CHASSI segue o feed quando é válido (sem I, O nem Q); e PREENCHE placa e motor só quando estão vazios. Marca, modelo e versão continuam barrados (título e URL). Nunca grava documento que já é de outro carro. Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio. Allowlist por construção. Move conteudo_atualizado_em quando muda PREÇO, OPCIONAIS ou a FICHA TÉCNICA, ou quando preenche o MOTOR.';


-- ==========================================================
-- Autoconferência
-- ==========================================================
-- O upsert REAL do PostgREST (`insert … on conflict (id) do update set col =
-- excluded.col`), que é o que o n8n dispara. Linha de ensaio na faixa do feed,
-- apagada no fim junto com o histórico que ela gerou. O lastmod nasce ONTEM:
-- `now()` é constante na transação, e com o default "moveu" e "não moveu"
-- dariam o mesmo valor.
do $$
declare
  id_a    integer := 7000041;
  ontem   timestamptz := now() - interval '1 day';
  depois  public.estoque_motors%rowtype;
  n       int;
  falhas  int := 0;
begin
  if exists (select 1 from public.estoque_motors where id = id_a)
     or exists (select 1 from public.historico_veiculo where veiculo_id = id_a) then
    raise exception 'AUTOCONFERÊNCIA: id de ensaio % já existe — escolha outro', id_a;
  end if;

  insert into public.estoque_motors
    (id, marca, modelo, versao, preco, ano, ano_fabricacao, quilometragem, cambio, combustivel, cor,
     last_seen_at, conteudo_atualizado_em)
  values
    (id_a, 'aceiteficha', 'modelo antigo', 'versao antiga', 50000, 2014, 2014, 186600, 'automatico', 'flex', 'cinza',
     now(), ontem);

  -- 1. O km que o dono mudou no RevendaMais chega — mesmo o discrepante — e
  --    fica no histórico. Modelo e versão, não.
  insert into public.estoque_motors (id, marca, modelo, versao, preco, ano, quilometragem, last_seen_at)
  values (id_a, 'aceiteficha', 'modelo novo', 'versao nova', 50000, 2014, 1, clock_timestamp())
  on conflict (id) do update set modelo = excluded.modelo, versao = excluded.versao,
    quilometragem = excluded.quilometragem, last_seen_at = excluded.last_seen_at;

  select * into depois from public.estoque_motors where id = id_a;
  if depois.quilometragem is distinct from 1 then
    falhas := falhas + 1;
    raise warning 'FALHA: o km do feed não chegou (valor: %)', depois.quilometragem;
  end if;
  if depois.modelo is distinct from 'modelo antigo' or depois.versao is distinct from 'versao antiga' then
    falhas := falhas + 1;
    raise warning 'FALHA: modelo/versão passaram pela trava (%, %)', depois.modelo, depois.versao;
  end if;
  if depois.conteudo_atualizado_em is not distinct from ontem then
    falhas := falhas + 1;
    raise warning 'FALHA: mudar o km não moveu o lastmod';
  end if;
  select count(*) into n from public.historico_veiculo
   where veiculo_id = id_a and campo = 'quilometragem' and valor_anterior = '186600'
     and valor_novo = '1' and autor_nome = 'RevendaMais (sync)';
  if n <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHA: a troca de km não foi para o histórico (% linhas)', n;
  end if;

  -- 2. O mesmo km de novo: nada muda, nada vai para o histórico.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, quilometragem, last_seen_at)
  values (id_a, 'aceiteficha', 'modelo novo', 50000, 2014, 1, clock_timestamp())
  on conflict (id) do update set quilometragem = excluded.quilometragem, last_seen_at = excluded.last_seen_at;
  select count(*) into n from public.historico_veiculo where veiculo_id = id_a;
  if n <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHA: reimportar o mesmo km gerou histórico (% linhas)', n;
  end if;

  -- 3. O "não sei" do nó do n8n não apaga nada: N/D, ano 0, km 0.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, ano_fabricacao, quilometragem, cambio, combustivel, cor, last_seen_at)
  values (id_a, 'aceiteficha', 'modelo novo', 50000, 0, 0, 0, 'N/D', 'N/D', 'N/D', clock_timestamp())
  on conflict (id) do update set ano = excluded.ano, ano_fabricacao = excluded.ano_fabricacao,
    quilometragem = excluded.quilometragem, cambio = excluded.cambio, combustivel = excluded.combustivel,
    cor = excluded.cor, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_a;
  if depois.ano is distinct from 2014 or depois.ano_fabricacao is distinct from 2014 or depois.quilometragem is distinct from 1
     or depois.cambio is distinct from 'automatico' or depois.combustivel is distinct from 'flex' or depois.cor is distinct from 'cinza' then
    falhas := falhas + 1;
    raise warning 'FALHA: o "não sei" do feed apagou a ficha (ano=%, fab=%, km=%, câmbio=%, comb=%, cor=%)',
      depois.ano, depois.ano_fabricacao, depois.quilometragem, depois.cambio, depois.combustivel, depois.cor;
  end if;

  -- 4. O resto da ficha técnica segue o feed, e cada campo tem sua linha.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, ano_fabricacao, cambio, combustivel, cor, last_seen_at)
  values (id_a, 'aceiteficha', 'modelo novo', 50000, 2015, 2014, 'manual', 'gasolina', 'prata', clock_timestamp())
  on conflict (id) do update set ano = excluded.ano, ano_fabricacao = excluded.ano_fabricacao,
    cambio = excluded.cambio, combustivel = excluded.combustivel, cor = excluded.cor, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_a;
  if depois.ano is distinct from 2015 or depois.cambio is distinct from 'manual'
     or depois.combustivel is distinct from 'gasolina' or depois.cor is distinct from 'prata' then
    falhas := falhas + 1;
    raise warning 'FALHA: a ficha técnica não seguiu o feed (ano=%, câmbio=%, comb=%, cor=%)',
      depois.ano, depois.cambio, depois.combustivel, depois.cor;
  end if;
  select count(*) into n from public.historico_veiculo
   where veiculo_id = id_a and campo in ('ano', 'cambio', 'combustivel', 'cor') and autor_nome = 'RevendaMais (sync)';
  if n <> 4 then
    falhas := falhas + 1;
    raise warning 'FALHA: esperava 4 linhas de histórico da ficha, achei %', n;
  end if;

  -- 5. O UPDATE direto como service_role também registra.
  set local role service_role;
  update public.estoque_motors set quilometragem = 186600 where id = id_a;
  reset role;
  select count(*) into n from public.historico_veiculo
   where veiculo_id = id_a and campo = 'quilometragem' and valor_novo = '186600';
  if n <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHA: UPDATE direto do sync não registrou o km (% linhas)', n;
  end if;

  delete from public.historico_veiculo where veiculo_id = id_a;
  delete from public.estoque_motors where id = id_a;

  if falhas = 0 then
    raise notice 'Autoconferência OK: a ficha técnica segue o feed com histórico, o "não sei" não apaga, modelo e versão ficam, e o lastmod se move.';
  else
    raise exception 'Autoconferência falhou em % ponto(s).', falhas;
  end if;
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260929200000', 'ficha_tecnica_segue_o_feed')
  on conflict (version) do nothing;
