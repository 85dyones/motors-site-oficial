-- ---------------------------------------------------------------------------
-- O próximo passo deixa de ser obrigatório, e concluir um passo sem marcar
-- outro tira o concluído do lead (2026-10-09)
-- ---------------------------------------------------------------------------
-- Pedido do dono em 2026-10-09: *"elimine a obrigatoriedade do próximo passo
-- na gestão de leads, não conseguimos incluir uma nota de atendimento [...]
-- nem sempre teremos o próximo passo, isso pode inibir o comercial de usar o
-- sistema"*.
--
-- A obrigatoriedade nunca morou no banco: `registrar_interacao_do_lead` já
-- aceitava registro sem passo, gravava a interação, reiniciava o relógio e
-- MANTINHA o passo que o lead tinha. Quem recusava era `decidirInteracao`
-- (lib/gestaoDoLead), na rota e na tela. Tirar a regra de lá basta para a
-- nota de atendimento.
--
-- ---------------------------------------------------------------------------
-- O que só o banco resolve: CONCLUIR sem passo novo
-- ---------------------------------------------------------------------------
-- O botão CONCLUIR do bloco do próximo passo abre o registro com "Feito: {o
-- passo}." e o campo do passo vazio. Enquanto o passo era obrigatório, o
-- registro sempre trazia um passo novo, que substituía o concluído. Com o
-- passo opcional, um CONCLUIR sem passo novo cairia no ramo "mantém o que o
-- lead tinha": o card seguiria mostrando — e a Lista do dia cobrando como
-- atrasado — um passo que acabou de ser feito. E não havia caminho nenhum
-- para limpar o passo de um lead.
--
-- Daí o parâmetro novo, `p_passo_concluido`: o `proximo_passo_definido_em`
-- do passo que o vendedor concluiu, como a tela o leu.
--
--   - nulo (o padrão): tudo como antes. Com passo, ele substitui o do lead;
--     sem passo, o lead mantém o que tinha. É o caso da nota de atendimento.
--   - preenchido e sem passo novo: o passo do lead é LIMPO (texto,
--     vencimento, quem definiu e quando) — mas SÓ se ainda for aquele passo.
--   - preenchido com passo novo: o passo novo substitui, como sempre.
--
-- Por que o carimbo, e não um "sim, concluir": entre o CONCLUIR e o REGISTRAR
-- o passo do lead pode mudar. O "Chegou na loja" da mesma tela grava "Atender
-- na loja" sem tocar no formulário, e um colega pode remarcar no meio-tempo.
-- Um "sim" apagaria o passo que estivesse lá na hora, que não é o concluído.
-- Com o carimbo, o passo que mudou fica; só o concluído sai.
--
-- Em todos os casos o relógio da estagnação reinicia: registrar é atender.
--
-- ---------------------------------------------------------------------------
-- Por que DROP e não `create or replace`
-- ---------------------------------------------------------------------------
-- O parâmetro novo tem default. Se a versão de seis argumentos ficasse de pé,
-- a chamada da rota (seis argumentos nomeados) casaria com as DUAS e o
-- PostgREST recusaria por ambiguidade — derrubando todo registro de
-- interação. O mesmo gesto da `20260915120000`. Aplicada numa transação só
-- (`supabase/manutencao/aplicar-migracao.js` faz BEGIN … COMMIT), a troca
-- não abre janela.
--
-- A rota só manda `p_passo_concluido` no CONCLUIR sem passo novo. Assim a
-- ordem entre esta migração e o deploy do código não quebra a nota de
-- atendimento: antes da migração, só o CONCLUIR sem passo novo recebe o 503 de
-- "migração pendente"; depois dela, a chamada de seis argumentos casa com a
-- função nova pelo default.
-- ---------------------------------------------------------------------------

drop function if exists public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz);

