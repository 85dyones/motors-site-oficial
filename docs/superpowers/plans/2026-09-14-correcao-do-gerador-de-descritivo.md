# Correção do gerador de descritivo — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** o botão "Gerar sugestão" de `descricao_seo` volta a entregar texto. Quem revisa vê o texto que a conferência reprovou, e cada geração deixa uma linha no log da Vercel. As travas de perícia, status interno, alcance, vocabulário e equipamento param de reprovar texto legítimo e de deixar passar os furos que o qa-guardian mediu em 14/09/2026.

**Arquitetura:** a régua de `descricao_seo` passa de "as duas primeiras frases cabem em 155" para "a primeira frase cabe em 155" (`primeiraFraseDe`, em `validacao.ts`). O prompt (`briefing.ts`) pede o mesmo, com a mira abaixo do teto. O painel guarda o `texto` que o 422 da rota já devolve e o mostra sem o botão de usar. A rota escreve uma linha JSON por geração com `console.info`. As travas continuam sendo regex em `validacao.ts`, e a de equipamento vira um catálogo com as grafias dos opcionais de produção.

**Stack:** Next.js 16.2.6 (App Router), TypeScript 5.9 com alvo ES2017, vitest 3 (jsdom só no teste do painel). Sem dependência nova.

**Origem:** o gerador entrou pelo PR #67 (spec `docs/superpowers/specs/2026-09-08-gerador-de-descritivo-design.md`). Este plano corrige o que foi medido depois do merge.

## Decisões do dono (14/09/2026)

1. A régua da abertura é a **primeira frase em até 155 caracteres**, como na regra dos rascunhos de 17/08, e o prompt pede o mesmo.
2. O **texto reprovado fica visível** no painel.
3. **Registro por chamada** com campo, regras, tokens e duração.
4. Os **furos das travas** medidos pelo qa-guardian (perícia, alcance, status, equipamentos, vocabulário), cada um com teste.

## Fatos medidos que o plano usa

- **Rascunhos aprovados.** `conteudo-seo/rascunhos*.json` guarda os 47 `descricao_seo` que o dono aprovou em 17/08.
  - A régua de duas frases reprova 41 deles. A da primeira frase reprova 3: 8252763 (171), 7447739 (181) e 8059102 (162).
  - Os três passam de 155 de verdade. O `aplicar-rascunhos.js` de 17/08 os aceitou porque tomou por fim de frase o ponto de um número: "53.200 km" (8252763), "21.705 km" (7447739) e "1.0" (8059102).
  - A primeira frase dos 47 tem mediana 130, p25 108 e p75 141.
- **Log da Vercel, 13 e 14/09.** Houve 6 chamadas em 3 veículos, 4 delas com 422. Nenhuma linha diz o campo nem a regra.
- **Opcionais em produção** (SQL só leitura, 14/09, 38 veículos com opcionais):
  - ar-condicionado 31, sensor de estacionamento 22, central multimídia 20, câmera de ré 14, bancos em couro 13, ar-condicionado digital 11;
  - teto solar 4, teto solar panoramico 2, ar-condicionado dual zone 1, camera 360 graus 1, kit multimídia 1, sensor de iluminacao 1.
  - Nenhum opcional fala de perícia.
- **Frases dos testes.** Cada frase das Tarefas 1, 4, 5 e 6 foi rodada em node contra a regex do main (423d72f) e contra o arquivo final deste plano: os 141 casos conferem. As frases novas que não mudam de resultado estão marcadas no próprio teste como guarda de regressão.
- **Regex literal no alvo ES2017.** `tsc --target ES2017` aceita lookbehind e `\p{L}` com a flag `u` (conferido em 14/09). O TypeScript 5.9 só barra por alvo as flags e os grupos nomeados.

## Restrições globais

Valem para toda tarefa:

- **Idioma:** código, nomes, comentários e commits em português.
- **Dependências:** nenhuma nova.
- **OpenAI:** nenhum passo chama a API. A suíte dubla o transporte, e ninguém usa a chave salva por fora.
- **Worktree:** próprio, a partir de `origin/main` (423d72f), no branch `fix/gerador-de-descritivo`. Não tocar o diretório principal `motors-site-oficial` nem outro worktree.
- **Testes:** ficam em `tests/<nome>.test.ts`, com imports relativos (`../src/...`).
- **Memória da máquina (7,9 GB):**
  - Antes de cada `npx vitest`, rodar a guarda `node -e "process.exit(require('os').freemem() >= 1100*1048576 ? 0 : 1)"; echo "ram=$?"`.
  - Com `ram=1`, esperar 30 s e repetir, até 3 vezes.
  - Rodar sempre com `--no-file-parallelism`.
  - Saída sem a linha "Tests" é queda de memória, não resultado de teste: repetir uma vez e, se cair de novo, parar e relatar.
- **Suíte cheia:** roda no GitHub Actions a cada push (`.github/workflows/testes.yml`), por isso **cada tarefa termina com push**, nunca com `--force`. As travas que varrem `src/` inteiro (`tests/promessa-publica.test.ts`, `tests/coerencia-da-pericia.test.ts`, `tests/nomenclatura-estoque.test.ts`) também rodam na verificação local de toda tarefa que escreve texto em `src/`.
- **tsc e eslint** não são portão por tarefa, porque o main tem dívida: o tsc sai com código 2 por `tests/f0-nucleo.test.ts`, e o eslint aponta 385 problemas. A Tarefa 7 confere que nada novo entrou.
- **Edição:** só com Write e Edit. `perl -i` e `sed -i` não gravam neste ambiente.
- **Mutação de prova:**
  1. Copiar o arquivo para um backup fora do repositório.
  2. Aplicar a mutação com Edit e rodar o teste.
  3. Restaurar copiando o backup inteiro de volta e conferir com `cmp`.
  - Mutação nunca vai para commit.
- **Dois sentidos:** toda regra tem a frase que reprova e a frase legítima que passa. Teste de ausência (`not.toContain`) anda junto de um controle que prova que o ramo foi alcançado.
- **Regex:** nunca `\b` depois de letra acentuada. O `\b` do JavaScript só conhece `[A-Za-z0-9_]`, e `ré\b` nunca casa. Use `(?!\p{L})` com a flag `u`.
- **Tailwind:** nenhuma classe nova. O painel usa só classes que já estão em `SugestaoDeTexto.tsx`.
- **Commit:** a mensagem termina com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **`conteudo-seo/`:** não mexer. Os rascunhos são histórico, e o teste só os lê.

## Estrutura de arquivos

| Arquivo | O que muda | Tarefa |
|---|---|---|
| `src/lib/descritivo/validacao.ts` | `primeiraFraseDe` no lugar de `aberturaDe`; perícia, status interno, alcance e vocabulário; catálogo de equipamentos | 1, 4, 5, 6 |
| `src/lib/descritivo/briefing.ts` | o formato de `descricao_seo` pede a primeira frase; a proibição de perícia nomeia o que o laudo atesta | 1, 4 |
| `src/components/admin/SugestaoDeTexto.tsx` | guarda e mostra o texto reprovado | 2 |
| `src/app/api/estoque/[id]/descritivo/route.ts` | uma linha de registro por geração | 3 |
| `tests/descritivo-validacao.test.ts` | as regras nos dois sentidos, e os 47 rascunhos | 1, 4, 5, 6 |
| `tests/descritivo-gerar.test.ts` | o prompt | 1, 4 |
| `tests/descritivo-painel.test.ts` | o texto reprovado na tela | 2 |
| `tests/descritivo-rota.test.ts` | o registro | 3 |

As tarefas rodam **em ordem**. A 1, a 4, a 5 e a 6 editam os mesmos dois arquivos, e a 3 importa `primeiraFraseDe`, que nasce na 1.

## Preparação (coordenador)

- [ ] **Worktree.** Criar o worktree a partir de `origin/main`, no branch `fix/gerador-de-descritivo`.
  - A sessão atual está presa ao worktree `404-dos-hubs`, e subagente só grava onde a sessão está.
  - Criar por agente com `isolation: "worktree"`, fazendo o checkout do branch novo a partir de `origin/main`, e mover a sessão para esse worktree antes de despachar as tarefas.
  - Bootstrap: junction de `node_modules` para o do diretório principal. Nenhum passo precisa de `.env.local`.
- [ ] **Plano no branch.** Copiar este arquivo para `docs/superpowers/plans/2026-09-14-correcao-do-gerador-de-descritivo.md` e commitar:

```bash
git add docs/superpowers/plans/2026-09-14-correcao-do-gerador-de-descritivo.md
git commit -m "docs(descritivo): plano da correção do gerador" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Linha de base.** Sob a guarda de memória:

```bash
npx vitest run tests/descritivo-validacao.test.ts tests/descritivo-gerar.test.ts tests/descritivo-painel.test.ts tests/descritivo-rota.test.ts --no-file-parallelism
```

Esperado: os 4 arquivos verdes. Anotar a contagem de testes de cada um no registro de progresso.

---

### Tarefa 1: a régua da primeira frase, e o prompt pedindo o mesmo

**Arquivos:**
- Modificar: `src/lib/descritivo/validacao.ts` (o bloco `CORPO_DA_FRASE` + `aberturaDe`, linhas 32–56 no main; o `if (campo === "descricao_seo")`, linhas 187–192)
- Modificar: `src/lib/descritivo/briefing.ts` (`FORMATO`, linhas 87–101)
- Testar: `tests/descritivo-validacao.test.ts`, `tests/descritivo-gerar.test.ts`

**Interfaces:**
- Consome: nada de outra tarefa.
- Produz: `export function primeiraFraseDe(texto: string): string` em `validacao.ts`. A Tarefa 3 importa. `aberturaDe` deixa de existir; o único outro importador é o teste, que esta tarefa troca.
- A regra continua se chamando `"abertura"` (o painel mostra `abertura: <motivo>`), e o motivo passa a ser `A primeira frase tem N caracteres e o Google corta em 155.`

- [ ] **Passo 1: trocar os testes de `aberturaDe` e da régua**

Em `tests/descritivo-validacao.test.ts`, trocar as linhas 1–3:

```ts
import { describe, it, expect } from "vitest";
import { validarDescritivo, aberturaDe, LIMITE_META } from "../src/lib/descritivo/validacao";
import { montarDossie } from "../src/lib/descritivo/dossie";
```

por:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validarDescritivo, primeiraFraseDe, LIMITE_META } from "../src/lib/descritivo/validacao";
import { montarDossie } from "../src/lib/descritivo/dossie";
```

No mesmo arquivo, trocar o bloco inteiro que começa em `describe("aberturaDe", () => {` e termina no `});` que fecha `describe("regra: abertura em 155 caracteres", ...)` (linhas 49–89 no main):

