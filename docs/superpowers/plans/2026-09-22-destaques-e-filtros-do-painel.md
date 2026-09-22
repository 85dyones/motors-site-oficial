# Destaques com ordem, e filtros no estoque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao dono uma tela onde ele vê, ordena e limpa as três listas de destaque (banner da home, grade da semana, TV do showroom), separar a lista da TV da lista do banner, subir os dois tetos que ele pediu, e dar à tabela de estoque os filtros que faltam.

**Architecture:** Toda regra nova nasce como função pura em `src/lib/destaquesDoPainel.ts`, testada sem React, no molde de `src/lib/areasDoSite.ts`. A tela nova é irmã de `/admin/site/areas`: setas ▲/▼, estado sujo, um `POST /api/settings` no botão Publicar. A separação da TV é por *fallback* de leitura, sem migração SQL. Os tetos viram constantes com uma casa só, importadas por quem desenha e por quem corta.

**Tech Stack:** Next 16.2.6 (App Router, RSC), React 19.2.4, TypeScript, Tailwind, Supabase (`site_settings` como blobs JSON por linha), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-destaques-e-filtros-do-painel-design.md` (commit `405e473`)

## Global Constraints

- **Idioma:** todo identificador, comentário, texto de tela e mensagem de commit em **português**. O repositório inteiro é assim; inglês destoa.
- **Comentários explicam POR QUÊ, não o quê.** O padrão da casa é denso e datado (ver `src/lib/destaquesDaSemana.ts`). Decisão registrada no código vale mais que decisão só no plano.
- **Nenhuma biblioteca nova.** Ordenação é ▲/▼ com função pura, como `moverArea`. Nada de `dnd-kit`, `framer-motion` ou similar.
- **Nenhuma migração SQL.** `site_settings` é `(id, data, updated_at)`; linha nova nasce do primeiro `upsert`.
- **Uma casa por número.** `VAGAS.grade` importa `VAGAS_NA_GRADE`; `page.tsx` importa `VAGAS.banner`. Nenhum teto digitado duas vezes.
- **Régua de "vivo" consultada, nunca reescrita.** `linha.estado === "publicado"` já é a dobra de arquivado + vendido + rascunho + sem-foto (`decidirEstado`, `src/lib/estoqueTabela.ts:258`). Não recalcular nada disso.
- **Base verde medida antes de começar:** `npm test` → 223 arquivos, 4084 passando, 10 pulados. Qualquer tarefa que baixe esse número está errada.
- **Comando de teste:** `npm test` (vitest run). Um arquivo só: `npx vitest run tests/<arquivo>`.

## Dois desvios conscientes em relação à spec

**1. A ordem das tarefas mudou, e o motivo é de correção.** A §7 da spec põe os
filtros em 2º e os tetos em 5º. Aqui os tetos vêm logo depois do módulo
(Tasks 2 e 3), porque a Task 1 cria `VAGAS.banner = 4` e o `page.tsx` ainda
corta em `3`: qualquer tarefa entre as duas viveria com o painel prometendo
quatro vagas e a home entregando três — exatamente a divergência que este
trabalho existe para acabar. O bônus é que o dono recupera o Fiat Toro na
Task 2, antes de qualquer tela nova.

**2. Entre a Task 4 e a Task 7, o link `/admin/site/destaques` não resolve.**
O aviso de lotação aponta para uma rota que só nasce na Task 7. É aceitável
porque é atrás do login, dura poucos commits, e cai no `not-found.tsx` da raiz
(que é a casa, não um beco). **Quem parar a implementação no meio não deve
mandar as Tasks 4-6 para produção sem a Task 7.**

---

### Task 1: O módulo `destaquesDoPainel.ts`

**Files:**
- Create: `src/lib/destaquesDoPainel.ts`
- Create: `tests/destaques-do-painel.test.ts`

**Interfaces:**
- Consumes: `VAGAS_NA_GRADE` de `src/lib/destaquesDaSemana.ts`; o tipo `LinhaDeEstoque` de `src/lib/estoqueTabela.ts`.
- Produces: `Vitrine`, `VAGAS`, `DestinoDoDestaque`, `ItemDestacado`, `montarPainelDeDestaques`, `moverDestaque`, `removerDestaque`, `limparForaDoAr`, `voltaCompletaEmSegundos`. Tudo consumido pelas Tasks 2, 4 e 7.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/destaques-do-painel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  VAGAS,
  montarPainelDeDestaques,
  moverDestaque,
  removerDestaque,
  limparForaDoAr,
  voltaCompletaEmSegundos,
} from "../src/lib/destaquesDoPainel";
import { VAGAS_NA_GRADE } from "../src/lib/destaquesDaSemana";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * A curadoria dos destaques não tinha tela: era uma lista append-only que o
 * site cortava em silêncio. Ver
 * `docs/superpowers/specs/2026-09-21-destaques-e-filtros-do-painel-design.md`.
 *
 * Só os campos que a regra lê entram nos dublês — `estado` responde sozinho
 * "este carro está no ar?", porque `decidirEstado` já dobrou arquivado,
 * vendido, rascunho e sem-foto nele.
 */
const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({
    id,
    marca: "Fiat",
    modelo: "Toro",
    versao: "",
    preco: 100000,
    estado: "publicado",
    ...over,
  }) as unknown as LinhaDeEstoque;

describe("VAGAS", () => {
  it("a grade não redigita o seis — importa a constante da home", () => {
    expect(VAGAS.grade).toBe(VAGAS_NA_GRADE);
  });

  it("o banner tem quatro vagas e a TV não tem teto", () => {
    expect(VAGAS.banner).toBe(4);
    expect(VAGAS.tv).toBeNull();
  });
});

describe("montarPainelDeDestaques", () => {
  it("a posição viva ignora os mortos acima dela", () => {
    const itens = montarPainelDeDestaques(
      ["morto", "vivo1", "vivo2"],
      [
        linha("morto", { estado: "arquivado" }),
        linha("vivo1"),
        linha("vivo2"),
      ],
      "banner",
    );

    expect(itens[0]).toMatchObject({ posicao: 1, posicaoViva: null, destino: "fora_do_ar" });
    expect(itens[1]).toMatchObject({ posicao: 2, posicaoViva: 1, destino: "no_ar" });
    expect(itens[2]).toMatchObject({ posicao: 3, posicaoViva: 2, destino: "no_ar" });
  });

  it("no banner, o quinto vivo fica fora do teto", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const itens = montarPainelDeDestaques(ids, ids.map((i) => linha(i)), "banner");

    expect(itens.map((i) => i.destino)).toEqual([
      "no_ar", "no_ar", "no_ar", "no_ar", "fora_do_teto",
    ]);
  });

  it("na TV, o quinto vivo continua no ar — ela não tem teto", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const itens = montarPainelDeDestaques(ids, ids.map((i) => linha(i)), "tv");

    expect(itens.every((i) => i.destino === "no_ar")).toBe(true);
  });

  it("o id que não está no estoque não derruba a montagem", () => {
    const itens = montarPainelDeDestaques(["fantasma"], [], "banner");

    expect(itens[0]).toMatchObject({
      destino: "fora_do_ar",
      motivoForaDoAr: "fora do estoque",
      posicaoViva: null,
    });
  });

  it("cada estado morto se explica com o seu motivo", () => {
    const itens = montarPainelDeDestaques(
      ["v", "a", "r", "f"],
      [
        linha("v", { estado: "vendido" }),
        linha("a", { estado: "arquivado" }),
        linha("r", { estado: "rascunho" }),
        linha("f", { estado: "fora_da_vitrine" }),
      ],
      "banner",
    );

    expect(itens.map((i) => i.motivoForaDoAr)).toEqual([
      "vendido", "arquivado", "rascunho", "sem foto",
    ]);
  });

  it("a fotografia real de 21/09: com o teto em 4, o Toro deixa de ser cortado", () => {
    // Os 9 ids medidos em produção, na ordem gravada. Cinco estão fora do ar.
    const ids = [
      "8324691", "8296347", "8307965", "8171616", "8121860",
      "8429524", "8358193", "8107703", "8464513",
    ];
    const linhas = [
      linha("8324691", { estado: "arquivado" }),
      linha("8296347", { estado: "arquivado" }),
      linha("8307965", { estado: "arquivado" }),
      linha("8171616"),
      linha("8121860", { estado: "arquivado" }),
      linha("8429524"),
      linha("8358193"),
      linha("8107703", { estado: "vendido" }),
      linha("8464513"),
    ];

    const itens = montarPainelDeDestaques(ids, linhas, "banner");
    const porId = new Map(itens.map((i) => [i.id, i]));

    // O Titano é o 4º da lista e o 1º do banner — o número que a tela mostra.
    expect(porId.get("8171616")).toMatchObject({ posicao: 4, posicaoViva: 1 });
    // O Toro era o descartado. Com quatro vagas, ele entra.
    expect(porId.get("8464513")).toMatchObject({ posicaoViva: 4, destino: "no_ar" });
    expect(itens.filter((i) => i.destino === "fora_do_ar")).toHaveLength(5);
  });
});

describe("moverDestaque", () => {
  it("troca com o vizinho de cima", () => {
    expect(moverDestaque(["a", "b", "c"], "b", "cima")).toEqual(["b", "a", "c"]);
  });

  it("troca com o vizinho de baixo", () => {
    expect(moverDestaque(["a", "b", "c"], "b", "baixo")).toEqual(["a", "c", "b"]);
  });

  it("no topo, subir não faz nada", () => {
    expect(moverDestaque(["a", "b"], "a", "cima")).toEqual(["a", "b"]);
  });

  it("no fim, descer não faz nada", () => {
    expect(moverDestaque(["a", "b"], "b", "baixo")).toEqual(["a", "b"]);
  });

  it("id que não está na lista devolve a lista intacta", () => {
    expect(moverDestaque(["a", "b"], "z", "cima")).toEqual(["a", "b"]);
  });
});

describe("removerDestaque", () => {
  it("tira o id e preserva a ordem do resto", () => {
    expect(removerDestaque(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("limparForaDoAr", () => {
  it("tira só os mortos e preserva a ordem dos vivos", () => {
    const ids = ["a", "morto", "b", "vendido", "c"];
    const linhas = [
      linha("a"), linha("morto", { estado: "arquivado" }), linha("b"),
      linha("vendido", { estado: "vendido" }), linha("c"),
    ];

    expect(limparForaDoAr(ids, linhas)).toEqual(["a", "b", "c"]);
  });

  it("tira o id que sumiu do estoque", () => {
    expect(limparForaDoAr(["a", "fantasma"], [linha("a")])).toEqual(["a"]);
  });
});

describe("voltaCompletaEmSegundos", () => {
  it("quatro carros a oito segundos dão trinta e dois", () => {
    expect(voltaCompletaEmSegundos(4)).toBe(32);
  });

  it("lista vazia não roda", () => {
    expect(voltaCompletaEmSegundos(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/destaques-do-painel.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/destaquesDoPainel"`.

