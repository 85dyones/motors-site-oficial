# Landing pages de campanha — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam `- [ ]` para acompanhamento.

**Objetivo:** Permitir criar landing pages de campanha com URL própria e design livre, capturando lead rastreado, e com aposentadoria programada — entregando `/pole-position-2026` no ar antes de 12/09.

**Arquitetura:** Um registro em TypeScript (`src/lib/campanhas.ts`) é a fonte única sobre cada campanha; dele bebem o sitemap, a moldura do site, o redirect de aposentadoria e o CTA. As LPs vivem num route group `(campanha)` que não aparece na URL, largam header e rodapé, e mantêm tracking e aviso de cookies. O CTA reusa `LeadCaptureModal` e `POST /api/leads` sem alterar o endpoint.

**Stack:** Next.js (App Router), React, TypeScript, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-landing-pages-de-campanha-design.md`

## Restrições globais

Valem para toda tarefa deste plano.

- **Idioma:** código, nomes, comentários e commits em **português**. Não anglicizar.
- **Migração aditiva:** este plano não toca banco. Nenhuma migração, nenhuma tabela, nenhuma policy.
- **`/api/leads` não muda.** Nenhuma linha. Se uma tarefa parecer exigir isso, pare e reveja.
- **`TRACKING_SPEC.md`:** nenhum evento renomeado ou removido. A LP dispara `Lead`, que já existe.
- **Regra 5 do `CLAUDE.md`:** nenhuma menção pública a recompra ou percentual de FIPE.
- **Não inventar número.** Datas, valores e condições vêm do folder (§5 do spec) ou do banco.
- **Windows:** comparar caminhos com `path.join`/`path.sep`. `endsWith("/algo")` falha nesta máquina — já deixou teste verde guardando defeito.
- **Sem BOM:** não gravar arquivo com `Set-Content` do PowerShell; ele injeta BOM que passa por `tsc`, `eslint` e `vitest` e só aparece nos bytes.
- **Comando de teste:** `npx vitest run <arquivo>`. A suíte cheia é `npm test`.
- **Commits:** terminar a mensagem com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **QA:** `qa-guardian` revisa antes do merge.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `src/lib/campanhas.ts` | **Criar.** O registro e as perguntas sobre ele (viva? qual o caminho? é rota de campanha?). Zero JSX, zero React — para ser testável e importável pelo servidor e pelo cliente. | 1 |
| `src/components/MolduraDoSite.tsx` | **Modificar.** Passa a conhecer campanha, e separa *moldura de navegação* de *aviso legal*. | 1 |
| `src/app/layout.tsx` | **Modificar.** Tira `CookieConsentBanner` de dentro da moldura e o põe no wrapper legal novo. | 1 |
| `src/app/sitemap.ts` | **Modificar.** Acrescenta as campanhas vivas. | 1 |
| `src/app/(campanha)/layout.tsx` | **Criar.** A casca em branco, e o lugar onde a regra do grupo está escrita. | 1 |
| `tests/campanhas-registro.test.ts` | **Criar.** O registro, a vigência com fuso, e a amarra que reprova LP não registrada. | 1 |
| `src/lib/leadDeCampanha.ts` | **Criar.** A frase na voz do cliente e o corpo do POST. Espelha `src/lib/encomenda.ts`. | 2 |
| `src/lib/turnstile.ts` | **Modificar.** `ACOES.campanha` e entrada em `ACOES_DE_LEADS`. | 2 |
| `src/components/campanha/CtaDeCampanha.tsx` | **Criar.** O botão, o modal e o envio. | 2 |
| `tests/campanha-cta.test.ts` | **Criar.** A ação dos dois lados, a frase, e o corpo do POST. | 2 |
| `src/app/(campanha)/pole-position-2026/page.tsx` | **Criar.** A LP em si — design livre. | 3 |
| `tests/pole-position.test.ts` | **Criar.** Metadata, conteúdo do folder e as proibições. | 3 |

**Por que `campanhas.ts` não tem React:** ele é importado por um client component (`MolduraDoSite`), por um server component (a página) e por `sitemap.ts`. Manter só dado e função pura evita arrastar `"use client"` para o sitemap.

---

## Tarefa 1 — O registro, a casca e as amarras

**Arquivos:**
- Criar: `src/lib/campanhas.ts`
- Criar: `src/app/(campanha)/layout.tsx`
- Modificar: `src/components/MolduraDoSite.tsx`
- Modificar: `src/app/layout.tsx`
- Modificar: `src/app/sitemap.ts`
- Testar: `tests/campanhas-registro.test.ts`

**Interfaces:**
- Consome: nada de tarefas anteriores.
- Produz, e as tarefas 2 e 3 dependem destes nomes exatos:
  - `interface Campanha { slug, nome, inicio, fim, destinoAposFim, descricao, fraseDoCliente: string }`
  - `const CAMPANHAS: Campanha[]`
  - `campanhaPorSlug(slug: string): Campanha | undefined`
  - `campanhaEstaViva(campanha: Campanha, agora: Date): boolean`
  - `campanhasVivas(agora: Date): Campanha[]`
  - `caminhoDaCampanha(campanha: Campanha): string`
  - `ehRotaDeCampanha(pathname: string | null | undefined): boolean`
  - `export function AvisoLegalDoSite({ children }: { children: ReactNode })` em `MolduraDoSite.tsx`

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/campanhas-registro.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CAMPANHAS,
  campanhaPorSlug,
  campanhaEstaViva,
  campanhasVivas,
  caminhoDaCampanha,
  ehRotaDeCampanha,
  type Campanha,
} from "../src/lib/campanhas";

function campanha(parcial: Partial<Campanha> = {}): Campanha {
  return {
    slug: "teste-2026",
    nome: "Teste",
    inicio: "2026-09-12",
    fim: "2026-09-20",
    destinoAposFim: "/estoque",
    descricao: "Uma campanha de teste.",
    fraseDoCliente: "Olá, vi sobre o Teste e quero saber as condições",
    ...parcial,
  };
}

describe("a vigência respeita o fuso de Curitiba", () => {
  /*
   * `new Date("2026-09-20")` é MEIA-NOITE UTC — 21h do dia 19 em Curitiba.
   * Comparar assim mataria a campanha 27 horas antes da hora, no meio do
   * último dia de feirão. O último dia é inclusive, e termina 23:59:59 em -03.
   */
  it("está viva na manhã do primeiro dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-12T09:00:00-03:00"))).toBe(true);
  });

  it("está viva às 23h do ÚLTIMO dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-20T23:00:00-03:00"))).toBe(true);
  });

  it("morreu na madrugada seguinte ao último dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-21T00:30:00-03:00"))).toBe(false);
  });

  it("ainda não vive na véspera", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-11T23:00:00-03:00"))).toBe(false);
  });
});

describe("o caminho e a resolução", () => {
  it("o caminho é a raiz mais o slug — sem prefixo de pasta", () => {
    expect(caminhoDaCampanha(campanha({ slug: "pole-position-2026" }))).toBe("/pole-position-2026");
  });

  it("reconhece rota de campanha pelo pathname", () => {
    for (const c of CAMPANHAS) {
      expect(ehRotaDeCampanha(caminhoDaCampanha(c))).toBe(true);
    }
    expect(ehRotaDeCampanha("/estoque")).toBe(false);
    expect(ehRotaDeCampanha("/")).toBe(false);
    expect(ehRotaDeCampanha(null)).toBe(false);
  });

  it("campanhasVivas devolve só as vigentes na data dada", () => {
    const vivas = campanhasVivas(new Date("2026-09-15T12:00:00-03:00"));
    for (const c of vivas) {
      expect(campanhaEstaViva(c, new Date("2026-09-15T12:00:00-03:00"))).toBe(true);
    }
  });
});

describe("o registro se mantém honesto", () => {
  it("todo campo obrigatório está preenchido, e fim vem depois de inicio", () => {
    for (const c of CAMPANHAS) {
      expect(c.slug.trim()).not.toBe("");
      expect(c.nome.trim()).not.toBe("");
      expect(c.descricao.trim()).not.toBe("");
      expect(c.fraseDoCliente.trim()).not.toBe("");
      expect(c.destinoAposFim.startsWith("/")).toBe(true);
      expect(new Date(c.fim).getTime()).toBeGreaterThanOrEqual(new Date(c.inicio).getTime());
    }
  });

  it("nenhum slug se repete — o 301 fica em cache eterno no navegador", () => {
    const slugs = CAMPANHAS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("o slug carrega o ano, e por isso nunca se reusa", () => {
    for (const c of CAMPANHAS) {
      expect(c.slug).toMatch(/-20\d{2}$/);
    }
  });

  /*
   * A AMARRA. Pasta em (campanha)/ que não estiver no registro nasce sem
   * sitemap, sem card de compartilhamento e sem plano de morte — e nada disso
   * quebra a tela, então só um teste pega.
   *
   * Caminhos montados com path.join: comparar com endsWith("/algo") falha no
   * Windows e deixa a asserção verde sem nunca casar.
   */
  it("toda pasta em (campanha)/ está no registro", () => {
    const raiz = path.join(process.cwd(), "src", "app", "(campanha)");
    if (!fs.existsSync(raiz)) return;
    const pastas = fs
      .readdirSync(raiz, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const pasta of pastas) {
      expect(campanhaPorSlug(pasta), `a pasta ${pasta} não está em CAMPANHAS`).toBeDefined();
    }
  });

  it("toda campanha do registro tem pasta", () => {
    const raiz = path.join(process.cwd(), "src", "app", "(campanha)");
    for (const c of CAMPANHAS) {
      expect(fs.existsSync(path.join(raiz, c.slug)), `falta a pasta de ${c.slug}`).toBe(true);
    }
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/campanhas-registro.test.ts
```

