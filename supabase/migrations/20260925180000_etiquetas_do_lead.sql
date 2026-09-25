-- ============================================================================
-- As etiquetas do lead e o crédito do SDR (2026-09-25)
-- ============================================================================
--
-- Pedido do dono: *"ele [o SDR] tem que ter acesso às etiquetas"* e *"quando o
-- sdr atribuir um contato para um vendedor do comercial, precisamos manter a
-- tag de resgate e reaquecido, para mensurar o trabalho dele, isso tem que ser
-- feito automático"*. Decisões dele na mesma conversa: a passagem acontece no
-- card do painel (o select de responsável), o SDR VÊ e EDITA as etiquetas no
-- card, e a passagem garante SEMPRE as duas — "resgate" e "reaquecido".
--
-- As etiquetas moram no Chatwoot (labels da conversa) e chegam ao banco pelo
-- n8n, em `atendimentos.tags`. Quem escreve no Chatwoot é o site, pela API
-- (`src/lib/etiquetasDoChatwoot.ts`). Esta migração cuida do que NÃO pode
-- depender do Chatwoot: a medição. Se a API cair, se o token faltar, se alguém
-- tirar a etiqueta na mão lá, o crédito do SDR continua no rastro do lead.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
--   1. `leads_eventos.tipo` aceita 'etiqueta'. O CHECK é reescrito com os oito
--      tipos de antes e o novo, depois de uma CONFERÊNCIA PRÉVIA: se o CHECK
--      de produção não for exatamente o conhecido (com ou sem 'etiqueta'), a
--      migração aborta antes de mudar qualquer coisa.
--   2. `registrar_etiquetas_do_lead(lead, antes, depois)`: o card grava no
--      rastro cada edição de etiqueta — quem, quando, o que entrou e o que
--      saiu. SECURITY DEFINER com guarda de staff, o mesmo gesto de
--      `registrar_contato_do_lead` (20260828120000): `leads_eventos` não tem
--      policy de escrita, e escrita de rastro é escrita de sistema.
--   3. O crédito do SDR, num gatilho: quando uma SESSÃO de SDR (papeis contém
--      'sdr', conta ativa) troca o responsável do lead para alguém, o rastro
--      ganha um evento 'etiqueta' com origem `passagem_do_sdr` e as etiquetas
--      "resgate" e "reaquecido", assinado pelo SDR. Gatilho, e não a rota,
--      porque a regra é do dado: qualquer caminho que o SDR use para passar o
--      lead deixa o crédito, e nenhum caminho o esquece.
--
--      Não entram no crédito: o motor (sem sessão — o rodízio de
--      `montar_fila_do_funil`), quem não é SDR (o Comercial passando entre si),
--      e tirar o dono (responsável vazio não é passagem).
--
-- A medição sai do rastro, sem tabela nova:
--
--   select e.autor as sdr, count(*) as passagens,
--          count(*) filter (where l.desfecho = 'ganho') as viraram_venda
--     from public.leads_eventos e join public.leads l on l.id = e.lead_id
--    where e.tipo = 'etiqueta' and e.detalhe->>'origem' = 'passagem_do_sdr'
--    group by e.autor;
--
-- Tudo aditivo: um tipo novo num CHECK (os oito de antes continuam), uma
-- função nova, um gatilho novo. Nenhuma coluna, nenhuma tabela, nenhum dado
-- reescrito. Idempotente: reaplicar recria o CHECK igual, as funções iguais e
-- o gatilho igual.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.leads_eventos'::regclass
     and conname  = 'leads_eventos_tipo_check';

  if v_def is null then
    raise exception 'CONFERÊNCIA PRÉVIA: leads_eventos_tipo_check não existe — nada foi aplicado';
  end if;

  if v_def not in (
    'CHECK ((tipo = ANY (ARRAY[''entrada''::text, ''etapa''::text, ''responsavel''::text, ''transferencia''::text, ''contato''::text, ''desfecho''::text, ''alerta''::text, ''nota''::text])))',
    'CHECK ((tipo = ANY (ARRAY[''entrada''::text, ''etapa''::text, ''responsavel''::text, ''transferencia''::text, ''contato''::text, ''desfecho''::text, ''alerta''::text, ''nota''::text, ''etiqueta''::text])))'
  ) then
    raise exception 'CONFERÊNCIA PRÉVIA: o CHECK de leads_eventos.tipo não é o conhecido (%) — nada foi aplicado', v_def;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 1. O tipo novo no rastro
-- ----------------------------------------------------------------------------
alter table public.leads_eventos drop constraint if exists leads_eventos_tipo_check;
alter table public.leads_eventos
  add constraint leads_eventos_tipo_check
  check (tipo in ('entrada', 'etapa', 'responsavel', 'transferencia',
                  'contato', 'desfecho', 'alerta', 'nota', 'etiqueta'));


