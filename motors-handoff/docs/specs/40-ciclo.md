# Spec 40 — Ciclo (JÁ OPERA — portar, não recriar)

Antes de codar: levantar onde vive hoje (base/planilha/fluxos) e mapear campos → núcleo. Manter
comportamento; trocar a fonte para a unidade do sistema.

Mecânica (regra da casa, confirmada):
- Nasce no ATO DA VENDA (registrada e sacramentada) → CICLO_ABERTO no fechamento da pré-venda.
- No fechamento define-se o PERCENTUAL de recompra sobre a FIPE vigente no retorno, modulado pela
  conformidade das revisões. Vale até o novo negócio (troca ou venda do carro na loja).
- Revisões DOCUMENTADAS mantêm o direito. Conformidade é CALCULADA da documentação, nunca declarada.

ciclo_parametros (seed proposto, validar com a regra interna já alinhada; vigência datada — contrato
guarda os parâmetros do dia da assinatura):
- intervalo: 12 meses ou 10.000 km; janela +30 dias/+1.000 km; documentar em até 30 dias;
  1 atraso recuperável em 60 dias por ciclo.
- percentuais: em dia → 85% FIPE (crédito troca) / 80% (dinheiro); recuperado → 80/75;
  fora → extinto (avaliação normal). TRAVA: pleno ≤ praticado da casa no perfil − margem alvo.
- franquia 15.000 km/ano; excedente precificado pelos degraus de km da spec 11 (SEM teto de corte).
- excludentes: SINISTRADO (média/grande monta), gravame não quitado, adulteração.
- vistoria de retorno; avarias além do desgaste deduzidas por orçamento.

Documentação válida: NF/NFS-e (CNPJ, data, km) ou OS detalhada (peças/fluidos); carimbo só
complemento. Registro via WhatsApp (Evolution/n8n) → REVISAO_REGISTRADA com leitura automática e
conferência de km. Lembretes 60/30/7 dias antes da janela. Revisão fora da rede: ACEITA com doc
qualificada (não replicar exigência de rede própria — jurisprudência derruba). Incentivo interno é
positivo: agendamento, registro automático, preço fechado.
Retorno: carro entra por troca/compra_direta com REGRA DE PREÇO do contrato sobreposta
(RECOMPRA_EXERCIDA vinculando contrato → nova entrada).
Painel de exposição: contratos ativos, janelas, % prometido × % praticado (spread), conformidade.
