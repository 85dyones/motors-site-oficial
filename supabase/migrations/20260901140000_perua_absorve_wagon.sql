-- ---------------------------------------------------------------------------
-- `Perua` absorve `Wagon` — duas páginas para a mesma carroceria viram uma
-- ---------------------------------------------------------------------------
-- Achado da entrega dos hubs (2026-09-01): `/estoque/perua` e `/estoque/wagon`
-- respondiam 200, as duas com "Peruas/Wagons seminovas em Curitiba", as duas
-- vazias — porque `CARROCERIAS` tinha os DOIS valores e o hub nasce de
-- qualquer `tipo` que já apareceu no histórico.
--
-- Decisão do dono, na mesma hora: *"são de fato a mesma coisa, unifique, temos
-- opções como a Space Fox na Wagon/Perua"*.
--
-- ---------------------------------------------------------------------------
-- Duas linhas mudam, e a segunda é o motivo de a página existir
-- ---------------------------------------------------------------------------
--   6609121  Fiat Palio Weekend Adventure   Wagon -> Perua   (vendida)
--   8429524  VW SpaceFox 1.6 Trend          Hatch -> Perua   (na vitrine)
--
-- A SpaceFox estava em `Hatch`, e não é hatch por nenhuma definição — é a
-- perua do Fox. É o mesmo padrão que a migração de 26/08 documentou: *"o feed
-- do RevendaMais usa Hatch como lixeira"*, com 20 das 36 unidades ali.
--
-- Antes desta migração `/estoque/perua` tinha a Parati, que está fora da
-- vitrine por ter uma foto só — a página existia sem nada para mostrar. Com a
-- SpaceFox ela passa a listar carro de verdade, que é o que o dono apontou.
--
-- ---------------------------------------------------------------------------
-- O que NÃO muda aqui
-- ---------------------------------------------------------------------------
-- A Parati `8152210` já era `Perua` e não é tocada — o aceite prova.
--
-- E `stock_overrides` foi conferido antes: `tipo` aparece em três overrides
-- (8147325, 8243713, 8274059) e nenhum deles é destes dois carros, nem carrega
-- 'Wagon'. Sem essa checagem a coluna mudaria e o override do painel voltaria
-- a sombrear o valor no navegador — o campo está na whitelist pública de
-- `CAMPOS_PUBLICOS_DE_OVERRIDE`.
--
-- ---------------------------------------------------------------------------
-- O código acompanha, em duas partes
-- ---------------------------------------------------------------------------
--   1. `"Wagon"` sai de `CARROCERIAS`. Só pode sair DEPOIS desta migração:
--      valor fora da lista com veículo apontando para ele é `tipo` órfão, que
--      some do dropdown do painel sem sumir do dado.
--   2. `/estoque/wagon` passa a responder **308** para `/estoque/perua`. A URL
--      está no sitemap servido hoje; deixar virar 404 jogaria fora o sinal
--      que ela já acumulou, e a regra da casa para URL aposentada é redirecionar
--      (mesma de `[ficha]/[legado]`).
--
-- `tipo` está na lista de `marcar_conteudo_atualizado`, então os dois ganham
-- carimbo de hoje no `lastmod`. Aqui é honesto: a categoria da SpaceFox mudou
-- de verdade, e com ela o hub em que a ficha aparece.
-- ---------------------------------------------------------------------------

update public.estoque_motors set tipo = 'Perua' where tipo = 'Wagon';
update public.estoque_motors set tipo = 'Perua' where id = 8429524 and tipo = 'Hatch';

-- ---------------------------------------------------------------------------
-- Aceite
-- ---------------------------------------------------------------------------
do $$
declare
  falhas   int := 0;
  sobrou   int;
  peruas   int;
  spacefox text;
  parati   text;
begin
  select count(*) into sobrou from public.estoque_motors where tipo = 'Wagon';
  if sobrou > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % veículo(s) ainda em Wagon — a carroceria não foi unificada', sobrou;
  end if;

  select tipo into spacefox from public.estoque_motors where id = 8429524;
  if spacefox is distinct from 'Perua' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a SpaceFox 8429524 está em % e não em Perua', spacefox;
  end if;

  -- A Parati já era Perua antes: se ela mudou, o `where` alcançou mais do que
  -- devia e a próxima migração acha que o dado sempre foi assim.
  select tipo into parati from public.estoque_motors where id = 8152210;
  if parati is distinct from 'Perua' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a Parati 8152210 saiu de Perua (agora %)', parati;
  end if;

  -- O hub deixa de nascer vazio: pelo menos uma perua publicada e não vendida.
  select count(*) into peruas
    from public.estoque_motors
   where tipo = 'Perua' and estado_cadastro = 'publicado' and not coalesce(vendido, false);
  if peruas < 2 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % perua(s) publicada(s) — esperado Parati e SpaceFox', peruas;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na unificação de Wagon em Perua', falhas;
  end if;

  raise notice 'Perua OK: nenhum Wagon restante, SpaceFox reclassificada, Parati intacta, % publicadas.', peruas;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260901140000', 'perua_absorve_wagon')
  on conflict (version) do nothing;
