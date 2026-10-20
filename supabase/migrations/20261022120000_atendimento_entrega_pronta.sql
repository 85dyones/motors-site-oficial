-- ============================================================================
-- Atendimento por IA: a entrega do lead PRONTO para o comercial
-- ============================================================================
-- Pedido do dono no teste do atendimento 2.0 (2026-10-20): *"o Ney precisa
-- ser mais incisivo no objetivo [...] a meta é entregar o lead pronto para o
-- comercial, com data de agendamento e horário ou com dados para simulação"*.
--
-- O assistente passou a seguir o método da loja, os 5P (Produto, Pagamento,
-- Pessoa, Prazo e Passo — `src/lib/metodoDeQualificacao.ts`), e entrega o lead
-- ao vendedor quando chega a um dos dois finais do Passo. Cada final é um
-- motivo de entrega novo em `leads.entregue_motivo`:
--
--   agendou ..... a visita ou o test-drive marcado, com dia e hora;
--   simulacao ... os dados da simulação completos (carro exato, financiado,
--                 entrada e parcela).
--
-- A ficha do método (nome, uso, parcela, quem decide, dia e hora da visita)
-- mora em `leads.qualificacao`, que é jsonb: não precisa de coluna.
--
-- Só troca a regra `leads_entregue_motivo_valido` da 20261020120000 pela que
-- aceita os dois motivos novos. Idempotente: a regra que já os aceita fica.
-- ============================================================================

do $motivos$
declare
  v_definicao text;
begin
  select pg_get_constraintdef(oid) into v_definicao
    from pg_constraint
   where conrelid = 'public.leads'::regclass and conname = 'leads_entregue_motivo_valido';

  if v_definicao is not null and v_definicao not like '%''agendou''%' then
    alter table public.leads drop constraint leads_entregue_motivo_valido;
    v_definicao := null;
  end if;

  if v_definicao is null then
    alter table public.leads add constraint leads_entregue_motivo_valido check (
      entregue_motivo is null
      or entregue_motivo in ('agendou', 'simulacao', 'quente', 'pediu_humano', 'pediu_condicao', 'painel')
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
     or v_definicao not like '%''agendou''%'
     or v_definicao not like '%''simulacao''%'
     or v_definicao not like '%''quente''%'
     or v_definicao not like '%''painel''%' then
    raise exception 'ACEITE FALHOU: leads_entregue_motivo_valido não aceita os motivos da entrega pronta (%)', coalesce(v_definicao, 'ausente');
  end if;
  raise notice 'Aceite verificado: a entrega aceita agendou e simulacao, e os motivos de antes continuam.';
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261022120000', 'atendimento_entrega_pronta')
  on conflict (version) do nothing;
