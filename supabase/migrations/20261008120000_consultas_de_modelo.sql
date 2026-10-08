-- ============================================================================
-- As consultas de modelo — o registro de cada análise feita pelas abas de modelo
-- ============================================================================
-- Pedido do dono (2026-10-08): a tela "Consulta de veículos" já analisa um
-- modelo pela FIPE (aba "Por modelo", `src/lib/mercadoPorModelo-servidor.ts`),
-- mas a análise some quando a tela fecha. Ele quer duas coisas: um histórico
-- que a equipe pesquise ("quem já olhou T-Cross 2022?") e saber quanto se
-- gastou com isso.
--
-- `fipe_historico` (20261006190000) NÃO responde nenhuma das duas: ela guarda
-- o VALOR de cada mês, uma vez só, para não pedir de novo — não diz quem
-- analisou, quando, em que modo, nem quanto custou. Esta tabela é o outro
-- lado: uma linha por ANÁLISE que deu certo, com o que ela custou.
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.consultas_de_modelo` — uma linha por análise concluída.
--    A chave do modelo são os CÓDIGOS da API da FIPE, nos mesmos formatos de
--    `fipe_historico` (`marca_codigo`, `modelo_codigo`, `ano` "2022-1"): com
--    eles a tela reabre a análise e cruza com o histórico de valores.
--    `rotulo` é o nome legível ("VW - VolksWagen T-Cross Highline 1.4 TSI
--    2022"), e é por ele que a busca da equipe procura.
-- 2. `consultas_de_modelo_carimbar()` — gatilho da própria tabela, no mesmo
--    padrão de `consultas_de_placa_carimbar()`: com sessão, org, quem
--    analisou (id e nome) e quando não são de quem chama. A função de lá não
--    é genérica (escreve `consultado_por`/`consultado_por_nome`), por isso
--    esta é a equivalente, linha por linha.
-- 3. RLS: lê e inclui quem a matriz deixa consultar placa (linha "Consultar
--    placa de veículo (consulta paga)": Administrador, Gestor e Comercial) —
--    as mesmas policies de `consultas_de_placa` e `fipe_historico`, com
--    `tem_papel`, que já exige conta ativa. Inclusão só em nome próprio.
--
-- ---------------------------------------------------------------------------
-- O dinheiro
-- ---------------------------------------------------------------------------
-- `modo` 'pontual' é grátis (só o mês corrente, pela FIPE pública). 'completa'
-- monta a série, e os meses que o plano gratuito corta vão à APIBrasil, uma
-- chamada paga por mês: `chamadas_pagas` é essa contagem (o `chamadasPagas`
-- que a função do servidor já devolve). `custo` é o que o fornecedor disse
-- ter cobrado, em reais — nulo quando ele não disse, e aí a conta do mês sai
-- de `chamadas_pagas`. `homologacao` marca a análise feita no modo de teste do
-- fornecedor: não foi cobrada e não entra na conta.
--
-- Não há dado de pessoa aqui além de quem analisou (a equipe): é preço de
-- tabela pública de um modelo, sem placa e sem dono.
--
-- ---------------------------------------------------------------------------
-- Só inclusão
-- ---------------------------------------------------------------------------
-- A linha é o registro de algo que aconteceu (e talvez custou dinheiro).
-- Ninguém a edita e ninguém a apaga pelo painel: `authenticated` recebe
-- SELECT e INSERT, e nada mais. Analisar de novo é linha nova.
--
-- O carimbo é a conta do gasto (decisão de 2026-10-08): quem analisou e quando
-- têm de ser confiáveis. Com sessão (o painel, pelo PostgREST), o gatilho
-- sobrescreve `org_id`, `criado_por`, `criado_por_nome` e `criado_em` com os
-- da sessão, informe a tela o que informar — ninguém registra análise em nome
-- de outro nem com data de outro mês. A policy de inclusão ainda exige
-- `criado_por = auth.uid()`: é a segunda tranca, se um dia o gatilho for
-- desligado. Sem sessão (chave de serviço), os valores informados são
-- aceitos, e o NOT NULL obriga quem grava a dizer o autor.
--
-- ---------------------------------------------------------------------------
-- As regras
-- ---------------------------------------------------------------------------
--   consultas_de_modelo_tipo_valido ........ carros, motos ou caminhoes
--   consultas_de_modelo_codigos_validos .... marca e modelo só dígitos; ano "AAAA-N"
--                                            (a mesma expressão de fipe_historico)
--   consultas_de_modelo_rotulo_valido ...... não vazio, até 200 caracteres
--   consultas_de_modelo_modo_valido ........ pontual ou completa
--   consultas_de_modelo_referencia_e_mes ... a referência é o dia 1º do mês
--   consultas_de_modelo_fipe_valida ........ fipe_atual maior que zero
--   consultas_de_modelo_meses_validos ...... meses_na_serie >= 0
--   consultas_de_modelo_chamadas_validas ... chamadas_pagas >= 0
--   consultas_de_modelo_custo_valido ....... nulo ou >= 0
--
-- ⚠️ DESFAZER (nada mais depende destes objetos):
--
--   begin;
--   drop table    if exists public.consultas_de_modelo;
--   drop function if exists public.consultas_de_modelo_carimbar();
--   delete from supabase_migrations.schema_migrations where version = '20261008120000';
--   commit;
--
-- Aditiva (tabela nova; nenhuma coluna, policy ou gatilho em tabela existente;
-- `estoque_motors` não é tocada; nenhuma extensão nova) e idempotente:
-- `create table if not exists`, `create index if not exists`,
-- `create or replace` para a função, `drop … if exists` + `create` para
-- gatilho e policies.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
begin
  if to_regprocedure('public.tem_papel(uuid, text)') is null
     or to_regprocedure('public.autor_atual()') is null
     or to_regprocedure('public.org_padrao()') is null then
    raise exception
      'DEPENDÊNCIA: falta tem_papel(uuid, text), autor_atual() ou org_padrao(). '
      'Nada foi aplicado.';
  end if;
  if public.org_padrao() is null then
    raise exception 'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. A tabela
-- ----------------------------------------------------------------------------
create table if not exists public.consultas_de_modelo (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default public.org_padrao(),
  tipo             text not null,
  marca_codigo     text not null,
  modelo_codigo    text not null,
  ano              text not null,
  rotulo           text not null,
  codigo_fipe      text,
  modo             text not null,
  referencia       date not null,
  fipe_atual       numeric(12,2) not null,
  meses_na_serie   integer not null default 0,
  chamadas_pagas   integer not null default 0,
  custo            numeric(10,2),
  homologacao      boolean not null default false,
  criado_por       uuid not null default auth.uid(),
  criado_por_nome  text,
  criado_em        timestamptz not null default now(),

  constraint consultas_de_modelo_tipo_valido
    check (tipo in ('carros', 'motos', 'caminhoes')),
  constraint consultas_de_modelo_codigos_validos
    check (marca_codigo ~ '^[0-9]{1,6}$' and modelo_codigo ~ '^[0-9]{1,6}$' and ano ~ '^[0-9]{4}-[0-9]{1,2}$'),
  constraint consultas_de_modelo_rotulo_valido
    check (length(btrim(rotulo)) between 1 and 200),
  constraint consultas_de_modelo_modo_valido
    check (modo in ('pontual', 'completa')),
  constraint consultas_de_modelo_referencia_e_mes
    check (extract(day from referencia) = 1),
  constraint consultas_de_modelo_fipe_valida
    check (fipe_atual > 0),
  constraint consultas_de_modelo_meses_validos
    check (meses_na_serie >= 0),
  constraint consultas_de_modelo_chamadas_validas
    check (chamadas_pagas >= 0),
  constraint consultas_de_modelo_custo_valido
    check (custo is null or custo >= 0)
);

-- O histórico da tela: as análises mais recentes primeiro.
create index if not exists consultas_de_modelo_recentes_idx
  on public.consultas_de_modelo (org_id, criado_em desc);

-- A busca da equipe pelo nome do modelo. `pg_trgm` não está em uso no repo e
-- esta migração não cria extensão: `lower(rotulo)` com `text_pattern_ops`
-- serve a busca por prefixo (`lower(rotulo) like 'vw - volkswagen t-cross%'`)
-- em qualquer collation. Busca por trecho no meio (`%t-cross%`) não usa este
-- índice — com o volume de uma loja, a varredura da org é barata; se um dia
-- não for, o trigram entra numa migração própria.
create index if not exists consultas_de_modelo_rotulo_idx
  on public.consultas_de_modelo (org_id, lower(rotulo) text_pattern_ops);

comment on table public.consultas_de_modelo is
  'Registro de cada análise de modelo concluída na tela "Consulta de veículos" '
  '(abas de modelo), pedido do dono em 2026-10-08: o histórico pesquisável da '
  'equipe e a conta do que se gastou. Uma linha por análise que deu certo. Só '
  'inclusão: ninguém edita nem apaga. Lê e inclui quem a matriz deixa consultar '
  'placa (Administrador, Gestor, Comercial). Os VALORES por mês moram em '
  'fipe_historico. Ver 20261008120000_consultas_de_modelo.sql.';
comment on column public.consultas_de_modelo.tipo is
  'O tipo de veículo na API da FIPE: carros, motos ou caminhoes.';
comment on column public.consultas_de_modelo.marca_codigo is
  'Código da marca na API da FIPE (o da cascata de seleção), só dígitos.';
comment on column public.consultas_de_modelo.modelo_codigo is
  'Código do modelo na API da FIPE (o da cascata de seleção), só dígitos.';
comment on column public.consultas_de_modelo.ano is
  'Ano-modelo e combustível como a API da FIPE os junta: "2022-1".';
comment on column public.consultas_de_modelo.rotulo is
  'O nome legível do modelo analisado ("VW - VolksWagen T-Cross Highline 1.4 '
  'TSI 2022"), até 200 caracteres. É por ele que a busca do histórico procura.';
comment on column public.consultas_de_modelo.codigo_fipe is
  'O código FIPE oficial do modelo ("005528-0"), quando a API o devolveu.';
comment on column public.consultas_de_modelo.modo is
  '''pontual'' (grátis: só o mês corrente) ou ''completa'' (a série, com os '
  'meses fora do plano gratuito pagos à APIBrasil).';
comment on column public.consultas_de_modelo.referencia is
  'O mês de tabela da análise, sempre no dia 1º (o mesmo formato de '
  'fipe_historico.referencia).';
comment on column public.consultas_de_modelo.fipe_atual is
  'O valor FIPE do modelo no mês de referência, em reais.';
comment on column public.consultas_de_modelo.meses_na_serie is
  'Quantos meses a série da análise trouxe com valor.';
comment on column public.consultas_de_modelo.chamadas_pagas is
  'Quantas chamadas pagas ao fornecedor esta análise fez (o chamadasPagas de '
  'mercadoPorModelo-servidor). Zero no modo pontual.';
comment on column public.consultas_de_modelo.custo is
  'O que o fornecedor cobrou por esta análise, em reais, como ele informou. '
  'Nulo se ele não disse; zero em homologação.';
comment on column public.consultas_de_modelo.homologacao is
  'A análise rodou no modo de teste do fornecedor: não foi cobrada e os '
  'valores pagos eram de exemplo. Não entra na conta do gasto.';
comment on column public.consultas_de_modelo.criado_por is
  'auth.uid() de quem analisou. Com sessão, é o gatilho que grava; sem sessão '
  '(chave de serviço) quem grava tem de informar.';
comment on column public.consultas_de_modelo.criado_por_nome is
  'Nome de quem analisou (autor_atual()), para continuar legível quando a '
  'pessoa sair da loja. Com sessão, é o gatilho que grava.';
comment on column public.consultas_de_modelo.criado_em is
  'Quando a análise foi registrada. Com sessão, é o gatilho que grava (now()): '
  'é a data que conta no gasto do mês.';


-- ----------------------------------------------------------------------------
-- 2. O carimbo não é de quem chama
-- ----------------------------------------------------------------------------
create or replace function public.consultas_de_modelo_carimbar()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  -- Com sessão (o painel, pelo PostgREST), org, autoria e hora são as da
  -- sessão, informe o cliente o que informar. Sem sessão (chave de serviço),
  -- os valores informados são aceitos.
  if auth.uid() is not null then
    new.org_id          := public.org_padrao();
    new.criado_por      := auth.uid();
    new.criado_por_nome := public.autor_atual();
    new.criado_em       := now();
  end if;
  return new;
end;
$$;

comment on function public.consultas_de_modelo_carimbar() is
  'Gatilho de consultas_de_modelo: com sessão, grava org, autor (id e nome) e '
  'hora pela sessão, e não pelo que o cliente mandou. Equivalente a '
  'consultas_de_placa_carimbar(), que escreve em colunas de outro nome.';

drop trigger if exists consultas_de_modelo_carimbo on public.consultas_de_modelo;
create trigger consultas_de_modelo_carimbo
  before insert on public.consultas_de_modelo
  for each row execute function public.consultas_de_modelo_carimbar();

revoke all on function public.consultas_de_modelo_carimbar() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Privilégio e RLS
-- ----------------------------------------------------------------------------
revoke all on public.consultas_de_modelo from public, anon, authenticated;
grant select, insert on public.consultas_de_modelo to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.consultas_de_modelo to service_role;

alter table public.consultas_de_modelo enable row level security;

drop policy if exists consultas_de_modelo_leitura  on public.consultas_de_modelo;
drop policy if exists consultas_de_modelo_inclusao on public.consultas_de_modelo;

-- A linha "Consultar placa de veículo (consulta paga)" da matriz
-- (src/lib/permissoes.ts, PAPEIS_QUE_CONSULTAM_PLACA): Administrador, Gestor e
-- Comercial — a mesma expressão de consultas_de_placa e fipe_historico. A
-- análise completa é paga, e a aba vive na mesma tela. `tem_papel` já exige
-- conta ativa.
create policy consultas_de_modelo_leitura on public.consultas_de_modelo
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial'))
  );

create policy consultas_de_modelo_inclusao on public.consultas_de_modelo
  for insert to authenticated
  with check (
    org_id = public.org_padrao()
    and criado_por = auth.uid()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial'))
  );

comment on policy consultas_de_modelo_leitura on public.consultas_de_modelo is
  'Lê o histórico de análises quem a matriz deixa consultar: Administrador, Gestor e Comercial, com conta ativa.';
comment on policy consultas_de_modelo_inclusao on public.consultas_de_modelo is
  'Inclui a análise quem a matriz deixa consultar, e só em nome próprio (criado_por = auth.uid(); '
  'o gatilho consultas_de_modelo_carimbo já o garante, esta é a segunda tranca). '
  'Não há policy de UPDATE nem de DELETE: só inclusão.';


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. O efeito cria usuários de sonda (admin,
-- gestor, comercial, marketing, um comercial desativado), veste a sessão de
-- cada um e tenta ler, incluir, forjar o carimbo (autor, nome, hora, org),
-- editar, apagar e violar cada regra — num sub-bloco que termina com um
-- sentinela, e o
-- rollback do sub-bloco leva tudo junto. As variáveis sobrevivem ao rollback,
-- e é por elas que o veredito sai.
do $aceite$
declare
  falhas         int := 0;
  v_nome         text;
  v_uid          uuid;
  v_papel        text;
  v_ids          jsonb := '{}'::jsonb;
  v_cli          uuid := gen_random_uuid();   -- authenticated sem perfil: cliente
  v_linha        public.consultas_de_modelo;
  v_antes        bigint;
  v_depois       bigint;
  v_restou       bigint;
  v_n            bigint;
  v_incluiram    int := 0;      -- admin, gestor, comercial: inclusão própria
  v_autor_certo  int := 0;      -- …e o carimbo (autor, nome, hora, org) saiu da sessão
  v_leram        int := 0;      -- admin, gestor, comercial: viram as 3 linhas
  v_leituras     text := '';
  v_forjou       text := 'não testado';   -- 'sobrescrito' é o esperado
  v_negados      int := 0;      -- marketing, desativado, cliente: inclusão
  v_cegos        int := 0;      -- marketing, desativado, cliente: leitura vazia
  v_anon         text := 'não testado';
  v_anon_inclui  text := 'não testado';
  v_edita        text := 'não testado';
  v_apaga        text := 'não testado';
  v_sem_autor    text := 'não testado';
  v_servico      text := 'não testado';
  v_regras       int := 0;
  v_certas       int := 0;
  v_caso         record;
  v_msg          text;
begin
  -- 1 · A tabela, com RLS e comentário.
  if not exists (select 1 from pg_class
                  where oid = 'public.consultas_de_modelo'::regclass and relrowsecurity) then
    raise exception 'ACEITE FALHOU: consultas_de_modelo sem RLS';
  end if;
  if obj_description('public.consultas_de_modelo'::regclass, 'pg_class') is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_modelo sem comentário';
  end if;

  -- 2 · As nove regras existem com nome, são CHECK e estão validadas.
  foreach v_nome in array array[
    'consultas_de_modelo_tipo_valido',
    'consultas_de_modelo_codigos_validos',
    'consultas_de_modelo_rotulo_valido',
    'consultas_de_modelo_modo_valido',
    'consultas_de_modelo_referencia_e_mes',
    'consultas_de_modelo_fipe_valida',
    'consultas_de_modelo_meses_validos',
    'consultas_de_modelo_chamadas_validas',
    'consultas_de_modelo_custo_valido'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.consultas_de_modelo'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;

  -- 3 · Os dois índices: recentes por org, e o rótulo em minúsculas para prefixo.
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'consultas_de_modelo'
                    and indexname = 'consultas_de_modelo_recentes_idx'
                    and indexdef like '%(org_id, criado_em DESC)%')
     or not exists (select 1 from pg_indexes
                     where schemaname = 'public' and tablename = 'consultas_de_modelo'
                       and indexname = 'consultas_de_modelo_rotulo_idx'
                       and indexdef like '%lower(rotulo) text_pattern_ops%') then
    falhas := falhas + 1;
    raise warning 'FALHOU: índices de recentes e de rótulo ausentes ou com outra forma';
  end if;

  -- 4 · Privilégio: anon nada; authenticated lê e inclui, e só.
  if has_table_privilege('anon', 'public.consultas_de_modelo', 'SELECT')
     or has_table_privilege('anon', 'public.consultas_de_modelo', 'INSERT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon tem privilégio em consultas_de_modelo';
  end if;
  if not has_table_privilege('authenticated', 'public.consultas_de_modelo', 'SELECT')
     or not has_table_privilege('authenticated', 'public.consultas_de_modelo', 'INSERT')
     or has_table_privilege('authenticated', 'public.consultas_de_modelo', 'UPDATE')
     or has_table_privilege('authenticated', 'public.consultas_de_modelo', 'DELETE')
     or has_table_privilege('authenticated', 'public.consultas_de_modelo', 'TRUNCATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated deveria ter SELECT e INSERT, e só eles';
  end if;
  if not has_table_privilege('service_role', 'public.consultas_de_modelo', 'INSERT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role sem INSERT';
  end if;

  -- 5 · As duas policies, e nenhuma outra (uma permissiva a mais abriria por OU).
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'consultas_de_modelo';
  if v_n <> 2 or not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'consultas_de_modelo'
                                and policyname = 'consultas_de_modelo_leitura' and cmd = 'SELECT')
     or not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'consultas_de_modelo'
                       and policyname = 'consultas_de_modelo_inclusao' and cmd = 'INSERT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: esperado exatamente as policies de leitura e de inclusão (achei %)', v_n;
  end if;

  -- 6 · O gatilho de carimbo: BEFORE INSERT, por linha, ligado.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.consultas_de_modelo'::regclass
                    and tgname  = 'consultas_de_modelo_carimbo'
                    and tgfoid  = 'public.consultas_de_modelo_carimbar()'::regprocedure
                    and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 4 = 4
                    and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_modelo_carimbo não é BEFORE INSERT por linha';
  end if;

  select count(*) into v_antes from public.consultas_de_modelo;

  -- 7 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'marketing', 'desativado'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-modelo-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite Modelo ' || v_papel,
             papeis    = array[case when v_papel = 'desativado' then 'comercial' else v_papel end],
             role      = case when v_papel = 'desativado' then 'comercial' else v_papel end,
             is_active = (v_papel <> 'desativado')
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    -- 6a · anon não lê nem inclui.
    begin
      set local role anon;
      perform 1 from public.consultas_de_modelo limit 1;
      reset role;
      v_anon := 'leu';
    exception when insufficient_privilege then v_anon := 'negado';
    end;
    begin
      set local role anon;
      insert into public.consultas_de_modelo
        (tipo, marca_codigo, modelo_codigo, ano, rotulo, modo, referencia, fipe_atual, criado_por)
      values ('carros', '999999', '999999', '2022-1', 'ACEITE MODELO anon', 'pontual',
              date '2026-10-01', 100000, gen_random_uuid());
      reset role;
      v_anon_inclui := 'incluiu';
    exception when insufficient_privilege then v_anon_inclui := 'negado';
    end;

    -- 7b · Admin, gestor e comercial incluem, cada um em nome próprio, sem
    --      informar autor nem nome: o carimbo da sessão é quem assina.
    foreach v_papel in array array['admin', 'gestor', 'comercial'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.consultas_de_modelo
          (tipo, marca_codigo, modelo_codigo, ano, rotulo, codigo_fipe, modo, referencia,
           fipe_atual, meses_na_serie, chamadas_pagas, custo)
        values ('carros', '999999', '999999', '2022-1',
                'ACEITE MODELO VW - VolksWagen T-Cross Highline 1.4 TSI 2022 ' || v_papel,
                '005528-0', case when v_papel = 'comercial' then 'pontual' else 'completa' end,
                date '2026-10-01', 128430, 24,
                case when v_papel = 'comercial' then 0 else 12 end,
                case when v_papel = 'comercial' then null else 4.80 end)
        returning * into v_linha;
        reset role;
        perform set_config('request.jwt.claims', '', true);
        v_incluiram := v_incluiram + 1;
        if v_linha.criado_por = (v_ids->>v_papel)::uuid
           and v_linha.criado_por_nome = 'Aceite Modelo ' || v_papel
           and v_linha.org_id = public.org_padrao()
           and v_linha.criado_em > now() - interval '1 minute' then
          v_autor_certo := v_autor_certo + 1;
        end if;
      exception when insufficient_privilege then null;
      end;
    end loop;

    -- 7c · Cada um dos três lê as três linhas — a de todos, não só a sua.
    foreach v_papel in array array['admin', 'gestor', 'comercial'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select count(*) into v_n from public.consultas_de_modelo
         where rotulo like 'ACEITE MODELO %';
        reset role;
        perform set_config('request.jwt.claims', '', true);
        v_leituras := v_leituras || v_papel || '=' || v_n || ' ';
        if v_n = 3 then v_leram := v_leram + 1; end if;
      exception when insufficient_privilege then
        v_leituras := v_leituras || v_papel || '=42501 ';
      end;
    end loop;

    -- 7d · O carimbo não é de quem chama: o comercial manda autor do gestor,
    --      nome de outra pessoa, data de 30 dias atrás e outra org. A linha
    --      entra, e entra com o carimbo da sessão — nada do que a tela mandou.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.consultas_de_modelo
        (tipo, marca_codigo, modelo_codigo, ano, rotulo, modo, referencia, fipe_atual,
         org_id, criado_por, criado_por_nome, criado_em)
      values ('carros', '999999', '999999', '2022-1', 'ACEITE MODELO forjado', 'pontual',
              date '2026-10-01', 100000,
              gen_random_uuid(), (v_ids->>'gestor')::uuid, 'Outra Pessoa', now() - interval '30 days')
      returning * into v_linha;
      reset role;
      v_forjou := case
        when v_linha.criado_por      = (v_ids->>'comercial')::uuid
         and v_linha.criado_por_nome = 'Aceite Modelo comercial'
         and v_linha.criado_em       > now() - interval '1 minute'
         and v_linha.org_id          = public.org_padrao()
        then 'sobrescrito'
        else format('manteve (por %s, nome %s, em %s, org %s)',
                    v_linha.criado_por, v_linha.criado_por_nome, v_linha.criado_em, v_linha.org_id)
      end;
    exception when insufficient_privilege then v_forjou := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 7e · Marketing, comercial desativado e cliente: não leem e não incluem.
    foreach v_uid in array array[(v_ids->>'marketing')::uuid, (v_ids->>'desativado')::uuid, v_cli] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select count(*) into v_n from public.consultas_de_modelo;
        reset role;
        perform set_config('request.jwt.claims', '', true);
        if v_n = 0 then v_cegos := v_cegos + 1; end if;
      exception when insufficient_privilege then v_cegos := v_cegos + 1;
      end;
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.consultas_de_modelo
          (tipo, marca_codigo, modelo_codigo, ano, rotulo, modo, referencia, fipe_atual)
        values ('carros', '999999', '999999', '2022-1', 'ACEITE MODELO fora', 'pontual',
                date '2026-10-01', 100000);
        reset role;
        perform set_config('request.jwt.claims', '', true);
      exception when insufficient_privilege then v_negados := v_negados + 1;
      end;
    end loop;
    perform set_config('request.jwt.claims', '', true);

    -- 7f · Nem o admin edita ou apaga a própria linha: 42501, não "0 linhas".
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.consultas_de_modelo set custo = 0 where rotulo like 'ACEITE MODELO %';
      reset role;
      v_edita := 'editou';
    exception when insufficient_privilege then v_edita := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      delete from public.consultas_de_modelo where rotulo like 'ACEITE MODELO %';
      reset role;
      v_apaga := 'apagou';
    exception when insufficient_privilege then v_apaga := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 7g · Sem sessão, o autor não se inventa: sem `criado_por`, NOT NULL; com
    --      ele, a chave de serviço grava, e o que ela informou fica.
    begin
      insert into public.consultas_de_modelo
        (tipo, marca_codigo, modelo_codigo, ano, rotulo, modo, referencia, fipe_atual)
      values ('carros', '999999', '999999', '2022-1', 'ACEITE MODELO sem autor', 'pontual',
              date '2026-10-01', 100000);
      v_sem_autor := 'incluiu';
    exception when not_null_violation then
      get stacked diagnostics v_msg = column_name;
      v_sem_autor := case when v_msg = 'criado_por' then 'recusou' else 'recusou por ' || v_msg end;
    end;
    begin
      set local role service_role;
      insert into public.consultas_de_modelo
        (tipo, marca_codigo, modelo_codigo, ano, rotulo, modo, referencia, fipe_atual,
         criado_por, criado_por_nome, criado_em)
      values ('motos', '1', '2', '2020-1', 'ACEITE MODELO serviço', 'pontual',
              date '2026-10-01', 15000,
              (v_ids->>'comercial')::uuid, 'Motor de teste', timestamptz '2026-10-01 12:00:00-03')
      returning * into v_linha;
      reset role;
      v_servico := case
        when v_linha.criado_por = (v_ids->>'comercial')::uuid
         and v_linha.criado_por_nome = 'Motor de teste'
         and v_linha.criado_em = timestamptz '2026-10-01 12:00:00-03'
        then 'incluiu' else 'incluiu e trocou o informado' end;
    exception when insufficient_privilege then v_servico := 'negado';
    end;

    -- 7h · Cada regra, tentando gravar o inválido (sem sessão: só o CHECK fala).
    for v_caso in
      select * from (values
        ('consultas_de_modelo_tipo_valido',      'barcos', '1',   '1', '2022-1', 'X',              'pontual',  date '2026-10-01', 1::numeric, 0, 0, null::numeric),
        ('consultas_de_modelo_codigos_validos',  'carros', 'abc', '1', '2022-1', 'X',              'pontual',  date '2026-10-01', 1, 0, 0, null),
        ('consultas_de_modelo_codigos_validos',  'carros', '1',   '1', '2022',   'X',              'pontual',  date '2026-10-01', 1, 0, 0, null),
        ('consultas_de_modelo_codigos_validos',  'carros', '1',   '1/../x', '2022-1', 'X',         'pontual',  date '2026-10-01', 1, 0, 0, null),
        ('consultas_de_modelo_rotulo_valido',    'carros', '1',   '1', '2022-1', '   ',            'pontual',  date '2026-10-01', 1, 0, 0, null),
        ('consultas_de_modelo_rotulo_valido',    'carros', '1',   '1', '2022-1', repeat('x', 201), 'pontual',  date '2026-10-01', 1, 0, 0, null),
        ('consultas_de_modelo_modo_valido',      'carros', '1',   '1', '2022-1', 'X',              'mensal',   date '2026-10-01', 1, 0, 0, null),
        ('consultas_de_modelo_referencia_e_mes', 'carros', '1',   '1', '2022-1', 'X',              'pontual',  date '2026-10-15', 1, 0, 0, null),
        ('consultas_de_modelo_fipe_valida',      'carros', '1',   '1', '2022-1', 'X',              'pontual',  date '2026-10-01', 0, 0, 0, null),
        ('consultas_de_modelo_fipe_valida',      'carros', '1',   '1', '2022-1', 'X',              'pontual',  date '2026-10-01', -5, 0, 0, null),
        ('consultas_de_modelo_meses_validos',    'carros', '1',   '1', '2022-1', 'X',              'completa', date '2026-10-01', 1, -1, 0, null),
        ('consultas_de_modelo_chamadas_validas', 'carros', '1',   '1', '2022-1', 'X',              'completa', date '2026-10-01', 1, 0, -1, null),
        ('consultas_de_modelo_custo_valido',     'carros', '1',   '1', '2022-1', 'X',              'completa', date '2026-10-01', 1, 0, 0, -0.01)
      ) as t(regra, tipo, marca, modelo, ano, rotulo, modo, referencia, fipe, meses, chamadas, custo)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.consultas_de_modelo
          (tipo, marca_codigo, modelo_codigo, ano, rotulo, modo, referencia,
           fipe_atual, meses_na_serie, chamadas_pagas, custo, criado_por)
        values (v_caso.tipo, v_caso.marca, v_caso.modelo, v_caso.ano, v_caso.rotulo, v_caso.modo,
                v_caso.referencia, v_caso.fipe, v_caso.meses, v_caso.chamadas, v_caso.custo,
                gen_random_uuid());
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_certas := v_certas + 1; end if;
      end;
    end loop;

    raise exception 'DESFAZER_ACEITE_MODELO' using errcode = 'PCM01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PCM01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'comercial' is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários — nada foi provado';
  end if;
  if v_anon <> 'negado' or v_anon_inclui <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon — leitura %, inclusão %', v_anon, v_anon_inclui;
  end if;
  if v_incluiram <> 3 or v_autor_certo <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: admin, gestor e comercial — % de 3 incluíram, % de 3 com autor, nome, hora e org da sessão',
      v_incluiram, v_autor_certo;
  end if;
  if v_leram <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: admin, gestor e comercial deveriam ver as 3 linhas de sonda (%)', v_leituras;
  end if;
  if v_forjou <> 'sobrescrito' then
    falhas := falhas + 1;
    raise warning 'FALHOU: carimbo forjado pela tela: % (esperado: sobrescrito pela sessão)', v_forjou;
  end if;
  if v_cegos <> 3 or v_negados <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: marketing, desativado e cliente — % de 3 sem leitura, % de 3 sem inclusão', v_cegos, v_negados;
  end if;
  if v_edita <> 'negado' or v_apaga <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: só inclusão — update %, delete % (esperado 42501 nos dois)', v_edita, v_apaga;
  end if;
  if v_sem_autor <> 'recusou' or v_servico <> 'incluiu' then
    falhas := falhas + 1;
    raise warning 'FALHOU: sem sessão — sem autor %, service_role com autor %', v_sem_autor, v_servico;
  end if;
  if v_regras < 13 or v_certas <> v_regras then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % de % recusas pela regra certa', v_certas, v_regras;
  end if;

  -- Nada da prova ficou.
  select count(*) into v_depois from public.consultas_de_modelo;
  select count(*) into v_restou from auth.users where email like 'aceite-modelo-%@exemplo.invalido';
  if v_depois <> v_antes or v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (linhas % → %, % usuário(s))', v_antes, v_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em consultas_de_modelo', falhas;
  end if;

  raise notice
    'Aceite verificado: consultas_de_modelo existe com as nove regras nomeadas, '
    'os índices de recentes e de rótulo, RLS e gatilho de carimbo; anon não lê '
    'nem inclui; admin, gestor e comercial incluem e leem as linhas de todos, e '
    'o carimbo (autor, nome, hora, org) é o da sessão; autor, nome, data e org '
    'forjados pela tela são sobrescritos; marketing, comercial desativado e '
    'cliente não leem nem incluem; ninguém edita nem apaga (42501); sem sessão '
    'o autor é obrigatório e a chave de serviço grava o que informou; tipo, códigos, rótulo, '
    'modo, referência fora do dia 1º, FIPE não positiva, contagens e custo '
    'negativos caem na regra certa; a prova não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261008120000', 'consultas_de_modelo')
  on conflict (version) do nothing;
