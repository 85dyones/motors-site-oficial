-- ---------------------------------------------------------------------------
-- O rodízio passa a escolher SÓ quem tem `comercial` em `papeis` (2026-09-23)
-- ---------------------------------------------------------------------------
-- Medido em 23/09: o candidato a novo dono era
-- `papeis && array['comercial','admin']`, e por isso o Igor (admin +
-- marketing) recebia lead transferido. Um lead do print do dono estava na 8ª
-- transferência, rodando entre três pessoas, uma delas fora do comercial.
-- Ordem do dono: *"nenhum destes que não sejam comercial, na atividade
-- principal ou secundária, podem estar no fluxo"*.
--
-- A régua é a mesma de `recebeLead` (`src/lib/permissoes.ts`), que a lista de
-- responsáveis do card e o PATCH de `/api/leads/gerenciar` usam. O SDR
-- (migração anterior) é equipe e não recebe lead.
--
-- O corpo abaixo é o de `20260916150000`, conferido contra o `prosrc` da
-- produção antes de reescrever (IGUAL, 23/09). A ÚNICA linha que muda é o
-- filtro do candidato no lateral `prox`, e uma frase no comentário da função.
-- O telefone continua exigido: é por ele que o novo dono é avisado, e não
-- existe transferência silenciosa.
--
-- Um lead que JÁ está com alguém de fora do comercial não é tocado aqui: se
-- estagnar, o rodízio o transfere para o comercial, como qualquer outro.

create or replace function public.montar_fila_do_funil(
  p_agora    timestamptz default now(),
  p_reservar boolean     default false
)
returns table (
  lead_id              uuid,
  nome                 text,
  telefone             text,
  interesse            text,
  canal                text,
  situacao             text,
  etapa                text,
  minutos_parado       int,
  aviso                text,
  responsavel          text,
  responsavel_whatsapp text,
  novo_responsavel     text,
  novo_whatsapp        text,
  suprimido_por        text
)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
declare
  v_local   timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_relogio text;
