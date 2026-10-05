-- ============================================================================
-- Os veículos de interesse do lead — vários por lead, cada um com desfecho
-- ============================================================================
-- Pedido do dono (2026-10-05): hoje o lead tem UM veículo de interesse
-- (`leads.veiculo_id`). Ele quer que o lead possa considerar VÁRIOS carros;
-- que, ao fim do atendimento, cada opção seja resolvida — uma pode ser a
-- escolhida, as outras são descartadas COM MOTIVO —; e um relatório por
-- veículo feito desse retorno real (quantos leads consideraram, quantos
-- descartaram e por quê), para mostrar ao dono do carro consignado e para
-- decidir a estratégia comercial dos carros próprios.
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.leads_veiculos` — uma linha por (lead, veículo): "este lead
--    considerou este carro". `situacao` em_avaliacao | escolhido | descartado;
--    `motivo_descarte` numa lista fechada; `nota` livre.
-- 2. `leads_veiculos_carimbar()` — gatilho da PRÓPRIA tabela nova: carimba
--    autoria, retrato do carro e resolução. Não escreve em `leads`.
-- 3. RLS: a linha é visível e gravável exatamente quando o LEAD dela é visível
--    a quem pergunta. Apagar é só do admin.
-- 4. Duas funções de relatório, SÓ AGREGADOS:
--      resumo_de_interesse_do_veiculo(bigint) .. um carro, com motivos e notas
--      interesse_por_veiculo() ................. todos, para a tela de ranking
-- 5. A carga inicial: uma linha por lead que já tem `veiculo_id`.
--
-- ---------------------------------------------------------------------------
-- A chave do veículo: `veiculo_id bigint`, SEM FK — e por quê
-- ---------------------------------------------------------------------------
-- `leads.veiculo_id` é `bigint` e NÃO tem FK (20260807210000: "Sem FK: o carro
-- sai do feed e o lead precisa sobreviver a isso"). Ele guarda
-- `estoque_motors.id`, a chave primária do estoque (`bigint`, o código do
-- anúncio no RevendaMais; os nativos do painel vêm de
-- `estoque_motors_nativo_seq`). A tabela nova usa a mesma chave, do mesmo
-- tipo, do mesmo jeito — referência fraca mais retrato:
--
--   · `estoque_motors` fica INTOCADA até a F2 (CLAUDE.md). Uma FK penduraria
--     gatilhos de integridade NELA, e todo DELETE do sync passaria a escrever
--     aqui. Nenhuma tabela do projeto tem FK para o estoque (investidores,
--     financeiro, vendidos, perfil do lead: todas "sem FK, de propósito").
--   · `on delete set null` apagaria justamente a chave do relatório: no dia
--     em que o carro saísse do feed, o histórico dele deixaria de ser "dele".
--     O dono do consignado pergunta pelo carro DEPOIS que ele saiu da vitrine.
--   · O que substitui a FK: o gatilho recusa, para quem tem sessão, carro que
--     não existe no estoque NA HORA de adicionar; e a linha guarda o retrato
--     (`veiculo_rotulo`, `veiculo_preco`) para continuar legível depois.
--
-- Por isso `veiculo_id` é NOT NULL e a unicidade é simples: (lead, veículo).
--
-- Fora daqui: `leads.repasse_id` (carro de repasse, uuid, outra tabela).
-- Veículo de interesse, nesta entrega, é carro do estoque da loja.
--
-- ---------------------------------------------------------------------------
-- Os motivos de descarte (a chave fica no banco; o rótulo, no painel)
-- ---------------------------------------------------------------------------
--   preco ........... Preço acima do que queria
--   parcela ......... Parcela ou financiamento não fechou
--   km .............. Quilometragem
--   ano_versao ...... Ano ou versão
--   cor ............. Cor
--   estado .......... Estado de conservação
--   opcionais ....... Faltou opcional
--   troca ........... Avaliação da troca não fechou
--   outro_da_loja ... Preferiu outro carro da loja
--   comprou_fora .... Comprou em outro lugar
--   desistiu ........ Desistiu da compra
--   vendido ......... O carro foi vendido antes
--   outro ........... Outro (aí a `nota` é obrigatória)
--
-- ---------------------------------------------------------------------------
-- As regras, e quem as segura
-- ---------------------------------------------------------------------------
--   leads_veiculos_situacao_valida ........ os três estados
--   leads_veiculos_motivo_valido .......... a lista acima
--   leads_veiculos_motivo_so_no_descarte .. motivo existe SE E SÓ SE descartado
--   leads_veiculos_outro_pede_nota ........ motivo `outro` exige nota
--   leads_veiculos_resolucao_carimbada .... `resolvido_em` existe se e só se a
--                                           opção saiu de em_avaliacao
--   leads_veiculos_lead_veiculo_unico ..... o mesmo carro uma vez por lead
--   leads_veiculos_um_escolhido_por_lead .. índice único parcial
--   leads_veiculos_rotulo_preenchido, _preco_valido, _nota_cabe
--   leads_veiculos_par_imutavel ........... (gatilho) a linha não troca de
--                                           lead nem de carro: é outro fato
--   leads_veiculos_veiculo_no_estoque ..... (gatilho) com sessão, só entra
--                                           carro que existe
--
-- O gatilho, em uma frase: CARIMBO NÃO É DE QUEM CHAMA. Com sessão (o painel,
-- pelo PostgREST), `adicionado_por`/`criado_em` são gravados na inclusão e não
-- mudam mais; `veiculo_preco` é o do estoque na hora; `resolvido_por`/
-- `resolvido_em` são gravados quando a `situacao` sai de em_avaliacao e
-- apagados quando volta. Sem sessão (chave de serviço, esta migração) os
-- valores informados são aceitos — é como a carga inicial data as linhas pelo
-- lead. Autoria é NOME (`autor_atual()`), como em `leads_interacoes.autor` e
-- `leads.responsavel`: quem sai da loja continua legível no histórico.
--
-- ---------------------------------------------------------------------------
-- `leads.veiculo_id` continua sendo o veículo PRINCIPAL
-- ---------------------------------------------------------------------------
-- O card do kanban, a contagem de leads por veículo e a ficha do lead leem a
-- coluna. Ela NÃO muda aqui e nenhum gatilho a reescreve: o painel a mantém
-- em dia de propósito (o primeiro carro adicionado, ou o escolhido). Um
-- gatilho que a reescrevesse calado disputaria a coluna com o PATCH de
-- `/api/leads/gerenciar` e com `trg_leads_antes_de_atualizar`.
--
-- ---------------------------------------------------------------------------
-- A carga inicial
-- ---------------------------------------------------------------------------
-- Uma linha por lead com `veiculo_id` preenchido, datada pelo lead
-- (`criado_em` = `leads.created_at`), sem autor:
--
--   lead com desfecho `ganho` ........ `escolhido`, resolvido em `desfecho_em`.
--     ⚠️ É a melhor informação que existe, não uma certeza: `veiculo_id` é o
--     carro em que o lead NASCEU, e quem comprou outro carro da loja aparece
--     aqui como tendo escolhido o primeiro.
--   lead aberto ...................... `em_avaliacao`.
--   lead `perdido` ou `descartado` ... `em_avaliacao` também. O motivo de
--     perda do LEAD não é o motivo de descarte do CARRO, e inventar um
--     estragaria justamente o relatório. O resumo conta essas linhas à parte,
--     em `sem_resolucao` (opção em avaliação de um lead já encerrado).
--
-- Retrato: o rótulo vem do estoque de hoje; se o carro já não existe, do
-- `interesse` do lead; em último caso, "Veículo nº N". O preço é o do estoque
-- NO DIA DA CARGA (não o do dia do lead — esse não foi guardado), e fica nulo
-- se o carro já saiu.
--
-- Só roda com a tabela VAZIA: reaplicar a migração não ressuscita linha que o
-- admin apagou.
--
-- ---------------------------------------------------------------------------
-- A RLS, antes e depois da 20261003130000
-- ---------------------------------------------------------------------------
-- As policies perguntam `exists (select 1 from public.leads …)` na pele de
-- quem chama: quem decide é a RLS de `leads`, a que estiver de pé. Hoje, em
-- produção, é `is_staff` (toda a equipe); com a 20261003130000 aplicada, passa
-- a ser o escopo (admin todos, gestor/sdr os designados, comercial os dele),
-- sem tocar neste arquivo. O aceite roda nos dois mundos e diz em qual rodou.
--
-- Os relatórios são da LOJA INTEIRA de propósito (decisão do dono: o retrato
-- completo do carro, atenda quem atender): SECURITY DEFINER com guarda de
-- equipe ativa, e devolvem contagens, motivos e notas — nunca nome, telefone,
-- lead ou autor. ⚠️ A nota é texto livre: o que o vendedor escrever nela sai
-- no resumo. A chave de serviço não passa pela guarda (sem sessão não há
-- equipe): a rota chama com a sessão de quem abriu a tela.
--
-- ⚠️ DESFAZER (nada mais depende destes objetos):
--
--   begin;
--   drop function if exists public.interesse_por_veiculo();
--   drop function if exists public.resumo_de_interesse_do_veiculo(bigint);
--   drop table    if exists public.leads_veiculos;
--   drop function if exists public.leads_veiculos_carimbar();
--   drop function if exists public.rotulo_de_veiculo(text, text, text, integer);
--   delete from supabase_migrations.schema_migrations where version = '20261005120000';
--   commit;
--
-- Aditiva (nenhuma coluna, policy ou gatilho em tabela existente; `leads` e
-- `estoque_motors` só são LIDAS) e idempotente: `create table if not exists`,
-- `create or replace`, `drop … if exists` + `create` para gatilho e policies,
-- carga só com a tabela vazia. Reaplicar é no-op.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
declare
  v_tipo      text;
  v_faltam    text;
  v_estranhas text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_tipo
    from pg_attribute a
   where a.attrelid = to_regclass('public.leads')
     and a.attname = 'veiculo_id' and not a.attisdropped;
  if v_tipo is distinct from 'bigint' then
    raise exception
      'DIVERGÊNCIA: public.leads.veiculo_id é "%" — esperado bigint, a chave de '
      'estoque_motors que a tabela nova repete. Nada foi aplicado.',
      coalesce(v_tipo, '<ausente>');
  end if;

  select string_agg(c, ', ') into v_faltam
    from unnest(array['id', 'marca', 'modelo', 'versao', 'ano', 'preco', 'vendido']) as c
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = to_regclass('public.estoque_motors')
                        and a.attname = c and not a.attisdropped);
  if v_faltam is not null then
    raise exception
      'DIVERGÊNCIA: public.estoque_motors não tem (%) — o retrato do carro e o '
      'ranking leem essas colunas. Nada foi aplicado.', v_faltam;
  end if;

  select string_agg(c, ', ') into v_faltam
    from unnest(array['desfecho', 'desfecho_em', 'interesse', 'created_at', 'atualizado_em']) as c
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = to_regclass('public.leads')
                        and a.attname = c and not a.attisdropped);
  if v_faltam is not null then
    raise exception
      'DIVERGÊNCIA: public.leads não tem (%) — a carga inicial e o resumo leem '
      'essas colunas (20260828120000). Nada foi aplicado.', v_faltam;
  end if;

  if to_regprocedure('public.is_staff(uuid)') is null
     or to_regprocedure('public.is_admin(uuid)') is null
     or to_regprocedure('public.autor_atual()') is null
     or to_regprocedure('public.org_padrao()') is null then
    raise exception
      'DEPENDÊNCIA: falta is_staff(uuid), is_admin(uuid), autor_atual() ou '
      'org_padrao(). Nada foi aplicado.';
  end if;
  if public.org_padrao() is null then
    raise exception
      'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;

  -- Sem policy de leitura em `leads`, o `exists` das policies daqui negaria
  -- tudo a todo mundo, em silêncio.
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'leads' and cmd = 'SELECT') then
    raise exception
      'DIVERGÊNCIA: public.leads não tem policy de leitura — a RLS de '
      'leads_veiculos se apoia nela. Nada foi aplicado.';
  end if;

  -- Reaplicação: a tabela, se já existe, tem de ser a daqui (senão o
  -- `create table if not exists` a pularia calado), e só com as policies
  -- daqui (uma permissiva a mais abriria a tabela por OU).
  if to_regclass('public.leads_veiculos') is not null then
    select string_agg(a.attname, ',' order by a.attname) into v_tipo
      from pg_attribute a
     where a.attrelid = 'public.leads_veiculos'::regclass
       and a.attnum > 0 and not a.attisdropped;
    if v_tipo is distinct from
       'adicionado_por,criado_em,id,lead_id,motivo_descarte,nota,org_id,resolvido_em,resolvido_por,situacao,veiculo_id,veiculo_preco,veiculo_rotulo' then
      raise exception
        'DIVERGÊNCIA: public.leads_veiculos já existe com outras colunas (%). '
        'Nada foi aplicado.', v_tipo;
    end if;

    select string_agg(policyname, ', ') into v_estranhas
      from pg_policies
     where schemaname = 'public' and tablename = 'leads_veiculos'
       and policyname not in ('leads_veiculos_leitura_pelo_lead', 'leads_veiculos_inclusao_pelo_lead',
                              'leads_veiculos_atualizacao_pelo_lead', 'leads_veiculos_exclusao_admin');
    if v_estranhas is not null then
      raise exception
        'DIVERGÊNCIA: public.leads_veiculos tem policy que o repositório não '
        'conhece (%). Nada foi aplicado.', v_estranhas;
    end if;
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. O rótulo do carro — "marca modelo versão ano", sem repetir
-- ----------------------------------------------------------------------------
-- A mesma regra de `nomeDoVeiculo` (src/lib/nomeDoVeiculo.ts): a versão só
-- entra se o modelo já não a traz embutida, e o ano só se já não está no nome
-- como palavra. A caixa é a do estoque (o sync grava em minúsculas; quem
-- capitaliza é o painel, na exibição).
create or replace function public.rotulo_de_veiculo(
  p_marca  text,
  p_modelo text,
  p_versao text,
  p_ano    integer
)
  returns text
  language sql
  immutable
  set search_path = ''
as $fn$
  select nullif(btrim(concat_ws(' ',
           nullif(btrim(p_marca), ''),
           nullif(btrim(p_modelo), ''),
           case when nullif(btrim(p_versao), '') is not null
                 and position(lower(btrim(p_versao))
                              in lower(concat_ws(' ', btrim(p_marca), btrim(p_modelo)))) = 0
                then btrim(p_versao) end,
           case when p_ano is not null
                 and not (p_ano::text = any (regexp_split_to_array(
                            btrim(concat_ws(' ', p_marca, p_modelo, p_versao)), '\s+')))
                then p_ano::text end
         )), '');
$fn$;

comment on function public.rotulo_de_veiculo(text, text, text, integer) is
  'O nome de um carro para guardar como retrato: marca, modelo, versão (se o '
  'modelo já não a embute) e ano (se já não está no nome). NULL quando não '
  'sobra nada. Espelha nomeDoVeiculo de src/lib/nomeDoVeiculo.ts; a caixa é a '
  'do estoque.';


-- ----------------------------------------------------------------------------
-- 2. A tabela
-- ----------------------------------------------------------------------------
create table if not exists public.leads_veiculos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default public.org_padrao(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  -- `estoque_motors.id`, sem FK (ver o cabeçalho).
  veiculo_id      bigint not null,
  veiculo_rotulo  text not null,
  veiculo_preco   numeric(12,2),
  situacao        text not null default 'em_avaliacao',
  motivo_descarte text,
  nota            text,
  adicionado_por  text,
  resolvido_por   text,
  criado_em       timestamptz not null default now(),
  resolvido_em    timestamptz,

  constraint leads_veiculos_lead_veiculo_unico unique (lead_id, veiculo_id),
  constraint leads_veiculos_situacao_valida
    check (situacao in ('em_avaliacao', 'escolhido', 'descartado')),
  constraint leads_veiculos_motivo_valido
    check (motivo_descarte is null
           or motivo_descarte in ('preco', 'parcela', 'km', 'ano_versao', 'cor', 'estado',
                                  'opcionais', 'troca', 'outro_da_loja', 'comprou_fora',
                                  'desistiu', 'vendido', 'outro')),
  -- Descartar pede motivo; e motivo só existe em descarte.
  constraint leads_veiculos_motivo_so_no_descarte
    check ((situacao = 'descartado') = (motivo_descarte is not null)),
  constraint leads_veiculos_outro_pede_nota
    check (motivo_descarte is distinct from 'outro' or nullif(btrim(nota), '') is not null),
  constraint leads_veiculos_resolucao_carimbada
    check ((situacao = 'em_avaliacao') = (resolvido_em is null)
           and (situacao <> 'em_avaliacao' or resolvido_por is null)),
  constraint leads_veiculos_rotulo_preenchido
    check (btrim(veiculo_rotulo) <> '' and char_length(veiculo_rotulo) <= 200),
  constraint leads_veiculos_preco_valido
    check (veiculo_preco is null or veiculo_preco >= 0),
  constraint leads_veiculos_nota_cabe
    check (nota is null or char_length(nota) <= 2000)
);

-- Uma opção escolhida por lead, no máximo.
create unique index if not exists leads_veiculos_um_escolhido_por_lead
  on public.leads_veiculos (lead_id)
  where situacao = 'escolhido';

-- O relatório lê por carro. Por lead, serve o índice da unicidade.
create index if not exists leads_veiculos_veiculo_idx
  on public.leads_veiculos (veiculo_id, situacao);

comment on table public.leads_veiculos is
  'Os veículos de interesse do lead (2026-10-05): uma linha por (lead, carro '
  'do estoque). Cada opção termina escolhida ou descartada com motivo — a '
  'fonte do relatório por veículo. leads.veiculo_id segue sendo o veículo '
  'PRINCIPAL e é mantido pelo painel, não por gatilho. RLS: a linha acompanha '
  'a visibilidade do lead. Ver 20261005120000_veiculos_de_interesse.sql.';
comment on column public.leads_veiculos.veiculo_id is
  'estoque_motors.id (bigint, o código do anúncio), SEM FK: o carro sai do '
  'feed e o histórico dele precisa continuar sendo dele. Com sessão, o gatilho '
  'só aceita carro que existe no estoque na hora de adicionar.';
comment on column public.leads_veiculos.veiculo_rotulo is
  'Retrato do nome do carro quando foi adicionado ("fiat uno mille fire '
  'economy 2013", na caixa do estoque). Vazio na inclusão, o gatilho preenche '
  'com rotulo_de_veiculo(). É o que resta legível quando o carro sai do estoque.';
comment on column public.leads_veiculos.veiculo_preco is
  'Preço do carro (estoque_motors.preco) quando foi adicionado; com sessão, é '
  'sempre o do estoque. Nas linhas da carga inicial (sem adicionado_por) é o '
  'preço do dia da carga, 2026-10, e nulo se o carro já tinha saído.';
comment on column public.leads_veiculos.situacao is
  'em_avaliacao (o lead ainda considera), escolhido (no máximo um por lead) ou '
  'descartado (exige motivo_descarte).';
comment on column public.leads_veiculos.motivo_descarte is
  'Por que o lead descartou ESTE carro. Chaves: preco (Preço acima do que '
  'queria), parcela (Parcela ou financiamento não fechou), km (Quilometragem), '
  'ano_versao (Ano ou versão), cor (Cor), estado (Estado de conservação), '
  'opcionais (Faltou opcional), troca (Avaliação da troca não fechou), '
  'outro_da_loja (Preferiu outro carro da loja), comprou_fora (Comprou em '
  'outro lugar), desistiu (Desistiu da compra), vendido (O carro foi vendido '
  'antes), outro (Outro — exige nota). Os rótulos moram no painel.';
comment on column public.leads_veiculos.nota is
  'Comentário livre sobre a opção. Obrigatório com motivo `outro`. ⚠️ A nota '
  'de um descarte SAI no resumo do veículo, sem autor e sem lead: não escrever '
  'nome nem telefone de cliente aqui.';
comment on column public.leads_veiculos.adicionado_por is
  'Nome de quem adicionou (autor_atual()), carimbado pelo gatilho. NULL = '
  'carga inicial ou sistema.';
comment on column public.leads_veiculos.resolvido_por is
  'Nome de quem marcou escolhido ou descartado, carimbado pelo gatilho. NULL '
  'enquanto em_avaliacao, e nas linhas resolvidas pela carga inicial.';
comment on column public.leads_veiculos.resolvido_em is
  'Quando a opção saiu de em_avaliacao. Volta a NULL se for reaberta.';
comment on column public.leads_veiculos.org_id is
  'A org do registro. Default org_padrao(); as policies e os relatórios filtram por ela.';


-- ----------------------------------------------------------------------------
-- 3. O gatilho — carimbo não é de quem chama
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER para ler o estoque e o nome do autor sem depender dos
-- grants de coluna de quem grava. Só lê `estoque_motors`; só escreve em NEW.
create or replace function public.leads_veiculos_carimbar()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $fn$
declare
  v_sessao boolean := auth.uid() is not null;
  v_autor  text;
  v_carro  record;
begin
  if v_sessao then
    v_autor := public.autor_atual();
  end if;

  if tg_op = 'INSERT' then
    select e.marca, e.modelo, e.versao, e.ano, e.preco
      into v_carro
      from public.estoque_motors e
     where e.id = new.veiculo_id;

    if found then
      if nullif(btrim(new.veiculo_rotulo), '') is null then
        new.veiculo_rotulo := coalesce(
          public.rotulo_de_veiculo(v_carro.marca, v_carro.modelo, v_carro.versao, v_carro.ano),
          'Veículo nº ' || new.veiculo_id);
      end if;
      if v_sessao or new.veiculo_preco is null then
        new.veiculo_preco := v_carro.preco;
      end if;
    elsif v_sessao then
      raise exception
        'O veículo % não está no estoque: só entra como opção do lead um carro que existe.',
        new.veiculo_id
        using errcode = 'foreign_key_violation',
              constraint = 'leads_veiculos_veiculo_no_estoque';
    end if;

    if v_sessao then
      new.criado_em      := now();
      new.adicionado_por := v_autor;
      if new.situacao = 'em_avaliacao' then
        new.resolvido_em  := null;
        new.resolvido_por := null;
      else
        new.resolvido_em  := now();
        new.resolvido_por := v_autor;
      end if;
    elsif new.situacao is distinct from 'em_avaliacao' then
      new.resolvido_em := coalesce(new.resolvido_em, now());
    end if;

    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if new.lead_id is distinct from old.lead_id
     or new.veiculo_id is distinct from old.veiculo_id then
    raise exception
      'A opção não troca de lead nem de carro: adicione o outro carro e descarte este.'
      using errcode = 'check_violation',
            constraint = 'leads_veiculos_par_imutavel';
  end if;

  if v_sessao then
    new.org_id         := old.org_id;
    new.criado_em      := old.criado_em;
    new.adicionado_por := old.adicionado_por;
    new.veiculo_rotulo := old.veiculo_rotulo;
    new.veiculo_preco  := old.veiculo_preco;
  end if;

  if new.situacao is distinct from old.situacao then
    if new.situacao = 'em_avaliacao' then
      new.resolvido_em  := null;
      new.resolvido_por := null;
    elsif v_sessao then
      new.resolvido_em  := now();
      new.resolvido_por := v_autor;
    else
      -- Sem sessão: vale o que foi informado; sem nada informado, agora.
      if new.resolvido_em is not distinct from old.resolvido_em then
        new.resolvido_em := now();
      end if;
      if new.resolvido_por is not distinct from old.resolvido_por then
        new.resolvido_por := null;
      end if;
    end if;
  elsif v_sessao then
    new.resolvido_em  := old.resolvido_em;
    new.resolvido_por := old.resolvido_por;
  end if;

  return new;
end;
$fn$;

comment on function public.leads_veiculos_carimbar() is
  'Gatilho de leads_veiculos: com sessão, carimba adicionado_por/criado_em na '
  'inclusão (e os congela), copia rótulo e preço do estoque, recusa carro que '
  'não existe e carimba resolvido_por/resolvido_em quando a situação muda. '
  'Sem sessão aceita o informado. A linha nunca troca de lead nem de carro. '
  'Não escreve em leads nem em estoque_motors.';

drop trigger if exists trg_leads_veiculos_carimbar on public.leads_veiculos;
create trigger trg_leads_veiculos_carimbar
  before insert or update on public.leads_veiculos
  for each row execute function public.leads_veiculos_carimbar();


-- ----------------------------------------------------------------------------
-- 4. Privilégios e RLS
-- ----------------------------------------------------------------------------
-- No Supabase, tabela nova em `public` nasce com tudo para anon e
-- authenticated pelos default privileges: tira-se tudo e devolve-se o que é.
revoke all on public.leads_veiculos from public, anon, authenticated;
grant select, insert, update, delete on public.leads_veiculos to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.leads_veiculos to service_role;

alter table public.leads_veiculos enable row level security;

drop policy if exists leads_veiculos_leitura_pelo_lead     on public.leads_veiculos;
drop policy if exists leads_veiculos_inclusao_pelo_lead    on public.leads_veiculos;
drop policy if exists leads_veiculos_atualizacao_pelo_lead on public.leads_veiculos;
drop policy if exists leads_veiculos_exclusao_admin        on public.leads_veiculos;

-- O `exists` roda na pele de quem chama: a RLS de `leads` responde.
create policy leads_veiculos_leitura_pelo_lead on public.leads_veiculos
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
  );

create policy leads_veiculos_inclusao_pelo_lead on public.leads_veiculos
  for insert to authenticated
  with check (
    org_id = public.org_padrao()
    and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
  );

create policy leads_veiculos_atualizacao_pelo_lead on public.leads_veiculos
  for update to authenticated
  using (
    org_id = public.org_padrao()
    and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
  )
  with check (
    org_id = public.org_padrao()
    and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
  );

create policy leads_veiculos_exclusao_admin on public.leads_veiculos
  for delete to authenticated
  using (
    public.is_admin(auth.uid())
    and org_id = public.org_padrao()
    and exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)
  );

comment on policy leads_veiculos_leitura_pelo_lead on public.leads_veiculos is
  'Lê a opção quem lê o lead dela: a RLS de leads decide (is_staff até a '
  '20261003130000; o escopo depois).';
comment on policy leads_veiculos_inclusao_pelo_lead on public.leads_veiculos is
  'Adiciona carro ao lead quem enxerga o lead.';
comment on policy leads_veiculos_atualizacao_pelo_lead on public.leads_veiculos is
  'Resolve a opção (escolhe, descarta, reabre, anota) quem enxerga o lead.';
comment on policy leads_veiculos_exclusao_admin on public.leads_veiculos is
  'Apagar a opção é só do admin: descartar é o gesto de todo dia, e deixa motivo.';


-- ----------------------------------------------------------------------------
-- 5. Os relatórios — só agregados
-- ----------------------------------------------------------------------------
create or replace function public.resumo_de_interesse_do_veiculo(p_veiculo bigint)
  returns table (
    veiculo_id            bigint,
    total                 integer,
    em_avaliacao          integer,
    sem_resolucao         integer,
    escolhido             integer,
    descartado            integer,
    motivos               jsonb,
    notas                 jsonb,
    primeiro_interesse_em timestamptz,
    ultimo_interesse_em   timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'O resumo de interesse por veículo é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with linhas as (
    select v.situacao, v.motivo_descarte, v.nota, v.criado_em, v.resolvido_em,
           (l.desfecho is not null) as lead_encerrado
      from public.leads_veiculos v
      join public.leads l on l.id = v.lead_id
     where v.veiculo_id = p_veiculo
       and v.org_id = public.org_padrao()
  )
  select p_veiculo,
         count(*)::integer,
         (count(*) filter (where x.situacao = 'em_avaliacao'))::integer,
         (count(*) filter (where x.situacao = 'em_avaliacao' and x.lead_encerrado))::integer,
         (count(*) filter (where x.situacao = 'escolhido'))::integer,
         (count(*) filter (where x.situacao = 'descartado'))::integer,
         coalesce((
           select jsonb_agg(jsonb_build_object('motivo', m.motivo_descarte, 'total', m.n)
                            order by m.n desc, m.motivo_descarte)
             from (select y.motivo_descarte, count(*)::integer as n
                     from linhas y
                    where y.situacao = 'descartado'
                    group by y.motivo_descarte) m
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object('motivo', n.motivo_descarte,
                                               'nota', btrim(n.nota),
                                               'em', n.resolvido_em)
                            order by n.resolvido_em desc, n.motivo_descarte, n.nota)
             from (select y.motivo_descarte, y.nota, y.resolvido_em
                     from linhas y
                    where y.situacao = 'descartado'
                      and nullif(btrim(y.nota), '') is not null
                    order by y.resolvido_em desc
                    limit 200) n
         ), '[]'::jsonb),
         min(x.criado_em),
         max(x.criado_em)
    from linhas x;
end;
$fn$;

comment on function public.resumo_de_interesse_do_veiculo(bigint) is
  'O retorno real dos leads sobre UM carro (estoque_motors.id), da loja '
  'inteira: quantos consideraram (total), quantos seguem em avaliação '
  '(em_avaliacao; sem_resolucao é a parte cujo lead já foi encerrado sem '
  'resolver a opção), escolhido, descartado, motivos ([{motivo,total}], do '
  'mais citado ao menos) e notas dos descartes ([{motivo,nota,em}], as 200 '
  'mais recentes). Sempre uma linha; zeros se ninguém considerou. Só '
  'agregados: sem nome, telefone, lead nem autor. Restrito à equipe ativa.';

create or replace function public.interesse_por_veiculo()
  returns table (
    veiculo_id          bigint,
    veiculo_rotulo      text,
    no_estoque          boolean,
    vendido             boolean,
    preco_atual         numeric,
    total               integer,
    em_avaliacao        integer,
    sem_resolucao       integer,
    escolhido           integer,
    descartado          integer,
    motivo_principal    text,
    motivos             jsonb,
    ultimo_interesse_em timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'O interesse por veículo é restrito à equipe.'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with linhas as (
    select v.veiculo_id as carro, v.veiculo_rotulo as rotulo, v.situacao,
           v.motivo_descarte, v.criado_em,
           (l.desfecho is not null) as lead_encerrado
      from public.leads_veiculos v
      join public.leads l on l.id = v.lead_id
     where v.org_id = public.org_padrao()
  ),
  por_carro as (
    select x.carro,
           count(*)::integer                                                    as n_total,
           (count(*) filter (where x.situacao = 'em_avaliacao'))::integer       as n_aval,
           (count(*) filter (where x.situacao = 'em_avaliacao'
                               and x.lead_encerrado))::integer                  as n_sem,
           (count(*) filter (where x.situacao = 'escolhido'))::integer          as n_esc,
           (count(*) filter (where x.situacao = 'descartado'))::integer         as n_desc,
           max(x.criado_em)                                                     as ultimo,
           (array_agg(x.rotulo order by x.criado_em desc))[1]                   as rotulo
      from linhas x
     group by x.carro
  ),
  motivos_por_carro as (
    select m.carro,
           jsonb_agg(jsonb_build_object('motivo', m.motivo_descarte, 'total', m.n)
                     order by m.n desc, m.motivo_descarte)                      as lista,
           (array_agg(m.motivo_descarte order by m.n desc, m.motivo_descarte))[1] as principal
      from (select y.carro, y.motivo_descarte, count(*)::integer as n
              from linhas y
             where y.situacao = 'descartado'
             group by y.carro, y.motivo_descarte) m
     group by m.carro
  )
  select coalesce(e.id, c.carro),
         coalesce(public.rotulo_de_veiculo(e.marca, e.modelo, e.versao, e.ano),
                  c.rotulo,
                  'Veículo nº ' || coalesce(e.id, c.carro)),
         e.id is not null,
         case when e.id is not null then coalesce(e.vendido, false) end,
         e.preco,
         coalesce(c.n_total, 0),
         coalesce(c.n_aval, 0),
         coalesce(c.n_sem, 0),
         coalesce(c.n_esc, 0),
         coalesce(c.n_desc, 0),
         mc.principal,
         coalesce(mc.lista, '[]'::jsonb),
         c.ultimo
    from public.estoque_motors e
    full join por_carro c on c.carro = e.id
    left join motivos_por_carro mc on mc.carro = coalesce(e.id, c.carro)
   order by coalesce(c.n_total, 0) desc, c.ultimo desc nulls last, coalesce(e.id, c.carro);
end;
$fn$;

comment on function public.interesse_por_veiculo() is
  'O ranking: uma linha por carro do estoque (com ou sem interesse) MAIS os '
  'carros que já saíram do estoque e têm histórico (no_estoque = false, '
  'vendido e preco_atual nulos, rótulo do retrato). Contagens como no resumo; '
  'motivo_principal é o descarte mais citado. Ordenado do mais considerado ao '
  'menos. Só agregados. Restrito à equipe ativa.';

revoke all on function public.rotulo_de_veiculo(text, text, text, integer)   from public, anon;
revoke all on function public.leads_veiculos_carimbar()                      from public, anon, authenticated;
revoke all on function public.resumo_de_interesse_do_veiculo(bigint)         from public, anon;
revoke all on function public.interesse_por_veiculo()                        from public, anon;
grant execute on function public.rotulo_de_veiculo(text, text, text, integer) to authenticated, service_role;
grant execute on function public.resumo_de_interesse_do_veiculo(bigint)       to authenticated, service_role;
grant execute on function public.interesse_por_veiculo()                      to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 6. A carga inicial — só com a tabela vazia
-- ----------------------------------------------------------------------------
do $carga$
declare
  v_n bigint;
begin
  if exists (select 1 from public.leads_veiculos) then
    perform set_config('motors.leads_veiculos_carga', 'pulada', false);
    raise notice 'Carga inicial pulada: leads_veiculos já tem linhas.';
    return;
  end if;

  insert into public.leads_veiculos
    (lead_id, veiculo_id, veiculo_rotulo, veiculo_preco, situacao, criado_em, resolvido_em)
  select l.id,
         l.veiculo_id,
         coalesce(public.rotulo_de_veiculo(e.marca, e.modelo, e.versao, e.ano),
                  left(nullif(btrim(l.interesse), ''), 200),
                  'Veículo nº ' || l.veiculo_id),
         e.preco,
         case when l.desfecho = 'ganho' then 'escolhido' else 'em_avaliacao' end,
         l.created_at,
         case when l.desfecho = 'ganho'
              then coalesce(l.desfecho_em, l.atualizado_em, l.created_at) end
    from public.leads l
    left join public.estoque_motors e on e.id = l.veiculo_id
   where l.veiculo_id is not null;

  get diagnostics v_n = row_count;
  perform set_config('motors.leads_veiculos_carga', 'feita', false);
  raise notice 'Carga inicial: % linha(s) em leads_veiculos, uma por lead com veículo.', v_n;
end $carga$;


-- ============================================================================
-- Aceite — a violação tem de falhar
-- ============================================================================
-- Estrutura, e depois efeito numa sonda desfeita pelo sentinela: seis perfis,
-- três leads, quatro opções em dois carros que não existem (ids negativos, só
-- da sonda) e, se o estoque tiver ao menos um carro, um carro de verdade para
-- a inclusão com sessão. NADA é gravado em `estoque_motors`, nem na sonda.
--
-- Cada caso é um comando rodado na pele de alguém, com DOIS resultados
-- esperados: antes e depois da 20261003130000 (a RLS de `leads` por escopo).
-- O aceite descobre em qual mundo está e cobra o dele. `vê:N` é o número
-- lido, `linhas:N` é quantas linhas o comando alcançou, `barrado` é 42501,
-- `recusado:x` é a regra `x` dizendo não.
do $aceite$
declare
  falhas      int := 0;
  v_txt       text;
  v_n         bigint;
  v_res       text;
  v_caso      record;
  v_casos     jsonb;
  v_falhou    text[] := array[]::text[];
  v_rodados   int := 0;
  v_esperados int := 0;
  v_por_escopo boolean;
  v_mundo     text;
  v_carga     text := current_setting('motors.leads_veiculos_carga', true);
  u           jsonb := '{}'::jsonb;   -- apelido → id do usuário
  l           uuid[];                 -- os três leads
  r           uuid[] := array[]::uuid[];  -- as quatro opções
  k1          bigint := -9100001;
  k2          bigint := -9100002;
  k3          bigint := -9100003;
  v_carro     bigint;                 -- um carro de verdade, só lido
  v_etapa     text;
  q           text;
  v_id        uuid;
  v_resumo    jsonb;
  v_ranking   jsonb;
  v_restou    bigint;
begin
  v_por_escopo := exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'leads'
                             and policyname = 'leads_leitura_por_escopo');
  v_mundo := case when v_por_escopo
                  then 'leads por escopo (20261003130000 aplicada)'
                  else 'leads por is_staff (20261003130000 ainda não aplicada)' end;

  -- Estrutura ---------------------------------------------------------------
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then '!' else '' end, ' ' order by a.attnum)
    into v_txt
    from pg_attribute a
   where a.attrelid = 'public.leads_veiculos'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_txt is distinct from
     'id:uuid! org_id:uuid! lead_id:uuid! veiculo_id:bigint! veiculo_rotulo:text! '
     'veiculo_preco:numeric(12,2) situacao:text! motivo_descarte:text nota:text '
     'adicionado_por:text resolvido_por:text criado_em:timestamp with time zone! '
     'resolvido_em:timestamp with time zone' then
    falhas := falhas + 1;
    raise warning 'FALHOU: as colunas de leads_veiculos não são as prometidas: %', v_txt;
  end if;

  select string_agg(conname, ' ' order by conname) into v_txt
    from pg_constraint where conrelid = 'public.leads_veiculos'::regclass;
  if v_txt is distinct from
     'leads_veiculos_lead_id_fkey leads_veiculos_lead_veiculo_unico '
     'leads_veiculos_motivo_so_no_descarte leads_veiculos_motivo_valido '
     'leads_veiculos_nota_cabe leads_veiculos_outro_pede_nota leads_veiculos_pkey '
     'leads_veiculos_preco_valido leads_veiculos_resolucao_carimbada '
     'leads_veiculos_rotulo_preenchido leads_veiculos_situacao_valida' then
    falhas := falhas + 1;
    raise warning 'FALHOU: as constraints de leads_veiculos não são as prometidas: %', v_txt;
  end if;

  -- A única FK é a do lead, em cascata. Nada aponta para o estoque.
  if (select count(*) from pg_constraint
       where conrelid = 'public.leads_veiculos'::regclass and contype = 'f') <> 1
     or not exists (select 1 from pg_constraint
                     where conrelid = 'public.leads_veiculos'::regclass and contype = 'f'
                       and confrelid = 'public.leads'::regclass and confdeltype = 'c') then
    falhas := falhas + 1;
    raise warning 'FALHOU: a FK de leads_veiculos tem de ser uma só — para leads, em cascata';
  end if;
  if exists (select 1 from pg_constraint
              where confrelid = 'public.estoque_motors'::regclass
                and conrelid = 'public.leads_veiculos'::regclass)
     or exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                 where t.tgrelid in ('public.estoque_motors'::regclass, 'public.leads'::regclass)
                   and p.proname like 'leads_veiculos%') then
    falhas := falhas + 1;
    raise warning 'FALHOU: esta migração pendurou algo em estoque_motors ou em leads';
  end if;

  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'leads_veiculos_um_escolhido_por_lead'
                    and indexdef like 'CREATE UNIQUE INDEX%(lead_id) WHERE (situacao = ''escolhido''::text)')
     or not exists (select 1 from pg_indexes
                     where schemaname = 'public' and indexname = 'leads_veiculos_veiculo_idx') then
    falhas := falhas + 1;
    raise warning 'FALHOU: falta o índice único do escolhido ou o índice por veículo';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.leads_veiculos'::regclass
                    and tgname = 'trg_leads_veiculos_carimbar'
                    and tgfoid = 'public.leads_veiculos_carimbar()'::regprocedure
                    and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o gatilho do carimbo não está ligado em leads_veiculos';
  end if;

  if not exists (select 1 from pg_class
                  where oid = 'public.leads_veiculos'::regclass
                    and relrowsecurity and not relforcerowsecurity) then
    falhas := falhas + 1;
    raise warning 'FALHOU: leads_veiculos sem RLS ligada';
  end if;

  select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, '+'), ' ' order by policyname)
    into v_txt
    from pg_policies where schemaname = 'public' and tablename = 'leads_veiculos';
  if v_txt is distinct from
     'leads_veiculos_atualizacao_pelo_lead:UPDATE:authenticated '
     'leads_veiculos_exclusao_admin:DELETE:authenticated '
     'leads_veiculos_inclusao_pelo_lead:INSERT:authenticated '
     'leads_veiculos_leitura_pelo_lead:SELECT:authenticated' then
    falhas := falhas + 1;
    raise warning 'FALHOU: as policies de leads_veiculos não são as quatro prometidas: %', v_txt;
  end if;

  for v_caso in
    select * from (values
      ('anon',          ''),
      ('authenticated', 'SELECT,INSERT,UPDATE,DELETE'),
      ('service_role',  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ) as c(papel, esperado)
  loop
    select coalesce(string_agg(p, ',' order by o), '') into v_txt
      from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
           with ordinality as x(p, o)
     where has_table_privilege(v_caso.papel, 'public.leads_veiculos', p);
    if v_txt <> v_caso.esperado then
      falhas := falhas + 1;
      raise warning 'FALHOU: % tem em leads_veiculos "%", esperado "%"', v_caso.papel, v_txt, v_caso.esperado;
    end if;
  end loop;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) x
              where c.oid = 'public.leads_veiculos'::regclass
                and (x.grantee = 0 or x.grantee = 'anon'::regrole)) then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon (ou PUBLIC) tem entrada na ACL de leads_veiculos';
  end if;

  -- As funções: os dois relatórios e o gatilho rodam como dono, com
  -- search_path vazio; os relatórios são stable; anon não executa nada.
  for v_caso in
    select p.oid::regprocedure as f, p.proname, p.prosecdef, p.provolatile, p.proconfig
      from pg_proc p
     where p.oid in ('public.resumo_de_interesse_do_veiculo(bigint)'::regprocedure,
                     'public.interesse_por_veiculo()'::regprocedure,
                     'public.leads_veiculos_carimbar()'::regprocedure,
                     'public.rotulo_de_veiculo(text,text,text,integer)'::regprocedure)
  loop
    if v_caso.proconfig is distinct from array['search_path=""'] then
      falhas := falhas + 1;
      raise warning 'FALHOU: % sem search_path vazio', v_caso.f;
    end if;
    if v_caso.proname <> 'rotulo_de_veiculo' and not v_caso.prosecdef then
      falhas := falhas + 1;
      raise warning 'FALHOU: % não é SECURITY DEFINER', v_caso.f;
    end if;
    if v_caso.proname in ('resumo_de_interesse_do_veiculo', 'interesse_por_veiculo')
       and v_caso.provolatile <> 's' then
      falhas := falhas + 1;
      raise warning 'FALHOU: % não é stable', v_caso.f;
    end if;
    if has_function_privilege('anon', v_caso.f, 'execute') then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon executa %', v_caso.f;
    end if;
    if v_caso.proname in ('resumo_de_interesse_do_veiculo', 'interesse_por_veiculo')
       and not has_function_privilege('authenticated', v_caso.f, 'execute') then
      falhas := falhas + 1;
      raise warning 'FALHOU: authenticated não executa %', v_caso.f;
    end if;
  end loop;

  -- O que os relatórios devolvem, coluna a coluna: nenhuma é de pessoa.
  select array_to_string(p.proargnames, ',') into v_txt
    from pg_proc p where p.oid = 'public.resumo_de_interesse_do_veiculo(bigint)'::regprocedure;
  if v_txt is distinct from
     'p_veiculo,veiculo_id,total,em_avaliacao,sem_resolucao,escolhido,descartado,motivos,notas,'
     'primeiro_interesse_em,ultimo_interesse_em' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o resumo devolve colunas que não são as prometidas: %', v_txt;
  end if;
  select array_to_string(p.proargnames, ',') into v_txt
    from pg_proc p where p.oid = 'public.interesse_por_veiculo()'::regprocedure;
  if v_txt is distinct from
     'veiculo_id,veiculo_rotulo,no_estoque,vendido,preco_atual,total,em_avaliacao,sem_resolucao,'
     'escolhido,descartado,motivo_principal,motivos,ultimo_interesse_em' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o ranking devolve colunas que não são as prometidas: %', v_txt;
  end if;

  -- O rótulo: versão embutida não repete, ano embutido não repete, vazio é NULL.
  if public.rotulo_de_veiculo('fiat', 'uno', 'mille fire economy', 2013) is distinct from 'fiat uno mille fire economy 2013'
     or public.rotulo_de_veiculo('BMW', 'X4 M40i 3.0', 'm40i 3.0', 2022) is distinct from 'BMW X4 M40i 3.0 2022'
     or public.rotulo_de_veiculo('ford', 'ka 2016', null, 2016) is distinct from 'ford ka 2016'
     or public.rotulo_de_veiculo(' ', null, '', null) is not null then
    falhas := falhas + 1;
    raise warning 'FALHOU: rotulo_de_veiculo não monta o nome como nomeDoVeiculo';
  end if;

  -- A carga, quando rodou agora: toda linha de lead com veículo virou opção,
  -- ganho virou escolhido e nada mais foi resolvido.
  if v_carga = 'feita' then
    select count(*) into v_n
      from public.leads x
     where x.veiculo_id is not null
       and not exists (
         select 1 from public.leads_veiculos v
          where v.lead_id = x.id and v.veiculo_id = x.veiculo_id
            and v.situacao = case when x.desfecho = 'ganho' then 'escolhido' else 'em_avaliacao' end
            and v.motivo_descarte is null
            and v.adicionado_por is null
            and v.criado_em = x.created_at);
    select v_n + abs((select count(*) from public.leads_veiculos)
                     - (select count(*) from public.leads where veiculo_id is not null))
      into v_n;
    if v_n <> 0 then
      falhas := falhas + 1;
      raise warning 'FALHOU: a carga inicial não deixou uma opção por lead com veículo (% divergência(s))', v_n;
    end if;
  end if;

  -- Efeito — tudo daqui até o sentinela é desfeito ---------------------------
  select e.id into v_carro from public.estoque_motors e order by e.id limit 1;
  if exists (select 1 from public.estoque_motors e where e.id in (k1, k2, k3)) then
    raise exception 'ACEITE FALHOU: o estoque tem um dos ids da sonda (%, %, %) — escolha outros', k1, k2, k3;
  end if;
  select chave into v_etapa from public.funil_etapas where tipo = 'perdido' and ativa order by ordem limit 1;

  begin
    foreach q in array array['admin', 'coma', 'comb', 'mkt', 'cli', 'inativo'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
              'authenticated', 'aceite-lv-' || q || '@exemplo.invalido', now(), now())
      returning id into v_id;
      u := u || jsonb_build_object(q, v_id);
    end loop;

    update public.profiles set full_name = 'Aceite LV Admin', papeis = array['admin'], role = 'admin', is_active = true
     where id = (u->>'admin')::uuid;
    update public.profiles set full_name = 'Aceite LV Vendedor A', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'coma')::uuid;
    update public.profiles set full_name = 'Aceite LV Vendedor B', papeis = array['comercial'], role = 'comercial', is_active = true
     where id = (u->>'comb')::uuid;
    update public.profiles set full_name = 'Aceite LV Marketing', papeis = array['marketing'], role = 'marketing', is_active = true
     where id = (u->>'mkt')::uuid;
    update public.profiles set full_name = 'Aceite LV Cliente', papeis = array['cliente'], role = 'cliente', is_active = true
     where id = (u->>'cli')::uuid;
    update public.profiles set full_name = 'Aceite LV Saiu', papeis = array['admin', 'comercial'], role = 'admin', is_active = false
     where id = (u->>'inativo')::uuid;

    -- 1 do vendedor A · 2 do vendedor B · 3 sem responsável
    with novos as (
      insert into public.leads (nome, telefone, interesse, responsavel)
      values ('Aceite LV Lead 1', '5541999992001', 'Teste Aceite', 'Aceite LV Vendedor A'),
             ('Aceite LV Lead 2', '5541999992002', 'Teste Aceite', 'Aceite LV Vendedor B'),
             ('Aceite LV Lead 3', '5541999992003', 'Teste Aceite', null)
      returning id, nome
    )
    select array_agg(id order by nome) into l from novos;

    -- As quatro opções, gravadas sem sessão (como a chave de serviço):
    --   r1  lead 1 × k1  em avaliação
    --   r2  lead 2 × k1  descartado por preço, com nota
    --   r3  lead 3 × k1  descartado por "outro", com nota
    --   r4  lead 2 × k2  em avaliação
    insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo, veiculo_preco)
    values (l[1], k1, 'aceite carro um 2020', 50000) returning id into v_id;
    r := r || v_id;
    insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo, veiculo_preco, situacao, motivo_descarte, nota)
    values (l[2], k1, 'aceite carro um 2020', 50000, 'descartado', 'preco', 'Aceite LV nota do preço') returning id into v_id;
    r := r || v_id;
    insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo, veiculo_preco, situacao, motivo_descarte, nota,
                                       resolvido_em)
    values (l[3], k1, 'aceite carro um 2020', 50000, 'descartado', 'outro', '  Aceite LV nota livre  ',
            now() - interval '1 day') returning id into v_id;
    r := r || v_id;
    insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo)
    values (l[2], k2, 'aceite carro dois 2021') returning id into v_id;
    r := r || v_id;

    -- [rótulo, quem, comando, esperado antes da 20261003130000, esperado
    --  depois, precisa de um carro de verdade no estoque]
    v_casos := jsonb_build_array(
      -- Leitura ---------------------------------------------------------------
      jsonb_build_array('admin vê as quatro',                 'admin',   'select count(*) from public.leads_veiculos where {sonda}', 'vê:4', 'vê:4', false),
      jsonb_build_array('chave de serviço vê as quatro',      '@service_role', 'select count(*) from public.leads_veiculos where {sonda}', 'vê:4', 'vê:4', false),
      jsonb_build_array('vendedor A vê as do lead que vê',    'coma',    'select count(*) from public.leads_veiculos where {sonda}', 'vê:4', 'vê:1', false),
      jsonb_build_array('vendedor B vê as do lead que vê',    'comb',    'select count(*) from public.leads_veiculos where {sonda}', 'vê:4', 'vê:2', false),
      jsonb_build_array('marketing vê o que vê de leads',     'mkt',     'select count(*) from public.leads_veiculos where {sonda}', 'vê:4', 'vê:0', false),
      jsonb_build_array('cliente não vê opção nenhuma',       'cli',     'select count(*) from public.leads_veiculos', 'vê:0', 'vê:0', false),
      jsonb_build_array('admin desativado não vê',            'inativo', 'select count(*) from public.leads_veiculos', 'vê:0', 'vê:0', false),
      jsonb_build_array('anônimo para no privilégio',         '@anon',   'select count(*) from public.leads_veiculos', 'barrado', 'barrado', false),
      -- Os relatórios: equipe sim (a loja inteira, mesmo sem ver o lead) -------
      jsonb_build_array('vendedor A lê o resumo da loja',     'coma',    'select total from public.resumo_de_interesse_do_veiculo({k1})', 'vê:3', 'vê:3', false),
      jsonb_build_array('marketing lê o resumo da loja',      'mkt',     'select total from public.resumo_de_interesse_do_veiculo({k1})', 'vê:3', 'vê:3', false),
      jsonb_build_array('carro sem interesse dá zero',        'coma',    'select total from public.resumo_de_interesse_do_veiculo({k3})', 'vê:0', 'vê:0', false),
      jsonb_build_array('…e ainda assim uma linha',           'coma',    'select count(*) from public.resumo_de_interesse_do_veiculo({k3})', 'vê:1', 'vê:1', false),
      jsonb_build_array('o ranking traz os dois da sonda',    'coma',    'select count(*) from public.interesse_por_veiculo() where veiculo_id in ({k1}, {k2}) and not no_estoque', 'vê:2', 'vê:2', false),
      jsonb_build_array('cliente não lê o resumo',            'cli',     'select total from public.resumo_de_interesse_do_veiculo({k1})', 'barrado', 'barrado', false),
      jsonb_build_array('cliente não lê o ranking',           'cli',     'select count(*) from public.interesse_por_veiculo()', 'barrado', 'barrado', false),
      jsonb_build_array('desativado não lê o resumo',         'inativo', 'select total from public.resumo_de_interesse_do_veiculo({k1})', 'barrado', 'barrado', false),
      jsonb_build_array('sem sessão não há equipe',           '@service_role', 'select total from public.resumo_de_interesse_do_veiculo({k1})', 'barrado', 'barrado', false),
      jsonb_build_array('anônimo não executa o resumo',       '@anon',   'select total from public.resumo_de_interesse_do_veiculo({k1})', 'barrado', 'barrado', false),
      jsonb_build_array('anônimo não executa o ranking',      '@anon',   'select count(*) from public.interesse_por_veiculo()', 'barrado', 'barrado', false),
      -- Inclusão ----------------------------------------------------------------
      jsonb_build_array('anônimo não inclui',                 '@anon',   'insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo) values ({1}, {k3}, ''x'')', 'barrado', 'barrado', false),
      jsonb_build_array('cliente não inclui',                 'cli',     'insert into public.leads_veiculos (lead_id, veiculo_id) values ({1}, {carro})', 'barrado', 'barrado', true),
      jsonb_build_array('A não inclui em lead que não vê',    'coma',    'insert into public.leads_veiculos (lead_id, veiculo_id) values ({3}, {carro})', 'linhas:1', 'barrado', true),
      jsonb_build_array('A inclui no lead dele, forjando',    'coma',    'insert into public.leads_veiculos (lead_id, veiculo_id, adicionado_por, criado_em, veiculo_preco, resolvido_por) values ({1}, {carro}, ''Forjado'', ''2000-01-01'', 1, ''Forjado'')', 'linhas:1', 'linhas:1', true),
      jsonb_build_array('…e o carimbo é o do banco',          '@dono',   'select count(*) from public.leads_veiculos v where v.lead_id = {1} and v.veiculo_id = {carro} and v.adicionado_por = ''Aceite LV Vendedor A'' and v.criado_em = now() and v.resolvido_por is null and btrim(v.veiculo_rotulo) <> '''' and v.veiculo_preco is not distinct from (select e.preco::numeric(12,2) from public.estoque_motors e where e.id = {carro})', 'vê:1', 'vê:1', true),
      jsonb_build_array('o mesmo carro não entra duas vezes', 'coma',    'insert into public.leads_veiculos (lead_id, veiculo_id) values ({1}, {carro})', 'recusado:leads_veiculos_lead_veiculo_unico', 'recusado:leads_veiculos_lead_veiculo_unico', true),
      jsonb_build_array('carro que não existe não entra',     'coma',    'insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo) values ({1}, {k3}, ''inventado'')', 'recusado:leads_veiculos_veiculo_no_estoque', 'recusado:leads_veiculos_veiculo_no_estoque', false),
      -- Resolução -----------------------------------------------------------------
      jsonb_build_array('descartar sem motivo é recusado',    'coma',    'update public.leads_veiculos set situacao = ''descartado'' where id = {r1}', 'recusado:leads_veiculos_motivo_so_no_descarte', 'recusado:leads_veiculos_motivo_so_no_descarte', false),
      jsonb_build_array('motivo fora da lista é recusado',    'coma',    'update public.leads_veiculos set situacao = ''descartado'', motivo_descarte = ''feio'' where id = {r1}', 'recusado:leads_veiculos_motivo_valido', 'recusado:leads_veiculos_motivo_valido', false),
      jsonb_build_array('"outro" sem nota é recusado',        'coma',    'update public.leads_veiculos set situacao = ''descartado'', motivo_descarte = ''outro'', nota = ''  '' where id = {r1}', 'recusado:leads_veiculos_outro_pede_nota', 'recusado:leads_veiculos_outro_pede_nota', false),
      jsonb_build_array('motivo sem descartar é recusado',    'coma',    'update public.leads_veiculos set motivo_descarte = ''km'' where id = {r1}', 'recusado:leads_veiculos_motivo_so_no_descarte', 'recusado:leads_veiculos_motivo_so_no_descarte', false),
      jsonb_build_array('A descarta com motivo',              'coma',    'update public.leads_veiculos set situacao = ''descartado'', motivo_descarte = ''km'', resolvido_por = ''Forjado'' where id = {r1}', 'linhas:1', 'linhas:1', false),
      jsonb_build_array('…e a resolução é carimbada',         '@dono',   'select count(*) from public.leads_veiculos v where v.id = {r1} and v.situacao = ''descartado'' and v.resolvido_por = ''Aceite LV Vendedor A'' and v.resolvido_em = now()', 'vê:1', 'vê:1', false),
      jsonb_build_array('A escolhe o carro do lead dele',     'coma',    'update public.leads_veiculos set situacao = ''escolhido'' where lead_id = {1} and veiculo_id = {carro}', 'linhas:1', 'linhas:1', true),
      jsonb_build_array('dois escolhidos no lead é recusado', 'coma',    'update public.leads_veiculos set situacao = ''escolhido'', motivo_descarte = null where id = {r1}', 'recusado:leads_veiculos_um_escolhido_por_lead', 'recusado:leads_veiculos_um_escolhido_por_lead', true),
      jsonb_build_array('A reabre a opção',                   'coma',    'update public.leads_veiculos set situacao = ''em_avaliacao'', motivo_descarte = null where id = {r1}', 'linhas:1', 'linhas:1', false),
      jsonb_build_array('…e o carimbo some',                  '@dono',   'select count(*) from public.leads_veiculos v where v.id = {r1} and v.situacao = ''em_avaliacao'' and v.resolvido_por is null and v.resolvido_em is null', 'vê:1', 'vê:1', false),
      jsonb_build_array('A tenta reescrever a autoria',       'coma',    'update public.leads_veiculos set adicionado_por = ''Forjado'', criado_em = ''2000-01-01'', veiculo_preco = 1, veiculo_rotulo = ''forjado'', nota = ''anotado'' where id = {r1}', 'linhas:1', 'linhas:1', false),
      jsonb_build_array('…e só a nota muda',                  '@dono',   'select count(*) from public.leads_veiculos v where v.id = {r1} and v.adicionado_por is null and v.criado_em > ''2001-01-01'' and v.veiculo_preco = 50000 and v.veiculo_rotulo = ''aceite carro um 2020'' and v.nota = ''anotado''', 'vê:1', 'vê:1', false),
      jsonb_build_array('a opção não troca de carro',         'coma',    'update public.leads_veiculos set veiculo_id = {k2} where id = {r1}', 'recusado:leads_veiculos_par_imutavel', 'recusado:leads_veiculos_par_imutavel', false),
      jsonb_build_array('…nem de lead, nem pelo dono',        '@dono',   'update public.leads_veiculos set lead_id = {2} where id = {r3}', 'recusado:leads_veiculos_par_imutavel', 'recusado:leads_veiculos_par_imutavel', false),
      jsonb_build_array('A não mexe em opção de lead alheio', 'coma',    'update public.leads_veiculos set nota = nota where id = {r2}', 'linhas:1', 'linhas:0', false),
      jsonb_build_array('cliente não mexe em nada',           'cli',     'update public.leads_veiculos set nota = ''x'' where {sonda}', 'linhas:0', 'linhas:0', false),
      -- As regras valem também sem sessão ----------------------------------------
      jsonb_build_array('situação inventada',                 '@dono',   'insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo, situacao) values ({3}, {k3}, ''x'', ''talvez'')', 'recusado:leads_veiculos_situacao_valida', 'recusado:leads_veiculos_situacao_valida', false),
      jsonb_build_array('rótulo vazio',                       '@dono',   'insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo) values ({3}, {k3}, ''   '')', 'recusado:leads_veiculos_rotulo_preenchido', 'recusado:leads_veiculos_rotulo_preenchido', false),
      jsonb_build_array('em avaliação já resolvida',          '@dono',   'insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo, resolvido_em) values ({3}, {k3}, ''x'', now())', 'recusado:leads_veiculos_resolucao_carimbada', 'recusado:leads_veiculos_resolucao_carimbada', false),
      jsonb_build_array('preço negativo',                     '@dono',   'insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo, veiculo_preco) values ({3}, {k3}, ''x'', -1)', 'recusado:leads_veiculos_preco_valido', 'recusado:leads_veiculos_preco_valido', false),
      jsonb_build_array('lead que não existe',                '@dono',   'insert into public.leads_veiculos (lead_id, veiculo_id, veiculo_rotulo) values (gen_random_uuid(), {k3}, ''x'')', 'recusado:leads_veiculos_lead_id_fkey', 'recusado:leads_veiculos_lead_id_fkey', false),
      -- Apagar ----------------------------------------------------------------------
      jsonb_build_array('vendedor não apaga a opção dele',    'coma',    'delete from public.leads_veiculos where id = {r1}', 'linhas:0', 'linhas:0', false),
      jsonb_build_array('marketing não apaga',                'mkt',     'delete from public.leads_veiculos where {sonda}', 'linhas:0', 'linhas:0', false),
      jsonb_build_array('admin desativado não apaga',         'inativo', 'delete from public.leads_veiculos where {sonda}', 'linhas:0', 'linhas:0', false),
      jsonb_build_array('admin apaga',                        'admin',   'delete from public.leads_veiculos where id = {r4}', 'linhas:1', 'linhas:1', false)
    );

    for v_caso in
      select c.ordem, c.caso->>0 as rotulo, c.caso->>1 as quem, c.caso->>2 as comando,
             case when v_por_escopo then c.caso->>4 else c.caso->>3 end as esperado,
             (c.caso->>5)::boolean as precisa_do_carro
        from jsonb_array_elements(v_casos) with ordinality as c(caso, ordem)
       order by c.ordem
    loop
      continue when v_caso.precisa_do_carro and v_carro is null;
      v_esperados := v_esperados + 1;

      q := replace(v_caso.comando, '{sonda}', format('lead_id = any (%L::uuid[])', l));
      for i in 1..3 loop
        q := replace(q, '{' || i || '}', format('%L::uuid', l[i]));
      end loop;
      for i in 1..4 loop
        q := replace(q, '{r' || i || '}', format('%L::uuid', r[i]));
      end loop;
      q := replace(q, '{k1}', k1::text);
      q := replace(q, '{k2}', k2::text);
      q := replace(q, '{k3}', k3::text);
      q := replace(q, '{carro}', coalesce(v_carro::text, 'null'));

      if v_caso.quem = '@dono' then
        null;
      elsif left(v_caso.quem, 1) = '@' then
        perform set_config('request.jwt.claims',
                           json_build_object('role', substr(v_caso.quem, 2))::text, true);
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
      exception
        when insufficient_privilege then
          v_res := 'barrado';
        when check_violation or unique_violation or foreign_key_violation or not_null_violation then
          get stacked diagnostics v_txt = constraint_name;
          v_res := 'recusado:' || coalesce(v_txt, '');
      end;

      reset role;
      perform set_config('request.jwt.claims', '', true);

      v_rodados := v_rodados + 1;
      if v_res is distinct from v_caso.esperado then
        v_falhou := v_falhou || format('%s: esperava %s, veio %s', v_caso.rotulo, v_caso.esperado, coalesce(v_res, '<nulo>'));
      end if;
    end loop;

    -- O lead 1 é encerrado como perdido com a opção r1 ainda em avaliação: é o
    -- `sem_resolucao` do resumo. (O gatilho do funil carimba o desfecho.)
    if v_etapa is not null then
      update public.leads set situacao = v_etapa where id = l[1];
    end if;

    -- O retrato que o painel recebe, lido por um vendedor que NÃO vê os leads
    -- 2 e 3 (no mundo do escopo): a loja inteira, e nada de pessoa.
    perform set_config('request.jwt.claims',
                       json_build_object('sub', u->>'coma', 'role', 'authenticated')::text, true);
    set local role authenticated;
    select to_jsonb(x) into v_resumo  from public.resumo_de_interesse_do_veiculo(k1) x;
    select to_jsonb(x) into v_ranking from public.interesse_por_veiculo() x where x.veiculo_id = k1;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    raise exception 'DESFAZER_ACEITE_DOS_VEICULOS_DE_INTERESSE' using errcode = 'LVI01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'LVI01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback ---------------
  if v_esperados < 44 or v_rodados <> v_esperados then
    falhas := falhas + 1;
    raise warning 'FALHOU: rodaram % caso(s) de % (o mínimo é 44, sem carro no estoque)', v_rodados, v_esperados;
  end if;
  if cardinality(v_falhou) > 0 then
    falhas := falhas + cardinality(v_falhou);
    foreach q in array v_falhou loop
      raise warning 'FALHOU: %', q;
    end loop;
  end if;

  -- O resumo do carro k1 ao fim da sonda: r1 em avaliação (lead encerrado),
  -- r2 descartado por preço, r3 descartado por "outro".
  if v_resumo is null
     or (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_resumo) k) is distinct from
        'descartado,em_avaliacao,escolhido,motivos,notas,primeiro_interesse_em,sem_resolucao,total,ultimo_interesse_em,veiculo_id'
     or (v_resumo->>'veiculo_id')::bigint <> k1
     or (v_resumo->>'total')::int <> 3
     or (v_resumo->>'em_avaliacao')::int <> 1
     or (v_resumo->>'sem_resolucao')::int <> (case when v_etapa is null then 0 else 1 end)
     or (v_resumo->>'escolhido')::int <> 0
     or (v_resumo->>'descartado')::int <> 2
     or v_resumo->'motivos' <> '[{"motivo":"outro","total":1},{"motivo":"preco","total":1}]'::jsonb
     or jsonb_array_length(v_resumo->'notas') <> 2
     or v_resumo->'notas'->0->>'nota' <> 'Aceite LV nota do preço'
     or v_resumo->'notas'->1->>'nota' <> 'Aceite LV nota livre'
     or exists (select 1 from jsonb_array_elements(v_resumo->'notas') n
                 where (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(n) k) <> 'em,motivo,nota') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o resumo do veículo não é o prometido: %', v_resumo;
  end if;

  if v_ranking is null
     or (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_ranking) k) is distinct from
        'descartado,em_avaliacao,escolhido,motivo_principal,motivos,no_estoque,preco_atual,sem_resolucao,total,ultimo_interesse_em,veiculo_id,veiculo_rotulo,vendido'
     or (v_ranking->>'no_estoque')::boolean
     or v_ranking->>'veiculo_rotulo' <> 'aceite carro um 2020'
     or v_ranking->>'vendido' is not null
     or (v_ranking->>'total')::int <> 3
     or (v_ranking->>'descartado')::int <> 2
     or v_ranking->>'motivo_principal' <> 'outro' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a linha do ranking não é a prometida: %', v_ranking;
  end if;

  -- Nada de pessoa nos dois: nem o nome ou o telefone dos leads, nem quem
  -- atendeu, nem o id de lead algum.
  v_txt := coalesce(v_resumo::text, '') || coalesce(v_ranking::text, '');
  if v_txt like '%Aceite LV Lead%' or v_txt like '%554199999%' or v_txt like '%Vendedor%'
     or v_txt like '%' || l[1]::text || '%' or v_txt like '%' || l[2]::text || '%'
     or v_txt like '%' || l[3]::text || '%' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o relatório por veículo devolveu dado de pessoa';
  end if;

  select count(*) into v_restou from auth.users where email like 'aceite-lv-%@exemplo.invalido';
  select v_restou + count(*) into v_restou from public.leads where nome like 'Aceite LV Lead %';
  select v_restou + count(*) into v_restou from public.leads_veiculos where veiculo_id in (k1, k2, k3);
  if v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a sonda do aceite deixou % linha(s) para trás', v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) nos veículos de interesse do lead', falhas;
  end if;
  raise notice
    'Aceite verificado: leads_veiculos guarda vários carros por lead, sem FK para o estoque; '
    'descarte exige motivo da lista (e nota no "outro"), um escolhido por lead, carro e lead '
    'não trocam, e autoria, preço e resolução são carimbados pelo banco; a opção acompanha a '
    'visibilidade do lead [%], só o admin apaga, cliente e anônimo ficam de fora; os relatórios '
    'por veículo são da loja inteira, só para a equipe ativa, e não devolvem dado de pessoa '
    '(% casos; carga inicial: %).',
    v_mundo, v_rodados, coalesce(v_carga, 'não rodou');
end $aceite$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20261005120000', 'veiculos_de_interesse')
  on conflict (version) do nothing;
