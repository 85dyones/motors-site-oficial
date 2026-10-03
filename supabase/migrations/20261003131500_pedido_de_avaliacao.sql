-- ==========================================================
-- Pedido de avaliação no Google — o quinto gatilho do motor
-- ==========================================================
--
-- Pedido do dono em 2026-10-03: três dias depois da venda, o motor pede ao
-- comprador, por WhatsApp, uma avaliação da loja no Google. É o primeiro
-- gatilho que fala com TODO comprador, e não só com quem aderiu ao Ciclo.
--
-- O que esta migração faz: reescreve `public.montar_fila_de_gatilhos` com um
-- gatilho a mais, `pedido_de_avaliacao`. Nada além disso — nenhuma tabela,
-- coluna, enum ou CHECK: `eventos_ciclo.gatilho` é texto livre, e o nome novo
-- passa a existir no dia em que a função o devolve.
--
-- As decisões, todas do dono, na ordem em que aparecem no SQL:
--
--   1. NOME, PRIORIDADE E PASSO: `pedido_de_avaliacao`, 40, passo 1. Fica
--      entre a revisão verificada (25) e o lembrete de revisão (60).
--   2. QUANDO: de `data_venda + 3` a `data_venda + 30`, pelo dia de São Paulo
--      (`v_hoje`). Venda com mais de 30 dias não recebe mais o pedido.
--   3. BASE HISTÓRICA: só venda com `data_venda >= 2026-10-03`. Sem backfill
--      de eventos — o corte é uma linha da CTE, comentada lá.
--   4. ALCANCE: todo comprador registrado em `veiculos_vendidos`, com ou sem
--      `aderiu_ciclo`. Para isso nasce a CTE `compradores`, irmã de `veic`
--      sem o filtro de adesão. Carro com `saiu_em` continua de fora.
--   5. UMA VEZ POR CLIENTE, não por veículo. `falha_envio` não conta como
--      pedido feito. Duas vendas elegíveis do mesmo cliente → uma linha só,
--      a da venda mais recente.
--   6. NÃO é isento da janela de 21 dias: a lista de isentos em
--      `classificado` segue com os mesmos três nomes. Domingo, horário,
--      quarentena e colisão por prioridade valem como para todos.
--   7. SÓ WHATSAPP: a mensagem é de WhatsApp e não existe transporte de
--      e-mail. Quem não tem WhatsApp consentido (com telefone) não entra na
--      fila deste gatilho, nem pelo e-mail: sai como suprimido, com o motivo
--      `sem_whatsapp_consentido`, e nenhum evento é gravado. Os quatro
--      gatilhos do Ciclo seguem com a regra de antes (WhatsApp, senão e-mail).
--   8. CONTEXTO: `data_venda`; nome, placa, marca, modelo e ano saem pelas
--      colunas da fila, como na boas-vindas.
--
-- O que fica para depois desta migração (outra entrega): o nome novo na lista
-- de gatilhos válidos da rota `/api/ciclo/motor/fila`, o texto da mensagem em
-- `src/lib/ciclo/motor.ts`, e os testes — inclusive o de
-- `tests/ciclo-motor.test.ts` que procura a definição viva pelo nome do
-- arquivo, e que passa a apontar para ESTE arquivo.
--
-- Aplicação: `supabase db push` ou `supabase/manutencao/aplicar-migracao.js`
-- (ensaio antes de `--gravar`), sempre em transação — a autoconferência do
-- fim lê uma tabela temporária `on commit drop`.
-- ==========================================================


-- ---------------------------------------------------------------------------
-- 0. O retrato do ANTES — a guarda contra reescrita que perde comportamento
-- ---------------------------------------------------------------------------
-- Mesmo desenho da `20260820120000`: `create or replace` de função viva é
-- substituição total. A conferência do fim compara o depois com este retrato
-- e aborta se o banco não tinha a definição que este arquivo copiou.
create temp table _fila_antes on commit drop as
  select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname = 'montar_fila_de_gatilhos';


