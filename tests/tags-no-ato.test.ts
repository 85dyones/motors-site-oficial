// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { lerCodigo } from "./fonte";
import configuracaoDoRepositorio from "../src/lib/companySettings.json";
import {
  cargaDaCamadaGlobal,
  fonteDoTipoDePagina,
  sanitizeGa4Id,
  sanitizeGtmId,
  sanitizeMetaPixelId,
  tipoDaPagina,
} from "../src/lib/dataLayer";

/**
 * GA4 e GTM no HTML servido — e a régua que os dois lados têm de compartilhar.
 *
 * ---------------------------------------------------------------------------
 * O defeito que originou este arquivo
 * ---------------------------------------------------------------------------
 * Medido na home em produção em 2026-09-02, sem interação nenhuma: `load` aos
 * 2.979 ms, GA4 aos 3.069 ms, GTM aos 3.071 ms, Pixel aos 3.732 ms. Todas as
 * tags viviam no `useEffect` do `IntegrationsTracker`, que só roda depois da
 * hidratação — **quem saía antes dos três segundos não era medido por ninguém**.
 *
 * Não era o aceite de cookies que segurava: esse portão caiu em 31/08. Era o
 * React. A correção sobe GA4 e GTM para o `<head>` servido.
 *
 * O risco que a correção cria, e que estes testes existem para travar:
 *   1. a régua de `page_type` passa a ter DUAS leituras (TS e o script inline);
 *   2. o container pode entrar DUAS vezes, e evento em dobro envenena lance;
 *   3. o container pode NÃO entrar, se o tracker pular por um marcador que
 *      promete o que o script não injetou.
 *
 * O arquivo roda em `jsdom` por causa da última suíte, que monta o
 * `IntegrationsTracker` de verdade no mesmo DOM em que o script servido rodou.
 *
 * O Meta Pixel entrou no script servido em 2026-09-16. Aqui ficam as travas de
 * fonte e de marca que ele divide com GA4 e GTM; a contagem de `init` e
 * `PageView` com o tracker montado mora em `tests/meta-no-ato.test.ts`, que
 * junta as duas janelas do jsdom numa só para o `fbq` ser um.
 */

/**
 * O que cada lado enxerga, trocado por teste.
 *
 * `servidor` é o `companySettings` com que o HTML foi renderizado — o que o
 * `BootstrapDeTags` interpola. `cliente` é o que o `ThemeContext` entrega ao
 * tracker. Os dois divergem de verdade: o HTML pode estar em cache (ISR), e o
 * `ThemeContext` começa com o `companySettings.json` do repositório e só depois
 * recebe o `/api/settings`.
 */
const cenario = vi.hoisted(() => ({
  servidor: {} as Record<string, unknown>,
  cliente: {} as Record<string, unknown>,
}));

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: cenario.servidor }),
}));
vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ companySettings: cenario.cliente }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

/** A configuração de produção, lida do `/api/settings` público em 16/09/2026. */
const PRODUCAO = {
  ga4Id: "G-KBL1MFN9E3",
  gtmId: "GTM-TB665RN9",
  gtmAssumeEventos: true,
};

/** Sem esta linha o `act` não espera os efeitos. Ver `painel-de-guias-fiacao`. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A oposição do visitante, escrita UMA vez neste arquivo.
 *
 * `src/` não exporta constante para ela: a chave vive como literal em
 * `rastreamentoRecusado` (`lib/telemetry.ts`), no `ControleDeRastreamento` e
 * dentro do script do `BootstrapDeTags`. O teste não cria uma quarta cópia
 * solta: declara aqui, usa em todo lugar, e a suíte "a oposição do visitante
 * continua valendo" amarra estes dois valores à régua de `telemetry.ts`.
 */
const CHAVE_DA_OPOSICAO = "ag_cookie_consent";
const VALOR_DA_OPOSICAO = "rejected";

/**
 * Fonte lida SEM comentários, pelo `lerCodigo` de `tests/fonte.ts`.
 *
 * A primeira versão lia com `readFileSync`, e duas asserções de ordem deste
 * arquivo passavam lendo a NOTA, não o código: a primeira ocorrência da chave
 * da oposição no bootstrap está no docblock, antes de qualquer `gtag/js`, e o primeiro
 * `<BootstrapDeTags />` do layout está no comentário acima do `<head>`. Mover a
 * checagem de oposição para depois das tags, ou o bootstrap para dentro do
 * `<body>`, deixava as duas verdes.
 */
const bootstrap = lerCodigo("src/components/BootstrapDeTags.tsx");
const tracker = lerCodigo("src/components/IntegrationsTracker.tsx");
const camada = lerCodigo("src/components/CamadaDeDados.tsx");
const layout = lerCodigo("src/app/layout.tsx");

/** Compila a fonte gerada no mesmo formato em que o navegador a receberia. */
const tipoNoNavegador: (caminho: string) => string = new Function(
  `return (${fonteDoTipoDePagina()});`,
)();

