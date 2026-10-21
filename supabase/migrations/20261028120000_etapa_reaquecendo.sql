-- ============================================================================
-- A etapa "Reaquecendo": o lead que o assistente reaquece tem coluna própria
-- ============================================================================
-- Pedido do dono (2026-10-21): *"os leads que o Ney estiver reaquecendo ou
-- recuperando, vão para a etapa. os marcados com ney retoma agora, ficam no
-- lugar onde estão"*. Nas perguntas seguintes: a coluna fica depois de
-- Recontato; o lead fica nela enquanto o Ney conversa (mesmo depois de o
-- cliente responder); e, quando o Ney larga o lead, ele volta para a etapa de
-- onde saiu (a visita que o Ney marca continua indo para Visita agendada).
--
-- Quem move é o código (`lib/atendimento-servidor.ts`): a base parada e o
-- "Ney reaquece com o tempo" põem o lead aqui; a saída do assistente o
-- devolve à etapa anotada no rastro (`leads_eventos`, tipo `etapa`, `para`
-- = 'reaquecendo'). Esta migração só cria a etapa e põe nela quem já está
-- sendo reaquecido.
--
--   etapa nova ......... `reaquecendo` / "Reaquecendo", aberta, protegida,
--                        sem prazo de cobrança nem de transferência: o
--                        assistente está com o lead, e o relógio do SLA já
--                        fica parado (`atendimentos.com_assistente`).
--   posição ............ logo depois de `proposta` (Recontato); as etapas
--                        de dali em diante andam uma casa. Sem `proposta`,
--                        antes de `visita`; sem as duas, no fim das abertas.
--   leads de hoje ...... os que estão em `assistente_fase = 'reaquecendo'`
--                        e foram passados pela base ou pelo "reaquece com o
--                        tempo" vão para a etapa. Os do "Ney retoma agora"
--                        ficam onde estão. O gatilho do rastro anota de onde
--                        cada um saiu — é por essa linha que ele volta.
--
-- Idempotente: com a etapa já criada, não mexe em posição nem em lead.
-- ============================================================================

do $etapa$
declare
  v_ordem int;
begin
  if exists (select 1 from public.funil_etapas where chave = 'reaquecendo') then
    return;
  end if;

  select ordem + 1 into v_ordem from public.funil_etapas where chave = 'proposta';
  if v_ordem is null then
    select ordem into v_ordem from public.funil_etapas where chave = 'visita';
  end if;
  if v_ordem is null then
    select coalesce(max(ordem), 0) + 1 into v_ordem from public.funil_etapas where tipo = 'aberta';
  end if;

  update public.funil_etapas set ordem = ordem + 1, atualizada_em = now() where ordem >= v_ordem;

  insert into public.funil_etapas (chave, rotulo, ordem, tipo, estagnacao_minutos, transferencia_minutos, protegida, ativa)
  values ('reaquecendo', 'Reaquecendo', v_ordem, 'aberta', null, null, true, true);

  -- Quem já está sendo reaquecido, menos o que a equipe passou com "Ney
  -- retoma agora": a última passagem anotada no rastro decide (`acao` da
  -- nota: `base`, `devolucao` ou `assumir`). Sem nota, conta como a base.
  update public.leads l
     set situacao = 'reaquecendo'
   where l.assistente_fase = 'reaquecendo'
     and l.desfecho is null
     and coalesce((
           select e.detalhe->>'acao'
             from public.leads_eventos e
            where e.lead_id = l.id
              and e.tipo = 'nota'
              and e.detalhe->>'acao' in ('base', 'devolucao', 'assumir')
            order by e.criado_em desc
            limit 1
         ), 'base') <> 'assumir';
end
$etapa$;

comment on column public.funil_etapas.chave is
  'Chave estável que `leads.situacao` grava. `reaquecendo` (2026-10-21) é do assistente: '
  'a base parada e o "Ney reaquece com o tempo" põem o lead nela, e a saída do assistente o devolve.';

-- ===========================================================================
-- Aceite
-- ===========================================================================
do $aceite$
declare
  v_etapa      record;
  v_proposta   int;
  v_visita     int;
  v_repetidas  int;
  v_esquecidos int;
begin
  select * into v_etapa from public.funil_etapas where chave = 'reaquecendo';
  if not found then
    raise exception 'ACEITE FALHOU: a etapa reaquecendo não existe';
  end if;
  if v_etapa.tipo <> 'aberta' or v_etapa.ativa is not true or v_etapa.protegida is not true
     or v_etapa.estagnacao_minutos is not null or v_etapa.transferencia_minutos is not null then
    raise exception 'ACEITE FALHOU: a etapa reaquecendo tem de ser aberta, ativa, protegida e sem prazo (%)', row_to_json(v_etapa);
  end if;

  select ordem into v_proposta from public.funil_etapas where chave = 'proposta';
  select ordem into v_visita from public.funil_etapas where chave = 'visita';
  if v_proposta is not null and v_etapa.ordem <> v_proposta + 1 then
    raise exception 'ACEITE FALHOU: Reaquecendo (%) não vem logo depois de Recontato (%)', v_etapa.ordem, v_proposta;
  end if;
  if v_visita is not null and v_visita <= v_etapa.ordem then
    raise exception 'ACEITE FALHOU: Visita (%) ficou antes de Reaquecendo (%)', v_visita, v_etapa.ordem;
  end if;

  select count(*) - count(distinct ordem) into v_repetidas from public.funil_etapas;
  if v_repetidas > 0 then
    raise exception 'ACEITE FALHOU: % etapa(s) com a mesma posição depois da troca', v_repetidas;
  end if;

  -- Ninguém da base nem do "reaquece com o tempo" ficou fora da coluna.
  select count(*) into v_esquecidos
    from public.leads l
   where l.assistente_fase = 'reaquecendo'
     and l.desfecho is null
     and l.situacao <> 'reaquecendo'
     and coalesce((
           select e.detalhe->>'acao'
             from public.leads_eventos e
            where e.lead_id = l.id and e.tipo = 'nota' and e.detalhe->>'acao' in ('base', 'devolucao', 'assumir')
            order by e.criado_em desc
            limit 1
         ), 'base') <> 'assumir'
     and not exists (
           select 1 from public.leads_eventos e
            where e.lead_id = l.id and e.tipo = 'etapa' and e.de = 'reaquecendo'
         );
  if v_esquecidos > 0 then
    raise exception 'ACEITE FALHOU: % lead(s) reaquecidos pela base ficaram fora da etapa', v_esquecidos;
  end if;

  raise notice 'Aceite verificado: a etapa Reaquecendo existe depois de Recontato, protegida e sem prazo, e os leads que a base reaquece estão nela.';
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261028120000', 'etapa_reaquecendo')
  on conflict (version) do nothing;
