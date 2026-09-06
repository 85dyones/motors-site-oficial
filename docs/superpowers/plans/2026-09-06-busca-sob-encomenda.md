# Busca sob encomenda — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o CTA passivo "AVISE-ME QUANDO ENTRAR" das 42 páginas de marca e modelo sem estoque por um formulário que grava lead no funil que a loja já opera.

**Architecture:** Uma lib pura (`src/lib/buscaSobEncomenda.ts`) guarda a copy com concordância de gênero e a tradução do pedido para colunas de `leads`. Um client component (`BuscaSobEncomenda.tsx`) renderizado a partir do server component `PaginaDeEstoque` desenha o bloco — que sai no HTML do servidor porque client component montado por server component é SSR-ado. O envio vai para o `POST /api/leads` que já existe, com um bloco `busca_encomenda` no corpo; a rota grava três colunas a mais **só quando esse bloco vem**.

**Tech Stack:** Next.js (App Router) · React · TypeScript · Vitest · Supabase (`zwbqmzgnagfeqinqkolp`) · Cloudflare Turnstile · Meta CAPI

**Spec:** [`docs/superpowers/specs/2026-09-06-busca-sob-encomenda-design.md`](../specs/2026-09-06-busca-sob-encomenda-design.md)

**Worktree:** `C:\Users\Lenovo\Documents\motors-claude\busca-sob-encomenda`, branch `feat/busca-sob-encomenda`, saído de `main` em `1f9ff6e`. `node_modules` é junction para o repo principal; `.env.local` já copiado.

## Global Constraints

- **Projeto Supabase é `zwbqmzgnagfeqinqkolp`.** Nunca `lanatcqpskcmifuxfatn`.
- **Nenhuma tabela nova, nenhum endpoint novo, nenhuma alteração de schema.** As colunas `modelo_interesse`, `respostas_raw` (jsonb) e `disponivel_estoque` já existem em `public.leads`. A única migração (Task 5) é `comment on column` — documentação, não estrutura.
- **Vocabulário travado:** "perícia cautelar independente" é o processo; "laudo cautelar independente" é o documento. Sempre por extenso. Nunca "laudo cautelar" sozinho, nunca "preço fechado".
- **Copy proibida:** não prometer preço, desconto ou valor abaixo da FIPE; não prometer prazo de entrega do veículo (só de retorno do consultor); não dizer "garantimos que encontramos"; a oferta é sempre do **consultor**, nunca de um sistema.
- **Não citar os canais de busca** (decisão do dono, 2026-09-06). "Rede de repasse", "desmobilização de frota" e equivalentes ficam fora.
- **Prazo:** "em até 48h úteis", sempre como retorno do consultor.
- **Regra 6 do `CLAUDE.md`:** "Ver todo o estoque" tem que continuar acessível em toda variante.
- **Regra 7 do `CLAUDE.md`:** eventos de tracking existentes não mudam de nome nem de forma. O que existe hoje na ficha, no pop-up e no `/contato` sai byte por byte igual.
- **Idioma:** código, nomes e commits em português, no padrão do repositório.
- **Teste:** `npx vitest run <arquivo>` para um arquivo; `npm test` para a suíte. `testTimeout` já está em 15000 no config.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/buscaSobEncomenda.ts` **(criar)** | Copy com gênero, faixas do formulário, e a tradução `PedidoDeBusca` → colunas de `leads`. Puro, sem React, sem I/O. |
| `src/lib/turnstile.ts` **(modificar)** | Ação `busca_encomenda` em `ACOES` e em `ACOES_DE_LEADS`. |
| `src/app/api/leads/route.ts` **(modificar)** | Grava as três colunas e manda `content_category` para o CAPI — só com o bloco no corpo. |
| `src/components/BuscaSobEncomenda.tsx` **(criar)** | A ilha cliente: os cinco estados, os campos, o Turnstile, o POST e o beco do `wa.me`. |
| `src/components/modernist/PaginaDeEstoque.tsx` **(modificar)** | Prop `buscaSobEncomenda` opcional no estado vazio. Sem ela, nada muda. |
| `src/app/[categoria]/[marca]/page.tsx` **(modificar)** | Passa a prop, variante de marca. |
| `src/app/[categoria]/[marca]/[modelo]/page.tsx` **(modificar)** | Passa a prop, variante de modelo. |
| `supabase/migrations/20260906120000_colunas_do_pedido_de_busca.sql` **(criar)** | `comment on column` nas três colunas herdadas. Não altera schema. |
| `supabase/README.md` **(modificar)** | Linha da migração no livro-razão do repositório. |
| `tests/busca-sob-encomenda.test.ts` **(criar)** | A lib pura, a ação do Turnstile, e as travas de fonte da rota e do componente. |
| `tests/busca-sob-encomenda-na-pagina.test.ts` **(criar)** | O bloco no HTML do servidor, as regressões e a regra 6. |

---

## Task 1: A lib pura — copy, gênero e colunas

**Files:**
- Create: `src/lib/buscaSobEncomenda.ts`
- Create: `tests/busca-sob-encomenda.test.ts`

**Interfaces:**
- Consumes: `Genero`, `concordar`, `o`, `seu` de `src/lib/generoDoVeiculo.ts`; `FAIXAS_DE_PRECO` de `src/lib/faixasDePreco.ts`.
- Produces:
  - `CANAL_BUSCA_ENCOMENDA: string` — `"Busca sob encomenda"`
  - `PRAZOS: readonly { valor: string; rotulo: string }[]`
  - `interface PedidoDeBusca { marca; modelo_desejado; investimento; pagina_origem; ano_min?; tem_troca?; prazo?; observacao? }`
  - `colunasDoPedido(pedido: PedidoDeBusca): { modelo_interesse: string; disponivel_estoque: false; respostas_raw: Record<string, unknown> }`
  - `mensagemDoPedido(pedido: PedidoDeBusca): string`
  - `interface TextoDaBusca { titulo; paragrafo; selo; rotuloPrimario }`
  - `textoDaBusca(alvo: { marca: string; modelo?: string; genero: Genero }): TextoDaBusca`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/busca-sob-encomenda.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CANAL_BUSCA_ENCOMENDA,
  colunasDoPedido,
  mensagemDoPedido,
  textoDaBusca,
  type PedidoDeBusca,
} from "../src/lib/buscaSobEncomenda";
import { ACOES, ACOES_DE_LEADS } from "../src/lib/turnstile";

/**
 * A Busca sob encomenda é o que responde a metade dos hubs que está sem carro
 * e continua recebendo busca (/carros/citroen: 67 impressões em 18 dias, e
 * nenhum Citroën no pátio).
 *
 * O que este arquivo trava:
 *
 *   1. **Perícia e laudo são complementares, não sinônimos** (direção do dono,
 *      2026-09-06): perícia é o processo de aquisição do laudo. Toda citação ao
 *      documento diz "laudo cautelar independente", por extenso. Um teste que
 *      só proibisse "laudo cautelar" sozinho reprovaria a grafia certa, porque
 *      ela CONTÉM a errada — por isso a asserção afirma a condição inteira.
 *   2. **Gênero.** Quatro dos 42 alvos são de moto. Sem concordância,
 *      /motos/suzuki diz "A gente busca o seu" para uma moto.
 *   3. **As promessas que o dono recusou.** Canal de busca não se anuncia.
 */

const pedido = (extra: Partial<PedidoDeBusca> = {}): PedidoDeBusca => ({
  marca: "Citroën",
  modelo_desejado: "C3",
  investimento: "ate-60-mil",
  pagina_origem: "/carros/citroen",
  ...extra,
});

describe("colunasDoPedido", () => {
  it("monta modelo_interesse legível a partir de marca e modelo", () => {
    expect(colunasDoPedido(pedido()).modelo_interesse).toBe("Citroën C3");
  });

  it("não repete a marca quando quem preencheu já a digitou", () => {
    // Na página de MARCA o campo vem vazio e a pessoa escreve o carro inteiro.
    // Sem isto a coluna guardaria "Citroën Citroën C3".
    expect(colunasDoPedido(pedido({ modelo_desejado: "Citroen C3" })).modelo_interesse)
      .toBe("Citroen C3");
  });

  it("marca disponivel_estoque como false — é o que o pedido significa", () => {
    expect(colunasDoPedido(pedido()).disponivel_estoque).toBe(false);
  });

  it("guarda os campos opcionais como null, nunca como undefined", () => {
    // `undefined` num insert do PostgREST some da linha; `null` grava o vazio.
    const { respostas_raw } = colunasDoPedido(pedido());
    expect(respostas_raw.ano_min).toBeNull();
    expect(respostas_raw.tem_troca).toBeNull();
    expect(respostas_raw.prazo).toBeNull();
    expect(respostas_raw.observacao).toBeNull();
  });

  it("preserva a página de origem — é o que liga o lead ao hub que o gerou", () => {
    expect(colunasDoPedido(pedido()).respostas_raw.pagina_origem).toBe("/carros/citroen");
  });

  it("guarda tem_troca false sem confundir com não respondido", () => {
    expect(colunasDoPedido(pedido({ tem_troca: false })).respostas_raw.tem_troca).toBe(false);
    expect(colunasDoPedido(pedido({ tem_troca: true })).respostas_raw.tem_troca).toBe(true);
  });
});

describe("mensagemDoPedido", () => {
  it("descreve o pedido em uma linha, para o WhatsApp e para o campo interesse", () => {
    const msg = mensagemDoPedido(pedido({ ano_min: 2018 }));
    expect(msg).toContain("Citroën C3");
    expect(msg).toContain("2018");
  });

  it("não inventa o que não foi preenchido", () => {
    expect(mensagemDoPedido(pedido())).not.toContain("undefined");
    expect(mensagemDoPedido(pedido())).not.toContain("null");
  });
});

describe("textoDaBusca — variante de marca", () => {
  const carro = textoDaBusca({ marca: "Citroën", genero: "m" });
  const moto = textoDaBusca({ marca: "Suzuki", genero: "f" });

  it("concorda no masculino para carro", () => {
    expect(carro.titulo).toBe("Sem Citroën hoje. A gente busca o seu.");
  });

  it("concorda no feminino para moto", () => {
    expect(moto.titulo).toBe("Sem Suzuki hoje. A gente busca a sua.");
  });

  it("cita o processo e o documento pelos nomes inteiros", () => {
    // Afirma a condição inteira: "laudo cautelar" CONTÉM a grafia curta, então
    // proibir a substring reprovaria a grafia certa.
    expect(carro.paragrafo).toContain("perícia cautelar independente");
    expect(carro.paragrafo).toContain("laudo cautelar independente");
  });

  it("nunca cita o documento sem qualificar", () => {
    const semQualificar = carro.paragrafo.replace(/laudo cautelar independente/g, "");
    expect(semQualificar).not.toContain("laudo");
  });

  it("promete retorno do consultor, não entrega do veículo", () => {
    expect(carro.selo).toContain("48h úteis");
    expect(carro.selo.toLowerCase()).not.toContain("entrega");
  });
});

describe("textoDaBusca — variante de modelo", () => {
  const carro = textoDaBusca({ marca: "Volkswagen", modelo: "Tiguan", genero: "m" });
  const moto = textoDaBusca({ marca: "Honda", modelo: "CB", genero: "f" });

  it("concorda o pronome com o segmento", () => {
    expect(carro.titulo).toBe("Nenhum Volkswagen Tiguan no estoque agora. Quer que a gente ache?");
    expect(moto.titulo).toBe("Nenhuma Honda CB no estoque agora. Quer que a gente ache?");
  });

  it("põe o modelo pedido no botão", () => {
    expect(carro.rotuloPrimario).toContain("TIGUAN");
  });
});

describe("as promessas que a copy NÃO faz", () => {
  const todos = [
    textoDaBusca({ marca: "Citroën", genero: "m" }),
    textoDaBusca({ marca: "Volkswagen", modelo: "Tiguan", genero: "m" }),
    textoDaBusca({ marca: "Suzuki", genero: "f" }),
  ];

  it("não anuncia por onde a loja compra (decisão do dono, 06/09)", () => {
    for (const t of todos) {
      const texto = `${t.titulo} ${t.paragrafo} ${t.selo}`.toLowerCase();
      expect(texto).not.toContain("repasse");
      expect(texto).not.toContain("frota");
      expect(texto).not.toContain("leilão");
    }
  });

  it("não promete achar, nem preço", () => {
    for (const t of todos) {
      const texto = `${t.titulo} ${t.paragrafo} ${t.selo}`.toLowerCase();
      expect(texto).not.toContain("garantimos");
      expect(texto).not.toContain("fipe");
      expect(texto).not.toContain("desconto");
      expect(texto).not.toContain("preço fechado");
    }
  });

  it("atribui a busca ao consultor, não a um sistema", () => {
    for (const t of todos) expect(t.paragrafo).toContain("consultor");
  });
});

describe("a ação do Turnstile", () => {
  it("existe e está na lista que /api/leads aceita", () => {
    // As duas: sem a segunda, o token volta assinado pela Cloudflare e a rota
    // o recusa com `action-nao-prevista` — falha que parece captcha quebrado.
    expect(ACOES.buscaEncomenda).toBe("busca_encomenda");
    expect(ACOES_DE_LEADS).toContain("busca_encomenda");
  });

  it("respeita o limite da Cloudflare para action", () => {
    expect(ACOES.buscaEncomenda).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
  });
});

describe("o canal", () => {
  it("é o rótulo que o consultor vê no kanban", () => {
    expect(CANAL_BUSCA_ENCOMENDA).toBe("Busca sob encomenda");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx vitest run tests/busca-sob-encomenda.test.ts
```

