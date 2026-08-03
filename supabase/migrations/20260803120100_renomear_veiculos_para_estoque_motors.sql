-- ==========================================================
-- RENOMEAR `veiculos` → `estoque_motors` (Pacote 0.5, item 1)
-- ==========================================================
--
-- Decisão do dono do projeto, 2026-08-03, resolvendo AUDITORIA.md §5.1.
--
-- O conflito: `CLAUDE.md` e `docs/MANUAL_MOTORS_CICLO.md` sempre afirmaram que
-- a base gira em torno de `estoque_motors`; o código inteiro usava `veiculos`.
-- A auditoria recomendou manter `veiculos` e corrigir os documentos. A decisão
-- foi a oposta: alinhar o banco aos documentos. Esta migração executa isso.
--
-- ⚠️  ESTA MIGRAÇÃO NÃO É AUTOSSUFICIENTE. É um CUTOVER COORDENADO.
--
--     Rodar este arquivo sozinho, sem os outros dois passos, quebra a
--     sincronização de estoque. Leia `supabase/README.md` — seção "Runbook do
--     cutover" — ANTES de aplicar. Ordem obrigatória:
--
--       1. deploy do código (já usa `estoque_motors`)  ← feito neste pacote
--       2. esta migração                                ← cria a view de compat
--       3. atualizar o nó Supabase do workflow n8n para `estoque_motors`
--       4. migração seguinte, que remove a view de compatibilidade
--
--     O passo 3 é MANUAL, no painel do n8n (n8n.v2o5.com.br). O JSON no
--     repositório é uma cópia exportada, não o workflow ao vivo — editar o
--     arquivo não altera o que está rodando.
--
-- A view de compatibilidade existe para que a janela entre os passos 2 e 3
-- não derrube o sync. Sem ela, o nó `Create a row` do n8n aponta para uma
-- tabela que deixou de existir e o estoque para de atualizar (a cada 6h),
-- silenciosamente.
-- ==========================================================


-- ----------------------------------------------------------
-- 1. O rename
-- ----------------------------------------------------------
-- Guardado e idempotente: só age se houver uma TABELA `veiculos` e ainda não
-- existir `estoque_motors`. Reexecutar é no-op.
--
-- As políticas de RLS, a PK e os índices acompanham a tabela automaticamente
-- (ficam presos ao OID, não ao nome). Não é preciso recriá-los.
--
-- Nota: os NOMES dos constraints/índices continuam com o prefixo `veiculos_`
-- (ex.: `veiculos_pkey`). É cosmético e não afeta funcionamento. Renomeá-los
-- exigiria descobrir os nomes reais em produção — o que AUDITORIA.md §5.3
-- ainda não permite. Deixado como está, deliberadamente.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'veiculos' AND c.relkind = 'r'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'estoque_motors'
    ) THEN
        ALTER TABLE public.veiculos RENAME TO estoque_motors;
        RAISE NOTICE 'Tabela veiculos renomeada para estoque_motors.';
    ELSE
        RAISE NOTICE 'Rename ignorado: veiculos ausente ou estoque_motors ja existe.';
    END IF;
END $$;

COMMENT ON TABLE public.estoque_motors IS
    'Inventário, espelho do feed XML do RevendaMais (sync n8n a cada 6h). '
    'Renomeada de `veiculos` em 2026-08-03 para alinhar com CLAUDE.md e o '
    'manual do Motors Ciclo. Schema ainda não verificado — AUDITORIA.md §5.3.';


-- ----------------------------------------------------------
-- 2. View de compatibilidade — TEMPORÁRIA
-- ----------------------------------------------------------
-- Mantém o nome antigo funcionando enquanto o workflow n8n não é atualizado.
--
-- É uma view simples sobre uma única tabela, sem agregação: o Postgres a torna
-- automaticamente atualizável, então INSERT/UPDATE do n8n atravessam para
-- `estoque_motors` normalmente.
--
-- `security_invoker = true` (PG15+) faz a view respeitar a RLS de quem
-- consulta, em vez de rodar com os privilégios do dono da view. Sem isso, a
-- view seria um caminho para CONTORNAR a RLS da tabela — exatamente o tipo de
-- brecha que CLAUDE.md proíbe abrir.
--
-- 🔻 REMOVER assim que o passo 3 do runbook estiver feito. Enquanto ela
--    existir, o nome antigo continua funcionando e o cutover parece completo
--    sem estar. A migração que a remove é o passo 4.

DROP VIEW IF EXISTS public.veiculos;

CREATE VIEW public.veiculos
    WITH (security_invoker = true)
    AS SELECT * FROM public.estoque_motors;

COMMENT ON VIEW public.veiculos IS
    'COMPATIBILIDADE TEMPORÁRIA — remover após migrar o workflow n8n para '
    'estoque_motors. Criada em 2026-08-03 pelo cutover do Pacote 0.5. '
    'Ver supabase/README.md, "Runbook do cutover", passo 4.';

GRANT SELECT, INSERT, UPDATE ON public.veiculos TO anon, authenticated, service_role;
