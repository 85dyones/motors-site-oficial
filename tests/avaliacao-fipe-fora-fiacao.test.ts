// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A /avaliacao com a FIPE fora do ar — o que só a tela montada prova.
 *
 * O incidente, reproduzido em 24/09/2026: a API pública da FIPE respondeu 429
 * ("limite de taxa excedido") e a página INTEIRA caiu em "Esta página não
 * carregou" — `fipeBrands.map is not a function`, porque o componente guardava
 * o objeto de erro no lugar da lista de marcas. Quem queria vender o carro
 * ficava sem formulário por causa do teto de consultas de um terceiro.
 *
 * O que este arquivo trava:
 *   - com a FIPE respondendo 429 em todas as portas, a página não cai: o passo
 *     01 vira texto livre, e só avança com marca, modelo e um ano de verdade;
 *   - a porta da loja (`/api/fipe/…`) vem antes da API pública, e a pública é
 *     a reserva quando a da loja falha;
 *   - "tentar a FIPE de novo" volta para a cascata quando ela responde, sem
 *     deixar o texto digitado escondido em `step1`;
 *   - o envio no texto livre diz ao servidor que o carro foi digitado.
 *
 * Nada do formulário é dublê: o componente e as libs de verdade. Substituídos
 * só o `fetch`, o Turnstile (que fora do navegador não carrega o script da
 * Cloudflare) e o contexto de tema, que só empresta `companySettings`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ companySettings: {}, webhooks: {} }),
}));

// O desafio "resolve" assim que monta, como o Turnstile invisível faz.
vi.mock("../src/components/Turnstile", () => ({
  default: function TurnstileFalso({ onSuccess }: { onSuccess: (t: string) => void }) {
    useEffect(() => {
      onSuccess("token-de-teste");
    }, [onSuccess]);
    return null;
  },
}));

/**
 * O que a medição recebeu. O `trackAppraisalSubmit` de verdade vai para GA4,
 * Meta e CAPI; aqui ele só anota — o que se trava é O QUE a tela manda.
 */
const medicao = vi.hoisted(() => ({ avaliacao: [] as unknown[][] }));
vi.mock("../src/lib/telemetry", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/telemetry")>();
  return {
    ...real,
    trackAppraisalSubmit: (...args: unknown[]) => {
      medicao.avaliacao.push(args);
      return null;
    },
  };
});

const ERRO_429 = { error: "limite de taxa excedido. Por favor, visite https://fipe.api.br para obter um token" };

/** Uma resposta por URL; o que não está aqui é 429 — a FIPE estourada. */
let respostas: Record<string, unknown>;
let chamadas: { url: string; corpo?: unknown }[];
/**
 * URLs cuja resposta fica PENDURADA até o teste chamar `liberar` — a FIPE
 * lenta. Liberar com `null` é liberar como 429.
 */
let adiadas: Record<string, { liberar: (corpo: unknown | null) => void; promessa: Promise<unknown | null> }>;

function adiar(url: string) {
  let liberar!: (corpo: unknown | null) => void;
  const promessa = new Promise<unknown | null>((r) => (liberar = r));
  adiadas[url] = { liberar, promessa };
}

async function liberar(url: string, corpo: unknown | null) {
  await act(async () => {
    adiadas[url].liberar(corpo);
  });
  await assentar();
}

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const u = String(url);
    chamadas.push({ url: u, corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined });
    if (u === "/api/avaliacao") return { ok: true, status: 200, json: async () => ({ success: true }) };
    if (u in adiadas) {
      const corpo = await adiadas[u].promessa;
      if (corpo === null) return { ok: false, status: 429, json: async () => ERRO_429 };
      return { ok: true, status: 200, json: async () => corpo };
    }
    if (u in respostas) return { ok: true, status: 200, json: async () => respostas[u] };
    return { ok: false, status: 429, json: async () => ERRO_429 };
  }) as never;
}

const PUBLICA = "https://parallelum.com.br/fipe/api/v1";
const MARCAS = [{ codigo: "21", nome: "Fiat" }];

let container: HTMLDivElement;
let root: Root;

async function assentar() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

async function montar() {
  const { default: AutoAvaliacao } = await import("../src/components/AutoAvaliacao");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AutoAvaliacao));
  });
  await assentar();
}