describe("a régua de page_type tem uma fonte só, lida de dois lugares", () => {
  /**
   * A tabela cobre TODOS os ramos de `tipoDaPagina`, e é ela que dá valor ao
   * teste: acrescentar um tipo de página sem acrescentar um caminho aqui faz o
   * par passar por vacuidade. Quem criar rota nova acrescenta a linha.
   */
  const caminhos = [
    "/",
    "",
    "/?utm_source=google",
    "/estoque",
    "/estoque/",
    "/estoque/suv",
    "/estoque/sedan",
    "/estoque/ate-60-mil",
    "/estoque/60-a-100-mil",
    "/estoque/acima-100-mil",
    "/estoque/familia",
    "/destaques/baixa-quilometragem",
    "/avaliacao",
    "/financiamento",
    "/carro-perfeito",
    "/contato",
    "/sobre",
    "/privacidade",
    "/garantia",
    "/seminovos-bacacheri",
    "/seminovos-curitiba",
    "/carros/jeep",
    "/carros/jeep/renegade",
    "/carros/jeep/renegade/s-t270/jeep-renegade-s-t270-7977579",
    "/motos/honda",
    "/motos/honda/adv-150",
    "/admin",
    "/admin/estoque/8213942",
    "/vitrine",
    "/garagem",
    "/investidor",
    "/login",
    "/configuracoes",
    "/definir-senha",
    "/recuperar-senha",
    "/test",
    "/rota-que-nao-existe",
    "/carros",
  ];

  it("as duas leituras concordam em todos os caminhos", () => {
    for (const caminho of caminhos) {
      expect(tipoNoNavegador(caminho), `divergiram em "${caminho}"`).toBe(
        tipoDaPagina(caminho),
      );
    }
  });

  it("a tabela acima exercita todos os tipos que a régua sabe produzir", () => {
    // Sem isto, um tipo novo poderia nascer sem nenhum caminho que o alcance, e
    // o teste de cima passaria sem provar nada sobre ele.
    const produzidos = new Set(caminhos.map((c) => tipoDaPagina(c)));
    for (const esperado of [
      "home",
      "inventory",
      "bodytype",
      "pricerange",
      "highlight",
      "appraisal",
      "financing",
      "advisor",
      "contact",
      "institutional",
      "geo",
      "brand",
      "model",
      "vehicle_detail",
      "internal",
      "other",
    ]) {
      expect(produzidos, `nenhum caminho da tabela produz "${esperado}"`).toContain(esperado);
    }
  });

  it("o script inline não repete a lista de rotas — ele a serializa", () => {
    // A prova de que é UMA fonte: os segmentos aparecem no JSON embutido, não
    // como literais escritos à mão dentro do corpo da função.
    const fonte = fonteDoTipoDePagina();
    expect(fonte).toContain('"internos"');
    expect(fonte).toContain('"diretos"');
    expect(fonte).toContain('"pdp"');
    expect(fonte).toContain('"faixas"');
    expect(fonte).toContain("D.internos.indexOf");
    expect(fonte).toContain("D.faixas.indexOf");
  });
});