- [ ] **Step 3: Escrever o módulo**

Criar `src/lib/destaquesDoPainel.ts`:

```ts
import { VAGAS_NA_GRADE } from "./destaquesDaSemana";
import type { EstadoDoVeiculo, LinhaDeEstoque } from "./estoqueTabela";

/**
 * As três listas de curadoria do painel — e o que cada uma alimenta.
 *
 * ---------------------------------------------------------------------------
 * Por que três, e não uma
 * ---------------------------------------------------------------------------
 * Até 2026-09-22 `carousel_vehicles` servia ao banner da home (teto de 3) E à
 * TV do showroom (sem teto). Curar bem para as duas é impossível: marcar
 * muitos entope o banner, marcar poucos esvazia a TV. Medido em produção em
 * 21/09, o resultado era uma lista de 9 ids em que 5 eram carros arquivados ou
 * vendidos e o carro marcado por último nunca chegava à home.
 *
 * Ver `docs/superpowers/specs/2026-09-21-destaques-e-filtros-do-painel-design.md`.
 */
export type Vitrine = "banner" | "grade" | "tv";

/**
 * Quantas vagas cada vitrine tem. `null` é "sem teto".
 *
 * `grade` IMPORTA `VAGAS_NA_GRADE` em vez de redigitar o seis: dois seis em
 * arquivos diferentes divergem no dia em que um deles mudar, e o sintoma seria
 * a tela desenhando a régua numa vaga e a home cortando noutra.
 *
 * A TV é `null` de propósito, e não um número grande: ela pagina a lista
 * inteira, então o limite dela não é de vagas — é de tempo de volta
 * (`voltaCompletaEmSegundos`).
 */
export const VAGAS = {
  banner: 4,
  grade: VAGAS_NA_GRADE,
  tv: null,
} as const satisfies Record<Vitrine, number | null>;

/** Segundos que a TV gasta em cada carro. Espelha `INTERVALO_MS` de `VitrineTV`. */
const SEGUNDOS_POR_CARRO_NA_TV = 8;

export type DestinoDoDestaque =
  /** Dentro do teto da sua vitrine — ou numa vitrine sem teto. */
  | "no_ar"
  /** Vivo no estoque, mas além da última vaga: marcado e invisível. */
  | "fora_do_teto"
  /** Vendido, arquivado, rascunho, sem foto, ou fora do estoque. */
  | "fora_do_ar";

export interface ItemDestacado {
  id: string;
  rotulo: string;
  preco: number | null;
  /** 1-based na lista gravada, mortos inclusive. */
  posicao: number;
  /**
   * 1-based contando SÓ os vivos — é este que a linha de corte lê.
   *
   * Existe separado de `posicao` porque cortar pela posição crua poria a régua
   * no lugar errado sempre que houvesse um morto acima dela. Na fotografia de
   * 21/09 o Titano é o 4º da lista e o 1º do banner: uma tela que mostrasse
   * "vaga 4" ao lado do primeiro slide estaria mentindo com número.
   */
  posicaoViva: number | null;
  destino: DestinoDoDestaque;
  motivoForaDoAr: string | null;
}

/**
 * Por que este carro não está no ar — no vocabulário do operador.
 *
 * A régua é CONSULTADA, não reescrita: `decidirEstado` já dobrou
 * `estado_cadastro`, `vendido` e a falta de foto num campo só. Recalcular
 * qualquer parte disso aqui criaria uma segunda régua para a mesma pergunta —
 * o defeito que a contagem de fotos da tabela de estoque já documenta.
 */
const MOTIVO_POR_ESTADO: Partial<Record<EstadoDoVeiculo, string>> = {
  vendido: "vendido",
  arquivado: "arquivado",
  rascunho: "rascunho",
  fora_da_vitrine: "sem foto",
};

/** O rótulo da linha, sem repetir a versão que já está no modelo. */
function rotuloDe(linha: LinhaDeEstoque): string {
  return [linha.marca, linha.modelo, linha.versao].filter(Boolean).join(" ").trim();
}

/**
 * Casa a lista gravada com o estoque e decide o destino de cada id.
 *
 * O id que não está mais no estoque NÃO é descartado: ele vira uma entrada
 * `fora_do_ar`, porque a tela precisa mostrá-lo para o operador poder limpá-lo.
 * Era justamente a invisibilidade dele que deixava 5 carros mortos entupindo a
 * lista sem ninguém ver.
 */
export function montarPainelDeDestaques(
  ids: string[],
  linhas: LinhaDeEstoque[],
  vitrine: Vitrine,
): ItemDestacado[] {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const teto = VAGAS[vitrine];

  let vivos = 0;

  return ids.map((id, i) => {
    const linha = porId.get(id);

    if (!linha) {
      return {
        id,
        rotulo: id,
        preco: null,
        posicao: i + 1,
        posicaoViva: null,
        destino: "fora_do_ar" as const,
        motivoForaDoAr: "fora do estoque",
      };
    }

    const motivo = MOTIVO_POR_ESTADO[linha.estado] ?? null;
    if (motivo) {
      return {
        id,
        rotulo: rotuloDe(linha),
        preco: linha.preco,
        posicao: i + 1,
        posicaoViva: null,
        destino: "fora_do_ar" as const,
        motivoForaDoAr: motivo,
      };
    }

    vivos += 1;
    return {
      id,
      rotulo: rotuloDe(linha),
      preco: linha.preco,
      posicao: i + 1,
      posicaoViva: vivos,
      destino: teto === null || vivos <= teto ? ("no_ar" as const) : ("fora_do_teto" as const),
      motivoForaDoAr: null,
    };
  });
}

/**
 * Espelha `moverArea` de `areasDoSite.ts` — mesmo formato, mesma guarda.
 *
 * Fora dos limites devolve a lista INTACTA em vez de estourar: a tela chama
 * isto direto do clique, e um botão de seta no topo é o caso normal, não erro.
 */
export function moverDestaque(
  ids: string[],
  id: string,
  direcao: "cima" | "baixo",
): string[] {
  const proximos = [...ids];
  const i = proximos.indexOf(id);
  if (i < 0) return ids;
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= proximos.length) return ids;
  [proximos[i], proximos[j]] = [proximos[j], proximos[i]];
  return proximos;
}

export function removerDestaque(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/**
 * Tira os ids que não estão vivos. Não mexe na ordem do resto.
 *
 * Limpar NÃO muda nada do que está no ar: a home e a TV já descartam estes ids
 * no `filter(Boolean)`, antes de qualquer corte. É higiene — e a tela precisa
 * dizer isso em texto, senão o botão assusta e ninguém aperta.
 */
export function limparForaDoAr(ids: string[], linhas: LinhaDeEstoque[]): string[] {
  const vivos = new Set(
    linhas.filter((l) => l.estado === "publicado").map((l) => l.id),
  );
  return ids.filter((id) => vivos.has(id));
}

/**
 * Quanto tempo a TV leva para dar uma volta completa.
 *
 * É o limite REAL da lista da TV, no lugar do teto de vagas que ela não tem:
 * rodar o pátio inteiro a 8s por carro daria mais de dez minutos, e quem passa
 * pelo showroom não espera dez minutos para rever um carro.
 */
export function voltaCompletaEmSegundos(itens: number): number {
  return itens * SEGUNDOS_POR_CARRO_NA_TV;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/destaques-do-painel.test.ts`
Expected: PASS — 18 testes.

`EstadoDoVeiculo` **já é exportado** de `estoqueTabela.ts:45` (conferido na
varredura de pré-voo). É só importar — nada a acrescentar lá.

- [ ] **Step 5: Commit**

```bash
git add src/lib/destaquesDoPainel.ts tests/destaques-do-painel.test.ts
git commit -m "feat(destaques): a regra da curadoria com ordem, em função pura"
```

---

### Task 2: O banner sobe para 4 slides

Entrega sozinha o que o dono pediu primeiro: **o Fiat Toro volta ao ar.**

**Files:**
- Modify: `src/app/page.tsx:138-143`
- Modify: `src/components/modernist/HeroHome.tsx:246`
- Create: `tests/banner-quatro-slides.test.ts`

**Interfaces:**
- Consumes: `VAGAS` da Task 1.
- Produces: nada que tarefas seguintes leiam — é mudança de comportamento, não de contrato.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/banner-quatro-slides.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { VAGAS } from "../src/lib/destaquesDoPainel";
import { lerCodigo } from "./fonte";

/**
 * O banner mostrava 3 slides com um `.slice(0, 3)` digitado à mão. Medido em
 * 21/09, isso descartava em silêncio o 4º carro vivo da curadoria — o carro
 * marcado por último, que é justamente o que o dono acabou de escolher.
 *
 * Teste de FONTE, e não de render: o defeito não é visual, é um número solto.
 * Enquanto ele estiver digitado no lugar da constante, nada impede que volte a
 * divergir do painel — e foi assim que o corte ficou invisível por meses.
 */
