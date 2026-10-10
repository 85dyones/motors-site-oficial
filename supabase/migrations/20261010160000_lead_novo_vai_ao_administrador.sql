-- ---------------------------------------------------------------------------
-- Lead novo vai ao administrador, e não ao rodízio (2026-10-10)
-- ---------------------------------------------------------------------------
-- Decisão do dono: *"avise o administrador quando entrar lead novo, Dyones.
-- ele vai determinar o dono e depois começa a dança"* — e o gestor (Silvio)
-- recebe a entrada também.
--
-- Até aqui o lead entrava sem dono e o rodízio o dava ao vendedor com menos
-- leads abertos, depois do prazo de estagnação da etapa (`atribuicao`).
-- Medido em 10/10: dos 17 leads dos últimos 7 dias, 14 ganharam o primeiro
-- dono assim, de 20 min a um dia e meio depois de chegar, e só 2 pela mão do
-- administrador.
--
-- Agora:
--   - lead aberto sem dono vira o aviso `lead_novo`, já na primeira rodada,
--     sem esperar prazo nenhum. Ninguém é escolhido aqui: `novo_responsavel`
--     e `novo_whatsapp` vêm nulos, e quem recebe (o administrador que
--     distribui, e o gestor) é decidido no site, que tem o cadastro;
--   - avisado, o lead novo só volta a avisar 20 h depois, se continuar sem
--     dono (`alerta_recente`, a mesma trava da estagnação, com a mesma marca
--     `alertado_em`); fora do horário espera a manhã, como os outros;
--   - o rodízio não dá mais o PRIMEIRO dono a ninguém: a reserva só troca o
--     dono na `transferencia`. Dado o dono, a régua de sempre (estagnação e
--     transferência, com a trava de `20261010140000`) começa a valer.
--
-- `atribuicao` some da fila. O site continua entendendo o aviso antigo, para a
-- ordem de deploy não importar.
--
-- O corpo abaixo é o de `20261010140000`, aplicado em produção às 14:25 UTC de
-- 10/10 (md5 do `prosrc` 315dc779ff97692a49b71b50c884404b, conferido).

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
      -- Lead sem dono não tem "próximo dono": quem decide é o administrador.
      case when m.responsavel is null then null else prox.nome end     as novo_responsavel,
      case when m.responsavel is null then null else prox.telefone end as novo_whatsapp,
      case
        -- 2026-10-10, decisão do dono: *"avise o administrador quando entrar
        -- lead novo, Dyones. ele vai determinar o dono e depois começa a
        -- dança"*. O lead sem dono deixa de ser distribuído pelo rodízio (era
        -- a `atribuicao`, depois do prazo de estagnação da etapa) e vira um
        -- aviso, já na primeira rodada: quem recebe é decidido no site.
        when m.responsavel is null                                       then 'lead_novo'
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
  'continuar sem dono.';

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
-- Prévia (`p_reservar = false`), com o relógio numa quarta-feira ao meio-dia
-- de São Paulo, para o horário de atendimento não suprimir a linha. Um lead
-- aberto sem dono, chegado há 5 minutos:
--   - é `lead_novo` já na primeira rodada, sem ninguém escolhido para ele, e
--     sai para entrega;
--   - avisado há 1 h, fica suprimido por `alerta_recente`;
--   - a fila não tem mais `atribuicao` nenhuma.
-- Tudo que o aceite cria ele apaga.
do $$
declare
  falhas  int := 0;
  v_lead  uuid;
  v_etapa text;
  v_p     timestamptz := date_trunc('week', now()) + interval '2 days 15 hours';
  r       record;
begin
  select chave into v_etapa
    from public.funil_etapas
   where tipo = 'aberta' and ativa
   order by ordem
   limit 1;

  if v_etapa is null then
    raise exception 'ACEITE FALHOU: nenhuma etapa aberta — a régua do lead novo não pôde ser exercida';
  end if;

  insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em)
    values ('Aceite Lead Novo', '5541900001016', v_etapa, null, v_p - interval '5 minutes')
    returning id into v_lead;

  select * into r from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
  if r.aviso is distinct from 'lead_novo' then
    falhas := falhas + 1;
    raise warning 'FALHOU: lead sem dono chegado há 5 min não virou lead_novo (aviso: %)', coalesce(r.aviso, '(nenhum)');
  end if;
  if r.novo_responsavel is not null or r.novo_whatsapp is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: o lead novo saiu com dono escolhido pelo rodízio (%)', r.novo_responsavel;
  end if;
  if r.suprimido_por is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: o lead novo saiu suprimido (%)', r.suprimido_por;
  end if;

  update public.leads set alertado_em = v_p - interval '1 hour' where id = v_lead;
  select * into r from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
  if r.suprimido_por is distinct from 'alerta_recente' then
    falhas := falhas + 1;
    raise warning 'FALHOU: lead novo avisado há 1 h não ficou suprimido (suprimido_por: %)', coalesce(r.suprimido_por, '(nada)');
  end if;

  if exists (select 1 from public.montar_fila_do_funil(v_p, false) where aviso = 'atribuicao') then
    falhas := falhas + 1;
    raise warning 'FALHOU: a fila ainda tem atribuicao';
  end if;

  delete from public.leads_eventos where lead_id = v_lead;
  delete from public.leads where id = v_lead;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na régua do lead novo', falhas;
  end if;
  raise notice 'Aceite verificado: lead sem dono vira lead_novo na primeira rodada, sem dono escolhido; avisado, espera 20 h; a fila não tem mais atribuicao (etapa de teste: %).', v_etapa;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261010160000', 'lead_novo_vai_ao_administrador')
  on conflict (version) do nothing;
