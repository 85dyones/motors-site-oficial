# Motivos de perda por escopo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A caixa de desfecho deixa de oferecer motivos de venda para quem só quer vender o carro dele — `funil_motivos` ganha escopo, e a caixa escolhe a lista sozinha pelo canal do lead.

**Architecture:** Uma coluna `escopo` (`compra | avaliacao | ambos`, default `ambos`) em `funil_motivos`; um predicado puro e testado em `src/lib/funil.ts` (`escopoDoLead`) que lê o `canal` do lead; e um seletor (`motivosVisiveis`) que a caixa chama no lugar do `filter` de hoje. A rota de configuração recusa escopo desconhecido em vez de convertê-lo, e o `FunilEditor` ganha o seletor na coluna Perdido.

**Tech Stack:** Next.js 16 / React 19 · TypeScript · Supabase (Postgres, projeto `zwbqmzgnagfeqinqkolp`) · Vitest (`environment: "node"`)

**Spec:** [`2026-09-05-motivos-de-perda-por-escopo-design.md`](../specs/2026-09-05-motivos-de-perda-por-escopo-design.md)

**Worktree:** `C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao` · branch `feat/quem-so-quer-vender-perde-diferente`, a partir de `origin/main` (`5bd2c5c`).

---

## Global Constraints

Copiados do `CLAUDE.md` e do spec. Valem para **toda** tarefa abaixo.

- **Português** em código, nomes de coluna, commits e comentários. Não anglicizar.
- **Migração aditiva**: criar coluna/índice/policy = ok. `DROP`, `RENAME`, `ALTER TYPE` de objeto em uso = **proibido** nesta janela.
- **Migrações são versionadas** em `supabase/migrations/`. Nunca alterar schema pelo painel.
- **Sempre ensaiar antes de gravar**: `node supabase/manutencao/aplicar-migracao.js <arquivo>` sem `--gravar` roda em `BEGIN/ROLLBACK`. É o staging que o projeto não tem.
- **Toda migração termina com o rodapé de auto-registro** em `supabase_migrations.schema_migrations`, precedido do bloco de autoconferência `do $aceite$ ... $aceite$`.
- **Recusa, não conversão**: valor desconhecido vindo do cliente vira erro 422. Nunca ternário com `else`.
- **Uma tarefa por PR** — este plano inteiro é **um** PR.
- **`qa-guardian` antes do merge.**
- **Não quebrar o tracking existente** (`TRACKING_SPEC.md`). Nada aqui toca nele.
- **Chave é identidade, rótulo é tela.** Nenhuma tarefa renomeia `chave` de motivo existente.
- **Rodar a suíte inteira** ao fim de cada tarefa: `npm test`. `testTimeout` já está em 15 s.

### Ambiente do worktree

`node_modules` e `.env.local` **não** vêm com o worktree. Antes da Tarefa 1:

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npm ci
```

```bash
cp "C:/Users/Lenovo/Documents/motors-claude/motors-site-oficial/.env.local" "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao/.env.local"
```

O `.env.local` só é necessário na Tarefa 2 (aplicar migração). Tarefas 1, 3, 4 e 5 rodam só com `npm ci`.

---

## File Structure

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/funil.ts` | **modificar** — o vocabulário de escopo, `escopoDoLead`, `motivosVisiveis`, e o campo `escopo` em `MotivoDoFunil`. Módulo puro: não conhece React nem banco. | 1 |
| `tests/funil.test.ts` | **modificar** — acrescenta um `describe` com os 6 testes de escopo. | 1, 3 |
| `supabase/migrations/20260905120000_motivo_por_escopo.sql` | **criar** — coluna, CHECK, 2 updates nominais, 6 inserts, autoconferência, rodapé. | 2 |
| `tests/migracoes-executam.test.ts` | **modificar** — a nova migração entra na `CADEIA` explícita, senão o aceite dela nunca roda fora de produção. | 2 |
| `src/components/admin/ModalDeDesfecho.tsx` | **modificar** — aceita `canal` no lead e chama `motivosVisiveis`. | 3 |
| `src/app/api/funil/config/route.ts` | **modificar** — normaliza `escopo` com recusa; persiste no upsert. | 4 |
| `src/components/admin/FunilEditor.tsx` | **modificar** — seletor de escopo na coluna Perdido. | 5 |

**Ordem e por quê:** a lib primeiro porque é pura e testável sem banco nem DOM; a migração depois porque é ela que faz a coluna existir; os três consumidores por último. `motivosVisiveis` trata `escopo` ausente como `ambos`, então o código das tarefas 1 e 3 é seguro em produção **antes** de a migração rodar — nada some de tela se a ordem de deploy escorregar.

---

## Desvio do spec, registrado

O spec §8, teste 7, pede o `ModalDeDesfecho` **renderizado** ("montando o componente e contando os botões"). Escrevi isso sem conferir a infraestrutura. Conferido agora:

```
vitest.config.ts → environment: "node", include: ["tests/**/*.test.ts"]
```

Sem `jsdom`, sem plugin React, sem `@testing-library/react`, e o `include` nem pega `.tsx`. Montar o componente exigiria instalar três dependências e mudar o ambiente do runner — trabalho maior que a feature, e fora do escopo de um PR de "uma tarefa".

**O que a Tarefa 3 faz no lugar:** asserção de FONTE, no padrão que o repositório já usa em `turnstile-estabilidade.test.ts`, `nomenclatura-estoque` e `whatsapp-numero-unico` — lê o arquivo e prova que a chamada existe **e** que o filtro velho não sobreviveu. Isso responde à mesma pergunta ("a caixa realmente chama a função nova?") sem inventar infraestrutura.

Limite honesto disso, escrito para quem revisar: a asserção de fonte prova o **ponto de chamada**, não o **comportamento renderizado**. Se um dia o repositório ganhar jsdom, este teste vira teste de render e melhora.

---

### Task 1: O vocabulário de escopo em `lib/funil.ts`

**Files:**
- Modify: `src/lib/funil.ts` (interface `MotivoDoFunil`, ~linha 118; novas exportações ao fim da seção "Editar o funil sem quebrá-lo")
- Test: `tests/funil.test.ts`

**Interfaces:**
- Consumes: `MotivoDoFunil`, `TipoDeDesfecho` (já existem neste arquivo)
- Produces:
  ```ts
  export type EscopoDeMotivo = "compra" | "avaliacao" | "ambos";
  export type EscopoDeLead = "compra" | "avaliacao";
  export const ESCOPOS_DE_MOTIVO: readonly EscopoDeMotivo[];
  export function ehEscopoDeMotivo(v: unknown): v is EscopoDeMotivo;
  export function escopoDoLead(canal: string | null | undefined): EscopoDeLead;
  export function motivosVisiveis(
    motivos: MotivoDoFunil[],
    tipo: TipoDeDesfecho,
    escopo: EscopoDeLead,
  ): MotivoDoFunil[];
  ```
  E `MotivoDoFunil` ganha `escopo?: EscopoDeMotivo` (opcional — banco não migrado devolve linha sem o campo).

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `tests/funil.test.ts`:

```ts
describe("escopo do motivo — quem quer vender não perde pelos motivos de quem quer comprar", () => {
  /**
   * Os canais que o site REALMENTE escreve hoje, colhidos um a um do código:
   *
   *   api/avaliacao/route.ts ....... "Avaliação"
   *   AutoAvaliacao.tsx ............ "Appraisal Chat"
   *   ContatoClientWrapper.tsx ..... "Formulário Contato"
   *   LeadPopup.tsx ................ "Lead Popup"
   *   CarMatch.tsx ................. "Garagem Match Profiler"
   *   app/test/page.tsx ............ "CarMatch Recommendations"
   *   PDPClientWrapper.tsx ......... as cinco de `setActiveChannel`
   *   api/leads/route.ts ........... "N/A" e "site", os dois fallbacks
   *
   * É este teste que pega colisão de substring. "WhatsApp Usado na Troca" é o
   * quase-acerto que justifica a lista existir: é sobre avaliar um usado, mas
   * o lead quer COMPRAR — e para ele o motivo certo é `avaliacao_do_usado`,
   * que vive no escopo de compra.
   */
  const CANAIS_DE_COMPRA = [
    "Formulário Contato",
    "Lead Popup",
    "Garagem Match Profiler",
    "CarMatch Recommendations",
    "WhatsApp Proposta",
    "WhatsApp Dúvidas",
    "WhatsApp Usado na Troca",
    "Agendamento Test-Drive",
    "Simulação de Financiamento",
    "N/A",
    "site",
  ];

  const CANAIS_DE_AVALIACAO = ["Avaliação", "Appraisal Chat"];

  it.each(CANAIS_DE_COMPRA)("o canal %s é negócio de compra", (canal) => {
    expect(escopoDoLead(canal)).toBe("compra");
  });

  it.each(CANAIS_DE_AVALIACAO)("o canal %s é negócio de avaliação", (canal) => {
    expect(escopoDoLead(canal)).toBe("avaliacao");
  });

  it("canal ausente ou vazio cai no funil padrão, nunca em exceção", () => {
    expect(escopoDoLead(null)).toBe("compra");
    expect(escopoDoLead(undefined)).toBe("compra");
    expect(escopoDoLead("")).toBe("compra");
    expect(escopoDoLead("   ")).toBe("compra");
    expect(escopoDoLead("canal que ninguém escreveu ainda")).toBe("compra");
  });

  it("reconhece a avaliação escrita de qualquer jeito", () => {
    // O canal é texto livre no corpo do POST. Acento e caixa não podem
    // decidir qual lista o vendedor vê.
    for (const canal of [
      "AVALIAÇÃO",
      "avaliacao",
      "Avaliacao",
      "  Avaliação  ",
      "Avaliação WhatsApp",
      "appraisal chat",
    ]) {
      expect(escopoDoLead(canal)).toBe("avaliacao");
    }
  });

  it("ehEscopoDeMotivo recusa o desconhecido em vez de converter", () => {
    expect(ehEscopoDeMotivo("compra")).toBe(true);
    expect(ehEscopoDeMotivo("avaliacao")).toBe(true);
    expect(ehEscopoDeMotivo("ambos")).toBe(true);
    for (const lixo of ["venda", "COMPRA", "Avaliação", "", null, undefined, 1, {}]) {
      expect(ehEscopoDeMotivo(lixo)).toBe(false);
    }
  });

  describe("motivosVisiveis", () => {
    const m = (
      chave: string,
      escopo: "compra" | "avaliacao" | "ambos" | undefined,
      extra: Partial<MotivoDoFunil> = {},
    ): MotivoDoFunil => ({
      chave,
      rotulo: chave,
      tipo: "perdido",
      ordem: 1,
      ativo: true,
      ...(escopo ? { escopo } : {}),
      ...extra,
    });

    const LISTA: MotivoDoFunil[] = [
      m("credito_reprovado", "compra"),
      m("recusou_consignacao", "avaliacao"),
      m("sem_resposta", "ambos"),
      m("a_vista", "ambos", { tipo: "ganho" }),
    ];

    it("esconde de cada lado o que é do outro", () => {
      const naAvaliacao = motivosVisiveis(LISTA, "perdido", "avaliacao").map((x) => x.chave);
      expect(naAvaliacao).toEqual(["recusou_consignacao", "sem_resposta"]);

      const naCompra = motivosVisiveis(LISTA, "perdido", "compra").map((x) => x.chave);
      expect(naCompra).toEqual(["credito_reprovado", "sem_resposta"]);
    });

    it("continua respeitando o tipo do desfecho", () => {
      expect(motivosVisiveis(LISTA, "ganho", "avaliacao").map((x) => x.chave)).toEqual(["a_vista"]);
    });

    it("motivo desativado não volta por causa do escopo", () => {
      const lista = [m("recusou_consignacao", "avaliacao", { ativo: false })];
      expect(motivosVisiveis(lista, "perdido", "avaliacao")).toEqual([]);
    });

    it("ordena por ordem, como a caixa desenha", () => {
      const lista = [
        m("segundo", "avaliacao", { ordem: 2 }),
        m("primeiro", "avaliacao", { ordem: 1 }),
      ];
      expect(motivosVisiveis(lista, "perdido", "avaliacao").map((x) => x.chave)).toEqual([
        "primeiro",
        "segundo",
      ]);
    });

    it("motivo sem escopo vale para os dois — banco não migrado não esvazia a caixa", () => {
      const lista = [m("legado", undefined)];
      expect(motivosVisiveis(lista, "perdido", "compra").map((x) => x.chave)).toEqual(["legado"]);
      expect(motivosVisiveis(lista, "perdido", "avaliacao").map((x) => x.chave)).toEqual(["legado"]);
    });

    it("lista escopada vazia devolve a lista cheia do tipo, nunca vazia", () => {
      // Card preso é pior que motivo fora de contexto: a caixa é o único
      // caminho para tirar o lead do quadro.
      const soDeCompra = [m("credito_reprovado", "compra"), m("preco", "compra", { ordem: 2 })];
      expect(motivosVisiveis(soDeCompra, "perdido", "avaliacao").map((x) => x.chave)).toEqual([
        "credito_reprovado",
        "preco",
      ]);
    });

    it("a queda de segurança não ressuscita desativado nem troca de tipo", () => {
      const lista = [
        m("credito_reprovado", "compra"),
        m("desativado", "compra", { ativo: false }),
        m("a_vista", "compra", { tipo: "ganho" }),
      ];
      expect(motivosVisiveis(lista, "perdido", "avaliacao").map((x) => x.chave)).toEqual([
        "credito_reprovado",
      ]);
    });
  });
});
```

