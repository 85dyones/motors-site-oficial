-- ==========================================================
-- RLS de site_settings — leitura anônima só do recorte público
-- ==========================================================
--
-- Fecha o buraco registrado em `WEBHOOKS_N8N.md` e verificado contra produção
-- em 2026-08-12: a tabela INTEIRA responde à chave `anon` — a mesma que vai no
-- bundle do navegador. Um cliente criado só com `NEXT_PUBLIC_SUPABASE_ANON_KEY`
-- (papel confirmado como `anon` decodificando o JWT) lista e lê:
--
--     quick_tags, stock_overrides, carousel_vehicles, about,
--     webhooks, popups, company, areas_home
--
-- A causa é a policy do baseline (`supabase_schema.sql:34-36`):
--
--     CREATE POLICY "Allow public read access" ... FOR SELECT USING (true)
--
-- Sem `TO` e sem predicado, ela vale para o papel `public` — todo mundo.
--
-- ----------------------------------------------------------
-- O que vazava
-- ----------------------------------------------------------
--
--  - `webhooks` sai inteira, `apiSecretToken` incluído. É o token que autentica
--    o POST para o n8n e que `/api/financeiro/margens/consulta` exige para
--    devolver margem de veículo. Público, ele não autentica nada.
--  - `stock_overrides` é onde vive `preco_compra`, o custo de aquisição por
--    veículo (ver `20260807160000_ficha_propria_do_painel.sql`). Em 2026-08-12
--    havia 1 veículo lá e nenhum com preço preenchido: a porta estava aberta,
--    mas ainda não passou nada por ela.
--  - `bank_balances` (saldos da loja) ainda não existe como linha, mas nasceria
--    pública no dia em que o painel a gravasse.
--
-- O conserto de 2026-08-06 recortou a resposta do `GET /api/settings` para
-- visitante sem sessão (ver o comentário no topo de `src/app/api/settings/
-- route.ts`). Ele continua valendo — mas cuidava só da ROTA. Bastava pular a
-- rota e falar com o PostgREST direto para receber tudo de volta.
--
-- ----------------------------------------------------------
-- O que continua público, e por quê
-- ----------------------------------------------------------
--
-- A lista abaixo espelha `recortePublicoDeSettings` (src/lib/settings.ts):
-- são as linhas que alimentam páginas servidas a quem não tem sessão — home,
-- estoque, destaques, PDP, sitemap.
--
-- Com uma exceção deliberada: **`stock_overrides` NÃO entra**. A RLS decide por
-- linha, e essa linha é mista — carrega tanto ajuste de vitrine (`vendido`,
-- `status_tag`, `descricao`) quanto `preco_compra`. Não dá para liberar metade
-- de um `jsonb`. Quem faz esse recorte é `filtrarOverridesPublicos`, no
-- servidor, sobre o blob completo lido com a chave de serviço; o visitante
-- recebe o resultado filtrado por `/api/settings`, nunca a linha crua.
--
-- Whitelist em vez de blacklist, pela mesma razão que a lista de campos em
-- `src/lib/settings.ts:115`: linha nova criada no painel amanhã nasce privada,
-- não pública.
--
-- ----------------------------------------------------------
-- Por que não quebra o site
-- ----------------------------------------------------------
--
-- `getCachedSettings` lia a tabela com a anon key, sem sessão nenhuma — é a
-- função por trás de TODA página pública e do próprio painel. Fechar a RLS sem
-- mais nada a deixaria sem `webhooks` e sem `stock_overrides`, em silêncio.
-- No mesmo commit desta migração ela passa a preferir `SUPABASE_SERVICE_ROLE_KEY`
-- (que passa por cima do RLS) e a avisar alto quando cai na anon.
--
-- Os três caminhos sem sessão que liam `webhooks` direto — `/api/leads`,
-- `/api/avaliacao` e `/api/financeiro/margens/consulta` — passam a ler pelo
-- mesmo `getCachedSettings`. Sem isso, o `select` devolveria null e:
--   - o lead sairia para o n8n sem `Authorization`, e o disparo é não-bloqueante
--     (falha invisível: `tests/webhooks-contrato.test.ts` protege a regra);
--   - a validação do token em `/margens/consulta` cairia calada no fallback de
--     env — e, se a env estiver vazia, a rota deixaria de validar QUALQUER coisa.
--
-- O sincronizador do n8n não é afetado: usa `SUPABASE_SERVICE_ROLE_KEY`.
-- ==========================================================

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- ── derruba toda leitura aberta ao público ──
--
-- Dinâmico em vez de `DROP POLICY IF EXISTS "Allow public read access"`:
-- AUDITORIA.md §3.4 avisa que produção pode ter sido mexida à mão e que isso
-- não é verificável daqui. Um DROP por nome deixaria passar uma policy
-- renomeada — e a migração terminaria verde com a porta aberta.
--
-- Só `cmd = 'SELECT'`: uma policy `ALL` para `public` seria escrita anônima em
-- site_settings, coisa bem pior, e não é este arquivo que decide o que fazer
-- com ela. A autoconferência no fim aborta se ela existir.
DO $$
DECLARE
    p record;