```ts
describe("aberturaDe", () => {
  it("devolve as duas primeiras frases", () => {
    expect(aberturaDe("Uma. Duas. Três.")).toBe("Uma. Duas.");
  });
  it("devolve o texto inteiro quando não há pontuação", () => {
    expect(aberturaDe("sem ponto final")).toBe("sem ponto final");
  });
});

describe("regra: abertura em 155 caracteres", () => {
  it("reprova abertura maior que o corte do Google", () => {
    const longa = "A".repeat(LIMITE_META + 5) + ". Segunda.";
    expect(motivos(longa)).toContain("abertura");
  });
  it("aceita abertura dentro do limite", () => {
    expect(motivos("Honda NXR 160 Bros 2022. Passa por perícia independente.")).not.toContain("abertura");
  });
  /**
   * O dossiê formata preço e km com `toLocaleString("pt-BR")` — ponto como
   * separador de milhar. Bug medido em 08/09/2026: o split de frases tratava
   * esse ponto como fim de frase, "R$ 89.900,00" virava dois fragmentos, e a
   * segunda frase real ("Aceita troca...") caía fora da contagem — a
   * abertura real tem 158 caracteres e devia reprovar, mas `aberturaDe`
   * devolvia só os primeiros 34.
   */
  it("reprova abertura com preço em formato brasileiro que soma 158 caracteres", () => {
    // A fixture dizia "com garantia de procedência" — o mesmo chavão que o
    // POSICIONAMENTO barra, escrito ao contrário. Ela media a ABERTURA e por
    // isso continuava verde, mas era um texto proibido servindo de exemplo.
    // Trocado por frase legítima do mesmo tamanho (27 caracteres), para o total
    // seguir sendo os 158 que o caso descreve.
    const texto =
      "Honda Civic 2022 por R$ 89.900,00. Aceita troca, financiamento facilitado e entrega para toda a região metropolitana de Curitiba, com histórico de manutenção.";
    expect(texto).toHaveLength(158);
    expect(motivos(texto)).toContain("abertura");
    expect(motivos(texto)).not.toContain("vocabulário");
  });
  it("aceita abertura curta com preço e km em formato brasileiro", () => {
    const texto =
      "BMW X1 sDrive 20i 2022, por R$ 179.900, com 70.700 km rodados. Aceita troca e financiamento facilitado.";
    expect(motivos(texto)).not.toContain("abertura");
  });
});
```

por:

```ts
describe("primeiraFraseDe", () => {
  it("devolve só a primeira frase", () => {
    expect(primeiraFraseDe("Uma. Duas. Três.")).toBe("Uma.");
  });
  it("devolve o texto inteiro quando não há pontuação", () => {
    expect(primeiraFraseDe("sem ponto final")).toBe("sem ponto final");
  });
  /**
   * O dossiê formata preço e km com `toLocaleString("pt-BR")`, ponto como
   * separador de milhar. Bug medido em 08/09/2026: o ponto de "89.900" fechava
   * a frase no meio do número.
   */
  it("não fecha a frase no ponto de milhar", () => {
    expect(primeiraFraseDe("BMW X1 2022 por R$ 179.900, com 70.700 km. Aceita troca.")).toBe(
      "BMW X1 2022 por R$ 179.900, com 70.700 km.",
    );
  });
  /** Até 14/09/2026 "…" não fechava frase, e a frase seguinte entrava na conta. */
  it("fecha a frase nas reticências", () => {
    expect(primeiraFraseDe("Jeep Compass Limited 2021… o SUV que passou pela seleção.")).toBe(
      "Jeep Compass Limited 2021…",
    );
  });
  /** A meta description junta as linhas; a medida junta também. */
  it("junta a quebra de linha sem ponto na mesma frase", () => {
    expect(primeiraFraseDe("Toyota Corolla XEi 2020\nO sedan que passou pela seleção. Aceita troca.")).toBe(
      "Toyota Corolla XEi 2020 O sedan que passou pela seleção.",
    );
  });
});

/**
 * A régua é a PRIMEIRA frase em 155 desde 14/09/2026 — decisão do dono, a
 * regra dos rascunhos de 17/08. Com as duas primeiras frases, o botão reprovava
 * quase tudo: 4 das 6 gerações registradas na Vercel em 13 e 14/09 deram 422.
 */
describe("regra: primeira frase em 155 caracteres", () => {
  it("reprova primeira frase maior que o corte do Google", () => {
    const longa = "A".repeat(LIMITE_META + 5) + ". Segunda.";
    expect(motivos(longa)).toContain("abertura");
  });
  it("diz no motivo quantos caracteres a primeira frase tem", () => {
    const longa = "A".repeat(LIMITE_META + 5) + ". Segunda.";
    const r = motivosCompletos(longa).find((x) => x.regra === "abertura");
    expect(r?.motivo).toBe(`A primeira frase tem ${LIMITE_META + 6} caracteres e o Google corta em ${LIMITE_META}.`);
  });
  it("aceita primeira frase dentro do limite", () => {
    expect(motivos("Honda NXR 160 Bros 2022. Passa por perícia independente.")).not.toContain("abertura");
  });
  /**
   * O que a decisão mudou: duas frases que somam mais de 155 passam quando a
   * primeira cabe. Pela régua de duas frases, este texto reprovava.
   */
  it("aceita duas frases que somam mais de 155 quando a primeira cabe", () => {
    const texto =
      "Chevrolet Onix 2021 prata, manual, com 51.000 km. Aceita troca e financiamento facilitado, com entrega combinada no showroom do Bacacheri, em Curitiba, sem pressa nenhuma.";
    expect(texto).toHaveLength(171);
    expect(motivos(texto)).not.toContain("abertura");
  });
  /**
   * O ponto de milhar DENTRO da primeira frase. Se ele fechasse a frase (o bug
   * de 08/09/2026), a medida seria "Honda Civic Touring 2018 por R$ 132." e o
   * texto passaria.
   */
  it("reprova primeira frase de 164 caracteres com preço e km em formato brasileiro", () => {
    const texto =
      "Honda Civic Touring 2018 por R$ 132.900, com 70.700 km, câmbio CVT, bancos confortáveis, central de mídia e rodas de liga leve, pronto para rodar muitos anos ainda. Aceita troca.";
    expect(primeiraFraseDe(texto)).toHaveLength(164);
    expect(motivos(texto)).toContain("abertura");
  });
  it("aceita primeira frase curta com preço e km em formato brasileiro", () => {
    const texto =
      "BMW X1 sDrive 20i 2022, por R$ 179.900, com 70.700 km rodados. Aceita troca e financiamento facilitado.";
    expect(motivos(texto)).not.toContain("abertura");
  });
  it("não mede a primeira frase no campo descricao", () => {
    const longa = "A".repeat(LIMITE_META + 5) + ". Segunda.";
    expect(motivos(longa)).toContain("abertura");
    expect(motivos(longa, SEM_NADA, "descricao")).not.toContain("abertura");
  });
});

/**
 * A régua contra TEXTO REAL: os 47 `descricao_seo` que o dono aprovou em
 * 17/08/2026 (`conteudo-seo/rascunhos*.json`). A régua de duas frases reprovava
 * 41. A da primeira frase reprova só estes três, e os três passam de 155 de
 * verdade (171, 181 e 162 caracteres).
 */
describe("régua da primeira frase contra os rascunhos aprovados em 17/08", () => {
  const pasta = join(__dirname, "..", "conteudo-seo");
  const rascunhos = readdirSync(pasta)
    .filter((f) => f.startsWith("rascunhos") && f.endsWith(".json"))
    .flatMap((f) =>
      Object.entries(JSON.parse(readFileSync(join(pasta, f), "utf-8")).textos as Record<string, string>),
    );

  it("lê os 47", () => {
    expect(rascunhos).toHaveLength(47);
  });

  it("reprova só os três cuja primeira frase passa de 155", () => {
    const reprovados = rascunhos
      .filter(([, texto]) => motivos(texto).includes("abertura"))
      .map(([id]) => id)
      .sort();
    expect(reprovados).toEqual(["7447739", "8059102", "8252763"]);
  });
});
```

- [ ] **Passo 2: o teste do prompt**

Em `tests/descritivo-gerar.test.ts`, trocar:

```ts
  it("pede formato diferente para cada campo", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("155 caracteres");
    expect(montarEntrada(SEM_NADA, "descricao")).toContain("ABRE a página");
  });
});
```

por:

```ts
  it("pede formato diferente para cada campo", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("155 caracteres");
    expect(montarEntrada(SEM_NADA, "descricao")).toContain("ABRE a página");
  });

  /**
   * O prompt mede o que a validação mede desde 14/09/2026: a PRIMEIRA frase.
   * Um prompt pedindo duas frases faria o modelo mirar uma coisa e a
   * conferência cobrar outra — e a mira antiga, "entre 130 e 155", ficava
   * colada no teto, sem segunda tentativa.
   */
  it("pede a primeira frase em 155, com a mira abaixo do teto", () => {
    const entrada = montarEntrada(SEM_NADA, "descricao_seo");
    expect(entrada).toContain("a PRIMEIRA frase cabe em 155 caracteres e termina com ponto final");
    expect(entrada).toContain("Mire entre 100 e 140 caracteres");
    expect(entrada).not.toContain("duas primeiras frases");
    expect(entrada).not.toContain("entre 130 e 155");
  });
});
```

- [ ] **Passo 3: ver falhar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-validacao.test.ts tests/descritivo-gerar.test.ts --no-file-parallelism
```

Esperado: FALHA. O vitest não recusa import de nome inexistente: `primeiraFraseDe` chega `undefined`, e o resto do arquivo roda contra a régua antiga.
- No arquivo de validação, falham:
  - os cinco testes de `describe("primeiraFraseDe")`, com `primeiraFraseDe is not a function`;
  - "reprova primeira frase de 164 caracteres com preço e km em formato brasileiro", pelo mesmo erro;
  - "diz no motivo quantos caracteres a primeira frase tem" (o motivo ainda diz "A abertura tem 170");
  - "aceita duas frases que somam mais de 155 quando a primeira cabe";
  - "reprova só os três cuja primeira frase passa de 155" (a régua antiga devolve 41).
- No arquivo de gerar, falha só "pede a primeira frase em 155, com a mira abaixo do teto".

- [ ] **Passo 4: a régua**

Em `src/lib/descritivo/validacao.ts`, trocar:

```ts
/**
 * O corpo de uma frase.
 *
 * Um ponto entre dígitos é separador de milhar — `toLocaleString("pt-BR")`
 * formata preço e km assim no dossiê — e não pode contar como fim de frase.
 * Sem a exceção `(?<=\d)\.(?=\d)`, "R$ 89.900,00." quebrava em dois fragmentos
 * ali no meio do número, e a segunda frase real da abertura caía fora da
 * contagem: bug medido em 08/09/2026 (abertura real de 158 caracteres, que
 * devia reprovar, lida como 34).
 *
 * Usada só por `aberturaDe` desde 09/09/2026. A régua de perícia deixou de
 * segmentar por frase (ver MENCIONA_PERICIA logo abaixo), e `frasesDe`, a
 * função que existia só para ela, saiu junto.
 */
const CORPO_DA_FRASE = "(?:[^.!?]|(?<=\\d)\\.(?=\\d))+";

/** As duas primeiras frases — o que o Google mostra. */
export function aberturaDe(texto: string): string {
  const frases = texto
    .replace(/\s+/g, " ")
    .trim()
    .match(new RegExp(CORPO_DA_FRASE + "[.!?]+", "g"));
  if (!frases || frases.length === 0) return texto.replace(/\s+/g, " ").trim();
  return frases.slice(0, 2).join("").trim();
}
```

por:

```ts
/**
 * O corpo de uma frase.
 *
 * Um ponto entre dígitos é separador de milhar — `toLocaleString("pt-BR")`
 * formata preço e km assim no dossiê — e não pode contar como fim de frase.
 * Sem a exceção `(?<=\d)\.(?=\d)`, "R$ 89.900,00." quebrava em dois fragmentos
 * ali no meio do número: bug medido em 08/09/2026. A mesma armadilha pegou o
 * `conteudo-seo/aplicar-rascunhos.js` de 17/08, que procura o último ponto
 * antes do caractere 155: ele aceitou três rascunhos cuja primeira frase passa
 * de 155, porque o ponto que achou era o de "53.200 km".
 *
 * Reticências ("…") fecham frase desde 14/09/2026, como o ponto. Antes não
 * fechavam, e a frase seguinte entrava na conta.
 *
 * LIMITE CONHECIDO: ponto ou exclamação dentro de nome encerra a frase cedo —
 * "VW up!" mede 6 caracteres. O erro é para o lado de aceitar.
 */
