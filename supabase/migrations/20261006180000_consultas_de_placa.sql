-- ============================================================================
-- As consultas de placa — o retrato do carro que a loja avalia para comprar
-- ============================================================================
-- Pedido do dono (2026-10-06): digitar a placa de um carro oferecido à loja e
-- ver, no painel, tudo do veículo, se há impeditivo e para onde vai o preço
-- dele. Hoje isso chega como um PDF de R$ 60 da vistoria parceira. A fonte
-- escolhida foi a APIBrasil, produto "Veículos Total" (R$ 30 por consulta),
-- conferida campo a campo contra um laudo desses no mesmo dia.
--
-- Cada consulta é paga. Esta tabela é o que faz a mesma placa não ser cobrada
-- duas vezes sem alguém pedir: a rota (`/api/consulta-placa`) devolve o
-- retrato guardado e só vai ao fornecedor de novo quando a pessoa manda.
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.consultas_de_placa` — uma linha por consulta feita ao fornecedor.
--    `retrato` (jsonb) é o que `lerRespostaDaApiBrasil` devolve
--    (src/lib/consultaDePlaca.ts): veículo, FIPE com a série mensal, gravames,
--    débitos, leilão, sinistro, apontamentos e o que NÃO veio.
-- 2. `consultas_de_placa_carimbar()` — gatilho da própria tabela: com sessão,
--    quem consultou e quando não são de quem chama.
-- 3. RLS: lê e inclui quem a matriz de permissões deixa (linha "Consultar
--    placa de veículo (consulta paga)": Administrador, Gestor e Comercial).
--
-- ---------------------------------------------------------------------------
-- Dado pessoal não entra — e a tabela recusa
-- ---------------------------------------------------------------------------
-- A resposta do fornecedor traz nome e CPF do proprietário e o CPF de quem
-- financiou o carro. Nada disso serve à decisão de compra, e é o mesmo dado
-- que tirou o laudo cautelar da ficha pública (LGPD, decisão do dono). O
-- código monta o retrato por lista positiva e nunca grava a resposta crua.
-- `consultas_de_placa_sem_dado_pessoal` é a segunda tranca: o `retrato` não
-- pode conter NENHUMA das chaves com que o fornecedor entrega dado de pessoa
-- (proprietario, pronome, pronomeAnterior, cpfCnpj, cpf, documentoFinanciado,
-- restricaoArrendatario, restricaoDocArrendatario, email, cellphone). Se um
-- dia alguém trocar o leitor por "grava tudo", o banco diz não.
--
-- O chassi, o motor e o renavam ficam: são do veículo, e é com eles que a
-- perícia confere a numeração. O CNPJ de faturamento fica: é de empresa.
--
-- ---------------------------------------------------------------------------
-- Só inclusão
-- ---------------------------------------------------------------------------
-- A linha é o registro de uma consulta que custou dinheiro. Ninguém a edita e
-- ninguém a apaga pelo painel: `authenticated` recebe SELECT e INSERT, e nada
-- mais. Consultar de novo é linha nova, e a mais recente é a que a tela abre.
--
-- ---------------------------------------------------------------------------
-- As regras, e quem as segura
-- ---------------------------------------------------------------------------
--   consultas_de_placa_placa_valida ......... ABC1234 ou ABC1D23, maiúscula
--   consultas_de_placa_produto_conhecido .... hoje só 'veiculos-total'
--   consultas_de_placa_custo_valido ......... nulo ou >= 0
--   consultas_de_placa_retrato_e_objeto ..... jsonb do tipo objeto
--   consultas_de_placa_retrato_da_placa ..... fora da homologação, o retrato é
--                                             da placa da linha
--   consultas_de_placa_sem_dado_pessoal ..... as chaves acima não entram
--
-- ⚠️ DESFAZER (nada mais depende destes objetos):
--
--   begin;
--   drop table    if exists public.consultas_de_placa;
--   drop function if exists public.consultas_de_placa_carimbar();
--   delete from supabase_migrations.schema_migrations where version = '20261006180000';
--   commit;
--
-- Aditiva (tabela nova; nenhuma coluna, policy ou gatilho em tabela existente;
-- `estoque_motors` não é tocada) e idempotente: `create table if not exists`,
-- `create or replace`, `drop … if exists` + `create` para gatilho e policies.
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
    raise exception
      'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. A tabela
-- ----------------------------------------------------------------------------
create table if not exists public.consultas_de_placa (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default public.org_padrao(),
  placa               text not null,
  produto             text not null,
  homologacao         boolean not null default false,
  retrato             jsonb not null,
  custo               numeric(10,2),
  consultado_por      uuid,
  consultado_por_nome text,
  criado_em           timestamptz not null default now(),

  constraint consultas_de_placa_placa_valida
    check (placa ~ '^[A-Z]{3}[0-9]([0-9]|[A-Z])[0-9]{2}$'),
  constraint consultas_de_placa_produto_conhecido
    check (produto in ('veiculos-total')),
  constraint consultas_de_placa_custo_valido
    check (custo is null or custo >= 0),
  constraint consultas_de_placa_retrato_e_objeto
    check (jsonb_typeof(retrato) = 'object'),
  constraint consultas_de_placa_retrato_da_placa
    check (homologacao or retrato->>'placa' = placa),
  constraint consultas_de_placa_sem_dado_pessoal
    check (retrato::text !~* '"(proprietario|pronome|pronomeAnterior|cpfCnpj|cpf|documentoFinanciado|restricaoArrendatario|restricaoDocArrendatario|email|cellphone)"\s*:')
);

-- A tela abre a consulta mais recente de uma placa.
create index if not exists consultas_de_placa_placa_idx
  on public.consultas_de_placa (org_id, placa, criado_em desc);

comment on table public.consultas_de_placa is
  'Consultas de placa feitas à APIBrasil para avaliar carro oferecido à loja '
  '(2026-10-06). Uma linha por consulta PAGA; a mais recente de cada placa é a '
  'que o painel abre, e é ela que evita cobrar a mesma placa duas vezes. Só '
  'inclusão: ninguém edita nem apaga. Lê e inclui quem a matriz deixa '
  '(Administrador, Gestor, Comercial). Ver 20261006180000_consultas_de_placa.sql.';
comment on column public.consultas_de_placa.placa is
  'A placa consultada, em maiúsculas e sem separador (ABC1234 ou ABC1D23).';
comment on column public.consultas_de_placa.produto is
  'O produto do fornecedor que respondeu. Hoje só ''veiculos-total'' (APIBrasil).';
comment on column public.consultas_de_placa.homologacao is
  'A consulta rodou no modo de teste do fornecedor: não foi cobrada e o '
  'retrato é o exemplo dele, de outra placa. Nunca serve para decidir compra.';
comment on column public.consultas_de_placa.retrato is
  'O retrato do carro, montado por lerRespostaDaApiBrasil '
  '(src/lib/consultaDePlaca.ts) por lista positiva de campos. SEM dado '
  'pessoal: nome e CPF de proprietário e de financiado não entram, e o CHECK '
  'consultas_de_placa_sem_dado_pessoal recusa as chaves. A resposta crua do '
  'fornecedor não é gravada em lugar nenhum.';
comment on column public.consultas_de_placa.custo is
  'O que o fornecedor cobrou por esta consulta, em reais, como ele informou '
  '(campo `tax`). Nulo se ele não disse; zero em homologação.';
comment on column public.consultas_de_placa.consultado_por is
  'auth.uid() de quem consultou. Com sessão, é o gatilho que grava.';
comment on column public.consultas_de_placa.consultado_por_nome is
  'Nome de quem consultou (autor_atual()), para continuar legível quando a '
  'pessoa sair da loja.';


-- ----------------------------------------------------------------------------
-- 2. O carimbo não é de quem chama
-- ----------------------------------------------------------------------------
create or replace function public.consultas_de_placa_carimbar()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  -- Com sessão (o painel, pelo PostgREST), autoria e hora são as da sessão,
  -- informe o cliente o que informar. Sem sessão (chave de serviço), os
  -- valores informados são aceitos.
  if auth.uid() is not null then
    new.org_id              := public.org_padrao();
    new.consultado_por      := auth.uid();
    new.consultado_por_nome := public.autor_atual();
    new.criado_em           := now();
  end if;
  return new;
end;
$$;

comment on function public.consultas_de_placa_carimbar() is
  'Gatilho de consultas_de_placa: com sessão, grava org, autor e hora pela '
  'sessão, e não pelo que o cliente mandou.';

drop trigger if exists consultas_de_placa_carimbo on public.consultas_de_placa;
create trigger consultas_de_placa_carimbo
  before insert on public.consultas_de_placa
  for each row execute function public.consultas_de_placa_carimbar();

revoke all on function public.consultas_de_placa_carimbar() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Privilégio e RLS
-- ----------------------------------------------------------------------------
revoke all on public.consultas_de_placa from public, anon, authenticated;
grant select, insert on public.consultas_de_placa to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.consultas_de_placa to service_role;

alter table public.consultas_de_placa enable row level security;

drop policy if exists consultas_de_placa_leitura  on public.consultas_de_placa;
drop policy if exists consultas_de_placa_inclusao on public.consultas_de_placa;

-- A linha "Consultar placa de veículo (consulta paga)" da matriz
-- (src/lib/permissoes.ts): Administrador, Gestor e Comercial. `tem_papel` já
-- exige conta ativa.
create policy consultas_de_placa_leitura on public.consultas_de_placa
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial'))
  );

create policy consultas_de_placa_inclusao on public.consultas_de_placa
  for insert to authenticated
  with check (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial'))
  );

comment on policy consultas_de_placa_leitura on public.consultas_de_placa is
  'Lê a consulta quem a matriz deixa consultar: Administrador, Gestor e Comercial, com conta ativa.';
comment on policy consultas_de_placa_inclusao on public.consultas_de_placa is
  'Inclui a consulta quem a matriz deixa consultar. Não há policy de UPDATE nem de DELETE: só inclusão.';


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. O efeito cria usuários de sonda (comercial,
-- gestor, marketing, um comercial desativado), veste a sessão de cada um e
-- tenta ler, incluir, editar, apagar e violar cada regra — num sub-bloco que
-- termina com um sentinela, e o rollback do sub-bloco leva tudo junto. As
-- variáveis sobrevivem ao rollback, e é por elas que o veredito sai.
do $aceite$
declare
  falhas          int := 0;
  v_nome          text;
  v_uid           uuid;
  v_papel         text;
  v_ids           jsonb := '{}'::jsonb;
  v_cli           uuid := gen_random_uuid();   -- authenticated sem perfil: cliente
  v_linha         public.consultas_de_placa;
  v_antes         bigint;
  v_depois        bigint;
  v_restou        bigint;
  v_n             bigint;
  v_retrato       jsonb := '{"placa": "ABC1D23", "veiculo": {"descricao": "ACEITE"}}'::jsonb;
  v_comercial_ok  boolean := false;
  v_carimbo_ok    boolean := false;
  v_gestor_le     bigint := -1;
  v_negados       int := 0;      -- marketing, desativado, cliente: inclusão
  v_cegos         int := 0;      -- marketing, desativado, cliente: leitura vazia
  v_anon          text := 'não testado';
  v_edita         text := 'não testado';
  v_apaga         text := 'não testado';
  v_regras_certas int := 0;
  v_regras        int := 0;
  v_caso          record;
  v_msg           text;
begin
  -- 1 · A tabela, com RLS e comentário.
  if not exists (select 1 from pg_class
                  where oid = 'public.consultas_de_placa'::regclass and relrowsecurity) then
    raise exception 'ACEITE FALHOU: consultas_de_placa sem RLS';
  end if;
  if obj_description('public.consultas_de_placa'::regclass, 'pg_class') is null then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_placa sem comentário';
  end if;

  -- 2 · As seis regras existem com nome, são CHECK e estão validadas.
  foreach v_nome in array array[
    'consultas_de_placa_placa_valida',
    'consultas_de_placa_produto_conhecido',
    'consultas_de_placa_custo_valido',
    'consultas_de_placa_retrato_e_objeto',
    'consultas_de_placa_retrato_da_placa',
    'consultas_de_placa_sem_dado_pessoal'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.consultas_de_placa'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;

  -- 3 · Privilégio: anon nada; authenticated lê e inclui, e só.
  if has_table_privilege('anon', 'public.consultas_de_placa', 'SELECT')
     or has_table_privilege('anon', 'public.consultas_de_placa', 'INSERT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon tem privilégio em consultas_de_placa';
  end if;
  if not has_table_privilege('authenticated', 'public.consultas_de_placa', 'SELECT')
     or not has_table_privilege('authenticated', 'public.consultas_de_placa', 'INSERT')
     or has_table_privilege('authenticated', 'public.consultas_de_placa', 'UPDATE')
     or has_table_privilege('authenticated', 'public.consultas_de_placa', 'DELETE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated deveria ter SELECT e INSERT, e só eles';
  end if;

  -- 4 · As duas policies, e nenhuma outra (uma permissiva a mais abriria por OU).
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'consultas_de_placa';
  if v_n <> 2 or not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'consultas_de_placa'
                                and policyname = 'consultas_de_placa_leitura' and cmd = 'SELECT')
     or not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'consultas_de_placa'
                       and policyname = 'consultas_de_placa_inclusao' and cmd = 'INSERT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: esperado exatamente as policies de leitura e de inclusão (achei %)', v_n;
  end if;

  -- 5 · O gatilho de carimbo: BEFORE INSERT, por linha, ligado.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.consultas_de_placa'::regclass
                    and tgname  = 'consultas_de_placa_carimbo'
                    and tgfoid  = 'public.consultas_de_placa_carimbar()'::regprocedure
                    and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 4 = 4
                    and tgenabled <> 'D') then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_placa_carimbo não é BEFORE INSERT por linha';
  end if;

  select count(*) into v_antes from public.consultas_de_placa;

  -- 6 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    foreach v_papel in array array['comercial', 'gestor', 'marketing', 'desativado'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-placa-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite Placa ' || v_papel,
             papeis    = array[case when v_papel = 'desativado' then 'comercial' else v_papel end],
             role      = case when v_papel = 'desativado' then 'comercial' else v_papel end,
             is_active = (v_papel <> 'desativado')
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    -- 6a · anon não lê.
    begin
      set local role anon;
      perform 1 from public.consultas_de_placa limit 1;
      reset role;
      v_anon := 'leu';
    exception when insufficient_privilege then v_anon := 'negado';
    end;

    -- 6b · O comercial inclui, e o carimbo é o da sessão: autor forjado,
    --      hora forjada e org forjada são trocados pelos de verdade.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.consultas_de_placa
        (placa, produto, retrato, custo, consultado_por, consultado_por_nome, criado_em)
      values ('ABC1D23', 'veiculos-total', v_retrato, 30,
              (v_ids->>'gestor')::uuid, 'Outra Pessoa', now() - interval '30 days')
      returning * into v_linha;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_comercial_ok := true;
      v_carimbo_ok := v_linha.consultado_por = (v_ids->>'comercial')::uuid
                      and v_linha.consultado_por_nome = 'Aceite Placa comercial'
                      and v_linha.criado_em > now() - interval '1 minute'
                      and v_linha.org_id = public.org_padrao();
    exception when insufficient_privilege then v_comercial_ok := false;
    end;

    -- 6c · O gestor lê a linha do comercial.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'gestor')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_gestor_le from public.consultas_de_placa where placa = 'ABC1D23';
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_gestor_le := -2;
    end;

    -- 6d · Marketing, comercial desativado e cliente: não leem e não incluem.
    foreach v_uid in array array[(v_ids->>'marketing')::uuid, (v_ids->>'desativado')::uuid, v_cli] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        select count(*) into v_n from public.consultas_de_placa;
        reset role;
        perform set_config('request.jwt.claims', '', true);
        if v_n = 0 then v_cegos := v_cegos + 1; end if;
      exception when insufficient_privilege then v_cegos := v_cegos + 1;
      end;
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        insert into public.consultas_de_placa (placa, produto, retrato)
        values ('ABC1D23', 'veiculos-total', v_retrato);
        reset role;
        perform set_config('request.jwt.claims', '', true);
      exception when insufficient_privilege then v_negados := v_negados + 1;
      end;
    end loop;

    -- 6e · Nem quem incluiu edita ou apaga: 42501, não "0 linhas".
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.consultas_de_placa set custo = 0 where id = v_linha.id;
      reset role;
      v_edita := 'editou';
    exception when insufficient_privilege then v_edita := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      delete from public.consultas_de_placa where id = v_linha.id;
      reset role;
      v_apaga := 'apagou';
    exception when insufficient_privilege then v_apaga := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- 6f · Cada regra, tentando gravar o inválido (sem sessão: só o CHECK fala).
    for v_caso in
      select * from (values
        ('consultas_de_placa_placa_valida',      'abc1d23', 'veiculos-total', 1::numeric, false, '{"placa": "abc1d23"}'::jsonb),
        ('consultas_de_placa_placa_valida',      'ABC-1D23', 'veiculos-total', 1, false, '{"placa": "ABC-1D23"}'),
        ('consultas_de_placa_placa_valida',      'AB12345', 'veiculos-total', 1, false, '{"placa": "AB12345"}'),
        ('consultas_de_placa_produto_conhecido', 'ABC1D23', 'outro-produto',  1, false, '{"placa": "ABC1D23"}'),
        ('consultas_de_placa_custo_valido',      'ABC1D23', 'veiculos-total', -1, false, '{"placa": "ABC1D23"}'),
        ('consultas_de_placa_retrato_e_objeto',  'ABC1D23', 'veiculos-total', 1, true,  '[]'),
        ('consultas_de_placa_retrato_da_placa',  'ABC1D23', 'veiculos-total', 1, false, '{"placa": "XYZ9Z99"}'),
        ('consultas_de_placa_sem_dado_pessoal',  'ABC1D23', 'veiculos-total', 1, false,
           '{"placa": "ABC1D23", "baseEstadual": {"pronome": "FULANO"}}'),
        ('consultas_de_placa_sem_dado_pessoal',  'ABC1D23', 'veiculos-total', 1, false,
           '{"placa": "ABC1D23", "gravames": [{"documentoFinanciado": "000.000.000-00"}]}'),
        ('consultas_de_placa_sem_dado_pessoal',  'ABC1D23', 'veiculos-total', 1, false,
           '{"placa": "ABC1D23", "historico": [{"proprietario": "FULANO", "cpfCnpj": "0"}]}'),
        ('consultas_de_placa_sem_dado_pessoal',  'ABC1D23', 'veiculos-total', 1, false,
           '{"placa": "ABC1D23", "user": {"email": "a@b.c"}}')
      ) as t(regra, placa, produto, custo, homologacao, retrato)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.consultas_de_placa (placa, produto, custo, homologacao, retrato)
        values (v_caso.placa, v_caso.produto, v_caso.custo, v_caso.homologacao, v_caso.retrato);
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_regras_certas := v_regras_certas + 1; end if;
      end;
    end loop;

    raise exception 'DESFAZER_ACEITE_PLACA' using errcode = 'PCP01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PCP01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'comercial' is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários — nada foi provado';
  end if;
  if v_anon <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon — leitura %', v_anon;
  end if;
  if not v_comercial_ok or not v_carimbo_ok then
    falhas := falhas + 1;
    raise warning 'FALHOU: comercial incluiu: %; carimbo da sessão: %', v_comercial_ok, v_carimbo_ok;
  end if;
  if v_gestor_le <> 1 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o gestor viu % linha(s) da placa de sonda (esperado 1; -2 = sem SELECT)', v_gestor_le;
  end if;
  if v_cegos <> 3 or v_negados <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: marketing, desativado e cliente — % de 3 sem leitura, % de 3 sem inclusão', v_cegos, v_negados;
  end if;
  if v_edita <> 'negado' or v_apaga <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: só inclusão — update %, delete % (esperado 42501 nos dois)', v_edita, v_apaga;
  end if;
  if v_regras < 11 or v_regras_certas <> v_regras then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % de % recusas pela regra certa', v_regras_certas, v_regras;
  end if;

  -- Nada da prova ficou.
  select count(*) into v_depois from public.consultas_de_placa;
  select count(*) into v_restou from auth.users where email like 'aceite-placa-%@exemplo.invalido';
  if v_depois <> v_antes or v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (linhas % → %, % usuário(s))', v_antes, v_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em consultas_de_placa', falhas;
  end if;

  raise notice
    'Aceite verificado: consultas_de_placa existe com as seis regras nomeadas, '
    'RLS e gatilho de carimbo; anon não lê; comercial inclui e o carimbo é o da '
    'sessão; gestor lê; marketing, comercial desativado e cliente não leem nem '
    'incluem; ninguém edita nem apaga (42501); placa fora da máscara, produto '
    'desconhecido, custo negativo, retrato que não é objeto, retrato de outra '
    'placa e as chaves de dado pessoal caem na regra certa; a prova não deixou '
    'rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261006180000', 'consultas_de_placa')
  on conflict (version) do nothing;
