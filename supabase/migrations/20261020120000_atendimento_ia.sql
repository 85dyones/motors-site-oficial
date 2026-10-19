-- ============================================================================
-- O atendimento por IA no painel — conversa, aquecimento, entrega e cadência
-- ============================================================================
-- Pedido do dono (2026-10-19), a partir do manobrAI: o assistente atende TODA
-- conversa do WhatsApp pela Evolution API (sem Chatwoot), com o modelo da
-- DeepSeek para baratear; o lead só vai ao vendedor quando esquenta; o resumo
-- vai ao WhatsApp do vendedor; quem não esquentou entra em cadência de
-- reaquecimento; e a conversa, o resumo e o aquecimento aparecem no painel.
-- O desenho inteiro está em `docs/ATENDIMENTO_IA.md`.
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.atendimento_config` — uma linha por loja: ligado/desligado (nasce
--    DESLIGADO), nome do assistente, modelo, se diz preço, a partir de que
--    temperatura avisa o vendedor, quem escolhe o vendedor, limiares, pesos
--    e cadências. Regra é dado (HANDOFF, decisão 3): os números da régua
--    moram aqui, e o código só tem a semente e a rede.
-- 2. `public.atendimento_mensagens` — a conversa do WhatsApp, mensagem por
--    mensagem: o que o cliente escreveu, o que o assistente respondeu, o que
--    o vendedor mandou do painel e os toques da cadência. `wa_id` (o id do
--    WhatsApp) é único por loja: é a idempotência da entrada (o n8n pode
--    entregar o mesmo webhook duas vezes) e o que reconhece o eco da
--    mensagem que o próprio site mandou.
-- 3. `public.atendimento_qualificacoes` — o retrato de cada leitura do
--    modelo: nota, temperatura, motivos, ficha, sinais e os tokens gastos. É
--    a linha do tempo da aba Aquecimento e a base do custo no relatório.
-- 4. Colunas novas em `public.leads` (o estado ATUAL, que o card e a fila
--    leem sem juntar tabela): `aquecimento`, `temperatura`, `qualificacao`,
--    `resumo_ia`/`resumo_ia_em`, `assistente_fase`, `entregue_em`/
--    `entregue_motivo`, `aviso_de_entrega_em`/`aviso_de_entrega_para`,
--    `entrega_confirmada_em`, `cadencia`/`cadencia_passo`/
--    `cadencia_proximo_em`, `optout_em` e `origem_conversa`.
-- 5. `registrar_contato_do_lead` passa a tirar de "Novo" também o canal
--    `evolution` — a resposta de GENTE pelo número da loja (painel ou
--    celular), o equivalente do `chatwoot` de 2026-10-14. Mensagem do
--    assistente nunca chama a função: robô não atende (WEBHOOKS_N8N.md).
--
-- ---------------------------------------------------------------------------
-- Onde mora o estado do assistente, e por que não muda
-- ---------------------------------------------------------------------------
-- Quem pausa o SLA do funil continua sendo `atendimentos.com_assistente` e
-- `humano_assumiu_em` (20260916150000). O atendimento por IA escreve ali
-- também: cria uma linha de `atendimentos` por conversa (sem id do
-- Chatwoot, que é nulável) e liga `com_assistente` enquanto o assistente
-- qualifica. Na entrega, desliga e carimba `humano_assumiu_em`: o relógio do
-- vendedor começa nesse instante, como o dono decidiu em 05/09. Nenhuma
-- linha de `montar_fila_do_funil` muda.
--
-- `assistente_fase` em `leads` é outra coisa: é o que o PAINEL mostra e o que
-- a cadência lê (qualificando, entregue, pausado, reaquecendo). O SLA não a
-- lê — uma régua só para o relógio.
--
-- ---------------------------------------------------------------------------
-- Quem lê
-- ---------------------------------------------------------------------------
-- As três tabelas novas leem-se pela equipe, da loja, e — nas duas que têm
-- `lead_id` — só do lead que a pessoa já enxerga: a policy pergunta
-- `exists (select 1 from leads where id = lead_id)`, e essa subconsulta passa
-- pela RLS de `leads` (escopo por papel, 20261003130000). O Comercial lê a
-- conversa dos leads dele; Marketing e Financeiro, nenhuma.
--
-- Ninguém escreve pela sessão: quem grava é o servidor (`/api/atendimento/*`
-- e `/api/leads/[id]/conversa`), com a chave de serviço, depois de conferir
-- sessão e escopo. É a régua de `atendimentos` e de `leads` (o INSERT nunca
-- teve policy).
--
-- ---------------------------------------------------------------------------
-- LGPD
-- ---------------------------------------------------------------------------
-- A conversa é dado pessoal. `on delete cascade` nas duas tabelas com
-- `lead_id`: o pedido de eliminação do titular (art. 18, VI), que já apaga o
-- lead, leva a conversa e os retratos junto. O opt-out (`optout_em`) é o
-- pedido de parar de receber mensagem: a cadência não toca, o assistente
-- não volta sozinho.
--
-- ---------------------------------------------------------------------------
-- As regras
-- ---------------------------------------------------------------------------
--   atendimento_config_uma_por_loja ............ UNIQUE (org_id)
--   atendimento_config_avisar_valido ........... morno ou quente
--   atendimento_config_distribuicao_valida ..... administrador ou rodizio
--   atendimento_config_limiares_coerentes ...... 1 ≤ morno < quente ≤ 100
--   atendimento_config_nome_valido ............. 1 a 40 caracteres
--   atendimento_config_pesos_e_objeto .......... jsonb objeto
--   atendimento_config_cadencias_e_objeto ...... jsonb objeto
--   atendimento_config_regras_no_teto .......... até 4000 caracteres
--
--   atendimento_mensagens_quem_fala_coerente ... entrada só do cliente; saída
--                                                do assistente, vendedor ou
--                                                sistema
--   atendimento_mensagens_situacao_valida ...... entrada: recebida; saída:
--                                                pendente, enviada ou falhou
--   atendimento_mensagens_conteudo_valido ...... texto, audio, imagem, video,
--                                                documento, figurinha,
--                                                localizacao, contato, outro
--   atendimento_mensagens_gatilho_valido ....... entrada: nulo; saída: nulo,
--                                                resposta, passagem, cadencia,
--                                                painel ou celular
--   atendimento_mensagens_wa_id_unico .......... índice único (org_id, wa_id)
--
--   atendimento_qualificacoes_aquecimento_na_faixa  0 a 100
--   atendimento_qualificacoes_temperatura_valida .. frio, morno, quente
--   atendimento_qualificacoes_origem_valida ....... conversa, cadencia, painel
--   atendimento_qualificacoes_formas .............. motivos lista; ficha e
--                                                   sinais objeto; tokens ≥ 0
--
--   leads_aquecimento_na_faixa ................. nulo ou 0 a 100
--   leads_temperatura_valida ................... nulo, frio, morno, quente
--   leads_qualificacao_e_objeto ................ nulo ou objeto
--   leads_assistente_fase_valida ............... nulo, qualificando,
--                                                entregue, pausado, reaquecendo
--   leads_entregue_motivo_valido ............... nulo, quente, pediu_humano,
--                                                pediu_condicao, painel
--   leads_cadencia_valida ...................... nulo, follow_up, reativacao,
--                                                engajamento
--   leads_cadencia_passo_valido ................ 0 a 10
--   leads_origem_conversa_e_objeto ............. nulo ou objeto
--
-- ⚠️ DESFAZER (nada fora deste arquivo depende destes objetos; as colunas
-- em `leads` ficam — remover coluna em uso é DROP proibido na janela de
-- convivência, e elas são nuláveis e inertes sem o código):
--
--   begin;
--   drop table if exists public.atendimento_qualificacoes;
--   drop table if exists public.atendimento_mensagens;
--   drop table if exists public.atendimento_config;
--   -- e reaplicar a função de 20261014120000_resposta_no_chatwoot_tira_do_novo.sql
--   delete from supabase_migrations.schema_migrations where version = '20261020120000';
--   commit;
--
-- Aditiva e idempotente: `create table if not exists`, `add column if not
-- exists`, `create index if not exists`, constraints só se ausentes,
-- `drop policy if exists` + `create policy`, semente só se a loja não tiver
-- linha. `estoque_motors` não é tocada.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
begin
  if to_regclass('public.leads') is null then
    raise exception 'PRÉVIA: public.leads não existe';
  end if;
  if to_regclass('public.atendimentos') is null then
    raise exception 'PRÉVIA: public.atendimentos não existe';
  end if;
  if to_regprocedure('public.org_padrao()') is null then
    raise exception 'PRÉVIA: public.org_padrao() não existe (F0)';
  end if;
  if to_regprocedure('public.is_staff(uuid)') is null then
    raise exception 'PRÉVIA: public.is_staff(uuid) não existe';
  end if;
  if to_regprocedure('public.escopo_de_leads()') is null then
    raise exception 'PRÉVIA: public.escopo_de_leads() não existe (20261003130000)';
  end if;
end
$previa$;


-- ----------------------------------------------------------------------------
-- 1. A configuração
-- ----------------------------------------------------------------------------
create table if not exists public.atendimento_config (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null default public.org_padrao(),
  ativo              boolean not null default false,
  nome_do_assistente text not null default 'Ney',
  modelo             text not null default 'deepseek-flash',
  informar_preco     boolean not null default false,
  avisar_a_partir    text not null default 'quente',
  distribuicao       text not null default 'administrador',
  limiar_morno       integer not null default 35,
  limiar_quente      integer not null default 65,
  -- Vazio = os pesos e as cadências de fábrica do código. O validador da
  -- leitura mistura o que houver aqui por cima deles, campo a campo.
  pesos              jsonb not null default '{}'::jsonb,
  regras_da_loja     text not null default '',
  cadencias          jsonb not null default '{}'::jsonb,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     text,
  constraint atendimento_config_uma_por_loja unique (org_id),
  constraint atendimento_config_avisar_valido check (avisar_a_partir in ('morno', 'quente')),
  constraint atendimento_config_distribuicao_valida check (distribuicao in ('administrador', 'rodizio')),
  constraint atendimento_config_limiares_coerentes check (
    limiar_morno >= 1 and limiar_quente <= 100 and limiar_morno < limiar_quente
  ),
  constraint atendimento_config_nome_valido check (length(btrim(nome_do_assistente)) between 1 and 40),
  constraint atendimento_config_pesos_e_objeto check (jsonb_typeof(pesos) = 'object'),
  constraint atendimento_config_cadencias_e_objeto check (jsonb_typeof(cadencias) = 'object'),
  constraint atendimento_config_regras_no_teto check (length(regras_da_loja) <= 4000)
);

comment on table public.atendimento_config is
  'A configuração do assistente de atendimento por IA (2026-10-20), uma linha por loja. '
  'Nasce DESLIGADA: ligar é mandar mensagem a cliente de verdade, decisão do dono na '
  'tela Leads → Atendimento IA. Pesos e cadências vazios = os de fábrica do código.';

alter table public.atendimento_config enable row level security;

drop policy if exists atendimento_config_leitura_staff on public.atendimento_config;
create policy atendimento_config_leitura_staff on public.atendimento_config
  for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

revoke all on public.atendimento_config from anon;
revoke insert, update, delete, truncate on public.atendimento_config from authenticated;
grant select on public.atendimento_config to authenticated;
grant all on public.atendimento_config to service_role;

insert into public.atendimento_config (org_id)
select public.org_padrao()
 where not exists (select 1 from public.atendimento_config where org_id = public.org_padrao());


-- ----------------------------------------------------------------------------
-- 2. A conversa
-- ----------------------------------------------------------------------------
create table if not exists public.atendimento_mensagens (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  lead_id        uuid not null references public.leads (id) on delete cascade,
  atendimento_id uuid references public.atendimentos (id) on delete set null,
  telefone       text not null,
  direcao        text not null,
  autor          text not null,
  autor_nome     text,
  conteudo       text not null default 'texto',
  texto          text,
  wa_id          text,
  situacao       text not null,
  -- Só na SAÍDA: o que fez a mensagem sair. É o que separa, no relatório, a
  -- resposta do assistente do toque de cadência (e mede quem foi reaquecido).
  gatilho        text,
  erro           text,
  -- Só na ENTRADA: quando o assistente pegou esta mensagem para responder. É
  -- a trava contra resposta dobrada — o `update … where respondida_em is
  -- null` só acerta uma vez.
  respondida_em  timestamptz,
  criado_em      timestamptz not null default now(),
  constraint atendimento_mensagens_quem_fala_coerente check (
       (direcao = 'entrada' and autor = 'cliente')
    or (direcao = 'saida'   and autor in ('assistente', 'vendedor', 'sistema'))
  ),
  constraint atendimento_mensagens_situacao_valida check (
       (direcao = 'entrada' and situacao = 'recebida')
    or (direcao = 'saida'   and situacao in ('pendente', 'enviada', 'falhou'))
  ),
  constraint atendimento_mensagens_conteudo_valido check (
    conteudo in ('texto', 'audio', 'imagem', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'outro')
  ),
  constraint atendimento_mensagens_telefone_em_digitos check (telefone ~ '^[0-9]{10,15}$'),
  constraint atendimento_mensagens_gatilho_valido check (
       (direcao = 'entrada' and gatilho is null)
    or (direcao = 'saida' and (gatilho is null or gatilho in ('resposta', 'passagem', 'cadencia', 'painel', 'celular')))
  )
);

create unique index if not exists atendimento_mensagens_wa_id_unico
  on public.atendimento_mensagens (org_id, wa_id) where wa_id is not null;
create index if not exists atendimento_mensagens_por_lead
  on public.atendimento_mensagens (lead_id, criado_em desc);
create index if not exists atendimento_mensagens_por_telefone
  on public.atendimento_mensagens (telefone, criado_em desc);

comment on table public.atendimento_mensagens is
  'A conversa do WhatsApp pela Evolution (2026-10-20): cliente, assistente, vendedor pelo '
  'painel e cadência. Escrita só pelo servidor (chave de serviço). Lida pela equipe, e só '
  'do lead que a pessoa já enxerga (a policy pergunta a leads, que tem RLS por escopo).';

alter table public.atendimento_mensagens enable row level security;

drop policy if exists atendimento_mensagens_leitura_por_escopo on public.atendimento_mensagens;
create policy atendimento_mensagens_leitura_por_escopo on public.atendimento_mensagens
  for select to authenticated
  using (
        public.is_staff(auth.uid())
    and org_id = public.org_padrao()
    and exists (select 1 from public.leads l where l.id = atendimento_mensagens.lead_id)
  );

revoke all on public.atendimento_mensagens from anon;
revoke insert, update, delete, truncate on public.atendimento_mensagens from authenticated;
grant select on public.atendimento_mensagens to authenticated;
grant all on public.atendimento_mensagens to service_role;


-- ----------------------------------------------------------------------------
-- 3. Os retratos do aquecimento
-- ----------------------------------------------------------------------------
create table if not exists public.atendimento_qualificacoes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  lead_id        uuid not null references public.leads (id) on delete cascade,
  aquecimento    integer not null,
  temperatura    text not null,
  motivos        jsonb not null default '[]'::jsonb,
  ficha          jsonb not null default '{}'::jsonb,
  sinais         jsonb not null default '{}'::jsonb,
  origem         text not null default 'conversa',
  modelo         text,
  tokens_entrada integer not null default 0,
  tokens_cache   integer not null default 0,
  tokens_saida   integer not null default 0,
  criado_em      timestamptz not null default now(),
  constraint atendimento_qualificacoes_aquecimento_na_faixa check (aquecimento between 0 and 100),
  constraint atendimento_qualificacoes_temperatura_valida check (temperatura in ('frio', 'morno', 'quente')),
  constraint atendimento_qualificacoes_origem_valida check (origem in ('conversa', 'cadencia', 'painel')),
  constraint atendimento_qualificacoes_formas check (
        jsonb_typeof(motivos) = 'array'
    and jsonb_typeof(ficha) = 'object'
    and jsonb_typeof(sinais) = 'object'
    and tokens_entrada >= 0 and tokens_cache >= 0 and tokens_saida >= 0
    and tokens_cache <= tokens_entrada
  )
);

create index if not exists atendimento_qualificacoes_por_lead
  on public.atendimento_qualificacoes (lead_id, criado_em desc);
create index if not exists atendimento_qualificacoes_por_data
  on public.atendimento_qualificacoes (org_id, criado_em desc);

comment on table public.atendimento_qualificacoes is
  'Cada leitura do modelo (2026-10-20): nota, temperatura, motivos, ficha, sinais e tokens. '
  'Linha do tempo da aba Aquecimento e base da estimativa de custo. Mesma leitura por escopo '
  'de atendimento_mensagens.';

alter table public.atendimento_qualificacoes enable row level security;

drop policy if exists atendimento_qualificacoes_leitura_por_escopo on public.atendimento_qualificacoes;
create policy atendimento_qualificacoes_leitura_por_escopo on public.atendimento_qualificacoes
  for select to authenticated
  using (
        public.is_staff(auth.uid())
    and org_id = public.org_padrao()
    and exists (select 1 from public.leads l where l.id = atendimento_qualificacoes.lead_id)
  );

revoke all on public.atendimento_qualificacoes from anon;
revoke insert, update, delete, truncate on public.atendimento_qualificacoes from authenticated;
grant select on public.atendimento_qualificacoes to authenticated;
grant all on public.atendimento_qualificacoes to service_role;


-- ----------------------------------------------------------------------------
-- 4. O estado atual, no lead
-- ----------------------------------------------------------------------------
alter table public.leads add column if not exists aquecimento           integer;
alter table public.leads add column if not exists temperatura           text;
alter table public.leads add column if not exists qualificacao          jsonb;
alter table public.leads add column if not exists resumo_ia             text;
alter table public.leads add column if not exists resumo_ia_em          timestamptz;
alter table public.leads add column if not exists assistente_fase       text;
alter table public.leads add column if not exists entregue_em           timestamptz;
alter table public.leads add column if not exists entregue_motivo       text;
alter table public.leads add column if not exists aviso_de_entrega_em   timestamptz;
alter table public.leads add column if not exists aviso_de_entrega_para text;
alter table public.leads add column if not exists entrega_confirmada_em timestamptz;
alter table public.leads add column if not exists cadencia              text;
alter table public.leads add column if not exists cadencia_passo        integer not null default 0;
alter table public.leads add column if not exists cadencia_proximo_em   timestamptz;
alter table public.leads add column if not exists optout_em             timestamptz;
alter table public.leads add column if not exists origem_conversa       jsonb;

do $regras$
declare
  v_regra record;
begin
  for v_regra in
    select * from (values
      ('leads_aquecimento_na_faixa',     'check (aquecimento is null or aquecimento between 0 and 100)'),
      ('leads_temperatura_valida',       'check (temperatura is null or temperatura in (''frio'', ''morno'', ''quente''))'),
      ('leads_qualificacao_e_objeto',    'check (qualificacao is null or jsonb_typeof(qualificacao) = ''object'')'),
      ('leads_assistente_fase_valida',   'check (assistente_fase is null or assistente_fase in (''qualificando'', ''entregue'', ''pausado'', ''reaquecendo''))'),
      ('leads_entregue_motivo_valido',   'check (entregue_motivo is null or entregue_motivo in (''quente'', ''pediu_humano'', ''pediu_condicao'', ''painel''))'),
      ('leads_cadencia_valida',          'check (cadencia is null or cadencia in (''follow_up'', ''reativacao'', ''engajamento''))'),
      ('leads_cadencia_passo_valido',    'check (cadencia_passo between 0 and 10)'),
      ('leads_origem_conversa_e_objeto', 'check (origem_conversa is null or jsonb_typeof(origem_conversa) = ''object'')')
    ) as r(nome, definicao)
  loop
    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.leads'::regclass and conname = v_regra.nome
    ) then
      execute format('alter table public.leads add constraint %I %s', v_regra.nome, v_regra.definicao);
    end if;
  end loop;
end
$regras$;

-- A fila das cadências: só os leads com toque marcado. Parcial porque quase
-- todo lead não tem cadência nenhuma.
create index if not exists leads_cadencia_a_vencer
  on public.leads (cadencia_proximo_em)
  where cadencia_proximo_em is not null and desfecho is null;

-- As entregas cujo aviso ainda não chegou a quem deve (o dono escolhido
-- depois, ou o aviso que esperou o horário).
create index if not exists leads_entregues_pelo_assistente
  on public.leads (entregue_em desc)
  where assistente_fase = 'entregue';

comment on column public.leads.aquecimento is
  'Nota de 0 a 100 do assistente (2026-10-20), calculada pelos pesos de atendimento_config '
  'sobre a ficha que o cliente disse — nunca um número do modelo. Nulo: o assistente não leu.';
comment on column public.leads.assistente_fase is
  'Onde o lead está para o assistente: qualificando, entregue (ao vendedor), pausado (gente '
  'assumiu ou alguém pausou) ou reaquecendo (devolvido, em engajamento). Não pausa o SLA: '
  'quem pausa é atendimentos.com_assistente.';
comment on column public.leads.aviso_de_entrega_para is
  'A quem o resumo da entrega já foi: o nome do responsável, ou administrador quando foi a '
  'quem distribui. Diferente do responsável atual = o resumo ainda precisa sair.';
comment on column public.leads.optout_em is
  'O cliente pediu para não receber mais mensagens. A cadência não toca; o assistente não '
  'volta sozinho.';


-- ----------------------------------------------------------------------------
-- 5. Resposta de gente pela Evolution também tira de "Novo"
-- ----------------------------------------------------------------------------
-- O corpo é o de 20261014120000, com uma mudança: o canal `evolution` move de
-- "Novo" para "Em contato" como o `chatwoot`. É a resposta HUMANA pelo número
-- da loja — o vendedor escrevendo no painel, ou no celular da loja. O
-- assistente nunca chama esta função.
create or replace function public.registrar_contato_do_lead(
  p_lead  uuid,
  p_canal text default 'whatsapp',
  p_autor text default null
)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_agora    timestamptz := now();
  v_servico  boolean := coalesce(auth.role(), '') = 'service_role';
begin
  -- A chave de serviço é o webhook do Chatwoot, o n8n e o atendimento pela
  -- Evolution. Ela não vem de navegador: quem a tem já escreve em `leads`
  -- direto, então reconhecê-la aqui não amplia acesso nenhum.
  if not (v_servico or public.is_staff(auth.uid())) then
    raise exception 'Registrar contato é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.leads l
     set ultimo_contato_em = v_agora,
         -- Atendeu: a cobrança de hoje deixa de valer.
         alertado_em       = null,
         -- 2026-10-14: respondeu pelo Chatwoot, o lead não é mais "Novo".
         -- 2026-10-20: respondeu pela Evolution (painel ou celular da loja),
         -- idem. O clique no WhatsApp do card abre a conversa, não prova que
         -- ela aconteceu — não move. E só se a etapa "Em contato" existir e
         -- estiver ativa: as etapas são editáveis no painel.
         situacao = case
           when p_canal in ('chatwoot', 'evolution')
                and l.situacao = 'novo'
                and exists (select 1 from public.funil_etapas e
                             where e.chave = 'em_contato' and e.tipo = 'aberta' and e.ativa)
             then 'em_contato'
           else l.situacao
         end
   where id = p_lead;

  if not found then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  insert into public.leads_eventos (lead_id, tipo, para, autor, automatico, detalhe)
  values (
    p_lead, 'contato', p_canal,
    coalesce(nullif(trim(p_autor), ''), public.autor_atual()),
    false,
    jsonb_build_object('canal', p_canal, 'via_servico', v_servico)
  );

  return v_agora;
end $$;

comment on function public.registrar_contato_do_lead(uuid, text, text) is
  'Marca que alguém falou com o lead (2026-08-28; aberta ao integrador em '
  '2026-09-15). Reinicia o relógio da estagnação e deixa a linha no rastro. '
  'A resposta pelo Chatwoot (canal chatwoot, 2026-10-14) e pela Evolution — '
  'gente no painel ou no celular da loja (canal evolution, 2026-10-20) — '
  'também tira o lead de "Novo" e o põe em "Em contato".';

revoke all on function public.registrar_contato_do_lead(uuid, text, text) from public, anon;
grant execute on function public.registrar_contato_do_lead(uuid, text, text)
  to authenticated, service_role;


-- ============================================================================
-- Aceite — prova o efeito, não o nome
-- ============================================================================
do $aceite$
declare
  falhas   int := 0;
  v_falhou text[] := '{}';
  u        jsonb := '{}'::jsonb;
  v_id     uuid;
  q        text;
  l_a      uuid;
  l_b      uuid;
  v_n      int;
  v_res    text;
  v_etapa  text;
  v_caso   record;
  v_casos  jsonb;
begin
  -- 1. RLS ligada e só leitura para a sessão --------------------------------
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('atendimento_config', 'atendimento_mensagens', 'atendimento_qualificacoes')
       and not c.relrowsecurity
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: alguma tabela nova está sem RLS';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('atendimento_config', 'atendimento_mensagens', 'atendimento_qualificacoes')
       and cmd <> 'SELECT'
  ) then
    falhas := falhas + 1;
    raise warning 'FALHOU: apareceu policy de escrita numa tabela do atendimento';
  end if;

  -- 2. A semente: uma linha da loja, desligada -------------------------------
  select count(*) into v_n from public.atendimento_config where org_id = public.org_padrao() and not ativo;
  if v_n <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a configuração da loja deveria nascer uma só e desligada (veio %)', v_n;
  end if;

  -- 3. As regras recusam o inválido -------------------------------------------
  for v_caso in
    select * from (values
      ('limiar morno >= quente', 'update public.atendimento_config set limiar_morno = 70, limiar_quente = 60 where org_id = public.org_padrao()'),
      ('avisar a partir de frio', 'update public.atendimento_config set avisar_a_partir = ''frio'' where org_id = public.org_padrao()'),
      ('segunda config da loja', 'insert into public.atendimento_config (org_id) values (public.org_padrao())'),
      ('aquecimento 101', 'insert into public.leads (nome, telefone, aquecimento) values (''Aceite IA'', ''5541900002001'', 101)'),
      ('temperatura inventada', 'insert into public.leads (nome, telefone, temperatura) values (''Aceite IA'', ''5541900002002'', ''fervendo'')'),
      ('fase inventada', 'insert into public.leads (nome, telefone, assistente_fase) values (''Aceite IA'', ''5541900002003'', ''dormindo'')'),
      ('cadência inventada', 'insert into public.leads (nome, telefone, cadencia) values (''Aceite IA'', ''5541900002004'', ''spam'')')
    ) as c(rotulo, comando)
  loop
    begin
      execute v_caso.comando;
      falhas := falhas + 1;
      raise warning 'FALHOU: aceitou %', v_caso.rotulo;
    exception when check_violation or unique_violation then
      null; -- é o esperado
    end;
  end loop;

  -- 4. Efeito — tudo daqui até o sentinela é desfeito -------------------------
  begin
    foreach q in array array['admin', 'coma', 'comb', 'mkt'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'aceite-atendimento-' || q || '@exemplo.invalido', now(), now())
      returning id into v_id;
      u := u || jsonb_build_object(q, v_id);
    end loop;
    update public.profiles set full_name = 'Aceite IA Admin', papeis = array['admin'], role = 'admin', is_active = true
     where id = (u->>'admin')::uuid;
    update public.profiles set full_name = 'Aceite IA Vendedor A', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'coma')::uuid;
    update public.profiles set full_name = 'Aceite IA Vendedor B', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'comb')::uuid;
    update public.profiles set full_name = 'Aceite IA Marketing', papeis = array['marketing'], role = 'marketing', is_active = true
     where id = (u->>'mkt')::uuid;

    insert into public.leads (nome, telefone, responsavel, situacao)
    values ('Aceite IA Lead A', '5541900002010', 'Aceite IA Vendedor A', 'novo') returning id into l_a;
    insert into public.leads (nome, telefone, responsavel)
    values ('Aceite IA Lead B', '5541900002011', 'Aceite IA Vendedor B') returning id into l_b;

    insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, texto, wa_id, situacao)
    values (l_a, '5541900002010', 'entrada', 'cliente', 'oi, quero o onix', 'ACEITE-WA-1', 'recebida'),
           (l_b, '5541900002011', 'entrada', 'cliente', 'tem hb20?', 'ACEITE-WA-2', 'recebida');
    insert into public.atendimento_qualificacoes (lead_id, aquecimento, temperatura)
    values (l_a, 20, 'frio'), (l_b, 70, 'quente');

    -- A idempotência da entrada: o mesmo wa_id duas vezes não entra.
    begin
      insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, texto, wa_id, situacao)
      values (l_a, '5541900002010', 'entrada', 'cliente', 'oi, quero o onix', 'ACEITE-WA-1', 'recebida');
      v_falhou := v_falhou || 'aceitou o mesmo wa_id duas vezes'::text;
    exception when unique_violation then
      null;
    end;

    -- Quem fala e como: cliente não "sai", assistente não "entra".
    begin
      insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, texto, situacao)
      values (l_a, '5541900002010', 'saida', 'cliente', 'x', 'enviada');
      v_falhou := v_falhou || 'aceitou saída do cliente'::text;
    exception when check_violation then
      null;
    end;

    v_casos := jsonb_build_array(
      jsonb_build_array('admin lê as duas conversas',      'admin', 'select count(*) from public.atendimento_mensagens where lead_id in ({a}, {b})', 'vê:2'),
      jsonb_build_array('vendedor A lê só a dele',         'coma',  'select count(*) from public.atendimento_mensagens where lead_id in ({a}, {b})', 'vê:1'),
      jsonb_build_array('…e é a do lead A',                'coma',  'select count(*) from public.atendimento_mensagens where lead_id = {a}', 'vê:1'),
      jsonb_build_array('vendedor B não lê a do A',        'comb',  'select count(*) from public.atendimento_mensagens where lead_id = {a}', 'vê:0'),
      jsonb_build_array('marketing não lê conversa',       'mkt',   'select count(*) from public.atendimento_mensagens where lead_id in ({a}, {b})', 'vê:0'),
      jsonb_build_array('anônimo não lê conversa',         '@anon', 'select count(*) from public.atendimento_mensagens', 'vê:0|barrado'),
      jsonb_build_array('vendedor A lê só o retrato dele', 'coma',  'select count(*) from public.atendimento_qualificacoes where lead_id in ({a}, {b})', 'vê:1'),
      jsonb_build_array('marketing não lê retrato',        'mkt',   'select count(*) from public.atendimento_qualificacoes where lead_id in ({a}, {b})', 'vê:0'),
      jsonb_build_array('equipe lê a configuração',        'coma',  'select count(*) from public.atendimento_config', 'vê:1'),
      jsonb_build_array('anônimo não lê a configuração',   '@anon', 'select count(*) from public.atendimento_config', 'vê:0|barrado'),
      jsonb_build_array('ninguém logado grava mensagem',   'admin', 'insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, texto, situacao) values ({a}, ''5541900002010'', ''saida'', ''vendedor'', ''x'', ''enviada'')', 'barrado'),
      jsonb_build_array('ninguém logado liga o assistente','admin', 'update public.atendimento_config set ativo = true', 'barrado|linhas:0')
    );

    for v_caso in
      select c.caso->>0 as rotulo, c.caso->>1 as quem, c.caso->>2 as comando, c.caso->>3 as esperado
        from jsonb_array_elements(v_casos) with ordinality as c(caso, ordem)
       order by c.ordem
    loop
      q := replace(replace(v_caso.comando, '{a}', format('%L::uuid', l_a)), '{b}', format('%L::uuid', l_b));
      if left(v_caso.quem, 1) = '@' then
        perform set_config('request.jwt.claims', json_build_object('role', substr(v_caso.quem, 2))::text, true);
        execute format('set local role %I', substr(v_caso.quem, 2));
      else
        perform set_config('request.jwt.claims',
                           json_build_object('sub', u->>v_caso.quem, 'role', 'authenticated')::text, true);
        set local role authenticated;
      end if;
      begin
        if q like 'select %' then
          execute q into v_n;
          v_res := 'vê:' || v_n;
        else
          execute q;
          get diagnostics v_n = row_count;
          v_res := 'linhas:' || v_n;
        end if;
      exception when insufficient_privilege then
        v_res := 'barrado';
      end;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      if not (v_res = any (string_to_array(v_caso.esperado, '|'))) then
        v_falhou := v_falhou || format('%s: esperava %s, veio %s', v_caso.rotulo, v_caso.esperado, v_res);
      end if;
    end loop;

    -- A resposta de gente pela Evolution tira de "Novo", vestindo o serviço.
    set local role service_role;
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    perform public.registrar_contato_do_lead(l_a, 'evolution', 'Aceite IA Vendedor A');
    perform set_config('request.jwt.claims', '', true);
    reset role;
    select situacao into v_etapa from public.leads where id = l_a;
    if v_etapa is distinct from 'em_contato' then
      v_falhou := v_falhou || format('resposta pela Evolution deixou o lead em %s', v_etapa);
    end if;

    -- Eliminar o lead leva a conversa e os retratos (LGPD, art. 18, VI).
    delete from public.leads where id = l_b;
    select count(*) into v_n from public.atendimento_mensagens where lead_id = l_b;
    if v_n <> 0 then v_falhou := v_falhou || 'apagar o lead não levou a conversa'::text; end if;
    select count(*) into v_n from public.atendimento_qualificacoes where lead_id = l_b;
    if v_n <> 0 then v_falhou := v_falhou || 'apagar o lead não levou os retratos'::text; end if;

    raise exception 'SENTINELA_DO_ACEITE';
  exception
    when others then
      if sqlerrm <> 'SENTINELA_DO_ACEITE' then
        reset role;
        perform set_config('request.jwt.claims', '', true);
        v_falhou := v_falhou || format('o bloco de efeito estourou: %s', sqlerrm);
      end if;
  end;

  if array_length(v_falhou, 1) > 0 then
    falhas := falhas + array_length(v_falhou, 1);
    for i in 1..array_length(v_falhou, 1) loop
      raise warning 'FALHOU: %', v_falhou[i];
    end loop;
  end if;

  -- O efeito foi desfeito: nada do aceite ficou.
  if exists (select 1 from public.leads where nome like 'Aceite IA%')
     or exists (select 1 from public.atendimento_mensagens where wa_id like 'ACEITE-WA-%') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o aceite deixou linha para trás';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % verificação(ões) do atendimento IA', falhas;
  end if;
  raise notice 'Aceite verificado: atendimento IA — RLS por escopo, regras, idempotência, cascata e contato pela Evolution.';
end
$aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261020120000', 'atendimento_ia')
  on conflict (version) do nothing;