const CORPO_DA_FRASE = "(?:[^.!?…]|(?<=\\d)\\.(?=\\d))+";

/**
 * A primeira frase — o que precisa fechar antes do corte do Google.
 *
 * Decisão do dono em 14/09/2026, a mesma regra dos rascunhos de 17/08: "a
 * primeira frase fecha sozinha". Até ali a régua eram as DUAS primeiras frases
 * em 155, que reprovava 41 dos 47 rascunhos aprovados pelo próprio dono; a da
 * primeira frase reprova 3, e os três passam de 155 de verdade.
 */
export function primeiraFraseDe(texto: string): string {
  const corrido = texto.replace(/\s+/g, " ").trim();
  const frase = corrido.match(new RegExp(CORPO_DA_FRASE + "[.!?…]+"));
  return frase ? frase[0].trim() : corrido;
}
```

E, dentro de `validarDescritivo`, trocar:

```ts
  if (campo === "descricao_seo") {
    const ab = aberturaDe(texto).length;
    if (ab > LIMITE_META) {
      add("abertura", `A abertura tem ${ab} caracteres e o Google corta em ${LIMITE_META}.`);
    }
  }
```

por:

```ts
  if (campo === "descricao_seo") {
    const pf = primeiraFraseDe(texto).length;
    if (pf > LIMITE_META) {
      add("abertura", `A primeira frase tem ${pf} caracteres e o Google corta em ${LIMITE_META}.`);
    }
  }
```

- [ ] **Passo 5: o prompt**

Em `src/lib/descritivo/briefing.ts`, trocar:

```ts
const FORMATO: Record<CampoDeTexto, string> = {
  descricao_seo: `
Escreva o campo \`descricao_seo\`: a frase de anúncio que vai para o feed dos
portais e para a descrição que aparece na busca do Google.

REGRA DURA: as duas primeiras frases precisam caber em 155 caracteres, porque
é onde o Google corta. APROVEITE o espaço — mire entre 130 e 155, não 70.
O texto inteiro pode passar disso; a ABERTURA não pode.
`.trim(),
```

por:

```ts
/**
 * O formato pedido para cada campo.
 *
 * `descricao_seo` pede a PRIMEIRA frase em 155 desde 14/09/2026, a mesma régua
 * de `primeiraFraseDe` (`validacao.ts`). A mira fica abaixo do teto de
 * propósito: o modelo não conta caracteres, e não há segunda tentativa. Até
 * ali o prompt pedia as duas primeiras frases "entre 130 e 155", colado no
 * teto, e todo estouro chegava ao painel como erro. A faixa de 100 a 140 é a
 * dos rascunhos que o dono aprovou em 17/08: a primeira frase deles tem
 * mediana 130, p25 108 e p75 141.
 */
const FORMATO: Record<CampoDeTexto, string> = {
  descricao_seo: `
Escreva o campo \`descricao_seo\`: a frase de anúncio que vai para o feed dos
portais e para a descrição que aparece na busca do Google.

REGRA DURA: a PRIMEIRA frase cabe em 155 caracteres e termina com ponto final,
porque é ali que o Google corta. Mire entre 100 e 140 caracteres nessa frase.
Não use reticências. Depois do primeiro ponto final, o texto pode seguir.
`.trim(),
```

- [ ] **Passo 6: ver passar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-validacao.test.ts tests/descritivo-gerar.test.ts tests/promessa-publica.test.ts tests/coerencia-da-pericia.test.ts --no-file-parallelism
```

Esperado: 4 arquivos verdes.

- [ ] **Passo 7: mutações**

Uma de cada vez, com backup, restauração pelo arquivo inteiro e `cmp`. Rodar só `tests/descritivo-validacao.test.ts` e `tests/descritivo-gerar.test.ts`.

| # | Mutação | Tem de falhar, pelo menos |
|---|---|---|
| M1 | em `primeiraFraseDe`, trocar as duas últimas linhas por `const frases = corrido.match(new RegExp(CORPO_DA_FRASE + "[.!?…]+", "g"));` e `return frases ? frases.slice(0, 2).join("").trim() : corrido;` | "devolve só a primeira frase"; "aceita duas frases que somam mais de 155 quando a primeira cabe"; "reprova só os três cuja primeira frase passa de 155" |
| M2 | tirar `…` das duas classes (`[^.!?…]` e `[.!?…]+`) | "fecha a frase nas reticências" |
| M3 | tirar `\|(?<=\\d)\\.(?=\\d)` de `CORPO_DA_FRASE` | "não fecha a frase no ponto de milhar"; "reprova primeira frase de 164 caracteres com preço e km em formato brasileiro" |
| M4 | no `FORMATO`, trocar "a PRIMEIRA frase cabe em 155 caracteres" por "as duas primeiras frases cabem em 155 caracteres" | "pede a primeira frase em 155, com a mira abaixo do teto" |

Mutação que não falhar como a tabela diz: anotar no relato, sem ajustar teste nem código.

- [ ] **Passo 8: commit e push**

```bash
git add src/lib/descritivo/validacao.ts src/lib/descritivo/briefing.ts tests/descritivo-validacao.test.ts tests/descritivo-gerar.test.ts
git commit -m "fix(descritivo): a régua é a primeira frase em 155, e o prompt pede o mesmo com folga" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -u origin fix/gerador-de-descritivo
```

---

### Tarefa 2: o texto reprovado à vista no painel

**Arquivos:**
- Modificar: `src/components/admin/SugestaoDeTexto.tsx`
- Testar: `tests/descritivo-painel.test.ts`

**Interfaces:**
- Consome: a resposta 422 da rota, que já é `{ error, motivos, texto }` no main (`route.ts:96-98`). Nada muda na rota nesta tarefa.
- Produz: nada que outra tarefa use.

- [ ] **Passo 1: os testes**

Em `tests/descritivo-painel.test.ts`, trocar:

```ts
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("Usa palavra barrada.");
  });
```

por:

```ts
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("Usa palavra barrada.");
  });

  /**
   * O 422 traz o texto que reprovou. Até 14/09/2026 o painel o jogava fora, e
   * quem lia "abertura: A abertura tem 184 caracteres" não tinha como conferir
   * se a régua errou ou se o texto estourou de fato.
   */
  it("mostra o texto reprovado junto dos motivos", async () => {
    RESPOSTA = {
      ok: false, status: 422,
      corpo: {
        error: "O texto gerado não passou na conferência.",
        motivos: [{ regra: "abertura", motivo: "A primeira frase tem 171 caracteres e o Google corta em 155." }],
        texto: "Texto que estourou a régua.",
      },
    };
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("A primeira frase tem 171 caracteres");
    expect(naTela()).toContain("Texto reprovado");
    expect(naTela()).toContain("Texto que estourou a régua.");
  });

  it("não oferece 'usar este texto' para o texto reprovado", async () => {
    const usados: string[] = [];
    RESPOSTA = {
      ok: false, status: 422,
      corpo: {
        error: "O texto gerado não passou na conferência.",
        motivos: [{ regra: "vocabulário", motivo: "Usa palavra barrada." }],
        texto: "SUV premium.",
      },
    };
    montar((t) => usados.push(t));
    await clicar(botao("gerar"));
    // Controle: o texto reprovado CHEGOU à tela. Sem isto, a ausência do
    // botão passaria também num painel que não mostra nada.
    expect(naTela()).toContain("SUV premium.");
    expect(() => botao("usar este texto")).toThrow();
    expect(usados).toEqual([]);
  });

  it("apaga o texto reprovado quando a geração seguinte passa", async () => {
    RESPOSTA = {
      ok: false, status: 422,
      corpo: {
        error: "O texto gerado não passou na conferência.",
        motivos: [{ regra: "vocabulário", motivo: "Usa palavra barrada." }],
        texto: "SUV premium.",
      },
    };
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("SUV premium.");

    RESPOSTA = { ok: true, status: 200, corpo: { texto: "Honda NXR 160 Bros 2022.", caracteres: 24 } };
    await clicar(botao("gerar outro"));
    expect(naTela()).not.toContain("SUV premium.");
    expect(naTela()).toContain("Honda NXR 160 Bros 2022.");
  });
```

- [ ] **Passo 2: ver falhar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-painel.test.ts --no-file-parallelism
```

Esperado: FALHAM os três testes novos. "mostra o texto reprovado junto dos motivos" e "não oferece 'usar este texto' para o texto reprovado" não acham o texto na tela. "apaga o texto reprovado quando a geração seguinte passa" já para no primeiro `toContain("SUV premium.")`. Os testes que já existiam seguem verdes.

- [ ] **Passo 3: o painel**

Em `src/components/admin/SugestaoDeTexto.tsx`, seis trocas.

(a) No docblock do topo, trocar:

```tsx
 * A revisão humana também é a ÚNICA defesa contra troca de campo — "motor
 * manual" quando o manual é o câmbio. Nenhuma regra determinística pega isso
 * (ver o docblock de `lib/descritivo/validacao.ts`).
 */
```

por:

```tsx
 * A revisão humana também é a ÚNICA defesa contra troca de campo — "motor
 * manual" quando o manual é o câmbio. Nenhuma regra determinística pega isso
 * (ver o docblock de `lib/descritivo/validacao.ts`).
 *
 * O texto REPROVADO aparece desde 14/09/2026, sem o botão de usar. Até ali o
 * 422 da rota já trazia o `texto`, e o painel o descartava: as reprovações de
 * 13 e 14/09 chegaram à tela só com o motivo, e ninguém tinha como saber se a
 * régua errou ou se o texto estourou de fato.
 */
```

(b) Trocar:

```tsx
  const [erro, setErro] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
```

por:

```tsx
  const [erro, setErro] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  // O texto que a conferência reprovou: fica à vista para quem revisa saber o
  // QUE reprovou, e nunca ganha o botão "Usar este texto".
  const [reprovado, setReprovado] = useState<string | null>(null);
```

(c) Trocar:

```tsx
    setMotivos([]);
    setTexto(null);
```

por:

```tsx
    setMotivos([]);
    setTexto(null);
    setReprovado(null);
```

(d) Trocar:

```tsx
        setMotivos(Array.isArray(j?.motivos) ? j.motivos : []);
        return;
```

por:

```tsx
        setMotivos(Array.isArray(j?.motivos) ? j.motivos : []);
        setReprovado(typeof j?.texto === "string" && j.texto.trim() ? j.texto : null);
        return;
```

(e) Trocar:

```tsx
        {carregando ? "Gerando…" : texto ? "Gerar outro" : "Gerar sugestão"}
```

por:

```tsx
        {carregando ? "Gerando…" : texto || reprovado ? "Gerar outro" : "Gerar sugestão"}
```

(f) Trocar:

```tsx
                <li key={m.regra}>
                  <span className="font-medium">{m.regra}:</span> {m.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
```

por:

```tsx
                <li key={m.regra}>
                  <span className="font-medium">{m.regra}:</span> {m.motivo}
                </li>
              ))}
            </ul>
          )}
          {reprovado && (
            <div className="mt-2">
              <div className="font-medium">
                Texto reprovado ({reprovado.length} caracteres), só para leitura:
              </div>
              <p className="mt-1 whitespace-pre-wrap">{reprovado}</p>
            </div>
          )}
        </div>
      )}