describe("a carga do page_context é montada num lugar só", () => {
  it("o bootstrap usa `cargaDaCamadaGlobal`, não um objeto próprio", () => {
    // Os `null` dessa carga zeram o que ficou da página anterior. Um segundo
    // lugar montando "quase" a mesma coisa reabriria o buraco do `lead_type`,
    // que fez o MESMO clique valer R$ 100 ou R$ 500 conforme o histórico.
    expect(bootstrap).toContain("cargaDaCamadaGlobal");
    expect(bootstrap).not.toMatch(/event:\s*["']page_context["']/);
  });

  it("a carga continua zerando os campos herdáveis", () => {
    const carga = cargaDaCamadaGlobal({ page_type: "home" });
    for (const campo of [
      "stock_count",
      "vehicle",
      "vehicle_id",
      "vehicle_name",
      "vehicle_price",
      "lead_type",
    ]) {
      expect(carga[campo], `${campo} deixou de ser zerado`).toBeNull();
    }
    expect(carga.event).toBe("page_context");
    expect(carga.page_type).toBe("home");
  });
});

describe("nada carrega duas vezes", () => {
  it("o tracker pula GA4 e GTM quando o bootstrap já os subiu", () => {
    expect(tracker).toContain("__mtTagsNoAto");
    // GA4 compara o id: id trocado no painel sem recarregar ainda precisa de
    // `config` novo saindo do tracker.
    expect(tracker).toMatch(/noAto\?\.ga4 === ga4Id/);
    // GTM NÃO compara: container é um por página, com o id que vier. Comparar
    // subia um segundo container a cada divergência de id. Os cenários estão
    // executados na última suíte deste arquivo.
    expect(tracker).not.toMatch(/noAto\?\.gtm === gtmId/);
    // O pixel segue o GTM: `fbq('track')` vai para todo pixel inicializado, e
    // um segundo `init` mandaria cada evento para os dois. Com a marca, qualquer
    // id, o tracker marca como inicializado e não repete o `PageView` da
    // chegada. Os cenários estão executados em `meta-no-ato.test.ts`.
    expect(tracker).toMatch(/if \(noAto\?\.meta\) \{/);
    expect(tracker).not.toMatch(/noAto\?\.meta === metaPixelId/);
  });

  it("o bootstrap marca cada tag só DEPOIS de injetá-la", () => {
    expect(bootstrap).toContain("__mtTagsNoAto");
    expect(bootstrap).toContain("__mtTipoJaPublicado");
    // Marcador gravado antes da injeção, ou no fim do script sem saber se ela
    // deu certo, faz o tracker pular uma tag que não entrou.
    expect(bootstrap.indexOf("m.ga4=")).toBeGreaterThan(bootstrap.indexOf("d.head.appendChild(g)"));
    expect(bootstrap.indexOf("m.gtm=")).toBeGreaterThan(bootstrap.indexOf("d.head.appendChild(j)"));
    // No pixel, a marca vem depois do `init` e do `PageView`, que é quando ele
    // de fato entrou.
    const iMarcaDoPixel = bootstrap.indexOf("m.meta=");
    expect(iMarcaDoPixel, "o bootstrap não marca o pixel").toBeGreaterThan(-1);
    expect(iMarcaDoPixel).toBeGreaterThan(bootstrap.indexOf("d.head.appendChild(t)"));
    expect(iMarcaDoPixel).toBeGreaterThan(bootstrap.indexOf("w.fbq('init'"));
    expect(iMarcaDoPixel).toBeGreaterThan(bootstrap.indexOf("w.fbq('track','PageView')"));
    // E o stub nasce depois do `appendChild`: stub criado antes de uma injeção
    // que lança fica órfão, e o snippet do tracker desiste quando acha `fbq`.
    expect(bootstrap.indexOf("w.fbq=n")).toBeGreaterThan(bootstrap.indexOf("d.head.appendChild(t)"));
  });

  it("a camada de dados não repete o page_context da primeira página", () => {
    expect(camada).toContain("__mtTipoJaPublicado");
  });
});

describe("o que é interpolado dentro de <script> passa por sanitizador", () => {
  it("o id do GTM só sobrevive no formato do GTM", () => {
    expect(sanitizeGtmId("GTM-TB665RN9")).toBe("GTM-TB665RN9");
    expect(sanitizeGtmId("gtm-tb665rn9")).toBe("GTM-TB665RN9");
    // O painel aceita o snippet inteiro colado; só o id atravessa.
    expect(sanitizeGtmId("<script>...GTM-TB665RN9...</script>")).toBe("GTM-TB665RN9");
    expect(sanitizeGtmId("';alert(1);//")).toBe("");
    expect(sanitizeGtmId("")).toBe("");
  });

  it("o id do GA4 idem — e este ia CRU para dentro do script até 02/09", () => {
    expect(sanitizeGa4Id("G-KBL1MFN9E3")).toBe("G-KBL1MFN9E3");
    expect(sanitizeGa4Id(" g-kbl1mfn9e3 ")).toBe("G-KBL1MFN9E3");
    expect(sanitizeGa4Id("AW-18360613832")).toBe("AW-18360613832");
    expect(sanitizeGa4Id("G-ABC';fetch('//x')//")).toBe("");
    expect(sanitizeGa4Id("UA-12345-1")).toBe("");
    expect(sanitizeGa4Id("")).toBe("");
  });

  it("o id do Meta Pixel idem — ia CRU para o script do tracker até 16/09", () => {
    expect(sanitizeMetaPixelId("1410450786690090")).toBe("1410450786690090");
    expect(sanitizeMetaPixelId(" 1410450786690090 ")).toBe("1410450786690090");
    expect(sanitizeMetaPixelId("1410450786690090');fetch('//x');//")).toBe("");
    expect(sanitizeMetaPixelId("<script>fbq('init', '1410450786690090')</script>")).toBe("");
    expect(sanitizeMetaPixelId("141045078669009O")).toBe("");
    expect(sanitizeMetaPixelId("")).toBe("");
  });

  it("os sanitizadores vivem na lib, não duplicados no componente", () => {
    expect(tracker).toMatch(/import\s*\{[^}]*sanitizeGtmId[^}]*\}\s*from\s*"\.\.\/lib\/dataLayer"/);
    expect(tracker).not.toMatch(/function sanitizeGtmId/);
    expect(bootstrap).toMatch(/sanitizeGa4Id/);
    expect(bootstrap).toMatch(/sanitizeGtmId/);
    // O pixel passa pelo mesmo sanitizador nos dois lados: é a mesma fronteira,
    // e o tracker compara o id que leu com o da marca.
    expect(tracker).toMatch(/import\s*\{[^}]*sanitizeMetaPixelId[^}]*\}\s*from\s*"\.\.\/lib\/dataLayer"/);
    expect(tracker).toContain("sanitizeMetaPixelId(companySettings?.metaPixelId");
    expect(bootstrap).toContain("sanitizeMetaPixelId(companySettings?.metaPixelId");
  });
});

