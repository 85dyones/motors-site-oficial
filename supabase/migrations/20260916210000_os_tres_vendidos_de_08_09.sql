-- ============================================================================
-- Os três que o RevendaMais deixou de anunciar em 08/09 viram VENDIDO
-- ============================================================================
-- Decisão do dono em 2026-09-16, literal:
--
--   "foram vendidos, temos que retirar, na verdade, o site precisa reconhecer
--    o status de "pre-venda" e "vendido" do revenda e migrar o carro para
--    vendido, a disponibilidade precisa espelhar o revenda mais. mas precisam
--    ter alguns dias como vendido, seguindo a proposta do ensaio, para não
--    quebrar o processo."
--
-- Os três: VW Voyage 1.6 Trend 2009 (8393824), Chevrolet Celta 1.0 LT 2015
-- (8416946) e Peugeot 2008 Griffe 1.6 aut. 2018 (8417265). O último ciclo do
-- sync que os trouxe foi o de 08/09 às 12:00 (`last_seen_at` às 15:00 UTC); o
-- das 18:00 já veio sem eles, e nenhum ciclo depois os trouxe de volta — o de
-- 16/09 às 18:00 trouxe 44 anúncios. Seguiam `publicado`, `vendido = false`,
-- com ficha 200, preço, /estoque, sitemap e catálogo de anúncios.
--
-- Esta migração é SÓ o passivo destes três. O mecanismo — o sync marcar
-- sozinho quem sai do feed — é a migração seguinte,
-- `20260916220000_disponibilidade_espelha_o_revendamais`, mais dois nós no n8n.
--
-- ---------------------------------------------------------------------------
-- O jeito certo de marcar vendido, e por que a coluna sozinha não basta
-- ---------------------------------------------------------------------------
-- A régua do vendido (`lib/publicacao.ts`) tem dois relógios, e os dois leem a
-- DATA DA VENDA de `getDatasDeVenda`: `veiculos_vendidos.data_venda` ou a
-- ÚLTIMA mudança de `vendido` em `historico_veiculo`. Nenhum gatilho carimba
-- essa data: quem escreve o histórico é o painel (`aplicarNosVeiculos`).
--
--   · Só `vendido = true`, sem histórico: a ficha ganha o selo, mas a carência
--     de 90 dias corre pelo PROXY `last_seen_at`, e o catálogo de anúncios
--     (`decidirNoFeed`, que de propósito não lê o proxy) tira o carro na hora.
--   · `veiculos_vendidos`: NÃO. É a venda do Ciclo — exige cliente, chassi,
--     placa, KM e valor —, e nada disso existe aqui. Inventar a linha seria
--     duplicar a venda que o vendedor ainda pode registrar na A19.
--
-- Então: a coluna E uma linha no histórico, exatamente como o painel faria,
-- com a data da venda no lugar do "agora".
--
-- ---------------------------------------------------------------------------
-- A data: 08/09/2026, 18:00 (Brasília)
-- ---------------------------------------------------------------------------
-- É o primeiro ciclo do sync que já não os trouxe: o momento em que o
-- RevendaMais disse que eles saíram, e o carimbo que o mecanismo novo teria
-- gravado. O que ela faz, contado dali:
--
--   · ficha: selo VENDIDO, OutOfStock e similares, indexável até 08/12
--     (`CARENCIA_VENDIDO_DIAS = 90`); depois `noindex` e 308 para o hub;
--   · sitemap: segue listando até a carência vencer (mesmo relógio da ficha);
--   · vitrine, /estoque, hubs, home e contagens: saem já, porque todas
--     filtram `vendido`;
--   · catálogo de anúncios (Meta/Merchant): a janela de 7 dias
--     (`CARENCIA_VENDIDO_NO_FEED_DIAS`) fechou em 16/09 às 18:00. Os três
--     SAEM da próxima carga, sem passar um ciclo como `out_of_stock`.
--
-- ⚠️ Esse último ponto é decisão do dono, e está escrito aqui para não passar
-- calado. Se a transição no catálogo importar mais que a data exata, troque
-- `data_da_venda` por `now()`: a ficha fica 8 dias a mais no índice e o
-- catálogo mostra os três como `out_of_stock` por 7 dias antes de tirá-los.
--
-- ---------------------------------------------------------------------------
-- Quem assina, e por que não é o nome do sync
-- ---------------------------------------------------------------------------
-- A função da migração seguinte DESFAZ a marcação quando o carro volta ao feed
-- — mas só a que ela mesma fez (autor "RevendaMais (sync)", sem `autor_id`).
-- Estes três foram confirmados pelo dono: se um dia o RevendaMais os anunciar
-- de novo por engano, a venda não se desfaz sozinha. Por isso o autor é outro.
--
-- ---------------------------------------------------------------------------
-- Por que migração, e não a chave de serviço
-- ---------------------------------------------------------------------------
-- A trava de `estoque_motors` descarta em silêncio toda escrita feita como
-- `service_role` fora das seis colunas do feed: devolve 200 e grava zero. Pelo
-- pooler, o `current_user` é o dono do banco e a escrita passa. O aceite prova
-- pelo EFEITO, lendo de volta.
--
-- Reaplicar é inofensivo: só marca quem ainda não está vendido, e só escreve
-- histórico para quem marcou agora.
--
-- Reversão: `supabase/manutencao/reversao/os-tres-vendidos-de-08-09.sql`.
-- ============================================================================

