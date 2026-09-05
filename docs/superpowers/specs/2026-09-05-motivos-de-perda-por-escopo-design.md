# Quem só quer vender perde diferente — motivos de desfecho por escopo

**Data:** 2026-09-05 · **Status:** desenho aprovado pelo dono, não implementado

> Pedido do dono, 2026-09-05: *"precisamos ter opções diferentes para clientes
> de avaliação, onde contemple casos que o cliente queira apenas vender e nós
> não tenhamos interesse, casos onde nossa avaliação não interesse ao cliente,
> onde ele negue consignar."*

---

## 1. O diagnóstico

A caixa de desfecho (`ModalDeDesfecho.tsx`, 2026-08-28) pergunta **por quê**
antes de fechar o negócio, e filtra a lista de motivos por uma coisa só:

```ts
motivos.filter((m) => m.ativo && m.tipo === etapa.tipo)
```

`tipo` é `ganho | perdido | descartado` — *como o negócio terminou*. Não existe
em lugar nenhum a noção de **que negócio era**.

E são dois negócios opostos. `/api/avaliacao` grava o lead com
`canal: "Avaliação"`, e o comentário da própria rota já nomeia a diferença:

> *"O interesse aqui é o inverso do lead comum: a pessoa quer VENDER este
> carro, não comprá-lo. O canal é o que distingue os dois no kanban."*

O canal distingue no kanban. Não distinguia no desfecho. O resultado é o que a
tela mostra hoje para quem só queria vender o carro dele:

- *"Preço acima do que o cliente queria pagar"* — não há preço nosso em jogo
- *"Financiamento ou crédito reprovado"* — não há financiamento
- *"Não tínhamos o carro que ele queria"* — ele não quer carro nenhum
- *"Vai comprar mais para frente"* — ele não vai comprar

Nove dos dez motivos de perda são sobre uma venda que não aconteceu. E os três
desfechos que o dono nomeou — **não temos interesse no carro**, **a avaliação
não interessou ao cliente**, **ele não aceitou consignar** — não têm onde cair.
O vendedor escolhe o mais próximo, e o relatório de *"por que a gente perde"*
passa a somar perdas de compra com perdas de aquisição na mesma barra.

