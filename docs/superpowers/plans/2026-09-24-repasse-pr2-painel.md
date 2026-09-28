# Repasse Motors — PR 2 (painel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à equipe o painel `/admin/repasse` para cadastrar um carro de repasse, mandá-lo à validação, publicar (só para lojistas ou aberto a todos), ligar o switch "abrir para todos", reservar, vender, arquivar, e avisar à mão pelo Chatwoot quem da lista combina com o carro.

**Architecture:** Toda escrita no repasse passa por rota do Next com portão puro (`decidir*`) e grava com a chave de serviço; uma migração tira de `authenticated` a escrita direta nas três tabelas (decisão I4 da revisão do PR 1) e fecha a leitura da lista para quem valida. As regras (campos editáveis, máquina de situações, quem combina com o carro, mensagem do aviso) vivem em libs puras com teste; as telas são server components que leem com a sessão e client components que chamam as rotas.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres, RLS, supabase-js com sessão e com chave de serviço) · Vitest (node; `// @vitest-environment jsdom` para fiação).

**Spec:** `docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md` (§5 e §6; §12 linha "PR 2"). O PR 1 (dados) está no branch `feat/secao-de-repasse`, PR #144, migração `20260924180000_repasse_fundacao.sql` **já gravada** em produção.

**Branch:** `feat/repasse-painel`, criado a partir de `4838efd` (head do PR 1), no worktree `C:\Users\Lenovo\Documents\motors-claude\wt-repasse-painel` (com junção de `node_modules` para o clone principal). Push com `git push -u origin feat/repasse-painel` — **nunca** no branch do PR 1.

## Global Constraints

- Nomes de arquivo, tipo, função, tabela e coluna **em português**, no padrão do repositório.
- **Toda escrita em `repasses`, `repasse_inscritos` e `repasse_avisos` passa por rota** que roda um portão puro e grava com `createAdminSupabaseClient()`. A sessão (`createServerSupabaseClient()`) só identifica quem pede e lê. Depois da migração desta tarefa, `authenticated` não tem INSERT/UPDATE/DELETE nas três tabelas.
- Quem cadastra: `podeFazer(perfis, "Cadastrar carro de repasse") === "faz"` (todos os perfis). Quem valida: `podeFazer(perfis, "Validar e publicar repasse") === "faz"` (Administrador, Gestor, Comercial). Sempre pelos helpers `cadastraRepasse`/`validaRepasse` (Task 3), nunca por lista de papéis escrita à mão.
- As colunas do ciclo de vida — `situacao`, `lojistas_desde`, `aberto_ao_publico_em`, `reservado_em`, `vendido_em`, `arquivado_em`, `criado_por`, `enviado_em`, `validado_por`, `validado_em`, `devolvido_com`, `slug`, `id`, `org_id`, `created_at`, `updated_at` — **nunca** entram pelo PATCH de edição. Mudam só pela criação ou pela rota de transição.
- Toda escrita bem-sucedida registra `registrarAcaoSensivel(admin, "repasse.<ato>", detalhe, autor)` (`src/lib/auditoria.ts`). Detalhe de inscrito **sem nome e sem WhatsApp**: a linha apagada não pode sobreviver no log.
- A lista do repasse é dado pessoal: só quem valida lê (RLS, página e rota concordam).
- Linguagem do dono (spec §2): nunca "não girou" nem parentes; não citar CDC nem direitos do consumidor; laudo "sai a pedido". A mensagem de aviso passa em `termosProibidosEm` com a lista inteira, e há teste disso.
- **Arquivo com `\b`, `\d`, `\s` ou `\u` numa regex ou string: gravar com a ferramenta Write/Edit, nunca por heredoc no shell** (o heredoc transforma `\b` em byte 0x08 — memória `heredoc-come-a-barra-invertida`).
- Reaproveitar: `MINIMO_DE_FOTOS` (`src/lib/coerenciaDoCadastro.ts`), `ehFotoPropria`, `caminhoDaFotoDoRepasse`, `novoLote`, `validarFoto`, `BUCKET_DE_FOTOS`, `fotosDoVeiculo`, `colunasDasFotos` (`src/lib/fotosDoVeiculo.ts`), `processarFotoDeVeiculo` (`src/lib/imageProcessor.ts`), `consultaFipe.ts`, `urlDoSite` (`src/lib/site.ts`), `ehTabelaOuColunaAusente` e `mensagemDeMigracaoPendente` (`src/lib/erroDeSchema.ts`), `papelPadraoPorEmail` (`src/lib/papelPadrao.ts`), `useConfirm` (`src/components/admin/ConfirmDialog.tsx`), `public.tem_papel(uuid, text)` e `public.org_padrao()` no SQL.
- **Teste local só do arquivo mexido** (`npx vitest run tests/<arquivo>.test.ts`). Suíte inteira, `tsc`, lint e build ficam para o CI, que só vale **concluído e verde nos cinco jobs** (`vitest`, `tipos`, `lint`, `build`, `deploy-vercel`). Código novo não traz erro de lint (catraca): nada de `any` fora de dublê de teste.
- Trava nova só conta depois de **reprovar com o bug real** (memória `trava-so-vale-se-reprovar`). Cada tarefa tem um passo de sabotagem.
- **Migração: ensaio (ROLLBACK) antes; `--gravar` só com ordem explícita do dono.** O runner roda do CLONE PRINCIPAL, que tem `.env.local` e `pg`.
- **Ordem de merge:** este PR só vai ao `main` junto com o PR 3 ou depois dele. A mensagem de aviso e o botão "Ver no site" apontam para `/repasse/<slug>`, que nasce no PR 3; antes dele o link cairia no "não encontrado".
- **SDR:** o papel entra por `integracao/quem-entra-24-09`. Quem mesclar por último acrescenta `"sdr"` nos `roles` do grupo "Repasse" do `SidebarNav` (ele cadastra; não entra em "Lista do repasse").
- Todo commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Modelo por tarefa (regra do dono de 20/09): o indicado no título de cada tarefa. No máximo dois agentes Opus ao mesmo tempo; subagente não abre subagente.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/anoDoVeiculo.ts` (novo) | `ANO_MINIMO` e `anoMaximo`, puros (saem de `cadastroDeVeiculo.ts`, que reexporta) |
| `src/lib/repasse.ts` (muda) | `PISO_DO_ANO_NO_BANCO`, `ehIdDeRepasse`, `NOME_DA_SITUACAO`, `emReais`, tipo `RepasseDoPainel` |
| `src/lib/checklistDoRepasse.ts` (muda) | Régua do ano da casa (M2), texto invisível (M8), fotos (M9) |
| `supabase/migrations/20260924200000_repasse_escrita_pela_rota.sql` (novo) | Tira a escrita de `authenticated`, fecha a lista para quem valida, CHECKs de reforço, aceite |
| `src/lib/edicaoDoRepasse.ts` (novo) | Campos editáveis, normalização, `decidirCriacao`, `decidirEdicao`, `cadastraRepasse`, `validaRepasse`, `podeEditarORepasse`, `formularioDe`, `alteracoes` |
| `src/lib/transicoesDoRepasse.ts` (novo) | Atos, regras de cada ato, `atosPossiveis`, `decidirTransicao` |
| `src/lib/avisosDoRepasse.ts` (novo) | Inscrito, `inscritoDaLinha`, `inscritosQueCombinam`, `mensagemDeAvisoDoRepasse`, `decidirAviso`, `decidirMarcacaoDeInscrito` |
| `src/lib/repasseDoPainel.ts` (novo) | `repasseDoPainelDaLinha` (linha inteira, com as colunas internas) — só servidor |
| `src/lib/rotaDoRepasse.ts` (novo) | `sessaoDoRepasse`, `lerRepasseParaEscrita`, `recusar`, `falhaDoBanco` — só servidor |
| `src/app/api/repasses/route.ts` (novo) | POST: cria o rascunho |
| `src/app/api/repasses/[id]/route.ts` (novo) | PATCH: edita |
| `src/app/api/repasses/[id]/transicao/route.ts` (novo) | POST: muda a situação |
| `src/app/api/repasses/[id]/avisos/route.ts` (novo) | POST: marca "avisado" |
| `src/app/api/repasse-inscritos/[id]/route.ts` (novo) | PATCH: CNPJ conferido · DELETE: tira da lista |
| `src/lib/destinoDasFotos.ts` (novo) | `DestinoDasFotos` e `destinoDoRepasse` |
| `src/components/admin/GaleriaDeFotos.tsx` (muda) | Prop opcional `destino`; o padrão continua o estoque |
| `src/lib/fichaDeEstado.ts` (novo) | `ITEM_VAZIO`, `comItem`, `semItem` |
| `src/lib/painelDoRepasse.ts` (novo) | Abas da lista, contagem, aba inicial |
| `src/components/admin/repasse/*.tsx` (novos) | `FichaDeEstadoNoEditor`, `ConsultaFipeDoRepasse`, `AcoesDoRepasse`, `InscritosQueCombinam`, `EditorDeRepasse`, `NovoRepasse`, `TabelaDeInscritos` |
| `src/app/admin/repasse/page.tsx`, `novo/page.tsx`, `[id]/page.tsx`, `inscritos/page.tsx` (novos) | As quatro telas da spec §6 |
| `src/components/admin/SidebarNav.tsx` (muda) | Grupo "Repasse" |
| `tests/bancoDoRepasseDeTeste.ts` (novo) | Dublê do supabase-js para rotas e páginas |
| `tests/repasseDeTeste.ts` (muda) | Fotos no formato do bucket; `linhaDoBancoDeTeste` |

## Desvios da spec, e por quê

A spec foi aprovada antes da revisão final do PR 1. Três pontos mudam aqui, todos para o lado mais fechado:

1. **§4.1 dizia "staff lê e escreve; a validação é conferida na rota, não na policy".** A revisão do PR 1 (I4) mostrou que, com isso, qualquer perfil publicava direto pelo PostgREST, sem passar pela rota. Agora a equipe só lê; toda escrita é da rota com a chave de serviço (Task 2).
2. **§4.2 dizia "staff lê, atualiza e apaga" a lista.** A lista é WhatsApp e CNPJ, e só quem valida avisa alguém (§6: a tela de inscritos é do Comercial). A leitura fica com Administrador, Gestor e Comercial: RLS, página e rota dizem o mesmo (Tasks 2, 10 e 11).
3. **§6 dizia "campo que o perfil não grava não é renderizado".** No repasse, nenhum campo é sigiloso por perfil. O que muda é a situação do carro. Fora do rascunho, quem não valida vê o carro com os campos travados e sem o botão de salvar. Os atos negados somem (Task 10, docblock do editor).

Os três vão no corpo do PR para o dono ver.

## Fora deste PR

- `/repasse`, `/repasse/[carro]`, formulários da lista e do exame, `/privacidade` → PR 3.
- Os leads com `repasse_id` aparecerem no editor do carro (spec §4.4) → PR 3, junto com o formulário do exame que os cria.
- Menu, rodapé, faixas de `/estoque` e da home, `paginasGeo.ts:55-57` → PR 4.

---

### Task 1: Régua do ano, texto invisível e fotos no checklist (M2, M8, M9) — Sonnet

**Files:**
- Create: `src/lib/anoDoVeiculo.ts`
- Modify: `src/lib/cadastroDeVeiculo.ts` (bloco das linhas 191-199 e imports do topo)
- Modify: `src/lib/repasse.ts` (acrescentar no fim)
- Modify: `src/lib/checklistDoRepasse.ts`
- Modify: `tests/repasseDeTeste.ts`
- Modify: `tests/migracao-do-repasse.test.ts` (um `it` a mais)
- Test: `tests/checklist-do-repasse-painel.test.ts` (novo)

**Interfaces:**
- Consumes: `Repasse`, `slugificar` (já em `repasse.ts`); `MINIMO_DE_FOTOS`; `ehFotoPropria`.
- Produces:
  - `ANO_MINIMO: number`, `anoMaximo(hoje?: Date): number` em `src/lib/anoDoVeiculo.ts`.
  - Em `src/lib/repasse.ts`: `PISO_DO_ANO_NO_BANCO = 1950`; `ehIdDeRepasse(id: string): boolean`; `NOME_DA_SITUACAO: Record<SituacaoDoRepasse, string>`; `emReais(valor: number): string`; `interface RepasseDoPainel extends Repasse { criado_por; enviado_em; validado_por; validado_em; devolvido_com; updated_at }` (todos `string | null`).
  - `checklistDoRepasse(r: Repasse, hoje: Date = new Date()): FaltaDoChecklist[]` (o segundo parâmetro é novo e opcional).
  - Em `tests/repasseDeTeste.ts`: `fotoDeTeste(lote: string, variante?: "web" | "zap"): string`.

- [ ] **Step 1: Criar o módulo puro do ano**

`src/lib/anoDoVeiculo.ts`:

```ts
/**
 * Piso e teto de ANO — sanidade de digitação, não regra de negócio.
 *
 * O teto é o ano que vem porque o ano-MODELO legitimamente se adianta ao
 * calendário (um 2027 vendido em 2026). O piso existe para pegar o dedo que
 * digitou 202 ou 20222, não para dizer que a loja não vende carro antigo.
 *
 * Módulo puro desde 24/09: o checklist do repasse roda no navegador e não
 * pode puxar `cadastroDeVeiculo.ts`, que importa a escrita do estoque.
 * `cadastroDeVeiculo.ts` reexporta os dois nomes, e quem já os importa de lá
 * não muda.
 */
export const ANO_MINIMO = 1900;
export const anoMaximo = (hoje: Date = new Date()) => hoje.getFullYear() + 1;
```

Em `src/lib/cadastroDeVeiculo.ts`:
1. Junto dos imports do topo (depois da linha 58, `import { recusaPorPisoDeCusto } from "./pisoDePreco";`), acrescentar:
   ```ts
   import { ANO_MINIMO, anoMaximo } from "./anoDoVeiculo";
   ```
2. Trocar o bloco das linhas 191-199 (o docblock "Piso e teto de ANO" e as duas linhas `export const ANO_MINIMO = 1900;` / `export const anoMaximo = ...`) por:
   ```ts
   /** Piso e teto de ano: moram em `anoDoVeiculo.ts` (módulo puro) desde 24/09. */
   export { ANO_MINIMO, anoMaximo };
   ```

- [ ] **Step 2: Acrescentar os nomes novos em `src/lib/repasse.ts`**

No fim do arquivo:

```ts
/**
 * O piso do `check` de `ano_modelo` e `ano_fabricacao` em
 * 20260924180000_repasse_fundacao.sql. É mais alto que o `ANO_MINIMO` da casa
 * (1900): abaixo dele o banco recusa, então o painel recusa antes, com
 * mensagem. `tests/migracao-do-repasse.test.ts` confere que os dois batem.
 */
export const PISO_DO_ANO_NO_BANCO = 1950;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de repasse é uuid; qualquer outra coisa na URL vira 404 antes do banco. */
export function ehIdDeRepasse(id: string): boolean {
  return UUID.test(id);
}

/** Como a situação aparece no painel. */
export const NOME_DA_SITUACAO: Record<SituacaoDoRepasse, string> = {
  rascunho: "Rascunho",
  em_validacao: "Em validação",
  publicado: "Publicado",
  reservado: "Reservado",
  vendido: "Vendido",
  arquivado: "Arquivado",
};

/** "R$ 36.900": sem centavos, como o resto do site mostra preço de carro. */
export function emReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * O repasse como o PAINEL o vê: a linha inteira, com as colunas que a
 * leitura anônima não recebe (quem criou, quem validou, a nota da devolução).
 * Nunca vai para página pública.
 */
export interface RepasseDoPainel extends Repasse {
  criado_por: string | null;
  enviado_em: string | null;
  validado_por: string | null;
  validado_em: string | null;
  devolvido_com: string | null;
  updated_at: string | null;
}
```

- [ ] **Step 3: Pôr as fotos do fixture no formato do bucket**

Em `tests/repasseDeTeste.ts`, antes de `export function repasseDeTeste`, acrescentar:

```ts
const PASTA_DE_TESTE =
  "https://x.supabase.co/storage/v1/object/public/veiculos/repasse/3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";

/** URL de foto do NOSSO bucket — é o único formato que passa no checklist (M9). */
export function fotoDeTeste(lote: string, variante: "web" | "zap" = "web"): string {
  return `${PASTA_DE_TESTE}/${lote}-${variante}.${variante === "web" ? "webp" : "jpg"}`;
}
```

e, dentro do objeto de `repasseDeTeste`, trocar:
- as três `foto: "https://x.supabase.co/f/N.webp"` por `foto: fotoDeTeste("d1")`, `fotoDeTeste("d2")`, `fotoDeTeste("d3")`;
- `web_full_images: ["w1", "w2", "w3", "w4"]` por `web_full_images: ["l1", "l2", "l3", "l4"].map((l) => fotoDeTeste(l))`;
- `whatsapp_images: ["z1", "z2", "z3", "z4"]` por `whatsapp_images: ["l1", "l2", "l3", "l4"].map((l) => fotoDeTeste(l, "zap"))`.

- [ ] **Step 4: Escrever os testes que falham**

`tests/checklist-do-repasse-painel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checklistDoRepasse } from "../src/lib/checklistDoRepasse";
import { ANO_MINIMO, anoMaximo } from "../src/lib/cadastroDeVeiculo";
import { ANO_MINIMO as ANO_MINIMO_PURO, anoMaximo as anoMaximoPuro } from "../src/lib/anoDoVeiculo";
import { PISO_DO_ANO_NO_BANCO, type Repasse } from "../src/lib/repasse";
import { fotoDeTeste, repasseDeTeste } from "./repasseDeTeste";

/**
 * O que o PR 2 acrescenta ao checklist, antes de o editor gravar (revisão
 * final do PR 1): a régua de ano da casa (M2), o espaço invisível que passava
 * por texto (M8) e os buracos nas fotos (M9).
 */
const HOJE = new Date("2026-09-24T12:00:00Z");
const campos = (r: Repasse) => checklistDoRepasse(r, HOJE).map((f) => f.campo);

describe("a régua do ano é a da casa (M2)", () => {
  it("cadastroDeVeiculo reexporta os mesmos valores do módulo puro", () => {
    expect(ANO_MINIMO).toBe(ANO_MINIMO_PURO);
    expect(anoMaximo(HOJE)).toBe(anoMaximoPuro(HOJE));
  });

  it("o teto é o ano que vem", () => {
    expect(campos(repasseDeTeste({ ano_modelo: 2027, ano_fabricacao: 2026 }))).not.toContain("ano_modelo");
    expect(campos(repasseDeTeste({ ano_modelo: 2028, ano_fabricacao: 2027 }))).toContain("ano_modelo");
    expect(campos(repasseDeTeste({ ano_modelo: 2062, ano_fabricacao: null }))).toContain("ano_modelo");
  });

  it("o piso é o do banco", () => {
    expect(campos(repasseDeTeste({ ano_modelo: PISO_DO_ANO_NO_BANCO, ano_fabricacao: null }))).not.toContain("ano_modelo");
    expect(campos(repasseDeTeste({ ano_modelo: PISO_DO_ANO_NO_BANCO - 1, ano_fabricacao: null }))).toContain("ano_modelo");
  });

  it("a fabricação vem no ano do modelo ou antes", () => {
    expect(campos(repasseDeTeste({ ano_modelo: 2021, ano_fabricacao: 2021 }))).not.toContain("ano_fabricacao");
    expect(campos(repasseDeTeste({ ano_modelo: 2021, ano_fabricacao: 2020 }))).not.toContain("ano_fabricacao");
    expect(campos(repasseDeTeste({ ano_modelo: 2020, ano_fabricacao: 2021 }))).toContain("ano_fabricacao");
    expect(campos(repasseDeTeste({ ano_fabricacao: null }))).not.toContain("ano_fabricacao");
  });
});

describe("texto invisível não é texto (M8)", () => {
  it("espaço de largura zero não preenche marca, resumo nem apontamento", () => {
    expect(campos(repasseDeTeste({ marca: "\u200B" }))).toContain("marca");
    expect(campos(repasseDeTeste({ resumo: "\u200B \u2060" }))).toContain("resumo");
    expect(
      campos(repasseDeTeste({ laudo: "aprovado_com_apontamento", laudo_apontamento: "\uFEFF" })),
    ).toContain("laudo_apontamento");
  });
});

describe("as fotos (M9)", () => {
  it("o carro de teste passa inteiro", () => {
    expect(checklistDoRepasse(repasseDeTeste(), HOJE)).toEqual([]);
  });

  it("URL vazia não conta para o mínimo", () => {
    const web = [fotoDeTeste("l1"), fotoDeTeste("l2"), fotoDeTeste("l3"), ""];
    expect(campos(repasseDeTeste({ web_full_images: web }))).toContain("web_full_images");
  });

  it("cada foto tem as duas versões", () => {
    const r = repasseDeTeste();
    expect(campos({ ...r, whatsapp_images: r.whatsapp_images.slice(0, 3) })).toContain("whatsapp_images");
  });

  it("foto de fora do bucket não vale", () => {
    const r = repasseDeTeste();
    const web = [...r.web_full_images.slice(0, 3), "https://carro57.com.br/f.jpg"];
    expect(campos({ ...r, web_full_images: web })).toContain("web_full_images");
  });

  it("a foto do defeito precisa ser nossa", () => {
    const r = repasseDeTeste();
    const itens = r.itens_de_estado.map((item, i) => (i === 0 ? { ...item, foto: "https://imgur.com/x.jpg" } : item));
    expect(checklistDoRepasse({ ...r, itens_de_estado: itens }, HOJE)).toContainEqual({
      campo: "itens_de_estado[0].foto",
      mensagem: "A foto do defeito precisa ser enviada pelo painel.",
    });
  });
});
```

Em `tests/migracao-do-repasse.test.ts`, acrescentar `PISO_DO_ANO_NO_BANCO` ao import de `../src/lib/repasse` e, dentro do `describe("migração do repasse", …)`, este `it`:

```ts
  it("o piso do ano no código é o do check do banco", () => {
    expect(sql).toContain(`check (ano_modelo between ${PISO_DO_ANO_NO_BANCO} and 2100)`);
    expect(sql).toContain(`ano_fabricacao between ${PISO_DO_ANO_NO_BANCO} and 2100`);
  });
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `npx vitest run tests/checklist-do-repasse-painel.test.ts`
Expected: FAIL — `anoDoVeiculo` já existe (Step 1), mas o checklist ainda aceita 2062, "\u200B", URL vazia e foto de fora; e "O carro de teste passa inteiro" falha só se o Step 3 não tiver sido feito.

- [ ] **Step 6: Implementar no checklist**

Em `src/lib/checklistDoRepasse.ts`:

1. Imports (trocar a linha `import type { Repasse } from "./repasse";`):
   ```ts
   import { anoMaximo } from "./anoDoVeiculo";
   import { MINIMO_DE_FOTOS } from "./coerenciaDoCadastro";
   import { ehFotoPropria } from "./fotosDoVeiculo";
   import { PISO_DO_ANO_NO_BANCO, type Repasse } from "./repasse";
   ```
   (o import de `MINIMO_DE_FOTOS` já existe; não duplicar.)

2. Trocar `const vazio = …` por:
   ```ts
   /**
    * Vazio é também o que só tem espaço invisível: `trim()` não tira o espaço
    * de largura zero (U+200B), e um "​" colado no resumo passava por texto (M8).
    */
   const INVISIVEIS = /[\s\u200B-\u200D\u2060\uFEFF]/g;
   const vazio = (v: string | null | undefined) => !v || v.replace(INVISIVEIS, "") === "";
   ```

3. Assinatura: `export function checklistDoRepasse(r: Repasse, hoje: Date = new Date()): FaltaDoChecklist[] {`

4. Trocar o bloco das fotos (`if (r.web_full_images.length < MINIMO_DE_FOTOS) { … }`) por:
   ```ts
   // Fotos (M9): URL vazia não conta, cada foto tem as duas versões, e só vale
   // foto do nosso bucket — é ela que a ficha pública serve sem otimizador.
   const web = r.web_full_images.filter((u) => !vazio(u));
   const zap = r.whatsapp_images.filter((u) => !vazio(u));
   if (web.length < MINIMO_DE_FOTOS) {
     falta("web_full_images", `Faltam fotos: o mínimo é ${MINIMO_DE_FOTOS}.`);
   } else if (zap.length !== web.length) {
     falta("whatsapp_images", "Cada foto tem duas versões e uma delas faltou. Envie a foto de novo.");
   }
   if ([...web, ...zap].some((u) => !ehFotoPropria(u))) {
     falta("web_full_images", "Há foto de fora do nosso armazenamento. Envie as fotos pelo painel.");
   }
   ```

5. Trocar o bloco do ano (`if (!(Number.isInteger(r.ano_modelo) && r.ano_modelo >= 1950 && r.ano_modelo <= 2100)) { … }`) por:
   ```ts
   // O teto é a régua da casa (`anoMaximo`); o piso é o do check do banco,
   // que é mais alto que o `ANO_MINIMO` da casa (M2).
   const teto = anoMaximo(hoje);
   if (!(Number.isInteger(r.ano_modelo) && r.ano_modelo >= PISO_DO_ANO_NO_BANCO && r.ano_modelo <= teto)) {
     falta("ano_modelo", `Ano do modelo entre ${PISO_DO_ANO_NO_BANCO} e ${teto}.`);
   }
   if (r.ano_fabricacao !== null) {
     if (!(Number.isInteger(r.ano_fabricacao) && r.ano_fabricacao >= PISO_DO_ANO_NO_BANCO && r.ano_fabricacao <= teto)) {
       falta("ano_fabricacao", `Ano de fabricação entre ${PISO_DO_ANO_NO_BANCO} e ${teto}.`);
     } else if (r.ano_fabricacao > r.ano_modelo) {
       // Regra da casa (`cadastroDeVeiculo.ts`): fabricado no ano do modelo ou antes.
       falta("ano_fabricacao", "O ano de fabricação não pode ser depois do ano do modelo.");
     }
   }
   ```

6. No laço dos itens, trocar a linha da foto por:
   ```ts
   if (vazio(item.foto)) falta(`itens_de_estado[${i}].foto`, "Todo defeito tem foto.");
   else if (!ehFotoPropria(item.foto)) {
     falta(`itens_de_estado[${i}].foto`, "A foto do defeito precisa ser enviada pelo painel.");
   }
   ```

- [ ] **Step 7: Rodar os três arquivos do checklist**

Run: `npx vitest run tests/checklist-do-repasse-painel.test.ts tests/checklist-do-repasse.test.ts tests/migracao-do-repasse.test.ts tests/cadastro-nativo.test.ts`
Expected: PASS. Se `tests/checklist-do-repasse.test.ts` reprovar, é por uma de duas causas, e só essas se corrigem no teste antigo: (a) a mensagem do ano mudou de "Informe o ano do modelo." para "Ano do modelo entre 1950 e N."; (b) algum caso montou `web_full_images`/`whatsapp_images` à mão com strings que não são do bucket — trocar por `fotoDeTeste(...)`. Qualquer outra reprovação é defeito do código novo.

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez, rodar `npx vitest run tests/checklist-do-repasse-painel.test.ts`, ver reprovar, desfazer:
1. Em `checklistDoRepasse.ts`, trocar `INVISIVEIS` por `/\s/g` → "texto invisível" reprova.
2. Tirar o `.filter((u) => !vazio(u))` de `web` → "URL vazia não conta" reprova.
3. Em `repasse.ts`, `PISO_DO_ANO_NO_BANCO = 1949` → o `it` novo de `tests/migracao-do-repasse.test.ts` reprova.

Anotar no relatório as três reprovações vistas.

- [ ] **Step 9: Commit**

```bash
git add src/lib/anoDoVeiculo.ts src/lib/cadastroDeVeiculo.ts src/lib/repasse.ts src/lib/checklistDoRepasse.ts tests/repasseDeTeste.ts tests/migracao-do-repasse.test.ts tests/checklist-do-repasse-painel.test.ts tests/checklist-do-repasse.test.ts
git commit -m "feat(repasse): checklist com a régua de ano da casa, texto invisível e fotos do bucket (M2, M8, M9)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migração — a escrita passa pela rota (I4) — Opus

**Files:**
- Create: `supabase/migrations/20260924200000_repasse_escrita_pela_rota.sql`
- Test: `tests/migracao-do-repasse-escrita.test.ts` (novo)

**Interfaces:**
- Consumes: tabelas, policies e enums de `20260924180000_repasse_fundacao.sql`; `public.tem_papel(uuid, text)`; `PERFIS` e `podeFazer` de `src/lib/permissoes.ts`.
- Produces: `authenticated` só com SELECT nas três tabelas; policies `inscrito_validador_le` e `aviso_validador_le`; constraints `repasse_arquivado_tem_data`, `repasse_reservado_tem_data`, `repasse_completo_fora_do_rascunho`. As rotas das Tasks 6 e 7 dependem disso para ser a única porta de escrita.

- [ ] **Step 1: Escrever o teste que falha**

`tests/migracao-do-repasse-escrita.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PERFIS, podeFazer } from "../src/lib/permissoes";

