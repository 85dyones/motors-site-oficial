-- ============================================================================
-- Os níveis da consulta de placa, e o "aprofundar" que não paga duas vezes
-- ============================================================================
-- Pedido do dono (2026-10-19): a consulta de placa deixa de ser só o produto
-- "Veículos Total" da APIBrasil (R$ 30) e passa a ter NÍVEIS, montados com
-- produtos avulsos da APIBrasil:
--
--   basico ......... estadual + recall + fipe
--   intermediario .. basico + check-list
--   economico ...... intermediario + historico-proprietarios
--   completo ....... veiculos-total (o pacote de antes, sozinho)
--
-- e um "aprofundar": quem consultou o básico e quer o intermediário paga só
-- o check-list — os três produtos já comprados vêm da consulta anterior da
-- mesma placa (`aproveitou_de`), sem chamar o fornecedor de novo.
--
-- ---------------------------------------------------------------------------
-- O que muda em `public.consultas_de_placa` (20261006180000)
-- ---------------------------------------------------------------------------
-- Colunas novas:
--   * `nivel` — basico, intermediario, economico ou completo. As linhas que já
--     existem são todas do "Veículos Total": recebem 'completo'. Depois, not null.
--   * `produtos` (text[]) — os produtos da APIBrasil cujo RESULTADO a linha
--     contém, comprados agora ou reaproveitados. Nunca vazio; sempre dentro do
--     nível. As antigas: {veiculos-total}. Produto que falhou não entra (a
--     tentativa dele fica em `tentativas`) — por isso uma consulta em que
--     NADA veio não vira linha: sem produto, não há o que reabrir.
--   * `fragmentos` (jsonb, objeto) — produto → a leitura JÁ SANITIZADA daquele
--     produto (lista positiva, como o retrato). É o que o aprofundar copia sem
--     pagar. NUNCA a resposta crua: a tranca de dado pessoal vale aqui também.
--   * `tentativas` (jsonb, lista) — o que aconteceu com cada produto do nível:
--     {produto, ok, status, motivo, pode_ter_cobrado, custo, reaproveitado},
--     na régua de consultas_de_documento.tentativas mais `reaproveitado`. As
--     antigas recebem uma tentativa de veiculos-total, ok, cobrada (fora da
--     homologação), com o custo da linha.
--   * `aproveitou_de` (uuid) — a consulta de onde vieram os produtos
--     reaproveitados. A FK é COMPOSTA — (org_id, placa, homologacao,
--     aproveitou_de) → (org_id, placa, homologacao, id) — para que o banco
--     recuse reaproveitar dado de OUTRA placa, de OUTRA loja, ou o exemplo da
--     homologação numa consulta de verdade; `on delete set null
--     (aproveitou_de)` (Postgres 15+) zera só a coluna se a origem um dia for
--     apagada, e a linha fica.
--
-- `produto` continua, e passa a dizer COMO a consulta foi comprada:
--   'veiculos-total' — o pacote único (nível completo, as antigas e as novas);
--   'niveis'         — composta de produtos avulsos (basico, intermediario,
--                      economico); quais, diz `produtos`.
-- Decisão: os produtos avulsos NÃO entram em `produto` — numa consulta de três
-- produtos não há um "principal", e a mesma informação em dois lugares acaba
-- divergindo. O vocabulário avulso mora em `produtos`, com regra própria.
-- Coerência: produto = 'veiculos-total' ⇔ nivel = 'completo'.
--
-- O app de hoje (src/lib/consultaDePlaca-servidor.ts) grava só placa,
-- produto, retrato, custo e homologacao. Para ele não quebrar entre esta
-- migração e o deploy do app novo, o gatilho `consultas_de_placa_forma_antiga`
-- completa a linha na forma antiga (nível nulo, produto veiculos-total, sem
-- produtos nem tentativas) exatamente como o backfill. Linha com nível
-- informado não é tocada. Pode sair numa migração futura, quando o app novo
-- estiver no ar.
--
-- O aprofundar, conferido pelo gatilho `consultas_de_placa_reaproveitamento`
-- (BEFORE INSERT, depois do carimbo; recusa com check_violation, o nome do
-- gatilho como constraint e no começo da mensagem):
--   * tentativa reaproveitada exige `aproveitou_de`;
--   * a origem não é mais nova que a linha e tem no máximo
--     `dias_para_aprofundar` dias (parâmetro vigente da loja, em horas × 24);
--   * cada produto reaproveitado está nos `produtos` da origem, e o fragmento
--     dele é IGUAL ao da origem — reaproveitar é copiar, não reler.
-- Origem de outra placa, loja ou homologação: o gatilho deixa passar e a FK
-- recusa (uma regra por coisa).
--
-- A janela contra repetição (`minutos_contra_repeticao`) NÃO é conferida no
-- banco: quando a linha chega aqui o fornecedor já foi chamado e pode ter
-- cobrado — recusar perderia o registro de uma consulta paga. O servidor a
-- confere ANTES de chamar (o mesmo raciocínio de consultas_de_documento).
--
-- Dado pessoal: `consultas_de_placa_sem_dado_pessoal` passa a olhar retrato,
-- fragmentos e tentativas, e ganha as chaves dos produtos avulsos: nome_razao,
-- nome_financiado, cpf_cnpj_financiado, numero_identificacao_do_faturado,
-- codigo_seguranca_crv, nome e documento. 'nome' e 'documento' foram
-- conferidos contra RetratoDaConsulta (src/lib/consultaDePlaca.ts): o retrato
-- não tem chave exatamente "nome" nem "documento" (tem `descricao`,
-- `razaoSocial`, `nomeFantasia`, `documentoFinanciado` — a regex casa a
-- chave INTEIRA, entre aspas), então não colidem. Atenção para o leitor dos
-- fragmentos que vier: ele não pode usar essas chaves (nem em maiúscula — a
-- regex não distingue caixa).
--
-- Continua só inclusão para `authenticated` (SELECT e INSERT; nenhuma policy
-- de UPDATE/DELETE). A service_role tem hoje UPDATE, DELETE e TRUNCATE nesta
-- tabela (grant de 20261006180000) — esta migração NÃO muda isso; fica
-- registrado para uma migração própria.
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- `public.parametros_consulta_veiculo` — no padrão de parametros_consulta_documento:
-- preços de referência por produto (com data e fonte da tabela), a idade
-- máxima de uma consulta para ser aprofundada e a janela contra repetição.
-- Vigência; uma vigente por org; valor vigente não sofre UPDATE (D-T1.7);
-- leem Administrador, Gestor e Comercial (a linha "Consultar placa de veículo
-- (consulta paga)"); escreve só o Administrador, por
-- `consulta_veiculo_nova_vigencia(...)`.
--
-- ---------------------------------------------------------------------------
-- As regras
-- ---------------------------------------------------------------------------
--   consultas_de_placa_produto_conhecido ......... 'veiculos-total' ou 'niveis'
--   consultas_de_placa_nivel_valido .............. basico, intermediario,
--                                                  economico, completo
--   consultas_de_placa_produto_coerente_com_nivel  veiculos-total ⇔ completo
--   consultas_de_placa_produtos_conhecidos ....... lista de 1 dimensão, não vazia,
--                                                  sem nulo, sem repetido, cada um
--                                                  dos seis produtos conhecidos
--   consultas_de_placa_produtos_do_nivel ......... produtos ⊆ produtos do nível
--   consultas_de_placa_fragmentos_validos ........ objeto; cada chave um dos
--                                                  `produtos`; cada valor um objeto
--   consultas_de_placa_tentativas_validas ........ lista; cada item {produto do
--                                                  nível, ok, pode_ter_cobrado e
--                                                  reaproveitado booleanos, status
--                                                  nulo/número, motivo nulo/texto,
--                                                  custo nulo/>= 0}; reaproveitada
--                                                  = ok, não cobrada, sem status,
--                                                  custo nulo ou 0
--   consultas_de_placa_tentativas_coerentes ...... produtos = os produtos com
--                                                  tentativa ok, e ao menos uma
--                                                  tentativa chamou o fornecedor
--   consultas_de_placa_aproveitou_coerente ....... aproveitou_de nulo, ou outra
--                                                  linha e com tentativa reaproveitada
--   consultas_de_placa_sem_dado_pessoal .......... (redefinida) retrato, fragmentos
--                                                  e tentativas sem as chaves pessoais
--   consultas_de_placa_chave_do_aproveitamento ... UNIQUE (org_id, placa, homologacao, id)
--   consultas_de_placa_aproveitou_da_mesma_placa . FK composta, on delete set null
--   consultas_de_placa_reaproveitamento .......... gatilho: prazo, produto e fragmento
--
--   parametros_consulta_veiculo_dias_para_aprofundar_na_faixa ... 1 a 90
--   parametros_consulta_veiculo_minutos_contra_repeticao_na_faixa 0 a 1440
--   parametros_consulta_veiculo_precos_validos ... objeto com exatamente os seis
--                                                  produtos, cada valor número >= 0
--   parametros_consulta_veiculo_fonte_preenchida . 1 a 200 caracteres aparada
--   parametros_consulta_veiculo_vigencia_em_ordem  vigencia_ate >= vigencia_desde
--   parametros_consulta_veiculo_um_vigente ....... índice único: uma vigente por org
--
-- Por que as regras se excluem: o Postgres testa os CHECKs em ordem
-- alfabética e para no primeiro. Cada régua devolve true para o que é
-- assunto de outra (lista malformada passa em `tentativas_coerentes`, nível
-- desconhecido passa em `produtos_do_nivel`), para o erro apontar UMA causa.
--
-- ⚠️ DESFAZER (destrutivo para as colunas novas; nada mais depende delas):
--
--   begin;
--   drop function if exists public.consulta_veiculo_nova_vigencia(integer, integer, jsonb, date, text, text);
--   drop table    if exists public.parametros_consulta_veiculo;
--   drop trigger  if exists consultas_de_placa_forma_antiga     on public.consultas_de_placa;
--   drop trigger  if exists consultas_de_placa_reaproveitamento on public.consultas_de_placa;
--   drop function if exists public.consultas_de_placa_completar_forma_antiga();
--   drop function if exists public.consultas_de_placa_conferir_reaproveitamento();
--   alter table public.consultas_de_placa
--     drop constraint if exists consultas_de_placa_aproveitou_da_mesma_placa,
--     drop constraint if exists consultas_de_placa_chave_do_aproveitamento,
--     drop constraint if exists consultas_de_placa_produto_conhecido,
--     drop constraint if exists consultas_de_placa_sem_dado_pessoal,
--     drop column if exists aproveitou_de, drop column if exists tentativas,
--     drop column if exists fragmentos, drop column if exists produtos,
--     drop column if exists nivel;
--   -- só depois de garantir que não há linha com produto = 'niveis':
--   alter table public.consultas_de_placa
--     add constraint consultas_de_placa_produto_conhecido check (produto in ('veiculos-total')),
--     add constraint consultas_de_placa_sem_dado_pessoal check (retrato::text !~* '"(proprietario|pronome|pronomeAnterior|cpfCnpj|cpf|documentoFinanciado|restricaoArrendatario|restricaoDocArrendatario|email|cellphone)"\s*:');
--   drop function if exists public.consulta_placa_tentativas_coerentes(text[], jsonb, text);
--   drop function if exists public.consulta_placa_tentativas_validas(jsonb, text);
--   drop function if exists public.consulta_placa_fragmentos_validos(jsonb, text[]);
--   drop function if exists public.consulta_placa_produtos_validos(text[]);
--   drop function if exists public.consulta_placa_produtos_do_nivel(text);
--   drop function if exists public.consulta_veiculo_precos_validos(jsonb);
--   drop function if exists public.consulta_placa_produtos_conhecidos();
--   delete from supabase_migrations.schema_migrations where version = '20261019120000';
--   commit;
--
-- Aditiva: colunas novas com backfill, CHECKs trocados por versões que
-- aceitam tudo o que a anterior aceitava (produto 'veiculos-total' segue
-- valendo; a tranca de dado pessoal só AUMENTA — e a conferência prévia
-- recusa o arquivo inteiro se uma linha existente cair nela), dois gatilhos
-- novos, uma tabela nova. Nenhuma policy nem privilégio de consultas_de_placa
-- muda; `estoque_motors` não é tocada. Idempotente: `add column if not
-- exists`, backfill só onde `nivel` é nulo, `drop constraint if exists` +
-- `add` para os CHECKs, `create or replace` para funções, `drop trigger if
-- exists` + `create`, FK e UNIQUE só se faltarem, semente só se a org não
-- tiver linha.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
declare
  v_n bigint;
begin
  if to_regprocedure('public.tem_papel(uuid, text)') is null
     or to_regprocedure('public.autor_atual()') is null
     or to_regprocedure('public.org_padrao()') is null
     or to_regprocedure('public.nucleo_so_encerra_vigencia()') is null
     or to_regprocedure('public.consultas_de_placa_carimbar()') is null
     or to_regclass('public.consultas_de_placa') is null
     or to_regclass('public.orgs') is null then
    raise exception
      'DEPENDÊNCIA: falta tem_papel(uuid, text), autor_atual(), org_padrao(), '
      'nucleo_so_encerra_vigencia(), consultas_de_placa_carimbar(), public.orgs ou '
      'public.consultas_de_placa (20261006180000). Nada foi aplicado.';
  end if;
  if public.org_padrao() is null then
    raise exception 'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;
  -- `on delete set null (coluna)` é do Postgres 15.
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'DEPENDÊNCIA: Postgres % — a FK com "on delete set null (aproveitou_de)" pede 15 ou mais. Nada foi aplicado.',
      current_setting('server_version');
  end if;
  -- A tranca de dado pessoal fica mais larga: se uma linha que já existe cair
  -- nela, o `add constraint` falharia no meio. Melhor parar aqui, dizendo por quê.
  select count(*) into v_n
    from public.consultas_de_placa
   where retrato::text ~* '"(proprietario|pronome|pronomeAnterior|cpfCnpj|cpf|documentoFinanciado|restricaoArrendatario|restricaoDocArrendatario|email|cellphone|nome_razao|nome_financiado|cpf_cnpj_financiado|numero_identificacao_do_faturado|codigo_seguranca_crv|nome|documento)"\s*:';
  if v_n > 0 then
    raise exception 'DADO PESSOAL: % consulta(s) de placa já gravada(s) têm no retrato uma chave que a tranca nova recusa '
                    '(nome, documento, nome_razao…). Nada foi aplicado — limpe o retrato antes.', v_n;
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. O vocabulário e as réguas
-- ----------------------------------------------------------------------------
-- Em função porque CHECK não aceita subconsulta. IMMUTABLE, só sobre os
-- argumentos, `search_path` vazio, e nunca devolvem NULL onde viram CHECK
-- (CHECK com NULL passa). O `case` protege a ordem: `jsonb_array_elements`
-- em não-lista e `::numeric` em não-número levantariam erro em vez de
-- recusar pela regra.
create or replace function public.consulta_placa_produtos_conhecidos()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select '{veiculos-total,estadual,recall,fipe,check-list,historico-proprietarios}'::text[]
$fn$;

comment on function public.consulta_placa_produtos_conhecidos() is
  'Os seis produtos da APIBrasil que a consulta de placa compra, pelo `tipo` dela. '
  'A régua de consultas_de_placa.produtos e de parametros_consulta_veiculo.precos_de_referencia. IMMUTABLE.';

create or replace function public.consulta_placa_produtos_do_nivel(p_nivel text)
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select case p_nivel
           when 'basico'        then '{estadual,recall,fipe}'::text[]
           when 'intermediario' then '{estadual,recall,fipe,check-list}'::text[]
           when 'economico'     then '{estadual,recall,fipe,check-list,historico-proprietarios}'::text[]
           when 'completo'      then '{veiculos-total}'::text[]
         end
$fn$;

comment on function public.consulta_placa_produtos_do_nivel(text) is
  'Os produtos de cada nível da consulta de placa (pedido do dono, 2026-10-19): basico = estadual, '
  'recall, fipe; intermediario = + check-list; economico = + historico-proprietarios; completo = '
  'veiculos-total. Nível desconhecido devolve NULL (quem responde por ele é consultas_de_placa_nivel_valido). IMMUTABLE.';

-- `array_position(…, null)` acha nulo; a contagem distinta acha repetido.
create or replace function public.consulta_placa_produtos_validos(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(
        p is not null
    and pg_catalog.array_ndims(p) = 1
    and pg_catalog.cardinality(p) >= 1
    and pg_catalog.array_position(p, null) is null
    and p <@ public.consulta_placa_produtos_conhecidos()
    and (select count(distinct x) from pg_catalog.unnest(p) as u(x)) = pg_catalog.cardinality(p),
    false)
$fn$;

comment on function public.consulta_placa_produtos_validos(text[]) is
  'Régua de consultas_de_placa.produtos (CHECK consultas_de_placa_produtos_conhecidos): lista de 1 '
  'dimensão, não vazia, sem nulo, sem repetido, cada item um dos seis produtos conhecidos. IMMUTABLE.';

create or replace function public.consulta_placa_fragmentos_validos(p jsonb, p_produtos text[])
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(
    case when pg_catalog.jsonb_typeof(p) = 'object' then
      not exists (
        select 1
          from pg_catalog.jsonb_each(p) as e(produto, leitura)
         where not (e.produto = any (coalesce(p_produtos, '{}'::text[])))
            or pg_catalog.jsonb_typeof(e.leitura) <> 'object')
    else false end,
    false)
$fn$;

comment on function public.consulta_placa_fragmentos_validos(jsonb, text[]) is
  'Régua de consultas_de_placa.fragmentos (CHECK consultas_de_placa_fragmentos_validos): objeto; '
  'cada chave é um dos produtos da linha; cada valor é a leitura sanitizada (objeto). IMMUTABLE.';

create or replace function public.consulta_placa_tentativas_validas(p jsonb, p_nivel text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(
    case when pg_catalog.jsonb_typeof(p) = 'array' then
      not exists (
        select 1
          from pg_catalog.jsonb_array_elements(p) as t(item)
         where case
                 when pg_catalog.jsonb_typeof(t.item) <> 'object' then true
                 else
                      pg_catalog.jsonb_typeof(t.item -> 'produto') is distinct from 'string'
                   -- Nível desconhecido: só o vocabulário (o nível responde por nivel_valido).
                   or not ((t.item ->> 'produto') = any (coalesce(public.consulta_placa_produtos_do_nivel(p_nivel),
                                                                  public.consulta_placa_produtos_conhecidos())))
                   or pg_catalog.jsonb_typeof(t.item -> 'ok') is distinct from 'boolean'
                   or pg_catalog.jsonb_typeof(t.item -> 'pode_ter_cobrado') is distinct from 'boolean'
                   or pg_catalog.jsonb_typeof(t.item -> 'reaproveitado') is distinct from 'boolean'
                   or coalesce(pg_catalog.jsonb_typeof(t.item -> 'status'), 'null') not in ('null', 'number')
                   or coalesce(pg_catalog.jsonb_typeof(t.item -> 'motivo'), 'null') not in ('null', 'string')
                   or case coalesce(pg_catalog.jsonb_typeof(t.item -> 'custo'), 'null')
                        when 'null'   then false
                        when 'number' then (t.item -> 'custo')::numeric < 0
                        else true
                      end
                   -- Reaproveitada não chamou ninguém: veio certa, não cobrou, sem HTTP.
                   or case when t.item -> 'reaproveitado' = 'true'::jsonb then
                             t.item -> 'ok' is distinct from 'true'::jsonb
                          or t.item -> 'pode_ter_cobrado' is distinct from 'false'::jsonb
                          or coalesce(pg_catalog.jsonb_typeof(t.item -> 'status'), 'null') <> 'null'
                          or case coalesce(pg_catalog.jsonb_typeof(t.item -> 'custo'), 'null')
                               when 'number' then (t.item -> 'custo')::numeric <> 0
                               else false
                             end
                      else false end
               end)
    else false end,
    false)
$fn$;

comment on function public.consulta_placa_tentativas_validas(jsonb, text) is
  'Régua de consultas_de_placa.tentativas (CHECK consultas_de_placa_tentativas_validas): lista; cada '
  'item um objeto {produto, ok, status, motivo, pode_ter_cobrado, custo, reaproveitado} com produto '
  'do nível, ok/pode_ter_cobrado/reaproveitado booleanos, status nulo ou número, motivo nulo ou '
  'texto, custo nulo ou >= 0; a reaproveitada é ok, não cobrada, sem status e de custo nulo ou 0. IMMUTABLE.';

create or replace function public.consulta_placa_tentativas_coerentes(p_produtos text[], p jsonb, p_nivel text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  -- Lista ou produtos malformados respondem pela régua deles: aqui passam.
  select coalesce(
    case
      when not public.consulta_placa_tentativas_validas(p, p_nivel)
        or not public.consulta_placa_produtos_validos(p_produtos) then true
      else
            (select pg_catalog.array_agg(x order by x) from pg_catalog.unnest(p_produtos) as u(x))
              is not distinct from
            (select pg_catalog.array_agg(distinct t.i ->> 'produto' order by t.i ->> 'produto')
               from pg_catalog.jsonb_array_elements(p) as t(i)
              where t.i -> 'ok' = 'true'::jsonb)
        and exists (select 1 from pg_catalog.jsonb_array_elements(p) as t(i)
                     where t.i -> 'reaproveitado' = 'false'::jsonb)
    end,
    false)
$fn$;

comment on function public.consulta_placa_tentativas_coerentes(text[], jsonb, text) is
  'Régua de consultas_de_placa (CHECK consultas_de_placa_tentativas_coerentes): os produtos da linha '
  'são exatamente os que têm tentativa ok (comprada agora ou reaproveitada), e ao menos uma tentativa '
  'chamou o fornecedor (reaproveitado false) — aprofundar sem comprar nada é reabrir, não consultar. IMMUTABLE.';


-- ----------------------------------------------------------------------------
-- 2. As colunas novas, e o backfill das consultas que já existem
-- ----------------------------------------------------------------------------
alter table public.consultas_de_placa
  add column if not exists nivel         text,
  add column if not exists produtos      text[] not null default '{}'::text[],
  add column if not exists fragmentos    jsonb  not null default '{}'::jsonb,
  add column if not exists tentativas    jsonb  not null default '[]'::jsonb,
  add column if not exists aproveitou_de uuid;

-- Toda linha de antes é do "Veículos Total" (o CHECK de 20261006180000 só
-- aceitava esse produto): nível completo, o produto, e a tentativa que deu
-- certo — cobrada, fora da homologação, pelo custo que o fornecedor informou.
-- Só onde `nivel` é nulo: reaplicar não toca linha nova.
update public.consultas_de_placa
   set nivel      = 'completo',
       produtos   = '{veiculos-total}'::text[],
       tentativas = jsonb_build_array(jsonb_build_object(
                      'produto', 'veiculos-total', 'ok', true, 'status', null, 'motivo', null,
                      'pode_ter_cobrado', not homologacao, 'custo', custo, 'reaproveitado', false))
 where nivel is null
   and produto = 'veiculos-total';

alter table public.consultas_de_placa alter column nivel set not null;


-- ----------------------------------------------------------------------------
-- 3. As regras
-- ----------------------------------------------------------------------------
alter table public.consultas_de_placa
  drop constraint if exists consultas_de_placa_produto_conhecido,
  drop constraint if exists consultas_de_placa_nivel_valido,
  drop constraint if exists consultas_de_placa_produto_coerente_com_nivel,
  drop constraint if exists consultas_de_placa_produtos_conhecidos,
  drop constraint if exists consultas_de_placa_produtos_do_nivel,
  drop constraint if exists consultas_de_placa_fragmentos_validos,
  drop constraint if exists consultas_de_placa_tentativas_validas,
  drop constraint if exists consultas_de_placa_tentativas_coerentes,
  drop constraint if exists consultas_de_placa_aproveitou_coerente,
  drop constraint if exists consultas_de_placa_sem_dado_pessoal;

alter table public.consultas_de_placa
  -- 'veiculos-total': o pacote único. 'niveis': composta de produtos avulsos,
  -- listados em `produtos`.
  add constraint consultas_de_placa_produto_conhecido
    check (produto in ('veiculos-total', 'niveis')),
  add constraint consultas_de_placa_nivel_valido
    check (nivel in ('basico', 'intermediario', 'economico', 'completo')),
  -- Produto ou nível desconhecido dão false = false aqui: quem responde é a
  -- regra deles.
  add constraint consultas_de_placa_produto_coerente_com_nivel
    check ((produto = 'veiculos-total') = (nivel = 'completo')),
  add constraint consultas_de_placa_produtos_conhecidos
    check (public.consulta_placa_produtos_validos(produtos)),
  add constraint consultas_de_placa_produtos_do_nivel
    check (coalesce(produtos <@ public.consulta_placa_produtos_do_nivel(nivel), true)),
  add constraint consultas_de_placa_fragmentos_validos
    check (public.consulta_placa_fragmentos_validos(fragmentos, produtos)),
  add constraint consultas_de_placa_tentativas_validas
    check (public.consulta_placa_tentativas_validas(tentativas, nivel)),
  add constraint consultas_de_placa_tentativas_coerentes
    check (public.consulta_placa_tentativas_coerentes(produtos, tentativas, nivel)),
  -- Só num sentido: se a origem for apagada, `aproveitou_de` vira nulo e as
  -- tentativas continuam dizendo "reaproveitada" — é história, não mentira.
  -- O outro sentido (reaproveitada exige origem) é conferido NA INCLUSÃO,
  -- pelo gatilho da seção 4.
  add constraint consultas_de_placa_aproveitou_coerente
    check (aproveitou_de is null
           or (aproveitou_de <> id
               and jsonb_path_exists(tentativas, '$[*] ? (@.reaproveitado == true)'))),
  -- A tranca de 20261006180000, mais larga: os três jsonb, e as chaves dos
  -- produtos avulsos (dono do estadual, financiado do gravame, faturado de
  -- pessoa física, código de segurança do CRV, e os genéricos nome e documento).
  add constraint consultas_de_placa_sem_dado_pessoal
    check ((retrato::text || ' ' || fragmentos::text || ' ' || tentativas::text)
           !~* '"(proprietario|pronome|pronomeAnterior|cpfCnpj|cpf|documentoFinanciado|restricaoArrendatario|restricaoDocArrendatario|email|cellphone|nome_razao|nome_financiado|cpf_cnpj_financiado|numero_identificacao_do_faturado|codigo_seguranca_crv|nome|documento)"\s*:');

-- A FK composta: só se reaproveita da MESMA placa, da MESMA loja, e do mesmo
-- lado da homologação (o retrato da homologação é o exemplo do fornecedor,
-- de outra placa). A UNIQUE é o que a FK aponta; `id` já é único, então ela
-- não recusa nada por si.
do $fk$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.consultas_de_placa'::regclass
                    and conname = 'consultas_de_placa_chave_do_aproveitamento') then
    alter table public.consultas_de_placa
      add constraint consultas_de_placa_chave_do_aproveitamento
        unique (org_id, placa, homologacao, id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.consultas_de_placa'::regclass
                    and conname = 'consultas_de_placa_aproveitou_da_mesma_placa') then
    alter table public.consultas_de_placa
      add constraint consultas_de_placa_aproveitou_da_mesma_placa
        foreign key (org_id, placa, homologacao, aproveitou_de)
        references public.consultas_de_placa (org_id, placa, homologacao, id)
        on delete set null (aproveitou_de);
  end if;
end $fk$;

-- O índice da FK (o set null procura os filhos pela origem).
create index if not exists consultas_de_placa_aproveitou_de_idx
  on public.consultas_de_placa (aproveitou_de)
  where aproveitou_de is not null;

comment on table public.consultas_de_placa is
  'Consultas de placa feitas à APIBrasil para avaliar carro oferecido à loja '
  '(2026-10-06), em NÍVEIS desde 2026-10-19: basico, intermediario e economico '
  '(produtos avulsos, produto = ''niveis'') e completo (veiculos-total). Uma linha '
  'por consulta PAGA; a mais recente de cada placa é a que o painel abre. O '
  '"aprofundar" reaproveita os produtos de uma consulta anterior da mesma placa '
  '(aproveitou_de) e paga só os que faltam. Só inclusão para a sessão. Lê e '
  'inclui quem a matriz deixa (Administrador, Gestor, Comercial). Ver '
  '20261006180000_consultas_de_placa.sql e 20261019120000_niveis_da_consulta_de_placa.sql.';
comment on column public.consultas_de_placa.produto is
  'Como a consulta foi comprada: ''veiculos-total'' (o pacote único, nível completo) '
  'ou ''niveis'' (produtos avulsos, listados em `produtos`). veiculos-total ⇔ completo.';
comment on column public.consultas_de_placa.nivel is
  'O nível pedido: basico (estadual, recall, fipe), intermediario (+ check-list), '
  'economico (+ historico-proprietarios) ou completo (veiculos-total). As linhas '
  'anteriores a 2026-10-19 são completo.';
comment on column public.consultas_de_placa.produtos is
  'Os produtos da APIBrasil cujo resultado a linha contém — comprados agora ou '
  'reaproveitados —, pelo `tipo` dela. Nunca vazio; sempre dentro do nível; '
  'exatamente os que têm tentativa ok. Produto que falhou não entra.';
comment on column public.consultas_de_placa.fragmentos is
  'Objeto produto → leitura JÁ SANITIZADA daquele produto (lista positiva, como o '
  'retrato), para o aprofundar reaproveitar sem pagar. NUNCA a resposta crua: '
  'consultas_de_placa_sem_dado_pessoal recusa as chaves pessoais aqui também.';
comment on column public.consultas_de_placa.tentativas is
  'O que aconteceu com cada produto do nível, em lista: [{produto, ok, status, '
  'motivo, pode_ter_cobrado, custo, reaproveitado}]. reaproveitado = veio de '
  'aproveitou_de, sem chamar o fornecedor (ok, não cobrado, sem status, custo nulo ou 0).';
comment on column public.consultas_de_placa.aproveitou_de is
  'A consulta da mesma placa, loja e lado da homologação de onde vieram os '
  'produtos reaproveitados (FK composta consultas_de_placa_aproveitou_da_mesma_placa). '
  'Vira nulo se a origem for apagada; a linha fica.';


-- ----------------------------------------------------------------------------
-- 4. Os gatilhos: a forma antiga, e o reaproveitamento
-- ----------------------------------------------------------------------------
-- Os gatilhos BEFORE INSERT disparam em ordem alfabética: carimbo (org, autor,
-- hora da sessão), forma_antiga, reaproveitamento — este por último, com a
-- hora e a org já carimbadas.

-- O app de hoje grava sem nível. Até o app novo ir ao ar, a linha na forma
-- antiga (nível nulo, veiculos-total, sem produtos e sem tentativas) é
-- completada como o backfill da seção 2. Qualquer outra forma passa intacta
-- e cai nas regras.
create or replace function public.consultas_de_placa_completar_forma_antiga()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.nivel is null
     and new.produto = 'veiculos-total'
     and coalesce(pg_catalog.cardinality(new.produtos), 0) = 0
     and coalesce(new.tentativas, '[]'::jsonb) = '[]'::jsonb then
    new.nivel      := 'completo';
    new.produtos   := '{veiculos-total}'::text[];
    new.tentativas := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
                        'produto', 'veiculos-total', 'ok', true, 'status', null, 'motivo', null,
                        'pode_ter_cobrado', not coalesce(new.homologacao, false),
                        'custo', new.custo, 'reaproveitado', false));
  end if;
  return new;
end;
$$;

comment on function public.consultas_de_placa_completar_forma_antiga() is
  'Gatilho BEFORE INSERT de consultas_de_placa: a linha na forma de antes de 2026-10-19 '
  '(nível nulo, produto veiculos-total, sem produtos nem tentativas) sai completo, '
  '{veiculos-total} e uma tentativa ok — como o backfill. Compatibilidade com o app '
  'que ainda não grava nível; pode sair quando o app novo estiver no ar.';

drop trigger if exists consultas_de_placa_forma_antiga on public.consultas_de_placa;
create trigger consultas_de_placa_forma_antiga
  before insert on public.consultas_de_placa
  for each row execute function public.consultas_de_placa_completar_forma_antiga();

revoke all on function public.consultas_de_placa_completar_forma_antiga() from public, anon, authenticated;

-- SECURITY INVOKER de propósito: lê a origem e o parâmetro com a RLS de quem
-- inclui. Origem que ele não enxerga (outra loja) não é achada, o gatilho
-- deixa passar e a FK recusa. Origem de outra placa, loja ou homologação,
-- idem: é assunto da FK, para o erro dizer a causa certa.
create or replace function public.consultas_de_placa_conferir_reaproveitamento()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_reaproveitados text[];
  v_origem         public.consultas_de_placa;
  v_dias           smallint;
  v_produto        text;
begin
  select coalesce(pg_catalog.array_agg(t.i ->> 'produto'), '{}'::text[])
    into v_reaproveitados
    from pg_catalog.jsonb_array_elements(
           case when pg_catalog.jsonb_typeof(new.tentativas) = 'array' then new.tentativas else '[]'::jsonb end) as t(i)
   where t.i -> 'reaproveitado' = 'true'::jsonb;

  if new.aproveitou_de is null then
    if pg_catalog.cardinality(v_reaproveitados) > 0 then
      raise exception 'consultas_de_placa_reaproveitamento: Tentativa reaproveitada sem a consulta de origem (aproveitou_de).'
        using errcode = 'check_violation', constraint = 'consultas_de_placa_reaproveitamento';
    end if;
    return new;
  end if;

  select c.* into v_origem from public.consultas_de_placa c where c.id = new.aproveitou_de;
  if not found
     or v_origem.org_id is distinct from new.org_id
     or v_origem.placa is distinct from new.placa
     or v_origem.homologacao is distinct from new.homologacao then
    return new;   -- a FK consultas_de_placa_aproveitou_da_mesma_placa responde
  end if;

  select p.dias_para_aprofundar into v_dias
    from public.parametros_consulta_veiculo p
   where p.org_id = new.org_id and p.vigencia_ate is null;
  if v_dias is null then
    raise exception 'consultas_de_placa_reaproveitamento: Aprofundar sem parâmetro vigente (parametros_consulta_veiculo.dias_para_aprofundar) para a loja.'
      using errcode = 'check_violation', constraint = 'consultas_de_placa_reaproveitamento';
  end if;

  -- Horas, e não dias: somar dias a timestamptz depende do fuso da sessão.
  if v_origem.criado_em > new.criado_em
     or v_origem.criado_em < new.criado_em - pg_catalog.make_interval(hours => v_dias * 24) then
    raise exception 'consultas_de_placa_reaproveitamento: A consulta de origem tem mais de % dia(s) (ou é posterior): consulte de novo, sem aprofundar.', v_dias
      using errcode = 'check_violation', constraint = 'consultas_de_placa_reaproveitamento';
  end if;

  foreach v_produto in array v_reaproveitados loop
    if not (v_produto = any (v_origem.produtos))
       or (v_origem.fragmentos -> v_produto) is null
       or (new.fragmentos -> v_produto) is distinct from (v_origem.fragmentos -> v_produto) then
      raise exception 'consultas_de_placa_reaproveitamento: Produto % reaproveitado sem estar na consulta de origem, ou com fragmento diferente do dela.', v_produto
        using errcode = 'check_violation', constraint = 'consultas_de_placa_reaproveitamento';
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.consultas_de_placa_conferir_reaproveitamento() is
  'Gatilho BEFORE INSERT de consultas_de_placa (consultas_de_placa_reaproveitamento): tentativa '
  'reaproveitada exige aproveitou_de; a origem não é posterior e tem no máximo '
  'parametros_consulta_veiculo.dias_para_aprofundar dias; cada produto reaproveitado está na '
  'origem e com o MESMO fragmento. Recusa com check_violation. Outra placa/loja/homologação: a FK responde.';

drop trigger if exists consultas_de_placa_reaproveitamento on public.consultas_de_placa;
create trigger consultas_de_placa_reaproveitamento
  before insert on public.consultas_de_placa
  for each row execute function public.consultas_de_placa_conferir_reaproveitamento();

revoke all on function public.consultas_de_placa_conferir_reaproveitamento() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. Os parâmetros da consulta de veículo
-- ----------------------------------------------------------------------------
-- No padrão de parametros_consulta_documento (20261018120000).
--   * precos_de_referencia: o preço de tabela de cada um dos seis produtos, em
--     reais, para a tela estimar o nível e o aprofundar ANTES de pagar. Os
--     seis, sempre: produto sem preço deixaria a estimativa pela metade. É
--     REFERÊNCIA — o cobrado vai em consultas_de_placa.custo e nas tentativas.
--   * tabela_de_precos_em e fonte: de quando e de onde os preços saíram.
--   * dias_para_aprofundar: a idade máxima (1 a 90 dias) de uma consulta cujos
--     produtos podem ser reaproveitados. Conferida pelo gatilho da seção 4.
--   * minutos_contra_repeticao: a mesma placa e nível não é paga de novo
--     dentro desta janela (0 desliga; até 1440). Conferida pelo servidor
--     ANTES de chamar o fornecedor.
create or replace function public.consulta_veiculo_precos_validos(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(
    case when pg_catalog.jsonb_typeof(p) = 'object' then
          (select pg_catalog.array_agg(k order by k) from pg_catalog.jsonb_object_keys(p) as o(k))
            = (select pg_catalog.array_agg(x order by x)
                 from pg_catalog.unnest(public.consulta_placa_produtos_conhecidos()) as u(x))
      and not exists (
            select 1
              from pg_catalog.jsonb_each(p) as e(produto, preco)
             where case pg_catalog.jsonb_typeof(e.preco)
                     when 'number' then (e.preco)::numeric < 0
                     else true
                   end)
    else false end,
    false)
$fn$;

comment on function public.consulta_veiculo_precos_validos(jsonb) is
  'Régua de parametros_consulta_veiculo.precos_de_referencia (CHECK '
  'parametros_consulta_veiculo_precos_validos): objeto com exatamente os seis produtos '
  'conhecidos da consulta de placa, cada valor um número >= 0. IMMUTABLE.';

create table if not exists public.parametros_consulta_veiculo (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null default public.org_padrao(),
  precos_de_referencia      jsonb not null,
  tabela_de_precos_em       date not null,
  fonte                     text not null,
  dias_para_aprofundar      smallint not null,
  minutos_contra_repeticao  smallint not null,
  descricao                 text,
  criado_por                uuid,
  vigencia_desde            date not null default current_date,
  vigencia_ate              date,
  criado_em                 timestamptz not null default now(),

  constraint parametros_consulta_veiculo_dias_para_aprofundar_na_faixa
    check (dias_para_aprofundar between 1 and 90),
  constraint parametros_consulta_veiculo_minutos_contra_repeticao_na_faixa
    check (minutos_contra_repeticao between 0 and 1440),
  constraint parametros_consulta_veiculo_precos_validos
    check (public.consulta_veiculo_precos_validos(precos_de_referencia)),
  constraint parametros_consulta_veiculo_fonte_preenchida
    check (char_length(btrim(fonte, E' \t\r\n')) between 1 and 200),
  constraint parametros_consulta_veiculo_vigencia_em_ordem
    check (vigencia_ate is null or vigencia_ate >= vigencia_desde)
);

-- D-T1.7: a linha vigente só aceita o encerramento da vigência.
create or replace trigger parametros_consulta_veiculo_vigencia
  before update on public.parametros_consulta_veiculo
  for each row execute function public.nucleo_so_encerra_vigencia();

-- Uma vigente por org: dois prazos de aprofundar ao mesmo tempo, o gatilho escolheria um.
create unique index if not exists parametros_consulta_veiculo_um_vigente
  on public.parametros_consulta_veiculo (org_id)
  where vigencia_ate is null;

alter table public.parametros_consulta_veiculo enable row level security;

drop policy if exists parametros_consulta_veiculo_leitura on public.parametros_consulta_veiculo;
create policy parametros_consulta_veiculo_leitura on public.parametros_consulta_veiculo
  for select to authenticated
  using (
    org_id = public.org_padrao()
    and (public.tem_papel(auth.uid(), 'admin')
         or public.tem_papel(auth.uid(), 'gestor')
         or public.tem_papel(auth.uid(), 'comercial'))
  );

comment on policy parametros_consulta_veiculo_leitura on public.parametros_consulta_veiculo is
  'Lê os parâmetros da consulta de placa quem a matriz deixa consultar ("Consultar placa de veículo '
  '(consulta paga)"): Administrador, Gestor e Comercial, com conta ativa. Nenhuma policy de escrita: '
  'a única escrita é consulta_veiculo_nova_vigencia(), só admin.';

-- O default ACL do Supabase concede tudo a anon/authenticated/service_role
-- por baixo do pano (f0l); o que não se quer, sai por nome.
revoke all on public.parametros_consulta_veiculo from public, anon;
revoke insert, update, delete, truncate on public.parametros_consulta_veiculo from authenticated;
grant select on public.parametros_consulta_veiculo to authenticated, service_role;

create or replace function public.consulta_veiculo_nova_vigencia(
  p_dias_para_aprofundar      integer,
  p_minutos_contra_repeticao  integer,
  p_precos_de_referencia      jsonb,
  p_tabela_de_precos_em       date,
  p_fonte                     text,
  p_descricao                 text default null
)
returns public.parametros_consulta_veiculo
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem     uuid := auth.uid();
  v_vigente  uuid;
  v_nova     public.parametros_consulta_veiculo;
begin
  if v_quem is null then
    raise exception 'Nova vigência dos parâmetros da consulta de placa sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;

  if not public.tem_papel(v_quem, 'admin') then
    raise exception 'Só o Administrador muda os parâmetros da consulta de placa.'
      using errcode = '42501';
  end if;

  -- Trava a vigente: duas edições ao mesmo tempo não abrem duas vigências —
  -- a segunda espera, não acha mais vigente aberta, e o índice único a recusa.
  select id into v_vigente
    from public.parametros_consulta_veiculo
   where org_id = public.org_padrao()
     and vigencia_ate is null
   for update;

  if found then
    update public.parametros_consulta_veiculo
       set vigencia_ate = current_date
     where id = v_vigente;
  end if;

  insert into public.parametros_consulta_veiculo
    (precos_de_referencia, tabela_de_precos_em, fonte, dias_para_aprofundar,
     minutos_contra_repeticao, descricao, criado_por, vigencia_desde)
  values
    (p_precos_de_referencia, p_tabela_de_precos_em, btrim(p_fonte, E' \t\r\n'),
     p_dias_para_aprofundar, p_minutos_contra_repeticao,
     nullif(btrim(p_descricao, E' \t\r\n'), ''), v_quem, current_date)
  returning * into v_nova;

  return v_nova;
end;
$fn$;

revoke all on function public.consulta_veiculo_nova_vigencia(
  integer, integer, jsonb, date, text, text) from public, anon;
grant execute on function public.consulta_veiculo_nova_vigencia(
  integer, integer, jsonb, date, text, text) to authenticated, service_role;

comment on table public.parametros_consulta_veiculo is
  'Os números da consulta de placa como DADO com vigência (2026-10-19): preços de referência '
  'dos seis produtos da APIBrasil (com data e fonte da tabela), a idade máxima de uma consulta '
  'para ser aprofundada e os minutos contra repetição. Uma vigente por org '
  '(parametros_consulta_veiculo_um_vigente); valor vigente não sofre UPDATE (D-T1.7) — a única '
  'escrita é consulta_veiculo_nova_vigencia, só admin. Leem admin, gestor e comercial; anon nada.';
comment on column public.parametros_consulta_veiculo.precos_de_referencia is
  'Preço de tabela de cada um dos seis produtos, em reais ({"estadual": 2.5, …, '
  '"veiculos-total": 30}). Referência para estimar antes de pagar — o cobrado é '
  'consultas_de_placa.custo e o custo de cada tentativa.';
comment on column public.parametros_consulta_veiculo.tabela_de_precos_em is
  'A data da tabela de preços de onde os valores saíram.';
comment on column public.parametros_consulta_veiculo.fonte is
  'De onde os preços saíram (1 a 200 caracteres aparada).';
comment on column public.parametros_consulta_veiculo.dias_para_aprofundar is
  'Idade máxima, em dias (1 a 90), de uma consulta cujos produtos podem ser reaproveitados '
  'pelo aprofundar. Conferida no banco pelo gatilho consultas_de_placa_reaproveitamento.';
comment on column public.parametros_consulta_veiculo.minutos_contra_repeticao is
  'Janela, em minutos, em que a mesma placa e nível não é paga de novo (0 desliga; até 1440). '
  'Conferida pelo servidor ANTES de chamar o fornecedor.';
comment on column public.parametros_consulta_veiculo.descricao is
  'Nota livre de quem abriu a vigência: o que mudou e por quê.';
comment on column public.parametros_consulta_veiculo.criado_por is
  'Quem abriu a vigência: auth.uid() carimbado pela função. Nulo só na semente. Sem FK '
  'de propósito: on delete set null seria UPDATE, que o guarda D-T1.7 recusa.';
comment on function public.consulta_veiculo_nova_vigencia(integer, integer, jsonb, date, text, text) is
  'Única escrita de parametros_consulta_veiculo. Exige sessão (auth.uid()) e papel admin — senão '
  '42501. Trava a vigente, encerra com vigencia_ate = hoje e insere a nova com vigencia_desde = hoje '
  'e criado_por = auth.uid(), na mesma transação. Devolve a linha nova.';

-- A semente — só se a org padrão ainda não tiver linha. Preços da tabela
-- pública da APIBrasil em 2026-10-19.
insert into public.parametros_consulta_veiculo
  (precos_de_referencia, tabela_de_precos_em, fonte, dias_para_aprofundar,
   minutos_contra_repeticao, descricao)
select
  '{"estadual": 2.5, "recall": 0.62, "fipe": 0.06, "check-list": 2.4,
    "historico-proprietarios": 5.0, "veiculos-total": 30.0}'::jsonb,
  date '2026-10-19',
  'Tabela pública da APIBrasil',
  7, 30,
  'Semente de 2026-10-19 (níveis da consulta de placa): aprofundar até 7 dias, 30 minutos '
  'contra repetição, preços da tabela pública da APIBrasil.'
where not exists (select 1 from public.parametros_consulta_veiculo
                   where org_id = public.org_padrao());


-- ============================================================================
-- Autoconferência — a promessa, cobrada do banco
-- ============================================================================
-- Estrutura, privilégio e efeito. O efeito cria usuários de sonda (admin,
-- gestor, comercial, marketing) e uma SEGUNDA loja, veste a sessão de cada um
-- e grava a forma antiga, um básico, o aprofundar para o intermediário, tenta
-- aprofundar fora do prazo, de produto que a origem não tem, com fragmento
-- trocado, de outra placa, de outra loja e da homologação, apaga a origem,
-- mexe nos parâmetros, e viola cada regra — num sub-bloco que termina com um
-- sentinela, e o rollback do sub-bloco leva tudo junto. As variáveis
-- sobrevivem ao rollback, e é por elas que o veredito sai.
do $aceite$
declare
  falhas          int := 0;
  v_nome          text;
  v_uid           uuid;
  v_papel         text;
  v_ids           jsonb := '{}'::jsonb;
  v_outra_org     uuid;
  v_linha         public.consultas_de_placa;
  v_basico        public.consultas_de_placa;
  v_velha         uuid;
  v_alheia        uuid;
  v_homolog       uuid;
  v_outra_placa   uuid;
  v_vig           public.parametros_consulta_veiculo;
  v_nova          public.parametros_consulta_veiculo;
  v_n             bigint;
  v_antes_c       bigint;
  v_antes_p       bigint;
  v_depois_c      bigint;
  v_depois_p      bigint;
  v_restou        bigint;
  v_msg           text;
  v_caso          record;
  v_base          jsonb;
  v_frag          jsonb := '{"estadual": {"uf": "PR"}, "recall": {"pendentes": 0}, "fipe": {"valor": 50000}}'::jsonb;
  v_tent3         jsonb := '[{"produto": "estadual", "ok": true, "status": 200, "motivo": null, "pode_ter_cobrado": true, "custo": 2.5, "reaproveitado": false},
                            {"produto": "recall",   "ok": true, "status": 200, "motivo": null, "pode_ter_cobrado": true, "custo": 0.62, "reaproveitado": false},
                            {"produto": "fipe",     "ok": true, "status": 200, "motivo": null, "pode_ter_cobrado": true, "custo": 0.06, "reaproveitado": false}]'::jsonb;
  v_reap3         jsonb := '[{"produto": "estadual", "ok": true, "pode_ter_cobrado": false, "reaproveitado": true},
                            {"produto": "recall",   "ok": true, "pode_ter_cobrado": false, "reaproveitado": true},
                            {"produto": "fipe",     "ok": true, "pode_ter_cobrado": false, "reaproveitado": true}]'::jsonb;
  v_check         jsonb := '{"produto": "check-list", "ok": true, "status": 200, "pode_ter_cobrado": true, "custo": 2.4, "reaproveitado": false}'::jsonb;
  v_legado        text := 'não testado';
  v_basico_ok     text := 'não testado';
  v_aprofundou    text := 'não testado';
  v_reap_casos    int := 0;
  v_reap_certos   int := 0;
  v_fk_casos      int := 0;
  v_fk_certos     int := 0;
  v_so_reabriu    text := 'não testado';
  v_set_null      text := 'não testado';
  v_cross_le      bigint := -1;
  v_cross_param   bigint := -1;
  v_regras        int := 0;
  v_regras_certas int := 0;
  v_controles     int := 0;
  v_controles_ok  int := 0;
  v_param_leram   int := 0;
  v_param_cego    text := 'não testado';
  v_param_anon    text := 'não testado';
  v_param_recus   int := 0;
  v_param_sem_ses text := 'não testado';
  v_param_direto  text := 'não testado';
  v_param_admin   text := 'não testado';
  v_param_edita   text := 'não testado';
  v_param_casos   int := 0;
  v_param_certos  int := 0;
  v_param_limites int := 0;
  v_param_aceitos int := 0;
  v_precos        jsonb := '{"estadual": 2.5, "recall": 0.62, "fipe": 0.06, "check-list": 2.4,
                             "historico-proprietarios": 5.0, "veiculos-total": 30.0}'::jsonb;