```

As classes `mt-2`, `font-medium`, `mt-1` e `whitespace-pre-wrap` já existem neste arquivo. Não criar outras.

- [ ] **Passo 4: ver passar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-painel.test.ts tests/promessa-publica.test.ts --no-file-parallelism
```

Esperado: 2 arquivos verdes. O painel está sob `src/components/admin/`, que a varredura de promessa trata como interno; rodá-la confirma isso.

- [ ] **Passo 5: mutações**

Uma de cada vez, com backup, restauração pelo arquivo inteiro e `cmp`. Rodar só `tests/descritivo-painel.test.ts`.

| # | Mutação | Tem de falhar, pelo menos |
|---|---|---|
| M1 | apagar `setReprovado(null);` de `gerar()` | "apaga o texto reprovado quando a geração seguinte passa" |
| M2 | voltar o rótulo para `texto ? "Gerar outro" : "Gerar sugestão"` | "apaga o texto reprovado quando a geração seguinte passa" |
| M3 | apagar o bloco `{reprovado && (...)}` | "mostra o texto reprovado junto dos motivos"; "não oferece 'usar este texto' para o texto reprovado" |

- [ ] **Passo 6: commit e push**

```bash
git add src/components/admin/SugestaoDeTexto.tsx tests/descritivo-painel.test.ts
git commit -m "fix(descritivo): o painel mostra o texto que a conferência reprovou, sem o botão de usar" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

### Tarefa 3: uma linha de registro por geração

**Arquivos:**
- Modificar: `src/app/api/estoque/[id]/descritivo/route.ts`
- Testar: `tests/descritivo-rota.test.ts`

**Interfaces:**
- Consome: `primeiraFraseDe(texto: string): string`, da Tarefa 1. `gerarTexto` já devolve `{ ok: true; texto; entrada; saida }` ou `{ ok: false; status: 502 | 503; motivo }`, sem mudança.
- Produz: a linha de log `[descritivo] {"veiculo","campo","status","ms", ...}`. O coordenador a lê na Vercel depois do merge (Tarefa 7). Campos:
  - `veiculo` (string, o `id` da URL), `campo`, `status` (200, 422, 502 ou 503), `ms` (duração de `gerarTexto`);
  - com texto gerado: `regras` (nomes das regras reprovadas, `[]` no 200), `caracteres`, `primeiraFrase` (tamanho), `tokensEntrada`, `tokensSaida`;
  - sem texto (502/503): `motivo`.
  - O texto gerado não entra na linha.

- [ ] **Passo 1: os testes**

Em `tests/descritivo-rota.test.ts`, trocar a linha 1:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
```

por:

```ts
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
```

No fim do arquivo, trocar:

```ts
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("o banco recusou a consulta");
  });
});
```

por:

```ts
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("o banco recusou a consulta");
  });
});

/**
 * O registro por geração (decisão do dono, 14/09/2026). Até ali a rota não
 * registrava nada, e o log da Vercel mostrava quatro 422 em 13 e 14/09 sem
 * dizer o campo, a regra, os tokens ou o tempo.
 *
 * O espião fica mudo para não sujar a saída da suíte, e volta ao `console`
 * depois de cada teste.
 */
describe("registro por geração", () => {
  let espiao: MockInstance<typeof console.info>;
  beforeEach(() => {
    espiao = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    espiao.mockRestore();
  });

  /** As linhas `[descritivo]` que a rota escreveu, já lidas do JSON. */
  const registros = () =>
    espiao.mock.calls.filter((c) => c[0] === "[descritivo]").map((c) => JSON.parse(String(c[1])));

  it("registra campo, status, tokens e duração quando o texto passa", async () => {
    comPerfil(["admin"]);
    await chamar();
    const linhas = registros();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      veiculo: "7803195",
      campo: "descricao_seo",
      status: 200,
      regras: [],
      caracteres: "Texto limpo do anúncio.".length,
      primeiraFrase: "Texto limpo do anúncio.".length,
      tokensEntrada: 2200,
      tokensSaida: 80,
    });
    expect(typeof linhas[0].ms).toBe("number");
    expect(linhas[0].ms).toBeGreaterThanOrEqual(0);
  });

  it("registra as regras que reprovaram, no 422", async () => {
    comPerfil(["admin"]);
    gerarTexto.mockResolvedValue({ ok: true, texto: "SUV premium com garantia de motor e câmbio.", entrada: 1900, saida: 60 });
    expect((await chamar()).status).toBe(422);
    expect(registros()).toEqual([
      expect.objectContaining({
        status: 422,
        regras: ["vocabulário", "fato fora do dossiê"],
        tokensEntrada: 1900,
        tokensSaida: 60,
      }),
    ]);
  });

  it("registra o motivo quando a geração falha, sem tokens", async () => {
    comPerfil(["admin"]);
    gerarTexto.mockResolvedValue({ ok: false, status: 502, motivo: "A OpenAI recusou a chamada: modelo inexistente" });
    expect((await chamar()).status).toBe(502);
    const linhas = registros();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      campo: "descricao_seo",
      status: 502,
      motivo: "A OpenAI recusou a chamada: modelo inexistente",
    });
    expect(linhas[0]).not.toHaveProperty("tokensEntrada");
  });

  it("não põe o texto gerado no registro", async () => {
    comPerfil(["admin"]);
    await chamar();
    // Controle: a linha existe. Sem isto, o `not.toContain` passaria com o
    // registro apagado.
    expect(registros()).toHaveLength(1);
    expect(JSON.stringify(registros())).not.toContain("Texto limpo do anúncio.");
  });

  it("não registra quem é barrado antes da geração", async () => {
    comPerfil(null);
    expect((await chamar()).status).toBe(401);
    expect(registros()).toEqual([]);
  });
});
```

- [ ] **Passo 2: ver falhar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-rota.test.ts --no-file-parallelism
```

Esperado: FALHAM os quatro primeiros testes novos, porque `registros()` volta vazio. "não registra quem é barrado antes da geração" já passa antes do código; ele é guarda do escopo "por geração", e as mutações do Passo 5 provam o resto.

- [ ] **Passo 3: o registro**

Em `src/app/api/estoque/[id]/descritivo/route.ts`, três trocas.

(a) Trocar:

```ts
import { validarDescritivo, type CampoDeTexto } from "../../../../../lib/descritivo/validacao";
```

por:

```ts
import { primeiraFraseDe, validarDescritivo, type CampoDeTexto } from "../../../../../lib/descritivo/validacao";
```

(b) Trocar:

```ts
const CAMPOS: CampoDeTexto[] = ["descricao", "descricao_seo"];
```

por:

```ts
const CAMPOS: CampoDeTexto[] = ["descricao", "descricao_seo"];

/**
 * Uma linha por geração no log da Vercel, com o prefixo `[descritivo]` para a
 * busca achar.
 *
 * Existe desde 14/09/2026, por decisão do dono. Até ali a rota não registrava
 * nada: o log da Vercel mostrava quatro respostas 422 em 13 e 14/09, e nenhuma
 * dizia o campo, a regra, os tokens ou o tempo da chamada.
 *
 * Só medidas e nomes de regra. O texto gerado fica fora: quem pediu já o vê no
 * painel, aprovado ou reprovado.
 */
type Registro = {
  veiculo: string;
  campo: CampoDeTexto;
  status: number;
  ms: number;
  regras?: string[];
  caracteres?: number;
  primeiraFrase?: number;
  tokensEntrada?: number;
  tokensSaida?: number;
  motivo?: string;
};

function registrar(registro: Registro) {
  console.info("[descritivo]", JSON.stringify(registro));
}
```

(c) Trocar:

```ts
    const dossie = montarDossie(veiculo);
    const saida = await gerarTexto({
      dossie,
      campo,
      chave: process.env.OPENAI_API_KEY ?? "",
    });

    if (!saida.ok) {
      return NextResponse.json({ error: saida.motivo }, { status: saida.status });
    }

    const motivos = validarDescritivo(saida.texto, dossie, campo);
    if (motivos.length > 0) {
      return NextResponse.json({ error: "O texto gerado não passou na conferência.", motivos, texto: saida.texto }, { status: 422 });
    }

    return NextResponse.json({
```

por:

```ts
    const dossie = montarDossie(veiculo);
    const inicio = Date.now();
    const saida = await gerarTexto({
      dossie,
      campo,
      chave: process.env.OPENAI_API_KEY ?? "",
    });
    const ms = Date.now() - inicio;

    if (!saida.ok) {
      registrar({ veiculo: id, campo, status: saida.status, ms, motivo: saida.motivo });
      return NextResponse.json({ error: saida.motivo }, { status: saida.status });
    }

    const motivos = validarDescritivo(saida.texto, dossie, campo);
    const medidas = {
      veiculo: id,
      campo,
      ms,
      regras: motivos.map((m) => m.regra),
      caracteres: saida.texto.length,
      primeiraFrase: primeiraFraseDe(saida.texto).length,
      tokensEntrada: saida.entrada,
      tokensSaida: saida.saida,
    };
    if (motivos.length > 0) {
      registrar({ ...medidas, status: 422 });
      return NextResponse.json({ error: "O texto gerado não passou na conferência.", motivos, texto: saida.texto }, { status: 422 });
    }

    registrar({ ...medidas, status: 200 });
    return NextResponse.json({
```

- [ ] **Passo 4: ver passar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-rota.test.ts tests/nomenclatura-estoque.test.ts tests/promessa-publica.test.ts --no-file-parallelism
```

Esperado: 3 arquivos verdes. `nomenclatura-estoque` conta `.from("estoque_motors")` pelo texto cru do arquivo, comentário incluído; o registro não pode citar essa chamada.

- [ ] **Passo 5: mutações**

Uma de cada vez, com backup, restauração pelo arquivo inteiro e `cmp`. Rodar só `tests/descritivo-rota.test.ts`.

| # | Mutação | Tem de falhar, pelo menos |
|---|---|---|
| M1 | apagar `registrar({ ...medidas, status: 422 });` | "registra as regras que reprovaram, no 422" |
| M2 | apagar `registrar({ veiculo: id, campo, status: saida.status, ms, motivo: saida.motivo });` | "registra o motivo quando a geração falha, sem tokens" |
| M3 | trocar `tokensEntrada: saida.entrada` por `tokensEntrada: saida.saida` | "registra campo, status, tokens e duração quando o texto passa" |
| M4 | acrescentar `texto: saida.texto,` ao objeto `medidas` | "não põe o texto gerado no registro" |

- [ ] **Passo 6: commit e push**

```bash
git add "src/app/api/estoque/[id]/descritivo/route.ts" tests/descritivo-rota.test.ts
git commit -m "feat(descritivo): uma linha de registro por geração, com campo, regras, tokens e tempo" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

### Tarefa 4: perícia pega o que o laudo atesta, e status interno para de reprovar frase de venda

**Arquivos:**
- Modificar: `src/lib/descritivo/validacao.ts` (`MENCIONA_PERICIA` e `STATUS_INTERNO`, linhas 108–111 no main; o motivo da perícia, linha 202)
- Modificar: `src/lib/descritivo/briefing.ts` (a proibição de perícia em `montarEntrada`, linhas 131–139)
- Testar: `tests/descritivo-validacao.test.ts`, `tests/descritivo-gerar.test.ts`

**Interfaces:**
- Consome: nada de outra tarefa.
- Produz: nada que outra tarefa use. A regra continua `"perícia"`; o motivo continua começando por "Fala de perícia" (dois testes do main conferem esse começo).

- [ ] **Passo 1: os testes de perícia**

Em `tests/descritivo-validacao.test.ts`, trocar:

```ts
  ])("reprova por conter '%s' (item menor, ampliação de 09/09/2026)", (_termo, frase) => {
    expect(motivos(frase)).toContain("perícia");
  });
});
```

por:

```ts
  ])("reprova por conter '%s' (item menor, ampliação de 09/09/2026)", (_termo, frase) => {
    expect(motivos(frase)).toContain("perícia");
  });

  /**
   * Segunda ampliação (14/09/2026, qa-guardian): o verbo "vistoriou" e a frase
   * padrão do campo Laudo cautelar dita sem os substantivos passavam limpos.
   */
  it.each([
    ["vistoriou", "Nossa equipe vistoriou cada detalhe."],
    [
      "a frase padrão do laudo sem os substantivos",
      "Estrutura, chassi e histórico de sinistro auditados por empresa independente, credenciada junto ao Detran.",
    ],
    ["nada consta", "Documentação sem restrições e nada consta."],
    ["documentação sem restrições", "Documentação sem restrições."],
    ["aprovado na avaliação técnica", "Aprovado na avaliação técnica de 120 itens."],
    ["avaliação técnica aprovada", "Avaliação técnica de 120 itens, toda aprovada."],
    ["leilão", "Sem passagem por leilão."],
  ])("reprova por falar do que o laudo atesta: %s", (_caso, frase) => {
    expect(motivos(frase)).toContain("perícia");
  });

  /**
   * Guarda de regressão: "sem restrição" e "avaliação técnica" só contam presos
   * ao contexto do laudo. Soltos, são frase de venda.
   */
  it.each([
    "Avaliação do seu usado na hora.",
    "Fazemos avaliação técnica do seu usado na hora.",
    "Aceita troca sem restrição de ano.",
  ])("NÃO reprova — frase de venda com palavra vizinha do laudo: %s", (frase) => {
    expect(motivos(frase)).not.toContain("perícia");
  });
});
```

- [ ] **Passo 2: os testes de status interno**

No mesmo arquivo, trocar:

```ts
  it("NÃO reprova 'perícia independente'", () => {
    expect(motivos("Passa por perícia independente antes de entrar na vitrine.")).not.toContain("status interno");
  });
});
```

por:

```ts
  it("NÃO reprova 'perícia independente'", () => {
    expect(motivos("Passa por perícia independente antes de entrar na vitrine.")).not.toContain("status interno");
  });

  /**
   * Revisão de 14/09/2026 (qa-guardian). "O resultado do exame ainda não saiu"
   * passava. As outras três já reprovavam e ficam como guarda: a revisão não
   * pode abrir "Veículo em análise" ao prender a regra ao contexto.
   */
  it.each([
    "O resultado do exame ainda não saiu.",
    "Veículo em análise.",
    "Aguardando o resultado do exame.",
    "Documentação pendente de transferência.",
  ])("reprova: %s", (frase) => {
    expect(motivos(frase)).toContain("status interno");
  });

  /** Frases de venda que a regra antiga reprovava. */
  it.each([
    "Está aguardando você no showroom.",
    "Crédito em análise na hora.",
    "Financiamento em análise na hora, sem burocracia.",
  ])("NÃO reprova — frase de venda: %s", (frase) => {
    expect(motivos(frase)).not.toContain("status interno");
  });
});
```

- [ ] **Passo 3: o teste do prompt**

Em `tests/descritivo-gerar.test.ts`, trocar:

```ts
  it("proíbe menção a perícia sem a perícia aprovada", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("NÃO mencione perícia");
  });
