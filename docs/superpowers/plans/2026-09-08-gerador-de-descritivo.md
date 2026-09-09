# Gerador de descritivo — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** dois botões na aba "Texto e SEO" do editor de veículo que geram uma sugestão de texto — um para `descricao`, outro para `descricao_seo` — a partir de um dossiê montado só com o que o banco confirma, validada antes de chegar à tela.

**Arquitetura:** o cliente chama `POST /api/estoque/[id]/descritivo`. A rota autentica, lê o veículo **do banco**, monta o dossiê, chama a OpenAI por `fetch`, valida a resposta e devolve o texto. **A rota não grava.** A gravação continua no `PATCH /api/estoque/[id]` que já existe.

**Stack:** Next.js (App Router), TypeScript, Supabase, vitest. Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-08-gerador-de-descritivo-design.md`

## Restrições globais

Valem para toda tarefa, sem repetição:

- **Idioma:** código, nomes de função, variáveis, comentários e mensagens de commit em **português**. Não anglicizar.
- **Nenhuma dependência nova.** O transporte HTTP é o `fetch` do Node. Não instalar `openai` nem nada.
- **Modelo:** `gpt-4.1-mini`, endpoint `POST https://api.openai.com/v1/responses`, campos `model`, `instructions`, `input`.
- **Env:** `OPENAI_API_KEY`. Ausente = HTTP 503 com motivo nomeado, nunca falha silenciosa.
- **A rota nova nunca escreve em `estoque_motors`.**
- **Régua de perícia:** `formatPericia(v.pericia) === "PERÍCIA APROVADA"`, importada de `lib/supabase.ts`. Nunca uma segunda régua, nunca a coluna crua.
- **Nenhuma chamada de rede na suíte.** O transporte entra por injeção.
- **Testes:** `tests/<nome>.test.ts`, `vitest`, imports relativos (`../src/lib/...`).
- Rodar a suíte: `npx vitest run tests/<arquivo>.test.ts`
- Worktree: `C:/Users/Lenovo/Documents/motors-claude/descritivo-seo`, branch `feat/gerador-de-descritivo`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/descritivo/dossie.ts` | monta o dossiê a partir da linha do banco. Puro. |
| `src/lib/descritivo/briefing.ts` | o system prompt e a constante do modelo. Sem lógica. |
| `src/lib/descritivo/validacao.ts` | reprova texto fora do padrão. Puro. |
| `src/lib/descritivo/gerar.ts` | fronteira com a OpenAI. Único arquivo que sabe qual é o fornecedor. |
| `src/app/api/estoque/[id]/descritivo/route.ts` | auth, perfil, orquestração |
| `src/components/admin/SugestaoDeTexto.tsx` | o botão e o painel de sugestão, um por campo |
| `src/components/admin/EditorDeVeiculo.tsx` | monta o painel duas vezes na aba "Texto e SEO" |

---

### Tarefa 1: o dossiê

**Arquivos:**
- Criar: `src/lib/descritivo/dossie.ts`
- Modificar: `src/lib/supabase.ts:193` (exportar `formatPericia`)
- Testar: `tests/descritivo-dossie.test.ts`

**Interfaces:**
- Consome: `formatPericia` de `lib/supabase.ts`.
- Produz: `ROTULOS`, `type Dossie`, `type LinhaDoDossie`, `montarDossie(v)`, `temRotulo(dossie, rotulo)`, `dossieEmTexto(dossie)`.

- [ ] **Passo 1: exportar `formatPericia`**

Em `src/lib/supabase.ts:193`, trocar:

```ts
const formatPericia = (p: string): string => {
```

por:

```ts
/**
 * Normaliza o status da perícia. EXPORTADA desde 2026-09-08 porque o gerador
 * de descritivo precisa da MESMA régua que acende o selo — nenhum veículo tem
 * a string "PERÍCIA APROVADA" no banco (são "Aprovado", "Em análise" e
 * "Aprovado com observação"), e uma segunda régua criaria mais uma verdade
 * sobre a perícia.
 *
 * "Aprovado com observação" conta como aprovado: decisão do dono em 2026-09-08.
 */
export const formatPericia = (p: string): string => {
```

- [ ] **Passo 2: escrever o teste que falha**

Criar `tests/descritivo-dossie.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarDossie, temRotulo, dossieEmTexto, ROTULOS } from "../src/lib/descritivo/dossie";

/**
 * O dossiê é a peça que impede o texto de inventar. O que não está aqui não
 * pode aparecer no anúncio — então campo vazio tem que ficar de FORA, e não
 * entrar como string vazia ou "null".
 */

const X1 = {
  marca: "bmw",
  modelo: "x1 sdrive 20i m sport 2.0 tb flex aut.",
  ano: 2022,
  ano_fabricacao: 2022,
  preco: "179900.00",
  quilometragem: 70700,
  cambio: "automatico",
  combustivel: "flex",
  cor: "cinza",
  tipo: "SUV",
  motor: null,
  portas: null,
  donos_anteriores: null,
  garantia_fabrica: null,
  pericia: "Em análise",
  laudo_pericia: "Laudo cautelar completo — estrutura e chassi auditados",
  opcionais: null,
};

describe("montarDossie", () => {
  it("deixa de fora todo campo vazio", () => {
    const d = montarDossie(X1);
    expect(temRotulo(d, ROTULOS.motorizacao)).toBe(false);
    expect(temRotulo(d, ROTULOS.portas)).toBe(false);
    expect(temRotulo(d, ROTULOS.donos)).toBe(false);
    expect(temRotulo(d, ROTULOS.garantia)).toBe(false);
    expect(temRotulo(d, ROTULOS.opcionais)).toBe(false);
  });

  it("mantém o que o banco confirma", () => {
    const d = montarDossie(X1);
    expect(temRotulo(d, ROTULOS.cor)).toBe(true);
    expect(temRotulo(d, ROTULOS.cambio)).toBe(true);
    expect(temRotulo(d, ROTULOS.km)).toBe(true);
  });

  // O valor real no banco é "Aprovado", nunca "PERÍCIA APROVADA". Comparar a
  // coluna crua liberaria a afirmação para ZERO veículos.
  it("libera a afirmação de perícia com o valor real do banco", () => {
    expect(montarDossie({ ...X1, pericia: "Aprovado" }).periciaAprovada).toBe(true);
  });

  it("trata 'Aprovado com observação' como aprovado (decisão do dono, 08/09/2026)", () => {
    expect(montarDossie({ ...X1, pericia: "Aprovado com observação" }).periciaAprovada).toBe(true);
  });

  it("não libera a afirmação com a perícia em análise", () => {
    expect(montarDossie(X1).periciaAprovada).toBe(false);
  });

  /**
   * O X1 7803195 é o caso real: `pericia` está "Em análise", mas
   * `laudo_pericia` descreve um exame completo. Passar esse texto ao modelo é
   * convidar a afirmação que a régua acabou de negar.
   */
  it("não passa o laudo ao dossiê enquanto a perícia não estiver aprovada", () => {
    const texto = dossieEmTexto(montarDossie(X1));
    expect(texto).not.toContain("Laudo cautelar completo");
  });

  it("passa o laudo quando a perícia está aprovada", () => {
    const texto = dossieEmTexto(montarDossie({ ...X1, pericia: "Aprovado" }));
    expect(texto).toContain("Laudo cautelar completo");
  });

  it("quebra os opcionais em lista", () => {
    const d = montarDossie({ ...X1, opcionais: "airbag, abs, ar-condicionado" });
    expect(d.opcionais).toEqual(["airbag", "abs", "ar-condicionado"]);
  });

  /**
   * O formato é `Rótulo: valor`, nunca JSON. Medido em 08/09/2026: com JSON,
   * gpt-4.1-mini escreveu "motor manual e carroceria branca" — leu
   * {cambio, cor, tipo} como um saco de valores e trocou os campos de lugar.
   */
  it("serializa em linhas rotuladas, não em JSON", () => {
    const texto = dossieEmTexto(montarDossie(X1));
    expect(texto).toContain("Tipo de câmbio: automatico");
    expect(texto).toContain("Cor da pintura: cinza");
    expect(texto).not.toContain("{");
  });
});
```

- [ ] **Passo 3: rodar e ver falhar**

Rodar: `npx vitest run tests/descritivo-dossie.test.ts`
Esperado: FALHA — `Failed to resolve import "../src/lib/descritivo/dossie"`.

- [ ] **Passo 4: implementar**

Criar `src/lib/descritivo/dossie.ts`:

```ts
import { formatPericia } from "../supabase";

/**
 * O dossiê do veículo — a única fonte de fato para o texto gerado.
 *
 * Duas decisões que vieram de medição, não de gosto (08/09/2026, spec §4):
 *
 * 1. O formato é `Rótulo: valor`, nunca JSON. Com JSON, o modelo trata as
 *    chaves como um saco de valores e transfere um para o rótulo do outro —
 *    "motor manual e carroceria branca" numa moto cujo câmbio é manual e cuja
 *    COR é branca. Os rótulos abaixo são desambiguadores de propósito.
 *
 * 2. Campo vazio não entra. O que não está no dossiê não existe para o texto,
 *    e a rota monta as proibições a partir da AUSÊNCIA de cada rótulo.
 */

export const ROTULOS = {
  marca: "Marca",
  modelo: "Modelo",
  anoModelo: "Ano do modelo",
  anoFabricacao: "Ano de fabricação",
  preco: "Preço anunciado (R$)",
  km: "Quilometragem rodada (km)",
  cambio: "Tipo de câmbio",
  combustivel: "Combustível",
  cor: "Cor da pintura",
  carroceria: "Tipo de carroceria",
  motorizacao: "Motorização",
  portas: "Número de portas",
  donos: "Donos anteriores",
  garantia: "Garantia de fábrica",
  opcionais: "Opcionais declarados",
  laudo: "Laudo da perícia",
} as const;

export type Rotulo = (typeof ROTULOS)[keyof typeof ROTULOS];
export type LinhaDoDossie = { rotulo: string; valor: string };

export type Dossie = {
  linhas: LinhaDoDossie[];
  periciaAprovada: boolean;
  opcionais: string[];
};

/** A linha de `estoque_motors` que o dossiê consome. */
export type VeiculoParaDossie = {
  marca?: string | null;
  modelo?: string | null;
  ano?: number | null;
  ano_fabricacao?: number | null;
  preco?: string | number | null;
  quilometragem?: number | string | null;
  cambio?: string | null;
  combustivel?: string | null;
  cor?: string | null;
  tipo?: string | null;
  motor?: string | null;
  portas?: number | string | null;
  donos_anteriores?: number | string | null;
  garantia_fabrica?: string | null;
  pericia?: string | null;
  laudo_pericia?: string | null;
  opcionais?: string | null;
};

const vazio = (x: unknown) => x === null || x === undefined || String(x).trim() === "";

export function montarDossie(v: VeiculoParaDossie): Dossie {
  const linhas: LinhaDoDossie[] = [];
  const por = (rotulo: string, valor: unknown) => {
    if (!vazio(valor)) linhas.push({ rotulo, valor: String(valor).trim() });
  };

  const numero = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR") : null;
  };

  por(ROTULOS.marca, v.marca);
  por(ROTULOS.modelo, v.modelo);
  por(ROTULOS.anoModelo, v.ano);
  por(ROTULOS.anoFabricacao, v.ano_fabricacao);
  por(ROTULOS.preco, vazio(v.preco) ? null : numero(v.preco));
  por(ROTULOS.km, vazio(v.quilometragem) ? null : numero(v.quilometragem));
  por(ROTULOS.cambio, v.cambio);
  por(ROTULOS.combustivel, v.combustivel);
  por(ROTULOS.cor, v.cor);
  por(ROTULOS.carroceria, v.tipo);
  por(ROTULOS.motorizacao, v.motor);
  por(ROTULOS.portas, v.portas);
  por(ROTULOS.donos, v.donos_anteriores);
  por(ROTULOS.garantia, v.garantia_fabrica);

  const opcionais = vazio(v.opcionais)
    ? []
    : String(v.opcionais).split(",").map((s) => s.trim()).filter(Boolean);
  if (opcionais.length > 0) por(ROTULOS.opcionais, opcionais.join("; "));

  const periciaAprovada = formatPericia(v.pericia ?? "") === "PERÍCIA APROVADA";

  // O laudo só entra COM a perícia aprovada. O X1 7803195 é o caso real: a
  // perícia está "Em análise" e o laudo descreve um exame completo — passá-lo
  // ao modelo é convidar a afirmação que a régua acabou de negar.
  if (periciaAprovada) por(ROTULOS.laudo, v.laudo_pericia);

  return { linhas, periciaAprovada, opcionais };
}

