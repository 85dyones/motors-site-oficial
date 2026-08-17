-- ==========================================================
-- `conteudo_atualizado_em` — quando o anúncio de fato mudou
-- ==========================================================
--
-- O problema, medido em 2026-08-17: o `sitemap.xml` declarava
-- `lastModified: new Date()` em toda URL. Estático, isso dava a data do build;
-- com o `revalidate` de uma hora que entrou no mesmo dia, passaria a declarar
-- "modificado agora" para os 43 veículos, de hora em hora.
--
-- O Google ignora `lastmod` quando ele sempre coincide com o horário da
-- requisição. Os portais e agregadores NÃO ignoram — eles reprocessam o item.
-- Decisão do dono em 2026-08-17: o dado vai ser usado, porque o sync do
-- RevendaMais será aposentado e a base passa a ser 100% própria.
--
-- ----------------------------------------------------------
-- Por que uma coluna nova, e não uma das duas que já existem
-- ----------------------------------------------------------
-- `last_seen_at` é carimbado a cada ciclo de sync, tenha mudado algo ou não.
-- Usá-lo como `lastmod` faria todo o estoque anunciar alteração quatro vezes
-- por dia (cron de 6h) — o mesmo "sempre agora", só que em outro passo. O
-- consumidor aprende a desconfiar da fonte, e aí o canal se perde justamente
-- quando o dado passar a ser bom.
--
-- `created_at` nunca muda. Um carro que baixou de preço ontem anunciaria
-- `lastmod` de meses atrás, e a mudança de preço — a única com urgência
-- comercial — seria a que não chega.
--
-- ----------------------------------------------------------
-- Por que TRIGGER e não código de aplicação
-- ----------------------------------------------------------
-- Hoje escrevem duas coisas nesta tabela: o upsert do workflow n8n e o painel
-- admin. Amanhã, só o painel. Um trigger é invariante do banco: sobrevive à
-- aposentadoria do sync e a qualquer caminho de escrita futuro sem que alguém
-- precise lembrar dele. Em código, cada novo ponto de escrita é uma chance de
-- esquecer — e o sintoma seria mudo, do jeito que este projeto já conhece:
-- `lastmod` parado, portal sem reprocessar, e nada aparecendo errado no site.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. A coluna
-- ----------------------------------------------------------
-- Sem `DEFAULT` no ADD COLUMN, ao contrário de `last_seen_at`: aqui o backfill
-- honesto não é "agora" para todo mundo. `created_at` é o que de fato se sabe
-- sobre as linhas antigas — nenhuma outra informação sobre quando elas mudaram
-- existe no banco. Carimbar tudo com `now()` seria anunciar aos portais que os
-- 43 veículos mudaram no instante da migração, que é exatamente a mentira que
-- esta coluna existe para desfazer.
ALTER TABLE public.estoque_motors
    ADD COLUMN IF NOT EXISTS conteudo_atualizado_em timestamptz;

UPDATE public.estoque_motors
   SET conteudo_atualizado_em = coalesce(created_at, now())
 WHERE conteudo_atualizado_em IS NULL;

-- O default só entra DEPOIS do backfill: linhas novas nascem com o instante da
-- inserção, que para elas é a verdade.
ALTER TABLE public.estoque_motors
    ALTER COLUMN conteudo_atualizado_em SET DEFAULT now();

ALTER TABLE public.estoque_motors
    ALTER COLUMN conteudo_atualizado_em SET NOT NULL;

COMMENT ON COLUMN public.estoque_motors.conteudo_atualizado_em IS
    'Instante da ultima mudanca real no conteudo publico do anuncio (preco, '
    'fotos, km, descricao, vendido...). Mantido pelo trigger '
    'estoque_motors_conteudo_atualizado — NAO escreva nesta coluna direto, o '
    'trigger descarta o valor enviado. Alimenta o lastmod do sitemap.xml.';