/**
 * A segunda migração do repasse (decisão I4 da revisão final do PR 1): a
 * equipe deixa de escrever direto pelo PostgREST, e a lista do repasse passa
 * a ser lida só por quem valida. O ensaio no banco prova o comportamento; este
 * arquivo prova que o texto da migração concorda com o código.
 */
const ARQUIVO = join(__dirname, "..", "supabase", "migrations", "20260924200000_repasse_escrita_pela_rota.sql");
const sql = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8").replace(/--[^\n]*/g, "") : "";

const TABELAS = ["repasses", "repasse_inscritos", "repasse_avisos"];

describe("migração: a escrita passa pela rota", () => {
  it("o arquivo existe", () => {
    expect(existsSync(ARQUIVO)).toBe(true);
  });

  it("nenhuma policy de escrita nasce aqui", () => {
    expect(sql).not.toMatch(/create\s+policy[^;]*\bfor\s+(insert|update|delete|all)\b/i);
  });

  it("derruba as seis policies de escrita da equipe", () => {
    for (const nome of [
      "repasse_staff_insere",
      "repasse_staff_atualiza",
      "inscrito_staff_atualiza",
      "inscrito_staff_apaga",
      "aviso_staff_insere",
      "aviso_staff_apaga",
    ]) {
      expect(sql).toMatch(new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${nome}\\b`, "i"));
    }
  });

  it("authenticated perde tudo e recebe de volta só a leitura, nas três tabelas", () => {
    for (const tabela of TABELAS) {
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+public\\.${tabela}\\s+from\\s+authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant\\s+select\\s+on\\s+public\\.${tabela}\\s+to\\s+authenticated`, "i"));
    }
  });

  it("a lista é lida por quem valida — os mesmos papéis da matriz", () => {
    const validadores = PERFIS.filter((p) => podeFazer(p, "Validar e publicar repasse") === "faz");
    for (const policy of ["inscrito_validador_le", "aviso_validador_le"]) {
      const trecho = sql.match(new RegExp(`create\\s+policy\\s+${policy}[^;]*;`, "i"));
      expect(trecho, `não achei a policy ${policy}`).not.toBeNull();
      expect(trecho![0]).toMatch(/for\s+select\s+to\s+authenticated/i);
      const papeis = [...trecho![0].matchAll(/tem_papel\(auth\.uid\(\),\s*'([a-z]+)'\)/g)].map((m) => m[1]);
      expect(new Set(papeis)).toEqual(new Set(validadores));
    }
  });

  it("o reforço fora do rascunho cita cada campo do mínimo", () => {
    const trecho = sql.match(/add\s+constraint\s+repasse_completo_fora_do_rascunho[\s\S]*?\n\);/i);
    expect(trecho, "não achei repasse_completo_fora_do_rascunho").not.toBeNull();
    for (const coluna of [
      "laudo",
      "leilao_consta",
      "sinistro_consta",
      "historico_consultado_em",
      "fipe_valor",
      "fipe_mes_referencia",
      "carroceria",
      "resumo",
      "motivo",
      "leilao_detalhe",
      "sinistro_detalhe",
      "sem_defeitos_conhecidos",
      "oficina_do_orcamento",
      "orcamento_em",
    ]) {
      expect(trecho![0]).toContain(coluna);
    }
    expect(trecho![0]).toMatch(/situacao\s+in\s+\('rascunho',\s*'arquivado'\)/);
  });

  it("arquivado e reservado têm data", () => {
    expect(sql).toMatch(/repasse_arquivado_tem_data\s+check\s*\(\s*situacao\s*<>\s*'arquivado'\s+or\s+arquivado_em\s+is\s+not\s+null\s*\)/i);
    expect(sql).toMatch(/repasse_reservado_tem_data\s+check\s*\(\s*situacao\s*<>\s*'reservado'\s+or\s+reservado_em\s+is\s+not\s+null\s*\)/i);
  });

  it("tem aceite e se registra no livro-razão", () => {
    expect(sql).toContain("ACEITE FALHOU");
    expect(sql).toMatch(/values\s*\('20260924200000',\s*'repasse_escrita_pela_rota'\)/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/migracao-do-repasse-escrita.test.ts`
Expected: FAIL em "o arquivo existe" (e nos demais).

- [ ] **Step 3: Escrever a migração**

`supabase/migrations/20260924200000_repasse_escrita_pela_rota.sql`:

```sql
-- ============================================================================
-- Repasse Motors — a escrita passa pela rota
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md, §4 e §5.
--
-- Decisão I4 da revisão final do PR 1. Com as policies de 20260924180000,
-- qualquer pessoa da equipe publicava um carro direto pelo PostgREST, sem
-- validador e sem checklist. A régua de quem valida (Administrador, Gestor e
-- Comercial) e o checklist vivem em código testado
-- (src/lib/transicoesDoRepasse.ts e src/lib/edicaoDoRepasse.ts): a rota do
-- painel roda o portão e grava com a chave de serviço. Aqui:
--
--   1. `authenticated` perde a escrita nas três tabelas e as policies de
--      escrita da equipe saem. A leitura da equipe fica.
--   2. A lista do repasse (inscritos e avisos) passa a ser lida só por quem
--      valida: é WhatsApp e CNPJ, e Marketing e Financeiro não avisam
--      ninguém (matriz A17, linha "Validar e publicar repasse").
--   3. Reforços no banco: arquivado e reservado têm data; fora do rascunho e
--      do arquivo, o carro tem o mínimo (laudo, histórico, FIPE, carroceria,
--      textos) e o "obrigatório quando" (detalhe de leilão e sinistro,
--      oficina e data do orçamento). O checklist do código continua sendo a
--      régua inteira — fotos e termos proibidos ficam só lá.
--
-- A tabela está vazia em produção (o PR 1 não tem tela), então os CHECKs
-- entram validados.
-- ============================================================================

drop policy if exists repasse_staff_insere on public.repasses;
drop policy if exists repasse_staff_atualiza on public.repasses;
drop policy if exists inscrito_staff_atualiza on public.repasse_inscritos;
drop policy if exists inscrito_staff_apaga on public.repasse_inscritos;
drop policy if exists aviso_staff_insere on public.repasse_avisos;
drop policy if exists aviso_staff_apaga on public.repasse_avisos;

-- O Supabase concede tudo a authenticated em tabela nova. Tirar tudo e
-- devolver só a leitura deixa o arquivo dizer o estado final, sem depender
-- de quais privilégios o default ACL deu.
revoke all on public.repasses from authenticated;
revoke all on public.repasse_inscritos from authenticated;
revoke all on public.repasse_avisos from authenticated;
grant select on public.repasses to authenticated;
grant select on public.repasse_inscritos to authenticated;
grant select on public.repasse_avisos to authenticated;

drop policy if exists inscrito_staff_le on public.repasse_inscritos;
drop policy if exists inscrito_validador_le on public.repasse_inscritos;
create policy inscrito_validador_le on public.repasse_inscritos for select to authenticated
  using (
    (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'gestor') or public.tem_papel(auth.uid(), 'comercial'))
    and org_id = public.org_padrao()
  );

drop policy if exists aviso_staff_le on public.repasse_avisos;
drop policy if exists aviso_validador_le on public.repasse_avisos;
create policy aviso_validador_le on public.repasse_avisos for select to authenticated
  using (
    (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'gestor') or public.tem_papel(auth.uid(), 'comercial'))
    and org_id = public.org_padrao()
  );

alter table public.repasses drop constraint if exists repasse_arquivado_tem_data;
alter table public.repasses add constraint repasse_arquivado_tem_data
  check (situacao <> 'arquivado' or arquivado_em is not null);

alter table public.repasses drop constraint if exists repasse_reservado_tem_data;
alter table public.repasses add constraint repasse_reservado_tem_data
  check (situacao <> 'reservado' or reservado_em is not null);

alter table public.repasses drop constraint if exists repasse_completo_fora_do_rascunho;
alter table public.repasses add constraint repasse_completo_fora_do_rascunho check (
  situacao in ('rascunho', 'arquivado') or (
    laudo is not null
    and leilao_consta is not null
    and sinistro_consta is not null
    and historico_consultado_em is not null
    and fipe_valor is not null
    and nullif(trim(fipe_mes_referencia), '') is not null
    and carroceria is not null
    and nullif(trim(resumo), '') is not null
    and nullif(trim(motivo), '') is not null
    and (leilao_consta is false or nullif(trim(leilao_detalhe), '') is not null)
    and (sinistro_consta is false or nullif(trim(sinistro_detalhe), '') is not null)
    and (sem_defeitos_conhecidos or jsonb_array_length(itens_de_estado) > 0)
    and (
      not jsonb_path_exists(itens_de_estado, '$[*] ? (@.orcamento > 0)')
      or (nullif(trim(oficina_do_orcamento), '') is not null and orcamento_em is not null)
    )
  )
);

-- ----------------------------------------------------------------------------
-- Autoconferência: privilégios, policies, e cada violação recusada PELA
-- RESTRIÇÃO CERTA (uma linha incompleta em outro campo passaria por engano).
-- ----------------------------------------------------------------------------
do $$
declare
  falhas     int := 0;
  restricao  text;
  completo   uuid;
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if exists (
      select 1
      from unnest(array['public.repasses', 'public.repasse_inscritos', 'public.repasse_avisos']) as t(tabela)
      where has_any_column_privilege('authenticated', t.tabela, 'INSERT')
         or has_any_column_privilege('authenticated', t.tabela, 'UPDATE')
         or has_table_privilege('authenticated', t.tabela, 'DELETE')
         or has_table_privilege('authenticated', t.tabela, 'TRUNCATE')
    ) then
      raise exception 'ACEITE FALHOU: authenticated ainda escreve numa tabela do repasse';
    end if;
  else
    raise notice 'Papel authenticated inexistente (banco fora do Supabase): conferência de privilégio pulada.';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('repasses', 'repasse_inscritos', 'repasse_avisos')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'ACEITE FALHOU: sobrou policy de escrita numa tabela do repasse';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('repasse_inscritos', 'repasse_avisos')
      and cmd = 'SELECT'
      and qual not like '%tem_papel%'
  ) then
    raise exception 'ACEITE FALHOU: a lista do repasse ainda é lida por quem não valida';
  end if;

  -- 1. arquivado sem data
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao)
    values ('aceite-arquivado', 'T', 'T', 2020, 1, 1, 'arquivado');
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_arquivado_tem_data' then
      falhas := falhas + 1;
      raise notice 'arquivado: esperava repasse_arquivado_tem_data, veio %', restricao;
    end if;
  end;

  -- 2. reservado sem data (completo em todo o resto)
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao, lojistas_desde,
      laudo, leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
      carroceria, resumo, motivo, sem_defeitos_conhecidos)
    values ('aceite-reservado', 'T', 'T', 2020, 1, 1, 'reservado', now(),
      'nao_feito', false, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo', true);
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_reservado_tem_data' then
      falhas := falhas + 1;
      raise notice 'reservado: esperava repasse_reservado_tem_data, veio %', restricao;
    end if;
  end;

  -- 3. em validação sem laudo (completo em todo o resto)
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao,
      leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
      carroceria, resumo, motivo, sem_defeitos_conhecidos)
    values ('aceite-sem-laudo', 'T', 'T', 2020, 1, 1, 'em_validacao',
      false, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo', true);
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_completo_fora_do_rascunho' then
      falhas := falhas + 1;
      raise notice 'sem laudo: esperava repasse_completo_fora_do_rascunho, veio %', restricao;
    end if;
  end;

  -- 4. leilão consta sem o detalhe
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao,
      laudo, leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
      carroceria, resumo, motivo, sem_defeitos_conhecidos)
    values ('aceite-leilao', 'T', 'T', 2020, 1, 1, 'em_validacao',
      'nao_feito', true, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo', true);
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_completo_fora_do_rascunho' then
      falhas := falhas + 1;
      raise notice 'leilão: esperava repasse_completo_fora_do_rascunho, veio %', restricao;
    end if;
  end;

  -- 5. orçamento sem oficina
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao,
      laudo, leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
      carroceria, resumo, motivo, itens_de_estado)
    values ('aceite-orcamento', 'T', 'T', 2020, 1, 1, 'em_validacao',
      'nao_feito', false, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo',
      '[{"descricao":"Embreagem","local":"Câmbio","foto":null,"orcamento":1400,"estetico":false}]'::jsonb);
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_completo_fora_do_rascunho' then
      falhas := falhas + 1;
      raise notice 'orçamento: esperava repasse_completo_fora_do_rascunho, veio %', restricao;
    end if;
  end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram ou foram barradas pela restrição errada', falhas;
  end if;

  -- Controle positivo: o carro completo entra em validação.
  insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao,
    laudo, leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
    carroceria, resumo, motivo, sem_defeitos_conhecidos)
  values ('aceite-completo', 'T', 'T', 2020, 1, 1, 'em_validacao',
    'nao_feito', false, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo', true)
  returning id into completo;
  delete from public.repasses where id = completo;

  raise notice 'Repasse (escrita) OK: authenticated sem escrita, lista só para quem valida, 5 violações recusadas pela restrição certa.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260924200000', 'repasse_escrita_pela_rota')
  on conflict (version) do nothing;
```

- [ ] **Step 4: Rodar o teste**

Run: `npx vitest run tests/migracao-do-repasse-escrita.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (antes do ensaio, para o controlador rodar o arquivo versionado)**

```bash
git add supabase/migrations/20260924200000_repasse_escrita_pela_rota.sql tests/migracao-do-repasse-escrita.test.ts
git commit -m "feat(repasse): migração que tira a escrita de authenticated e fecha a lista para quem valida (I4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ensaio (roda o CONTROLADOR, não o subagente)**

```powershell
cd C:\Users\Lenovo\Documents\motors-claude\motors-site-oficial
node supabase/manutencao/aplicar-migracao.js ..\wt-repasse-painel\supabase\migrations\20260924200000_repasse_escrita_pela_rota.sql
```

Expected: `NOTICE … Repasse (escrita) OK: authenticated sem escrita, lista só para quem valida, 5 violações recusadas pela restrição certa.` seguido de `Ensaio OK (revertido): 20260924200000_repasse_escrita_pela_rota.sql`. Se sair `FALHOU (revertida)`, ler o `ACEITE FALHOU` e os `NOTICE` de restrição, corrigir, repetir. **Não rodar com `--gravar`.**

- [ ] **Step 7: Provar que o aceite reprova com o bug real (controlador)**

Duas sabotagens, cada uma numa cópia temporária:

```powershell
Copy-Item ..\wt-repasse-painel\supabase\migrations\20260924200000_repasse_escrita_pela_rota.sql $env:TEMP\sabotagem_escrita.sql
# S1: apagar a linha "revoke all on public.repasses from authenticated;"
node supabase/manutencao/aplicar-migracao.js $env:TEMP\sabotagem_escrita.sql
```
Expected: `ACEITE FALHOU: authenticated ainda escreve numa tabela do repasse` e `FALHOU (revertida)`.

```powershell
Copy-Item ..\wt-repasse-painel\supabase\migrations\20260924200000_repasse_escrita_pela_rota.sql $env:TEMP\sabotagem_escrita.sql
# S2: trocar "situacao in ('rascunho', 'arquivado') or (" por "situacao in ('rascunho', 'arquivado', 'em_validacao') or ("
node supabase/manutencao/aplicar-migracao.js $env:TEMP\sabotagem_escrita.sql
```
Expected: `ACEITE FALHOU: 3 violação(ões) passaram…` e `FALHOU (revertida)`. Apagar a cópia. O arquivo versionado não muda. Anotar as duas saídas no ledger.

---

### Task 3: O que o painel grava — `edicaoDoRepasse.ts` — Opus

**Files:**
- Create: `src/lib/edicaoDoRepasse.ts`
- Test: `tests/edicao-do-repasse.test.ts`

**Interfaces:**
- Consumes: `anoMaximo` (Task 1), `checklistDoRepasse(r, hoje)` (Task 1), `ehFotoPropria`, `podeFazer`/`Perfil`, `CARROCERIAS_DO_REPASSE`, `LAUDOS_DO_REPASSE`, `PISO_DO_ANO_NO_BANCO`, `slugDoRepasse`, `ItemDeEstado`, `Repasse`.
- Produces (usados pelas Tasks 4 a 11):
  - `CAMPOS_EDITAVEIS_DO_REPASSE` (readonly tuple), `type CampoEditavelDoRepasse`, `type FormularioDoRepasse = Pick<Repasse, CampoEditavelDoRepasse>`.
  - `interface RecusaDoPainel { ok: false; status: 400 | 403 | 404 | 409 | 422; erro: string; problemas?: string[] }`.
  - `cadastraRepasse(perfis: Perfil[]): boolean`, `validaRepasse(perfis: Perfil[]): boolean`, `podeEditarORepasse(r: Pick<Repasse, "situacao">, perfis: Perfil[]): boolean`.
  - `normalizarCampos(corpo: Record<string, unknown>, agora: Date): { colunas: Partial<FormularioDoRepasse>; problemas: string[] }`.
  - `type LinhaNovaDoRepasse`; `decidirCriacao(args: { corpo: unknown; perfis: Perfil[]; id: string; autorId: string; agora: Date }): { ok: true; linha: LinhaNovaDoRepasse } | RecusaDoPainel`.
  - `decidirEdicao(args: { repasse: Repasse; corpo: unknown; perfis: Perfil[]; agora: Date }): { ok: true; colunas: Partial<FormularioDoRepasse> & { slug?: string } } | RecusaDoPainel`.
  - `formularioDe(r: Repasse): FormularioDoRepasse`; `alteracoes(atual: FormularioDoRepasse, salvo: FormularioDoRepasse): Partial<FormularioDoRepasse>`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/edicao-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  alteracoes,
  decidirCriacao,
  decidirEdicao,
  formularioDe,
  podeEditarORepasse,
} from "../src/lib/edicaoDoRepasse";
import type { Perfil } from "../src/lib/permissoes";
import { fotoDeTeste, repasseDeTeste } from "./repasseDeTeste";

const AGORA = new Date("2026-09-24T12:00:00Z");
const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const MINIMO = { marca: "Renault", modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021, quilometragem: 71200, preco: 36900 };

const criar = (corpo: unknown, perfis: Perfil[] = ["marketing"]) =>
  decidirCriacao({ corpo, perfis, id: ID, autorId: "u-1", agora: AGORA });
const editar = (corpo: unknown, perfis: Perfil[], parcial: Parameters<typeof repasseDeTeste>[0] = {}) =>
  decidirEdicao({ repasse: repasseDeTeste(parcial), corpo, perfis, agora: AGORA });

describe("criar o rascunho", () => {
  it("qualquer perfil da equipe cria, e a linha nasce rascunho, com dono e slug", () => {
    const d = criar(MINIMO, ["financeiro"]);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.linha).toMatchObject({ id: ID, situacao: "rascunho", criado_por: "u-1", preco: 36900 });
    expect(d.linha.slug).toBe("renault-kwid-zen-1-0-2021-3f9a1c");
  });

  it("sem perfil de painel, não cria", () => {
    expect(criar(MINIMO, [])).toMatchObject({ ok: false, status: 403 });
  });

  it("os cinco obrigatórios do banco", () => {
    const semPreco: Partial<typeof MINIMO> = { ...MINIMO };
    delete semPreco.preco;
    expect(criar(semPreco)).toMatchObject({ ok: false, status: 400, erro: "Informe o preço à vista." });
  });

  it("ano fora da régua não entra", () => {
    expect(criar({ ...MINIMO, ano_modelo: 2062 })).toMatchObject({ ok: false, status: 400, erro: "Ano do modelo entre 1950 e 2027." });
  });

  it("a situação não entra pela criação", () => {
    expect(criar({ ...MINIMO, situacao: "publicado" })).toMatchObject({
      ok: false,
      status: 400,
      erro: "O painel não grava o campo situacao.",
    });
  });
});

describe("quem edita o quê", () => {
  it("rascunho é de quem cadastra; em validação, publicado e reservado, de quem valida", () => {
    expect(podeEditarORepasse({ situacao: "rascunho" }, ["marketing"])).toBe(true);
    expect(podeEditarORepasse({ situacao: "em_validacao" }, ["marketing"])).toBe(false);
    expect(podeEditarORepasse({ situacao: "publicado" }, ["comercial"])).toBe(true);
    expect(podeEditarORepasse({ situacao: "reservado" }, ["gestor"])).toBe(true);
    expect(podeEditarORepasse({ situacao: "vendido" }, ["admin"])).toBe(false);
    expect(podeEditarORepasse({ situacao: "arquivado" }, ["admin"])).toBe(false);
  });

  it("marketing edita o rascunho", () => {
    expect(editar({ preco: 35000 }, ["marketing"])).toEqual({ ok: true, colunas: { preco: 35000 } });
  });

  it("marketing não edita o carro em validação", () => {
    const d = editar({ preco: 35000 }, ["marketing"], { situacao: "em_validacao" });
    expect(d).toMatchObject({ ok: false, status: 403 });
    if (!d.ok) expect(d.erro).toContain("Peça a um validador");
  });

  it("vendido e arquivado não se editam", () => {
    expect(editar({ preco: 35000 }, ["admin"], { situacao: "vendido", lojistas_desde: "x", vendido_em: "x" })).toMatchObject({ ok: false, status: 409 });
    expect(editar({ preco: 35000 }, ["admin"], { situacao: "arquivado", arquivado_em: "x" })).toMatchObject({ ok: false, status: 409 });
  });

  it("fora do rascunho, a edição não pode deixar o carro incompleto", () => {
    const d = editar({ resumo: "" }, ["comercial"], { situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" });
    expect(d).toMatchObject({ ok: false, status: 422 });
    if (!d.ok) expect(d.problemas).toContain("Escreva a linha do card.");
  });

  it("fora do rascunho, uma edição completa passa", () => {
    const d = editar({ resumo: "Embreagem patinando; o resto em ordem." }, ["comercial"], {
      situacao: "publicado",
      lojistas_desde: "2026-09-24T12:00:00Z",
    });
    expect(d).toEqual({ ok: true, colunas: { resumo: "Embreagem patinando; o resto em ordem." } });
  });
});

describe("o slug", () => {
  it("muda com a identidade no rascunho", () => {
    const d = editar({ modelo: "Kwid Outsider" }, ["marketing"]);
    expect(d.ok && d.colunas.slug).toBe("renault-kwid-outsider-zen-1-0-2021-3f9a1c");
  });

  it("não muda com o preço", () => {
    const d = editar({ preco: 35000 }, ["marketing"]);
    expect(d.ok && "slug" in d.colunas).toBe(false);
  });

  it("não muda fora do rascunho: a URL publicada fica estável", () => {
    const d = editar({ versao: "Zen 1.0 SCe" }, ["comercial"], { situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" });
    expect(d.ok && "slug" in d.colunas).toBe(false);
  });
});

describe("a lista fechada de campos", () => {
  for (const campo of [
    "situacao",
    "lojistas_desde",
    "aberto_ao_publico_em",
    "reservado_em",
    "vendido_em",
    "arquivado_em",
    "validado_por",
    "validado_em",
    "criado_por",
    "enviado_em",
    "devolvido_com",
    "slug",
    "id",
    "org_id",
    "created_at",
  ]) {
    it(`recusa ${campo}`, () => {
      expect(editar({ [campo]: "x" }, ["admin"])).toMatchObject({ ok: false, status: 400, erro: `O painel não grava o campo ${campo}.` });
    });
  }

  it("descarta url_imagem, que a galeria do estoque manda junto", () => {
    const web = ["a", "b", "c", "d"].map((l) => fotoDeTeste(l));
    const zap = ["a", "b", "c", "d"].map((l) => fotoDeTeste(l, "zap"));
    const d = editar({ web_full_images: web, whatsapp_images: zap, url_imagem: zap[0] }, ["marketing"]);
    expect(d).toEqual({ ok: true, colunas: { web_full_images: web, whatsapp_images: zap } });
  });
});

describe("normalização", () => {
  it("fotos vão em par", () => {
    const d = editar({ web_full_images: [fotoDeTeste("a")] }, ["marketing"]);
    expect(d).toMatchObject({ ok: false, status: 400, erro: "As fotos vão em par: as duas listas juntas." });
  });

  it("foto de fora do bucket não entra", () => {
    const d = editar({ web_full_images: ["https://carro57.com.br/1.jpg"], whatsapp_images: [fotoDeTeste("a", "zap")] }, ["marketing"]);
    expect(d).toMatchObject({ ok: false, status: 400 });
  });

  it("item sem descrição não se salva", () => {
    const d = editar({ itens_de_estado: [{ descricao: "\u200B", local: "", foto: null, orcamento: null, estetico: false }] }, ["marketing"]);
    expect(d).toMatchObject({ ok: false, status: 400, erro: "Linha 1 da ficha: descreva o defeito antes de salvar." });
  });

  it("foto de defeito de fora do bucket não entra", () => {
    const d = editar(
      { itens_de_estado: [{ descricao: "Risco", local: "Porta", foto: "https://imgur.com/x.jpg", orcamento: null, estetico: true }] },
      ["marketing"],
    );
    expect(d).toMatchObject({ ok: false, status: 400, erro: "Linha 1 da ficha: a foto precisa ser enviada pelo painel." });
  });

  it("marca só com espaço invisível é vazia", () => {
    expect(editar({ marca: "\u200B " }, ["marketing"])).toMatchObject({ ok: false, status: 400, erro: "Informe a marca." });
  });

  it("texto opcional vazio vira null", () => {
    expect(editar({ versao: "  " }, ["marketing"])).toEqual({ ok: true, colunas: { versao: null, slug: "renault-kwid-2021-3f9a1c" } });
  });

  it("data que não existe não entra", () => {
    expect(editar({ orcamento_em: "2026-02-31" }, ["marketing"])).toMatchObject({ ok: false, status: 400 });
    expect(editar({ orcamento_em: "2026-02-28" }, ["marketing"])).toEqual({ ok: true, colunas: { orcamento_em: "2026-02-28" } });
  });

  it("carroceria e laudo só da lista", () => {
    expect(editar({ carroceria: "conversivel" }, ["marketing"])).toMatchObject({ ok: false, status: 400 });
    expect(editar({ laudo: "reprovado" }, ["marketing"])).toMatchObject({ ok: false, status: 400 });
  });

  it("corpo que não é objeto", () => {
    expect(editar([1, 2], ["marketing"])).toMatchObject({ ok: false, status: 400, erro: "Corpo inválido." });
  });
});

describe("o formulário do editor", () => {
  it("alteracoes devolve só o que mudou, comparando por valor", () => {
    const salvo = formularioDe(repasseDeTeste());
    const itens = [...salvo.itens_de_estado, { descricao: "Farol", local: "Frente", foto: null, orcamento: null, estetico: true }];
    const atual = { ...salvo, preco: 35000, itens_de_estado: itens, web_full_images: [...salvo.web_full_images] };
    expect(alteracoes(atual, salvo)).toEqual({ preco: 35000, itens_de_estado: itens });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/edicao-do-repasse.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/edicaoDoRepasse'`.

- [ ] **Step 3: Implementar**

`src/lib/edicaoDoRepasse.ts`:

```ts
/**
 * O que o painel grava num carro de repasse, e quem grava (spec §5 e §6).
 *
 * Desde 20260924200000_repasse_escrita_pela_rota.sql, `authenticated` não
 * escreve nas tabelas do repasse: a rota do painel roda ESTE portão e só
 * então grava com a chave de serviço (decisão I4 da revisão do PR 1). Por
 * isso a lista de campos é FECHADA. Campo fora dela é recusado, e as colunas
 * do ciclo de vida (situação, datas, quem validou) só mudam por
 * `decidirTransicao` (transicoesDoRepasse.ts).
 *
 * Módulo puro: o editor usa `formularioDe` e `alteracoes` no navegador.
 */
import { anoMaximo } from "./anoDoVeiculo";
import { checklistDoRepasse } from "./checklistDoRepasse";
import { ehFotoPropria } from "./fotosDoVeiculo";
import { podeFazer, type Perfil } from "./permissoes";
import {
  CARROCERIAS_DO_REPASSE,
  LAUDOS_DO_REPASSE,
  PISO_DO_ANO_NO_BANCO,
  slugDoRepasse,
  type ItemDeEstado,
  type Repasse,
} from "./repasse";

export const CAMPOS_EDITAVEIS_DO_REPASSE = [
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
] as const;
export type CampoEditavelDoRepasse = (typeof CAMPOS_EDITAVEIS_DO_REPASSE)[number];
export type FormularioDoRepasse = Pick<Repasse, CampoEditavelDoRepasse>;

/** O que a galeria do estoque manda junto e o repasse não tem. */
const CAMPOS_DESCARTADOS: readonly string[] = ["url_imagem"];

/** As colunas `not null` sem default de `repasses`. */
export const OBRIGATORIOS_PARA_CRIAR = ["marca", "modelo", "ano_modelo", "quilometragem", "preco"] as const;
const MENSAGEM_DO_OBRIGATORIO: Record<(typeof OBRIGATORIOS_PARA_CRIAR)[number], string> = {
  marca: "Informe a marca.",
  modelo: "Informe o modelo.",
  ano_modelo: "Informe o ano do modelo.",
  quilometragem: "Informe a quilometragem.",
  preco: "Informe o preço à vista.",
};

export const LIMITE_DE_ITENS_DE_ESTADO = 30;
export const LIMITE_DE_FOTOS_DO_REPASSE = 40;
const CURTO = 120;
const LONGO = 2000;
const RESUMO = 140;
const DESCRICAO_DO_ITEM = 300;
const VALOR_MAXIMO = 99_999_999;

export interface RecusaDoPainel {
  ok: false;
  status: 400 | 403 | 404 | 409 | 422;
  erro: string;
  problemas?: string[];
}

export function cadastraRepasse(perfis: Perfil[]): boolean {
  return podeFazer(perfis, "Cadastrar carro de repasse") === "faz";
}

export function validaRepasse(perfis: Perfil[]): boolean {
  return podeFazer(perfis, "Validar e publicar repasse") === "faz";
}

/**
 * Rascunho é de quem cadastra; em validação, publicado e reservado, de quem
 * valida (spec §5: "quem não valida pede a um validador que devolva o carro
 * para rascunho"); vendido e arquivado, de ninguém.
 */
export function podeEditarORepasse(r: Pick<Repasse, "situacao">, perfis: Perfil[]): boolean {
  if (r.situacao === "rascunho") return cadastraRepasse(perfis);
  if (r.situacao === "em_validacao" || r.situacao === "publicado" || r.situacao === "reservado") {
    return validaRepasse(perfis);
  }
  return false;
}

const INVISIVEIS = /[\u200B-\u200D\u2060\uFEFF]/g;

/** Sem as bordas e sem o invisível; o que sobra vazio vira null. */
function limpo(v: string): string | null {
  const t = v.replace(INVISIVEIS, "").trim();
  return t === "" ? null : t;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type Normalizado = { ok: true; valor: unknown } | { ok: false; problema: string };
const aceita = (valor: unknown): Normalizado => ({ ok: true, valor });
const recusa = (problema: string): Normalizado => ({ ok: false, problema });

function textoOpcional(v: unknown, limite: number, nome: string): Normalizado {
  if (v === null) return aceita(null);
  if (typeof v !== "string") return recusa(`${nome}: texto inválido.`);
  const t = limpo(v);
  if (t !== null && t.length > limite) return recusa(`${nome}: até ${limite} caracteres.`);
  return aceita(t);
}

function textoObrigatorio(v: unknown, seVazio: string): Normalizado {
  if (typeof v !== "string") return recusa(seVazio);
  const t = limpo(v);
  if (t === null) return recusa(seVazio);
  if (t.length > CURTO) return recusa(`${seVazio.replace(/\.$/, "")}: até ${CURTO} caracteres.`);
  return aceita(t);
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataOpcional(v: unknown, nome: string): Normalizado {
  if (v === null) return aceita(null);
  if (typeof v !== "string" || !DATA.test(v)) return recusa(`${nome}: data inválida.`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return recusa(`${nome}: data inválida.`);
  return aceita(v);
}

function inteiroEntre(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function reaisPositivos(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= VALOR_MAXIMO ? v : null;
}

function itensDeEstado(v: unknown): Normalizado {
  if (!Array.isArray(v)) return recusa("A ficha de estado precisa ser uma lista.");
  if (v.length > LIMITE_DE_ITENS_DE_ESTADO) return recusa(`A ficha de estado tem até ${LIMITE_DE_ITENS_DE_ESTADO} itens.`);
  const itens: ItemDeEstado[] = [];
  for (let i = 0; i < v.length; i += 1) {
    const linha = `Linha ${i + 1} da ficha`;
    const bruto: unknown = v[i];
    if (!ehObjeto(bruto)) return recusa(`${linha}: formato inválido.`);
    const descricao = typeof bruto.descricao === "string" ? limpo(bruto.descricao) : null;
    if (!descricao) return recusa(`${linha}: descreva o defeito antes de salvar.`);
    if (descricao.length > DESCRICAO_DO_ITEM) return recusa(`${linha}: a descrição tem até ${DESCRICAO_DO_ITEM} caracteres.`);
    const local = typeof bruto.local === "string" ? (limpo(bruto.local) ?? "") : "";
    if (local.length > CURTO) return recusa(`${linha}: o local tem até ${CURTO} caracteres.`);
    const foto = typeof bruto.foto === "string" ? limpo(bruto.foto) : null;
    if (foto !== null && !ehFotoPropria(foto)) return recusa(`${linha}: a foto precisa ser enviada pelo painel.`);
    let orcamento: number | null = null;
    if (bruto.orcamento !== null && bruto.orcamento !== undefined) {
      orcamento = reaisPositivos(bruto.orcamento);
      if (orcamento === null) return recusa(`${linha}: o orçamento é um valor em reais maior que zero.`);
    }
    itens.push({ descricao, local, foto, orcamento, estetico: bruto.estetico === true });
  }
  return aceita(itens);
}

function listaDeFotos(v: unknown): Normalizado {
  if (!Array.isArray(v) || v.some((u) => typeof u !== "string")) return recusa("Fotos: lista de endereços inválida.");
  const urls = (v as string[]).map((u) => u.trim()).filter((u) => u !== "");
  if (urls.length > LIMITE_DE_FOTOS_DO_REPASSE) return recusa(`Fotos: até ${LIMITE_DE_FOTOS_DO_REPASSE}.`);
  if (urls.some((u) => !ehFotoPropria(u))) return recusa("Há foto de fora do nosso armazenamento. Envie as fotos pelo painel.");
  return aceita(urls);
}

function daLista(v: unknown, lista: readonly string[], mensagem: string): Normalizado {
  return v === null || (typeof v === "string" && lista.includes(v)) ? aceita(v) : recusa(mensagem);
}

function normalizarCampo(campo: CampoEditavelDoRepasse, v: unknown, agora: Date): Normalizado {
  const teto = anoMaximo(agora);
  switch (campo) {
    case "marca":
      return textoObrigatorio(v, "Informe a marca.");
    case "modelo":
      return textoObrigatorio(v, "Informe o modelo.");
    case "versao":
      return textoOpcional(v, CURTO, "Versão");
    case "cambio":
      return textoOpcional(v, CURTO, "Câmbio");
    case "combustivel":
      return textoOpcional(v, CURTO, "Combustível");
    case "cor":
      return textoOpcional(v, CURTO, "Cor");
    case "fipe_codigo":
      return textoOpcional(v, CURTO, "Código FIPE");
    case "fipe_mes_referencia":
      return textoOpcional(v, CURTO, "Mês da FIPE");
    case "oficina_do_orcamento":
      return textoOpcional(v, CURTO, "Oficina do orçamento");
    case "laudo_apontamento":
      return textoOpcional(v, LONGO, "Apontamento do laudo");
    case "leilao_detalhe":
      return textoOpcional(v, LONGO, "Registro de leilão");
    case "sinistro_detalhe":
      return textoOpcional(v, LONGO, "Registro de sinistro");
    case "motivo":
      return textoOpcional(v, LONGO, "Por que está no repasse");
    case "resumo":
      return textoOpcional(v, RESUMO, "Linha do card");
    case "ano_modelo": {
      const n = inteiroEntre(v, PISO_DO_ANO_NO_BANCO, teto);
      return n === null ? recusa(`Ano do modelo entre ${PISO_DO_ANO_NO_BANCO} e ${teto}.`) : aceita(n);
    }
    case "ano_fabricacao": {
      if (v === null) return aceita(null);
      const n = inteiroEntre(v, PISO_DO_ANO_NO_BANCO, teto);
      return n === null ? recusa(`Ano de fabricação entre ${PISO_DO_ANO_NO_BANCO} e ${teto}.`) : aceita(n);
    }
    case "quilometragem": {
      const n = inteiroEntre(v, 0, 9_999_999);
      return n === null ? recusa("Quilometragem é um número inteiro, zero ou mais.") : aceita(n);
    }
    case "preco": {
      const n = reaisPositivos(v);
      return n === null ? recusa("O preço à vista é um valor em reais maior que zero.") : aceita(n);
    }
    case "fipe_valor": {
      if (v === null) return aceita(null);
      const n = reaisPositivos(v);
      return n === null ? recusa("O valor FIPE é um valor em reais maior que zero.") : aceita(n);
    }
    case "carroceria":
      return daLista(v, CARROCERIAS_DO_REPASSE, "Carroceria fora da lista.");
    case "laudo":
      return daLista(v, LAUDOS_DO_REPASSE, "Situação do laudo fora da lista.");
    case "leilao_consta":
    case "sinistro_consta":
      return v === null || typeof v === "boolean" ? aceita(v) : recusa("Responda sim ou não.");
    case "sem_defeitos_conhecidos":
      return typeof v === "boolean" ? aceita(v) : recusa("Responda sim ou não.");
    case "historico_consultado_em":
      return dataOpcional(v, "Data da consulta do histórico");
    case "orcamento_em":
      return dataOpcional(v, "Data do orçamento");
    case "itens_de_estado":
      return itensDeEstado(v);
    case "web_full_images":
    case "whatsapp_images":
      return listaDeFotos(v);
  }
}

export function normalizarCampos(
  corpo: Record<string, unknown>,
  agora: Date,
): { colunas: Partial<FormularioDoRepasse>; problemas: string[] } {
  const colunas: Record<string, unknown> = {};
  const problemas: string[] = [];
  for (const [chave, valor] of Object.entries(corpo)) {
    if (CAMPOS_DESCARTADOS.includes(chave)) continue;
    if (!(CAMPOS_EDITAVEIS_DO_REPASSE as readonly string[]).includes(chave)) {
      problemas.push(`O painel não grava o campo ${chave}.`);
      continue;
    }
    const r = normalizarCampo(chave as CampoEditavelDoRepasse, valor, agora);
    if (r.ok) colunas[chave] = r.valor;
    else problemas.push(r.problema);
  }
  const temWeb = "web_full_images" in colunas;
  const temZap = "whatsapp_images" in colunas;
  if (temWeb !== temZap) {
    problemas.push("As fotos vão em par: as duas listas juntas.");
  } else if (temWeb && (colunas.web_full_images as string[]).length !== (colunas.whatsapp_images as string[]).length) {
    problemas.push("Cada foto tem duas versões e uma delas faltou. Envie a foto de novo.");
  }
  return { colunas: colunas as Partial<FormularioDoRepasse>, problemas };
}

export type LinhaNovaDoRepasse = Partial<FormularioDoRepasse> & {
  id: string;
  slug: string;
  situacao: "rascunho";
  criado_por: string;
  marca: string;
  modelo: string;
  ano_modelo: number;
  quilometragem: number;
  preco: number;
};

export function decidirCriacao(args: {
  corpo: unknown;
  perfis: Perfil[];
  id: string;
  autorId: string;
  agora: Date;
}): { ok: true; linha: LinhaNovaDoRepasse } | RecusaDoPainel {
  if (!cadastraRepasse(args.perfis)) {
    return { ok: false, status: 403, erro: "Seu perfil não cadastra carro de repasse." };
  }
  const corpo = args.corpo;
  if (!ehObjeto(corpo)) return { ok: false, status: 400, erro: "Corpo inválido." };
  const faltando = OBRIGATORIOS_PARA_CRIAR.filter((c) => !(c in corpo)).map((c) => MENSAGEM_DO_OBRIGATORIO[c]);
  const { colunas, problemas } = normalizarCampos(corpo, args.agora);
  const todos = [...faltando, ...problemas];
  if (todos.length > 0) return { ok: false, status: 400, erro: todos[0], problemas: todos };

  const marca = colunas.marca as string;
  const modelo = colunas.modelo as string;
  const ano_modelo = colunas.ano_modelo as number;
  const slug = slugDoRepasse({ id: args.id, marca, modelo, versao: colunas.versao ?? null, ano_modelo });
  return {
    ok: true,
    linha: {
      ...colunas,
      id: args.id,
      slug,
      situacao: "rascunho",
      criado_por: args.autorId,
      marca,
      modelo,
      ano_modelo,
      quilometragem: colunas.quilometragem as number,
      preco: colunas.preco as number,
    },
  };
}

export function decidirEdicao(args: {
  repasse: Repasse;
  corpo: unknown;
  perfis: Perfil[];
  agora: Date;
}): { ok: true; colunas: Partial<FormularioDoRepasse> & { slug?: string } } | RecusaDoPainel {
  const { repasse, corpo, perfis, agora } = args;
  if (repasse.situacao === "vendido" || repasse.situacao === "arquivado") {
    return { ok: false, status: 409, erro: "Carro vendido ou arquivado não se edita." };
  }
  if (!podeEditarORepasse(repasse, perfis)) {
    return {
      ok: false,
      status: 403,
      erro:
        repasse.situacao === "rascunho"
          ? "Seu perfil não cadastra carro de repasse."
          : "Fora do rascunho, só quem valida edita. Peça a um validador que devolva o carro para rascunho.",
    };
  }
  if (!ehObjeto(corpo)) return { ok: false, status: 400, erro: "Corpo inválido." };
  const { colunas, problemas } = normalizarCampos(corpo, agora);
  if (problemas.length > 0) return { ok: false, status: 400, erro: problemas[0], problemas };

  const depois: Repasse = { ...repasse, ...colunas };
  if (repasse.situacao !== "rascunho") {
    // Carro já conferido não pode sair da edição incompleto: o site o mostra.
    const faltas = checklistDoRepasse(depois, agora);
    if (faltas.length > 0) {
      return {
        ok: false,
        status: 422,
        erro: "Fora do rascunho, o carro precisa continuar completo.",
        problemas: faltas.map((f) => f.mensagem),
      };
    }
    // A URL publicada fica estável: o slug só muda no rascunho.
    return { ok: true, colunas };
  }
  const mudouAIdentidade = (["marca", "modelo", "versao", "ano_modelo"] as const).some((c) => c in colunas);
  return { ok: true, colunas: mudouAIdentidade ? { ...colunas, slug: slugDoRepasse(depois) } : colunas };
}

export function formularioDe(r: Repasse): FormularioDoRepasse {
  const f: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS_DO_REPASSE) f[campo] = r[campo];
  return f as FormularioDoRepasse;
}

/** Só o que mudou — é o corpo do PATCH. Compara por valor, listas e itens inclusive. */
export function alteracoes(atual: FormularioDoRepasse, salvo: FormularioDoRepasse): Partial<FormularioDoRepasse> {
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS_DO_REPASSE) {
    if (JSON.stringify(atual[campo]) !== JSON.stringify(salvo[campo])) saida[campo] = atual[campo];
  }
  return saida as Partial<FormularioDoRepasse>;
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/edicao-do-repasse.test.ts`
Expected: PASS. Se "texto opcional vazio vira null" reprovar só no slug esperado, conferir `slugDoRepasse` com `versao: null` (`renault-kwid-2021-3f9a1c`) e ajustar o esperado ao que a função do PR 1 devolve — o slug é dela, não deste arquivo.

- [ ] **Step 5: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Tirar `if (CAMPOS_DESCARTADOS.includes(chave)) continue;` e trocar a recusa de campo desconhecido por `continue` → os `it("recusa …")` reprovam (o bug real: a rota aceitaria `situacao` pelo PATCH).
2. Em `podeEditarORepasse`, trocar `validaRepasse(perfis)` por `cadastraRepasse(perfis)` → "marketing não edita o carro em validação" reprova.
3. Apagar o bloco `if (repasse.situacao !== "rascunho") { … }` → "fora do rascunho, a edição não pode deixar o carro incompleto" e "não muda fora do rascunho" reprovam.

- [ ] **Step 6: Commit**

```bash
git add src/lib/edicaoDoRepasse.ts tests/edicao-do-repasse.test.ts
git commit -m "feat(repasse): portão de criação e edição com lista fechada de campos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: A máquina de situações — `transicoesDoRepasse.ts` — Opus

**Files:**
- Create: `src/lib/transicoesDoRepasse.ts`
- Test: `tests/transicoes-do-repasse.test.ts`

**Interfaces:**
- Consumes: `checklistDoRepasse(r, hoje)`; `cadastraRepasse`, `validaRepasse`, `RecusaDoPainel` (Task 3); `Perfil`; `Repasse`, `SituacaoDoRepasse`.
- Produces:
  - `ATOS_DO_REPASSE = ["enviar", "devolver", "publicar_lojistas", "publicar_todos", "abrir_para_todos", "reservar", "liberar_reserva", "vender", "arquivar"] as const`; `type AtoDoRepasse`.
  - `REGRAS_DOS_ATOS: Record<AtoDoRepasse, { de: readonly SituacaoDoRepasse[]; quem: "cadastra" | "valida"; rotulo: string }>`.
  - `interface ColunasDaTransicao { situacao: SituacaoDoRepasse; enviado_em?; devolvido_com?; validado_por?; validado_em?; lojistas_desde?; aberto_ao_publico_em?; reservado_em?; vendido_em?; arquivado_em? }` (opcionais `string | null`).
  - `atosPossiveis(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">, perfis: Perfil[]): AtoDoRepasse[]`.
  - `decidirTransicao(args: { repasse: Repasse; ato: unknown; nota?: unknown; perfis: Perfil[]; autorId: string; agora: Date }): { ok: true; ato: AtoDoRepasse; colunas: ColunasDaTransicao } | RecusaDoPainel`.
  - `LIMITE_DA_NOTA = 500`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/transicoes-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ATOS_DO_REPASSE,
  REGRAS_DOS_ATOS,
  atosPossiveis,
  decidirTransicao,
} from "../src/lib/transicoesDoRepasse";
import { SITUACOES_DO_REPASSE, type Repasse } from "../src/lib/repasse";
import type { Perfil } from "../src/lib/permissoes";
import { repasseDeTeste } from "./repasseDeTeste";

const AGORA = new Date("2026-09-24T12:00:00Z");
const ISO = AGORA.toISOString();

/** O carro de teste já completo, na situação pedida, com as datas que o banco exige. */
function naSituacao(situacao: Repasse["situacao"], parcial: Partial<Repasse> = {}): Repasse {
  const datas: Partial<Repasse> =
    situacao === "publicado" || situacao === "reservado" || situacao === "vendido" ? { lojistas_desde: ISO } : {};
  if (situacao === "reservado") datas.reservado_em = ISO;
  if (situacao === "vendido") datas.vendido_em = ISO;
  if (situacao === "arquivado") datas.arquivado_em = ISO;
  return repasseDeTeste({ situacao, ...datas, ...parcial });
}

const decidir = (repasse: Repasse, ato: unknown, perfis: Perfil[], nota?: unknown) =>
  decidirTransicao({ repasse, ato, nota, perfis, autorId: "u-9", agora: AGORA });

describe("atos possíveis por situação e perfil", () => {
  it("rascunho: marketing só envia; quem valida também arquiva", () => {
    expect(atosPossiveis(naSituacao("rascunho"), ["marketing"])).toEqual(["enviar"]);
    expect(atosPossiveis(naSituacao("rascunho"), ["comercial"])).toEqual(["enviar", "arquivar"]);
  });

  it("em validação: só quem valida age", () => {
    expect(atosPossiveis(naSituacao("em_validacao"), ["marketing"])).toEqual([]);
    expect(atosPossiveis(naSituacao("em_validacao"), ["gestor"])).toEqual([
      "devolver",
      "publicar_lojistas",
      "publicar_todos",
      "arquivar",
    ]);
  });

  it("publicado só para lojistas tem o switch; aberto a todos, não", () => {
    expect(atosPossiveis(naSituacao("publicado"), ["admin"])).toEqual([
      "devolver",
      "abrir_para_todos",
      "reservar",
      "vender",
      "arquivar",
    ]);
    expect(atosPossiveis(naSituacao("publicado", { aberto_ao_publico_em: ISO }), ["admin"])).not.toContain("abrir_para_todos");
  });

  it("reservado, vendido, arquivado", () => {
    expect(atosPossiveis(naSituacao("reservado"), ["comercial"])).toEqual(["liberar_reserva", "vender", "arquivar"]);
    expect(atosPossiveis(naSituacao("vendido"), ["comercial"])).toEqual(["arquivar"]);
    expect(atosPossiveis(naSituacao("arquivado"), ["admin"])).toEqual([]);
  });
});

