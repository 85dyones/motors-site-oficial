-- ==========================================================
-- RLS de estoque_motors — escrita só para sessão autenticada
-- ==========================================================
--
-- Fecha o risco 🔴 `AUDITORIA.md §3.4`, aberto desde sempre e reproduzido no
-- baseline `20260803120000` (que registrou o estado, sem sobrescrever):
--
--   CREATE POLICY "Allow public update access" ... FOR UPDATE USING (true)
--   CREATE POLICY "Allow public insert access" ... FOR INSERT WITH CHECK (true)
--
-- Sem `TO`, essas policies valem para o papel `public` — ou seja, para a anon
-- key, que é pública por natureza porque vai no bundle do browser. Verificado
-- contra produção em 2026-08-08, com a anon key e nada mais: um PATCH anônimo
-- em `estoque_motors` respondeu 200 e devolveu a linha alterada. Qualquer
-- pessoa que abrisse o site podia mudar preço, marcar veículo como vendido ou
-- inserir carro no estoque.
--
-- ----------------------------------------------------------
-- Por que só agora, e por que é seguro fechar
-- ----------------------------------------------------------
--
-- A policy existia porque o painel precisava dela: `ConfiguracoesClientWrapper`
-- fazia `supabase.from("estoque_motors").update()` do lado do CLIENTE, com a
-- anon key. Fechar antes quebraria a edição de veículo.
--
-- Desde `bc76a4c` (tela A6) não há mais escrita pelo cliente: tudo passa por
-- `/api/estoque/[id]` e `/api/estoque/lote`, que usam a sessão do usuário
-- (papel `authenticated`). O teste `painel-grava-colunas` falha se a escrita
-- direta voltar.
--
-- O sincronizador do n8n NÃO é afetado: ele usa `SUPABASE_SERVICE_ROLE_KEY`
-- (verificado no workflow `Antigravity - Sincronizador de Estoque`), e o papel
-- de serviço passa por cima do RLS.
--
-- A leitura pública continua aberta — é a vitrine do site, servida com a anon
-- key. O que muda é só quem escreve.
-- ==========================================================

ALTER TABLE public.estoque_motors ENABLE ROW LEVEL SECURITY;

-- ── leitura pública: garante que existe, sem duplicar ──
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'estoque_motors'
          AND cmd IN ('SELECT', 'ALL')
    ) THEN
        CREATE POLICY "Leitura publica do estoque" ON public.estoque_motors
            FOR SELECT USING (true);
        RAISE NOTICE 'Policy de leitura publica criada.';
    END IF;
END $$;

-- ── derruba a escrita aberta ao público ──
-- Nomes vindos do baseline e confirmados em `supabase_schema.sql:188-198`.
DROP POLICY IF EXISTS "Allow public update access" ON public.estoque_motors;
DROP POLICY IF EXISTS "Allow public insert access" ON public.estoque_motors;
DROP POLICY IF EXISTS "Allow public delete access" ON public.estoque_motors;

-- ── escrita só para quem tem sessão ──
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'estoque_motors'
          AND policyname = 'Escrita do painel autenticado'
    ) THEN
        CREATE POLICY "Escrita do painel autenticado" ON public.estoque_motors
            FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'estoque_motors'
          AND policyname = 'Insercao do painel autenticado'
    ) THEN
        CREATE POLICY "Insercao do painel autenticado" ON public.estoque_motors
            FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
END $$;

-- DELETE segue sem policy nenhuma: ausência de policy é negação. Ninguém
-- apaga veículo pelo painel — o que sai do feed vira "fora do feed" na tela
-- A6, e o histórico do carro precisa da linha viva.

-- ----------------------------------------------------------
-- Autoconferência — falha alto em vez de deixar o buraco aberto
-- ----------------------------------------------------------
-- Se sobrar QUALQUER policy de escrita valendo para `public` ou `anon`, esta
-- migração aborta. É a diferença entre "rodei e achei que fechou" e "fechou".
DO $$
DECLARE
    abertas text;
BEGIN
    SELECT string_agg(policyname || ' (' || cmd || ')', ', ')
      INTO abertas
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'estoque_motors'
      AND cmd IN ('UPDATE', 'INSERT', 'DELETE', 'ALL')
      AND ('public' = ANY(roles) OR 'anon' = ANY(roles));

    IF abertas IS NOT NULL THEN
        RAISE EXCEPTION
            'RLS de estoque_motors ainda tem escrita aberta ao publico: %. '
            'Revise antes de dar por fechado — ver AUDITORIA.md 3.4.', abertas;
    END IF;

    RAISE NOTICE 'estoque_motors: escrita restrita a authenticated; leitura publica preservada.';
END $$;
