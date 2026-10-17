-- ============================================================================
-- Copiloto de Mídia: o Meta Ads — o mesmo copiloto, duas plataformas
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-10-14-copiloto-de-midia-design.md
-- Base: 20261014150000_copiloto_de_midia.sql (as tabelas, o gatilho de
-- transição, as portas do painel e do script), 20261016200000_copiloto_pedido_de_verba.sql
-- (o pedido de verba e a forma atual do gatilho, da gravação do retrato e do
-- desfazer) e 20260924120000_midia_paga_sincronizada.sql (`midia_gravar_lote`).
--
-- Por quê
-- -------
-- Até aqui o copiloto só conhecia o Google Ads: o retrato vinha do script
-- colado na conta, e era o script que aplicava o que foi aprovado. O Meta Ads
-- entra pelo NOSSO servidor, sem script:
--   1. a rota agendada do Meta lê a conta pela Graph API, aplica as regras do
--      Meta em TypeScript e grava o retrato pela MESMA
--      `midia_copiloto_gravar_diagnostico`, agora com `plataforma = 'meta'`;
--   2. Administrador ou Marketing aprova no mesmo painel, pela mesma porta
--      (`midia_copiloto_decidir`, que esta migração não toca);
--   3. a rota reserva o aprovado do Meta (`midia_copiloto_reservar_acoes_meta`,
--      nova), aplica pela Graph API, lê de volta e devolve o resultado pela
--      mesma `midia_copiloto_registrar_resultado` — a trilha diz
--      'Copiloto (API do Meta)' em vez de 'Script do Google Ads'.
--
-- O bloqueio principal: as duas plataformas dividem as tabelas e NUNCA se
-- tocam. Um retrato do Meta não descarta proposta do Google (e vice-versa); a
-- reserva do Google nunca entrega ação do Meta ao script (ele não sabe
-- aplicá-la, e "não sei" vira falha na conta errada); a do Meta nunca entrega
-- a do Google. A autoconferência prova as quatro direções pelo efeito.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
-- 1. `midia_copiloto_diagnosticos.plataforma` (google | meta, padrão google),
--    com índice (org_id, plataforma, recebido_em desc). A tabela é
--    append-only (gatilho `midia_copiloto_imutavel`): `add column ... default`
--    não reescreve linha nem dispara gatilho de linha.
-- 2. `midia_copiloto_acoes`:
--      * `plataforma` (google | meta, padrão google), `anuncio_id_externo` e
--        `anuncio_nome` (nulas);
--      * quatro tipos novos, só do Meta: `pausar_conjunto`, `reativar_conjunto`,
--        `pausar_anuncio`, `reativar_anuncio`. No Meta o "grupo" é o conjunto
--        de anúncios (ad set): `grupo_id_externo`/`grupo_nome` guardam o
--        conjunto, e no anúncio guardam o conjunto DELE (contexto da frase);
--      * `mudar_verba` serve às duas (no Meta, a verba diária da campanha —
--        orçamento de campanha; verba no conjunto o copiloto não muda);
--      * índice (org_id, plataforma, situacao, proposta_em desc) — o painel e
--        as duas reservas filtram por plataforma.
-- 3. O gatilho `midia_copiloto_acoes_transicao`: o desfazer espelha também a
--    plataforma e o anúncio, e o mapa de inverso ganha pausar_conjunto ↔
--    reativar_conjunto e pausar_anuncio ↔ reativar_anuncio; no UPDATE,
--    plataforma, anúncio e nome do anúncio entram no alvo que não muda.
-- 4. `midia_copiloto_descrever`: as frases dos quatro tipos novos (as mesmas
--    de `descreverAcao` em src/lib/copilotoDeMidia.ts); as do Google e a da
--    verba não mudam.
-- 5. `midia_copiloto_gravar_diagnostico(jsonb)` (mesma assinatura; corpo da
--    20261016200000): lê `p->>'plataforma'` (vazio = google; fora de
--    google|meta = 22023), grava o retrato e as propostas com ela e restringe
--    a ela TODOS os descartes (proposta de retrato anterior, pedido parado há
--    mais de uma janela) e a janela de "aplicada ou recusada não volta".
-- 6. `midia_copiloto_reservar_acoes(integer)` (mesma assinatura): só Google.
--    `midia_copiloto_reservar_acoes_meta(integer)` (nova): só Meta, até 20 por
--    vez, reentrega depois de 90 min, três entregas sem resposta viram falha.
--    Nas duas, o lote passa a ser escolhido uma vez só (CTE materializado): o
--    `where id in (select ... limit n for update skip locked)` da
--    20261014150000 entregava MAIS que o limite quando o planejador reexecutava
--    o subselect — o aceite desta migração pegou a reserva do Meta com limite 1
--    entregando 2, num plano que só aparece com certas estatísticas.
-- 7. `midia_copiloto_registrar_resultado(uuid, text, jsonb, text)` (mesma
--    assinatura): o autor da trilha vem da plataforma da ação.
-- 8. `midia_copiloto_pedir_verba(text, numeric, text)` (mesma assinatura):
--    procura a campanha nas duas plataformas (o mesmo ID nas duas = 22023,
--    ambíguo), a ação nasce com a plataforma da campanha, e a verba lida de
--    volta e a mudança de verba aberta são as da MESMA plataforma. Campanha do
--    Meta sem `orcamento_diario` (verba nos conjuntos) = 22023.
-- 9. `midia_copiloto_desfazer(uuid)` (mesma assinatura): copia plataforma e
--    anúncio para o inverso; "uma mudança de verba aberta por campanha" olha a
--    mesma plataforma.
-- 10. `midia_copiloto_achados_regra_valida`: as seis regras do Google e quatro
--    do Meta — `meta_sem_lead` (anúncio ou conjunto com gasto e nenhum lead
--    no CRM), `meta_custo_por_lead` (custo por lead do CRM acima do teto),
--    `meta_qualidade` (leads maduros sem nenhum qualificado no funil) e
--    `meta_medicao` (leads do pixel × leads no CRM divergentes). O retrato do
--    Meta reutiliza `ritmo_de_verba`. `midia_copiloto_achados_meta_sem_grupo`:
--    achado do Meta não tem classe de termo (o `grupo` é do termo de
--    pesquisa, que é do Google).
-- 11. `midia_anuncios` ganha o conjunto e as situações (do anúncio e do
--    conjunto), que a sincronização do Meta lê da lista `/ads`; e
--    `midia_gravar_lote(jsonb)` (mesma assinatura; corpo da 20260924120000)
--    os grava quando vêm no JSON do anúncio — o que não veio fica como estava
--    (`coalesce`). O Google não manda nenhum dos quatro: nada muda para ele.
-- 12. `midia_anuncios` e `midia_diario` alimentam o diagnóstico do Meta (nome,
--    conjunto e situação do anúncio; gasto do dia) e passam a ser, na sessão,
--    o que `midia_campanhas` virou na 20261016200000 (seção 7): staff LÊ; o
--    anúncio só se escreve pela sessão em campanha MANUAL; o desempenho diário
--    não se escreve pela sessão (nunca teve policy de escrita, e agora nem o
--    privilégio). Até aqui qualquer staff reescrevia o anúncio sincronizado
--    (`midia_anuncios_autenticados`, for all, 20260813120000) — trocar o
--    conjunto ou o nome põe na proposta de pausa uma frase que não é a do
--    alvo — e qualquer conta logada, cliente inclusive, lia o gasto diário
--    (`midia_diario_leitura`, using true, 20260924120000).
-- 13. Os limiares do diagnóstico do Meta viram regra em tabela, com vigência e
--    trilha, como os do Google: seis colunas `meta_*` em
--    `midia_copiloto_parametros` (not null, com padrão — a vigente ganha o
--    padrão sem UPDATE) e o CHECK `midia_copiloto_parametros_meta_validos`.
--    `midia_copiloto_nova_vigencia` ganha os seis NO FIM, `default null` (nulo
--    copia o da vigente; sem vigente, o padrão da coluna), e a trilha
--    `copiloto_regras` os escreve. A assinatura muda: a de 15 argumentos é
--    DERRUBADA e a de 21 criada — as duas juntas deixariam o PostgREST ambíguo
--    para a chamada de 15, que é a do site de hoje e continua casando com a
--    de 21 (os seis novos têm padrão).
--
-- Os índices únicos ficam como estão, e continuam certos com duas plataformas:
--   * `midia_copiloto_acoes_chave_aberta (org_id, chave)` — as chaves do Meta
--     que o TypeScript monta são prefixadas `meta:` (`meta:pausar_anuncio:<id>`,
--     `meta:pausar_conjunto:<id>`) e não encontram as do Google; a de verba é
--     `verba:<campanha>` nas duas (é o pedido de verba que a monta, e o
--     diagnóstico divide a mesma), e campanha de uma não tem o ID da outra;
--   * `midia_copiloto_acoes_uma_verba_aberta (org_id, campanha_id_externo)` —
--     os IDs não colidem: no Google é o ID da campanha na conta (até 11–12
--     dígitos); no Meta, o ID de objeto do Graph (15 dígitos ou mais). Se um
--     dia colidirem, o pedido recusa por ambiguidade e o retrato pula a
--     proposta (`on conflict do nothing`) — nada é aplicado na campanha errada.
-- `midia_campanhas` não tem `org_id` (S1): a campanha é achada pelo ID e pela
-- plataforma (`midia_campanhas_plataforma_id_externo_key`), e tudo o que o
-- copiloto grava vai para `org_padrao()`, como as portas do script — até a
-- S1 o segredo do Meta (`midia_cron_segredo`) é um só.
--
-- ---------------------------------------------------------------------------
-- As regras, e quem as segura
-- ---------------------------------------------------------------------------
--   midia_copiloto_diagnosticos_plataforma_valida .. google ou meta
--   midia_copiloto_achados_regra_valida ............ a lista de REGRAS (6 do Google, 4 do Meta)
--   midia_copiloto_achados_meta_sem_grupo .......... achado do Meta sem classe de termo
--   midia_copiloto_acoes_plataforma_valida ......... google ou meta
--   midia_copiloto_acoes_tipo_valido ............... a lista de TIPOS_DE_ACAO (9)
--   midia_copiloto_acoes_tipo_da_plataforma ........ google: negativar, remover_negativa,
--                                                    pausar_grupo, reativar_grupo, mudar_verba;
--                                                    meta: pausar_conjunto, reativar_conjunto,
--                                                    pausar_anuncio, reativar_anuncio, mudar_verba.
--                                                    Escrita pela EXCLUSÃO (o que de uma é
--                                                    proibido na outra): o Postgres confere os
--                                                    CHECKs em ordem alfabética de nome, e esta
--                                                    vem antes de `tipo_valido` — escrita pela
--                                                    inclusão, o tipo INVENTADO cairia aqui e
--                                                    não na regra de tipo. Com `tipo_valido` e
--                                                    `plataforma_valida`, dá a mesma régua.
--   midia_copiloto_acoes_ids_validos ............... campanha, grupo/conjunto e anúncio numéricos
--                                                    (até 20 dígitos); nome do anúncio de 1 a 300
--   midia_copiloto_acoes_alvo_do_tipo .............. cada tipo com o seu alvo, e só ele: anúncio
--                                                    só nos tipos de anúncio; pausar/reativar
--                                                    conjunto pedem o conjunto; pausar/reativar
--                                                    anúncio pedem o anúncio E o conjunto dele
--   midia_copiloto_acoes_origem_do_tipo ............ reativar_conjunto e reativar_anuncio só
--                                                    nascem desfazendo, como reativar_grupo e
--                                                    remover_negativa; pedido continua só verba
--   midia_copiloto_acoes_transicao (gatilho) ....... o desfazer espelha plataforma e anúncio;
--                                                    plataforma e anúncio não mudam depois de
--                                                    propostos
--   midia_anuncios_conjunto_id_valido .............. conjunto nulo ou numérico (até 20 dígitos)
--   midia_anuncios_situacoes_validas ............... situação do anúncio e do conjunto: nula ou
--                                                    a régua de midia_campanhas.situacao
--   midia_anuncios_leitura / _manual_* ............. staff lê; a sessão inclui, edita e exclui só
--                                                    anúncio de campanha manual, e a linha não
--                                                    muda para campanha sincronizada (WITH CHECK)
--   midia_diario_leitura ........................... staff lê; a sessão não escreve
--   midia_copiloto_parametros_meta_validos ......... gastos mínimos > 0 e ≤ 100.000; sem lead de
--                                                    1× a 10×; caro acima de 1× e até 10×; leads
--                                                    maduros de 1 a 500; amadurecer de 1 a 29 dias
--   midia_copiloto_nova_vigencia ................... uma função só com esse nome (21 argumentos)
--
-- As linhas que já existem passam em tudo: todas são do Google (o padrão),
-- com anúncio nulo, de um dos cinco tipos de antes e de uma das seis regras;
-- `midia_anuncios` ganha colunas nulas. A conferência prévia não precisa
-- procurar conflito.
--
-- Quem lê e quem escreve no Copiloto: nada muda. As colunas novas entram nas
-- policies de leitura que já existem (Administrador e Marketing); ninguém
-- escreve direto no copiloto; a reserva do Meta é só da chave de serviço,
-- como as outras portas do script. Em `midia_anuncios` e `midia_diario`, o
-- item 12 acima. Nenhum código do site escreve nas duas pela sessão (só lê:
-- /api/marketing/campanhas, a Visão geral e o copiloto, este pela chave de
-- serviço); a leitura de quem não é staff já vinha vazia, porque
-- `midia_campanhas` é só de staff desde a 20261016200000.
--
-- ---------------------------------------------------------------------------
-- Ordem de implantação (a migração NÃO foi aplicada em produção pelo PR)
-- ---------------------------------------------------------------------------
--   1. aplicar esta migração;  2. publicar o site (a rota do Meta, o painel
--   com as duas plataformas). O script do Google Ads NÃO muda.
--   Migração antes do site: nada muda para ninguém — o Google segue igual (o
--   padrão é google e a reserva do script só olha o Google), a lista de
--   `midia_anuncios` ganha colunas que ninguém lê ainda, e o anúncio e o
--   desempenho sincronizados deixam de ser editáveis pela sessão (o site não
--   os edita).
--   Site antes da migração: NÃO. A `midia_copiloto_gravar_diagnostico` antiga
--   não lê `plataforma`: o retrato do Meta seria gravado como do Google,
--   descartaria as propostas do Google, e um `mudar_verba` do Meta iria ao
--   script do Google. A rota do Meta deve conferir a migração antes de gravar
--   (ex.: ler `plataforma` de `midia_copiloto_diagnosticos` com limit 0 —
--   42703 quando falta).
--
-- ⚠️ Reaplicar a 20261016200000 DEPOIS desta devolve o gatilho, a gravação do
--    retrato, o pedido e o desfazer à forma de antes (sem plataforma), e o
--    CHECK de origem à forma sem os reativar do Meta. Reaplicar a 20261014150000
--    depois desta recria a `midia_copiloto_nova_vigencia` de 15 argumentos AO
--    LADO da de 21 (sobrecarga: o aceite dela para em "function ... is not
--    unique", e o PostgREST também) e devolve os CHECKs da ação à forma de
--    antes do pedido de verba. Quem reaplicar uma das duas reaplica, na ordem,
--    as que vêm depois dela (20261016200000 e esta) — esta derruba a de 15 de
--    novo. Conferido: 20261014150000 → 20261016200000 → esta volta ao estado
--    de antes, com uma função só.
--
-- ⚠️ DESFAZER. Fechar a porta do Meta é o desfazer seguro: sem a reserva do
--    Meta, nada aprovado do Meta chega à conta; o Google segue como está, e
--    as colunas, os CHECKs e as funções novas ficam (com plataforma google
--    elas se comportam como as de antes):
--
--   begin;
--   drop function if exists public.midia_copiloto_reservar_acoes_meta(integer);
--   delete from supabase_migrations.schema_migrations where version = '20261017150000';
--   commit;
--
--    O desfazer inteiro só cabe SEM linha do Meta (ação, retrato e achado do
--    copiloto não se apagam) e com o site já de volta à versão anterior:
--      select (select count(*) from public.midia_copiloto_acoes where plataforma <> 'google')
--           + (select count(*) from public.midia_copiloto_diagnosticos where plataforma <> 'google')
--           + (select count(*) from public.midia_copiloto_achados where regra like 'meta\_%');  -- precisa dar 0
--    e, nessa ordem — os corpos novos leem as colunas novas, então saem ANTES
--    delas, e os CHECKs antigos voltam ANTES de as colunas caírem (`drop
--    column` leva junto o CHECK que a cita):
--
--   begin;
--   drop function if exists public.midia_copiloto_reservar_acoes_meta(integer);
--   -- recriar, por `create or replace`, com o texto da 20261016200000
--   -- (seções 3, 4, 5 e 6): midia_copiloto_acoes_transicao(),
--   -- midia_copiloto_gravar_diagnostico(jsonb), midia_copiloto_pedir_verba(text, numeric, text)
--   -- e midia_copiloto_desfazer(uuid); com o da 20261014150000 (seções 3, 6b
--   -- e 6c): midia_copiloto_descrever(midia_copiloto_acoes),
--   -- midia_copiloto_reservar_acoes(integer) e
--   -- midia_copiloto_registrar_resultado(uuid, text, jsonb, text); e com o da
--   -- 20260924120000: midia_gravar_lote(jsonb);
--   drop index if exists public.midia_copiloto_acoes_plataforma_idx;
--   drop index if exists public.midia_copiloto_diagnosticos_plataforma_idx;
--   alter table public.midia_copiloto_acoes
--     drop constraint if exists midia_copiloto_acoes_tipo_da_plataforma,
--     drop constraint if exists midia_copiloto_acoes_plataforma_valida;
--   alter table public.midia_copiloto_achados
--     drop constraint if exists midia_copiloto_achados_meta_sem_grupo;
--   -- trocar, por `drop constraint if exists` + o texto de lá, os CHECKs de
--   -- tipo, ids e alvo (20261014150000, seção 3), o de origem (20261016200000,
--   -- seção 2) e o de regra dos achados (20261014150000, seção 2);
--   alter table public.midia_copiloto_diagnosticos
--     drop constraint if exists midia_copiloto_diagnosticos_plataforma_valida;
--   alter table public.midia_copiloto_acoes
--     drop column if exists anuncio_nome, drop column if exists anuncio_id_externo,
--     drop column if exists plataforma;
--   alter table public.midia_copiloto_diagnosticos drop column if exists plataforma;
--   alter table public.midia_anuncios
--     drop constraint if exists midia_anuncios_conjunto_id_valido,
--     drop constraint if exists midia_anuncios_situacoes_validas;
--   alter table public.midia_anuncios
--     drop column if exists conjunto_situacao, drop column if exists situacao,
--     drop column if exists conjunto_nome, drop column if exists conjunto_id_externo;
--   -- as regras do Meta: a porta de 21 argumentos sai, a de 15 volta com o
--   -- texto e os grants da 20261014150000 (seção 5a e o revoke/grant da 5),
--   -- e as colunas caem (os valores do Meta das vigências se perdem; a trilha fica):
--   drop function if exists public.midia_copiloto_nova_vigencia(
--     numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer,
--     text[], text[], text[], integer, numeric, numeric, numeric, numeric, integer, integer);
--   -- create function public.midia_copiloto_nova_vigencia(<os 15 da 20261014150000>) ...;
--   -- revoke all ... from public, anon;  grant execute ... to authenticated;
--   alter table public.midia_copiloto_parametros
--     drop constraint if exists midia_copiloto_parametros_meta_validos;
--   alter table public.midia_copiloto_parametros
--     drop column if exists meta_dias_para_amadurecer, drop column if exists meta_leads_maduros_minimos,
--     drop column if exists meta_vezes_custo_caro, drop column if exists meta_vezes_sem_lead,
--     drop column if exists meta_gasto_minimo_campanha, drop column if exists meta_gasto_minimo_conjunto;
--   -- e os comentários de midia_copiloto_acoes, midia_copiloto_diagnosticos,
--   -- midia_copiloto_achados, da coluna chave, dos dois índices únicos e das
--   -- funções, com o texto da 20261016200000 (seção 8) e da 20261014150000 (seção 7);
--   delete from supabase_migrations.schema_migrations where version = '20261017150000';
--   commit;
--
--    A trilha em auditoria_admin (copiloto_aplicou com 'Copiloto (API do
--    Meta)', e as decisões) fica em todos os casos.
--
--    As policies de `midia_anuncios` e `midia_diario` (seção 11) fecham um
--    buraco que existia antes do Meta; nenhum dos dois desfazeres acima as
--    reverte. Voltar à forma antiga devolve a qualquer staff a escrita no
--    anúncio sincronizado e a qualquer conta logada a leitura do gasto — só
--    se for preciso:
--
--   begin;
--   drop policy if exists midia_anuncios_leitura on public.midia_anuncios;
--   drop policy if exists midia_anuncios_manual_inclusao on public.midia_anuncios;
--   drop policy if exists midia_anuncios_manual_edicao on public.midia_anuncios;
--   drop policy if exists midia_anuncios_manual_exclusao on public.midia_anuncios;
--   create policy midia_anuncios_autenticados on public.midia_anuncios
--     for all to authenticated
--     using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
--   grant all on public.midia_anuncios to anon, authenticated;
--   drop policy if exists midia_diario_leitura on public.midia_diario;
--   create policy midia_diario_leitura on public.midia_diario
--     for select to authenticated using (true);
--   grant select, insert, update, delete, references, trigger on public.midia_diario to anon, authenticated;
--   -- (e, no Postgres 17 da produção, `grant maintain` aos dois, como estava)
--   commit;
--
-- Aditiva (oito colunas no copiloto: duas com o padrão google, seis nulas; seis
-- colunas de regra do Meta, com padrão; quatro CHECKs trocados por versões
-- que, para as linhas que existem — todas do Google —, aceitam o mesmo; o
-- CHECK de regra só alarga; sete CHECKs novos que nada do que existe viola;
-- dois índices comuns; os dois únicos intocados; o gatilho, a frase e seis
-- funções com o mesmo nome e a mesma assinatura; uma função nova; a porta das
-- regras com seis argumentos NOVOS no fim, opcionais — a de 15 sai para não
-- haver sobrecarga, e toda chamada de 15 casa com a de 21; a policy de
-- `midia_anuncios` trocada por quatro mais estreitas e a de `midia_diario`
-- estreitada a staff; `auditoria_admin` só recebe linhas; `leads` e
-- `estoque_motors` não são tocadas) e idempotente: `add column if not
-- exists`, `drop constraint if exists` + `add constraint`, `create index if not
-- exists`, `drop function if exists` (a de 15) + `create or replace`, `drop
-- policy if exists` + `create policy`, revoke/grant e comment reaplicáveis.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
begin
  if to_regprocedure('public.midia_copiloto_pedir_verba(text, numeric, text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'midia_copiloto_acoes'
                       and column_name = 'pedida_por') then
    raise exception
      'DEPENDÊNCIA: falta o pedido de verba do Copiloto (20261016200000): midia_copiloto_pedir_verba(text, numeric, text) ou midia_copiloto_acoes.pedida_por. Nada foi aplicado.';
  end if;
  if to_regprocedure('public.midia_copiloto_reservar_acoes(integer)') is null
     or to_regprocedure('public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text)') is null
     or to_regprocedure('public.midia_copiloto_gravar_diagnostico(jsonb)') is null
     or to_regprocedure('public.midia_copiloto_decidir(uuid[], text, text)') is null then
    raise exception
      'DEPENDÊNCIA: falta uma porta do Copiloto de Mídia (20261014150000). Nada foi aplicado.';
  end if;
  if to_regclass('public.midia_anuncios') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'midia_anuncios'
                       and column_name = 'id_externo')
     or to_regclass('public.midia_diario') is null
     or to_regprocedure('public.midia_gravar_lote(jsonb)') is null then
    raise exception
      'DEPENDÊNCIA: falta public.midia_anuncios sincronizada, public.midia_diario ou public.midia_gravar_lote(jsonb) (20260924120000). Nada foi aplicado.';
  end if;
  if to_regprocedure('public.tem_papel(uuid, text)') is null
     or to_regprocedure('public.is_staff(uuid)') is null
     or public.org_padrao() is null then
    raise exception
      'DEPENDÊNCIA: falta tem_papel(uuid, text) ou is_staff(uuid), ou org_padrao() devolveu null. Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. O retrato diz de que plataforma é