```

por:

```ts
  it("proíbe menção a perícia sem a perícia aprovada", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("NÃO mencione perícia");
  });
  /**
   * O prompt nomeia o que a trava reprova (14/09/2026). Termo que
   * MENCIONA_PERICIA reprova e o prompt não nomeia — "sem passagem por leilão"
   * — vira 422 no clique.
   */
  it("nomeia no prompt o que o laudo atesta", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain(
      'sinistro, leilão, Detran, "nada consta" ou restrição de documentação',
    );
  });
```

- [ ] **Passo 4: ver falhar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-validacao.test.ts tests/descritivo-gerar.test.ts --no-file-parallelism
```

Esperado: FALHAM:
- os sete casos de "reprova por falar do que o laudo atesta";
- "reprova: O resultado do exame ainda não saiu.";
- os três de "NÃO reprova — frase de venda";
- "nomeia no prompt o que o laudo atesta".

Passam já antes do código, por serem guardas: os três de "NÃO reprova — frase de venda com palavra vizinha do laudo", e "Veículo em análise.", "Aguardando o resultado do exame." e "Documentação pendente de transferência.".

- [ ] **Passo 5: as duas travas**

Em `src/lib/descritivo/validacao.ts`, trocar:

```ts
 * fronteira reabriria o risco que "aplaudo" já mostrou — um `\w*` sem `\b`
 * também casaria por dentro de palavra nenhuma relacionada.
 */
const MENCIONA_PERICIA =
  /\bper[íi]ci\w*|\bperit\w*|\blaudo\w*|\bcautelar\w*|\bvistoria\w*|\brevistoria\w*|\binspe[çc](?:[ãa]o|[õo]es)\w*|\binspecion\w*/i;

const STATUS_INTERNO = /em an[áa]lise|\bpendente\b|aguardando/i;
```

por:

```ts
 * fronteira reabriria o risco que "aplaudo" já mostrou — um `\w*` sem `\b`
 * também casaria por dentro de palavra nenhuma relacionada.
 *
 * SEGUNDA AMPLIAÇÃO (14/09/2026, qa-guardian). `vistoria\w*` exigia a palavra
 * inteira e deixava passar "vistoriou": a raiz agora é `vistori`. E a frase
 * padrão do campo Laudo cautelar (`LAUDO_APROVADO_PADRAO`, em `laudoPadrao.ts`)
 * passava limpa quando dita sem os substantivos: "estrutura, chassi e
 * histórico de sinistro auditados por empresa independente, credenciada junto
 * ao Detran". Entra o que o laudo atesta: sinistro, auditado, Detran, leilão e
 * "nada consta". Duas formas só contam presas ao contexto, porque soltas são
 * frase de venda: "sem restrição" só depois de "documentação" ("aceita troca
 * sem restrição de ano" passa) e "avaliação técnica" só perto de "aprovado"
 * ("avaliação técnica do seu usado" passa).
 */
const MENCIONA_PERICIA = new RegExp(
  [
    "\\bper[íi]ci\\w*",
    "\\bperit\\w*",
    "\\blaudo\\w*",
    "\\bcautelar\\w*",
    "\\bvistori\\w*",
    "\\brevistori\\w*",
    "\\binspe[çc](?:[ãa]o|[õo]es)\\w*",
    "\\binspecion\\w*",
    "\\bsinistr\\w*",
    "\\bauditad\\w*",
    "\\bdetran\\b",
    "\\bleil(?:[ãa]o|[õo]es)",
    "\\bnada consta\\b",
    "\\bdocumenta[çc][ãa]o\\b[^.!?]{0,15}\\bsem restri[çc]",
    "\\baprovad\\w*[^.!?]{0,30}\\bavalia[çc][ãa]o t[ée]cnica",
    "\\bavalia[çc][ãa]o t[ée]cnica[^.!?]{0,30}\\baprovad",
  ].join("|"),
  "i",
);

/**
 * Andamento do exame exposto no texto.
 *
 * Revisto em 14/09/2026 (qa-guardian), nos dois sentidos. "aguardando" solto
 * reprovava "Está aguardando você no showroom": agora só conta com o objeto
 * do exame logo depois. "em análise" reprovava "Crédito em análise na hora",
 * que é frase de venda: o crédito e o financiamento ficam de fora. E "O
 * resultado do exame ainda não saiu" passava sem nenhuma das três palavras.
 *
 * "em análise" continua valendo em qualquer outra frase, de propósito: é o
 * rótulo cru da coluna `pericia`, e prendê-lo ao objeto do exame deixaria
 * passar "Veículo em análise".
 */
const OBJETO_DO_EXAME = "resultado|exame|laudo|per[íi]cia|vistoria|documenta[çc][ãa]o";
const STATUS_INTERNO = new RegExp(
  [
    "(?<!(?:cr[ée]dito|financiamento|cadastro|proposta)[^.!?]{0,20})em an[áa]lise",
    "\\bpendente\\b",
    `\\baguardando\\s+(?:(?:o|a|os|as)\\s+)?(?:${OBJETO_DO_EXAME}|aprova[çc][ãa]o|libera[çc][ãa]o)`,
    `\\b(?:${OBJETO_DO_EXAME})\\b[^.!?]{0,30}\\bn[ãa]o (?:saiu|ficou pronto|chegou|foi conclu[íi]d[oa])`,
  ].join("|"),
  "i",
);
```

E, em `validarDescritivo`, trocar:

```ts
      "Fala de perícia. Esse assunto tem frase padrão e vive no campo Laudo cautelar — o texto do anúncio não trata dele.",
```

por:

```ts
      "Fala de perícia ou do que o laudo atesta (sinistro, leilão, restrição, Detran). Esse assunto tem frase padrão e vive no campo Laudo cautelar — o texto do anúncio não trata dele.",
```

- [ ] **Passo 6: o prompt**

Em `src/lib/descritivo/briefing.ts`, trocar:

```ts
  // prompt parou de distinguir também.
  regras.push(
    "NÃO mencione perícia, laudo, vistoria, cautelar ou inspeção, em nenhuma hipótese: esse assunto tem frase padrão em outro campo do sistema, e o texto do anúncio não trata dele.",
  );
```

por:

```ts
  // prompt parou de distinguir também. Desde 14/09/2026 ela nomeia também o
  // que o laudo atesta — sinistro, leilão, Detran, "nada consta" —, porque a
  // trava passou a reprovar esses termos, e termo que a trava reprova sem o
  // prompt nomear vira 422 no clique.
  regras.push(
    'NÃO mencione perícia, laudo, vistoria, cautelar, inspeção, sinistro, leilão, Detran, "nada consta" ou restrição de documentação, em nenhuma hipótese: esse assunto tem frase padrão em outro campo do sistema, e o texto do anúncio não trata dele.',
  );
```

- [ ] **Passo 7: ver passar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-validacao.test.ts tests/descritivo-gerar.test.ts tests/promessa-publica.test.ts tests/coerencia-da-pericia.test.ts --no-file-parallelism
```

Esperado: 4 arquivos verdes.

- [ ] **Passo 8: mutações**

Uma de cada vez, com backup, restauração pelo arquivo inteiro e `cmp`. Rodar só `tests/descritivo-validacao.test.ts` e `tests/descritivo-gerar.test.ts`.

| # | Mutação | Tem de falhar, pelo menos |
|---|---|---|
| M1 | `"\\bvistori\\w*"` → `"\\bvistoria\\w*"` | "reprova por falar do que o laudo atesta: vistoriou" |
| M2 | apagar as linhas de `sinistr`, `auditad` e `detran` | "reprova por falar do que o laudo atesta: a frase padrão do laudo sem os substantivos" |
| M3 | a linha da documentação vira `"\\bsem restri[çc]"` | "NÃO reprova — frase de venda com palavra vizinha do laudo: Aceita troca sem restrição de ano." |
| M4 | a alternativa do `aguardando` vira `"aguardando"` | "NÃO reprova — frase de venda: Está aguardando você no showroom." |
| M5 | a primeira alternativa de `STATUS_INTERNO` vira `"em an[áa]lise"` | "NÃO reprova — frase de venda: Crédito em análise na hora." |
| M6 | apagar a alternativa do "não saiu" | "reprova: O resultado do exame ainda não saiu." |
| M7 | tirar `sinistro, leilão, Detran, "nada consta" ou restrição de documentação` do prompt, deixando `inspeção` | "nomeia no prompt o que o laudo atesta" |

- [ ] **Passo 9: commit e push**

```bash
git add src/lib/descritivo/validacao.ts src/lib/descritivo/briefing.ts tests/descritivo-validacao.test.ts tests/descritivo-gerar.test.ts
git commit -m "fix(descritivo): perícia pega o que o laudo atesta, e status interno para de reprovar frase de venda" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

