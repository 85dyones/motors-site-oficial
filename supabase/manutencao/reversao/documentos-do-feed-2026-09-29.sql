-- ============================================================================
-- Reversão do preenchimento de 2026-09-29 — documentos do feed nos carros já importados
-- ============================================================================
-- O que foi feito: depois de aplicada a migração 20260929120000, os 44 carros
-- do feed que já estavam no banco receberam placa, chassi, motor e FIPE do XML
-- do RevendaMais baixado na hora, PELA PRÓPRIA TRAVA (UPDATE como service_role,
-- sem tocar `last_seen_at`) — as mesmas regras do sync: preencher o vazio, não
-- trocar o que existe, não gravar documento de outro carro, FIPE segue o feed.
--
-- Resultado: 23 placas, 21 chassis, 23 motores, 34 valor_fipe e 26 codigo_fipe;
-- 23 lastmods movidos (os do motor). 0 placa ou chassi existente trocado, 0
-- mudança em preço, last_seen_at, portas, opcionais, descrição, vendido ou
-- estado.
--
-- Os chassis de 8446229 (Spin) e 8506571 (Logan) ficaram DE FORA: no
-- RevendaMais eles têm a letra O no lugar de zero, e VIN não usa O. Gravados,
-- ficariam congelados pela regra do vazio e iriam para a venda sem ninguém ver.
-- Corrigir no RevendaMais primeiro; o próximo sync (com o n8n atualizado) traz.
--
-- Este arquivo é o estado ANTERIOR das colunas que mudaram, um UPDATE por carro.
-- Placa e chassi só aparecem como `null` — o anterior era vazio — então nenhum
-- documento está aqui. Não é migração e não tem rodapé.
--
-- Aplicar pelo pooler, com ensaio antes:
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/documentos-do-feed-2026-09-29.sql
--   node supabase/manutencao/aplicar-migracao.js supabase/manutencao/reversao/documentos-do-feed-2026-09-29.sql --gravar
--
-- ⚠️ Antes de rodar, leia:
-- - Sem BEGIN/COMMIT aqui dentro: o script já abre a transação, e um COMMIT no
--   meio do arquivo gravaria o ensaio.
-- - Rodar como postgres, NUNCA como service_role: a trava trataria a escrita
--   como sync e não deixaria apagar nada.
-- - Isto não confere se o valor atual ainda é o do preenchimento: placa ou
--   motor corrigidos no painel DEPOIS de 29/09 seriam apagados junto. Confira
--   os carros antes.
-- - Enquanto a trava da 20260929120000/170000 e o workflow novo estiverem de
--   pé, o próximo ciclo do sync preenche tudo de novo. Desfazer de verdade é
--   reverter os três — as duas funções e o upsert do n8n — antes deste arquivo.
-- - O gatilho do lastmod fica desligado DENTRO da transação: ligado, ele
--   descartaria o `conteudo_atualizado_em` escrito aqui ("quem decide é o
--   banco", 20260817120000) e voltar o motor a vazio carimbaria agora.
-- ============================================================================

alter table public.estoque_motors disable trigger estoque_motors_conteudo_atualizado;
update public.estoque_motors set valor_fipe = 48655.00 where id = 7416830;
update public.estoque_motors set valor_fipe = 70875.00 where id = 7812719;
update public.estoque_motors set valor_fipe = 300156.00 where id = 7947766;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-17T19:00:46.78545+00:00' where id = 8009174;
update public.estoque_motors set valor_fipe = 48686.00 where id = 8059102;
update public.estoque_motors set valor_fipe = 175639.00 where id = 8171616;
update public.estoque_motors set valor_fipe = 51175.00 where id = 8201426;
update public.estoque_motors set valor_fipe = 49643.00 where id = 8203724;
update public.estoque_motors set valor_fipe = 83643.00 where id = 8252284;
update public.estoque_motors set valor_fipe = 70956.00 where id = 8299212;
update public.estoque_motors set valor_fipe = 48455.00 where id = 8335025;
update public.estoque_motors set valor_fipe = 67046.00 where id = 8335204;
update public.estoque_motors set valor_fipe = 46885.00 where id = 8358193;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-23T15:00:03.071683+00:00' where id = 8392391;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-16T21:53:54.669058+00:00' where id = 8392516;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-23T21:00:06.978004+00:00' where id = 8402155;
update public.estoque_motors set placa = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-17T19:00:46.78545+00:00' where id = 8407873;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-16T21:53:55.104085+00:00' where id = 8422260;
update public.estoque_motors set placa = null, chassi = null, motor = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-17T19:00:46.78545+00:00' where id = 8429524;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-16T16:26:58.115056+00:00' where id = 8440742;
update public.estoque_motors set placa = null, chassi = null, valor_fipe = null, codigo_fipe = null where id = 8443691;
update public.estoque_motors set placa = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-17T19:00:46.78545+00:00' where id = 8446229;
update public.estoque_motors set placa = null, chassi = null, motor = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-24T21:00:05.276069+00:00' where id = 8449096;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-17T19:00:46.78545+00:00' where id = 8449150;
update public.estoque_motors set placa = null, chassi = null, motor = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-17T19:00:46.78545+00:00' where id = 8453942;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-15T20:52:55.090774+00:00' where id = 8454320;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-22T15:05:47.752731+00:00' where id = 8464513;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-23T14:59:48.474849+00:00' where id = 8471948;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-16T02:00:41.32888+00:00' where id = 8474002;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-22T12:20:40.366033+00:00' where id = 8475062;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-15T20:58:52.789637+00:00' where id = 8475623;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-22T15:04:14.961974+00:00' where id = 8479269;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-25T19:12:56.734831+00:00' where id = 8491439;
update public.estoque_motors set placa = null, chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-24T13:46:07.245758+00:00' where id = 8497421;
update public.estoque_motors set valor_fipe = null, codigo_fipe = null where id = 8506096;
update public.estoque_motors set placa = null, motor = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-29T16:17:02.769937+00:00' where id = 8506571;
update public.estoque_motors set valor_fipe = null, codigo_fipe = null where id = 8517481;
update public.estoque_motors set chassi = null, motor = null, valor_fipe = null, codigo_fipe = null, conteudo_atualizado_em = '2026-09-29T18:29:55.012367+00:00' where id = 8517681;
alter table public.estoque_motors enable trigger estoque_motors_conteudo_atualizado;