O motivo mais próximo é `avaliacao_do_usado` ("Avaliação do usado abaixo do
esperado"), e é a armadilha: ele parece o caso 2 e não é. Ver §3.

---

## 2. A decisão

`funil_motivos` ganha um **escopo**: para que tipo de lead aquele motivo existe.
A caixa escolhe a lista sozinha, pelo canal do lead. O vendedor não decide nada
— e por isso não erra.

Três decisões do dono na conversa de 2026-09-05:

| # | Decisão |
|---|---|
| **D1** | Escolha **automática pelo canal**, não manual pelo vendedor. Relatório à mercê de quem clicou errado não é relatório. |
| **D2** | **Só a perda** ganha lista própria por ora. O ganho segue compartilhado. |
| **D3** | Os **7 motivos** de perda de avaliação entram (os 3 do dono + os 4 propostos no desenho). |

**Fora de escopo, deliberadamente:**

- **O ganho da avaliação.** Hoje o ganho é *forma de pagamento do cliente* (À
  vista, Financiado, Com troca, Consórcio), e num lead de avaliação o ganho é
  *o carro entrou* — vocabulário que o núcleo já tem em `modalidade_tipo`
  (`compra_direta`, `troca`, `consignacao`, `parceria`, `repasse`). Proposto e
  adiado por D2. Consequência assumida: quem fechar uma consignação vai marcar
  "À vista" ou deixar em branco, e o relatório de *como o carro entrou* não
  nasce aqui.
- **Corte do relatório por escopo.** `agruparPorMotivo` já absorve motivo novo
  sozinho; o corte é outra tela e outro PR.

---

## 3. As duas avaliações que não são a mesma

`avaliacao_do_usado` já existe (`escopo: compra`) e o caso 2 do dono ganha
chave nova (`avaliacao_recusada`, `escopo: avaliacao`). Parecem redundantes e
não são:

| | `avaliacao_do_usado` | `avaliacao_recusada` |
|---|---|---|
| **O lead queria** | comprar um carro nosso, dando o dele na troca | só vender o carro dele |
| **O que morreu** | a **venda** de um carro do pátio | a **aquisição** de um carro para o pátio |
| **O que a loja faz com o número** | rever a régua de troca para destravar venda | rever a régua de compra para encher o pátio |

Fundir as duas faria o relatório dizer *"perdemos por avaliação"* sem dizer
qual dos dois negócios se perdeu — e as duas decisões que saem daí são
opostas. Ficam separadas.

---

## 4. Schema

Migração **aditiva** (permitida na janela de convivência — nada de DROP,
RENAME ou ALTER TYPE em objeto em uso):

```sql
alter table public.funil_motivos
  add column if not exists escopo text not null default 'ambos';

alter table public.funil_motivos
  drop constraint if exists funil_motivos_escopo_valido,
  add  constraint funil_motivos_escopo_valido
    check (escopo in ('compra', 'avaliacao', 'ambos'));
```

`default 'ambos'` é a posição segura: coluna nova não pode fazer motivo
existente sumir de tela nenhuma.

### 4.1 A reclassificação, e o seu limite

A migração faz **um `update` nominal só**: as **8 chaves de §6.1** passam a
`compra`, por `where chave in (...)`. Todo o resto — os 4 de ganho, os 6 de
descarte, o `sem_resposta` e qualquer motivo que o dono tenha digitado pela
tela **Configurar funil** — fica no `default 'ambos'` e continua aparecendo nos
dois lados.

Só se toca no que a semente escreveu, e nominalmente. Reclassificar por
heurística o que uma pessoa digitou à mão seria decidir por ela e fazer sumir
da tela um motivo que ela usa — a ausência silenciosa que este repositório vem
perseguindo.

> Nota de contagem: a perda tem **9** motivos, não os 10 da semente original de
> 2026-08-28. `contato_invalido` mudou de lado em
> `20260828160000_desfecho_sem_oportunidade.sql` (virou `descartado`, mantendo
> a chave). 8 viram `compra`, 1 fica `ambos`.

### 4.2 O que não muda

`escopo` filtra **o que a caixa oferece**, e nada mais.
`leads.desfecho_motivo` já gravado, a chave estrangeira
`leads_desfecho_motivo_do_funil` e o relatório ficam intocados. Nenhum
desfecho histórico é reinterpretado.

---

## 5. Como a caixa sabe qual lista mostrar

Um predicado em `src/lib/funil.ts` — não um `if` solto no componente, porque
a resposta precisa ser a mesma na caixa e em qualquer tela que venha depois:

```ts
export type EscopoDeMotivo = "compra" | "avaliacao" | "ambos";

export const ESCOPOS_DE_MOTIVO: readonly EscopoDeMotivo[] =
  ["compra", "avaliacao", "ambos"];

/** Guarda de tipo. Recusa o desconhecido — não converte. */
export function ehEscopoDeMotivo(v: unknown): v is EscopoDeMotivo;

/** Que negócio é este lead, a partir do canal por onde ele entrou. */
export function escopoDoLead(canal: string | null | undefined): "compra" | "avaliacao";

/** Os motivos que a caixa oferece: do tipo certo E do escopo certo. */
export function motivosVisiveis(
  motivos: MotivoDoFunil[],
  tipo: TipoDeDesfecho,
  escopo: "compra" | "avaliacao",
): MotivoDoFunil[];
```

### 5.1 Por que substring, e não lista fixa de canais

Hoje os canais de avaliação são exatamente dois: `"Avaliação"`
(`/api/avaliacao`) e `"Appraisal Chat"` (`AutoAvaliacao.tsx`). Uma lista fixa
resolveria hoje e falharia calada amanhã: um `"Avaliação WhatsApp"` nasceria
fora dela, cairia em `compra`, e ninguém veria erro nenhum.

É o mesmo defeito que `/api/leads` já tem escrito no comentário sobre o
captcha — *"um canal novo na ficha nasceria fora da lista e sem captcha, em
silêncio, para sempre"*.

`escopoDoLead` normaliza (minúsculas, sem acento) e procura `avalia` ou
`appraisal`. `""`, `null` e canal desconhecido caem em `compra` — o funil
padrão.

O risco da substring é o falso positivo, e ele se testa: a suíte lista **todos
os canais que o site escreve hoje** — `Formulário Contato`, `Lead Popup`,
`WhatsApp Proposta`, `WhatsApp Dúvidas`, `CarMatch Recommendations`,
`Garagem Match Profiler`, `Avaliação`, `Appraisal Chat` — e prova que os seis
primeiros dão `compra` e os dois últimos dão `avaliacao`. Canal novo que
colidir quebra o teste antes de chegar em produção.

### 5.2 Lista vazia nunca prende o card

Se o filtro por escopo devolver zero motivos, `motivosVisiveis` cai para a
lista completa daquele `tipo`. Motivo fora de contexto é ruim; card que não
fecha é pior — e a caixa é o único caminho para tirar o lead do quadro.

O estado vazio de hoje ("Nenhum motivo de perda está cadastrado…") continua
existindo para o caso real de lista vazia de verdade.

### 5.3 Na rota de configuração

`/api/funil/config` normaliza `escopo` **contra `ESCOPOS_DE_MOTIVO`, com
recusa** — nunca com ternário.

É a lição que o `funil.ts` já tem escrita em prosa: o ternário
`m.tipo === "ganho" ? "ganho" : "perdido"` estava certo enquanto havia dois
desfechos e, no dia em que entrou o terceiro, converteria todo motivo de
descarte em motivo de perda, sem erro e sem aviso. Um ternário sobre `escopo`
faria `avaliacao` virar `compra` do mesmo jeito. Lista não tem "else": valor
fora dela é recusado, não convertido.

---

## 6. A lista

### 6.1 Perda — escopo `compra` (existentes, reclassificados)

| chave | rótulo |
|---|---|
| `preco` | Preço acima do que o cliente queria pagar |
| `comprou_concorrente` | Comprou em outro lugar |
| `credito_reprovado` | Financiamento ou crédito reprovado |
| `sem_estoque` | Não tínhamos o carro que ele queria |
| `avaliacao_do_usado` | Avaliação do usado abaixo do esperado |
| `condicoes_pagamento` | Condições de pagamento ou entrada |
| `desistiu` | Desistiu de trocar de carro |
| `comprar_depois` | Vai comprar mais para frente |

### 6.2 Perda — escopo `ambos`

| chave | rótulo |
|---|---|
| `sem_resposta` | Sumiu — não respondeu mais |

O único que descreve o mesmo acontecimento nos dois negócios.

### 6.3 Perda — escopo `avaliacao` (novos)

| # | chave | rótulo | origem |
|---|---|---|---|
| 1 | `nao_temos_interesse` | Não temos interesse neste carro | dono |
| 2 | `avaliacao_recusada` | Não aceitou o valor da nossa avaliação | dono |
| 3 | `recusou_consignacao` | Não aceitou deixar em consignação | dono |
| 4 | `vendeu_para_outro` | Vendeu para outro comprador | proposto |
| 5 | `desistiu_de_vender` | Desistiu de vender | proposto |
| 6 | `nao_trouxe_para_vistoria` | Não trouxe o carro para a vistoria | proposto |
| 7 | `restricao_no_veiculo` | Gravame, multa ou restrição no documento | proposto |

**Por que o #1 importa mais que os outros seis.** É o único motivo do sistema
inteiro em que **quem diz não somos nós**. Ele não mede desempenho do vendedor
— mede a régua de compra da loja. Enquanto ele não existir, toda recusa nossa
some dentro de alguma perda comercial, e o número que responderia *"quantos
carros a gente está deixando passar?"* não existe.

**Por que o #5 e não o `desistiu` de hoje.** O rótulo existente diz *"Desistiu
de trocar de carro"*. Quem só queria vender não estava trocando nada.

**Por que o #6.** O `CLAUDE.md` é explícito: *"quem decide é o consultor,
depois da vistoria"*. O lead que nunca traz o carro é a perda mais barata de
recuperar e hoje não tem onde cair.

### 6.4 Ganho e descarte

Todos ficam em `ambos`, sem alteração. Os de descarte (`spam`,
`teste_interno`, `contato_equivocado`, `duplicado`, `nao_e_cliente`,
`contato_invalido`) são universais por natureza — um robô é um robô nos dois
funis.

---

## 7. A tela Configurar funil

`FunilEditor.tsx` agrupa motivos por `tipo` em três colunas. O grupo
**Perdido** ganha, por linha, um seletor de escopo com três opções escritas
como quem opera lê:

- **Quem quer comprar** (`compra`)
- **Quem quer vender** (`avaliacao`)
- **Os dois** (`ambos`)

Motivo novo criado pela tela nasce em `ambos` — mesma posição segura da coluna.
Ganho e descarte não mostram o seletor: por D2 eles são todos `ambos`, e um
seletor que só tem um valor válido é ruído.

---

## 8. Testes

Em `tests/funil.test.ts`, ao lado do que já existe:

1. **`escopoDoLead` contra os canais reais** — os oito canais que o site
   escreve hoje, nominalmente (§5.1). É o teste que pega colisão de substring.
2. **`escopoDoLead` com entrada degenerada** — `null`, `undefined`, `""`,
   `"  "`, e variações de acento/caixa (`"AVALIAÇÃO"`, `"avaliacao"`) → o
   resultado certo, nunca exceção.
3. **`motivosVisiveis` esconde o que é do outro lado** — lead de avaliação não
   vê `credito_reprovado`; lead de compra não vê `recusou_consignacao`; os dois
   veem `sem_resposta`.
4. **`motivosVisiveis` respeita `ativo`** — motivo desativado não volta por
   causa do escopo.
5. **A queda de segurança** (§5.2) — lista escopada vazia devolve a lista
   completa do tipo, não `[]`.
6. **`ehEscopoDeMotivo` recusa** — `"venda"`, `"COMPRA"`, `null`, `1` → `false`.
   Trava a régua que a rota usa.
7. **`ModalDeDesfecho` renderizado** — dois casos, montando o componente e
   contando os botões da lista: um lead com `canal: "Avaliação"` e um com
   `canal: "Lead Popup"`. Testar só `motivosVisiveis` não prova que a caixa a
   chama; a mutação tem que ser no ponto de chamada.

A migração termina com o rodapé de autoconferência e auto-registro no
livro-razão, como as anteriores do funil: prova pelo **efeito** — consulta o
CHECK, o default e as linhas reclassificadas — e não pela existência da coluna.

---

## 9. Aplicação

1. Ensaiar contra produção com `supabase/manutencao/aplicar-migracao.js` **sem
   `--gravar`** (BEGIN/ROLLBACK) — é o staging que o projeto não tem.
2. Conferir na saída do ensaio pelo **efeito**, não pela existência da coluna:
   o CHECK, o `default 'ambos'`, e a contagem por escopo depois do `update`
   nominal. Esperado: **8 `compra`**, **7 `avaliacao`**, **11 `ambos`** — 1 de
   perda (`sem_resposta`) + 4 de ganho + 6 de descarte. Mais que 11 em `ambos`
   significa que o dono criou motivo pela tela, e está certo assim (§4.1); um
   `compra` a menos que 8 significa que alguém já mexeu na semente, e aí para e
   pergunta.
3. Só então `--gravar`.
4. `qa-guardian` antes do merge, como toda entrega.

## 10. Quem abre, quando, e que decisão sai daí

- **A caixa de desfecho:** o vendedor, no momento em que o negócio morre.
  Decisão que sai: nenhuma — é coleta. O ponto é que a coleta pare de mentir.
- **O relatório do funil:** o dono, na revisão de resultado. Decisão que sai
  agora e não saía antes: *a régua de compra está apertada demais?* — a
  contagem de `nao_temos_interesse` contra a de `avaliacao_recusada` diz se
  quem está dizendo não é a loja ou o cliente, e são dois ajustes diferentes.