export function temRotulo(d: Dossie, rotulo: string): boolean {
  return d.linhas.some((l) => l.rotulo === rotulo);
}

export function dossieEmTexto(d: Dossie): string {
  return d.linhas.map((l) => `${l.rotulo}: ${l.valor}`).join("\n");
}
```

- [ ] **Passo 5: rodar e ver passar**

Rodar: `npx vitest run tests/descritivo-dossie.test.ts`
Esperado: PASSA, 9 testes.

- [ ] **Passo 6: rodar a suíte inteira**

Rodar: `npx vitest run`
Esperado: verde. O `export` em `formatPericia` não muda comportamento, mas travas de invariante varrem `src/` e reprovam em varredura — rodar só o teste da tarefa esconderia isso até a revisão.

- [ ] **Passo 7: commitar**

```bash
git add src/lib/descritivo/dossie.ts src/lib/supabase.ts tests/descritivo-dossie.test.ts
git commit -m "feat(descritivo): o dossie so carrega o que o banco confirma

Campo vazio fica de fora, e o laudo so entra com a pericia aprovada — o X1
7803195 tem laudo que soa aprovado e pericia em analise.

O formato e 'Rotulo: valor', nunca JSON: medido em 08/09, com JSON o modelo
le {cambio, cor, tipo} como um saco de valores e escreve 'motor manual e
carroceria branca' numa moto.

formatPericia foi exportada em vez de duplicada. Nenhum veiculo tem a string
'PERICIA APROVADA' no banco: sao Aprovado (34), Em analise (49) e Aprovado
com observacao (2).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarefa 2: a validação

**Arquivos:**
- Criar: `src/lib/descritivo/validacao.ts`
- Testar: `tests/descritivo-validacao.test.ts`

**Interfaces:**
- Consome: `type Dossie`, `temRotulo`, `ROTULOS` da Tarefa 1.
- Produz: `LIMITE_META`, `type Reprovacao`, `type CampoDeTexto`, `aberturaDe(texto)`, `validarDescritivo(texto, dossie, campo)`.

- [ ] **Passo 1: escrever o teste que falha**

