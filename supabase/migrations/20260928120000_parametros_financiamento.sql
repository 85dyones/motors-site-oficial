-- ============================================================================
-- As condições de financiamento saem do código e viram parâmetro com vigência
-- (2026-09-28)
-- ============================================================================
--
-- O simulador de financiamento do site (src/lib/finance-calculator.ts — ficha
-- do carro, /financiamento e o Garagem Profiler em /carro-perfeito) tem as
-- taxas em CÓDIGO: `TAXAS_ESTIMADAS = { excelente: 0.0179, regular: 0.0195,
-- risco: 0.027 }`, `ANO_DE_REFERENCIA_DAS_TAXAS = 2026` e
-- `REFERENCIA_DAS_TAXAS = "média de 18 instituições, Banco Central,
-- jul–set/2026"`. Mudar a taxa exigia deploy, e a regra do projeto é outra:
-- "nada de valor de regra em código" (motors-handoff/CLAUDE.md §Backend) —
-- regra é dado, com vigência datada, como `parametros_avaliacao` e
-- `ciclo_parametros` (f0f).
--
-- Três decisões do dono em 2026-09-28 fecham o conteúdo desta tabela:
--   1. "temos bancos parceiros que parcelam carros até 2009, abaixo disso muito
--      difícil" → `ano_mais_antigo` = 2009. Carro com ano menor sai "sem
--      estimativa de parcela" — não com uma parcela que nenhum banco aprova.
--   2. Bancos parceiros (o agente financiador no texto de crédito): Sicredi,
--      Safra, Banco Pan, Santander, Bradesco, Itaú, BV Financeira, Banco C6,
--      Mercado Pago, Banco BBC, "entre outros". O "entre outros" é da TELA;
--      a lista guarda só nomes.
--   3. "sim, gostaria muito de ter isso disponível" → as taxas ficam editáveis
--      no painel, por quem a matriz A17 deixa (src/lib/permissoes.ts, "Editar
--      texto legal e condições de financiamento": `faz` só para admin e
--      financeiro).
--
-- ---------------------------------------------------------------------------
-- O que cada coluna carrega, e por que ela é coluna
-- ---------------------------------------------------------------------------
--   * As três taxas em % AO MÊS (1.79, não 0.0179): é como o texto de crédito
--     e o editor as mostram, e numeric(5,2) é a precisão em que o Banco
--     Central as publica. Quem lê divide por 100.
--   * `ano_de_referencia`: a idade do carro é medida contra ELE, não contra o
--     relógio. Com `new Date().getFullYear()`, em 1º de janeiro todo carro
--     envelhecia um ano de uma vez e as parcelas subiam sozinhas — no site e
--     no Profiler, que filtra pela parcela (o defeito que a revisão de
--     2026-09-25 corrigiu no código). O ano muda junto com as taxas, na mesma
--     vigência — nunca sozinho.
--   * `ano_mais_antigo`, `bancos_parceiros`, `fonte_das_taxas`: o que a tela
--     diz ao lado da parcela. Mudam com a mesma vigência porque dizem de ONDE
--     a taxa saiu — uma taxa nova com a fonte velha seria texto de crédito
--     mentindo.
--   * `criado_por`: quem abriu a vigência, carimbado com `auth.uid()` pela
--     função (B6 da f0m: autoria é carimbada, não declarada). Sem FK de
--     propósito: `on delete set null` seria UPDATE, e o guarda D-T1.7 o
--     recusaria — excluir o usuário travaria; o uuid fica como trilha.
--
-- ---------------------------------------------------------------------------
-- A regra de negócio mora em CHECK nomeado
-- ---------------------------------------------------------------------------
--   parametros_financiamento_taxas_na_faixa ........ cada taxa > 0 e ≤ 10 % a.m.
--   parametros_financiamento_taxas_em_ordem ........ excelente ≤ regular ≤ risco
--   parametros_financiamento_ano_de_referencia_na_faixa ... 2020 a 2100
--   parametros_financiamento_ano_mais_antigo_na_faixa ..... 1950 a ano_de_referencia
--   parametros_financiamento_bancos_validos ........ 1 a 30 nomes, sem nulo, sem
--                                                    string vazia ou só espaço
--   parametros_financiamento_fonte_preenchida ...... 1 a 200 caracteres aparada
--   parametros_financiamento_vigencia_em_ordem ..... vigencia_ate ≥ vigencia_desde
--
-- "Espaço", aqui, é espaço, tab, CR e LF (`btrim(x, E' \t\r\n')`), nos três
-- lugares em que a palavra aparece: o CHECK dos bancos, o da fonte e a
-- normalização da função. Um nome colado de uma lista com quebra de linha
-- não pode virar "\nSafra" na tela, nem um "\t" passar como banco.
--
-- ---------------------------------------------------------------------------
-- Uma porta de escrita só
-- ---------------------------------------------------------------------------
-- D-T1.7 (`nucleo_so_encerra_vigencia`, f0e): valor vigente nunca sofre
-- UPDATE — encerra-se a vigência e insere-se a nova. Mudar a taxa, então, são
-- DOIS gestos (encerrar + inserir) que têm de acontecer juntos: um sem o
-- outro deixa o site sem taxa nenhuma ou com duas. Por isso a única escrita é
-- `financiamento_nova_vigencia`, SECURITY DEFINER, que confere o papel da
-- A17, trava a linha vigente, encerra, insere e devolve a nova na mesma
-- transação. Para `authenticated` a tabela não tem INSERT/UPDATE/DELETE/
-- TRUNCATE nem policy de escrita: tentar direto é 42501, não "0 linhas"
-- calado (O1 da f0m). Leitura: staff pelo painel (RLS, forma de
-- `nucleo_staff_le`), e o site público pela chave de serviço, no servidor.
-- `anon` não tem nada: nenhum caminho anônimo precisa da tabela (f0l).
--
-- ---------------------------------------------------------------------------
-- A semente é a transcrição literal do código de hoje
-- ---------------------------------------------------------------------------
-- 1.79 / 1.95 / 2.70 são as constantes de finance-calculator.ts (1º quartil,
-- mediana e 3º quartil das 18 instituições do Banco Central, jul–set/2026), e
-- 2026 é o `ANO_DE_REFERENCIA_DAS_TAXAS`. Esta migração é só o banco: até o
-- simulador passar a ler a linha vigente, as constantes em código seguem
-- valendo — e trocar o leitor não muda parcela nenhuma. O que a semente
-- ACRESCENTA é o que o dono decidiu hoje: 2009 e os bancos.
--
-- Aditiva e idempotente: tabela e índice `if not exists`, funções e gatilho
-- `create or replace`, policy só se não existir, semente só com a tabela
-- vazia, revoke/grant e comment reaplicáveis. Nenhum DROP/RENAME/ALTER TYPE.
-- `estoque_motors` intocada (F2).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A régua dos bancos parceiros
-- ----------------------------------------------------------------------------
-- Em função porque CHECK não aceita subconsulta, e "nenhum elemento vazio"
-- precisa olhar elemento por elemento. IMMUTABLE e só sobre o argumento — não
-- lê tabela, que é o que tornaria um CHECK por função traiçoeiro (mesmo gesto
-- de `papeis_validos`, 20260819150000). `search_path` vazio: nada de fora
-- decide o que `btrim` ou `unnest` são. Nunca devolve NULL — CHECK com NULL
-- passa.
create or replace function public.financiamento_bancos_validos(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(
           p is not null
           and array_ndims(p) = 1
           and cardinality(p) between 1 and 30
           and not exists (select 1
                             from unnest(p) as b(nome)
                            where b.nome is null
                               or btrim(b.nome, E' \t\r\n') = ''),
           false)
$fn$;

comment on function public.financiamento_bancos_validos(text[]) is
  'Régua de parametros_financiamento.bancos_parceiros (CHECK '
  'parametros_financiamento_bancos_validos): lista de uma dimensão, de 1 a 30 '
  'nomes, nenhum nulo, vazio ou só espaço/tab/quebra de linha. Função porque '
  'CHECK não aceita subconsulta; IMMUTABLE, só olha o argumento.';


-- ----------------------------------------------------------------------------
-- 2. A tabela
-- ----------------------------------------------------------------------------
create table if not exists public.parametros_financiamento (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default public.org_padrao(),
  taxa_excelente_am   numeric(5,2) not null,
  taxa_regular_am     numeric(5,2) not null,
  taxa_risco_am       numeric(5,2) not null,
  ano_de_referencia   smallint not null,
  ano_mais_antigo     smallint not null,
  bancos_parceiros    text[] not null,
  fonte_das_taxas     text not null,
  descricao           text,
  criado_por          uuid,
  vigencia_desde      date not null default current_date,
  vigencia_ate        date,
  criado_em           timestamptz not null default now(),

  constraint parametros_financiamento_taxas_na_faixa check (
        taxa_excelente_am > 0 and taxa_excelente_am <= 10
    and taxa_regular_am   > 0 and taxa_regular_am   <= 10
    and taxa_risco_am     > 0 and taxa_risco_am     <= 10),
  constraint parametros_financiamento_taxas_em_ordem check (
        taxa_excelente_am <= taxa_regular_am
    and taxa_regular_am   <= taxa_risco_am),
  constraint parametros_financiamento_ano_de_referencia_na_faixa check (
    ano_de_referencia between 2020 and 2100),
  constraint parametros_financiamento_ano_mais_antigo_na_faixa check (
    ano_mais_antigo between 1950 and ano_de_referencia),
  constraint parametros_financiamento_bancos_validos check (
    public.financiamento_bancos_validos(bancos_parceiros)),
  constraint parametros_financiamento_fonte_preenchida check (
    char_length(btrim(fonte_das_taxas, E' \t\r\n')) between 1 and 200),
  constraint parametros_financiamento_vigencia_em_ordem check (
    vigencia_ate is null or vigencia_ate >= vigencia_desde)
);

-- D-T1.7: a linha vigente só aceita o encerramento da vigência.
create or replace trigger parametros_financiamento_vigencia
  before update on public.parametros_financiamento
  for each row execute function public.nucleo_so_encerra_vigencia();

-- Uma vigente por org (f0j): taxa dobrada é parcela dobrada na tela.
create unique index if not exists parametros_financiamento_um_vigente
  on public.parametros_financiamento (org_id)
  where vigencia_ate is null;


-- ----------------------------------------------------------------------------
-- 3. Quem lê e quem escreve
-- ----------------------------------------------------------------------------
alter table public.parametros_financiamento enable row level security;

-- Staff lê (o editor e o histórico no painel). Nenhuma policy de escrita: a
-- única escrita é a função abaixo, que roda como dono.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename  = 'parametros_financiamento'
                    and policyname = 'nucleo_staff_le') then
    create policy nucleo_staff_le on public.parametros_financiamento
      for select to authenticated
      using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
  end if;