Esperado: FALHA com `Failed to resolve import "../src/lib/campanhas"`.

- [ ] **Passo 3: Escrever o registro**

Criar `src/lib/campanhas.ts`:

```ts
/**
 * O registro das campanhas — a fonte única sobre cada landing page de ação
 * pontual da loja (feirão, lote, parceria, condição de mês).
 *
 * Quatro consumidores leem daqui, e é isso que impede a lista de redirects
 * órfãos que campanha costuma deixar para trás:
 *
 *   `sitemap.ts` ................ lista as vivas de hoje
 *   a página da campanha ........ redireciona quando a data venceu
 *   `MolduraDoSite` ............. sabe que a rota larga header e rodapé
 *   `CtaDeCampanha` ............. carimba o lead com o nome da campanha
 *
 * A aposentadoria de uma campanha é uma DATA no mesmo objeto onde ela nasceu,
 * e não uma entrada numa lista paralela que ninguém limpa.
 *
 * Sem React e sem `"use client"` de propósito: este módulo é importado por um
 * client component, por um server component e pelo sitemap. Só dado e função
 * pura atravessa as três fronteiras sem arrastar bundle.
 */

/** Curitiba. As datas do registro são dias civis daqui, não instantes UTC. */
const FUSO = "-03:00";

export interface Campanha {
  /**
   * O endereço na raiz, sem prefixo: `pole-position-2026` responde em
   * `/pole-position-2026`.
   *
   * **Carrega o ano e nunca se reusa.** A aposentadoria responde 308, que o
   * navegador guarda para sempre: um slug reciclado no ano seguinte herdaria o
   * redirect do anterior e a campanha nova nunca abriria. O teste cobra o ano.
   */
  slug: string;
  /** Nome comercial. Vira a etiqueta `canal` do lead, lida no Kanban. */
  nome: string;
  /** Dia civil de início, ISO `AAAA-MM-DD`. Vale a partir de 00:00 em Curitiba. */
  inicio: string;
  /** Último dia, INCLUSIVE. Vale até 23:59:59 em Curitiba. */
  fim: string;
  /** Para onde o 308 aponta depois de `fim`. Caminho interno, começa com `/`. */
  destinoAposFim: string;
  /** Uma linha, para o sitemap e para o card de compartilhamento. */
  descricao: string;
  /**
   * A frase que vai no WhatsApp e vira `interesse` no banco — **na voz do
   * cliente**, porque é ele quem manda o texto.
   *
   * Campo, e não template. `Olá, vi sobre o feirão ${nome}…` funcionaria para
   * a Pole Position e sairia errado na primeira campanha que não for feirão —
   * uma condição de mês, uma parceria. Cada campanha declara a sua, e o teste
   * cobra as proibições: sem prazo que a loja não controla, sem FIPE, sem
   * "abaixo da tabela", sem falar na voz da loja.
   */
  fraseDoCliente: string;
}

export const CAMPANHAS: Campanha[] = [];

export function campanhaPorSlug(slug: string): Campanha | undefined {
  return CAMPANHAS.find((c) => c.slug === slug);
}

/**
 * O dia civil de Curitiba, e não o instante UTC.
 *
 * `new Date("2026-09-20")` é meia-noite UTC — 21h do dia 19 aqui. Comparar
 * assim mataria a campanha 27 horas antes da hora, no meio do último dia de
 * feirão, e ninguém veria até um cliente reclamar que o link caiu.
 */
export function campanhaEstaViva(campanha: Campanha, agora: Date): boolean {
  const abre = new Date(`${campanha.inicio}T00:00:00.000${FUSO}`).getTime();
  const fecha = new Date(`${campanha.fim}T23:59:59.999${FUSO}`).getTime();
  const instante = agora.getTime();
  return instante >= abre && instante <= fecha;
}

export function campanhasVivas(agora: Date): Campanha[] {
  return CAMPANHAS.filter((c) => campanhaEstaViva(c, agora));
}

export function caminhoDaCampanha(campanha: Campanha): string {
  return `/${campanha.slug}`;
}

export function ehRotaDeCampanha(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return CAMPANHAS.some((c) => pathname === caminhoDaCampanha(c));
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/campanhas-registro.test.ts
```