Criar `tests/descritivo-validacao.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validarDescritivo, aberturaDe, LIMITE_META } from "../src/lib/descritivo/validacao";
import { montarDossie } from "../src/lib/descritivo/dossie";

/**
 * Cada regra é testada NOS DOIS SENTIDOS: um texto que ela deve reprovar e um
 * texto legítimo que ela deve deixar passar.
 *
 * Sem o segundo, duas regras teriam entrado em produção quebradas (08/09/2026):
 *   - /pendente/ reprovava TODO texto, porque "perícia independente" contém
 *     "pendente";
 *   - uma regra contra troca de campo reprovava "motor flex", que é português
 *     correto para motor bicombustível.
 * Regra que reprova o legítimo é tão inútil quanto regra que não pega nada.
 */

const SEM_NADA = montarDossie({
  marca: "honda", modelo: "nxr 160 bros", ano: 2022, preco: "18900.00",
  quilometragem: 29300, cambio: "manual", cor: "branca", tipo: "Motocicleta",
  pericia: "Em análise",
});

const APROVADO = montarDossie({
  marca: "fiat", modelo: "titano volcano", ano: 2025, preco: "170900.00",
  quilometragem: 42000, cambio: "automatico", cor: "vermelha", tipo: "Picape",
  pericia: "Aprovado", opcionais: "couro, ar-condicionado digital",
});

const motivos = (t: string, d = SEM_NADA, campo: "descricao" | "descricao_seo" = "descricao_seo") =>
  validarDescritivo(t, d, campo).map((r) => r.regra);

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
});

describe("regra: vocabulário", () => {
  it("reprova o que o POSICIONAMENTO barra", () => {
    expect(motivos("SUV premium com acabamento de luxo.")).toContain("vocabulário");
  });
  it("aceita o vocabulário da casa", () => {
    expect(motivos("Procedência rastreada e preço no anúncio.")).not.toContain("vocabulário");
  });
});

describe("regra: perícia", () => {
  it("reprova afirmação de aprovação sem o dado", () => {
    expect(motivos("Laudo cautelar aprovado sem apontamentos.")).toContain("perícia");
  });
  it("aceita a mesma afirmação quando o dossiê autoriza", () => {
    expect(motivos("Laudo cautelar aprovado sem apontamentos.", APROVADO)).not.toContain("perícia");
  });
  it("aceita falar do processo sem o dado", () => {
    expect(motivos("Passa por perícia independente antes de entrar na vitrine.")).not.toContain("perícia");
  });
});

describe("regra: status interno", () => {
  it("reprova expor que o exame não fechou", () => {
    expect(motivos("Neste caso, o exame está em análise.")).toContain("status interno");
  });
  /** "perícia independente" contém "pendente" — a armadilha que reprovava tudo. */
  it("NÃO reprova 'perícia independente'", () => {
    expect(motivos("Passa por perícia independente antes de entrar na vitrine.")).not.toContain("status interno");
  });
});

describe("regra: alcance", () => {
  it("reprova 'todo o Brasil'", () => {
    expect(motivos("Entrega para todo o Brasil.")).toContain("alcance");
  });
  it("aceita o recorte do POSICIONAMENTO", () => {
    expect(motivos("Entrega para Paraná e Santa Catarina até Balneário Camboriú.")).not.toContain("alcance");
  });
});

describe("regra: markdown", () => {
  it("reprova negrito, que iria cru para o XML do feed", () => {
    expect(motivos("**BMW X1 sDrive 20i** com 70.700 km.")).toContain("markdown");
  });
  it("aceita texto corrido", () => {
    expect(motivos("BMW X1 sDrive 20i com 70.700 km.")).not.toContain("markdown");
  });
});

describe("regra: fato fora do dossiê", () => {
  it("reprova garantia que o veículo não tem", () => {
    expect(motivos("Com garantia de motor e câmbio.")).toContain("fato fora do dossiê");
  });
  it("reprova 'único dono' sem o dado", () => {
    expect(motivos("Único dono, sempre na concessionária.")).toContain("fato fora do dossiê");
  });
  it("reprova opcional citado num veículo sem opcionais", () => {
    expect(motivos("Com teto solar e bancos em couro.")).toContain("fato fora do dossiê");
  });
  it("aceita opcional que está no dossiê", () => {
    expect(motivos("Bancos em couro e ar-condicionado digital.", APROVADO)).not.toContain("fato fora do dossiê");
  });
});

describe("texto limpo", () => {
  it("não devolve reprovação nenhuma", () => {
    const bom = "Honda NXR 160 Bros ESDD 2022 com 29.300 km e câmbio manual, em pintura branca. Passa por perícia independente antes de entrar na vitrine. Showroom no Bacacheri, Curitiba.";
    expect(validarDescritivo(bom, SEM_NADA, "descricao_seo")).toEqual([]);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/descritivo-validacao.test.ts`
Esperado: FALHA — módulo `validacao` não existe.

- [ ] **Passo 3: implementar**

Criar `src/lib/descritivo/validacao.ts`:

```ts
import { ROTULOS, temRotulo, type Dossie } from "./dossie";

/**
 * Reprova texto fora do padrão antes de ele chegar à tela.
 *
 * Toda regra de substring usa `\b`. Sem isso, /pendente/ reprova
 * "perícia independente" e a validação passa a reprovar tudo — defeito medido
 * em 08/09/2026, que fez uma tabela de resultados parecer "cinco modelos
 * ruins" antes de a causa aparecer.
 *
 * LIMITE CONHECIDO: nada aqui detecta TROCA DE CAMPO — "motor manual" quando
 * o manual é o câmbio. As duas frases são bem-formadas e nenhuma regex as
 * separa sem reprovar "motor flex", que é correto. Por isso o texto vai para
 * revisão humana num painel, e não direto para o campo.
 */

/** Onde `truncateString(cleanDescription, 155)` corta a meta description da PDP. */
export const LIMITE_META = 155;

export type CampoDeTexto = "descricao" | "descricao_seo";
export type Reprovacao = { regra: string; motivo: string };

/** As duas primeiras frases — o que o Google mostra. */
export function aberturaDe(texto: string): string {
  const frases = texto.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+/g);
  if (!frases || frases.length === 0) return texto.replace(/\s+/g, " ").trim();
  return frases.slice(0, 2).join("").trim();
}

const VOCABULARIO = /\b(premium|luxo|exclusiv[oa]s?|consulte-nos)\b|melhor pre[çc]o/i;
const AFIRMA_PERICIA = /(laudo|per[íi]cia|cautelar)[^.!?]{0,40}(aprovad|100%|sem apontament)/i;
const STATUS_INTERNO = /em an[áa]lise|\bpendente\b|aguardando/i;
const ALCANCE = /todo o brasil|\bnacional\b|santa catarina(?!.{0,40}balne[áa]rio)/i;
const MARKDOWN = /\*\*|^#{1,6}\s|\[.+\]\(.+\)|^\s*[-*]\s/m;
const GARANTIA = /garantia de (motor|f[áa]brica)/i;
const DONOS = /[úu]nico dono|[úu]nica dona/i;
const EQUIPAMENTOS = /teto solar|teto panor[âa]mico|banco[s]? em couro|couro|multim[íi]dia|c[âa]mera de r[ée]|sensor de estacionamento|ar-condicionado digital/i;

export function validarDescritivo(
  texto: string,
  dossie: Dossie,
  campo: CampoDeTexto,
): Reprovacao[] {
  const r: Reprovacao[] = [];
  const add = (regra: string, motivo: string) => r.push({ regra, motivo });

  if (campo === "descricao_seo") {
    const ab = aberturaDe(texto).length;
    if (ab > LIMITE_META) {
      add("abertura", `A abertura tem ${ab} caracteres e o Google corta em ${LIMITE_META}.`);
    }
  }

  if (VOCABULARIO.test(texto)) {
    add("vocabulário", 'Usa palavra que o posicionamento da loja barra ("premium", "luxo", "consulte-nos").');
  }

  if (!dossie.periciaAprovada && AFIRMA_PERICIA.test(texto)) {
    add("perícia", "Afirma laudo aprovado, e a perícia deste veículo não está aprovada.");
  }

  if (STATUS_INTERNO.test(texto)) {
    add("status interno", 'Expõe o andamento do exame ("em análise", "pendente"). Isso é status interno da loja.');
  }

  if (ALCANCE.test(texto)) {
    add("alcance", "Promete alcance maior que Paraná e Santa Catarina até Balneário Camboriú.");
  }

  if (MARKDOWN.test(texto)) {
    add("markdown", "Tem marcação. O texto vai cru para o XML do feed e apareceria com os símbolos.");
  }

  const inventados: string[] = [];
  if (!temRotulo(dossie, ROTULOS.garantia) && GARANTIA.test(texto)) inventados.push("garantia");
  if (!temRotulo(dossie, ROTULOS.donos) && DONOS.test(texto)) inventados.push("número de donos");
  if (dossie.opcionais.length === 0 && EQUIPAMENTOS.test(texto)) inventados.push("equipamento");
  if (inventados.length > 0) {
    add("fato fora do dossiê", `Afirma ${inventados.join(", ")} sem dado que sustente.`);
  }

  return r;
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run tests/descritivo-validacao.test.ts`
Esperado: PASSA, 18 testes.

