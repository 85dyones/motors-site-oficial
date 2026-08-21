-- ==========================================================
-- Seeds de DESENVOLVIMENTO do Motors Ciclo — Pacote 1
-- ==========================================================
--
-- Dados 100% sintéticos. **Nunca dado real de cliente em ambiente de dev** —
-- é exigência do Pacote 1 em `MOTORS_CICLO_IMPLEMENTACAO.md`.
--
-- Como rodar: cole no SQL Editor de um projeto de desenvolvimento, ou
--   psql "<url-do-banco-de-dev>" -f supabase/seeds/ciclo_dev.sql
--
-- O bloco de guarda abaixo recusa rodar se encontrar qualquer cliente que não
-- seja destes seeds. É a proteção contra o acidente óbvio: colar isto na aba
-- errada do navegador, com a produção aberta do lado.
--
-- Para limpar tudo o que este arquivo cria:
--   delete from public.clientes where cpf_cnpj like 'SEED-%';
--   (as filhas caem por cascata manual — ver o rodapé)
-- ==========================================================

do $$
declare reais integer;
begin
  select count(*) into reais from public.clientes where cpf_cnpj not like 'SEED-%';
  if reais > 0 then
    raise exception
      'RECUSADO: este banco tem % cliente(s) que não vieram dos seeds. '
      'Seeds sintéticos não entram em base com dado real.', reais;
  end if;
end $$;

-- Limpa a rodada anterior, para o arquivo ser reexecutável.
delete from public.leituras_odometro where veiculo_vendido_id in (
  select id from public.veiculos_vendidos where chassi like 'SEED-%');
delete from public.plano_revisoes where veiculo_vendido_id in (
  select id from public.veiculos_vendidos where chassi like 'SEED-%');
delete from public.manutencoes where veiculo_vendido_id in (
  select id from public.veiculos_vendidos where chassi like 'SEED-%');
delete from public.contratos_ciclo where veiculo_vendido_id in (
  select id from public.veiculos_vendidos where chassi like 'SEED-%');
delete from public.contratos_financiamento where veiculo_vendido_id in (
  select id from public.veiculos_vendidos where chassi like 'SEED-%');
delete from public.veiculos_vendidos where chassi like 'SEED-%';
delete from public.clientes where cpf_cnpj like 'SEED-%';
delete from public.parceiros_ciclo where nome like 'SEED %';

-- ---- a rede parceira ----
insert into public.parceiros_ciclo (id, tipo, nome, cidade, comissao_pct) values
  ('5eed0000-0000-4000-8000-000000000001', 'oficina', 'SEED Oficina Bacacheri', 'Curitiba', 12.00),
  ('5eed0000-0000-4000-8000-000000000002', 'oficina', 'SEED Oficina Portão',    'Curitiba', 10.00);

-- ---- três clientes, três situações que o painel precisa saber desenhar ----
insert into public.clientes (id, cpf_cnpj, nome, telefone_e164, email, consentimento_lgpd_em) values
  ('5eedc11e-0000-4000-8000-000000000001', 'SEED-00000000001', 'Cliente Em Dia',      '+554199990001', 'em-dia@exemplo.invalido',    now()),
  ('5eedc11e-0000-4000-8000-000000000002', 'SEED-00000000002', 'Cliente Em Risco',    '+554199990002', 'em-risco@exemplo.invalido',  now()),
  ('5eedc11e-0000-4000-8000-000000000003', 'SEED-00000000003', 'Cliente Sem Acesso',  '+554199990003', null,                         now());

-- `auth_user_id` fica NULL: vincular exige um usuário real do Auth do projeto
-- de dev. Para testar a Garagem Motors, crie o usuário e rode:
--   update public.clientes set auth_user_id = '<uuid do usuário>'
--    where cpf_cnpj = 'SEED-00000000001';

-- ---- os veículos ----
insert into public.veiculos_vendidos
  (id, cliente_id, chassi, placa, marca, modelo, versao, ano_fabricacao, ano_modelo,
   data_venda, km_na_venda, valor_venda, aderiu_ciclo, vendedor) values
  ('5eedca20-0000-4000-8000-000000000001', '5eedc11e-0000-4000-8000-000000000001',
   'SEED-CHASSI-0000000001', 'SED1A01', 'Chevrolet', 'Onix', '1.0 Turbo LTZ',
   2022, 2023, current_date - interval '14 months', 32000, 78900.00, true, 'SEED Vendedor'),
  ('5eedca20-0000-4000-8000-000000000002', '5eedc11e-0000-4000-8000-000000000002',
   'SEED-CHASSI-0000000002', 'SED2B02', 'Volkswagen', 'T-Cross', '200 TSI Comfortline',
   2021, 2022, current_date - interval '20 months', 45000, 112500.00, true, 'SEED Vendedor'),
  ('5eedca20-0000-4000-8000-000000000003', '5eedc11e-0000-4000-8000-000000000003',
   'SEED-CHASSI-0000000003', 'SED3C03', 'Honda', 'HR-V', 'EXL 1.8',
   2020, 2021, current_date - interval '3 months', 61000, 98000.00, false, 'SEED Vendedor');

