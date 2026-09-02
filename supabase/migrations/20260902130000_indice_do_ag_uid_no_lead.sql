-- ---------------------------------------------------------------------------
-- Índice de `leads.ag_uid` — a consulta que roda a cada ficha aberta
-- ---------------------------------------------------------------------------
-- Decisão do dono em 2026-09-01, sobre a correspondência do pixel: o
-- `/api/capi` passa a reconhecer quem JÁ foi lead e a mandar e-mail e telefone
-- com hash junto do evento de navegação. É o que a mídia cobrou — o
-- ViewContent está em 4,4/10, com 100% de `user_agent`, `fbp` e `external_id`
-- e ZERO de `em`/`ph`.
--
-- ---------------------------------------------------------------------------
-- Por que o índice vem junto, e não depois
-- ---------------------------------------------------------------------------
-- A consulta nova roda uma vez por ficha aberta — é o evento de maior volume
-- do site depois do PageView. Sem índice ela é varredura da tabela inteira, e
-- a rota é `force-dynamic`: cada visitante pagaria por isso.
--
-- Hoje `leads` tem 11 linhas e a varredura seria instantânea. É exatamente por
-- isso que o índice entra AGORA: o custo aparece quando a tabela crescer, num
-- caminho que ninguém observa porque a rota devolve 204 aconteça o que
-- acontecer. Trava silenciosa se paga com índice barato.
--
-- ---------------------------------------------------------------------------
-- O formato: parcial e ordenado
-- ---------------------------------------------------------------------------
-- `where ag_uid is not null` porque a coluna nasceu vazia — 0 de 11 linhas em
-- 02/09, e só a partir da correção de hoje ela é gravada. Índice parcial não
-- carrega o passivo de linhas que nunca vão ser consultadas.
--
-- `created_at desc` no segundo lugar porque a pergunta é sempre "o lead MAIS
-- RECENTE deste visitante": quem preencheu duas vezes tem dois registros, e o
-- último é o que vale. Com a ordem no índice, o `limit 1` não precisa ordenar.
-- ---------------------------------------------------------------------------

create index if not exists leads_ag_uid_idx
  on public.leads (ag_uid, created_at desc)
  where ag_uid is not null;

comment on index public.leads_ag_uid_idx is
  'Serve a busca do /api/capi: o lead mais recente de um ag_uid, para enriquecer o evento de navegação com em/ph. Parcial porque a coluna só passou a ser gravada em 2026-09-02.';

-- ---------------------------------------------------------------------------
-- Aceite — prova a FORMA do índice, que é o que pode estar errado
-- ---------------------------------------------------------------------------
do $$
declare
  falhas int := 0;
begin
  if not exists (select 1 from pg_indexes where tablename = 'leads' and indexname = 'leads_ag_uid_idx') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o índice não foi criado';
  end if;

  -- A forma importa mais que a existência. Índice em `ag_uid` sozinho, ou com
  -- `created_at` em ordem crescente, existe e não serve: a consulta pede o
  -- lead MAIS RECENTE, e sem a ordem certa o `limit 1` volta a ordenar.
  -- Conferir só o nome deixaria isso passar.
  --
  -- Não se mede o plano aqui: com 11 linhas o Postgres escolhe varredura
  -- sequencial de qualquer jeito — e está certo nesse tamanho. O que a
  -- migração pode garantir é que o índice existe na forma que a consulta vai
  -- pedir quando a tabela crescer.
  if not exists (
    select 1 from pg_indexes
     where tablename = 'leads' and indexname = 'leads_ag_uid_idx'
       and indexdef like '%ag_uid, created_at DESC%'
       and indexdef like '%WHERE (ag_uid IS NOT NULL)%'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: o índice existe mas não na forma que a consulta pede';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no índice de ag_uid', falhas;
  end if;

  raise notice 'Índice OK: leads(ag_uid, created_at desc) parcial, na forma que o /api/capi consulta.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260902130000', 'indice_do_ag_uid_no_lead')
  on conflict (version) do nothing;
