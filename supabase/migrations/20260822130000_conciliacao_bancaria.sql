-- ---------------------------------------------------------------------------
-- Conciliação bancária — P4 do briefing de 2026-08-21.
--
-- *"Outra coisa que faço por lá é a conciliação bancária"* — adm/financeira.
-- Era o último dos seis pedidos dela que ainda vivia fora do painel.
--
-- ---------------------------------------------------------------------------
-- RENUMERADA em 2026-08-22: esta migração era `20260822120000`
-- ---------------------------------------------------------------------------
-- Duas migrações nasceram com o mesmo número no mesmo dia, em trabalhos
-- paralelos: esta e `20260822120000_perfil_investidor.sql`. `version` é chave
-- primária do livro-razão, então o número fica com quem chegou primeiro em
-- `main` — foi a outra. Esta cedeu.
--
-- Não é detalhe de arquivo. Com o número duplicado, um `supabase db push`
-- veria a versão já registrada e **pularia a outra migração inteira**, sem
-- erro nenhum: o código dela iria para produção referenciando tabelas que
-- nunca foram criadas. Colisão de timestamp falha em silêncio, e é por isso
-- que ela vale um bloco de comentário e não uma linha de changelog.
--
-- A produção aplicou ESTA com o número antigo, então o livro-razão de lá
-- ficou apontando para o arquivo errado. O acerto está em
-- `supabase/manutencao/acertar_livro_razao_da_colisao.sql`.
--
-- ---------------------------------------------------------------------------
-- A fonte: OFX, e por quê
-- ---------------------------------------------------------------------------
-- OFX é um arquivo que o banco já entrega hoje pelo internet banking, de
-- graça, sem contrato nem certificação. Open Finance dá extrato ao vivo e
-- custa contrato, prazo e fornecedor — decisão de negócio que pode acontecer
-- depois. Este schema NÃO fala de OFX em lugar nenhum: guarda "uma linha de
-- extrato" com a chave que o banco deu a ela. Trocar a fonte um dia não mexe
-- em nada aqui.
--
-- ---------------------------------------------------------------------------
-- A decisão que o schema carrega: o extrato é PROVA, não lançamento
-- ---------------------------------------------------------------------------
-- Linha de extrato não vira movimentação automaticamente, e a tabela nova não
-- entra em nenhum cálculo de saldo. O caixa do sistema continua sendo
-- `movimentacoes`, alimentado pela baixa de conta — quem manda é o ato
-- registrado pela operação, não o que o banco conta.
--
-- Isso é o oposto de "importar o extrato para dentro do caixa", que parece
-- prático e destrói a conciliação: se o extrato virasse lançamento, tudo
-- fecharia sempre, e a pergunta que a conciliação existe para responder
-- ("o que saiu da conta e ninguém lançou?") não teria mais como ser feita.
--
-- ---------------------------------------------------------------------------
-- Idempotência: `fitid` é do banco, e é único por conta
-- ---------------------------------------------------------------------------
-- Ela vai baixar "últimos 30 dias" toda semana, e os arquivos se sobrepõem.
-- O `FITID` do OFX é o identificador que o BANCO dá à transação; a unicidade
-- é (conta bancária, fitid), não `fitid` sozinho — dois bancos podem emitir o
-- mesmo número sem nenhuma relação entre as transações.
-- ---------------------------------------------------------------------------

create table if not exists public.extrato_bancario (
  id uuid primary key default gen_random_uuid(),

  -- Identificação da conta no arquivo (BANKID/ACCTID do OFX). Texto livre
  -- porque o formato varia por banco, e normalizar aqui só criaria uma régua
  -- que o próximo banco quebra. `(conta, fitid)` é o que precisa ser único.
  banco text,
  conta text not null default 'padrao',

  fitid text not null,
  data date not null,
  -- Positivo sempre: o lado mora em `tipo`, como em `movimentacoes` e nos
  -- aportes de investidor.
  valor numeric(12, 2) not null check (valor > 0),
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null default '',

  -- O vínculo. NULL = ainda não conciliado; é o estado que a tela mostra
  -- como "só no banco" — o achado que a conciliação existe para produzir.
  -- ON DELETE SET NULL: apagar a movimentação (só o admin faz, desde
  -- 20260821210000) desfaz o vínculo, nunca apaga a prova do banco.
  movimentacao_id uuid references public.movimentacoes(id) on delete set null,
  conciliado_em timestamptz,
  conciliado_por uuid references public.profiles(id),
  -- `automatico` = par inequívoco pelo motor; `manual` = uma pessoa confirmou
  -- uma sugestão. A distinção importa na auditoria: casamento confirmado por
  -- gente tem dono.
  conciliado_como text check (conciliado_como in ('automatico', 'manual')),

  importado_em timestamptz not null default now(),
  importado_por uuid references public.profiles(id)
);

comment on table public.extrato_bancario is
  'Linhas do extrato do banco (P4, 2026-08-21). PROVA, não lançamento: não '
  'entra em cálculo de saldo e nunca vira movimentação sozinha. O caixa do '
  'sistema continua sendo `movimentacoes`.';
comment on column public.extrato_bancario.fitid is
  'Identificador que o BANCO deu à transação. A chave da idempotência: '
  'reimportar extrato sobreposto não duplica.';
comment on column public.extrato_bancario.movimentacao_id is
  'NULL = não conciliado, o achado da tela. ON DELETE SET NULL para que '
  'apagar a movimentação nunca apague a prova do banco.';

-- A régua da idempotência.
create unique index if not exists idx_extrato_conta_fitid
  on public.extrato_bancario (conta, fitid);

