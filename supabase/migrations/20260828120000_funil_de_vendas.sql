-- ===========================================================================
-- O funil de vendas: etapas editáveis, desfecho medido e lead que não apodrece
-- ===========================================================================
-- 2026-08-28, pedido do dono, em cinco partes:
--
--   1. *"todo lead precisa ir para a aba de clientes e fornecedores também,
--      para melhorar gestão"*
--   2. *"precisamos ter uma opção de dar o negócio como ganho ou perdido,
--      selecionando opções para mensurar em relatórios depois"*
--   3. *"temos que ser capazes de editar o funil de vendas de acordo com a
--      necessidade"*
--   4. *"com alertas inteligentes de estagnação do lead no whatsapp do
--      vendedor"*
--   5. *"e após um prazo razoável, transferir o lead para outro vendedor,
--      salvo os que já estão em negociação ou com visita agendada"*
--
-- ---------------------------------------------------------------------------
-- O diagnóstico: o funil era uma constante no meio de um componente React
-- ---------------------------------------------------------------------------
-- Até aqui as sete etapas viviam em DOIS lugares que ninguém obrigava a
-- concordar: um `const ETAPAS` dentro de `LeadsKanban.tsx` e um
-- `check (situacao in (...))` na migração 20260807210000. Mudar o funil era
-- editar código E migrar banco, na ordem certa — na prática, não era possível.
--
-- Pior: o kanban tinha as colunas "Fechado" e "Perdido" e mais nada. O lead
-- entrava lá e o motivo morria com ele. Não havia como responder *"por que a
-- gente perde venda?"* — a pergunta que o dono está fazendo — porque o dado
-- nunca foi coletado. Coluna de kanban não é medição: é um lugar onde o card
-- para de incomodar.
--
-- E não havia relógio nenhum. Um lead entrava às 22h de sexta e ficava lá até
-- alguém abrir a tela. A pesquisa de mercado é brutal com isso (ver
-- docs/FUNIL_DE_VENDAS.md): responder em até 5 minutos converte 9x mais que
-- responder em 30; só 13% das lojas respondem dentro de 5 minutos. O gargalo
-- não é falta de vontade — é que ninguém é avisado.
--
-- ---------------------------------------------------------------------------
-- As quatro decisões deste arquivo
-- ---------------------------------------------------------------------------
--
-- **a) A etapa vira LINHA, não constante.** `funil_etapas` passa a ser a fonte
--    do funil, e `leads.situacao` ganha chave estrangeira para ela — no lugar
--    do `check` fixo, que é justamente o que impedia criar etapa nova. A
--    chave (`novo`, `em_contato`…) é estável e o rótulo é editável: renomear
--    "Fechado" para "Ganho" não reescreve o histórico de 500 leads.
--
-- **b) O desfecho não é a etapa.** É a lição mais citada de quem opera funil
--    há anos (Pipedrive: *"always use the Won and Lost buttons and never
--    create Closed stages"*). Aqui as duas coisas coexistem porque a tela é um
--    kanban e o card precisa ir para algum lugar: a etapa terminal existe, mas
--    o que o relatório lê é `desfecho` + `desfecho_motivo`, e o motivo é
--    obrigatório na interface. Etapa é onde o card está; desfecho é o que
--    aconteceu com o negócio.
--
-- **c) O relógio da estagnação mora na ETAPA.** Não existe um prazo só: um
--    lead novo sem resposta em 15 minutos é uma emergência, um lead em
--    proposta há 15 minutos é normal. Cada etapa carrega os seus dois prazos —
--    quando avisar e quando transferir — em MINUTOS, porque o prazo do topo do
--    funil não cabe em horas e o do meio não cabe em dias.
--
-- **d) A transferência é acoplada ao aviso.** Quem monta a fila é o banco;
--    quem entrega é o n8n — a mesma divisão do motor de gatilhos do Ciclo. E
--    a transferência só acontece no `p_reservar = true`, ou seja, no mesmo
--    comando que produz a mensagem. Transferir em silêncio seria trocar o dono
--    de um lead sem que o dono novo soubesse: o vendedor descobriria pelo
--    kanban, se olhasse. Lead que troca de mão sem aviso é lead perdido duas
--    vezes.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. As etapas do funil
-- ---------------------------------------------------------------------------
-- `chave` é a chave primária, e é TEXTO de propósito: é o valor que
-- `leads.situacao` já grava hoje em 100% das linhas. Um `id uuid` novo
-- obrigaria a migrar todas elas — e a migrar de novo qualquer consumidor
-- externo que leia `situacao` (o n8n lê).
--
-- `on update cascade` na FK adiante deixa a chave ser corrigida um dia sem
-- órfão; `on delete` fica no padrão (RESTRICT), e é intencional: apagar uma
-- etapa que ainda tem lead dentro faria os cards sumirem da tela sem erro
-- nenhum. A tela oferece DESATIVAR, que é o gesto certo.

create table if not exists public.funil_etapas (
  chave                text primary key,
  rotulo               text not null,
  ordem                int  not null default 0,
  -- 'aberta' = negócio em andamento. 'ganho'/'perdido' = etapa terminal; o
  -- lead que cai aqui recebe `desfecho` automaticamente (ver o gatilho).
  tipo                 text not null default 'aberta'
                         check (tipo in ('aberta', 'ganho', 'perdido')),
  -- Minutos parado até o vendedor ser cutucado. NULL = esta etapa não cobra.
  estagnacao_minutos   int  check (estagnacao_minutos is null or estagnacao_minutos > 0),
  -- Minutos parado até o lead trocar de dono. NULL = nunca transfere sozinho.
  transferencia_minutos int check (transferencia_minutos is null or transferencia_minutos > 0),
  -- O pedido do dono, em uma coluna: *"salvo os que já estão em negociação ou
  -- com visita agendada"*. Etapa protegida avisa, mas nunca transfere — nem
  -- que alguém preencha `transferencia_minutos` por engano.
  protegida            boolean not null default false,
  ativa                boolean not null default true,
  cor                  text,
  criada_em            timestamptz not null default now(),
  atualizada_em        timestamptz not null default now()
);

comment on table public.funil_etapas is
  'As etapas do funil de vendas, editáveis pelo painel (2026-08-28). Antes '
  'disto elas eram um `const` dentro de LeadsKanban.tsx mais um CHECK na '
  'tabela leads — mudar o funil exigia deploy E migração. `chave` é estável '
  'e é o que `leads.situacao` grava; `rotulo` é o que se lê na tela.';

comment on column public.funil_etapas.protegida is
  'Avisa mas nunca transfere. Nasce true em `visita` e `negociacao` por '
  'decisão do dono em 2026-08-28: tirar o lead de quem já tem visita marcada '
  'quebra um compromisso com o cliente, não só com o vendedor.';

comment on column public.funil_etapas.estagnacao_minutos is
  'Minutos parado até o aviso no WhatsApp do vendedor. Em MINUTOS porque o '
  'prazo do topo do funil (15 min para um lead novo) não cabe em horas.';


-- ---------------------------------------------------------------------------
-- 2. Os motivos de ganho e de perda
-- ---------------------------------------------------------------------------
-- Tabela, e não `check` com uma lista: a lista é o que o dono quer editar
-- quando descobrir que "preço" na verdade eram três motivos diferentes. É
-- também o que permite o relatório agrupar sem depender de digitação livre —
-- campo de texto vira "preço", "Preço", "preco alto" e "achou caro" na mesma
-- planilha, e aí não há relatório.

create table if not exists public.funil_motivos (
  chave      text primary key,
  rotulo     text not null,
  tipo       text not null check (tipo in ('ganho', 'perdido')),
  ordem      int  not null default 0,
  ativo      boolean not null default true,
  criada_em  timestamptz not null default now()
);

comment on table public.funil_motivos is
  'Por que o negócio foi ganho ou perdido (2026-08-28). Lista fechada e '
  'editável: texto livre não agrega em relatório — "preço", "Preço" e '
  '"achou caro" viram três linhas no mesmo gráfico.';


-- ---------------------------------------------------------------------------
-- 3. O que o lead passa a carregar
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists desfecho           text
    check (desfecho is null or desfecho in ('ganho', 'perdido')),
  add column if not exists desfecho_em        timestamptz,
  add column if not exists desfecho_motivo    text,
  add column if not exists desfecho_valor     numeric(12,2),
  add column if not exists desfecho_nota      text,
  -- Quando o card mudou de coluna pela última vez. É o "há quanto tempo nesta
  -- etapa" que a tela mostra.
  add column if not exists ultimo_movimento_em timestamptz,
  -- Quando um humano tocou neste lead pela última vez — mover, anotar, trocar
  -- de dono, clicar em "falar no WhatsApp". É o relógio da estagnação.
  add column if not exists ultimo_contato_em  timestamptz,
  add column if not exists responsavel_desde  timestamptz,
  add column if not exists responsavel_anterior text,
  add column if not exists transferencias     int not null default 0,
  add column if not exists alertado_em        timestamptz,
  add column if not exists alertas            int not null default 0;