Esperado: FAIL — `Failed to resolve import "../src/lib/buscaSobEncomenda"`.

- [ ] **Step 3: Criar a lib**

Criar `src/lib/buscaSobEncomenda.ts`:

```ts
import { concordar, o, seu, type Genero } from "./generoDoVeiculo";
import { FAIXAS_DE_PRECO } from "./faixasDePreco";

/**
 * Busca sob encomenda — o que a página sem carro passa a oferecer.
 *
 * Metade dos hubs de marca e modelo está sem veículo, continua indexada e
 * continua recebendo busca. Até 2026-09-06 ela terminava num `wa.me` que não
 * deixava rastro: quem procurou um modelo específico e não achou — o lead mais
 * qualificado que chega no site — voltava para o Google.
 *
 * Este arquivo é puro de propósito. A copy tem concordância de gênero (quatro
 * dos 42 alvos são de moto) e o pedido vira coluna de `leads` sem passar por
 * React nem por rede, que é o que permite travar as duas coisas em teste.
 *
 * **Não há tabela nova.** `leads` já tinha `modelo_interesse`, `respostas_raw`
 * (jsonb) e `disponivel_estoque`, herdadas da ferramenta de marketing que criou
 * a tabela antes da disciplina de migrações — sem migração e sem nenhum código
 * lendo. Passar a escrever nelas é o que põe o pedido dentro do kanban A1/A8
 * que a loja já abre, em vez de numa tabela que ninguém consulta.
 */

/** O rótulo do canal no funil. É o que o consultor vê na fila da A1. */
export const CANAL_BUSCA_ENCOMENDA = "Busca sob encomenda";

/** As faixas do formulário são as MESMAS de `/estoque` — não se inventa outra régua. */
export const FAIXAS_DE_INVESTIMENTO = FAIXAS_DE_PRECO.map((f) => ({
  valor: f.slug,
  rotulo: f.nome,
}));

export const PRAZOS = [
  { valor: "ate-15-dias", rotulo: "até 15 dias" },
  { valor: "ate-30-dias", rotulo: "até 30 dias" },
  { valor: "sem-pressa", rotulo: "sem pressa" },
] as const;

export interface PedidoDeBusca {
  /** A marca da página onde o pedido nasceu. */
  marca: string;
  /** O que a pessoa escreveu. Na página de modelo já vem preenchido. */
  modelo_desejado: string;
  /** `slug` de `FAIXAS_DE_PRECO`. */
  investimento: string;
  /** "/carros/citroen" — o hub que gerou o lead. */
  pagina_origem: string;
  ano_min?: number | null;
  /** `null` é "não respondeu"; `false` é "respondeu que não". */
  tem_troca?: boolean | null;
  prazo?: string | null;
  observacao?: string | null;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * "Citroën" + "C3" vira "Citroën C3"; "Citroën" + "Citroen C3" continua
 * "Citroen C3".
 *
 * Na página de MARCA o campo nasce vazio e a pessoa escreve o carro inteiro —
 * sem esta comparação a coluna guardaria a marca duas vezes.
 */
function juntarMarcaEModelo(marca: string, modelo: string): string {
  const m = (marca ?? "").trim();
  const d = (modelo ?? "").trim();
  if (!m) return d;
  if (!d) return m;
  return semAcento(d).startsWith(semAcento(m)) ? d : `${m} ${d}`;
}

/**
 * O que a linha de `leads` ganha, além do que `/api/leads` já grava.
 *
 * `respostas_raw` é jsonb e recebe o pedido inteiro: é o único lugar onde
 * `ano_min`, `tem_troca` e `prazo` cabem sem inventar coluna. Os opcionais
 * viram `null` e não `undefined` — `undefined` some do insert do PostgREST e a
 * chave nem chega ao banco, o que faria "não respondeu" e "campo inexistente"
 * ficarem indistinguíveis na leitura.
 */
export function colunasDoPedido(pedido: PedidoDeBusca) {
  return {
    modelo_interesse: juntarMarcaEModelo(pedido.marca, pedido.modelo_desejado),
    disponivel_estoque: false as const,
    respostas_raw: {
      marca: pedido.marca,
      modelo_desejado: pedido.modelo_desejado,
      investimento: pedido.investimento,
      pagina_origem: pedido.pagina_origem,
      ano_min: pedido.ano_min ?? null,
      tem_troca: pedido.tem_troca ?? null,
      prazo: pedido.prazo ?? null,
      observacao: pedido.observacao ?? null,
    } as Record<string, unknown>,
  };
}

/** O pedido em uma linha — vai para o WhatsApp e para a coluna `interesse`. */
export function mensagemDoPedido(pedido: PedidoDeBusca): string {
  const alvo = juntarMarcaEModelo(pedido.marca, pedido.modelo_desejado);
  const faixa = FAIXAS_DE_INVESTIMENTO.find((f) => f.valor === pedido.investimento)?.rotulo;
  const prazo = PRAZOS.find((p) => p.valor === pedido.prazo)?.rotulo;

  const partes = [
    `Quero um ${alvo}`,
    pedido.ano_min ? `a partir de ${pedido.ano_min}` : "",
    faixa ? `investimento ${faixa}` : "",
    pedido.tem_troca === true ? "tenho carro na troca" : "",
    prazo ? `prazo ${prazo}` : "",
    (pedido.observacao ?? "").trim(),
  ].filter((p) => p !== "");

  return `${partes.join(" · ")}.`;
}

export interface TextoDaBusca {
  titulo: string;
  paragrafo: string;
  selo: string;
  rotuloPrimario: string;
}

/**
 * A copy das duas variantes.
 *
 * As duas expressões aparecem lado a lado de propósito: perícia é o PROCESSO de
 * aquisição do laudo, laudo cautelar independente é o DOCUMENTO que sai dele
 * (direção do dono, 2026-09-06). O banco já separava os dois —
 * `estoque_motors.pericia` é o estado, `laudo_pericia` é o documento — e
 * ninguém tinha nomeado a regra.
 *
 * Os canais de busca ficam de fora por decisão do dono na mesma data: a loja
 * não anuncia por onde compra.
 */
export function textoDaBusca(alvo: {
  marca: string;
  modelo?: string;
  genero: Genero;
}): TextoDaBusca {
  const { marca, modelo, genero } = alvo;
  const selo = "Sem taxa, sem compromisso. Retorno em até 48h úteis.";

  if (!modelo) {
    return {
      titulo: `Sem ${marca} hoje. A gente busca ${o(genero)} ${seu(genero)}.`,
      paragrafo:
        "Você diz o modelo, o ano e quanto quer investir. Um consultor procura e volta com as " +
        "opções que encontrar — cada uma pela mesma perícia cautelar independente por que passa " +
        "todo veículo antes da vitrine, com o laudo cautelar independente na ficha assim que " +
        "aprovado.",
      selo,
      rotuloPrimario: `PROCURE ${concordar(genero, "ESSE CARRO", "ESSA MOTO")} PRA MIM`,
    };
  }

  return {
    titulo:
      `${concordar(genero, "Nenhum", "Nenhuma")} ${marca} ${modelo} no estoque agora. ` +
      "Quer que a gente ache?",
    paragrafo:
      "Diz o ano, a versão e o quanto pretende investir. Um consultor procura e te chama no " +
      "WhatsApp com o que encontrar — depois da perícia cautelar independente, com o laudo " +
      "cautelar independente na ficha.",
    selo,
    rotuloPrimario: `PROCURE ${concordar(genero, "ESSE", "ESSA")} ${modelo.toUpperCase()} PRA MIM`,
  };
}
```

