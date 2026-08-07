-- ==========================================================
-- Ficha própria do painel — campos nossos em `estoque_motors`
-- ==========================================================
--
-- Decisão do dono em 2026-08-07: o RevendaMais será descontinuado em breve,
-- e os campos de ficha que ele não fornece passam a ser preenchidos POR NÓS,
-- no painel. Isso destrava as duas pendências registradas no baseline
-- (20260803120000, seção "colunas que o código lê e que NÃO EXISTEM"):
-- `placa` e `preco_compra` deixam de ser colunas fantasma e passam a existir
-- de verdade.
--
-- ----------------------------------------------------------
-- ⚠️  CONTRATO COM O SYNC — leia antes de mexer no n8n
-- ----------------------------------------------------------
-- Regra do dono, literal: "se o campo não existe no sync, não sobrescreva,
-- mantenha o atual, mesmo que seja em branco."
--
-- As colunas desta migração NUNCA entram no mapeamento do workflow n8n
-- (`Antigravity - Sincronizador de Estoque`). O upsert do sync só escreve as
-- colunas que ele nomeia — enquanto estas ficarem fora do workflow, o valor
-- digitado no painel sobrevive a qualquer ciclo de sync. Adicioná-las ao n8n
-- quebraria o contrato: o feed as sobrescreveria com vazio.
--
-- O caminho da descontinuação já fica pronto: quando o RevendaMais desligar,
-- o sync para e TODAS as colunas viram nossas — nenhuma migração extra.
--
-- ----------------------------------------------------------
-- Sobre cada coluna
-- ----------------------------------------------------------
-- `placa` — identificador do VEÍCULO, não de pessoa: é dado operacional da
--   loja (laudo, transferência, busca interna). O site público não a exibe;
--   a tela A6 do design doc a usa na busca do painel. A rota
--   /api/financeiro/margens/consulta buscava por placa desde sempre e
--   falhava em silêncio — com a coluna, a busca passa a ser possível.
--
-- `preco_compra` — hoje vive em site_settings/stock_overrides (JSON) e as
--   rotas de margem o mesclam por cima da linha do banco. A coluna nasce
--   para ser a casa definitiva; o painel passa a gravar NOS DOIS lugares e
--   a migração dos valores históricos do JSON para cá é passo posterior,
--   deliberado (não automático — dado financeiro não se move por efeito
--   colateral).
--
-- `motor`, `cor_interna`, `donos_anteriores`, `garantia_fabrica` — a ficha
--   técnica da tela A15 que o feed não tem. Nulos até alguém preencher; o
--   mapper devolve vazio e a UI oculta a linha (regra da casa: nada de
--   default inventado).

ALTER TABLE public.estoque_motors
    ADD COLUMN IF NOT EXISTS placa            text,
    ADD COLUMN IF NOT EXISTS motor            text,
    ADD COLUMN IF NOT EXISTS cor_interna      text,
    ADD COLUMN IF NOT EXISTS donos_anteriores integer,
    ADD COLUMN IF NOT EXISTS garantia_fabrica text,
    ADD COLUMN IF NOT EXISTS preco_compra     numeric(12, 2);

COMMENT ON COLUMN public.estoque_motors.placa IS
    'Preenchida pelo painel. NUNCA entra no mapeamento do sync n8n — '
    'ver contrato na migração 20260807160000.';
COMMENT ON COLUMN public.estoque_motors.motor IS
    'Ficha própria do painel (ex.: "2.0 turbo · 249 cv"). Fora do sync.';
COMMENT ON COLUMN public.estoque_motors.cor_interna IS
    'Ficha própria do painel. Fora do sync — `cor` (externa) é do feed.';
COMMENT ON COLUMN public.estoque_motors.donos_anteriores IS
    'Ficha própria do painel. Fora do sync.';
COMMENT ON COLUMN public.estoque_motors.garantia_fabrica IS
    'Ficha própria do painel (ex.: "Até 03/2027"). Fora do sync.';
COMMENT ON COLUMN public.estoque_motors.preco_compra IS
    'Preenchido pelo painel; casa definitiva do valor que hoje vive em '
    'stock_overrides. Fora do sync. Não exposto ao site público.';
