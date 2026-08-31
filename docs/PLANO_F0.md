# Plano da F0 — adequação, base e migração

**Status: PROPOSTO em 2026-08-28, v2 em 2026-08-29 — aguardando aprovação do dono.
Nenhuma migração da F0 roda antes do OK.** (É o passo 2 do
`motors-handoff/docs/fases/KICKOFF-PROMPT.md`; o passo 1 é o
`docs/levantamento-atual.md`.)

> **v2 (29/08) — adendo do dono:** entra na F0 o **cadastro nativo de veículos
> no /admin** (T6), com a trava correspondente: o sync do RevendaMais só
> sobrescreve veículos que ele próprio cadastrou — veículo nascido no painel
> nunca é alterado pelo sync.

## Andamento (29/08, aprovado pelo dono)

| Tarefa | Estado |
|---|---|
| **T1** mapa de convivência | ✅ `docs/MAPA_CONVIVENCIA_SCHEMA.md` (D-T1.1 a D-T1.8) |
| **T2** schema núcleo | ✅ 9 fatias (f0a–f0i) **aplicadas em produção**, cada uma ensaiada com ROLLBACK |
| **T6** cadastro nativo + trava | ✅ completo — banco (f0k), tela `/admin/estoque/novo`, `POST /api/estoque`, reprecificação do nativo (T6-b), entrada no núcleo e guarda de duplicidade (f0o) |
| **T7** storage próprio | ✅ bucket `veiculos` (f0p) + galeria no painel + **migração executada**: 37 dos 38 ativos fora do carro57, 160 MB |
| revisão adversarial | ✅ rendeu **f0j** (uma linha vigente por régua; TRUNCATE fora da API) e **f0l** (anon fora do núcleo — o `pg_default_acl` do Supabase concedia por baixo do `revoke from public`; `confirmacoes_disponibilidade` virou append-only) |
| testes | ✅ `tests/f0-nucleo.test.ts` — 56 invariantes, provados por mutação (17 injetadas, 17 pegas) |
| **T3** carga | ⏸ **bloqueada em H1** (exportação do RevendaMais) |
| **T4** conferência diária | ⏸ depende da carga ter o que conferir |
| **T5** backup | ⏸ PITR é add-on pago — decisão de custo do dono |

**Decisão de infraestrutura (dono, 2026-08-29):** as fotos ficam no **Supabase
Storage**, não num S3 próprio na VPS — "vamos manter como está o S3, se preciso
atualizo o supabase para o pro". O que sustentou a escolha: o limite da Vercel
que preocupava é o do *bundle de deploy* (foto de runtime não entra nele), e o
limite dela que este projeto de fato já bateu é a cota de otimização de imagem
(`/_next/image` com 402) — resolvida servindo do CDN próprio. Volume medido:
1.497 fotos hoje, algo entre 0,5 e 1,5 GB tratadas, contra 100 GB no Pro. Um S3
na VPS poria TLS, backup, monitoração e a banda de toda visita à vitrine na
mesma máquina do n8n.

**Quando o Pro passa a ser necessário — medido, não estimado.** A previsão aqui
era de ~750 MB para migrar os 104 veículos, o que estouraria o 1 GB do Free.
Errou por larga margem, e para o lado bom: migrar **só os ativos** (o recorte
que o dono pediu) custou **160 MB**, 16% da cota. O que enxugou foi o recorte,
não a compressão — 66 dos 104 são vendidos ou arquivados e não vieram. A conta
de quando o Pro entra muda de "assim que migrarmos as fotos" para **"quando o
estoque ativo passar de ~6× o de hoje, ou quando a F2 trouxer o histórico"**.
Nenhum dos dois é este mês.

