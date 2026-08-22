-- ---------------------------------------------------------------------------
-- A aprovação chega ao cadastro de despesa recorrente.
--
-- O flanco que `20260821150000` deixou aberto de propósito, e que o próprio
-- documento registrou como pendência: a GERAÇÃO mensal passa direto (o
-- compromisso já foi assumido, e mandá-la à fila criaria uma avalanche de
-- aprovações idênticas todo mês), mas o CADASTRO de uma recorrente nova
-- também passava — e ele é a decisão de gasto mais pesada do módulo.
--
-- Assinar uma recorrente de R$ 1.200/mês compromete R$ 14.400 no ano, sem
-- nenhuma conta a pagar existir ainda. É justamente o exemplo que derrubou a
-- alçada por valor: numa revenda, o gasto recorrente novo é o que compromete
-- caixa de verdade. Faz sentido que ele vá ao Gestor.
--
-- ---------------------------------------------------------------------------
-- Duas colunas de estado, e não uma
-- ---------------------------------------------------------------------------
-- `despesas_recorrentes` já tem `ativa boolean`: é o interruptor "esta
-- recorrente gera conta?". Ele NÃO serve para representar aprovação — uma
-- recorrente desligada pela operação e uma esperando o Gestor são estados
-- diferentes, com donos diferentes, e sobrepô-los faria "reativar" virar
-- "aprovar" sem que ninguém tivesse decidido nada.
--
-- Daí `aprovacao_status` separada. A geração exige as DUAS coisas:
-- `ativa = true and aprovacao_status = 'aprovada'`.
--
-- ---------------------------------------------------------------------------
-- O default é `aprovada`, e isso é deliberado
-- ---------------------------------------------------------------------------
-- Toda recorrente que já existe está rodando hoje — o aluguel da loja, a
-- energia, a internet. Nascer `aguardando` congelaria o pagamento de tudo até
-- alguém clicar, e a primeira consequência da migração seria a loja deixar de
-- pagar contas. Retroatividade aqui é dano, não rigor: a régua vale do
-- cadastro novo em diante.
-- ---------------------------------------------------------------------------

alter table public.despesas_recorrentes
  add column if not exists aprovacao_status text not null default 'aprovada',
  add column if not exists aprovacao_decidida_por uuid references public.profiles(id),
  add column if not exists aprovacao_decidida_em timestamptz,
  add column if not exists aprovacao_motivo text;

alter table public.despesas_recorrentes
  drop constraint if exists despesas_recorrentes_aprovacao_status_check;
alter table public.despesas_recorrentes
  add constraint despesas_recorrentes_aprovacao_status_check
  check (aprovacao_status in ('aprovada', 'aguardando', 'recusada'));

comment on column public.despesas_recorrentes.aprovacao_status is
  'Estado da aprovação do CADASTRO (2026-08-22). Separado de `ativa`: '
  'desligada pela operação e esperando o Gestor são estados diferentes. '
  'A geração exige `ativa and aprovacao_status = ''aprovada''`.';

-- Índice da fila: o Gestor pergunta "o que está esperando?", e a resposta não
-- deve varrer a tabela inteira.
create index if not exists idx_recorrentes_aguardando
  on public.despesas_recorrentes (aprovacao_status)
  where aprovacao_status = 'aguardando';

-- Carimbo da decisão, gêmeo do de `contas` (20260821150000): se a rota
-- esquecer o instante, o banco preenche. O QUEM continua vindo da rota — o
-- banco não sabe quem clicou.
create or replace function public.carimbar_decisao_de_recorrente() returns trigger as $$
begin
  if old.aprovacao_status = 'aguardando'
     and new.aprovacao_status is distinct from old.aprovacao_status
     and new.aprovacao_decidida_em is null
  then
    new.aprovacao_decidida_em := now();
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_carimbar_decisao_de_recorrente on public.despesas_recorrentes;
create trigger trg_carimbar_decisao_de_recorrente
  before update on public.despesas_recorrentes
  for each row execute function public.carimbar_decisao_de_recorrente();

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------

do $ac$
declare
  v_rec uuid;
  v_quando timestamptz;
  qtd int;
begin
  -- (a) O que já existe continua rodando. É a promessa que impede a migração
  -- de virar "a loja parou de pagar as contas".
  insert into public.despesas_recorrentes (descricao, valor, frequencia, dia_vencimento)
  values ('Autoconf aluguel antigo', 5000, 'mensal', 10)
  returning id into v_rec;
  if (select aprovacao_status from public.despesas_recorrentes where id = v_rec) <> 'aprovada' then
    raise exception 'ACEITE FALHOU: recorrente existente não nasceu aprovada';
  end if;

  -- (b) Estado inventado é recusado.
  begin
    update public.despesas_recorrentes set aprovacao_status = 'em_analise' where id = v_rec;
    raise exception 'ACEITE FALHOU: estado de aprovação inventado foi aceito';
  exception when check_violation then null;
  end;

  -- (c) `ativa` e `aprovacao_status` são independentes: desligar não recusa, e
  -- recusar não desliga. Sobrepor os dois faria "reativar" virar "aprovar".
  update public.despesas_recorrentes
     set aprovacao_status = 'aguardando', ativa = true where id = v_rec;
  select count(*) into qtd from public.despesas_recorrentes
   where id = v_rec and ativa = true and aprovacao_status = 'aguardando';
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: ativa e aprovacao_status não são independentes';
  end if;

  -- (d) A régua da geração: ativa E aprovada. Aguardando não gera.
  select count(*) into qtd from public.despesas_recorrentes
   where id = v_rec and ativa = true and aprovacao_status = 'aprovada';
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: recorrente aguardando entrou na régua da geração';
  end if;

  -- (e) Sair de `aguardando` carimba o instante mesmo sem a rota.
  update public.despesas_recorrentes set aprovacao_status = 'aprovada' where id = v_rec;
  select aprovacao_decidida_em into v_quando from public.despesas_recorrentes where id = v_rec;
  if v_quando is null then
    raise exception 'ACEITE FALHOU: decisão de recorrente saiu sem carimbo de instante';
  end if;

  -- (f) E o carimbo não dispara fora do estado de aprovação.
  update public.despesas_recorrentes set aprovacao_decidida_em = null where id = v_rec;
  update public.despesas_recorrentes set ativa = false where id = v_rec;
  select aprovacao_decidida_em into v_quando from public.despesas_recorrentes where id = v_rec;
  if v_quando is not null then
    raise exception 'ACEITE FALHOU: carimbo disparou fora do estado de aprovação';
  end if;

  delete from public.despesas_recorrentes where id = v_rec;

  raise notice 'Aceite verificado: existente nasce aprovada, estados independentes, aguardando não gera e o carimbo da decisão.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260822150000', 'aprovacao_de_recorrente')
  on conflict (version) do nothing;
