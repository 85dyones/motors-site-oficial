-- ============================================================================
-- Saúde da atribuição dos leads (2026-09-21)
-- ============================================================================
--
-- Aplicada em produção pelo MCP do Supabase, que carimbou a versão
-- 20260921090901; o nome do arquivo segue essa versão para o histórico do
-- banco e o do repositório baterem.
--
-- O termômetro do pré-voo antes de religar Google Ads e Meta Ads: quanto de
-- cada lead chega com o que liga ele à mídia que o trouxe.
--
-- Por que uma view, e não uma consulta salva
-- ------------------------------------------
-- A leitura certa desse número já enganou uma vez. Em 2026-09-20, "10 de 14
-- leads sem `event_id`" parecia CAPI quebrada — e não era: 8 desses 10 são do
-- canal `WhatsApp`, criados pelo webhook do Chatwoot (conversa que começou no
-- WhatsApp, sem sessão no site, sem `event_id` possível). Os formulários do
-- site estavam 4 de 4. Por isso a view quebra por CANAL: somar tudo numa
-- linha só esconde exatamente essa diferença.
--
-- Como ler
-- --------
-- - Canais de formulário do site (`WhatsApp Proposta`, `WhatsApp Dúvidas`,
--   `Appraisal Chat`, `Avaliação`, `Pole Position`...): `com_event_id` deve
--   ser igual a `leads`, descontado quem se opôs ao rastreamento. `com_fbp`,
--   `com_utm_source` e, para tráfego pago, `com_gclid`/`com_fbclid` passam a
--   ser preenchidos a partir de `lib/contextoDeMidia.ts`.
-- - Canal `WhatsApp` (Chatwoot): colunas web zeradas é o esperado.
-- - `capi_meta_status` e `gec_status` ficam de FORA de propósito: nada no
--   código escreve nelas desde o desenho antigo de marketing, e o valor
--   padrão 'aguardando' não prova nada. O envio real se confere no dataset
--   da Meta.
--
-- Segurança
-- ---------
-- Só contagem, dia e canal — nenhuma coluna pessoal sai daqui. E é
-- `security_invoker`, como `agenda_de_pessoas`: a RLS de `leads` (`is_staff`)
-- vale na pele de quem consulta, então a view não abre nada que a tabela já
-- não abrisse.
-- ============================================================================

create or replace view public.saude_da_atribuicao_dos_leads
with (security_invoker = true) as
select
  (l.created_at at time zone 'America/Sao_Paulo')::date as dia,
  coalesce(l.canal, '(sem canal)')                       as canal,
  count(*)                                               as leads,
  count(l.event_id)                                      as com_event_id,
  count(l.fbp)                                           as com_fbp,
  count(l.fbc)                                           as com_fbc,
  count(l.gclid)                                         as com_gclid,
  count(l.fbclid)                                        as com_fbclid,
  count(l.utm_source)                                    as com_utm_source,
  count(l.veiculo_id)                                    as com_veiculo_id
from public.leads l
group by 1, 2;

comment on view public.saude_da_atribuicao_dos_leads is
  'Preenchimento dos identificadores de mídia por dia (America/Sao_Paulo) e '
  'canal. Só contagens, sem PII. security_invoker: vale a RLS de leads. '
  'Canal WhatsApp vem do Chatwoot e não tem identificador web por natureza. '
  'Ver supabase/migrations/20260921090901_saude_da_atribuicao_dos_leads.sql.';

revoke all on public.saude_da_atribuicao_dos_leads from anon;
grant select on public.saude_da_atribuicao_dos_leads to authenticated, service_role;
