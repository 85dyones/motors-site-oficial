-- ==========================================================
-- `perfis_uso` — vários usos por carro, e as vitrines que saem disso
-- ==========================================================
--
-- `perfil_uso` (singular) guarda UM texto por veículo. O defeito de fundo é
-- que um carro é várias coisas ao mesmo tempo: um HB20 é urbano, econômico e
-- primeiro carro, e um valor só obriga a escolher qual verdade contar.
--
-- Medido nos 38 veículos servidos em 2026-08-26, lendo o payload embutido em
-- `/estoque` (que revalida a cada 60s, ao contrário das páginas de recorte):
--
--   Família / Conforto      12      URBANO & EFICIENTE       0
--   Econômico / Diário      12      FORÇA & OFF-ROAD         0
--   Uso Diário               5      LINHAGEM ESPORTIVA       0
--   Performance / Premium    4      CURADORIA EXCLUSIVA      0
--   Trabalho / Robustez      3
--   Agilidade / Economia     2
--
-- Três valores diziam quase a mesma coisa — 19 dos 38 —, e quatro não existiam
-- em veículo nenhum, o que mantinha `/destaques/curadoria` indexado com a
-- vitrine vazia.
--
-- ----------------------------------------------------------
-- Contrato da coluna
-- ----------------------------------------------------------
-- Campo do painel, como `tipo` e `descricao_seo`: entra em `CAMPOS_NOSSOS`
-- (`src/lib/estoqueEscrita.ts`) e o sincronizador do RevendaMais não o conhece.
--
-- ⚠️  **Não acrescentar ao corpo do upsert do n8n.** Vale o mesmo aviso do
-- `modelo_override`: no dia em que alguém incluir, toda classificação feita à
-- mão é apagada no sync seguinte, sem erro e sem log.
--
-- `perfil_uso` (singular) NÃO é removida. Fica como leitura de compatibilidade
-- para linhas que ainda não passaram pelo backfill. Remover coluna é
-- irreversível e ela não atrapalha.
--
-- O vocabulário vive em `src/lib/perfisDeUso.ts`, com o título de cada vitrine
-- escrito por extenso — "Carros para família", "Primeiro carro". Montar a
-- frase produziria "Carros para primeiro carro", que é o mesmo erro dos
-- plurais de carroceria.
-- ==========================================================

ALTER TABLE public.estoque_motors
    ADD COLUMN IF NOT EXISTS perfis_uso text[];

COMMENT ON COLUMN public.estoque_motors.perfis_uso IS
    'Para que o carro serve, um ou varios: familia, primeiro-carro, urbano, '
    'estrada, trabalho, performance, off-road, economico. Vocabulario fechado '
    'em src/lib/perfisDeUso.ts, e cada valor vira /estoque/{slug}. Campo do '
    'painel: NAO acrescentar ao payload do sincronizador. NULL significa que a '
    'linha ainda le o perfil_uso singular.';

-- "Quais carros servem para família?" é a pergunta natural sobre esta coluna,
-- e ela vira `perfis_uso @> ARRAY['familia']`. GIN é o índice que serve
-- contenção em array.
CREATE INDEX IF NOT EXISTS estoque_motors_perfis_uso_idx
    ON public.estoque_motors USING GIN (perfis_uso);

-- ----------------------------------------------------------
-- Backfill a partir do vocabulário antigo
-- ----------------------------------------------------------
-- Os seis valores abaixo são os que EXISTEM no dado, lidos do payload de
-- `/estoque` na data acima — não deduzidos de slug nem de rótulo de tela. Foi
-- a dedução a partir do slug que estragou um veículo na rodada do
-- `modelo_override`, e a regra saiu de lá para cá.
--
-- Os padrões usam `%` no lugar do acento para não depender da normalização do
-- banco, e não se sobrepõem entre si: cada um casa uma linha do de-para e só.
--
-- `perfis_uso IS NULL` mantém a migração idempotente e impede que ela desfaça
-- classificação feita no painel depois.

UPDATE public.estoque_motors SET perfis_uso = ARRAY['familia']
 WHERE perfil_uso ILIKE 'fam%lia%conforto' AND perfis_uso IS NULL;

-- "Econômico / Diário" e "Agilidade / Economia" viram DOIS perfis: quem era
-- esses dois é econômico e urbano ao mesmo tempo. É o caso que motivou a
-- coluna ser array.
UPDATE public.estoque_motors SET perfis_uso = ARRAY['urbano', 'economico']
 WHERE perfil_uso ILIKE 'econ%mico%di%rio' AND perfis_uso IS NULL;

UPDATE public.estoque_motors SET perfis_uso = ARRAY['urbano', 'economico']
 WHERE perfil_uso ILIKE 'agilidade%economia' AND perfis_uso IS NULL;

UPDATE public.estoque_motors SET perfis_uso = ARRAY['urbano']
 WHERE perfil_uso ILIKE 'uso di%rio' AND perfis_uso IS NULL;

UPDATE public.estoque_motors SET perfis_uso = ARRAY['performance']
 WHERE perfil_uso ILIKE 'performance%premium' AND perfis_uso IS NULL;

UPDATE public.estoque_motors SET perfis_uso = ARRAY['trabalho']
 WHERE perfil_uso ILIKE 'trabalho%robustez' AND perfis_uso IS NULL;

-- `primeiro-carro`, `estrada` e `off-road` nascem VAZIOS de propósito: nenhum
-- valor antigo corresponde a eles, e adivinhar a partir de preço ou carroceria
-- seria o mesmo palpite que `resolveTipo` já expulsou do código em 2026-08-06.
-- A vitrine desses três só existe depois que o dono marcar — ver
-- `docs/PERFIS_A_REVISAR.md`, que traz a proposta carro a carro.