-- ----------------------------------------------------------------------------
-- 2. A edição de etiquetas pelo card
-- ----------------------------------------------------------------------------
create or replace function public.registrar_etiquetas_do_lead(
  p_lead   uuid,
  p_antes  text[],
  p_depois text[]
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_antes  text[] := coalesce(p_antes,  '{}');
  v_depois text[] := coalesce(p_depois, '{}');
  v_id     uuid;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Registrar etiquetas é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.leads where id = p_lead) then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

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
  )
  returning id into v_id;

  return v_id;
end $$;

comment on function public.registrar_etiquetas_do_lead(uuid, text[], text[]) is
  'Grava no rastro do lead uma edição de etiquetas feita no card (2026-09-25): '
  'antes, depois, o que entrou e o que saiu, e quem fez. As etiquetas em si '
  'moram no Chatwoot; o rastro é a prova que não depende dele. Restrita à '
  'equipe (guarda de is_staff).';

revoke all on function public.registrar_etiquetas_do_lead(uuid, text[], text[]) from public, anon;
grant execute on function public.registrar_etiquetas_do_lead(uuid, text[], text[])
  to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. O crédito do SDR na passagem
-- ----------------------------------------------------------------------------
create or replace function public.leads_credito_do_resgate()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- Sem sessão é o motor (o rodízio): não é trabalho de ninguém.
  if auth.uid() is null then
    return new;
  end if;

  -- Tirar o dono não é passar o lead.
  if nullif(trim(coalesce(new.responsavel, '')), '') is null then
    return new;
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and 'sdr' = any (p.papeis)
  ) then
    return new;
  end if;

  insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico, detalhe)
  values (
    new.id, 'etiqueta', null, 'resgate, reaquecido',
    public.autor_atual(), false,
    jsonb_build_object(
      'origem',           'passagem_do_sdr',
      'etiquetas',        jsonb_build_array('resgate', 'reaquecido'),
      'responsavel_de',   old.responsavel,
      'responsavel_para', new.responsavel
    )
  );

  return new;
end $$;

comment on function public.leads_credito_do_resgate() is
  'O crédito do SDR (2026-09-25): quando uma sessão de SDR troca o responsável '
  'do lead para alguém, o rastro ganha um evento ''etiqueta'' com origem '
  'passagem_do_sdr e as etiquetas resgate e reaquecido, assinado por ele. O '
  'motor (sem sessão), quem não é SDR e tirar o dono não contam.';

drop trigger if exists trg_leads_credito_do_resgate on public.leads;
create trigger trg_leads_credito_do_resgate
  after update of responsavel on public.leads
  for each row
  when (old.responsavel is distinct from new.responsavel)
  execute function public.leads_credito_do_resgate();


-- ============================================================================
-- Aceite
-- ============================================================================
-- Estrutura, e depois efeito numa sonda desfeita pelo sentinela: SDR passando
-- o lead deixa o crédito; Comercial, motor e "sem responsável" não deixam; a
-- edição pelo card grava antes/depois/entrou/saiu; o cliente da Garagem é
-- barrado pela guarda; o CHECK continua recusando tipo inventado.
do $$
declare
  falhas        int := 0;
  v_sdr         uuid;
  v_com         uuid;
  v_cliente     uuid := gen_random_uuid();
  v_lead        uuid;
  v_evento      uuid;
  v_credito_sdr int;
  v_autor_sdr   text;
  v_detalhe_sdr jsonb;
  v_credito_com int;
  v_credito_mot int;
  v_credito_sem int;
  v_card        jsonb;
  v_card_autor  text;
  v_cliente_rpc text := 'executou';
  v_invalido    text := 'gravou';
  v_msg         text;
