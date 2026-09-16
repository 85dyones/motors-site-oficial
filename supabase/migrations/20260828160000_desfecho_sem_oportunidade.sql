-- ===========================================================================
-- O terceiro desfecho: "não é uma oportunidade de negócio"
-- ===========================================================================
-- 2026-08-28, pedido do dono, horas depois de o funil entrar no ar:
--
--   *"precisamos ter a opção de encerrar como 'não é uma oportunidade de
--   negócio', para os casos de spam, testes, contato equivocado..."*
--
-- ---------------------------------------------------------------------------
-- Por que isto não é só mais um motivo de perda
-- ---------------------------------------------------------------------------
-- A migração anterior já previa o problema e o resolveu pela metade: criou o
-- motivo `contato_invalido` com o comentário *"não é motivo de venda perdida —
-- é motivo de lead que nunca foi lead. Sem ele, trote e duplicado entram na
-- estatística de 'perdemos por preço' e distorcem tudo que vier depois"*.
--
-- Ela tirou o spam de dentro de "preço". Não tirou o spam de dentro de
-- **perdemos**. E é aí que o estrago mora: a taxa de conversão é
-- `ganhos / (ganhos + perdidos)`, então cada robô que preenche o formulário
-- baixa o número da loja. Uma semana ruim de spam vira uma semana ruim de
-- vendas no relatório — e a decisão que sai disso é sobre a equipe comercial,
-- quando o problema era o captcha.
--
-- Um lead que nunca foi lead não é um negócio perdido. É um registro que não
-- deveria estar na conta. Por isso `descartado` é um TIPO de desfecho ao lado
-- de ganho e perdido, e não um motivo dentro de perdido: só assim ele sai do
-- denominador.
--
-- ---------------------------------------------------------------------------
-- O que muda, em uma linha cada
-- ---------------------------------------------------------------------------
--   funil_etapas.tipo ...... aceita 'descartado'
--   funil_motivos.tipo ..... aceita 'descartado'
--   leads.desfecho ......... aceita 'descartado'
--   etapa nova ............. `descartado` / "Não é oportunidade", protegida
--   motivos novos .......... spam, teste interno, contato equivocado,
--                            duplicado, currículo/fornecedor
--   contato_invalido ....... MUDA de lado: era motivo de perda, vira motivo
--                            de descarte. A chave fica, então o histórico
--                            continua legível.
--   o gatilho .............. carimba desfecho para os TRÊS tipos
--   a agenda ............... lead descartado também sai do filtro padrão
--
-- A trava `funil_exige_desfecho` NÃO passa a exigir uma etapa de descarte:
-- ganho e perdido são obrigatórios porque sem eles não há como medir; descarte
-- é higiene, e uma loja que não queira separar spam pode desativá-lo.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Os três CHECKs que só conheciam dois desfechos
-- ---------------------------------------------------------------------------
-- Eles nasceram inline no `create table`, então o Postgres os nomeou sozinho
-- (`funil_etapas_tipo_check` e parentes). Descobrir pelo `pg_constraint` em
-- vez de chutar o nome: `drop constraint if exists` com o nome errado é um
-- no-op silencioso, e o `add` seguinte falharia por duplicidade — ou pior,
-- passaria e deixaria o CHECK velho de pé, recusando 'descartado' em
-- produção com uma mensagem que não diz de onde veio.
--
-- Os novos ganham nome explícito, para a próxima migração não repetir esta
-- ginástica.

do $$
declare
  alvo record;
  c    record;
begin
  for alvo in
    select * from (values
      ('public.funil_etapas'::regclass,  'tipo'),
      ('public.funil_motivos'::regclass, 'tipo'),
      ('public.leads'::regclass,         'desfecho')
    ) as t(tabela, coluna)
  loop
    for c in
      select conname
        from pg_constraint
       where conrelid = alvo.tabela
         and contype = 'c'
         and pg_get_constraintdef(oid) like '%' || alvo.coluna || '%'
         and (pg_get_constraintdef(oid) like '%ganho%'
              or pg_get_constraintdef(oid) like '%aberta%')
    loop
      execute format('alter table %s drop constraint %I', alvo.tabela::text, c.conname);
      raise notice 'DESCARTE: CHECK % removido de %', c.conname, alvo.tabela::text;
    end loop;
  end loop;
end $$;

alter table public.funil_etapas
  add constraint funil_etapas_tipo_valido
  check (tipo in ('aberta', 'ganho', 'perdido', 'descartado'));

alter table public.funil_motivos
  add constraint funil_motivos_tipo_valido
  check (tipo in ('ganho', 'perdido', 'descartado'));

alter table public.leads
  add constraint leads_desfecho_valido
  check (desfecho is null or desfecho in ('ganho', 'perdido', 'descartado'));

comment on column public.leads.desfecho is
  'Como o negócio terminou: ganho, perdido ou descartado (2026-08-28). '
  '`descartado` é o lead que nunca foi lead — spam, teste, contato '
  'equivocado — e existe para SAIR da conta: a taxa de conversão é '
  'ganhos/(ganhos+perdidos), e sem o terceiro tipo cada robô que preenche o '
  'formulário baixa o número da loja.';