/**
 * O script que o servidor manda, EXECUTADO.
 *
 * As asserções de texto acima provam que a linha existe; esta suíte prova que
 * ela faz o que promete. Renderiza o Server Component de verdade, pega o
 * `__html` que iria para o HTML, e roda contra um DOM de mentira — que é o mais
 * perto do navegador que dá para chegar sem navegador.
 *
 * O `preview_start` deste projeto lê o `launch.json` do diretório primário, e
 * este worktree não é ele; sem isto, o comportamento ficaria sem prova.
 */
describe("o script servido, executado contra um DOM de mentira", () => {
  beforeEach(() => {
    cenario.servidor = { ...PRODUCAO };
  });

  /** Roda o script e devolve o que ele fez. `recusou` simula a oposição. */
  async function executar({ recusou = false, caminho = "/carros/jeep/renegade" } = {}) {
    const { default: BootstrapDeTags } = await import("../src/components/BootstrapDeTags");
    const elemento = (await BootstrapDeTags()) as {
      props: { dangerouslySetInnerHTML: { __html: string } };
    } | null;
    if (!elemento) throw new Error("o componente não renderizou nada");

    const criados: { src: string; async: boolean }[] = [];
    const janela: Record<string, unknown> = {
      dataLayer: [] as unknown[],
      location: { pathname: caminho, search: "" },
    };
    const doc = {
      createElement: () => {
        const s = { src: "", async: false };
        return s;
      },
      head: {
        appendChild: (s: { src: string; async: boolean }) => criados.push(s),
      },
    };
    const armazenamento = {
      getItem: (k: string) => (recusou && k === CHAVE_DA_OPOSICAO ? VALOR_DA_OPOSICAO : null),
    };

    // `new Function` em vez de `eval`: o escopo fica explícito, e é o mesmo
    // conjunto de globais que o script encontra no navegador.
    new Function("window", "document", "localStorage", elemento.props.dangerouslySetInnerHTML.__html)(
      janela,
      doc,
      armazenamento,
    );

    return { janela, criados, fonte: elemento.props.dangerouslySetInnerHTML.__html };
  }

  it("publica o page_context ANTES de carregar qualquer tag", async () => {
    const { janela, fonte } = await executar();
    const fila = janela.dataLayer as Record<string, unknown>[];

    // O primeiro push é o contexto. É o contrato que `CamadaDeDados` descreve:
    // o container lê `page_type` ao inicializar, então ele não pode chegar
    // depois. Subir o GTM para o parse sem isto inverteria a ordem em toda
    // primeira visita — defeito que só apareceria como relatório errado.
    expect(fila[0].event).toBe("page_context");
    expect(fila[0].page_type).toBe("model");
    expect(fila[0].lead_type).toBeNull();

    // E o `gtm.start` vem DEPOIS, no array.
    const iContexto = fila.findIndex((e) => e.event === "page_context");
    const iGtm = fila.findIndex((e) => e.event === "gtm.js");
    expect(iGtm).toBeGreaterThan(iContexto);

    // A ordem no CÓDIGO também, não só no array em memória.
    expect(fonte.indexOf("dataLayer.push(carga)")).toBeLessThan(fonte.indexOf("gtm.js?id="));
  });

  it("carrega GA4 e GTM — os dois, com os ids do painel", async () => {
    const { criados, janela } = await executar();
    const srcs = criados.map((s) => s.src);

    expect(srcs.some((s) => s.includes("gtag/js?id=G-KBL1MFN9E3"))).toBe(true);
    expect(srcs.some((s) => s.includes("gtm.js?id=GTM-TB665RN9"))).toBe(true);
    // `async` nos dois: o script está no `<head>` e não pode bloquear o parse.
    expect(criados.every((s) => s.async)).toBe(true);

    // E deixa dito o que subiu, para o tracker não repetir. Sem pixel no
    // painel, a marca do pixel fica vazia, e o tracker segue como antes.
    expect(janela.__mtTagsNoAto).toEqual({ ga4: "G-KBL1MFN9E3", gtm: "GTM-TB665RN9", meta: null });
    expect(janela.__mtTipoJaPublicado).toBe("/carros/jeep/renegade");
  });

  it("com o pixel no painel, carrega o fbevents.js, inicializa e conta a chegada — e marca", async () => {
    cenario.servidor = { ...PRODUCAO, metaPixelId: "1410450786690090" };
    const { criados, janela } = await executar();

    const biblioteca = criados.filter((s) => s.src === "https://connect.facebook.net/en_US/fbevents.js");
    expect(biblioteca).toHaveLength(1);
    expect(biblioteca[0].async).toBe(true);

    const fila = (janela._fbq as { queue: ArrayLike<unknown>[] }).queue;
    expect([...fila].map((item) => Array.from(item))).toEqual([
      ["init", "1410450786690090"],
      ["track", "PageView"],
    ]);
    expect(janela.fbq).toBe(janela._fbq);
    expect(janela.__mtTagsNoAto).toEqual({
      ga4: "G-KBL1MFN9E3",
      gtm: "GTM-TB665RN9",
      meta: "1410450786690090",
    });
  });

  it("id do pixel sujo no painel não entra no HTML", async () => {
    cenario.servidor = { ...PRODUCAO, metaPixelId: "1410450786690090');fetch('//x');//" };
    const { criados, janela, fonte } = await executar();
    expect(fonte).not.toContain("fetch(");
    expect(fonte).not.toContain("fbevents.js");
    expect(criados.some((s) => s.src.includes("fbevents.js"))).toBe(false);
    expect(janela.fbq).toBeUndefined();
  });

  it("o tipo da página sai do caminho REAL, não de um padrão", async () => {
    for (const [caminho, esperado] of [
      ["/", "home"],
      ["/estoque", "inventory"],
      ["/estoque/ate-60-mil", "pricerange"],
      ["/estoque/suv", "bodytype"],
      ["/seminovos-bacacheri", "geo"],
      ["/admin/estoque", "internal"],
    ] as const) {
      const { janela } = await executar({ caminho });
      const fila = janela.dataLayer as Record<string, unknown>[];
      expect(fila[0].page_type, caminho).toBe(esperado);
    }
  });

  it("quem recusou o rastreamento não carrega NADA — nem o page_context", async () => {
    const { criados, janela } = await executar({ recusou: true });
    expect(criados).toHaveLength(0);
    expect(janela.dataLayer).toHaveLength(0);
    expect(janela.__mtTagsNoAto).toBeUndefined();
  });

  it("quem recusou também não ganha o pixel: nem biblioteca, nem `fbq`", async () => {
    // O `_fbp` nasce do `fbevents.js`, e a requisição a `facebook.com/tr` sai
    // dele: sem a biblioteca inserida e sem `fbq`, não há quem os crie.
    cenario.servidor = { ...PRODUCAO, metaPixelId: "1410450786690090" };
    const { criados, janela } = await executar({ recusou: true });
    expect(criados).toHaveLength(0);
    expect(janela.fbq).toBeUndefined();
    expect(janela._fbq).toBeUndefined();
    expect(janela.__mtTagsNoAto).toBeUndefined();
  });

  it("localStorage indisponível não é recusa — a medição continua", async () => {
    // Navegador com armazenamento bloqueado lança no `getItem`. Tratar isso
    // como recusa desligaria a medição de quem nunca escolheu nada, e é a mesma
    // régua de `rastreamentoRecusado`, que devolve `false` no catch.
    const { default: BootstrapDeTags } = await import("../src/components/BootstrapDeTags");
    const elemento = (await BootstrapDeTags()) as {
      props: { dangerouslySetInnerHTML: { __html: string } };
    };
    const criados: unknown[] = [];
    const janela: Record<string, unknown> = {
      dataLayer: [] as unknown[],
      location: { pathname: "/", search: "" },
    };
    new Function("window", "document", "localStorage", elemento.props.dangerouslySetInnerHTML.__html)(
      janela,
      {
        createElement: () => ({ src: "", async: false }),
        head: { appendChild: (s: unknown) => criados.push(s) },
      },
      {
        getItem: () => {
          throw new Error("storage bloqueado");
        },
      },
    );
    expect(criados.length).toBeGreaterThan(0);
    expect((janela.dataLayer as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("a oposição do visitante continua valendo", () => {
  it("a chave e o valor deste arquivo são os da régua de `telemetry.ts`", () => {
    // Sem esta amarra, as constantes do topo poderiam divergir do site e o
    // resto da suíte seguiria verde, testando uma oposição que não existe.
    //
    // Lê o corpo de `rastreamentoRecusado`, e não o arquivo inteiro: a mesma
    // comparação aparece também em `persistirParametrosDeCampanha`, e uma
    // régua trocada só na função continuava verde com a leitura do arquivo.
    const telemetria = lerCodigo("src/lib/telemetry.ts");
    const inicio = telemetria.indexOf("export function rastreamentoRecusado");
    expect(inicio, "`rastreamentoRecusado` sumiu de telemetry.ts").toBeGreaterThan(-1);
    const regua = telemetria.slice(inicio, telemetria.indexOf("\n}", inicio));
    expect(regua).toContain(
      `localStorage.getItem("${CHAVE_DA_OPOSICAO}") === "${VALOR_DA_OPOSICAO}"`,
    );
  });

  it("o bootstrap desiste quando o rastreamento foi recusado", () => {
    // Mesma chave de `rastreamentoRecusado` em `lib/telemetry`. É a ÚNICA
    // barreira desde 31/08 — não há portão de aceite —, então ela não pode
    // ficar para trás quando as tags sobem para o parse.
    expect(bootstrap).toContain(
      `localStorage.getItem('${CHAVE_DA_OPOSICAO}')==='${VALOR_DA_OPOSICAO}')return;`,
    );
    const i = bootstrap.indexOf(CHAVE_DA_OPOSICAO);
    expect(i, "a checagem de oposição tem de vir ANTES de carregar o GA4").toBeLessThan(
      bootstrap.indexOf("gtag/js"),
    );
    expect(i, "a checagem de oposição tem de vir ANTES de carregar o GTM").toBeLessThan(
      bootstrap.indexOf("gtm.js?id="),
    );
    const iPixel = bootstrap.indexOf("fbevents.js");
    expect(iPixel, "o bootstrap não carrega o pixel").toBeGreaterThan(-1);
    expect(i, "a checagem de oposição tem de vir ANTES de carregar o pixel").toBeLessThan(iPixel);
    expect(i, "a checagem de oposição tem de vir ANTES do stub do pixel").toBeLessThan(
      bootstrap.indexOf("w.fbq=n"),
    );
  });

  it("o bootstrap entra no <head>, antes do corpo", () => {
    const iHead = layout.indexOf("<BootstrapDeTags />");
    const iBody = layout.indexOf("<body");
    expect(iHead).toBeGreaterThan(-1);
    expect(iHead).toBeLessThan(iBody);
  });
});

/**
 * O script servido e o `IntegrationsTracker` JUNTOS, contando o que entra.
 *
 * ---------------------------------------------------------------------------
 * O defeito que a revisão do PR #46 apontou mora na costura
 * ---------------------------------------------------------------------------
 * Cada lado, sozinho, estava provado. Mas o tracker decidia se subia o GTM
 * olhando só o marcador `__mtTagsNoAto`, e o script gravava o marcador no FIM,
 * com os ids da configuração, tivesse a injeção dado certo ou não. Injeção que
 * lança deixava o marcador prometendo um container que não existia; o tracker
 * pulava; o GTM não subia por ninguém. E, na outra ponta, o tracker comparava o
 * id do marcador com o da configuração que ELE via — que no primeiro render é
 * o `companySettings.json` do repositório — e subia um segundo container a
 * cada divergência.
 *
 * Aqui os dois rodam no mesmo DOM: o script servido executa como o parser o
 * executaria, o tracker de verdade monta com React, e a conta é feita no que
 * interessa — quantos `<script src>` do GTM e do gtag entraram, quantos
 * `gtm.js` e quantos `config` por id foram para a fila.
 *
 * ---------------------------------------------------------------------------
 * Dois detalhes do ambiente
 * ---------------------------------------------------------------------------
 *   - No vitest, `window` é o global do Node, e os scripts inline que o tracker
 *     injeta rodam no contexto do jsdom (`jsdom.window`). O DOM é um só, a fila
 *     não: o `beforeEach` põe o MESMO array nos dois, como no navegador.
 *   - O jsdom executa script inline e não baixa `src`. Nada sai para a rede.
 */
describe("no mesmo DOM: o script servido e o tracker, contando o que entra", () => {
  type Janela = Record<string, unknown>;
  const janela = window as unknown as Janela;
  const janelaDoJsdom = () =>
    (globalThis as unknown as { jsdom: { window: Janela } }).jsdom.window;

  let raiz: Root | null = null;

  beforeEach(() => {
    const fila: unknown[] = [];
    janela.dataLayer = fila;
    janelaDoJsdom().dataLayer = fila;
  });

  afterEach(async () => {
    const montada = raiz;
    raiz = null;
    if (montada) await act(async () => montada.unmount());
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    localStorage.clear();
    for (const alvo of [janela, janelaDoJsdom()]) {
      for (const chave of ["dataLayer", "gtag", "__mtTagsNoAto", "__mtTipoJaPublicado"]) {
        // `function gtag(){}` declarado no script inline do tracker vira global
        // NÃO configurável da janela do jsdom, e `delete` nele lança. A sobra é
        // inofensiva: ela lê `window.dataLayer` na hora da chamada, e o
        // `beforeEach` troca essa fila.
        if (Object.getOwnPropertyDescriptor(alvo, chave)?.configurable) delete alvo[chave];
      }
    }
  });

  /** O `__html` que o servidor mandaria. Vazio quando o componente não renderiza. */
  async function htmlDoServidor(servidor: Record<string, unknown>): Promise<string> {
    cenario.servidor = servidor;
    const { default: BootstrapDeTags } = await import("../src/components/BootstrapDeTags");
    const elemento = (await BootstrapDeTags()) as {
      props: { dangerouslySetInnerHTML: { __html: string } };
    } | null;
    return elemento?.props.dangerouslySetInnerHTML.__html ?? "";
  }

  /**
   * Executa o script servido neste DOM, como o parser faria.
   *
   * `recusar` faz a injeção lançar para a tag cujo `src` casar — o que um
   * `appendChild` recusado ou um `src` barrado por Trusted Types fariam.
   */
  function parse(html: string, recusar?: RegExp) {
    const cabeca = document.head as unknown as { appendChild?: (this: Node, no: Node) => Node };
    const anexar = Node.prototype.appendChild;
    if (recusar) {
      cabeca.appendChild = function (this: Node, no: Node) {
        if (recusar.test((no as HTMLScriptElement).src || "")) throw new Error("injeção recusada");
        return anexar.call(this, no);
      };
    }
    try {
      new Function(html)();
    } finally {
      delete cabeca.appendChild;
    }
  }

  /** Monta, ou re-renderiza, o tracker de verdade com o que o cliente vê. */
  async function hidratar(cliente: Record<string, unknown>) {
    cenario.cliente = cliente;
    const { default: IntegrationsTracker } = await import("../src/components/IntegrationsTracker");
    if (!raiz) {
      const hospedeiro = document.createElement("div");
      document.body.appendChild(hospedeiro);
      raiz = createRoot(hospedeiro);
    }
    const montada = raiz;
    await act(async () => {
      montada.render(createElement(IntegrationsTracker));
    });
  }

  /** O que o `ControleDeRastreamento` faz no clique. */
  async function oposicao(ligada: boolean) {
    await act(async () => {
      if (ligada) localStorage.setItem(CHAVE_DA_OPOSICAO, VALOR_DA_OPOSICAO);
      else localStorage.removeItem(CHAVE_DA_OPOSICAO);
      window.dispatchEvent(new Event("ag-cookie-consent-updated"));
    });
  }

  function contagem() {
    const srcs = [...document.querySelectorAll("script[src]")].map(
      (s) => (s as HTMLScriptElement).src,
    );
    const fila = (janela.dataLayer ?? []) as unknown[];
    const configs: Record<string, number> = {};
    for (const item of fila) {
      const comando = item as { 0?: unknown; 1?: unknown } | null;
      if (comando && comando[0] === "config") {
        const id = String(comando[1]);
        configs[id] = (configs[id] ?? 0) + 1;
      }
    }
    return {
      containers: srcs.filter((s) => s.includes("googletagmanager.com/gtm.js")).length,
      eventosGtmJs: fila.filter((e) => (e as { event?: unknown } | null)?.event === "gtm.js").length,
      bibliotecas: srcs.filter((s) => s.includes("googletagmanager.com/gtag/js")).length,
      configs,
    };
  }

  const TUDO_UMA_VEZ = {
    containers: 1,
    eventosGtmJs: 1,
    bibliotecas: 1,
    configs: { "G-KBL1MFN9E3": 1 },
  };
  const NADA = { containers: 0, eventosGtmJs: 0, bibliotecas: 0, configs: {} };
  const REPOSITORIO = configuracaoDoRepositorio as Record<string, unknown>;

  it("visita normal: o parse sobe GA4 e GTM, e a hidratação não repete nada", async () => {
    parse(await htmlDoServidor(PRODUCAO));
    expect(contagem(), "só o script servido").toEqual(TUDO_UMA_VEZ);

    // Primeiro render com o JSON do repositório; depois chega o `/api/settings`.
    await hidratar(REPOSITORIO);
    await hidratar(PRODUCAO);
    expect(contagem(), "com o tracker").toEqual(TUDO_UMA_VEZ);

    // Desligar e religar na mesma aba não sobe outro.
    await oposicao(true);
    await oposicao(false);
    expect(contagem(), "depois de desligar e religar").toEqual(TUDO_UMA_VEZ);
  });

  it("quem se opôs: nem o parse nem a hidratação sobem coisa alguma", async () => {
    localStorage.setItem(CHAVE_DA_OPOSICAO, VALOR_DA_OPOSICAO);
    parse(await htmlDoServidor(PRODUCAO));
    expect(contagem(), "só o script servido").toEqual(NADA);
    expect(janela.__mtTagsNoAto).toBeUndefined();

    await hidratar(REPOSITORIO);
    await hidratar(PRODUCAO);
    expect(contagem(), "com o tracker").toEqual(NADA);
  });

  it("quem retira a oposição na mesma aba recebe as tags pelo tracker, uma vez", async () => {
    localStorage.setItem(CHAVE_DA_OPOSICAO, VALOR_DA_OPOSICAO);
    parse(await htmlDoServidor(PRODUCAO));
    await hidratar(REPOSITORIO);
    await hidratar(PRODUCAO);
    expect(contagem(), "ainda com a oposição").toEqual(NADA);

    await oposicao(false);
    expect(contagem(), "oposição retirada").toEqual(TUDO_UMA_VEZ);

    await oposicao(true);
    await oposicao(false);
    expect(contagem(), "desligou e religou de novo").toEqual(TUDO_UMA_VEZ);
  });

  it("injeção do GTM lança no parse: o marcador não o promete, e o tracker o sobe", async () => {
    parse(await htmlDoServidor(PRODUCAO), /gtm\.js/);
    const soOScript = contagem();
    const marcador = janela.__mtTagsNoAto;

    await hidratar(REPOSITORIO);
    await hidratar(PRODUCAO);
    // A consequência primeiro: um container e UM `gtm.js`. Marcador que promete
    // o container deixa zero; `gtm.start` empurrado antes da injeção que lançou
    // fica órfão na fila e soma dois com o do tracker.
    expect(contagem(), "com o tracker").toEqual(TUDO_UMA_VEZ);
    expect(soOScript, "só o script servido").toEqual({ ...TUDO_UMA_VEZ, containers: 0, eventosGtmJs: 0 });
    expect(marcador).toEqual({ ga4: "G-KBL1MFN9E3", gtm: null, meta: null });
  });

  it("injeção do GA4 lança no parse: o tracker carrega a biblioteca e dá o config, uma vez", async () => {
    parse(await htmlDoServidor(PRODUCAO), /gtag\/js/);
    const soOScript = contagem();
    const marcador = janela.__mtTagsNoAto;

    await hidratar(REPOSITORIO);
    await hidratar(PRODUCAO);
    expect(contagem(), "com o tracker").toEqual(TUDO_UMA_VEZ);
    expect(soOScript, "só o script servido").toEqual({ ...TUDO_UMA_VEZ, bibliotecas: 0, configs: {} });
    expect(marcador).toEqual({ ga4: null, gtm: "GTM-TB665RN9", meta: null });
  });

  it("sem `gtmAssumeEventos` o GTM fica fora do parse e entra uma vez na hidratação", async () => {
    const semAssumir = { ...PRODUCAO, gtmAssumeEventos: false };
    parse(await htmlDoServidor(semAssumir));
    expect(contagem(), "só o script servido").toEqual({ ...TUDO_UMA_VEZ, containers: 0, eventosGtmJs: 0 });

    await hidratar(REPOSITORIO);
    await hidratar(semAssumir);
    expect(contagem(), "com o tracker").toEqual(TUDO_UMA_VEZ);
  });

  /**
   * Id do GTM trocado no painel, e o HTML em cache (ISR) ainda com outro.
   *
   * Fica o container do HTML até a próxima carga. Subir o novo por cima seria
   * dois containers lendo a mesma fila, e cada evento sairia duas vezes.
   */
  for (const [caso, html, primeiroRender, api] of [
    ["HTML em cache com o id antigo e JSON igual a ele", "GTM-VELHO01", "GTM-VELHO01", "GTM-NOVO02"],
    ["HTML em cache com o id antigo e JSON com um terceiro", "GTM-VELHO01", "GTM-TB665RN9", "GTM-NOVO02"],
    ["HTML já com o id novo e JSON do repositório atrasado", "GTM-NOVO02", "GTM-TB665RN9", "GTM-NOVO02"],
  ] as const) {
    it(`id do GTM trocado no painel (${caso}): um container, o do HTML`, async () => {
      parse(await htmlDoServidor({ ...PRODUCAO, gtmId: html }));
      await hidratar({ ...REPOSITORIO, gtmId: primeiroRender });
      await hidratar({ ...PRODUCAO, gtmId: api });

      const { containers, eventosGtmJs } = contagem();
      expect({ containers, eventosGtmJs }).toEqual({ containers: 1, eventosGtmJs: 1 });
      const container = document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
      expect((container as HTMLScriptElement).src).toContain(`id=${html}`);
    });
  }

  /**
   * O mesmo raciocínio no GA4, onde a regra é outra: `config` é por
   * propriedade, então o id novo recebe o seu. O que não pode é uma propriedade
   * receber dois, nem a biblioteca entrar de novo.
   */
  for (const [caso, html, api] of [
    ["HTML em cache com o id antigo", "G-VELHO01", "G-NOVO02"],
    ["HTML já com o id novo e JSON do repositório atrasado", "G-NOVO02", "G-NOVO02"],
  ] as const) {
    it(`id do GA4 trocado no painel (${caso}): nenhum config em dobro, uma biblioteca`, async () => {
      parse(await htmlDoServidor({ ...PRODUCAO, ga4Id: html }));
      await hidratar(REPOSITORIO);
      await hidratar({ ...PRODUCAO, ga4Id: api });

      const { bibliotecas, configs } = contagem();
      expect(bibliotecas, "a biblioteca do gtag entrou de novo").toBe(1);
      expect(configs[html], `config de ${html}`).toBe(1);
      expect(configs[api], `config de ${api}`).toBe(1);
      expect(Math.max(...Object.values(configs)), JSON.stringify(configs)).toBe(1);
    });
  }
});