comment on column public.leads.ultimo_contato_em is
  'O relógio da estagnação. Qualquer toque HUMANO no lead o reinicia — mover '
  'de etapa, anotar, trocar de dono, abrir a conversa no WhatsApp pelo card. '
  'A transferência automática NÃO reinicia: senão o lead transferido nasceria '
  'com o prazo zerado e o dono novo teria o dobro do tempo do antigo.';

comment on column public.leads.desfecho_motivo is
  'Chave de `funil_motivos`. É a coluna que o relatório agrupa — e a razão '
  'de a etapa terminal, sozinha, não bastar.';

-- Backfill honesto: os leads que já existem não nasceram agora. Usar `now()`
-- como default no ADD COLUMN teria zerado o relógio de todo mundo e escondido
-- exatamente a estagnação que este arquivo existe para mostrar.
update public.leads
   set ultimo_movimento_em = coalesce(ultimo_movimento_em, atualizado_em, created_at)
 where ultimo_movimento_em is null;

update public.leads
   set responsavel_desde = coalesce(responsavel_desde, atualizado_em, created_at)
 where responsavel is not null and responsavel_desde is null;

alter table public.leads
  alter column ultimo_movimento_em set default now();

do $$
begin
  if exists (select 1 from public.leads where ultimo_movimento_em is null) then
    raise exception
      'Há lead sem ultimo_movimento_em depois do backfill — não dá para pôr '
      'NOT NULL sem inventar data. Investigue antes de seguir.';
  end if;
end $$;

alter table public.leads
  alter column ultimo_movimento_em set not null;


-- ---------------------------------------------------------------------------
-- 4. O rastro: sem ele não existe relatório, só retrato
-- ---------------------------------------------------------------------------
-- A tabela `leads` guarda o ESTADO. "Quantos leads o Bruno perdeu por preço em
-- agosto" precisa do HISTÓRICO — e o histórico de uma coluna que é
-- sobrescrita não existe em lugar nenhum.
--
-- `on delete cascade` é deliberado e é jurídico: a exclusão de um lead existe
-- porque o titular pediu (LGPD art. 18, VI). Um rastro que sobrevivesse ao
-- pedido de exclusão guardaria o nome de quem pediu para ser esquecido.

create table if not exists public.leads_eventos (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  tipo        text not null check (tipo in (
                'entrada', 'etapa', 'responsavel', 'transferencia',
                'contato', 'desfecho', 'alerta', 'nota')),
  de          text,
  para        text,
  -- Nome de quem fez. NULL quando foi o motor — e aí `automatico` é true.
  autor       text,
  automatico  boolean not null default false,
  detalhe     jsonb,
  criado_em   timestamptz not null default now()
);

comment on table public.leads_eventos is
  'O rastro do lead: cada mudança de etapa, de dono, cada aviso e cada '
  'desfecho (2026-08-28). É a fonte dos relatórios de funil — `leads` guarda '
  'o estado, esta tabela guarda a história. Cascateia na exclusão do lead: '
  'pedido de eliminação do titular (LGPD art. 18, VI) leva o rastro junto.';

create index if not exists leads_eventos_lead_idx    on public.leads_eventos (lead_id, criado_em desc);
create index if not exists leads_eventos_tipo_idx    on public.leads_eventos (tipo, criado_em desc);
create index if not exists leads_desfecho_idx        on public.leads (desfecho, desfecho_em desc);
create index if not exists leads_responsavel_idx     on public.leads (responsavel);
create index if not exists leads_parados_idx         on public.leads (ultimo_movimento_em)
  where desfecho is null;


-- ---------------------------------------------------------------------------
-- 5. A semente: as sete etapas que já existem, com prazos defensáveis
-- ---------------------------------------------------------------------------
-- As chaves são EXATAMENTE as sete do `check` antigo. Nenhum lead muda de
-- etapa por causa desta migração — o que muda é que agora elas são editáveis.
--
-- Os prazos vêm da pesquisa registrada em docs/FUNIL_DE_VENDAS.md e são um
-- PONTO DE PARTIDA declarado, não uma verdade: a tela de configuração existe
-- para o dono ajustar depois de ver o primeiro mês.
--
--   novo ......... 15 min para avisar, 60 para transferir. O estudo do
--                  MIT/InsideSales e a série de benchmarks automotivos põem o
--                  corte em 5 minutos; 15 é o menor prazo que não vira spam
--                  no celular do vendedor (um aviso, não três).
--   em_contato ... 1 dia / 3 dias. Já houve conversa; o risco agora é esfriar.
--   proposta ..... 2 dias / 5 dias. Proposta sem resposta em 48h precisa de
--                  um empurrão; em 5 dias, de outro vendedor.
--   visita ....... 2 dias para avisar, e NUNCA transfere (protegida).
--   negociacao ... idem. As duas exceções que o dono nomeou.
--   fechado/perdido — etapa terminal: não cobra, não transfere.
--
-- `on conflict do nothing`: reexecutar a migração não pode desfazer o ajuste
-- que o dono fizer pela tela. A semente semeia uma vez.

insert into public.funil_etapas
  (chave, rotulo, ordem, tipo, estagnacao_minutos, transferencia_minutos, protegida, cor)
values
  ('novo',        'Novo',            1, 'aberta',    15,    60, false, '#B45309'),
  ('em_contato',  'Em contato',      2, 'aberta',  1440,  4320, false, null),
  ('proposta',    'Proposta',        3, 'aberta',  2880,  7200, false, null),
  ('visita',      'Visita agendada', 4, 'aberta',  2880,  null, true,  null),
  ('negociacao',  'Negociação',      5, 'aberta',  2880,  null, true,  null),
  ('fechado',     'Ganho',           6, 'ganho',   null,  null, true,  '#15803D'),
  ('perdido',     'Perdido',         7, 'perdido', null,  null, true,  '#9F1239')
on conflict (chave) do nothing;

-- Motivos de PERDA. A lista sai do cruzamento entre o que os CRMs de funil
-- oferecem por padrão e o que a literatura de concessionária brasileira
-- aponta como as perdas reais do setor: compra futura, baixa valorização do
-- usado, condições de financiamento e falta de estoque.
--
-- `contato_invalido` no fim não é motivo de venda perdida — é motivo de lead
-- que nunca foi lead. Sem ele, trote e duplicado entram na estatística de
-- "perdemos por preço" e distorcem tudo que vier depois.
insert into public.funil_motivos (chave, rotulo, tipo, ordem) values
  ('preco',                'Preço acima do que o cliente queria pagar', 'perdido',  1),
  ('comprou_concorrente',  'Comprou em outro lugar',                    'perdido',  2),
  ('credito_reprovado',    'Financiamento ou crédito reprovado',        'perdido',  3),
  ('sem_estoque',          'Não tínhamos o carro que ele queria',       'perdido',  4),
  ('avaliacao_do_usado',   'Avaliação do usado abaixo do esperado',     'perdido',  5),
  ('condicoes_pagamento',  'Condições de pagamento ou entrada',         'perdido',  6),
  ('desistiu',             'Desistiu de trocar de carro',               'perdido',  7),
  ('sem_resposta',         'Sumiu — não respondeu mais',                'perdido',  8),
  ('comprar_depois',       'Vai comprar mais para frente',              'perdido',  9),
  ('contato_invalido',     'Contato inválido, duplicado ou trote',      'perdido', 10),
  -- Motivos de GANHO. Num negócio de carro, "como ganhou" é a forma de
  -- pagamento — e é o corte que a loja usa para planejar caixa e para saber
  -- quanto do resultado depende de banco.
  ('a_vista',              'À vista',                                   'ganho',    1),
  ('financiado',           'Financiado',                                'ganho',    2),
  ('com_troca',            'Com carro na troca',                        'ganho',    3),
  ('consorcio',            'Consórcio ou carta contemplada',            'ganho',    4)
on conflict (chave) do nothing;


-- ---------------------------------------------------------------------------
-- 6. O CHECK sai, a chave estrangeira entra
-- ---------------------------------------------------------------------------
-- Esta é a troca que torna o funil editável. Enquanto o `check` existir,
-- criar a etapa "Test drive" pela tela gera um UPDATE que o banco recusa —
-- e o dono vê "erro ao salvar" sem nenhuma pista do motivo.
--
-- Antes da FK, uma rede de segurança: se algum lead carregar uma `situacao`
-- fora das sete (restore antigo, escrita direta pelo painel do Supabase), ela
-- vira uma etapa INATIVA em vez de abortar a migração. Perder a migração por
-- causa de uma linha estranha seria ruim; perder a linha seria pior.

do $$
declare
  v_orfas int;
begin
  insert into public.funil_etapas (chave, rotulo, ordem, tipo, ativa)
  select distinct l.situacao,
         initcap(replace(l.situacao, '_', ' ')),
         900,
         'aberta',
         false
    from public.leads l
   where l.situacao is not null
     and not exists (select 1 from public.funil_etapas e where e.chave = l.situacao)
  on conflict (chave) do nothing;

  get diagnostics v_orfas = row_count;
  if v_orfas > 0 then
    raise notice
      'FUNIL: % etapa(s) desconhecida(s) encontrada(s) em leads.situacao foram '
      'cadastradas como INATIVAS para não perder os cards. Confira a tela de '
      'configuração do funil.', v_orfas;
  end if;
