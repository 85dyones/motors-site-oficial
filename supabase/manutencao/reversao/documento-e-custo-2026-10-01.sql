-- ============================================================================
-- Reversão da 20261001150000 — o authenticated volta a ler a tabela inteira
-- ============================================================================
-- Desfaz a metade da TABELA de `20261001150000_documento_e_custo_so_para_a_equipe`:
-- devolve ao `authenticated` o SELECT de tabela em `estoque_motors` e tira a
-- versão do livro-razão. Com isto aplicado, cliente da Garagem e investidor
-- voltam a ler placa, chassi, renavam e custo com a própria sessão — é o
-- vazamento de volta. Serve para duas coisas:
--
-- ⚠️ VOLTAR O CÓDIGO para um deploy anterior à PR (o "instant rollback" da
-- Vercel, por exemplo). O código antigo lê o painel com `select("*")` da
-- tabela, que o PostgREST recusa inteiro sem privilégio em todas as colunas:
-- o estoque do painel e o editor cairiam. Rode ESTA reversão ANTES de
-- promover o deploy antigo, nunca depois.
--
-- ⚠️ Alguma leitura de painel que ninguém mapeou e que caiu depois da
-- migração — enquanto ela é corrigida no código.
--
-- A VIEW FICA. O código da PR lê documento e custo por ela, e ela não abre
-- nada a quem não é da equipe; apagá-la derrubaria o painel do código novo.
--
-- Aplicar pelo pooler, com ensaio antes:
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/documento-e-custo-2026-10-01.sql
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/documento-e-custo-2026-10-01.sql --gravar
--
-- Sem transação aberta ou fechada aqui dentro: o script já abre a dele, e
-- fechá-la no meio do arquivo gravaria o ensaio.
--
-- A ordem importa. Revogar SELECT de coluna depois de conceder o de tabela
-- não tem efeito nenhum no Postgres; por isso as colunas saem PRIMEIRO, e só
-- então a tabela volta — o estado fica igual ao de antes da migração.
-- ============================================================================

revoke select (
  id, marca, modelo, versao, ano, ano_fabricacao, preco, preco_original,
  preco_promocional, quilometragem, cambio, combustivel, cor, tipo, perfil_uso,
  url_imagem, link_conversao, pericia, whatsapp_images, web_full_images,
  created_at, descricao, laudo_pericia, opcionais, status_tag,
  status_tag_color, vendido, last_seen_at, motor, cor_interna,
  donos_anteriores, garantia_fabrica, conteudo_atualizado_em, descricao_seo,
  first_seen_at, modelo_override, versao_override, perfis_uso, origem,
  estado_cadastro, portas, em_preparacao, previsao_chegada_em
) on public.estoque_motors from authenticated;

grant select on public.estoque_motors to authenticated;

delete from supabase_migrations.schema_migrations where version = '20261001150000';

-- Confere pelo efeito, como o PostgREST faria.
do $$
begin
  if not has_table_privilege('authenticated', 'public.estoque_motors', 'select') then
    raise exception 'Reversão falhou: o authenticated continua sem SELECT de tabela';
  end if;
  set local role authenticated;
  perform * from public.estoque_motors limit 1;
  reset role;
  raise notice 'Reversão OK: o authenticated lê select * de novo — o código antigo volta a funcionar.';
end $$;
