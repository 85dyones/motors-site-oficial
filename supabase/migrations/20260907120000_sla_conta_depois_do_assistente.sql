-- ---------------------------------------------------------------------------
-- O SLA só começa a contar depois que o assistente sai do circuito
-- ---------------------------------------------------------------------------
-- Decisão do dono em 2026-09-05: *"o SLA só conta após o Ney transferir, toda
-- métrica de controle só conta após o Ney sair do circuito"*.
--
-- O Ney é o assistente Captain do Chatwoot, que passou a fazer o
-- pré-atendimento no WhatsApp. Hoje o motor do funil cutuca o vendedor aos 15
-- minutos e transfere o lead aos 60 — no meio de um pré-atendimento que está
-- indo bem, e por um tempo em que a conversa não estava com o vendedor.
-- Cobrar alguém pelo trabalho que não era dele é o tipo de número que faz a
-- equipe deixar de acreditar no painel.
--
-- A régua compartilhada em `src/lib/funil.ts` já obedece à decisão (commitada,
-- com testes). Esta migração faz o BANCO concordar com ela: a fila que o n8n
-- consome é montada por `montar_fila_do_funil`, e uma tela que diz "ok"
-- enquanto o motor transfere o lead é pior do que não ter regra nenhuma.
--
-- ---------------------------------------------------------------------------
-- Os dois campos, e por que eles vivem em `atendimentos`
-- ---------------------------------------------------------------------------
-- `humano_assumiu_em` e `com_assistente` são propriedades da CONVERSA, não do
-- lead: quem entrega o atendimento é o Ney, dentro de uma conversa do
-- Chatwoot, e é o espelho do n8n que escreve ali. Um cliente que volta meses
-- depois abre conversa nova — e o estado da conversa velha não pode governar a
-- nova. Em `leads` os dois campos seriam um resumo que alguém teria de manter
-- sincronizado; aqui eles são o fato, escrito por quem o observa.
--
-- `org_id` não entra, pela mesma razão de `20260831140000`: `atendimentos` é
-- tabela de módulo, não do núcleo do handoff.
--
-- ---------------------------------------------------------------------------
-- `default false` é a decisão de segurança desta entrega
-- ---------------------------------------------------------------------------
-- Hoje o Ney não está ligado a caixa nenhuma e NENHUMA conversa passa por ele.
-- Uma regra que pausasse o relógio por AUSÊNCIA de informação desligaria o SLA
-- dos catorze leads de produção em silêncio, e ninguém descobriria até o
-- primeiro cliente reclamar de não ter sido atendido.
--
-- Por isso: ausência de dado significa o comportamento de sempre. `false` por
-- omissão na coluna, `coalesce(..., false)` na função para o lead que não tem
-- atendimento nenhum — que hoje são 10 dos 14 leads, e 7 dos 11 atendimentos
-- estão sem `lead_id`. Só o booleano explícito e verdadeiro pausa o relógio.
--
-- Esta migração é, de propósito, INERTE até alguém escrever nos campos novos.
-- O aceite abaixo não afirma isso: ele prova, comparando a fila real de antes
-- com a de depois, no mesmo instante e em três momentos diferentes.
--
-- ---------------------------------------------------------------------------
-- O que ela NÃO faz
-- ---------------------------------------------------------------------------
--   - Não decide qual marca do Chatwoot significa "o Captain está com a
--     conversa". Isso não é observável hoje (o Ney está fora das caixas; em
--     produção só existem `status_conversa` 'open' e 'resolved', e `team_id` é
--     nulo nas 11 linhas). Os campos são projetados para serem preenchidos por
--     FORA, pelo workflow do n8n, quando a marca existir. Inferir a marca aqui
--     seria inventar dado.
--   - Não mexe em `estoque_motors` (F2), não derruba nem renomeia nada: a
--     janela de convivência com o RevendaMais só permite o aditivo.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. As duas colunas
-- ===========================================================================
-- `timestamptz`, e não o `timestamp` sem fuso dos vizinhos de bootstrap
-- (`iniciado_em`, `encerrado_em`, `created_at`): este campo é comparado com
-- `leads.ultimo_movimento_em` e `leads.ultimo_contato_em`, que são
-- `timestamptz`. Repetir o tipo ingênuo aqui poria uma conversão dependente do
-- `TimeZone` da sessão no meio do relógio do SLA — um erro de três horas que
-- só apareceria no relatório.
alter table public.atendimentos
  add column if not exists humano_assumiu_em timestamptz;