end $$;

-- O default ACL do Supabase concede tudo a anon/authenticated/service_role
-- por baixo do pano (f0l); o que não se quer, sai por nome.
revoke all on public.parametros_financiamento from anon;
revoke insert, update, delete, truncate on public.parametros_financiamento from authenticated;
-- A leitura, dita em voz alta em vez de herdada do default ACL: o painel
-- (recortado pela RLS) e o site público (chave de serviço, no servidor).
grant select on public.parametros_financiamento to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. A porta de escrita: encerra a vigente e abre a nova, junto
-- ----------------------------------------------------------------------------
create or replace function public.financiamento_nova_vigencia(
  p_taxa_excelente_am numeric,
  p_taxa_regular_am   numeric,
  p_taxa_risco_am     numeric,
  p_ano_de_referencia integer,
  p_ano_mais_antigo   integer,
  p_bancos_parceiros  text[],
  p_fonte_das_taxas   text,
  p_descricao         text default null
)
returns public.parametros_financiamento
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem     uuid := auth.uid();
  v_bancos   text[];
  v_vigente  uuid;
  v_nova     public.parametros_financiamento;
begin
  if v_quem is null then
    raise exception 'Nova vigência das condições de financiamento sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;

  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'financeiro')) then
    raise exception 'Só Administrador ou Financeiro mudam as condições de financiamento (matriz A17, "Editar texto legal e condições de financiamento").'
      using errcode = '42501';
  end if;

  -- Bancos: aparados, sem vazios, sem repetidos, na ordem em que vieram (a
  -- primeira aparição manda). Sobrar nenhum vira '{}', e o CHECK recusa.
  select coalesce(array_agg(nome order by primeira), '{}')
    into v_bancos
    from (select btrim(x, E' \t\r\n') as nome, min(n) as primeira
            from unnest(p_bancos_parceiros) with ordinality as u(x, n)
           where btrim(x, E' \t\r\n') <> ''
           group by btrim(x, E' \t\r\n')) s;

  -- Trava a vigente: duas edições ao mesmo tempo não abrem duas vigências —
  -- a segunda espera, não acha mais vigente aberta, e o índice único a recusa.
  select id into v_vigente
    from public.parametros_financiamento
   where org_id = public.org_padrao()
     and vigencia_ate is null
   for update;

  if found then
    update public.parametros_financiamento
       set vigencia_ate = current_date
     where id = v_vigente;
  end if;

  insert into public.parametros_financiamento
    (taxa_excelente_am, taxa_regular_am, taxa_risco_am,
     ano_de_referencia, ano_mais_antigo, bancos_parceiros,
     fonte_das_taxas, descricao, criado_por, vigencia_desde)
  values
    (p_taxa_excelente_am, p_taxa_regular_am, p_taxa_risco_am,
     p_ano_de_referencia, p_ano_mais_antigo, v_bancos,
     btrim(p_fonte_das_taxas, E' \t\r\n'),
     nullif(btrim(p_descricao, E' \t\r\n'), ''),
     v_quem, current_date)
  returning * into v_nova;

  return v_nova;
