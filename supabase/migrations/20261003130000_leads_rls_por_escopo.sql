-- ============================================================================
-- A RLS de `leads` passa a ser o escopo — o que o painel já impõe, no banco
-- ============================================================================
-- Regra do dono em 2026-10-03 (`src/lib/escopoDeLeads.ts`):
--
--   · Administrador ... todos os leads, inclusive os sem responsável.
--   · Gestor e SDR .... os que já têm responsável.
--   · Comercial ....... só os dele (`responsavel` = o `full_name` de quem
--                       está logado, os dois aparados).
--   · Marketing, Financeiro, cliente da Garagem, investidor: nenhum.
--   · Multi-papel soma: vale o escopo mais largo (admin > gestor/sdr >
--     comercial). Perfil desativado: nenhum.
--
-- Até aqui a regra só valia nas rotas. A RLS de `leads` era `is_staff`
-- (20260828120000): qualquer sessão de painel lia a tabela inteira direto no
-- PostgREST, sem passar pela rota — o próprio cabeçalho de `escopoDeLeads.ts`
-- registra o furo.
--
-- ---------------------------------------------------------------------------
-- O desenho
-- ---------------------------------------------------------------------------
-- Três funções SECURITY DEFINER, `stable`, `search_path = ''`, que leem
-- `profiles` sem recursão de RLS — o mesmo motivo de `is_staff`/`tem_papel`,
-- e a mesma fonte: `profiles.papeis` e `is_active`. O `role` legado não entra;
-- nenhuma régua do banco o lê desde 20260819150000.
--
--   escopo_de_leads() ............ 'todos' | 'designados' | 'meus' | 'nenhum'
--   meu_nome_de_responsavel() .... o `full_name` aparado da sessão, ou NULL
--   recebe_lead_pelo_nome(text) .. o nome é de alguém do Comercial ativo?
--                                  (a régua de `recebeLead` e do rodízio)
--
-- As policies chamam as duas primeiras em `(select …)`: o Postgres avalia uma
-- vez por comando, e não uma vez por linha.
--
--   SELECT  o escopo.
--   UPDATE  using = o escopo; with check:
--             admin ......... qualquer coisa;
--             gestor e sdr .. o lead continua COM responsável, e, se o
--                             responsável mudou neste comando, o novo é do
--                             Comercial ativo;
--             comercial ..... o lead continua dele, ou foi passado a alguém do
--                             Comercial ativo.
--           Ninguém além do admin deixa um lead sem responsável (decisão do
--           dono, 03/10 — `podeRemoverResponsavel`).
--   DELETE  só admin (LGPD art. 18, VI — era `is_staff`; a rota já era admin).
--   INSERT  segue SEM policy, como desde 20260807210000: quem grava lead é o
--           servidor com a chave de serviço (`/api/leads`, `/api/avaliacao`,
--           o webhook do Chatwoot). Nada novo se abre.
--
-- A chave de serviço ignora RLS: webhooks, rodízio (`montar_fila_do_funil`,
-- chamado pela rota com a chave de serviço) e cron seguem como estão.
--
-- ---------------------------------------------------------------------------
-- A passagem do vendedor, e por que a policy de LEITURA tem um ramo a mais
-- ---------------------------------------------------------------------------
-- O PATCH de `/api/leads/gerenciar` deixa quem não é admin passar o lead que
-- enxerga a alguém do Comercial ativo (`recusaDeResponsavel`), e é o que o
-- with check acima espelha. Só que, num UPDATE com WHERE, o Postgres exige que
-- a linha NOVA também passe pela policy de SELECT — e o lead que o vendedor
-- acabou de passar ao colega não é mais "dele". Sem mais nada, toda passagem
-- feita por vendedor morreria em 42501 ("new row violates row-level security
-- policy"), e a tela mostraria erro 500.
--
-- O ramo: o Comercial enxerga o lead cujo `responsavel_anterior` é ele E cujo
-- `responsavel_desde` é `now()`. Quem carimba as duas colunas é o gatilho
-- `trg_leads_antes_de_atualizar` (20260923150000), na troca de responsável;
-- `now()` é o instante da TRANSAÇÃO. Ou seja: o lead fica visível a quem o
-- passou só dentro da transação que o passou — o tempo de o UPDATE terminar.
-- Na requisição seguinte `now()` é outro, e o lead sumiu para ele. O mesmo
-- carimbo é o que diz ao with check de gestor/sdr que o responsável MUDOU.
--
-- O que a RLS NÃO repete da rota: o admin, na rota, também só entrega lead ao
-- Comercial ativo; aqui o admin grava qualquer coisa. A rota segue valendo.
--
-- ---------------------------------------------------------------------------
-- O que NÃO muda aqui, e fica aberto a toda a equipe (decisão à parte)
-- ---------------------------------------------------------------------------
--   · `leads_eventos` (rastro), `leads_interacoes` e `atendimentos`: SELECT por
--     `is_staff`. Quem não vê o lead ainda lê o rastro, as anotações e a
--     conversa dele por essas tabelas.
--   · `registrar_contato_do_lead`, `registrar_interacao_do_lead` e
--     `registrar_etiquetas_do_lead` são SECURITY DEFINER com guarda de equipe:
--     continuam alcançando qualquer lead pelo id.
--   · A view `agenda_de_pessoas` NÃO encolhe: desde a 20261005150000 (aplicar
--     ANTES desta) a pessoa de origem lead — nome, telefone, e-mail — é lida
--     por toda a equipe ativa, por `pessoas_dos_leads()`; só a etapa e as
--     observações passam a seguir o escopo de quem pergunta.
--   · A view `saude_da_atribuicao_dos_leads` é `security_invoker`: passa a
--     devolver só o que o escopo de quem pergunta alcança.
--     Nenhuma linha de view muda aqui.
--
-- ⚠️ ORDEM DE APLICAÇÃO. Depois do deploy das rotas que já filtram por escopo
-- (PR de 03/10). E antes de aplicar, ler a lista de leituras agregadas que
-- encolhem (relatório do funil, leads por campanha, leads por veículo, a
-- contagem do Marketing no kanban): elas leem `leads` com a sessão de quem
-- abriu a tela, e passam a contar só o escopo dela.
--
-- ⚠️ DESFAZER (devolve a régua de 20260828120000; as funções podem ficar):
--
--   begin;
--   drop policy if exists leads_leitura_por_escopo     on public.leads;
--   drop policy if exists leads_atualizacao_por_escopo on public.leads;
--   drop policy if exists leads_exclusao_admin         on public.leads;
--   create policy leads_leitura_staff on public.leads
--     for select to authenticated using (public.is_staff(auth.uid()));
--   create policy leads_atualizacao_staff on public.leads
--     for update to authenticated
--     using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
--   create policy leads_exclusao_staff on public.leads
--     for delete to authenticated using (public.is_staff(auth.uid()));
--   commit;
--
-- Aditiva no schema (nenhuma coluna, nenhum dado), idempotente e de uma
-- transação só: entre o `drop` e o `create` a tabela fica sem policy, que é
-- falha fechada — mas só se ninguém enxergar o intervalo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ---------------------------------------------------------------------------
-- Policies são permissivas e somam por OU: uma policy desconhecida em `leads`
-- continuaria abrindo a tabela por baixo das novas, em silêncio. Em vez de
-- apagar o que não se conhece, parar.
do $previa$
declare
  v_estranhas text;
begin
  select string_agg(policyname, ', ') into v_estranhas
    from pg_policies
   where schemaname = 'public' and tablename = 'leads'
     and policyname not in (
       'leads_leitura', 'leads_atualizacao', 'leads_exclusao',
       'leads_leitura_staff', 'leads_atualizacao_staff', 'leads_exclusao_staff',
       'leads_leitura_por_escopo', 'leads_atualizacao_por_escopo', 'leads_exclusao_admin');
  if v_estranhas is not null then
    raise exception
      'DIVERGÊNCIA: public.leads tem policy que o repositório não conhece (%). '
      'Policies somam por OU: ela manteria aberto o que este arquivo fecha. '
      'Leia a definição dela e decida antes de aplicar.', v_estranhas;
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'leads'
         and column_name in ('responsavel', 'responsavel_desde', 'responsavel_anterior')) <> 3
     or not exists (select 1 from pg_trigger
                     where tgrelid = 'public.leads'::regclass
                       and tgname = 'trg_leads_antes_de_atualizar' and not tgisinternal) then
    raise exception
      'DIVERGÊNCIA: faltam em public.leads as colunas responsavel_desde/'
      'responsavel_anterior ou o gatilho trg_leads_antes_de_atualizar '
      '(20260828120000/20260923150000). A passagem do vendedor depende deles.';
  end if;
