-- ============================================================================
-- Ficha técnica: só no carro do feed, e sem troca por espaço — emenda à 20260929200000
-- ============================================================================
-- Achados da revisão da PR 85dyones/motors-site-oficial#177, sobre a migração
-- `20260929200000_ficha_tecnica_segue_o_feed` (já aplicada):
--
-- 1. O NATIVO RECEBIA FICHA E SAÍA ASSINADO "RevendaMais". A trava reconhece o
--    sync pela identidade `service_role` (ou pelo carimbo `last_seen_at`), e o
--    bloco da ficha valia para qualquer linha. O sync nunca escreve no carro
--    nativo (id ≥ 900000001) — o que chega nele como service_role é script de
--    manutenção. Antes da 20260929200000 essa escrita era descartada; depois,
--    passava e ia para o histórico como "RevendaMais (sync)" — atribuição falsa,
--    e um km menor viraria o alerta "o km diminuiu no RevendaMais" num carro que
--    o RevendaMais não conhece. Agora o bloco só roda com `origem` diferente de
--    'painel', e o nativo volta a ficar como estava.
--
-- 2. ESPAÇO VIRAVA TROCA. A guarda do "N/D" limpava as pontas, mas a comparação
--    e a gravação usavam o valor cru: `'prata '` contra `'prata'` gerava linha
--    no histórico, gravava o espaço e movia o lastmod sem nada ter mudado.
--    Agora câmbio, combustível e cor são comparados e gravados sem espaço nas
--    pontas — como `codigo_fipe` já era.
--
-- 3. A AUTOCONFERÊNCIA NÃO VIA DUAS COISAS: uma troca real de ano de fabricação,
--    e o lastmod parado depois do primeiro movimento (com `now()` constante na
--    transação, qualquer passo depois do primeiro que movesse o carimbo passava
--    despercebido). Aqui cada checagem de "não moveu" usa uma linha que ainda
--    está com o lastmod de ontem.
--
-- O resto da trava é o da `20260929200000`, inteiro.
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
$$;

comment on function public.estoque_motors_trava_do_sync() is
  'O sync do RevendaMais manda em SEIS colunas — preco, preco_original, preco_promocional, last_seen_at, portas e opcionais —; a FICHA TÉCNICA (quilometragem, ano, ano_fabricacao, cambio, combustivel, cor) segue o feed no carro do feed (nunca no nativo; texto sem espaço nas pontas), registrando cada troca no historico_veiculo como "RevendaMais (sync)" (N/D, ano fora de 1900–2100 e km 0 são "não sei" e não apagam nada); atualiza valor_fipe e codigo_fipe quando manda valor; o CHASSI segue o feed quando é válido (sem I, O nem Q); e PREENCHE placa e motor só quando estão vazios. Marca, modelo e versão continuam barrados (título e URL). Nunca grava documento que já é de outro carro. Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio. Allowlist por construção. Move conteudo_atualizado_em quando muda PREÇO, OPCIONAIS ou a FICHA TÉCNICA, ou quando preenche o MOTOR.';

-- ==========================================================
-- Autoconferência
-- ==========================================================
do $$
declare
  id_a      integer := 7000051;   -- carro do feed
  id_b      integer := 7000052;   -- carro do feed, para as checagens de "não moveu"
  id_nativo integer;              -- carro do painel
  ontem     timestamptz := now() - interval '1 day';
  depois    public.estoque_motors%rowtype;
  n         int;
  falhas    int := 0;
