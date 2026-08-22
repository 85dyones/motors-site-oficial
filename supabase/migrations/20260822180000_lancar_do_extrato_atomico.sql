-- ===========================================================================
-- Lançar a partir do extrato vira UMA transação — e o rollback some
-- ===========================================================================
-- 2026-08-22. Corrige um defeito da própria entrega anterior, encontrado ao
-- auditar o alcance de `20260821210000_exclusao_financeira_so_admin.sql`.
--
-- ---------------------------------------------------------------------------
-- O defeito
-- ---------------------------------------------------------------------------
-- A rota `/api/financeiro/conciliacao/[id]/lancar` fazia três escritas em
-- sequência — conta paga, movimentação, vínculo — e, se a segunda ou a
-- terceira falhasse, desfazia as anteriores com `.delete()`.
--
-- Só que DELETE nessas tabelas é do Admin, e mais ninguém. E RLS que recusa
-- DELETE **não levanta erro**: ela apaga zero linhas e devolve sucesso. O
-- rollback era um no-op silencioso para exatamente quem usa a tela — a
-- adm/financeira. O resultado seria uma conta paga órfã no razão, que a
-- próxima importação do OFX lançaria de novo: o oposto do que a conciliação
-- existe para fazer.
--
-- Provado contra Postgres real antes de escrever esta migração:
--   DELETE 0
--   🔴 O ROLLBACK NÃO DESFEZ NADA — conta paga órfã fica no razão
--
-- ---------------------------------------------------------------------------
-- Por que a correção NÃO é dar permissão de apagar
-- ---------------------------------------------------------------------------
-- Abrir DELETE para o financeiro desfaria a decisão de 21/08 ("quem aprova
-- não apaga a prova") para consertar um detalhe de implementação. E usar
-- chave de serviço na rota daria a ela o poder de apagar lançamento — o
-- mesmo poder, por outra porta.
--
-- A correção é tirar a necessidade de desfazer: as três escritas viram uma
-- transação no banco. Se qualquer passo falha, o Postgres reverte tudo, de
-- graça e sem depender de permissão nenhuma. Não existe "meio lançado".
--
-- De quebra, isso conserta um buraco que já existia mesmo para o Admin: três
-- viagens HTTP separadas não são atômicas, e uma queda entre a segunda e a
-- terceira deixava a mesma sujeira. Ninguém tinha visto porque só o Admin
-- conseguia limpar — e limpar já era o plano B.
--
-- ---------------------------------------------------------------------------
-- Autorização
-- ---------------------------------------------------------------------------
-- `security definer` roda com os poderes do dono, então a função tem que
-- checar a porta ela mesma: `has_finance_access`. É a mesma régua das policies
-- que ela substitui — nem mais frouxa, nem mais apertada.
-- ===========================================================================

create or replace function public.lancar_do_extrato(
  p_extrato_id   uuid,
  p_categoria_id uuid,
  p_descricao    text default null,
  p_parceiro     text default null,
  p_veiculo_id   text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_linha    public.extrato_bancario%rowtype;
  v_conta_id uuid;
  v_mov_id   uuid;
  v_entrada  boolean;
  v_desc     text;
  v_ligadas  int;
begin
  if not public.has_finance_access(auth.uid()) then
    raise exception 'Sem acesso ao financeiro'
      using errcode = '42501';
  end if;

  if p_categoria_id is null then
    raise exception 'Escolha a categoria — é ela que dá significado ao lançamento no DRE.'
      using errcode = '22023';
  end if;

  select * into v_linha from public.extrato_bancario where id = p_extrato_id;
  if not found then
    raise exception 'Linha do extrato não encontrada' using errcode = 'P0002';
  end if;
  if v_linha.movimentacao_id is not null then
    raise exception 'Esta linha já está conciliada — não há o que lançar.'
      using errcode = '23505';
  end if;

  v_entrada := v_linha.tipo = 'entrada';
  v_desc    := coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), v_linha.descricao);

  -- 1. A conta, já liquidada. As três datas são a do extrato: o único fato
  -- conhecido é o dia em que o dinheiro se moveu.
  insert into public.contas (
    tipo, descricao, valor, data_emissao, data_vencimento, data_pagamento,
    status, categoria_id, veiculo_id, fornecedor, cliente, observacoes, created_by
  ) values (
    case when v_entrada then 'receber' else 'pagar' end,
    v_desc, v_linha.valor, v_linha.data, v_linha.data, v_linha.data,
    'pago', p_categoria_id, nullif(btrim(coalesce(p_veiculo_id,'')), ''),
    case when not v_entrada then nullif(btrim(coalesce(p_parceiro,'')), '') end,
    case when     v_entrada then nullif(btrim(coalesce(p_parceiro,'')), '') end,
    format('Lançado a partir do extrato bancário (%s) em %s.', v_linha.conta, v_linha.data),
    auth.uid()
  ) returning id into v_conta_id;

  -- 2. O caixa. É esta linha que a conciliação enxerga.
  insert into public.movimentacoes (conta_id, tipo, valor, descricao, data_movimentacao, created_by)
  values (v_conta_id, v_linha.tipo, v_linha.valor, 'Extrato: ' || v_desc,
          v_linha.data, auth.uid())
  returning id into v_mov_id;

  -- 3. O vínculo. O `is null` no where é a trava contra duas pessoas
  -- lançando a mesma linha ao mesmo tempo: a segunda liga zero linhas e a
  -- transação inteira volta atrás — inclusive a conta e a movimentação.
  update public.extrato_bancario
     set movimentacao_id = v_mov_id,
         conciliado_em   = now(),
         conciliado_por  = auth.uid(),
         conciliado_como = 'manual'
   where id = p_extrato_id
     and movimentacao_id is null;

  get diagnostics v_ligadas = row_count;
  if v_ligadas <> 1 then
    raise exception 'Esta linha foi conciliada por outra pessoa agora há pouco.'
      using errcode = '40001';
  end if;

  return jsonb_build_object('conta_id', v_conta_id, 'movimentacao_id', v_mov_id);
