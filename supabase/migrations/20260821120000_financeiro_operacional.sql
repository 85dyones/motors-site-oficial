-- ---------------------------------------------------------------------------
-- Financeiro operacional — a régua multi-papel chega ao módulo financeiro
-- e nasce o controle de investidores.
--
-- Origem: briefing de 2026-08-21 entre o dono e a adm/financeira (Sinthia).
-- Dois pedidos desta migração; os demais (pagamentos do dia, relatório
-- diário) são só de aplicação e não mexem em schema — ver
-- docs/FINANCEIRO_OPERACIONAL.md.
--
-- ---------------------------------------------------------------------------
-- 1. `has_finance_access` passa a olhar `papeis`
-- ---------------------------------------------------------------------------
-- A função nasceu no bootstrap de 2026-08-03 (supabase_schema.sql, histórico)
-- e NUNCA foi versionada — este arquivo é a primeira vez que ela aparece em
-- `migrations/`. Ela ainda lê `role` singular:
--
--     role IN ('admin', 'financeiro') AND is_active = true
--
-- Desde `20260819150000_papeis_multiplos`, `role` é espelho de `papeis[1]`.
-- Quem tem `papeis = {comercial, financeiro}` carrega `role = 'comercial'` —
-- e a função nega. Resultado: TODA tabela do módulo financeiro (contas,
-- categorias, parceiros, recorrentes, compras, movimentações, notificações)
-- soma RLS que não enxerga o segundo papel. A pessoa vê o menu Financeiro
-- (o SidebarNav lê `papeis`), abre a tela e recebe lista vazia — o mesmo
-- silêncio da família de bugs de `tests/rotas-de-api.test.ts`.
--
-- A correção é a mesma aplicada a `is_staff()` na migração dos papéis:
-- trocar a coluna singular pelo array. Nenhuma policy muda — todas já
-- delegam à função.
--
-- ---------------------------------------------------------------------------
-- 2. Investidores: aportes e retiradas com rastro
-- ---------------------------------------------------------------------------
-- Pedido literal da Sinthia (2026-08-21): "algo que conseguíssemos controlar
-- melhor o que eles investem e o que fazem retirada... independente se a
-- retirada é um carro de repasse ou algo do tipo... precisa estar bem
-- certinho os valores de entrada e saída". Hoje esse controle é planilha
-- solta; os investidores são pessoas físicas conhecidas (dois hoje), mas a
-- tabela não fixa quantidade.
--
-- Por que NÃO reaproveitar `parceiros`: o CHECK de lá é
-- ('fornecedor', 'cliente', 'ambos') — vocabulário de contas a pagar e
-- receber. Investidor não é nem um nem outro: ele não fatura contra a loja
-- nem compra dela; ele aporta capital e retira. Alargar o CHECK misturaria
-- os dois mundos que a própria Sinthia pediu para separar.
--
-- A retirada em carro de repasse entra como movimentação com `veiculo_id`
-- preenchido — mesmo TEXT de `contas.veiculo_id`, apontando para o código
-- do RevendaMais em `estoque_motors.id`. Sem FK, pela mesma razão de
-- `contas`: o veículo pode sair do feed (vendido some do sync) e o registro
-- financeiro precisa sobreviver a ele.
--
-- RLS: a mesma régua do módulo — `has_finance_access` (Admin e Financeiro).
-- A matriz A17 ganha a linha correspondente em `src/lib/permissoes.ts`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. has_finance_access por papéis
-- ---------------------------------------------------------------------------

create or replace function public.has_finance_access(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'financeiro']
  );
$$ language sql security definer set search_path = public;

comment on function public.has_finance_access(uuid) is
  'Tem papel admin ou financeiro e está ativo. Desde 2026-08-21 olha '
  '`papeis`, não `role` — a régua de TODO o RLS do módulo financeiro. '
  'Versionada pela primeira vez nesta data; antes vivia só no bootstrap.';

-- ---------------------------------------------------------------------------
-- 2. Tabelas de investidores
-- ---------------------------------------------------------------------------

create table if not exists public.investidores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  telefone text,
  email text,
  -- Investidor que saiu do negócio não é apagado: o histórico de aportes é
  -- registro financeiro. Ele é desativado e some das listas de lançamento.
  ativo boolean not null default true,
  observacoes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.investidores is
  'Quem aporta capital na operação (briefing 2026-08-21). Não é fornecedor '
  'nem cliente — por isso não vive em `parceiros`. Desativa, não apaga.';

