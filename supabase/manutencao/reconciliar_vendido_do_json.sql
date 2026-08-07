-- ==========================================================
-- RECONCILIAÇÃO — trazer `vendido` do JSON para a coluna
-- ==========================================================
--
-- ⚠️  NÃO É MIGRAÇÃO DE SCHEMA. É CORREÇÃO DE DADO EM PRODUÇÃO.
--     Fica em `pendente/` de propósito: `supabase db push` não a aplica.
--     Só rode depois de conferir a lista do passo 1.
--
-- ----------------------------------------------------------
-- O que aconteceu
-- ----------------------------------------------------------
-- Até 2026-08-07 o painel gravava `vendido` apenas no blob JSON
-- `site_settings.stock_overrides`, nunca na coluna `estoque_motors.vendido`
-- (ver o comentário em `handleSaveVehicleOverride`,
-- ConfiguracoesClientWrapper.tsx, e `tests/painel-grava-colunas.test.ts`).
--
-- Como a home é Server Component e filtra por `!v.vendido` lendo a COLUNA —
-- e `applyLocalOverrides` não roda no servidor —, tudo que foi marcado como
-- vendido no painel seguiu anunciado no site.
--
-- Medido em produção em 2026-08-07:
--
--   veículos na tabela ................................. 88
--   com `vendido = true` na COLUNA ...................... 0
--   marcados `vendido: true` no JSON de overrides ....... 23
--   veículos anunciados na home ......................... 88
--
-- Ou seja: 23 carros já vendidos continuam na vitrine, com CTA de WhatsApp
-- ativo. O código já foi corrigido (salvamentos novos gravam nos dois
-- lugares), mas os 23 antigos seguem presos no JSON — este script os move.
--
-- ----------------------------------------------------------
-- PASSO 1 — CONFERIR ANTES (não altera nada)
-- ----------------------------------------------------------
-- Rode só isto primeiro e olhe a lista. Se algum veículo estiver aqui por
-- engano, corrija-o no painel ANTES de rodar o passo 2 — depois de aplicado,
-- desmarcar é manual.

SELECT e.id,
       e.marca,
       e.modelo,
       e.preco,
       e.vendido AS vendido_na_coluna_hoje
  FROM public.estoque_motors AS e
  JOIN (
        SELECT ov.key::bigint AS veiculo_id
          FROM public.site_settings AS s,
               LATERAL jsonb_each(s.data->'overrides') AS ov(key, value)
         WHERE s.id = 'stock_overrides'
           AND ov.value->>'vendido' = 'true'
       ) AS alvo
    ON e.id = alvo.veiculo_id
 ORDER BY e.marca, e.modelo;

-- ----------------------------------------------------------
-- PASSO 2 — APLICAR (altera dado)
-- ----------------------------------------------------------
-- Espera-se `UPDATE 23`. Se o número divergir muito da conferência acima,
-- pare e investigue antes de seguir.

-- UPDATE public.estoque_motors AS e
--    SET vendido = true
--   FROM (
--         SELECT ov.key::bigint AS veiculo_id
--           FROM public.site_settings AS s,
--                LATERAL jsonb_each(s.data->'overrides') AS ov(key, value)
--          WHERE s.id = 'stock_overrides'
--            AND ov.value->>'vendido' = 'true'
--        ) AS alvo
--  WHERE e.id = alvo.veiculo_id
--    AND e.vendido IS DISTINCT FROM true;

-- ----------------------------------------------------------
-- PASSO 3 — VERIFICAR
-- ----------------------------------------------------------
-- Deve devolver 23 (ou o número conferido no passo 1). Depois disso, a home
-- passa a anunciar 88 − 23 = 65 veículos.

-- SELECT count(*) AS vendidos_na_coluna
--   FROM public.estoque_motors
--  WHERE vendido IS true;

-- ----------------------------------------------------------
-- Nota sobre o `preco_compra`
-- ----------------------------------------------------------
-- O mesmo blob guarda `preco_compra` de alguns veículos, e a coluna passou a
-- existir na migração 20260807160000. NÃO é reconciliado aqui de propósito:
-- é dado financeiro, as rotas de margem ainda leem do JSON, e mover a fonte
-- exige decisão própria. Enquanto isso, os dois lugares convivem.