begin
  -- 1 · Estrutura: colunas, tipos e nulidade.
  for v_caso in
    select * from (values
      ('nivel', 'text', true), ('produtos', 'text[]', true), ('fragmentos', 'jsonb', true),
      ('tentativas', 'jsonb', true), ('aproveitou_de', 'uuid', false)
    ) as c(coluna, tipo, obrigatoria)
  loop
    if not exists (select 1 from pg_attribute
                    where attrelid = 'public.consultas_de_placa'::regclass
                      and attname = v_caso.coluna and not attisdropped
                      and format_type(atttypid, atttypmod) = v_caso.tipo
                      and attnotnull = v_caso.obrigatoria) then
      falhas := falhas + 1;
      raise warning 'FALHOU: consultas_de_placa.% ausente, de outro tipo ou nulidade errada (esperado %, not null %)',
        v_caso.coluna, v_caso.tipo, v_caso.obrigatoria;
    end if;
  end loop;

  -- 2 · As regras com nome, CHECK e validadas (as seis de antes seguem).
  foreach v_nome in array array[
    'consultas_de_placa_placa_valida', 'consultas_de_placa_produto_conhecido',
    'consultas_de_placa_custo_valido', 'consultas_de_placa_retrato_e_objeto',
    'consultas_de_placa_retrato_da_placa', 'consultas_de_placa_sem_dado_pessoal',
    'consultas_de_placa_nivel_valido', 'consultas_de_placa_produto_coerente_com_nivel',
    'consultas_de_placa_produtos_conhecidos', 'consultas_de_placa_produtos_do_nivel',
    'consultas_de_placa_fragmentos_validos', 'consultas_de_placa_tentativas_validas',
    'consultas_de_placa_tentativas_coerentes', 'consultas_de_placa_aproveitou_coerente'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.consultas_de_placa'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.consultas_de_placa'::regclass
         and conname = 'consultas_de_placa_sem_dado_pessoal') !~ 'fragmentos.*tentativas.*nome_razao.*codigo_seguranca_crv' then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_placa_sem_dado_pessoal não olha fragmentos e tentativas, ou não tem as chaves novas';
  end if;

  --   A FK composta, set null só de aproveitou_de, e a UNIQUE que ela aponta.
  if not exists (
       select 1 from pg_constraint f
        where f.conrelid = 'public.consultas_de_placa'::regclass
          and f.conname = 'consultas_de_placa_aproveitou_da_mesma_placa'
          and f.contype = 'f' and f.confrelid = 'public.consultas_de_placa'::regclass
          and f.confdeltype = 'n'
          and f.confdelsetcols = array[(select attnum from pg_attribute
                                         where attrelid = 'public.consultas_de_placa'::regclass
                                           and attname = 'aproveitou_de')]::int2[]
          and (select array_agg(a.attname::text order by k.ord)
                 from unnest(f.conkey) with ordinality k(n, ord)
                 join pg_attribute a on a.attrelid = f.conrelid and a.attnum = k.n)
              = array['org_id', 'placa', 'homologacao', 'aproveitou_de'])
     or not exists (select 1 from pg_constraint
                     where conrelid = 'public.consultas_de_placa'::regclass
                       and conname = 'consultas_de_placa_chave_do_aproveitamento' and contype = 'u') then
    falhas := falhas + 1;
    raise warning 'FALHOU: FK consultas_de_placa_aproveitou_da_mesma_placa (org, placa, homologação, aproveitou_de; set null só de aproveitou_de) ou a UNIQUE dela';
  end if;

  --   Os três gatilhos BEFORE INSERT por linha, ligados.
  foreach v_nome in array array['consultas_de_placa_carimbo', 'consultas_de_placa_forma_antiga',
                                'consultas_de_placa_reaproveitamento'] loop
    if not exists (select 1 from pg_trigger
                    where tgrelid = 'public.consultas_de_placa'::regclass and tgname = v_nome
                      and tgtype & 1 = 1 and tgtype & 2 = 2 and tgtype & 4 = 4 and tgenabled <> 'D') then
      falhas := falhas + 1;
      raise warning 'FALHOU: gatilho % não é BEFORE INSERT por linha ligado', v_nome;
    end if;
  end loop;

  --   Backfill: nenhuma linha sem nível; toda veiculos-total é completo.
  select count(*) into v_n from public.consultas_de_placa
   where nivel is null
      or (produto = 'veiculos-total') <> (nivel = 'completo')
      or cardinality(produtos) = 0
      or jsonb_array_length(tentativas) = 0;
  if v_n > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % consulta(s) de placa sem nível, produtos ou tentativas depois do backfill', v_n;
  end if;

  -- 3 · Privilégio da consulta: o de antes, intocado (a sessão lê e inclui, e só).
  if has_table_privilege('anon', 'public.consultas_de_placa', 'SELECT')
     or not has_table_privilege('authenticated', 'public.consultas_de_placa', 'SELECT')
     or not has_table_privilege('authenticated', 'public.consultas_de_placa', 'INSERT')
     or has_table_privilege('authenticated', 'public.consultas_de_placa', 'UPDATE')
     or has_table_privilege('authenticated', 'public.consultas_de_placa', 'DELETE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_placa — anon nada; authenticated SELECT e INSERT, e só';
  end if;
  select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = 'consultas_de_placa';
  if v_n <> 2 then
    falhas := falhas + 1;
    raise warning 'FALHOU: consultas_de_placa deveria seguir com as 2 policies (achei %)', v_n;
  end if;

  --   Os parâmetros: RLS, só a policy de leitura, guarda, índice, privilégio, função.
  if not exists (select 1 from pg_class where oid = 'public.parametros_consulta_veiculo'::regclass and relrowsecurity) then
    raise exception 'ACEITE FALHOU: parametros_consulta_veiculo sem RLS';
  end if;
  if (select string_agg(policyname || ':' || cmd, ',') from pg_policies
       where schemaname = 'public' and tablename = 'parametros_consulta_veiculo')
     is distinct from 'parametros_consulta_veiculo_leitura:SELECT' then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_consulta_veiculo deveria ter só a policy de leitura';
  end if;
  foreach v_nome in array array[
    'parametros_consulta_veiculo_dias_para_aprofundar_na_faixa',
    'parametros_consulta_veiculo_minutos_contra_repeticao_na_faixa',
    'parametros_consulta_veiculo_precos_validos',
    'parametros_consulta_veiculo_fonte_preenchida',
    'parametros_consulta_veiculo_vigencia_em_ordem'
  ] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.parametros_consulta_veiculo'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1;
      raise warning 'FALHOU: regra % ausente', v_nome;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.parametros_consulta_veiculo'::regclass
                    and tgname = 'parametros_consulta_veiculo_vigencia'
                    and tgfoid = 'public.nucleo_so_encerra_vigencia()'::regprocedure) then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_consulta_veiculo sem o guarda D-T1.7';
  end if;
  if not exists (select 1 from pg_index i
                  where i.indexrelid = to_regclass('public.parametros_consulta_veiculo_um_vigente')
                    and i.indisunique
                    and pg_get_expr(i.indpred, i.indrelid) = '(vigencia_ate IS NULL)') then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_consulta_veiculo_um_vigente não é único em (org_id) where vigencia_ate is null';
  end if;
  if has_table_privilege('anon', 'public.parametros_consulta_veiculo', 'SELECT')
     or not has_table_privilege('authenticated', 'public.parametros_consulta_veiculo', 'SELECT')
     or has_table_privilege('authenticated', 'public.parametros_consulta_veiculo', 'INSERT')
     or has_table_privilege('authenticated', 'public.parametros_consulta_veiculo', 'UPDATE')
     or has_table_privilege('authenticated', 'public.parametros_consulta_veiculo', 'DELETE')
     or has_table_privilege('authenticated', 'public.parametros_consulta_veiculo', 'TRUNCATE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: parametros_consulta_veiculo — anon nada; authenticated só SELECT';
  end if;
  if not (select prosecdef from pg_proc
           where oid = 'public.consulta_veiculo_nova_vigencia(integer, integer, jsonb, date, text, text)'::regprocedure)
     or has_function_privilege('anon', 'public.consulta_veiculo_nova_vigencia(integer, integer, jsonb, date, text, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.consulta_veiculo_nova_vigencia(integer, integer, jsonb, date, text, text)', 'EXECUTE') then
    falhas := falhas + 1;
    raise warning 'FALHOU: consulta_veiculo_nova_vigencia não é DEFINER, ou anon a executa, ou authenticated não';
  end if;

  --   A semente.
  select * into v_vig from public.parametros_consulta_veiculo
   where org_id = public.org_padrao() and vigencia_ate is null;
  if v_vig.id is null then
    raise exception 'ACEITE FALHOU: parametros_consulta_veiculo sem vigente — o aprofundar ficaria sem prazo';
  end if;

  select count(*) into v_antes_c from public.consultas_de_placa;
  select count(*) into v_antes_p from public.parametros_consulta_veiculo;

  -- 4 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    foreach v_papel in array array['admin', 'gestor', 'comercial', 'marketing'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-niveis-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite Níveis ' || v_papel, papeis = array[v_papel], role = v_papel, is_active = true
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    -- A segunda loja, criada DEPOIS da padrão (org_padrao() continua a mesma).
    insert into public.orgs (nome, criada_em)
    select 'Aceite outra loja (níveis da placa)', max(criada_em) + interval '1 day' from public.orgs
    returning id into v_outra_org;
    if public.org_padrao() = v_outra_org then
      raise exception 'ACEITE FALHOU: a loja de sonda virou a padrão — a sonda não provaria nada';
    end if;

    -- 4a · O app de hoje (sem nível), na sessão do comercial: sai completo.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.consultas_de_placa (placa, produto, retrato, custo, homologacao)
    values ('ACE1N01', 'veiculos-total', '{"placa": "ACE1N01"}', 30, false)
    returning * into v_linha;
    reset role;
    v_legado := case
      when v_linha.nivel = 'completo' and v_linha.produtos = '{veiculos-total}'
       and v_linha.tentativas = '[{"produto": "veiculos-total", "ok": true, "status": null, "motivo": null,
                                   "pode_ter_cobrado": true, "custo": 30, "reaproveitado": false}]'::jsonb
       and v_linha.consultado_por = (v_ids->>'comercial')::uuid
      then 'completou' else format('saiu %s', to_jsonb(v_linha)) end;

    -- 4b · O básico, e o aprofundar para o intermediário pagando só o check-list.
    set local role authenticated;
    insert into public.consultas_de_placa (placa, produto, nivel, produtos, fragmentos, tentativas, retrato, custo)
    values ('ACE1N02', 'niveis', 'basico', '{estadual,recall,fipe}', v_frag, v_tent3, '{"placa": "ACE1N02"}', 3.18)
    returning * into v_basico;
    v_basico_ok := 'gravou';
    insert into public.consultas_de_placa
      (placa, produto, nivel, produtos, fragmentos, tentativas, retrato, custo, aproveitou_de)
    values ('ACE1N02', 'niveis', 'intermediario', '{estadual,recall,fipe,check-list}',
            v_frag || '{"check-list": {"itens": 3}}', v_reap3 || jsonb_build_array(v_check),
            '{"placa": "ACE1N02"}', 2.4, v_basico.id)
    returning * into v_linha;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_aprofundou := case when v_linha.aproveitou_de = v_basico.id and v_linha.nivel = 'intermediario'
                         then 'aprofundou' else format('saiu %s', to_jsonb(v_linha)) end;

    -- 4c · O gatilho do reaproveitamento (como dono: só gatilho e regras falam).
    --      Origem velha: 8 dias, com o parâmetro de 7.
    insert into public.consultas_de_placa (placa, produto, nivel, produtos, fragmentos, tentativas, retrato, criado_em)
    values ('ACE1N02', 'niveis', 'basico', '{estadual,recall,fipe}', v_frag, v_tent3, '{"placa": "ACE1N02"}',
            now() - interval '8 days')
    returning id into v_velha;
    for v_caso in
      select * from (values
        ('origem de 8 dias',            v_velha,     v_frag || '{"check-list": {"itens": 3}}', v_reap3 || jsonb_build_array(v_check), '{estadual,recall,fipe,check-list}'::text[], 'intermediario'),
        ('fragmento diferente',         v_basico.id, jsonb_set(v_frag, '{fipe,valor}', '1') || '{"check-list": {"itens": 3}}', v_reap3 || jsonb_build_array(v_check), '{estadual,recall,fipe,check-list}', 'intermediario'),
        ('produto que a origem não tem', v_basico.id, v_frag || '{"check-list": {"itens": 3}}',
           v_reap3 || '[{"produto": "check-list", "ok": true, "pode_ter_cobrado": false, "reaproveitado": true},
                        {"produto": "historico-proprietarios", "ok": true, "status": 200, "pode_ter_cobrado": true, "custo": 5, "reaproveitado": false}]'::jsonb,
           '{estadual,recall,fipe,check-list,historico-proprietarios}', 'economico'),
        ('reaproveitada sem origem',    null::uuid,  v_frag || '{"check-list": {"itens": 3}}', v_reap3 || jsonb_build_array(v_check), '{estadual,recall,fipe,check-list}', 'intermediario')
      ) as c(nome, origem, fragmentos, tentativas, produtos, nivel)
    loop
      v_reap_casos := v_reap_casos + 1;
      begin
        insert into public.consultas_de_placa (placa, produto, nivel, produtos, fragmentos, tentativas, retrato, aproveitou_de)
        values ('ACE1N02', 'niveis', v_caso.nivel, v_caso.produtos, v_caso.fragmentos, v_caso.tentativas,
                '{"placa": "ACE1N02"}', v_caso.origem);
        raise warning 'aprofundar "%" foi aceito', v_caso.nome;
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = 'consultas_de_placa_reaproveitamento' then v_reap_certos := v_reap_certos + 1;
        else raise warning 'aprofundar "%" recusado por % (esperado o gatilho)', v_caso.nome, v_msg;
        end if;
      end;
    end loop;

    --      Aprofundar que só reaproveita (nada comprado): é reabrir, não consultar.
    begin
      insert into public.consultas_de_placa (placa, produto, nivel, produtos, fragmentos, tentativas, retrato, aproveitou_de)
      values ('ACE1N02', 'niveis', 'basico', '{estadual,recall,fipe}', v_frag, v_reap3, '{"placa": "ACE1N02"}', v_basico.id);
      v_so_reabriu := 'aceitou';
    exception when check_violation then
      get stacked diagnostics v_msg = constraint_name;
      v_so_reabriu := 'recusou por ' || v_msg;
    end;

    --      Outra placa, outra loja, homologação: a FK composta.
    insert into public.consultas_de_placa (placa, produto, nivel, produtos, fragmentos, tentativas, retrato)
    values ('ACE1N03', 'niveis', 'basico', '{estadual,recall,fipe}', v_frag, v_tent3, '{"placa": "ACE1N03"}')
    returning id into v_outra_placa;
    insert into public.consultas_de_placa (org_id, placa, produto, nivel, produtos, fragmentos, tentativas, retrato)
    values (v_outra_org, 'ACE1N02', 'niveis', 'basico', '{estadual,recall,fipe}', v_frag, v_tent3, '{"placa": "ACE1N02"}')
    returning id into v_alheia;
    insert into public.consultas_de_placa (placa, produto, nivel, produtos, fragmentos, tentativas, retrato, homologacao)
    values ('ACE1N02', 'niveis', 'basico', '{estadual,recall,fipe}', v_frag, v_tent3, '{"placa": "EXEMPLO"}', true)
    returning id into v_homolog;
    foreach v_uid in array array[v_outra_placa, v_alheia, v_homolog, gen_random_uuid()] loop
      v_fk_casos := v_fk_casos + 1;
      begin
        insert into public.consultas_de_placa (placa, produto, nivel, produtos, fragmentos, tentativas, retrato, aproveitou_de)
        values ('ACE1N02', 'niveis', 'intermediario', '{estadual,recall,fipe,check-list}',
                v_frag || '{"check-list": {"itens": 3}}', v_reap3 || jsonb_build_array(v_check),
                '{"placa": "ACE1N02"}', v_uid);
        raise warning 'aprofundar de % foi aceito', v_uid;
      exception when foreign_key_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = 'consultas_de_placa_aproveitou_da_mesma_placa' then v_fk_certos := v_fk_certos + 1; end if;
      end;
    end loop;

    -- 4d · Isolamento entre duas lojas: o comercial não vê a consulta nem o
    --      parâmetro da outra; e cada loja tem a sua vigente.
    insert into public.parametros_consulta_veiculo
      (org_id, precos_de_referencia, tabela_de_precos_em, fonte, dias_para_aprofundar, minutos_contra_repeticao)
    values (v_outra_org, v_precos, current_date, 'Aceite outra loja', 30, 0);
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_cross_le from public.consultas_de_placa where org_id = v_outra_org;
    select count(*) into v_cross_param from public.parametros_consulta_veiculo where org_id = v_outra_org;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- 4e · Apagar a origem (só o dono/serviço apaga) não apaga o aprofundamento.
    delete from public.consultas_de_placa where id = v_basico.id;
    select case when count(*) = 1 and bool_and(aproveitou_de is null) then 'zerou' else 'não zerou' end
      into v_set_null from public.consultas_de_placa where id = v_linha.id;

    -- 4f · Cada regra, tentando gravar o inválido (como dono: só o CHECK fala).
    --      Os sem regra são os controles que têm de entrar.
    v_base := jsonb_build_object(
      'org_id', public.org_padrao(), 'placa', 'ACE1N04', 'produto', 'niveis', 'nivel', 'basico',
      'produtos', '["estadual", "recall", "fipe"]'::jsonb, 'homologacao', false,
      'retrato', '{"placa": "ACE1N04"}'::jsonb, 'fragmentos', v_frag, 'tentativas', v_tent3,
      'custo', 3.18, 'criado_em', now());
    for v_caso in
      select * from (values
        ('básico',                        '{}'::jsonb, null::text),
        ('básico parcial (recall falhou)', '{"produtos": ["estadual", "fipe"], "fragmentos": {"fipe": {"valor": 1}},
            "tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                           {"produto": "recall", "ok": false, "status": 504, "motivo": "tempo esgotado", "pode_ter_cobrado": true, "custo": null, "reaproveitado": false},
                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', null),
        ('econômico',                     '{"nivel": "economico", "produtos": ["estadual", "recall", "fipe", "check-list", "historico-proprietarios"], "fragmentos": {},
            "tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                           {"produto": "recall", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                           {"produto": "check-list", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                           {"produto": "historico-proprietarios", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', null),
        ('completo',                      '{"produto": "veiculos-total", "nivel": "completo", "produtos": ["veiculos-total"], "fragmentos": {},
            "tentativas": [{"produto": "veiculos-total", "ok": true, "pode_ter_cobrado": true, "custo": 30, "reaproveitado": false}]}', null),
        ('nível inventado',               '{"nivel": "premium"}', 'consultas_de_placa_nivel_valido'),
        ('produto avulso em produto',     '{"produto": "estadual"}', 'consultas_de_placa_produto_conhecido'),
        ('veiculos-total no básico',      '{"produto": "veiculos-total"}', 'consultas_de_placa_produto_coerente_com_nivel'),
        ('niveis no completo',            '{"nivel": "completo", "produtos": ["veiculos-total"], "fragmentos": {},
            "tentativas": [{"produto": "veiculos-total", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_produto_coerente_com_nivel'),
        ('produtos vazio',                '{"produtos": [], "fragmentos": {}}', 'consultas_de_placa_produtos_conhecidos'),
        ('produto repetido',              '{"produtos": ["estadual", "estadual", "recall", "fipe"]}', 'consultas_de_placa_produtos_conhecidos'),
        ('produto inventado',             '{"produtos": ["estadual", "recall", "fipe", "placa-plus"]}', 'consultas_de_placa_produtos_conhecidos'),
        ('produto nulo',                  '{"produtos": ["estadual", null], "fragmentos": {}}', 'consultas_de_placa_produtos_conhecidos'),
        ('produto de outro nível',        '{"produtos": ["estadual", "recall", "fipe", "check-list"],
            "tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                           {"produto": "recall", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                           {"produto": "check-list", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_produtos_do_nivel'),
        ('fragmentos em lista',           '{"fragmentos": []}', 'consultas_de_placa_fragmentos_validos'),
        ('fragmento de produto ausente',  '{"fragmentos": {"check-list": {"itens": 1}}}', 'consultas_de_placa_fragmentos_validos'),
        ('fragmento que não é objeto',    '{"fragmentos": {"fipe": 50000}}', 'consultas_de_placa_fragmentos_validos'),
        ('tentativas em objeto',          '{"tentativas": {}}', 'consultas_de_placa_tentativas_validas'),
        ('tentativa sem reaproveitado',   '{"tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true},
                                                           {"produto": "recall", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_tentativas_validas'),
        ('tentativa fora do nível',       '{"tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "recall", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "check-list", "ok": false, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_tentativas_validas'),
        ('custo negativo',                '{"tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true, "custo": -1, "reaproveitado": false},
                                                           {"produto": "recall", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_tentativas_validas'),
        -- As reaproveitadas levam uma origem qualquer: sem ela, o gatilho recusaria antes do CHECK.
        ('reaproveitada cobrada',         '{"aproveitou_de": "00000000-0000-0000-0000-00000000ace2",
                                            "tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true, "reaproveitado": true},
                                                           {"produto": "recall", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_tentativas_validas'),
        ('reaproveitada com custo',       '{"aproveitou_de": "00000000-0000-0000-0000-00000000ace2",
                                            "tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": false, "custo": 2.5, "reaproveitado": true},
                                                           {"produto": "recall", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_tentativas_validas'),
        ('produto sem tentativa ok',      '{"tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "recall", "ok": false, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_tentativas_coerentes'),
        ('tentativa ok fora dos produtos', '{"produtos": ["estadual", "fipe"], "fragmentos": {}}', 'consultas_de_placa_tentativas_coerentes'),
        ('aproveitou de si mesma',        '{"id": "00000000-0000-0000-0000-00000000ace1", "aproveitou_de": "00000000-0000-0000-0000-00000000ace1"}', 'consultas_de_placa_aproveitou_coerente'),
        ('dado pessoal no fragmento',     '{"fragmentos": {"estadual": {"nome_razao": "FULANO"}}}', 'consultas_de_placa_sem_dado_pessoal'),
        ('nome no fragmento (maiúscula)', '{"fragmentos": {"estadual": {"Nome": "FULANO"}}}', 'consultas_de_placa_sem_dado_pessoal'),
        ('financiado no fragmento',       '{"fragmentos": {"estadual": {"gravame": {"cpf_cnpj_financiado": "0", "nome_financiado": "F"}}}}', 'consultas_de_placa_sem_dado_pessoal'),
        ('faturado no fragmento',         '{"fragmentos": {"estadual": {"numero_identificacao_do_faturado": "0"}}}', 'consultas_de_placa_sem_dado_pessoal'),
        ('código do CRV no fragmento',    '{"fragmentos": {"estadual": {"codigo_seguranca_crv": "0"}}}', 'consultas_de_placa_sem_dado_pessoal'),
        ('documento na tentativa',        '{"tentativas": [{"produto": "estadual", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false, "documento": "0"},
                                                           {"produto": "recall", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false},
                                                           {"produto": "fipe", "ok": true, "pode_ter_cobrado": true, "reaproveitado": false}]}', 'consultas_de_placa_sem_dado_pessoal'),
        ('nome no retrato',               '{"retrato": {"placa": "ACE1N04", "veiculo": {"nome": "FULANO"}}}', 'consultas_de_placa_sem_dado_pessoal')
      ) as c(nome, muda, regra)
    loop
      if v_caso.regra is null then v_controles := v_controles + 1; else v_regras := v_regras + 1; end if;
      begin
        insert into public.consultas_de_placa
        select * from jsonb_populate_record(null::public.consultas_de_placa,
                        v_base || jsonb_build_object('id', gen_random_uuid()) || v_caso.muda);
        if v_caso.regra is null then v_controles_ok := v_controles_ok + 1;
        else raise warning 'caso "%" foi aceito — esperado recusa por %', v_caso.nome, v_caso.regra;
        end if;
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_caso.regra is not null and v_msg = v_caso.regra then v_regras_certas := v_regras_certas + 1;
        else raise warning 'caso "%" recusado por "%" (esperado %)', v_caso.nome, v_msg, coalesce(v_caso.regra, 'aceite');
        end if;
      end;
    end loop;

    -- 4g · Os parâmetros: admin, gestor e comercial leem; marketing não; anon 42501.
    foreach v_papel in array array['admin', 'gestor', 'comercial'] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      select count(*) into v_n from public.parametros_consulta_veiculo where vigencia_ate is null and id = v_vig.id;
      reset role;
      if v_n = 1 then v_param_leram := v_param_leram + 1; end if;
    end loop;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.parametros_consulta_veiculo;
    reset role;
    v_param_cego := case when v_n = 0 then 'cego' else format('viu %s', v_n) end;
    perform set_config('request.jwt.claims', '', true);
    begin
      set local role anon;
      perform 1 from public.parametros_consulta_veiculo limit 1;
      reset role;
      v_param_anon := 'leu';
    exception when insufficient_privilege then v_param_anon := 'negado';
    end;

    -- 4h · Só o admin abre vigência; sem sessão também não; nem o admin escreve direto.
    foreach v_papel in array array['gestor', 'comercial', 'marketing'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>v_papel)::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        perform public.consulta_veiculo_nova_vigencia(14, 15, v_precos, current_date, 'Aceite');
        reset role;
      exception when insufficient_privilege then v_param_recus := v_param_recus + 1;
      end;
    end loop;
    perform set_config('request.jwt.claims', '', true);
    begin
      perform public.consulta_veiculo_nova_vigencia(14, 15, v_precos, current_date, 'Aceite');
      v_param_sem_ses := 'gravou';
    exception when insufficient_privilege then v_param_sem_ses := 'negado';
    end;
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      insert into public.parametros_consulta_veiculo
        (precos_de_referencia, tabela_de_precos_em, fonte, dias_para_aprofundar, minutos_contra_repeticao,
         vigencia_desde, vigencia_ate)
      values (v_precos, current_date, 'Aceite direto', 7, 30, current_date + 365, current_date + 730);
      reset role;
      v_param_direto := 'inseriu';
    exception when insufficient_privilege then v_param_direto := 'negado';
    end;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select * into v_nova from public.consulta_veiculo_nova_vigencia(
             14, 15, v_precos || '{"fipe": 0.07}', date '2026-11-01', '  Aceite admin  ', 'Aceite');
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into v_n from public.parametros_consulta_veiculo
     where org_id = public.org_padrao() and vigencia_ate is null;
    v_param_admin := case
      when v_nova.criado_por = (v_ids->>'admin')::uuid and v_nova.dias_para_aprofundar = 14
       and v_nova.fonte = 'Aceite admin' and v_nova.vigencia_desde = current_date and v_nova.vigencia_ate is null
       and (select vigencia_ate from public.parametros_consulta_veiculo where id = v_vig.id) = current_date
       and v_n = 1
      then 'abriu' else format('saiu errado (nova %s, vigentes %s)', to_jsonb(v_nova), v_n) end;
    begin
      update public.parametros_consulta_veiculo set dias_para_aprofundar = 30 where id = v_nova.id;
      v_param_edita := 'editou';
    exception when raise_exception then v_param_edita := 'recusou';
    end;

    -- 4i · Cada regra dos parâmetros, numa vigência FUTURA e já encerrada.
    v_base := jsonb_build_object(
      'org_id', public.org_padrao(), 'precos_de_referencia', v_precos, 'tabela_de_precos_em', current_date,
      'fonte', 'Aceite parametros_consulta_veiculo', 'dias_para_aprofundar', 7, 'minutos_contra_repeticao', 30,
      'vigencia_desde', current_date + 365, 'vigencia_ate', current_date + 730, 'criado_em', now());
    for v_caso in
      select * from (values
        ('a base',               '{}'::jsonb, null::text),
        ('limites de baixo',     '{"dias_para_aprofundar": 1, "minutos_contra_repeticao": 0}', null),
        ('limites de cima',      '{"dias_para_aprofundar": 90, "minutos_contra_repeticao": 1440}', null),
        ('aprofundar de 0 dia',  '{"dias_para_aprofundar": 0}',  'parametros_consulta_veiculo_dias_para_aprofundar_na_faixa'),
        ('aprofundar de 91',     '{"dias_para_aprofundar": 91}', 'parametros_consulta_veiculo_dias_para_aprofundar_na_faixa'),
        ('repetição negativa',   '{"minutos_contra_repeticao": -1}',   'parametros_consulta_veiculo_minutos_contra_repeticao_na_faixa'),
        ('repetição de 1441',    '{"minutos_contra_repeticao": 1441}', 'parametros_consulta_veiculo_minutos_contra_repeticao_na_faixa'),
        ('preços sem um produto', jsonb_build_object('precos_de_referencia', v_precos - 'recall'), 'parametros_consulta_veiculo_precos_validos'),
        ('preço de produto a mais', jsonb_build_object('precos_de_referencia', v_precos || '{"cpf-lite": 0.12}'), 'parametros_consulta_veiculo_precos_validos'),
        ('preço negativo',       jsonb_build_object('precos_de_referencia', v_precos || '{"fipe": -0.01}'), 'parametros_consulta_veiculo_precos_validos'),
        ('preço em texto',       jsonb_build_object('precos_de_referencia', v_precos || '{"fipe": "0.06"}'), 'parametros_consulta_veiculo_precos_validos'),
        ('preços em lista',      '{"precos_de_referencia": [30]}', 'parametros_consulta_veiculo_precos_validos'),
        ('fonte só espaço',      '{"fonte": " \t "}', 'parametros_consulta_veiculo_fonte_preenchida'),
        ('vigência que acaba antes', jsonb_build_object('vigencia_ate', current_date + 364), 'parametros_consulta_veiculo_vigencia_em_ordem')
      ) as c(nome, muda, regra)
    loop
      if v_caso.regra is null then v_param_limites := v_param_limites + 1;
      else v_param_casos := v_param_casos + 1; end if;
      begin
        insert into public.parametros_consulta_veiculo
        select * from jsonb_populate_record(null::public.parametros_consulta_veiculo,
                        v_base || v_caso.muda || jsonb_build_object('id', gen_random_uuid()));
        if v_caso.regra is null then v_param_aceitos := v_param_aceitos + 1;
        else raise warning 'parâmetro "%" foi aceito — esperado recusa por %', v_caso.nome, v_caso.regra;
        end if;
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_caso.regra is not null and v_msg = v_caso.regra then v_param_certos := v_param_certos + 1;
        else raise warning 'parâmetro "%" recusado por "%" (esperado %)', v_caso.nome, v_msg, coalesce(v_caso.regra, 'aceite');
        end if;
      end;
    end loop;

    raise exception 'DESFAZER_ACEITE_NIVEIS' using errcode = 'PNV01';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PNV01' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'marketing' is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários — nada foi provado';
  end if;
  if v_legado <> 'completou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: a forma antiga (app de hoje) — %', v_legado;
  end if;
  if v_basico_ok <> 'gravou' or v_aprofundou <> 'aprofundou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: básico %, aprofundar %', v_basico_ok, v_aprofundou;
  end if;
  if v_reap_casos <> 4 or v_reap_certos <> v_reap_casos then
    falhas := falhas + 1;
    raise warning 'FALHOU: reaproveitamento — % de % recusas pelo gatilho', v_reap_certos, v_reap_casos;
  end if;
  if v_so_reabriu <> 'recusou por consultas_de_placa_tentativas_coerentes' then
    falhas := falhas + 1;
    raise warning 'FALHOU: aprofundar sem comprar nada — %', v_so_reabriu;
  end if;
  if v_fk_casos <> 4 or v_fk_certos <> v_fk_casos then
    falhas := falhas + 1;
    raise warning 'FALHOU: FK composta — % de % recusas (outra placa, outra loja, homologação, inexistente)', v_fk_certos, v_fk_casos;
  end if;
  if v_cross_le <> 0 or v_cross_param <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: isolamento — o comercial viu % consulta(s) e % parâmetro(s) da outra loja', v_cross_le, v_cross_param;
  end if;
  if v_set_null <> 'zerou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: apagar a origem — %', v_set_null;
  end if;
  if v_regras < 28 or v_regras_certas <> v_regras or v_controles < 4 or v_controles_ok <> v_controles then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras — % de % recusas pela regra certa; % de % controles aceitos',
      v_regras_certas, v_regras, v_controles_ok, v_controles;
  end if;
  if v_param_leram <> 3 or v_param_cego <> 'cego' or v_param_anon <> 'negado' then
    falhas := falhas + 1;
    raise warning 'FALHOU: leitura dos parâmetros — % de 3 leram; marketing %; anon %', v_param_leram, v_param_cego, v_param_anon;
  end if;
  if v_param_recus <> 3 or v_param_sem_ses <> 'negado' or v_param_direto <> 'negado'
     or v_param_admin <> 'abriu' or v_param_edita <> 'recusou' then
    falhas := falhas + 1;
    raise warning 'FALHOU: escrita dos parâmetros — % de 3 recusados; sem sessão %; direto %; admin %; editar vigente %',
      v_param_recus, v_param_sem_ses, v_param_direto, v_param_admin, v_param_edita;
  end if;
  if v_param_casos < 11 or v_param_certos <> v_param_casos or v_param_aceitos <> v_param_limites then
    falhas := falhas + 1;
    raise warning 'FALHOU: regras dos parâmetros — % de % recusas certas; % de % limites aceitos',
      v_param_certos, v_param_casos, v_param_aceitos, v_param_limites;
  end if;

  -- Nada da prova ficou.
  select count(*) into v_depois_c from public.consultas_de_placa;
  select count(*) into v_depois_p from public.parametros_consulta_veiculo;
  select count(*) into v_restou from auth.users where email like 'aceite-niveis-%@exemplo.invalido';
  if v_depois_c <> v_antes_c or v_depois_p <> v_antes_p or v_restou <> 0
     or exists (select 1 from public.orgs where nome = 'Aceite outra loja (níveis da placa)') then
    falhas := falhas + 1;
    raise warning 'FALHOU: a prova deixou rastro (consultas % → %, parâmetros % → %, % usuário(s))',
      v_antes_c, v_depois_c, v_antes_p, v_depois_p, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) nos níveis da consulta de placa', falhas;
  end if;

  raise notice
    'Aceite verificado: consultas_de_placa tem nível, produtos, fragmentos, tentativas e aproveitou_de, '
    'com as linhas antigas em completo/{veiculos-total}; o app de hoje (sem nível) segue gravando e sai '
    'completo; o básico grava e o intermediário o aprofunda pagando só o check-list; aprofundar fora do '
    'prazo, com fragmento trocado, de produto que a origem não tem, sem origem ou sem comprar nada é '
    'recusado; de outra placa, de outra loja, da homologação ou inexistente cai na FK composta; apagar a '
    'origem zera aproveitou_de e a linha fica; o comercial não vê consulta nem parâmetro da outra loja; '
    '% regras caem cada uma na sua; parametros_consulta_veiculo tem a semente vigente, admin/gestor/'
    'comercial leem, marketing não, anon é barrado, só o admin abre vigência pela função, o valor vigente '
    'não se edita e cada faixa recusa; a prova não deixou rastro.', v_regras;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261019120000', 'niveis_da_consulta_de_placa')
  on conflict (version) do nothing;
