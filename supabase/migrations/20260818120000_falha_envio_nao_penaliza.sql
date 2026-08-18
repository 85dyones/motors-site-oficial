-- ==========================================================
-- `falha_envio` não queima o gatilho, e a fila não duplica
-- ==========================================================
--
-- Duas correções na mesma função, porque as duas vivem nela.
--
-- ---- 1. `falha_envio` deixava o cliente sem a mensagem, para sempre ----
--
-- `boas_vindas` e `revisao_verificada` deduplicavam por "já existe linha em
-- `eventos_ciclo`", SEM excluir `falha_envio`. Os outros dois gatilhos já
-- excluíam — a assimetria não era intencional.
--
-- O canal de e-mail ainda não tem transporte (`docs/MOTOR_DE_GATILHOS.md`).
-- O cliente que desliga o WhatsApp e mantém o e-mail entra na fila com
-- `canal: 'email'`, o orquestrador não entrega e grava `falha_envio` — e a
-- linha passa a existir. A partir daí a boas-vindas dele NUNCA MAIS sai, nem
-- se ele religar o WhatsApp; e cada revisão verificada perde o aviso, uma por
-- uma.
--
-- A regra 2 do CLAUDE.md é explícita: *"a recusa nunca penaliza"*. Aqui não
-- era nem recusa — era escolher um canal — e o preço eram mensagens que não
-- se recuperam. "Não consegui entregar" jamais pode ser lido como "já avisei".
--
-- ---- 2. A fila não era idempotente sob concorrência ----
--
-- A rota e o comentário da função afirmavam que a reserva impedia envio
-- duplicado. Não impedia: a CTE roda em READ COMMITTED, os `not exists` são
-- avaliados no snapshot de cada transação, e não havia advisory lock nem
-- índice único. Duas execuções sobrepostas mandavam a mesma mensagem duas
-- vezes. Agora a montagem com reserva é serializada.
--
-- O corpo abaixo é a definição que estava em produção, com essas três
-- alterações e nada mais — extraída com `pg_get_functiondef` para não
-- reescrever 14 mil caracteres à mão e introduzir diferença sem querer.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.montar_fila_de_gatilhos(p_agora timestamp with time zone DEFAULT now(), p_reservar boolean DEFAULT false, p_gatilhos text[] DEFAULT NULL::text[])
 RETURNS TABLE(evento_id uuid, veiculo_vendido_id uuid, cliente_id uuid, nome text, telefone_e164 text, email text, placa text, marca text, modelo text, ano_modelo integer, gatilho text, prioridade integer, passo integer, canal text, contexto jsonb, suprimido_por text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
-- Os nomes da tabela de retorno (veiculo_vendido_id, gatilho, canal…) são os
-- mesmos das colunas que a consulta lê. Sem esta diretiva, cada um deles vira
-- "column reference is ambiguous" — e o corpo não referencia variável de saída
-- em lugar nenhum, porque tudo sai por RETURN QUERY.
#variable_conflict use_column
declare
  v_local  timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_hoje   date      := (p_agora at time zone 'America/Sao_Paulo')::date;
  v_relogio text;
begin
  -- Uma montagem por vez. Sem isto, duas execuções sobrepostas (retry do n8n
  -- após timeout, execução manual durante o cron) avaliam os mesmos
  -- `not exists` no snapshot de cada transação e reservam o mesmo gatilho
  -- duas vezes. O lock é de transação: sai sozinho no commit ou no rollback,
  -- e só morde quando p_reservar = true, que é quando há escrita.
  if p_reservar then
    perform pg_advisory_xact_lock(hashtext('motor_de_gatilhos'));
  end if;

  -- §4.3: nenhum contato entre 20h e 8h, nem aos domingos. Vale para todo
  -- gatilho, sem isenção — inclusive os transacionais.
  if extract(dow from v_local) = 0 then
    v_relogio := 'domingo';
  elsif extract(hour from v_local) < 8 or extract(hour from v_local) >= 20 then
    v_relogio := 'fora_do_horario';
  end if;

  return query
  with veic as (
    select vv.id as vv_id, vv.cliente_id, c.nome, c.telefone_e164, c.email,
           coalesce(c.consentimento_canais, '{}'::jsonb) as canais,
           vv.placa, vv.marca, vv.modelo, vv.ano_modelo,
           vv.km_na_venda, vv.data_venda
      from public.veiculos_vendidos vv
      join public.clientes c on c.id = vv.cliente_id
     where vv.aderiu_ciclo
  ),

  -- ---- janelas de revisão ainda não cumpridas -------------------------
  -- `manutencao_id is null` = nenhuma revisão carimbada casou com esta
  -- janela. A data "prevista" é o meio da janela por construção
  -- (janela_inicio = prevista − tolerância, janela_fim = prevista + tolerância);
  -- lê-la do meio faz a cadência continuar certa se a tolerância mudar.
  janelas as (
    select v.*, pr.numero_revisao, pr.km_previsto, pr.janela_inicio, pr.janela_fim,
           (pr.janela_inicio + ((pr.janela_fim - pr.janela_inicio) / 2))::date as prevista
      from veic v
      join public.plano_revisoes pr on pr.veiculo_vendido_id = v.vv_id
     where pr.manutencao_id is null
  ),

  -- ---- gatilho: boas-vindas (transacional, uma vez por veículo) --------
  g_boas_vindas as (
    select v.vv_id, 'boas_vindas'::text as gatilho, 15 as prioridade, 1 as passo,
           jsonb_build_object(
             'data_venda',     v.data_venda,
             'km_na_venda',    v.km_na_venda,
             'plano',          cc.plano,
             'garantia_meses', cc.garantia_meses,
             'garantia_fim',   cc.garantia_fim,
             'primeira_revisao', (
               select jsonb_build_object(
                        'numero',        pr.numero_revisao,
                        'janela_inicio', pr.janela_inicio,
                        'janela_fim',    pr.janela_fim,
                        'km_previsto',   pr.km_previsto)
                 from public.plano_revisoes pr
                where pr.veiculo_vendido_id = v.vv_id
                order by pr.numero_revisao limit 1)
           ) as contexto
      from veic v
      join public.contratos_ciclo cc on cc.veiculo_vendido_id = v.vv_id
     where not exists (
             select 1 from public.eventos_ciclo e
              where e.veiculo_vendido_id = v.vv_id
                and e.gatilho = 'boas_vindas'
                -- 'falha_envio' quer dizer "não consegui entregar", e isso
                -- nunca pode ser lido como "já avisei" (regra 2).
                and coalesce(e.desfecho, '') <> 'falha_envio')
  ),

  -- ---- gatilho: revisão verificada (transacional, uma vez por revisão) --
  -- O carimbo é o ativo do programa (§5.7). O cliente precisa saber que o
  -- dele entrou — é o que transforma "fiz a revisão" em "tenho procedência".
  g_verificada as (
    select v.vv_id, 'revisao_verificada'::text, 25, 1,
           jsonb_build_object(
             'manutencao_id',    m.id,
             'numero_revisao',   m.numero_revisao,
             'data_servico',     m.data_servico,
             'km_registrado',    m.km_registrado,
             'dentro_da_janela', m.dentro_da_janela,
             'confirmada_em',    m.confirmada_em)
      from veic v
      join public.manutencoes m on m.veiculo_vendido_id = v.vv_id
     where m.confirmada_em is not null
       and m.tipo = 'revisao_programada'
       and not exists (
             select 1 from public.eventos_ciclo e
              where e.gatilho = 'revisao_verificada'
                and e.payload->>'manutencao_id' = m.id::text
                and coalesce(e.desfecho, '') <> 'falha_envio')
  ),

  -- ---- gatilho 1: revisão programada — cadência D−15 · D−3 · D+7 -------
  -- §7.3. O passo sai da contagem do que já foi disparado para ESTA revisão:
  -- três passos e encerra, sem estado extra para manter em lugar nenhum.
  revisao_base as (
    select j.*,
           (select count(*) from public.eventos_ciclo e
             where e.veiculo_vendido_id = j.vv_id
               and e.gatilho = 'revisao_programada'
               and coalesce(e.desfecho, '') <> 'falha_envio'
               and (e.payload->>'numero_revisao') = j.numero_revisao::text
           )::int + 1 as passo,
           (select (max(e.enviado_em) at time zone 'America/Sao_Paulo')::date
              from public.eventos_ciclo e
             where e.veiculo_vendido_id = j.vv_id
               and e.gatilho = 'revisao_programada'
               and coalesce(e.desfecho, '') <> 'falha_envio'
               and (e.payload->>'numero_revisao') = j.numero_revisao::text
           ) as ultimo_aviso,
           public.km_estimado(j.vv_id, v_hoje) as km_hoje
      from janelas j
     where j.janela_fim >= v_hoje
  ),
  g_revisao as (
    select r.vv_id, 'revisao_programada'::text, 60, r.passo,
           jsonb_build_object(
             'numero_revisao', r.numero_revisao,
             'janela_inicio',  r.janela_inicio,
             'janela_fim',     r.janela_fim,
             'prevista',       r.prevista,
             'km_previsto',    r.km_previsto,
             'km_estimado',    r.km_hoje,
             'dias_para_o_fim', r.janela_fim - v_hoje,
             'antecipado_por_km', (r.passo = 1 and r.km_previsto is not null
                                   and r.km_hoje is not null
                                   and r.km_hoje >= r.km_previsto - 800
                                   and v_hoje < r.prevista - 15))
      from revisao_base r
     where r.passo <= 3
       and (
             -- pela data: D−15, D−3, D+7 (§7.3)
             v_hoje >= (r.prevista - (case r.passo when 1 then 15 when 2 then 3 else -7 end))
             -- ou pelo odômetro, e só no primeiro aviso: "KM −800" (§4.2)
             or (r.passo = 1 and r.km_previsto is not null and r.km_hoje is not null
                 and r.km_hoje >= r.km_previsto - 800)
           )
       -- A cadência é uma sequência de INTERVALOS, não de datas soltas. Ver o
       -- comentário do gatilho 7 abaixo: sem isto, quem entra atrasado recebe
       -- os três avisos em três dias seguidos.
       and (r.passo = 1
            or v_hoje >= r.ultimo_aviso + (case r.passo when 2 then 12 else 10 end))
  ),

  -- ---- gatilho 7: elegibilidade em risco — imediato · D+7 · D+21 -------
  -- `janela_fim` já contém a tolerância do §1.5 (prevista + 30 dias). Passar
  -- dela É a "revisão atrasada > 30 dias" do §4.2. O terceiro passo marca
  -- `status_elegibilidade = em_risco`, como manda o §7.3.
  risco_base as (
    select j.*,
           (select count(*) from public.eventos_ciclo e
             where e.veiculo_vendido_id = j.vv_id
               and e.gatilho = 'elegibilidade_em_risco'
               and coalesce(e.desfecho, '') <> 'falha_envio'
               and (e.payload->>'numero_revisao') = j.numero_revisao::text
           )::int + 1 as passo,
           (select (max(e.enviado_em) at time zone 'America/Sao_Paulo')::date
              from public.eventos_ciclo e
             where e.veiculo_vendido_id = j.vv_id
               and e.gatilho = 'elegibilidade_em_risco'
               and coalesce(e.desfecho, '') <> 'falha_envio'
               and (e.payload->>'numero_revisao') = j.numero_revisao::text
           ) as ultimo_aviso
      from janelas j
     where j.janela_fim < v_hoje
  ),
  g_risco as (
    select r.vv_id, 'elegibilidade_em_risco'::text, 10, r.passo,
           jsonb_build_object(
             'numero_revisao', r.numero_revisao,
             'janela_inicio',  r.janela_inicio,
             'janela_fim',     r.janela_fim,
             'km_previsto',    r.km_previsto,
             'dias_de_atraso', v_hoje - r.janela_fim,
             'marca_em_risco', (r.passo = 3))
      from risco_base r
     where r.passo <= 3
       and v_hoje >= r.janela_fim + (case r.passo when 1 then 0 when 2 then 7 else 21 end)
       -- "Imediato · D+7 · D+21" é uma sequência de INTERVALOS, não três datas
       -- soltas. Um veículo que entra no motor já 35 dias atrasado tem os três
       -- marcos vencidos ao mesmo tempo — e sem esta linha receberia as três
       -- mensagens em três dias seguidos. Os intervalos são os do §7.3: 7 dias
       -- entre o 1º e o 2º, 14 entre o 2º e o 3º.
       and (r.passo = 1
            or v_hoje >= r.ultimo_aviso + (case r.passo when 2 then 7 else 14 end))
  ),

  unidos as (
    select * from g_boas_vindas
    union all select * from g_verificada
    union all select * from g_revisao
    union all select * from g_risco
  ),
  filtrados as (
    select * from unidos u
     where p_gatilhos is null or u.gatilho = any(p_gatilhos)
  ),

  -- ---- canal: opt-in por canal (§6.3 D). Sem consentimento, não sai. ----
  com_canal as (
    select f.*, v.cliente_id, v.nome, v.telefone_e164, v.email,
           v.placa, v.marca, v.modelo, v.ano_modelo,
           case
             when coalesce((v.canais->>'whatsapp')::boolean, false)
                  and coalesce(v.telefone_e164, '') <> '' then 'whatsapp'
             when coalesce((v.canais->>'email')::boolean, false)
                  and coalesce(v.email, '') <> ''         then 'email'
             else null
           end as canal
      from filtrados f
      join veic v on v.vv_id = f.vv_id
  ),

  classificado as (
    select c.*,
           case
             when v_relogio is not null then v_relogio
             when c.canal is null       then 'sem_canal_consentido'

             -- §4.3: três gatilhos consecutivos sem resposta → 90 dias parado.
             when exists (
               select 1 from (
                 select e.desfecho, e.enviado_em
                   from public.eventos_ciclo e
                   join public.veiculos_vendidos vq on vq.id = e.veiculo_vendido_id
                  where vq.cliente_id = c.cliente_id
                    and coalesce(e.desfecho, '') <> 'falha_envio'
                  order by e.enviado_em desc
                  limit 3
               ) tres
               having count(*) = 3
                  and count(*) filter (where tres.desfecho = 'sem_resposta') = 3
                  and max(tres.enviado_em) > p_agora - interval '90 days'
             ) then 'quarentena'

             -- §4.3: 1 contato por cliente a cada 21 dias, qualquer gatilho.
             when c.gatilho not in ('elegibilidade_em_risco', 'boas_vindas', 'revisao_verificada')
              and exists (
                select 1 from public.eventos_ciclo e
                  join public.veiculos_vendidos vq on vq.id = e.veiculo_vendido_id
                 where vq.cliente_id = c.cliente_id
                   and coalesce(e.desfecho, '') <> 'falha_envio'
                   and e.enviado_em > p_agora - interval '21 days'
              ) then 'janela_de_21_dias'

             else null
           end as suprimido_por
      from com_canal c
  ),

  -- §4.4: risco de perder elegibilidade vem antes de oportunidade, sempre.
  -- Suprimido ordena por último para não gastar o rn de quem pode sair.
  ordenado as (
    select cl.*,
           row_number() over (
             partition by cl.cliente_id
             order by (cl.suprimido_por is not null), cl.prioridade, cl.passo desc, cl.vv_id
           ) as rn
      from classificado cl
  ),
  marcado as (
    select o.*,
           coalesce(o.suprimido_por,
                    case when o.rn > 1 then 'colisao_prioridade' end) as sup
      from ordenado o
  ),

  reservado as (
    insert into public.eventos_ciclo (veiculo_vendido_id, gatilho, canal, payload, enviado_em)
    select m.vv_id, m.gatilho, m.canal,
           m.contexto || jsonb_build_object('passo', m.passo),
           p_agora
      from marcado m
     where p_reservar and m.sup is null
    returning id, veiculo_vendido_id, gatilho
  ),
  em_risco as (
    update public.contratos_ciclo cc
       set status_elegibilidade = 'em_risco'
     where p_reservar
       and cc.status_elegibilidade = 'elegivel'
       and cc.veiculo_vendido_id in (
             select m.vv_id from marcado m
              where m.sup is null
                and m.gatilho = 'elegibilidade_em_risco'
                and m.passo = 3)
    returning cc.veiculo_vendido_id
  )

  select r.id, m.vv_id, m.cliente_id, m.nome, m.telefone_e164, m.email,
         m.placa, m.marca, m.modelo, m.ano_modelo,
         m.gatilho, m.prioridade, m.passo, m.canal,
         m.contexto || jsonb_build_object(
           'passo', m.passo,
           'em_risco_marcado', exists (select 1 from em_risco er where er.veiculo_vendido_id = m.vv_id)
         ),
         m.sup
    from marcado m
    left join reservado r on r.veiculo_vendido_id = m.vv_id and r.gatilho = m.gatilho
   order by (m.sup is not null), m.prioridade, m.nome;
end;
$function$
;

comment on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) is
  'Monta (e opcionalmente reserva) a fila do motor de gatilhos. Reserva é '
  'serializada por advisory lock de transação. Desfecho falha_envio nunca '
  'conta como contato feito — regra 2 do CLAUDE.md.';
