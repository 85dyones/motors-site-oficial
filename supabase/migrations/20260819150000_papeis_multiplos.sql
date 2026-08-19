-- ---------------------------------------------------------------------------
-- Um usuário pode ter mais de um papel.
--
-- Pedido do dono em 2026-08-19, como pré-requisito para cadastrar os
-- vendedores: numa loja deste tamanho a mesma pessoa vende e cuida do
-- financeiro, ou vende e é admin. Com `role` singular, cadastrá-la obrigava a
-- escolher qual metade do trabalho ela poderia fazer no sistema.
--
-- ---------------------------------------------------------------------------
-- Por que `role` NÃO morre aqui
-- ---------------------------------------------------------------------------
-- 70 pontos do código leem `profiles.role`. Trocar tudo de uma vez, num
-- sistema em produção com deploy separado do banco, cria uma janela em que o
-- banco já mudou e o código ainda não — e nessa janela ninguém entra no
-- painel.
--
-- Então `role` permanece como **papel primário**, mantido em sincronia por
-- trigger: é sempre `papeis[1]`. Código velho continua funcionando e enxerga o
-- papel principal; código novo lê `papeis` e enxerga todos. A migração do
-- código pode acontecer depois, sem pressa e sem janela.
--
-- ---------------------------------------------------------------------------
-- A ordem importa, e é decisão de produto
-- ---------------------------------------------------------------------------
-- `papeis[1]` é o papel primário porque é o que aparece em tela quando só cabe
-- um nome, e o que o código antigo enxerga. Quem edita na A17 escolhe a ordem.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists papeis text[];

-- Retrato do que existe: cada perfil ganha o array com o papel que já tinha.
update public.profiles
   set papeis = array[role]
 where papeis is null;

alter table public.profiles
  alter column papeis set default array['cliente'],
  alter column papeis set not null;

-- A régua do conteúdo:
--   * pelo menos um papel — perfil sem papel nenhum não é estado válido, e
--     seria indistinguível de "papel esquecido";
--   * todo elemento é um papel conhecido — o mesmo conjunto do CHECK de
--     `role`, para os dois nunca discordarem;
--   * sem repetição — 'admin,admin' não significa nada e quebraria contagem.
--
-- Numa função porque `CHECK` não aceita subconsulta, e a checagem de
-- repetição precisa de uma. A função é `immutable` e só olha o próprio
-- argumento — não lê tabela, que é o que tornaria um CHECK por função
-- traiçoeiro.
create or replace function public.papeis_validos(p text[]) returns boolean
  language sql
  immutable
as $fn$
  select p is not null
     and array_length(p, 1) >= 1
     and p <@ array['admin', 'comercial', 'financeiro', 'marketing', 'cliente']
     and array_length(p, 1) = (select count(distinct x) from unnest(p) x);
$fn$;

comment on function public.papeis_validos(text[]) is
  'Régua de conteúdo de profiles.papeis: não vazio, só papéis conhecidos, sem '
  'repetição. Existe como função porque CHECK não aceita subconsulta.';

alter table public.profiles
  drop constraint if exists profiles_papeis_check;
alter table public.profiles
  add constraint profiles_papeis_check check (public.papeis_validos(papeis));

comment on column public.profiles.papeis is
  'Todos os papéis do usuário. `papeis[1]` é o primário e espelha `role`, '
  'mantido por trigger para o código que ainda lê a coluna singular.';

-- ---------------------------------------------------------------------------
-- `role` vira espelho de `papeis[1]`
-- ---------------------------------------------------------------------------
-- Nos dois sentidos, porque as duas escritas existem hoje: a A17 grava `role`
-- e o código novo vai gravar `papeis`. Sem o sentido inverso, uma tela antiga
-- gravando `role` deixaria `papeis` para trás em silêncio — e o silêncio aqui
-- é alguém perdendo acesso sem que nada apareça no log.

create or replace function public.sincronizar_papeis()
  returns trigger
  language plpgsql
  set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    -- Quem informou só `role` (handle_new_user, telas antigas) ganha o array.
    if new.papeis is null or array_length(new.papeis, 1) is null then
      new.papeis := array[coalesce(new.role, 'cliente')];
    end if;
    new.role := new.papeis[1];
    return new;
  end if;

  -- UPDATE: quem mudou manda. Se `papeis` mudou, ele é a fonte; se só `role`
  -- mudou, ele vira o primário e os demais papéis são preservados.
  if new.papeis is distinct from old.papeis then
    new.role := new.papeis[1];
  elsif new.role is distinct from old.role then
    new.papeis := array[new.role] || array_remove(old.papeis, new.role);
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_sincronizar_papeis on public.profiles;
create trigger trg_sincronizar_papeis
  before insert or update on public.profiles
  for each row execute function public.sincronizar_papeis();