end;
$fn$;

revoke all on function public.financiamento_nova_vigencia(
  numeric, numeric, numeric, integer, integer, text[], text, text) from public, anon;
grant execute on function public.financiamento_nova_vigencia(
  numeric, numeric, numeric, integer, integer, text[], text, text) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5. Para quem abrir o banco sem abrir o código
-- ----------------------------------------------------------------------------
comment on table public.parametros_financiamento is
  'Condições do simulador de financiamento do site (ficha do carro, '
  '/financiamento, Garagem Profiler), como DADO com vigência (2026-09-28): '
  'taxas estimadas por perfil, ano de referência da idade do carro, ano mais '
  'antigo financiável, bancos parceiros e fonte das taxas. Uma vigente por org '
  '(parametros_financiamento_um_vigente); valor vigente não sofre UPDATE '
  '(D-T1.7) — a única escrita é financiamento_nova_vigencia, que encerra a '
  'vigente e insere a nova na mesma transação, só para admin e financeiro '
  '(matriz A17). Staff lê pela RLS; o site lê pela chave de serviço; anon nada.';

comment on column public.parametros_financiamento.taxa_excelente_am is
  'Taxa estimada do perfil bom, em % AO MÊS (1.79 = 1,79% a.m.; quem lê divide '
  'por 100). Seed: 1º quartil das 18 instituições do Banco Central, jul–set/2026.';
comment on column public.parametros_financiamento.taxa_regular_am is
  'Taxa estimada do perfil regular, em % ao mês. Seed: mediana das 18 '
  'instituições do Banco Central, jul–set/2026.';
comment on column public.parametros_financiamento.taxa_risco_am is
  'Taxa estimada do perfil de risco, em % ao mês. Seed: 3º quartil das 18 '
  'instituições do Banco Central, jul–set/2026. Excelente ≤ regular ≤ risco '
  '(CHECK parametros_financiamento_taxas_em_ordem).';
comment on column public.parametros_financiamento.ano_de_referencia is
  'Ano contra o qual a idade do carro é medida (idade = ano_de_referencia − '
  'ano do carro). NÃO é o ano do relógio: se fosse, em 1º de janeiro todo carro '
  'envelheceria e as parcelas subiriam sozinhas. Muda junto com as taxas, numa '
  'vigência nova.';
comment on column public.parametros_financiamento.ano_mais_antigo is
  'Carro com ano MENOR que este não recebe estimativa de parcela ("sem '
  'estimativa"). 2009 por decisão do dono em 2026-09-28: "temos bancos '
  'parceiros que parcelam carros até 2009, abaixo disso muito difícil".';
comment on column public.parametros_financiamento.bancos_parceiros is
  'Agentes financiadores citados no texto de crédito, na ordem de exibição. '
  'Só nomes: o "entre outros" é da tela. 1 a 30, sem vazio (CHECK '
  'parametros_financiamento_bancos_validos); a função apara e tira repetidos.';
comment on column public.parametros_financiamento.fonte_das_taxas is
  'De onde as taxas saíram, como vai na tela ("Parcela estimada pela <fonte>"). '
  '1 a 200 caracteres aparada (CHECK parametros_financiamento_fonte_preenchida).';
comment on column public.parametros_financiamento.descricao is
  'Nota livre de quem abriu a vigência: o que mudou e por quê.';
comment on column public.parametros_financiamento.criado_por is
  'Quem abriu a vigência: auth.uid() carimbado por financiamento_nova_vigencia, '
  'nunca declarado pelo corpo. Nulo só na semente da migração. Sem FK de '
  'propósito: on delete set null seria UPDATE, que o guarda D-T1.7 recusa.';

comment on function public.financiamento_nova_vigencia(
  numeric, numeric, numeric, integer, integer, text[], text, text) is
  'Única escrita de parametros_financiamento. Exige sessão (auth.uid()) e papel '
  'admin ou financeiro (matriz A17) — senão 42501. Apara os bancos, tira vazios '
  'e repetidos mantendo a ordem; trava a vigente, encerra com vigencia_ate = '
  'hoje e insere a nova com vigencia_desde = hoje e criado_por = auth.uid(), '
  'na mesma transação. Sem vigente, só insere. Devolve a linha nova.';


-- ----------------------------------------------------------------------------
-- 6. A semente — só com a tabela vazia
-- ----------------------------------------------------------------------------
insert into public.parametros_financiamento
  (taxa_excelente_am, taxa_regular_am, taxa_risco_am,
   ano_de_referencia, ano_mais_antigo, bancos_parceiros,
   fonte_das_taxas, descricao)
select
  1.79, 1.95, 2.70,
  2026, 2009,
  array['Sicredi', 'Safra', 'Banco Pan', 'Santander', 'Bradesco', 'Itaú',
        'BV Financeira', 'Banco C6', 'Mercado Pago', 'Banco BBC'],
  'média de 18 instituições, Banco Central, jul–set/2026',
  'Seed de 2026-09-28. Taxas: Banco Central, Aquisição de veículos – Prefixado – PF, média das 41 janelas de 10/07 a 11/09/2026, 18 instituições (1º quartil, mediana e 3º quartil). Ano mais antigo (2009) e bancos parceiros: decisão do dono em 2026-09-28.'