-- ---- contratos do Ciclo. `recompra_*` fica nulo: regra 5 ----
insert into public.contratos_ciclo
  (veiculo_vendido_id, plano, garantia_meses, garantia_fim, mensalidade) values
  ('5eedca20-0000-4000-8000-000000000001', 'completo',  36, current_date + interval '22 months', 149.90),
  ('5eedca20-0000-4000-8000-000000000002', 'essencial', 36, current_date + interval '16 months',  89.90);

-- ---- financiamento, para o cálculo do §5.1 ter contra o que rodar ----
insert into public.contratos_financiamento
  (veiculo_vendido_id, instituicao, valor_financiado, valor_entrada, taxa_mensal,
   prazo_meses, valor_parcela, data_primeira_parcela) values
  ('5eedca20-0000-4000-8000-000000000001', 'SEED Banco', 58900.00, 20000.00, 0.017500,
   48, 1789.42, current_date - interval '13 months');

-- ---- a primeira notação de KM é sempre o KM de saída na compra (v1.1 §5.2) ----
insert into public.leituras_odometro (veiculo_vendido_id, km, origem, registrada_em)
select id, km_na_venda, 'venda', data_venda::timestamptz
  from public.veiculos_vendidos where chassi like 'SEED-%';

-- ---- plano de revisões: uma janela por veículo, pelo mesmo gerador ----
-- A semente não repete a régua do §1.5: chama quem a conhece. Assim ela nunca
-- diverge do que o banco realmente cria — que foi o defeito do plano fixo.
select public.abrir_proxima_janela(vv.id)
  from public.veiculos_vendidos vv
 where vv.chassi like 'SEED-%';

-- ---- o diário de bordo ----
-- Cliente 1: revisão feita e VERIFICADA, dentro da janela. Conta para a
-- conformidade do §1.4.
insert into public.manutencoes
  (veiculo_vendido_id, parceiro_id, tipo, numero_revisao, data_servico, km_registrado,
   valor_servico, dentro_da_janela, origem_registro, confirmada_em,
   url_etiqueta_anterior, url_etiqueta_atual)
values
  ('5eedca20-0000-4000-8000-000000000001', '5eed0000-0000-4000-8000-000000000001',
   'revisao_programada', 1, (current_date - interval '2 months')::date, 41800,
   480.00, true, 'loja', now() - interval '2 months',
   'https://exemplo.invalido/seed/etiqueta-antiga.jpg',
   'https://exemplo.invalido/seed/etiqueta-nova.jpg');

update public.plano_revisoes set manutencao_id = (
  select id from public.manutencoes
   where veiculo_vendido_id = '5eedca20-0000-4000-8000-000000000001' limit 1)
 where veiculo_vendido_id = '5eedca20-0000-4000-8000-000000000001' and numero_revisao = 1;

-- Cliente 2: registrou pelo app e AINDA NÃO foi verificado. É a fila da tela
-- A21 — e não conta para a conformidade enquanto `confirmada_em` for nulo.
insert into public.manutencoes
  (veiculo_vendido_id, tipo, numero_revisao, data_servico, km_registrado,
   origem_registro, url_etiqueta_atual)
values
  ('5eedca20-0000-4000-8000-000000000002', 'revisao_programada', 1,
   (current_date - interval '10 days')::date, 57200, 'cliente',
   'https://exemplo.invalido/seed/etiqueta-pendente.jpg');

-- Cliente 3: nada registrado, e a primeira janela ainda nem abriu.

-- ---- leituras declaradas entre revisões ----
insert into public.leituras_odometro (veiculo_vendido_id, km, origem, registrada_em) values
  ('5eedca20-0000-4000-8000-000000000001', 43500, 'cliente', now() - interval '20 days'),
  ('5eedca20-0000-4000-8000-000000000002', 58100, 'cliente', now() - interval '5 days');

-- ---- a série do §1.4 começa hoje, e começa honestamente pequena ----
insert into public.conformidade_diaria
  (dia, veiculos_ciclo_ativo, veiculos_com_revisao_devida, veiculos_em_dia, pct)
values (current_date, 2, 2, 1, 50.00)
on conflict (dia) do nothing;

refresh materialized view public.vw_ciclo_estado;

do $$
begin
  raise notice 'Seeds do Ciclo aplicados: 3 clientes, 3 veículos, 1 revisão verificada e 1 na fila.';
end $$;
