-- ===========================================================================
-- Motivos de ganho por escopo: comprar o carro do cliente também é fechar
-- ===========================================================================
-- 2026-09-16, decisão do dono: "Motivos de ganho por escopo".
--
-- ---------------------------------------------------------------------------
-- O diagnóstico
-- ---------------------------------------------------------------------------
-- `20260905120000_motivo_por_escopo` deu escopo aos motivos e dividiu só a
-- PERDA — o desenho dizia, na D2, que "o ganho segue compartilhado". Os quatro
-- motivos de ganho são forma de pagamento de quem COMPRA um carro nosso: À
-- vista, Financiado, Com carro na troca, Consórcio ou carta contemplada. Num
-- lead de avaliação o ganho é outro acontecimento — a loja comprou o carro da
-- pessoa —, e a caixa oferecia "Financiado" para fechá-lo.
--
-- Desde 16/09 fechar negócio exige motivo na tela e na API, e a API aceita
-- exatamente o que a caixa oferece para o canal do lead. Sem um motivo de
-- ganho de avaliação, o vendedor escolheria uma forma de pagamento que não
-- aconteceu, e o relatório somaria compra de usado com venda de carro na
-- mesma barra.
--
-- Estado de produção medido em 16/09, só leitura: 4 motivos de ganho, todos
-- em `ambos` — a_vista (ordem 1), financiado (2), com_troca (3) e
-- consorcio (4). Nenhum motivo de ganho de avaliação.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
--  1. Os quatro de pagamento passam a `compra`. Nominalmente, pela chave: um
--     motivo de ganho que o dono tenha criado pela tela fica em `ambos`, a
--     mesma conduta da migração de escopo com a perda.
--  2. Nasce `compramos_o_carro` — "Compramos o carro do cliente" —, de ganho,
--     em `avaliacao`, ordem 5, ativo.
--
-- Os valores de escopo são os do CHECK `funil_motivos_escopo_valido`
-- (20260905120000): 'compra', 'avaliacao' e 'ambos'.
--
-- Migração de DADOS, e só de dados: nada de gatilho, constraint ou função. A
-- regra do desfecho mora no app (`decidirDesfecho` e `validarFunil`, em
-- `src/lib/funil.ts`), por decisão do dono.
--
-- Beco: avaliação passa a ter UM motivo de ganho ativo e compra passa a ter
-- quatro — nenhum lado fica sem saída. E se o de avaliação for desativado um
-- dia, a caixa cai na lista cheia de ganho (`motivosVisiveis`), que a API
-- também aceita.
-- ===========================================================================

update public.funil_motivos
   set escopo = 'compra'
 where tipo = 'ganho'
   and chave in ('a_vista', 'financiado', 'com_troca', 'consorcio');


-- `where not exists`, e não `on conflict do update`: reexecutar não desfaz o
-- que o dono tenha ajustado pela tela depois. Se isso acontecer, o aceite
-- abaixo reprova — e manda olhar, em vez de sobrescrever calado.
insert into public.funil_motivos (chave, rotulo, tipo, ordem, ativo, escopo)
select 'compramos_o_carro', 'Compramos o carro do cliente', 'ganho', 5, true, 'avaliacao'
 where not exists (
   select 1 from public.funil_motivos where chave = 'compramos_o_carro'
 );


-- ---------------------------------------------------------------------------
-- Autoconferência: prova pelo EFEITO, linha a linha
-- ---------------------------------------------------------------------------
-- Sem o sentinela ACE01: nenhum teste abaixo grava linha, são só leituras.
do $aceite$
declare
  qtd    int;
  v_txt  text;
begin
  -- a) os quatro de pagamento são de compra — e continuam de ganho
  select count(*) into qtd
    from public.funil_motivos
   where tipo = 'ganho'
     and escopo = 'compra'
     and chave in ('a_vista', 'financiado', 'com_troca', 'consorcio');
  if qtd <> 4 then
    raise exception
      'ACEITE FALHOU: % dos 4 motivos de ganho de pagamento ficaram em escopo '
      'compra, esperados 4. Algum sumiu ou mudou de tipo desde a medição de '
      '16/09 — pare e confira antes de gravar.', qtd;
  end if;

  -- b) o motivo novo é exatamente o que o dono decidiu
  select tipo || '/' || escopo || '/' || ordem::text || '/' || ativo::text || '/' || rotulo
    into v_txt
    from public.funil_motivos
   where chave = 'compramos_o_carro';
  if v_txt is distinct from 'ganho/avaliacao/5/true/Compramos o carro do cliente' then
    raise exception
      'ACEITE FALHOU: compramos_o_carro ficou "%" — esperado '
      '"ganho/avaliacao/5/true/Compramos o carro do cliente".',
      coalesce(v_txt, '<ausente>');
  end if;

  -- c) o ganho por escopo é o medido mais o decidido: 4 de compra, 1 de
  --    avaliação. A tela não edita escopo de ganho, então qualquer outro
  --    número veio de fora desta migração.
  select count(*) into qtd
    from public.funil_motivos
   where tipo = 'ganho' and escopo = 'compra';
  if qtd <> 4 then
    raise exception
      'ACEITE FALHOU: % motivo(s) de ganho em escopo compra, esperados 4.', qtd;
  end if;

  select count(*) into qtd
    from public.funil_motivos
   where tipo = 'ganho' and escopo = 'avaliacao';
  if qtd <> 1 then
    raise exception
      'ACEITE FALHOU: % motivo(s) de ganho em escopo avaliacao, esperado 1.', qtd;
  end if;

  -- d) sem beco: cada lado tem ao menos um motivo de ganho ATIVO que vale
  --    para ele. Fechar negócio exige motivo desde 16/09.
  select count(*) into qtd
    from public.funil_motivos
   where tipo = 'ganho' and ativo and escopo in ('avaliacao', 'ambos');
  if qtd < 1 then
    raise exception
      'ACEITE FALHOU: nenhum motivo de ganho ativo vale para avaliação — o lead '
      'de quem quer vender o carro fecharia com forma de pagamento.';
  end if;

  select count(*) into qtd
    from public.funil_motivos
   where tipo = 'ganho' and ativo and escopo in ('compra', 'ambos');
  if qtd < 1 then
    raise exception
      'ACEITE FALHOU: nenhum motivo de ganho ativo vale para compra — o card '
      'de quem comprou não teria como fechar.';
  end if;

  raise notice
    'Aceite verificado: os 4 motivos de ganho de pagamento ficaram em compra, '
    'compramos_o_carro nasceu em avaliação (ordem 5, ativo), e os dois lados '
    'têm motivo de ganho ativo.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20260916170000', 'motivos_de_ganho_por_escopo')
on conflict (version) do nothing;
