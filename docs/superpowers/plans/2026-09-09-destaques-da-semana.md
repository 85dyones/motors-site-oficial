# Destaques da semana — plano de implementação

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** dar curadoria própria à grade "Destaques da semana" da home, com
preenchimento sorteado quando faltar carro marcado.

**Arquitetura:** a decisão sai do JSX e vira função pura em
`src/lib/destaquesDaSemana.ts`, com o sorteador injetado para ser testável. A
lista de ids vive numa linha nova de `site_settings`, marcada pelo
`/admin/estoque` no mesmo padrão do `carouselVehicleIds` que já existe. Nenhuma
migração: `site_settings` é chave-valor.

**Stack:** Next 16 (App Router, Server Components), React 19, Supabase
(PostgREST + `site_settings`), vitest.

**Desenho aprovado:**
[`../specs/2026-09-09-destaques-da-semana-design.md`](../specs/2026-09-09-destaques-da-semana-design.md)

## Restrições globais

- **Português** em código, nomes de chave, comentários e commits. Não anglicizar
  o que já existe (`CLAUDE.md` § Idioma).
- **Teto da grade: 6.** Constante `VAGAS_NA_GRADE`, nunca literal espalhado.
- **A linha nova de `site_settings` nasce privada.** NÃO acrescentar
  `destaquesDaSemana` a `recortePublicoDeSettings` nem à whitelist da RLS
  anônima — quem lê é o servidor, com a chave de serviço.
- **Nenhuma migração**, nenhuma RLS desligada, nenhum evento de tracking
  renomeado.
- **O link ao lado do título continua dizendo o total do estoque**, não o da
  grade. É a regra 6 do `CLAUDE.md` e a trava de `tests/vitrine.test.ts`.
- **`carouselVehicleIds` não muda de dono:** hero e `/vitrine` seguem lendo ele.
- Nunca escrever conteúdo com `\` duplicado via heredoc do bash neste ambiente —
  use Write/Edit. Ver memória `heredoc-come-escape-e-vira-byte-de-controle`.
- Rodar a **suíte inteira** antes de cada commit: várias travas deste repositório
  varrem `src/` e só acusam em varredura completa.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/destaquesDaSemana.ts` **(novo)** | A regra: marcados primeiro, sorteio completa, teto de 6. Puro, sem I/O |
| `tests/destaques-da-semana.test.ts` **(novo)** | Unidade da regra, com sorteador determinístico |
| `src/lib/settings.ts` | Lê a linha `destaques_da_semana` e devolve `destaquesDaSemana` |
| `src/app/api/settings/route.ts` | Aceita e grava a chave |
| `src/app/page.tsx` | Chama a regra em vez de fatiar a lista |
| `src/lib/estoqueTabela.ts` | Campo `naSemana` na linha da tabela do painel |
| `src/app/admin/estoque/page.tsx` | Lê a lista e passa como prop |
| `src/components/admin/TabelaDeEstoque.tsx` | Ação em lote, contador e etiqueta na linha |
| `tests/destaques-da-semana-fiacao.test.ts` **(novo)** | Fiação: recorte público, rota e a fonte da home |
| `tests/destaques-da-semana-na-home.test.ts` **(novo)** | O ponto de chamada: renderiza a home e conta os cards |

---

## Tarefa 1: a regra, pura e testada

**Arquivos:**
- Criar: `src/lib/destaquesDaSemana.ts`
- Testar: `tests/destaques-da-semana.test.ts`

**Interfaces:**
- Consome: `Veiculo` de `src/types` (o campo usado é só `id: string`).
- Produz: `VAGAS_NA_GRADE: 6` e
  `montarDestaquesDaSemana({ disponiveis, selecionados, excluir?, sortear? }): Veiculo[]`.
  As tarefas 3 e 4 dependem desses dois nomes.

- [ ] **Passo 1: escrever o teste que falha**

