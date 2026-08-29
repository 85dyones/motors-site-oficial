# Spec 60 — Fiscal, RENAVE, documentos e contratos

- RENAVE (Res. 1.026/2026, prazo ≈28/09/2026): decisão de integradora é da F0 (com o Dyones).
  Escrituração de entrada, saída, consignação, transferência entre revendas; NF-e emitida
  SINCRONIZADA ao registro — provedor fiscal e integradora são UMA decisão. renave_operacoes
  espelha status na ficha.
- NF-e: provedor API (ex. Focus NFe). Emissão disparada pelo VENDA (outbox → n8n → provedor →
  NF_EMITIDA com chave/XML; erro volta à tela). Import de XML de entrada casando por chassi,
  conferindo valor × compra.
- ATPV-e (Res. 1.027/2026): modalidades convencional/eletrônica/custodiada; assinatura
  avançada/qualificada; comunicação de venda automática; consignação: 30 dias do consignante
  contam do comprador (alerta no fluxo de venda de consignado).
- Prazos CTB controlados com comprovante: comunicação de venda (60 dias, Lei 14.071/2020) e
  transferência/novo CRV (30 dias, art. 123 — inclusive estoque próprio: STJ exige transferir).
- documentos: tipo DUT|CRV|CNH|contrato|laudo|termo|NF, validade, owner (veiculo|pessoa|negocio),
  pendência bloqueia ENTREGA_LIBERADA. Assinatura eletrônica via provedor.
- Contratos GERADOS dos dados da unidade (templates versionados; cláusulas validadas por advogado
  antes de virar padrão — base no artefato, seção Conformidade): compra e venda varejo, termo de
  garantia contratual (CDC art. 50), contrato de repasse + termo de isenção (entre PJs), termo de
  consignação, termo de parceria (regresso), termo de devolução, checklist de entrega.
- Protocolo de entrega (5 peças, gerado do fluxo): laudo de vistoria, termo de ciência de estado,
  termo de garantia, registro de procedência informada, prova de entrega.
- LGPD (F2): retenção/expurgo do funil de crédito; proposta recusada não fica para sempre.
