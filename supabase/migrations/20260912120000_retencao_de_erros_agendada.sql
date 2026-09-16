-- ============================================================================
-- A retenção de `erros` ganha relógio — os 90 dias passam a vencer de verdade
-- ============================================================================
-- A `/privacidade` deste PR afirma, em `src/app/privacidade/page.tsx`:
--
--     "Registros técnicos de erro ficam guardados por 90 dias e depois são
--      apagados por rotina automática."
--
-- A rotina existe: `public.limpar_erros_antigos(dias integer default 90)`,
-- criada e aplicada em produção pela `20260910120000_erros_do_site` (branch
-- `observabilidade/pr1-costura-e-captura`). O que não existe é o **chamador**.
-- Conferido nesta base em 2026-09-12, lendo `cron.job`: há exatamente dois
-- jobs — `conformidade-diaria` (`30 2 * * *`) e `abertura-de-janelas`
-- (`0 3 * * *`). Nenhum é retenção.
--
-- Ou seja: a tabela entra em produção junto com a coleta, a página promete
-- apagamento automático, e a janela de 90 dias fecha sobre uma rotina que
-- ninguém dispara. Promessa de privacidade sem executor não é atraso de
-- implementação — é a política mentindo, e a mentira só aparece no dia 91,
-- quando alguém for conferir. Esta migração é só o relógio.
--
-- ----------------------------------------------------------------------------
-- Por que pg_cron, e não o n8n
-- ----------------------------------------------------------------------------
-- A mesma razão da `20260819120000`, que abriu este caminho no projeto: o
-- trabalho nunca sai do banco — é um DELETE numa tabela do banco, decidido por
-- `now()`. Passá-lo pelo n8n significaria workflow → HTTP → chave de serviço →
-- RPC, três elos e um segredo para o banco fazer uma coisa consigo mesmo.
--
-- Aqui pesa um argumento a mais que lá não existia: **quem promete é a página
-- pública**. A cópia versionada de workflow do n8n já divergiu do que roda ao
-- vivo duas vezes neste repositório (ver o README), e um workflow desativado
-- por engano não deixa rastro no `git`. Agendamento em `pg_cron` mora numa
-- migração: versionado, revisado, ensaiável — e legível em `cron.job` por
-- quem um dia precise provar a retenção a um titular.
--
-- ⚠️ Nota de escopo, não corrigida aqui de propósito: o `comment on table
-- public.erros` e o `comment on function public.limpar_erros_antigos` ainda
-- nomeiam o n8n como chamador. Os dois textos foram escritos pela
-- `20260910120000` e pertencem àquele branch; reescrevê-los daqui seria duas
-- migrações disputando a mesma frase. Fica o registro para quem fechar a pr1.
--
-- ----------------------------------------------------------------------------
-- O horário: `0 6 * * *` UTC = 03h00 em Curitiba
-- ----------------------------------------------------------------------------
-- A janela apagada é a MESMA em qualquer horário — `criado_em < now() - 90
-- days` é tempo absoluto, não calendário de loja (é por isso que esta rotina,
-- ao contrário das outras duas, não precisa de portão para fixar fuso). O que
-- o horário escolhe é com quem a rotina divide o banco. Três distâncias:
--
--   * dos dois jobs que já existem: `30 2` (conformidade, 23h30 de Curitiba) e
--     `0 3` (abertura de janelas, meia-noite). Às 06:00 UTC há **3 horas** de
--     folga depois do segundo — sobra para um atraso de qualquer um deles não
--     encontrar este DELETE segurando linha;
--   * da faixa `0 9 * * *`, que a `20260819130000` reservou para o refresh da
--     matview do Ciclo. Esse job hoje **não está em `cron.job`** (conferido em
--     2026-09-12, e é achado para outra tarefa), mas o nome está versionado e
--     pode voltar. Não se ocupa endereço alheio;
--   * do expediente. O pior instante para apagar erro é aquele em que a loja
--     está gerando erro: a rotina que remove a prova não deve disputar a
--     tabela com quem está escrevendo a prova.
--
-- **Diário**, não semanal: com passagem diária o excesso máximo sobre os 90
-- dias é de 24 h. Semanal levaria a retenção real a 97 dias e faria a frase da
-- `/privacidade` falsa por arredondamento.
--
-- ----------------------------------------------------------------------------
-- `90` explícito no comando, em vez do default da função
-- ----------------------------------------------------------------------------
-- `limpar_erros_antigos()` sem argumento faria a mesma coisa hoje. Escrever o
-- 90 põe a janela em `cron.job`, onde ela é legível sem abrir o corpo da
-- função — e desamarra a promessa da página do default de um objeto que outra
-- migração pode reescrever. O número vem da `/privacidade`, não do código.
--
-- ----------------------------------------------------------------------------
-- Privilégio: o papel do cron JÁ executa a função — e não se afrouxa nada
-- ----------------------------------------------------------------------------
-- `limpar_erros_antigos` é SECURITY DEFINER e a `20260910120000` fechou o
-- EXECUTE: `revoke all ... from public, anon, authenticated`, `grant execute
-- ... to service_role`. A pergunta certa não é "quem tem grant", é "sob que
-- papel o pg_cron roda" — e a resposta se lê em `cron.job.username`, que o
-- `cron.schedule` preenche com o `current_user` de quem agenda. Medido nesta
-- base: os dois jobs existentes rodam como `postgres`, e o ACL da função é
--
--     {postgres=X/postgres,service_role=X/postgres}
--
-- `postgres` é o DONO da função, e revogar de `public`/`anon`/`authenticated`
-- nunca tocou a concessão do dono. Logo o job executa, e não há grant a abrir.
-- A autoconferência não acredita nisso: ela roda o comando agendado, palavra
-- por palavra, sob o papel gravado no próprio job. Se um dia a função mudar de
-- dono, ou alguém revogar do `postgres`, é aqui que quebra — na migração, e
-- não às 3h da manhã sem plateia. A saída, nesse dia, é conceder ao papel do
-- job; nunca devolver EXECUTE a `public`.
--
-- ----------------------------------------------------------------------------
-- A função NÃO muda
-- ----------------------------------------------------------------------------
-- O piso de `dias < 7` fica onde está: com 0, esta rotina seria um TRUNCATE
-- disfarçado de faxina, e ela agora tem um gatilho automático diário — o que
-- torna o piso mais importante, não menos. A autoconferência exercita o piso
-- dentro do bloco que ela mesma desfaz, porque perguntar "o piso ainda existe?"
-- pelo efeito significa tentar `limpar_erros_antigos(0)`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Dependência declarada, com mensagem que resolve o problema de quem ler
-- ----------------------------------------------------------------------------
-- Agendar um comando que não existe cria um job que falha em silêncio todo
-- dia. Falhar aqui custa uma linha; falhar lá custa a retenção inteira.
do $guarda$
begin
  if to_regprocedure('public.limpar_erros_antigos(integer)') is null then
    raise exception
      'DEPENDENCIA AUSENTE: public.limpar_erros_antigos(integer) não existe nesta base. Ela vem de 20260910120000_erros_do_site (branch observabilidade/pr1-costura-e-captura), aplicada em produção em 2026-09-10. Aplique-a antes desta.';
  end if;

  if to_regclass('public.erros') is null then
    raise exception
      'DEPENDENCIA AUSENTE: public.erros não existe nesta base — mesma migração 20260910120000_erros_do_site.';
  end if;