Esperado: PASSA. As asserções que varrem `CAMPANHAS` passam por vacuidade — o registro está vazio, e é assim até a tarefa 3.

- [ ] **Passo 5: Criar a casca do route group**

Criar `src/app/(campanha)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * A casca das landing pages de campanha.
 *
 * `(campanha)` entre parênteses é ROUTE GROUP: agrupa os arquivos sem entrar
 * na URL. `pole-position-2026/page.tsx` daqui responde em
 * `/pole-position-2026`, na raiz, que é onde campanha tem de morar — o
 * endereço vai em anúncio, em story e em card de WhatsApp.
 *
 * A casca é deliberadamente vazia. A decisão do dono em 08/09 foi "página em
 * branco, design livre": cada LP desenha o seu, e o que se compartilha é o
 * CTA e o tracking, não o layout.
 *
 * O que NÃO se perde ao largar a moldura: `IntegrationsTracker`,
 * `CamadaDeDados` e `AntigravityTracker` estão FORA do `MolduraDoSite` no
 * layout raiz, então Pixel, CAPI e GA4 seguem rodando aqui. O aviso de cookies
 * também fica — ver `AvisoLegalDoSite`.
 *
 * ⚠️ **Não use os tokens `--brand-*` numa LP.** O script anti-flicker do layout
 * raiz os sobrescreve conforme o tema salvo no navegador do visitante (são
 * quatro), e a arte da campanha apareceria em dourado para quem tem
 * `stealth-dark`. LP de campanha declara cor literal.
 */
export default function LayoutDeCampanha({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen w-full flex-col">{children}</div>;
}
```

- [ ] **Passo 6: Escrever o teste da moldura**

Acrescentar ao fim de `tests/campanhas-registro.test.ts`:

```ts
import { lerCodigo } from "./fonte";

describe("a moldura sabe o que é campanha", () => {
  it("MolduraDoSite consulta o registro", () => {
    expect(lerCodigo("src/components/MolduraDoSite.tsx")).toMatch(/ehRotaDeCampanha/);
  });

  /*
   * O aviso de cookies NÃO some junto com o header. Antes desta mudança os
   * quatro (header, rodapé, popup e cookies) saíam no mesmo pacote; numa LP
   * pública isso é perda de conformidade, não de estilo.
   */
  it("o aviso de cookies sai do pacote da moldura no layout raiz", () => {
    const layout = lerCodigo("src/app/layout.tsx");
    expect(layout).toMatch(/AvisoLegalDoSite/);
    // O banner é filho do wrapper legal, não do de navegação.
    expect(layout).toMatch(/<AvisoLegalDoSite>[\s\S]*?<CookieConsentBanner \/>[\s\S]*?<\/AvisoLegalDoSite>/);
  });
});
```

- [ ] **Passo 7: Rodar e confirmar que falha**

```bash
npx vitest run tests/campanhas-registro.test.ts
```

Esperado: FALHA nos dois casos novos — `MolduraDoSite` ainda não cita `ehRotaDeCampanha`, e o layout não tem `AvisoLegalDoSite`.

- [ ] **Passo 8: Modificar `MolduraDoSite.tsx`**

Substituir o corpo do arquivo, mantendo o comentário existente sobre `/vitrine` e `/admin` e acrescentando:

```tsx
"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ehRotaDeCampanha } from "../lib/campanhas";

/* … comentário existente sobre /vitrine e /admin, preservado … */
const ROTAS_SEM_MOLDURA = ["/vitrine", "/admin"];

function foraDaLoja(pathname: string | null): boolean {
  return ROTAS_SEM_MOLDURA.some((rota) => pathname?.startsWith(rota));
}

/**
 * A moldura de NAVEGAÇÃO — cabeçalho, rodapé e o pop-up de captura.
 *
 * Some fora da loja (`/vitrine`, `/admin`) e nas landing pages de campanha. Na
 * campanha o motivo é outro: a página tem CTA próprio, e um pop-up de lead
 * competindo com ele rouba a conversão que a verba do anúncio pagou.
 */
export default function MolduraDoSite({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (foraDaLoja(pathname)) return null;
  if (ehRotaDeCampanha(pathname)) return null;
  return <>{children}</>;
}

/**
 * O aviso LEGAL — hoje, o banner de cookies.
 *
 * Separado da navegação porque as duas regras não são a mesma. `/vitrine` e
 * `/admin` seguem sem ele: são aparelhos da loja, não do cliente. A landing
 * page de campanha, ao contrário, é página pública aberta por cliente vindo de
 * anúncio — largar o header ali é escolha de design, largar o aviso de cookies
 * seria perda de conformidade.
 */
export function AvisoLegalDoSite({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (foraDaLoja(pathname)) return null;
  return <>{children}</>;
}
```

