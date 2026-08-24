-- ===========================================================================
-- Agenda de pessoas: clientes, fornecedores, prestadores e investidores
-- ===========================================================================
-- 2026-08-24, pedido do dono: *"precisamos ter uma aba clientes, hoje temos os
-- cadastros auxiliares, mas não tá legal, o revenda tem uma área de clientes
-- sejam internos ou externos, fornecedores... pra organizar tudo e termos como
-- gerenciar"*.
--
-- ---------------------------------------------------------------------------
-- O diagnóstico: três agendas que ninguém sabia que eram três
-- ---------------------------------------------------------------------------
-- Hoje a mesma pergunta — *"quem é essa pessoa e o que ela tem comigo?"* — é
-- respondida por QUATRO tabelas que nunca se falaram:
--
--   public.clientes         quem COMPROU um carro. Nasce no fechamento da
--                           venda, carrega CPF único, consentimento de LGPD e
--                           o vínculo com o login da Garagem. É referenciada
--                           por veiculos_vendidos, contratos, apólices e o
--                           plano de revisões.
--   public.parceiros        quem RECEBE ou PAGA no financeiro. Nasce no
--                           lançamento de uma conta. Tem tipo
--                           fornecedor/cliente/ambos e nada mais.
--   public.parceiros_ciclo  a REDE de serviço do Ciclo (oficina, seguradora,
--                           despachante, estética, pneus), com comissão.
--   public.investidores     quem APORTA capital. O dono pediu a área de
--                           clientes *"sejam internos ou externos"* — esta é a
--                           contraparte interna, e hoje ela só existe dentro
--                           da tela de aportes.
--
-- Resultado prático: o mesmo CNPJ podia estar em duas delas com grafias
-- diferentes, e não havia UMA tela que respondesse "com quem eu me relaciono".
-- A única porta era a aba "Parceiros" dos cadastros auxiliares, que enxergava
-- um terço do universo e se chamava "auxiliar" — o nome já denunciava.
--
-- ---------------------------------------------------------------------------
-- A decisão: unir a VISTA, não as TABELAS
-- ---------------------------------------------------------------------------
-- A tentação era fundir tudo em `pessoas` e migrar os dados. Não se faz isso
-- aqui, por três razões concretas:
--
--   1. `clientes.cpf_cnpj` é UNIQUE e `parceiros.documento` não é — e há
--      parceiro cadastrado sem documento. Fundir exigiria inventar chave para
--      quem não tem, ou perder linha no caminho.
--   2. `clientes` carrega `consentimento_lgpd_em` e `consentimento_canais`.
--      Consentimento não se copia entre tabelas: quem consentiu, consentiu
--      naquele registro. Uma migração de dados aqui é risco jurídico, não
--      risco técnico.
--   3. `clientes.id` é destino de FK em seis tabelas do Ciclo, com contrato de
--      36 meses atrás. Renumerar é reescrever história de veículo vendido.
--
-- O dono não pediu uma tabela. Pediu **um lugar para gerenciar**. Uma view faz
-- exatamente isso, hoje, sem tocar num byte de dado existente — e deixa a
-- fusão física para o dia em que alguém sentir falta dela.
--
-- ---------------------------------------------------------------------------
-- A trava que essa view NÃO pode perder: security_invoker
-- ---------------------------------------------------------------------------
-- View no Postgres roda, por padrão, com os privilégios de QUEM A CRIOU — e
-- quem cria migração aqui é o dono do banco, que ignora RLS. Uma view comum
-- sobre `clientes` seria, literalmente, um cano que despeja a base inteira de
-- CPFs para qualquer `authenticated` — inclusive o cliente da Garagem, que é
-- authenticated e não é staff.
--
-- `security_invoker = true` inverte isso: a RLS de cada tabela-base é aplicada
-- na pele de quem consulta. É a diferença entre uma vitrine e um vazamento, e
-- por isso a autoconferência abaixo QUEBRA a migração se a opção não pegar.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. A versão do servidor, antes de qualquer coisa
-- ---------------------------------------------------------------------------
-- `security_invoker` só existe no Postgres 15. Num servidor mais velho o
-- `create view ... with (security_invoker = true)` falha na cláusula — mas
-- basta alguém "consertar" removendo a opção para a view virar o vazamento
-- descrito acima. Falhar aqui, com o motivo escrito, evita esse conserto.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception
      'Este servidor é Postgres %, e `security_invoker` exige 15+. Sem ele a '
      'view agenda_de_pessoas ignoraria a RLS de clientes. Atualize o servidor '
      '— NÃO remova a opção.', current_setting('server_version');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. `parceiros` ganha o que faltava para ser um cadastro de gente