-- ----------------------------------------------------------
-- 2. O trigger
-- ----------------------------------------------------------
-- A lista de colunas comparadas é EXPLÍCITA, e a ausência de algumas é tão
-- deliberada quanto a presença das outras:
--
--   `last_seen_at` .... fora, e é o ponto central. Se entrasse, todo ciclo de
--                       sync marcaria as 43 linhas como alteradas e a coluna
--                       nova viraria uma cópia cara da velha.
--   `preco_compra` .... fora: interno, é margem. Portal nenhum vê.
--   `placa` ........... fora: interno, é documentação do veículo.
--   `perfil_uso` ...... fora: classificação para o motor de recomendação.
--   `status_tag_color`  fora: cor do selo, cosmético.
--   `created_at`, `id`  fora pelo óbvio.
--
-- `IS DISTINCT FROM` e não `<>`: com `<>`, qualquer comparação envolvendo NULL
-- devolve NULL em vez de verdadeiro, e a condição inteira desmorona em
-- silêncio. Boa parte destas colunas é NULL em produção (`laudo_pericia`,
-- `opcionais`, `status_tag` e `motor` estão NULL em toda a amostra), então
-- este não é um caso hipotético — seria o caso comum.
create or replace function public.marcar_conteudo_atualizado()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  if (
       new.marca             is distinct from old.marca             or
       new.modelo            is distinct from old.modelo            or
       new.versao            is distinct from old.versao            or
       new.ano               is distinct from old.ano               or
       new.ano_fabricacao    is distinct from old.ano_fabricacao    or
       new.quilometragem     is distinct from old.quilometragem     or
       new.cambio            is distinct from old.cambio            or
       new.combustivel       is distinct from old.combustivel       or
       new.cor               is distinct from old.cor               or
       new.preco             is distinct from old.preco             or
       new.preco_original    is distinct from old.preco_original    or
       new.preco_promocional is distinct from old.preco_promocional or
       new.url_imagem        is distinct from old.url_imagem        or
       new.whatsapp_images   is distinct from old.whatsapp_images   or
       new.web_full_images   is distinct from old.web_full_images   or
       new.pericia           is distinct from old.pericia           or
       new.descricao         is distinct from old.descricao         or
       new.laudo_pericia     is distinct from old.laudo_pericia     or
       new.opcionais         is distinct from old.opcionais         or
       new.tipo              is distinct from old.tipo              or
       new.status_tag        is distinct from old.status_tag        or
       new.vendido           is distinct from old.vendido           or
       new.motor             is distinct from old.motor             or
       new.cor_interna       is distinct from old.cor_interna       or
       new.donos_anteriores  is distinct from old.donos_anteriores  or
       new.garantia_fabrica  is distinct from old.garantia_fabrica
     ) then
    new.conteudo_atualizado_em := now();
  else
    -- Nada de conteúdo mudou. Preserva o carimbo antigo E descarta o valor que
    -- o cliente tenha mandado na coluna: quem decide aqui é o banco. Sem este
    -- ramo, o upsert do n8n — que envia a linha inteira — poderia sobrescrever
    -- o carimbo com o default e reintroduzir o "sempre agora" pela porta dos
    -- fundos.
    new.conteudo_atualizado_em := old.conteudo_atualizado_em;
  end if;

  return new;
end;
$$;

-- Só `BEFORE UPDATE`: no INSERT o `DEFAULT now()` já diz a verdade, e um
-- trigger de insert teria de lidar com `OLD` inexistente sem ganhar nada.
DROP TRIGGER IF EXISTS estoque_motors_conteudo_atualizado ON public.estoque_motors;

CREATE TRIGGER estoque_motors_conteudo_atualizado
    BEFORE UPDATE ON public.estoque_motors
    FOR EACH ROW
    EXECUTE FUNCTION public.marcar_conteudo_atualizado();

-- ----------------------------------------------------------
-- 3. Índice
-- ----------------------------------------------------------
-- Mesma justificativa do índice de `last_seen_at`: com 43 linhas a varredura
-- ganha do índice. Existe para "o que mudou desde X", que é a pergunta natural
-- sobre esta coluna e a que um feed incremental faria.
CREATE INDEX IF NOT EXISTS estoque_motors_conteudo_atualizado_em_idx
    ON public.estoque_motors (conteudo_atualizado_em DESC);
