-- ============================================================================
-- ENSAIO da migração 20261005120000_veiculos_de_interesse — não deixa nada
-- ============================================================================
-- Um bloco só. Ele (1) repete a conferência prévia da migração, (2) executa o
-- MESMO DDL (a tabela `leads_veiculos`, o gatilho do carimbo, os privilégios,
-- as quatro policies e as funções de relatório; só os `comment on` ficam de
-- fora), (3) roda a MESMA carga inicial — uma opção por lead que já tem
-- `veiculo_id` —, (4) conta o que ela deixou e veste perfis REAIS (um admin e
-- um Comercial puro, escolhidos por consulta) para ler a tabela e os
-- relatórios, e (5) termina em
--
--     ERROR:  ENSAIO_DESFEITO { …resumo em JSON… }
--
-- O erro É o resultado: é ele que desfaz tudo. O DO roda numa transação (a
-- implícita do comando, ou a de quem o chamou), e a exceção final a aborta —
-- tabela, funções, policies e linhas voltam ao que eram. Se a mensagem for
-- outra (DIVERGÊNCIA, DEPENDÊNCIA, ENSAIO_SEM_…), o ensaio parou antes, e
-- também não deixou nada.
--
-- Como ler o resumo:
--   · `leads_com_veiculo` e `linhas` têm de ser iguais (uma opção por lead).
--   · `linhas_por_situacao.escolhido` = `leads_com_veiculo_por_desfecho.ganho`;
--     perdido e descartado ficam em `em_avaliacao` e aparecem em
--     `linhas_sem_resolucao` — não se inventa motivo de descarte.
--   · `veiculos_que_nao_existem_mais`: carros que os leads apontam e que já
--     saíram de `estoque_motors` (o rótulo deles veio do `interesse` do lead,
--     ou ficou genérico — ver `rotulo_por_origem`); `ids_dos_que_sumiram` traz
--     até vinte, os mais citados primeiro.
--   · `leads_so_com_repasse`: leads cujo carro é de repasse (`repasse_id`) e
--     que ficam FORA desta entrega.
--   · `rls`: o que cada perfil leu, ao lado do que a régua de `leads` em vigor
--     manda (`mundo_da_rls` diz qual é). `comercial_apaga` tem de ser
--     `linhas:0`; `anonimo`, `barrado`.
--   · `mais_considerados` e `resumo_do_primeiro` são a saída das duas funções
--     de relatório, como o painel vai receber.
--   · `tudo_confere` resume.
--
-- O DDL e a carga daqui são cópia da migração, e
-- `tests/migracao-dos-veiculos-de-interesse.test.ts` falha se os dois
-- arquivos divergirem.
--
-- ⚠️ Criar a FK para `leads` pede uma trava em `leads` enquanto o bloco roda
-- (um instante; não bloqueia leitura). `estoque_motors` só é LIDA.
-- ⚠️ Nomes e telefones não saem no resumo: só ids de veículo, rótulos de
-- carro e contagens. As notas de descarte sairiam, mas na carga não há nenhuma.
-- ============================================================================
do $$
declare
  v_tipo      text;
  v_faltam    text;
  v_estranhas text;
  v_ja_existia    boolean;
  v_por_escopo    boolean;
  v_carga         text;
  v_carregadas    bigint := 0;
  v_leads         bigint;
  v_com_veiculo   bigint;
  v_por_desfecho  jsonb;
  v_linhas        bigint;
  v_por_situacao  jsonb;
  v_sem_resolucao bigint;
  v_distintos     bigint;
  v_sumidos       bigint;
  v_leads_sumidos bigint;
  v_sem_preco     bigint;
  v_ids_sumidos   jsonb;
  v_por_origem    jsonb;
  v_so_repasse    bigint;
  v_admin         uuid;
  v_comercial     uuid;
  v_nome          text;
  v_admin_ve      bigint;
  v_com_ve        bigint;
  v_com_esperado  bigint;
  v_com_apaga     text := 'não rodou';
  v_anon          text := 'não rodou';
  v_n             bigint;
  v_rank_linhas   bigint;
  v_rank_com      bigint;
  v_top           jsonb;
  v_resumo        jsonb;
  v_confere       jsonb;
  v_saida         jsonb;
