-- ============================================================================
-- O gclid do iPhone: `gbraid` e `wbraid` passam a ser guardados no lead
-- ============================================================================
-- Pedido do dono (2026-10-14), junto com o Copiloto de Mídia: "certifique-se
-- de não perdermos dados de gclid no iPhone".
--
-- O Google não manda `gclid` em todo clique. No tráfego de iOS (e de app) ele
-- manda `gbraid`; em parte do inventário web (PMax, YouTube), `wbraid` — NO
-- LUGAR do `gclid`, não junto. O site já lê os dois da URL desde 27/08
-- (`CHAVES_DE_CAMPANHA` em src/lib/telemetry.ts) e os manda no corpo do lead,
-- mas `contextoDeMidiaDoLead` (src/lib/contextoDeMidia.ts) os descartava de
-- propósito: `leads` não tinha coluna para eles, e coluna inexistente no
-- `insert` do PostgREST derruba a LINHA inteira — o lead se perderia por causa
-- de um parâmetro opcional. Resultado: o lead de quem clicou no anúncio pelo
-- iPhone chegava sem identificador de clique nenhum, e sem ele não há conversão
-- offline (o upload do Google aceita gclid, gbraid ou wbraid) nem como dizer
-- de qual anúncio veio a venda. É parte do "2 de 62 leads com gclid" de 21 dias.
--
-- A atribuição que o PRÓPRIO Google faz da conversão do site não dependia
-- disto: o Conversion Linker do GTM guarda o `gbraid` no cookie `_gcl_gb`. O
-- que se perdia era a cópia da loja, na linha do lead.
--
-- O que muda
-- ----------
-- 1. `leads.gbraid` e `leads.wbraid`, texto, nulos. Sem CHECK de tamanho: o
--    site descarta valor acima de 500 caracteres antes de gravar
--    (`LIMITE_DO_PARAMETRO`), e um CHECK aqui transformaria valor estranho em
--    lead perdido — o oposto do pedido. Mesma régua do `gclid`, que nunca teve.
-- 2. `saude_da_atribuicao_dos_leads` ganha `com_gbraid` e `com_wbraid` NO FIM
--    (`create or replace view` só aceita coluna nova depois das que existem).
--    Continua `security_invoker`, só contagem, sem dado de pessoa.
--
-- Ordem de implantação: esta migração ANTES do site que grava as colunas. Site
-- novo em banco velho = o insert do lead com `gbraid` cai inteiro.
--
-- ⚠️ DESFAZER (as duas colunas se perdem; o site precisa voltar antes, senão
--    todo lead com gbraid ou wbraid falha ao gravar):
--
--   begin;
--   create or replace view public.saude_da_atribuicao_dos_leads ... (a definição
--     de 20260921090901, sem as duas últimas colunas — exige drop view antes);
--   alter table public.leads drop column if exists gbraid, drop column if exists wbraid;
--   delete from supabase_migrations.schema_migrations where version = '20261014160000';
--   commit;
--
-- Aditiva (duas colunas nulas numa tabela que existe; a view só ganha colunas
-- no fim) e idempotente (`add column if not exists`, `create or replace view`,
-- comment e revoke/grant reaplicáveis).
-- ============================================================================

do $previa$
begin
  if to_regclass('public.leads') is null then
    raise exception 'DEPENDÊNCIA: public.leads não existe. Nada foi aplicado.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'leads' and column_name = 'gclid') then
    raise exception 'DEPENDÊNCIA: public.leads não tem gclid; esta migração acompanha a coluna. Nada foi aplicado.';
  end if;
end $previa$;

alter table public.leads
  add column if not exists gbraid text,
  add column if not exists wbraid text;

comment on column public.leads.gbraid is
  'Identificador de clique do Google Ads que vem NO LUGAR do gclid no tráfego de '
  'iOS e de app. Lido da URL pelo site (CHAVES_DE_CAMPANHA, telemetry.ts) e '
  'gravado por contextoDeMidiaDoLead. Serve ao upload de conversão offline, que '
  'aceita gclid, gbraid ou wbraid. Ver 20261014160000_gbraid_e_wbraid_no_lead.sql.';
