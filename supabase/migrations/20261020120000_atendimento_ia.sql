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
-- 5. `leads_estado_do_assistente_so_servidor` — a sessão não muda essas
--    colunas (opt-out, cadência, entrega, aquecimento); só o servidor.
-- 6. `achar_ou_criar_lead_do_whatsapp(...)` — o lead aberto da conversa, ou um
--    novo, sob trava consultiva por telefone: a rajada de um número novo não
--    cria dois leads. Garante o atendimento pela Evolution, herdando as
--    etiquetas do anterior. Só a chave de serviço.
-- 7. `registrar_contato_do_lead` passa a tirar de "Novo" também o canal
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
--   drop trigger  if exists leads_estado_do_assistente_so_servidor on public.leads;
--   drop function if exists public.leads_estado_do_assistente_so_servidor();
--   drop function if exists public.achar_ou_criar_lead_do_whatsapp(text[], text, text, jsonb, text);
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
-- A trava da resposta, POR LEAD: só uma execução do assistente escreve para
-- o cliente de cada vez. Vale 90 s; depois disso, a próxima assume (a função
-- que segurava morreu no meio).
alter table public.leads add column if not exists respondendo_desde     timestamptz;

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
-- 4b. O estado do assistente só muda pelo servidor
-- ----------------------------------------------------------------------------
-- `leads` aceita UPDATE da sessão pelo escopo (20261003130000), sem guarda de
-- coluna. Sem esta trava, um Comercial mudaria pelo PostgREST o que o
-- servidor decide: zeraria o opt-out do cliente (LGPD), poria um lead em
-- cadência para a rodada escrever a quem quisesse pelo número da loja, ou
-- forjaria a confirmação da entrega que vira métrica da equipe. Quem muda
-- estas colunas é o servidor, com a chave de serviço (`auth.uid()` nulo).
create or replace function public.leads_estado_do_assistente_so_servidor()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role' and (
       new.aquecimento           is distinct from old.aquecimento
    or new.temperatura           is distinct from old.temperatura
    or new.qualificacao          is distinct from old.qualificacao
    or new.resumo_ia             is distinct from old.resumo_ia
    or new.resumo_ia_em          is distinct from old.resumo_ia_em
    or new.assistente_fase       is distinct from old.assistente_fase
    or new.entregue_em           is distinct from old.entregue_em
    or new.entregue_motivo       is distinct from old.entregue_motivo
    or new.aviso_de_entrega_em   is distinct from old.aviso_de_entrega_em
    or new.aviso_de_entrega_para is distinct from old.aviso_de_entrega_para
    or new.entrega_confirmada_em is distinct from old.entrega_confirmada_em
    or new.cadencia              is distinct from old.cadencia
    or new.cadencia_passo        is distinct from old.cadencia_passo
    or new.cadencia_proximo_em   is distinct from old.cadencia_proximo_em
    or new.optout_em             is distinct from old.optout_em
    or new.origem_conversa       is distinct from old.origem_conversa
    or new.respondendo_desde     is distinct from old.respondendo_desde
  ) then
    raise exception 'O estado do assistente só muda pelo servidor.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists leads_estado_do_assistente_so_servidor on public.leads;
create trigger leads_estado_do_assistente_so_servidor
  before update on public.leads
  for each row execute function public.leads_estado_do_assistente_so_servidor();

comment on function public.leads_estado_do_assistente_so_servidor() is
  'A sessão (painel, PostgREST) não muda o estado do assistente em leads — opt-out, '
  'cadência, entrega, aquecimento. Quem muda é o servidor, com a chave de serviço (2026-10-20).';


