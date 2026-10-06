-- ============================================================================
-- O funil do Garagem Profiler, contado por dia, sem identificador (2026-10-06)
-- ============================================================================
--
-- O Garagem Profiler (`/carro-perfeito`, src/components/CarMatch.tsx) não
-- gerou nenhum lead de 25/09 a 06/10, e hoje não há como dizer se pouca gente
-- abre o quiz ou se as pessoas desistem numa pergunta. O GA4 recebe
-- `profiler_step`, mas perde quem recusou o rastreamento e só separa os passos
-- com dimensão personalizada, que não vale para trás. A spec
-- docs/superpowers/specs/2026-09-25-garagem-profiler-tres-do-patio-design.md
-- (fase 2, tabela de fases) previa um "contador diário do funil, sem
-- identificador", e o dono disse "Sim" ao contador em 06/10.
--
-- ---------------------------------------------------------------------------
-- O que a tabela guarda, e o que ela não guarda
-- ---------------------------------------------------------------------------
-- Uma linha por (org, dia, passo), com quantas vezes o passo foi contado
-- naquele dia. Não há ag_uid, IP, sessão, user agent, página de origem nem
-- horário nenhum além do dia: o dado é agregado já na escrita, e não há como
-- desagregar o que nunca foi gravado.
--
--   intro ........ abriu a página
--   q1 ........... começou o quiz (q2 a q5: chegou a cada pergunta)
--   results ...... viu o resultado
--   por_mes ...... confirmou a aba POR MÊS
--   lead_carros .. lead enviado e aceito pela rota, no modo dos três carros
--   lead_aviso ... idem, no ME AVISE
--   lead_ajuda ... idem, no pedido de ajuda
--
-- É a mesma lista de `PASSOS_DO_FUNIL` (src/lib/funilDoProfiler.ts), que a
-- rota usa para recusar o corpo antes de chamar o banco. Quem conta uma vez
-- por rodada do quiz é o navegador (`criarContadorDaRodada`); o banco só soma.
--
-- Quem recusou o rastreamento em /privacidade também conta. Era o item 8 das
-- "Decisões do dono" na spec, e o dono decidiu em 06/10: "inclua tudo". Isso
-- só é possível porque a tabela não guarda identificador nenhum: não há
-- ninguém a rastrear, só um número por passo por dia. A /privacidade passa a
-- dizer que essa contagem anônima continua mesmo com a medição desligada. É
-- aqui que o contador vê quem o GA4 perde.
--
--   * `dia` é o dia em America/Sao_Paulo, calculado pela função. O servidor
--     do Supabase roda em UTC: com `current_date`, toda visita das 21h à
--     meia-noite cairia no dia seguinte, e o funil da noite de sexta
--     apareceria no sábado.
--   * Não há `atualizado_em`, de propósito. Com tráfego baixo, o instante do
--     último incremento coincidiria com o `created_at` do lead (nos
--     `lead_*`) ou daria a hora da última visita do dia (no `intro`): seria
--     horário além do dia, que é o que a tabela promete não ter.
--
-- Não é tabela de parâmetro (não há valor vigente a encerrar) nem de evento:
-- a contagem sofre UPDATE por desenho. O append-only da regra do projeto é
-- para `veiculo_eventos` e `partidas`. Aqui, uma linha por passo com o seu
-- horário seria justamente o rastro que se quer evitar. Sem prazo de
-- retenção: não há dado pessoal.
--
-- ---------------------------------------------------------------------------
-- A regra de negócio mora em CHECK nomeado
-- ---------------------------------------------------------------------------
--   profiler_funil_diario_passo_valido ......... a lista fechada acima
--   profiler_funil_diario_contagem_nao_negativa  contagem >= 0
--   profiler_funil_diario_pkey ................. (org_id, dia, passo): uma
--                                                linha por passo por dia, e é
--                                                ela que o upsert usa
--
-- ---------------------------------------------------------------------------
-- Uma porta de escrita só, e só do servidor
-- ---------------------------------------------------------------------------
-- `profiler_contar_passo(p_passo)`, SECURITY DEFINER: confere o passo
-- (fora da lista é 22023, com mensagem legível) e faz
-- `insert ... on conflict (org_id, dia, passo) do update set contagem =
-- contagem + 1`, atômico sob concorrência. Duas visitas ao mesmo tempo somam
-- 2, não 1, e não estouram a chave. Só `service_role` executa: quem chama é
-- a rota `/api/profiler/passo`, no servidor, com a chave de serviço. O
-- navegador nunca chama a função nem escreve na tabela.
--
-- Leitura: staff pelo painel (RLS na forma de `nucleo_staff_le`). `anon` não
-- tem nada. `authenticated` só lê: sem INSERT/UPDATE/DELETE/TRUNCATE nem
-- policy de escrita, e tentar direto é 42501, não "0 linhas" calado (O1 da
-- f0m).
--
-- ---------------------------------------------------------------------------
-- O código tolera esta migração ainda não aplicada
-- ---------------------------------------------------------------------------
-- A rota `/api/profiler/passo` responde 204 mesmo quando o `rpc` falha e só
-- registra um aviso no log: contagem perdida não vira erro para quem está
-- escolhendo carro. Um deploy de código antes do banco não quebra nada.
-- Aplicar esta migração é o que começa a contar.
--
-- Aditiva e idempotente: tabela `if not exists`, função `create or replace`,
-- policy só se não existir, revoke/grant e comment reaplicáveis. Nenhum
-- DROP/RENAME/ALTER TYPE. `estoque_motors` intocada (F2).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A tabela
-- ----------------------------------------------------------------------------
create table if not exists public.profiler_funil_diario (
  org_id         uuid        not null default public.org_padrao(),
  dia            date        not null,
  passo          text        not null,
  contagem       integer     not null default 0,

  constraint profiler_funil_diario_pkey primary key (org_id, dia, passo),
  constraint profiler_funil_diario_passo_valido check (
    passo in ('intro', 'q1', 'q2', 'q3', 'q4', 'q5', 'results',
              'por_mes', 'lead_carros', 'lead_aviso', 'lead_ajuda')),
  constraint profiler_funil_diario_contagem_nao_negativa check (
    contagem >= 0)
);