describe("decidirTransicao", () => {
  it("ato desconhecido", () => {
    expect(decidir(naSituacao("rascunho"), "publicar", ["admin"])).toMatchObject({ ok: false, status: 400 });
  });

  it("qualquer perfil envia o rascunho completo", () => {
    expect(decidir(naSituacao("rascunho"), "enviar", ["financeiro"])).toEqual({
      ok: true,
      ato: "enviar",
      colunas: { situacao: "em_validacao", enviado_em: ISO, devolvido_com: null },
    });
  });

  it("rascunho incompleto não vai à validação", () => {
    const d = decidir(naSituacao("rascunho", { resumo: null }), "enviar", ["financeiro"]);
    expect(d).toMatchObject({ ok: false, status: 422 });
    if (!d.ok) expect(d.problemas).toContain("Escreva a linha do card.");
  });

  it("marketing não publica", () => {
    expect(decidir(naSituacao("em_validacao"), "publicar_lojistas", ["marketing"])).toMatchObject({ ok: false, status: 403 });
  });

  it("não se publica o que não está em validação", () => {
    expect(decidir(naSituacao("rascunho"), "publicar_lojistas", ["comercial"])).toMatchObject({ ok: false, status: 409 });
  });

  it("publicar só para lojistas grava quem validou e a data dos lojistas", () => {
    expect(decidir(naSituacao("em_validacao"), "publicar_lojistas", ["comercial"])).toEqual({
      ok: true,
      ato: "publicar_lojistas",
      colunas: {
        situacao: "publicado",
        validado_por: "u-9",
        validado_em: ISO,
        lojistas_desde: ISO,
        aberto_ao_publico_em: null,
        devolvido_com: null,
      },
    });
  });

  it("publicar aberto a todos grava as duas datas", () => {
    const d = decidir(naSituacao("em_validacao"), "publicar_todos", ["gestor"]);
    expect(d.ok && d.colunas).toMatchObject({ lojistas_desde: ISO, aberto_ao_publico_em: ISO });
  });

  it("o switch abre uma vez e não volta", () => {
    expect(decidir(naSituacao("publicado"), "abrir_para_todos", ["admin"])).toEqual({
      ok: true,
      ato: "abrir_para_todos",
      colunas: { situacao: "publicado", aberto_ao_publico_em: ISO },
    });
    expect(decidir(naSituacao("publicado", { aberto_ao_publico_em: ISO }), "abrir_para_todos", ["admin"])).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("devolver pede a nota, e o invisível não é nota", () => {
    expect(decidir(naSituacao("em_validacao"), "devolver", ["comercial"])).toMatchObject({ ok: false, status: 400 });
    expect(decidir(naSituacao("em_validacao"), "devolver", ["comercial"], "\u200B ")).toMatchObject({ ok: false, status: 400 });
    expect(decidir(naSituacao("em_validacao"), "devolver", ["comercial"], "x".repeat(501))).toMatchObject({ ok: false, status: 400 });
  });

  it("devolver um publicado zera a publicação", () => {
    const d = decidir(naSituacao("publicado", { aberto_ao_publico_em: ISO }), "devolver", ["comercial"], "Faltou a foto do farol");
    expect(d).toEqual({
      ok: true,
      ato: "devolver",
      colunas: {
        situacao: "rascunho",
        devolvido_com: "Faltou a foto do farol",
        validado_por: null,
        validado_em: null,
        lojistas_desde: null,
        aberto_ao_publico_em: null,
      },
    });
  });

  it("reservar, liberar, vender e arquivar gravam a data certa", () => {
    expect(decidir(naSituacao("publicado"), "reservar", ["comercial"])).toMatchObject({ ok: true, colunas: { situacao: "reservado", reservado_em: ISO } });
    expect(decidir(naSituacao("reservado"), "liberar_reserva", ["comercial"])).toMatchObject({ ok: true, colunas: { situacao: "publicado", reservado_em: null } });
    expect(decidir(naSituacao("reservado"), "vender", ["comercial"])).toMatchObject({ ok: true, colunas: { situacao: "vendido", vendido_em: ISO } });
    expect(decidir(naSituacao("vendido"), "arquivar", ["comercial"])).toMatchObject({ ok: true, colunas: { situacao: "arquivado", arquivado_em: ISO } });
  });

  it("a tabela de regras e a decisão concordam em todo par ato × situação", () => {
    // Admin, carro completo, switch desligado e nota escrita: a única razão
    // para recusar é a situação — e aí a recusa tem de ser 409.
    for (const ato of ATOS_DO_REPASSE) {
      for (const situacao of SITUACOES_DO_REPASSE) {
        const d = decidir(naSituacao(situacao), ato, ["admin"], "nota");
        if (REGRAS_DOS_ATOS[ato].de.includes(situacao)) {
          expect(d.ok, `${ato} em ${situacao}`).toBe(true);
        } else {
          expect(d, `${ato} em ${situacao}`).toMatchObject({ ok: false, status: 409 });
        }
      }
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/transicoes-do-repasse.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/transicoesDoRepasse.ts`:

```ts
/**
 * A máquina de situações do repasse (spec §5).
 *
 *   rascunho ──enviar──▶ em_validacao ──publicar──▶ publicado ◀──▶ reservado
 *      ▲                     │                         │              │
 *      └─────devolver────────┴─────────────────────────┘   vendido ◀──┘
 *                                        (qualquer um, menos arquivado) ──▶ arquivado
 *
 * Quem faz cada ato sai da matriz A17: "Cadastrar carro de repasse" (todos
 * os perfis) envia; "Validar e publicar repasse" (Administrador, Gestor,
 * Comercial) faz o resto. A rota roda `decidirTransicao` e grava com a chave
 * de serviço — `authenticated` não escreve na tabela (20260924200000).
 *
 * "Abrir para todos" é um switch manual e não volta atrás (dono, 24/09).
 * Devolver um carro publicado zera a publicação: quando ele voltar, quem
 * valida escolhe de novo entre "só para lojistas" e "aberto a todos".
 */
import { checklistDoRepasse } from "./checklistDoRepasse";
import { cadastraRepasse, validaRepasse, type RecusaDoPainel } from "./edicaoDoRepasse";
import type { Perfil } from "./permissoes";
import type { Repasse, SituacaoDoRepasse } from "./repasse";

export const ATOS_DO_REPASSE = [
  "enviar",
  "devolver",
  "publicar_lojistas",
  "publicar_todos",
  "abrir_para_todos",
  "reservar",
  "liberar_reserva",
  "vender",
  "arquivar",
] as const;
export type AtoDoRepasse = (typeof ATOS_DO_REPASSE)[number];

export interface RegraDoAto {
  de: readonly SituacaoDoRepasse[];
  quem: "cadastra" | "valida";
  rotulo: string;
}

export const REGRAS_DOS_ATOS: Record<AtoDoRepasse, RegraDoAto> = {
  enviar: { de: ["rascunho"], quem: "cadastra", rotulo: "Enviar para validação" },
  devolver: { de: ["em_validacao", "publicado"], quem: "valida", rotulo: "Devolver para rascunho" },
  publicar_lojistas: { de: ["em_validacao"], quem: "valida", rotulo: "Publicar só para lojistas" },
  publicar_todos: { de: ["em_validacao"], quem: "valida", rotulo: "Publicar aberto a todos" },
  abrir_para_todos: { de: ["publicado"], quem: "valida", rotulo: "Abrir para todos" },
  reservar: { de: ["publicado"], quem: "valida", rotulo: "Reservar" },
  liberar_reserva: { de: ["reservado"], quem: "valida", rotulo: "Liberar a reserva" },
  vender: { de: ["publicado", "reservado"], quem: "valida", rotulo: "Marcar como vendido" },
  arquivar: {
    de: ["rascunho", "em_validacao", "publicado", "reservado", "vendido"],
    quem: "valida",
    rotulo: "Arquivar",
  },
};

export interface ColunasDaTransicao {
  situacao: SituacaoDoRepasse;
  enviado_em?: string | null;
  devolvido_com?: string | null;
  validado_por?: string | null;
  validado_em?: string | null;
  lojistas_desde?: string | null;
  aberto_ao_publico_em?: string | null;
  reservado_em?: string | null;
  vendido_em?: string | null;
  arquivado_em?: string | null;
}

export type DecisaoDaTransicao = { ok: true; ato: AtoDoRepasse; colunas: ColunasDaTransicao } | RecusaDoPainel;

export const LIMITE_DA_NOTA = 500;
const INVISIVEIS = /[\u200B-\u200D\u2060\uFEFF]/g;

/** "Este ato não vale para um carro …" */
const NA_SITUACAO: Record<SituacaoDoRepasse, string> = {
  rascunho: "em rascunho",
  em_validacao: "em validação",
  publicado: "publicado",
  reservado: "reservado",
  vendido: "vendido",
  arquivado: "arquivado",
};

function pode(quem: RegraDoAto["quem"], perfis: Perfil[]): boolean {
  return quem === "cadastra" ? cadastraRepasse(perfis) : validaRepasse(perfis);
}

export function atosPossiveis(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">, perfis: Perfil[]): AtoDoRepasse[] {
  return ATOS_DO_REPASSE.filter((ato) => {
    const regra = REGRAS_DOS_ATOS[ato];
    if (!regra.de.includes(r.situacao) || !pode(regra.quem, perfis)) return false;
    return ato !== "abrir_para_todos" || r.aberto_ao_publico_em === null;
  });
}

export function decidirTransicao(args: {
  repasse: Repasse;
  ato: unknown;
  nota?: unknown;
  perfis: Perfil[];
  autorId: string;
  agora: Date;
}): DecisaoDaTransicao {
  const { repasse, perfis, autorId } = args;
  if (typeof args.ato !== "string" || !(ATOS_DO_REPASSE as readonly string[]).includes(args.ato)) {
    return { ok: false, status: 400, erro: "Ato desconhecido." };
  }
  const ato = args.ato as AtoDoRepasse;
  const regra = REGRAS_DOS_ATOS[ato];
  if (!pode(regra.quem, perfis)) return { ok: false, status: 403, erro: "Seu perfil não faz este ato." };
  if (!regra.de.includes(repasse.situacao)) {
    return { ok: false, status: 409, erro: `"${regra.rotulo}" não vale para um carro ${NA_SITUACAO[repasse.situacao]}.` };
  }

  if (ato === "enviar" || ato === "publicar_lojistas" || ato === "publicar_todos") {
    const faltas = checklistDoRepasse(repasse, args.agora);
    if (faltas.length > 0) {
      return { ok: false, status: 422, erro: "O carro ainda não está completo.", problemas: faltas.map((f) => f.mensagem) };
    }
  }

  const agora = args.agora.toISOString();
  switch (ato) {
    case "enviar":
      return { ok: true, ato, colunas: { situacao: "em_validacao", enviado_em: agora, devolvido_com: null } };
    case "devolver": {
      const nota = typeof args.nota === "string" ? args.nota.replace(INVISIVEIS, "").trim() : "";
      if (!nota) return { ok: false, status: 400, erro: "Escreva o que falta para o carro voltar à validação." };
      if (nota.length > LIMITE_DA_NOTA) return { ok: false, status: 400, erro: `A nota tem até ${LIMITE_DA_NOTA} caracteres.` };
      return {
        ok: true,
        ato,
        colunas: {
          situacao: "rascunho",
          devolvido_com: nota,
          validado_por: null,
          validado_em: null,
          lojistas_desde: null,
          aberto_ao_publico_em: null,
        },
      };
    }
    case "publicar_lojistas":
    case "publicar_todos":
      return {
        ok: true,
        ato,
        colunas: {
          situacao: "publicado",
          validado_por: autorId,
          validado_em: agora,
          lojistas_desde: agora,
          aberto_ao_publico_em: ato === "publicar_todos" ? agora : null,
          devolvido_com: null,
        },
      };
    case "abrir_para_todos":
      if (repasse.aberto_ao_publico_em !== null) {
        return { ok: false, status: 409, erro: "O carro já está aberto a todos." };
      }
      return { ok: true, ato, colunas: { situacao: "publicado", aberto_ao_publico_em: agora } };
    case "reservar":
      return { ok: true, ato, colunas: { situacao: "reservado", reservado_em: agora } };
    case "liberar_reserva":
      return { ok: true, ato, colunas: { situacao: "publicado", reservado_em: null } };
    case "vender":
      return { ok: true, ato, colunas: { situacao: "vendido", vendido_em: agora } };
    case "arquivar":
      return { ok: true, ato, colunas: { situacao: "arquivado", arquivado_em: agora } };
  }
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/transicoes-do-repasse.test.ts`
Expected: PASS.

- [ ] **Step 5: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `REGRAS_DOS_ATOS.publicar_lojistas`, trocar `quem: "valida"` por `quem: "cadastra"` → "marketing não publica" reprova (o bug I4, agora no código).
2. Apagar o bloco do checklist (`if (ato === "enviar" || …)`) → "rascunho incompleto não vai à validação" reprova.
3. Em `abrir_para_todos`, apagar o `if (repasse.aberto_ao_publico_em !== null)` → "o switch abre uma vez e não volta" reprova.

- [ ] **Step 6: Commit**

```bash
git add src/lib/transicoesDoRepasse.ts tests/transicoes-do-repasse.test.ts
git commit -m "feat(repasse): máquina de situações com quem faz cada ato e o switch que não volta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Quem avisar e a mensagem — `avisosDoRepasse.ts` — Sonnet

**Files:**
- Create: `src/lib/avisosDoRepasse.ts`
- Test: `tests/avisos-do-repasse.test.ts`

**Interfaces:**
- Consumes: `contaDoRepasse`, `etiquetaDoRepasse`, `temLaudo`, `soParaLojistas`, `faixaDoPreco`, `emReais`, `FAIXAS_DO_REPASSE`, `CARROCERIAS_DO_REPASSE`, `Repasse`, `FaixaDoRepasse` (`repasse.ts`); `validaRepasse`, `RecusaDoPainel` (Task 3); `termosProibidosEm` (só no teste).
- Produces:
  - `TRILHAS_DO_REPASSE = ["consumidor", "lojista"] as const`; `type TrilhaDoRepasse`.
  - `interface InscritoDoRepasse { id: string; trilha: TrilhaDoRepasse; nome: string; whatsapp: string; faixa: FaixaDoRepasse | null; carrocerias: string[]; cnpj: string | null; loja_cidade: string | null; cnpj_conferido_em: string | null; created_at: string }`.
  - `COLUNAS_DO_INSCRITO` (string para `select`).
  - `inscritoDaLinha(linha: Record<string, unknown>): InscritoDoRepasse | null`.
  - `inscritosQueCombinam(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em" | "preco" | "carroceria">, inscritos: InscritoDoRepasse[], avisados: ReadonlySet<string>): { combinam: Array<{ inscrito: InscritoDoRepasse; avisado: boolean }>; lojistasSemConferencia: number }`.
  - `mensagemDeAvisoDoRepasse(r: Repasse, inscrito: Pick<InscritoDoRepasse, "nome" | "trilha">, url: string): string`.
  - `decidirAviso(args: { repasse: Pick<Repasse, "situacao">; inscrito: InscritoDoRepasse | null; perfis: Perfil[] }): { ok: true } | RecusaDoPainel`.
  - `decidirMarcacaoDeInscrito(args: { inscrito: InscritoDoRepasse; corpo: unknown; perfis: Perfil[]; autorId: string; agora: Date }): { ok: true; colunas: { cnpj_conferido_em: string | null; cnpj_conferido_por: string | null } } | RecusaDoPainel`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/avisos-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  decidirAviso,
  decidirMarcacaoDeInscrito,
  inscritoDaLinha,
  inscritosQueCombinam,
  mensagemDeAvisoDoRepasse,
  type InscritoDoRepasse,
} from "../src/lib/avisosDoRepasse";
import { termosProibidosEm } from "../src/lib/checklistDoRepasse";
import { repasseDeTeste } from "./repasseDeTeste";

const ISO = "2026-09-24T12:00:00.000Z";

function inscrito(parcial: Partial<InscritoDoRepasse>): InscritoDoRepasse {
  return {
    id: "i-1",
    trilha: "consumidor",
    nome: "Ana Souza",
    whatsapp: "41999990000",
    faixa: "30-50",
    carrocerias: [],
    cnpj: null,
    loja_cidade: null,
    cnpj_conferido_em: null,
    created_at: "2026-09-20T12:00:00Z",
    ...parcial,
  };
}

const LOJISTA_CONFERIDO = inscrito({ id: "l-1", trilha: "lojista", nome: "Auto Bom", faixa: null, cnpj: "12345678000190", loja_cidade: "Auto Bom, Curitiba", cnpj_conferido_em: ISO });
const LOJISTA_SEM_CONFERIR = inscrito({ id: "l-2", trilha: "lojista", nome: "Carros Já", faixa: null, cnpj: "98765432000110" });
const NA_FAIXA = inscrito({ id: "c-1", faixa: "30-50", carrocerias: ["hatch"] });
const FORA_DA_FAIXA = inscrito({ id: "c-2", faixa: "acima-80" });
const OUTRA_CARROCERIA = inscrito({ id: "c-3", faixa: "30-50", carrocerias: ["suv"] });
const SEM_PREFERENCIA = inscrito({ id: "c-4", faixa: null, carrocerias: [] });
const TODOS = [LOJISTA_CONFERIDO, LOJISTA_SEM_CONFERIR, NA_FAIXA, FORA_DA_FAIXA, OUTRA_CARROCERIA, SEM_PREFERENCIA];

// O Kwid de teste: R$ 36.900, hatch.
const SO_LOJISTAS = repasseDeTeste({ situacao: "publicado", lojistas_desde: ISO });
const ABERTO = repasseDeTeste({ situacao: "publicado", lojistas_desde: ISO, aberto_ao_publico_em: ISO });
const ids = (r: typeof SO_LOJISTAS, avisados: string[] = []) =>
  inscritosQueCombinam(r, TODOS, new Set(avisados)).combinam.map((c) => c.inscrito.id);

describe("quem combina", () => {
  it("só lojistas: só o lojista com CNPJ conferido", () => {
    expect(ids(SO_LOJISTAS)).toEqual(["l-1"]);
    expect(inscritosQueCombinam(SO_LOJISTAS, TODOS, new Set()).lojistasSemConferencia).toBe(1);
  });

  it("aberto a todos: o lojista conferido e quem casa faixa e carroceria", () => {
    expect(ids(ABERTO)).toEqual(["l-1", "c-1", "c-4"]);
  });

  it("quem já foi avisado vai para o fim, marcado", () => {
    const { combinam } = inscritosQueCombinam(ABERTO, TODOS, new Set(["l-1"]));
    expect(combinam.map((c) => [c.inscrito.id, c.avisado])).toEqual([
      ["c-1", false],
      ["c-4", false],
      ["l-1", true],
    ]);
  });

  it("carro que não está publicado não tem quem avisar", () => {
    expect(ids(repasseDeTeste({ situacao: "reservado", lojistas_desde: ISO, reservado_em: ISO }))).toEqual([]);
    expect(ids(repasseDeTeste({ situacao: "rascunho" }))).toEqual([]);
  });
});

describe("a mensagem", () => {
  const url = "https://motorsstore.com.br/repasse/renault-kwid-zen-1-0-2021-3f9a1c";

  it("não usa termo que o repasse não usa, nas duas trilhas e nos três laudos", () => {
    for (const laudo of ["aprovado", "aprovado_com_apontamento", "nao_feito"] as const) {
      for (const trilha of ["consumidor", "lojista"] as const) {
        const r = repasseDeTeste({ laudo, laudo_apontamento: laudo === "aprovado_com_apontamento" ? "Folga na suspensão" : null });
        const texto = mensagemDeAvisoDoRepasse(r, { nome: "Ana Souza", trilha }, url);
        expect(termosProibidosEm(texto), `${trilha}/${laudo}`).toEqual([]);
      }
    }
  });

  it("traz o carro, a conta, a ficha e as condições", () => {
    const texto = mensagemDeAvisoDoRepasse(repasseDeTeste(), { nome: "Ana Souza", trilha: "consumidor" }, url);
    expect(texto).toContain("Olá, Ana!");
    expect(texto).toContain("Renault Kwid Zen 1.0 2021");
    expect(texto).toContain("71.200 km");
    expect(texto).toContain("36.900");
    expect(texto).toContain("2.020"); // reparo orçado: 1.400 + 620
    expect(texto).toContain("38.920"); // você gasta
    expect(texto).toContain(url);
    expect(texto).toContain("só à vista");
  });

  it("laudo feito sai a pedido", () => {
    const texto = mensagemDeAvisoDoRepasse(repasseDeTeste({ laudo: "aprovado" }), { nome: "Ana", trilha: "consumidor" }, url);
    expect(texto).toContain("O laudo cautelar sai a pedido");
    const semLaudo = mensagemDeAvisoDoRepasse(repasseDeTeste({ laudo: "nao_feito" }), { nome: "Ana", trilha: "consumidor" }, url);
    expect(semLaudo).not.toContain("laudo cautelar sai");
  });

  it("lojista recebe o aviso de antes do site", () => {
    const texto = mensagemDeAvisoDoRepasse(repasseDeTeste(), { nome: "Auto Bom", trilha: "lojista" }, url);
    expect(texto).toContain("antes do site");
  });

  it("acima da FIPE, a mensagem não fala em diferença", () => {
    const caro = repasseDeTeste({ preco: 45000 });
    expect(mensagemDeAvisoDoRepasse(caro, { nome: "Ana", trilha: "consumidor" }, url)).not.toContain("abaixo");
  });
});

describe("inscritoDaLinha", () => {
  it("lê a linha do banco e recusa a malformada", () => {
    expect(inscritoDaLinha({ ...NA_FAIXA })).toEqual(NA_FAIXA);
    expect(inscritoDaLinha({ ...NA_FAIXA, trilha: "outra" })).toBeNull();
    expect(inscritoDaLinha({ ...NA_FAIXA, nome: "" })).toBeNull();
  });
});

describe("portões da lista", () => {
  it("só quem valida marca aviso, e só de carro publicado", () => {
    expect(decidirAviso({ repasse: ABERTO, inscrito: NA_FAIXA, perfis: ["marketing"] })).toMatchObject({ ok: false, status: 403 });
    expect(decidirAviso({ repasse: repasseDeTeste(), inscrito: NA_FAIXA, perfis: ["comercial"] })).toMatchObject({ ok: false, status: 409 });
    expect(decidirAviso({ repasse: ABERTO, inscrito: null, perfis: ["comercial"] })).toMatchObject({ ok: false, status: 404 });
    expect(decidirAviso({ repasse: ABERTO, inscrito: NA_FAIXA, perfis: ["comercial"] })).toEqual({ ok: true });
  });

  it("CNPJ conferido: só lojista, só quem valida, e desmarca", () => {
    const agora = new Date(ISO);
    const marcar = (i: InscritoDoRepasse, corpo: unknown, perfis: ["comercial"] | ["marketing"] = ["comercial"]) =>
      decidirMarcacaoDeInscrito({ inscrito: i, corpo, perfis, autorId: "u-1", agora });
    expect(marcar(LOJISTA_SEM_CONFERIR, { cnpj_conferido: true })).toEqual({
      ok: true,
      colunas: { cnpj_conferido_em: ISO, cnpj_conferido_por: "u-1" },
    });
    expect(marcar(LOJISTA_CONFERIDO, { cnpj_conferido: false })).toEqual({
      ok: true,
      colunas: { cnpj_conferido_em: null, cnpj_conferido_por: null },
    });
    expect(marcar(NA_FAIXA, { cnpj_conferido: true })).toMatchObject({ ok: false, status: 409 });
    expect(marcar(LOJISTA_SEM_CONFERIR, { cnpj_conferido: "sim" })).toMatchObject({ ok: false, status: 400 });
    expect(marcar(LOJISTA_SEM_CONFERIR, { cnpj_conferido: true }, ["marketing"])).toMatchObject({ ok: false, status: 403 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/avisos-do-repasse.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/lib/avisosDoRepasse.ts`:

```ts
/**
 * A lista do repasse no painel: quem combina com um carro, e a mensagem que
 * a equipe copia para o Chatwoot (spec §6, "Inscritos que combinam").
 *
 * O aviso é MANUAL (dono, 24/09): o site guarda quem está na lista e o perfil
 * de cada um; uma pessoa da equipe manda. Nada aqui dispara mensagem.
 *
 * Quem combina:
 *   - enquanto o carro é só para lojistas: os lojistas com CNPJ conferido.
 *     A conferência existe para isso — o aviso antecipado é vantagem de
 *     lojista, e CNPJ não conferido ainda não é lojista para a loja;
 *   - depois do switch "abrir para todos": os mesmos lojistas e quem compra
 *     para usar cuja faixa casa com o preço à vista e cuja carroceria casa
 *     (faixa ou carroceria em branco casam com qualquer carro).
 */
import { validaRepasse, type RecusaDoPainel } from "./edicaoDoRepasse";
import type { Perfil } from "./permissoes";
import {
  FAIXAS_DO_REPASSE,
  contaDoRepasse,
  emReais,
  etiquetaDoRepasse,
  faixaDoPreco,
  soParaLojistas,
  temLaudo,
  type FaixaDoRepasse,
  type Repasse,
} from "./repasse";

export const TRILHAS_DO_REPASSE = ["consumidor", "lojista"] as const;
export type TrilhaDoRepasse = (typeof TRILHAS_DO_REPASSE)[number];

export interface InscritoDoRepasse {
  id: string;
  trilha: TrilhaDoRepasse;
  nome: string;
  whatsapp: string;
  faixa: FaixaDoRepasse | null;
  carrocerias: string[];
  cnpj: string | null;
  loja_cidade: string | null;
  cnpj_conferido_em: string | null;
  created_at: string;
}

export const COLUNAS_DO_INSCRITO =
  "id, trilha, nome, whatsapp, faixa, carrocerias, cnpj, loja_cidade, cnpj_conferido_em, created_at";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function inscritoDaLinha(linha: Record<string, unknown>): InscritoDoRepasse | null {
  const id = texto(linha.id);
  const nome = texto(linha.nome);
  const whatsapp = texto(linha.whatsapp);
  const trilha = TRILHAS_DO_REPASSE.find((t) => t === linha.trilha) ?? null;
  const created_at = texto(linha.created_at);
  if (!id || !nome || !whatsapp || !trilha || !created_at) return null;
  const faixa = FAIXAS_DO_REPASSE.find((f) => f.id === linha.faixa)?.id ?? null;
  const carrocerias = Array.isArray(linha.carrocerias)
    ? linha.carrocerias.filter((c): c is string => typeof c === "string")
    : [];
  return {
    id,
    trilha,
    nome,
    whatsapp,
    faixa,
    carrocerias,
    cnpj: texto(linha.cnpj),
    loja_cidade: texto(linha.loja_cidade),
    cnpj_conferido_em: texto(linha.cnpj_conferido_em),
    created_at,
  };
}

export interface CombinaComORepasse {
  inscrito: InscritoDoRepasse;
  avisado: boolean;
}

export function inscritosQueCombinam(
  r: Pick<Repasse, "situacao" | "aberto_ao_publico_em" | "preco" | "carroceria">,
  inscritos: InscritoDoRepasse[],
  avisados: ReadonlySet<string>,
): { combinam: CombinaComORepasse[]; lojistasSemConferencia: number } {
  const lojistasSemConferencia = inscritos.filter((i) => i.trilha === "lojista" && !i.cnpj_conferido_em).length;
  if (r.situacao !== "publicado") return { combinam: [], lojistasSemConferencia };

  const lojistas = inscritos.filter((i) => i.trilha === "lojista" && i.cnpj_conferido_em);
  const faixa = faixaDoPreco(r.preco);
  const consumidores = soParaLojistas(r)
    ? []
    : inscritos.filter(
        (i) =>
          i.trilha === "consumidor" &&
          (i.faixa === null || i.faixa === faixa) &&
          (i.carrocerias.length === 0 || (r.carroceria !== null && i.carrocerias.includes(r.carroceria))),
      );

  const ordem = (c: CombinaComORepasse) => (c.avisado ? 2 : 0) + (c.inscrito.trilha === "lojista" ? 0 : 1);
  const combinam = [...lojistas, ...consumidores]
    .map((inscrito) => ({ inscrito, avisado: avisados.has(inscrito.id) }))
    .sort((a, b) => ordem(a) - ordem(b) || a.inscrito.created_at.localeCompare(b.inscrito.created_at));
  return { combinam, lojistasSemConferencia };
}

/**
 * O texto que a equipe cola no Chatwoot. Passa em `termosProibidosEm` com a
 * lista inteira (tests/avisos-do-repasse.test.ts): nada de "não girou", de
 * CDC ou de direitos — e laudo, quando há, "sai a pedido" (regra de 16/09).
 */
export function mensagemDeAvisoDoRepasse(
  r: Repasse,
  inscrito: Pick<InscritoDoRepasse, "nome" | "trilha">,
  url: string,
): string {
  const primeiroNome = inscrito.nome.trim().split(/\s+/)[0];
  const carro = [r.marca, r.modelo, r.versao, String(r.ano_modelo)].filter(Boolean).join(" ");
  const conta = contaDoRepasse(r);
  const linhas: Array<string | null> = [
    `Olá, ${primeiroNome}!`,
    inscrito.trilha === "lojista"
      ? `Repasse Motors, aviso para lojistas antes do site: ${carro}.`
      : `Entrou no Repasse Motors um carro que combina com o que você procura: ${carro}.`,
    `${r.quilometragem.toLocaleString("pt-BR")} km · ${etiquetaDoRepasse(r)}.`,
    temLaudo(r) ? "O laudo cautelar sai a pedido, antes de qualquer sinal." : null,
    `À vista: ${emReais(r.preco)}.`,
    conta.reparoOrcado > 0
      ? `Reparo orçado: ${emReais(conta.reparoOrcado)}. Você gasta ${emReais(conta.voceGasta)}.`
      : null,
    conta.fipe !== null && conta.abaixoDaFipe !== null && conta.abaixoDaFipe > 0
      ? `FIPE${r.fipe_mes_referencia ? ` de ${r.fipe_mes_referencia}` : ""}: ${emReais(conta.fipe)}. Fica ${emReais(conta.abaixoDaFipe)} abaixo.`
      : null,
    `Fotos, conta e defeitos conhecidos: ${url}`,
    "Pagamento só à vista, PIX ou TED. O exame é no pátio, com hora marcada.",
  ];
  return linhas.filter((l): l is string => l !== null).join("\n");
}

export function decidirAviso(args: {
  repasse: Pick<Repasse, "situacao">;
  inscrito: InscritoDoRepasse | null;
  perfis: Perfil[];
}): { ok: true } | RecusaDoPainel {
  if (!validaRepasse(args.perfis)) return { ok: false, status: 403, erro: "Só quem valida marca aviso." };
  if (args.repasse.situacao !== "publicado") return { ok: false, status: 409, erro: "Só se avisa sobre carro publicado." };
  if (!args.inscrito) return { ok: false, status: 404, erro: "Inscrito não encontrado. A pessoa pode ter saído da lista." };
  return { ok: true };
}

export function decidirMarcacaoDeInscrito(args: {
  inscrito: InscritoDoRepasse;
  corpo: unknown;
  perfis: Perfil[];
  autorId: string;
  agora: Date;
}): { ok: true; colunas: { cnpj_conferido_em: string | null; cnpj_conferido_por: string | null } } | RecusaDoPainel {
  if (!validaRepasse(args.perfis)) return { ok: false, status: 403, erro: "Só quem valida mexe na lista do repasse." };
  const corpo = args.corpo as { cnpj_conferido?: unknown } | null;
  if (!corpo || typeof corpo !== "object" || typeof corpo.cnpj_conferido !== "boolean") {
    return { ok: false, status: 400, erro: "Diga se o CNPJ foi conferido." };
  }
  if (args.inscrito.trilha !== "lojista") return { ok: false, status: 409, erro: "Só lojista tem CNPJ para conferir." };
  return corpo.cnpj_conferido
    ? { ok: true, colunas: { cnpj_conferido_em: args.agora.toISOString(), cnpj_conferido_por: args.autorId } }
    : { ok: true, colunas: { cnpj_conferido_em: null, cnpj_conferido_por: null } };
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/avisos-do-repasse.test.ts`
Expected: PASS. Se "traz o carro, a conta…" reprovar em `71.200 km`, conferir que o Node do projeto formata `toLocaleString("pt-BR")` com ponto (o CI roda Node com ICU completo; o teste do PR 1 já depende disso para preço).

- [ ] **Step 5: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Trocar `"Entrou no Repasse Motors um carro que combina com o que você procura"` por `"Olha o carro que não girou no pátio"` → "não usa termo que o repasse não usa" reprova.
2. Em `inscritosQueCombinam`, trocar `soParaLojistas(r) ? [] :` por nada (sempre filtra consumidores) → "só lojistas: só o lojista com CNPJ conferido" reprova.
3. Tirar `&& i.cnpj_conferido_em` do filtro de lojistas → o mesmo teste reprova.

- [ ] **Step 6: Commit**

```bash
git add src/lib/avisosDoRepasse.ts tests/avisos-do-repasse.test.ts
git commit -m "feat(repasse): quem da lista combina com o carro e a mensagem pronta para o Chatwoot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Rotas de criar e editar — Sonnet

**Files:**
- Create: `src/lib/repasseDoPainel.ts`
- Create: `src/lib/rotaDoRepasse.ts`
- Create: `src/app/api/repasses/route.ts`
- Create: `src/app/api/repasses/[id]/route.ts`
- Create: `tests/bancoDoRepasseDeTeste.ts`
- Modify: `tests/repasseDeTeste.ts` (acrescentar `linhaDoBancoDeTeste`)
- Test: `tests/rotas-do-repasse-cadastro.test.ts`

**Interfaces:**
- Consumes: `repasseDaLinha` (`src/lib/leituraDosRepasses.ts`, PR 1); `RepasseDoPainel`, `ehIdDeRepasse` (Task 1); `decidirCriacao`, `decidirEdicao`, `RecusaDoPainel` (Task 3); `createServerSupabaseClient`, `createAdminSupabaseClient` (`src/lib/supabase-server.ts`); `registrarAcaoSensivel`; `ehStaff`, `perfisDe`, `Perfil`; `papelPadraoPorEmail`; `ehTabelaOuColunaAusente`, `mensagemDeMigracaoPendente`.
- Produces:
  - `repasseDoPainelDaLinha(linha: Record<string, unknown>): RepasseDoPainel | null` (`src/lib/repasseDoPainel.ts`).
  - Em `src/lib/rotaDoRepasse.ts`: `sessaoDoRepasse(): Promise<{ ok: true; autor: { id: string; nome: string | null }; perfis: Perfil[] } | { ok: false; resposta: NextResponse }>`; `lerRepasseParaEscrita(admin: SupabaseClient, id: string): Promise<{ ok: true; repasse: RepasseDoPainel } | { ok: false; resposta: NextResponse }>`; `recusar(r: RecusaDoPainel): NextResponse`; `falhaDoBanco(erro: { message: string; code?: string }): NextResponse`; `MIGRACAO_DO_REPASSE`.
  - `POST /api/repasses` → 201 `{ id, slug }`.
  - `PATCH /api/repasses/[id]` → 200 `{ ok: true, repasse: RepasseDoPainel }`.
  - Dublê de teste: `bancoDeTeste()`, `sessaoDeTeste(banco, papeis, usuario?)`, `type Banco`, `type Escrita`.
  - `linhaDoBancoDeTeste(parcial?)` em `tests/repasseDeTeste.ts`.

- [ ] **Step 1: O dublê do banco**

`tests/bancoDoRepasseDeTeste.ts`:

```ts
import { vi } from "vitest";

/**
 * Dublê do supabase-js para as rotas e páginas do repasse — no molde do de
 * `tests/funil-config-rota.test.ts`, com o que as rotas do repasse usam.
 *
 * `leituras[tabela]` responde a qualquer select daquela tabela. Toda escrita
 * (insert, update, delete, upsert) entra em `escritas`, com os filtros `eq`
 * e `is` encadeados depois dela, e é respondida por `responderEscrita`. O
 * padrão para `update` devolve a linha lida com os valores novos por cima —
 * é o que o `.select("*").maybeSingle()` da rota recebe quando a corrida
 * não aconteceu.
 */
export interface Resposta {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface Escrita {
  tabela: string;
  operacao: "insert" | "update" | "delete" | "upsert";
  valores?: unknown;
  opcoes?: unknown;
  filtros: Array<[string, unknown]>;
}

export function bancoDeTeste() {
  const leituras: Record<string, Resposta> = {};
  const escritas: Escrita[] = [];
  const lidas: string[] = [];

  const padrao = (e: Escrita): Resposta =>
    e.operacao === "update"
      ? { data: { ...((leituras[e.tabela]?.data as object | null) ?? {}), ...(e.valores as object) }, error: null }
      : { data: null, error: null };
  let responder: (e: Escrita) => Resposta = padrao;

  function consulta(tabela: string, escrita: Escrita | null) {
    const resolver = (): Resposta => (escrita ? responder(escrita) : (leituras[tabela] ?? { data: null, error: null }));
    const q: Record<string, unknown> = {};
    const encadeia =
      (nome: string) =>
      (...args: unknown[]) => {
        if (escrita && (nome === "eq" || nome === "is")) escrita.filtros.push([String(args[0]), args[1]]);
        return q;
      };
    for (const nome of ["select", "eq", "is", "in", "order", "limit"]) q[nome] = encadeia(nome);
    q.single = async () => resolver();
    q.maybeSingle = async () => resolver();
    q.then = (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, falha);
    return q;
  }

  const from = vi.fn((tabela: string) => {
    lidas.push(tabela);
    const escrever =
      (operacao: Escrita["operacao"]) =>
      (valores?: unknown, opcoes?: unknown) => {
        const e: Escrita = { tabela, operacao, valores, opcoes, filtros: [] };
        escritas.push(e);
        return consulta(tabela, e);
      };
    return {
      ...consulta(tabela, null),
      insert: escrever("insert"),
      update: escrever("update"),
      delete: escrever("delete"),
      upsert: escrever("upsert"),
    };
  });

  return {
    cliente: { from },
    leituras,
    escritas,
    /** Tabelas que alguém abriu com `from`, na ordem. */
    lidas,
    responderEscrita(fn: (e: Escrita) => Resposta) {
      responder = fn;
    },
    /** Escritas numa tabela, fora a auditoria. */
    escritasEm(tabela: string) {
      return escritas.filter((e) => e.tabela === tabela);
    },
    auditoria() {
      return escritas
        .filter((e) => e.tabela === "auditoria_admin")
        .map((e) => e.valores as { acao: string; detalhe: string });
    },
  };
}

export type Banco = ReturnType<typeof bancoDeTeste>;

/**
 * O cliente de SESSÃO: `auth.getUser` e as leituras. Usa o mesmo banco do
 * admin — nos testes, o que importa é quem pede e o que a rota escreve.
 */
export function sessaoDeTeste(
  banco: Banco,
  papeis: string[] | null,
  usuario: { id: string; email: string } | null = { id: "u-1", email: "equipe@motors.test" },
) {
  banco.leituras.profiles = {
    data: papeis ? { role: papeis[0] ?? null, papeis, full_name: "Pessoa da Equipe" } : null,
    error: null,
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: usuario } })) },
    from: banco.cliente.from,
  };
}
```

Em `tests/repasseDeTeste.ts`, no fim:

```ts
/** A linha como o banco devolve: o repasse de teste + as colunas internas. */
export function linhaDoBancoDeTeste(parcial: Partial<Repasse> = {}): Record<string, unknown> {
  return {
    criado_por: "u-0",
    enviado_em: null,
    validado_por: null,
    validado_em: null,
    devolvido_com: null,
    updated_at: "2026-09-24T12:00:00Z",
    ...repasseDeTeste(parcial),
  };
}
```

- [ ] **Step 2: Escrever os testes que falham**

`tests/rotas-do-repasse-cadastro.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { fotoDeTeste, linhaDoBancoDeTeste } from "./repasseDeTeste";

/**
 * As rotas que criam e editam um carro de repasse, EXECUTADAS contra um
 * dublê do banco. Provam a fiação que só a rota tem: que o portão puro roda
 * antes de qualquer escrita, que a escrita é com a chave de serviço e presa à
 * situação lida (corrida vira 409), e que toda escrita deixa auditoria.
 */
let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));

const { POST } = await import("../src/app/api/repasses/route");
const { PATCH } = await import("../src/app/api/repasses/[id]/route");

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const MINIMO = { marca: "Renault", modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021, quilometragem: 71200, preco: 36900 };
const pedido = (corpo: unknown, method = "POST") =>
  new Request("http://teste/api/repasses", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const comId = (id = ID) => ({ params: Promise.resolve({ id }) });

function entrarComo(papeis: string[] | null, usuario?: { id: string; email: string } | null) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis, usuario);
}

beforeEach(() => entrarComo(["comercial"]));

describe("POST /api/repasses", () => {
  it("sem login: 401 e nada escrito", async () => {
    entrarComo(["comercial"], null);
    const res = await POST(pedido(MINIMO));
    expect(res.status).toBe(401);
    expect(banco.escritas).toEqual([]);
  });

  it("quem não é da equipe: 403", async () => {
    entrarComo(["cliente"]);
    expect((await POST(pedido(MINIMO))).status).toBe(403);
    expect(banco.escritas).toEqual([]);
  });

  it("marketing cria o rascunho, com dono, slug e auditoria", async () => {
    entrarComo(["marketing"]);
    const res = await POST(pedido(MINIMO));
    expect(res.status).toBe(201);
    const corpo = await res.json();
    const [insert] = banco.escritasEm("repasses");
    expect(insert.operacao).toBe("insert");
    expect(insert.valores).toMatchObject({ situacao: "rascunho", criado_por: "u-1", preco: 36900, id: corpo.id, slug: corpo.slug });
    expect(corpo.slug).toMatch(/^renault-kwid-zen-1-0-2021-[0-9a-f]{6}$/);
    expect(banco.auditoria()[0].acao).toBe("repasse.criar");
  });

  it("a situação não entra pela criação", async () => {
    const res = await POST(pedido({ ...MINIMO, situacao: "publicado" }));
    expect(res.status).toBe(400);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("tabela que não existe: 503 com o nome da migração", async () => {
    banco.responderEscrita(() => ({ data: null, error: { message: "sem tabela", code: "PGRST205" } }));
    const res = await POST(pedido(MINIMO));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("20260924180000_repasse_fundacao.sql");
  });
});

describe("PATCH /api/repasses/[id]", () => {
  it("id que não é uuid: 404 sem ir ao banco de repasses", async () => {
    const res = await PATCH(pedido({ preco: 1 }, "PATCH"), comId("123"));
    expect(res.status).toBe(404);
    expect(banco.lidas).not.toContain("repasses");
  });

  it("carro que não existe: 404", async () => {
    banco.leituras.repasses = { data: null, error: null };
    expect((await PATCH(pedido({ preco: 1 }, "PATCH"), comId())).status).toBe(404);
  });

  it("marketing edita o rascunho: update preso ao id e à situação, com auditoria", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    const res = await PATCH(pedido({ preco: 35000 }, "PATCH"), comId());
    expect(res.status).toBe(200);
    const [update] = banco.escritasEm("repasses");
    expect(update.valores).toEqual({ preco: 35000 });
    expect(update.filtros).toEqual([
      ["id", ID],
      ["situacao", "rascunho"],
    ]);
    expect((await res.json()).repasse.preco).toBe(35000);
    expect(banco.auditoria()[0].acao).toBe("repasse.editar");
  });

  it("marketing não edita o publicado", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" }), error: null };
    expect((await PATCH(pedido({ preco: 35000 }, "PATCH"), comId())).status).toBe(403);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("o publicado não fica incompleto: 422", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" }), error: null };
    const res = await PATCH(pedido({ resumo: "" }, "PATCH"), comId());
    expect(res.status).toBe(422);
    expect((await res.json()).problemas).toContain("Escreva a linha do card.");
  });

  it("corrida: a situação mudou entre ler e gravar → 409", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    banco.responderEscrita((e) => (e.tabela === "repasses" ? { data: null, error: null } : { data: null, error: null }));
    expect((await PATCH(pedido({ preco: 35000 }, "PATCH"), comId())).status).toBe(409);
    expect(banco.auditoria()).toEqual([]);
  });

  it("a galeria grava as fotos e o url_imagem fica de fora", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    const web = ["a", "b", "c", "d"].map((l) => fotoDeTeste(l));
    const zap = ["a", "b", "c", "d"].map((l) => fotoDeTeste(l, "zap"));
    const res = await PATCH(pedido({ web_full_images: web, whatsapp_images: zap, url_imagem: zap[0] }, "PATCH"), comId());
    expect(res.status).toBe(200);
    expect(banco.escritasEm("repasses")[0].valores).toEqual({ web_full_images: web, whatsapp_images: zap });
  });

  it("corpo sem mudança: 200 sem escrever", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    expect((await PATCH(pedido({}, "PATCH"), comId())).status).toBe(200);
    expect(banco.escritas).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/rotas-do-repasse-cadastro.test.ts`
Expected: FAIL — as rotas não existem.

- [ ] **Step 4: Implementar a leitura do painel**

`src/lib/repasseDoPainel.ts`:

```ts
/**
 * A linha inteira de `repasses`, como o PAINEL a lê: as colunas públicas
 * (pelo mesmo `repasseDaLinha` da leitura anônima) e as internas — quem
 * criou, quem validou, a nota da devolução.
 *
 * Só servidor: importa `leituraDosRepasses.ts`, que carrega o cliente anon.
 * Client component recebe o `RepasseDoPainel` já lido, por prop, e importa só
 * o TIPO (de `repasse.ts`).
 */
import { repasseDaLinha } from "./leituraDosRepasses";
import type { RepasseDoPainel } from "./repasse";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function repasseDoPainelDaLinha(linha: Record<string, unknown>): RepasseDoPainel | null {
  const base = repasseDaLinha(linha);
  if (!base) return null;
  return {
    ...base,
    criado_por: texto(linha.criado_por),
    enviado_em: texto(linha.enviado_em),
    validado_por: texto(linha.validado_por),
    validado_em: texto(linha.validado_em),
    devolvido_com: texto(linha.devolvido_com),
    updated_at: texto(linha.updated_at),
  };
}
```

- [ ] **Step 5: Implementar os ajudantes das rotas**

`src/lib/rotaDoRepasse.ts`:

```ts
/**
 * O que toda rota do repasse faz antes e depois do portão puro — só servidor.
 *
 * Quem pede é lido com a SESSÃO; quem grava é a chave de serviço, porque
 * `authenticated` não escreve nas tabelas do repasse desde
 * 20260924200000_repasse_escrita_pela_rota.sql. Por isso a identificação
 * aqui é a porta inteira: sem sessão, 401; sem papel de painel, 403.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "./erroDeSchema";
import type { RecusaDoPainel } from "./edicaoDoRepasse";
import { papelPadraoPorEmail } from "./papelPadrao";
import { ehStaff, perfisDe, type Perfil } from "./permissoes";
import { ehIdDeRepasse, type RepasseDoPainel } from "./repasse";
import { repasseDoPainelDaLinha } from "./repasseDoPainel";
import { createServerSupabaseClient } from "./supabase-server";

export const MIGRACAO_DO_REPASSE = "20260924180000_repasse_fundacao.sql";

export type SessaoDoRepasse =
  | { ok: true; autor: { id: string; nome: string | null }; perfis: Perfil[] }
  | { ok: false; resposta: NextResponse };

export async function sessaoDoRepasse(): Promise<SessaoDoRepasse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, resposta: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role, papeis, full_name").eq("id", user.id).single();
  // Sem linha em `profiles`, vale o papel padrão por e-mail — mesma regra do layout.
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) {
    return { ok: false, resposta: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  const nome = (profile as { full_name?: string | null } | null)?.full_name ?? user.email ?? null;
  return { ok: true, autor: { id: user.id, nome }, perfis: perfisDe(origem) };
}

export function recusar(r: RecusaDoPainel): NextResponse {
  return NextResponse.json({ error: r.erro, problemas: r.problemas ?? [] }, { status: r.status });
}

export function falhaDoBanco(erro: { message: string; code?: string }): NextResponse {
  if (ehTabelaOuColunaAusente(erro)) {
    return NextResponse.json({ error: mensagemDeMigracaoPendente(MIGRACAO_DO_REPASSE) }, { status: 503 });
  }
  return NextResponse.json({ error: erro.message }, { status: 500 });
}

const naoEncontrado = () => NextResponse.json({ error: "Carro de repasse não encontrado." }, { status: 404 });

export async function lerRepasseParaEscrita(
  admin: SupabaseClient,
  id: string,
): Promise<{ ok: true; repasse: RepasseDoPainel } | { ok: false; resposta: NextResponse }> {
  if (!ehIdDeRepasse(id)) return { ok: false, resposta: naoEncontrado() };
  const { data, error } = await admin.from("repasses").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, resposta: falhaDoBanco(error) };
  const repasse = data ? repasseDoPainelDaLinha(data as Record<string, unknown>) : null;
  if (!repasse) return { ok: false, resposta: naoEncontrado() };
  return { ok: true, repasse };
}
```

- [ ] **Step 6: Implementar as duas rotas**

`src/app/api/repasses/route.ts`:

```ts
import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../lib/auditoria";
import { decidirCriacao } from "../../../lib/edicaoDoRepasse";
import { falhaDoBanco, recusar, sessaoDoRepasse } from "../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Cria o rascunho de um carro de repasse (spec §5, "Criar e editar rascunho":
 * qualquer perfil). O id nasce aqui para o slug e a pasta das fotos
 * (`repasse/<id>/`) existirem desde o primeiro gravar.
 */
export async function POST(request: Request) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const corpo: unknown = await request.json().catch(() => null);
    const decisao = decidirCriacao({
      corpo,
      perfis: sessao.perfis,
      id: crypto.randomUUID(),
      autorId: sessao.autor.id,
      agora: new Date(),
    });
    if (!decisao.ok) return recusar(decisao);

    const admin = createAdminSupabaseClient();
    const { error } = await admin.from("repasses").insert(decisao.linha);
    if (error) return falhaDoBanco(error);

    const { linha } = decisao;
    await registrarAcaoSensivel(admin, "repasse.criar", `${linha.marca} ${linha.modelo} ${linha.ano_modelo} (${linha.id})`, sessao.autor);
    return NextResponse.json({ id: linha.id, slug: linha.slug }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao criar o rascunho." }, { status: 500 });
  }
}
```

`src/app/api/repasses/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../lib/auditoria";
import { decidirEdicao } from "../../../../lib/edicaoDoRepasse";
import { repasseDoPainelDaLinha } from "../../../../lib/repasseDoPainel";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Edita um carro de repasse. O portão (`decidirEdicao`) decide quem edita em
 * que situação e quais campos entram; a escrita é presa à situação LIDA —
 * se alguém publicou ou devolveu o carro no meio, o update não acha a linha
 * e a resposta é 409, em vez de gravar por cima de uma decisão que já mudou.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const admin = createAdminSupabaseClient();
    const lido = await lerRepasseParaEscrita(admin, id);
    if (!lido.ok) return lido.resposta;

    const corpo: unknown = await request.json().catch(() => null);
    const decisao = decidirEdicao({ repasse: lido.repasse, corpo, perfis: sessao.perfis, agora: new Date() });
    if (!decisao.ok) return recusar(decisao);
    const campos = Object.keys(decisao.colunas);
    if (campos.length === 0) return NextResponse.json({ ok: true, repasse: lido.repasse });

    const { data, error } = await admin
      .from("repasses")
      .update(decisao.colunas)
      .eq("id", id)
      .eq("situacao", lido.repasse.situacao)
      .select("*")
      .maybeSingle();
    if (error) return falhaDoBanco(error);
    const repasse = data ? repasseDoPainelDaLinha(data as Record<string, unknown>) : null;
    if (!repasse) {
      return NextResponse.json(
        { error: "O carro mudou de situação enquanto você editava. Recarregue a página." },
        { status: 409 },
      );
    }
    await registrarAcaoSensivel(admin, "repasse.editar", `${id}: ${campos.join(", ")}`, sessao.autor);
    return NextResponse.json({ ok: true, repasse });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao salvar." }, { status: 500 });
  }
}
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run tests/rotas-do-repasse-cadastro.test.ts`
Expected: PASS.

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Tirar `.eq("situacao", lido.repasse.situacao)` do PATCH → "update preso ao id e à situação" reprova.
2. Trocar `createAdminSupabaseClient()` do POST por `await (await import("../../../lib/supabase-server")).createServerSupabaseClient()` → no dublê isto ainda escreve; **não serve de prova**. A prova real é a do banco (Task 2, sabotagem S1). Anotar isso no relatório em vez de sabotar.
3. Mover a chamada `registrarAcaoSensivel` para antes do `if (!repasse)` no PATCH → "corrida … → 409" reprova (auditoria de algo que não aconteceu).

- [ ] **Step 9: Commit**

```bash
git add src/lib/repasseDoPainel.ts src/lib/rotaDoRepasse.ts "src/app/api/repasses/route.ts" "src/app/api/repasses/[id]/route.ts" tests/bancoDoRepasseDeTeste.ts tests/repasseDeTeste.ts tests/rotas-do-repasse-cadastro.test.ts
git commit -m "feat(repasse): rotas de criar e editar com portão puro, chave de serviço e auditoria

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Rotas de situação, aviso e lista — Sonnet

**Files:**
- Create: `src/app/api/repasses/[id]/transicao/route.ts`
- Create: `src/app/api/repasses/[id]/avisos/route.ts`
- Create: `src/app/api/repasse-inscritos/[id]/route.ts`
- Test: `tests/rotas-do-repasse-situacao.test.ts`

**Interfaces:**
- Consumes: `sessaoDoRepasse`, `lerRepasseParaEscrita`, `recusar`, `falhaDoBanco` (Task 6); `repasseDoPainelDaLinha` (Task 6); `decidirTransicao` (Task 4); `decidirAviso`, `decidirMarcacaoDeInscrito`, `inscritoDaLinha`, `COLUNAS_DO_INSCRITO` (Task 5); `validaRepasse` (Task 3); `ehIdDeRepasse` (Task 1); dublê (Task 6).
- Produces:
  - `POST /api/repasses/[id]/transicao` corpo `{ ato, nota? }` → 200 `{ ok: true, repasse }`.
  - `POST /api/repasses/[id]/avisos` corpo `{ inscritoId }` → 200 `{ ok: true }`.
  - `PATCH /api/repasse-inscritos/[id]` corpo `{ cnpj_conferido: boolean }` → 200 `{ ok: true, inscrito }`; `DELETE /api/repasse-inscritos/[id]` → 200 `{ ok: true }`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/rotas-do-repasse-situacao.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";

let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));

const transicao = (await import("../src/app/api/repasses/[id]/transicao/route")).POST;
const avisar = (await import("../src/app/api/repasses/[id]/avisos/route")).POST;
const inscritos = await import("../src/app/api/repasse-inscritos/[id]/route");

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const INSCRITO = "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const ISO = "2026-09-24T12:00:00Z";
const pedido = (corpo: unknown, method = "POST") =>
  new Request("http://teste/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const comId = (id = ID) => ({ params: Promise.resolve({ id }) });

const LINHA_DO_LOJISTA = {
  id: INSCRITO,
  trilha: "lojista",
  nome: "Auto Bom Ltda",
  whatsapp: "41999990000",
  faixa: null,
  carrocerias: [],
  cnpj: "12345678000190",
  loja_cidade: "Auto Bom, Curitiba",
  cnpj_conferido_em: null,
  created_at: ISO,
};

function entrarComo(papeis: string[]) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis);
}
beforeEach(() => entrarComo(["comercial"]));

describe("POST /api/repasses/[id]/transicao", () => {
  it("comercial publica só para lojistas: grava quem validou, preso à situação lida, com auditoria", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "em_validacao" }), error: null };
    const res = await transicao(pedido({ ato: "publicar_lojistas" }), comId());
    expect(res.status).toBe(200);
    const [update] = banco.escritasEm("repasses");
    expect(update.valores).toMatchObject({ situacao: "publicado", validado_por: "u-1", aberto_ao_publico_em: null });
    expect(update.filtros).toEqual([
      ["id", ID],
      ["situacao", "em_validacao"],
    ]);
    expect((await res.json()).repasse.situacao).toBe("publicado");
    expect(banco.auditoria()[0]).toMatchObject({ acao: "repasse.publicar_lojistas" });
  });

  it("marketing não publica: 403 e nada escrito", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "em_validacao" }), error: null };
    expect((await transicao(pedido({ ato: "publicar_todos" }), comId())).status).toBe(403);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("ato desconhecido: 400", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    expect((await transicao(pedido({ ato: "publicar" }), comId())).status).toBe(400);
  });

  it("incompleto: 422 com a lista do que falta", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ resumo: null }), error: null };
    const res = await transicao(pedido({ ato: "enviar" }), comId());
    expect(res.status).toBe(422);
    expect((await res.json()).problemas).toContain("Escreva a linha do card.");
  });

  it("corrida: 409 e nenhuma auditoria", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "em_validacao" }), error: null };
    banco.responderEscrita(() => ({ data: null, error: null }));
    expect((await transicao(pedido({ ato: "publicar_lojistas" }), comId())).status).toBe(409);
    expect(banco.auditoria()).toEqual([]);
  });
});

describe("POST /api/repasses/[id]/avisos", () => {
  const PUBLICADO = linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: ISO });

  it("comercial marca o aviso: upsert idempotente, auditoria sem nome nem WhatsApp", async () => {
    banco.leituras.repasses = { data: PUBLICADO, error: null };
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    const res = await avisar(pedido({ inscritoId: INSCRITO }), comId());
    expect(res.status).toBe(200);
    const [upsert] = banco.escritasEm("repasse_avisos");
    expect(upsert.operacao).toBe("upsert");
    expect(upsert.valores).toEqual({ repasse_id: ID, inscrito_id: INSCRITO, avisado_por: "u-1" });
    expect(upsert.opcoes).toMatchObject({ onConflict: "repasse_id,inscrito_id", ignoreDuplicates: true });
    const { detalhe } = banco.auditoria()[0];
    expect(detalhe).not.toContain("Auto Bom");
    expect(detalhe).not.toContain("41999990000");
  });

  it("marketing: 403", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: PUBLICADO, error: null };
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    expect((await avisar(pedido({ inscritoId: INSCRITO }), comId())).status).toBe(403);
    expect(banco.escritasEm("repasse_avisos")).toEqual([]);
  });

  it("carro em rascunho: 409", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    expect((await avisar(pedido({ inscritoId: INSCRITO }), comId())).status).toBe(409);
  });

  it("inscrito que saiu da lista: 404", async () => {
    banco.leituras.repasses = { data: PUBLICADO, error: null };
    banco.leituras.repasse_inscritos = { data: null, error: null };
    expect((await avisar(pedido({ inscritoId: INSCRITO }), comId())).status).toBe(404);
  });
});

describe("/api/repasse-inscritos/[id]", () => {
  it("comercial confere o CNPJ do lojista", async () => {
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    const res = await inscritos.PATCH(pedido({ cnpj_conferido: true }, "PATCH"), comId(INSCRITO));
    expect(res.status).toBe(200);
    expect(banco.escritasEm("repasse_inscritos")[0].valores).toMatchObject({ cnpj_conferido_por: "u-1" });
  });

  it("consumidor não tem CNPJ: 409", async () => {
    banco.leituras.repasse_inscritos = { data: { ...LINHA_DO_LOJISTA, trilha: "consumidor", cnpj: null, faixa: "30-50" }, error: null };
    expect((await inscritos.PATCH(pedido({ cnpj_conferido: true }, "PATCH"), comId(INSCRITO))).status).toBe(409);
  });

  it("marketing não mexe na lista", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    expect((await inscritos.PATCH(pedido({ cnpj_conferido: true }, "PATCH"), comId(INSCRITO))).status).toBe(403);
    expect((await inscritos.DELETE(pedido(null, "DELETE"), comId(INSCRITO))).status).toBe(403);
    expect(banco.escritasEm("repasse_inscritos")).toEqual([]);
  });

  it("tirar da lista apaga a linha, e a auditoria não guarda quem era", async () => {
    banco.responderEscrita((e) => (e.operacao === "delete" ? { data: [{ id: INSCRITO }], error: null } : { data: null, error: null }));
    const res = await inscritos.DELETE(pedido(null, "DELETE"), comId(INSCRITO));
    expect(res.status).toBe(200);
    const [apagar] = banco.escritasEm("repasse_inscritos");
    expect(apagar.operacao).toBe("delete");
    expect(apagar.filtros).toEqual([["id", INSCRITO]]);
    // `registrarAcaoSensivel` grava também autor_id e autor_nome — por isso
    // toMatchObject; o que importa é o detalhe ser só o id.
    expect(banco.auditoria()[0]).toMatchObject({ acao: "repasse.inscrito.remover", detalhe: INSCRITO });
  });

  it("apagar quem já não está: 404", async () => {
    banco.responderEscrita(() => ({ data: [], error: null }));
    expect((await inscritos.DELETE(pedido(null, "DELETE"), comId(INSCRITO))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/rotas-do-repasse-situacao.test.ts`
Expected: FAIL — as rotas não existem.

- [ ] **Step 3: Implementar a rota de transição**

`src/app/api/repasses/[id]/transicao/route.ts`:

```ts
import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../../lib/auditoria";
import { repasseDoPainelDaLinha } from "../../../../../lib/repasseDoPainel";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { decidirTransicao } from "../../../../../lib/transicoesDoRepasse";

export const dynamic = "force-dynamic";

/**
 * Muda a situação de um carro de repasse (spec §5). Quem pode, de onde para
 * onde e o que se grava é `decidirTransicao`; aqui só a fiação — ler, decidir,
 * gravar preso à situação lida, auditar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const admin = createAdminSupabaseClient();
    const lido = await lerRepasseParaEscrita(admin, id);
    if (!lido.ok) return lido.resposta;

    const corpo: unknown = await request.json().catch(() => null);
    const pedido = corpo && typeof corpo === "object" ? (corpo as { ato?: unknown; nota?: unknown }) : {};
    const decisao = decidirTransicao({
      repasse: lido.repasse,
      ato: pedido.ato,
      nota: pedido.nota,
      perfis: sessao.perfis,
      autorId: sessao.autor.id,
      agora: new Date(),
    });
    if (!decisao.ok) return recusar(decisao);

    const { data, error } = await admin
      .from("repasses")
      .update(decisao.colunas)
      .eq("id", id)
      .eq("situacao", lido.repasse.situacao)
      .select("*")
      .maybeSingle();
    if (error) return falhaDoBanco(error);
    const repasse = data ? repasseDoPainelDaLinha(data as Record<string, unknown>) : null;
    if (!repasse) {
      return NextResponse.json(
        { error: "O carro mudou de situação enquanto você decidia. Recarregue a página." },
        { status: 409 },
      );
    }
    const { marca, modelo, situacao } = lido.repasse;
    await registrarAcaoSensivel(
      admin,
      `repasse.${decisao.ato}`,
      `${marca} ${modelo} (${id}): ${situacao} → ${decisao.colunas.situacao}`,
      sessao.autor,
    );
    return NextResponse.json({ ok: true, repasse });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao mudar a situação." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implementar a rota do aviso**

`src/app/api/repasses/[id]/avisos/route.ts`:

```ts
import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../../lib/auditoria";
import {
  COLUNAS_DO_INSCRITO,
  decidirAviso,
  inscritoDaLinha,
  type InscritoDoRepasse,
} from "../../../../../lib/avisosDoRepasse";
import { ehIdDeRepasse } from "../../../../../lib/repasse";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Marca que alguém da lista foi avisado deste carro. O aviso em si é manual,
 * pelo Chatwoot (dono, 24/09); isto só evita avisar duas vezes. Idempotente:
 * marcar de novo não duplica (`unique (repasse_id, inscrito_id)`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const admin = createAdminSupabaseClient();
    const lido = await lerRepasseParaEscrita(admin, id);
    if (!lido.ok) return lido.resposta;

    const corpo = (await request.json().catch(() => null)) as { inscritoId?: unknown } | null;
    const inscritoId = typeof corpo?.inscritoId === "string" ? corpo.inscritoId : "";
    let inscrito: InscritoDoRepasse | null = null;
    if (ehIdDeRepasse(inscritoId)) {
      const { data, error } = await admin.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).eq("id", inscritoId).maybeSingle();
      if (error) return falhaDoBanco(error);
      inscrito = data ? inscritoDaLinha(data as Record<string, unknown>) : null;
    }
    const decisao = decidirAviso({ repasse: lido.repasse, inscrito, perfis: sessao.perfis });
    if (!decisao.ok) return recusar(decisao);

    const { error } = await admin
      .from("repasse_avisos")
      .upsert(
        { repasse_id: id, inscrito_id: inscritoId, avisado_por: sessao.autor.id },
        { onConflict: "repasse_id,inscrito_id", ignoreDuplicates: true },
      );
    if (error) return falhaDoBanco(error);
    // Sem nome nem WhatsApp: se a pessoa sair da lista, o log não a guarda.
    await registrarAcaoSensivel(admin, "repasse.avisar", `${id} → inscrito ${inscritoId}`, sessao.autor);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao marcar o aviso." }, { status: 500 });
  }
}
```

- [ ] **Step 5: Implementar a rota da lista**

`src/app/api/repasse-inscritos/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../lib/auditoria";
import { COLUNAS_DO_INSCRITO, decidirMarcacaoDeInscrito, inscritoDaLinha } from "../../../../lib/avisosDoRepasse";
import { validaRepasse } from "../../../../lib/edicaoDoRepasse";
import { ehIdDeRepasse } from "../../../../lib/repasse";
import { falhaDoBanco, recusar, sessaoDoRepasse } from "../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

const naoEncontrado = () => NextResponse.json({ error: "Inscrito não encontrado." }, { status: 404 });

/** Marca ou desmarca o CNPJ do lojista como conferido. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    if (!ehIdDeRepasse(id)) return naoEncontrado();
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).eq("id", id).maybeSingle();
    if (error) return falhaDoBanco(error);
    const inscrito = data ? inscritoDaLinha(data as Record<string, unknown>) : null;
    if (!inscrito) return naoEncontrado();

    const corpo: unknown = await request.json().catch(() => null);
    const decisao = decidirMarcacaoDeInscrito({ inscrito, corpo, perfis: sessao.perfis, autorId: sessao.autor.id, agora: new Date() });
    if (!decisao.ok) return recusar(decisao);

    const gravado = await admin
      .from("repasse_inscritos")
      .update(decisao.colunas)
      .eq("id", id)
      .select(COLUNAS_DO_INSCRITO)
      .maybeSingle();
    if (gravado.error) return falhaDoBanco(gravado.error);
    await registrarAcaoSensivel(
      admin,
      "repasse.inscrito.conferir",
      `${id}: CNPJ ${decisao.colunas.cnpj_conferido_em ? "conferido" : "desmarcado"}`,
      sessao.autor,
    );
    const novo = gravado.data ? inscritoDaLinha(gravado.data as Record<string, unknown>) : null;
    return NextResponse.json({ ok: true, inscrito: novo ?? { ...inscrito, cnpj_conferido_em: decisao.colunas.cnpj_conferido_em } });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gravar." }, { status: 500 });
  }
}

/**
 * Tira a pessoa da lista APAGANDO a linha — é o que a /privacidade promete
 * (spec §4.2 e §7.4). Os avisos dela vão junto (`on delete cascade`). A
 * auditoria guarda só o id: nome e WhatsApp não sobrevivem à saída.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    if (!validaRepasse(sessao.perfis)) {
      return NextResponse.json({ error: "Só quem valida mexe na lista do repasse." }, { status: 403 });
    }
    const { id } = await params;
    if (!ehIdDeRepasse(id)) return naoEncontrado();
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("repasse_inscritos").delete().eq("id", id).select("id");
    if (error) return falhaDoBanco(error);
    if (!Array.isArray(data) || data.length === 0) return naoEncontrado();
    await registrarAcaoSensivel(admin, "repasse.inscrito.remover", id, sessao.autor);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao tirar da lista." }, { status: 500 });
  }
}
```

- [ ] **Step 6: Rodar**

Run: `npx vitest run tests/rotas-do-repasse-situacao.test.ts tests/rotas-do-repasse-cadastro.test.ts`
Expected: PASS.

- [ ] **Step 7: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. No DELETE, apagar o `if (!validaRepasse(sessao.perfis))` → "marketing não mexe na lista" reprova.
2. Na rota de aviso, trocar o detalhe por `` `${id} → ${inscrito?.nome}` `` → "auditoria sem nome nem WhatsApp" reprova.
3. Na transição, tirar `.eq("situacao", lido.repasse.situacao)` → "preso à situação lida" reprova.

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/repasses/[id]/transicao/route.ts" "src/app/api/repasses/[id]/avisos/route.ts" "src/app/api/repasse-inscritos/[id]/route.ts" tests/rotas-do-repasse-situacao.test.ts
git commit -m "feat(repasse): rotas de situação, aviso e lista do repasse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A galeria grava no repasse — Sonnet

**Files:**
- Create: `src/lib/destinoDasFotos.ts`
- Modify: `src/components/admin/GaleriaDeFotos.tsx`
- Test: `tests/galeria-do-repasse.test.ts`

**Interfaces:**
- Consumes: `caminhoDaFoto`, `caminhoDaFotoDoRepasse`, `VarianteDaFoto` (`src/lib/fotosDoVeiculo.ts`).
- Produces:
  - `interface DestinoDasFotos { caminho: (lote: string, variante: VarianteDaFoto) => string; gravarEm: string; avisoSemEdicao: string; reguaDoEstoque: boolean }`.
  - `destinoDoRepasse(repasseId: string): DestinoDasFotos`.
  - `GaleriaDeFotos` aceita `destino?: DestinoDasFotos`; sem ela, tudo como hoje (estoque).

- [ ] **Step 1: Escrever o teste que falha**

`tests/galeria-do-repasse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GaleriaDeFotos from "../src/components/admin/GaleriaDeFotos";
import { destinoDoRepasse } from "../src/lib/destinoDasFotos";
import { MINIMO_DE_FOTOS } from "../src/lib/coerenciaDoCadastro";

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";

describe("o destino das fotos do repasse", () => {
  it("grava na pasta do repasse e na rota do repasse", () => {
    const d = destinoDoRepasse(ID);
    expect(d.caminho("abc-123", "web")).toBe(`repasse/${ID}/abc-123-web.webp`);
    expect(d.caminho("abc-123", "zap")).toBe(`repasse/${ID}/abc-123-zap.jpg`);
    expect(d.gravarEm).toBe(`/api/repasses/${ID}`);
    expect(d.reguaDoEstoque).toBe(false);
  });
});

describe("a galeria com o destino do repasse", () => {
  const desenhar = (podeEditar: boolean) =>
    renderToStaticMarkup(
      createElement(GaleriaDeFotos, {
        estoqueId: ID,
        fotos: [],
        origem: "painel",
        podeEditar,
        aoGravar: () => {},
        destino: destinoDoRepasse(ID),
      }),
    );

  it("não fala da vitrine do estoque", () => {
    const html = desenhar(true);
    expect(html).not.toContain(`Faltam ${MINIMO_DE_FOTOS} de ${MINIMO_DE_FOTOS}`);
    expect(html).not.toContain("para este veículo aparecer na vitrine");
    expect(html).toContain("Enviar fotos");
  });

  it("sem edição, o aviso é o do repasse, não o da matriz do estoque", () => {
    const html = desenhar(false);
    expect(html).toContain("só quem valida muda as fotos");
    expect(html).not.toContain("matriz A17");
  });

  it("sem destino, a galeria continua a do estoque", () => {
    const html = renderToStaticMarkup(
      createElement(GaleriaDeFotos, { estoqueId: 900000001, fotos: [], origem: "painel", podeEditar: false, aoGravar: () => {} }),
    );
    expect(html).toContain(`Faltam ${MINIMO_DE_FOTOS} de ${MINIMO_DE_FOTOS}`);
    expect(html).toContain("Seu perfil vê as fotos e não as altera");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/galeria-do-repasse.test.ts`
Expected: FAIL — `destinoDasFotos` não existe.

- [ ] **Step 3: Implementar o destino**

`src/lib/destinoDasFotos.ts`:

```ts
/**
 * Para onde a `GaleriaDeFotos` manda os arquivos e a lista gravada.
 *
 * A galeria nasceu do estoque (caminho por id numérico, PATCH em
 * `/api/estoque/<id>`, régua de publicação da vitrine). O repasse reusa o
 * envio, a ordem e a faxina do bucket, mas grava na própria pasta, na
 * própria rota, e não mostra a régua da vitrine — o editor do repasse tem o
 * checklist dele. O destino do estoque mora dentro da galeria, que é quem o
 * conhece; este arquivo só traz o do repasse.
 */
import { caminhoDaFotoDoRepasse, type VarianteDaFoto } from "./fotosDoVeiculo";

export interface DestinoDasFotos {
  caminho: (lote: string, variante: VarianteDaFoto) => string;
  /** URL que recebe o PATCH com as colunas das fotos. */
  gravarEm: string;
  /** O que a galeria diz a quem só vê. */
  avisoSemEdicao: string;
  /** Mostrar a régua "Faltam N para aparecer na vitrine"? Só no estoque. */
  reguaDoEstoque: boolean;
}

export function destinoDoRepasse(repasseId: string): DestinoDasFotos {
  return {
    caminho: (lote, variante) => caminhoDaFotoDoRepasse(repasseId, lote, variante),
    gravarEm: `/api/repasses/${repasseId}`,
    avisoSemEdicao:
      "Seu perfil vê as fotos e não as altera: fora do rascunho, só quem valida muda as fotos de um carro de repasse.",
    reguaDoEstoque: false,
  };
}
```

- [ ] **Step 4: Ligar o destino na galeria**

Em `src/components/admin/GaleriaDeFotos.tsx`:

1. Imports: acrescentar `import type { DestinoDasFotos } from "../../lib/destinoDasFotos";`.
2. Antes de `export default function GaleriaDeFotos`, acrescentar:
   ```ts
   /**
    * O destino padrão: o estoque. Mora aqui porque é a galeria que o conhece
    * (e `tests/fotos-do-veiculo` lê este arquivo atrás do endpoint do estoque).
    */
   function destinoDoEstoque(estoqueId: number | string): DestinoDasFotos {
     return {
       caminho: (lote, variante) => caminhoDaFoto(estoqueId, lote, variante),
       gravarEm: `/api/estoque/${estoqueId}`,
       avisoSemEdicao:
         "Seu perfil vê as fotos e não as altera. Adicionar e reordenar foto é de Marketing, Comercial e Admin (matriz A17).",
       reguaDoEstoque: true,
     };
   }
   ```
3. Nas props, depois de `aoGravar`, acrescentar ao destructuring `destino,` e ao tipo:
   ```ts
     /**
      * Para onde vão os arquivos e a gravação. Sem ele, o estoque. O repasse
      * passa `destinoDoRepasse(id)` (src/lib/destinoDasFotos.ts).
      */
     destino?: DestinoDasFotos;
   ```
4. Logo depois dos `useState`/`useRef` do começo do componente: `const alvo = destino ?? destinoDoEstoque(estoqueId);`
5. Em `gravar`: trocar `` fetch(`/api/estoque/${estoqueId}`, `` por `fetch(alvo.gravarEm, ` e a lista de dependências `[estoqueId, aoGravar]` por `[alvo.gravarEm, aoGravar]`.
6. No envio: trocar `web: caminhoDaFoto(estoqueId, lote, "web"),` e `zap: caminhoDaFoto(estoqueId, lote, "zap"),` por `web: alvo.caminho(lote, "web"),` e `zap: alvo.caminho(lote, "zap"),`.
7. Envolver o `<div className={`mb-4 border-l-[3px] px-3 py-2.5 …`}>` da régua (o bloco "Faltam {faltam} de …") em `{alvo.reguaDoEstoque && ( … )}`.
8. No aviso de baixo (`{!podeEditar && ( … )}` do fim), trocar o texto fixo do `<p>` por `{alvo.avisoSemEdicao}`.

Não mexer em `importarDoFeed` (continua em `/api/estoque/${estoqueId}/fotos-do-feed`): o repasse passa `origem="painel"`, e o bloco do feed não aparece.

- [ ] **Step 5: Rodar o arquivo novo e os dois que já leem a galeria**

Run: `npx vitest run tests/galeria-do-repasse.test.ts tests/fotos-do-veiculo.test.ts tests/fotos-do-feed.test.ts`
Expected: PASS. `tests/fotos-do-veiculo.test.ts` procura no fonte `"/api/estoque/"`, `'method: "PATCH"'`, `"body: JSON.stringify(colunas)"` e `"Seu perfil vê as fotos e não as altera"` — todos continuam no arquivo (no `destinoDoEstoque` e no `gravar`). Se algum reprovar, a correção é na galeria, não no teste antigo.

- [ ] **Step 6: Provar a trava com o bug real**

Trocar `reguaDoEstoque: false` por `true` em `destinoDoRepasse` → "não fala da vitrine do estoque" reprova. Desfazer.

- [ ] **Step 7: Commit**

```bash
git add src/lib/destinoDasFotos.ts src/components/admin/GaleriaDeFotos.tsx tests/galeria-do-repasse.test.ts
git commit -m "feat(repasse): a galeria de fotos grava na pasta e na rota do repasse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Peças do editor — ficha de estado, FIPE e botões de ato — Sonnet

**Files:**
- Create: `src/lib/fichaDeEstado.ts`
- Create: `src/components/admin/repasse/FichaDeEstadoNoEditor.tsx`
- Create: `src/components/admin/repasse/ConsultaFipeDoRepasse.tsx`
- Create: `src/components/admin/repasse/AcoesDoRepasse.tsx`
- Test: `tests/pecas-do-editor-do-repasse.test.ts`

**Interfaces:**
- Consumes: `ItemDeEstado`, `Repasse`, `RepasseDoPainel`, `contaDoRepasse`, `emReais` (`repasse.ts`); `BUCKET_DE_FOTOS`, `caminhoDaFotoDoRepasse`, `novoLote`, `validarFoto`; `processarFotoDeVeiculo`; `createBrowserSupabaseClient`; `listarMarcas`, `listarModelos`, `listarAnos`, `consultarValor`, `Buscar`, `OpcaoFipe`, `ValorFipe` (`consultaFipe.ts`); `atosPossiveis`, `REGRAS_DOS_ATOS`, `AtoDoRepasse` (Task 4); `useConfirm`, `ConfirmProvider`.
- Produces:
  - `ITEM_VAZIO: ItemDeEstado`, `comItem(itens, indice, parcial): ItemDeEstado[]`, `semItem(itens, indice): ItemDeEstado[]` (`src/lib/fichaDeEstado.ts`).
  - `<FichaDeEstadoNoEditor repasseId itens semDefeitos oficina orcamentoEm podeEditar aoMudar />` — `aoMudar(parcial: Partial<Pick<Repasse, "itens_de_estado" | "sem_defeitos_conhecidos" | "oficina_do_orcamento" | "orcamento_em">>)`.
  - `<ConsultaFipeDoRepasse podeEditar aoEscolher buscar? />` — `aoEscolher(valor: ValorFipe)`.
  - `<AcoesDoRepasse repasse perfis alterado aoMudar />` — `repasse: Pick<Repasse, "id" | "situacao" | "aberto_ao_publico_em">`, `aoMudar(novo: RepasseDoPainel)`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/pecas-do-editor-do-repasse.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmProvider } from "../src/components/admin/ConfirmDialog";
import AcoesDoRepasse from "../src/components/admin/repasse/AcoesDoRepasse";
import ConsultaFipeDoRepasse from "../src/components/admin/repasse/ConsultaFipeDoRepasse";
import FichaDeEstadoNoEditor from "../src/components/admin/repasse/FichaDeEstadoNoEditor";
import { FIPE_BASE, type Buscar } from "../src/lib/consultaFipe";
import { ITEM_VAZIO, comItem, semItem } from "../src/lib/fichaDeEstado";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * As três peças do editor do repasse, no molde de
 * `tests/curadoria-de-destaques.test.ts` (createRoot + act, DOM cru).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function montar(elemento: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(ConfirmProvider, null, elemento)));
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

const botoes = () => [...container.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? "");
const botao = (texto: string) => {
  const b = [...container.querySelectorAll("button")].find((x) => x.textContent?.trim() === texto);
  expect(b, `a tela precisa ter o botão "${texto}"`).toBeDefined();
  return b as HTMLButtonElement;
};

function mudar(el: HTMLInputElement | HTMLSelectElement, valor: string, evento: "input" | "change") {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event(evento, { bubbles: true }));
}

describe("fichaDeEstado", () => {
  it("troca e tira um item sem mexer nos outros", () => {
    const itens = [ITEM_VAZIO, { ...ITEM_VAZIO, descricao: "Farol" }];
    expect(comItem(itens, 0, { descricao: "Risco" })[0].descricao).toBe("Risco");
    expect(comItem(itens, 0, { descricao: "Risco" })[1]).toBe(itens[1]);
    expect(semItem(itens, 0)).toEqual([itens[1]]);
  });
});

describe("AcoesDoRepasse", () => {
  const RASCUNHO = repasseDeTeste();

  it("marketing no rascunho vê só o envio", async () => {
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["marketing"], alterado: false, aoMudar: () => {} }));
    expect(botoes()).toEqual(["Enviar para validação"]);
  });

  it("enviar chama a rota com o ato e entrega o carro novo", async () => {
    const novo = { ...RASCUNHO, situacao: "em_validacao" };
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ ok: true, repasse: novo }), { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    const aoMudar = vi.fn();
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["marketing"], alterado: false, aoMudar }));
    await act(async () => botao("Enviar para validação").click());
    expect(fetchFalso).toHaveBeenCalledWith(
      `/api/repasses/${RASCUNHO.id}/transicao`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ato: "enviar" }) }),
    );
    expect(aoMudar).toHaveBeenCalledWith(novo);
  });

  it("422 mostra o que falta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "O carro ainda não está completo.", problemas: ["Escreva a linha do card."] }), { status: 422 })));
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["marketing"], alterado: false, aoMudar: () => {} }));
    await act(async () => botao("Enviar para validação").click());
    expect(container.textContent).toContain("Escreva a linha do card.");
  });

  it("com alteração não salva, os atos ficam travados", async () => {
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["marketing"], alterado: true, aoMudar: () => {} }));
    expect(botao("Enviar para validação").disabled).toBe(true);
    expect(container.textContent).toContain("Salve as alterações antes de mudar a situação.");
  });

  it("arquivar pede confirmação antes de chamar a rota", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["comercial"], alterado: false, aoMudar: () => {} }));
    await act(async () => botao("Arquivar").click());
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("devolver abre o campo da nota", async () => {
    const emValidacao = repasseDeTeste({ situacao: "em_validacao" });
    await montar(createElement(AcoesDoRepasse, { repasse: emValidacao, perfis: ["gestor"], alterado: false, aoMudar: () => {} }));
    await act(async () => botao("Devolver para rascunho").click());
    expect(container.querySelector("textarea")).not.toBeNull();
  });
});

