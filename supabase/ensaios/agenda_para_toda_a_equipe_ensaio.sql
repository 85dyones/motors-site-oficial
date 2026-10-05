-- ============================================================================
-- ENSAIO da migração 20261005150000_agenda_para_toda_a_equipe — não deixa nada
-- ============================================================================
-- Um bloco só. Ele (1) repete a conferência prévia da migração (inclusive a
-- comparação da view do banco com a que o repositório conhece), (2) veste
-- perfis REAIS — um admin, um gestor, um SDR puro, um Comercial puro, um
-- Financeiro, um Marketing, um cliente da Garagem e um investidor, escolhidos
-- por consulta — e conta o que cada um lê na agenda em TRÊS momentos:
--
--   fase 1 · a view de HOJE, com a RLS de `leads` de hoje ........ o "antes"
--   fase 2 · o MESMO DDL da migração aplicado (função + view) .... o "depois"
--   fase 3 · a view nova no OUTRO mundo da RLS de `leads` (a policy de
--            leitura trocada: por escopo, se hoje é `is_staff`; ou o inverso)
--            — o que a agenda entrega quando a 20261003130000 entrar
--
-- e (3) termina em
--
--     ERROR:  ENSAIO_DESFEITO { …resumo em JSON… }
--
-- O erro É o resultado: é ele que desfaz tudo. O DO roda numa transação (a
-- implícita do comando, ou a de quem o chamou), e a exceção final a aborta —
-- função, view, policy trocada e réguas emprestadas voltam ao que eram. Se a
-- mensagem for outra (DIVERGÊNCIA, DEPENDÊNCIA, ENSAIO_SEM_…), o ensaio parou
-- antes, e também não deixou nada.
--
-- Como ler o resumo, por perfil e por fase:
--   · `pessoas_de_lead` .. linhas de origem "lead" que o perfil lê na agenda.
--   · `com_comercial` .... dessas, quantas vêm com etapa ou observações.
--   · `outras_origens` ... linhas das outras quatro origens (não pode mudar
--                          entre as fases).
--   · `leads_que_ve` ..... `select count(*) from leads` na pele dele — o que a
--                          RLS de `leads` manda.
--
-- O esperado (`confere` em cada perfil, `tudo_confere` no topo):
--   · fase 1: `pessoas_de_lead` = `leads_que_ve` (a view antiga segue a RLS).
--   · fases 2 e 3, equipe: `pessoas_de_lead` = `leads.total` — TODO MUNDO vê
--     todas as pessoas; `com_comercial` = `leads_que_ve` — a parte comercial
--     acompanha o lead.
--   · fases 2 e 3, cliente e investidor: zero pessoa de lead.
--   · com `leads` por `is_staff` hoje, a fase 2 é IGUAL à fase 1 em todos os
--     números: aplicar a migração hoje não muda nada para ninguém.
--   · no mundo do escopo, `leads_que_ve` é o da regra: admin todos; gestor e
--     sdr os com responsável; comercial os dele; os demais, zero.
--
-- O DDL daqui é cópia da migração, e
-- `tests/migracao-da-agenda-para-toda-a-equipe.test.ts` falha se os dois
-- arquivos divergirem.
--
-- ⚠️ A fase 3 troca a policy de leitura de `leads`: pede a trava exclusiva da
-- tabela enquanto o bloco roda (um instante). Com `lock_timeout = '3s'`: se
-- `leads` estiver presa por uma transação longa, o ensaio não entra na fila —
-- para em "TRAVA OCUPADA … tente de novo em instantes; nada foi aplicado".
-- ⚠️ Nomes e telefones não saem no resumo: só ids de perfil, papéis e contagens.
-- ============================================================================
do $$
declare
  v_txt     text;
  v_faltam  text;
  v_comuns  text[] := array[]::text[];
  v_fontes  text[] := array[]::text[];
  v_antigo  text;
  v_novo    text;
  v_atual   text;
  v_estado  text;

  v_por_escopo boolean;       -- o mundo em que o banco ESTÁ
  v_no_escopo  boolean;       -- o mundo da fase corrente
  v_total      bigint;
  v_designados bigint;
  v_sem_etapa  bigint;
  v_ids        jsonb := '{}'::jsonb;
  v_perfil     record;
  v_fase       int;
  v_nome_fase  text;
  v_fase_1     text;
  v_pessoas    bigint;
  v_comercial  bigint;
  v_outras     bigint;
  v_leads      bigint;
  v_esperado   bigint;
  v_erro       text;
  v_confere    boolean;
  v_ok         boolean := true;
  v_da_equipe  boolean;
  v_medidas    jsonb := '{}'::jsonb;   -- fase → tipo → números
  v_linha      jsonb;
  v_politicas  jsonb;
  v_resumo     jsonb;