end $$;

alter table public.leads drop constraint if exists leads_situacao_valida;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.leads'::regclass
       and conname = 'leads_situacao_do_funil'
  ) then
    alter table public.leads
      add constraint leads_situacao_do_funil
      foreign key (situacao) references public.funil_etapas(chave)
      on update cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.leads'::regclass
       and conname = 'leads_desfecho_motivo_do_funil'
  ) then
    alter table public.leads
      add constraint leads_desfecho_motivo_do_funil
      foreign key (desfecho_motivo) references public.funil_motivos(chave)
      on update cascade;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 7. A trava que o funil editável exige: sempre há um ganho e um perdido
-- ---------------------------------------------------------------------------
-- Sem ela, um clique distraído na tela de configuração desativa a etapa
-- "Perdido" e a loja fica sem onde registrar perda — o relatório de motivos
-- para de receber dados e ninguém percebe, porque nada dá erro. É o modo de
-- falha que este projeto persegue: ausência sem aviso.
--
-- Statement-level: a tela salva várias etapas de uma vez, e a checagem por
-- linha reprovaria um estado intermediário legítimo (desativar a antiga na
-- mesma transação em que ativa a nova).

create or replace function public.funil_exige_desfecho()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if not exists (select 1 from public.funil_etapas where tipo = 'ganho'   and ativa) then
    raise exception
      'O funil precisa de ao menos uma etapa de GANHO ativa — sem ela não há '
      'onde registrar venda fechada.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.funil_etapas where tipo = 'perdido' and ativa) then
    raise exception
      'O funil precisa de ao menos uma etapa de PERDIDO ativa — sem ela o '
      'motivo da perda deixa de ser coletado e o relatório seca em silêncio.'
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

drop trigger if exists trg_funil_exige_desfecho on public.funil_etapas;
create constraint trigger trg_funil_exige_desfecho
  after insert or update or delete on public.funil_etapas
  deferrable initially deferred
  for each row execute function public.funil_exige_desfecho();


-- ---------------------------------------------------------------------------
-- 8. O vendedor precisa de um número — e ele JÁ EXISTE
-- ---------------------------------------------------------------------------
-- O alerta do dono é *"no whatsapp do vendedor"*, e a primeira versão deste
-- arquivo criava `profiles.telefone` para isso. Errado: a coluna já existe
-- desde `20260819140000_completude_da_venda.sql`, chama-se `telefone_e164`, é
-- editável na tela de usuários e já serve a rotina noturna que avisa sobre
-- venda incompleta.
--
-- Duas colunas de telefone no mesmo cadastro é o defeito que a agenda de
-- pessoas foi criada para combater — o mesmo dado com dois nomes, e uma delas
-- sempre desatualizada. O motor do funil usa a que existe.
--
-- O `add column if not exists` abaixo NÃO cria nada em produção: é rede de
-- segurança para uma cadeia de migração que não inclua a de completude (o
-- andaime de teste é um recorte). Se algum dia ela entrar na cadeia, esta
-- linha continua sendo no-op.
alter table public.profiles
  add column if not exists telefone_e164 text;

comment on column public.profiles.telefone_e164 is
  'WhatsApp do usuário, com DDI (+5541999998888). Dois consumidores: a rotina '
  'noturna de venda incompleta (2026-08-19) e o motor do funil, que avisa o '
  'vendedor de lead parado (2026-08-28). Vazio = não recebe aviso, e a fila '
  'devolve `vendedor_sem_whatsapp` como motivo da supressão.';


-- ---------------------------------------------------------------------------
-- 9. Quem fez o quê — e por que o rastro é SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- O nome do autor sai de `profiles`, e não do JWT: o JWT tem o e-mail, e
-- e-mail não é o que se lê num relatório. Quando não há sessão (o motor
-- chamando com a chave de serviço), o autor é NULL e `automatico` é true.

create or replace function public.autor_atual()
  returns text
  language sql stable security definer set search_path = public
as $$
  select nullif(trim(p.full_name), '')
    from public.profiles p
   where p.id = auth.uid();
$$;

-- O gatilho ANTES: mantém os relógios coerentes.
--
-- A regra do relógio, em uma frase: **toque humano reinicia, motor não.** Um
-- vendedor que anota "liguei, retorna terça" está atendendo — cobrá-lo de novo
-- em uma hora ensinaria a equipe a ignorar o aviso, que é o pior resultado
-- possível de um sistema de alerta. Já a transferência automática não pode
-- reiniciar nada: o dono novo herdaria um prazo zerado e o lead ficaria mais
-- 3 dias parado, agora com a bênção do sistema.
create or replace function public.leads_antes_de_atualizar()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_tipo   text;
  v_humano boolean := auth.uid() is not null;
begin
  if new.situacao is distinct from old.situacao then
    new.ultimo_movimento_em := now();

    select tipo into v_tipo from public.funil_etapas where chave = new.situacao;

    if v_tipo in ('ganho', 'perdido') then
      -- A etapa terminal carimba o desfecho na hora. O MOTIVO continua vazio
      -- de propósito: quem escolhe é a pessoa, na tela, e é ele que o
      -- relatório lê. Carimbar um motivo padrão aqui seria inventar dado.
      if new.desfecho is distinct from v_tipo then
        new.desfecho    := v_tipo;
        new.desfecho_em := now();
      end if;
    elsif old.desfecho is not null and new.desfecho is not distinct from old.desfecho then
      -- Voltou de uma etapa terminal para o funil: o negócio reabriu. Limpar
      -- é o certo — um lead "perdido por preço" que voltou a negociar não pode
      -- continuar contando como perda no relatório do mês.
      new.desfecho        := null;
      new.desfecho_em     := null;
      new.desfecho_motivo := null;
      new.desfecho_valor  := null;
      new.desfecho_nota   := null;
    end if;
  end if;

  if new.responsavel is distinct from old.responsavel then
    new.responsavel_anterior := old.responsavel;
    new.responsavel_desde    := now();
  end if;

  if v_humano and (
       new.situacao    is distinct from old.situacao
    or new.responsavel is distinct from old.responsavel
    or new.observacoes is distinct from old.observacoes
    or new.desfecho    is distinct from old.desfecho
  ) then
    new.ultimo_contato_em := now();
    -- Atendeu: o contador de avisos zera. Sem isto, o lead atendido hoje
    -- carregaria para sempre a cobrança de ontem.
    new.alertado_em := null;
  end if;

  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_leads_antes_de_atualizar on public.leads;
create trigger trg_leads_antes_de_atualizar
  before update on public.leads
  for each row execute function public.leads_antes_de_atualizar();

-- O gatilho DEPOIS: escreve a história.
--
-- SECURITY DEFINER de propósito. O rastro não pode depender de o autor ter
-- privilégio de INSERT em `leads_eventos`: se a RLS engolir a linha, o
-- UPDATE do lead passa e a história some — e some exatamente do relatório que
-- o dono pediu. Rastro é obrigação do sistema, não do usuário.
create or replace function public.leads_registrar_no_rastro()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_autor    text    := public.autor_atual();
  v_auto     boolean := auth.uid() is null;
begin
  if tg_op = 'INSERT' then
    insert into public.leads_eventos (lead_id, tipo, para, autor, automatico, detalhe)
    values (new.id, 'entrada', new.situacao, v_autor, v_auto,
            jsonb_build_object('canal', new.canal, 'interesse', new.interesse));
    return new;
  end if;

  if new.situacao is distinct from old.situacao then
    insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico)
    values (new.id, 'etapa', old.situacao, new.situacao, v_autor, v_auto);
  end if;

  if new.responsavel is distinct from old.responsavel then
    insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico)
    values (new.id,
            case when v_auto then 'transferencia' else 'responsavel' end,
            old.responsavel, new.responsavel, v_autor, v_auto);
  end if;

  if new.desfecho is distinct from old.desfecho
     or new.desfecho_motivo is distinct from old.desfecho_motivo then
    insert into public.leads_eventos (lead_id, tipo, de, para, autor, automatico, detalhe)
    values (new.id, 'desfecho', old.desfecho, new.desfecho, v_autor, v_auto,
            jsonb_build_object('motivo', new.desfecho_motivo,
                               'valor',  new.desfecho_valor,
                               'nota',   new.desfecho_nota));
  end if;

  return new;
end $$;

drop trigger if exists trg_leads_rastro_insert on public.leads;
create trigger trg_leads_rastro_insert
  after insert on public.leads
  for each row execute function public.leads_registrar_no_rastro();

drop trigger if exists trg_leads_rastro_update on public.leads;
create trigger trg_leads_rastro_update
  after update on public.leads
  for each row execute function public.leads_registrar_no_rastro();