end $previa$;

-- ---------------------------------------------------------------------------
-- 1. As três réguas
-- ---------------------------------------------------------------------------
create or replace function public.escopo_de_leads()
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

comment on function public.escopo_de_leads() is
  'Quais leads a sessão enxerga: todos (admin), designados (gestor, sdr — os '
  'que têm responsável), meus (comercial) ou nenhum. Espelha escopoDeLeads de '
  'src/lib/escopoDeLeads.ts. Lê profiles.papeis de perfil ativo; sem sessão, '
  'sem perfil ou perfil desativado é nenhum. A régua da RLS de leads desde '
  '20261003130000.';

create or replace function public.meu_nome_de_responsavel()
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

comment on function public.meu_nome_de_responsavel() is
  'O full_name aparado do perfil ativo da sessão — o texto que leads.responsavel '
  'guarda quando o lead é dela. NULL sem sessão, sem perfil ativo ou sem nome: '
  'quem não tem nome não tem lead "seu".';

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
          and nullif(btrim(c.full_name), '') = btrim(p_nome)
     );
$fn$;

comment on function public.recebe_lead_pelo_nome(text) is
  'O nome é de alguém do Comercial ativo? A régua de recebeLead '
  '(src/lib/permissoes.ts), do rodízio e do crédito do SDR, para o with check '
  'da RLS de leads: é a quem um lead pode ser passado.';

