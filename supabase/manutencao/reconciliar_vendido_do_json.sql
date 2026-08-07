-- ==========================================================
-- RECONCILIAÇÃO — marcar como vendidos na coluna
-- ==========================================================
--
-- ▶ COLE ESTE ARQUIVO INTEIRO NO SQL EDITOR E EXECUTE.
--   Não há passo comentado: tudo aqui roda.
--
-- ----------------------------------------------------------
-- Por que esta versão é diferente da anterior
-- ----------------------------------------------------------
-- A primeira versão trazia o UPDATE comentado, para ninguém alterar dado por
-- copiar-colar distraído. O efeito prático foi o oposto do pretendido: rodar
-- o arquivo executava só o SELECT de conferência, o editor respondia
-- "Success", e a impressão era de que a reconciliação tinha sido feita — duas
-- vezes seguidas, com os 23 carros seguindo anunciados no site.
--
-- A conferência já foi feita. Esta versão executa.
--
-- Também trocamos a subquery sobre o JSON por uma lista literal de ids: é
-- menos elegante e muito mais previsível — não depende de `jsonb_each`, de
-- LATERAL nem do formato do blob, e o que vai ser alterado está à vista.
--
-- ----------------------------------------------------------
-- O que este script corrige
-- ----------------------------------------------------------
-- Até 2026-08-07 o painel gravava `vendido` só no JSON `stock_overrides`,
-- nunca na coluna. Como a home é Server Component e filtra por `!v.vendido`
-- lendo a COLUNA, esses carros continuaram na vitrine com CTA de WhatsApp
-- ativo. O código já foi corrigido; estes 23 são o passivo de antes.
--
-- Os ids saíram do próprio JSON, conferidos em produção em 2026-08-07.
-- ==========================================================

-- ── 1. Aplica ────────────────────────────────────────────
update public.estoque_motors
   set vendido = true
 where id in (
        6609121, 6984959, 7781099, 7786077, 7950008, 7950065,
        7987637, 8006476, 8038352, 8055096, 8056955, 8061939,
        8089098, 8100626, 8101950, 8138493, 8147325, 8152141,
        8180982, 8196763, 8197237, 8199227, 8238401
       )
   and vendido is distinct from true;

-- ── 2. Confere ───────────────────────────────────────────
-- Esperado depois de aplicar:
--   vendidos = 23 · disponiveis = 65 · total = 88
select count(*) filter (where vendido is true)  as vendidos,
       count(*) filter (where vendido is not true) as disponiveis,
       count(*)                                  as total
  from public.estoque_motors;