-- ---------------------------------------------------------------------------
-- 10. RLS — e uma porta que estava aberta desde agosto
-- ---------------------------------------------------------------------------
-- A migração 20260807210000 abriu `leads` para `authenticated using (true)`.
-- Fazia sentido no dia: `authenticated` era sinônimo de "gente do painel".
--
-- Deixou de fazer em 2026-08-13, quando o papel `cliente` entrou (a Garagem):
-- o comprador que acessa a área dele é `authenticated` e não é staff. Desde
-- então, qualquer cliente logado podia pedir a lista inteira de leads com a
-- chave anônima — nome, telefone e interesse de todo mundo que já preencheu
-- um formulário no site. Ninguém percebeu porque a TELA sempre checou perfil;
-- a checagem estava na porta da frente, e a dos fundos ficou destrancada.
--
-- Este arquivo é obrigado a mexer nisso porque leva `leads` para dentro da
-- view `agenda_de_pessoas`, que é `security_invoker` — ou seja, ela passaria a
-- carregar a mesma abertura para outra tela.
--
-- `is_staff(auth.uid())` é a régua que as tabelas do Ciclo já usam. Nenhuma
-- tela do painel muda de comportamento: todas leem `leads` com a sessão de
-- quem já é staff. O que muda é que a chave anônima na mão de um cliente
-- deixa de servir.

do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'leads'
  loop
    execute format('drop policy if exists %I on public.leads', p.policyname);
  end loop;
end $$;

create policy leads_leitura_staff on public.leads
  for select to authenticated using (public.is_staff(auth.uid()));

create policy leads_atualizacao_staff on public.leads
  for update to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- Eliminação a pedido do titular (LGPD art. 18, VI). Continua sendo a rota
-- que restringe a Admin; aqui a régua é a mesma das demais: staff.
create policy leads_exclusao_staff on public.leads
  for delete to authenticated using (public.is_staff(auth.uid()));

-- O INSERT segue sem policy: quem grava lead é `/api/leads`, no servidor, com
-- a chave de serviço. O visitante nunca fala com esta tabela.

alter table public.leads_eventos enable row level security;
alter table public.funil_etapas  enable row level security;
alter table public.funil_motivos enable row level security;

drop policy if exists leads_eventos_staff on public.leads_eventos;
create policy leads_eventos_staff on public.leads_eventos
  for select to authenticated using (public.is_staff(auth.uid()));

-- Escrever no rastro é do sistema (o gatilho, SECURITY DEFINER) e do motor
-- (chave de serviço). Não há policy de INSERT para `authenticated`: rastro que
-- o usuário pode escrever à mão não é rastro, é bloco de notas.

-- As duas tabelas de configuração: todo staff LÊ (o kanban precisa das etapas
-- para desenhar as colunas), mas só quem responde pelo processo comercial
-- ESCREVE. Mudar o funil muda a régua de todo mundo.
drop policy if exists funil_etapas_leitura on public.funil_etapas;
create policy funil_etapas_leitura on public.funil_etapas
  for select to authenticated using (public.is_staff(auth.uid()));

drop policy if exists funil_etapas_escrita on public.funil_etapas;
create policy funil_etapas_escrita on public.funil_etapas
  for all to authenticated
  using (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'gestor'))
  with check (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'gestor'));

drop policy if exists funil_motivos_leitura on public.funil_motivos;
create policy funil_motivos_leitura on public.funil_motivos
  for select to authenticated using (public.is_staff(auth.uid()));

drop policy if exists funil_motivos_escrita on public.funil_motivos;
create policy funil_motivos_escrita on public.funil_motivos
  for all to authenticated
  using (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'gestor'))
  with check (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'gestor'));

revoke all on public.funil_etapas, public.funil_motivos, public.leads_eventos from anon;
grant select on public.funil_etapas, public.funil_motivos, public.leads_eventos to authenticated;
grant insert, update, delete on public.funil_etapas, public.funil_motivos to authenticated;
grant all on public.funil_etapas, public.funil_motivos, public.leads_eventos to service_role;


-- ---------------------------------------------------------------------------
-- 11. O lead entra na agenda de pessoas
-- ---------------------------------------------------------------------------
-- *"todo lead precisa ir para a aba de clientes e fornecedores também, para
-- melhorar gestão"*.
--
-- A agenda (migração 20260824190000) já é uma VITRINE sobre quatro cadastros,
-- montada para responder *"com quem eu me relaciono?"*. Um lead é exatamente
-- isso: alguém com quem a loja se relaciona. Ele entra como quinto ramo.
--
-- **Ramo na view, e não cópia numa tabela.** A tentação seria um gatilho que
-- insere cada lead em `parceiros`. Seria errado por três motivos concretos:
--   1. `parceiros` é o cadastro do FINANCEIRO — quem recebe ou paga. Um lead
--      que nunca comprou nada viraria linha no seletor de fornecedor da tela
--      de contas a pagar.
--   2. Cópia precisa de sincronia. O lead muda de telefone, de etapa, é
--      excluído a pedido do titular — e a cópia fica para trás, calada.
--   3. A agenda existe para ENCONTRAR duplicata, não para criar. Duplicar
--      todo lead em outra tabela seria fabricar o problema que ela resolve.
--
-- **O mapeamento, campo a campo, e por que ele é honesto:**
--   papel .......... 'lead'. Não é cliente (não comprou) nem fornecedor.
--   especialidade .. o RÓTULO DA ETAPA ("Em contato", "Negociação"). A coluna
--                    guarda "o que essa pessoa é aqui" — para o prestador é a
--                    oficina, para o lead é onde ele está no funil.
--   observacoes .... o interesse mais a anotação do vendedor, que é o que
--                    alguém quer ler ao abrir a ficha vinda de outra tela.
--   ativo .......... falso quando o lead foi PERDIDO. A agenda já filtra por
--                    ativo por padrão: perda some da lista do dia a dia e
--                    continua alcançável em "todos". Ganho continua ativo — é
--                    gente que comprou, e vai virar `clientes` no fechamento.
--   documento/cidade  nulos. O formulário do site não pede CPF nem cidade, e
--                    inventar coluna vazia é pior que assumir a ausência.
--
-- A view é `security_invoker`: com a RLS de `leads` agora em `is_staff`, o
-- ramo novo não abre nada que a tabela já não abrisse.

do $$
declare
  ramos   text[] := array[]::text[];
  fontes  text[] := array[]::text[];
begin
  if to_regclass('public.parceiros') is null then
    raise exception
      'FUNIL/AGENDA: public.parceiros não existe. A view seria reconstruída '
      'sem a fonte do financeiro — pare e verifique o bootstrap.';
  end if;

  fontes := fontes || 'parceiros'::text;
  ramos := ramos || $ramo$
    select
      'financeiro'::text                          as origem,
      p.id                                        as id,
      p.nome                                      as nome,
      p.tipo                                      as papel,
      null::text                                  as especialidade,
      p.documento                                 as documento,
      p.telefone                                  as telefone,
      p.email                                     as email,
      p.cidade                                    as cidade,
      p.observacoes                               as observacoes,
      p.ativo                                     as ativo,
      p.created_at                                as created_at
    from public.parceiros p
  $ramo$::text;

  if to_regclass('public.clientes') is not null then
    fontes := fontes || 'clientes'::text;
    ramos := ramos || $ramo$
      select
        'ciclo'::text, c.id, c.nome, 'cliente'::text, null::text,
        c.cpf_cnpj, c.telefone_e164, c.email, null::text, null::text,
        true, c.created_at
      from public.clientes c
    $ramo$::text;
  end if;

  if to_regclass('public.parceiros_ciclo') is not null then
    fontes := fontes || 'parceiros_ciclo'::text;
    ramos := ramos || $ramo$
      select
        'rede'::text, r.id, r.nome, 'prestador'::text, r.tipo,
        null::text, null::text, null::text, r.cidade, null::text,
        coalesce(r.ativo, true), r.created_at
      from public.parceiros_ciclo r
    $ramo$::text;
  end if;

  if to_regclass('public.investidores') is not null then
    fontes := fontes || 'investidores'::text;
    ramos := ramos || $ramo$
      select
        'investidores'::text, i.id, i.nome, 'investidor'::text, null::text,
        i.documento, i.telefone, i.email, null::text, i.observacoes,
        i.ativo, i.created_at
      from public.investidores i
    $ramo$::text;
  end if;

  -- O ramo novo (2026-08-28).
  fontes := fontes || 'leads'::text;
  ramos := ramos || $ramo$
    select
      'lead'::text, l.id, l.nome, 'lead'::text,
      coalesce(e.rotulo, l.situacao),
      null::text, l.telefone, l.email, null::text,
      nullif(concat_ws(' — ', nullif(trim(l.interesse), ''),
                              nullif(trim(l.observacoes), '')), ''),
      (l.desfecho is distinct from 'perdido'),
      l.created_at
    from public.leads l
    left join public.funil_etapas e on e.chave = l.situacao
  $ramo$::text;

  execute 'create or replace view public.agenda_de_pessoas '
       || 'with (security_invoker = true) as '
       || array_to_string(ramos, ' union all ');

  execute format(
    'comment on view public.agenda_de_pessoas is %L',
    'Clientes, fornecedores, prestadores, investidores e leads num formato só '
    || '(2026-08-24; leads em 2026-08-28). '
    || 'security_invoker: a RLS de cada tabela-base vale na pele de quem '
    || 'consulta. Fontes unidas neste banco: ' || array_to_string(fontes, ', ')
    || '. Fonte ausente aqui significa tabela ausente no banco, não filtro.');