-- No Supabase, função nova em `public` nasce com EXECUTE para anon e
-- authenticated pelos default privileges — o revoke de PUBLIC sozinho não tira.
revoke all on function public.escopo_de_leads()            from public, anon;
revoke all on function public.meu_nome_de_responsavel()    from public, anon;
revoke all on function public.recebe_lead_pelo_nome(text)  from public, anon;
grant execute on function public.escopo_de_leads()           to authenticated, service_role;
grant execute on function public.meu_nome_de_responsavel()   to authenticated, service_role;
grant execute on function public.recebe_lead_pelo_nome(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. As policies
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;

drop policy if exists leads_leitura            on public.leads;
drop policy if exists leads_atualizacao        on public.leads;
drop policy if exists leads_exclusao           on public.leads;
drop policy if exists leads_leitura_staff      on public.leads;
drop policy if exists leads_atualizacao_staff  on public.leads;
drop policy if exists leads_exclusao_staff     on public.leads;
drop policy if exists leads_leitura_por_escopo     on public.leads;
drop policy if exists leads_atualizacao_por_escopo on public.leads;
drop policy if exists leads_exclusao_admin         on public.leads;

-- O `coalesce(…, false)` é só para o NULO nunca ser lido como "talvez": numa
-- policy ele já nega, e assim fica escrito.
create policy leads_leitura_por_escopo on public.leads
  for select to authenticated
  using (
    coalesce(
      case (select public.escopo_de_leads())
        when 'todos'      then true
        when 'designados' then btrim(coalesce(responsavel, '')) <> ''
        when 'meus'       then
             btrim(responsavel) = (select public.meu_nome_de_responsavel())
             -- O lead que ELE acabou de passar adiante, e só dentro da
             -- transação da passagem (ver o cabeçalho).
          or (    responsavel_desde = now()
              and btrim(responsavel_anterior) = (select public.meu_nome_de_responsavel())
              and btrim(coalesce(responsavel, '')) <> '')
        else false
      end,
      false)
  );

create policy leads_atualizacao_por_escopo on public.leads
  for update to authenticated
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
        -- Comercial ativo. O nome antigo de quem saiu da loja pode FICAR.
        when 'designados' then
              btrim(coalesce(responsavel, '')) <> ''
          and (responsavel_desde is distinct from now()
               or public.recebe_lead_pelo_nome(responsavel))
        -- Continua dele, ou foi passado a alguém do Comercial ativo.
        when 'meus'       then
              btrim(responsavel) = (select public.meu_nome_de_responsavel())
           or public.recebe_lead_pelo_nome(responsavel)
        else false
      end,
      false)
  );

create policy leads_exclusao_admin on public.leads
  for delete to authenticated
  using ((select public.escopo_de_leads()) = 'todos');