Criar `tests/destaques-da-semana.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarDestaquesDaSemana, VAGAS_NA_GRADE } from "../src/lib/destaquesDaSemana";
import type { Veiculo } from "../src/types";

/**
 * A grade "Destaques da semana" é a área mais nobre da home e até 2026-09-09
 * não tinha curadoria: `disponiveis.slice(0, 6)` sobre um estoque ordenado por
 * preço mostrava os 6 carros mais caros que estavam no ar, para sempre.
 *
 * A regra aqui é a decisão do dono: o que ele marca vem primeiro, na ordem em
 * que marcou; o sorteio só completa o que faltar. Ver
 * `docs/superpowers/specs/2026-09-09-destaques-da-semana-design.md`.
 */

/** Só o `id` é lido pela regra; o resto do veículo não influencia nada. */
const carro = (id: string): Veiculo => ({ id }) as unknown as Veiculo;

const estoque = (...ids: string[]) => ids.map(carro);

/** Sorteador determinístico: consome a sequência dada, e repete a última. */
function sorteadorFixo(valores: number[]): () => number {
  let i = 0;
  return () => valores[Math.min(i++, valores.length - 1)];
}

/** Sempre 0: no Fisher-Yates, mantém a ordem de entrada — previsível. */
const semSorte = () => 0;

describe("montarDestaquesDaSemana", () => {
  it("mostra os marcados na ordem em que foram marcados", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f"),
      selecionados: ["c", "a", "b", "f", "e", "d"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).toEqual(["c", "a", "b", "f", "e", "d"]);
  });

  it("completa com sorteados até as 6 vagas", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g"),
      selecionados: ["g"],
      sortear: semSorte,
    });

    expect(grade).toHaveLength(VAGAS_NA_GRADE);
    expect(grade[0].id).toBe("g");
  });

  it("o sorteio nunca repete um carro já marcado", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g"),
      selecionados: ["a", "b"],
      sortear: semSorte,
    });

    const ids = grade.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("o sorteio não traz quem está no banner", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g", "h", "i"),
      selecionados: [],
      excluir: ["a", "b", "c"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).not.toContain("a");
    expect(grade.map((v) => v.id)).not.toContain("b");
    expect(grade.map((v) => v.id)).not.toContain("c");
  });

  it("marcou mais de 6: aparecem os 6 primeiros, e o sorteio não entra", () => {
    const dez = ["j", "i", "h", "g", "f", "e", "d", "c", "b", "a"];
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque(...dez),
      selecionados: dez,
      sortear: () => {
        throw new Error("não devia sortear com a grade cheia de marcados");
      },
    });

    expect(grade.map((v) => v.id)).toEqual(dez.slice(0, VAGAS_NA_GRADE));
  });

  it("sem nada marcado, sorteia as 6 vagas", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g", "h"),
      selecionados: [],
      sortear: semSorte,
    });

    expect(grade).toHaveLength(VAGAS_NA_GRADE);
  });

  it("estoque menor que a grade: mostra o que há, sem buraco", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b"),
      selecionados: ["a"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).toEqual(["a", "b"]);
    expect(grade.every(Boolean)).toBe(true);
  });

  it("id marcado que saiu do estoque some sozinho, sem desmarcar", () => {
    // Carro vendido, arquivado ou barrado por falta de foto: a lista guarda
    // ids, e quem manda é o estoque. Não existe passo de manutenção.
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b"),
      selecionados: ["vendido-ontem", "a"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("id marcado duas vezes conta uma vez só", () => {
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c"),
      selecionados: ["a", "a", "b"],
      sortear: semSorte,
    });

    expect(grade.map((v) => v.id)).toEqual(["a", "b", "c"]);
  });

  it("não mexe na lista que recebeu", () => {
    // `disponiveis` é a mesma lista que a home usa para o hero, a busca e o
    // contador. Embaralhar no lugar mudaria a vitrine inteira.
    const disponiveis = estoque("a", "b", "c", "d", "e", "f", "g");
    const antes = disponiveis.map((v) => v.id);

    montarDestaquesDaSemana({
      disponiveis,
      selecionados: [],
      sortear: sorteadorFixo([0.9, 0.1, 0.7, 0.3, 0.5, 0.2]),
    });

    expect(disponiveis.map((v) => v.id)).toEqual(antes);
  });

  it("sorteador que devolve 1 não estoura o índice", () => {
    // `Math.random()` nunca devolve 1, mas um dublê pode — e sem a trava o
    // Fisher-Yates lê uma posição além do fim e devolve `undefined` na grade.
    const grade = montarDestaquesDaSemana({
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g"),
      selecionados: [],
      sortear: () => 1,
    });

    expect(grade).toHaveLength(VAGAS_NA_GRADE);
    expect(grade.every((v) => v && typeof v.id === "string")).toBe(true);
  });

  it("com sorteador fixo, a saída é reproduzível", () => {
    const entrada = {
      disponiveis: estoque("a", "b", "c", "d", "e", "f", "g", "h"),
      selecionados: [],
    };
    const semente = () => sorteadorFixo([0.42, 0.13, 0.87, 0.5, 0.31, 0.64, 0.08]);

    const primeira = montarDestaquesDaSemana({ ...entrada, sortear: semente() });
    const segunda = montarDestaquesDaSemana({ ...entrada, sortear: semente() });

    expect(primeira.map((v) => v.id)).toEqual(segunda.map((v) => v.id));
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run tests/destaques-da-semana.test.ts
```

