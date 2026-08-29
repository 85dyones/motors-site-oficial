# Spec 11 — Avaliação: curva de deságio sobre a FIPE e teto de compra

Avaliação parte de deságio base e compõe. Valores SEED (editáveis em parametros_avaliacao, com
vigência datada e tela de edição no admin — mudar régua não altera avaliações passadas):

- base_operacional: 20 p.p. (todo carro parte daqui)
- estado_excepcional: −5 p.p. (piso 15%) — exige justificativa + hodômetro verificado
- km (desvio vs 15.000 × idade em anos): +5.001–15.000: +2 | 15.001–30.000: +4 |
  30.001–50.000: +7 | >50.000: +10 p.p.
- avaria leve: +2 a +4 (orçamento referenda) | avaria séria: +8 a +12 (orçamento obrigatório anexo)
- pendência procedência/documento: +3 a +5
- teto: 40% → acima, recusar ou encaminhar como oportunidade de repasse

Toda avaliação persiste o breakdown (componentes aplicados) — o número final se explica.
Teto de compra = FIPE × (1 − deságio) − preparação estimada − margem alvo; serve às 5 portas
(na troca é o crédito máximo; na consignação o piso a combinar; na parceria o spread mínimo).
Painel (F2): histograma do deságio praticado sobre a curva alvo + margem realizada por faixa
(recalibração trimestral com dado próprio do razão).
Km baixo: não gera desconto além do degrau de estado excepcional; km baixo demais = alerta de
hodômetro, não prêmio.
