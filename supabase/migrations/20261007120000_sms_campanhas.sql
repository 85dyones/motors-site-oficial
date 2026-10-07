-- ============================================================================
-- As campanhas de SMS por veículo — quem recebe, o que saiu e o que voltou
-- ============================================================================
-- Pedido do dono (2026-10-07): criar campanhas de SMS no painel
-- (`/admin/marketing/sms`) escolhendo um carro do estoque e um critério de
-- público ("quem demonstrou interesse neste carro / neste modelo / nesta marca
-- / em preço parecido"), enviar pela APIBrasil e acompanhar cada campanha:
-- enviados, na operadora, cliques no link curto, respostas e pedidos de saída.
-- Quem cria e envia é a linha nova da matriz, "Criar e enviar campanhas de
-- SMS": Administrador e Marketing.
--
-- A parte pura (tamanho da mensagem, molde, público, leitura do retorno) mora
-- em `src/lib/smsCampanhas.ts`. As listas fechadas daqui são as de lá:
-- `CRITERIOS_DE_PUBLICO`, `JANELAS_DE_INTERESSE`, `SITUACOES_DA_CAMPANHA`,
-- `SITUACOES_DO_ENVIO`, `ALFABETO_DO_CODIGO`/`TAMANHO_DO_CODIGO`, e o telefone
-- no formato que `telefoneParaSms` devolve.
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.sms_campanhas` — uma linha por campanha: o carro (retrato do nome
--    e caminho da ficha), o critério, a janela, o molde da mensagem e a
--    situação. `codigo` vai no `utm_campaign` (`sms-<codigo>`).
-- 2. `public.sms_envios` — uma linha por destinatário de uma campanha: o
--    telefone, a mensagem final, o código do link curto (`/s/<codigo>`) e tudo
--    o que aconteceu depois (aceito, na operadora, clique, resposta, saída).
-- 3. `public.sms_descadastros` — quem pediu para sair. Vale para todas as
--    campanhas: `montarPublico` tira esses números antes de qualquer envio.
-- 4. Três funções, só para a chave de serviço:
--      sms_reservar_envios(campanha, limite) ... reserva atômica de um lote
--      sms_registrar_clique(codigo) ............ soma o clique e devolve o destino
--      sms_devolver_presos(campanha, minutos) .. fecha como falha o envio que
--                                                ficou no meio do caminho
--
-- ---------------------------------------------------------------------------
-- Dado pessoal: a tela não lê telefone, e o banco não deixa
-- ---------------------------------------------------------------------------
-- O papel Marketing não lê contato de lead (matriz: "Ver e mover leads no
-- kanban" é `nao_ve`), e é ele quem opera as campanhas. Por isso telefone e
-- nome de destinatário ficam em duas tabelas que `authenticated` NÃO lê:
-- `sms_envios` e `sms_descadastros` não têm privilégio nem policy para o
-- painel, e ler direto é 42501. Todo acesso a elas é do servidor, com a chave
-- de serviço, que devolve à tela só contagem, primeiro nome e telefone
-- mascarado (`EnvioNaTela`). Vale para o Administrador também: a porta é uma só.
--
-- `sms_campanhas` não tem dado de pessoa. Administrador e Marketing a leem
-- pelo painel (uma policy de SELECT); ninguém a escreve pelo painel: quem
-- grava é o servidor, depois de autorizar pela matriz. Tentar direto é 42501.
--
-- O envio aponta para o lead (`lead_id`, uuid, a chave de `public.leads`) com
-- `on delete cascade`: eliminar o lead (LGPD, art. 18, VI) leva junto o
-- telefone, o nome e a resposta que ficaram no envio. O descadastro NÃO aponta
-- para o lead e fica: é o registro da oposição (art. 18, § 2º), e apagá-lo
-- faria o mesmo número voltar a receber mensagem por outro lead.
--
-- O carro é `veiculo_id` SEM chave estrangeira: o carro sai do estoque e a
-- campanha fica, com o nome dele guardado em `veiculo_rotulo`. `estoque_motors`
-- não é tocada nem referenciada.
--
-- ---------------------------------------------------------------------------
-- Nunca reenviar sozinho o que pode ter saído
-- ---------------------------------------------------------------------------
-- O lote é reservado por `sms_reservar_envios`: marca `enviando` e carimba
-- `tentado_em` numa instrução só, com `for update skip locked`, e duas chamadas
-- ao mesmo tempo não recebem a mesma linha. Só reserva com a campanha em
-- `enviando` (rascunho e interrompida devolvem vazio), e a linha da campanha
-- fica travada para leitura durante a reserva: interromper espera o lote
-- reservado, e o seguinte já não sai.
--
-- Se a função do servidor morrer entre reservar e ouvir o fornecedor, o envio
-- fica em `enviando` sem `fornecedor_id`. Ele NÃO volta para a fila: o SMS
-- pode ter saído, e devolver à fila é arriscar a mesma pessoa receber duas
-- vezes. `sms_devolver_presos` o fecha como `falhou`, com o motivo escrito, e
-- quem decide reenviar é uma pessoa. (O nome da função é o do pedido; o que
-- ela devolve é a contagem, e não o envio à fila.)
--
-- ---------------------------------------------------------------------------
-- As regras, e quem as segura
-- ---------------------------------------------------------------------------
--   sms_campanhas_nome_valido ........... 1 a 80 caracteres, e não só espaço
--   sms_campanhas_codigo_valido ......... 7 caracteres de 23456789abcdefghjkmnpqrstuvwxyz
--   sms_campanhas_codigo_unico .......... um código, uma campanha
--   sms_campanhas_destino_e_caminho ..... começa com '/', sem domínio ('//' não)
--   sms_campanhas_criterio_valido ....... mesmo_veiculo, mesmo_modelo, mesma_marca, faixa_de_preco
--   sms_campanhas_janela_valida ......... nula (sem limite) ou 30, 90, 180, 365
--   sms_campanhas_mensagem_tem_link ..... o molde contém {link}
--   sms_campanhas_situacao_valida ....... rascunho, enviando, enviada, interrompida
--
--   sms_envios_telefone_valido .......... 55 + DDD + celular de 9 dígitos, só dígitos
--   sms_envios_codigo_valido ............ o mesmo alfabeto, 7 caracteres
--   sms_envios_codigo_unico ............. um código, um destinatário
--   sms_envios_um_por_telefone .......... (campanha, telefone): a mesma campanha
--                                         não vai duas vezes ao mesmo número
--   sms_envios_partes_validas ........... 1 a 3 (PARTES_MAXIMAS)
--   sms_envios_situacao_valida .......... na_fila, enviando, enviado, falhou
--   sms_envios_custo_valido ............. nulo ou >= 0
--   sms_envios_cliques_validos .......... >= 0
--   sms_envios_resposta_curta ........... até 500 caracteres
--   sms_envios_campanha_id_fkey ......... apagar a campanha leva os envios
--   sms_envios_lead_id_fkey ............. eliminar o lead leva o envio
--
--   sms_descadastros_pkey ............... (org, telefone): sai uma vez só
--   sms_descadastros_telefone_valido .... o mesmo formato do envio
--   sms_descadastros_origem_valida ...... resposta ou painel
--   sms_descadastros_campanha_id_fkey ... apagar a campanha NÃO apaga a saída
--
-- Nenhuma destas é tabela de parâmetro (não há valor vigente a encerrar) nem
-- de evento append-only: campanha e envio mudam de situação por desenho.
--
-- ⚠️ DESFAZER (nada mais depende destes objetos; os envios e as saídas
--    registradas se perdem — exporte antes se já houve campanha de verdade):
--
--   begin;
--   drop function if exists public.sms_devolver_presos(uuid, integer);
--   drop function if exists public.sms_registrar_clique(text);
--   drop function if exists public.sms_reservar_envios(uuid, integer);
--   drop table    if exists public.sms_descadastros;
--   drop table    if exists public.sms_envios;
--   drop table    if exists public.sms_campanhas;
--   delete from supabase_migrations.schema_migrations where version = '20261007120000';
--   commit;
--
-- Aditiva (três tabelas e três funções novas; nenhuma coluna, policy ou
-- gatilho em tabela existente; `leads` só ganha quem aponta para ela;
-- `estoque_motors` não é tocada) e idempotente: `create table if not exists`,
-- `create index if not exists`, `create or replace`, `drop policy if exists` +
-- `create policy`, revoke/grant e comment reaplicáveis.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
begin
  if to_regprocedure('public.tem_papel(uuid, text)') is null
     or to_regprocedure('public.org_padrao()') is null then
    raise exception
      'DEPENDÊNCIA: falta tem_papel(uuid, text) ou org_padrao(). Nada foi aplicado.';
  end if;
  if public.org_padrao() is null then
    raise exception
      'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;
  -- O envio aponta para o lead: a chave de `leads` tem de ser `id uuid`.
  if to_regclass('public.leads') is null
     or not exists (select 1
                      from pg_constraint c
                      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
                     where c.conrelid = 'public.leads'::regclass
                       and c.contype = 'p' and cardinality(c.conkey) = 1
                       and a.attname = 'id' and a.atttypid = 'uuid'::regtype) then
    raise exception
      'DEPENDÊNCIA: public.leads não existe ou a chave dela não é id uuid. Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. A campanha
-- ----------------------------------------------------------------------------
create table if not exists public.sms_campanhas (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default public.org_padrao(),
  nome             text not null,
  codigo           text not null,
  veiculo_id       bigint not null,
  veiculo_rotulo   text not null,
  destino          text not null,
  criterio         text not null,
  janela_dias      integer,
  mensagem         text not null,
  situacao         text not null default 'rascunho',
  homologacao      boolean not null default false,
  criado_por       uuid,
  criado_por_nome  text,
  criado_em        timestamptz not null default now(),
  enviada_em       timestamptz,
  interrompida_em  timestamptz,

  constraint sms_campanhas_nome_valido
    check (char_length(nome) between 1 and 80 and btrim(nome) <> ''),
  constraint sms_campanhas_codigo_valido
    check (codigo ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{7}$'),
  constraint sms_campanhas_codigo_unico
    unique (codigo),
  constraint sms_campanhas_destino_e_caminho
    check (destino ~ '^/[^/]'),
  constraint sms_campanhas_criterio_valido
    check (criterio in ('mesmo_veiculo', 'mesmo_modelo', 'mesma_marca', 'faixa_de_preco')),
  constraint sms_campanhas_janela_valida
    check (janela_dias is null or janela_dias in (30, 90, 180, 365)),
  constraint sms_campanhas_mensagem_tem_link
    check (position('{link}' in mensagem) > 0),
  constraint sms_campanhas_situacao_valida
    check (situacao in ('rascunho', 'enviando', 'enviada', 'interrompida'))
);

-- A lista do painel: as mais recentes primeiro.
create index if not exists sms_campanhas_recentes_idx
  on public.sms_campanhas (org_id, criado_em desc);

comment on table public.sms_campanhas is
  'Campanhas de SMS por veículo (2026-10-07), criadas em /admin/marketing/sms e '
  'enviadas pela APIBrasil. Uma linha por campanha: o carro, o critério de '
  'público, o molde da mensagem e a situação. SEM dado de pessoa: os '
  'destinatários ficam em sms_envios, que o painel não lê. Administrador e '
  'Marketing leem; ninguém escreve pelo painel (quem grava é o servidor, com a '
  'chave de serviço, depois de autorizar pela matriz). Ver '
  '20261007120000_sms_campanhas.sql.';
comment on column public.sms_campanhas.nome is
  'O nome que a equipe deu à campanha. 1 a 80 caracteres (TAMANHO_MAXIMO_DO_NOME).';
comment on column public.sms_campanhas.codigo is
  'Sete caracteres de 23456789abcdefghjkmnpqrstuvwxyz (ALFABETO_DO_CODIGO, sem '
  '0/o e 1/l/i). Vai no utm_campaign com que o clique chega à ficha: sms-<codigo>.';
comment on column public.sms_campanhas.veiculo_id is
  'O carro da campanha: estoque_motors.id. SEM chave estrangeira, de propósito: '
  'o carro sai do estoque e a campanha fica.';
comment on column public.sms_campanhas.veiculo_rotulo is
  'Retrato do nome do carro quando a campanha foi criada. Sobrevive à venda.';
comment on column public.sms_campanhas.destino is
  'O caminho da ficha para onde o link curto leva, sem domínio: começa com '
  '''/'' e não com ''//''. As marcas de UTM são postas pelo código (destinoDoClique).';
comment on column public.sms_campanhas.criterio is
  'Quem recebe, em relação ao carro: mesmo_veiculo, mesmo_modelo, mesma_marca '
  'ou faixa_de_preco (CRITERIOS_DE_PUBLICO em src/lib/smsCampanhas.ts).';
comment on column public.sms_campanhas.janela_dias is
  'Há quantos dias, no máximo, o interesse aconteceu: 30, 90, 180 ou 365. '
  'NULO é sem limite (JANELAS_DE_INTERESSE).';
comment on column public.sms_campanhas.mensagem is
  'O MOLDE, com as variáveis ({nome}, {carro}, {preco}, {link}). Tem de conter '
  '{link}: sem ele não há como medir quem abriu. A mensagem final de cada '
  'destinatário fica em sms_envios.texto.';
comment on column public.sms_campanhas.situacao is
  'rascunho (público montado, nada saiu), enviando (os lotes estão saindo; só '
  'nesta situação sms_reservar_envios reserva), enviada ou interrompida.';
comment on column public.sms_campanhas.homologacao is
  'A campanha rodou no modo de teste do fornecedor: nenhum SMS saiu de verdade.';
comment on column public.sms_campanhas.criado_por is
  'auth.uid() de quem criou, gravado pelo servidor a partir da sessão.';
comment on column public.sms_campanhas.criado_por_nome is
  'Nome de quem criou, para continuar legível quando a pessoa sair da loja.';


-- ----------------------------------------------------------------------------
-- 2. O envio — uma linha por destinatário. DADO PESSOAL.
-- ----------------------------------------------------------------------------
create table if not exists public.sms_envios (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default public.org_padrao(),
  campanha_id      uuid not null,
  lead_id          uuid,
  telefone         text not null,
  nome             text,
  codigo           text not null,
  texto            text not null,
  partes           integer not null default 1,
  situacao         text not null default 'na_fila',
  fornecedor_id    text,
  custo            numeric(10,4),
  erro             text,
  tentado_em       timestamptz,
  enviado_em       timestamptz,
  aceito_em        timestamptz,
  na_operadora_em  timestamptz,
  cliques          integer not null default 0,
  clicou_em        timestamptz,
  respondeu_em     timestamptz,
  resposta         text,
  saiu_em          timestamptz,
  criado_em        timestamptz not null default now(),

  constraint sms_envios_campanha_id_fkey
    foreign key (campanha_id) references public.sms_campanhas (id) on delete cascade,
  constraint sms_envios_lead_id_fkey
    foreign key (lead_id) references public.leads (id) on delete cascade,
  constraint sms_envios_telefone_valido
    check (telefone ~ '^55[1-9][0-9]9[0-9]{8}$'),
  constraint sms_envios_codigo_valido
    check (codigo ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{7}$'),
  constraint sms_envios_codigo_unico
    unique (codigo),
  constraint sms_envios_um_por_telefone
    unique (campanha_id, telefone),
  constraint sms_envios_partes_validas
    check (partes between 1 and 3),
  constraint sms_envios_situacao_valida
    check (situacao in ('na_fila', 'enviando', 'enviado', 'falhou')),
  constraint sms_envios_custo_valido
    check (custo is null or custo >= 0),
  constraint sms_envios_cliques_validos
    check (cliques >= 0),
  constraint sms_envios_resposta_curta
    check (resposta is null or char_length(resposta) <= 500)
);

-- A fila de uma campanha e o resumo dela.
create index if not exists sms_envios_fila_idx
  on public.sms_envios (campanha_id, situacao);
-- O webhook do fornecedor acha a linha pelo id que ele mesmo deu.
create index if not exists sms_envios_fornecedor_idx
  on public.sms_envios (fornecedor_id) where fornecedor_id is not null;
-- A eliminação de um lead não varre a tabela inteira atrás dos envios dele.
create index if not exists sms_envios_lead_idx
  on public.sms_envios (lead_id) where lead_id is not null;

comment on table public.sms_envios is
  'Os destinatários de cada campanha de SMS (2026-10-07): uma linha por número '
  'por campanha, com a mensagem final, o código do link curto e o que voltou do '
  'fornecedor. DADO PESSOAL (telefone, nome, resposta). O painel NÃO lê: sem '
  'privilégio e sem policy para authenticated, porque o papel Marketing opera '
  'as campanhas e não lê contato de lead. Só o servidor, com a chave de '
  'serviço, que devolve à tela contagem, primeiro nome e telefone mascarado. '
  'Vai embora com a campanha e com o lead. Ver 20261007120000_sms_campanhas.sql.';
comment on column public.sms_envios.lead_id is
  'O lead de onde o número veio. ON DELETE CASCADE: eliminar o lead (LGPD, '
  'art. 18, VI) leva o envio junto.';
comment on column public.sms_envios.telefone is
  'Só dígitos, com 55 e DDD, celular de 9 dígitos ("5541999990000") — o que '
  'telefoneParaSms devolve. Fixo não entra. NUNCA vai inteiro para o navegador.';
comment on column public.sms_envios.nome is
  'O nome do lead quando o público foi montado. A tela mostra só o primeiro.';
comment on column public.sms_envios.codigo is
  'O código do link curto deste destinatário: /s/<codigo>. Sete caracteres do '
  'mesmo alfabeto do código da campanha.';
comment on column public.sms_envios.texto is
  'A mensagem FINAL enviada a este número: o molde com as variáveis trocadas, '
  'sem acento e com o rodapé de saída.';
comment on column public.sms_envios.partes is
  'Quantos SMS o fornecedor cobra por esta mensagem: 1 a 3 (PARTES_MAXIMAS).';
comment on column public.sms_envios.situacao is
  'na_fila; enviando (reservado por sms_reservar_envios); enviado (o fornecedor '
  'aceitou); falhou (recusado, ou interrompido antes da resposta — ver erro).';
comment on column public.sms_envios.fornecedor_id is
  'O id que a APIBrasil devolveu ao aceitar o SMS. É por ele que o webhook de '
  'retorno acha a linha.';
comment on column public.sms_envios.custo is
  'O que o fornecedor disse ter cobrado por este SMS, em reais. Nulo se não disse.';
comment on column public.sms_envios.tentado_em is
  'Quando o envio foi reservado para sair. É dele que sms_devolver_presos conta os minutos.';
comment on column public.sms_envios.na_operadora_em is
  'Quando o fornecedor avisou que a operadora recebeu (sent_to_carrier). É o '
  'mais perto de "entregue" que ele informa.';
comment on column public.sms_envios.cliques is
  'Quantas vezes o link curto foi aberto. Só sms_registrar_clique soma.';
comment on column public.sms_envios.clicou_em is
  'O PRIMEIRO clique. Os seguintes somam em cliques e não mexem aqui.';
comment on column public.sms_envios.resposta is
  'O texto que a pessoa respondeu, até 500 caracteres. Dado pessoal.';
comment on column public.sms_envios.saiu_em is
  'Quando a resposta foi um pedido de saída (ver sms_descadastros).';


-- ----------------------------------------------------------------------------
-- 3. Quem pediu para sair — vale para todas as campanhas
-- ----------------------------------------------------------------------------
create table if not exists public.sms_descadastros (
  org_id       uuid not null default public.org_padrao(),
  telefone     text not null,
  origem       text not null,
  campanha_id  uuid,
  criado_em    timestamptz not null default now(),

  constraint sms_descadastros_pkey
    primary key (org_id, telefone),
  constraint sms_descadastros_telefone_valido
    check (telefone ~ '^55[1-9][0-9]9[0-9]{8}$'),
  constraint sms_descadastros_origem_valida
    check (origem in ('resposta', 'painel')),
  constraint sms_descadastros_campanha_id_fkey
    foreign key (campanha_id) references public.sms_campanhas (id) on delete set null
);

comment on table public.sms_descadastros is
  'Números que pediram para não receber mais SMS da loja (2026-10-07). É o '
  'direito de oposição (LGPD, art. 18, § 2º) ao legítimo interesse: vale para '
  'TODAS as campanhas, e montarPublico tira esses números antes de qualquer '
  'envio. DADO PESSOAL: o painel não lê (sem privilégio e sem policy para '
  'authenticated); só o servidor, com a chave de serviço. Não some com a '
  'campanha nem com o lead: apagar a saída faria o número voltar a receber.';
comment on column public.sms_descadastros.telefone is
  'Só dígitos, com 55 e DDD — o mesmo formato de sms_envios.telefone.';
comment on column public.sms_descadastros.origem is
  'resposta (a pessoa respondeu SAIR a um SMS) ou painel (a equipe registrou o pedido).';
comment on column public.sms_descadastros.campanha_id is
  'A campanha a que a pessoa respondeu, quando houve. Apagar a campanha deixa '
  'nulo aqui e a saída continua valendo.';


-- ----------------------------------------------------------------------------
-- 4. Privilégio e RLS
-- ----------------------------------------------------------------------------
revoke all on public.sms_campanhas, public.sms_envios, public.sms_descadastros
  from public, anon, authenticated;

-- O painel lê a campanha, e só a campanha. Nada de escrita: quem grava é o
-- servidor, com a chave de serviço, depois de autorizar pela matriz.
grant select on public.sms_campanhas to authenticated;

grant select, insert, update, delete, truncate, references, trigger
  on public.sms_campanhas, public.sms_envios, public.sms_descadastros to service_role;

alter table public.sms_campanhas    enable row level security;
alter table public.sms_envios       enable row level security;
alter table public.sms_descadastros enable row level security;

drop policy if exists sms_campanhas_leitura on public.sms_campanhas;

-- A linha "Criar e enviar campanhas de SMS" da matriz
-- (PAPEIS_DAS_CAMPANHAS_DE_SMS): Administrador e Marketing. `tem_papel` já
-- exige conta ativa.
create policy sms_campanhas_leitura on public.sms_campanhas
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'marketing'))
  );

comment on policy sms_campanhas_leitura on public.sms_campanhas is
  'Lê a campanha quem a matriz deixa criar e enviar: Administrador e Marketing, '
  'com conta ativa. Não há policy de INSERT, UPDATE nem DELETE: o painel não escreve.';

-- `sms_envios` e `sms_descadastros`: RLS ligada e NENHUMA policy, de propósito.
-- São telefone e nome de lead, e o papel que opera as campanhas (Marketing)
-- não lê contato de lead. Sem privilégio, ler direto é 42501; a RLS sem policy
-- é a segunda tranca, para o dia em que alguém conceder um SELECT por engano.
-- A chave de serviço passa pelas duas.


-- ----------------------------------------------------------------------------
-- 5. As três portas do servidor
-- ----------------------------------------------------------------------------

-- 5a. Reserva atômica de um lote.
create or replace function public.sms_reservar_envios(p_campanha uuid, p_limite integer)
  returns setof public.sms_envios
  language plpgsql
  security definer
  set search_path = public
as $fn$
begin
  -- Só com a campanha em `enviando`. A linha fica travada para leitura até o
  -- fim da reserva: quem interrompe a campanha espera este lote, e o próximo
  -- já encontra a situação nova.
  perform 1
     from public.sms_campanhas c
    where c.id = p_campanha and c.situacao = 'enviando'
      for share;
  if not found then
    return;
  end if;

  -- O lote: os mais antigos da fila, entre 1 e 200 (nulo conta como 1). `skip
  -- locked` é o que impede duas chamadas simultâneas de receber a mesma linha:
  -- a que chega depois pula o que a primeira já travou.
  return query
    with lote as materialized (
      select f.id
        from public.sms_envios f
       where f.campanha_id = p_campanha
         and f.situacao = 'na_fila'
       order by f.criado_em, f.id
       limit greatest(1, least(coalesce(p_limite, 1), 200))
         for update skip locked
    )
    update public.sms_envios e
       set situacao   = 'enviando',
           tentado_em = now()
      from lote
     where e.id = lote.id
    returning e.*;
end;
$fn$;

comment on function public.sms_reservar_envios(uuid, integer) is
  'Reserva um lote de envios de uma campanha de SMS: os mais antigos da fila '
  '(entre 1 e 200) passam a enviando, com tentado_em = now(), e são devolvidos. '
  'FOR UPDATE SKIP LOCKED: duas chamadas ao mesmo tempo não recebem a mesma '
  'linha. Só reserva com a campanha em enviando; senão devolve vazio. Só '
  'service_role executa.';

-- 5b. O clique no link curto.
create or replace function public.sms_registrar_clique(p_codigo text)
  returns table (destino text, campanha_codigo text)
  language sql
  security definer
  set search_path = public
as $fn$
  with clicado as (
    update public.sms_envios e
       set cliques   = e.cliques + 1,
           clicou_em = coalesce(e.clicou_em, now())
     where e.codigo = p_codigo
    returning e.campanha_id
  )
  select c.destino, c.codigo
    from clicado k
    join public.sms_campanhas c on c.id = k.campanha_id;
$fn$;

comment on function public.sms_registrar_clique(text) is
  'O clique em /s/<codigo>: soma 1 em cliques, guarda o primeiro clicou_em e '
  'devolve o destino (caminho da ficha) e o código da campanha, para a rota '
  'redirecionar com as marcas de UTM. Código desconhecido devolve zero linhas, '
  'sem erro. Não devolve dado de pessoa. Só service_role executa.';

-- 5c. O que ficou no meio do caminho vira falha — nunca volta para a fila.
create or replace function public.sms_devolver_presos(p_campanha uuid, p_minutos integer default 10)
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_quantos integer;
begin
  update public.sms_envios e
     set situacao = 'falhou',
         erro     = 'O envio foi interrompido antes da resposta do fornecedor; pode ter sido entregue.'
   where e.campanha_id = p_campanha
     and e.situacao = 'enviando'
     and e.fornecedor_id is null
     and coalesce(e.tentado_em, e.criado_em)
           < now() - make_interval(mins => greatest(coalesce(p_minutos, 10), 1));
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$fn$;

comment on function public.sms_devolver_presos(uuid, integer) is
  'Fecha os envios de uma campanha que ficaram em enviando há mais de '
  'p_minutos (padrão 10, mínimo 1) SEM fornecedor_id — a função do servidor '
  'morreu entre reservar e ouvir o fornecedor. Marca falhou, com o motivo em '
  'erro, e devolve quantos. NÃO devolve à fila: o SMS pode ter saído, e '
  'reenviar sozinho é arriscar mensagem em dobro. Só service_role executa.';

revoke all on function public.sms_reservar_envios(uuid, integer)  from public, anon, authenticated;
revoke all on function public.sms_registrar_clique(text)          from public, anon, authenticated;
revoke all on function public.sms_devolver_presos(uuid, integer)  from public, anon, authenticated;
grant execute on function public.sms_reservar_envios(uuid, integer)  to service_role;
grant execute on function public.sms_registrar_clique(text)          to service_role;
grant execute on function public.sms_devolver_presos(uuid, integer)  to service_role;


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. O efeito cria usuários de sonda (admin,
-- marketing, comercial, um marketing desativado), um lead e quatro campanhas
-- com destinatários; veste cada sessão e tenta ler, escrever e chamar as
-- funções; tenta gravar o inválido em cada regra; e usa as três funções como
-- o servidor usa, vestindo service_role. Tudo num sub-bloco que termina com um
-- sentinela, e o rollback do sub-bloco leva tudo junto. As variáveis
-- sobrevivem ao rollback, e é por elas que o veredito sai.
--
-- O que este bloco NÃO prova: a disputa de duas sessões pelo mesmo lote. Um
-- `do` é uma transação só. Prova-se aqui que chamadas seguidas não repetem
-- linha; o `skip locked` é conferido pelo texto da função.
do $aceite$
declare
  falhas            int := 0;
  v_alf             constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  v_tabelas         constant text[] := array['sms_campanhas', 'sms_envios', 'sms_descadastros'];
  v_funcoes         constant text[] := array['public.sms_reservar_envios(uuid, integer)',
                                             'public.sms_registrar_clique(text)',
                                             'public.sms_devolver_presos(uuid, integer)'];
  v_erro_preso      constant text := 'O envio foi interrompido antes da resposta do fornecedor; pode ter sido entregue.';
  v_nome            text;
  v_priv            text;
  v_caso            record;
  v_msg             text;
  v_obtido          text;
  v_n               bigint;
  v_uid             uuid;
  v_papel           text;
  v_ids             jsonb := '{}'::jsonb;
  v_cli             uuid := gen_random_uuid();   -- authenticated sem perfil: cliente
  v_antes           bigint[];
  v_depois          bigint[];
  v_restou          bigint;

  -- a sonda
  v_lead            uuid;
  v_a               uuid;   -- enviando, 5 destinatários
  v_b               uuid;   -- rascunho, 2 destinatários
  v_c               uuid;   -- enviando, 205 destinatários (o teto do lote)
  v_outra           uuid;   -- de outra org
  v_bases           jsonb;
  v_cod1            text;
  v_lote1           uuid[];
  v_lote2           uuid[];
  v_ontem           timestamptz;

  -- o que a sonda viu antes de ser desfeita
  v_sessoes         int := 0;
  v_sessoes_erradas text[] := '{}';
  v_regras          int := 0;
  v_regras_erradas  text[] := '{}';
  v_controles       int := 0;
  v_unicas          int := 0;
  v_unicas_erradas  text[] := '{}';
  v_mesmo_numero    boolean := false;
  v_rascunho        bigint := -1;
  v_rascunho_fila   bigint := -1;
  v_inexistente     bigint := -1;
  v_lote1_ok        boolean := false;
  v_lote2_n         int := -1;
  v_repetiu         boolean := true;
  v_lote3_n         bigint := -1;
  v_lote4_n         bigint := -1;
  v_piso_n          bigint := -1;
  v_nulo_n          bigint := -1;
  v_teto_n          bigint := -1;
  v_sobrou          bigint := -1;
  v_interrompida    bigint := -1;
  v_clique1         text := '<não rodou>';
  v_clique1_linha   boolean := false;
  v_clique2_linha   boolean := false;
  v_clique_vazio    bigint := -1;
  v_clique_outros   bigint := -1;
  v_presos1         int := -1;
  v_presos1_linhas  boolean := false;
  v_presos2         int := -1;
  v_presos2_linhas  boolean := false;
  v_presos_vizinha  bigint := -1;
  v_lead_levou      bigint := -1;
  v_campanha_levou  bigint := -1;
  v_saida_ficou     boolean := false;
begin
  if current_user in ('authenticated', 'anon', 'service_role') then
    raise exception 'ACEITE INCONCLUSIVO: a migração roda como papel de API (%)', current_user;
  end if;

  -- 1 · As três tabelas, com RLS e comentário.
  foreach v_nome in array v_tabelas loop
    if not exists (select 1 from pg_class
                    where oid = ('public.' || v_nome)::regclass and relrowsecurity) then
      raise exception 'ACEITE FALHOU: % sem RLS', v_nome;
    end if;
    if obj_description(('public.' || v_nome)::regclass, 'pg_class') is null then
      falhas := falhas + 1;
      raise warning 'FALHOU: % sem comentário', v_nome;
    end if;
  end loop;

  -- 2 · As regras existem com nome, do tipo certo e validadas. Nas chaves
  --     estrangeiras, o alvo e o que acontece ao apagar ('c' leva junto, 'n'
  --     anula) também são conferidos.
  for v_caso in
    select * from (values
      ('sms_campanhas',    'sms_campanhas_nome_valido',         'c', null::text, null::text),
      ('sms_campanhas',    'sms_campanhas_codigo_valido',       'c', null, null),
      ('sms_campanhas',    'sms_campanhas_codigo_unico',        'u', null, null),
      ('sms_campanhas',    'sms_campanhas_destino_e_caminho',   'c', null, null),
      ('sms_campanhas',    'sms_campanhas_criterio_valido',     'c', null, null),
      ('sms_campanhas',    'sms_campanhas_janela_valida',       'c', null, null),
      ('sms_campanhas',    'sms_campanhas_mensagem_tem_link',   'c', null, null),
      ('sms_campanhas',    'sms_campanhas_situacao_valida',     'c', null, null),
      ('sms_envios',       'sms_envios_telefone_valido',        'c', null, null),
      ('sms_envios',       'sms_envios_codigo_valido',          'c', null, null),
      ('sms_envios',       'sms_envios_codigo_unico',           'u', null, null),
      ('sms_envios',       'sms_envios_um_por_telefone',        'u', null, null),
      ('sms_envios',       'sms_envios_partes_validas',         'c', null, null),
      ('sms_envios',       'sms_envios_situacao_valida',        'c', null, null),
      ('sms_envios',       'sms_envios_custo_valido',           'c', null, null),
      ('sms_envios',       'sms_envios_cliques_validos',        'c', null, null),
      ('sms_envios',       'sms_envios_resposta_curta',         'c', null, null),
      ('sms_envios',       'sms_envios_campanha_id_fkey',       'f', 'sms_campanhas', 'c'),
      ('sms_envios',       'sms_envios_lead_id_fkey',           'f', 'leads',         'c'),
      ('sms_descadastros', 'sms_descadastros_pkey',             'p', null, null),
      ('sms_descadastros', 'sms_descadastros_telefone_valido',  'c', null, null),
      ('sms_descadastros', 'sms_descadastros_origem_valida',    'c', null, null),
      ('sms_descadastros', 'sms_descadastros_campanha_id_fkey', 'f', 'sms_campanhas', 'n')
    ) as t(tabela, regra, tipo, alvo, ao_apagar)
  loop
    if not exists (select 1 from pg_constraint
                    where conrelid = ('public.' || v_caso.tabela)::regclass
                      and conname = v_caso.regra
                      and contype = v_caso.tipo::"char"
                      and convalidated
                      and (v_caso.alvo is null
                           or (confrelid = ('public.' || v_caso.alvo)::regclass
                               and confdeltype = v_caso.ao_apagar::"char"))) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente em %, de outro tipo, não validada ou apontando para outro lugar',
        v_caso.regra, v_caso.tabela;
    end if;
  end loop;

  -- A fila de 'sms_envios_um_por_telefone' é (campanha_id, telefone), nesta ordem.
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.sms_envios'::regclass and conname = 'sms_envios_um_por_telefone')
     is distinct from 'UNIQUE (campanha_id, telefone)' then
    falhas := falhas + 1;
    raise warning 'FALHOU: sms_envios_um_por_telefone não é UNIQUE (campanha_id, telefone)';
  end if;

  -- Nada aponta para o estoque: o carro sai e a campanha fica.
  if exists (select 1 from pg_constraint
              where confrelid = 'public.estoque_motors'::regclass
                and conrelid in ('public.sms_campanhas'::regclass, 'public.sms_envios'::regclass,
                                 'public.sms_descadastros'::regclass)) then
    falhas := falhas + 1;
    raise warning 'FALHOU: há chave estrangeira das tabelas de SMS para estoque_motors';
  end if;

  -- 3 · Privilégio. anon: nada, nas três. authenticated: SELECT em
  --     sms_campanhas e só ele; NADA em sms_envios e sms_descadastros.
  --     service_role: lê e escreve nas três.
  foreach v_nome in array v_tabelas loop
    foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || v_nome, v_priv) then
        falhas := falhas + 1;
        raise warning 'FALHOU: anon tem % em %', v_priv, v_nome;
      end if;
      if has_table_privilege('authenticated', 'public.' || v_nome, v_priv)
         and not (v_nome = 'sms_campanhas' and v_priv = 'SELECT') then
        falhas := falhas + 1;
        raise warning 'FALHOU: authenticated tem % em %', v_priv, v_nome;
      end if;
    end loop;
    foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if not has_table_privilege('service_role', 'public.' || v_nome, v_priv) then
        falhas := falhas + 1;
        raise warning 'FALHOU: service_role sem % em %: o servidor não teria como trabalhar', v_priv, v_nome;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('authenticated', 'public.sms_campanhas', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated sem SELECT em sms_campanhas: o painel não lista as campanhas';
  end if;

  -- 4 · Policies: uma, de leitura, em sms_campanhas; nenhuma nas outras duas.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'sms_campanhas';
  if v_n <> 1 or not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'sms_campanhas'
                                and policyname = 'sms_campanhas_leitura' and cmd = 'SELECT'
                                and permissive = 'PERMISSIVE'
                                and roles = array['authenticated']::name[]) then
    falhas := falhas + 1;
    raise warning 'FALHOU: esperado só sms_campanhas_leitura (SELECT, authenticated) em sms_campanhas (achei % policy(ies))', v_n;
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename in ('sms_envios', 'sms_descadastros');
  if v_n <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: sms_envios e sms_descadastros deveriam não ter policy nenhuma (achei %)', v_n;
  end if;

  -- 5 · As três funções: SECURITY DEFINER, search_path fixo, comentadas, e só
  --     service_role executa. `proacl` nulo seria o default do Postgres, que dá
  --     EXECUTE a PUBLIC; por isso ele tem de existir e não citar PUBLIC.
  foreach v_nome in array v_funcoes loop
    if not exists (select 1 from pg_proc
                    where oid = v_nome::regprocedure
                      and prosecdef
                      and 'search_path=public' = any(proconfig)) then
      falhas := falhas + 1;
      raise warning 'FALHOU: % não é SECURITY DEFINER com search_path = public', v_nome;
    end if;
    if obj_description(v_nome::regprocedure, 'pg_proc') is null then
      falhas := falhas + 1;
      raise warning 'FALHOU: % sem comentário', v_nome;
    end if;
    if (select proacl is null
               or exists (select 1 from aclexplode(proacl) x
                           where x.grantee = 0 and x.privilege_type = 'EXECUTE')
          from pg_proc where oid = v_nome::regprocedure) then
      falhas := falhas + 1;
      raise warning 'FALHOU: PUBLIC executa %', v_nome;
    end if;
    if has_function_privilege('anon', v_nome, 'EXECUTE')
       or has_function_privilege('authenticated', v_nome, 'EXECUTE') then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon ou authenticated executa %', v_nome;
    end if;
    if not has_function_privilege('service_role', v_nome, 'EXECUTE') then
      falhas := falhas + 1;
      raise warning 'FALHOU: service_role sem EXECUTE em %', v_nome;
    end if;
  end loop;
  -- A disputa de duas sessões não cabe numa transação: o que a segura é este texto.
  if (select prosrc !~* 'for\s+update\s+skip\s+locked'
        from pg_proc where oid = 'public.sms_reservar_envios(uuid, integer)'::regprocedure) then
    falhas := falhas + 1;
    raise warning 'FALHOU: sms_reservar_envios não reserva com FOR UPDATE SKIP LOCKED';
  end if;

  select array[(select count(*) from public.sms_campanhas),
               (select count(*) from public.sms_envios),
               (select count(*) from public.sms_descadastros),
               (select count(*) from public.leads where nome = 'Aceite SMS Lead')]
    into v_antes;

  -- 6 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    foreach v_papel in array array['admin', 'marketing', 'comercial', 'desativado'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-sms-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite SMS ' || v_papel,
             papeis    = array[case when v_papel = 'desativado' then 'marketing' else v_papel end],
             role      = case when v_papel = 'desativado' then 'marketing' else v_papel end,
             is_active = (v_papel <> 'desativado')
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    -- 6a · A sonda: um lead, quatro campanhas e os destinatários. Os códigos
    --      são do alfabeto ('zzzzzz2'…, 'zzzzy' + dois caracteres); os
    --      telefones são 55 41 9 0000-0001 em diante.
    insert into public.leads (nome, telefone, interesse)
    values ('Aceite SMS Lead', '5541900000001', 'aceite')
    returning id into v_lead;

    insert into public.sms_campanhas
      (nome, codigo, veiculo_id, veiculo_rotulo, destino, criterio, janela_dias, mensagem, situacao)
    values ('Aceite SMS A', 'zzzzzz2', 1, 'carro de aceite', '/estoque/aceite', 'mesmo_veiculo', 90,
            '{nome}, veja: {link}', 'enviando')
    returning id into v_a;
    insert into public.sms_campanhas
      (nome, codigo, veiculo_id, veiculo_rotulo, destino, criterio, janela_dias, mensagem)
    values ('Aceite SMS B', 'zzzzzz3', 1, 'carro de aceite', '/estoque/aceite', 'faixa_de_preco', null,
            'Veja: {link}')
    returning id into v_b;
    insert into public.sms_campanhas
      (nome, codigo, veiculo_id, veiculo_rotulo, destino, criterio, janela_dias, mensagem, situacao)
    values ('Aceite SMS C', 'zzzzzz4', 1, 'carro de aceite', '/estoque/aceite', 'mesma_marca', 365,
            'Veja: {link}', 'enviando')
    returning id into v_c;
    insert into public.sms_campanhas
      (org_id, nome, codigo, veiculo_id, veiculo_rotulo, destino, criterio, mensagem)
    values (gen_random_uuid(), 'Aceite SMS de outra org', 'zzzzzz5', 1, 'carro de aceite',
            '/estoque/aceite', 'mesmo_modelo', 'Veja: {link}')
    returning id into v_outra;

    -- A: n = 1 a 5 (o 1 é o mais antigo, e é o do lead). B: 6 e 7. C: 10 a 214.
    insert into public.sms_envios (campanha_id, lead_id, telefone, nome, codigo, texto, criado_em)
    select case when n <= 5 then v_a when n <= 7 then v_b else v_c end,
           case when n = 1 then v_lead end,
           '55419' || lpad(n::text, 8, '0'),
           'Aceite ' || n,
           'zzzzy' || substr(v_alf, n / 31 + 1, 1) || substr(v_alf, n % 31 + 1, 1),
           'Aceite. Sair: responda SAIR',
           now() - make_interval(secs => 1000 - n)
      from generate_series(1, 214) n
     where n <= 7 or n >= 10;

    select codigo into v_cod1 from public.sms_envios
     where campanha_id = v_a and telefone = '5541900000001';

    -- 6b · Cada sessão, no que ela pode e no que não pode. 'negado' é 42501.
    for v_caso in
      select * from (values
        ('anon',       'select count(*) from public.sms_campanhas',    'negado'),
        ('anon',       'select count(*) from public.sms_envios',       'negado'),
        ('anon',       'select count(*) from public.sms_descadastros', 'negado'),
        ('anon',       'select count(*) from public.sms_reservar_envios(''{b}'', 1)',               'negado'),
        ('anon',       'select count(*) from public.sms_registrar_clique(''zzzzzzz'')',            'negado'),
        ('anon',       'select count(*) from (select public.sms_devolver_presos(''{b}'')) x',       'negado'),
        -- Marketing e Administrador leem as três campanhas da org, e não a da outra.
        ('marketing',  'select count(*) from public.sms_campanhas where nome like ''Aceite SMS %''', 'linhas:3'),
        ('admin',      'select count(*) from public.sms_campanhas where nome like ''Aceite SMS %''', 'linhas:3'),
        -- Telefone e nome de destinatário: ninguém do painel, nem o Administrador.
        ('marketing',  'select count(*) from public.sms_envios',       'negado'),
        ('marketing',  'select count(*) from public.sms_descadastros', 'negado'),
        ('admin',      'select count(*) from public.sms_envios',       'negado'),
        ('admin',      'select count(*) from public.sms_descadastros', 'negado'),
        ('comercial',  'select count(*) from public.sms_envios',       'negado'),
        -- Quem não é da linha da matriz não vê campanha.
        ('comercial',  'select count(*) from public.sms_campanhas',    'linhas:0'),
        ('desativado', 'select count(*) from public.sms_campanhas',    'linhas:0'),
        ('cliente',    'select count(*) from public.sms_campanhas',    'linhas:0'),
        -- O painel não escreve: 42501, não "0 linhas".
        ('marketing',  'with x as (insert into public.sms_campanhas (nome, codigo, veiculo_id, veiculo_rotulo, destino, criterio, mensagem) values (''Aceite SMS X'', ''zzzzzz7'', 1, ''x'', ''/x'', ''mesmo_veiculo'', ''{link}'') returning 1) select count(*) from x', 'negado'),
        ('admin',      'with x as (insert into public.sms_campanhas (nome, codigo, veiculo_id, veiculo_rotulo, destino, criterio, mensagem) values (''Aceite SMS X'', ''zzzzzz7'', 1, ''x'', ''/x'', ''mesmo_veiculo'', ''{link}'') returning 1) select count(*) from x', 'negado'),
        ('marketing',  'with x as (update public.sms_campanhas set situacao = ''enviando'' where id = ''{b}'' returning 1) select count(*) from x', 'negado'),
        ('admin',      'with x as (delete from public.sms_campanhas where id = ''{b}'' returning 1) select count(*) from x', 'negado'),
        ('marketing',  'with x as (insert into public.sms_envios (campanha_id, telefone, codigo, texto) values (''{b}'', ''5541900000999'', ''zzzzyzz'', ''x'') returning 1) select count(*) from x', 'negado'),
        ('marketing',  'with x as (insert into public.sms_descadastros (telefone, origem) values (''5541900000999'', ''painel'') returning 1) select count(*) from x', 'negado'),
        -- E não chama as funções do servidor.
        ('marketing',  'select count(*) from public.sms_reservar_envios(''{a}'', 1)',               'negado'),
        ('marketing',  'select count(*) from public.sms_registrar_clique(''{cod1}'')',             'negado'),
        ('marketing',  'select count(*) from (select public.sms_devolver_presos(''{a}'')) x',       'negado'),
        ('admin',      'select count(*) from public.sms_reservar_envios(''{a}'', 1)',               'negado'),
        ('admin',      'select count(*) from public.sms_registrar_clique(''{cod1}'')',             'negado'),
        ('admin',      'select count(*) from (select public.sms_devolver_presos(''{a}'')) x',       'negado')
      ) as t(quem, comando, esperado)
    loop
      v_sessoes := v_sessoes + 1;
      begin
        if v_caso.quem = 'anon' then
          set local role anon;
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', coalesce((v_ids->>v_caso.quem)::uuid, v_cli),
                              'role', 'authenticated')::text, true);
          set local role authenticated;
        end if;
        execute replace(replace(replace(v_caso.comando, '{a}', v_a::text), '{b}', v_b::text), '{cod1}', v_cod1)
           into v_n;
        reset role;
        v_obtido := 'linhas:' || v_n;
      exception when insufficient_privilege then
        v_obtido := 'negado';
      end;
      perform set_config('request.jwt.claims', '', true);
      if v_obtido <> v_caso.esperado then
        v_sessoes_erradas := array_append(v_sessoes_erradas,
          format('%s: %s → %s (esperado %s)', v_caso.quem, left(v_caso.comando, 70), v_obtido, v_caso.esperado));
      end if;
    end loop;

    -- 6c · Cada regra, tentando gravar o inválido (sem sessão: só o CHECK
    --      fala). Cada tentativa parte de uma linha VÁLIDA e muda um campo; os
    --      três casos sem regra são a contraprova de que a linha de partida
    --      entra. Toda tentativa é desfeita, entre ou não.
    v_bases := jsonb_build_object(
      'sms_campanhas', jsonb_build_object(
        'id', gen_random_uuid(), 'org_id', public.org_padrao(), 'nome', 'Aceite SMS regra',
        'codigo', 'zzzzzz6', 'veiculo_id', 1, 'veiculo_rotulo', 'carro de aceite',
        'destino', '/estoque/aceite', 'criterio', 'mesmo_veiculo', 'mensagem', 'Veja: {link}',
        'situacao', 'rascunho', 'homologacao', false, 'criado_em', now()),
      'sms_envios', jsonb_build_object(
        'id', gen_random_uuid(), 'org_id', public.org_padrao(), 'campanha_id', v_b,
        'telefone', '5541900000900', 'codigo', 'zzzzyzy', 'texto', 'Aceite',
        'partes', 1, 'situacao', 'na_fila', 'cliques', 0, 'criado_em', now()),
      'sms_descadastros', jsonb_build_object(
        'org_id', public.org_padrao(), 'telefone', '5541900000900', 'origem', 'painel',
        'criado_em', now()));

    for v_caso in
      select * from (values
        ('sms_campanhas',    null::text,                          '{}'::jsonb),
        ('sms_campanhas',    'sms_campanhas_criterio_valido',     '{"criterio": "todo_mundo"}'),
        ('sms_campanhas',    'sms_campanhas_criterio_valido',     '{"criterio": "MESMO_VEICULO"}'),
        ('sms_campanhas',    'sms_campanhas_situacao_valida',     '{"situacao": "pausada"}'),
        ('sms_campanhas',    'sms_campanhas_situacao_valida',     '{"situacao": "na_fila"}'),
        ('sms_campanhas',    'sms_campanhas_janela_valida',       '{"janela_dias": 60}'),
        ('sms_campanhas',    'sms_campanhas_janela_valida',       '{"janela_dias": 0}'),
        ('sms_campanhas',    'sms_campanhas_codigo_valido',       '{"codigo": "abc0def"}'),
        ('sms_campanhas',    'sms_campanhas_codigo_valido',       '{"codigo": "abc1def"}'),
        ('sms_campanhas',    'sms_campanhas_codigo_valido',       '{"codigo": "abcdefi"}'),
        ('sms_campanhas',    'sms_campanhas_codigo_valido',       '{"codigo": "abcdefl"}'),
        ('sms_campanhas',    'sms_campanhas_codigo_valido',       '{"codigo": "abcdefo"}'),
        ('sms_campanhas',    'sms_campanhas_codigo_valido',       '{"codigo": "ABCDEFG"}'),
        ('sms_campanhas',    'sms_campanhas_codigo_valido',       '{"codigo": "abcdef"}'),
        ('sms_campanhas',    'sms_campanhas_codigo_valido',       '{"codigo": "abcdefgh"}'),
        ('sms_campanhas',    'sms_campanhas_destino_e_caminho',   '{"destino": "estoque/aceite"}'),
        ('sms_campanhas',    'sms_campanhas_destino_e_caminho',   '{"destino": "https://exemplo.invalido/x"}'),
        ('sms_campanhas',    'sms_campanhas_destino_e_caminho',   '{"destino": "//exemplo.invalido/x"}'),
        ('sms_campanhas',    'sms_campanhas_destino_e_caminho',   '{"destino": ""}'),
        ('sms_campanhas',    'sms_campanhas_mensagem_tem_link',   '{"mensagem": "Ola {nome}, veja o {carro}"}'),
        ('sms_campanhas',    'sms_campanhas_mensagem_tem_link',   '{"mensagem": "Veja: {LINK}"}'),
        ('sms_campanhas',    'sms_campanhas_nome_valido',         '{"nome": ""}'),
        ('sms_campanhas',    'sms_campanhas_nome_valido',         '{"nome": "   "}'),
        ('sms_campanhas',    'sms_campanhas_nome_valido',         jsonb_build_object('nome', repeat('x', 81))),
        ('sms_envios',       null,                                '{}'),
        ('sms_envios',       'sms_envios_telefone_valido',        '{"telefone": "554133334444"}'),
        ('sms_envios',       'sms_envios_telefone_valido',        '{"telefone": "5541333344445"}'),
        ('sms_envios',       'sms_envios_telefone_valido',        '{"telefone": "41999990000"}'),
        ('sms_envios',       'sms_envios_telefone_valido',        '{"telefone": "+5541999990000"}'),
        ('sms_envios',       'sms_envios_telefone_valido',        '{"telefone": "5541 99999-0000"}'),
        ('sms_envios',       'sms_envios_telefone_valido',        '{"telefone": "5501999990000"}'),
        ('sms_envios',       'sms_envios_telefone_valido',        '{"telefone": "55419999900001"}'),
        ('sms_envios',       'sms_envios_codigo_valido',          '{"codigo": "abc0def"}'),
        ('sms_envios',       'sms_envios_codigo_valido',          '{"codigo": "abcdef"}'),
        ('sms_envios',       'sms_envios_partes_validas',         '{"partes": 0}'),
        ('sms_envios',       'sms_envios_partes_validas',         '{"partes": 4}'),
        ('sms_envios',       'sms_envios_situacao_valida',        '{"situacao": "entregue"}'),
        ('sms_envios',       'sms_envios_situacao_valida',        '{"situacao": "rascunho"}'),
        ('sms_envios',       'sms_envios_custo_valido',           '{"custo": -0.01}'),
        ('sms_envios',       'sms_envios_cliques_validos',        '{"cliques": -1}'),
        ('sms_envios',       'sms_envios_resposta_curta',         jsonb_build_object('resposta', repeat('x', 501))),
        ('sms_descadastros', null,                                '{}'),
        ('sms_descadastros', 'sms_descadastros_telefone_valido',  '{"telefone": "554133334444"}'),
        ('sms_descadastros', 'sms_descadastros_telefone_valido',  '{"telefone": "41999990000"}'),
        ('sms_descadastros', 'sms_descadastros_origem_valida',    '{"origem": "webhook"}')
      ) as t(tabela, regra, muda)
    loop
      if v_caso.regra is not null then
        v_regras := v_regras + 1;
      end if;
      begin
        execute format('insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)',
                       v_caso.tabela)
          using (v_bases->v_caso.tabela) || v_caso.muda;
        raise exception 'ENTROU' using errcode = 'PSM02';
      exception
        when check_violation then
          get stacked diagnostics v_msg = constraint_name;
          if v_msg is distinct from v_caso.regra then
            v_regras_erradas := array_append(v_regras_erradas,
              format('%s %s: recusado por %s, esperado %s', v_caso.tabela, v_caso.muda, v_msg,
                     coalesce(v_caso.regra, 'aceitar')));
          end if;
        when sqlstate 'PSM02' then
          if v_caso.regra is null then
            v_controles := v_controles + 1;
          else
            v_regras_erradas := array_append(v_regras_erradas,
              format('%s %s: ENTROU, esperado recusa por %s', v_caso.tabela, v_caso.muda, v_caso.regra));
          end if;
      end;
    end loop;

    -- 6d · As unicidades e a chave para a campanha, pelo nome.
    insert into public.sms_descadastros (telefone, origem, campanha_id)
    values ('5541900000002', 'resposta', v_a);

    for v_caso in
      select * from (values
        ('sms_envios_um_por_telefone',
         'insert into public.sms_envios (campanha_id, telefone, codigo, texto) values (''{a}'', ''5541900000002'', ''zzzzyzz'', ''x'')'),
        ('sms_envios_codigo_unico',
         'insert into public.sms_envios (campanha_id, telefone, codigo, texto) values (''{b}'', ''5541900000998'', ''{cod1}'', ''x'')'),
        ('sms_campanhas_codigo_unico',
         'insert into public.sms_campanhas (nome, codigo, veiculo_id, veiculo_rotulo, destino, criterio, mensagem) values (''Aceite SMS X'', ''zzzzzz2'', 1, ''x'', ''/x'', ''mesmo_veiculo'', ''{link}'')'),
        ('sms_descadastros_pkey',
         'insert into public.sms_descadastros (telefone, origem) values (''5541900000002'', ''painel'')'),
        ('sms_envios_campanha_id_fkey',
         'insert into public.sms_envios (campanha_id, telefone, codigo, texto) values (gen_random_uuid(), ''5541900000997'', ''zzzzyzz'', ''x'')'),
        ('sms_envios_lead_id_fkey',
         'insert into public.sms_envios (campanha_id, lead_id, telefone, codigo, texto) values (''{b}'', gen_random_uuid(), ''5541900000997'', ''zzzzyzz'', ''x'')')
      ) as t(regra, comando)
    loop
      v_unicas := v_unicas + 1;
      begin
        execute replace(replace(replace(v_caso.comando, '{a}', v_a::text), '{b}', v_b::text), '{cod1}', v_cod1);
        raise exception 'ENTROU' using errcode = 'PSM02';
      exception
        when unique_violation or foreign_key_violation then
          get stacked diagnostics v_msg = constraint_name;
          if v_msg <> v_caso.regra then
            v_unicas_erradas := array_append(v_unicas_erradas,
              format('recusado por %s, esperado %s', v_msg, v_caso.regra));
          end if;
        when sqlstate 'PSM02' then
          v_unicas_erradas := array_append(v_unicas_erradas, format('ENTROU, esperado recusa por %s', v_caso.regra));
      end;
    end loop;

    -- A contraprova: o mesmo número em OUTRA campanha entra.
    begin
      insert into public.sms_envios (campanha_id, telefone, codigo, texto)
      values (v_b, '5541900000002', 'zzzzyzz', 'x');
      raise exception 'ENTROU' using errcode = 'PSM02';
    exception
      when sqlstate 'PSM02' then v_mesmo_numero := true;
      when unique_violation then v_mesmo_numero := false;
    end;

    -- 6e · A reserva, como o servidor chama (service_role).
    set local role service_role;

    --      Rascunho não reserva, e a fila dele fica onde estava. Campanha que
    --      não existe também devolve vazio.
    select count(*) into v_rascunho from public.sms_reservar_envios(v_b, 10);
    select count(*) into v_rascunho_fila from public.sms_envios
     where campanha_id = v_b and situacao = 'na_fila' and tentado_em is null;
    select count(*) into v_inexistente from public.sms_reservar_envios(gen_random_uuid(), 10);

    --      A: dois dos cinco, os dois mais antigos, já carimbados.
    select coalesce(array_agg(r.id), '{}'),
           count(*) = 2
             and bool_and(r.situacao = 'enviando' and r.tentado_em is not null)
             and bool_and(r.telefone in ('5541900000001', '5541900000002'))
      into v_lote1, v_lote1_ok
      from public.sms_reservar_envios(v_a, 2) r;
    --      De novo: outros dois, e nenhum repetido.
    select coalesce(array_agg(r.id), '{}') into v_lote2 from public.sms_reservar_envios(v_a, 2) r;
    v_lote2_n := cardinality(v_lote2);
    v_repetiu := v_lote1 && v_lote2;
    --      Pede 200 e só há um; depois, nada.
    select count(*) into v_lote3_n from public.sms_reservar_envios(v_a, 200);
    select count(*) into v_lote4_n from public.sms_reservar_envios(v_a, 5);

    --      C tem 205 na fila: limite 0 e limite nulo reservam um; 1000 reserva
    --      200, e não 203; sobram três.
    select count(*) into v_piso_n from public.sms_reservar_envios(v_c, 0);
    select count(*) into v_nulo_n from public.sms_reservar_envios(v_c, null);
    select count(*) into v_teto_n from public.sms_reservar_envios(v_c, 1000);
    select count(*) into v_sobrou from public.sms_envios
     where campanha_id = v_c and situacao = 'na_fila';
    reset role;

    --      Interrompida, com três ainda na fila: não reserva mais.
    update public.sms_campanhas set situacao = 'interrompida', interrompida_em = now() where id = v_c;
    set local role service_role;
    select count(*) into v_interrompida from public.sms_reservar_envios(v_c, 10);
    reset role;

    -- 6f · O clique. O primeiro soma e carimba; a hora dele é então recuada um
    --      dia (now() não anda dentro da transação), e o segundo soma e NÃO
    --      mexe nela.
    set local role service_role;
    select count(*) || '|' || coalesce(min(k.destino), '') || '|' || coalesce(min(k.campanha_codigo), '')
      into v_clique1
      from public.sms_registrar_clique(v_cod1) k;
    reset role;
    select cliques = 1 and clicou_em is not null into v_clique1_linha
      from public.sms_envios where codigo = v_cod1;

    v_ontem := now() - interval '1 day';
    update public.sms_envios set clicou_em = v_ontem where codigo = v_cod1;
    set local role service_role;
    perform 1 from public.sms_registrar_clique(v_cod1);
    --      Código que não existe, vazio e nulo: zero linhas, sem erro.
    select (select count(*) from public.sms_registrar_clique('zzzzzzz'))
         + (select count(*) from public.sms_registrar_clique(''))
         + (select count(*) from public.sms_registrar_clique(null))
      into v_clique_vazio;
    reset role;
    select cliques = 2 and clicou_em = v_ontem into v_clique2_linha
      from public.sms_envios where codigo = v_cod1;
    select coalesce(sum(cliques), 0) into v_clique_outros
      from public.sms_envios where codigo <> v_cod1 and codigo like 'zzzzy%';

    -- 6g · Os presos. A está com os cinco em `enviando`:
    --        1 ... há 20 min, sem fornecedor ......... vira falha no padrão (10)
    --        2 ... há 20 min, COM fornecedor ......... fica (o fornecedor ouviu)
    --        3 ... há 5 min, sem fornecedor .......... fica no padrão; cai com 3
    --        4 ... já `enviado` ...................... fica
    --        5 ... reservado agora ................... fica
    --      E um preso antigo em C, que não é a campanha pedida: fica.
    update public.sms_envios set tentado_em = now() - interval '20 minutes'
     where campanha_id = v_a and telefone in ('5541900000001', '5541900000002', '5541900000004');
    update public.sms_envios set fornecedor_id = 'aceite-sms-fornecedor'
     where campanha_id = v_a and telefone = '5541900000002';
    update public.sms_envios set tentado_em = now() - interval '5 minutes'
     where campanha_id = v_a and telefone = '5541900000003';
    update public.sms_envios set situacao = 'enviado', enviado_em = now()
     where campanha_id = v_a and telefone = '5541900000004';
    update public.sms_envios set tentado_em = now() - interval '2 hours'
     where campanha_id = v_c and situacao = 'enviando';

    set local role service_role;
    v_presos1 := public.sms_devolver_presos(v_a);
    reset role;
    select count(*) filter (where situacao = 'falhou') = 1
           and bool_and((situacao = 'falhou' and erro = v_erro_preso) = (telefone = '5541900000001'))
           and bool_and(situacao = case telefone when '5541900000001' then 'falhou'
                                                 when '5541900000004' then 'enviado'
                                                 else 'enviando' end)
      into v_presos1_linhas
      from public.sms_envios where campanha_id = v_a;

    set local role service_role;
    v_presos2 := public.sms_devolver_presos(v_a, 3);
    reset role;
    select count(*) filter (where situacao = 'falhou') = 2
           and bool_and(situacao = case when telefone in ('5541900000001', '5541900000003') then 'falhou'
                                        when telefone = '5541900000004' then 'enviado'
                                        else 'enviando' end)
           and count(*) filter (where situacao = 'na_fila') = 0
      into v_presos2_linhas
      from public.sms_envios where campanha_id = v_a;
    select count(*) into v_presos_vizinha from public.sms_envios
     where campanha_id = v_c and situacao = 'falhou';

    -- 6h · Eliminar o lead leva o envio dele; apagar a campanha leva os envios
    --      dela, e a saída registrada fica, sem a campanha.
    delete from public.leads where id = v_lead;
    select count(*) into v_lead_levou from public.sms_envios where campanha_id = v_a;

    delete from public.sms_campanhas where id = v_a;
    select count(*) into v_campanha_levou from public.sms_envios
     where telefone in ('5541900000002', '5541900000003', '5541900000004', '5541900000005')
       and codigo like 'zzzzy%';
    select count(*) = 1 and bool_and(campanha_id is null) into v_saida_ficou
      from public.sms_descadastros
     where org_id = public.org_padrao() and telefone = '5541900000002';

    raise exception 'DESFAZER_ACEITE_SMS' using errcode = 'PSM01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PSM01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'marketing' is null or v_a is null or v_cod1 is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários e as campanhas — nada foi provado';
  end if;
  if v_sessoes < 28 or cardinality(v_sessoes_erradas) > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: sessões — % caso(s), % fora do esperado: %',
      v_sessoes, cardinality(v_sessoes_erradas), array_to_string(v_sessoes_erradas, ' · ');
  end if;
  if v_regras < 42 or cardinality(v_regras_erradas) > 0 or v_controles <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % tentativa(s), % fora da regra certa, % de 3 linhas válidas aceitas: %',
      v_regras, cardinality(v_regras_erradas), v_controles, array_to_string(v_regras_erradas, ' · ');
  end if;
  if v_unicas < 6 or cardinality(v_unicas_erradas) > 0 or not v_mesmo_numero then
    falhas := falhas + 1;
    raise warning 'FALHOU: unicidades e chaves — % caso(s), fora do esperado: %; o mesmo número em outra campanha entra: %',
      v_unicas, array_to_string(v_unicas_erradas, ' · '), v_mesmo_numero;
  end if;
  if v_rascunho <> 0 or v_rascunho_fila <> 2 or v_inexistente <> 0 or v_interrompida <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: reserva fora de `enviando` — rascunho devolveu % (fila intacta: % de 2), campanha inexistente %, interrompida %',
      v_rascunho, v_rascunho_fila, v_inexistente, v_interrompida;
  end if;
  if not coalesce(v_lote1_ok, false) or v_lote2_n <> 2 or v_repetiu or v_lote3_n <> 1 or v_lote4_n <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: reserva em A (5 na fila) — o 1º lote de 2 veio certo: %; o 2º trouxe % (repetiu linha: %); pedindo 200 vieram % (esperado 1); depois % (esperado 0)',
      v_lote1_ok, v_lote2_n, v_repetiu, v_lote3_n, v_lote4_n;
  end if;
  if v_piso_n <> 1 or v_nulo_n <> 1 or v_teto_n <> 200 or v_sobrou <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: limites do lote em C (205 na fila) — limite 0 reservou % (esperado 1), nulo % (1), 1000 % (200); sobraram % (3)',
      v_piso_n, v_nulo_n, v_teto_n, v_sobrou;
  end if;
  if v_clique1 <> '1|/estoque/aceite|zzzzzz2' or not coalesce(v_clique1_linha, false)
     or not coalesce(v_clique2_linha, false) or v_clique_vazio <> 0 or v_clique_outros <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: clique — devolveu "%" (esperado "1|/estoque/aceite|zzzzzz2"); 1º somou e carimbou: %; 2º somou e manteve a hora do 1º: %; código desconhecido devolveu % linha(s); cliques em outros envios: %',
      v_clique1, v_clique1_linha, v_clique2_linha, v_clique_vazio, v_clique_outros;
  end if;
  if v_presos1 <> 1 or not coalesce(v_presos1_linhas, false)
     or v_presos2 <> 1 or not coalesce(v_presos2_linhas, false) or v_presos_vizinha <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: presos — no padrão fechou % (esperado 1; linhas certas: %); com 3 minutos fechou mais % (esperado 1; linhas certas, nenhuma de volta à fila: %); mexeu em % da campanha vizinha',
      v_presos1, v_presos1_linhas, v_presos2, v_presos2_linhas, v_presos_vizinha;
  end if;
  if v_lead_levou <> 4 or v_campanha_levou <> 0 or not coalesce(v_saida_ficou, false) then
    falhas := falhas + 1;
    raise warning 'FALHOU: apagar — sem o lead, A ficou com % envio(s) (esperado 4); sem a campanha, sobraram % (esperado 0); a saída ficou, sem campanha: %',
      v_lead_levou, v_campanha_levou, v_saida_ficou;
  end if;

  -- Nada da prova ficou.
  select array[(select count(*) from public.sms_campanhas),
               (select count(*) from public.sms_envios),
               (select count(*) from public.sms_descadastros),
               (select count(*) from public.leads where nome = 'Aceite SMS Lead')]
    into v_depois;
  select count(*) into v_restou from auth.users where email like 'aceite-sms-%@exemplo.invalido';
  if v_depois is distinct from v_antes or v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (campanhas, envios, saídas, leads de sonda: % → %; % usuário(s))',
      v_antes, v_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) nas campanhas de SMS', falhas;
  end if;

  raise notice
    'Aceite verificado: sms_campanhas, sms_envios e sms_descadastros existem com '
    'as regras nomeadas e RLS; anon não lê nenhuma das três; Marketing e '
    'Administrador leem sms_campanhas (só as da org) e levam 42501 em sms_envios '
    'e sms_descadastros; comercial, marketing desativado e cliente não veem '
    'campanha; o painel não inclui, não edita e não apaga (42501) e não executa '
    'as três funções (% casos de sessão). Critério, situação, janela, código '
    'fora do alfabeto, telefone fixo ou sem 55, destino sem barra ou com '
    'domínio, mensagem sem {link}, nome vazio, partes 0 e 4, custo e cliques '
    'negativos e resposta longa caem na regra certa (% tentativas); o mesmo '
    'número não entra duas vezes na mesma campanha, e entra em outra. '
    'sms_reservar_envios devolve no máximo o limite (piso 1, teto 200), nada em '
    'rascunho nem interrompida, e a chamada seguinte não repete linha; '
    'sms_registrar_clique soma, mantém o primeiro clicou_em e devolve vazio para '
    'código desconhecido; sms_devolver_presos marca falhou só o preso sem '
    'fornecedor e não devolve nada à fila; apagar a campanha leva os envios e '
    'deixa a saída; eliminar o lead leva o envio dele; a prova não deixou rastro.',
    v_sessoes, v_regras;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261007120000', 'sms_campanhas')
  on conflict (version) do nothing;