begin
  if extract(dow from v_local) = 0 then
    v_relogio := 'fora_do_horario';
  elsif extract(hour from v_local) < 8 or extract(hour from v_local) >= 20 then
    v_relogio := 'fora_do_horario';
  end if;

  return query
  with base as (
    select
      l.id,
      l.nome,
      l.telefone,
      l.interesse,
      l.canal,
      l.situacao,
      e.rotulo                                     as etapa,
      e.estagnacao_minutos,
      e.transferencia_minutos,
      e.protegida,
      -- `nullif(trim(...), '')`: `responsavel` é texto livre e uma gravação
      -- antiga pode ter deixado string vazia. Sem isto, `l.responsavel is
      -- null` daria falso para um lead que, na prática, não tem dono — e ele
      -- ficaria fora da atribuição automática para sempre, sem erro nenhum.
      nullif(trim(l.responsavel), '')       as responsavel,
      l.transferencias,
      l.alertado_em,
      -- 2026-09-05: a entrega do assistente ao humano é mais um marco do
      -- relógio. Nulo não muda nada — `greatest` ignora nulo.
      greatest(l.ultimo_movimento_em, l.ultimo_contato_em, atd.humano_assumiu_em) as parado_desde
    from public.leads l
    join public.funil_etapas e on e.chave = l.situacao
    -- O atendimento mais recente deste lead, quando existe. O `limit 1`
    -- também protege a contagem: sem ele, um lead com três conversas viraria
    -- três linhas na fila e três mensagens no WhatsApp do vendedor.
    left join lateral (
      select a.humano_assumiu_em, a.com_assistente
        from public.atendimentos a
       where a.lead_id = l.id
       order by coalesce(a.iniciado_em, a.created_at) desc, a.created_at desc, a.id desc
       limit 1
    ) atd on true
    where l.desfecho is null
      and e.tipo = 'aberta'
      -- Enquanto o assistente está no circuito, nenhuma métrica de controle
      -- conta. Sem atendimento, `com_assistente` vem nulo e o coalesce mantém
      -- o lead na fila — o comportamento de sempre.
      and not coalesce(atd.com_assistente, false)
  ),
  medido as (
    select b.*,
           floor(extract(epoch from (p_agora - b.parado_desde)) / 60)::int as minutos
      from base b
  ),
  classificado as (
    select
      m.*,
      -- O dono atual, com o número dele. LEFT JOIN por nome porque
      -- `leads.responsavel` é TEXTO e não FK (migração 20260807210000): o
      -- consultor que saiu da empresa continua legível no histórico, e o
      -- LEFT devolve NULL em vez de sumir com o lead.
      dono.telefone as responsavel_whatsapp,
      prox.nome     as novo_responsavel,
      prox.telefone as novo_whatsapp,
      case
        when m.responsavel is null
             and m.estagnacao_minutos is not null
             and m.minutos >= m.estagnacao_minutos            then 'atribuicao'
        when m.transferencia_minutos is not null
             and not m.protegida
             and m.minutos >= m.transferencia_minutos          then 'transferencia'
        when m.estagnacao_minutos is not null
             and m.minutos >= m.estagnacao_minutos             then 'estagnacao'
      end as aviso
    from medido m
    left join lateral (
      select nullif(trim(p.telefone_e164), '') as telefone
        from public.profiles p
       where m.responsavel is not null
         and trim(coalesce(p.full_name, '')) = trim(m.responsavel)
         and p.is_active
       limit 1
    ) dono on true
    left join lateral (
      select trim(p.full_name) as nome, trim(p.telefone_e164) as telefone
        from public.profiles p
       where p.is_active
         -- Só o Comercial (2026-09-23). Era `&& array['comercial','admin']`,
         -- e o admin sem comercial recebia lead transferido.
         and 'comercial' = any(p.papeis)
         and coalesce(trim(p.full_name), '')    <> ''
         and coalesce(trim(p.telefone_e164), '') <> ''
         and (m.responsavel is null
              or trim(p.full_name) is distinct from trim(m.responsavel))
       order by (
         select count(*) from public.leads x
          where trim(coalesce(x.responsavel, '')) = trim(p.full_name)
            and x.desfecho is null
       ) asc, trim(p.full_name) asc
       limit 1
    ) prox on true
  ),
  fila as (
    select
      c.*,
      case
        when v_relogio is not null then v_relogio
        when c.aviso in ('atribuicao', 'transferencia') and c.novo_responsavel is null
          then 'sem_vendedor_disponivel'
        when c.aviso = 'estagnacao' and c.responsavel_whatsapp is null
          then 'vendedor_sem_whatsapp'
        when c.aviso = 'estagnacao'
             and c.alertado_em is not null
             and c.alertado_em > p_agora - interval '20 hours'
          then 'alerta_recente'
      end as suprimido_por
    from classificado c
    where c.aviso is not null
  ),
  -- ---- a reserva: acontece no MESMO comando que monta a fila ----
  -- Duas execuções sobrepostas do workflow mandariam a mesma mensagem duas
  -- vezes se a gravação viesse depois. E a transferência só existe aqui
  -- dentro: trocar o dono de um lead sem que ninguém seja avisado seria a
  -- pior versão desta funcionalidade.
  cutucados as (
    update public.leads l
       set alertado_em = p_agora,
           alertas     = l.alertas + 1
      from fila f
     where p_reservar
       and f.suprimido_por is null
       and f.aviso = 'estagnacao'
       and l.id = f.id
    returning l.id
  ),
  transferidos as (
    update public.leads l
       set responsavel   = f.novo_responsavel,
           alertado_em   = p_agora,
           alertas       = l.alertas + 1,
           transferencias = l.transferencias
                            + case when f.aviso = 'transferencia' then 1 else 0 end
      from fila f
     where p_reservar
       and f.suprimido_por is null
       and f.aviso in ('atribuicao', 'transferencia')
       and l.id = f.id
    returning l.id
  ),
  rastro as (
    insert into public.leads_eventos (lead_id, tipo, de, para, automatico, detalhe)
    select f.id, 'alerta', f.responsavel,
           coalesce(f.novo_responsavel, f.responsavel), true,
           jsonb_build_object('aviso', f.aviso,
                              'minutos_parado', f.minutos,
                              'etapa', f.situacao)
      from fila f
     where p_reservar and f.suprimido_por is null
    returning id
  )
  select
    f.id, f.nome, f.telefone, f.interesse, f.canal, f.situacao, f.etapa,
    f.minutos, f.aviso, f.responsavel, f.responsavel_whatsapp,
    f.novo_responsavel, f.novo_whatsapp, f.suprimido_por
  from fila f
  order by
    case f.aviso when 'atribuicao' then 1 when 'transferencia' then 2 else 3 end,
    f.minutos desc;
end $$;

comment on function public.montar_fila_do_funil(timestamptz, boolean) is
  'A fila de avisos do funil (2026-08-28): lead parado, lead sem dono e lead '
  'a transferir, com o WhatsApp de quem precisa saber. `p_reservar = true` '
  'grava o aviso E aplica a transferência no mesmo comando — transferir sem '
  'avisar seria trocar o dono de um lead às escondidas. Devolve também o que '
  'foi suprimido, com o motivo. Desde 2026-09-05 o relógio só corre depois que '
  'o assistente sai do circuito: o lead cujo atendimento mais recente está '
  '`com_assistente` fica fora da fila, e `humano_assumiu_em` reinicia a '
  'contagem. Desde 2026-09-23 só quem tem comercial em papeis é candidato a '
  'novo dono — admin não entra por ser admin, e o SDR não recebe lead.';

