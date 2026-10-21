-- ============================================================================
-- As etiquetas moram no lead (o Chatwoot sai de cena)
-- ============================================================================
-- Decisão do dono (2026-10-20): com o atendimento 2.0 no WhatsApp da loja,
-- *"neste cenário o chatwoot sai de cena"* — e *"gostaria de manter a questão
-- das tags no lead"*.
--
-- Até aqui a etiqueta morava na CONVERSA do Chatwoot: o card lia o espelho que
-- o n8n copiava para `atendimentos.tags` e gravava pela API do Chatwoot. Sem o
-- Chatwoot, ninguém mais grava, e o lead que nunca teve conversa lá (o do site,
-- o do atendimento novo) nunca pôde ter etiqueta.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
-- 1. `leads.etiquetas text[]` — a lista do lead, a fonte de verdade. Nasce com
--    as etiquetas do atendimento mais recente (a mesma régua de "mais recente"
--    de `montar_fila_do_funil`) e, no lead que o SDR já passou com crédito
--    (evento 'etiqueta' de origem `passagem_do_sdr` no rastro), com "resgate"
--    e "reaquecido".
-- 2. `editar_etiquetas_do_lead(lead, incluir, retirar, rastro)` — aplica a
--    MUDANÇA (nunca a lista inteira) sob trava da linha, e deixa no rastro o
--    que entrou e o que saiu com
--    o mesmo evento 'etiqueta' de `registrar_etiquetas_do_lead`
--    (20260925180000), o histórico de antes. SECURITY DEFINER, com a guarda da
--    linha "Ver e mover leads no kanban" (admin, gestor, comercial, sdr — conta
--    ativa; o gestor entrou na linha em 03/10 e a guarda antiga não o
--    acompanhou, por isso o evento é gravado aqui e não chamando a antiga); o
--    escopo de cada um (o vendedor só no lead dele) é da rota, como era. Mesma
--    caixa do Chatwoot para comparar ("Lead Quente" e "lead quente" são a
--    mesma).
--
-- O que NÃO muda: o crédito do SDR (o gatilho de 20260925180000 continua
-- lendo o rastro) e `montar_fila_do_funil`, que segue lendo "resgate" no
-- atendimento — a Fila de Resgate do n8n sai junto com o Chatwoot (as cadências
-- do assistente assumem o resgate), e os leads que já estão no resgate seguem
-- com a marca de lá.
--
-- Aditiva e idempotente: `add column if not exists`, regra só se ausente,
-- carga só no lead ainda sem etiqueta, `create or replace function`.
-- ============================================================================

alter table public.leads add column if not exists etiquetas text[] not null default '{}'::text[];

do $regra$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.leads'::regclass and conname = 'leads_etiquetas_no_teto'
  ) then
    alter table public.leads add constraint leads_etiquetas_no_teto check (cardinality(etiquetas) <= 50);
  end if;
end
$regra$;

comment on column public.leads.etiquetas is
  'As etiquetas do lead (2026-10-20): a fonte de verdade desde que o Chatwoot saiu. '
  'Grava-se só por editar_etiquetas_do_lead, que deixa o rastro.';

-- A carga: as etiquetas da conversa mais recente de cada lead.
update public.leads l
   set etiquetas = a.tags
  from (
    select distinct on (lead_id) lead_id, tags
      from public.atendimentos
     where lead_id is not null
     order by lead_id, coalesce(iniciado_em, created_at) desc, created_at desc, id desc
  ) a
 where a.lead_id = l.id
   and cardinality(l.etiquetas) = 0
   and coalesce(cardinality(a.tags), 0) between 1 and 50;

-- O lead que o SDR já passou com crédito leva as duas da passagem.
update public.leads l
   set etiquetas = l.etiquetas
                   || case when 'resgate'    = any(l.etiquetas) then '{}'::text[] else array['resgate']    end
                   || case when 'reaquecido' = any(l.etiquetas) then '{}'::text[] else array['reaquecido'] end
 where exists (
         select 1 from public.leads_eventos e
          where e.lead_id = l.id
            and e.tipo = 'etiqueta'
            and e.detalhe->>'origem' = 'passagem_do_sdr'
       )
   and not ('resgate' = any(l.etiquetas) and 'reaquecido' = any(l.etiquetas))
   and cardinality(l.etiquetas) <= 48;