- [ ] **Passo 9: Modificar `src/app/layout.tsx`**

Trocar o import e o bloco final do `body`:

```tsx
import MolduraDoSite, { AvisoLegalDoSite } from "../components/MolduraDoSite";
```

```tsx
          <MolduraDoSite>
            <Footer navegacao={navegacaoDoRodape} />
            <LeadPopup />
          </MolduraDoSite>
          {/* Fora da moldura de navegação: a LP de campanha larga header e
              rodapé, mas o aviso de cookies acompanha o visitante. */}
          <AvisoLegalDoSite>
            <CookieConsentBanner />
          </AvisoLegalDoSite>
```

- [ ] **Passo 10: Rodar e confirmar que passa**

```bash
npx vitest run tests/campanhas-registro.test.ts
```

Esperado: PASSA, todos os casos.

- [ ] **Passo 11: Acrescentar as campanhas vivas ao sitemap**

Em `src/app/sitemap.ts`, importar e concatenar ao array `routes`:

```ts
import { campanhasVivas, caminhoDaCampanha } from "../lib/campanhas";
```

```ts
  // Campanhas vigentes hoje. Elas somem daqui sozinhas quando a data vence —
  // é o mesmo registro que faz a página redirecionar, então sitemap e site
  // nunca discordam sobre o que está no ar.
  //
  // Nota honesta: campanha de uma semana dificilmente chega a ranquear. Estar
  // aqui serve para não haver leitura de conteúdo duplicado enquanto ela vive,
  // e para o 308 ter o que preservar depois.
  const rotasDeCampanha: MetadataRoute.Sitemap = campanhasVivas(new Date()).map((c) => ({
    url: `${SITE_URL}${caminhoDaCampanha(c)}`,
    lastModified: new Date(`${c.inicio}T00:00:00.000-03:00`),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));
```

E incluir `...rotasDeCampanha` no retorno, junto das demais rotas.

- [ ] **Passo 12: Rodar a suíte cheia**

```bash
npm test
```

Esperado: PASSA. `MolduraDoSite` e `layout.tsx` são tocados por outros testes (travas de invariante varrem `src/`), e essa varredura só acusa na suíte cheia — rodar apenas o teste da tarefa esconderia a quebra até a revisão.

- [ ] **Passo 13: Commit**

```bash
git add src/lib/campanhas.ts "src/app/(campanha)/layout.tsx" src/components/MolduraDoSite.tsx src/app/layout.tsx src/app/sitemap.ts tests/campanhas-registro.test.ts
git commit -m "feat(campanha): o registro, a casca e o aviso que nao some junto com o header"
```

---

## Tarefa 2 — O CTA de campanha

**Arquivos:**
- Criar: `src/lib/leadDeCampanha.ts`
- Criar: `src/components/campanha/CtaDeCampanha.tsx`
- Modificar: `src/lib/turnstile.ts`
- Testar: `tests/campanha-cta.test.ts`

**Interfaces:**
- Consome da tarefa 1: `Campanha`, `caminhoDaCampanha`.
- Produz, e a tarefa 3 depende destes nomes:
  - `mensagemDaCampanha(campanha: Campanha): string`
  - `montarLeadDeCampanha(dados, campanha, extras)` → objeto do POST
  - `export default function CtaDeCampanha({ campanha, rotulo, className })`
  - `ACOES.campanha === "campanha"`

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/campanha-cta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ACOES, ACOES_DE_LEADS } from "../src/lib/turnstile";
import { mensagemDaCampanha, montarLeadDeCampanha } from "../src/lib/leadDeCampanha";
import { lerCodigo } from "./fonte";
import type { Campanha } from "../src/lib/campanhas";

const POLE: Campanha = {
  slug: "pole-position-2026",
  nome: "Pole Position",
  inicio: "2026-09-12",
  fim: "2026-09-20",
  destinoAposFim: "/estoque",
  descricao: "A largada para grandes oportunidades.",
  fraseDoCliente: "Olá, vi sobre o feirão Pole Position Motors e quero saber as condições",
};

const EXTRAS = {
  agUid: "ag-1",
  eventId: "evt-1",
  turnstileToken: "tok-1",
  utm: {},
  eventSourceUrl: "https://motorsstore.com.br/pole-position-2026",
  fbp: null,
  fbc: null,
};

describe("a ação do captcha existe dos dois lados", () => {
  /*
   * Esquecer a segunda metade não dá erro de compilação e não quebra a tela: o
   * widget resolve o desafio, o token viaja, e o `siteverify` recusa pela
   * action — o visitante leva 403 num botão que parece funcionar.
   */
  it("`campanha` está em ACOES e é aceita por /api/leads", () => {
    expect(ACOES.campanha).toBe("campanha");
    expect([...ACOES_DE_LEADS]).toContain(ACOES.campanha);
  });

  it("o CTA declara essa ação, e não outra", () => {
    expect(lerCodigo("src/components/campanha/CtaDeCampanha.tsx")).toMatch(
      /action=\{ACOES\.campanha\}/,
    );
  });
});

describe("a mensagem é a voz do cliente", () => {
  it("cita a campanha pelo nome", () => {
    expect(mensagemDaCampanha(POLE)).toContain("Pole Position");
  });

  /*
   * A frase vira `interesse` no banco e é lida por um consultor. Escrita na voz
   * da LOJA ("separei ótimas opções para você") grava um lead que mente sobre
   * quem falou — a mesma regra que `mensagemDaEncomenda` e o CarMatch seguem.
   */
  it("não fala na voz da loja", () => {
    const frase = mensagemDaCampanha(POLE).toLowerCase();
    expect(frase).not.toMatch(/separei|preparei|selecionamos para você/);
  });

  it("não promete prazo nem cita FIPE ou desconto", () => {
    const frase = mensagemDaCampanha(POLE).toLowerCase();
    expect(frase).not.toMatch(/fipe|abaixo da tabela|desconto|em \d+ dias/);
  });
});