alter table public.atendimentos
  add column if not exists com_assistente boolean not null default false;

comment on column public.atendimentos.humano_assumiu_em is
  'Quando um humano assumiu esta conversa, tirando o assistente do circuito. '
  'Entra como mais um candidato no greatest() de `parado_desde`: a '
  'transferência REINICIA o relógio do SLA, e um atendimento humano posterior '
  'continua valendo por cima dela. Nulo é o caso normal — ou o assistente '
  'ainda está com a conversa, ou ela nunca passou por ele. Escrito pelo n8n.';

comment on column public.atendimentos.com_assistente is
  'O assistente (Ney) está com esta conversa AGORA. Enquanto for verdade, o '
  'lead não estagna, não é transferido e conta zero minuto parado. O padrão é '
  'FALSE de propósito: ausência de informação tem de significar o '
  'comportamento de sempre, senão o SLA se desliga sozinho e em silêncio. '
  'Escrito pelo n8n a partir do webhook do Chatwoot.';

-- O caminho de acesso que a função passa a fazer: "dado este lead, qual a
-- conversa mais recente?". Hoje, com 11 linhas, é cosmético — é a mesma aposta
-- que `idx_atendimento_lead` fez em 31/08: o índice se paga no ano que vem, e
-- criá-lo agora não custa nada. Parcial porque 7 das 11 linhas não têm
-- `lead_id`, e o laço nunca as quer.
create index if not exists idx_atendimento_lead_recente
  on public.atendimentos (lead_id, coalesce(iniciado_em, created_at) desc, created_at desc)
  where lead_id is not null;


-- ===========================================================================
-- 2. A fila de ANTES, tirada com a função velha
-- ===========================================================================
-- Fotografia da fila real, com a função ainda intacta, para o aceite comparar
-- depois. Três momentos, porque um só exercitaria um ramo: `now()` pega os
-- leads da etapa "Novo", `+1 dia` cai num domingo e exercita a supressão por
-- horário, `+30 dias` traz também a etapa "Em contato" e sai da supressão.
--
-- `now()` é o instante da TRANSAÇÃO, não do comando: as duas leituras — esta e
-- a do aceite — usam literalmente o mesmo momento, e por isso a comparação é
-- honesta em vez de uma corrida contra o relógio.
--
-- `p_reservar = false`: as CTEs de escrita da função existem, mas ficam com
-- `where p_reservar` falso e afetam zero linhas. Nada é gravado aqui.
--
-- (Numa reexecução desta migração o retrato já sai da função nova e a
-- comparação vira tautologia. A prova vale na primeira aplicação, que é onde
-- ela precisa valer.)
create temp table _funil_antes on commit drop as
select m.rot, f.*
  from (values
          ('agora', now()),
          ('+1d',   now() + interval '1 day'),
          ('+30d',  now() + interval '30 days')
       ) as m(rot, t),
       lateral public.montar_fila_do_funil(m.t, false) f;