create or replace function public.registrar_interacao_do_lead(
  p_lead            uuid,
  p_tipo            text,
  p_resultado       text        default null,
  p_texto           text        default null,
  p_passo           text        default null,
  p_vence_em        timestamptz default null,
  p_passo_concluido timestamptz default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id    uuid;
  v_autor text := public.autor_atual();
  v_passo text := nullif(trim(p_passo), '');
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Registrar interação é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.leads where id = p_lead) then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  -- Passo sem data, ou data sem passo, é meio compromisso: o card não saberia
  -- o que mostrar nem quando avisar.
  if (v_passo is null) <> (p_vence_em is null) then
    raise exception 'O próximo passo precisa de texto e de data, juntos.'
      using errcode = 'check_violation';
  end if;

  insert into public.leads_interacoes
    (lead_id, tipo, resultado, texto, autor, passo_texto, passo_vence_em)
  values
    (p_lead, p_tipo, p_resultado, nullif(trim(p_texto), ''), v_autor, v_passo, p_vence_em)
  returning id into v_id;

  if v_passo is not null then
    -- O passo novo substitui o do lead. Quem reinicia o relógio é o gatilho
    -- `leads_antes_de_atualizar` (`proximo_passo_definido_em` mudou).
    update public.leads
       set proximo_passo              = v_passo,
           proximo_passo_vence_em     = p_vence_em,
           proximo_passo_definido_em  = now(),
           proximo_passo_definido_por = v_autor
     where id = p_lead;
  else
    -- Sem passo novo o relógio reinicia sempre; o passo só sai quando é o
    -- que o vendedor concluiu (o carimbo bate). Nota de atendimento, ou passo
    -- que mudou depois do CONCLUIR, ficam.
    update public.leads
       set ultimo_contato_em          = now(),
           alertado_em                = null,
           proximo_passo              = case when v_conclui then null else proximo_passo end,
           proximo_passo_vence_em     = case when v_conclui then null else proximo_passo_vence_em end,
           proximo_passo_definido_em  = case when v_conclui then null else proximo_passo_definido_em end,
           proximo_passo_definido_por = case when v_conclui then null else proximo_passo_definido_por end
      from (select p_passo_concluido is not null
                   and l.proximo_passo_definido_em = p_passo_concluido as v_conclui
              from public.leads l where l.id = p_lead) as decisao
     where id = p_lead;
  end if;

  return v_id;
end $$;

comment on function public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz, timestamptz) is
  'Grava um registro do vendedor e, se vier, o próximo passo no lead — numa '
  'transação só (2026-09-23). O passo é opcional (2026-10-09): sem ele o lead '
  'mantém o que tinha, ou o perde quando `p_passo_concluido` é o carimbo '
  '(`proximo_passo_definido_em`) do passo em vigor — o CONCLUIR sem passo '
  'novo. Reinicia o relógio da estagnação. SECURITY DEFINER com guarda de '
  'staff: `leads_interacoes` não tem policy de INSERT.';

comment on column public.leads.proximo_passo is
  'O que o vendedor combinou fazer a seguir (2026-09-23). Opcional desde '
  '2026-10-09: nem todo atendimento termina com um passo combinado. Só o meio '
  'passo (texto sem data ou data sem texto) é recusado, aqui e em '
  '`decidirInteracao` (lib/gestaoDoLead). É o que o card mostra.';