-- ---------------------------------------------------------------------------
-- A tabela nasceu no bootstrap de 2026-08-03 com cinco campos e nunca cresceu,
-- porque nunca teve tela própria — era um apêndice do formulário de conta.
alter table public.parceiros
  -- Fornecedor não se apaga: ele está no histórico de contas pagas dos últimos
  -- dois anos. Desativa — some das listas de escolha, permanece no passado.
  -- É a mesma regra de `parceiros_ciclo.ativo` e de `categorias.ativa`.
  add column if not exists ativo        boolean not null default true,
  add column if not exists cidade       text,
  add column if not exists observacoes  text,
  add column if not exists updated_at   timestamptz default now();

comment on column public.parceiros.ativo is
  'Falso = some das listas de escolha, permanece no histórico (2026-08-24). '
  'Fornecedor com conta paga no passado nunca pode ser apagado.';

-- ---------------------------------------------------------------------------
-- 2. A view
-- ---------------------------------------------------------------------------
-- Montada por SQL dinâmico porque as tabelas do Ciclo (`clientes`,
-- `parceiros_ciclo`) vêm de outra migração, e nem todo banco desta cadeia as
-- tem — o andaime de teste é um recorte. `parceiros` é obrigatória: sem ela
-- não há financeiro, e a migração deve parar em vez de entregar uma agenda
-- pela metade.
--
-- Ausência de fonte é RUÍDO PERIGOSO — uma agenda que mostra dois terços do
-- mundo parece completa. Por isso as fontes efetivamente unidas ficam
-- gravadas no `comment on view`: quem desconfiar da lista pergunta ao banco,
-- não a este arquivo.
do $$
declare
  ramos   text[] := array[]::text[];
  fontes  text[] := array[]::text[];
begin
  if to_regclass('public.parceiros') is null then
    raise exception
      'AGENDA: public.parceiros não existe. Ela é a fonte do financeiro e sem '
      'ela a agenda não tem sentido — verifique o bootstrap antes de seguir.';
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
    -- O cliente do Ciclo entra como 'cliente' sempre: quem comprou um carro é
    -- cliente por definição, não por classificação de alguém.
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
    -- A oficina não é fornecedor do financeiro nem cliente: é 'prestador'. O
    -- que ela faz (oficina, seguradora, despachante) vai em `especialidade`,
    -- que é nula nas outras duas origens.
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
    -- O dono pediu clientes *"sejam internos ou externos"*. O investidor é a
    -- contraparte interna por excelência: não é cliente nem fornecedor — a
    -- própria migração que o criou diz isso — mas é gente com quem a loja se
    -- relaciona, e não aparecer numa agenda de relacionamentos é o mesmo
    -- buraco que motivou este arquivo.
    --
    -- O que aparece aqui é a FICHA (nome, contato). Aporte e retirada
    -- continuam onde estão, na tela de investidores: dinheiro de sócio não se
    -- edita de passagem numa lista de contatos.
    ramos := ramos || $ramo$
      select
        'investidores'::text, i.id, i.nome, 'investidor'::text, null::text,
        i.documento, i.telefone, i.email, null::text, i.observacoes,
        i.ativo, i.created_at
      from public.investidores i
    $ramo$::text;
  end if;

  execute 'create or replace view public.agenda_de_pessoas '
       || 'with (security_invoker = true) as '
       || array_to_string(ramos, ' union all ');

  execute format(
    'comment on view public.agenda_de_pessoas is %L',
    'Clientes, fornecedores, prestadores e investidores num formato só '
    || '(2026-08-24). '
    || 'security_invoker: a RLS de cada tabela-base vale na pele de quem '
    || 'consulta. Fontes unidas neste banco: ' || array_to_string(fontes, ', ')
    || '. Fonte ausente aqui significa tabela ausente no banco, não filtro.');
