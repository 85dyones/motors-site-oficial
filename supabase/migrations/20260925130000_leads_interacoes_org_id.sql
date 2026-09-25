-- ============================================================================
-- `leads_interacoes` ganha `org_id` (2026-09-25)
-- ============================================================================
--
-- A regra do projeto para tabela nova (CLAUDE.md, "Banco — regras de
-- migração"): `org_id uuid not null default org_padrao()` + RLS + policy por
-- papel filtrando a org. `leads_interacoes` nasceu em produção em 2026-09-23,
-- FORA do repositório, sem `org_id`; a `20260923150000_gestao_do_lead.sql`,
-- reconstruída do catálogo, registrou a divergência como "não corrigida" e
-- deixou a correção para "migração própria, datada depois desta". É esta.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
-- 1. A coluna `org_id uuid not null default public.org_padrao()`. As linhas
--    que já existem (8 em produção em 2026-09-25, 5 delas importadas) recebem
--    a org padrão PELO DEFAULT: `org_padrao()` é STABLE, então o Postgres
--    avalia o default uma vez no ALTER e guarda o valor no catálogo ("default
--    rápido") — a tabela não é reescrita e não há UPDATE linha a linha. A
--    tabela não tem gatilho (conferido em produção), então nada mais dispara.
-- 2. A policy `leads_interacoes_leitura_staff` passa a filtrar a org, na forma
--    das `nucleo_staff_*` da f0f (e da `erros_staff_le`):
--      using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
--    Continua FOR SELECT, TO authenticated, sem WITH CHECK — e continua a
--    única policy da tabela. Escrever segue sendo só da função.
-- 3. Um comentário na coluna.
--
-- ---------------------------------------------------------------------------
-- O que NÃO muda, e por quê
-- ---------------------------------------------------------------------------
--   * `registrar_interacao_do_lead(...)` insere sem listar `org_id`, e o
--     default basta. Ela é SECURITY DEFINER: o default é avaliado no INSERT
--     dela, como o dono, e `org_padrao()` (também SECURITY DEFINER) tem
--     EXECUTE para o dono. Reescrever o corpo seria desnecessário e ainda
--     quebraria o md5 que a conferência prévia da 20260923150000 cobra. O
--     aceite prova pelo EFEITO: uma interação gravada por ela, vestindo um
--     staff, sai com `org_id = org_padrao()`.
--   * `leads_antes_de_atualizar()` é gatilho de `leads`, não lê
--     `leads_interacoes`, e `leads` não ganha coluna aqui. Intocado. O aceite
--     passa pelo caminho inteiro (função → UPDATE em `leads` → gatilho) e
--     cobra que combinar o próximo passo continua reiniciando o relógio.
--   * Grants: são de tabela inteira, e a coluna nova herda. `anon` segue sem
--     nada; `authenticated` com SELECT, REFERENCES e TRIGGER (e o MAINTAIN do
--     PG17, em produção); `service_role` com tudo. Nada é concedido nem
--     revogado aqui — o aceite cobra que ficou assim.
--   * O comentário da TABELA não muda: a conferência prévia da 20260923150000
--     cobra o md5 dele.
--   * `leads` e `leads_eventos` seguem sem `org_id` — legado, fora daqui.
--   * Sem FK para `orgs` e sem índice por org, como no resto do núcleo (f0f,
--     `erros`): `org_id` não é FK em tabela nenhuma do projeto. No lugar da
--     FK, o aceite cobra que nenhuma linha aponte para org inexistente. Com
--     uma org só, índice em `org_id` não separa nada; a leitura é por lead
--     (`leads_interacoes_lead_idx`).
--
-- ---------------------------------------------------------------------------
-- ⚠️ Efeito sobre a 20260923150000 — ela deixa de ser reaplicável
-- ---------------------------------------------------------------------------
-- Num banco em que ESTA migração rodou, reaplicar a 20260923150000 aborta na
-- conferência prévia dela ("a policy leads_interacoes_leitura_staff existe e
-- não é a do retrato") ANTES de mudar qualquer coisa. Fica assim de propósito:
-- o §6 dela faz `drop policy` + `create policy` SEM o filtro de org, então
-- ensiná-la a aceitar a forma nova faria a reaplicação desfazer esta correção
-- em silêncio. Ela é o retrato de 2026-09-23: o livro-razão de produção já tem
-- a versão (o `db push` não a reaplica), e num banco reconstruído do zero ela
-- roda ANTES desta. Recusar é uma das duas saídas que ela mesma promete
-- ("reaplicar em produção é no-op ou recusa, nunca conserto silencioso").
--
-- ---------------------------------------------------------------------------
-- Conferência prévia, idempotência
-- ---------------------------------------------------------------------------
-- O que este arquivo reescreve (a policy) tem de estar ausente ou numa das
-- duas formas conhecidas — a de 2026-09-23 ou a daqui —; `org_id`, se já
-- existir, tem de ser a coluna daqui (senão `add column if not exists` a
-- pularia calado); e nenhuma outra policy pode existir na tabela (uma
-- permissiva a mais, sem o filtro, anularia o filtro por OU). Qualquer outra
-- coisa: aborta antes de mudar nada.
--
-- Aditiva e idempotente: `add column if not exists`, `comment on`, policy por
-- `drop policy if exists` + `create policy` (o gesto da f0f). Reaplicar é
-- no-op. Nenhum DROP/RENAME/ALTER TYPE de objeto em uso. Rodada fora de
-- transação, o instante entre o `drop` e o `create` da policy nega tudo a
-- `authenticated` (RLS sem policy = nenhuma linha) — falha fechada, não aberta.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o arquivo só reescreve o que ele conhece
-- ----------------------------------------------------------------------------
do $previa$
declare
  v_tabela  regclass := to_regclass('public.leads_interacoes');
  v_tipo    text;
  v_notnull boolean;
  v_default text;
  v_pol     record;
begin
  if v_tabela is null then
    raise exception
      'DEPENDÊNCIA: public.leads_interacoes não existe — a '
      '20260923150000_gestao_do_lead.sql vem antes desta. Nada foi aplicado.';
  end if;

  if public.org_padrao() is null then
    raise exception
      'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia) — o default '
      'não teria org para dar às linhas existentes. Nada foi aplicado.';
  end if;

  select format_type(a.atttypid, a.atttypmod), a.attnotnull,
         replace(pg_get_expr(d.adbin, d.adrelid), 'public.', '')
    into v_tipo, v_notnull, v_default
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = v_tabela and a.attname = 'org_id' and not a.attisdropped;
  if found and (v_tipo <> 'uuid' or not v_notnull
                or v_default is distinct from 'org_padrao()') then
    raise exception
      'DIVERGÊNCIA: leads_interacoes.org_id já existe e não é a desta migração '
      '(%, not null = %, default %) — `add column if not exists` a pularia '
      'calado. Nada foi aplicado.', v_tipo, v_notnull, coalesce(v_default, '<nenhum>');
  end if;

  for v_pol in
    select polname, polcmd, polpermissive, polroles, polwithcheck is null as sem_check,
           replace(pg_get_expr(polqual, polrelid), 'public.', '') as qual
      from pg_policy
     where polrelid = v_tabela
  loop
    if not (v_pol.polname = 'leads_interacoes_leitura_staff'
            and v_pol.polcmd = 'r'
            and v_pol.polpermissive
            and v_pol.polroles = array['authenticated'::regrole]::oid[]
            and v_pol.sem_check
            and v_pol.qual in ('is_staff(auth.uid())',                               -- 2026-09-23
                               '(is_staff(auth.uid()) AND (org_id = org_padrao()))') -- esta
           ) then
      raise exception
        'DIVERGÊNCIA: a policy "%" de leads_interacoes não é nenhuma das formas '
        'conhecidas (a leitura do staff de 2026-09-23 ou a desta migração): '
        'cmd %, qual "%". Recriar a policy aqui apagaria uma mudança que este '
        'arquivo não conhece. Nada foi aplicado.', v_pol.polname, v_pol.polcmd, v_pol.qual;
    end if;
  end loop;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. A coluna — as linhas existentes recebem a org padrão pelo default
-- ----------------------------------------------------------------------------
alter table public.leads_interacoes
  add column if not exists org_id uuid not null default public.org_padrao();

comment on column public.leads_interacoes.org_id is
  'A org do registro (2026-09-25). Default org_padrao(): quem grava — '
  'registrar_interacao_do_lead, que não lista a coluna — não precisa saber '
  'dela. A policy de leitura do staff filtra por ela (org_id = org_padrao()). '
  'Chegou depois da tabela: as linhas anteriores receberam a org padrão pelo '
  'default. Ver 20260925130000_leads_interacoes_org_id.sql.';


-- ----------------------------------------------------------------------------
-- 2. A policy — a leitura do staff passa a filtrar a org
-- ----------------------------------------------------------------------------
drop policy if exists leads_interacoes_leitura_staff on public.leads_interacoes;
create policy leads_interacoes_leitura_staff on public.leads_interacoes
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- ESTRUTURA: a coluna (tipo, nulidade, default, comentário), as linhas (sem
-- org nula, sem org inexistente, e na org padrão enquanto só houver uma), a
-- RLS e a policy única com a definição nova, e os grants papel a papel.
--
-- EFEITO: uma sonda (um staff, um lead, uma org TEMPORÁRIA) desfeita por
-- sentinela — o rollback do sub-bloco leva a sonda, o rastro dela, o usuário
-- de teste, a org temporária e qualquer `set local role`/claims junto. As
-- variáveis sobrevivem (plpgsql não desfaz variável), e é por elas que o
-- veredito sai. Nenhuma data fixa: tudo é relativo a `now()`, que é constante
-- dentro da transação.
do $aceite$
declare
  falhas            int := 0;
  v_caso            record;
  v_txt             text;
  v_msg             text;
  v_privs           text;
  v_org_padrao      uuid := public.org_padrao();
  v_orgs_antes      int;

  -- estrutura
  v_tipo            text;
  v_notnull         boolean;
  v_default         text;
  v_total           int;
  v_nulas           int;
  v_orfas           int;
  v_fora_da_padrao  int;
  v_orgs            int;

  -- a sonda
  v_staff           uuid;
  v_cliente         uuid := gen_random_uuid();
  v_lead            uuid;
  v_outra_org       uuid;
  v_padrao_na_sonda uuid;
  v_int             uuid;
  v_int_outra       uuid;
  v_vence           timestamptz := now() + interval '1 day';

  -- o que a sonda leu antes de ser desfeita
  v_int_org         uuid;
  v_passo           text;
  v_contato         timestamptz;
  v_alertado        timestamptz;
  v_dono_ve         int := -1;
  v_staff_ve        int := -1;
  v_staff_ve_sua    int := -1;
  v_staff_ve_outra  int := -1;
  v_staff_ve_org    int := -1;
  v_cli_le          int := -1;
  v_anon_le         text := '<não rodou>';
  v_anon_rpc        text := '<não rodou>';
  v_restou          int;
begin
  -- ==========================================================================
  -- ESTRUTURA
  -- ==========================================================================

  -- 1 · A coluna: uuid, not null, default org_padrao(), com comentário.
  select format_type(a.atttypid, a.atttypmod), a.attnotnull,
         replace(pg_get_expr(d.adbin, d.adrelid), 'public.', '')
    into v_tipo, v_notnull, v_default
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.leads_interacoes'::regclass
     and a.attname = 'org_id' and not a.attisdropped;
  if v_tipo is distinct from 'uuid' or v_notnull is distinct from true
     or v_default is distinct from 'org_padrao()' then
    raise exception
      'ACEITE FALHOU: leads_interacoes.org_id é "%" (not null = %, default %) — esperado uuid not null default org_padrao()',
      coalesce(v_tipo, '<ausente>'), v_notnull, coalesce(v_default, '<nenhum>');
  end if;

  if col_description('public.leads_interacoes'::regclass,
       (select attnum from pg_attribute
         where attrelid = 'public.leads_interacoes'::regclass and attname = 'org_id')) is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads_interacoes.org_id sem comentário';
  end if;

  -- 2 · As linhas: nenhuma sem org, nenhuma numa org que não existe, e —
  --     enquanto houver uma org só — todas na padrão. (Em produção: as 8 que
  --     existiam, pelo default.)
  select count(*),
         count(*) filter (where li.org_id is null),
         count(*) filter (where li.org_id is not null
                            and not exists (select 1 from public.orgs o where o.id = li.org_id)),
         count(*) filter (where li.org_id is distinct from v_org_padrao)
    into v_total, v_nulas, v_orfas, v_fora_da_padrao
    from public.leads_interacoes li;
  select count(*) into v_orgs from public.orgs;
  if v_nulas > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % linha(s) de leads_interacoes sem org', v_nulas;
  end if;
  if v_orfas > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % linha(s) de leads_interacoes numa org que não existe', v_orfas;
  end if;
  if v_orgs = 1 and v_fora_da_padrao > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: há uma org só e % linha(s) de leads_interacoes fora dela', v_fora_da_padrao;
  end if;

  -- 3 · RLS ligada e não forçada (como em produção); uma policy só, a nova.
  if not exists (select 1 from pg_class
                  where oid = 'public.leads_interacoes'::regclass
                    and relrowsecurity and not relforcerowsecurity) then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads_interacoes sem RLS ligada (ou com RLS forçada — produção não força)';
  end if;

  select string_agg(format('%s/%s/%s/%s/%s/%s', polname, polcmd, polpermissive::text,
                           array_to_string(polroles::regrole[], ','),
                           replace(pg_get_expr(polqual, polrelid), 'public.', ''),
                           coalesce(pg_get_expr(polwithcheck, polrelid), '-')), '; ')
    into v_txt
    from pg_policy where polrelid = 'public.leads_interacoes'::regclass;
  if v_txt is distinct from
     'leads_interacoes_leitura_staff/r/true/authenticated/(is_staff(auth.uid()) AND (org_id = org_padrao()))/-' then
    falhas := falhas + 1;
    raise warning 'FALHOU: as policies de leads_interacoes são "%" — esperado só a leitura do staff filtrando a org',
      coalesce(v_txt, '<nenhuma>');
  end if;

  -- 4 · Grants intocados, papel a papel. `has_table_privilege` enxerga também
  --     o que viria por PUBLIC; os sete privilégios clássicos valem em PG16
  --     (andaime) e PG17 (produção).
  for v_caso in
    select * from (values
      ('anon',          ''),
      ('authenticated', 'SELECT,REFERENCES,TRIGGER'),
      ('service_role',  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ) as c(papel, esperado)
  loop
    select coalesce(string_agg(p, ',' order by o), '') into v_privs
      from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
           with ordinality as u(p, o)
     where has_table_privilege(v_caso.papel, 'public.leads_interacoes', p);
    if v_privs <> v_caso.esperado then
      falhas := falhas + 1;
      raise warning 'FALHOU: % tem em leads_interacoes "%", esperado "%"',
        v_caso.papel, v_privs, v_caso.esperado;
    end if;
  end loop;

  -- anon (e PUBLIC) sem entrada NENHUMA na ACL — pega também o MAINTAIN do
  -- PG17 —, e sem privilégio de coluna em coluna nenhuma, `org_id` inclusive.
  -- authenticated sem INSERT/UPDATE por coluna: escrever é só da função.
  if exists (select 1 from pg_class c, aclexplode(c.relacl) x
              where c.oid = 'public.leads_interacoes'::regclass
                and (x.grantee = 0 or x.grantee = 'anon'::regrole))
     or has_any_column_privilege('anon', 'public.leads_interacoes',
                                 'SELECT, INSERT, UPDATE, REFERENCES') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon (ou PUBLIC) tem algum privilégio em leads_interacoes';
  end if;
  if has_any_column_privilege('authenticated', 'public.leads_interacoes', 'INSERT, UPDATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated escreve em alguma coluna de leads_interacoes';
  end if;

  -- 5 · O gatilho do lead segue pendurado e ligado (o corpo é da
  --     20260923150000; o efeito, abaixo, prova que o caminho continua).
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.leads'::regclass
                    and tgname  = 'trg_leads_antes_de_atualizar'
                    and tgfoid  = 'public.leads_antes_de_atualizar()'::regprocedure
                    and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: trg_leads_antes_de_atualizar não está ligado à função em leads';
  end if;

  select count(*) into v_orgs_antes from public.orgs;

  -- ==========================================================================
  -- EFEITO — tudo daqui até o sentinela é desfeito
  -- ==========================================================================
  begin
    -- A sonda: um vendedor staff (o gesto do aceite da 20260828120000), um
    -- lead e uma org TEMPORÁRIA, criada depois da padrão — `org_padrao()` é a
    -- mais antiga, e a sonda confere que ela não mudou.
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-org-interacao@exemplo.invalido', now(), now())
    returning id into v_staff;
    update public.profiles
       set full_name = 'Aceite Org da Interação', papeis = array['comercial'], role = 'comercial'
     where id = v_staff;

    insert into public.leads (nome, telefone, interesse)
    values ('Aceite Org da Interação', '5541999990925', 'Teste Aceite 2022')
    returning id into v_lead;

    insert into public.orgs (nome, criada_em)
    select 'Aceite outra org', max(criada_em) + interval '1 day' from public.orgs
    returning id into v_outra_org;
    v_padrao_na_sonda := public.org_padrao();

    -- E1 · O lead fica "cobrado": contato velho e alerta recente, gravados sem
    --      sessão (o motor), que não reinicia relógio.
    update public.leads
       set ultimo_contato_em = now() - interval '5 days',
           alertado_em       = now() - interval '2 hours'
     where id = v_lead;

    -- E2 · O staff registra uma nota COM próximo passo pela função — que não
    --      lista `org_id`. A org vem do default; o passo vai para o lead, e o
    --      gatilho do lead reinicia o relógio.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      v_int := public.registrar_interacao_do_lead(
        v_lead, 'nota', null, 'Aceite: a org vem do default',
        'Ligar de volta', v_vence);
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      raise exception 'ACEITE FALHOU: o staff não conseguiu registrar pela função (%): %',
        sqlstate, sqlerrm;
    end;

    select org_id into v_int_org from public.leads_interacoes where id = v_int;
    select proximo_passo, ultimo_contato_em, alertado_em
      into v_passo, v_contato, v_alertado
      from public.leads where id = v_lead;

    -- E3 · Uma linha da OUTRA org, no mesmo lead — gravada como a chave de
    --      serviço gravaria, com a org explícita.
    insert into public.leads_interacoes (lead_id, tipo, texto, org_id)
    values (v_lead, 'nota', 'Aceite: linha de outra org', v_outra_org)
    returning id into v_int_outra;

    select count(*) into v_dono_ve from public.leads_interacoes where lead_id = v_lead;

    -- E4 · O staff lê: a sua (org padrão) sim; a da outra org, não — nem
    --      pelo lead, nem pedindo a org pelo nome.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*),
             count(*) filter (where id = v_int),
             count(*) filter (where id = v_int_outra)
        into v_staff_ve, v_staff_ve_sua, v_staff_ve_outra
        from public.leads_interacoes where lead_id = v_lead;
      select count(*) into v_staff_ve_org
        from public.leads_interacoes where org_id = v_outra_org;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_staff_ve := -2;  -- sem SELECT
    end;

    -- E5 · O cliente (authenticated, sem staff) lê zero — de org nenhuma.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cliente, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_cli_le from public.leads_interacoes where lead_id = v_lead;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_cli_le := -2;
    end;

    -- E6 · anon: barrado no PRIVILÉGIO — nem lê a tabela, nem executa a função
    --      (a mensagem da guarda de staff denunciaria um EXECUTE indevido).
    begin
      set local role anon;
      perform 1 from public.leads_interacoes limit 1;
      reset role;
      v_anon_le := 'leu';
    exception when insufficient_privilege then v_anon_le := 'negado';
    end;

    begin
      set local role anon;
      perform public.registrar_interacao_do_lead(v_lead, 'nota', null, 'anon tentou');
      reset role;
      v_anon_rpc := 'executou';
    exception when insufficient_privilege then
      get stacked diagnostics v_msg = message_text;
      v_anon_rpc := case when v_msg = 'Registrar interação é restrito à equipe.'
                         then 'barrado só pela guarda' else 'negado' end;
    end;

    raise exception 'DESFAZER_ACEITE_ORG_DA_INTERACAO' using errcode = 'LIO01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'LIO01' then null;
  end;

  -- ==========================================================================
  -- O veredito, lido das variáveis que sobreviveram ao rollback
  -- ==========================================================================
  if v_lead is null or v_staff is null or v_outra_org is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a gravar — nada foi provado';
  end if;
  if v_padrao_na_sonda is distinct from v_org_padrao then
    raise exception 'ACEITE FALHOU: a org temporária virou a padrão (% → %) — a sonda não prova nada',
      v_org_padrao, v_padrao_na_sonda;
  end if;

  -- A função, sem listar a coluna, grava na org padrão.
  if v_int is null or v_int_org is distinct from v_org_padrao then
    falhas := falhas + 1;
    raise warning 'FALHOU: a interação gravada por registrar_interacao_do_lead saiu com org_id % (padrão %)',
      coalesce(v_int_org::text, '<nenhuma>'), v_org_padrao;
  end if;

  -- O caminho função → lead → gatilho continua: passo gravado, relógio zerado.
  if v_passo is distinct from 'Ligar de volta'
     or v_contato is distinct from now() or v_alertado is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: combinar o passo pela função não chegou ao lead como antes (passo "%", contato %, alerta %)',
      v_passo, v_contato, v_alertado;
  end if;

  -- A outra org existe de fato no banco (senão "o staff não a vê" seria vazio)...
  if v_dono_ve <> 2 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o dono vê % registro(s) no lead da sonda — esperado 2 (um por org)', v_dono_ve;
  end if;
  -- ...e o staff vê só a da org padrão.
  if v_staff_ve <> 1 or v_staff_ve_sua <> 1 or v_staff_ve_outra <> 0 or v_staff_ve_org <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o staff leu % no lead (a sua: %, a da outra org: %) e % pedindo a outra org — '
                  'esperado 1, 1, 0 e 0 (-2 = sem SELECT)',
      v_staff_ve, v_staff_ve_sua, v_staff_ve_outra, v_staff_ve_org;
  end if;

  if v_cli_le <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o cliente (authenticated sem staff) leu % registro(s) (-2 = sem SELECT)', v_cli_le;
  end if;
  if v_anon_le <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon % leads_interacoes — tinha de parar no privilégio', v_anon_le;
  end if;
  if v_anon_rpc <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon chamando registrar_interacao_do_lead: % — tinha de parar no EXECUTE', v_anon_rpc;
  end if;

  -- Nada da sonda sobreviveu.
  select count(*) into v_restou from public.leads where id = v_lead;
  select v_restou + count(*) into v_restou from public.leads_interacoes
   where lead_id = v_lead or id in (v_int, v_int_outra);
  select v_restou + count(*) into v_restou from public.leads_eventos where lead_id = v_lead;
  select v_restou + count(*) into v_restou from auth.users where id = v_staff;
  select v_restou + count(*) into v_restou from public.orgs where id = v_outra_org;
  if v_restou <> 0 or (select count(*) from public.orgs) <> v_orgs_antes then
    falhas := falhas + 1;
    raise warning 'FALHOU: a sonda deixou % linha(s) para trás (orgs: % → %)',
      v_restou, v_orgs_antes, (select count(*) from public.orgs);
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no org_id de leads_interacoes', falhas;
  end if;

  raise notice
    'Aceite verificado: leads_interacoes.org_id é uuid not null default '
    'org_padrao(); % linha(s), nenhuma sem org, todas em org existente; uma '
    'policy só — SELECT do staff filtrando org_id = org_padrao(); grants '
    'intocados (anon nada, authenticated só leitura, service_role tudo); '
    'registrar_interacao_do_lead, sem listar a coluna, gravou na org padrão e '
    'o gatilho do lead seguiu reiniciando o relógio; o staff não vê a linha de '
    'outra org, o cliente lê zero e anon para no privilégio; a sonda não deixou '
    'rastro.', v_total;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20260925130000', 'leads_interacoes_org_id')
  on conflict (version) do nothing;
