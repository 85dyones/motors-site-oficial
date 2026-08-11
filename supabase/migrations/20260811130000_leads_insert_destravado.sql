-- ==========================================================
-- Destrava o insert de lead na tabela `leads` de produção
-- ==========================================================
--
-- Sintoma: nenhum lead do site chega ao painel. O kanban mostra "Nenhum lead
-- ainda" porque é verdade — a tabela está vazia.
--
-- Causa: a migração 20260807210000 cria a tabela com `create table if not
-- exists`. Em produção a tabela JÁ EXISTIA — uma tabela de marketing com 44
-- colunas (`event_id`, `utm_*`, `fbclid`, `gclid`, `capi_meta_*`, `score`,
-- `telefone_raw`…). O `create` virou no-op e só os `alter add column`
-- rodaram, pendurando as 8 colunas do kanban sobre um schema que ninguém
-- tinha lido.
--
-- Dessa tabela antiga sobrou `event_id text not null` sem default. A rota
-- `/api/leads` não preenche esse campo, então todo insert é recusado:
--
--   null value in column "event_id" of relation "leads"
--   violates not-null constraint
--
-- E a gravação é não-bloqueante de propósito (o visitante não pode ser
-- segurado a caminho do WhatsApp), então a falha vira `console.warn` na
-- Vercel e mais nada. Somada ao webhook do n8n, que responde 404 desde
-- sempre, a captura de lead do site estava morta nos dois caminhos.
--
-- Esta migração não apaga nada. Só remove as travas que impedem o insert.

-- ── 1. A trava confirmada pelo erro do banco ──
--
-- `event_id` era a chave do evento de rastreamento no desenho antigo. Nada
-- no código de hoje lê essa coluna. Deixar nulável é menos destrutivo que
-- remover: quem já usa o dado histórico continua usando.
alter table public.leads
    alter column event_id drop not null;

-- ── 2. As demais, por precaução ──
--
-- `id`, `situacao` e `atualizado_em` aparecem como obrigatórias sem default
-- na descrição que o PostgREST expõe. As três são declaradas com default na
-- migração 20260807210000, então provavelmente é imprecisão da leitura — mas
-- confirmar exigiria outra tentativa de insert em produção, e o custo de
-- errar é o lead do cliente sumindo de novo.
--
-- Definir o default de novo é idempotente: se já existir, nada muda.
alter table public.leads
    alter column id set default gen_random_uuid();

alter table public.leads
    alter column situacao set default 'novo';

alter table public.leads
    alter column atualizado_em set default now();

-- ── 3. Registro do que a tabela é de fato ──
--
-- O comentário anterior descrevia a tabela da migração, não a de produção.
-- Quem abrir isto no futuro precisa saber que os dois schemas convivem.
comment on table public.leads is
    'Contatos captados no site. ATENÇÃO: schema híbrido — a tabela original é '
    'de marketing (event_id, utm_*, fbclid, gclid, capi_meta_*, score, '
    'telefone_raw) e as colunas do kanban (telefone, interesse, canal, '
    'veiculo_id, situacao, responsavel, observacoes, atualizado_em) foram '
    'acrescentadas por ALTER em 2026-08-07. A migração que "cria" a tabela é '
    'no-op em produção. PII (nome, telefone) — retenção indeterminada por '
    'decisão do dono; exclusão manual em /api/leads/gerenciar.';
