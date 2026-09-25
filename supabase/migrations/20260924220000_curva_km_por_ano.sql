-- ============================================================================
-- A curva de deságio ganha `km_por_ano` (2026-09-24)
-- ============================================================================
--
-- A régua de compra do site passou a ser a curva da spec 11 lida da linha
-- vigente de `public.parametros_avaliacao` (src/lib/avaliacaoRecomendacao.ts,
-- `lerParametrosDaCurva`). O degrau de km da curva mede o DESVIO sobre o km
-- esperado: `km − km_por_ano × idade`, e esse desvio cai nos `degraus_km`.
-- O 15.000 dessa conta, até aqui, só existia num comentário da f0f ("desvio vs
-- 15.000 × idade") e na spec 11. É regra — e regra não mora no código: vira
-- coluna da curva, com a mesma vigência datada das outras.
--
-- Sem a coluna, `lerParametrosDaCurva` devolve null e a avaliação sai sem
-- sugestão: seguro (nenhuma régua inventada), mas inútil. Esta migração é o
-- que faz a sugestão aparecer.
--
-- ---------------------------------------------------------------------------
-- Por que a linha vigente recebe 15.000 SEM violar a vigência
-- ---------------------------------------------------------------------------
-- A regra das tabelas de parâmetro (D-T1.7, `nucleo_so_encerra_vigencia`):
-- valor vigente nunca sofre UPDATE — encerra-se a vigência e insere-se a nova.
-- Esta migração não faz UPDATE nenhum:
--   * `add column ... not null default 15000` preenche as linhas existentes
--     pelo "default rápido" do Postgres (o valor fica no catálogo, a tabela
--     não é reescrita) e NÃO dispara gatilho de UPDATE — o guarda
--     `parametros_avaliacao_vigencia` nem é chamado;
--   * e não muda o que a linha vigente significa: 15.000 × idade já ERA a
--     régua dela (spec 11; comentário de `degraus_km` na f0f). A coluna torna
--     explícito o que a linha já dizia. Encerrar e reabrir a vigência só para
--     isso trocaria o `id` e o `vigencia_desde` que cada avaliação gravada
--     guarda como "a régua que produziu a sugestão", sem mudar régua nenhuma.
--
-- Depois do preenchimento, o DEFAULT sai (decisão desta migração): nenhum
-- outro parâmetro da curva tem default (f0f: base, piso, teto, degraus e
-- faixas são `not null` sem default), e um default aqui faria cada vigência
-- nova herdar 15.000 calada, com o valor da régua morando no schema em vez
-- da linha. Sem default, a vigência nova que esquecer o `km_por_ano` é
-- recusada (`not_null_violation`) — a autoconferência prova. As linhas que
-- já existiam continuam com 15.000: tirar o default não mexe no valor que o
-- "default rápido" gravou.
--
-- ---------------------------------------------------------------------------
-- O resto, conferido e intocado
-- ---------------------------------------------------------------------------
--   * Grants: os de `parametros_avaliacao` são de tabela inteira; coluna nova
--     herda. `anon` foi tirado da tabela pela f0l e continua sem nada — o
--     aceite confere. `service_role` (quem `/api/avaliacao` usa para ler a
--     curva) e `authenticated` (a tela da F1, recortada pela RLS de staff)
--     leem a coluna.
--   * RLS e policies (`nucleo_staff_*`, f0f): intocadas.
--   * Gatilho: o único da tabela continua sendo `parametros_avaliacao_vigencia`,
--     e ele passa a guardar `km_por_ano` também — o guarda compara a linha
--     inteira (`to_jsonb(new) - 'vigencia_ate'`), então editar o km_por_ano
--     vigente é recusado como qualquer outro parâmetro.
--   * `ciclo_parametros.franquia_km_ano` também é 15.000 hoje (Emenda 02, E4:
--     "já era o teto do §1.2"). São parâmetros SEPARADOS — a franquia do
--     contrato de recompra e o km esperado da avaliação de compra — e podem
--     divergir por vigência nova de um deles. Nada aqui os amarra.
--
-- Aditiva e idempotente: `add column if not exists`, constraint só se não
-- existir, `drop default` é no-op na reaplicação. Nenhum DROP/RENAME/ALTER
-- TYPE de objeto em uso. Não é tabela nova (a regra de `org_id` já vale nela).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A coluna, preenchida pelo default rápido — sem UPDATE, sem gatilho
-- ----------------------------------------------------------------------------
alter table public.parametros_avaliacao
  add column if not exists km_por_ano integer not null default 15000;

-- O valor da régua mora na LINHA, não no schema (ver o cabeçalho).
alter table public.parametros_avaliacao
  alter column km_por_ano drop default;


-- ----------------------------------------------------------------------------
-- 2. A regra, nomeada
-- ----------------------------------------------------------------------------
-- Zero ou negativo não é km esperado: com zero, todo carro rodado cairia no
-- último degrau; com negativo, o desvio cresce com a idade ao contrário.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.parametros_avaliacao'::regclass
                    and conname = 'parametros_avaliacao_km_por_ano_positivo') then
    alter table public.parametros_avaliacao
      add constraint parametros_avaliacao_km_por_ano_positivo
      check (km_por_ano > 0);
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 3. O que a coluna é, para quem abrir o banco sem abrir o código
-- ----------------------------------------------------------------------------
comment on column public.parametros_avaliacao.km_por_ano is
  'Quilometragem esperada por ano de idade do carro (2026-09-24). O km '
  'esperado é km_por_ano × idade em anos; o desvio (km − km_por_ano × idade) '
  'cai nos degraus_km. 15.000 é a régua da spec 11 ("desvio vs 15.000 × '
  'idade") e a mesma franquia de 15.000 km/ano do Manual do Ciclo (§1.2 / '
  'Emenda 02) — mas é parâmetro desta curva, separado de '
  'ciclo_parametros.franquia_km_ano. Sem default: cada vigência nova diz o '
  'seu; mudar é encerrar a vigência e inserir linha nova (D-T1.7). Maior que '
  'zero (CHECK parametros_avaliacao_km_por_ano_positivo). Lido por '
  'lerParametrosDaCurva (src/lib/avaliacaoRecomendacao.ts): sem ele, a '
  'avaliação sai sem sugestão.';


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. A parte de efeito tenta violar a regra,
-- tenta editar o parâmetro vigente e faz o ciclo inteiro de uma vigência
-- (encerra a atual, insere a nova) — num sub-bloco que termina com um
-- sentinela, e o rollback do sub-bloco leva tudo junto, inclusive o
-- encerramento da linha vigente e qualquer `set local role`. As variáveis
-- sobrevivem ao rollback (plpgsql não desfaz variável), e é por elas que o
-- veredito sai. Nada fica gravado — nem em produção, nem numa reaplicação.
-- Sem data fixa: tudo relativo a `current_date`.
do $aceite$
declare
  falhas          int := 0;
  v_tipo          text;
  v_notnull       boolean;
  v_tem_default   boolean;
  v_def           text;
  v_vigente       uuid;
  v_km_vigente    int;
  v_vigentes      int;
  v_linhas_antes  int;
  v_linhas_depois int;
  v_valor         int;
  v_regra         text;
  v_recusas       int := 0;
  v_sem_km        text := '<não rodou>';
  v_edita         text := '<não rodou>';
  v_encerra       text := '<não rodou>';
  v_nova          uuid;
  v_km_nova       int := -1;
  v_vigentes_meio int := -1;
  v_anon          text := '<não rodou>';