-- ----------------------------------------------------------------------------
alter table public.midia_copiloto_diagnosticos
  add column if not exists plataforma text not null default 'google';

alter table public.midia_copiloto_diagnosticos
  drop constraint if exists midia_copiloto_diagnosticos_plataforma_valida;
alter table public.midia_copiloto_diagnosticos
  add constraint midia_copiloto_diagnosticos_plataforma_valida check (
    plataforma in ('google', 'meta'));

create index if not exists midia_copiloto_diagnosticos_plataforma_idx
  on public.midia_copiloto_diagnosticos (org_id, plataforma, recebido_em desc);

-- As regras do Meta. `ritmo_de_verba` serve às duas; as quatro novas são do
-- Meta, e achado do Meta não tem classe de termo de pesquisa.
alter table public.midia_copiloto_achados
  drop constraint if exists midia_copiloto_achados_regra_valida,
  drop constraint if exists midia_copiloto_achados_meta_sem_grupo;
alter table public.midia_copiloto_achados
  add constraint midia_copiloto_achados_regra_valida check (
    regra in ('termos_sem_conversao', 'ritmo_de_verba', 'anuncios_parados',
              'medicao', 'cliques_e_leads', 'qualidade',
              'meta_sem_lead', 'meta_custo_por_lead', 'meta_qualidade', 'meta_medicao')),
  add constraint midia_copiloto_achados_meta_sem_grupo check (
    grupo is null
    or regra not in ('meta_sem_lead', 'meta_custo_por_lead', 'meta_qualidade', 'meta_medicao'));


-- ----------------------------------------------------------------------------
-- 2. A ação diz de que plataforma é, e o Meta tem conjunto e anúncio
-- ----------------------------------------------------------------------------
alter table public.midia_copiloto_acoes
  add column if not exists plataforma          text not null default 'google',
  add column if not exists anuncio_id_externo  text,
  add column if not exists anuncio_nome        text;

alter table public.midia_copiloto_acoes
  drop constraint if exists midia_copiloto_acoes_tipo_valido,
  drop constraint if exists midia_copiloto_acoes_plataforma_valida,
  drop constraint if exists midia_copiloto_acoes_tipo_da_plataforma,
  drop constraint if exists midia_copiloto_acoes_ids_validos,
  drop constraint if exists midia_copiloto_acoes_alvo_do_tipo,
  drop constraint if exists midia_copiloto_acoes_origem_do_tipo;
alter table public.midia_copiloto_acoes
  add constraint midia_copiloto_acoes_tipo_valido check (
    tipo in ('negativar', 'remover_negativa', 'pausar_grupo', 'reativar_grupo', 'mudar_verba',
             'pausar_conjunto', 'reativar_conjunto', 'pausar_anuncio', 'reativar_anuncio')),
  add constraint midia_copiloto_acoes_plataforma_valida check (
    plataforma in ('google', 'meta')),
  -- Pela exclusão: ver o cabeçalho. Tipo desconhecido é da regra de tipo, e
  -- plataforma desconhecida, da regra de plataforma.
  add constraint midia_copiloto_acoes_tipo_da_plataforma check (
    case plataforma
      when 'google' then tipo not in ('pausar_conjunto', 'reativar_conjunto', 'pausar_anuncio', 'reativar_anuncio')
      when 'meta'   then tipo not in ('negativar', 'remover_negativa', 'pausar_grupo', 'reativar_grupo')
      else true
    end),
  add constraint midia_copiloto_acoes_ids_validos check (
        campanha_id_externo ~ '^[0-9]{1,20}$'
    and (grupo_id_externo is null or grupo_id_externo ~ '^[0-9]{1,20}$')
    and (anuncio_id_externo is null or anuncio_id_externo ~ '^[0-9]{1,20}$')
    and char_length(btrim(campanha_nome)) between 1 and 300
    and (anuncio_nome is null or char_length(btrim(anuncio_nome)) between 1 and 300)
    and char_length(chave) between 1 and 300),
  add constraint midia_copiloto_acoes_alvo_do_tipo check (
    case
      when tipo in ('negativar', 'remover_negativa') then
            texto is not null and correspondencia in ('exata', 'frase')
        and grupo_id_externo is null and verba_atual is null and verba_nova is null
        and anuncio_id_externo is null and anuncio_nome is null
      -- No Meta o "grupo" é o conjunto de anúncios.
      when tipo in ('pausar_grupo', 'reativar_grupo', 'pausar_conjunto', 'reativar_conjunto') then
            grupo_id_externo is not null and grupo_nome is not null
        and texto is null and correspondencia is null
        and verba_atual is null and verba_nova is null
        and anuncio_id_externo is null and anuncio_nome is null
      -- O anúncio leva o conjunto dele junto: é o contexto da frase.
      when tipo in ('pausar_anuncio', 'reativar_anuncio') then
            anuncio_id_externo is not null and anuncio_nome is not null
        and grupo_id_externo is not null and grupo_nome is not null
        and texto is null and correspondencia is null
        and verba_atual is null and verba_nova is null
      when tipo = 'mudar_verba' then
            verba_atual is not null and verba_nova is not null
        and grupo_id_externo is null and texto is null and correspondencia is null
        and anuncio_id_externo is null and anuncio_nome is null
      -- Tipo desconhecido é da regra de tipo, não desta.
      else true
    end),
  add constraint midia_copiloto_acoes_origem_do_tipo check (
    case
      when desfaz_acao_id is not null then
        diagnostico_id is null and achado_id is null and pedida_por is null
      when pedida_por is not null then
        diagnostico_id is null and achado_id is null and tipo = 'mudar_verba'
      else
        diagnostico_id is not null
        and tipo not in ('remover_negativa', 'reativar_grupo', 'reativar_conjunto', 'reativar_anuncio')
    end);

-- O painel e as duas reservas filtram por plataforma.
create index if not exists midia_copiloto_acoes_plataforma_idx
  on public.midia_copiloto_acoes (org_id, plataforma, situacao, proposta_em desc);


-- ----------------------------------------------------------------------------
-- 3. A frase da trilha — a mesma de `descreverAcao` em src/lib/copilotoDeMidia.ts
-- ----------------------------------------------------------------------------
create or replace function public.midia_copiloto_descrever(a public.midia_copiloto_acoes)
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select case a.tipo
    when 'negativar' then format('Negativar %s na campanha %s',
      case a.correspondencia when 'exata' then '[' || a.texto || ']' else '"' || a.texto || '"' end,
      a.campanha_nome)
    when 'remover_negativa' then format('Remover a negativa %s da campanha %s',
      case a.correspondencia when 'exata' then '[' || a.texto || ']' else '"' || a.texto || '"' end,
      a.campanha_nome)
    when 'pausar_grupo'      then format('Pausar o grupo %s (%s)', a.grupo_nome, a.campanha_nome)
    when 'reativar_grupo'    then format('Reativar o grupo %s (%s)', a.grupo_nome, a.campanha_nome)
    when 'pausar_conjunto'   then format('Pausar o conjunto %s (%s)', a.grupo_nome, a.campanha_nome)
    when 'reativar_conjunto' then format('Reativar o conjunto %s (%s)', a.grupo_nome, a.campanha_nome)
    when 'pausar_anuncio'    then format('Pausar o anúncio %s (%s · %s)', a.anuncio_nome, a.grupo_nome, a.campanha_nome)
    when 'reativar_anuncio'  then format('Reativar o anúncio %s (%s · %s)', a.anuncio_nome, a.grupo_nome, a.campanha_nome)
    when 'mudar_verba' then format('Verba de %s: R$ %s → R$ %s por dia', a.campanha_nome,
      replace(to_char(a.verba_atual, 'FM999999990.00'), '.', ','),
      replace(to_char(a.verba_nova,  'FM999999990.00'), '.', ','))
  end;
$$;

revoke all on function public.midia_copiloto_descrever(public.midia_copiloto_acoes) from public, anon;
grant execute on function public.midia_copiloto_descrever(public.midia_copiloto_acoes) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. O gatilho: o desfazer espelha plataforma e anúncio; eles não mudam
-- ----------------------------------------------------------------------------
create or replace function public.midia_copiloto_acoes_transicao()
  returns trigger
  language plpgsql
  set search_path = public
as $fn$
declare
  v_origem public.midia_copiloto_acoes;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ação do copiloto não se apaga: ela é o registro do que mudou na conta do %.',
      case old.plataforma when 'meta' then 'Meta Ads' else 'Google Ads' end
      using errcode = 'raise_exception';
  end if;

  if tg_op = 'INSERT' then
    -- O que vem do diagnóstico e o que uma pessoa pede nascem propostos: quem
    -- aprova é uma pessoa, pelo painel.
    if new.desfaz_acao_id is null then
      if new.situacao <> 'proposta' then
        raise exception 'Ação do copiloto nasce proposta (veio %): quem aprova é uma pessoa, pelo painel.', new.situacao
          using errcode = 'raise_exception';
      end if;
      return new;
    end if;

    -- O desfazer: nasce aprovado (quem clica é quem aprova) e espelha a ação
    -- aplicada — o inverso dela, no mesmo alvo e na mesma plataforma. É por
    -- aqui, e só por aqui, que uma negativa é removida e que um grupo, um
    -- conjunto ou um anúncio pausado pelo copiloto volta ao ar.
    if new.situacao <> 'aprovada' then
      raise exception 'O desfazer nasce aprovado (veio %).', new.situacao using errcode = 'raise_exception';
    end if;
    select * into v_origem from public.midia_copiloto_acoes where id = new.desfaz_acao_id;
    if not found or v_origem.situacao <> 'aplicada' or v_origem.org_id <> new.org_id then
      raise exception 'Só se desfaz ação aplicada da mesma loja.' using errcode = 'raise_exception';
    end if;
    if new.tipo is distinct from (case v_origem.tipo
                                    when 'negativar'         then 'remover_negativa'
                                    when 'remover_negativa'  then 'negativar'
                                    when 'pausar_grupo'      then 'reativar_grupo'
                                    when 'reativar_grupo'    then 'pausar_grupo'
                                    when 'pausar_conjunto'   then 'reativar_conjunto'
                                    when 'reativar_conjunto' then 'pausar_conjunto'
                                    when 'pausar_anuncio'    then 'reativar_anuncio'
                                    when 'reativar_anuncio'  then 'pausar_anuncio'
                                    when 'mudar_verba'       then 'mudar_verba'
                                  end)
       or new.plataforma          is distinct from v_origem.plataforma
       or new.campanha_id_externo is distinct from v_origem.campanha_id_externo
       or new.grupo_id_externo    is distinct from v_origem.grupo_id_externo
       or new.anuncio_id_externo  is distinct from v_origem.anuncio_id_externo
       or new.texto               is distinct from v_origem.texto
       or new.correspondencia     is distinct from v_origem.correspondencia
       or (v_origem.tipo = 'mudar_verba'
           and (new.verba_atual is distinct from v_origem.verba_nova
                or new.verba_nova is distinct from v_origem.verba_atual)) then
      raise exception 'O desfazer tem de ser o inverso exato da ação %.', v_origem.id using errcode = 'raise_exception';
    end if;
    return new;
  end if;

  -- UPDATE: o alvo, a plataforma, a origem e quem pediu não mudam depois de propostos.
  if (new.org_id, new.diagnostico_id, new.achado_id, new.desfaz_acao_id, new.chave, new.tipo,
      new.plataforma, new.campanha_id_externo, new.campanha_nome, new.grupo_id_externo, new.grupo_nome,
      new.anuncio_id_externo, new.anuncio_nome,
      new.texto, new.correspondencia, new.verba_atual, new.verba_nova, new.motivo,
      new.economia_7d, new.evidencias, new.proposta_em, new.pedida_por, new.pedida_por_nome)
     is distinct from
     (old.org_id, old.diagnostico_id, old.achado_id, old.desfaz_acao_id, old.chave, old.tipo,
      old.plataforma, old.campanha_id_externo, old.campanha_nome, old.grupo_id_externo, old.grupo_nome,
      old.anuncio_id_externo, old.anuncio_nome,
      old.texto, old.correspondencia, old.verba_atual, old.verba_nova, old.motivo,
      old.economia_7d, old.evidencias, old.proposta_em, old.pedida_por, old.pedida_por_nome) then
    raise exception 'O alvo de uma ação do copiloto não muda depois de proposto: o que foi aprovado é o que é aplicado.'
      using errcode = 'raise_exception';
  end if;

  if not ((old.situacao, new.situacao) in (
            ('proposta', 'aprovada'), ('proposta', 'recusada'), ('proposta', 'descartada'),
            ('aprovada', 'em_aplicacao'), ('aprovada', 'recusada'),
            ('em_aplicacao', 'em_aplicacao'),
            ('em_aplicacao', 'aplicada'), ('em_aplicacao', 'falhou'), ('em_aplicacao', 'sem_efeito'))) then
    raise exception 'Ação do copiloto não vai de % para %.', old.situacao, new.situacao
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$fn$;

create or replace trigger midia_copiloto_acoes_transicao
  before insert or update or delete on public.midia_copiloto_acoes
  for each row execute function public.midia_copiloto_acoes_transicao();

revoke all on function public.midia_copiloto_acoes_transicao() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. A gravação do retrato: cada plataforma só mexe no que é dela
-- ----------------------------------------------------------------------------
-- O corpo da 20261016200000 (seção 4), com a plataforma. Um retrato do Meta
-- NUNCA descarta proposta nem pedido do Google, e a janela de "não volta" de
-- uma plataforma não cala a outra.
create or replace function public.midia_copiloto_gravar_diagnostico(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org          uuid := public.org_padrao();
  v_plat         text;
  v_de           date;
  v_ate          date;
  v_janela       interval;
  v_diag         uuid;
  v_achados      uuid[] := '{}';
  v_id           uuid;
  x              jsonb;
  v_indice       integer;
  v_descartadas  integer := 0;
  v_propostas    integer := 0;
  v_puladas      integer := 0;
  v_ins          integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Diagnóstico precisa ser um objeto JSON.' using errcode = '22023';
  end if;
  -- Sem plataforma é o Google: o script da conta não manda o campo.
  v_plat := coalesce(nullif(btrim(p->>'plataforma'), ''), 'google');
  if v_plat not in ('google', 'meta') then
    raise exception 'Plataforma do diagnóstico é google ou meta (veio %).', v_plat using errcode = '22023';
  end if;
  begin
    v_de  := (p->>'de')::date;
    v_ate := (p->>'ate')::date;
  exception when others then
    raise exception 'Janela do diagnóstico inválida: % a %.', p->>'de', p->>'ate' using errcode = '22023';
  end;
  if v_de is null or v_ate is null then
    raise exception 'Diagnóstico sem janela.' using errcode = '22023';
  end if;
  v_janela := ((v_ate - v_de) + 1) * interval '1 day';

  insert into public.midia_copiloto_diagnosticos (org_id, plataforma, conta, de, ate, previa, dados, resumo, erros)
  values (v_org, v_plat, coalesce(nullif(btrim(p->>'conta'), ''), '?'), v_de, v_ate,
          coalesce((p->>'previa')::boolean, false),
          coalesce(p->'dados', '{}'::jsonb), coalesce(p->'resumo', '{}'::jsonb),
          coalesce(p->'erros', '{}'::jsonb))
  returning id into v_diag;

  for x, v_indice in
    select e, (n - 1)::int from jsonb_array_elements(coalesce(p->'achados', '[]'::jsonb)) with ordinality as t(e, n)
  loop
    insert into public.midia_copiloto_achados
      (org_id, diagnostico_id, ordem, regra, grupo, gravidade, titulo, detalhe, evidencias)
    values (v_org, v_diag, v_indice, x->>'regra', nullif(x->>'grupo', ''), x->>'gravidade',
            x->>'titulo', coalesce(x->>'detalhe', ''), coalesce(x->'evidencias', '{}'::jsonb))
    returning id into v_id;
    v_achados := v_achados || v_id;
  end loop;

  -- O que ninguém decidiu ainda tem os números de ontem: sai de cena — mas só
  -- o desta plataforma. A prévia ("Visualizar" no Google Ads) não tira nada de
  -- cena. O pedido de uma pessoa (sem diagnóstico) fica, a não ser que esteja
  -- parado há mais de uma janela: parado, ele seguraria para sempre o corte
  -- daquela campanha.
  if not coalesce((p->>'previa')::boolean, false) then
    update public.midia_copiloto_acoes
       set situacao = 'descartada',
           descartada_motivo = format('Substituída pelo diagnóstico de %s a %s.',
                                      to_char(v_de, 'DD/MM'), to_char(v_ate, 'DD/MM'))
     where org_id = v_org and plataforma = v_plat
       and situacao = 'proposta' and diagnostico_id is not null;
    get diagnostics v_descartadas = row_count;

    update public.midia_copiloto_acoes
       set situacao = 'descartada',
           descartada_motivo = format('Pedido sem decisão por %s dias; o diagnóstico volta a propor para a campanha.',
                                      floor(extract(epoch from (now() - proposta_em)) / 86400)::int)
     where org_id = v_org and plataforma = v_plat
       and situacao = 'proposta' and pedida_por is not null
       and proposta_em < now() - v_janela;
    get diagnostics v_ins = row_count;
    v_descartadas := v_descartadas + v_ins;
  end if;

  for x in select e from jsonb_array_elements(coalesce(p->'propostas', '[]'::jsonb)) as t(e) loop
    v_indice := (x->>'achado')::int;
    if v_indice is null or v_indice < 0 or v_indice >= coalesce(cardinality(v_achados), 0) then
      raise exception 'Proposta % aponta para o achado %, que não existe.', x->>'chave', x->>'achado'
        using errcode = '22023';
    end if;

    -- Aplicada, ou recusada, há menos de uma janela, NESTA plataforma: não
    -- volta. O pedido RECUSADO não conta — recusar o aumento de alguém não
    -- cala o diagnóstico; o pedido APLICADO conta.
    if exists (select 1 from public.midia_copiloto_acoes a
                where a.org_id = v_org and a.plataforma = v_plat and a.chave = x->>'chave'
                  and ((a.situacao in ('aplicada', 'sem_efeito') and a.concluida_em > now() - v_janela)
                       or (a.situacao = 'recusada' and a.pedida_por is null
                           and a.decidida_em > now() - v_janela))) then
      v_puladas := v_puladas + 1;
      continue;
    end if;

    -- `on conflict do nothing` SEM alvo: dois índices únicos podem recusar a
    -- proposta — a mesma chave aberta e outra mudança de verba aberta na
    -- campanha. Com alvo, o conflito no segundo derrubaria o retrato inteiro.
    insert into public.midia_copiloto_acoes
      (org_id, plataforma, diagnostico_id, achado_id, chave, tipo, campanha_id_externo, campanha_nome,
       grupo_id_externo, grupo_nome, anuncio_id_externo, anuncio_nome,
       texto, correspondencia, verba_atual, verba_nova,
       motivo, economia_7d, evidencias)
    values
      (v_org, v_plat, v_diag, v_achados[v_indice + 1], x->>'chave', x->>'tipo',
       x->>'campanha_id_externo', x->>'campanha_nome',
       nullif(x->>'grupo_id_externo', ''), nullif(x->>'grupo_nome', ''),
       nullif(x->>'anuncio_id_externo', ''), nullif(x->>'anuncio_nome', ''),
       nullif(x->>'texto', ''), nullif(x->>'correspondencia', ''),
       (x->>'verba_atual')::numeric, (x->>'verba_nova')::numeric,
       x->>'motivo', (x->>'economia_7d')::numeric, coalesce(x->'evidencias', '{}'::jsonb))
    on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then v_propostas := v_propostas + 1; else v_puladas := v_puladas + 1; end if;
  end loop;

  return jsonb_build_object(
    'diagnostico', v_diag,
    'plataforma', v_plat,
    'achados', coalesce(cardinality(v_achados), 0),
    'propostas', v_propostas,
    'puladas', v_puladas,
    'descartadas', v_descartadas);
end;
$fn$;

revoke all on function public.midia_copiloto_gravar_diagnostico(jsonb) from public, anon, authenticated;
grant execute on function public.midia_copiloto_gravar_diagnostico(jsonb) to service_role;


-- ----------------------------------------------------------------------------
-- 6. As reservas: o script do Google só recebe o Google; a rota do Meta, só o Meta
-- ----------------------------------------------------------------------------
-- 6a. O corpo da 20261014150000 (6b), restrito ao Google — o script não sabe
--     aplicar ação do Meta, e entregar-lhe uma seria uma falha na conta errada
--     — e com o lote escolhido uma vez só (ver o comentário no corpo).
create or replace function public.midia_copiloto_reservar_acoes(p_limite integer default 50)
returns setof public.midia_copiloto_acoes
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 50);
begin
  update public.midia_copiloto_acoes
     set situacao = 'falhou', concluida_em = now(),
         erro = 'O script recebeu a ação 3 vezes e não devolveu o resultado. Confira a conta antes de aprovar de novo.'
   where org_id = public.org_padrao()
     and plataforma = 'google'
     and situacao = 'em_aplicacao'
     and reservada_em < now() - interval '90 minutes'
     and tentativas >= 3;

  -- O lote é escolhido UMA vez (CTE materializado). Com `where id in (select
  -- ... limit n for update skip locked)`, o planejador pode reexecutar o
  -- subselect a cada linha: a já atualizada por este comando é pulada pelo
  -- FOR UPDATE, o LIMIT traz a seguinte, e o lote passa do limite.
  return query
    with lote as materialized (
      select id from public.midia_copiloto_acoes
       where org_id = public.org_padrao()
         and plataforma = 'google'
         and (situacao = 'aprovada'
              or (situacao = 'em_aplicacao' and reservada_em < now() - interval '90 minutes'))
       order by decidida_em, proposta_em, id
       limit v_lim
       for update skip locked)
    update public.midia_copiloto_acoes a
       set situacao = 'em_aplicacao', reservada_em = now(), tentativas = a.tentativas + 1
      from lote
     where a.id = lote.id
    returning a.*;