where not exists (select 1 from public.parametros_financiamento);


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. A parte de efeito cria quatro usuários de
-- sonda (financeiro, admin, comercial, gestor), veste a sessão de cada um,
-- chama a função, tenta escrever direto e tenta violar cada regra — num
-- sub-bloco que termina com um sentinela, e o rollback do sub-bloco leva
-- tudo junto: as vigências abertas e encerradas, os usuários, os perfis e
-- qualquer `set local role`/claims. As variáveis sobrevivem ao rollback
-- (plpgsql não desfaz variável), e é por elas que o veredito sai. Nada fica
-- gravado — nem em produção, nem numa reaplicação. Sem data fixa: tudo
-- relativo a `current_date`.
do $aceite$
declare
  falhas            int := 0;
  v_col             record;
  v_tipo            text;
  v_notnull         boolean;
  v_nome            text;
  v_def             text;
  v_regra           text;
  v_msg             text;
  v_seed            public.parametros_financiamento;
  v_vig             public.parametros_financiamento;
  v_vigentes        int;
  v_linhas_antes    int;
  v_linhas_depois   int;
  v_restou          int;
  v_assinatura      constant text :=
    'public.financiamento_nova_vigencia(numeric, numeric, numeric, integer, integer, text[], text, text)';

  -- a sonda
  v_ids             jsonb := '{}'::jsonb;
  v_papel           text;
  v_uid             uuid;
  v_fin             uuid;
  v_adm             uuid;
  v_cli             uuid := gen_random_uuid();   -- authenticated sem perfil: cliente
  v_base            jsonb;
  v_json            jsonb;
  v_caso            record;

  -- o que a sonda viu antes de ser desfeita
  v_anon_le         text := '<não rodou>';
  v_anon_chama      text := '<não rodou>';
  v_sem_sessao      text := '<não rodou>';
  v_recusados       int := 0;
  v_recusados_a17   int := 0;
  v_cli_viu         int := -1;
  v_fin_viu         int := -1;
  v_fin_insere      text := '<não rodou>';
  v_fin_atualiza    text := '<não rodou>';
  v_fin_apaga       text := '<não rodou>';
  v_nova_fin        public.parametros_financiamento;
  v_gravada_fin     public.parametros_financiamento;
  v_antiga_ate      date;
  v_vigentes_fin    int := -1;
  v_vigente_fin     uuid;
  v_nova_adm        public.parametros_financiamento;
  v_fin_ate         date;
  v_vigentes_adm    int := -1;
  v_fora_de_ordem   text := '<não rodou>';
  v_intacta         boolean := false;
  v_bancos_vazios   int := 0;
  v_segunda         text := '<não rodou>';
  v_edita           text := '<não rodou>';
  v_reabre          text := '<não rodou>';
  v_casos_recusa    int := 0;
  v_recusas_certas  int := 0;
  v_casos_aceite    int := 0;
  v_aceitos         int := 0;
