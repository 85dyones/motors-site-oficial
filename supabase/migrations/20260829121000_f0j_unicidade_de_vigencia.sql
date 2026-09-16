-- ============================================================================
-- F0-j — Uma linha vigente por régua, e append-only sem a fresta do TRUNCATE
-- ============================================================================
-- Da revisão do qa-guardian sobre a F0 (2026-08-29), itens 1 e 3:
--
-- 1. O guarda D-T1.7 tranca UPDATE, mas nada impedia DUAS linhas vigentes da
--    mesma regra — e regra dobrada vira contabilização dobrada quando a F1
--    ligar o automático. Índices únicos parciais fecham; de quebra, os seeds
--    da f0e/f0f deixam de ser re-inseríveis (o `on conflict` passa a ter alvo
--    real de conflito).
-- 2. Trigger row-level não dispara em TRUNCATE: revogar dos papéis de API
--    fecha a última porta de apagamento em massa das append-only.
-- ============================================================================

-- Uma regra de contabilização vigente por (evento, papel, modalidade, saída).
-- `nulls not distinct` (PG15+) em vez de coalesce: o cast enum→text não é
-- IMMUTABLE e o Postgres recusa a expressão no índice — e, com NULL distinto
-- por padrão, "modalidade nula" duplicaria à vontade.
create unique index if not exists regras_contabilizacao_uma_vigente
  on public.regras_contabilizacao (evento, papel, modalidade, saida)
  nulls not distinct
  where vigencia_ate is null;

-- Uma regra de comissão vigente por saída.
create unique index if not exists regras_comissao_uma_vigente
  on public.regras_comissao (saida)
  where vigencia_ate is null;

-- Uma curva de avaliação vigente por org.
create unique index if not exists parametros_avaliacao_um_vigente
  on public.parametros_avaliacao (org_id)
  where vigencia_ate is null;

-- Um conjunto de parâmetros do Ciclo vigente por org.
create unique index if not exists ciclo_parametros_um_vigente
  on public.ciclo_parametros (org_id)
  where vigencia_ate is null;

-- TRUNCATE fora do alcance da API nas append-only (service_role fica: é a
-- chave de operação, já fora da RLS por natureza).
revoke truncate on public.veiculo_eventos, public.auditoria,
  public.lancamentos, public.partidas, public.anuncios
from anon, authenticated;

-- ----------------------------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------------------------
do $$
declare
  falhas int := 0;
begin
  -- 1. Segunda linha vigente da MESMA regra: recusa.
  begin
    insert into public.regras_contabilizacao
      (evento, papel, conta_debito, conta_credito, base_valor)
    values ('SINAL', 'sinal', '1.1.1', '2.1.3', 'valor_sinal');
    falhas := falhas + 1;
  exception when unique_violation then null; end;

  -- 2. Segundo parâmetro do Ciclo vigente: recusa.
  begin
    insert into public.ciclo_parametros
      (intervalo_km, intervalo_meses, janela_dias, janela_km, doc_prazo_dias,
       recupera_dias, max_recuperacoes_ciclo, franquia_km_ano, percentuais, excludentes)
    values (10000, 12, 30, 1000, 30, 60, 1, 15000, '{}'::jsonb, array['aceite']);
    falhas := falhas + 1;
  exception when unique_violation then null; end;

  -- 3. TRUNCATE revogado dos papéis de API.
  if has_table_privilege('authenticated', 'public.partidas', 'TRUNCATE')
     or has_table_privilege('anon', 'public.veiculo_eventos', 'TRUNCATE') then
    falhas := falhas + 1;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % brecha(s) seguem abertas', falhas;
  end if;

  raise notice 'F0-j OK: vigência única garantida e TRUNCATE fora da API.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829121000', 'f0j_unicidade_de_vigencia')
  on conflict (version) do nothing;