E acrescentar ao bloco de `import` do topo do arquivo (o `import { ... } from "../src/lib/funil"`):

```ts
  ehEscopoDeMotivo,
  escopoDoLead,
  motivosVisiveis,
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npx vitest run tests/funil.test.ts
```

Esperado: FALHA na compilação — `"escopoDoLead" is not exported by "src/lib/funil.ts"`.

- [ ] **Step 3: Acrescentar o campo `escopo` a `MotivoDoFunil`**

Em `src/lib/funil.ts`, na interface existente:

```ts
export interface MotivoDoFunil {
  chave: string;
  rotulo: string;
  tipo: TipoDeDesfecho;
  ordem: number;
  ativo: boolean;
  /**
   * Para que tipo de negócio este motivo existe. Opcional de propósito: uma
   * linha vinda de banco ainda não migrado chega sem o campo, e tratá-la como
   * `ambos` é o que impede a caixa de esvaziar entre o deploy e a migração.
   */
  escopo?: EscopoDeMotivo;
}
```

- [ ] **Step 4: Escrever o vocabulário e os dois predicados**

Acrescentar em `src/lib/funil.ts`, logo depois da seção "Editar o funil sem quebrá-lo" (perto de `destinosDoNegocio`):

```ts
// ---------------------------------------------------------------------------
// Quem quer vender perde por outros motivos
// ---------------------------------------------------------------------------

/**
 * Para que negócio um motivo de desfecho existe.
 *
 * 2026-09-05, pedido do dono: *"precisamos ter opções diferentes para clientes
 * de avaliação"*. Até aqui a caixa filtrava por `tipo` e mais nada — e quem só
 * queria VENDER o carro dele via "Financiamento ou crédito reprovado" e "Não
 * tínhamos o carro que ele queria" como razões de ter perdido o negócio.
 *
 * `ambos` não é o meio-termo preguiçoso: é a posição correta para o que
 * acontece igual nos dois funis (o cliente sumiu; era spam) e a posição SEGURA
 * para tudo que ninguém classificou ainda.
 */
export type EscopoDeMotivo = "compra" | "avaliacao" | "ambos";

/** O que um LEAD é. Nunca `ambos` — um lead concreto é uma coisa ou a outra. */
export type EscopoDeLead = "compra" | "avaliacao";

/**
 * Lista, e não ternário — a mesma lição que `TIPOS_DE_DESFECHO` já carrega
 * neste arquivo. `escopo === "avaliacao" ? "avaliacao" : "compra"` converteria
 * um `ambos` digitado errado em `compra`, sem erro e sem aviso.
 */
export const ESCOPOS_DE_MOTIVO: readonly EscopoDeMotivo[] = ["compra", "avaliacao", "ambos"];

export function ehEscopoDeMotivo(v: unknown): v is EscopoDeMotivo {
  return typeof v === "string" && (ESCOPOS_DE_MOTIVO as readonly string[]).includes(v);
}

/**
 * Que negócio é este lead, a partir do canal por onde ele entrou.
 *
 * Hoje os canais de avaliação são exatamente dois — `"Avaliação"`
 * (`/api/avaliacao`) e `"Appraisal Chat"` (`AutoAvaliacao`). Ainda assim isto
 * NÃO é uma lista fixa, e a razão está escrita em `/api/leads`: o canal vem do
 * corpo do POST, e uma lista fixa faria *"um canal novo na ficha nascer fora
 * da lista, em silêncio, para sempre"*. Um `"Avaliação WhatsApp"` amanhã cairia
 * em compra e ninguém veria erro nenhum.
 *
 * O risco da substring é o falso positivo, e ele está travado em teste: a
 * suíte lista os onze canais que o site escreve hoje. O quase-acerto é
 * `"WhatsApp Usado na Troca"` — é sobre avaliar um usado, mas o lead quer
 * COMPRAR, e para ele o motivo certo (`avaliacao_do_usado`) mora em compra.
 *
 * Desconhecido, vazio e nulo caem em `compra`: é o funil padrão, e é o que
 * a loja tinha antes desta função existir.
 */
export function escopoDoLead(canal: string | null | undefined): EscopoDeLead {
  const normalizado = (canal ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalizado.includes("avalia") || normalizado.includes("appraisal")
    ? "avaliacao"
    : "compra";
}

/**
 * Os motivos que a caixa de desfecho oferece: do tipo certo E do escopo certo.
 *
 * A queda no fim é deliberada. Se o filtro por escopo não sobrar nada — porque
 * o banco ainda não migrou, ou porque alguém desativou a lista inteira pela
 * tela — devolve tudo daquele tipo. Motivo fora de contexto é ruim; card que
 * não fecha é pior, e esta caixa é o único caminho para tirar o lead do
 * quadro.
 */
export function motivosVisiveis(
  motivos: MotivoDoFunil[],
  tipo: TipoDeDesfecho,
  escopo: EscopoDeLead,
): MotivoDoFunil[] {
  const doTipo = motivos
    .filter((m) => m.ativo && m.tipo === tipo)
    .sort((a, b) => a.ordem - b.ordem);

  const noEscopo = doTipo.filter((m) => {
    // Ausente é `ambos`, e não "escondido": é o default da coluna, e é o que
    // mantém a caixa cheia entre o deploy deste arquivo e a migração.
    const dele = m.escopo ?? "ambos";
    return dele === escopo || dele === "ambos";
  });

  return noEscopo.length > 0 ? noEscopo : doTipo;
}
```

- [ ] **Step 5: Rodar os testes de escopo**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npx vitest run tests/funil.test.ts
```

Esperado: PASSAM todos, inclusive os que já existiam.

- [ ] **Step 6: Rodar a suíte inteira e o typecheck**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npm test && npx tsc --noEmit
```

Esperado: verde. `MotivoDoFunil.escopo` é opcional, então nenhum chamador existente quebra.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && git add src/lib/funil.ts tests/funil.test.ts && git commit -m "feat(funil): o motivo de desfecho ganha escopo, e o canal diz qual e

Ate aqui a caixa de desfecho filtrava por tipo (ganho/perdido/descartado) e
por mais nada — entao quem so queria VENDER o carro dele via 'Financiamento
ou credito reprovado' na lista de por que o negocio morreu.