create or replace function public.editar_etiquetas_do_lead(
  p_lead    uuid,
  p_incluir text[]  default '{}',
  p_retirar text[]  default '{}',
  p_rastro  boolean default true
)
  returns text[]
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_incluir text[] := coalesce(p_incluir, '{}');
  v_retirar text[] := coalesce(p_retirar, '{}');
  v_antes   text[];
  v_depois  text[];
  v_nova    text;
begin
  -- A linha "Ver e mover leads no kanban" da matriz (lib/permissoes.ts).
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and p.papeis && array['admin', 'gestor', 'comercial', 'sdr']
  ) then
    raise exception 'Editar etiquetas é de quem move lead no kanban.'
      using errcode = 'insufficient_privilege';
  end if;

  if cardinality(v_incluir) > 20 or cardinality(v_retirar) > 20
     or exists (select 1 from unnest(v_incluir || v_retirar) t where t is null or length(btrim(t)) = 0 or length(t) > 255) then
    raise exception 'Etiquetas fora do formato: até 20 por pedido, cada uma com 1 a 255 caracteres.'
      using errcode = 'check_violation';
  end if;

  select l.etiquetas into v_antes from public.leads l where l.id = p_lead for update;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Tira as pedidas (sem distinguir caixa), na ordem em que estavam.
  v_depois := array(
    select t.e
      from unnest(v_antes) with ordinality as t(e, i)
     where not exists (select 1 from unnest(v_retirar) r where lower(btrim(r)) = lower(t.e))
     order by t.i
  );
  -- Põe as novas que ainda não estão, no fim.
  foreach v_nova in array v_incluir loop
    if not exists (select 1 from unnest(v_depois) d where lower(d) = lower(btrim(v_nova))) then
      v_depois := v_depois || btrim(v_nova);
    end if;
  end loop;

  if v_depois is distinct from v_antes then
    update public.leads set etiquetas = v_depois where id = p_lead;
    -- O mesmo evento de `registrar_etiquetas_do_lead`: o histórico do lead
    -- não muda de formato porque a lista mudou de casa.
    if p_rastro then
      insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico, detalhe)
      values (
        p_lead, 'etiqueta',
        nullif(array_to_string(v_antes,  ', '), ''),
        nullif(array_to_string(v_depois, ', '), ''),
        public.autor_atual(), false,
        jsonb_build_object(
          'origem',    'card',
          'antes',     to_jsonb(v_antes),
          'depois',    to_jsonb(v_depois),
          'incluidas', to_jsonb(array(select e from unnest(v_depois) as e where e <> all (v_antes))),
          'retiradas', to_jsonb(array(select e from unnest(v_antes)  as e where e <> all (v_depois)))
        )
      );
    end if;
  end if;
  return v_depois;
end $$;

comment on function public.editar_etiquetas_do_lead(uuid, text[], text[], boolean) is
  'As etiquetas do lead (2026-10-20): aplica a mudança (pôr e tirar, sem distinguir '
  'caixa) sob trava da linha e deixa o rastro (evento etiqueta, origem card). '
  'Guarda: admin, gestor, comercial e sdr ativos; o escopo é da rota.';

revoke all on function public.editar_etiquetas_do_lead(uuid, text[], text[], boolean) from public, anon;
grant execute on function public.editar_etiquetas_do_lead(uuid, text[], text[], boolean) to authenticated, service_role;

