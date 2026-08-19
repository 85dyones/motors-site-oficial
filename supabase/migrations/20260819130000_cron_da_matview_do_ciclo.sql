-- ---------------------------------------------------------------------------
-- Pacote 1 — a matview `vw_ciclo_estado` passa a se atualizar sozinha.
--
-- O manual §2.3 pede "uma view materializada, atualizada **diariamente**, que
-- responde qual é a situação de cada cliente hoje". A view existe desde a
-- `20260813150000`; o que faltava era o "diariamente". Sem isso ela congela no
-- estado do dia em que foi criada e passa a mentir com cara de dado fresco —
-- que é pior do que não existir.
--
-- Mesmo arranjo do Pacote 4 (`20260819120000`) e pela mesma razão: o trabalho
-- não sai do banco, então o relógio fica no banco, versionado numa migração.
--
-- ---------------------------------------------------------------------------
-- Por que CONCURRENTLY
-- ---------------------------------------------------------------------------
-- `refresh materialized view` sem `concurrently` toma ACCESS EXCLUSIVE: todo
-- leitor fica bloqueado até terminar. Num painel que a equipe abre de manhã,
-- isso é a tela travando sem explicação.
--
-- `concurrently` exige índice ÚNICO na matview — e ele já existe:
-- `idx_vce_veiculo` sobre `veiculo_vendido_id`, criado junto com a view. Não é
-- coincidência; é o índice que torna esta migração possível.
--
-- ⚠️ Duas consequências que quem for mexer precisa saber:
--   * `concurrently` **falha** se a matview nunca foi populada. Ela está
--     populada desde que nasceu; um `refresh ... with no data` quebraria o
--     cron na noite seguinte — e é para falhar alto mesmo, em vez de cair
--     silenciosamente num refresh bloqueante.
--   * se algum dia o índice único sumir, este agendamento para de funcionar.
--     O teste em `tests/ciclo-fundacao.test.ts` trava o par.
-- ---------------------------------------------------------------------------

-- 09:00 UTC = **6h da manhã em Curitiba**: a matview chega pronta antes de a
-- loja abrir, e bem longe do cálculo da conformidade (23h30). Não há
-- dependência entre os dois — o motor de gatilhos, aliás, não lê esta view —,
-- mas separar os horários mantém um diagnosticável do outro.
--
-- Cadência diária é o que o manual pede. Se um dia o painel precisar de
-- frescor dentro do dia, é esta linha que muda — e aí vale reler o §2.3 antes.

select cron.schedule(
  'refresh-vw-ciclo-estado',
  '0 9 * * *',
  $cron$refresh materialized view concurrently public.vw_ciclo_estado;$cron$
);

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
do $$
declare
  v_job record;
begin
  select * into v_job from cron.job where jobname = 'refresh-vw-ciclo-estado';
  if not found then
    raise exception 'ACEITE FALHOU: job refresh-vw-ciclo-estado não foi agendado';
  end if;
  if v_job.schedule <> '0 9 * * *' then
    raise exception 'ACEITE FALHOU: agendamento inesperado (%)', v_job.schedule;
  end if;
  if not v_job.active then
    raise exception 'ACEITE FALHOU: job agendado mas inativo';
  end if;

  -- O comando agendado precisa ser o CONCURRENTLY. Um refresh bloqueante aqui
  -- travaria o painel, e a diferença é uma palavra.
  if v_job.command not ilike '%concurrently%' then
    raise exception 'ACEITE FALHOU: o refresh agendado não é concurrently (%)', v_job.command;
  end if;

  -- O índice único de que o concurrently depende continua de pé.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'vw_ciclo_estado'
       and indexdef ilike 'create unique index%'
  ) then
    raise exception 'ACEITE FALHOU: matview sem índice único — concurrently não funciona';
  end if;

  -- E o comando roda de verdade, não só está registrado.
  refresh materialized view concurrently public.vw_ciclo_estado;

  raise notice 'Aceite verificado: refresh concurrently diário às 6h (Curitiba), índice único de pé.';
end $$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260819130000', 'cron_da_matview_do_ciclo')
  on conflict (version) do nothing;