- [ ] **Passo 5: commitar**

```bash
git add src/lib/descritivo/validacao.ts tests/descritivo-validacao.test.ts
git commit -m "feat(descritivo): seis regras, cada uma testada nos dois sentidos

Cada regra tem um teste que ela deve reprovar e um texto legitimo que ela
deve soltar. Sem o segundo, duas regras entrariam quebradas: /pendente/
reprovava 'pericia independente', e a regra contra troca de campo reprovava
'motor flex'.

O limite conhecido esta no docblock: nada aqui pega troca de campo. E por
isso que o texto vai para revisao humana.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarefa 3: o briefing e a fronteira com a OpenAI

**Arquivos:**
- Criar: `src/lib/descritivo/briefing.ts`, `src/lib/descritivo/gerar.ts`
- Testar: `tests/descritivo-gerar.test.ts`

**Interfaces:**
- Consome: `Dossie`, `dossieEmTexto`, `temRotulo`, `ROTULOS` (Tarefa 1); `CampoDeTexto` (Tarefa 2).
- Produz: `MODELO`, `montarInstrucoes()`, `montarEntrada(dossie, campo)`, `type Transporte`, `type ResultadoGeracao`, `gerarTexto({ dossie, campo, chave, transporte })`.

- [ ] **Passo 1: criar o briefing**

Criar `src/lib/descritivo/briefing.ts`:

```ts
import { ROTULOS, temRotulo, dossieEmTexto, type Dossie } from "./dossie";
import type { CampoDeTexto } from "./validacao";

/**
 * O prompt do gerador.
 *
 * O modelo é constante nomeada de propósito: trocá-lo é uma linha, e a
 * escolha veio de medir nove modelos em 08/09/2026 (spec §5.1). gpt-4.1-mini
 * passou em 10 de 10 gerações depois de o dossiê virar linhas rotuladas, a
 * US$ 0,001 por texto e 2,5 s por clique — latência pesa num botão de painel.
 */
export const MODELO = "gpt-4.1-mini";

/**
 * O posicionamento da loja, aprovado pelo dono em 2026-08-17.
 *
 * É cópia deliberada de `conteudo-seo/POSICIONAMENTO.md`, e não leitura do
 * arquivo: o prompt de produção não pode depender de um .md que vive fora de
 * `src/` e que ninguém garante estar no bundle da Vercel.
 *
 * O "Exemplo trabalhado" do BRIEFING.md fica de FORA. Ele descreve uma VW
 * Saveiro e afirma "garantia de motor e câmbio"; medido em 08/09/2026,
 * gpt-4o-mini copiou a frase para um BMW que não tem esse dado. Exemplo fixo
 * em diretriz vira bordão.
 */
const POSICIONAMENTO = `
A Motors Store é uma revenda de seminovos em Curitiba/PR, com showroom na Rua
Ernesto Piazzetta, 98 — Bacacheri.

O ativo da loja não é o carro que ela vende, é o carro que ela RECUSA: de cada
dez veículos avaliados, três entram. A frase-mãe é "o carro que passou".

VOCABULÁRIO
Use: passou, aprovado, selecionado, procedência, perícia cautelar
independente, preço no anúncio.
Nunca use: premium, luxo, exclusivo, "consulte-nos", "melhor preço",
"procedência garantida", "o melhor estoque da região".

Por quê: a mediana do estoque é R$ 62.900. "Premium" aplicado a um carro de
R$ 27.000 é uma mentira pequena que o comprador percebe na primeira linha.
"Passou" funciona em R$ 13.900 e em R$ 318.900.

GEOGRAFIA
Âncora sempre presente: showroom no Bacacheri, em Curitiba.
Alcance maior só quando o preço passa de R$ 100.000 — e o limite é Paraná e
Santa Catarina ATÉ Balneário Camboriú. Nunca "todo o Brasil".

O QUE O TEXTO PRECISA FAZER
O veículo é o assunto; a loja é o contexto. Nada de despejo de ficha técnica,
e nada de texto institucional que serviria para qualquer carro.
`.trim();

const FORMATO: Record<CampoDeTexto, string> = {
  descricao_seo: `
Escreva o campo \`descricao_seo\`: a frase de anúncio que vai para o feed dos
portais e para a descrição que aparece na busca do Google.

REGRA DURA: as duas primeiras frases precisam caber em 155 caracteres, porque
é onde o Google corta. APROVEITE o espaço — mire entre 130 e 155, não 70.
O texto inteiro pode passar disso; a ABERTURA não pode.
`.trim(),
  descricao: `
Escreva o campo \`descricao\`: o texto editorial que ABRE a página do veículo.
Dois ou três parágrafos curtos, entre 400 e 700 caracteres no total.
Comece pelo veículo e pelo fato mais forte dele, não pela loja.
`.trim(),
};

export function montarInstrucoes(): string {
  return [
    "Você escreve anúncios de veículos para a Motors Store, revenda de seminovos em Curitiba/PR.",
    "Siga o posicionamento abaixo à risca.",
    "",
    POSICIONAMENTO,
  ].join("\n");
}

/**
 * As proibições são montadas POR VEÍCULO, a partir da ausência de cada rótulo.
 * Medido em 08/09/2026: com proibições genéricas, metade dos modelos
 * escorregava; com elas explícitas, os finalistas passaram em tudo.
 */
