-- ---------------------------------------------------------------------------
-- Alçada de aprovação — a linha de R$ 1.500 da matriz A17 ganha estado.
--
-- Pedido do dono no briefing de 2026-08-21: aviso por WhatsApp "de contas
-- que subiram pra aprovação". A matriz A17 sempre disse "Lançar e aprovar
-- contas a pagar — alçada de R$ 1.500 no gerente", mas nenhuma tela ou
-- coluna aplicava: um perfil financeiro lançava qualquer valor direto como
-- `pendente`.
--
-- Este arquivo dá ao banco o VOCABULÁRIO e a TRILHA; a régua de quando uma
-- conta precisa de aprovação mora em `src/lib/alcada.ts` e é aplicada nas
-- rotas — o desenho declarado em `permissoes.ts`: os pontos de alçada fina
-- consultam a matriz no app, como a alçada de 5% no preço. Importação do
-- RevendaMais e geração de recorrente NÃO passam pela régua: são registro de
-- compromisso que já existe, não decisão nova de gasto — forçá-las criaria
-- uma avalanche de aprovações exatamente na virada que o briefing quer.
--
-- O que o banco garante aqui:
--   1. o status `aguardando_aprovacao` existe no CHECK de `contas`;
--   2. a decisão deixa rastro — quem decidiu, quando e por quê
--      (`aprovacao_decidida_por/em/motivo`), com trigger que carimba o
--      instante da saída do estado mesmo se a rota esquecer;
--   3. conta aguardando aprovação NUNCA vira `vencido` sozinha —
--      `atualizar_contas_vencidas()` só toca `pendente`, e a autoconferência
--      prova isso: aguardando não é dívida reconhecida, é pedido em análise.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. O status novo
-- ---------------------------------------------------------------------------
-- O CHECK nasceu inline no bootstrap, então o Postgres o batizou de
-- `contas_status_check`. Recriado com o vocabulário completo.

alter table public.contas drop constraint if exists contas_status_check;
alter table public.contas add constraint contas_status_check
  check (status in ('pendente', 'pago', 'vencido', 'cancelado', 'parcial', 'aguardando_aprovacao'));

-- ---------------------------------------------------------------------------
-- 2. A trilha da decisão
-- ---------------------------------------------------------------------------

alter table public.contas
  add column if not exists aprovacao_decidida_por uuid references public.profiles(id),
  add column if not exists aprovacao_decidida_em timestamptz,
  add column if not exists aprovacao_motivo text;

comment on column public.contas.aprovacao_decidida_por is
  'Quem aprovou ou recusou o lançamento acima da alçada (A17: R$ 1.500). '
  'Nulo em conta que nunca precisou de aprovação.';
comment on column public.contas.aprovacao_motivo is
  'Obrigatório na recusa (a rota exige); opcional na aprovação.';

-- Carimbo de saída do estado: se a conta deixa `aguardando_aprovacao` e a
-- rota não preencheu o instante, o banco preenche. O QUEM continua vindo da
-- rota — o banco não sabe quem clicou; o QUANDO ele sabe sempre.
create or replace function public.carimbar_decisao_de_alcada() returns trigger as $$
begin
  if old.status = 'aguardando_aprovacao'
     and new.status is distinct from old.status
     and new.aprovacao_decidida_em is null
  then
    new.aprovacao_decidida_em := now();
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_carimbar_decisao_de_alcada on public.contas;
create trigger trg_carimbar_decisao_de_alcada
  before update on public.contas
  for each row execute function public.carimbar_decisao_de_alcada();

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------

do $ac$
declare
  v_conta uuid;
  v_status text;
  v_quando timestamptz;
begin
  -- (1) O vocabulário aceita o estado novo, e um inventado continua fora.
  insert into public.contas (tipo, descricao, valor, data_vencimento, status)
  values ('pagar', 'Autoconf alçada', 9000, current_date - 30, 'aguardando_aprovacao')
  returning id into v_conta;

  begin
    update public.contas set status = 'em_analise' where id = v_conta;
    raise exception 'ACEITE FALHOU: status inventado foi aceito';
  exception when check_violation then null;
  end;

  -- (2) Aguardando aprovação não envelhece para `vencido`: a conta acima
  -- venceu há 30 dias e a rotina de vencidos não pode encostar nela.
  perform public.atualizar_contas_vencidas();
  select status into v_status from public.contas where id = v_conta;
  if v_status <> 'aguardando_aprovacao' then
    raise exception 'ACEITE FALHOU: atualizar_contas_vencidas mudou aguardando_aprovacao para %', v_status;
  end if;

  -- (3) Sair do estado carimba o instante da decisão mesmo sem a rota.
  update public.contas set status = 'pendente' where id = v_conta;
  select aprovacao_decidida_em into v_quando from public.contas where id = v_conta;
  if v_quando is null then
    raise exception 'ACEITE FALHOU: decisão saiu sem carimbo de instante';
  end if;

  -- (4) E o carimbo não dispara em conta que nunca aguardou: a mesma linha,
  -- já pendente, paga — o campo de decisão não pode ganhar valor novo.
  update public.contas set aprovacao_decidida_em = null where id = v_conta;
  update public.contas set status = 'pago', data_pagamento = current_date where id = v_conta;
  select aprovacao_decidida_em into v_quando from public.contas where id = v_conta;
  if v_quando is not null then
    raise exception 'ACEITE FALHOU: carimbo de decisão disparou fora do estado de aprovação';
  end if;

  delete from public.contas where id = v_conta;

  raise notice 'Aceite verificado: vocabulário, vencidos não tocam aguardando e o carimbo da decisão.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260821150000', 'alcada_de_aprovacao')
  on conflict (version) do nothing;
