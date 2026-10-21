-- ============================================================================
-- Atendimento por IA: o Ney encerra a conversa e agenda a retomada
-- ============================================================================
-- Pedido do dono (2026-10-21): *"o Ney precisa fechar conversas também,
-- gerenciar os contatos, além de aquecer, da mesma forma como ele marca
-- visitas, pode fechar a conversa e deixar a cadência agendada para o futuro,
-- com um espaço maior dependendo do momento da compra"*.
--
-- Quando o cliente diz que compra mais adiante, o Ney se despede e agenda a
-- cadência nova `retomada` em `leads.cadencia`: o 1º toque na data combinada
-- (uma semana antes da data que o cliente disse; sem data, 7, 30 ou 60 dias
-- pelo prazo da compra), os outros 7 e 15 dias depois. A régua mora em
-- `atendimento_config.cadencias` (jsonb, sem coluna nova): a linha da loja
-- que não a tiver usa a de fábrica do código.
--
-- Só troca a regra `leads_cadencia_valida` da 20261020120000 pela que aceita
-- a cadência nova. Sem esta migração o código grava a retomada como a
-- cadência do silêncio, na mesma data. Idempotente: a regra que já a aceita
-- fica.
-- ============================================================================

do $cadencias$
declare
  v_definicao text;
begin
  select pg_get_constraintdef(oid) into v_definicao
    from pg_constraint
   where conrelid = 'public.leads'::regclass and conname = 'leads_cadencia_valida';

  if v_definicao is not null and v_definicao not like '%''retomada''%' then
    alter table public.leads drop constraint leads_cadencia_valida;
    v_definicao := null;
  end if;

  if v_definicao is null then
    alter table public.leads add constraint leads_cadencia_valida check (
      cadencia is null or cadencia in ('follow_up', 'reativacao', 'engajamento', 'retomada')
    );
  end if;
end
$cadencias$;

do $aceite$
declare
  v_definicao text;
begin
  select pg_get_constraintdef(oid) into v_definicao
    from pg_constraint
   where conrelid = 'public.leads'::regclass and conname = 'leads_cadencia_valida';
  if v_definicao is null
     or v_definicao not like '%''retomada''%'
     or v_definicao not like '%''follow_up''%'
     or v_definicao not like '%''reativacao''%'
     or v_definicao not like '%''engajamento''%' then
    raise exception 'ACEITE FALHOU: leads_cadencia_valida não aceita a retomada e as cadências de antes (%)', coalesce(v_definicao, 'ausente');
  end if;
  raise notice 'Aceite verificado: a cadência aceita retomada, e as de antes continuam.';
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261029120000', 'cadencia_retomada')
  on conflict (version) do nothing;
