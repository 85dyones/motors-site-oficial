-- ============================================================================
-- As consultas de documento — CPF e CNPJ pela APIBrasil, e o link do relatório
-- ============================================================================
-- Pedido do dono (2026-10-18): consultar CPF e CNPJ pela APIBrasil, em níveis
-- ("básico", "dados", "crédito" e três pacotes completos: "econômico", "score"
-- — só CNPJ — e "integral"), com o histórico de
-- buscas da equipe e um LINK para o consultor mandar o relatório ao banco, à
-- financeira ou ao próprio cliente.
--
-- É o primeiro dado de PESSOA que a loja compra: endereço, renda, restrições,
-- processos. `consultas_de_placa` (20261006180000) recusa dado pessoal no
-- retrato; aqui o dado pessoal É o produto, então a proteção muda de lugar:
-- quem pode ver, por que consultou e por quanto tempo o relatório sai da loja.
--
-- Revisão do qa-guardian (2026-10-18, antes de ir a produção): o token do
-- link entra cru na função e o hash é calculado lá dentro; `authenticated`
-- não lê `token_hash`; a consulta deixa de ser gravada pela sessão e passa a
-- ser registrada pelo servidor (service_role) por UMA função; toda tentativa
-- fica registrada, inclusive a que falhou; e os números de negócio saem do
-- código para `parametros_consulta_documento`, com vigência. Segunda
-- passada (2026-10-18): a consulta passa a ser imutável também para a
-- service_role — sem UPDATE e com o gatilho `consultas_de_documento_so_inclusao`,
-- que recusa UPDATE para todos, inclusive o dono; o DELETE da service_role
-- fica, e só para o pedido de eliminação do titular (LGPD, art. 18, VI).
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.consultas_de_documento` — uma linha por consulta TENTADA: a que
--    deu certo, a que deu certo pela metade e a que falhou (`situacao`:
--    completa, parcial, falhou). Consulta que falhou também é registro: o
--    fornecedor pode ter cobrado, e o titular tem direito de saber que o
--    documento dele foi consultado. `tentativas` (jsonb, lista) diz o que
--    aconteceu com cada produto chamado: {produto, ok, status, motivo,
--    pode_ter_cobrado, custo}. `relatorio` (jsonb) é o relatório normalizado
--    montado pelo servidor, o que a tela e o link mostram — sempre presente,
--    mesmo vazio. `respostas` (jsonb) é o miolo bruto de cada produto, por
--    produto: é ele que deixa remontar o relatório sem pagar de novo quando
--    o leitor do formato mudar. O miolo tem MAIS dado pessoal que o
--    relatório; lê-se pela mesma RLS da tabela (os quatro papéis), e NUNCA
--    sai pelo link: `abrir_relatorio_compartilhado` devolve só o relatório
--    (o aceite confere as colunas da função). `produtos` lista os produtos
--    da APIBrasil chamados, pelo `tipo` dela (`{cpf-lite,receita-federal}`,
--    `{cnpj,cadastral-score-pj}`). A lista de produtos NÃO é travada no
--    banco (decisão de 2026-10-18): o catálogo do fornecedor muda e quem
--    escolhe o produto é o servidor; o banco só exige o formato do
--    identificador, e que cada tentativa seja de um produto da lista.
-- 2. `public.registrar_consulta_de_documento(...)` — SECURITY DEFINER, a
--    ÚNICA porta de escrita da consulta, executável só pela service_role (o
--    servidor, depois de chamar o fornecedor). Recebe quem consultou
--    (`p_criado_por`), confere que tem um dos quatro papéis da ação, e
--    carimba org (org_padrao()), nome (profiles.full_name, a fonte de
--    autor_atual()) e hora (now()). Por isso não há gatilho de carimbo na
--    consulta: a função carimba tudo, e um gatilho que lesse auth.uid()
--    trocaria o autor informado pelo de uma sessão qualquer.
-- 3. `public.relatorios_compartilhados` — o link que o consultor manda. Só o
--    sha256 do token fica no banco, e `authenticated` lê a tabela por COLUNA,
--    sem `token_hash`: nem quem enxerga o link na tela vê o hash dele.
-- 4. O gatilho de carimbo do link, no padrão de `consultas_de_modelo_carimbar()`:
--    com sessão, org, quem (id e nome) e quando são da sessão.
-- 5. `relatorios_compartilhados_so_revogar()` — o gatilho que deixa o link
--    mudar de um jeito só: ser revogado, para sempre. O contador de acessos só
--    cresce.
-- 6. `public.abrir_relatorio_compartilhado(p_token)` — SECURITY DEFINER, a
--    única porta da página pública (sem sessão): recebe o TOKEN da URL,
--    confere a forma (43 caracteres base64url), calcula o sha256 lá dentro,
--    devolve o relatório se o link existir, não estiver revogado nem
--    expirado, e conta o acesso. Quem tem só o hash (vazou a tabela) não abre.
-- 7. `public.parametros_consulta_documento` — os números da tela como DADO
--    com vigência (regra do repo: número de negócio em código está errado):
--    dias do link, janela de "consulta recente", minutos contra repetição,
--    links ativos por consulta e a tabela de preços de referência por
--    produto. Escrita só pela `consulta_documento_nova_vigencia`, só admin.
-- 8. `consultas_de_documento_so_inclusao()` — o gatilho BEFORE UPDATE que
--    recusa QUALQUER edição da consulta, para todos (sessão, service_role e
--    dono): o registro de "quem viu meus dados, e por quê" não se reescreve.
--    Apagar continua possível só pela service_role, e só para atender o
--    pedido de eliminação do titular (LGPD, art. 18, VI).
--
-- ---------------------------------------------------------------------------
-- LGPD — o que o banco segura
-- ---------------------------------------------------------------------------
-- · Base legal declarada a cada consulta: `finalidade` é obrigatória e vem de
--   uma lista fechada (financiamento, venda a prazo, compra de veículo,
--   cadastro de cliente, cadastro de fornecedor, prevenção a fraude) — as
--   hipóteses de "procedimentos preliminares de contrato", "proteção do
--   crédito" e "prevenção à fraude" do art. 7º. Sem finalidade, não entra.
-- · `titular_ciente` só aceita `true`: a tela exige a declaração de que o
--   titular está em negociação com a loja e ciente da consulta. Uma linha com
--   `false` seria a confissão de uma consulta sem base — o banco recusa.
-- · Quem consultou e quando são carimbados pela função (não pela tela), e
--   ninguém edita — nem a service_role, nem o dono (gatilho) — nem apaga pelo
--   painel: é o registro que responde ao titular "quem viu meus dados, e por
--   quê" — inclusive quando a consulta falhou. A ÚNICA saída de uma linha é o
--   DELETE da service_role, reservado ao pedido de eliminação do titular
--   (art. 18, VI); o link da consulta apagada vai junto (FK em cascata).
-- · O link vive no máximo 30 dias (o padrão é `dias_do_link` do parâmetro),
--   e qualquer um dos quatro papéis o revoga. Revogado não volta. Cada
--   abertura é contada (`acessos`, `ultimo_acesso_em`).
-- · Marketing e SDR não leem: o relatório não é base de prospecção (a mesma
--   regra da linha "Cadastro único: Marketing e SDR só leem, e sem CPF/CNPJ").
--
-- ---------------------------------------------------------------------------
-- Quem (a NOVA ação da matriz)
-- ---------------------------------------------------------------------------
-- Linha "Consultar CPF e CNPJ (consulta paga)": Administrador, Gestor,
-- Comercial e Financeiro. O Financeiro entra porque é ele quem leva a ficha ao
-- banco e à financeira; a consulta de placa não o tem, e a matriz em
-- `src/lib/permissoes.ts` precisa ganhar a linha junto com a tela. Todas as
-- policies e a função de registro usam `tem_papel`, que já exige conta ativa.
-- Os parâmetros: os quatro leem (a tela precisa deles), só o Administrador
-- abre vigência nova.
--
-- ---------------------------------------------------------------------------
-- As regras
-- ---------------------------------------------------------------------------
--   consultas_de_documento_tipo_valido ........... cpf ou cnpj
--   consultas_de_documento_documento_valido ...... cpf: 11 dígitos; cnpj: 12
--                                                  posições [0-9A-Z] + 2 dígitos
--                                                  (CNPJ alfanumérico, IN RFB
--                                                  2.229/2024; src/lib/cnpj.ts)
--   consultas_de_documento_nivel_valido .......... basico, dados, credito,
--                                                  completo_economico, completo_score,
--                                                  completo_integral
--   consultas_de_documento_score_so_cnpj ......... completo_score só para cnpj
--   consultas_de_documento_produtos_validos ...... lista de 1 dimensão, não vazia,
--                                                  sem nulo, cada um [a-z0-9_-]
--   consultas_de_documento_nome_valido ........... nulo, ou não vazio até 200
--   consultas_de_documento_relatorio_e_objeto .... jsonb do tipo objeto
--   consultas_de_documento_respostas_e_objeto .... jsonb do tipo objeto
--   consultas_de_documento_custo_valido .......... nulo (desconhecido) ou >= 0
--   consultas_de_documento_finalidade_valida ..... a lista fechada acima
--   consultas_de_documento_titular_ciente ........ só true
--   consultas_de_documento_situacao_valida ....... completa, parcial ou falhou
--   consultas_de_documento_tentativas_validas .... lista; cada item um objeto com
--                                                  produto (da lista `produtos`),
--                                                  ok e pode_ter_cobrado booleanos,
--                                                  status nulo ou número, motivo
--                                                  nulo ou texto, custo nulo ou >= 0
--   consultas_de_documento_situacao_coerente ..... completa: nenhuma tentativa
--                                                  falhou; falhou: nenhuma deu
--                                                  certo; parcial: ao menos uma
--                                                  de cada
--
--   relatorios_compartilhados_token_unico ........ UNIQUE (token_hash)
--   relatorios_compartilhados_token_e_sha256 ..... 64 hex minúsculos
--   relatorios_compartilhados_prazo_valido ....... expira depois de criado, e no
--                                                  máximo 720 h (30 dias) depois
--   relatorios_compartilhados_revogacao_coerente . revogado_por só com revogado_em,
--                                                  e a revogação não antecede o link
--   relatorios_compartilhados_acessos_coerentes .. acessos >= 0; ultimo_acesso_em
--                                                  nulo exatamente quando acessos = 0
--
--   parametros_consulta_documento_dias_do_link_na_faixa ......... 1 a 30
--   parametros_consulta_documento_dias_de_consulta_recente_na_faixa 1 a 365
--   parametros_consulta_documento_minutos_contra_repeticao_na_faixa 0 a 1440
--   parametros_consulta_documento_links_ativos_na_faixa ......... 1 a 50
--   parametros_consulta_documento_precos_validos ... objeto não vazio, chave
--                                                    [a-z0-9_-], valor número >= 0
--   parametros_consulta_documento_fonte_preenchida . 1 a 200 caracteres aparada
--   parametros_consulta_documento_vigencia_em_ordem  vigencia_ate >= vigencia_desde
--   parametros_consulta_documento_um_vigente ....... índice único: uma vigente por org
--
-- ⚠️ DESFAZER (nada mais depende destes objetos):
--
--   begin;
--   drop function if exists public.abrir_relatorio_compartilhado(text);
--   drop function if exists public.registrar_consulta_de_documento(
--     uuid, text, text, text, text[], text, jsonb, jsonb, jsonb, text, numeric, boolean, text, boolean);
--   drop function if exists public.consulta_documento_nova_vigencia(
--     integer, integer, integer, integer, jsonb, date, text, text);
--   drop table    if exists public.parametros_consulta_documento;
--   drop table    if exists public.relatorios_compartilhados;
--   drop table    if exists public.consultas_de_documento;
--   drop function if exists public.relatorios_compartilhados_carimbar();
--   drop function if exists public.relatorios_compartilhados_so_revogar();
--   drop function if exists public.consultas_de_documento_so_inclusao();
--   drop function if exists public.consulta_documento_tentativas_validas(jsonb, text[]);
--   drop function if exists public.consulta_documento_situacao_coerente(text, jsonb);
--   drop function if exists public.consulta_documento_precos_validos(jsonb);
--   delete from supabase_migrations.schema_migrations where version = '20261018120000';
--   commit;
--
-- Aditiva (três tabelas novas; nenhuma coluna, policy ou gatilho em tabela
-- existente; `estoque_motors` não é tocada; nenhuma extensão nova — `sha256()`
-- é nativa desde o Postgres 11) e idempotente: `create table if not exists`,
-- `create index if not exists`, `create or replace` para as funções,
-- `drop … if exists` + `create` para gatilhos e policies, semente só se a org
-- não tiver linha. Os únicos `drop` de função/gatilho são de objetos que a
-- versão anterior DESTE arquivo criava (a porta com `p_token_hash` e o
-- carimbo da consulta), para quem a aplicou num banco local: produção nunca
-- os teve.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
begin
  if to_regprocedure('public.tem_papel(uuid, text)') is null
     or to_regprocedure('public.autor_atual()') is null
     or to_regprocedure('public.org_padrao()') is null
     or to_regprocedure('public.nucleo_so_encerra_vigencia()') is null
     or to_regclass('public.profiles') is null then
    raise exception
      'DEPENDÊNCIA: falta tem_papel(uuid, text), autor_atual(), org_padrao(), '
      'nucleo_so_encerra_vigencia() ou public.profiles. Nada foi aplicado.';
  end if;
  if public.org_padrao() is null then
    raise exception 'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;
  if to_regprocedure('pg_catalog.sha256(bytea)') is null then
    raise exception 'DEPENDÊNCIA: sha256(bytea) ausente (Postgres anterior ao 11). Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. As réguas das tentativas
-- ----------------------------------------------------------------------------
-- Em função porque CHECK não aceita subconsulta, e "cada item da lista"
-- precisa olhar item por item (o gesto de `financiamento_bancos_validos`).
-- IMMUTABLE e só sobre os argumentos; `search_path` vazio; nunca devolvem
-- NULL — CHECK com NULL passa. O `case` protege a ordem: `jsonb_array_elements`
-- em não-lista, e `::numeric` em não-número, levantariam erro em vez de
-- recusar pela regra.
create or replace function public.consulta_documento_tentativas_validas(p jsonb, p_produtos text[])
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(
    case when pg_catalog.jsonb_typeof(p) = 'array' then
      not exists (
        select 1
          from pg_catalog.jsonb_array_elements(p) as t(item)
         where case
                 when pg_catalog.jsonb_typeof(t.item) <> 'object' then true
                 else
                      pg_catalog.jsonb_typeof(t.item -> 'produto') is distinct from 'string'
                   or not ((t.item ->> 'produto') ~ '^[a-z0-9_-]+$')
                   or not ((t.item ->> 'produto') = any (coalesce(p_produtos, '{}'::text[])))
                   or pg_catalog.jsonb_typeof(t.item -> 'ok') is distinct from 'boolean'
                   or pg_catalog.jsonb_typeof(t.item -> 'pode_ter_cobrado') is distinct from 'boolean'
                   or coalesce(pg_catalog.jsonb_typeof(t.item -> 'status'), 'null') not in ('null', 'number')
                   or coalesce(pg_catalog.jsonb_typeof(t.item -> 'motivo'), 'null') not in ('null', 'string')
                   or case coalesce(pg_catalog.jsonb_typeof(t.item -> 'custo'), 'null')
                        when 'null'   then false
                        when 'number' then (t.item -> 'custo')::numeric < 0
                        else true
                      end
               end)
    else false end,
    false)
$fn$;

comment on function public.consulta_documento_tentativas_validas(jsonb, text[]) is
  'Régua de consultas_de_documento.tentativas (CHECK consultas_de_documento_tentativas_validas): '
  'lista; cada item um objeto {produto, ok, status, motivo, pode_ter_cobrado, custo} com produto '
  '[a-z0-9_-] e da lista produtos, ok e pode_ter_cobrado booleanos, status nulo ou número, '
  'motivo nulo ou texto, custo nulo (desconhecido) ou número >= 0. IMMUTABLE.';

create or replace function public.consulta_documento_situacao_coerente(p_situacao text, p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  -- Lista malformada responde por `tentativas_validas`, e situação inventada
  -- por `situacao_valida`: aqui elas passam, para cada regra falar de uma coisa.
  select coalesce(
    case
      when pg_catalog.jsonb_typeof(p) is distinct from 'array' then true
      when p_situacao = 'completa' then
        not exists (select 1 from pg_catalog.jsonb_array_elements(p) t(i) where t.i -> 'ok' = 'false'::jsonb)
      when p_situacao = 'falhou' then
        not exists (select 1 from pg_catalog.jsonb_array_elements(p) t(i) where t.i -> 'ok' = 'true'::jsonb)
      when p_situacao = 'parcial' then
            exists (select 1 from pg_catalog.jsonb_array_elements(p) t(i) where t.i -> 'ok' = 'true'::jsonb)
        and exists (select 1 from pg_catalog.jsonb_array_elements(p) t(i) where t.i -> 'ok' = 'false'::jsonb)
      else true
    end,
    false)
$fn$;

comment on function public.consulta_documento_situacao_coerente(text, jsonb) is
  'Régua de consultas_de_documento (CHECK consultas_de_documento_situacao_coerente): '
  'completa = nenhuma tentativa com ok false; falhou = nenhuma com ok true; parcial = '
  'ao menos uma de cada. IMMUTABLE.';


-- ----------------------------------------------------------------------------
-- 2. A consulta
-- ----------------------------------------------------------------------------
create table if not exists public.consultas_de_documento (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default public.org_padrao(),
  tipo_documento   text not null,
  documento        text not null,
  nivel            text not null,
  produtos         text[] not null,
  nome             text,
  relatorio        jsonb not null,
  respostas        jsonb not null default '{}'::jsonb,
  situacao         text not null,
  tentativas       jsonb not null default '[]'::jsonb,
  custo            numeric(10,2),
  homologacao      boolean not null default false,
  finalidade       text not null,
  titular_ciente   boolean not null,
  criado_por       uuid not null,
  criado_por_nome  text,
  criado_em        timestamptz not null default now(),

  constraint consultas_de_documento_tipo_valido
    check (tipo_documento in ('cpf', 'cnpj')),
  -- Sem máscara: o servidor grava só o que identifica. O CNPJ pode ser
  -- alfanumérico (IN RFB 2.229/2024): 12 posições letra maiúscula ou número e
  -- os 2 verificadores numéricos — a mesma expressão de src/lib/cnpj.ts. Os
  -- dígitos verificadores são conferidos no servidor antes de pagar a consulta.
  -- Escrita em "se é cpf, então…; se é cnpj, então…" para que um tipo
  -- desconhecido caia só em `tipo_valido`: cada regra responde por uma coisa.
  constraint consultas_de_documento_documento_valido
    check (    (tipo_documento <> 'cpf'  or documento ~ '^[0-9]{11}$')
           and (tipo_documento <> 'cnpj' or documento ~ '^[0-9A-Z]{12}[0-9]{2}$')),
  constraint consultas_de_documento_nivel_valido
    check (nivel in ('basico', 'dados', 'credito',
                     'completo_economico', 'completo_score', 'completo_integral')),
  -- O pacote "completo com score" só existe na APIBrasil para pessoa jurídica
  -- (cadastral-score-pj). Regra própria, e não um caso dentro de nivel_valido,
  -- para que o erro diga qual das duas coisas está errada.
  constraint consultas_de_documento_score_so_cnpj
    check (nivel <> 'completo_score' or tipo_documento = 'cnpj'),
  -- `array_to_string` pula nulo; `array_position(…, null)` é quem o acha.
  constraint consultas_de_documento_produtos_validos
    check (    array_ndims(produtos) = 1
           and cardinality(produtos) >= 1
           and array_position(produtos, null) is null
           and array_to_string(produtos, ',') ~ '^[a-z0-9_-]+(,[a-z0-9_-]+)*$'),
  constraint consultas_de_documento_nome_valido
    check (nome is null or length(btrim(nome)) between 1 and 200),
  constraint consultas_de_documento_relatorio_e_objeto
    check (jsonb_typeof(relatorio) = 'object'),
  -- Objeto por produto ({"cpf-lite": {...}, "receita-federal": {...}}): é
  -- assim que o leitor acha o miolo de cada um para remontar o relatório.
  constraint consultas_de_documento_respostas_e_objeto
    check (jsonb_typeof(respostas) = 'object'),
  -- Nulo é "o fornecedor não disse": numa falha, a loja pode ter sido cobrada
  -- sem saber quanto. Zero é zero (homologação).
  constraint consultas_de_documento_custo_valido
    check (custo is null or custo >= 0),
  constraint consultas_de_documento_finalidade_valida
    check (finalidade in ('financiamento', 'venda_a_prazo', 'compra_de_veiculo',
                          'cadastro_de_cliente', 'cadastro_de_fornecedor', 'prevencao_a_fraude')),
  constraint consultas_de_documento_titular_ciente
    check (titular_ciente = true),
  constraint consultas_de_documento_situacao_valida
    check (situacao in ('completa', 'parcial', 'falhou')),
  constraint consultas_de_documento_tentativas_validas
    check (public.consulta_documento_tentativas_validas(tentativas, produtos)),
  constraint consultas_de_documento_situacao_coerente
    check (public.consulta_documento_situacao_coerente(situacao, tentativas))
);

-- O histórico da tela: as consultas mais recentes primeiro.
create index if not exists consultas_de_documento_recentes_idx
  on public.consultas_de_documento (org_id, criado_em desc);

-- Reabrir a consulta recente do mesmo documento, em vez de pagar de novo.
create index if not exists consultas_de_documento_documento_idx
  on public.consultas_de_documento (org_id, tipo_documento, documento, criado_em desc);

-- A busca da equipe pelo nome, por prefixo, em qualquer collation — o mesmo
-- desenho de consultas_de_modelo_rotulo_idx (sem pg_trgm, que o repo não usa).
create index if not exists consultas_de_documento_nome_idx
  on public.consultas_de_documento (org_id, lower(nome) text_pattern_ops);

comment on table public.consultas_de_documento is
  'Consultas de CPF e CNPJ feitas à APIBrasil (pedido do dono em 2026-10-18), '
  'em níveis básico, dados, crédito e três completos (econômico, score só CNPJ, '
  'integral). Uma linha por consulta TENTADA — completa, parcial ou que falhou — '
  'com o que aconteceu com cada produto em `tentativas`. DADO PESSOAL (LGPD): '
  'cada linha declara a finalidade e que o titular está ciente, e a função de '
  'registro carimba quem consultou e quando. Só inclusão, e só por '
  'registrar_consulta_de_documento() (service_role): ninguém edita — nem a '
  'service_role, nem o dono (gatilho consultas_de_documento_so_inclusao). Só a '
  'service_role apaga, e só para o pedido de eliminação do titular (LGPD, art. 18, VI). '
  'Lê a ação "Consultar CPF e CNPJ (consulta paga)": Administrador, Gestor, '
  'Comercial e Financeiro. Ver 20261018120000_consultas_de_documento.sql.';
comment on column public.consultas_de_documento.tipo_documento is
  '''cpf'' ou ''cnpj''.';
comment on column public.consultas_de_documento.documento is
  'O documento consultado, sem máscara: CPF com 11 dígitos; CNPJ com 12 '
  'posições [0-9A-Z] e 2 dígitos verificadores (CNPJ alfanumérico, IN RFB 2.229/2024).';
comment on column public.consultas_de_documento.nivel is
  'O nível pedido na tela: basico, dados, credito, completo_economico, '
  'completo_score (só cnpj) ou completo_integral.';
comment on column public.consultas_de_documento.produtos is
  'Os identificadores dos produtos da APIBrasil chamados nesta consulta '
  'pelo tipo dela (ex.: {cpf-lite,receita-federal}). Nunca vazio. A lista não é '
  'travada no banco: só o formato [a-z0-9_-].';
comment on column public.consultas_de_documento.nome is
  'Nome (CPF) ou razão social (CNPJ) do titular, para a lista e a busca. Até 200.';
comment on column public.consultas_de_documento.relatorio is
  'O relatório normalizado montado pelo servidor: o que a tela e o link '
  'mostram. Sempre presente, mesmo vazio ({}) numa consulta que falhou. '
  'Contém dado pessoal: só os quatro papéis da ação leem.';
comment on column public.consultas_de_documento.respostas is
  'O miolo bruto de cada produto da APIBrasil, como objeto por produto '
  '({"cpf-lite": {...}}), para remontar o relatório sem pagar de novo se o '
  'leitor do formato mudar. Mais dado pessoal que o relatório: mesma RLS da '
  'tabela, e NUNCA sai por abrir_relatorio_compartilhado().';
comment on column public.consultas_de_documento.situacao is
  'Como a consulta terminou: completa (todos os produtos deram certo), parcial '
  '(uns sim, outros não) ou falhou (nenhum). Coerente com `tentativas` (CHECK '
  'consultas_de_documento_situacao_coerente).';
comment on column public.consultas_de_documento.tentativas is
  'O que aconteceu com cada produto chamado, em lista: [{produto, ok, status, '
  'motivo, pode_ter_cobrado, custo}]. produto é um de `produtos`; ok e '
  'pode_ter_cobrado são booleanos; status é o HTTP do fornecedor (nulo se não '
  'houve resposta); motivo é texto ou nulo; custo é o que o fornecedor disse '
  'ter cobrado pelo produto, nulo se não disse.';
comment on column public.consultas_de_documento.custo is
  'O que o fornecedor cobrou pela consulta, em reais, como ele informou. Nulo = '
  'desconhecido (inclusive numa falha que pode ter sido cobrada); zero em homologação.';
comment on column public.consultas_de_documento.homologacao is
  'A consulta rodou no modo de teste do fornecedor: não foi cobrada e o '
  'relatório é o exemplo dele. Não entra na conta e não serve para decidir crédito.';
comment on column public.consultas_de_documento.finalidade is
  'A base legal declarada pelo consultor (LGPD): financiamento, venda_a_prazo, '
  'compra_de_veiculo, cadastro_de_cliente, cadastro_de_fornecedor ou prevencao_a_fraude.';
comment on column public.consultas_de_documento.titular_ciente is
  'A declaração da tela de que o titular está em negociação com a loja e ciente '
  'da consulta. O CHECK só aceita true: sem ela, a consulta não se registra.';
comment on column public.consultas_de_documento.criado_por is
  'Quem consultou (o usuário da sessão do painel, que o servidor informa a '
  'registrar_consulta_de_documento). A função confere que ele tem um dos quatro papéis.';
comment on column public.consultas_de_documento.criado_por_nome is
  'Nome de quem consultou (profiles.full_name, a fonte de autor_atual()), '
  'legível mesmo depois que a pessoa sair da loja. Carimbado pela função.';
comment on column public.consultas_de_documento.criado_em is
  'Quando a consulta foi registrada (now() da função de registro).';


-- ----------------------------------------------------------------------------
-- 3. O link compartilhado
-- ----------------------------------------------------------------------------
create table if not exists public.relatorios_compartilhados (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default public.org_padrao(),
  -- Se a consulta um dia for apagada (pela chave de serviço, num pedido de
  -- eliminação do titular), o link vai junto: link sem relatório não existe.
  consulta_id       uuid not null references public.consultas_de_documento (id) on delete cascade,
  token_hash        text not null,
  expira_em         timestamptz not null,
  revogado_em       timestamptz,
  revogado_por      uuid,
  acessos           integer not null default 0,
  ultimo_acesso_em  timestamptz,
  criado_por        uuid not null default auth.uid(),
  criado_por_nome   text,
  criado_em         timestamptz not null default now(),

  constraint relatorios_compartilhados_token_unico
    unique (token_hash),
  -- O token nunca é gravado: só o sha256 dele, em hex minúsculo. Vazar a
  -- tabela não abre link nenhum.
  constraint relatorios_compartilhados_token_e_sha256
    check (token_hash ~ '^[0-9a-f]{64}$'),
  -- 720 horas, e não '30 days': somar dias a timestamptz depende do fuso da
  -- sessão (horário de verão); horas não. É o TETO; o prazo de cada link sai
  -- de parametros_consulta_documento.dias_do_link (1 a 30), no servidor.
  constraint relatorios_compartilhados_prazo_valido
    check (expira_em > criado_em and expira_em <= criado_em + interval '720 hours'),
  constraint relatorios_compartilhados_revogacao_coerente
    check ((revogado_por is null or revogado_em is not null)
           and (revogado_em is null or revogado_em >= criado_em)),
  constraint relatorios_compartilhados_acessos_coerentes
    check (acessos >= 0 and ((acessos = 0) = (ultimo_acesso_em is null)))
);

-- Os links de uma consulta, na tela dela (e o índice da FK, para o cascade).
create index if not exists relatorios_compartilhados_consulta_idx
  on public.relatorios_compartilhados (consulta_id, criado_em desc);

comment on table public.relatorios_compartilhados is
  'O link que o consultor manda com o relatório de uma consulta de documento '
  '(ao banco, à financeira, ao cliente). Só o sha256 do token fica gravado, e '
  'authenticated não lê token_hash (privilégio por coluna). Vive no máximo 30 '
  'dias; qualquer dos quatro papéis o revoga, e revogado não volta. A página '
  'pública o abre só por abrir_relatorio_compartilhado(token), que conta o '
  'acesso. Ver 20261018120000_consultas_de_documento.sql.';
comment on column public.relatorios_compartilhados.consulta_id is
  'A consulta cujo relatório o link abre.';
comment on column public.relatorios_compartilhados.token_hash is
  'sha256 do token do link (UTF-8), em hex minúsculo (64). O token em si nunca é '
  'gravado. authenticated só o escreve (INSERT), nunca o lê.';
comment on column public.relatorios_compartilhados.expira_em is
  'Até quando o link abre. Depois de criado_em e no máximo 30 dias (720 h) '
  'depois; o padrão é dias_do_link do parâmetro vigente. Não se altera: para '
  'encurtar, revoga-se e cria-se outro.';
comment on column public.relatorios_compartilhados.revogado_em is
  'Quando o link foi revogado. Com sessão, é o gatilho que grava (now()). '
  'Uma vez preenchido, não muda nem volta a nulo.';
comment on column public.relatorios_compartilhados.revogado_por is
  'auth.uid() de quem revogou. Com sessão, é o gatilho que grava.';
comment on column public.relatorios_compartilhados.acessos is
  'Quantas vezes o link foi aberto pela página pública. Só cresce, e só '
  'abrir_relatorio_compartilhado() o move.';
comment on column public.relatorios_compartilhados.ultimo_acesso_em is
  'A última abertura do link. Nulo enquanto ninguém abriu.';
comment on column public.relatorios_compartilhados.criado_por is
  'auth.uid() de quem gerou o link. Com sessão, é o gatilho que grava.';
comment on column public.relatorios_compartilhados.criado_por_nome is
  'Nome de quem gerou o link (autor_atual()). Com sessão, é o gatilho que grava.';
comment on column public.relatorios_compartilhados.criado_em is
  'Quando o link foi gerado. Com sessão, é o gatilho que grava (now()); é dele '
  'que se contam os 30 dias.';


-- ----------------------------------------------------------------------------
-- 4. O carimbo não é de quem chama
-- ----------------------------------------------------------------------------
-- A consulta NÃO tem gatilho de carimbo: quem grava é só a função de registro
-- (seção 7), e ela carimba tudo a partir de `p_criado_por`. A versão anterior
-- deste arquivo tinha um, que lia auth.uid(); se ele existir num banco local,
-- sai — senão trocaria o autor informado pelo de uma sessão qualquer.
drop trigger  if exists consultas_de_documento_carimbo on public.consultas_de_documento;
drop function if exists public.consultas_de_documento_carimbar();

create or replace function public.relatorios_compartilhados_carimbar()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  -- Com sessão (o painel, pelo PostgREST), org, autoria e hora são as da
  -- sessão, informe o cliente o que informar; o link nasce sem acesso e sem
  -- revogação. O contador é da página pública e a revogação é um UPDATE —
  -- nenhum dos dois se informa na criação. Sem sessão (chave de serviço),
  -- os valores informados são aceitos.
  if auth.uid() is not null then
    new.org_id           := public.org_padrao();
    new.criado_por       := auth.uid();
    new.criado_por_nome  := public.autor_atual();
    new.criado_em        := now();
    new.acessos          := 0;
    new.ultimo_acesso_em := null;
    new.revogado_em      := null;
    new.revogado_por     := null;
  end if;
  return new;
end;
$$;

comment on function public.relatorios_compartilhados_carimbar() is
  'Gatilho de relatorios_compartilhados: com sessão, grava org, autor (id e '
  'nome) e hora pela sessão, e o link nasce com zero acesso e sem revogação.';

drop trigger if exists relatorios_compartilhados_carimbo on public.relatorios_compartilhados;
create trigger relatorios_compartilhados_carimbo
  before insert on public.relatorios_compartilhados
  for each row execute function public.relatorios_compartilhados_carimbar();

revoke all on function public.relatorios_compartilhados_carimbar() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. O link só muda de um jeito: revogado, para sempre
-- ----------------------------------------------------------------------------
-- O privilégio de coluna (seção 6) já impede `authenticated` de escrever fora
-- de `revogado_em`/`revogado_por`; este gatilho é a segunda tranca, e vale
-- para TODOS — inclusive a chave de serviço: link é registro de algo que saiu
-- da loja, e prazo esticado depois de mandado, ou link revogado que volta a
-- abrir, desmentiria o que o consultor disse ao titular.
create or replace function public.relatorios_compartilhados_so_revogar()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if    new.id              is distinct from old.id
     or new.org_id          is distinct from old.org_id
     or new.consulta_id     is distinct from old.consulta_id
     or new.token_hash      is distinct from old.token_hash
     or new.expira_em       is distinct from old.expira_em
     or new.criado_por      is distinct from old.criado_por
     or new.criado_por_nome is distinct from old.criado_por_nome
     or new.criado_em       is distinct from old.criado_em then
    raise exception 'O link compartilhado não se edita: só se revoga (e o prazo não muda).'
      using errcode = 'insufficient_privilege';
  end if;

  if new.acessos < old.acessos then
    raise exception 'O contador de acessos do link só cresce.'
      using errcode = 'insufficient_privilege';
  end if;

  if old.revogado_em is not null then
    if new.revogado_em is distinct from old.revogado_em
       or new.revogado_por is distinct from old.revogado_por then
      raise exception 'Link revogado não volta nem é revogado de novo.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.revogado_em is not null and auth.uid() is not null then
    -- A revogação, com sessão: quem e quando são da sessão.
    new.revogado_em  := now();
    new.revogado_por := auth.uid();
  end if;

  return new;
end;
$$;

comment on function public.relatorios_compartilhados_so_revogar() is
  'Gatilho de relatorios_compartilhados: o link só muda para ser revogado '
  '(uma vez, para sempre; com sessão, quem e quando são da sessão) ou para '
  'contar acesso (só cresce). Qualquer outra coluna recusa (42501), para todos.';

drop trigger if exists relatorios_compartilhados_so_revogar on public.relatorios_compartilhados;
create trigger relatorios_compartilhados_so_revogar
  before update on public.relatorios_compartilhados
  for each row execute function public.relatorios_compartilhados_so_revogar();

revoke all on function public.relatorios_compartilhados_so_revogar() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6. Privilégio e RLS
-- ----------------------------------------------------------------------------
-- Na consulta, `authenticated` só LÊ: a gravação é do servidor, pela função
-- da seção 7, depois de chamar o fornecedor. Nem a service_role insere
-- direto — a função é a única porta, e é ela que confere o papel de quem
-- consultou e carimba org, nome e hora. Sem INSERT, tentar direto é 42501,
-- não "0 linhas" calado.
revoke all on public.consultas_de_documento from public, anon, authenticated;
grant select on public.consultas_de_documento to authenticated;
revoke insert on public.consultas_de_documento from service_role;
grant select, update, delete, truncate, references, trigger
  on public.consultas_de_documento to service_role;

-- No link, `authenticated` LÊ por coluna — todas menos `token_hash` —,
-- INSERE (é o único gesto que toca o hash: o servidor manda consulta_id,
-- token_hash e expira_em pela sessão) e atualiza DUAS colunas: mexer em
-- `expira_em` ou `acessos` é 42501 antes de qualquer policy. Ler o hash
-- (inclusive por `select *` ou `returning *`) é 42501.
revoke all on public.relatorios_compartilhados from public, anon, authenticated;
grant select (id, org_id, consulta_id, expira_em, revogado_em, revogado_por,
              acessos, ultimo_acesso_em, criado_por, criado_por_nome, criado_em)
  on public.relatorios_compartilhados to authenticated;
grant insert on public.relatorios_compartilhados to authenticated;
grant update (revogado_em, revogado_por) on public.relatorios_compartilhados to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.relatorios_compartilhados to service_role;

alter table public.consultas_de_documento    enable row level security;
alter table public.relatorios_compartilhados enable row level security;

drop policy if exists consultas_de_documento_leitura     on public.consultas_de_documento;
drop policy if exists consultas_de_documento_inclusao    on public.consultas_de_documento;
drop policy if exists relatorios_compartilhados_leitura  on public.relatorios_compartilhados;
drop policy if exists relatorios_compartilhados_inclusao on public.relatorios_compartilhados;
drop policy if exists relatorios_compartilhados_revogacao on public.relatorios_compartilhados;

-- A linha NOVA da matriz, "Consultar CPF e CNPJ (consulta paga)":
-- Administrador, Gestor, Comercial e Financeiro. NÃO Marketing, NÃO SDR.
-- A expressão se repete nas policies de propósito (é o padrão das irmãs):
-- cada policy se lê sozinha.
create policy consultas_de_documento_leitura on public.consultas_de_documento
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial')
         or public.tem_papel(auth.uid(), 'financeiro'))
  );

comment on policy consultas_de_documento_leitura on public.consultas_de_documento is
  'Lê as consultas de CPF/CNPJ quem a matriz deixa consultar: Administrador, Gestor, Comercial e Financeiro, com conta ativa. '
  'Não há policy de INSERT, UPDATE nem DELETE: a única escrita é registrar_consulta_de_documento() (service_role).';

create policy relatorios_compartilhados_leitura on public.relatorios_compartilhados
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial')
         or public.tem_papel(auth.uid(), 'financeiro'))
  );

-- A FK confere a consulta como dono da tabela, sem RLS: o `exists` é o que
-- exige que quem gera o link ENXERGUE a consulta (e da mesma org). As colunas
-- de fora são qualificadas — sem isso, `org_id` dentro do subselect seria o
-- da consulta, e a comparação viraria `c.org_id = c.org_id`.
create policy relatorios_compartilhados_inclusao on public.relatorios_compartilhados
  for insert to authenticated
  with check (
    org_id = public.org_padrao()
    and criado_por = auth.uid()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial')
         or public.tem_papel(auth.uid(), 'financeiro'))
    and exists (select 1 from public.consultas_de_documento c
                 where c.id = relatorios_compartilhados.consulta_id
                   and c.org_id = relatorios_compartilhados.org_id)
  );

-- UPDATE só para revogar: a linha nova tem de sair revogada, por quem está na
-- sessão. "Desrevogar" e revogar de novo o gatilho recusa antes (42501).
create policy relatorios_compartilhados_revogacao on public.relatorios_compartilhados
  for update to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial')
         or public.tem_papel(auth.uid(), 'financeiro'))
  )
  with check (
    org_id = public.org_padrao()
    and revogado_em is not null
    and revogado_por = auth.uid()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial')
         or public.tem_papel(auth.uid(), 'financeiro'))
  );

comment on policy relatorios_compartilhados_leitura on public.relatorios_compartilhados is
  'Lê os links quem a matriz deixa consultar CPF/CNPJ: Administrador, Gestor, Comercial e Financeiro, com conta ativa. '
  'O privilégio de coluna tira token_hash da leitura.';
comment on policy relatorios_compartilhados_inclusao on public.relatorios_compartilhados is
  'Gera link quem a matriz deixa consultar, em nome próprio, e só para consulta que enxerga e da mesma org.';
comment on policy relatorios_compartilhados_revogacao on public.relatorios_compartilhados is
  'Atualiza só para revogar: a linha sai com revogado_em preenchido e revogado_por = auth.uid(). '
  'O privilégio de coluna limita a revogado_em/revogado_por, e o gatilho '
  'relatorios_compartilhados_so_revogar recusa desrevogar. Não há policy de DELETE.';


-- ----------------------------------------------------------------------------
-- 7. A porta de escrita da consulta: o servidor, depois do fornecedor
-- ----------------------------------------------------------------------------
-- O servidor chama o fornecedor e, dando certo, pela metade ou errado,
-- registra a tentativa aqui com a chave de serviço. Quem consultou vem em
-- `p_criado_por` (o usuário da sessão do painel, que a rota já conferiu); a
-- função confere DE NOVO que ele tem um dos quatro papéis com conta ativa
-- (`tem_papel`) — a chave de serviço não vira atalho para um marketing
-- consultar — e carimba org, nome e hora da mesma fonte que o carimbo de
-- sessão usava: org_padrao() e profiles.full_name (o que autor_atual() lê
-- para auth.uid()). A sessão em si (auth.uid()) não entra: com a chave de
-- serviço ela não existe, e se existisse não seria de quem consultou.
--
-- Não confere repetição (minutos_contra_repeticao): quando o servidor chega
-- aqui o fornecedor já foi chamado e pode ter cobrado — recusar agora
-- perderia o registro de uma consulta que aconteceu. A repetição se barra
-- ANTES da chamada, no servidor.
--
-- `search_path = ''` e tudo qualificado, como a porta pública.
create or replace function public.registrar_consulta_de_documento(
  p_criado_por      uuid,
  p_tipo_documento  text,
  p_documento       text,
  p_nivel           text,
  p_produtos        text[],
  p_nome            text,
  p_relatorio       jsonb,
  p_respostas       jsonb,
  p_tentativas      jsonb,
  p_situacao        text,
  p_custo           numeric,
  p_homologacao     boolean,
  p_finalidade      text,
  p_titular_ciente  boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_nome  text;
  v_id    uuid;
begin
  if p_criado_por is null
     or not (   public.tem_papel(p_criado_por, 'admin')
             or public.tem_papel(p_criado_por, 'gestor')
             or public.tem_papel(p_criado_por, 'comercial')
             or public.tem_papel(p_criado_por, 'financeiro')) then
    raise exception 'Só Administrador, Gestor, Comercial ou Financeiro, com conta ativa, consultam CPF e CNPJ '
                    '(matriz, "Consultar CPF e CNPJ (consulta paga)").'
      using errcode = '42501';
  end if;

  select nullif(trim(p.full_name), '')
    into v_nome
    from public.profiles p
   where p.id = p_criado_por;

  insert into public.consultas_de_documento
    (org_id, tipo_documento, documento, nivel, produtos, nome, relatorio, respostas,
     tentativas, situacao, custo, homologacao, finalidade, titular_ciente,
     criado_por, criado_por_nome, criado_em)
  values
    (public.org_padrao(), p_tipo_documento, p_documento, p_nivel, p_produtos, p_nome,
     p_relatorio, p_respostas, p_tentativas, p_situacao, p_custo, p_homologacao,
     p_finalidade, p_titular_ciente, p_criado_por, v_nome, pg_catalog.now())
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.registrar_consulta_de_documento(
  uuid, text, text, text, text[], text, jsonb, jsonb, jsonb, text, numeric, boolean, text, boolean) is
  'Única escrita de consultas_de_documento, só para a service_role (o servidor, depois '
  'de chamar a APIBrasil). Confere que p_criado_por tem papel admin, gestor, comercial ou '
  'financeiro com conta ativa (senão 42501), carimba org (org_padrao()), nome '
  '(profiles.full_name) e hora (now()), insere e devolve o id. As regras da tabela '
  'decidem o resto (documento, nível, situação × tentativas, ciência do titular).';

revoke all on function public.registrar_consulta_de_documento(
  uuid, text, text, text, text[], text, jsonb, jsonb, jsonb, text, numeric, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.registrar_consulta_de_documento(
  uuid, text, text, text, text[], text, jsonb, jsonb, jsonb, text, numeric, boolean, text, boolean)
  to service_role;


-- ----------------------------------------------------------------------------
-- 8. A porta da página pública
-- ----------------------------------------------------------------------------
-- A página do link não tem sessão: `anon` não lê nenhuma das duas tabelas, e
-- esta função é a única coisa que ela pode chamar. Recebe o TOKEN cru da URL
-- e calcula o sha256 aqui dentro (o mesmo do app: sha256 hex do token em
-- UTF-8, `createHash('sha256').update(token).digest('hex')`). Receber o hash
-- faria do hash a chave: quem vazasse a tabela abriria todos os links. Token
-- sem a forma de um token nosso (43 caracteres base64url, 32 bytes) nem é
-- procurado. Só abre link que existe, não está revogado e não expirou —
-- contando o acesso no mesmo comando, para que não exista abertura sem
-- contagem. Link ruim de qualquer jeito devolve ZERO linhas, sem dizer qual
-- foi: a página não distingue "expirou" de "nunca existiu" para quem tenta
-- adivinhar.
--
-- `search_path = ''` e tudo qualificado: numa SECURITY DEFINER que `anon`
-- executa, nem `public` nem `pg_temp` decidem o que um nome quer dizer.
--
-- A versão anterior deste arquivo recebia `p_token_hash`; o Postgres não deixa
-- `create or replace` trocar o nome do argumento, então ela sai antes — só
-- ela (a de `p_token`, numa reaplicação, fica).
do $troca_da_porta$
begin
  if exists (select 1 from pg_proc
              where oid = to_regprocedure('public.abrir_relatorio_compartilhado(text)')
                and proargnames[1] = 'p_token_hash') then
    drop function public.abrir_relatorio_compartilhado(text);
  end if;
end $troca_da_porta$;

create or replace function public.abrir_relatorio_compartilhado(p_token text)
  returns table (
    relatorio       jsonb,
    tipo_documento  text,
    nivel           text,
    criado_em       timestamptz,
    expira_em       timestamptz
  )
  language sql
  volatile
  security definer
  set search_path = ''
as $$
  with aberto as (
    update public.relatorios_compartilhados r
       set acessos          = r.acessos + 1,
           ultimo_acesso_em = pg_catalog.now()
     where p_token ~ '^[A-Za-z0-9_-]{43}$'
       and r.token_hash = pg_catalog.encode(
                            pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex')
       and r.revogado_em is null
       and r.expira_em > pg_catalog.now()
    returning r.consulta_id, r.org_id, r.expira_em
  )
  select c.relatorio, c.tipo_documento, c.nivel, c.criado_em, a.expira_em
    from aberto a
    join public.consultas_de_documento c
      on c.id = a.consulta_id
     and c.org_id = a.org_id;
$$;

comment on function public.abrir_relatorio_compartilhado(text) is
  'A página pública do link (sem sessão): recebe o TOKEN da URL (43 caracteres '
  'base64url; outra forma devolve vazio), calcula o sha256 hex do token em UTF-8 '
  'e procura por token_hash. Devolve relatório, tipo de documento, nível e data '
  'da consulta, e até quando o link vale — só se o link existir, não estiver '
  'revogado nem expirado; conta o acesso no mesmo comando. Senão, zero linhas. '
  'O hash não abre. SECURITY DEFINER, search_path vazio.';

revoke all on function public.abrir_relatorio_compartilhado(text) from public;
grant execute on function public.abrir_relatorio_compartilhado(text) to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 9. Os parâmetros da consulta: número de negócio é dado, com vigência
-- ----------------------------------------------------------------------------
-- No padrão de `parametros_financiamento` (20260928120000): uma vigente por
-- org, valor vigente nunca sofre UPDATE (D-T1.7, `nucleo_so_encerra_vigencia`)
-- e a única escrita é uma função que encerra a vigente e abre a nova na mesma
-- transação. Os quatro papéis da ação leem (a tela precisa: prazo do link,
-- aviso de consulta recente, trava contra repetição, limite de links, preço
-- estimado antes de pagar); só o Administrador abre vigência.
--
-- O que cada coluna é:
--   * dias_do_link: prazo de um link novo. 1 a 30 — o teto de 30 é o mesmo
--     de relatorios_compartilhados_prazo_valido (720 h), que continua lá.
--   * dias_de_consulta_recente: até quantos dias uma consulta do mesmo
--     documento é oferecida para reabrir em vez de pagar de novo. 1 a 365.
--   * minutos_contra_repeticao: a mesma consulta (documento e nível) não é
--     paga de novo dentro desta janela. 0 desliga. Até 1440 (um dia).
--   * links_ativos_por_consulta: quantos links vivos uma consulta pode ter
--     ao mesmo tempo. 1 a 50.
--   * precos_de_referencia: o preço de tabela de cada produto, em reais
--     ({"cpf-lite": 0.12, …}), para a tela estimar o custo antes de pagar. É
--     REFERÊNCIA, não o cobrado — o cobrado vai em consultas_de_documento.custo.
--   * tabela_de_precos_em e fonte: de quando e de onde os preços saíram —
--     preço novo com data velha seria a tela mentindo.
--
-- A régua dos preços, em função pelo mesmo motivo das tentativas.
create or replace function public.consulta_documento_precos_validos(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(
    case when pg_catalog.jsonb_typeof(p) = 'object' then
          exists (select 1 from pg_catalog.jsonb_each(p))
      and not exists (
            select 1
              from pg_catalog.jsonb_each(p) as e(produto, preco)
             where not (e.produto ~ '^[a-z0-9_-]+$')
                or case pg_catalog.jsonb_typeof(e.preco)
                     when 'number' then (e.preco)::numeric < 0
                     else true
                   end)
    else false end,
    false)
$fn$;

comment on function public.consulta_documento_precos_validos(jsonb) is
  'Régua de parametros_consulta_documento.precos_de_referencia (CHECK '
  'parametros_consulta_documento_precos_validos): objeto não vazio, cada chave um '
  'produto [a-z0-9_-], cada valor um número >= 0. IMMUTABLE.';

create table if not exists public.parametros_consulta_documento (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null default public.org_padrao(),
  dias_do_link                smallint not null,
  dias_de_consulta_recente    smallint not null,
  minutos_contra_repeticao    smallint not null,
  links_ativos_por_consulta   smallint not null,
  precos_de_referencia        jsonb not null,
  tabela_de_precos_em         date not null,
  fonte                       text not null,
  descricao                   text,
  criado_por                  uuid,
  vigencia_desde              date not null default current_date,
  vigencia_ate                date,
  criado_em                   timestamptz not null default now(),

  constraint parametros_consulta_documento_dias_do_link_na_faixa
    check (dias_do_link between 1 and 30),
  constraint parametros_consulta_documento_dias_de_consulta_recente_na_faixa
    check (dias_de_consulta_recente between 1 and 365),
  constraint parametros_consulta_documento_minutos_contra_repeticao_na_faixa
    check (minutos_contra_repeticao between 0 and 1440),
  constraint parametros_consulta_documento_links_ativos_na_faixa
    check (links_ativos_por_consulta between 1 and 50),
  constraint parametros_consulta_documento_precos_validos
    check (public.consulta_documento_precos_validos(precos_de_referencia)),
  constraint parametros_consulta_documento_fonte_preenchida
    check (char_length(btrim(fonte, E' \t\r\n')) between 1 and 200),
  constraint parametros_consulta_documento_vigencia_em_ordem
    check (vigencia_ate is null or vigencia_ate >= vigencia_desde)
);

-- D-T1.7: a linha vigente só aceita o encerramento da vigência.
create or replace trigger parametros_consulta_documento_vigencia
  before update on public.parametros_consulta_documento
  for each row execute function public.nucleo_so_encerra_vigencia();

-- Uma vigente por org: dois prazos de link ao mesmo tempo, a tela escolheria um.
create unique index if not exists parametros_consulta_documento_um_vigente
  on public.parametros_consulta_documento (org_id)
  where vigencia_ate is null;

alter table public.parametros_consulta_documento enable row level security;

drop policy if exists parametros_consulta_documento_leitura on public.parametros_consulta_documento;
create policy parametros_consulta_documento_leitura on public.parametros_consulta_documento
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial')
         or public.tem_papel(auth.uid(), 'financeiro'))
  );

comment on policy parametros_consulta_documento_leitura on public.parametros_consulta_documento is
  'Lê os parâmetros da consulta de CPF/CNPJ quem a matriz deixa consultar: Administrador, Gestor, '
  'Comercial e Financeiro, com conta ativa. Nenhuma policy de escrita: a única escrita é '
  'consulta_documento_nova_vigencia(), só admin.';

-- O default ACL do Supabase concede tudo a anon/authenticated/service_role
-- por baixo do pano (f0l); o que não se quer, sai por nome.
revoke all on public.parametros_consulta_documento from public, anon;
revoke insert, update, delete, truncate on public.parametros_consulta_documento from authenticated;
grant select on public.parametros_consulta_documento to authenticated, service_role;

create or replace function public.consulta_documento_nova_vigencia(
  p_dias_do_link               integer,
  p_dias_de_consulta_recente   integer,
  p_minutos_contra_repeticao   integer,
  p_links_ativos_por_consulta  integer,
  p_precos_de_referencia       jsonb,
  p_tabela_de_precos_em        date,
  p_fonte                      text,
  p_descricao                  text default null
)
returns public.parametros_consulta_documento
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem     uuid := auth.uid();
  v_vigente  uuid;
  v_nova     public.parametros_consulta_documento;
begin
  if v_quem is null then
    raise exception 'Nova vigência dos parâmetros da consulta de CPF e CNPJ sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;

  if not public.tem_papel(v_quem, 'admin') then
    raise exception 'Só o Administrador muda os parâmetros da consulta de CPF e CNPJ.'
      using errcode = '42501';
  end if;

  -- Trava a vigente: duas edições ao mesmo tempo não abrem duas vigências —
  -- a segunda espera, não acha mais vigente aberta, e o índice único a recusa.
  select id into v_vigente
    from public.parametros_consulta_documento
   where org_id = public.org_padrao()
     and vigencia_ate is null
   for update;

  if found then
    update public.parametros_consulta_documento
       set vigencia_ate = current_date
     where id = v_vigente;
  end if;

  insert into public.parametros_consulta_documento
    (dias_do_link, dias_de_consulta_recente, minutos_contra_repeticao,
     links_ativos_por_consulta, precos_de_referencia, tabela_de_precos_em,
     fonte, descricao, criado_por, vigencia_desde)
  values
    (p_dias_do_link, p_dias_de_consulta_recente, p_minutos_contra_repeticao,
     p_links_ativos_por_consulta, p_precos_de_referencia, p_tabela_de_precos_em,
     btrim(p_fonte, E' \t\r\n'),
     nullif(btrim(p_descricao, E' \t\r\n'), ''),
     v_quem, current_date)
  returning * into v_nova;

  return v_nova;
end;
$fn$;

revoke all on function public.consulta_documento_nova_vigencia(
  integer, integer, integer, integer, jsonb, date, text, text) from public, anon;
grant execute on function public.consulta_documento_nova_vigencia(
  integer, integer, integer, integer, jsonb, date, text, text) to authenticated, service_role;

comment on table public.parametros_consulta_documento is
  'Os números da consulta de CPF e CNPJ como DADO com vigência (2026-10-18): prazo do '
  'link, janela de consulta recente, minutos contra repetição, links ativos por consulta '
  'e preços de referência por produto da APIBrasil (com data e fonte da tabela). Uma '
  'vigente por org (parametros_consulta_documento_um_vigente); valor vigente não sofre '
  'UPDATE (D-T1.7) — a única escrita é consulta_documento_nova_vigencia, só admin, que '
  'encerra a vigente e insere a nova. Leem admin, gestor, comercial e financeiro; anon nada.';
comment on column public.parametros_consulta_documento.dias_do_link is
  'Prazo de um link novo, em dias (1 a 30). O banco ainda recusa link de mais de 720 h.';
comment on column public.parametros_consulta_documento.dias_de_consulta_recente is
  'Até quantos dias uma consulta do mesmo documento é oferecida para reabrir em vez de pagar de novo (1 a 365).';
comment on column public.parametros_consulta_documento.minutos_contra_repeticao is
  'Janela, em minutos, em que a mesma consulta não é paga de novo (0 desliga; até 1440). '
  'Conferida pelo servidor ANTES de chamar o fornecedor.';
comment on column public.parametros_consulta_documento.links_ativos_por_consulta is
  'Quantos links vivos (nem revogados nem expirados) uma consulta pode ter ao mesmo tempo (1 a 50).';
comment on column public.parametros_consulta_documento.precos_de_referencia is
  'Preço de tabela de cada produto da APIBrasil, em reais, por identificador '
  '({"cpf-lite": 0.12, …}). Referência para estimar antes de pagar — o cobrado é '
  'consultas_de_documento.custo.';
comment on column public.parametros_consulta_documento.tabela_de_precos_em is
  'A data da tabela de preços de onde os valores saíram.';
comment on column public.parametros_consulta_documento.fonte is
  'De onde os preços saíram (1 a 200 caracteres aparada).';
comment on column public.parametros_consulta_documento.descricao is
  'Nota livre de quem abriu a vigência: o que mudou e por quê.';
comment on column public.parametros_consulta_documento.criado_por is
  'Quem abriu a vigência: auth.uid() carimbado pela função. Nulo só na semente. Sem FK '
  'de propósito: on delete set null seria UPDATE, que o guarda D-T1.7 recusa.';
comment on function public.consulta_documento_nova_vigencia(
  integer, integer, integer, integer, jsonb, date, text, text) is
  'Única escrita de parametros_consulta_documento. Exige sessão (auth.uid()) e papel '
  'admin — senão 42501. Trava a vigente, encerra com vigencia_ate = hoje e insere a nova '
  'com vigencia_desde = hoje e criado_por = auth.uid(), na mesma transação. Devolve a linha nova.';

-- A semente — só se a org padrão ainda não tiver linha. Os preços são os da
-- tabela pública da APIBrasil em 2026-10-18, pelo identificador do produto.
insert into public.parametros_consulta_documento
  (dias_do_link, dias_de_consulta_recente, minutos_contra_repeticao,
   links_ativos_por_consulta, precos_de_referencia, tabela_de_precos_em, fonte, descricao)
select
  7, 90, 30, 10,
  '{"cpf-lite": 0.12, "receita-federal": 0.34, "cpf-dados": 4.5,
    "analise-credito-plus-pf": 29.02, "acerta-essencial-positivo": 4.49,
    "cnpj": 0.04, "cnpj-cadastral": 0.55, "cadastral-premium-pj": 3.75,
    "receita-federal-pj-v3": 6.35, "analise-credito-basic-pj": 10.06,
    "dossie-credito-pj": 4.4, "cadastral-score-pj": 1.3}'::jsonb,
  date '2026-10-18',
  'Tabela pública da APIBrasil',
  'Seed de 2026-10-18 (revisão do qa-guardian): link de 7 dias, consulta recente de 90, '
  '30 minutos contra repetição, 10 links ativos por consulta, preços da tabela pública da APIBrasil.'
where not exists (select 1 from public.parametros_consulta_documento
                   where org_id = public.org_padrao());


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. O efeito cria usuários de sonda (admin,
-- gestor, comercial, financeiro, marketing, sdr, um financeiro desativado),
-- veste a sessão de cada um e tenta ler, incluir direto, registrar pela
-- função como service_role, editar, apagar, gerar e revogar link, ler o hash,
-- esticar prazo, desrevogar, abrir link pela porta pública como anon (com o
-- token, com o hash e com lixo), mexer nos parâmetros, e violar cada regra —
-- num sub-bloco que termina com um sentinela, e o rollback do sub-bloco leva
-- tudo junto. As variáveis sobrevivem ao rollback, e é por elas que o
-- veredito sai.
do $aceite$
declare
  falhas          int := 0;
  v_nome          text;
  v_uid           uuid;
  v_papel         text;
  v_ids           jsonb := '{}'::jsonb;
  v_cli           uuid := gen_random_uuid();   -- authenticated sem perfil: cliente
  v_linha         public.consultas_de_documento;
  v_link          public.relatorios_compartilhados;
  v_consulta      uuid;
  v_valido        uuid;
  v_revogavel     uuid;
  v_id            uuid;
  v_relatorio     jsonb := '{"titular": {"nome": "ACEITE DOCUMENTO"}, "restricoes": []}'::jsonb;
  v_respostas     jsonb := '{"cpf-lite": {"MIOLO_ACEITE": "renda 9999"}}'::jsonb;
  v_produtos      text[];
  v_tentativas    jsonb;
  v_situacao      text;
  v_porta         jsonb;
  v_miolo_lido    int := 0;      -- os quatro papéis leem o miolo
  -- Tokens com a forma dos do app (43 caracteres base64url) e o hash de cada um.
  t_valido        text := rpad('AceiteDocumentoValido', 43, 'x');
  t_revogado      text := rpad('AceiteDocumentoRevogado', 43, 'x');
  t_expirado      text := rpad('AceiteDocumentoExpirado', 43, 'x');
  t_forjado       text := rpad('AceiteDocumentoForjado', 43, 'x');
  t_inexistente   text := rpad('AceiteDocumentoNunca', 43, 'x');
  h_valido        text := encode(sha256(convert_to(rpad('AceiteDocumentoValido', 43, 'x'), 'UTF8')), 'hex');
  h_revogado      text := encode(sha256(convert_to(rpad('AceiteDocumentoRevogado', 43, 'x'), 'UTF8')), 'hex');
  h_expirado      text := encode(sha256(convert_to(rpad('AceiteDocumentoExpirado', 43, 'x'), 'UTF8')), 'hex');
  h_forjado       text := encode(sha256(convert_to(rpad('AceiteDocumentoForjado', 43, 'x'), 'UTF8')), 'hex');
  v_antes_c       bigint;
  v_antes_l       bigint;
  v_antes_p       bigint;
  v_depois_c      bigint;
  v_depois_l      bigint;
  v_depois_p      bigint;
  v_restou        bigint;
  v_n             bigint;
  v_diretos_neg   int := 0;      -- admin, gestor, comercial, financeiro: insert direto negado
  v_registraram   int := 0;      -- os quatro, pela função, como service_role
  v_autor_certo   int := 0;
  v_leram         int := 0;
  v_leituras      text := '';
  v_sessao_alheia text := 'não testado';
  v_reg_negados   int := 0;      -- marketing, sdr, desativado, cliente, nulo: 42501 pela função
  v_reg_msg       int := 0;      -- … citando a linha da matriz
  v_reg_auth      text := 'não testado';
  v_reg_anon      text := 'não testado';
  v_srv_direto    text := 'não testado';
  v_negados       int := 0;      -- marketing, sdr, desativado, cliente: inclusão direta
  v_cegos         int := 0;      -- …: leitura vazia
  v_links_negados int := 0;      -- marketing, sdr: geram link
  v_links_cegos   int := 0;      -- marketing, sdr: leem link
  v_anon          text := 'não testado';
  v_anon_inclui   text := 'não testado';
  v_anon_link     text := 'não testado';
  v_edita         text := 'não testado';
  v_apaga         text := 'não testado';
  v_sem_ciencia   text := 'não testado';
  v_link_forjado  text := 'não testado';
  v_link_alheio   text := 'não testado';
  v_le_hash       text := 'não testado';
  v_le_estrela    text := 'não testado';
  v_le_colunas    text := 'não testado';
  v_revoga        text := 'não testado';
  v_estica        text := 'não testado';
  v_conta         text := 'não testado';
  v_desrevoga     text := 'não testado';
  v_rerrevoga     text := 'não testado';
  v_srv_desrevoga text := 'não testado';
  v_srv_estica    text := 'não testado';
  v_apaga_link    text := 'não testado';
  v_abre          text := 'não testado';
  v_abre_conta    text := 'não testado';
  v_abre_sdr      text := 'não testado';
  v_fechados      int := 0;      -- revogado, expirado, inexistente, o hash, forma errada, nulo
  v_sem_contar    text := 'não testado';
  v_regras        int := 0;
  v_certas        int := 0;
  v_caso          record;
  v_msg           text;
  -- os parâmetros
  v_seed          public.parametros_consulta_documento;
  v_vig           public.parametros_consulta_documento;
  v_nova          public.parametros_consulta_documento;
  v_base          jsonb;
  v_param_leram   int := 0;      -- os quatro leem a vigente
  v_param_cegos   int := 0;      -- marketing, sdr, cliente: 0 linhas
  v_param_anon    text := 'não testado';
  v_param_recus   int := 0;      -- gestor, comercial, financeiro: 42501 pela função
  v_param_sem_ses text := 'não testado';
  v_param_direto  text := 'não testado';
  v_param_update  text := 'não testado';
  v_param_admin   text := 'não testado';
  v_param_segunda text := 'não testado';
  v_param_edita   text := 'não testado';
  v_param_casos   int := 0;
  v_param_certos  int := 0;
  v_param_limites int := 0;
  v_param_aceitos int := 0;
  v_assinatura_reg constant text :=
    'public.registrar_consulta_de_documento(uuid, text, text, text, text[], text, jsonb, jsonb, jsonb, text, numeric, boolean, text, boolean)';
  v_assinatura_par constant text :=
    'public.consulta_documento_nova_vigencia(integer, integer, integer, integer, jsonb, date, text, text)';
begin
  if current_user in ('authenticated', 'anon', 'service_role') then
    raise exception 'ACEITE INCONCLUSIVO: a migração roda como papel de API (%)', current_user;
  end if;

  -- 1 · As tabelas, com RLS e comentário.
  foreach v_nome in array array['public.consultas_de_documento', 'public.relatorios_compartilhados',
                                'public.parametros_consulta_documento'] loop
    if not exists (select 1 from pg_class where oid = v_nome::regclass and relrowsecurity) then
      raise exception 'ACEITE FALHOU: % sem RLS', v_nome;
    end if;
    if obj_description(v_nome::regclass, 'pg_class') is null then
      falhas := falhas + 1;
      raise warning 'FALHOU: % sem comentário', v_nome;
    end if;
  end loop;

  -- As colunas novas da consulta: tipo, nulidade e padrão.
  if (select format_type(atttypid, atttypmod) || ':' || attnotnull from pg_attribute
       where attrelid = 'public.consultas_de_documento'::regclass and attname = 'situacao' and not attisdropped)
       is distinct from 'text:true'
     or (select format_type(atttypid, atttypmod) || ':' || attnotnull from pg_attribute
          where attrelid = 'public.consultas_de_documento'::regclass and attname = 'tentativas' and not attisdropped)
       is distinct from 'jsonb:true'
     or pg_get_expr((select adbin from pg_attrdef d join pg_attribute a
                       on a.attrelid = d.adrelid and a.attnum = d.adnum
                      where d.adrelid = 'public.consultas_de_documento'::regclass and a.attname = 'tentativas'),
                    'public.consultas_de_documento'::regclass) is distinct from '''[]''::jsonb'
     or (select attnotnull from pg_attribute
          where attrelid = 'public.consultas_de_documento'::regclass and attname = 'custo')
     or not (select attnotnull from pg_attribute
              where attrelid = 'public.consultas_de_documento'::regclass and attname = 'relatorio') then
    falhas := falhas + 1;
    raise warning 'FALHOU: situacao (text not null), tentativas (jsonb not null default []), custo nulável ou relatorio not null fora do prometido';
  end if;

  -- 2 · As regras existem com nome, com o tipo certo e validadas.
  foreach v_nome in array array[
    'consultas_de_documento_tipo_valido',
    'consultas_de_documento_documento_valido',
    'consultas_de_documento_nivel_valido',
    'consultas_de_documento_score_so_cnpj',
    'consultas_de_documento_produtos_validos',
    'consultas_de_documento_nome_valido',
    'consultas_de_documento_relatorio_e_objeto',
    'consultas_de_documento_respostas_e_objeto',
    'consultas_de_documento_custo_valido',
    'consultas_de_documento_finalidade_valida',
    'consultas_de_documento_titular_ciente',
    'consultas_de_documento_situacao_valida',
    'consultas_de_documento_tentativas_validas',
    'consultas_de_documento_situacao_coerente'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.consultas_de_documento'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;
  foreach v_nome in array array[
    'relatorios_compartilhados_token_e_sha256',
    'relatorios_compartilhados_prazo_valido',
    'relatorios_compartilhados_revogacao_coerente',
    'relatorios_compartilhados_acessos_coerentes'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.relatorios_compartilhados'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;
  foreach v_nome in array array[
    'parametros_consulta_documento_dias_do_link_na_faixa',
    'parametros_consulta_documento_dias_de_consulta_recente_na_faixa',
    'parametros_consulta_documento_minutos_contra_repeticao_na_faixa',
    'parametros_consulta_documento_links_ativos_na_faixa',
    'parametros_consulta_documento_precos_validos',
    'parametros_consulta_documento_fonte_preenchida',
    'parametros_consulta_documento_vigencia_em_ordem'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.parametros_consulta_documento'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.relatorios_compartilhados'::regclass
                    and conname = 'relatorios_compartilhados_token_unico' and contype = 'u')
     or not exists (select 1 from pg_constraint
                     where conrelid = 'public.relatorios_compartilhados'::regclass
                       and contype = 'f' and confrelid = 'public.consultas_de_documento'::regclass
                       and confdeltype = 'c') then
    falhas := falhas + 1;
    raise warning 'FALHOU: token único ou FK com cascade para consultas_de_documento ausente';
  end if;

  -- As três réguas: IMMUTABLE, search_path fixo.
  foreach v_nome in array array['public.consulta_documento_tentativas_validas(jsonb, text[])',
                                'public.consulta_documento_situacao_coerente(text, jsonb)',
                                'public.consulta_documento_precos_validos(jsonb)'] loop
    if not exists (select 1 from pg_proc
                    where oid = to_regprocedure(v_nome)
                      and provolatile = 'i'
                      and proconfig @> array['search_path=""']) then
      falhas := falhas + 1;
      raise warning 'FALHOU: régua % ausente ou não é IMMUTABLE com search_path vazio', v_nome;
    end if;
  end loop;

  -- 3 · Os índices.
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'consultas_de_documento_recentes_idx'
                    and indexdef like '%(org_id, criado_em DESC)%')
     or not exists (select 1 from pg_indexes
                     where schemaname = 'public' and indexname = 'consultas_de_documento_documento_idx'
                       and indexdef like '%(org_id, tipo_documento, documento, criado_em DESC)%')
     or not exists (select 1 from pg_indexes
                     where schemaname = 'public' and indexname = 'consultas_de_documento_nome_idx'
                       and indexdef like '%lower(nome) text_pattern_ops%')
     or not exists (select 1 from pg_indexes
                     where schemaname = 'public' and indexname = 'relatorios_compartilhados_consulta_idx') then
    falhas := falhas + 1;
    raise warning 'FALHOU: índices de recentes, documento, nome ou consulta do link ausentes ou com outra forma';
  end if;
  if not exists (select 1 from pg_index i
                  where i.indexrelid = to_regclass('public.parametros_consulta_documento_um_vigente')
                    and i.indisunique
                    and pg_get_indexdef(i.indexrelid) like '%(org_id)%'
                    and pg_get_expr(i.indpred, i.indrelid) = '(vigencia_ate IS NULL)') then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_consulta_documento_um_vigente não é único em (org_id) where vigencia_ate is null';
  end if;

  -- 4 · Privilégio.
  if has_table_privilege('anon', 'public.consultas_de_documento', 'SELECT')
     or has_table_privilege('anon', 'public.consultas_de_documento', 'INSERT')
     or has_any_column_privilege('anon', 'public.relatorios_compartilhados', 'SELECT')
     or has_table_privilege('anon', 'public.relatorios_compartilhados', 'INSERT')
     or has_any_column_privilege('anon', 'public.relatorios_compartilhados', 'UPDATE')
     or has_any_column_privilege('anon', 'public.parametros_consulta_documento', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon tem privilégio numa das três tabelas';
  end if;
  if not has_table_privilege('authenticated', 'public.consultas_de_documento', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.consultas_de_documento', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.consultas_de_documento', 'UPDATE')
     or has_table_privilege('authenticated', 'public.consultas_de_documento', 'DELETE')
     or has_table_privilege('authenticated', 'public.consultas_de_documento', 'TRUNCATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: na consulta, authenticated deveria ter SELECT e só ele';
  end if;
  if has_any_column_privilege('service_role', 'public.consultas_de_documento', 'INSERT')
     or not has_table_privilege('service_role', 'public.consultas_de_documento', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: na consulta, service_role deveria ler e só inserir pela função';
  end if;
  if has_table_privilege('authenticated', 'public.relatorios_compartilhados', 'SELECT')
     or has_column_privilege('authenticated', 'public.relatorios_compartilhados', 'token_hash', 'SELECT')
     or exists (select 1 from unnest(array['id', 'org_id', 'consulta_id', 'expira_em', 'revogado_em',
                                           'revogado_por', 'acessos', 'ultimo_acesso_em', 'criado_por',
                                           'criado_por_nome', 'criado_em']) c
                 where not has_column_privilege('authenticated', 'public.relatorios_compartilhados', c, 'SELECT'))
     or not has_table_privilege('authenticated', 'public.relatorios_compartilhados', 'INSERT')
     or has_table_privilege('authenticated', 'public.relatorios_compartilhados', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.relatorios_compartilhados', 'revogado_em', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.relatorios_compartilhados', 'revogado_por', 'UPDATE')
     or has_column_privilege('authenticated', 'public.relatorios_compartilhados', 'expira_em', 'UPDATE')
     or has_column_privilege('authenticated', 'public.relatorios_compartilhados', 'acessos', 'UPDATE')
     or has_column_privilege('authenticated', 'public.relatorios_compartilhados', 'token_hash', 'UPDATE')
     or has_table_privilege('authenticated', 'public.relatorios_compartilhados', 'DELETE')
     or has_table_privilege('authenticated', 'public.relatorios_compartilhados', 'TRUNCATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: no link, authenticated deveria ler as onze colunas sem token_hash, incluir e atualizar só revogado_em/revogado_por';
  end if;
  if not has_table_privilege('service_role', 'public.relatorios_compartilhados', 'UPDATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role sem o privilégio das irmãs no link';
  end if;
  foreach v_nome in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
    if has_table_privilege('authenticated', 'public.parametros_consulta_documento', v_nome) then
      falhas := falhas + 1;
      raise warning 'FALHOU: authenticated tem % em parametros_consulta_documento', v_nome;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.parametros_consulta_documento', 'SELECT')
     or not has_table_privilege('service_role', 'public.parametros_consulta_documento', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated ou service_role não lê parametros_consulta_documento';
  end if;

  -- 5 · As policies, e nenhuma outra (uma permissiva a mais abriria por OU).
  if (select coalesce(string_agg(policyname || ':' || cmd, ',' order by policyname), '') from pg_policies
       where schemaname = 'public' and tablename = 'consultas_de_documento')
     <> 'consultas_de_documento_leitura:SELECT' then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_documento deveria ter só a policy de leitura';
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'relatorios_compartilhados';
  if v_n <> 3 or (select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies
                   where schemaname = 'public' and tablename = 'relatorios_compartilhados')
                 <> 'relatorios_compartilhados_inclusao:INSERT,relatorios_compartilhados_leitura:SELECT,'
                    'relatorios_compartilhados_revogacao:UPDATE' then
    falhas := falhas + 1;
    raise warning 'FALHOU: relatorios_compartilhados deveria ter leitura, inclusão e revogação (achei %)', v_n;
  end if;
  if (select coalesce(string_agg(policyname || ':' || cmd, ',' order by policyname), '') from pg_policies
       where schemaname = 'public' and tablename = 'parametros_consulta_documento')
     <> 'parametros_consulta_documento_leitura:SELECT' then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_consulta_documento deveria ter só a policy de leitura';
  end if;

  -- 6 · Os gatilhos: nenhum de carimbo na consulta (a função carimba); carimbo
  --     BEFORE INSERT e só-revogar BEFORE UPDATE no link; guarda de vigência
  --     BEFORE UPDATE nos parâmetros.
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.consultas_de_documento'::regclass and not tgisinternal)
     or to_regprocedure('public.consultas_de_documento_carimbar()') is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_documento ainda tem gatilho (ou a função de carimbo antiga)';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.relatorios_compartilhados'::regclass
                    and tgname = 'relatorios_compartilhados_carimbo'
                    and tgfoid = 'public.relatorios_compartilhados_carimbar()'::regprocedure
                    and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 4 = 4 and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger
                     where tgrelid = 'public.relatorios_compartilhados'::regclass
                       and tgname = 'relatorios_compartilhados_so_revogar'
                       and tgfoid = 'public.relatorios_compartilhados_so_revogar()'::regprocedure
                       and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 16 = 16 and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger
                     where tgrelid = 'public.parametros_consulta_documento'::regclass
                       and tgname = 'parametros_consulta_documento_vigencia'
                       and tgfoid = 'public.nucleo_so_encerra_vigencia()'::regprocedure
                       and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 16 = 16 and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: gatilhos do link (carimbo, só-revogar) ou guarda de vigência dos parâmetros ausentes';
  end if;

  -- 7 · As portas.
  --     Pública: DEFINER, search_path vazio, argumento p_token, anon e authenticated executam.
  if not exists (select 1 from pg_proc
                  where oid = 'public.abrir_relatorio_compartilhado(text)'::regprocedure
                    and prosecdef and proconfig @> array['search_path=""']
                    and proargnames[1] = 'p_token')
     or not has_function_privilege('anon', 'public.abrir_relatorio_compartilhado(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.abrir_relatorio_compartilhado(text)', 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: abrir_relatorio_compartilhado(p_token) não é DEFINER com search_path vazio executável por anon e authenticated';
  end if;
  --     Registro: DEFINER, search_path vazio, só service_role executa.
  if not exists (select 1 from pg_proc
                  where oid = v_assinatura_reg::regprocedure
                    and prosecdef and proconfig @> array['search_path=""'])
     or has_function_privilege('anon', v_assinatura_reg, 'EXECUTE')
     or has_function_privilege('authenticated', v_assinatura_reg, 'EXECUTE')
     or has_function_privilege('public', v_assinatura_reg, 'EXECUTE')
     or not has_function_privilege('service_role', v_assinatura_reg, 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: registrar_consulta_de_documento não é DEFINER com search_path vazio executável SÓ por service_role';
  end if;
  --     Parâmetros: DEFINER, search_path public, anon não executa.
  if not exists (select 1 from pg_proc
                  where oid = v_assinatura_par::regprocedure
                    and prosecdef and 'search_path=public' = any(proconfig))
     or has_function_privilege('anon', v_assinatura_par, 'EXECUTE')
     or not has_function_privilege('authenticated', v_assinatura_par, 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: consulta_documento_nova_vigencia não é DEFINER, ou anon a executa, ou authenticated não';
  end if;
  foreach v_nome in array array[v_assinatura_reg, v_assinatura_par, 'public.abrir_relatorio_compartilhado(text)'] loop
    if obj_description(v_nome::regprocedure, 'pg_proc') is null then
      falhas := falhas + 1;
      raise warning 'FALHOU: % sem comentário', v_nome;
    end if;
  end loop;

  -- 8 · A semente dos parâmetros: é a PRIMEIRA linha da org (encerrada ou não
  --     — numa reaplicação, depois de o admin abrir vigência nova, ela continua
  --     lá, só encerrada), e há exatamente uma vigente.
  select * into v_seed
    from public.parametros_consulta_documento
   where org_id = public.org_padrao()
   order by criado_em, vigencia_desde, id
   limit 1;
  if v_seed.id is null then
    raise exception 'ACEITE FALHOU: parametros_consulta_documento sem semente — a tela ficaria sem prazo de link';
  end if;
  if v_seed.dias_do_link <> 7 or v_seed.dias_de_consulta_recente <> 90
     or v_seed.minutos_contra_repeticao <> 30 or v_seed.links_ativos_por_consulta <> 10
     or v_seed.precos_de_referencia is distinct from
          '{"cpf-lite":0.12,"receita-federal":0.34,"cpf-dados":4.5,"analise-credito-plus-pf":29.02,
            "acerta-essencial-positivo":4.49,"cnpj":0.04,"cnpj-cadastral":0.55,"cadastral-premium-pj":3.75,
            "receita-federal-pj-v3":6.35,"analise-credito-basic-pj":10.06,"dossie-credito-pj":4.4,
            "cadastral-score-pj":1.3}'::jsonb
     or v_seed.tabela_de_precos_em is distinct from date '2026-10-18'
     or v_seed.fonte is distinct from 'Tabela pública da APIBrasil'
     or v_seed.criado_por is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: a semente dos parâmetros diverge do combinado em 2026-10-18: %', to_jsonb(v_seed);
  end if;
  select count(*) into v_n from public.parametros_consulta_documento
   where org_id = public.org_padrao() and vigencia_ate is null;
  if v_n <> 1 then
    raise exception 'ACEITE FALHOU: % vigência(s) aberta(s) dos parâmetros — esperado 1', v_n;
  end if;
  select * into v_vig from public.parametros_consulta_documento
   where org_id = public.org_padrao() and vigencia_ate is null;

  select count(*) into v_antes_c from public.consultas_de_documento;
  select count(*) into v_antes_l from public.relatorios_compartilhados;
  select count(*) into v_antes_p from public.parametros_consulta_documento;

  -- 9 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr', 'desativado'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-documento-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite Documento ' || v_papel,
             papeis    = array[case when v_papel = 'desativado' then 'financeiro' else v_papel end],
             role      = case when v_papel = 'desativado' then 'financeiro' else v_papel end,
             is_active = (v_papel <> 'desativado')
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    -- 9a · anon não lê nem inclui consulta, e não lê link.
    begin
      set local role anon;
      perform 1 from public.consultas_de_documento limit 1;
      reset role;
      v_anon := 'leu';
    exception when insufficient_privilege then v_anon := 'negado';
    end;
    begin
      set local role anon;
      insert into public.consultas_de_documento
        (tipo_documento, documento, nivel, produtos, relatorio, situacao, finalidade, titular_ciente, criado_por)
      values ('cpf', '00000000191', 'basico', '{cpf-lite}', v_relatorio, 'completa', 'financiamento', true, gen_random_uuid());
      reset role;
      v_anon_inclui := 'incluiu';
    exception when insufficient_privilege then v_anon_inclui := 'negado';
    end;
    begin
      set local role anon;
      perform 1 from public.relatorios_compartilhados limit 1;
      reset role;
      v_anon_link := 'leu';
    exception when insufficient_privilege then v_anon_link := 'negado';
    end;

    -- 9b · Nem os quatro papéis da ação incluem DIRETO pela sessão: 42501.
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'financeiro'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.consultas_de_documento
          (tipo_documento, documento, nivel, produtos, relatorio, situacao, finalidade, titular_ciente, criado_por)
        values ('cpf', '00000000191', 'basico', '{cpf-lite}', v_relatorio, 'completa', 'financiamento', true,
                (v_ids->>v_papel)::uuid);
        reset role;
      exception when insufficient_privilege then v_diretos_neg := v_diretos_neg + 1;
      end;
    end loop;
    perform set_config('request.jwt.claims', '', true);

    -- 9c · …nem a service_role direto: a função é a única porta.
    begin
      set local role service_role;
      insert into public.consultas_de_documento
        (tipo_documento, documento, nivel, produtos, relatorio, situacao, finalidade, titular_ciente, criado_por)
      values ('cpf', '00000000191', 'basico', '{cpf-lite}', v_relatorio, 'completa', 'financiamento', true,
              (v_ids->>'admin')::uuid);
      reset role;
      v_srv_direto := 'incluiu';
    exception when insufficient_privilege then v_srv_direto := 'negado';
    end;

    -- 9d · O servidor (service_role, sem sessão) registra pelos quatro: org,
    --      autor, nome e hora são da função. Situações variadas: completa,
    --      parcial (custo desconhecido) e falhou.
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'financeiro'] loop
      v_produtos := case when v_papel = 'financeiro' then '{cnpj,cadastral-score-pj}'::text[]
                         else '{cpf-lite,receita-federal}'::text[] end;
      v_situacao := case v_papel when 'gestor' then 'parcial' when 'comercial' then 'falhou' else 'completa' end;
      v_tentativas := (
        select jsonb_agg(jsonb_build_object(
                 'produto', p,
                 'ok', case v_situacao when 'completa' then true when 'falhou' then false else n = 1 end,
                 'status', case when v_situacao = 'falhou' or (v_situacao = 'parcial' and n = 2) then null else 200 end,
                 'motivo', case when v_situacao = 'falhou' or (v_situacao = 'parcial' and n = 2)
                                then 'tempo esgotado' end,
                 'pode_ter_cobrado', true,
                 'custo', case when v_situacao = 'completa' then 0.75 end) order by n)
          from unnest(v_produtos) with ordinality as u(p, n));
      begin
        set local role service_role;
        v_id := public.registrar_consulta_de_documento(
                  (v_ids->>v_papel)::uuid,
                  case when v_papel = 'financeiro' then 'cnpj' else 'cpf' end,
                  case when v_papel = 'financeiro' then '12ABC34501DE35' else '00000000191' end,
                  case v_papel when 'admin' then 'completo_integral' when 'gestor' then 'credito'
                               when 'comercial' then 'dados' else 'completo_score' end,
                  v_produtos, 'ACEITE DOCUMENTO ' || v_papel, v_relatorio, v_respostas, v_tentativas,
                  v_situacao, case when v_situacao = 'completa' then 1.50 end, false,
                  'financiamento', true);
        reset role;
        select * into v_linha from public.consultas_de_documento where id = v_id;
        v_registraram := v_registraram + 1;
        if v_papel = 'admin' then v_consulta := v_linha.id; end if;
        if v_linha.criado_por = (v_ids->>v_papel)::uuid
           and v_linha.criado_por_nome = 'Aceite Documento ' || v_papel
           and v_linha.org_id = public.org_padrao()
           and v_linha.criado_em > now() - interval '1 minute'
           and v_linha.situacao = v_situacao
           and v_linha.tentativas = v_tentativas
           and v_linha.custo is not distinct from (case when v_situacao = 'completa' then 1.50 end) then
          v_autor_certo := v_autor_certo + 1;
        end if;
      exception when insufficient_privilege then null;
      end;
    end loop;

    -- 9e · A sessão não entra no carimbo: com claims do gestor por cima, quem
    --      fica é o p_criado_por (o comercial).
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'gestor')::uuid, 'role', 'authenticated')::text, true);
    set local role service_role;
    v_id := public.registrar_consulta_de_documento(
              (v_ids->>'comercial')::uuid, 'cpf', '00000000272', 'basico', '{cpf-lite}',
              'ACEITE DOCUMENTO sessao', v_relatorio, '{}', '[]', 'completa', null, false,
              'cadastro_de_cliente', true);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select * into v_linha from public.consultas_de_documento where id = v_id;
    v_sessao_alheia := case
      when v_linha.criado_por = (v_ids->>'comercial')::uuid
       and v_linha.criado_por_nome = 'Aceite Documento comercial'
      then 'p_criado_por'
      else format('trocou (por %s, nome %s)', v_linha.criado_por, v_linha.criado_por_nome)
    end;

    -- 9f · A função recusa quem a matriz não deixa consultar: marketing, sdr,
    --      financeiro desativado, cliente sem perfil e nulo — 42501 citando a ação.
    foreach v_uid in array array[(v_ids->>'marketing')::uuid, (v_ids->>'sdr')::uuid,
                                 (v_ids->>'desativado')::uuid, v_cli, null] loop
      begin
        set local role service_role;
        perform public.registrar_consulta_de_documento(
                  v_uid, 'cpf', '00000000191', 'basico', '{cpf-lite}', null, v_relatorio, '{}', '[]',
                  'completa', null, false, 'financiamento', true);
        reset role;
      exception when insufficient_privilege then
        get stacked diagnostics v_msg = message_text;
        v_reg_negados := v_reg_negados + 1;
        if v_msg like '%Consultar CPF e CNPJ%' then v_reg_msg := v_reg_msg + 1; end if;
      end;
    end loop;

    -- 9g · authenticated (mesmo admin) e anon não executam a função.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.registrar_consulta_de_documento(
                (v_ids->>'admin')::uuid, 'cpf', '00000000191', 'basico', '{cpf-lite}', null, v_relatorio,
                '{}', '[]', 'completa', null, false, 'financiamento', true);
      reset role;
      v_reg_auth := 'executou';
    exception when insufficient_privilege then v_reg_auth := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);
    begin
      set local role anon;
      perform public.registrar_consulta_de_documento(
                (v_ids->>'admin')::uuid, 'cpf', '00000000191', 'basico', '{cpf-lite}', null, v_relatorio,
                '{}', '[]', 'completa', null, false, 'financiamento', true);
      reset role;
      v_reg_anon := 'executou';
    exception when insufficient_privilege then v_reg_anon := 'negado';
    end;

    -- 9h · Cada um dos quatro lê as quatro linhas — a de todos, não só a sua.
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'financeiro'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select count(*) into v_n from public.consultas_de_documento
         where nome like 'ACEITE DOCUMENTO %' and nome <> 'ACEITE DOCUMENTO sessao';
        if (select count(*) from public.consultas_de_documento
             where nome like 'ACEITE DOCUMENTO %' and respostas = v_respostas) = 4 then
          v_miolo_lido := v_miolo_lido + 1;
        end if;
        reset role;
        perform set_config('request.jwt.claims', '', true);
        v_leituras := v_leituras || v_papel || '=' || v_n || ' ';
        if v_n = 4 then v_leram := v_leram + 1; end if;
      exception when insufficient_privilege then
        v_leituras := v_leituras || v_papel || '=42501 ';
      end;
    end loop;

    -- 9i · Sem a declaração do titular, nem pelo admin a função registra.
    begin
      set local role service_role;
      perform public.registrar_consulta_de_documento(
                (v_ids->>'admin')::uuid, 'cpf', '00000000191', 'basico', '{cpf-lite}', null, v_relatorio,
                '{}', '[]', 'completa', null, false, 'financiamento', false);
      reset role;
      v_sem_ciencia := 'incluiu';
    exception when check_violation then
      get stacked diagnostics v_msg = constraint_name;
      v_sem_ciencia := case when v_msg = 'consultas_de_documento_titular_ciente' then 'recusou' else 'recusou por ' || v_msg end;
    end;

    -- 9j · Marketing, SDR, financeiro desativado e cliente: não leem e não incluem.
    foreach v_uid in array array[(v_ids->>'marketing')::uuid, (v_ids->>'sdr')::uuid,
                                 (v_ids->>'desativado')::uuid, v_cli] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select count(*) into v_n from public.consultas_de_documento;
        reset role;
        perform set_config('request.jwt.claims', '', true);
        if v_n = 0 then v_cegos := v_cegos + 1; end if;
      exception when insufficient_privilege then v_cegos := v_cegos + 1;
      end;
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.consultas_de_documento
          (tipo_documento, documento, nivel, produtos, relatorio, situacao, finalidade, titular_ciente, criado_por)
        values ('cpf', '00000000191', 'basico', '{cpf-lite}', v_relatorio, 'completa', 'financiamento', true, v_uid);
        reset role;
        perform set_config('request.jwt.claims', '', true);
      exception when insufficient_privilege then v_negados := v_negados + 1;
      end;
    end loop;
    perform set_config('request.jwt.claims', '', true);

    -- 9k · Nem o admin edita ou apaga a consulta: 42501, não "0 linhas".
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.consultas_de_documento set custo = 0 where nome like 'ACEITE DOCUMENTO %';
      reset role;
      v_edita := 'editou';
    exception when insufficient_privilege then v_edita := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      delete from public.consultas_de_documento where nome like 'ACEITE DOCUMENTO %';
      reset role;
      v_apaga := 'apagou';
    exception when insufficient_privilege then v_apaga := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 9l · O financeiro gera o link da consulta do admin, forjando autor, hora,
    --      acessos e revogação: entra com o carimbo da sessão, zero acesso e
    --      vivo. `returning id`, e não `*`: o `*` traria token_hash (9m).
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'financeiro')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.relatorios_compartilhados
        (consulta_id, token_hash, expira_em, criado_por, criado_por_nome, criado_em,
         acessos, ultimo_acesso_em, revogado_em, revogado_por)
      values (v_consulta, h_valido, now() + interval '7 days',
              (v_ids->>'gestor')::uuid, 'Outra Pessoa', now() - interval '1 day',
              50, now(), now(), (v_ids->>'gestor')::uuid)
      returning id into v_valido;
      reset role;
      select * into v_link from public.relatorios_compartilhados where id = v_valido;
      v_link_forjado := case
        when v_link.criado_por = (v_ids->>'financeiro')::uuid
         and v_link.criado_por_nome = 'Aceite Documento financeiro'
         and v_link.criado_em > now() - interval '1 minute'
         and v_link.org_id = public.org_padrao()
         and v_link.acessos = 0 and v_link.ultimo_acesso_em is null
         and v_link.revogado_em is null and v_link.revogado_por is null
        then 'sobrescrito'
        else format('manteve (por %s, em %s, acessos %s, revogado %s)',
                    v_link.criado_por, v_link.criado_em, v_link.acessos, v_link.revogado_em)
      end;
    exception when insufficient_privilege then v_link_forjado := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 9m · Quem enxerga o link não lê o hash: `token_hash` e `*` são 42501; as
    --      outras colunas, sim.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'financeiro')::uuid, 'role', 'authenticated')::text, true);
    begin
      set local role authenticated;
      perform token_hash from public.relatorios_compartilhados where id = v_valido;
      reset role;
      v_le_hash := 'leu';
    exception when insufficient_privilege then v_le_hash := 'negado';
    end;
    begin
      set local role authenticated;
      perform * from public.relatorios_compartilhados where id = v_valido;
      reset role;
      v_le_estrela := 'leu';
    exception when insufficient_privilege then v_le_estrela := 'negado';
    end;
    begin
      set local role authenticated;
      select count(*) into v_n from public.relatorios_compartilhados
       where id = v_valido and consulta_id = v_consulta and acessos = 0 and revogado_em is null
         and criado_por_nome is not null and expira_em > now() and ultimo_acesso_em is null
         and org_id is not null and criado_por is not null and criado_em is not null and revogado_por is null;
      reset role;
      v_le_colunas := case when v_n = 1 then 'leu' else 'viu ' || v_n end;
    exception when insufficient_privilege then v_le_colunas := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 9n · O comercial gera um segundo link (o que vai ser revogado); e não
    --      gera link para consulta que não existe.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.relatorios_compartilhados (consulta_id, token_hash, expira_em)
    values (v_consulta, h_revogado, now() + interval '30 days')
    returning id into v_revogavel;
    reset role;
    begin
      set local role authenticated;
      insert into public.relatorios_compartilhados (consulta_id, token_hash, expira_em)
      values (gen_random_uuid(), h_forjado, now() + interval '1 day');
      reset role;
      v_link_alheio := 'incluiu';
    exception
      when insufficient_privilege then v_link_alheio := 'negado';
      when foreign_key_violation  then v_link_alheio := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 9o · Um link expirado, gravado pela chave de serviço com data passada.
    insert into public.relatorios_compartilhados
      (consulta_id, token_hash, expira_em, criado_por, criado_em)
    values (v_consulta, h_expirado, now() - interval '1 day',
            (v_ids->>'admin')::uuid, now() - interval '10 days');

    -- 9p · Marketing e SDR não geram nem leem link.
    foreach v_papel in array array['marketing', 'sdr'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.relatorios_compartilhados (consulta_id, token_hash, expira_em)
        values (v_consulta, h_forjado, now() + interval '1 day');
        reset role;
      exception when insufficient_privilege then v_links_negados := v_links_negados + 1;
      end;
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select count(*) into v_n from public.relatorios_compartilhados;
        reset role;
        if v_n = 0 then v_links_cegos := v_links_cegos + 1; end if;
      exception when insufficient_privilege then v_links_cegos := v_links_cegos + 1;
      end;
    end loop;
    perform set_config('request.jwt.claims', '', true);

    -- 9q · O gestor revoga o link do comercial, forjando quem e quando: sai
    --      revogado, por ele, agora.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'gestor')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.relatorios_compartilhados
         set revogado_em = now() + interval '5 days', revogado_por = (v_ids->>'admin')::uuid
       where id = v_revogavel;
      reset role;
      select * into v_link from public.relatorios_compartilhados where id = v_revogavel;
      v_revoga := case
        when v_link.revogado_por = (v_ids->>'gestor')::uuid
         and v_link.revogado_em between now() - interval '1 minute' and now() + interval '1 minute'
        then 'revogou'
        else format('revogou com carimbo forjado (por %s, em %s)', v_link.revogado_por, v_link.revogado_em)
      end;
    exception when insufficient_privilege then v_revoga := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 9r · Esticar o prazo, mexer no contador, desrevogar, revogar de novo e
    --      apagar: tudo 42501 para a sessão.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'gestor')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.relatorios_compartilhados set expira_em = expira_em + interval '1 day' where id = v_valido;
      reset role;
      v_estica := 'esticou';
    exception when insufficient_privilege then v_estica := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.relatorios_compartilhados set acessos = 0 where id = v_valido;
      reset role;
      v_conta := 'mexeu';
    exception when insufficient_privilege then v_conta := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.relatorios_compartilhados set revogado_em = null, revogado_por = null where id = v_revogavel;
      reset role;
      v_desrevoga := 'desrevogou';
    exception when insufficient_privilege then v_desrevoga := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      -- Outra hora, mesmo autor: é o gatilho que recusa, e não a policy.
      update public.relatorios_compartilhados
         set revogado_em = revogado_em + interval '1 hour', revogado_por = auth.uid()
       where id = v_revogavel;
      reset role;
      v_rerrevoga := 'revogou de novo';
    exception when insufficient_privilege then v_rerrevoga := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      delete from public.relatorios_compartilhados where id = v_valido;
      reset role;
      v_apaga_link := 'apagou';
    exception when insufficient_privilege then v_apaga_link := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 9s · Nem a chave de serviço desrevoga ou estica o prazo: o gatilho vale para todos.
    begin
      set local role service_role;
      update public.relatorios_compartilhados set revogado_em = null, revogado_por = null where id = v_revogavel;
      reset role;
      v_srv_desrevoga := 'desrevogou';
    exception when insufficient_privilege then v_srv_desrevoga := 'negado';
    end;
    begin
      set local role service_role;
      update public.relatorios_compartilhados set expira_em = expira_em + interval '1 day' where id = v_valido;
      reset role;
      v_srv_estica := 'esticou';
    exception when insufficient_privilege then v_srv_estica := 'negado';
    end;

    -- 9t · A porta pública, como anon, com o TOKEN: o link válido abre (duas
    --      vezes, e conta as duas).
    begin
      set local role anon;
      select count(*) into v_n from public.abrir_relatorio_compartilhado(t_valido) a
       where a.relatorio = v_relatorio and a.tipo_documento = 'cpf' and a.nivel = 'completo_integral'
         and a.expira_em > now() and a.criado_em > now() - interval '1 minute';
      reset role;
      v_abre := case when v_n = 1 then 'abriu' else 'devolveu ' || v_n end;
      -- A linha inteira que a porta devolve: o miolo não vem.
      select to_jsonb(a) into v_porta from public.abrir_relatorio_compartilhado(t_valido) a;
    exception when insufficient_privilege then v_abre := 'negado';
    end;
    select acessos || ':' || (ultimo_acesso_em is not null) into v_abre_conta
      from public.relatorios_compartilhados where id = v_valido;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'sdr')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from public.abrir_relatorio_compartilhado(t_valido);
      reset role;
      v_abre_sdr := case when v_n = 1 then 'abriu' else 'devolveu ' || v_n end;
    exception when insufficient_privilege then v_abre_sdr := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    --      …e não abre: revogado, expirado, inexistente, o HASH do válido (quem
    --      vazou a tabela), o hash em maiúsculas, o token com um a mais, com um
    --      a menos, com caractere fora do base64url, com espaço, e nulo.
    foreach v_nome in array array[t_revogado, t_expirado, t_inexistente, h_valido, upper(h_valido),
                                  t_valido || 'x', left(t_valido, 42), left(t_valido, 42) || '=',
                                  left(t_valido, 42) || '+', ' ' || left(t_valido, 42)] loop
      set local role anon;
      select count(*) into v_n from public.abrir_relatorio_compartilhado(v_nome);
      reset role;
      if v_n = 0 then v_fechados := v_fechados + 1; end if;
    end loop;
    set local role anon;
    select count(*) into v_n from public.abrir_relatorio_compartilhado(null);
    reset role;
    if v_n = 0 then v_fechados := v_fechados + 1; end if;
    select string_agg(acessos::text, ',' order by token_hash) into v_sem_contar
      from public.relatorios_compartilhados where token_hash in (h_revogado, h_expirado);

    -- 9u · Os parâmetros: os quatro leem a vigente; marketing, sdr e cliente
    --      não veem nada; anon é 42501.
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'financeiro'] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from public.parametros_consulta_documento
       where vigencia_ate is null and id = v_vig.id;
      reset role;
      if v_n = 1 then v_param_leram := v_param_leram + 1; end if;
    end loop;
    foreach v_uid in array array[(v_ids->>'marketing')::uuid, (v_ids->>'sdr')::uuid, v_cli] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from public.parametros_consulta_documento;
      reset role;
      if v_n = 0 then v_param_cegos := v_param_cegos + 1; end if;
    end loop;
    perform set_config('request.jwt.claims', '', true);
    begin
      set local role anon;
      perform 1 from public.parametros_consulta_documento limit 1;
      reset role;
      v_param_anon := 'leu';
    exception when insufficient_privilege then v_param_anon := 'negado';
    end;

    -- 9v · Só o admin abre vigência: gestor, comercial e financeiro são 42501;
    --      sem sessão também; e nem o admin escreve DIRETO.
    foreach v_papel in array array['gestor', 'comercial', 'financeiro'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.consulta_documento_nova_vigencia(5, 60, 15, 5, '{"cpf-lite": 0.2}', current_date, 'Aceite');
        reset role;
      exception when insufficient_privilege then v_param_recus := v_param_recus + 1;
      end;
    end loop;
    perform set_config('request.jwt.claims', '', true);
    begin
      perform public.consulta_documento_nova_vigencia(5, 60, 15, 5, '{"cpf-lite": 0.2}', current_date, 'Aceite');
      v_param_sem_ses := 'gravou';
    exception when insufficient_privilege then v_param_sem_ses := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.parametros_consulta_documento
        (dias_do_link, dias_de_consulta_recente, minutos_contra_repeticao, links_ativos_por_consulta,
         precos_de_referencia, tabela_de_precos_em, fonte, vigencia_desde, vigencia_ate)
      values (5, 60, 15, 5, '{"cpf-lite": 0.2}', current_date, 'Aceite direto',
              current_date + 365, current_date + 730);
      reset role;
      v_param_direto := 'inseriu';
    exception when insufficient_privilege then v_param_direto := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.parametros_consulta_documento set vigencia_ate = current_date where id = v_vig.id;
      reset role;
      v_param_update := 'atualizou';
    exception when insufficient_privilege then v_param_update := 'negado';
    end;

    --      O admin, pela função: encerra a vigente e abre a nova, carimbada com
    --      ele. (A sessão é vestida de novo: a dos blocos acima voltou com o
    --      rollback de cada um.)
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into v_nova from public.consulta_documento_nova_vigencia(
             14, 60, 15, 5, '{"cpf-lite": 0.2, "cnpj": 0.05}', date '2026-11-01', '  Aceite admin  ',
             'Aceite: vigência aberta pelo admin');
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_n from public.parametros_consulta_documento
     where org_id = public.org_padrao() and vigencia_ate is null;
    v_param_admin := case
      when v_nova.criado_por = (v_ids->>'admin')::uuid
       and v_nova.dias_do_link = 14 and v_nova.fonte = 'Aceite admin'
       and v_nova.vigencia_desde = current_date and v_nova.vigencia_ate is null
       and (select vigencia_ate from public.parametros_consulta_documento where id = v_vig.id) = current_date
       and v_n = 1
      then 'abriu'
      else format('saiu errado (nova %s, vigentes %s)', to_jsonb(v_nova), v_n)
    end;

    --      Direto, como dono: a segunda vigente cai no índice; editar valor vigente, no guarda.
    begin
      insert into public.parametros_consulta_documento
        (dias_do_link, dias_de_consulta_recente, minutos_contra_repeticao, links_ativos_por_consulta,
         precos_de_referencia, tabela_de_precos_em, fonte)
      values (7, 90, 30, 10, '{"cpf-lite": 0.12}', current_date, 'Aceite segunda vigente');
      v_param_segunda := 'aceitou';
    exception when unique_violation then
      get stacked diagnostics v_msg = constraint_name;
      v_param_segunda := 'recusou por ' || v_msg;
    end;
    begin
      update public.parametros_consulta_documento set dias_do_link = 30 where id = v_nova.id;
      v_param_edita := 'editou';
    exception when raise_exception then v_param_edita := 'recusou';
    end;

    --      Cada regra dos parâmetros, numa vigência FUTURA e já encerrada (fora
    --      do índice e do gatilho). Os casos sem regra são os limites que passam.
    v_base := jsonb_build_object(
      'org_id',                    public.org_padrao(),
      'dias_do_link',              7,
      'dias_de_consulta_recente',  90,
      'minutos_contra_repeticao',  30,
      'links_ativos_por_consulta', 10,
      'precos_de_referencia',      '{"cpf-lite": 0.12}'::jsonb,
      'tabela_de_precos_em',       current_date,
      'fonte',                     'Aceite parametros_consulta_documento',
      'vigencia_desde',            current_date + 365,
      'vigencia_ate',              current_date + 730,
      'criado_em',                 now());
    for v_caso in
      select * from (values
        ('a base',                       '{}'::jsonb, null::text),
        ('limites de baixo',             '{"dias_do_link": 1, "dias_de_consulta_recente": 1, "minutos_contra_repeticao": 0, "links_ativos_por_consulta": 1}', null),
        ('limites de cima',              '{"dias_do_link": 30, "dias_de_consulta_recente": 365, "minutos_contra_repeticao": 1440, "links_ativos_por_consulta": 50}', null),
        ('preço zero',                   '{"precos_de_referencia": {"cpf-lite": 0}}', null),
        ('link de 0 dia',                '{"dias_do_link": 0}',              'parametros_consulta_documento_dias_do_link_na_faixa'),
        ('link de 31 dias',              '{"dias_do_link": 31}',             'parametros_consulta_documento_dias_do_link_na_faixa'),
        ('recente de 0 dia',             '{"dias_de_consulta_recente": 0}',  'parametros_consulta_documento_dias_de_consulta_recente_na_faixa'),
        ('recente de 366 dias',          '{"dias_de_consulta_recente": 366}','parametros_consulta_documento_dias_de_consulta_recente_na_faixa'),
        ('repetição negativa',           '{"minutos_contra_repeticao": -1}', 'parametros_consulta_documento_minutos_contra_repeticao_na_faixa'),
        ('repetição de 1441',            '{"minutos_contra_repeticao": 1441}','parametros_consulta_documento_minutos_contra_repeticao_na_faixa'),
        ('0 link ativo',                 '{"links_ativos_por_consulta": 0}', 'parametros_consulta_documento_links_ativos_na_faixa'),
        ('51 links ativos',              '{"links_ativos_por_consulta": 51}','parametros_consulta_documento_links_ativos_na_faixa'),
        ('preços vazios',                '{"precos_de_referencia": {}}',     'parametros_consulta_documento_precos_validos'),
        ('preços em lista',              '{"precos_de_referencia": [0.12]}', 'parametros_consulta_documento_precos_validos'),
        ('preço negativo',               '{"precos_de_referencia": {"cpf-lite": -0.01}}', 'parametros_consulta_documento_precos_validos'),
        ('preço em texto',               '{"precos_de_referencia": {"cpf-lite": "0.12"}}', 'parametros_consulta_documento_precos_validos'),
        ('preço nulo',                   '{"precos_de_referencia": {"cpf-lite": null}}', 'parametros_consulta_documento_precos_validos'),
        ('produto fora do formato',      '{"precos_de_referencia": {"CPF Lite": 0.12}}', 'parametros_consulta_documento_precos_validos'),
        ('fonte vazia',                  '{"fonte": ""}',                    'parametros_consulta_documento_fonte_preenchida'),
        ('fonte só espaço',              '{"fonte": " \t\n "}',              'parametros_consulta_documento_fonte_preenchida'),
        ('fonte de 201',                 jsonb_build_object('fonte', repeat('x', 201)), 'parametros_consulta_documento_fonte_preenchida'),
        ('vigência que acaba antes',     jsonb_build_object('vigencia_ate', current_date + 364), 'parametros_consulta_documento_vigencia_em_ordem')
      ) as c(nome, muda, regra)
    loop
      if v_caso.regra is null then v_param_limites := v_param_limites + 1;
      else v_param_casos := v_param_casos + 1; end if;
      begin
        insert into public.parametros_consulta_documento
        select * from jsonb_populate_record(null::public.parametros_consulta_documento,
                        v_base || v_caso.muda || jsonb_build_object('id', gen_random_uuid()));
        if v_caso.regra is null then
          v_param_aceitos := v_param_aceitos + 1;
        else
          raise warning 'parâmetro "%" foi aceito — esperado recusa por %', v_caso.nome, v_caso.regra;
        end if;
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_caso.regra is not null and v_msg = v_caso.regra then
          v_param_certos := v_param_certos + 1;
        else
          raise warning 'parâmetro "%" recusado por "%" (esperado %)', v_caso.nome, v_msg, coalesce(v_caso.regra, 'aceite');
        end if;
      end;
    end loop;

    -- 9w · Cada regra da consulta, tentando gravar o inválido (como dono, sem
    --      a função: só o CHECK fala).
    for v_caso in
      select * from (values
        ('consultas_de_documento_tipo_valido',        'rg',   '00000000191',     'basico',  '{cpf-lite}'::text[], null::text, '{}'::jsonb, null::numeric, 'financiamento', true),
        ('consultas_de_documento_documento_valido',   'cpf',  '000.000.001-91',  'basico',  '{cpf-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_documento_valido',   'cpf',  '0000000019',      'basico',  '{cpf-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_documento_valido',   'cpf',  '0000000019A',     'basico',  '{cpf-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_documento_valido',   'cnpj', '00000000191',     'basico',  '{cnpj-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_documento_valido',   'cnpj', '12abc34501de35',  'basico',  '{cnpj-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_documento_valido',   'cnpj', '12ABC34501DEAB',  'basico',  '{cnpj-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_documento_valido',   'cpf',  '12ABC34501DE35',  'basico',  '{cpf-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_nivel_valido',       'cpf',  '00000000191',     'premium', '{cpf-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_nivel_valido',       'cnpj', '11222333000181',  'completo', '{cnpj}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_score_so_cnpj',      'cpf',  '00000000191',     'completo_score', '{cpf-lite}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_produtos_validos',   'cpf',  '00000000191',     'basico',  '{}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_produtos_validos',   'cpf',  '00000000191',     'basico',  '{cpf-lite,NULL}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_produtos_validos',   'cpf',  '00000000191',     'basico',  '{""}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_produtos_validos',   'cpf',  '00000000191',     'basico',  '{"cpf lite"}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_produtos_validos',   'cpf',  '00000000191',     'basico',  '{{cpf-lite},{receita-federal}}', null, '{}', null, 'financiamento', true),
        ('consultas_de_documento_nome_valido',        'cpf',  '00000000191',     'basico',  '{cpf-lite}', '   ', '{}', null, 'financiamento', true),
        ('consultas_de_documento_nome_valido',        'cpf',  '00000000191',     'basico',  '{cpf-lite}', repeat('x', 201), '{}', null, 'financiamento', true),
        ('consultas_de_documento_relatorio_e_objeto', 'cpf',  '00000000191',     'basico',  '{cpf-lite}', null, '[]', null, 'financiamento', true),
        ('consultas_de_documento_custo_valido',       'cpf',  '00000000191',     'basico',  '{cpf-lite}', null, '{}', -0.01, 'financiamento', true),
        ('consultas_de_documento_finalidade_valida',  'cpf',  '00000000191',     'basico',  '{cpf-lite}', null, '{}', null, 'marketing', true),
        ('consultas_de_documento_titular_ciente',     'cpf',  '00000000191',     'basico',  '{cpf-lite}', null, '{}', null, 'financiamento', false)
      ) as t(regra, tipo, documento, nivel, produtos, nome, relatorio, custo, finalidade, ciente)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.consultas_de_documento
          (tipo_documento, documento, nivel, produtos, nome, relatorio, situacao, custo, finalidade,
           titular_ciente, criado_por)
        values (v_caso.tipo, v_caso.documento, v_caso.nivel, v_caso.produtos, v_caso.nome,
                v_caso.relatorio, 'completa', v_caso.custo, v_caso.finalidade, v_caso.ciente, gen_random_uuid());
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_certas := v_certas + 1;
        else raise warning 'regra % recusou por %', v_caso.regra, v_msg;
        end if;
      end;
    end loop;

    -- Situação e tentativas: cada caso viola UMA regra; os sem regra são os
    -- controles que têm de entrar (tentativas vazias, campos opcionais nulos).
    for v_caso in
      select * from (values
        (null::text,                                  'completa', '[]'::jsonb),
        (null,                                        'falhou',   '[{"produto": "cpf-lite", "ok": false, "status": null, "motivo": null, "pode_ter_cobrado": true, "custo": null}]'),
        (null,                                        'parcial',  '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true, "custo": 0.12, "status": 200}, {"produto": "receita-federal", "ok": false, "pode_ter_cobrado": false, "motivo": "erro 500", "status": 500}]'),
        ('consultas_de_documento_situacao_valida',    'ok',       '[]'),
        ('consultas_de_documento_situacao_valida',    'Completa', '[]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '{}'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[1]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[{"ok": true, "pode_ter_cobrado": true}]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[{"produto": "cnpj", "ok": true, "pode_ter_cobrado": true}]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[{"produto": "cpf-lite", "ok": "true", "pode_ter_cobrado": true}]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[{"produto": "cpf-lite", "ok": true}]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true, "status": "200"}]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true, "motivo": 5}]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true, "custo": -0.01}]'),
        ('consultas_de_documento_tentativas_validas', 'completa', '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true, "custo": "0.12"}]'),
        ('consultas_de_documento_situacao_coerente',  'completa', '[{"produto": "cpf-lite", "ok": false, "pode_ter_cobrado": true}]'),
        ('consultas_de_documento_situacao_coerente',  'falhou',   '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true}]'),
        ('consultas_de_documento_situacao_coerente',  'parcial',  '[{"produto": "cpf-lite", "ok": true, "pode_ter_cobrado": true}]'),
        ('consultas_de_documento_situacao_coerente',  'parcial',  '[]')
      ) as t(regra, situacao, tentativas)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.consultas_de_documento
          (tipo_documento, documento, nivel, produtos, relatorio, situacao, tentativas, finalidade,
           titular_ciente, criado_por)
        values ('cpf', '00000000191', 'credito', '{cpf-lite,receita-federal}', '{}', v_caso.situacao,
                v_caso.tentativas, 'financiamento', true, gen_random_uuid());
        if v_caso.regra is null then v_certas := v_certas + 1;
        else raise warning 'situação % com tentativas % foi aceita — esperado %', v_caso.situacao, v_caso.tentativas, v_caso.regra;
        end if;
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_certas := v_certas + 1;
        else raise warning 'situação % com tentativas % recusada por % (esperado %)',
               v_caso.situacao, v_caso.tentativas, v_msg, coalesce(v_caso.regra, 'aceite');
        end if;
      end;
    end loop;

    -- 9x · Cada regra do link (sem sessão: os valores informados valem).
    for v_caso in
      select * from (values
        ('relatorios_compartilhados_token_e_sha256',     repeat('g', 64), now() + interval '1 day', now(), null::timestamptz, null::uuid, 0, null::timestamptz),
        ('relatorios_compartilhados_token_e_sha256',     upper(h_forjado), now() + interval '1 day', now(), null, null, 0, null),
        ('relatorios_compartilhados_token_e_sha256',     left(h_forjado, 63), now() + interval '1 day', now(), null, null, 0, null),
        ('relatorios_compartilhados_token_e_sha256',     t_forjado, now() + interval '1 day', now(), null, null, 0, null),
        ('relatorios_compartilhados_prazo_valido',       h_forjado, now() - interval '1 second', now(), null, null, 0, null),
        ('relatorios_compartilhados_prazo_valido',       h_forjado, now() + interval '721 hours', now(), null, null, 0, null),
        ('relatorios_compartilhados_revogacao_coerente', h_forjado, now() + interval '1 day', now(), null, gen_random_uuid(), 0, null),
        ('relatorios_compartilhados_revogacao_coerente', h_forjado, now() + interval '1 day', now(), now() - interval '1 hour', null, 0, null),
        ('relatorios_compartilhados_acessos_coerentes',  h_forjado, now() + interval '1 day', now(), null, null, -1, now()),
        ('relatorios_compartilhados_acessos_coerentes',  h_forjado, now() + interval '1 day', now(), null, null, 3, null),
        ('relatorios_compartilhados_acessos_coerentes',  h_forjado, now() + interval '1 day', now(), null, null, 0, now())
      ) as t(regra, token, expira, criado, revogado, revogado_por, acessos, ultimo)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.relatorios_compartilhados
          (consulta_id, token_hash, expira_em, criado_em, revogado_em, revogado_por,
           acessos, ultimo_acesso_em, criado_por)
        values (v_consulta, v_caso.token, v_caso.expira, v_caso.criado, v_caso.revogado,
                v_caso.revogado_por, v_caso.acessos, v_caso.ultimo, gen_random_uuid());
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_certas := v_certas + 1;
        else raise warning 'regra % recusou por %', v_caso.regra, v_msg;
        end if;
      end;
    end loop;
    -- O miolo é objeto por produto.
    v_regras := v_regras + 1;
    begin
      insert into public.consultas_de_documento
        (tipo_documento, documento, nivel, produtos, relatorio, respostas, situacao, finalidade, titular_ciente, criado_por)
      values ('cpf', '00000000191', 'basico', '{cpf-lite}', '{}', '[{"cpf-lite": {}}]', 'completa', 'financiamento', true,
              gen_random_uuid());
    exception when check_violation then
      get stacked diagnostics v_msg = constraint_name;
      if v_msg = 'consultas_de_documento_respostas_e_objeto' then v_certas := v_certas + 1; end if;
    end;
    -- O mesmo hash duas vezes: a unicidade.
    v_regras := v_regras + 1;
    begin
      insert into public.relatorios_compartilhados (consulta_id, token_hash, expira_em, criado_por)
      values (v_consulta, h_valido, now() + interval '1 day', gen_random_uuid());
    exception when unique_violation then
      get stacked diagnostics v_msg = constraint_name;
      if v_msg = 'relatorios_compartilhados_token_unico' then v_certas := v_certas + 1; end if;
    end;

    raise exception 'DESFAZER_ACEITE_DOCUMENTO' using errcode = 'PCD01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PCD01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'financeiro' is null or v_consulta is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários ou a consulta — nada foi provado';
  end if;
  if v_anon <> 'negado' or v_anon_inclui <> 'negado' or v_anon_link <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon — leitura %, inclusão %, leitura do link %', v_anon, v_anon_inclui, v_anon_link;
  end if;
  if v_diretos_neg <> 4 or v_srv_direto <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: inclusão direta — % de 4 papéis negados pela sessão; service_role %', v_diretos_neg, v_srv_direto;
  end if;
  if v_registraram <> 4 or v_autor_certo <> 4 then
    falhas := falhas + 1;
    raise warning 'FALHOU: registro pela função — % de 4 registraram, % de 4 com org, autor, nome, hora, situação e tentativas certos',
      v_registraram, v_autor_certo;
  end if;
  if v_sessao_alheia <> 'p_criado_por' then
    falhas := falhas + 1;
    raise warning 'FALHOU: com uma sessão por cima, o carimbo %', v_sessao_alheia;
  end if;
  if v_reg_negados <> 5 or v_reg_msg <> 5 then
    falhas := falhas + 1;
    raise warning 'FALHOU: marketing, sdr, desativado, cliente e nulo — % de 5 recusados pela função, % citando a ação',
      v_reg_negados, v_reg_msg;
  end if;
  if v_reg_auth <> 'negado' or v_reg_anon <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a função de registro — authenticated %, anon % (esperado negado)', v_reg_auth, v_reg_anon;
  end if;
  if v_leram <> 4 then
    falhas := falhas + 1;
    raise warning 'FALHOU: os quatro papéis deveriam ver as 4 linhas de sonda (%)', v_leituras;
  end if;
  if v_sem_ciencia <> 'recusou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: consulta sem a declaração do titular: %', v_sem_ciencia;
  end if;
  if v_cegos <> 4 or v_negados <> 4 then
    falhas := falhas + 1;
    raise warning 'FALHOU: marketing, sdr, desativado e cliente — % de 4 sem leitura, % de 4 sem inclusão', v_cegos, v_negados;
  end if;
  if v_edita <> 'negado' or v_apaga <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: consulta só inclusão — update %, delete % (esperado 42501 nos dois)', v_edita, v_apaga;
  end if;
  if v_link_forjado <> 'sobrescrito' or v_link_alheio <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: link — carimbo forjado %, link para consulta inexistente %', v_link_forjado, v_link_alheio;
  end if;
  if v_le_hash <> 'negado' or v_le_estrela <> 'negado' or v_le_colunas <> 'leu' then
    falhas := falhas + 1;
    raise warning 'FALHOU: leitura do link pela sessão — token_hash %, *, %, as outras colunas %', v_le_hash, v_le_estrela, v_le_colunas;
  end if;
  if v_links_negados <> 2 or v_links_cegos <> 2 then
    falhas := falhas + 1;
    raise warning 'FALHOU: marketing e sdr — % de 2 sem gerar link, % de 2 sem ler link', v_links_negados, v_links_cegos;
  end if;
  if v_revoga <> 'revogou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: revogação pelo gestor: %', v_revoga;
  end if;
  if v_estica <> 'negado' or v_conta <> 'negado' or v_desrevoga <> 'negado'
     or v_rerrevoga <> 'negado' or v_apaga_link <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: link pela sessão — esticar %, contador %, desrevogar %, revogar de novo %, apagar %',
      v_estica, v_conta, v_desrevoga, v_rerrevoga, v_apaga_link;
  end if;
  if v_srv_desrevoga <> 'negado' or v_srv_estica <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: chave de serviço — desrevogar %, esticar %', v_srv_desrevoga, v_srv_estica;
  end if;
  -- O link válido foi aberto duas vezes como anon antes do sdr (a contagem e
  -- a linha inteira): dois acessos, e a hora do último.
  if v_abre <> 'abriu' or v_abre_conta is distinct from '2:true' or v_abre_sdr <> 'abriu' then
    falhas := falhas + 1;
    raise warning 'FALHOU: porta pública — anon %, acessos:último %, authenticated %', v_abre, v_abre_conta, v_abre_sdr;
  end if;
  if v_miolo_lido <> 4 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % de 4 papéis leram o miolo (respostas) pela RLS da tabela', v_miolo_lido;
  end if;
  if v_porta is null
     or (select string_agg(k, ',' order by k) from jsonb_object_keys(v_porta) k)
        <> 'criado_em,expira_em,nivel,relatorio,tipo_documento'
     or v_porta::text like '%MIOLO_ACEITE%' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a porta pública devolveu outra coisa além das cinco colunas, ou o miolo: %', v_porta;
  end if;
  if v_fechados <> 11 or v_sem_contar is distinct from '0,0' then
    falhas := falhas + 1;
    raise warning 'FALHOU: porta pública — % de 11 entradas ruins (inclusive o hash) sem linha; acessos de revogado/expirado %',
      v_fechados, v_sem_contar;
  end if;
  if v_regras < 54 or v_certas <> v_regras then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras da consulta e do link — % de % casos como prometido', v_certas, v_regras;
  end if;
  if v_param_leram <> 4 or v_param_cegos <> 3 or v_param_anon <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: leitura dos parâmetros — % de 4 papéis leram, % de 3 (marketing, sdr, cliente) sem linha, anon %',
      v_param_leram, v_param_cegos, v_param_anon;
  end if;
  if v_param_recus <> 3 or v_param_sem_ses <> 'negado' or v_param_direto <> 'negado' or v_param_update <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: escrita dos parâmetros — % de 3 (gestor, comercial, financeiro) recusados, sem sessão %, insert direto %, update direto %',
      v_param_recus, v_param_sem_ses, v_param_direto, v_param_update;
  end if;
  if v_param_admin <> 'abriu' then
    falhas := falhas + 1;
    raise warning 'FALHOU: vigência nova pelo admin: %', v_param_admin;
  end if;
  if v_param_segunda <> 'recusou por parametros_consulta_documento_um_vigente' or v_param_edita <> 'recusou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: parâmetros — segunda vigente %, editar valor vigente %', v_param_segunda, v_param_edita;
  end if;
  if v_param_casos < 18 or v_param_certos <> v_param_casos or v_param_aceitos <> v_param_limites then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras dos parâmetros — % de % recusas pela regra certa, % de % limites aceitos',
      v_param_certos, v_param_casos, v_param_aceitos, v_param_limites;
  end if;

  -- Nada da prova ficou.
  select count(*) into v_depois_c from public.consultas_de_documento;
  select count(*) into v_depois_l from public.relatorios_compartilhados;
  select count(*) into v_depois_p from public.parametros_consulta_documento;
  select count(*) into v_restou from auth.users where email like 'aceite-documento-%@exemplo.invalido';
  if v_depois_c <> v_antes_c or v_depois_l <> v_antes_l or v_depois_p <> v_antes_p or v_restou <> 0
     or not exists (select 1 from public.parametros_consulta_documento where id = v_vig.id and vigencia_ate is null) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (consultas % → %, links % → %, parâmetros % → %, % usuário(s)) ou mexeu na vigente',
      v_antes_c, v_depois_c, v_antes_l, v_depois_l, v_antes_p, v_depois_p, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em consultas_de_documento / relatorios_compartilhados / parametros_consulta_documento', falhas;
  end if;

  raise notice
    'Aceite verificado: consultas_de_documento, relatorios_compartilhados e '
    'parametros_consulta_documento existem com as regras nomeadas, índices, RLS e '
    'gatilhos; ninguém inclui consulta direto (nem os quatro papéis, nem a '
    'service_role): registrar_consulta_de_documento, só da service_role, registra '
    'completa, parcial e falhou com org, autor, nome e hora da função (a sessão não '
    'entra) e recusa marketing, sdr, desativado, cliente e nulo citando a ação; '
    'admin, gestor, comercial e financeiro leem as consultas de todos; sem a '
    'declaração do titular não entra; ninguém edita nem apaga consulta (42501); o '
    'link nasce com carimbo da sessão, zero acesso e vivo, e a sessão não lê '
    'token_hash; revogar funciona, carimbado pela sessão; esticar prazo, mexer no '
    'contador, desrevogar, revogar de novo e apagar são negados, e nem a chave de '
    'serviço desrevoga ou estica; abrir_relatorio_compartilhado abre pelo TOKEN '
    '(as cinco colunas, sem o miolo) e conta cada acesso, e não abre pelo hash, por '
    'token fora da forma, revogado, expirado, inexistente ou nulo; os parâmetros '
    'têm a semente de 2026-10-18, os quatro papéis leem, só o admin abre vigência '
    'pela função, e cada faixa cai na regra certa; situação, tentativas e as demais '
    'regras caem na regra certa; a prova não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261018120000', 'consultas_de_documento')
  on conflict (version) do nothing;
