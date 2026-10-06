// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import GaleriaDeFotos from "../src/components/admin/GaleriaDeFotos";
import { destinoDoRepasse } from "../src/lib/destinoDasFotos";
import { fotoDeTeste } from "./repasseDeTeste";

/**
 * A fiação do "Importar fotos do feed" na galeria do carro de repasse (dono,
 * 06/10): o botão ao lado do envio, a escolha do carro do estoque, e o que a
 * tela diz em cada desfecho: buscando, quantas vieram, nada a trazer e erro.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const ROTA = `/api/repasses/${ID}/fotos-do-feed`;
const CARRO = {
  id: 4321,
  marca: "Renault",
  modelo: "Kwid",
  versao: "Zen 1.0",
  ano: 2021,
  ano_fabricacao: 2020,
  quilometragem: 71200,
  cambio: "Manual",
  combustivel: "Flex",
  cor: "Prata",
  tipo: "Hatch",
  carroceria: "hatch",
  codigo_fipe: null,
  situacao: "publicado",
  foto: null,
  fotosCopiaveis: 0,
  fotosDeFora: 0,
  doPainel: false,
};
const VIERAM = {
  vieram: 2,
  jaEstavam: 0,
  ficaramDeFora: 0,
  acimaDoLimite: 0,
  falharam: 0,
  web_full_images: [fotoDeTeste("rm-aaaaaaaaaaaaaaaa-1"), fotoDeTeste("rm-bbbbbbbbbbbbbbbb-2")],
  whatsapp_images: [fotoDeTeste("rm-aaaaaaaaaaaaaaaa-1", "zap"), fotoDeTeste("rm-bbbbbbbbbbbbbbbb-2", "zap")],
};

let container: HTMLDivElement;
let root: Root;
let respostaDoFeed: () => Response | Promise<Response>;
let respostaDaBusca: () => Response;
/** O que `GET /api/repasses/<id>` responde quando a galeria relê a lista gravada. */
let respostaDaLeitura: () => Response | Promise<Response>;
const aoGravar = vi.fn();
const fetchFalso = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (url, init) => {
  const alvo = String(url);
  if (alvo.startsWith("/api/repasses/estoque?")) return respostaDaBusca();
  if (alvo === ROTA) return respostaDoFeed();
  if (alvo === `/api/repasses/${ID}` && (init?.method ?? "GET") === "GET") return respostaDaLeitura();
  if (alvo === `/api/repasses/${ID}` && init?.method === "PATCH") return new Response(JSON.stringify({ ok: true }));
  return new Response("{}", { status: 404 });
});
type Par = { web: string; zap: string };

async function desenhar(props: { podeEditar?: boolean; noEstoque?: boolean; fotos?: Par[] } = {}) {
  await act(async () =>
    root.render(
      createElement(GaleriaDeFotos, {
        estoqueId: props.noEstoque ? 900000001 : ID,
        fotos: props.fotos ?? [],
        origem: "painel",
        podeEditar: props.podeEditar ?? true,
        aoGravar,
        ...(props.noEstoque ? {} : { destino: destinoDoRepasse(ID, "Kwid") }),
      }),
    ),
  );
}

