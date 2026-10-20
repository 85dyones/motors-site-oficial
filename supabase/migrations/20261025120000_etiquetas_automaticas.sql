-- ============================================================================
-- As etiquetas que o sistema põe: a origem do lead e a intenção que o
-- assistente descobre
-- ============================================================================
-- Pedido do dono (2026-10-20): *"os contatos precisam continuar recebendo a
-- identificação de origem com as tags"* — e, na decisão seguinte, que o
-- assistente ponha as de intenção.
--
-- Até aqui quem etiquetava era o Chatwoot (fluxos fora deste repositório:
-- n8n e o Captain), e o Espelho copiava para `atendimentos.tags`. A régua,
-- lida dos dados da produção em 20/10 (só leitura):
--
--   origem-ads-google  ← clique do Google (gclid, gbraid, wbraid)
--   origem-ads-meta    ← clique da Meta (fbclid, fbc) — ou a conversa que
--                        nasceu de anúncio de clique para o WhatsApp
--                        (`origem_conversa`, que o atendimento novo lê)
--   origem-site        ← passou pelo site (ag_uid), sem clique de anúncio
--   origem-organico    ← o resto: o WhatsApp direto
--
-- Com o Chatwoot fora, ninguém mais põe. Esta migração põe NO BANCO, para
-- todo lead que nasce — do site, do WhatsApp, à mão —, pelo mesmo caminho.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
-- 1. `etiqueta_de_origem(lead jsonb)`: a régua acima, pura. Lê o lead como
--    jsonb para não depender de coluna (coluna ausente vira nulo).
-- 2. O gatilho `leads_etiqueta_de_origem`: no INSERT, o lead sem etiqueta de
--    origem ganha a sua; no UPDATE dos sinais (clique, ag_uid, a conversa de
--    anúncio), o "origem-organico" sobe para a origem que se descobriu. A
--    origem posta à mão, ou já de anúncio ou site, nunca é trocada.
-- 3. A carga: o lead ABERTO que ainda não tem etiqueta de origem ganha a sua.
-- 4. `etiquetar_lead_pelo_sistema(lead, incluir, autor)`: só a chave de
--    serviço chama. Acrescenta (nunca tira), sem distinguir caixa, e deixa o
--    evento `etiqueta` no rastro (automático, com o autor — o nome do
--    assistente). É por onde o assistente põe quer-comprar, quer-financiar,
--    quer-avaliar e negociando. A edição do card (`editar_etiquetas_do_lead`)
--    exige sessão de gente, e continua exigindo.
--
-- Aditiva e idempotente: `create or replace`, carga só no lead sem origem.
-- ============================================================================

create or replace function public.etiqueta_de_origem(p_lead jsonb)
  returns text
  language sql
  immutable
  set search_path = public
as $$
  select case
    when coalesce(nullif(btrim(p_lead->>'gclid'), ''), nullif(btrim(p_lead->>'gbraid'), ''), nullif(btrim(p_lead->>'wbraid'), '')) is not null
      then 'origem-ads-google'
    when coalesce(nullif(btrim(p_lead->>'fbclid'), ''), nullif(btrim(p_lead->>'fbc'), '')) is not null
      or jsonb_typeof(p_lead->'origem_conversa') = 'object' and (
           p_lead->'origem_conversa'->>'tipo' = 'ad'
           or p_lead->'origem_conversa'->>'entrada' = 'ctwa_ad'
           or nullif(btrim(p_lead->'origem_conversa'->>'ctwa_clid'), '') is not null
           or nullif(btrim(p_lead->'origem_conversa'->>'anuncio_id'), '') is not null
         )
      then 'origem-ads-meta'
    when nullif(btrim(p_lead->>'ag_uid'), '') is not null
      then 'origem-site'
    else 'origem-organico'
  end
$$;

comment on function public.etiqueta_de_origem(jsonb) is
  'A etiqueta de origem do lead (2026-10-20), a régua que o Chatwoot aplicava: '
  'gclid → origem-ads-google; fbclid/fbc ou anúncio de clique para o WhatsApp → origem-ads-meta; '
  'ag_uid → origem-site; o resto → origem-organico.';

create or replace function public.leads_etiqueta_de_origem()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_lista text[] := coalesce(new.etiquetas, '{}');
  v_nova  text   := public.etiqueta_de_origem(to_jsonb(new));
  v_atual text;
begin
  select e into v_atual from unnest(v_lista) e where lower(e) like 'origem-%' limit 1;
  if v_atual is null then
    if cardinality(v_lista) < 50 then
      new.etiquetas := v_lista || v_nova;
    end if;
  elsif tg_op = 'UPDATE' and lower(v_atual) = 'origem-organico' and v_nova <> 'origem-organico' then
    -- Descobriu-se de onde o lead veio: o "orgânico" era falta de sinal.
    new.etiquetas := array(select case when lower(e) = 'origem-organico' then v_nova else e end from unnest(v_lista) e);
  end if;
  return new;
end $$;