escopoDoLead le o canal do lead. Substring normalizada e nao lista fixa, pela
mesma razao que /api/leads ja tem escrita sobre o captcha: canal vem do corpo
do POST, e uma lista fixa faria canal novo nascer fora dela em silencio. O
falso positivo fica travado por teste com os onze canais reais do site — o
quase-acerto e 'WhatsApp Usado na Troca', que e compra e continua compra.

motivosVisiveis cai para a lista cheia quando o filtro nao sobra nada: card
preso e pior que motivo fora de contexto, e a caixa e o unico caminho para
tirar o lead do quadro. Isso tambem faz o codigo ser seguro em producao antes
da migracao rodar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: A migração

**Files:**
- Create: `supabase/migrations/20260905120000_motivo_por_escopo.sql`

**Interfaces:**
- Consumes: nada de código. `funil_motivos` como a `20260828120000` e a `20260828160000` a deixaram.
- Produces: coluna `funil_motivos.escopo`, 8 linhas em `compra`, 6 chaves novas em `avaliacao`, e o rótulo de `sem_resposta` reescrito.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/20260905120000_motivo_por_escopo.sql`:

```sql
-- ===========================================================================
-- Quem só quer vender perde por outros motivos
-- ===========================================================================
-- 2026-09-05, pedido do dono: *"precisamos ter opções diferentes para clientes
-- de avaliação, onde contemple casos que o cliente queira apenas vender e nós
-- não tenhamos interesse, casos onde nossa avaliação não interesse ao cliente,
-- onde ele negue consignar"*.
--
-- ---------------------------------------------------------------------------
-- O diagnóstico
-- ---------------------------------------------------------------------------
-- A caixa de desfecho filtra os motivos por `tipo` — ganho, perdido,
-- descartado — e por mais nada. Não existe em lugar nenhum a noção de QUE
-- NEGÓCIO era, e são dois negócios opostos: `/api/avaliacao` grava o lead com
-- `canal: 'Avaliação'` justamente porque, nas palavras do comentário da
-- própria rota, *"a pessoa quer VENDER este carro, não comprá-lo"*.
--
-- O resultado é que quem só queria vender o carro dele vê, como razões de o
-- negócio ter morrido: "Preço acima do que o cliente queria pagar" (não há
-- preço nosso em jogo), "Financiamento ou crédito reprovado" (não há
-- financiamento), "Não tínhamos o carro que ele queria" (ele não quer carro),
-- "Vai comprar mais para frente" (ele não vai comprar).
--
-- E os três desfechos que o dono nomeou não têm onde cair. O vendedor escolhe
-- o mais próximo, e o relatório de "por que a gente perde" passa a somar perda
-- de VENDA com perda de AQUISIÇÃO na mesma barra.
--
-- ---------------------------------------------------------------------------
-- A decisão: escopo, e não uma segunda tabela
-- ---------------------------------------------------------------------------
-- Uma coluna, e não `funil_motivos_avaliacao`: a tela de configuração, a
-- chave estrangeira de `leads.desfecho_motivo` e o relatório já sabem ler UMA
-- lista. Duplicar a tabela duplicaria os três.
--
-- `default 'ambos'` é a posição segura: coluna nova não pode fazer motivo
-- existente sumir de tela nenhuma.
-- ---------------------------------------------------------------------------

alter table public.funil_motivos
  add column if not exists escopo text not null default 'ambos';

alter table public.funil_motivos
  drop constraint if exists funil_motivos_escopo_valido;

alter table public.funil_motivos
  add constraint funil_motivos_escopo_valido
    check (escopo in ('compra', 'avaliacao', 'ambos'));

comment on column public.funil_motivos.escopo is
  'Para que negócio este motivo existe (2026-09-05): compra, avaliacao ou '
  'ambos. A caixa de desfecho escolhe a lista pelo canal do lead — quem só '
  'quer vender o carro dele não perde por "financiamento reprovado".';


-- ---------------------------------------------------------------------------
-- 1. O que passa a ser SÓ de compra
-- ---------------------------------------------------------------------------
-- Nominalmente, e só o que a semente de 2026-08-28 escreveu. Motivo que o dono
-- tenha digitado pela tela "Configurar funil" fica no default `ambos` e
-- continua aparecendo nos dois lados — reclassificar por heurística o que uma
-- pessoa escreveu à mão seria decidir por ela e fazer sumir da tela um motivo
-- que ela usa.
--
-- São OITO, e não os dez da semente original: `contato_invalido` mudou de lado
-- em `20260828160000` (virou descarte, mantendo a chave), e `sem_resposta`
-- fica em `ambos` — é o único que descreve o mesmo acontecimento nos dois
-- negócios.
update public.funil_motivos
   set escopo = 'compra'
 where chave in (
   'preco',
   'comprou_concorrente',
   'credito_reprovado',
   'sem_estoque',
   'avaliacao_do_usado',
   'condicoes_pagamento',
   'desistiu',
   'comprar_depois'
 );


-- ---------------------------------------------------------------------------
-- 2. O rótulo que o dono reescreveu
-- ---------------------------------------------------------------------------
-- "Sumiu — não respondeu mais" era gíria, e estava escrito para o funil de
-- compra. Decisão do dono em 2026-09-05: "Sem retorno do cliente".
--
-- Muda o RÓTULO, nunca a chave — mesma regra que a `20260828160000` aplicou no
-- `contato_invalido`: *"o rótulo é o que se lê na tela; a chave é identidade"*.
-- Nenhum lead já fechado perde o motivo, e o relatório continua somando a
-- mesma barra.
--
-- Ele fica em `ambos` (não é tocado pelo update de cima) e é por isso que o
-- desenho pôde cortar um oitavo motivo de avaliação que seria idêntico a ele:
-- duas opções de mesmo sentido na mesma caixa dividiriam o acontecimento em
-- duas barras — a doença que esta coluna existe para curar.
update public.funil_motivos
   set rotulo = 'Sem retorno do cliente'
 where chave = 'sem_resposta';


