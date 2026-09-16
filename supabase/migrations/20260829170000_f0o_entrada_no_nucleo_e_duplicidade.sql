-- ============================================================================
-- F0-o — O cadastro nativo passa a nascer NO NÚCLEO, e a duplicidade acaba
-- ============================================================================
-- Duas decisões do dono em 2026-08-29, sobre as pendências que as revisões
-- deixaram:
--
--   "1 precisa entrar já"  — o veículo cadastrado no painel escrevia só em
--   `estoque_motors`. Não nascia `veiculos` (a identidade do núcleo), nem
--   `veiculo_entradas`, nem o evento `ENTRADA`. O momento em que o operador
--   cadastra É o momento do evento de entrada; adiar isso para a F1 criaria
--   um lote de veículos sem história para depois inventar retroativamente.
--
--   "3 faça isso, use a placa, renavam e chassi" — guarda de duplicidade. Não
--   havia nada impedindo cadastrar o mesmo carro duas vezes.
--
-- Conferido antes de subir os índices: dos 104 veículos, 38 têm placa e 36 têm
-- chassi, TODOS distintos — nenhuma duplicata a resolver primeiro.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. `renavam` no estoque (aditivo)
--
-- O núcleo já tinha a coluna (`veiculos.renavam`, f0b); `estoque_motors` não.
-- Sem ela o cadastro não consegue capturar o terceiro documento — e é ele que
-- a escrituração do RENAVE vai pedir.
-- ----------------------------------------------------------------------------
alter table public.estoque_motors
  add column if not exists renavam text;

comment on column public.estoque_motors.renavam is
  'Documento interno, como `placa` e `chassi`: NUNCA sai no mapper público. O sync do RevendaMais não o conhece — é campo do painel, sobrevive a todo ciclo.';

-- ----------------------------------------------------------------------------
-- 2. Um carro é um carro — guarda de duplicidade por documento
--
-- Índices funcionais sobre a forma canônica (caixa alta, sem separador): sem
-- isso `ABC-1D23` e `abc1d23` seriam dois carros. `upper` e `btrim` são
-- IMMUTABLE, então servem em índice (ao contrário do cast de enum que
-- derrubou a f0j na primeira tentativa).
--
-- Parciais em `not null and <> ''`: hoje 66 dos 104 veículos não têm placa, e
-- string vazia é o que o feed manda quando não sabe — sem o filtro, o segundo
-- carro sem documento colidiria com o primeiro.
-- ----------------------------------------------------------------------------
-- O separador entra na normalização junto com a caixa: `ABC-1D23` e `abc1d23`
-- são a mesma placa, e o primeiro ensaio provou que btrim sozinho não vê isso
-- (o carro repetido entrou). `replace` e `upper` são IMMUTABLE, logo servem em
-- índice. A função abaixo também grava a forma canônica — o índice é a rede,
-- não o único fio.
create unique index if not exists estoque_motors_placa_unica
  on public.estoque_motors (upper(replace(replace(btrim(placa), '-', ''), ' ', '')))
  where placa is not null and btrim(placa) <> '';

create unique index if not exists estoque_motors_chassi_unico
  on public.estoque_motors (upper(replace(replace(btrim(chassi), '-', ''), ' ', '')))
  where chassi is not null and btrim(chassi) <> '';

create unique index if not exists estoque_motors_renavam_unico
  on public.estoque_motors (replace(replace(btrim(renavam), '-', ''), '.', ''))
  where renavam is not null and btrim(renavam) <> '';