export function montarEntrada(dossie: Dossie, campo: CampoDeTexto): string {
  const regras: string[] = [];

  if (dossie.periciaAprovada) {
    regras.push("Você PODE afirmar que a perícia cautelar independente foi APROVADA — o dado sustenta.");
  } else {
    regras.push(
      'NÃO afirme aprovação de laudo ou perícia. Fale só do PROCESSO: "passa por perícia independente antes de entrar na vitrine". E NÃO diga que o exame está em análise, pendente ou aguardando: isso é status interno da loja.',
    );
  }

  if (dossie.opcionais.length === 0) {
    regras.push("NÃO cite nenhum opcional, equipamento ou acessório: não há dado.");
  } else {
    regras.push("Cite no máximo 3 opcionais, escolhidos da linha 'Opcionais declarados'. Nenhum outro.");
  }

  if (!temRotulo(dossie, ROTULOS.garantia)) {
    regras.push("NÃO cite garantia de fábrica nem garantia de motor e câmbio: não há dado.");
  }
  if (!temRotulo(dossie, ROTULOS.donos)) {
    regras.push('NÃO cite número de donos nem "único dono": não há dado.');
  }
  if (!temRotulo(dossie, ROTULOS.motorizacao)) {
    regras.push("NÃO descreva a motorização nem cite cilindrada: não há dado.");
  }

  regras.push(
    "Alcance: showroom no Bacacheri, Curitiba. Só mencione alcance maior se o preço passar de R$ 100.000, e nesse caso o limite é Paraná e Santa Catarina ATÉ Balneário Camboriú — nunca 'todo o Brasil'.",
  );
  regras.push("Escreva TEXTO CORRIDO. Sem markdown, sem asteriscos, sem título, sem lista.");

  return [
    FORMATO[campo],
    "",
    "FICHA DO VEÍCULO — cada linha é `Rótulo: valor`. O valor pertence ao rótulo da própria linha.",
    "Não transfira um valor para outro rótulo: a cor é da pintura, o câmbio não é o motor,",
    "e a carroceria não tem cor. O que não está aqui não existe e não pode ser mencionado.",
    "",
    dossieEmTexto(dossie),
    "",
    "REGRAS:",
    ...regras.map((x) => "- " + x),
    "",
    "Responda APENAS com o texto do anúncio, sem aspas e sem comentário.",
  ].join("\n");
}
```

- [ ] **Passo 2: escrever o teste que falha**

Criar `tests/descritivo-gerar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { montarEntrada, MODELO } from "../src/lib/descritivo/briefing";
import { gerarTexto, type Transporte } from "../src/lib/descritivo/gerar";
import { montarDossie } from "../src/lib/descritivo/dossie";

/**
 * NENHUMA chamada de rede. O transporte entra por injeção, e o dublê responde
 * a FORMA REAL da API — `output_text` e `usage.input_tokens`. Dublê mais
 * permissivo que o servidor deixa um teste verde sobre resposta que o servidor
 * nunca daria.
 */

const SEM_NADA = montarDossie({
  marca: "honda", modelo: "nxr 160", ano: 2022, preco: "18900.00",
  quilometragem: 29300, cambio: "manual", cor: "branca", tipo: "Motocicleta",
  pericia: "Em análise",
});
const COM_TUDO = montarDossie({
  marca: "fiat", modelo: "titano", ano: 2025, preco: "170900.00",
  quilometragem: 42000, cambio: "automatico", cor: "vermelha", tipo: "Picape",
  pericia: "Aprovado", opcionais: "couro, ar digital", garantia_fabrica: "até 2027",
});

const respostaOk = (texto: string): Transporte => async () =>
  new Response(
    JSON.stringify({ output_text: texto, usage: { input_tokens: 2200, output_tokens: 80 } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("montarEntrada", () => {
  it("proíbe opcional quando o veículo não tem nenhum", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("NÃO cite nenhum opcional");
  });
  it("libera até 3 opcionais quando existem", () => {
    expect(montarEntrada(COM_TUDO, "descricao_seo")).toContain("no máximo 3 opcionais");
  });
  it("proíbe afirmar perícia quando o dossiê não autoriza", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("NÃO afirme aprovação");
  });
  it("libera a afirmação quando o dossiê autoriza", () => {
    expect(montarEntrada(COM_TUDO, "descricao_seo")).toContain("PODE afirmar");
  });
  it("não proíbe garantia quando o veículo tem", () => {
    expect(montarEntrada(COM_TUDO, "descricao_seo")).not.toContain("NÃO cite garantia");
  });
  it("manda o dossiê em linhas rotuladas", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("Cor da pintura: branca");
  });
  it("pede formato diferente para cada campo", () => {
    expect(montarEntrada(SEM_NADA, "descricao_seo")).toContain("155 caracteres");
    expect(montarEntrada(SEM_NADA, "descricao")).toContain("ABRE a página");
  });
});

describe("gerarTexto", () => {
  it("devolve 503 sem chave, com o motivo nomeado", async () => {
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "", transporte: respostaOk("x") });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(503);
      expect(r.motivo).toContain("OPENAI_API_KEY");
    }
  });

  it("devolve o texto e os tokens quando a API responde", async () => {
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: respostaOk("  Honda NXR 160.  ") });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toBe("Honda NXR 160.");
      expect(r.entrada).toBe(2200);
    }
  });

  it("manda o modelo escolhido e o endpoint de responses", async () => {
    let urlVista = "", corpoVisto: any = null;
    const espiao: Transporte = async (url, init) => {
      urlVista = url;
      corpoVisto = JSON.parse(String(init?.body));
      return respostaOk("ok")(url, init);
    };
    await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: espiao });
    expect(urlVista).toBe("https://api.openai.com/v1/responses");
    expect(corpoVisto.model).toBe(MODELO);
    expect(corpoVisto.instructions).toContain("Motors Store");
  });

  it("devolve 502 com o motivo quando a API recusa", async () => {
    const recusa: Transporte = async () =>
      new Response(JSON.stringify({ error: { message: "modelo inexistente" } }), { status: 404 });
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: recusa });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(502);
      expect(r.motivo).toContain("modelo inexistente");
    }
  });

  it("devolve 502 quando o transporte estoura", async () => {
    const explode: Transporte = async () => { throw new Error("socket hang up"); };
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: explode });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("socket hang up");
  });

  /** Resposta 200 com corpo vazio existe, e virava string vazia no campo. */
  it("devolve 502 quando a API responde 200 sem texto", async () => {
    const vazio: Transporte = async () =>
      new Response(JSON.stringify({ usage: { input_tokens: 1, output_tokens: 0 } }), { status: 200 });
    const r = await gerarTexto({ dossie: SEM_NADA, campo: "descricao_seo", chave: "sk-teste", transporte: vazio });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(502);
  });
});
```

- [ ] **Passo 3: rodar e ver falhar**

Rodar: `npx vitest run tests/descritivo-gerar.test.ts`
Esperado: FALHA — `gerar` não existe.

- [ ] **Passo 4: implementar**

Criar `src/lib/descritivo/gerar.ts`:

```ts
import { MODELO, montarEntrada, montarInstrucoes } from "./briefing";
import type { Dossie } from "./dossie";
import type { CampoDeTexto } from "./validacao";

/**
 * A fronteira com a OpenAI — o ÚNICO arquivo que sabe qual é o fornecedor.
 *
 * Sem SDK: o projeto tem 8 dependências e nenhuma é de LLM, e a chamada é um
 * POST só. O preço disso é que timeout não vem de graça, então ele é
 * explícito aqui.
 */

const ENDPOINT = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 30_000;

/** O `fetch` entra por parâmetro para a suíte não tocar a rede. */
export type Transporte = (url: string, init?: RequestInit) => Promise<Response>;

export type ResultadoGeracao =
  | { ok: true; texto: string; entrada: number; saida: number }
  | { ok: false; status: 502 | 503; motivo: string };

function textoDaResposta(j: any): string {
  if (typeof j?.output_text === "string" && j.output_text.trim()) return j.output_text.trim();
  if (Array.isArray(j?.output)) {
    const t = j.output
      .flatMap((o: any) => (o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text))
      .join("")
      .trim();
    if (t) return t;
  }
  return "";
}