Esperado: FALHA no import — `Failed to resolve import "../src/lib/destaquesDaSemana"`.

- [ ] **Passo 3: escrever a implementação mínima**

Criar `src/lib/destaquesDaSemana.ts`:

```ts
import type { Veiculo } from "../types";

/**
 * A grade da seção 01 da home — "Destaques da semana".
 *
 * Até 2026-09-09 ela era `disponiveis.slice(0, 6)` dentro do JSX de
 * `src/app/page.tsx`, sobre um estoque que já vem ordenado por preço efetivo.
 * Na prática: os 6 carros mais caros que estavam no ar, sem curadoria e sem
 * rodízio, pelo tempo que o topo da tabela de preço não mudasse.
 *
 * A regra aqui é a decisão do dono (spec de 2026-09-09): o que ele marca vem
 * primeiro, na ordem em que marcou; o sorteio só completa o que faltar.
 */

/** Quantos carros a grade mostra. Duas linhas de três no desktop. */
export const VAGAS_NA_GRADE = 6;

export interface EntradaDosDestaques {
  /** O estoque publicado e não vendido, na ordem em que a home o recebeu. */
  disponiveis: Veiculo[];
  /** Ids marcados no painel, na ordem da marcação. */
  selecionados: string[];
  /** Ids que o sorteio deve evitar — hoje, os que estão no banner. */
  excluir?: string[];
  /**
   * Injetado para o teste ser determinístico.
   *
   * Sem esta porta, testar o sorteio exigiria travar `Math.random` global ou
   * aceitar teste intermitente — e um teste de aleatório que às vezes passa é
   * pior que nenhum.
   */
  sortear?: () => number;
}

/**
 * Fisher-Yates sobre uma CÓPIA.
 *
 * A lista de entrada é a mesma que a home usa no hero, na busca e no contador
 * de estoque: embaralhar no lugar mudaria a página inteira.
 */
function embaralhar<T>(lista: T[], sortear: () => number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    // `Math.min(..., i)` porque um dublê pode devolver 1 — `Math.random()`
    // nunca devolve, mas a trava custa nada e evita `undefined` na grade.
    const j = Math.min(Math.floor(sortear() * (i + 1)), i);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export function montarDestaquesDaSemana({
  disponiveis,
  selecionados,
  excluir = [],
  sortear = Math.random,
}: EntradaDosDestaques): Veiculo[] {
  const porId = new Map(disponiveis.map((v) => [v.id, v]));

  const grade: Veiculo[] = [];
  const jaNaGrade = new Set<string>();

  for (const id of selecionados) {
    if (grade.length >= VAGAS_NA_GRADE) break;
    // Id que não está em `disponiveis` simplesmente não entra: o carro foi
    // vendido, arquivado ou barrado por falta de foto. A lista guarda ids, e
    // quem manda é o estoque — não existe passo de desmarcar.
    const veiculo = porId.get(id);
    if (!veiculo || jaNaGrade.has(id)) continue;
    grade.push(veiculo);
    jaNaGrade.add(id);
  }

  if (grade.length >= VAGAS_NA_GRADE) return grade;

  const fora = new Set(excluir);
  const sorteaveis = disponiveis.filter((v) => !jaNaGrade.has(v.id) && !fora.has(v.id));

  return [...grade, ...embaralhar(sorteaveis, sortear).slice(0, VAGAS_NA_GRADE - grade.length)];
}
```

- [ ] **Passo 4: rodar e ver passar**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run tests/destaques-da-semana.test.ts
```

Esperado: PASS, 12 casos.

- [ ] **Passo 5: provar por mutação que as travas acusam**

Não confie no verde. Aplique uma mutação por vez em
`src/lib/destaquesDaSemana.ts`, rode o teste, e desfaça restaurando o **arquivo
inteiro** (nunca `replace(mutado, original)`, que troca a primeira ocorrência e
inverte o arquivo em silêncio):

| Mutação | Caso que precisa ficar vermelho |
|---|---|
| `const copia = lista;` (embaralhar no lugar) | "não mexe na lista que recebeu" |
| tirar `Math.min(..., i)` e usar `sortear: () => 1` | "sorteador que devolve 1 não estoura o índice" |
| `if (!veiculo) continue;` → `grade.push(porId.get(id) ?? disponiveis[0])` | "id marcado que saiu do estoque some sozinho" |
| tirar `!fora.has(v.id)` do filtro | "o sorteio não traz quem está no banner" |
| `VAGAS_NA_GRADE = 8` | "completa com sorteados até as 6 vagas" |

Se alguma mutação sobreviver, o teste está errado — conserte o teste antes de
seguir.

- [ ] **Passo 6: rodar a suíte inteira**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run
```

