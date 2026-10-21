-- ============================================================================
-- Atendimento por IA: reclamação e pós-venda vão direto ao atendente
-- ============================================================================
-- Pedido do dono depois do primeiro teste em produção (2026-10-21): *"se
-- alguém tiver reclamação ou pós-venda, assuma uma postura séria, receba o
-- atendimento e transfira direto pro atendente pós triagem"*.
--
-- O assistente faz a triagem em tom sério (o que aconteceu, qual carro,
-- quando comprou) e entrega o lead com um motivo novo em
-- `leads.entregue_motivo`:
--
--   pos_venda ... reclamação ou pós-venda, entregue depois da triagem — fora
--                 do rodízio: sem dono, vai a quem distribui e ao gestor.
--
-- O sinal da conversa (`pos_venda`) mora em `leads.qualificacao`, que é
-- jsonb: não precisa de coluna. Sem esta migração o código grava a entrega
-- como `pediu_humano` (o mais perto), e o cabeçalho e a etiqueta dizem o resto.
--
-- Só troca a regra `leads_entregue_motivo_valido` da 20261022120000 pela que
-- aceita o motivo novo. Idempotente: a regra que já o aceita fica.
-- ============================================================================

do $motivos$
declare
  v_definicao text;
begin
  select pg_get_constraintdef(oid) into v_definicao
    from pg_constraint
   where conrelid = 'public.leads'::regclass and conname = 'leads_entregue_motivo_valido';

  if v_definicao is not null and v_definicao not like '%''pos_venda''%' then
    alter table public.leads drop constraint leads_entregue_motivo_valido;
    v_definicao := null;
  end if;

  if v_definicao is null then
    alter table public.leads add constraint leads_entregue_motivo_valido check (
      entregue_motivo is null
      or entregue_motivo in ('agendou', 'simulacao', 'quente', 'pediu_humano', 'pediu_condicao', 'pos_venda', 'painel')
    );
  end if;
end
$motivos$;

do $aceite$
declare
  v_definicao text;
begin
  select pg_get_constraintdef(oid) into v_definicao
    from pg_constraint
   where conrelid = 'public.leads'::regclass and conname = 'leads_entregue_motivo_valido';
  if v_definicao is null
     or v_definicao not like '%''pos_venda''%'
     or v_definicao not like '%''agendou''%'
     or v_definicao not like '%''simulacao''%'
     or v_definicao not like '%''quente''%'
     or v_definicao not like '%''pediu_humano''%'
     or v_definicao not like '%''painel''%' then
    raise exception 'ACEITE FALHOU: leads_entregue_motivo_valido não aceita o pós-venda e os motivos de antes (%)', coalesce(v_definicao, 'ausente');
  end if;
  raise notice 'Aceite verificado: a entrega aceita pos_venda, e os motivos de antes continuam.';
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261027120000', 'entrega_pos_venda')
  on conflict (version) do nothing;
