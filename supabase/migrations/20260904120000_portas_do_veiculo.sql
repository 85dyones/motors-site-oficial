-- ==========================================================
-- `portas` — a coluna que o schema.org pedia e o feed já mandava
-- ==========================================================
--
-- `src/lib/schemaVeiculo.ts` documenta a ausência desde a auditoria de 24/08:
--
--   "O que NÃO está aqui é tão deliberado quanto o que está: `numberOfDoors` e
--    `vehicleSeatingCapacity` não existem em `estoque_motors`. Deduzi-los da
--    carroceria daria certo na maioria e erraria no Kombi, na picape cabine
--    simples e no cupê — e schema errado é pior que campo ausente, porque é
--    afirmação. Quando as colunas existirem, entram aqui."
--
-- O comentário estava certo nas duas pontas, e o feed provou as duas.
--
-- ----------------------------------------------------------
-- Medido no feed real em 2026-09-04 (39 anúncios)
-- ----------------------------------------------------------
--
--   4 portas .... 26      2 portas .... 4
--   5 portas ....  6      3 portas .... 1
--   0 ..........  2  → as duas MOTOS (Honda ADV 150, Harley Dyna Glide)
--
-- `DOORS` vem preenchido em 39 de 39. A dedução por carroceria erraria em pelo
-- menos cinco: duas Kombis com contagens DIFERENTES entre si (4 e 3), duas
-- Saveiros cabine simples (2) e o Fusca (2).
--
-- **Zero vira NULL.** É como o feed diz "não se aplica", e `numberOfDoors: 0`
-- numa moto não é campo vazio: é afirmação falsa no JSON-LD. A mesma disciplina
-- que o comentário acima defende.
--
-- ----------------------------------------------------------
-- De quem é a coluna
-- ----------------------------------------------------------
-- Do RevendaMais, como o preço — é especificação do veículo, cadastrada lá.
-- Por isso ela entra na allowlist da trava (`20260902120000` +
-- `20260902150000`): sem isso, uma correção feita no RevendaMais nunca
-- chegaria aqui e a coluna ficaria congelada no valor do INSERT, sem lugar
-- nenhum onde consertar.
--
-- ⚠️ É uma decisão, não um detalhe: alarga a superfície de quem tem a chave de
-- serviço em mais uma coluna. Fica dita aqui para o dono poder derrubar.
--
-- Migração ADITIVA: coluna nova, CHECK, backfill e `create or replace`.
-- ==========================================================

alter table public.estoque_motors
  add column if not exists portas smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.estoque_motors'::regclass and conname = 'estoque_motors_portas_plausivel'
  ) then
    -- 1 existe (cupê de porta única não, mas van de porta lateral sim); 8 é
    -- teto folgado para van. Fora disso é erro de cadastro, e schema errado é
    -- pior que campo ausente.
    alter table public.estoque_motors
      add constraint estoque_motors_portas_plausivel
      check (portas is null or (portas >= 1 and portas <= 8));
  end if;
end $$;

comment on column public.estoque_motors.portas is
  'Número de portas, do <DOORS> do feed RevendaMais. NULL = não se aplica (moto) ou não informado — o feed manda 0 para moto, e a importação converte. Vira numberOfDoors no JSON-LD do veículo; nunca deduzir da carroceria (Kombi, cabine simples e cupê quebram a dedução).';


-- ----------------------------------------------------------
-- Backfill: os 39 do feed de 2026-09-04
-- ----------------------------------------------------------
-- Os outros 65 da tabela são vendidos ou arquivados e não estão no feed —
-- ficam NULL, que é o correto: não há de onde tirar, e inventar é pior.
--
-- `where portas is null` para ser idempotente e para nunca desfazer correção
-- posterior: rodar duas vezes não sobrescreve nada.
update public.estoque_motors e
   set portas = v.portas
  from (values
  (8009174,4),
  (7977579,4),
  (8191855,4),
  (8335025,4),
  (8193514,4),
  (8203724,4),
  (8152210,4),
  (8422260,4),
  (6170299,null),
  (8243644,4),
  (8059102,4),
  (8429524,4),
  (8213942,4),
  (8100652,2),
  (8392391,5),
  (8321599,4),
  (8310901,2),
  (8299212,5),
  (8407873,5),
  (8201426,4),
  (8252284,4),
  (8109647,5),
  (8100626,4),
  (8358193,2),
  (8335204,2),
  (8107703,4),
  (8171616,4),
  (8392516,4),
  (8417265,5),
  (8256747,4),
  (7812719,4),
  (8370580,4),
  (8402155,4),
  (8333811,3),
  (7447739,null),
  (7416830,5),
  (7947766,4),
  (8393824,4),
  (8416946,4)
) as v(id, portas)
 where e.id = v.id
   and e.portas is null
   and v.portas is not null;