export async function gerarTexto(opts: {
  dossie: Dossie;
  campo: CampoDeTexto;
  chave: string;
  transporte?: Transporte;
}): Promise<ResultadoGeracao> {
  const { dossie, campo, chave } = opts;
  const transporte = opts.transporte ?? fetch;

  if (!chave || !chave.trim()) {
    return {
      ok: false,
      status: 503,
      motivo: "Gerador indisponível: falta OPENAI_API_KEY nas variáveis de ambiente.",
    };
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await transporte(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        instructions: montarInstrucoes(),
        input: montarEntrada(dossie, campo),
      }),
      signal: controle.signal,
    });

    const corpo = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const detalhe = corpo?.error?.message ?? `HTTP ${resposta.status}`;
      return { ok: false, status: 502, motivo: `A OpenAI recusou a chamada: ${detalhe}` };
    }

    const texto = textoDaResposta(corpo);
    if (!texto) {
      return { ok: false, status: 502, motivo: "A OpenAI respondeu sem texto." };
    }

    return {
      ok: true,
      texto,
      entrada: Number(corpo?.usage?.input_tokens ?? 0),
      saida: Number(corpo?.usage?.output_tokens ?? 0),
    };
  } catch (erro: any) {
    const motivo = erro?.name === "AbortError"
      ? `A geração passou de ${TIMEOUT_MS / 1000} segundos e foi interrompida.`
      : `Falha ao falar com a OpenAI: ${erro?.message ?? String(erro)}`;
    return { ok: false, status: 502, motivo };
  } finally {
    clearTimeout(relogio);
  }
}
```

- [ ] **Passo 5: rodar e ver passar**

Rodar: `npx vitest run tests/descritivo-gerar.test.ts`
Esperado: PASSA, 13 testes.

- [ ] **Passo 6: commitar**

```bash
git add src/lib/descritivo/briefing.ts src/lib/descritivo/gerar.ts tests/descritivo-gerar.test.ts
git commit -m "feat(descritivo): o briefing e a fronteira com a OpenAI

O 'Exemplo trabalhado' do BRIEFING.md fica de fora do prompt: gpt-4o-mini
copiou 'garantia de motor e cambio' da Saveiro dele para um BMW sem o dado.

As proibicoes sao montadas POR VEICULO, a partir da ausencia de cada rotulo.
Com proibicao generica, metade dos modelos escorregava.

Sem SDK, entao o timeout e explicito. O transporte entra por injecao e o
duble responde a forma real da API, nao uma forma conveniente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarefa 4: a rota

**Arquivos:**
- Criar: `src/app/api/estoque/[id]/descritivo/route.ts`
- Testar: `tests/descritivo-rota.test.ts`

**Interfaces:**
- Consome: `ehStaff`, `perfisDe`, `campoNegadoAoPerfil` de `lib/permissoes`; `createServerSupabaseClient` de `lib/supabase-server`; `normalizarId` de `lib/estoqueEscrita`; `montarDossie` (T1), `validarDescritivo` (T2), `gerarTexto` (T3).
- Produz: `POST` em `/api/estoque/[id]/descritivo`.

- [ ] **Passo 1: escrever o teste que falha**

Criar `tests/descritivo-rota.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A porta do gerador.
 *
 * A rota é NOVA e a régua de permissão é COMPARTILHADA com o PATCH que já
 * existe. Cobertura por vizinhança não é cobertura: o que este arquivo guarda
 * é que a rota nova de fato passa pela régua, não que exista uma segunda.
 */

const CLIENTE = { auth: { getUser: vi.fn() }, from: vi.fn() };
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => CLIENTE }));

const gerarTexto = vi.fn();
vi.mock("../src/lib/descritivo/gerar", () => ({ gerarTexto: (...a: any[]) => gerarTexto(...a) }));

const { POST } = await import("../src/app/api/estoque/[id]/descritivo/route");

const VEICULO = {
  id: 7803195, marca: "bmw", modelo: "x1", ano: 2022, preco: "179900.00",
  quilometragem: 70700, cambio: "automatico", cor: "cinza", tipo: "SUV",
  pericia: "Em análise", laudo_pericia: "Laudo completo", opcionais: null,
};

function comPerfil(papeis: string[] | null) {
  CLIENTE.auth.getUser.mockResolvedValue(
    papeis === null ? { data: { user: null } } : { data: { user: { id: "u1", email: "a@b.c" } } },
  );
  CLIENTE.from.mockImplementation((tabela: string) => {
    if (tabela === "profiles") {
      return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: papeis?.[0] ?? null, papeis, full_name: "Teste" } }) }) }) };
    }
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: VEICULO }) }) }) };
  });
}

const chamar = (corpo: any = { campo: "descricao_seo" }) =>
  POST(new Request("http://x/api/estoque/7803195/descritivo", {
    method: "POST", body: JSON.stringify(corpo), headers: { "content-type": "application/json" },
  }) as any, { params: Promise.resolve({ id: "7803195" }) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-teste";
  gerarTexto.mockResolvedValue({ ok: true, texto: "Texto limpo do anúncio.", entrada: 2200, saida: 80 });
});

describe("POST /api/estoque/[id]/descritivo", () => {
  it("recusa quem não tem sessão", async () => {
    comPerfil(null);
    expect((await chamar()).status).toBe(401);
  });

  it("recusa cliente da Garagem, que é authenticated sem ser staff", async () => {
    comPerfil(["cliente"]);
    expect((await chamar()).status).toBe(403);
  });

  it("recusa o perfil que não edita o campo", async () => {
    comPerfil(["gestor"]);
    expect((await chamar()).status).toBe(403);
  });

  it("aceita marketing, que edita o campo", async () => {
    comPerfil(["marketing"]);
    expect((await chamar()).status).toBe(200);
  });

  it("recusa campo que não é de texto", async () => {
    comPerfil(["admin"]);
    expect((await chamar({ campo: "preco" })).status).toBe(400);
  });

  it("devolve 503 com o motivo quando falta a chave", async () => {
    comPerfil(["admin"]);
    gerarTexto.mockResolvedValue({ ok: false, status: 503, motivo: "falta OPENAI_API_KEY" });
    const r = await chamar();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("OPENAI_API_KEY");
  });

  it("devolve 422 com os motivos quando o texto reprova", async () => {
    comPerfil(["admin"]);
    gerarTexto.mockResolvedValue({ ok: true, texto: "SUV premium com garantia de motor e câmbio.", entrada: 1, saida: 1 });
    const r = await chamar();
    expect(r.status).toBe(422);
    const j = await r.json();
    expect(j.motivos.map((m: any) => m.regra)).toContain("vocabulário");
  });

  it("devolve o texto e a contagem quando passa", async () => {
    comPerfil(["admin"]);
    const j = await (await chamar()).json();
    expect(j.texto).toBe("Texto limpo do anúncio.");
    expect(j.caracteres).toBe("Texto limpo do anúncio.".length);
  });

  /** A régua da perícia tem que sair do BANCO, não do corpo da requisição. */
  it("não deixa o corpo da requisição decidir a perícia", async () => {
    comPerfil(["admin"]);
    await chamar({ campo: "descricao_seo", pericia: "Aprovado" });
    expect(gerarTexto.mock.calls[0][0].dossie.periciaAprovada).toBe(false);
  });

  it("nunca grava no banco", async () => {
    comPerfil(["admin"]);
    await chamar();
    const escreveu = CLIENTE.from.mock.results.some(
      (r: any) => r.value && ("update" in r.value || "insert" in r.value || "upsert" in r.value),
    );
    expect(escreveu).toBe(false);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/descritivo-rota.test.ts`
Esperado: FALHA — rota não existe.

- [ ] **Passo 3: implementar**

