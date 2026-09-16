-- ==========================================================
-- Preço novo do sync volta a mover o `lastmod`
-- ==========================================================
--
-- Defeito introduzido HOJE por `20260902120000_preco_e_do_revendamais`, achado
-- ao aplicar o preço real da Kia Sorento (8213942): o valor mudou de R$ 56.900
-- para R$ 48.900 e `conteudo_atualizado_em` **não se moveu**.
--
-- ----------------------------------------------------------
-- A causa: ordem de gatilho
-- ----------------------------------------------------------
-- Dois BEFORE UPDATE na mesma tabela, e o Postgres os dispara em ordem
-- ALFABÉTICA do nome:
--
--   1. estoque_motors_conteudo_atualizado  → marcar_conteudo_atualizado()
--   2. estoque_motors_trava_do_sync        → estoque_motors_trava_do_sync()
--
-- O primeiro põe `new.conteudo_atualizado_em := now()` quando uma das 27
-- colunas vigiadas difere — `preco`, `preco_original` e `preco_promocional`
-- estão entre elas. O segundo, ao reconhecer o sync, devolve `OLD` com apenas
-- as quatro colunas da allowlist copiadas de `NEW`. `conteudo_atualizado_em`
-- não é uma delas: o carimbo é posto e imediatamente descartado.
--
-- Por que importa: `conteudo_atualizado_em` é o `<lastmod>` do sitemap
-- (`src/lib/supabase.ts`). Preço que muda sem mover o carimbo é uma alteração
-- que o site não anuncia — e preço é exatamente o que o anúncio mostra, no
-- Google e no portal. Era o comportamento antes de 30/08, quando o sync ainda
-- escrevia preço, e a trava total o levou junto sem que ninguém percebesse,
-- porque de 30/08 a 02/09 o sync não escrevia nada.
--
-- ----------------------------------------------------------
-- Por que NÃO basta copiar `conteudo_atualizado_em` de NEW
-- ----------------------------------------------------------
-- Seria a correção de uma linha, e estaria errada. O upsert do n8n manda 22
-- colunas, e `marcar_conteudo_atualizado` vigia quase todas — `marca`,
-- `descricao`, `whatsapp_images`, `pericia`… Se o feed trouxer qualquer uma
-- delas diferente, o carimbo é posto, e a trava restaura o VALOR da coluna mas
-- copiaria o carimbo: o site anunciaria alteração de uma coisa que não mudou.
-- Em produção isso aconteceria a cada ciclo, porque a descrição genérica do
-- feed difere do texto que a loja escreveu em `descricao`.
--
-- A régua certa é: o sync moveu o carimbo se, e somente se, **uma das três
-- colunas de preço** de fato mudou. `last_seen_at` fica de fora de propósito —
-- ele muda em TODO ciclo, e carimbá-lo faria os 38 veículos anunciarem
-- alteração quatro vezes por dia. É a mesma razão pela qual `20260817120000`
-- já o havia deixado fora da lista das 27.
--
-- Migração ADITIVA: `create or replace` de função existente.
-- ==========================================================

create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
declare
  preco_mudou boolean;
begin
  -- DOIS sinais, e qualquer um basta (inalterado desde a f0q):
  --
  -- 1. A IDENTIDADE. O n8n autentica pela credencial `supabaseApi`, que
  --    carrega a chave de serviço; o PostgREST a mapeia para `service_role`.
  --    O painel escreve como `authenticated`, com a sessão de quem clicou.
  --
  -- 2. A ASSINATURA `last_seen_at`, que o upsert do n8n sempre carimba.
  if current_user = 'service_role'
     or new.last_seen_at is distinct from old.last_seen_at then

    -- Decidido ANTES de mexer na linha: as três colunas de preço, comparadas
    -- entre o que o sync mandou e o que já estava. `last_seen_at` fora, de
    -- propósito — ele muda todo ciclo (ver o cabeçalho).
    preco_mudou :=
         new.preco             is distinct from old.preco
      or new.preco_original    is distinct from old.preco_original
      or new.preco_promocional is distinct from old.preco_promocional;

    -- Allowlist por construção: parte de OLD (a linha como está) e copia só o
    -- permitido. Tudo o que o sync mandou fora destas quatro é descartado em
    -- silêncio — deliberado, pelo motivo da f0q: o upsert processa o feed
    -- inteiro em lote, e uma exceção mataria o lote dos veículos legítimos.
    old.preco             := new.preco;
    old.preco_original    := new.preco_original;
    old.preco_promocional := new.preco_promocional;
    old.last_seen_at      := new.last_seen_at;

    -- O carimbo que `marcar_conteudo_atualizado` pôs em NEW morre junto com o
    -- resto de NEW. Reposto aqui, e só quando o preço mudou de verdade.
    if preco_mudou then
      old.conteudo_atualizado_em := now();
    end if;

    return old;
  end if;

  -- A origem não se troca por UPDATE: quem nasceu no painel morre no painel.
  if new.origem is distinct from old.origem then
    new.origem := old.origem;
  end if;

  return new;
end;
$$;