-- `update of` só com as colunas que existem neste banco (o teste local não
-- tem todas): o gatilho é montado com o que há.
do $gatilho$
declare
  v_colunas text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name) into v_colunas
    from information_schema.columns
   where table_schema = 'public' and table_name = 'leads'
     and column_name in ('origem_conversa', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'fbc', 'ag_uid');
  execute format(
    'create or replace trigger leads_etiqueta_de_origem before insert or update of %s on public.leads '
    'for each row execute function public.leads_etiqueta_de_origem()',
    v_colunas
  );
end
$gatilho$;

-- A carga: o lead aberto que ainda não tem origem.
update public.leads l
   set etiquetas = l.etiquetas || public.etiqueta_de_origem(to_jsonb(l))
 where l.desfecho is null
   and cardinality(l.etiquetas) < 50
   and not exists (select 1 from unnest(l.etiquetas) e where lower(e) like 'origem-%');

create or replace function public.etiquetar_lead_pelo_sistema(
  p_lead    uuid,
  p_incluir text[],
  p_autor   text default 'Sistema'
)
  returns text[]
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_incluir text[] := coalesce(p_incluir, '{}');
  v_antes   text[];
  v_depois  text[];
  v_nova    text;
begin
  if cardinality(v_incluir) > 20
     or exists (select 1 from unnest(v_incluir) t where t is null or length(btrim(t)) = 0 or length(t) > 255) then
    raise exception 'Etiquetas fora do formato: até 20 por pedido, cada uma com 1 a 255 caracteres.'
      using errcode = 'check_violation';
  end if;

  select l.etiquetas into v_antes from public.leads l where l.id = p_lead for update;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'no_data_found';
  end if;

  v_depois := v_antes;
  foreach v_nova in array v_incluir loop
    if cardinality(v_depois) < 50
       and not exists (select 1 from unnest(v_depois) d where lower(d) = lower(btrim(v_nova))) then
      v_depois := v_depois || btrim(v_nova);
    end if;
  end loop;

  if v_depois is distinct from v_antes then
    update public.leads set etiquetas = v_depois where id = p_lead;
    insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico, detalhe)
    values (
      p_lead, 'etiqueta',
      nullif(array_to_string(v_antes,  ', '), ''),
      nullif(array_to_string(v_depois, ', '), ''),
      left(coalesce(nullif(btrim(p_autor), ''), 'Sistema'), 120), true,
      jsonb_build_object(
        'origem',    'assistente',
        'antes',     to_jsonb(v_antes),
        'depois',    to_jsonb(v_depois),
        'incluidas', to_jsonb(array(select e from unnest(v_depois) as e where e <> all (v_antes))),
        'retiradas', '[]'::jsonb
      )
    );
  end if;
  return v_depois;
end $$;

comment on function public.etiquetar_lead_pelo_sistema(uuid, text[], text) is
  'As etiquetas que o sistema põe (2026-10-20): acrescenta, sem distinguir caixa, e deixa o '
  'evento etiqueta (automático, origem assistente). Só a chave de serviço chama.';

revoke all on function public.etiquetar_lead_pelo_sistema(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.etiquetar_lead_pelo_sistema(uuid, text[], text) to service_role;

-- ===========================================================================
-- Aceite — a régua contra o banco de verdade
-- ===========================================================================
do $aceite$
declare
  falhas   int := 0;
  v_falhou text[] := '{}';
  v_etapa  text;
  v_id     uuid;
  v_lista  text[];
  v_n      int;
  v_tem_ag boolean := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'ag_uid'
  );
  v_tem_origem boolean := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'leads' and column_name = 'origem_conversa'
  );