begin

  -- --------------------------------------------------------------------------
  -- 0. A conferência prévia da migração
  -- --------------------------------------------------------------------------
  select format_type(a.atttypid, a.atttypmod) into v_tipo
    from pg_attribute a
   where a.attrelid = to_regclass('public.leads')
     and a.attname = 'veiculo_id' and not a.attisdropped;
  if v_tipo is distinct from 'bigint' then
    raise exception
      'DIVERGÊNCIA: public.leads.veiculo_id é "%" — esperado bigint, a chave de '
      'estoque_motors que a tabela nova repete. Nada foi aplicado.',
      coalesce(v_tipo, '<ausente>');
  end if;

  select string_agg(c, ', ') into v_faltam
    from unnest(array['id', 'marca', 'modelo', 'versao', 'ano', 'preco', 'vendido']) as c
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = to_regclass('public.estoque_motors')
                        and a.attname = c and not a.attisdropped);
  if v_faltam is not null then
    raise exception
      'DIVERGÊNCIA: public.estoque_motors não tem (%) — o retrato do carro e o '
      'ranking leem essas colunas. Nada foi aplicado.', v_faltam;
  end if;

  select string_agg(c, ', ') into v_faltam
    from unnest(array['desfecho', 'desfecho_em', 'interesse', 'created_at', 'atualizado_em']) as c
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = to_regclass('public.leads')
                        and a.attname = c and not a.attisdropped);
  if v_faltam is not null then
    raise exception
      'DIVERGÊNCIA: public.leads não tem (%) — a carga inicial e o resumo leem '
      'essas colunas (20260828120000). Nada foi aplicado.', v_faltam;
  end if;

  if to_regprocedure('public.is_staff(uuid)') is null
     or to_regprocedure('public.is_admin(uuid)') is null
     or to_regprocedure('public.autor_atual()') is null
     or to_regprocedure('public.org_padrao()') is null then
    raise exception
      'DEPENDÊNCIA: falta is_staff(uuid), is_admin(uuid), autor_atual() ou '
      'org_padrao(). Nada foi aplicado.';
  end if;
  if public.org_padrao() is null then
    raise exception
      'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;

  -- Sem policy de leitura em `leads`, o `exists` das policies daqui negaria
  -- tudo a todo mundo, em silêncio.
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'leads' and cmd = 'SELECT') then
    raise exception
      'DIVERGÊNCIA: public.leads não tem policy de leitura — a RLS de '
      'leads_veiculos se apoia nela. Nada foi aplicado.';
  end if;

  -- Reaplicação: a tabela, se já existe, tem de ser a daqui (senão o
  -- `create table if not exists` a pularia calado), e só com as policies
  -- daqui (uma permissiva a mais abriria a tabela por OU).
  if to_regclass('public.leads_veiculos') is not null then
    select string_agg(a.attname, ',' order by a.attname) into v_tipo
      from pg_attribute a
     where a.attrelid = 'public.leads_veiculos'::regclass
       and a.attnum > 0 and not a.attisdropped;
    if v_tipo is distinct from
       'adicionado_por,criado_em,id,lead_id,motivo_descarte,nota,org_id,resolvido_em,resolvido_por,situacao,veiculo_id,veiculo_preco,veiculo_rotulo' then
      raise exception
        'DIVERGÊNCIA: public.leads_veiculos já existe com outras colunas (%). '
        'Nada foi aplicado.', v_tipo;
    end if;

    select string_agg(policyname, ', ') into v_estranhas
      from pg_policies
     where schemaname = 'public' and tablename = 'leads_veiculos'
       and policyname not in ('leads_veiculos_leitura_pelo_lead', 'leads_veiculos_inclusao_pelo_lead',
                              'leads_veiculos_atualizacao_pelo_lead', 'leads_veiculos_exclusao_admin');
    if v_estranhas is not null then
      raise exception
        'DIVERGÊNCIA: public.leads_veiculos tem policy que o repositório não '
        'conhece (%). Nada foi aplicado.', v_estranhas;
    end if;
  end if;


  v_ja_existia := to_regclass('public.leads_veiculos') is not null;
  v_por_escopo := exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'leads'
                             and policyname = 'leads_leitura_por_escopo');

  -- --------------------------------------------------------------------------
  -- O DDL da migração, igual (sem os `comment on`)
  -- --------------------------------------------------------------------------
  -- ----------------------------------------------------------------------------
  -- 1. O rótulo do carro — "marca modelo versão ano", sem repetir
  -- ----------------------------------------------------------------------------
  -- A mesma regra de `nomeDoVeiculo` (src/lib/nomeDoVeiculo.ts): a versão só
  -- entra se o modelo já não a traz embutida, e o ano só se já não está no nome
  -- como palavra. A caixa é a do estoque (o sync grava em minúsculas; quem
  -- capitaliza é o painel, na exibição).
  create or replace function public.rotulo_de_veiculo(
    p_marca  text,
    p_modelo text,
    p_versao text,
    p_ano    integer
  )
    returns text
    language sql
    immutable
    set search_path = ''
  as $fn$
    select nullif(btrim(concat_ws(' ',
             nullif(btrim(p_marca), ''),
             nullif(btrim(p_modelo), ''),
             case when nullif(btrim(p_versao), '') is not null
                   and position(lower(btrim(p_versao))
                                in lower(concat_ws(' ', btrim(p_marca), btrim(p_modelo)))) = 0
                  then btrim(p_versao) end,
             case when p_ano is not null
                   and not (p_ano::text = any (regexp_split_to_array(
                              btrim(concat_ws(' ', p_marca, p_modelo, p_versao)), '\s+')))
                  then p_ano::text end
           )), '');
  $fn$;

  -- ----------------------------------------------------------------------------
  -- 2. A tabela
  -- ----------------------------------------------------------------------------
  create table if not exists public.leads_veiculos (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null default public.org_padrao(),
    lead_id         uuid not null references public.leads(id) on delete cascade,
    -- `estoque_motors.id`, sem FK (ver o cabeçalho).
    veiculo_id      bigint not null,
    veiculo_rotulo  text not null,
    veiculo_preco   numeric(12,2),
    situacao        text not null default 'em_avaliacao',
    motivo_descarte text,
    nota            text,
    adicionado_por  text,
    resolvido_por   text,
    criado_em       timestamptz not null default now(),
    resolvido_em    timestamptz,

    constraint leads_veiculos_lead_veiculo_unico unique (lead_id, veiculo_id),
    constraint leads_veiculos_situacao_valida
      check (situacao in ('em_avaliacao', 'escolhido', 'descartado')),
    constraint leads_veiculos_motivo_valido
      check (motivo_descarte is null
             or motivo_descarte in ('preco', 'parcela', 'km', 'ano_versao', 'cor', 'estado',
                                    'opcionais', 'troca', 'outro_da_loja', 'comprou_fora',
                                    'desistiu', 'vendido', 'outro')),
    -- Descartar pede motivo; e motivo só existe em descarte.
    constraint leads_veiculos_motivo_so_no_descarte
      check ((situacao = 'descartado') = (motivo_descarte is not null)),
    constraint leads_veiculos_outro_pede_nota
      check (motivo_descarte is distinct from 'outro' or nullif(btrim(nota), '') is not null),
    constraint leads_veiculos_resolucao_carimbada
      check ((situacao = 'em_avaliacao') = (resolvido_em is null)
             and (situacao <> 'em_avaliacao' or resolvido_por is null)),
    constraint leads_veiculos_rotulo_preenchido
      check (btrim(veiculo_rotulo) <> '' and char_length(veiculo_rotulo) <= 200),
    constraint leads_veiculos_preco_valido
      check (veiculo_preco is null or veiculo_preco >= 0),
    constraint leads_veiculos_nota_cabe
      check (nota is null or char_length(nota) <= 2000)
  );

  -- Uma opção escolhida por lead, no máximo.
  create unique index if not exists leads_veiculos_um_escolhido_por_lead
    on public.leads_veiculos (lead_id)
    where situacao = 'escolhido';

  -- O relatório lê por carro. Por lead, serve o índice da unicidade.
  create index if not exists leads_veiculos_veiculo_idx
    on public.leads_veiculos (veiculo_id, situacao);

  -- ----------------------------------------------------------------------------
  -- 3. O gatilho — carimbo não é de quem chama
  -- ----------------------------------------------------------------------------
  -- SECURITY DEFINER para ler o estoque e o nome do autor sem depender dos
  -- grants de coluna de quem grava. Só lê `estoque_motors`; só escreve em NEW.
  create or replace function public.leads_veiculos_carimbar()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
  as $fn$
  declare
    v_sessao boolean := auth.uid() is not null;
    v_autor  text;
    v_carro  record;
  begin
    if v_sessao then
      v_autor := public.autor_atual();
    end if;

    if tg_op = 'INSERT' then
      select e.marca, e.modelo, e.versao, e.ano, e.preco
        into v_carro
        from public.estoque_motors e
       where e.id = new.veiculo_id;

      if found then
        if nullif(btrim(new.veiculo_rotulo), '') is null then
          new.veiculo_rotulo := coalesce(
            public.rotulo_de_veiculo(v_carro.marca, v_carro.modelo, v_carro.versao, v_carro.ano),
            'Veículo nº ' || new.veiculo_id);
        end if;
        if v_sessao or new.veiculo_preco is null then
          new.veiculo_preco := v_carro.preco;
        end if;
      elsif v_sessao then
        raise exception
          'O veículo % não está no estoque: só entra como opção do lead um carro que existe.',
          new.veiculo_id
          using errcode = 'foreign_key_violation',
                constraint = 'leads_veiculos_veiculo_no_estoque';
      end if;

      if v_sessao then
        new.criado_em      := now();
        new.adicionado_por := v_autor;
        if new.situacao = 'em_avaliacao' then
          new.resolvido_em  := null;
          new.resolvido_por := null;
        else
          new.resolvido_em  := now();
          new.resolvido_por := v_autor;
        end if;
      elsif new.situacao is distinct from 'em_avaliacao' then
        new.resolvido_em := coalesce(new.resolvido_em, now());
      end if;

      return new;
    end if;

    -- UPDATE ------------------------------------------------------------------
    if new.lead_id is distinct from old.lead_id
       or new.veiculo_id is distinct from old.veiculo_id then
      raise exception
        'A opção não troca de lead nem de carro: adicione o outro carro e descarte este.'
        using errcode = 'check_violation',
              constraint = 'leads_veiculos_par_imutavel';
    end if;

    if v_sessao then
      new.org_id         := old.org_id;
      new.criado_em      := old.criado_em;
      new.adicionado_por := old.adicionado_por;
      new.veiculo_rotulo := old.veiculo_rotulo;
      new.veiculo_preco  := old.veiculo_preco;
    end if;

    if new.situacao is distinct from old.situacao then
      if new.situacao = 'em_avaliacao' then
        new.resolvido_em  := null;
        new.resolvido_por := null;
      elsif v_sessao then
        new.resolvido_em  := now();
        new.resolvido_por := v_autor;
      else
        -- Sem sessão: vale o que foi informado; sem nada informado, agora.
        if new.resolvido_em is not distinct from old.resolvido_em then
          new.resolvido_em := now();
        end if;
        if new.resolvido_por is not distinct from old.resolvido_por then
          new.resolvido_por := null;
        end if;
      end if;
    elsif v_sessao then
      new.resolvido_em  := old.resolvido_em;
      new.resolvido_por := old.resolvido_por;
    end if;

    return new;
  end;
  $fn$;

  drop trigger if exists trg_leads_veiculos_carimbar on public.leads_veiculos;
  create trigger trg_leads_veiculos_carimbar
    before insert or update on public.leads_veiculos
    for each row execute function public.leads_veiculos_carimbar();

  -- ----------------------------------------------------------------------------
  -- 4. Privilégios e RLS
  -- ----------------------------------------------------------------------------
  -- No Supabase, tabela nova em `public` nasce com tudo para anon e
  -- authenticated pelos default privileges: tira-se tudo e devolve-se o que é.
  revoke all on public.leads_veiculos from public, anon, authenticated;
  grant select, insert, update, delete on public.leads_veiculos to authenticated;
  grant select, insert, update, delete, truncate, references, trigger
    on public.leads_veiculos to service_role;

  alter table public.leads_veiculos enable row level security;

  drop policy if exists leads_veiculos_leitura_pelo_lead     on public.leads_veiculos;
  drop policy if exists leads_veiculos_inclusao_pelo_lead    on public.leads_veiculos;
  drop policy if exists leads_veiculos_atualizacao_pelo_lead on public.leads_veiculos;
  drop policy if exists leads_veiculos_exclusao_admin        on public.leads_veiculos;

  -- O `exists` roda na pele de quem chama: a RLS de `leads` responde.
  create policy leads_veiculos_leitura_pelo_lead on public.leads_veiculos
    for select to authenticated
    using (
      org_id = public.org_padrao()
      and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
    );

  create policy leads_veiculos_inclusao_pelo_lead on public.leads_veiculos
    for insert to authenticated
    with check (
      org_id = public.org_padrao()
      and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
    );

  create policy leads_veiculos_atualizacao_pelo_lead on public.leads_veiculos
    for update to authenticated
    using (
      org_id = public.org_padrao()
      and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
    )
    with check (
      org_id = public.org_padrao()
      and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
    );

  create policy leads_veiculos_exclusao_admin on public.leads_veiculos
    for delete to authenticated
    using (
      public.is_admin(auth.uid())
      and org_id = public.org_padrao()
      and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
    );

  -- ----------------------------------------------------------------------------
  -- 5. Os relatórios — só agregados
  -- ----------------------------------------------------------------------------
  create or replace function public.resumo_de_interesse_do_veiculo(p_veiculo bigint)
    returns table (
      veiculo_id            bigint,
      total                 integer,
      em_avaliacao          integer,
      sem_resolucao         integer,
      escolhido             integer,
      descartado            integer,
      motivos               jsonb,
      notas                 jsonb,
      primeiro_interesse_em timestamptz,
      ultimo_interesse_em   timestamptz
    )
    language plpgsql
    stable
    security definer
    set search_path = ''
  as $fn$
  #variable_conflict use_column
  begin
    if not public.is_staff(auth.uid()) then
      raise exception 'O resumo de interesse por veículo é restrito à equipe.'
        using errcode = 'insufficient_privilege';
    end if;

    return query
    with linhas as (
      select v.situacao, v.motivo_descarte, v.nota, v.criado_em, v.resolvido_em,
             (l.desfecho is not null) as lead_encerrado
        from public.leads_veiculos v
        join public.leads l on l.id = v.lead_id
       where v.veiculo_id = p_veiculo
         and v.org_id = public.org_padrao()
    )
    select p_veiculo,
           count(*)::integer,
           (count(*) filter (where x.situacao = 'em_avaliacao'))::integer,
           (count(*) filter (where x.situacao = 'em_avaliacao' and x.lead_encerrado))::integer,
           (count(*) filter (where x.situacao = 'escolhido'))::integer,
           (count(*) filter (where x.situacao = 'descartado'))::integer,
           coalesce((
             select jsonb_agg(jsonb_build_object('motivo', m.motivo_descarte, 'total', m.n)
                              order by m.n desc, m.motivo_descarte)
               from (select y.motivo_descarte, count(*)::integer as n
                       from linhas y
                      where y.situacao = 'descartado'
                      group by y.motivo_descarte) m
           ), '[]'::jsonb),
           coalesce((
             select jsonb_agg(jsonb_build_object('motivo', n.motivo_descarte,
                                                 'nota', btrim(n.nota),
                                                 'em', n.resolvido_em)
                              order by n.resolvido_em desc, n.motivo_descarte, n.nota)
               from (select y.motivo_descarte, y.nota, y.resolvido_em
                       from linhas y
                      where y.situacao = 'descartado'
                        and nullif(btrim(y.nota), '') is not null
                      order by y.resolvido_em desc
                      limit 200) n
           ), '[]'::jsonb),
           min(x.criado_em),
           max(x.criado_em)
      from linhas x;
  end;
  $fn$;

  create or replace function public.interesse_por_veiculo()
    returns table (
      veiculo_id          bigint,
      veiculo_rotulo      text,
      no_estoque          boolean,
      vendido             boolean,
      preco_atual         numeric,
      total               integer,
      em_avaliacao        integer,
      sem_resolucao       integer,
      escolhido           integer,
      descartado          integer,
      motivo_principal    text,
      motivos             jsonb,
      ultimo_interesse_em timestamptz
    )
    language plpgsql
    stable
    security definer
    set search_path = ''
  as $fn$
  #variable_conflict use_column
  begin
    if not public.is_staff(auth.uid()) then
      raise exception 'O interesse por veículo é restrito à equipe.'
        using errcode = 'insufficient_privilege';
    end if;

    return query
    with linhas as (
      select v.veiculo_id as carro, v.veiculo_rotulo as rotulo, v.situacao,
             v.motivo_descarte, v.criado_em,
             (l.desfecho is not null) as lead_encerrado
        from public.leads_veiculos v
        join public.leads l on l.id = v.lead_id
       where v.org_id = public.org_padrao()
    ),
    por_carro as (
      select x.carro,
             count(*)::integer                                                    as n_total,
             (count(*) filter (where x.situacao = 'em_avaliacao'))::integer       as n_aval,
             (count(*) filter (where x.situacao = 'em_avaliacao'
                                 and x.lead_encerrado))::integer                  as n_sem,
             (count(*) filter (where x.situacao = 'escolhido'))::integer          as n_esc,
             (count(*) filter (where x.situacao = 'descartado'))::integer         as n_desc,
             max(x.criado_em)                                                     as ultimo,
             (array_agg(x.rotulo order by x.criado_em desc))[1]                   as rotulo
        from linhas x
       group by x.carro
    ),
    motivos_por_carro as (
      select m.carro,
             jsonb_agg(jsonb_build_object('motivo', m.motivo_descarte, 'total', m.n)
                       order by m.n desc, m.motivo_descarte)                      as lista,
             (array_agg(m.motivo_descarte order by m.n desc, m.motivo_descarte))[1] as principal
        from (select y.carro, y.motivo_descarte, count(*)::integer as n
                from linhas y
               where y.situacao = 'descartado'
               group by y.carro, y.motivo_descarte) m
       group by m.carro
    )
    select coalesce(e.id, c.carro),
           coalesce(public.rotulo_de_veiculo(e.marca, e.modelo, e.versao, e.ano),
                    c.rotulo,
                    'Veículo nº ' || coalesce(e.id, c.carro)),
           e.id is not null,
           case when e.id is not null then coalesce(e.vendido, false) end,
           e.preco,
           coalesce(c.n_total, 0),
           coalesce(c.n_aval, 0),
           coalesce(c.n_sem, 0),
           coalesce(c.n_esc, 0),
           coalesce(c.n_desc, 0),
           mc.principal,
           coalesce(mc.lista, '[]'::jsonb),
           c.ultimo
      from public.estoque_motors e
      full join por_carro c on c.carro = e.id
      left join motivos_por_carro mc on mc.carro = coalesce(e.id, c.carro)
     order by coalesce(c.n_total, 0) desc, c.ultimo desc nulls last, coalesce(e.id, c.carro);
  end;
  $fn$;

  revoke all on function public.rotulo_de_veiculo(text, text, text, integer)   from public, anon;
  revoke all on function public.leads_veiculos_carimbar()                      from public, anon, authenticated;
  revoke all on function public.resumo_de_interesse_do_veiculo(bigint)         from public, anon;
  revoke all on function public.interesse_por_veiculo()                        from public, anon;
  grant execute on function public.rotulo_de_veiculo(text, text, text, integer) to authenticated, service_role;
  grant execute on function public.resumo_de_interesse_do_veiculo(bigint)       to authenticated, service_role;
  grant execute on function public.interesse_por_veiculo()                      to authenticated, service_role;


  -- --------------------------------------------------------------------------
  -- 6. A carga inicial, igual — só com a tabela vazia
  -- --------------------------------------------------------------------------
  if exists (select 1 from public.leads_veiculos) then
    v_carga := 'pulada';
  else
    insert into public.leads_veiculos
      (lead_id, veiculo_id, veiculo_rotulo, veiculo_preco, situacao, criado_em, resolvido_em)
    select l.id,
           l.veiculo_id,
           coalesce(public.rotulo_de_veiculo(e.marca, e.modelo, e.versao, e.ano),
                    left(nullif(btrim(l.interesse), ''), 200),
                    'Veículo nº ' || l.veiculo_id),
           e.preco,
           case when l.desfecho = 'ganho' then 'escolhido' else 'em_avaliacao' end,
           l.created_at,
           case when l.desfecho = 'ganho'
                then coalesce(l.desfecho_em, l.atualizado_em, l.created_at) end
      from public.leads l
      left join public.estoque_motors e on e.id = l.veiculo_id
     where l.veiculo_id is not null;

    get diagnostics v_carregadas = row_count;
    v_carga := 'feita';
  end if;

  -- --------------------------------------------------------------------------
  -- 7. O que a carga deixou (na pele do dono)
  -- --------------------------------------------------------------------------
  select count(*), count(*) filter (where veiculo_id is not null)
    into v_leads, v_com_veiculo
    from public.leads;

  select jsonb_build_object(
           'aberto',     count(*) filter (where desfecho is null),
           'ganho',      count(*) filter (where desfecho = 'ganho'),
           'perdido',    count(*) filter (where desfecho = 'perdido'),
           'descartado', count(*) filter (where desfecho = 'descartado'))
    into v_por_desfecho
    from public.leads
   where veiculo_id is not null;

  select count(*),
         jsonb_build_object(
           'em_avaliacao', count(*) filter (where situacao = 'em_avaliacao'),
           'escolhido',    count(*) filter (where situacao = 'escolhido'),
           'descartado',   count(*) filter (where situacao = 'descartado'))
    into v_linhas, v_por_situacao
    from public.leads_veiculos;

  select count(*) into v_sem_resolucao
    from public.leads_veiculos v
    join public.leads l on l.id = v.lead_id
   where v.situacao = 'em_avaliacao' and l.desfecho is not null;

  select count(distinct v.veiculo_id),
         count(distinct v.veiculo_id) filter (where e.id is null),
         count(*) filter (where e.id is null),
         count(*) filter (where v.veiculo_preco is null),
         jsonb_build_object(
           'do_estoque',           count(*) filter (where e.id is not null),
           'do_interesse_do_lead', count(*) filter (where e.id is null and v.veiculo_rotulo not like 'Veículo nº %'),
           'generico',             count(*) filter (where e.id is null and v.veiculo_rotulo like 'Veículo nº %'))
    into v_distintos, v_sumidos, v_leads_sumidos, v_sem_preco, v_por_origem
    from public.leads_veiculos v
    left join public.estoque_motors e on e.id = v.veiculo_id;

  select coalesce(jsonb_agg(x.veiculo_id order by x.n desc, x.veiculo_id), '[]'::jsonb)
    into v_ids_sumidos
    from (select v.veiculo_id, count(*) as n
            from public.leads_veiculos v
           where not exists (select 1 from public.estoque_motors e where e.id = v.veiculo_id)
           group by v.veiculo_id
           order by count(*) desc, v.veiculo_id
           limit 20) x;

  -- Leads cujo carro é de repasse: ficam fora desta entrega. A coluna é da
  -- 20260924180000; sem ela, não há o que contar.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'leads' and column_name = 'repasse_id') then
    execute 'select count(*) from public.leads where repasse_id is not null and veiculo_id is null'
       into v_so_repasse;
  end if;

  -- --------------------------------------------------------------------------
  -- 8. Perfis de verdade: o que cada um lê
  -- --------------------------------------------------------------------------
  select p.id into v_admin
    from public.profiles p
   where p.is_active and 'admin' = any (p.papeis)
   order by p.created_at limit 1;
  if v_admin is null then
    raise exception 'ENSAIO_SEM_ADMIN: não há perfil ativo com papel admin — ninguém leria os relatórios nem apagaria opção.';
  end if;

  -- O Comercial puro com mais leads no nome: é nele que o escopo aparece.
  select p.id, btrim(p.full_name) into v_comercial, v_nome
    from public.profiles p
   where p.is_active and 'comercial' = any (p.papeis)
     and not (p.papeis && array['admin', 'gestor', 'sdr'])
     and nullif(btrim(p.full_name), '') is not null
   order by (select count(*) from public.leads l
              where btrim(l.responsavel) = btrim(p.full_name)) desc,
            p.created_at
   limit 1;

  -- O que a régua de `leads` em vigor manda o Comercial ver: tudo (is_staff)
  -- ou as opções dos leads dele (escopo).
  if v_comercial is not null then
    if v_por_escopo then
      select count(*) into v_com_esperado
        from public.leads_veiculos v
        join public.leads l on l.id = v.lead_id
       where btrim(l.responsavel) = v_nome;
    else
      v_com_esperado := v_linhas;
    end if;
  end if;

  -- Admin: a tabela inteira, e os dois relatórios como o painel vai receber.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_admin_ve from public.leads_veiculos;
  select count(*), count(*) filter (where x.total > 0)
    into v_rank_linhas, v_rank_com
    from public.interesse_por_veiculo() x;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.total desc, t.veiculo_id), '[]'::jsonb) into v_top
    from (select x.veiculo_id, x.veiculo_rotulo, x.no_estoque, x.vendido, x.total,
                 x.em_avaliacao, x.sem_resolucao, x.escolhido, x.descartado
            from public.interesse_por_veiculo() x
           where x.total > 0
           order by x.total desc, x.veiculo_id
           limit 5) t;
  if jsonb_array_length(v_top) > 0 then
    select to_jsonb(x) into v_resumo
      from public.resumo_de_interesse_do_veiculo((v_top->0->>'veiculo_id')::bigint) x;
  end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- Comercial: lê o que o lead deixa, e não apaga.
  if v_comercial is not null then
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_comercial, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_com_ve from public.leads_veiculos;
    begin
      delete from public.leads_veiculos;
      get diagnostics v_n = row_count;
      v_com_apaga := 'linhas:' || v_n;
    exception when insufficient_privilege then
      v_com_apaga := 'barrado';
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
  end if;

  -- Anônimo: para no privilégio.
  begin
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    set local role anon;
    perform 1 from public.leads_veiculos limit 1;
    v_anon := 'leu';
  exception when insufficient_privilege then
    v_anon := 'barrado';
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- --------------------------------------------------------------------------
  -- 9. O resumo — e o erro que desfaz tudo
  -- --------------------------------------------------------------------------
  v_confere := jsonb_build_object(
    'uma_opcao_por_lead_com_veiculo',
      v_carga = 'pulada' or v_linhas = v_com_veiculo,
    'ganho_virou_escolhido',
      v_carga = 'pulada' or (v_por_situacao->>'escolhido')::bigint = (v_por_desfecho->>'ganho')::bigint,
    'nenhum_descarte_inventado',
      v_carga = 'pulada' or (v_por_situacao->>'descartado')::bigint = 0,
    'admin_le_tudo',            v_admin_ve = v_linhas,
    'comercial_le_o_esperado',  v_comercial is null or v_com_ve = v_com_esperado,
    'comercial_nao_apaga',      v_comercial is null or v_com_apaga = 'linhas:0',
    'anonimo_barrado',          v_anon = 'barrado',
    'ranking_cobre_os_carros',  v_rank_com = v_distintos);

  v_saida := jsonb_build_object(
    'migracao',                        '20261005120000_veiculos_de_interesse',
    'tabela_ja_existia',               v_ja_existia,
    'carga',                           v_carga,
    'linhas_carregadas',               v_carregadas,
    'mundo_da_rls',                    case when v_por_escopo then 'leads por escopo (20261003130000 aplicada)'
                                            else 'leads por is_staff (20261003130000 ainda não aplicada)' end,
    'leads',                           v_leads,
    'leads_com_veiculo',               v_com_veiculo,
    'leads_com_veiculo_por_desfecho',  v_por_desfecho,
    'leads_so_com_repasse',            v_so_repasse,
    'linhas',                          v_linhas,
    'linhas_por_situacao',             v_por_situacao,
    'linhas_sem_resolucao',            v_sem_resolucao,
    'linhas_sem_preco',                v_sem_preco,
    'rotulo_por_origem',               v_por_origem,
    'veiculos_distintos',              v_distintos,
    'veiculos_que_nao_existem_mais',   v_sumidos,
    'leads_em_veiculo_que_nao_existe_mais', v_leads_sumidos,
    'ids_dos_que_sumiram',             v_ids_sumidos,
    'rls', jsonb_build_object(
      'admin_ve',           v_admin_ve,
      'comercial_ve',       v_com_ve,
      'comercial_esperado', v_com_esperado,
      'comercial_apaga',    v_com_apaga,
      'anonimo',            v_anon),
    'ranking', jsonb_build_object('linhas', v_rank_linhas, 'com_interesse', v_rank_com),
    'mais_considerados',               v_top,
    'resumo_do_primeiro',              v_resumo,
    'confere',                         v_confere,
    'tudo_confere',                    not exists (select 1 from jsonb_each(v_confere) c
                                                    where c.value is distinct from 'true'::jsonb));

  raise exception 'ENSAIO_DESFEITO %', v_saida::text;
end $$;
