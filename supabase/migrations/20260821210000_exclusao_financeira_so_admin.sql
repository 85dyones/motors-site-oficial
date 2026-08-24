-- ---------------------------------------------------------------------------
-- Quem aprova não apaga a prova do que aprovou.
--
-- Decisão do dono em 2026-08-21, ao definir que o Gestor é quem aprova
-- pagamento no dia a dia: exclusão de LANÇAMENTO financeiro passa a ser
-- exclusiva do Admin. Gestor e Financeiro cancelam — `status = 'cancelado'`
-- já existe, preserva a linha e o rastro.
--
-- É separação de funções clássica, e o motivo é concreto: hoje a mesma pessoa
-- que libera um agendamento pode, em seguida, apagar a conta, a movimentação
-- de caixa que a baixa gerou e a trilha da própria decisão
-- (`aprovacao_decidida_por/em/motivo` mora na linha de `contas`). Some tudo
-- junto, sem log, e a conciliação do mês seguinte não tem como perceber.
--
-- ---------------------------------------------------------------------------
-- O recorte: lançamento ≠ cadastro
-- ---------------------------------------------------------------------------
-- Fecham (são registro de DINHEIRO que aconteceu ou vai acontecer):
--   `contas`, `movimentacoes`, `compras_produtos`, `movimentacoes_investidor`.
--
-- Continuam como estão (são cadastro ou modelo, não dinheiro):
--   `parceiros`, `categorias_financeiras`, `despesas_recorrentes`,
--   `investidores`. Apagar o modelo de uma despesa recorrente não apaga
--   nenhuma conta já gerada por ele; e `investidores` já é indelével quando
--   tem movimentação (FK sem ON DELETE, 20260821120000).
--
-- ---------------------------------------------------------------------------
-- `is_admin` também lia `role` — o terceiro gêmeo do bug multi-papel
-- ---------------------------------------------------------------------------
-- A função vem do bootstrap de 2026-08-03 e nunca foi versionada. Ela diz
-- `role = 'admin'`, e `role` é espelho de `papeis[1]` desde
-- `20260819150000`: quem tem `papeis = {comercial, admin}` carrega
-- `role = 'comercial'` e NÃO é admin para o banco. Isso já valia hoje para as
-- policies de `profiles` (um admin secundário não conseguia gerenciar
-- perfis); daqui em diante valeria também para a exclusão financeira — o
-- admin de verdade levaria "acesso proibido" ao tentar apagar. Corrigida
-- aqui, junto, porque é dela que as policies novas dependem.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. is_admin por papéis
-- ---------------------------------------------------------------------------

create or replace function public.is_admin(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and 'admin' = any(papeis)
  );
$$ language sql security definer set search_path = public;

comment on function public.is_admin(uuid) is
  'É admin e está ativo. Desde 2026-08-21 olha `papeis`, não `role` — quem '
  'tem admin como papel secundário era negado em silêncio. Versionada pela '
  'primeira vez nesta data; antes vivia só no bootstrap.';

-- ---------------------------------------------------------------------------
-- 2. As quatro tabelas de lançamento: escrita do financeiro, exclusão do admin
-- ---------------------------------------------------------------------------
-- A policy `FOR ALL` de cada uma é trocada por três: SELECT, INSERT e UPDATE
-- seguem em `has_finance_access`; DELETE passa a exigir `is_admin`. Sem
-- policy de DELETE para o financeiro, o Postgres simplesmente não apaga —
-- não existe "quase apagou".

do $$
declare
  t text;
