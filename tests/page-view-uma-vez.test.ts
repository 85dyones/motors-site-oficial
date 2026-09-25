// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import configuracaoDoRepositorio from "../src/lib/companySettings.json";
import { rastreamentoRecusado } from "../src/lib/telemetry";

/**
 * Uma visualização de página por página vista: nem a mais, nem a menos.
 *
 * ---------------------------------------------------------------------------
 * O defeito que originou este arquivo
 * ---------------------------------------------------------------------------
 * Medido em produção em 16/09/2026, no Chrome, sem oposição: TODA chegada ao
 * site mandava dois `page_view` ao GA4 na mesma sessão, e o `dataLayer`
 * mostrava um `["event","page_view"]` que navegação nenhuma tinha pedido, além
 * do `config` que já manda o seu.
 *
 * O efeito de navegação do `IntegrationsTracker` dependia de
 * `[pathname, ga4Id, metaPixelId]` e só pulava a PRIMEIRA execução. O
 * `ThemeContext` começa com o `companySettings.json` do repositório, que tem
 * `metaPixelId: ""`, e o `/api/settings` troca pelo id do painel. O efeito
 * reexecutava sem navegação e mandava `gtag('event','page_view')` e
 * `fbq('track','PageView')` para a página que o `config` e o snippet do Meta já
 * tinham contado.
 *
 * Visualização em dobro não é só volume errado. No GA4, sessão com duas
 * visualizações conta como engajada, então taxa de engajamento e taxa de
 * rejeição erravam junto.
 *
 * ---------------------------------------------------------------------------
 * Como se conta aqui
 * ---------------------------------------------------------------------------
 *   - O script servido (`BootstrapDeTags`) e o tracker de verdade rodam no
 *     mesmo DOM, como em `tags-no-ato.test.ts`.
 *   - UMA janela só. No vitest, `window` é o global do Node, e os scripts
 *     inline que o tracker injeta rodam na janela do jsdom. No navegador as
 *     duas são a mesma, então aqui as chaves das tags no global do Node
 *     encaminham para a janela do jsdom. Sem isso, o efeito de navegação
 *     chamaria um `fbq` que o snippet nunca criou.
 *   - GA4: contado na FILA, e não num espião posto em `window.gtag`. Todo
 *     `gtag` desta página, o do script servido e o que o tracker injeta,
 *     empurra os argumentos para o `dataLayer`, que é o que a biblioteca lê. E
 *     o script do tracker DECLARA `function gtag` no escopo global: um espião
 *     em `window.gtag` seria trocado no meio do teste e pararia de contar sem
 *     avisar. Cada `config` manda um `page_view`, e cada `event page_view`
 *     manda outro.
 *   - Meta: espião em volta do `fbq`. Como no navegador, ele só existe depois
 *     que alguém cria o stub (desde 16/09, o script servido; antes, o snippet
 *     do tracker), e registra toda chamada, as da subida e as do efeito de
 *     navegação.
 */

const cenario = vi.hoisted(() => ({
  /** O `companySettings` com que o HTML foi renderizado. */
  servidor: {} as Record<string, unknown>,
  /** O que o `ThemeContext` entrega ao tracker. */
  cliente: {} as Record<string, unknown>,
  /** O que `usePathname` devolve: só o caminho, sem query nem hash. */
  caminho: "/",
}));

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: cenario.servidor }),
}));
vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ companySettings: cenario.cliente }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => cenario.caminho }));

/** Sem esta linha o `act` não espera os efeitos. Ver `painel-de-guias-fiacao`. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPOSITORIO = configuracaoDoRepositorio as Record<string, unknown>;

/**
 * A configuração de produção, como o `/api/settings` público a entregava em
 * 16/09/2026. O pixel é preenchido no painel. O número daqui é inventado; o
 * que importa é que o JSON do repositório NÃO tem pixel.
 */
const PAINEL: Record<string, unknown> = {
  ...REPOSITORIO,
  ga4Id: "G-KBL1MFN9E3",
  gtmId: "GTM-TB665RN9",
  gtmAssumeEventos: true,
  metaPixelId: "1234567890",
};

/**
 * A oposição do visitante. Toda escrita dela aqui é conferida contra
 * `rastreamentoRecusado()`, a régua do site, para que o teste não exercite uma
 * oposição que o site não reconhece.
 */