begin
  -- A régua, pura.
  if public.etiqueta_de_origem('{"gclid": "abc", "fbclid": "x", "ag_uid": "u"}') <> 'origem-ads-google'
     or public.etiqueta_de_origem('{"fbc": "fb.1.2", "ag_uid": "u"}') <> 'origem-ads-meta'
     or public.etiqueta_de_origem('{"origem_conversa": {"tipo": "ad", "anuncio_id": "123"}}') <> 'origem-ads-meta'
     or public.etiqueta_de_origem('{"origem_conversa": {"entrada": "click_to_chat_link"}}') <> 'origem-organico'
     or public.etiqueta_de_origem('{"ag_uid": "u", "gclid": "  "}') <> 'origem-site'
     or public.etiqueta_de_origem('{}') <> 'origem-organico' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a régua de etiqueta_de_origem';
  end if;

  if has_function_privilege('authenticated', 'public.etiquetar_lead_pelo_sistema(uuid, text[], text)', 'execute')
     or has_function_privilege('anon', 'public.etiquetar_lead_pelo_sistema(uuid, text[], text)', 'execute') then
    falhas := falhas + 1;
    raise warning 'FALHOU: sessão de usuário executa etiquetar_lead_pelo_sistema';
  end if;

  begin
    select chave into v_etapa from public.funil_etapas where tipo = 'aberta' and ativa order by ordem limit 1;
    v_etapa := coalesce(v_etapa, 'novo');

    -- O WhatsApp direto nasce orgânico.
    insert into public.leads (nome, telefone, situacao) values ('Aceite Origem', '5541900006001', v_etapa)
      returning id, etiquetas into v_id, v_lista;
    if v_lista is distinct from array['origem-organico'] then
      v_falhou := v_falhou || format('o WhatsApp direto nasceu com %s', v_lista);
    end if;

    -- O clique do Google, e o da Meta, pelo site.
    insert into public.leads (nome, telefone, situacao, gclid) values ('Aceite Origem', '5541900006002', v_etapa, 'g-1')
      returning etiquetas into v_lista;
    if v_lista is distinct from array['origem-ads-google'] then
      v_falhou := v_falhou || format('o clique do Google nasceu com %s', v_lista);
    end if;
    insert into public.leads (nome, telefone, situacao, fbclid, etiquetas) values ('Aceite Origem', '5541900006003', v_etapa, 'f-1', array['quer-comprar'])
      returning etiquetas into v_lista;
    if v_lista is distinct from array['quer-comprar', 'origem-ads-meta'] then
      v_falhou := v_falhou || format('o clique da Meta nasceu com %s', v_lista);
    end if;

    -- A origem posta à mão fica.
    insert into public.leads (nome, telefone, situacao, gclid, etiquetas) values ('Aceite Origem', '5541900006004', v_etapa, 'g-2', array['Origem-Site'])
      returning etiquetas into v_lista;
    if v_lista is distinct from array['Origem-Site'] then
      v_falhou := v_falhou || format('a origem posta à mão virou %s', v_lista);
    end if;

    -- O site, sem clique de anúncio.
    if v_tem_ag then
      execute 'insert into public.leads (nome, telefone, situacao, ag_uid) values ($1, $2, $3, $4) returning etiquetas'
        into v_lista using 'Aceite Origem', '5541900006005', v_etapa, 'aceite-ag-1';
      if v_lista is distinct from array['origem-site'] then
        v_falhou := v_falhou || format('o site nasceu com %s', v_lista);
      end if;
    end if;

    -- A conversa que se descobre de anúncio: o orgânico sobe; o Google não desce.
    if v_tem_origem then
      execute 'update public.leads set origem_conversa = $1 where id = $2 returning etiquetas'
        into v_lista using '{"tipo": "ad", "ctwa_clid": "c-1"}'::jsonb, v_id;
      if v_lista is distinct from array['origem-ads-meta'] then
        v_falhou := v_falhou || format('o orgânico de anúncio ficou %s', v_lista);
      end if;
    end if;
    update public.leads set fbclid = 'f-2' where telefone = '5541900006002' returning etiquetas into v_lista;
    if v_lista is distinct from array['origem-ads-google'] then
      v_falhou := v_falhou || format('o Google desceu para %s', v_lista);
    end if;

    -- O sistema acrescenta, sem repetir nem distinguir caixa, com um evento.
    v_lista := public.etiquetar_lead_pelo_sistema(v_id, array['quer-comprar', 'QUER-COMPRAR', 'quer-financiar'], 'Ney');
    if v_lista is distinct from array['origem-ads-meta', 'quer-comprar', 'quer-financiar'] and v_tem_origem then
      v_falhou := v_falhou || format('o sistema deixou %s', v_lista);
    end if;
    v_lista := public.etiquetar_lead_pelo_sistema(v_id, array['Quer-Comprar'], 'Ney');
    select count(*) into v_n from public.leads_eventos
     where lead_id = v_id and tipo = 'etiqueta' and automatico and autor = 'Ney' and detalhe->>'origem' = 'assistente';
    if v_n <> 1 then
      v_falhou := v_falhou || format('o sistema deixou %s evento(s), e não 1', v_n);
    end if;

    raise exception 'SENTINELA_DO_ACEITE';
  exception
    when others then
      if sqlerrm <> 'SENTINELA_DO_ACEITE' then
        v_falhou := v_falhou || format('o bloco de efeito estourou: %s', sqlerrm);
      end if;
  end;

  if array_length(v_falhou, 1) > 0 then
    falhas := falhas + array_length(v_falhou, 1);
    for i in 1..array_length(v_falhou, 1) loop
      raise warning 'FALHOU: %', v_falhou[i];
    end loop;
  end if;

  if exists (select 1 from public.leads where nome = 'Aceite Origem') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o aceite deixou linha para trás';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % verificação(ões) das etiquetas automáticas', falhas;
  end if;
  raise notice 'Aceite verificado: todo lead nasce com a etiqueta de origem (Google, Meta, site ou orgânico), '
               'o orgânico sobe quando se descobre o anúncio, a origem posta à mão fica, e o sistema acrescenta '
               'etiqueta com um evento no rastro — só pela chave de serviço.';
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261025120000', 'etiquetas_automaticas')
  on conflict (version) do nothing;