end;
$function$;

comment on function public.lancar_do_extrato(uuid, uuid, text, text, text) is
  'Lança conta paga + movimentação + vínculo do extrato em UMA transação '
  '(2026-08-22). Existe porque o rollback por DELETE na rota era no-op '
  'silencioso para o financeiro — DELETE ali é só do Admin, e RLS que recusa '
  'DELETE não levanta erro.';

revoke all on function public.lancar_do_extrato(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.lancar_do_extrato(uuid, uuid, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
-- Prova as quatro promessas contra o banco real:
--   a) o financeiro lança, e nascem conta + movimentação + vínculo;
--   b) linha já conciliada é recusada — e não deixa NADA para trás (é aqui
--      que a migração inteira se justifica: era este o caso em que o
--      rollback por DELETE fracassava em silêncio);
--   c) quem não é do financeiro não lança;
--   d) categoria nula é recusada.
do $$
declare
  v_fin      uuid := gen_random_uuid();
  v_estranho uuid := gen_random_uuid();
  v_cat      uuid;
  v_linha    uuid;
  v_outra    uuid;
  v_contas_antes int;
  v_movs_antes   int;
  v_r        jsonb;
begin
  insert into auth.users (id, email, email_confirmed_at)
    values (v_fin, 'aceite.fin@local', now()), (v_estranho, 'aceite.nada@local', now());
  update public.profiles set papeis = array['financeiro'] where id = v_fin;
  update public.profiles set papeis = array['marketing']  where id = v_estranho;

  insert into public.categorias_financeiras (nome, tipo)
    values ('Aceite tarifas', 'despesa') returning id into v_cat;

  insert into public.extrato_bancario (conta, fitid, data, valor, tipo, descricao)
    values ('aceite', 'FIT-A', current_date, 33.70, 'saida', 'Tarifa do banco')
    returning id into v_linha;
  insert into public.extrato_bancario (conta, fitid, data, valor, tipo, descricao)
    values ('aceite', 'FIT-B', current_date, 44.80, 'saida', 'Outra tarifa')
    returning id into v_outra;

  -- (a) o financeiro lança
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_fin::text, 'email', 'aceite.fin@local')::text, true);

  v_r := public.lancar_do_extrato(v_linha, v_cat, null, 'Banco XPTO', null);

  if not exists (select 1 from public.contas
                  where id = (v_r->>'conta_id')::uuid
                    and status = 'pago' and tipo = 'pagar'
                    and valor = 33.70 and categoria_id = v_cat) then
    raise exception 'ACEITE FALHOU: a conta paga não nasceu como prometido';
  end if;
  if not exists (select 1 from public.movimentacoes
                  where id = (v_r->>'movimentacao_id')::uuid and tipo = 'saida') then
    raise exception 'ACEITE FALHOU: a movimentação não nasceu';
  end if;
  if not exists (select 1 from public.extrato_bancario
                  where id = v_linha
                    and movimentacao_id = (v_r->>'movimentacao_id')::uuid
                    and conciliado_como = 'manual') then
    raise exception 'ACEITE FALHOU: a linha do extrato não ficou vinculada';
  end if;

  -- (b) O CASO QUE JUSTIFICA A MIGRAÇÃO: lançar de novo na mesma linha tem
  -- que ser recusado SEM deixar conta nem movimentação órfã. Antes, a
  -- limpeza dependia de um DELETE que o financeiro não pode fazer.
  --
  -- Honestidade sobre o que esta checagem prova: enquanto os três passos
  -- estiverem DENTRO de uma função, ela não tem como falhar — o Postgres põe
  -- um savepoint em volta de cada chamada e desfaz tudo sozinho. Tentei
  -- falsificá-la com uma variante que engolia o erro num sub-bloco e ela
  -- continuou verde, justamente por isso.
  --
  -- Ela não é teatro, é guarda de fronteira: falha no dia em que alguém
  -- devolver estes passos para chamadas separadas — que é exatamente o que a
  -- rota fazia e o que criou o bug. O valor está em quebrar quando a
  -- atomicidade for desfeita, não em quebrar hoje.
  select count(*) into v_contas_antes from public.contas;
  select count(*) into v_movs_antes   from public.movimentacoes;
  begin
    perform public.lancar_do_extrato(v_linha, v_cat, null, null, null);
    raise exception 'ACEITE FALHOU: lançou duas vezes na mesma linha do extrato';
  exception when sqlstate '23505' then
    null; -- recusado, como tem que ser
  end;
  if (select count(*) from public.contas) <> v_contas_antes then
    raise exception 'ACEITE FALHOU: sobrou conta órfã depois da recusa (o bug do rollback)';
  end if;
  if (select count(*) from public.movimentacoes) <> v_movs_antes then
    raise exception 'ACEITE FALHOU: sobrou movimentação órfã depois da recusa';
  end if;

  -- (c) quem não é do financeiro não lança
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_estranho::text, 'email', 'aceite.nada@local')::text, true);
  begin
    perform public.lancar_do_extrato(v_outra, v_cat, null, null, null);
    raise exception 'ACEITE FALHOU: quem não é do financeiro conseguiu lançar';
  exception when sqlstate '42501' then
    null;
  end;

  -- (d) categoria é obrigatória
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_fin::text, 'email', 'aceite.fin@local')::text, true);
  begin
    perform public.lancar_do_extrato(v_outra, null, null, null, null);
    raise exception 'ACEITE FALHOU: lançou sem categoria';
  exception when sqlstate '22023' then
    null;
  end;

  -- Limpeza (como dono da função, fora de RLS).
  delete from public.extrato_bancario where conta = 'aceite';
  delete from public.movimentacoes where descricao like 'Extrato: %'
     and data_movimentacao = current_date and valor in (33.70, 44.80);
  delete from public.contas where observacoes like 'Lançado a partir do extrato bancário (aceite)%';
  delete from public.categorias_financeiras where id = v_cat;
  delete from auth.users where id in (v_fin, v_estranho);
  perform set_config('request.jwt.claims', null, true);

  raise notice 'Aceite verificado: lança em uma transação, recusa duplicata SEM deixar órfã, exige financeiro e exige categoria.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260822180000', 'lancar_do_extrato_atomico')
  on conflict (version) do nothing;
