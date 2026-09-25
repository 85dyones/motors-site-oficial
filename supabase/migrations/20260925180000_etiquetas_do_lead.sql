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
--      saiu. SECURITY DEFINER, o mesmo gesto de `registrar_contato_do_lead`
--      (20260828120000): `leads_eventos` não tem policy de escrita, e escrita
--      de rastro é escrita de sistema. A guarda é a da linha "Ver e mover leads
--      no kanban" (admin, comercial, sdr — conta ativa), e não só `is_staff`:
--      o Marketing é staff e não mexe em lead. Listas com teto de tamanho.
--   3. O crédito do SDR, num gatilho: quando uma SESSÃO de SDR (papeis contém
--      'sdr', conta ativa) passa o lead para alguém do COMERCIAL ATIVO — a
--      mesma régua de `recebeLead` e do rodízio —, o rastro ganha um evento
--      'etiqueta' com origem `passagem_do_sdr` e as etiquetas "resgate" e
--      "reaquecido", assinado pelo SDR e com o id dele no detalhe. Gatilho, e
--      não a rota, porque a regra é do dado: qualquer caminho que o SDR use
--      para passar o lead deixa o crédito, e nenhum caminho o esquece.
--
--      Não entram no crédito: o motor (sem sessão — o rodízio de
--      `montar_fila_do_funil`), quem não é SDR (o Comercial passando entre si),
--      tirar o dono, repetir o mesmo dono, e dar o lead a quem não é do
--      Comercial ativo (um nome qualquer, o próprio SDR) — a policy de UPDATE
--      deixa a equipe escrever `responsavel` direto pelo PostgREST, sem passar
--      pela recusa da rota, e o crédito não pode depender dela.
--
-- A medição sai do rastro, sem tabela nova. Por LEAD, e não por evento: o SDR
-- que passa A→B→A deixa três eventos no rastro (é o que aconteceu), mas
-- resgatou um lead só. E pelo id, não pelo nome — nome muda, e homônimo mistura.
--
--   select p.full_name as sdr,
--          count(distinct e.lead_id) as leads_passados,
--          count(distinct e.lead_id) filter (where l.desfecho = 'ganho') as viraram_venda
--     from public.leads_eventos e
--     join public.leads l on l.id = e.lead_id
--     left join public.profiles p on p.id = (e.detalhe->>'sdr_id')::uuid
--    where e.tipo = 'etiqueta' and e.detalhe->>'origem' = 'passagem_do_sdr'
--    group by p.full_name;
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
  -- A linha "Ver e mover leads no kanban" da matriz (lib/permissoes.ts).
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.is_active
       and p.papeis && array['admin', 'comercial', 'sdr']
  ) then
    raise exception 'Registrar etiquetas é de quem move lead no kanban.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Uma conversa do Chatwoot não chega perto disto; passar daqui é lixo, e o
  -- rastro é só de inserção — o que entra, fica.
  if cardinality(v_antes) > 100 or cardinality(v_depois) > 100
     or exists (select 1 from unnest(v_antes || v_depois) as e where length(e) > 255) then
    raise exception 'ETIQUETAS_GRANDES_DEMAIS' using errcode = 'invalid_parameter_value';
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
  'moram no Chatwoot; o rastro é a prova que não depende dele. Restrita a '
  'quem move lead no kanban (admin, comercial, sdr ativos).';

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

  -- Passar é dar o lead ao Comercial ativo — a régua de `recebeLead` e do
  -- rodízio. Nome de ninguém, ou de quem não recebe lead, não é passagem.
  if not exists (
    select 1 from public.profiles c
     where c.is_active
       and 'comercial' = any (c.papeis)
       and nullif(trim(c.full_name), '') = trim(new.responsavel)
  ) then
    return new;
  end if;

  insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico, detalhe)
  values (
    new.id, 'etiqueta', null, 'resgate, reaquecido',
    -- Autor nulo, neste rastro, quer dizer "o motor". SDR sem nome no perfil
    -- não pode virar motor: fica o começo do id, e o id inteiro no detalhe.
    coalesce(public.autor_atual(), 'SDR ' || left(auth.uid()::text, 8)), false,
    jsonb_build_object(
      'origem',           'passagem_do_sdr',
      'sdr_id',           auth.uid(),
      'etiquetas',        jsonb_build_array('resgate', 'reaquecido'),
      'responsavel_de',   old.responsavel,
      'responsavel_para', new.responsavel
    )
  );

  return new;
end $$;