-- ===========================================================================
-- 3. montar_fila_do_funil — o relógio passa a saber do assistente
-- ===========================================================================
-- Só duas mudanças, e as duas ficam confinadas à CTE `base`:
--
--   1. Um `left join lateral` traz o atendimento MAIS RECENTE do lead. Mais
--      recente pela mesma régua que `/api/leads/gerenciar` já usa para
--      escolher qual conversa o card abre — `coalesce(iniciado_em,
--      created_at)` decrescente. As duas precisam concordar: se a tela achasse
--      que a conversa atual é uma e o motor achasse que é outra, a discussão
--      viraria sobre quem está certo, não sobre o lead. O `id` no fim só
--      desempata, para a mesma fila chamada duas vezes escolher o mesmo.
--
--   2. `humano_assumiu_em` entra no `greatest(...)`, e `com_assistente`
--      verdadeiro tira o lead da fila.
--
-- Duas propriedades fazem esta mudança incapaz de aumentar cobrança:
--
--   - `greatest()` no Postgres IGNORA nulos, e `leads.ultimo_movimento_em` é
--     `not null default now()` — então `parado_desde` nunca era nulo e não
--     passa a ser. O candidato novo só pode empurrar `parado_desde` para
--     FRENTE, ou seja, só pode DIMINUIR os minutos parados. Nenhum lead entra
--     na fila por causa desta migração; no máximo sai.
--   - `not coalesce(atd.com_assistente, false)`: sem atendimento o lateral não
--     devolve linha, o campo vem nulo, o coalesce vira falso e o lead
--     permanece exatamente como está hoje.
--
-- O resto do corpo é o de `20260828120000`, verbatim — conferido caractere a
-- caractere contra o `pg_get_functiondef` da produção antes de reescrever,
-- porque neste repositório já houve função viva que não estava no arquivo
-- homônimo.
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
         and p.papeis && array['comercial', 'admin']
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
  'contagem.';