-- `create or replace` preserva os privilégios, mas repetir a régua é barato e
-- deixa o arquivo autoexplicativo: a fila carrega nome e telefone de cliente,
-- e quem a chama é o n8n com a chave de serviço.
revoke all on function public.montar_fila_do_funil(timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.montar_fila_do_funil(timestamptz, boolean)
  to service_role;


-- ===========================================================================
-- Aceite — prova a régua contra o banco de verdade
-- ===========================================================================
-- Por que ele é determinístico: o `prox` escolhe o candidato com MENOS leads
-- abertos e, no empate, o primeiro por nome. Os perfis de teste têm zero
-- leads e nomes que começam com "Aaaa"/"Aaab", então ganham de todo perfil
-- real. Com a régua antiga, o escolhido seria "Aaaa Aceite AdminMkt"; com a
-- nova, tem de ser "Aaab Aceite Comercial". O lead de teste (sem dono, parado
-- além do prazo de alerta numa etapa aberta) garante que existe uma linha
-- `atribuicao` para olhar — sem ele a fila podia estar vazia e o aceite
-- passaria sem provar nada.
--
-- Os prazos saem de `funil_etapas` (o dono edita pelo painel), como no aceite
-- de `20260916150000`. Tudo que o aceite cria ele apaga.
do $$
declare
  falhas  int := 0;
  v_adm   uuid;
  v_sdr   uuid;
  v_com   uuid;
  v_lead  uuid;
  v_etapa text;
  v_alerta int;
  v_novo  text;
  v_p     timestamptz := now();
begin
  select chave, estagnacao_minutos into v_etapa, v_alerta
    from public.funil_etapas
   where tipo = 'aberta' and ativa and estagnacao_minutos is not null
   order by ordem
   limit 1;

  if v_etapa is null then
    raise exception 'ACEITE FALHOU: nenhuma etapa aberta com prazo de alerta — a régua do rodízio não pôde ser exercida';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'aceite-rodizio-adm@exemplo.invalido', now(), now())
  returning id into v_adm;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'aceite-rodizio-sdr@exemplo.invalido', now(), now())
  returning id into v_sdr;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'aceite-rodizio-com@exemplo.invalido', now(), now())
  returning id into v_com;

  update public.profiles
     set full_name = 'Aaaa Aceite AdminMkt', papeis = array['admin', 'marketing'],
         role = 'admin', is_active = true, telefone_e164 = '+5541999990901'
   where id = v_adm;
  update public.profiles
     set full_name = 'Aaaa Aceite SDR', papeis = array['sdr'],
         role = 'sdr', is_active = true, telefone_e164 = '+5541999990902'
   where id = v_sdr;
  update public.profiles
     set full_name = 'Aaab Aceite Comercial', papeis = array['comercial'],
         role = 'comercial', is_active = true, telefone_e164 = '+5541999990903'
   where id = v_com;

  if (select count(*) from public.profiles where id in (v_adm, v_sdr, v_com)) <> 3 then
    raise exception 'ACEITE FALHOU: os perfis de teste não nasceram — o trigger de auth.users não criou profiles';
  end if;

  insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em)
    values ('Aceite Rodizio Comercial', '5541900000923', v_etapa, null,
            v_p - make_interval(mins => v_alerta + 30))
    returning id into v_lead;

  -- Sem filtro de `suprimido_por`: fora do horário a linha vem suprimida, mas
  -- o candidato já foi escolhido — é a régua que está sendo medida, não o
  -- relógio.
  select novo_responsavel into v_novo
    from public.montar_fila_do_funil(v_p, false)
   where lead_id = v_lead and aviso = 'atribuicao';

  if v_novo is distinct from 'Aaab Aceite Comercial' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o rodízio escolheu "%" — esperado o comercial de teste',
      coalesce(v_novo, '(ninguém)');
  end if;

  delete from public.leads where id = v_lead;
  delete from auth.users where id in (v_adm, v_sdr, v_com);

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na régua do rodízio', falhas;
  end if;
  raise notice 'Aceite verificado: o rodízio pulou admin+marketing e SDR e escolheu o comercial (etapa de teste: %).', v_etapa;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260923130100', 'rodizio_so_comercial')
  on conflict (version) do nothing;