describe("o corpo do POST", () => {
  const corpo = montarLeadDeCampanha(
    { nome: "Maria", email: "", whatsapp: "41999999999" },
    POLE,
    EXTRAS,
  );

  it("carimba o canal com o nome da campanha — é o que o consultor lê no Kanban", () => {
    expect(corpo.canal).toBe("Pole Position");
  });

  it("manda a frase em `mensagem`, de onde /api/leads deriva `interesse`", () => {
    expect(corpo.mensagem).toBe(mensagemDaCampanha(POLE));
  });

  /*
   * Decisão do dono em 08/09: a LP tem um CTA de campanha, não um por carro.
   * O lead entra SEM veículo, e isso é escolha registrada — não esquecimento a
   * ser "consertado" depois.
   */
  it("não inventa veículo", () => {
    expect("veiculo" in corpo).toBe(false);
  });

  it("leva o slug estruturado, para o n8n e o Motor de Gatilhos", () => {
    expect(corpo.intencao_busca).toMatchObject({
      campanha: "pole-position-2026",
      caminho: "/pole-position-2026",
    });
  });

  it("repassa identidade e token sem alterar", () => {
    expect(corpo.agUid).toBe("ag-1");
    expect(corpo.eventId).toBe("evt-1");
    expect(corpo.turnstileToken).toBe("tok-1");
  });

  it("omite e-mail vazio em vez de gravar string vazia", () => {
    expect(corpo.cliente.email).toBeUndefined();
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/campanha-cta.test.ts
```

Esperado: FALHA com `Failed to resolve import "../src/lib/leadDeCampanha"`.

- [ ] **Passo 3: Acrescentar a ação em `src/lib/turnstile.ts`**

Em `ACOES`, depois de `encomenda`:

```ts
  /** CTA das landing pages de campanha — `(campanha)/` (2026-09-08). */
  campanha: "campanha",
```

Em `ACOES_DE_LEADS`, acrescentar `ACOES.campanha,` ao fim da lista. Atualizar o comentário de bloco: `/api/leads` passa a atender **SETE** superfícies.

- [ ] **Passo 4: Escrever `src/lib/leadDeCampanha.ts`**

```ts
import type { Campanha } from "./campanhas";
import { caminhoDaCampanha } from "./campanhas";
import type { UtmParameters } from "./telemetry";

export interface DadosDoLeadDeCampanha {
  nome: string;
  email: string;
  whatsapp: string;
}

/**
 * A frase que a loja lê, na voz do CLIENTE.
 *
 * Ela vira o `interesse` da linha em `leads`: sem `veiculo` no corpo, a rota
 * deriva `interesse` daqui (`body.mensagem`, o segundo fallback), e uma frase
 * genérica grava um lead que não diz de onde a pessoa veio.
 *
 * O que a frase NÃO diz, e é regra e não estilo:
 *  - **prazo** que a loja não controla;
 *  - **FIPE, desconto ou "abaixo da tabela"** — o cliente nunca vê valor de
 *    compra no site;
 *  - **recompra** — regra 5 do `CLAUDE.md`, proibida em comunicação pública.
 */
export function mensagemDaCampanha(campanha: Campanha): string {
  return campanha.fraseDoCliente;
}

/**
 * O corpo do POST para `/api/leads`.
 *
 * Mesma rota e mesmo formato das outras seis superfícies. Tabela nova nenhuma:
 * o lead da campanha cai no mesmo Kanban, e o que o distingue é `canal` — o
 * padrão que `src/lib/encomenda.ts` estabeleceu.
 */
export function montarLeadDeCampanha(
  dados: DadosDoLeadDeCampanha,
  campanha: Campanha,
  extras: {
    agUid: string;
    eventId: string | null;
    turnstileToken: string;
    utm: UtmParameters;
    eventSourceUrl?: string;
    fbp: string | null;
    fbc: string | null;
  },
) {
  const email = dados.email.trim();

  return {
    tipo: "lead_campanha",
    // A etiqueta que o consultor lê no Kanban antes de abrir a conversa.
    canal: campanha.nome,
    mensagem: mensagemDaCampanha(campanha),
    cliente: {
      nome: dados.nome.trim(),
      whatsapp: dados.whatsapp.trim(),
      // O modal aceita e-mail vazio (`!email.trim() || regex`). String vazia no
      // banco é pior que ausência: parece dado coletado e some do filtro.
      ...(email ? { email } : {}),
    },
    // O texto é para o humano; isto é para o n8n e para o dia em que o Motor de
    // Gatilhos precisar saber de qual campanha veio o contato.
    intencao_busca: {
      campanha: campanha.slug,
      caminho: caminhoDaCampanha(campanha),
    },
    utm: extras.utm,
    agUid: extras.agUid,
    eventId: extras.eventId,
    eventSourceUrl: extras.eventSourceUrl,
    fbp: extras.fbp,
    fbc: extras.fbc,
    turnstileToken: extras.turnstileToken,
  };
}
```

> `UtmParameters` é exportado em `src/lib/telemetry.ts:196` — conferido. É o mesmo tipo que `src/lib/encomenda.ts` importa.

- [ ] **Passo 5: Rodar e confirmar que os testes de lib passam**

```bash
npx vitest run tests/campanha-cta.test.ts
```

Esperado: passam os blocos "a ação do captcha", "a mensagem" e "o corpo do POST". Continua FALHANDO só "o CTA declara essa ação" — o componente ainda não existe.

- [ ] **Passo 6: Escrever `src/components/campanha/CtaDeCampanha.tsx`**

```tsx
"use client";

import { useState } from "react";

import { useTheme } from "../../app/ThemeContext";
import { getActiveAgUid, getUtmParameters, trackLeadSubmission } from "../../lib/telemetry";
import { generateEventId, getMatchParams } from "../../lib/tracking-identity";
import { linkWhatsApp, telefoneDoLead } from "../../lib/whatsapp";
import { ACOES } from "../../lib/turnstile";
import { montarLeadDeCampanha, mensagemDaCampanha } from "../../lib/leadDeCampanha";
import type { Campanha } from "../../lib/campanhas";
import LeadCaptureModal from "../LeadCaptureModal";

/**
 * O CTA das landing pages de campanha.
 *
 * UM CTA por página, ancorado em quantos pontos o design quiser — é o mesmo
 * botão e o mesmo modal, não destinos diferentes. Decisão do dono em 08/09.
 *
 * O lead entra sem `veiculo_id`: numa campanha não existe "o veículo", e o
 * consultor descobre o carro na conversa. O custo foi aceito explicitamente —
 * a CAPI vai sem `content_ids`.
 *
 * A ordem do envio importa e não é estilo: grava o lead, DEPOIS conta a
 * conversão, DEPOIS abre o WhatsApp. Contar antes infla a métrica com quem
 * desistiu no meio e ensina o Ads a comprar esse clique.
 */
export default function CtaDeCampanha({
  campanha,
  rotulo,
  className,
}: {
  campanha: Campanha;
  rotulo?: string;
  className?: string;
}) {
  const { companySettings } = useTheme();
  const [aberto, setAberto] = useState(false);

  async function enviar(lead: {
    nome: string;
    email: string;
    whatsapp: string;
    turnstileToken: string;
  }) {
    // Gerado ANTES do POST para o pixel do navegador e a CAPI do servidor
    // compartilharem o mesmo id — é o que deduplica o evento no Meta.
    const eventId = generateEventId("Lead");
    const { fbp, fbc } = getMatchParams();

    const corpo = montarLeadDeCampanha(lead, campanha, {
      agUid: getActiveAgUid(),
      eventId,
      turnstileToken: lead.turnstileToken,
      utm: getUtmParameters(),
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      fbp,
      fbc,
    });

    // Nunca bloqueia: o visitante está a caminho do WhatsApp, e falha de
    // gravação nossa não pode segurá-lo. Perder o registro é ruim; travar o
    // contato é pior.
    try {
      const resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!resposta.ok) {
        console.warn("[CtaDeCampanha] /api/leads recusou (não bloqueante):", resposta.status);
      }
    } catch (erro) {
      console.warn("[CtaDeCampanha] rede falhou (não bloqueante):", erro);
    }

    const telefone = telefoneDoLead(lead.whatsapp);
    trackLeadSubmission(
      { marca: campanha.nome, modelo: "Campanha", preco: 0 },
      corpo.mensagem,
      {
        presetEventId: eventId,
        googleAdsId: companySettings?.googleAdsId,
        googleAdsConversionLabel: companySettings?.googleAdsConversionLabel,
        phoneE164: telefone.e164,
        // "contato", e não um valor novo. `TipoDeLead` tem cinco literais, e
        // os cinco estão DOCUMENTADOS em `TRACKING_SPEC.md:718` como o
        // contrato de `lead_type`. Acrescentar um sexto é permitido pela regra
        // 7 (adição, não renomeação), mas obrigaria a mexer no doc e no
        // container do GTM — o que não se faz quatro dias antes de a campanha
        // começar. O lead de campanha é um contato sem veículo, que é
        // exatamente o que "contato" descreve.
        //
        // A granularidade não se perde: `form_id` chega ao dataLayer com o
        // slug, e o banco guarda `canal = "Pole Position"`.
        tipoDeLead: "contato",
        formId: `form-${campanha.slug}`,
      },
    );

    setAberto(false);
    window.open(
      linkWhatsApp(companySettings, mensagemDaCampanha(campanha)),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={className}>
        {rotulo ?? `Quero as condições do ${campanha.nome}`}
      </button>
      <LeadCaptureModal
        isOpen={aberto}
        onClose={() => setAberto(false)}
        onSubmit={enviar}
        action={ACOES.campanha}
      />
    </>
  );
}
```

> `trackLeadSubmission` recebe `{ marca, modelo, preco }` porque a assinatura foi desenhada para veículo. Passar o nome da campanha em `marca` é o que `EncomendaDeCarro` já faz com `modelo: "Encomenda"`. `TipoDeLead` está em `src/lib/dataLayer.ts:460` e aceita exatamente `"proposta" | "financiamento" | "avaliacao" | "contato" | "curadoria"` — conferido.

- [ ] **Passo 7: Rodar e confirmar que passa**

```bash
npx vitest run tests/campanha-cta.test.ts
```

Esperado: PASSA, todos os casos.

- [ ] **Passo 8: Conferir tipos e lint**

```bash
npx tsc --noEmit && npx eslint src/lib/leadDeCampanha.ts src/components/campanha/CtaDeCampanha.tsx
```

Esperado: sem erro. Se `tsc` reclamar de `tipoDeLead` ou `UtmParameters`, resolva pelos nomes reais do repositório — não com `any`.

- [ ] **Passo 9: Commit**

```bash
git add src/lib/leadDeCampanha.ts src/components/campanha/CtaDeCampanha.tsx src/lib/turnstile.ts tests/campanha-cta.test.ts
git commit -m "feat(campanha): o CTA que grava o lead com o nome da campanha no canal"
```

---

## Tarefa 3 — A landing page Pole Position

**Arquivos:**
- Criar: `src/app/(campanha)/pole-position-2026/page.tsx`
- Modificar: `src/lib/campanhas.ts` (preencher `CAMPANHAS`)
- Criar: `public/campanhas/pole-position-2026-og.jpg` (1200×630)
- Testar: `tests/pole-position.test.ts`

**Interfaces:**
- Consome: tudo das tarefas 1 e 2.
- Produz: a rota `/pole-position-2026`.

**Conteúdo, conferido contra o folder — não inventar nada além disto:**

| campo | valor |
|---|---|
| Chamada | **Pole Position — a largada para grandes oportunidades** |
| Período | 12 a 20 de setembro |
| Selo | Condições exclusivas por uma semana |

Os seis argumentos, na ordem do folder, **com as ressalvas literais**:

1. **Lives com ofertas relâmpago** — bônus que *podem chegar a* R$ 10 mil
2. **Carros selecionados** — cada veículo escolhido e avaliado criteriosamente
3. **Primeira parcela em até 120 dias** — *conforme as condições de financiamento*
4. **Transferência + tanque cheio** — *em veículos selecionados*
5. **Garantia Motors Store**
6. **Perícia cautelar aprovada**

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/pole-position.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CAMPANHAS, campanhaPorSlug, campanhaEstaViva } from "../src/lib/campanhas";
import { lerCodigo } from "./fonte";

const SLUG = "pole-position-2026";

describe("a campanha está registrada", () => {
  it("existe, com as datas do folder", () => {
    const c = campanhaPorSlug(SLUG);
    expect(c).toBeDefined();
    expect(c!.nome).toBe("Pole Position");
    expect(c!.inicio).toBe("2026-09-12");
    expect(c!.fim).toBe("2026-09-20");
  });

  it("vive de 12 a 20 e morre em 21", () => {
    const c = campanhaPorSlug(SLUG)!;
    expect(campanhaEstaViva(c, new Date("2026-09-12T08:00:00-03:00"))).toBe(true);
    expect(campanhaEstaViva(c, new Date("2026-09-20T22:00:00-03:00"))).toBe(true);
    expect(campanhaEstaViva(c, new Date("2026-09-21T08:00:00-03:00"))).toBe(false);
  });
});

describe("a página", () => {
  const codigo = () => lerCodigo(`src/app/(campanha)/${SLUG}/page.tsx`);

  it("declara canonical próprio — senão herda o do layout raiz, que não tem", () => {
    expect(codigo()).toMatch(/canonical/);
  });

  it("declara card de compartilhamento", () => {
    expect(codigo()).toMatch(/montarCompartilhamento|openGraph/);
  });

  /*
   * `robots.ts` bloqueia `/api/`. Um og:image servido dali responde 200 no
   * navegador e chega SEM IMAGEM no WhatsApp — que é justamente por onde a
   * campanha circula.
   */
  it("a imagem do card não fica sob /api/", () => {
    const og = codigo().match(/["'](\/[^"']*(?:og|compartilhamento)[^"']*)["']/gi) ?? [];
    for (const caminho of og) {
      expect(caminho).not.toMatch(/\/api\//);
    }
  });

  it("redireciona quando a data vence", () => {
    expect(codigo()).toMatch(/permanentRedirect/);
    expect(codigo()).toMatch(/campanhaEstaViva/);
  });

  it("revalida rápido — o 308 só entra na revalidação", () => {
    expect(codigo()).toMatch(/export const revalidate = 300/);
  });

  it("usa o CTA de campanha, e não um link solto para o WhatsApp", () => {
    expect(codigo()).toMatch(/CtaDeCampanha/);
    expect(codigo()).not.toMatch(/href=["']https:\/\/(wa\.me|api\.whatsapp)/);
  });
});

describe("o conteúdo é o do folder, com as ressalvas", () => {
  const codigo = () => lerCodigo(`src/app/(campanha)/${SLUG}/page.tsx`);

  it("traz a chamada", () => {
    expect(codigo()).toMatch(/largada para grandes oportunidades/i);
  });

  it("o bônus vem com o 'podem chegar a', e não como promessa", () => {
    const texto = codigo();
    expect(texto).toMatch(/10 mil|10\.000/);
    expect(texto).toMatch(/podem chegar/i);
  });

  it("os 120 dias vêm com a condicional do financiamento", () => {
    expect(codigo()).toMatch(/conforme as condições de financiamento/i);
  });

  it("transferência e tanque vêm com 'em veículos selecionados'", () => {
    expect(codigo()).toMatch(/em veículos selecionados/i);
  });

  /*
   * Regra 5 do CLAUDE.md: comunicação pública de recompra é proibida antes de
   * parecer jurídico e provisionamento. O folder não menciona; a LP também não.
   */
  it("não menciona recompra nem percentual de FIPE", () => {
    expect(codigo().toLowerCase()).not.toMatch(/recompra|% da fipe|percentual da fipe/);
  });

  /*
   * POSICIONAMENTO.md: 90 dias é o mínimo legal de PJ e não se vende como
   * diferencial. A garantia é afirmada; o diferencial fica na perícia.
   */
  it("não vende os três meses de garantia como diferencial", () => {
    expect(codigo().toLowerCase()).not.toMatch(/exclusiv[ao] .{0,20}(garantia|3 meses|três meses)/);
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npx vitest run tests/pole-position.test.ts
```

Esperado: FALHA — a campanha não está no registro e a página não existe.

- [ ] **Passo 3: Registrar a campanha**

Em `src/lib/campanhas.ts`, preencher `CAMPANHAS`:

```ts
export const CAMPANHAS: Campanha[] = [
  {
    slug: "pole-position-2026",
    nome: "Pole Position",
    inicio: "2026-09-12",
    fim: "2026-09-20",
    destinoAposFim: "/estoque",
    descricao:
      "Pole Position na Motors Store: lives com ofertas relâmpago, primeira parcela em até 120 dias " +
      "e transferência por nossa conta em veículos selecionados. De 12 a 20 de setembro, em Curitiba.",
    // Escrita pelo dono em 08/09. É o que chega no WhatsApp e vira `interesse`.
    fraseDoCliente: "Olá, vi sobre o feirão Pole Position Motors e quero saber as condições",
  },
];
```

- [ ] **Passo 4: Preparar a imagem do card**

Extrair a arte do folder para `public/campanhas/pole-position-2026-og.jpg`, em **1200×630**.

Duas regras, e as duas já custaram caro neste repositório:
1. **Fora de `/api/`.** `robots.ts` bloqueia esse caminho e o card chega sem imagem no WhatsApp.
2. **Dimensão declarada = dimensão real.** Um card já saiu com o logo deformado por declarar 1200×630 num arquivo 1024×513 — o scraper estica para o que foi declarado.

- [ ] **Passo 5: Escrever a página**

Criar `src/app/(campanha)/pole-position-2026/page.tsx`. Esqueleto obrigatório — o **design entre as seções é livre**, e é onde o dono pede apoio:

```tsx
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

import { campanhaPorSlug, campanhaEstaViva } from "../../../lib/campanhas";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import CtaDeCampanha from "../../../components/campanha/CtaDeCampanha";

/**
 * Pole Position — 12 a 20 de setembro de 2026.
 *
 * Quem abre: quem clicou no anúncio, no story ou no card do WhatsApp. Que
 * decisão sai daqui: falar com a loja durante a semana da campanha.
 *
 * ⚠️ Cores literais, nunca os tokens `--brand-*`: o script anti-flicker do
 * layout raiz os troca conforme o tema salvo no navegador do visitante, e a
 * arte de corrida apareceria em dourado para quem tem `stealth-dark`.
 */

const CAMPANHA = campanhaPorSlug("pole-position-2026")!;
const CAMINHO = "/pole-position-2026";

// O 308 da aposentadoria só entra na revalidação. Cinco minutos de atraso na
// manhã de 21/09, sem pagar renderização por visita.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();
  return {
    title: "Pole Position | Motors Store — 12 a 20 de setembro",
    description: CAMPANHA.descricao,
    // Sem isto a página herda o card do layout raiz, que de propósito não
    // declara canonical para não anunciar a home como canônica de todo mundo.
    alternates: { canonical: CAMINHO },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "sobre",
      tituloPadrao: "Pole Position — a largada para grandes oportunidades",
      descricaoPadrao: CAMPANHA.descricao,
      caminho: CAMINHO,
      // A arte do folder vence o card do painel. `imagemPreferida` é o
      // parâmetro que existe — não há `imagem`.
      imagemPreferida: "/campanhas/pole-position-2026-og.jpg",
      // O arquivo é exatamente 1200×630, então a dimensão PODE ser declarada.
      // Esta flag existe para foto do RevendaMais, de proporção desconhecida.
      imagemPreferidaSemDimensao: false,
    }),
  };
}

export default function PolePosition() {
  // Vencida: 308 para o destino registrado. Página de campanha que continua
  // respondendo 200 depois do fim mente para quem chegou por link antigo.
  if (!campanhaEstaViva(CAMPANHA, new Date())) {
    permanentRedirect(CAMPANHA.destinoAposFim);
  }

  return (
    <main>
      {/* Design livre daqui para baixo. Conteúdo obrigatório:
          chamada, período, os seis argumentos COM as ressalvas literais,
          endereço vindo de companySettings, e o CTA. */}
      <CtaDeCampanha campanha={CAMPANHA} />
    </main>
  );
}
```

> Assinatura conferida em `src/lib/compartilhamento.ts:250`. Os parâmetros são `empresa`, `pagina`, `tituloPadrao`, `descricaoPadrao`, `rotulo`, `caminho`, `imagemPreferida` e `imagemPreferidaSemDimensao`. **Não existe `imagem`.** Sem `imagemPreferida`, o card cai no gerador dinâmico `/og?…` — que funciona (não está sob `/api/`), mas desenha o card padrão do site em vez da arte da campanha.

- [ ] **Passo 6: Rodar e confirmar que passa**

```bash
npx vitest run tests/pole-position.test.ts tests/campanhas-registro.test.ts
```

Esperado: PASSA. `campanhas-registro` entra junto porque a amarra "toda campanha tem pasta" só fecha agora.

- [ ] **Passo 7: Verificar no navegador**

Subir o preview e conferir de verdade — a memória deste projeto tem dois casos em que isso pegou o que o teste não pegava.

```bash
npm run dev
```

Confira, com as ferramentas do painel Browser:
1. `/pole-position-2026` responde e **não** mostra header nem rodapé;
2. o **banner de cookies aparece** (é o ponto da tarefa 1);
3. o console não tem erro;
4. clicar no CTA abre o modal, e o modal mostra o Turnstile;
5. `/estoque` e `/` continuam com header e rodapé.

> Se a rota der 404 com corpo HTML de `not-found`, apague `.next` — `next dev` reusa o `.next` do build e rota nova nasce 404. Não depure o handler antes disso.

- [ ] **Passo 8: Rodar a suíte cheia**

```bash
npm test
```

Esperado: PASSA. Travas de invariante varrem `src/` e só acusam aqui — copy nova reprova em varredura que o teste da tarefa não roda.

- [ ] **Passo 9: Commit**

```bash
git add "src/app/(campanha)/pole-position-2026/page.tsx" src/lib/campanhas.ts public/campanhas/pole-position-2026-og.jpg tests/pole-position.test.ts
git commit -m "feat(campanha): a Pole Position no ar, de 12 a 20 de setembro"
```

- [ ] **Passo 10: Revisão do qa-guardian**

Despachar o agente `qa-guardian` sobre o diff completo das três tarefas antes do merge, conforme o `CLAUDE.md`.

---

## Auto-revisão do plano

**Cobertura do spec:**

| Seção do spec | Tarefa |
|---|---|
| §3.1 registro | 1 |
| §3.2 casca + correção da moldura | 1 |
| §3.3 CTA + `canal` + ação do Turnstile | 2 |
| §3.4 metadata e og:image fora de `/api/` | 3 (testado) |
| §3.5 amarras | 1 |
| §5 conteúdo do folder e as ressalvas | 3 (testado) |
| §6.1 slug com ano, sem reuso | 1 (testado) |
| §6.2 tokens de tema | 1 e 3 (documentado no código) |
| §6.3 `revalidate = 300` | 3 (testado) |
| §6.4 indexação | 1 (comentário no sitemap) |

**Sem lacuna.** §6.5 (prazo) é ordenação, já refletida na sequência das tarefas.

**Consistência de tipos:** `Campanha`, `campanhaPorSlug`, `campanhaEstaViva`, `campanhasVivas`, `caminhoDaCampanha`, `ehRotaDeCampanha`, `mensagemDaCampanha`, `montarLeadDeCampanha`, `CtaDeCampanha`, `AvisoLegalDoSite` — os mesmos nomes nas três tarefas.

**As três incertezas de assinatura foram resolvidas contra o código**, não deixadas para quem implementa:

| dúvida | resposta conferida |
|---|---|
| `UtmParameters` existe? | Sim, exportado em `src/lib/telemetry.ts:196` |
| `tipoDeLead` aceita `"campanha"`? | **Não.** São cinco literais em `src/lib/dataLayer.ts:460`, documentados como contrato em `TRACKING_SPEC.md:718`. O plano usa `"contato"` e explica por quê |
| `montarCompartilhamento` aceita `imagem`? | **Não.** O parâmetro é `imagemPreferida`, com `imagemPreferidaSemDimensao` ao lado (`src/lib/compartilhamento.ts:250`) |

**Uma decisão que o plano toma e o dono pode querer rever:** usar `lead_type: "contato"` em vez de acrescentar `"campanha"` ao contrato de tracking. A troca é risco baixo agora contra granularidade no GA4; o caminho de acrescentar o sexto literal continua aberto depois da campanha, e custa uma linha no tipo, uma no `TRACKING_SPEC.md` e um gatilho no GTM.
