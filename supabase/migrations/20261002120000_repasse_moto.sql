-- ============================================================================
-- Repasse Motors — a moto com carroceria própria
-- ============================================================================
-- Pedido do dono em 02/10, literal: "Moto deve ter sua categoria, assim como
-- no estoque". Até aqui a moto entrava no repasse como "outro" — inclusive a
-- que vem do estoque pela busca do "Novo carro de repasse"
-- (`carroceriaDoTipo` em src/lib/estoqueParaORepasse.ts) — e casava com quem
-- se inscreveu querendo "qualquer carro".
--
-- `moto` entra no vocabulário de carroceria nas DUAS restrições: a do carro
-- (`repasses_carroceria_check`, da fundação 20260924180000 — o nome é o que o
-- Postgres gera para a CHECK inline, conferido em produção em 01/10) e a da
-- lista (`inscrito_carrocerias_da_lista`, 20260925120000). O painel casa uma
-- com a outra, e as duas precisam dizer o mesmo. A lista é a de
-- CARROCERIAS_DO_REPASSE (src/lib/repasse.ts);
-- tests/migracao-do-repasse-moto.test.ts confere.
--
-- Só alarga: todo valor que passava continua passando, e as duas restrições
-- são recriadas dentro da mesma transação, como em 20260925120000.
--
-- Ensaio com ROLLBACK antes; gravar só com ordem do dono. O código que oferece
-- a moto depende desta migração: ela vai antes do deploy.
-- ============================================================================

alter table public.repasses drop constraint if exists repasses_carroceria_check;
alter table public.repasses add constraint repasses_carroceria_check
  check (carroceria is null or carroceria in ('hatch', 'seda', 'suv', 'picape', 'moto', 'outro'));

alter table public.repasse_inscritos drop constraint if exists inscrito_carrocerias_da_lista;
alter table public.repasse_inscritos add constraint inscrito_carrocerias_da_lista
  check (carrocerias <@ array['hatch', 'seda', 'suv', 'picape', 'moto', 'outro']::text[]);

-- ----------------------------------------------------------------------------
-- Autoconferência: cada violação recusada PELA RESTRIÇÃO CERTA, e a moto
-- aceita no carro e na lista.
-- ----------------------------------------------------------------------------
do $$
declare
  falhas     int := 0;
  restricao  text;
  controle   uuid;
begin
  -- 1. carroceria fora da lista, no carro
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, carroceria)
    values ('aceite-moto-1', 'T', 'T', 2020, 1, 1, 'van');
    falhas := falhas + 1;
    raise notice 'carroceria fora da lista: passou';
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasses_carroceria_check' then
      falhas := falhas + 1;
      raise notice 'carroceria fora da lista: esperava repasses_carroceria_check, veio %', restricao;
    end if;
  end;

  -- 2. carroceria fora da lista, no inscrito (com a moto junto)
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-moto-2', array['moto', 'van']);
    falhas := falhas + 1;
    raise notice 'inscrito fora da lista: passou';
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'inscrito_carrocerias_da_lista' then
      falhas := falhas + 1;
      raise notice 'inscrito fora da lista: esperava inscrito_carrocerias_da_lista, veio %', restricao;
    end if;
  end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram ou foram barradas pela restrição errada', falhas;
  end if;

  -- Controle positivo: a moto entra no carro e na lista.
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, carroceria)
    values ('aceite-moto-3', 'T', 'T', 2020, 1, 1, 'moto')
    returning id into controle;
    delete from public.repasses where id = controle;

    insert into public.repasse_inscritos (trilha, nome, whatsapp, carrocerias)
    values ('consumidor', 'Aceite', 'aceite-moto-4', array['moto', 'hatch'])
    returning id into controle;
    delete from public.repasse_inscritos where id = controle;
  exception when check_violation then
    raise exception 'ACEITE FALHOU: a moto foi recusada (%)', sqlerrm;
  end;

  raise notice 'Repasse (moto) OK: fora da lista recusado pela restrição certa; a moto entra no carro e na lista.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261002120000', 'repasse_moto')
  on conflict (version) do nothing;
