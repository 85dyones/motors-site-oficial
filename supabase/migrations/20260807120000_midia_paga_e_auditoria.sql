-- ==========================================================
-- Mídia paga (telas A13/A14 do design doc) + auditoria (A17)
-- ==========================================================
--
-- O design doc de 2026-08-07 acrescentou o módulo de marketing: o consolidado
-- Meta + Google (A13) e a leitura de campanha (A14). A premissa de dados está
-- escrita na própria tela A14: "enquanto a API do Meta não está conectada, os
-- números do dia entram aqui e o painel inteiro recalcula" — ou seja, a fonte
-- é DIGITAÇÃO MANUAL do dono, e a integração com a API vem depois sem trocar
-- o modelo (o sync futuro grava nas mesmas tabelas).
--
-- Modelo de leitura: SNAPSHOT CUMULATIVO, não delta diário. Cada "aplicar
-- leitura" grava uma linha por anúncio com os totais daquele momento (é o que
-- o gerenciador do Meta mostra na tela — copiar é mais à prova de erro que
-- subtrair). A leitura mais recente de cada anúncio é o estado atual; o
-- histórico fica para a linha do tempo. Alcance não soma entre anúncios, por
-- isso existe a linha de campanha (anuncio_id IS NULL) que carrega o alcance
-- total.
--
-- "Visitas à loja" e "vendas atribuídas" do A13 NÃO têm coluna aqui de
-- propósito: dependem do kanban de leads, que segue bloqueado (decisão de
-- 2026-08-06 — persistência de lead é pacote próprio, com LGPD decidida
-- antes). Criar a coluna agora seria convite a preenchê-la à mão com número
-- inventado.
-- ==========================================================

create table if not exists public.midia_campanhas (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    plataforma text not null check (plataforma in ('meta', 'google')),
    -- Texto livre: "Conversas · WhatsApp", "Ligação e formulário"…
    -- O vocabulário é do gerenciador de anúncios, não nosso.
    objetivo text,
    orcamento_diario numeric(12, 2),
    -- Recorte e atribuição como o dono escreveu no gerenciador
    -- ("Curitiba + 30 km · 25–65 · Advantage+"). Descritivo, não estruturado:
    -- o painel só exibe.
    publico text,
    atribuicao text,
    situacao text not null default 'no_ar'
        check (situacao in ('no_ar', 'pausada', 'planejada', 'encerrada')),
    -- Início de veiculação — os portões de aprendizagem (72 h no ar) contam
    -- a partir daqui, não da criação do registro.
    no_ar_desde timestamptz,
    criada_em timestamptz not null default now()
);

comment on table public.midia_campanhas is
    'Campanhas de mídia paga (Meta/Google) — tela A13/A14 do painel. '
    'Alimentada à mão enquanto não há sync com as APIs de anúncio.';

create table if not exists public.midia_anuncios (
    id uuid primary key default gen_random_uuid(),
    campanha_id uuid not null references public.midia_campanhas (id) on delete cascade,
    nome text not null,
    criado_em timestamptz not null default now()
);

comment on table public.midia_anuncios is
    'Anúncios (criativos) dentro de uma campanha — as linhas da tabela de '
    'criativos da tela A14.';

create table if not exists public.midia_leituras (
    id uuid primary key default gen_random_uuid(),
    campanha_id uuid not null references public.midia_campanhas (id) on delete cascade,
    -- NULL = linha da campanha inteira (carrega o alcance total, que não é
    -- a soma dos alcances por anúncio).
    anuncio_id uuid references public.midia_anuncios (id) on delete cascade,
    registrado_em timestamptz not null default now(),
    -- Totais CUMULATIVOS no instante da leitura, como o gerenciador mostra.
    investido numeric(12, 2) not null default 0,
    impressoes integer not null default 0,
    alcance integer not null default 0,
    cliques integer not null default 0,
    conversas integer not null default 0
);