Criar `src/app/api/estoque/[id]/descritivo/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { campoNegadoAoPerfil, ehStaff, perfisDe } from "../../../../../lib/permissoes";
import { normalizarId } from "../../../../../lib/estoqueEscrita";
import { montarDossie } from "../../../../../lib/descritivo/dossie";
import { validarDescritivo, type CampoDeTexto } from "../../../../../lib/descritivo/validacao";
import { gerarTexto } from "../../../../../lib/descritivo/gerar";

export const dynamic = "force-dynamic";

/**
 * Gera uma SUGESTÃO de texto para o veículo. NÃO grava.
 *
 * A gravação continua no PATCH da rota irmã, que já valida campo por perfil e
 * já alimenta o histórico do veículo — uma porta de escrita só.
 *
 * O veículo é lido do BANCO, nunca do corpo: senão bastaria mandar
 * `pericia: "Aprovado"` no JSON para liberar a afirmação de laudo aprovado
 * num carro cujo exame não fechou.
 */

const CAMPOS: CampoDeTexto[] = ["descricao", "descricao_seo"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis, full_name")
      .eq("id", user.id)
      .single();

    // Cliente da Garagem é authenticated sem ser staff; normalizar sem barrar
    // o promoveria a "comercial".
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = perfisDe(profile);

    const body = await request.json().catch(() => ({}));
    const campo = body?.campo as CampoDeTexto;
    if (!CAMPOS.includes(campo)) {
      return NextResponse.json(
        { error: `Campo inválido. Esperado ${CAMPOS.join(" ou ")}.` },
        { status: 400 },
      );
    }

    // Quem não grava o campo não gera sugestão para ele. Mesma régua do PATCH.
    const negado = campoNegadoAoPerfil(perfil, [campo]);
    if (negado) {
      return NextResponse.json(
        { error: `Seu perfil não altera "${negado.campo}" (${negado.acao})` },
        { status: 403 },
      );
    }

    const { data: veiculo } = await supabase
      .from("estoque_motors")
      .select("*")
      .eq("id", normalizarId(id))
      .maybeSingle();

    if (!veiculo) {
      return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
    }

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
      texto: saida.texto,
      caracteres: saida.texto.length,
      periciaAprovada: dossie.periciaAprovada,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Falha inesperada" }, { status: 500 });
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run tests/descritivo-rota.test.ts`
Esperado: PASSA, 10 testes.

- [ ] **Passo 5: commitar**

```bash
git add "src/app/api/estoque/[id]/descritivo/route.ts" tests/descritivo-rota.test.ts
git commit -m "feat(descritivo): a rota gera sugestao e nao grava nada

O veiculo e lido do BANCO, nunca do corpo: senao bastaria mandar
pericia:'Aprovado' no JSON para liberar a afirmacao de laudo aprovado num
carro cujo exame nao fechou. Ha teste para isso.

A regua de permissao e a MESMA do PATCH, e o teste guarda que a rota nova
passa por ela — cobertura por vizinhanca nao e cobertura.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarefa 5: os botões e o painel

**Arquivos:**
- Criar: `src/components/admin/SugestaoDeTexto.tsx`
- Modificar: `src/components/admin/EditorDeVeiculo.tsx` (bloco `aba === "texto"`, a partir da linha 1176)
- Testar: `tests/descritivo-painel.test.ts`

**Interfaces:**
- Consome: `POST /api/estoque/[id]/descritivo` (Tarefa 4).
- Produz: componente `SugestaoDeTexto`.

> **Atenção a duas armadilhas do runner deste repo**, medidas antes de escrever
> este plano:
> - **O arquivo tem de ser `.test.ts`, não `.test.tsx`.** O `vitest.config.ts`
>   traz `include: ["tests/**/*.test.ts"]`. Um `.test.tsx` **não é coletado** —
>   ele não falha, simplesmente não roda, e a suíte fica verde sem o teste.
>   Por isso o teste usa `createElement` em vez de JSX.
> - **Não existe `@testing-library/react` no projeto**, e a restrição global
>   proíbe dependência nova. O padrão daqui é `createRoot` + `act`, como em
>   `tests/painel-de-guias-fiacao.test.ts`.

- [ ] **Passo 1: escrever o teste que falha**

Criar `tests/descritivo-painel.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SugestaoDeTexto } from "../src/components/admin/SugestaoDeTexto";

/**
 * A FIAÇÃO do painel de sugestão.
 *
 * O que este arquivo guarda não é o texto na tela: é que a sugestão **não
 * chega ao campo sozinha**. Com 62 veículos ainda no blurb institucional, o
 * botão sempre encontra texto escrito, e trocar sem a pessoa mandar apagaria
 * trabalho de alguém.
 *
 * Só o `fetch` é dublê — o componente é o de verdade. Extrair para função pura
 * prova a função, não prova que alguém a usa; é preciso montar o componente e
 * clicar.
 *
 * Sem `IS_REACT_ACT_ENVIRONMENT` o React avisa e o `act` NÃO espera os
 * efeitos: os testes passam mesmo assim, que é o pior dos mundos.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let chamadas: { url: string; metodo: string; corpo?: unknown }[] = [];
let RESPOSTA: { ok: boolean; status: number; corpo: unknown } = {
  ok: true,
  status: 200,
  corpo: { texto: "Texto sugerido.", caracteres: 15 },
};

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push({
      url: String(url),
      metodo: opcoes?.method ?? "GET",
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined,
    });
    return { ok: RESPOSTA.ok, status: RESPOSTA.status, json: async () => RESPOSTA.corpo };
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root;
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  chamadas = [];
  RESPOSTA = { ok: true, status: 200, corpo: { texto: "Texto sugerido.", caracteres: 15 } };
  dublarFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = fetchOriginal;
});

function montar(onUsar: (t: string) => void = () => {}) {
  act(() => {
    root.render(createElement(SugestaoDeTexto, { veiculoId: 7803195, campo: "descricao_seo", onUsar }));
  });
}

/** Acha o botão pelo texto visível — é assim que a pessoa o encontra. */
function botao(trecho: string): HTMLButtonElement {
  const achado = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").toLowerCase().includes(trecho.toLowerCase()),
  );
  if (!achado) throw new Error(`Botão "${trecho}" não está na tela. Botões: ${Array.from(container.querySelectorAll("button")).map((b) => b.textContent).join(" | ")}`);
  return achado as HTMLButtonElement;
}

async function clicar(b: HTMLButtonElement) {
  await act(async () => {
    b.click();
  });
}

const naTela = () => container.textContent ?? "";

