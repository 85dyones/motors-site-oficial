-- ============================================================================
-- F0-k — Cadastro nativo de veículos + a trava do sync (T6)
-- ============================================================================
-- Adendo do dono em 2026-08-29: "vamos introduzir no F0 o cadastro de veículos
-- nativo no site, travar a subscrição de dados no sync do revenda para valor
-- apenas para veículos já cadastrados através do sync. veículos cadastrados
-- através do novo /admin não vão ser alterados pelo sync".
--
-- É EXCEÇÃO DELIBERADA e aditiva à regra "estoque_motors intocada até a F2":
-- nenhuma coluna existente muda de tipo, nome ou semântica; nada é removido.
-- O contrato de leitura do site (docs/levantamento-atual.md §2) continua valendo
-- — as 43 colunas seguem lá, com a mesma forma.
--
-- A trava mora no BANCO, não no n8n. O workflow não precisa mudar e não seria
-- confiável como única defesa: quem garante é o Postgres.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. De onde o veículo veio
-- ----------------------------------------------------------------------------
alter table public.estoque_motors
  add column if not exists origem text not null default 'sync';

do $$ begin
  alter table public.estoque_motors
    add constraint estoque_motors_origem_valida check (origem in ('sync','painel'));
exception when duplicate_object then null; end $$;

comment on column public.estoque_motors.origem is
  'Quem é dono desta linha: `sync` (RevendaMais, via n8n) ou `painel` (cadastro nativo do /admin, 2026-08-29). O sync só escreve nas suas — ver trigger estoque_motors_trava_do_sync. As 104 linhas anteriores nasceram `sync` pelo default, que é o que elas são.';

-- ----------------------------------------------------------------------------
-- 2. Faixa de id própria — colisão impossível, não improvável
--
-- O feed do RevendaMais usa o id do anúncio: 6.170.299 a 8.429.524 hoje
-- (verificado em produção em 29/08), 7 dígitos. Os nativos começam em
-- 900.000.001 e o `integer` vai até 2.147.483.647 — 1,2 bilhão de folga, e
-- nenhuma chance de o feed alcançar a faixa.
-- ----------------------------------------------------------------------------
create sequence if not exists public.estoque_motors_nativo_seq
  as integer start with 900000001 minvalue 900000001 no cycle;

comment on sequence public.estoque_motors_nativo_seq is
  'Ids dos veículos nascidos no painel. Faixa disjunta da do feed (6,1M–8,4M) — por isso o INSERT do sync nunca colide com nativo.';

-- O default só entra se a coluna não tiver um: o sync manda o id explícito
-- (e valor explícito sempre vence o default), então os dois convivem.
do $$
declare
  tem_default boolean;
begin
  select column_default is not null into tem_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'estoque_motors' and column_name = 'id';

  if not tem_default then
    alter table public.estoque_motors
      alter column id set default nextval('public.estoque_motors_nativo_seq');
    raise notice 'id ganhou default da sequence nativa (o sync segue mandando o dele).';
  else
    raise notice 'id já tinha default — preservado, nada a fazer.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. A origem é INFERIDA da faixa, não confiada ao chamador
--
-- Se a rota do admin esquecer de mandar `origem`, o veículo nasceria 'sync' e
-- viraria alvo do RevendaMais — exatamente o que o dono mandou impedir. A
-- faixa do id é a fonte da verdade, e ela não depende de ninguém lembrar.
--
-- `last_seen_at` do nativo nasce NULO de propósito: ele nunca veio em sync
-- nenhum, e dizer o contrário faria a janela do site mentir.
-- ----------------------------------------------------------------------------
create or replace function public.estoque_motors_marcar_origem()
returns trigger
language plpgsql
as $$
begin
  if new.id >= 900000001 then
    new.origem := 'painel';
    new.last_seen_at := null;
    if new.first_seen_at is null then
      new.first_seen_at := now();
    end if;
  else
    new.origem := coalesce(new.origem, 'sync');
  end if;
  return new;
end;
$$;

drop trigger if exists estoque_motors_marcar_origem on public.estoque_motors;
create trigger estoque_motors_marcar_origem
  before insert on public.estoque_motors
  for each row execute function public.estoque_motors_marcar_origem();

-- ----------------------------------------------------------------------------
-- 4. A TRAVA — o pedido do dono, em uma regra
--
-- Como o sync é reconhecido: ele carimba `last_seen_at` em todo upsert (é o
-- que a reconciliação do feed faz desde 20260804200000). Nenhuma rota do
-- painel escreve nessa coluna — conferido no código: estoqueEscrita.ts e as
-- rotas de /api/estoque nunca a tocam. Então "escrita que mexe em
-- last_seen_at" é assinatura do sync, e é isso que o trigger recusa quando a
-- linha é do painel.
--
-- IGNORA em silêncio (RETURN OLD) em vez de levantar exceção: o sync processa
-- o feed inteiro em lote, e estourar exceção mataria o lote dos veículos
-- legítimos por causa de um alheio. Ignorar é o comportamento pedido — "não
-- vão ser alterados" — e não tem efeito colateral no resto do ciclo.
-- ----------------------------------------------------------------------------
create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
begin
  if old.origem = 'painel' and new.last_seen_at is distinct from old.last_seen_at then
    -- O sync tentou escrever num veículo do painel. Não escreve.
    return old;
  end if;

  -- A origem não se troca por UPDATE: quem nasceu no painel morre no painel.
  if new.origem is distinct from old.origem then
    new.origem := old.origem;
  end if;

  return new;
