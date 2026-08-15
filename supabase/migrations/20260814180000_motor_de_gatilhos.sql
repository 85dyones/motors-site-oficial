-- ==========================================================
-- Motor de gatilhos: a fila, a régua de frequência e o desfecho
-- ==========================================================
--
-- O manual §4 diz que "o orquestrador vive no n8n". O Pacote 3 diz a metade
-- que importa mais: **as regras de frequência do §4.3 vivem no servidor, não
-- no workflow** — "o workflow pode ser reconfigurado por engano; a regra não
-- pode". Este arquivo é essa régua.
--
-- O n8n passa a fazer três coisas e só três: acordar na hora, pedir a fila, e
-- entregar. Quem decide QUEM recebe, POR QUAL gatilho, EM QUE canal e SE pode
-- receber hoje é `montar_fila_de_gatilhos`. Um workflow desligado atrasa
-- mensagem; um workflow reconfigurado não consegue queimar a base.
--
-- Quatro gatilhos entram agora. Os outros do §4.2 dependem de dado que ainda
-- não existe (apólice, financiamento, calendário de IPVA) ou de decisão que
-- não abriu (recompra, regra 5 do CLAUDE.md):
--
--   elegibilidade_em_risco  §4.2 nº 7  — revisão atrasada além da tolerância
--   boas_vindas             novo       — a entrada no programa, no ato da venda
--   revisao_verificada      novo       — o carimbo virou procedência
--   revisao_programada      §4.2 nº 1  — a janela da próxima revisão
--
-- Os dois "novos" não estão na tabela do §4.2 porque o §4.2 lista gatilhos de
-- calendário; estes dois são **transacionais** — respondem a um ato do cliente
-- ou da loja, não à passagem do tempo. Ver o comentário da isenção de
-- frequência, adiante: é a única regra do §4.3 que eles não seguem.
--
-- Nada aqui menciona recompra. O gatilho §1.4 não abriu.
-- ==========================================================


-- ==========================================================
-- 0. A recusa ganha marca própria
-- ==========================================================
--
-- `carimbar_revisao` já registrava a recusa no rastro (uma linha no
-- `observacoes`), mas o registro recusado continua com `confirmada_em` nulo —
-- que é exatamente a definição de "pendente" da fila da A21. Efeito: o item
-- recusado nunca sai da fila, e o aviso de verificação que este pacote liga
-- cobraria a loja para sempre pelo mesmo registro já resolvido.
--
-- Duas colunas resolvem, sem perder nada do rastro que já existe.

alter table public.manutencoes
  add column if not exists recusada_em   timestamptz,
  add column if not exists motivo_recusa text;

comment on column public.manutencoes.recusada_em is
  'Quando a loja recusou o lançamento. Pendente = confirmada_em IS NULL AND '
  'recusada_em IS NULL. Sem esta coluna, recusado e pendente são o mesmo '
  'estado para quem consulta — e a fila nunca esvazia.';

create index if not exists idx_mn_pendentes_reais
  on public.manutencoes(criada_em)
  where confirmada_em is null and recusada_em is null;


-- `carimbar_revisao` recriada: mesma régua, mesmos erros, mesmos retornos.
-- Muda só o ramo da recusa, que agora além do rastro em texto marca as duas
-- colunas. A régua do §1.5 abaixo é idêntica à da migração
-- 20260814150000 — se divergir, a tela prevê um resultado e o banco grava
-- outro (tests/ciclo-verificacao.test.ts trava as duas).