end;
$fn$;

-- 6b. O lote para a rota do Meta (Graph API): o aprovado do Meta, e o que foi
--     entregue e ficou sem resposta por 90 min (a rota confere o estado do
--     objeto antes de mexer, então aplicar de novo é inofensivo). Até 20 por
--     rodada: cada ação é uma chamada à Graph API, e o limite de chamadas é da
--     conta. Três entregas sem resposta viram falha, com o motivo escrito.
create or replace function public.midia_copiloto_reservar_acoes_meta(p_limite integer default 10)
returns setof public.midia_copiloto_acoes
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 10), 1), 20);
begin
  update public.midia_copiloto_acoes
     set situacao = 'falhou', concluida_em = now(),
         erro = 'O executor do Meta recebeu a ação 3 vezes e não devolveu o resultado. Confira a conta antes de aprovar de novo.'
   where org_id = public.org_padrao()
     and plataforma = 'meta'
     and situacao = 'em_aplicacao'
     and reservada_em < now() - interval '90 minutes'
     and tentativas >= 3;

  -- O lote é escolhido UMA vez (CTE materializado). Com `where id in (select
  -- ... limit n for update skip locked)`, o planejador pode reexecutar o
  -- subselect a cada linha: a já atualizada por este comando é pulada pelo
  -- FOR UPDATE, o LIMIT traz a seguinte, e o lote passa do limite.
  return query
    with lote as materialized (
      select id from public.midia_copiloto_acoes
       where org_id = public.org_padrao()
         and plataforma = 'meta'
         and (situacao = 'aprovada'
              or (situacao = 'em_aplicacao' and reservada_em < now() - interval '90 minutes'))
       order by decidida_em, proposta_em, id
       limit v_lim
       for update skip locked)
    update public.midia_copiloto_acoes a
       set situacao = 'em_aplicacao', reservada_em = now(), tentativas = a.tentativas + 1
      from lote
     where a.id = lote.id
    returning a.*;
end;
$fn$;

revoke all on function public.midia_copiloto_reservar_acoes(integer) from public, anon, authenticated;
revoke all on function public.midia_copiloto_reservar_acoes_meta(integer) from public, anon, authenticated;
grant execute on function public.midia_copiloto_reservar_acoes(integer) to service_role;
grant execute on function public.midia_copiloto_reservar_acoes_meta(integer) to service_role;


-- ----------------------------------------------------------------------------
-- 7. O resultado: a trilha diz quem aplicou
-- ----------------------------------------------------------------------------
-- O corpo da 20261014150000 (6c); só o autor da trilha muda com a plataforma.
create or replace function public.midia_copiloto_registrar_resultado(
  p_acao      uuid,
  p_situacao  text,
  p_lido      jsonb,
  p_erro      text
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a       public.midia_copiloto_acoes;
  v_erro  text := left(nullif(btrim(coalesce(p_erro, ''), E' \t\r\n'), ''), 500);
begin
  if p_situacao is null or p_situacao not in ('aplicada', 'falhou', 'sem_efeito') then
    raise exception 'Resultado do script é aplicada, falhou ou sem_efeito (veio %).', p_situacao
      using errcode = '22023';
  end if;
  if p_lido is not null and jsonb_typeof(p_lido) <> 'object' then
    raise exception 'O que o script leu de volta precisa ser um objeto JSON.' using errcode = '22023';
  end if;

  update public.midia_copiloto_acoes
     set situacao = p_situacao, concluida_em = now(),
         lido_de_volta = coalesce(p_lido, '{}'::jsonb),
         erro = case when p_situacao = 'falhou' then coalesce(v_erro, 'O script não disse por quê.') else v_erro end
   where id = p_acao and org_id = public.org_padrao() and situacao = 'em_aplicacao'
  returning * into a;
  if not found then
    return null;
  end if;

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values (case p_situacao when 'aplicada' then 'copiloto_aplicou'
                          when 'sem_efeito' then 'copiloto_ja_estava'
                          else 'copiloto_falhou' end,
          format('%s%s (ação %s)', public.midia_copiloto_descrever(a),
                 case when a.erro is null then '' else ' — ' || a.erro end, a.id),
          null,
          case a.plataforma when 'meta' then 'Copiloto (API do Meta)' else 'Script do Google Ads' end);
  return p_situacao;
end;
$fn$;

revoke all on function public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text) to service_role;


-- ----------------------------------------------------------------------------
-- 8. O pedido de verba: Google ou Meta, pela campanha
-- ----------------------------------------------------------------------------
-- O corpo da 20261016200000 (seção 5), com a plataforma lida da campanha.
create or replace function public.midia_copiloto_pedir_verba(
  p_campanha    text,
  p_verba_nova  numeric,
  p_motivo      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem        uuid := auth.uid();
  v_org         uuid := public.org_padrao();
  v_nome        text;
  v_motivo      text := nullif(btrim(coalesce(p_motivo, ''), E' \t\r\n'), '');
  v_chave       text;
  v_camp_nome   text;
  v_atual       numeric;
  v_situacao    text;
  v_plat        text;
  v_onde        text;
  v_achadas     integer;
  v_lida_em     timestamptz;
  v_lida_de     text := 'sincronizacao';
  v_aplicada_em timestamptz;
  v_lido        jsonb;
  v_aberta      public.midia_copiloto_acoes;
  v_nova        public.midia_copiloto_acoes;
begin
  if v_quem is null then
    raise exception 'Pedido de verba sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;
  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'marketing')) then
    raise exception 'Só Administrador ou Marketing pedem mudança de verba pelo copiloto (matriz A17, "Aprovar mudanças do Copiloto de Mídia").'
      using errcode = '42501';
  end if;
  if p_campanha is null or p_campanha !~ '^[0-9]{1,20}$' then
    raise exception 'A campanha é o ID numérico dela no Google Ads ou no Meta (veio %).', coalesce(p_campanha, 'nada')
      using errcode = '22023';
  end if;
  if p_verba_nova is null or p_verba_nova <= 0 or p_verba_nova > 100000
     or p_verba_nova <> round(p_verba_nova, 2) then
    raise exception 'Verba nova é por dia, acima de zero, até R$ 100.000 e com até 2 casas (veio %).',
      coalesce(p_verba_nova::text, 'nada')
      using errcode = '22023';
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'O motivo do pedido vai até 500 caracteres (veio com %).', char_length(v_motivo)
      using errcode = '22023';
  end if;

  -- A verba de hoje, o nome e a PLATAFORMA vêm da sincronização, nunca de
  -- quem pede. O ID é único por plataforma; nas duas ao mesmo tempo, o
  -- copiloto não adivinha qual.
  select count(*) into v_achadas
    from public.midia_campanhas
   where plataforma in ('google', 'meta') and id_externo = p_campanha;
  if v_achadas > 1 then
    raise exception 'O ID % é de uma campanha do Google Ads e de uma do Meta ao mesmo tempo; o copiloto não sabe qual mudar. Mude pelo gerenciador da plataforma.', p_campanha
      using errcode = '22023';
  end if;
  select nome, orcamento_diario, situacao, sincronizado_em, plataforma
    into v_camp_nome, v_atual, v_situacao, v_lida_em, v_plat
    from public.midia_campanhas
   where plataforma in ('google', 'meta') and id_externo = p_campanha;
  if not found or v_situacao = 'encerrada' then
    raise exception 'A campanha % não está entre as do Google Ads nem as do Meta sincronizadas, ou foi encerrada.', p_campanha
      using errcode = 'P0002';
  end if;
  v_onde := case v_plat when 'meta' then 'Gerenciador de Anúncios do Meta' else 'Google Ads' end;

  -- No Meta a verba diária mora na campanha (orçamento de campanha) OU nos
  -- conjuntos. Sem verba na campanha, não há o que o copiloto mude.
  if v_plat = 'meta' and v_atual is null then
    raise exception 'A verba desta campanha do Meta fica nos conjuntos de anúncios; o copiloto só muda a verba diária da campanha (orçamento de campanha). Mude pelo Gerenciador de Anúncios.'
      using errcode = '22023';
  end if;

  -- A sincronização roda ANTES de aplicar: por até uma hora depois de uma
  -- mudança aplicada, `midia_campanhas` mostra a verba de antes. Se a última
  -- mudança de verba APLICADA na campanha, nesta plataforma, é mais nova que a
  -- sincronização, vale o que foi lido de volta.
  select a.concluida_em, a.lido_de_volta
    into v_aplicada_em, v_lido
    from public.midia_copiloto_acoes a
   where a.org_id = v_org and a.plataforma = v_plat and a.campanha_id_externo = p_campanha
     and a.tipo = 'mudar_verba' and a.situacao = 'aplicada'
   order by a.concluida_em desc
   limit 1;
  if found and jsonb_typeof(v_lido->'verba') = 'number'
     and (v_lida_em is null or v_aplicada_em > v_lida_em) then
    v_atual   := round((v_lido->>'verba')::numeric, 2);
    v_lida_em := v_aplicada_em;
    v_lida_de := 'aplicacao';
  end if;

  if v_atual is null or v_atual <= 0 then
    raise exception 'A sincronização ainda não trouxe a verba desta campanha (%); espere a próxima rodada, de hora em hora.', p_campanha
      using errcode = '22023';
  end if;
  if v_atual > 100000 then
    raise exception 'A verba desta campanha (R$ % por dia) passa do teto que o copiloto conhece (R$ 100.000); mude pelo %.',
      replace(to_char(v_atual, 'FM999999990.00'), '.', ','), v_onde
      using errcode = '22023';
  end if;
  if p_verba_nova = v_atual then
    raise exception 'A verba já é essa: R$ % por dia.', replace(to_char(v_atual, 'FM999999990.00'), '.', ',')
      using errcode = '22023';
  end if;
  -- O teto do script do Google (`mudarVerba`), e o mesmo para o executor do
  -- Meta: acima de 10× a verba esperada, falhou.
  if p_verba_nova > v_atual * 10 then
    raise exception 'O copiloto sobe a verba até 10 vezes a de hoje: de R$ %, no máximo R$ % por dia. Acima disso, mude pelo %.',
      replace(to_char(v_atual, 'FM999999990.00'), '.', ','),
      replace(to_char(v_atual * 10, 'FM999999990.00'), '.', ','),
      v_onde
      using errcode = '22023';
  end if;
  v_camp_nome := left(coalesce(nullif(btrim(v_camp_nome), ''), 'Campanha ' || p_campanha), 300);

  select left(nullif(btrim(full_name), ''), 200) into v_nome from public.profiles where id = v_quem;
  v_chave := 'verba:' || p_campanha;

  -- A mudança de verba aberta da campanha, nesta loja e nesta plataforma, de
  -- QUALQUER chave (diagnóstico, outro pedido, desfazer), travada. Proposta
  -- sai de cena; aprovada ou em aplicação, o pedido espera.
  select * into v_aberta
    from public.midia_copiloto_acoes
   where org_id = v_org and plataforma = v_plat and campanha_id_externo = p_campanha
     and tipo = 'mudar_verba' and situacao in ('proposta', 'aprovada', 'em_aplicacao')
   for update;
  if found then
    if v_aberta.situacao = 'aprovada' and v_aberta.desfaz_acao_id is not null then
      raise exception 'Há um desfazer de verba aprovado para esta campanha esperando o script; desista dele ou espere a rodada.'
        using errcode = '22023';
    elsif v_aberta.situacao = 'aprovada' then
      raise exception 'Já há uma mudança de verba aprovada para esta campanha esperando o script; desista dela ou espere a rodada.'
        using errcode = '22023';
    elsif v_aberta.situacao = 'em_aplicacao' then
      raise exception 'O script já está aplicando uma mudança de verba nesta campanha; espere o resultado da rodada.'
        using errcode = '22023';
    end if;
    update public.midia_copiloto_acoes
       set situacao = 'descartada',
           descartada_motivo = left(format('Substituída pelo pedido de %s.', coalesce(v_nome, 'alguém da equipe')), 300)
     where id = v_aberta.id;
  end if;

  begin
    insert into public.midia_copiloto_acoes
      (org_id, plataforma, chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova,
       motivo, evidencias, situacao, pedida_por, pedida_por_nome)
    values
      (v_org, v_plat, v_chave, 'mudar_verba', p_campanha, v_camp_nome, v_atual, p_verba_nova,
       left('Pedido de ' || coalesce(v_nome, 'alguém da equipe') || coalesce(': ' || v_motivo, '.'), 1000),
       jsonb_build_object('origem', 'pedido', 'verbaLidaDe', v_lida_de, 'verbaLidaEm', v_lida_em),
       'proposta', v_quem, v_nome)
    returning * into v_nova;
  exception when unique_violation then
    -- Dois pedidos (ou um pedido e o retrato, ou um desfazer) ao mesmo tempo:
    -- o outro entrou primeiro.
    raise exception 'Outra mudança de verba para esta campanha acabou de entrar; recarregue e confira antes de pedir de novo.'
      using errcode = '22023';
  end;

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values ('copiloto_pediu',
          format('Pedido: %s (ação %s)', public.midia_copiloto_descrever(v_nova), v_nova.id),
          v_quem, v_nome);

  return v_nova.id;
end;
$fn$;

revoke all on function public.midia_copiloto_pedir_verba(text, numeric, text) from public, anon;
grant execute on function public.midia_copiloto_pedir_verba(text, numeric, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 9. Desfazer: o inverso na mesma plataforma, no mesmo anúncio
-- ----------------------------------------------------------------------------
-- O corpo da 20261016200000 (seção 6), com plataforma e anúncio copiados e o
-- mapa de inverso do Meta.
create or replace function public.midia_copiloto_desfazer(p_acao uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem    uuid := auth.uid();
  v_nome    text;
  v_id      uuid;
  a         public.midia_copiloto_acoes;
  v_aberta  public.midia_copiloto_acoes;
begin
  if v_quem is null then
    raise exception 'Desfazer sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;
  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'marketing')) then
    raise exception 'Só Administrador ou Marketing desfazem mudanças do copiloto (matriz A17).'
      using errcode = '42501';
  end if;
  select * into a from public.midia_copiloto_acoes
   where id = p_acao and org_id = public.org_padrao()
   for update;
  if not found then
    raise exception 'Ação % não encontrada.', p_acao using errcode = 'P0002';
  end if;
  if a.situacao <> 'aplicada' then
    raise exception 'Só se desfaz o que foi aplicado (esta está %).', a.situacao using errcode = '22023';
  end if;
  if exists (select 1 from public.midia_copiloto_acoes
              where desfaz_acao_id = a.id
                and situacao in ('aprovada', 'em_aplicacao', 'aplicada', 'sem_efeito')) then
    raise exception 'Esta ação já foi desfeita (ou o desfazer está a caminho).' using errcode = '22023';
  end if;
  select nullif(btrim(full_name), '') into v_nome from public.profiles where id = v_quem;

  -- Verba: uma mudança aberta por campanha (`midia_copiloto_acoes_uma_verba_aberta`),
  -- olhando a mesma plataforma.
  if a.tipo = 'mudar_verba' then
    select * into v_aberta
      from public.midia_copiloto_acoes
     where org_id = a.org_id and plataforma = a.plataforma
       and campanha_id_externo = a.campanha_id_externo and tipo = 'mudar_verba'
       and situacao in ('proposta', 'aprovada', 'em_aplicacao')
     for update;
    if found then
      if v_aberta.situacao = 'aprovada' then
        raise exception 'Já há uma mudança de verba aprovada para esta campanha esperando o script; desista dela ou espere a rodada antes de desfazer.'
          using errcode = '22023';
      elsif v_aberta.situacao = 'em_aplicacao' then
        raise exception 'O script já está aplicando uma mudança de verba nesta campanha; espere o resultado da rodada antes de desfazer.'
          using errcode = '22023';
      end if;
      update public.midia_copiloto_acoes
         set situacao = 'descartada',
             descartada_motivo = left(format('Substituída pelo desfazer de %s.', coalesce(v_nome, 'alguém da equipe')), 300)
       where id = v_aberta.id;
    end if;
  end if;

  begin
    insert into public.midia_copiloto_acoes
      (org_id, plataforma, desfaz_acao_id, chave, tipo, campanha_id_externo, campanha_nome,
       grupo_id_externo, grupo_nome, anuncio_id_externo, anuncio_nome,
       texto, correspondencia, verba_atual, verba_nova,
       motivo, situacao, decidida_por, decidida_por_nome, decidida_em)
    values
      (a.org_id, a.plataforma, a.id, 'desfazer:' || a.id,
       case a.tipo
         when 'negativar'         then 'remover_negativa'
         when 'remover_negativa'  then 'negativar'
         when 'pausar_grupo'      then 'reativar_grupo'
         when 'reativar_grupo'    then 'pausar_grupo'
         when 'pausar_conjunto'   then 'reativar_conjunto'
         when 'reativar_conjunto' then 'pausar_conjunto'
         when 'pausar_anuncio'    then 'reativar_anuncio'
         when 'reativar_anuncio'  then 'pausar_anuncio'
         when 'mudar_verba'       then 'mudar_verba'
       end,
       a.campanha_id_externo, a.campanha_nome, a.grupo_id_externo, a.grupo_nome,
       a.anuncio_id_externo, a.anuncio_nome,
       a.texto, a.correspondencia,
       case when a.tipo = 'mudar_verba' then a.verba_nova end,
       case when a.tipo = 'mudar_verba' then a.verba_atual end,
       left('Desfaz: ' || public.midia_copiloto_descrever(a), 1000),
       'aprovada', v_quem, v_nome, now())
    returning id into v_id;
  exception when unique_violation then
    -- Outro desfazer da mesma ação, ou outra mudança de verba da campanha,
    -- entrou ao mesmo tempo.
    raise exception 'Outra mudança para este alvo acabou de entrar; recarregue e confira antes de desfazer.'
      using errcode = '22023';
  end;

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values ('copiloto_desfez', format('Desfazer: %s (ação %s → %s)', public.midia_copiloto_descrever(a), a.id, v_id),
          v_quem, v_nome);
  return v_id;
