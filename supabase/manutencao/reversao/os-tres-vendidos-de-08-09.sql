-- Reversão da migração 20260916210000_os_tres_vendidos_de_08_09.
--
-- Devolve os três à venda. O histórico é append-only (a RLS não tem policy de
-- UPDATE nem DELETE, e o que foi feito não se apaga): a reversão ESCREVE a
-- volta, "true" -> "false". É essa última mudança que `resolverDatasDeVenda`
-- lê, então a data gravada pela migração deixa de valer no mesmo instante.
--
-- Aplicar pelo pooler, com ensaio antes:
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/os-tres-vendidos-de-08-09.sql
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/os-tres-vendidos-de-08-09.sql --gravar
--
-- Sem BEGIN/COMMIT aqui dentro: o script já abre a transação, e um COMMIT no
-- meio do arquivo gravaria o ensaio. A chave de serviço não serve: a trava de
-- `estoque_motors` recusa em silêncio a escrita de `vendido` feita como
-- `service_role`.

with devolvidos as (
  update public.estoque_motors
     set vendido = false
   where id in (8393824, 8416946, 8417265)
     and vendido is true
  returning id
)
insert into public.historico_veiculo
  (veiculo_id, campo, valor_anterior, valor_novo, autor_id, autor_nome)
select id, 'vendido', 'true', 'false', null, 'Reversão da migração 20260916210000'
  from devolvidos;