create or replace function public.carimbar_revisao(p_manutencao uuid, p_aceitar boolean, p_motivo text default null)
  returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  m          record;
  janela     record;
  v_dentro   boolean;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Carimbo é restrito à equipe.' using errcode = 'insufficient_privilege';
  end if;

  select * into m from public.manutencoes where id = p_manutencao for update;
  if not found then
    raise exception 'REVISAO_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  if m.confirmada_em is not null then
    raise exception 'REVISAO_JA_CARIMBADA' using errcode = 'check_violation';
  end if;
  if m.recusada_em is not null then
    raise exception 'REVISAO_JA_RECUSADA' using errcode = 'check_violation';
  end if;

  -- ---- recusa: fica no rastro, com o motivo, e fora da conformidade ----
  if not p_aceitar then
    if coalesce(trim(p_motivo), '') = '' then
      raise exception 'RECUSA_SEM_MOTIVO' using errcode = 'check_violation';
    end if;
    update public.manutencoes
       set observacoes = coalesce(observacoes || E'\n', '') ||
                         'RECUSADA em ' || to_char(now(), 'YYYY-MM-DD') || ': ' || trim(p_motivo),
           recusada_em      = now(),
           motivo_recusa    = trim(p_motivo),
           dentro_da_janela = false
     where id = p_manutencao;
    return jsonb_build_object('resultado', 'recusada');
  end if;

  -- ---- carimbo exige a prova: a foto da etiqueta nova, com o KM legível ----
  if coalesce(trim(m.url_etiqueta_atual), '') = '' then
    raise exception 'CARIMBO_SEM_ETIQUETA' using errcode = 'check_violation';
  end if;

  -- ---- casa com a janela do plano, se for revisão programada ----
  v_dentro := null;
  if m.tipo = 'revisao_programada' then
    select pr.* into janela
      from public.plano_revisoes pr
     where pr.veiculo_vendido_id = m.veiculo_vendido_id
       and pr.manutencao_id is null
       and (m.numero_revisao is null or pr.numero_revisao = m.numero_revisao)
     order by pr.numero_revisao
     limit 1;

    if found then
      v_dentro := (m.data_servico <= janela.janela_fim)
              and (janela.km_previsto is null or m.km_registrado <= janela.km_previsto + 1000);
      update public.plano_revisoes
         set manutencao_id = m.id
       where id = janela.id;
    else
      v_dentro := false;
    end if;
  end if;

  update public.manutencoes
     set confirmada_em    = now(),
         confirmada_por   = auth.uid(),
         dentro_da_janela = v_dentro,
         numero_revisao   = coalesce(m.numero_revisao, janela.numero_revisao)
   where id = p_manutencao;

  insert into public.leituras_odometro (veiculo_vendido_id, km, origem, registrada_em)
  values (m.veiculo_vendido_id, m.km_registrado, 'revisao', m.data_servico::timestamptz);

  -- O 3º passo do gatilho 7 marca `em_risco` (§7.3), e a mensagem que o
  -- cliente recebe promete que tem volta. É aqui que ela volta: verificada a
  -- revisão, e não sobrando nenhuma outra janela vencida em aberto, o status
  -- retorna. Promessa sem este bloco seria promessa que o sistema não cumpre.
  update public.contratos_ciclo cc
     set status_elegibilidade = 'elegivel'
   where cc.veiculo_vendido_id = m.veiculo_vendido_id
     and cc.status_elegibilidade = 'em_risco'
     and not exists (
           select 1 from public.plano_revisoes pr
            where pr.veiculo_vendido_id = m.veiculo_vendido_id
              and pr.manutencao_id is null
              and pr.janela_fim < current_date);

  return jsonb_build_object(
    'resultado', 'carimbada',
    'dentro_da_janela', v_dentro,
    'numero_revisao', coalesce(m.numero_revisao, janela.numero_revisao)
  );
end;
$$;

comment on function public.carimbar_revisao(uuid, boolean, text) is
  'Confirma (ou recusa, com motivo) um registro do diário de bordo. Carimbar '
  'exige a foto da etiqueta nova, casa a revisão com a janela do plano, '
  'calcula dentro_da_janela pela régua do §1.5 e grava o KM como leitura '
  'verificada. Recusa marca recusada_em/motivo_recusa e sai da fila. '
  'Transacional e restrita a staff.';

revoke all on function public.carimbar_revisao(uuid, boolean, text) from public, anon;
grant execute on function public.carimbar_revisao(uuid, boolean, text) to authenticated, service_role;


