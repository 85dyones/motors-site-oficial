-- ---------------------------------------------------------------------------
-- O lead transferido não volta a ser transferido na rodada seguinte (2026-10-10)
-- ---------------------------------------------------------------------------
-- Medido em 10/10, depois do relato do dono (*"as conversas sobre
-- responsabilidade do Rodrigo não aparecem pra ele"*): os mesmos 11 leads
-- foram do Dyones para o Rodrigo às 13:00 UTC e do Rodrigo para o Dyones às
-- 14:00. De 30/09 a 09/10, 100 a 230 transferências por dia para 12 a 24
-- leads — cada lead parado trocava de dono quase de hora em hora, das 8h às
-- 20h, com um WhatsApp ao vendedor (e, desde 10/10, uma cópia ao gestor) a
-- cada troca.
--
-- A causa: o relógio do lead é `greatest(ultimo_movimento_em,
-- ultimo_contato_em, humano_assumiu_em)`, e a transferência automática não
-- mexe em nenhum dos três — de propósito, porque transferir não é atender.
-- Então o lead transferido continua "parado há 9 dias" na rodada seguinte,
-- passa de novo do prazo de transferência e vai para o próximo da fila. A
-- estagnação tem a trava de 20 h (`alerta_recente`); a transferência não
-- tinha trava nenhuma.
--
-- A régua nova: só se transfere de novo depois que o dono ATUAL teve o mesmo
-- prazo de transferência da etapa, contado de `responsavel_desde` — que o
-- gatilho de `leads` carimba a cada troca de dono, a automática inclusive.
-- Antes disso o lead cai na estagnação, que a marca da transferência
-- (`alertado_em`) segura por 20 h: o novo dono recebe o aviso da
-- transferência, um lembrete 20 h depois se nada andar, e só perde o lead
-- depois do prazo inteiro. O relógio do lead (`minutos_parado`) NÃO muda: a
-- mensagem continua dizendo há quanto tempo o cliente espera.
--
-- `responsavel_desde` nulo (lead antigo, de antes da coluna) mantém a régua de
-- antes. A troca manual de dono não passa por aqui: ela é contato, e já zera
-- o relógio pelo gatilho.
--
-- O corpo abaixo é o de `20260923130100`, conferido contra o `prosrc` da
-- produção antes de reescrever (md5 98aa6c1eecb9e5e62c33b437ebc49d89, IGUAL,
-- 10/10). Mudam só: a coluna `responsavel_desde` no `base`, a condição da
-- transferência no `classificado` e uma frase no comentário da função.

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
      prox.nome     as novo_responsavel,
      prox.telefone as novo_whatsapp,
      case
        when m.responsavel is null
             and m.estagnacao_minutos is not null
             and m.minutos >= m.estagnacao_minutos            then 'atribuicao'
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
  'novo dono — admin não entra por ser admin, e o SDR não recebe lead. Desde '
  '2026-10-10 o lead só é transferido de novo depois que o dono atual teve o '
  'mesmo prazo de transferência (`responsavel_desde`): acabou o vaivém de hora '
  'em hora entre vendedores.';

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
-- Um lead de teste, com dono, parado além do prazo de transferência numa
-- etapa aberta, não protegida, com prazo de transferência. Muda só
-- `responsavel_desde`:
--   - recém-transferido (há 10 min)            → NÃO é transferência;
--   - dono há mais que o prazo de transferência → transferência;
--   - sem `responsavel_desde` (lead antigo)    → transferência, como antes.
-- O `aviso` é lido sem filtrar `suprimido_por`: fora do horário a linha vem
-- suprimida, mas a classificação é a que está sendo medida. Prévia
-- (`p_reservar = false`): nada é gravado pela fila. Tudo que o aceite cria ele
-- apaga.
do $$
declare
  falhas   int := 0;
  v_lead   uuid;
  v_etapa  text;
  v_transf int;
  v_aviso  text;
  v_p      timestamptz := now();
begin
  select chave, transferencia_minutos into v_etapa, v_transf
    from public.funil_etapas
   where tipo = 'aberta' and ativa and not protegida
     and transferencia_minutos is not null
   order by ordem
   limit 1;

  if v_etapa is null then
    raise exception 'ACEITE FALHOU: nenhuma etapa aberta com prazo de transferência — a régua não pôde ser exercida';
  end if;

  insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em)
    values ('Aceite Transferencia Espera', '5541900001010', v_etapa, 'Aaab Aceite Dono Atual',
            v_p - make_interval(mins => v_transf + 60))
    returning id into v_lead;

  -- Recém-transferido.
  update public.leads
     set responsavel_desde = v_p - interval '10 minutes',
         ultimo_movimento_em = v_p - make_interval(mins => v_transf + 60),
         ultimo_contato_em = null
   where id = v_lead;
  select aviso into v_aviso from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
  if v_aviso is not distinct from 'transferencia' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o lead transferido há 10 min foi transferido de novo';
  end if;

  -- Dono há mais que o prazo inteiro.
  update public.leads
     set responsavel_desde = v_p - make_interval(mins => v_transf + 1)
   where id = v_lead;
  select aviso into v_aviso from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
  if v_aviso is distinct from 'transferencia' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o dono teve o prazo inteiro e o lead não foi transferido (aviso: %)',
      coalesce(v_aviso, '(nenhum)');
  end if;

  -- Sem `responsavel_desde`: a régua de antes.
  update public.leads set responsavel_desde = null where id = v_lead;
  select aviso into v_aviso from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
  if v_aviso is distinct from 'transferencia' then
    falhas := falhas + 1;
    raise warning 'FALHOU: lead sem responsavel_desde deixou de ser transferido (aviso: %)',
      coalesce(v_aviso, '(nenhum)');
  end if;

  delete from public.leads_eventos where lead_id = v_lead;
  delete from public.leads where id = v_lead;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na trava da transferência', falhas;
  end if;
  raise notice 'Aceite verificado: o lead recém-transferido fica com o novo dono até o prazo inteiro; depois dele, e sem responsavel_desde, transfere como antes (etapa de teste: %).', v_etapa;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261010140000', 'transferencia_espera_o_prazo_do_novo_dono')
  on conflict (version) do nothing;
