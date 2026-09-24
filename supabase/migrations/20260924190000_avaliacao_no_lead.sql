-- ============================================================================
-- A avaliação mora no lead (2026-09-24)
-- ============================================================================
--
-- O formulário público `/avaliacao` (src/app/api/avaliacao/route.ts) grava um
-- lead em `public.leads` com canal "Avaliação" — mas só guarda `interesse`
-- ("marca modelo ano"). Quilometragem, estado mecânico e de conservação, FIPE
-- consultada, observações e a faixa de compra sugerida
-- (`recomendarAvaliacao`, src/lib/avaliacaoRecomendacao.ts) iam só para o
-- webhook do n8n. Resultado: o consultor abria o card no kanban e não via nada
-- do que o cliente contou, e a loja não tinha como comparar o que a régua do
-- site sugeriu com o que foi ofertado e pago — ou seja, não tinha dado para
-- calibrar a régua de compra. Esta migração dá lugar a esses dados no próprio
-- lead.
--
-- ---------------------------------------------------------------------------
-- As três colunas
-- ---------------------------------------------------------------------------
--   avaliacao ................. jsonb — o RETRATO do formulário no instante
--                               do envio, montado no servidor. Guarda também
--                               a recomendação E a regra que a produziu: a
--                               régua vai mudar com o tempo, e um "otimo" de
--                               setembro só se compara com um de dezembro se
--                               cada um disser por qual régua saiu.
--   avaliacao_valor_ofertado .. numeric(12,2) — o que o consultor OFERECEU
--                               depois da vistoria.
--   avaliacao_valor_pago ...... numeric(12,2) — o que a loja PAGOU de fato. É
--                               o dado que recalibra a régua.
--
-- As regras de negócio vão em CHECK nomeado, não em código:
--   * `avaliacao` é objeto ou nada. Array, escalar ou `null` JSON seriam um
--     retrato que nenhuma tela sabe ler — e que só se descobriria no card.
--   * valor ofertado/pago é nulo (ainda não houve) ou > 0 e < R$ 100 milhões.
--     Zero não é oferta, negativo não é preço, e o teto pega a digitação com
--     casas trocadas — `numeric(12,2)` sozinho aceitaria R$ 9,9 bilhões.
--
-- Tudo aqui é aditivo e idempotente: `add column if not exists`, constraint
-- criada só se não existir, nenhum DROP/RENAME/ALTER TYPE. Não é tabela nova
-- (a regra de `org_id` vale para tabela nova; `leads` é legado e continua como
-- está) nem tabela de parâmetro (não há vigência a encerrar: o retrato é um
-- fato datado pelo próprio `created_at` do lead).
--
-- ---------------------------------------------------------------------------
-- O código tolera esta migração ainda não aplicada
-- ---------------------------------------------------------------------------
-- A rota `/api/avaliacao` grava o lead com as colunas novas e, se o PostgREST
-- responder PGRST204 (coluna fora do cache de schema) ou 42703 (coluna
-- inexistente), REGRAVA sem elas. A gravação do lead já era não-bloqueante —
-- quem preencheu a avaliação está a caminho do WhatsApp —, e um deploy de
-- código antes do banco não pode voltar a perder o lead inteiro por causa de
-- três colunas. Aplicar esta migração é o que faz os dados aparecerem; não
-- aplicá-la não quebra nada.
--
-- ---------------------------------------------------------------------------
-- Permissões: os grants de `leads` são de TABELA INTEIRA — decisão
-- ---------------------------------------------------------------------------
-- Conferido contra o repositório:
--   * nenhuma migração dá GRANT ou REVOKE em `public.leads`, nem por coluna
--     (20260807210000, 20260811130000, 20260813120000, 20260815120000,
--     20260828120000, 20260829140000 — esta última revoga `anon` do núcleo e
--     não cita `leads`). O acesso vem do default ACL do Supabase, que concede
--     a tabela inteira a anon/authenticated/service_role; o andaime de testes
--     espelha isso (supabase/testes/andaime.sql:75-78 e :312);
--   * quem segura é a RLS: `leads_leitura_staff`, `leads_atualizacao_staff` e
--     `leads_exclusao_staff`, todas `to authenticated` com `is_staff`
--     (20260828120000_funil_de_vendas.sql:617-627). Nenhuma policy para anon,
--     nenhuma de INSERT — quem grava é a chave de serviço.
--
-- Por isso NÃO há grant por coluna aqui. Coluna nova herda o grant de tabela:
-- o staff lê as três no kanban (o GET de /api/leads/gerenciar faz
-- `select("*")`, e quem não "vê e move leads" — Marketing — continua recebendo
-- só a contagem) e o PATCH grava os dois valores. `anon` não ganha nada que a
-- RLS não barre: sem policy para ele, zero linhas — o aceite prova por efeito.
-- O cliente logado da Garagem é `authenticated` sem staff: também zero linhas,
-- e é isso que garante que o cliente nunca vê a recomendação.
--
-- O que a granularidade NÃO permite: tirar de `authenticated` o UPDATE de
-- `avaliacao` e deixar o dos valores. Com UPDATE de tabela inteira, um REVOKE
-- por coluna não tem efeito; fechar exigiria trocar o grant de tabela por
-- grants por coluna de TODAS as colunas que o painel edita — inclusive as da
-- `20260923150000_gestao_do_lead`, que existe em produção e não está neste
-- repositório. Isso não é aditivo e quebraria o PATCH em silêncio. Então a
-- garantia de que o retrato não é reescrito é da ROTA: o PATCH de
-- /api/leads/gerenciar não aceita o campo `avaliacao`. Se um dia precisar ser
-- do banco, o caminho é um gatilho de guarda, em migração própria.
--
-- ---------------------------------------------------------------------------
-- Gatilhos de `leads` — conferidos, nenhum muda
-- ---------------------------------------------------------------------------
--   * `trg_leads_antes_de_atualizar` (versão viva em
--     20260828160000_desfecho_sem_oportunidade.sql:188-237) só lê/escreve
--     etapa, desfecho*, responsavel*, ultimo_contato_em, alertado_em e
--     atualizado_em. Não cita as colunas novas. Consequência a saber: gravar
--     SÓ um valor de avaliação não conta como "toque humano" — não reinicia o
--     relógio de estagnação (a lista de toques é etapa, dono, observações e
--     desfecho).
--   * `trg_leads_rastro_insert` / `trg_leads_rastro_update`
--     (20260828120000_funil_de_vendas.sql:533-582): o evento de entrada leva
--     canal e interesse; os de atualização só nascem de etapa, dono e
--     desfecho. As colunas novas não geram linha em `leads_eventos` — o lead
--     guarda o valor atual, não o histórico de mudanças do valor.
--   * Nenhuma view sobre `leads` usa `select *` (`agenda_de_pessoas` e
--     `saude_da_atribuicao_dos_leads` listam colunas), e `leads` não está em
--     publicação de realtime. Nada a recriar.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. As colunas
-- ----------------------------------------------------------------------------
alter table public.leads
  add column if not exists avaliacao                jsonb,
  add column if not exists avaliacao_valor_ofertado numeric(12,2),
  add column if not exists avaliacao_valor_pago     numeric(12,2);