do $$
declare
  ids           constant bigint[]    := array[8393824, 8416946, 8417265];
  data_da_venda constant timestamptz := '2026-09-08 18:00:00-03';
  autor         constant text        := 'Dono (confirmado em 16/09), pela migração 20260916210000';

  falhas               int := 0;
  existentes           int;
  do_feed              int;
  publicados_antes     int;
  publicados_depois    int;
  marcados             bigint[];
  vendidos_antes       int;
  vendidos_depois      int;
  vendas_ciclo_antes   int;
  vendas_ciclo_depois  int;
  lastmod_antes        timestamptz;
  n                    int;
  linha                record;
begin
  -- ---- Pré-condições -------------------------------------------------------
  select count(*), count(*) filter (where origem = 'sync'),
         count(*) filter (where estado_cadastro = 'publicado')
    into existentes, do_feed, publicados_antes
    from public.estoque_motors
   where id = any (ids);

  if existentes <> 3 or do_feed <> 3 then
    raise exception 'PRE-CONDICAO: % dos 3 existem e % são do feed (esperava 3 e 3). Nada foi alterado.',
      existentes, do_feed;
  end if;

  if publicados_antes <> 3 then
    -- Não aborta: arquivado ou rascunho não aparece no site, e marcar vendido
    -- continua sendo o fato. Mas a carência só vale para quem está publicado.
    raise notice 'Aviso: só % dos 3 seguem publicados — o estado mudou desde a medição de 16/09.',
      publicados_antes;
  end if;

  select count(*) into vendidos_antes from public.estoque_motors where vendido is true;
  select count(*) into vendas_ciclo_antes from public.veiculos_vendidos;
  select max(conteudo_atualizado_em) into lastmod_antes
    from public.estoque_motors where id = any (ids);

  -- ---- A escrita: a coluna e o histórico, como o painel faria -------------
  with feitos as (
    update public.estoque_motors
       set vendido = true
     where id = any (ids)
       and coalesce(vendido, false) = false
    returning id
  )
  select coalesce(array_agg(id::bigint order by id), '{}'::bigint[])
    into marcados
    from feitos;

  insert into public.historico_veiculo
    (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome, registrado_em)
  select x, 'vendido', 'false', 'true', null, autor, data_da_venda
    from unnest(marcados) as x;

  -- ---- Aceite: o EFEITO, lido de volta ---------------------------------------
  -- A escrita engolida pela trava em 01/09 "reportou 103 sucessos e gravou
  -- zero". O que vale é a leitura.
  select count(*) into n
    from public.estoque_motors
   where id = any (ids) and vendido is true;
  if n <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % dos 3 leem vendido — a trava engoliu a escrita?', n;
  end if;

  -- A data que o site vai ler, pela régua de `resolverDatasDeVenda`: a ÚLTIMA
  -- mudança de `vendido` no histórico precisa ser "true". Para quem foi marcado
  -- agora, ela precisa ser a de 08/09; quem já estava vendido guarda a dele.
  for linha in
    select i as id,
           ultima.valor_novo,
           ultima.registrado_em
      from unnest(ids) as i
      left join lateral (
        select h.valor_novo, h.registrado_em
          from public.historico_veiculo h
         where h.veiculo_id = i and h.campo = 'vendido'
         order by h.registrado_em desc
         limit 1
      ) as ultima on true
  loop
    if linha.valor_novo is distinct from 'true' then
      falhas := falhas + 1;
      raise warning 'FALHOU: % — a última mudança de vendido no histórico é %, não "true"; a carência cairia no proxy',
        linha.id, coalesce(linha.valor_novo, 'nenhuma');
    elsif linha.id = any (marcados) and linha.registrado_em is distinct from data_da_venda then
      falhas := falhas + 1;
      raise warning 'FALHOU: % — a data lida pelo site é %, não 08/09 18:00', linha.id, linha.registrado_em;
    end if;
  end loop;

  select count(*) into vendidos_depois from public.estoque_motors where vendido is true;
  if vendidos_depois - vendidos_antes <> cardinality(marcados) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a contagem de vendidos andou % (esperado %) — a escrita alcançou outro carro',
      vendidos_depois - vendidos_antes, cardinality(marcados);
  end if;

  select count(*) into publicados_depois
    from public.estoque_motors where id = any (ids) and estado_cadastro = 'publicado';
  if publicados_depois <> publicados_antes then
    falhas := falhas + 1;
    raise warning 'FALHOU: o estado do cadastro mudou (% publicados, eram %) — arquivar mataria a carência',
      publicados_depois, publicados_antes;
  end if;

  select count(*) into vendas_ciclo_depois from public.veiculos_vendidos;
  if vendas_ciclo_depois <> vendas_ciclo_antes then
    falhas := falhas + 1;
    raise warning 'FALHOU: veiculos_vendidos foi de % para % — nenhuma venda do Ciclo nasce aqui',
      vendas_ciclo_antes, vendas_ciclo_depois;
  end if;

  -- O `lastmod` precisa andar: é o que leva o rastreador a reler a ficha e ver
  -- o OutOfStock. `marcar_conteudo_atualizado` lista `vendido`.
  select count(*) into n
    from public.estoque_motors
   where id = any (marcados)
     and conteudo_atualizado_em > coalesce(lastmod_antes, '-infinity'::timestamptz);
  if n <> cardinality(marcados) then
    falhas := falhas + 1;
    raise warning 'FALHOU: o lastmod andou em % dos % marcados', n, cardinality(marcados);
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) ao marcar os três vendidos', falhas;
  end if;

  raise notice 'Os três OK: % marcados agora, % já estavam vendidos; data da venda % (autor: %); ficha VENDIDO indexável até %; catálogo: % dias desde a venda contra a janela de 7 — %.',
    cardinality(marcados),
    3 - cardinality(marcados),
    to_char(data_da_venda at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    autor,
    to_char((data_da_venda + interval '91 days') at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
    floor(extract(epoch from (now() - data_da_venda)) / 86400),
    case
      when floor(extract(epoch from (now() - data_da_venda)) / 86400) <= 7
        then 'ficam out_of_stock até a janela fechar'
      else 'saem da próxima carga'
    end;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260916210000', 'os_tres_vendidos_de_08_09')
  on conflict (version) do nothing;