revoke all on function public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz, timestamptz)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Aceite — exerce os caminhos, não confere metadado
-- ---------------------------------------------------------------------------
-- Um vendedor sintético registra no mesmo lead:
--   E1 a chamada de SEIS argumentos (a da rota fora do CONCLUIR) define um passo;
--   E2 nota sem passo: o passo fica, o relógio reinicia;
--   E3 CONCLUIR com carimbo VELHO (o passo mudou depois): o passo fica;
--   E4 CONCLUIR com o carimbo do passo em vigor: o passo sai inteiro, os
--      quatro campos, e o relógio reinicia;
--   E5 CONCLUIR com passo novo: o novo entra;
--   E6 anon: barrado no EXECUTE, e não só pela guarda de equipe.
-- Tudo dentro de um bloco desfeito pelo sentinela; o veredito lê as
-- variáveis que sobreviveram ao rollback.
-- ---------------------------------------------------------------------------
do $aceite$
declare
  falhas            int := 0;
  v_staff           uuid;
  v_lead            uuid;
  v_vence           timestamptz := now() + interval '1 day';
  v_carimbo         timestamptz;
  v_seis_args       text;
  v_passo_nota      text;
  v_relogio_nota    boolean;
  v_passo_velho     text;
  v_passo_feito     text;
  v_vence_feito     timestamptz;
  v_definido_feito  timestamptz;
  v_por_feito       text;
  v_relogio_feito   boolean;
  v_passo_novo      text;
  v_interacoes      int;
  v_anon            text;
  v_msg             text;
