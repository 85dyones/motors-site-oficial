-- ==========================================================
-- BASELINE — tabela de inventário (Pacote 0.5, item 5)
-- ==========================================================
--
-- Inaugura `supabase/migrations/`. Até esta migração o projeto violava
-- CLAUDE.md:62 ("migrações são versionadas") — havia apenas
-- `supabase_schema.sql`, um script de colar no SQL Editor do painel.
--
-- Esta migração versiona a ÚNICA tabela que nunca esteve sob controle de
-- versão nenhum: a de inventário. `supabase_schema.sql` só a altera
-- (ALTER TABLE ... ADD COLUMN IF NOT EXISTS), nunca a cria — ela nasceu
-- fora do repositório, criada à mão no painel ou pelo n8n.
--
-- ⚠️  SCHEMA RECONSTRUÍDO, NÃO VERIFICADO CONTRA PRODUÇÃO.
--     AUDITORIA.md §5.3 continua em aberto: o banco não foi inspecionado
--     (credenciais Supabase vazias em `.env.local`, MCP exige OAuth).
--     Cada coluna abaixo traz a origem de onde foi inferida. Os TIPOS são
--     a parte mais frágil da inferência — especialmente `id` e os campos
--     de imagem.
--
--     Assim que houver acesso ao banco, rode `supabase db pull` e
--     substitua este arquivo pelo schema real. Até lá, `IF NOT EXISTS`
--     garante que esta migração seja NO-OP em produção, onde a tabela já
--     existe: ela serve para criar bancos de dev/teste, não para alterar
--     o que está no ar.
--
-- Fontes da reconstrução:
--   (n8n)    workflow "Antigravity - Sincronizador de Estoque (veiculos)",
--            nó Code → nó Supabase `Create a row` com autoMapInputData
--   (ALTER)  supabase_schema.sql:176-182
--   (app)    colunas lidas pelo código mas ausentes do sync
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.veiculos (
    -- (n8n) `id = parseInt(carro.ID)` — o ID do ANÚNCIO no RevendaMais.
    -- Não é chassi, não é placa, não é UUID. O código convive com ambiguidade
    -- de tipo: getVeiculoById tenta string e depois número
    -- (src/lib/supabase.ts:470-485) e `contas.veiculo_id` é TEXT.
    -- ⚠️ tipo inferido de parseInt — confirmar contra produção.
    id                 bigint PRIMARY KEY,

    -- (n8n) identificação e ficha técnica
    marca              text,
    modelo             text,
    versao             text,
    ano                integer,
    ano_fabricacao     integer,
    quilometragem      integer,
    cambio             text,
    combustivel        text,
    cor                text,

    -- (n8n) preços. `preco_compra` NÃO vem do sync — ver bloco (app) abaixo.
    preco              numeric,
    preco_original     numeric,
    preco_promocional  numeric,

    -- (n8n) mídia e conversão.
    -- ⚠️ jsonb inferido de o nó n8n inserir arrays JSON e de o mapper fazer
    --    Array.isArray() (src/lib/supabase.ts:223-229). Pode ser text[].
    url_imagem         text,
    link_conversao     text,
    whatsapp_images    jsonb,
    web_full_images    jsonb,

    -- (n8n) conteúdo
    pericia            text,
    descricao          text,

    -- (n8n + ALTER) classificação. Gravadas pelo sync E pelo painel admin.
    tipo               text,
    perfil_uso         text,

    -- (ALTER) supabase_schema.sql:176-182 — colunas do painel administrativo
    laudo_pericia      text,
    opcionais          text,
    status_tag         text,
    status_tag_color   text,
    vendido            boolean DEFAULT false,

    -- (app) lidas pelo código, ausentes do sync do RevendaMais.
    -- `placa`: o front declara no tipo Veiculo mas usa o default "V-REF100"
    --   quando ausente (src/lib/supabase.ts:358) — indício forte de coluna
    --   vazia em produção. AUDITORIA.md §5.3.
    -- `preco_compra`: custo de aquisição, lido em /api/financeiro/margens.
    --   Nunca exposto ao front, por decisão de segurança.
    -- `fipe`: lido pelo mapper.
    placa              text,
    preco_compra       numeric,
    fipe               text
);

COMMENT ON TABLE public.veiculos IS
    'Inventário, espelho do feed XML do RevendaMais (sync n8n a cada 6h). '
    'Schema reconstruído no baseline 20260803120000 e ainda NÃO verificado '
    'contra produção — ver AUDITORIA.md §5.3.';

-- ----------------------------------------------------------
-- RLS — preservada exatamente como está em produção
-- ----------------------------------------------------------
--
-- 🔴 RISCO DE PRODUÇÃO CONHECIDO — AUDITORIA.md §3.4.
--
-- Estas políticas são `USING (true)` sem restrição de role. A anon key é
-- pública por natureza (vai no bundle do browser), então como está escrito
-- QUALQUER PESSOA pode alterar preço, marcar veículo como vendido ou
-- inserir veículos.
--
-- Isso NÃO é acidente de configuração: o painel admin depende disso —
-- ConfiguracoesClientWrapper.tsx:489 faz .update() do lado do cliente com a
-- anon key. Fechar a policy quebra o painel de estoque. Corrigir exige mover
-- essa escrita para uma API route com service role.
--
-- Reproduzido aqui de propósito: o baseline registra o que existe, não o que
-- deveria existir. Corrigir é decisão do dono, fora do escopo do Pacote 0.5.
--
-- ⚠️  MAS NÃO SOBRESCREVE.
--
--     A auditoria registra que produção "pode ter sido endurecida à mão" e que
--     isso não é verificável sem acesso ao banco (§3.4). Se alguém já fechou
--     essas policies, um `DROP POLICY` + `CREATE POLICY ... USING (true)` cego
--     aqui REABRIRIA a brecha — silenciosamente, no meio de um `db push`, sob
--     o nome inofensivo de "baseline".
--
--     Por isso o bloco abaixo só age se a tabela ainda NÃO tiver policy
--     nenhuma. Numa base nova ele reproduz o estado atual; numa produção já
--     endurecida ele não toca em nada.

ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'veiculos'
    ) THEN
        RAISE NOTICE 'RLS de veiculos ja tem policies — baseline nao sobrescreve.';
        RETURN;
    END IF;

    CREATE POLICY "Allow public read access" ON public.veiculos
        FOR SELECT USING (true);

    CREATE POLICY "Allow public update access" ON public.veiculos
        FOR UPDATE USING (true) WITH CHECK (true);

    CREATE POLICY "Allow public insert access" ON public.veiculos
        FOR INSERT WITH CHECK (true);

    RAISE NOTICE 'Policies publicas de veiculos criadas (estado atual reproduzido).';
END $$;