- [ ] **Step 4: Adicionar a ação do Turnstile**

Em `src/lib/turnstile.ts`, no objeto `ACOES` (linha ~211), acrescentar a última entrada:

```ts
export const ACOES = {
  contato: "contato",
  pdp: "pdp",
  carmatch: "carmatch",
  popup: "popup",
  avaliacao: "avaliacao",
  avaliacaoWhatsapp: "avaliacao_whatsapp",
  buscaEncomenda: "busca_encomenda",
} as const;
```

E na lista que a rota aceita, trocando o comentário de "cinco" para "seis":

```ts
/** `/api/leads` atende seis superfícies; todas com o mesmo valor de lead. */
export const ACOES_DE_LEADS = [
  ACOES.contato,
  ACOES.pdp,
  ACOES.carmatch,
  ACOES.popup,
  ACOES.avaliacaoWhatsapp,
  ACOES.buscaEncomenda,
] as const;
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx vitest run tests/busca-sob-encomenda.test.ts
```

Esperado: PASS, 20 testes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/buscaSobEncomenda.ts src/lib/turnstile.ts tests/busca-sob-encomenda.test.ts
git commit -m "feat(busca-encomenda): a copy sabe o genero e o pedido vira coluna

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: A rota grava o pedido

**Files:**
- Modify: `src/app/api/leads/route.ts` (bloco de persistência ~163-215; bloco do CAPI ~232-262)
- Modify: `tests/busca-sob-encomenda.test.ts` (acrescentar um `describe`)

**Interfaces:**
- Consumes: `colunasDoPedido`, `mensagemDoPedido`, `CANAL_BUSCA_ENCOMENDA` da Task 1.
- Produces: contrato do corpo do POST — `body.busca_encomenda?: PedidoDeBusca`. A Task 3 monta esse bloco.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar `import { ler } from "./fonte";` junto dos outros imports no topo de
`tests/busca-sob-encomenda.test.ts`, e este bloco ao fim do arquivo:

```ts
/**
 * A rota é testada pela FONTE, e não por importação, porque `POST` depende de
 * `next/server` e de `cookies()` — montar isso no vitest testaria o mock, não a
 * rota. O que precisa ser verdade aqui é estrutural: as colunas novas são
 * escritas SOB CONDIÇÃO, e a condição é o bloco no corpo.
 */
describe("a rota /api/leads", () => {
  const fonte = ler("src/app/api/leads/route.ts");

  it("grava as três colunas do pedido", () => {
    expect(fonte).toContain("colunasDoPedido");
  });

  it("condiciona a gravação ao bloco no corpo — PDP e pop-up não regridem", () => {
    // A regra 7 do CLAUDE.md: o que já está em produção não muda de forma.
    // Um spread incondicional mandaria `modelo_interesse` e
    // `disponivel_estoque: false` em TODO lead, inclusive os da ficha.
    //
    // Substring exata, e não regex de espaçamento: uma expressão que tolera
    // `\s*` fica verde para qualquer formatação e vermelha quando o prettier
    // quebra a linha — o oposto do que se quer de uma trava.
    expect(fonte).toContain("...(pedidoDeBusca ? colunasDoPedido(pedidoDeBusca) : {})");
  });

  it("manda content_category para o CAPI sem tocar no evento da ficha", () => {
    expect(fonte).toContain("content_category");
    expect(fonte).toContain("busca-encomenda");
    // O evento da ficha continua mandando o id e o preço do veículo.
    expect(fonte).toContain("content_ids");
    expect(fonte).toContain("value: veiculo?.preco");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx vitest run tests/busca-sob-encomenda.test.ts -t "a rota"
```