begin
  -- 0 · Só a assinatura nova está de pé: duas versões seriam ambiguidade.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'registrar_interacao_do_lead') <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: há mais de uma registrar_interacao_do_lead — a rota cairia em ambiguidade';
  end if;
  if has_function_privilege('anon',
       'public.registrar_interacao_do_lead(uuid, text, text, text, text, timestamptz, timestamptz)', 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon executa registrar_interacao_do_lead';
  end if;

  begin
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-passo-opcional@exemplo.invalido', now(), now())
    returning id into v_staff;
    update public.profiles
       set full_name = 'Aceite Passo Opcional', papeis = array['comercial'], role = 'comercial'
     where id = v_staff;

    insert into public.leads (nome, telefone, interesse)
    values ('Aceite Passo Opcional', '5541999991009', 'Teste Aceite 2022')
    returning id into v_lead;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);

    -- E1 · A chamada de seis argumentos (a da rota) define um passo.
    set local role authenticated;
    begin
      perform public.registrar_interacao_do_lead(
        v_lead, 'ligacao', 'atendeu', 'Aceite: combinamos', 'Enviar proposta', v_vence);
      v_seis_args := 'ok';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_seis_args := v_msg;
    end;
    reset role;
    select proximo_passo_definido_em into v_carimbo from public.leads where id = v_lead;

    -- E2 · Nota de atendimento sem passo: o passo fica, o relógio reinicia.
    update public.leads
       set ultimo_contato_em = now() - interval '5 days', alertado_em = now() - interval '2 hours'
     where id = v_lead;
    set local role authenticated;
    perform public.registrar_interacao_do_lead(v_lead, 'nota', null, 'Aceite: cliente pediu um tempo');
    reset role;
    select proximo_passo, (ultimo_contato_em > now() - interval '1 minute' and alertado_em is null)
      into v_passo_nota, v_relogio_nota
      from public.leads where id = v_lead;

    -- E3 · CONCLUIR com um carimbo que não é o do passo em vigor (o passo
    --      mudou entre o CONCLUIR e o REGISTRAR): o passo em vigor fica.
    set local role authenticated;
    perform public.registrar_interacao_do_lead(
      v_lead, 'nota', null, 'Feito: o passo de antes.', null, null, v_carimbo - interval '1 hour');
    reset role;
    select proximo_passo into v_passo_velho from public.leads where id = v_lead;

    -- E4 · CONCLUIR com o carimbo do passo em vigor: o passo sai inteiro.
    update public.leads
       set ultimo_contato_em = now() - interval '5 days', alertado_em = now() - interval '2 hours'
     where id = v_lead;
    set local role authenticated;
    perform public.registrar_interacao_do_lead(
      v_lead, 'nota', null, 'Feito: Enviar proposta.', null, null, v_carimbo);
    reset role;
    select proximo_passo, proximo_passo_vence_em, proximo_passo_definido_em, proximo_passo_definido_por,
           (ultimo_contato_em > now() - interval '1 minute' and alertado_em is null)
      into v_passo_feito, v_vence_feito, v_definido_feito, v_por_feito, v_relogio_feito
      from public.leads where id = v_lead;

    -- E5 · CONCLUIR com passo novo: o novo entra.
    set local role authenticated;
    perform public.registrar_interacao_do_lead(
      v_lead, 'nota', null, 'Feito: proposta. Agora a visita.', 'Confirmar visita', v_vence, v_carimbo);
    reset role;
    select proximo_passo into v_passo_novo from public.leads where id = v_lead;
    select count(*) into v_interacoes from public.leads_interacoes where lead_id = v_lead;

    -- E6 · anon: barrado no PRIVILÉGIO. A guarda de equipe também levanta
    --      42501, então a mensagem é que separa os dois: se a guarda falou,
    --      anon passou do EXECUTE.
    begin
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      set local role anon;
      perform public.registrar_interacao_do_lead(v_lead, 'nota', null, 'anon tentou', null, null, v_carimbo);
      reset role;
      v_anon := 'executou';
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
      reset role;
      v_anon := case when v_msg = 'Registrar interação é restrito à equipe.'
                     then 'barrado só pela guarda' else 'negado' end;
    end;

    raise exception 'DESFAZER_ACEITE_PASSO_OPCIONAL' using errcode = 'LPO01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'LPO01' then null;
  end;

  if v_lead is null or v_staff is null or v_carimbo is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a gravar — nada foi provado';
  end if;

  if v_seis_args is distinct from 'ok' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a chamada de seis argumentos (a da rota) não passou: %', v_seis_args;
  end if;
  if v_passo_nota is distinct from 'Enviar proposta' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a nota sem passo mexeu no passo do lead (ficou %)', coalesce(v_passo_nota, '<nulo>');
  end if;
  if v_relogio_nota is not true then
    falhas := falhas + 1;
    raise warning 'FALHOU: a nota sem passo não reiniciou o relógio';
  end if;
  if v_passo_velho is distinct from 'Enviar proposta' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o CONCLUIR com carimbo velho apagou o passo em vigor (ficou %)',
      coalesce(v_passo_velho, '<nulo>');
  end if;
  if v_passo_feito is not null or v_vence_feito is not null
     or v_definido_feito is not null or v_por_feito is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: o CONCLUIR sem passo novo deixou o passo no lead (%, %, %, %)',
      v_passo_feito, v_vence_feito, v_definido_feito, v_por_feito;
  end if;
  if v_relogio_feito is not true then
    falhas := falhas + 1;
    raise warning 'FALHOU: o CONCLUIR sem passo novo não reiniciou o relógio';
  end if;
  if v_passo_novo is distinct from 'Confirmar visita' then
    falhas := falhas + 1;
    raise warning 'FALHOU: com passo novo, o CONCLUIR atrapalhou (ficou %)', coalesce(v_passo_novo, '<nulo>');
  end if;
  if v_interacoes is distinct from 5 then
    falhas := falhas + 1;
    raise warning 'FALHOU: eram 5 registros no rastro, ficaram %', v_interacoes;
  end if;
  if v_anon is distinct from 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon chamando registrar_interacao_do_lead: % — tinha de parar no EXECUTE', v_anon;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em concluir_passo_sem_proximo', falhas;
  end if;

  raise notice
    'Aceite verificado: uma só registrar_interacao_do_lead, sem EXECUTE para anon; '
    'a chamada de seis argumentos segue valendo; nota sem passo mantém o passo e '
    'reinicia o relógio; CONCLUIR com carimbo velho não apaga o passo em vigor; '
    'CONCLUIR com o carimbo certo limpa os quatro campos do passo e reinicia o '
    'relógio; com passo novo, o novo entra; a prova não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261009120000', 'concluir_passo_sem_proximo')
  on conflict (version) do nothing;
