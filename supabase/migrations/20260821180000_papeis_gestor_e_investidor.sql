-- ---------------------------------------------------------------------------
-- Dois papéis novos: `gestor` e `investidor`.
--
-- Pedido do dono em 2026-08-21, no mesmo dia em que a alçada de R$ 1.500 foi
-- desfeita: *"essa regra de 1.500 reais não faz sentido no financeiro,
-- precisamos de duas novas roles também, investidor e gestor, que terá o
-- poder de aprovar os agendamentos financeiro, ajustar valores de negócios de
-- carro, entrada e saída, bem como acesso aos relatórios"*.
--
-- ---------------------------------------------------------------------------
-- Os dois papéis não são da mesma natureza — e é essa a decisão do arquivo
-- ---------------------------------------------------------------------------
-- `gestor` é papel DE PAINEL: entra em `PERFIS`, na matriz A17, em
-- `is_staff()` e em `has_finance_access()`. Ele aprova agendamento, mexe no
-- preço e no custo do carro, lê relatório.
--
-- `investidor` é papel FORA DO PAINEL, como `cliente` (2026-08-13): existe no
-- `auth`, mas nunca é staff. Ele não opera a loja — acompanha o próprio
-- dinheiro em `/investidor`, do mesmo jeito que o cliente acompanha o próprio
-- carro na Garagem. Fosse ele um perfil de painel, herdaria por engano tudo
-- que as telas liberam "para quem está logado no /admin".
--
-- A consequência prática é a regra 2-b do CLAUDE.md aplicada de novo: o
-- investidor é `authenticated` e precisa LER a tabela do financeiro — mas só
-- a linha dele. Daí `investidores.perfil_id` e as duas policies de leitura
-- própria abaixo. Sem o vínculo, "o painel do investidor" só existiria com
-- chave de serviço, e chave de serviço não tem dono: qualquer erro de filtro
-- entregaria o extrato de um sócio ao outro.
--
-- ---------------------------------------------------------------------------
-- O que NÃO muda aqui
-- ---------------------------------------------------------------------------
-- A régua de quando um lançamento espera aprovação saiu do valor e virou o
-- ato (agendar × registrar). Isso é decisão de aplicação e mora em
-- `src/lib/alcada.ts`, consultando a matriz — o banco continua guardando só
-- o estado (`aguardando_aprovacao`) e a trilha, criados em `20260821150000`.
-- Nenhuma coluna de valor foi criada para a alçada, e por isso não há nada
-- para remover.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. O vocabulário de papéis
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor'));

-- A régua do array acompanha a do singular, senão os dois discordam — o
-- motivo pelo qual `papeis_validos` existe desde 20260819150000.
create or replace function public.papeis_validos(p text[]) returns boolean
  language sql
  immutable
as $fn$
  select p is not null
     and array_length(p, 1) >= 1
     and p <@ array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor']
     and array_length(p, 1) = (select count(distinct x) from unnest(p) x);
$fn$;

comment on function public.papeis_validos(text[]) is
  'Régua de conteúdo de profiles.papeis: não vazio, só papéis conhecidos, sem '
  'repetição. Desde 2026-08-21 conhece `gestor` (painel) e `investidor` '
  '(fora do painel, como cliente). Espelha PERFIS + PAPEIS_FORA_DO_PAINEL '
  'de src/lib/permissoes.ts — tests/papeis-gestor-investidor.test.ts trava os '
  'dois lados.';

-- ---------------------------------------------------------------------------
-- 2. Quem é staff, e quem abre o financeiro
-- ---------------------------------------------------------------------------

-- `gestor` entra; `investidor` NÃO — é o ponto inteiro da separação.
create or replace function public.is_staff(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'gestor', 'comercial', 'financeiro', 'marketing']
  );
$$ language sql security definer set search_path = public;

comment on function public.is_staff(uuid) is
  'Tem ALGUM papel de painel (admin/gestor/comercial/financeiro/marketing) e '
  'está ativo. `cliente` (Garagem) e `investidor` são authenticated, mas '
  'nunca staff por isso sozinho.';

-- O Gestor aprova agendamento e lê relatório: sem isto, a RLS do módulo o
-- deixaria de fora de tudo que ele precisa decidir.
create or replace function public.has_finance_access(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'gestor', 'financeiro']
  );
