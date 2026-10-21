-- ===========================================================================
-- Preparar o branch de teste do atendimento 2.0 — SÓ NO BRANCH (2026-10-20)
-- ===========================================================================
-- ⛔ NUNCA NA PRODUÇÃO. Desliga as tarefas agendadas e o webhook do banco e
-- apaga o WhatsApp de toda a equipe.
--
-- O dono decidiu testar o atendimento num branch do Supabase, para não correr
-- risco de mexer na produção (*"sem merge por enquanto, vamos testar no branch
-- paralelo, só entra 100%"*). O branch com dados é uma cópia da produção, e a
-- cópia leva junto o que fala com o mundo de fora:
--
--   * as tarefas do `pg_cron` — uma delas chama a rota de sincronização do
--     Meta no site de PRODUÇÃO a cada hora;
--   * o gatilho `send_to_n8n` de `tracking_events`, que manda cada evento ao
--     n8n;
--   * o WhatsApp de cada vendedor em `profiles.telefone_e164` — o resumo do
--     assistente iria ao celular de um vendedor de verdade.
--
-- Quem testa cadastra o próprio número de teste em Usuários e permissões, no
-- preview, depois de rodar isto.
--
-- A guarda: só roda num banco que tem a tabela
-- `public.marcador_do_branch_de_teste`. Nada no banco distingue a produção de
-- uma cópia dela (o project ref não aparece em nenhuma configuração), então o
-- marcador é uma tabela que só o branch ganha: quem prepara o branch a cria
-- pelo conector, contra o project ref DO BRANCH, logo antes de rodar isto. Na
-- produção ela não existe, e colar este arquivo no editor SQL da produção é
-- recusado sem mexer em nada (20/10/2026: um SQL colado no editor da produção
-- mostrou que o risco é real).
-- ===========================================================================

do $branch$
declare
  v_tarefas int;
  v_telefones int;
begin
  if to_regclass('public.marcador_do_branch_de_teste') is null then
    raise exception 'Recusado: este banco não é o branch de teste do atendimento (falta public.marcador_do_branch_de_teste). Nada foi alterado.';
  end if;

  select count(*) into v_tarefas from cron.job;
  perform cron.unschedule(jobid) from cron.job;

  drop trigger if exists send_to_n8n on public.tracking_events;

  update public.profiles set telefone_e164 = null where telefone_e164 is not null;
  get diagnostics v_telefones = row_count;

  raise notice 'Branch de teste: % tarefa(s) do pg_cron desligada(s), webhook do banco removido, % WhatsApp(s) da equipe apagado(s).',
    v_tarefas, v_telefones;
end
$branch$;

-- Conferência (somente leitura): tudo zero.
select (select count(*) from cron.job) as tarefas_agendadas,
       (select count(*) from information_schema.triggers where trigger_name = 'send_to_n8n') as webhooks_do_banco,
       (select count(*) from public.profiles where telefone_e164 is not null) as whatsapps_da_equipe;