comment on table public.midia_leituras is
    'Snapshots cumulativos de desempenho, digitados na tela A14 ("Atualizar '
    'leitura"). A mais recente por anúncio é o estado atual; o histórico é a '
    'linha do tempo.';

-- A tela A14 lê sempre "a leitura mais recente por anúncio desta campanha".
create index if not exists midia_leituras_campanha_registro_idx
    on public.midia_leituras (campanha_id, registrado_em desc);

create table if not exists public.midia_ajustes (
    id uuid primary key default gen_random_uuid(),
    campanha_id uuid not null references public.midia_campanhas (id) on delete cascade,
    descricao text not null,
    autor_nome text,
    registrado_em timestamptz not null default now()
);

comment on table public.midia_ajustes is
    'Registro de ajustes da campanha ("subiu orçamento", "trocou capa") — '
    'as marcas na linha do tempo da tela A14. É o que permite dizer depois '
    'o que causou uma variação.';

-- ==========================================================
-- Auditoria de ações sensíveis (tela A17)
-- ==========================================================
-- "Preço, texto legal, paleta e permissões geram registro permanente — não
-- dá para apagar nem editar depois." O permanente é garantido pelo RLS: as
-- tabelas ganham policy de SELECT e INSERT para authenticated e NENHUMA de
-- UPDATE/DELETE — para quem entra pelo painel, o registro é só-acrescenta.
-- (A service role do Supabase continua por cima disso, como em toda tabela.)

create table if not exists public.auditoria_admin (
    id uuid primary key default gen_random_uuid(),
    -- Slug curto do tipo de ação: 'usuario_criado', 'perfil_alterado',
    -- 'paleta_alterada'… Vocabulário validado no app, não aqui: ações novas
    -- não podem exigir migração.
    acao text not null,
    detalhe text,
    autor_id uuid,
    autor_nome text,
    registrado_em timestamptz not null default now()
);

comment on table public.auditoria_admin is
    'Trilha de ações sensíveis do painel (A17): permissões, paleta, texto '
    'legal. Append-only via RLS — sem policy de UPDATE/DELETE.';

create index if not exists auditoria_admin_registro_idx
    on public.auditoria_admin (registrado_em desc);

-- ==========================================================
-- RLS
-- ==========================================================
-- Dado interno de operação (não é dado de cliente): qualquer usuário logado
-- do painel lê e escreve. O gate de QUEM enxerga a tela é o de sempre do
-- painel (SidebarNav por role) — o RLS aqui barra o público anônimo.

alter table public.midia_campanhas enable row level security;
alter table public.midia_anuncios enable row level security;
alter table public.midia_leituras enable row level security;
alter table public.midia_ajustes enable row level security;
alter table public.auditoria_admin enable row level security;

drop policy if exists midia_campanhas_autenticados on public.midia_campanhas;
create policy midia_campanhas_autenticados on public.midia_campanhas
    for all to authenticated using (true) with check (true);

drop policy if exists midia_anuncios_autenticados on public.midia_anuncios;
create policy midia_anuncios_autenticados on public.midia_anuncios
    for all to authenticated using (true) with check (true);

drop policy if exists midia_leituras_autenticados on public.midia_leituras;
create policy midia_leituras_autenticados on public.midia_leituras
    for all to authenticated using (true) with check (true);

drop policy if exists midia_ajustes_autenticados on public.midia_ajustes;
create policy midia_ajustes_autenticados on public.midia_ajustes
    for all to authenticated using (true) with check (true);

-- Auditoria: só leitura e inserção. A ausência deliberada de policy de
-- UPDATE/DELETE é o que a torna imutável para o painel.
drop policy if exists auditoria_admin_leitura on public.auditoria_admin;
create policy auditoria_admin_leitura on public.auditoria_admin
    for select to authenticated using (true);

drop policy if exists auditoria_admin_insercao on public.auditoria_admin;
create policy auditoria_admin_insercao on public.auditoria_admin
    for insert to authenticated with check (true);
