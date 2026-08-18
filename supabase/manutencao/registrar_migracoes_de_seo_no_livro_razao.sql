-- Registra no livro-razão as duas migrações de SEO de 17/08, aplicadas em
-- produção SEM registro (D6 — nenhuma migração se registrava sozinha até
-- 18/08). Verificado pelo efeito em 2026-08-18: as colunas existem e estão
-- preenchidas; o livro-razão tinha 23 versões e estas duas não constavam.
--
-- Correção de uma vez só. As migrações a partir de 20260818120000 carregam
-- o rodapé de auto-registro e não precisam disto.
--
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/registrar_migracoes_de_seo_no_livro_razao.sql --gravar

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260817120000', 'conteudo_atualizado_em'),
  ('20260817130000', 'descricao_seo')
on conflict (version) do nothing;

-- Autoconferência: depois disto, TODO arquivo local tem de constar do
-- livro-razão (as duas de 18/08 entram pelo próprio rodapé quando aplicadas;
-- se esta rodar antes delas, a contagem esperada é 25, não 27 — o DO abaixo
-- só confere as duas que este arquivo registra).
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260817120000')
     or not exists (select 1 from supabase_migrations.schema_migrations where version = '20260817130000') then
    raise exception 'REGISTRO FALHOU: as versões de 17/08 não constam do livro-razão';
  end if;
  raise notice 'Livro-razão: 20260817120000 e 20260817130000 registradas.';
end $$;
