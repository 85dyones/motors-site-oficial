-- ============================================================================
-- F0-l — Fechar a superfície `anon` do núcleo (achados da conferência de drift)
-- ============================================================================
-- A conferência de 2026-08-29 comparou o banco com os arquivos e achou uma
-- divergência e uma superfície herdada. As duas são a mesma lição, e ela já
-- tem nome neste repo (AUDITORIA §3.4, migrações 20260808120000 e
-- 20260812120000): no Supabase, o `pg_default_acl` concede a `anon` e
-- `authenticated` por baixo do pano, e `revoke ... from public` NÃO alcança
-- essas concessões nominais.
--
-- 1. DIVERGÊNCIA: `20260829120000_f0a` declarou
--       revoke all on function public.org_padrao() from public;
--    e o efeito real ficou aquém do declarado — `anon` continuou com EXECUTE
--    pelo default ACL, então `POST /rest/v1/rpc/org_padrao` com a anon key
--    devolvia o uuid da org. Impacto material baixo (um uuid), mas é função
--    SECURITY DEFINER em `public` e o arquivo dizia outra coisa. Arquivo e
--    banco voltam a concordar aqui.
--
-- 2. SUPERFÍCIE HERDADA: as 20 tabelas do núcleo nasceram com GRANT amplo
--    para `anon` (default ACL), e hoje só a RLS as segura. RLS é a camada
--    certa e está de pé — mas ela é a ÚNICA, e o histórico deste projeto tem
--    exatamente esse modo de falha (escrita anônima no estoque em §3.4).
--    Nenhum caminho anônimo precisa do núcleo: o site público lê
--    `estoque_motors`, não estas tabelas. Então `anon` sai por completo.
--
--    `authenticated` FICA: é o papel que o /admin usa via PostgREST, e é a
--    RLS (is_staff + org) que decide o que ele enxerga. Tirar dele quebraria
--    as telas da F1 antes de existirem.
-- ============================================================================

revoke all on function public.org_padrao() from anon;

do $$
declare
  t text;
  tabelas text[] := array[
    'orgs','veiculos','veiculo_entradas','veiculo_eventos','auditoria',
    'veiculo_custos','veiculo_precos','plano_contas','lancamentos','partidas',
    'regras_contabilizacao','regras_comissao','parametros_avaliacao',
    'ciclo_parametros','negocios','negocio_pagamentos',
    'confirmacoes_disponibilidade','documentos','anuncios','renave_operacoes'
  ];
begin
  foreach t in array tabelas loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
  execute 'revoke all on public.veiculo_situacao from anon';
  raise notice 'anon revogado de % tabelas do núcleo + a view de situação.', array_length(tabelas, 1);
end $$;

-- ----------------------------------------------------------------------------
-- 3. `confirmacoes_disponibilidade` vira append-only
--
-- Também da conferência: a policy de UPDATE permitia esticar `valida_ate` de
-- uma confirmação já emitida — e o CHECK não pega, porque `criado_em` não muda.
-- Isso enfraquece justamente a trava anti venda dupla que a tabela existe para
-- sustentar (spec 00/10): confirmação é FATO datado, e prorrogar um fato é
-- reescrever história. Quem precisa de mais prazo pede confirmação nova ao dono
-- da unidade — que é exatamente o gesto que a trava quer forçar.
-- ----------------------------------------------------------------------------
drop policy if exists nucleo_staff_atualiza on public.confirmacoes_disponibilidade;

drop trigger if exists confirmacoes_disponibilidade_append_only on public.confirmacoes_disponibilidade;
create trigger confirmacoes_disponibilidade_append_only
  before update or delete on public.confirmacoes_disponibilidade
  for each row execute function public.nucleo_bloquear_mutacao();

comment on table public.confirmacoes_disponibilidade is
  'A trava anti venda dupla de unidade de terceiro (spec 00/10): sinal e venda exigem confirmação VIGENTE do dono/parceiro. Append-only desde 2026-08-29 — prorrogar validade seria reescrever um fato datado; quem precisa de prazo novo pede confirmação nova.';

-- ----------------------------------------------------------------------------
-- Autoconferência — prova por efeito, do lado de quem ataca
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  falhas int := 0;
  v uuid;
  e uuid;
  c uuid;
begin
  -- 1. anon perdeu EXECUTE na função.
  if has_function_privilege('anon', 'public.org_padrao()', 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon ainda executa org_padrao()';
  end if;

  -- 2. anon perdeu TUDO nas 20 tabelas (o teste que a f0a não fez).
  foreach t in array array[
    'orgs','veiculos','veiculo_entradas','veiculo_eventos','auditoria',
    'veiculo_custos','veiculo_precos','plano_contas','lancamentos','partidas',
    'regras_contabilizacao','regras_comissao','parametros_avaliacao',
    'ciclo_parametros','negocios','negocio_pagamentos',
    'confirmacoes_disponibilidade','documentos','anuncios','renave_operacoes'
  ] loop
    if has_table_privilege('anon', 'public.' || t, 'SELECT')
       or has_table_privilege('anon', 'public.' || t, 'INSERT')
       or has_table_privilege('anon', 'public.' || t, 'UPDATE')
       or has_table_privilege('anon', 'public.' || t, 'DELETE') then
      falhas := falhas + 1;
      raise warning 'FALHOU: anon ainda tem privilégio em %', t;
    end if;
  end loop;

  -- 3. `authenticated` CONTINUA podendo — senão a F1 nasce quebrada.
  if not has_table_privilege('authenticated', 'public.veiculos', 'SELECT')
     or not has_table_privilege('authenticated', 'public.veiculos', 'INSERT')
     or not has_function_privilege('authenticated', 'public.org_padrao()', 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated perdeu acesso — o /admin quebraria';
  end if;

  -- 4. Confirmação de disponibilidade não se prorroga mais.
  insert into public.veiculos (chassi, marca, modelo)
  values ('ACEITE-F0L-000000001', 'Teste', 'Aceite') returning id into v;
  insert into public.veiculo_entradas (veiculo_id, modalidade, posse, valor_entrada, consig_prazo_dias)
  values (v, 'consignacao', 'terceiro', 0, 30) returning id into e;
  insert into public.confirmacoes_disponibilidade (veiculo_id, entrada_id, confirmada_por, valida_ate)
  values (v, e, '00000000-0000-0000-0000-000000000000', now() + interval '2 hours')
  returning id into c;

  begin
    update public.confirmacoes_disponibilidade
       set valida_ate = now() + interval '30 days' where id = c;
    falhas := falhas + 1;
    raise warning 'FALHOU: validade de confirmação foi esticada';
  exception when raise_exception then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % brecha(s) seguem abertas', falhas;
  end if;

  alter table public.confirmacoes_disponibilidade disable trigger confirmacoes_disponibilidade_append_only;
  delete from public.confirmacoes_disponibilidade where id = c;
  alter table public.confirmacoes_disponibilidade enable trigger confirmacoes_disponibilidade_append_only;
  delete from public.veiculo_entradas where id = e;
  delete from public.veiculos where id = v;

  raise notice 'F0-l OK: anon fora do núcleo (20 tabelas + view + função), authenticated intacto, confirmação virou fato datado.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829140000', 'f0l_fechar_superficie_anon_do_nucleo')
  on conflict (version) do nothing;