-- ---------------------------------------------------------------------------
-- 3. Os motivos de quem só quer vender
-- ---------------------------------------------------------------------------
-- Seis. Os três primeiros são as palavras do dono; os três seguintes saíram do
-- desenho e ele aprovou.
--
-- `nao_temos_interesse` é o que muda mais a operação: é o ÚNICO motivo do
-- sistema inteiro em que quem diz não somos nós. Ele não mede desempenho do
-- vendedor — mede a régua de compra da loja. Enquanto ele não existir, toda
-- recusa nossa some dentro de alguma perda comercial, e a pergunta "quantos
-- carros a gente está deixando passar?" não tem número.
--
-- `avaliacao_recusada` é chave NOVA, e não o `avaliacao_do_usado` que já
-- existe. As duas parecem a mesma coisa e não são: uma é a troca que matou a
-- venda de um carro nosso, a outra é o dono do carro que não vendeu para nós.
-- Fundir faria o relatório dizer "perdemos por avaliação" sem dizer qual dos
-- dois negócios se perdeu — e as duas decisões que saem daí são opostas.
--
-- `on conflict do nothing`: reexecutar não desfaz ajuste feito pela tela.
insert into public.funil_motivos (chave, rotulo, tipo, ordem, escopo) values
  ('nao_temos_interesse',   'Não temos interesse neste carro',        'perdido', 11, 'avaliacao'),
  ('avaliacao_recusada',    'Não aceitou o valor da nossa avaliação', 'perdido', 12, 'avaliacao'),
  ('recusou_consignacao',   'Não aceitou deixar em consignação',      'perdido', 13, 'avaliacao'),
  ('vendeu_para_outro',     'Vendeu para outro comprador',            'perdido', 14, 'avaliacao'),
  ('desistiu_de_vender',    'Desistiu de vender',                     'perdido', 15, 'avaliacao'),
  ('restricao_no_documento','Restrição no documento',                 'perdido', 16, 'avaliacao')
on conflict (chave) do nothing;


-- ---------------------------------------------------------------------------
-- Autoconferência: prova pelo EFEITO, não pela existência da coluna
-- ---------------------------------------------------------------------------
-- Uma lista fixa num `IN` já deu falso negativo neste repositório. O que se
-- consulta aqui é o CHECK, o default e as linhas — o que a migração FEZ.
do $aceite$
declare
  qtd     int;
  v_txt   text;
begin
  begin
    -- a) o CHECK existe e recusa o que não está na lista
    begin
      insert into public.funil_motivos (chave, rotulo, tipo, ordem, escopo)
        values ('aceite_escopo_invalido', 'x', 'perdido', 99, 'venda');
      raise exception
        'ACEITE FALHOU: o banco aceitou escopo "venda". Sem o CHECK, um valor '
        'digitado errado some da caixa sem erro nenhum.';
    exception
      when check_violation then null;
    end;

    -- b) o default é `ambos` — coluna nova não pode esconder motivo existente
    insert into public.funil_motivos (chave, rotulo, tipo, ordem)
      values ('aceite_escopo_default', 'x', 'perdido', 98);
    select escopo into v_txt from public.funil_motivos where chave = 'aceite_escopo_default';
    if v_txt is distinct from 'ambos' then
      raise exception
        'ACEITE FALHOU: motivo novo nasceu com escopo "%" em vez de "ambos" — '
        'motivo sem classificação some de um dos dois funis.', coalesce(v_txt, '<nulo>');
    end if;

    -- c) as oito de compra foram reclassificadas
    select count(*) into qtd from public.funil_motivos
     where escopo = 'compra' and tipo = 'perdido';
    if qtd <> 8 then
      raise exception
        'ACEITE FALHOU: % motivo(s) de perda em escopo compra, esperados 8. '
        'Alguém mexeu na semente de 2026-08-28 — pare e confira antes de gravar.', qtd;
    end if;

    -- d) as seis de avaliação entraram
    select count(*) into qtd from public.funil_motivos
     where escopo = 'avaliacao' and tipo = 'perdido';
    if qtd <> 6 then
      raise exception
        'ACEITE FALHOU: % motivo(s) de perda em escopo avaliacao, esperados 6.', qtd;
    end if;

    -- e) `sem_resposta` continua valendo para os dois, com o rótulo novo
    select escopo || '/' || rotulo into v_txt
      from public.funil_motivos where chave = 'sem_resposta';
    if v_txt is distinct from 'ambos/Sem retorno do cliente' then
      raise exception
        'ACEITE FALHOU: sem_resposta ficou "%" — esperado '
        '"ambos/Sem retorno do cliente".', coalesce(v_txt, '<nulo>');
    end if;

    -- f) a chave sobreviveu ao rótulo novo: nenhum lead perde o motivo
    select count(*) into qtd from public.funil_motivos where chave = 'sem_resposta';
    if qtd <> 1 then
      raise exception
        'ACEITE FALHOU: sem_resposta sumiu ou duplicou. A chave é identidade — '
        'lead já fechado com ela apontaria para o vazio.';
    end if;

    -- g) todo motivo de perda de avaliação é alcançável pela caixa: ativo
    select count(*) into qtd from public.funil_motivos
     where escopo = 'avaliacao' and not ativo;
    if qtd <> 0 then
      raise exception
        'ACEITE FALHOU: % motivo(s) de avaliação nasceram desativados.', qtd;
    end if;

    raise exception 'ensaio concluido' using errcode = 'ACE01';
  exception
    when sqlstate 'ACE01' then null;
  end;

  raise notice
    'Aceite verificado: o motivo de desfecho tem escopo, as 8 de compra saíram '
    'da caixa de quem só quer vender, as 6 de avaliação entraram, e '
    'sem_resposta ficou em ambos com o rótulo novo — sem trocar de chave.';
end $aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260905120000', 'motivo_por_escopo')
on conflict (version) do nothing;
```

- [ ] **Step 2: Pôr a migração na cadeia que o CI aplica**

`tests/migracoes-executam.test.ts` aplica a cadeia inteira contra um Postgres
local do zero e **cobra o `"Aceite verificado"` de cada migração** — *"não basta
a migração não explodir"*. Mas a `CADEIA` (linha 50) é uma **lista explícita**:
migração que não entrar nela tem bloco de aceite que nunca roda fora de
produção. Esse é o gap silencioso, e ele se fecha aqui.

Acrescentar ao fim da `CADEIA`, com a razão, no estilo das entradas vizinhas:

```ts
  // O motivo de desfecho ganha escopo (2026-09-05). Entra na cadeia porque o
  // aceite dela prova um CHECK novo tentando INSERIR o valor inválido — e
  // `check_violation` só acontece contra um Postgres de verdade.
  "20260905120000_motivo_por_escopo.sql",
```

> Conferir onde exatamente: a entrada tem que vir **depois** de
> `20260828120000_funil_de_vendas.sql` e de
> `20260828160000_desfecho_sem_oportunidade.sql`, que são as que criam a tabela
> e movem `contato_invalido`. Ordem cronológica do nome já garante isso, mas a
> lista é manual — confira com os olhos.

Sem Postgres alcançável na máquina, esses testes **pulam** em vez de falhar
(decisão registrada no cabeçalho do arquivo). Se pularem aqui, o ensaio do
passo 3 continua sendo a prova.

- [ ] **Step 3: Ensaiar contra produção, em transação revertida**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260905120000_motivo_por_escopo.sql
```

