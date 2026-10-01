-- ============================================================================
-- Reversão da 20261001180000 — o authenticated volta a ler a tabela inteira
-- ============================================================================
-- Desfaz `20261001180000_custo_do_vendido_fora_da_sessao`: devolve ao
-- `authenticated` o SELECT de tabela em `veiculos_vendidos` e tira a versão do
-- livro-razão. Com isto aplicado, o cliente da Garagem volta a ler o custo de
-- aquisição do carro que comprou — é o furo de volta. Serve para uma coisa:
--
-- ⚠️ Alguma leitura pela sessão que ninguém mapeou e que caiu depois da
-- migração (o PostgREST recusa INTEIRA a leitura que pede a coluna ou `*`,
-- com 42501) — enquanto ela é corrigida no código.
--
-- O código não precisa voltar junto: nada no ar lê o custo pela sessão, nem
-- antes nem depois da migração.
--
-- Aplicar pelo pooler, com ensaio antes:
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/custo-do-vendido-2026-10-01.sql
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/custo-do-vendido-2026-10-01.sql --gravar
--
-- Sem transação aberta ou fechada aqui dentro: o script já abre a dele, e
-- fechá-la no meio do arquivo gravaria o ensaio.
--
-- A ordem importa. Revogar SELECT de coluna depois de conceder o de tabela
-- não tem efeito nenhum no Postgres; por isso as colunas saem PRIMEIRO, e só
-- então a tabela volta — o estado fica igual ao de antes da migração.
-- ============================================================================

revoke select (
  id, cliente_id, estoque_id, chassi, placa, marca, modelo, versao,
  ano_fabricacao, ano_modelo, data_venda, km_na_venda, valor_venda,
  aderiu_ciclo, vendedor, created_at, vendedor_id, saiu_em, motivo_saida
) on public.veiculos_vendidos from authenticated;

grant select on public.veiculos_vendidos to authenticated;

delete from supabase_migrations.schema_migrations where version = '20261001180000';

-- Confere pelo efeito, como o PostgREST faria.
do $$
begin
  if not has_table_privilege('authenticated', 'public.veiculos_vendidos', 'select') then
    raise exception 'Reversão falhou: o authenticated continua sem SELECT de tabela';
  end if;
  set local role authenticated;
  perform * from public.veiculos_vendidos limit 1;
  reset role;
  raise notice 'Reversão OK: o authenticated lê select * de veiculos_vendidos de novo.';
end $$;