-- ---------------------------------------------------------------------------
-- 2. A etapa de descarte
-- ---------------------------------------------------------------------------
-- Protegida como as outras terminais: não cobra prazo e não transfere. E,
-- como ganho e perdido, ela não vira coluna do quadro — é o terceiro botão do
-- card (`etapasDoQuadro` só desenha `tipo = 'aberta'`).

insert into public.funil_etapas
  (chave, rotulo, ordem, tipo, estagnacao_minutos, transferencia_minutos, protegida, cor)
values
  ('descartado', 'Não é oportunidade', 8, 'descartado', null, null, true, '#57534E')
on conflict (chave) do nothing;


-- ---------------------------------------------------------------------------
-- 3. Os motivos de descarte
-- ---------------------------------------------------------------------------
-- Cinco novos, mais um que muda de lado. A lista é curta de propósito, pela
-- mesma razão registrada na migração anterior: motivo que ninguém escolhe
-- vira ruído, e motivo demais faz o vendedor clicar no primeiro.
--
-- `nao_e_cliente` não é enfeite: revenda recebe currículo, proposta de
-- fornecedor e pedido de parceria pelo mesmo formulário do site.

insert into public.funil_motivos (chave, rotulo, tipo, ordem) values
  ('spam',               'Spam ou robô',                          'descartado', 1),
  ('teste_interno',      'Teste interno da equipe',               'descartado', 2),
  ('contato_equivocado', 'Contato equivocado — não era sobre carro', 'descartado', 3),
  ('duplicado',          'Lead duplicado',                        'descartado', 4),
  ('nao_e_cliente',      'Currículo, fornecedor ou parceria',     'descartado', 6)
on conflict (chave) do nothing;

-- `contato_invalido` troca de lado, mantendo a CHAVE.
--
-- Renomear a chave seria mais limpo de ler e quebraria o histórico: ela é
-- referência de `leads.desfecho_motivo`, e qualquer lead já fechado com ela
-- perderia o motivo. O rótulo é o que se lê na tela; a chave é identidade.
update public.funil_motivos
   set tipo = 'descartado',
       rotulo = 'Contato inválido ou trote',
       ordem = 5
 where chave = 'contato_invalido';

-- E quem já foi fechado com ele muda de desfecho junto. Sem isto sobraria um
-- lead marcado como PERDIDO apontando para um motivo de DESCARTE — a rota
-- recusa essa combinação ao gravar, e ela ficaria no banco contradizendo a
-- própria regra.
--
-- Em produção isto é zero linhas hoje (o funil entrou no ar há horas). Existe
-- para os outros ambientes e para o dia em que alguém aplicar a cadeia inteira
-- num restore.
do $$
declare v_migrados int;
begin
  update public.leads
     set desfecho = 'descartado',
         situacao = 'descartado'
   where desfecho = 'perdido'
     and desfecho_motivo = 'contato_invalido';

  get diagnostics v_migrados = row_count;
  if v_migrados > 0 then
    raise notice
      'DESCARTE: % lead(s) fechados como "contato inválido" passaram de '
      'perdido para descartado — eles saem da taxa de conversão.', v_migrados;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 4. O gatilho passa a conhecer três desfechos
-- ---------------------------------------------------------------------------
-- Idêntico ao da migração 20260828120000, com uma diferença: a lista de tipos
-- terminais. Recriado inteiro em vez de remendado porque função meio trocada
-- é como as duas versões divergem — e aqui a divergência seria um lead que
-- cai na etapa de descarte e não recebe desfecho nenhum, ficando eternamente
-- na fila de estagnação.

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

    if v_tipo in ('ganho', 'perdido', 'descartado') then
      -- A etapa terminal carimba o desfecho na hora. O MOTIVO continua vazio
      -- de propósito: quem escolhe é a pessoa, na tela.
      if new.desfecho is distinct from v_tipo then
        new.desfecho    := v_tipo;
        new.desfecho_em := now();
      end if;
    elsif old.desfecho is not null and new.desfecho is not distinct from old.desfecho then
      -- Voltou para o funil: o negócio reabriu. Vale igual para o descarte —
      -- spam marcado por engano volta a ser lead, e não pode arrastar o
      -- carimbo antigo.
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
    new.alertado_em := null;
  end if;

  new.atualizado_em := now();
  return new;
end $$;


-- ---------------------------------------------------------------------------
-- 5. A agenda: descartado também sai do filtro do dia a dia
-- ---------------------------------------------------------------------------
-- O ramo de leads marcava `ativo = (desfecho is distinct from 'perdido')`.
-- Com o terceiro tipo isso passaria o spam de volta para a lista de contatos
-- ativos da agenda — que é o oposto do pedido.
--
-- A regra vira positiva em vez de negativa: ativo é quem está EM ABERTO ou
-- quem GANHOU. Escrita assim, um quarto tipo que apareça um dia nasce inativo
-- por padrão, que é o lado seguro de errar numa lista de contatos.
--
-- A view é reconstruída inteira (é `create or replace`, não dá para trocar um
-- ramo), com os mesmos quatro ramos da 20260824190000 mais o de leads.