-- ----------------------------------------------------------------------------
-- 2. Quem lê e quem escreve
-- ----------------------------------------------------------------------------
alter table public.profiler_funil_diario enable row level security;

-- Staff lê (o funil no painel). Nenhuma policy de escrita: a única escrita é
-- a função abaixo, que roda como dono.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename  = 'profiler_funil_diario'
                    and policyname = 'nucleo_staff_le') then
    create policy nucleo_staff_le on public.profiler_funil_diario
      for select to authenticated
      using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
  end if;
end $$;

-- O default ACL do Supabase concede tudo a anon/authenticated/service_role
-- (f0l); o que não se quer, sai por nome. REFERENCES e TRIGGER saem junto:
-- `authenticated` fica só com SELECT, e não com SELECT e mais dois resíduos.
revoke all on public.profiler_funil_diario from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.profiler_funil_diario from authenticated;
-- A leitura, dita em voz alta em vez de herdada do default ACL: o painel
-- (recortado pela RLS) e o servidor (chave de serviço).
grant select on public.profiler_funil_diario to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. A porta de escrita: soma 1 ao passo, no dia de hoje em São Paulo
-- ----------------------------------------------------------------------------
-- A lista repete a do CHECK de propósito: o CHECK é a regra, e esta conferência
-- existe para dar a mensagem. O aceite prova que as duas aceitam os mesmos
-- onze passos, e que nenhuma outra grafia passa.
create or replace function public.profiler_contar_passo(p_passo text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_passo is null
     or p_passo not in ('intro', 'q1', 'q2', 'q3', 'q4', 'q5', 'results',
                        'por_mes', 'lead_carros', 'lead_aviso', 'lead_ajuda') then
    raise exception 'Passo do funil do Garagem Profiler fora da lista: %. Nada foi contado. Os passos são intro, q1 a q5, results, por_mes, lead_carros, lead_aviso e lead_ajuda.',
      coalesce(quote_literal(left(p_passo, 40)), 'nulo')
      using errcode = '22023';
  end if;

  insert into public.profiler_funil_diario as f
    (org_id, dia, passo, contagem)
  values
    (public.org_padrao(), (now() at time zone 'America/Sao_Paulo')::date,
     p_passo, 1)
  on conflict (org_id, dia, passo) do update
    set contagem = f.contagem + 1;
end;
$fn$;

revoke all on function public.profiler_contar_passo(text) from public, anon, authenticated;
grant execute on function public.profiler_contar_passo(text) to service_role;


-- ----------------------------------------------------------------------------
-- 4. Para quem abrir o banco sem abrir o código
-- ----------------------------------------------------------------------------
comment on table public.profiler_funil_diario is
  'Funil do Garagem Profiler (/carro-perfeito) contado por dia (2026-10-06): '
  'quantas vezes cada passo foi contado em cada dia de São Paulo. Sem '
  'identificador nenhum (nem ag_uid, nem IP, nem sessão, nem horário além do '
  'dia). A única escrita é profiler_contar_passo, só pela chave de serviço (rota '
  '/api/profiler/passo). Staff lê pela RLS; anon nada; authenticated sem '
  'escrita.';

comment on column public.profiler_funil_diario.dia is
  'Dia em America/Sao_Paulo, calculado pela função a partir de now(). Não é '
  'current_date: o servidor roda em UTC, e a noite de São Paulo cairia no dia '
  'seguinte.';
comment on column public.profiler_funil_diario.passo is
  'intro = abriu a página; q1 = começou o quiz; q2 a q5 = chegou à pergunta; '
  'results = viu o resultado; por_mes = confirmou a aba POR MÊS; lead_carros, '
  'lead_aviso, lead_ajuda = lead enviado e aceito, por modo. Lista fechada '
  '(CHECK profiler_funil_diario_passo_valido), igual a PASSOS_DO_FUNIL em '
  'src/lib/funilDoProfiler.ts.';
comment on column public.profiler_funil_diario.contagem is
  'Quantas vezes o passo foi contado no dia. O navegador conta cada passo uma '
  'vez por rodada do quiz (o REFAZER abre rodada nova, sem recontar intro). '
  'Nunca negativa (CHECK profiler_funil_diario_contagem_nao_negativa).';

comment on function public.profiler_contar_passo(text) is
  'Única escrita de profiler_funil_diario. Passo fora da lista (ou nulo) é '
  'erro 22023 e nada é gravado. Senão, soma 1 à linha (org_padrao(), dia de '
  'hoje em America/Sao_Paulo, passo) com insert ... on conflict do update, '
  'atômico sob concorrência. Não grava horário. Só service_role executa (rota '
  '/api/profiler/passo); o navegador nunca chama direto.';


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. A parte de efeito trava a tabela contra a
-- rota (as contagens comparadas são exatas mesmo com o site no ar), cria um
-- usuário staff de sonda, chama a função vestindo service_role, staff,
-- cliente e anon, tenta escrever direto e tenta violar cada regra. Roda num
-- sub-bloco que termina com um sentinela, e o rollback do sub-bloco leva tudo
-- junto: as contagens, o usuário, o perfil, a trava e qualquer
-- `set local role`/claims/fuso. As variáveis sobrevivem ao rollback (plpgsql
-- não desfaz variável), e é por elas que o veredito sai. Nada fica gravado,
-- nem em produção, nem numa reaplicação. Sem data fixa: o dia é o de `now()`
-- em São Paulo, que não muda dentro da transação.
do $aceite$
declare
  falhas            int := 0;
  v_col             record;
  v_tipo            text;
  v_notnull         boolean;
  v_default         text;
  v_nome            text;
  v_def             text;
  v_regra           text;
  v_msg             text;
  v_estado          text;
  v_caso            record;
  v_base            jsonb;
  v_assinatura      constant text := 'public.profiler_contar_passo(text)';
  v_passos          constant text[] := array['intro', 'q1', 'q2', 'q3', 'q4', 'q5', 'results',
                                             'por_mes', 'lead_carros', 'lead_aviso', 'lead_ajuda'];
  v_passo           text;

  v_hoje            date := (now() at time zone 'America/Sao_Paulo')::date;
  v_zona            text;
  v_retrato_antes   text;
  v_retrato_depois  text;
  v_restou          int;

  -- a sonda
  v_staff           uuid;
  v_cli             uuid := gen_random_uuid();   -- authenticated sem perfil: cliente
  v_antes           jsonb;
  v_meio            jsonb;
  v_depois          jsonb;

  -- o que a sonda viu antes de ser desfeita
  v_dia_do_relogio  date;
  v_q1_delta        int := -1;
  v_intro_delta     int := -1;
  v_outros_delta    int := -1;
  v_linhas_q1       int := -1;
  v_fora_antes      text;
  v_fora_intacto    boolean := false;
  v_onze_ok         int := 0;
  v_onze_recusados  text[] := '{}';
  v_invalidos       int := 0;
  v_invalidos_22023 int := 0;
  v_invalidos_msg   int := 0;
  v_retrato_inval   boolean := false;
  v_casos_recusa    int := 0;
  v_recusas_certas  int := 0;
  v_casos_aceite    int := 0;
  v_aceitos         int := 0;
  v_chave_dupla     text := '<não rodou>';
  v_total_hoje      int := -1;
  v_staff_viu       int := -1;
  v_staff_outra_org int := -1;
  v_servico_viu     int := -1;
  v_cli_viu         int := -1;
  v_anon_le         text := '<não rodou>';
  v_anon_chama      text := '<não rodou>';
  v_staff_chama     text := '<não rodou>';
  v_cli_chama       text := '<não rodou>';
  v_staff_insere    text := '<não rodou>';
  v_staff_atualiza  text := '<não rodou>';
  v_staff_apaga     text := '<não rodou>';
begin
  if current_user in ('authenticated', 'anon', 'service_role') then
    raise exception 'ACEITE INCONCLUSIVO: a migração roda como papel de API (%)', current_user;
  end if;

  -- 1 · As colunas: as quatro, com tipo exato, nulidade e default, e nenhuma
  --     outra. Uma quinta coluna (um uid, um IP, um horário, até um
  --     atualizado_em) seria o identificador que esta tabela promete não ter.
  for v_col in
    select * from (values
      ('org_id',   'uuid',    '%org_padrao()%'),
      ('dia',      'date',    null),
      ('passo',    'text',    null),
      ('contagem', 'integer', '0')
    ) as c(nome, tipo, padrao)
  loop
    select format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
      into v_tipo, v_notnull, v_default
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'public.profiler_funil_diario'::regclass
       and a.attname  = v_col.nome and a.attnum > 0 and not a.attisdropped;
    if v_tipo is distinct from v_col.tipo or v_notnull is distinct from true
       or (v_col.padrao is null and v_default is not null)
       or (v_col.padrao is not null and coalesce(v_default, '') not like v_col.padrao) then
      falhas := falhas + 1;
      raise warning 'FALHOU: profiler_funil_diario.% é "%" (not null = %, default %), esperado "%" not null, default %',
        v_col.nome, coalesce(v_tipo, '<ausente>'), v_notnull, coalesce(v_default, '<nenhum>'),
        v_col.tipo, coalesce(v_col.padrao, '<nenhum>');
    end if;
  end loop;

  select string_agg(attname, ',' order by attnum) into v_def
    from pg_attribute
   where attrelid = 'public.profiler_funil_diario'::regclass and attnum > 0 and not attisdropped;
  if v_def is distinct from 'org_id,dia,passo,contagem' then
    falhas := falhas + 1;
    raise warning 'FALHOU: profiler_funil_diario tem as colunas [%], esperado só org_id,dia,passo,contagem', v_def;
  end if;

  if obj_description('public.profiler_funil_diario'::regclass, 'pg_class') is null
     or obj_description(v_assinatura::regprocedure, 'pg_proc') is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: tabela ou função sem comentário';
  end if;

  -- 2 · A chave e as duas regras: existem com nome, estão validadas e dizem o
  --     que prometem. O texto é comparado porque `create table if not exists`
  --     pula uma tabela que já exista, seja qual for a regra dela.
  for v_caso in
    select * from (values
      ('profiler_funil_diario_pkey', 'p',
       'PRIMARY KEY (org_id, dia, passo)'),
      ('profiler_funil_diario_passo_valido', 'c',
       'CHECK ((passo = ANY (ARRAY[''intro''::text, ''q1''::text, ''q2''::text, ''q3''::text, '
       '''q4''::text, ''q5''::text, ''results''::text, ''por_mes''::text, ''lead_carros''::text, '
       '''lead_aviso''::text, ''lead_ajuda''::text])))'),
      ('profiler_funil_diario_contagem_nao_negativa', 'c',
       'CHECK ((contagem >= 0))')
    ) as c(nome, tipo, def)
  loop
    select pg_get_constraintdef(oid) into v_def
      from pg_constraint
     where conrelid = 'public.profiler_funil_diario'::regclass
       and conname  = v_caso.nome
       and contype  = v_caso.tipo::"char"
       and convalidated;
    if v_def is distinct from v_caso.def then
      falhas := falhas + 1;
      raise warning 'FALHOU: % é "%", esperado "%"',
        v_caso.nome, coalesce(v_def, '<ausente, de outro tipo ou não validada>'), v_caso.def;
    end if;
  end loop;

  -- 3 · RLS ligada e uma policy só: leitura de staff na org.
  if not (select relrowsecurity from pg_class where oid = 'public.profiler_funil_diario'::regclass) then
    falhas := falhas + 1;
    raise warning 'FALHOU: RLS desligada em profiler_funil_diario';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'profiler_funil_diario') <> 1
     or not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'profiler_funil_diario'
                       and policyname = 'nucleo_staff_le' and cmd = 'SELECT'
                       and permissive = 'PERMISSIVE' and roles = array['authenticated']::name[]
                       and qual like '%is_staff(auth.uid())%' and qual like '%org_padrao()%') then
    falhas := falhas + 1;
    raise warning 'FALHOU: as policies de profiler_funil_diario não são só nucleo_staff_le (SELECT, staff, org)';
  end if;

  -- 4 · Privilégio na tabela: anon nada; authenticated só SELECT; o servidor lê.
  foreach v_nome in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege('anon', 'public.profiler_funil_diario', v_nome) then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon tem % em profiler_funil_diario', v_nome;
    end if;
    if v_nome <> 'SELECT' and has_table_privilege('authenticated', 'public.profiler_funil_diario', v_nome) then
      falhas := falhas + 1;
      raise warning 'FALHOU: authenticated tem % em profiler_funil_diario: só SELECT é prometido', v_nome;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.profiler_funil_diario', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiler_funil_diario', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o painel (authenticated) ou o servidor (service_role) não lê profiler_funil_diario';
  end if;

  -- A função: SECURITY DEFINER, search_path fixo, devolve void, e só
  -- service_role executa. `proacl` nulo seria o default do Postgres, que dá
  -- EXECUTE a PUBLIC; por isso ele tem de existir e não citar PUBLIC.
  if not exists (select 1 from pg_proc
                  where oid = v_assinatura::regprocedure
                    and prosecdef
                    and prorettype = 'void'::regtype
                    and 'search_path=public' = any(proconfig)) then
    falhas := falhas + 1;
    raise warning 'FALHOU: profiler_contar_passo não é SECURITY DEFINER, com search_path = public, devolvendo void';
  end if;
  -- O efeito (abaixo) prova que o dia não é o do fuso da sessão. Que não é o
  -- de UTC só se veria das 21h à meia-noite, porque now() não muda dentro da
  -- transação. Por isso, aqui, o texto: o dia sai de America/Sao_Paulo.
  if (select prosrc not like '%(now() at time zone ''America/Sao_Paulo'')::date%'
        from pg_proc where oid = v_assinatura::regprocedure) then
    falhas := falhas + 1;
    raise warning 'FALHOU: profiler_contar_passo não calcula o dia por (now() at time zone ''America/Sao_Paulo'')::date';
  end if;
  if (select proacl is null
             or exists (select 1 from aclexplode(proacl) x
                         where x.grantee = 0 and x.privilege_type = 'EXECUTE')
        from pg_proc where oid = v_assinatura::regprocedure) then
    falhas := falhas + 1;
    raise warning 'FALHOU: PUBLIC executa profiler_contar_passo';
  end if;
  if has_function_privilege('anon', v_assinatura, 'EXECUTE')
     or has_function_privilege('authenticated', v_assinatura, 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon ou authenticated executa profiler_contar_passo: o navegador escreveria no funil';
  end if;
  if not has_function_privilege('service_role', v_assinatura, 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role sem EXECUTE em profiler_contar_passo: a rota não teria como contar';
  end if;

  -- O retrato da tabela inteira, para provar no fim que a sonda não deixou
  -- nada (nem linha nova, nem contagem a mais).
  select md5(coalesce(string_agg(f::text, '|' order by f.org_id, f.dia, f.passo), ''))
    into v_retrato_antes
    from public.profiler_funil_diario f;

  -- Um fuso em que o dia do relógio NÃO é o de São Paulo agora: Kiritimati
  -- (UTC+14) difere a partir das 7h de São Paulo, e Etc/GMT+12 (UTC−12) antes
  -- das 9h. Um dos dois serve a qualquer hora. Com ele na sessão, uma função
  -- que usasse `current_date` gravaria no dia errado, e o aceite veria.
  select z into v_zona
    from unnest(array['Pacific/Kiritimati', 'Etc/GMT+12']) as z
   where (now() at time zone z)::date <> v_hoje
   limit 1;
  if v_zona is null then
    raise exception 'ACEITE INCONCLUSIVO: nenhum fuso de prova tem dia diferente de São Paulo agora (%)', now();
  end if;

  -- 5 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    -- 5a · A rota não soma enquanto a sonda conta: as diferenças medidas são
    --      só as da sonda. A trava sai com o rollback do sub-bloco.
    lock table public.profiler_funil_diario in exclusive mode;

    perform set_config('TimeZone', v_zona, true);
    v_dia_do_relogio := current_date;

    -- O usuário staff de sonda (o gesto da 20260928120000): Marketing, que é
    -- quem lê funil.
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated',
            'aceite-funil-profiler-marketing@exemplo.invalido', now(), now())
    returning id into v_staff;
    update public.profiles
       set full_name = 'Aceite Funil do Profiler', papeis = array['marketing'],
           role = 'marketing', is_active = true
     where id = v_staff;

    -- 5b · O caminho da rota: service_role chama q1 duas vezes e intro uma.
    --      Antes, o retrato de hoje (para as diferenças) e o de todo o resto
    --      (que tem de ficar igual).
    select coalesce(jsonb_object_agg(passo, contagem), '{}') into v_antes
      from public.profiler_funil_diario
     where org_id = public.org_padrao() and dia = v_hoje;
    select md5(coalesce(string_agg(f::text, '|' order by f.org_id, f.dia, f.passo), ''))
      into v_fora_antes
      from public.profiler_funil_diario f
     where f.dia <> v_hoje;

    set local role service_role;
    perform public.profiler_contar_passo('q1');
    perform public.profiler_contar_passo('q1');
    perform public.profiler_contar_passo('intro');
    reset role;

    select coalesce(jsonb_object_agg(passo, contagem), '{}') into v_meio
      from public.profiler_funil_diario
     where org_id = public.org_padrao() and dia = v_hoje;

    v_q1_delta    := coalesce((v_meio->>'q1')::int, 0)    - coalesce((v_antes->>'q1')::int, 0);
    v_intro_delta := coalesce((v_meio->>'intro')::int, 0) - coalesce((v_antes->>'intro')::int, 0);
    select coalesce(sum(abs(coalesce((v_meio->>p)::int, 0) - coalesce((v_antes->>p)::int, 0))), 0)
      into v_outros_delta
      from unnest(v_passos) as p
     where p not in ('q1', 'intro');

    -- Uma linha por passo por dia, e nada mexido fora do dia de São Paulo (o
    -- dia do relógio, neste fuso, é outro: uma função com `current_date`
    -- teria criado ou somado linha lá).
    select count(*) into v_linhas_q1
      from public.profiler_funil_diario
     where org_id = public.org_padrao() and dia = v_hoje and passo = 'q1';
    select md5(coalesce(string_agg(f::text, '|' order by f.org_id, f.dia, f.passo), '')) = v_fora_antes
      into v_fora_intacto
      from public.profiler_funil_diario f
     where f.dia <> v_hoje;

    -- 5c · Os onze passos do CHECK passam pela função, cada um somando 1. Um
    --      que a função recuse é a lista dela divergindo da do CHECK.
    foreach v_passo in array v_passos loop
      begin
        set local role service_role;
        perform public.profiler_contar_passo(v_passo);
        reset role;
      exception when sqlstate '22023' then
        v_onze_recusados := array_append(v_onze_recusados, v_passo);
      end;
    end loop;

    select coalesce(jsonb_object_agg(passo, contagem), '{}') into v_depois
      from public.profiler_funil_diario
     where org_id = public.org_padrao() and dia = v_hoje;
    select count(*) into v_onze_ok
      from unnest(v_passos) as p
     where coalesce((v_depois->>p)::int, 0) = coalesce((v_meio->>p)::int, 0) + 1;

    -- 5d · Passo inválido: 22023 com a mensagem legível, e nenhuma linha.
    --      Nulo, vazio, a pergunta que não existe e as grafias quase certas
    --      (caixa, espaço, prefixo): a lista não normaliza nada.
    select md5(coalesce(string_agg(f::text, '|' order by f.org_id, f.dia, f.passo), ''))
      into v_retrato_depois
      from public.profiler_funil_diario f;
    foreach v_passo in array array['q6', '', null, 'q0', 'Q1', ' q1', 'q1 ', 'INTRO',
                                   'lead_', 'lead_outro', 'resultado', 'q1;intro'] loop
      v_invalidos := v_invalidos + 1;
      begin
        set local role service_role;
        perform public.profiler_contar_passo(v_passo);
        reset role;
        falhas := falhas + 1;
        raise warning 'FALHOU: profiler_contar_passo aceitou o passo %', coalesce(quote_literal(v_passo), 'nulo');
      exception when others then
        get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
        if v_estado = '22023' then
          v_invalidos_22023 := v_invalidos_22023 + 1;
          -- starts_with, e não like: o `_` de 'lead_' seria curinga.
          if starts_with(v_msg, 'Passo do funil do Garagem Profiler fora da lista: '
                                || coalesce(quote_literal(v_passo), 'nulo')
                                || '. Nada foi contado.') then
            v_invalidos_msg := v_invalidos_msg + 1;
          end if;
        else
          falhas := falhas + 1;
          raise warning 'FALHOU: o passo % deu % ("%"), esperado 22023',
            coalesce(quote_literal(v_passo), 'nulo'), v_estado, v_msg;
        end if;
      end;
    end loop;
    v_retrato_inval := v_retrato_depois = (
      select md5(coalesce(string_agg(f::text, '|' order by f.org_id, f.dia, f.passo), ''))
        from public.profiler_funil_diario f);

    -- 5e · Direto, como dono (fora da API): cada regra pelo efeito e pelo
    --      nome. Cada caso num dia próprio, longe de hoje, para a chave não
    --      se meter. Os casos sem regra são a contraprova: o limite passa.
    v_base := jsonb_build_object(
      'org_id',   public.org_padrao(),
      'passo',    'results',
      'contagem', 0);

    for v_caso in
      select * from (values
        ('contagem zero',               '{}'::jsonb,                  null::text),
        ('contagem no teto do integer', '{"contagem": 2147483647}',   null),
        ('contagem -1',                 '{"contagem": -1}',           'profiler_funil_diario_contagem_nao_negativa'),
        ('contagem no piso do integer', '{"contagem": -2147483648}',  'profiler_funil_diario_contagem_nao_negativa'),
        ('passo q6',                    '{"passo": "q6"}',            'profiler_funil_diario_passo_valido'),
        ('passo vazio',                 '{"passo": ""}',              'profiler_funil_diario_passo_valido'),
        ('passo em maiúsculas',         '{"passo": "RESULTS"}',       'profiler_funil_diario_passo_valido'),
        ('passo com espaço',            '{"passo": "results "}',      'profiler_funil_diario_passo_valido'),
        ('passo inventado',             '{"passo": "lead_whatsapp"}', 'profiler_funil_diario_passo_valido')
      ) as c(nome, muda, regra)
    loop
      if v_caso.regra is null then
        v_casos_aceite := v_casos_aceite + 1;
      else
        v_casos_recusa := v_casos_recusa + 1;
      end if;
      -- O dia sai dos dois contadores: um por caso, todos em 1900.
      begin
        insert into public.profiler_funil_diario
        select * from jsonb_populate_record(null::public.profiler_funil_diario,
                        v_base || v_caso.muda
                               || jsonb_build_object('dia', date '1900-01-01'
                                                            + v_casos_aceite * 100 + v_casos_recusa));
        if v_caso.regra is null then
          v_aceitos := v_aceitos + 1;
        else
          falhas := falhas + 1;
          raise warning 'FALHOU: "%" foi aceito, esperado recusa por %', v_caso.nome, v_caso.regra;
        end if;
      exception when check_violation then
        get stacked diagnostics v_regra = constraint_name;
        if v_caso.regra is null then
          falhas := falhas + 1;
          raise warning 'FALHOU: "%" (válido) foi recusado por %', v_caso.nome, v_regra;
        elsif v_regra = v_caso.regra then
          v_recusas_certas := v_recusas_certas + 1;
        else
          falhas := falhas + 1;
          raise warning 'FALHOU: "%" foi recusado por "%", e não por %', v_caso.nome, v_regra, v_caso.regra;
        end if;
      end;
    end loop;

    --      O UPDATE direto também cai na regra: contagem abaixo de zero e
    --      passo trocado por um de fora da lista.
    for v_caso in
      select * from (values
        ('update contagem = -1', 'contagem = -1',  'profiler_funil_diario_contagem_nao_negativa'),
        ('update passo = q6',    'passo = ''q6''', 'profiler_funil_diario_passo_valido')
      ) as c(nome, muda, regra)
    loop
      v_casos_recusa := v_casos_recusa + 1;
      begin
        execute format('update public.profiler_funil_diario set %s
                         where org_id = public.org_padrao() and dia = $1 and passo = ''q1''', v_caso.muda)
          using v_hoje;
        falhas := falhas + 1;
        raise warning 'FALHOU: "%" foi aceito, esperado recusa por %', v_caso.nome, v_caso.regra;
      exception when check_violation then
        get stacked diagnostics v_regra = constraint_name;
        if v_regra = v_caso.regra then
          v_recusas_certas := v_recusas_certas + 1;
        else
          falhas := falhas + 1;
          raise warning 'FALHOU: "%" foi recusado por "%", e não por %', v_caso.nome, v_regra, v_caso.regra;
        end if;
      end;
    end loop;

    -- A chave: um segundo q1 de hoje, inserido direto, é recusado. É ela que
    --      faz do upsert uma linha por passo por dia.
    begin
      insert into public.profiler_funil_diario (dia, passo, contagem)
      values (v_hoje, 'q1', 1);
      v_chave_dupla := 'aceitou';
    exception when unique_violation then
      get stacked diagnostics v_regra = constraint_name;
      v_chave_dupla := 'recusou por ' || v_regra;
    end;

    -- 5f · Quem lê. Uma linha de OUTRA org (sem FK, um uuid qualquer basta)
    --      prova o recorte da policy por org.
    insert into public.profiler_funil_diario (org_id, dia, passo, contagem)
    values (gen_random_uuid(), v_hoje, 'q1', 7);

    select count(*) into v_total_hoje
      from public.profiler_funil_diario
     where org_id = public.org_padrao() and dia = v_hoje;

    -- O staff lê as linhas de hoje da org, e não a da outra org.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) filter (where org_id = public.org_padrao() and dia = v_hoje),
             count(*) filter (where org_id <> public.org_padrao())
        into v_staff_viu, v_staff_outra_org
        from public.profiler_funil_diario;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_staff_viu := -2;  -- sem SELECT
    end;

    -- O servidor (chave de serviço) lê as de hoje.
    begin
      set local role service_role;
      select count(*) into v_servico_viu
        from public.profiler_funil_diario
       where org_id = public.org_padrao() and dia = v_hoje;
      reset role;
    exception when insufficient_privilege then v_servico_viu := -2;
    end;

    -- O cliente logado da Garagem (authenticated sem perfil) não vê nada.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_cli_viu from public.profiler_funil_diario;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_cli_viu := -2;
    end;

    -- anon: nem lê, nem chama.
    begin
      set local role anon;
      perform 1 from public.profiler_funil_diario limit 1;
      reset role;
      v_anon_le := 'leu';
    exception when insufficient_privilege then v_anon_le := 'negado';
    end;
    begin
      set local role anon;
      perform public.profiler_contar_passo('intro');
      reset role;
      v_anon_chama := 'chamou';
    exception when insufficient_privilege then v_anon_chama := 'negado';
    end;

    -- 5g · Nem o staff nem o cliente chamam a função: o navegador nunca conta
    --      direto, logado ou não.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.profiler_contar_passo('intro');
      reset role;
      v_staff_chama := 'chamou';
    exception when insufficient_privilege then v_staff_chama := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.profiler_contar_passo('intro');
      reset role;
      v_cli_chama := 'chamou';
    exception when insufficient_privilege then v_cli_chama := 'negado';
    end;

    -- 5h · E o staff não escreve DIRETO: 42501, não "0 linhas" (O1).
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.profiler_funil_diario (dia, passo, contagem)
      values (v_hoje + 1, 'intro', 1000);
      reset role;
      v_staff_insere := 'inseriu';
    exception when insufficient_privilege then v_staff_insere := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.profiler_funil_diario set contagem = contagem + 1000
       where org_id = public.org_padrao() and dia = v_hoje;
      reset role;
      v_staff_atualiza := 'atualizou';
    exception when insufficient_privilege then v_staff_atualiza := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      delete from public.profiler_funil_diario where org_id = public.org_padrao() and dia = v_hoje;
      reset role;
      v_staff_apaga := 'apagou';
    exception when insufficient_privilege then v_staff_apaga := 'negado';
    end;

    raise exception 'DESFAZER_ACEITE_FUNIL_DO_PROFILER' using errcode = 'PFU01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PFU01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_staff is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar o usuário staff — nada foi provado';
  end if;
  if v_dia_do_relogio is not distinct from v_hoje then
    raise exception 'ACEITE INCONCLUSIVO: com o fuso % o dia do relógio (%) é o de São Paulo; a prova do dia não vale',
      v_zona, v_dia_do_relogio;
  end if;
  if v_q1_delta <> 2 or v_intro_delta <> 1 or v_outros_delta <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: q1 ×2 e intro ×1 somaram % e % (esperado 2 e 1), e mexeram % nos outros passos (esperado 0)',
      v_q1_delta, v_intro_delta, v_outros_delta;
  end if;
  if v_linhas_q1 <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % linha(s) de q1 hoje (esperado 1)', v_linhas_q1;
  end if;
  if not v_fora_intacto then
    falhas := falhas + 1;
    raise warning 'FALHOU: a função mexeu em linha fora do dia de São Paulo (%; o relógio no fuso % dizia %)',
      v_hoje, v_zona, v_dia_do_relogio;
  end if;
  if v_onze_ok <> 11 or cardinality(v_onze_recusados) > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % dos 11 passos do CHECK somaram 1 pela função; recusados com 22023: % (a lista da função divergiu da do CHECK)',
      v_onze_ok, v_onze_recusados;
  end if;
  if v_invalidos_22023 <> v_invalidos or v_invalidos_msg <> v_invalidos or not v_retrato_inval then
    falhas := falhas + 1;
    raise warning 'FALHOU: passos inválidos — % de % com 22023, % com a mensagem legível; a tabela ficou intacta: %',
      v_invalidos_22023, v_invalidos, v_invalidos_msg, v_retrato_inval;
  end if;
  if v_casos_recusa < 9 or v_recusas_certas <> v_casos_recusa or v_aceitos <> v_casos_aceite then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % de % recusas pela regra certa, % de % limites aceitos',
      v_recusas_certas, v_casos_recusa, v_aceitos, v_casos_aceite;
  end if;
  if v_chave_dupla <> 'recusou por profiler_funil_diario_pkey' then
    falhas := falhas + 1;
    raise warning 'FALHOU: segundo q1 de hoje inserido direto: %', v_chave_dupla;
  end if;
  if v_total_hoje < 11 or v_staff_viu <> v_total_hoje or v_staff_outra_org <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o staff viu % de % linha(s) de hoje (-2 = sem SELECT) e % de outra org (esperado 0)',
      v_staff_viu, v_total_hoje, v_staff_outra_org;
  end if;
  if v_servico_viu <> v_total_hoje then
    falhas := falhas + 1;
    raise warning 'FALHOU: o servidor (service_role) viu % de % linha(s) de hoje', v_servico_viu, v_total_hoje;
  end if;
  if v_cli_viu <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o cliente (authenticated sem perfil) viu % linha(s) do funil (-2 = sem SELECT; esperado 0)', v_cli_viu;
  end if;
  if v_anon_le <> 'negado' or v_anon_chama <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon — leitura %, chamada da função %', v_anon_le, v_anon_chama;
  end if;
  if v_staff_chama <> 'negado' or v_cli_chama <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: chamada da função por authenticated — staff %, cliente % (esperado 42501 nos dois)',
      v_staff_chama, v_cli_chama;
  end if;
  if v_staff_insere <> 'negado' or v_staff_atualiza <> 'negado' or v_staff_apaga <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: escrita direta do staff — insert %, update %, delete % (esperado 42501 nos três)',
      v_staff_insere, v_staff_atualiza, v_staff_apaga;
  end if;

  -- Nada da prova ficou: a tabela é a mesma, byte a byte, e o usuário sumiu.
  select md5(coalesce(string_agg(f::text, '|' order by f.org_id, f.dia, f.passo), ''))
    into v_retrato_depois
    from public.profiler_funil_diario f;
  select count(*) into v_restou from auth.users where email like 'aceite-funil-profiler-%@exemplo.invalido';
  select v_restou + count(*) into v_restou from public.profiles where id = v_staff;
  if v_retrato_depois is distinct from v_retrato_antes or v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (a tabela mudou: %, % usuário(s)/perfil(is))',
      v_retrato_depois is distinct from v_retrato_antes, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em profiler_funil_diario', falhas;
  end if;

  raise notice
    'Aceite verificado: profiler_funil_diario existe só com org_id, dia, passo '
    'e contagem (nenhum identificador, nenhum horário), chave (org_id, dia, passo), '
    'as duas regras nomeadas e RLS de staff; anon não tem nada, authenticated só '
    'lê e escrita direta é 42501; só service_role executa profiler_contar_passo '
    '(SECURITY DEFINER). Pela função, q1 ×2 e intro ×1 somaram 2 e 1 no dia de '
    'São Paulo (%, com o relógio da sessão em % = %), uma linha por passo; os '
    'onze passos do CHECK passam, e % passos inválidos (nulo e vazio inclusive) '
    'dão 22023 sem gravar; contagem negativa e passo fora da lista caem na regra '
    'certa; o staff lê só a própria org, o cliente não vê nada, anon é negado; a '
    'prova não deixou rastro.',
    v_hoje, v_zona, v_dia_do_relogio, v_invalidos;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261006120000', 'funil_do_profiler')
  on conflict (version) do nothing;