-- ---------------------------------------------------------------------------
-- 1. `montar_fila_de_gatilhos` com o `pedido_de_avaliacao`
-- ---------------------------------------------------------------------------
-- ⚠️ O bloco abaixo é a definição VIVA, copiada inteira de
-- `20260820120000_plano_de_revisoes_vitalicio.sql` (seção 3) — a última
-- migração a redefinir a função; conferido por grep em 2026-10-03, nenhuma
-- posterior a toca. O texto vem do banco por `pg_get_functiondef`, e por isso
-- o cabeçalho está em MAIÚSCULAS. Não normalizar o caso: a caixa é o rastro
-- de que o texto saiu do banco e não foi redigitado.
--
-- São SEIS alterações sobre a fonte, e mais nenhuma:
--   a. a CTE `compradores`, nova, logo depois de `veic`;
--   b. a CTE `g_avaliacao`, nova, antes de `unidos`;
--   c. `union all select * from g_avaliacao` em `unidos`;
--   d. `com_canal` troca `join veic v` por `join compradores v` — única linha
--      EXISTENTE que muda, e sem efeito para os quatro gatilhos do Ciclo;
--   e. um `when` a mais no CASE do canal, entre o WhatsApp e o e-mail: o
--      `pedido_de_avaliacao` não cai para o e-mail;
--   f. um `when` a mais no CASE de `classificado`, antes do
--      `sem_canal_consentido`: o motivo próprio do gatilho novo.
-- As linhas novas de (e) e (f) só casam com `gatilho = 'pedido_de_avaliacao'`;
-- as linhas vizinhas, que decidem os quatro gatilhos do Ciclo, não mudaram.
-- `veic`, `janelas`, os quatro gatilhos, a classificação, a ordenação, a
-- reserva e o `em_risco` estão byte a byte como na fonte.

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
       -- Carro que saiu da Garagem não recebe mais nada. Aqui corta os quatro
       -- gatilhos de uma vez, em vez de repetir a condição em cada um.
       and vv.saiu_em is null
  ),

  -- ---- base alargada: TODO comprador, com ou sem adesão ao Ciclo -------
  -- Existe por causa do `pedido_de_avaliacao`, que fala com quem comprou e
  -- não só com quem aderiu. Mesmas colunas de `veic`, na mesma ordem, e o
  -- mesmo corte de `saiu_em`; a única diferença é a ausência de
  -- `vv.aderiu_ciclo`. `veic` continua sendo a base dos quatro gatilhos do
  -- Ciclo e não foi tocada: alargá-la mandaria boas-vindas e lembrete de
  -- revisão para quem nunca entrou no programa.
  compradores as (
    select vv.id as vv_id, vv.cliente_id, c.nome, c.telefone_e164, c.email,
           coalesce(c.consentimento_canais, '{}'::jsonb) as canais,
           vv.placa, vv.marca, vv.modelo, vv.ano_modelo,
           vv.km_na_venda, vv.data_venda
      from public.veiculos_vendidos vv
      join public.clientes c on c.id = vv.cliente_id
     where vv.saiu_em is null
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

  -- ---- gatilho: pedido de avaliação no Google (uma vez por CLIENTE) ----
  -- Decisões do dono, 2026-10-03:
  --   · QUANDO: do 3º ao 30º dia depois de `data_venda`. Antes de 3 dias o
  --     cliente mal rodou com o carro; venda mais velha que 30 dias não
  --     recebe mais o pedido.
  --   · BASE HISTÓRICA: só venda de 2026-10-03 em diante. O corte mora AQUI,
  --     na consulta, e não em eventos de backfill (`suprimido_base_anterior`,
  --     como fez a boas-vindas): nenhuma linha é gravada em `eventos_ciclo`
  --     para calar o passado, e venda antiga cadastrada depois continua fora.
  --   · ALCANCE: todo comprador de `veiculos_vendidos` — a base é
  --     `compradores`, não `veic`. Carro com `saiu_em` fica de fora.
  --   · UMA VEZ POR CLIENTE, não por veículo: `eventos_ciclo` não tem
  --     `cliente_id`, então o cliente se alcança pelo veículo do evento, como
  --     a quarentena e a janela de 21 dias fazem. O `join` é na TABELA e não
  --     em `compradores`: o pedido feito por um carro que depois saiu da
  --     Garagem continua valendo como "já pedi". Com mais de uma venda
  --     elegível, o `distinct on` deixa uma linha só — a venda mais recente.
  --   · `falha_envio` não conta como pedido feito (regra 2), igual à
  --     boas-vindas: quem não recebeu ganha a vez de volta, enquanto estiver
  --     dentro dos 30 dias.
  --   · PRIORIDADE 40: perde para risco (10), boas-vindas (15) e revisão
  --     verificada (25); ganha do lembrete de revisão (60).
  --   · NÃO é isento da janela de 21 dias — repare que o nome não entra na
  --     lista de isentos em `classificado`. Domingo, horário, quarentena e
  --     colisão valem como para os outros.
  --   · SÓ WHATSAPP: o canal deste gatilho se decide em `com_canal`, que não
  --     o deixa cair para o e-mail, e o motivo de quem fica de fora
  --     (`sem_whatsapp_consentido`) sai em `classificado`.
  --   · CONTEXTO: no formato da boas-vindas. Nome, placa, marca, modelo e ano
  --     saem pelas colunas da fila (via `com_canal`); o contexto leva a data
  --     da venda.
  g_avaliacao as (
    select distinct on (b.cliente_id)
           b.vv_id, 'pedido_de_avaliacao'::text as gatilho, 40 as prioridade, 1 as passo,
           jsonb_build_object(
             'data_venda', b.data_venda
           ) as contexto
      from compradores b
     where b.data_venda >= date '2026-10-03'
       and v_hoje >= b.data_venda + 3
       and v_hoje <= b.data_venda + 30
       and not exists (
             select 1 from public.eventos_ciclo e
               join public.veiculos_vendidos vq on vq.id = e.veiculo_vendido_id
              where vq.cliente_id = b.cliente_id
                and e.gatilho = 'pedido_de_avaliacao'
                and coalesce(e.desfecho, '') <> 'falha_envio')
     order by b.cliente_id, b.data_venda desc, b.vv_id
  ),

  unidos as (
    select * from g_boas_vindas
    union all select * from g_verificada
    union all select * from g_revisao
    union all select * from g_risco
    union all select * from g_avaliacao
  ),
  filtrados as (
    select * from unidos u
     where p_gatilhos is null or u.gatilho = any(p_gatilhos)
  ),

  -- ---- canal: opt-in por canal (§6.3 D). Sem consentimento, não sai. ----
  -- O `pedido_de_avaliacao` é SÓ WhatsApp (decisão do dono, 2026-10-03): o
  -- texto é de WhatsApp e não existe transporte de e-mail. Se caísse para o
  -- e-mail, a reserva gravaria um evento por dia em `eventos_ciclo`
  -- (append-only), todos terminando em `falha_envio`, até o D+30. O `when` do
  -- meio corta esse caminho: sem WhatsApp consentido, o canal fica nulo e a
  -- linha sai suprimida, sem evento. Para os quatro gatilhos do Ciclo o CASE
  -- decide como antes — WhatsApp, senão e-mail.
  com_canal as (
    select f.*, v.cliente_id, v.nome, v.telefone_e164, v.email,
           v.placa, v.marca, v.modelo, v.ano_modelo,
           case
             when coalesce((v.canais->>'whatsapp')::boolean, false)
                  and coalesce(v.telefone_e164, '') <> '' then 'whatsapp'
             when f.gatilho = 'pedido_de_avaliacao'       then null
             when coalesce((v.canais->>'email')::boolean, false)
                  and coalesce(v.email, '') <> ''         then 'email'
             else null
           end as canal
      from filtrados f
      -- `compradores`, e não mais `veic`: o `pedido_de_avaliacao` traz veículo
      -- que não aderiu ao Ciclo, e o join em `veic` o derrubaria aqui. Para os
      -- quatro gatilhos do Ciclo nada muda — todo `vv_id` de `veic` está em
      -- `compradores`, uma linha só, com as mesmas colunas.
      join compradores v on v.vv_id = f.vv_id
  ),

  classificado as (
    select c.*,
           case
             when v_relogio is not null then v_relogio
             -- Motivo próprio do gatilho que só sai por WhatsApp: cobre quem
             -- não consentiu canal nenhum e quem consentiu só e-mail. Quem
             -- audita a fila vê um cliente com e-mail consentido e precisa
             -- ler por que ele ficou de fora — `sem_canal_consentido` ali
             -- pareceria erro.
             when c.canal is null and c.gatilho = 'pedido_de_avaliacao'
                                        then 'sem_whatsapp_consentido'
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
  'conta como contato feito — regra 2 do CLAUDE.md. Desde 2026-10-03 inclui '
  'pedido_de_avaliacao: todo comprador (com ou sem Ciclo), uma vez por '
  'cliente, de D+3 a D+30 da venda, só para venda de 2026-10-03 em diante, '
  'e só por WhatsApp: sem WhatsApp consentido, sai suprimido como '
  'sem_whatsapp_consentido e nenhum evento é gravado.';

-- `create or replace` preserva os privilégios; repetir é o que garante o
-- estado certo também num banco em que a função nasça por este arquivo.
revoke all on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) from public, anon, authenticated;
grant execute on function public.montar_fila_de_gatilhos(timestamptz, boolean, text[]) to service_role;


-- ---------------------------------------------------------------------------
-- 2. Autoconferência — nada se perdeu, e o gatilho novo entrou como decidido
-- ---------------------------------------------------------------------------
-- Só leitura de catálogo: não cria cliente, venda nem evento. `eventos_ciclo`
-- é append-only, e ensaiar o gatilho com dado sintético em produção deixaria
-- rastro num registro que não se apaga.
do $ac$
declare
  v_antes   text;
  v_depois  text;
  v_qtd     int;
  marcador  text;
  v_reaplicacao boolean;
  antes_n   int;
  depois_n  int;
  c_assin   constant text := 'public.montar_fila_de_gatilhos(timestamptz, boolean, text[])';
begin
  -- 2.1 O banco tinha a função, uma só, e era a definição que este arquivo
  --     copiou. Se alguém a redefiniu por fora das migrações, aplicar por cima
  --     apagaria o que essa pessoa fez — melhor abortar e olhar.
  select count(*), coalesce(string_agg(def, E'\n'), '') into v_qtd, v_antes from _fila_antes;
  if v_qtd <> 1 then
    raise exception
      'ACEITE FALHOU (antes): % definição(ões) de montar_fila_de_gatilhos no schema public (esperado 1).',
      v_qtd;
  end if;
  --     Reaplicar é inócuo: se o ANTES já conhece o gatilho novo, o retrato é
  --     desta própria migração, e a cobrança sobre a fonte não se aplica.
  v_reaplicacao := position('pedido_de_avaliacao' in v_antes) > 0;
  if not v_reaplicacao then
    foreach marcador in array array[
      'pg_advisory_xact_lock', 'and vv.saiu_em is null', 'where vv.aderiu_ciclo',
      'join veic v on v.vv_id = f.vv_id'
    ]
    loop
      if position(marcador in v_antes) = 0 then
        raise exception
          'ACEITE FALHOU (antes): a função viva não tem "%" — não é a definição de 20260820120000 que esta migração copiou.',
          marcador;
      end if;
    end loop;
  end if;

  select pg_get_functiondef(c_assin::regprocedure) into v_depois;

  -- 2.2 Nada se perdeu: os marcadores de comportamento da definição viva.
  foreach marcador in array array[
    'pg_advisory_xact_lock', 'suprimido_por', 'consentimento_canais', 'em_risco',
    'and vv.saiu_em is null', 'sem_canal_consentido', 'quarentena',
    'janela_de_21_dias', 'colisao_prioridade',
    -- os quatro gatilhos, com a prioridade de cada um
    '''boas_vindas''::text as gatilho, 15 as prioridade, 1 as passo',
    '''revisao_verificada''::text, 25, 1',
    '''revisao_programada''::text, 60, r.passo',
    '''elegibilidade_em_risco''::text, 10, r.passo'
  ]
  loop
    if position(marcador in v_depois) = 0 then
      raise exception 'ACEITE FALHOU (nada-se-perdeu): a função perdeu "%" na reescrita.', marcador;
    end if;
  end loop;

  -- Presença não basta para `falha_envio` (lição da 20260820120000): a versão
  -- errada também contém a palavra, só que menos vezes. O gatilho novo traz
  -- um guarda a mais, então a contagem tem de SUBIR (na reaplicação, não cair).
  antes_n  := (length(v_antes)  - length(replace(v_antes,  'falha_envio', ''))) / length('falha_envio');
  depois_n := (length(v_depois) - length(replace(v_depois, 'falha_envio', ''))) / length('falha_envio');
  if depois_n < antes_n or (not v_reaplicacao and depois_n = antes_n) then
    raise exception
      'ACEITE FALHOU (nada-se-perdeu): "falha_envio" foi de % para % ocorrências (deveria subir).',
      antes_n, depois_n;
  end if;

  -- 2.3 `veic` segue filtrando adesão — uma vez, e só nela. Se o filtro
  --     sumisse, os quatro gatilhos do Ciclo passariam a falar com quem não
  --     aderiu; se aparecesse duas vezes, o gatilho novo teria herdado o corte.
  v_qtd := (length(v_depois) - length(replace(v_depois, 'where vv.aderiu_ciclo', '')))
           / length('where vv.aderiu_ciclo');
  if v_qtd <> 1 then
    raise exception
      'ACEITE FALHOU (base): "where vv.aderiu_ciclo" aparece % vez(es) (esperado 1, na CTE veic).', v_qtd;
  end if;

  -- 2.4 O gatilho novo entrou como decidido.
  foreach marcador in array array[
    '''pedido_de_avaliacao''::text as gatilho, 40 as prioridade, 1 as passo',
    'compradores as (',
    'from compradores b',
    'b.data_venda >= date ''2026-10-03''',
    'select distinct on (b.cliente_id)',
    'where vq.cliente_id = b.cliente_id',
    'and e.gatilho = ''pedido_de_avaliacao''',
    'union all select * from g_avaliacao',
    'join compradores v on v.vv_id = f.vv_id'
  ]
  loop
    if position(marcador in v_depois) = 0 then
      raise exception 'ACEITE FALHOU (gatilho novo): falta "%" na função.', marcador;
    end if;
  end loop;

  --     A janela de D+3 a D+30, ANCORADA. Conferir por substring deixava
  --     passar a regra errada: `b.data_venda + 3` é prefixo de `+ 30`, `+ 31`
  --     e `+ 300`. A expressão exige as duas linhas inteiras, na ordem, e o
  --     que vem depois de cada número — só espaço em branco até o próximo
  --     `and`. Trocar 3 por 30/31, ou 30 por 300, não casa.
  if v_depois !~ ('v_hoje >= b\.data_venda \+ 3\s+'
                  || 'and v_hoje <= b\.data_venda \+ 30\s+'
                  || 'and not exists \(') then
    raise exception
      'ACEITE FALHOU (janela): a janela do pedido_de_avaliacao não é exatamente de data_venda + 3 a data_venda + 30.';
  end if;
  --     E são só essas duas contas com a data da venda: uma terceira (um `or`
  --     que reabrisse a janela) passaria pela expressão de cima.
  v_qtd := (length(v_depois) - length(replace(v_depois, 'b.data_venda +', '')))
           / length('b.data_venda +');
  if v_qtd <> 2 then
    raise exception
      'ACEITE FALHOU (janela): "b.data_venda +" aparece % vez(es) (esperado 2: D+3 e D+30).', v_qtd;
  end if;

  -- 2.5 NÃO é isento da janela de 21 dias: a lista de isentos é a mesma.
  if position('c.gatilho not in (''elegibilidade_em_risco'', ''boas_vindas'', ''revisao_verificada'')'
              in v_depois) = 0 then
    raise exception 'ACEITE FALHOU (21 dias): a lista de isentos da janela mudou.';
  end if;

  -- 2.6 SÓ WHATSAPP. O `when` do gatilho novo tem de estar ENTRE o do
  --     WhatsApp e o do e-mail — antes do WhatsApp calaria todo mundo, depois
  --     do e-mail não cortaria nada. A expressão exige as três linhas coladas,
  --     nessa ordem; e o motivo próprio tem de vir antes do motivo geral.
  if v_depois !~ ('<> ''''\s+then ''whatsapp''\s+'
                  || 'when f\.gatilho = ''pedido_de_avaliacao''\s+then null\s+'
                  || 'when coalesce\(\(v\.canais->>''email''\)::boolean, false\)') then
    raise exception
      'ACEITE FALHOU (canal): o pedido_de_avaliacao tem de parar no WhatsApp, sem cair para o e-mail.';
  end if;
  if v_depois !~ ('when c\.canal is null and c\.gatilho = ''pedido_de_avaliacao''\s+'
                  || 'then ''sem_whatsapp_consentido''\s+'
                  || 'when c\.canal is null\s+then ''sem_canal_consentido''') then
    raise exception
      'ACEITE FALHOU (canal): falta o motivo sem_whatsapp_consentido antes de sem_canal_consentido.';
  end if;
  --     A regra de canal dos quatro gatilhos do Ciclo segue com um ramo de
  --     e-mail só, e ele continua existindo.
  v_qtd := (length(v_depois) - length(replace(v_depois, 'then ''email''', '')))
           / length('then ''email''');
  if v_qtd <> 1 then
    raise exception
      'ACEITE FALHOU (canal): "then ''email''" aparece % vez(es) (esperado 1).', v_qtd;
  end if;

  -- 2.7 Só o service_role executa. A fila devolve nome, telefone e placa.
  if has_function_privilege('anon', c_assin, 'execute')
     or has_function_privilege('authenticated', c_assin, 'execute')
     or not has_function_privilege('service_role', c_assin, 'execute') then
    raise exception 'ACEITE FALHOU (privilégio): a fila tem de ser executável só pelo service_role.';
  end if;

  raise notice 'Autoconferência pedido_de_avaliacao: OK.';
end $ac$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20261003131500', 'pedido_de_avaliacao')
  on conflict (version) do nothing;