### Tarefa 5: alcance e vocabulário, com os furos e os falsos positivos do qa

**Arquivos:**
- Modificar: `src/lib/descritivo/validacao.ts` (`VOCABULARIO`, linhas 58–59 no main; `PALAVRA_DE_ENTREGA` e `ALCANCE`, linhas 138–142)
- Testar: `tests/descritivo-validacao.test.ts`

**Interfaces:**
- Consome: nada de outra tarefa.
- Produz: nada que outra tarefa use. As regras continuam `"alcance"` e `"vocabulário"`, com os motivos de hoje.

- [ ] **Passo 1: os testes de vocabulário**

Em `tests/descritivo-validacao.test.ts`, trocar:

```ts
  it("aceita 'procedência' e 'estoque' sozinhas, que são palavras da casa", () => {
    expect(motivos("Procedência rastreada, e o estoque inteiro está no site.")).not.toContain("vocabulário");
  });
});
```

por:

```ts
  it("aceita 'procedência' e 'estoque' sozinhas, que são palavras da casa", () => {
    expect(motivos("Procedência rastreada, e o estoque inteiro está no site.")).not.toContain("vocabulário");
  });

  /**
   * Revisão de 14/09/2026 (qa-guardian): as variações que a lista antiga não
   * pegava. "Consulte-nos para mais detalhes." já reprovava e fica como guarda
   * da exceção de "sem consulte-nos" logo abaixo.
   */
  it.each([
    "Acabamento luxuoso.",
    "Os melhores preços da cidade.",
    "Consulte condições.",
    "Exclusividade para você.",
    "Consulte-nos para mais detalhes.",
  ])("reprova a variação do vocabulário barrado: %s", (frase) => {
    expect(motivos(frase)).toContain("vocabulário");
  });

  /** A frase da casa, num rascunho aprovado pelo dono em 17/08 (8324691). */
  it("aceita 'sem consulte-nos'", () => {
    expect(motivos("Preço no anúncio, sem consulte-nos.")).not.toContain("vocabulário");
  });
});
```

- [ ] **Passo 2: os testes de alcance**

No mesmo arquivo, trocar:

```ts
    expect(motivos("Fazemos frete para qualquer ponto do território nacional.")).toContain("alcance");
  });
});
```

por:

```ts
    expect(motivos("Fazemos frete para qualquer ponto do território nacional.")).toContain("alcance");
  });

  /**
   * TERCEIRA REVISÃO (14/09/2026, qa-guardian): "todo o país" sem preposição e
   * lugar fora do recorte passavam. "Entrega em Santa Catarina inteira." já
   * reprovava e fica como guarda: Santa Catarina com palavra de entrega e sem
   * Balneário continua fora do recorte.
   */
  it.each([
    "Atendemos clientes de todo o país.",
    "Entregamos em São Paulo e no Rio Grande do Sul.",
    "Entrega em Florianópolis.",
    "Enviamos para outros estados.",
    "Entrega em Santa Catarina inteira.",
  ])("reprova alcance fora do recorte: %s", (frase) => {
    expect(motivos(frase)).toContain("alcance");
  });

  /**
   * As três primeiras reprovavam: Santa Catarina de procedência, "alcance" de
   * autonomia e "atendimento" de oficina. As outras são guarda: a região
   * metropolitana (São José dos Pinhais é dela), o litoral até Balneário e a
   * frase de alcance dos rascunhos aprovados pelo dono em 17/08.
   */
  it.each([
    "Veio de Santa Catarina com manual e chave reserva.",
    "Híbrido nacional com alcance de 600 km.",
    "Motor nacional, com peças e atendimento fáceis de achar.",
    "Entrega em Curitiba e região metropolitana.",
    "Entrega em São José dos Pinhais.",
    "Entrega em Joinville e Balneário Camboriú.",
    "Showroom no Bacacheri, em Curitiba; entregamos em todo o Paraná e no litoral catarinense até Balneário Camboriú.",
  ])("NÃO reprova: %s", (frase) => {
    expect(motivos(frase)).not.toContain("alcance");
  });
});
```

- [ ] **Passo 3: ver falhar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-validacao.test.ts --no-file-parallelism
```

Esperado: FALHAM:
- no vocabulário: "Acabamento luxuoso.", "Os melhores preços da cidade.", "Consulte condições.", "Exclusividade para você." e "aceita 'sem consulte-nos'";
- no alcance, entre os que devem reprovar: "Atendemos clientes de todo o país.", "Entregamos em São Paulo e no Rio Grande do Sul.", "Entrega em Florianópolis." e "Enviamos para outros estados.";
- no alcance, entre os que devem passar: "Veio de Santa Catarina com manual e chave reserva.", "Híbrido nacional com alcance de 600 km." e "Motor nacional, com peças e atendimento fáceis de achar.".

As demais frases novas passam já antes do código, por serem guardas.

- [ ] **Passo 4: vocabulário**

Em `src/lib/descritivo/validacao.ts`, trocar:

```ts
const VOCABULARIO =
  /\b(premium|luxo|exclusiv[oa]s?|consulte-nos)\b|melhor pre[çc]o|proced[êe]ncia garantida|garantia de proced[êe]ncia|melhor estoque/i;
```

por:

```ts
/**
 * O vocabulário que o POSICIONAMENTO barra.
 *
 * Revisto em 14/09/2026 (qa-guardian), nos dois sentidos. Passavam "luxuoso",
 * "os melhores preços", "consulte condições" e "exclusividade". Reprovava
 * "preço no anúncio, sem consulte-nos", que é frase da casa e está num
 * rascunho aprovado pelo dono em 17/08 (veículo 8324691).
 */
const VOCABULARIO =
  /\b(?:premium|luxo|luxuos[oa]s?|exclusiv\w*)\b|(?<!\bsem\s)\bconsulte(?:-nos)?\b|\bmelhor(?:es)? pre[çc]os?\b|proced[êe]ncia garantida|garantia de proced[êe]ncia|melhor estoque/i;
```

- [ ] **Passo 5: alcance**

No mesmo arquivo, trocar:

```ts
 * passando porque não têm palavra de entrega NENHUMA na frase, e é a
 * AUSÊNCIA da palavra-gatilho que as livra, não o tamanho da janela.
 */
const PALAVRA_DE_ENTREGA = "entrega|entregamos|envio|frete|alcance|cobertura|atendimento|transporte";
const ALCANCE = new RegExp(
  `todo o brasil|(?:em|para) todo o pa[íi]s|(?:${PALAVRA_DE_ENTREGA})[^.!?]{0,40}\\bnacional\\b|\\bnacional\\b[^.!?]{0,40}(?:${PALAVRA_DE_ENTREGA})|santa catarina(?!.{0,40}balne[áa]rio)`,
  "i",
);
```

por:

```ts
 * passando porque não têm palavra de entrega NENHUMA na frase, e é a
 * AUSÊNCIA da palavra-gatilho que as livra, não o tamanho da janela.
 *
 * TERCEIRA REVISÃO (14/09/2026, qa-guardian), nos dois sentidos.
 * - Passavam: "Atendemos clientes de todo o país" (a regra exigia "em" ou
 *   "para" antes de "todo o país"), "Entregamos em São Paulo" e "Entrega em
 *   Florianópolis" (nenhum lugar de fora era nomeado).
 * - Reprovavam: "Veio de Santa Catarina com manual e chave reserva" (qualquer
 *   Santa Catarina sem Balneário depois), "Híbrido nacional com alcance de
 *   600 km" e "Motor nacional, com peças e atendimento fáceis de achar"
 *   ("alcance" e "atendimento" contavam como palavra de entrega).
 * Santa Catarina e os lugares de fora só contam depois de uma palavra de
 * entrega. A lista tem os estados e as cidades catarinenses ao sul de
 * Balneário Camboriú. Ficam de fora "Pará" e "Acre", que colidem com "para" e
 * "acre", e "São José", porque São José dos Pinhais é da região metropolitana
 * de Curitiba.
 */
const PALAVRA_DE_ENTREGA = "entreg\\w*|envi[ao]\\w*|frete\\w*|levamos|atendemos|cobertura|transporte";
const FORA_DO_RECORTE = [
  "s[ãa]o paulo",
  "rio de janeiro",
  "minas gerais",
  "esp[íi]rito santo",
  "rio grande do sul",
  "rio grande do norte",
  "mato grosso",
  "goi[áa]s",
  "distrito federal",
  "bras[íi]lia",
  "bahia",
  "sergipe",
  "alagoas",
  "pernambuco",
  "para[íi]ba",
  "cear[áa]",
  "piau[íi]",
  "maranh[ãa]o",
  "tocantins",
  "amazonas",
  "rond[ôo]nia",
  "roraima",
  "amap[áa]",
  "florian[óo]polis",
  "palho[çc]a",
  "crici[úu]ma",
  "chapec[óo]",
  "lages",
  "tubar[ãa]o",
  "outros estados",
  "qualquer estado",
  "todos os estados",
  "todo o sul",
  "toda a regi[ãa]o sul",
].join("|");
const ALCANCE = new RegExp(
  [
    "todo o brasil",
    "todo o pa[íi]s",
    "todo o territ[óo]rio nacional",
    "qualquer (?:lugar|ponto|parte|canto) do (?:brasil|pa[íi]s|territ[óo]rio)",
    `\\b(?:${PALAVRA_DE_ENTREGA})\\b[^.!?]{0,40}\\bnacional\\b`,
    `\\bnacional\\b[^.!?]{0,40}\\b(?:${PALAVRA_DE_ENTREGA})`,
    `\\b(?:${PALAVRA_DE_ENTREGA})[^.!?]{0,40}\\b(?:${FORA_DO_RECORTE})`,
    `\\b(?:${PALAVRA_DE_ENTREGA})[^.!?]{0,40}\\bsanta catarina(?![^.!?]{0,40}balne[áa]rio)`,
  ].join("|"),
  "i",
);
```

- [ ] **Passo 6: ver passar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-validacao.test.ts tests/promessa-publica.test.ts --no-file-parallelism
```

Esperado: 2 arquivos verdes.

- [ ] **Passo 7: mutações**

Uma de cada vez, com backup, restauração pelo arquivo inteiro e `cmp`. Rodar só `tests/descritivo-validacao.test.ts`.