-- ===========================================================================
-- Aceite — o que o vendedor vê e grava, contra o banco de verdade
-- ===========================================================================
-- Tudo dentro de um bloco que termina na SENTINELA: o que o aceite cria é
-- desfeito pelo próprio erro, sem apagar nada à mão.
do $aceite$
declare
  falhas   int := 0;
  v_falhou text[] := '{}';
  v_etapa  text;
  v_lead   uuid;
  v_id     uuid;
  v_lista  text[];
  v_n      int;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'etiquetas'
       and is_nullable = 'NO' and column_default like '''{}''%'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads.etiquetas não está como text[] not null default ''{}''';
  end if;

  if has_function_privilege('anon', 'public.editar_etiquetas_do_lead(uuid, text[], text[], boolean)', 'execute') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anônimo executa editar_etiquetas_do_lead';
  end if;

  begin
    select chave into v_etapa from public.funil_etapas where tipo = 'aberta' and ativa order by ordem limit 1;
    -- Com a origem já posta: a etiqueta de origem automática (20261025120000)
    -- não entra, e a lista é só a deste aceite.
    insert into public.leads (nome, telefone, situacao, etiquetas)
      values ('Aceite Etiquetas', '5541900004001', coalesce(v_etapa, 'novo'), array['origem-site', 'Lead Quente'])
      returning id into v_lead;

    -- Sem sessão, não grava.
    begin
      perform public.editar_etiquetas_do_lead(v_lead, array['vip'], '{}');
      v_falhou := v_falhou || 'sem sessão, gravou'::text;
    exception when insufficient_privilege then
      null;
    end;

    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'aceite-etiquetas-gestor@exemplo.invalido', now(), now())
    returning id into v_id;
    -- O gestor: o papel que a guarda antiga deixava de fora.
    update public.profiles set full_name = 'Aceite Etiquetas Gestor', papeis = array['gestor'], role = 'gestor', is_active = true
     where id = v_id;

    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- Põe "vip", tira "lead quente" (outra caixa): a mudança, não a lista.
    v_lista := public.editar_etiquetas_do_lead(v_lead, array['vip', 'VIP'], array['lead quente']);
    if v_lista is distinct from array['origem-site', 'vip'] then
      v_falhou := v_falhou || format('a mudança deu %s, e não {origem-site,vip}', v_lista);
    end if;
    -- Repetir não muda nada nem deixa rastro novo.
    v_lista := public.editar_etiquetas_do_lead(v_lead, array['Vip'], '{}');
    if v_lista is distinct from array['origem-site', 'vip'] then
      v_falhou := v_falhou || format('repetir deu %s', v_lista);
    end if;

    reset role;
    perform set_config('request.jwt.claims', '', true);

    select count(*) into v_n from public.leads_eventos where lead_id = v_lead and tipo = 'etiqueta';
    if v_n <> 1 then
      v_falhou := v_falhou || format('o rastro tem %s evento(s) de etiqueta, e não 1', v_n);
    end if;
    if (select etiquetas from public.leads where id = v_lead) is distinct from array['origem-site', 'vip'] then
      v_falhou := v_falhou || 'o lead não guardou a lista'::text;
    end if;

    -- Pedido grande demais é recusado.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.editar_etiquetas_do_lead(v_lead, array[repeat('x', 256)], '{}');
      v_falhou := v_falhou || 'aceitou etiqueta de 256 caracteres'::text;
    exception when check_violation then
      null;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    raise exception 'SENTINELA_DO_ACEITE';
  exception
    when others then
      if sqlerrm <> 'SENTINELA_DO_ACEITE' then
        reset role;
        perform set_config('request.jwt.claims', '', true);
        v_falhou := v_falhou || format('o bloco de efeito estourou: %s', sqlerrm);
      end if;
  end;

  if array_length(v_falhou, 1) > 0 then
    falhas := falhas + array_length(v_falhou, 1);
    for i in 1..array_length(v_falhou, 1) loop
      raise warning 'FALHOU: %', v_falhou[i];
    end loop;
  end if;

  if exists (select 1 from public.leads where nome = 'Aceite Etiquetas') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o aceite deixou linha para trás';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % verificação(ões) das etiquetas no lead', falhas;
  end if;
  raise notice 'Aceite verificado: as etiquetas moram no lead; a edição aplica a mudança sem distinguir caixa, '
               'deixa um rastro por mudança, recusa quem não move lead e o pedido fora do formato.';
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261023120000', 'etiquetas_no_lead')
  on conflict (version) do nothing;
