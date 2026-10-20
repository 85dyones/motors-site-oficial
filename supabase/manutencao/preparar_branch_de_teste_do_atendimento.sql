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
-- A guarda: só roda com o marcador ligado NA MESMA CHAMADA, e quem chama só o
-- liga contra o project ref do branch:
--
--   select set_config('app.branch_de_teste', 'atendimento-2', true);
--   <o bloco abaixo>
-- ===========================================================================

do $branch$
declare
  v_tarefas int;
  v_telefones int;
begin
  if current_setting('app.branch_de_teste', true) is distinct from 'atendimento-2' then
    raise exception 'Recusado: isto só roda no branch de teste do atendimento (ver o cabeçalho).';
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