const CHAVE_DA_OPOSICAO = "ag_cookie_consent";
const VALOR_DA_OPOSICAO = "rejected";

type Janela = Record<string, unknown>;
const janelaDoJsdom = () => (globalThis as unknown as { jsdom: { window: Janela } }).jsdom.window;
const CHAVES_DAS_TAGS = ["dataLayer", "gtag", "fbq", "_fbq", "__mtTagsNoAto", "__mtTipoJaPublicado"];

let fbq: Mock<(...args: unknown[]) => void>;
let raiz: Root | null = null;
let estrito = false;

beforeEach(() => {
  for (const chave of CHAVES_DAS_TAGS) {
    Object.defineProperty(globalThis, chave, {
      configurable: true,
      get: () => janelaDoJsdom()[chave],
      set: (valor) => {
        janelaDoJsdom()[chave] = valor;
      },
    });
  }

  // O stub que o snippet do Meta cria (`n=f.fbq=function(){...}`) passa pelo
  // `set`; quem chama `fbq` depois disso recebe o espião, que repassa ao stub.
  let stub: ((...args: unknown[]) => void) | undefined;
  const espiao = vi.fn((...args: unknown[]) => {
    stub?.(...args);
  });
  fbq = espiao;
  Object.defineProperty(janelaDoJsdom(), "fbq", {
    configurable: true,
    get: () => (stub ? espiao : undefined),
    set: (valor) => {
      stub = valor;
    },
  });

  cenario.caminho = "/";
  window.history.replaceState(null, "", "/");
});

afterEach(async () => {
  const montada = raiz;
  raiz = null;
  estrito = false;
  if (montada) await act(async () => montada.unmount());
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  localStorage.clear();
  const jw = janelaDoJsdom();
  for (const chave of CHAVES_DAS_TAGS) {
    delete (globalThis as unknown as Janela)[chave];
    // `function gtag(){}` declarado no script inline do tracker vira global NÃO
    // configurável da janela do jsdom, e `delete` nele lança.
    if (Object.getOwnPropertyDescriptor(jw, chave)?.configurable) delete jw[chave];
    else if (chave in jw) jw[chave] = undefined;
  }
});

/** Executa o script que o servidor mandaria, como o parser do HTML o executaria. */
async function chegar(servidor: Record<string, unknown>) {
  cenario.servidor = servidor;
  const { default: BootstrapDeTags } = await import("../src/components/BootstrapDeTags");
  const elemento = (await BootstrapDeTags()) as {
    props: { dangerouslySetInnerHTML: { __html: string } };
  } | null;
  new Function(elemento?.props.dangerouslySetInnerHTML.__html ?? "")();
}

async function renderizar() {
  const { default: IntegrationsTracker } = await import("../src/components/IntegrationsTracker");
  if (!raiz) {
    const hospedeiro = document.createElement("div");
    document.body.appendChild(hospedeiro);
    raiz = createRoot(hospedeiro);
  }
  const montada = raiz;
  const tracker = createElement(IntegrationsTracker);
  await act(async () => {
    montada.render(estrito ? createElement(StrictMode, null, tracker) : tracker);
  });
}

/** Primeiro render: o que o `ThemeContext` tem antes de o `/api/settings` responder. */
async function hidratar(cliente: Record<string, unknown>, opcoes: { estrito?: boolean } = {}) {
  estrito = opcoes.estrito ?? false;
  cenario.cliente = cliente;
  await renderizar();
}

/** O `/api/settings` respondeu, e o `ThemeContext` trocou a configuração. */
async function painelResponde(cliente: Record<string, unknown>) {
  cenario.cliente = cliente;
  await renderizar();
}

/**
 * Navegação no cliente: a URL muda sem recarregar, e o layout re-renderiza.
 * O caminho que o tracker recebe é o de `usePathname`, sem query nem hash.
 */
async function navegar(url: string) {
  window.history.pushState(null, "", url);
  cenario.caminho = window.location.pathname;
  await renderizar();
}

async function oporSeAntesDeChegar() {
  localStorage.setItem(CHAVE_DA_OPOSICAO, VALOR_DA_OPOSICAO);
  expect(rastreamentoRecusado(), "a régua do site não reconhece esta oposição").toBe(true);
}