-- ----------------------------------------------------------------------------
-- 4c. Achar ou criar o lead da conversa — uma vez só, mesmo na rajada
-- ----------------------------------------------------------------------------
-- Cada mensagem do WhatsApp é uma execução do n8n, e as de uma rajada correm
-- em paralelo. Sem trava, duas mensagens de um número novo criam DOIS leads
-- (e o assistente responde duas vezes). A trava consultiva é por telefone —
-- pelas duas formas do celular, com e sem o nono dígito — e vale até o fim da
-- transação: a segunda execução espera a primeira e acha o lead que ela criou.
--
-- A mesma chamada garante a linha de `atendimentos` da conversa pela
-- Evolution (sem id do Chatwoot), sob a mesma trava, herdando as etiquetas do
-- atendimento anterior do lead: a etiqueta `resgate`, que tira o lead do
-- aviso de lead novo (20261010160000), não pode se perder porque a conversa
-- trocou de porta. Nasce com o assistente DESLIGADO no SLA; quem liga é o
-- servidor, que sabe se o assistente pegou este lead.
create or replace function public.achar_ou_criar_lead_do_whatsapp(
  p_formas          text[],
  p_telefone        text,
  p_nome            text,
  p_origem          jsonb,
  p_assistente_fase text
)
  returns table (lead_id uuid, atendimento_id uuid, criado boolean)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_lead   uuid;
  v_atd    uuid;
  v_criado boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Só o servidor cria lead pela conversa.' using errcode = 'insufficient_privilege';
  end if;
  if p_formas is null or cardinality(p_formas) = 0 or coalesce(btrim(p_telefone), '') = '' then
    raise exception 'Telefone obrigatório.' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('atendimento-lead:' || array_to_string(array(select unnest(p_formas) order by 1), ','))
  );

  select l.id into v_lead
    from public.leads l
   where l.telefone = any (p_formas) and l.desfecho is null
   order by l.created_at desc
   limit 1;

  if v_lead is null then
    insert into public.leads (nome, telefone, canal, situacao, ultimo_movimento_em, origem_conversa, assistente_fase)
    values (
      coalesce(nullif(btrim(p_nome), ''), 'WhatsApp ' || right(p_telefone, 4)),
      p_telefone, 'WhatsApp', 'novo', now(), p_origem, p_assistente_fase
    )
    returning id into v_lead;
    v_criado := true;
  end if;

  select a.id into v_atd
    from public.atendimentos a
   where a.lead_id = v_lead and a.chatwoot_conversation_id is null
   order by coalesce(a.iniciado_em, a.created_at) desc, a.created_at desc, a.id desc
   limit 1;

  if v_atd is null then
    insert into public.atendimentos (lead_id, iniciado_em, com_assistente, status_conversa, tags)
    values (
      v_lead, now(), false, 'open',
      (select a.tags from public.atendimentos a
        where a.lead_id = v_lead
        order by coalesce(a.iniciado_em, a.created_at) desc, a.created_at desc, a.id desc
        limit 1)
    )
    returning id into v_atd;
  end if;

  return query select v_lead, v_atd, v_criado;
end $$;