end $$;

revoke all on public.agenda_de_pessoas from anon;
grant select on public.agenda_de_pessoas to authenticated, service_role;

-- É por nome que se procura gente, e a agenda ordena por nome.
create index if not exists idx_leads_nome on public.leads (nome);


-- ===========================================================================
-- 12. montar_fila_do_funil — quem está parado, quem avisar, quem assume
-- ===========================================================================
-- A mesma divisão de trabalho do motor de gatilhos do Ciclo, pelo mesmo
-- motivo: **o banco decide, o n8n entrega**. Um workflow desligado atrasa
-- mensagem; um workflow reconfigurado por engano não consegue transferir a
-- carteira inteira de um vendedor para outro.
--
-- ---------------------------------------------------------------------------
-- O relógio
-- ---------------------------------------------------------------------------
-- `parado_desde` = o mais recente entre a última mudança de etapa e o último
-- toque humano. Não é `atualizado_em`: aquele campo se move sozinho a cada
-- gravação, inclusive a do próprio motor, e um relógio que o motor reinicia
-- ao tocar nunca dispara duas vezes.
--
-- ---------------------------------------------------------------------------
-- Os três avisos
-- ---------------------------------------------------------------------------
--   atribuicao ..... lead sem dono há tempo demais. É o mais urgente dos três
--                    e o que não existia: hoje um lead que chega às 22h de
--                    sexta espera alguém abrir a tela. Vai para o vendedor
--                    com menos leads abertos.
--   estagnacao ..... lead parado além do prazo da etapa. Cutuca o dono atual.
--   transferencia .. lead parado além do segundo prazo. Troca de dono, e o
--                    novo dono é avisado no mesmo ato.
--
-- Um lead produz UM aviso por rodada, e a ordem acima é a prioridade.
--
-- ---------------------------------------------------------------------------
-- As supressões (a primeira que casa é a que aparece)
-- ---------------------------------------------------------------------------
--   1. fora_do_horario ....... nada entre 20h e 8h, nada aos domingos. É a
--      mesma régua do §4.3 do manual do Ciclo, e vale aqui pela mesma razão:
--      o vendedor não é um servidor. O lead que estagna sábado à noite é
--      avisado segunda de manhã, e o relógio dele não para — só a mensagem.
--   2. vendedor_sem_whatsapp .. o dono do lead não tem número em `profiles`.
--   3. alerta_recente ......... já foi cutucado nas últimas 20 horas.
--      Vinte, e não vinte e quatro, para o lembrete diário não escorregar
--      alguns minutos por dia até bater nas 20h e pular um dia inteiro.
--   4. sem_vendedor_disponivel  não há outro vendedor ativo e com WhatsApp.
--
-- NÃO HÁ TETO DE TRANSFERÊNCIAS. A primeira versão parava na terceira troca,
-- por medo de pingue-pongue. Decisão do dono em 2026-08-28: *"quantas se
-- fizerem necessárias até o atendimento"* — e ele está certo sobre a mecânica.
-- O lead só circula enquanto está PARADO; qualquer toque humano reinicia o
-- relógio e o tira da fila. Um lead que trocou de dono cinco vezes não é um
-- lead defeituoso, é um lead que cinco pessoas não atenderam, e travá-lo na
-- terceira apenas o esconderia — que é o oposto do que a fila existe para
-- fazer. `leads.transferencias` continua contando, e o card mostra o número:
-- visibilidade em vez de bloqueio.
--
-- Nada é descartado em silêncio: o que não sai vem na resposta com o motivo.
-- Fila que descarta calada é fila que ninguém audita.
--
-- ---------------------------------------------------------------------------
-- Para quem vai o lead transferido
-- ---------------------------------------------------------------------------
-- Para quem tem MENOS leads abertos, com o nome como desempate. Rodízio cego
-- (o próximo da lista) distribui igual no papel e desigual na prática — quem
-- está de férias ou de folga acumula. Carga aberta é a medida honesta de
-- "quem consegue atender agora", e é determinística: a mesma fila, chamada
-- duas vezes, escolhe a mesma pessoa.

create or replace function public.montar_fila_do_funil(
  p_agora    timestamptz default now(),
  p_reservar boolean     default false
)
returns table (
  lead_id              uuid,
  nome                 text,
  telefone             text,
  interesse            text,
  canal                text,
  situacao             text,
  etapa                text,
  minutos_parado       int,
  aviso                text,
  responsavel          text,
  responsavel_whatsapp text,
  novo_responsavel     text,
  novo_whatsapp        text,
  suprimido_por        text
)
language plpgsql
set search_path = public
as $$
#variable_conflict use_column
declare
  v_local   timestamp := p_agora at time zone 'America/Sao_Paulo';
  v_relogio text;
begin
  if extract(dow from v_local) = 0 then
    v_relogio := 'fora_do_horario';
  elsif extract(hour from v_local) < 8 or extract(hour from v_local) >= 20 then
    v_relogio := 'fora_do_horario';
  end if;

  return query
  with base as (
    select
      l.id,
      l.nome,
      l.telefone,
      l.interesse,
      l.canal,
      l.situacao,
      e.rotulo                                     as etapa,
      e.estagnacao_minutos,
      e.transferencia_minutos,
      e.protegida,
      -- `nullif(trim(...), '')`: `responsavel` é texto livre e uma gravação
      -- antiga pode ter deixado string vazia. Sem isto, `l.responsavel is
      -- null` daria falso para um lead que, na prática, não tem dono — e ele
      -- ficaria fora da atribuição automática para sempre, sem erro nenhum.
      nullif(trim(l.responsavel), '')       as responsavel,
      l.transferencias,
      l.alertado_em,
      greatest(l.ultimo_movimento_em, l.ultimo_contato_em) as parado_desde
    from public.leads l
    join public.funil_etapas e on e.chave = l.situacao
    where l.desfecho is null
      and e.tipo = 'aberta'
  ),
  medido as (
    select b.*,
           floor(extract(epoch from (p_agora - b.parado_desde)) / 60)::int as minutos
      from base b
  ),
  classificado as (
    select
      m.*,
      -- O dono atual, com o número dele. LEFT JOIN por nome porque
      -- `leads.responsavel` é TEXTO e não FK (migração 20260807210000): o
      -- consultor que saiu da empresa continua legível no histórico, e o
      -- LEFT devolve NULL em vez de sumir com o lead.
      dono.telefone as responsavel_whatsapp,
      prox.nome     as novo_responsavel,
      prox.telefone as novo_whatsapp,
      case
        when m.responsavel is null
             and m.estagnacao_minutos is not null
             and m.minutos >= m.estagnacao_minutos            then 'atribuicao'
        when m.transferencia_minutos is not null
             and not m.protegida
             and m.minutos >= m.transferencia_minutos          then 'transferencia'
        when m.estagnacao_minutos is not null
             and m.minutos >= m.estagnacao_minutos             then 'estagnacao'
      end as aviso
    from medido m
    left join lateral (
      select nullif(trim(p.telefone_e164), '') as telefone
        from public.profiles p
       where m.responsavel is not null
         and trim(coalesce(p.full_name, '')) = trim(m.responsavel)
         and p.is_active
       limit 1
    ) dono on true
    left join lateral (
      select trim(p.full_name) as nome, trim(p.telefone_e164) as telefone
        from public.profiles p
       where p.is_active
         and p.papeis && array['comercial', 'admin']
         and coalesce(trim(p.full_name), '')    <> ''
         and coalesce(trim(p.telefone_e164), '') <> ''
         and (m.responsavel is null
              or trim(p.full_name) is distinct from trim(m.responsavel))
       order by (
         select count(*) from public.leads x
          where trim(coalesce(x.responsavel, '')) = trim(p.full_name)
            and x.desfecho is null
       ) asc, trim(p.full_name) asc
       limit 1
    ) prox on true
  ),
  fila as (
    select
      c.*,
      case
        when v_relogio is not null then v_relogio
        when c.aviso in ('atribuicao', 'transferencia') and c.novo_responsavel is null
          then 'sem_vendedor_disponivel'
        when c.aviso = 'estagnacao' and c.responsavel_whatsapp is null
          then 'vendedor_sem_whatsapp'
        when c.aviso = 'estagnacao'
             and c.alertado_em is not null
             and c.alertado_em > p_agora - interval '20 hours'
          then 'alerta_recente'
      end as suprimido_por
    from classificado c
    where c.aviso is not null
  ),
  -- ---- a reserva: acontece no MESMO comando que monta a fila ----
  -- Duas execuções sobrepostas do workflow mandariam a mesma mensagem duas
  -- vezes se a gravação viesse depois. E a transferência só existe aqui
  -- dentro: trocar o dono de um lead sem que ninguém seja avisado seria a
  -- pior versão desta funcionalidade.
  cutucados as (
    update public.leads l
       set alertado_em = p_agora,
           alertas     = l.alertas + 1
      from fila f
     where p_reservar
       and f.suprimido_por is null
       and f.aviso = 'estagnacao'
       and l.id = f.id
    returning l.id
  ),
  transferidos as (
    update public.leads l
       set responsavel   = f.novo_responsavel,
           alertado_em   = p_agora,
           alertas       = l.alertas + 1,
           transferencias = l.transferencias
                            + case when f.aviso = 'transferencia' then 1 else 0 end
      from fila f
     where p_reservar
       and f.suprimido_por is null
       and f.aviso in ('atribuicao', 'transferencia')
       and l.id = f.id
    returning l.id
  ),
  rastro as (
    insert into public.leads_eventos (lead_id, tipo, de, para, automatico, detalhe)
    select f.id, 'alerta', f.responsavel,
           coalesce(f.novo_responsavel, f.responsavel), true,
           jsonb_build_object('aviso', f.aviso,
                              'minutos_parado', f.minutos,
                              'etapa', f.situacao)
      from fila f
     where p_reservar and f.suprimido_por is null
    returning id
  )
  select
    f.id, f.nome, f.telefone, f.interesse, f.canal, f.situacao, f.etapa,
    f.minutos, f.aviso, f.responsavel, f.responsavel_whatsapp,
    f.novo_responsavel, f.novo_whatsapp, f.suprimido_por
  from fila f
  order by
    case f.aviso when 'atribuicao' then 1 when 'transferencia' then 2 else 3 end,
    f.minutos desc;