begin
  if current_user in ('authenticated', 'anon', 'service_role') then
    raise exception 'ACEITE INCONCLUSIVO: a migração roda como papel de API (%)', current_user;
  end if;

  -- 1 · As colunas: tipo exato e nulidade.
  for v_col in
    select * from (values
      ('id',                'uuid',                     true),
      ('org_id',            'uuid',                     true),
      ('taxa_excelente_am', 'numeric(5,2)',             true),
      ('taxa_regular_am',   'numeric(5,2)',             true),
      ('taxa_risco_am',     'numeric(5,2)',             true),
      ('ano_de_referencia', 'smallint',                 true),
      ('ano_mais_antigo',   'smallint',                 true),
      ('bancos_parceiros',  'text[]',                   true),
      ('fonte_das_taxas',   'text',                     true),
      ('descricao',         'text',                     false),
      ('criado_por',        'uuid',                     false),
      ('vigencia_desde',    'date',                     true),
      ('vigencia_ate',      'date',                     false),
      ('criado_em',         'timestamp with time zone', true)
    ) as c(nome, tipo, obrigatoria)
  loop
    select format_type(a.atttypid, a.atttypmod), a.attnotnull
      into v_tipo, v_notnull
      from pg_attribute a
     where a.attrelid = 'public.parametros_financiamento'::regclass
       and a.attname  = v_col.nome and a.attnum > 0 and not a.attisdropped;
    if v_tipo is distinct from v_col.tipo or v_notnull is distinct from v_col.obrigatoria then
      falhas := falhas + 1;
      raise warning 'FALHOU: parametros_financiamento.% é "%" (not null = %), esperado "%" (not null = %)',
        v_col.nome, coalesce(v_tipo, '<ausente>'), v_notnull, v_col.tipo, v_col.obrigatoria;
    end if;
  end loop;

  if obj_description('public.parametros_financiamento'::regclass, 'pg_class') is null
     or obj_description(v_assinatura::regprocedure, 'pg_proc') is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: tabela ou função sem comentário';
  end if;

  -- 2 · As sete regras existem com nome, são CHECK e estão validadas.
  foreach v_nome in array array[
    'parametros_financiamento_taxas_na_faixa',
    'parametros_financiamento_taxas_em_ordem',
    'parametros_financiamento_ano_de_referencia_na_faixa',
    'parametros_financiamento_ano_mais_antigo_na_faixa',
    'parametros_financiamento_bancos_validos',
    'parametros_financiamento_fonte_preenchida',
    'parametros_financiamento_vigencia_em_ordem'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.parametros_financiamento'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;

  -- A régua dos bancos: IMMUTABLE, com search_path fixo.
  if not exists (select 1 from pg_proc
                  where oid = 'public.financiamento_bancos_validos(text[])'::regprocedure
                    and provolatile = 'i'
                    and proconfig is not null
                    and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')) then
    falhas := falhas + 1;
    raise warning 'FALHOU: financiamento_bancos_validos não é IMMUTABLE com search_path fixo';
  end if;

  -- 3 · O guarda de vigência (BEFORE UPDATE, por linha) e a vigente única.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.parametros_financiamento'::regclass
                    and tgname  = 'parametros_financiamento_vigencia'
                    and tgfoid  = 'public.nucleo_so_encerra_vigencia()'::regprocedure
                    and tgtype & 1 = 1       -- por linha
                    and tgtype & 2 = 2       -- BEFORE
                    and tgtype & 16 = 16     -- UPDATE
                    and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_financiamento_vigencia não é BEFORE UPDATE ligado a nucleo_so_encerra_vigencia';
  end if;

  select pg_get_indexdef(i.indexrelid), pg_get_expr(i.indpred, i.indrelid)
    into v_def, v_regra
    from pg_index i
   where i.indexrelid = 'public.parametros_financiamento_um_vigente'::regclass
     and i.indisunique;
  if v_def is null or v_def not like '%(org_id)%' or v_regra is distinct from '(vigencia_ate IS NULL)' then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_financiamento_um_vigente não é único em (org_id) where vigencia_ate is null (%; %)',
      coalesce(v_def, '<ausente>'), v_regra;
  end if;

  -- 4 · RLS ligada e uma policy só: leitura de staff na org.
  if not (select relrowsecurity from pg_class where oid = 'public.parametros_financiamento'::regclass) then
    falhas := falhas + 1;
    raise warning 'FALHOU: RLS desligada em parametros_financiamento';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'parametros_financiamento') <> 1
     or not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'parametros_financiamento'
                       and policyname = 'nucleo_staff_le' and cmd = 'SELECT'
                       and permissive = 'PERMISSIVE' and roles = array['authenticated']::name[]
                       and qual like '%is_staff(auth.uid())%' and qual like '%org_padrao()%') then
    falhas := falhas + 1;
    raise warning 'FALHOU: as policies de parametros_financiamento não são só nucleo_staff_le (SELECT, staff, org)';
  end if;

  -- 5 · Privilégio: anon nada; authenticated só lê; service_role lê.
  foreach v_nome in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege('anon', 'public.parametros_financiamento', v_nome) then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon tem % em parametros_financiamento', v_nome;
    end if;
  end loop;
  foreach v_nome in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
    if has_table_privilege('authenticated', 'public.parametros_financiamento', v_nome) then
      falhas := falhas + 1;
      raise warning 'FALHOU: authenticated tem % em parametros_financiamento — escrita direta seria silêncio da RLS, não 42501', v_nome;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.parametros_financiamento', 'SELECT')
     or not has_table_privilege('service_role', 'public.parametros_financiamento', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o painel (authenticated) ou o site (service_role) não lê parametros_financiamento';
  end if;

  -- A função: SECURITY DEFINER, search_path fixo, fora do alcance de anon.
  if not exists (select 1 from pg_proc
                  where oid = v_assinatura::regprocedure
                    and prosecdef
                    and 'search_path=public' = any(proconfig)) then
    falhas := falhas + 1;
    raise warning 'FALHOU: financiamento_nova_vigencia não é SECURITY DEFINER com search_path = public';
  end if;
  if has_function_privilege('anon', v_assinatura, 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon executa financiamento_nova_vigencia';
  end if;
  if not has_function_privilege('authenticated', v_assinatura, 'EXECUTE')
     or not has_function_privilege('service_role', v_assinatura, 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated ou service_role sem EXECUTE em financiamento_nova_vigencia';
  end if;

  -- 6 · A semente: é a PRIMEIRA linha da tabela (encerrada ou não — numa
  --     reaplicação, depois de o financeiro ter aberto vigência nova, ela
  --     continua lá, só encerrada), e há exatamente uma vigente.
  select * into v_seed
    from public.parametros_financiamento
   where org_id = public.org_padrao()
   order by criado_em, vigencia_desde, id
   limit 1;
  if v_seed.id is null then
    raise exception 'ACEITE FALHOU: parametros_financiamento sem semente — o simulador ficaria sem taxa';
  end if;
  if v_seed.taxa_excelente_am <> 1.79 or v_seed.taxa_regular_am <> 1.95 or v_seed.taxa_risco_am <> 2.70
     or v_seed.ano_de_referencia <> 2026 or v_seed.ano_mais_antigo <> 2009
     or v_seed.bancos_parceiros is distinct from
          array['Sicredi', 'Safra', 'Banco Pan', 'Santander', 'Bradesco', 'Itaú',
                'BV Financeira', 'Banco C6', 'Mercado Pago', 'Banco BBC']
     or v_seed.fonte_das_taxas is distinct from 'média de 18 instituições, Banco Central, jul–set/2026'
     or coalesce(v_seed.descricao, '') not like 'Seed de 2026-09-28.%decisão do dono em 2026-09-28.'
     or v_seed.criado_por is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: a semente diverge de finance-calculator.ts e da decisão de 2026-09-28: %', to_jsonb(v_seed);
  end if;

  select count(*) into v_vigentes
    from public.parametros_financiamento
   where org_id = public.org_padrao() and vigencia_ate is null;
  if v_vigentes <> 1 then
    raise exception 'ACEITE FALHOU: % vigência(s) aberta(s) — esperado 1', v_vigentes;
  end if;
  select * into v_vig
    from public.parametros_financiamento
   where org_id = public.org_padrao() and vigencia_ate is null;

  select count(*) into v_linhas_antes from public.parametros_financiamento;

  -- 7 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    -- 7a · Os usuários de sonda, com o papel de cada um (o gesto das
    --      20260923150000 e 20260925200000).
    foreach v_papel in array array['financeiro', 'admin', 'comercial', 'gestor'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-financiamento-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite Financiamento ' || v_papel,
             papeis = array[v_papel], role = v_papel, is_active = true
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;
    v_fin := (v_ids->>'financeiro')::uuid;
    v_adm := (v_ids->>'admin')::uuid;

    -- 7b · anon: nem lê, nem chama.
    begin
      set local role anon;
      perform 1 from public.parametros_financiamento limit 1;
      reset role;
      v_anon_le := 'leu';
    exception when insufficient_privilege then v_anon_le := 'negado';
    end;
    begin
      set local role anon;
      perform public.financiamento_nova_vigencia(1.79, 1.95, 2.70, 2026, 2009,
                array['Sicredi'], 'Aceite anon');
      reset role;
      v_anon_chama := 'chamou';
    exception when insufficient_privilege then v_anon_chama := 'negado';
    end;

    -- 7c · Sem sessão (nem o dono da conexão passa sem auth.uid()).
    begin
      perform set_config('request.jwt.claims', '', true);
      perform public.financiamento_nova_vigencia(1.79, 1.95, 2.70, 2026, 2009,
                array['Sicredi'], 'Aceite sem sessão');
      v_sem_sessao := 'gravou';
    exception when insufficient_privilege then v_sem_sessao := 'negado';
    end;

    -- 7d · Staff que a A17 não deixa (comercial, gestor) e o cliente da
    --      Garagem: 42501, com a mensagem citando a matriz.
    foreach v_uid in array array[(v_ids->>'comercial')::uuid, (v_ids->>'gestor')::uuid, v_cli] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.financiamento_nova_vigencia(9.00, 9.50, 9.90, 2026, 2009,
                  array['Sicredi'], 'Aceite papel recusado');
        reset role;
        perform set_config('request.jwt.claims', '', true);
        falhas := falhas + 1;
        raise warning 'FALHOU: % abriu vigência de financiamento', v_uid;
      exception when insufficient_privilege then
        get stacked diagnostics v_msg = message_text;
        v_recusados := v_recusados + 1;
        if v_msg like '%A17%' then v_recusados_a17 := v_recusados_a17 + 1; end if;
      end;
    end loop;

    -- 7e · O cliente da Garagem não lê; o financeiro (staff) lê.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_cli, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_cli_viu from public.parametros_financiamento;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_cli_viu := 0;
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_fin_viu from public.parametros_financiamento where id = v_vig.id;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_fin_viu := -2;  -- sem SELECT
    end;

    -- 7f · Nem o financeiro escreve DIRETO: 42501, não "0 linhas" (O1).
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.parametros_financiamento
        (taxa_excelente_am, taxa_regular_am, taxa_risco_am, ano_de_referencia,
         ano_mais_antigo, bancos_parceiros, fonte_das_taxas, vigencia_desde, vigencia_ate)
      values (1.79, 1.95, 2.70, 2026, 2009, array['Sicredi'], 'Aceite direto',
              current_date + 365, current_date + 730);
      reset role;
      v_fin_insere := 'inseriu';
    exception when insufficient_privilege then v_fin_insere := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.parametros_financiamento set vigencia_ate = current_date where id = v_vig.id;
      reset role;
      v_fin_atualiza := 'atualizou';
    exception when insufficient_privilege then v_fin_atualiza := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      delete from public.parametros_financiamento where id = v_vig.id;
      reset role;
      v_fin_apaga := 'apagou';
    exception when insufficient_privilege then v_fin_apaga := 'negado';
    end;

    -- 7g · O caminho certo, na sessão do financeiro: encerra a vigente e abre
    --      a nova, carimbada com ele. Os bancos vêm sujos de propósito —
    --      espaço, vazio, nulo, repetido, tab e quebra de linha.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into v_nova_fin
      from public.financiamento_nova_vigencia(
             1.85, 2.05, 2.90, 2027, 2010,
             array[' Sicredi ', 'Safra', '', null, 'Sicredi', E'\nItaú\t', '   '],
             '  fonte do aceite  ', 'Aceite: vigência aberta pelo financeiro');
    reset role;
    perform set_config('request.jwt.claims', '', true);

    select * into v_gravada_fin from public.parametros_financiamento where id = v_nova_fin.id;
    select vigencia_ate into v_antiga_ate from public.parametros_financiamento where id = v_vig.id;
    select count(*), max(id::text)::uuid into v_vigentes_fin, v_vigente_fin
      from public.parametros_financiamento
     where org_id = public.org_padrao() and vigencia_ate is null;

    if v_nova_fin.id is null
       or to_jsonb(v_gravada_fin) is distinct from to_jsonb(v_nova_fin)
       or v_nova_fin.criado_por is distinct from v_fin
       or v_nova_fin.org_id is distinct from public.org_padrao()
       or v_nova_fin.vigencia_desde <> current_date or v_nova_fin.vigencia_ate is not null
       or v_nova_fin.taxa_excelente_am <> 1.85 or v_nova_fin.taxa_regular_am <> 2.05
       or v_nova_fin.taxa_risco_am <> 2.90
       or v_nova_fin.ano_de_referencia <> 2027 or v_nova_fin.ano_mais_antigo <> 2010
       or v_nova_fin.bancos_parceiros is distinct from array['Sicredi', 'Safra', 'Itaú']
       or v_nova_fin.fonte_das_taxas is distinct from 'fonte do aceite' then
      falhas := falhas + 1;
      raise warning 'FALHOU: a vigência do financeiro não saiu como prometido: devolvida %, gravada %',
        to_jsonb(v_nova_fin), to_jsonb(v_gravada_fin);
    end if;
    if v_antiga_ate is distinct from current_date then
      falhas := falhas + 1;
      raise warning 'FALHOU: a vigência anterior ficou com vigencia_ate = %, esperado hoje', v_antiga_ate;
    end if;
    if v_vigentes_fin <> 1 or v_vigente_fin is distinct from v_nova_fin.id then
      falhas := falhas + 1;
      raise warning 'FALHOU: depois do financeiro há % vigente(s), e a vigente é % (esperado a nova)',
        v_vigentes_fin, v_vigente_fin;
    end if;

    -- 7h · O admin também pode: encerra a do financeiro e abre a dele.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into v_nova_adm
      from public.financiamento_nova_vigencia(
             1.79, 1.95, 2.70, 2026, 2009,
             array['Sicredi', 'Safra'], 'fonte do aceite, admin');
    reset role;
    perform set_config('request.jwt.claims', '', true);

    select vigencia_ate into v_fin_ate from public.parametros_financiamento where id = v_nova_fin.id;
    select count(*) into v_vigentes_adm
      from public.parametros_financiamento
     where org_id = public.org_padrao() and vigencia_ate is null;
    if v_nova_adm.criado_por is distinct from v_adm or v_nova_adm.descricao is not null
       or v_fin_ate is distinct from current_date or v_vigentes_adm <> 1 then
      falhas := falhas + 1;
      raise warning 'FALHOU: a vigência do admin não saiu (criado_por %, descrição %, a do financeiro encerrou em %, vigentes %)',
        v_nova_adm.criado_por, v_nova_adm.descricao, v_fin_ate, v_vigentes_adm;
    end if;

    -- 7i · Taxas fora de ordem, pela função: recusa pela regra certa, e o
    --      encerramento que a função já tinha feito volta junto (atômico).
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.financiamento_nova_vigencia(2.00, 1.90, 2.70, 2026, 2009,
                array['Sicredi'], 'Aceite fora de ordem');
      reset role;
      v_fora_de_ordem := 'aceitou';
    exception when check_violation then
      get stacked diagnostics v_regra = constraint_name;
      v_fora_de_ordem := 'recusou por ' || v_regra;
    end;
    perform set_config('request.jwt.claims', '', true);
    v_intacta := exists (select 1 from public.parametros_financiamento
                          where id = v_nova_adm.id and vigencia_ate is null)
             and (select count(*) from public.parametros_financiamento
                   where org_id = public.org_padrao() and vigencia_ate is null) = 1;

    -- 7j · Bancos vazios pela função: '{}' e uma lista que a normalização
    --      esvazia. Os dois caem na regra dos bancos. Em JSON porque, em
    --      literal de array do Postgres, "\t" é a letra t — não um tab.
    for v_json in
      select value from jsonb_array_elements('[[], ["", "   ", null, "\t\r\n"]]'::jsonb)
    loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.financiamento_nova_vigencia(1.79, 1.95, 2.70, 2026, 2009,
                  array(select jsonb_array_elements_text(v_json)), 'Aceite bancos vazios');
        reset role;
        falhas := falhas + 1;
        raise warning 'FALHOU: a função aceitou bancos %', v_json;
      exception when check_violation then
        get stacked diagnostics v_regra = constraint_name;
        if v_regra = 'parametros_financiamento_bancos_validos' then
          v_bancos_vazios := v_bancos_vazios + 1;
        else
          falhas := falhas + 1;
          raise warning 'FALHOU: bancos % recusados por "%", não pela regra dos bancos', v_json, v_regra;
        end if;
      end;
    end loop;
    perform set_config('request.jwt.claims', '', true);

    -- 7k · Direto, como dono (fora da API): a segunda vigente é recusada pelo
    --      índice, e o guarda recusa editar valor vigente e reabrir histórico.
    begin
      insert into public.parametros_financiamento
        (taxa_excelente_am, taxa_regular_am, taxa_risco_am, ano_de_referencia,
         ano_mais_antigo, bancos_parceiros, fonte_das_taxas)
      values (1.79, 1.95, 2.70, 2026, 2009, array['Sicredi'], 'Aceite segunda vigente');
      v_segunda := 'aceitou';
    exception when unique_violation then
      get stacked diagnostics v_regra = constraint_name;
      v_segunda := 'recusou por ' || v_regra;
    end;
    begin
      update public.parametros_financiamento set taxa_regular_am = 1.99 where id = v_nova_adm.id;
      v_edita := 'editou';
    exception when raise_exception then v_edita := 'recusou';
    end;
    begin
      update public.parametros_financiamento set vigencia_ate = null where id = v_vig.id;
      v_reabre := 'reabriu';
    exception
      when raise_exception then v_reabre := 'recusou';
      -- Sem o guarda, a reabertura passa e só o índice de vigente única a
      -- barra: o histórico ficou editável, e o veredito tem de dizer isso.
      when unique_violation then v_reabre := 'passou pelo guarda (só o índice barrou)';
    end;

    -- 7l · Cada regra, pelo efeito e pelo nome. A linha de prova é uma
    --      vigência FUTURA e já encerrada: fica fora do índice de vigente
    --      única e não passa pelo gatilho (que é só de UPDATE). A base é
    --      fixa — não a vigente — para que cada caso viole uma regra só,
    --      seja qual for a vigente numa reaplicação. Os casos sem regra são
    --      a contraprova: o limite exato passa.
    v_base := jsonb_build_object(
      'org_id',            public.org_padrao(),
      'taxa_excelente_am', 1.79,
      'taxa_regular_am',   1.95,
      'taxa_risco_am',     2.70,
      'ano_de_referencia', 2026,
      'ano_mais_antigo',   2009,
      'bancos_parceiros',  jsonb_build_array('Sicredi', 'Safra'),
      'fonte_das_taxas',   'Aceite parametros_financiamento',
      'descricao',         'Aceite',
      'vigencia_desde',    current_date + 365,
      'vigencia_ate',      current_date + 730,
      'criado_em',         now());

    for v_caso in
      select * from (values
        ('a base',                          '{}'::jsonb, null::text),
        ('taxas no teto, iguais',           '{"taxa_excelente_am": 10, "taxa_regular_am": 10, "taxa_risco_am": 10}', null),
        ('ano mais antigo = referência',    '{"ano_mais_antigo": 2026}', null),
        ('limites dos anos',                '{"ano_de_referencia": 2100, "ano_mais_antigo": 1950}', null),
        ('30 bancos',                       jsonb_build_object('bancos_parceiros',
                                              (select jsonb_agg('Banco ' || g) from generate_series(1, 30) g)), null),
        ('fonte de 200, com espaço em volta', jsonb_build_object('fonte_das_taxas', E' \t' || repeat('x', 200) || E'\n'), null),
        ('vigência de um dia',              jsonb_build_object('vigencia_ate', current_date + 365), null),
        ('taxa zero',                       '{"taxa_excelente_am": 0}',        'parametros_financiamento_taxas_na_faixa'),
        ('taxa negativa',                   '{"taxa_excelente_am": -1}',       'parametros_financiamento_taxas_na_faixa'),
        ('taxa acima de 10',                '{"taxa_risco_am": 10.01}',        'parametros_financiamento_taxas_na_faixa'),
        ('regular abaixo do excelente',     '{"taxa_regular_am": 1.50}',       'parametros_financiamento_taxas_em_ordem'),
        ('risco abaixo do regular',         '{"taxa_risco_am": 1.90}',         'parametros_financiamento_taxas_em_ordem'),
        ('referência antes de 2020',        '{"ano_de_referencia": 2019}',     'parametros_financiamento_ano_de_referencia_na_faixa'),
        ('referência depois de 2100',       '{"ano_de_referencia": 2101}',     'parametros_financiamento_ano_de_referencia_na_faixa'),
        ('ano mais antigo antes de 1950',   '{"ano_mais_antigo": 1949}',       'parametros_financiamento_ano_mais_antigo_na_faixa'),
        ('ano mais antigo depois da referência', '{"ano_mais_antigo": 2027}',  'parametros_financiamento_ano_mais_antigo_na_faixa'),
        ('bancos vazio',                    '{"bancos_parceiros": []}',        'parametros_financiamento_bancos_validos'),
        ('banco string vazia',              '{"bancos_parceiros": ["Sicredi", ""]}',    'parametros_financiamento_bancos_validos'),
        ('banco só espaço',                 '{"bancos_parceiros": ["Sicredi", "   "]}', 'parametros_financiamento_bancos_validos'),
        ('banco só tab e quebra de linha',  '{"bancos_parceiros": ["Sicredi", "\t\r\n"]}', 'parametros_financiamento_bancos_validos'),
        ('banco nulo',                      '{"bancos_parceiros": ["Sicredi", null]}',  'parametros_financiamento_bancos_validos'),
        ('31 bancos',                       jsonb_build_object('bancos_parceiros',
                                              (select jsonb_agg('Banco ' || g) from generate_series(1, 31) g)),
                                            'parametros_financiamento_bancos_validos'),
        ('fonte vazia',                     '{"fonte_das_taxas": ""}',         'parametros_financiamento_fonte_preenchida'),
        ('fonte só espaço',                 '{"fonte_das_taxas": " \t\n "}',   'parametros_financiamento_fonte_preenchida'),
        ('fonte de 201',                    jsonb_build_object('fonte_das_taxas', repeat('x', 201)),
                                            'parametros_financiamento_fonte_preenchida'),
        ('vigência que acaba antes de começar', jsonb_build_object('vigencia_ate', current_date + 364),
                                            'parametros_financiamento_vigencia_em_ordem')
      ) as c(nome, muda, regra)
    loop
      if v_caso.regra is null then
        v_casos_aceite := v_casos_aceite + 1;
      else
        v_casos_recusa := v_casos_recusa + 1;
      end if;
      begin
        insert into public.parametros_financiamento
        select * from jsonb_populate_record(null::public.parametros_financiamento,
                        v_base || v_caso.muda || jsonb_build_object('id', gen_random_uuid()));
        if v_caso.regra is null then
          v_aceitos := v_aceitos + 1;
        else
          falhas := falhas + 1;
          raise warning 'FALHOU: "%" foi aceito — esperado recusa por %', v_caso.nome, v_caso.regra;
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

    raise exception 'DESFAZER_ACEITE_FINANCIAMENTO' using errcode = 'PFN01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PFN01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_fin is null or v_adm is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários — nada foi provado';
  end if;
  if v_anon_le <> 'negado' or v_anon_chama <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon — leitura %, chamada da função %', v_anon_le, v_anon_chama;
  end if;
  if v_sem_sessao <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: sem sessão a função %, esperado 42501', v_sem_sessao;
  end if;
  if v_recusados <> 3 or v_recusados_a17 <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: comercial, gestor e cliente — % de 3 recusados com 42501, % citando a A17',
      v_recusados, v_recusados_a17;
  end if;
  if v_cli_viu <> 0 or v_fin_viu <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: leitura — o cliente viu % linha(s) (esperado 0), o financeiro viu % (esperado 1; -2 = sem SELECT)',
      v_cli_viu, v_fin_viu;
  end if;
  if v_fin_insere <> 'negado' or v_fin_atualiza <> 'negado' or v_fin_apaga <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: escrita direta do financeiro — insert %, update %, delete % (esperado 42501 nos três)',
      v_fin_insere, v_fin_atualiza, v_fin_apaga;
  end if;
  if v_fora_de_ordem <> 'recusou por parametros_financiamento_taxas_em_ordem' or not v_intacta then
    falhas := falhas + 1;
    raise warning 'FALHOU: taxas fora de ordem pela função: % (a vigente ficou intacta: %)',
      v_fora_de_ordem, v_intacta;
  end if;
  if v_bancos_vazios <> 2 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % de 2 listas de bancos vazias foram recusadas pela regra dos bancos', v_bancos_vazios;
  end if;
  if v_segunda <> 'recusou por parametros_financiamento_um_vigente' then
    falhas := falhas + 1;
    raise warning 'FALHOU: segunda vigente inserida direto: %', v_segunda;
  end if;
  if v_edita <> 'recusou' or v_reabre <> 'recusou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: guarda D-T1.7 — editar valor vigente %, reabrir vigência encerrada %', v_edita, v_reabre;
  end if;
  if v_casos_recusa < 19 or v_recusas_certas <> v_casos_recusa or v_aceitos <> v_casos_aceite then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % de % recusas pela regra certa, % de % limites aceitos',
      v_recusas_certas, v_casos_recusa, v_aceitos, v_casos_aceite;
  end if;

  -- Nada da prova ficou: mesma contagem, a mesma vigente aberta, sem usuários.
  select count(*) into v_linhas_depois from public.parametros_financiamento;
  select count(*) into v_restou from auth.users where email like 'aceite-financiamento-%@exemplo.invalido';
  select v_restou + count(*) into v_restou from public.profiles
   where id in (select (value #>> '{}')::uuid from jsonb_each(v_ids));
  if v_linhas_depois <> v_linhas_antes or v_restou <> 0
     or not exists (select 1 from public.parametros_financiamento
                     where id = v_vig.id and vigencia_ate is null) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (linhas % → %, % usuário(s)/perfil(is)) ou mexeu na vigente',
      v_linhas_antes, v_linhas_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em parametros_financiamento', falhas;
  end if;

  raise notice
    'Aceite verificado: parametros_financiamento existe com as sete regras '
    'nomeadas, guarda de vigência, vigente única e RLS de staff; a semente é a '
    'do código (1,79/1,95/2,70, referência 2026) com 2009 e os dez bancos do '
    'dono; anon não lê nem chama, authenticated só lê e escrita direta é 42501; '
    'sem sessão, comercial, gestor e cliente são recusados citando a A17; '
    'financeiro e admin encerram a vigente e abrem a nova carimbada com eles, '
    'bancos aparados e sem repetição, uma vigente depois; fora de ordem e '
    'bancos vazios caem na regra certa sem mexer na vigente; segunda vigente, '
    'edição de valor e reabertura são recusadas; a prova não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20260928120000', 'parametros_financiamento')
  on conflict (version) do nothing;
