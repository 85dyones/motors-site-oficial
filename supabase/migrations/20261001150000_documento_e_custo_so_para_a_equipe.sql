-- ============================================================================
-- Documento e custo só para a equipe — o authenticated lê a tabela como o anon
-- ============================================================================
-- Achado de 2026-10-01, no mapeamento dos dados do estoque. A migração
-- 20260929220000 fechou placa, chassi, renavam, custo e FIPE para o `anon` e
-- deixou o `authenticated` com SELECT na tabela inteira, de propósito ("fechar
-- para eles pede outro desenho", dizia ela). Só que `authenticated` não é
-- "equipe": cliente da Garagem e investidor com login também são — hoje, duas
-- contas ativas. Com a própria sessão, qualquer uma delas fazia
--
--   GET /rest/v1/estoque_motors?select=placa,chassi,renavam,preco_compra
--
-- e recebia os documentos e o custo de compra de todo o pátio. A matriz de
-- permissões (A17) diz que custo é de Admin, Gestor e Financeiro; até aqui
-- isso só valia na aplicação.
--
-- ---------------------------------------------------------------------------
-- O desenho: a coluna fecha na tabela, e a equipe lê por uma view própria
-- ---------------------------------------------------------------------------
-- RLS não recorta coluna, e privilégio de coluna não distingue usuário — o
-- cliente e o vendedor são o mesmo papel `authenticated`. Então:
--
--   1. `estoque_motors_equipe`: `select e.*` da tabela, cortado por
--      `is_staff(auth.uid())`. Roda como DONA, e é de propósito — o molde é
--      `vw_ciclo_estado_painel`: com `security_invoker` ela leria a tabela na
--      pele de quem pergunta, e o `authenticated` não lê mais as internas. O
--      corte é o WHERE; `security_barrier` garante que nenhum filtro vindo da
--      URL seja avaliado antes dele.
--   2. Na TABELA, o `authenticated` passa a ler só a lista pública — a mesma
--      do `anon`, `COLUNAS_PUBLICAS_DO_ESTOQUE` em `src/lib/colunasDoEstoque.ts`.
--
-- O código do painel lê documento e custo pela view (`lerComoEquipe`) e todo
-- o resto pela lista pública (`tests/documento-e-custo-so-para-a-equipe`).
--
-- O que NÃO muda:
--   - INSERT e UPDATE do `authenticated`. O cadastro nativo grava placa,
--     chassi, renavam e custo (`cadastrar_veiculo_nativo`, invoker), e o
--     editor grava placa; escrever não exige ler a coluna. A RLS de escrita
--     (`is_staff`) segue sendo quem decide.
--   - A policy de leitura por linha (`USING (true)`): a vitrine continua.
--   - O `anon` (20260929220000) e o `service_role` (n8n, sync).
--   - O custo DENTRO da equipe segue na aplicação. Mascará-lo aqui para
--     Comercial e Marketing desarmaria em silêncio o piso de custo
--     (`recusaPorPisoDeCusto`) de quem um dia mexer em preço sem ver custo —
--     a mensagem para esse caso já existe. Fica como decisão à parte.
--
-- ⚠️ ORDEM DE APLICAÇÃO. Esta migração só pode ser aplicada DEPOIS do deploy
-- do código da mesma PR. O código anterior lê o painel com `select("*")` da
-- tabela, que o PostgREST recusa INTEIRO quando falta privilégio em qualquer
-- coluna: o estoque do painel e o editor cairiam. O código novo funciona dos
-- dois lados — sem a view, `lerComoEquipe` lê a tabela e avisa no log.
--
-- ⚠️ NUMA TRANSAÇÃO SÓ. O revoke sem o grant deixa o `authenticated` sem
-- leitura nenhuma, e a área do investidor cai. `aplicar-migracao.js` já roda
-- tudo junto; `psql -f` precisa de `-1`.
--
-- ⚠️ DESFAZER: `supabase/manutencao/reversao/documento-e-custo-2026-10-01.sql`
-- devolve a tabela ao `authenticated` e mantém a view. Rode ANTES de voltar o
-- código para um deploy anterior a esta PR.
--
-- ⚠️ COLUNA NOVA em `estoque_motors` nasce fechada para os dois papéis e fora
-- da view (`e.*` se expande na criação). Pública: entra em
-- `COLUNAS_PUBLICAS_DO_ESTOQUE` e num `grant select (coluna) … to anon,
-- authenticated`. Em qualquer caso, a mesma migração recria a view. A
-- autoconferência abaixo falha se a tabela tiver coluna fora das duas listas
-- ou se a view não tiver as colunas da tabela.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A porta da equipe
-- ---------------------------------------------------------------------------
create or replace view public.estoque_motors_equipe
  with (security_barrier = true)
as
select e.* from public.estoque_motors e
 where public.is_staff(auth.uid());

comment on view public.estoque_motors_equipe is
  'O estoque inteiro, com placa, chassi, renavam, custo e FIPE, para quem é '
  'da equipe (is_staff). Roda como dona de propósito: o authenticated não lê '
  'essas colunas na tabela desde 20261001150000. Só leitura. Coluna nova em '
  'estoque_motors exige recriar esta view na mesma migração.';

-- Uma view simples é ATUALIZÁVEL no Postgres, e esta roda como dona: um
-- UPDATE ou DELETE por ela passaria por cima da RLS de escrita da tabela. Só
-- SELECT, e só para o authenticated.
revoke all on public.estoque_motors_equipe from public, anon, authenticated;
grant select on public.estoque_motors_equipe to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A tabela: o authenticated lê o que o anon lê
-- ---------------------------------------------------------------------------
revoke select on public.estoque_motors from authenticated;

grant select (
  id, marca, modelo, versao, ano, ano_fabricacao, preco, preco_original,
  preco_promocional, quilometragem, cambio, combustivel, cor, tipo, perfil_uso,
  url_imagem, link_conversao, pericia, whatsapp_images, web_full_images,
  created_at, descricao, laudo_pericia, opcionais, status_tag,
  status_tag_color, vendido, last_seen_at, motor, cor_interna,
  donos_anteriores, garantia_fabrica, conteudo_atualizado_em, descricao_seo,
  first_seen_at, modelo_override, versao_override, perfis_uso, origem,
  estado_cadastro, portas, em_preparacao, previsao_chegada_em
) on public.estoque_motors to authenticated;


-- ==========================================================
-- Autoconferência
-- ==========================================================
do $$
declare
  publicas text[] := array[
    'id', 'marca', 'modelo', 'versao', 'ano', 'ano_fabricacao', 'preco',
    'preco_original', 'preco_promocional', 'quilometragem', 'cambio',
    'combustivel', 'cor', 'tipo', 'perfil_uso', 'url_imagem', 'link_conversao',
    'pericia', 'whatsapp_images', 'web_full_images', 'created_at', 'descricao',
    'laudo_pericia', 'opcionais', 'status_tag', 'status_tag_color', 'vendido',
    'last_seen_at', 'motor', 'cor_interna', 'donos_anteriores',
    'garantia_fabrica', 'conteudo_atualizado_em', 'descricao_seo',
    'first_seen_at', 'modelo_override', 'versao_override', 'perfis_uso',
    'origem', 'estado_cadastro', 'portas', 'em_preparacao',
    'previsao_chegada_em'
  ];
  internas text[] := array[
    'placa', 'chassi', 'renavam', 'preco_compra', 'valor_fipe', 'codigo_fipe'
  ];
  c            text;
  sobra        text[];
  da_tabela    text[];
  da_view      text[];
  opcoes       text[];
  de_fora      uuid := gen_random_uuid();
  da_equipe    uuid;
  total        int;
  n            int;
  alvo         bigint;
  placa_atual  text;
  falhas       int := 0;
begin
  -- 1. Nenhuma coluna sem decisão.
  select array_agg(column_name::text order by ordinal_position) into sobra
    from information_schema.columns
   where table_schema = 'public' and table_name = 'estoque_motors'
     and not (column_name = any(publicas) or column_name = any(internas));
  if sobra is not null then
    falhas := falhas + 1;
    raise warning 'FALHA: coluna(s) de estoque_motors fora das duas listas: %', sobra;
  end if;

  -- 2. O authenticated, na tabela: sem SELECT de tabela, lê cada pública e
  --    nenhuma interna — e continua ESCREVENDO nas internas.
  if has_table_privilege('authenticated', 'public.estoque_motors', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated ainda tem SELECT de tabela';
  end if;
  foreach c in array publicas loop
    if not has_column_privilege('authenticated', 'public.estoque_motors', c, 'select') then
      falhas := falhas + 1;
      raise warning 'FALHA: o authenticated perdeu a coluna pública %', c;
    end if;
  end loop;
  foreach c in array internas loop
    if has_column_privilege('authenticated', 'public.estoque_motors', c, 'select') then
      falhas := falhas + 1;
      raise warning 'FALHA: o authenticated ainda lê a coluna interna %', c;
    end if;
    if not has_column_privilege('authenticated', 'public.estoque_motors', c, 'insert')
       or not has_column_privilege('authenticated', 'public.estoque_motors', c, 'update') then
      falhas := falhas + 1;
      raise warning 'FALHA: o authenticated perdeu a escrita de % — o cadastro nativo e o editor cairiam', c;
    end if;
  end loop;

  -- O anon segue como 20260929220000 o deixou.
  if has_table_privilege('anon', 'public.estoque_motors', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHA: o anon tem SELECT de tabela';
  end if;
  foreach c in array internas loop
    if has_column_privilege('anon', 'public.estoque_motors', c, 'select') then
      falhas := falhas + 1;
      raise warning 'FALHA: o anon lê a coluna interna %', c;
    end if;
  end loop;

  -- 3. A view: as colunas da tabela, na mesma ordem; barreira; só leitura.
  select array_agg(column_name::text order by ordinal_position) into da_tabela
    from information_schema.columns
   where table_schema = 'public' and table_name = 'estoque_motors';
  select array_agg(column_name::text order by ordinal_position) into da_view
    from information_schema.columns
   where table_schema = 'public' and table_name = 'estoque_motors_equipe';
  if da_view is distinct from da_tabela then
    falhas := falhas + 1;
    raise warning 'FALHA: a view não tem as colunas da tabela — view % x tabela %', da_view, da_tabela;
  end if;

  select coalesce(reloptions, '{}') into opcoes
    from pg_class where oid = 'public.estoque_motors_equipe'::regclass;
  if not ('security_barrier=true' = any(opcoes)) then
    falhas := falhas + 1;
    raise warning 'FALHA: a view está sem security_barrier';
  end if;
  if 'security_invoker=true' = any(opcoes) then
    falhas := falhas + 1;
    raise warning 'FALHA: a view está como security_invoker — leria a tabela na pele de quem pergunta';
  end if;
  if has_table_privilege('anon', 'public.estoque_motors_equipe', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHA: o anon lê a view da equipe';
  end if;
  if not has_table_privilege('authenticated', 'public.estoque_motors_equipe', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated não lê a view da equipe';
  end if;
  if has_table_privilege('authenticated', 'public.estoque_motors_equipe', 'insert, update, delete, truncate') then
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated escreve pela view — passaria por cima da RLS da tabela';
  end if;

  -- 4. Na prática, como o PostgREST faria.
  select count(*) into total from public.estoque_motors;
  select id into da_equipe from public.profiles
   where is_active = true
     and papeis && array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr']
   limit 1;
  select id, placa into alvo, placa_atual from public.estoque_motors order by id limit 1;

  -- 4a. Sessão de quem NÃO é da equipe (um id sem perfil).
  perform set_config('request.jwt.claims', json_build_object('sub', de_fora::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', de_fora::text, true);
  set local role authenticated;

  select count(*) into n from (select id, marca, preco, tipo, estado_cadastro from public.estoque_motors) x;
  if n <> total then
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated não lê a lista pública inteira (% de %)', n, total;
  end if;
  begin
    perform placa from public.estoque_motors limit 1;
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated leu a placa na tabela';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform * from public.estoque_motors limit 1;
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated leu select * — a lista explícita não estaria sendo exigida';
  exception when insufficient_privilege then
    null;
  end;
  select count(*) into n from public.estoque_motors_equipe;
  if n <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHA: quem não é da equipe leu linha pela view (%)', n;
  end if;
  reset role;

  -- 4b. Sessão de alguém da equipe.
  if da_equipe is null then
    falhas := falhas + 1;
    raise warning 'FALHA: nenhum perfil ativo da equipe para a prova';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', da_equipe::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', da_equipe::text, true);
    set local role authenticated;

    select count(*) into n from (
      select placa, chassi, renavam, preco_compra, valor_fipe, codigo_fipe
        from public.estoque_motors_equipe
    ) x;
    if n <> total then
      falhas := falhas + 1;
      raise warning 'FALHA: a equipe não lê o pátio inteiro pela view (% de %)', n, total;
    end if;

    -- O cadastro nativo monta o INSERT a partir de information_schema.columns,
    -- que só lista coluna em que o papel tem ALGUM privilégio.
    select count(*) into n from information_schema.columns
     where table_schema = 'public' and table_name = 'estoque_motors';
    if n <> cardinality(da_tabela) then
      falhas := falhas + 1;
      raise warning 'FALHA: o cadastro nativo deixaria de enxergar colunas (% de %)', n, cardinality(da_tabela);
    end if;

    -- O editor grava placa pela sessão. Gravado e desfeito aqui mesmo: o
    -- bloco termina numa exceção própria, que reverte só o que ele fez.
    n := -1;
    begin
      update public.estoque_motors set placa = placa_atual where id = alvo;
      get diagnostics n = row_count;
      raise exception 'PROVA_DESFEITA';
    exception
      when insufficient_privilege then
        falhas := falhas + 1;
        raise warning 'FALHA: a equipe não grava placa pela sessão — %', sqlerrm;
      when raise_exception then
        if sqlerrm <> 'PROVA_DESFEITA' then
          raise;
        end if;
    end;
    if alvo is not null and n <> 1 then
      falhas := falhas + 1;
      raise warning 'FALHA: o UPDATE da equipe não alcançou a linha % (row_count %)', alvo, n;
    end if;

    reset role;
  end if;

  if falhas = 0 then
    raise notice 'Autoconferência OK: o authenticated lê da tabela as % colunas públicas e nenhuma das % internas; a equipe lê as % linhas pela view, e quem não é da equipe, nenhuma; a escrita do painel segue de pé.',
      cardinality(publicas), cardinality(internas), total;
  else
    raise exception 'Autoconferência falhou em % ponto(s).', falhas;
  end if;
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20261001150000', 'documento_e_custo_so_para_a_equipe')
  on conflict (version) do nothing;
