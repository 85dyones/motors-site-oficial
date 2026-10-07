-- ============================================================================
-- As campanhas de SMS (por carro ou por perfil) e a base de marketing importada
-- ============================================================================
-- Pedido do dono (2026-10-07): criar campanhas de SMS no painel
-- (`/admin/marketing/sms`), enviar pela APIBrasil e acompanhar cada campanha:
-- enviados, na operadora, cliques no link curto, respostas e pedidos de saída.
-- Quem cria e envia é a linha nova da matriz, "Criar e enviar campanhas de
-- SMS": Administrador e Marketing.
--
-- No mesmo dia o pedido cresceu, e este arquivo cresceu junto (ele ainda não
-- tinha sido aplicado em lugar nenhum; ver "Uma versão anterior", abaixo):
--   1. importar a base antiga do RevendaMais (cerca de 11.500 pessoas, com os
--      carros de interesse passados e a data de compra) para as campanhas;
--   2. a campanha escolhe o público POR CARRO (os quatro critérios de antes:
--      este carro, este modelo, esta marca, preço parecido) ou POR PERFIL
--      (interessados, clientes, todos), com filtro de canal e um descanso:
--      quem recebeu campanha há menos de N dias fica de fora;
--   3. "há data de compra? se tiver, podemos fazer campanhas de hora de trocar
--      seu carro": a campanha por perfil ganha o filtro "comprou há pelo menos
--      N meses" (`compra_ha_meses`: 12, 18, 24 ou 36; só em `clientes` e
--      `todos`, porque só cliente tem data de compra) e um destino de link
--      escolhido (`DESTINOS_SEM_CARRO`: '/estoque' ou '/avaliacao'). O destino
--      não pediu nada do banco: a coluna e a regra dela já aceitavam os dois.
--
-- A parte pura mora em `src/lib/smsCampanhas.ts` e `src/lib/baseDeMarketing.ts`.
-- As listas fechadas daqui são as de lá: `CRITERIOS_DE_PUBLICO` (sete valores;
-- os quatro de `CRITERIOS_DE_CARRO` exigem carro), `JANELAS_DE_INTERESSE`,
-- `DESCANSOS_EM_DIAS`, `TEMPOS_DESDE_A_COMPRA`, `SITUACOES_DA_CAMPANHA`,
-- `SITUACOES_DO_ENVIO`,
-- `ORIGENS_DE_IMPORTACAO`, `ALFABETO_DO_CODIGO`/`TAMANHO_DO_CODIGO`, e o
-- telefone no formato que `telefoneParaSms` devolve.
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.sms_campanhas` — uma linha por campanha: o carro (quando há; o
--    retrato do nome e o caminho da ficha), o critério, a janela, os canais, o
--    descanso, o tempo desde a compra, o molde da mensagem e a situação. `codigo` vai no
--    `utm_campaign` (`sms-<codigo>`).
-- 2. `public.sms_envios` — uma linha por destinatário de uma campanha: o
--    telefone, a mensagem final, o código do link curto (`/s/<codigo>`) e tudo
--    o que aconteceu depois (aceito, na operadora, clique, resposta, saída).
--    A pessoa veio de um lead do site (`lead_id`), da base importada
--    (`contato_id`), dos dois ou de nenhum.
-- 3. `public.sms_descadastros` — quem pediu para sair. Vale para todas as
--    campanhas: `montarPublico` tira esses números antes de qualquer envio.
-- 4. `public.marketing_importacoes` — uma linha por arquivo importado. É o que
--    permite desfazer uma importação inteira.
-- 5. `public.marketing_contatos` — uma PESSOA da base importada, identificada
--    pelo celular: nome, e-mail, se é cliente, quando comprou, se pediu para
--    não ser procurada, por que canais chegou.
-- 6. `public.marketing_interesses` — um carro que a pessoa olhou, ou comprou.
-- 7. Seis funções, só para a chave de serviço:
--      sms_reservar_envios(campanha, limite) ......... reserva atômica de um lote
--      sms_registrar_clique(codigo) .................. soma o clique e devolve o destino
--      sms_devolver_presos(campanha, minutos) ........ fecha como falha o envio que
--                                                      ficou no meio do caminho
--      marketing_importar_lote(importacao, contatos) . grava um lote de pessoas,
--                                                      fundindo com quem já existe
--      marketing_desfazer_importacao(importacao) ..... apaga o que ela criou
--      marketing_resumo_da_base() .................... só contagem, nenhuma pessoa
--
-- ---------------------------------------------------------------------------
-- Por que a base importada NÃO vai para `leads`
-- ---------------------------------------------------------------------------
-- `leads` é a fila de trabalho do vendedor: kanban, alerta de lead parado,
-- funil e relatório. Onze mil contatos antigos lá dentro enterrariam os leads
-- de hoje e disparariam alerta para cada um. A base mora nas três tabelas
-- `marketing_*`, e as campanhas leem as DUAS fontes; a pessoa é o telefone.
-- Quem responde a uma campanha e procura a loja vira lead pelo caminho de
-- sempre. Nada aqui escreve em `leads`.
--
-- ---------------------------------------------------------------------------
-- Dado pessoal: a tela não lê telefone, e o banco não deixa
-- ---------------------------------------------------------------------------
-- O papel Marketing não lê contato de lead (matriz: "Ver e mover leads no
-- kanban" é `nao_ve`), e é ele quem opera as campanhas e a importação. Por
-- isso telefone e nome ficam em tabelas que `authenticated` NÃO lê:
-- `sms_envios`, `sms_descadastros`, `marketing_importacoes`,
-- `marketing_contatos` e `marketing_interesses` não têm privilégio nem policy
-- para o painel, e ler direto é 42501. Todo acesso a elas é do servidor, com a
-- chave de serviço, que devolve à tela só contagem, primeiro nome e telefone
-- mascarado (`EnvioNaTela`, `ResumoDaBase`). Vale para o Administrador também:
-- a porta é uma só. (`marketing_importacoes` não tem telefone, mas tem o nome
-- do arquivo e de quem importou, e não há motivo para o painel lê-la direto.)
--
-- `sms_campanhas` não tem dado de pessoa. Administrador e Marketing a leem
-- pelo painel (uma policy de SELECT); ninguém a escreve pelo painel: quem
-- grava é o servidor, depois de autorizar pela matriz. Tentar direto é 42501.
--
-- O envio aponta para o lead (`lead_id`) e para o contato da base
-- (`contato_id`), os dois com `on delete cascade`: eliminar a pessoa (LGPD,
-- art. 18, VI) leva junto o telefone, o nome e a resposta que ficaram no
-- envio. O descadastro NÃO aponta para ninguém e fica: é o registro da
-- oposição (art. 18, § 2º), e apagá-lo faria o mesmo número voltar a receber
-- mensagem por outro cadastro.
--
-- O carro é `veiculo_id` SEM chave estrangeira, na campanha e no interesse: o
-- carro sai do estoque e o registro fica, com o nome guardado ao lado.
-- `estoque_motors` não é tocada nem referenciada.
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
-- A importação: a mesma pessoa em dois arquivos, e o mesmo arquivo duas vezes
-- ---------------------------------------------------------------------------
-- O RevendaMais entrega dois arquivos (o de leads e o de clientes) e a mesma
-- pessoa aparece nos dois; e um arquivo pode ser enviado de novo. Por isso
-- `marketing_importar_lote` FUNDE pelo celular, sem perder o que já se sabia:
--   nome, e-mail ............ fica o que já existe; o novo só preenche vazio
--   cliente, sem_interesse .. uma vez verdadeiro, fica (antigo OU novo)
--   comprou_em .............. a compra mais recente
--   canais .................. união, sem repetir, na ordem em que chegaram
--   primeiro/último contato . o menor e o maior, contando as datas dos registros
-- E não duplica registro:
--   * linha com `origem_id` (o Id do RevendaMais) entra uma vez por org
--     (`marketing_interesses_origem_unica`);
--   * linha sem `origem_id` (planilha comum) entra uma vez por pessoa, tipo,
--     carro e data (`marketing_interesses_sem_origem_unico`);
--   * linha sem `origem_id` E sem data ganha a hora da importação, que muda a
--     cada vez, e o índice não a pegaria: a função a deixa de fora quando a
--     pessoa já tem registro sem origem do mesmo tipo e do mesmo carro. Sem
--     data, ela não diria nada que esse registro já não diga.
--
-- ⚠️ `origem_id` é único POR ORG, e não por arquivo. Dois arquivos com
--    numerações próprias (a coluna "Id" de duas planilhas diferentes, ou o
--    código de cliente contra o Id de lead) colidiriam, e a segunda linha
--    seria descartada em silêncio como repetida. Quem chama só deve mandar
--    `origem_id` quando ele é o Id de lead do RevendaMais, ou então prefixá-lo
--    com a fonte.
--
-- Desfazer (`marketing_desfazer_importacao`) apaga a linha da importação, e o
-- `on delete cascade` leva: os registros que ela gravou; os contatos que ELA
-- criou; com cada contato, os registros que OUTRAS importações penduraram nele
-- e os envios de SMS feitos a ele. NÃO desfaz a fusão: o contato que já
-- existia e foi enriquecido por ela (virou cliente, ganhou canal) continua
-- como ficou. O pedido de saída (`sms_descadastros`) nunca vai embora.
--
-- ---------------------------------------------------------------------------
-- As regras, e quem as segura
-- ---------------------------------------------------------------------------
--   sms_campanhas_nome_valido ............... 1 a 80 caracteres, e não só espaço
--   sms_campanhas_codigo_valido ............. 7 caracteres de 23456789abcdefghjkmnpqrstuvwxyz
--   sms_campanhas_codigo_unico .............. um código, uma campanha
--   sms_campanhas_destino_e_caminho ......... começa com '/', sem domínio ('//' não)
--   sms_campanhas_criterio_valido ........... mesmo_veiculo, mesmo_modelo, mesma_marca,
--                                             faixa_de_preco, interessados, clientes, todos
--   sms_campanhas_carro_do_criterio ......... critério de carro exige o carro; e o carro
--                                             vem inteiro (id e nome) ou não vem
--   sms_campanhas_janela_valida ............. nula (sem limite) ou 30, 90, 180, 365
--   sms_campanhas_descanso_valido ........... 0 (desligado), 7, 15 ou 30 dias
--   sms_campanhas_compra_valida ............. nula (sem filtro) ou 12, 18, 24, 36 meses
--   sms_campanhas_compra_so_de_cliente ...... o filtro de compra só existe com o
--                                             critério clientes ou todos
--   sms_campanhas_mensagem_tem_link ......... o molde contém {link}
--   sms_campanhas_sem_carro_sem_variavel .... sem carro, o molde não usa {carro} nem {preco}
--   sms_campanhas_situacao_valida ........... rascunho, enviando, enviada, interrompida
--
--   sms_envios_telefone_valido .............. 55 + DDD + celular de 9 dígitos, só dígitos
--   sms_envios_codigo_valido ................ o mesmo alfabeto, 7 caracteres
--   sms_envios_codigo_unico ................. um código, um destinatário
--   sms_envios_um_por_telefone .............. (campanha, telefone): a mesma campanha
--                                             não vai duas vezes ao mesmo número
--   sms_envios_partes_validas ............... 1 a 3 (PARTES_MAXIMAS)
--   sms_envios_situacao_valida .............. na_fila, enviando, enviado, falhou
--   sms_envios_custo_valido ................. nulo ou >= 0
--   sms_envios_cliques_validos .............. >= 0
--   sms_envios_resposta_curta ............... até 500 caracteres
--   sms_envios_campanha_id_fkey ............. apagar a campanha leva os envios
--   sms_envios_lead_id_fkey ................. eliminar o lead leva o envio
--   sms_envios_contato_id_fkey .............. eliminar o contato da base leva o envio
--
--   sms_descadastros_pkey ................... (org, telefone): sai uma vez só
--   sms_descadastros_telefone_valido ........ o mesmo formato do envio
--   sms_descadastros_origem_valida .......... resposta ou painel
--   sms_descadastros_campanha_id_fkey ....... apagar a campanha NÃO apaga a saída
--
--   marketing_importacoes_origem_valida ..... revenda_mais ou planilha
--   marketing_importacoes_arquivo_curto ..... o nome do arquivo, até 200 caracteres
--   marketing_importacoes_linhas_validas .... >= 0
--   marketing_importacoes_contadores_validos  os três contadores, >= 0
--
--   marketing_contatos_telefone_valido ...... o mesmo formato do envio
--   marketing_contatos_telefone_unico ....... (org, telefone): uma pessoa, um celular
--   marketing_contatos_compra_e_de_cliente .. quem tem data de compra é cliente
--   marketing_contatos_importacao_id_fkey ... desfazer a importação leva o contato que ela criou
--
--   marketing_interesses_tipo_valido ........ interesse ou compra
--   marketing_interesses_placa_valida ....... nula, ou 7 caracteres de placa (antiga ou Mercosul)
--   marketing_interesses_contato_id_fkey .... eliminar o contato leva os registros dele
--   marketing_interesses_importacao_id_fkey . desfazer a importação leva os registros dela
--   marketing_interesses_origem_unica ....... índice único (org, origem_id), quando há origem_id
--   marketing_interesses_sem_origem_unico ... índice único (pessoa, tipo, carro, data), quando não há
--
-- Nenhuma destas é tabela de parâmetro (não há valor vigente a encerrar) nem
-- de evento append-only: campanha e envio mudam de situação, e o contato é
-- enriquecido a cada importação, por desenho.
--
-- ---------------------------------------------------------------------------
-- Uma versão anterior deste arquivo
-- ---------------------------------------------------------------------------
-- A primeira versão (só campanha por carro, sem a base) não foi aplicada em
-- produção. Mesmo assim, este arquivo roda por cima dela: o que mudou em
-- `sms_campanhas` e `sms_envios` é feito também por `alter table` reaplicável
-- (`add column if not exists`, `alter column ... drop not null`, `drop
-- constraint if exists` + `add constraint`). Num banco limpo esses `alter` não
-- mudam nada além de recriar as regras com o mesmo texto.
--
-- ⚠️ DESFAZER (nada mais depende destes objetos; a base importada, os envios
--    e as saídas registradas se perdem — exporte antes se já houve importação
--    ou campanha de verdade):
--
--   begin;
--   drop function if exists public.marketing_resumo_da_base();
--   drop function if exists public.marketing_desfazer_importacao(uuid);
--   drop function if exists public.marketing_importar_lote(uuid, jsonb);
--   drop function if exists public.sms_devolver_presos(uuid, integer);
--   drop function if exists public.sms_registrar_clique(text);
--   drop function if exists public.sms_reservar_envios(uuid, integer);
--   drop table    if exists public.sms_descadastros;
--   drop table    if exists public.sms_envios;
--   drop table    if exists public.sms_campanhas;
--   drop table    if exists public.marketing_interesses;
--   drop table    if exists public.marketing_contatos;
--   drop table    if exists public.marketing_importacoes;
--   delete from supabase_migrations.schema_migrations where version = '20261007120000';
--   commit;
--
-- Aditiva (seis tabelas e seis funções novas; nenhuma coluna, policy ou
-- gatilho em tabela que já existia antes deste arquivo; `leads` só ganha quem
-- aponta para ela; `estoque_motors` não é tocada) e idempotente: `create table
-- if not exists`, `create index if not exists`, `add column if not exists`,
-- `drop constraint if exists` + `add constraint`, `create or replace`, `drop
-- policy if exists` + `create policy`, revoke/grant e comment reaplicáveis.
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
  veiculo_id       bigint,
  veiculo_rotulo   text,
  destino          text not null,
  criterio         text not null,
  janela_dias      integer,
  canais           text[] not null default '{}',
  descanso_dias    integer not null default 0,
  compra_ha_meses  integer,
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
  constraint sms_campanhas_janela_valida
    check (janela_dias is null or janela_dias in (30, 90, 180, 365)),
  constraint sms_campanhas_mensagem_tem_link
    check (position('{link}' in mensagem) > 0),
  constraint sms_campanhas_situacao_valida
    check (situacao in ('rascunho', 'enviando', 'enviada', 'interrompida'))
);

-- O que mudou desde a primeira versão deste arquivo, escrito de modo a valer
-- nos dois pontos de partida: o banco limpo (a tabela acabou de nascer, acima,
-- já com as colunas novas) e o banco que tem a primeira versão aplicada (carro
-- obrigatório, quatro critérios, sem canais, descanso nem tempo desde a
-- compra). As seis regras abaixo vivem SÓ aqui, e não no `create table`: num lugar só, as duas formas
-- não têm como divergir.
alter table public.sms_campanhas
  alter column veiculo_id     drop not null,
  alter column veiculo_rotulo drop not null,
  add column if not exists canais        text[]  not null default '{}',
  add column if not exists descanso_dias integer not null default 0,
  add column if not exists compra_ha_meses integer;

alter table public.sms_campanhas
  drop constraint if exists sms_campanhas_criterio_valido,
  drop constraint if exists sms_campanhas_carro_do_criterio,
  drop constraint if exists sms_campanhas_descanso_valido,
  drop constraint if exists sms_campanhas_sem_carro_sem_variavel,
  drop constraint if exists sms_campanhas_compra_valida,
  drop constraint if exists sms_campanhas_compra_so_de_cliente,
  add constraint sms_campanhas_criterio_valido
    check (criterio in ('mesmo_veiculo', 'mesmo_modelo', 'mesma_marca', 'faixa_de_preco',
                        'interessados', 'clientes', 'todos')),
  -- O carro vem inteiro (id e retrato do nome) ou não vem; e os quatro
  -- critérios "por carro" (CRITERIOS_DE_CARRO) não existem sem ele.
  add constraint sms_campanhas_carro_do_criterio
    check ((veiculo_id is null) = (veiculo_rotulo is null)
           and (veiculo_id is not null
                or criterio not in ('mesmo_veiculo', 'mesmo_modelo', 'mesma_marca', 'faixa_de_preco'))),
  add constraint sms_campanhas_descanso_valido
    check (descanso_dias in (0, 7, 15, 30)),
  -- Sem carro não há o que pôr no lugar de {carro} nem de {preco}: a mensagem
  -- sairia com a variável crua, para centenas de pessoas.
  add constraint sms_campanhas_sem_carro_sem_variavel
    check (veiculo_id is not null
           or (position('{carro}' in mensagem) = 0 and position('{preco}' in mensagem) = 0)),
  -- "Comprou há pelo menos N meses" (TEMPOS_DESDE_A_COMPRA). Nulo não filtra.
  add constraint sms_campanhas_compra_valida
    check (compra_ha_meses is null or compra_ha_meses in (12, 18, 24, 36)),
  -- Só cliente tem data de compra: o filtro num público de interessados, ou
  -- num critério por carro, esvaziaria a campanha sem ninguém entender por quê.
  add constraint sms_campanhas_compra_so_de_cliente
    check (compra_ha_meses is null or criterio in ('clientes', 'todos'));

-- A lista do painel: as mais recentes primeiro.
create index if not exists sms_campanhas_recentes_idx
  on public.sms_campanhas (org_id, criado_em desc);

comment on table public.sms_campanhas is
  'Campanhas de SMS (2026-10-07), criadas em /admin/marketing/sms e enviadas '
  'pela APIBrasil. Uma linha por campanha: o carro (quando há), o critério de '
  'público (por carro ou por perfil), os canais, o descanso, o molde da '
  'mensagem e a situação. SEM dado de pessoa: os '
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
  'o carro sai do estoque e a campanha fica. Obrigatório nos critérios por '
  'carro; NULO em campanha por perfil sem carro (o link leva ao estoque).';
comment on column public.sms_campanhas.veiculo_rotulo is
  'Retrato do nome do carro quando a campanha foi criada. Sobrevive à venda. '
  'Nulo quando, e só quando, veiculo_id é nulo.';
comment on column public.sms_campanhas.destino is
  'O caminho da ficha para onde o link curto leva, sem domínio: começa com '
  '''/'' e não com ''//''. As marcas de UTM são postas pelo código (destinoDoClique).';
comment on column public.sms_campanhas.criterio is
  'Quem recebe (CRITERIOS_DE_PUBLICO em src/lib/smsCampanhas.ts). Por carro, '
  'em relação ao carro da campanha: mesmo_veiculo, mesmo_modelo, mesma_marca ou '
  'faixa_de_preco. Por perfil, sem olhar que carro a pessoa viu: interessados '
  '(procurou a loja e não comprou), clientes (já comprou) ou todos.';
comment on column public.sms_campanhas.janela_dias is
  'Há quantos dias, no máximo, o interesse aconteceu (por perfil: o último '
  'contato): 30, 90, 180 ou 365. NULO é sem limite (JANELAS_DE_INTERESSE).';
comment on column public.sms_campanhas.canais is
  'Só quem chegou por estes canais (OLX, Site, Instagram...). VAZIO é todos.';
comment on column public.sms_campanhas.descanso_dias is
  'O descanso: quem recebeu QUALQUER campanha há menos de tantos dias fica de '
  'fora desta. 0 desliga; 7, 15 ou 30 (DESCANSOS_EM_DIAS).';
comment on column public.sms_campanhas.compra_ha_meses is
  'Só quem comprou há PELO MENOS tantos meses ("hora de trocar seu carro"): '
  '12, 18, 24 ou 36 (TEMPOS_DESDE_A_COMPRA). NULO não filtra. Só existe com o '
  'critério clientes ou todos; com o filtro ligado, quem não tem data de compra '
  'conhecida (marketing_contatos.comprou_em) fica de fora.';
comment on column public.sms_campanhas.mensagem is
  'O MOLDE, com as variáveis ({nome}, {carro}, {preco}, {link}). Tem de conter '
  '{link}: sem ele não há como medir quem abriu. Sem carro, não pode conter '
  '{carro} nem {preco}. A mensagem final de cada destinatário fica em '
  'sms_envios.texto.';
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
  contato_id       uuid,
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

-- `contato_id` (a pessoa veio da base importada) é novo desde a primeira
-- versão deste arquivo. A chave estrangeira e o índice dele nascem na seção 4,
-- depois de `marketing_contatos` existir.
alter table public.sms_envios
  add column if not exists contato_id uuid;

-- O descanso pergunta "quem recebeu SMS desde tal data", em todas as campanhas.
create index if not exists sms_envios_enviado_em_idx
  on public.sms_envios (enviado_em) where enviado_em is not null;

comment on table public.sms_envios is
  'Os destinatários de cada campanha de SMS (2026-10-07): uma linha por número '
  'por campanha, com a mensagem final, o código do link curto e o que voltou do '
  'fornecedor. DADO PESSOAL (telefone, nome, resposta). O painel NÃO lê: sem '
  'privilégio e sem policy para authenticated, porque o papel Marketing opera '
  'as campanhas e não lê contato de lead. Só o servidor, com a chave de '
  'serviço, que devolve à tela contagem, primeiro nome e telefone mascarado. '
  'Vai embora com a campanha, com o lead e com o contato da base. Ver '
  '20261007120000_sms_campanhas.sql.';
comment on column public.sms_envios.lead_id is
  'O lead do site de onde o número veio, quando a pessoa é um. ON DELETE '
  'CASCADE: eliminar o lead (LGPD, art. 18, VI) leva o envio junto. Pode vir '
  'junto com contato_id (a mesma pessoa nas duas fontes) ou os dois nulos.';
comment on column public.sms_envios.contato_id is
  'O contato da base importada (marketing_contatos) de onde o número veio, '
  'quando a pessoa é um. ON DELETE CASCADE: eliminar o contato, ou desfazer a '
  'importação que o criou, leva o envio junto.';
comment on column public.sms_envios.telefone is
  'Só dígitos, com 55 e DDD, celular de 9 dígitos ("5541999990000") — o que '
  'telefoneParaSms devolve. Fixo não entra. NUNCA vai inteiro para o navegador.';
comment on column public.sms_envios.nome is
  'O nome da pessoa (do lead ou do contato da base) quando o público foi '
  'montado. A tela mostra só o primeiro.';
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
comment on column public.sms_envios.enviado_em is
  'Quando o fornecedor recebeu o SMS para envio (a resposta ao pedido). É por '
  'ele que o descanso de uma campanha acha quem recebeu há pouco.';
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
-- 4. A base de marketing importada — DADO PESSOAL
-- ----------------------------------------------------------------------------

-- 4a. A importação: uma linha por arquivo. É o que permite desfazer.
create table if not exists public.marketing_importacoes (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null default public.org_padrao(),
  origem                text not null,
  arquivo               text,
  linhas                integer not null default 0,
  contatos_novos        integer not null default 0,
  contatos_atualizados  integer not null default 0,
  registros_novos       integer not null default 0,
  criado_por            uuid,
  criado_por_nome       text,
  criado_em             timestamptz not null default now(),

  constraint marketing_importacoes_origem_valida
    check (origem in ('revenda_mais', 'planilha')),
  constraint marketing_importacoes_arquivo_curto
    check (arquivo is null or char_length(arquivo) <= 200),
  constraint marketing_importacoes_linhas_validas
    check (linhas >= 0),
  constraint marketing_importacoes_contadores_validos
    check (contatos_novos >= 0 and contatos_atualizados >= 0 and registros_novos >= 0)
);

-- A lista de importações do painel: as mais recentes primeiro.
create index if not exists marketing_importacoes_recentes_idx
  on public.marketing_importacoes (org_id, criado_em desc);

comment on table public.marketing_importacoes is
  'Os arquivos importados para a base de marketing (2026-10-07): uma linha por '
  'arquivo, com de onde veio, quantas linhas tinha e o que entrou. É por ela '
  'que uma importação se desfaz: apagar a linha leva, por ON DELETE CASCADE, '
  'os registros que ela gravou e os contatos que ela criou (ver '
  'marketing_desfazer_importacao). O painel NÃO lê (sem privilégio e sem '
  'policy para authenticated); só o servidor, com a chave de serviço. Ver '
  '20261007120000_sms_campanhas.sql.';
comment on column public.marketing_importacoes.origem is
  'revenda_mais (a exportação do RevendaMais) ou planilha (CSV ou Excel '
  'comum). ORIGENS_DE_IMPORTACAO em src/lib/baseDeMarketing.ts.';
comment on column public.marketing_importacoes.arquivo is
  'O nome do arquivo enviado, até 200 caracteres. Só para a pessoa reconhecer '
  'a importação na lista.';
comment on column public.marketing_importacoes.linhas is
  'Quantas linhas o arquivo tinha, contadas por quem leu. Gravado pelo servidor '
  'ao abrir a importação.';
comment on column public.marketing_importacoes.contatos_novos is
  'Pessoas que esta importação CRIOU. Somado por marketing_importar_lote a cada lote.';
comment on column public.marketing_importacoes.contatos_atualizados is
  'Pessoas que já existiam e esta importação tocou, somadas a cada lote: quem '
  'vem em dois lotes, ou num lote repetido, conta em cada um.';
comment on column public.marketing_importacoes.registros_novos is
  'Registros (carros de interesse e compras) que esta importação gravou. O que '
  'já existia não conta.';
comment on column public.marketing_importacoes.criado_por is
  'auth.uid() de quem importou, gravado pelo servidor a partir da sessão.';
comment on column public.marketing_importacoes.criado_por_nome is
  'Nome de quem importou, para continuar legível quando a pessoa sair da loja.';

-- 4b. O contato: uma PESSOA, identificada pelo celular.
create table if not exists public.marketing_contatos (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null default public.org_padrao(),
  telefone             text not null,
  nome                 text,
  email                text,
  cliente              boolean not null default false,
  comprou_em           timestamptz,
  sem_interesse        boolean not null default false,
  canais               text[] not null default '{}',
  primeiro_contato_em  timestamptz,
  ultimo_contato_em    timestamptz,
  importacao_id        uuid,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),

  constraint marketing_contatos_telefone_valido
    check (telefone ~ '^55[1-9][0-9]9[0-9]{8}$'),
  constraint marketing_contatos_telefone_unico
    unique (org_id, telefone),
  constraint marketing_contatos_compra_e_de_cliente
    check (comprou_em is null or cliente),
  constraint marketing_contatos_importacao_id_fkey
    foreign key (importacao_id) references public.marketing_importacoes (id) on delete cascade
);

-- A janela das campanhas por perfil: quem teve contato desde tal data.
create index if not exists marketing_contatos_ultimo_contato_idx
  on public.marketing_contatos (org_id, ultimo_contato_em desc);
-- Desfazer uma importação não varre a tabela inteira atrás dos contatos dela.
create index if not exists marketing_contatos_importacao_idx
  on public.marketing_contatos (importacao_id);

comment on table public.marketing_contatos is
  'A base de marketing importada (2026-10-07): uma PESSOA por linha, '
  'identificada pelo celular, vinda do RevendaMais ou de planilha. NÃO é a '
  'tabela leads, de propósito: leads é a fila de trabalho do vendedor, e a base '
  'antiga enterraria o kanban; as campanhas de SMS leem as duas. DADO PESSOAL '
  '(telefone, nome, e-mail). O painel NÃO lê: sem privilégio e sem policy para '
  'authenticated, porque o papel Marketing opera a importação e as campanhas e '
  'não lê contato. Só o servidor, com a chave de serviço, que devolve à tela '
  'contagem (marketing_resumo_da_base). Quem escreve é marketing_importar_lote. '
  'Ver 20261007120000_sms_campanhas.sql.';
comment on column public.marketing_contatos.telefone is
  'A identidade da pessoa: só dígitos, com 55 e DDD, celular de 9 dígitos '
  '("5541999990000") — o que telefoneParaSms devolve. Um por org.';
comment on column public.marketing_contatos.nome is
  'O primeiro nome que chegou para este celular. Importações seguintes não o trocam.';
comment on column public.marketing_contatos.email is
  'O primeiro e-mail que chegou para este celular. Importações seguintes não o trocam.';
comment on column public.marketing_contatos.cliente is
  'Já comprou na loja. Uma vez verdadeiro, nenhuma importação o desfaz.';
comment on column public.marketing_contatos.comprou_em is
  'A data da compra mais recente, quando a origem diz. É o que um upsell futuro '
  'vai usar. Só existe em quem é cliente.';
comment on column public.marketing_contatos.sem_interesse is
  'Marcado na origem como "não tem interesse" (MARCADORES_SEM_INTERESSE): não '
  'entra em público de campanha nenhuma. Uma vez verdadeiro, fica.';
comment on column public.marketing_contatos.canais is
  'Por onde a pessoa chegou (OLX, Site, Instagram...), sem repetir, na ordem em '
  'que os canais apareceram. É o que o filtro de canal da campanha lê.';
comment on column public.marketing_contatos.primeiro_contato_em is
  'O contato mais antigo que se conhece desta pessoa.';
comment on column public.marketing_contatos.ultimo_contato_em is
  'O contato mais recente que se conhece. É dele que a janela da campanha por '
  'perfil conta os dias.';
comment on column public.marketing_contatos.importacao_id is
  'A importação que CRIOU o contato (as seguintes o enriquecem e não mexem '
  'aqui). ON DELETE CASCADE: desfazer essa importação leva o contato.';
comment on column public.marketing_contatos.atualizado_em is
  'A última vez que uma importação tocou este contato, tenha mudado algo ou não.';

-- 4c. O registro: um carro que a pessoa olhou, ou comprou.
create table if not exists public.marketing_interesses (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  contato_id     uuid not null,
  importacao_id  uuid,
  origem_id      text,
  tipo           text not null,
  veiculo_id     bigint,
  marca          text,
  modelo         text,
  placa          text,
  canal          text,
  marcador       text,
  ocorreu_em     timestamptz not null default now(),
  criado_em      timestamptz not null default now(),

  constraint marketing_interesses_contato_id_fkey
    foreign key (contato_id) references public.marketing_contatos (id) on delete cascade,
  constraint marketing_interesses_importacao_id_fkey
    foreign key (importacao_id) references public.marketing_importacoes (id) on delete cascade,
  constraint marketing_interesses_tipo_valido
    check (tipo in ('interesse', 'compra')),
  constraint marketing_interesses_placa_valida
    check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$')
);

-- Os registros de uma pessoa (o público por carro; a eliminação do contato).
create index if not exists marketing_interesses_contato_idx
  on public.marketing_interesses (contato_id);
-- "Quem olhou ESTE carro", quando se sabe qual é o carro no estoque.
create index if not exists marketing_interesses_veiculo_idx
  on public.marketing_interesses (veiculo_id) where veiculo_id is not null;
-- Desfazer uma importação não varre a tabela inteira atrás dos registros dela.
create index if not exists marketing_interesses_importacao_idx
  on public.marketing_interesses (importacao_id);

-- A mesma linha da origem não entra duas vezes: nem no mesmo arquivo enviado
-- de novo, nem em outro arquivo que a traga.
create unique index if not exists marketing_interesses_origem_unica
  on public.marketing_interesses (org_id, origem_id)
  where origem_id is not null;
-- Linha sem id na origem (planilha comum): a mesma pessoa, o mesmo tipo, o
-- mesmo carro e a mesma data são a mesma linha. Marca e modelo sem distinguir
-- maiúscula. (A linha sem id E sem data é tratada em marketing_importar_lote:
-- ela ganha a hora da importação, que este índice não reconheceria.)
create unique index if not exists marketing_interesses_sem_origem_unico
  on public.marketing_interesses
     (contato_id, tipo, coalesce(veiculo_id, 0), coalesce(lower(marca), ''),
      coalesce(lower(modelo), ''), ocorreu_em)
  where origem_id is null;

comment on table public.marketing_interesses is
  'Os carros de cada pessoa da base de marketing (2026-10-07): um registro por '
  'carro que ela olhou (interesse) ou comprou (compra). É o que as campanhas '
  'por carro leem ("quem se interessou por este modelo"). Liga a pessoa ao '
  'carro: DADO PESSOAL. O painel NÃO lê (sem privilégio e sem policy para '
  'authenticated); só o servidor, com a chave de serviço. Vai embora com o '
  'contato e com a importação que o gravou. Ver 20261007120000_sms_campanhas.sql.';
comment on column public.marketing_interesses.contato_id is
  'A pessoa. ON DELETE CASCADE: eliminar o contato leva os registros dele.';
comment on column public.marketing_interesses.importacao_id is
  'A importação que gravou este registro. ON DELETE CASCADE: desfazê-la o leva.';
comment on column public.marketing_interesses.origem_id is
  'O id da linha na origem (o Id do lead no RevendaMais). Único por org quando '
  'existe: é o que impede a mesma linha de entrar duas vezes. NULO em planilha '
  'comum. Ids de fontes com numeração própria colidem: ver o aviso no cabeçalho '
  'da migração.';
comment on column public.marketing_interesses.tipo is
  'interesse (a pessoa olhou o carro) ou compra (comprou; faz dela cliente e '
  'não conta como interesse). A linha que só diz "é cliente" não vira registro: '
  'vira marketing_contatos.cliente.';
comment on column public.marketing_interesses.veiculo_id is
  'O carro no estoque do site (estoque_motors.id), quando se sabe qual é. SEM '
  'chave estrangeira, de propósito: o carro sai do estoque e o registro fica.';
comment on column public.marketing_interesses.marca is
  'A marca como veio da origem. Comparada pela marca canônica (lib/familiaDoModelo.ts).';
comment on column public.marketing_interesses.modelo is
  'Modelo e versão como vieram ("TIGUAN ALLSPACE R-LINE 350 TSI 2.0 4X4"). '
  'Comparado pela família do modelo.';
comment on column public.marketing_interesses.placa is
  'A placa, quando a origem traz: sete caracteres, maiúsculos, no padrão antigo '
  '(ABC1234) ou Mercosul (ABC1D23).';
comment on column public.marketing_interesses.canal is
  'Por onde ESTE contato chegou (OLX, Site...).';
comment on column public.marketing_interesses.marcador is
  'O marcador que a linha tinha na origem ("Não tem interesse", "Cliente nosso!").';
comment on column public.marketing_interesses.ocorreu_em is
  'Quando o interesse (ou a compra) aconteceu. Sem data na origem, é a hora da '
  'importação.';

-- 4d. O envio aponta para o contato. Aqui, e não na seção 2, porque
--     `marketing_contatos` só existe agora; e por `drop` + `add`, para valer
--     também no banco que tem a primeira versão deste arquivo.
alter table public.sms_envios
  drop constraint if exists sms_envios_contato_id_fkey,
  add constraint sms_envios_contato_id_fkey
    foreign key (contato_id) references public.marketing_contatos (id) on delete cascade;

-- A eliminação de um contato não varre a tabela inteira atrás dos envios dele.
create index if not exists sms_envios_contato_idx
  on public.sms_envios (contato_id) where contato_id is not null;


-- ----------------------------------------------------------------------------
-- 5. Privilégio e RLS
-- ----------------------------------------------------------------------------
revoke all on public.sms_campanhas, public.sms_envios, public.sms_descadastros,
              public.marketing_importacoes, public.marketing_contatos, public.marketing_interesses
  from public, anon, authenticated;

-- O painel lê a campanha, e só a campanha. Nada de escrita: quem grava é o
-- servidor, com a chave de serviço, depois de autorizar pela matriz.
grant select on public.sms_campanhas to authenticated;

grant select, insert, update, delete, truncate, references, trigger
  on public.sms_campanhas, public.sms_envios, public.sms_descadastros,
     public.marketing_importacoes, public.marketing_contatos, public.marketing_interesses
  to service_role;

alter table public.sms_campanhas         enable row level security;
alter table public.sms_envios            enable row level security;
alter table public.sms_descadastros      enable row level security;
alter table public.marketing_importacoes enable row level security;
alter table public.marketing_contatos    enable row level security;
alter table public.marketing_interesses  enable row level security;

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

-- `sms_envios`, `sms_descadastros` e as três `marketing_*`: RLS ligada e
-- NENHUMA policy, de propósito. São telefone, nome e o carro que cada pessoa
-- olhou, e o papel que opera as campanhas e a importação (Marketing) não lê
-- contato. Sem privilégio, ler direto é 42501; a RLS sem policy é a segunda
-- tranca, para o dia em que alguém conceder um SELECT por engano. A chave de
-- serviço passa pelas duas.


-- ----------------------------------------------------------------------------
-- 6. As três portas das campanhas
-- ----------------------------------------------------------------------------

-- 6a. Reserva atômica de um lote.
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

-- 6b. O clique no link curto.
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

-- 6c. O que ficou no meio do caminho vira falha — nunca volta para a fila.
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


-- ----------------------------------------------------------------------------
-- 7. As três portas da base de marketing
-- ----------------------------------------------------------------------------

-- 7a. Um lote de pessoas, com os registros de cada uma.
create or replace function public.marketing_importar_lote(p_importacao uuid, p_contatos jsonb)
  returns table (contatos_novos integer, contatos_atualizados integer, registros_novos integer)
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_org    uuid;
  v_novos  integer := 0;
  v_atual  integer := 0;
  v_reg    integer := 0;
begin
  -- A importação tem de existir, e a linha dela fica travada até o fim: dois
  -- lotes da mesma importação ao mesmo tempo entram em fila, e os contadores
  -- somam certo. A org dos contatos é a da importação.
  select i.org_id into v_org
    from public.marketing_importacoes i
   where i.id = p_importacao
     for update;
  if not found then
    raise exception 'marketing_importar_lote: a importação % não existe', p_importacao
      using errcode = 'no_data_found';
  end if;
  if p_contatos is null or jsonb_typeof(p_contatos) <> 'array' then
    raise exception 'marketing_importar_lote: p_contatos tem de ser um array JSON'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Uma instrução só: ou o lote entra inteiro, ou não entra.
  with
  -- Os elementos com celular válido. O resto (fixo, número torto, elemento que
  -- não é objeto) é ignorado, e não derruba o lote.
  elem as materialized (
    select t.ord, t.e, t.e->>'telefone' as telefone
      from jsonb_array_elements(p_contatos) with ordinality as t(e, ord)
     where jsonb_typeof(t.e) = 'object'
       and (t.e->>'telefone') ~ '^55[1-9][0-9]9[0-9]{8}$'
  ),
  reg as materialized (
    select el.telefone, el.ord, r.o,
           nullif(btrim(r.r->>'origem_id'), '')              as origem_id,
           r.r->>'tipo'                                      as tipo,
           nullif(r.r->>'veiculo_id', '')::bigint            as veiculo_id,
           nullif(btrim(r.r->>'marca'), '')                  as marca,
           nullif(btrim(r.r->>'modelo'), '')                 as modelo,
           nullif(btrim(r.r->>'placa'), '')                  as placa,
           nullif(btrim(r.r->>'canal'), '')                  as canal,
           nullif(btrim(r.r->>'marcador'), '')               as marcador,
           nullif(r.r->>'ocorreu_em', '')::timestamptz       as ocorreu_em
      from elem el
     cross join lateral jsonb_array_elements(
                  case when jsonb_typeof(el.e->'registros') = 'array'
                       then el.e->'registros' else '[]'::jsonb end)
                with ordinality as r(r, o)
     where jsonb_typeof(r.r) = 'object'
  ),
  -- Os canais de cada pessoa no lote, sem repetir, na ordem em que aparecem.
  canal_lote as (
    select el.telefone, btrim(c.canal) as canal, min(array[el.ord, c.o]) as pos
      from elem el
     cross join lateral jsonb_array_elements_text(
                  case when jsonb_typeof(el.e->'canais') = 'array'
                       then el.e->'canais' else '[]'::jsonb end)
                with ordinality as c(canal, o)
     where btrim(c.canal) <> ''
     group by el.telefone, btrim(c.canal)
  ),
  datas as (
    select r.telefone,
           min(r.ocorreu_em)        as menor,
           max(r.ocorreu_em)        as maior,
           bool_or(r.tipo = 'compra') as comprou
      from reg r
     group by r.telefone
  ),
  -- Uma linha por celular. O mesmo celular duas vezes no lote é fundido aqui,
  -- pela mesma regra da fusão com o banco: o `on conflict do update` não
  -- aceita tocar a mesma linha duas vezes numa instrução.
  pessoa as (
    select el.telefone,
           (array_agg(nullif(btrim(el.e->>'nome'), '') order by el.ord)
              filter (where nullif(btrim(el.e->>'nome'), '') is not null))[1]   as nome,
           (array_agg(nullif(btrim(el.e->>'email'), '') order by el.ord)
              filter (where nullif(btrim(el.e->>'email'), '') is not null))[1]  as email,
           coalesce(bool_or(el.e->'cliente' = 'true'::jsonb), false)           as cliente,
           max(nullif(el.e->>'comprou_em', '')::timestamptz)                    as comprou_em,
           coalesce(bool_or(el.e->'sem_interesse' = 'true'::jsonb), false)     as sem_interesse,
           min(nullif(el.e->>'primeiro_em', '')::timestamptz)                   as primeiro_em,
           max(nullif(el.e->>'ultimo_em', '')::timestamptz)                     as ultimo_em
      from elem el
     group by el.telefone
  ),
  pronto as (
    select p.telefone, p.nome, p.email,
           -- Cliente é quem veio marcado, quem tem data de compra, ou quem
           -- traz um registro de compra.
           (p.cliente or p.comprou_em is not null or coalesce(d.comprou, false)) as cliente,
           p.comprou_em, p.sem_interesse,
           coalesce((select array_agg(c.canal order by c.pos)
                       from canal_lote c where c.telefone = p.telefone), '{}') as canais,
           -- As datas dos registros também são contato. `least` e `greatest`
           -- ignoram nulo; a data que faltou no registro (e vira now() lá
           -- embaixo) NÃO conta: importar hoje não é ter falado com a pessoa hoje.
           least(p.primeiro_em, p.ultimo_em, d.menor)     as primeiro_em,
           greatest(p.primeiro_em, p.ultimo_em, d.maior)  as ultimo_em,
           exists (select 1 from public.marketing_contatos x
                    where x.org_id = v_org and x.telefone = p.telefone) as ja_existia
      from pessoa p
      left join datas d on d.telefone = p.telefone
  ),
  gravado as (
    insert into public.marketing_contatos as c
      (org_id, telefone, nome, email, cliente, comprou_em, sem_interesse, canais,
       primeiro_contato_em, ultimo_contato_em, importacao_id)
    select v_org, n.telefone, n.nome, n.email, n.cliente, n.comprou_em, n.sem_interesse, n.canais,
           n.primeiro_em, n.ultimo_em, p_importacao
      from pronto n
    on conflict (org_id, telefone) do update
       set nome                = coalesce(c.nome, excluded.nome),
           email               = coalesce(c.email, excluded.email),
           cliente             = c.cliente or excluded.cliente,
           comprou_em          = greatest(c.comprou_em, excluded.comprou_em),
           sem_interesse       = c.sem_interesse or excluded.sem_interesse,
           canais              = c.canais || array(select u.canal
                                                    from unnest(excluded.canais) with ordinality as u(canal, o)
                                                   where u.canal <> all (c.canais)
                                                   order by u.o),
           primeiro_contato_em = least(c.primeiro_contato_em, excluded.primeiro_contato_em),
           ultimo_contato_em   = greatest(c.ultimo_contato_em, excluded.ultimo_contato_em),
           atualizado_em       = now()
           -- importacao_id fica: é de quem CRIOU o contato.
    returning c.id, c.telefone
  ),
  registrado as (
    insert into public.marketing_interesses
      (org_id, contato_id, importacao_id, origem_id, tipo, veiculo_id, marca, modelo, placa,
       canal, marcador, ocorreu_em)
    select v_org, g.id, p_importacao, r.origem_id, r.tipo, r.veiculo_id, r.marca, r.modelo, r.placa,
           r.canal, r.marcador, coalesce(r.ocorreu_em, now())
      from reg r
      join gravado g on g.telefone = r.telefone
           -- Sem id na origem e sem data: o now() de cada importação é outro,
           -- e o índice único não reconheceria a repetição. Fica de fora
           -- quando a pessoa já tem registro sem origem do mesmo tipo e carro.
     where not (r.origem_id is null
                and r.ocorreu_em is null
                and exists (select 1 from public.marketing_interesses x
                             where x.contato_id = g.id
                               and x.origem_id is null
                               and x.tipo = r.tipo
                               and coalesce(x.veiculo_id, 0) = coalesce(r.veiculo_id, 0)
                               and coalesce(lower(x.marca), '') = coalesce(lower(r.marca), '')
                               and coalesce(lower(x.modelo), '') = coalesce(lower(r.modelo), '')))
     order by r.ord, r.o
    on conflict do nothing
    returning 1
  )
  select (select count(*) from pronto n where not n.ja_existia),
         (select count(*) from pronto n where n.ja_existia),
         (select count(*) from registrado)
    into v_novos, v_atual, v_reg;

  update public.marketing_importacoes i
     set contatos_novos       = i.contatos_novos + v_novos,
         contatos_atualizados = i.contatos_atualizados + v_atual,
         registros_novos      = i.registros_novos + v_reg
   where i.id = p_importacao;

  return query select v_novos, v_atual, v_reg;
end;
$fn$;

comment on function public.marketing_importar_lote(uuid, jsonb) is
  'Grava um lote de pessoas da base de marketing (até 400 por chamada, com '
  'folga) numa instrução só. p_contatos é um array JSON; cada elemento: '
  '{telefone, nome, email, cliente, comprou_em, sem_interesse, canais[], '
  'primeiro_em, ultimo_em, registros[{origem_id, tipo, veiculo_id, marca, '
  'modelo, placa, canal, marcador, ocorreu_em}]}. Celular novo vira contato; '
  'celular que já existe é FUNDIDO: nome e e-mail ficam os antigos (o novo só '
  'preenche vazio), cliente e sem_interesse são antigo OU novo, comprou_em é o '
  'mais recente, canais se unem sem repetir, primeiro e último contato são o '
  'menor e o maior (contando as datas dos registros). Registro repetido não '
  'entra (ver os dois índices únicos de marketing_interesses). Elemento com '
  'telefone fora do formato é ignorado; qualquer outro dado inválido (tipo, '
  'placa, data) recusa o lote INTEIRO, sem gravar nada. Importação '
  'inexistente levanta erro (P0002). Soma os três contadores na linha da '
  'importação e os devolve; contatos_atualizados conta quem já existia, tenha '
  'mudado ou não. Só service_role executa.';

-- 7b. Desfazer uma importação.
create or replace function public.marketing_desfazer_importacao(p_importacao uuid)
  returns table (contatos_removidos integer, registros_removidos integer)
  language plpgsql
  security definer
  set search_path = public
as $fn$
declare
  v_contatos   integer;
  v_registros  integer;
begin
  -- A linha travada: um lote atrasado da mesma importação espera, e depois
  -- não acha mais a importação (e levanta erro, sem gravar órfão).
  perform 1 from public.marketing_importacoes i where i.id = p_importacao for update;

  -- Conta antes de apagar: depois, o cascade já levou tudo.
  select count(*) into v_contatos
    from public.marketing_contatos c
   where c.importacao_id = p_importacao;
  select count(*) into v_registros
    from public.marketing_interesses r
   where r.importacao_id = p_importacao
      or r.contato_id in (select c.id from public.marketing_contatos c
                           where c.importacao_id = p_importacao);

  delete from public.marketing_importacoes i where i.id = p_importacao;

  return query select v_contatos, v_registros;
end;
$fn$;

comment on function public.marketing_desfazer_importacao(uuid) is
  'Desfaz uma importação da base de marketing: apaga a linha dela, e o ON '
  'DELETE CASCADE leva (1) os registros que ela gravou, (2) os contatos que '
  'ELA criou e, com cada contato, (3) os registros que OUTRAS importações '
  'penduraram nele e (4) os envios de SMS feitos a ele (sms_envios.contato_id). '
  'NÃO desfaz a fusão: o contato que já existia e foi enriquecido por ela '
  '(virou cliente, ganhou canal ou data) continua como ficou. O pedido de saída '
  '(sms_descadastros) não é tocado. Devolve quantos contatos e quantos '
  'registros foram embora, contados antes de apagar (os registros de (1) e de '
  '(3)). Importação inexistente devolve 0 e 0, sem erro. Só service_role executa.';

-- 7c. O retrato da base: só contagem.
create or replace function public.marketing_resumo_da_base()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public
as $fn$
  with c as (
    select k.id, k.cliente, k.comprou_em, k.sem_interesse, k.canais
      from public.marketing_contatos k
     where k.org_id = public.org_padrao()
  ),
  -- "Com carro": pelo menos um interesse (não compra) com marca ou modelo.
  com_carro as (
    select distinct r.contato_id
      from public.marketing_interesses r
     where r.org_id = public.org_padrao()
       and r.tipo = 'interesse'
       and (r.marca is not null or r.modelo is not null)
  ),
  canais as (
    select u.canal, count(distinct c.id) as pessoas
      from c
     cross join lateral unnest(c.canais) as u(canal)
     group by u.canal
     order by pessoas desc, u.canal
     limit 30
  ),
  marcas as (
    select upper(r.marca) as marca, count(distinct r.contato_id) as pessoas
      from public.marketing_interesses r
     where r.org_id = public.org_padrao()
       and r.tipo = 'interesse'
       and r.marca is not null
     group by upper(r.marca)
     order by pessoas desc, upper(r.marca)
     limit 15
  )
  select jsonb_build_object(
    'pessoas',                (select count(*) from c),
    'clientes',               (select count(*) from c where c.cliente),
    'com_data_de_compra',     (select count(*) from c where c.comprou_em is not null),
    'sem_interesse',          (select count(*) from c where c.sem_interesse),
    'interessados_com_carro', (select count(*) from c
                                where not c.cliente
                                  and exists (select 1 from com_carro v where v.contato_id = c.id)),
    'interessados_sem_carro', (select count(*) from c
                                where not c.cliente
                                  and not exists (select 1 from com_carro v where v.contato_id = c.id)),
    'canais', coalesce((select jsonb_agg(jsonb_build_object('canal', x.canal, 'pessoas', x.pessoas)
                                         order by x.pessoas desc, x.canal)
                          from canais x), '[]'::jsonb),
    'marcas', coalesce((select jsonb_agg(jsonb_build_object('marca', x.marca, 'pessoas', x.pessoas)
                                         order by x.pessoas desc, x.marca)
                          from marcas x), '[]'::jsonb));
$fn$;

comment on function public.marketing_resumo_da_base() is
  'O retrato da base de marketing da org, para a tela: SÓ contagem, nenhuma '
  'pessoa. {pessoas, clientes, com_data_de_compra, sem_interesse, '
  'interessados_com_carro, interessados_sem_carro, canais[{canal, pessoas}] '
  '(até 30, do maior para o menor), marcas[{marca, pessoas}] (até 15)}. '
  'Interessado é quem não é cliente; "com carro" é ter ao menos um registro de '
  'tipo interesse com marca ou modelo. marcas conta pessoas distintas por marca '
  'em maiúsculas, só nos registros de interesse. Só service_role executa.';

revoke all on function public.marketing_importar_lote(uuid, jsonb)      from public, anon, authenticated;
revoke all on function public.marketing_desfazer_importacao(uuid)       from public, anon, authenticated;
revoke all on function public.marketing_resumo_da_base()                from public, anon, authenticated;
grant execute on function public.marketing_importar_lote(uuid, jsonb)   to service_role;
grant execute on function public.marketing_desfazer_importacao(uuid)    to service_role;
grant execute on function public.marketing_resumo_da_base()             to service_role;


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. O efeito cria usuários de sonda (admin,
-- marketing, comercial, um marketing desativado), um lead, um contato da base
-- e quatro campanhas com destinatários; veste cada sessão e tenta ler,
-- escrever e chamar as funções; tenta gravar o inválido em cada regra; e usa
-- as seis funções como o servidor usa, vestindo service_role: reserva, clique
-- e presos; e depois importa dois arquivos de sonda (com reenvio, fusão,
-- telefone inválido e lote ruim), lê o resumo e desfaz as duas importações.
-- Tudo num sub-bloco que termina com um sentinela, e o rollback do sub-bloco
-- leva tudo junto. As variáveis sobrevivem ao rollback, e é por elas que o
-- veredito sai.
--
-- O que este bloco NÃO prova: a disputa de duas sessões pelo mesmo lote (de
-- envio ou de importação). Um `do` é uma transação só. Prova-se aqui que
-- chamadas seguidas não repetem linha; o `skip locked` é conferido pelo texto
-- da função.
do $aceite$
declare
  falhas            int := 0;
  v_alf             constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  v_tabelas         constant text[] := array['sms_campanhas', 'sms_envios', 'sms_descadastros',
                                             'marketing_importacoes', 'marketing_contatos',
                                             'marketing_interesses'];
  v_funcoes         constant text[] := array['public.sms_reservar_envios(uuid, integer)',
                                             'public.sms_registrar_clique(text)',
                                             'public.sms_devolver_presos(uuid, integer)',
                                             'public.marketing_importar_lote(uuid, jsonb)',
                                             'public.marketing_desfazer_importacao(uuid)',
                                             'public.marketing_resumo_da_base()'];
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

  -- a sonda da base de marketing
  v_imp0            uuid;   -- a importação do contato de sonda
  v_ct              uuid;   -- o contato de sonda (regras, unicidades, cascade)
  v_imp1            uuid;   -- "planilha": pessoas 1, 2 e 3
  v_imp2            uuid;   -- "revenda_mais": 1 e 2 de novo, e a 4
  v_j1              jsonb;
  v_j2              jsonb;
  v_j3              jsonb;
  v_p5              uuid;   -- não cliente, com um registro de compra (gravada direto)
  v_resumo_antes    jsonb;
  v_resumo          jsonb;

  -- e o que ela viu
  v_outra_data      boolean := false;
  v_ct_tinha        bigint := -1;
  v_ct_levou        bigint := -1;
  v_l1              text := '<não rodou>';
  v_l1_de_novo      text := '<não rodou>';
  v_reg_de_novo     bigint := -1;
  v_antes_da_fusao  boolean := false;
  v_sem_data        integer := -1;
  v_l2              text := '<não rodou>';
  v_l3              text := '<não rodou>';
  v_fusao           boolean := false;
  v_p2              boolean := false;
  v_p3              boolean := false;
  v_p4              boolean := false;
  v_p6              boolean := false;
  v_apos_o_2        boolean := false;
  v_invalidos       bigint := -1;
  v_contadores      text := '<não rodou>';
  v_sem_importacao  text := '<não rodou>';
  v_nao_e_lista     text := '<não rodou>';
  v_lote_ruim       text := '<não rodou>';
  v_lote_ruim_ficou bigint := -1;
  v_resumo_deltas   text := '<não rodou>';
  v_resumo_forma    boolean := false;
  v_resumo_listas   boolean := false;
  v_resumo_modo     text := '<não rodou>';
  v_d1              text := '<não rodou>';
  v_d1_ficou        text := '<não rodou>';
  v_d2              text := '<não rodou>';
  v_d3              text := '<não rodou>';
  v_base_sobrou     bigint := -1;
begin
  if current_user in ('authenticated', 'anon', 'service_role') then
    raise exception 'ACEITE INCONCLUSIVO: a migração roda como papel de API (%)', current_user;
  end if;

  -- 1 · As seis tabelas, com RLS e comentário.
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
      ('sms_campanhas',    'sms_campanhas_carro_do_criterio',   'c', null, null),
      ('sms_campanhas',    'sms_campanhas_janela_valida',       'c', null, null),
      ('sms_campanhas',    'sms_campanhas_descanso_valido',     'c', null, null),
      ('sms_campanhas',    'sms_campanhas_compra_valida',       'c', null, null),
      ('sms_campanhas',    'sms_campanhas_compra_so_de_cliente', 'c', null, null),
      ('sms_campanhas',    'sms_campanhas_mensagem_tem_link',   'c', null, null),
      ('sms_campanhas',    'sms_campanhas_sem_carro_sem_variavel', 'c', null, null),
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
      ('sms_envios',       'sms_envios_contato_id_fkey',        'f', 'marketing_contatos', 'c'),
      ('sms_descadastros', 'sms_descadastros_pkey',             'p', null, null),
      ('sms_descadastros', 'sms_descadastros_telefone_valido',  'c', null, null),
      ('sms_descadastros', 'sms_descadastros_origem_valida',    'c', null, null),
      ('sms_descadastros', 'sms_descadastros_campanha_id_fkey', 'f', 'sms_campanhas', 'n'),
      ('marketing_importacoes', 'marketing_importacoes_origem_valida',      'c', null, null),
      ('marketing_importacoes', 'marketing_importacoes_arquivo_curto',      'c', null, null),
      ('marketing_importacoes', 'marketing_importacoes_linhas_validas',     'c', null, null),
      ('marketing_importacoes', 'marketing_importacoes_contadores_validos', 'c', null, null),
      ('marketing_contatos',    'marketing_contatos_telefone_valido',       'c', null, null),
      ('marketing_contatos',    'marketing_contatos_telefone_unico',        'u', null, null),
      ('marketing_contatos',    'marketing_contatos_compra_e_de_cliente',   'c', null, null),
      ('marketing_contatos',    'marketing_contatos_importacao_id_fkey',    'f', 'marketing_importacoes', 'c'),
      ('marketing_interesses',  'marketing_interesses_tipo_valido',         'c', null, null),
      ('marketing_interesses',  'marketing_interesses_placa_valida',        'c', null, null),
      ('marketing_interesses',  'marketing_interesses_contato_id_fkey',     'f', 'marketing_contatos',    'c'),
      ('marketing_interesses',  'marketing_interesses_importacao_id_fkey',  'f', 'marketing_importacoes', 'c')
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

  -- (org, telefone) é a identidade do contato, nesta ordem.
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.marketing_contatos'::regclass and conname = 'marketing_contatos_telefone_unico')
     is distinct from 'UNIQUE (org_id, telefone)' then
    falhas := falhas + 1;
    raise warning 'FALHOU: marketing_contatos_telefone_unico não é UNIQUE (org_id, telefone)';
  end if;

  -- Os dois índices únicos parciais que impedem o registro repetido: existem,
  -- são únicos, válidos e parciais.
  foreach v_nome in array array['marketing_interesses_origem_unica', 'marketing_interesses_sem_origem_unico'] loop
    if not exists (select 1 from pg_index x
                     join pg_class c on c.oid = x.indexrelid
                    where x.indrelid = 'public.marketing_interesses'::regclass
                      and c.relname = v_nome
                      and x.indisunique and x.indisvalid and x.indpred is not null) then
      falhas := falhas + 1;
      raise warning 'FALHOU: índice único parcial % ausente ou inválido em marketing_interesses', v_nome;
    end if;
  end loop;

  -- O que mudou desde a primeira versão do arquivo chegou, qualquer que tenha
  -- sido o ponto de partida: o carro é opcional, e canais, descanso e contato
  -- existem.
  if exists (select 1 from pg_attribute
              where attrelid = 'public.sms_campanhas'::regclass
                and attname in ('veiculo_id', 'veiculo_rotulo') and attnotnull) then
    falhas := falhas + 1;
    raise warning 'FALHOU: sms_campanhas.veiculo_id ou veiculo_rotulo ainda é NOT NULL: campanha por perfil sem carro não entra';
  end if;
  select count(*) into v_n from pg_attribute
   where not attisdropped
     and ((attrelid = 'public.sms_campanhas'::regclass and attname = 'canais'
           and atttypid = 'text[]'::regtype and attnotnull and atthasdef)
       or (attrelid = 'public.sms_campanhas'::regclass and attname = 'descanso_dias'
           and atttypid = 'integer'::regtype and attnotnull and atthasdef)
       or (attrelid = 'public.sms_envios'::regclass and attname = 'contato_id'
           and atttypid = 'uuid'::regtype and not attnotnull));
  if v_n <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: sms_campanhas.canais (text[] not null), sms_campanhas.descanso_dias (integer not null) ou sms_envios.contato_id (uuid, nulável) não está como prometido (% de 3)', v_n;
  end if;

  -- Nada aponta para o estoque: o carro sai, e a campanha e o registro ficam.
  if exists (select 1 from pg_constraint
              where confrelid = 'public.estoque_motors'::regclass
                and conrelid in ('public.sms_campanhas'::regclass, 'public.sms_envios'::regclass,
                                 'public.sms_descadastros'::regclass,
                                 'public.marketing_importacoes'::regclass,
                                 'public.marketing_contatos'::regclass,
                                 'public.marketing_interesses'::regclass)) then
    falhas := falhas + 1;
    raise warning 'FALHOU: há chave estrangeira das tabelas de SMS ou da base de marketing para estoque_motors';
  end if;

  -- 3 · Privilégio. anon: nada, nas seis. authenticated: SELECT em
  --     sms_campanhas e só ele; NADA em sms_envios, em sms_descadastros e nas
  --     três marketing_*. service_role: lê e escreve nas seis.
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

  -- 4 · Policies: uma, de leitura, em sms_campanhas; nenhuma nas outras cinco.
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
   where schemaname = 'public'
     and tablename in ('sms_envios', 'sms_descadastros', 'marketing_importacoes',
                       'marketing_contatos', 'marketing_interesses');
  if v_n <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: sms_envios, sms_descadastros e as três marketing_* deveriam não ter policy nenhuma (achei %)', v_n;
  end if;

  -- 5 · As seis funções: SECURITY DEFINER, search_path fixo, comentadas, e só
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
               (select count(*) from public.leads where nome = 'Aceite SMS Lead'),
               (select count(*) from public.marketing_importacoes),
               (select count(*) from public.marketing_contatos),
               (select count(*) from public.marketing_interesses)]
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

    --      A base de marketing: o retrato dela ANTES de qualquer sonda (em
    --      produção ela pode já ter gente), e um contato com dois registros,
    --      um com id de origem e um sem.
    v_resumo_antes := public.marketing_resumo_da_base();
    insert into public.marketing_importacoes (origem, arquivo)
    values ('planilha', 'aceite-0.csv')
    returning id into v_imp0;
    insert into public.marketing_contatos (telefone, nome, importacao_id)
    values ('5541900000950', 'Aceite Base', v_imp0)
    returning id into v_ct;
    insert into public.marketing_interesses
      (contato_id, importacao_id, origem_id, tipo, marca, modelo, ocorreu_em)
    values (v_ct, v_imp0, 'aceite-0', 'interesse', 'Aceite', 'Sonda', '2025-01-01T12:00:00Z'),
           (v_ct, v_imp0, null,       'interesse', 'Aceite', 'Sonda', '2025-01-01T12:00:00Z');

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
        ('admin',      'select count(*) from (select public.sms_devolver_presos(''{a}'')) x',       'negado'),
        -- A base de marketing: ninguém de sessão lê pessoa, registro nem
        -- importação; ninguém escreve; ninguém chama as três funções. Nem o
        -- resumo, que é só contagem: a tela o recebe do servidor.
        ('anon',       'select count(*) from public.marketing_importacoes', 'negado'),
        ('anon',       'select count(*) from public.marketing_contatos',    'negado'),
        ('anon',       'select count(*) from public.marketing_interesses',  'negado'),
        ('marketing',  'select count(*) from public.marketing_importacoes', 'negado'),
        ('marketing',  'select count(*) from public.marketing_contatos',    'negado'),
        ('marketing',  'select count(*) from public.marketing_interesses',  'negado'),
        ('admin',      'select count(*) from public.marketing_importacoes', 'negado'),
        ('admin',      'select count(*) from public.marketing_contatos',    'negado'),
        ('admin',      'select count(*) from public.marketing_interesses',  'negado'),
        ('comercial',  'select count(*) from public.marketing_contatos',    'negado'),
        ('marketing',  'with x as (insert into public.marketing_contatos (telefone) values (''5541900000999'') returning 1) select count(*) from x', 'negado'),
        ('anon',       'select count(*) from public.marketing_importar_lote(''{b}'', ''[]''::jsonb)',  'negado'),
        ('anon',       'select count(*) from public.marketing_desfazer_importacao(''{b}'')',          'negado'),
        ('anon',       'select length(public.marketing_resumo_da_base()::text)',                      'negado'),
        ('marketing',  'select count(*) from public.marketing_importar_lote(''{b}'', ''[]''::jsonb)',  'negado'),
        ('marketing',  'select count(*) from public.marketing_desfazer_importacao(''{b}'')',          'negado'),
        ('marketing',  'select length(public.marketing_resumo_da_base()::text)',                      'negado'),
        ('admin',      'select count(*) from public.marketing_importar_lote(''{b}'', ''[]''::jsonb)',  'negado'),
        ('admin',      'select count(*) from public.marketing_desfazer_importacao(''{b}'')',          'negado'),
        ('admin',      'select length(public.marketing_resumo_da_base()::text)',                      'negado')
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
    --      fala). Cada tentativa parte de uma linha VÁLIDA e muda um campo (ou
    --      os poucos que a regra cruza). Os casos sem regra são a contraprova:
    --      a linha de partida de cada tabela entra, e entra o que é novo e
    --      VÁLIDO (campanha por perfil sem carro, perfil com carro e com
    --      {carro} na mensagem, o tempo desde a compra em clientes e todos, os
    --      destinos '/estoque' e '/avaliacao', cliente com data de compra, as
    --      duas formas de placa). Toda tentativa é desfeita, entre ou não.
    v_bases := jsonb_build_object(
      'sms_campanhas', jsonb_build_object(
        'id', gen_random_uuid(), 'org_id', public.org_padrao(), 'nome', 'Aceite SMS regra',
        'codigo', 'zzzzzz6', 'veiculo_id', 1, 'veiculo_rotulo', 'carro de aceite',
        'destino', '/estoque/aceite', 'criterio', 'mesmo_veiculo', 'mensagem', 'Veja: {link}',
        'canais', '[]'::jsonb, 'descanso_dias', 0,
        'situacao', 'rascunho', 'homologacao', false, 'criado_em', now()),
      'sms_envios', jsonb_build_object(
        'id', gen_random_uuid(), 'org_id', public.org_padrao(), 'campanha_id', v_b,
        'telefone', '5541900000900', 'codigo', 'zzzzyzy', 'texto', 'Aceite',
        'partes', 1, 'situacao', 'na_fila', 'cliques', 0, 'criado_em', now()),
      'sms_descadastros', jsonb_build_object(
        'org_id', public.org_padrao(), 'telefone', '5541900000900', 'origem', 'painel',
        'criado_em', now()),
      'marketing_importacoes', jsonb_build_object(
        'id', gen_random_uuid(), 'org_id', public.org_padrao(), 'origem', 'planilha',
        'arquivo', 'aceite-regra.csv', 'linhas', 0, 'contatos_novos', 0,
        'contatos_atualizados', 0, 'registros_novos', 0, 'criado_em', now()),
      'marketing_contatos', jsonb_build_object(
        'id', gen_random_uuid(), 'org_id', public.org_padrao(), 'telefone', '5541900000901',
        'cliente', false, 'sem_interesse', false, 'canais', '[]'::jsonb,
        'criado_em', now(), 'atualizado_em', now()),
      'marketing_interesses', jsonb_build_object(
        'id', gen_random_uuid(), 'org_id', public.org_padrao(), 'contato_id', v_ct,
        'tipo', 'interesse', 'marca', 'Aceite regra', 'ocorreu_em', now(), 'criado_em', now()));

    for v_caso in
      select * from (values
        ('sms_campanhas',    null::text,                          '{}'::jsonb),
        -- O que é novo e válido: por perfil SEM carro; por perfil COM carro, e
        -- então {carro} e {preco} valem; canais e descanso.
        ('sms_campanhas',    null,                                '{"criterio": "todos", "veiculo_id": null, "veiculo_rotulo": null}'),
        ('sms_campanhas',    null,                                '{"criterio": "clientes", "mensagem": "{nome}, o {carro} por {preco}: {link}"}'),
        ('sms_campanhas',    null,                                '{"criterio": "interessados", "veiculo_id": null, "veiculo_rotulo": null, "canais": ["OLX", "Site"], "descanso_dias": 30}'),
        -- "Hora de trocar seu carro": o tempo desde a compra, nos quatro valores,
        -- com os dois critérios que o admitem; e os dois destinos sem carro.
        ('sms_campanhas',    null,                                '{"criterio": "clientes", "compra_ha_meses": 12}'),
        ('sms_campanhas',    null,                                '{"criterio": "clientes", "compra_ha_meses": 36}'),
        ('sms_campanhas',    null,                                '{"criterio": "todos", "veiculo_id": null, "veiculo_rotulo": null, "compra_ha_meses": 18}'),
        ('sms_campanhas',    null,                                '{"criterio": "todos", "veiculo_id": null, "veiculo_rotulo": null, "compra_ha_meses": 24}'),
        ('sms_campanhas',    null,                                '{"criterio": "clientes", "veiculo_id": null, "veiculo_rotulo": null, "destino": "/estoque"}'),
        ('sms_campanhas',    null,                                '{"criterio": "clientes", "veiculo_id": null, "veiculo_rotulo": null, "destino": "/avaliacao", "compra_ha_meses": 24}'),
        ('sms_campanhas',    'sms_campanhas_compra_valida',       '{"criterio": "clientes", "compra_ha_meses": 6}'),
        ('sms_campanhas',    'sms_campanhas_compra_valida',       '{"criterio": "clientes", "compra_ha_meses": 0}'),
        ('sms_campanhas',    'sms_campanhas_compra_valida',       '{"criterio": "todos", "veiculo_id": null, "veiculo_rotulo": null, "compra_ha_meses": 48}'),
        ('sms_campanhas',    'sms_campanhas_compra_so_de_cliente', '{"criterio": "mesmo_modelo", "compra_ha_meses": 24}'),
        ('sms_campanhas',    'sms_campanhas_compra_so_de_cliente', '{"criterio": "interessados", "veiculo_id": null, "veiculo_rotulo": null, "compra_ha_meses": 24}'),
        ('sms_campanhas',    'sms_campanhas_criterio_valido',     '{"criterio": "todo_mundo"}'),
        ('sms_campanhas',    'sms_campanhas_criterio_valido',     '{"criterio": "MESMO_VEICULO"}'),
        ('sms_campanhas',    'sms_campanhas_criterio_valido',     '{"criterio": "perfil"}'),
        -- Critério de carro sem o carro, nos quatro; e o carro pela metade.
        ('sms_campanhas',    'sms_campanhas_carro_do_criterio',   '{"veiculo_id": null, "veiculo_rotulo": null}'),
        ('sms_campanhas',    'sms_campanhas_carro_do_criterio',   '{"criterio": "mesmo_modelo", "veiculo_id": null, "veiculo_rotulo": null}'),
        ('sms_campanhas',    'sms_campanhas_carro_do_criterio',   '{"criterio": "mesma_marca", "veiculo_id": null, "veiculo_rotulo": null}'),
        ('sms_campanhas',    'sms_campanhas_carro_do_criterio',   '{"criterio": "faixa_de_preco", "veiculo_id": null, "veiculo_rotulo": null}'),
        ('sms_campanhas',    'sms_campanhas_carro_do_criterio',   '{"veiculo_rotulo": null}'),
        ('sms_campanhas',    'sms_campanhas_carro_do_criterio',   '{"criterio": "todos", "veiculo_id": null}'),
        -- Sem carro, a mensagem não pode pedir o carro nem o preço.
        ('sms_campanhas',    'sms_campanhas_sem_carro_sem_variavel', '{"criterio": "todos", "veiculo_id": null, "veiculo_rotulo": null, "mensagem": "{nome}, por {preco}: {link}"}'),
        ('sms_campanhas',    'sms_campanhas_sem_carro_sem_variavel', '{"criterio": "interessados", "veiculo_id": null, "veiculo_rotulo": null, "mensagem": "Veja o {carro}: {link}"}'),
        ('sms_campanhas',    'sms_campanhas_descanso_valido',     '{"descanso_dias": 3}'),
        ('sms_campanhas',    'sms_campanhas_descanso_valido',     '{"descanso_dias": -7}'),
        ('sms_campanhas',    'sms_campanhas_descanso_valido',     '{"descanso_dias": 60}'),
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
        ('sms_descadastros', 'sms_descadastros_origem_valida',    '{"origem": "webhook"}'),
        ('marketing_importacoes', null,                                       '{}'),
        ('marketing_importacoes', 'marketing_importacoes_origem_valida',      '{"origem": "excel"}'),
        ('marketing_importacoes', 'marketing_importacoes_origem_valida',      '{"origem": "REVENDA_MAIS"}'),
        ('marketing_importacoes', 'marketing_importacoes_origem_valida',      '{"origem": "revendamais"}'),
        ('marketing_importacoes', 'marketing_importacoes_arquivo_curto',      jsonb_build_object('arquivo', repeat('x', 201))),
        ('marketing_importacoes', 'marketing_importacoes_linhas_validas',     '{"linhas": -1}'),
        ('marketing_importacoes', 'marketing_importacoes_contadores_validos', '{"contatos_novos": -1}'),
        ('marketing_importacoes', 'marketing_importacoes_contadores_validos', '{"registros_novos": -1}'),
        ('marketing_contatos',    null,                                       '{}'),
        ('marketing_contatos',    null,                                       '{"cliente": true, "comprou_em": "2024-01-01T12:00:00Z"}'),
        ('marketing_contatos',    'marketing_contatos_telefone_valido',       '{"telefone": "554133334444"}'),
        ('marketing_contatos',    'marketing_contatos_telefone_valido',       '{"telefone": "41999990000"}'),
        ('marketing_contatos',    'marketing_contatos_telefone_valido',       '{"telefone": "+5541999990000"}'),
        ('marketing_contatos',    'marketing_contatos_compra_e_de_cliente',   '{"comprou_em": "2024-01-01T12:00:00Z"}'),
        ('marketing_interesses',  null,                                       '{}'),
        ('marketing_interesses',  null,                                       '{"placa": "ABC1D23"}'),
        ('marketing_interesses',  null,                                       '{"placa": "ABC1234", "tipo": "compra"}'),
        -- "cliente" é tipo de LINHA da planilha (TIPOS_DE_REGISTRO), e não de
        -- registro: essa linha vira marketing_contatos.cliente.
        ('marketing_interesses',  'marketing_interesses_tipo_valido',         '{"tipo": "cliente"}'),
        ('marketing_interesses',  'marketing_interesses_tipo_valido',         '{"tipo": "COMPRA"}'),
        ('marketing_interesses',  'marketing_interesses_placa_valida',        '{"placa": "abc1d23"}'),
        ('marketing_interesses',  'marketing_interesses_placa_valida',        '{"placa": "ABC-1D23"}'),
        ('marketing_interesses',  'marketing_interesses_placa_valida',        '{"placa": "AB1C234"}'),
        ('marketing_interesses',  'marketing_interesses_placa_valida',        '{"placa": "ABCD123"}'),
        ('marketing_interesses',  'marketing_interesses_placa_valida',        '{"placa": "ABC12345"}')
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
         'insert into public.sms_envios (campanha_id, lead_id, telefone, codigo, texto) values (''{b}'', gen_random_uuid(), ''5541900000997'', ''zzzzyzz'', ''x'')'),
        ('sms_envios_contato_id_fkey',
         'insert into public.sms_envios (campanha_id, contato_id, telefone, codigo, texto) values (''{b}'', gen_random_uuid(), ''5541900000997'', ''zzzzyzz'', ''x'')'),
        -- Uma pessoa, um celular.
        ('marketing_contatos_telefone_unico',
         'insert into public.marketing_contatos (telefone) values (''5541900000950'')'),
        ('marketing_contatos_importacao_id_fkey',
         'insert into public.marketing_contatos (telefone, importacao_id) values (''5541900000996'', gen_random_uuid())'),
        -- A mesma linha da origem não entra duas vezes, nem com outro tipo.
        ('marketing_interesses_origem_unica',
         'insert into public.marketing_interesses (contato_id, origem_id, tipo) values (''{ct}'', ''aceite-0'', ''compra'')'),
        -- Sem id de origem: a mesma pessoa, tipo, carro e data, sem distinguir maiúscula.
        ('marketing_interesses_sem_origem_unico',
         'insert into public.marketing_interesses (contato_id, tipo, marca, modelo, ocorreu_em) values (''{ct}'', ''interesse'', ''ACEITE'', ''sonda'', ''2025-01-01T12:00:00Z'')'),
        ('marketing_interesses_contato_id_fkey',
         'insert into public.marketing_interesses (contato_id, tipo) values (gen_random_uuid(), ''interesse'')'),
        ('marketing_interesses_importacao_id_fkey',
         'insert into public.marketing_interesses (contato_id, importacao_id, tipo) values (''{ct}'', gen_random_uuid(), ''interesse'')')
      ) as t(regra, comando)
    loop
      v_unicas := v_unicas + 1;
      begin
        execute replace(replace(replace(replace(v_caso.comando, '{a}', v_a::text), '{b}', v_b::text),
                                '{cod1}', v_cod1), '{ct}', v_ct::text);
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

    -- E a outra: o mesmo carro, sem id de origem, em OUTRA data entra.
    begin
      insert into public.marketing_interesses (contato_id, tipo, marca, modelo, ocorreu_em)
      values (v_ct, 'interesse', 'Aceite', 'Sonda', '2025-02-02T12:00:00Z');
      raise exception 'ENTROU' using errcode = 'PSM02';
    exception
      when sqlstate 'PSM02' then v_outra_data := true;
      when unique_violation then v_outra_data := false;
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

    -- 6i · Eliminar o contato da base leva o envio feito a ele e os registros
    --      dele. (A campanha B ainda existe; o envio entra nela.)
    insert into public.sms_envios (campanha_id, contato_id, telefone, nome, codigo, texto)
    values (v_b, v_ct, '5541900000950', 'Aceite Base', 'zzzzyzz', 'x');
    select (select count(*) from public.sms_envios where contato_id = v_ct)
         + (select count(*) from public.marketing_interesses where contato_id = v_ct)
      into v_ct_tinha;
    delete from public.marketing_contatos where id = v_ct;
    select (select count(*) from public.sms_envios where codigo = 'zzzzyzz')
         + (select count(*) from public.marketing_interesses where importacao_id = v_imp0)
      into v_ct_levou;
    delete from public.marketing_importacoes where id = v_imp0;

    -- 6j · A importação, como o servidor chama (service_role). Dois arquivos:
    --        1 ("planilha") ....... pessoas 1, 2 e 3; um fixo, um número sem
    --                               55 e três elementos que nem objeto são
    --        2 ("revenda_mais") ... 1 e 2 de novo (fusão) e a 4, que vem DUAS
    --                               vezes no mesmo lote
    --      E um terceiro lote, de volta na importação 1, com o que a fusão NÃO
    --      pode desfazer (as quatro pessoas dizendo menos do que já se sabe) e
    --      uma sexta pessoa, que só traz a data da compra.
    v_j1 := $j1$[
      {"telefone": "5541900000101", "nome": "Aceite Base Um", "email": "um@exemplo.invalido",
       "cliente": false, "comprou_em": null, "sem_interesse": false,
       "canais": ["OLX", "Site", "OLX"], "primeiro_em": null, "ultimo_em": null,
       "registros": [
         {"origem_id": "aceite-1", "tipo": "interesse", "veiculo_id": null, "marca": "Volkswagen",
          "modelo": "Gol", "placa": "ABC1D23", "canal": "OLX", "marcador": null,
          "ocorreu_em": "2025-01-10T12:00:00Z"},
         {"origem_id": null, "tipo": "interesse", "veiculo_id": 7950008, "marca": "Fiat",
          "modelo": "Uno", "placa": null, "canal": "Site", "marcador": null, "ocorreu_em": null}]},
      {"telefone": "5541900000102", "nome": "Aceite Base Dois", "email": null, "cliente": true,
       "comprou_em": "2024-03-01T15:00:00Z", "sem_interesse": false, "canais": ["Indicação"],
       "registros": [
         {"origem_id": "aceite-2", "tipo": "compra", "marca": "Fiat", "modelo": "Argo",
          "ocorreu_em": "2024-03-01T15:00:00Z"}]},
      {"telefone": "5541900000103", "nome": null, "cliente": false, "sem_interesse": true,
       "canais": ["OLX"], "primeiro_em": "2023-05-05T12:00:00Z", "ultimo_em": "2023-06-06T12:00:00Z",
       "registros": []},
      {"telefone": "554133334444", "nome": "Aceite Fixo", "canais": ["OLX"],
       "registros": [{"origem_id": "aceite-fixo", "tipo": "interesse", "marca": "Fiat"}]},
      {"telefone": "41999990000", "nome": "Aceite Sem 55"},
      "lixo", null, 7
    ]$j1$::jsonb;
    v_j2 := $j2$[
      {"telefone": "5541900000101", "nome": "Outro Nome", "email": "outro@exemplo.invalido",
       "cliente": false, "comprou_em": null, "canais": ["Site", "Instagram"],
       "registros": [
         {"origem_id": "aceite-3", "tipo": "compra", "marca": "VOLKSWAGEN", "modelo": "Polo",
          "ocorreu_em": "2026-02-02T12:00:00Z"},
         {"origem_id": "aceite-1", "tipo": "interesse", "marca": "Volkswagen", "modelo": "Gol",
          "ocorreu_em": "2025-01-10T12:00:00Z"}]},
      {"telefone": "5541900000102", "nome": "Aceite Base Dois", "cliente": true,
       "comprou_em": "2020-01-01T12:00:00Z", "canais": []},
      {"telefone": "5541900000104", "nome": null, "canais": [],
       "registros": [
         {"origem_id": "aceite-4", "tipo": "interesse", "marca": "volkswagen", "modelo": "T-Cross",
          "ocorreu_em": "2026-03-03T12:00:00Z"}]},
      {"telefone": "5541900000104", "nome": "Aceite Base Quatro", "canais": ["Site"],
       "registros": [
         {"origem_id": "aceite-4", "tipo": "interesse", "marca": "volkswagen", "modelo": "T-Cross",
          "ocorreu_em": "2026-03-03T12:00:00Z"},
         {"origem_id": "aceite-5", "tipo": "interesse", "marca": "Fiat", "modelo": "Mobi",
          "ocorreu_em": "2026-03-04T12:00:00Z"}]}
    ]$j2$::jsonb;
    v_j3 := $j3$[
      {"telefone": "5541900000101", "nome": "Terceiro Nome", "cliente": false,
       "comprou_em": "2026-02-02T12:00:00Z", "sem_interesse": false, "canais": ["OLX"]},
      {"telefone": "5541900000102", "cliente": false, "sem_interesse": false},
      {"telefone": "5541900000103", "nome": "Aceite Base Três", "cliente": false, "sem_interesse": false,
       "registros": [
         {"origem_id": "aceite-7", "tipo": "interesse", "canal": "OLX",
          "ocorreu_em": "2023-06-01T12:00:00Z"}]},
      {"telefone": "5541900000104",
       "registros": [
         {"origem_id": "aceite-6", "tipo": "interesse", "marca": "Fiat", "modelo": "Pulse",
          "ocorreu_em": "2026-04-04T12:00:00Z"}]},
      {"telefone": "5541900000108", "cliente": false, "comprou_em": "2022-02-02T12:00:00Z"}
    ]$j3$::jsonb;

    set local role service_role;
    insert into public.marketing_importacoes (origem, arquivo, linhas)
    values ('planilha', 'aceite-1.csv', 8)
    returning id into v_imp1;
    insert into public.marketing_importacoes (origem, arquivo, linhas)
    values ('revenda_mais', 'aceite-2.xls', 4)
    returning id into v_imp2;

    --      O primeiro lote cria as três pessoas e os três registros; os cinco
    --      elementos sem celular válido ficam de fora, sem derrubar nada.
    select l.contatos_novos || '|' || l.contatos_atualizados || '|' || l.registros_novos
      into v_l1
      from public.marketing_importar_lote(v_imp1, v_j1) l;
    reset role;
    --      O registro que veio sem id de origem e sem data ganhou a hora da
    --      importação. Ela é recuada um dia (now() não anda dentro da
    --      transação): é como o banco o encontra numa reimportação de verdade.
    update public.marketing_interesses
       set ocorreu_em = now() - interval '1 day'
     where importacao_id = v_imp1 and origem_id is null;
    get diagnostics v_sem_data = row_count;
    set local role service_role;
    --      O MESMO lote de novo: ninguém novo, nenhum registro novo — nem o que
    --      veio sem id de origem e sem data.
    select l.contatos_novos || '|' || l.contatos_atualizados || '|' || l.registros_novos
      into v_l1_de_novo
      from public.marketing_importar_lote(v_imp1, v_j1) l;
    reset role;

    select count(*) into v_reg_de_novo from public.marketing_interesses where importacao_id = v_imp1;
    select not c.cliente and c.comprou_em is null and c.canais = array['OLX', 'Site']
           and c.primeiro_contato_em = '2025-01-10T12:00:00Z'
           and c.ultimo_contato_em = '2025-01-10T12:00:00Z'
      into v_antes_da_fusao
      from public.marketing_contatos c
     where c.org_id = public.org_padrao() and c.telefone = '5541900000101';

    --      O segundo arquivo: a pessoa 1 vira cliente só por trazer um registro
    --      de compra (sem data de compra, e dita "não cliente"), ganha um canal
    --      e um último contato mais novo; o nome, o e-mail e a importação de
    --      origem ficam. A data da compra chega no terceiro lote.
    set local role service_role;
    select l.contatos_novos || '|' || l.contatos_atualizados || '|' || l.registros_novos
      into v_l2
      from public.marketing_importar_lote(v_imp2, v_j2) l;
    reset role;
    select c.cliente and c.comprou_em is null and c.ultimo_contato_em = '2026-02-02T12:00:00Z'
      into v_apos_o_2
      from public.marketing_contatos c
     where c.org_id = public.org_padrao() and c.telefone = '5541900000101';
    set local role service_role;
    --      O terceiro lote: a 1 com outro nome e a data da compra; a 2 dita
    --      "não cliente"; a 3 dita "tem interesse", com o nome que faltava e
    --      um contato sem carro; a 4 com mais um carro; e a 6, nova, que vira
    --      cliente só por trazer a data da compra. Uma nova, quatro tocadas,
    --      dois registros.
    select l.contatos_novos || '|' || l.contatos_atualizados || '|' || l.registros_novos
      into v_l3
      from public.marketing_importar_lote(v_imp1, v_j3) l;
    reset role;

    select c.nome = 'Aceite Base Um' and c.email = 'um@exemplo.invalido'
           and c.cliente and c.comprou_em = '2026-02-02T12:00:00Z'
           and c.canais = array['OLX', 'Site', 'Instagram']
           and c.primeiro_contato_em = '2025-01-10T12:00:00Z'
           and c.ultimo_contato_em = '2026-02-02T12:00:00Z'
           and c.importacao_id = v_imp1
      into v_fusao
      from public.marketing_contatos c
     where c.org_id = public.org_padrao() and c.telefone = '5541900000101';
    --      A 2 veio com uma compra mais ANTIGA, e depois como "não cliente":
    --      continua cliente, com a compra mais recente.
    select c.cliente and c.comprou_em = '2024-03-01T15:00:00Z' and c.canais = array['Indicação']
           and c.importacao_id = v_imp1
      into v_p2
      from public.marketing_contatos c
     where c.org_id = public.org_padrao() and c.telefone = '5541900000102';
    --      A 3 entrou sem nome nem registro, com as datas que vieram. O nome
    --      que chegou depois preencheu o vazio; "sem interesse" não se desfaz.
    select c.nome = 'Aceite Base Três' and c.sem_interesse and not c.cliente
           and c.primeiro_contato_em = '2023-05-05T12:00:00Z'
           and c.ultimo_contato_em = '2023-06-06T12:00:00Z'
      into v_p3
      from public.marketing_contatos c
     where c.org_id = public.org_padrao() and c.telefone = '5541900000103';
    --      A 4 veio duas vezes no mesmo lote: uma pessoa só, com o nome e o
    --      canal da segunda aparição, e as datas tiradas dos registros. Quem a
    --      criou foi a importação 2, mesmo depois de a 1 pendurar um carro nela.
    select count(*) = 1
           and bool_and(c.nome = 'Aceite Base Quatro' and not c.cliente and c.canais = array['Site']
                        and c.primeiro_contato_em = '2026-03-03T12:00:00Z'
                        and c.ultimo_contato_em = '2026-04-04T12:00:00Z'
                        and c.importacao_id = v_imp2)
      into v_p4
      from public.marketing_contatos c
     where c.org_id = public.org_padrao() and c.telefone = '5541900000104';
    select c.cliente and c.comprou_em = '2022-02-02T12:00:00Z' and c.importacao_id = v_imp1
      into v_p6
      from public.marketing_contatos c
     where c.org_id = public.org_padrao() and c.telefone = '5541900000108';
    select (select count(*) from public.marketing_contatos where nome in ('Aceite Fixo', 'Aceite Sem 55'))
         + (select count(*) from public.marketing_interesses where origem_id = 'aceite-fixo')
      into v_invalidos;
    select string_agg(i.contatos_novos || '|' || i.contatos_atualizados || '|' || i.registros_novos, ' e '
                      order by i.arquivo)
      into v_contadores
      from public.marketing_importacoes i
     where i.id in (v_imp1, v_imp2);

    --      Importação que não existe levanta erro; p_contatos que não é lista
    --      também; e um dado inválido no meio (tipo "cliente") recusa o lote
    --      INTEIRO: a pessoa válida que vinha junto não fica.
    set local role service_role;
    begin
      perform 1 from public.marketing_importar_lote(gen_random_uuid(), v_j1);
      v_sem_importacao := 'não levantou erro';
    exception
      when no_data_found then v_sem_importacao := 'erro';
    end;
    begin
      perform 1 from public.marketing_importar_lote(v_imp2, '{"telefone": "5541900000105"}'::jsonb);
      v_nao_e_lista := 'não levantou erro';
    exception
      when invalid_parameter_value then v_nao_e_lista := 'erro';
    end;
    begin
      perform 1 from public.marketing_importar_lote(v_imp2, $ruim$[
        {"telefone": "5541900000105", "nome": "Aceite Lote Ruim", "registros": []},
        {"telefone": "5541900000106", "registros": [{"tipo": "cliente", "marca": "Fiat"}]}
      ]$ruim$::jsonb);
      v_lote_ruim := 'entrou';
    exception
      when check_violation then
        get stacked diagnostics v_lote_ruim = constraint_name;
    end;
    reset role;
    select count(*) into v_lote_ruim_ficou
      from public.marketing_contatos where telefone in ('5541900000105', '5541900000106');

    -- 6k · O resumo. Antes, uma quinta pessoa, gravada direto: NÃO cliente,
    --      com um único registro, de COMPRA e com marca. A função de lote não
    --      produz esse estado; ele existe aqui para provar que compra não
    --      conta como "carro de interesse" nem entra na lista de marcas.
    insert into public.marketing_contatos (telefone, importacao_id)
    values ('5541900000107', v_imp2)
    returning id into v_p5;
    insert into public.marketing_interesses (contato_id, importacao_id, origem_id, tipo, marca, modelo)
    values (v_p5, v_imp2, 'aceite-8', 'compra', 'Honda', 'Civic');

    --      Os seis números são conferidos pela DIFERENÇA para o retrato de
    --      antes da sonda (em produção a base pode já ter gente): +6 pessoas,
    --      +3 clientes com data (1, 2 e 6), +1 sem interesse (3), +1 interessado
    --      com carro (4) e +2 sem (a 3, cujo único interesse não tem marca nem
    --      modelo, e a 5). As duas listas, item a item quando a base estava
    --      vazia; pela forma e pela ordem, senão.
    set local role service_role;
    v_resumo := public.marketing_resumo_da_base();
    reset role;
    select string_agg(((v_resumo->>k)::int - (v_resumo_antes->>k)::int)::text, '|' order by o)
      into v_resumo_deltas
      from unnest(array['pessoas', 'clientes', 'com_data_de_compra', 'sem_interesse',
                        'interessados_com_carro', 'interessados_sem_carro']) with ordinality as u(k, o);
    --      Oito chaves, e nenhuma pessoa: nem telefone, nem nome, nem e-mail.
    select (select count(*) from jsonb_object_keys(v_resumo)) = 8
           and jsonb_typeof(v_resumo->'canais') = 'array'
           and jsonb_typeof(v_resumo->'marcas') = 'array'
           and jsonb_array_length(v_resumo->'canais') between 1 and 30
           and jsonb_array_length(v_resumo->'marcas') between 1 and 15
           and v_resumo::text !~ '55419|Aceite Base|exemplo\.invalido'
      into v_resumo_forma;
    if (v_resumo_antes->>'pessoas')::int = 0 then
      v_resumo_modo := 'item a item (a base estava vazia)';
      v_resumo_listas :=
        v_resumo->'canais' = '[{"canal": "OLX", "pessoas": 2}, {"canal": "Site", "pessoas": 2},
                               {"canal": "Indicação", "pessoas": 1}, {"canal": "Instagram", "pessoas": 1}]'::jsonb
        and v_resumo->'marcas' = '[{"marca": "FIAT", "pessoas": 2}, {"marca": "VOLKSWAGEN", "pessoas": 2}]'::jsonb;
    else
      v_resumo_modo := format('pela forma e pela ordem (a base já tinha %s pessoa(s))', v_resumo_antes->>'pessoas');
      select coalesce(bool_and(x.pessoas >= x.seguinte), true) into v_resumo_listas
        from (select (e.item->>'pessoas')::int as pessoas,
                     lead((e.item->>'pessoas')::int, 1, 0) over (partition by e.lista order by e.o) as seguinte
                from (select 'canais' as lista, c.item, c.o
                        from jsonb_array_elements(v_resumo->'canais') with ordinality as c(item, o)
                      union all
                      select 'marcas', m.item, m.o
                        from jsonb_array_elements(v_resumo->'marcas') with ordinality as m(item, o)) e) x;
    end if;

    -- 6l · Desfazer. A importação 1 criou as pessoas 1, 2, 3 e 6 e gravou
    --      cinco registros: quatro nelas e um na pessoa 4, que é da importação
    --      2. E a 2 pendurou um na pessoa 1 (a compra do Polo), que vai junto
    --      com ela. São 4 contatos e 6 registros. Sobram as pessoas 4 e 5, com os
    --      três registros da importação 2. Desfazer a 2 leva o resto; de novo,
    --      e uma que nunca existiu, devolvem zero.
    set local role service_role;
    select d.contatos_removidos || '|' || d.registros_removidos into v_d1
      from public.marketing_desfazer_importacao(v_imp1) d;
    reset role;
    select (select count(*) from public.marketing_contatos where telefone like '55419000001__')
           || '|' || (select count(*) from public.marketing_interesses where origem_id like 'aceite-%')
           || '|' || (select count(*) from public.marketing_importacoes where id = v_imp1)
      into v_d1_ficou;
    set local role service_role;
    select d.contatos_removidos || '|' || d.registros_removidos into v_d2
      from public.marketing_desfazer_importacao(v_imp2) d;
    select d.contatos_removidos || '|' || d.registros_removidos || ' e '
           || n.contatos_removidos || '|' || n.registros_removidos
      into v_d3
      from public.marketing_desfazer_importacao(v_imp2) d,
           public.marketing_desfazer_importacao(gen_random_uuid()) n;
    reset role;
    select (select count(*) from public.marketing_contatos where telefone like '55419000001__')
         + (select count(*) from public.marketing_interesses where origem_id like 'aceite-%')
         + (select count(*) from public.marketing_importacoes where arquivo like 'aceite-%')
      into v_base_sobrou;

    raise exception 'DESFAZER_ACEITE_SMS' using errcode = 'PSM01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PSM01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'marketing' is null or v_a is null or v_cod1 is null
     or v_ct is null or v_imp1 is null or v_imp2 is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários, as campanhas e as importações — nada foi provado';
  end if;
  if v_sessoes < 48 or cardinality(v_sessoes_erradas) > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: sessões — % caso(s), % fora do esperado: %',
      v_sessoes, cardinality(v_sessoes_erradas), array_to_string(v_sessoes_erradas, ' · ');
  end if;
  if v_regras < 77 or cardinality(v_regras_erradas) > 0 or v_controles <> 18 then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % tentativa(s), % fora da regra certa, % de 18 linhas válidas aceitas: %',
      v_regras, cardinality(v_regras_erradas), v_controles, array_to_string(v_regras_erradas, ' · ');
  end if;
  if v_unicas < 13 or cardinality(v_unicas_erradas) > 0 or not v_mesmo_numero or not v_outra_data then
    falhas := falhas + 1;
    raise warning 'FALHOU: unicidades e chaves — % caso(s), fora do esperado: %; o mesmo número em outra campanha entra: %; o mesmo carro sem id de origem em outra data entra: %',
      v_unicas, array_to_string(v_unicas_erradas, ' · '), v_mesmo_numero, v_outra_data;
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

  -- A base de marketing.
  if v_ct_tinha <> 3 or v_ct_levou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: eliminar o contato — ele tinha % linha(s) penduradas (esperado 3: um envio e dois registros) e sobraram % (esperado 0)',
      v_ct_tinha, v_ct_levou;
  end if;
  if v_l1 <> '3|0|3' or v_sem_data <> 1 or v_l1_de_novo <> '0|3|0' or v_reg_de_novo <> 3
     or not coalesce(v_antes_da_fusao, false) then
    falhas := falhas + 1;
    raise warning 'FALHOU: importar — o 1º lote devolveu "%" (esperado "3|0|3": novos|atualizados|registros), com % registro(s) sem id de origem e sem data (esperado 1); o mesmo lote de novo, "%" (esperado "0|3|0"), e a importação ficou com % registro(s) (esperado 3); a pessoa 1 como veio: %',
      v_l1, v_sem_data, v_l1_de_novo, v_reg_de_novo, v_antes_da_fusao;
  end if;
  if v_l2 <> '1|2|3' or v_l3 <> '1|4|2' or not coalesce(v_apos_o_2, false) or not coalesce(v_fusao, false)
     or not coalesce(v_p2, false) or not coalesce(v_p3, false) or not coalesce(v_p4, false)
     or not coalesce(v_p6, false) or v_contadores <> '4|7|5 e 1|2|3' then
    falhas := falhas + 1;
    raise warning 'FALHOU: fusão — o 2º arquivo devolveu "%" (esperado "1|2|3") e o 3º lote "%" (esperado "1|4|2"); depois do 2º, a pessoa 1 era cliente só pelo registro de compra, com o último contato novo: %; ao fim, ela uniu canais, ganhou a data da compra e manteve nome, e-mail e importação de origem: %; a 2 continuou cliente, com a compra mais recente: %; a 3 ganhou o nome que faltava e continuou sem interesse: %; a 4, repetida no lote, virou uma, e é da importação 2: %; a 6 virou cliente só pela data da compra: %; contadores das importações "%" (esperado "4|7|5 e 1|2|3")',
      v_l2, v_l3, v_apos_o_2, v_fusao, v_p2, v_p3, v_p4, v_p6, v_contadores;
  end if;
  if v_invalidos <> 0 or v_sem_importacao <> 'erro' or v_nao_e_lista <> 'erro'
     or v_lote_ruim <> 'marketing_interesses_tipo_valido' or v_lote_ruim_ficou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: importar o que não presta — telefone inválido deixou % linha(s) (esperado 0); importação inexistente: % (esperado erro); p_contatos que não é lista: % (esperado erro); lote com tipo inválido: % (esperado recusa por marketing_interesses_tipo_valido), e dele ficaram % contato(s) (esperado 0)',
      v_invalidos, v_sem_importacao, v_nao_e_lista, v_lote_ruim, v_lote_ruim_ficou;
  end if;
  if v_resumo_deltas <> '6|3|3|1|1|2' or not coalesce(v_resumo_forma, false) or not coalesce(v_resumo_listas, false) then
    falhas := falhas + 1;
    raise warning 'FALHOU: resumo — diferenças "%" (esperado "6|3|3|1|1|2": pessoas, clientes, com data de compra, sem interesse, interessados com carro, sem carro); oito chaves, listas dentro do teto e nenhuma pessoa: %; listas conferidas %: %; devolveu %',
      v_resumo_deltas, v_resumo_forma, v_resumo_modo, v_resumo_listas, v_resumo;
  end if;
  if v_d1 <> '4|6' or v_d1_ficou <> '2|3|0' or v_d2 <> '2|3' or v_d3 <> '0|0 e 0|0' or v_base_sobrou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: desfazer — a importação 1 devolveu "%" (esperado "4|6": contatos|registros) e ficaram "%" (esperado "2|3|0": contatos, registros, a própria importação); a 2 devolveu "%" (esperado "2|3"); de novo e uma inexistente, "%" (esperado "0|0 e 0|0"); sobraram % linha(s) da sonda (esperado 0)',
      v_d1, v_d1_ficou, v_d2, v_d3, v_base_sobrou;
  end if;

  -- Nada da prova ficou.
  select array[(select count(*) from public.sms_campanhas),
               (select count(*) from public.sms_envios),
               (select count(*) from public.sms_descadastros),
               (select count(*) from public.leads where nome = 'Aceite SMS Lead'),
               (select count(*) from public.marketing_importacoes),
               (select count(*) from public.marketing_contatos),
               (select count(*) from public.marketing_interesses)]
    into v_depois;
  select count(*) into v_restou from auth.users where email like 'aceite-sms-%@exemplo.invalido';
  if v_depois is distinct from v_antes or v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (campanhas, envios, saídas, leads de sonda, importações, contatos, registros: % → %; % usuário(s))',
      v_antes, v_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) nas campanhas de SMS', falhas;
  end if;

  raise notice
    'Aceite verificado: sms_campanhas, sms_envios, sms_descadastros, '
    'marketing_importacoes, marketing_contatos e marketing_interesses existem '
    'com as regras nomeadas e RLS; anon não lê nenhuma das seis; Marketing e '
    'Administrador leem sms_campanhas (só as da org) e levam 42501 em sms_envios, '
    'em sms_descadastros e nas três marketing_*; comercial, marketing desativado '
    'e cliente não veem campanha; o painel não inclui, não edita e não apaga '
    '(42501) e não executa as seis funções (% casos de sessão). Critério fora '
    'da lista, critério de carro sem carro, carro pela metade, {carro} ou '
    '{preco} em campanha sem carro, descanso 3, tempo desde a compra de 6 meses '
    '(sms_campanhas_compra_valida), tempo desde a compra de 24 meses com '
    'critério mesmo_modelo ou interessados (sms_campanhas_compra_so_de_cliente), '
    'situação, janela, código fora '
    'do alfabeto, telefone fixo ou sem 55, destino sem barra ou com domínio, '
    'mensagem sem {link}, nome vazio, partes 0 e 4, custo e cliques negativos, '
    'resposta longa, origem de importação, contador negativo, data de compra '
    'sem cliente, tipo de registro e placa torta caem na regra certa (% '
    'tentativas), e campanha por perfil sem carro entra, como entram 12, 18, 24 '
    'e 36 meses desde a compra com critério clientes ou todos e os destinos '
    '/estoque e /avaliacao; o mesmo número não '
    'entra duas vezes na mesma campanha, e entra em outra; a mesma pessoa e a '
    'mesma linha de origem não entram duas vezes na base. sms_reservar_envios '
    'devolve no máximo o limite (piso 1, teto 200), nada em rascunho nem '
    'interrompida, e a chamada seguinte não repete linha; sms_registrar_clique '
    'soma, mantém o primeiro clicou_em e devolve vazio para código '
    'desconhecido; sms_devolver_presos marca falhou só o preso sem fornecedor e '
    'não devolve nada à fila. marketing_importar_lote cria três pessoas de um '
    'lote de oito elementos (os cinco sem celular válido ficam de fora), não '
    'cria nada ao receber o mesmo lote de novo, funde o segundo arquivo (cliente '
    'vira verdadeiro, canais se unem, fica a compra mais recente, o nome antigo '
    'permanece, o último contato sobe) e não desfaz o que já sabia quando o '
    'terceiro lote diz menos (cliente e sem_interesse ficam; o nome só preenche '
    'vazio), funde o celular repetido dentro do lote, levanta erro para '
    'importação inexistente e recusa inteiro o lote com dado inválido; '
    'marketing_resumo_da_base devolve os seis números certos e nenhuma pessoa, '
    'sem contar compra como carro de interesse (listas conferidas %); '
    'marketing_desfazer_importacao remove o que a importação criou e gravou, com '
    'os registros que outra pendurou nos contatos dela, e devolve as contagens. Apagar a campanha leva os envios e deixa a '
    'saída; eliminar o lead ou o contato da base leva o envio dele; a prova não '
    'deixou rastro.',
    v_sessoes, v_regras, v_resumo_modo;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261007120000', 'sms_campanhas')
  on conflict (version) do nothing;