describe("SugestaoDeTexto", () => {
  it("não chama o gerador antes do clique", () => {
    montar();
    expect(chamadas).toEqual([]);
  });

  it("chama a rota do veículo com o campo pedido", async () => {
    montar();
    await clicar(botao("gerar"));
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe("/api/estoque/7803195/descritivo");
    expect(chamadas[0].metodo).toBe("POST");
    expect(chamadas[0].corpo).toEqual({ campo: "descricao_seo" });
  });

  it("mostra o texto e a contagem depois de gerar", async () => {
    RESPOSTA = { ok: true, status: 200, corpo: { texto: "Honda NXR 160 Bros 2022.", caracteres: 24 } };
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("Honda NXR 160 Bros 2022.");
    expect(naTela()).toContain("24 caracteres");
  });

  /** O invariante do desenho: o campo não muda até a pessoa mandar. */
  it("só entrega o texto ao campo quando a pessoa manda", async () => {
    const usado: string[] = [];
    montar((t) => usado.push(t));
    await clicar(botao("gerar"));
    expect(usado).toEqual([]);
    await clicar(botao("usar este texto"));
    expect(usado).toEqual(["Texto sugerido."]);
  });

  it("mostra o motivo quando falta a chave, em vez de ficar inerte", async () => {
    RESPOSTA = { ok: false, status: 503, corpo: { error: "Gerador indisponível: falta OPENAI_API_KEY nas variáveis de ambiente." } };
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("OPENAI_API_KEY");
  });

  it("mostra cada motivo quando o texto reprova na conferência", async () => {
    RESPOSTA = {
      ok: false, status: 422,
      corpo: { error: "O texto gerado não passou na conferência.", motivos: [{ regra: "vocabulário", motivo: "Usa palavra barrada." }] },
    };
    montar();
    await clicar(botao("gerar"));
    expect(naTela()).toContain("Usa palavra barrada.");
  });

  it("não oferece 'usar este texto' quando a geração falhou", async () => {
    RESPOSTA = { ok: false, status: 502, corpo: { error: "A OpenAI recusou a chamada" } };
    montar();
    await clicar(botao("gerar"));
    expect(() => botao("usar este texto")).toThrow();
  });

  it("avisa na tela que a conferência não pega troca de campo", async () => {
    montar();
    await clicar(botao("gerar"));
    expect(naTela().toLowerCase()).toContain("troca de campo");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/descritivo-painel.test.ts`
Esperado: FALHA — `Failed to resolve import "../src/components/admin/SugestaoDeTexto"`.

- [ ] **Passo 3: criar o componente**

Criar `src/components/admin/SugestaoDeTexto.tsx`:

```tsx
"use client";

import { useState } from "react";

/**
 * O painel de sugestão.
 *
 * NÃO sobrescreve o campo: mostra o texto ao lado e espera "Usar este texto".
 * Com 62 veículos ainda no blurb institucional, o botão sempre encontra algo
 * escrito, e quem revisa precisa comparar antes de trocar.
 *
 * A revisão humana também é a ÚNICA defesa contra troca de campo — "motor
 * manual" quando o manual é o câmbio. Nenhuma regra determinística pega isso
 * (ver o docblock de `lib/descritivo/validacao.ts`).
 */

type Motivo = { regra: string; motivo: string };

export function SugestaoDeTexto({
  veiculoId,
  campo,
  onUsar,
}: {
  veiculoId: number | string;
  campo: "descricao" | "descricao_seo";
  onUsar: (texto: string) => void;
}) {
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState<string | null>(null);
  const [caracteres, setCaracteres] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);

  async function gerar() {
    setCarregando(true);
    setErro(null);
    setMotivos([]);
    setTexto(null);
    try {
      const r = await fetch(`/api/estoque/${veiculoId}/descritivo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(j?.error ?? `Falhou com HTTP ${r.status}`);
        setMotivos(Array.isArray(j?.motivos) ? j.motivos : []);
        return;
      }
      setTexto(j.texto);
      setCaracteres(j.caracteres ?? String(j.texto ?? "").length);
    } catch (e: any) {
      setErro(e?.message ?? "Falha ao chamar o gerador");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={gerar}
        disabled={carregando}
        className="mt-botao-secundario text-[12px]"
      >
        {carregando ? "Gerando…" : texto ? "Gerar outro" : "Gerar sugestão"}
      </button>

      {erro && (
        <div className="mt-3 rounded border border-mt-neutral-300 p-3 text-[12px] leading-relaxed">
          <div className="font-medium">{erro}</div>
          {motivos.length > 0 && (
            <ul className="mt-2 list-disc pl-4">
              {motivos.map((m) => (
                <li key={m.regra}>
                  <span className="font-medium">{m.regra}:</span> {m.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {texto && (
        <div className="mt-3 rounded border border-mt-neutral-300 p-3">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{texto}</p>
          <p className="mt-2 text-[11px] text-mt-neutral-700">
            {caracteres} caracteres. Leia antes de usar: a conferência automática não detecta
            troca de campo — &quot;motor manual&quot; quando o manual é o câmbio, por exemplo.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onUsar(texto)} className="mt-botao text-[12px]">
              Usar este texto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run tests/descritivo-painel.test.ts`
Esperado: PASSA, 8 testes. Se o vitest disser "No test files found", o nome do
arquivo está com `.tsx` — o `include` do config só pega `.test.ts`.

- [ ] **Passo 5: ligar no editor**

Em `src/components/admin/EditorDeVeiculo.tsx`, acrescentar ao bloco de imports do topo:

```ts
import { SugestaoDeTexto } from "./SugestaoDeTexto";
```

No bloco `aba === "texto"` (a partir da linha 1176), logo **depois** do `<textarea>` de `descricao` e antes do rótulo "Descrição para portais e busca":

```tsx
<SugestaoDeTexto
  veiculoId={v.id}
  campo="descricao"
  onUsar={(t) => set("descricao", t)}
/>
```

E logo **depois** do parágrafo de ajuda de `descricao_seo` (o que termina em `Atual: ${v.descricao_seo.length}`):

```tsx
<SugestaoDeTexto
  veiculoId={v.id}
  campo="descricao_seo"
  onUsar={(t) => set("descricao_seo", t)}
/>
```

- [ ] **Passo 6: rodar a suíte inteira**

Rodar: `npx vitest run`
Esperado: verde. Travas de invariante varrem `src/` e reprovam copy nova em varredura — rodar só o teste da tarefa esconde isso até a revisão.

- [ ] **Passo 7: verificar no navegador**

Subir o dev server pelo Browser pane e abrir `/admin/estoque/7803195`, aba "Texto e SEO". Clicar em "Gerar sugestão" nos dois campos. Conferir por `read_page`, não por screenshot: o texto aparece, a contagem aparece, e o campo **não muda** até "Usar este texto".

- [ ] **Passo 8: commitar**

```bash
git add src/components/admin/SugestaoDeTexto.tsx src/components/admin/EditorDeVeiculo.tsx tests/descritivo-painel.test.ts
git commit -m "feat(descritivo): dois botoes na aba Texto e SEO, sem sobrescrever nada

A sugestao aparece num painel e so entra no campo com 'Usar este texto'.
Com 62 veiculos ainda no blurb, o botao sempre encontra texto escrito.

O aviso sobre troca de campo esta na tela, nao so no codigo: a revisao
humana e a unica defesa contra 'motor manual' quando o manual e o cambio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarefa 6: revisão adversarial

- [ ] **Passo 1: rodar o `qa-guardian`**

Toda entrega passa pelo `qa-guardian` antes do merge (CLAUDE.md). Dispachar o agente sobre o diff completo do branch, pedindo atenção a: a rota não gravar, a régua da perícia vir do banco, cada regra de validação ter teste nos dois sentidos, e nenhuma chamada de rede na suíte.

- [ ] **Passo 2: rodar o build**

Rodar: `npx next build`
Esperado: exit 0. Conferir o exit code do **build**, não o do último comando de uma cadeia — build quebrado já reportou verde neste repo.

- [ ] **Passo 3: reintegrar o main**

O `main` anda durante o PR. Antes de abrir:

```bash
git fetch origin main
git merge origin/main
npx vitest run
```

- [ ] **Passo 4: abrir o PR**

O `gh` CLI não está logado nesta máquina — abrir pelo Chrome, na sessão já autenticada, por
`https://github.com/85dyones/motors-site-oficial/compare/main...feat/gerador-de-descritivo?quick_pull=1`.

No corpo do PR, registrar as duas pendências de operação: confirmar se `OPENAI_API_KEY` vale para **Preview** além de Production (sem isso o deploy do PR responde 503 e a ferramenta só pode ser provada depois do merge), e o limite conhecido da validação quanto a troca de campo.
