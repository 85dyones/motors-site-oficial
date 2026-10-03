-- ============================================================================
-- ENSAIO da migração 20261003130000_leads_rls_por_escopo — não deixa nada
-- ============================================================================
-- Um bloco só. Ele (1) executa o MESMO DDL da migração (as três funções, os
-- grants, o drop das policies de `is_staff` e as três policies novas; só os
-- `comment on` ficam de fora), (2) veste perfis REAIS — um admin, um gestor,
-- um SDR puro, um Comercial puro, um Financeiro e um Marketing, escolhidos por
-- consulta — e conta o que cada um enxerga, tenta tirar o responsável e apagar
-- como Comercial, e (3) termina em
--
--     ERROR:  ENSAIO_DESFEITO { …resumo em JSON… }
--
-- O erro É o resultado: é ele que desfaz tudo. O DO roda numa transação (a
-- implícita do comando, ou a de quem o chamou), e a exceção final a aborta —
-- funções, policies e qualquer linha tocada voltam ao que eram. Se a mensagem
-- for outra (DIVERGÊNCIA, ENSAIO_SEM_…), o ensaio parou antes, e também não
-- deixou nada.
--
-- Como ler o resumo: `confere` em cada perfil compara o que ele viu com o que
-- a regra manda, contado na pele do dono da tabela. `tentativas` traz
-- `barrado` (42501), `linhas:N` (o comando alcançou N linhas) ou `erro …`.
-- O esperado: tirar o responsável → `barrado`; apagar → `linhas:0`.
-- `tudo_confere` resume.
--
-- Papéis dentro de um DO: troca-se com `set local role`, e é preciso voltar
-- (`reset role`) antes de cada passo de preparo — na pele do `authenticated`
-- o bloco não lê `profiles` de todo mundo nem conta a tabela inteira. Cada
-- tentativa roda num sub-bloco: a recusa vira texto, e o papel é devolvido
-- logo depois, com ou sem recusa.
--
-- ⚠️ O `drop policy` pede trava exclusiva em `leads` enquanto o bloco roda (um
-- instante). Não rodar no meio de um pico de atendimento.
-- ⚠️ Nomes e telefones não saem no resumo: só ids de perfil, papéis e contagens.
-- ============================================================================
do $$
declare
  v_estranhas text;
  v_total      bigint;
  v_designados bigint;
  v_passo      record;
  v_perfil     record;
  v_visto      bigint;
  v_esperado   bigint;
  v_n          bigint;
  v_res        text;
  v_cmd        text;
  v_alvo_com   uuid;    -- um lead do Comercial escolhido (ou, sem lead dele, um de outra pessoa)
  v_alvo_e_dele boolean := false;
  v_alvo_sdr   uuid;    -- um lead com responsável, para o SDR
  v_antes      text;
  v_depois     text;
  v_perfis     jsonb := '{}'::jsonb;
  v_tentativas jsonb := '{}'::jsonb;
  v_ids        jsonb := '{}'::jsonb;
  v_ok         boolean := true;
  v_resumo     jsonb;
