-- ============================================================================
-- Reversão da 20260929220000 — o anon volta a ler a tabela inteira
-- ============================================================================
-- Desfaz `20260929220000_leitura_anonima_sem_documento_nem_custo`: devolve ao
-- `anon` o SELECT de TABELA em `estoque_motors` e tira a versão do
-- livro-razão. Com isto aplicado, a chave pública volta a ler placa, chassi,
-- renavam e custo — é o vazamento de volta. Só serve para uma coisa:
--
-- ⚠️ VOLTAR O CÓDIGO para um deploy anterior à PR da leitura anônima (o
-- "instant rollback" da Vercel, por exemplo). O código antigo lê com
-- `select("*")`, que o PostgREST recusa inteiro sem privilégio em todas as
-- colunas: a vitrine cai em "estoque indisponível" (500 e alerta "parada") e a
-- ficha antiga, que ignorava o erro, vira 404 em todo carro — e o ISR guarda
-- o 404. Rode ESTA reversão ANTES de promover o deploy antigo, nunca depois.
--
-- Aplicar pelo pooler, com ensaio antes:
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/leitura-anonima-2026-09-29.sql
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/leitura-anonima-2026-09-29.sql --gravar
--
-- Sem BEGIN/COMMIT aqui dentro: o script já abre a transação, e um COMMIT no
-- meio do arquivo gravaria o ensaio.
--
-- A ordem importa. Revogar SELECT de coluna depois de conceder o de tabela
-- não tem efeito nenhum no Postgres; por isso as colunas saem PRIMEIRO, e só
-- então a tabela volta — o estado fica igual ao de antes da migração, e não
-- uma mistura dos dois.
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
) on public.estoque_motors from anon;

grant select on public.estoque_motors to anon;

delete from supabase_migrations.schema_migrations where version = '20260929220000';

-- Confere pelo efeito, como o PostgREST faria.
do $$
begin
  if not has_table_privilege('anon', 'public.estoque_motors', 'select') then
    raise exception 'Reversão falhou: o anon continua sem SELECT de tabela';
  end if;
  set local role anon;
  perform * from public.estoque_motors limit 1;
  reset role;
  raise notice 'Reversão OK: o anon lê select * de novo — o código antigo volta a funcionar.';
end $$;