begin
  -- 1 · A coluna: integer, not null, sem default.
  select format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasdef
    into v_tipo, v_notnull, v_tem_default
    from pg_attribute a
   where a.attrelid = 'public.parametros_avaliacao'::regclass
     and a.attname  = 'km_por_ano' and not a.attisdropped;
  if v_tipo is distinct from 'integer' or not v_notnull then
    raise exception 'ACEITE FALHOU: parametros_avaliacao.km_por_ano é "%" (not null = %), esperado integer not null',
      coalesce(v_tipo, '<ausente>'), v_notnull;
  end if;
  if v_tem_default then
    falhas := falhas + 1;
    raise warning 'FALHOU: km_por_ano ficou com default — vigência nova herdaria o valor calada';
  end if;

  if col_description('public.parametros_avaliacao'::regclass,
       (select attnum from pg_attribute
         where attrelid = 'public.parametros_avaliacao'::regclass and attname = 'km_por_ano')) is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: km_por_ano sem comentário';
  end if;

  -- 2 · A regra existe com nome, é a de "maior que zero" e está validada.
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.parametros_avaliacao'::regclass
     and conname  = 'parametros_avaliacao_km_por_ano_positivo'
     and contype  = 'c' and convalidated;
  if v_def is distinct from 'CHECK ((km_por_ano > 0))' then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_avaliacao_km_por_ano_positivo é "%", esperado "CHECK ((km_por_ano > 0))"',
      coalesce(v_def, '<ausente ou não validada>');
  end if;

  -- 3 · A linha vigente: uma só (f0j), e com os 15.000 que já eram a régua dela.
  select count(*) into v_vigentes
    from public.parametros_avaliacao
   where vigencia_ate is null and org_id = public.org_padrao();
  select id, km_por_ano into v_vigente, v_km_vigente
    from public.parametros_avaliacao
   where vigencia_ate is null and org_id = public.org_padrao();
  if v_vigentes <> 1 then
    raise exception 'ACEITE FALHOU: % curva(s) vigente(s) — esperado 1; sem ela a avaliação sai sem sugestão',
      v_vigentes;
  end if;
  if v_km_vigente is distinct from 15000 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a curva vigente tem km_por_ano = %, esperado 15000', v_km_vigente;
  end if;

  -- 4 · Quem lê: anon continua sem nada (f0l); a chave de serviço (/api/avaliacao)
  --     e o painel (recortado pela RLS de staff) leem a coluna nova.
  if has_table_privilege('anon', 'public.parametros_avaliacao', 'SELECT')
     or has_column_privilege('anon', 'public.parametros_avaliacao', 'km_por_ano', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon lê parametros_avaliacao — a f0l tinha fechado';
  end if;
  if not has_column_privilege('service_role', 'public.parametros_avaliacao', 'km_por_ano', 'SELECT')
     or not has_column_privilege('authenticated', 'public.parametros_avaliacao', 'km_por_ano', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role ou authenticated não lê km_por_ano — a avaliação sairia sem sugestão';
  end if;

  -- 5 · O guarda de vigência continua de pé.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.parametros_avaliacao'::regclass
                    and tgname  = 'parametros_avaliacao_vigencia'
                    and tgfoid  = 'public.nucleo_so_encerra_vigencia()'::regprocedure
                    and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_avaliacao_vigencia não está ligado a nucleo_so_encerra_vigencia';
  end if;

  select count(*) into v_linhas_antes from public.parametros_avaliacao;

  -- 6 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    -- 6a · anon, pelo efeito: sem privilégio, a leitura nem começa.
    begin
      set local role anon;
      perform 1 from public.parametros_avaliacao limit 1;
      reset role;
      v_anon := 'leu';
    exception when insufficient_privilege then v_anon := 'negado';
    end;

    -- 6b · Zero e negativo são recusados, pela regra certa. A linha de prova é
    --      uma vigência FUTURA e já encerrada (vigencia_ate preenchida): fica
    --      fora do índice de "uma vigente por org" (f0j) e não passa pelo
    --      gatilho, que é só de UPDATE. Copia a curva vigente para que só o
    --      km_por_ano possa ser o motivo da recusa.
    foreach v_valor in array array[0, -1, -15000] loop
      begin
        insert into public.parametros_avaliacao
          (base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,
           avaria_leve_pp, avaria_seria_pp, pendencia_pp, descricao,
           km_por_ano, vigencia_desde, vigencia_ate)
        select base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,
               avaria_leve_pp, avaria_seria_pp, pendencia_pp, 'Aceite km_por_ano',
               v_valor, current_date + 365, current_date + 730
          from public.parametros_avaliacao where id = v_vigente;
        falhas := falhas + 1;
        raise warning 'FALHOU: parametros_avaliacao aceitou km_por_ano = %', v_valor;
      exception when check_violation then
        get stacked diagnostics v_regra = constraint_name;
        if v_regra = 'parametros_avaliacao_km_por_ano_positivo' then
          v_recusas := v_recusas + 1;
        else
          falhas := falhas + 1;
          raise warning 'FALHOU: km_por_ano = % foi recusado por "%", não pela regra do km', v_valor, v_regra;
        end if;
      end;
    end loop;

    -- 6c · Vigência nova sem km_por_ano é recusada — não herda 15.000 calada.
    begin
      insert into public.parametros_avaliacao
        (base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,
         avaria_leve_pp, avaria_seria_pp, pendencia_pp, descricao,
         vigencia_desde, vigencia_ate)
      select base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,
             avaria_leve_pp, avaria_seria_pp, pendencia_pp, 'Aceite km_por_ano',
             current_date + 365, current_date + 730
        from public.parametros_avaliacao where id = v_vigente;
      v_sem_km := 'aceitou';
    exception when not_null_violation then v_sem_km := 'recusou';
    end;

    -- 6d · O km_por_ano vigente não se edita (D-T1.7): o guarda o recusa como
    --      recusa qualquer outro parâmetro vigente.
    begin
      update public.parametros_avaliacao set km_por_ano = 18000 where id = v_vigente;
      v_edita := 'editou';
    exception when raise_exception then v_edita := 'recusou';
    end;

    -- 6e · O caminho CERTO para mudar a régua continua aberto com a coluna
    --      nova: encerra a vigência atual e insere a próxima, com o km dela.
    begin
      update public.parametros_avaliacao set vigencia_ate = current_date where id = v_vigente;
      v_encerra := 'encerrou';
    exception when raise_exception then v_encerra := 'recusou';
    end;

    insert into public.parametros_avaliacao
      (base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,
       avaria_leve_pp, avaria_seria_pp, pendencia_pp, descricao, km_por_ano)
    select base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,
           avaria_leve_pp, avaria_seria_pp, pendencia_pp, 'Aceite km_por_ano', 18000
      from public.parametros_avaliacao where id = v_vigente
    returning id, km_por_ano into v_nova, v_km_nova;

    select count(*) into v_vigentes_meio
      from public.parametros_avaliacao
     where vigencia_ate is null and org_id = public.org_padrao();

    raise exception 'DESFAZER_ACEITE_KM_POR_ANO' using errcode = 'KMA01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'KMA01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_anon <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon % parametros_avaliacao', v_anon;
  end if;
  if v_recusas <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % de 3 valores não positivos foram recusados pela regra do km', v_recusas;
  end if;
  if v_sem_km <> 'recusou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: vigência nova sem km_por_ano %, esperado recusar', v_sem_km;
  end if;
  if v_edita <> 'recusou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o km_por_ano vigente foi editado — o guarda D-T1.7 não o cobre';
  end if;
  if v_encerra <> 'encerrou' or v_nova is null or v_km_nova <> 18000 or v_vigentes_meio <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: encerrar e inserir a próxima vigência não funcionou (encerra %, nova %, km %, vigentes %)',
      v_encerra, v_nova, v_km_nova, v_vigentes_meio;
  end if;

  -- Nada da prova ficou: a vigente é a mesma, aberta e com o km de antes.
  select count(*) into v_linhas_depois from public.parametros_avaliacao;
  if v_linhas_depois <> v_linhas_antes
     or not exists (select 1 from public.parametros_avaliacao
                     where id = v_vigente and vigencia_ate is null
                       and km_por_ano is not distinct from v_km_vigente) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (linhas % → %) ou mexeu na vigente', v_linhas_antes, v_linhas_depois;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no km_por_ano da curva', falhas;
  end if;

  raise notice
    'Aceite verificado: parametros_avaliacao ganhou km_por_ano (integer, not '
    'null, sem default, > 0); a curva vigente tem 15000 sem ter sofrido UPDATE; '
    'zero e negativo são recusados pela regra do km e vigência nova sem km é '
    'recusada; o km vigente não se edita e o ciclo encerra-e-insere segue '
    'aberto; anon continua sem ler a tabela, service_role e o painel leem a '
    'coluna; a prova não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20260924220000', 'curva_km_por_ano')
  on conflict (version) do nothing;
