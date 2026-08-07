-- ==========================================================
-- Leads — persistência (telas A1, A8 e A9)
-- ==========================================================
--
-- Decisão do dono em 2026-08-07, respondendo às três perguntas que o pacote
-- exigia (ver CLAUDE.md, "quando parar e perguntar"):
--
--   o que gravar ....... nome, telefone e interesse
--   por quanto tempo ... sem data de expiração
--   quem pode ver ...... painel autenticado
--
-- ----------------------------------------------------------
-- ⚠️  JÁ EXISTE UMA TABELA `leads` — e ela não é o que parecia
-- ----------------------------------------------------------
-- A primeira versão desta migração assumia tabela nova e falhou em produção
-- com `42703: column "telefone" does not exist`: o `CREATE TABLE IF NOT
-- EXISTS` virou no-op sobre uma tabela preexistente, e o `COMMENT ON COLUMN`
-- seguinte bateu numa coluna que não existia lá.
--
-- Verificado contra produção em 2026-08-07, com a chave de serviço (para
-- enxergar além da RLS):
--
--   colunas ...... id, nome, email, created_at
--   linhas ....... 0
--
-- É uma tabela vestigial — criada em algum momento e nunca usada, porque o
-- lead sempre foi direto para o webhook do n8n. Como está vazia, DROP seria
-- inofensivo; mesmo assim esta migração é **aditiva**, por duas razões:
--
--   1. `email` já está lá e o formulário do site coleta e-mail em alguns
--      fluxos — aproveitar a coluna é melhor que recriá-la depois;
--   2. `DROP TABLE` numa migração é uma arma que fica no repositório. Se
--      alguém a reexecutar num banco onde a tabela JÁ tem dados (um restore,
--      outro ambiente), apaga tudo em silêncio. `ADD COLUMN IF NOT EXISTS`
--      não tem esse risco.
--
-- Também é a razão de tudo aqui ser idempotente: esta migração precisa rodar
-- tanto no banco que já tem a tabela quanto num criado do zero.
-- ==========================================================

-- Cria só se não existir (banco novo). Em produção é no-op.
create table if not exists public.leads (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    email text,
    created_at timestamptz not null default now()
);

-- ── o que o dono pediu, somado ao que já existia ──
alter table public.leads
    add column if not exists telefone  text,
    add column if not exists interesse text;

-- ── contexto de atendimento, sem PII adicional ──
alter table public.leads
    -- De onde veio (PDP, catálogo, pop-up, avaliação, profiler…).
    add column if not exists canal text,
    -- Veículo, quando o lead nasceu numa ficha. Sem FK: o carro sai do feed
    -- e o lead precisa sobreviver a isso.
    add column if not exists veiculo_id bigint,
    -- Etapa do kanban da tela A8.
    add column if not exists situacao text not null default 'novo',
    -- Quem atende. Texto e não FK para `profiles`: consultor pode sair da
    -- empresa e o histórico do lead continua legível.
    add column if not exists responsavel text,
    add column if not exists observacoes text,
    add column if not exists atualizado_em timestamptz not null default now();

-- A restrição de etapa vem separada do ADD COLUMN: `IF NOT EXISTS` não
-- existe para constraint, e repetir a migração não pode abortar por já
-- estar aplicada.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.leads'::regclass and conname = 'leads_situacao_valida'
    ) then
        alter table public.leads
            add constraint leads_situacao_valida check (
                situacao in ('novo', 'em_contato', 'proposta', 'visita',
                             'negociacao', 'fechado', 'perdido')
            );
    end if;
end $$;

-- O código lê `criado_em` (padrão em português do projeto), mas a coluna que
-- já existia chama `created_at`. Em vez de renomear — o que quebraria
-- qualquer consumidor externo que já use o nome antigo —, a leitura usa
-- `created_at`. Documentado aqui para não virar surpresa.
comment on table public.leads is
    'Contatos captados no site. PII (nome, telefone) — retenção indeterminada '
    'por decisão do dono em 2026-08-07; exclusão é manual, ver /api/leads/gerenciar. '
    'Leitura restrita a usuário autenticado. `created_at` é a data de entrada.';

comment on column public.leads.telefone is
    'Somente dígitos, com DDI 55. PII: nunca expor em rota pública nem em log.';

-- O kanban lê "os mais recentes por etapa"; a fila da A1 lê "os mais
-- recentes ainda sem atendimento".
create index if not exists leads_situacao_criado_idx
    on public.leads (situacao, created_at desc);
create index if not exists leads_criado_idx
    on public.leads (created_at desc);

-- ==========================================================
-- RLS — o ponto mais sensível desta migração
-- ==========================================================
-- `estoque_motors` tem policies `USING (true)` sem restrição de role, e a
-- anon key é pública (vai no bundle do browser). Repetir esse desenho aqui
-- publicaria a lista de nome e telefone de todo mundo que já preencheu um
-- formulário no site.
--
-- Por isso, aqui, as policies são explicitamente `TO authenticated`:
--
--   anônimo ....... não lê, não altera, não apaga
--   autenticado ... lê, atualiza (mover no kanban) e apaga (direito do titular)
--
-- A INSERÇÃO não tem policy: quem grava é a rota `/api/leads`, no servidor,
-- com a chave de serviço (que ignora RLS). O visitante nunca fala com esta
-- tabela diretamente.

alter table public.leads enable row level security;

-- A tabela é preexistente: pode ter policy antiga e permissiva. Removê-las
-- pelo nome não bastaria — nomes desconhecidos sobreviveriam. Por isso o
-- laço abaixo derruba TODAS as policies de `leads` antes de recriar as três
-- que queremos. Sem isso, uma policy `USING (true)` esquecida continuaria
-- valendo e a PII seguiria pública.
do $$
declare
    p record;
begin
    for p in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = 'leads'
    loop
        execute format('drop policy if exists %I on public.leads', p.policyname);
    end loop;
end $$;

create policy leads_leitura on public.leads
    for select to authenticated using (true);

create policy leads_atualizacao on public.leads
    for update to authenticated using (true) with check (true);

-- Eliminação a pedido do titular (LGPD art. 18, VI).
create policy leads_exclusao on public.leads
    for delete to authenticated using (true);
