# Plano da F0 — adequação, base e migração

**Status: PROPOSTO em 2026-08-28 — aguardando aprovação do dono. Nenhuma migração
da F0 roda antes do OK.** (É o passo 2 do `motors-handoff/docs/fases/KICKOFF-PROMPT.md`;
o passo 1 é o `docs/levantamento-atual.md`, produzido no mesmo dia.)

Ponto de partida melhor que o previsto pelo handoff: o caixa legado já foi
aposentado (28/08, migração `20260828190000` — sem colisão de `plano_contas`),
a Emenda 02 já resolveu a mecânica da recompra (manual v1.2), e o levantamento
que a F0 pedia está pronto. O que resta da F0: decisões humanas, schema núcleo,
carga e conferência.

---

## Trilha do dono (sem código; destrava, não bloqueia o início)

| # | Ação | Destrava |
|---|---|---|
| **H1** | **Pedir a exportação completa ao suporte do RevendaMais** (veículos históricos ~1.096, clientes, títulos) — o backlog marca "bloqueia tudo"; na prática bloqueia a carga (T4) | T4 |
| **H2** | Uma ligação ao suporte do Revenda: emissor de NF-e ativo na conta? RENAVE ativo? por qual integradora (Renave Fácil, DataStock, Web Renave, Renave Zero, Renave Connect)? custo de ativar quando chegar a hora? | decisão de integradora (F3) |
| **H3** | Pré-requisitos RENAVE sem custo: e-CNPJ A1 válido (quem guarda?), situação da adesão no gov.br, gov.br dos sócios em nível prata/ouro. **Monitoramento quinzenal**: manual do SENATRAN/CONTRAN para os DETRANs, DETRAN-PR, eventual prorrogação — é o sinal que dispara a ativação, não a data (decisão de ritmo de 28/08) | conformidade sem correria |
| **H4** | Varredura das telas do Revenda que a operação **realmente** usa (relatórios que abrem, campos do cadastro de veículo) — fecha as lacunas de spec que o levantamento do handoff deixou ("bloqueia a spec") | specs da F1 |
| **H5** | Peso de cada porta de entrada hoje: quantas compra direta / troca / consignação / parceria / repasse por mês — define o que otimizar primeiro na F1 | priorização F1 |
| **H6** | *(paralelo, não bloqueia a F0)* Para a recompra virar assinável: parecer jurídico, provisionamento, margem alvo da trava e seeds batidos contra o praticado por perfil (manual v1.2 §1.4; Anexo 9–10) | primeira assinatura do Ciclo |

## Trilha de código (agentes do handoff; toda entrega passa pelo qa-guardian)

**T1 — Mapa de convivência de schema** *(db-architect; sem migração)*
Fecha as decisões do §5 do levantamento antes da primeira migração: nome
`veiculos` (recomendação: manter, com comentário de tabela + autoconferência
contra policies públicas), `auditoria` × `auditoria_admin` (convivem),
**cadastro de pessoas do núcleo** (referenciar `clientes`/`parceiros`/
`investidores` existentes × nascer `pessoas` — decisão de desenho),
correspondência de identidade (chassi/uuid do núcleo × `id integer` do anúncio).
Entregável: adendo curto ao levantamento com as decisões nomeadas.

**T2 — Schema núcleo (spec 00), em fatias aditivas** *(db-architect)*
Cada fatia: migração pequena nomeada, `org_id default org_padrao()` + RLS,
teste de invariante (violação deve falhar), ensaio com ROLLBACK, `--gravar`,
rodapé no livro-razão.
- a) org Motors + `org_padrao()` + enums (`posse_tipo`, `modalidade_tipo`, `saida_tipo`, `evento_tipo`)
- b) `veiculos` + `veiculo_entradas` com as constraints por modalidade (`troca_exige_venda`, `consignacao_sem_custo`, `parceria_exige_preco`, `terceiro_sem_posse`, unique parcial de aquisição ativa)
- c) `veiculo_eventos` **append-only** (trigger bloqueia UPDATE/DELETE; RLS não concede) + `auditoria` do núcleo
- d) `veiculo_custos` + `veiculo_precos`
- e) Razão: `plano_contas` (15 contas seed da spec 30), `lancamentos`, `partidas` append-only, `regras_contabilizacao`, `regras_comissao`, **constraint deferida de balanço zero**
- f) Parâmetros com vigência datada: `parametros_avaliacao` (curva de deságio, spec 11) e `ciclo_parametros` (seeds da Emenda 02: faixas 85/80 · 80/75, janelas, franquia — validação H6 antes de virar contrato)
- g) `negocios` + `negocio_pagamentos` + `confirmacoes_disponibilidade`
- h) `documentos`, `anuncios` (versionado), `renave_operacoes` como **espelho neutro** (operação, tipo, status, protocolo, chave NF-e, payload jsonb — sem acoplar a integradora)
- i) Projeção `veiculo_situacao` + `calcula_situacao(evento_tipo[])` com teste de tabela-verdade

**T3 — Staging e carga do histórico** *(migration-runner; depende de H1 + T2 b/c)*
`staging_*`, normalização por chassi, **triagem manual do "consignado" do Revenda**
(mistura consignação real e parceria), relatório de qualidade (duplicatas, chassi
inválido, datas impossíveis) **antes** de promover ao núcleo; reconciliação do
`preco_compra` (coluna × JSON `stock_overrides`) na entrada de custos. Nunca
sobrescrever núcleo com staging sem diff aprovado.

**T4 — Conferência diária** *(integrations; depende de T2b e T3 parcial)*
Fluxo n8n comparando estoque Revenda × núcleo, publicando divergências — com
tabela de estado + reprocesso (fire-and-forget é proibido pelo padrão do handoff).

**T5 — Backup** *(db-architect + decisão do dono)*
PITR é add-on pago do Supabase (custo a aprovar) + export diário **testado por
restauração**, não por existência do arquivo.

**Invariantes com teste obrigatório ao fim da F0** (spec 00): balanço zero por
lançamento; imutabilidade de eventos/partidas; 1 aquisição ativa por veículo;
RLS nega leitura cross-org; `estoque_motors`, site público e `/avaliacao`
**intocados** (qa-guardian confere em todo PR).

## Critérios de saída da F0 (ajustados pelas decisões de 28/08)

1. Schema núcleo no ar com todos os invariantes testados.
2. Carga promovida com relatório de qualidade aceito pelo dono.
3. **Divergência de estoque zero por 5 dias corridos** na conferência diária.
4. Backup provado por restauração.
5. Trilha RENAVE **encaminhada** (respostas do Revenda em mãos, pré-requisitos
   prontos, monitoramento quinzenal ativo) — o critério original "adesão
   confirmada" foi ajustado pela decisão de ritmo do dono em 28/08: o gatilho é
   o manual do operador/prorrogação, não a data.
6. Pendências de tela (H4) resolvidas em spec.

## Notas de risco

- **O repositório é público** — o handoff entra versionado como o manual já está;
  nenhum segredo nos arquivos (tokens vivem em env/`.claude/*.json`, gitignorados).
- Frentes paralelas ativas (funil de vendas; correção dos 2 testes do main):
  coordenar por PR pequeno, uma tarefa por PR.
- Nada da F0 toca `estoque_motors`, o sync, o site público ou o funil `/avaliacao`.