Esperado: **sem** `--gravar`, roda em `BEGIN/ROLLBACK`. A saída deve trazer o `NOTICE` do aceite ("Aceite verificado: o motivo de desfecho tem escopo…") e terminar com o rollback.

Se qualquer `ACEITE FALHOU` aparecer, **pare**. Os textos dizem o que conferir; o caso "8 esperados" quase certamente significa que alguém editou a semente pela tela, e aí a lista nominal do passo 1 precisa ser revista com o dono, não ajustada no escuro.

- [ ] **Step 4: Conferir a contagem por escopo, ainda em ensaio**

O ensaio já prova 8 e 6 pelos itens (c) e (d). O que falta é o total em `ambos` — 11 se ninguém criou motivo pela tela (1 de perda + 4 de ganho + 6 de descarte). Acrescentar **temporariamente** ao fim do bloco `do $aceite$`, antes do `raise exception 'ensaio concluido'`:

```sql
    select count(*) into qtd from public.funil_motivos where escopo = 'ambos';
    raise notice 'Em escopo ambos: % motivo(s) (11 se ninguém criou pela tela).', qtd;
```

Rodar o ensaio de novo, ler o número, e **remover essas duas linhas** antes de gravar — `raise notice` de diagnóstico não fica em migração aplicada.

Mais que 11: o dono criou motivo pela tela, e está certo assim. Menos que 11: alguém desativou ou apagou semente, e aí pare e pergunte.

- [ ] **Step 5: Gravar**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260905120000_motivo_por_escopo.sql --gravar
```

Esperado: o mesmo `NOTICE` do aceite, e commit.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && git add supabase/migrations/20260905120000_motivo_por_escopo.sql tests/migracoes-executam.test.ts && git commit -m "feat(funil): funil_motivos ganha escopo, e a avaliacao ganha os seus seis

Coluna aditiva com default 'ambos' — posicao segura: coluna nova nao pode
fazer motivo existente sumir de tela nenhuma. Dois updates nominais e um
insert:

  1. as 8 chaves da semente de 28/08 que so fazem sentido em compra
  2. o rotulo de sem_resposta, que o dono reescreveu para 'Sem retorno do
     cliente'. So o rotulo — a chave e identidade, e lead ja fechado com ela
     nao pode perder o motivo
  3. os 6 motivos de perda de avaliacao

nao_temos_interesse e o que muda mais a operacao: e o unico motivo do sistema
inteiro em que quem diz nao somos nos. Ele nao mede o vendedor, mede a regua
de compra da loja — e enquanto nao existir, 'quantos carros a gente esta
deixando passar' nao tem numero.

avaliacao_recusada e chave nova e nao o avaliacao_do_usado que ja existe: uma
e a troca que matou a venda de um carro nosso, a outra e o dono do carro que
nao vendeu para nos. Sao duas decisoes opostas saindo do mesmo grafico.

Ensaiada em transacao revertida contra producao antes de gravar. O bloco de
aceite prova pelo efeito — CHECK, default e contagem — nao pela existencia da
coluna.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: A caixa de desfecho escolhe a lista sozinha

**Files:**
- Modify: `src/components/admin/ModalDeDesfecho.tsx` (prop `lead`, ~linha 48; o `useMemo` de `disponiveis`, ~linha 85)
- Test: `tests/funil.test.ts`

**Interfaces:**
- Consumes: `escopoDoLead`, `motivosVisiveis` (Tarefa 1)
- Produces: nada. É folha. `LeadsKanban` já passa `lead={fechando.lead}`, e `fechando.lead` é o `Lead` completo — que já tem `canal: string | null` (`LeadsKanban.tsx:93`). Só a **assinatura da prop** precisa admitir o campo; nenhuma fiação nova.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/funil.test.ts`, dentro do `describe` criado na Tarefa 1:

```ts
  /**
   * Asserção de FONTE, no padrão de `turnstile-estabilidade` e
   * `nomenclatura-estoque`.
   *
   * Testar `motivosVisiveis` isolada não prova que a CAIXA a chama — mutar a
   * função e ver o teste vermelho só prova a função. O ponto de chamada é o
   * que apodrece: basta alguém reescrever o `useMemo` e o escopo deixa de
   * valer, sem teste nenhum ficar vermelho.
   *
   * O repositório não tem jsdom nem plugin React (`vitest.config.ts` roda em
   * `environment: "node"` e o `include` nem pega `.tsx`), então montar o
   * componente exigiria infraestrutura nova. Esta é a prova disponível hoje —
   * e o dia em que o render existir, este teste vira teste de render.
   */
  it("a caixa de desfecho pede a lista a motivosVisiveis, e não filtra por conta própria", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "src", "components", "admin", "ModalDeDesfecho.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(fonte).toContain("motivosVisiveis(");
    expect(fonte).toContain("escopoDoLead(");

    // O filtro velho não pode ter sobrevivido ao lado do novo: dois caminhos
    // para a mesma lista é como o escopo volta a ser ignorado em silêncio.
    expect(fonte).not.toMatch(/m\.tipo\s*===\s*etapa\.tipo/);
  });
```

E acrescentar `readFileSync` / `join` ao topo caso ainda não estejam importados — em `tests/funil.test.ts` **já estão** (linhas 2–3).