end;
$$;

drop trigger if exists estoque_motors_trava_do_sync on public.estoque_motors;
create trigger estoque_motors_trava_do_sync
  before update on public.estoque_motors
  for each row execute function public.estoque_motors_trava_do_sync();

comment on function public.estoque_motors_trava_do_sync() is
  'A trava do adendo de 2026-08-29: o sync do RevendaMais só escreve nos veículos que ele mesmo cadastrou. Reconhece o sync pela assinatura `last_seen_at`; ignora a escrita (não estoura) para não matar o lote do feed.';

-- ----------------------------------------------------------------------------
-- 5. Autoconferência — simula o sync de verdade contra um nativo
-- ----------------------------------------------------------------------------
do $$
declare
  id_nativo integer;
  id_feed   integer := 7000001;  -- dentro da faixa do feed, fora do estoque real
  antes     record;
  depois    record;
  falhas    int := 0;
begin
  -- Nasce pelo painel: sem id, sem origem — os dois inferidos.
  insert into public.estoque_motors (marca, modelo, preco, ano)
  values ('AceiteF0K', 'Nativo', 12345, 2020)
  returning id into id_nativo;

  select * into antes from public.estoque_motors where id = id_nativo;

  if antes.id < 900000001 then
    raise exception 'ACEITE FALHOU: nativo nasceu na faixa do feed (id=%)', antes.id;
  end if;
  if antes.origem <> 'painel' then
    raise exception 'ACEITE FALHOU: nativo nasceu com origem=% (esperava painel)', antes.origem;
  end if;
  if antes.last_seen_at is not null then
    raise exception 'ACEITE FALHOU: nativo nasceu com last_seen_at — ele nunca veio em sync';
  end if;

  -- 1. O SYNC ATACA: upsert típico do n8n (preço novo + carimbo).
  update public.estoque_motors
     set preco = 99999, marca = 'SobrescritoPeloSync', last_seen_at = now()
   where id = id_nativo;

  select * into depois from public.estoque_motors where id = id_nativo;
  if depois.preco <> 12345 or depois.marca <> 'AceiteF0K' or depois.last_seen_at is not null then
    falhas := falhas + 1;
    raise warning 'A TRAVA FALHOU: sync alterou nativo (preco=%, marca=%)', depois.preco, depois.marca;
  end if;

  -- 2. O PAINEL EDITA o mesmo veículo: tem que passar (sem last_seen_at).
  update public.estoque_motors set preco = 54321 where id = id_nativo;
  select * into depois from public.estoque_motors where id = id_nativo;
  if depois.preco <> 54321 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o painel não conseguiu editar o próprio veículo';
  end if;

  -- 3. Ninguém troca a origem por UPDATE.
  update public.estoque_motors set origem = 'sync' where id = id_nativo;
  select * into depois from public.estoque_motors where id = id_nativo;
  if depois.origem <> 'painel' then
    falhas := falhas + 1;
    raise warning 'FALHOU: origem foi trocada por UPDATE';
  end if;

  -- 4. O sync continua dono do que é dele: veículo de origem sync se atualiza.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, last_seen_at)
  values (id_feed, 'AceiteFeed', 'DoSync', 30000, 2019, now());
  update public.estoque_motors
     set preco = 31000, last_seen_at = now()
   where id = id_feed;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.preco <> 31000 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o sync deixou de atualizar veículo que é dele';
  end if;
  if depois.origem <> 'sync' then
    falhas := falhas + 1;
    raise warning 'FALHOU: veículo do feed nasceu com origem=%', depois.origem;
  end if;

  -- 5. As 104 linhas que já existiam continuam sendo do sync.
  if exists (select 1 from public.estoque_motors
             where id < 900000001 and id <> id_feed and origem <> 'sync') then
    falhas := falhas + 1;
    raise warning 'FALHOU: linha pré-existente saiu de origem=sync';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na trava do sync', falhas;
  end if;

  delete from public.estoque_motors where id in (id_nativo, id_feed);

  raise notice 'F0-k OK: nativo id=% imune ao sync, painel edita, origem imutável, feed intacto.', id_nativo;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829130000', 'f0k_cadastro_nativo_e_trava_do_sync')
  on conflict (version) do nothing;
