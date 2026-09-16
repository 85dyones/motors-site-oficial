// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import configuracaoDoRepositorio from "../src/lib/companySettings.json";
import { rastreamentoRecusado, trackVehicleView } from "../src/lib/telemetry";
import { lerCodigo } from "./fonte";

/**
 * O Meta Pixel sobe no parse do HTML, como o GA4 e o GTM, e conta a chegada
 * uma vez.
 *
 * ---------------------------------------------------------------------------
 * O defeito que originou este arquivo
 * ---------------------------------------------------------------------------
 * Até 16/09/2026 o pixel só inicializava no `IntegrationsTracker`, e só depois
 * de o `/api/settings` responder: o `companySettings.json` do repositório tem
 * `metaPixelId: ""`, e o `BootstrapDeTags` do PR #46 subia GA4 e GTM no parse,
 * mas não o pixel. Em produção ele entrou aos 3,7 s (02/09) e aos 5,4 s
 * (16/09). Por isso:
 *
 *   - quem saía antes da resposta não gerava `PageView`;
 *   - com o `/api/settings` fora do ar, o Meta ficava em zero;
 *   - o `fbq` não existia quando a ficha aberta na chegada disparava o
 *     `ViewContent`, e o do navegador não saía (só o do CAPI);
 *   - o `_fbp` nascia tarde, e o lead enviado cedo podia sair sem ele.
 *
 * ---------------------------------------------------------------------------
 * Como se conta aqui
 * ---------------------------------------------------------------------------
 * O arranjo de `page-view-uma-vez.test.ts`: o script servido e o tracker de
 * verdade no mesmo DOM, uma janela só, e um espião em volta do `fbq` que
 * registra toda chamada — as do script servido, as do snippet do tracker e as
 * do efeito de navegação. O jsdom não baixa o `fbevents.js`: nada sai para a
 * rede, e toda chamada fica na fila do stub, que é o que a biblioteca processa
 * quando chega.
 *
 * O que NÃO dá para provar aqui fica no checklist de preview: o `_fbp` e a
 * requisição a `facebook.com/tr`. Os dois nascem do `fbevents.js`, que o jsdom
 * não executa. O que este arquivo prova é a precondição dos dois: sem
 * biblioteca inserida e sem `fbq`, não há quem os crie.
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

/** O pixel de produção, lido do `/api/settings` público em 16/09/2026. */
const PIXEL = "1410450786690090";

/** A configuração de produção. O JSON do repositório NÃO tem o pixel. */
const PAINEL: Record<string, unknown> = {
  ...REPOSITORIO,
  ga4Id: "G-KBL1MFN9E3",
  gtmId: "GTM-TB665RN9",
  gtmAssumeEventos: true,
  metaPixelId: PIXEL,
};

const BIBLIOTECA = "https://connect.facebook.net/en_US/fbevents.js";

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
  // Uma janela só, como no navegador: o script servido roda no global do Node,
  // e os scripts inline que o tracker injeta rodam na janela do jsdom.
  for (const chave of CHAVES_DAS_TAGS) {
    Object.defineProperty(globalThis, chave, {
      configurable: true,
      get: () => janelaDoJsdom()[chave],
      set: (valor) => {
        janelaDoJsdom()[chave] = valor;
      },
    });
  }

  // O stub que cria o `fbq` (o do script servido ou o do snippet do tracker)
  // passa pelo `set`; quem chama `fbq` depois disso recebe o espião, que
  // repassa ao stub. Antes de alguém criar o stub, `fbq` é indefinido.
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
  for (const nome of ["_fbc", "_fbp"]) document.cookie = `${nome}=; path=/; max-age=0`;
  const jw = janelaDoJsdom();
  for (const chave of CHAVES_DAS_TAGS) {
    delete (globalThis as unknown as Janela)[chave];
    // `function gtag(){}` declarado no script inline do tracker vira global NÃO
    // configurável da janela do jsdom, e `delete` nele lança.
    if (Object.getOwnPropertyDescriptor(jw, chave)?.configurable) delete jw[chave];
    else if (chave in jw) jw[chave] = undefined;
  }
});

/**
 * Executa o script que o servidor mandaria, como o parser do HTML o executaria.
 *
 * `recusar` faz a injeção lançar para o `<script src>` que casar, que é o que
 * um `appendChild` recusado ou um `src` barrado por Trusted Types fariam.
 */
