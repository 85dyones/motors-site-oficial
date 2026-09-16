# Spec 30 — Razão operacional

Plano de contas (seed, 15 linhas): 1.1.1 Caixa/bancos · 1.1.2 A receber · 1.1.3 Estoque de veículos ·
2.1.1 Fornecedores · 2.1.2 A pagar pessoal/comissões · 2.1.3 Sinais recebidos · 2.1.4 Terceiros a
pagar (consignação e parceria) · 3.1.1 Receita de venda · 3.1.2 Receita de repasse · 3.2.1 Receitas
acessórias (retorno financiamento, seguro, garantia) · 4.1.1 CMV · 4.2.1 Mídia · 4.3.1 Comissões ·
4.4.1 Despesas operacionais · 5.1.1 Impostos sobre venda.

- lancamentos (cabeçalho: evento_id origem, data_competencia, data_caixa, estorna_id,
  periodo_fechado) + partidas (valor >0 débito / <0 crédito; dimensões: veiculo, modalidade,
  saida, vendedor, campanha_id, centro_custo, pessoa, lote).
- Constraint trigger deferida: sum(valor)=0 por lançamento.
- regras_contabilizacao: evento_tipo → conta débito/crédito + base_valor. Contabilização automática
  por evento (mesma transação). Ex.: ENTRADA compra_direta D1.1.3/C2.1.1; troca D1.1.3/C3.1.1
  (crédito na venda de origem); consignação/parceria: nada até a venda; VENDA D1.1.2/C3.1.1 +
  baixa D4.1.1/C1.1.3; venda de terceiro: parte do dono D1.1.2/C2.1.4; REPASSE_SAIDA C3.1.2;
  comissão D4.3.1/C2.1.2; SINAL D1.1.1/C2.1.3.
- Fechamento de período trava o passado; correção = estorno com contrapartida (estorna_id).
- Contas a pagar/receber e fluxo de caixa = VISÕES do razão (a tela que o operador espera).
- unidade_resultado: margem líquida por veículo (já descontada mídia); mesmos dados por modalidade,
  vendedor, lote. Compromisso de recompra do Ciclo NÃO é conta — painel de exposição (spec 40).
- FORA DE ESCOPO: SPED, ECD, apuração de tributos, balanço patrimonial (contador via export).