end;
$fn$;

revoke all on function public.midia_copiloto_desfazer(uuid) from public, anon;
grant execute on function public.midia_copiloto_desfazer(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 10. Anúncios do Meta com conjunto e situação
-- ----------------------------------------------------------------------------
alter table public.midia_anuncios
  add column if not exists conjunto_id_externo text,
  add column if not exists conjunto_nome       text,
  add column if not exists situacao            text,
  add column if not exists conjunto_situacao   text;

alter table public.midia_anuncios
  drop constraint if exists midia_anuncios_conjunto_id_valido,
  drop constraint if exists midia_anuncios_situacoes_validas;
alter table public.midia_anuncios
  add constraint midia_anuncios_conjunto_id_valido check (
    conjunto_id_externo is null or conjunto_id_externo ~ '^[0-9]{1,20}$'),
  add constraint midia_anuncios_situacoes_validas check (
        (situacao is null or situacao in ('no_ar', 'pausada', 'planejada', 'encerrada'))
    and (conjunto_situacao is null or conjunto_situacao in ('no_ar', 'pausada', 'planejada', 'encerrada')));

-- O corpo da 20260924120000, com uma mudança: o anúncio grava também o
-- conjunto e as situações quando vêm no JSON (`loteParaBanco` em
-- src/lib/midiaSync.ts só os põe quando a lista `/ads` do Meta os trouxe).
-- O que não veio fica como estava — o lote do Google, que não os manda, não
-- apaga nada.
create or replace function public.midia_gravar_lote(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plat   text := p->>'plataforma';
  v_de     date := (p->>'de')::date;
  v_ate    date := (p->>'ate')::date;
  c        jsonb;
  a        jsonb;
  v_camp   uuid;
  v_n_camp int := 0;
  v_n_dias int := 0;
  v_fora   int;
  v_ins    int;
begin
  if v_plat is null or v_plat not in ('meta', 'google') then
    raise exception 'plataforma inválida: %', v_plat using errcode = 'invalid_parameter_value';
  end if;
  if v_de is null or v_ate is null or v_de > v_ate then
    raise exception 'janela inválida: % a %', v_de, v_ate using errcode = 'invalid_parameter_value';
  end if;

  for c in select * from jsonb_array_elements(coalesce(p->'campanhas', '[]'::jsonb)) loop
    -- Dia fora da janela seria gravado sem que a janela o apagasse antes:
    -- a segunda rodada duplicaria. Recusa o lote inteiro (a transação volta).
    select count(*) into v_fora
      from jsonb_array_elements(coalesce(c->'dias', '[]'::jsonb)) d
     where (d->>'dia')::date not between v_de and v_ate;
    if v_fora > 0 then
      raise exception 'campanha %: % dia(s) fora da janela % a %', c->>'id_externo', v_fora, v_de, v_ate
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.midia_campanhas as m
      (nome, plataforma, origem, id_externo, objetivo, orcamento_diario, situacao,
       no_ar_desde, alcance_total, sincronizado_em)
    values
      (c->>'nome', v_plat, v_plat, c->>'id_externo', c->>'objetivo',
       (c->>'orcamento_diario')::numeric, c->>'situacao',
       (c->>'no_ar_desde')::timestamptz, (c->>'alcance_total')::integer, now())
    on conflict (plataforma, id_externo) do update set
      nome             = excluded.nome,
      objetivo         = coalesce(excluded.objetivo, m.objetivo),
      orcamento_diario = excluded.orcamento_diario,
      situacao         = excluded.situacao,
      no_ar_desde      = coalesce(excluded.no_ar_desde, m.no_ar_desde),
      alcance_total    = coalesce(excluded.alcance_total, m.alcance_total),
      sincronizado_em  = now()
    returning m.id into v_camp;

    for a in select * from jsonb_array_elements(coalesce(c->'anuncios', '[]'::jsonb)) loop
      insert into public.midia_anuncios as an
        (campanha_id, id_externo, nome, conjunto_id_externo, conjunto_nome, situacao, conjunto_situacao)
      values (v_camp, a->>'id_externo', a->>'nome',
              nullif(a->>'conjunto_id_externo', ''), nullif(a->>'conjunto_nome', ''),
              nullif(a->>'situacao', ''), nullif(a->>'conjunto_situacao', ''))
      on conflict (campanha_id, id_externo) do update set
        nome                = excluded.nome,
        conjunto_id_externo = coalesce(excluded.conjunto_id_externo, an.conjunto_id_externo),
        conjunto_nome       = coalesce(excluded.conjunto_nome, an.conjunto_nome),
        situacao            = coalesce(excluded.situacao, an.situacao),
        conjunto_situacao   = coalesce(excluded.conjunto_situacao, an.conjunto_situacao);
    end loop;

    delete from public.midia_diario
     where campanha_id = v_camp and dia between v_de and v_ate;

    insert into public.midia_diario
      (campanha_id, anuncio_id, dia, investido, impressoes, cliques, conversoes)
    select v_camp,
           an.id,
           (d->>'dia')::date,
           coalesce((d->>'investido')::numeric, 0),
           coalesce((d->>'impressoes')::integer, 0),
           coalesce((d->>'cliques')::integer, 0),
           coalesce((d->>'conversoes')::numeric, 0)
      from jsonb_array_elements(coalesce(c->'dias', '[]'::jsonb)) d
      left join public.midia_anuncios an
        on an.campanha_id = v_camp and an.id_externo = d->>'anuncio_id_externo';
    get diagnostics v_ins = row_count;

    -- O Google não informa o início: vale o primeiro dia com impressão.
    update public.midia_campanhas
       set no_ar_desde = (
             select min(dia)::timestamptz from public.midia_diario
              where campanha_id = v_camp and impressoes > 0)
     where id = v_camp and no_ar_desde is null;

    v_n_camp := v_n_camp + 1;
    v_n_dias := v_n_dias + v_ins;
  end loop;

  return jsonb_build_object('campanhas', v_n_camp, 'dias', v_n_dias);
end;
$$;

revoke all on function public.midia_gravar_lote(jsonb) from public, anon, authenticated;
grant execute on function public.midia_gravar_lote(jsonb) to service_role;


-- ----------------------------------------------------------------------------
-- 11. midia_anuncios e midia_diario: o sincronizado é da sincronização
-- ----------------------------------------------------------------------------
-- As duas alimentam o diagnóstico do Meta: o nome, o conjunto e a situação do
-- anúncio vêm de `midia_anuncios`; o gasto do dia, de `midia_diario`. A forma
-- é a da 20261016200000 (seção 7) em `midia_campanhas`. Quem grava as duas é a
-- chave de serviço (`midia_gravar_lote`, executável só por ela), com
-- BYPASSRLS: nenhuma policy a atinge.
--
-- `midia_anuncios`: staff LÊ todos; a sessão inclui, edita e exclui só o
-- anúncio de campanha MANUAL (digitada no painel), e o WITH CHECK repete o
-- predicado — o anúncio manual não é levado para uma campanha sincronizada. A
-- tabela não tem origem própria: a origem é a da campanha.
drop policy if exists midia_anuncios_autenticados on public.midia_anuncios;
drop policy if exists midia_anuncios_leitura on public.midia_anuncios;
drop policy if exists midia_anuncios_manual_inclusao on public.midia_anuncios;
drop policy if exists midia_anuncios_manual_edicao on public.midia_anuncios;
drop policy if exists midia_anuncios_manual_exclusao on public.midia_anuncios;

create policy midia_anuncios_leitura on public.midia_anuncios
  for select to authenticated
  using (public.is_staff(auth.uid()));
create policy midia_anuncios_manual_inclusao on public.midia_anuncios
  for insert to authenticated
  with check (public.is_staff(auth.uid())
              and exists (select 1 from public.midia_campanhas c
                           where c.id = midia_anuncios.campanha_id and c.origem = 'manual'));
create policy midia_anuncios_manual_edicao on public.midia_anuncios
  for update to authenticated
  using (public.is_staff(auth.uid())
         and exists (select 1 from public.midia_campanhas c
                      where c.id = midia_anuncios.campanha_id and c.origem = 'manual'))
  with check (public.is_staff(auth.uid())
              and exists (select 1 from public.midia_campanhas c
                           where c.id = midia_anuncios.campanha_id and c.origem = 'manual'));
create policy midia_anuncios_manual_exclusao on public.midia_anuncios
  for delete to authenticated
  using (public.is_staff(auth.uid())
         and exists (select 1 from public.midia_campanhas c
                      where c.id = midia_anuncios.campanha_id and c.origem = 'manual'));

-- `midia_diario`: staff LÊ (antes, qualquer conta logada — cliente inclusive);
-- a sessão não escreve. Ela nunca teve policy de escrita: o desempenho é "escrito
-- só por midia_gravar_lote" (comentário da tabela, 20260924120000), e a
-- digitação manual mora em `midia_leituras`. Abrir escrita na campanha manual
-- seria ALARGAR o que a sessão faz hoje; fica só a leitura, e o privilégio de
-- escrita sai junto.
drop policy if exists midia_diario_leitura on public.midia_diario;
create policy midia_diario_leitura on public.midia_diario
  for select to authenticated
  using (public.is_staff(auth.uid()));

-- O que sobra para cada papel, dito inteiro: `revoke all` leva TRUNCATE (que
-- passa por cima da RLS), REFERENCES, TRIGGER e, no Postgres 17 da produção,
-- MAINTAIN (LOCK TABLE travaria a sincronização). anon não lia nada (as
-- policies são de authenticated) e deixa de ter o privilégio. A chave de
-- serviço não muda.
revoke all on public.midia_anuncios, public.midia_diario from anon, authenticated;
grant select, insert, update, delete on public.midia_anuncios to authenticated;
grant select on public.midia_diario to authenticated;


-- ----------------------------------------------------------------------------
-- 12. As regras do Meta, como dado com vigência
-- ----------------------------------------------------------------------------
-- Os limiares do diagnóstico do Meta moram em `midia_copiloto_parametros`, ao
-- lado dos do Google: regra em tabela, com vigência (D-T1.7) e trilha. O
-- `add column ... default` dá o padrão à linha vigente SEM UPDATE (o guarda
-- `nucleo_so_encerra_vigencia` não dispara) — e também às já encerradas, que
-- não conheciam o Meta: lá o número é o padrão, não uma decisão de alguém.
alter table public.midia_copiloto_parametros
  add column if not exists meta_gasto_minimo_conjunto  numeric(10, 2) not null default 100,
  add column if not exists meta_gasto_minimo_campanha  numeric(10, 2) not null default 200,
  add column if not exists meta_vezes_sem_lead         numeric(4, 2)  not null default 2.5,
  add column if not exists meta_vezes_custo_caro       numeric(4, 2)  not null default 2,
  add column if not exists meta_leads_maduros_minimos  smallint       not null default 8,
  add column if not exists meta_dias_para_amadurecer   smallint       not null default 7;

alter table public.midia_copiloto_parametros
  drop constraint if exists midia_copiloto_parametros_meta_validos;
alter table public.midia_copiloto_parametros
  add constraint midia_copiloto_parametros_meta_validos check (
        meta_gasto_minimo_conjunto > 0 and meta_gasto_minimo_conjunto <= 100000
    and meta_gasto_minimo_campanha > 0 and meta_gasto_minimo_campanha <= 100000
    and meta_vezes_sem_lead between 1 and 10
    and meta_vezes_custo_caro > 1 and meta_vezes_custo_caro <= 10
    and meta_leads_maduros_minimos between 1 and 500
    -- A janela de qualidade é de 30 dias: amadurecer em 30 ou mais não deixa lead nenhum.
    and meta_dias_para_amadurecer between 1 and 29);

-- A porta das regras ganha os seis do Meta NO FIM, todos `default null`: o
-- nulo copia o valor da vigente que está sendo encerrada (sem vigente, o
-- padrão da coluna, lido do catálogo — o número mora num lugar só). Assim o
-- site de hoje, que chama com os 15 argumentos nomeados, segue salvando
-- regras entre esta migração e o deploy, sem apagar o que o Meta já tem. A
-- de 15 argumentos SAI: as duas juntas deixariam o PostgREST ambíguo
-- (PGRST203) para a chamada de 15. O resto do corpo é o da 20261014150000 (5a).
drop function if exists public.midia_copiloto_nova_vigencia(
  numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text[], text[], text[], integer);

create or replace function public.midia_copiloto_nova_vigencia(
  p_gasto_minimo_termo          numeric,
  p_gasto_minimo_grupo          numeric,
  p_gasto_minimo_campanha       numeric,
  p_ritmo_alto_pct              integer,
  p_ritmo_baixo_pct             integer,
  p_reducao_verba_pct           integer,
  p_iq_baixo                    integer,
  p_leads_gclid_minimos         integer,
  p_cliques_minimos_gclid       integer,
  p_perda_por_verba_pct         integer,
  p_perda_por_ranking_pct       integer,
  p_concorrentes                text[],
  p_cidades_fora                text[],
  p_palavras_informativas       text[],
  p_hora_do_diagnostico         integer,
  p_meta_gasto_minimo_conjunto  numeric default null,
  p_meta_gasto_minimo_campanha  numeric default null,
  p_meta_vezes_sem_lead         numeric default null,
  p_meta_vezes_custo_caro       numeric default null,
  p_meta_leads_maduros_minimos  integer default null,
  p_meta_dias_para_amadurecer   integer default null
)
returns public.midia_copiloto_parametros
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem     uuid := auth.uid();
  v_nome     text;
  v_vigente  public.midia_copiloto_parametros;
  v_base     jsonb;
  v_sql      text;
  v_nova     public.midia_copiloto_parametros;
begin
  if v_quem is null then
    raise exception 'Regras do copiloto sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;
  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'marketing')) then
    raise exception 'Só Administrador ou Marketing mudam as regras do copiloto (matriz A17, "Aprovar mudanças do Copiloto de Mídia").'
      using errcode = '42501';
  end if;
  select nullif(btrim(full_name), '') into v_nome from public.profiles where id = v_quem;

  -- Trava a vigente: duas edições ao mesmo tempo não abrem duas vigências.
  select * into v_vigente
    from public.midia_copiloto_parametros
   where org_id = public.org_padrao() and vigencia_ate is null
   for update;
  if found then
    -- O que não veio (os do Meta, na chamada de 15) é o que vigia.
    v_base := to_jsonb(v_vigente);
    update public.midia_copiloto_parametros set vigencia_ate = current_date where id = v_vigente.id;
  else
    -- Sem vigente: o padrão de cada coluna do Meta, como o catálogo o guarda.
    select 'select jsonb_build_object(' || string_agg(format('%L, %s', a.attname, pg_get_expr(d.adbin, d.adrelid)), ', ') || ')'
      into v_sql
      from pg_attribute a
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'public.midia_copiloto_parametros'::regclass
       and a.attname like 'meta\_%' and not a.attisdropped;
    if v_sql is not null then
      execute v_sql into v_base;
    end if;
  end if;
  v_base := coalesce(v_base, '{}'::jsonb);

  -- As listas: minúsculas, aparadas, sem vazio e sem repetido, na ordem em que
  -- vieram. O que sobrar fora da régua (1 caractere, mais de 60) o CHECK recusa.
  insert into public.midia_copiloto_parametros
    (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha,
     ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo,
     leads_gclid_minimos, cliques_minimos_gclid, perda_por_verba_pct, perda_por_ranking_pct,
     concorrentes, cidades_fora, palavras_informativas, hora_do_diagnostico,
     meta_gasto_minimo_conjunto, meta_gasto_minimo_campanha, meta_vezes_sem_lead,
     meta_vezes_custo_caro, meta_leads_maduros_minimos, meta_dias_para_amadurecer,
     criado_por, criado_por_nome, vigencia_desde)
  select p_gasto_minimo_termo, p_gasto_minimo_grupo, p_gasto_minimo_campanha,
         p_ritmo_alto_pct, p_ritmo_baixo_pct, p_reducao_verba_pct, p_iq_baixo,
         p_leads_gclid_minimos, p_cliques_minimos_gclid, p_perda_por_verba_pct, p_perda_por_ranking_pct,
         l.concorrentes, l.cidades_fora, l.palavras_informativas, p_hora_do_diagnostico,
         coalesce(p_meta_gasto_minimo_conjunto, (v_base->>'meta_gasto_minimo_conjunto')::numeric),
         coalesce(p_meta_gasto_minimo_campanha, (v_base->>'meta_gasto_minimo_campanha')::numeric),
         coalesce(p_meta_vezes_sem_lead,        (v_base->>'meta_vezes_sem_lead')::numeric),
         coalesce(p_meta_vezes_custo_caro,      (v_base->>'meta_vezes_custo_caro')::numeric),
         coalesce(p_meta_leads_maduros_minimos, (v_base->>'meta_leads_maduros_minimos')::integer),
         coalesce(p_meta_dias_para_amadurecer,  (v_base->>'meta_dias_para_amadurecer')::integer),
         v_quem, v_nome, current_date
    from (select
            (select coalesce(array_agg(x order by n), '{}') from (
               select lower(btrim(x, E' \t\r\n')) as x, min(n) as n
                 from unnest(p_concorrentes) with ordinality as u(x, n)
                where btrim(coalesce(x, ''), E' \t\r\n') <> ''
                group by 1) s) as concorrentes,
            (select coalesce(array_agg(x order by n), '{}') from (
               select lower(btrim(x, E' \t\r\n')) as x, min(n) as n
                 from unnest(p_cidades_fora) with ordinality as u(x, n)
                where btrim(coalesce(x, ''), E' \t\r\n') <> ''
                group by 1) s) as cidades_fora,
            (select coalesce(array_agg(x order by n), '{}') from (
               select lower(btrim(x, E' \t\r\n')) as x, min(n) as n
                 from unnest(p_palavras_informativas) with ordinality as u(x, n)
                where btrim(coalesce(x, ''), E' \t\r\n') <> ''
                group by 1) s) as palavras_informativas) l
  returning * into v_nova;

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values ('copiloto_regras',
          format('Regras do Copiloto de Mídia: termo %s, grupo %s, campanha %s; ritmo %s–%s%%; corte %s%%; IQ ≤ %s; medição: %s lead(s) com gclid, %s cliques; perda por verba %s%%, por classificação %s%%; %s concorrente(s), %s cidade(s), %s palavra(s) informativa(s); diagnóstico às %sh; Meta: gasto mínimo %s no conjunto e %s na campanha em 14 dias, sem lead a partir de %s× o custo por lead, caro a partir de %s×, qualidade com %s lead(s) maduro(s) de %s dia(s)',
                 v_nova.gasto_minimo_termo, v_nova.gasto_minimo_grupo, v_nova.gasto_minimo_campanha,
                 v_nova.ritmo_baixo_pct, v_nova.ritmo_alto_pct, v_nova.reducao_verba_pct, v_nova.iq_baixo,
                 v_nova.leads_gclid_minimos, v_nova.cliques_minimos_gclid,
                 v_nova.perda_por_verba_pct, v_nova.perda_por_ranking_pct,
                 cardinality(v_nova.concorrentes), cardinality(v_nova.cidades_fora),
                 cardinality(v_nova.palavras_informativas), v_nova.hora_do_diagnostico,
                 v_nova.meta_gasto_minimo_conjunto, v_nova.meta_gasto_minimo_campanha,
                 v_nova.meta_vezes_sem_lead, v_nova.meta_vezes_custo_caro,
                 v_nova.meta_leads_maduros_minimos, v_nova.meta_dias_para_amadurecer),
          v_quem, v_nome);

  return v_nova;
end;
$fn$;

revoke all on function public.midia_copiloto_nova_vigencia(
  numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text[], text[], text[], integer,
  numeric, numeric, numeric, numeric, integer, integer)
  from public, anon;
grant execute on function public.midia_copiloto_nova_vigencia(
  numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text[], text[], text[], integer,
  numeric, numeric, numeric, numeric, integer, integer)
  to authenticated;


-- ----------------------------------------------------------------------------
-- 13. Para quem abrir o banco sem abrir o código
-- ----------------------------------------------------------------------------
comment on table public.midia_copiloto_diagnosticos is
  'Um retrato por dia de uma conta de anúncios: do Google Ads (mandado pelo '
  'script da conta) ou do Meta Ads (lido pela rota do servidor na Graph API) — '
  'a coluna plataforma diz qual. Os dados lidos (dados), o resumo calculado com '
  'o cruzamento de leads (resumo) e as seções que a plataforma não deixou ler '
  '(erros). Append-only. Escrito só por midia_copiloto_gravar_diagnostico.';
comment on column public.midia_copiloto_diagnosticos.plataforma is
  'google ou meta. O retrato de uma plataforma só descarta e só segura as '
  'propostas da mesma plataforma. Ver 20261017150000.';