/** O que o `ControleDeRastreamento` faz no clique, em `/privacidade`. */
async function oposicao(ligada: boolean) {
  await act(async () => {
    if (ligada) localStorage.setItem(CHAVE_DA_OPOSICAO, VALOR_DA_OPOSICAO);
    else localStorage.removeItem(CHAVE_DA_OPOSICAO);
    window.dispatchEvent(new Event("ag-cookie-consent-updated"));
  });
  expect(rastreamentoRecusado(), "a régua do site não reconhece esta oposição").toBe(ligada);
}

interface Contagem {
  /** `page_view` que cada propriedade recebeu: um por `config`, um por `event page_view`. */
  ga4: Record<string, number>;
  /** O `page_path` de cada `gtag('event','page_view')`, na ordem em que saiu. */
  avulsos: string[];
  /** `fbq('track','PageView')`, incluído o do snippet. */
  meta: number;
}

function contar(): Contagem {
  const fila = (janelaDoJsdom().dataLayer ?? []) as unknown[];
  const ga4: Record<string, number> = {};
  const avulsos: string[] = [];
  const somar = (id: unknown) => {
    ga4[String(id)] = (ga4[String(id)] ?? 0) + 1;
  };
  for (const item of fila) {
    // Comando do `gtag` chega como `arguments`. O `page_context` e o `gtm.js`
    // são objetos comuns, sem `length`, e não interessam aqui.
    const comando = item as {
      length?: unknown;
      0?: unknown;
      1?: unknown;
      2?: { send_to?: unknown; page_path?: unknown; send_page_view?: unknown };
    } | null;
    if (!comando || typeof comando.length !== "number") continue;
    if (comando[0] === "config" && comando[2]?.send_page_view !== false) somar(comando[1]);
    if (comando[0] === "event" && comando[1] === "page_view") {
      somar(comando[2]?.send_to);
      avulsos.push(String(comando[2]?.page_path));
    }
  }
  const meta = fbq.mock.calls.filter(([acao, evento]) => acao === "track" && evento === "PageView").length;
  return { ga4, avulsos, meta };
}

describe("chegada: a página em que as tags sobem é contada pela própria subida", () => {
  it("o painel traz o pixel que o JSON do repositório não tem, como em produção hoje", async () => {
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    // O `page_view` é o do `config` do script servido, e o `PageView` também
    // sai dele desde 16/09. O painel traz o mesmo pixel, e o tracker não repete.
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 1 }, avulsos: [], meta: 1 });
  });

  it("só o id do GA4 muda no painel: cada propriedade recebe o seu `config`, e nenhuma recebe avulso", async () => {
    await chegar({ ...PAINEL, ga4Id: "G-VELHO01" });
    await hidratar({ ...REPOSITORIO, metaPixelId: PAINEL.metaPixelId });
    await painelResponde({ ...PAINEL, ga4Id: "G-NOVO02" });
    // Três propriedades porque os três lados divergem: o HTML em cache, o JSON
    // e o painel. Cada uma recebe UM `page_view`, o do seu `config`.
    expect(contar()).toEqual({
      ga4: { "G-VELHO01": 1, "G-KBL1MFN9E3": 1, "G-NOVO02": 1 },
      avulsos: [],
      meta: 1,
    });
  });

  it("o painel devolve o que o JSON já tinha: nada reexecuta, e nada repete", async () => {
    await chegar(PAINEL);
    await hidratar({ ...PAINEL });
    await painelResponde({ ...PAINEL });
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 1 }, avulsos: [], meta: 1 });
  });

  it("o /api/settings falha com o JSON do repositório: o GA4 e o Meta contam a chegada, uma vez cada", async () => {
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    // Até 16/09 o Meta dava zero aqui: sem `metaPixelId` no JSON, o pixel só
    // inicializava quando o painel respondia. Desde então ele sobe no parse do
    // HTML, com o id do servidor (`tests/meta-no-ato.test.ts`).
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 1 }, avulsos: [], meta: 1 });
  });

  it("o /api/settings falha e o primeiro render já tem o pixel: uma de cada", async () => {
    await chegar(PAINEL);
    await hidratar({ ...REPOSITORIO, metaPixelId: PAINEL.metaPixelId });
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 1 }, avulsos: [], meta: 1 });
  });

  it("o HTML veio sem as tags: quem conta a chegada é o `config` do tracker, uma vez", async () => {
    // Configuração indisponível no servidor: o script servido não renderiza, e
    // o tracker sobe tudo na hidratação.
    await chegar({});
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 1 }, avulsos: [], meta: 1 });
  });

  it("no StrictMode do `next dev` o efeito roda duas vezes na montagem, e a chegada continua valendo uma", async () => {
    // O App Router liga o StrictMode quando o `next.config` não diz nada, e em
    // desenvolvimento o React monta, desmonta e monta de novo. O ref sobrevive a
    // isso; uma marca de "primeira execução" não.
    await chegar(PAINEL);
    await hidratar(PAINEL, { estrito: true });
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 1 }, avulsos: [], meta: 1 });
  });
});