Esperado: FAIL — `expected '...' to contain 'colunasDoPedido'`.

- [ ] **Step 3: Ligar a lib na rota**

Em `src/app/api/leads/route.ts`, acrescentar ao topo, junto dos outros imports:

```ts
import { colunasDoPedido, mensagemDoPedido } from "../../../lib/buscaSobEncomenda";
```

Logo depois da linha que desestrutura o corpo (`const { cliente, veiculo, utm, intencao_busca, agUid, webhookUrl, turnstileToken } = body;`), acrescentar:

```ts
    /**
     * Busca sob encomenda — o pedido de um carro que a loja NÃO tem.
     *
     * Nasce nos hubs de marca e modelo sem estoque (metade deles). Não tem
     * tabela própria de propósito: em `leads` ele cai no kanban A1/A8 que a
     * loja já abre, com etapa, responsável e desfecho. Ver o desenho em
     * `docs/superpowers/specs/2026-09-06-busca-sob-encomenda-design.md`.
     */
    const pedidoDeBusca = body.busca_encomenda ?? null;
```

No bloco de persistência, o `interesse` ganha o pedido como primeira opção e o `insert` ganha o spread condicional:

```ts
      const interesse =
        (pedidoDeBusca && mensagemDoPedido(pedidoDeBusca)) ||
        (veiculo && [veiculo.marca, veiculo.modelo, veiculo.versao].filter(Boolean).join(" ")) ||
        body.mensagem ||
        (intencao_busca && Object.values(intencao_busca).filter(Boolean).join(" · ")) ||
        null;
```

E, na chamada do `insert`, acrescentar como ÚLTIMA propriedade do objeto (depois de `ag_uid`):

```ts
        /**
         * As três colunas do pedido, e só quando há pedido.
         *
         * Spread condicional, não incondicional: `disponivel_estoque: false`
         * em todo lead diria que a ficha de um carro à venda nasceu sem
         * estoque, e `modelo_interesse` vazio apagaria a coluna para quem vier
         * a preenchê-la por outro caminho. Regra 7 do CLAUDE.md — o que está em
         * produção não muda de forma.
         */
        ...(pedidoDeBusca ? colunasDoPedido(pedidoDeBusca) : {}),
```

No bloco do CAPI, o `customData` passa a distinguir os dois casos:

```ts
          customData: {
            content_ids: veiculo?.id ? [String(veiculo.id)] : undefined,
            content_type: META_CONTENT_TYPE,
            content_name: pedidoDeBusca
              ? colunasDoPedido(pedidoDeBusca).modelo_interesse
              : veiculo
                ? `${veiculo.marca} ${veiculo.modelo}`
                : undefined,
            // Separa a conversão do carro que a loja TEM da do carro que ela
            // foi buscar. Sem isto as duas viram o mesmo público no Meta.
            content_category: pedidoDeBusca ? "busca-encomenda" : undefined,
            value: veiculo?.preco,
            currency: "BRL",
          },
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/busca-sob-encomenda.test.ts
```

Esperado: PASS. Depois, a suíte que cobre a rota hoje, para provar que nada regrediu:

```bash
npx vitest run tests/capi-correspondencia.test.ts tests/brechas-de-mensuracao.test.ts tests/ref-de-atendimento.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leads/route.ts tests/busca-sob-encomenda.test.ts
git commit -m "feat(busca-encomenda): a rota grava o pedido sem mexer no lead da ficha

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: O componente

**Files:**
- Create: `src/components/BuscaSobEncomenda.tsx`

**Interfaces:**
- Consumes: `textoDaBusca`, `colunasDoPedido`, `mensagemDoPedido`, `CANAL_BUSCA_ENCOMENDA`, `FAIXAS_DE_INVESTIMENTO`, `PRAZOS`, `PedidoDeBusca` (Task 1); `body.busca_encomenda` (Task 2); `Turnstile`/`TurnstileHandle`, `SaidaDoCaptcha`, `mascararTelefone`/`telefoneDoLead`, `getActiveAgUid`/`getUtmParameters`/`trackLeadSubmission`, `getMatchParams`, `ACOES`.
- Produces:
  - `export interface AlvoDaBusca { marca: string; modelo?: string; caminho: string; genero: Genero; modelosConhecidos?: string[]; avisarHref?: string }`
  - `export default function BuscaSobEncomenda(props: AlvoDaBusca)`

- [ ] **Step 1: Escrever o componente**

Não há teste antes deste passo: o que se pode afirmar sobre o componente sozinho é o que a Task 1 já trava (a copy) — o comportamento dele só existe montado numa página, e é a Task 4 que o monta. O teste vem na Task 4, no ponto de chamada.

Criar `src/components/BuscaSobEncomenda.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Turnstile, { type TurnstileHandle } from "./Turnstile";
import SaidaDoCaptcha from "./SaidaDoCaptcha";
import { mascararTelefone, telefoneDoLead } from "../lib/whatsapp";
import { getActiveAgUid, getUtmParameters, trackLeadSubmission } from "../lib/telemetry";
import { getMatchParams } from "../lib/tracking-identity";
import { ACOES } from "../lib/turnstile";
import { type Genero } from "../lib/generoDoVeiculo";
import {
  CANAL_BUSCA_ENCOMENDA,
  FAIXAS_DE_INVESTIMENTO,
  PRAZOS,
  mensagemDoPedido,
  textoDaBusca,
  type PedidoDeBusca,
} from "../lib/buscaSobEncomenda";

/**
 * A saída do hub sem carro — a oferta que substitui a lista de espera.
 *
 * `"use client"` e mesmo assim NO HTML DO SERVIDOR: client component montado
 * por server component é renderizado no servidor na primeira resposta. A
 * diretiva governa hidratação e bundle, não presença no HTML. É o que permite
 * ao Googlebot ver a oferta na página que ele já ranqueia — /carros/citroen tem
 * 67 impressões e nenhum Citroën.
 *
 * O formulário abre INLINE, não em modal: modal em mobile custa conversão, e
 * modal fechado não é conteúdo servido.
 */

export interface AlvoDaBusca {
  marca: string;
  /** Ausente na página de marca. É ele que escolhe a variante. */
  modelo?: string;
  caminho: string;
  genero: Genero;
  /** Vira `datalist` do campo de modelo, na página de marca. */
  modelosConhecidos?: string[];
  /**
   * O `wa.me` de sempre — o beco de emergência.
   *
   * Falha do nosso endpoint não pode custar o contato: é o único caminho que
   * não depende de nada nosso estar de pé.
   */
  avisarHref?: string;
}

const ANOS = Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i);