-- ----------------------------------------------------------------------------
-- 2. As regras, nomeadas
-- ----------------------------------------------------------------------------
-- Em bloco porque `add constraint` não tem `if not exists`: reaplicar a
-- migração não pode abortar por ela já estar aplicada (mesmo gesto da
-- 20260807210000 com `leads_situacao_valida`).
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads'::regclass
                    and conname = 'leads_avaliacao_e_objeto') then
    alter table public.leads
      add constraint leads_avaliacao_e_objeto
      check (avaliacao is null or jsonb_typeof(avaliacao) = 'object');
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads'::regclass
                    and conname = 'leads_avaliacao_valor_ofertado_valido') then
    alter table public.leads
      add constraint leads_avaliacao_valor_ofertado_valido
      check (avaliacao_valor_ofertado is null
             or (avaliacao_valor_ofertado > 0 and avaliacao_valor_ofertado < 100000000));
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads'::regclass
                    and conname = 'leads_avaliacao_valor_pago_valido') then
    alter table public.leads
      add constraint leads_avaliacao_valor_pago_valido
      check (avaliacao_valor_pago is null
             or (avaliacao_valor_pago > 0 and avaliacao_valor_pago < 100000000));
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 3. O que cada coluna é, para quem abrir o banco sem abrir o código
-- ----------------------------------------------------------------------------
comment on column public.leads.avaliacao is
  'Retrato do formulário público /avaliacao no instante do envio: tipo de '
  'veículo, marca, modelo, ano, quilometragem, estado mecânico e de '
  'conservação, observações, a FIPE consultada (valor, código, mês de '
  'referência) e a recomendação de faixa de compra COM a regra que a produziu '
  '(src/lib/avaliacaoRecomendacao.ts). Montado no servidor e gravado pela '
  'chave de serviço em /api/avaliacao — a recomendação é recalculada lá, nunca '
  'copiada do corpo da requisição. O cliente nunca vê a recomendação: só a '
  'equipe lê (RLS is_staff). É retrato, não ficha: nenhuma tela o edita (o '
  'PATCH de /api/leads/gerenciar não aceita o campo); o que a vistoria apurou '
  'vai para avaliacao_valor_ofertado/pago. Nulo nos leads que não vieram da '
  'avaliação e nos anteriores a 2026-09-24. Sempre objeto JSON (CHECK '
  'leads_avaliacao_e_objeto).';