comment on table public.midia_copiloto_achados is
  'O que as regras do copiloto acharam em cada retrato (src/lib/copilotoDeMidia.ts): '
  'regra (seis do Google; quatro do Meta, prefixadas meta_; ritmo_de_verba nas '
  'duas), classe do termo (só no Google), gravidade, texto e evidência. Append-only.';
comment on table public.midia_copiloto_acoes is
  'Propostas e ações do Copiloto de Mídia no Google Ads (negativar, remover '
  'negativa só como desfazer, pausar e reativar grupo, mudar verba) e no Meta Ads '
  '(pausar conjunto, pausar anúncio, reativar os dois só como desfazer, mudar a '
  'verba da campanha). Três origens, uma por linha: o diagnóstico diário (verba só '
  'diminui), o pedido de verba de uma pessoa (midia_copiloto_pedir_verba; sobe '
  'até 10×) e o desfazer de uma ação aplicada. Nasce proposta (o desfazer, '
  'aprovado); Administrador ou Marketing aprova (midia_copiloto_decidir, com '
  'trilha em auditoria_admin); quem aplica é o script do Google '
  '(midia_copiloto_reservar_acoes) ou a rota do Meta '
  '(midia_copiloto_reservar_acoes_meta) — cada um só recebe a sua plataforma —, '
  'que lê de volta e registra. Uma mudança de verba aberta por campanha. O alvo '
  'e a plataforma não mudam depois de propostos, as situações só andam para a '
  'frente e nada se apaga (gatilho midia_copiloto_acoes_transicao). Ver '
  '20261014150000, 20261016200000 e 20261017150000.';
comment on column public.midia_copiloto_acoes.plataforma is
  'google ou meta: de que conta é a ação, e quem a aplica (o script do Google ou '
  'a rota do Meta). Cada tipo é de uma plataforma, menos mudar_verba '
  '(midia_copiloto_acoes_tipo_da_plataforma). Não muda depois de proposta.';
comment on column public.midia_copiloto_acoes.grupo_id_externo is
  'No Google, o grupo de anúncios; no Meta, o conjunto de anúncios (ad set) — o '
  'alvo de pausar/reativar conjunto, e o conjunto do anúncio nos tipos de anúncio.';
comment on column public.midia_copiloto_acoes.grupo_nome is
  'O nome do grupo (Google) ou do conjunto de anúncios (Meta), para a frase.';
comment on column public.midia_copiloto_acoes.anuncio_id_externo is
  'O ID do anúncio no Meta (objeto do Graph). Só em pausar_anuncio e '
  'reativar_anuncio; nulo em todo o resto (midia_copiloto_acoes_alvo_do_tipo).';
comment on column public.midia_copiloto_acoes.anuncio_nome is
  'O nome do anúncio do Meta na hora da proposta, para a frase e a trilha. Só nos '
  'tipos de anúncio.';
comment on column public.midia_copiloto_acoes.chave is
  'Identidade do alvo (ex.: negativar:<campanha>:exata:<texto>, verba:<campanha>; '
  'no Meta, meta:pausar_anuncio:<anúncio>, meta:pausar_conjunto:<conjunto>). Uma '
  'aberta por chave — o pedido de verba e o diagnóstico dividem verba:<campanha>, '
  'e os IDs de campanha do Google e do Meta não colidem. Aplicada, ou recusada, '
  'há menos de uma janela não volta pelo diagnóstico da mesma plataforma; pedido '
  'recusado não conta.';
comment on index public.midia_copiloto_acoes_chave_aberta is
  'Uma ação aberta (proposta, aprovada, em aplicação) por loja e chave. Vale para '
  'as duas plataformas: as chaves do Meta são prefixadas meta:, e a de verba usa o '
  'ID da campanha, que não colide entre Google e Meta. Ver 20261017150000.';
comment on index public.midia_copiloto_acoes_uma_verba_aberta is
  'Uma mudança de verba aberta (proposta, aprovada, em aplicação) por loja e '
  'campanha, de qualquer origem. Duas abertas = quem aplica aplica uma e a outra '
  'cai em "a verba mudou desde a proposta". Os IDs de campanha do Google (conta, '
  'até 12 dígitos) e do Meta (Graph, 15 ou mais) não colidem. Ver 20261016200000 '
  'e 20261017150000.';
comment on column public.midia_anuncios.conjunto_id_externo is
  'O ID do conjunto de anúncios (ad set) no Meta, lido da lista /ads pela '
  'sincronização. Nulo no Google (que não grava anúncio) e no anúncio digitado à '
  'mão. midia_gravar_lote não o apaga quando o lote não o traz.';
comment on column public.midia_anuncios.conjunto_nome is
  'O nome do conjunto de anúncios no Meta, como a sincronização o leu.';
comment on column public.midia_anuncios.situacao is
  'Se o anúncio está entregando, na régua de midia_campanhas.situacao (no_ar, '
  'pausada, planejada, encerrada), traduzida do effective_status do Meta. Nulo '
  'quando a plataforma não informa.';
comment on column public.midia_anuncios.conjunto_situacao is
  'Se o conjunto do anúncio está entregando, na mesma régua de situacao.';
comment on function public.midia_copiloto_gravar_diagnostico(jsonb) is
  'O retrato, os achados e as propostas de uma plataforma (p->>''plataforma'': '
  'google, o padrão, ou meta), numa transação. Descarta só as propostas da mesma '
  'plataforma, e só a mesma plataforma segura o "não volta". Chave de serviço.';
comment on function public.midia_copiloto_reservar_acoes(integer) is
  'O lote do script do Google Ads: as ações aprovadas do GOOGLE (e as entregues '
  'sem resposta há 90 min), até 50. Nunca entrega ação do Meta. Chave de serviço.';
comment on function public.midia_copiloto_reservar_acoes_meta(integer) is
  'O lote da rota do Meta (Graph API): as ações aprovadas do META (e as entregues '
  'sem resposta há 90 min), de 1 a 20 (padrão 10). Três entregas sem resposta '
  'viram falha. Nunca entrega ação do Google. Chave de serviço.';
comment on function public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text) is
  'O que o script do Google ou a rota do Meta fez: fecha a ação em aplicação com '
  'o que leu de volta, e grava a trilha com o autor da plataforma (Script do '
  'Google Ads; Copiloto (API do Meta)). Chave de serviço.';
comment on function public.midia_copiloto_pedir_verba(text, numeric, text) is
  'Pedir a verba diária nova de uma campanha do Google Ads ou do Meta (até 10× a '
  'de hoje); a plataforma vem da campanha sincronizada, e o mesmo ID nas duas é '
  'recusado. No Meta, só a verba da campanha (orçamento de campanha). Sessão de '
  'Administrador ou Marketing; a verba de hoje e o nome vêm de midia_campanhas (ou '
  'do que foi lido de volta logo depois de uma mudança aplicada), nunca de quem '
  'pede. Nasce proposta e passa por midia_copiloto_decidir; substitui a mudança de '
  'verba proposta da mesma campanha e plataforma e recusa se há uma aprovada ou em '
  'aplicação (inclusive desfazer). Trilha copiloto_pediu. Devolve o id da ação.';
comment on function public.midia_copiloto_desfazer(uuid) is
  'Cria o inverso de uma ação aplicada, já aprovado por quem clicou, na mesma '
  'plataforma e no mesmo alvo. É o único caminho por onde uma negativa é removida '
  'e um grupo, conjunto ou anúncio pausado pelo copiloto volta ao ar. Com verba: '
  'substitui a proposta aberta de verba da campanha e recusa se há uma aprovada ou '
  'em aplicação.';
comment on table public.midia_copiloto_parametros is
  'Regras do Copiloto de Mídia (2026-10-14; Meta em 2026-10-17), como DADO com '
  'vigência. Google: mínimos de gasto para propor negativa, pausa de grupo e '
  'corte de verba; ritmo alto e baixo da verba; corte proposto; índice de '
  'qualidade baixo; medição; impressão perdida; hora do diagnóstico diário; e as '
  'listas que classificam termo de pesquisa (concorrentes, cidades fora da área, '
  'palavras informativas). Meta (colunas meta_*): gastos mínimos de conjunto e de '
  'campanha, os múltiplos do custo por lead e a régua da qualidade dos leads. Uma '
  'vigente por loja; valor vigente não sofre UPDATE (D-T1.7). A única escrita é '
  'midia_copiloto_nova_vigencia, de Administrador e Marketing. Ver '
  '20261014150000 e 20261017150000.';
comment on column public.midia_copiloto_parametros.meta_gasto_minimo_conjunto is
  'Meta: R$ gastos em 14 dias a partir dos quais um conjunto ou anúncio sem lead '
  'no CRM vira proposta de pausa (junto com meta_vezes_sem_lead).';
comment on column public.midia_copiloto_parametros.meta_gasto_minimo_campanha is
  'Meta: R$ gastos em 14 dias a partir dos quais uma campanha sem lead, ou cara, '
  'vira achado; e o gasto sem nenhum lead do Meta no CRM que vira achado de medição.';
comment on column public.midia_copiloto_parametros.meta_vezes_sem_lead is
  'Meta: o gasto sem lead só conta a partir de N vezes o custo por lead da conta '
  '(de 1 a 10).';
comment on column public.midia_copiloto_parametros.meta_vezes_custo_caro is
  'Meta: o custo por lead da campanha é caro a partir de N vezes o da conta (acima '
  'de 1, até 10).';
comment on column public.midia_copiloto_parametros.meta_leads_maduros_minimos is
  'Meta: campanha com N leads maduros e nenhum qualificado no funil vira achado '
  'de qualidade (de 1 a 500).';
comment on column public.midia_copiloto_parametros.meta_dias_para_amadurecer is
  'Meta: lead com menos dias que isto ainda não conta na qualidade (de 1 a 29 — a '
  'janela de qualidade é de 30 dias).';
comment on function public.midia_copiloto_nova_vigencia(
  numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text[], text[], text[], integer,
  numeric, numeric, numeric, numeric, integer, integer) is
  'Regras novas do copiloto: encerra a vigente e abre a nova, junto, com a trilha '
  'copiloto_regras. Sessão de Administrador ou Marketing; autoria carimbada. Os '
  'seis do Meta (no fim) são opcionais: nulo copia o valor da vigente (sem vigente, '
  'o padrão da coluna) — a chamada de 15 argumentos do Google segue valendo.';
comment on function public.midia_gravar_lote(jsonb) is
  'Grava um lote da sincronização (Meta ou Google): campanhas, anúncios (no Meta, '
  'com conjunto e situações) e o desempenho diário da janela, que é apagado e '
  'regravado. O que o anúncio não trouxe fica como estava. Chave de serviço.';


-- ============================================================================
-- 14. Autoconferência — pelo efeito, dentro de um bloco que se desfaz
-- ============================================================================
-- Em produção as tabelas já têm retratos, propostas e aprovadas de verdade: a
-- prova usa campanhas, conjuntos e anúncios de ID impossível (20 dígitos,
-- 9999…8…) e só olha para as linhas que ela mesma criou — os retornos que
-- somam a loja inteira (descartadas da gravação, lotes das reservas) não entram
-- no veredito como número.
do $aceite$
declare
  g1  constant text := '99999999999999998001';   -- Google, R$ 50
  m1  constant text := '99999999999999998101';   -- Meta, orçamento de campanha R$ 40
  m2  constant text := '99999999999999998102';   -- Meta, verba nos conjuntos
  m3  constant text := '99999999999999998103';   -- Meta, R$ 30: o pedido parado
  x1  constant text := '99999999999999998201';   -- o mesmo ID no Google (R$ 20) e no Meta (R$ 25)
  c9  constant text := '99999999999999998404';   -- não sincronizada
  cr  constant text := '99999999999999998301';   -- só para as regras gravadas como dono
  gg  constant text := '99999999999999998011';   -- grupo do Google em g1
  cj  constant text := '99999999999999998121';   -- conjunto do Meta em m1
  an  constant text := '99999999999999998111';   -- anúncio do Meta em cj
  ag  constant text := '99999999999999998091';   -- anúncio que o lote do Google traz em g1
  marca constant text := 'aceite-copiloto-meta'; -- a conta dos retratos da prova
  falhas          int := 0;
  v_nome          text;
  v_n             bigint;
  v_i             int;
  v_uid           uuid;
  v_papel         text;
  v_ids           jsonb := '{}'::jsonb;
  v_cli           uuid := gen_random_uuid();     -- authenticated sem perfil: cliente
  v_padrao        uuid := public.org_padrao();
  v_manual        uuid;
  v_camp_m1       uuid;
  v_n2            bigint;
  v_obtido        text;
  v_antes         jsonb;
  v_depois        jsonb;
  v_restou        bigint;
  v_lote          jsonb;
  v_g             jsonb;
  v_m             jsonb;
  v_r             jsonb;
  v_rg1           jsonb;
  v_rm1           jsonb;
  v_rg2           jsonb;
  v_rm2           jsonb;
  v_diag_g        uuid;
  v_diag_m        uuid;
  v_neg_g         uuid;
  v_neg_g2        uuid;
  v_grupo_g       uuid;
  v_verba_x1g     uuid;
  v_anuncio_m     uuid;
  v_conjunto_m    uuid;
  v_verba_m1      uuid;
  v_verba_m1b     uuid;
  v_verba_x1m     uuid;
  v_parado_g      uuid;
  v_parado_m      uuid;
  v_d_m           uuid;
  v_d_neg         uuid;
  v_p_m           uuid;
  v_p_g           uuid;
  v_lote_ids      uuid[];
  v_lote_plats    text[];
  v_res_google    uuid[] := '{}';
  v_res_meta      uuid[] := '{}';
  v_plats_google  text[] := '{}';
  v_plats_meta    text[] := '{}';
  v_primeiro_meta int;
  v_linha         public.midia_copiloto_acoes;
  v_caso          record;
  v_estado        text;
  v_msg           text;
  -- o que a prova mediu, lido depois do rollback
  v_gravar_lote   text := '';
  v_isolamento    text := '';
  v_retrato_meta  text := '';
  v_reserva       text := '';
  v_tentativas    text := '';
  v_resultado     text := '';
  v_desfazer      text := '';
  v_frases        text := '';
  v_gatilho       int := 0;
  v_gatilho_ok    int := 0;
  v_pedidos       text := '';
  v_recusas       int := 0;
  v_recusas_ok    int := 0;
  v_regras        int := 0;
  v_regras_certas int := 0;
  v_trilha        text := '';
  v_sessao        text := '';
  v_par           public.midia_copiloto_parametros;
  v_par_n         bigint;
  v_par_vigente   uuid;
  v_regras_meta   text := '';