-- ---------------------------------------------------------------------------
-- `is_staff` passa a olhar TODOS os papéis
-- ---------------------------------------------------------------------------
-- Esta é a linha que faz o multi-papel valer no banco: sem ela, quem tivesse
-- `papeis = {cliente, comercial}` seria barrado por toda policy interna,
-- porque `role` (o primário) diria `cliente`.
--
-- A regra 2-b do CLAUDE.md continua de pé: papel de staff só entra por
-- `app_metadata` (ver `handle_new_user`), e `cliente` sozinho nunca é staff.
-- O que muda é que `cliente` deixa de ANULAR um papel de equipe que exista ao
-- lado dele — o caso do funcionário que também comprou um carro na loja.

create or replace function public.is_staff(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'comercial', 'financeiro', 'marketing']
  );
$$ language sql security definer set search_path = public;

comment on function public.is_staff(uuid) is
  'Tem ALGUM papel de painel (admin/comercial/financeiro/marketing) e está '
  'ativo. Desde 2026-08-19 olha `papeis`, não `role` — um usuário pode ter '
  'mais de um papel. Cliente da Garagem é authenticated, mas nunca é staff '
  'por isso sozinho.';

-- Quem tem um papel específico. É o que as telas novas consultam quando a
-- pergunta é "pode fazer X", e não "é da equipe".
create or replace function public.tem_papel(user_id uuid, papel text) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id and is_active = true and papel = any(papeis)
  );
$$ language sql security definer set search_path = public;

revoke all on function public.tem_papel(uuid, text) from public, anon;
grant execute on function public.tem_papel(uuid, text) to authenticated, service_role;

-- `handle_new_user` passa a semear o array junto. O papel continua vindo de
-- `app_metadata` — `raw_user_meta_data` é gravável pelo próprio usuário, e é
-- por isso que ele nunca decidiu papel aqui.
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, papeis)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    case
      when new.raw_app_meta_data->>'role'
           in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente')
        then new.raw_app_meta_data->>'role'
      else 'cliente'
    end,
    case
      when new.raw_app_meta_data->>'role'
           in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente')
        then array[new.raw_app_meta_data->>'role']
      else array['cliente']
    end
  );
  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
do $ac$
declare
  v_uid uuid;
  v_papeis text[];
  v_role text;
begin
  -- Ninguém ficou sem papel na conversão.
  if exists (select 1 from public.profiles where papeis is null or array_length(papeis, 1) is null) then
    raise exception 'ACEITE FALHOU: perfil sem papel depois da conversão';
  end if;
  -- E `role` bate com o primário em todo mundo.
  if exists (select 1 from public.profiles where role is distinct from papeis[1]) then
    raise exception 'ACEITE FALHOU: role divergente de papeis[1]';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-papeis@exemplo.invalido', now(), now())
  returning id into v_uid;

  -- Nasce cliente, e cliente não é staff.
  select papeis into v_papeis from public.profiles where id = v_uid;
  if v_papeis is distinct from array['cliente'] then
    raise exception 'ACEITE FALHOU: cadastro novo não nasceu cliente (%)', v_papeis;
  end if;
  if public.is_staff(v_uid) then
    raise exception 'ACEITE FALHOU: cliente virou staff — regra 2-b';
  end if;

  -- Dois papéis ao mesmo tempo: vira staff, e o primário espelha em `role`.
  update public.profiles set papeis = array['comercial', 'financeiro'] where id = v_uid;
  select role into v_role from public.profiles where id = v_uid;
  if v_role <> 'comercial' then
    raise exception 'ACEITE FALHOU: role não espelhou papeis[1] (%)', v_role;
  end if;
  if not public.is_staff(v_uid) then
    raise exception 'ACEITE FALHOU: quem tem dois papéis de equipe não é staff';
  end if;
  if not (public.tem_papel(v_uid, 'financeiro') and public.tem_papel(v_uid, 'comercial')) then
    raise exception 'ACEITE FALHOU: tem_papel não enxergou o segundo papel';
  end if;

  -- Escrita antiga (só `role`) NÃO pode apagar o outro papel.
  update public.profiles set role = 'financeiro' where id = v_uid;
  select papeis into v_papeis from public.profiles where id = v_uid;
  if not (v_papeis @> array['comercial', 'financeiro']) then
    raise exception 'ACEITE FALHOU: gravar role apagou o outro papel (%)', v_papeis;
  end if;
  if v_papeis[1] <> 'financeiro' then
    raise exception 'ACEITE FALHOU: role gravado não virou o primário (%)', v_papeis;
  end if;

  -- Papel inválido e repetição são recusados.
  begin
    update public.profiles set papeis = array['admin', 'inventado'] where id = v_uid;
    raise exception 'ACEITE FALHOU: papel inventado foi aceito';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set papeis = array['admin', 'admin'] where id = v_uid;
    raise exception 'ACEITE FALHOU: papel repetido foi aceito';
  exception when check_violation then null;
  end;

  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;

  raise notice 'Aceite verificado: multi-papel, espelho de role, is_staff por papeis e as duas recusas.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260819150000', 'papeis_multiplos')
  on conflict (version) do nothing;
