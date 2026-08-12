-- ==========================================================
-- RLS de site_settings — escrita só para sessão autenticada
-- ==========================================================
--
-- Buraco encontrado em 2026-08-12, ao conferir o resultado da migração
-- `20260812120000` contra produção. Fechar a LEITURA revelou que a ESCRITA
-- nunca foi fechada:
--
--     [UPDATE] Allow public update access | roles={public}
--              USING (true) WITH CHECK (true)
--     [INSERT] Allow public insert access | roles={public}
--              WITH CHECK (true)
--
-- Sem `TO`, valem para o papel `public` — ou seja, para a anon key, que vai no
-- bundle do navegador. **Verificado contra produção no mesmo dia**, com a anon
-- key e nada mais: um PATCH em `site_settings?id=eq.company` respondeu 200 e
-- devolveu a linha. (A prova foi feita regravando `updated_at` com o valor que
-- já estava lá — nenhum dado foi alterado.)
--
-- É o mesmo defeito que `20260808120000` fechou em `estoque_motors`, na mesma
-- semana, pela mesma causa: policy do baseline escrita sem `TO`. `site_settings`
-- ficou de fora daquela migração e ninguém voltou.
--
-- ----------------------------------------------------------
-- Por que isto é pior que o vazamento de leitura
-- ----------------------------------------------------------
--
-- Ler `apiSecretToken` é ruim. Poder ESCREVER em `site_settings` é controle do
-- site, sem login:
--
--  - reescrever `webhooks.webhookUrl` desvia TODO lead do site para o endpoint
--    de quem editou — e o site não acusa nada, porque o disparo é
--    não-bloqueante por projeto (ver "Modos de falha" em WEBHOOKS_N8N.md);
--  - reescrever `company.whatsappRaw` / `phone` troca o número que aparece em
--    todo botão de WhatsApp da loja, desviando o atendimento inteiro;
--  - reescrever `popups.campaigns[].actionTarget` publica link arbitrário num
--    modal que abre sozinho para o visitante.
--
-- Nenhuma dessas edições exige senha hoje. Todas somem do radar: o painel
-- mostraria o valor novo como se o dono o tivesse digitado.
--
-- ----------------------------------------------------------
-- Por que é seguro fechar
-- ----------------------------------------------------------
--
-- Nada no navegador escreve nesta tabela. O painel salva por `/api/settings`
-- (POST), que exige sessão — cookie ou Bearer — e usa o cliente autenticado do
-- próprio usuário para o `upsert`. Papel `authenticated`, portanto coberto.
--
-- O `upsert` precisa dos três: INSERT, UPDATE e SELECT. O SELECT para
-- `authenticated` foi criado em `20260812120000` ("Leitura completa com
-- sessao"); sem ele o `ON CONFLICT DO UPDATE` não enxergaria a linha.
--
-- `TO authenticated`, e não admin-only: `/api/settings` POST autoriza por
-- sessão, não por perfil, e quem edita popup ou tag rápida no painel pode ser
-- Marketing ou Comercial. Quem faz o recorte fino por perfil é a matriz A17
-- (`src/lib/permissoes.ts`), na aplicação. Estreitar aqui para admin quebraria
-- o painel de quem não é admin — decisão consciente, não esquecimento.
--
-- O sincronizador do n8n não é afetado: usa `SUPABASE_SERVICE_ROLE_KEY`.
-- ==========================================================

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- ── derruba a escrita aberta ao público ──
--
-- Dinâmico, como em `20260812120000`: o nome vem do baseline, mas produção já
-- divergiu dele uma vez (o baseline promete "Allow admin update access" e o
-- que está no ar é "Allow public update access"). DROP por nome deixaria
-- passar uma policy renomeada e a migração terminaria verde com a porta aberta.
DO $$
DECLARE
    p record;
BEGIN
    FOR p IN
        SELECT policyname, cmd
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'site_settings'
           AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
           AND ('public' = ANY(roles) OR 'anon' = ANY(roles))
    LOOP
        EXECUTE format('DROP POLICY %I ON public.site_settings', p.policyname);
        RAISE NOTICE 'Escrita aberta removida: % (%)', p.policyname, p.cmd;
    END LOOP;
END $$;

-- ── escrita só para quem tem sessão ──
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'site_settings'
          AND policyname = 'Escrita de settings com sessao'
    ) THEN
        CREATE POLICY "Escrita de settings com sessao" ON public.site_settings
            FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'site_settings'
          AND policyname = 'Insercao de settings com sessao'
    ) THEN
        CREATE POLICY "Insercao de settings com sessao" ON public.site_settings
            FOR INSERT TO authenticated WITH CHECK (true);
    END IF;
END $$;

-- DELETE segue sem policy: ausência é negação. O painel nunca apaga linha de
-- configuração — esvaziar uma seção grava `{}` ou `[]`, não remove a linha.

-- ----------------------------------------------------------
-- Autoconferência — tenta escrever como `anon`, de verdade
-- ----------------------------------------------------------
-- Mesmo método de `20260812120000`: em vez de reler `pg_policies` e torcer,
-- vira `anon` e tenta o UPDATE. Roda dentro do bloco, então qualquer alteração
-- que passasse seria desfeita pelo RAISE — mas o objetivo é justamente que NÃO
-- passe. `USING (true)` valia para todo mundo; se ainda valer, isto acusa.
DO $$
DECLARE
    afetadas integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        RAISE NOTICE 'Papel `anon` inexistente (banco fora do Supabase) — autoconferencia pulada.';
        RETURN;
    END IF;

    SET LOCAL ROLE anon;

    -- Regrava `updated_at` com o valor que já está lá: se a policy barrar,
    -- afeta 0 linhas; se passar, afeta 1 e nada muda de conteúdo.
    UPDATE public.site_settings SET updated_at = updated_at WHERE id = 'company';
    GET DIAGNOSTICS afetadas = ROW_COUNT;

    RESET ROLE;

    IF afetadas > 0 THEN
        RAISE EXCEPTION
            'site_settings ainda aceita UPDATE anonimo (% linha(s)). '
            'Revise as policies de escrita antes de dar por fechado.', afetadas;
    END IF;

    RAISE NOTICE 'site_settings: escrita restrita a authenticated; anonimo barrado.';
EXCEPTION
    WHEN insufficient_privilege THEN
        -- `anon` sem GRANT de UPDATE é ainda mais fechado que o pretendido.
        RESET ROLE;
        RAISE NOTICE 'Papel `anon` sem UPDATE em site_settings — fechado por GRANT.';
END $$;