comment on column public.leads.avaliacao_valor_ofertado is
  'Quanto o consultor OFERECEU pelo carro depois da vistoria, em R$. '
  'Preenchido pelo consultor no card do kanban (PATCH /api/leads/gerenciar). '
  'Nulo = ainda não houve oferta. Posto ao lado da recomendação guardada em '
  '`avaliacao`, mostra quanto a régua do site erra antes da vistoria. '
  'Maior que zero e menor que R$ 100 milhões (CHECK '
  'leads_avaliacao_valor_ofertado_valido).';

comment on column public.leads.avaliacao_valor_pago is
  'Quanto a loja PAGOU de fato pelo carro, em R$ — o dado que recalibra a '
  'régua de compra (FIPE consultada x recomendação x valor pago). Preenchido '
  'pelo consultor no card do kanban (PATCH /api/leads/gerenciar) quando a '
  'compra fecha. Nulo = não comprou, ou ainda não. Maior que zero e menor que '
  'R$ 100 milhões (CHECK leads_avaliacao_valor_pago_valido).';


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. A parte de efeito grava um lead de sonda e o
-- viola de propósito; roda num sub-bloco que termina com um sentinela, e o
-- rollback do sub-bloco leva a sonda, o rastro dela em `leads_eventos` e
-- qualquer `set local role` junto. As variáveis sobrevivem ao rollback
-- (plpgsql não desfaz variável), e é por elas que o veredito sai depois.
-- Nada fica gravado — nem em produção, nem numa reaplicação.
do $aceite$
declare
  falhas        int := 0;
  v_esperado    record;
  v_tipo        text;
  v_lead        uuid;
  v_json        jsonb;
  v_coluna      text;
  v_valor       numeric;
  v_lido_of     numeric;
  v_lido_pago   numeric;
  v_marca       text;
  v_entrada     boolean := false;
  v_anon        int := -1;
  v_cliente     int := -1;
  v_restou      int;
