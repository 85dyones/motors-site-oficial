-- ==========================================================
-- O preço é do RevendaMais — sempre, nas três colunas
-- ==========================================================
--
-- Decisão do dono em 2026-09-02, literal:
--
--   "preciso que o preço seja o do revenda, sempre, nos campos de preço e no
--    de promoção, senão eu crio dois lugares para mudar isso e pode gerar
--    inúmeros problemas."
--
-- Ela reverte PARTE da decisão de 30/08 (`20260830120000_f0q`), que fez a
-- trava do sync ser total: desde então o RevendaMais não atualizava coluna
-- nenhuma, nem preço. E reverte a de 31/08, que abriu `preco_promocional` ao
-- painel em veículo de qualquer origem. As duas foram decisões do mesmo dono,
-- e a de hoje vem depois de medir o efeito das anteriores.
--
-- ----------------------------------------------------------
-- O que a medição mostrou (feed real × banco, 02/09, 39 anúncios)
-- ----------------------------------------------------------
--
--   preço de tabela divergente ........ 0 de 39
--   promoção só nossa (painel) ........ 0 — ninguém criou promoção aqui
--   promoção só deles ................. 3, sendo 2 ruído (PROMOTION_PRICE =
--                                       PRICE, que o n8n já normaliza para 0)
--                                       e 1 REAL: a Kia Sorento EX2, anunciada
--                                       a R$ 48.900 no RevendaMais e a
--                                       R$ 56.900 no site — R$ 8.000 a mais,
--                                       três dias depois do último import.
--
-- Ou seja: o medo de "dois lugares para mudar" não se materializou no painel
-- — ninguém usou —, mas a trava total produziu o oposto do que ele teme: um
-- preço que NÃO acompanha o gestor de estoque. Com o cron desligado e a trava
-- fechada, o site congela no valor do dia da importação.
--
-- ----------------------------------------------------------
-- O que muda: a trava vira allowlist de QUATRO colunas
-- ----------------------------------------------------------
--
-- O gatilho continua reconhecendo o sync pelos mesmos dois sinais (identidade
-- `service_role` OU assinatura `last_seen_at`). O que muda é o que ele faz ao
-- reconhecer: em vez de devolver OLD inteiro, devolve OLD com quatro campos
-- copiados de NEW —
--
--   preco · preco_original · preco_promocional · last_seen_at
--
-- e NADA mais. A forma importa: é allowlist POR CONSTRUÇÃO. Parte-se da linha
-- que já existe e copia-se só o permitido, então coluna nova nasce protegida
-- sem ninguém precisar lembrar de acrescentá-la a uma lista de proibidos.
-- Conteúdo (descrição, fotos, opcionais, overrides, perfis, estado, vendido)
-- continua intocável pelo sync — é a fronteira da F0.5: o RevendaMais diz o
-- que existe e quanto custa; nós dizemos como aparece e se aparece.
--
-- `last_seen_at` entra por dois motivos. Primeiro, é a assinatura: sem
-- gravá-la, o segundo sinal deixaria de existir na linha. Segundo, ela é o
-- proxy da data de venda na carência de SEO (`publicacao.ts`) quando a venda
-- não passou pelo Ciclo — e estava congelada em 30/08 para o estoque inteiro,
-- fazendo um carro vendido hoje herdar carimbo de até 27 dias atrás.
--
-- Por que a objeção anterior caiu: em 01/09 esta allowlist foi recusada porque
-- "o RevendaMais desfaria as 16 promoções que a loja define no painel". Com a
-- promoção passando a ser DELE, não há o que desfazer. E a medição acima
-- prova que nunca houve: zero promoção só nossa.
--
-- O que NÃO muda: o INSERT continua nascendo `origem='sync'` e
-- `estado_cadastro='rascunho'` (trigger de INSERT intacto); `origem` continua
-- imutável por UPDATE; o painel continua escrevendo tudo o que escrevia, MENOS
-- promoção em carro do sync — essa saiu de `camposGravaveis` no mesmo PR.
--
-- ⚠️ Superfície: o gatilho reconhece a CHAVE DE SERVIÇO, não "o workflow do
-- n8n". Qualquer coisa com essa chave passa a poder escrever as quatro colunas.
-- É a mesma superfície de antes com uma porta a mais, e está dita aqui para
-- não virar surpresa. Nenhuma rota do site atualiza `estoque_motors` com a
-- chave de serviço (conferido em 30/08 e de novo hoje).
--
-- Migração ADITIVA no sentido do handoff: `create or replace` de função
-- existente, sem DROP/RENAME/ALTER TYPE.
-- ==========================================================

create or replace function public.estoque_motors_trava_do_sync()
returns trigger
language plpgsql
as $$
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
    -- Escrita do sync. Desde 2026-09-02 ele manda em QUATRO colunas — o trio
    -- de preço e o próprio carimbo — e em nenhuma outra.
    --
    -- Allowlist por construção: parte de OLD (a linha como está) e copia só
    -- o permitido. Tudo o que o sync mandou fora destas quatro é descartado
    -- em silêncio — e o silêncio continua sendo deliberado, pelo motivo da
    -- f0q: o upsert processa o feed inteiro em lote, e uma exceção mataria o
    -- lote dos veículos legítimos.
    old.preco             := new.preco;
    old.preco_original    := new.preco_original;
    old.preco_promocional := new.preco_promocional;
    old.last_seen_at      := new.last_seen_at;
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
  'O sync do RevendaMais manda em QUATRO colunas — preco, preco_original, preco_promocional, last_seen_at — e em nenhuma outra (decisão do dono, 2026-09-02: "o preço é do revenda, sempre"; antes, desde 30/08, não atualizava nada). Reconhece o sync pela identidade service_role ou pela assinatura last_seen_at; descarta o resto em silêncio para não matar o lote do feed. Allowlist por construção: devolve OLD com só as quatro copiadas de NEW.';


