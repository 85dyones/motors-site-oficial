-- ==========================================================
-- `descricao_seo` — o texto que vai para os portais
-- ==========================================================
--
-- Esta coluna nunca existiu, e o código escrevia como se existisse desde
-- sempre. `src/app/api/feed/xml/route.ts` monta a descrição de cada item com
--
--     car.descricao_seo || "Aproveite as melhores condições para comprar seu ..."
--
-- e `descricao_seo` só existia como campo opcional em `src/types/index.ts`:
-- não é coluna de `estoque_motors` e o mapper nunca a preenchia. O `||` caía
-- no fallback SEMPRE.
--
-- Medido em produção em 2026-08-17: os 41 veículos do feed saíam com a mesma
-- frase genérica, mudando só marca e modelo. É o mesmo defeito de
-- `preco_compra`, com um agravante: `preco_compra` aparecia numa query e o
-- PostgREST devolvia 42703; aqui não há query citando nada — é uma propriedade
-- que nunca chega, `undefined` silencioso dentro de um `select("*")`.
--
-- Decisão do dono em 2026-08-17: o campo é necessário de fato. Nasce como
-- coluna DO PAINEL, no mesmo contrato da migração 20260807160000 — o sync do
-- RevendaMais não a conhece e não a sobrescreve.
--
-- ----------------------------------------------------------
-- Por que não basta trocar por `descricao` no feed
-- ----------------------------------------------------------
-- `descricao` é o texto editorial que abre a PDP: longo, escrito para quem já
-- está na página. O que o portal publica é outra peça — curta, com o que
-- diferencia o carro, sem depender do contexto da página. Uma coisa pode
-- servir de base para a outra, mas confundir as duas é publicar texto de
-- vitrine onde cabe anúncio.
--
-- O fallback no código passa a ser `descricao_seo || descricao || genérico`:
-- enquanto ninguém preencher a coluna nova, os anúncios já saem com o texto
-- real em vez da frase de catálogo. Vazia, a coluna não piora nada; preenchida,
-- é o texto certo no lugar certo.
-- ==========================================================

ALTER TABLE public.estoque_motors
    ADD COLUMN IF NOT EXISTS descricao_seo text;

COMMENT ON COLUMN public.estoque_motors.descricao_seo IS
    'Descricao curta para portais e meta description. Campo do PAINEL: o sync '
    'do RevendaMais nao escreve aqui (ver CAMPOS_NOSSOS em lib/estoqueEscrita). '
    'Vazia, o codigo cai em `descricao` e so depois no texto generico.';

-- ----------------------------------------------------------
-- O trigger de `conteudo_atualizado_em` precisa enxergar a coluna nova
-- ----------------------------------------------------------
-- `descricao_seo` é conteúdo público — é literalmente o texto que o portal
-- publica. Mudá-la TEM de mover o carimbo, senão o portal nunca reprocessa o
-- anúncio reescrito, que é o caso de uso que motivou o carimbo.
--
-- A função é recriada por inteiro, e não remendada, porque `CREATE OR REPLACE`
-- substitui o corpo todo. A ordem entre as duas migrações importa: a de
-- 20260817120000 cria a função SEM esta coluna (que ainda não existe naquele
-- ponto), e esta a substitui logo depois de criar a coluna. Em nenhum instante
-- o trigger referencia campo inexistente — se a ordem invertesse, todo UPDATE
-- na tabela quebraria no intervalo entre as duas.
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
       new.descricao_seo     is distinct from old.descricao_seo     or
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
    -- Preserva o carimbo antigo E descarta o valor que o cliente tenha mandado
    -- na coluna: quem decide aqui é o banco. Ver a migração anterior.
    new.conteudo_atualizado_em := old.conteudo_atualizado_em;
  end if;

  return new;
end;
$$;
