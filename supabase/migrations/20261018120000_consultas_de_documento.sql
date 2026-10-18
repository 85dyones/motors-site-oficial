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
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.consultas_de_documento` — uma linha por consulta paga que deu
--    certo. `relatorio` (jsonb) é o relatório normalizado montado pelo
--    servidor, o que a tela e o link mostram. `respostas` (jsonb) é o miolo
--    bruto de cada produto, por produto: é ele que deixa remontar o relatório
--    sem pagar de novo quando o leitor do formato mudar. O miolo tem MAIS dado
--    pessoal que o relatório; lê-se pela mesma RLS da tabela (os quatro
--    papéis), e NUNCA sai pelo link: `abrir_relatorio_compartilhado` devolve
--    só o relatório (o aceite confere as colunas da função). `produtos` lista
--    os produtos da APIBrasil chamados, pelo `tipo` dela
--    (`{cpf-lite,receita-federal}`, `{cnpj,cadastral-score-pj}`).
--    A lista de produtos NÃO é travada no banco (decisão de 2026-10-18): o
--    catálogo do fornecedor muda e quem escolhe o produto é o servidor; o
--    banco só exige o formato do identificador.
-- 2. `public.relatorios_compartilhados` — o link que o consultor manda. Só o
--    sha256 do token fica no banco: quem lê a tabela não abre o link.
-- 3. Dois gatilhos de carimbo, no padrão de `consultas_de_modelo_carimbar()`:
--    com sessão, org, quem (id e nome) e quando são da sessão.
-- 4. `relatorios_compartilhados_so_revogar()` — o gatilho que deixa o link
--    mudar de um jeito só: ser revogado, para sempre. O contador de acessos só
--    cresce.
-- 5. `public.abrir_relatorio_compartilhado(p_token_hash)` — SECURITY DEFINER,
--    a única porta da página pública (sem sessão): devolve o relatório se o
--    link existir, não estiver revogado nem expirado, e conta o acesso.
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
-- · Quem consultou e quando são carimbados pelo gatilho (não pela tela), e
--   ninguém edita nem apaga pelo painel: é o registro que responde ao titular
--   "quem viu meus dados, e por quê".
-- · O link vive no máximo 30 dias, e qualquer um dos quatro papéis o revoga.
--   Revogado não volta. Cada abertura é contada (`acessos`, `ultimo_acesso_em`).
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
-- policies usam `tem_papel`, que já exige conta ativa.
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
--   consultas_de_documento_custo_valido .......... nulo ou >= 0
--   consultas_de_documento_finalidade_valida ..... a lista fechada acima
--   consultas_de_documento_titular_ciente ........ só true
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
-- ⚠️ DESFAZER (nada mais depende destes objetos):
--
--   begin;
--   drop function if exists public.abrir_relatorio_compartilhado(text);
--   drop table    if exists public.relatorios_compartilhados;
--   drop table    if exists public.consultas_de_documento;
--   drop function if exists public.relatorios_compartilhados_carimbar();
--   drop function if exists public.relatorios_compartilhados_so_revogar();
--   drop function if exists public.consultas_de_documento_carimbar();
--   delete from supabase_migrations.schema_migrations where version = '20261018120000';
--   commit;
--
-- Aditiva (duas tabelas novas; nenhuma coluna, policy ou gatilho em tabela
-- existente; `estoque_motors` não é tocada; nenhuma extensão nova — `sha256()`
-- é nativa desde o Postgres 11) e idempotente: `create table if not exists`,
-- `create index if not exists`, `create or replace` para as funções,
-- `drop … if exists` + `create` para gatilhos e policies.
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
  if to_regprocedure('pg_catalog.sha256(bytea)') is null then
    raise exception 'DEPENDÊNCIA: sha256(bytea) ausente (Postgres anterior ao 11). Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. A consulta
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
  custo            numeric(10,2),
  homologacao      boolean not null default false,
  finalidade       text not null,
  titular_ciente   boolean not null,
  criado_por       uuid not null default auth.uid(),
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
  constraint consultas_de_documento_custo_valido
    check (custo is null or custo >= 0),
  constraint consultas_de_documento_finalidade_valida
    check (finalidade in ('financiamento', 'venda_a_prazo', 'compra_de_veiculo',
                          'cadastro_de_cliente', 'cadastro_de_fornecedor', 'prevencao_a_fraude')),
  constraint consultas_de_documento_titular_ciente
    check (titular_ciente = true)
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
  'integral). Uma linha por consulta PAGA que '
  'deu certo. DADO PESSOAL (LGPD): cada linha declara a finalidade e que o '
  'titular está ciente, e o gatilho carimba quem consultou e quando. Só '
  'inclusão: ninguém edita nem apaga. Lê e inclui a ação "Consultar CPF e CNPJ '
  '(consulta paga)": Administrador, Gestor, Comercial e Financeiro. Ver '
  '20261018120000_consultas_de_documento.sql.';
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
  'mostram. Contém dado pessoal: só os quatro papéis da ação leem.';
comment on column public.consultas_de_documento.respostas is
  'O miolo bruto de cada produto da APIBrasil, como objeto por produto '
  '({"cpf-lite": {...}}), para remontar o relatório sem pagar de novo se o '
  'leitor do formato mudar. Mais dado pessoal que o relatório: mesma RLS da '
  'tabela, e NUNCA sai por abrir_relatorio_compartilhado().';
comment on column public.consultas_de_documento.custo is
  'O que o fornecedor cobrou, em reais, como ele informou. Nulo se não disse; zero em homologação.';
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
  'auth.uid() de quem consultou. Com sessão, é o gatilho que grava; sem sessão '
  '(chave de serviço) quem grava tem de informar.';
comment on column public.consultas_de_documento.criado_por_nome is
  'Nome de quem consultou (autor_atual()), legível mesmo depois que a pessoa '
  'sair da loja. Com sessão, é o gatilho que grava.';
comment on column public.consultas_de_documento.criado_em is
  'Quando a consulta foi registrada. Com sessão, é o gatilho que grava (now()).';


-- ----------------------------------------------------------------------------
-- 2. O link compartilhado
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
  -- sessão (horário de verão); horas não.
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
  '(ao banco, à financeira, ao cliente). Só o sha256 do token fica gravado. '
  'Vive no máximo 30 dias; qualquer dos quatro papéis o revoga, e revogado não '
  'volta. A página pública o abre só por abrir_relatorio_compartilhado(), que '
  'conta o acesso. Ver 20261018120000_consultas_de_documento.sql.';
comment on column public.relatorios_compartilhados.consulta_id is
  'A consulta cujo relatório o link abre.';
comment on column public.relatorios_compartilhados.token_hash is
  'sha256 do token do link, em hex minúsculo (64). O token em si nunca é gravado.';
comment on column public.relatorios_compartilhados.expira_em is
  'Até quando o link abre. Depois de criado_em e no máximo 30 dias (720 h) '
  'depois. Não se altera: para encurtar, revoga-se e cria-se outro.';
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
-- 3. O carimbo não é de quem chama
-- ----------------------------------------------------------------------------
create or replace function public.consultas_de_documento_carimbar()
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

comment on function public.consultas_de_documento_carimbar() is
  'Gatilho de consultas_de_documento: com sessão, grava org, autor (id e nome) '
  'e hora pela sessão, e não pelo que o cliente mandou. Equivalente a '
  'consultas_de_modelo_carimbar().';

drop trigger if exists consultas_de_documento_carimbo on public.consultas_de_documento;
create trigger consultas_de_documento_carimbo
  before insert on public.consultas_de_documento
  for each row execute function public.consultas_de_documento_carimbar();

revoke all on function public.consultas_de_documento_carimbar() from public, anon, authenticated;


create or replace function public.relatorios_compartilhados_carimbar()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  -- O mesmo carimbo, e mais: com sessão, o link nasce sem acesso e sem
  -- revogação. O contador é da página pública e a revogação é um UPDATE —
  -- nenhum dos dois se informa na criação.
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
-- 4. O link só muda de um jeito: revogado, para sempre
-- ----------------------------------------------------------------------------
-- O privilégio de coluna (seção 5) já impede `authenticated` de escrever fora
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
-- 5. Privilégio e RLS
-- ----------------------------------------------------------------------------
revoke all on public.consultas_de_documento from public, anon, authenticated;
grant select, insert on public.consultas_de_documento to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.consultas_de_documento to service_role;

-- No link, `authenticated` atualiza DUAS colunas e nenhuma outra: mexer em
-- `expira_em` ou `acessos` é 42501 antes de qualquer policy.
revoke all on public.relatorios_compartilhados from public, anon, authenticated;
grant select, insert on public.relatorios_compartilhados to authenticated;
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
-- A expressão se repete nas cinco policies de propósito (é o padrão das
-- irmãs): cada policy se lê sozinha.
create policy consultas_de_documento_leitura on public.consultas_de_documento
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial')
         or public.tem_papel(auth.uid(), 'financeiro'))
  );

create policy consultas_de_documento_inclusao on public.consultas_de_documento
  for insert to authenticated
  with check (
    org_id = public.org_padrao()
    and criado_por = auth.uid()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial')
         or public.tem_papel(auth.uid(), 'financeiro'))
  );

comment on policy consultas_de_documento_leitura on public.consultas_de_documento is
  'Lê as consultas de CPF/CNPJ quem a matriz deixa consultar: Administrador, Gestor, Comercial e Financeiro, com conta ativa.';
comment on policy consultas_de_documento_inclusao on public.consultas_de_documento is
  'Inclui a consulta quem a matriz deixa consultar, e só em nome próprio (criado_por = auth.uid(); '
  'o gatilho consultas_de_documento_carimbo já o garante, esta é a segunda tranca). '
  'Não há policy de UPDATE nem de DELETE: só inclusão.';

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
  'Lê os links quem a matriz deixa consultar CPF/CNPJ: Administrador, Gestor, Comercial e Financeiro, com conta ativa.';
comment on policy relatorios_compartilhados_inclusao on public.relatorios_compartilhados is
  'Gera link quem a matriz deixa consultar, em nome próprio, e só para consulta que enxerga e da mesma org.';
comment on policy relatorios_compartilhados_revogacao on public.relatorios_compartilhados is
  'Atualiza só para revogar: a linha sai com revogado_em preenchido e revogado_por = auth.uid(). '
  'O privilégio de coluna limita a revogado_em/revogado_por, e o gatilho '
  'relatorios_compartilhados_so_revogar recusa desrevogar. Não há policy de DELETE.';


-- ----------------------------------------------------------------------------
-- 6. A porta da página pública
-- ----------------------------------------------------------------------------
-- A página do link não tem sessão: `anon` não lê nenhuma das duas tabelas, e
-- esta função é a única coisa que ela pode chamar. Recebe o HASH (o servidor
-- da página calcula o sha256 do token da URL), e só abre link que existe, não
-- está revogado e não expirou — contando o acesso no mesmo comando, para que
-- não exista abertura sem contagem. Link ruim de qualquer jeito devolve ZERO
-- linhas, sem dizer qual dos três foi: a página não distingue "expirou" de
-- "nunca existiu" para quem tenta adivinhar.
--
-- `search_path = ''` e tudo qualificado: numa SECURITY DEFINER que `anon`
-- executa, nem `public` nem `pg_temp` decidem o que um nome quer dizer.
create or replace function public.abrir_relatorio_compartilhado(p_token_hash text)
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
     where r.token_hash = pg_catalog.lower(p_token_hash)
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
  'A página pública do link (sem sessão): recebe o sha256 do token e devolve '
  'relatório, tipo de documento, nível e data da consulta, e até quando o link '
  'vale — só se o link existir, não estiver revogado nem expirado; conta o '
  'acesso no mesmo comando. Senão, zero linhas. SECURITY DEFINER, search_path vazio.';

revoke all on function public.abrir_relatorio_compartilhado(text) from public;
grant execute on function public.abrir_relatorio_compartilhado(text) to anon, authenticated, service_role;


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. O efeito cria usuários de sonda (admin,
-- gestor, comercial, financeiro, marketing, sdr, um financeiro desativado),
-- veste a sessão de cada um e tenta ler, incluir, forjar o carimbo, editar,
-- apagar, gerar e revogar link, esticar prazo, desrevogar, abrir link pela
-- porta pública como anon, e violar cada regra — num sub-bloco que termina com
-- um sentinela, e o rollback do sub-bloco leva tudo junto. As variáveis
-- sobrevivem ao rollback, e é por elas que o veredito sai.
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
  v_relatorio     jsonb := '{"titular": {"nome": "ACEITE DOCUMENTO"}, "restricoes": []}'::jsonb;
  v_respostas     jsonb := '{"cpf-lite": {"MIOLO_ACEITE": "renda 9999"}}'::jsonb;
  v_porta         jsonb;
  v_miolo_lido    int := 0;      -- os quatro papéis leem o miolo
  h_valido        text := encode(sha256(convert_to('aceite-documento-valido', 'UTF8')), 'hex');
  h_revogado      text := encode(sha256(convert_to('aceite-documento-revogado', 'UTF8')), 'hex');
  h_expirado      text := encode(sha256(convert_to('aceite-documento-expirado', 'UTF8')), 'hex');
  h_forjado       text := encode(sha256(convert_to('aceite-documento-forjado', 'UTF8')), 'hex');
  h_inexistente   text := encode(sha256(convert_to('aceite-documento-nunca', 'UTF8')), 'hex');
  v_antes_c       bigint;
  v_antes_l       bigint;
  v_depois_c      bigint;
  v_depois_l      bigint;
  v_restou        bigint;
  v_n             bigint;
  v_incluiram     int := 0;      -- admin, gestor, comercial, financeiro
  v_autor_certo   int := 0;
  v_leram         int := 0;
  v_leituras      text := '';
  v_forjou        text := 'não testado';
  v_negados       int := 0;      -- marketing, sdr, desativado, cliente: inclusão
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
  v_fechados      int := 0;      -- revogado, expirado, inexistente, nulo: zero linhas
  v_sem_contar    text := 'não testado';
  v_regras        int := 0;
  v_certas        int := 0;
  v_caso          record;
  v_msg           text;
begin
  -- 1 · As tabelas, com RLS e comentário.
  foreach v_nome in array array['public.consultas_de_documento', 'public.relatorios_compartilhados'] loop
    if not exists (select 1 from pg_class where oid = v_nome::regclass and relrowsecurity) then
      raise exception 'ACEITE FALHOU: % sem RLS', v_nome;
    end if;
    if obj_description(v_nome::regclass, 'pg_class') is null then
      falhas := falhas + 1;
      raise warning 'FALHOU: % sem comentário', v_nome;
    end if;
  end loop;

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
    'consultas_de_documento_titular_ciente'
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

  -- 4 · Privilégio.
  if has_table_privilege('anon', 'public.consultas_de_documento', 'SELECT')
     or has_table_privilege('anon', 'public.consultas_de_documento', 'INSERT')
     or has_table_privilege('anon', 'public.relatorios_compartilhados', 'SELECT')
     or has_table_privilege('anon', 'public.relatorios_compartilhados', 'INSERT')
     or has_any_column_privilege('anon', 'public.relatorios_compartilhados', 'UPDATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon tem privilégio numa das duas tabelas';
  end if;
  if not has_table_privilege('authenticated', 'public.consultas_de_documento', 'SELECT')
     or not has_table_privilege('authenticated', 'public.consultas_de_documento', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.consultas_de_documento', 'UPDATE')
     or has_table_privilege('authenticated', 'public.consultas_de_documento', 'DELETE')
     or has_table_privilege('authenticated', 'public.consultas_de_documento', 'TRUNCATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: na consulta, authenticated deveria ter SELECT e INSERT, e só eles';
  end if;
  if not has_table_privilege('authenticated', 'public.relatorios_compartilhados', 'SELECT')
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
    raise warning 'FALHOU: no link, authenticated deveria ler, incluir e atualizar só revogado_em/revogado_por';
  end if;
  if not has_table_privilege('service_role', 'public.consultas_de_documento', 'INSERT')
     or not has_table_privilege('service_role', 'public.relatorios_compartilhados', 'UPDATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role sem o privilégio das irmãs';
  end if;

  -- 5 · As policies, e nenhuma outra (uma permissiva a mais abriria por OU).
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'consultas_de_documento';
  if v_n <> 2 or (select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies
                   where schemaname = 'public' and tablename = 'consultas_de_documento')
                 <> 'consultas_de_documento_inclusao:INSERT,consultas_de_documento_leitura:SELECT' then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_documento deveria ter só leitura e inclusão (achei %)', v_n;
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

  -- 6 · Os gatilhos: carimbo BEFORE INSERT nas duas; só-revogar BEFORE UPDATE.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.consultas_de_documento'::regclass
                    and tgname = 'consultas_de_documento_carimbo'
                    and tgfoid = 'public.consultas_de_documento_carimbar()'::regprocedure
                    and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 4 = 4 and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger
                     where tgrelid = 'public.relatorios_compartilhados'::regclass
                       and tgname = 'relatorios_compartilhados_carimbo'
                       and tgfoid = 'public.relatorios_compartilhados_carimbar()'::regprocedure
                       and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 4 = 4 and tgenabled <> 'D')
     or not exists (select 1 from pg_trigger
                     where tgrelid = 'public.relatorios_compartilhados'::regclass
                       and tgname = 'relatorios_compartilhados_so_revogar'
                       and tgfoid = 'public.relatorios_compartilhados_so_revogar()'::regprocedure
                       and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 16 = 16 and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: gatilhos de carimbo (BEFORE INSERT) ou de só-revogar (BEFORE UPDATE) ausentes';
  end if;

  -- 7 · A porta pública: DEFINER, search_path vazio, anon e authenticated executam.
  if not exists (select 1 from pg_proc
                  where oid = 'public.abrir_relatorio_compartilhado(text)'::regprocedure
                    and prosecdef and proconfig @> array['search_path=""'])
     or not has_function_privilege('anon', 'public.abrir_relatorio_compartilhado(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.abrir_relatorio_compartilhado(text)', 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: abrir_relatorio_compartilhado não é DEFINER com search_path vazio executável por anon e authenticated';
  end if;

  select count(*) into v_antes_c from public.consultas_de_documento;
  select count(*) into v_antes_l from public.relatorios_compartilhados;

  -- 8 · Efeito. Tudo daqui até o sentinela é desfeito.
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

    -- 8a · anon não lê nem inclui consulta, e não lê link.
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
        (tipo_documento, documento, nivel, produtos, relatorio, finalidade, titular_ciente, criado_por)
      values ('cpf', '00000000191', 'basico', '{cpf-lite}', v_relatorio, 'financiamento', true, gen_random_uuid());
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

    -- 8b · Os quatro papéis da ação incluem, sem informar autor: o carimbo assina.
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'financeiro'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.consultas_de_documento
          (tipo_documento, documento, nivel, produtos, nome, relatorio, respostas, custo, finalidade, titular_ciente)
        values (case when v_papel = 'financeiro' then 'cnpj' else 'cpf' end,
                case when v_papel = 'financeiro' then '12ABC34501DE35' else '00000000191' end,
                case v_papel when 'admin' then 'completo_integral' when 'gestor' then 'credito'
                             when 'comercial' then 'dados' else 'completo_score' end,
                case when v_papel = 'financeiro' then '{cnpj,cadastral-score-pj}'::text[]
                     else '{cpf-lite,receita-federal}'::text[] end, 'ACEITE DOCUMENTO ' || v_papel, v_relatorio, v_respostas, 1.50,
                'financiamento', true)
        returning * into v_linha;
        reset role;
        perform set_config('request.jwt.claims', '', true);
        v_incluiram := v_incluiram + 1;
        if v_papel = 'admin' then v_consulta := v_linha.id; end if;
        if v_linha.criado_por = (v_ids->>v_papel)::uuid
           and v_linha.criado_por_nome = 'Aceite Documento ' || v_papel
           and v_linha.org_id = public.org_padrao()
           and v_linha.criado_em > now() - interval '1 minute' then
          v_autor_certo := v_autor_certo + 1;
        end if;
      exception when insufficient_privilege then null;
      end;
    end loop;

    -- 8c · Cada um dos quatro lê as quatro linhas — a de todos, não só a sua.
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'financeiro'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select count(*) into v_n from public.consultas_de_documento where nome like 'ACEITE DOCUMENTO %';
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

    -- 8d · O carimbo não é de quem chama: autor, nome, hora e org forjados.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.consultas_de_documento
        (tipo_documento, documento, nivel, produtos, nome, relatorio, finalidade, titular_ciente,
         org_id, criado_por, criado_por_nome, criado_em)
      values ('cpf', '00000000272', 'basico', '{cpf-lite}', 'ACEITE DOCUMENTO forjado', v_relatorio,
              'cadastro_de_cliente', true,
              gen_random_uuid(), (v_ids->>'gestor')::uuid, 'Outra Pessoa', now() - interval '30 days')
      returning * into v_linha;
      reset role;
      v_forjou := case
        when v_linha.criado_por      = (v_ids->>'comercial')::uuid
         and v_linha.criado_por_nome = 'Aceite Documento comercial'
         and v_linha.criado_em       > now() - interval '1 minute'
         and v_linha.org_id          = public.org_padrao()
        then 'sobrescrito'
        else format('manteve (por %s, nome %s, em %s, org %s)',
                    v_linha.criado_por, v_linha.criado_por_nome, v_linha.criado_em, v_linha.org_id)
      end;
    exception when insufficient_privilege then v_forjou := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 8e · Sem a declaração do titular, nem o admin registra.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.consultas_de_documento
        (tipo_documento, documento, nivel, produtos, relatorio, finalidade, titular_ciente)
      values ('cpf', '00000000191', 'basico', '{cpf-lite}', v_relatorio, 'financiamento', false);
      reset role;
      v_sem_ciencia := 'incluiu';
    exception when check_violation then
      get stacked diagnostics v_msg = constraint_name;
      v_sem_ciencia := case when v_msg = 'consultas_de_documento_titular_ciente' then 'recusou' else 'recusou por ' || v_msg end;
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 8f · Marketing, SDR, financeiro desativado e cliente: não leem e não incluem.
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
          (tipo_documento, documento, nivel, produtos, relatorio, finalidade, titular_ciente)
        values ('cpf', '00000000191', 'basico', '{cpf-lite}', v_relatorio, 'financiamento', true);
        reset role;
        perform set_config('request.jwt.claims', '', true);
      exception when insufficient_privilege then v_negados := v_negados + 1;
      end;
    end loop;
    perform set_config('request.jwt.claims', '', true);

    -- 8g · Nem o admin edita ou apaga a consulta: 42501, não "0 linhas".
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

    -- 8h · O financeiro gera o link da consulta do admin, forjando autor, hora,
    --      acessos e revogação: entra com o carimbo da sessão, zero acesso e vivo.
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
      returning * into v_link;
      reset role;
      v_valido := v_link.id;
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

    -- 8i · O comercial gera um segundo link (o que vai ser revogado); e não
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

    -- 8j · Um link expirado, gravado pela chave de serviço com data passada.
    insert into public.relatorios_compartilhados
      (consulta_id, token_hash, expira_em, criado_por, criado_em)
    values (v_consulta, h_expirado, now() - interval '1 day',
            (v_ids->>'admin')::uuid, now() - interval '10 days');

    -- 8k · Marketing e SDR não geram nem leem link.
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

    -- 8l · O gestor revoga o link do comercial, forjando quem e quando: sai
    --      revogado, por ele, agora.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'gestor')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.relatorios_compartilhados
         set revogado_em = now() + interval '5 days', revogado_por = (v_ids->>'admin')::uuid
       where id = v_revogavel
      returning * into v_link;
      reset role;
      v_revoga := case
        when v_link.revogado_por = (v_ids->>'gestor')::uuid
         and v_link.revogado_em between now() - interval '1 minute' and now() + interval '1 minute'
        then 'revogou'
        else format('revogou com carimbo forjado (por %s, em %s)', v_link.revogado_por, v_link.revogado_em)
      end;
    exception when insufficient_privilege then v_revoga := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 8m · Esticar o prazo, mexer no contador, desrevogar, revogar de novo e
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

    -- 8n · Nem a chave de serviço desrevoga ou estica o prazo: o gatilho vale para todos.
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

    -- 8o · A porta pública, como anon: o link válido abre (três vezes, e conta
    --      as três); revogado, expirado, inexistente e nulo não devolvem nada.
    begin
      set local role anon;
      select count(*) into v_n from public.abrir_relatorio_compartilhado(h_valido) a
       where a.relatorio = v_relatorio and a.tipo_documento = 'cpf' and a.nivel = 'completo_integral'
         and a.expira_em > now() and a.criado_em > now() - interval '1 minute';
      reset role;
      v_abre := case when v_n = 1 then 'abriu' else 'devolveu ' || v_n end;
      -- A linha inteira que a porta devolve, como anon: o miolo não vem.
      select to_jsonb(a) into v_porta from public.abrir_relatorio_compartilhado(h_valido) a;
      set local role anon;
      perform * from public.abrir_relatorio_compartilhado(upper(h_valido));
      reset role;
    exception when insufficient_privilege then v_abre := 'negado';
    end;
    select acessos || ':' || (ultimo_acesso_em is not null) into v_abre_conta
      from public.relatorios_compartilhados where id = v_valido;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'sdr')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from public.abrir_relatorio_compartilhado(h_valido);
      reset role;
      v_abre_sdr := case when v_n = 1 then 'abriu' else 'devolveu ' || v_n end;
    exception when insufficient_privilege then v_abre_sdr := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    foreach v_nome in array array[h_revogado, h_expirado, h_inexistente, 'nao-e-hash'] loop
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

    -- 8p · Cada regra da consulta, tentando gravar o inválido (sem sessão: só o CHECK fala).
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
          (tipo_documento, documento, nivel, produtos, nome, relatorio, custo, finalidade,
           titular_ciente, criado_por)
        values (v_caso.tipo, v_caso.documento, v_caso.nivel, v_caso.produtos, v_caso.nome,
                v_caso.relatorio, v_caso.custo, v_caso.finalidade, v_caso.ciente, gen_random_uuid());
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_certas := v_certas + 1;
        else raise warning 'regra % recusou por %', v_caso.regra, v_msg;
        end if;
      end;
    end loop;

    -- 8q · Cada regra do link (sem sessão: os valores informados valem).
    for v_caso in
      select * from (values
        ('relatorios_compartilhados_token_e_sha256',     repeat('g', 64), now() + interval '1 day', now(), null::timestamptz, null::uuid, 0, null::timestamptz),
        ('relatorios_compartilhados_token_e_sha256',     upper(h_forjado), now() + interval '1 day', now(), null, null, 0, null),
        ('relatorios_compartilhados_token_e_sha256',     left(h_forjado, 63), now() + interval '1 day', now(), null, null, 0, null),
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
        (tipo_documento, documento, nivel, produtos, relatorio, respostas, finalidade, titular_ciente, criado_por)
      values ('cpf', '00000000191', 'basico', '{cpf-lite}', '{}', '[{"cpf-lite": {}}]', 'financiamento', true,
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
  if v_incluiram <> 4 or v_autor_certo <> 4 then
    falhas := falhas + 1;
    raise warning 'FALHOU: admin, gestor, comercial e financeiro — % de 4 incluíram, % de 4 com carimbo da sessão',
      v_incluiram, v_autor_certo;
  end if;
  if v_leram <> 4 then
    falhas := falhas + 1;
    raise warning 'FALHOU: os quatro papéis deveriam ver as 4 linhas de sonda (%)', v_leituras;
  end if;
  if v_forjou <> 'sobrescrito' then
    falhas := falhas + 1;
    raise warning 'FALHOU: carimbo forjado na consulta: % (esperado: sobrescrito pela sessão)', v_forjou;
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
  -- O link válido foi aberto três vezes como anon antes do sdr (a contagem, a
  -- linha inteira e o hash em maiúsculas): três acessos, e a hora do último.
  if v_abre <> 'abriu' or v_abre_conta is distinct from '3:true' or v_abre_sdr <> 'abriu' then
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
  if v_fechados <> 5 or v_sem_contar is distinct from '0,0' then
    falhas := falhas + 1;
    raise warning 'FALHOU: porta pública — % de 5 links ruins sem linha; acessos de revogado/expirado %', v_fechados, v_sem_contar;
  end if;
  if v_regras < 34 or v_certas <> v_regras then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % de % recusas pela regra certa', v_certas, v_regras;
  end if;

  -- Nada da prova ficou.
  select count(*) into v_depois_c from public.consultas_de_documento;
  select count(*) into v_depois_l from public.relatorios_compartilhados;
  select count(*) into v_restou from auth.users where email like 'aceite-documento-%@exemplo.invalido';
  if v_depois_c <> v_antes_c or v_depois_l <> v_antes_l or v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (consultas % → %, links % → %, % usuário(s))',
      v_antes_c, v_depois_c, v_antes_l, v_depois_l, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em consultas_de_documento / relatorios_compartilhados', falhas;
  end if;

  raise notice
    'Aceite verificado: consultas_de_documento e relatorios_compartilhados existem '
    'com as regras nomeadas, índices, RLS e gatilhos; anon não lê nem inclui e só '
    'abre link pela porta pública; admin, gestor, comercial e financeiro incluem e '
    'leem as consultas de todos, com o carimbo da sessão (autor, nome, hora e org '
    'forjados são sobrescritos); sem a declaração do titular não entra; marketing, '
    'sdr, desativado e cliente não leem nem incluem consulta nem link; ninguém '
    'edita nem apaga consulta (42501); o link nasce com carimbo da sessão, zero '
    'acesso e vivo, só para consulta visível; revogar funciona, carimbado pela '
    'sessão; esticar prazo, mexer no contador, desrevogar, revogar de novo e '
    'apagar são negados, e nem a chave de serviço desrevoga ou estica; '
    'abrir_relatorio_compartilhado devolve o link válido (as cinco colunas, sem '
    'o miolo das respostas, que os quatro papéis leem pela RLS) e conta cada acesso, e '
    'não devolve nada para revogado, expirado, inexistente ou nulo; documento '
    '(CPF 11 dígitos, CNPJ alfanumérico), nível, score só de CNPJ, produtos, nome, relatório, respostas, custo, '
    'finalidade, ciência, hash, prazo, revogação e acessos caem na regra certa; '
    'a prova não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261018120000', 'consultas_de_documento')
  on conflict (version) do nothing;
