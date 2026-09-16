# Spec 20 — Pré-venda apurada e as saídas

## Negócio (negocios + negocio_pagamentos)
Estados: proposta → pre_venda → fechado | cancelado.
- proposta: preço vs piso, simulação de composição, nada travado.
- pre_venda (PRE_VENDA_LANCADA): reserva o veículo (sai da vitrine/portais), validade obrigatória;
  composição lançada em linhas: pix|dinheiro|cartao|financiamento|sinal|troca|acessorio|garantia,
  cada uma previsto→confirmado→liquidado. Financiamento: financeira + valor aprovado + retorno
  previsto. Troca: troca_avaliacao_id.
- Só o SINAL toca o razão antes do fechamento (D 1.1.1 / C 2.1.3 passivo). Cancelou: devolve/retém
  sinal conforme combinado, carro volta à vitrine, nada a estornar.
- Fechamento (função Postgres, atômico): bloqueado se soma linhas ≠ preço, linha 'previsto',
  troca sem vistoria+avaliação aceitas, pendência de procedência no carro que entra, preço < piso
  sem aprovação. Ao fechar: VENDA + entrada da troca + contabilização + comissão + disparos
  (NF-e, RENAVE, despublicação) na mesma transação/outbox.
- Margem projetada recalculada a cada mudança de linha, com breakdown.
- Validade vencida: aviso → libera carro → notifica próximo da fila.

## Saídas
- varejo: margem cheia, meta e comissão do consultor; protocolo de entrega em 5 peças (spec 60).
- repasse (REPASSE_SAIDA): comprador PJ do ramo; contrato + termo de isenção OBRIGATÓRIOS
  (fechamento bloqueado sem doc vinculado); receita em 3.1.2; comissão REDUZIDA
  (regras_comissao por saida_tipo); NÃO entra na margem média do varejo nem na meta; gatilho
  sugerido pela régua de envelhecimento (quanto recebo hoje × custo de segurar 30 dias).
- devolucao_terceiro: encerra entrada sem receita; custo de preparação bancado permanece no razão
  com dimensão do terceiro; termo de devolução com estado/km.
- estorno de venda: reversão fiscal/financeira/comissão via contrapartida; motivo classificado.
Comissão: regras_comissao (modo fixa|percentual, base valor_venda|margem_liquida quando percentual,
valores por saida_tipo, vigência). Histórico da venda guarda a regra aplicada.
