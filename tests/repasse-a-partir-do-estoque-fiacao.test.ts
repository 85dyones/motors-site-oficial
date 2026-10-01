// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A fiação do "Buscar no estoque" do novo carro de repasse: escolher um carro
 * preenche o formulário (tudo editável), o PREÇO fica vazio — o do repasse é
 * outro (dono, 01/10) —, "Limpar" volta ao branco, e as fotos são copiadas
 * depois de o rascunho nascer, antes de ir ao editor.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const empurrar = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: empurrar, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/repasse/novo",
  useSearchParams: () => new URLSearchParams(),
}));

const NovoRepasse = (await import("../src/components/admin/repasse/NovoRepasse")).default;

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
/**
 * O carro como a rota o devolve — e com um `preco` que a rota NUNCA manda,
 * de propósito: prova que o formulário não copia preço nem se ele vier.
 */
const CARRO = {
  id: 4321,
  marca: "Volkswagen",
  modelo: "Gol",
  versao: "Trendline",
  ano: 2019,
  ano_fabricacao: 2018,
  quilometragem: 64000,
  cambio: "Manual",
  combustivel: "Flex",
  cor: "Branco",
  tipo: "Hatch",
  carroceria: "hatch",
  codigo_fipe: "005340-6",
  situacao: "vendido",
  foto: null,
  fotosCopiaveis: 2,
  fotosDeFora: 1,
  preco: 54999,
};

let container: HTMLDivElement;
let root: Root;
let respostaDaCopia: () => Response;
const fetchFalso = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (url) => {
  const alvo = String(url);
  if (alvo.startsWith("/api/repasses/estoque?")) return new Response(JSON.stringify({ veiculos: [CARRO] }));
  if (alvo === "/api/repasses") return new Response(JSON.stringify({ id: ID, slug: "x" }), { status: 201 });
  if (alvo === `/api/repasses/${ID}/fotos-do-estoque`) return respostaDaCopia();
  return new Response("{}", { status: 404 });
});