begin
  -- 1 · As colunas: do tipo certo, nulas (ou com o padrão google), comentadas.
  for v_caso in
    select * from (values
      ('midia_copiloto_diagnosticos', 'plataforma',          'NO'),
      ('midia_copiloto_acoes',        'plataforma',          'NO'),
      ('midia_copiloto_acoes',        'anuncio_id_externo',  'YES'),
      ('midia_copiloto_acoes',        'anuncio_nome',        'YES'),
      ('midia_anuncios',              'conjunto_id_externo', 'YES'),
      ('midia_anuncios',              'conjunto_nome',       'YES'),
      ('midia_anuncios',              'situacao',            'YES'),
      ('midia_anuncios',              'conjunto_situacao',   'YES')
    ) as t(tabela, coluna, nula)
  loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = v_caso.tabela
                      and column_name = v_caso.coluna and data_type = 'text' and is_nullable = v_caso.nula
                      and (v_caso.nula = 'YES' or column_default = '''google''::text')) then
      falhas := falhas + 1; raise warning 'FALHOU: %.% ausente, de outro tipo, ou com nulidade/padrão errado', v_caso.tabela, v_caso.coluna;
    end if;
    if col_description(('public.' || v_caso.tabela)::regclass,
         (select attnum from pg_attribute
           where attrelid = ('public.' || v_caso.tabela)::regclass and attname = v_caso.coluna)) is null then
      falhas := falhas + 1; raise warning 'FALHOU: %.% sem comentário', v_caso.tabela, v_caso.coluna;
    end if;
  end loop;

  -- 1b · As regras do Meta: tipo, not null, comentário e o padrão de cada uma
  --      (a linha que já vigia ganhou o padrão ao nascer a coluna).
  select string_agg(attname || ':' || format_type(atttypid, atttypmod) || ':' || attnotnull || ':'
                    || (col_description(attrelid, attnum) is not null), ',' order by attnum)
    into v_nome
    from pg_attribute
   where attrelid = 'public.midia_copiloto_parametros'::regclass and attname like 'meta\_%' and not attisdropped;
  if v_nome is distinct from 'meta_gasto_minimo_conjunto:numeric(10,2):true:true,meta_gasto_minimo_campanha:numeric(10,2):true:true,'
                             'meta_vezes_sem_lead:numeric(4,2):true:true,meta_vezes_custo_caro:numeric(4,2):true:true,'
                             'meta_leads_maduros_minimos:smallint:true:true,meta_dias_para_amadurecer:smallint:true:true' then
    falhas := falhas + 1; raise warning 'FALHOU: colunas das regras do Meta — %', v_nome;
  end if;
  select string_agg(a.attname || '=' || pg_get_expr(d.adbin, d.adrelid), ',' order by a.attnum)
    into v_nome
    from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.midia_copiloto_parametros'::regclass and a.attname like 'meta\_%' and not a.attisdropped;
  if v_nome is distinct from 'meta_gasto_minimo_conjunto=100,meta_gasto_minimo_campanha=200,meta_vezes_sem_lead=2.5,'
                             'meta_vezes_custo_caro=2,meta_leads_maduros_minimos=8,meta_dias_para_amadurecer=7' then
    falhas := falhas + 1; raise warning 'FALHOU: padrões das regras do Meta — %', v_nome;
  end if;
  -- A porta das regras: uma só, a de 21; a de 15 saiu.
  if to_regprocedure('public.midia_copiloto_nova_vigencia(numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text[], text[], text[], integer)') is not null
     or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'midia_copiloto_nova_vigencia') <> 1
     or not exists (select 1 from pg_proc
                     where oid = to_regprocedure('public.midia_copiloto_nova_vigencia(numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text[], text[], text[], integer, numeric, numeric, numeric, numeric, integer, integer)')
                       and prosecdef and proconfig @> array['search_path=public'] and pronargdefaults = 6
                       and obj_description(oid, 'pg_proc') is not null) then
    falhas := falhas + 1; raise warning 'FALHOU: midia_copiloto_nova_vigencia não é UMA, de 21 argumentos (6 opcionais), SECURITY DEFINER, comentada';
  end if;

  -- 2 · As regras: CHECK validado. Os índices: os dois únicos como estavam, os
  --     dois novos com a forma certa.
  foreach v_nome in array array[
    'midia_copiloto_diagnosticos_plataforma_valida',
    'midia_copiloto_achados_regra_valida', 'midia_copiloto_achados_meta_sem_grupo',
    'midia_copiloto_acoes_plataforma_valida', 'midia_copiloto_acoes_tipo_valido',
    'midia_copiloto_acoes_tipo_da_plataforma', 'midia_copiloto_acoes_ids_validos',
    'midia_copiloto_acoes_alvo_do_tipo', 'midia_copiloto_acoes_origem_do_tipo',
    'midia_anuncios_conjunto_id_valido', 'midia_anuncios_situacoes_validas',
    'midia_copiloto_parametros_meta_validos'
  ] loop
    if not exists (select 1 from pg_constraint where conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1; raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;
  for v_caso in
    select * from (values
      ('midia_copiloto_acoes_chave_aberta', true,
       '% USING btree (org_id, chave) WHERE (situacao = ANY (ARRAY[''proposta''::text, ''aprovada''::text, ''em_aplicacao''::text]))'),
      ('midia_copiloto_acoes_uma_verba_aberta', true,
       '% USING btree (org_id, campanha_id_externo) WHERE ((tipo = ''mudar_verba''::text) AND (situacao = ANY (ARRAY[''proposta''::text, ''aprovada''::text, ''em_aplicacao''::text])))'),
      ('midia_copiloto_acoes_plataforma_idx', false,
       '% USING btree (org_id, plataforma, situacao, proposta_em DESC)'),
      ('midia_copiloto_diagnosticos_plataforma_idx', false,
       '% USING btree (org_id, plataforma, recebido_em DESC)')
    ) as t(indice, unico, forma)
  loop
    if not exists (select 1 from pg_index i
                    where i.indexrelid = to_regclass('public.' || v_caso.indice)
                      and i.indisvalid and i.indisunique = v_caso.unico
                      and pg_get_indexdef(i.indexrelid) like v_caso.forma) then
      falhas := falhas + 1; raise warning 'FALHOU: índice % ausente ou com outra forma', v_caso.indice;
    end if;
  end loop;

  -- 3 · As portas: uma função por nome (nada de sobrecarga — o PostgREST ficaria
  --     ambíguo); as do script e a gravação do lote só da chave de serviço; as
  --     do painel de authenticated; nenhuma de anon. A reserva do Meta roda
  --     como dono, com search_path fixo e comentada; a gravação do lote segue
  --     SECURITY INVOKER com search_path vazio.
  select string_agg(proname, ', ' order by proname) into v_nome
    from (select proname from pg_proc
           where pronamespace = 'public'::regnamespace
             and proname in ('midia_copiloto_descrever', 'midia_copiloto_acoes_transicao', 'midia_copiloto_nova_vigencia',
                             'midia_copiloto_gravar_diagnostico', 'midia_copiloto_reservar_acoes',
                             'midia_copiloto_reservar_acoes_meta', 'midia_copiloto_registrar_resultado',
                             'midia_copiloto_pedir_verba', 'midia_copiloto_desfazer', 'midia_gravar_lote')
           group by proname having count(*) > 1) d;
  if v_nome is not null then
    falhas := falhas + 1; raise warning 'FALHOU: função com sobrecarga: %', v_nome;
  end if;
  for v_caso in
    select * from (values
      ('public.midia_copiloto_gravar_diagnostico(jsonb)',                    false, true),
      ('public.midia_copiloto_reservar_acoes(integer)',                      false, true),
      ('public.midia_copiloto_reservar_acoes_meta(integer)',                 false, true),
      ('public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text)', false, true),
      ('public.midia_gravar_lote(jsonb)',                                    false, true),
      ('public.midia_copiloto_pedir_verba(text, numeric, text)',             true,  false),
      ('public.midia_copiloto_nova_vigencia(numeric, numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, text[], text[], text[], integer, numeric, numeric, numeric, numeric, integer, integer)', true, false),
      ('public.midia_copiloto_desfazer(uuid)',                               true,  false),
      ('public.midia_copiloto_decidir(uuid[], text, text)',                  true,  false)
    ) as t(fn, painel, servico)
  loop
    if to_regprocedure(v_caso.fn) is null then
      falhas := falhas + 1; raise warning 'FALHOU: % não existe', v_caso.fn;
      continue;
    end if;
    if has_function_privilege('anon', v_caso.fn, 'execute')
       or has_function_privilege('authenticated', v_caso.fn, 'execute') <> v_caso.painel
       or (v_caso.servico and not has_function_privilege('service_role', v_caso.fn, 'execute')) then
      falhas := falhas + 1; raise warning 'FALHOU: privilégio de execução errado em %', v_caso.fn;
    end if;
  end loop;
  if not exists (select 1 from pg_proc
                  where oid = to_regprocedure('public.midia_copiloto_reservar_acoes_meta(integer)')
                    and prosecdef and proconfig @> array['search_path=public']
                    and obj_description(oid, 'pg_proc') is not null) then
    falhas := falhas + 1; raise warning 'FALHOU: midia_copiloto_reservar_acoes_meta não é SECURITY DEFINER com search_path=public, ou não tem comentário';
  end if;
  if not exists (select 1 from pg_proc
                  where oid = to_regprocedure('public.midia_gravar_lote(jsonb)')
                    and not prosecdef and proconfig = array['search_path=""']) then
    falhas := falhas + 1; raise warning 'FALHOU: midia_gravar_lote deixou de ser SECURITY INVOKER com search_path vazio';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.midia_copiloto_acoes'::regclass
                    and tgname = 'midia_copiloto_acoes_transicao' and not tgisinternal and tgenabled <> 'D') then
    falhas := falhas + 1; raise warning 'FALHOU: o gatilho de transição não está ligado';
  end if;

  -- 3b · midia_anuncios e midia_diario: só as policies novas; anon sem nada;
  --      authenticated sem TRUNCATE, REFERENCES nem TRIGGER, e sem escrita no
  --      desempenho; a chave de serviço segue gravando.
  select string_agg(policyname || ':' || cmd, ',' order by policyname) into v_nome
    from pg_policies where schemaname = 'public' and tablename = 'midia_anuncios';
  if v_nome is distinct from 'midia_anuncios_leitura:SELECT,midia_anuncios_manual_edicao:UPDATE,'
                             'midia_anuncios_manual_exclusao:DELETE,midia_anuncios_manual_inclusao:INSERT' then
    falhas := falhas + 1; raise warning 'FALHOU: policies de midia_anuncios — %', v_nome;
  end if;
  select string_agg(policyname || ':' || cmd, ',' order by policyname) into v_nome
    from pg_policies where schemaname = 'public' and tablename = 'midia_diario';
  if v_nome is distinct from 'midia_diario_leitura:SELECT' then
    falhas := falhas + 1; raise warning 'FALHOU: policies de midia_diario — %', v_nome;
  end if;
  foreach v_nome in array array['public.midia_anuncios', 'public.midia_diario'] loop
    if has_table_privilege('anon', v_nome, 'SELECT')
       or not has_table_privilege('authenticated', v_nome, 'SELECT')
       or has_table_privilege('authenticated', v_nome, 'TRUNCATE')
       or has_table_privilege('authenticated', v_nome, 'REFERENCES')
       or has_table_privilege('authenticated', v_nome, 'TRIGGER')
       or has_table_privilege('authenticated', v_nome, 'INSERT') <> (v_nome = 'public.midia_anuncios')
       or has_table_privilege('authenticated', v_nome, 'UPDATE') <> (v_nome = 'public.midia_anuncios')
       or has_table_privilege('authenticated', v_nome, 'DELETE') <> (v_nome = 'public.midia_anuncios')
       or not has_table_privilege('service_role', v_nome, 'INSERT')
       or not has_table_privilege('service_role', v_nome, 'DELETE') then
      falhas := falhas + 1; raise warning 'FALHOU: privilégios de % (anon, authenticated ou chave de serviço)', v_nome;
    end if;
  end loop;

  -- As ações que já existem, por situação: a sonda reserva, descarta e decide
  -- na tabela de verdade, e tudo isso tem de voltar.
  select jsonb_build_object(
           'aco', (select count(*) from public.midia_copiloto_acoes),
           'aco_situacoes', (select jsonb_object_agg(situacao, n)
                               from (select situacao, count(*) as n from public.midia_copiloto_acoes group by 1) s))
    into v_antes;
  -- E as regras: a sonda abre e encerra vigências na tabela de verdade.
  select count(*) into v_par_n from public.midia_copiloto_parametros;
  select id into v_par_vigente from public.midia_copiloto_parametros
   where org_id = v_padrao and vigencia_ate is null;

  -- 4 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    foreach v_papel in array array['admin', 'marketing'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-copiloto-meta-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite Meta ' || v_papel, papeis = array[v_papel], role = v_papel, is_active = true
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    -- 4a · A sincronização (chave de serviço): o lote do Meta traz o anúncio
    --      com conjunto e situações; o do Google, o anúncio sem nada disso; o
    --      segundo lote do Meta renomeia o anúncio e só traz a situação do
    --      conjunto — o resto fica como estava.
    v_lote := jsonb_build_object('plataforma', 'meta', 'de', '2026-10-10', 'ate', '2026-10-16',
      'campanhas', jsonb_build_array(
        jsonb_build_object('id_externo', m1, 'nome', 'Aceite Meta Leads', 'objetivo', 'OUTCOME_LEADS',
          'situacao', 'no_ar', 'orcamento_diario', 40, 'dias', '[]'::jsonb,
          'anuncios', jsonb_build_array(jsonb_build_object(
            'id_externo', an, 'nome', 'Aceite Anúncio Carro', 'conjunto_id_externo', cj,
            'conjunto_nome', 'Aceite Conjunto Curitiba', 'situacao', 'no_ar', 'conjunto_situacao', 'no_ar'))),
        jsonb_build_object('id_externo', m2, 'nome', 'Aceite Meta Conjuntos', 'situacao', 'no_ar',
          'orcamento_diario', null, 'anuncios', '[]'::jsonb, 'dias', '[]'::jsonb),
        jsonb_build_object('id_externo', m3, 'nome', 'Aceite Meta Parada', 'situacao', 'no_ar',
          'orcamento_diario', 30, 'anuncios', '[]'::jsonb, 'dias', '[]'::jsonb),
        jsonb_build_object('id_externo', x1, 'nome', 'Aceite Ambígua Meta', 'situacao', 'no_ar',
          'orcamento_diario', 25, 'anuncios', '[]'::jsonb, 'dias', '[]'::jsonb)));
    set local role service_role;
    v_r := public.midia_gravar_lote(v_lote);
    v_gravar_lote := 'meta:' || (v_r->>'campanhas');
    v_r := public.midia_gravar_lote(jsonb_build_object('plataforma', 'google', 'de', '2026-10-10', 'ate', '2026-10-16',
      'campanhas', jsonb_build_array(
        jsonb_build_object('id_externo', g1, 'nome', 'Aceite Google Pesquisa', 'situacao', 'no_ar',
          'orcamento_diario', 50, 'dias', '[]'::jsonb,
          'anuncios', jsonb_build_array(jsonb_build_object('id_externo', ag, 'nome', 'Aceite Anúncio Google'))),
        jsonb_build_object('id_externo', x1, 'nome', 'Aceite Ambígua Google', 'situacao', 'no_ar',
          'orcamento_diario', 20, 'anuncios', '[]'::jsonb, 'dias', '[]'::jsonb))));
    v_gravar_lote := v_gravar_lote || ' google:' || (v_r->>'campanhas');
    reset role;
    select v_gravar_lote || format(' L1:%s/%s/%s/%s/%s', nome, conjunto_id_externo = cj, conjunto_nome, situacao, conjunto_situacao)
      into v_gravar_lote from public.midia_anuncios where id_externo = an;
    set local role service_role;
    perform public.midia_gravar_lote(jsonb_build_object('plataforma', 'meta', 'de', '2026-10-10', 'ate', '2026-10-16',
      'campanhas', jsonb_build_array(
        jsonb_build_object('id_externo', m1, 'nome', 'Aceite Meta Leads', 'situacao', 'no_ar',
          'orcamento_diario', 40,
          'dias', jsonb_build_array(jsonb_build_object('anuncio_id_externo', an, 'dia', '2026-10-15',
                    'investido', 12.5, 'impressoes', 100, 'cliques', 3, 'conversoes', 1)),
          'anuncios', jsonb_build_array(jsonb_build_object(
            'id_externo', an, 'nome', 'Aceite Anúncio Carro v2', 'conjunto_situacao', 'pausada'))))));
    reset role;
    select v_gravar_lote || format(' L3:%s/%s/%s/%s/%s', nome, conjunto_id_externo = cj, conjunto_nome, situacao, conjunto_situacao)
      into v_gravar_lote from public.midia_anuncios where id_externo = an;
    select v_gravar_lote || format(' google_anuncio:%s/%s/%s/%s/%s', nome,
             coalesce(conjunto_id_externo, 'nulo'), coalesce(conjunto_nome, 'nulo'),
             coalesce(situacao, 'nulo'), coalesce(conjunto_situacao, 'nulo'))
      into v_gravar_lote from public.midia_anuncios where id_externo = ag;

    -- 4b · Um pedido do Meta parado há 8 dias: o retrato do Google não o toca.
    insert into public.midia_copiloto_acoes
      (plataforma, chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova, motivo,
       pedida_por, pedida_por_nome, proposta_em)
    values ('meta', 'verba:' || m3, 'mudar_verba', m3, 'Aceite Meta Parada', 30, 45, 'Pedido parado.',
            (v_ids->>'marketing')::uuid, 'Aceite Meta marketing', now() - interval '8 days')
    returning id into v_parado_m;

    -- 4c · O retrato do Google (sem o campo plataforma, como o script manda):
    --      quatro propostas.
    v_g := jsonb_build_object(
      'conta', marca, 'de', '2026-10-10', 'ate', '2026-10-16', 'previa', false,
      'dados', '{}'::jsonb, 'resumo', '{}'::jsonb, 'erros', '{}'::jsonb,
      'achados', jsonb_build_array(
        jsonb_build_object('regra', 'ritmo_de_verba', 'gravidade', 'media', 'titulo', 'Ritmo', 'detalhe', 'aceite'),
        jsonb_build_object('regra', 'termos_sem_conversao', 'grupo', 'informativo', 'gravidade', 'alta',
                           'titulo', 'Termos', 'detalhe', 'aceite')),
      'propostas', jsonb_build_array(
        jsonb_build_object('achado', 1, 'chave', 'negativar:' || g1 || ':exata:aceite copiloto meta', 'tipo', 'negativar',
                           'campanha_id_externo', g1, 'campanha_nome', 'Aceite Google Pesquisa',
                           'texto', 'aceite copiloto meta', 'correspondencia', 'exata', 'motivo', 'aceite'),
        jsonb_build_object('achado', 1, 'chave', 'negativar:' || g1 || ':frase:aceite copiloto meta', 'tipo', 'negativar',
                           'campanha_id_externo', g1, 'campanha_nome', 'Aceite Google Pesquisa',
                           'texto', 'aceite copiloto meta', 'correspondencia', 'frase', 'motivo', 'aceite'),
        jsonb_build_object('achado', 0, 'chave', 'pausar_grupo:' || gg, 'tipo', 'pausar_grupo',
                           'campanha_id_externo', g1, 'campanha_nome', 'Aceite Google Pesquisa',
                           'grupo_id_externo', gg, 'grupo_nome', 'Aceite Grupo Google', 'motivo', 'aceite'),
        jsonb_build_object('achado', 0, 'chave', 'verba:' || x1, 'tipo', 'mudar_verba',
                           'campanha_id_externo', x1, 'campanha_nome', 'Aceite Ambígua Google',
                           'verba_atual', 20, 'verba_nova', 14, 'motivo', 'aceite')));
    set local role service_role;
    v_rg1 := public.midia_copiloto_gravar_diagnostico(v_g);
    reset role;
    v_diag_g := (v_rg1->>'diagnostico')::uuid;
    select id into v_neg_g     from public.midia_copiloto_acoes where diagnostico_id = v_diag_g and correspondencia = 'exata';
    select id into v_neg_g2    from public.midia_copiloto_acoes where diagnostico_id = v_diag_g and correspondencia = 'frase';
    select id into v_grupo_g   from public.midia_copiloto_acoes where diagnostico_id = v_diag_g and tipo = 'pausar_grupo';
    select id into v_verba_x1g from public.midia_copiloto_acoes where diagnostico_id = v_diag_g and tipo = 'mudar_verba';
    v_isolamento := 'google_nao_descarta_parado_meta:' || (select situacao from public.midia_copiloto_acoes where id = v_parado_m);

    -- Agora um pedido do Google parado há 8 dias: o retrato do Meta não o toca.
    insert into public.midia_copiloto_acoes
      (plataforma, chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova, motivo,
       pedida_por, pedida_por_nome, proposta_em)
    values ('google', 'verba:' || g1, 'mudar_verba', g1, 'Aceite Google Pesquisa', 50, 60, 'Pedido parado.',
            (v_ids->>'marketing')::uuid, 'Aceite Meta marketing', now() - interval '8 days')
    returning id into v_parado_g;

    -- 4d · O retrato do Meta: as quatro regras do Meta e o ritmo, três propostas.
    --      As do Google seguem propostas, e o pedido parado do Google também;
    --      o pedido parado do Meta sai de cena.
    v_m := jsonb_build_object(
      'plataforma', 'meta', 'conta', marca, 'de', '2026-10-10', 'ate', '2026-10-16', 'previa', false,
      'dados', '{}'::jsonb, 'resumo', '{}'::jsonb, 'erros', '{}'::jsonb,
      'achados', jsonb_build_array(
        jsonb_build_object('regra', 'meta_sem_lead',       'gravidade', 'alta',  'titulo', 'Sem lead',  'detalhe', 'aceite'),
        jsonb_build_object('regra', 'meta_custo_por_lead', 'gravidade', 'media', 'titulo', 'Custo',     'detalhe', 'aceite'),
        jsonb_build_object('regra', 'meta_qualidade',      'gravidade', 'media', 'titulo', 'Qualidade', 'detalhe', 'aceite'),
        jsonb_build_object('regra', 'meta_medicao',        'gravidade', 'baixa', 'titulo', 'Medição',   'detalhe', 'aceite'),
        jsonb_build_object('regra', 'ritmo_de_verba',      'gravidade', 'media', 'titulo', 'Ritmo',     'detalhe', 'aceite')),
      'propostas', jsonb_build_array(
        jsonb_build_object('achado', 0, 'chave', 'meta:pausar_anuncio:' || an, 'tipo', 'pausar_anuncio',
                           'campanha_id_externo', m1, 'campanha_nome', 'Aceite Meta Leads',
                           'grupo_id_externo', cj, 'grupo_nome', 'Aceite Conjunto Curitiba',
                           'anuncio_id_externo', an, 'anuncio_nome', 'Aceite Anúncio Carro', 'motivo', 'aceite'),
        jsonb_build_object('achado', 1, 'chave', 'meta:pausar_conjunto:' || cj, 'tipo', 'pausar_conjunto',
                           'campanha_id_externo', m1, 'campanha_nome', 'Aceite Meta Leads',
                           'grupo_id_externo', cj, 'grupo_nome', 'Aceite Conjunto Curitiba', 'motivo', 'aceite'),
        jsonb_build_object('achado', 4, 'chave', 'verba:' || m1, 'tipo', 'mudar_verba',
                           'campanha_id_externo', m1, 'campanha_nome', 'Aceite Meta Leads',
                           'verba_atual', 40, 'verba_nova', 28, 'motivo', 'aceite')));
    set local role service_role;
    v_rm1 := public.midia_copiloto_gravar_diagnostico(v_m);
    reset role;
    v_diag_m := (v_rm1->>'diagnostico')::uuid;
    select id into v_anuncio_m  from public.midia_copiloto_acoes where diagnostico_id = v_diag_m and tipo = 'pausar_anuncio';
    select id into v_conjunto_m from public.midia_copiloto_acoes where diagnostico_id = v_diag_m and tipo = 'pausar_conjunto';
    select id into v_verba_m1   from public.midia_copiloto_acoes where diagnostico_id = v_diag_m and tipo = 'mudar_verba';
    v_retrato_meta := format('g1:%s/%s m1:%s/%s/%s/%s achados_meta:%s',
      v_rg1->>'plataforma', v_rg1->>'propostas', v_rm1->>'plataforma', v_rm1->>'achados', v_rm1->>'propostas', v_rm1->>'puladas',
      (select string_agg(regra, ',' order by ordem) from public.midia_copiloto_achados where diagnostico_id = v_diag_m));
    select v_retrato_meta || format(' diag:%s/%s acoes_meta:%s anuncio:%s/%s/%s',
             (select plataforma from public.midia_copiloto_diagnosticos where id = v_diag_g),
             (select plataforma from public.midia_copiloto_diagnosticos where id = v_diag_m),
             (select string_agg(plataforma, ',') from (select distinct plataforma from public.midia_copiloto_acoes
                                                        where diagnostico_id = v_diag_m) s),
             a.anuncio_id_externo = an, a.anuncio_nome, a.grupo_id_externo = cj)
      into v_retrato_meta from public.midia_copiloto_acoes a where a.id = v_anuncio_m;
    v_isolamento := v_isolamento || format(' meta_nao_descarta_google:%s parado_g:%s parado_m:%s/%s',
      (select count(*) from public.midia_copiloto_acoes
        where id in (v_neg_g, v_neg_g2, v_grupo_g, v_verba_x1g) and situacao = 'proposta'),
      (select situacao from public.midia_copiloto_acoes where id = v_parado_g),
      (select situacao from public.midia_copiloto_acoes where id = v_parado_m),
      (select descartada_motivo like 'Pedido sem decisão por 8 dias;%' from public.midia_copiloto_acoes where id = v_parado_m));

    -- 4e · O marketing aprova as duas negativas do Google e o anúncio e o
    --      conjunto do Meta; o admin recusa o corte do Google em x1.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_n := public.midia_copiloto_decidir(array[v_neg_g, v_neg_g2, v_anuncio_m, v_conjunto_m], 'aprovar');
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_n := v_n * 10 + public.midia_copiloto_decidir(array[v_verba_x1g], 'recusar');
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_isolamento := v_isolamento || ' decidiu:' || v_n;

    -- 4f · O retrato seguinte do Google (sem propostas) descarta o que é do
    --      Google — a proposta do grupo e o pedido parado — e não toca o Meta.
    set local role service_role;
    v_rg2 := public.midia_copiloto_gravar_diagnostico(jsonb_set(v_g, '{propostas}', '[]'::jsonb));
    reset role;
    v_isolamento := v_isolamento || format(' grupo_g:%s parado_g:%s google_nao_descarta_meta:%s',
      (select situacao from public.midia_copiloto_acoes where id = v_grupo_g),
      (select situacao from public.midia_copiloto_acoes where id = v_parado_g),
      (select situacao from public.midia_copiloto_acoes where id = v_verba_m1));

    -- 4g · O retrato seguinte do Meta: o corte de m1 é substituído (Meta
    --      descarta Meta) e o de x1 entra, mesmo com o corte do Google de
    --      mesma chave recusado agora — a janela de "não volta" é por plataforma.
    set local role service_role;
    v_rm2 := public.midia_copiloto_gravar_diagnostico(jsonb_set(v_m, '{propostas}', jsonb_build_array(
      v_m->'propostas'->2,
      jsonb_build_object('achado', 4, 'chave', 'verba:' || x1, 'tipo', 'mudar_verba',
                         'campanha_id_externo', x1, 'campanha_nome', 'Aceite Ambígua Meta',
                         'verba_atual', 25, 'verba_nova', 18, 'motivo', 'aceite'))));
    reset role;
    select id into v_verba_m1b from public.midia_copiloto_acoes
     where diagnostico_id = (v_rm2->>'diagnostico')::uuid and campanha_id_externo = m1;
    select id into v_verba_x1m from public.midia_copiloto_acoes
     where diagnostico_id = (v_rm2->>'diagnostico')::uuid and campanha_id_externo = x1;
    v_isolamento := v_isolamento || format(' m2:%s/%s verba_m1:%s verba_m1b:%s verba_x1m:%s/%s anuncio_m:%s',
      v_rm2->>'propostas', v_rm2->>'puladas',
      (select situacao from public.midia_copiloto_acoes where id = v_verba_m1),
      (select situacao from public.midia_copiloto_acoes where id = v_verba_m1b),
      (select situacao from public.midia_copiloto_acoes where id = v_verba_x1m),
      (select plataforma from public.midia_copiloto_acoes where id = v_verba_x1m),
      (select situacao from public.midia_copiloto_acoes where id = v_anuncio_m));

    -- 4h · Pelo retrato: plataforma inventada é 22023; reativar não nasce de
    --      diagnóstico (o retrato inteiro volta).
    begin
      set local role service_role;
      perform public.midia_copiloto_gravar_diagnostico(jsonb_set(v_m, '{plataforma}', '"tiktok"'::jsonb));
      reset role;
      v_retrato_meta := v_retrato_meta || ' tiktok:gravou';
    exception when invalid_parameter_value then
      v_retrato_meta := v_retrato_meta || ' tiktok:22023';
    end;
    reset role;
    begin
      set local role service_role;
      perform public.midia_copiloto_gravar_diagnostico(jsonb_set(v_m, '{propostas}', jsonb_build_array(
        jsonb_build_object('achado', 0, 'chave', 'meta:reativar_anuncio:' || an, 'tipo', 'reativar_anuncio',
                           'campanha_id_externo', m1, 'campanha_nome', 'Aceite Meta Leads',
                           'grupo_id_externo', cj, 'grupo_nome', 'Aceite Conjunto Curitiba',
                           'anuncio_id_externo', an, 'anuncio_nome', 'Aceite Anúncio Carro', 'motivo', 'aceite'))));
      reset role;
      v_retrato_meta := v_retrato_meta || ' reativar:gravou';
    exception when check_violation then
      get stacked diagnostics v_msg = constraint_name;
      v_retrato_meta := v_retrato_meta || ' reativar:' || v_msg;
    end;
    reset role;
    v_retrato_meta := v_retrato_meta || ' depois:' || (select situacao from public.midia_copiloto_acoes where id = v_verba_m1b);

    -- 4i · As reservas, com a fila das DUAS plataformas cheia. Primeiro a do
    --      Meta: com limite 1 entrega uma, e depois o resto — o anúncio e o
    --      conjunto, nada do Google (as negativas aprovadas estão na fila).
    --      Depois a do Google, de 50 em 50 até esvaziar: as duas negativas,
    --      nada do Meta. (Em 4l a ordem se inverte: a do Google primeiro, com
    --      o desfazer do Meta na fila.)
    set local role service_role;
    select coalesce(array_agg(r.id), '{}'), coalesce(array_agg(r.plataforma), '{}')
      into v_lote_ids, v_lote_plats
      from public.midia_copiloto_reservar_acoes_meta(1) r;
    reset role;
    v_primeiro_meta := cardinality(v_lote_ids);
    v_res_meta := v_lote_ids;
    v_plats_meta := v_lote_plats;
    v_reserva := 'meta_limite_1:' || v_primeiro_meta;
    set local role service_role;
    for v_i in 1..200 loop
      select coalesce(array_agg(r.id), '{}'), coalesce(array_agg(r.plataforma), '{}')
        into v_lote_ids, v_lote_plats
        from public.midia_copiloto_reservar_acoes_meta(20) r;
      exit when cardinality(v_lote_ids) = 0;
      v_res_meta := v_res_meta || v_lote_ids;
      v_plats_meta := v_plats_meta || v_lote_plats;
    end loop;
    for v_i in 1..200 loop
      select coalesce(array_agg(r.id), '{}'), coalesce(array_agg(r.plataforma), '{}')
        into v_lote_ids, v_lote_plats
        from public.midia_copiloto_reservar_acoes(50) r;
      exit when cardinality(v_lote_ids) = 0;
      v_res_google := v_res_google || v_lote_ids;
      v_plats_google := v_plats_google || v_lote_plats;
    end loop;
    reset role;
    v_reserva := v_reserva || format(' google:%s/%s/so_google:%s meta:%s/%s/so_meta:%s',
      (v_neg_g = any (v_res_google) and v_neg_g2 = any (v_res_google)),
      (v_anuncio_m = any (v_res_google) or v_conjunto_m = any (v_res_google)),
      not ('meta' = any (v_plats_google)),
      (v_anuncio_m = any (v_res_meta) and v_conjunto_m = any (v_res_meta)),
      (v_neg_g = any (v_res_meta) or v_neg_g2 = any (v_res_meta)),
      not ('google' = any (v_plats_meta)));

    -- 4j · Três entregas sem resposta: a reserva do Google fecha só a do
    --      Google (com a frase do script) e a do Meta, só a do Meta (com a
    --      frase do executor do Meta).
    --      Em cada fase há uma ação da OUTRA plataforma no mesmo estado, que
    --      tem de ficar como está.
    update public.midia_copiloto_acoes
       set situacao = 'em_aplicacao', reservada_em = now() - interval '2 hours', tentativas = 3
     where id in (v_neg_g2, v_conjunto_m);
    set local role service_role;
    perform count(*) from public.midia_copiloto_reservar_acoes(50);
    reset role;
    v_tentativas := format('depois_google:%s/%s',
      (select situacao from public.midia_copiloto_acoes where id = v_neg_g2),
      (select situacao from public.midia_copiloto_acoes where id = v_conjunto_m));
    update public.midia_copiloto_acoes
       set situacao = 'em_aplicacao', reservada_em = now() - interval '2 hours', tentativas = 3
     where id = v_neg_g;
    set local role service_role;
    perform count(*) from public.midia_copiloto_reservar_acoes_meta(20);
    reset role;
    v_tentativas := v_tentativas || format(' depois_meta:%s/%s',
      (select situacao from public.midia_copiloto_acoes where id = v_conjunto_m),
      (select situacao from public.midia_copiloto_acoes where id = v_neg_g));
    -- A negativa volta a ser uma entrega recente, para o resultado em 4k.
    update public.midia_copiloto_acoes
       set situacao = 'em_aplicacao', reservada_em = now(), tentativas = 1
     where id = v_neg_g;
    v_tentativas := v_tentativas || format(' erro_google:%s erro_meta:%s',
      (select erro like 'O script recebeu a ação 3 vezes%' from public.midia_copiloto_acoes where id = v_neg_g2),
      (select erro = 'O executor do Meta recebeu a ação 3 vezes e não devolveu o resultado. Confira a conta antes de aprovar de novo.'
         from public.midia_copiloto_acoes where id = v_conjunto_m));

    -- 4k · O resultado: a trilha diz quem aplicou.
    set local role service_role;
    v_resultado := coalesce(public.midia_copiloto_registrar_resultado(v_neg_g, 'aplicada', '{"existe": true}'::jsonb, null), 'nulo')
      || ' ' || coalesce(public.midia_copiloto_registrar_resultado(v_anuncio_m, 'aplicada', '{"status": "PAUSED"}'::jsonb, null), 'nulo');
    reset role;
    v_trilha := format('meta:%s google:%s',
      (select count(*) from public.auditoria_admin
        where acao = 'copiloto_aplicou' and autor_id is null and autor_nome = 'Copiloto (API do Meta)'
          and detalhe = format('Pausar o anúncio Aceite Anúncio Carro (Aceite Conjunto Curitiba · Aceite Meta Leads) (ação %s)', v_anuncio_m)),
      (select count(*) from public.auditoria_admin
        where acao = 'copiloto_aplicou' and autor_id is null and autor_nome = 'Script do Google Ads'
          and detalhe = format('Negativar [aceite copiloto meta] na campanha Aceite Google Pesquisa (ação %s)', v_neg_g)));

    -- 4l · Desfazer o anúncio pausado: nasce reativar_anuncio, aprovado, do
    --      Meta, no mesmo anúncio e conjunto. Desfazer de novo e desfazer o
    --      conjunto que falhou são recusados. A reserva do Google não entrega
    --      o reativar; a do Meta entrega, e não entrega o desfazer do Google.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_d_m := public.midia_copiloto_desfazer(v_anuncio_m);
    v_d_neg := public.midia_copiloto_desfazer(v_neg_g);
    reset role;
    select * into v_linha from public.midia_copiloto_acoes where id = v_d_m;
    v_desfazer := format('%s/%s/%s/%s/%s/%s/%s', v_linha.tipo, v_linha.situacao, v_linha.plataforma,
      v_linha.anuncio_id_externo = an, v_linha.anuncio_nome, v_linha.grupo_id_externo = cj, v_linha.chave = 'desfazer:' || v_anuncio_m);
    foreach v_uid in array array[v_anuncio_m, v_conjunto_m] loop
      begin
        set local role authenticated;
        perform public.midia_copiloto_desfazer(v_uid);
        reset role;
        v_desfazer := v_desfazer || ' aceitou';
      exception when invalid_parameter_value then
        v_desfazer := v_desfazer || ' recusou';
      end;
    end loop;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_desfazer := v_desfazer || ' google:' || (select tipo || '/' || plataforma from public.midia_copiloto_acoes where id = v_d_neg);
    v_res_google := '{}'; v_res_meta := '{}';
    set local role service_role;
    for v_i in 1..200 loop
      select coalesce(array_agg(r.id), '{}') into v_lote_ids from public.midia_copiloto_reservar_acoes(50) r;
      exit when cardinality(v_lote_ids) = 0;
      v_res_google := v_res_google || v_lote_ids;
    end loop;
    for v_i in 1..200 loop
      select coalesce(array_agg(r.id), '{}') into v_lote_ids from public.midia_copiloto_reservar_acoes_meta(20) r;
      exit when cardinality(v_lote_ids) = 0;
      v_res_meta := v_res_meta || v_lote_ids;
    end loop;
    reset role;
    v_desfazer := v_desfazer || format(' reserva_google:%s/%s reserva_meta:%s/%s',
      v_d_neg = any (v_res_google), v_d_m = any (v_res_google),
      v_d_m = any (v_res_meta), v_d_neg = any (v_res_meta));

    -- 4m · As frases dos quatro tipos do Meta.
    select * into v_linha from public.midia_copiloto_acoes where id = v_anuncio_m;
    v_frases := public.midia_copiloto_descrever(v_linha);
    select * into v_linha from public.midia_copiloto_acoes where id = v_d_m;
    v_frases := v_frases || ' | ' || public.midia_copiloto_descrever(v_linha);
    select * into v_linha from public.midia_copiloto_acoes where id = v_conjunto_m;
    v_frases := v_frases || ' | ' || public.midia_copiloto_descrever(v_linha);
    v_linha.tipo := 'reativar_conjunto';
    v_frases := v_frases || ' | ' || public.midia_copiloto_descrever(v_linha);

    -- 4n · O gatilho (como dono, sem sessão: só ele fala). Cada troca de
    --      plataforma ou de anúncio vai junto com uma transição PERMITIDA.
    for v_caso in
      select * from (values
        (format('update public.midia_copiloto_acoes set situacao = ''descartada'', plataforma = ''google'' where id = %L', v_verba_x1m)),
        (format('update public.midia_copiloto_acoes set situacao = ''descartada'', anuncio_nome = ''Outro'' where id = %L', v_verba_m1b)),
        (format('update public.midia_copiloto_acoes set situacao = ''em_aplicacao'', anuncio_id_externo = ''1'' where id = %L', v_d_m)),
        (format('insert into public.midia_copiloto_acoes (plataforma, desfaz_acao_id, chave, tipo, campanha_id_externo, campanha_nome, grupo_id_externo, grupo_nome, anuncio_id_externo, anuncio_nome, motivo, situacao, decidida_por, decidida_em) values (''google'', %L, ''aceite-meta-gatilho-1'', ''reativar_anuncio'', %L, ''c'', %L, ''g'', %L, ''a'', ''m'', ''aprovada'', gen_random_uuid(), now())', v_anuncio_m, m1, cj, an)),
        (format('insert into public.midia_copiloto_acoes (plataforma, desfaz_acao_id, chave, tipo, campanha_id_externo, campanha_nome, grupo_id_externo, grupo_nome, anuncio_id_externo, anuncio_nome, motivo, situacao, decidida_por, decidida_em) values (''meta'', %L, ''aceite-meta-gatilho-2'', ''reativar_anuncio'', %L, ''c'', %L, ''g'', ''12345'', ''a'', ''m'', ''aprovada'', gen_random_uuid(), now())', v_anuncio_m, m1, cj)),
        (format('insert into public.midia_copiloto_acoes (plataforma, desfaz_acao_id, chave, tipo, campanha_id_externo, campanha_nome, grupo_id_externo, grupo_nome, motivo, situacao, decidida_por, decidida_em) values (''meta'', %L, ''aceite-meta-gatilho-3'', ''reativar_conjunto'', %L, ''c'', %L, ''g'', ''m'', ''aprovada'', gen_random_uuid(), now())', v_anuncio_m, m1, cj)),
        (format('delete from public.midia_copiloto_acoes where id = %L', v_anuncio_m))
      ) as t(comando)
    loop
      v_gatilho := v_gatilho + 1;
      begin
        execute v_caso.comando;
        raise warning 'gatilho: passou — %', v_caso.comando;
      exception when raise_exception then
        v_gatilho_ok := v_gatilho_ok + 1;
      end;
    end loop;

    -- 4o · O pedido de verba. No Meta: nasce do Meta, com a verba da campanha,
    --      e substitui o corte do Meta aberto em m1. No Google: segue do Google.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_p_m := public.midia_copiloto_pedir_verba(m1, 60, 'Aceite: convertendo.');
    v_p_g := public.midia_copiloto_pedir_verba(g1, 55, null);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select * into v_linha from public.midia_copiloto_acoes where id = v_p_m;
    v_pedidos := format('meta:%s/%s/%s/%s→%s/%s/%s corte_meta:%s/%s',
      v_linha.plataforma, v_linha.tipo, v_linha.situacao, v_linha.verba_atual, v_linha.verba_nova,
      v_linha.chave = 'verba:' || m1, v_linha.campanha_nome,
      (select situacao from public.midia_copiloto_acoes where id = v_verba_m1b),
      (select descartada_motivo from public.midia_copiloto_acoes where id = v_verba_m1b));
    select * into v_linha from public.midia_copiloto_acoes where id = v_p_g;
    v_pedidos := v_pedidos || format(' google:%s/%s→%s', v_linha.plataforma, v_linha.verba_atual, v_linha.verba_nova);
    v_trilha := v_trilha || ' pediu_meta:' || exists (
      select 1 from public.auditoria_admin
       where acao = 'copiloto_pediu' and autor_id = (v_ids->>'marketing')::uuid
         and detalhe = format('Pedido: Verba de Aceite Meta Leads: R$ 40,00 → R$ 60,00 por dia (ação %s)', v_p_m));

    for v_caso in
      select * from (values
        (m2,    50::numeric, '22023', 'conjuntos de anúncios'::text),
        (x1,    30,          '22023', 'do Google Ads e de uma do Meta'),
        (c9,    30,          'P0002', 'nem as do Meta'),
        (m3,    301,         '22023', 'Gerenciador de Anúncios do Meta'),
        ('abc', 30,          '22023', 'Google Ads ou no Meta')
      ) as t(campanha, verba, codigo, trecho)
    loop
      v_recusas := v_recusas + 1;
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
        set local role authenticated;
        v_uid := public.midia_copiloto_pedir_verba(v_caso.campanha, v_caso.verba, null);
        reset role;
        v_estado := 'aceitou'; v_msg := '';
      exception when others then
        get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
      end;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      if v_estado = v_caso.codigo and strpos(v_msg, v_caso.trecho) > 0 then
        v_recusas_ok := v_recusas_ok + 1;
      else
        raise warning 'pedido %/%: esperava % (%), veio % — %', v_caso.campanha, v_caso.verba, v_caso.codigo, v_caso.trecho, v_estado, v_msg;
      end if;
    end loop;

    -- 4p · Cada regra, tentando gravar o inválido como dono (só o CHECK fala),
    --      e dois controles que têm de entrar. Numa campanha só delas.
    for v_caso in
      select * from (values
        ('midia_copiloto_acoes_tipo_da_plataforma', 'google', 'pausar_conjunto',  true,  cr,   'g',         null::text, null::text, null::text, null::text, null::numeric, null::numeric, false),
        ('midia_copiloto_acoes_tipo_da_plataforma', 'google', 'pausar_anuncio',   true,  cr,   'g',         cr,         'a',        null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_tipo_da_plataforma', 'meta',   'negativar',        true,  null, null,        null,       null,       'x',        'exata',    null,          null,          false),
        ('midia_copiloto_acoes_tipo_da_plataforma', 'meta',   'pausar_grupo',     true,  cr,   'g',         null,       null,       null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_plataforma_valida',  'tiktok', 'mudar_verba',      true,  null, null,        null,       null,       null,       null,       10,            5,             false),
        ('midia_copiloto_acoes_tipo_valido',        'meta',   'excluir_anuncio',  true,  cr,   'g',         cr,         'a',        null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'meta',   'pausar_conjunto',  true,  cr,   null,        null,       null,       null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'meta',   'pausar_conjunto',  true,  cr,   'g',         cr,         'a',        null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'meta',   'pausar_anuncio',   true,  cr,   'g',         cr,         null,       null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'meta',   'pausar_anuncio',   true,  null, null,        cr,         'a',        null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'meta',   'pausar_anuncio',   true,  cr,   'g',         cr,         'a',        null,       null,       10,            5,             false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'meta',   'pausar_anuncio',   true,  cr,   'g',         cr,         'a',        'x',        null,       null,          null,          false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'meta',   'mudar_verba',      true,  null, null,        cr,         'a',        null,       null,       10,            5,             false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'google', 'negativar',        true,  null, null,        null,       'a',        'x',        'exata',    null,          null,          false),
        ('midia_copiloto_acoes_alvo_do_tipo',       'google', 'pausar_grupo',     true,  cr,   'g',         cr,         null,       null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_ids_validos',        'meta',   'pausar_anuncio',   true,  cr,   'g',         'act_1',    'a',        null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_ids_validos',        'meta',   'pausar_anuncio',   true,  cr,   'g',         cr,         '   ',      null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_origem_do_tipo',     'meta',   'reativar_conjunto', true, cr,   'g',         null,       null,       null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_origem_do_tipo',     'meta',   'reativar_anuncio', true,  cr,   'g',         cr,         'a',        null,       null,       null,          null,          false),
        ('midia_copiloto_acoes_origem_do_tipo',     'meta',   'pausar_anuncio',   false, cr,   'g',         cr,         'a',        null,       null,       null,          null,          true),
        ('',                                        'meta',   'pausar_anuncio',   true,  cr,   'g',         cr,         'a',        null,       null,       null,          null,          false),
        ('',                                        'meta',   'pausar_conjunto',  true,  cr,   'g',         null,       null,       null,       null,       null,          null,          false)
      ) as t(regra, plat, tipo, com_diag, grupo, gnome, anuncio, anome, texto, corr, verba_atual, verba_nova, com_pedido)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.midia_copiloto_acoes
          (plataforma, diagnostico_id, chave, tipo, campanha_id_externo, campanha_nome,
           grupo_id_externo, grupo_nome, anuncio_id_externo, anuncio_nome, texto, correspondencia,
           verba_atual, verba_nova, motivo, pedida_por)
        values
          (v_caso.plat, case when v_caso.com_diag then v_diag_m end, 'aceite-meta-regra-' || v_regras,
           v_caso.tipo, cr, 'Aceite Regra', v_caso.grupo, v_caso.gnome, v_caso.anuncio, v_caso.anome,
           v_caso.texto, v_caso.corr, v_caso.verba_atual, v_caso.verba_nova, 'm',
           case when v_caso.com_pedido then (v_ids->>'marketing')::uuid end);
        v_msg := '';
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
      end;
      if v_msg = v_caso.regra then
        v_regras_certas := v_regras_certas + 1;
      else
        raise warning 'regra % (%/%): caiu em %', nullif(v_caso.regra, ''), v_caso.plat, v_caso.tipo, nullif(v_msg, '');
      end if;
    end loop;
    for v_caso in
      select * from (values
        ('midia_copiloto_diagnosticos_plataforma_valida',
         format('insert into public.midia_copiloto_diagnosticos (plataforma, conta, de, ate, dados, resumo) values (''tiktok'', %L, ''2026-10-10'', ''2026-10-16'', ''{}'', ''{}'')', marca)),
        ('midia_copiloto_achados_regra_valida',
         format('insert into public.midia_copiloto_achados (diagnostico_id, ordem, regra, gravidade, titulo, detalhe) values (%L, 90, ''meta_inventada'', ''alta'', ''t'', ''d'')', v_diag_m)),
        ('midia_copiloto_achados_meta_sem_grupo',
         format('insert into public.midia_copiloto_achados (diagnostico_id, ordem, regra, grupo, gravidade, titulo, detalhe) values (%L, 91, ''meta_sem_lead'', ''outros'', ''alta'', ''t'', ''d'')', v_diag_m)),
        ('',
         format('insert into public.midia_copiloto_achados (diagnostico_id, ordem, regra, gravidade, titulo, detalhe) values (%L, 92, ''meta_custo_por_lead'', ''media'', ''t'', ''d'')', v_diag_m)),
        ('midia_anuncios_conjunto_id_valido',
         format('insert into public.midia_anuncios (campanha_id, id_externo, nome, conjunto_id_externo) select id, ''99999999999999998199'', ''x'', ''abc'' from public.midia_campanhas where plataforma = ''meta'' and id_externo = %L', m1)),
        ('midia_anuncios_situacoes_validas',
         format('insert into public.midia_anuncios (campanha_id, id_externo, nome, situacao) select id, ''99999999999999998199'', ''x'', ''ativa'' from public.midia_campanhas where plataforma = ''meta'' and id_externo = %L', m1)),
        ('midia_anuncios_situacoes_validas',
         format('insert into public.midia_anuncios (campanha_id, id_externo, nome, conjunto_situacao) select id, ''99999999999999998199'', ''x'', ''ACTIVE'' from public.midia_campanhas where plataforma = ''meta'' and id_externo = %L', m1))
      ) as t(regra, comando)
      union all
      -- As regras do Meta, cada borda de fora (e um controle na borda de dentro),
      -- numa vigência já encerrada — só o CHECK fala.
      select r.regra,
             'insert into public.midia_copiloto_parametros (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha, '
             'ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo, leads_gclid_minimos, cliques_minimos_gclid, '
             'perda_por_verba_pct, perda_por_ranking_pct, hora_do_diagnostico, vigencia_ate, ' || r.coluna
             || ') values (1, 1, 1, 90, 50, 30, 3, 2, 30, 10, 30, 7, current_date, ' || r.valor || ')'
        from (values
          ('midia_copiloto_parametros_meta_validos', 'meta_gasto_minimo_conjunto', '0'),
          ('midia_copiloto_parametros_meta_validos', 'meta_gasto_minimo_campanha', '100000.01'),
          ('midia_copiloto_parametros_meta_validos', 'meta_vezes_sem_lead',        '0.99'),
          ('midia_copiloto_parametros_meta_validos', 'meta_vezes_sem_lead',        '10.01'),
          ('midia_copiloto_parametros_meta_validos', 'meta_vezes_custo_caro',      '1'),
          ('midia_copiloto_parametros_meta_validos', 'meta_vezes_custo_caro',      '10.01'),
          ('midia_copiloto_parametros_meta_validos', 'meta_leads_maduros_minimos', '0'),
          ('midia_copiloto_parametros_meta_validos', 'meta_leads_maduros_minimos', '501'),
          ('midia_copiloto_parametros_meta_validos', 'meta_dias_para_amadurecer',  '0'),
          ('midia_copiloto_parametros_meta_validos', 'meta_dias_para_amadurecer',  '30'),
          ('',                                       'meta_dias_para_amadurecer',  '29')
        ) as r(regra, coluna, valor)
    loop
      v_regras := v_regras + 1;
      begin
        execute v_caso.comando;
        v_msg := '';
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
      end;
      if v_msg = v_caso.regra then
        v_regras_certas := v_regras_certas + 1;
      else
        raise warning 'regra %: caiu em %', nullif(v_caso.regra, ''), nullif(v_msg, '');
      end if;
    end loop;

    -- 4q · midia_anuncios e midia_diario pela sessão. Marketing e admin não
    --      alteram nem apagam o anúncio sincronizado (0 linhas), nem criam
    --      anúncio em campanha sincronizada, nem levam o manual para uma
    --      (42501). O anúncio de campanha manual entra, muda e sai. O
    --      desempenho não se escreve pela sessão (42501), nem se trunca.
    --      Staff lê; cliente não lê; anon nem chega.
    insert into public.midia_campanhas (nome, plataforma) values ('Aceite Manual Meta', 'meta')
    returning id into v_manual;
    select id into v_camp_m1 from public.midia_campanhas where plataforma = 'meta' and id_externo = m1;
    for v_caso in
      select * from (values
        ('marketing', format('update public.midia_anuncios set nome = ''Aceite Forjado'', conjunto_id_externo = ''1'' where id_externo = %L', an)),
        ('admin',     format('update public.midia_anuncios set situacao = ''encerrada'' where id_externo = %L', an)),
        ('marketing', format('delete from public.midia_anuncios where id_externo = %L', an)),
        ('marketing', format('insert into public.midia_anuncios (campanha_id, id_externo, nome, conjunto_id_externo) values (%L, ''99999999999999998198'', ''Aceite Forjado'', %L)', v_camp_m1, cj)),
        ('marketing', format('insert into public.midia_anuncios (campanha_id, nome) values (%L, ''Aceite Anúncio Manual'')', v_manual)),
        ('marketing', 'update public.midia_anuncios set nome = ''Aceite Anúncio Manual 2'' where nome = ''Aceite Anúncio Manual'''),
        ('marketing', format('update public.midia_anuncios set campanha_id = %L where nome = ''Aceite Anúncio Manual 2''', v_camp_m1)),
        ('marketing', 'delete from public.midia_anuncios where nome = ''Aceite Anúncio Manual 2'''),
        ('marketing', format('update public.midia_diario set investido = 9999 where campanha_id = %L', v_camp_m1)),
        ('admin',     format('delete from public.midia_diario where campanha_id = %L', v_camp_m1)),
        ('marketing', format('insert into public.midia_diario (campanha_id, dia, investido) values (%L, ''2026-10-15'', 1)', v_manual)),
        ('marketing', 'truncate public.midia_anuncios'),
        ('admin',     'truncate public.midia_diario'),
        ('marketing', format('select count(*) from public.midia_anuncios where id_externo = %L', an)),
        ('admin',     format('select count(*) from public.midia_diario where campanha_id = %L', v_camp_m1)),
        ('cliente',   format('select count(*) from public.midia_anuncios where id_externo = %L', an)),
        ('cliente',   format('select count(*) from public.midia_diario where campanha_id = %L', v_camp_m1)),
        ('anon',      format('select count(*) from public.midia_diario where campanha_id = %L', v_camp_m1))
      ) as t(quem, comando)
    loop
      begin
        perform set_config('request.jwt.claims', '', true);
        if v_caso.quem = 'anon' then
          set local role anon;
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', coalesce((v_ids->>v_caso.quem)::uuid, v_cli), 'role', 'authenticated')::text, true);
          set local role authenticated;
        end if;
        if v_caso.comando like 'select%' then
          execute v_caso.comando into v_n2;
        else
          execute v_caso.comando;
          get diagnostics v_n2 = row_count;
        end if;
        reset role;
        v_obtido := v_n2::text;
      exception when others then
        get stacked diagnostics v_obtido = returned_sqlstate;
      end;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_sessao := v_sessao || v_obtido || ' ';
    end loop;
    select v_sessao || format('anuncio:%s/%s/%s diario:%s', a.nome, a.conjunto_id_externo = cj, a.situacao,
             (select sum(investido) from public.midia_diario where campanha_id = v_camp_m1))
      into v_sessao from public.midia_anuncios a where a.id_externo = an;

    -- 4r · As regras do Meta pela porta das regras (sessão de marketing). Com
    --      os 21 argumentos grava os seis do Meta; com os 15 nomeados (a
    --      chamada do site de hoje) copia os do Meta da vigente; a trilha
    --      escreve os valores; sem vigente, vale o padrão da coluna; fora da
    --      faixa, a regra recusa.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_par := public.midia_copiloto_nova_vigencia(15, 60, 120, 85, 40, 25, 4, 3, 40, 15, 35, '{}', '{}', '{}', 6,
                                                 150, 300, 3, 2.5, 10, 5);
    v_regras_meta := format('21:%s/%s/%s/%s/%s/%s', v_par.meta_gasto_minimo_conjunto, v_par.meta_gasto_minimo_campanha,
      v_par.meta_vezes_sem_lead, v_par.meta_vezes_custo_caro, v_par.meta_leads_maduros_minimos, v_par.meta_dias_para_amadurecer);
    v_par := public.midia_copiloto_nova_vigencia(
      p_gasto_minimo_termo => 11, p_gasto_minimo_grupo => 51, p_gasto_minimo_campanha => 101,
      p_ritmo_alto_pct => 90, p_ritmo_baixo_pct => 50, p_reducao_verba_pct => 30, p_iq_baixo => 3,
      p_leads_gclid_minimos => 2, p_cliques_minimos_gclid => 30, p_perda_por_verba_pct => 10,
      p_perda_por_ranking_pct => 30, p_concorrentes => '{}', p_cidades_fora => '{}',
      p_palavras_informativas => '{}', p_hora_do_diagnostico => 7);
    reset role;
    v_regras_meta := v_regras_meta || format(' 15:%s/%s/%s/%s/%s/%s/termo:%s', v_par.meta_gasto_minimo_conjunto,
      v_par.meta_gasto_minimo_campanha, v_par.meta_vezes_sem_lead, v_par.meta_vezes_custo_caro,
      v_par.meta_leads_maduros_minimos, v_par.meta_dias_para_amadurecer, v_par.gasto_minimo_termo);
    v_regras_meta := v_regras_meta || ' trilha:' || exists (
      select 1 from public.auditoria_admin
       where acao = 'copiloto_regras' and autor_id = (v_ids->>'marketing')::uuid
         and detalhe like 'Regras do Copiloto de Mídia: termo 15.00, %; Meta: gasto mínimo 150.00 no conjunto e 300.00 '
                          'na campanha em 14 dias, sem lead a partir de 3.00× o custo por lead, caro a partir de 2.50×, '
                          'qualidade com 10 lead(s) maduro(s) de 5 dia(s)')
      || ' vigentes:' || (select count(*) from public.midia_copiloto_parametros where org_id = v_padrao and vigencia_ate is null);
    -- Sem vigente (como dono, só encerra): o padrão de cada coluna.
    update public.midia_copiloto_parametros set vigencia_ate = current_date
     where org_id = v_padrao and vigencia_ate is null;
    set local role authenticated;
    v_par := public.midia_copiloto_nova_vigencia(10, 50, 100, 90, 50, 30, 3, 2, 30, 10, 30, '{}', '{}', '{}', 7);
    reset role;
    v_regras_meta := v_regras_meta || format(' sem_vigente:%s/%s/%s/%s/%s/%s', v_par.meta_gasto_minimo_conjunto,
      v_par.meta_gasto_minimo_campanha, v_par.meta_vezes_sem_lead, v_par.meta_vezes_custo_caro,
      v_par.meta_leads_maduros_minimos, v_par.meta_dias_para_amadurecer);
    begin
      set local role authenticated;
      perform public.midia_copiloto_nova_vigencia(10, 50, 100, 90, 50, 30, 3, 2, 30, 10, 30, '{}', '{}', '{}', 7,
                                                  p_meta_dias_para_amadurecer => 30);
      reset role;
      v_regras_meta := v_regras_meta || ' faixa:aceitou';
    exception when check_violation then
      get stacked diagnostics v_msg = constraint_name;
      v_regras_meta := v_regras_meta || ' faixa:' || v_msg;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    raise exception 'DESFAZER_ACEITE_COPILOTO_META' using errcode = 'PCP04';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PCP04' then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'marketing' is null or v_anuncio_m is null or v_d_m is null or v_p_m is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou ao fim (usuários, proposta do Meta, desfazer, pedido) — nada foi provado';
  end if;
  if v_gravar_lote <> 'meta:4 google:2 L1:Aceite Anúncio Carro/t/Aceite Conjunto Curitiba/no_ar/no_ar '
                      'L3:Aceite Anúncio Carro v2/t/Aceite Conjunto Curitiba/no_ar/pausada '
                      'google_anuncio:Aceite Anúncio Google/nulo/nulo/nulo/nulo' then
    falhas := falhas + 1; raise warning 'FALHOU: gravar_lote com conjunto e situação — %', v_gravar_lote;
  end if;
  if v_retrato_meta <> 'g1:google/4 m1:meta/5/3/0 achados_meta:meta_sem_lead,meta_custo_por_lead,meta_qualidade,meta_medicao,ritmo_de_verba '
                       'diag:google/meta acoes_meta:meta anuncio:t/Aceite Anúncio Carro/t '
                       'tiktok:22023 reativar:midia_copiloto_acoes_origem_do_tipo depois:proposta' then
    falhas := falhas + 1; raise warning 'FALHOU: retrato do Meta — %', v_retrato_meta;
  end if;
  if v_isolamento <> 'google_nao_descarta_parado_meta:proposta '
                     'meta_nao_descarta_google:4 parado_g:proposta parado_m:descartada/t decidiu:41 '
                     'grupo_g:descartada parado_g:descartada google_nao_descarta_meta:proposta '
                     'm2:2/0 verba_m1:descartada verba_m1b:proposta verba_x1m:proposta/meta anuncio_m:aprovada' then
    falhas := falhas + 1; raise warning 'FALHOU: uma plataforma descartando ou segurando a outra — %', v_isolamento;
  end if;
  if v_reserva <> 'meta_limite_1:1 google:t/f/so_google:t meta:t/f/so_meta:t' then
    falhas := falhas + 1; raise warning 'FALHOU: reservas por plataforma — %', v_reserva;
  end if;
  if v_tentativas <> 'depois_google:falhou/em_aplicacao depois_meta:falhou/em_aplicacao erro_google:t erro_meta:t' then
    falhas := falhas + 1; raise warning 'FALHOU: três entregas sem resposta — %', v_tentativas;
  end if;
  if v_resultado <> 'aplicada aplicada' then
    falhas := falhas + 1; raise warning 'FALHOU: resultado — %', v_resultado;
  end if;
  if v_desfazer <> 'reativar_anuncio/aprovada/meta/t/Aceite Anúncio Carro/t/t recusou recusou google:remover_negativa/google '
                   'reserva_google:t/f reserva_meta:t/f' then
    falhas := falhas + 1; raise warning 'FALHOU: desfazer no Meta — %', v_desfazer;
  end if;
  if v_frases <> 'Pausar o anúncio Aceite Anúncio Carro (Aceite Conjunto Curitiba · Aceite Meta Leads) | '
                 'Reativar o anúncio Aceite Anúncio Carro (Aceite Conjunto Curitiba · Aceite Meta Leads) | '
                 'Pausar o conjunto Aceite Conjunto Curitiba (Aceite Meta Leads) | '
                 'Reativar o conjunto Aceite Conjunto Curitiba (Aceite Meta Leads)' then
    falhas := falhas + 1; raise warning 'FALHOU: frases do Meta — %', v_frases;
  end if;
  if v_gatilho < 7 or v_gatilho_ok <> v_gatilho then
    falhas := falhas + 1; raise warning 'FALHOU: gatilho — % de % recusadas', v_gatilho_ok, v_gatilho;
  end if;
  if v_pedidos <> 'meta:meta/mudar_verba/proposta/40.00→60.00/t/Aceite Meta Leads '
                  'corte_meta:descartada/Substituída pelo pedido de Aceite Meta marketing. google:google/50.00→55.00' then
    falhas := falhas + 1; raise warning 'FALHOU: pedido de verba no Meta — %', v_pedidos;
  end if;
  if v_recusas < 5 or v_recusas_ok <> v_recusas then
    falhas := falhas + 1; raise warning 'FALHOU: recusas do pedido — % de % pelo código e pela frase certos', v_recusas_ok, v_recusas;
  end if;
  if v_regras < 40 or v_regras_certas <> v_regras then
    falhas := falhas + 1; raise warning 'FALHOU: regras — % de % pela regra certa', v_regras_certas, v_regras;
  end if;
  if v_trilha <> 'meta:1 google:1 pediu_meta:true' then
    falhas := falhas + 1; raise warning 'FALHOU: trilha — %', v_trilha;
  end if;
  if v_regras_meta <> '21:150.00/300.00/3.00/2.50/10/5 15:150.00/300.00/3.00/2.50/10/5/termo:11.00 '
                      'trilha:true vigentes:1 sem_vigente:100.00/200.00/2.50/2.00/8/7 '
                      'faixa:midia_copiloto_parametros_meta_validos' then
    falhas := falhas + 1; raise warning 'FALHOU: regras do Meta pela porta das regras — %', v_regras_meta;
  end if;
  if v_sessao <> '0 0 0 42501 1 1 42501 1 42501 42501 42501 42501 42501 1 1 0 0 42501 '
                 'anuncio:Aceite Anúncio Carro v2/t/no_ar diario:12.50' then
    falhas := falhas + 1; raise warning 'FALHOU: anúncio e desempenho pela sessão — %', v_sessao;
  end if;

  -- Nada da prova ficou: nem campanha, nem anúncio, nem ação, nem retrato,
  -- nem trilha, nem usuário — e as ações que já existiam estão como estavam.
  -- Fora de `midia_copiloto_acoes` (travada pelo ALTER desta migração quando
  -- ela roda numa transação), procura-se a MARCA da sonda, não a contagem.
  select jsonb_build_object(
           'aco', (select count(*) from public.midia_copiloto_acoes),
           'aco_situacoes', (select jsonb_object_agg(situacao, n)
                               from (select situacao, count(*) as n from public.midia_copiloto_acoes group by 1) s))
    into v_depois;
  select count(*) into v_restou from auth.users where email like 'aceite-copiloto-meta-%@exemplo.invalido';
  if v_depois <> v_antes or v_restou <> 0
     or (select count(*) from public.midia_copiloto_parametros) <> v_par_n
     or (select id from public.midia_copiloto_parametros where org_id = v_padrao and vigencia_ate is null)
          is distinct from v_par_vigente
     or exists (select 1 from public.midia_campanhas
                 where id_externo = any (array[g1, m1, m2, m3, x1, c9, cr]) or nome = 'Aceite Manual Meta')
     or exists (select 1 from public.midia_anuncios
                 where id_externo = any (array[an, ag, '99999999999999998198', '99999999999999998199'])
                    or nome in ('Aceite Forjado', 'Aceite Anúncio Manual', 'Aceite Anúncio Manual 2'))
     or exists (select 1 from public.midia_copiloto_acoes
                 where campanha_id_externo = any (array[g1, m1, m2, m3, x1, c9, cr]))
     or exists (select 1 from public.midia_copiloto_diagnosticos where conta = marca)
     or exists (select 1 from public.auditoria_admin
                 where detalhe ~ 'Aceite (Meta|Google|Anúncio|Conjunto|Ambígua|Grupo)')
     or public.org_padrao() is distinct from v_padrao then
    falhas := falhas + 1; raise warning 'FALHOU: a prova deixou rastro (% → %, % usuário(s))', v_antes, v_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no Copiloto de Mídia do Meta', falhas;
  end if;

  raise notice
    'Aceite verificado: retrato e ação têm plataforma (google por padrão), a ação tem '
    'anúncio, midia_anuncios tem conjunto e situações, tudo comentado; as regras novas '
    'estão validadas, os dois índices únicos seguem como estavam e os dois novos existem; '
    'nenhuma porta ganhou sobrecarga, a reserva do Meta é só da chave de serviço e roda '
    'como dono, e midia_gravar_lote segue SECURITY INVOKER. A sincronização grava o '
    'conjunto e as situações do anúncio do Meta e o lote seguinte, que não os traz, não '
    'os apaga; o anúncio do Google fica sem nada disso. O retrato do Meta grava as quatro '
    'regras do Meta e as propostas de anúncio e conjunto com plataforma meta, e NÃO '
    'descarta proposta nem pedido parado do Google; o do Google não descarta o Meta; a '
    'janela de "não volta" é por plataforma; plataforma inventada é 22023 e reativar não '
    'nasce de retrato. A reserva do Google não entrega ação do Meta e a do Meta não entrega '
    'a do Google (nem o desfazer de cada uma), a do Meta respeita o limite, e três entregas '
    'sem resposta fecham só a ação da própria plataforma, com a frase dela. O resultado do '
    'Meta vai à trilha como "Copiloto (API do Meta)" e o do Google segue "Script do Google '
    'Ads". Desfazer o anúncio pausado nasce reativar_anuncio aprovado, do Meta, no mesmo '
    'anúncio e conjunto, e não desfaz duas vezes nem o que falhou; as quatro frases do Meta '
    'são as do código; o gatilho recusa trocar plataforma ou anúncio e o desfazer em outra '
    'plataforma, em outro anúncio ou com o inverso errado. O pedido de verba numa campanha '
    'do Meta nasce do Meta e substitui o corte do Meta aberto; % pedidos tortos (verba nos '
    'conjuntos, ID nas duas plataformas, não sincronizada, acima de 10×, ID não numérico) '
    'caem pelo código e pela frase certos; % tentativas inválidas caem na regra certa. Em '
    'midia_anuncios e midia_diario, marketing e admin não alteram nem apagam o anúncio nem '
    'o desempenho sincronizados, não criam anúncio em campanha sincronizada nem levam o '
    'manual para uma, e não truncam; o anúncio de campanha manual entra, muda e sai; staff '
    'lê, cliente não lê e anon não chega. As regras do Meta são colunas da tabela de '
    'parâmetros, com padrão; a porta das regras é uma só, de 21 argumentos: com 21 grava '
    'os do Meta, com os 15 nomeados copia os da vigente, sem vigente usa o padrão da '
    'coluna, escreve os valores na trilha e recusa fora da faixa. A prova não deixou '
    'rastro.', v_recusas, v_regras - 4;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261017150000', 'copiloto_meta')
  on conflict (version) do nothing;
