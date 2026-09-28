# Repasse Motors — PR 1 (dados) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a base de dados e as regras puras da seção Repasse Motors — tipos, conta derivada, etiqueta, checklist com os termos proibidos pelo dono, permissões, caminho das fotos, consulta FIPE, leitura pública e a migração com RLS — sem nenhuma tela ainda.

**Architecture:** Três tabelas novas (`repasses`, `repasse_inscritos`, `repasse_avisos`) fora de `estoque_motors`, com leitura anônima restrita por RLS (linhas publicadas) e por GRANT de coluna (colunas públicas). Toda regra de negócio fica em libs puras de `src/lib/` com teste próprio; a migração se autoconfere virando `anon` de verdade no ensaio.

**Tech Stack:** Next.js (App Router) · TypeScript · Supabase (Postgres, RLS, supabase-js com chave anon) · Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md` (§3, §4, §5; §12 linha "PR 1").

**Plano dos PRs seguintes:** este arquivo cobre só o PR 1. Os PRs 2 (painel), 3 (site e leads) e 4 (portas de entrada) ganham plano próprio quando este estiver gravado — cada um depende do anterior (spec §12).

## Global Constraints

- Nomes de arquivo, tipo, função, tabela e coluna **em português**, no padrão do repositório; colunas em `snake_case` e o tipo TS espelha as colunas (como `Veiculo` espelha `estoque_motors`).
- **`estoque_motors` não é tocada.** O enum `modalidade_tipo` não é reusado.
- Migração **aditiva**, com `org_id uuid not null default public.org_padrao()`, RLS nas três tabelas, bloco de aceite e rodapé no livro-razão.
- **Ensaio (ROLLBACK) antes; `--gravar` só com ordem explícita do dono** (CLAUDE.md e memória `limites-de-execucao`).
- `anon` lê **só** `situacao in ('publicado','reservado','vendido')` e **só** as colunas de `COLUNAS_PUBLICAS_DO_REPASSE`. Nunca `criado_por`, `validado_por`, `enviado_em`, `validado_em`, `devolvido_com`, `org_id`.
- Laudo: `aprovado`, `aprovado_com_apontamento`, `nao_feito`. **Não existe `reprovado`** (DECIDIDO 24/09).
- Termos proibidos pelo dono (spec §2 e §9): "não girou" e parentes, "fora do perfil", "veio em lote", CDC, "código de defesa", "direitos do consumidor", "seus direitos", "consumidor", "premium", "exclusivo", "melhor preço", "consulte", "a partir de R$", "três em dez" e parentes, porcentagem.
- Reaproveitar: `MINIMO_DE_FOTOS` (`src/lib/coerenciaDoCadastro.ts`), `CARENCIA_VENDIDO_DIAS` (`src/lib/publicacao.ts`), `slugificar` (`src/lib/veiculoUrl.ts`), `EXTENSAO_DA_VARIANTE` e `ehFotoPropria` (`src/lib/fotosDoVeiculo.ts`), `public.tocar_updated_at()`, `public.is_staff(uuid)`, `public.org_padrao()`.
- **Teste local só do arquivo mexido** (`npx vitest run tests/<arquivo>.test.ts`). Suíte inteira, `tsc`, lint e build ficam para o CI, que só vale **concluído e verde nos cinco jobs** (`vitest`, `tipos`, `lint`, `build`, `deploy-vercel`). Código novo não pode trazer erro de lint (catraca): nada de `any`.
- Trava nova só conta depois de **reprovar com o bug real** (memória `trava-so-vale-se-reprovar`).
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- PR só com o CI verde; passa pelo agente `qa-guardian` do repositório; abre pelo Chrome do dono, com o ok dele (o `gh` não está autenticado).

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/repasse.ts` (novo) | Tipos, listas fechadas (laudo, situação, carroceria, faixa), conta derivada, etiqueta, filtros, visibilidade pública, slug, faixa do preço |
| `src/lib/checklistDoRepasse.ts` (novo) | `TERMOS_PROIBIDOS_DO_REPASSE`, `termosProibidosEm`, `checklistDoRepasse` |
| `src/lib/permissoes.ts` (muda) | Duas linhas novas na `MATRIZ_DE_PERMISSOES` |
| `src/lib/fotosDoVeiculo.ts` (muda) | `caminhoDaFotoDoRepasse` |
| `src/lib/consultaFipe.ts` (novo) | Cascata marcas → modelos → anos → valor na API parallelum, com `buscar` injetável |
| `src/lib/leituraDosRepasses.ts` (novo) | `COLUNAS_PUBLICAS_DO_REPASSE`, `repasseDaLinha`, `lerRepassesPublicos`, `lerRepassePorSlug` |
| `supabase/migrations/20260924180000_repasse_fundacao.sql` (novo) | Enums, três tabelas, coluna `leads.repasse_id`, RLS, GRANT por coluna, aceite, livro-razão |
| `tests/repasseDeTeste.ts` (novo) | Fábrica de `Repasse` válido para os testes |
| `tests/repasse.test.ts`, `tests/checklist-do-repasse.test.ts`, `tests/fotos-do-repasse.test.ts`, `tests/consulta-fipe.test.ts`, `tests/leitura-dos-repasses.test.ts`, `tests/migracao-do-repasse.test.ts` (novos); `tests/permissoes.test.ts` (muda) | Testes |

`AutoAvaliacao.tsx` **não** é alterado neste PR: o funil `/avaliacao` não pode quebrar em fase nenhuma (CLAUDE.md). Passar a cascata dele para `consultaFipe.ts` fica como limpeza posterior, fora do escopo.

---

### Task 0: Preparar o worktree

**Files:** nenhum versionado.

- [ ] **Step 1: Ligar o `node_modules` do clone principal por junção**

O worktree nasce sem `node_modules` (memória `worktree-sem-node-modules`). As dependências do clone principal batem com `origin/main` (conferido em 24/09: `package.json` e `package-lock.json` sem diferença).

```powershell
cmd /c mklink /J "C:\Users\Lenovo\Documents\motors-claude\wt-repasse\node_modules" "C:\Users\Lenovo\Documents\motors-claude\motors-site-oficial\node_modules"
```

- [ ] **Step 2: Linha de base**

Run: `npx vitest run tests/permissoes.test.ts`
Expected: PASS (todos os testes da matriz). Se falhar, parar e reportar — a base está suja.

---

### Task 1: Tipos e regras do repasse (`src/lib/repasse.ts`)

**Files:**
- Create: `src/lib/repasse.ts`
- Create: `tests/repasseDeTeste.ts`
- Test: `tests/repasse.test.ts`

**Interfaces:**
- Consumes: `CARENCIA_VENDIDO_DIAS` de `./publicacao`; `slugificar(bruto: string): string` de `./veiculoUrl`.
- Produces:
  - `LAUDOS_DO_REPASSE`, `SITUACOES_DO_REPASSE`, `CARROCERIAS_DO_REPASSE`, `FAIXAS_DO_REPASSE`, `FILTROS_DO_REPASSE` (listas `as const`) e os tipos `LaudoDoRepasse`, `SituacaoDoRepasse`, `CarroceriaDoRepasse`, `FaixaDoRepasse`, `FiltroDoRepasse`, `EtiquetaDoRepasse`.
  - `interface ItemDeEstado { descricao: string; local: string; foto: string | null; orcamento: number | null; estetico: boolean }`
  - `interface Repasse` (campos = colunas públicas + `arquivado_em`).
  - `temLaudo(r): boolean` · `contaDoRepasse(r): ContaDoRepasse` · `etiquetaDoRepasse(r): EtiquetaDoRepasse` · `passaNoFiltro(r, filtro): boolean` · `soParaLojistas(r): boolean` · `aparecePublicamente(r, agora: Date): boolean` · `slugDoRepasse(r): string` · `faixaDoPreco(preco: number): FaixaDoRepasse`.
  - `repasseDeTeste(parcial?: Partial<Repasse>): Repasse` (em `tests/`).

- [ ] **Step 1: Escrever a fábrica de teste**

`tests/repasseDeTeste.ts`:

```ts
import type { Repasse } from "../src/lib/repasse";

/**
 * Um repasse COMPLETO e válido — o Kwid Zen das pranchas do Design. Cada teste
 * quebra só o campo que interessa, e o resto continua passando no checklist.
 */
export function repasseDeTeste(parcial: Partial<Repasse> = {}): Repasse {
  return {
    id: "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f",
    slug: "renault-kwid-zen-1-0-2021-3f9a1c",
    marca: "Renault",
    modelo: "Kwid",
    versao: "Zen 1.0",
    ano_modelo: 2021,
    ano_fabricacao: 2020,
    quilometragem: 71200,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Prata",
    carroceria: "hatch",
    preco: 36900,
    fipe_valor: 42100,
    fipe_codigo: "025258-0",
    fipe_mes_referencia: "setembro de 2026",
    laudo: "aprovado",
    laudo_apontamento: null,
    leilao_consta: false,
    leilao_detalhe: null,
    sinistro_consta: false,
    sinistro_detalhe: null,
    historico_consultado_em: "2026-09-22",
    resumo: "Embreagem patinando e pneus dianteiros no fim. Preferimos repassar com o orçamento na mão.",
    motivo: "Entrou na troca de um SUV em setembro.",
    itens_de_estado: [
      { descricao: "Embreagem patinando nas arrancadas", local: "Câmbio", foto: "https://x.supabase.co/f/1.webp", orcamento: 1400, estetico: false },
      { descricao: "Pneus dianteiros no fim da vida útil", local: "Rodas dianteiras", foto: "https://x.supabase.co/f/2.webp", orcamento: 620, estetico: false },
      { descricao: "Risco de 12 cm na lataria", local: "Porta traseira direita", foto: "https://x.supabase.co/f/3.webp", orcamento: null, estetico: true },
    ],
    sem_defeitos_conhecidos: false,
    oficina_do_orcamento: "Oficina Exemplo",
    orcamento_em: "2026-09-22",
    web_full_images: ["w1", "w2", "w3", "w4"],
    whatsapp_images: ["z1", "z2", "z3", "z4"],
    situacao: "rascunho",
    lojistas_desde: null,
    aberto_ao_publico_em: null,
    reservado_em: null,
    vendido_em: null,
    arquivado_em: null,
    created_at: "2026-09-24T12:00:00Z",
    ...parcial,
  };
}
```

- [ ] **Step 2: Escrever os testes que falham**