begin
  -- 1 · As três colunas existem, com o tipo exato.
  for v_esperado in
    select * from (values
      ('avaliacao',                'jsonb'),
      ('avaliacao_valor_ofertado', 'numeric(12,2)'),
      ('avaliacao_valor_pago',     'numeric(12,2)')
    ) as e(coluna, tipo)
  loop
    v_tipo := null;
    select format_type(a.atttypid, a.atttypmod) into v_tipo
      from pg_attribute a
     where a.attrelid = 'public.leads'::regclass
       and a.attname  = v_esperado.coluna
       and a.attnum   > 0
       and not a.attisdropped;
    if v_tipo is distinct from v_esperado.tipo then
      raise exception 'ACEITE FALHOU: leads.% é "%", esperado "%"',
        v_esperado.coluna, coalesce(v_tipo, '<ausente>'), v_esperado.tipo;
    end if;

    if col_description('public.leads'::regclass,
         (select attnum from pg_attribute
           where attrelid = 'public.leads'::regclass and attname = v_esperado.coluna)) is null then
      falhas := falhas + 1;
      raise warning 'FALHOU: leads.% sem comentário', v_esperado.coluna;
    end if;
  end loop;

  -- 2 · As três regras existem com nome, são CHECK e estão validadas.
  if (select count(*) from pg_constraint
       where conrelid = 'public.leads'::regclass
         and contype = 'c' and convalidated
         and conname in ('leads_avaliacao_e_objeto',
                         'leads_avaliacao_valor_ofertado_valido',
                         'leads_avaliacao_valor_pago_valido')) <> 3 then
    falhas := falhas + 1;
    raise warning 'FALHOU: as três constraints nomeadas não estão todas de pé';
  end if;

  -- 3 · O painel lê as três e escreve os dois valores. Com grant de tabela
  --     inteira isto é automático; se produção tiver virado grant por coluna,
  --     é aqui que se descobre — antes de o PATCH falhar na mão do consultor.
  if not has_column_privilege('authenticated', 'public.leads', 'avaliacao', 'SELECT')
     or not has_column_privilege('authenticated', 'public.leads', 'avaliacao_valor_ofertado', 'SELECT')
     or not has_column_privilege('authenticated', 'public.leads', 'avaliacao_valor_pago', 'SELECT')
     or not has_column_privilege('authenticated', 'public.leads', 'avaliacao_valor_ofertado', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.leads', 'avaliacao_valor_pago', 'UPDATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated não lê/grava as colunas novas — o grant de leads deixou '
                  'de ser de tabela inteira; conceda por coluna (SELECT nas três, UPDATE só nos valores)';
  end if;

  -- 4 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    -- 4a · O retrato que a rota grava — objeto — entra.
    begin
      insert into public.leads (nome, telefone, canal, interesse, avaliacao)
      values ('Aceite Avaliação no Lead', '5541999990190', 'Avaliação', 'Teste Aceite 2020',
              jsonb_build_object(
                'tipo_veiculo', 'carro', 'marca', 'Teste', 'modelo', 'Aceite', 'ano', 2020,
                'quilometragem', 80000,
                'estado_mecanico', 'bom', 'estado_conservacao', 'riscos',
                'observacoes', '',
                'fipe', jsonb_build_object('valor', 'R$ 50.000,00', 'codigo', '000000-0',
                                           'mes_referencia', 'setembro de 2026'),
                'recomendacao', jsonb_build_object('faixa', 'reparos_leves',
                                                   'regra', 'aceite-da-migracao')))
      returning id into v_lead;
    exception when check_violation then
      raise exception 'ACEITE FALHOU: o retrato em objeto foi recusado — /api/avaliacao não gravaria nada';
    end;

    -- O gatilho de rastro seguiu funcionando com as colunas novas.
    v_entrada := exists (select 1 from public.leads_eventos
                          where lead_id = v_lead and tipo = 'entrada');

    -- 4b · Array, escalar e `null` JSON são recusados.
    foreach v_json in array array['[]'::jsonb,
                                  '["Teste","Aceite",2020]'::jsonb,
                                  '"Teste Aceite 2020"'::jsonb,
                                  'null'::jsonb] loop
      begin
        insert into public.leads (nome, telefone, canal, avaliacao)
        values ('Aceite Avaliação no Lead', '5541999990191', 'Avaliação', v_json);
        falhas := falhas + 1;
        raise warning 'FALHOU: leads.avaliacao aceitou % (jsonb_typeof = %)',
          v_json, jsonb_typeof(v_json);
      exception when check_violation then null;  -- é o que tinha que acontecer
      end;
    end loop;

    -- 4c · Zero, negativo e o teto são recusados nos dois valores — pelo
    --      mesmo caminho do consultor, um UPDATE que passa pelos gatilhos.
    foreach v_coluna in array array['avaliacao_valor_ofertado', 'avaliacao_valor_pago'] loop
      foreach v_valor in array array[0, -0.01, -45000, 100000000]::numeric[] loop
        begin
          execute format('update public.leads set %I = $1 where id = $2', v_coluna)
            using v_valor, v_lead;
          falhas := falhas + 1;
          raise warning 'FALHOU: leads.% aceitou %', v_coluna, v_valor;
        exception when check_violation then null;
        end;
      end loop;

      -- As bordas de dentro entram: o CHECK não pode ser mais estrito que a regra.
      foreach v_valor in array array[0.01, 99999999.99]::numeric[] loop
        begin
          execute format('update public.leads set %I = $1 where id = $2', v_coluna)
            using v_valor, v_lead;
        exception when check_violation then
          falhas := falhas + 1;
          raise warning 'FALHOU: leads.% recusou %, que é valor válido', v_coluna, v_valor;
        end;
      end loop;
    end loop;

    -- 4d · O caminho feliz: oferta e pagamento gravados, retrato intocado.
    begin
      update public.leads
         set avaliacao_valor_ofertado = 42000.00,
             avaliacao_valor_pago     = 40500.50
       where id = v_lead;
    exception when check_violation then
      raise exception 'ACEITE FALHOU: oferta de 42.000,00 / pagamento de 40.500,50 recusados';
    end;
    select avaliacao_valor_ofertado, avaliacao_valor_pago, avaliacao->>'marca'
      into v_lido_of, v_lido_pago, v_marca
      from public.leads where id = v_lead;

    -- 4e · Quem não é equipe não vê o retrato — nem a recomendação dentro dele.
    --      Sem privilégio nenhum também é "não vê": conta como zero.
    begin
      set local role anon;
      select count(*) into v_anon from public.leads where id = v_lead;
      reset role;
    exception when insufficient_privilege then v_anon := 0;
    end;

    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_cliente from public.leads where id = v_lead;
      reset role;
      perform set_config('request.jwt.claims', '', true);
    exception when insufficient_privilege then v_cliente := 0;
    end;

    raise exception 'DESFAZER_ACEITE_AVALIACAO' using errcode = 'AVL01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'AVL01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_lead is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a gravar — nada foi provado';
  end if;
  if not v_entrada then
    falhas := falhas + 1;
    raise warning 'FALHOU: o lead com avaliação não entrou no rastro (leads_eventos)';
  end if;
  if v_lido_of is distinct from 42000.00 or v_lido_pago is distinct from 40500.50 then
    falhas := falhas + 1;
    raise warning 'FALHOU: valores lidos % / %, esperado 42000.00 / 40500.50', v_lido_of, v_lido_pago;
  end if;
  if v_marca is distinct from 'Teste' then
    falhas := falhas + 1;
    raise warning 'FALHOU: gravar os valores mexeu no retrato (marca = "%")', v_marca;
  end if;
  if v_anon <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon enxergou % lead(s) com avaliação', v_anon;
  end if;
  if v_cliente <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: authenticated sem staff (cliente) enxergou % lead(s) com avaliação', v_cliente;
  end if;

  select count(*) into v_restou from public.leads where id = v_lead;
  select v_restou + count(*) into v_restou from public.leads_eventos where lead_id = v_lead;
  if v_restou <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: a sonda deixou % linha(s) para trás', v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na avaliação no lead', falhas;
  end if;

  raise notice
    'Aceite verificado: leads ganhou avaliacao (jsonb, só objeto) e os valores '
    'ofertado/pago (numeric(12,2), > 0 e < 100 milhões); array, escalar, null '
    'JSON, zero, negativo e o teto são recusados; o painel lê as três e grava os '
    'dois valores; anon e cliente não veem o lead; os gatilhos seguem de pé; a '
    'sonda não deixou rastro.';
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20260924190000', 'avaliacao_no_lead')
  on conflict (version) do nothing;
