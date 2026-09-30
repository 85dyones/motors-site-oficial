-- ==========================================================
-- A250 vira "Classe A", como o C-180 virou "Classe C"
-- ==========================================================
--
-- Em 29/09 a regra do nome repetido (`modeloDeNomeRepetido`, veiculoUrl.ts)
-- tirou a versão do endereço do hub: `/carros/mercedes-benz/a250-turbo-sport`
-- passou a `/carros/mercedes-benz/a250`. Em 30/09 o dono pediu o nome do
-- modelo, pelo mesmo motivo da migração 20260826150000: o modelo É a Classe A,
-- e "A250" é a designação de motor. Um A200 que entrar depois vai para o mesmo
-- hub com o mesmo override, feito à mão no painel.
--
-- É dado, não esquema: o override é o campo que o painel escreve e o sync não
-- toca. Aplicado em produção pelo SQL do Supabase em 30/09, ANTES do deploy
-- que redireciona `/a250` e `/a250-turbo-sport` para `/classe-a`
-- (`next.config.ts`): na ordem inversa, o redirect apontaria para um hub que
-- o dado ainda não gerou. Reaplicar é inócuo: o WHERE exige override vazio.
--
-- Se o dono preferir outro nome, é uma edição no painel, sem deploy (e o
-- redirect do `next.config.ts` acompanha).
--
-- Por id: o 8497421 é a única Mercedes com `modelo` = "a250 turbo sport",
-- valor lido na coluna em 30/09 (`modelo` e `versao` iguais, como vêm do feed).

UPDATE public.estoque_motors
   SET modelo_override = 'Classe A', versao_override = 'A250 Turbo Sport'
 WHERE id = 8497421 AND modelo_override IS NULL;
