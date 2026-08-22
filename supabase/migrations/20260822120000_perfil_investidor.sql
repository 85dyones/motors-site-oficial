-- ---------------------------------------------------------------------------
-- O perfil Investidor — o terceiro público do sistema.
--
-- Pedido do dono em 2026-08-22: quem entra com dinheiro na compra dos carros
-- precisa acompanhar a própria posição sem depender de alguém mandar print.
-- O que ele enxerga, e nada além disso:
--
--   1. os carros em que ELE entrou na compra;
--   2. o aporte inicial total;
--   3. quanto já retirou;
--   4. o saldo ainda investido.
--
-- ---------------------------------------------------------------------------
-- A decisão que governa este arquivo: INVESTIDOR NÃO É STAFF
-- ---------------------------------------------------------------------------
-- A tentação era acrescentar 'investidor' aos quatro perfis de painel
-- (`PERFIS` em src/lib/permissoes.ts). Isso teria sido uma regressão de
-- segurança silenciosa: `is_staff` — e o `ehStaff` do app — é a régua única de
-- "é gente da loja", e quem passa por ela recebe, entre outras coisas, o
-- payload completo de `/api/settings` (token de API, saldos bancários,
-- `preco_compra` de TODO o estoque), a escrita de estoque e os leads.
--
-- Investidor é um público próprio, como `cliente` (2026-08-13): mora fora do
-- painel, em `/investidor`, e enxerga só as próprias linhas — por RLS, não por
-- filtro de tela. `is_staff` continua listando apenas os quatro papéis de
-- painel, e a autoconferência no fim deste arquivo prova isso contra o banco.
--
-- ---------------------------------------------------------------------------
-- Por que DUAS tabelas, e não uma
-- ---------------------------------------------------------------------------
-- "Aporte total" e "em quais carros eu estou" são perguntas diferentes e mudam
-- em ritmos diferentes: o dinheiro entra e sai em movimentos datados, e a
-- participação num carro é um fato que dura enquanto o carro está no pátio.
-- Amarrar as duas numa tabela só obrigaria a inventar um movimento falso para
-- cada carro — e o saldo passaria a depender do estoque, que é sincronizado de
-- fora e pode sumir com uma linha.
--
--   * `investidor_movimentos`  — o razão: aportes e retiradas. É daqui que
--     saem os três números.
--   * `investidor_veiculos`    — participação na compra de um veículo.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. O vocabulário de papéis aceita 'investidor'
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor'));

create or replace function public.papeis_validos(p text[]) returns boolean
  language sql
  immutable
as $fn$
  select p is not null
     and array_length(p, 1) >= 1
     and p <@ array['admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor']
     and array_length(p, 1) = (select count(distinct x) from unnest(p) x);
$fn$;

-- `handle_new_user` acompanha: sem isto, um investidor convidado nasceria
-- `cliente` e cairia na Garagem em vez da própria área.
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role, papeis)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    case
      when new.raw_app_meta_data->>'role'
           in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor')
        then new.raw_app_meta_data->>'role'
      else 'cliente'
    end,
    case
      when new.raw_app_meta_data->>'role'
           in ('admin', 'comercial', 'financeiro', 'marketing', 'cliente', 'investidor')
        then array[new.raw_app_meta_data->>'role']
      else array['cliente']
    end
  );
  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 2. `has_finance_access` passa a somar os papéis
-- ---------------------------------------------------------------------------
-- Mesma família de bug que o app corrigiu em 2026-08-22: a função lia `role`,
-- o papel PRIMÁRIO, então quem é {comercial, financeiro} — o caso real desta
-- loja — era barrado do próprio módulo financeiro pela RLS. As tabelas de
-- investidor nascem dependendo desta função; entrar com ela torta seria
-- inaugurar o problema em vez de herdá-lo.
create or replace function public.has_finance_access(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'financeiro']
  );
$$ language sql security definer set search_path = public;

comment on function public.has_finance_access(uuid) is
  'Tem acesso ao módulo financeiro (admin ou financeiro) e está ativo. Desde '
  '2026-08-22 olha `papeis`, não `role` — um usuário pode ter mais de um papel.';