comment on function public.estoque_motors_trava_do_sync() is
  'O sync do RevendaMais manda em QUATRO colunas — preco, preco_original, preco_promocional, last_seen_at — e em nenhuma outra (decisão do dono, 2026-09-02: "o preço é do revenda, sempre"). Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio para não matar o lote do feed. Allowlist por construção. Move conteudo_atualizado_em (o lastmod do sitemap) quando, e só quando, uma das três colunas de PREÇO mudou — nunca por last_seen_at, que muda todo ciclo.';


-- ==========================================================
-- Autoconferência
-- ==========================================================
do $$
declare
  id_feed   integer := 8399997;
  id_painel integer := 8399996;
  antes   public.estoque_motors%rowtype;
  depois  public.estoque_motors%rowtype;
  falhas  integer := 0;
begin
  delete from public.estoque_motors where id = id_feed;

  -- `conteudo_atualizado_em` EXPLICITAMENTE antigo, e a razão é a mesma que a
  -- f0q registrou para `last_seen_at`: `now()` é o instante da TRANSAÇÃO, e
  -- esta migração inteira roda numa só. Nascendo com `now()`, a linha teria o
  -- mesmo carimbo que qualquer `now()` posterior, e "o carimbo andou" viraria
  -- indetectável — foi assim que a primeira versão deste aceite reprovou uma
  -- função correta. O gatilho do carimbo é BEFORE UPDATE, não INSERT, então
  -- este valor entra intacto.
  insert into public.estoque_motors
    (id, marca, modelo, preco, preco_original, preco_promocional, ano, descricao,
     last_seen_at, conteudo_atualizado_em)
  values
    (id_feed, 'AceiteLastmod', 'Importado', 50000, 50000, 0, 2022, 'texto da loja',
     now(), timestamptz '2026-01-01 00:00:00+00');
  select * into antes from public.estoque_motors where id = id_feed;
  if antes.conteudo_atualizado_em <> timestamptz '2026-01-01 00:00:00+00' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o carimbo antigo não sobreviveu ao INSERT (%) — o aceite abaixo não mede nada',
      antes.conteudo_atualizado_em;
  end if;

  -- 1. O sync roda SEM mudar preço (o ciclo normal: mesmo valor, carimbo novo),
  --    e ainda manda conteúdo diferente. O lastmod NÃO pode andar.
  update public.estoque_motors
     set preco = 50000, preco_original = 50000, preco_promocional = 0,
         descricao = 'descricao generica do feed',
         marca = 'SobrescritoPeloSync',
         last_seen_at = clock_timestamp()
   where id = id_feed;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.conteudo_atualizado_em is distinct from antes.conteudo_atualizado_em then
    falhas := falhas + 1;
    raise warning 'FALHOU: ciclo sem mudança de preço moveu o lastmod (% -> %)',
      antes.conteudo_atualizado_em, depois.conteudo_atualizado_em;
  end if;
  if depois.descricao <> antes.descricao or depois.marca <> antes.marca then
    falhas := falhas + 1;
    raise warning 'FALHOU: o sync alterou conteúdo';
  end if;

  -- 2. Agora o preço MUDA. O lastmod tem de andar.
  antes := depois;
  update public.estoque_motors
     set preco = 45000, preco_promocional = 45000, last_seen_at = clock_timestamp()
   where id = id_feed;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.preco <> 45000 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o sync não gravou o preço novo (%)', depois.preco;
  end if;
  if depois.conteudo_atualizado_em is not distinct from antes.conteudo_atualizado_em then
    falhas := falhas + 1;
    raise warning 'FALHOU: preço mudou e o lastmod NÃO andou — o site não anuncia a alteração';
  end if;

  -- 3. O painel continua carimbando pelo caminho normal (a função das 27
  --    colunas), sem passar por este ramo.
  --
  --    LINHA NOVA, e não a de cima: depois do passo 2 o carimbo já é o `now()`
  --    desta transação, e qualquer carimbo posterior seria idêntico. Reusar a
  --    linha faria este passo reprovar uma função correta — foi o que aconteceu
  --    na segunda tentativa deste aceite.
  insert into public.estoque_motors
    (id, marca, modelo, preco, preco_original, ano, last_seen_at, conteudo_atualizado_em)
  values
    (id_painel, 'AceitePainel', 'Importado', 50000, 50000, 2022,
     now(), timestamptz '2026-01-01 00:00:00+00');
  update public.estoque_motors set descricao_seo = 'texto revisado' where id = id_painel;
  select * into depois from public.estoque_motors where id = id_painel;
  if depois.conteudo_atualizado_em = timestamptz '2026-01-01 00:00:00+00' then
    falhas := falhas + 1;
    raise warning 'FALHOU: edição do painel não moveu o lastmod';
  end if;
  if depois.descricao_seo <> 'texto revisado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o painel não conseguiu gravar descricao_seo';
  end if;

  delete from public.estoque_motors where id in (id_feed, id_painel);

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no lastmod do preço', falhas;
  end if;

  raise notice 'Lastmod OK: ciclo sem mudança não move; preço novo move; painel continua movendo.';
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260902150000', 'preco_do_sync_move_o_lastmod')
  on conflict (version) do nothing;