end $$;

comment on function public.montar_fila_do_funil(timestamptz, boolean) is
  'A fila de avisos do funil (2026-08-28): lead parado, lead sem dono e lead '
  'a transferir, com o WhatsApp de quem precisa saber. `p_reservar = true` '
  'grava o aviso E aplica a transferência no mesmo comando — transferir sem '
  'avisar seria trocar o dono de um lead às escondidas. Devolve também o que '
  'foi suprimido, com o motivo.';

-- A fila carrega nome e telefone de cliente. Mesma régua do motor do Ciclo:
-- só a chave de serviço, que é o que o n8n usa.
revoke all on function public.montar_fila_do_funil(timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.montar_fila_do_funil(timestamptz, boolean)
  to service_role;


-- ---------------------------------------------------------------------------
-- 13. Registrar contato — o que o botão de WhatsApp do card faz
-- ---------------------------------------------------------------------------
-- O dono pediu *"um atalho para falar com o cliente pelo whatsapp direto do
-- card"*. Um link `wa.me` resolveria a metade visível do pedido. A metade que
-- importa é esta: **abrir a conversa é atender**, e atender tem que parar o
-- relógio da estagnação — senão o vendedor que acabou de falar com o cliente
-- recebe um alerta cobrando que fale com o cliente, e em duas semanas ninguém
-- lê mais alerta nenhum.
--
-- SECURITY DEFINER porque escreve no rastro, e o rastro não tem policy de
-- INSERT para `authenticated` — de propósito: rastro que o usuário escreve à
-- mão não é rastro. A guarda de staff está aqui dentro, explícita.

create or replace function public.registrar_contato_do_lead(
  p_lead  uuid,
  p_canal text default 'whatsapp'
)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_agora timestamptz := now();
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Registrar contato é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.leads
     set ultimo_contato_em = v_agora,
         -- Atendeu: a cobrança de hoje deixa de valer.
         alertado_em       = null
   where id = p_lead;

  if not found then
    raise exception 'LEAD_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  insert into public.leads_eventos (lead_id, tipo, para, autor, automatico, detalhe)
  values (p_lead, 'contato', p_canal, public.autor_atual(), false,
          jsonb_build_object('canal', p_canal));

  return v_agora;
end $$;

comment on function public.registrar_contato_do_lead(uuid, text) is
  'Marca que alguém falou com o lead (2026-08-28). Reinicia o relógio da '
  'estagnação e deixa a linha no rastro. É o que o botão de WhatsApp do card '
  'chama — abrir a conversa é atender.';

revoke all on function public.registrar_contato_do_lead(uuid, text) from public, anon;
grant execute on function public.registrar_contato_do_lead(uuid, text)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Autoconferência, parte 1: o funil edita, o desfecho carimba, a fila anda
-- ---------------------------------------------------------------------------
do $aceite$
declare
  v_vend   uuid;
  v_vend2  uuid;
  v_lead   uuid;
  v_lead4  uuid;
  v_lead5  uuid;
  v_lead2  uuid;
  v_lead3  uuid;
  v_seg    timestamptz := '2026-08-31 10:00:00-03';  -- segunda, 10h
  v_contato timestamptz;
  v_dom    timestamptz := '2026-08-30 10:00:00-03';  -- domingo
  f        record;
  qtd      int;
  v_min    int;
  v_txt    text;
begin
  -- ==========================================================================
  -- ENSAIO EM SECO: tudo aqui dentro é desfeito no fim
  -- ==========================================================================
  -- A primeira versão deste bloco ensaiava direto na base e limpava com
  -- DELETE no fim. Duas coisas quebraram quando ele encontrou uma base de
  -- verdade, e a segunda é grave:
  --
  --  1. As asserções citavam o vendedor pelo NOME ("Aceite Vendedora").
  --     Num banco novo o elenco é só o do ensaio; em produção há gente real,
  --     e o rodízio — corretamente — escolheu quem tinha menos leads abertos.
  --     A função estava certa e o teste, errado. Ver a asserção relativa
  --     adiante: o que se cobra é a REGRA, não o nome de quem ela escolhe.
  --
  --  2. `montar_fila_do_funil(..., true)` não tem recorte: ela reserva a fila
  --     INTEIRA. Rodando em produção, o ensaio teria transferido os leads
  --     reais, carimbado `alertado_em` em todos e escrito no rastro — e a
  --     limpeza por DELETE só apagaria os leads do ensaio. Ou seja: a
  --     migração teria feito, em silêncio, exatamente a transferência sem
  --     aviso que este arquivo inteiro existe para impedir. O defeito 1
  --     abortou antes e evitou o 2 por acidente.
  --
  -- A correção é a mesma para os dois: o ensaio roda dentro de um bloco que
  -- termina levantando um erro-sentinela. O `exception` o captura, e o
  -- Postgres desfaz TUDO que o bloco fez — leads de teste, usuários de teste,
  -- e também qualquer efeito da fila sobre dado real. O que sobrevive é o que
  -- interessa: a prova de que a régua funciona, e os NOTICE, que não são
  -- transacionais.
  --
  -- ⚠️ Não troque este `raise` por um `return`: `return` sai do bloco sem
  -- desfazer nada, e o ensaio volta a escrever na base.
  begin
    -- a) a semente, e as duas exceções que o dono nomeou
    select count(*) into qtd from public.funil_etapas;
    if qtd < 7 then
      raise exception 'ACEITE FALHOU: o funil nasceu com % etapa(s), esperado 7', qtd;
    end if;
    if not exists (select 1 from public.funil_etapas
                    where chave in ('visita', 'negociacao') and protegida
                    having count(*) = 2) then
      raise exception
        'ACEITE FALHOU: visita e negociação precisam nascer protegidas — é a '
        'regra que o dono nomeou: lead com visita marcada não troca de dono.';
    end if;

    -- b) O FUNIL É EDITÁVEL. Esta é a asserção que dá razão ao arquivo: o
    --    `check` antigo recusaria uma etapa nova, e o sintoma seria "erro ao
    --    salvar" sem pista nenhuma.
    insert into public.funil_etapas (chave, rotulo, ordem, tipo, estagnacao_minutos)
      values ('aceite_test_drive', 'Test drive', 45, 'aberta', 60);

    insert into public.leads (nome, telefone, interesse, situacao, ultimo_movimento_em)
      values ('Aceite Funil Um', '5541999990001', 'Onix 2020',
              'aceite_test_drive', v_seg - interval '3 hours')
      returning id into v_lead;

    -- c) o rastro nasceu junto com o lead
    if not exists (select 1 from public.leads_eventos
                    where lead_id = v_lead and tipo = 'entrada') then
      raise exception
        'ACEITE FALHOU: lead entrou sem deixar rastro — sem a linha de entrada '
        'não há de onde tirar tempo de funil no relatório.';
    end if;

    -- d) a etapa terminal carimba o desfecho, e o motivo continua com a pessoa
    update public.leads set situacao = 'perdido' where id = v_lead;
    select desfecho into v_txt from public.leads where id = v_lead;
    if v_txt is distinct from 'perdido' then
      raise exception
        'ACEITE FALHOU: mover para a etapa terminal não carimbou o desfecho '
        '(veio "%")', coalesce(v_txt, '<nulo>');
    end if;
    if not exists (select 1 from public.leads_eventos
                    where lead_id = v_lead and tipo = 'desfecho') then
      raise exception 'ACEITE FALHOU: o desfecho não entrou no rastro';
    end if;

    -- e) reabrir limpa o desfecho: negócio que voltou a andar não pode seguir
    --    contando como perda no relatório do mês
    update public.leads set desfecho_motivo = 'preco' where id = v_lead;
    update public.leads set situacao = 'em_contato' where id = v_lead;
    select coalesce(desfecho, '') || '/' || coalesce(desfecho_motivo, '')
      into v_txt from public.leads where id = v_lead;
    if v_txt <> '/' then
      raise exception
        'ACEITE FALHOU: reabrir o lead deixou desfecho/motivo para trás ("%")', v_txt;
    end if;

    -- f) a fila. Um vendedor com WhatsApp, três leads em situações diferentes.
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-funil-vend@exemplo.invalido', now(), now())
    returning id into v_vend;
    update public.profiles
       set full_name = 'Aceite Vendedora', papeis = array['comercial'],
           role = 'comercial', telefone_e164 = '+5541999990100'
     where id = v_vend;

    -- lead sem dono, parado além do prazo da etapa `novo`
    update public.leads
       set situacao = 'novo', responsavel = null,
           ultimo_movimento_em = v_seg - interval '3 hours',
           ultimo_contato_em = null, alertado_em = null
     where id = v_lead;

    -- lead em NEGOCIAÇÃO, parado há uma semana: avisa, mas não transfere
    insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em)
      values ('Aceite Funil Dois', '5541999990002', 'negociacao',
              'Aceite Vendedora', v_seg - interval '7 days')
      returning id into v_lead2;

    -- lead em PROPOSTA, parado há uma semana: transfere
    insert into public.leads (nome, telefone, situacao, responsavel, ultimo_movimento_em)
      values ('Aceite Funil Três', '5541999990003', 'proposta',
              'Ex-consultor Que Saiu', v_seg - interval '7 days')
      returning id into v_lead3;

    -- f.1) domingo não recebe mensagem — e o motivo vem escrito
    select suprimido_por into v_txt
      from public.montar_fila_do_funil(v_dom, false) where lead_id = v_lead;
    if v_txt is distinct from 'fora_do_horario' then
      raise exception
        'ACEITE FALHOU: a fila de domingo veio com supressão "%" — o vendedor '
        'não é um servidor.', coalesce(v_txt, '<nula>');
    end if;

    -- f.2) o lead sem dono é atribuído a quem tem menos carteira
    select * into f from public.montar_fila_do_funil(v_seg, false) where lead_id = v_lead;
    if f.aviso is distinct from 'atribuicao' then
      raise exception
        'ACEITE FALHOU: lead sem dono há 3h saiu como "%", esperado "atribuicao"',
        coalesce(f.aviso, '<nulo>');
    end if;
    -- O que se cobra aqui é que a fila ACHOU alguém com WhatsApp — não QUEM.
    -- Numa base com vendedores de verdade, quem ela escolhe depende da carga
    -- de cada um, e é isso que f.8 verifica. Prender o aceite a um nome foi o
    -- que quebrou a aplicação em produção.
    if f.novo_responsavel is null or coalesce(trim(f.novo_whatsapp), '') = '' then
      raise exception
        'ACEITE FALHOU: a atribuição não achou vendedor com WhatsApp (veio "%"/"%")',
        coalesce(f.novo_responsavel, '<nulo>'), coalesce(f.novo_whatsapp, '<nulo>');
    end if;

    -- f.3) A EXCEÇÃO DO DONO: negociação avisa, mas não troca de mão
    select * into f from public.montar_fila_do_funil(v_seg, false) where lead_id = v_lead2;
    if f.aviso is distinct from 'estagnacao' then
      raise exception
        'ACEITE FALHOU: lead em negociação há 7 dias saiu como "%" — etapa '
        'protegida avisa, nunca transfere.', coalesce(f.aviso, '<nulo>');
    end if;

    -- f.4) proposta parada há uma semana troca de dono
    select * into f from public.montar_fila_do_funil(v_seg, false) where lead_id = v_lead3;
    if f.aviso is distinct from 'transferencia' then
      raise exception
        'ACEITE FALHOU: lead em proposta há 7 dias saiu como "%", esperado '
        '"transferencia"', coalesce(f.aviso, '<nulo>');
    end if;

    -- f.5) reservar aplica a transferência E deixa rastro, no mesmo comando
    perform public.montar_fila_do_funil(v_seg, true);
    select responsavel into v_txt from public.leads where id = v_lead3;
    -- Mudou de dono é o que importa; para QUEM é assunto de f.8.
    if v_txt is null or v_txt is not distinct from 'Ex-consultor Que Saiu' then
      raise exception
        'ACEITE FALHOU: p_reservar não transferiu o lead (dono ficou "%")',
        coalesce(v_txt, '<nulo>');
    end if;
    if not exists (select 1 from public.leads_eventos
                    where lead_id = v_lead3 and tipo = 'transferencia' and automatico) then
      raise exception
        'ACEITE FALHOU: a transferência automática não entrou no rastro — o '
        'vendedor descobriria a troca de dono por adivinhação.';
    end if;

    -- f.6) o relógio da estagnação NÃO reinicia numa transferência automática
    select minutos_parado into qtd
      from public.montar_fila_do_funil(v_seg + interval '1 minute', false)
     where lead_id = v_lead3;
    if coalesce(qtd, 0) < 10000 then
      raise exception
        'ACEITE FALHOU: o lead transferido nasceu com o relógio zerado (% min). '
        'O dono novo teria o dobro do prazo do antigo.', qtd;
    end if;

    -- f.7) cutucado agora, não se cutuca de novo na mesma rodada
    select suprimido_por into v_txt
      from public.montar_fila_do_funil(v_seg, false) where lead_id = v_lead2;
    if v_txt is distinct from 'alerta_recente' then
      raise exception
        'ACEITE FALHOU: o mesmo lead seria cutucado duas vezes seguidas '
        '(supressão veio "%")', coalesce(v_txt, '<nula>');
    end if;

    -- f.8) O RODÍZIO ESCOLHE O MENOS CARREGADO, não o próximo da lista.
    --      Rodízio cego distribui igual no papel e desigual na prática: quem
    --      está de férias acumula. Uma segunda vendedora, com a carteira cheia,
    --      prova que a escolha olha a carga.
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-funil-vend2@exemplo.invalido', now(), now())
    returning id into v_vend2;
    update public.profiles
       set full_name = 'Aceite Sobrecarregada', papeis = array['comercial'],
           role = 'comercial', telefone_e164 = '+5541999990200'
     where id = v_vend2;

    -- A recém-chegada nasce com cinco leads; a outra, com os do aceite.
    insert into public.leads (nome, situacao, responsavel, ultimo_movimento_em)
    select 'Aceite Carga ' || g, 'em_contato', 'Aceite Sobrecarregada',
           v_seg - interval '1 hour'
      from generate_series(1, 5) g;

    insert into public.leads (nome, telefone, situacao, ultimo_movimento_em)
      values ('Aceite Funil Quatro', '5541999990004', 'novo', v_seg - interval '3 hours')
      returning id into v_lead4;

    select * into f from public.montar_fila_do_funil(v_seg, false) where lead_id = v_lead4;

    -- A asserção RELATIVA. A primeira versão exigia um NOME — e nome só é
    -- previsível num banco vazio; em produção o rodízio escolheu, com toda a
    -- razão, um vendedor real com a carteira menor, e a migração se recusou a
    -- aplicar. Aqui se cobra a regra que a função promete: quem ela escolheu
    -- tem a MENOR carteira aberta entre os elegíveis. Isso vale igual num
    -- banco recém-criado e numa loja com cinco vendedores.
    select count(*) into qtd
      from public.leads x
     where trim(coalesce(x.responsavel, '')) = trim(f.novo_responsavel)
       and x.desfecho is null;

    select min(c.carga) into v_min
      from (
        select (select count(*) from public.leads x
                 where trim(coalesce(x.responsavel, '')) = trim(p.full_name)
                   and x.desfecho is null) as carga
          from public.profiles p
         where p.is_active
           and p.papeis && array['comercial', 'admin']
           and coalesce(trim(p.full_name), '')     <> ''
           and coalesce(trim(p.telefone_e164), '') <> ''
      ) c;

    if f.novo_responsavel is null or qtd is distinct from v_min then
      raise exception
        'ACEITE FALHOU: o rodízio mandou o lead para "%", que tem % leads '
        'abertos, mas há elegível com % — a escolha deve ser sempre a menor '
        'carteira.',
        coalesce(f.novo_responsavel, '<nulo>'), qtd, v_min;
    end if;

    -- f.9) NÃO HÁ TETO DE TRANSFERÊNCIAS, e quem para a roda é o ATENDIMENTO.
    --
    --      Decisão do dono em 2026-08-28: *"quantas se fizerem necessárias até o
    --      atendimento"*. Este bloco prova as duas metades: um lead com cinco
    --      trocas no currículo continua andando, e basta alguém falar com o
    --      cliente para ele sair da fila. Se um teto voltar um dia, é aqui que
    --      ele quebra — e o motivo fica escrito.
    --
    --      Nasce já em `proposta` de propósito: o gatilho reescreve
    --      `ultimo_movimento_em` a cada troca de etapa, e é ele quem manda.
    insert into public.leads (nome, telefone, situacao, responsavel, transferencias, ultimo_movimento_em)
      values ('Aceite Roda Viva', '5541999990005', 'proposta', 'Outro Que Saiu',
              5, v_seg - interval '30 days')
      returning id into v_lead5;

    select * into f from public.montar_fila_do_funil(v_seg, false) where lead_id = v_lead5;
    if f.aviso is distinct from 'transferencia' or f.suprimido_por is not null then
      raise exception
        'ACEITE FALHOU: lead com cinco transferências saiu como "%"/"%" — não há '
        'teto, ele circula até ser atendido.',
        coalesce(f.aviso, '<nulo>'), coalesce(f.suprimido_por, '<nula>');
    end if;

    perform public.montar_fila_do_funil(v_seg, true);
    if (select responsavel from public.leads where id = v_lead5)
         is not distinct from 'Outro Que Saiu' then
      raise exception
        'ACEITE FALHOU: a sexta transferência não aconteceu — algum teto voltou.';
    end if;
    if (select transferencias from public.leads where id = v_lead5) <> 6 then
      raise exception
        'ACEITE FALHOU: o contador de transferências não andou. Sem teto, ele é '
        'a única forma de alguém notar um lead que ninguém quer.';
    end if;

    -- A metade que importa: o atendimento tira o lead da roda.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
    v_contato := public.registrar_contato_do_lead(v_lead5, 'whatsapp');
    perform set_config('request.jwt.claims', '', true);

    select count(*) into qtd
      from public.montar_fila_do_funil(v_contato + interval '1 minute', false)
     where lead_id = v_lead5;
    if qtd <> 0 then
      raise exception
        'ACEITE FALHOU: o lead atendido continuou na roda — "até o atendimento" '
        'exige que o atendimento seja o fim da linha.';
    end if;

    -- f.10) registrar contato para o relógio: o vendedor que acabou de falar com
    --      o cliente não pode ser cobrado por não ter falado com o cliente
    -- Vestindo a sessão da vendedora: `registrar_contato_do_lead` exige staff, e
    -- um `do $$` roda sem JWT nenhum. Chamar sem a sessão provaria que a função
    -- funciona num contexto que a aplicação nunca tem.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_vend, 'role', 'authenticated')::text, true);
    v_contato := public.registrar_contato_do_lead(v_lead2, 'whatsapp');
    perform set_config('request.jwt.claims', '', true);

    -- A fila é consultada a partir do INSTANTE do contato, e não do `v_seg`
    -- fixo: a função carimba `now()`, e um `p_agora` combinado para dias depois
    -- mediria a parada como se o contato não tivesse acontecido.
    select count(*) into qtd
      from public.montar_fila_do_funil(v_contato + interval '1 minute', false)
     where lead_id = v_lead2;
    if qtd <> 0 then
      raise exception
        'ACEITE FALHOU: o lead com contato recém-registrado continuou na fila — '
        'abrir a conversa tem que parar o relógio, senão o vendedor é cobrado '
        'por não ter feito o que acabou de fazer.';
    end if;
    if not exists (select 1 from public.leads_eventos
                    where lead_id = v_lead2 and tipo = 'contato') then
      raise exception 'ACEITE FALHOU: o contato registrado não entrou no rastro';
    end if;

    -- g) a trava do funil: não dá para ficar sem "perdido"
    --
    -- `set constraints all immediate` porque o gatilho é DEFERRABLE INITIALLY
    -- DEFERRED: ele só cobra no COMMIT, e um bloco `do $$` nunca commita. Sem
    -- esta linha o aceite passaria por não executar a trava, que é a forma mais
    -- traiçoeira de teste verde — o adiamento existe para a tela poder salvar
    -- várias etapas de uma vez sem tropeçar num estado intermediário legítimo.
    begin
      update public.funil_etapas set ativa = false where tipo = 'perdido';
      set constraints all immediate;
      raise exception
        'ACEITE FALHOU: desativar a última etapa de perdido passou — o motivo '
        'da perda deixaria de ser coletado sem ninguém ver.';
    exception
      when check_violation then null;  -- é o que tinha que acontecer
    end;


    raise exception 'ensaio concluido' using errcode = 'ACE01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe: é uma falha de aceite
    -- de verdade e a migração tem que parar.
    when sqlstate 'ACE01' then null;
  end;

  raise notice
    'Aceite verificado: o funil aceita etapa nova, a etapa terminal carimba o '
    'desfecho, reabrir limpa, a fila atribui ao menos carregado, avisa, '
    'transfere sem teto até alguém atender, e respeita etapa protegida, '
    'horário e o registro de contato.';