comment on policy leads_leitura_por_escopo on public.leads is
  'Admin lê todos; gestor e sdr, os que têm responsável; comercial, os dele '
  '(e o que acabou de passar, só na transação da passagem). 20261003130000.';
comment on policy leads_atualizacao_por_escopo on public.leads is
  'Atualiza quem enxerga. Só o admin deixa lead sem responsável; os demais '
  'passam o lead a alguém do Comercial ativo. 20261003130000.';
comment on policy leads_exclusao_admin on public.leads is
  'Eliminação a pedido do titular (LGPD art. 18, VI): só o admin.';


-- ============================================================================
-- Aceite — a violação tem de falhar
-- ============================================================================
-- Estrutura, e depois efeito numa sonda desfeita pelo sentinela: onze perfis,
-- cinco leads, e cada caso é um comando rodado na pele de alguém, com o
-- resultado esperado ao lado. `vê:N` é contagem lida, `linhas:N` é quantas
-- linhas o comando alcançou, `barrado` é 42501.
--
-- A transação da migração é uma só, então `now()` não anda: o carimbo da
-- passagem é envelhecido à mão (caso "dono") para provar que, na transação
-- seguinte, quem passou o lead deixou de vê-lo.
do $aceite$
declare
  falhas     int := 0;
  v_txt      text;
  v_n        bigint;
  v_total    bigint;
  v_rastro   bigint;
  v_res      text;
  v_caso     record;
  v_casos    jsonb;
  v_falhou   text[] := array[]::text[];
  v_rodados  int := 0;
  u          jsonb := '{}'::jsonb;   -- apelido → id do usuário
  l          uuid[];                 -- os cinco leads
  q          text;
  v_id       uuid;