-- ==========================================================
-- 1. km_estimado — projeção, e só para ANTECIPAR aviso
-- ==========================================================
--
-- O §4.2 permite disparar a revisão por "KM −800", antes da data. Sem
-- telemetria (v1.1), o KM entre revisões vem de `leituras_odometro`: o KM de
-- saída na compra, o que o cliente declara e o que a etiqueta provou.
--
-- A projeção é a média do próprio veículo: (km_fim − km_ini) / dias, aplicada
-- aos dias desde a última leitura. Nenhum número inventado — quem não tem duas
-- leituras não é projetado, é lido pelo último valor conhecido.
--
-- ⚠️ Esta estimativa NUNCA entra em conformidade, elegibilidade ou índice. Ela
-- só adianta um lembrete. Quem não registra KM apenas recebe o aviso pela data
-- — não registrar nunca penaliza (§5.6, regra 2 do CLAUDE.md).

create or replace function public.km_estimado(p_vv uuid, p_data date)
  returns int
  language sql
  stable
  set search_path = public
as $$
  with extremos as (
    select
      (select km  from public.leituras_odometro
        where veiculo_vendido_id = p_vv order by registrada_em, km limit 1)          as km_ini,
      (select registrada_em::date from public.leituras_odometro
        where veiculo_vendido_id = p_vv order by registrada_em, km limit 1)          as dia_ini,
      (select km  from public.leituras_odometro
        where veiculo_vendido_id = p_vv order by registrada_em desc, km desc limit 1) as km_fim,
      (select registrada_em::date from public.leituras_odometro
        where veiculo_vendido_id = p_vv order by registrada_em desc, km desc limit 1) as dia_fim
  )
  select case
           when km_fim is null                then null
           when dia_fim <= dia_ini            then km_fim
           when km_fim  <= km_ini             then km_fim
           else km_fim + (
             ((km_fim - km_ini)::numeric / (dia_fim - dia_ini))
             * greatest(p_data - dia_fim, 0)
           )::int
         end
    from extremos;
$$;

comment on function public.km_estimado(uuid, date) is
  'KM projetado pela média do próprio veículo, a partir de leituras_odometro. '
  'Serve só para ANTECIPAR o lembrete de revisão (§4.2, "KM −800"). Nunca '
  'entra em conformidade nem em índice: estimativa não penaliza ninguém.';

revoke all on function public.km_estimado(uuid, date) from public, anon;
grant execute on function public.km_estimado(uuid, date) to authenticated, service_role;


-- ==========================================================
-- 2. montar_fila_de_gatilhos — a régua inteira, num lugar só
-- ==========================================================
--
-- Devolve a fila do dia com UMA linha por cliente (§4.1, "deduplicação por
-- cliente"), já escolhida pela prioridade do §4.4, e devolve TAMBÉM o que foi
-- suprimido, com o motivo — porque fila que descarta em silêncio é fila que
-- ninguém consegue auditar (a lição do 404 engolido).
--
-- `p_reservar = true` grava em `eventos_ciclo` no mesmo comando que monta a
-- fila. Não é detalhe: se o n8n pedisse a fila e gravasse depois, duas
-- execuções sobrepostas mandariam a mesma mensagem duas vezes. A linha em
-- `eventos_ciclo` É a reserva — e é ela que o §4.3 conta.
--
-- ORDEM DE SUPRESSÃO (a primeira que casar é a que aparece):
--   1. horário          §4.3 — nada entre 20h e 8h, nada aos domingos
--   2. sem canal        §6.3 D  — opt-in por canal; sem consentimento, não sai
--   3. quarentena       §4.3 — 3 gatilhos seguidos sem resposta → 90 dias
--   4. janela de 21 dias §4.3 — 1 contato por cliente a cada 21 dias
--   5. colisão          §4.4 — perdeu a prioridade para outro gatilho hoje
--
-- ISENÇÃO DA JANELA DE 21 DIAS — decisão a ratificar (ver
-- docs/MOTOR_DE_GATILHOS.md). O §4.3 isenta os gatilhos 6 e 7. Aqui a isenção
-- vale para `elegibilidade_em_risco` (que É o 7) e para os dois transacionais:
-- `boas_vindas` e `revisao_verificada`. Motivo: os dois respondem a um ato —
-- o cliente comprou, o cliente fez a revisão — e segurá-los por causa de uma
-- mensagem de marketing recente quebraria a promessa do programa justamente
-- no momento em que o cliente cumpriu a parte dele. Horário e consentimento
-- não têm isenção nenhuma: valem para todos, sem exceção.

create or replace function public.montar_fila_de_gatilhos(
  p_agora    timestamptz default now(),
  p_reservar boolean     default false,
  p_gatilhos text[]      default null
)
returns table (
  evento_id          uuid,
  veiculo_vendido_id uuid,
  cliente_id         uuid,
  nome               text,
  telefone_e164      text,
  email              text,
  placa              text,
  marca              text,
  modelo             text,
  ano_modelo         int,
  gatilho            text,
  prioridade         int,
  passo              int,
  canal              text,
  contexto           jsonb,
  suprimido_por      text
)
language plpgsql
set search_path = public
as $$
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
                and e.gatilho = 'boas_vindas')
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
                and e.payload->>'manutencao_id' = m.id::text)
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
$$;

