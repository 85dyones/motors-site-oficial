-- ============================================================================
-- A16 — os opcionais passam a vir do feed, e a trava deixa passar
-- ============================================================================
-- Decisão do dono em 2026-09-08, quando perguntado se o feed deveria preencher
-- `opcionais` só quando a coluna está vazia ou sempre:
--
--   "se for pra deixar 100%, prefiro mandar tudo"
--
-- Então é o feed que manda, e sobrescreve. O que sustenta essa escolha é que o
-- dado não é do robô: os acessórios são digitados pela própria loja no
-- RevendaMais, sobre a própria unidade. Não há inferência de ficha de fábrica
-- por versão, e por isso não há risco de anunciar item que aquele carro não
-- tem — que é o motivo pelo qual a maioria das colunas de conteúdo continua
-- protegida.
--
-- ---------------------------------------------------------------------------
-- Por que esta migração existe, e por que ela sozinha também não resolve
-- ---------------------------------------------------------------------------
-- O item A16 do handoff de SEO diz "acrescentar ACCESSORIES ao mapeamento do
-- n8n". Isso é METADE. O feed sempre trouxe o campo — o workflow mapeia 21
-- tags do XML e `ACCESSORIES` não é uma delas —, mas mesmo depois de mapeado
-- o valor morreria aqui: `estoque_motors_trava_do_sync` é uma allowlist por
-- construção, parte de OLD e copia só o permitido. Escrever `opcionais` pelo
-- sync era descartado em silêncio.
--
-- Medido em 2026-09-08: 18 de 38 veículos publicados sem nenhum opcional, e o
-- feed com a lista de todos eles.
--
-- A outra metade é o nó `Classificação e Regras de Negócio` do workflow
-- `u4PotK1Auirl52CT`, que precisa mapear o campo COM a mesma normalização de
-- grafia que `conteudo-seo/extrair-acessorios.js` usa — senão o próximo sync
-- troca "Ar-condicionado" por "ar condicionado" e a lista fica pior do que
-- estava. Uma sem a outra é trabalho que parece feito e não é.
--
-- ---------------------------------------------------------------------------
-- Por que `opcionais` MOVE o carimbo de conteúdo, e `portas` não movia
-- ---------------------------------------------------------------------------
-- `20260904120000_portas_do_veiculo` deixou `portas` de fora da conta do
-- `lastmod`, e com razão: contagem de portas é correção de ficha técnica.
--
-- Opcional é outra coisa, e o repositório já tinha decidido isso — o gatilho
-- `marcar_conteudo_atualizado` lista `opcionais` entre as colunas que movem
-- `conteudo_atualizado_em`. Só que essa decisão estava inalcançável pelo sync:
-- os gatilhos BEFORE disparam em ordem alfabética, `..._conteudo_atualizado`
-- roda ANTES de `..._trava_do_sync`, e a trava devolvia OLD — descartando o
-- carimbo junto com o resto.
--
-- Aqui a trava passa a mover o carimbo quando `opcionais` muda, que é o que
-- torna a decisão já existente de fato executável. O efeito prático é uma onda
-- de recrawl de ~18 fichas no primeiro sync depois disto — e ela é desejada:
-- a descrição daquelas páginas de fato mudou.
-- ============================================================================

-- ----------------------------------------------------------
-- A trava ganha um sexto nome
-- ----------------------------------------------------------
-- Mesma forma de `20260902150000` e `20260904120000`: allowlist POR
-- CONSTRUÇÃO. Parte de OLD e copia só o permitido, então coluna nova nasce
-- protegida sem ninguém precisar lembrar de listá-la.
create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
declare
  preco_mudou     boolean;
  opcionais_mudou boolean;
begin
  if current_user = 'service_role'
     or new.last_seen_at is distinct from old.last_seen_at then

    preco_mudou :=
         new.preco             is distinct from old.preco
      or new.preco_original    is distinct from old.preco_original
      or new.preco_promocional is distinct from old.preco_promocional;

    opcionais_mudou := new.opcionais is distinct from old.opcionais;

    old.preco             := new.preco;
    old.preco_original    := new.preco_original;
    old.preco_promocional := new.preco_promocional;
    old.last_seen_at      := new.last_seen_at;
    old.portas            := new.portas;
    old.opcionais         := new.opcionais;

    -- `last_seen_at` e `portas` continuam FORA da conta: passar o robô e
    -- corrigir ficha técnica não é motivo de pedir recrawl. Preço e opcional
    -- são — os dois mudam o que a página diz ao comprador.
    if preco_mudou or opcionais_mudou then
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
  'O sync do RevendaMais manda em SEIS colunas — preco, preco_original, preco_promocional, last_seen_at, portas e opcionais — e em nenhuma outra. Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio para não matar o lote do feed. Allowlist por construção. Move conteudo_atualizado_em (o lastmod) quando muda PREÇO ou OPCIONAIS — nunca por last_seen_at nem por portas.';


-- ==========================================================
-- Autoconferência
-- ==========================================================
-- Ensaia o comportamento REAL contra uma linha de teste, e desfaz. O que se
-- prova aqui não é que a função compila: é que ela deixa passar exatamente o
-- que deveria e continua barrando o resto.
do $$
declare
  alvo    integer;
  antes   public.estoque_motors%rowtype;
  depois  public.estoque_motors%rowtype;
  falhas  integer := 0;
begin
  select id into alvo from public.estoque_motors order by id limit 1;
  if alvo is null then
    raise notice 'Sem linhas em estoque_motors — autoconferência pulada.';
    return;
  end if;

  select * into antes from public.estoque_motors where id = alvo;

  -- Simula o sync: mexe em `last_seen_at` (a assinatura dele), em `opcionais`
  -- (o que passa a ser permitido) e em `descricao` (o que continua barrado).
  update public.estoque_motors
     set last_seen_at = now(),
         opcionais    = 'ENSAIO-A16-OPCIONAIS',
         descricao    = 'ENSAIO-A16-NAO-DEVE-PASSAR'
   where id = alvo;

  select * into depois from public.estoque_motors where id = alvo;

  if depois.opcionais is distinct from 'ENSAIO-A16-OPCIONAIS' then
    raise warning 'FALHA: o sync não conseguiu escrever `opcionais` (valor: %)', depois.opcionais;
    falhas := falhas + 1;
  end if;

  if depois.descricao is distinct from antes.descricao then
    raise warning 'FALHA: `descricao` passou pela trava e não deveria';
    falhas := falhas + 1;
  end if;

  if depois.conteudo_atualizado_em is not distinct from antes.conteudo_atualizado_em then
    raise warning 'FALHA: o carimbo de conteúdo não se moveu com a troca de opcionais';
    falhas := falhas + 1;
  end if;

  -- Desfaz o ensaio, campo por campo, pelas MESMAS portas que a trava abre.
  update public.estoque_motors
     set last_seen_at = antes.last_seen_at,
         opcionais    = antes.opcionais
   where id = alvo;
  update public.estoque_motors
     set conteudo_atualizado_em = antes.conteudo_atualizado_em
   where id = alvo;

  if falhas = 0 then
    raise notice 'Autoconferência OK: `opcionais` passa, `descricao` continua barrada, e o carimbo se move.';
  else
    raise exception 'Autoconferência falhou em % ponto(s).', falhas;
  end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260908160000', 'opcionais_vem_do_feed')
  on conflict (version) do nothing;
