-- ==========================================================
-- Carro "em preparação": publica com a foto de cadastro e conta até o pátio
-- ==========================================================
--
-- Pedido do dono em 28/09/2026. Carro que acabou de chegar ia para o mercado
-- com uma foto só, e o site o escondia: a régua de publicação exige 4 fotos
-- (`MINIMO_DE_FOTOS`, `src/lib/coerenciaDoCadastro.ts`). A caixa "em
-- preparação", com a data prevista de chegada ao pátio, libera a publicação
-- com uma foto, e o site mostra a contagem até a data.
--
-- Desenho: docs/superpowers/specs/2026-09-28-em-preparacao-design.md
--
-- ----------------------------------------------------------
-- De quem são as colunas
-- ----------------------------------------------------------
-- NOSSAS. O RevendaMais não as conhece, e a trava `estoque_motors_trava_do_sync`
-- (20260902150000) é allowlist por construção: descarta toda escrita do sync
-- fora de preço e `last_seen_at`. As duas nascem protegidas sem entrar em lista
-- nenhuma.
--
-- Migração ADITIVA: duas colunas, um CHECK, comentários e autoconferência.
-- ==========================================================

alter table public.estoque_motors
  add column if not exists em_preparacao boolean not null default false;

alter table public.estoque_motors
  add column if not exists previsao_chegada_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.estoque_motors'::regclass
      and conname = 'estoque_motors_em_preparacao_tem_data'
  ) then
    -- Caixa marcada sem data é contagem para lugar nenhum. O editor já barra;
    -- este CHECK é a segunda defesa, para o caminho que não passar por ele.
    alter table public.estoque_motors
      add constraint estoque_motors_em_preparacao_tem_data
      check (not em_preparacao or previsao_chegada_em is not null);
  end if;
end $$;

comment on column public.estoque_motors.em_preparacao is
  'Carro que chegou e ainda não está pronto para o pátio. Com previsao_chegada_em, libera a publicação com 1 foto (a de cadastro) e o site mostra a contagem até a data; o feed de anúncios o recusa até ter 4 fotos. A equipe desmarca quando o carro fica pronto — a caixa não se desliga sozinha. Coluna do painel: o sync do RevendaMais não a escreve.';

comment on column public.estoque_motors.previsao_chegada_em is
  'Quando o carro em preparação deve chegar ao pátio. Obrigatória com em_preparacao (CHECK estoque_motors_em_preparacao_tem_data). Depois da data o carro continua no ar com "chega a qualquer momento" (decisão do dono, 28/09/2026) e o painel acusa a previsão vencida.';

-- ----------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------
-- Pelo catálogo, e não por um UPDATE de prova: a trava do sync reconhece a
-- identidade de serviço e descartaria a escrita de teste em silêncio, e o
-- "CHECK funcionou" seria falso positivo.
do $$
declare
  n int;
  padrao text;
begin
  select count(*) into n
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'estoque_motors'
     and column_name in ('em_preparacao', 'previsao_chegada_em');
  if n <> 2 then
    raise exception 'AUTOCONFERÊNCIA: esperava 2 colunas novas em estoque_motors, achei %', n;
  end if;

  select column_default into padrao
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'estoque_motors'
     and column_name = 'em_preparacao';
  if padrao is distinct from 'false' then
    raise exception 'AUTOCONFERÊNCIA: em_preparacao tinha de nascer false em todo o estoque (default = %)', padrao;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.estoque_motors'::regclass
       and conname = 'estoque_motors_em_preparacao_tem_data'
  ) then
    raise exception 'AUTOCONFERÊNCIA: o CHECK da data não está no lugar';
  end if;

  raise notice 'Em preparação OK: duas colunas, default false, CHECK da data no lugar.';
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260928150000', 'em_preparacao')
  on conflict (version) do nothing;
