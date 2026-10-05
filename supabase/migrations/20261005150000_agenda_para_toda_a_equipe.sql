-- ============================================================================
-- A agenda de pessoas é de toda a equipe — o lead, não
-- ============================================================================
-- Decisão do dono (2026-10-05):
--
--   *"A agenda precisa ser vista por todos, o lead não. São coisas diferentes.
--   Existem processos financeiros e de marketing que são diferentes do
--   comercial."*
--
-- A 20261003130000 (escrita, ensaiada, ainda NÃO aplicada) fecha `leads` por
-- escopo: admin todos; gestor e sdr os que têm responsável; comercial os dele;
-- marketing e financeiro nenhum. A view `agenda_de_pessoas` é
-- `security_invoker` e o ramo de leads dela lia `public.leads` direto — então,
-- no dia em que o escopo entrasse, a pessoa de origem "lead" sumiria da agenda
-- do Financeiro e do Marketing, e o vendedor deixaria de achar o contato que
-- está com o colega. O cabeçalho da 20261003130000 registra esse efeito ("passam
-- a devolver só o que o escopo de quem pergunta alcança"); esta migração o
-- desfaz para a agenda, e só para ela.
--
-- ---------------------------------------------------------------------------
-- As duas coisas, coluna a coluna (o ramo de leads da view)
-- ---------------------------------------------------------------------------
--   DIRETÓRIO — quem é a pessoa e como falar com ela. Toda a equipe ativa lê:
--     origem ......... 'lead'
--     id ............. o id do lead (liga, deduplica e desempata a paginação)
--     nome
--     papel .......... 'lead'
--     telefone
--     email
--     ativo .......... está na lista do dia a dia? (em aberto ou ganho = sim;
--                      perdido e descartado = não — ver a ressalva abaixo)
--     created_at ..... quando a pessoa entrou
--     documento, cidade: o lead não tem; seguem NULL, como sempre.
--
--   COMERCIAL — o registro do atendimento. Só quem enxerga o LEAD lê; para os
--   demais a coluna vem NULL:
--     especialidade .. a etapa do funil em que o lead está
--     observacoes .... o interesse (carro) + as observações de quem atende
--
--   Fora da view, e continuam fora: responsável, próximo passo, desfecho,
--   motivo, valores, avaliação, perfil, veículo, canal.
--
-- ⚠️ `ativo` é o único dado derivado do desfecho que toda a equipe passa a ler:
-- um bit — "encerrado sem venda" (perdido OU descartado, sem dizer qual) contra
-- "em aberto ou ganho" (sem dizer qual). Ele fica no diretório de propósito: é
-- o filtro padrão da tela (`ativo=sim`). Sem ele, ou o spam descartado voltaria
-- à lista de contatos do Financeiro (o que a 20260828160000 tirou), ou o lead
-- sumiria do filtro padrão de quem não o enxerga — o defeito que esta migração
-- existe para evitar. Se o dono preferir esconder também isso, a troca é uma
-- linha em `pessoas_dos_leads()`.
--
-- ---------------------------------------------------------------------------
-- O desenho
-- ---------------------------------------------------------------------------
-- 1. `public.pessoas_dos_leads()` — SECURITY DEFINER, `stable`,
--    `search_path = ''`. Devolve as seis colunas de diretório de TODOS os
--    leads, e só responde a `is_staff(auth.uid())` — perfil ATIVO com papel de
--    painel. Cliente da Garagem, investidor, perfil desativado e chamada sem
--    sessão recebem zero linhas. `anon` não tem EXECUTE.
--
-- 2. O ramo de leads da view passa a ser
--
--        public.leads l  FULL JOIN  public.pessoas_dos_leads() d  ON d.id = l.id
--
--    A view continua `security_invoker`: `l` é `leads` NA PELE DE QUEM
--    PERGUNTA, com a RLS que estiver de pé. As colunas comerciais saem de `l`
--    — se a RLS não entrega a linha, `l.*` é NULL e a coluna comercial também.
--    As de diretório saem de `coalesce(l.x, d.x)`.
--
--    Por que FULL JOIN, e não LEFT a partir da função: a chave de serviço e o
--    dono da tabela (migrações, cron, SQL Editor) não têm sessão; para eles a
--    função devolve vazio e `leads` devolve tudo — a view segue entregando a
--    eles exatamente o que entrega hoje, sem farejar papel dentro da função.
--
-- 3. Nenhuma referência às funções da 20261003130000. Quem decide "este
--    usuário vê este lead?" é a RLS de `leads`, perguntada pelo próprio join.
--    Por isso este arquivo vale ANTES e DEPOIS dela, sem mudar uma linha:
--
--      · com `leads` por `is_staff` (produção hoje): toda a equipe enxerga
--        todos os leads, `l` casa com `d` linha a linha, e a view devolve
--        EXATAMENTE o que devolvia. Aplicar isto hoje não muda nada para
--        ninguém.
--      · com `leads` por escopo: as pessoas ficam, e as colunas comerciais
--        aparecem só nos leads do escopo de cada um.
--
-- ⚠️ ORDEM DE APLICAÇÃO: esta ANTES da 20261003130000. Nessa ordem não existe
-- instante em que o Financeiro ou o Marketing perdem gente da agenda. Na ordem
-- inversa nada quebra, mas a agenda encolhe entre uma aplicação e a outra.
--
-- ---------------------------------------------------------------------------
-- O que NÃO muda
-- ---------------------------------------------------------------------------
--   · As policies de `leads`: nenhuma é criada, trocada ou apagada. (O aceite
--     troca a de LEITURA dentro de uma sonda desfeita, para provar os dois
--     mundos, e confere depois que ficaram como estavam.)
--   · Os outros quatro ramos da view (financeiro, ciclo, rede, investidores):
--     o texto é o da 20260828160000, e a conferência prévia compara a view do
--     banco com ele antes de tocar em qualquer coisa. `parceiros` e
--     `investidores` seguem por `has_finance_access`; `clientes`, por
--     `is_staff`. "Agenda para todos" aqui é o ramo de LEADS — se o dono quer
--     também fornecedor e investidor visíveis ao Comercial e ao Marketing, é
--     outra decisão e outra migração.
--   · Colunas da view: mesmos doze nomes, tipos e ordem.
--   · `anon` segue sem SELECT na view; quem não é da equipe segue sem ver
--     pessoa de lead.
--   · `saude_da_atribuicao_dos_leads` (a outra view sobre `leads`): intocada,
--     segue o escopo de quem pergunta.
--
-- ⚠️ O aceite pede, por um instante e dentro de uma subtransação desfeita, a
-- trava exclusiva de `leads` (trocar a policy de leitura). Com
-- `lock_timeout = '3s'`: se `leads` estiver presa por uma transação longa, a
-- migração NÃO entra na fila (a fila pararia o formulário público de lead) —
-- para em "TRAVA OCUPADA … tente de novo em instantes; nada foi aplicado".
-- "Nada foi aplicado" vale para os dois caminhos do README, que aplicam o
-- arquivo numa transação só (`aplicar-migracao.js`, `db push`). Num `psql -f`
-- sem `-1`, a função e a view do bloco 1 já estariam gravadas quando o aceite
-- parasse: inofensivo (é o estado final), e basta reaplicar.
--
-- ⚠️ DESFAZER (devolve o ramo de leads da 20260828160000; rode com a view no
-- estado desta migração — os outros ramos são reaproveitados do banco):
--
--   begin;
--   do $desfazer$
--   declare v_def text := pg_get_viewdef('public.agenda_de_pessoas'::regclass);
--           v_corte int := position(' SELECT ''lead''::text' in v_def);
--   begin
--     if v_corte = 0 then raise exception 'ramo de leads não encontrado'; end if;
--     execute 'create or replace view public.agenda_de_pessoas '
--          || 'with (security_invoker = true) as ' || left(v_def, v_corte - 1)
--          || $ramo$
--        select 'lead'::text, l.id, l.nome, 'lead'::text,
--               coalesce(e.rotulo, l.situacao),
--               null::text, l.telefone, l.email, null::text,
--               nullif(concat_ws(' — ', nullif(trim(l.interesse), ''),
--                                       nullif(trim(l.observacoes), '')), ''),
--               (l.desfecho is null or l.desfecho = 'ganho'),
--               l.created_at
--          from public.leads l
--          left join public.funil_etapas e on e.chave = l.situacao $ramo$;
--   end $desfazer$;
--   drop function if exists public.pessoas_dos_leads();
--   delete from supabase_migrations.schema_migrations where version = '20261005150000';
--   commit;
--
-- Aditiva (uma função nova; a view é recriada com as mesmas colunas; nenhuma
-- tabela, coluna, policy ou dado muda) e idempotente: reaplicar reconhece a
-- view já no formato novo e a recria igual.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Conferência prévia, a função e a view — um bloco só, tudo ou nada
-- ----------------------------------------------------------------------------
-- Um `do` é um comando: se a conferência parar no meio, a função não fica
-- criada sem a view, nem a view sem a função — mesmo aplicado fora de transação.
do $agenda$
declare
  v_txt     text;
  v_faltam  text;
  v_comuns  text[] := array[]::text[];
  v_fontes  text[] := array[]::text[];
  v_antigo  text;
  v_novo    text;
  v_atual   text;
  v_estado  text;
begin
  -- Nada aqui espera por `leads` mais de 3s: quem fica na fila de uma trava
  -- segura atrás de si todo mundo que chega depois — inclusive o formulário
  -- público de lead. Passou disso, desiste (ver o `exception` no fim do bloco).
  set local lock_timeout = '3s';

  -- 0. O que este arquivo pressupõe ------------------------------------------
  if to_regclass('public.agenda_de_pessoas') is null
     or to_regclass('public.leads') is null
     or to_regclass('public.funil_etapas') is null
     or to_regclass('public.parceiros') is null then
    raise exception
      'DIVERGÊNCIA: falta public.agenda_de_pessoas, public.leads, '
      'public.funil_etapas ou public.parceiros (20260824190000/20260828120000). '
      'Nada foi aplicado.';
  end if;

  if to_regprocedure('public.is_staff(uuid)') is null then
    raise exception
      'DEPENDÊNCIA: falta public.is_staff(uuid) — a guarda de equipe ativa da '
      'função nova. Nada foi aplicado.';
  end if;

  select string_agg(c, ', ') into v_faltam
    from unnest(array['id', 'nome', 'telefone', 'email', 'interesse', 'observacoes',
                      'situacao', 'desfecho', 'created_at']) as c
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = 'public.leads'::regclass
                        and a.attname = c and not a.attisdropped);
  if v_faltam is not null then
    raise exception
      'DIVERGÊNCIA: public.leads não tem (%) — o ramo de leads da agenda lê '
      'essas colunas. Nada foi aplicado.', v_faltam;
  end if;

  -- As doze colunas, com nome, tipo e ordem: é o contrato com
  -- `src/app/api/pessoas/route.ts`.
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ' ' order by a.attnum)
    into v_txt
    from pg_attribute a
   where a.attrelid = 'public.agenda_de_pessoas'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_txt is distinct from
     'origem:text id:uuid nome:text papel:text especialidade:text documento:text '
     'telefone:text email:text cidade:text observacoes:text ativo:boolean '
     'created_at:timestamp with time zone' then
    raise exception
      'DIVERGÊNCIA: as colunas de public.agenda_de_pessoas não são as doze da '
      '20260828160000: %. Nada foi aplicado.', v_txt;
  end if;

  if not exists (select 1 from pg_class c
                  where c.oid = 'public.agenda_de_pessoas'::regclass and c.relkind = 'v'
                    and coalesce(c.reloptions, '{}') @> array['security_invoker=true']) then
    raise exception
      'DIVERGÊNCIA: public.agenda_de_pessoas não é uma view security_invoker. '
      'O desenho daqui depende de `leads` ser lida na pele de quem pergunta. '
      'Nada foi aplicado.';
  end if;

  -- RLS forçada faria a função (que roda como dono) enxergar o que a policy
  -- der ao dono — e não a tabela. Ligada e não forçada é o que existe.
  if not exists (select 1 from pg_class c
                  where c.oid = 'public.leads'::regclass
                    and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception
      'DIVERGÊNCIA: public.leads está sem RLS ou com RLS FORÇADA. Nada foi aplicado.';
  end if;

  -- 1. Os ramos ---------------------------------------------------------------
  -- Os quatro que não são de leads: texto da 20260828160000, sem tirar nem pôr.
  v_fontes := v_fontes || 'parceiros'::text;
  v_comuns := v_comuns || $ramo$
    select
      'financeiro'::text                          as origem,
      p.id                                        as id,
      p.nome                                      as nome,
      p.tipo                                      as papel,
      null::text                                  as especialidade,
      p.documento                                 as documento,
      p.telefone                                  as telefone,
      p.email                                     as email,
      p.cidade                                    as cidade,
      p.observacoes                               as observacoes,
      p.ativo                                     as ativo,
      p.created_at                                as created_at
    from public.parceiros p
  $ramo$::text;

  if to_regclass('public.clientes') is not null then
    v_fontes := v_fontes || 'clientes'::text;
    v_comuns := v_comuns || $ramo$
      select
        'ciclo'::text, c.id, c.nome, 'cliente'::text, null::text,
        c.cpf_cnpj, c.telefone_e164, c.email, null::text, null::text,
        true, c.created_at
      from public.clientes c
    $ramo$::text;
  end if;

  if to_regclass('public.parceiros_ciclo') is not null then
    v_fontes := v_fontes || 'parceiros_ciclo'::text;
    v_comuns := v_comuns || $ramo$
      select
        'rede'::text, r.id, r.nome, 'prestador'::text, r.tipo,
        null::text, null::text, null::text, r.cidade, null::text,
        coalesce(r.ativo, true), r.created_at
      from public.parceiros_ciclo r
    $ramo$::text;
  end if;

  if to_regclass('public.investidores') is not null then
    v_fontes := v_fontes || 'investidores'::text;
    v_comuns := v_comuns || $ramo$
      select
        'investidores'::text, i.id, i.nome, 'investidor'::text, null::text,
        i.documento, i.telefone, i.email, null::text, i.observacoes,
        i.ativo, i.created_at
      from public.investidores i
    $ramo$::text;
  end if;

  v_fontes := v_fontes || 'leads'::text;

  -- O ramo de leads como a 20260828160000 o deixou: é o que se espera achar.
  v_antigo := $ramo$
    select
      'lead'::text, l.id, l.nome, 'lead'::text,
      coalesce(e.rotulo, l.situacao),
      null::text, l.telefone, l.email, null::text,
      nullif(concat_ws(' — ', nullif(trim(l.interesse), ''),
                              nullif(trim(l.observacoes), '')), ''),
      (l.desfecho is null or l.desfecho = 'ganho'),
      l.created_at
    from public.leads l
    left join public.funil_etapas e on e.chave = l.situacao
  $ramo$;

  -- O ramo novo. `l` é `leads` na pele de quem pergunta (comercial); `d` é o
  -- diretório, para toda a equipe ativa.
  v_novo := $ramo$
    select
      'lead'::text, coalesce(l.id, d.id), coalesce(l.nome, d.nome), 'lead'::text,
      coalesce(e.rotulo, l.situacao),
      null::text, coalesce(l.telefone, d.telefone), coalesce(l.email, d.email), null::text,
      nullif(concat_ws(' — ', nullif(trim(l.interesse), ''),
                              nullif(trim(l.observacoes), '')), ''),
      coalesce(d.ativo, (l.desfecho is null or l.desfecho = 'ganho')),
      coalesce(l.created_at, d.created_at)
    from public.leads l
    full join public.pessoas_dos_leads() d on d.id = l.id
    left join public.funil_etapas e on e.chave = l.situacao
  $ramo$;

  -- 2. A view do banco é a que o repositório conhece? -------------------------
  -- Compara-se o que o Postgres devolve para a view de verdade com o que ele
  -- devolve para uma view temporária feita do texto esperado: mesma sessão,
  -- mesmo deparse. Tabela-fonte que nasceu depois, ramo editado pelo painel,
  -- coluna trocada — tudo aparece aqui, e a migração para em vez de reescrever
  -- por cima.
  v_atual := pg_get_viewdef('public.agenda_de_pessoas'::regclass);

  if to_regclass('pg_temp.agenda_esperada') is not null then
    drop view pg_temp.agenda_esperada;
  end if;
  execute 'create temp view agenda_esperada as '
       || array_to_string(v_comuns || v_antigo, ' union all ');
  if v_atual = pg_get_viewdef('pg_temp.agenda_esperada'::regclass) then
    v_estado := 'a da 20260828160000';
  end if;
  drop view pg_temp.agenda_esperada;

  if v_estado is null and to_regprocedure('public.pessoas_dos_leads()') is not null then
    execute 'create temp view agenda_esperada as '
         || array_to_string(v_comuns || v_novo, ' union all ');
    if v_atual = pg_get_viewdef('pg_temp.agenda_esperada'::regclass) then
      v_estado := 'a desta migração (reaplicação)';
    end if;
    drop view pg_temp.agenda_esperada;
  end if;

  if v_estado is null then
    raise exception
      'DIVERGÊNCIA: a definição de public.agenda_de_pessoas no banco não é a '
      'da 20260828160000 nem a desta migração (fontes esperadas aqui: %). '
      'Alguém a alterou fora do repositório, ou uma tabela-fonte nasceu depois. '
      'Leia `select pg_get_viewdef(''public.agenda_de_pessoas''::regclass)` e '
      'decida antes de aplicar. Nada foi aplicado.', array_to_string(v_fontes, ', ');
  end if;
  raise notice 'AGENDA: a view encontrada é %.', v_estado;

  -- 3. O diretório -------------------------------------------------------------
  create or replace function public.pessoas_dos_leads()
    returns table (
      id         uuid,
      nome       text,
      telefone   text,
      email      text,
      ativo      boolean,
      created_at timestamptz
    )
    language sql
    stable
    security definer
    set search_path = ''
  as $fn$
    select l.id,
           l.nome::text,
           l.telefone::text,
           l.email::text,
           (l.desfecho is null or l.desfecho = 'ganho'),
           l.created_at
      from public.leads l
     -- Só para a equipe ativa. Em `(select …)`: avaliado uma vez por consulta.
     where (select public.is_staff((select auth.uid())));
  $fn$;

  -- No Supabase, função nova em `public` nasce com EXECUTE para anon e
  -- authenticated pelos default privileges — o revoke de PUBLIC sozinho não tira.
  revoke all on function public.pessoas_dos_leads() from public, anon;
  grant execute on function public.pessoas_dos_leads() to authenticated, service_role;

  -- 4. A view -------------------------------------------------------------------
  execute 'create or replace view public.agenda_de_pessoas '
       || 'with (security_invoker = true) as '
       || array_to_string(v_comuns || v_novo, ' union all ');

  revoke all on public.agenda_de_pessoas from anon;
  grant select on public.agenda_de_pessoas to authenticated, service_role;

  execute format(
    'comment on view public.agenda_de_pessoas is %L',
    'Clientes, fornecedores, prestadores, investidores e leads num formato só '
    || '(2026-08-24; leads em 2026-08-28). '
    || 'security_invoker: a RLS de cada tabela-base vale na pele de quem '
    || 'consulta. A PESSOA de origem lead (nome, telefone, e-mail, ativo, '
    || 'data) é de toda a equipe ativa, por pessoas_dos_leads(); a parte '
    || 'COMERCIAL (especialidade = etapa do funil; observacoes = interesse e '
    || 'anotações) só aparece para quem enxerga o lead pela RLS de leads, e '
    || 'vem NULL para os demais (2026-10-05). Lead ativo = em aberto ou ganho. '
    || 'Fontes unidas neste banco: ' || array_to_string(v_fontes, ', ')
    || '. Fonte ausente aqui significa tabela ausente no banco, não filtro.');
exception
  when lock_not_available then
    raise exception
      'TRAVA OCUPADA: public.leads está presa por outra transação há mais de 3s. '
      'Tente de novo em instantes; nada foi aplicado.';
end $agenda$;

comment on function public.pessoas_dos_leads() is
  'O DIRETÓRIO dos leads: id, nome, telefone, e-mail, ativo (em aberto ou '
  'ganho) e data de entrada de TODOS os leads, para a equipe ativa '
  '(is_staff) — independente do escopo da RLS de leads. Decisão do dono em '
  '2026-10-05: a agenda é de todos, o lead não. Nunca devolve etapa, '
  'responsável, interesse, observações, próximo passo, desfecho ou valor. '
  'Cliente, investidor, perfil desativado e chamada sem sessão recebem zero '
  'linhas. Alimenta o ramo de leads de agenda_de_pessoas.';


-- ============================================================================
-- Aceite — nos DOIS mundos da RLS de `leads`, e a violação tem de falhar
-- ============================================================================
-- Estrutura, e depois efeito numa sonda desfeita pelo sentinela: dez perfis e
-- quatro leads, e cada caso é uma leitura feita na pele de alguém, com DOIS
-- resultados esperados — com `leads` por `is_staff` e com `leads` por escopo.
--
-- A sonda roda duas voltas. A primeira, no mundo em que o banco está. Na
-- segunda ela TROCA a policy de leitura de `leads` pela do outro mundo (a da
-- 20261003130000, copiada daqui de baixo e travada igual por teste; ou a de
-- `is_staff`) e repete todos os casos. Tudo dentro da subtransação que o
-- sentinela desfaz: ao fim, as policies de `leads` são conferidas contra o
-- retrato tirado antes.
--
-- `vê:N` é o número lido; `barrado` é 42501.
do $aceite$
declare
  falhas      int := 0;
  v_txt       text;
  v_n         bigint;
  v_res       text;
  v_caso      record;
  v_casos     jsonb;
  v_falhou    text[] := array[]::text[];
  v_rodados   int := 0;
  v_por_escopo boolean;       -- o mundo em que o banco ESTÁ
  v_no_escopo  boolean;       -- o mundo da volta corrente
  v_mundo     text;
  v_politicas text;
  v_total     bigint;
  u           jsonb := '{}'::jsonb;   -- apelido → id do usuário
  l           uuid[];                 -- os quatro leads
  q           text;
  v_id        uuid;
  v_linha     record;
begin
  -- O retrato das policies de `leads`, para provar no fim que não mudaram.
  select coalesce(string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''),
                             ' | ' order by policyname), '')
    into v_politicas
    from pg_policies where schemaname = 'public' and tablename = 'leads';

  -- Os dois mundos conhecidos, e só eles: uma policy de leitura.
  select string_agg(policyname, ',' order by policyname) into v_txt
    from pg_policies
   where schemaname = 'public' and tablename = 'leads' and cmd in ('SELECT', 'ALL');
  if v_txt is distinct from 'leads_leitura_staff' and v_txt is distinct from 'leads_leitura_por_escopo' then
    raise exception
      'DIVERGÊNCIA: a leitura de public.leads é dada por (%), e não por '
      'leads_leitura_staff (20260828120000) nem por leads_leitura_por_escopo '
      '(20261003130000). O aceite não sabe em que mundo está.', coalesce(v_txt, '<nenhuma>');
  end if;
  v_por_escopo := v_txt = 'leads_leitura_por_escopo';
  v_mundo := case when v_por_escopo
                  then 'leads por escopo (20261003130000 aplicada)'
                  else 'leads por is_staff (20261003130000 ainda não aplicada)' end;

  -- Estrutura ---------------------------------------------------------------
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ' ' order by a.attnum)
    into v_txt
    from pg_attribute a
   where a.attrelid = 'public.agenda_de_pessoas'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_txt is distinct from
     'origem:text id:uuid nome:text papel:text especialidade:text documento:text '
     'telefone:text email:text cidade:text observacoes:text ativo:boolean '
     'created_at:timestamp with time zone' then
    falhas := falhas + 1;
    raise warning 'FALHOU: as colunas da agenda mudaram: %', v_txt;
  end if;

  if not exists (select 1 from pg_class c
                  where c.oid = 'public.agenda_de_pessoas'::regclass
                    and coalesce(c.reloptions, '{}') @> array['security_invoker=true']) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a agenda deixou de ser security_invoker';
  end if;

  if has_table_privilege('anon', 'public.agenda_de_pessoas', 'select')
     or not has_table_privilege('authenticated', 'public.agenda_de_pessoas', 'select')
     or not has_table_privilege('service_role', 'public.agenda_de_pessoas', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHOU: SELECT na agenda — anon não pode, authenticated e service_role precisam';
  end if;

  -- A função: roda como dono, stable, search_path vazio, e devolve SÓ diretório.
  select p.prosecdef::text || ':' || p.provolatile::text || ':' || coalesce(array_to_string(p.proconfig, ','), '')
         || ':' || array_to_string(p.proargnames, ',')
         || ':' || pg_get_function_result(p.oid)
    into v_txt
    from pg_proc p where p.oid = 'public.pessoas_dos_leads()'::regprocedure;
  if v_txt is distinct from
     'true:s:search_path="":id,nome,telefone,email,ativo,created_at:'
     'TABLE(id uuid, nome text, telefone text, email text, ativo boolean, created_at timestamp with time zone)' then
    falhas := falhas + 1;
    raise warning 'FALHOU: pessoas_dos_leads() não é a prometida: %', v_txt;
  end if;
  if has_function_privilege('anon', 'public.pessoas_dos_leads()', 'execute')
     or has_function_privilege('public', 'public.pessoas_dos_leads()', 'execute')
     or not has_function_privilege('authenticated', 'public.pessoas_dos_leads()', 'execute')
     or not has_function_privilege('service_role', 'public.pessoas_dos_leads()', 'execute') then
    falhas := falhas + 1;
    raise warning 'FALHOU: EXECUTE de pessoas_dos_leads() — anon e PUBLIC não podem, authenticated e service_role precisam';
  end if;

  -- A view lê o diretório pela função, e `leads` na pele de quem pergunta.
  if not exists (select 1 from pg_depend d
                   join pg_rewrite r on r.oid = d.objid
                  where r.ev_class = 'public.agenda_de_pessoas'::regclass
                    and d.refclassid = 'pg_proc'::regclass
                    and d.refobjid = 'public.pessoas_dos_leads()'::regprocedure)
     or not exists (select 1 from pg_depend d
                      join pg_rewrite r on r.oid = d.objid
                     where r.ev_class = 'public.agenda_de_pessoas'::regclass
                       and d.refclassid = 'pg_class'::regclass
                       and d.refobjid = 'public.leads'::regclass) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a agenda não depende de pessoas_dos_leads() e de leads ao mesmo tempo';
  end if;

  -- Para o dono da tabela (sem sessão) nada mudou: cada origem devolve
  -- exatamente as linhas da tabela dela, e o lead vem inteiro.
  for v_linha in
    select * from (values
      ('financeiro',   'public.parceiros'),
      ('ciclo',        'public.clientes'),
      ('rede',         'public.parceiros_ciclo'),
      ('investidores', 'public.investidores'),
      ('lead',         'public.leads')
    ) as t(origem, tabela)
  loop
    continue when to_regclass(v_linha.tabela) is null;
    execute format(
      'select (select count(*) from public.agenda_de_pessoas where origem = %L) '
      '       - (select count(*) from %s)', v_linha.origem, v_linha.tabela) into v_n;
    if v_n <> 0 then
      falhas := falhas + 1;
      raise warning 'FALHOU: a origem % da agenda tem % linha(s) de diferença para %',
        v_linha.origem, v_n, v_linha.tabela;
    end if;
  end loop;
  select count(*) into v_n
    from public.agenda_de_pessoas a
    join public.leads x on x.id = a.id
   where a.origem = 'lead'
     and (a.especialidade is null
          or a.nome is distinct from x.nome
          or a.telefone is distinct from x.telefone
          or a.email is distinct from x.email
          or a.created_at is distinct from x.created_at
          or a.ativo is distinct from (x.desfecho is null or x.desfecho = 'ganho'));
  if v_n <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: para o dono da tabela, % lead(s) saem da agenda diferentes do que estão em leads', v_n;
  end if;

  -- Efeito — tudo daqui até o sentinela é desfeito ---------------------------
  begin
    -- A troca da policy de leitura, na segunda volta, pede a trava EXCLUSIVA
    -- de `leads`. Atrás de uma transação longa ela ficaria na fila, e a fila
    -- pararia o formulário público. Três segundos, e desiste. (O `set local`
    -- também é desfeito pelo sentinela.)
    set local lock_timeout = '3s';

    foreach q in array array['admin', 'gestor', 'sdr', 'coma', 'comb', 'mkt', 'fin',
                             'cli', 'inv', 'inativo'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'aceite-agenda-' || q || '@exemplo.invalido', now(), now())
      returning id into v_id;
      u := u || jsonb_build_object(q, v_id);
    end loop;

    update public.profiles set full_name = 'Aceite Agenda Admin', papeis = array['admin'], role = 'admin', is_active = true
     where id = (u->>'admin')::uuid;
    update public.profiles set full_name = 'Aceite Agenda Gestor', papeis = array['gestor'], role = 'gestor', is_active = true
     where id = (u->>'gestor')::uuid;
    update public.profiles set full_name = 'Aceite Agenda SDR', papeis = array['sdr'], role = 'sdr', is_active = true
     where id = (u->>'sdr')::uuid;
    update public.profiles set full_name = 'Aceite Agenda Vendedor A', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'coma')::uuid;
    update public.profiles set full_name = 'Aceite Agenda Vendedor B', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'comb')::uuid;
    update public.profiles set full_name = 'Aceite Agenda Marketing', papeis = array['marketing'], role = 'marketing', is_active = true
     where id = (u->>'mkt')::uuid;
    update public.profiles set full_name = 'Aceite Agenda Financeiro', papeis = array['financeiro'], role = 'financeiro', is_active = true
     where id = (u->>'fin')::uuid;
    update public.profiles set full_name = 'Aceite Agenda Cliente', papeis = array['cliente'], role = 'cliente', is_active = true
     where id = (u->>'cli')::uuid;
    update public.profiles set full_name = 'Aceite Agenda Investidor', papeis = array['investidor'], role = 'investidor', is_active = true
     where id = (u->>'inv')::uuid;
    -- Saiu da loja: era admin e financeiro, e o login não vê mais ninguém.
    update public.profiles set full_name = 'Aceite Agenda Saiu', papeis = array['admin', 'financeiro'], role = 'admin', is_active = false
     where id = (u->>'inativo')::uuid;

    -- 1 sem responsável · 2 do A · 3 do B · 4 do A, perdido (inativo na agenda)
    with novos as (
      insert into public.leads (nome, telefone, email, interesse, observacoes, responsavel, desfecho)
      values ('Aceite Agenda Lead 1', '5541999992001', 'aceite-agenda-1@exemplo.invalido', 'Aceite carro 1', 'Aceite nota 1', null, null),
             ('Aceite Agenda Lead 2', '5541999992002', 'aceite-agenda-2@exemplo.invalido', 'Aceite carro 2', 'Aceite nota 2', 'Aceite Agenda Vendedor A', null),
             ('Aceite Agenda Lead 3', '5541999992003', 'aceite-agenda-3@exemplo.invalido', 'Aceite carro 3', 'Aceite nota 3', 'Aceite Agenda Vendedor B', null),
             ('Aceite Agenda Lead 4', '5541999992004', 'aceite-agenda-4@exemplo.invalido', 'Aceite carro 4', 'Aceite nota 4', 'Aceite Agenda Vendedor A', 'perdido')
      returning id, nome
    )
    select array_agg(id order by nome) into l from novos;

    select count(*) into v_total from public.leads;

    -- Os casos. `{dir}` = pessoa de lead da sonda, com nome, telefone e e-mail
    -- preenchidos; `{com}` = idem, com alguma coluna comercial preenchida;
    -- `{1}`…`{4}` = o id de cada lead. Esperado: [is_staff, escopo].
    v_casos := jsonb_build_array(
      -- Financeiro e Marketing: a pessoa sim, o lead não -------------------------
      jsonb_build_array('financeiro vê as quatro pessoas',          'fin',     'select count(*) from public.agenda_de_pessoas where {dir}', 'vê:4', 'vê:4'),
      jsonb_build_array('…e a parte comercial só enquanto vê lead',  'fin',     'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:0'),
      jsonb_build_array('marketing vê as quatro pessoas',           'mkt',     'select count(*) from public.agenda_de_pessoas where {dir}', 'vê:4', 'vê:4'),
      jsonb_build_array('…e a parte comercial só enquanto vê lead',  'mkt',     'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:0'),
      jsonb_build_array('financeiro vê TODA pessoa de lead da loja', 'fin',     'select count(*) from public.agenda_de_pessoas where origem = ''lead''', 'vê:' || v_total, 'vê:' || v_total),
      jsonb_build_array('filtrar pela nota não a revela',           'fin',     'select count(*) from public.agenda_de_pessoas where origem = ''lead'' and observacoes like ''%Aceite nota%''', 'vê:4', 'vê:0'),
      jsonb_build_array('nem filtrar pela etapa',                   'mkt',     'select count(*) from public.agenda_de_pessoas where id in ({1}, {2}, {3}, {4}) and especialidade is not null', 'vê:4', 'vê:0'),
      jsonb_build_array('o filtro do dia a dia vale para todos',    'fin',     'select count(*) from public.agenda_de_pessoas where {dir} and ativo', 'vê:3', 'vê:3'),
      jsonb_build_array('…e o perdido é inativo para todos',        'mkt',     'select count(*) from public.agenda_de_pessoas where id = {4} and not ativo', 'vê:1', 'vê:1'),
      jsonb_build_array('nenhuma pessoa em dobro',                  'fin',     'select count(*) - count(distinct id) from public.agenda_de_pessoas where origem = ''lead''', 'vê:0', 'vê:0'),
      -- …e `leads` segue o que a policy de `leads` manda --------------------------
      jsonb_build_array('financeiro em leads: o que a RLS manda',   'fin',     'select count(*) from public.leads where id in ({1}, {2}, {3}, {4})', 'vê:4', 'vê:0'),
      jsonb_build_array('marketing em leads: o que a RLS manda',    'mkt',     'select count(*) from public.leads where id in ({1}, {2}, {3}, {4})', 'vê:4', 'vê:0'),
      jsonb_build_array('vendedor A em leads: o que a RLS manda',   'coma',    'select count(*) from public.leads where id in ({1}, {2}, {3}, {4})', 'vê:4', 'vê:2'),
      -- Comercial: todas as pessoas, o comercial só dos dele ----------------------
      jsonb_build_array('vendedor A vê as quatro pessoas',          'coma',    'select count(*) from public.agenda_de_pessoas where {dir}', 'vê:4', 'vê:4'),
      jsonb_build_array('…a parte comercial só dos leads dele',     'coma',    'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:2'),
      jsonb_build_array('…a do lead dele vem inteira',              'coma',    'select count(*) from public.agenda_de_pessoas where id = {2} and observacoes = ''Aceite carro 2 — Aceite nota 2'' and especialidade is not null', 'vê:1', 'vê:1'),
      jsonb_build_array('…o contato do lead do colega ele acha',    'coma',    'select count(*) from public.agenda_de_pessoas where id = {3} and nome = ''Aceite Agenda Lead 3'' and telefone = ''5541999992003'' and email = ''aceite-agenda-3@exemplo.invalido''', 'vê:1', 'vê:1'),
      jsonb_build_array('…mas não a etapa nem a nota dele',         'coma',    'select count(*) from public.agenda_de_pessoas where id = {3} and (especialidade is not null or observacoes is not null)', 'vê:1', 'vê:0'),
      jsonb_build_array('…nem a do lead sem responsável',           'coma',    'select count(*) from public.agenda_de_pessoas where id = {1} and (especialidade is not null or observacoes is not null)', 'vê:1', 'vê:0'),
      jsonb_build_array('vendedor B: comercial só do lead 3',       'comb',    'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:1'),
      -- Gestor e SDR ----------------------------------------------------------------
      jsonb_build_array('gestor vê as quatro pessoas',              'gestor',  'select count(*) from public.agenda_de_pessoas where {dir}', 'vê:4', 'vê:4'),
      jsonb_build_array('…e o comercial dos que têm responsável',   'gestor',  'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:3'),
      jsonb_build_array('sdr vê as quatro pessoas',                 'sdr',     'select count(*) from public.agenda_de_pessoas where {dir}', 'vê:4', 'vê:4'),
      jsonb_build_array('…e o comercial dos que têm responsável',   'sdr',     'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:3'),
      jsonb_build_array('…o lead sem responsável é só contato',     'sdr',     'select count(*) from public.agenda_de_pessoas where id = {1} and nome is not null and especialidade is null and observacoes is null', 'vê:0', 'vê:1'),
      -- Admin, chave de serviço e dono: tudo, como sempre ---------------------------
      jsonb_build_array('admin vê as quatro pessoas',               'admin',   'select count(*) from public.agenda_de_pessoas where {dir}', 'vê:4', 'vê:4'),
      jsonb_build_array('…com o comercial de todas',                'admin',   'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:4'),
      jsonb_build_array('chave de serviço lê tudo',                 '@service_role', 'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:4'),
      jsonb_build_array('…sem pessoa em dobro',                     '@service_role', 'select count(*) from public.agenda_de_pessoas where origem = ''lead''', 'vê:' || v_total, 'vê:' || v_total),
      jsonb_build_array('o dono da tabela lê tudo',                 '@dono',   'select count(*) from public.agenda_de_pessoas where {com}', 'vê:4', 'vê:4'),
      -- Quem não é da equipe: ninguém ------------------------------------------------
      jsonb_build_array('cliente não vê pessoa de lead',            'cli',     'select count(*) from public.agenda_de_pessoas where origem = ''lead''', 'vê:0', 'vê:0'),
      jsonb_build_array('cliente não vê a agenda',                  'cli',     'select count(*) from public.agenda_de_pessoas', 'vê:0', 'vê:0'),
      jsonb_build_array('investidor não vê pessoa de lead',         'inv',     'select count(*) from public.agenda_de_pessoas where origem = ''lead''', 'vê:0', 'vê:0'),
      jsonb_build_array('perfil desativado não vê pessoa de lead',  'inativo', 'select count(*) from public.agenda_de_pessoas where origem = ''lead''', 'vê:0', 'vê:0'),
      jsonb_build_array('anônimo não lê a agenda',                  '@anon',   'select count(*) from public.agenda_de_pessoas', 'barrado', 'barrado'),
      -- A função chamada direto (rpc) --------------------------------------------------
      jsonb_build_array('rpc: financeiro recebe o diretório',       'fin',     'select count(*) from public.pessoas_dos_leads() where id in ({1}, {2}, {3}, {4})', 'vê:4', 'vê:4'),
      jsonb_build_array('rpc: cliente recebe nada',                 'cli',     'select count(*) from public.pessoas_dos_leads()', 'vê:0', 'vê:0'),
      jsonb_build_array('rpc: investidor recebe nada',              'inv',     'select count(*) from public.pessoas_dos_leads()', 'vê:0', 'vê:0'),
      jsonb_build_array('rpc: desativado recebe nada',              'inativo', 'select count(*) from public.pessoas_dos_leads()', 'vê:0', 'vê:0'),
      jsonb_build_array('rpc: anônimo é barrado',                   '@anon',   'select count(*) from public.pessoas_dos_leads()', 'barrado', 'barrado')
    );

    for v_volta in 1..2 loop
      v_no_escopo := case when v_volta = 1 then v_por_escopo else not v_por_escopo end;

      -- A segunda volta é no OUTRO mundo: troca-se só a policy de leitura.
      if v_volta = 2 and v_no_escopo then
        -- As duas réguas e a policy de leitura da 20261003130000, copiadas.
        -- Se as réguas já existem (ela foi aplicada e desfeita), valem as do banco.
        if to_regprocedure('public.escopo_de_leads()') is null then
          create function public.escopo_de_leads()
            returns text
            language sql
            stable
            security definer
            set search_path = ''
          as $fn$
            select coalesce((
              select case
                       when 'admin' = any (p.papeis)               then 'todos'
                       when p.papeis && array['gestor', 'sdr']     then 'designados'
                       when 'comercial' = any (p.papeis)           then 'meus'
                       else 'nenhum'
                     end
                from public.profiles p
               where p.id = auth.uid()
                 and p.is_active = true
            ), 'nenhum');
          $fn$;
        end if;
        if to_regprocedure('public.meu_nome_de_responsavel()') is null then
          create function public.meu_nome_de_responsavel()
            returns text
            language sql
            stable
            security definer
            set search_path = ''
          as $fn$
            select nullif(btrim(p.full_name), '')
              from public.profiles p
             where p.id = auth.uid()
               and p.is_active = true;
          $fn$;
        end if;
        grant execute on function public.escopo_de_leads()         to authenticated, service_role;
        grant execute on function public.meu_nome_de_responsavel() to authenticated, service_role;

        drop policy leads_leitura_staff on public.leads;
        create policy leads_leitura_por_escopo on public.leads
          for select to authenticated
          using (
            coalesce(
              case (select public.escopo_de_leads())
                when 'todos'      then true
                when 'designados' then btrim(coalesce(responsavel, '')) <> ''
                when 'meus'       then
                     btrim(responsavel) = (select public.meu_nome_de_responsavel())
                  or (    responsavel_desde = now()
                      and btrim(responsavel_anterior) = (select public.meu_nome_de_responsavel())
                      and btrim(coalesce(responsavel, '')) <> '')
                else false
              end,
              false)
          );
      elsif v_volta = 2 then
        drop policy leads_leitura_por_escopo on public.leads;
        create policy leads_leitura_staff on public.leads
          for select to authenticated using (public.is_staff(auth.uid()));
      end if;

      for v_caso in
        select c.ordem, c.caso->>0 as rotulo, c.caso->>1 as quem, c.caso->>2 as comando,
               case when v_no_escopo then c.caso->>4 else c.caso->>3 end as esperado
          from jsonb_array_elements(v_casos) with ordinality as c(caso, ordem)
         order by c.ordem
      loop
        q := replace(v_caso.comando, '{dir}',
               format('origem = ''lead'' and papel = ''lead'' and id = any (%L::uuid[]) '
                      'and nome like ''Aceite Agenda Lead _'' and telefone like ''554199999200_'' '
                      'and email like ''aceite-agenda-_@exemplo.invalido'' and created_at is not null '
                      'and documento is null and cidade is null', l));
        q := replace(q, '{com}',
               format('origem = ''lead'' and id = any (%L::uuid[]) '
                      'and especialidade is not null and observacoes like ''Aceite carro _ — Aceite nota _''', l));
        for i in 1..4 loop
          q := replace(q, '{' || i || '}', format('%L::uuid', l[i]));
        end loop;

        if v_caso.quem = '@dono' then
          null;
        elsif left(v_caso.quem, 1) = '@' then
          perform set_config('request.jwt.claims',
                             json_build_object('role', substr(v_caso.quem, 2))::text, true);
          execute format('set local role %I', substr(v_caso.quem, 2));
        else
          perform set_config('request.jwt.claims',
                             json_build_object('sub', u->>v_caso.quem, 'role', 'authenticated')::text, true);
          set local role authenticated;
        end if;

        begin
          execute q into v_n;
          v_res := 'vê:' || v_n;
        exception when insufficient_privilege then
          v_res := 'barrado';
        end;

        reset role;
        perform set_config('request.jwt.claims', '', true);

        v_rodados := v_rodados + 1;
        if v_res is distinct from v_caso.esperado then
          v_falhou := v_falhou || format('[%s] %s: esperava %s, veio %s',
            case when v_no_escopo then 'escopo' else 'is_staff' end,
            v_caso.rotulo, v_caso.esperado, coalesce(v_res, '<nulo>'));
        end if;
      end loop;
    end loop;

    raise exception 'DESFAZER_ACEITE_DA_AGENDA_PARA_TODA_A_EQUIPE' using errcode = 'AGE01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'AGE01' then null;
    when lock_not_available then
      raise exception
        'TRAVA OCUPADA: public.leads está presa por outra transação há mais de 3s. '
        'Tente de novo em instantes; nada foi aplicado.';
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback ---------------
  if v_rodados <> 80 then
    falhas := falhas + 1;
    raise warning 'FALHOU: rodaram % casos, e não os 80 (40 em cada mundo)', v_rodados;
  end if;
  if cardinality(v_falhou) > 0 then
    falhas := falhas + cardinality(v_falhou);
    foreach q in array v_falhou loop
      raise warning 'FALHOU: %', q;
    end loop;
  end if;

  -- As policies de `leads` são as de antes, letra por letra.
  select coalesce(string_agg(policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''),
                             ' | ' order by policyname), '')
    into v_txt
    from pg_policies where schemaname = 'public' and tablename = 'leads';
  if v_txt is distinct from v_politicas then
    falhas := falhas + 1;
    raise warning 'FALHOU: as policies de leads mudaram durante o aceite';
  end if;

  if exists (select 1 from auth.users where email like 'aceite-agenda-%@exemplo.invalido')
     or exists (select 1 from public.leads where nome like 'Aceite Agenda Lead %') then
    falhas := falhas + 1;
    raise warning 'FALHOU: a sonda do aceite não foi desfeita';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na agenda para toda a equipe', falhas;
  end if;
  raise notice
    'Aceite verificado: a pessoa de origem lead (nome, telefone, e-mail, ativo, data) é lida por '
    'toda a equipe ativa; a etapa e as observações só por quem enxerga o lead; cliente, investidor, '
    'perfil desativado e anônimo não leem ninguém; chave de serviço e dono leem tudo, como antes; '
    'as doze colunas da agenda e as policies de leads não mudaram. Provado nos dois mundos, '
    'começando por [%] (% casos).',
    v_mundo, v_rodados;
end $aceite$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20261005150000', 'agenda_para_toda_a_equipe')
  on conflict (version) do nothing;
