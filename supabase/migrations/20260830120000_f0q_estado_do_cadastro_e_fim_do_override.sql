-- ============================================================================
-- F0-q — O estado do cadastro vira explícito, e o sync para de sobrescrever
-- ============================================================================
-- Decisão do dono em 2026-08-30:
--
--   "para o sync cron, deixa apenas a opção de importação com acionamento
--    manual, sem override, criamos rascunhos dos carros para serem finalizados
--    antes de serem publicados"
--
-- É a virada de dono do dado: o RevendaMais deixa de mandar em `estoque_motors`
-- e passa a ser uma FONTE DE IMPORTAÇÃO. Quem decide o que está no ar é a loja.
--
-- ---------------------------------------------------------------------------
-- Por que uma coluna nova, e não só desligar o cron
-- ---------------------------------------------------------------------------
-- Hoje "está no ar" é DERIVADO do carimbo do sync: `apenasDoUltimoSync`
-- (`lib/supabase.ts`) mantém quem tem `last_seen_at` dentro da janela do ciclo
-- mais recente, e `publicacao.ts` chama de "fora do feed" quem caiu fora.
--
-- Isso funcionava porque o cron rodava de 6 em 6 horas e o feed era a verdade.
-- Com importação MANUAL, a mesma régua apodrece em silêncio: a próxima
-- importação (parcial, ou de um carro só) vira "o ciclo mais recente", e todo o
-- resto do estoque cai fora da janela — o site esvazia sem ninguém ter mexido
-- em nada. O estado precisa deixar de ser inferido do relógio do robô.
--
--   rascunho   — importado ou cadastrado, ainda NÃO revisado. Fica só no
--                painel. É o estado em que todo carro nasce, daqui em diante.
--   publicado  — a loja conferiu e liberou. É o que a vitrine mostra.
--   arquivado  — saiu do estoque. Não volta sozinho.
--
-- `vendido` continua ORTOGONAL e intocado: um carro publicado e vendido segue
-- a régua de carência de `publicacao.ts` (selo VENDIDO por 90 dias, depois
-- arquivamento da URL). Misturar as duas coisas numa coluna só apagaria essa
-- distinção, que o SEO depende.
--
-- ---------------------------------------------------------------------------
-- Estado de hoje, medido antes do backfill (104 veículos)
-- ---------------------------------------------------------------------------
--   38 ativos (não vendidos, dentro da janela do último ciclo) → publicado
--   24 vendidos                                                → publicado
--      (a carência do SEO é de `publicacao.ts`; arquivar aqui mataria a URL
--       antes da hora e o Google levaria semanas para reindexar)
--   42 fora do feed (não vendidos, fora da janela)              → arquivado
--      (o feed parou de anunciá-los: a loja não os tem mais)
-- ============================================================================

alter table public.estoque_motors
  add column if not exists estado_cadastro text not null default 'rascunho';

do $$ begin
  alter table public.estoque_motors
    add constraint estoque_motors_estado_valido
    check (estado_cadastro in ('rascunho', 'publicado', 'arquivado'));
exception when duplicate_object then null; end $$;

comment on column public.estoque_motors.estado_cadastro is
  'Quem decide o que está no ar: a loja, não o robô (decisão do dono, 2026-08-30). `rascunho` é onde todo carro nasce — importado do RevendaMais ou cadastrado no painel — e só sai por ato de quem publica. Substituiu a janela de `last_seen_at` como régua de visibilidade: com importação manual, aquela janela esvaziaria o site sozinha.';

create index if not exists estoque_motors_estado_idx
  on public.estoque_motors (estado_cadastro) where estado_cadastro = 'publicado';

-- ----------------------------------------------------------------------------
-- Backfill — preserva EXATAMENTE o que o site mostra hoje
--
-- Roda uma vez: a condição `estado_cadastro = 'rascunho'` (o default) garante
-- que reexecutar não reescreve decisão que a loja tenha tomado depois.
-- ----------------------------------------------------------------------------
with ultimo as (select max(last_seen_at) u from public.estoque_motors)
update public.estoque_motors e
   set estado_cadastro = case
         -- No ar hoje (a mesma janela de 30 min de `apenasDoUltimoSync`):
         when e.last_seen_at >= (select u from ultimo) - interval '30 minutes'
           then 'publicado'
         -- Vendido fica publicado: quem tira do ar é a carência do SEO.
         when e.vendido then 'publicado'
         else 'arquivado'
       end
 where e.estado_cadastro = 'rascunho';

-- ----------------------------------------------------------------------------
-- A trava vira TOTAL: "sem override"
--
-- Até aqui (f0k) o trigger só protegia a linha do painel. Agora o sync não
-- sobrescreve NADA — nem o carro que ele mesmo importou. Ele passa a ter um
-- verbo só: INSERT de rascunho.
--
-- O reconhecimento continua sendo a assinatura `last_seen_at`, e continua
-- valendo o motivo de ignorar em silêncio em vez de estourar: o upsert do n8n
-- processa o feed inteiro em lote, e uma exceção mataria o lote dos veículos
-- legítimos. Com `Prefer: resolution=merge-duplicates`, o conflito vira UPDATE
-- e o trigger o devolve intacto — que é exatamente o "sem override" pedido.
-- ----------------------------------------------------------------------------
create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
begin
  -- DOIS sinais, e qualquer um basta.
  --
  -- 1. A IDENTIDADE. O n8n autentica com a chave de serviço (o nó "Upsert
  --    Veículo (HTTP)" manda `apikey` e `Authorization: Bearer` com
  --    SUPABASE_SERVICE_ROLE_KEY), e o PostgREST a mapeia para `service_role`.
  --    O painel escreve como `authenticated`, com a sessão de quem clicou.
  --    Nenhuma rota do site atualiza `estoque_motors` com a chave de serviço —
  --    conferido em 2026-08-30: ela só é usada para auth de usuário, storage
  --    de branding e LEITURAS.
  --
  -- 2. A ASSINATURA `last_seen_at`, que era o único sinal até aqui. Ele
  --    sozinho tinha uma fresta que o próprio aceite desta migração
  --    encontrou: `now()` é o instante da TRANSAÇÃO, então uma escrita que
  --    repetisse o mesmo carimbo não seria reconhecida como sync. Em produção
  --    o n8n gera o texto no JavaScript a cada requisição e o valor sempre
  --    difere — mas defesa que depende de um valor nunca coincidir não é
  --    defesa. Os dois juntos fecham.
  if current_user = 'service_role'
     or new.last_seen_at is distinct from old.last_seen_at then
    -- Escrita do sync. Desde 2026-08-30 ela não altera veículo nenhum: o
    -- RevendaMais importa, não manda.
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
  'O sync do RevendaMais não sobrescreve nada (decisão do dono, 2026-08-30 — antes protegia só a linha do painel). Reconhece o sync pela assinatura `last_seen_at`; ignora a escrita em silêncio para não matar o lote do feed.';

