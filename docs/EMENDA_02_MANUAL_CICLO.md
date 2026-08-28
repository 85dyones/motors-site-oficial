# Emenda 02 ao Manual Motors Ciclo

**Ao:** `MANUAL_MOTORS_CICLO.md`, Versão 1.1 — Agosto 2026
**Data da proposta:** 2026-08-28
**Status:** ✅ **aprovada e publicada como v1.2 em 2026-08-28**
**Aprovada por:** Dyones — 28/08/2026 ("mantenha o percentual da FIPE", na análise de impacto do motors-handoff)
**Origem:** decisão do dono ao resolver o conflito C1/C2 da análise "Handoff × Sistema Vivo" — o handoff (spec 40, itens 37e/37d) descrevia a recompra como **percentual da FIPE definido no fechamento da venda**, "regra da casa, confirmada"; o manual v1.1 mantinha a recompra desligada por gatilho e desqualificava a FIPE como referência contratual. Um dos dois tinha que ceder formalmente. Cedeu o manual.

> Os artigos E1–E6 foram incorporados ao corpo do `MANUAL_MOTORS_CICLO.md`, que
> passou à **Versão 1.2**. Este arquivo permanece como registro do que mudou e
> por quê — o mesmo papel da Emenda 01.

> Redigida porque o manual é a fonte de verdade do projeto e divergência entre
> manual e realidade não se resolve no código. A regra da casa já opera em
> percentual da FIPE; era o manual que estava dizendo outra coisa.

---

## Motivação

A v1.0/v1.1 tratava a recompra como promessa que só pode ser escrita sobre
curva de depreciação própria — daí o valor "em reais, não em percentual da
FIPE" (§1.3), o `fator_retencao` de série histórica (§5.5) e o gatilho de
ativação (§1.4) que mantinha tudo desligado até a base existir.

Três coisas mudaram desde que esse desenho foi escrito:

1. **O mercado ancorou a recompra na FIPE.** BYD vende "Recompra Garantida"
   e GWM promete percentual da FIPE na troca — âncoras que o próprio
   levantamento do handoff documenta. O cliente chega sabendo o que é FIPE e
   comparando promessas nesses termos. Uma promessa "em reais definidos por
   curva própria" é mais defensável no papel e **incomunicável no balcão**.
2. **O percentual sobre a FIPE futura carrega a depreciação junto.** O medo
   da v1.0 era escrever valor fixo sem saber quanto o carro valeria — mas
   85% da FIPE **vigente no retorno** não é valor fixo: se o mercado cair, a
   FIPE cai e a promessa cai junto. O risco residual (FIPE ser média nacional
   retroativa, descolada do praticado local) é tratável por trava, e é
   exatamente o que o artigo E3 faz.
3. **A regra da casa já é essa.** O levantamento do handoff registrou a
   mecânica como "regra da casa, confirmada": percentual sobre FIPE, modulado
   pela conformidade das revisões. Manual que proíbe o que a casa pratica não
   é fonte de verdade — é ficção normativa.

A saída não é abandonar a prudência da v1.0 — é **trocar o instrumento dela**:
sai o gatilho estatístico que nunca abriria a tempo do produto existir, entram
salvaguardas contratuais e comerciais que valem desde o primeiro contrato
(trava pelo praticado, franquia de KM, vistoria, excludentes, parecer jurídico
e provisionamento).

---

## E1 — §1.4, o gatilho de ativação é revogado

**Hoje (v1.1, §1.4):** a recompra permanece desligada até
`conformidade_revisao >= 70%` por 3 meses, `veiculos_monitorados >= 150` e
`serie_procedencia >= 6 meses` — e, por fora, até o `fator_retencao` do §5.5
existir a partir de série própria.

**Passa a ser:** o gatilho estatístico **deixa de condicionar o produto**. O
que ele protegia — não escrever opção de venda no escuro — passa a ser
protegido por quatro salvaguardas que valem por contrato, não por acúmulo de
série:

1. **Trava pelo praticado** (E3): o percentual pleno nunca excede o que a
   casa efetivamente paga por perfil de carro, menos a margem alvo.
2. **Parecer jurídico + provisionamento antes do primeiro contrato** — a
   nota do §1.3 permanece intacta: a recompra fixada é opção de venda que a
   Motors escreve, é passivo contábil, e o teto de exposição agregada
   continua sendo aprovado pela diretoria (§1.2).
3. **Parâmetros validados e datados** (E3): os percentuais são seed em
   `ciclo_parametros`, com vigência — e o seed só vira contrato depois de
   batido contra o percentual que a casa paga hoje, por perfil.
4. **Franquia, vistoria e excludentes** (E4): o contrato delimita o estado do
   carro que volta.

A série de conformidade (`conformidade_diaria`, `serie_procedencia`) e o
painel do indicador **continuam existindo e obrigatórios** — mudam de papel:
deixam de ser porteiro e viram instrumento de gestão e de recalibração
trimestral dos percentuais (E5).

**Consequência no código:** o gatilho implementado em
`src/lib/ciclo/gatilho.ts` (limiar 70, 150 monitorados, 6 meses de série)
fica obsoleto e se aposenta quando o Ciclo for portado ao núcleo do handoff —
não precisa de remoção de emergência, porque nada mais o consulta como
bloqueio de produto.

---

## E2 — §1.3, a referência contratual passa a ser o percentual da FIPE

**Hoje (v1.1, §1.3, primeiro item):** "Valor de recompra em reais, não em
percentual da FIPE (FIPE é média nacional retroativa e não serve como
referência contratual)".

**Passa a ser:** "Percentual da FIPE **vigente no exercício**, definido no
fechamento da venda e escrito em contrato junto com a tabela de faixas de
conformidade e a tabela de deduções (KM excedente e avaria)".

O argumento antigo não estava errado — a FIPE **é** média nacional
retroativa. O que muda é onde o risco disso é tratado: em vez de proibir a
referência, o contrato a usa **com trava** (E3). E ganha o que a proibição
não tinha como dar: uma promessa que o cliente entende no balcão, compara com
BYD e GWM, e que se autoajusta se o mercado cair.

**O §5.3 (valor de mercado) não muda.** "Nunca FIPE pura" continua valendo
para *estimar valor de mercado* — equity mining, posição de troca, curva do
§5.8. Recompra é outra coisa: promessa comercial escrita, não estimativa. Os
dois usos convivem sem contradição — um é régua de leitura do mercado, o
outro é cláusula.

---

## E3 — §5.5, a precificação por faixas de conformidade

**Hoje (v1.1, §5.5):** `recompra_piso = valor_venda × fator_retencao × fator_seguranca`,
teto a 1,08 × piso, valor vigente modulado pelo Índice Ciclo — tudo condicionado
a `fator_retencao` vir de série própria.

**Passa a ser:**

```
recompra_vigente = percentual_da_faixa × FIPE_vigente_no_exercicio
                   − deducao_km_excedente − deducao_avarias
```

**As faixas — seed proposto, em `ciclo_parametros` com vigência datada:**

| Conformidade das revisões | Crédito em troca | Dinheiro |
|---|---|---|
| **Em dia** — todas documentadas dentro da janela | 85% | 80% |
| **Recuperada** — 1 atraso, recuperado em até 60 dias (máx. 1 por ciclo) | 80% | 75% |
| **Fora** — atraso não recuperado | **extinta** — o carro entra por avaliação normal |

**A trava que substitui o gatilho:** o percentual pleno de cada perfil de
carro respeita

```
percentual_pleno × FIPE ≤ preço praticado pela casa no perfil − margem alvo
```

— a Motors nunca promete pagar amanhã mais do que paga hoje pelo mesmo carro,
menos a margem que a operação precisa. Se a conta não fecha para um perfil, o
perfil não é elegível; o percentual não se estica.

Regras que amarram a fórmula:

- **Os percentuais são dado, não código** (decisão de arquitetura do handoff):
  vivem em `ciclo_parametros` com vigência datada; **o contrato guarda os
  parâmetros do dia da assinatura** — mudar a régua depois não muda contrato
  assinado.
- **Os seeds acima ainda precisam ser batidos contra o praticado real da
  casa, por perfil, antes do primeiro contrato** — é pendência declarada do
  levantamento do handoff, e a trava acima é o critério do teste.
- Crédito em troca > dinheiro **por desenho**: a recompra existe para trazer
  o cliente de volta ao estoque, não para ser liquidez.
- A promessa vale **até o novo negócio** — exercida na troca ou na venda do
  carro de volta à loja; o carro reentra por troca ou compra direta com a
  regra de preço do contrato sobreposta à avaliação.
- `fator_retencao` e `fator_seguranca` saem da fórmula. A curva de
  depreciação própria **continua sendo construída** (é o histórico
  proprietário do §1.1) — e vira instrumento de **recalibração trimestral**
  dos percentuais e da margem alvo (E5), não pré-condição.

---

## E4 — Franquia, vistoria e excludentes (novos no corpo do §5.5)

O contrato delimita o estado do carro que volta — é a metade da salvaguarda
que a trava (E3) não cobre:

- **Franquia de rodagem: 15.000 km/ano** (já era o teto do §1.2). O excedente
  não extingue a promessa: é **precificado pelos degraus de KM da curva de
  avaliação da casa** — a mesma régua usada para qualquer carro que entra —
  e deduzido do valor. Sem teto de corte por KM.
- **Vistoria de retorno obrigatória** (o §1.3 já dava o direito; vira etapa
  do fluxo). Avarias além do desgaste normal são deduzidas **por orçamento**,
  não por tabela genérica.
- **Excludentes** — extinguem a promessa, listados exaustivamente em
  contrato: sinistro classificado (média ou grande monta), gravame não
  quitado no exercício, adulteração de KM ou de identificação.
- **Documentação da revisão em até 30 dias** do serviço (a régua de
  "recuperada" conta a partir do fim da janela).

---

## E5 — §5.6 e §5.7, o Índice Ciclo muda de papel

**Hoje (v1.1):** o Índice Ciclo (3 componentes renormalizados) modula o valor
de recompra entre piso e teto; a conformidade é um dos componentes e o
indicador do gatilho.

**Passa a ser:**

- **O valor de recompra é função só da faixa de conformidade** (E3). O
  Índice Ciclo **sai da fórmula de valor** e permanece como **indicador de
  painel e de engajamento** — série mensal em `indice_ciclo`, como já é.
- **A regra de neutralidade permanece integral**: recusa (de telemetria,
  quando existir, ou do registro de odômetro) nunca penaliza. Com o índice
  fora da fórmula de valor, a neutralidade fica ainda mais simples de
  garantir: recusa não toca dinheiro por construção.
- **§5.7 (conformidade de revisão)** continua exatamente como está — régua de
  verificação, `confirmada_em` + `dentro_da_janela`, série diária. Muda a
  frase de propósito: em vez de "é o número que destrava a Fase 2", passa a
  ser **o número que define a faixa de cada contrato** e mede a saúde do
  programa. A verificação contra a etiqueta (Emenda 01) segue sendo o que
  neutraliza fraude — agora com consequência direta no valor, por faixa.
- **Recalibração trimestral**: o histograma do percentual praticado contra a
  curva alvo (previsto no handoff para a F2) é o instrumento que ajusta
  seeds e margem alvo com dado próprio — a curva de depreciação da casa
  continua sendo acumulada e usada, só que para **calibrar**, não para
  **liberar**.

---

## E6 — §1.1 e §1.2, ajustes de coerência

- **§1.1, linha "Recompra fixada"**: "por valor definido em contrato" passa a
  "por **percentual da FIPE definido em contrato**, por faixa de
  conformidade".
