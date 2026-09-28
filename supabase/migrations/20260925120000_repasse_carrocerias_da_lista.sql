-- ============================================================================
-- Repasse Motors — as carrocerias da lista do repasse
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md, §4.2 e §8.
--
-- `repasse_inscritos.carrocerias` nasceu `text[]` sem CHECK
-- (20260924180000_repasse_fundacao.sql), e a revisão do PR 1 deixou isso
-- anotado para quando o formulário existisse. Ele existe agora (PR 3): a rota
-- de leads grava o que a pessoa marcou em "Tipo de carro". O painel casa o
-- inscrito com o carro por esta coluna (`inscritosQueCombinam`), e um valor
-- fora do vocabulário de `repasses.carroceria` nunca casaria com carro
-- nenhum: a pessoa ficaria na lista sem nunca ser avisada, e ninguém saberia.
--
-- A lista é a mesma de `repasses.carroceria` (CARROCERIAS_DO_REPASSE em
-- src/lib/repasse.ts; tests/migracao-do-repasse-carrocerias.test.ts confere).
-- O formulário oferece quatro (hatch, sedã, SUV, picape); "outro" entra para
-- a lista e a coluna do carro dizerem o mesmo. Vazio é "tanto faz" e passa.
--
-- A tabela só recebe linha pela rota de leads, que ganha o ramo do repasse
-- neste mesmo PR: em produção ela está vazia, e a restrição entra validada.
-- ============================================================================

alter table public.repasse_inscritos drop constraint if exists inscrito_carrocerias_da_lista;
alter table public.repasse_inscritos add constraint inscrito_carrocerias_da_lista
  check (carrocerias <@ array['hatch', 'seda', 'suv', 'picape', 'outro']::text[]);

-- ----------------------------------------------------------------------------
-- Autoconferência: cada violação recusada PELA RESTRIÇÃO CERTA, e a lista
-- legítima aceita.
-- ----------------------------------------------------------------------------
do $$
declare
  falhas     int := 0;
  restricao  text;
  controle   uuid;
begin
  -- 1. carroceria fora da lista
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-carrocerias-1', array['conversivel']);
    falhas := falhas + 1;
    raise notice 'fora da lista: passou';
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'inscrito_carrocerias_da_lista' then
      falhas := falhas + 1;
      raise notice 'fora da lista: esperava inscrito_carrocerias_da_lista, veio %', restricao;
    end if;
  end;

  -- 2. uma boa e uma ruim no mesmo array
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-carrocerias-2', array['hatch', 'van']);
    falhas := falhas + 1;
    raise notice 'array misto: passou';
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'inscrito_carrocerias_da_lista' then
      falhas := falhas + 1;
      raise notice 'array misto: esperava inscrito_carrocerias_da_lista, veio %', restricao;
    end if;
  end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram ou foram barradas pela restrição errada', falhas;
  end if;

  -- Controle positivo: as quatro do formulário e o "tanto faz" (vazio) entram.
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-carrocerias-3', array['hatch', 'seda', 'suv', 'picape'])
    returning id into controle;
    delete from public.repasse_inscritos where id = controle;

    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-carrocerias-4', '{}')
    returning id into controle;
    delete from public.repasse_inscritos where id = controle;
  exception when check_violation then
    raise exception 'ACEITE FALHOU: a lista legítima foi recusada (%)', sqlerrm;
  end;

  raise notice 'Repasse (carrocerias da lista) OK: fora da lista recusado pela restrição certa; as quatro do formulário e o vazio entram.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260925120000', 'repasse_carrocerias_da_lista')
  on conflict (version) do nothing;
