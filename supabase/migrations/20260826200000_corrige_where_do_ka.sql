-- ==========================================================
-- Corrige o `WHERE` do Ka na migração 20260826150000
-- ==========================================================
--
-- Das quatro correções daquela migração, três entraram e uma não. Conferido
-- no feed servido depois do deploy:
--
--   honda/hr-v          ✓  /carros/honda/hr-v/ex-18-flexone-16v-5p-aut/…
--   mercedes-benz       ✓  /carros/mercedes-benz/classe-c responde 200
--   volkswagen/voyage   ✓  /carros/volkswagen/novo-voyage-10 responde 404
--   ford/ka             ✗  segue com o segmento triplicado
--
-- O `WHERE` era `modelo ILIKE 'Ka Sedan%'`. O valor real é:
--
--   "Ka+ Sedan 1.0 Se Flex 4p"
--
-- com **sinal de mais**. O padrão não casou, o UPDATE afetou zero linhas, e um
-- UPDATE que não acha nada não reclama — é a falha silenciosa de sempre, desta
-- vez na migração.
--
-- O dado estava à vista o tempo todo: o `<title>` do hub sujo dizia "Ka+ Sedan
-- Seminovo em Curitiba" e o feed dizia "Ford Ka+ Sedan 1.0 Se Flex 4p". A
-- slugificação come o "+" ("ka-sedan-10-se-flex-4p"), e foi do slug que o
-- padrão saiu — em vez de sair do campo que ele ia comparar.
--
-- `'Ka%Sedan%'` cobre as duas grafias e não alcança os outros dois Ka do
-- pátio, cujo `modelo` é só "Ka" — sem "Sedan", não casam. Conferido nas URLs
-- servidas: /carros/ford/ka/se-plus-10-ha-c/… e /carros/ford/ka/sedan-se-15-12v/…
--
-- Lição para a próxima: em migração de correção pontual, o padrão do `WHERE`
-- tem de sair do VALOR DA COLUNA lido na origem, nunca do slug derivado dele.
-- ==========================================================

UPDATE public.estoque_motors
   SET modelo_override = 'Ka', versao_override = 'Sedan 1.0 SE Flex 4p'
 WHERE modelo ILIKE 'Ka%Sedan%' AND modelo_override IS NULL;