const texto = () => container.textContent ?? "";
const porId = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`);

function botao(rotulo: string): HTMLButtonElement {
  const achado = [...container.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(rotulo),
  );
  expect(achado, `a tela precisa ter o botão "${rotulo}"`).toBeDefined();
  return achado as HTMLButtonElement;
}

function mudar(el: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function digitar(id: string, valor: string) {
  const el = porId<HTMLInputElement>(id);
  expect(el, `o campo #${id} precisa estar na tela`).not.toBeNull();
  await act(async () => {
    mudar(el!, valor);
  });
}

/**
 * Escolher numa das caixas da cascata: digitar abre a lista, e a opção é um
 * botão com o nome exato. É o caminho de quem usa — e o que chama `onClear`
 * quando já havia uma escolha.
 */
async function escolher(id: string, busca: string, opcao: string) {
  await digitar(id, busca);
  const achada = [...container.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === opcao);
  expect(achada, `a opção "${opcao}" precisa aparecer em #${id}`).toBeDefined();
  await act(async () => {
    achada!.click();
  });
  await assentar();
}

const coluna = () => (container.querySelector("aside")?.textContent ?? "").replace(/\u00a0/g, " ");

async function clicar(rotulo: string) {
  await act(async () => {
    botao(rotulo).click();
  });
  await assentar();
}