-- ----------------------------------------------------------
-- A trava passa a deixar o sync escrever `portas`
-- ----------------------------------------------------------
-- Mesma forma de `20260902150000`: allowlist POR CONSTRUÇÃO — parte de OLD e
-- copia só o permitido, então coluna nova nasce protegida sem ninguém lembrar
-- de listar. O que muda é a lista, que ganha um quinto nome.
--
-- `portas` NÃO entra na conta do `lastmod`: mudar a contagem de portas é
-- correção de ficha técnica, não alteração de oferta, e não vale pedir recrawl
-- por isso. O carimbo continua respondendo só ao preço.
create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
declare
  preco_mudou boolean;
begin
  if current_user = 'service_role'
     or new.last_seen_at is distinct from old.last_seen_at then

    preco_mudou :=
         new.preco             is distinct from old.preco
      or new.preco_original    is distinct from old.preco_original
      or new.preco_promocional is distinct from old.preco_promocional;

    old.preco             := new.preco;
    old.preco_original    := new.preco_original;
    old.preco_promocional := new.preco_promocional;
    old.last_seen_at      := new.last_seen_at;
    old.portas            := new.portas;

    if preco_mudou then
      old.conteudo_atualizado_em := now();
    end if;

    return old;
  end if;

  if new.origem is distinct from old.origem then
    new.origem := old.origem;
  end if;

  return new;
end;
$$;

comment on function public.estoque_motors_trava_do_sync() is
  'O sync do RevendaMais manda em CINCO colunas — preco, preco_original, preco_promocional, last_seen_at e portas — e em nenhuma outra. Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio para não matar o lote do feed. Allowlist por construção. Move conteudo_atualizado_em (o lastmod) só quando uma das três colunas de PREÇO muda — nunca por last_seen_at nem por portas.';


-- ==========================================================
-- Autoconferência
-- ==========================================================
do $$
declare
  id_feed integer := 8399995;
  antes   public.estoque_motors%rowtype;
  depois  public.estoque_motors%rowtype;
  falhas  integer := 0;
  moto    integer;
begin
  -- 1. O backfill pegou o estoque publicado, e as motos ficaram NULL.
  select count(*) into moto
    from public.estoque_motors
   where estado_cadastro = 'publicado' and not vendido and portas is not null;
  if moto = 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: nenhum publicado recebeu portas — o backfill não pegou';
  end if;
  raise notice 'publicados com portas preenchidas: %', moto;

  -- 2. O CHECK recusa valor implausível — schema errado é pior que ausente.
  delete from public.estoque_motors where id = id_feed;
  insert into public.estoque_motors (id, marca, modelo, preco, ano, last_seen_at)
  values (id_feed, 'AcettePortas', 'Importado', 50000, 2022, now());
  begin
    update public.estoque_motors set portas = 12 where id = id_feed;
    falhas := falhas + 1;
    raise warning 'FALHOU: o CHECK aceitou 12 portas';
  exception when check_violation then
    null;
  end;

  -- 3. O sync ESCREVE portas...
  select * into antes from public.estoque_motors where id = id_feed;
  update public.estoque_motors
     set portas = 4, marca = 'SobrescritoPeloSync', last_seen_at = clock_timestamp()
   where id = id_feed;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.portas is distinct from 4 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o sync não conseguiu gravar portas (%)', depois.portas;
  end if;

  -- 4. ...e continua sem tocar em conteúdo, nem no lastmod.
  if depois.marca <> antes.marca then
    falhas := falhas + 1;
    raise warning 'FALHOU: o sync alterou conteúdo junto com portas (marca=%)', depois.marca;
  end if;
  if depois.conteudo_atualizado_em is distinct from antes.conteudo_atualizado_em then
    falhas := falhas + 1;
    raise warning 'FALHOU: mudar portas moveu o lastmod — ficha técnica não pede recrawl';
  end if;

  delete from public.estoque_motors where id = id_feed;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) em portas', falhas;
  end if;

  raise notice 'Portas OK: backfill aplicado, CHECK barra implausível, sync escreve, conteúdo e lastmod intactos.';
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260904120000', 'portas_do_veiculo')
  on conflict (version) do nothing;