do $$
declare
  ramos   text[] := array[]::text[];
  fontes  text[] := array[]::text[];
begin
  if to_regclass('public.parceiros') is null then
    raise exception
      'DESCARTE/AGENDA: public.parceiros não existe. A view seria reconstruída '
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

  fontes := fontes || 'leads'::text;
  ramos := ramos || $ramo$
    select
      'lead'::text, l.id, l.nome, 'lead'::text,
      coalesce(e.rotulo, l.situacao),
      null::text, l.telefone, l.email, null::text,
      nullif(concat_ws(' — ', nullif(trim(l.interesse), ''),
                              nullif(trim(l.observacoes), '')), ''),
      (l.desfecho is null or l.desfecho = 'ganho'),
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
    || 'consulta. Lead ativo = em aberto ou ganho; perdido e descartado saem '
    || 'do filtro padrão e continuam alcançáveis em "todos". '
    || 'Fontes unidas neste banco: ' || array_to_string(fontes, ', ')
    || '. Fonte ausente aqui significa tabela ausente no banco, não filtro.');
end $$;

revoke all on public.agenda_de_pessoas from anon;
grant select on public.agenda_de_pessoas to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Autoconferência — no mesmo ensaio em seco da migração anterior
-- ---------------------------------------------------------------------------
-- Ele existe porque a lição de 2026-08-28 custou uma aplicação recusada: um
-- aceite que escreve na base precisa desfazer o que escreveu, e um aceite que
-- cobra NOME em vez de REGRA quebra na primeira base com gente de verdade.
do $aceite$
declare
  v_lead uuid;
  v_txt  text;
  qtd    int;
begin
  begin
    -- a) a etapa e os motivos existem, e o descarte não virou obrigatório
    if not exists (select 1 from public.funil_etapas
                    where chave = 'descartado' and tipo = 'descartado' and protegida) then
      raise exception
        'ACEITE FALHOU: a etapa de descarte não nasceu protegida — ela é '
        'terminal, não pode cobrar prazo nem transferir.';
    end if;

    select count(*) into qtd from public.funil_motivos where tipo = 'descartado' and ativo;
    if qtd < 6 then
      raise exception
        'ACEITE FALHOU: só % motivo(s) de descarte ativo(s), esperado ao menos 6', qtd;
    end if;

    -- b) `contato_invalido` mudou de lado SEM perder a chave
    select tipo into v_txt from public.funil_motivos where chave = 'contato_invalido';
    if v_txt is distinct from 'descartado' then
      raise exception
        'ACEITE FALHOU: contato_invalido continuou como "%" — ele é o motivo '
        'de lead que nunca foi lead, e enquanto for perda ele derruba a taxa '
        'de conversão da loja.', coalesce(v_txt, '<nulo>');
    end if;

    -- c) o gatilho carimba o TERCEIRO desfecho
    insert into public.leads (nome, telefone, situacao)
      values ('Aceite Descarte', '5541999990777', 'novo')
      returning id into v_lead;

    update public.leads set situacao = 'descartado' where id = v_lead;
    select desfecho into v_txt from public.leads where id = v_lead;
    if v_txt is distinct from 'descartado' then
      raise exception
        'ACEITE FALHOU: mover para a etapa de descarte não carimbou o desfecho '
        '(veio "%") — sem carimbo o lead volta para a fila de estagnação.',
        coalesce(v_txt, '<nulo>');
    end if;

    -- d) descartado sai do filtro padrão da agenda
    select count(*) into qtd from public.agenda_de_pessoas
     where id = v_lead and ativo = false;
    if qtd <> 1 then
      raise exception
        'ACEITE FALHOU: o lead descartado continuou ativo na agenda — spam não '
        'pode voltar para a lista de contatos do dia a dia.';
    end if;

    -- e) e sai da fila de alertas, como qualquer desfecho
    select count(*) into qtd
      from public.montar_fila_do_funil(now() + interval '30 days', false)
     where lead_id = v_lead;
    if qtd <> 0 then
      raise exception
        'ACEITE FALHOU: lead descartado continuou na fila de estagnação — '
        'o vendedor seria cobrado por não atender um robô.';
    end if;

    -- f) reabrir limpa o carimbo: descarte por engano tem volta
    update public.leads set situacao = 'novo' where id = v_lead;
    select desfecho into v_txt from public.leads where id = v_lead;
    if v_txt is not null then
      raise exception
        'ACEITE FALHOU: tirar o lead do descarte deixou o desfecho "%" para '
        'trás — quem marcou spam por engano não conseguiria desfazer.', v_txt;
    end if;

    raise exception 'ensaio concluido' using errcode = 'ACE01';
  exception
    when sqlstate 'ACE01' then null;
  end;

  raise notice
    'Aceite verificado: o descarte é um terceiro desfecho — carimba, sai da '
    'agenda, sai da fila de alertas e tem volta; e contato_invalido deixou de '
    'contar como venda perdida.';
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260828160000', 'desfecho_sem_oportunidade')
on conflict (version) do nothing;