beforeEach(() => {
  medicao.avaliacao = [];
  respostas = {};
  adiadas = {};
  chamadas = [];
  dublarFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("FIPE estourada (429 nas duas portas)", () => {
  it("a página não cai: o passo 01 vira texto livre", async () => {
    await montar();

    expect(texto()).toContain("Avaliação Express");
    expect(texto()).toContain("A Tabela FIPE não respondeu agora");
    expect(porId("brand-search-fipe"), "a cascata não serve sem FIPE").toBeNull();
    expect(porId("marca-digitada")).not.toBeNull();
    expect(porId("modelo-digitado")).not.toBeNull();
    expect(porId("ano-digitado")).not.toBeNull();
  });

  it("só avança com marca, modelo e ano de verdade", async () => {
    await montar();
    const avancar = () => botao("AVANÇAR PARA ESTADO DO VEÍCULO");

    expect(avancar().disabled).toBe(true);
    await digitar("marca-digitada", "Fiat");
    await digitar("modelo-digitado", "Argo Drive 1.0");
    await digitar("ano-digitado", "20");
    expect(avancar().disabled, "ano com dois dígitos não é ano").toBe(true);
    await digitar("ano-digitado", "1899");
    expect(avancar().disabled, "ano antes de 1950 não é carro para avaliar").toBe(true);
    await digitar("ano-digitado", "2021");
    expect(avancar().disabled).toBe(false);
  });

  it("o envio diz ao servidor que o carro foi digitado, sem FIPE", async () => {
    await montar();
    await digitar("marca-digitada", "  Fiat ");
    await digitar("modelo-digitado", "Argo Drive 1.0");
    await digitar("ano-digitado", "2021");
    await clicar("AVANÇAR PARA ESTADO DO VEÍCULO");

    await clicar("Bom");
    await clicar("Pequenos Riscos");
    await digitar("km-input", "55000");
    await clicar("AVANÇAR PARA CONTATO");

    await digitar("nome-input", "Cliente de Teste");
    await digitar("whatsapp-input", "41999990000");
    await clicar("SOLICITAR PROPOSTA");

    const envio = chamadas.find((c) => c.url === "/api/avaliacao");
    expect(envio, "o formulário precisa chegar à rota").toBeDefined();
    expect(envio!.corpo).toMatchObject({
      marca: "Fiat",
      modelo: "Argo Drive 1.0",
      ano: 2021,
      fipe_valor: "",
      veiculo_digitado: true,
      quilometragem: 55000,
      estado_mecanico: "bom",
      estado_conservacao: "riscos",
    });

    // O que a pessoa digitou não vai para pixel de terceiro.
    expect(medicao.avaliacao).toHaveLength(1);
    expect(medicao.avaliacao[0].slice(0, 5)).toEqual(["carros", "(digitado)", "(digitado)", "2021", 0]);
    expect(JSON.stringify(medicao.avaliacao)).not.toMatch(/Fiat|Argo/);
  });
});

describe("a medição na cascata continua com o carro e a FIPE", () => {
  it("marca, modelo e o valor da FIPE chegam à conversão", async () => {
    respostas[`/api/fipe/carros/marcas`] = MARCAS;
    respostas[`/api/fipe/carros/marcas/21/modelos`] = { modelos: [{ codigo: 7, nome: "Argo Drive 1.0" }], anos: [] };
    respostas[`/api/fipe/carros/marcas/21/modelos/7/anos`] = [{ codigo: "2021-1", nome: "2021 Gasolina" }];
    respostas[`/api/fipe/carros/marcas/21/modelos/7/anos/2021-1`] = {
      Valor: "R$ 68.000,00",
      CodigoFipe: "001234-5",
      MesReferencia: "setembro de 2026",
    };
    await montar();
    await escolher("brand-search-fipe", "Fia", "Fiat");
    await escolher("model-search-fipe", "Argo", "Argo Drive 1.0");
    await escolher("year-search-fipe", "2021", "2021 Gasolina");
    await clicar("AVANÇAR PARA ESTADO DO VEÍCULO");
    await clicar("Bom");
    await clicar("Pequenos Riscos");
    await digitar("km-input", "55000");
    await clicar("AVANÇAR PARA CONTATO");
    await digitar("nome-input", "Cliente de Teste");
    await digitar("whatsapp-input", "41999990000");
    await clicar("SOLICITAR PROPOSTA");

    expect(chamadas.find((c) => c.url === "/api/avaliacao")!.corpo).toMatchObject({
      fipe_valor: "R$ 68.000,00",
      veiculo_digitado: false,
    });
    expect(medicao.avaliacao[0].slice(0, 5)).toEqual(["carros", "Fiat", "Argo Drive 1.0", "2021", 68000]);
  });
});

describe("as portas da FIPE", () => {
  it("a da loja vem primeiro, e servindo, a pública nem é chamada", async () => {
    respostas[`/api/fipe/carros/marcas`] = MARCAS;
    await montar();

    expect(porId("brand-search-fipe")).not.toBeNull();
    expect(porId("marca-digitada")).toBeNull();
    const fipe = chamadas.filter((c) => c.url.includes("marcas"));
    expect(fipe.map((c) => c.url)).toEqual(["/api/fipe/carros/marcas"]);
  });

  it("a da loja falhando, a pública é a reserva", async () => {
    respostas[`${PUBLICA}/carros/marcas`] = MARCAS;
    await montar();

    expect(porId("brand-search-fipe")).not.toBeNull();
    expect(chamadas.map((c) => c.url)).toEqual(
      expect.arrayContaining(["/api/fipe/carros/marcas", `${PUBLICA}/carros/marcas`]),
    );
  });

  it("formato inesperado com 200 não vira lista: é FIPE fora", async () => {
    respostas[`/api/fipe/carros/marcas`] = ERRO_429;
    respostas[`${PUBLICA}/carros/marcas`] = ERRO_429;
    await montar();

    expect(porId("marca-digitada")).not.toBeNull();
  });
});

describe("tentar a FIPE de novo", () => {
  it("volta para a cascata quando ela responde, sem o texto digitado escondido", async () => {
    await montar();
    await digitar("marca-digitada", "Fiat");
    await digitar("modelo-digitado", "Argo");
    await digitar("ano-digitado", "2021");

    respostas[`/api/fipe/carros/marcas`] = MARCAS;
    await clicar("TENTAR A FIPE DE NOVO");

    expect(porId("brand-search-fipe")).not.toBeNull();
    expect(
      botao("AVANÇAR PARA ESTADO DO VEÍCULO").disabled,
      "o carro digitado não pode passar pela cascata sem ser escolhido nela",
    ).toBe(true);
  });

  it("falhando de novo, o texto digitado continua lá", async () => {
    await montar();
    await digitar("marca-digitada", "Fiat");
    await digitar("modelo-digitado", "Argo");
    await digitar("ano-digitado", "2021");

    await clicar("TENTAR A FIPE DE NOVO");

    expect(porId<HTMLInputElement>("marca-digitada")!.value).toBe("Fiat");
    expect(porId<HTMLInputElement>("modelo-digitado")!.value).toBe("Argo");
    expect(porId<HTMLInputElement>("ano-digitado")!.value).toBe("2021");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A FIPE caindo no MEIO da cascata, e as respostas que chegam tarde
// ─────────────────────────────────────────────────────────────────────────────

const LOJA = "/api/fipe/carros/marcas";
const MARCAS_DUAS = [
  { codigo: "21", nome: "Fiat" },
  { codigo: "22", nome: "Ford" },
];

describe("a queda no meio da cascata", () => {
  beforeEach(() => {
    respostas[LOJA] = MARCAS_DUAS;
  });

  it("modelos falhando: texto livre com a marca escolhida", async () => {
    await montar();
    await escolher("brand-search-fipe", "Fia", "Fiat");

    expect(porId("brand-search-fipe"), "a cascata não serve sem modelos").toBeNull();
    expect(porId<HTMLInputElement>("marca-digitada")!.value).toBe("Fiat");
  });

  it("anos falhando: texto livre com marca e modelo escolhidos", async () => {
    respostas[`${LOJA}/21/modelos`] = { modelos: [{ codigo: 7, nome: "Argo Drive 1.0" }], anos: [] };
    await montar();
    await escolher("brand-search-fipe", "Fia", "Fiat");
    await escolher("model-search-fipe", "Argo", "Argo Drive 1.0");

    expect(porId<HTMLInputElement>("marca-digitada")!.value).toBe("Fiat");
    expect(porId<HTMLInputElement>("modelo-digitado")!.value).toBe("Argo Drive 1.0");
  });

  it("só o valor falhando: a cascata fica, a coluna avisa, e dá para avançar", async () => {
    respostas[`${LOJA}/21/modelos`] = { modelos: [{ codigo: 7, nome: "Argo Drive 1.0" }], anos: [] };
    respostas[`${LOJA}/21/modelos/7/anos`] = [{ codigo: "2021-1", nome: "2021 Gasolina" }];
    await montar();
    await escolher("brand-search-fipe", "Fia", "Fiat");
    await escolher("model-search-fipe", "Argo", "Argo Drive 1.0");
    await escolher("year-search-fipe", "2021", "2021 Gasolina");

    expect(porId("brand-search-fipe"), "valor faltando não é motivo para o texto livre").not.toBeNull();
    expect(coluna()).toContain("A Tabela FIPE não respondeu agora");
    expect(botao("AVANÇAR PARA ESTADO DO VEÍCULO").disabled).toBe(false);
  });
});

describe("respostas que chegam tarde", () => {
  it("os modelos da marca ABANDONADA, falhando depois, não apagam a FIPE da marca nova", async () => {
    // O cenário da revisão de 24/09: Fiat pendurada, troca para Ford, escolhe
    // Ka 2019, vê a FIPE — e só então a busca velha da Fiat falha.
    respostas[LOJA] = MARCAS_DUAS;
    adiar(`${LOJA}/21/modelos`);
    respostas[`${LOJA}/22/modelos`] = { modelos: [{ codigo: 5, nome: "Ka" }], anos: [] };
    respostas[`${LOJA}/22/modelos/5/anos`] = [{ codigo: "2019-1", nome: "2019 Gasolina" }];
    respostas[`${LOJA}/22/modelos/5/anos/2019-1`] = {
      Valor: "R$ 40.000,00",
      CodigoFipe: "003456-7",
      MesReferencia: "setembro de 2026",
    };
    await montar();

    await escolher("brand-search-fipe", "Fia", "Fiat");
    await escolher("brand-search-fipe", "For", "Ford");
    await escolher("model-search-fipe", "Ka", "Ka");
    await escolher("year-search-fipe", "2019", "2019 Gasolina");
    expect(coluna()).toContain("R$ 40.000,00");

    await liberar(`${LOJA}/21/modelos`, null);

    expect(porId("marca-digitada"), "a falha velha jogou o formulário no texto livre").toBeNull();
    expect(coluna()).toContain("R$ 40.000,00");
  });

  it("as marcas do tipo ABANDONADO, chegando depois, não tomam a lista nem derrubam a cascata", async () => {
    adiar(LOJA);
    respostas["/api/fipe/motos/marcas"] = [{ codigo: "60", nome: "ADLY" }];
    await montar();

    await clicar("MOTOS");
    await liberar(LOJA, null);

    expect(porId("marca-digitada"), "a falha das marcas de carro valeu para a tela de motos").toBeNull();
    await digitar("brand-search-fipe", "A");
    expect(texto()).toContain("ADLY");
  });
});