begin
  -- Estrutura ---------------------------------------------------------------
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads_eventos'::regclass
                    and conname = 'leads_eventos_tipo_check'
                    and pg_get_constraintdef(oid) like '%''etiqueta''%'
                    and pg_get_constraintdef(oid) like '%''nota''%'
                    and pg_get_constraintdef(oid) like '%''entrada''%') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o CHECK de leads_eventos.tipo não aceita etiqueta ou perdeu um tipo antigo';
  end if;

  if not exists (select 1 from pg_proc
                  where oid = 'public.registrar_etiquetas_do_lead(uuid, text[], text[])'::regprocedure
                    and prosecdef) then
    falhas := falhas + 1;
    raise warning 'FALHOU: registrar_etiquetas_do_lead não é SECURITY DEFINER';
  end if;

  if has_function_privilege('anon', 'public.registrar_etiquetas_do_lead(uuid, text[], text[])', 'execute') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon executa registrar_etiquetas_do_lead';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.leads'::regclass
                    and tgname = 'trg_leads_credito_do_resgate'
                    and not tgisinternal) then
    falhas := falhas + 1;
    raise warning 'FALHOU: o gatilho do crédito do SDR não está em leads';
  end if;

  -- Efeito — tudo daqui até o sentinela é desfeito -------------------------
  begin
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-sdr@exemplo.invalido', now(), now())
    returning id into v_sdr;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-com@exemplo.invalido', now(), now())
    returning id into v_com;

    update public.profiles
       set full_name = 'Aceite Etiquetas SDR', papeis = array['sdr'], role = 'sdr', is_active = true
     where id = v_sdr;
    update public.profiles
       set full_name = 'Aceite Etiquetas Comercial', papeis = array['comercial'], role = 'comercial',
           is_active = true
     where id = v_com;

    insert into public.leads (nome, telefone, interesse)
    values ('Aceite Etiquetas', '5541999990925', 'Teste Aceite 2021')
    returning id into v_lead;

    -- E1 · O SDR passa o lead para o Comercial: crédito assinado por ele.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Etiquetas Comercial' where id = v_lead;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    select count(*), max(autor), (array_agg(detalhe))[1]
      into v_credito_sdr, v_autor_sdr, v_detalhe_sdr
      from public.leads_eventos
     where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr';

    -- E2 · O Comercial passa entre si: sem crédito novo.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_com, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.leads set responsavel = 'Outro Comercial' where id = v_lead;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    select count(*) into v_credito_com
      from public.leads_eventos
     where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr';

    -- E3 · O motor (sem sessão) transfere: sem crédito novo.
    update public.leads set responsavel = 'Terceiro Comercial' where id = v_lead;
    select count(*) into v_credito_mot
      from public.leads_eventos
     where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr';

    -- E4 · O SDR tira o dono: não é passagem.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.leads set responsavel = null where id = v_lead;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    select count(*) into v_credito_sem
      from public.leads_eventos
     where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr';

    -- E5 · O SDR edita as etiquetas no card.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_evento := public.registrar_etiquetas_do_lead(
      v_lead, array['resgate', 'origem-site'], array['resgate', 'quer-comprar']);
    reset role;
    perform set_config('request.jwt.claims', '', true);

    select detalhe, autor into v_card, v_card_autor from public.leads_eventos where id = v_evento;

    -- E6 · O cliente da Garagem (authenticated, sem staff) é barrado pela guarda.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cliente, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_etiquetas_do_lead(v_lead, array[]::text[], array['resgate']);
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
      v_cliente_rpc := v_msg;
    end;

    -- E7 · Tipo inventado continua recusado.
    begin
      insert into public.leads_eventos (lead_id, tipo) values (v_lead, 'inventado');
    exception when check_violation then
      v_invalido := 'recusado';
    end;

    raise exception 'DESFAZER_ACEITE_ETIQUETAS_DO_LEAD' using errcode = 'ETQ01';
  exception
    when sqlstate 'ETQ01' then null;
  end;

  -- O veredito -------------------------------------------------------------
  if v_lead is null or v_sdr is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a gravar — nada foi provado';
  end if;

  if v_credito_sdr is distinct from 1
     or v_autor_sdr is distinct from 'Aceite Etiquetas SDR'
     or v_detalhe_sdr->'etiquetas' is distinct from '["resgate", "reaquecido"]'::jsonb
     or v_detalhe_sdr->>'responsavel_para' is distinct from 'Aceite Etiquetas Comercial' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a passagem do SDR não deixou o crédito certo (% eventos, autor "%", detalhe %)',
      v_credito_sdr, v_autor_sdr, v_detalhe_sdr;
  end if;
  if v_credito_com is distinct from 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o Comercial passando entre si gerou crédito (% eventos)', v_credito_com;
  end if;
  if v_credito_mot is distinct from 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o motor gerou crédito de SDR (% eventos)', v_credito_mot;
  end if;
  if v_credito_sem is distinct from 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: tirar o dono contou como passagem (% eventos)', v_credito_sem;
  end if;
  if v_card_autor is distinct from 'Aceite Etiquetas SDR'
     or v_card->>'origem' is distinct from 'card'
     or v_card->'incluidas' is distinct from '["quer-comprar"]'::jsonb
     or v_card->'retiradas' is distinct from '["origem-site"]'::jsonb then
    falhas := falhas + 1;
    raise warning 'FALHOU: a edição pelo card não foi gravada como devia (autor "%", detalhe %)',
      v_card_autor, v_card;
  end if;
  if v_cliente_rpc = 'executou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o cliente da Garagem gravou etiqueta no rastro';
  end if;
  if v_invalido is distinct from 'recusado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o CHECK aceitou um tipo inventado';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) nas etiquetas do lead', falhas;
  end if;
  raise notice 'Aceite verificado: a passagem do SDR deixa resgate e reaquecido no rastro, e só ela; a edição pelo card fica registrada; o cliente é barrado.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260925180000', 'etiquetas_do_lead')
  on conflict (version) do nothing;
