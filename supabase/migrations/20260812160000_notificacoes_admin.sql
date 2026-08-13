-- ==========================================================
-- notificacoes_admin — o rastro do workflow adm-motors
-- ==========================================================
--
-- O workflow `motors-adm` do n8n (webhook `adm-motors`) roteia todo evento
-- administrativo do Formato C (WEBHOOKS_N8N.md) para WhatsApp e produz, por
-- evento, um item de log. Até 2026-08-12 esse item morria num node NoOp —
-- "Log (configurar Supabase depois)" — e não ficava rastro de nada, nem dos
-- eventos de exclusão cujo próprio template de mensagem pede "verifique se
-- foi autorizada".
--
-- Esta tabela é o destino desse item. Quem escreve é o n8n, com a chave de
-- serviço (credencial `supabase_motors`), que ignora RLS — por isso não há
-- policy de INSERT. Não confundir com:
--
--   auditoria_admin ........... ações de admin no painel (tela A17)
--   notificacoes_financeiras .. controle de deduplicação dos avisos de
--                               vencimento emitidos pelo site
--
-- Aqui é o que o n8n de fato processou: evento, prioridade, para quem foi,
-- e o payload original para reconstruir qualquer discussão de "chegou/não
-- chegou".
-- ==========================================================

create table if not exists public.notificacoes_admin (
    id uuid primary key default gen_random_uuid(),
    -- Nome do evento do Formato C (conta_criada, recorrente_deletada, …).
    event text not null,
    -- id do registro que originou o evento. Texto, não FK: o lançamento pode
    -- ser excluído — é exatamente o caso mais importante de manter no rastro.
    referencia_id text,
    prioridade text,
    -- Papéis notificados, separados por vírgula ("operador,gestor").
    destinatarios text,
    valor numeric,
    descricao text,
    -- O corpo inteiro que chegou no webhook, como chegou.
    payload_original jsonb,
    -- Quando o evento aconteceu no site (campo `timestamp` do Formato C).
    evento_em timestamptz,
    -- Quando o n8n processou.
    processado_em timestamptz not null default now()
);

comment on table public.notificacoes_admin is
    'Rastro dos eventos administrativos processados pelo workflow adm-motors '
    '(n8n). Escrita só pela chave de serviço; leitura no painel autenticado. '
    'Dados financeiros internos da loja — sem PII de cliente.';

comment on column public.notificacoes_admin.referencia_id is
    'id do registro de origem, sem FK de propósito: precisa sobreviver à '
    'exclusão do registro.';

-- O painel lê "o que saiu recentemente".
create index if not exists notificacoes_admin_processado_idx
    on public.notificacoes_admin (processado_em desc);

-- ==========================================================
-- RLS — mesmo desenho de `leads` (o padrão certo deste projeto)
-- ==========================================================
-- Policies explicitamente `TO authenticated`; a anon key não lê nem escreve.
-- Sem policy de INSERT/UPDATE/DELETE: o n8n grava com a chave de serviço, e
-- a ausência de policy de UPDATE/DELETE é o que torna o rastro imutável para
-- qualquer sessão do painel (mesma regra de `auditoria_admin`).

alter table public.notificacoes_admin enable row level security;

drop policy if exists notificacoes_admin_leitura on public.notificacoes_admin;

create policy notificacoes_admin_leitura on public.notificacoes_admin
    for select to authenticated using (true);
