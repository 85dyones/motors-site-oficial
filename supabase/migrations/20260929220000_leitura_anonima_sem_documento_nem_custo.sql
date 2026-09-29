-- ============================================================================
-- Leitura anônima sem documento nem custo — placa, chassi, renavam e custo fecham
-- ============================================================================
-- Achado de 2026-09-29, na revisão da PR 85dyones/motors-site-oficial#174:
-- `estoque_motors` tinha a policy `Allow public read access … USING (true)` e
-- o papel `anon` com SELECT em TODAS as colunas. Com a
-- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — que está no bundle do site e é pública por
-- natureza —, qualquer pessoa fazia
--
--   GET /rest/v1/estoque_motors?select=id,placa,chassi,renavam,preco_compra
--
-- e recebia os documentos e o CUSTO de compra de todo o estoque. O código
-- chamava essas colunas de "uso interno, nunca no mapper público", e o mapper
-- de fato não as devolvia — mas o mapper não protege nada no banco. A
-- exposição cresceu no mesmo dia: a PR 174 trouxe placa e chassi do
-- RevendaMais para todos os carros do feed.
--
-- ---------------------------------------------------------------------------
-- O conserto: SELECT por coluna, e a lista mora no código
-- ---------------------------------------------------------------------------
-- RLS não recorta coluna. O que recorta é o privilégio: revoga-se o SELECT de
-- TABELA do `anon` e concede-se, coluna a coluna, a lista pública — que é a
-- constante `COLUNAS_PUBLICAS_DO_ESTOQUE` de `src/lib/colunasDoEstoque.ts`,
-- idêntica a esta (o teste `leitura-anonima-do-estoque` confere).
--
-- A lista é "tudo menos documento e custo", e não "o que o mapper lê": o
-- mapper lê `tipo` por uma função auxiliar, e uma lista montada pelo que o
-- código parece ler deixaria a vitrine degradar sem erro.
--
-- ⚠️ ORDEM DE APLICAÇÃO. O site lia com `select("*")`, e o PostgREST recusa a
-- consulta INTEIRA quando falta privilégio em qualquer coluna. Esta migração
-- só pode ser aplicada DEPOIS do deploy do código que pede a lista explícita
-- (mesma PR). Aplicada antes, a vitrine cai.
--
-- O que NÃO muda:
--   - `authenticated` segue lendo tudo — o painel usa a sessão, e a placa do
--     painel passou a vir por ela (`getEstoque({ incluirPlaca, cliente })`).
--     Cliente final e investidor também são `authenticated`: fechar para eles
--     pede outro desenho (a coluna não se recorta por usuário) e fica à parte.
--   - A policy de leitura por linha (`USING (true)`) e as de escrita.
--   - O n8n (`service_role`) e o `HEAD select=id` de contagem, que segue
--     funcionando (`id` é público).
--
-- ⚠️ COLUNA NOVA nasce fechada para o `anon`. Se o site precisa lê-la, entra
-- em `COLUNAS_PUBLICAS_DO_ESTOQUE` e num `grant select (coluna)` de migração;
-- se é interna, em `COLUNAS_INTERNAS_DO_ESTOQUE`. A autoconferência abaixo
-- falha se a tabela tiver coluna fora das duas listas.
--
-- ⚠️ NUMA TRANSAÇÃO SÓ. O revoke sem o grant deixa o `anon` sem leitura
-- nenhuma, e o site cai. `aplicar-migracao.js`, `execute_sql` e o `DO …
-- EXECUTE` do runbook já rodam tudo junto; `psql -f` precisa de `-1`.
--
-- ⚠️ DESFAZER: `supabase/manutencao/reversao/leitura-anonima-2026-09-29.sql`.
-- Voltar o CÓDIGO para antes desta PR (rollback da Vercel) com a migração
-- aplicada derruba a vitrine e transforma toda ficha em 404: rode a reversão
-- ANTES de promover o deploy antigo.
--
-- ⚠️ REAPLICAR depois que existir coluna nova aborta no passo 1 (coluna fora
-- das duas listas) — e é bom que aborte: no Postgres, o REVOKE de TABELA leva
-- junto os grants de COLUNA, e reaplicar sem a trava apagaria o grant de
-- qualquer coluna pública concedida por migração posterior.
-- ============================================================================

revoke select on public.estoque_motors from anon;

grant select (
  id, marca, modelo, versao, ano, ano_fabricacao, preco, preco_original,
  preco_promocional, quilometragem, cambio, combustivel, cor, tipo, perfil_uso,
  url_imagem, link_conversao, pericia, whatsapp_images, web_full_images,
  created_at, descricao, laudo_pericia, opcionais, status_tag,
  status_tag_color, vendido, last_seen_at, motor, cor_interna,
  donos_anteriores, garantia_fabrica, conteudo_atualizado_em, descricao_seo,
  first_seen_at, modelo_override, versao_override, perfis_uso, origem,
  estado_cadastro, portas, em_preparacao, previsao_chegada_em
) on public.estoque_motors to anon;


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
  c        text;
  sobra    text[];
  n        int;
  falhas   int := 0;
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

  -- 2. O anon não tem mais SELECT de tabela, lê cada pública e nenhuma interna.
  if has_table_privilege('anon', 'public.estoque_motors', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHA: o anon ainda tem SELECT de tabela';
  end if;
  foreach c in array publicas loop
    if not has_column_privilege('anon', 'public.estoque_motors', c, 'select') then
      falhas := falhas + 1;
      raise warning 'FALHA: o anon perdeu a coluna pública %', c;
    end if;
  end loop;
  foreach c in array internas loop
    if has_column_privilege('anon', 'public.estoque_motors', c, 'select') then
      falhas := falhas + 1;
      raise warning 'FALHA: o anon ainda lê a coluna interna %', c;
    end if;
  end loop;

  -- 3. O painel (authenticated) segue lendo tudo.
  if not has_table_privilege('authenticated', 'public.estoque_motors', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated perdeu o SELECT de tabela';
  end if;

  -- 4. Na prática, como o PostgREST faria: a leitura pública passa, a placa não.
  set local role anon;
  select count(*) into n from (select id, marca, preco, tipo, estado_cadastro from public.estoque_motors) x;
  begin
    perform placa from public.estoque_motors limit 1;
    falhas := falhas + 1;
    raise warning 'FALHA: o anon leu a placa';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform * from public.estoque_motors limit 1;
    falhas := falhas + 1;
    raise warning 'FALHA: o anon leu select * — a lista explícita não estaria sendo exigida';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  if falhas = 0 then
    raise notice 'Autoconferência OK: o anon lê as % colunas públicas e nenhuma das % internas; o painel segue lendo tudo.',
      cardinality(publicas), cardinality(internas);
  else
    raise exception 'Autoconferência falhou em % ponto(s).', falhas;
  end if;
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260929220000', 'leitura_anonima_sem_documento_nem_custo')
  on conflict (version) do nothing;