-- `create or replace` preserva os privilégios, mas repetir a régua é barato e
-- deixa o arquivo autoexplicativo: a fila carrega nome e telefone de cliente,
-- e quem a chama é o n8n com a chave de serviço.
revoke all on function public.montar_fila_do_funil(timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.montar_fila_do_funil(timestamptz, boolean)
  to service_role;


-- A fila de DEPOIS, com a função nova e nos mesmos três momentos. Fica FORA
-- do bloco de aceite de propósito: lá dentro `f` também é o nome de uma
-- variável `record`, e o plpgsql recusa `f.*` como ambíguo — a mesma classe
-- de armadilha que `#variable_conflict use_column` resolve dentro da função.
create temp table _funil_depois on commit drop as
select m.rot, f.*
  from (values
          ('agora', now()),
          ('+1d',   now() + interval '1 day'),
          ('+30d',  now() + interval '30 days')
       ) as m(rot, t),
       lateral public.montar_fila_do_funil(m.t, false) f;


-- ===========================================================================
-- Aceite — prova o efeito contra o banco de verdade
-- ===========================================================================
do $$
declare
  falhas      int := 0;
  v_antes     int;
  v_depois    int;
  v_sobrando  int;
  v_p         timestamptz := now();
  v_alerta    int;
  v_transf    int;
  v_padrao    boolean;
  v_lead      uuid;
  v_lead_sem  uuid;
  v_atend     uuid;
  v_atend2    uuid;
  v_fila      record;
  achou       boolean;
begin
  -- -------------------------------------------------------------------------
  -- 1. A INÉRCIA: com todo `com_assistente` falso, a fila é a de sempre.
  -- -------------------------------------------------------------------------
  -- É a prova de que a mudança não faz nada até o Ney entrar. Comparação como
  -- CONJUNTO, nos dois sentidos: a ordenação da fila não é total (leads podem
  -- empatar em minutos), e um `except` de um lado só esconderia linha a mais.
  select count(*) into v_antes  from _funil_antes;
  select count(*) into v_depois from _funil_depois;

  select count(*) into v_sobrando from (
    (select * from _funil_antes  except all select * from _funil_depois)
    union all
    (select * from _funil_depois except all select * from _funil_antes)
  ) d;

  if v_sobrando <> 0 or v_antes <> v_depois then
    falhas := falhas + 1;
    raise warning 'FALHOU: a fila mudou sem ninguém marcar assistente — % linha(s) de diferença (antes %, depois %)',
      v_sobrando, v_antes, v_depois;
  else
    raise notice 'Inércia provada: % linha(s) de fila, idênticas antes e depois, em 3 momentos.', v_antes;
  end if;

  -- -------------------------------------------------------------------------
  -- 2. O padrão da coluna nova é o comportamento de sempre.
  -- -------------------------------------------------------------------------
  -- Conferido pelo EFEITO (uma linha inserida sem nomear a coluna), e não pelo
  -- texto de `column_default`: é o default aplicado que importa.
  insert into public.atendimentos (lead_id, chatwoot_conversation_id)
    values (null, -905000) returning id into v_atend;
  select com_assistente into v_padrao from public.atendimentos where id = v_atend;
  if v_padrao is distinct from false then
    falhas := falhas + 1;
    raise warning 'FALHOU: atendimento novo nasceu com com_assistente = % — o SLA se desligaria sozinho', v_padrao;
  end if;
  delete from public.atendimentos where id = v_atend;

  -- E a coluna recusa nulo: "não sei" não pode virar um terceiro estado que
  -- ninguém previu no `coalesce`.
  begin
    insert into public.atendimentos (chatwoot_conversation_id, com_assistente)
      values (-905000, null);
    falhas := falhas + 1;
    raise warning 'FALHOU: com_assistente aceitou nulo';
    delete from public.atendimentos where chatwoot_conversation_id = -905000;
  exception when not_null_violation then
    null; -- é o esperado
  end;

  -- -------------------------------------------------------------------------
  -- 3. O comportamento, exercido com lead sintético
  -- -------------------------------------------------------------------------
  -- Os prazos saem de `funil_etapas`, e não de números escritos aqui: o dono
  -- edita o funil pelo painel, e um aceite com 15 e 60 cravados ficaria
  -- vermelho no dia em que ele mudasse de ideia.
  select estagnacao_minutos, transferencia_minutos into v_alerta, v_transf
    from public.funil_etapas where chave = 'novo';

  if v_alerta is null or v_transf is null then
    raise notice 'Etapa "novo" sem prazos configurados — a parte comportamental do aceite não pôde ser exercida.';
  else
    insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em)
      values ('Aceite SLA Assistente', '5541900000905', 'novo',
              'Aceite SLA Assistente', v_p - make_interval(mins => v_transf + 30))
      returning id into v_lead;

    -- Um segundo lead que NUNCA terá atendimento: é ele quem prova que o lead
    -- sem conversa nenhuma continua se comportando como hoje, mesmo com o
    -- assistente segurando outro lead.
    insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em)
      values ('Aceite SLA Sem Conversa', '5541900000906', 'novo',
              'Aceite SLA Sem Conversa', v_p - make_interval(mins => v_transf + 30))
      returning id into v_lead_sem;

    -- 3a. Linha de base: sem atendimento, o lead está na fila para transferir.
    select * into v_fila from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
    if v_fila.aviso is distinct from 'transferencia' or v_fila.minutos_parado <> v_transf + 30 then
      falhas := falhas + 1;
      raise warning 'FALHOU (base): esperado transferencia/% min, veio %/% min',
        v_transf + 30, coalesce(v_fila.aviso, '(fora da fila)'), v_fila.minutos_parado;
    end if;

    -- 3b. Atendimento que nasce sem marca nenhuma não muda nada.
    insert into public.atendimentos (lead_id, chatwoot_conversation_id, iniciado_em)
      values (v_lead, -905001, (v_p at time zone 'UTC') - interval '60 minutes')
      returning id into v_atend;

    select * into v_fila from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
    if v_fila.aviso is distinct from 'transferencia' or v_fila.minutos_parado <> v_transf + 30 then
      falhas := falhas + 1;
      raise warning 'FALHOU: abrir conversa sem marca de assistente mexeu no relógio (veio %/% min)',
        coalesce(v_fila.aviso, '(fora da fila)'), v_fila.minutos_parado;
    end if;

    -- 3c. Com o assistente na conversa, o lead SAI da fila — e só ele.
    update public.atendimentos set com_assistente = true where id = v_atend;

    select exists (select 1 from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead)
      into achou;
    if achou then
      falhas := falhas + 1;
      raise warning 'FALHOU: lead em pré-atendimento continuou na fila — o vendedor seria cutucado no meio da conversa do Ney';
    end if;

    select exists (select 1 from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead_sem)
      into achou;
    if not achou then
      falhas := falhas + 1;
      raise warning 'FALHOU: o lead SEM atendimento nenhum saiu da fila — a ausência de dado desligou o SLA';
    end if;

    -- 3d. Devolvido, volta a contar exatamente como antes.
    update public.atendimentos set com_assistente = false where id = v_atend;
    select * into v_fila from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
    if v_fila.aviso is distinct from 'transferencia' or v_fila.minutos_parado <> v_transf + 30 then
      falhas := falhas + 1;
      raise warning 'FALHOU: o lead não voltou ao estado de sempre depois de o assistente sair (veio %/% min)',
        coalesce(v_fila.aviso, '(fora da fila)'), v_fila.minutos_parado;
    end if;

    -- 3e. A transferência REINICIA o relógio: era transferência, vira alerta.
    update public.atendimentos
       set humano_assumiu_em = v_p - make_interval(mins => v_alerta + 5)
     where id = v_atend;

    select * into v_fila from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
    if v_fila.minutos_parado <> v_alerta + 5 then
      falhas := falhas + 1;
      raise warning 'FALHOU: depois da transferência o relógio marcou % min, esperado %',
        v_fila.minutos_parado, v_alerta + 5;
    end if;
    if v_alerta + 5 < v_transf and v_fila.aviso is distinct from 'estagnacao' then
      falhas := falhas + 1;
      raise warning 'FALHOU: com o relógio reiniciado o aviso continuou %, esperado estagnacao',
        coalesce(v_fila.aviso, '(fora da fila)');
    end if;

    -- 3f. E não RETROCEDE: um toque humano posterior vale por cima dela.
    update public.leads set ultimo_contato_em = v_p - make_interval(mins => v_alerta + 1)
     where id = v_lead;

    select * into v_fila from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
    if v_fila.minutos_parado <> v_alerta + 1 then
      falhas := falhas + 1;
      raise warning 'FALHOU: a transferência antiga reabriu o prazo de um lead atendido depois (% min, esperado %)',
        v_fila.minutos_parado, v_alerta + 1;
    end if;

    -- 3g. Duas conversas no mesmo lead: manda a MAIS RECENTE.
    -- Uma conversa velha marcada com o assistente não pode segurar o relógio
    -- de uma conversa nova — é o cliente que voltou meses depois.
    update public.atendimentos set com_assistente = true where id = v_atend;
    insert into public.atendimentos (lead_id, chatwoot_conversation_id, iniciado_em, com_assistente)
      values (v_lead, -905002, (v_p at time zone 'UTC') - interval '10 minutes', false)
      returning id into v_atend2;

    select exists (select 1 from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead)
      into achou;
    if not achou then
      falhas := falhas + 1;
      raise warning 'FALHOU: uma conversa VELHA com o assistente segurou o relógio da conversa nova';
    end if;

    -- E o espelho: a mais recente com o assistente tira o lead da fila.
    update public.atendimentos set com_assistente = false where id = v_atend;
    update public.atendimentos set com_assistente = true  where id = v_atend2;

    select exists (select 1 from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead)
      into achou;
    if achou then
      falhas := falhas + 1;
      raise warning 'FALHOU: a conversa mais recente estava com o assistente e o lead ficou na fila';
    end if;

    -- 3h. Um lead com duas conversas produz UMA linha, não duas.
    update public.atendimentos set com_assistente = false where id in (v_atend, v_atend2);
    select count(*) into v_sobrando
      from public.montar_fila_do_funil(v_p, false) where lead_id = v_lead;
    if v_sobrando <> 1 then
      falhas := falhas + 1;
      raise warning 'FALHOU: lead com duas conversas virou % linha(s) na fila — seriam % mensagens',
        v_sobrando, v_sobrando;
    end if;

    delete from public.atendimentos where id in (v_atend, v_atend2);
    delete from public.leads where id in (v_lead, v_lead_sem);
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no relógio do assistente', falhas;
  end if;

  raise notice 'Aceite verificado: o relógio do funil só corre depois que o assistente sai do circuito, e nada muda enquanto ninguém marcar.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260907120000', 'sla_conta_depois_do_assistente')
  on conflict (version) do nothing;