begin
  foreach t in array array['contas', 'movimentacoes', 'compras_produtos', 'movimentacoes_investidor']
  loop
    -- Os nomes vêm do bootstrap (inglês) e da migração dos investidores
    -- (português); derrubar pelo nome exato de cada uma seria uma lista que
    -- envelhece, então varre o catálogo e limpa toda policy da tabela.
    execute (
      select coalesce(string_agg(format('drop policy if exists %I on public.%I;', policyname, t), ' '), '')
        from pg_policies
       where schemaname = 'public' and tablename = t
    );

    execute format(
      'create policy "Financeiro le %1$s" on public.%1$I
         for select using (public.has_finance_access(auth.uid()));', t);
    execute format(
      'create policy "Financeiro lanca em %1$s" on public.%1$I
         for insert with check (public.has_finance_access(auth.uid()));', t);
    execute format(
      'create policy "Financeiro corrige %1$s" on public.%1$I
         for update using (public.has_finance_access(auth.uid()))
                    with check (public.has_finance_access(auth.uid()));', t);
    -- A linha desta migração: só o Admin apaga.
    execute format(
      'create policy "Somente admin apaga %1$s" on public.%1$I
         for delete using (public.is_admin(auth.uid()));', t);
  end loop;
end $$;

-- A policy de leitura própria do investidor foi derrubada junto com as
-- outras de `movimentacoes_investidor` — recriada aqui, idêntica à de
-- `20260821180000`. Ela não some do histórico: some da tabela, e voltar a
-- pô-la de pé é parte desta migração.
create policy "Investidor le o proprio extrato" on public.movimentacoes_investidor
  for select
  using (
    exists (
      select 1 from public.investidores i
       where i.id = movimentacoes_investidor.investidor_id
         and i.perfil_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
-- Prova, com sessão assumida de verdade:
--   a) o Financeiro lança e CANCELA, mas não apaga;
--   b) o Gestor — que aprovou — também não apaga;
--   c) o Admin apaga;
--   d) admin como papel SECUNDÁRIO conta como admin (o bug corrigido acima).

do $ac$
declare
  v_fin uuid;
  v_gestor uuid;
  v_admin2 uuid;
  v_conta uuid;
  qtd int;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-del-fin@exemplo.invalido', now(), now())
  returning id into v_fin;
  update public.profiles set papeis = array['financeiro'] where id = v_fin;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-del-gestor@exemplo.invalido', now(), now())
  returning id into v_gestor;
  update public.profiles set papeis = array['gestor'] where id = v_gestor;

  -- Admin como SEGUNDO papel: `role` espelha 'comercial'.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-del-admin2@exemplo.invalido', now(), now())
  returning id into v_admin2;
  update public.profiles set papeis = array['comercial', 'admin'] where id = v_admin2;
  if not public.is_admin(v_admin2) then
    raise exception 'ACEITE FALHOU: admin como papel secundário não é admin — a função ainda lê role?';
  end if;

  insert into public.contas (tipo, descricao, valor, data_vencimento, status)
  values ('pagar', 'Autoconf exclusão', 1234, current_date, 'pendente')
  returning id into v_conta;

  -- ---- (a) o Financeiro ------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- Cancelar é o caminho que sobra, e ele precisa continuar aberto.
  update public.contas set status = 'cancelado' where id = v_conta;
  get diagnostics qtd = row_count;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o financeiro não conseguiu CANCELAR (% linhas)', qtd;
  end if;

  delete from public.contas where id = v_conta;
  get diagnostics qtd = row_count;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: o financeiro apagou lançamento';
  end if;

  reset role;

  -- ---- (b) o Gestor ----------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_gestor, 'role', 'authenticated')::text, true);
  set local role authenticated;

  delete from public.contas where id = v_conta;
  get diagnostics qtd = row_count;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: o gestor apagou o lançamento que ele mesmo aprova';
  end if;

  reset role;

  -- ---- (c) e (d) o Admin (secundário) ----------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin2, 'role', 'authenticated')::text, true);
  set local role authenticated;

  delete from public.contas where id = v_conta;
  get diagnostics qtd = row_count;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o admin não conseguiu apagar (% linhas)', qtd;
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from public.contas where id = v_conta;
  delete from public.profiles where id in (v_fin, v_gestor, v_admin2);
  delete from auth.users where id in (v_fin, v_gestor, v_admin2);

  raise notice 'Aceite verificado: financeiro e gestor cancelam mas não apagam; admin (inclusive secundário) apaga.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260821210000', 'exclusao_financeira_so_admin')
  on conflict (version) do nothing;