-- Uma movimentação concilia com no máximo UMA linha — a regra "um para um" do
-- motor, aplicada também no banco. Sem isto, dois cliques na mesma sugestão
-- deixariam a mesma movimentação casada duas vezes e o total de conciliado
-- passaria a mentir.
create unique index if not exists idx_extrato_movimentacao
  on public.extrato_bancario (movimentacao_id)
  where movimentacao_id is not null;

create index if not exists idx_extrato_data on public.extrato_bancario (data);
create index if not exists idx_extrato_pendente
  on public.extrato_bancario (data)
  where movimentacao_id is null;

-- ---------------------------------------------------------------------------
-- RLS — a mesma porta do módulo, com a exclusão do admin
-- ---------------------------------------------------------------------------
-- O desenho de `20260821210000`: quem opera lê, lança e corrige; apagar é do
-- admin. Linha de extrato é registro de dinheiro como qualquer outro — e
-- apagá-la é justamente como alguém esconderia uma pendência incômoda.

alter table public.extrato_bancario enable row level security;

drop policy if exists "Financeiro le extrato_bancario" on public.extrato_bancario;
create policy "Financeiro le extrato_bancario" on public.extrato_bancario
  for select using (public.has_finance_access(auth.uid()));

drop policy if exists "Financeiro importa extrato_bancario" on public.extrato_bancario;
create policy "Financeiro importa extrato_bancario" on public.extrato_bancario
  for insert with check (public.has_finance_access(auth.uid()));

drop policy if exists "Financeiro concilia extrato_bancario" on public.extrato_bancario;
create policy "Financeiro concilia extrato_bancario" on public.extrato_bancario
  for update using (public.has_finance_access(auth.uid()))
             with check (public.has_finance_access(auth.uid()));

drop policy if exists "Somente admin apaga extrato_bancario" on public.extrato_bancario;
create policy "Somente admin apaga extrato_bancario" on public.extrato_bancario
  for delete using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------

do $ac$
declare
  v_fin uuid;
  v_mov uuid;
  v_linha uuid;
  qtd int;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-conciliacao@exemplo.invalido', now(), now())
  returning id into v_fin;
  update public.profiles set papeis = array['financeiro'] where id = v_fin;

  insert into public.movimentacoes (tipo, valor, descricao, data_movimentacao)
  values ('saida', 1234.56, 'Autoconf conciliação', current_date)
  returning id into v_mov;

  insert into public.extrato_bancario (conta, fitid, data, valor, tipo, descricao)
  values ('12345-6', 'FIT-AUTOCONF-1', current_date, 1234.56, 'saida', 'PAGTO')
  returning id into v_linha;

  -- (a) Reimportar a mesma linha da mesma conta é recusado — a idempotência
  -- que faz "baixar os últimos 30 dias toda semana" ser seguro.
  begin
    insert into public.extrato_bancario (conta, fitid, data, valor, tipo, descricao)
    values ('12345-6', 'FIT-AUTOCONF-1', current_date, 1234.56, 'saida', 'PAGTO');
    raise exception 'ACEITE FALHOU: reimportação duplicou a linha do extrato';
  exception when unique_violation then null;
  end;

  -- (b) Mas o MESMO fitid em OUTRA conta bancária é transação diferente.
  insert into public.extrato_bancario (conta, fitid, data, valor, tipo, descricao)
  values ('99999-9', 'FIT-AUTOCONF-1', current_date, 10, 'entrada', 'outro banco');

  -- (c) Valor não positivo é recusado: o lado mora em `tipo`.
  begin
    insert into public.extrato_bancario (conta, fitid, data, valor, tipo, descricao)
    values ('12345-6', 'FIT-NEG', current_date, -5, 'saida', 'negativo');
    raise exception 'ACEITE FALHOU: linha de extrato com valor negativo foi aceita';
  exception when check_violation then null;
  end;

  -- (d) Um para um: a mesma movimentação não concilia com duas linhas.
  update public.extrato_bancario set movimentacao_id = v_mov where id = v_linha;
  begin
    update public.extrato_bancario set movimentacao_id = v_mov
     where conta = '99999-9' and fitid = 'FIT-AUTOCONF-1';
    raise exception 'ACEITE FALHOU: a mesma movimentação conciliou com duas linhas';
  exception when unique_violation then null;
  end;

  -- (e) Apagar a movimentação desfaz o vínculo e PRESERVA a prova do banco.
  delete from public.movimentacoes where id = v_mov;
  select count(*) into qtd from public.extrato_bancario where id = v_linha;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: apagar a movimentação levou a linha do extrato junto';
  end if;
  if (select movimentacao_id from public.extrato_bancario where id = v_linha) is not null then
    raise exception 'ACEITE FALHOU: o vínculo sobreviveu à exclusão da movimentação';
  end if;

  -- (f) O financeiro concilia, mas não apaga linha de extrato — é assim que
  -- alguém esconderia uma pendência incômoda.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.extrato_bancario set descricao = 'corrigido' where id = v_linha;
  get diagnostics qtd = row_count;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o financeiro não conseguiu conciliar (% linhas)', qtd;
  end if;

  delete from public.extrato_bancario where id = v_linha;
  get diagnostics qtd = row_count;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: o financeiro apagou linha de extrato';
  end if;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  delete from public.extrato_bancario where fitid in ('FIT-AUTOCONF-1', 'FIT-NEG');
  delete from public.profiles where id = v_fin;
  delete from auth.users where id = v_fin;

  raise notice 'Aceite verificado: idempotência por (conta, fitid), um-para-um, prova indelével e exclusão fora do financeiro.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260822130000', 'conciliacao_bancaria')
  on conflict (version) do nothing;