end $guarda$;

-- ----------------------------------------------------------------------------
-- O agendamento
-- ----------------------------------------------------------------------------
-- Idempotência **sem** `cron.unschedule` antes, e isso é escolha: desde o
-- pg_cron 1.4 o `cron.schedule(nome, agenda, comando)` é um upsert por
-- `(jobname, username)` — nome existente ATUALIZA a linha em vez de criar
-- outra. É o que as duas migrações de cron deste repositório já pressupõem.
-- `unschedule` + `schedule` faria o mesmo resultado por um caminho pior: o
-- `unschedule` levanta erro quando o job não existe (pedindo mais um guarda) e
-- trocaria o `jobid` a cada aplicação, apagando a identidade do job no
-- histórico de execuções. A autoconferência prova o upsert pelo efeito —
-- reagenda e exige um job só, com o MESMO jobid.
select cron.schedule(
  'retencao-de-erros',
  '0 6 * * *',
  $cron$select public.limpar_erros_antigos(90);$cron$
);

-- ============================================================================
-- Autoconferência — pelo EFEITO, nunca pelo nome
-- ============================================================================
-- Este repositório já pagou para aprender que objeto existente não é objeto
-- funcionando (a `20260831150000`: policy correta, GRANT ausente, painel em
-- 42501). Por isso nada aqui se contenta com "o job está em `cron.job`": o
-- comando agendado é EXECUTADO, sob o papel do próprio job, contra duas linhas
-- sintéticas cujo destino é oposto.
--
-- A sonda mora num `begin ... exception ... end` que termina numa exceção
-- deliberada. plpgsql não tem SAVEPOINT — esse é o desvio, e a propriedade que
-- o torna útil é que variável de plpgsql NÃO é transacional: o que foi medido
-- dentro do bloco sobrevive ao rollback dele. Sem isso, ensaiar esta migração
-- num banco povoado apagaria erro real de verdade.
do $aceite$
declare
  falhas           int    := 0;
  v_job            record;
  v_quantos        int;
  v_jobid_antes    bigint;
  v_jobid_depois   bigint;
  v_username       text;
  v_linhas_antes   bigint;
  v_linhas_depois  bigint;
  v_ja_antigas     int;
  v_apagadas       int    := -1;
  v_antiga_sobrou  int    := -1;
  v_recente_sobrou int    := -1;
  v_piso_cedeu     boolean := false;
  v_id_antiga      uuid;
  v_id_recente     uuid;