-- ---------------------------------------------------------------------------
-- 3. Participação na compra de um veículo
-- ---------------------------------------------------------------------------
create table if not exists public.investidor_veiculos (
  id              uuid primary key default gen_random_uuid(),
  investidor_id   uuid not null references public.profiles(id) on delete cascade,

  -- Sem FK para `estoque_motors` DE PROPÓSITO. O estoque é sincronizado do
  -- RevendaMais e uma linha pode sair do feed; uma FK transformaria isso em
  -- erro de sync ou, pior, apagaria a participação junto. É o mesmo tipo de
  -- join frouxo que `contas.veiculo_id` já usa — aqui em bigint, que é o tipo
  -- real de `estoque_motors.id`.
  veiculo_id      bigint not null,

  -- Quanto ESTE investidor colocou NESTE carro.
  valor_investido numeric(12,2) not null check (valor_investido >= 0),
  data_entrada    date not null default current_date,
  observacao      text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),

  -- Um investidor entra uma vez em cada carro; aumentar a participação é
  -- editar a linha, não empilhar outra — senão a soma por carro mente.
  constraint investidor_veiculos_unicos unique (investidor_id, veiculo_id)
);

create index if not exists investidor_veiculos_por_investidor
  on public.investidor_veiculos (investidor_id);

comment on table public.investidor_veiculos is
  'Participação de um investidor na compra de um veículo do estoque.';