describe("navegação no cliente: uma de cada por troca de caminho", () => {
  it("A → B: uma visualização de B, com o caminho de B", async () => {
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    await navegar("/estoque");
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 2 }, avulsos: ["/estoque"], meta: 2 });
  });

  it("A → B → A: duas navegações, duas de cada, e voltar a uma página já vista também conta", async () => {
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    await navegar("/estoque");
    await navegar("/");
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 3 }, avulsos: ["/estoque", "/"], meta: 3 });
  });

  it("navegação antes de o painel responder: a resposta que chega depois não repete a página", async () => {
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await navegar("/estoque");
    await painelResponde(PAINEL);
    // GA4: o `config` da chegada e o avulso de /estoque. Meta: o PageView do
    // parse, na home, e o da navegação, em /estoque. Até 16/09 saía um só, o do
    // snippet que subia já em /estoque, e a home ficava sem.
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 2 }, avulsos: ["/estoque"], meta: 2 });
  });
});

describe("mudança só de query string ou de hash: o tracker não conta", () => {
  it("filtro na query e âncora no hash não são página nova para o tracker", async () => {
    await chegar(PAINEL);
    await hidratar(PAINEL);
    await navegar("/estoque");
    const depoisDaNavegacao = contar();
    expect(depoisDaNavegacao).toEqual({ ga4: { "G-KBL1MFN9E3": 2 }, avulsos: ["/estoque"], meta: 2 });

    // `usePathname` não carrega query nem hash: o caminho continua /estoque, e
    // o efeito nem roda. Se o GA4 ou o pixel contarem essas trocas sozinhos
    // (medição otimizada por histórico, no GA4), é configuração da
    // propriedade, não deste código.
    await navegar("/estoque?marca=jeep");
    await navegar("/estoque?marca=jeep#fotos");
    await navegar("/estoque#fotos");
    expect(contar()).toEqual(depoisDaNavegacao);
  });
});

describe("oposição: nada sai do tracker", () => {
  it("quem se opôs antes de chegar: nem a chegada, nem as navegações, nem o id do painel", async () => {
    await oporSeAntesDeChegar();
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    await navegar("/estoque");
    await navegar("/");
    expect(contar()).toEqual({ ga4: {}, avulsos: [], meta: 0 });
    expect(fbq.mock.calls, "o Meta recebeu alguma chamada").toEqual([]);
  });

  it("quem liga a oposição no meio da visita: as navegações seguintes não saem", async () => {
    await chegar(PAINEL);
    await hidratar(PAINEL);
    await oposicao(true);
    await navegar("/estoque");
    await navegar("/");
    expect(contar()).toEqual({ ga4: { "G-KBL1MFN9E3": 1 }, avulsos: [], meta: 1 });
  });

  it("quem retira a oposição no meio da visita volta a ser contado, inclusive ao voltar à página em que chegou", async () => {
    await oporSeAntesDeChegar();
    await chegar(PAINEL);
    await hidratar(PAINEL);
    await navegar("/estoque");
    expect(contar(), "com a oposição ligada").toEqual({ ga4: {}, avulsos: [], meta: 0 });

    // O tracker sobe as tags em /estoque, e a subida conta /estoque.
    await oposicao(false);
    expect(contar(), "oposição retirada").toEqual({ ga4: { "G-KBL1MFN9E3": 1 }, avulsos: [], meta: 1 });

    // Voltar à home é navegação. O caminho que o tracker viu por último é
    // /estoque, mesmo sem ter medido nada lá.
    await navegar("/");
    expect(contar(), "de volta à home").toEqual({ ga4: { "G-KBL1MFN9E3": 2 }, avulsos: ["/"], meta: 2 });
  });
});