**A virada de 2026-08-30 — o RevendaMais deixa de ser dono do dado.** Decisão do
dono: *"para o sync cron, deixa apenas a opção de importação com acionamento
manual, sem override, criamos rascunhos dos carros para serem finalizados antes
de serem publicados"*. Executado: o cron de 6 h foi **desligado no n8n** (nó de
agendamento marcado `disabled`, visível no editor; o gatilho manual ficou), a
migração `20260830120000_f0q` criou `estado_cadastro`
(`rascunho|publicado|arquivado`) e a trava do sync virou total. O backfill
preservou a vitrine (38 publicados, 24 vendidos, 42 arquivados) e o feed do
catálogo seguiu devolvendo os mesmos 34 itens.

> **Por que a coluna, e não só desligar o cron:** "estar no ar" era derivado da
> janela de `last_seen_at`. Com importação manual, importar UM carro o tornaria
> "o ciclo mais recente" e derrubaria os outros 38 da vitrine — sem ninguém ter
> mexido em nada. O estado precisava deixar de ser inferido do relógio do robô.

**A LACUNA do storage — FECHADA em 31/08.** O plano previa escolher entre
colunas de override de foto (a) e esperar a F2 (b). **Nenhum dos dois foi
preciso**: a trava total do sync (f0k + f0q) tirou do RevendaMais o poder de
sobrescrever qualquer coluna, de qualquer veículo — inclusive as três de foto,
inclusive nos que ele mesmo importou. Sem sobrescrita não há o que blindar, e a
galeria vale para todo o estoque sem migração de override nenhuma.

Executada a alternativa (a) do dono no sentido de *trazer as fotos*, com o
recorte que ele pediu — só carros ativos, descartando indisponível/vendido/fora
de estoque: **37 dos 38 migrados** (o 38º, `8392516`, não tem foto nenhuma), 554
fotos, 1.050 arquivos, 160 MB no bucket `veiculos`. Verificado depois: zero URL
do carro57 no estoque ativo, e o feed de catálogo em produção com os mesmos 34
itens de antes. Runbook e números em `supabase/README.md`; desfazer em
`supabase/manutencao/reversao/`.

Os 66 arquivados e vendidos **seguem apontando para o carro57** — é o descarte
que o dono autorizou, e o que quebra se o fornecedor desligar são fotos de carro
que não está à venda. Fica dito, não fica escondido.

**Pendências das revisões — o que foi resolvido desde então:**
- ✅ **O núcleo já sabe do veículo nativo.** `cadastrar_veiculo_nativo` (f0o)
  escreve numa transação só: `estoque_motors` + `veiculos` (uuid+chassi) +
  `veiculo_entradas` + evento `ENTRADA`. O momento do cadastro virou o momento
  do evento de entrada, como o plano suspeitava que devia ser.
- ✅ **A tabela A6 não mente mais.** `estado_cadastro` (`rascunho`/`publicado`/
  `arquivado`) é coluna, não inferência: carro sem foto fica em rascunho e a
  tabela mostra rascunho.
- ✅ **Guarda de duplicidade no banco** (f0o): três índices únicos em forma
  canônica — `placa` (sem hífen nem espaço, maiúscula), `chassi` e `renavam`.
  `btrim` não tira hífen: `ABC-1D23` passava. O índice normaliza, e a função
  grava já normalizado.
- ⏳ **PDP do nativo alcançável por URL** antes das fotos — segue de pé.
  Comportamento pré-existente para carros do feed com menos de 8 fotos; vale
  honrar `publicavel` (ou `noindex`).

**Achado da entrega da T6 — reprecificação do nativo (T6-b), RESOLVIDO:** o editor A15 mostra
preço como texto, não campo, e `preco` não está em `CAMPOS_NOSSOS`
(`src/lib/estoqueEscrita.ts`). O motivo é bom e está escrito lá: o sync
sobrescreveria a edição no ciclo seguinte, em silêncio. **Só que esse motivo não
existe para o veículo nativo** — a trava da f0k garante que o sync nunca toca
nele. Sem corrigir, a loja cadastra um carro e não consegue mais mudar o preço.
Correção: `preco`/`preco_original` graváveis **apenas** quando
`origem = 'painel'`, na linha "Alterar preço acima de 5%" da matriz A17 (Admin,
Gestor, Financeiro). O Comercial fica de fora até existir o fluxo de revisão
(A16) que a alçada de 5% pressupõe — errar para baixo, como manda a régua da
matriz.

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