begin
  if exists (select 1 from public.estoque_motors where id in (id_a, id_b))
     or exists (select 1 from public.historico_veiculo where veiculo_id in (id_a, id_b)) then
    raise exception 'AUTOCONFERÊNCIA: ids de ensaio já existem — escolha outros';
  end if;

  insert into public.estoque_motors
    (id, marca, modelo, preco, ano, ano_fabricacao, quilometragem, cambio, combustivel, cor, last_seen_at, conteudo_atualizado_em)
  values
    (id_a, 'aceiteficha2', 'a', 50000, 2015, 2014, 90000, 'manual', 'flex', 'prata', now(), ontem),
    (id_b, 'aceiteficha2', 'b', 50000, 2015, 2014, 90000, 'manual', 'flex', 'prata', now(), ontem);

  -- 1. Troca real de ano de fabricação: chega, vai para o histórico, move o lastmod.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, ano_fabricacao, last_seen_at)
  values (id_a, 'aceiteficha2', 'a', 50000, 2015, 2015, clock_timestamp())
  on conflict (id) do update set ano_fabricacao = excluded.ano_fabricacao, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_a;
  select count(*) into n from public.historico_veiculo
   where veiculo_id = id_a and campo = 'ano_fabricacao' and valor_anterior = '2014' and valor_novo = '2015'
     and autor_nome = 'RevendaMais (sync)';
  if depois.ano_fabricacao is distinct from 2015 or n <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHA: o ano de fabricação não seguiu o feed (valor %, % linhas)', depois.ano_fabricacao, n;
  end if;
  if depois.conteudo_atualizado_em is not distinct from ontem then
    falhas := falhas + 1;
    raise warning 'FALHA: trocar o ano de fabricação não moveu o lastmod';
  end if;

  -- 2. Espaço nas pontas não é troca: nada no histórico, lastmod de ontem, valor limpo.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, cambio, combustivel, cor, last_seen_at)
  values (id_b, 'aceiteficha2', 'b', 50000, 2015, ' manual', 'flex  ', 'prata ', clock_timestamp())
  on conflict (id) do update set cambio = excluded.cambio, combustivel = excluded.combustivel,
    cor = excluded.cor, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_b;
  select count(*) into n from public.historico_veiculo where veiculo_id = id_b;
  if n <> 0 or depois.cor is distinct from 'prata' or depois.cambio is distinct from 'manual'
     or depois.conteudo_atualizado_em is distinct from ontem then
    falhas := falhas + 1;
    raise warning 'FALHA: espaço virou troca (% linhas, cor=%, câmbio=%, lastmod movido=%)',
      n, depois.cor, depois.cambio, depois.conteudo_atualizado_em is distinct from ontem;
  end if;

  -- 3. Troca de cor COM espaço: grava limpo.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, cor, last_seen_at)
  values (id_b, 'aceiteficha2', 'b', 50000, 2015, ' branco ', clock_timestamp())
  on conflict (id) do update set cor = excluded.cor, last_seen_at = excluded.last_seen_at;
  select * into depois from public.estoque_motors where id = id_b;
  select count(*) into n from public.historico_veiculo
   where veiculo_id = id_b and campo = 'cor' and valor_anterior = 'prata' and valor_novo = 'branco';
  if depois.cor is distinct from 'branco' or n <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHA: a cor nova não entrou limpa (valor %, % linhas)', depois.cor, n;
  end if;

  -- 4. O nativo não recebe ficha pelo service_role, e nada sai assinado "RevendaMais".
  insert into public.estoque_motors (marca, modelo, preco, ano, quilometragem, cor)
  values ('aceiteficha2', 'nativo', 60000, 2020, 50000, 'preto')
  returning id into id_nativo;
  set local role service_role;
  update public.estoque_motors set quilometragem = 10, cor = 'rosa' where id = id_nativo;
  reset role;
  select * into depois from public.estoque_motors where id = id_nativo;
  select count(*) into n from public.historico_veiculo where veiculo_id = id_nativo;
  if depois.quilometragem is distinct from 50000 or depois.cor is distinct from 'preto' or n <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHA: o nativo recebeu ficha pelo service_role (km=%, cor=%, % linhas)', depois.quilometragem, depois.cor, n;
  end if;

  delete from public.historico_veiculo where veiculo_id in (id_a, id_b, id_nativo);
  delete from public.estoque_motors where id in (id_a, id_b, id_nativo);

  if falhas = 0 then
    raise notice 'Autoconferência OK: o ano de fabricação segue o feed, espaço não é troca, e o nativo fica fora da ficha do sync.';
  else
    raise exception 'Autoconferência falhou em % ponto(s).', falhas;
  end if;
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260929210000', 'ficha_tecnica_so_no_carro_do_feed')
  on conflict (version) do nothing;