end $$;

-- A view é de leitura, e de staff. `anon` perde o acesso explicitamente: o
-- bootstrap do Supabase dá `grant all` por default privilege a todo mundo, e
-- confiar só no `security_invoker` para segurar o anônimo é depender de uma
-- trava quando se pode ter duas.
revoke all on public.agenda_de_pessoas from anon;
grant select on public.agenda_de_pessoas to authenticated, service_role;

-- O que a busca varre. Índice comum em `nome` porque é por nome que se procura
-- gente; documento entra porque é o que se digita quando o nome está grafado
-- de três jeitos diferentes.
create index if not exists idx_parceiros_nome      on public.parceiros (nome);
create index if not exists idx_parceiros_documento on public.parceiros (documento);
create index if not exists idx_parceiros_ativo     on public.parceiros (ativo);

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
do $$
declare
  v_invoker    text;
  v_parceiro   uuid;
  v_linhas     int;
  v_papel      text;
  v_anon       boolean;
  v_fontes     text;
begin
  -- a) a trava de segurança pegou. Esta é a checagem que não pode faltar: sem
  --    ela a view seria um SELECT irrestrito sobre a base de CPFs.
  select coalesce(
           (select option_value
              from pg_options_to_table(c.reloptions)
             where option_name = 'security_invoker'),
           'ausente')
    into v_invoker
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'agenda_de_pessoas';

  if v_invoker is distinct from 'true' then
    raise exception
      'ACEITE FALHOU: agenda_de_pessoas está com security_invoker = %. '
      'Sem ela a view ignora a RLS e devolve a base inteira de clientes para '
      'qualquer authenticated.', v_invoker;
  end if;

  -- b) `anon` não alcança a view nem pelo privilégio
  select has_table_privilege('anon', 'public.agenda_de_pessoas', 'select')
    into v_anon;
  if v_anon then
    raise exception
      'ACEITE FALHOU: anon ainda tem SELECT em agenda_de_pessoas';
  end if;

  -- c) os campos novos de `parceiros` existem e têm o padrão prometido
  insert into public.parceiros (nome, tipo)
    values ('Aceite Agenda Ltda', 'fornecedor')
    returning id into v_parceiro;

  if not exists (select 1 from public.parceiros
                  where id = v_parceiro and ativo = true) then
    raise exception 'ACEITE FALHOU: parceiro novo não nasceu ativo';
  end if;

  -- d) o parceiro aparece na agenda, com o papel dele
  select count(*), max(papel) into v_linhas, v_papel
    from public.agenda_de_pessoas
   where id = v_parceiro;

  if v_linhas <> 1 then
    raise exception
      'ACEITE FALHOU: o parceiro recém-criado apareceu % vez(es) na agenda, '
      'esperado exatamente 1', v_linhas;
  end if;
  if v_papel <> 'fornecedor' then
    raise exception
      'ACEITE FALHOU: o papel na agenda veio "%", esperado "fornecedor"', v_papel;
  end if;

  -- e) desativar tira das listas de escolha sem tirar do histórico
  update public.parceiros set ativo = false where id = v_parceiro;
  if not exists (select 1 from public.agenda_de_pessoas
                  where id = v_parceiro and ativo = false) then
    raise exception
      'ACEITE FALHOU: parceiro desativado sumiu da agenda em vez de aparecer '
      'como inativo — a agenda é o histórico, o filtro é da tela';
  end if;

  delete from public.parceiros where id = v_parceiro;

  -- f) o comentário registra as fontes, para quem for desconfiar depois
  select obj_description('public.agenda_de_pessoas'::regclass, 'pg_class')
    into v_fontes;
  if v_fontes is null or v_fontes not like '%Fontes unidas%' then
    raise exception
      'ACEITE FALHOU: a view não registrou de quais tabelas ela veio';
  end if;

  raise notice
    'Aceite verificado: agenda_de_pessoas respeita RLS (security_invoker), '
    'nega anon, mostra o parceiro com o papel certo e mantém o inativo à '
    'vista. %', v_fontes;