describe("o banner da home tem uma casa só para o seu teto", () => {
  const home = lerCodigo("src/app/page.tsx");

  it("não corta com número digitado à mão", () => {
    expect(home).not.toMatch(/slidesHero[\s\S]{0,80}?slice\(0,\s*3\)/);
  });

  it("corta pela constante compartilhada com o painel", () => {
    expect(home).toMatch(/VAGAS\.banner/);
  });

  it("a constante é quatro", () => {
    expect(VAGAS.banner).toBe(4);
  });
});

/**
 * A régua de indicadores do hero é uma linha flex de botões de largura FIXA.
 * A conta, com `gap-4` (16px) no mobile:
 *
 *   3 slides -> 3x76 + 2x16 = 260px   cabe
 *   4 slides -> 4x76 + 3x16 = 352px   NÃO cabe em 343px (celular de 375px)
 *   4 slides -> 4x64 + 3x16 = 304px   cabe, com folga
 *
 * Subir o número sem encolher o botão no mobile estoura a régua por 9px — e o
 * próprio código já registrava o aperto com 3 ("no mobile a linha não cabe").
 */
describe("a régua de indicadores cabe no celular com quatro slides", () => {
  const hero = lerCodigo("src/components/modernist/HeroHome.tsx");

  it("o botão encolhe abaixo de sm e volta ao tamanho cheio a partir dele", () => {
    expect(hero).toMatch(/w-\[64px\]/);
    expect(hero).toMatch(/sm:w-\[76px\]/);
  });

  it("a largura fixa de 76px não sobra solta, sem o prefixo responsivo", () => {
    expect(hero).not.toMatch(/(?<!sm:)w-\[76px\]/);
  });

  it("quatro botões de 64px com gap de 16px cabem em 343px", () => {
    const LARGURA = 64;
    const GAP = 16;
    const UTIL_NO_CELULAR = 343;
    expect(4 * LARGURA + 3 * GAP).toBeLessThanOrEqual(UTIL_NO_CELULAR);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/banner-quatro-slides.test.ts`
Expected: FAIL — "não corta com número digitado à mão" e os dois de largura.

- [ ] **Step 3: Trocar o corte na home**

Em `src/app/page.tsx`, adicionar ao bloco de imports (junto dos outros de `../lib`):

```ts
import { VAGAS } from "../lib/destaquesDoPainel";
```

E trocar a linha 143:

```ts
  const slidesHero = (curados.length > 0 ? curados : disponiveis).slice(0, 3);
```

por:

```ts
  // O teto do banner tem uma casa só, compartilhada com o painel que cura a
  // lista (`VAGAS.banner`). Enquanto era um 3 digitado aqui, o painel não
  // tinha como avisar que o 4º marcado não caberia — e não avisava: medido em
  // 21/09, o carro escolhido por último era descartado em silêncio.
  const slidesHero = (curados.length > 0 ? curados : disponiveis).slice(0, VAGAS.banner);
```

- [ ] **Step 4: Encolher o botão da régua no mobile**

Em `src/components/modernist/HeroHome.tsx:246`, trocar:

```tsx
                className="mt-foco flex w-[76px] flex-col gap-2"
```

por:

```tsx
                /* 64px abaixo de `sm` porque a régua é de largura FIXA: com
                   quatro slides, 4x76 + 3x16 = 352px estoura os 343px úteis de
                   um celular de 375px. Com 64px dá 304px e sobra folga. De
                   `sm` para cima o espaço volta e o botão volta a 76px. */
                className="mt-foco flex w-[64px] flex-col gap-2 sm:w-[76px]"
```

- [ ] **Step 5: Atualizar o comentário do rodapé do hero**

Ainda em `HeroHome.tsx`, o comentário acima de `<div className="mt-auto flex flex-col gap-6 ...">` (linha ~232) diz "3 indicadores". Trocar o trecho:

```
          No mobile a linha não cabe (3 indicadores + placa de 280px > 360px),
```

por:

```
          No mobile a linha não cabe (4 indicadores + placa de 280px > 360px),
```

- [ ] **Step 6: Rodar o teste novo e a suíte inteira**

Run: `npx vitest run tests/banner-quatro-slides.test.ts`
Expected: PASS — 6 testes.

Run: `npm test`
Expected: 224 arquivos, 4090 passando, 10 pulados. **Se algum teste de hero existente quebrar, ele está certo e a mudança está errada** — ler o que ele trava antes de tocá-lo.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/components/modernist/HeroHome.tsx tests/banner-quatro-slides.test.ts
git commit -m "fix(home): o banner mostra quatro, e o teto tem uma casa so"
```

---

### Task 3: A faixa da TV sobe para 6 células

**Files:**
- Modify: `src/components/modernist/VitrineTV.tsx:31` (`POR_PAGINA`), `:228` e `:242` (tipografia da célula)
- Create: `tests/vitrine-seis-celulas.test.ts`

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: `POR_PAGINA = 6`, já exportado e lido por `src/app/vitrine/page.tsx`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/vitrine-seis-celulas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { POR_PAGINA } from "../src/components/modernist/VitrineTV";
import { lerCodigo } from "./fonte";

/**
 * A faixa "A SEGUIR" divide a largura da TV entre as células. A conta, com a
 * célula fixa do rótulo comendo ~10vw:
 *
 *   4 células -> ~19vw de conteúdo    folgado
 *   6 células -> ~11,4vw              cabe "Volkswagen Saveiro" (18 caracteres)
 *   8 células -> ~7,7vw               trunca a maioria dos nomes
 *
 * 6 é o teto real desta faixa sem redesenhá-la. Acima disso a TV vira uma
 * fileira de reticências — que num aparelho visto de longe é pior do que
 * mostrar menos carro.
 */
describe("a faixa da TV mostra seis carros por página", () => {
  it("POR_PAGINA é seis", () => {
    expect(POR_PAGINA).toBe(6);
  });

  const tv = lerCodigo("src/components/modernist/VitrineTV.tsx");

  it("a célula aperta o respiro lateral para caber", () => {
    expect(tv).toMatch(/px-\[1\.2vw\]/);
    expect(tv).not.toMatch(/px-\[1\.77vw\]/);
  });

  it("o nome do carro encolhe junto", () => {
    expect(tv).toMatch(/text-\[1vw\]/);
    expect(tv).not.toMatch(/text-\[1\.15vw\]/);
  });

  it("seis células ainda cabem na largura útil da faixa", () => {
    const UTIL_VW = 90;      // 100vw menos a célula fixa "A SEGUIR"
    const RESPIRO_VW = 1.2 * 2;
    const conteudo = UTIL_VW / POR_PAGINA - RESPIRO_VW;
    // "Volkswagen Saveiro" tem 18 caracteres; a ~0,5em por caractere e com a
    // fonte em 1vw, ela ocupa ~9vw.
    expect(conteudo).toBeGreaterThanOrEqual(9);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/vitrine-seis-celulas.test.ts`
Expected: FAIL — `expected 4 to be 6`.

- [ ] **Step 3: Subir a constante**

Em `src/components/modernist/VitrineTV.tsx:31`, trocar:

```ts
export const POR_PAGINA = 4;
```

por:

```ts
/**
 * Quantos carros a faixa "A SEGUIR" mostra de uma vez.
 *
 * Subiu de 4 para 6 em 2026-09-22, a pedido do dono. 6 é o teto desta faixa
 * sem redesenhá-la: a largura útil (~90vw, descontada a célula do rótulo)
 * dividida por 6 deixa ~11,4vw por célula, e o nome mais longo do estoque
 * ("Volkswagen Saveiro") ainda cabe. Com 8 sobrariam ~7,7vw e a maioria dos
 * nomes viraria reticências — pior que mostrar menos carro, numa tela vista
 * de longe.
 */
export const POR_PAGINA = 6;
```

- [ ] **Step 4: Apertar a tipografia da célula**

Em `VitrineTV.tsx:228`, no `className` da célula do carro, trocar `px-[1.77vw]` por `px-[1.2vw]`:

```tsx
              className={`flex flex-1 flex-col justify-center gap-[1.2vh] border-r border-mt-inverso-regua-fina px-[1.2vw] ${
                ativo ? "bg-[#201e1d]" : ""
              }`}
```

E em `:242`, o nome do carro, trocar `text-[1.15vw]` por `text-[1vw]`:

```tsx
                className={`truncate text-[1vw] font-extrabold tracking-[-.02em] ${
                  ativo ? "text-mt-inverso" : "text-mt-neutral-500"
                }`}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/vitrine-seis-celulas.test.ts`
Expected: PASS — 4 testes.

Run: `npm test`
Expected: 225 arquivos, 4094 passando.

- [ ] **Step 6: Commit**

```bash
git add src/components/modernist/VitrineTV.tsx tests/vitrine-seis-celulas.test.ts
git commit -m "feat(vitrine): a faixa da TV mostra seis por vez"
```

---

### Task 4: A barra de ações do estoque para de mentir

Independente da tela nova, e é o que explica ao dono **por que** o carro não aparecia.

**Files:**
- Modify: `src/components/admin/TabelaDeEstoque.tsx:630-668`
- Create: `tests/barra-de-destaques-honesta.test.ts`

**Interfaces:**
- Consumes: `VAGAS` da Task 1.
- Produces: nada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/barra-de-destaques-honesta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { VAGAS } from "../src/lib/destaquesDoPainel";
import { lerCodigo } from "./fonte";

/**
 * Dois pares de botões de nome vizinho na mesma barra — "Destacar na home" e
 * "Pôr nos destaques da semana" — sem nada dizendo que são listas diferentes,
 * com destinos diferentes e tetos diferentes.
 *
 * O resultado, medido em 21/09: o dono usou o primeiro par durante meses e a
 * lista do segundo nunca foi criada. E o par que ele usava era justamente o
 * único SEM aviso de lotação — a grade tinha aviso desde o início, o banner
 * não tinha nenhum.
 */
describe("a barra diz o destino e o teto de cada lista", () => {
  const tabela = lerCodigo("src/components/admin/TabelaDeEstoque.tsx");

  it("o botão do banner declara a vitrine e as vagas", () => {
    expect(tabela).toMatch(/banner · \{VAGAS\.banner\} vagas/);
  });

  it("o botão da grade declara a vitrine e as vagas", () => {
    expect(tabela).toMatch(/grade · \{VAGAS\.grade\} vagas/);
  });

  it("o banner ganhou o aviso de lotação que só a grade tinha", () => {
    expect(tabela).toMatch(/destacados\.length > VAGAS\.banner/);
  });

  it("o aviso leva para a tela que resolve", () => {
    expect(tabela).toMatch(/\/admin\/site\/destaques/);
  });
});

describe("o teto do aviso é o mesmo que a home corta", () => {
  it("quatro no banner, seis na grade", () => {
    expect(VAGAS.banner).toBe(4);
    expect(VAGAS.grade).toBe(6);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/barra-de-destaques-honesta.test.ts`
Expected: FAIL nos quatro primeiros.

- [ ] **Step 3: Importar a constante**

Em `src/components/admin/TabelaDeEstoque.tsx`, junto do import existente da linha 20:

```ts
import { VAGAS_NA_GRADE } from "../../lib/destaquesDaSemana";
```

acrescentar:

```ts
import { VAGAS } from "../../lib/destaquesDoPainel";
```

- [ ] **Step 4: Trocar os rótulos e o aviso**

Trocar o texto dos quatro botões de destaque (linhas ~630-660) e o bloco do aviso (~661-668) por:

```tsx
          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueNaHome(true)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Destacar na home (banner · {VAGAS.banner} vagas)
          </button>
          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueNaHome(false)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tirar do banner
          </button>

          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueDaSemana(true)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Pôr nos destaques da semana (grade · {VAGAS.grade} vagas)
          </button>
          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueDaSemana(false)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tirar da grade
          </button>

          {/* O aviso de lotação existia SÓ para a grade — e a grade era a lista
              que ninguém usava. O banner, que é o que o dono marca, não tinha
              aviso nenhum: ele marcava o 5º carro, via o verde de "salvo" e a
              home não mudava. Agora os dois avisam, e o aviso leva para a tela
              onde se resolve, em vez de só informar. */}
          {destacados.length > VAGAS.banner && (
            <span className="self-center text-[10px] font-semibold uppercase tracking-[.1em] text-mt-accent">
              {destacados.length} no banner · a home mostra {VAGAS.banner} ·{" "}
              <Link href="/admin/site/destaques" className="underline">
                ordenar
              </Link>
            </span>
          )}
          {naSemana.length > VAGAS.grade && (
            <span className="self-center text-[10px] font-semibold uppercase tracking-[.1em] text-mt-accent">
              {naSemana.length} na grade · a home mostra {VAGAS.grade} ·{" "}
              <Link href="/admin/site/destaques" className="underline">
                ordenar
              </Link>
            </span>
          )}
```

**Atenção:** o import de `VAGAS_NA_GRADE` na linha 20 fica sem uso depois disto. Removê-lo, senão o `eslint` acusa.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/barra-de-destaques-honesta.test.ts`
Expected: PASS — 5 testes.

Run: `npm run lint`
Expected: sem erro de import não usado.

Run: `npm test`
Expected: +5 testes novos, e a suíte inteira continua verde (conferir contra o número que o seu `npm test` mostrar ANTES de começar, não contra um número deste plano). **Se `tests/destaques-da-semana-fiacao.test.ts` quebrar**, ele provavelmente casa o texto antigo do botão — atualizar a string esperada nele, que é mudança legítima de rótulo.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/TabelaDeEstoque.tsx tests/barra-de-destaques-honesta.test.ts
git commit -m "fix(estoque): os botoes de destaque dizem o destino, e o banner avisa quando lota"
```

---

### Task 5: A TV ganha lista própria

**Files:**
- Modify: `src/lib/settings.ts` (leitura e retorno)
- Modify: `src/app/api/settings/route.ts` (desestruturação e bloco de gravação)
- Modify: `src/app/vitrine/page.tsx:32-35`
- Create: `tests/vitrine-lista-propria.test.ts`

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: `settings.vitrineTv` (array de ids ou `null`), lido pelas Tasks 6 e 7. Campo `vitrineTv` aceito por `POST /api/settings`, gravado na linha `vitrine_tv`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/vitrine-lista-propria.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * Uma lista servia a duas superfícies com capacidades diferentes: o banner da
 * home (teto de 3, agora 4) e a TV do showroom (sem teto). Era impossível
 * curá-la bem para as duas — e o sintoma medido em 21/09 foi uma lista de 9
 * ids com 5 carros mortos dentro.
 *
 * A separação é por FALLBACK DE LEITURA, sem migração: enquanto `vitrine_tv`
 * não existir no banco, a TV mostra exatamente o que mostra hoje. A primeira
 * publicação na tela nova cria a linha e aposenta a herança.
 */
describe("a TV lê a lista dela", () => {
  const vitrine = lerCodigo("src/app/vitrine/page.tsx");

  it("prefere a lista própria", () => {
    expect(vitrine).toMatch(/settings\.vitrineTv/);
  });

  it("cai na herança do banner enquanto a linha nova não existe", () => {
    expect(vitrine).toMatch(/carouselVehicleIds/);
  });

  it("a preferência vem ANTES da herança", () => {
    const iPropria = vitrine.indexOf("vitrineTv");
    const iHeranca = vitrine.indexOf("carouselVehicleIds");
    expect(iPropria).toBeGreaterThanOrEqual(0);
    expect(iPropria).toBeLessThan(iHeranca);
  });
});

describe("a fiação do campo novo", () => {
  it("settings lê a linha vitrine_tv", () => {
    const settings = lerCodigo("src/lib/settings.ts");
    expect(settings).toMatch(/"vitrine_tv"/);
    expect(settings).toMatch(/vitrineTv,/);
  });

  it("a rota aceita e grava o campo", () => {
    const rota = lerCodigo("src/app/api/settings/route.ts");
    expect(rota).toMatch(/vitrineTv/);
    expect(rota).toMatch(/id: "vitrine_tv"/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/vitrine-lista-propria.test.ts`
Expected: FAIL nos cinco.

- [ ] **Step 3: Ler a linha nova em `settings.ts`**

Três edições em `src/lib/settings.ts`:

(a) Ao lado de `let destaquesDaSemana = null;` (~linha 28):

```ts
    let vitrineTv = null;
```

(b) Ao lado de `const destaquesDaSemanaRow = ...` (~linha 74):

```ts
          // A curadoria da TV do showroom, separada da do banner desde
          // 2026-09-22. As duas viveram na mesma linha (`carousel_vehicles`)
          // até ali, com tetos incompatíveis: 3 slides na home contra a lista
          // inteira na TV. Ver a spec de 2026-09-21.
          const vitrineTvRow = data.find((row) => row.id === "vitrine_tv");
```

(c) Ao lado de `if (destaquesDaSemanaRow) ...` (~linha 93):

```ts
          if (vitrineTvRow) vitrineTv = vitrineTvRow.data;
```

(d) No objeto de retorno, ao lado de `destaquesDaSemana,`:

```ts
      vitrineTv,
```

- [ ] **Step 4: Aceitar e gravar na rota**

Em `src/app/api/settings/route.ts`, acrescentar `vitrineTv` à desestruturação do corpo, logo após `destaquesDaSemana,`:

```ts
      destaquesDaSemana,
      vitrineTv,
```

E, logo depois do bloco `if (destaquesDaSemana) { ... }`, acrescentar o bloco gêmeo:

```ts
      // A curadoria da TV do showroom. Linha própria desde 2026-09-22: ela e o
      // banner da home tinham tetos incompatíveis dividindo a mesma lista.
      if (vitrineTv) {
        const { error } = await requestSupabase
          .from("site_settings")
          .upsert({ id: "vitrine_tv", data: vitrineTv, updated_at: new Date().toISOString() });
        if (error) {
          console.error("[Settings API] Supabase write error for vitrineTv:", error.message);
          return NextResponse.json({ error: `Falha ao salvar a vitrine da TV: ${error.message}` }, { status: 500 });
        }
      }
```

- [ ] **Step 5: Preferir a lista própria na TV**

Em `src/app/vitrine/page.tsx`, trocar o bloco das linhas 31-35:

```ts
  // A vitrine mostra a mesma curadoria do carrossel da home quando ela existe.
  const curados = Array.isArray(settings.carouselVehicleIds)
    ? (settings.carouselVehicleIds as string[])
        .map((id) => disponiveis.find((v) => v.id === id))
        .filter((v): v is NonNullable<typeof v> => Boolean(v))
    : [];
```

por:

```ts
  // A TV tem lista PRÓPRIA desde 2026-09-22.
  //
  // Até ali ela dividia `carousel_vehicles` com o banner da home, e os dois
  // tinham capacidades incompatíveis: o banner corta em `VAGAS.banner`, a TV
  // mostra a lista inteira paginada. Curar para um estragava o outro — medido
  // em 21/09, a lista tinha 9 ids e 5 eram carros arquivados ou vendidos.
  //
  // ⚠️ O `??` é HERANÇA, com prazo: enquanto a linha `vitrine_tv` não existir
  // no banco, a TV mostra exatamente o que mostrava antes. A primeira
  // publicação em /admin/site/destaques cria a linha, e aí esta queda pode
  // sair daqui.
  const idsDaTv = Array.isArray(settings.vitrineTv)
    ? (settings.vitrineTv as string[])
    : Array.isArray(settings.carouselVehicleIds)
      ? (settings.carouselVehicleIds as string[])
      : [];

  const curados = idsDaTv
    .map((id) => disponiveis.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/vitrine-lista-propria.test.ts`
Expected: PASS — 5 testes.

Run: `npm test`
Expected: +5 testes novos, e a suíte inteira continua verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/settings.ts src/app/api/settings/route.ts src/app/vitrine/page.tsx tests/vitrine-lista-propria.test.ts
git commit -m "feat(vitrine): a TV do showroom ganha lista propria, com heranca temporaria"
```

---

### Task 6: Os filtros novos em `filtrarLinhas`

**Files:**
- Modify: `src/lib/estoqueTabela.ts:397-412` e a interface `LinhaDeEstoque` (~:63)
- Modify: `src/app/admin/estoque/page.tsx` (alimentar `naTv`)
- Create: `tests/estoque-filtros.test.ts`

**Interfaces:**
- Consumes: `settings.vitrineTv` da Task 5.
- Produces: `OpcoesDeFiltro` e a `filtrarLinhas` alargada; `LinhaDeEstoque.naTv`. A Task 7 desenha os controles em cima disto.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/estoque-filtros.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filtrarLinhas } from "../src/lib/estoqueTabela";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * A tabela filtrava por ESTADO e por TEXTO, e mais nada. Com 119 linhas, a
 * pergunta "quem já está nos destaques?" não tinha resposta na tela: a única
 * pista era uma etiqueta miúda dentro da linha.
 */
const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({
    id,
    marca: "Fiat",
    modelo: "Toro",
    versao: "",
    placa: "",
    preco: 100000,
    estado: "publicado",
    tipo: "Picape",
    destacado: false,
    naSemana: false,
    naTv: false,
    leads: 0,
    visitas: 0,
    diasEmEstoque: 10,
    ...over,
  }) as unknown as LinhaDeEstoque;

describe("filtrarLinhas — a trava que protege o padrão", () => {
  it("sem nenhuma opção, devolve tudo", () => {
    const linhas = [linha("a"), linha("b", { estado: "vendido" })];
    expect(filtrarLinhas(linhas)).toHaveLength(2);
  });

  it("objeto de opções vazio também devolve tudo", () => {
    const linhas = [linha("a"), linha("b")];
    expect(filtrarLinhas(linhas, {})).toHaveLength(2);
  });
});

describe("filtro por destaque", () => {
  const linhas = [
    linha("banner", { destacado: true }),
    linha("grade", { naSemana: true }),
    linha("tv", { naTv: true }),
    linha("nenhum"),
  ];

  it("banner", () => {
    expect(filtrarLinhas(linhas, { destaque: "banner" }).map((l) => l.id)).toEqual(["banner"]);
  });

  it("grade", () => {
    expect(filtrarLinhas(linhas, { destaque: "grade" }).map((l) => l.id)).toEqual(["grade"]);
  });

  it("tv", () => {
    expect(filtrarLinhas(linhas, { destaque: "tv" }).map((l) => l.id)).toEqual(["tv"]);
  });

  it("qualquer pega os três", () => {
    expect(filtrarLinhas(linhas, { destaque: "qualquer" })).toHaveLength(3);
  });

  it("nenhum é a pergunta inversa — de onde sai o próximo rodízio", () => {
    expect(filtrarLinhas(linhas, { destaque: "nenhum" }).map((l) => l.id)).toEqual(["nenhum"]);
  });
});

describe("filtro por preço", () => {
  const linhas = [
    linha("barato", { preco: 30000 }),
    linha("medio", { preco: 60000 }),
    linha("caro", { preco: 200000 }),
    linha("sem", { preco: null }),
  ];

  it("mínimo", () => {
    expect(filtrarLinhas(linhas, { precoMin: 50000 }).map((l) => l.id)).toEqual(["medio", "caro"]);
  });

  it("máximo", () => {
    expect(filtrarLinhas(linhas, { precoMax: 100000 }).map((l) => l.id)).toEqual(["barato", "medio"]);
  });

  it("faixa", () => {
    expect(filtrarLinhas(linhas, { precoMin: 50000, precoMax: 100000 }).map((l) => l.id)).toEqual(["medio"]);
  });

  it("carro sem preço não entra numa faixa de preço", () => {
    expect(filtrarLinhas(linhas, { precoMin: 1 }).map((l) => l.id)).not.toContain("sem");
  });
});

describe("filtro por marca e carroceria", () => {
  const linhas = [
    linha("f", { marca: "Fiat", tipo: "Picape" }),
    linha("v", { marca: "Volkswagen", tipo: "Hatch" }),
  ];

  it("marca, sem diferenciar caixa", () => {
    expect(filtrarLinhas(linhas, { marca: "fiat" }).map((l) => l.id)).toEqual(["f"]);
  });

  it("carroceria", () => {
    expect(filtrarLinhas(linhas, { tipo: "Hatch" }).map((l) => l.id)).toEqual(["v"]);
  });
});

describe("filtro por tempo e desempenho", () => {
  const linhas = [
    linha("novo", { diasEmEstoque: 5, leads: 3, visitas: 40 }),
    linha("parado", { diasEmEstoque: 120, leads: 0, visitas: 0 }),
    linha("semdado", { diasEmEstoque: null, visitas: null }),
  ];

  it("parado há N dias ou mais", () => {
    expect(filtrarLinhas(linhas, { paradoHaDias: 90 }).map((l) => l.id)).toEqual(["parado"]);
  });

  it("sem lead", () => {
    expect(filtrarLinhas(linhas, { semLead: true }).map((l) => l.id)).toContain("parado");
    expect(filtrarLinhas(linhas, { semLead: true }).map((l) => l.id)).not.toContain("novo");
  });

  it("sem visita", () => {
    expect(filtrarLinhas(linhas, { semVisita: true }).map((l) => l.id)).toContain("parado");
  });

  it("visitas nulas (GA4 mudo) NÃO escondem a linha", () => {
    // Sem credencial, `visitas` é null em toda linha — tratar null como zero
    // faria este filtro esconder o estoque inteiro de uma vez.
    expect(filtrarLinhas(linhas, { semVisita: true }).map((l) => l.id)).not.toContain("semdado");
  });
});

describe("filtros combinados", () => {
  it("estado e preço juntos", () => {
    const linhas = [
      linha("a", { estado: "publicado", preco: 30000 }),
      linha("b", { estado: "publicado", preco: 200000 }),
      linha("c", { estado: "vendido", preco: 30000 }),
    ];
    expect(
      filtrarLinhas(linhas, { estado: "publicado", precoMax: 50000 }).map((l) => l.id),
    ).toEqual(["a"]);
  });

  it("destaque e parado juntos — o carro destacado que não gira", () => {
    const linhas = [
      linha("a", { destacado: true, diasEmEstoque: 200 }),
      linha("b", { destacado: true, diasEmEstoque: 3 }),
    ];
    expect(
      filtrarLinhas(linhas, { destaque: "banner", paradoHaDias: 90 }).map((l) => l.id),
    ).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/estoque-filtros.test.ts`
Expected: FAIL — as opções novas são ignoradas, então os filtros devolvem tudo.

- [ ] **Step 3: Acrescentar `naTv` à linha**

Em `src/lib/estoqueTabela.ts`, na interface `LinhaDeEstoque`, ao lado de `naSemana`:

```ts
  /**
   * Está na lista da TV do showroom.
   *
   * Irmão de `destacado` (banner) e `naSemana` (grade). Os três existem
   * separados porque desde 2026-09-22 são três listas com três destinos — e
   * era a fusão de duas delas que fazia o painel e o site discordarem.
   */
  naTv: boolean;
```

**⚠️ Campo obrigatório quebra um dublê tipado — corrigir no mesmo passo.**
`tests/estoque-tabela.test.ts:68` é `function linha(parcial): LinhaDeEstoque`
devolvendo um objeto literal COMPLETO, e o `tsconfig` checa `**/*.ts`. Sem
esta linha, `npm run build` falha com "Property 'naTv' is missing". Acrescentar
logo depois de `naSemana: false,` (linha 91):

```ts
    naTv: false,
```

É o único dublê tipado assim no repositório — os demais usam
`as unknown as LinhaDeEstoque`, onde campo ausente é `undefined` e, portanto,
falso.

- [ ] **Step 4: Alargar `filtrarLinhas`**

Trocar o bloco de `filtrarLinhas` (`:397-412`) por:

```ts
export interface OpcoesDeFiltro {
  estado?: FiltroDeEstado;
  busca?: string;
  /** Em que lista de curadoria o carro está — ou em nenhuma. */
  destaque?: "banner" | "grade" | "tv" | "qualquer" | "nenhum";
  precoMin?: number;
  precoMax?: number;
  /** Marca exata, sem diferenciar caixa nem acento. */
  marca?: string;
  /** Carroceria exata, mesma regra. */
  tipo?: string;
  /** Parado há N dias OU MAIS. */
  paradoHaDias?: number;
  semLead?: boolean;
  semVisita?: boolean;
}

/**
 * O recorte da tabela de estoque.
 *
 * ---------------------------------------------------------------------------
 * Toda opção é opcional, e ausente quer dizer "não filtra"
 * ---------------------------------------------------------------------------
 * A tela monta o objeto a partir de controles que começam vazios. Se qualquer
 * opção ausente passasse a significar um valor (zero, "todos", `false`), abrir
 * a tela já esconderia linhas — e o operador não teria como saber por quê. É a
 * mesma classe de defeito que o corte silencioso dos destaques: some gente sem
 * dizer. O teste "sem nenhuma opção, devolve tudo" é a trava disso.
 *
 * `visitas: null` NÃO é zero. Sem credencial de leitura do GA4 a coluna inteira
 * é nula, e tratar nulo como zero faria `semVisita` esconder o estoque todo de
 * uma vez. Quem não tem dado não responde à pergunta — fica fora do recorte.
 */
export function filtrarLinhas(
  linhas: LinhaDeEstoque[],
  opcoes: OpcoesDeFiltro = {},
): LinhaDeEstoque[] {
  const estado = opcoes.estado ?? "todos";
  const busca = normalizarBusca(opcoes.busca ?? "");
  const marca = opcoes.marca ? normalizarBusca(opcoes.marca) : "";
  const tipo = opcoes.tipo ? normalizarBusca(opcoes.tipo) : "";

  return linhas.filter((l) => {
    if (estado !== "todos" && l.estado !== estado) return false;

    if (busca) {
      const alvo = normalizarBusca(
        [l.marca, l.modelo, l.versao, l.id, l.placa].filter(Boolean).join(" "),
      );
      if (!alvo.includes(busca)) return false;
    }

    if (opcoes.destaque) {
      const emAlguma = l.destacado || l.naSemana || l.naTv;
      if (opcoes.destaque === "banner" && !l.destacado) return false;
      if (opcoes.destaque === "grade" && !l.naSemana) return false;
      if (opcoes.destaque === "tv" && !l.naTv) return false;
      if (opcoes.destaque === "qualquer" && !emAlguma) return false;
      if (opcoes.destaque === "nenhum" && emAlguma) return false;
    }

    // Carro sem preço não entra em faixa de preço: ele não responde à
    // pergunta, e devolvê-lo encheria o recorte de linha que o operador
    // pediu para excluir.
    if (opcoes.precoMin !== undefined) {
      if (l.preco === null || l.preco < opcoes.precoMin) return false;
    }
    if (opcoes.precoMax !== undefined) {
      if (l.preco === null || l.preco > opcoes.precoMax) return false;
    }

    if (marca && normalizarBusca(l.marca ?? "") !== marca) return false;
    if (tipo && normalizarBusca(l.tipo ?? "") !== tipo) return false;

    if (opcoes.paradoHaDias !== undefined) {
      if (l.diasEmEstoque === null || l.diasEmEstoque < opcoes.paradoHaDias) return false;
    }

    if (opcoes.semLead && l.leads !== 0) return false;
    // `!== 0` e não `> 0`: null cai fora, que é o comportamento pedido.
    if (opcoes.semVisita && l.visitas !== 0) return false;

    return true;
  });
}
```

- [ ] **Step 5: Alimentar `naTv` na página**

Em `src/app/admin/estoque/page.tsx`, ao lado de `const naSemana = ...`:

```ts
  const naTv = Array.isArray(settings.vitrineTv)
    ? (settings.vitrineTv as string[]).map(String)
    : [];
```

E dentro do `map` que monta a linha, ao lado de `naSemana: naSemana.includes(id),`:

```ts
      naTv: naTv.includes(id),
```

E passar ao componente, ao lado de `naSemanaIniciais`:

```tsx
      naTvIniciais={naTv}
```

Em `src/components/admin/TabelaDeEstoque.tsx`, acrescentar a prop à interface (ao lado de `naSemanaIniciais: string[];`) e ao destructuring, com o estado:

```ts
  naTvIniciais: string[];
```

```ts
  naTvIniciais,
```

```ts
  const [naTv, setNaTv] = useState<string[]>(naTvIniciais);
```

Por ora `naTv` é só lido — a Task 7 liga os controles. Para o `eslint` não acusar `setNaTv` sem uso, já deixar o par de ações da TV, gêmeo dos existentes:

```ts
  /** A curadoria da TV do showroom. Gêmea das outras duas, terceiro destino. */
  const alternarDestaqueNaTv = async (marcar: boolean) => {
    if (selecionadosVisiveis.length === 0) return;
    const proximos = marcar
      ? [...new Set([...naTv, ...selecionadosVisiveis])]
      : naTv.filter((id) => !selecionadosVisiveis.includes(id));

    const anterior = naTv;
    setNaTv(proximos);
    setLinhas((prev) => prev.map((l) => ({ ...l, naTv: proximos.includes(l.id) })));

    const ok = await salvarSettings(
      { vitrineTv: proximos },
      marcar ? "Postos na TV do showroom" : "Tirados da TV do showroom",
    );
    if (!ok) {
      setNaTv(anterior);
      setLinhas((prev) => prev.map((l) => ({ ...l, naTv: anterior.includes(l.id) })));
    }
  };
```

E os dois botões, logo depois do par da grade:

```tsx
          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueNaTv(true)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Pôr na TV do showroom
          </button>
          <button
            disabled={semSelecao}
            onClick={() => alternarDestaqueNaTv(false)}
            className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Tirar da TV
          </button>
```

E na etiqueta da linha (~:836), ao lado das outras duas:

```tsx
                          {l.naTv && <span className="text-mt-accent">· na TV</span>}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/estoque-filtros.test.ts`
Expected: PASS — 20 testes.

Run: `npm test`
Expected: +20 testes novos, e a suíte inteira continua verde. Qualquer teste que monte `LinhaDeEstoque` sem `naTv` continua passando — os dublês são `as unknown as`, e `undefined` é falso.

- [ ] **Step 7: Commit**

```bash
git add src/lib/estoqueTabela.ts src/app/admin/estoque/page.tsx src/components/admin/TabelaDeEstoque.tsx tests/estoque-filtros.test.ts
git commit -m "feat(estoque): filtros de destaque, preco, marca e desempenho"
```

---

### Task 7: A tela `/admin/site/destaques`

**Files:**
- Create: `src/app/admin/site/destaques/page.tsx`
- Create: `src/components/admin/CuradoriaDeDestaques.tsx`
- Modify: `src/components/admin/SidebarNav.tsx:135`
- Create: `tests/curadoria-de-destaques.test.ts`

**Interfaces:**
- Consumes: tudo da Task 1; `settings.vitrineTv` da Task 5; `LinhaDeEstoque` e `classificarEstado` de `estoqueTabela.ts`.
- Produces: a tela. Nada depende dela.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/curadoria-de-destaques.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CuradoriaDeDestaques from "../src/components/admin/CuradoriaDeDestaques";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({ id, marca: "Fiat", modelo: "Toro", versao: "", preco: 100000, estado: "publicado", ...over }) as unknown as LinhaDeEstoque;

const padrao = {
  bannerInicial: ["a", "b"],
  gradeInicial: [] as string[],
  tvInicial: ["a"],
  linhas: [linha("a"), linha("b")],
};

describe("a tela mostra as três listas separadas", () => {
  it("nomeia os três destinos", () => {
    render(<CuradoriaDeDestaques {...padrao} />);
    expect(screen.getByText(/banner da home/i)).toBeTruthy();
    expect(screen.getByText(/grade da semana/i)).toBeTruthy();
    expect(screen.getByText(/TV do showroom/i)).toBeTruthy();
  });

  it("a grade vazia diz que está sendo sorteada, em vez de ficar em branco", () => {
    render(<CuradoriaDeDestaques {...padrao} />);
    expect(screen.getByText(/sendo sorteadas/i)).toBeTruthy();
  });
});

describe("a linha de corte", () => {
  it("aparece quando há mais vivos do que vagas no banner", () => {
    render(
      <CuradoriaDeDestaques
        {...padrao}
        bannerInicial={["a", "b", "c", "d", "e"]}
        linhas={["a", "b", "c", "d", "e"].map((i) => linha(i))}
      />,
    );
    expect(screen.getByText(/NÃO aparece no banner/i)).toBeTruthy();
  });

  it("não aparece quando tudo cabe", () => {
    render(<CuradoriaDeDestaques {...padrao} />);
    expect(screen.queryByText(/NÃO aparece no banner/i)).toBeNull();
  });

  it("a TV não tem linha de corte — tem tempo de volta", () => {
    render(<CuradoriaDeDestaques {...padrao} />);
    expect(screen.getByText(/volta completa/i)).toBeTruthy();
  });
});

describe("os mortos", () => {
  it("são listados com o motivo e uma ação de limpeza", () => {
    render(
      <CuradoriaDeDestaques
        {...padrao}
        bannerInicial={["a", "morto"]}
        linhas={[linha("a"), linha("morto", { estado: "arquivado" })]}
      />,
    );
    expect(screen.getByText(/saíram do estoque/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /limpar/i })).toBeTruthy();
  });

  it("a tela diz que limpar não muda o que está no ar", () => {
    render(
      <CuradoriaDeDestaques
        {...padrao}
        bannerInicial={["a", "morto"]}
        linhas={[linha("a"), linha("morto", { estado: "arquivado" })]}
      />,
    );
    expect(screen.getByText(/não muda nada do que está no ar/i)).toBeTruthy();
  });
});

describe("ordenar", () => {
  it("subir o segundo o põe em primeiro, e marca a tela como não publicada", () => {
    render(<CuradoriaDeDestaques {...padrao} />);
    fireEvent.click(screen.getAllByLabelText(/mover .* para cima/i)[1]);
    expect(screen.getByText(/não publicada/i)).toBeTruthy();
  });

  it("começa sem nada pendente", () => {
    render(<CuradoriaDeDestaques {...padrao} />);
    expect(screen.queryByText(/não publicada/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/curadoria-de-destaques.test.ts`
Expected: FAIL — `Failed to resolve import ".../CuradoriaDeDestaques"`.

- [ ] **Step 3: Escrever o componente**

Criar `src/components/admin/CuradoriaDeDestaques.tsx`. Molde de `AreasDoSite.tsx`: `config`/`salvo`/`sujo`, aviso de saída, um `publicar` que manda as três listas.

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  VAGAS,
  limparForaDoAr,
  montarPainelDeDestaques,
  moverDestaque,
  removerDestaque,
  voltaCompletaEmSegundos,
  type ItemDestacado,
  type Vitrine,
} from "../../lib/destaquesDoPainel";
import type { LinhaDeEstoque } from "../../lib/estoqueTabela";

/**
 * A curadoria dos destaques — as três listas, com ordem.
 *
 * ---------------------------------------------------------------------------
 * Por que esta tela existe
 * ---------------------------------------------------------------------------
 * Marcar destaque era append-only e o site cortava em silêncio. Medido em
 * 2026-09-21: 9 ids no banner, 5 deles de carros arquivados ou vendidos, e o
 * carro marcado por último nunca chegava à home — sem erro, sem aviso, com o
 * painel pintando "salvo" em verde.
 *
 * Três decisões de desenho, todas contra esse silêncio:
 *
 * 1. **As três listas juntas, e rotuladas.** Elas ficam lado a lado porque são
 *    SEPARADAS: a confusão entre "destacar na home" e "pôr nos destaques da
 *    semana" é metade do defeito.
 * 2. **A linha de corte é desenhada.** O que o site descarta passa a ter régua
 *    escrita em cima, com o rótulo verdadeiro daquela vitrine.
 * 3. **Os mortos aparecem.** Eram invisíveis no painel e entupiam a lista.
 *
 * Setas em vez de arrastar, como em `AreasDoSite`: funciona no toque e no
 * teclado, sem biblioteca.
 */
interface Props {
  bannerInicial: string[];
  gradeInicial: string[];
  tvInicial: string[];
  linhas: LinhaDeEstoque[];
}

interface Listas {
  banner: string[];
  grade: string[];
  tv: string[];
}

const TITULO: Record<Vitrine, string> = {
  banner: "Banner da home",
  grade: "Grade da semana",
  tv: "TV do showroom",
};

const VAZIO: Record<Vitrine, string> = {
  banner: "Nenhum carro curado. O banner está mostrando os primeiros do estoque.",
  grade: "Nenhum carro curado. As 6 vagas estão sendo sorteadas.",
  tv: "Nenhum carro curado. A TV está mostrando uma página do estoque.",
};

function formatarPreco(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function CuradoriaDeDestaques({
  bannerInicial,
  gradeInicial,
  tvInicial,
  linhas,
}: Props) {
  const inicial: Listas = { banner: bannerInicial, grade: gradeInicial, tv: tvInicial };
  const [listas, setListas] = useState<Listas>(inicial);
  const [salvo, setSalvo] = useState<Listas>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const sujo = JSON.stringify(listas) !== JSON.stringify(salvo);

  useEffect(() => {
    if (!sujo) return;
    const ao = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ao);
    return () => window.removeEventListener("beforeunload", ao);
  }, [sujo]);

  const painel: Record<Vitrine, ItemDestacado[]> = {
    banner: montarPainelDeDestaques(listas.banner, linhas, "banner"),
    grade: montarPainelDeDestaques(listas.grade, linhas, "grade"),
    tv: montarPainelDeDestaques(listas.tv, linhas, "tv"),
  };

  const mortos = (["banner", "grade", "tv"] as Vitrine[]).flatMap((v) =>
    painel[v].filter((i) => i.destino === "fora_do_ar").map((i) => ({ ...i, vitrine: v })),
  );

  const publicar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carouselVehicleIds: listas.banner,
          destaquesDaSemana: listas.grade,
          vitrineTv: listas.tv,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao publicar os destaques");
      setSalvo(listas);
      setAviso("Publicado — a home e a TV já refletem a nova ordem.");
      setTimeout(() => setAviso(""), 4000);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const limparTodos = () => {
    setListas({
      banner: limparForaDoAr(listas.banner, linhas),
      grade: limparForaDoAr(listas.grade, linhas),
      tv: limparForaDoAr(listas.tv, linhas),
    });
  };

  const secao = (vitrine: Vitrine) => {
    const itens = painel[vitrine].filter((i) => i.destino !== "fora_do_ar");
    const teto = VAGAS[vitrine];

    return (
      <section key={vitrine} className="flex flex-col gap-3 border-b-2 border-mt-regua pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="mt-titulo text-xl">{TITULO[vitrine]}</h2>
          <span className="text-[11px] uppercase tracking-[.1em] text-mt-neutral-700">
            {teto === null
              ? `sem teto · volta completa: ${voltaCompletaEmSegundos(itens.length)} segundos`
              : `${teto} vagas`}
          </span>
        </div>

        {itens.length === 0 ? (
          <p className="text-sm text-mt-neutral-800">{VAZIO[vitrine]}</p>
        ) : (
          <ol className="flex flex-col">
            {itens.map((item) => (
              <li key={item.id}>
                {teto !== null && item.posicaoViva === teto + 1 && (
                  <div className="my-2 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.1em] text-mt-accent">
                    <span className="h-px flex-1 bg-mt-accent" />
                    daqui para baixo NÃO aparece no {vitrine === "banner" ? "banner" : "grade"}
                    <span className="h-px flex-1 bg-mt-accent" />
                  </div>
                )}
                <div className="flex items-center gap-3 border-b border-mt-regua-fina py-2">
                  <span className="w-6 text-[11px] font-bold text-mt-neutral-700">
                    {item.posicaoViva}
                  </span>
                  <button
                    onClick={() => setListas({ ...listas, [vitrine]: moverDestaque(listas[vitrine], item.id, "cima") })}
                    aria-label={`Mover ${item.rotulo} para cima`}
                    className="mt-foco cursor-pointer px-1 text-mt-neutral-700 hover:text-mt-ink"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => setListas({ ...listas, [vitrine]: moverDestaque(listas[vitrine], item.id, "baixo") })}
                    aria-label={`Mover ${item.rotulo} para baixo`}
                    className="mt-foco cursor-pointer px-1 text-mt-neutral-700 hover:text-mt-ink"
                  >
                    ▼
                  </button>
                  <span className="flex-1 truncate text-sm text-mt-ink">{item.rotulo}</span>
                  <span className="text-sm text-mt-neutral-800">{formatarPreco(item.preco)}</span>
                  <button
                    onClick={() => setListas({ ...listas, [vitrine]: removerDestaque(listas[vitrine], item.id) })}
                    aria-label={`Tirar ${item.rotulo} de ${TITULO[vitrine]}`}
                    className="mt-foco cursor-pointer px-2 text-mt-neutral-700 hover:text-mt-accent"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  };

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Site</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Destaques</h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            Três listas, três destinos. Use as setas para ordenar — o que passa da última
            vaga fica marcado e não aparece. Carros entram por “Estoque”.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sujo && (
            <span className="text-[11px] font-semibold text-mt-accent-800">
              Alteração não publicada
            </span>
          )}
          <button
            onClick={() => setListas(salvo)}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-45"
          >
            Descartar
          </button>
          <button
            onClick={publicar}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[11px] disabled:opacity-45"
          >
            {salvando ? "Publicando…" : "Publicar alterações"}
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-mt-accent-800">{erro}</p>}
      {aviso && <p className="text-sm text-mt-neutral-800">{aviso}</p>}

      {(["banner", "grade", "tv"] as Vitrine[]).map(secao)}

      {mortos.length > 0 && (
        <section className="flex flex-col gap-2 border border-mt-accent-300 bg-mt-accent-100 p-4">
          <h2 className="text-sm font-bold text-mt-accent-800">
            {mortos.length} marcados saíram do estoque
          </h2>
          <p className="text-[12px] text-mt-neutral-800">
            Eles não aparecem em lugar nenhum. Limpar <strong>não muda nada do que está no
            ar</strong> — o site já os descarta antes de montar qualquer vitrine.
          </p>
          <ul className="text-[12px] text-mt-neutral-800">
            {mortos.map((m) => (
              <li key={`${m.vitrine}-${m.id}`}>
                {m.rotulo} — {m.motivoForaDoAr} ({TITULO[m.vitrine]})
              </li>
            ))}
          </ul>
          <button
            onClick={limparTodos}
            className="mt-btn mt-btn-contorno mt-foco w-fit cursor-pointer px-4 py-2 text-[11px]"
          >
            Limpar os {mortos.length}
          </button>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Escrever a página do servidor**

Criar `src/app/admin/site/destaques/page.tsx`:

```tsx
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { getCachedSettings } from "../../../../lib/settings";
import { classificarEstado, versaoParaExibir, type LinhaDeEstoque } from "../../../../lib/estoqueTabela";
import { mapVeiculoDbToVeiculo } from "../../../../lib/supabase";
import CuradoriaDeDestaques from "../../../../components/admin/CuradoriaDeDestaques";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Destaques — Motors Store",
  description: "Ordem e curadoria do banner da home, da grade da semana e da TV do showroom.",
};

/**
 * A tela de curadoria. Irmã de `/admin/site/areas` — mesmo molde de setas e de
 * publicação.
 *
 * Lê o estoque INTEIRO, e não só o publicado: a lista gravada pode conter
 * carros que já saíram do ar, e é justamente para poder mostrá-los (e
 * limpá-los) que eles precisam chegar aqui.
 */
export default async function DestaquesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: brutos }, settings] = await Promise.all([
    supabase.from("estoque_motors").select("*"),
    getCachedSettings(),
  ]);

  const linhas: LinhaDeEstoque[] = ((brutos ?? []) as Array<Record<string, any>>).map((bruto) => {
    const v = mapVeiculoDbToVeiculo(bruto);
    const promocional = Number(v.preco_promocional || 0);
    const cheio = Number(v.preco_original || 0);
    return {
      id: String(bruto.id),
      marca: v.marca,
      modelo: v.modelo,
      versao: versaoParaExibir(v.modelo, v.versao),
      preco: promocional > 0 && promocional < cheio ? promocional : cheio || null,
      estado: classificarEstado(bruto),
    } as unknown as LinhaDeEstoque;
  });

  const lista = (valor: unknown): string[] =>
    Array.isArray(valor) ? (valor as string[]).map(String) : [];

  return (
    <CuradoriaDeDestaques
      bannerInicial={lista(settings.carouselVehicleIds)}
      gradeInicial={lista(settings.destaquesDaSemana)}
      tvInicial={lista(settings.vitrineTv)}
      linhas={linhas}
    />
  );
}
```

- [ ] **Step 5: Pôr no menu**

Em `src/components/admin/SidebarNav.tsx:135`, logo depois de `{ name: "Áreas e conteúdo", href: "/admin/site/areas" },`:

```ts
        { name: "Destaques", href: "/admin/site/destaques" },
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/curadoria-de-destaques.test.ts`
Expected: PASS — 9 testes.

Run: `npm test`
Expected: +9 testes novos, e a suíte inteira continua verde.

Run: `npm run build`
Expected: compila; a rota `/admin/site/destaques` aparece na listagem.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/site/destaques src/components/admin/CuradoriaDeDestaques.tsx src/components/admin/SidebarNav.tsx tests/curadoria-de-destaques.test.ts
git commit -m "feat(destaques): a tela de curadoria, com ordem e linha de corte"
```

---

### Task 8: O painel de filtros na tabela de estoque

**Files:**
- Modify: `src/components/admin/TabelaDeEstoque.tsx` (estado, `useMemo` do filtro, e o painel abaixo da régua de chips ~:499-545)
- Create: `tests/painel-de-filtros.test.ts`

**Interfaces:**
- Consumes: `OpcoesDeFiltro` e `filtrarLinhas` da Task 6.
- Produces: nada.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/painel-de-filtros.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * Os chips de estado ficam onde estão — são a pergunta mais frequente da tela.
 * O que entra é um segundo nível, recolhível, com o que faltava.
 */
describe("o painel de filtros", () => {
  const tabela = lerCodigo("src/components/admin/TabelaDeEstoque.tsx");

  it("filtra por destaque", () => {
    expect(tabela).toMatch(/destaque:/);
  });

  it("filtra por faixa de preço", () => {
    expect(tabela).toMatch(/precoMin/);
    expect(tabela).toMatch(/precoMax/);
  });

  it("filtra por marca e por carroceria", () => {
    expect(tabela).toMatch(/marca:/);
    expect(tabela).toMatch(/tipo:/);
  });

  it("filtra por tempo parado e por desempenho", () => {
    expect(tabela).toMatch(/paradoHaDias/);
    expect(tabela).toMatch(/semLead/);
    expect(tabela).toMatch(/semVisita/);
  });

  it("as marcas saem do estoque carregado, não de uma constante", () => {
    // Lista fixa ofereceria marca que a loja não tem e esconderia a que ela tem.
    expect(tabela).toMatch(/new Set\(linhas\.map\(\(l\) => l\.marca\)/);
  });

  it("o controle de visitas some quando o GA4 está mudo", () => {
    expect(tabela).toMatch(/visitasDisponiveis &&/);
  });

  it("um botão limpa o recorte inteiro", () => {
    expect(tabela).toMatch(/Limpar filtros/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/painel-de-filtros.test.ts`
Expected: FAIL nos sete.

- [ ] **Step 3: Estado e ligação do filtro**

Em `TabelaDeEstoque.tsx`, ao lado de `const [busca, setBusca] = useState("");`:

```ts
  /** O segundo nível do recorte. Começa TODO vazio — ver a nota de
   *  `filtrarLinhas`: opção ausente é "não filtra", e um padrão que filtrasse
   *  esconderia linha na abertura da tela sem dizer por quê. */
  const [extras, setExtras] = useState<Omit<OpcoesDeFiltro, "estado" | "busca">>({});
  const [painelAberto, setPainelAberto] = useState(false);
```

Trocar o `useMemo` de `filtradas` (~:171):

```ts
  const filtradas = useMemo(
    () => filtrarLinhas(linhas, { estado: filtro, busca, ...extras }),
    [linhas, filtro, busca, extras],
  );
```

Importar o tipo junto dos outros de `estoqueTabela`:

```ts
  type OpcoesDeFiltro,
```

E as listas do estoque, ao lado dos outros `useMemo`:

```ts
  // Do estoque carregado, e não de uma constante: lista fixa ofereceria marca
  // que a loja não tem e esconderia a que ela tem.
  const marcas = useMemo(
    () => [...new Set(linhas.map((l) => l.marca).filter(Boolean))].sort(),
    [linhas],
  );
  const tipos = useMemo(
    () => [...new Set(linhas.map((l) => l.tipo).filter(Boolean))].sort(),
    [linhas],
  );
```

- [ ] **Step 4: Desenhar o painel**

Logo depois do bloco da régua de chips + busca (~:545), acrescentar:

```tsx
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setPainelAberto((a) => !a)}
          className="mt-foco w-fit cursor-pointer text-[11px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:text-mt-ink"
        >
          {painelAberto ? "− Menos filtros" : "+ Mais filtros"}
          {Object.keys(extras).length > 0 && ` (${Object.keys(extras).length})`}
        </button>

        {painelAberto && (
          <div className="flex flex-wrap items-end gap-4 border border-mt-regua-fina p-4">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-700">
              Nos destaques
              <select
                value={extras.destaque ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setExtras({ ...extras, destaque: (v || undefined) as OpcoesDeFiltro["destaque"] });
                  setVisiveis(PASSO_DA_PAGINA);
                }}
                className="mt-foco border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[11px] text-mt-ink"
              >
                <option value="">Tanto faz</option>
                <option value="qualquer">Em alguma lista</option>
                <option value="banner">No banner da home</option>
                <option value="grade">Na grade da semana</option>
                <option value="tv">Na TV do showroom</option>
                <option value="nenhum">Em nenhuma</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-700">
              Preço de
              <input
                type="number"
                value={extras.precoMin ?? ""}
                onChange={(e) =>
                  setExtras({ ...extras, precoMin: e.target.value ? Number(e.target.value) : undefined })
                }
                className="mt-foco w-28 border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[11px] text-mt-ink"
              />
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-700">
              até
              <input
                type="number"
                value={extras.precoMax ?? ""}
                onChange={(e) =>
                  setExtras({ ...extras, precoMax: e.target.value ? Number(e.target.value) : undefined })
                }
                className="mt-foco w-28 border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[11px] text-mt-ink"
              />
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-700">
              Marca
              <select
                value={extras.marca ?? ""}
                onChange={(e) => setExtras({ ...extras, marca: e.target.value || undefined })}
                className="mt-foco border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[11px] text-mt-ink"
              >
                <option value="">Todas</option>
                {marcas.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-700">
              Carroceria
              <select
                value={extras.tipo ?? ""}
                onChange={(e) => setExtras({ ...extras, tipo: e.target.value || undefined })}
                className="mt-foco border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[11px] text-mt-ink"
              >
                <option value="">Todas</option>
                {tipos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-700">
              Parado há (dias)
              <input
                type="number"
                value={extras.paradoHaDias ?? ""}
                onChange={(e) =>
                  setExtras({ ...extras, paradoHaDias: e.target.value ? Number(e.target.value) : undefined })
                }
                className="mt-foco w-24 border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[11px] text-mt-ink"
              />
            </label>

            <label className="flex items-center gap-2 text-[11px] text-mt-neutral-800">
              <input
                type="checkbox"
                checked={extras.semLead ?? false}
                onChange={(e) => setExtras({ ...extras, semLead: e.target.checked || undefined })}
              />
              Sem lead
            </label>

            {/* Sem credencial de leitura do GA4 a coluna inteira é nula: o
                controle não é desenhado, em vez de ser desenhado e não filtrar
                nada. */}
            {visitasDisponiveis && (
              <label className="flex items-center gap-2 text-[11px] text-mt-neutral-800">
                <input
                  type="checkbox"
                  checked={extras.semVisita ?? false}
                  onChange={(e) => setExtras({ ...extras, semVisita: e.target.checked || undefined })}
                />
                Sem visita
              </label>
            )}

            <button
              onClick={() => setExtras({})}
              className="mt-foco cursor-pointer border border-mt-regua px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-mt-neutral-800 hover:border-mt-accent"
            >
              Limpar filtros
            </button>

            <span className="ml-auto self-center text-[11px] text-mt-neutral-800">
              {filtradas.length} de {linhas.length} veículos
            </span>
          </div>
        )}
      </div>
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/painel-de-filtros.test.ts`
Expected: PASS — 7 testes.

Run: `npm test`
Expected: +7 testes novos, e a suíte inteira continua verde.

Run: `npm run lint && npm run build`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/TabelaDeEstoque.tsx tests/painel-de-filtros.test.ts
git commit -m "feat(estoque): o painel de filtros do segundo nivel"
```

---

## Depois do merge: o passo que não é código

- [ ] **Abrir `/admin/site/destaques` em produção e clicar em "Publicar alterações" uma vez.**

Isso cria a linha `vitrine_tv` no banco e aposenta a herança da §2.2 da spec. Enquanto ela não existir, editar o banner ainda arrasta a TV junto — que é o comportamento de hoje, não uma regressão, mas não é o que o dono pediu.

- [ ] **Limpar os 5 mortos** pelo botão da própria tela (autorizado pelo dono em 22/09).

- [ ] **Conferir a home**: o Fiat Toro (`8464513`) deve estar no banner.

---

## Verificação final

Antes de abrir o PR, com a suíte inteira verde:

```bash
npm test && npm run lint && npm run build
```

Esperado: a suíte inteira verde, lint limpo, build completo. **Não confira contra um número escrito neste plano** — os números absolutos envelhecem a cada tarefa. A régua é: nada que passava antes passou a falhar.

Só então abrir o PR. Regra da casa: **PR e merge só com CI concluído em verde.**