-- ----------------------------------------------------------------------------
-- 3. O nascimento em UMA transação
--
-- Quatro escritas que só fazem sentido juntas: a linha do site, a identidade
-- do núcleo, a aquisição e o evento. Em função Postgres, e não na rota, pelo
-- motivo do handoff — "mutação = validar → evento → contabilizar, na MESMA
-- transação; função Postgres quando atômico for crítico". Meia entrada é pior
-- que nenhuma: um veículo no site sem história no núcleo é exatamente a
-- divergência que a conferência diária existe para acusar.
--
-- SECURITY INVOKER de propósito: a RLS do núcleo continua valendo (só staff), e
-- o trigger de autoria carimba `auth.uid()` sozinho quando a chamada vem da
-- API. Definer aqui desligaria as duas coisas.
-- ----------------------------------------------------------------------------
create or replace function public.cadastrar_veiculo_nativo(
  dados jsonb,
  modalidade_entrada public.modalidade_tipo default 'compra_direta',
  autor uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  linha        jsonb  := dados - 'modalidade' - 'id' - 'origem' - 'last_seen_at' - 'first_seen_at';
  colunas      text;
  novo_id      integer;
  novo_veiculo uuid;
  chassi_txt   text   := upper(btrim(coalesce(dados->>'chassi', '')));
  custo        numeric := nullif(dados->>'preco_compra', '')::numeric;
  posse_calc   public.posse_tipo;
  usuario      uuid   := coalesce(autor, auth.uid());
begin
  if chassi_txt = '' then
    raise exception 'CHASSI_OBRIGATORIO: o veículo do painel nasce no núcleo, e lá o chassi é a identidade (uma linha por chassi, por org). Sem ele não há como impedir o mesmo carro entrar duas vezes nem escriturar no RENAVE.'
      using errcode = 'raise_exception';
  end if;

  -- Troca fica de fora da F0: `troca_exige_venda` pede a venda de origem, e
  -- negócio ainda não existe na operação. Tentar registrá-la aqui produziria
  -- uma entrada mentindo sobre de onde o carro veio.
  if modalidade_entrada = 'troca' then
    raise exception 'TROCA_EXIGE_VENDA: troca não existe sem a venda que a gerou (spec 10). Registre a venda primeiro — na F0, use compra direta, consignação, parceria ou repasse.'
      using errcode = 'raise_exception';
  end if;

  posse_calc := case
    when modalidade_entrada in ('consignacao', 'parceria') then 'terceiro'
    else 'propria'
  end::public.posse_tipo;

  -- Documento entra em forma CANÔNICA, não como o operador digitou. A revisão
  -- já tinha apontado ("placa entra crua no banco"), e o RENAVE e a NF-e vão
  -- pedir a forma sem separador. Normalizar aqui — e não só no índice — é o
  -- que faz duas grafias da mesma placa serem o mesmo carro em toda consulta,
  -- não apenas na hora de barrar o duplicado.
  linha := linha
    || jsonb_build_object('chassi', chassi_txt)
    || case
         when nullif(btrim(coalesce(dados->>'placa', '')), '') is null then '{}'::jsonb
         else jsonb_build_object(
           'placa', upper(replace(replace(btrim(dados->>'placa'), '-', ''), ' ', ''))
         )
       end
    || case
         when nullif(btrim(coalesce(dados->>'renavam', '')), '') is null then '{}'::jsonb
         else jsonb_build_object(
           'renavam', replace(replace(btrim(dados->>'renavam'), '-', ''), '.', '')
         )
       end;

  if modalidade_entrada = 'parceria' and custo is null then
    raise exception 'PARCERIA_EXIGE_PRECO: parceria tem preço travado (spec 10) — informe o valor acordado com o parceiro.'
      using errcode = 'raise_exception';
  end if;

  -- 3.1 A linha que o site lê. O trigger da f0k infere origem e o carimbo do
  -- sync a partir da FAIXA do id; o índice único de documento recusa o carro
  -- repetido.
  --
  -- O INSERT nomeia SÓ as colunas que vieram no jsonb, e é de propósito.
  -- `jsonb_populate_record` devolveria a linha inteira com NULO no que faltou,
  -- e **NULO EXPLÍCITO não aciona DEFAULT** — dois ensaios morreram assim, um
  -- em `id`, outro em `conteudo_atualizado_em`, e viriam mais a cada coluna
  -- nova com default. Nomeando o que existe, todo default do banco continua
  -- valendo, hoje e nas colunas que ainda serão criadas.
  select string_agg(quote_ident(c.column_name), ', ')
    into colunas
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'estoque_motors'
     and c.column_name <> 'id'
     and linha ? c.column_name;

  if colunas is null then
    raise exception 'CADASTRO_VAZIO: nenhum campo conhecido de estoque_motors veio no cadastro.'
      using errcode = 'raise_exception';
  end if;

  execute format(
    'insert into public.estoque_motors (id, %1$s)
     select $1, %1$s from jsonb_populate_record(null::public.estoque_motors, $2)
     returning id',
    colunas
  )
  into novo_id
  using nextval('public.estoque_motors_nativo_seq'), linha;

  -- 3.2 A identidade do núcleo, amarrada à linha do site por `estoque_id`.
  insert into public.veiculos (
    chassi, placa, renavam, marca, modelo, versao, ano, ano_fabricacao,
    km_atual, estoque_id
  )
  values (
    chassi_txt,
    nullif(upper(btrim(coalesce(dados->>'placa', ''))), ''),
    nullif(btrim(coalesce(dados->>'renavam', '')), ''),
    dados->>'marca',
    dados->>'modelo',
    nullif(dados->>'versao', ''),
    nullif(dados->>'ano', '')::integer,
    nullif(dados->>'ano_fabricacao', '')::integer,
    nullif(dados->>'quilometragem', '')::integer,
    novo_id
  )
  returning id into novo_veiculo;

  -- 3.3 A aquisição. Os campos por modalidade que a F0 conhece; o formulário
  -- completo de cada porta é a F1 (spec 10).
  insert into public.veiculo_entradas (
    veiculo_id, modalidade, posse, valor_entrada,
    consig_valor_dono, parceria_preco_entrada, parceria_parceiro,
    fornecedor_nome, criado_por
  )
  values (
    novo_veiculo,
    modalidade_entrada,
    posse_calc,
    case when modalidade_entrada in ('consignacao', 'parceria') then 0
         else coalesce(custo, 0) end,
    case when modalidade_entrada = 'consignacao' then custo end,
    case when modalidade_entrada = 'parceria' then custo end,
    case when modalidade_entrada = 'parceria' then nullif(dados->>'fornecedor', '') end,
    nullif(dados->>'fornecedor', ''),
    usuario
  );

  -- 3.4 E a história começa.
  insert into public.veiculo_eventos (veiculo_id, tipo, usuario_id, payload)
  values (
    novo_veiculo,
    'ENTRADA',
    coalesce(usuario, '00000000-0000-0000-0000-000000000000'),
    jsonb_build_object(
      'origem', 'cadastro_nativo',
      'modalidade', modalidade_entrada,
      'estoque_id', novo_id
    )
  );

  return jsonb_build_object(
    'estoque_id', novo_id,
    'veiculo_id', novo_veiculo,
    'modalidade', modalidade_entrada
  );
end;
$$;

comment on function public.cadastrar_veiculo_nativo(jsonb, public.modalidade_tipo, uuid) is
  'O nascimento do veículo do painel, atômico: linha do site + identidade do núcleo + aquisição + evento ENTRADA. Decisão do dono em 2026-08-29 ("precisa entrar já") — sem isto o cadastro criava carro sem história, e a conferência diária acusaria a divergência todo dia.';

revoke all on function public.cadastrar_veiculo_nativo(jsonb, public.modalidade_tipo, uuid) from public, anon;
grant execute on function public.cadastrar_veiculo_nativo(jsonb, public.modalidade_tipo, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------------------------
do $$
declare
  r jsonb;
  falhas int := 0;
  n int;
  situacao_obtida text;
begin
  -- 1. O caminho feliz cria as QUATRO coisas.
  r := public.cadastrar_veiculo_nativo(
    jsonb_build_object(
      'marca', 'AceiteF0O', 'modelo', 'Nativo', 'ano', 2023,
      'preco', 118900, 'preco_original', 118900, 'quilometragem', 38400,
      'chassi', '9BWZZZ377VT004251', 'placa', 'ABC1D23', 'renavam', '00123456789',
      'preco_compra', 95000, 'fornecedor', 'Fornecedor Aceite'
    ),
    'compra_direta',
    '00000000-0000-0000-0000-000000000000'
  );

  if (r->>'estoque_id')::int < 900000001 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o nativo não caiu na faixa própria (id=%)', r->>'estoque_id';
  end if;

  select count(*) into n from public.veiculos where id = (r->>'veiculo_id')::uuid;
  if n <> 1 then falhas := falhas + 1; raise warning 'FALHOU: não nasceu identidade no núcleo'; end if;

  select count(*) into n from public.veiculo_entradas
   where veiculo_id = (r->>'veiculo_id')::uuid and ativa and modalidade = 'compra_direta'
     and posse = 'propria' and valor_entrada = 95000;
  if n <> 1 then falhas := falhas + 1; raise warning 'FALHOU: aquisição ausente ou torta'; end if;

  select count(*) into n from public.veiculo_eventos
   where veiculo_id = (r->>'veiculo_id')::uuid and tipo = 'ENTRADA';
  if n <> 1 then falhas := falhas + 1; raise warning 'FALHOU: o evento ENTRADA não foi gravado'; end if;

  -- E a projeção já responde.
  select situacao into situacao_obtida from public.veiculo_situacao
   where veiculo_id = (r->>'veiculo_id')::uuid;
  if situacao_obtida <> 'estoque' then
    falhas := falhas + 1;
    raise warning 'FALHOU: situação projetada = % (esperava estoque)', situacao_obtida;
  end if;

  -- 2. O MESMO carro de novo: o chassi barra.
  begin
    perform public.cadastrar_veiculo_nativo(
      jsonb_build_object('marca','X','modelo','Y','ano',2023,'preco',1,'quilometragem',1,
                         'chassi','9bwzzz377vt004251'),  -- minúscula de propósito
      'compra_direta', '00000000-0000-0000-0000-000000000000');
    falhas := falhas + 1;
    raise warning 'FALHOU: o mesmo chassi entrou duas vezes';
  exception when unique_violation then null; end;

  -- 3. Placa repetida, com separador e caixa trocada.
  begin
    perform public.cadastrar_veiculo_nativo(
      jsonb_build_object('marca','X','modelo','Y','ano',2023,'preco',1,'quilometragem',1,
                         'chassi','9BWZZZ377VT004999','placa','abc-1d23'),
      'compra_direta', '00000000-0000-0000-0000-000000000000');
    falhas := falhas + 1;
    raise warning 'FALHOU: a mesma placa entrou duas vezes';
  exception when unique_violation then null; end;

  -- 4. Renavam repetido.
  begin
    perform public.cadastrar_veiculo_nativo(
      jsonb_build_object('marca','X','modelo','Y','ano',2023,'preco',1,'quilometragem',1,
                         'chassi','9BWZZZ377VT004888','renavam',' 00123456789 '),
      'compra_direta', '00000000-0000-0000-0000-000000000000');
    falhas := falhas + 1;
    raise warning 'FALHOU: o mesmo renavam entrou duas vezes';
  exception when unique_violation then null; end;

  -- 5. Sem chassi: recusa com mensagem própria.
  begin
    perform public.cadastrar_veiculo_nativo(
      jsonb_build_object('marca','X','modelo','Y','ano',2023,'preco',1,'quilometragem',1),
      'compra_direta', '00000000-0000-0000-0000-000000000000');
    falhas := falhas + 1;
    raise warning 'FALHOU: veículo sem chassi nasceu';
  exception when raise_exception then null; end;

  -- 6. Troca na F0: recusa.
  begin
    perform public.cadastrar_veiculo_nativo(
      jsonb_build_object('marca','X','modelo','Y','ano',2023,'preco',1,'quilometragem',1,
                         'chassi','9BWZZZ377VT004777'),
      'troca', '00000000-0000-0000-0000-000000000000');
    falhas := falhas + 1;
    raise warning 'FALHOU: troca sem venda de origem foi aceita';
  exception when raise_exception then null; end;

  -- 7. Consignação: posse de terceiro e custo ZERO (constraint da spec 10).
  r := public.cadastrar_veiculo_nativo(
    jsonb_build_object('marca','AceiteF0O','modelo','Consignado','ano',2021,
                       'preco',70000,'quilometragem',50000,
                       'chassi','9BWZZZ377VT004666','preco_compra',60000),
    'consignacao', '00000000-0000-0000-0000-000000000000');
  select count(*) into n from public.veiculo_entradas
   where veiculo_id = (r->>'veiculo_id')::uuid
     and posse = 'terceiro' and valor_entrada = 0 and consig_valor_dono = 60000;
  if n <> 1 then falhas := falhas + 1; raise warning 'FALHOU: consignação nasceu com custo ou posse errada'; end if;

  -- 8. Parceria sem preço travado: recusa.
  begin
    perform public.cadastrar_veiculo_nativo(
      jsonb_build_object('marca','X','modelo','Y','ano',2023,'preco',1,'quilometragem',1,
                         'chassi','9BWZZZ377VT004555'),
      'parceria', '00000000-0000-0000-0000-000000000000');
    falhas := falhas + 1;
    raise warning 'FALHOU: parceria sem preço travado foi aceita';
  exception when raise_exception then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no nascimento do veículo nativo', falhas;
  end if;

  -- Limpeza dos sintéticos.
  alter table public.veiculo_eventos disable trigger veiculo_eventos_append_only;
  delete from public.veiculo_eventos e using public.veiculos v
   where e.veiculo_id = v.id and v.chassi like '9BWZZZ377VT004%';
  alter table public.veiculo_eventos enable trigger veiculo_eventos_append_only;
  delete from public.veiculo_entradas en using public.veiculos v
   where en.veiculo_id = v.id and v.chassi like '9BWZZZ377VT004%';
  delete from public.estoque_motors
   where id in (select estoque_id from public.veiculos where chassi like '9BWZZZ377VT004%');
  delete from public.veiculos where chassi like '9BWZZZ377VT004%';

  raise notice 'F0-o OK: nascimento atômico (site+núcleo+aquisição+evento), duplicidade barrada por placa/renavam/chassi, modalidades honestas.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829170000', 'f0o_entrada_no_nucleo_e_duplicidade')
  on conflict (version) do nothing;