comment on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) is
  'A fila do dia, uma linha por cliente, com as regras do §4.3 e a prioridade '
  'do §4.4 aplicadas no servidor. Devolve também o que foi suprimido e por quê. '
  'p_reservar grava em eventos_ciclo no mesmo comando — a linha É a reserva, e '
  'é ela que impede envio em duplicidade.';

revoke all on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) from public, anon, authenticated;
grant execute on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) to service_role;


-- ==========================================================
-- 3. registrar_desfecho_ciclo — o que aconteceu depois
-- ==========================================================
--
-- O vocabulário de desfecho é o do §2.1: convertido | recusado | sem_resposta
-- | agendado. `falha_envio` é o quinto, e existe por um motivo operacional:
-- reserva que não virou mensagem não pode gastar a janela de 21 dias do
-- cliente. Ela fica na tabela (o rastro importa) e é ignorada por toda conta
-- de frequência.
--
-- Não existe desfecho "enviado": a existência da linha já diz isso.

create or replace function public.registrar_desfecho_ciclo(
  p_evento   uuid,
  p_desfecho text,
  p_valor    numeric default null
) returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  v_ok boolean;
begin
  if p_desfecho not in ('convertido', 'recusado', 'sem_resposta', 'agendado', 'falha_envio') then
    raise exception 'DESFECHO_INVALIDO' using errcode = 'check_violation';
  end if;

  update public.eventos_ciclo
     set desfecho      = p_desfecho,
         valor_gerado  = coalesce(p_valor, valor_gerado),
         respondido_em = case
                           when p_desfecho in ('convertido', 'recusado', 'agendado')
                             then coalesce(respondido_em, now())
                           else respondido_em
                         end
   where id = p_evento
  returning true into v_ok;

  if not coalesce(v_ok, false) then
    raise exception 'EVENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object('ok', true, 'evento_id', p_evento, 'desfecho', p_desfecho);
end;
$$;

comment on function public.registrar_desfecho_ciclo(uuid, text, numeric) is
  'Fecha um evento do motor. falha_envio devolve a vez ao cliente: a linha '
  'fica como rastro mas não conta para a janela de 21 dias do §4.3.';