**T6 — Cadastro nativo de veículos + trava do sync** *(adendo do dono, 29/08;
db-architect + frontend-admin; exceção aditiva e deliberada à regra
"estoque_motors intocada até a F2")*

O primeiro pedaço do strangler pela porta de entrada: veículo passa a poder
nascer no admin, sem RevendaMais — e o sync perde o direito de escrita sobre ele.

- **Banco (aditivo):** coluna `origem text not null default 'sync'`
  (check `sync|painel`; as 104 linhas atuais nascem `'sync'` pelo default) +
  sequence própria para ids nativos a partir de **900.000.001** — o feed usa
  6.170.299–8.429.524 (verificado em produção 29/08), faixas disjuntas dentro
  do `integer`, colisão impossível.
- **A trava é no banco, não no n8n:** trigger BEFORE UPDATE em `estoque_motors`
  — se `OLD.origem = 'painel'` e a escrita tenta carimbar `last_seen_at`
  (assinatura exclusiva do sync; nenhuma rota do painel grava esse campo), a
  atualização é **ignorada**. O workflow do n8n não precisa mudar e não é
  confiável como única defesa; o INSERT do sync nunca colide (faixas disjuntas).
  Autoconferência da migração: simular o upsert do sync contra um veículo
  `painel` e provar que nada muda.
- **Visibilidade no site:** `getEstoque`/`getSinaisDeEstoque` filtram pela
  janela do último sync (`last_seen_at`) — que os nativos não têm. O caminho de
  leitura passa a tratar `origem='painel'` como sempre-presente, com
  disponibilidade governada por `vendido` (+ regra de publicação abaixo).
  Mudança pequena no contrato de leitura, coberta por teste (`ultimo-sync` e
  vizinhos); a coluna nova **não** entra no mapper público.
- **Tela:** `/admin/estoque/novo` + rota POST — a ficha completa do editor A15,
  gate pela matriz (Admin e Comercial criam; Marketing não — mesma linha de
  "Publicar ou despublicar veículo"). Fotos por **upload para bucket próprio**
  no Supabase Storage (padrão já existente do `upload-branding`/`imageProcessor`),
  gravadas em `url_imagem`/`whatsapp_images`/`web_full_images` no MESMO formato
  do feed — antecipa uma fatia do item 16 do backlog (sair do carro57).
- **Publicação (proposta, confirmar):** o nativo aparece no site quando tiver
  ao menos 1 foto; sem foto fica só no admin. É a "foto mínima" da spec 50 na
  régua mais branda possível — não é filtro de vitrine, é anúncio incompleto.
- **Conferência diária (T4)** compara apenas `origem='sync'` — divergência de
  nativo com o Revenda não existe por definição.
- **Fronteira com a F1:** este formulário é compra simplificada sem
  contabilização (o razão nasce na F1). Na F1 ele evolui para as 5 portas da
  spec 10 gravando no núcleo; os nativos da F0 entram no núcleo pela mesma
  carga/mapa da T3.

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
7. **Cadastro nativo provado em produção** (v2): 1 veículo de teste cadastrado
   pelo painel, publicado no site, e **intocado por 2 ciclos do sync** (12 h) —
   a prova de que a trava segura de verdade; depois, o teste é marcado vendido.

## Notas de risco

- **O repositório é público** — o handoff entra versionado como o manual já está;
  nenhum segredo nos arquivos (tokens vivem em env/`.claude/*.json`, gitignorados).
- Frentes paralelas ativas (funil de vendas; correção dos 2 testes do main):
  coordenar por PR pequeno, uma tarefa por PR.
- Nada da F0 toca `estoque_motors`, o sync, o site público ou o funil `/avaliacao`.
