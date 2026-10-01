-- ============================================================================
-- O custo de aquisição do vendido sai da sessão
-- ============================================================================
-- Achado de 2026-10-01, na revisão de 20261001150000 (documento e custo do
-- estoque só para a equipe). `veiculos_vendidos` tem a policy
-- `veiculos_vendidos_cliente_le` — `USING (cliente_id = cliente_atual())` — e
-- o `authenticated` tinha SELECT na tabela inteira, dado pelo laço da fundação
-- (20260813150000). Com a própria sessão, o cliente da Garagem fazia
--
--   GET /rest/v1/veiculos_vendidos?select=valor_venda,custo_aquisicao
--
-- e recebia, do carro que comprou, quanto pagou E quanto a loja pagou: a
-- margem da venda. A matriz de permissões (`src/lib/permissoes.ts`, "Ver custo
-- de aquisição e margem") dá custo só a Admin, Gestor e Financeiro. Medido em
-- 01/10: 1 venda na tabela, custo nulo — o furo era de desenho, sem dado
-- vazado.
--
-- ---------------------------------------------------------------------------
-- O desenho: a coluna sai do authenticated inteiro
-- ---------------------------------------------------------------------------
-- RLS não recorta coluna, e privilégio de coluna não distingue usuário — o
-- cliente e o vendedor são o mesmo papel `authenticated`. O `authenticated`
-- passa a ler da tabela tudo MENOS `custo_aquisicao`. Chassi e placa ficam:
-- são do carro do próprio cliente, e a Garagem e a exportação de LGPD os
-- mostram.
--
-- Por que não há view da equipe, como em `estoque_motors_equipe`: ninguém lê
-- esse custo pela sessão. Conferido em 01/10, no código e no catálogo:
--
--   - Garagem (`/garagem`, `/garagem/meus-dados`): colunas do carro, sem custo.
--   - Painel do Ciclo (`/api/ciclo/revisoes`, `/vendas/estoque`, a saída):
--     id, placa, marca, modelo, km, `saiu_em`, `estoque_id` — sem custo.
--   - `vw_vendas_incompletas` e `vw_ciclo_estado` (que alimenta
--     `vw_ciclo_estado_painel`) rodam como DONA e não usam o custo.
--   - Funções invoker que leem a tabela (`abrir_proxima_janela`,
--     `calcular_conformidade_diaria`, `montar_fila_de_gatilhos`, a abertura de
--     janelas): colunas explícitas, nenhuma é o custo.
--   - Policies de OUTRAS tabelas que consultam esta na pele de quem pergunta
--     (registro de KM e de revisão pelo cliente; o Diário de bordo no
--     storage): `id`, `cliente_id`, `saiu_em`.
--   - A carência do vendido (`lib/publicacao.ts`) e a fila do motor leem com
--     a chave de serviço.
--
-- O dia em que o painel precisar MOSTRAR o custo do vendido a quem pode ver
-- custo, ele sai por uma porta própria (view que roda como dona, cortada por
-- papel — o molde é `estoque_motors_equipe`), não devolvendo a coluna ao
-- `authenticated`. Coluna concedida volta para o cliente junto.
--
-- O que NÃO muda:
--   - INSERT, UPDATE e DELETE do `authenticated`. `fechar_venda_ciclo` roda
--     como quem chama e GRAVA o custo; a saída da Garagem grava `saiu_em`.
--     Escrever não exige ler — e o `returning id` só pede o `id`.
--   - As policies de linha, o `anon` (nada, desde a fundação) e o
--     `service_role` (n8n, sync, motor).
--
-- Não depende de deploy: o código no ar já não pede o custo nem `*` desta
-- tabela (`tests/custo-do-vendido-fora-da-sessao.test.ts` trava isso). Pode
-- ir antes ou depois do merge.
--
-- ⚠️ NUMA TRANSAÇÃO SÓ. O revoke sem o grant deixa o `authenticated` sem
-- leitura nenhuma: a Garagem e o painel do Ciclo caem. `aplicar-migracao.js`
-- já roda tudo junto; `psql -f` precisa de `-1`.
--
-- ⚠️ DESFAZER: `supabase/manutencao/reversao/custo-do-vendido-2026-10-01.sql`.
--
-- ⚠️ COLUNA NOVA em `veiculos_vendidos` nasce fechada para o `authenticated`
-- (o grant agora é por coluna). Se for de ler pela sessão, a migração que a
-- cria concede `grant select (coluna) … to authenticated` e a põe na lista do
-- teste. A autoconferência abaixo falha se a tabela tiver coluna fora das duas
-- listas. Reaplicar esta migração depois disso derruba os grants de coluna
-- posteriores (o revoke de tabela os leva) — por isso ela aborta no passo 1.
-- ============================================================================

revoke select on public.veiculos_vendidos from authenticated;

grant select (
  id, cliente_id, estoque_id, chassi, placa, marca, modelo, versao,
  ano_fabricacao, ano_modelo, data_venda, km_na_venda, valor_venda,
  aderiu_ciclo, vendedor, created_at, vendedor_id, saiu_em, motivo_saida
) on public.veiculos_vendidos to authenticated;


-- ==========================================================
-- Autoconferência
-- ==========================================================
do $$
declare
  pela_sessao text[] := array[
    'id', 'cliente_id', 'estoque_id', 'chassi', 'placa', 'marca', 'modelo',
    'versao', 'ano_fabricacao', 'ano_modelo', 'data_venda', 'km_na_venda',
    'valor_venda', 'aderiu_ciclo', 'vendedor', 'created_at', 'vendedor_id',
    'saiu_em', 'motivo_saida'
  ];
  fora_da_sessao text[] := array['custo_aquisicao'];
  c              text;
  p              text;
  sobra          text[];
  total          int;
  n              int;
  de_fora        uuid := gen_random_uuid();
  o_cliente      uuid;
  id_do_cliente  uuid;
  vendas_dele    int;
  carro_dele     uuid;
  saiu_dele      date;
  da_equipe      uuid;
  alvo           uuid;
  lido           uuid;
  saiu_atual     date;
  motivo_atual   text;
  chassi_ensaio  text := 'ENSAIO' || upper(replace(gen_random_uuid()::text, '-', ''));
  custo_gravado  numeric;
  falhas         int := 0;
begin
  -- 1. Nenhuma coluna sem decisão.
  select array_agg(column_name::text order by ordinal_position) into sobra
    from information_schema.columns
   where table_schema = 'public' and table_name = 'veiculos_vendidos'
     and not (column_name = any(pela_sessao) or column_name = any(fora_da_sessao));
  if sobra is not null then
    falhas := falhas + 1;
    raise warning 'FALHA: coluna(s) de veiculos_vendidos fora das duas listas: %', sobra;
  end if;

  -- 2. O authenticated: sem SELECT de tabela, lê cada coluna da sessão e não
  --    lê o custo — e continua escrevendo, inclusive o custo.
  if has_table_privilege('authenticated', 'public.veiculos_vendidos', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated ainda tem SELECT de tabela';
  end if;
  foreach c in array pela_sessao loop
    if not has_column_privilege('authenticated', 'public.veiculos_vendidos', c, 'select') then
      falhas := falhas + 1;
      raise warning 'FALHA: o authenticated perdeu a coluna %', c;
    end if;
  end loop;
  foreach c in array fora_da_sessao loop
    if has_column_privilege('authenticated', 'public.veiculos_vendidos', c, 'select') then
      falhas := falhas + 1;
      raise warning 'FALHA: o authenticated ainda lê %', c;
    end if;
    if not has_column_privilege('authenticated', 'public.veiculos_vendidos', c, 'insert')
       or not has_column_privilege('authenticated', 'public.veiculos_vendidos', c, 'update') then
      falhas := falhas + 1;
      raise warning 'FALHA: o authenticated perdeu a escrita de % — o fechamento da venda cairia', c;
    end if;
  end loop;
  foreach p in array array['insert', 'update', 'delete'] loop
    if not has_table_privilege('authenticated', 'public.veiculos_vendidos', p) then
      falhas := falhas + 1;
      raise warning 'FALHA: o authenticated perdeu % na tabela', p;
    end if;
  end loop;
  if has_any_column_privilege('anon', 'public.veiculos_vendidos', 'select') then
    falhas := falhas + 1;
    raise warning 'FALHA: o anon lê alguma coluna de veiculos_vendidos';
  end if;

  -- 3. Na prática, como o PostgREST faria.
  select count(*) into total from public.veiculos_vendidos;

  select cl.auth_user_id, cl.id into o_cliente, id_do_cliente
    from public.clientes cl
   where cl.auth_user_id is not null
     and exists (select 1 from public.veiculos_vendidos vv where vv.cliente_id = cl.id)
   limit 1;
  select count(*) into vendas_dele from public.veiculos_vendidos where cliente_id = id_do_cliente;
  select id, saiu_em into carro_dele, saiu_dele
    from public.veiculos_vendidos where cliente_id = id_do_cliente
   order by data_venda desc limit 1;

  select id into da_equipe from public.profiles
   where is_active = true
     and papeis && array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr']
   limit 1;
  select id, saiu_em, motivo_saida into alvo, saiu_atual, motivo_atual
    from public.veiculos_vendidos order by created_at limit 1;

  -- 3a. Uma sessão qualquer (um id sem perfil nem cliente). Privilégio de
  --     coluna é conferido ANTES de olhar linha: o custo é recusado mesmo sem
  --     linha nenhuma à vista — e também como FILTRO, que sem isso viraria um
  --     oráculo (`?custo_aquisicao=gt.80000` responde sim ou não).
  perform set_config('request.jwt.claims', json_build_object('sub', de_fora::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', de_fora::text, true);
  set local role authenticated;

  select count(*) into n from (select id, placa, marca from public.veiculos_vendidos) x;
  if n <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHA: quem não é cliente nem equipe leu % venda(s)', n;
  end if;
  begin
    perform custo_aquisicao from public.veiculos_vendidos limit 1;
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated leu custo_aquisicao';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform * from public.veiculos_vendidos limit 1;
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated leu select * — o custo vai junto';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform id from public.veiculos_vendidos where custo_aquisicao > 0 limit 1;
    falhas := falhas + 1;
    raise warning 'FALHA: o authenticated filtrou por custo_aquisicao — dá para adivinhar o valor';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  -- 3b. O cliente da Garagem, com a sessão dele.
  if o_cliente is null then
    raise notice 'Sem cliente com login e venda: a prova da Garagem ficou de fora (a 3a vale para qualquer sessão).';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', o_cliente::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', o_cliente::text, true);
    set local role authenticated;

    -- `/garagem`, como a página lê.
    select count(*) into n from (
      select id, placa, marca, modelo, versao, ano_modelo, data_venda, km_na_venda, saiu_em
        from public.veiculos_vendidos
       where cliente_id = public.cliente_atual()
       order by data_venda desc
    ) x;
    if n <> vendas_dele then
      falhas := falhas + 1;
      raise warning 'FALHA: a Garagem do cliente leu % de % carro(s)', n, vendas_dele;
    end if;

    -- `/garagem/meus-dados` — a exportação de LGPD.
    select count(*) into n from (
      select id, placa, marca, modelo, versao, ano_fabricacao, ano_modelo, chassi, data_venda, km_na_venda
        from public.veiculos_vendidos
       where cliente_id = public.cliente_atual()
    ) x;
    if n <> vendas_dele then
      falhas := falhas + 1;
      raise warning 'FALHA: a exportação de LGPD leu % de % carro(s)', n, vendas_dele;
    end if;

    -- A subconsulta da policy do Diário de bordo (storage.objects), que roda
    -- na pele de quem envia a foto.
    select count(*) into n from (
      select vv.id::text from public.veiculos_vendidos vv where vv.cliente_id = public.cliente_atual()
    ) x;
    if n <> vendas_dele or not public.e_veiculo_do_cliente(carro_dele) then
      falhas := falhas + 1;
      raise warning 'FALHA: o Diário de bordo não reconhece o carro do cliente';
    end if;

    -- O registro de KM pela Garagem (`/api/garagem/km`), de verdade: a policy
    -- de INSERT consulta `veiculos_vendidos` (id, saiu_em) na pele do cliente.
    -- Desfeito aqui mesmo: o bloco termina numa exceção própria.
    if saiu_dele is null then
      begin
        insert into public.leituras_odometro (veiculo_vendido_id, km, origem)
        values (carro_dele, 1, 'cliente');
        raise exception 'PROVA_DESFEITA';
      exception when others then
        if not (sqlstate = 'P0001' and sqlerrm = 'PROVA_DESFEITA') then
          falhas := falhas + 1;
          raise warning 'FALHA: o cliente não registra KM — % (%)', sqlerrm, sqlstate;
        end if;
      end;
    end if;

    begin
      perform custo_aquisicao from public.veiculos_vendidos where cliente_id = public.cliente_atual();
      falhas := falhas + 1;
      raise warning 'FALHA: o cliente leu o custo de aquisição do próprio carro';
    exception when insufficient_privilege then
      null;
    end;
    reset role;
  end if;

  -- 3c. A equipe.
  if da_equipe is null then
    falhas := falhas + 1;
    raise warning 'FALHA: nenhum perfil ativo da equipe para a prova';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', da_equipe::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', da_equipe::text, true);
    set local role authenticated;

    -- `/api/ciclo/revisoes`: a lista de veículos do programa.
    select count(*) into n from (
      select id, placa, marca, modelo, km_na_venda, saiu_em, cliente_id
        from public.veiculos_vendidos order by created_at desc limit 300
    ) x;
    if n <> least(total, 300) then
      falhas := falhas + 1;
      raise warning 'FALHA: o painel do Ciclo leu % de % venda(s)', n, total;
    end if;

    -- `/api/ciclo/vendas/estoque` e as pendências (view que roda como dona).
    perform estoque_id from public.veiculos_vendidos where estoque_id is not null;
    select count(*) into n from public.vw_vendas_incompletas;
    if n <> total then
      falhas := falhas + 1;
      raise warning 'FALHA: vw_vendas_incompletas mostrou % de % venda(s) à equipe', n, total;
    end if;

    -- Ninguém lê o custo pela sessão — a equipe também não.
    begin
      perform custo_aquisicao from public.veiculos_vendidos limit 1;
      falhas := falhas + 1;
      raise warning 'FALHA: a equipe leu custo_aquisicao pela sessão — então o cliente também lê';
    exception when insufficient_privilege then
      null;
    end;

    -- A saída da Garagem (`PATCH /api/ciclo/veiculos/[id]/saida`): UPDATE com
    -- `returning id`, gravando os valores que a linha já tem. Desfeito.
    if alvo is not null then
      n := -1;
      begin
        update public.veiculos_vendidos
           set saiu_em = saiu_atual, motivo_saida = motivo_atual
         where id = alvo
        returning id into lido;
        get diagnostics n = row_count;
        raise exception 'PROVA_DESFEITA';
      exception when others then
        if not (sqlstate = 'P0001' and sqlerrm = 'PROVA_DESFEITA') then
          falhas := falhas + 1;
          raise warning 'FALHA: a equipe não registra a saída — % (%)', sqlerrm, sqlstate;
        end if;
      end;
      if n <> 1 then
        falhas := falhas + 1;
        raise warning 'FALHA: o UPDATE da saída não alcançou a venda % (row_count %)', alvo, n;
      end if;
    end if;

    -- O fechamento da venda (`fechar_venda_ciclo`, invoker), de verdade: cria
    -- cliente, grava o carro COM custo, a primeira leitura de KM, a primeira
    -- janela (que relê a tabela) e o contrato. Tudo desfeito no fim do bloco;
    -- o custo gravado é conferido como dona antes de desfazer.
    begin
      perform public.fechar_venda_ciclo(jsonb_build_object(
        'cpf_cnpj', 'ENSAIO-' || de_fora::text,
        'nome', 'Ensaio da migração 20261001180000',
        'telefone_e164', '+5541000000000',
        'email', 'ensaio@ensaio.invalid',
        'chassi', chassi_ensaio,
        'placa', 'ENS0A00',
        'marca', 'Ensaio',
        'modelo', 'Ensaio',
        'ano_fabricacao', 2020,
        'ano_modelo', 2020,
        'data_venda', current_date,
        'km_na_venda', 1000,
        'valor_venda', 100000,
        'custo_aquisicao', 90000,
        'consentimento_lgpd', true,
        'aderiu_ciclo', true
      ));
      reset role;
      select custo_aquisicao into custo_gravado
        from public.veiculos_vendidos where chassi = chassi_ensaio;
      raise exception 'PROVA_DESFEITA';
    exception when others then
      if not (sqlstate = 'P0001' and sqlerrm = 'PROVA_DESFEITA') then
        falhas := falhas + 1;
        raise warning 'FALHA: a equipe não fecha venda pela sessão — % (%)', sqlerrm, sqlstate;
      end if;
    end;
    if custo_gravado is distinct from 90000 then
      falhas := falhas + 1;
      raise warning 'FALHA: o fechamento da venda não gravou o custo (lido: %)', custo_gravado;
    end if;

    reset role;
  end if;

  if exists (select 1 from public.veiculos_vendidos where chassi = chassi_ensaio) then
    falhas := falhas + 1;
    raise warning 'FALHA: a venda de ensaio ficou gravada';
  end if;

  if falhas = 0 then
    raise notice 'Autoconferência OK: o authenticated lê % colunas de veiculos_vendidos e não lê %; o cliente lê os % carro(s) dele, a equipe as % venda(s); custo recusado também como filtro; o fechamento da venda grava o custo pela sessão.',
      cardinality(pela_sessao), fora_da_sessao, vendas_dele, total;
  else
    raise exception 'Autoconferência falhou em % ponto(s).', falhas;
  end if;
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20261001180000', 'custo_do_vendido_fora_da_sessao')
  on conflict (version) do nothing;