comment on column public.leads.wbraid is
  'Identificador de clique do Google Ads que vem NO LUGAR do gclid em parte do '
  'inventário web (PMax, YouTube). Mesmo caminho e mesmo uso de gbraid.';

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
  count(l.veiculo_id)                                    as com_veiculo_id,
  count(l.gbraid)                                        as com_gbraid,
  count(l.wbraid)                                        as com_wbraid
from public.leads l
group by 1, 2;

comment on view public.saude_da_atribuicao_dos_leads is
  'Preenchimento dos identificadores de mídia por dia (America/Sao_Paulo) e '
  'canal. Só contagens, sem PII. security_invoker: vale a RLS de leads. '
  'Canal WhatsApp vem do Chatwoot e não tem identificador web por natureza. '
  'O clique do Google chega como gclid, gbraid (iOS/app) ou wbraid (PMax, '
  'YouTube): some os três. Ver 20260921090901 e 20261014160000.';

revoke all on public.saude_da_atribuicao_dos_leads from anon;
grant select on public.saude_da_atribuicao_dos_leads to authenticated, service_role;


-- ============================================================================
-- Autoconferência — estrutural. Não insere lead: em produção, `leads` tem os
-- gatilhos do funil e do rodízio, e uma sonda aqui não prova nada que a
-- estrutura não prove.
-- ============================================================================
do $aceite$
declare
  falhas   int := 0;
  v_coluna text;
  v_cols   text[];
begin
  foreach v_coluna in array array['gbraid', 'wbraid'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'leads'
                      and column_name = v_coluna and data_type = 'text' and is_nullable = 'YES') then
      falhas := falhas + 1;
      raise warning 'FALHOU: leads.% ausente, não é texto ou não aceita nulo', v_coluna;
    end if;
    if col_description('public.leads'::regclass,
         (select attnum from pg_attribute where attrelid = 'public.leads'::regclass and attname = v_coluna)) is null then
      falhas := falhas + 1;
      raise warning 'FALHOU: leads.% sem comentário', v_coluna;
    end if;
  end loop;

  -- Nenhum CHECK novo pode recusar o lead por causa destas colunas.
  if exists (select 1 from pg_constraint
              where conrelid = 'public.leads'::regclass and contype = 'c'
                and (pg_get_constraintdef(oid) ilike '%gbraid%' or pg_get_constraintdef(oid) ilike '%wbraid%')) then
    falhas := falhas + 1;
    raise warning 'FALHOU: há CHECK sobre gbraid/wbraid — valor estranho viraria lead perdido';
  end if;

  select array_agg(column_name::text order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'saude_da_atribuicao_dos_leads';
  if v_cols is distinct from array['dia', 'canal', 'leads', 'com_event_id', 'com_fbp', 'com_fbc',
                                   'com_gclid', 'com_fbclid', 'com_utm_source', 'com_veiculo_id',
                                   'com_gbraid', 'com_wbraid'] then
    falhas := falhas + 1;
    raise warning 'FALHOU: colunas da view saíram %', v_cols;
  end if;
  if not exists (select 1 from pg_class
                  where oid = 'public.saude_da_atribuicao_dos_leads'::regclass
                    and 'security_invoker=true' = any (reloptions)) then
    falhas := falhas + 1;
    raise warning 'FALHOU: a view deixou de ser security_invoker';
  end if;
  if has_table_privilege('anon', 'public.saude_da_atribuicao_dos_leads', 'SELECT') then
    falhas := falhas + 1;
    raise warning 'FALHOU: anon lê a view';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no gbraid/wbraid do lead', falhas;
  end if;
  raise notice 'Aceite verificado: leads.gbraid e leads.wbraid existem, texto, nulos, comentados e sem CHECK que recuse lead; a view de saúde da atribuição conta os dois no fim, segue security_invoker e fechada ao anon.';
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261014160000', 'gbraid_e_wbraid_no_lead')
  on conflict (version) do nothing;