Esperado: tudo verde (146 arquivos na linha de base do `main` + o novo).

- [ ] **Passo 7: commit**

```bash
git add src/lib/destaquesDaSemana.ts tests/destaques-da-semana.test.ts
git commit -m "feat(destaques): a regra da grade sai do JSX e vira função testável"
```

---

## Tarefa 2: o dado em `site_settings`

**Arquivos:**
- Modificar: `src/lib/settings.ts` (leitura), `src/app/api/settings/route.ts` (escrita)
- Testar: `tests/destaques-da-semana-fiacao.test.ts` (criar)

**Interfaces:**
- Consome: nada da tarefa 1.
- Produz: `getCachedSettings()` passa a devolver `destaquesDaSemana: unknown`
  (array de ids, ou `null` quando a linha não existe). As tarefas 3 e 4 leem
  esse campo.

**Contexto que o implementador não tem:** `site_settings` é chave-valor — cada
linha tem `id` (texto) e `data` (jsonb). A leitura roda com a chave de serviço
dentro de `unstable_cache`; a escrita passa pelo POST de `/api/settings`, que já
chama `revalidateTag`. **Não há migração**: linha nova é `upsert`.

- [ ] **Passo 1: escrever o teste que falha**

Criar `tests/destaques-da-semana-fiacao.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { recortePublicoDeSettings } from "../src/lib/settings";
import { lerCodigo } from "./fonte";

/**
 * A fiação da curadoria da grade da home.
 *
 * Três afirmações que não têm como ser verificadas em tempo de execução sem
 * subir banco: a chave é lida, é gravada, e **não** vaza para o navegador.
 * A última é a que importa mais — ver a memória do `preco_compra` que vazou
 * como prop de client component.
 */

const ROTA = "src/app/api/settings/route.ts";
const LEITURA = "src/lib/settings.ts";

describe("a chave destaquesDaSemana está fiada de ponta a ponta", () => {
  it("a leitura de settings conhece a linha destaques_da_semana", () => {
    const fonte = lerCodigo(LEITURA);

    expect(fonte, "a linha não é procurada em site_settings").toContain(
      '"destaques_da_semana"',
    );
    expect(fonte, "a chave não é devolvida por getCachedSettings").toMatch(
      /destaquesDaSemana,/,
    );
  });

  it("a rota aceita e grava a chave", () => {
    const fonte = lerCodigo(ROTA);

    expect(fonte, "a chave não é aceita no corpo do POST").toMatch(
      /destaquesDaSemana/,
    );
    expect(fonte, "a chave não é gravada na linha certa").toContain(
      'id: "destaques_da_semana"',
    );
  });

  it("a chave NÃO entra no recorte público", () => {
    // O visitante não precisa dela: quem monta a grade é o servidor. Toda
    // chave nova nasce privada — na RLS e aqui — e só sai disso com motivo
    // escrito.
    const publico = recortePublicoDeSettings({
      companySettings: null,
      aboutSettings: null,
      webhooks: null,
      popups: null,
      quickTags: null,
      stockOverrides: null,
      carouselVehicleIds: null,
      bankBalances: null,
      procedencia: null,
      instagramCuradoria: null,
      areasHome: null,
      ga4: null,
      destaquesDaSemana: ["8256747", "8453942"],
    } as unknown as Parameters<typeof recortePublicoDeSettings>[0]);

    expect(Object.keys(publico)).not.toContain("destaquesDaSemana");
    expect(JSON.stringify(publico)).not.toContain("8256747");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run tests/destaques-da-semana-fiacao.test.ts
```

Esperado: os dois primeiros casos FALHAM (a chave ainda não existe). O terceiro
já passa — e é assim mesmo: ele guarda uma ausência, e precisa continuar verde
quando a chave passar a existir.

- [ ] **Passo 3: a leitura, em `src/lib/settings.ts`**

Três edições, todas copiando o padrão do `carouselVehicleIds` que está ao lado:

1. Junto das outras declarações no topo de `getCachedSettings`:

```ts
    let destaquesDaSemana = null;
```

2. Junto dos outros `data.find`, depois de `carouselRow`:

```ts
          // A curadoria da GRADE da home ("Destaques da semana"), separada da
          // do banner de propósito: o dono pediu listas independentes para não
          // repetir na mesma tela o carro que acabou de passar no carrossel.
          const destaquesDaSemanaRow = data.find((row) => row.id === "destaques_da_semana");
```

3. Junto das outras atribuições e no objeto de retorno:

```ts
          if (destaquesDaSemanaRow) destaquesDaSemana = destaquesDaSemanaRow.data;
```

```ts
    destaquesDaSemana,
```

**Não** acrescentar nada a `recortePublicoDeSettings`.

- [ ] **Passo 4: a escrita, em `src/app/api/settings/route.ts`**

1. No destructure do corpo do POST, junto de `carouselVehicleIds`:

```ts
      destaquesDaSemana,
```

2. Junto do ramo de `carouselVehicleIds`, no mesmo estilo:

```ts
      if (destaquesDaSemana) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "destaques_da_semana", data: destaquesDaSemana, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for destaquesDaSemana:", error.message);
        }
      }
```

> ⚠️ Conferir no arquivo como o ramo vizinho trata erro e qual cliente usa
> (`requestSupabase`), e copiar exatamente. Se o padrão local divergir do
> mostrado acima, **o padrão local vence**.

- [ ] **Passo 5: rodar e ver passar**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run tests/destaques-da-semana-fiacao.test.ts
```

Esperado: PASS, 3 casos.

- [ ] **Passo 6: typecheck e suíte inteira**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx tsc --noEmit
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run
```

O `tsc` do `main` já sai com **3 erros de base** (`@vercel/speed-insights` não
instalado no `node_modules` do worktree, e 2 em `tests/f0-nucleo.test.ts`).
Esperado: exatamente esses 3, nenhum a mais.

- [ ] **Passo 7: commit**

```bash
git add src/lib/settings.ts src/app/api/settings/route.ts tests/destaques-da-semana-fiacao.test.ts
git commit -m "feat(destaques): a lista da grade ganha linha própria em site_settings"
```

---

## Tarefa 3: a home passa a usar a regra

**Arquivos:**
- Modificar: `src/app/page.tsx:141`
- Testar: `tests/destaques-da-semana-fiacao.test.ts` (acrescentar um `describe`)

**Interfaces:**
- Consome: `montarDestaquesDaSemana` e `VAGAS_NA_GRADE` da tarefa 1;
  `settings.destaquesDaSemana` da tarefa 2.
- Produz: nada que outra tarefa consuma.

**Contexto:** `slidesHero` é calculado logo acima (`page.tsx:140`) e é a lista
que o sorteio precisa evitar. A ordem importa: `slidesHero` primeiro.

- [ ] **Passo 1: escrever o teste que falha**

Acrescentar ao fim de `tests/destaques-da-semana-fiacao.test.ts`:

```ts
describe("a home monta a grade pela regra, não por slice", () => {
  const home = lerCodigo("src/app/page.tsx");

  it("não fatia mais o estoque à mão", () => {
    expect(
      home,
      "`disponiveis.slice(0, 6)` voltou — a grade deixou de ter curadoria",
    ).not.toMatch(/disponiveis\.slice\(\s*0\s*,\s*6\s*\)/);
  });

  it("chama a regra com a seleção e com o que está no banner", () => {
    const chamada = home.match(/montarDestaquesDaSemana\(\{[\s\S]*?\}\)/);

    expect(chamada, "a home não chama montarDestaquesDaSemana").not.toBeNull();
    expect(chamada![0], "sem a seleção do painel, a grade ignora a curadoria").toMatch(
      /selecionados:/,
    );
    expect(
      chamada![0],
      "sem `excluir`, o sorteio repete na grade o carro que está no banner logo acima",
    ).toMatch(/excluir:/);
  });

  it("a grade renderizada é o que a regra devolveu", () => {
    // A trava do `slice` acima não basta: alguém poderia chamar a função,
    // ignorar o resultado e renderizar outra lista.
    const secao = home.slice(
      home.indexOf("01 — ESTOQUE SELECIONADO"),
      home.indexOf("02 — CONSULTORIA"),
    );

    expect(secao, "a grade não percorre destaquesSemana").toMatch(
      /destaquesSemana\.map\(/,
    );
  });

  it("o link ao lado do título continua prometendo o estoque inteiro", () => {
    // Regra 6 do CLAUDE.md: a vitrine ordena, nunca esconde. `destaquesSemana`
    // é um recorte de 6; `total` é o estoque. Trocar um pelo outro faria o
    // link prometer seis carros.
    expect(home).not.toMatch(/VER OS \{destaquesSemana\.length\}/);
    expect(home).toMatch(/VER OS \{total\} VEÍCULOS/);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run tests/destaques-da-semana-fiacao.test.ts
```

Esperado: os dois primeiros casos do novo `describe` FALHAM.

- [ ] **Passo 3: trocar a linha na home**

Em `src/app/page.tsx`, no bloco de imports:

```ts
import { montarDestaquesDaSemana } from "../lib/destaquesDaSemana";
```

E trocar a linha 141:

```ts
  const destaquesSemana = disponiveis.slice(0, 6);
```

por:

```ts
  // A curadoria da GRADE, que não é a do banner: lista própria, decidida pelo
  // dono em 2026-09-09. O que ele marcou vem primeiro, na ordem em que marcou;
  // o sorteio só completa as vagas que sobraram, e evita repetir na grade o
  // carro que está passando no carrossel logo acima.
  const destaquesSemana = montarDestaquesDaSemana({
    disponiveis,
    selecionados: Array.isArray(settings.destaquesDaSemana)
      ? (settings.destaquesDaSemana as string[]).map(String)
      : [],
    excluir: slidesHero.map((v) => v.id),
  });
```

- [ ] **Passo 4: rodar e ver passar**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run tests/destaques-da-semana-fiacao.test.ts tests/vitrine.test.ts
```

Esperado: PASS nos dois arquivos. `tests/vitrine.test.ts` é a trava que já
existia sobre esta seção — ela precisa continuar verde sem ser tocada.

- [ ] **Passo 5: o teste que renderiza — sem ele, nada aqui está provado**

Os casos do passo 1 leem o **texto** de `page.tsx`. Eles impedem o `slice` de
voltar, mas não provam que a grade mostra o que a regra decidiu: alguém pode
chamar a função, ignorar o retorno e renderizar outra lista. E mutar a função da
tarefa 1 não prova nada sobre a home.

Não há `@testing-library` neste repositório — e não é preciso: Server Component
`async` se chama direto, e o que ele devolve é uma árvore de objetos. Criar
`tests/destaques-da-semana-na-home.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { CardVeiculo } from "../src/components/modernist/primitivos";
import type { Veiculo } from "../src/types";

/**
 * O ponto de chamada, e não a função.
 *
 * A regra da grade tem teste próprio em `destaques-da-semana.test.ts`. Este
 * arquivo responde a outra pergunta: **a home usa o que a regra devolveu?**
 * Mutar a função e ver o teste dela ficar vermelho não responde isso.
 */

const carro = (id: string): Veiculo =>
  ({ id, marca: "Marca", modelo: "Modelo", versao: "V", vendido: false }) as unknown as Veiculo;

const ESTOQUE = Array.from({ length: 12 }, (_, i) => carro(`c${i + 1}`));

vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<typeof import("../src/lib/supabase")>()),
  getEstoque: async () => ESTOQUE,
}));

vi.mock("../src/lib/avaliacoesGoogle", () => ({
  getReputacaoGoogle: async () => null,
}));

vi.mock("../src/lib/settings", async (original) => ({
  ...(await original<typeof import("../src/lib/settings")>()),
  getCachedSettings: async () => ({
    companySettings: null,
    aboutSettings: null,
    webhooks: null,
    popups: null,
    quickTags: null,
    stockOverrides: null,
    // O banner fica com c1..c3; a grade não pode repeti-los.
    carouselVehicleIds: ["c1", "c2", "c3"],
    bankBalances: null,
    procedencia: null,
    instagramCuradoria: null,
    areasHome: null,
    ga4: null,
    destaquesDaSemana: ["c9", "c7", "c5"],
  }),
}));

/**
 * Todo `CardVeiculo` da árvore, na ordem em que aparece.
 *
 * Varre `props` inteiro, não só `children`: elemento passado como prop não é
 * filho de ninguém, e some de um varredor que só desce por `children`.
 * Compara por referência ao componente, não pelo nome — nome de função
 * sobrevive à transpilação, mas depender disso é frágil à toa.
 */
function cards(no: unknown, achados: Array<Record<string, unknown>> = []) {
  if (Array.isArray(no)) {
    no.forEach((n) => cards(n, achados));
    return achados;
  }
  if (!no || typeof no !== "object") return achados;
  const elemento = no as ReactElement<Record<string, unknown>>;
  if (!elemento.props) return achados;
  if (elemento.type === CardVeiculo) achados.push(elemento.props);
  Object.values(elemento.props).forEach((valor) => cards(valor, achados));
  return achados;
}

