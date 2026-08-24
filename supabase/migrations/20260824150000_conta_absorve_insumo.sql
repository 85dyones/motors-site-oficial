-- ===========================================================================
-- A conta absorve a compra de insumo
-- ===========================================================================
-- 2026-08-24, pedido do dono: *"insumo é um tipo de compra, recorrência é um
-- tipo de vencimento, pode ser um check no cadastro da conta a pagar"*.
--
-- Ele está certo, e o schema já concordava sem que ninguém tivesse reparado:
-- `compras_produtos` sempre teve `conta_id`, e a rota de compras sempre criou
-- uma conta junto. A compra nunca foi uma ilha — era um satélite com três
-- campos a mais e um menu próprio.
--
-- Os três campos vêm para cá, e o menu some.
--
-- ---------------------------------------------------------------------------
-- O que NÃO vem junto, e por quê
-- ---------------------------------------------------------------------------
-- `compras_produtos.status` ('pendente', 'encomendado', 'recebido',
-- 'cancelado') é um eixo de RECEBIMENTO, não de pagamento — responde "a peça
-- chegou?", enquanto `contas.status` responde "foi paga?". São perguntas
-- diferentes e não podem morar na mesma coluna.
--
-- O dono foi consultado e descartou o eixo: *"não uso hoje, provavelmente não
-- irei, são poucos os insumos"*. Campo que ninguém preenche não é neutro —
-- vira ruído que faz duvidar do resto da tela. Fica de fora.
--
-- A tabela `compras_produtos` PERMANECE, com o histórico dela. Não recebe
-- linha nova, e `FinanceMargens` continua somando as antigas: ele já filtra
-- por `conta_id` para não contar duas vezes a mesma compra, então lançamento
-- novo (só conta) e antigo (compra + conta) convivem sem distorcer a margem.
-- Derrubar a tabela é decisão de outro dia, quando ninguém sentir falta.
-- ===========================================================================

alter table public.contas
  -- Quantos, e a quanto cada um. Opcionais: a esmagadora maioria das contas
  -- (aluguel, energia, comissão) não tem unidade — e forçar "1" nelas seria
  -- inventar precisão que não existe.
  add column if not exists quantidade      integer,
  add column if not exists valor_unitario  numeric(12, 2),
  -- A nota fiscal é o que amarra a despesa ao documento na hora do contador.
  add column if not exists nota_fiscal     text;

comment on column public.contas.quantidade is
  'Quantas unidades, quando a despesa é compra de item (2026-08-24). Nulo no '
  'resto: aluguel e energia não têm unidade.';
comment on column public.contas.valor_unitario is
  'Preço por unidade. Junto de `quantidade`, substitui o que morava em '
  'compras_produtos.';
comment on column public.contas.nota_fiscal is
  'Número da NF. Existe para o contador achar o documento sem garimpar.';

-- A régua que impede número sem sentido: quantidade e valor unitário, quando
-- vêm, vêm positivos. Zero unidade a zero real não é compra, é digitação.
alter table public.contas drop constraint if exists contas_quantidade_positiva;
alter table public.contas
  add constraint contas_quantidade_positiva
  check (quantidade is null or quantidade > 0);

alter table public.contas drop constraint if exists contas_valor_unitario_positivo;
alter table public.contas
  add constraint contas_valor_unitario_positivo
  check (valor_unitario is null or valor_unitario > 0);

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  -- a) conta comum continua nascendo sem os campos novos
  insert into public.contas (tipo, descricao, valor, data_vencimento, status)
    values ('pagar', 'Aceite aluguel', 3000, current_date, 'pendente')
    returning id into v_id;
  if exists (select 1 from public.contas
              where id = v_id and (quantidade is not null or valor_unitario is not null)) then
    raise exception 'ACEITE FALHOU: os campos de insumo não são opcionais';
  end if;
  delete from public.contas where id = v_id;

  -- b) conta de insumo aceita os três
  insert into public.contas (tipo, descricao, valor, data_vencimento, status,
                             quantidade, valor_unitario, nota_fiscal)
    values ('pagar', 'Aceite parafusos', 100, current_date, 'pendente', 20, 5.00, 'NF-123')
    returning id into v_id;
  if not exists (select 1 from public.contas
                  where id = v_id and quantidade = 20 and valor_unitario = 5.00
                    and nota_fiscal = 'NF-123') then
    raise exception 'ACEITE FALHOU: os campos de insumo não guardaram o valor';
  end if;
  delete from public.contas where id = v_id;

  -- c) zero e negativo são recusados — em quantidade e em valor unitário
  begin
    insert into public.contas (tipo, descricao, valor, data_vencimento, status, quantidade)
      values ('pagar', 'Aceite zero', 10, current_date, 'pendente', 0);
    raise exception 'ACEITE FALHOU: aceitou quantidade zero';
  exception when check_violation then null;
  end;
  begin
    insert into public.contas (tipo, descricao, valor, data_vencimento, status, valor_unitario)
      values ('pagar', 'Aceite negativo', 10, current_date, 'pendente', -1);
    raise exception 'ACEITE FALHOU: aceitou valor unitário negativo';
  exception when check_violation then null;
  end;

  raise notice 'Aceite verificado: os três campos de insumo são opcionais, guardam valor e recusam número sem sentido.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260824150000', 'conta_absorve_insumo')
  on conflict (version) do nothing;