export default function BuscaSobEncomenda({
  marca,
  modelo,
  caminho,
  genero,
  modelosConhecidos = [],
  avisarHref = "",
}: AlvoDaBusca) {
  const texto = textoDaBusca({ marca, modelo, genero });

  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<PedidoDeBusca | null>(null);
  const [erro, setErro] = useState("");
  const [captchaBloqueado, setCaptchaBloqueado] = useState(false);
  const [token, setToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [modeloDesejado, setModeloDesejado] = useState(modelo ?? "");
  const [investimento, setInvestimento] = useState("");
  const [anoMin, setAnoMin] = useState("");
  const [temTroca, setTemTroca] = useState("");
  const [prazo, setPrazo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [detalhar, setDetalhar] = useState(false);
  /** Honeypot. Nome que NÃO colide com coluna de `leads`. */
  const [apelido, setApelido] = useState("");

  const montarPedido = (): PedidoDeBusca => ({
    marca,
    modelo_desejado: modeloDesejado.trim(),
    investimento,
    pagina_origem: caminho,
    ano_min: anoMin ? Number(anoMin) : null,
    tem_troca: temTroca === "" ? null : temTroca === "sim",
    prazo: prazo || null,
    observacao: observacao.trim() || null,
  });

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    // Honeypot: robô preencheu o campo que humano não vê. Some em silêncio —
    // dizer "recusado" ensina o robô a tentar de novo sem ele.
    if (apelido.trim() !== "") {
      setEnviado(montarPedido());
      return;
    }

    setErro("");
    setEnviando(true);

    const pedido = montarPedido();
    const mensagem = mensagemDoPedido(pedido);
    const telefone = telefoneDoLead(whatsapp);

    const eventId = trackLeadSubmission(
      { marca, modelo: modeloDesejado.trim() || marca, preco: 0 },
      mensagem,
      { tipoDeLead: "contato", formId: "form-busca-encomenda", phoneE164: telefone.e164 },
    );
    const { fbp, fbc } = getMatchParams();
    const utmParams = getUtmParameters();

    try {
      const resposta = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteJid: telefone.remoteJid,
          telefone: telefone.comDDI ?? "",
          tipo: "lead_busca_encomenda",
          canal: CANAL_BUSCA_ENCOMENDA,
          mensagem,
          veiculo: null,
          cliente: { nome: nome.trim(), email: "", whatsapp },
          busca_encomenda: pedido,
          utm: {
            ...utmParams,
            utm_source: utmParams.utm_source || "busca-encomenda",
            utm_medium: utmParams.utm_medium || "organico",
            utm_campaign: utmParams.utm_campaign || caminho,
          },
          intencao_busca: { pagina_origem: caminho, modelo_desejado: pedido.modelo_desejado },
          agUid: getActiveAgUid(),
          eventId,
          eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
          fbp,
          fbc,
          turnstileToken: token,
        }),
      });

      if (!resposta.ok) throw new Error(String(resposta.status));
      setEnviado(pedido);
    } catch {
      // Token do Turnstile é de uso único: sem o reset, o segundo clique manda
      // o mesmo token queimado e leva 403.
      turnstileRef.current?.reset();
      setToken("");
      setErro("Não consegui registrar o pedido agora.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    const resumo = encodeURIComponent(mensagemDoPedido(enviado));
    return (
      <div className="border-b border-mt-regua-fina py-10">
        <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Recebido.</h2>
        <p className="m-0 mt-3 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">
          Um consultor vai te chamar no WhatsApp em até 48h úteis com o que encontrar. Se aparecer
          algo antes, chega antes.
        </p>
        <div className="mt-6 flex flex-wrap gap-0.5">
          {avisarHref && (
            <a
              href={`${avisarHref.split("?")[0]}?text=${resumo}`}
              className="mt-btn mt-btn-primario mt-foco"
              target="_blank"
              rel="noopener noreferrer"
            >
              FALAR AGORA NO WHATSAPP
            </a>
          )}
          {enviado.tem_troca === true && (
            <Link href="/avaliacao" className="mt-btn mt-btn-contorno mt-foco">
              AVALIAR MEU CARRO NA TROCA
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-mt-regua-fina py-10">
      <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">{texto.titulo}</h2>
      <p className="m-0 mt-3 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">
        {texto.paragrafo}
      </p>
      <p className="m-0 mt-2 max-w-[560px] text-[13px] font-extrabold text-mt-ink">{texto.selo}</p>

      <div className="mt-6 flex flex-wrap gap-0.5">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-btn mt-btn-primario mt-foco"
          aria-expanded={aberto}
          aria-controls="form-busca-encomenda"
        >
          {texto.rotuloPrimario}
        </button>
        {/* Regra 6 do CLAUDE.md: "ver todo o estoque" sempre acessível. */}
        <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
          {modelo ? "VER O QUE TEM HOJE NO ESTOQUE" : "VER TODO O ESTOQUE"}
        </Link>
        {!modelo && (
          <Link href="/carro-perfeito" className="mt-btn mt-btn-contorno mt-foco">
            NÃO SEI QUAL MODELO — ME AJUDA A ESCOLHER
          </Link>
        )}
      </div>

      {aberto && (
        <form id="form-busca-encomenda" onSubmit={enviar} className="mt-8 max-w-[560px]">
          <div className="mt-rotulo mb-3">
            Busca sob encomenda — {[marca, modelo].filter(Boolean).join(" ")}
          </div>

          <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-nome">
            Nome
          </label>
          <input
            id="bse-nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
          />

          <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-zap">
            WhatsApp
          </label>
          <input
            id="bse-zap"
            required
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(mascararTelefone(e.target.value))}
            className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
          />

          <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-modelo">
            Que carro você procura
          </label>
          <input
            id="bse-modelo"
            required
            list={modelosConhecidos.length > 0 ? "bse-modelos" : undefined}
            value={modeloDesejado}
            onChange={(e) => setModeloDesejado(e.target.value)}
            className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
          />
          {modelosConhecidos.length > 0 && (
            <datalist id="bse-modelos">
              {modelosConhecidos.map((m) => (
                <option key={m} value={`${marca} ${m}`} />
              ))}
            </datalist>
          )}

          <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-inv">
            Quanto pretende investir
          </label>
          <select
            id="bse-inv"
            required
            value={investimento}
            onChange={(e) => setInvestimento(e.target.value)}
            className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
          >
            <option value="">Selecione</option>
            {FAIXAS_DE_INVESTIMENTO.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>

          {/* Honeypot: fora da ordem de tabulação e escondido de leitor de tela. */}
          <input
            type="text"
            name="apelido"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />

          <button
            type="button"
            onClick={() => setDetalhar((v) => !v)}
            className="mt-foco mb-4 text-[12px] font-semibold text-mt-accent underline"
            aria-expanded={detalhar}
          >
            {detalhar ? "menos detalhes" : "detalhar mais (opcional)"}
          </button>

          {detalhar && (
            <div className="mb-4 border-l-2 border-mt-regua-fina pl-4">
              <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-ano">
                Ano, no mínimo
              </label>
              <select
                id="bse-ano"
                value={anoMin}
                onChange={(e) => setAnoMin(e.target.value)}
                className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
              >
                <option value="">tanto faz</option>
                {ANOS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <fieldset className="mb-4">
                <legend className="text-[12px] font-semibold text-mt-neutral-600">
                  Tem carro na troca?
                </legend>
                {[
                  { v: "sim", r: "Sim" },
                  { v: "nao", r: "Não" },
                ].map(({ v, r }) => (
                  <label key={v} className="mr-4 inline-flex items-center gap-1.5 text-[14px]">
                    <input
                      type="radio"
                      name="bse-troca"
                      value={v}
                      checked={temTroca === v}
                      onChange={(e) => setTemTroca(e.target.value)}
                    />
                    {r}
                  </label>
                ))}
              </fieldset>

              <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-prazo">
                Prazo
              </label>
              <select
                id="bse-prazo"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="mt-foco mb-4 w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
              >
                <option value="">sem definir</option>
                {PRAZOS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>

              <label className="block text-[12px] font-semibold text-mt-neutral-600" htmlFor="bse-obs">
                Mais alguma coisa
              </label>
              <textarea
                id="bse-obs"
                maxLength={300}
                rows={3}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="mt-foco w-full border border-mt-regua bg-transparent px-3 py-2 text-[14px] text-mt-ink"
              />
            </div>
          )}

          <Turnstile
            ref={turnstileRef}
            action={ACOES.buscaEncomenda}
            onSuccess={setToken}
            onError={() => setCaptchaBloqueado(true)}
            onExpire={() => setToken("")}
          />

          {captchaBloqueado && <SaidaDoCaptcha mensagem={mensagemDoPedido(montarPedido())} />}

          {erro && (
            <p className="m-0 mb-3 text-[13px] text-mt-neutral-800">
              {erro}{" "}
              {avisarHref && (
                <a href={avisarHref} className="mt-foco underline" target="_blank" rel="noopener noreferrer">
                  Fale direto no WhatsApp
                </a>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando || !token}
            className="mt-btn mt-btn-primario mt-foco disabled:opacity-50"
          >
            {enviando ? "ENVIANDO…" : "ENVIAR PEDIDO"}
          </button>

          <p className="m-0 mt-4 text-[12px] leading-relaxed text-mt-neutral-600">
            A Motors Store não cobra pela busca. Você só decide quando o carro estiver na sua
            frente, com o laudo cautelar independente.
          </p>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Travar por fonte o que o ambiente de teste não alcança**

`vitest.config.ts` roda em `environment: "node"`, sem jsdom e sem
testing-library — o próprio comentário do arquivo diz que teste de componente
vai precisar disso "quando chegarem". Instalar jsdom aqui seria escopo que a
feature não pediu. Duas travas do §6 do spec — a forma do POST e o beco do
`wa.me` — viram asserção de fonte, que é o padrão desta casa, e ganham prova de
verdade no navegador na Task 6.

Acrescentar a `tests/busca-sob-encomenda.test.ts`:

```ts
describe("o envio do formulário", () => {
  const fonte = ler("src/components/BuscaSobEncomenda.tsx");

  it("posta no funil que já existe, não num endpoint próprio", () => {
    expect(fonte).toContain('fetch("/api/leads"');
    expect(fonte).not.toContain("/api/busca-encomenda");
  });

  it("manda o bloco que a rota lê e o canal que o kanban mostra", () => {
    expect(fonte).toContain("busca_encomenda: pedido");
    expect(fonte).toContain("canal: CANAL_BUSCA_ENCOMENDA");
  });

  it("compartilha o event_id com o Pixel, para o CAPI deduplicar", () => {
    expect(fonte).toContain("trackLeadSubmission");
    expect(fonte).toContain("eventId,");
  });

  it("reseta o Turnstile quando o envio falha", () => {
    // Token do Turnstile é de uso único. Sem o reset, o segundo clique manda o
    // mesmo token queimado, leva 403, e o visitante fica preso até recarregar.
    expect(fonte).toContain("turnstileRef.current?.reset()");
  });

  it("oferece o wa.me quando o endpoint falha — nunca se perde o contato", () => {
    // A guarda vem ANTES da fatia. Com `indexOf` em -1, `slice(-1, 499)`
    // devolve o último caractere do arquivo — uma string que não contém
    // "avisarHref" e faz o teste falhar pelo motivo errado, escondendo que o
    // bloco de erro nem existe.
    const inicio = fonte.indexOf("{erro &&");
    expect(inicio).toBeGreaterThan(-1);
    expect(fonte.slice(inicio, inicio + 500)).toContain("avisarHref");
  });

  it("some em silêncio quando o honeypot vem preenchido", () => {
    // Dizer "recusado" ensina o robô a tentar de novo sem o campo.
    expect(fonte).toContain("apelido.trim() !== \"\"");
  });
});
```

- [ ] **Step 3: Rodar as travas novas**

```bash
npx vitest run tests/busca-sob-encomenda.test.ts
```

Esperado: PASS. Um `indexOf` de −1 passaria por posição válida numa asserção de
ordem — por isso o teste do `wa.me` afirma o `indexOf` explicitamente antes de
fatiar.

- [ ] **Step 4: Conferir que compila**

```bash
npx tsc --noEmit
```

Esperado: sem erro. Se `getMatchParams` ou `getUtmParameters` reclamarem de tipo, conferir a assinatura em `src/lib/tracking-identity.ts` e `src/lib/telemetry.ts` e ajustar a chamada — não silenciar com `any`.

- [ ] **Step 5: Commit**

```bash
git add src/components/BuscaSobEncomenda.tsx tests/busca-sob-encomenda.test.ts
git commit -m "feat(busca-encomenda): o formulario que abre na propria pagina

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: A prop opt-in e as duas páginas

**Files:**
- Modify: `src/components/modernist/PaginaDeEstoque.tsx` (interface ~72; destructuring ~131; estado vazio ~248-265)
- Modify: `src/app/[categoria]/[marca]/page.tsx` (~125 e ~154)
- Modify: `src/app/[categoria]/[marca]/[modelo]/page.tsx` (~167 e ~186)
- Create: `tests/busca-sob-encomenda-na-pagina.test.ts`

**Interfaces:**
- Consumes: `BuscaSobEncomenda` e `AlvoDaBusca` (Task 3).
- Produces: `PaginaDeEstoqueProps.buscaSobEncomenda?: AlvoDaBusca`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/busca-sob-encomenda-na-pagina.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PaginaDeEstoque from "../src/components/modernist/PaginaDeEstoque";
import type { Veiculo } from "../src/types";

/**
 * O bloco tem que estar no HTML DO SERVIDOR.
 *
 * `BuscaSobEncomenda` é `"use client"`, e a dúvida legítima é se a oferta chega
 * ao Googlebot. Chega: client component montado por server component é
 * renderizado no servidor na primeira resposta. `renderToStaticMarkup` prova
 * isso aqui — e prova no PONTO DE CHAMADA, montando a página, não chamando a
 * função da copy (que já é testada em busca-sob-encomenda.test.ts e passaria
 * mesmo que ninguém a usasse).
 *
 * As três regressões que este arquivo trava:
 *
 *   1. Página COM carro não ganha o bloco — o hub existe para levar ao carro.
 *   2. Página SEM a prop mantém o "avise-me" de hoje. São 60+ hubs
 *      (/estoque/[recorte], bairros, /garantia, /financiamento) compartilhando
 *      este mesmo componente, e nenhum deles pediu formulário.
 *   3. "Ver todo o estoque" continua nas duas variantes — regra 6 do CLAUDE.md.
 */

const carro = (id: string): Veiculo =>
  ({
    id,
    marca: "Volkswagen",
    modelo: "Nivus",
    versao: "",
    ano: 2022,
    preco: 90000,
    quilometragem: 30000,
    vendido: false,
  }) as unknown as Veiculo;

const alvoDeMarca = {
  marca: "Citroën",
  caminho: "/carros/citroen",
  genero: "m" as const,
  avisarHref: "https://wa.me/5541997372165?text=oi",
};

const alvoDeModelo = {
  marca: "Volkswagen",
  modelo: "Tiguan",
  caminho: "/carros/volkswagen/tiguan",
  genero: "m" as const,
  avisarHref: "https://wa.me/5541997372165?text=oi",
};

const montar = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(PaginaDeEstoque, {
      trilha: [{ rotulo: "Home", href: "/" }],
      titulo: "Teste",
      veiculos: [],
      ...props,
    } as never),
  );

describe("o bloco no HTML do servidor", () => {
  it("aparece com a grade vazia e a prop presente", () => {
    const html = montar({ buscaSobEncomenda: alvoDeMarca });
    expect(html).toContain("Sem Citroën hoje. A gente busca o seu.");
    expect(html).toContain("perícia cautelar independente");
    expect(html).toContain("laudo cautelar independente");
  });

  it("traz a oferta e o botão prontos, sem depender de hidratação", () => {
    const html = montar({ buscaSobEncomenda: alvoDeMarca });
    expect(html).toContain("PROCURE ESSE CARRO PRA MIM");
    expect(html).toContain("48h úteis");
  });

  it("usa a variante de modelo quando há modelo", () => {
    const html = montar({ buscaSobEncomenda: alvoDeModelo });
    expect(html).toContain("Nenhum Volkswagen Tiguan no estoque agora.");
    expect(html).toContain("PROCURE ESSE TIGUAN PRA MIM");
  });

  it("concorda no feminino para moto", () => {
    const html = montar({
      buscaSobEncomenda: { ...alvoDeMarca, marca: "Suzuki", genero: "f", caminho: "/motos/suzuki" },
    });
    expect(html).toContain("Sem Suzuki hoje. A gente busca a sua.");
    expect(html).toContain("PROCURE ESSA MOTO PRA MIM");
  });
});

describe("o que o bloco não pode quebrar", () => {
  it("não aparece quando a grade tem carro", () => {
    const html = montar({ veiculos: [carro("1")], buscaSobEncomenda: alvoDeMarca });
    expect(html).not.toContain("A gente busca o seu");
  });

  it("sem a prop, o avise-me de hoje continua igual", () => {
    // Os 60+ hubs que compartilham este componente e não pediram formulário.
    const html = montar({ avisarHref: "https://wa.me/5541997372165?text=oi" });
    expect(html).toContain("AVISE-ME QUANDO ENTRAR");
    expect(html).not.toContain("A gente busca");
  });

  it("com a prop, o avise-me dá lugar ao formulário — não empilha os dois CTAs", () => {
    const html = montar({ buscaSobEncomenda: alvoDeMarca, avisarHref: "https://wa.me/55419?text=oi" });
    expect(html).not.toContain("AVISE-ME QUANDO ENTRAR");
  });

  it("mantém 'ver todo o estoque' nas duas variantes (regra 6)", () => {
    expect(montar({ buscaSobEncomenda: alvoDeMarca })).toContain("/estoque");
    expect(montar({ buscaSobEncomenda: alvoDeMarca })).toContain("VER TODO O ESTOQUE");
    expect(montar({ buscaSobEncomenda: alvoDeModelo })).toContain("VER O QUE TEM HOJE NO ESTOQUE");
  });

  it("oferece o /carro-perfeito só na página de marca", () => {
    // Na de modelo a pessoa JÁ sabe qual carro quer — a pergunta não se aplica.
    expect(montar({ buscaSobEncomenda: alvoDeMarca })).toContain("/carro-perfeito");
    expect(montar({ buscaSobEncomenda: alvoDeModelo })).not.toContain("/carro-perfeito");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
npx vitest run tests/busca-sob-encomenda-na-pagina.test.ts
```

Esperado: FAIL — o HTML não contém "Sem Citroën hoje".

- [ ] **Step 3: Abrir a prop em `PaginaDeEstoque`**

No topo do arquivo, junto dos outros imports:

```tsx
import BuscaSobEncomenda, { type AlvoDaBusca } from "../BuscaSobEncomenda";
```

Na interface `PaginaDeEstoqueProps`, logo depois de `avisarHref?: string;`:

```tsx
  /**
   * Troca o "avise-me" por uma oferta de busca — só nos hubs de marca e modelo.
   *
   * Opt-in de propósito. Este componente é compartilhado por
   * `/estoque/[recorte]`, `/financiamento`, `/garantia` e as páginas de bairro:
   * mudar o estado vazio sem prop mudaria 60+ páginas de uma vez, e em "SUVs
   * até 60 mil" o visitante não pediu um carro específico — o formulário
   * perderia o objeto e viraria o `/carro-perfeito`, que já existe.
   */
  buscaSobEncomenda?: AlvoDaBusca;
```

No destructuring, depois de `avisarHref = "",`:

```tsx
  buscaSobEncomenda,
```

No estado vazio, substituir o `<div className="border-b border-mt-regua-fina py-10">` inteiro — do `<p>` do `textoSemEstoque` até o fecho do bloco de botões — pelo condicional. O bloco de `alternativos` fica onde está:

```tsx
          <div className="border-b border-mt-regua-fina py-10">
            {buscaSobEncomenda ? (
              <BuscaSobEncomenda {...buscaSobEncomenda} avisarHref={avisarHref} />
            ) : (
              <>
                <p className="m-0 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">
                  {textoSemEstoque ??
                    "Sem unidades disponíveis neste momento. O estoque gira toda semana — fale com um consultor e avisamos quando entrar."}
                </p>
                <div className="mt-6 flex flex-wrap gap-0.5">
                  {avisarHref && (
                    <BotaoWhatsApp
                      href={avisarHref}
                      origem="Hub sem estoque - Avise-me"
                      rotulo="AVISE-ME QUANDO ENTRAR"
                      className="mt-btn mt-btn-primario mt-foco"
                    />
                  )}
                  <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
                    VER TODO O ESTOQUE
                  </Link>
                </div>
              </>
            )}

            {alternativos.length > 0 && (
              <div className="mt-10">
                <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">{rotuloAlternativos}</h2>
                <div className="mt-5">
                  <GradeDeVeiculos veiculos={alternativos} prioritarios={0} />
                </div>
              </div>
            )}
          </div>
```

`BuscaSobEncomenda` desenha a própria borda e o próprio `py-10`, e agora está dentro de um wrapper que faz o mesmo. Conferir no navegador na **Task 6**: se aparecer régua dobrada ou respiro dobrado, tirar `border-b border-mt-regua-fina py-10` do componente filho e deixar o wrapper mandar — o wrapper é quem também embrulha os `alternativos`.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run tests/busca-sob-encomenda-na-pagina.test.ts
```

Esperado: PASS, 10 testes.

- [ ] **Step 5: Passar a prop na página de marca**

Em `src/app/[categoria]/[marca]/page.tsx`, no JSX do `<PaginaDeEstoque>`, logo depois de `avisarHref={avisarHref}`:

```tsx
        buscaSobEncomenda={{
          marca: hub.nome,
          caminho,
          genero,
          modelosConhecidos: hub.modelos.map((m) => m.nome),
        }}
```

- [ ] **Step 6: Passar a prop na página de modelo**

Em `src/app/[categoria]/[marca]/[modelo]/page.tsx`, depois de `avisarHref={avisarHref}`:

```tsx
        buscaSobEncomenda={{
          marca: hub.marca,
          modelo: hub.nome,
          caminho,
          genero: hub.genero,
        }}
```

- [ ] **Step 7: Suíte cheia**

```bash
npm test
```

Esperado: PASS. `tests/hub-sem-estoque.test.ts` é o que mais chance tem de acusar — ele monta `PaginaDeEstoque` com grade vazia. Se acusar, é porque ele espera "AVISE-ME QUANDO ENTRAR" sem passar a prop nova; nesse caso a expectativa dele continua certa e o defeito é meu.

- [ ] **Step 8: Commit**

```bash
git add src/components/modernist/PaginaDeEstoque.tsx "src/app/[categoria]/[marca]/page.tsx" "src/app/[categoria]/[marca]/[modelo]/page.tsx" tests/busca-sob-encomenda-na-pagina.test.ts
git commit -m "feat(busca-encomenda): os 42 hubs vazios deixam de ser beco

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: A migração que nomeia as três colunas

**Files:**
- Create: `supabase/migrations/20260906120000_colunas_do_pedido_de_busca.sql`
- Modify: `supabase/README.md` (linha da tabela de migrações)

**Interfaces:** nenhuma — a migração não altera schema, só documenta.

> **Convenção do projeto:** `supabase/migrations/` é território do agente
> `db-architect` ("único agente autorizado a escrever em
> supabase/migrations/"). Se este plano estiver sendo executado por subagentes,
> esta task vai para ele.

Por que existe: `modelo_interesse`, `respostas_raw` e `disponivel_estoque`
vieram da ferramenta de marketing que criou `leads` antes da disciplina de
migrações deste repositório. Nenhuma migração as criou, nenhum código as lia, e
a partir da Task 2 elas passam a carregar significado. Coluna com dado e sem
definição é a próxima ambiguidade da `AUDITORIA.md`.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/20260906120000_colunas_do_pedido_de_busca.sql`:

```sql
-- ==========================================================
-- Busca sob encomenda — as três colunas herdadas ganham dono
-- ==========================================================
--
-- Esta migração NÃO altera schema. Ela nomeia o que três colunas passam a
-- significar a partir de 2026-09-06.
--
-- `leads` foi criada fora deste repositório, por uma ferramenta de marketing,
-- antes da disciplina de migrações (ver 20260807210000_leads.sql, que a
-- encontrou preexistente e vazia). Ela trouxe uma dezena de colunas que nunca
-- foram documentadas e que nenhum código lia — entre elas estas três, com
-- nomes bons demais para o acaso:
--
--   modelo_interesse ...... o carro que a pessoa quer
--   respostas_raw ......... jsonb livre
--   disponivel_estoque .... boolean, default false
--
-- A Busca sob encomenda (o CTA dos 42 hubs de marca e modelo sem estoque)
-- passa a escrever nelas em vez de criar tabela nova — decisão registrada em
-- docs/superpowers/specs/2026-09-06-busca-sob-encomenda-design.md §2. O motivo
-- não é economia de schema: é que em `leads` o pedido nasce dentro do kanban
-- A1/A8 que a loja já abre, e numa tabela nova ele nasceria num lugar que
-- ninguém consulta.
--
-- Aditiva por construção: `comment on` não toca dado, não toca RLS e não toca
-- tipo. Reexecutar é inofensivo.
-- ==========================================================

comment on column public.leads.modelo_interesse is
    'O veículo que o lead PEDIU, em texto legível ("Citroën C3"). Preenchido '
    'pela Busca sob encomenda desde 2026-09-06; nulo nos leads que nascem numa '
    'ficha, onde o veículo é `veiculo_id`. Coluna herdada da ferramenta de '
    'marketing que criou esta tabela.';

comment on column public.leads.respostas_raw is
    'As respostas do formulário que gerou o lead, como vieram. Na Busca sob '
    'encomenda (canal "Busca sob encomenda"): marca, modelo_desejado, '
    'investimento, pagina_origem, ano_min, tem_troca, prazo, observacao. Os '
    'opcionais gravam `null`, nunca ausência de chave — "não respondeu" e '
    '"campo não existe" precisam ser distinguíveis na leitura.';

comment on column public.leads.disponivel_estoque is
    'O que a pessoa pediu estava à venda no momento do lead? `false` nos '
    'pedidos de Busca sob encomenda, que existem justamente porque o hub '
    'estava vazio. É o corte que separa demanda atendida de demanda perdida.';

-- ── autoconferência ──
do $$
declare
    faltando int := 0;
    c text;
begin
    foreach c in array array['modelo_interesse', 'respostas_raw', 'disponivel_estoque']
    loop
        if col_description('public.leads'::regclass, (
            select attnum from pg_attribute
             where attrelid = 'public.leads'::regclass and attname = c
        )) is null then
            faltando := faltando + 1;
            raise warning 'FALHOU: leads.% continua sem comentário', c;
        end if;
    end loop;

    if faltando > 0 then
        raise exception 'ACEITE FALHOU: % coluna(s) do pedido sem definição', faltando;
    end if;

    raise notice 'OK: as três colunas do pedido de busca estão documentadas.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260906120000', 'colunas_do_pedido_de_busca')
  on conflict (version) do nothing;
```

- [ ] **Step 2: Ensaiar em transação revertida**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260906120000_colunas_do_pedido_de_busca.sql
```

Sem `--gravar` o script roda dentro de `BEGIN`/`ROLLBACK` — é o staging que este
projeto não tem. Esperado: o `notice` "as três colunas do pedido de busca estão
documentadas" e nenhuma exceção.

Se o script reclamar de `api.supabase.com`, usar o `--db-url` do session pooler
(`SUPABASE_DB_URL` do `.env.local`).

- [ ] **Step 3: Gravar**

```bash
node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260906120000_colunas_do_pedido_de_busca.sql --gravar
```

- [ ] **Step 4: Provar pelo efeito, não pelo nome**

```bash
node -e "
const {readFileSync}=require('fs');
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,Accept:'application/openapi+json'}}).then(r=>r.json()).then(s=>{
  const p=s.definitions.leads.properties;
  for (const k of ['modelo_interesse','respostas_raw','disponivel_estoque']) console.log(k, '->', p[k].description ? 'documentada' : 'SEM COMENTÁRIO');
});
"
```

Esperado: as três como `documentada`. Conferir o efeito e não só o nome da
migração no livro-razão — migração registrada e sem efeito já aconteceu aqui.

- [ ] **Step 5: Registrar no README e commitar**

Acrescentar à tabela de migrações de `supabase/README.md`, no fim:

```
| `20260906120000_colunas_do_pedido_de_busca.sql` | Documenta `modelo_interesse`, `respostas_raw` e `disponivel_estoque` de `leads` — colunas herdadas da ferramenta de marketing que criou a tabela, que a Busca sob encomenda passa a escrever em vez de criar tabela nova (spec de 06/09 §2). Não altera schema: só `comment on column` e autoconferência. ✅ Aplicada 2026-09-06. |
```

```bash
git add supabase/migrations/20260906120000_colunas_do_pedido_de_busca.sql supabase/README.md
git commit -m "docs(leads): as tres colunas herdadas ganham definicao

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Provar no navegador

**Files:** nenhum — verificação.

- [ ] **Step 1: Subir o dev**

`preview_start` com `{url: "http://localhost:3000"}` depois de subir o servidor no worktree. Atenção: `preview_start {name}` roda no cwd da sessão, não no worktree, e morre se houver outro `next dev` na pasta. Limpar `.next` antes se a rota responder 404 com corpo HTML do not-found.

- [ ] **Step 2: Conferir o HTML servido, sem JavaScript**

```bash
curl -s http://localhost:3000/carros/citroen | grep -c "A gente busca o seu"
```

Esperado: `1`. Zero significa que o bloco não chegou ao HTML do servidor e o critério §12.2 do handoff falhou.

- [ ] **Step 3: Conferir a página COM estoque**

```bash
curl -s http://localhost:3000/carros/peugeot/2008 | grep -c "A gente busca"
```

Esperado: `0`.

- [ ] **Step 4: Conferir um hub fora do escopo**

```bash
curl -s http://localhost:3000/estoque/suv | grep -c "A gente busca"
```

Esperado: `0` — e, se esse recorte estiver sem carro, ele deve mostrar "AVISE-ME QUANDO ENTRAR".

- [ ] **Step 5: Abrir o formulário e enviar**

Pelo `computer`/`read_page`: clicar em "PROCURE ESSE CARRO PRA MIM", preencher nome, WhatsApp, modelo e investimento, enviar. Conferir em `read_network_requests` que saiu um `POST /api/leads` com `busca_encomenda` no corpo e `canal: "Busca sob encomenda"`.

Em desenvolvimento a chave do Turnstile é a de teste; se o botão ficar `disabled` por falta de token, é a chave que não está no `.env.local` do worktree — conferir `NEXT_PUBLIC_TURNSTILE_SITE_KEY` antes de mexer no componente.

- [ ] **Step 6: Conferir a linha no banco**

```bash
node -e "
const {readFileSync}=require('fs');
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
fetch(env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/leads?select=nome,canal,modelo_interesse,disponivel_estoque,respostas_raw&canal=eq.Busca%20sob%20encomenda&order=created_at.desc&limit=3',{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2)));
"
```

Esperado: a linha do teste, com `modelo_interesse` preenchido, `disponivel_estoque: false` e `respostas_raw` trazendo `pagina_origem`.

**Apagar a linha de teste depois de conferir** — é PII de mentira numa tabela de retenção indeterminada.

- [ ] **Step 7: Screenshot e commit final**

Screenshot do bloco em `/carros/citroen`, mobile e desktop. Sem alteração de código, não há commit; se houver ajuste de espaçamento (régua dobrada do Step 3 da Task 4), commitar:

```bash
git add -A
git commit -m "fix(busca-encomenda): acerto de espacamento visto no navegador

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Revisão adversarial

**Files:** nenhum — revisão.

- [ ] **Step 1: `qa-guardian`**

`CLAUDE.md`: "Toda entrega passa pelo `qa-guardian` antes de merge." Dispachar o agente com o diff de `main..feat/busca-sob-encomenda` e o spec, pedindo especificamente: as regras 6 e 7 do `CLAUDE.md`, o vocabulário perícia/laudo, e se algum lead que NÃO é busca sob encomenda mudou de forma.

- [ ] **Step 2: Reintegrar o main**

```bash
git fetch origin main && git merge origin/main
npm test
```

O main anda durante o PR. Rodar a suíte sobre o resultado do merge, não sobre o branch isolado.

- [ ] **Step 3: Abrir o PR**

`gh` não tem login nesta máquina; abrir pelo Chrome logado em
`https://github.com/85dyones/motors-site-oficial/compare/main...feat/busca-sob-encomenda?quick_pull=1`.

---

## Fora deste plano

Registrado aqui para não parecer esquecimento:

- **PR de vocabulário** (13 pontos + `lib/supabase.ts:62`), decidido pelo dono em 2026-09-06 como entrega separada. **Atenção:** `src/lib/linksNoTexto.ts:67` tem `{ termo: "laudo cautelar", href: "/garantia" }` — um auto-linkador que casa a grafia curta. Trocar o texto para "laudo cautelar independente" sem atualizar essa entrada produziria `<a>laudo cautelar</a> independente`, partindo o termo ao meio. O bloco desta feature não passa pelo linkador (é JSX literal), então o problema é só do outro PR.
- **n8n:** etiqueta `busca-encomenda` no Chatwoot, ping do consultor, follow-up de 48h.
- **Captain (Ney):** oferecer a busca quando o modelo pedido não está no snapshot.
- **Google Enhanced Conversions:** inerte de propósito; ligar sem desligar a tag 210 do GTM dobra a contagem.