- **§1.2, "Valor de recompra"**: "percentual do valor pago, definido por
  faixa de modelo e prazo" passa a "percentual da FIPE vigente no exercício,
  por faixa de conformidade, com trava pelo praticado da casa por perfil". O
  **teto de exposição agregada aprovado pela diretoria permanece**.
- **§1.2, "KM máximo"**: o excedente passa a referenciar os degraus da curva
  de avaliação (E4), não "tabela publicada" própria — é a mesma tabela que a
  casa já usa para precificar entrada.
- **§1.2, "Perda de elegibilidade"**: ganha "gravame não quitado no
  exercício" (E4), alinhando com os excludentes contratuais.

---

## O que esta emenda NÃO altera

Explicitamente, para não haver leitura por omissão:

1. **Parecer jurídico e provisionamento continuam obrigatórios antes do
   primeiro contrato assinado** (§1.3). A emenda destrava a *mecânica*, não a
   assinatura: enquanto parecer + provisionamento + validação dos seeds não
   existirem, contratos seguem sem cláusula de recompra e campos `recompra_*`
   seguem nulos.
2. **O diário de bordo inteiro** (Emenda 01): janelas de revisão (10.000 km /
   12 meses, tolerância 30 dias / 1.000 km), verificação pela etiqueta,
   plano_revisoes, leituras declaradas, KM de saída como primeira notação —
   nada muda. A recompra agora **depende** dessa máquina: é ela que decide a
   faixa.
3. **A regra de neutralidade do §5.6** — recusa nunca penaliza.
4. **A recomendação de troca calculada e não sobrescrevível** (§5.8/§6.3-C) e
   a **regra 4 do CLAUDE.md**.
5. **Nenhum traçado bruto de GPS**, quando a telemetria entrar.
6. **O teto de exposição agregada** aprovado pela diretoria (§1.2) e o selo
   de procedência (decisão de 2026-08-20: só com janela cumprida).

---

## Registro das decisões de 2026-08-28

| # | Questão | Decisão | Artigo |
|---|---|---|---|
| D10 | Referência da recompra: reais × % FIPE | **"Mantenha o percentual da FIPE"** — vale a mecânica do handoff (spec 40) | E2, E3 |
| D11 | Gatilho do §1.4 | Revogado; substituído pelas salvaguardas contratuais | E1 |
| D12 | Modulação do valor | Faixas de conformidade (em dia / recuperada / fora); Índice Ciclo vira indicador | E3, E5 |
| D13 | Seeds 85/80 · 80/75 | Aceitos como seed em `ciclo_parametros`; validar contra o praticado por perfil antes do 1º contrato | E3 |
| — | Contexto | Módulo de caixa aposentado na mesma data (migração `20260828190000`); o financeiro renasce sobre o razão do handoff | — |

**Ainda sem decisão:** a margem alvo por perfil (nº da trava), a validação
jurídica dos templates de contrato (spec 60 do handoff) e o provisionamento
contábil — os três bloqueiam o primeiro contrato assinado, não o
desenvolvimento.

---

## Vigência

**Em vigor desde 2026-08-28.** O `MANUAL_MOTORS_CICLO.md` passou à **Versão
1.2** com os artigos E1–E6 incorporados ao corpo; este arquivo permanece como
registro do que mudou e por quê.

**Aprovada por:** Dyones  **Data:** 28/08/2026

---

### Fontes e âncoras de mercado (do levantamento do handoff)

- [BYD Recompra Garantida](https://www.byd.com/br/noticias-byd-brasil/BYD-lanca-programa-de-recompra-garantida) — recompra ancorada em percentual de tabela
- [GWM — 100% da FIPE na troca](https://www.mobiauto.com.br/revista/gwm-promete-100-da-tabela-fipe-na-troca-por-ora-03-ou-h6-gt-mas-exclui-byd/6622) — a âncora de comunicação que o balcão enfrenta
- Handoff Motors: `motors-handoff/docs/specs/40-ciclo.md` (mecânica, seeds e trava) e artefato "Saída do RevendaMais" v7 (benchmark e pendências)
