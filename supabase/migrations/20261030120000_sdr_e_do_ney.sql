-- ============================================================================
-- O fluxo de SDR é do Ney (2026-10-23)
-- ============================================================================
-- Ordem do dono: *"todo o fluxo de SDR deve ser direcionado ao Ney, não envie
-- mais ao SDR, essa função é exclusiva do Ney e suas cadências"*. Nas
-- perguntas, ele escolheu:
--   - o lead sem dono no RESGATE (etiqueta `resgate`) vai para o Ney: a rodada
--     do atendimento o puxa para a cadência e para "Reaquecendo" (código,
--     `puxarOResgate`). Até aqui ele ficava reservado ao SDR, sem aviso
--     nenhum (20261010160000, regra de 14/10);
--   - quem tem o papel SDR NUNCA recebe lead, nem sendo também do Comercial;
--   - o SDR só consulta: vê e anota, mas não passa o lead a ninguém. O crédito
--     de resgate (as etiquetas "resgate" e "reaquecido") passa a medir o Ney,
--     que as põe quando entrega um lead que ele reaqueceu (código).
--
-- O que muda no banco:
--   1. `montar_fila_do_funil`: o corpo de 20261010160000 com duas trocas — a
--      reserva do resgate deixa de ser do SDR e passa a valer só para o lead
--      que o Ney pode puxar (o resto avisa o administrador como lead novo), e
--      o candidato a novo dono (transferência) nunca tem `sdr` em `papeis`;
--   2. `recebe_lead_pelo_nome` (a régua do `with check` da RLS de `leads`):
--      nome de quem tem `sdr` não recebe lead;
--   3. `sessao_passa_lead()` e a RLS de UPDATE de `leads`: no escopo
--      "designados", trocar o dono exige não ser SDR (ou ser também Gestor).
--      O SDR continua anotando no lead; a rota já recusava (`podePassarOLead`).
--
-- O gatilho do crédito do SDR (`trg_leads_credito_do_resgate`, 20260925180000)
-- fica como está: só disparava quando uma sessão de SDR passava o lead, e
-- agora a RLS não deixa. O histórico dele segue no rastro.
--
-- Idempotente: `create or replace` e `alter policy`. Nenhuma coluna, nenhum
-- dado reescrito.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A fila do funil
-- ---------------------------------------------------------------------------
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
      l.responsavel_desde,
      -- 2026-09-05: a entrega do assistente ao humano é mais um marco do
      -- relógio. Nulo não muda nada — `greatest` ignora nulo.
      greatest(l.ultimo_movimento_em, l.ultimo_contato_em, atd.humano_assumiu_em) as parado_desde,
      -- 2026-10-23: o resgate é do Ney (*"todo o fluxo de SDR deve ser
      -- direcionado ao Ney, não envie mais ao SDR"*). O lead com a etiqueta
      -- `resgate` (no lead, a fonte desde 20261023120000, que a trouxe das
      -- conversas) que o Ney PODE puxar para a cadência fica fora do aviso de
      -- lead novo: a
      -- rodada do atendimento o pega. A régua espelha a de `puxarOResgate`
      -- (`lib/atendimento-servidor.ts`): nunca com o assistente, sem opt-out,
      -- telefone que o WhatsApp aceita, o cliente já escreveu para a loja,
      -- etapa até "Recontato" (ou já em "Reaquecendo"), fora do repasse e o
      -- assistente ligado. O que o Ney não pode pegar volta a avisar o
      -- administrador, como qualquer lead sem dono.
      (    'resgate' = any(coalesce(l.etiquetas, '{}'::text[]))
       and l.assistente_fase is null
       and l.optout_em is null
       and length(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g')) between 12 and 13
       and l.situacao in ('novo', 'em_contato', 'proposta', 'reaquecendo')
       and not coalesce(l.canal like 'repasse%', false)
       and exists (select 1 from public.atendimento_mensagens am
                    where am.lead_id = l.id and am.direcao = 'entrada')
       and exists (select 1 from public.atendimento_config ac
                    where ac.org_id = public.org_padrao() and ac.ativo)
      )                                            as na_fila_do_ney
    from public.leads l
    join public.funil_etapas e on e.chave = l.situacao
    -- O atendimento mais recente deste lead, quando existe. O `limit 1`
    -- também protege a contagem: sem ele, um lead com três conversas viraria
    -- três linhas na fila e três mensagens no WhatsApp do vendedor.
    left join lateral (
      select a.humano_assumiu_em, a.com_assistente, a.tags
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
      -- Lead sem dono não tem "próximo dono": quem decide é o administrador.
      case when m.responsavel is null then null else prox.nome end     as novo_responsavel,
      case when m.responsavel is null then null else prox.telefone end as novo_whatsapp,
      case
        -- 2026-10-10, decisão do dono: *"avise o administrador quando entrar
        -- lead novo, Dyones. ele vai determinar o dono e depois começa a
        -- dança"*. O lead sem dono deixa de ser distribuído pelo rodízio (era
        -- a `atribuicao`, depois do prazo de estagnação da etapa) e vira um
        -- aviso, já na primeira rodada: quem recebe é decidido no site.
        when m.responsavel is null and not m.na_fila_do_ney             then 'lead_novo'
        -- 2026-10-23: o lead sem dono do RESGATE que o Ney pode puxar espera
        -- a rodada do atendimento, que o leva para a cadência e para
        -- "Reaquecendo" (até 23/10 ele era do SDR, desde 14/10). Nenhum aviso.
        when m.responsavel is null                                       then null
        when m.transferencia_minutos is not null
             and not m.protegida
             and m.minutos >= m.transferencia_minutos
             -- 2026-10-10: o dono atual também tem o prazo inteiro. Sem isto,
             -- o lead transferido seguia "parado" (a transferência não é
             -- contato) e voltava a ser transferido na rodada seguinte — de
             -- hora em hora, entre os vendedores. Antes do prazo, cai na
             -- estagnação abaixo, que a marca da transferência segura 20 h.
             and (m.responsavel_desde is null
                  or m.responsavel_desde
                     <= p_agora - make_interval(mins => m.transferencia_minutos)) then 'transferencia'
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
         -- e o admin sem comercial recebia lead transferido. E nunca quem
         -- tem o papel SDR, nem sendo também do Comercial (2026-10-23).
         and 'comercial' = any(p.papeis)
         and not ('sdr' = any(p.papeis))
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
        when c.aviso = 'transferencia' and c.novo_responsavel is null
          then 'sem_vendedor_disponivel'
        when c.aviso = 'estagnacao' and c.responsavel_whatsapp is null
          then 'vendedor_sem_whatsapp'
        -- O lead novo também: avisado, só volta a avisar 20 h depois, se
        -- continuar sem dono.
        when c.aviso in ('estagnacao', 'lead_novo')
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
       and f.aviso in ('estagnacao', 'lead_novo')
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
       and f.aviso = 'transferencia'
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
    case f.aviso when 'lead_novo' then 1 when 'transferencia' then 2 else 3 end,
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
  'novo dono — admin não entra por ser admin, e o SDR não recebe lead. Desde '
  '2026-10-10 o lead só é transferido de novo depois que o dono atual teve o '
  'mesmo prazo de transferência (`responsavel_desde`): acabou o vaivém de hora '
  'em hora entre vendedores. Desde a mesma data o lead sem dono não é '
  'distribuído pelo rodízio: vira o aviso `lead_novo`, entregue pelo site ao '
  'administrador que distribui e ao gestor, com lembrete a cada 20 h enquanto '
  'continuar sem dono. Desde 2026-10-23 o resgate é do Ney: o lead sem dono '
  'com a etiqueta `resgate` que o assistente pode puxar fica fora do aviso '
  'até a rodada do atendimento o levar para a cadência (o resto avisa o '
  'administrador), e quem tem o papel SDR nunca é candidato a novo dono, nem '
  'sendo também do Comercial.';

revoke all on function public.montar_fila_do_funil(timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.montar_fila_do_funil(timestamptz, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Quem pode receber um lead (a RLS de `leads`)
-- ---------------------------------------------------------------------------
create or replace function public.recebe_lead_pelo_nome(p_nome text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $fn$
  -- Só responde a quem tem escopo: não vira consulta de "quem trabalha na
  -- loja" na mão de um cliente da Garagem.
  select public.escopo_de_leads() <> 'nenhum'
     and nullif(btrim(p_nome), '') is not null
     and exists (
       select 1 from public.profiles c
        where c.is_active = true
          and 'comercial' = any (c.papeis)
          and not ('sdr' = any (c.papeis))
          and nullif(btrim(c.full_name), '') = btrim(p_nome)
     );
$fn$;

comment on function public.recebe_lead_pelo_nome(text) is
  'O nome é de alguém do Comercial ativo que não tem o papel SDR? A régua de '
  'recebeLead (src/lib/permissoes.ts) e do rodízio, para o with check da RLS '
  'de leads: é a quem um lead pode ser passado. O SDR saiu em 2026-10-23.';

-- ---------------------------------------------------------------------------
-- 3. O SDR não passa o lead
-- ---------------------------------------------------------------------------
create or replace function public.sessao_passa_lead()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $fn$
  select coalesce((
    select 'admin' = any (p.papeis)
        or 'gestor' = any (p.papeis)
        or not ('sdr' = any (p.papeis))
      from public.profiles p
     where p.id = auth.uid()
       and p.is_active = true
  ), false);
$fn$;

comment on function public.sessao_passa_lead() is
  'A sessão pode trocar o dono de um lead? Não para quem tem o papel SDR, '
  'salvo se também for Administrador ou Gestor (2026-10-23: o SDR só '
  'consulta). Espelha podePassarOLead de src/lib/escopoDeLeads.ts.';

revoke all on function public.sessao_passa_lead() from public, anon;
grant execute on function public.sessao_passa_lead() to authenticated, service_role;

alter policy leads_atualizacao_por_escopo on public.leads
  using (
    coalesce(
      case (select public.escopo_de_leads())
        when 'todos'      then true
        when 'designados' then btrim(coalesce(responsavel, '')) <> ''
        when 'meus'       then btrim(responsavel) = (select public.meu_nome_de_responsavel())
        else false
      end,
      false)
  )
  with check (
    coalesce(
      case (select public.escopo_de_leads())
        when 'todos'      then true
        -- Com responsável; e, trocado neste comando (o gatilho carimbou
        -- `responsavel_desde` com o `now()` da transação), o novo é do
        -- Comercial ativo sem SDR, e quem troca não é SDR (2026-10-23). O
        -- nome antigo de quem saiu da loja pode FICAR.
        when 'designados' then
              btrim(coalesce(responsavel, '')) <> ''
          and (responsavel_desde is distinct from now()
               or (public.recebe_lead_pelo_nome(responsavel)
                   and (select public.sessao_passa_lead())))
        -- Continua dele, ou foi passado a alguém do Comercial ativo.
        when 'meus'       then
              btrim(responsavel) = (select public.meu_nome_de_responsavel())
           or public.recebe_lead_pelo_nome(responsavel)
        else false
      end,
      false)
  );

-- ===========================================================================
-- Aceite — prova as réguas contra o banco de verdade
-- ===========================================================================
-- Relógio numa quarta-feira ao meio-dia de São Paulo (o horário não suprime a
-- linha). Perfis de teste com nomes "Aaaa"/"Aaab", zero leads: ganham de todo
-- perfil real no desempate do `prox`.
--   - transferência/estagnação: o candidato a novo dono é o comercial, e não
--     o comercial que também é SDR (que viria antes pelo nome);
--   - o lead sem dono do resgate SEM conversa do cliente avisa como lead novo
--     (o Ney não o pode puxar); com a conversa, fica fora do aviso se o
--     assistente está ligado, e avisa se está desligado; depois que o Ney já
--     o teve (`assistente_fase`), avisa;
--   - `recebe_lead_pelo_nome` e `sessao_passa_lead` dizem não ao SDR, e a RLS
--     deixa o SDR anotar no lead com dono, mas não trocar o dono.
-- Tudo que o aceite cria ele apaga.
do $aceite$
declare
  falhas   int := 0;
  v_duplo  uuid;
  v_sdr    uuid;
  v_com    uuid;
  v_dono   uuid;
  v_lead   uuid;
  v_novo   uuid;
  v_etapa  text;
  v_alerta int;
  v_ativo  boolean;
  v_n      int;
  v_p      timestamptz := date_trunc('week', now()) + interval '2 days 15 hours';
  r        record;
begin
  select chave, estagnacao_minutos into v_etapa, v_alerta
    from public.funil_etapas
   where tipo = 'aberta' and ativa and estagnacao_minutos is not null
     and chave in ('novo', 'em_contato', 'proposta')
   order by ordem
   limit 1;
  if v_etapa is null then
    raise exception 'ACEITE FALHOU: nenhuma etapa aberta da base com prazo de alerta — as réguas não puderam ser exercidas';
  end if;
  select coalesce(bool_or(ativo), false) into v_ativo
    from public.atendimento_config where org_id = public.org_padrao();

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'aceite-sdr-do-ney-duplo@exemplo.invalido', now(), now())
  returning id into v_duplo;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'aceite-sdr-do-ney-sdr@exemplo.invalido', now(), now())
  returning id into v_sdr;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'aceite-sdr-do-ney-com@exemplo.invalido', now(), now())
  returning id into v_com;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'aceite-sdr-do-ney-dono@exemplo.invalido', now(), now())
  returning id into v_dono;

  update public.profiles set full_name = 'Aaaa Aceite Comercial e SDR', papeis = array['comercial', 'sdr'],
         role = 'comercial', is_active = true, telefone_e164 = '+5541999991031' where id = v_duplo;
  update public.profiles set full_name = 'Aaaa Aceite SDR', papeis = array['sdr'],
         role = 'sdr', is_active = true, telefone_e164 = '+5541999991032' where id = v_sdr;
  update public.profiles set full_name = 'Aaab Aceite Comercial', papeis = array['comercial'],
         role = 'comercial', is_active = true, telefone_e164 = '+5541999991033' where id = v_com;
  update public.profiles set full_name = 'Zzzz Aceite Dono', papeis = array['comercial'],
         role = 'comercial', is_active = true, telefone_e164 = '+5541999991034' where id = v_dono;
  if (select count(*) from public.profiles where id in (v_duplo, v_sdr, v_com, v_dono)) <> 4 then
    raise exception 'ACEITE FALHOU: os perfis de teste não nasceram — o trigger de auth.users não criou profiles';
  end if;

  -- (a) O candidato a novo dono não tem SDR.
  insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em)
    values ('Aceite SDR do Ney Parado', '5541900001031', v_etapa, 'Zzzz Aceite Dono',
            v_p - make_interval(mins => v_alerta + 30))
    returning id into v_lead;
  select * into r from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
  if r.novo_responsavel is distinct from 'Aaab Aceite Comercial' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o candidato a novo dono foi "%" — esperado o comercial sem SDR', coalesce(r.novo_responsavel, '(ninguém)');
  end if;

  -- (b) O lead sem dono do resgate.
  insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em, etiquetas)
    values ('Aceite SDR do Ney Resgate', '5541900001032', v_etapa, null, v_p - interval '5 minutes', array['resgate'])
    returning id into v_novo;
  select * into r from public.montar_fila_do_funil(v_p, false) where lead_id = v_novo;
  if r.aviso is distinct from 'lead_novo' then
    falhas := falhas + 1;
    raise warning 'FALHOU: resgate sem conversa do cliente (o Ney não pode puxar) não avisou como lead novo (aviso: %)', coalesce(r.aviso, '(nenhum)');
  end if;

  insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, texto, situacao)
    values (v_novo, '5541900001032', 'entrada', 'cliente', 'oi', 'recebida');
  -- Os dois lados do assistente, cada um num subbloco que se desfaz: a
  -- configuração da loja termina como estava.
  begin
    update public.atendimento_config set ativo = true where org_id = public.org_padrao();
    select * into r from public.montar_fila_do_funil(v_p, false) where lead_id = v_novo;
    if r.lead_id is not null then
      falhas := falhas + 1;
      raise warning 'FALHOU: resgate que o Ney pode puxar, com o assistente ligado, entrou na fila (aviso: %)', r.aviso;
    end if;
    raise exception using errcode = 'ZZ301', message = 'desfaz o assistente ligado';
  exception when sqlstate 'ZZ301' then null;
  end;
  begin
    update public.atendimento_config set ativo = false where org_id = public.org_padrao();
    select * into r from public.montar_fila_do_funil(v_p, false) where lead_id = v_novo;
    if r.aviso is distinct from 'lead_novo' then
      falhas := falhas + 1;
      raise warning 'FALHOU: resgate com o assistente desligado não avisou como lead novo (aviso: %)', coalesce(r.aviso, '(nenhum)');
    end if;
    raise exception using errcode = 'ZZ302', message = 'desfaz o assistente desligado';
  exception when sqlstate 'ZZ302' then null;
  end;
  if (select coalesce(bool_or(ativo), false) from public.atendimento_config where org_id = public.org_padrao()) is distinct from v_ativo then
    raise exception 'ACEITE FALHOU: a configuração do assistente não voltou ao que era';
  end if;

  update public.leads set assistente_fase = 'pausado' where id = v_novo;
  select * into r from public.montar_fila_do_funil(v_p, false) where lead_id = v_novo;
  if r.aviso is distinct from 'lead_novo' then
    falhas := falhas + 1;
    raise warning 'FALHOU: resgate que o Ney já teve não voltou a avisar como lead novo (aviso: %)', coalesce(r.aviso, '(nenhum)');
  end if;

  -- (c) As réguas da RLS, com a sessão de cada um.
  perform set_config('request.jwt.claims', json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
  if public.recebe_lead_pelo_nome('Aaaa Aceite Comercial e SDR') then
    falhas := falhas + 1;
    raise warning 'FALHOU: recebe_lead_pelo_nome aceitou o comercial que também é SDR';
  end if;
  if not public.recebe_lead_pelo_nome('Aaab Aceite Comercial') then
    falhas := falhas + 1;
    raise warning 'FALHOU: recebe_lead_pelo_nome recusou o comercial';
  end if;
  if public.sessao_passa_lead() then
    falhas := falhas + 1;
    raise warning 'FALHOU: sessao_passa_lead deixou o SDR passar o lead';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_duplo, 'role', 'authenticated')::text, true);
  if public.sessao_passa_lead() then
    falhas := falhas + 1;
    raise warning 'FALHOU: sessao_passa_lead deixou o comercial que também é SDR passar o lead';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_com, 'role', 'authenticated')::text, true);
  if not public.sessao_passa_lead() then
    falhas := falhas + 1;
    raise warning 'FALHOU: sessao_passa_lead barrou o comercial';
  end if;

  -- (d) A RLS, com a sessão do SDR: anota no lead com dono, mas não o passa.
  -- Cada tentativa num subbloco que se desfaz.
  perform set_config('request.jwt.claims', json_build_object('sub', v_sdr, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    update public.leads set observacoes = 'aceite: o SDR anotou' where id = v_lead;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      falhas := falhas + 1;
      raise warning 'FALHOU: a RLS não deixou o SDR anotar no lead com dono (linhas: %)', v_n;
    end if;
    raise exception using errcode = 'ZZ303', message = 'desfaz a anotação';
  exception when sqlstate 'ZZ303' then null;
  end;
  begin
    set local role authenticated;
    update public.leads set responsavel = 'Aaab Aceite Comercial' where id = v_lead;
    falhas := falhas + 1;
    raise warning 'FALHOU: a RLS deixou o SDR passar o lead';
    raise exception using errcode = 'ZZ304', message = 'desfaz a passagem';
  exception
    when insufficient_privilege then null;
    when sqlstate 'ZZ304' then null;
  end;
  perform set_config('request.jwt.claims', '', true);
  if (select responsavel from public.leads where id = v_lead) is distinct from 'Zzzz Aceite Dono' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o lead de teste trocou de dono';
  end if;

  delete from public.atendimento_mensagens where lead_id in (v_lead, v_novo);
  delete from public.leads_eventos where lead_id in (v_lead, v_novo);
  delete from public.leads where id in (v_lead, v_novo);
  delete from auth.users where id in (v_duplo, v_sdr, v_com, v_dono);

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no fluxo de SDR do Ney', falhas;
  end if;
  raise notice 'Aceite verificado: o SDR não recebe nem passa lead, e o resgate sem dono que o Ney pode puxar espera a rodada dele (assistente ligado: %).', v_ativo;
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261030120000', 'sdr_e_do_ney')
  on conflict (version) do nothing;
