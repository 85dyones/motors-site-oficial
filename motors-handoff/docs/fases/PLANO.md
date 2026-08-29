# Plano de fases — estrangulamento sem ruptura

Regra da janela: enquanto o RevendaMais existir, ele só recebe lançamento fiscal — nunca decisão
comercial. Uma fase só começa com o critério de saída da anterior cumprido. O site público e o
funil /avaliacao não quebram em NENHUMA fase (qa-guardian verifica em todo PR).

## F0 — Adequação normativa, base e migração (≈2 semanas)
Humano (Dyones): confirmar adesão RENAVE + escolher integradora e provedor fiscal; pedir exportação
completa ao suporte do RevendaMais; varredura das telas pendentes (financeiro, integrador,
relatórios, form de cadastro) para fechar as specs.
Código: schema núcleo (spec 00) + org_padrao() + RLS + auditoria; staging + carga dos 1.096
veículos (migration-runner); conferência diária n8n; backup PITR + export diário TESTADO.
Saída: adesão RENAVE confirmada; divergência de estoque zero por 5 dias; pendências de tela resolvidas.

## F1 — MVP operacional (≈6–8 semanas) — a partir daqui, entrada e venda nascem no admin
Entregas (paralelizáveis por módulo após spec 00 no ar):
compras: 5 portas (spec 10) + diligência de procedência + estornos/correções + confirmação de
disponibilidade · avaliação: curva de deságio + teto de compra + tela de edição de parâmetros
(spec 11) · estoque: ficha, eventos, custos previsto×realizado, piso/preço, bloqueios · pátio:
PWA para km/avarias/vistoria (fotos internas apenas) + upload de fotos profissionais no admin +
Storage próprio (sai o carro57) · vendas: proposta, pré-venda apurada,
fechamento atômico, comissão por regra, repasse de saída com contrato/termo (spec 20) · razão:
15 contas, partidas, regras de contabilização, visões a pagar/receber (spec 30) · ciclo: CICLO_ABERTO
no fechamento + % sobre FIPE + trava pelo praticado (spec 40) · documentos: geração de contratos +
prazos CTB (spec 60) · pós-venda: chamado com relógio de 30 dias (spec 70) · direção: tela do dia.
Saída: 30 dias de operação com entrada, venda e resultado só no admin (Revenda só para NF).

## F2 — Vitrine, mídia, régua e Ciclo no núcleo (≈3–4 semanas)
estoque_motors → projeção (contrato de leitura preservado); integrador de portais com status/
reprocesso; anúncio versionado; despublicação automática; mídia atribuída por unidade; régua de
envelhecimento ativa (30/60/90/120) com gatilho de repasse; revisões do Ciclo no núcleo + painel
de exposição + histograma do deságio; LGPD retenção; observabilidade (fila parada, erro, alerta).
Saída: 100% dos anúncios pelo admin; integrador do Revenda desligado; primeira venda com margem
após mídia fechada.

## F3 — Fiscal e financeiro completo (≈4 semanas)
NF-e integrada nos dois sentidos sincronizada ao RENAVE; ATPV-e (Res. 1.027); conciliação bancária;
DRE competência/caixa com dimensões; assinatura eletrônica.
Saída: um mês fiscal fechado em paralelo, batendo com o Revenda.

## F4 — Entrega e desligamento (≈2 semanas)
Checklist de entrega com assinatura no celular; protocolo de 5 peças completo; Revenda congelado
em leitura por um trimestre; depois, cancelamento.
Saída: 30 dias sem ninguém abrir o Revenda para trabalhar.

## Backlog completo e pesos
Ver artefato (seção Backlog) — itens 00–39 com fase e criticidade. Este plano é a ordem; o artefato
é o detalhe.