describe("ConsultaFipeDoRepasse", () => {
  const RESPOSTAS: Record<string, unknown> = {
    [`${FIPE_BASE}/carros/marcas`]: [{ codigo: "48", nome: "Renault" }],
    [`${FIPE_BASE}/carros/marcas/48/modelos`]: { modelos: [{ codigo: 9000, nome: "Kwid Zen 1.0" }] },
    [`${FIPE_BASE}/carros/marcas/48/modelos/9000/anos`]: [{ codigo: "2021-1", nome: "2021 Gasolina" }],
    [`${FIPE_BASE}/carros/marcas/48/modelos/9000/anos/2021-1`]: {
      Valor: "R$ 42.100,00",
      CodigoFipe: "025258-0",
      MesReferencia: "setembro de 2026 ",
    },
  };
  const buscar: Buscar = async (url) => ({ ok: url in RESPOSTAS, json: async () => RESPOSTAS[url] });

  it("a cascata marca → modelo → ano entrega valor, código e mês", async () => {
    const aoEscolher = vi.fn();
    await montar(createElement(ConsultaFipeDoRepasse, { podeEditar: true, aoEscolher, buscar }));
    const [marca, modelo, ano] = [...container.querySelectorAll("select")];
    await act(async () => mudar(marca, "48", "change"));
    await act(async () => mudar(modelo, "9000", "change"));
    await act(async () => mudar(ano, "2021-1", "change"));
    expect(aoEscolher).toHaveBeenCalledWith({ valor: 42100, codigo: "025258-0", mesReferencia: "setembro de 2026" });
  });

  it("sem edição, não consulta", () => {
    const html = renderToStaticMarkup(createElement(ConsultaFipeDoRepasse, { podeEditar: false, aoEscolher: () => {}, buscar }));
    expect(html).toBe("");
  });
});

