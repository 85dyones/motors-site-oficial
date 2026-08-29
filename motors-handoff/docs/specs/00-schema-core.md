# Spec 00 — Schema do núcleo

Referência normativa do banco. O DDL completo comentado está no artefato (seção "Modelo de dados");
este arquivo fixa o contrato. `org_padrao()` retorna o uuid da org Motors (seed na primeira migração).

## Enums
```sql
create type posse_tipo      as enum ('propria','terceiro');
create type modalidade_tipo as enum ('compra_direta','troca','consignacao','parceria','repasse','lote');
create type saida_tipo      as enum ('varejo','repasse','devolucao_terceiro');
create type evento_tipo as enum (
  'ENTRADA','CORRECAO_ENTRADA','ESTORNO_ENTRADA',
  'COMPRA_TERCEIRO','DEVOLUCAO_TERCEIRO',
  'PREPARACAO_INICIO','PREPARACAO_FIM','CUSTO_LANCADO','BLOQUEIO','DESBLOQUEIO',
  'PUBLICACAO','DESPUBLICACAO','MIDIA_ATRIBUIDA',
  'PRE_VENDA_LANCADA','SINAL','CANCELAMENTO_SINAL','PRE_VENDA_CANCELADA',
  'VENDA','REPASSE_SAIDA','ESTORNO_VENDA','NF_EMITIDA','ENTREGA_LIBERADA',
  'CICLO_ABERTO','REVISAO_REGISTRADA','CONFORMIDADE_ALTERADA','RECOMPRA_EXERCIDA',
  'CHAMADO_ABERTO','REPARO_CONCLUIDO','PRAZO_VENCIDO'
);
```

## Tabelas núcleo
- `veiculos` — identidade: chassi unique por org; placa, renavam, ficha técnica, fipe_codigo, km_atual.
- `veiculo_entradas` — uma linha por entrada; campos por modalidade (venda_origem_id na troca;
  consig_* na consignação incl. remuneração fixa|percentual; parceria_* incl. preco_entrada,
  margem_acordada, exclusividade, dut_em_poder_de, regresso_prazo_dias; repasse_*). Constraints:
  `troca_exige_venda`, `consignacao_sem_custo` (valor_entrada=0), `parceria_exige_preco`,
  `terceiro_sem_posse`, unique parcial `(veiculo_id) where ativa`.
- `veiculo_eventos` — append-only; payload jsonb; usuario_id obrigatório; motivo em correções/estornos.
- `veiculo_custos` — categoria, fornecedor, valor, competencia, previsto bool, titulo_id, anexo.
- `veiculo_precos` — fipe_valor, preco_anuncio, preco_minimo (piso), vigente_desde.
- `negocios` + `negocio_pagamentos` — pré-venda (spec 20).
- `confirmacoes_disponibilidade` — trava anti venda dupla de unidade de terceiro (validade curta).
- Razão: `plano_contas` (15 contas seed, spec 30), `lancamentos`, `partidas`,
  `regras_contabilizacao`, `regras_comissao`.
- Parâmetros: `parametros_avaliacao` (curva de deságio, spec 11), `ciclo_parametros` (spec 40) —
  ambas com vigência datada.
- `documentos`, `anuncios` (versionado, spec 50), `renave_operacoes`, `auditoria`.

## Projeções (nunca escritas diretamente)
- `veiculo_situacao` (view sobre eventos): estoque | preparacao | reservado(pre-venda) | vendido |
  devolvido | fora. Função `calcula_situacao(evento_tipo[])` com teste de tabela-verdade.
- `unidade_resultado` (matview do razão): receita, cmv, mídia, comissão, margem_liquida por veículo.
- F2: `estoque_motors` recriada como projeção mantendo EXATAMENTE o shape que o site lê hoje
  (levantar o contrato de leitura antes — grep no código do site).

## Invariantes com teste obrigatório
balanço zero por lançamento (deferido); imutabilidade de eventos/partidas; 1 aquisição ativa;
venda < piso sem aprovação bloqueada; RLS nega leitura cross-org.