begin
  -- --------------------------------------------------------------------------
  -- 0. A conferência prévia da migração
  -- --------------------------------------------------------------------------
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
      'Policies somam por OU: ela manteria aberto o que a migração fecha.', v_estranhas;
  end if;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'leads'
         and column_name in ('responsavel', 'responsavel_desde', 'responsavel_anterior')) <> 3
     or not exists (select 1 from pg_trigger
                     where tgrelid = 'public.leads'::regclass
                       and tgname = 'trg_leads_antes_de_atualizar' and not tgisinternal) then
    raise exception
      'DIVERGÊNCIA: faltam em public.leads as colunas responsavel_desde/'
      'responsavel_anterior ou o gatilho trg_leads_antes_de_atualizar.';
  end if;

  -- --------------------------------------------------------------------------
  -- 1. O DDL da migração, igual
  -- --------------------------------------------------------------------------
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

  create or replace function public.recebe_lead_pelo_nome(p_nome text)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
  as $fn$
    select public.escopo_de_leads() <> 'nenhum'
       and nullif(btrim(p_nome), '') is not null
       and exists (
         select 1 from public.profiles c
          where c.is_active = true
            and 'comercial' = any (c.papeis)
            and nullif(btrim(c.full_name), '') = btrim(p_nome)
       );
  $fn$;

  revoke all on function public.escopo_de_leads()            from public, anon;
  revoke all on function public.meu_nome_de_responsavel()    from public, anon;
  revoke all on function public.recebe_lead_pelo_nome(text)  from public, anon;
  grant execute on function public.escopo_de_leads()           to authenticated, service_role;
  grant execute on function public.meu_nome_de_responsavel()   to authenticated, service_role;
  grant execute on function public.recebe_lead_pelo_nome(text) to authenticated, service_role;

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
          when 'designados' then
                btrim(coalesce(responsavel, '')) <> ''
            and (responsavel_desde is distinct from now()
                 or public.recebe_lead_pelo_nome(responsavel))
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

  -- --------------------------------------------------------------------------
  -- 2. Quem veste, e o que a regra manda cada um ver (na pele do dono)
  -- --------------------------------------------------------------------------
  select count(*), count(*) filter (where btrim(coalesce(responsavel, '')) <> '')
    into v_total, v_designados
    from public.leads;

  -- Um perfil ativo de cada tipo. "Puro" é não ter papel que alargue o escopo.
  -- O Comercial escolhido é o que tem mais leads no nome: é nele que as
  -- tentativas de escrita valem alguma coisa.
  select jsonb_object_agg(tipo, id) into v_ids
    from (
      select 'admin' as tipo,
             (select p.id from public.profiles p
               where p.is_active and 'admin' = any (p.papeis)
               order by p.created_at limit 1) as id
      union all
      select 'gestor',
             (select p.id from public.profiles p
               where p.is_active and 'gestor' = any (p.papeis) and not ('admin' = any (p.papeis))
               order by p.created_at limit 1)
      union all
      select 'sdr',
             (select p.id from public.profiles p
               where p.is_active and 'sdr' = any (p.papeis)
                 and not (p.papeis && array['admin', 'gestor', 'comercial'])
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
    ) t;

  if v_ids->>'admin' is null then
    raise exception 'ENSAIO_SEM_ADMIN: não há perfil ativo com papel admin — depois da migração ninguém distribuiria lead.';
  end if;

  -- --------------------------------------------------------------------------
  -- 3. A leitura de cada um
  -- --------------------------------------------------------------------------
  for v_perfil in
    select t.tipo, (v_ids->>t.tipo)::uuid as id, p.papeis, btrim(p.full_name) as nome
      from unnest(array['admin', 'gestor', 'sdr', 'comercial', 'financeiro', 'marketing']) with ordinality as t(tipo, ordem)
      left join public.profiles p on p.id = (v_ids->>t.tipo)::uuid
     order by t.ordem
  loop
    if v_perfil.id is null then
      v_perfis := v_perfis || jsonb_build_object(v_perfil.tipo, 'não há perfil ativo desse tipo');
      continue;
    end if;

    -- O esperado, ainda na pele do dono.
    v_esperado := case v_perfil.tipo
                    when 'admin'     then v_total
                    when 'gestor'    then v_designados
                    when 'sdr'       then v_designados
                    when 'comercial' then (select count(*) from public.leads l
                                            where btrim(l.responsavel) = v_perfil.nome)
                    else 0
                  end;

    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_perfil.id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      select count(*) into v_visto from public.leads;
      v_res := null;
    exception when others then
      v_visto := null;
      v_res := 'erro ' || sqlstate || ': ' || sqlerrm;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    v_ok := v_ok and v_visto is not distinct from v_esperado;
    v_perfis := v_perfis || jsonb_build_object(v_perfil.tipo, jsonb_strip_nulls(jsonb_build_object(
      'perfil',   v_perfil.id,
      'papeis',   to_jsonb(v_perfil.papeis),
      've',       v_visto,
      'esperado', v_esperado,
      'confere',  v_visto is not distinct from v_esperado,
      'erro',     v_res)));
  end loop;

  -- --------------------------------------------------------------------------
  -- 4. As tentativas de escrita
  -- --------------------------------------------------------------------------
  if v_ids->>'comercial' is not null then
    select l.id into v_alvo_com
      from public.leads l
      join public.profiles p on p.id = (v_ids->>'comercial')::uuid
     where btrim(l.responsavel) = btrim(p.full_name)
     order by l.created_at desc limit 1;
    v_alvo_e_dele := v_alvo_com is not null;
    if v_alvo_com is null then
      -- Sem lead dele: tenta num lead de outra pessoa, que ele nem vê.
      select l.id into v_alvo_com from public.leads l
       where btrim(coalesce(l.responsavel, '')) <> '' order by l.created_at desc limit 1;
    end if;
  end if;
  if v_ids->>'sdr' is not null then
    select l.id into v_alvo_sdr from public.leads l
     where btrim(coalesce(l.responsavel, '')) <> '' order by l.created_at desc limit 1;
  end if;

  select coalesce(string_agg(l.id::text || '=' || coalesce(l.responsavel, '<nulo>'), ' ' order by l.id), '')
    into v_antes from public.leads l where l.id in (v_alvo_com, v_alvo_sdr);

  for v_passo in
    select * from (values
      (1, 'comercial_tira_o_responsavel',  'comercial', v_alvo_com, 'update public.leads set responsavel = null where id = %L::uuid', 'barrado'),
      (2, 'comercial_grava_vazio',         'comercial', v_alvo_com, 'update public.leads set responsavel = ''   '' where id = %L::uuid', 'barrado'),
      (3, 'comercial_apaga',               'comercial', v_alvo_com, 'delete from public.leads where id = %L::uuid', 'linhas:0'),
      (4, 'sdr_tira_o_responsavel',        'sdr',       v_alvo_sdr, 'update public.leads set responsavel = null where id = %L::uuid', 'barrado'),
      (5, 'sdr_apaga',                     'sdr',       v_alvo_sdr, 'delete from public.leads where id = %L::uuid', 'linhas:0')
    ) as t(ordem, rotulo, tipo, alvo, comando, esperado)
    order by ordem
  loop
    if v_ids->>v_passo.tipo is null then
      v_tentativas := v_tentativas || jsonb_build_object(v_passo.rotulo, 'sem perfil ' || v_passo.tipo || ' para vestir');
      continue;
    end if;
    if v_passo.alvo is null then
      v_tentativas := v_tentativas || jsonb_build_object(v_passo.rotulo, 'sem lead com responsável para tentar');
      continue;
    end if;
    v_cmd := format(v_passo.comando, v_passo.alvo);

    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_ids->>v_passo.tipo, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      execute v_cmd;
      get diagnostics v_n = row_count;
      v_res := 'linhas:' || v_n;
    exception
      when insufficient_privilege then
        v_res := 'barrado';
      when others then
        v_res := 'erro ' || sqlstate || ': ' || sqlerrm;
    end;
    -- De volta ao papel de quem roda o ensaio, com ou sem recusa: o próximo
    -- passo de preparo não se faz na pele do authenticated.
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- O Comercial sem lead próprio tenta num lead que não vê: aí nem o with
    -- check chega a rodar, e o esperado é não alcançar linha nenhuma.
    if v_passo.tipo = 'comercial' and not v_alvo_e_dele then
      v_ok := v_ok and v_res = 'linhas:0';
    else
      v_ok := v_ok and v_res = v_passo.esperado;
    end if;
    v_tentativas := v_tentativas || jsonb_build_object(v_passo.rotulo, v_res);
  end loop;

  -- Os leads tentados continuam lá, com o mesmo responsável.
  select coalesce(string_agg(l.id::text || '=' || coalesce(l.responsavel, '<nulo>'), ' ' order by l.id), '')
    into v_depois from public.leads l where l.id in (v_alvo_com, v_alvo_sdr);
  v_ok := v_ok and v_antes = v_depois;

  -- --------------------------------------------------------------------------
  -- 5. O resumo — e o desfazer
  -- --------------------------------------------------------------------------
  reset role;
  v_resumo := jsonb_build_object(
    'tudo_confere',  v_ok,
    'leads', jsonb_build_object(
      'total',           v_total,
      'com_responsavel', v_designados,
      'sem_responsavel', v_total - v_designados),
    'policies_no_ensaio', (select jsonb_agg(policyname || ':' || cmd order by policyname)
                             from pg_policies where schemaname = 'public' and tablename = 'leads'),
    'perfis',        v_perfis,
    'tentativas',    v_tentativas,
    'o_comercial_tentou_num_lead_dele', v_alvo_e_dele,
    'leads_tentados_intactos', v_antes = v_depois
  );

  raise exception 'ENSAIO_DESFEITO %', v_resumo::text;
end $$;