async function chegar(servidor: Record<string, unknown>, recusar?: RegExp) {
  cenario.servidor = servidor;
  const { default: BootstrapDeTags } = await import("../src/components/BootstrapDeTags");
  const elemento = (await BootstrapDeTags()) as {
    props: { dangerouslySetInnerHTML: { __html: string } };
  } | null;
  const cabeca = document.head as unknown as { appendChild?: (this: Node, no: Node) => Node };
  const anexar = Node.prototype.appendChild;
  if (recusar) {
    cabeca.appendChild = function (this: Node, no: Node) {
      if (recusar.test((no as HTMLScriptElement).src || "")) throw new Error("injeção recusada");
      return anexar.call(this, no);
    };
  }
  try {
    new Function(elemento?.props.dangerouslySetInnerHTML.__html ?? "")();
  } finally {
    delete cabeca.appendChild;
  }
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

/** Navegação no cliente: a URL muda sem recarregar, e o layout re-renderiza. */
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

/** A marca que o script servido deixa, lida da janela. */
function marca(): { ga4?: unknown; gtm?: unknown; meta?: unknown } | undefined {
  return janelaDoJsdom().__mtTagsNoAto as { ga4?: unknown; gtm?: unknown; meta?: unknown } | undefined;
}

interface Contagem {
  /** `<script src>` do `fbevents.js` no documento, de quem quer que o tenha inserido. */
  bibliotecas: number;
  /** Scripts inline com o snippet do pixel, que só o tracker injeta. */
  snippetsDoTracker: number;
  /** `fbq('init', id)`, por id. */
  inits: Record<string, number>;
  /** `fbq('track','PageView')`, de qualquer origem. */
  pageViews: number;
}

function contar(): Contagem {
  const scripts = [...document.querySelectorAll("script")] as HTMLScriptElement[];
  const inits: Record<string, number> = {};
  let pageViews = 0;
  for (const [acao, alvo] of fbq.mock.calls) {
    if (acao === "init") inits[String(alvo)] = (inits[String(alvo)] ?? 0) + 1;
    if (acao === "track" && alvo === "PageView") pageViews++;
  }
  return {
    bibliotecas: scripts.filter((s) => s.src === BIBLIOTECA).length,
    snippetsDoTracker: scripts.filter((s) => !s.src && (s.textContent ?? "").includes("fbq('init'")).length,
    inits,
    pageViews,
  };
}

/** O pixel subiu no parse, e ninguém o repetiu. */
const NO_PARSE = { bibliotecas: 1, snippetsDoTracker: 0, inits: { [PIXEL]: 1 }, pageViews: 1 };
/** O HTML não trouxe o pixel, e o tracker o subiu, uma vez. */
const PELO_TRACKER = { bibliotecas: 1, snippetsDoTracker: 1, inits: { [PIXEL]: 1 }, pageViews: 1 };
const NADA = { bibliotecas: 0, snippetsDoTracker: 0, inits: {}, pageViews: 0 };

describe("chegada: o pixel sobe no parse e conta a página uma vez", () => {
  it("o parse sozinho inicializa o pixel e manda o PageView, antes de qualquer hidratação", async () => {
    await chegar(PAINEL);

    // É o caso de quem sai antes de o React hidratar, e antes de o painel
    // responder: até 16/09 essa pessoa não existia para o Meta.
    expect(contar()).toEqual(NO_PARSE);
    expect(marca()).toEqual({ ga4: "G-KBL1MFN9E3", gtm: "GTM-TB665RN9", meta: PIXEL });

    // Nesta ordem, e sem parâmetro nenhum: o `init` do tracker nunca mandou
    // correspondência avançada, e o do script servido é o equivalente dele.
    expect(fbq.mock.calls).toEqual([
      ["init", PIXEL],
      ["track", "PageView"],
    ]);
    // As duas chamadas chegaram ao stub, que é o que a biblioteca processa.
    const fila = (janelaDoJsdom()._fbq as { queue?: ArrayLike<unknown>[] } | undefined)?.queue ?? [];
    expect([...fila].map((item) => Array.from(item))).toEqual([
      ["init", PIXEL],
      ["track", "PageView"],
    ]);
    expect((document.querySelector(`script[src="${BIBLIOTECA}"]`) as HTMLScriptElement).async).toBe(true);
  });

  it("o painel responde com o mesmo pixel, como em produção: o tracker pula, e nada repete", async () => {
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    expect(contar()).toEqual(NO_PARSE);
  });

  it("o /api/settings falha: o Meta conta a chegada mesmo assim", async () => {
    // Até 16/09 este cenário dava zero no Meta (`page-view-uma-vez`, 1d).
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    expect(contar()).toEqual(NO_PARSE);
  });

  it("o primeiro render já traz o pixel: o tracker pula do mesmo jeito", async () => {
    await chegar(PAINEL);
    await hidratar({ ...REPOSITORIO, metaPixelId: PIXEL });
    await painelResponde(PAINEL);
    expect(contar()).toEqual(NO_PARSE);
  });

  it("no StrictMode do `next dev` o efeito roda duas vezes, e o pixel continua subindo uma", async () => {
    await chegar(PAINEL);
    await hidratar(PAINEL, { estrito: true });
    expect(contar()).toEqual(NO_PARSE);
  });
});

describe("o HTML sem o pixel: o tracker o sobe como antes, uma vez", () => {
  it("configuração indisponível no servidor: nenhum script servido, e o pixel sobe quando o painel responde", async () => {
    await chegar({});
    expect(marca()).toBeUndefined();
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    expect(contar()).toEqual(PELO_TRACKER);
  });

  it("servidor sem pixel e painel com pixel: GA4 e GTM no parse, o pixel pelo tracker", async () => {
    await chegar({ ...PAINEL, metaPixelId: "" });
    expect(marca()).toEqual({ ga4: "G-KBL1MFN9E3", gtm: "GTM-TB665RN9", meta: null });
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    expect(contar()).toEqual(PELO_TRACKER);
  });
});

describe("a marca diz o que entrou, não o que foi mandado subir", () => {
  it("a injeção do fbevents.js lança no parse: nenhum stub órfão, a marca não promete, e o tracker sobe o pixel uma vez", async () => {
    await chegar(PAINEL, /fbevents\.js/);
    // Stub criado antes da injeção que lançou ficaria órfão: o snippet do
    // tracker encontraria `fbq` pronto, pularia a biblioteca, e o pixel não
    // subiria por ninguém.
    expect(janelaDoJsdom().fbq, "ficou um stub sem biblioteca").toBeUndefined();
    expect(marca()).toEqual({ ga4: "G-KBL1MFN9E3", gtm: "GTM-TB665RN9", meta: null });
    expect(contar(), "só o script servido").toEqual(NADA);

    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    expect(contar(), "com o tracker").toEqual(PELO_TRACKER);
  });

  it("um `fbq` que já existia e lança no `init`: a marca fica vazia", async () => {
    // Um `fbq` alheio e quebrado (extensão, script de terceiro). Marca gravada
    // antes do `init` prometeria um pixel que não inicializou.
    janelaDoJsdom().fbq = () => {
      throw new Error("fbq quebrado");
    };
    await chegar(PAINEL);
    expect(marca()?.meta).toBeNull();
    // E o script servido não insere uma segunda biblioteca por cima do `fbq`
    // que encontrou, como o snippet oficial.
    expect(contar().bibliotecas).toBe(0);
  });
});

/**
 * Pixel trocado no painel, e o HTML em cache (ISR) ainda com outro.
 *
 * A decisão do PR #46 para o GTM: fica o do HTML até a próxima carga. Aqui
 * pela razão equivalente: `fbq('track', ...)` vai para TODO pixel inicializado,
 * então um segundo `init` faria cada evento desta visita sair para os dois, e o
 * snippet do tracker ainda mandaria ao pixel do HTML um segundo `PageView` da
 * chegada. A divergência dura pouco: salvar o painel chama `revalidateTag`, e o
 * HTML é refeito na requisição seguinte.
 */
describe("pixel trocado no painel: fica o do HTML até a próxima carga, como o container do GTM", () => {
  const ANTIGO = "111111111111111";
  const NOVO = "222222222222222";
  const TERCEIRO = "333333333333333";

  for (const [caso, html, primeiroRender, api] of [
    ["HTML em cache com o pixel antigo e JSON sem pixel", ANTIGO, "", NOVO],
    ["HTML em cache com o pixel antigo e JSON com um terceiro", ANTIGO, TERCEIRO, NOVO],
    ["HTML já com o pixel novo e JSON atrasado com o antigo", NOVO, ANTIGO, NOVO],
  ] as const) {
    it(`${caso}: um pixel, o do HTML, e um PageView por página`, async () => {
      await chegar({ ...PAINEL, metaPixelId: html });
      await hidratar({ ...REPOSITORIO, metaPixelId: primeiroRender });
      await painelResponde({ ...PAINEL, metaPixelId: api });
      expect(contar()).toEqual({ bibliotecas: 1, snippetsDoTracker: 0, inits: { [html]: 1 }, pageViews: 1 });

      await navegar("/estoque");
      expect(contar().pageViews, "a navegação conta no pixel que está no ar").toBe(2);
      expect(contar().inits).toEqual({ [html]: 1 });
    });
  }
});

describe("navegação: um PageView por troca de caminho, sem regressão do #100", () => {
  it("A → B → A, com o painel já respondido: três páginas, três PageView", async () => {
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    await navegar("/estoque");
    await navegar("/");
    expect(contar()).toEqual({ ...NO_PARSE, pageViews: 3 });
  });

  it("navegação ANTES de o painel responder: a página de chegada e a seguinte, uma de cada", async () => {
    // O `metaPixelId` do tracker ainda é o do JSON, vazio, mas o pixel já está
    // no ar desde o parse. Até 16/09 este caso dava um PageView só, o do
    // snippet, já em /estoque: a home ficava sem.
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await navegar("/estoque");
    expect(contar().pageViews, "antes de o painel responder").toBe(2);
    await painelResponde(PAINEL);
    expect(contar()).toEqual({ ...NO_PARSE, pageViews: 2 });
  });

  it("só a query string ou o hash mudam: não é página nova", async () => {
    await chegar(PAINEL);
    await hidratar(PAINEL);
    await navegar("/estoque");
    await navegar("/estoque?marca=jeep");
    await navegar("/estoque?marca=jeep#fotos");
    expect(contar()).toEqual({ ...NO_PARSE, pageViews: 2 });
  });
});

describe("oposição: nada do Meta, nem no parse nem na hidratação", () => {
  it("quem se opôs antes de chegar, vindo de anúncio: nenhuma biblioteca, nenhum `fbq`, nenhuma chamada, nenhum cookie", async () => {
    window.history.replaceState(null, "", "/?fbclid=IwAR0teste");
    await oporSeAntesDeChegar();
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await painelResponde(PAINEL);
    await navegar("/estoque");

    expect(contar()).toEqual(NADA);
    expect(fbq.mock.calls, "o Meta recebeu alguma chamada").toEqual([]);
    expect(janelaDoJsdom().fbq, "`fbq` existe para quem se opôs").toBeUndefined();
    expect(janelaDoJsdom()._fbq).toBeUndefined();
    expect(marca(), "o script servido passou da oposição").toBeUndefined();
    expect(document.cookie).not.toMatch(/(^|; )_fb[cp]=/);
  });

  it("quem liga a oposição no meio da visita: a chegada já contou, e as navegações seguintes não saem", async () => {
    await chegar(PAINEL);
    await hidratar(PAINEL);
    await oposicao(true);
    await navegar("/estoque");
    await navegar("/");
    expect(contar()).toEqual(NO_PARSE);
  });

  it("quem retira a oposição na mesma aba: o tracker sobe o pixel uma vez, e a navegação seguinte conta", async () => {
    await oporSeAntesDeChegar();
    await chegar(PAINEL);
    await hidratar(PAINEL);
    expect(contar(), "ainda com a oposição").toEqual(NADA);

    await oposicao(false);
    expect(contar(), "oposição retirada").toEqual(PELO_TRACKER);

    await navegar("/estoque");
    await oposicao(true);
    await oposicao(false);
    expect(contar(), "navegou, desligou e religou").toEqual({ ...PELO_TRACKER, pageViews: 2 });
  });
});

describe("o par com o CAPI continua de pé", () => {
  it("ficha aberta na chegada, antes de o painel responder: o ViewContent do navegador sai com o eventID que a ficha manda ao /api/capi", async () => {
    // `PDPClientWrapper` chama `trackVehicleView` na montagem e posta o id que
    // ela devolve em `/api/capi`. Até 16/09 o `fbq` ainda não existia nesse
    // momento, e só a metade do servidor saía.
    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    const eventId = trackVehicleView({ id: "7977579", marca: "Jeep", modelo: "Renegade", preco: 99900 });

    expect(eventId).toMatch(/^ViewContent\./);
    const visualizacoes = fbq.mock.calls.filter(([acao, evento]) => acao === "track" && evento === "ViewContent");
    expect(visualizacoes).toHaveLength(1);
    expect(visualizacoes[0][3]).toEqual({ eventID: eventId });
  });

  it("o PageView não tem espelho no CAPI, e por isso sai sem eventID", async () => {
    // Se um dia o PageView ganhar espelho, o do script servido precisa levar o
    // MESMO eventID do espelho, senão o Meta conta dois. Esta trava cai junto.
    const rota = lerCodigo("src/app/api/capi/route.ts");
    const inicio = rota.indexOf("const ALLOWED_EVENTS");
    expect(inicio, "a lista de eventos da rota sumiu").toBeGreaterThan(-1);
    const lista = rota.slice(inicio, rota.indexOf("];", inicio));
    expect(lista).toContain('"ViewContent"');
    expect(lista, "o PageView ganhou espelho no CAPI").not.toContain("PageView");

    await chegar(PAINEL);
    await hidratar(REPOSITORIO);
    await navegar("/estoque");
    const pageViews = fbq.mock.calls.filter(([acao, evento]) => acao === "track" && evento === "PageView");
    expect(pageViews).toEqual([
      ["track", "PageView"],
      ["track", "PageView"],
    ]);
  });
});