comment on function public.leads_credito_do_resgate() is
  'O crédito do SDR (2026-09-25): quando uma sessão de SDR passa o lead para '
  'alguém do Comercial ativo, o rastro ganha um evento ''etiqueta'' com origem '
  'passagem_do_sdr, as etiquetas resgate e reaquecido e o sdr_id, assinado por '
  'ele. O motor (sem sessão), quem não é SDR, tirar ou repetir o dono e dar o '
  'lead a quem não é do Comercial não contam. Medir por lead distinto.';

drop trigger if exists trg_leads_credito_do_resgate on public.leads;
create trigger trg_leads_credito_do_resgate
  after update of responsavel on public.leads
  for each row
  when (old.responsavel is distinct from new.responsavel)
  execute function public.leads_credito_do_resgate();


-- ============================================================================
-- Aceite
-- ============================================================================
-- Estrutura, e depois efeito numa sonda desfeita pelo sentinela. Um lead só,
-- passado de mão em mão, e a contagem de crédito conferida a cada passo — com
-- o `responsavel` relido, para um "sem crédito" nunca passar porque o UPDATE
-- foi barrado em silêncio pela RLS.
--
-- Cada passo mata uma mutação que uma versão anterior do aceite deixava viva
-- (revisões de 25/09): tirar o `when` do gatilho (C2), olhar `role` em vez de
-- `papeis` (C6), creditar nome de ninguém (C3), o próprio SDR (C9) ou um
-- ex-Comercial inativo (C10), comparar o nome sem `trim` (C5), deixar o autor
-- nulo para SDR sem nome (C11), guarda de `is_staff` (R2) ou sem `is_active`
-- (R5) na RPC, teto sem o tamanho de cada etiqueta (R6).
do $$
declare
  falhas        int := 0;
  v_sdr         uuid;
  v_duplo       uuid;
  v_com         uuid;
  v_com2        uuid;
  v_mkt         uuid;
  v_cli         uuid;
  v_ex_com      uuid;
  v_sem_nome    uuid;
  v_sdr_inativo uuid;
  v_lead        uuid;
  v_evento      uuid;
  -- a contagem de crédito e o responsável, depois de cada passo
  c             int[] := array[]::int[];
  r             text[] := array[]::text[];
  v_autor_sdr   text;
  v_detalhe_sdr jsonb;
  v_card        jsonb;
  v_card_autor  text;
  v_mkt_rpc     text := 'executou';
  v_cli_rpc     text := 'executou';
  v_grande_rpc  text := 'executou';
  v_longa_rpc   text := 'executou';
  v_inativo_rpc text := 'executou';
  v_autor_sem_nome text;
  v_invalido    text := 'gravou';
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
            'authenticated', 'authenticated', 'aceite-etiquetas-duplo@exemplo.invalido', now(), now())
    returning id into v_duplo;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-com@exemplo.invalido', now(), now())
    returning id into v_com;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-com2@exemplo.invalido', now(), now())
    returning id into v_com2;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-mkt@exemplo.invalido', now(), now())
    returning id into v_mkt;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-cli@exemplo.invalido', now(), now())
    returning id into v_cli;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-excom@exemplo.invalido', now(), now())
    returning id into v_ex_com;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-semnome@exemplo.invalido', now(), now())
    returning id into v_sem_nome;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-etiquetas-sdrinativo@exemplo.invalido', now(), now())
    returning id into v_sdr_inativo;

    update public.profiles
       set full_name = 'Aceite Etiquetas SDR', papeis = array['sdr'], role = 'sdr', is_active = true
     where id = v_sdr;
    -- SDR como SEGUNDO papel: `role` diz comercial, e ainda assim é SDR.
    update public.profiles
       set full_name = 'Aceite Etiquetas Duplo', papeis = array['comercial', 'sdr'], role = 'comercial',
           is_active = true
     where id = v_duplo;
    update public.profiles
       set full_name = 'Aceite Etiquetas Comercial', papeis = array['comercial'], role = 'comercial',
           is_active = true
     where id = v_com;
    update public.profiles
       set full_name = 'Aceite Etiquetas Comercial 2', papeis = array['comercial'], role = 'comercial',
           is_active = true
     where id = v_com2;
    update public.profiles
       set full_name = 'Aceite Etiquetas Marketing', papeis = array['marketing'], role = 'marketing',
           is_active = true
     where id = v_mkt;
    update public.profiles
       set full_name = 'Aceite Etiquetas Cliente', papeis = array['cliente'], role = 'cliente'
     where id = v_cli;
    -- Saiu da empresa: o nome continua no lead, mas não recebe mais lead.
    update public.profiles
       set full_name = 'Aceite Etiquetas Ex-Comercial', papeis = array['comercial'], role = 'comercial',
           is_active = false
     where id = v_ex_com;
    update public.profiles
       set full_name = null, papeis = array['sdr'], role = 'sdr', is_active = true
     where id = v_sem_nome;
    update public.profiles
       set full_name = 'Aceite Etiquetas SDR Inativo', papeis = array['sdr'], role = 'sdr', is_active = false
     where id = v_sdr_inativo;

    insert into public.leads (nome, telefone, interesse)
    values ('Aceite Etiquetas', '5541999990925', 'Teste Aceite 2021')
    returning id into v_lead;

    -- C1 · O SDR passa para o Comercial: crédito 1, assinado, com o id dele.
    perform set_config('request.jwt.claims', json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Etiquetas Comercial' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);
    select autor, detalhe into v_autor_sdr, v_detalhe_sdr
      from public.leads_eventos
     where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr'
     limit 1;

    -- C2 · O SDR repete o mesmo dono: sem crédito novo (o `when` do gatilho).
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Etiquetas Comercial' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);

    -- C3 · O SDR dá o lead a um nome de ninguém: gravou, mas não é passagem.
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Nome De Ninguem' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);

    -- C4 · O SDR tira o dono: não é passagem.
    set local role authenticated;
    update public.leads set responsavel = null where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || coalesce((select responsavel from public.leads where id = v_lead), '<nulo>');

    -- C5 · O SDR passa com espaço sobrando no nome: é o Comercial 2, e conta.
    set local role authenticated;
    update public.leads set responsavel = '  Aceite Etiquetas Comercial 2  ' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);

    -- C6 · Quem tem SDR como segundo papel passa para o Comercial: conta.
    perform set_config('request.jwt.claims', json_build_object('sub', v_duplo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Etiquetas Comercial' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);

    -- C7 · O Comercial passa para o Comercial: sem crédito.
    perform set_config('request.jwt.claims', json_build_object('sub', v_com, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Etiquetas Comercial 2' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);

    -- C8 · O motor (sem sessão) transfere: sem crédito.
    perform set_config('request.jwt.claims', '', true);
    update public.leads set responsavel = 'Aceite Etiquetas Comercial' where id = v_lead;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);

    -- C9 · O SDR põe o próprio nome: não é do Comercial, não é passagem.
    perform set_config('request.jwt.claims', json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Etiquetas SDR' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);

    -- C10 · O SDR dá o lead a um ex-Comercial, inativo: não é passagem.
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Etiquetas Ex-Comercial' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);

    -- C11 · SDR sem nome no perfil passa: conta, e o autor NÃO fica nulo —
    -- autor nulo, neste rastro, é o motor.
    perform set_config('request.jwt.claims', json_build_object('sub', v_sem_nome, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.leads set responsavel = 'Aceite Etiquetas Comercial 2' where id = v_lead;
    reset role;
    c := c || (select count(*)::int from public.leads_eventos
                where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr');
    r := r || (select responsavel from public.leads where id = v_lead);
    select autor into v_autor_sem_nome
      from public.leads_eventos
     where lead_id = v_lead and tipo = 'etiqueta' and detalhe->>'origem' = 'passagem_do_sdr'
       and detalhe->>'sdr_id' = v_sem_nome::text;
    perform set_config('request.jwt.claims', json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);

    -- R1 · O SDR edita as etiquetas no card.
    set local role authenticated;
    v_evento := public.registrar_etiquetas_do_lead(
      v_lead, array['resgate', 'origem-site'], array['resgate', 'quer-comprar']);
    reset role;
    select detalhe, autor into v_card, v_card_autor from public.leads_eventos where id = v_evento;

    -- R2 · O Marketing é staff, mas não move lead: barrado.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_mkt, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_etiquetas_do_lead(v_lead, array[]::text[], array['resgate']);
      reset role;
    exception when insufficient_privilege then
      reset role;
      v_mkt_rpc := 'barrado';
    end;

    -- R3 · O cliente da Garagem (conta de verdade, papel cliente): barrado.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_etiquetas_do_lead(v_lead, array[]::text[], array['resgate']);
      reset role;
    exception when insufficient_privilege then
      reset role;
      v_cli_rpc := 'barrado';
    end;

    -- R4 · Lista gigante, mesmo de quem pode: recusada.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_etiquetas_do_lead(
        v_lead, array[]::text[], array(select 'e' || g from generate_series(1, 101) as g));
      reset role;
    exception when invalid_parameter_value then
      reset role;
      v_grande_rpc := 'recusada';
    end;

    -- R5 · SDR desativado, com o JWT ainda válido: barrado. A RPC é SECURITY
    -- DEFINER, então a RLS não o seguraria — só a guarda.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_sdr_inativo, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_etiquetas_do_lead(v_lead, array[]::text[], array['resgate']);
      reset role;
    exception when insufficient_privilege then
      reset role;
      v_inativo_rpc := 'barrado';
    end;

    -- R6 · Uma etiqueta só, mas com 256 caracteres: recusada.
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_etiquetas_do_lead(v_lead, array[]::text[], array[repeat('a', 256)]);
      reset role;
    exception when invalid_parameter_value then
      reset role;
      v_longa_rpc := 'recusada';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- T1 · Tipo inventado continua recusado.
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
  if v_lead is null or v_sdr is null or cardinality(c) is distinct from 11 then
    raise exception 'ACEITE FALHOU: a sonda não chegou ao fim (% passos) — nada foi provado', cardinality(c);
  end if;

  -- O UPDATE de cada passo aconteceu — sem isto, "sem crédito" pode ser só a
  -- RLS barrando a escrita.
  if r is distinct from array[
       'Aceite Etiquetas Comercial', 'Aceite Etiquetas Comercial', 'Aceite Nome De Ninguem', '<nulo>',
       '  Aceite Etiquetas Comercial 2  ', 'Aceite Etiquetas Comercial', 'Aceite Etiquetas Comercial 2',
       'Aceite Etiquetas Comercial', 'Aceite Etiquetas SDR', 'Aceite Etiquetas Ex-Comercial',
       'Aceite Etiquetas Comercial 2'] then
    falhas := falhas + 1;
    raise warning 'FALHOU: algum UPDATE da sonda não gravou (%)', r;
  end if;

  -- A contagem de crédito, passo a passo: C1, C5, C6 e C11 contam; o resto não.
  if c is distinct from array[1, 1, 1, 1, 2, 3, 3, 3, 3, 3, 4] then
    falhas := falhas + 1;
    raise warning 'FALHOU: crédito do SDR errado. Esperado {1,1,1,1,2,3,3,3,3,3,4} (C1..C11), veio % '
      '— C2 repetir o dono, C3 nome de ninguém, C4 tirar o dono, C5 nome com espaço, '
      'C6 SDR como segundo papel, C7 Comercial, C8 motor, C9 o próprio SDR, '
      'C10 ex-Comercial inativo, C11 SDR sem nome', c;
  end if;
  if v_autor_sem_nome is null or v_autor_sem_nome not like 'SDR %' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o crédito do SDR sem nome saiu com autor "%" — nulo é o motor', v_autor_sem_nome;
  end if;

  if v_autor_sdr is distinct from 'Aceite Etiquetas SDR'
     or v_detalhe_sdr->>'sdr_id' is distinct from v_sdr::text
     or v_detalhe_sdr->'etiquetas' is distinct from '["resgate", "reaquecido"]'::jsonb
     or v_detalhe_sdr->>'responsavel_para' is distinct from 'Aceite Etiquetas Comercial' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o crédito da passagem não saiu como devia (autor "%", detalhe %)',
      v_autor_sdr, v_detalhe_sdr;
  end if;
  if v_card_autor is distinct from 'Aceite Etiquetas SDR'
     or v_card->>'origem' is distinct from 'card'
     or v_card->'incluidas' is distinct from '["quer-comprar"]'::jsonb
     or v_card->'retiradas' is distinct from '["origem-site"]'::jsonb then
    falhas := falhas + 1;
    raise warning 'FALHOU: a edição pelo card não foi gravada como devia (autor "%", detalhe %)',
      v_card_autor, v_card;
  end if;
  if v_mkt_rpc <> 'barrado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o Marketing gravou etiqueta no rastro';
  end if;
  if v_cli_rpc <> 'barrado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o cliente da Garagem gravou etiqueta no rastro';
  end if;
  if v_grande_rpc <> 'recusada' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a RPC aceitou uma lista de 101 etiquetas';
  end if;
  if v_longa_rpc <> 'recusada' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a RPC aceitou uma etiqueta de 256 caracteres';
  end if;
  if v_inativo_rpc <> 'barrado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: SDR desativado gravou etiqueta no rastro';
  end if;
  if v_invalido is distinct from 'recusado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o CHECK aceitou um tipo inventado';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) nas etiquetas do lead', falhas;
  end if;
  raise notice 'Aceite verificado: só a passagem do SDR para o Comercial ativo deixa resgate e reaquecido no rastro, com o id dele; a edição pelo card fica registrada; Marketing e cliente são barrados.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260925180000', 'etiquetas_do_lead')
  on conflict (version) do nothing;
