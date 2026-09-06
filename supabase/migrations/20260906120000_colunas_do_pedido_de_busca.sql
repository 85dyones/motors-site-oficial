-- ==========================================================
-- Busca sob encomenda — as três colunas herdadas ganham dono
-- ==========================================================
--
-- Esta migração NÃO altera schema. Ela nomeia o que três colunas passam a
-- significar a partir de 2026-09-06.
--
-- `leads` foi criada fora deste repositório, por uma ferramenta de marketing,
-- antes da disciplina de migrações (ver 20260807210000_leads.sql, que a
-- encontrou preexistente e vazia). Ela trouxe uma dezena de colunas que nunca
-- foram documentadas e que nenhum código lia — entre elas estas três, com
-- nomes bons demais para o acaso:
--
--   modelo_interesse ...... o carro que a pessoa quer
--   respostas_raw ......... jsonb livre
--   disponivel_estoque .... boolean, default false
--
-- A Busca sob encomenda (o CTA dos 42 hubs de marca e modelo sem estoque)
-- passa a escrever nelas em vez de criar tabela nova — decisão registrada em
-- docs/superpowers/specs/2026-09-06-busca-sob-encomenda-design.md §2. O motivo
-- não é economia de schema: é que em `leads` o pedido nasce dentro do kanban
-- A1/A8 que a loja já abre, e numa tabela nova ele nasceria num lugar que
-- ninguém consulta.
--
-- Aditiva por construção: `comment on` não toca dado, não toca RLS e não toca
-- tipo. Reexecutar é inofensivo.
-- ==========================================================

comment on column public.leads.modelo_interesse is
    'O veículo que o lead PEDIU, em texto legível ("Citroën C3"). Preenchido '
    'pela Busca sob encomenda desde 2026-09-06; nulo nos leads que nascem numa '
    'ficha, onde o veículo é `veiculo_id`. Coluna herdada da ferramenta de '
    'marketing que criou esta tabela.';

comment on column public.leads.respostas_raw is
    'As respostas do formulário que gerou o lead, como vieram. Na Busca sob '
    'encomenda (canal "Busca sob encomenda"): marca, modelo_desejado, '
    'investimento, pagina_origem, ano_min, tem_troca, prazo, observacao. Os '
    'opcionais gravam `null`, nunca ausência de chave — "não respondeu" e '
    '"campo não existe" precisam ser distinguíveis na leitura.';

comment on column public.leads.disponivel_estoque is
    'O que a pessoa pediu estava à venda no momento do lead? `false` nos '
    'pedidos de Busca sob encomenda, que existem justamente porque o hub '
    'estava vazio. É o corte que separa demanda atendida de demanda perdida.';

-- ── autoconferência ──
do $$
declare
    faltando int := 0;
    c text;
begin
    foreach c in array array['modelo_interesse', 'respostas_raw', 'disponivel_estoque']
    loop
        if col_description('public.leads'::regclass, (
            select attnum from pg_attribute
             where attrelid = 'public.leads'::regclass and attname = c
        )) is null then
            faltando := faltando + 1;
            raise warning 'FALHOU: leads.% continua sem comentário', c;
        end if;
    end loop;

    if faltando > 0 then
        raise exception 'ACEITE FALHOU: % coluna(s) do pedido sem definição', faltando;
    end if;

    raise notice 'OK: as três colunas do pedido de busca estão documentadas.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260906120000', 'colunas_do_pedido_de_busca')
  on conflict (version) do nothing;
