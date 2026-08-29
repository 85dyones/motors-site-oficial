# Spec 10 — As cinco portas de entrada

Formulário e regra mudam por modalidade. NUNCA um form genérico. Lote NÃO entra agora (momento B).

| Modalidade | posse | caixa | custo de entrada | campos específicos |
|---|---|---|---|---|
| compra_direta | propria | sai | valor pago | fornecedor PF/PJ, forma/prazo pgto, NF/recibo, docs transferência |
| troca | propria | não sai | crédito concedido | venda_origem_id OBRIGATÓRIO; margem dos 2 lados na tela |
| consignacao | terceiro | não sai | 0 (constraint) | termo, prazo, valor do dono, remuneração fixa\|percentual |
| parceria | terceiro | não sai | preço travado | parceiro, preco_entrada, margem_acordada, exclusividade, DUT, regresso |
| repasse | propria | sai | valor pago à loja | loja origem, giro alvo em dias, laudo+termo exigidos do vendedor |

Regras transversais:
- Diligência de procedência OBRIGATÓRIA e registrada (quem/quando/resultado): sinistro (SINISTRADO,
  Res. 810/2020), leilão, gravame/restrição, hodômetro, chassi, recall. Pendência não recusa —
  precifica (spec 11) — mas bloqueia publicação até resolver conforme severidade.
- Unidade de terceiro: venda/sinal exigem confirmação de disponibilidade vigente.
- Estorno de compra, correção de entrada e compra de consignado (COMPRA_TERCEIRO vira nova
  aquisição própria no MESMO veículo) são eventos com motivo, nunca edição.
- Troca: crédito = desconto na venda E custo do carro que entra; tela mostra margem da venda com
  crédito real + margem projetada do que entra, no ato.
- Garantia ao consumidor: NUNCA é campo. Quem vende responde (CDC art. 3º/24). Termo com terceiro
  trata regresso (parceria/consignação), não isenção.
Quem usa: comprador (decisão), pátio (recebimento via PWA).