describe("a home renderiza a grade que a regra montou", () => {
  it("mostra 6 cards, com os marcados na frente e na ordem da marcação", async () => {
    const Home = (await import("../src/app/page")).default;
    const grade = cards(await Home());

    const ids = grade.map((p) => (p.veiculo as Veiculo).id);

    expect(ids, `a grade veio com ${ids.length} cards`).toHaveLength(6);
    expect(ids.slice(0, 3)).toEqual(["c9", "c7", "c5"]);
  });

  it("o sorteio não repete na grade quem está no banner", async () => {
    const Home = (await import("../src/app/page")).default;
    const ids = cards(await Home()).map((p) => (p.veiculo as Veiculo).id);

    expect(ids).not.toContain("c1");
    expect(ids).not.toContain("c2");
    expect(ids).not.toContain("c3");
  });

  it("nenhum card sai sem veículo", async () => {
    // O sorteio fatiando além do fim devolveria `undefined` aqui — e a página
    // quebraria em produção, não no teste da função.
    const Home = (await import("../src/app/page")).default;
    const grade = cards(await Home());

    expect(grade.every((p) => Boolean((p.veiculo as Veiculo | undefined)?.id))).toBe(true);
  });
});
```

Rodar:

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run tests/destaques-da-semana-na-home.test.ts
```

Esperado: PASS, 3 casos. Se o import de `src/app/page` puxar um módulo que não
roda sob vitest, acrescente-o à lista de `vi.mock` acima — é o mesmo padrão,
não um desvio do plano.

- [ ] **Passo 6: mutar a HOME, não a função**

Uma por vez, em `src/app/page.tsx`, restaurando o arquivo inteiro depois:

| Mutação em `page.tsx` | Caso que precisa ficar vermelho |
|---|---|
| `excluir: slidesHero.map((v) => v.id)` → `excluir: []` | "o sorteio não repete na grade quem está no banner" |
| `selecionados: [...]` → `selecionados: []` | "mostra 6 cards, com os marcados na frente" |
| renderizar `disponiveis.slice(0, 6)` no `.map` da grade, mantendo a chamada da regra acima | "mostra 6 cards, com os marcados na frente" |

A terceira é a que importa: ela é o defeito que a asserção de fonte **não**
pega. Se ela sobreviver, o teste do passo 5 não está medindo a renderização.

- [ ] **Passo 7: ver a home de pé**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx next build
```

Esperado: build completo, sem erro na rota `/`. Não confie no código de saída da
tarefa inteira — leia a linha final do build.

- [ ] **Passo 8: suíte inteira e commit**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run
git add src/app/page.tsx tests/destaques-da-semana-fiacao.test.ts tests/destaques-da-semana-na-home.test.ts
git commit -m "feat(destaques): a grade da home passa a respeitar a curadoria"
```

---

## Tarefa 4: marcar e desmarcar no painel

**Arquivos:**
- Modificar: `src/lib/estoqueTabela.ts` (campo `naSemana` em `LinhaDeEstoque`)
- Modificar: `src/app/admin/estoque/page.tsx` (lê a lista, monta a linha, passa a prop)
- Modificar: `src/components/admin/TabelaDeEstoque.tsx` (estado, ação, botões, contador, etiqueta)

**Interfaces:**
- Consome: `VAGAS_NA_GRADE` da tarefa 1; `settings.destaquesDaSemana` da tarefa 2.
- Produz: nada que outra tarefa consuma.

**Contexto:** a ação em lote de destacar no banner já existe e é o molde exato —
`alternarDestaqueNaHome` em `TabelaDeEstoque.tsx:295`, os dois botões em `:606`
e `:614`, e a etiqueta da linha em `:786`. `salvarSettings` já faz o POST, o
otimismo de UI e o rollback. **Copie o molde, não invente outro.**

> A ação existente se chama "Destacar na home" e alimenta o banner + a TV do
> showroom. Ela **não** é renomeada aqui (está fora do escopo do spec, §9), mas
> os dois pares ficam lado a lado na mesma barra — por isso os rótulos novos
> dizem "destaques da semana" por extenso, e não "grade" ou "home".

- [ ] **Passo 1: o campo na linha da tabela**

Em `src/lib/estoqueTabela.ts`, na interface `LinhaDeEstoque`, ao lado de
`destacado`:

```ts
  /**
   * Está na lista da GRADE da home ("Destaques da semana").
   *
   * Separado de `destacado`, que é a lista do banner: são duas curadorias
   * independentes desde 2026-09-09, e a linha precisa mostrar as duas para o
   * operador saber onde o carro aparece.
   */
  naSemana: boolean;
```

- [ ] **Passo 2: a página do painel lê e passa**

Em `src/app/admin/estoque/page.tsx`, junto de `destacados`:

```ts
  const naSemana = Array.isArray(settings.destaquesDaSemana)
    ? (settings.destaquesDaSemana as string[]).map(String)
    : [];
```

No `map` que monta cada `LinhaDeEstoque`, junto de `destacado`:

```ts
    naSemana: naSemana.includes(id),
```

E na renderização de `<TabelaDeEstoque>`, junto de `destacadosIniciais`:

```ts
        naSemanaIniciais={naSemana}
```

- [ ] **Passo 3: o componente — prop, estado e ação**

Em `src/components/admin/TabelaDeEstoque.tsx`:

Na interface `TabelaDeEstoqueProps`, junto de `destacadosIniciais`:

```ts
  naSemanaIniciais: string[];
```

No destructure das props e no estado, junto de `destacados`:

```ts
  naSemanaIniciais,
```

```ts
  const [naSemana, setNaSemana] = useState<string[]>(naSemanaIniciais);
```

Logo depois de `alternarDestaqueNaHome`, a gêmea:

```ts
  /** A curadoria da GRADE da home. Gêmea de `alternarDestaqueNaHome`, que
   *  cuida do banner — duas listas, dois destinos, o mesmo caminho de salvar. */
  const alternarDestaqueDaSemana = async (marcar: boolean) => {
    if (selecionadosVisiveis.length === 0) return;
    const proximos = marcar
      ? [...new Set([...naSemana, ...selecionadosVisiveis])]
      : naSemana.filter((id) => !selecionadosVisiveis.includes(id));

    const anterior = naSemana;
    setNaSemana(proximos);
    setLinhas((prev) => prev.map((l) => ({ ...l, naSemana: proximos.includes(l.id) })));

    const ok = await salvarSettings(
      { destaquesDaSemana: proximos },
      marcar ? "Postos nos destaques da semana" : "Tirados dos destaques da semana",
    );
    if (!ok) {
      setNaSemana(anterior);
      setLinhas((prev) => prev.map((l) => ({ ...l, naSemana: anterior.includes(l.id) })));
    }
  };
```

- [ ] **Passo 4: os botões e o contador honesto**

Logo abaixo do par "Destacar na home" / "Tirar da home", copiando as mesmas
classes:

```tsx
          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueDaSemana(true)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Pôr nos destaques da semana
          </button>
          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueDaSemana(false)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tirar dos destaques da semana
          </button>
          {naSemana.length > VAGAS_NA_GRADE && (
            /* Campo que some sem avisar é defeito conhecido deste painel: o
               7º carro marcado não aparece na home, e sem esta linha ninguém
               descobre por quê. */
            <span className="self-center text-[10px] font-semibold uppercase tracking-[.1em] text-mt-accent">
              {naSemana.length} marcados · a grade mostra {VAGAS_NA_GRADE}
            </span>
          )}
```

Com o import no topo do arquivo:

```ts
import { VAGAS_NA_GRADE } from "../../lib/destaquesDaSemana";
```

- [ ] **Passo 5: a etiqueta na linha**

Ao lado de `{l.destacado && ...}`:

```tsx
                          {l.naSemana && <span className="text-mt-accent">· na semana</span>}
```

- [ ] **Passo 6: typecheck, lint e suíte**

```bash
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx tsc --noEmit
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx eslint src/components/admin/TabelaDeEstoque.tsx src/app/admin/estoque/page.tsx src/lib/estoqueTabela.ts
cd C:/Users/Lenovo/Documents/motors-claude/destaques-da-semana && npx vitest run
```

Esperado: `tsc` com os mesmos 3 erros de base e nenhum a mais; `eslint` sem
problema novo nesses arquivos; suíte inteira verde. Se algum teste de fonte que
varre `src/` reprovar por causa da copy nova, leia o teste antes de mudar o
texto — pode ser trava legítima de vocabulário.

- [ ] **Passo 7: commit**

```bash
git add src/lib/estoqueTabela.ts src/app/admin/estoque/page.tsx src/components/admin/TabelaDeEstoque.tsx
git commit -m "feat(destaques): o painel marca e desmarca a grade da semana"
```

---

## Fechamento

- [ ] **Revisão adversarial obrigatória.** `CLAUDE.md`: *"Toda entrega passa pelo
  `qa-guardian` antes de merge."* Peça a ele, explicitamente, para atacar: (a) o
  sorteio não vazar `undefined` na grade; (b) a chave nova não aparecer em
  nenhum payload que chegue ao navegador; (c) as travas novas não passarem por
  vacuidade; (d) alguma trava existente do repositório quebrada pela copy nova.
- [ ] **Reintegrar o `main`** antes de abrir o PR — ele anda durante o trabalho —
  e rodar a suíte inteira sobre o resultado.
- [ ] **PR** com o antes/depois da seção e o link para o spec. O `gh` não tem
  login neste ambiente: abrir por
  `https://github.com/85dyones/motors-site-oficial/compare/main...feat/destaques-da-semana?quick_pull=1`
  na sessão logada do Chrome.