describe("FichaDeEstadoNoEditor", () => {
  const r = repasseDeTeste();
  const desenhar = (podeEditar: boolean, parcial: Partial<typeof r> = {}) =>
    renderToStaticMarkup(
      createElement(FichaDeEstadoNoEditor, {
        repasseId: r.id,
        itens: parcial.itens_de_estado ?? r.itens_de_estado,
        semDefeitos: parcial.sem_defeitos_conhecidos ?? r.sem_defeitos_conhecidos,
        oficina: r.oficina_do_orcamento,
        orcamentoEm: r.orcamento_em,
        podeEditar,
        aoMudar: () => {},
      }),
    );

  it("diz que é a lista que o comprador assina, e soma o reparo", () => {
    const html = desenhar(true);
    expect(html).toContain("é a lista que o comprador assina");
    expect(html).toContain("2.020"); // 1.400 + 620
    expect(html).toContain("Adicionar defeito");
  });

  it("sem edição, não há botão de adicionar nem de enviar foto", () => {
    const html = desenhar(false);
    expect(html).not.toContain("Adicionar defeito");
    expect(html).not.toContain('type="file"');
  });

  it("nenhum defeito conhecido esconde a lista", () => {
    const html = desenhar(true, { itens_de_estado: [], sem_defeitos_conhecidos: true });
    expect(html).not.toContain("Adicionar defeito");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/pecas-do-editor-do-repasse.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `fichaDeEstado.ts`**

```ts
/** Operações puras sobre a lista da ficha de estado — o editor só as chama. */
import type { ItemDeEstado } from "./repasse";

export const ITEM_VAZIO: ItemDeEstado = { descricao: "", local: "", foto: null, orcamento: null, estetico: false };

export function comItem(itens: ItemDeEstado[], indice: number, parcial: Partial<ItemDeEstado>): ItemDeEstado[] {
  return itens.map((item, i) => (i === indice ? { ...item, ...parcial } : item));
}

export function semItem(itens: ItemDeEstado[], indice: number): ItemDeEstado[] {
  return itens.filter((_, i) => i !== indice);
}
```

- [ ] **Step 4: Implementar `AcoesDoRepasse.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useConfirm } from "../ConfirmDialog";
import type { Perfil } from "../../../lib/permissoes";
import type { Repasse, RepasseDoPainel } from "../../../lib/repasse";
import { LIMITE_DA_NOTA, REGRAS_DOS_ATOS, atosPossiveis, type AtoDoRepasse } from "../../../lib/transicoesDoRepasse";

/**
 * Os botões que mudam a situação do carro (spec §5). Quais aparecem é
 * `atosPossiveis` — "o que for negado some da interface, não fica cinza"
 * (A17). A rota decide de novo; este componente só oferece.
 */

/** Atos sem volta pedem confirmação. "Devolver" pede a nota. */
const CONFIRMACAO: Partial<Record<AtoDoRepasse, string>> = {
  publicar_todos: "O carro vai aparecer para todo mundo no site, sem a fase só para lojistas. Não tem volta.",
  abrir_para_todos: "O carro deixa de ser só para lojistas e passa a aparecer para todo mundo. Não tem volta.",
  vender: "O carro fica no site como vendido pela carência e depois some sozinho.",
  arquivar: "O carro sai do site e do fluxo. Para voltar, cadastre de novo.",
};

const PRIMARIOS: readonly AtoDoRepasse[] = ["enviar", "publicar_lojistas", "abrir_para_todos"];

export default function AcoesDoRepasse({
  repasse,
  perfis,
  alterado,
  aoMudar,
}: {
  repasse: Pick<Repasse, "id" | "situacao" | "aberto_ao_publico_em">;
  perfis: Perfil[];
  /** Há edição não salva? Mudar a situação por cima dela perderia a edição. */
  alterado: boolean;
  aoMudar: (novo: RepasseDoPainel) => void;
}) {
  const { confirm } = useConfirm();
  const [ocupado, setOcupado] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<{ texto: string; problemas: string[] } | null>(null);
  const atos = atosPossiveis(repasse, perfis);
  if (atos.length === 0) return null;

  async function executar(ato: AtoDoRepasse, notaDoAto?: string) {
    const aviso = CONFIRMACAO[ato];
    if (aviso) {
      const rotulo = REGRAS_DOS_ATOS[ato].rotulo;
      const ok = await confirm({ title: rotulo, message: aviso, confirmLabel: rotulo, type: "warning" });
      if (!ok) return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(`/api/repasses/${repasse.id}/transicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notaDoAto === undefined ? { ato } : { ato, nota: notaDoAto }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; problemas?: unknown; repasse?: RepasseDoPainel };
      if (!res.ok || !data.repasse) {
        setErro({
          texto: data.error || "Não deu para mudar a situação.",
          problemas: Array.isArray(data.problemas) ? data.problemas.filter((p): p is string => typeof p === "string") : [],
        });
        return;
      }
      setDevolvendo(false);
      setNota("");
      aoMudar(data.repasse);
    } catch {
      setErro({ texto: "Não deu para mudar a situação. Confira a conexão.", problemas: [] });
    } finally {
      setOcupado(false);
    }
  }

  const travado = ocupado || alterado;

  return (
    <section className="flex flex-col gap-3 border-t-2 border-mt-regua pt-4">
      <div className="mt-rotulo">Situação</div>
      <div className="flex flex-wrap gap-2">
        {atos.map((ato) => (
          <button
            key={ato}
            type="button"
            disabled={travado}
            onClick={() => (ato === "devolver" ? setDevolvendo(true) : void executar(ato))}
            className={`mt-btn mt-foco px-4 py-2.5 text-[11px] ${PRIMARIOS.includes(ato) ? "mt-btn-primario" : "mt-btn-contorno"}`}
          >
            {REGRAS_DOS_ATOS[ato].rotulo}
          </button>
        ))}
      </div>
      {alterado && <p className="text-[11px] text-mt-neutral-700">Salve as alterações antes de mudar a situação.</p>}
      {devolvendo && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700" htmlFor="nota-da-devolucao">
            O que falta para voltar à validação
          </label>
          <textarea
            id="nota-da-devolucao"
            className="mt-campo-caixa mt-foco min-h-20"
            maxLength={LIMITE_DA_NOTA}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" disabled={ocupado} onClick={() => void executar("devolver", nota)} className="mt-btn mt-btn-tinta mt-foco px-4 py-2 text-[11px]">
              Devolver
            </button>
            <button type="button" onClick={() => setDevolvendo(false)} className="mt-btn mt-btn-contorno mt-foco px-4 py-2 text-[11px]">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && (
        <div role="alert" className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2.5 text-xs text-mt-accent-800">
          <p>{erro.texto}</p>
          {erro.problemas.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {erro.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Implementar `ConsultaFipeDoRepasse.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  consultarValor,
  listarAnos,
  listarMarcas,
  listarModelos,
  type Buscar,
  type OpcaoFipe,
  type ValorFipe,
} from "../../../lib/consultaFipe";

/**
 * A cascata da FIPE no navegador, como a /avaliacao faz (spec §6). O valor
 * volta para o editor, que o deixa editável; o mês vem da API.
 */
export default function ConsultaFipeDoRepasse({
  podeEditar,
  aoEscolher,
  buscar,
}: {
  podeEditar: boolean;
  aoEscolher: (valor: ValorFipe) => void;
  /** Só para teste; em produção, `fetch`. */
  buscar?: Buscar;
}) {
  const [marcas, setMarcas] = useState<OpcaoFipe[]>([]);
  const [modelos, setModelos] = useState<OpcaoFipe[]>([]);
  const [anos, setAnos] = useState<OpcaoFipe[]>([]);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [estado, setEstado] = useState<"parado" | "buscando" | "erro">("parado");

  useEffect(() => {
    if (!podeEditar) return;
    let vivo = true;
    listarMarcas("carros", buscar)
      .then((lista) => {
        if (vivo) setMarcas(lista);
      })
      .catch(() => {
        if (vivo) setEstado("erro");
      });
    return () => {
      vivo = false;
    };
  }, [podeEditar, buscar]);

  if (!podeEditar) return null;

  async function escolherMarca(codigo: string) {
    setMarca(codigo);
    setModelo("");
    setModelos([]);
    setAnos([]);
    if (!codigo) return;
    setEstado("buscando");
    try {
      setModelos(await listarModelos("carros", codigo, buscar));
      setEstado("parado");
    } catch {
      setEstado("erro");
    }
  }

  async function escolherModelo(codigo: string) {
    setModelo(codigo);
    setAnos([]);
    if (!codigo) return;
    setEstado("buscando");
    try {
      setAnos(await listarAnos("carros", marca, codigo, buscar));
      setEstado("parado");
    } catch {
      setEstado("erro");
    }
  }

  async function escolherAno(codigo: string) {
    if (!codigo) return;
    setEstado("buscando");
    try {
      const valor = await consultarValor("carros", marca, modelo, codigo, buscar);
      if (!valor) {
        setEstado("erro");
        return;
      }
      aoEscolher(valor);
      setEstado("parado");
    } catch {
      setEstado("erro");
    }
  }

  const caixa = "mt-campo-caixa mt-foco";
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 md:grid-cols-3">
        <select aria-label="Marca na FIPE" className={caixa} value={marca} onChange={(e) => void escolherMarca(e.target.value)}>
          <option value="">Marca</option>
          {marcas.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nome}
            </option>
          ))}
        </select>
        <select aria-label="Modelo na FIPE" className={caixa} value={modelo} disabled={modelos.length === 0} onChange={(e) => void escolherModelo(e.target.value)}>
          <option value="">Modelo</option>
          {modelos.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nome}
            </option>
          ))}
        </select>
        <select aria-label="Ano na FIPE" className={caixa} defaultValue="" disabled={anos.length === 0} onChange={(e) => void escolherAno(e.target.value)}>
          <option value="">Ano</option>
          {anos.map((a) => (
            <option key={a.codigo} value={a.codigo}>
              {a.nome}
            </option>
          ))}
        </select>
      </div>
      {estado === "buscando" && <p className="text-[11px] text-mt-neutral-700">Consultando a FIPE…</p>}
      {estado === "erro" && (
        <p className="text-[11px] text-mt-accent-800">A FIPE não respondeu. Tente de novo ou digite o valor.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Implementar `FichaDeEstadoNoEditor.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ITEM_VAZIO, comItem, semItem } from "../../../lib/fichaDeEstado";
import { BUCKET_DE_FOTOS, caminhoDaFotoDoRepasse, novoLote, validarFoto } from "../../../lib/fotosDoVeiculo";
import { processarFotoDeVeiculo } from "../../../lib/imageProcessor";
import { contaDoRepasse, emReais, type ItemDeEstado, type Repasse } from "../../../lib/repasse";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";

type ParteDaFicha = Pick<Repasse, "itens_de_estado" | "sem_defeitos_conhecidos" | "oficina_do_orcamento" | "orcamento_em">;

const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const caixa = "mt-campo-caixa mt-foco";

/**
 * A ficha de estado no editor (spec §4.1 e §5): os defeitos conhecidos, com
 * foto e orçamento. É o documento que o comprador assina junto do contrato,
 * então todo defeito tem foto, e a foto sobe para a pasta do próprio carro
 * (`repasse/<id>/`), só na versão web — é ela que a ficha pública mostra.
 */
export default function FichaDeEstadoNoEditor({
  repasseId,
  itens,
  semDefeitos,
  oficina,
  orcamentoEm,
  podeEditar,
  aoMudar,
}: {
  repasseId: string;
  itens: ItemDeEstado[];
  semDefeitos: boolean;
  oficina: string | null;
  orcamentoEm: string | null;
  podeEditar: boolean;
  aoMudar: (parcial: Partial<ParteDaFicha>) => void;
}) {
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const reparo = contaDoRepasse({ preco: 0, fipe_valor: null, itens_de_estado: itens }).reparoOrcado;

  async function enviarFoto(indice: number, arquivo: File) {
    const problema = validarFoto(arquivo);
    if (problema) {
      setErro(problema.mensagem);
      return;
    }
    setErro(null);
    setEnviando(indice);
    try {
      const lote = novoLote();
      const versoes = await processarFotoDeVeiculo(arquivo, lote);
      const caminho = caminhoDaFotoDoRepasse(repasseId, lote, "web");
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.storage
        .from(BUCKET_DE_FOTOS)
        .upload(caminho, versoes.web, { contentType: versoes.web.type, upsert: false, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
      const url = supabase.storage.from(BUCKET_DE_FOTOS).getPublicUrl(caminho).data.publicUrl;
      aoMudar({ itens_de_estado: comItem(itens, indice, { foto: url }) });
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não deu para enviar a foto.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="mt-rotulo">Ficha de estado</div>
      <p className="max-w-[62ch] text-xs leading-relaxed text-mt-neutral-800">
        Os defeitos conhecidos, com foto e, quando houver, o orçamento do conserto. Esta é a lista que o comprador assina
        junto com o contrato.
      </p>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={semDefeitos}
          disabled={!podeEditar || itens.length > 0}
          onChange={(e) => aoMudar({ sem_defeitos_conhecidos: e.target.checked })}
        />
        Nenhum defeito conhecido
      </label>

      {!semDefeitos && (
        <>
          {itens.map((item, i) => (
            <div key={i} className="grid gap-2 border-l-[3px] border-mt-regua-fina pl-3 md:grid-cols-[2fr_1fr_1fr_auto]">
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Defeito</span>
                <input className={caixa} value={item.descricao} disabled={!podeEditar} onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { descricao: e.target.value }) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Onde</span>
                <input className={caixa} value={item.local} disabled={!podeEditar} onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { local: e.target.value }) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotuloCampo}>Orçamento (R$)</span>
                <input
                  className={caixa}
                  type="number"
                  min={1}
                  step={1}
                  value={item.orcamento ?? ""}
                  disabled={!podeEditar}
                  onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { orcamento: e.target.value === "" ? null : Number(e.target.value) }) })}
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className={rotuloCampo}>Foto</span>
                {item.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura do painel, foto do nosso bucket
                  <img src={item.foto} alt={`Foto do defeito ${i + 1}`} className="h-16 w-24 object-cover" />
                ) : (
                  <span className="text-[11px] text-mt-accent-800">Sem foto</span>
                )}
                {podeEditar && (
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={`Foto do defeito ${i + 1}`}
                    disabled={enviando !== null}
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0];
                      e.target.value = "";
                      if (arquivo) void enviarFoto(i, arquivo);
                    }}
                  />
                )}
              </div>
              <label className="flex items-center gap-2 text-xs md:col-span-3">
                <input type="checkbox" checked={item.estetico} disabled={!podeEditar} onChange={(e) => aoMudar({ itens_de_estado: comItem(itens, i, { estetico: e.target.checked }) })} />
                Só estético
              </label>
              {podeEditar && (
                <button type="button" aria-label={`Remover o defeito ${i + 1}`} onClick={() => aoMudar({ itens_de_estado: semItem(itens, i) })} className="mt-btn mt-btn-contorno mt-foco px-3 py-1.5 text-[10px]">
                  Remover
                </button>
              )}
            </div>
          ))}
          {podeEditar && (
            <button type="button" onClick={() => aoMudar({ itens_de_estado: [...itens, ITEM_VAZIO] })} className="mt-btn mt-btn-contorno mt-foco self-start px-4 py-2 text-[11px]">
              Adicionar defeito
            </button>
          )}
        </>
      )}

      {reparo > 0 && (
        <div className="grid gap-2 md:grid-cols-3">
          <p className="text-xs md:col-span-3">
            Reparo orçado: <strong className="tabular-nums">{emReais(reparo)}</strong>
          </p>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className={rotuloCampo}>Oficina do orçamento</span>
            <input className={caixa} value={oficina ?? ""} disabled={!podeEditar} onChange={(e) => aoMudar({ oficina_do_orcamento: e.target.value || null })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>Data do orçamento</span>
            <input className={caixa} type="date" value={orcamentoEm ?? ""} disabled={!podeEditar} onChange={(e) => aoMudar({ orcamento_em: e.target.value || null })} />
          </label>
        </div>
      )}

      {erro && <p role="alert" className="text-[11px] text-mt-accent-800">{erro}</p>}
    </section>
  );
}
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run tests/pecas-do-editor-do-repasse.test.ts`
Expected: PASS. Se o `eslint-disable` do `<img>` não casar com a regra ativa no projeto, trocar pela forma já usada em outro componente do painel (`grep -rn "no-img-element" src/components/admin`); não deixar erro novo de lint.

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Em `AcoesDoRepasse`, trocar `disabled={travado}` por `disabled={ocupado}` → "com alteração não salva, os atos ficam travados" reprova.
2. Tirar `arquivar` de `CONFIRMACAO` → "arquivar pede confirmação" reprova.
3. Em `ConsultaFipeDoRepasse`, passar `valor.valor` em vez do objeto → "a cascata … entrega valor, código e mês" reprova.

- [ ] **Step 9: Commit**

```bash
git add src/lib/fichaDeEstado.ts src/components/admin/repasse/FichaDeEstadoNoEditor.tsx src/components/admin/repasse/ConsultaFipeDoRepasse.tsx src/components/admin/repasse/AcoesDoRepasse.tsx tests/pecas-do-editor-do-repasse.test.ts
git commit -m "feat(repasse): ficha de estado, consulta FIPE e botões de situação do editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: O editor, as páginas do carro e "quem avisar" — Sonnet