begin
  -- Estrutura ---------------------------------------------------------------
  select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, '+'), ' ' order by policyname)
    into v_txt
    from pg_policies where schemaname = 'public' and tablename = 'leads';
  if v_txt is distinct from
     'leads_atualizacao_por_escopo:UPDATE:authenticated leads_exclusao_admin:DELETE:authenticated leads_leitura_por_escopo:SELECT:authenticated' then
    falhas := falhas + 1;
    raise warning 'FALHOU: as policies de leads não são as três do escopo: %', v_txt;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.leads'::regclass) then
    falhas := falhas + 1;
    raise warning 'FALHOU: RLS desligada em leads';
  end if;

  for v_caso in
    select p.oid::regprocedure as f, p.prosecdef, p.provolatile, p.proconfig
      from pg_proc p
     where p.oid in ('public.escopo_de_leads()'::regprocedure,
                     'public.meu_nome_de_responsavel()'::regprocedure,
                     'public.recebe_lead_pelo_nome(text)'::regprocedure)
  loop
    if not v_caso.prosecdef or v_caso.provolatile <> 's'
       or v_caso.proconfig is distinct from array['search_path=""'] then
      falhas := falhas + 1;
      raise warning 'FALHOU: % não é SECURITY DEFINER, stable, com search_path vazio', v_caso.f;
    end if;
    if has_function_privilege('anon', v_caso.f, 'execute')
       or not has_function_privilege('authenticated', v_caso.f, 'execute') then
      falhas := falhas + 1;
      raise warning 'FALHOU: EXECUTE de % — anon não pode, authenticated precisa', v_caso.f;
    end if;
  end loop;

  -- Efeito — tudo daqui até o sentinela é desfeito ---------------------------
  begin
    foreach q in array array['admin', 'gestor', 'sdr', 'coma', 'comb', 'duplo', 'mkt', 'fin',
                             'cli', 'inativo', 'semnome'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'aceite-escopo-' || q || '@exemplo.invalido', now(), now())
      returning id into v_id;
      u := u || jsonb_build_object(q, v_id);
    end loop;

    update public.profiles set full_name = 'Aceite Escopo Admin', papeis = array['admin'], role = 'admin', is_active = true
     where id = (u->>'admin')::uuid;
    update public.profiles set full_name = 'Aceite Escopo Gestor', papeis = array['gestor'], role = 'gestor', is_active = true
     where id = (u->>'gestor')::uuid;
    update public.profiles set full_name = 'Aceite Escopo SDR', papeis = array['sdr'], role = 'sdr', is_active = true
     where id = (u->>'sdr')::uuid;
    -- Espaço sobrando no perfil: o rodízio grava o nome aparado no lead.
    update public.profiles set full_name = ' Aceite Escopo Vendedor A ', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'coma')::uuid;
    update public.profiles set full_name = 'Aceite Escopo Vendedor B', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'comb')::uuid;
    -- Comercial E SDR: vale o mais largo, designados.
    update public.profiles set full_name = 'Aceite Escopo Duplo', papeis = array['comercial', 'sdr'], role = 'comercial', is_active = true
     where id = (u->>'duplo')::uuid;
    update public.profiles set full_name = 'Aceite Escopo Marketing', papeis = array['marketing'], role = 'marketing', is_active = true
     where id = (u->>'mkt')::uuid;
    update public.profiles set full_name = 'Aceite Escopo Financeiro', papeis = array['financeiro'], role = 'financeiro', is_active = true
     where id = (u->>'fin')::uuid;
    update public.profiles set full_name = 'Aceite Escopo Cliente', papeis = array['cliente'], role = 'cliente', is_active = true
     where id = (u->>'cli')::uuid;
    -- Saiu da loja: o nome continua no lead 5, e o login não vê mais nada.
    update public.profiles set full_name = 'Aceite Escopo Saiu', papeis = array['admin', 'comercial'], role = 'admin', is_active = false
     where id = (u->>'inativo')::uuid;
    -- Nome vazio (em produção full_name é NOT NULL): não pode casar com o
    -- lead 4, cujo responsável é só espaços.
    update public.profiles set full_name = '', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'semnome')::uuid;

    -- 1 sem responsável · 2 do A · 3 do B · 4 só espaços · 5 de quem saiu
    with novos as (
      insert into public.leads (nome, telefone, interesse, responsavel)
      values ('Aceite Escopo 1', '5541999991001', 'Teste Aceite', null),
             ('Aceite Escopo 2', '5541999991002', 'Teste Aceite', 'Aceite Escopo Vendedor A'),
             ('Aceite Escopo 3', '5541999991003', 'Teste Aceite', 'Aceite Escopo Vendedor B'),
             ('Aceite Escopo 4', '5541999991004', 'Teste Aceite', '   '),
             ('Aceite Escopo 5', '5541999991005', 'Teste Aceite', 'Aceite Escopo Saiu')
      returning id, nome
    )
    select array_agg(id order by nome) into l from novos;

    select count(*) into v_total from public.leads;

    -- Os casos, na ordem. `{sonda}` vira o filtro dos cinco leads; `{1}`…`{5}`,
    -- o id de cada um.
    v_casos := jsonb_build_array(
      -- Leitura ---------------------------------------------------------------
      jsonb_build_array('admin vê os cinco',               'admin',   'select count(*) from public.leads where {sonda}', 'vê:5'),
      jsonb_build_array('admin vê a tabela inteira',       'admin',   'select count(*) from public.leads', 'vê:' || v_total),
      jsonb_build_array('chave de serviço vê a tabela',    '@service_role', 'select count(*) from public.leads', 'vê:' || v_total),
      jsonb_build_array('gestor vê os com responsável',    'gestor',  'select count(*) from public.leads where {sonda}', 'vê:3'),
      jsonb_build_array('sdr vê os com responsável',       'sdr',     'select count(*) from public.leads where {sonda}', 'vê:3'),
      jsonb_build_array('sdr não vê o sem responsável',    'sdr',     'select count(*) from public.leads where id in ({1}, {4})', 'vê:0'),
      jsonb_build_array('comercial+sdr vê os designados',  'duplo',   'select count(*) from public.leads where {sonda}', 'vê:3'),
      jsonb_build_array('vendedor A vê só o dele',         'coma',    'select count(*) from public.leads where {sonda}', 'vê:1'),
      jsonb_build_array('…e é o lead 2',                   'coma',    'select count(*) from public.leads where id = {2}', 'vê:1'),
      jsonb_build_array('vendedor A não vê nada além',     'coma',    'select count(*) from public.leads where id <> {2}', 'vê:0'),
      jsonb_build_array('marketing não vê lead',           'mkt',     'select count(*) from public.leads', 'vê:0'),
      jsonb_build_array('financeiro não vê lead',          'fin',     'select count(*) from public.leads', 'vê:0'),
      jsonb_build_array('cliente não vê lead',             'cli',     'select count(*) from public.leads', 'vê:0'),
      jsonb_build_array('admin desativado não vê lead',    'inativo', 'select count(*) from public.leads', 'vê:0'),
      jsonb_build_array('vendedor sem nome não vê lead',   'semnome', 'select count(*) from public.leads', 'vê:0'),
      jsonb_build_array('anônimo não vê lead',             '@anon',   'select count(*) from public.leads', 'vê:0|barrado'),
      -- Escrita de quem não vê ------------------------------------------------
      jsonb_build_array('marketing não atualiza',          'mkt',     'update public.leads set observacoes = ''x'' where {sonda}', 'linhas:0'),
      jsonb_build_array('financeiro não apaga',            'fin',     'delete from public.leads where {sonda}', 'linhas:0'),
      jsonb_build_array('ninguém logado insere',           'coma',    'insert into public.leads (nome, telefone, interesse, responsavel) values (''Aceite Escopo X'', ''5541999991009'', ''x'', ''Aceite Escopo Vendedor A'')', 'barrado'),
      jsonb_build_array('nem o admin insere',              'admin',   'insert into public.leads (nome, telefone, interesse) values (''Aceite Escopo X'', ''5541999991009'', ''x'')', 'barrado'),
      -- Vendedor --------------------------------------------------------------
      jsonb_build_array('A anota no lead dele',            'coma',    'update public.leads set observacoes = ''ligou'' where id = {2}', 'linhas:1'),
      jsonb_build_array('A não toca no lead do B',         'coma',    'update public.leads set observacoes = ''x'' where id = {3}', 'linhas:0'),
      jsonb_build_array('A não pega o sem responsável',    'coma',    'update public.leads set responsavel = ''Aceite Escopo Vendedor A'' where id = {1}', 'linhas:0'),
      jsonb_build_array('A não tira o responsável (nulo)', 'coma',    'update public.leads set responsavel = null where id = {2}', 'barrado'),
      jsonb_build_array('A não tira o responsável (vazio)','coma',    'update public.leads set responsavel = ''  '' where id = {2}', 'barrado'),
      jsonb_build_array('A não passa a quem saiu',         'coma',    'update public.leads set responsavel = ''Aceite Escopo Saiu'' where id = {2}', 'barrado'),
      jsonb_build_array('A não passa ao SDR',              'coma',    'update public.leads set responsavel = ''Aceite Escopo SDR'' where id = {2}', 'barrado'),
      jsonb_build_array('A não apaga o lead dele',         'coma',    'delete from public.leads where id = {2}', 'linhas:0'),
      jsonb_build_array('A passa o lead ao B',             'coma',    'update public.leads set responsavel = ''Aceite Escopo Vendedor B'' where id = {2}', 'linhas:1'),
      jsonb_build_array('(a transação seguinte)',          '@dono',   'update public.leads set responsavel_desde = now() - interval ''1 minute'' where id = {2}', 'linhas:1'),
      jsonb_build_array('…e A deixa de ver o lead',        'coma',    'select count(*) from public.leads where {sonda}', 'vê:0'),
      jsonb_build_array('…e não o pega de volta',          'coma',    'update public.leads set responsavel = ''Aceite Escopo Vendedor A'' where id = {2}', 'linhas:0'),
      jsonb_build_array('B agora vê dois',                 'comb',    'select count(*) from public.leads where {sonda}', 'vê:2'),
      -- SDR e gestor ----------------------------------------------------------
      jsonb_build_array('sdr não tira o responsável',      'sdr',     'update public.leads set responsavel = null where id = {3}', 'barrado'),
      jsonb_build_array('gestor não tira o responsável',   'gestor',  'update public.leads set responsavel = '''' where id = {3}', 'barrado'),
      jsonb_build_array('sdr não passa a nome de ninguém', 'sdr',     'update public.leads set responsavel = ''Aceite Escopo Ninguém'' where id = {3}', 'barrado'),
      jsonb_build_array('sdr não pega o sem responsável',  'sdr',     'update public.leads set responsavel = ''Aceite Escopo Vendedor A'' where id = {1}', 'linhas:0'),
      jsonb_build_array('sdr passa o lead ao A',           'sdr',     'update public.leads set responsavel = ''Aceite Escopo Vendedor A'' where id = {3}', 'linhas:1'),
      jsonb_build_array('sdr anota no lead de quem saiu',  'sdr',     'update public.leads set observacoes = ''retomar'' where id = {5}', 'linhas:1'),
      jsonb_build_array('sdr não apaga',                   'sdr',     'delete from public.leads where {sonda}', 'linhas:0'),
      jsonb_build_array('gestor não apaga',                'gestor',  'delete from public.leads where {sonda}', 'linhas:0'),
      -- Admin -----------------------------------------------------------------
      jsonb_build_array('admin tira o responsável',        'admin',   'update public.leads set responsavel = null where id = {3}', 'linhas:1'),
      jsonb_build_array('admin distribui o lead novo',     'admin',   'update public.leads set responsavel = ''Aceite Escopo Vendedor B'' where id = {1}', 'linhas:1'),
      jsonb_build_array('admin apaga',                     'admin',   'delete from public.leads where id = {5}', 'linhas:1')
    );

    for v_caso in
      select c.ordem, c.caso->>0 as rotulo, c.caso->>1 as quem, c.caso->>2 as comando, c.caso->>3 as esperado
        from jsonb_array_elements(v_casos) with ordinality as c(caso, ordem)
       order by c.ordem
    loop
      q := replace(v_caso.comando, '{sonda}', format('id = any (%L::uuid[])', l));
      for i in 1..5 loop
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
        if q like 'select %' then
          execute q into v_n;
          v_res := 'vê:' || v_n;
        else
          execute q;
          get diagnostics v_n = row_count;
          v_res := 'linhas:' || v_n;
        end if;
      exception when insufficient_privilege then
        v_res := 'barrado';
      end;

      reset role;
      perform set_config('request.jwt.claims', '', true);

      v_rodados := v_rodados + 1;
      if not (v_res = any (string_to_array(v_caso.esperado, '|'))) then
        v_falhou := v_falhou || format('%s: esperava %s, veio %s', v_caso.rotulo, v_caso.esperado, v_res);
      end if;
    end loop;

    -- Os gatilhos seguem de pé na pele do usuário: a passagem do A e a do SDR
    -- deixaram rastro, e o carimbo de quem tinha o lead ficou.
    select count(*) into v_rastro from public.leads_eventos
     where lead_id in (l[2], l[3]) and tipo = 'responsavel' and not automatico;
    select responsavel_anterior into v_txt from public.leads where id = l[2];

    raise exception 'SENTINELA_DO_ACEITE';
  exception
    when others then
      if sqlerrm <> 'SENTINELA_DO_ACEITE' then
        raise;
      end if;
  end;

  if v_rodados <> 44 then
    falhas := falhas + 1;
    raise warning 'FALHOU: rodaram % casos, e não os 44', v_rodados;
  end if;
  if cardinality(v_falhou) > 0 then
    falhas := falhas + cardinality(v_falhou);
    foreach q in array v_falhou loop
      raise warning 'FALHOU: %', q;
    end loop;
  end if;
  -- Três trocas feitas por gente: A→B no lead 2; SDR→A e admin→nulo no lead 3.
  if v_rastro is distinct from 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o rastro das trocas de responsável tem % linha(s), e não 3', v_rastro;
  end if;
  if v_txt is distinct from 'Aceite Escopo Vendedor A' then
    falhas := falhas + 1;
    raise warning 'FALHOU: responsavel_anterior do lead passado é %, e não o vendedor A', v_txt;
  end if;
  if exists (select 1 from auth.users where email like 'aceite-escopo-%@exemplo.invalido')
     or exists (select 1 from public.leads where nome like 'Aceite Escopo %') then
    falhas := falhas + 1;
    raise warning 'FALHOU: a sonda do aceite não foi desfeita';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na RLS de leads por escopo', falhas;
  end if;
  raise notice 'Aceite verificado: admin lê e grava todos os leads; gestor e sdr, os que têm responsável; comercial, só os dele; marketing, financeiro, cliente, inativo e anônimo, nenhum. Só o admin tira o responsável e apaga; quem passa lead passa ao Comercial ativo; ninguém logado insere; os gatilhos do rastro seguem de pé (% casos).', v_rodados;
end $aceite$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20261003130000', 'leads_rls_por_escopo')
  on conflict (version) do nothing;