end $$;

-- ---------------------------------------------------------------------------
-- Autoconferência, parte 2: a RLS na pele de quem consulta
-- ---------------------------------------------------------------------------
-- A parte 1 checa que a OPÇÃO `security_invoker` está ligada. Isso é um proxy:
-- prova que a chave está na fechadura, não que a porta tranca. Aqui a porta é
-- empurrada — um usuário sem papel de painel veste a própria pele e tenta ler
-- a agenda. É a diferença entre ler o reloption e sofrer a política.
do $rls$
declare
  v_cliente_login uuid;
  v_financeiro    uuid;
  v_cli           uuid;
  v_forn          uuid;
  qtd             int;
begin
  if to_regclass('public.clientes') is null then
    raise notice 'Aceite de RLS pulado: esta base não tem public.clientes.';
    return;
  end if;

  -- Quem NÃO é staff: o cliente da Garagem. É authenticated como qualquer
  -- outro — a única coisa que o separa da base de CPFs é a policy.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-agenda-cli@exemplo.invalido', now(), now())
  returning id into v_cliente_login;
  update public.profiles set papeis = array['cliente'], role = 'cliente'
   where id = v_cliente_login;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-agenda-fin@exemplo.invalido', now(), now())
  returning id into v_financeiro;
  update public.profiles set papeis = array['financeiro'], role = 'financeiro'
   where id = v_financeiro;

  insert into public.clientes (cpf_cnpj, nome, telefone_e164)
    values ('00000000191', 'Aceite Cliente da Agenda', '+5541999990000')
    returning id into v_cli;
  insert into public.parceiros (nome, tipo)
    values ('Aceite Fornecedor da Agenda', 'fornecedor')
    returning id into v_forn;

  -- ---- o não-staff ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cliente_login, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into qtd from public.agenda_de_pessoas where id = v_cli;
  if qtd <> 0 then
    raise exception
      'ACEITE FALHOU: quem não é staff leu % linha(s) de cliente pela agenda. '
      'A view está furando a RLS de public.clientes.', qtd;
  end if;

  select count(*) into qtd from public.agenda_de_pessoas where id = v_forn;
  if qtd <> 0 then
    raise exception
      'ACEITE FALHOU: quem não é staff leu % fornecedor(es) pela agenda. '
      'A view está furando a RLS de public.parceiros.', qtd;
  end if;

  reset role;

  -- ---- o Financeiro, que precisa enxergar ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_financeiro, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into qtd from public.agenda_de_pessoas where id in (v_cli, v_forn);
  if qtd <> 2 then
    raise exception
      'ACEITE FALHOU: o financeiro enxergou % das 2 linhas da agenda. Uma view '
      'que esconde de quem tem direito é tão inútil quanto uma que mostra a '
      'quem não tem.', qtd;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from public.clientes  where id = v_cli;
  delete from public.parceiros where id = v_forn;
  delete from public.profiles  where id in (v_cliente_login, v_financeiro);
  delete from auth.users       where id in (v_cliente_login, v_financeiro);

  raise notice
    'Aceite verificado: na pele do não-staff a agenda devolve zero; na do '
    'financeiro devolve as duas origens.';
end $rls$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260824190000', 'agenda_de_pessoas')
  on conflict (version) do nothing;