beforeEach(async () => {
  empurrar.mockClear();
  fetchFalso.mockClear();
  respostaDaCopia = () => new Response(JSON.stringify({ copiadas: 2, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 0 }));
  vi.stubGlobal("fetch", fetchFalso);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(NovoRepasse)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function digitar(el: HTMLInputElement | HTMLSelectElement, valor: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
const campo = (nome: string) => container.querySelector(`[name="${nome}"]`) as HTMLInputElement | null;
const busca = () => container.querySelector('input[type="search"]') as HTMLInputElement;
const botao = (texto: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === texto) as HTMLButtonElement | undefined;
/**
 * Enter num campo de formulário, como o navegador o trata: se ninguém
 * cancelar o `keydown`, vem a submissão implícita. O jsdom não a faz sozinho,
 * então o teste a faz — com `requestSubmit`, que valida os obrigatórios como o
 * navegador. Devolve se o Enter foi cancelado.
 */
function teclarEnter(el: HTMLInputElement): boolean {
  const tecla = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  el.dispatchEvent(tecla);
  if (!tecla.defaultPrevented) el.form?.requestSubmit();
  return tecla.defaultPrevented;
}
/** A busca espera o usuário parar de digitar; depois, a cadeia fetch → json → setState. */
const esperar = (ms = 350) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

async function escolherOGol() {
  await act(async () => digitar(busca(), "gol"));
  await esperar();
  const opcao = Array.from(container.querySelectorAll("li button")).find((b) => b.textContent?.includes("Gol")) as HTMLButtonElement;
  expect(opcao).toBeTruthy();
  await act(async () => opcao.click());
}

describe("Buscar no estoque, no novo carro de repasse", () => {
  it("busca no servidor pelo termo e mostra a situação de cada carro", async () => {
    await act(async () => digitar(busca(), "gol"));
    await esperar();
    expect(fetchFalso).toHaveBeenCalledWith("/api/repasses/estoque?q=gol");
    const lista = container.querySelector("ul")!;
    expect(lista.textContent).toContain("Volkswagen Gol Trendline");
    expect(lista.textContent).toContain("Vendido");
  });

  it("uma letra só não vai ao servidor", async () => {
    await act(async () => digitar(busca(), "g"));
    await esperar();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("escolher preenche o cadastro, mostra a situação e o que acontece com as fotos", async () => {
    await escolherOGol();
    expect(campo("marca")!.value).toBe("Volkswagen");
    expect(campo("modelo")!.value).toBe("Gol");
    expect(campo("versao")!.value).toBe("Trendline");
    expect(campo("ano_modelo")!.value).toBe("2019");
    expect(campo("ano_fabricacao")!.value).toBe("2018");
    expect(campo("quilometragem")!.value).toBe("64000");
    expect(campo("cambio")!.value).toBe("Manual");
    expect(campo("combustivel")!.value).toBe("Flex");
    expect(campo("cor")!.value).toBe("Branco");
    expect(campo("carroceria")!.value).toBe("hatch");
    expect(campo("fipe_codigo")!.value).toBe("005340-6");
    expect(container.textContent).toContain("Vendido");
    expect(container.textContent).toContain(
      "2 fotos vêm para o repasse; 1 fica de fora (sem as duas versões, ou fora do endereço da loja).",
    );
  });

  it("o preço não vem do estoque: fica vazio e obrigatório", async () => {
    await escolherOGol();
    expect(campo("preco")!.value).toBe("");
    expect(campo("preco")!.required).toBe(true);
  });

  it("tudo continua editável, e o que vai ao banco é o que está na tela", async () => {
    await escolherOGol();
    await act(async () => {
      digitar(campo("cor")!, "Prata");
      digitar(campo("carroceria") as unknown as HTMLSelectElement, "outro");
      digitar(campo("preco")!, "39900");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await esperar(0);
    const [, init] = fetchFalso.mock.calls.find(([url]) => String(url) === "/api/repasses")!;
    expect(JSON.parse(String(init!.body))).toEqual({
      marca: "Volkswagen",
      modelo: "Gol",
      versao: "Trendline",
      ano_modelo: 2019,
      quilometragem: 64000,
      preco: 39900,
      ano_fabricacao: 2018,
      cambio: "Manual",
      combustivel: "Flex",
      cor: "Prata",
      carroceria: "outro",
      fipe_codigo: "005340-6",
    });
  });

  it("depois de criar, copia as fotos do carro escolhido e então vai ao editor", async () => {
    await escolherOGol();
    await act(async () => digitar(campo("preco")!, "39900"));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await esperar(0);
    const copia = fetchFalso.mock.calls.find(([url]) => String(url) === `/api/repasses/${ID}/fotos-do-estoque`);
    expect(copia).toBeTruthy();
    expect(copia![1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(copia![1]!.body))).toEqual({ estoqueId: 4321 });
    expect(empurrar).toHaveBeenCalledWith(`/admin/repasse/${ID}/editar`);
  });

  it("a cópia falhou: o rascunho já existe, a tela diz o que houve e leva ao editor sem recriar", async () => {
    respostaDaCopia = () => new Response(JSON.stringify({ copiadas: 1, ficaramDeFora: 1, acimaDoLimite: 0, falharam: 1 }));
    await escolherOGol();
    await act(async () => digitar(campo("preco")!, "39900"));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await esperar(0);
    expect(empurrar).not.toHaveBeenCalled();
    expect(container.textContent).toContain("1 foto veio para o repasse; 1 não veio. Envie as que faltam pelo editor.");
    expect(container.querySelector(`a[href="/admin/repasse/${ID}/editar"]`)).toBeTruthy();
    expect(botao("Criar rascunho")).toBeUndefined();
  });

  it("o resumo soma as fotos copiadas e as baixadas do carro57", async () => {
    respostaDaCopia = () =>
      new Response(JSON.stringify({ copiadas: 1, baixadas: 2, ficaramDeFora: 0, acimaDoLimite: 0, falharam: 1 }));
    await escolherOGol();
    await act(async () => digitar(campo("preco")!, "39900"));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await esperar(0);
    expect(container.textContent).toContain("3 fotos vieram para o repasse; 1 não veio.");
  });

  it("a rota da cópia caiu: mesma coisa, sem recriar o rascunho", async () => {
    respostaDaCopia = () => new Response(JSON.stringify({ error: "Falha ao copiar as fotos." }), { status: 500 });
    await escolherOGol();
    await act(async () => digitar(campo("preco")!, "39900"));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await esperar(0);
    expect(empurrar).not.toHaveBeenCalled();
    expect(container.textContent).toContain("as fotos do estoque não vieram");
    expect(fetchFalso.mock.calls.filter(([url]) => String(url) === "/api/repasses")).toHaveLength(1);
  });

  it("Enter na busca não cria o rascunho — nem com um carro já escolhido e o preço digitado", async () => {
    await escolherOGol();
    await act(async () => digitar(campo("preco")!, "39900"));
    // A pessoa vai procurar outro carro e tecla Enter, como em qualquer busca.
    await act(async () => digitar(busca(), "argo"));
    let cancelado = false;
    await act(async () => {
      cancelado = teclarEnter(busca());
    });
    await esperar(0);
    expect(cancelado).toBe(true);
    expect(fetchFalso.mock.calls.some(([url]) => String(url) === "/api/repasses")).toBe(false);
    expect(fetchFalso.mock.calls.some(([url]) => String(url).includes("fotos-do-estoque"))).toBe(false);
    expect(empurrar).not.toHaveBeenCalled();
  });

  it("Enter nos campos do carro continua enviando, como antes", async () => {
    await escolherOGol();
    await act(async () => digitar(campo("preco")!, "39900"));
    await act(async () => {
      teclarEnter(campo("preco")!);
    });
    await esperar(0);
    expect(fetchFalso.mock.calls.some(([url]) => String(url) === "/api/repasses")).toBe(true);
  });

  it("Limpar volta ao branco", async () => {
    await escolherOGol();
    await act(async () => digitar(campo("preco")!, "39900"));
    await act(async () => botao("Limpar")!.click());
    for (const nome of ["marca", "modelo", "versao", "ano_modelo", "quilometragem", "preco"]) {
      expect(campo(nome)!.value).toBe("");
    }
    // Os campos que só o estoque traz somem junto, e com eles o aviso.
    for (const nome of ["ano_fabricacao", "cambio", "combustivel", "cor", "carroceria", "fipe_codigo"]) {
      expect(campo(nome)).toBeNull();
    }
    expect(container.textContent).not.toContain("vêm para o repasse");
    expect(container.textContent).not.toContain("Vendido");
  });

  it("depois de Limpar, criar não copia foto nenhuma", async () => {
    await escolherOGol();
    await act(async () => botao("Limpar")!.click());
    await act(async () => {
      digitar(campo("marca")!, "Renault");
      digitar(campo("modelo")!, "Kwid");
      digitar(campo("ano_modelo")!, "2021");
      digitar(campo("quilometragem")!, "71200");
      digitar(campo("preco")!, "36900");
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await esperar(0);
    expect(fetchFalso.mock.calls.some(([url]) => String(url).includes("fotos-do-estoque"))).toBe(false);
    expect(empurrar).toHaveBeenCalledWith(`/admin/repasse/${ID}/editar`);
  });
});