| # | Mutação | Tem de falhar, pelo menos |
|---|---|---|
| M1 | `"todo o pa[íi]s"` → `"(?:em\|para) todo o pa[íi]s"` | "reprova alcance fora do recorte: Atendemos clientes de todo o país." |
| M2 | apagar a linha de `ALCANCE` que usa `FORA_DO_RECORTE` | "reprova alcance fora do recorte: Entregamos em São Paulo e no Rio Grande do Sul." e "... Entrega em Florianópolis." |
| M3 | acrescentar `\|alcance\|atendimento` ao fim de `PALAVRA_DE_ENTREGA` | "NÃO reprova: Híbrido nacional com alcance de 600 km." e "NÃO reprova: Motor nacional, com peças e atendimento fáceis de achar." |
| M4 | a última linha de `ALCANCE` vira `"santa catarina(?!.{0,40}balne[áa]rio)"` | "NÃO reprova: Veio de Santa Catarina com manual e chave reserva." |
| M5 | tirar `(?<!\bsem\s)` de `VOCABULARIO` | "aceita 'sem consulte-nos'" |
| M6 | tirar `luxuos[oa]s?\|` de `VOCABULARIO` | "reprova a variação do vocabulário barrado: Acabamento luxuoso." |

- [ ] **Passo 8: commit e push**

```bash
git add src/lib/descritivo/validacao.ts tests/descritivo-validacao.test.ts
git commit -m "fix(descritivo): alcance e vocabulário, com os furos e os falsos positivos do qa" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

### Tarefa 6: equipamento conferido por catálogo, com as grafias dos opcionais de produção

**Arquivos:**
- Modificar: `src/lib/descritivo/validacao.ts` (docblock do topo, linhas 10–11 no main; bloco dos equipamentos, linhas 146–182)
- Testar: `tests/descritivo-validacao.test.ts`

**Interfaces:**
- Consome: `dossie.opcionais: string[]`, que `montarDossie` já monta partindo a coluna por vírgula. Sem mudança no dossiê.
- Produz: nada que outra tarefa use. O motivo continua `Afirma equipamento (<itens>) sem dado que sustente.`, agora com o nome do item do catálogo ("bancos em couro", "câmera de ré") no lugar do trecho citado.

- [ ] **Passo 1: os testes**

Em `tests/descritivo-validacao.test.ts`, trocar:

```ts
  it("aceita único dono quando o dossiê tem Donos anteriores", () => {
    expect(motivos("Único dono, sempre na concessionária.", APROVADO)).not.toContain("fato fora do dossiê");
  });
});
```

por:

```ts
  it("aceita único dono quando o dossiê tem Donos anteriores", () => {
    expect(motivos("Único dono, sempre na concessionária.", APROVADO)).not.toContain("fato fora do dossiê");
  });

  /**
   * CATÁLOGO (14/09/2026, qa-guardian). As grafias dos opcionais vêm de
   * produção: 38 veículos com opcionais, SQL de 14/09.
   */
  const comOpcionais = (opcionais: string) =>
    montarDossie({
      marca: "chevrolet", modelo: "onix", ano: 2021, preco: "72900.00",
      quilometragem: 51000, cambio: "manual", cor: "prata", tipo: "Hatch",
      pericia: "Em análise", opcionais,
    });

  /**
   * Outra grafia do mesmo item libera o item. Cada caso prova primeiro que o
   * texto É lido como aquele equipamento (reprova sem o opcional) e só depois
   * que a outra grafia o libera. Sem a primeira asserção, um texto que a regra
   * nem enxergasse passaria por motivo nenhum.
   *
   * "Central multimídia." com "Kit multimídia" já passava pela régua antiga e
   * fica como guarda.
   */
  it.each([
    ["Bancos em couro.", "Bancos de couro"],
    ["Banco em couro.", "bancos em couro"],
    ["Com sensores traseiros.", "Sensor de estacionamento"],
    ["Ar-condicionado digital.", "Ar condicionado digital"],
    ["Com câmera de ré.", "Câmera traseira"],
    ["Com teto panorâmico.", "Teto solar panoramico"],
    ["Central multimídia.", "Kit multimídia"],
    ["Câmera 360.", "Camera 360 graus"],
  ])("'%s' reprova sem opcional e passa com '%s'", (texto, opcional) => {
    expect(motivos(texto, SEM_NADA, "descricao")).toContain("fato fora do dossiê");
    expect(motivos(texto, comOpcionais(opcional), "descricao")).not.toContain("fato fora do dossiê");
  });

  /**
   * Opcional parecido NÃO libera o vizinho. Os três primeiros passavam pela
   * régua antiga, que comparava por `includes`: "teto solar" contém "ar".
   * "Sensor de iluminacao" já reprovava e fica como guarda.
   */
  it.each([
    ["Com teto solar.", "Ar", "teto solar"],
    ["Ar-condicionado digital.", "Ar-condicionado", "ar-condicionado digital"],
    ["Com teto solar panorâmico.", "Teto solar", "teto panorâmico"],
    ["Com sensor de estacionamento.", "Sensor de iluminacao", "sensor de estacionamento"],
  ])("'%s' reprova com o opcional vizinho '%s'", (texto, opcional, item) => {
    const r = validarDescritivo(texto, comOpcionais(opcional), "descricao");
    expect(r.find((x) => x.regra === "fato fora do dossiê")?.motivo).toContain(item);
  });

  it("'Teto solar panoramico' declara o teto solar também", () => {
    expect(motivos("Com teto solar.", SEM_NADA, "descricao")).toContain("fato fora do dossiê");
    expect(motivos("Com teto solar.", comOpcionais("Teto solar panoramico"), "descricao")).not.toContain(
      "fato fora do dossiê",
    );
  });

  it("não conta sensor de chuva nem 'sensores' sem complemento", () => {
    // Controle: o sensor de estacionamento É contado.
    expect(motivos("Com sensor de estacionamento.", SEM_NADA, "descricao")).toContain("fato fora do dossiê");
    expect(motivos("Com sensor de chuva.", SEM_NADA, "descricao")).not.toContain("fato fora do dossiê");
    expect(motivos("Com sensores.", SEM_NADA, "descricao")).not.toContain("fato fora do dossiê");
  });
});
```

- [ ] **Passo 2: ver falhar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-validacao.test.ts --no-file-parallelism
```

Esperado: FALHAM
- sete dos oito casos de "reprova sem opcional e passa com": todos, menos "'Central multimídia.' ... 'Kit multimídia'";
- três dos quatro de "reprova com o opcional vizinho": todos, menos o de "Sensor de iluminacao".

Passam já antes do código, por serem guardas: os dois casos citados acima, "'Teto solar panoramico' declara o teto solar também" e "não conta sensor de chuva nem 'sensores' sem complemento".

- [ ] **Passo 3: o catálogo**

Em `src/lib/descritivo/validacao.ts`, trocar no docblock do topo:

```ts
 * aparecer. Isso NÃO generaliza: nem toda regra de substring usa `\b` —
 * GARANTIA, DONOS, os equipamentos e a primeira alternativa do próprio
 * STATUS_INTERNO ("em an[áa]lise") não usam —, então uma regra nova precisa
```

por:

```ts
 * aparecer. Isso NÃO generaliza: nem toda regra de substring usa `\b` —
 * GARANTIA, DONOS e a primeira alternativa do próprio
 * STATUS_INTERNO ("em an[áa]lise") não usam —, então uma regra nova precisa
```

Antes da troca do bloco dos equipamentos, apagar por script a linha de `semAcento` que chama `s.normalize("NFD")`. Essa linha tem a regex de acentos escrita com escape unicode, e as ferramentas Write e Edit reinterpretam o escape como o caractere cru: um trecho antigo que inclua a linha nunca casa com o arquivo (medido em 14/09/2026, escrevendo este plano). Salvar o script abaixo como `remover-linha.mjs` no workspace da execução, fora do repositório (o caminho vem no brief):

```js
// Apaga a única linha que contém o trecho, preservando o fim de linha das outras.
import { readFileSync, writeFileSync } from "node:fs";

const [arquivo, trecho] = process.argv.slice(2);
const linhas = readFileSync(arquivo, "utf8").split(/(?<=\n)/);
const achadas = linhas.filter((l) => l.includes(trecho));
if (achadas.length !== 1) {
  console.log(`esperava 1 linha com o trecho, achei ${achadas.length}; nada gravado`);
  process.exit(1);
}
writeFileSync(arquivo, linhas.filter((l) => !l.includes(trecho)).join(""), "utf8");
console.log("linha apagada");
```

Rodar na raiz do worktree, com `WS` apontando para o workspace:

```bash
node "$WS/remover-linha.mjs" src/lib/descritivo/validacao.ts 's.normalize("NFD")'
```

Esperado: `linha apagada`. O bloco antigo abaixo já vem sem essa linha.

E trocar o bloco dos equipamentos:

```ts
/**
 * Equipamento citado no texto — cada acerto é conferido CONTRA a lista de
 * opcionais do veículo, um a um.
 *
 * Até 08/09/2026 a guarda era `dossie.opcionais.length === 0 && EQUIPAMENTOS`:
 * ligava só no veículo que não tem opcional NENHUM. Para os 27 que têm, a
 * regra não rodava e o modelo podia citar qualquer coisa — executado pelo
 * portão com o dossiê `["Vidros elétricos","Ar-condicionado"]` e o texto "Traz
 * teto solar, bancos em couro e central multimídia": nenhuma reprovação. Ter um
 * opcional declarado não autoriza os outros.
 */
const EQUIPAMENTOS_FONTE =
  "teto solar|teto panor[âa]mico|banco[s]? em couro|couro|multim[íi]dia|c[âa]mera de r[ée]|sensor de estacionamento|ar-condicionado digital";
const TODOS_OS_EQUIPAMENTOS = new RegExp(EQUIPAMENTOS_FONTE, "gi");

/** Caixa e acento fora: "Ar-condicionado" do dossiê é "ar-condicionado" no texto. */
const semAcento = (s: string) =>

/**
 * O equipamento citado está entre os opcionais declarados?
 *
 * A comparação vale nos dois sentidos porque os dois lados recortam diferente:
 * o texto diz "bancos em couro" onde o dossiê diz "Couro", e o dossiê diz
 * "Central multimídia" onde o texto diz "multimídia".
 */
function equipamentoDeclarado(citado: string, opcionais: string[]): boolean {
  const c = semAcento(citado);
  return opcionais.some((o) => {
    const d = semAcento(o);
    // Opcional vazio casaria com tudo e desligaria a regra em silêncio.
    return d.length > 0 && (d.includes(c) || c.includes(d));
  });
}

/** Os equipamentos que o texto cita e o dossiê não sustenta. */
function equipamentosForaDoDossie(texto: string, opcionais: string[]): string[] {
  const citados = Array.from(texto.matchAll(TODOS_OS_EQUIPAMENTOS), (m) => m[0]);
  return [...new Set(citados.filter((c) => !equipamentoDeclarado(c, opcionais)))];
}
```

por:

```ts
/**
 * Equipamento citado no texto — cada acerto é conferido CONTRA a lista de
 * opcionais do veículo, um a um.
 *
 * Até 08/09/2026 a guarda era `dossie.opcionais.length === 0 && EQUIPAMENTOS`:
 * ligava só no veículo que não tem opcional NENHUM. Para os 27 que têm, a
 * regra não rodava e o modelo podia citar qualquer coisa — executado pelo
 * portão com o dossiê `["Vidros elétricos","Ar-condicionado"]` e o texto "Traz
 * teto solar, bancos em couro e central multimídia": nenhuma reprovação. Ter um
 * opcional declarado não autoriza os outros.
 *
 * CATÁLOGO desde 14/09/2026 (qa-guardian). A versão anterior comparava o
 * trecho citado com cada opcional por `includes`, nos dois sentidos, e errava
 * para os dois lados:
 * - o opcional "Ar" liberava "teto solar", porque "teto solar" contém "ar";
 * - "Ar-condicionado" liberava "ar-condicionado digital", que é outro fato;
 * - "Bancos de couro", "Câmera traseira" e "Ar condicionado digital" não
 *   liberavam "bancos em couro", "câmera de ré" e "ar-condicionado digital".
 * Agora o texto e os opcionais passam pelo mesmo catálogo, e a comparação é
 * pelo nome do item. As grafias vêm dos opcionais gravados em produção (SQL
 * de 14/09/2026, 38 veículos com opcionais): "teto solar panoramico" conta
 * como teto solar e como teto panorâmico, "kit multimídia" é central
 * multimídia, e "sensor de iluminacao" não é sensor de estacionamento.
 *
 * "sensor" e "câmera" sem complemento não contam: não dá para saber qual
 * equipamento é.
 *
 * Depois de "ré" vai `(?!\p{L})`, com a flag `u`, e não `\b`: o `\b` do
 * JavaScript só conhece `[A-Za-z0-9_]`, e "ré\b" nunca casa.
 */
const CATALOGO_DE_EQUIPAMENTOS: { item: string; grafia: RegExp }[] = [
  { item: "teto solar", grafia: /\bteto solar\b/iu },
  { item: "teto panorâmico", grafia: /\bteto (?:solar )?panor[âa]mico\b/iu },
  { item: "bancos em couro", grafia: /\bcouro\b/iu },
  { item: "central multimídia", grafia: /\bmultim[íi]dia\b/iu },
  { item: "câmera de ré", grafia: /\bc[âa]mera (?:de r[ée]|traseira)(?!\p{L})/iu },
  { item: "câmera 360", grafia: /\bc[âa]meras? (?:de )?360\b/iu },
  {
    item: "sensor de estacionamento",
    grafia: /\bsensor(?:es)? (?:de estacionamento|de r[ée](?!\p{L})|traseiros?|dianteiros?)/iu,
  },
  { item: "ar-condicionado digital", grafia: /\bar[- ]condicionado digital\b/iu },
];

/** Os itens do catálogo que o texto cita e os opcionais não declaram. */
function equipamentosForaDoDossie(texto: string, opcionais: string[]): string[] {
  const declarados = new Set(
    CATALOGO_DE_EQUIPAMENTOS.filter((e) => opcionais.some((o) => e.grafia.test(o))).map((e) => e.item),
  );
  return CATALOGO_DE_EQUIPAMENTOS.filter((e) => e.grafia.test(texto) && !declarados.has(e.item)).map(
    (e) => e.item,
  );
}
```

Nenhuma regex do catálogo leva a flag `g`: com `g`, `test` guarda `lastIndex` entre chamadas e erra na segunda.

- [ ] **Passo 4: ver passar**

Guarda de memória, depois:

```bash
npx vitest run tests/descritivo-validacao.test.ts tests/promessa-publica.test.ts --no-file-parallelism
```

Esperado: 2 arquivos verdes. Os testes de equipamento que já existiam seguem verdes. "reprova equipamento fora da lista mesmo com o dossiê tendo outros" continua achando "teto solar" no motivo.

- [ ] **Passo 5: mutações**

Uma de cada vez, com backup, restauração pelo arquivo inteiro e `cmp`. Rodar só `tests/descritivo-validacao.test.ts`.

| # | Mutação | Tem de falhar, pelo menos |
|---|---|---|
| M1 | `/\bteto (?:solar )?panor[âa]mico\b/iu` → `/\bteto panor[âa]mico\b/iu` | "'Com teto panorâmico.' reprova sem opcional e passa com 'Teto solar panoramico'"; "'Com teto solar panorâmico.' reprova com o opcional vizinho 'Teto solar'" |
| M2 | a grafia do sensor vira `/\bsensor(?:es)?\b/iu` | "'Com sensor de estacionamento.' reprova com o opcional vizinho 'Sensor de iluminacao'"; "não conta sensor de chuva nem 'sensores' sem complemento" |
| M3 | na câmera de ré, `(?!\p{L})` → `\b` | "'Com câmera de ré.' reprova sem opcional e passa com 'Câmera traseira'" |
| M4 | tirar `\|traseira` da câmera de ré | "'Com câmera de ré.' reprova sem opcional e passa com 'Câmera traseira'" |

- [ ] **Passo 6: commit e push**

```bash
git add src/lib/descritivo/validacao.ts tests/descritivo-validacao.test.ts
git commit -m "fix(descritivo): equipamento conferido por catálogo, com as grafias dos opcionais de produção" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

### Tarefa 7: portões, revisão final e PR (coordenador)

**Arquivos:** nenhum, salvo correção que um portão exigir. A correção vai para o arquivo da tarefa dona, em commit novo (nunca `--amend`).

**Interfaces:**
- Consome: o branch com as Tarefas 1 a 6 empurradas.
- Produz: o PR para `main`. O merge é do dono.

- [ ] **Passo 1: CI verde no HEAD**

A cada push o workflow `testes` roda a suíte cheia. Depois do push da Tarefa 6:

```bash
git rev-parse HEAD
curl -s "https://api.github.com/repos/85dyones/motors-site-oficial/actions/runs?branch=fix/gerador-de-descritivo&per_page=5"
```

Esperado: o run cujo `head_sha` é o HEAD termina com `"status": "completed"` e `"conclusion": "success"`. Se der vermelho:
1. Ler o log do job na página do Actions.
2. Corrigir no arquivo da tarefa dona e empurrar de novo.
3. Esperar o run novo.

- [ ] **Passo 2: build da Vercel**

O deploy de preview do HEAD fica READY. `next build` confere os tipos de `src/` (não os de `tests/`), então READY prova que os literais de regex compilam no alvo ES2017. Se o deploy der ERROR, ler os logs de build do deploy.

- [ ] **Passo 3: tsc e eslint, nada novo**

Só com ≥ 2000 MB livres:

```bash
node -e "process.exit(require('os').freemem() >= 2000*1048576 ? 0 : 1)"; echo "ram=$?"
npx tsc --noEmit
```

Esperado: os 2 erros do main, ambos em `tests/f0-nucleo.test.ts`, e nenhum nos arquivos deste plano.

```bash
npx eslint src/lib/descritivo/validacao.ts src/lib/descritivo/briefing.ts src/components/admin/SugestaoDeTexto.tsx "src/app/api/estoque/[id]/descritivo/route.ts" tests/descritivo-validacao.test.ts tests/descritivo-gerar.test.ts tests/descritivo-painel.test.ts tests/descritivo-rota.test.ts
git diff origin/main...HEAD -U0
```

Esperado: nenhum problema em linha que o diff tocou. Problema em linha intocada é dívida do main e fica fora. Sem memória para rodar, registrar no PR que não rodou localmente; o build da Vercel cobre os tipos de `src/`.

- [ ] **Passo 4: revisão final (qa-guardian)**

Revisão adversarial do diff `origin/main...HEAD` inteiro contra este plano e as decisões do dono. O revisor não roda vitest (o CI já rodou), não aplica mutação e não chama a OpenAI. Cheques:
1. Cada decisão do dono tem código e teste.
2. Todo docblock afirma só o que a fonte mostra, e os números batem com "Fatos medidos".
3. Cada `not.toContain` anda com um controle que prova o ramo.
4. O painel nunca oferece "Usar este texto" para texto reprovado.
5. O registro não leva o texto gerado, nem nome, e-mail ou id de quem clicou.
6. As travas que varrem `src/` continuam verdes no CI.

Bloqueio volta para a tarefa dona, com nova revisão da correção.

- [ ] **Passo 5: PR**

`gh` não tem login nesta máquina; o PR sai pelo Chrome. Antes de clicar, conferir pela API que não existe PR aberto para o branch:

```bash
curl -s "https://api.github.com/repos/85dyones/motors-site-oficial/pulls?head=85dyones:fix/gerador-de-descritivo&state=open"
```

Abrir `https://github.com/85dyones/motors-site-oficial/compare/main...fix/gerador-de-descritivo?quick_pull=1`.
- **Título:** `fix(descritivo): primeira frase em 155, texto reprovado à vista, registro por geração e as travas do qa`
- **Corpo:**
  - as quatro decisões do dono e o que cada uma mudou;
  - as medidas: rascunhos de 41 para 3 reprovados em 47; 141 casos conferidos; as grafias de produção;
  - como testar: CI verde; no preview, o dono abre um veículo na aba "Texto e SEO", clica "Gerar sugestão" em `descricao_seo` e, se reprovar, lê o texto reprovado;
  - a seção "Fora do escopo" abaixo;
  - última linha: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Passo 6: depois do merge (feito pelo dono)**

A primeira geração em produção deixa uma linha `[descritivo]` no log da Vercel. Ler os logs de runtime com a busca `descritivo`, nas últimas 24 h, e conferir campo, status, regras, tokens e ms. Registrar no handoff.

---

## Fora do escopo (vai no corpo do PR)

- O preço citado no texto envelhece na meta description e no feed quando o preço muda (qa F2).
- O alcance maior só vale acima de R$ 100.000, e a validação não olha o preço; só o prompt pede.
- A mensagem de erro da OpenAI chega ao navegador de quem clicou (qa F4, menor).
- O `store` da Responses API não está desligado, então a OpenAI guarda cada chamada por 30 dias (qa F1, menor).
- Não há limite de cliques por veículo nem `maxDuration` na rota (qa F3).
- Nova tentativa automática quando a primeira frase estoura: o registro dirá antes se ela é necessária.
- Os números de negócio estão fixos no prompt (a mediana de R$ 62.900), e a cópia do POSICIONAMENTO em `briefing.ts` já divergiu do arquivo.
- O `aplicar-rascunhos.js` de 17/08 toma o ponto de milhar por fim de frase. É script histórico e não roda mais.
- Os textos gravados que afirmam perícia aprovada com o exame "Em análise" (o Civic 7518508, publicado, e 10 arquivados): a correção é pelo painel, por decisão do dono de 14/09.
- Garantia, donos e markdown: nenhum furo medido.

## Auto-revisão do plano (14/09/2026)

- **Cobertura das decisões:**
  - 1, a régua da primeira frase com o prompt alinhado → Tarefa 1;
  - 2, o texto reprovado visível → Tarefa 2;
  - 3, o registro por chamada → Tarefa 3;
  - 4, os furos das travas → Tarefa 4 (perícia e status interno), Tarefa 5 (alcance e vocabulário) e Tarefa 6 (equipamentos).
- **Nomes e tipos:**
  - `primeiraFraseDe(texto: string): string` nasce na Tarefa 1 e é importada na Tarefa 3.
  - A regra continua `"abertura"`.
  - Os campos do registro (`tokensEntrada`, `tokensSaida`, `primeiraFrase`, `regras`, `ms`) têm o mesmo nome no código e no teste.
- **Conferência mecânica:**
  - Um script aplicou as 31 trocas deste plano, em ordem, às cópias do main (423d72f), já com o passo da Tarefa 6 que apaga a linha da regex de acentos. Cada trecho antigo casou exatamente 1 vez.
  - O `validacao.ts` resultante é idêntico, byte a byte, ao arquivo que rodou os 141 casos das Tarefas 1, 4, 5 e 6.
- **Não conferido antes da execução:**
  - os testes do painel e da rota (Tarefas 2 e 3), que só rodam no vitest;
  - as travas que varrem `src/` inteiro.
  - Os dois ficam para os passos de verificação de cada tarefa e para o CI.
