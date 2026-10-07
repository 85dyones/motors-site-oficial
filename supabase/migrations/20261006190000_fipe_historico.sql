-- ============================================================================
-- O histórico da FIPE por modelo — a primeira análise de compra, sem custo
-- ============================================================================
-- Pedido do dono (2026-10-06), depois da consulta por placa: "algo que seja
-- 100% grátis para uma primeira análise, apenas pra compra, tendência de
-- modelo por conta de valor de mercado". A aba "Por modelo" de
-- `/admin/consulta-placa` mostra para onde vai a tabela de um modelo, lendo a
-- API pública da FIPE que o site já usa.
--
-- O histórico pronto dessa API é do plano pago. No gratuito, cada consulta de
-- valor aceita o mês de referência, então a série se monta com uma chamada
-- por mês, e o token da loja tem teto diário. Mês passado não muda nunca:
-- esta tabela guarda cada valor lido, e ele não é pedido de novo.
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.fipe_historico` — uma linha por (modelo, ano-modelo, mês de
--    referência). `valor` nulo é resposta, e não falta: naquele mês a FIPE
--    ainda não tinha aquele ano-modelo, e guardar isso evita perguntar de novo.
-- 2. RLS: lê e inclui quem consulta placa (Administrador, Gestor, Comercial).
--
-- A chave do modelo são os CÓDIGOS da API da FIPE (`marca_codigo`,
-- `modelo_codigo`, `ano` no formato "2022-1"), os mesmos que a cascata de
-- seleção da `/avaliacao` devolve: com eles a tabela responde antes de
-- qualquer chamada à FIPE. O código FIPE oficial ("005528-0") e os nomes vão
-- junto para a linha continuar legível.
--
-- Não há dado de pessoa nem de cliente aqui: é tabela pública de preço.
--
-- ---------------------------------------------------------------------------
-- Só inclusão
-- ---------------------------------------------------------------------------
-- Valor de mês publicado não se corrige: `authenticated` recebe SELECT e
-- INSERT. Duas pessoas lendo o mesmo mês ao mesmo tempo esbarram na
-- unicidade, e a segunda inclusão é ignorada (`on conflict do nothing`).
--
-- ---------------------------------------------------------------------------
-- As regras
-- ---------------------------------------------------------------------------
--   fipe_historico_tipo_valido ........... carros, motos ou caminhoes
--   fipe_historico_codigos_validos ....... marca e modelo só dígitos; ano "AAAA-N"
--   fipe_historico_referencia_e_mes ...... a referência é o dia 1º do mês
--   fipe_historico_valor_valido .......... nulo ou maior que zero
--   fipe_historico_um_por_mes ............ (org, tipo, marca, modelo, ano, mês)
--
-- ⚠️ DESFAZER (nada mais depende destes objetos):
--
--   begin;
--   drop table if exists public.fipe_historico;
--   delete from supabase_migrations.schema_migrations where version = '20261006190000';
--   commit;
--
-- Aditiva (tabela nova; nada em tabela existente) e idempotente.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia
-- ----------------------------------------------------------------------------
do $previa$
begin
  if to_regprocedure('public.tem_papel(uuid, text)') is null
     or to_regprocedure('public.org_padrao()') is null then
    raise exception 'DEPENDÊNCIA: falta tem_papel(uuid, text) ou org_padrao(). Nada foi aplicado.';
  end if;
  if public.org_padrao() is null then
    raise exception 'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. A tabela
-- ----------------------------------------------------------------------------
create table if not exists public.fipe_historico (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.org_padrao(),
  tipo           text not null,
  marca_codigo   text not null,
  modelo_codigo  text not null,
  ano            text not null,
  referencia     date not null,
  valor          numeric(12,2),
  codigo_fipe    text,
  marca          text,
  modelo         text,
  combustivel    text,
  criado_em      timestamptz not null default now(),

  constraint fipe_historico_tipo_valido
    check (tipo in ('carros', 'motos', 'caminhoes')),
  constraint fipe_historico_codigos_validos
    check (marca_codigo ~ '^[0-9]{1,6}$' and modelo_codigo ~ '^[0-9]{1,6}$' and ano ~ '^[0-9]{4}-[0-9]{1,2}$'),
  constraint fipe_historico_referencia_e_mes
    check (extract(day from referencia) = 1),
  constraint fipe_historico_valor_valido
    check (valor is null or valor > 0),
  constraint fipe_historico_um_por_mes
    unique (org_id, tipo, marca_codigo, modelo_codigo, ano, referencia)
);

-- "Modelos já consultados": os mais recentes primeiro.
create index if not exists fipe_historico_recentes_idx
  on public.fipe_historico (org_id, criado_em desc);

comment on table public.fipe_historico is
  'Valores da tabela FIPE por (modelo, ano-modelo, mês de referência), lidos '
  'da API pública pelo token gratuito da loja (2026-10-06). É o que deixa a '
  'aba "Por modelo" de /admin/consulta-placa montar a série sem gastar o teto '
  'diário a cada abertura. Só inclusão. Sem dado de pessoa: é tabela pública '
  'de preço. Ver 20261006190000_fipe_historico.sql.';
comment on column public.fipe_historico.marca_codigo is
  'Código da marca na API da FIPE (o da cascata de seleção), só dígitos.';
comment on column public.fipe_historico.modelo_codigo is
  'Código do modelo na API da FIPE (o da cascata de seleção), só dígitos.';
comment on column public.fipe_historico.ano is
  'Ano-modelo e combustível como a API da FIPE os junta: "2022-1".';
comment on column public.fipe_historico.referencia is
  'O mês da tabela, sempre no dia 1º (2026-10-01 é a tabela de outubro/2026).';
comment on column public.fipe_historico.valor is
  'O preço médio daquele mês, em reais. NULO é resposta: naquele mês a FIPE '
  'ainda não tinha este ano-modelo, e a linha existe para não perguntar de novo.';
comment on column public.fipe_historico.codigo_fipe is
  'O código FIPE oficial do modelo ("005528-0"), quando a API o devolveu.';


-- ----------------------------------------------------------------------------
-- 2. Privilégio e RLS
-- ----------------------------------------------------------------------------
revoke all on public.fipe_historico from public, anon, authenticated;
grant select, insert on public.fipe_historico to authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.fipe_historico to service_role;

alter table public.fipe_historico enable row level security;

drop policy if exists fipe_historico_leitura  on public.fipe_historico;
drop policy if exists fipe_historico_inclusao on public.fipe_historico;

-- Os mesmos papéis da consulta de placa: a aba vive na mesma tela, e o teto
-- diário do token da FIPE é o mesmo da /avaliacao pública.
create policy fipe_historico_leitura on public.fipe_historico
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial'))
  );

create policy fipe_historico_inclusao on public.fipe_historico
  for insert to authenticated
  with check (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial'))
  );

comment on policy fipe_historico_leitura on public.fipe_historico is
  'Lê o histórico quem consulta placa: Administrador, Gestor e Comercial, com conta ativa.';
comment on policy fipe_historico_inclusao on public.fipe_historico is
  'Inclui o mês lido quem consulta placa. Sem UPDATE nem DELETE: valor publicado não se corrige.';


-- ============================================================================
-- Autoconferência
-- ============================================================================
do $aceite$
declare
  falhas        int := 0;
  v_nome        text;
  v_uid         uuid;
  v_papel       text;
  v_ids         jsonb := '{}'::jsonb;
  v_antes       bigint;
  v_depois      bigint;
  v_restou      bigint;
  v_n           bigint;
  v_inclui      boolean := false;
  v_repete      text := 'não testado';
  v_gestor_le   bigint := -1;
  v_marketing   text := 'não testado';
  v_mkt_le      bigint := -1;
  v_anon        text := 'não testado';
  v_edita       text := 'não testado';
  v_apaga       text := 'não testado';
  v_regras      int := 0;
  v_certas      int := 0;
  v_caso        record;
  v_msg         text;
begin
  if not exists (select 1 from pg_class where oid = 'public.fipe_historico'::regclass and relrowsecurity) then
    raise exception 'ACEITE FALHOU: fipe_historico sem RLS';
  end if;

  foreach v_nome in array array[
    'fipe_historico_tipo_valido', 'fipe_historico_codigos_validos',
    'fipe_historico_referencia_e_mes', 'fipe_historico_valor_valido'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.fipe_historico'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.fipe_historico'::regclass
                    and conname = 'fipe_historico_um_por_mes' and contype = 'u') then
    falhas := falhas + 1;
    raise warning 'FALHOU: unicidade fipe_historico_um_por_mes ausente';
  end if;

  if has_table_privilege('anon', 'public.fipe_historico', 'SELECT')
     or not has_table_privilege('authenticated', 'public.fipe_historico', 'SELECT')
     or not has_table_privilege('authenticated', 'public.fipe_historico', 'INSERT')
     or has_table_privilege('authenticated', 'public.fipe_historico', 'UPDATE')
     or has_table_privilege('authenticated', 'public.fipe_historico', 'DELETE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: privilégio — anon nada; authenticated SELECT e INSERT, e só';
  end if;

  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'fipe_historico';
  if v_n <> 2 then
    falhas := falhas + 1;
    raise warning 'FALHOU: esperado exatamente duas policies (achei %)', v_n;
  end if;

  select count(*) into v_antes from public.fipe_historico;

  -- Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    foreach v_papel in array array['comercial', 'gestor', 'marketing'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-fipe-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite Fipe ' || v_papel, papeis = array[v_papel], role = v_papel, is_active = true
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    begin
      set local role anon;
      perform 1 from public.fipe_historico limit 1;
      reset role;
      v_anon := 'leu';
    exception when insufficient_privilege then v_anon := 'negado';
    end;

    -- O comercial inclui um mês com valor e um "sem valor".
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.fipe_historico (tipo, marca_codigo, modelo_codigo, ano, referencia, valor, codigo_fipe)
      values ('carros', '999999', '999999', '2022-1', date '2026-10-01', 128430, '005528-0'),
             ('carros', '999999', '999999', '2022-1', date '2021-01-01', null, null);
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_inclui := true;
    exception when insufficient_privilege then v_inclui := false;
    end;

    -- O mesmo mês de novo: a unicidade segura, e `do nothing` passa calado.
    begin
      insert into public.fipe_historico (tipo, marca_codigo, modelo_codigo, ano, referencia, valor)
      values ('carros', '999999', '999999', '2022-1', date '2026-10-01', 1);
      v_repete := 'duplicou';
    exception when unique_violation then v_repete := 'recusou';
    end;
    insert into public.fipe_historico (tipo, marca_codigo, modelo_codigo, ano, referencia, valor)
    values ('carros', '999999', '999999', '2022-1', date '2026-10-01', 1)
    on conflict do nothing;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'gestor')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_gestor_le from public.fipe_historico where marca_codigo = '999999';
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_gestor_le := -2;
    end;

    -- Marketing não lê e não inclui.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_mkt_le from public.fipe_historico;
      insert into public.fipe_historico (tipo, marca_codigo, modelo_codigo, ano, referencia, valor)
      values ('carros', '999998', '1', '2022-1', date '2026-10-01', 1);
      reset role;
      v_marketing := 'incluiu';
    exception when insufficient_privilege then v_marketing := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- Nem quem incluiu edita ou apaga.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      update public.fipe_historico set valor = 1 where marca_codigo = '999999';
      reset role;
      v_edita := 'editou';
    exception when insufficient_privilege then v_edita := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      delete from public.fipe_historico where marca_codigo = '999999';
      reset role;
      v_apaga := 'apagou';
    exception when insufficient_privilege then v_apaga := 'negado';
    end;
    perform set_config('request.jwt.claims', '', true);

    -- Cada regra, tentando gravar o inválido.
    for v_caso in
      select * from (values
        ('fipe_historico_tipo_valido',      'barcos', '1',   '1', '2022-1', date '2026-10-01', 1::numeric),
        ('fipe_historico_codigos_validos',  'carros', 'abc', '1', '2022-1', date '2026-10-01', 1),
        ('fipe_historico_codigos_validos',  'carros', '1',   '1', '2022',   date '2026-10-01', 1),
        ('fipe_historico_codigos_validos',  'carros', '1',   '1/../x', '2022-1', date '2026-10-01', 1),
        ('fipe_historico_referencia_e_mes', 'carros', '1',   '1', '2022-1', date '2026-10-15', 1),
        ('fipe_historico_valor_valido',     'carros', '1',   '1', '2022-1', date '2026-10-01', 0),
        ('fipe_historico_valor_valido',     'carros', '1',   '1', '2022-1', date '2026-10-01', -5)
      ) as t(regra, tipo, marca, modelo, ano, referencia, valor)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.fipe_historico (tipo, marca_codigo, modelo_codigo, ano, referencia, valor)
        values (v_caso.tipo, v_caso.marca, v_caso.modelo, v_caso.ano, v_caso.referencia, v_caso.valor);
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_certas := v_certas + 1; end if;
      end;
    end loop;

    raise exception 'DESFAZER_ACEITE_FIPE' using errcode = 'PFH01';
  exception
    when sqlstate 'PFH01' then null;
  end;

  if v_ids->>'comercial' is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários — nada foi provado';
  end if;
  if v_anon <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon — leitura %', v_anon;
  end if;
  if not v_inclui or v_gestor_le <> 2 then
    falhas := falhas + 1;
    raise warning 'FALHOU: comercial incluiu: %; o gestor viu % linha(s) (esperado 2)', v_inclui, v_gestor_le;
  end if;
  if v_repete <> 'recusou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o mesmo mês duas vezes: %', v_repete;
  end if;
  if v_marketing <> 'negado' or v_mkt_le <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: marketing — inclusão %, leu % linha(s)', v_marketing, v_mkt_le;
  end if;
  if v_edita <> 'negado' or v_apaga <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: só inclusão — update %, delete %', v_edita, v_apaga;
  end if;
  if v_regras < 7 or v_certas <> v_regras then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % de % recusas pela regra certa', v_certas, v_regras;
  end if;

  select count(*) into v_depois from public.fipe_historico;
  select count(*) into v_restou from auth.users where email like 'aceite-fipe-%@exemplo.invalido';
  if v_depois <> v_antes or v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (linhas % → %, % usuário(s))', v_antes, v_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em fipe_historico', falhas;
  end if;

  raise notice
    'Aceite verificado: fipe_historico existe com as quatro regras nomeadas, a '
    'unicidade por mês e RLS; anon não lê; comercial inclui mês com valor e mês '
    'sem valor; o mesmo mês não entra duas vezes; gestor lê; marketing não lê '
    'nem inclui; ninguém edita nem apaga; tipo, códigos, referência fora do dia '
    '1º e valor não positivo caem na regra certa; a prova não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261006190000', 'fipe_historico')
  on conflict (version) do nothing;