-- ==========================================================
-- Autoconferência — a migração prova a si mesma antes do COMMIT
-- ==========================================================
-- Mesma técnica da f0q: uma linha de teste na faixa do feed, os ataques 3a
-- (assinatura) e 3b (identidade), e agora o resultado esperado é o INVERSO
-- para as quatro colunas e o MESMO para todas as outras.
do $$
declare
  id_feed   integer := 8399998;   -- faixa do feed (6,1M–8,4M), fora de uso
  antes     public.estoque_motors%rowtype;
  depois    public.estoque_motors%rowtype;
  falhas    integer := 0;
begin
  delete from public.estoque_motors where id = id_feed;

  -- 0. Nasce como o sync nasce: pelo INSERT, que o trigger força a rascunho.
  insert into public.estoque_motors
    (id, marca, modelo, preco, preco_original, preco_promocional, ano,
     descricao_seo, whatsapp_images, last_seen_at)
  values
    (id_feed, 'AceiteF05', 'Importado', 50000, 50000, 0, 2022,
     'texto nosso', '["https://exemplo/foto-nossa.jpg"]'::jsonb, now());
  select * into antes from public.estoque_motors where id = id_feed;
  if antes.estado_cadastro <> 'rascunho' or antes.origem <> 'sync' then
    falhas := falhas + 1;
    raise warning 'FALHOU: importação nasceu % / %, não rascunho / sync', antes.estado_cadastro, antes.origem;
  end if;

  -- 1. O SYNC ATACA pela ASSINATURA, mandando preço E conteúdo.
  --    Esperado: as quatro mudam; o conteúdo não.
  --
  --    `clock_timestamp()` e não `now()`: o segundo é o instante da TRANSAÇÃO
  --    e repetiria o carimbo do insert, e o gatilho não reconheceria a
  --    escrita — a fresta que a f0q documentou.
  update public.estoque_motors
     set preco             = 45000,
         preco_original    = 50000,
         preco_promocional = 45000,
         last_seen_at      = clock_timestamp(),
         marca             = 'SobrescritoPeloSync',
         descricao_seo     = 'SobrescritoPeloSync',
         whatsapp_images   = '["https://carro57/foto-deles.jpg"]'::jsonb,
         estado_cadastro   = 'publicado',
         vendido           = true
   where id = id_feed;
  select * into depois from public.estoque_motors where id = id_feed;

  if depois.preco <> 45000 or depois.preco_promocional <> 45000 then
    falhas := falhas + 1;
    raise warning 'FALHOU: o sync NÃO conseguiu atualizar o preço (preco=%, promo=%)', depois.preco, depois.preco_promocional;
  end if;
  if depois.last_seen_at is not distinct from antes.last_seen_at then
    falhas := falhas + 1;
    raise warning 'FALHOU: last_seen_at não avançou — o batimento continua congelado';
  end if;
  if depois.marca <> antes.marca
     or depois.descricao_seo <> antes.descricao_seo
     or depois.whatsapp_images <> antes.whatsapp_images
     or depois.estado_cadastro <> antes.estado_cadastro
     or depois.vendido <> antes.vendido then
    falhas := falhas + 1;
    raise warning 'FALHOU: o sync alterou CONTEÚDO (marca=%, seo=%, fotos=%, estado=%, vendido=%)',
      depois.marca, depois.descricao_seo, depois.whatsapp_images, depois.estado_cadastro, depois.vendido;
  end if;

  -- 2. E ataca pela IDENTIDADE, sem tocar no carimbo. Mesma régua.
  antes := depois;
  set local role service_role;
  update public.estoque_motors
     set preco = 44000, preco_promocional = 44000, marca = 'IdentidadeSobrescreveu'
   where id = id_feed;
  reset role;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.preco <> 44000 or depois.preco_promocional <> 44000 then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role NÃO conseguiu atualizar preço (preco=%)', depois.preco;
  end if;
  if depois.marca <> antes.marca then
    falhas := falhas + 1;
    raise warning 'FALHOU: service_role alterou conteúdo (marca=%)', depois.marca;
  end if;

  -- 3. O PAINEL continua editando conteúdo — inclusive publicando — e a
  --    origem continua imutável.
  update public.estoque_motors
     set estado_cadastro = 'publicado', descricao_seo = 'revisado no painel', origem = 'painel'
   where id = id_feed;
  select * into depois from public.estoque_motors where id = id_feed;
  if depois.estado_cadastro <> 'publicado' or depois.descricao_seo <> 'revisado no painel' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o painel não conseguiu revisar e publicar';
  end if;
  if depois.origem <> 'sync' then
    falhas := falhas + 1;
    raise warning 'FALHOU: origem trocou por UPDATE (%)', depois.origem;
  end if;

  -- 4. Informativo, não asserção: o carimbo de conteúdo moveu com o preço?
  --    `marcar_conteudo_atualizado()` decide isso sozinha; aqui só se registra
  --    o que aconteceu, para o `lastmod` do sitemap não virar surpresa.
  raise notice 'conteudo_atualizado_em depois do ataque de preço: % (linha nasceu com %)',
    depois.conteudo_atualizado_em, antes.conteudo_atualizado_em;

  delete from public.estoque_motors where id = id_feed;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na allowlist de preço do sync', falhas;
  end if;

  raise notice 'Preço do RevendaMais OK: sync escreve as quatro, não escreve conteúdo; painel segue editando; origem imutável.';
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260902120000', 'preco_e_do_revendamais')
  on conflict (version) do nothing;
