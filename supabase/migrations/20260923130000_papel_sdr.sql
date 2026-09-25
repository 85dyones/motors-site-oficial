-- ---------------------------------------------------------------------------
-- O papel SDR (2026-09-23)
-- ---------------------------------------------------------------------------
-- Pedido do dono: *"temos uma role de SDR que está junto no comercial, mas
-- creio seja a hora de mudar"*. O SDR trabalha o resgate dos leads que o
-- Comercial não converteu (workflow "Fila de Resgate (SDR)" do n8n, time #6
-- do Chatwoot). É equipe — entra no painel e move lead —, mas NÃO recebe
-- lead: *"só comercial recebe lead"*. Essa régua mora no rodízio, na
-- migração seguinte (`20260923130100_rodizio_so_comercial`).
--
-- O vocabulário é lista enumerada em três réguas do banco, e as três mudam
-- JUNTAS aqui. Foi reescrevendo uma e esquecendo outra que o gestor sumiu em
-- 22/08 (ver `20260822210000_fundir_investidores`). O lado do app é `PERFIS`
-- em `src/lib/permissoes.ts`, e `tests/papeis-gestor-investidor.test.ts`
-- confere os dois lados contra a migração MAIS RECENTE que define cada
-- função.
--
-- `handle_new_user` não muda: o convite (`/api/users`) grava `papeis` pela
-- chave de serviço depois de criar o usuário, e o padrão do trigger continua
-- sendo `cliente`.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr',
                  'cliente', 'investidor'));

create or replace function public.papeis_validos(p text[]) returns boolean
  language sql
  immutable
as $fn$
  select p is not null
     and array_length(p, 1) >= 1
     and p <@ array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr',
                    'cliente', 'investidor']
     and array_length(p, 1) = (select count(distinct x) from unnest(p) x);
$fn$;

comment on function public.papeis_validos(text[]) is
  'Vocabulário de `profiles.papeis` — os seis de painel (admin, gestor, '
  'marketing, comercial, financeiro, sdr) mais os de área própria (cliente, '
  'investidor). Espelha PERFIS + PAPEIS_SEM_PAINEL de src/lib/permissoes.ts, '
  'e um teste trava os dois lados.';

create or replace function public.is_staff(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr']
  );
$$ language sql security definer set search_path = public;

comment on function public.is_staff(uuid) is
  'Tem ALGUM papel de painel (admin/gestor/comercial/financeiro/marketing/sdr) '
  'e está ativo. `cliente` (Garagem) e `investidor` são authenticated, mas '
  'nunca staff por isso sozinhos. O SDR entrou em 2026-09-23.';

-- ---------------------------------------------------------------------------
-- Aceite
-- ---------------------------------------------------------------------------
do $$
begin
  if not public.papeis_validos(array['sdr']) then
    raise exception 'ACEITE FALHOU: sdr fora do vocabulário';
  end if;
  if not public.papeis_validos(
       array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr',
             'cliente', 'investidor']) then
    raise exception 'ACEITE FALHOU: algum papel antigo saiu do vocabulário';
  end if;
  if public.papeis_validos(array['vendedor']) then
    raise exception 'ACEITE FALHOU: o vocabulário aceita papel inventado';
  end if;
  -- Ninguém de hoje pode ficar com a linha congelada pelo CHECK novo — o
  -- sintoma de 22/08: qualquer UPDATE no perfil passava a falhar.
  if exists (select 1 from public.profiles
              where not public.papeis_validos(papeis)
                 or role not in ('admin', 'gestor', 'comercial', 'financeiro',
                                 'marketing', 'sdr', 'cliente', 'investidor')) then
    raise exception 'ACEITE FALHOU: há perfil que o vocabulário novo recusa';
  end if;
  raise notice 'Aceite verificado: sdr é papel válido e de painel, e nenhum papel ou perfil antigo se perdeu.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260923130000', 'papel_sdr')
  on conflict (version) do nothing;
