-- ==========================================================
-- role cliente + is_staff — o auth passa a ter dois públicos
-- ==========================================================
--
-- Decisão do dono em 2026-08-13 (Caderneta Motors, a fase zero da recompra
-- sem telemetria): a área do cliente terá login próprio. Cliente e staff
-- dividem o mesmo pool `auth.users` — e até esta migração o desenho era
-- hostil a isso, em dois pontos:
--
--   1. `handle_new_user()` dava `role = 'comercial'` a QUALQUER usuário
--      novo, e lia o papel de `raw_user_meta_data` — que o próprio usuário
--      controla no signup: um cadastro espontâneo podia se autodeclarar
--      'admin' no corpo da requisição.
--   2. Várias policies diziam apenas TO authenticated USING (true): leads,
--      historico_veiculo, auditoria_admin, notificacoes_admin, midia_*,
--      site_settings (leitura completa e escrita) e a escrita de
--      estoque_motors. O primeiro cliente logado leria e escreveria tudo
--      isso como se fosse equipe.
--
-- O que muda:
--   - `profiles.role` passa a aceitar 'cliente' — e 'marketing', que o
--     painel usa desde a tela A17 mas o CHECK original de
--     supabase_schema.sql nunca listou;
--   - `is_staff(uid)` vira a régua única de "é gente da loja";
--   - `handle_new_user()` lê o papel de `raw_APP_meta_data` (só a chave de
--     serviço escreve lá; /api/users foi ajustado junto) e o padrão vira
--     'cliente', o privilégio mínimo;
--   - toda policy interna que era `TO authenticated USING (true)` passa a
--     exigir `is_staff(auth.uid())`. Mesmos nomes, régua nova.
--
-- Nada aqui cria a área do cliente. Este é o alicerce que precisa existir
-- ANTES do primeiro login de cliente — sem ele, o cliente nasceria staff.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. O vocabulário de papéis
-- ----------------------------------------------------------

-- Se produção tiver papel fora do vocabulário novo, abortar aqui é melhor
-- do que estourar o CHECK no meio da migração.
do $$
declare
  invalido text;
begin
  select string_agg(distinct role, ', ') into invalido
    from public.profiles
   where role not in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente');
  if invalido is not null then
    raise exception 'profiles.role com valores fora do vocabulário: %', invalido;
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente'));

-- O default da coluna acompanha o do trigger: privilégio mínimo.
alter table public.profiles alter column role set default 'cliente';

-- ----------------------------------------------------------
-- 2. is_staff — a régua única de "é gente da loja"
-- ----------------------------------------------------------

-- SECURITY DEFINER pelo mesmo motivo de is_admin/has_finance_access: a
-- policy consulta profiles sem recursão de RLS. `is_active` entra na conta:
-- staff desativado não lê dado interno.
create or replace function public.is_staff(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and role in ('admin', 'comercial', 'financeiro', 'marketing')
       and is_active = true
  );
$$ language sql security definer set search_path = public;

comment on function public.is_staff(uuid) is
  'Papel de painel (admin/comercial/financeiro/marketing) e ativo. '
  'A régua das policies internas desde 2026-08-13 — cliente da Caderneta '
  'é authenticated, mas nunca é staff.';

-- ----------------------------------------------------------
-- 3. handle_new_user — papel vem de app_metadata, padrão é cliente
-- ----------------------------------------------------------

-- `raw_user_meta_data` pertence ao usuário (o signUp aceita qualquer coisa
-- ali); `raw_app_meta_data` só é gravável pela chave de serviço. O papel de
-- staff passa a viajar em app_metadata, e signup espontâneo — que é como o
-- cliente da Caderneta vai nascer — cai em 'cliente' sempre, não importa o
-- que o corpo do signup declare.
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    case
      when new.raw_app_meta_data->>'role'
           in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente')
        then new.raw_app_meta_data->>'role'
      else 'cliente'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

-- O trigger em si não muda, mas passa a existir sob controle de versão.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------
-- 4. As policies que confundiam "logado" com "staff"
-- ----------------------------------------------------------

-- leads — PII de cliente, a mais sensível do lote
drop policy if exists leads_leitura on public.leads;
create policy leads_leitura on public.leads
  for select to authenticated
  using (public.is_staff(auth.uid()));