revoke all on function public.registrar_desfecho_ciclo(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.registrar_desfecho_ciclo(uuid, text, numeric) to service_role;


-- ==========================================================
-- 4. A base anterior ao motor não é cumprimentada
-- ==========================================================
--
-- Os dois gatilhos transacionais olham para o passado inteiro: qualquer
-- veículo sem evento de boas-vindas é candidato, qualquer revisão carimbada
-- sem aviso é candidata. Ligar o motor sobre uma base histórica — o mutirão do
-- §3.3, quando acontecer — dispararia boas-vindas para vendas de 2023.
--
-- Em vez de uma janela de dias arbitrária (número inventado é proibido aqui),
-- o que existe ANTES do motor entra já marcado como suprimido. Hoje isto é um
-- no-op: as tabelas do Ciclo estão vazias. Quando o mutirão do §3.3 rodar,
-- repetir este bloco é o passo obrigatório antes de ligar os workflows.

insert into public.eventos_ciclo (veiculo_vendido_id, gatilho, canal, payload, desfecho)
select vv.id, 'boas_vindas', null,
       jsonb_build_object('motivo', 'venda anterior ao motor de gatilhos'),
       'suprimido_base_anterior'
  from public.veiculos_vendidos vv
 where not exists (
   select 1 from public.eventos_ciclo e
    where e.veiculo_vendido_id = vv.id and e.gatilho = 'boas_vindas');

insert into public.eventos_ciclo (veiculo_vendido_id, gatilho, canal, payload, desfecho)
select m.veiculo_vendido_id, 'revisao_verificada', null,
       jsonb_build_object('manutencao_id', m.id,
                          'motivo', 'carimbo anterior ao motor de gatilhos'),
       'suprimido_base_anterior'
  from public.manutencoes m
 where m.confirmada_em is not null
   and not exists (
     select 1 from public.eventos_ciclo e
      where e.gatilho = 'revisao_verificada'
        and e.payload->>'manutencao_id' = m.id::text);


-- ==========================================================
-- 5. Autoconferência — a régua, contra o banco real
-- ==========================================================
--
-- O aceite do Pacote 3: "dado um cliente com três gatilhos simultâneos, o
-- sistema retorna exatamente um, respeitando a prioridade do §4.4". Mais as
-- regras do §4.3, que são o que este arquivo existe para proteger.
--
-- Tudo roda dentro da transação da migração e é apagado no fim.

do $$
declare
  uid_staff uuid;
  v_vv      uuid;
  v_cli     uuid;
  r         jsonb;
  fila      record;
  qtd       int;
  v_evento  uuid;
  v_seg     timestamptz;  -- uma segunda-feira às 9h, dentro da janela do §4.3
begin
  select id into uid_staff from public.profiles
   where role in ('admin','comercial','financeiro','marketing') and is_active
   order by created_at limit 1;

if uid_staff is null then
  raise notice 'Autoconferência PULADA: não há usuário de staff neste banco.';
else
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Venda de 13 meses atrás: a 1ª revisão (12 meses) já venceu com folga, e a
  -- janela fechou faz tempo — cenário do gatilho 7.
  r := public.fechar_venda_ciclo(jsonb_build_object(
    'cpf_cnpj','00000000808','nome','Cliente Motor','telefone_e164','+554199990008',
    'email','motor@exemplo.invalido','chassi','AUTOCONF-MOTOR-1','placa','MTR0A00',
    'marca','Chevrolet','modelo','Onix','ano_fabricacao',2020,'ano_modelo',2021,
    'data_venda',(current_date - interval '14 months')::date,
    'km_na_venda',30000,'valor_venda',50000,
    'consentimento_lgpd',true,'aderiu_ciclo',true,
    'consentimento_canais', jsonb_build_object('whatsapp',true,'email',true,'sms',false)));
  v_vv  := (r->>'veiculo_vendido_id')::uuid;
  v_cli := (r->>'cliente_id')::uuid;

  set local role none;

  -- ---- 1. horário: fora da janela do §4.3, ninguém recebe nada ----------
  select count(*) into qtd
    from public.montar_fila_de_gatilhos('2026-08-16 12:00:00-03'::timestamptz, false)  -- domingo
   where suprimido_por is null;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: a fila entregou alguém num domingo';
  end if;

  select count(*) into qtd
    from public.montar_fila_de_gatilhos('2026-08-18 06:30:00-03'::timestamptz, false)  -- 6h30
   where suprimido_por is null;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: a fila entregou alguém antes das 8h';
  end if;

  -- ---- 2. três gatilhos ao mesmo tempo, um só sai (§4.4) ---------------
  -- O veículo tem boas_vindas (nunca enviada) E elegibilidade_em_risco (a
  -- janela da 1ª revisão fechou). Uma revisão carimbada acrescenta o terceiro.
  v_seg := '2026-08-18 09:00:00-03'::timestamptz;  -- terça, 9h

  insert into public.manutencoes
    (veiculo_vendido_id, tipo, numero_revisao, data_servico, km_registrado,
     origem_registro, url_etiqueta_atual, confirmada_em, dentro_da_janela)
  values (v_vv, 'revisao_programada', 1, (current_date - interval '1 month')::date,
          41000, 'loja', 'https://exemplo.invalido/e.jpg', now(), true);

  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where veiculo_vendido_id = v_vv;
  if qtd < 2 then
    raise exception 'ACEITE FALHOU: o veículo deveria ter vários gatilhos candidatos, tem %', qtd;
  end if;

  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli and suprimido_por is null;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: com vários gatilhos, saíram % linhas (deveria ser 1)', qtd;
  end if;

  select * into fila
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli and suprimido_por is null;
  if fila.gatilho <> 'elegibilidade_em_risco' then
    raise exception 'ACEITE FALHOU: a prioridade do §4.4 escolheu "%" no lugar do risco', fila.gatilho;
  end if;
  if fila.canal <> 'whatsapp' then
    raise exception 'ACEITE FALHOU: canal saiu "%" com consentimento de WhatsApp', fila.canal;
  end if;

  -- ---- 3. reservar grava em eventos_ciclo, e a reserva segura o resto ---
  select evento_id into v_evento
    from public.montar_fila_de_gatilhos(v_seg, true)
   where cliente_id = v_cli and suprimido_por is null;
  if v_evento is null then
    raise exception 'ACEITE FALHOU: reservou sem devolver o id do evento';
  end if;

  select count(*) into qtd from public.eventos_ciclo
   where veiculo_vendido_id = v_vv and desfecho is null;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: a reserva gravou % eventos (deveria ser 1)', qtd;
  end if;

  -- O gatilho 7 é isento da janela de 21 dias e tem cadência própria: no
  -- mesmo dia, o passo 2 (D+7) ainda não chegou, então nada sai.
  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg + interval '1 day', false)
   where cliente_id = v_cli and suprimido_por is null and gatilho = 'elegibilidade_em_risco';
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: o gatilho 7 repetiu antes do D+7 da cadência';
  end if;

  -- E boas_vindas, que é isenta da janela mas não da colisão, sai no dia
  -- seguinte — porque hoje ela perdeu para o risco, não foi bloqueada.
  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg + interval '1 day', false)
   where cliente_id = v_cli and suprimido_por is null and gatilho = 'boas_vindas';
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: boas-vindas não saiu no dia seguinte à colisão';
  end if;

  -- ---- 4. falha de envio devolve a vez ---------------------------------
  perform public.registrar_desfecho_ciclo(v_evento, 'falha_envio');
  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli and suprimido_por = 'janela_de_21_dias';
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: falha de envio gastou a janela de 21 dias do cliente';
  end if;

  -- ---- 5. sem consentimento, não sai — e aparece o motivo --------------
  update public.clientes
     set consentimento_canais = '{"whatsapp":false,"email":false,"sms":false}'::jsonb
   where id = v_cli;

  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli and suprimido_por is null;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: mandou mensagem para quem não consentiu canal nenhum';
  end if;
  select count(*) into qtd
    from public.montar_fila_de_gatilhos(v_seg, false)
   where cliente_id = v_cli and suprimido_por = 'sem_canal_consentido';
  if qtd = 0 then
    raise exception 'ACEITE FALHOU: a supressão por canal não veio com motivo';
  end if;

  -- ---- 6. km_estimado projeta pela média do próprio veículo ------------
  -- Com uma leitura só — o KM de saída na compra — não há taxa a calcular.
  -- Devolve o que sabe, sem inventar rodagem.
  if public.km_estimado(v_vv, current_date + 30) <> 30000 then
    raise exception 'ACEITE FALHOU: com uma leitura só, km_estimado devolveu % em vez do KM de saída',
      public.km_estimado(v_vv, current_date + 30);
  end if;

  insert into public.leituras_odometro (veiculo_vendido_id, km, origem, registrada_em)
  values (v_vv, 50000, 'cliente', now() - interval '30 days'),
         (v_vv, 51000, 'cliente', now());

  -- Com taxa, a projeção nunca fica abaixo do último KM conhecido e cresce
  -- com o tempo — é disso que o "KM −800" do §4.2 precisa para antecipar.
  if public.km_estimado(v_vv, current_date) < 51000 then
    raise exception 'ACEITE FALHOU: km_estimado devolveu % , abaixo da última leitura',
      public.km_estimado(v_vv, current_date);
  end if;
  if public.km_estimado(v_vv, current_date + 30) <= public.km_estimado(v_vv, current_date) then
    raise exception 'ACEITE FALHOU: km_estimado não cresce com o tempo';
  end if;

  -- Leitura declarada menor que a anterior (odômetro digitado errado) não
  -- vira taxa negativa: a estimativa para de projetar, não anda para trás.
  insert into public.leituras_odometro (veiculo_vendido_id, km, origem, registrada_em)
  values (v_vv, 20000, 'cliente', now() + interval '1 day');
  if public.km_estimado(v_vv, current_date + 60) <> 20000 then
    raise exception 'ACEITE FALHOU: leitura menor que a anterior produziu projeção %',
      public.km_estimado(v_vv, current_date + 60);
  end if;
  delete from public.leituras_odometro
   where veiculo_vendido_id = v_vv and km = 20000;

  -- ---- 7. a recusa sai da fila de pendentes ----------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.manutencoes
    (veiculo_vendido_id, tipo, data_servico, km_registrado, origem_registro)
  values (v_vv, 'revisao_programada', current_date, 52000, 'cliente')
  returning id into v_evento;

  perform public.carimbar_revisao(v_evento, false, 'Etiqueta ilegível');

  select count(*) into qtd from public.manutencoes
   where id = v_evento and confirmada_em is null and recusada_em is null;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: registro recusado continua na fila de pendentes';
  end if;

  -- ---- 8. "em risco" tem volta, como a mensagem promete ----------------
  update public.contratos_ciclo
     set status_elegibilidade = 'em_risco'
   where veiculo_vendido_id = v_vv;

  insert into public.manutencoes
    (veiculo_vendido_id, tipo, numero_revisao, data_servico, km_registrado,
     origem_registro, url_etiqueta_atual)
  values (v_vv, 'revisao_programada', 1, current_date, 52000, 'loja',
          'https://exemplo.invalido/etiqueta-nova.jpg')
  returning id into v_evento;

  perform public.carimbar_revisao(v_evento, true);

  set local role none;

  select count(*) into qtd from public.contratos_ciclo
   where veiculo_vendido_id = v_vv and status_elegibilidade = 'elegivel';
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: revisão verificada não devolveu a elegibilidade ao normal';
  end if;

  -- ---- limpeza ---------------------------------------------------------
  delete from public.eventos_ciclo       where veiculo_vendido_id = v_vv;
  delete from public.leituras_odometro   where veiculo_vendido_id = v_vv;
  delete from public.plano_revisoes      where veiculo_vendido_id = v_vv;
  delete from public.manutencoes         where veiculo_vendido_id = v_vv;
  delete from public.contratos_ciclo     where veiculo_vendido_id = v_vv;
  delete from public.veiculos_vendidos   where id = v_vv;
  delete from public.clientes            where id = v_cli;

  raise notice 'Autoconferência do motor de gatilhos: OK.';
end if;
end $$;