revoke all on function public.achar_ou_criar_lead_do_whatsapp(text[], text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.achar_ou_criar_lead_do_whatsapp(text[], text, text, jsonb, text) to service_role;

comment on function public.achar_ou_criar_lead_do_whatsapp(text[], text, text, jsonb, text) is
  'O lead aberto da conversa do WhatsApp, ou um novo — sob trava por telefone, para a rajada '
  'de um número novo não criar dois (2026-10-20). Garante o atendimento pela Evolution, herdando '
  'as etiquetas. Só a chave de serviço.';


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
  l_c      uuid;
  l_d      uuid;
  l_e      uuid;
  l_f      uuid;
  v_outra  uuid;
  r1       record;
  r2       record;
  r3       record;
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
    foreach q in array array['admin', 'gestor', 'coma', 'comb', 'mkt'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'aceite-atendimento-' || q || '@exemplo.invalido', now(), now())
      returning id into v_id;
      u := u || jsonb_build_object(q, v_id);
    end loop;
    update public.profiles set full_name = 'Aceite IA Admin', papeis = array['admin'], role = 'admin', is_active = true
     where id = (u->>'admin')::uuid;
    update public.profiles set full_name = 'Aceite IA Gestor', papeis = array['gestor'], role = 'gestor', is_active = true
     where id = (u->>'gestor')::uuid;
    update public.profiles set full_name = 'Aceite IA Vendedor A', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'coma')::uuid;
    update public.profiles set full_name = 'Aceite IA Vendedor B', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'comb')::uuid;
    update public.profiles set full_name = 'Aceite IA Marketing', papeis = array['marketing'], role = 'marketing', is_active = true
     where id = (u->>'mkt')::uuid;

    insert into public.leads (nome, telefone, responsavel, situacao, optout_em)
    values ('Aceite IA Lead A', '5541900002010', 'Aceite IA Vendedor A', 'novo', now()) returning id into l_a;
    insert into public.leads (nome, telefone, responsavel)
    values ('Aceite IA Lead B', '5541900002011', 'Aceite IA Vendedor B') returning id into l_b;
    -- C: sem responsável (o gestor não o enxerga); D e E: em "Novo", para os canais.
    insert into public.leads (nome, telefone) values ('Aceite IA Lead C', '5541900002012') returning id into l_c;
    insert into public.leads (nome, telefone, situacao) values ('Aceite IA Lead D', '5541900002013', 'novo') returning id into l_d;
    insert into public.leads (nome, telefone, situacao) values ('Aceite IA Lead E', '5541900002014', 'novo') returning id into l_e;
    insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, texto, situacao)
    values (l_c, '5541900002012', 'entrada', 'cliente', 'oi', 'recebida');

    -- Uma segunda loja, com uma linha de conversa no lead A e uma configuração
    -- própria: nada dela aparece para a equipe da loja padrão.
    insert into public.orgs (nome, criada_em)
    select 'Aceite IA outra loja', max(criada_em) + interval '1 day' from public.orgs
    returning id into v_outra;
    insert into public.atendimento_mensagens (org_id, lead_id, telefone, direcao, autor, texto, situacao)
    values (v_outra, l_a, '5541900002010', 'entrada', 'cliente', 'de outra loja', 'recebida');
    insert into public.atendimento_config (org_id) values (v_outra);

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
      jsonb_build_array('ninguém logado liga o assistente','admin', 'update public.atendimento_config set ativo = true', 'barrado|linhas:0'),
      -- Escopo e loja.
      jsonb_build_array('gestor não lê conversa de lead sem responsável', 'gestor', 'select count(*) from public.atendimento_mensagens where lead_id = {c}', 'vê:0'),
      jsonb_build_array('admin lê a conversa sem responsável', 'admin', 'select count(*) from public.atendimento_mensagens where lead_id = {c}', 'vê:1'),
      jsonb_build_array('a linha da outra loja não aparece', 'admin', 'select count(*) from public.atendimento_mensagens where lead_id = {a}', 'vê:1'),
      -- O estado do assistente só muda pelo servidor.
      jsonb_build_array('vendedor não zera o opt-out',     'coma',  'update public.leads set optout_em = null where id = {a}', 'barrado'),
      jsonb_build_array('vendedor não põe lead em cadência', 'coma', 'update public.leads set cadencia = ''engajamento'', cadencia_proximo_em = now() where id = {a}', 'barrado'),
      jsonb_build_array('vendedor não forja a confirmação', 'coma', 'update public.leads set entrega_confirmada_em = now() where id = {a}', 'barrado'),
      jsonb_build_array('vendedor segue anotando no lead dele', 'coma', 'update public.leads set observacoes = ''ligou'' where id = {a}', 'linhas:1'),
      jsonb_build_array('ninguém logado cria lead pela conversa', 'admin', 'select count(*) from public.achar_ou_criar_lead_do_whatsapp(array[''5541900002099''], ''5541900002099'', ''x'', null, null)', 'barrado')
    );

    for v_caso in
      select c.caso->>0 as rotulo, c.caso->>1 as quem, c.caso->>2 as comando, c.caso->>3 as esperado
        from jsonb_array_elements(v_casos) with ordinality as c(caso, ordem)
       order by c.ordem
    loop
      q := replace(replace(replace(v_caso.comando, '{a}', format('%L::uuid', l_a)), '{b}', format('%L::uuid', l_b)), '{c}', format('%L::uuid', l_c));
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

    -- Vestindo o serviço: os canais do contato e a criação do lead da conversa.
    insert into public.leads (nome, telefone) values ('Aceite IA Lead F', '5541900002060') returning id into l_f;
    insert into public.atendimentos (lead_id, chatwoot_conversation_id, iniciado_em, tags)
    values (l_f, -999100, now() - interval '1 day', array['resgate']);

    set local role service_role;
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    perform public.registrar_contato_do_lead(l_a, 'evolution', 'Aceite IA Vendedor A');
    perform public.registrar_contato_do_lead(l_d, 'chatwoot', 'Aceite IA Vendedor A');
    perform public.registrar_contato_do_lead(l_e, 'whatsapp', 'Aceite IA Vendedor A');
    select * into r1 from public.achar_ou_criar_lead_do_whatsapp(
      array['5541900002050', '554190002050'], '5541900002050', 'Aceite IA Novo', '{"tipo":"ad"}'::jsonb, 'qualificando');
    select * into r2 from public.achar_ou_criar_lead_do_whatsapp(
      array['554190002050', '5541900002050'], '554190002050', 'Aceite IA Novo', null, 'qualificando');
    select * into r3 from public.achar_ou_criar_lead_do_whatsapp(
      array['5541900002060'], '5541900002060', 'Aceite IA Lead F', null, null);
    -- O servidor muda o estado do assistente (auth.uid() nulo).
    update public.leads set cadencia = 'follow_up', cadencia_proximo_em = now() where id = l_b;
    perform set_config('request.jwt.claims', '', true);
    reset role;

    select situacao into v_etapa from public.leads where id = l_a;
    if v_etapa is distinct from 'em_contato' then
      v_falhou := v_falhou || format('resposta pela Evolution deixou o lead em %s', v_etapa);
    end if;
    select situacao into v_etapa from public.leads where id = l_d;
    if v_etapa is distinct from 'em_contato' then
      v_falhou := v_falhou || format('resposta pelo Chatwoot deixou o lead em %s', v_etapa);
    end if;
    select situacao into v_etapa from public.leads where id = l_e;
    if v_etapa is distinct from 'novo' then
      v_falhou := v_falhou || format('o clique no WhatsApp do card moveu o lead para %s', v_etapa);
    end if;
    if not (r1.criado and not r2.criado and r1.lead_id = r2.lead_id and r1.atendimento_id = r2.atendimento_id) then
      v_falhou := v_falhou || 'a mesma conversa (nas duas formas do celular) não achou o mesmo lead e o mesmo atendimento'::text;
    end if;
    if not exists (select 1 from public.leads where id = r1.lead_id and canal = 'WhatsApp' and assistente_fase = 'qualificando'
                     and origem_conversa = '{"tipo":"ad"}'::jsonb and nome = 'Aceite IA Novo') then
      v_falhou := v_falhou || 'o lead criado pela conversa não tem canal, fase e origem'::text;
    end if;
    if r3.criado or r3.lead_id is distinct from l_f
       or not exists (select 1 from public.atendimentos where id = r3.atendimento_id and tags = array['resgate'] and not com_assistente) then
      v_falhou := v_falhou || 'o atendimento novo não herdou a etiqueta resgate do anterior (ou nasceu com o assistente)'::text;
    end if;
    if not exists (select 1 from public.leads where id = l_b and cadencia = 'follow_up') then
      v_falhou := v_falhou || 'o servidor não conseguiu mudar o estado do assistente'::text;
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
     or exists (select 1 from public.orgs where nome = 'Aceite IA outra loja')
     or exists (select 1 from public.atendimento_mensagens where wa_id like 'ACEITE-WA-%') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o aceite deixou linha para trás';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % verificação(ões) do atendimento IA', falhas;
  end if;
  raise notice 'Aceite verificado: atendimento IA — RLS por escopo e por loja, regras, idempotência, cascata, '
               'estado do assistente só pelo servidor, lead da conversa sob trava e os canais do contato.';
end
$aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261020120000', 'atendimento_ia')
  on conflict (version) do nothing;