**Files:**
- Create: `src/components/admin/repasse/InscritosQueCombinam.tsx`
- Create: `src/components/admin/repasse/EditorDeRepasse.tsx`
- Create: `src/components/admin/repasse/NovoRepasse.tsx`
- Create: `src/app/admin/repasse/novo/page.tsx`
- Create: `src/app/admin/repasse/[id]/page.tsx`
- Test: `tests/editor-do-repasse.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 9; `urlDoSite` (`src/lib/site.ts`); `fotosDoVeiculo` e `colunasDasFotos`; `aparecePublicamente`, `soParaLojistas`, `CARROCERIAS_DO_REPASSE`, `NOME_DA_SITUACAO` (`repasse.ts`); `checklistDoRepasse`, `termosProibidosEm`.
- Produces:
  - `<InscritosQueCombinam repasse inscritos avisados urlDaFicha />` — `inscritos: InscritoDoRepasse[]`, `avisados: string[]`.
  - `<EditorDeRepasse repasse perfis inscritos avisados urlDaFicha />` — `inscritos: InscritoDoRepasse[] | null` (null = o perfil não vê a lista).
  - `<NovoRepasse />`.
  - Páginas `/admin/repasse/novo` e `/admin/repasse/[id]`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/editor-do-repasse.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
const empurrar = vi.fn();
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: empurrar, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/repasse",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const { ConfirmProvider } = await import("../src/components/admin/ConfirmDialog");
const PaginaDoCarro = (await import("../src/app/admin/repasse/[id]/page")).default;
const PaginaNovo = (await import("../src/app/admin/repasse/novo/page")).default;
const NovoRepasse = (await import("../src/components/admin/repasse/NovoRepasse")).default;

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const ISO = "2026-09-24T12:00:00Z";
const LOJISTA = {
  id: "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
  trilha: "lojista",
  nome: "Auto Bom Ltda",
  whatsapp: "41999990000",
  faixa: null,
  carrocerias: [],
  cnpj: "12345678000190",
  loja_cidade: "Auto Bom, Curitiba",
  cnpj_conferido_em: ISO,
  created_at: ISO,
};

function entrarComo(papeis: string[]) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis);
}
beforeEach(() => entrarComo(["comercial"]));

const texto = (el: ReactElement) =>
  renderToStaticMarkup(createElement(ConfirmProvider, null, el)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function abrirCarro(id = ID) {
  return texto(await PaginaDoCarro({ params: Promise.resolve({ id }) }));
}

describe("a página do carro", () => {
  it("id que não é uuid: não encontrado", async () => {
    await expect(PaginaDoCarro({ params: Promise.resolve({ id: "123" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("carro que não existe: não encontrado", async () => {
    banco.leituras.repasses = { data: null, error: null };
    await expect(PaginaDoCarro({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("comercial num carro publicado vê quem avisar", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: ISO }), error: null };
    banco.leituras.repasse_inscritos = { data: [LOJISTA], error: null };
    banco.leituras.repasse_avisos = { data: [], error: null };
    const html = await abrirCarro();
    expect(html).toContain("Quem avisar");
    expect(html).toContain("Auto Bom Ltda");
  });

  it("marketing no mesmo carro não vê a lista, e a página nem a lê", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: ISO }), error: null };
    banco.leituras.repasse_inscritos = { data: [LOJISTA], error: null };
    const html = await abrirCarro();
    expect(html).not.toContain("Quem avisar");
    expect(html).not.toContain("Auto Bom Ltda");
    expect(banco.lidas).not.toContain("repasse_inscritos");
  });

  it("o checklist aparece com o que falta", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ resumo: null }), error: null };
    const html = await abrirCarro();
    expect(html).toContain("Escreva a linha do card.");
  });

  it("o rascunho devolvido mostra a nota", async () => {
    banco.leituras.repasses = { data: { ...linhaDoBancoDeTeste(), devolvido_com: "Falta a foto do farol" }, error: null };
    expect(await abrirCarro()).toContain("Falta a foto do farol");
  });

  it("termo proibido no resumo aparece como aviso na hora", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ resumo: "Carro que não girou no pátio" }), error: null };
    expect(await abrirCarro()).toContain("usa um termo que o repasse não usa");
  });
});

describe("novo carro", () => {
  it("a página abre para qualquer perfil da equipe", async () => {
    entrarComo(["financeiro"]);
    expect(texto(await PaginaNovo())).toContain("Criar rascunho");
  });

  it("quem não é da equipe volta para a home", async () => {
    entrarComo(["cliente"]);
    await expect(PaginaNovo()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  describe("o formulário", () => {
    let container: HTMLDivElement;
    let root: Root;
    afterEach(async () => {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    });

    function mudar(el: HTMLInputElement, valor: string) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    it("cria o rascunho com números e vai para o editor", async () => {
      const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ id: ID, slug: "x" }), { status: 201 }));
      vi.stubGlobal("fetch", fetchFalso);
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => root.render(createElement(NovoRepasse)));
      const campo = (nome: string) => container.querySelector(`input[name="${nome}"]`) as HTMLInputElement;
      await act(async () => {
        mudar(campo("marca"), "Renault");
        mudar(campo("modelo"), "Kwid");
        mudar(campo("versao"), "Zen 1.0");
        mudar(campo("ano_modelo"), "2021");
        mudar(campo("quilometragem"), "71200");
        mudar(campo("preco"), "36900");
      });
      await act(async () => {
        container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(fetchFalso).toHaveBeenCalledWith(
        "/api/repasses",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ marca: "Renault", modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021, quilometragem: 71200, preco: 36900 }),
        }),
      );
      expect(empurrar).toHaveBeenCalledWith(`/admin/repasse/${ID}`);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/editor-do-repasse.test.ts`
Expected: FAIL — páginas e componentes não existem.

- [ ] **Step 3: Implementar `InscritosQueCombinam.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import {
  inscritosQueCombinam,
  mensagemDeAvisoDoRepasse,
  type InscritoDoRepasse,
} from "../../../lib/avisosDoRepasse";
import { soParaLojistas, type Repasse } from "../../../lib/repasse";

/**
 * "Inscritos que combinam" (spec §6): quem da lista avisar deste carro, a
 * mensagem pronta para colar no Chatwoot e o botão "avisado". O aviso é
 * manual; nada aqui manda mensagem.
 */
export default function InscritosQueCombinam({
  repasse,
  inscritos,
  avisados: avisadosIniciais,
  urlDaFicha,
}: {
  repasse: Repasse;
  inscritos: InscritoDoRepasse[];
  avisados: string[];
  urlDaFicha: string;
}) {
  const [avisados, setAvisados] = useState<Set<string>>(() => new Set(avisadosIniciais));
  const [copiado, setCopiado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { combinam, lojistasSemConferencia } = inscritosQueCombinam(repasse, inscritos, avisados);

  async function copiar(inscrito: InscritoDoRepasse) {
    try {
      await navigator.clipboard.writeText(mensagemDeAvisoDoRepasse(repasse, inscrito, urlDaFicha));
      setCopiado(inscrito.id);
    } catch {
      setErro("Não deu para copiar. Selecione o texto da mensagem à mão.");
    }
  }

  async function marcar(inscrito: InscritoDoRepasse) {
    setErro(null);
    const res = await fetch(`/api/repasses/${repasse.id}/avisos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inscritoId: inscrito.id }),
    }).catch(() => null);
    if (!res || !res.ok) {
      const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setErro(data.error || "Não deu para marcar o aviso.");
      return;
    }
    setAvisados((atual) => new Set([...atual, inscrito.id]));
  }

  return (
    <section className="flex flex-col gap-3 border-t-2 border-mt-regua pt-4">
      <div className="mt-rotulo">Quem avisar</div>
      <p className="max-w-[62ch] text-xs leading-relaxed text-mt-neutral-800">
        {soParaLojistas(repasse)
          ? "Enquanto o carro é só para lojistas, entram os lojistas com CNPJ conferido. Quem compra para usar entra quando você abrir para todos."
          : "Lojistas com CNPJ conferido e quem compra para usar na faixa de preço e na carroceria deste carro."}{" "}
        Copie a mensagem, mande pelo Chatwoot e marque como avisado.
      </p>
      {lojistasSemConferencia > 0 && (
        <p className="text-[11px] text-mt-neutral-700">
          {lojistasSemConferencia} lojista(s) aguardam a conferência do CNPJ.{" "}
          <Link href="/admin/repasse/inscritos" className="underline">
            Conferir na lista
          </Link>
        </p>
      )}
      {combinam.length === 0 ? (
        <p className="text-xs text-mt-neutral-700">Ninguém da lista combina com este carro ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-mt-regua-fina">
          {combinam.map(({ inscrito, avisado }) => (
            <li key={inscrito.id} className="flex flex-wrap items-center gap-3 py-2 text-xs">
              <strong>{inscrito.nome}</strong>
              <span className="text-mt-neutral-700">{inscrito.trilha === "lojista" ? "Lojista" : "Compra para usar"}</span>
              <span className="tabular-nums">{inscrito.whatsapp}</span>
              <button type="button" onClick={() => void copiar(inscrito)} className="mt-btn mt-btn-contorno mt-foco ml-auto px-3 py-1.5 text-[10px]">
                {copiado === inscrito.id ? "Copiada" : "Copiar mensagem"}
              </button>
              {avisado ? (
                <span className="text-[10px] font-bold uppercase tracking-[.08em] text-mt-neutral-700">Avisado</span>
              ) : (
                <button type="button" onClick={() => void marcar(inscrito)} className="mt-btn mt-btn-tinta mt-foco px-3 py-1.5 text-[10px]">
                  Marcar avisado
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="text-[11px] text-mt-accent-800">{erro}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Implementar `EditorDeRepasse.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import GaleriaDeFotos from "../GaleriaDeFotos";
import AcoesDoRepasse from "./AcoesDoRepasse";
import ConsultaFipeDoRepasse from "./ConsultaFipeDoRepasse";
import FichaDeEstadoNoEditor from "./FichaDeEstadoNoEditor";
import InscritosQueCombinam from "./InscritosQueCombinam";
import type { InscritoDoRepasse } from "../../../lib/avisosDoRepasse";
import { checklistDoRepasse, termosProibidosEm } from "../../../lib/checklistDoRepasse";
import { destinoDoRepasse } from "../../../lib/destinoDasFotos";
import { alteracoes, formularioDe, podeEditarORepasse, validaRepasse, type FormularioDoRepasse } from "../../../lib/edicaoDoRepasse";
import { fotosDoVeiculo } from "../../../lib/fotosDoVeiculo";
import type { Perfil } from "../../../lib/permissoes";
import {
  CARROCERIAS_DO_REPASSE,
  NOME_DA_SITUACAO,
  aparecePublicamente,
  contaDoRepasse,
  emReais,
  soParaLojistas,
  type Repasse,
  type RepasseDoPainel,
} from "../../../lib/repasse";

const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const caixa = "mt-campo-caixa mt-foco";

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={rotuloCampo}>{rotulo}</span>
      {children}
    </label>
  );
}

function AvisoDeTermo({ texto }: { texto: string | null }) {
  const achados = termosProibidosEm(texto);
  if (achados.length === 0) return null;
  return <p className="text-[11px] text-mt-accent-800">Este texto usa um termo que o repasse não usa: {achados[0]}.</p>;
}

const simNao = (v: boolean | null) => (v === null ? "" : v ? "sim" : "nao");
const deSimNao = (v: string): boolean | null => (v === "" ? null : v === "sim");
const numeroOuNulo = (v: string): number | null => (v === "" ? null : Number(v));

/**
 * O editor de um carro de repasse (spec §6): dados, FIPE, fotos, ficha de
 * estado, histórico, textos, o checklist ao vivo, os atos de situação e, para
 * quem valida num carro publicado, quem avisar.
 *
 * Grava só o que mudou (`alteracoes`) por PATCH; a rota decide de novo tudo o
 * que este componente oferece.
 *
 * Fora do rascunho, quem não valida vê o carro inteiro com os campos
 * travados, e sem o botão de salvar. É o mesmo carro que já está no site, e
 * essa pessoa precisa ler o que vai pedir ao validador. Nenhum campo do
 * repasse é sigiloso por perfil: o que a regra "campo que o perfil não grava
 * não é renderizado" protege no estoque (o custo de compra) não existe aqui.
 * Ação negada, essa sim, some (botões de ato, salvar, a lista do repasse).
 */
export default function EditorDeRepasse({
  repasse: inicial,
  perfis,
  inscritos,
  avisados,
  urlDaFicha,
}: {
  repasse: RepasseDoPainel;
  perfis: Perfil[];
  /** null: o perfil não vê a lista do repasse. */
  inscritos: InscritoDoRepasse[] | null;
  avisados: string[];
  urlDaFicha: string;
}) {
  const router = useRouter();
  const [repasse, setRepasse] = useState<RepasseDoPainel>(inicial);
  const [form, setForm] = useState<FormularioDoRepasse>(() => formularioDe(inicial));
  const [salvo, setSalvo] = useState<FormularioDoRepasse>(() => formularioDe(inicial));
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string; problemas: string[] } | null>(null);

  const podeEditar = podeEditarORepasse(repasse, perfis);
  const pendente = useMemo(() => alteracoes(form, salvo), [form, salvo]);
  const alterado = Object.keys(pendente).length > 0;
  const atual: Repasse = { ...repasse, ...form };
  const faltas = checklistDoRepasse(atual);
  const conta = contaDoRepasse(atual);
  const nome = [atual.marca, atual.modelo, atual.versao, atual.ano_modelo].filter(Boolean).join(" ");

  const mudar = (parcial: Partial<FormularioDoRepasse>) => setForm((f) => ({ ...f, ...parcial }));

  function aplicar(novo: RepasseDoPainel) {
    setRepasse(novo);
    const f = formularioDe(novo);
    setForm(f);
    setSalvo(f);
    router.refresh();
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);
    try {
      const res = await fetch(`/api/repasses/${repasse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendente),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; problemas?: unknown; repasse?: RepasseDoPainel };
      if (!res.ok || !data.repasse) {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Não deu para salvar.",
          problemas: Array.isArray(data.problemas) ? data.problemas.filter((p): p is string => typeof p === "string") : [],
        });
        return;
      }
      aplicar(data.repasse);
      setMensagem({ tipo: "ok", texto: "Salvo.", problemas: [] });
    } catch {
      setMensagem({ tipo: "erro", texto: "Não deu para salvar. Confira a conexão.", problemas: [] });
    } finally {
      setSalvando(false);
    }
  }

  const fotos = fotosDoVeiculo(form.whatsapp_images, form.web_full_images);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <div className="border-b-2 border-mt-regua pb-5">
        <Link href="/admin/repasse" className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 no-underline hover:text-mt-accent">
          ← REPASSE
        </Link>
        <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">{nome}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <span className="mt-rotulo">{NOME_DA_SITUACAO[repasse.situacao]}</span>
          {repasse.situacao === "publicado" && <span>{soParaLojistas(repasse) ? "Só para lojistas" : "Aberto a todos"}</span>}
          {aparecePublicamente(repasse, new Date()) && (
            <a href={urlDaFicha} target="_blank" rel="noreferrer" className="underline">
              Ver no site
            </a>
          )}
        </p>
        {repasse.situacao === "rascunho" && repasse.devolvido_com && (
          <p className="mt-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2 text-xs text-mt-accent-800">
            Devolvido para rascunho: {repasse.devolvido_com}
          </p>
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="mt-rotulo md:col-span-3">O carro</div>
        <Campo rotulo="Marca">
          <input className={caixa} value={form.marca} disabled={!podeEditar} onChange={(e) => mudar({ marca: e.target.value })} />
        </Campo>
        <Campo rotulo="Modelo">
          <input className={caixa} value={form.modelo} disabled={!podeEditar} onChange={(e) => mudar({ modelo: e.target.value })} />
        </Campo>
        <Campo rotulo="Versão">
          <input className={caixa} value={form.versao ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ versao: e.target.value || null })} />
        </Campo>
        <Campo rotulo="Ano do modelo">
          <input className={caixa} type="number" value={form.ano_modelo || ""} disabled={!podeEditar} onChange={(e) => mudar({ ano_modelo: Number(e.target.value) })} />
        </Campo>
        <Campo rotulo="Ano de fabricação">
          <input className={caixa} type="number" value={form.ano_fabricacao ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ ano_fabricacao: numeroOuNulo(e.target.value) })} />
        </Campo>
        <Campo rotulo="Quilometragem">
          <input className={caixa} type="number" min={0} value={form.quilometragem} disabled={!podeEditar} onChange={(e) => mudar({ quilometragem: Number(e.target.value) })} />
        </Campo>
        <Campo rotulo="Câmbio">
          <input className={caixa} value={form.cambio ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ cambio: e.target.value || null })} />
        </Campo>
        <Campo rotulo="Combustível">
          <input className={caixa} value={form.combustivel ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ combustivel: e.target.value || null })} />
        </Campo>
        <Campo rotulo="Cor">
          <input className={caixa} value={form.cor ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ cor: e.target.value || null })} />
        </Campo>
        <Campo rotulo="Carroceria">
          <select className={caixa} value={form.carroceria ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ carroceria: (e.target.value || null) as Repasse["carroceria"] })}>
            <option value="">Escolha</option>
            {CARROCERIAS_DO_REPASSE.map((c) => (
              <option key={c} value={c}>
                {c === "seda" ? "Sedã" : c === "suv" ? "SUV" : c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Preço à vista (R$)">
          <input className={caixa} type="number" min={1} value={form.preco || ""} disabled={!podeEditar} onChange={(e) => mudar({ preco: Number(e.target.value) })} />
        </Campo>
      </section>

      <section className="flex flex-col gap-3">
        <div className="mt-rotulo">FIPE</div>
        <ConsultaFipeDoRepasse
          podeEditar={podeEditar}
          aoEscolher={(v) => mudar({ fipe_valor: v.valor, fipe_codigo: v.codigo || null, fipe_mes_referencia: v.mesReferencia || null })}
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Campo rotulo="Valor FIPE (R$)">
            <input className={caixa} type="number" value={form.fipe_valor ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ fipe_valor: numeroOuNulo(e.target.value) })} />
          </Campo>
          <Campo rotulo="Código">
            <input className={caixa} value={form.fipe_codigo ?? ""} disabled />
          </Campo>
          <Campo rotulo="Mês de referência">
            <input className={caixa} value={form.fipe_mes_referencia ?? ""} disabled />
          </Campo>
        </div>
        <p className="text-xs tabular-nums">
          Você gasta {emReais(conta.voceGasta)}
          {conta.abaixoDaFipe !== null &&
            (conta.abaixoDaFipe > 0
              ? ` · ${emReais(conta.abaixoDaFipe)} abaixo da FIPE`
              : ` · ${emReais(-conta.abaixoDaFipe)} acima da FIPE`)}
        </p>
      </section>

      <section>
        <GaleriaDeFotos
          estoqueId={repasse.id}
          fotos={fotos}
          origem="painel"
          podeEditar={podeEditar}
          destino={destinoDoRepasse(repasse.id)}
          aoGravar={(colunas) => {
            const parcial = { web_full_images: colunas.web_full_images, whatsapp_images: colunas.whatsapp_images };
            setForm((f) => ({ ...f, ...parcial }));
            setSalvo((s) => ({ ...s, ...parcial }));
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="mt-rotulo">Laudo cautelar</div>
        <div className="flex flex-wrap gap-4 text-xs">
          {(
            [
              ["aprovado", "Aprovado"],
              ["aprovado_com_apontamento", "Aprovado com apontamento"],
              ["nao_feito", "Não feito"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label key={valor} className="flex items-center gap-2">
              <input type="radio" name="laudo" checked={form.laudo === valor} disabled={!podeEditar} onChange={() => mudar({ laudo: valor })} />
              {rotulo}
            </label>
          ))}
        </div>
        {form.laudo === "aprovado_com_apontamento" && (
          <Campo rotulo="O apontamento">
            <textarea className={`${caixa} min-h-16`} value={form.laudo_apontamento ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ laudo_apontamento: e.target.value || null })} />
          </Campo>
        )}
        <p className="text-[11px] text-mt-neutral-700">Carro reprovado no laudo não entra no repasse.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="mt-rotulo md:col-span-2">Histórico</div>
        <Campo rotulo="Leilão">
          <select className={caixa} value={simNao(form.leilao_consta)} disabled={!podeEditar} onChange={(e) => mudar({ leilao_consta: deSimNao(e.target.value) })}>
            <option value="">Informe</option>
            <option value="nao">Não consta</option>
            <option value="sim">Consta</option>
          </select>
        </Campo>
        <Campo rotulo="Sinistro">
          <select className={caixa} value={simNao(form.sinistro_consta)} disabled={!podeEditar} onChange={(e) => mudar({ sinistro_consta: deSimNao(e.target.value) })}>
            <option value="">Informe</option>
            <option value="nao">Não consta</option>
            <option value="sim">Consta</option>
          </select>
        </Campo>
        {form.leilao_consta === true && (
          <Campo rotulo="O registro de leilão">
            <textarea className={`${caixa} min-h-16`} value={form.leilao_detalhe ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ leilao_detalhe: e.target.value || null })} />
          </Campo>
        )}
        {form.sinistro_consta === true && (
          <Campo rotulo="O registro de sinistro">
            <textarea className={`${caixa} min-h-16`} value={form.sinistro_detalhe ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ sinistro_detalhe: e.target.value || null })} />
          </Campo>
        )}
        <Campo rotulo="Data da consulta do histórico">
          <input className={caixa} type="date" value={form.historico_consultado_em ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ historico_consultado_em: e.target.value || null })} />
        </Campo>
      </section>

      <FichaDeEstadoNoEditor
        repasseId={repasse.id}
        itens={form.itens_de_estado}
        semDefeitos={form.sem_defeitos_conhecidos}
        oficina={form.oficina_do_orcamento}
        orcamentoEm={form.orcamento_em}
        podeEditar={podeEditar}
        aoMudar={mudar}
      />

      <section className="flex flex-col gap-3">
        <div className="mt-rotulo">Textos</div>
        <Campo rotulo={`Linha do card (${(form.resumo ?? "").length}/140)`}>
          <input className={caixa} maxLength={140} value={form.resumo ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ resumo: e.target.value || null })} />
        </Campo>
        <AvisoDeTermo texto={form.resumo} />
        <Campo rotulo="Por que está no repasse">
          <textarea className={`${caixa} min-h-24`} value={form.motivo ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ motivo: e.target.value || null })} />
        </Campo>
        <AvisoDeTermo texto={form.motivo} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="mt-rotulo">Checklist</div>
        {faltas.length === 0 ? (
          <p className="text-xs">Completo: o carro pode ir à validação.</p>
        ) : (
          <ul className="list-disc pl-4 text-xs text-mt-accent-800">
            {faltas.map((f) => (
              <li key={`${f.campo}-${f.mensagem}`}>{f.mensagem}</li>
            ))}
          </ul>
        )}
      </section>

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!alterado || salvando} onClick={() => void salvar()} className="mt-btn mt-btn-primario mt-foco px-5 py-2.5 text-[11px]">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {mensagem && (
            <div role={mensagem.tipo === "erro" ? "alert" : "status"} className="text-xs">
              <p className={mensagem.tipo === "erro" ? "text-mt-accent-800" : ""}>{mensagem.texto}</p>
              {mensagem.problemas.length > 0 && (
                <ul className="list-disc pl-4">
                  {mensagem.problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <AcoesDoRepasse repasse={repasse} perfis={perfis} alterado={alterado} aoMudar={aplicar} />

      {inscritos !== null && validaRepasse(perfis) && repasse.situacao === "publicado" && (
        <InscritosQueCombinam repasse={repasse} inscritos={inscritos} avisados={avisados} urlDaFicha={urlDaFicha} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implementar `NovoRepasse.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const CAMPOS = [
  { nome: "marca", rotulo: "Marca", tipo: "text" },
  { nome: "modelo", rotulo: "Modelo", tipo: "text" },
  { nome: "versao", rotulo: "Versão", tipo: "text" },
  { nome: "ano_modelo", rotulo: "Ano do modelo", tipo: "number" },
  { nome: "quilometragem", rotulo: "Quilometragem", tipo: "number" },
  { nome: "preco", rotulo: "Preço à vista (R$)", tipo: "number" },
] as const;
type NomeDoCampo = (typeof CAMPOS)[number]["nome"];

/**
 * O primeiro passo do cadastro: os cinco campos que o banco exige, para o
 * carro ganhar id — e com ele a pasta das fotos. O resto vem no editor.
 */
export default function NovoRepasse() {
  const router = useRouter();
  const [valores, setValores] = useState<Record<NomeDoCampo, string>>({
    marca: "",
    modelo: "",
    versao: "",
    ano_modelo: "",
    quilometragem: "",
    preco: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/repasses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca: valores.marca,
          modelo: valores.modelo,
          versao: valores.versao || null,
          ano_modelo: Number(valores.ano_modelo),
          quilometragem: Number(valores.quilometragem),
          preco: Number(valores.preco),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setErro(data.error || "Não deu para criar o rascunho.");
        return;
      }
      router.push(`/admin/repasse/${data.id}`);
    } catch {
      setErro("Não deu para criar o rascunho. Confira a conexão.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={criar} className="flex w-full max-w-3xl flex-col gap-6">
      <div className="border-b-2 border-mt-regua pb-5">
        <Link href="/admin/repasse" className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 no-underline hover:text-mt-accent">
          ← REPASSE
        </Link>
        <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">Novo carro de repasse</h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-mt-neutral-800">
          Comece pelo básico. Fotos, FIPE, laudo, histórico e a ficha de estado vêm na tela seguinte.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {CAMPOS.map((c) => (
          <label key={c.nome} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">{c.rotulo}</span>
            <input
              name={c.nome}
              type={c.tipo}
              className="mt-campo-caixa mt-foco"
              value={valores[c.nome]}
              onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {erro && <p role="alert" className="text-xs text-mt-accent-800">{erro}</p>}
      <button type="submit" disabled={enviando} className="mt-btn mt-btn-primario mt-foco self-start px-5 py-2.5 text-[11px]">
        {enviando ? "Criando…" : "Criar rascunho"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Implementar as duas páginas**

`src/app/admin/repasse/novo/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import NovoRepasse from "../../../../components/admin/repasse/NovoRepasse";
import { cadastraRepasse } from "../../../../lib/edicaoDoRepasse";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import { ehStaff, perfisDe } from "../../../../lib/permissoes";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Novo carro de repasse — Motors Store",
};

/** O gate é o mesmo da rota `POST /api/repasses`: quem cadastra (todo perfil). */
export default async function NovoRepassePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");
  if (!cadastraRepasse(perfisDe(origem))) redirect("/admin/repasse");
  return <NovoRepasse />;
}
```

`src/app/admin/repasse/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import EditorDeRepasse from "../../../../components/admin/repasse/EditorDeRepasse";
import { COLUNAS_DO_INSCRITO, inscritoDaLinha, type InscritoDoRepasse } from "../../../../lib/avisosDoRepasse";
import { validaRepasse } from "../../../../lib/edicaoDoRepasse";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import { ehStaff, perfisDe } from "../../../../lib/permissoes";
import { ehIdDeRepasse } from "../../../../lib/repasse";
import { repasseDoPainelDaLinha } from "../../../../lib/repasseDoPainel";
import { urlDoSite } from "../../../../lib/site";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Carro de repasse — Motors Store",
};

/**
 * O editor de um carro de repasse. Lê com a SESSÃO: a RLS dá o carro a
 * qualquer perfil da equipe e a lista só a quem valida — e a página nem pede
 * a lista a quem não valida, para o WhatsApp de ninguém viajar em prop de
 * client component à toa.
 */
export default async function RepassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehIdDeRepasse(id)) notFound();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");
  const perfis = perfisDe(origem);

  const { data } = await supabase.from("repasses").select("*").eq("id", id).maybeSingle();
  const repasse = data ? repasseDoPainelDaLinha(data as Record<string, unknown>) : null;
  if (!repasse) notFound();

  let inscritos: InscritoDoRepasse[] | null = null;
  let avisados: string[] = [];
  if (validaRepasse(perfis) && repasse.situacao === "publicado") {
    const [lista, avisos] = await Promise.all([
      supabase.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).order("created_at"),
      supabase.from("repasse_avisos").select("inscrito_id").eq("repasse_id", id),
    ]);
    inscritos = ((lista.data ?? []) as Record<string, unknown>[]).flatMap((linha) => {
      const inscrito = inscritoDaLinha(linha);
      return inscrito ? [inscrito] : [];
    });
    avisados = ((avisos.data ?? []) as Array<{ inscrito_id: unknown }>).map((a) => String(a.inscrito_id));
  }

  return (
    <EditorDeRepasse
      repasse={repasse}
      perfis={perfis}
      inscritos={inscritos}
      avisados={avisados}
      urlDaFicha={urlDoSite(`/repasse/${repasse.slug}`)}
    />
  );
}
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run tests/editor-do-repasse.test.ts`
Expected: PASS. Se `renderToStaticMarkup` reclamar de `navigator` ou `document` ao desenhar a galeria, é porque algum efeito rodou no servidor — conferir que `GaleriaDeFotos` só toca `document` dentro de handlers (o teste do estoque já a desenha assim).

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Na página do carro, trocar `validaRepasse(perfis) && repasse.situacao === "publicado"` por `repasse.situacao === "publicado"` → "marketing no mesmo carro não vê a lista, e a página nem a lê" reprova.
2. No editor, apagar `<AvisoDeTermo texto={form.resumo} />` → "termo proibido no resumo aparece como aviso" reprova.
3. Em `NovoRepasse`, mandar `ano_modelo: valores.ano_modelo` (string) → "cria o rascunho com números" reprova.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/repasse/InscritosQueCombinam.tsx src/components/admin/repasse/EditorDeRepasse.tsx src/components/admin/repasse/NovoRepasse.tsx "src/app/admin/repasse/novo/page.tsx" "src/app/admin/repasse/[id]/page.tsx" tests/editor-do-repasse.test.ts
git commit -m "feat(repasse): editor do carro, cadastro inicial e quem avisar da lista

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: A lista de carros, a lista de inscritos e o menu — Sonnet

**Files:**
- Create: `src/lib/painelDoRepasse.ts`
- Create: `src/components/admin/repasse/TabelaDeInscritos.tsx`
- Create: `src/app/admin/repasse/page.tsx`
- Create: `src/app/admin/repasse/inscritos/page.tsx`
- Modify: `src/components/admin/SidebarNav.tsx` (grupo novo depois de "Estoque")
- Test: `tests/lista-do-repasse-no-painel.test.ts`

**Interfaces:**
- Consumes: `repasseDoPainelDaLinha`; `validaRepasse`; `inscritoDaLinha`, `COLUNAS_DO_INSCRITO`, `InscritoDoRepasse`; `NOME_DA_SITUACAO`, `SITUACOES_DO_REPASSE`, `FAIXAS_DO_REPASSE`, `contaDoRepasse`, `etiquetaDoRepasse`, `emReais`, `soParaLojistas`; `ehTabelaOuColunaAusente`, `mensagemDeMigracaoPendente`; `useConfirm`.
- Produces:
  - `ABAS_DO_PAINEL`, `contarPorSituacao(repasses)`, `abaInicial(contagem, valida)`, `abaDaUrl(valor, padrao)` (`src/lib/painelDoRepasse.ts`).
  - `<TabelaDeInscritos inscritos />`.
  - Páginas `/admin/repasse` e `/admin/repasse/inscritos`; grupo "Repasse" no menu.

- [ ] **Step 1: Escrever os testes que falham**

`tests/lista-do-repasse-no-painel.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";
import { abaDaUrl, abaInicial, contarPorSituacao } from "../src/lib/painelDoRepasse";

let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/repasse",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const { ConfirmProvider } = await import("../src/components/admin/ConfirmDialog");
const PaginaDaLista = (await import("../src/app/admin/repasse/page")).default;
const PaginaDosInscritos = (await import("../src/app/admin/repasse/inscritos/page")).default;
const SidebarNav = (await import("../src/components/admin/SidebarNav")).default;

const ISO = "2026-09-24T12:00:00Z";
const texto = (el: ReactElement) =>
  renderToStaticMarkup(createElement(ConfirmProvider, null, el)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function entrarComo(papeis: string[]) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis);
}
beforeEach(() => entrarComo(["comercial"]));