$$ language sql security definer set search_path = public;

comment on function public.has_finance_access(uuid) is
  'Tem papel admin, gestor ou financeiro e está ativo — a régua de TODO o RLS '
  'do módulo financeiro. Olha `papeis`, não `role` (2026-08-21).';

-- `handle_new_user` conhece o vocabulário novo. O papel segue vindo de
-- `app_metadata` (gravável só pela chave de serviço) e o padrão segue sendo
-- `cliente`: cadastro espontâneo NUNCA nasce gestor nem investidor.
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    case
      when new.raw_app_meta_data->>'role'
           in ('admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor')
        then new.raw_app_meta_data->>'role'
      else 'cliente'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 3. O vínculo do investidor com a conta dele
-- ---------------------------------------------------------------------------

alter table public.investidores
  add column if not exists perfil_id uuid references public.profiles(id);

-- Um perfil não pode ser dois investidores: sem isto, `/investidor` teria que
-- escolher qual extrato mostrar, e escolheria em silêncio.
create unique index if not exists idx_investidores_perfil
  on public.investidores (perfil_id)
  where perfil_id is not null;

comment on column public.investidores.perfil_id is
  'A conta com que este investidor entra em /investidor. NULL enquanto ele '
  'só existe como registro financeiro — o vínculo é opcional de propósito: '
  'controlar o dinheiro de um sócio não exige dar login a ele.';

-- Leitura própria, e SÓ leitura: o investidor confere, nunca lança. Um
-- `for select` separado convive com a policy `for all` do financeiro —
-- policies do mesmo comando são OR.
drop policy if exists "Investidor le o proprio cadastro" on public.investidores;
create policy "Investidor le o proprio cadastro" on public.investidores
  for select
  using (perfil_id = auth.uid());

drop policy if exists "Investidor le o proprio extrato" on public.movimentacoes_investidor;
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
-- 4. Reivindicação do vínculo pelo e-mail
-- ---------------------------------------------------------------------------
-- Espelha `reivindicar_garagem()` (20260815180000, endurecida em
-- 20260818130000), inclusive na exigência que a endureceu: só reivindica quem
-- tem `email_confirmed_at`. A confirmação é a prova de posse que o vínculo
-- pressupõe — sem ela, a segurança dependeria de o cadastro público estar
-- fechado no painel, que é configuração e não código.
--
-- Existe para o financeiro não ter que digitar UUID: ele cadastra o
-- investidor com o e-mail certo, o Admin cria a conta com papel `investidor`,
-- e o vínculo se faz sozinho no primeiro acesso.

create or replace function public.reivindicar_investidor()
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_qtd   int;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('vinculados', 0);
  end if;

  if not exists (
       select 1 from auth.users u
        where u.id = auth.uid()
          and u.email_confirmed_at is not null
     ) then
    return jsonb_build_object('vinculados', 0, 'motivo', 'email_nao_confirmado');
  end if;

  -- `perfil_id` é único: uma conta ↔ um investidor. Havendo mais de um
  -- cadastro sem vínculo no mesmo e-mail, pega o mais antigo e o resto fica
  -- para a loja resolver — e quem já está vinculado não reivindica outro.
  update public.investidores i
     set perfil_id = auth.uid()
   where i.id = (
           select i2.id from public.investidores i2
            where i2.perfil_id is null
              and i2.email is not null
              and lower(i2.email) = v_email
            order by i2.created_at
            limit 1
         )
     and not exists (
           select 1 from public.investidores i3 where i3.perfil_id = auth.uid()
         );

  get diagnostics v_qtd = row_count;
  return jsonb_build_object('vinculados', v_qtd);
end;
$function$;

comment on function public.reivindicar_investidor() is
  'Liga a conta do Auth ao investidor pelo e-mail, e SÓ com e-mail '
  'confirmado. Gêmea de reivindicar_garagem() — mesma prova de posse.';

revoke all on function public.reivindicar_investidor() from public, anon;
grant execute on function public.reivindicar_investidor() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
-- Prova as quatro promessas contra o banco real:
--   a) gestor é staff e abre o financeiro;
--   b) investidor NÃO é staff e NÃO abre o financeiro;
--   c) o investidor logado lê o próprio extrato — e só ele;
--   d) e não consegue escrever nada.