end $aceite$;


-- ---------------------------------------------------------------------------
-- Autoconferência, parte 2: a porta dos fundos, empurrada
-- ---------------------------------------------------------------------------
-- A parte 1 prova que a mecânica funciona. Esta prova a única coisa que, se
-- estiver errada, transforma a funcionalidade em incidente: um cliente da
-- Garagem (authenticated, não staff) NÃO pode ler a base de leads — nem pela
-- tabela, nem pela agenda que agora a inclui.
do $rls$
declare
  v_cliente uuid;
  v_com     uuid;
  v_lead    uuid;
  qtd       int;
begin
  -- Mesmo ensaio em seco do bloco acima, e pela mesma razão: este aqui cria
  -- um cliente da Garagem, um comercial e um lead só para empurrar a porta.
  -- Nenhum dos três tem por que sobreviver à migração, e um `delete` no fim
  -- depende de o bloco chegar ao fim — se uma asserção falhar no meio, o
  -- rastro do ensaio fica na base de produção. O rollback não depende disso.
  begin
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-funil-cli@exemplo.invalido', now(), now())
    returning id into v_cliente;
    update public.profiles set papeis = array['cliente'], role = 'cliente'
     where id = v_cliente;

    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'aceite-funil-com@exemplo.invalido', now(), now())
    returning id into v_com;
    update public.profiles set papeis = array['comercial'], role = 'comercial',
           full_name = 'Aceite Comercial'
     where id = v_com;

    insert into public.leads (nome, telefone, interesse, situacao)
      values ('Aceite RLS do Funil', '5541999990009', 'HB20 2021', 'novo')
      returning id into v_lead;

    -- ---- na pele do cliente da Garagem ----
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_cliente, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into qtd from public.leads where id = v_lead;
    if qtd <> 0 then
      raise exception
        'ACEITE FALHOU: um cliente logado leu % lead(s) direto da tabela. Era '
        'exatamente a brecha que a policy `using (true)` deixava aberta.', qtd;
    end if;

    select count(*) into qtd from public.agenda_de_pessoas where id = v_lead;
    if qtd <> 0 then
      raise exception
        'ACEITE FALHOU: um cliente logado leu % lead(s) pela agenda de pessoas. '
        'A view está furando a RLS de public.leads.', qtd;
    end if;

    reset role;

    -- ---- na pele de quem atende ----
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_com, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into qtd from public.agenda_de_pessoas
     where id = v_lead and papel = 'lead';
    if qtd <> 1 then
      raise exception
        'ACEITE FALHOU: o comercial viu % linha(s) do lead na agenda, esperado 1. '
        'O pedido era que TODO lead aparecesse na aba de clientes e '
        'fornecedores.', qtd;
    end if;

    select count(*) into qtd from public.agenda_de_pessoas
     where id = v_lead and especialidade = 'Novo' and ativo;
    if qtd <> 1 then
      raise exception
        'ACEITE FALHOU: o lead apareceu na agenda sem a etapa do funil ou já '
        'inativo — quem abre a agenda precisa saber em que pé está a conversa.';
    end if;

    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ---- lead perdido sai da lista do dia a dia, sem sair do histórico ----
    update public.leads set situacao = 'perdido' where id = v_lead;
    select count(*) into qtd from public.agenda_de_pessoas
     where id = v_lead and ativo = false;
    if qtd <> 1 then
      raise exception
        'ACEITE FALHOU: o lead perdido continuou ativo na agenda — ele tem que '
        'sair do filtro padrão e continuar alcançável em "todos".';
    end if;


    raise exception 'ensaio concluido' using errcode = 'ACE01';
  exception
    when sqlstate 'ACE01' then null;
  end;

  raise notice
    'Aceite verificado: o cliente da Garagem não alcança lead nem pela tabela '
    'nem pela agenda; o comercial vê o lead com a etapa do funil; lead '
    'perdido sai do filtro padrão sem sair da base.';
end $rls$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260828120000', 'funil_de_vendas')
on conflict (version) do nothing;