`tests/repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  contaDoRepasse,
  etiquetaDoRepasse,
  passaNoFiltro,
  soParaLojistas,
  aparecePublicamente,
  slugDoRepasse,
  faixaDoPreco,
  temLaudo,
} from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

const AGORA = new Date("2026-09-24T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000).toISOString();

describe("contaDoRepasse", () => {
  it("soma só os orçamentos e compara com a FIPE (a conta do Kwid das pranchas)", () => {
    expect(contaDoRepasse(repasseDeTeste())).toEqual({
      preco: 36900,
      reparoOrcado: 2020,
      voceGasta: 38920,
      fipe: 42100,
      abaixoDaFipe: 3180,
    });
  });

  it("sem FIPE, a diferença é null — nunca zero", () => {
    expect(contaDoRepasse(repasseDeTeste({ fipe_valor: null })).abaixoDaFipe).toBeNull();
  });

  it("acima da tabela, a diferença fica negativa (quem mostra decide o que fazer)", () => {
    const r = repasseDeTeste({ preco: 50000, fipe_valor: 48000, itens_de_estado: [] });
    expect(contaDoRepasse(r).abaixoDaFipe).toBe(-2000);
  });
});

describe("etiquetaDoRepasse", () => {
  it("reparo orçado vence o laudo", () => {
    expect(etiquetaDoRepasse(repasseDeTeste())).toBe("REPARO ORÇADO");
  });

  it("aprovado com apontamento é COM LAUDO", () => {
    const r = repasseDeTeste({ laudo: "aprovado_com_apontamento", laudo_apontamento: "Repintura", itens_de_estado: [] });
    expect(etiquetaDoRepasse(r)).toBe("COM LAUDO");
  });

  it("laudo não feito ou ainda não escolhido é SEM LAUDO", () => {
    expect(etiquetaDoRepasse(repasseDeTeste({ laudo: "nao_feito", itens_de_estado: [] }))).toBe("SEM LAUDO");
    expect(etiquetaDoRepasse(repasseDeTeste({ laudo: null, itens_de_estado: [] }))).toBe("SEM LAUDO");
  });
});

describe("passaNoFiltro — os filtros não são exclusivos", () => {
  it("carro com laudo e reparo entra em 'com laudo' e em 'reparo orçado'", () => {
    const kwid = repasseDeTeste();
    expect(temLaudo(kwid)).toBe(true);
    expect(passaNoFiltro(kwid, "com-laudo")).toBe(true);
    expect(passaNoFiltro(kwid, "reparo-orcado")).toBe(true);
    expect(passaNoFiltro(kwid, "sem-laudo")).toBe(false);
    expect(passaNoFiltro(kwid, "todos")).toBe(true);
  });

  it("sem reparo não entra em 'reparo orçado'", () => {
    expect(passaNoFiltro(repasseDeTeste({ itens_de_estado: [] }), "reparo-orcado")).toBe(false);
  });
});

describe("soParaLojistas", () => {
  it("publicado sem o switch é só para lojistas", () => {
    expect(soParaLojistas(repasseDeTeste({ situacao: "publicado", aberto_ao_publico_em: null }))).toBe(true);
  });
  it("depois do switch, é para todos", () => {
    expect(soParaLojistas(repasseDeTeste({ situacao: "publicado", aberto_ao_publico_em: diasAtras(1) }))).toBe(false);
  });
  it("reservado nunca mostra a camada de lojista", () => {
    expect(soParaLojistas(repasseDeTeste({ situacao: "reservado", aberto_ao_publico_em: null }))).toBe(false);
  });
});

describe("aparecePublicamente", () => {
  it("rascunho, em validação e arquivado não aparecem", () => {
    for (const situacao of ["rascunho", "em_validacao", "arquivado"] as const) {
      expect(aparecePublicamente(repasseDeTeste({ situacao }), AGORA)).toBe(false);
    }
  });
  it("publicado e reservado aparecem", () => {
    expect(aparecePublicamente(repasseDeTeste({ situacao: "publicado" }), AGORA)).toBe(true);
    expect(aparecePublicamente(repasseDeTeste({ situacao: "reservado" }), AGORA)).toBe(true);
  });
  it("vendido aparece dentro da carência do estoque e some depois", () => {
    expect(aparecePublicamente(repasseDeTeste({ situacao: "vendido", vendido_em: diasAtras(10) }), AGORA)).toBe(true);
    expect(aparecePublicamente(repasseDeTeste({ situacao: "vendido", vendido_em: diasAtras(91) }), AGORA)).toBe(false);
    expect(aparecePublicamente(repasseDeTeste({ situacao: "vendido", vendido_em: null }), AGORA)).toBe(false);
  });
});

describe("slugDoRepasse", () => {
  it("marca, modelo, versão, ano e os 6 primeiros do id", () => {
    expect(slugDoRepasse(repasseDeTeste())).toBe("renault-kwid-zen-1-0-2021-3f9a1c");
  });
  it("sem versão, não sobra hífen duplo", () => {
    const r = repasseDeTeste({ marca: "Fiat", modelo: "Argo", versao: null, ano_modelo: 2019, id: "abcdef12-0000-4000-8000-000000000000" });
    expect(slugDoRepasse(r)).toBe("fiat-argo-2019-abcdef");
  });
});

describe("faixaDoPreco", () => {
  it("o mínimo entra na faixa, o teto já é a próxima", () => {
    expect(faixaDoPreco(29999)).toBe("ate-30");
    expect(faixaDoPreco(30000)).toBe("30-50");
    expect(faixaDoPreco(49999.99)).toBe("30-50");
    expect(faixaDoPreco(50000)).toBe("50-80");
    expect(faixaDoPreco(80000)).toBe("acima-80");
    expect(faixaDoPreco(250000)).toBe("acima-80");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/repasse.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/repasse"`.

- [ ] **Step 4: Implementar**

`src/lib/repasse.ts`:

```ts
/**
 * Repasse Motors — o carro vendido no estado, sem a garantia da loja.
 *
 * Spec: docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md (§4, §5).
 *
 * Os campos espelham as colunas de `public.repasses`, como `Veiculo` espelha
 * `estoque_motors`. Tudo o que é conta — reparo orçado, "você gasta",
 * diferença para a FIPE — é DERIVADO aqui e nunca vira coluna: um total
 * gravado discordaria dos itens no primeiro orçamento editado.
 *
 * ATENÇÃO ao nome: "repasse" aqui é a seção pública de carros no estado. Não
 * é `modalidade_tipo = 'repasse'` (carro que ENTROU vindo de outro lojista,
 * `veiculo_entradas`) nem o repasse de investidores (`investidores.ts`).
 */
import { CARENCIA_VENDIDO_DIAS } from "./publicacao";
import { slugificar } from "./veiculoUrl";

/** Reprovado não existe de propósito: carro reprovado não entra (dono, 24/09). */
export const LAUDOS_DO_REPASSE = ["aprovado", "aprovado_com_apontamento", "nao_feito"] as const;
export type LaudoDoRepasse = (typeof LAUDOS_DO_REPASSE)[number];

export const SITUACOES_DO_REPASSE = [
  "rascunho",
  "em_validacao",
  "publicado",
  "reservado",
  "vendido",
  "arquivado",
] as const;
export type SituacaoDoRepasse = (typeof SITUACOES_DO_REPASSE)[number];

export const CARROCERIAS_DO_REPASSE = ["hatch", "seda", "suv", "picape", "outro"] as const;
export type CarroceriaDoRepasse = (typeof CARROCERIAS_DO_REPASSE)[number];

/** As faixas do formulário da lista. Mínimo incluso, teto excluso; `max: null` = sem teto. */
export const FAIXAS_DO_REPASSE = [
  { id: "ate-30", rotulo: "Até R$ 30 mil", min: 0, max: 30000 },
  { id: "30-50", rotulo: "De R$ 30 mil a R$ 50 mil", min: 30000, max: 50000 },
  { id: "50-80", rotulo: "De R$ 50 mil a R$ 80 mil", min: 50000, max: 80000 },
  { id: "acima-80", rotulo: "Acima de R$ 80 mil", min: 80000, max: null },
] as const;
export type FaixaDoRepasse = (typeof FAIXAS_DO_REPASSE)[number]["id"];

export const FILTROS_DO_REPASSE = ["todos", "com-laudo", "sem-laudo", "reparo-orcado"] as const;
export type FiltroDoRepasse = (typeof FILTROS_DO_REPASSE)[number];

export type EtiquetaDoRepasse = "REPARO ORÇADO" | "COM LAUDO" | "SEM LAUDO";

export interface ItemDeEstado {
  descricao: string;
  local: string;
  /** URL pública da foto do defeito (variante web). */
  foto: string | null;
  /** Orçamento do conserto em reais; null quando não há (ex.: estético). */
  orcamento: number | null;
  estetico: boolean;
}

export interface Repasse {
  id: string;
  slug: string;
  marca: string;
  modelo: string;
  versao: string | null;
  ano_modelo: number;
  ano_fabricacao: number | null;
  quilometragem: number;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
  carroceria: CarroceriaDoRepasse | null;
  preco: number;
  fipe_valor: number | null;
  fipe_codigo: string | null;
  fipe_mes_referencia: string | null;
  laudo: LaudoDoRepasse | null;
  laudo_apontamento: string | null;
  leilao_consta: boolean | null;
  leilao_detalhe: string | null;
  sinistro_consta: boolean | null;
  sinistro_detalhe: string | null;
  historico_consultado_em: string | null;
  resumo: string | null;
  motivo: string | null;
  itens_de_estado: ItemDeEstado[];
  sem_defeitos_conhecidos: boolean;
  oficina_do_orcamento: string | null;
  orcamento_em: string | null;
  web_full_images: string[];
  whatsapp_images: string[];
  situacao: SituacaoDoRepasse;
  lojistas_desde: string | null;
  aberto_ao_publico_em: string | null;
  reservado_em: string | null;
  vendido_em: string | null;
  arquivado_em: string | null;
  created_at: string;
}

export interface ContaDoRepasse {
  preco: number;
  reparoOrcado: number;
  voceGasta: number;
  fipe: number | null;
  /** FIPE menos o que você gasta. Negativo acima da tabela; null sem FIPE. */
  abaixoDaFipe: number | null;
}

type ParaConta = Pick<Repasse, "preco" | "fipe_valor" | "itens_de_estado">;

export function temLaudo(r: Pick<Repasse, "laudo">): boolean {
  return r.laudo === "aprovado" || r.laudo === "aprovado_com_apontamento";
}

export function contaDoRepasse(r: ParaConta): ContaDoRepasse {
  const reparoOrcado = r.itens_de_estado.reduce(
    (soma, item) =>
      typeof item.orcamento === "number" && item.orcamento > 0 ? soma + item.orcamento : soma,
    0,
  );
  const voceGasta = r.preco + reparoOrcado;
  const fipe = typeof r.fipe_valor === "number" && r.fipe_valor > 0 ? r.fipe_valor : null;
  return {
    preco: r.preco,
    reparoOrcado,
    voceGasta,
    fipe,
    abaixoDaFipe: fipe === null ? null : fipe - voceGasta,
  };
}

export function etiquetaDoRepasse(r: ParaConta & Pick<Repasse, "laudo">): EtiquetaDoRepasse {
  if (contaDoRepasse(r).reparoOrcado > 0) return "REPARO ORÇADO";
  return temLaudo(r) ? "COM LAUDO" : "SEM LAUDO";
}

/** Laudo e reparo são eixos independentes: um carro pode estar em dois filtros. */
export function passaNoFiltro(r: ParaConta & Pick<Repasse, "laudo">, filtro: FiltroDoRepasse): boolean {
  switch (filtro) {
    case "todos":
      return true;
    case "com-laudo":
      return temLaudo(r);
    case "sem-laudo":
      return !temLaudo(r);
    case "reparo-orcado":
      return contaDoRepasse(r).reparoOrcado > 0;
  }
}

/** Publicado e ainda sem o switch "abrir para todos" (spec §5). */
export function soParaLojistas(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">): boolean {
  return r.situacao === "publicado" && r.aberto_ao_publico_em === null;
}

const DIA_MS = 86_400_000;

/** Publicado, reservado, e vendido dentro da mesma carência do estoque. */
export function aparecePublicamente(r: Pick<Repasse, "situacao" | "vendido_em">, agora: Date): boolean {
  if (r.situacao === "publicado" || r.situacao === "reservado") return true;
  if (r.situacao !== "vendido" || !r.vendido_em) return false;
  const vendido = new Date(r.vendido_em).getTime();
  if (Number.isNaN(vendido)) return false;
  return agora.getTime() - vendido <= CARENCIA_VENDIDO_DIAS * DIA_MS;
}

/** `marca-modelo-versao-ano-xxxxxx`: legível e único pelos 6 primeiros do uuid. */
export function slugDoRepasse(r: Pick<Repasse, "id" | "marca" | "modelo" | "versao" | "ano_modelo">): string {
  const base = slugificar([r.marca, r.modelo, r.versao ?? "", String(r.ano_modelo)].join(" "));
  const sufixo = r.id.replace(/-/g, "").slice(0, 6).toLowerCase();
  return `${base}-${sufixo}`;
}

/** Em que faixa da lista um preço cai — é por ela que o painel casa inscrito e carro. */
export function faixaDoPreco(preco: number): FaixaDoRepasse {
  for (const faixa of FAIXAS_DO_REPASSE) {
    if (preco >= faixa.min && (faixa.max === null || preco < faixa.max)) return faixa.id;
  }
  return "acima-80";
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/repasse.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repasse.ts tests/repasseDeTeste.ts tests/repasse.test.ts
git commit -m "feat(repasse): tipos e regras puras do repasse" -m "Conta derivada, etiqueta, filtros não exclusivos, visibilidade pública com a carência do estoque, slug e faixa do preço. Spec 2026-09-24 §4." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Checklist e termos proibidos (`src/lib/checklistDoRepasse.ts`)

**Files:**
- Create: `src/lib/checklistDoRepasse.ts`
- Test: `tests/checklist-do-repasse.test.ts`

**Interfaces:**
- Consumes: `Repasse`, `temLaudo` de `./repasse` (Task 1); `MINIMO_DE_FOTOS` de `./coerenciaDoCadastro`.
- Produces:
  - `TERMOS_PROIBIDOS_DO_REPASSE: ReadonlyArray<{ termo: string; padrao: RegExp }>`
  - `termosProibidosEm(texto: string | null | undefined): string[]` — os rótulos (`termo`) encontrados.
  - `interface FaltaDoChecklist { campo: string; mensagem: string }`
  - `checklistDoRepasse(r: Repasse): FaltaDoChecklist[]` — vazio = pode enviar para validação.
  - O PR 3 reusa `TERMOS_PROIBIDOS_DO_REPASSE` na trava do texto fixo.

- [ ] **Step 1: Escrever os testes que falham**

`tests/checklist-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checklistDoRepasse, termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { repasseDeTeste } from "./repasseDeTeste";

