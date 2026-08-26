-- ==========================================================
-- `modelo_override` e `versao_override` — corrigir o que o feed erra
-- ==========================================================
--
-- O plano de mídia de 26/08 encontrou uma URL impossível de anunciar:
--
--   /carros/ford/ka-sedan-10-se-flex-4p
--                /ka-sedan-10-se-flex-4p
--                /ford-ka-sedan-10-se-flex-4p-ka-sedan-10-se-flex-4p-8059102
--
-- A causa é a coluna `modelo` ter recebido a VERSÃO inteira. Como
-- `getVeiculoPdpUrl` monta `/{marca}/{modelo}/{versao}/{slug}` e a limpeza de
-- versão devolve o texto original quando sobra vazio, o mesmo pedaço aparece
-- três vezes no endereço.
--
-- O estrago maior não é o endereço feio: `/carros/ford/ka` deixa de agrupar os
-- três Ka, porque o terceiro mora num hub próprio — e o sitemap passa a
-- publicar DOIS hubs para o mesmo modelo.
--
-- Conferido no sitemap servido em 2026-08-26: são QUATRO casos, não um.
--
--   ford/ka-sedan-10-se-flex-4p
--   honda/hr-v-ex-18-flexone-16v-5p-aut
--   mercedes-benz/c-180-cgi-classic-18-16v-156cv-aut-2012-gasolina
--   volkswagen/novo-voyage-10
--
-- ----------------------------------------------------------
-- Por que coluna nova, e não editar `modelo` direto
-- ----------------------------------------------------------
-- `modelo` e `versao` são duas das 22 colunas que o sincronizador do
-- RevendaMais manda no upsert. Corrigi-las no painel funcionaria até o
-- próximo ciclo do n8n, que as reescreveria com o valor do feed — sem erro,
-- sem log, sem nada na tela.
--
-- É a mesma razão que criou `descricao_seo` na migração 20260817130000: campo
-- paralelo, que o painel escreve e o sync não conhece. `estoqueEscrita.ts`
-- guarda a lista (`CAMPOS_NOSSOS`) e o contrato é justamente esse.
--
-- ⚠️  **Não acrescentar estas duas ao corpo do upsert.** No dia em que alguém
-- as incluir, toda correção feita à mão é apagada no sync seguinte, e o
-- sintoma volta a ser uma URL torta que ninguém sabe explicar.
--
-- ----------------------------------------------------------
-- Como o site lê
-- ----------------------------------------------------------
-- `mapDbToVeiculo` (lib/supabase.ts) resolve `modelo_override ?? modelo` e
-- `versao_override ?? versao` NA LEITURA, num lugar só. Daí para cima nada
-- sabe que o override existe: URL da ficha, hubs de marca e modelo, feed XML e
-- JSON-LD já recebem o objeto resolvido.
--
-- `NULL` significa "o feed manda" — o comportamento de hoje para a esmagadora
-- maioria. Por isso sem DEFAULT e sem backfill.
--
-- A URL antiga não quebra: a rota da ficha já faz `permanentRedirect` para a
-- URL canônica quando o caminho pedido não é o dela.
-- ==========================================================

ALTER TABLE public.estoque_motors
    ADD COLUMN IF NOT EXISTS modelo_override text,
    ADD COLUMN IF NOT EXISTS versao_override text;

COMMENT ON COLUMN public.estoque_motors.modelo_override IS
    'Nome do modelo escrito por nos, quando o feed manda a versao inteira no '
    'lugar ("Ka Sedan 1.0 SE Flex 4p" em vez de "Ka"). NULL = usar o valor do '
    'feed. Decide a URL da ficha e o agrupamento do hub de modelo. NAO '
    'acrescentar ao payload do sincronizador: o sync sobrescreveria a '
    'correcao. Ver CAMPOS_NOSSOS em src/lib/estoqueEscrita.ts.';

COMMENT ON COLUMN public.estoque_motors.versao_override IS
    'Versao escrita por nos. Mesmo contrato do modelo_override: NULL = feed, e '
    'fora do payload do sincronizador. Existe em par com ele porque corrigir '
    'so o modelo deixaria a versao repetindo o texto que saiu dali.';

-- ----------------------------------------------------------
-- Os quatro casos diagnosticados
-- ----------------------------------------------------------
-- Por `modelo`, e não por id: o id do Mercedes e o do Voyage não aparecem em
-- lugar nenhum servido — os dois hubs são perenes, montados do histórico, sem
-- unidade à venda. Casar pelo texto sujo alcança as linhas vendidas também, e
-- deixa a migração legível: dá para ver o que está sendo corrigido.
--
-- `WHERE modelo_override IS NULL` mantém a migração idempotente e impede que
-- ela desfaça um ajuste posterior feito no painel.
--
-- A forma do defeito, lida na produção de 2026-08-26: o feed manda `versao`
-- IGUAL a `modelo`, as duas com a versão inteira. É por isso que o segmento
-- aparece TRÊS vezes — a limpeza de versão esvazia e cai de volta no texto
-- original. Reproduzido fora do banco e conferido contra o sitemap servido:
--
--   modelo = versao = "Ka Sedan 1.0 Se Flex 4p"
--     → /carros/ford/ka-sedan-10-se-flex-4p/ka-sedan-10-se-flex-4p/ford-…-8059102
--   com override
--     → /carros/ford/ka/sedan-10-se-flex-4p/ford-ka-sedan-10-se-flex-4p-8059102

UPDATE public.estoque_motors
   SET modelo_override = 'Ka', versao_override = 'Sedan 1.0 SE Flex 4p'
 WHERE modelo ILIKE 'Ka Sedan%' AND modelo_override IS NULL;

UPDATE public.estoque_motors
   SET modelo_override = 'HR-V', versao_override = 'EX 1.8 Flexone 16v 5p Aut'
 WHERE modelo ILIKE 'HR-V Ex%' AND modelo_override IS NULL;

-- "Classe C", e não "C-180": aqui não há hub limpo para juntar — nenhum dos
-- dois merge com nada, então a escolha é de estrutura, não de conserto. O
-- modelo É a Classe C; "C-180" é a designação de motor. Com "Classe C", um
-- C-200 ou C-250 que entre depois cai no mesmo hub em vez de abrir o seu.
-- Este é o único dos quatro que muda o nome exibido, e por isso está
-- separado: se o dono preferir "C-180", é uma edição no painel, sem deploy.
UPDATE public.estoque_motors
   SET modelo_override = 'Classe C', versao_override = 'C-180 CGI Classic 1.8 16v 156cv Aut'
 WHERE modelo ILIKE 'C-180%' AND modelo_override IS NULL;

-- "Novo Voyage 1.0" é o caso que o `canonicalDe` não alcançava por dois
-- motivos: `ehRotuloSujo` não vê sujeira em "novo voyage 10" (não há decimal,
-- nem `Np`, nem `Nv`, nem palavra de transmissão), e o hub limpo `voyage` não é
-- PREFIXO de `novo-voyage-10` — é sufixo. Nenhuma heurística de string ia
-- resolver; o nome do modelo é "Voyage" e ponto.
UPDATE public.estoque_motors
   SET modelo_override = 'Voyage', versao_override = 'Novo 1.0'
 WHERE modelo ILIKE 'Novo Voyage%' AND modelo_override IS NULL;