create table if not exists public.movimentacoes_investidor (
  id uuid primary key default gen_random_uuid(),
  -- Sem ON DELETE: investidor com movimentação não pode ser apagado, e é de
  -- propósito — apagar o investidor não pode evaporar o rastro do dinheiro.
  investidor_id uuid not null references public.investidores(id),
  tipo text not null check (tipo in ('aporte', 'retirada')),
  -- O sinal mora em `tipo`, nunca no número: os dois lados são sempre > 0,
  -- como os contadores de `conta_vencida` — quem lê não interpreta sinal.
  valor numeric(12, 2) not null check (valor > 0),
  data date not null default current_date,
  descricao text not null,
  -- O vocabulário de `contas.forma_pagamento`, mais `veiculo` — a retirada
  -- em carro de repasse do briefing.
  forma_pagamento text check (forma_pagamento in (
    'dinheiro', 'pix', 'cartao_credito', 'cartao_debito',
    'boleto', 'transferencia', 'cheque', 'financiamento', 'veiculo'
  )),
  -- Preenchido quando a retirada (ou o aporte) é um carro — mesmo TEXT sem
  -- FK de `contas.veiculo_id`; ver o cabeçalho.
  veiculo_id text,
  observacoes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.movimentacoes_investidor is
  'Aportes e retiradas por investidor. `valor` é sempre positivo — o lado '
  'mora em `tipo`. Retirada em carro de repasse leva `veiculo_id`.';
comment on column public.movimentacoes_investidor.veiculo_id is
  'Código RevendaMais em estoque_motors.id, sem FK — o carro pode sair do '
  'feed e o registro financeiro fica.';

create index if not exists idx_mov_investidor_investidor
  on public.movimentacoes_investidor (investidor_id);
create index if not exists idx_mov_investidor_data
  on public.movimentacoes_investidor (data);
create index if not exists idx_mov_investidor_veiculo
  on public.movimentacoes_investidor (veiculo_id)
  where veiculo_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS — a mesma porta do resto do módulo
-- ---------------------------------------------------------------------------

alter table public.investidores enable row level security;
alter table public.movimentacoes_investidor enable row level security;

drop policy if exists "Acesso do financeiro a investidores" on public.investidores;
create policy "Acesso do financeiro a investidores" on public.investidores
  for all
  using (public.has_finance_access(auth.uid()))
  with check (public.has_finance_access(auth.uid()));

drop policy if exists "Acesso do financeiro a movimentacoes de investidor"
  on public.movimentacoes_investidor;
create policy "Acesso do financeiro a movimentacoes de investidor"
  on public.movimentacoes_investidor
  for all
  using (public.has_finance_access(auth.uid()))
  with check (public.has_finance_access(auth.uid()));

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
-- Prova as três promessas do arquivo contra o banco real:
--   a) o segundo papel abre o financeiro — `{comercial, financeiro}` tem
--      `role = 'comercial'` (espelho do primário) e ainda assim passa;
--   b) cliente e papel nenhum continuam do lado de fora;
--   c) a régua do dinheiro segura valor não positivo, tipo inventado e
--      exclusão de investidor com movimentação.

do $ac$
declare
  v_uid uuid;
  v_inv uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-financeiro@exemplo.invalido', now(), now())
  returning id into v_uid;

  -- (b) Nasce cliente: porta fechada.
  if public.has_finance_access(v_uid) then
    raise exception 'ACEITE FALHOU: cliente abriu o financeiro';
  end if;

  -- (a) O caso que motivou a correção: financeiro como SEGUNDO papel.
  update public.profiles set papeis = array['comercial', 'financeiro'] where id = v_uid;
  if not public.has_finance_access(v_uid) then
    raise exception 'ACEITE FALHOU: o segundo papel financeiro segue negado — a função ainda lê role?';
  end if;

  -- (b) Comercial puro não entra; desativado também não.
  update public.profiles set papeis = array['comercial'] where id = v_uid;
  if public.has_finance_access(v_uid) then
    raise exception 'ACEITE FALHOU: comercial puro abriu o financeiro';
  end if;
  update public.profiles set papeis = array['financeiro'], is_active = false where id = v_uid;
  if public.has_finance_access(v_uid) then
    raise exception 'ACEITE FALHOU: financeiro desativado abriu o financeiro';
  end if;

  -- (c) A régua do dinheiro. Escrita direta (superusuário ignora RLS, não
  -- CHECK): valor zero, valor negativo e tipo inventado são recusados.
  insert into public.investidores (nome) values ('Autoconf Sintético')
  returning id into v_inv;

  begin
    insert into public.movimentacoes_investidor (investidor_id, tipo, valor, descricao)
    values (v_inv, 'aporte', 0, 'valor zero');
    raise exception 'ACEITE FALHOU: aporte de valor zero foi aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.movimentacoes_investidor (investidor_id, tipo, valor, descricao)
    values (v_inv, 'retirada', -100, 'valor negativo');
    raise exception 'ACEITE FALHOU: retirada negativa foi aceita';
  exception when check_violation then null;
  end;
  begin
    insert into public.movimentacoes_investidor (investidor_id, tipo, valor, descricao)
    values (v_inv, 'emprestimo', 100, 'tipo inventado');
    raise exception 'ACEITE FALHOU: tipo de movimentação inventado foi aceito';
  exception when check_violation then null;
  end;

  -- (c) Investidor com movimentação não pode ser apagado.
  insert into public.movimentacoes_investidor (investidor_id, tipo, valor, descricao)
  values (v_inv, 'aporte', 1000, 'aporte sintético');
  begin
    delete from public.investidores where id = v_inv;
    raise exception 'ACEITE FALHOU: investidor com movimentação foi apagado';
  exception when foreign_key_violation then null;
  end;

  delete from public.movimentacoes_investidor where investidor_id = v_inv;
  delete from public.investidores where id = v_inv;
  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;

  raise notice 'Aceite verificado: has_finance_access por papeis, régua do valor e rastro indelével.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260821120000', 'financeiro_operacional')
  on conflict (version) do nothing;