const campos = (faltas: { campo: string }[]) => faltas.map((f) => f.campo);

describe("termosProibidosEm — a regra do dono, com a borda certa", () => {
  it("pega o 'não girou' em todas as formas que alguém digitaria", () => {
    expect(termosProibidosEm("Ficou parado, não girou no pátio")).toContain("não girou");
    expect(termosProibidosEm("carro que nao gira")).toContain("não girou");
    expect(termosProibidosEm("estava encalhado")).toContain("encalhado");
    expect(termosProibidosEm("tempo demais no pátio")).toContain("tempo demais no pátio");
  });

  it("pega CDC e direitos, que o dono mandou não citar", () => {
    expect(termosProibidosEm("Seus direitos continuam")).toContain("seus direitos");
    expect(termosProibidosEm("o CDC garante")).toContain("CDC");
    expect(termosProibidosEm("direitos do consumidor")).toContain("direitos do consumidor");
    expect(termosProibidosEm("Código de Defesa")).toContain("código de defesa");
  });

  it("pega os rótulos antigos e o vocabulário que a casa evita", () => {
    expect(termosProibidosEm("fora do perfil da loja")).toContain("fora do perfil");
    expect(termosProibidosEm("veio em lote")).toContain("veio em lote");
    expect(termosProibidosEm("preço premium")).toContain("premium");
    expect(termosProibidosEm("25% abaixo")).toContain("porcentagem");
    expect(termosProibidosEm("de cada dez avaliados")).toContain("três em dez");
  });

  it("não acusa texto legítimo que parece com o proibido", () => {
    expect(termosProibidosEm("Retrovisor direito quebrado")).toEqual([]);
    expect(termosProibidosEm("Porta traseira direita")).toEqual([]);
    expect(termosProibidosEm("O repasse gira rápido")).toEqual([]);
    expect(termosProibidosEm("condição de lote para lojista")).toEqual([]);
    expect(termosProibidosEm(null)).toEqual([]);
  });
});

