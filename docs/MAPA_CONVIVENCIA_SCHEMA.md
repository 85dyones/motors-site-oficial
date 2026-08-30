# Mapa de convivência de schema — T1 da F0

**Decidido em 2026-08-29**, antes da primeira migração do núcleo (é o entregável
T1 do `docs/PLANO_F0.md`). Fecha os conflitos do §5 do `docs/levantamento-atual.md`.
Toda migração da F0 referencia estas decisões; mudá-las depois é emenda aqui, não
improviso na migração.

## D-T1.1 — O núcleo usa o nome `veiculos`, como manda a spec 00

O nome é historicamente carregado (era o nome de `estoque_motors` até 03/08, e o
baseline reexecutado já recriou um `public.veiculos` fantasma com policies
públicas — `AUDITORIA.md` §3.4-c, derrubado em `20260815120000`). Ainda assim a
spec vence: manter o vocabulário do handoff vale mais que fugir do fantasma.
Mitigações obrigatórias na migração que a criar:
- `COMMENT ON TABLE` contando a história (é OUTRA tabela, uuid + chassi, não a
  ex-`veiculos` integer do feed);
- autoconferência que **falha se a tabela nascer com policy pública** (o modo de
  falha já visto) ou sem RLS.

## D-T1.2 — `auditoria` (núcleo) convive com `auditoria_admin` (painel)

Escopos diferentes: `auditoria` registra ações do núcleo (org_id, append-only);
`auditoria_admin` segue com o painel legado. Fusão é decisão futura, não da F0.

## D-T1.3 — Sem tabela `pessoas` na F0

A spec 00 não define cadastro de pessoas, e hoje existem três (`clientes` do
Ciclo, `parceiros` da agenda, `investidores`). Criar um quarto agora seria o
erro que a agenda nasceu para consertar. Na F0:
- fornecedor/consignante/parceiro/loja de repasse são **campos da própria
  `veiculo_entradas`**, como a spec 10 desenha (texto + documento);
- o comprador da pré-venda é campo de `negocios` (+ `lead_id` opcional);
- a unificação (núcleo referenciando a agenda, ou `pessoas` nascendo dela) é
  decisão da **F1**, junto com o formulário das 5 portas.

## D-T1.4 — Elo de identidade: `veiculos.estoque_id integer unique`

O site fala `estoque_motors.id integer` (ID do anúncio RevendaMais, faixa
6,1M–8,4M; nativos do painel ≥ 900.000.001). O núcleo fala uuid + chassi. O elo
é a coluna `estoque_id` em `veiculos` — **sem FK** (o ciclo de vida das duas
tabelas é independente durante a janela; a conferência diária T4 é quem acusa
divergência). A carga T3 preenche o elo; a projeção da F2 o consome para emitir
o mesmo `id` de hoje.

## D-T1.5 — RLS da F0: só staff, refinamento por papel vem com as telas

Toda tabela do núcleo nasce com `org_id uuid not null default org_padrao()`,
RLS habilitada e policies `is_staff(auth.uid())` + `org_id = org_padrao()`
(leitura e escrita; DELETE nunca, nas append-only nem UPDATE). O refinamento
por papel (matriz A17) entra na F1, quando cada tela declarar quem a abre —
regra do handoff: tela sem dono não constrói, policy sem tela não refina.
`anon` não enxerga nada do núcleo na F0.

## D-T1.6 — Append-only é trigger + ausência de policy, nas quatro

`veiculo_eventos`, `partidas`, `lancamentos` e `anuncios` (versionado, spec 50):
trigger que levanta exceção em UPDATE/DELETE **e** nenhuma policy concede os
dois verbos. Correção é evento/estorno com motivo, nunca edição.

## D-T1.7 — Parâmetro vigente não sofre UPDATE de valor

`parametros_avaliacao`, `ciclo_parametros`, `regras_contabilizacao`,
`regras_comissao`: linha vigente só aceita UPDATE que **encerre a vigência**
(`vigencia_ate` de null para data); qualquer outra alteração é INSERT de linha
nova. Trigger garante; contrato/avaliação antigos guardam os parâmetros do dia.

## D-T1.8 — Ordem das fatias e dependências cruzadas

`a` org+enums → `b` veiculos+entradas (CHECK de troca sem FK ainda) → `c`
eventos+auditoria → `d` custos+preços → `e` razão → `f` parâmetros → `g`
negócios (+ FK `venda_origem_id` de entradas→negocios entra aqui) → `h`
documentos+anuncios+renave_operacoes → `i` `calcula_situacao` + view. Cada
fatia: aditiva, ensaio com ROLLBACK, `--gravar`, rodapé no livro-razão.