do $ac$
declare
  v_gestor uuid;
  v_inv_uid uuid;
  v_inv_a uuid;
  v_inv_b uuid;
  qtd int;
begin
  -- ---- gestor ----------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-gestor@exemplo.invalido', now(), now())
  returning id into v_gestor;

  update public.profiles set papeis = array['gestor'] where id = v_gestor;
  if not public.is_staff(v_gestor) then
    raise exception 'ACEITE FALHOU: gestor não é staff';
  end if;
  if not public.has_finance_access(v_gestor) then
    raise exception 'ACEITE FALHOU: gestor não abriu o financeiro';
  end if;

  -- ---- investidor ------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-investidor@exemplo.invalido', now(), now())
  returning id into v_inv_uid;

  update public.profiles set papeis = array['investidor'] where id = v_inv_uid;
  if public.is_staff(v_inv_uid) then
    raise exception 'ACEITE FALHOU: investidor virou staff';
  end if;
  if public.has_finance_access(v_inv_uid) then
    raise exception 'ACEITE FALHOU: investidor abriu o módulo financeiro';
  end if;

  -- Dois investidores, um deles ligado à conta acima.
  insert into public.investidores (nome, perfil_id) values ('Autoconf A', v_inv_uid)
    returning id into v_inv_a;
  insert into public.investidores (nome) values ('Autoconf B')
    returning id into v_inv_b;
  insert into public.movimentacoes_investidor (investidor_id, tipo, valor, descricao)
  values (v_inv_a, 'aporte', 1000, 'aporte do A'),
         (v_inv_b, 'aporte', 5000, 'aporte do B');

  -- ---- vira o investidor A --------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_inv_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into qtd from public.investidores;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: investidor enxerga % cadastros, deveria ser 1', qtd;
  end if;

  select count(*) into qtd from public.movimentacoes_investidor;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: investidor enxerga % movimentações, deveria ser 1 (a dele)', qtd;
  end if;

  -- (d) confere, não lança.
  begin
    insert into public.movimentacoes_investidor (investidor_id, tipo, valor, descricao)
    values (v_inv_a, 'aporte', 999, 'lançado pelo próprio investidor');
    raise exception 'ACEITE FALHOU: investidor gravou movimentação';
  exception
    when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ---- (e) o vínculo por e-mail exige e-mail confirmado ----------------
  -- A conta sintética foi criada sem `email_confirmed_at`, e o cadastro B
  -- está no mesmo e-mail dela: a reivindicação tem que recusar.
  update public.investidores set email = 'autoconf-investidor@exemplo.invalido',
                                 perfil_id = null
   where id = v_inv_b;
  update public.investidores set perfil_id = null where id = v_inv_a;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_inv_uid, 'role', 'authenticated',
                      'email', 'autoconf-investidor@exemplo.invalido')::text, true);
  if (public.reivindicar_investidor() ->> 'motivo') is distinct from 'email_nao_confirmado' then
    raise exception 'ACEITE FALHOU: reivindicou vínculo sem e-mail confirmado';
  end if;

  -- Com o e-mail confirmado, o vínculo se faz.
  update auth.users set email_confirmed_at = now() where id = v_inv_uid;
  if (public.reivindicar_investidor() ->> 'vinculados')::int <> 1 then
    raise exception 'ACEITE FALHOU: e-mail confirmado não reivindicou o vínculo';
  end if;

  perform set_config('request.jwt.claims', '', true);

  -- ---- limpeza ---------------------------------------------------------
  delete from public.movimentacoes_investidor where investidor_id in (v_inv_a, v_inv_b);
  delete from public.investidores where id in (v_inv_a, v_inv_b);
  delete from public.profiles where id in (v_gestor, v_inv_uid);
  delete from auth.users where id in (v_gestor, v_inv_uid);

  raise notice 'Aceite verificado: gestor é staff com financeiro, investidor não é staff e lê só o próprio extrato.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260821180000', 'papeis_gestor_e_investidor')
  on conflict (version) do nothing;