-- ----------------------------------------------------------------------------
-- O que a importação cria é RASCUNHO — e não depende de o robô lembrar
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

  -- Carro novo nasce rascunho, venha de onde vier. Publicar é ATO de quem
  -- publica (linha "Publicar ou despublicar veículo" da A17) — nunca efeito
  -- colateral de uma importação. Aceitar `estado_cadastro` do payload deixaria
  -- o robô publicar sozinho, que é o que a decisão de 2026-08-30 desfez.
  new.estado_cadastro := 'rascunho';

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------------------------
do $$
declare
  n int;
  id_feed integer := 7000002;
  id_nativo integer;
  antes record;
  depois record;
  falhas int := 0;
begin
  -- 1. O backfill preservou a vitrine: os 38 ativos seguem publicados.
  select count(*) into n from public.estoque_motors
   where estado_cadastro = 'publicado' and not vendido;
  if n <> 38 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % ativos publicados (esperava 38)', n;
  end if;

  select count(*) into n from public.estoque_motors where estado_cadastro = 'arquivado';
  if n <> 42 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % arquivados (esperava 42)', n;
  end if;

  select count(*) into n from public.estoque_motors
   where estado_cadastro = 'publicado' and vendido;
  if n <> 24 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % vendidos publicados (esperava 24)', n;
  end if;

  -- 2. Importação nova nasce RASCUNHO, mesmo mandando o contrário.
  insert into public.estoque_motors (id, marca, modelo, preco, ano, last_seen_at, estado_cadastro)
  values (id_feed, 'AceiteF0Q', 'Importado', 50000, 2022, now(), 'publicado');
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.estado_cadastro <> 'rascunho' then
    falhas := falhas + 1;
    raise warning 'FALHOU: importação nasceu %, não rascunho', depois.estado_cadastro;
  end if;

  -- 3a. O SYNC ATACA um carro do FEED pela ASSINATURA — e não muda nada.
  --
  -- `clock_timestamp()` e não `now()`: o segundo é o instante da TRANSAÇÃO e
  -- repetiria o carimbo gravado no insert acima, fazendo o gatilho não
  -- reconhecer a escrita. Foi assim que este aceite achou a fresta que o
  -- comentário da função registra.
  select * into antes from public.estoque_motors where id = id_feed;
  update public.estoque_motors
     set preco = 99999, marca = 'SobrescritoPeloSync', last_seen_at = clock_timestamp()
   where id = id_feed;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.preco <> antes.preco or depois.marca <> antes.marca then
    falhas := falhas + 1;
    raise warning 'FALHOU: o sync alterou carro do feed pela assinatura (preco=%, marca=%)', depois.preco, depois.marca;
  end if;

  -- 3b. E ataca pela IDENTIDADE, sem tocar no carimbo — o furo que a
  -- assinatura sozinha deixaria aberto.
  set local role service_role;
  update public.estoque_motors set preco = 88888 where id = id_feed;
  reset role;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.preco <> antes.preco then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role alterou carro sem mexer no carimbo (preco=%)', depois.preco;
  end if;

  -- 4. O painel continua editando — inclusive publicando.
  update public.estoque_motors set estado_cadastro = 'publicado', preco = 51000 where id = id_feed;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.estado_cadastro <> 'publicado' or depois.preco <> 51000 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o painel não conseguiu revisar e publicar o rascunho';
  end if;

  -- 5. Estado fora do vocabulário: recusa.
  begin
    update public.estoque_motors set estado_cadastro = 'no_ar' where id = id_feed;
    falhas := falhas + 1;
    raise warning 'FALHOU: estado inválido foi aceito';
  exception when check_violation then null; end;

  -- 6. O cadastro nativo também nasce rascunho (nada é publicado sem ato).
  insert into public.estoque_motors (marca, modelo, preco, ano)
  values ('AceiteF0Q', 'Nativo', 60000, 2023) returning id into id_nativo;
  select * into depois from public.estoque_motors where id = id_nativo;
  if depois.estado_cadastro <> 'rascunho' or depois.origem <> 'painel' then
    falhas := falhas + 1;
    raise warning 'FALHOU: nativo nasceu % / %', depois.estado_cadastro, depois.origem;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na virada de dono do dado', falhas;
  end if;

  delete from public.estoque_motors where id in (id_feed, id_nativo);

  raise notice 'F0-q OK: 38 publicados / 24 vendidos / 42 arquivados; importação nasce rascunho e o sync não sobrescreve mais nada.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260830120000', 'f0q_estado_do_cadastro_e_fim_do_override')
  on conflict (version) do nothing;
