import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cargaDaCamadaGlobal,
  fonteDoTipoDePagina,
  sanitizeGa4Id,
  sanitizeGtmId,
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
 *   2. o container pode entrar DUAS vezes, e evento em dobro envenena lance.
 */

const RAIZ = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf-8");

const bootstrap = ler("src", "components", "BootstrapDeTags.tsx");
const tracker = ler("src", "components", "IntegrationsTracker.tsx");
const camada = ler("src", "components", "CamadaDeDados.tsx");
const layout = ler("src", "app", "layout.tsx");

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
    // Compara os IDS, não um booleano: id trocado no painel sem recarregar
    // ainda precisa de `config` novo saindo do tracker.
    expect(tracker).toMatch(/noAto\?\.ga4 === ga4Id/);
    expect(tracker).toMatch(/noAto\?\.gtm === gtmId/);
  });

  it("o bootstrap publica os ids que de fato subiu", () => {
    expect(bootstrap).toContain("__mtTagsNoAto");
    expect(bootstrap).toContain("__mtTipoJaPublicado");
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

  it("os dois sanitizadores vivem na lib, não duplicados no componente", () => {
    expect(tracker).toMatch(/import\s*\{[^}]*sanitizeGtmId[^}]*\}\s*from\s*"\.\.\/lib\/dataLayer"/);
    expect(tracker).not.toMatch(/function sanitizeGtmId/);
    expect(bootstrap).toMatch(/sanitizeGa4Id/);
    expect(bootstrap).toMatch(/sanitizeGtmId/);
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
  vi.mock("../src/lib/settings", () => ({
    getCachedSettings: async () => ({
      companySettings: {
        ga4Id: "G-KBL1MFN9E3",
        gtmId: "GTM-TB665RN9",
        gtmAssumeEventos: true,
      },
    }),
  }));

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
      getItem: (k: string) => (recusou && k === "ag_cookie_consent" ? "rejected" : null),
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

    // E deixa dito o que subiu, para o tracker não repetir.
    expect(janela.__mtTagsNoAto).toEqual({ ga4: "G-KBL1MFN9E3", gtm: "GTM-TB665RN9" });
    expect(janela.__mtTipoJaPublicado).toBe("/carros/jeep/renegade");
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
  it("o bootstrap desiste quando o rastreamento foi recusado", () => {
    // Mesma chave de `rastreamentoRecusado` em `lib/telemetry`. É a ÚNICA
    // barreira desde 31/08 — não há portão de aceite —, então ela não pode
    // ficar para trás quando as tags sobem para o parse.
    expect(bootstrap).toContain("ag_cookie_consent");
    expect(bootstrap).toContain("rejected");
    const i = bootstrap.indexOf("ag_cookie_consent");
    const j = bootstrap.indexOf("gtag/js");
    expect(i, "a checagem de oposição tem de vir ANTES de carregar o GA4").toBeLessThan(j);
  });

  it("o bootstrap entra no <head>, antes do corpo", () => {
    const iHead = layout.indexOf("<BootstrapDeTags />");
    const iBody = layout.indexOf("<body");
    expect(iHead).toBeGreaterThan(-1);
    expect(iHead).toBeLessThan(iBody);
  });
});