describe("checklistDoRepasse", () => {
  it("o repasse completo passa", () => {
    expect(checklistDoRepasse(repasseDeTeste())).toEqual([]);
  });

  it("exige o mínimo de fotos do estoque", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ web_full_images: ["a", "b", "c"] })))).toContain("web_full_images");
  });

  it("exige carroceria e preço", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ carroceria: null })))).toContain("carroceria");
  });

  it("exige FIPE com o mês", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ fipe_valor: null })))).toContain("fipe_valor");
    expect(campos(checklistDoRepasse(repasseDeTeste({ fipe_mes_referencia: null })))).toContain("fipe_mes_referencia");
  });

  it("exige o laudo escolhido, e o texto do apontamento quando houver", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ laudo: null })))).toContain("laudo");
    const semTexto = repasseDeTeste({ laudo: "aprovado_com_apontamento", laudo_apontamento: "  " });
    expect(campos(checklistDoRepasse(semTexto))).toContain("laudo_apontamento");
    const comTexto = repasseDeTeste({ laudo: "aprovado_com_apontamento", laudo_apontamento: "Repintura no para-choque traseiro" });
    expect(checklistDoRepasse(comTexto)).toEqual([]);
  });

  it("exige leilão e sinistro informados, com detalhe quando constam, e a data da consulta", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ leilao_consta: null })))).toContain("leilao_consta");
    expect(campos(checklistDoRepasse(repasseDeTeste({ sinistro_consta: true, sinistro_detalhe: null })))).toContain("sinistro_detalhe");
    expect(campos(checklistDoRepasse(repasseDeTeste({ historico_consultado_em: null })))).toContain("historico_consultado_em");
  });

  it("exige resumo de até 140 caracteres e motivo", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ resumo: "x".repeat(141) })))).toContain("resumo");
    expect(campos(checklistDoRepasse(repasseDeTeste({ motivo: null })))).toContain("motivo");
  });

  it("ficha de estado: itens OU 'nenhum defeito conhecido', nunca os dois nem nenhum", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ itens_de_estado: [], sem_defeitos_conhecidos: false })))).toContain("itens_de_estado");
    expect(campos(checklistDoRepasse(repasseDeTeste({ sem_defeitos_conhecidos: true })))).toContain("sem_defeitos_conhecidos");
    const semDefeitos = repasseDeTeste({ itens_de_estado: [], sem_defeitos_conhecidos: true, oficina_do_orcamento: null, orcamento_em: null });
    expect(checklistDoRepasse(semDefeitos)).toEqual([]);
  });

  it("todo defeito tem foto — é a promessa da página", () => {
    const r = repasseDeTeste();
    r.itens_de_estado[2] = { ...r.itens_de_estado[2], foto: null };
    expect(campos(checklistDoRepasse(r))).toContain("itens_de_estado[2].foto");
  });

  it("orçamento exige oficina e data", () => {
    expect(campos(checklistDoRepasse(repasseDeTeste({ oficina_do_orcamento: null })))).toContain("oficina_do_orcamento");
    expect(campos(checklistDoRepasse(repasseDeTeste({ orcamento_em: null })))).toContain("orcamento_em");
  });

  it("barra o texto digitado com termo proibido — o 'não girou' no resumo", () => {
    const r = repasseDeTeste({ resumo: "Bom carro, só não girou no pátio." });
    expect(checklistDoRepasse(r)).toContainEqual({
      campo: "resumo",
      mensagem: "O texto usa um termo que o repasse não usa: não girou.",
    });
  });

  it("barra termo proibido também na descrição de um defeito", () => {
    const r = repasseDeTeste();
    r.itens_de_estado[0] = { ...r.itens_de_estado[0], descricao: "Parado no pátio há meses" };
    expect(campos(checklistDoRepasse(r))).toContain("itens_de_estado[0].descricao");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/checklist-do-repasse.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`src/lib/checklistDoRepasse.ts`:

```ts
/**
 * O que um repasse precisa ter para ir à validação (spec §5), e os termos que
 * a seção nunca usa (spec §2 e §9).
 *
 * A lista de termos vale para o texto DIGITADO no painel (resumo, motivo,
 * apontamento, histórico, defeitos) e, no PR 3, para o texto fixo da página.
 * As regras são do dono, 24/09: nunca dizer que um carro "não girou" — tira o
 * apelo —, não citar CDC nem direitos do consumidor, e os rótulos antigos
 * ("fora do perfil", "veio em lote") saíram.
 *
 * Cada padrão casa a EXPRESSÃO, não a palavra solta: "retrovisor direito" e
 * "o repasse gira rápido" são texto legítimo e precisam passar.
 */
import { MINIMO_DE_FOTOS } from "./coerenciaDoCadastro";
import type { Repasse } from "./repasse";

export const TERMOS_PROIBIDOS_DO_REPASSE: ReadonlyArray<{ termo: string; padrao: RegExp }> = [
  { termo: "não girou", padrao: /\bn[ãa]o\s+gir(ou|a|ava|ar)\b/i },
  { termo: "sem giro", padrao: /\bsem\s+giro\b/i },
  { termo: "encalhado", padrao: /\bencalhad[oa]s?\b/i },
  { termo: "parado no pátio", padrao: /\bparad[oa]s?\s+no\s+p[áa]tio\b/i },
  { termo: "tempo demais no pátio", padrao: /\btempo\s+demais\s+no\s+p[áa]tio\b/i },
  { termo: "fora do perfil", padrao: /\bfora\s+do\s+perfil\b/i },
  { termo: "veio em lote", padrao: /\bveio\s+(em|num|de)\s+lote\b/i },
  { termo: "CDC", padrao: /\bCDC\b/ },
  { termo: "código de defesa", padrao: /\bc[óo]digo\s+de\s+defesa\b/i },
  { termo: "direitos do consumidor", padrao: /\bdireitos?\s+(do|de|dos)\s+consumidor(es)?\b/i },
  { termo: "seus direitos", padrao: /\bseus\s+direitos\b/i },
  { termo: "consumidor", padrao: /\bconsumidor(a|es|as)?\b/i },
  { termo: "premium", padrao: /\bpremium\b/i },
  { termo: "exclusivo", padrao: /\bexclusiv[oa]s?\b/i },
  { termo: "melhor preço", padrao: /\bmelhor(es)?\s+pre[çc]os?\b/i },
  { termo: "consulte", padrao: /\bconsulte(-nos)?\b/i },
  { termo: "a partir de R$", padrao: /\ba\s+partir\s+de\s+R\$/i },
  { termo: "três em dez", padrao: /\b(de\s+cada\s+dez|tr[êe]s\s+em\s+dez|3\s+em\s+10|3\s+de\s+cada\s+10)\b/i },
  { termo: "porcentagem", padrao: /\d\s*%/ },
];

export function termosProibidosEm(texto: string | null | undefined): string[] {
  if (!texto) return [];
  // "direitos do consumidor" também casa "consumidor"; os dois rótulos saem,
  // e isso é certo — a mensagem mostra o primeiro.
  return TERMOS_PROIBIDOS_DO_REPASSE.filter(({ padrao }) => padrao.test(texto)).map(({ termo }) => termo);
}

export interface FaltaDoChecklist {
  campo: string;
  mensagem: string;
}

const vazio = (v: string | null | undefined) => !v || v.trim() === "";

export function checklistDoRepasse(r: Repasse): FaltaDoChecklist[] {
  const faltas: FaltaDoChecklist[] = [];
  const falta = (campo: string, mensagem: string) => faltas.push({ campo, mensagem });

  if (r.web_full_images.length < MINIMO_DE_FOTOS) {
    falta("web_full_images", `Faltam fotos: o mínimo é ${MINIMO_DE_FOTOS}.`);
  }
  if (vazio(r.marca)) falta("marca", "Informe a marca.");
  if (vazio(r.modelo)) falta("modelo", "Informe o modelo.");
  if (!r.carroceria) falta("carroceria", "Escolha a carroceria — é por ela que a lista é avisada.");
  if (!(r.preco > 0)) falta("preco", "Informe o preço à vista.");
  if (!(r.quilometragem >= 0)) falta("quilometragem", "Informe a quilometragem.");

  if (!(typeof r.fipe_valor === "number" && r.fipe_valor > 0)) falta("fipe_valor", "Consulte a FIPE.");
  if (vazio(r.fipe_mes_referencia)) falta("fipe_mes_referencia", "Falta o mês de referência da FIPE.");

  if (!r.laudo) falta("laudo", "Escolha a situação do laudo cautelar.");
  if (r.laudo === "aprovado_com_apontamento" && vazio(r.laudo_apontamento)) {
    falta("laudo_apontamento", "Escreva o apontamento do laudo.");
  }

  if (r.leilao_consta === null) falta("leilao_consta", "Informe se consta leilão.");
  if (r.leilao_consta === true && vazio(r.leilao_detalhe)) falta("leilao_detalhe", "Descreva o registro de leilão.");
  if (r.sinistro_consta === null) falta("sinistro_consta", "Informe se consta sinistro.");
  if (r.sinistro_consta === true && vazio(r.sinistro_detalhe)) falta("sinistro_detalhe", "Descreva o registro de sinistro.");
  if (vazio(r.historico_consultado_em)) falta("historico_consultado_em", "Informe a data da consulta do histórico.");

  if (vazio(r.resumo)) falta("resumo", "Escreva a linha do card.");
  else if ((r.resumo ?? "").length > 140) falta("resumo", "A linha do card tem até 140 caracteres.");
  if (vazio(r.motivo)) falta("motivo", "Escreva por que o carro está no repasse.");

  const temItens = r.itens_de_estado.length > 0;
  if (!temItens && !r.sem_defeitos_conhecidos) {
    falta("itens_de_estado", "Liste os defeitos conhecidos ou marque 'nenhum defeito conhecido'.");
  }
  if (temItens && r.sem_defeitos_conhecidos) {
    falta("sem_defeitos_conhecidos", "Há defeitos listados: desmarque 'nenhum defeito conhecido'.");
  }
  r.itens_de_estado.forEach((item, i) => {
    if (vazio(item.descricao)) falta(`itens_de_estado[${i}].descricao`, "Descreva o defeito.");
    if (vazio(item.local)) falta(`itens_de_estado[${i}].local`, "Diga onde está o defeito.");
    if (vazio(item.foto)) falta(`itens_de_estado[${i}].foto`, "Todo defeito tem foto.");
    if (item.orcamento !== null && !(item.orcamento > 0)) {
      falta(`itens_de_estado[${i}].orcamento`, "Orçamento precisa ser maior que zero.");
    }
  });
  const temOrcamento = r.itens_de_estado.some((item) => typeof item.orcamento === "number" && item.orcamento > 0);
  if (temOrcamento && vazio(r.oficina_do_orcamento)) falta("oficina_do_orcamento", "Informe a oficina do orçamento.");
  if (temOrcamento && vazio(r.orcamento_em)) falta("orcamento_em", "Informe a data do orçamento.");

  const textos: Array<[string, string | null]> = [
    ["resumo", r.resumo],
    ["motivo", r.motivo],
    ["laudo_apontamento", r.laudo_apontamento],
    ["leilao_detalhe", r.leilao_detalhe],
    ["sinistro_detalhe", r.sinistro_detalhe],
    ...r.itens_de_estado.map((item, i): [string, string | null] => [`itens_de_estado[${i}].descricao`, item.descricao]),
  ];
  for (const [campo, texto] of textos) {
    const achados = termosProibidosEm(texto);
    if (achados.length > 0) {
      falta(campo, `O texto usa um termo que o repasse não usa: ${achados[0]}.`);
    }
  }

  return faltas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/checklist-do-repasse.test.ts`
Expected: PASS.

- [ ] **Step 5: Provar que a trava reprova com o bug real**

O bug que a trava existe para impedir é o padrão do "não girou" deixar passar a frase real. Trocar temporariamente, em `src/lib/checklistDoRepasse.ts`, `/\bn[ãa]o\s+gir(ou|a|ava|ar)\b/i` por `/\bnao\s+girou\b/i` (sem acento, forma única).
Run: `npx vitest run tests/checklist-do-repasse.test.ts`
Expected: FAIL em "pega o 'não girou'…" e em "barra o texto digitado…".
Restaurar o padrão original e rodar de novo: PASS. Não commitar a sabotagem.

- [ ] **Step 6: Commit**

```bash
git add src/lib/checklistDoRepasse.ts tests/checklist-do-repasse.test.ts
git commit -m "feat(repasse): checklist de validação e termos proibidos" -m "O 'não girou', CDC e direitos barrados também no texto digitado no painel; todo defeito com foto; orçamento exige oficina e data. Spec §5 e §9." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Permissões do repasse (`src/lib/permissoes.ts`)

**Files:**
- Modify: `src/lib/permissoes.ts` — dentro de `MATRIZ_DE_PERMISSOES`, logo depois da linha `"Publicar ou despublicar veículo"`.
- Test: `tests/permissoes.test.ts` (acrescentar um `describe` no fim).

**Interfaces:**
- Consumes: `linha(acao, [admin, gestor, marketing, comercial, financeiro], observacao)` e `podeFazer(perfil, acao): Permissao` já existentes.
- Produces: as ações `"Cadastrar carro de repasse"` e `"Validar e publicar repasse"`, que o PR 2 consulta com `podeFazer`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `tests/permissoes.test.ts`:

```ts
describe("repasse (spec 2026-09-24 §5)", () => {
  it("qualquer perfil cadastra um carro de repasse", () => {
    for (const p of PERFIS) {
      expect(podeFazer(p, "Cadastrar carro de repasse")).toBe("faz");
    }
  });

  it("só Administrador, Gestor e Comercial validam e publicam", () => {
    expect(podeFazer("admin", "Validar e publicar repasse")).toBe("faz");
    expect(podeFazer("gestor", "Validar e publicar repasse")).toBe("faz");
    expect(podeFazer("comercial", "Validar e publicar repasse")).toBe("faz");
    expect(podeFazer("marketing", "Validar e publicar repasse")).toBe("nao_ve");
    expect(podeFazer("financeiro", "Validar e publicar repasse")).toBe("nao_ve");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/permissoes.test.ts`
Expected: FAIL no bloco "repasse" (a ação não existe na matriz; `podeFazer` não devolve `"faz"`).

- [ ] **Step 3: Implementar**

Em `src/lib/permissoes.ts`, logo depois do `linha("Publicar ou despublicar veículo", …)`:

```ts
  // Repasse Motors (spec 2026-09-24 §5, dono 24/09): "qualquer nível de
  // usuário cadastra; comercial e gerente podem validar" — gerente é o
  // Gestor. Quem não valida lança o rascunho e envia para validação.
  linha(
    "Cadastrar carro de repasse",
    ["faz", "faz", "faz", "faz", "faz"],
    "Rascunho e envio para validação",
  ),
  linha(
    "Validar e publicar repasse",
    ["faz", "faz", "nao_ve", "faz", "nao_ve"],
    "Inclui abrir para todos, reservar, vender, arquivar e devolver",
  ),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/permissoes.test.ts`
Expected: PASS (o bloco novo e os testes antigos, inclusive "toda linha cobre todos os perfis").

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissoes.ts tests/permissoes.test.ts
git commit -m "feat(repasse): permissões de cadastro e validação" -m "Qualquer perfil cadastra; Administrador, Gestor e Comercial validam (dono, 24/09)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Caminho das fotos do repasse (`src/lib/fotosDoVeiculo.ts`)

**Files:**
- Modify: `src/lib/fotosDoVeiculo.ts` — nova função logo depois de `caminhoDaFoto`.
- Test: `tests/fotos-do-repasse.test.ts`

**Interfaces:**
- Consumes: `VarianteDaFoto`, `EXTENSAO_DA_VARIANTE`, `PREFIXO_PUBLICO`, `ehFotoPropria` (mesmo arquivo).
- Produces: `PASTA_DO_REPASSE = "repasse"` e `caminhoDaFotoDoRepasse(repasseId: string, lote: string, variante: VarianteDaFoto): string`, que o PR 2 usa no upload.

- [ ] **Step 1: Escrever os testes que falham**

`tests/fotos-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  caminhoDaFotoDoRepasse,
  EXTENSAO_DA_VARIANTE,
  PREFIXO_PUBLICO,
  ehFotoPropria,
} from "../src/lib/fotosDoVeiculo";

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";

describe("caminhoDaFotoDoRepasse", () => {
  it("pasta própria do repasse, mesmo formato de lote e variante do estoque", () => {
    expect(caminhoDaFotoDoRepasse(ID, "m1abc-x9y8z7", "web")).toBe(
      `repasse/${ID}/m1abc-x9y8z7-web.${EXTENSAO_DA_VARIANTE.web}`,
    );
    expect(caminhoDaFotoDoRepasse(ID, "m1abc-x9y8z7", "zap")).toBe(
      `repasse/${ID}/m1abc-x9y8z7-zap.${EXTENSAO_DA_VARIANTE.zap}`,
    );
  });

  it("uuid em maiúsculas vira minúsculas — a pasta é uma só", () => {
    expect(caminhoDaFotoDoRepasse(ID.toUpperCase(), "l1", "web")).toBe(`repasse/${ID}/l1-web.webp`);
  });

  it("recusa id que não é uuid — nada de '../' dentro do bucket", () => {
    expect(() => caminhoDaFotoDoRepasse("../8123456", "l1", "web")).toThrow();
    expect(() => caminhoDaFotoDoRepasse("8123456", "l1", "web")).toThrow();
  });

  it("recusa lote fora do formato", () => {
    expect(() => caminhoDaFotoDoRepasse(ID, "../x", "web")).toThrow();
  });

  it("a URL pública da foto do repasse é reconhecida como foto própria", () => {
    const url = `https://abc.supabase.co${PREFIXO_PUBLICO}${caminhoDaFotoDoRepasse(ID, "l1", "web")}`;
    expect(ehFotoPropria(url)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/fotos-do-repasse.test.ts`
Expected: FAIL — `caminhoDaFotoDoRepasse is not a function` / não exportado.

- [ ] **Step 3: Implementar**

Em `src/lib/fotosDoVeiculo.ts`, logo depois de `caminhoDaFoto`:

```ts
/** Pasta do bucket onde moram as fotos dos carros de repasse (spec 2026-09-24 §4.5). */
export const PASTA_DO_REPASSE = "repasse";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * O caminho de uma foto de carro de repasse — inclusive foto de defeito.
 *
 * Mesmo bucket e mesmas variantes do estoque, numa pasta própria: o carro de
 * repasse não tem `estoque_motors.id`, e `caminhoDaFoto` recusa com razão
 * tudo o que não é dígito. Aqui a régua é o uuid de `repasses.id`, pelo mesmo
 * motivo — um id vindo da URL não pode virar `../` dentro do bucket.
 */
export function caminhoDaFotoDoRepasse(
  repasseId: string,
  lote: string,
  variante: VarianteDaFoto,
): string {
  const pasta = String(repasseId).trim().toLowerCase();
  if (!UUID.test(pasta)) {
    throw new Error("Id de repasse inválido para o caminho da foto.");
  }
  if (!/^[a-z0-9-]+$/.test(lote)) {
    throw new Error("Lote inválido para o caminho da foto.");
  }
  return `${PASTA_DO_REPASSE}/${pasta}/${lote}-${variante}.${EXTENSAO_DA_VARIANTE[variante]}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/fotos-do-repasse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fotosDoVeiculo.ts tests/fotos-do-repasse.test.ts
git commit -m "feat(repasse): caminho das fotos na pasta repasse/<uuid>" -m "Mesmo bucket e variantes do estoque; id validado como uuid. Spec §4.5." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Consulta FIPE reusável (`src/lib/consultaFipe.ts`)

**Files:**
- Create: `src/lib/consultaFipe.ts`
- Test: `tests/consulta-fipe.test.ts`

**Interfaces:**
- Produces:
  - `FIPE_BASE = "https://parallelum.com.br/fipe/api/v1"`
  - `type TipoFipe = "carros" | "motos" | "caminhoes"`
  - `interface OpcaoFipe { codigo: string; nome: string }`
  - `interface ValorFipe { valor: number; codigo: string; mesReferencia: string }`
  - `type Buscar = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>`
  - `valorFipeEmNumero(bruto: unknown): number | null`
  - `listarMarcas(tipo, buscar?)`, `listarModelos(tipo, marca, buscar?)`, `listarAnos(tipo, marca, modelo, buscar?)` → `Promise<OpcaoFipe[]>`
  - `consultarValor(tipo, marca, modelo, ano, buscar?)` → `Promise<ValorFipe | null>`
  - O editor do PR 2 chama estas funções no navegador, como a `/avaliacao` faz hoje.

- [ ] **Step 1: Escrever os testes que falham**

`tests/consulta-fipe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FIPE_BASE,
  valorFipeEmNumero,
  listarMarcas,
  listarModelos,
  listarAnos,
  consultarValor,
  type Buscar,
} from "../src/lib/consultaFipe";

function buscarFalso(respostas: Record<string, unknown>, pedidos: string[] = []): Buscar {
  return async (url) => {
    pedidos.push(url);
    if (!(url in respostas)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => respostas[url] };
  };
}

describe("valorFipeEmNumero", () => {
  it("lê o valor como a API devolve", () => {
    expect(valorFipeEmNumero("R$ 42.100,00")).toBe(42100);
    expect(valorFipeEmNumero("R$ 1.234.567,89")).toBe(1234567.89);
  });
  it("o que não é valor vira null", () => {
    expect(valorFipeEmNumero("")).toBeNull();
    expect(valorFipeEmNumero(undefined)).toBeNull();
    expect(valorFipeEmNumero("R$ 0,00")).toBeNull();
  });
});

describe("a cascata", () => {
  it("marcas, modelos e anos viram opções com código em texto", async () => {
    const pedidos: string[] = [];
    const buscar = buscarFalso(
      {
        [`${FIPE_BASE}/carros/marcas`]: [{ codigo: "48", nome: "Renault" }],
        [`${FIPE_BASE}/carros/marcas/48/modelos`]: { modelos: [{ codigo: 8452, nome: "KWID Zen 1.0" }], anos: [] },
        [`${FIPE_BASE}/carros/marcas/48/modelos/8452/anos`]: [{ codigo: "2021-1", nome: "2021 Gasolina" }],
      },
      pedidos,
    );
    expect(await listarMarcas("carros", buscar)).toEqual([{ codigo: "48", nome: "Renault" }]);
    expect(await listarModelos("carros", "48", buscar)).toEqual([{ codigo: "8452", nome: "KWID Zen 1.0" }]);
    expect(await listarAnos("carros", "48", "8452", buscar)).toEqual([{ codigo: "2021-1", nome: "2021 Gasolina" }]);
    expect(pedidos).toHaveLength(3);
  });

  it("o valor chega com código e mês, sem o espaço que a API deixa no fim", async () => {
    const buscar = buscarFalso({
      [`${FIPE_BASE}/carros/marcas/48/modelos/8452/anos/2021-1`]: {
        Valor: "R$ 42.100,00",
        CodigoFipe: "025258-0",
        MesReferencia: "setembro de 2026 ",
      },
    });
    expect(await consultarValor("carros", "48", "8452", "2021-1", buscar)).toEqual({
      valor: 42100,
      codigo: "025258-0",
      mesReferencia: "setembro de 2026",
    });
  });

  it("resposta sem valor devolve null; erro HTTP lança", async () => {
    const semValor = buscarFalso({ [`${FIPE_BASE}/carros/marcas/1/modelos/2/anos/3`]: { Valor: "" } });
    expect(await consultarValor("carros", "1", "2", "3", semValor)).toBeNull();
    await expect(listarMarcas("carros", buscarFalso({}))).rejects.toThrow(/FIPE/);
  });

  it("código com caractere estranho vai escapado na URL", async () => {
    const pedidos: string[] = [];
    await listarModelos("carros", "4/8", buscarFalso({}, pedidos)).catch(() => undefined);
    expect(pedidos[0]).toBe(`${FIPE_BASE}/carros/marcas/4%2F8/modelos`);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/consulta-fipe.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`src/lib/consultaFipe.ts`:

```ts
/**
 * Consulta à tabela FIPE pela API pública parallelum — a mesma que a
 * `/avaliacao` usa em `AutoAvaliacao.tsx`, agora como lib reusável.
 *
 * Roda no NAVEGADOR, como lá: não há cliente de FIPE no servidor, e a API não
 * pede chave. `buscar` é injetável para o teste não depender da rede.
 *
 * `AutoAvaliacao.tsx` continua com a cópia dele por enquanto: o funil
 * `/avaliacao` não pode quebrar em fase nenhuma (CLAUDE.md), e trocá-lo não é
 * assunto do repasse.
 */
export const FIPE_BASE = "https://parallelum.com.br/fipe/api/v1";

export type TipoFipe = "carros" | "motos" | "caminhoes";

export interface OpcaoFipe {
  codigo: string;
  nome: string;
}

export interface ValorFipe {
  valor: number;
  codigo: string;
  mesReferencia: string;
}

export type Buscar = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const buscarPadrao: Buscar = (url) => fetch(url);

/** "R$ 42.100,00" → 42100. Zero, vazio ou lixo → null. */
export function valorFipeEmNumero(bruto: unknown): number | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.replace(/[^\d,]/g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function comoOpcoes(lista: unknown): OpcaoFipe[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const { codigo, nome } = x as { codigo?: unknown; nome?: unknown };
    if (codigo === undefined || codigo === null || typeof nome !== "string") return [];
    return [{ codigo: String(codigo), nome }];
  });
}

async function lerJson(buscar: Buscar, url: string): Promise<unknown> {
  const resposta = await buscar(url);
  if (!resposta.ok) throw new Error(`A FIPE não respondeu: ${url}`);
  return resposta.json();
}

const trecho = (codigo: string) => encodeURIComponent(codigo);

export async function listarMarcas(tipo: TipoFipe, buscar: Buscar = buscarPadrao): Promise<OpcaoFipe[]> {
  return comoOpcoes(await lerJson(buscar, `${FIPE_BASE}/${tipo}/marcas`));
}

export async function listarModelos(tipo: TipoFipe, marca: string, buscar: Buscar = buscarPadrao): Promise<OpcaoFipe[]> {
  const dados = await lerJson(buscar, `${FIPE_BASE}/${tipo}/marcas/${trecho(marca)}/modelos`);
  const modelos = dados && typeof dados === "object" ? (dados as { modelos?: unknown }).modelos : undefined;
  return comoOpcoes(modelos);
}

export async function listarAnos(
  tipo: TipoFipe,
  marca: string,
  modelo: string,
  buscar: Buscar = buscarPadrao,
): Promise<OpcaoFipe[]> {
  return comoOpcoes(await lerJson(buscar, `${FIPE_BASE}/${tipo}/marcas/${trecho(marca)}/modelos/${trecho(modelo)}/anos`));
}

export async function consultarValor(
  tipo: TipoFipe,
  marca: string,
  modelo: string,
  ano: string,
  buscar: Buscar = buscarPadrao,
): Promise<ValorFipe | null> {
  const dados = await lerJson(
    buscar,
    `${FIPE_BASE}/${tipo}/marcas/${trecho(marca)}/modelos/${trecho(modelo)}/anos/${trecho(ano)}`,
  );
  if (!dados || typeof dados !== "object") return null;
  const { Valor, CodigoFipe, MesReferencia } = dados as { Valor?: unknown; CodigoFipe?: unknown; MesReferencia?: unknown };
  const valor = valorFipeEmNumero(Valor);
  if (valor === null) return null;
  return {
    valor,
    codigo: typeof CodigoFipe === "string" ? CodigoFipe : "",
    mesReferencia: typeof MesReferencia === "string" ? MesReferencia.trim() : "",
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/consulta-fipe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/consultaFipe.ts tests/consulta-fipe.test.ts
git commit -m "feat(repasse): consulta FIPE reusável" -m "Cascata da API parallelum com busca injetável; valor, código e mês de referência. A /avaliacao não muda. Spec §6." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Leitura pública dos repasses (`src/lib/leituraDosRepasses.ts`)

**Files:**
- Create: `src/lib/leituraDosRepasses.ts`
- Test: `tests/leitura-dos-repasses.test.ts`

**Interfaces:**
- Consumes: `supabase` (cliente anon, pode ser `null`) de `./supabase`; `Repasse`, `ItemDeEstado`, `LAUDOS_DO_REPASSE`, `SITUACOES_DO_REPASSE`, `CARROCERIAS_DO_REPASSE`, `aparecePublicamente` de `./repasse`.
- Produces:
  - `COLUNAS_PUBLICAS_DO_REPASSE` (lista `as const`) — a Task 7 prova que a migração concede exatamente estas.
  - `repasseDaLinha(linha: Record<string, unknown>): Repasse | null`
  - `lerRepassesPublicos(agora?: Date): Promise<Repasse[]>` — já filtrado por `aparecePublicamente`.
  - `lerRepassePorSlug(slug: string): Promise<Repasse | null>` — sem filtro de carência; a página do PR 3 decide o 404.

- [ ] **Step 1: Escrever os testes que falham**

`tests/leitura-dos-repasses.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { repasseDaLinha, COLUNAS_PUBLICAS_DO_REPASSE } from "../src/lib/leituraDosRepasses";
import { repasseDeTeste } from "./repasseDeTeste";

/** A linha como o PostgREST entrega: numeric pode vir em texto, jsonb como array. */
function linhaDoBanco(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  // `arquivado_em` não é coluna pública: a linha anônima nunca a traz.
  const publico: Record<string, unknown> = { ...repasseDeTeste() };
  delete publico.arquivado_em;
  return { ...publico, preco: "36900.00", fipe_valor: "42100.00", ...parcial };
}

describe("repasseDaLinha", () => {
  it("converte a linha pública no Repasse do código", () => {
    const r = repasseDaLinha(linhaDoBanco());
    expect(r).not.toBeNull();
    expect(r!.preco).toBe(36900);
    expect(r!.fipe_valor).toBe(42100);
    expect(r!.itens_de_estado).toHaveLength(3);
    expect(r!.arquivado_em).toBeNull();
  });

  it("valor fora da lista fechada vira null, nunca passa adiante", () => {
    const r = repasseDaLinha(linhaDoBanco({ laudo: "reprovado", carroceria: "conversivel" }));
    expect(r!.laudo).toBeNull();
    expect(r!.carroceria).toBeNull();
  });

  it("item da ficha sem descrição é descartado; orçamento em texto vira número", () => {
    const r = repasseDaLinha(
      linhaDoBanco({
        itens_de_estado: [
          { descricao: "", local: "x" },
          { descricao: "Embreagem", local: "Câmbio", foto: "f", orcamento: "1400", estetico: false },
        ],
      }),
    );
    expect(r!.itens_de_estado).toEqual([
      { descricao: "Embreagem", local: "Câmbio", foto: "f", orcamento: 1400, estetico: false },
    ]);
  });

  it("linha sem o essencial não vira carro", () => {
    expect(repasseDaLinha(linhaDoBanco({ slug: null }))).toBeNull();
    expect(repasseDaLinha(linhaDoBanco({ preco: null }))).toBeNull();
    expect(repasseDaLinha(linhaDoBanco({ situacao: "sumiu" }))).toBeNull();
  });
});

describe("COLUNAS_PUBLICAS_DO_REPASSE", () => {
  it("nunca inclui quem cadastrou, quem validou ou a org", () => {
    for (const interna of ["criado_por", "validado_por", "enviado_em", "validado_em", "devolvido_com", "org_id", "updated_at"]) {
      expect(COLUNAS_PUBLICAS_DO_REPASSE as readonly string[]).not.toContain(interna);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/leitura-dos-repasses.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar**

`src/lib/leituraDosRepasses.ts`:

```ts
/**
 * Leitura pública dos carros de repasse, com a chave anon.
 *
 * O banco já recorta duas vezes (migração `20260924180000_repasse_fundacao`):
 * a policy só entrega publicado/reservado/vendido, e o GRANT por coluna só
 * entrega as colunas de `COLUNAS_PUBLICAS_DO_REPASSE`. Pedir uma coluna fora
 * da lista faz o PostgREST recusar a consulta inteira — por isso a seleção
 * sai desta constante e o teste `migracao-do-repasse` a compara com o GRANT.
 *
 * A carência do vendido é regra de código, como no estoque: a lista já sai
 * filtrada; a leitura por slug devolve o carro e a página decide o 404.
 */
import { supabase } from "./supabase";
import {
  CARROCERIAS_DO_REPASSE,
  LAUDOS_DO_REPASSE,
  SITUACOES_DO_REPASSE,
  aparecePublicamente,
  type ItemDeEstado,
  type Repasse,
} from "./repasse";

export const COLUNAS_PUBLICAS_DO_REPASSE = [
  "id",
  "slug",
  "marca",
  "modelo",
  "versao",
  "ano_modelo",
  "ano_fabricacao",
  "quilometragem",
  "cambio",
  "combustivel",
  "cor",
  "carroceria",
  "preco",
  "fipe_valor",
  "fipe_codigo",
  "fipe_mes_referencia",
  "laudo",
  "laudo_apontamento",
  "leilao_consta",
  "leilao_detalhe",
  "sinistro_consta",
  "sinistro_detalhe",
  "historico_consultado_em",
  "resumo",
  "motivo",
  "itens_de_estado",
  "sem_defeitos_conhecidos",
  "oficina_do_orcamento",
  "orcamento_em",
  "web_full_images",
  "whatsapp_images",
  "situacao",
  "lojistas_desde",
  "aberto_ao_publico_em",
  "reservado_em",
  "vendido_em",
  "created_at",
] as const;

const SELECAO = COLUNAS_PUBLICAS_DO_REPASSE.join(",");
const SITUACOES_PUBLICAS = ["publicado", "reservado", "vendido"] as const;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

const booleano = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

function umDe<T extends string>(lista: readonly T[], v: unknown): T | null {
  return typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : null;
}

const urls = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];

function itens(v: unknown): ItemDeEstado[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const descricao = texto(o.descricao);
    if (!descricao) return [];
    return [
      {
        descricao,
        local: texto(o.local) ?? "",
        foto: texto(o.foto),
        orcamento: numero(o.orcamento),
        estetico: o.estetico === true,
      },
    ];
  });
}

export function repasseDaLinha(linha: Record<string, unknown>): Repasse | null {
  const id = texto(linha.id);
  const slug = texto(linha.slug);
  const marca = texto(linha.marca);
  const modelo = texto(linha.modelo);
  const anoModelo = numero(linha.ano_modelo);
  const quilometragem = numero(linha.quilometragem);
  const preco = numero(linha.preco);
  const situacao = umDe(SITUACOES_DO_REPASSE, linha.situacao);
  if (!id || !slug || !marca || !modelo || anoModelo === null || quilometragem === null || preco === null || !situacao) {
    return null;
  }
  return {
    id,
    slug,
    marca,
    modelo,
    versao: texto(linha.versao),
    ano_modelo: anoModelo,
    ano_fabricacao: numero(linha.ano_fabricacao),
    quilometragem,
    cambio: texto(linha.cambio),
    combustivel: texto(linha.combustivel),
    cor: texto(linha.cor),
    carroceria: umDe(CARROCERIAS_DO_REPASSE, linha.carroceria),
    preco,
    fipe_valor: numero(linha.fipe_valor),
    fipe_codigo: texto(linha.fipe_codigo),
    fipe_mes_referencia: texto(linha.fipe_mes_referencia),
    laudo: umDe(LAUDOS_DO_REPASSE, linha.laudo),
    laudo_apontamento: texto(linha.laudo_apontamento),
    leilao_consta: booleano(linha.leilao_consta),
    leilao_detalhe: texto(linha.leilao_detalhe),
    sinistro_consta: booleano(linha.sinistro_consta),
    sinistro_detalhe: texto(linha.sinistro_detalhe),
    historico_consultado_em: texto(linha.historico_consultado_em),
    resumo: texto(linha.resumo),
    motivo: texto(linha.motivo),
    itens_de_estado: itens(linha.itens_de_estado),
    sem_defeitos_conhecidos: linha.sem_defeitos_conhecidos === true,
    oficina_do_orcamento: texto(linha.oficina_do_orcamento),
    orcamento_em: texto(linha.orcamento_em),
    web_full_images: urls(linha.web_full_images),
    whatsapp_images: urls(linha.whatsapp_images),
    situacao,
    lojistas_desde: texto(linha.lojistas_desde),
    aberto_ao_publico_em: texto(linha.aberto_ao_publico_em),
    reservado_em: texto(linha.reservado_em),
    vendido_em: texto(linha.vendido_em),
    arquivado_em: texto(linha.arquivado_em),
    created_at: texto(linha.created_at) ?? "",
  };
}

export async function lerRepassesPublicos(agora: Date = new Date()): Promise<Repasse[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("repasses")
    .select(SELECAO)
    .in("situacao", [...SITUACOES_PUBLICAS])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Leitura dos repasses falhou: ${error.message}`);
  return (data ?? []).flatMap((linha) => {
    const r = repasseDaLinha(linha as Record<string, unknown>);
    return r && aparecePublicamente(r, agora) ? [r] : [];
  });
}

export async function lerRepassePorSlug(slug: string): Promise<Repasse | null> {
  if (!supabase || !/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  const { data, error } = await supabase.from("repasses").select(SELECAO).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Leitura do repasse ${slug} falhou: ${error.message}`);
  return data ? repasseDaLinha(data as Record<string, unknown>) : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/leitura-dos-repasses.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leituraDosRepasses.ts tests/leitura-dos-repasses.test.ts
git commit -m "feat(repasse): leitura pública pela chave anon" -m "Seleção sai das colunas públicas; carência do vendido em código; valores fora das listas fechadas viram null. Spec §4.1." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Migração (`supabase/migrations/20260924180000_repasse_fundacao.sql`)

**Files:**
- Create: `supabase/migrations/20260924180000_repasse_fundacao.sql`
- Test: `tests/migracao-do-repasse.test.ts`

**Interfaces:**
- Consumes: `COLUNAS_PUBLICAS_DO_REPASSE` (Task 6); `LAUDOS_DO_REPASSE`, `SITUACOES_DO_REPASSE`, `CARROCERIAS_DO_REPASSE`, `FAIXAS_DO_REPASSE` (Task 1); no banco, `public.org_padrao()`, `public.is_staff(uuid)`, `public.tocar_updated_at()`.
- Produces: tabelas `public.repasses`, `public.repasse_inscritos`, `public.repasse_avisos`; enums `public.laudo_do_repasse`, `public.situacao_do_repasse`; coluna `public.leads.repasse_id`. O PR 2 grava nelas; o PR 3 lê pela Task 6.

- [ ] **Step 1: Escrever o teste que falha**

`tests/migracao-do-repasse.test.ts` — confere a migração contra as listas do código por **igualdade de conjunto**, não por proximidade. A prova de verdade do recorte anônimo é o ensaio do Step 5, que vira `anon` no banco.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLUNAS_PUBLICAS_DO_REPASSE } from "../src/lib/leituraDosRepasses";
import {
  CARROCERIAS_DO_REPASSE,
  FAIXAS_DO_REPASSE,
  LAUDOS_DO_REPASSE,
  SITUACOES_DO_REPASSE,
} from "../src/lib/repasse";

const VERSAO = "20260924180000";
const NOME = "repasse_fundacao";
const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", `${VERSAO}_${NOME}.sql`), "utf8").replace(
  /--[^\n]*/g,
  "",
);

const entreAspas = (trecho: string) => [...trecho.matchAll(/'([^']+)'/g)].map((m) => m[1]);

function capturar(padrao: RegExp): string {
  const m = sql.match(padrao);
  expect(m, `não achei ${padrao}`).not.toBeNull();
  return m![1];
}

describe("migração do repasse", () => {
  it("o anônimo recebe exatamente as colunas públicas do código", () => {
    const colunas = capturar(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.repasses\s+to\s+anon/i)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    expect(colunas).toHaveLength(COLUNAS_PUBLICAS_DO_REPASSE.length);
    expect(new Set(colunas)).toEqual(new Set(COLUNAS_PUBLICAS_DO_REPASSE));
  });

  it("os enums do banco são as listas do código, na mesma ordem", () => {
    expect(entreAspas(capturar(/create type public\.laudo_do_repasse as enum\s*\(([^)]*)\)/i))).toEqual([...LAUDOS_DO_REPASSE]);
    expect(entreAspas(capturar(/create type public\.situacao_do_repasse as enum\s*\(([^)]*)\)/i))).toEqual([
      ...SITUACOES_DO_REPASSE,
    ]);
  });

  it("carroceria e faixa do banco são as do código", () => {
    expect(entreAspas(capturar(/carroceria\s+in\s*\(([^)]*)\)/i))).toEqual([...CARROCERIAS_DO_REPASSE]);
    expect(entreAspas(capturar(/faixa\s+in\s*\(([^)]*)\)/i))).toEqual(FAIXAS_DO_REPASSE.map((f) => f.id));
  });

  it("só uma policy fala com o anônimo, e ela só lê repasses", () => {
    const policies = [...sql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
    const abertas = policies.filter((p) => /\bto\s+(anon|public)\b/i.test(p));
    expect(abertas).toHaveLength(1);
    expect(abertas[0]).toMatch(/on\s+public\.repasses\s+for\s+select\s+to\s+anon/i);
  });

  it("tira do anônimo tudo o que o Supabase concede por padrão, nas três tabelas", () => {
    for (const tabela of ["repasses", "repasse_inscritos", "repasse_avisos"]) {
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+public\\.${tabela}\\s+from\\s+anon`, "i"));
    }
  });

  it("registra a si mesma no livro-razão", () => {
    expect(sql).toMatch(
      new RegExp(
        `insert into supabase_migrations\\.schema_migrations \\(version, name\\)\\s*values \\('${VERSAO}', '${NOME}'\\)\\s*on conflict \\(version\\) do nothing;`,
      ),
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/migracao-do-repasse.test.ts`
Expected: FAIL — `ENOENT` (arquivo da migração não existe).

- [ ] **Step 3: Escrever a migração**

`supabase/migrations/20260924180000_repasse_fundacao.sql`:

```sql
-- ============================================================================
-- Repasse Motors — fundação de dados
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md, §4 e §5.
--
-- Carros vendidos no estado, sem a garantia da loja, que hoje não estão em
-- sistema nenhum (dono, 24/09). Três tabelas próprias:
--
--   repasses           o carro, a conta, a ficha de estado, as fotos, a situação
--   repasse_inscritos  a lista do WhatsApp (consumidor e lojista)
--   repasse_avisos     quem da lista já foi avisado de qual carro
--
-- Fora de `estoque_motors` de propósito: todo leitor dela (vitrine, hubs,
-- sitemap, catálogo da Meta, llms.txt) teria de aprender a excluir o repasse,
-- e o CLAUDE.md a mantém intocada até a F2. E sem reusar `modalidade_tipo`,
-- cujo valor 'repasse' já significa outra coisa (carro que ENTROU vindo de
-- outro lojista, em `veiculo_entradas`).
--
-- Leitura pública: `anon` lê só publicado/reservado/vendido (policy) e só as
-- colunas do GRANT — a mesma lista de COLUNAS_PUBLICAS_DO_REPASSE
-- (src/lib/leituraDosRepasses.ts). Inscritos e avisos não têm porta anônima:
-- a lista é gravada pela rota de leads com a chave de serviço.
-- Quem valida e publica é conferido na rota do painel (podeFazer), não aqui.
-- ============================================================================

do $$ begin
  create type public.laudo_do_repasse as enum ('aprovado', 'aprovado_com_apontamento', 'nao_feito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.situacao_do_repasse as enum ('rascunho', 'em_validacao', 'publicado', 'reservado', 'vendido', 'arquivado');
exception when duplicate_object then null; end $$;

create table if not exists public.repasses (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null default public.org_padrao(),
  slug                     text not null unique,
  marca                    text not null,
  modelo                   text not null,
  versao                   text,
  ano_modelo               smallint not null check (ano_modelo between 1950 and 2100),
  ano_fabricacao           smallint check (ano_fabricacao is null or ano_fabricacao between 1950 and 2100),
  quilometragem            integer not null check (quilometragem >= 0),
  cambio                   text,
  combustivel              text,
  cor                      text,
  carroceria               text check (carroceria is null or carroceria in ('hatch', 'seda', 'suv', 'picape', 'outro')),
  preco                    numeric(12,2) not null check (preco > 0),
  fipe_valor               numeric(12,2) check (fipe_valor is null or fipe_valor > 0),
  fipe_codigo              text,
  fipe_mes_referencia      text,
  -- Nulo até alguém escolher: publicar exige escolha explícita. Não existe
  -- 'reprovado' — carro reprovado não entra no repasse (dono, 24/09).
  laudo                    public.laudo_do_repasse,
  laudo_apontamento        text,
  leilao_consta            boolean,
  leilao_detalhe           text,
  sinistro_consta          boolean,
  sinistro_detalhe         text,
  historico_consultado_em  date,
  resumo                   text check (resumo is null or char_length(resumo) <= 140),
  motivo                   text,
  itens_de_estado          jsonb not null default '[]'::jsonb check (jsonb_typeof(itens_de_estado) = 'array'),
  sem_defeitos_conhecidos  boolean not null default false,
  oficina_do_orcamento     text,
  orcamento_em             date,
  web_full_images          jsonb not null default '[]'::jsonb check (jsonb_typeof(web_full_images) = 'array'),
  whatsapp_images          jsonb not null default '[]'::jsonb check (jsonb_typeof(whatsapp_images) = 'array'),
  situacao                 public.situacao_do_repasse not null default 'rascunho',
  -- "Só lojistas" = publicado e aberto_ao_publico_em nulo; o switch manual
  -- "abrir para todos" grava now() (dono, 24/09).
  lojistas_desde           timestamptz,
  aberto_ao_publico_em     timestamptz,
  reservado_em             timestamptz,
  vendido_em               timestamptz,
  arquivado_em             timestamptz,
  criado_por               uuid,
  enviado_em               timestamptz,
  validado_por             uuid,
  validado_em              timestamptz,
  devolvido_com            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint repasse_apontamento_tem_texto check (
    laudo is distinct from 'aprovado_com_apontamento' or nullif(trim(laudo_apontamento), '') is not null
  ),
  constraint repasse_publicado_tem_data check (
    situacao not in ('publicado', 'reservado', 'vendido') or lojistas_desde is not null
  ),
  constraint repasse_vendido_tem_data check (situacao <> 'vendido' or vendido_em is not null)
);
comment on table public.repasses is
  'Repasse Motors: carro vendido no estado, sem a garantia da loja (spec 2026-09-24). Não confundir com modalidade_tipo = repasse (entrada vinda de outro lojista).';

create index if not exists repasses_situacao_idx on public.repasses (situacao);

drop trigger if exists repasses_updated_at on public.repasses;
create trigger repasses_updated_at before update on public.repasses
  for each row execute function public.tocar_updated_at();

create table if not exists public.repasse_inscritos (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default public.org_padrao(),
  lead_id             uuid references public.leads(id) on delete set null,
  trilha              text not null check (trilha in ('consumidor', 'lojista')),
  nome                text not null,
  whatsapp            text not null,
  faixa               text check (faixa is null or faixa in ('ate-30', '30-50', '50-80', 'acima-80')),
  carrocerias         text[] not null default '{}',
  cnpj                text,
  loja_cidade         text,
  cnpj_conferido_em   timestamptz,
  cnpj_conferido_por  uuid,
  created_at          timestamptz not null default now(),
  unique (org_id, trilha, whatsapp),
  constraint inscrito_lojista_tem_cnpj check (trilha <> 'lojista' or nullif(trim(cnpj), '') is not null)
);
comment on table public.repasse_inscritos is
  'Lista do repasse (spec 2026-09-24 §4.2). Sair da lista APAGA a linha — é o que a /privacidade promete.';

create table if not exists public.repasse_avisos (
  repasse_id   uuid not null references public.repasses(id) on delete cascade,
  inscrito_id  uuid not null references public.repasse_inscritos(id) on delete cascade,
  org_id       uuid not null default public.org_padrao(),
  avisado_por  uuid,
  avisado_em   timestamptz not null default now(),
  primary key (repasse_id, inscrito_id)
);

alter table public.leads add column if not exists repasse_id uuid references public.repasses(id) on delete set null;

-- ----------------------------------------------------------------------------
-- RLS e privilégios
-- ----------------------------------------------------------------------------
alter table public.repasses enable row level security;
alter table public.repasse_inscritos enable row level security;
alter table public.repasse_avisos enable row level security;

drop policy if exists repasse_staff_le on public.repasses;
create policy repasse_staff_le on public.repasses for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists repasse_staff_insere on public.repasses;
create policy repasse_staff_insere on public.repasses for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists repasse_staff_atualiza on public.repasses;
create policy repasse_staff_atualiza on public.repasses for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists repasse_anon_le_publicados on public.repasses;
create policy repasse_anon_le_publicados on public.repasses for select to anon
  using (situacao in ('publicado', 'reservado', 'vendido'));

drop policy if exists inscrito_staff_le on public.repasse_inscritos;
create policy inscrito_staff_le on public.repasse_inscritos for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists inscrito_staff_atualiza on public.repasse_inscritos;
create policy inscrito_staff_atualiza on public.repasse_inscritos for update to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao())
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists inscrito_staff_apaga on public.repasse_inscritos;
create policy inscrito_staff_apaga on public.repasse_inscritos for delete to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

drop policy if exists aviso_staff_le on public.repasse_avisos;
create policy aviso_staff_le on public.repasse_avisos for select to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists aviso_staff_insere on public.repasse_avisos;
create policy aviso_staff_insere on public.repasse_avisos for insert to authenticated
  with check (public.is_staff(auth.uid()) and org_id = public.org_padrao());
drop policy if exists aviso_staff_apaga on public.repasse_avisos;
create policy aviso_staff_apaga on public.repasse_avisos for delete to authenticated
  using (public.is_staff(auth.uid()) and org_id = public.org_padrao());

-- O Supabase concede tudo a anon por padrão em tabela nova; a RLS barra
-- linha, não coluna. Sem estes REVOKE, o anônimo leria criado_por.
revoke all on public.repasses from anon;
revoke all on public.repasse_inscritos from anon;
revoke all on public.repasse_avisos from anon;
grant select (
  id, slug, marca, modelo, versao, ano_modelo, ano_fabricacao, quilometragem,
  cambio, combustivel, cor, carroceria, preco, fipe_valor, fipe_codigo,
  fipe_mes_referencia, laudo, laudo_apontamento, leilao_consta, leilao_detalhe,
  sinistro_consta, sinistro_detalhe, historico_consultado_em, resumo, motivo,
  itens_de_estado, sem_defeitos_conhecidos, oficina_do_orcamento, orcamento_em,
  web_full_images, whatsapp_images, situacao, lojistas_desde,
  aberto_ao_publico_em, reservado_em, vendido_em, created_at
) on public.repasses to anon;

-- ----------------------------------------------------------------------------
-- Autoconferência: violar cada regra e exigir a recusa; virar anon de verdade.
-- ----------------------------------------------------------------------------
do $$
declare
  publicado uuid;
  rascunho  uuid;
  vistos    int;
  vazou     boolean := false;
  falhas    int := 0;
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('repasses', 'repasse_inscritos', 'repasse_avisos')
      and not c.relrowsecurity
  ) then
    raise exception 'ACEITE FALHOU: RLS desligada numa tabela do repasse';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('repasses', 'repasse_inscritos', 'repasse_avisos')
      and ('anon' = any(roles) or 'public' = any(roles))
      and not (tablename = 'repasses' and cmd = 'SELECT' and policyname = 'repasse_anon_le_publicados')
  ) then
    raise exception 'ACEITE FALHOU: porta anônima além da leitura dos publicados';
  end if;

  -- 1. apontamento sem texto
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, laudo)
    values ('aceite-apontamento', 'T', 'T', 2020, 1, 1, 'aprovado_com_apontamento');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 2. publicado sem lojistas_desde
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao)
    values ('aceite-publicado-sem-data', 'T', 'T', 2020, 1, 1, 'publicado');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 3. vendido sem vendido_em
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao, lojistas_desde)
    values ('aceite-vendido-sem-data', 'T', 'T', 2020, 1, 1, 'vendido', now());
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 4. lojista sem CNPJ
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp)
    values ('lojista', 'Aceite', '41900000000');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  -- 5. faixa fora da lista
  begin
    insert into public.repasse_inscritos (trilha, nome, whatsapp, faixa)
    values ('consumidor', 'Aceite', '41900000001', 'ate-100');
    falhas := falhas + 1;
  exception when check_violation then null; end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram pelas constraints', falhas;
  end if;

  insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao, lojistas_desde)
  values ('aceite-publicado', 'T', 'T', 2020, 1, 1, 'publicado', now()) returning id into publicado;
  insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco)
  values ('aceite-rascunho', 'T', 'T', 2020, 1, 1) returning id into rascunho;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    set local role anon;

    select count(id) into vistos from public.repasses where slug in ('aceite-publicado', 'aceite-rascunho');

    begin
      perform criado_por from public.repasses limit 1;
      vazou := true;
    exception when insufficient_privilege then null; end;

    begin
      perform 1 from public.repasse_inscritos limit 1;
      vazou := true;
    exception when insufficient_privilege then null; end;

    reset role;

    if vistos <> 1 then
      raise exception 'ACEITE FALHOU: o anônimo viu % carro(s) de aceite; o esperado era só o publicado', vistos;
    end if;
    if vazou then
      raise exception 'ACEITE FALHOU: o anônimo leu coluna interna de repasses ou a lista de inscritos';
    end if;
  else
    raise notice 'Papel anon inexistente (banco fora do Supabase): conferência anônima pulada.';
  end if;

  delete from public.repasses where id in (publicado, rascunho);

  raise notice 'Repasse OK: 5 violações recusadas; o anônimo vê só o publicado e só as colunas públicas.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260924180000', 'repasse_fundacao')
  on conflict (version) do nothing;
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run tests/migracao-do-repasse.test.ts`
Expected: PASS.

- [ ] **Step 5: Ensaio contra a produção (ROLLBACK)**

O runner lê o `.env.local` e o `pg` da **raiz do clone principal**; o caminho do arquivo é relativo ao diretório de onde se roda. Pode ser feito pelo agente `migration-runner` do repositório.

```powershell
cd C:\Users\Lenovo\Documents\motors-claude\motors-site-oficial
node supabase/manutencao/aplicar-migracao.js ..\wt-repasse\supabase\migrations\20260924180000_repasse_fundacao.sql
```

Expected: a linha `NOTICE … Repasse OK: 5 violações recusadas; o anônimo vê só o publicado e só as colunas públicas.` seguida de `Ensaio OK (revertido): 20260924180000_repasse_fundacao.sql`.
Se sair `FALHOU (revertida)`, ler a mensagem do `ACEITE FALHOU`, corrigir a migração, voltar ao Step 4. **Não rodar com `--gravar`.**

- [ ] **Step 6: Provar que o aceite reprova com o bug real**

O bug que o aceite existe para impedir é o anônimo ler a coluna interna. Numa cópia temporária da migração, fora do repositório, acrescentar `criado_por` à lista do `grant select (...)` e rodar o ensaio com ela:

```powershell
Copy-Item ..\wt-repasse\supabase\migrations\20260924180000_repasse_fundacao.sql $env:TEMP\sabotagem_repasse.sql
# editar $env:TEMP\sabotagem_repasse.sql: trocar "created_at\n) on public.repasses to anon" por "created_at, criado_por\n) on public.repasses to anon"
node supabase/manutencao/aplicar-migracao.js $env:TEMP\sabotagem_repasse.sql
```

Expected: `ACEITE FALHOU: o anônimo leu coluna interna…` e `FALHOU (revertida)`. Apagar a cópia. O arquivo versionado não muda.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260924180000_repasse_fundacao.sql tests/migracao-do-repasse.test.ts
git commit -m "feat(repasse): migração da fundação de dados" -m "repasses, repasse_inscritos, repasse_avisos e leads.repasse_id; RLS nas três; anon lê só publicado/reservado/vendido e só as colunas públicas (GRANT por coluna). Aceite vira anon de verdade. Ensaiada com ROLLBACK; NÃO gravada." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Fechamento do PR 1

**Files:** nenhum novo.

- [ ] **Step 1: Rodar os seis arquivos de teste do PR juntos**

Run: `npx vitest run tests/repasse.test.ts tests/checklist-do-repasse.test.ts tests/permissoes.test.ts tests/fotos-do-repasse.test.ts tests/consulta-fipe.test.ts tests/leitura-dos-repasses.test.ts tests/migracao-do-repasse.test.ts`
Expected: PASS em todos.

- [ ] **Step 2: Push e CI**

```bash
git push
```

Esperar o run `testes` do último commit ficar **concluído e verde nos cinco jobs** (`vitest`, `tipos`, `lint`, `build`, `deploy-vercel`). Medir pela página do commit no navegador embutido, não pela API pública (memória `medir-ci-sem-gh`). `in_progress` não vale. Lint vermelho por erro novo: corrigir no código, nunca somar à `eslint-suppressions.json`.

- [ ] **Step 3: Revisão do `qa-guardian`**

Rodar o agente `qa-guardian` do repositório sobre o diff `origin/main...feat/secao-de-repasse`, com a spec e este plano. Corrigir o que ele achar, commitar, voltar ao Step 2.

- [ ] **Step 4: Ordem do dono para gravar**

**PARAR e pedir ao dono** a ordem explícita para gravar a migração. Com a ordem:

```powershell
cd C:\Users\Lenovo\Documents\motors-claude\motors-site-oficial
node supabase/manutencao/aplicar-migracao.js ..\wt-repasse\supabase\migrations\20260924180000_repasse_fundacao.sql --gravar
```

Expected: o `NOTICE` do aceite e `GRAVADA: 20260924180000_repasse_fundacao.sql`.

- [ ] **Step 5: Abrir o PR**

Com o ok do dono, abrir o PR pelo Chrome logado dele (o `gh` não está autenticado; se a extensão não estiver conectada, avisar). Título: `feat(repasse): PR 1 — fundação de dados`. Corpo: o que entrou (tabelas, libs, permissões), que a migração foi ensaiada e gravada com ordem do dono, o link da spec e deste plano, e a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Merge segue o fluxo em lote da casa (memória `merge-no-main-em-lote-verificado`).