beforeEach(() => {
  aoGravar.mockClear();
  fetchFalso.mockClear();
  respostaDaBusca = () => new Response(JSON.stringify({ veiculos: [CARRO] }));
  respostaDoFeed = () => new Response(JSON.stringify(VIERAM));
  respostaDaLeitura = () => new Response("{}", { status: 500 });
  vi.stubGlobal("fetch", fetchFalso);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const botao = (texto: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === texto) as HTMLButtonElement | undefined;
const caixaDaBusca = () => container.querySelector('input[role="combobox"]') as HTMLInputElement | null;
const opcoes = () => Array.from(container.querySelectorAll('[role="option"]')) as HTMLElement[];
const esperar = (ms = 350) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const leituras = () => fetchFalso.mock.calls.filter(([url, init]) => String(url) === `/api/repasses/${ID}` && (init?.method ?? "GET") === "GET");
const gravacoes = () => fetchFalso.mock.calls.filter(([url, init]) => String(url) === `/api/repasses/${ID}` && init?.method === "PATCH");
const pedidosAoFeed = () => fetchFalso.mock.calls.filter(([url]) => String(url) === ROTA);

async function abrirABusca() {
  await act(async () => botao("Importar fotos do feed")!.click());
  await esperar();
}
async function importarDoKwid() {
  await abrirABusca();
  await act(async () => opcoes()[0].click());
  await esperar(20);
}

describe("o botão de importar do feed, na galeria do repasse", () => {
  it("fica ao lado do envio, com o texto do estoque e alvo de toque de 44 px", async () => {
    await desenhar();
    const importar = botao("Importar fotos do feed")!;
    expect(importar).toBeTruthy();
    expect(importar.className).toContain("min-h-11");
    const enviar = container.querySelector('label[for="fotos-do-veiculo"]')!;
    expect(enviar.textContent).toBe("Enviar fotos");
    expect(importar.parentElement).toBe(enviar.parentElement);
  });

  it("quem só vê não tem o botão", async () => {
    await desenhar({ podeEditar: false });
    expect(botao("Importar fotos do feed")).toBeUndefined();
  });

  it("o carro nativo do estoque continua sem ele: lá o botão é o do carro do feed", async () => {
    await desenhar({ noEstoque: true });
    expect(botao("Importar fotos do feed")).toBeUndefined();
  });
});

describe("escolher o carro do estoque", () => {
  it("a busca abre com o modelo do repasse, pela rota do repasse, e nada é importado antes da escolha", async () => {
    await desenhar();
    await abrirABusca();
    expect(caixaDaBusca()!.value).toBe("Kwid");
    const buscas = fetchFalso.mock.calls.map(([url]) => String(url));
    expect(buscas).toEqual(["/api/repasses/estoque?q=Kwid"]);
    expect(opcoes()).toHaveLength(1);
    expect(opcoes()[0].textContent).toContain("Renault Kwid Zen 1.0 2021");
    expect(pedidosAoFeed()).toEqual([]);
  });

  it("Cancelar fecha a busca sem importar", async () => {
    await desenhar();
    await abrirABusca();
    await act(async () => botao("Cancelar")!.click());
    expect(caixaDaBusca()).toBeNull();
    expect(pedidosAoFeed()).toEqual([]);
    expect(botao("Importar fotos do feed")!.disabled).toBe(false);
  });

  it("a busca do estoque falhou: o erro aparece na caixa, com Tentar de novo", async () => {
    respostaDaBusca = () => new Response(JSON.stringify({ error: "Não deu para ler o estoque." }), { status: 502 });
    await desenhar();
    await abrirABusca();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Não deu para ler o estoque.");
    expect(botao("Tentar de novo")).toBeTruthy();
  });
});

describe("o que a tela diz em cada desfecho", () => {
  it("o pedido leva só o carro escolhido, sem endereço de foto", async () => {
    await desenhar();
    await importarDoKwid();
    const [[, init]] = pedidosAoFeed();
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ estoqueId: 4321 });
  });

  it("enquanto vem: diz que está trazendo, e os dois botões ficam parados", async () => {
    let soltar: (r: Response) => void = () => {};
    respostaDoFeed = () => new Promise<Response>((resolver) => (soltar = resolver));
    await desenhar();
    await importarDoKwid();
    expect(container.textContent).toContain("Trazendo as fotos do RevendaMais…");
    expect(botao("Buscando no feed…")!.disabled).toBe(true);
    expect(container.querySelector('label[for="fotos-do-veiculo"]')!.textContent).toBe("Aguarde…");
    expect((container.querySelector("#fotos-do-veiculo") as HTMLInputElement).disabled).toBe(true);
    expect(caixaDaBusca()).toBeNull();

    await act(async () => soltar(new Response(JSON.stringify(VIERAM))));
    await esperar(20);
    expect(container.textContent).not.toContain("Trazendo as fotos do RevendaMais…");
    expect(botao("Importar fotos do feed")!.disabled).toBe(false);
  });

  it("vieram: diz quantas e entrega as colunas a quem montou a galeria", async () => {
    await desenhar();
    await importarDoKwid();
    expect(container.querySelector('[role="status"]')!.textContent).toBe("2 fotos vieram do RevendaMais.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(aoGravar).toHaveBeenCalledTimes(1);
    expect(aoGravar).toHaveBeenCalledWith({
      web_full_images: VIERAM.web_full_images,
      whatsapp_images: VIERAM.whatsapp_images,
      url_imagem: VIERAM.whatsapp_images[0],
    });
  });

  it("uma só: singular", async () => {
    respostaDoFeed = () => new Response(JSON.stringify({ ...VIERAM, vieram: 1, jaEstavam: 1 }));
    await desenhar();
    await importarDoKwid();
    expect(container.querySelector('[role="status"]')!.textContent).toBe("1 foto veio do RevendaMais. 1 já estava na galeria.");
  });

  it("nada a trazer: diz que já estão na galeria, sem erro e sem mexer na lista", async () => {
    respostaDoFeed = () => new Response(JSON.stringify({ ...VIERAM, vieram: 0, jaEstavam: 2 }));
    await desenhar();
    await importarDoKwid();
    expect(container.querySelector('[role="status"]')!.textContent).toBe("Nenhuma foto nova: as 2 fotos do anúncio já estão na galeria.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // A lista que vale é a do servidor, mesmo sem foto nova.
    expect(aoGravar).toHaveBeenCalledTimes(1);
    expect(aoGravar.mock.calls[0][0].web_full_images).toEqual(VIERAM.web_full_images);
  });

  it("veio só uma parte: diz quantas de quantas e que dá para importar de novo", async () => {
    respostaDoFeed = () => new Response(JSON.stringify({ ...VIERAM, vieram: 2, falharam: 7 }));
    await desenhar();
    await importarDoKwid();
    expect(container.querySelector('[role="status"]')!.textContent).toBe("Vieram 2 de 9 fotos. Importe de novo para trazer as que faltaram.");
  });

  it("a rota recusou: a frase dela aparece no aviso de erro da galeria", async () => {
    respostaDoFeed = () =>
      new Response(JSON.stringify({ error: "Este carro não está no feed do RevendaMais de agora." }), { status: 404 });
    await desenhar();
    await importarDoKwid();
    expect(container.querySelector('[role="alert"]')!.textContent).toBe("Este carro não está no feed do RevendaMais de agora.");
    expect(aoGravar).not.toHaveBeenCalled();
    // Recusa clara: nada foi gravado, então a lista não precisa ser relida.
    expect(leituras()).toHaveLength(0);
    // Dá para tentar de novo, com outro carro.
    expect(botao("Importar fotos do feed")!.disabled).toBe(false);
  });

  it("nenhuma veio, e havia: é erro, não aviso", async () => {
    respostaDoFeed = () => new Response(JSON.stringify({ ...VIERAM, vieram: 0, falharam: 3 }));
    await desenhar();
    await importarDoKwid();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Nenhuma foto veio do RevendaMais. 3 não vieram.");
  });

  it("a rede caiu: erro na tela, sem estourar", async () => {
    respostaDoFeed = () => Promise.reject(new Error("Failed to fetch"));
    await desenhar();
    await importarDoKwid();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(aoGravar).not.toHaveBeenCalled();
  });
});

describe("carro de que não se importa, na busca (revisão de 06/10)", () => {
  it("o cadastrado no painel e o vendido aparecem parados, com o motivo, e o clique não importa", async () => {
    respostaDaBusca = () =>
      new Response(
        JSON.stringify({
          veiculos: [
            { ...CARRO, id: 1, doPainel: true },
            { ...CARRO, id: 2, situacao: "vendido" },
            { ...CARRO, id: 3 },
          ],
        }),
      );
    await desenhar();
    await abrirABusca();
    const [doPainel, vendido, livre] = opcoes();
    expect(doPainel.getAttribute("aria-disabled")).toBe("true");
    expect(doPainel.textContent).toContain("não vem do RevendaMais");
    expect(vendido.getAttribute("aria-disabled")).toBe("true");
    expect(vendido.textContent).toContain("anúncio fora do ar no RevendaMais");
    expect(livre.getAttribute("aria-disabled")).toBeNull();

    await act(async () => doPainel.click());
    await act(async () => vendido.click());
    expect(pedidosAoFeed()).toEqual([]);
    await act(async () => livre.click());
    await esperar(20);
    expect(JSON.parse(String(pedidosAoFeed()[0][1]?.body))).toEqual({ estoqueId: 3 });
  });
});

describe("a galeria não grava por cima do que o servidor tem (revisão de 06/10)", () => {
  const NA_TELA: Par[] = [
    { web: fotoDeTeste("a"), zap: fotoDeTeste("a", "zap") },
    { web: fotoDeTeste("b"), zap: fotoDeTeste("b", "zap") },
  ];
  /** O que o servidor gravou na importação cuja resposta se perdeu: as da tela e mais uma. */
  const GRAVADAS = {
    web_full_images: [...NA_TELA.map((f) => f.web), fotoDeTeste("rm-cccccccccccccccc-3")],
    whatsapp_images: [...NA_TELA.map((f) => f.zap), fotoDeTeste("rm-cccccccccccccccc-3", "zap")],
  };
  const leituraBoa = () => new Response(JSON.stringify({ ok: true, repasse: GRAVADAS }));
  const respostaPerdida = () => Promise.reject(new Error("Failed to fetch"));
  const moverParaFrente = () => container.querySelector('button[aria-label="Mover a foto 1 para frente"]') as HTMLButtonElement;

  it("a resposta da importação se perdeu: a tela relê na hora e adota a lista gravada", async () => {
    respostaDoFeed = respostaPerdida;
    respostaDaLeitura = leituraBoa;
    await desenhar({ fotos: NA_TELA });
    await importarDoKwid();
    expect(leituras()).toHaveLength(1);
    expect(aoGravar).toHaveBeenCalledTimes(1);
    expect(aoGravar.mock.calls[0][0].web_full_images).toEqual(GRAVADAS.web_full_images);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("resposta 5xx também deixa a lista em dúvida, e a tela relê", async () => {
    respostaDoFeed = () => new Response(JSON.stringify({ error: "Falha ao importar as fotos do feed." }), { status: 502 });
    respostaDaLeitura = leituraBoa;
    await desenhar({ fotos: NA_TELA });
    await importarDoKwid();
    expect(leituras()).toHaveLength(1);
    expect(aoGravar.mock.calls[0][0].web_full_images).toEqual(GRAVADAS.web_full_images);
  });

  it("nem reler deu: a próxima ação relê ANTES de gravar; se a lista mudou, adota e não grava a velha", async () => {
    respostaDoFeed = respostaPerdida;
    await desenhar({ fotos: NA_TELA });
    await importarDoKwid();
    expect(aoGravar).not.toHaveBeenCalled();

    respostaDaLeitura = leituraBoa;
    await act(async () => moverParaFrente().click());
    await esperar(20);
    expect(leituras()).toHaveLength(2);
    expect(gravacoes()).toEqual([]);
    expect(aoGravar).toHaveBeenCalledTimes(1);
    expect(aoGravar.mock.calls[0][0].web_full_images).toEqual(GRAVADAS.web_full_images);
    expect(container.querySelector('[role="status"]')!.textContent).toContain("A galeria foi atualizada");
  });

  it("a releitura continua falhando: nada grava, e a tela diz por quê", async () => {
    respostaDoFeed = respostaPerdida;
    await desenhar({ fotos: NA_TELA });
    await importarDoKwid();
    await act(async () => moverParaFrente().click());
    await esperar(20);
    expect(gravacoes()).toEqual([]);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Não deu para conferir as fotos gravadas");
  });

  it("a lista gravada é a mesma da tela: a dúvida acaba e a ação grava normalmente", async () => {
    respostaDoFeed = respostaPerdida;
    await desenhar({ fotos: NA_TELA });
    await importarDoKwid();
    respostaDaLeitura = () =>
      new Response(JSON.stringify({ repasse: { web_full_images: NA_TELA.map((f) => f.web), whatsapp_images: NA_TELA.map((f) => f.zap) } }));
    await act(async () => moverParaFrente().click());
    await esperar(20);
    expect(gravacoes()).toHaveLength(1);
    expect(JSON.parse(String(gravacoes()[0][1]?.body)).web_full_images).toEqual([NA_TELA[1].web, NA_TELA[0].web]);
  });

  it("sem dúvida nenhuma, mover não relê: grava direto", async () => {
    await desenhar({ fotos: NA_TELA });
    await act(async () => moverParaFrente().click());
    await esperar(20);
    expect(leituras()).toEqual([]);
    expect(gravacoes()).toHaveLength(1);
  });

  it("enquanto a importação roda, as ações das fotos ficam paradas", async () => {
    respostaDoFeed = () => new Promise<Response>(() => {});
    await desenhar({ fotos: NA_TELA });
    await importarDoKwid();
    const acoes = Array.from(container.querySelectorAll("button[aria-label]")) as HTMLButtonElement[];
    expect(acoes.length).toBeGreaterThan(0);
    expect(acoes.every((b) => b.disabled)).toBe(true);
  });
});