- [ ] **Step 2: Rodar para ver falhar**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npx vitest run tests/funil.test.ts -t "pede a lista a motivosVisiveis"
```

Esperado: FALHA — `expected '…' to contain 'motivosVisiveis('`.

- [ ] **Step 3: Trocar o filtro pela chamada**

Em `src/components/admin/ModalDeDesfecho.tsx`, o import:

```ts
import {
  ehDescarte,
  escopoDoLead,
  motivosVisiveis,
  type EtapaDoFunil,
  type MotivoDoFunil,
} from "../../lib/funil";
```

A prop `lead` passa a admitir o canal:

```ts
  lead,
}: {
  etapa: EtapaDoFunil;
  motivos: MotivoDoFunil[];
  /**
   * `canal` é o que diz se esta pessoa quer COMPRAR um carro ou VENDER o dela
   * — e portanto qual lista de motivos faz sentido oferecer. Opcional porque
   * um lead antigo pode não ter canal; `escopoDoLead` cai em compra, o funil
   * padrão.
   */
  lead: { nome: string; interesse?: string | null; canal?: string | null };
```

E o `useMemo`:

```ts
  const disponiveis = useMemo(
    () => motivosVisiveis(motivos, etapa.tipo, escopoDoLead(lead.canal)),
    [motivos, etapa.tipo, lead.canal],
  );
```

> Cuidado com o tipo de `etapa.tipo`: ele é `TipoDeEtapa` (`aberta | ganho | perdido | descartado`) e `motivosVisiveis` pede `TipoDeDesfecho` (sem `aberta`). O componente só é montado a partir de etapa terminal — `LeadsKanban.tsx:248` só chama `setFechando` para destino não-aberto. Se o `tsc` reclamar, **não** faça cast: estreite com o guarda que já existe, `ehTipoDeDesfecho(etapa.tipo)`, devolvendo `[]` no caso impossível, e o estado vazio da caixa já cobre a tela.

- [ ] **Step 4: Rodar o teste e o typecheck**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npx vitest run tests/funil.test.ts && npx tsc --noEmit
```

Esperado: PASSA, e `tsc` limpo.

- [ ] **Step 5: Ver na tela**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npm run dev
```

Abrir `/admin` → Leads, achar um card com canal **Avaliação** (o card mostra o canal no rodapé, `LeadsKanban.tsx:755`), clicar em perder, e conferir que a caixa lista os 6 novos + "Sem retorno do cliente" — e **nenhum** "Financiamento ou crédito reprovado". Depois o mesmo num card de outro canal, para ver a lista de compra intacta.

> Se não houver lead de avaliação no banco, dá para provar sem inventar dado: a caixa lê `lead.canal`, então basta abrir um lead qualquer e conferir a lista de compra; o caminho de avaliação já está travado pelos testes de `escopoDoLead`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && git add src/components/admin/ModalDeDesfecho.tsx tests/funil.test.ts && git commit -m "feat(funil): a caixa de desfecho escolhe a lista pelo canal do lead

O useMemo filtrava por m.tipo === etapa.tipo e mais nada. Agora chama
motivosVisiveis com o escopo que escopoDoLead tira do canal.

Nenhuma fiacao nova: o LeadsKanban ja passa o Lead completo, que ja carrega
canal. So a assinatura da prop precisou admitir o campo.

O teste e assercao de fonte, no padrao de turnstile-estabilidade: prova que a
caixa CHAMA a funcao e que o filtro velho nao sobreviveu ao lado dela. Testar
motivosVisiveis isolada nao provaria o ponto de chamada, que e o que apodrece.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: A rota de configuração recusa escopo desconhecido

**Files:**
- Modify: `src/app/api/funil/config/route.ts` (validação de motivos, ~linhas 161–182)

**Interfaces:**
- Consumes: `ehEscopoDeMotivo` (Tarefa 1)
- Produces: o PUT passa a aceitar e persistir `escopo` em cada motivo; devolve 422 para valor fora de `ESCOPOS_DE_MOTIVO`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/funil.test.ts`, no mesmo `describe`:

```ts
  it("a rota de configuração recusa escopo desconhecido, não converte", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "src", "app", "api", "funil", "config", "route.ts"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    // O guarda tem que ser chamado, e o escopo tem que chegar ao upsert.
    expect(fonte).toContain("ehEscopoDeMotivo");
    expect(fonte).toMatch(/escopo:/);

    // E não pode existir ternário de fallback sobre escopo. É exatamente o
    // defeito que o `funil.ts` já documenta: o `m.tipo === "ganho" ? … : …`
    // que, no dia em que entrou o terceiro desfecho, converteria todo motivo
    // de descarte em motivo de perda, sem erro e sem aviso.
    expect(fonte).not.toMatch(/escopo\s*===\s*["'][a-z]+["']\s*\?/);
  });
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npx vitest run tests/funil.test.ts -t "recusa escopo desconhecido"
```

Esperado: FALHA — `expected '…' to contain 'ehEscopoDeMotivo'`.

- [ ] **Step 3: Acrescentar o guarda e o campo**

Em `src/app/api/funil/config/route.ts`, no import de `../../../../lib/funil`, acrescentar `ehEscopoDeMotivo`.

Logo **depois** do bloco `motivoInvalido` que já existe, um segundo guarda:

```ts
    // Mesma régua do tipo, pelo mesmo motivo. `escopo` chega do formulário e um
    // ternário com `else` converteria `avaliacao` em `compra` no dia em que o
    // valor viesse errado — sem erro, e desfazendo em silêncio a separação que
    // a coluna existe para criar. Ausente é `ambos`: é o default da coluna, e
    // motivo criado por uma versão antiga da tela não pode nascer classificado
    // sem ninguém ter escolhido.
    const escopoInvalido = motivosRecebidos
      .filter((m) => String(m?.rotulo ?? "").trim())
      .find((m) => m.escopo !== undefined && m.escopo !== null && !ehEscopoDeMotivo(m.escopo));
    if (escopoInvalido) {
      return NextResponse.json(
        { error: `Escopo de motivo desconhecido: "${escopoInvalido.escopo}".` },
        { status: 422 },
      );
    }
```

E no `map` que monta `motivos`, uma linha a mais:

```ts
        ativo: m.ativo !== false,
        escopo: ehEscopoDeMotivo(m.escopo) ? m.escopo : "ambos",
```

> `ehEscopoDeMotivo(m.escopo) ? … : "ambos"` **não** é o ternário proibido: neste ponto o valor já passou pelo guarda acima, então o `else` só alcança `undefined`/`null` — o caso "a tela não mandou", que é exatamente `ambos`. O que o guarda impede é `"venda"` virar `"ambos"` calado.

- [ ] **Step 4: Rodar teste, suíte e typecheck**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npm test && npx tsc --noEmit
```

Esperado: verde.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && git add src/app/api/funil/config/route.ts tests/funil.test.ts && git commit -m "feat(funil): a rota de config aceita escopo, e recusa o que nao conhece

Segundo guarda ao lado do de tipo, pela razao que o funil.ts ja tem escrita em
prosa: um ternario com else converteria 'avaliacao' em 'compra' no dia em que
o valor viesse errado, desfazendo em silencio a separacao que a coluna existe
para criar. Valor fora da lista vira 422.

Escopo ausente vira 'ambos' — o default da coluna. Motivo criado por uma versao
antiga da tela nao pode nascer classificado sem ninguem ter escolhido.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: O seletor de escopo na tela Configurar funil

**Files:**
- Modify: `src/components/admin/FunilEditor.tsx` (`acrescentarMotivo`, ~linha 220; bloco de motivos, ~linhas 437–492)

**Interfaces:**
- Consumes: `EscopoDeMotivo` (Tarefa 1); a rota da Tarefa 4 já persiste o campo.
- Produces: nada. É a tela final.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/funil.test.ts`, no mesmo `describe`:

```ts
  it("a tela Configurar funil deixa escolher o escopo, e só na coluna Perdido", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "src", "components", "admin", "FunilEditor.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    // As três opções escritas como quem opera lê, não como o banco guarda.
    expect(fonte).toContain("Quem quer comprar");
    expect(fonte).toContain("Quem quer vender");

    // O seletor é condicional: ganho e descarte são todos `ambos` por decisão
    // do dono, e um seletor com um valor válido só é ruído na tela.
    expect(fonte).toMatch(/tipo\s*===\s*"perdido"/);

    // Motivo novo nasce em `ambos` — a mesma posição segura do default da
    // coluna. Nascer em `compra` esconderia do funil de avaliação um motivo
    // que a pessoa acabou de criar.
    expect(fonte).toMatch(/escopo:\s*"ambos"/);
  });
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npx vitest run tests/funil.test.ts -t "deixa escolher o escopo"
```

Esperado: FALHA — `expected '…' to contain 'Quem quer comprar'`.

- [ ] **Step 3: Motivo novo nasce em `ambos`**

Em `src/components/admin/FunilEditor.tsx`, no `acrescentarMotivo` (~linha 220), acrescentar o campo ao objeto criado:

```ts
        ordem: atual.filter((m) => m.tipo === tipo).length + 1,
        escopo: "ambos",
```

- [ ] **Step 4: O seletor**

No bloco de motivos, dentro do `.map((m) => ( ... ))`, depois do `<input>` do rótulo e ainda dentro da `<div className="flex items-center gap-2">`:

```tsx
                    {tipo === "perdido" && (
                      <select
                        value={m.escopo ?? "ambos"}
                        onChange={(ev) =>
                          alterarMotivo(m.chave, {
                            escopo: ev.target.value as EscopoDeMotivo,
                          })
                        }
                        disabled={!podeEditar}
                        aria-label={`Para quem vale o motivo ${m.rotulo}`}
                        className="mt-foco w-[132px] shrink-0 cursor-pointer border border-mt-regua-fina bg-mt-bg px-1.5 py-1.5 text-[11px] text-mt-neutral-800"
                      >
                        <option value="compra">Quem quer comprar</option>
                        <option value="avaliacao">Quem quer vender</option>
                        <option value="ambos">Os dois</option>
                      </select>
                    )}
```

E acrescentar `type EscopoDeMotivo` ao import de `../../lib/funil` no topo do arquivo.

Acrescentar também, ao parágrafo explicativo da seção de motivos (~linha 442), a frase que diz para que serve o seletor:

```tsx
        <p className="max-w-[620px] text-[11px] leading-relaxed text-mt-neutral-700">
          São eles que o relatório agrupa. Lista curta funciona melhor que lista completa: motivo
          que ninguém escolhe vira ruído, e motivo demais faz o vendedor clicar no primeiro.{" "}
          <strong>Para quem vale</strong> decide em qual caixa o motivo aparece: quem chegou
          querendo comprar um carro, quem chegou querendo vender o dele, ou os dois.
        </p>
```

- [ ] **Step 5: Rodar teste, suíte e typecheck**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npm test && npx tsc --noEmit
```

Esperado: verde.

- [ ] **Step 6: Ver na tela**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npm run dev
```

Abrir `/admin` → Configurar funil. Conferir, na coluna **Perdeu porque**: os 6 novos com "Quem quer vender", os 8 antigos com "Quem quer comprar", "Sem retorno do cliente" com "Os dois". As colunas **Ganhou porque** e **Descartou porque** não mostram seletor. Trocar um escopo, salvar, recarregar, e conferir que voltou.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && git add src/components/admin/FunilEditor.tsx tests/funil.test.ts && git commit -m "feat(funil): a tela Configurar funil escolhe para quem cada motivo vale

Seletor so na coluna Perdido: ganho e descarte sao todos 'ambos' por decisao
do dono, e um seletor com um valor valido e ruido na tela.

As opcoes sao escritas como quem opera le — 'Quem quer comprar', 'Quem quer
vender', 'Os dois' — e nao como o banco guarda. Motivo novo nasce em 'ambos',
a mesma posicao segura do default da coluna: nascer em 'compra' esconderia do
funil de avaliacao um motivo que a pessoa acabou de criar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Fechamento

**Files:** nenhum. É conferência.

- [ ] **Step 1: Reintegrar o `main`, que andou**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && git fetch origin && git merge origin/main
```

Se houver conflito, resolver e **rodar a suíte inteira sobre o resultado** — não sobre o branch de antes do merge.

- [ ] **Step 2: Suíte inteira, build e typecheck**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && npm test && npx tsc --noEmit && npm run build
```

Esperado: os três verdes. **Confira o exit do `npm run build` explicitamente** — encadear comandos faz o exit ser o do último, e build quebrado já reportou verde neste repositório.

- [ ] **Step 3: `qa-guardian`**

Despachar o agente `qa-guardian` sobre o diff completo do branch. É exigência do `CLAUDE.md` para toda entrega, antes de merge.

- [ ] **Step 4: Push e PR**

```bash
cd "C:/Users/Lenovo/Documents/motors-claude/motivos-avaliacao" && git log --oneline origin/main..HEAD && git push -u origin feat/quem-so-quer-vender-perde-diferente
```

O `gh` não tem login nesta máquina. Abrir o PR pelo Chrome já logado, em
`https://github.com/85dyones/motors-site-oficial/compare/main...feat/quem-so-quer-vender-perde-diferente?quick_pull=1`.

Corpo do PR: o §1 e o §2 do spec, mais a nota de que **a migração já está gravada em produção** (Tarefa 2) — quem revisar precisa saber que o banco não espera o merge.

---

## Riscos, escritos antes de acontecerem

| Risco | Onde | O que fazer |
|---|---|---|
| A migração grava antes de o código subir | Tarefa 2 é gravada em produção, o código só no merge | Nada quebra: `escopo` é coluna nova que ninguém lê ainda, e os 6 motivos novos aparecem na lista de perda de todo mundo até o merge. Feio por algumas horas, não errado. Se incomodar, gravar a migração só depois do merge — o plano funciona nas duas ordens. |
| Ninguém tem lead de avaliação para testar na tela | Tarefa 3, passo 5 | Não inventar lead. O caminho está travado pelos testes de `escopoDoLead`; a conferência visual cobre o funil de compra, que é o que existe no banco. |
| `escopoDoLead` erra um canal futuro | sempre | O teste da Tarefa 1 lista os canais reais. Canal novo que colidir quebra a suíte antes de produção — é para isso que a lista é nominal e não gerada. |
| `Set-Content` do PowerShell injeta BOM | qualquer passo que escreva arquivo pelo shell | Escrever pelas ferramentas de edição, não por `Set-Content`. BOM passa por `tsc`, `eslint` e `vitest` e só aparece nos bytes. |
| Outra sessão troca o branch embaixo | sempre | O trabalho está em worktree próprio (`motivos-avaliacao`), justamente por isso. |