begin
  -- ── 1. Existe UM job com este nome, e exatamente um ─────────────────────
  select count(*) into v_quantos from cron.job where jobname = 'retencao-de-erros';
  if v_quantos <> 1 then
    raise exception 'ACEITE FALHOU: % job(s) chamados retencao-de-erros, esperado exatamente 1', v_quantos;
  end if;

  select * into v_job from cron.job where jobname = 'retencao-de-erros';
  v_jobid_antes := v_job.jobid;
  v_username    := v_job.username;

  if v_job.schedule <> '0 6 * * *' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a agenda saiu "%", esperado "0 6 * * *"', v_job.schedule;
  end if;

  if not v_job.active then
    falhas := falhas + 1;
    raise warning 'FALHOU: o job nasceu inativo — existe em cron.job e nunca roda';
  end if;

  -- Janela legível no catálogo: o 90 da /privacidade tem que estar no comando.
  if v_job.command not ilike '%limpar_erros_antigos(90)%' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o comando agendado não chama limpar_erros_antigos(90) — saiu "%"', v_job.command;
  end if;

  -- Job apontado para o banco errado não levanta erro: apenas nunca roda.
  if v_job.database <> current_database() then
    falhas := falhas + 1;
    raise warning 'FALHOU: o job aponta para o banco "%", e este é "%"', v_job.database, current_database();
  end if;

  -- Nenhum SEGUNDO executor da mesma função, sob outro nome. Dois jobs
  -- apagando a mesma tabela não quebram nada hoje e escondem qual é a régua.
  --
  -- Honestidade sobre o alcance desta linha e da de baixo: `cron.job` tem RLS
  -- (`username = current_user`), então as duas só enxergam os jobs do papel
  -- que aplica a migração — hoje `postgres`, que é onde vivem os três jobs
  -- deste repositório. Job agendado por OUTRO papel passaria despercebido
  -- aqui; a régua real contra isso é que agendamento neste projeto só nasce em
  -- migração, e migração se aplica como `postgres`.
  select count(*) into v_quantos
    from cron.job where command ilike '%limpar_erros_antigos%';
  if v_quantos <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % job(s) chamam limpar_erros_antigos — a retenção tem que ter um dono só', v_quantos;
  end if;

  -- O horário é EXCLUSIVO. Conferido contra `cron.job`, não contra as duas
  -- agendas que o cabeçalho cita de cor: job novo entre a escrita deste
  -- arquivo e a gravação dele não apareceria numa lista fixa. É a diferença
  -- entre conferir o catálogo e conferir a própria lembrança.
  select count(*) into v_quantos
    from cron.job
   where schedule = v_job.schedule and jobname <> 'retencao-de-erros';
  if v_quantos <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a agenda % já é de outro(s) % job(s) — escolha um horário livre', v_job.schedule, v_quantos;
  end if;

  -- ── 2. Reaplicar a migração não produz um segundo job ───────────────────
  --     Isto é a linha de cima do arquivo, repetida. Se ela duplicasse, o
  --     ensaio+gravação desta mesma migração já deixaria dois.
  perform cron.schedule(
    'retencao-de-erros',
    '0 6 * * *',
    $cron$select public.limpar_erros_antigos(90);$cron$
  );

  select count(*) into v_quantos from cron.job where jobname = 'retencao-de-erros';
  if v_quantos <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: reagendar criou duplicata — % linha(s) com o nome retencao-de-erros', v_quantos;
  end if;

  select jobid into v_jobid_depois
    from cron.job where jobname = 'retencao-de-erros' order by jobid limit 1;
  if v_jobid_depois is distinct from v_jobid_antes then
    falhas := falhas + 1;
    raise warning 'FALHOU: reagendar trocou o jobid (% para %) — foi delete+insert, não upsert', v_jobid_antes, v_jobid_depois;
  end if;

  -- ── 3. O papel sob o qual o pg_cron roda executa a função ───────────────
  if not has_function_privilege(v_username, 'public.limpar_erros_antigos(integer)', 'execute') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o papel % do job não tem EXECUTE em limpar_erros_antigos — o cron bateria em 42501 às 3h e ninguém veria', v_username;
  end if;

  -- ── 4. O efeito: a linha de 100 dias sai, a de 89 fica ──────────────────
  --     A segunda sonda é de 89 dias, e não de 1, de propósito: linha de um
  --     dia sobrevive a QUALQUER janela que o piso de 7 permite, então ela não
  --     distinguiria uma retenção de 90 dias de uma de 10 — ficaria verde
  --     provando nada. 89 é a borda de dentro: só sobrevive se a janela for
  --     mesmo 90, que é o número que a /privacidade promete.
  select count(*) into v_linhas_antes from public.erros;

  begin
    select count(*) into v_ja_antigas
      from public.erros where criado_em < now() - interval '90 days';

    insert into public.erros
      (origem, natureza, assunto, mensagem, hash_agrupamento, criado_em)
    values
      ('servidor', 'quebra', 'aceite-retencao-cron', 'sonda de 100 dias', '0badc0de',
       now() - interval '100 days')
    returning id into v_id_antiga;

    insert into public.erros
      (origem, natureza, assunto, mensagem, hash_agrupamento, criado_em)
    values
      ('servidor', 'quebra', 'aceite-retencao-cron', 'sonda de 89 dias', '0badc0de',
       now() - interval '89 days')
    returning id into v_id_recente;

    -- O comando AGENDADO, palavra por palavra, sob o papel gravado no job.
    -- Hoje `postgres` aplica e `postgres` é o username, então a troca de papel
    -- é um no-op — ela ganha sentido no dia em que o job for agendado por
    -- outro papel, que é justamente o dia em que ninguém lembraria de testar.
    execute format('set local role %I', v_username);
    begin
      execute v_job.command into v_apagadas;
    exception when insufficient_privilege then
      v_apagadas := -1;
    end;
    reset role;

    select count(*) into v_antiga_sobrou  from public.erros where id = v_id_antiga;
    select count(*) into v_recente_sobrou from public.erros where id = v_id_recente;

    -- O piso de 7 dias, exercido contra a violação real. Vem DEPOIS das contas
    -- acima e só dentro deste bloco: se o piso tiver cedido, este comando
    -- apaga a tabela inteira, e é o rollback do bloco que torna a pergunta
    -- segura de fazer. Com um gatilho diário no ar, o piso deixou de ser
    -- proteção contra digitação e virou proteção contra rotina.
    begin
      perform public.limpar_erros_antigos(0);
      v_piso_cedeu := true;
    exception when invalid_parameter_value then
      v_piso_cedeu := false;
    end;

    -- Desfaz os dois INSERT e os DELETE das sondas. `v_apagadas`,
    -- `v_antiga_sobrou`, `v_recente_sobrou` e `v_piso_cedeu` sobrevivem.
    raise exception 'DESFAZER_SONDA_DA_RETENCAO' using errcode = 'restrict_violation';
  exception when restrict_violation then null;
  end;

  -- ── 5. Veredito das medições ────────────────────────────────────────────
  if v_apagadas < 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o comando agendado não executou sob o papel % (privilégio insuficiente)', v_username;
  elsif v_apagadas <> v_ja_antigas + 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a execução apagou % linha(s), esperado % (as já antigas mais a sonda)',
      v_apagadas, v_ja_antigas + 1;
  end if;

  if v_antiga_sobrou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a linha de 100 dias sobreviveu — a promessa da /privacidade continua sem executor';
  end if;

  if v_recente_sobrou <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a linha de 89 dias foi apagada — a janela real é menor que os 90 dias prometidos';
  end if;

  if v_piso_cedeu then
    falhas := falhas + 1;
    raise warning 'FALHOU: limpar_erros_antigos(0) executou — sem o piso, o job diário fica a um typo de um TRUNCATE';
  end if;

  -- ── 6. A sonda não deixou rastro ────────────────────────────────────────
  select count(*) into v_linhas_depois from public.erros;
  if v_linhas_depois <> v_linhas_antes then
    falhas := falhas + 1;
    raise warning 'FALHOU: public.erros tinha % linha(s) e ficou com % — a sonda deixou rastro',
      v_linhas_antes, v_linhas_depois;
  end if;

  if exists (select 1 from public.erros where assunto = 'aceite-retencao-cron') then
    falhas := falhas + 1;
    raise warning 'FALHOU: sobrou sonda de aceite em public.erros';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no agendamento da retenção de erros', falhas;
  end if;

  raise notice 'retenção OK: job % "retencao-de-erros", agenda %, ativo, comando "%".',
    v_job.jobid, v_job.schedule, v_job.command;
  raise notice 'retenção OK: reagendar não duplicou — 1 job com o nome, jobid % preservado, e 1 job só chamando a função.',
    v_jobid_depois;
  raise notice 'retenção OK: o papel % executou o comando agendado e apagou % linha(s); a de 100 dias saiu, a de 89 ficou.',
    v_username, v_apagadas;
  raise notice 'retenção OK: o piso recusou dias=0, e public.erros tinha % linha(s) e continua com %.',
    v_linhas_antes, v_linhas_depois;
end $aceite$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260912120000', 'retencao_de_erros_agendada')
  on conflict (version) do nothing;