begin
  -- Nada aqui espera por `leads` mais de 3s: a fase 3 pede a trava EXCLUSIVA
  -- da tabela, e ficar na fila dela pararia o formulário público de lead.
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
  -- --------------------------------------------------------------------------
  -- Os dois mundos conhecidos da leitura de `leads`, como no aceite
  -- --------------------------------------------------------------------------
  select string_agg(policyname, ',' order by policyname) into v_txt
    from pg_policies
   where schemaname = 'public' and tablename = 'leads' and cmd in ('SELECT', 'ALL');
  if v_txt is distinct from 'leads_leitura_staff' and v_txt is distinct from 'leads_leitura_por_escopo' then
    raise exception
      'DIVERGÊNCIA: a leitura de public.leads é dada por (%), e não por '
      'leads_leitura_staff (20260828120000) nem por leads_leitura_por_escopo '
      '(20261003130000). O ensaio não sabe em que mundo está.', coalesce(v_txt, '<nenhuma>');
  end if;
  v_por_escopo := v_txt = 'leads_leitura_por_escopo';

  select jsonb_agg(policyname || ':' || cmd order by policyname) into v_politicas
    from pg_policies where schemaname = 'public' and tablename = 'leads';

  -- --------------------------------------------------------------------------
  -- Os perfis reais a vestir, e os totais na pele do dono
  -- --------------------------------------------------------------------------
  select count(*),
         count(*) filter (where btrim(coalesce(l.responsavel, '')) <> ''),
         count(*) filter (where l.situacao is null)
    into v_total, v_designados, v_sem_etapa
    from public.leads l;

  select jsonb_object_agg(t.tipo, t.id) into v_ids
    from (
      select 'admin' as tipo,
             (select p.id from public.profiles p
               where p.is_active and 'admin' = any (p.papeis)
               order by p.created_at limit 1) as id
      union all
      select 'gestor',
             (select p.id from public.profiles p
               where p.is_active and 'gestor' = any (p.papeis)
                 and not ('admin' = any (p.papeis))
               order by p.created_at limit 1)
      union all
      select 'sdr',
             (select p.id from public.profiles p
               where p.is_active and 'sdr' = any (p.papeis)
                 and not (p.papeis && array['admin', 'gestor'])
               order by p.created_at limit 1)
      union all
      select 'comercial',
             (select p.id from public.profiles p
               where p.is_active and 'comercial' = any (p.papeis)
                 and not (p.papeis && array['admin', 'gestor', 'sdr'])
                 and nullif(btrim(p.full_name), '') is not null
               order by (select count(*) from public.leads l
                          where btrim(l.responsavel) = btrim(p.full_name)) desc,
                        p.created_at
               limit 1)
      union all
      select 'financeiro',
             (select p.id from public.profiles p
               where p.is_active and 'financeiro' = any (p.papeis)
                 and not (p.papeis && array['admin', 'gestor', 'sdr', 'comercial'])
               order by p.created_at limit 1)
      union all
      select 'marketing',
             (select p.id from public.profiles p
               where p.is_active and 'marketing' = any (p.papeis)
                 and not (p.papeis && array['admin', 'gestor', 'sdr', 'comercial'])
               order by p.created_at limit 1)
      union all
      select 'cliente',
             (select p.id from public.profiles p
               where p.is_active and 'cliente' = any (p.papeis)
                 and not public.is_staff(p.id)
               order by p.created_at limit 1)
      union all
      select 'investidor',
             (select p.id from public.profiles p
               where p.is_active and 'investidor' = any (p.papeis)
                 and not public.is_staff(p.id)
               order by p.created_at limit 1)
    ) t;

  if v_ids->>'admin' is null then
    raise exception 'ENSAIO_SEM_ADMIN: não há perfil ativo com papel admin para vestir.';
  end if;

  -- --------------------------------------------------------------------------
  -- As três fases
  -- --------------------------------------------------------------------------
  for v_fase in 1..3 loop
    v_no_escopo := case when v_fase = 3 then not v_por_escopo else v_por_escopo end;
    v_nome_fase := case v_fase
                     when 1 then '1_view_de_hoje'
                     when 2 then '2_view_nova'
                     else '3_view_nova_no_outro_mundo' end
                   || case when v_no_escopo then '__leads_por_escopo' else '__leads_por_is_staff' end;
    if v_fase = 1 then
      v_fase_1 := v_nome_fase;
    end if;

    if v_fase = 2 then
      -- O DDL da migração, igual.
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
    end if;

    if v_fase = 3 and v_no_escopo then
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
    elsif v_fase = 3 then
      drop policy leads_leitura_por_escopo on public.leads;
      create policy leads_leitura_staff on public.leads
        for select to authenticated using (public.is_staff(auth.uid()));
    end if;

    for v_perfil in
      select t.tipo, (v_ids->>t.tipo)::uuid as id, p.papeis, btrim(p.full_name) as nome
        from unnest(array['admin', 'gestor', 'sdr', 'comercial', 'financeiro', 'marketing',
                          'cliente', 'investidor']) with ordinality as t(tipo, ordem)
        left join public.profiles p on p.id = (v_ids->>t.tipo)::uuid
       order by t.ordem
    loop
      if v_perfil.id is null then
        v_medidas := jsonb_set(v_medidas, array[v_nome_fase],
                       coalesce(v_medidas->v_nome_fase, '{}'::jsonb)
                       || jsonb_build_object(v_perfil.tipo, 'não há perfil ativo desse tipo'));
        continue;
      end if;
      v_da_equipe := v_perfil.tipo not in ('cliente', 'investidor');

      -- O que a RLS de `leads` desta fase manda, ainda na pele do dono.
      v_esperado := case
                      when not v_da_equipe then 0
                      when not v_no_escopo then v_total
                      when v_perfil.tipo = 'admin' then v_total
                      when v_perfil.tipo in ('gestor', 'sdr') then v_designados
                      when v_perfil.tipo = 'comercial' then (select count(*) from public.leads l
                                                              where btrim(l.responsavel) = v_perfil.nome)
                      else 0
                    end;

      perform set_config('request.jwt.claims',
                         json_build_object('sub', v_perfil.id, 'role', 'authenticated')::text, true);
      set local role authenticated;
      begin
        select count(*) filter (where a.origem = 'lead'),
               count(*) filter (where a.origem = 'lead'
                                  and (a.especialidade is not null or a.observacoes is not null)),
               count(*) filter (where a.origem <> 'lead')
          into v_pessoas, v_comercial, v_outras
          from public.agenda_de_pessoas a;
        select count(*) into v_leads from public.leads;
        v_erro := null;
      exception when others then
        v_pessoas := null; v_comercial := null; v_outras := null; v_leads := null;
        v_erro := 'erro ' || sqlstate || ': ' || sqlerrm;
      end;
      -- De volta ao papel de quem roda o ensaio, com ou sem erro.
      reset role;
      perform set_config('request.jwt.claims', '', true);

      v_confere :=
            v_erro is null
        and v_leads = v_esperado
        and case
              -- A view antiga segue a RLS de `leads`.
              when v_fase = 1 and v_estado = 'a da 20260828160000' then v_pessoas = v_leads
              -- A nova: a equipe vê todas as pessoas; quem não é da equipe, nenhuma.
              when v_da_equipe then v_pessoas = v_total
              else v_pessoas = 0
            end
        -- A parte comercial acompanha o lead. (Lead sem etapa, interesse e
        -- observações não tem o que mostrar: só aí pode ser menor.)
        and v_comercial <= v_leads
        and (v_sem_etapa > 0 or v_comercial = v_leads)
        -- As outras origens não mudam de uma fase para outra.
        and v_outras is not distinct from
            coalesce((v_medidas #>> array[v_fase_1, v_perfil.tipo, 'outras_origens'])::bigint, v_outras);
      v_ok := v_ok and v_confere;

      v_linha := jsonb_strip_nulls(jsonb_build_object(
        'perfil',          v_perfil.id,
        'papeis',          to_jsonb(v_perfil.papeis),
        'pessoas_de_lead', v_pessoas,
        'com_comercial',   v_comercial,
        'outras_origens',  v_outras,
        'leads_que_ve',    v_leads,
        'leads_esperado',  v_esperado,
        'confere',         v_confere,
        'erro',            v_erro));
      v_medidas := jsonb_set(v_medidas, array[v_nome_fase],
                     coalesce(v_medidas->v_nome_fase, '{}'::jsonb)
                     || jsonb_build_object(v_perfil.tipo, v_linha));
    end loop;
  end loop;

  -- Com `leads` por `is_staff` hoje, aplicar a migração não muda número nenhum.
  if not v_por_escopo and v_estado = 'a da 20260828160000' then
    v_confere := (
      select coalesce(bool_and(
               (a.valor - 'confere') is not distinct from
               ((v_medidas->'2_view_nova__leads_por_is_staff'->a.tipo) - 'confere')), true)
        from jsonb_each(v_medidas->'1_view_de_hoje__leads_por_is_staff') as a(tipo, valor));
    v_ok := v_ok and v_confere;
  else
    v_confere := null;
  end if;

  -- --------------------------------------------------------------------------
  -- O resumo — e o desfazer
  -- --------------------------------------------------------------------------
  reset role;
  v_resumo := jsonb_build_object(
    'tudo_confere',   v_ok,
    'view_encontrada', v_estado,
    'mundo_de_hoje',  case when v_por_escopo then 'leads por escopo (20261003130000 aplicada)'
                           else 'leads por is_staff (20261003130000 ainda não aplicada)' end,
    'aplicar_hoje_nao_muda_nada', v_confere,
    'leads', jsonb_build_object(
      'total',           v_total,
      'com_responsavel', v_designados,
      'sem_responsavel', v_total - v_designados,
      'sem_etapa',       v_sem_etapa),
    'policies_de_leads_antes_do_ensaio', v_politicas,
    'fases',          v_medidas
  );

  raise exception 'ENSAIO_DESFEITO %', v_resumo::text;
exception
  when lock_not_available then
    raise exception
      'TRAVA OCUPADA: public.leads está presa por outra transação há mais de 3s. '
      'Tente de novo em instantes; nada foi aplicado.';
end $$;