drop policy if exists leads_atualizacao on public.leads;
create policy leads_atualizacao on public.leads
  for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists leads_exclusao on public.leads;
create policy leads_exclusao on public.leads
  for delete to authenticated
  using (public.is_staff(auth.uid()));

-- historico_veiculo
drop policy if exists historico_veiculo_leitura on public.historico_veiculo;
create policy historico_veiculo_leitura on public.historico_veiculo
  for select to authenticated
  using (public.is_staff(auth.uid()));

drop policy if exists historico_veiculo_insercao on public.historico_veiculo;
create policy historico_veiculo_insercao on public.historico_veiculo
  for insert to authenticated
  with check (public.is_staff(auth.uid()));

-- auditoria_admin — segue append-only (sem UPDATE/DELETE)
drop policy if exists auditoria_admin_leitura on public.auditoria_admin;
create policy auditoria_admin_leitura on public.auditoria_admin
  for select to authenticated
  using (public.is_staff(auth.uid()));

drop policy if exists auditoria_admin_insercao on public.auditoria_admin;
create policy auditoria_admin_insercao on public.auditoria_admin
  for insert to authenticated
  with check (public.is_staff(auth.uid()));

-- notificacoes_admin — escrita segue só pela chave de serviço
drop policy if exists notificacoes_admin_leitura on public.notificacoes_admin;
create policy notificacoes_admin_leitura on public.notificacoes_admin
  for select to authenticated
  using (public.is_staff(auth.uid()));

-- midia_* — o gate por papel fino continua na UI; o de staff desce ao banco
drop policy if exists midia_campanhas_autenticados on public.midia_campanhas;
create policy midia_campanhas_autenticados on public.midia_campanhas
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists midia_anuncios_autenticados on public.midia_anuncios;
create policy midia_anuncios_autenticados on public.midia_anuncios
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists midia_leituras_autenticados on public.midia_leituras;
create policy midia_leituras_autenticados on public.midia_leituras
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists midia_ajustes_autenticados on public.midia_ajustes;
create policy midia_ajustes_autenticados on public.midia_ajustes
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- site_settings — o recorte anônimo (TO anon) não muda; a leitura completa
-- e a escrita deixam de valer para qualquer logado
drop policy if exists "Leitura completa com sessao" on public.site_settings;
create policy "Leitura completa com sessao" on public.site_settings
  for select to authenticated
  using (public.is_staff(auth.uid()));

drop policy if exists "Escrita de settings com sessao" on public.site_settings;
create policy "Escrita de settings com sessao" on public.site_settings
  for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "Insercao de settings com sessao" on public.site_settings;
create policy "Insercao de settings com sessao" on public.site_settings
  for insert to authenticated
  with check (public.is_staff(auth.uid()));

-- estoque_motors — a leitura pública da vitrine não muda; a escrita vira
-- exclusiva de staff
drop policy if exists "Escrita do painel autenticado" on public.estoque_motors;
create policy "Escrita do painel autenticado" on public.estoque_motors
  for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "Insercao do painel autenticado" on public.estoque_motors;
create policy "Insercao do painel autenticado" on public.estoque_motors
  for insert to authenticated
  with check (public.is_staff(auth.uid()));

-- ----------------------------------------------------------
-- 5. Autoconferência — um autenticado sem perfil de staff não vê nada interno
-- ----------------------------------------------------------

-- Simula o pior caso: sessão válida (`authenticated`) com um sub aleatório
-- que não tem linha em profiles — exatamente o que um cliente recém-criado
-- seria se o trigger falhasse. Ele não pode ler leads nem site_settings.
do $$
declare
  qtd integer;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select count(*) into qtd from public.leads;
  if qtd > 0 then
    raise exception 'AUTOCONFERÊNCIA FALHOU: authenticated sem staff leu % linha(s) de leads', qtd;
  end if;

  select count(*) into qtd from public.site_settings;
  if qtd > 0 then
    raise exception 'AUTOCONFERÊNCIA FALHOU: authenticated sem staff leu % linha(s) de site_settings', qtd;
  end if;

  select count(*) into qtd from public.notificacoes_admin;
  if qtd > 0 then
    raise exception 'AUTOCONFERÊNCIA FALHOU: authenticated sem staff leu notificacoes_admin';
  end if;

  reset role;
end $$;