-- ---------------------------------------------------------------------------
-- 4. O razão: aportes e retiradas
-- ---------------------------------------------------------------------------
create table if not exists public.investidor_movimentos (
  id             uuid primary key default gen_random_uuid(),
  investidor_id  uuid not null references public.profiles(id) on delete cascade,
  tipo           text not null check (tipo in ('aporte', 'retirada')),

  -- SEMPRE positivo: o sinal mora em `tipo`, nunca no valor. Aceitar retirada
  -- negativa deixaria o saldo somar duas vezes na mesma direção, e o erro só
  -- apareceria no total — tarde demais para saber qual linha o causou.
  valor          numeric(12,2) not null check (valor > 0),

  data           date not null default current_date,
  descricao      text,

  -- Retirada costuma vir da venda de um carro; guardar qual permite explicar
  -- o número sem garimpar data. Opcional: aporte inicial não tem carro.
  veiculo_id     bigint,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create index if not exists investidor_movimentos_por_investidor
  on public.investidor_movimentos (investidor_id, data desc);

comment on table public.investidor_movimentos is
  'Razão do investidor: aportes e retiradas. Valor sempre positivo — o sinal '
  'está em `tipo`.';

-- ---------------------------------------------------------------------------
-- 5. A posição, calculada no banco
-- ---------------------------------------------------------------------------
-- `security_invoker = true` é o ponto inteiro desta view: sem ele a view roda
-- com os privilégios do dono e vira caminho para contornar a RLS das tabelas —
-- qualquer investidor leria a posição de todos. Com ele, a view agrega
-- exatamente as linhas que quem pergunta já podia ler.
create or replace view public.investidor_posicao
  with (security_invoker = true)
as
select
  investidor_id,
  coalesce(sum(valor) filter (where tipo = 'aporte'),   0)::numeric(12,2) as aporte_total,
  coalesce(sum(valor) filter (where tipo = 'retirada'), 0)::numeric(12,2) as retirado_total,
  ( coalesce(sum(valor) filter (where tipo = 'aporte'),   0)
  - coalesce(sum(valor) filter (where tipo = 'retirada'), 0)
  )::numeric(12,2) as saldo_investido
from public.investidor_movimentos
group by investidor_id;

comment on view public.investidor_posicao is
  'Aporte total, retirado e saldo por investidor. security_invoker: cada um '
  'agrega só o que a RLS já lhe deixava ler.';

-- ---------------------------------------------------------------------------
-- 6. RLS — o investidor lê o dele, e só lê
-- ---------------------------------------------------------------------------
alter table public.investidor_veiculos   enable row level security;
alter table public.investidor_movimentos enable row level security;

-- Leitura do próprio: `investidor_id = auth.uid()` é a régua toda. Quem tem
-- linha É o dono dela; não há como ver a de outro, nem por parâmetro de API,
-- porque o filtro não está na API.
drop policy if exists "Investidor le os proprios veiculos" on public.investidor_veiculos;
create policy "Investidor le os proprios veiculos" on public.investidor_veiculos
  for select using ( investidor_id = auth.uid() );

drop policy if exists "Investidor le os proprios movimentos" on public.investidor_movimentos;
create policy "Investidor le os proprios movimentos" on public.investidor_movimentos
  for select using ( investidor_id = auth.uid() );

-- Escrita é do financeiro/admin. O investidor NÃO tem policy de escrita —
-- ausência de policy é negação, e é a forma certa de dizer "ele não lança o
-- próprio aporte".
drop policy if exists "Financeiro gerencia participacoes" on public.investidor_veiculos;
create policy "Financeiro gerencia participacoes" on public.investidor_veiculos
  for all using ( public.has_finance_access(auth.uid()) )
  with check ( public.has_finance_access(auth.uid()) );

drop policy if exists "Financeiro gerencia movimentos" on public.investidor_movimentos;
create policy "Financeiro gerencia movimentos" on public.investidor_movimentos
  for all using ( public.has_finance_access(auth.uid()) )
  with check ( public.has_finance_access(auth.uid()) );

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
do $ac$
declare
  v_uid uuid;
  v_papeis text[];
  v_aporte numeric;
  v_retirado numeric;
  v_saldo numeric;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at,
                          raw_app_meta_data)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-investidor@exemplo.invalido',
          now(), now(), '{"role": "investidor"}'::jsonb)
  returning id into v_uid;

  -- Nasce investidor pelo app_metadata, e não cliente.
  select papeis into v_papeis from public.profiles where id = v_uid;
  if v_papeis is distinct from array['investidor'] then
    raise exception 'ACEITE FALHOU: convidado como investidor nasceu % ', v_papeis;
  end if;

  -- E investidor NÃO é staff — a decisão que governa este arquivo.
  if public.is_staff(v_uid) then
    raise exception 'ACEITE FALHOU: investidor virou staff — teria o payload completo de settings';
  end if;
  if not public.tem_papel(v_uid, 'investidor') then
    raise exception 'ACEITE FALHOU: tem_papel nao enxergou o investidor';
  end if;
  -- Nem tem acesso ao módulo financeiro.
  if public.has_finance_access(v_uid) then
    raise exception 'ACEITE FALHOU: investidor entrou no financeiro';
  end if;

  -- A conta: 100.000 de aporte, 30.000 retirados, 70.000 ainda investidos.
  insert into public.investidor_movimentos (investidor_id, tipo, valor, descricao)
  values (v_uid, 'aporte', 100000.00, 'aporte inicial'),
         (v_uid, 'retirada', 30000.00, 'retirada parcial');

  select aporte_total, retirado_total, saldo_investido
    into v_aporte, v_retirado, v_saldo
    from public.investidor_posicao where investidor_id = v_uid;

  if v_aporte <> 100000.00 or v_retirado <> 30000.00 or v_saldo <> 70000.00 then
    raise exception 'ACEITE FALHOU: posição errada (aporte %, retirado %, saldo %)',
      v_aporte, v_retirado, v_saldo;
  end if;

  -- Valor negativo é recusado: o sinal mora em `tipo`.
  begin
    insert into public.investidor_movimentos (investidor_id, tipo, valor)
    values (v_uid, 'retirada', -500.00);
    raise exception 'ACEITE FALHOU: movimento negativo foi aceito';
  exception when check_violation then null;
  end;

  -- Participação duplicada no mesmo carro é recusada.
  insert into public.investidor_veiculos (investidor_id, veiculo_id, valor_investido)
  values (v_uid, 7950008, 50000.00);
  begin
    insert into public.investidor_veiculos (investidor_id, veiculo_id, valor_investido)
    values (v_uid, 7950008, 10000.00);
    raise exception 'ACEITE FALHOU: participação duplicada no mesmo carro foi aceita';
  exception when unique_violation then null;
  end;

  delete from public.investidor_veiculos   where investidor_id = v_uid;
  delete from public.investidor_movimentos where investidor_id = v_uid;
  delete from public.profiles where id = v_uid;
  delete from auth.users  where id = v_uid;

  raise notice 'Aceite verificado: investidor nasce fora do staff, a posição fecha e as duas recusas valem.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão (D6) — ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260822120000', 'perfil_investidor')
  on conflict (version) do nothing;
