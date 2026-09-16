-- ---------------------------------------------------------------------------
-- O laudo cautelar deixa de ser promessa vazia na ficha
-- ---------------------------------------------------------------------------
-- Decisão do dono em 2026-09-01, depois de o relatório dos hubs marcar isto
-- como "uma pendência que segue aberta":
--
--   *"anexe 'Laudo cautelar completo — estrutura, chassi e histórico de
--   sinistro auditados por empresa credenciada junto ao Detran' para todos sem
--   texto, depois se houve customização, mantemos"*.
--
-- O site promete laudo na ficha em oito lugares — home, `/estoque`,
-- `/garantia`, `/destaques`, a meta da PDP, a descrição de cada item do feed
-- de anúncios e a PRIMEIRA pergunta do FAQ dos 103 hubs, marcada como
-- `FAQPage` para o Google. Medido hoje, antes desta migração: das 36 fichas na
-- vitrine, ZERO abriam o bloco de laudo. Prometer o que não está lá custa mais
-- caro que qualquer erro de SEO.
--
-- ---------------------------------------------------------------------------
-- Preencher NÃO é o mesmo que exibir — e o portão continua de pé
-- ---------------------------------------------------------------------------
-- `PDPClientWrapper` só abre o bloco quando há texto E a perícia do feed lê
-- como aprovada. O portão está certo e não se toca: afirmar laudo limpo sobre
-- carro que a vistoria não aprovou é o erro que ele existe para impedir.
--
-- Por isso o efeito desta migração é parcial de propósito, e é bom que seja:
--
--   26 fichas passam a exibir o bloco  (19 na vitrine + 7 vendidas na carência)
--   36 seguem sem exibir              (perícia "Em análise" no feed)
--   42 arquivadas não têm ficha       (o texto fica pronto para quando voltarem)
--
-- Quando a perícia de um carro virar aprovada no feed, o bloco acende sozinho.
--
-- ---------------------------------------------------------------------------
-- Customização vence o padrão
-- ---------------------------------------------------------------------------
-- O `where` só alcança linha vazia. O campo continua sendo o de APONTAMENTOS
-- pontuais que o dono definiu em 29/08 — este texto é o piso, não o teto, e
-- quem escrever algo específico sobrescreve sem que nada aqui desfaça.
--
-- Hoje uma linha só está nessa situação: a Saveiro 8358193, com *"100%
-- aprovada em mais de 120 itens de inspeção"*. O aceite prova que ela
-- sobreviveu — é o caso que uma migração descuidada apagaria.
--
-- ---------------------------------------------------------------------------
-- Por que é migração, e não um script com a chave de serviço
-- ---------------------------------------------------------------------------
-- Foi tentado pela chave de serviço primeiro. O PostgREST devolveu 200, a
-- linha voltou no `select` — e o valor não gravou. A trava `f0k` viva no banco
-- (que NÃO é a do arquivo `20260829130000`: uma versão posterior alargou a
-- regra) recusa toda escrita feita como `service_role`:
--
--   if current_user = 'service_role' or new.last_seen_at is distinct from
--      old.last_seen_at then return old; end if;
--
-- É o desenho de 30/08, quando o RevendaMais virou importação: "o RevendaMais
-- importa, não manda". Ela ignora em silêncio, de propósito, para não matar o
-- lote do feed — e foi ela que pegou a escrita. Pelo pooler o `current_user` é
-- o dono do banco, `last_seen_at` não é tocado, e a trava deixa passar.
--
-- ---------------------------------------------------------------------------
-- Efeito colateral aceito: o `lastmod` do sitemap
-- ---------------------------------------------------------------------------
-- `laudo_pericia` está na lista de `marcar_conteudo_atualizado`, então as 62
-- fichas publicadas ganham carimbo de hoje. Em 26 delas o carimbo é honesto —
-- a página mudou de verdade. Nas outras 36 a página segue idêntica ao que o
-- rastreador viu ontem. É um carimbo falso em 36 URLs, uma vez só, e o
-- caminho para evitá-lo seria tirar o laudo da lista de conteúdo — o que seria
-- pior, porque laudo É conteúdo. Fica registrado em vez de escondido.
-- ---------------------------------------------------------------------------

update public.estoque_motors
   set laudo_pericia = 'Laudo cautelar completo — estrutura, chassi e histórico de sinistro auditados por empresa credenciada junto ao Detran'
 where coalesce(btrim(laudo_pericia), '') = '';

-- ---------------------------------------------------------------------------
-- Aceite — prova o EFEITO, não a intenção
-- ---------------------------------------------------------------------------
-- A checagem de "nenhuma linha vazia" é a que importa: foi exatamente ela que
-- teria pegado a escrita engolida pela trava, que reportou 103 sucessos e
-- gravou zero.
do $$
declare
  falhas       int := 0;
  vazias       int;
  com_padrao   int;
  customizada  text;
  publicadas   int;
begin
  select count(*) into vazias
    from public.estoque_motors
   where coalesce(btrim(laudo_pericia), '') = '';
  if vazias > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % veículo(s) seguem sem laudo — a escrita não chegou ao banco', vazias;
  end if;

  select count(*) into com_padrao
    from public.estoque_motors
   where laudo_pericia like 'Laudo cautelar completo — estrutura, chassi%';
  if com_padrao < 100 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % linha(s) receberam o texto padrão', com_padrao;
  end if;

  -- A customização que existia tem de continuar existindo, palavra por palavra.
  select laudo_pericia into customizada
    from public.estoque_motors where id = 8358193;
  if customizada is null or customizada not like '%120 itens de inspeção%' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o laudo customizado da Saveiro 8358193 foi sobrescrito (valor: %)', customizada;
  end if;

  -- E o portão da PDP continua sendo o par (texto + perícia aprovada): as
  -- fichas que exibem o bloco têm de ser MENOS que as publicadas, senão
  -- alguém afrouxou a regra junto.
  select count(*) into publicadas
    from public.estoque_motors
   where estado_cadastro = 'publicado'
     and lower(coalesce(pericia, '')) ~ 'aprovad'
     and lower(coalesce(pericia, '')) !~ '(nao|não|sem|reprovad|pendent|negad|indeferid)';
  if publicadas = 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: nenhuma ficha publicada tem perícia aprovada — o bloco não abriria para ninguém';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no laudo cautelar padrão', falhas;
  end if;

  raise notice 'Laudo OK: % com o texto padrão, 0 vazias, customização preservada, % publicadas com perícia aprovada.',
    com_padrao, publicadas;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260901120000', 'laudo_cautelar_texto_padrao')
  on conflict (version) do nothing;