describe("abas", () => {
  it("quem valida começa pelo que aguarda validação, se houver", () => {
    const contagem = contarPorSituacao([{ situacao: "em_validacao" }, { situacao: "rascunho" }]);
    expect(contagem.em_validacao).toBe(1);
    expect(abaInicial(contagem, true)).toBe("em_validacao");
    expect(abaInicial(contarPorSituacao([]), true)).toBe("publicado");
    expect(abaInicial(contagem, false)).toBe("rascunho");
  });

  it("aba da URL só vale se for situação", () => {
    expect(abaDaUrl("vendido", "rascunho")).toBe("vendido");
    expect(abaDaUrl("qualquer", "rascunho")).toBe("rascunho");
    expect(abaDaUrl(undefined, "publicado")).toBe("publicado");
  });
});

describe("/admin/repasse", () => {
  const LINHAS = [
    linhaDoBancoDeTeste({ id: "a1111111-1111-4111-8111-111111111111", situacao: "em_validacao", modelo: "Kwid" }),
    linhaDoBancoDeTeste({ id: "b2222222-2222-4222-8222-222222222222", situacao: "publicado", modelo: "Argo", lojistas_desde: ISO }),
  ];

  it("comercial abre na validação, com a contagem e o link da lista", async () => {
    banco.leituras.repasses = { data: LINHAS, error: null };
    const html = texto(await PaginaDaLista({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Aguardando validação");
    expect(html).toContain("Kwid");
    expect(html).not.toContain("Argo");
    expect(html).toContain("Lista do repasse");
  });

  it("a aba da URL troca a lista", async () => {
    banco.leituras.repasses = { data: LINHAS, error: null };
    const html = texto(await PaginaDaLista({ searchParams: Promise.resolve({ aba: "publicado" }) }));
    expect(html).toContain("Argo");
    expect(html).toContain("Só para lojistas");
  });

  it("marketing não vê o link da lista de inscritos", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: LINHAS, error: null };
    expect(texto(await PaginaDaLista({ searchParams: Promise.resolve({}) }))).not.toContain("Lista do repasse");
  });

  it("antes da migração, avisa em vez de quebrar", async () => {
    banco.leituras.repasses = { data: null, error: { message: "x", code: "PGRST205" } };
    expect(texto(await PaginaDaLista({ searchParams: Promise.resolve({}) }))).toContain("20260924180000_repasse_fundacao.sql");
  });
});

describe("/admin/repasse/inscritos", () => {
  it("quem não valida volta para a lista de carros", async () => {
    entrarComo(["marketing"]);
    await expect(PaginaDosInscritos()).rejects.toThrow("NEXT_REDIRECT:/admin/repasse");
    expect(banco.lidas).not.toContain("repasse_inscritos");
  });

  it("comercial vê a lista, o CNPJ a conferir e a saída que apaga", async () => {
    banco.leituras.repasse_inscritos = {
      data: [
        { id: "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f", trilha: "lojista", nome: "Auto Bom Ltda", whatsapp: "41999990000", faixa: null, carrocerias: [], cnpj: "12345678000190", loja_cidade: "Auto Bom, Curitiba", cnpj_conferido_em: null, created_at: ISO },
        { id: "8c2f3e4d-5b6c-4d7e-9f0a-1b2c3d4e5f60", trilha: "consumidor", nome: "Ana Souza", whatsapp: "41988880000", faixa: "30-50", carrocerias: ["hatch"], cnpj: null, loja_cidade: null, cnpj_conferido_em: null, created_at: ISO },
      ],
      error: null,
    };
    const html = texto(await PaginaDosInscritos());
    expect(html).toContain("Auto Bom Ltda");
    expect(html).toContain("Marcar CNPJ conferido");
    expect(html).toContain("De R$ 30 mil a R$ 50 mil");
    expect(html).toContain("Tirar da lista");
  });
});

describe("o menu", () => {
  const menu = (perfis: string[]) => texto(createElement(SidebarNav, { perfis }));

  it("todo perfil vê os carros de repasse", () => {
    for (const perfil of ["admin", "gestor", "marketing", "comercial", "financeiro"]) {
      expect(menu([perfil]), perfil).toContain("Carros de repasse");
    }
  });

  it("só quem valida vê a lista do repasse", () => {
    expect(menu(["comercial"])).toContain("Lista do repasse");
    expect(menu(["gestor"])).toContain("Lista do repasse");
    expect(menu(["marketing"])).not.toContain("Lista do repasse");
    expect(menu(["financeiro"])).not.toContain("Lista do repasse");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/lista-do-repasse-no-painel.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `painelDoRepasse.ts`**

```ts
/** As abas da lista `/admin/repasse` (spec §6): por situação, com contagem. */
import { SITUACOES_DO_REPASSE, type SituacaoDoRepasse } from "./repasse";

export const ABAS_DO_PAINEL: ReadonlyArray<{ situacao: SituacaoDoRepasse; rotulo: string }> = [
  { situacao: "em_validacao", rotulo: "Aguardando validação" },
  { situacao: "rascunho", rotulo: "Rascunhos" },
  { situacao: "publicado", rotulo: "Publicados" },
  { situacao: "reservado", rotulo: "Reservados" },
  { situacao: "vendido", rotulo: "Vendidos" },
  { situacao: "arquivado", rotulo: "Arquivados" },
];

export function contarPorSituacao(repasses: ReadonlyArray<{ situacao: SituacaoDoRepasse }>): Record<SituacaoDoRepasse, number> {
  const contagem = Object.fromEntries(SITUACOES_DO_REPASSE.map((s) => [s, 0])) as Record<SituacaoDoRepasse, number>;
  for (const r of repasses) contagem[r.situacao] += 1;
  return contagem;
}

/** Quem valida começa pelo que o espera; quem cadastra, pelos rascunhos. */
export function abaInicial(contagem: Record<SituacaoDoRepasse, number>, valida: boolean): SituacaoDoRepasse {
  if (!valida) return "rascunho";
  return contagem.em_validacao > 0 ? "em_validacao" : "publicado";
}

export function abaDaUrl(valor: string | undefined, padrao: SituacaoDoRepasse): SituacaoDoRepasse {
  return (SITUACOES_DO_REPASSE as readonly string[]).includes(valor ?? "") ? (valor as SituacaoDoRepasse) : padrao;
}
```

- [ ] **Step 4: Implementar a página da lista**

`src/app/admin/repasse/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { validaRepasse } from "../../../lib/edicaoDoRepasse";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../lib/erroDeSchema";
import { ABAS_DO_PAINEL, abaDaUrl, abaInicial, contarPorSituacao } from "../../../lib/painelDoRepasse";
import { papelPadraoPorEmail } from "../../../lib/papelPadrao";
import { ehStaff, perfisDe } from "../../../lib/permissoes";
import { contaDoRepasse, emReais, etiquetaDoRepasse, soParaLojistas, type RepasseDoPainel } from "../../../lib/repasse";
import { repasseDoPainelDaLinha } from "../../../lib/repasseDoPainel";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Repasse — Motors Store",
};

/**
 * `/admin/repasse` (spec §6): os carros por situação. Todo perfil da equipe
 * abre (todos cadastram); o link da lista de inscritos só aparece para quem
 * valida, como no menu.
 */
export default async function RepassesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");
  const valida = validaRepasse(perfisDe(origem));

  const { data, error } = await supabase.from("repasses").select("*").order("updated_at", { ascending: false }).limit(500);
  if (error && ehTabelaOuColunaAusente(error)) {
    return <p className="text-sm text-mt-accent-800">{mensagemDeMigracaoPendente("20260924180000_repasse_fundacao.sql")}</p>;
  }
  const repasses = ((data ?? []) as Record<string, unknown>[]).flatMap((linha) => {
    const r = repasseDoPainelDaLinha(linha);
    return r ? [r] : [];
  });
  const contagem = contarPorSituacao(repasses);
  const { aba } = await searchParams;
  const atual = abaDaUrl(aba, abaInicial(contagem, valida));
  const daAba = repasses.filter((r) => r.situacao === atual);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 border-b-2 border-mt-regua pb-5">
        <div>
          <div className="mt-rotulo">Painel / Repasse</div>
          <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">Carros de repasse</h1>
        </div>
        <div className="ml-auto flex gap-2">
          {valida && (
            <Link href="/admin/repasse/inscritos" className="mt-btn mt-btn-contorno mt-foco px-4 py-2.5 text-[11px]">
              Lista do repasse
            </Link>
          )}
          <Link href="/admin/repasse/novo" className="mt-btn mt-btn-primario mt-foco px-4 py-2.5 text-[11px]">
            Cadastrar carro
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Situação">
        {ABAS_DO_PAINEL.map(({ situacao, rotulo }) => (
          <Link
            key={situacao}
            href={`/admin/repasse?aba=${situacao}`}
            aria-current={situacao === atual ? "page" : undefined}
            className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.06em] no-underline ${
              situacao === atual ? "border-mt-ink bg-mt-ink text-mt-bg" : "border-mt-regua-fina text-mt-neutral-800"
            }`}
          >
            {rotulo} <span className="tabular-nums">{contagem[situacao]}</span>
          </Link>
        ))}
      </nav>

      {daAba.length === 0 ? (
        <p className="text-sm text-mt-neutral-700">Nenhum carro nesta situação.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-mt-regua-fina">
          {daAba.map((r) => (
            <LinhaDoRepasse key={r.id} repasse={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaDoRepasse({ repasse: r }: { repasse: RepasseDoPainel }) {
  const conta = contaDoRepasse(r);
  return (
    <li className="flex flex-wrap items-center gap-4 py-3 text-sm">
      <Link href={`/admin/repasse/${r.id}`} className="font-bold underline">
        {[r.marca, r.modelo, r.versao, r.ano_modelo].filter(Boolean).join(" ")}
      </Link>
      <span className="mt-rotulo">{etiquetaDoRepasse(r)}</span>
      {r.situacao === "publicado" && <span className="text-xs">{soParaLojistas(r) ? "Só para lojistas" : "Aberto a todos"}</span>}
      <span className="ml-auto tabular-nums">{emReais(r.preco)}</span>
      {conta.abaixoDaFipe !== null && conta.abaixoDaFipe > 0 && (
        <span className="text-xs tabular-nums text-mt-neutral-700">{emReais(conta.abaixoDaFipe)} abaixo da FIPE</span>
      )}
    </li>
  );
}
```

- [ ] **Step 5: Implementar a tabela e a página dos inscritos**

`src/components/admin/repasse/TabelaDeInscritos.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useConfirm } from "../ConfirmDialog";
import type { InscritoDoRepasse } from "../../../lib/avisosDoRepasse";
import { FAIXAS_DO_REPASSE } from "../../../lib/repasse";

const rotuloDaFaixa = (id: string | null) => FAIXAS_DO_REPASSE.find((f) => f.id === id)?.rotulo ?? "Qualquer faixa";

/**
 * A lista do repasse (spec §6, tela "Inscritos"): conferir o CNPJ do lojista
 * e tirar alguém da lista. Tirar APAGA a linha — é o que a /privacidade
 * promete —, por isso pede confirmação dizendo que não tem volta.
 */
export default function TabelaDeInscritos({ inscritos: iniciais }: { inscritos: InscritoDoRepasse[] }) {
  const { confirm } = useConfirm();
  const [inscritos, setInscritos] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(null);

  async function conferir(i: InscritoDoRepasse) {
    setErro(null);
    const res = await fetch(`/api/repasse-inscritos/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj_conferido: !i.cnpj_conferido_em }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { error?: string; inscrito?: InscritoDoRepasse }) : {};
    if (!res || !res.ok || !data.inscrito) {
      setErro(data.error || "Não deu para gravar.");
      return;
    }
    const novo = data.inscrito;
    setInscritos((lista) => lista.map((x) => (x.id === i.id ? novo : x)));
  }

  async function tirar(i: InscritoDoRepasse) {
    const ok = await confirm({
      title: "Tirar da lista",
      message: `Apaga o perfil de ${i.nome} na lista do repasse, como a política de privacidade promete. Não tem volta.`,
      confirmLabel: "Tirar da lista",
      type: "danger",
    });
    if (!ok) return;
    setErro(null);
    const res = await fetch(`/api/repasse-inscritos/${i.id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      const data = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setErro(data.error || "Não deu para tirar da lista.");
      return;
    }
    setInscritos((lista) => lista.filter((x) => x.id !== i.id));
  }

  if (inscritos.length === 0) return <p className="text-sm text-mt-neutral-700">Ninguém na lista ainda.</p>;

  return (
    <>
      <ul className="flex flex-col divide-y divide-mt-regua-fina">
        {inscritos.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-xs">
            <strong className="text-sm">{i.nome}</strong>
            <span className="tabular-nums">{i.whatsapp}</span>
            {i.trilha === "lojista" ? (
              <>
                <span>Lojista · CNPJ {i.cnpj}</span>
                {i.loja_cidade && <span className="text-mt-neutral-700">{i.loja_cidade}</span>}
                <button type="button" onClick={() => void conferir(i)} className="mt-btn mt-btn-contorno mt-foco px-3 py-1.5 text-[10px]">
                  {i.cnpj_conferido_em ? "CNPJ conferido · desmarcar" : "Marcar CNPJ conferido"}
                </button>
              </>
            ) : (
              <>
                <span>Compra para usar · {rotuloDaFaixa(i.faixa)}</span>
                {i.carrocerias.length > 0 && <span className="text-mt-neutral-700">{i.carrocerias.join(", ")}</span>}
              </>
            )}
            <button type="button" onClick={() => void tirar(i)} className="mt-btn mt-btn-contorno mt-foco ml-auto px-3 py-1.5 text-[10px]">
              Tirar da lista
            </button>
          </li>
        ))}
      </ul>
      {erro && <p role="alert" className="text-[11px] text-mt-accent-800">{erro}</p>}
    </>
  );
}
```

`src/app/admin/repasse/inscritos/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import TabelaDeInscritos from "../../../../components/admin/repasse/TabelaDeInscritos";
import { COLUNAS_DO_INSCRITO, inscritoDaLinha } from "../../../../lib/avisosDoRepasse";
import { validaRepasse } from "../../../../lib/edicaoDoRepasse";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import { ehStaff, perfisDe } from "../../../../lib/permissoes";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lista do repasse — Motors Store",
};

/**
 * A lista do repasse: WhatsApp e CNPJ. Só quem valida abre (a RLS diz o
 * mesmo desde 20260924200000) — e quem não valida volta ANTES de a página
 * pedir a lista ao banco.
 */
export default async function InscritosPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");
  if (!validaRepasse(perfisDe(origem))) redirect("/admin/repasse");

  const { data } = await supabase.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).order("created_at", { ascending: false });
  const inscritos = ((data ?? []) as Record<string, unknown>[]).flatMap((linha) => {
    const i = inscritoDaLinha(linha);
    return i ? [i] : [];
  });

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="border-b-2 border-mt-regua pb-5">
        <Link href="/admin/repasse" className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 no-underline hover:text-mt-accent">
          ← REPASSE
        </Link>
        <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">Lista do repasse</h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-mt-neutral-800">
          Quem pediu aviso de carro de repasse. Confira o CNPJ do lojista antes do primeiro aviso. Quem pedir para sair é
          apagado daqui.
        </p>
      </div>
      <TabelaDeInscritos inscritos={inscritos} />
    </div>
  );
}
```

- [ ] **Step 6: O grupo no menu**

Em `src/components/admin/SidebarNav.tsx`, logo depois do objeto do grupo "Estoque" (o que tem `title: "Estoque"`), acrescentar:

```ts
    {
      // Repasse Motors (2026-09-24): carros vendidos no estado, sem a
      // garantia da loja. Todo perfil cadastra (dono, 24/09); a lista de
      // inscritos — WhatsApp e CNPJ — é só de quem valida (Administrador,
      // Gestor, Comercial), como a RLS e a página. Quando o papel SDR entrar
      // (integracao/quem-entra-24-09), ele vai para `roles` do grupo e fica
      // fora do item da lista.
      title: "Repasse",
      roles: ["admin", "gestor", "comercial", "marketing", "financeiro"],
      items: [
        { name: "Carros de repasse", href: "/admin/repasse" },
        { name: "Lista do repasse", href: "/admin/repasse/inscritos", roles: ["admin", "gestor", "comercial"] },
      ],
    },
```

- [ ] **Step 7: Rodar**

Run: `npx vitest run tests/lista-do-repasse-no-painel.test.ts tests/papeis-gestor-investidor.test.ts tests/papeis-nos-gates.test.ts tests/agenda.test.ts tests/fila-de-erros.test.ts`
Expected: PASS. Os quatro arquivos antigos leem o fonte do `SidebarNav`; se algum reprovar, é porque uma frase que eles procuram mudou — a correção é no `SidebarNav`, não no teste antigo.

- [ ] **Step 8: Provar as travas com o bug real**

Uma de cada vez; ver reprovar; desfazer:
1. Tirar `roles: ["admin", "gestor", "comercial"]` do item "Lista do repasse" → "só quem valida vê a lista do repasse" reprova.
2. Na página dos inscritos, mover o `if (!validaRepasse(...)) redirect(...)` para depois da leitura → "quem não valida volta … e nem lê" reprova.
3. Em `abaInicial`, devolver sempre `"rascunho"` → "quem valida começa pelo que aguarda validação" reprova.

- [ ] **Step 9: Commit**

```bash
git add src/lib/painelDoRepasse.ts src/components/admin/repasse/TabelaDeInscritos.tsx src/app/admin/repasse/page.tsx "src/app/admin/repasse/inscritos/page.tsx" src/components/admin/SidebarNav.tsx tests/lista-do-repasse-no-painel.test.ts
git commit -m "feat(repasse): lista de carros por situação, lista de inscritos e o grupo no menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Fechamento — CI, revisão, gravação e PR (controlador)

**Files:** nenhum arquivo novo; ledger em `.superpowers/sdd/2026-09-24-repasse-pr2-painel/progress.md`.

- [ ] **Step 1: Push**

```bash
git push -u origin feat/repasse-painel
```

- [ ] **Step 2: Suíte inteira uma vez, local**

Run: `npx vitest run`
Expected: nenhuma falha. (Ruling herdado do PR 1: uma volta local da suíte inteira no fim pega a varredura global que os arquivos focados não pegam, como a de `tests/promessa-publica.test.ts`.)

- [ ] **Step 3: CI concluído e verde nos cinco jobs**

Conferir o run `testes` do head pelo navegador embutido, na página do commit (memória `medir-ci-sem-gh`). Só segue com `completed success` nos cinco.

- [ ] **Step 4: Revisão final do branch com o checklist do `qa-guardian`**

Um revisor Opus com o modelo de revisão final e o checklist do `qa-guardian` dentro (ruling do PR 1: as duas são a mesma porta). Bloqueios corrigidos numa rodada única; nova volta de CI.

- [ ] **Step 5: Gravar a migração — SÓ com ordem explícita do dono**

Perguntar ao dono. Com o "pode gravar":

```powershell
cd C:\Users\Lenovo\Documents\motors-claude\motors-site-oficial
node supabase/manutencao/aplicar-migracao.js ..\wt-repasse-painel\supabase\migrations\20260924200000_repasse_escrita_pela_rota.sql --gravar
```

Expected: o `NOTICE` do aceite e `GRAVADA: 20260924200000_repasse_escrita_pela_rota.sql`. Depois, conferir de fora com a chave anon que `repasse_inscritos` continua 401.

- [ ] **Step 6: Abrir o PR — pelo Chrome do dono, com o ok dele**

Base: `main`. Corpo com: o que entra, a migração (ensaio, sabotagens S1 e S2, gravação), a verificação (CI, suíte), **a ordem de merge (junto com o PR 3 ou depois)**, a nota do SDR no `SidebarNav`, e que depende do #144.