BEGIN
    FOR p IN
        SELECT policyname
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'site_settings'
           AND cmd = 'SELECT'
           AND ('public' = ANY(roles) OR 'anon' = ANY(roles))
    LOOP
        EXECUTE format('DROP POLICY %I ON public.site_settings', p.policyname);
        RAISE NOTICE 'Leitura aberta removida: %', p.policyname;
    END LOOP;
END $$;

-- ── leitura anônima: só o recorte público ──
CREATE POLICY "Leitura anonima do recorte publico" ON public.site_settings
    FOR SELECT TO anon
    USING (id IN (
        'company',              -- telefone, endereço, horário: rodapé de toda página
        'about',                -- texto institucional de /quem-somos
        'popups',               -- campanhas que o visitante vê
        'quick_tags',           -- filtros da vitrine
        'carousel_vehicles',    -- carrossel da home
        'procedencia',          -- faixa da PDP
        'instagram_curadoria',  -- faixa de fotos da home
        'areas_home'            -- ordem e visibilidade das seções da home
    ));

-- ── leitura completa: quem tem sessão ──
--
-- Precisa existir separado. O painel salva com `upsert` usando a sessão do
-- usuário (`/api/settings` POST): sem policy de SELECT para `authenticated`, o
-- `ON CONFLICT DO UPDATE` não enxerga a linha que vai atualizar e a gravação
-- passa a falhar — inclusive nas linhas que nada têm de sensível.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'site_settings'
          AND policyname = 'Leitura completa com sessao'
    ) THEN
        CREATE POLICY "Leitura completa com sessao" ON public.site_settings
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- A escrita não é assunto desta migração: as policies de INSERT/UPDATE do
-- baseline já exigem `auth.role() = 'authenticated'` mais perfil admin
-- (`supabase_schema.sql:38-60`). DELETE segue sem policy — ausência é negação.

-- ----------------------------------------------------------
-- Autoconferência — pergunta ao banco, não ao SQL
-- ----------------------------------------------------------
-- Em vez de inspecionar `pg_policies` e torcer para ter lido a policy certa,
-- vira `anon` de verdade e tenta ler as linhas sensíveis. É a mesma coisa que
-- um visitante faria com a chave do bundle. Se voltar qualquer uma, aborta.
--
-- Pega inclusive o caso que o DROP acima deixou de propósito: uma policy `ALL`
-- para `public` faria estas linhas aparecerem aqui.
DO $$
DECLARE
    vazou text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        RAISE NOTICE 'Papel `anon` inexistente (banco fora do Supabase) — autoconferencia pulada.';
        RETURN;
    END IF;

    SET LOCAL ROLE anon;

    SELECT string_agg(id, ', ' ORDER BY id) INTO vazou
      FROM public.site_settings
     WHERE id IN ('webhooks', 'stock_overrides', 'bank_balances');

    RESET ROLE;

    IF vazou IS NOT NULL THEN
        RAISE EXCEPTION
            'site_settings ainda entrega linha sensivel ao anonimo: %. '
            'Revise as policies de SELECT antes de dar por fechado.', vazou;
    END IF;

    RAISE NOTICE 'site_settings: anonimo le so o recorte publico; sessao le tudo.';
EXCEPTION
    WHEN insufficient_privilege THEN
        -- `anon` sem GRANT de SELECT na tabela é ainda mais fechado que o
        -- pretendido, não menos. Não é motivo para abortar.
        RESET ROLE;
        RAISE NOTICE 'Papel `anon` sem SELECT em site_settings — fechado por GRANT.';
END $$;
