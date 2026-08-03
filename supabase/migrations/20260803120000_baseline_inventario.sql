-- ==========================================================
-- BASELINE — tabela de inventário (Pacote 0.5, item 5)
-- ==========================================================
--
-- Inaugura `supabase/migrations/`. Até esta migração o projeto violava
-- CLAUDE.md:62 ("migrações são versionadas") — havia apenas
-- `supabase_schema.sql`, um script de colar no SQL Editor do painel.
--
-- Versiona a ÚNICA tabela que nunca esteve sob controle de versão nenhum: a de
-- inventário. `supabase_schema.sql` só a altera (ALTER TABLE ... ADD COLUMN IF
-- NOT EXISTS), nunca a cria — ela nasceu fora do repositório.
--
-- ✅ SCHEMA VERIFICADO CONTRA PRODUÇÃO em 2026-08-03.
--    Projeto `zwbqmzgnagfeqinqkolp`, 78 linhas, 27 colunas.
--    Resolve AUDITORIA.md §5.3.
--
--    A primeira versão deste arquivo era uma RECONSTRUÇÃO inferida do workflow
--    n8n e das colunas lidas pelo código, e estava errada em 4 pontos —
--    declarava `placa`, `fipe` e `preco_compra`, que NÃO existem, e omitia
--    `created_at`, que existe. Corrigida aqui contra o banco real.
--
--    Correção segura: em produção esta migração foi NO-OP (a tabela já
--    existia, e `IF NOT EXISTS` a preservou). Editar o arquivo não altera o
--    que está no ar — só corrige a criação de bancos de dev e teste.
--    Se algum dia `supabase db push` reclamar de histórico, resolver com
--    `supabase migration repair --status applied 20260803120000`.
--
-- ⚠️  RESSALVA — tipos das colunas de imagem.
--    Nomes de coluna e tipos foram lidos do banco via PostgREST, que devolve
--    `jsonb` e `text[]` da mesma forma: um array JSON. `whatsapp_images` e
--    `web_full_images` podem ser qualquer um dos dois. Rodar
--    `supabase link` + `supabase db pull` resolve em definitivo — agora é
--    possível, as credenciais existem.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.veiculos (
    -- `id = parseInt(carro.ID)` no workflow n8n — o ID do ANÚNCIO no
    -- RevendaMais. Não é chassi, não é placa, não é UUID.
    -- Verificado: valores como 7950008. O código convive com ambiguidade de
    -- tipo (getVeiculoById tenta string e depois número, src/lib/supabase.ts),
    -- e `contas.veiculo_id` é TEXT — o join já é frouxo.
    id                 bigint PRIMARY KEY,

    -- Identificação e ficha técnica. Gravadas em minúsculas pelo sync; a
    -- capitalização para exibição acontece no mapper, não no banco.
    marca              text,
    modelo             text,
    versao             text,
    ano                integer,
    ano_fabricacao     integer,
    quilometragem      integer,
    cambio             text,
    combustivel        text,
    cor                text,

    -- Preços.
    preco              numeric,
    preco_original     numeric,
    preco_promocional  numeric,

    -- Mídia e conversão. Imagens hospedadas no S3 do RevendaMais
    -- (s3.carro57.com.br). Ver ressalva sobre o tipo, no cabeçalho.
    url_imagem         text,
    link_conversao     text,
    whatsapp_images    jsonb,
    web_full_images    jsonb,

    -- Conteúdo.
    pericia            text,
    descricao          text,

    -- Classificação. Gravadas pelo sync E pelo painel admin.
    tipo               text,
    perfil_uso         text,

    -- Colunas do painel administrativo (supabase_schema.sql:176-182).
    -- Verificado: as quatro estão NULL em toda a amostra — o painel existe,
    -- mas essas quatro nunca foram preenchidas em produção.
    laudo_pericia      text,
    opcionais          text,
    status_tag         text,
    status_tag_color   text,

    vendido            boolean DEFAULT false,

    created_at         timestamptz DEFAULT now()
);

-- ----------------------------------------------------------
-- 🔴 Colunas que o código lê e que NÃO EXISTEM no banco
-- ----------------------------------------------------------
--
-- Deliberadamente NÃO criadas aqui. O baseline registra o que existe; criá-las
-- para "consertar" as queries seria mudar produção por baixo de uma decisão que
-- não é minha — e as duas primeiras quebram funcionalidade real hoje:
--
--   `preco_compra`  — /api/financeiro/margens seleciona esta coluna
--                     explicitamente. A query FALHA inteira:
--                     "column estoque_motors.preco_compra does not exist".
--                     O painel de margens não lista nada.
--
--   `placa`         — /api/financeiro/margens/consulta busca por placa com
--                     .ilike("placa", ...). A query falha, mas o código
--                     ignora o `error` e cai no fallback por ID — falha
--                     SILENCIOSA, a busca por placa nunca funcionou.
--
--   `fipe`          — lida pelo mapper, que já tem default ("Consulta Fipe").
--                     Inofensiva.
--
-- Nenhuma delas é regressão do rename: nunca existiram. O rename só tornou o
-- erro visível, porque forçou a primeira verificação real do schema.
--
-- Decisão pendente do dono: criar as colunas e popular, ou remover as leituras
-- do código. Fora do escopo do Pacote 0.5.

-- ----------------------------------------------------------
-- RLS — preservada como está em produção
-- ----------------------------------------------------------
--
-- 🔴 RISCO DE PRODUÇÃO CONHECIDO — AUDITORIA.md §3.4.
--
-- Estas políticas são `USING (true)` sem restrição de role. A anon key é
-- pública por natureza (vai no bundle do browser), então como está escrito
-- QUALQUER PESSOA pode alterar preço, marcar veículo como vendido ou inserir
-- veículos.
--
-- Não é acidente: o painel admin depende disso —
-- ConfiguracoesClientWrapper.tsx faz .update() do lado do cliente com a anon
-- key. Fechar a policy quebra o painel. Corrigir exige mover a escrita para
-- uma API route com service role.
--
-- ⚠️  NÃO SOBRESCREVE. Se alguém já endureceu essas policies à mão, um
--     DROP POLICY + CREATE ... USING (true) cego aqui REABRIRIA a brecha,
--     em silêncio, no meio de um `db push`, sob o nome de "baseline".
--     Por isso o bloco abaixo só age se não houver policy nenhuma.

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

COMMENT ON TABLE public.veiculos IS
    'Inventário, espelho do feed XML do RevendaMais (sync n8n a cada 6h). '
    'Schema verificado contra produção em 2026-08-03.';
