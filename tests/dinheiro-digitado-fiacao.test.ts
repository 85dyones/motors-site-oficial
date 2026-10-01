// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import EditorDeVeiculo from "../src/components/admin/EditorDeVeiculo";
import CadastroDeVeiculo from "../src/components/admin/CadastroDeVeiculo";

/**
 * A FIAÇÃO dos campos de dinheiro — do que se digita ao corpo que sai.
 *
 * `tests/valor-em-reais.test.ts` prova a leitura. Isto prova que a tela a usa:
 * o bug de 01/10 não estava em função nenhuma, estava no `<input
 * type="number">` do editor, que entrega ao `onChange` um texto já estragado
 * ("75.154,40" vira "75.15440" no Chrome; "113.000" chega como "113.000" e
 * `Number` lê 113). Só renderizando o componente de verdade e olhando o PATCH
 * dá para ver isso — função pura nenhuma o alcança.
 *
 * O jsdom aplica a sanitização do `type="number"` (texto que não é número
 * válido vira ""), então o campo antigo reprova aqui também: "113.000" vira
 * 113, e "75.154,40" some.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let chamadas: { url: string; metodo: string; corpo?: Record<string, unknown> }[] = [];

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push({
      url: String(url),
      metodo: opcoes?.method ?? "GET",
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined,
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        mudancasRegistradas: 1,
        veiculo: { id: 900000001, marca: "Renault", modelo: "Captur", laudo_pericia: null, whatsapp_images: [] },
      }),
    };
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root;
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  chamadas = [];
  dublarFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = fetchOriginal;
});

/** Os dois carros de 01/10, como estavam ANTES do custo errado. */
const CAPTUR = {
  id: 8506096,
  marca: "renault",
  modelo: "captur",
  versao: "intense 1.6",
  origem: "sync",
  preco: 92900,
  preco_original: 92900,
  preco_promocional: 0,
  preco_compra: null as unknown,
  estado_cadastro: "publicado",
  whatsapp_images: ["https://cdn.exemplo/f.jpg"],
  status_tag: "",
};
const CITY = { ...CAPTUR, id: 8517481, marca: "honda", modelo: "city", preco: 119900, preco_original: 119900 };
/** Um carro cadastrado no painel — o único em que preço e promoção se editam. */
const NATIVO = { ...CAPTUR, id: 900000007, origem: "painel", preco: null, preco_original: null };

async function abrirEditor(inicial: Record<string, unknown>) {
  await act(async () => {
    root.render(
      createElement(EditorDeVeiculo as never, {
        inicial: inicial as never,
        visitas30Dias: null,
        perfil: ["admin"] as never,
      }),
    );
  });
  const aba = Array.from(container.querySelectorAll("button")).find((b) =>
    /preço e margem/i.test(b.textContent ?? ""),
  );
  await act(async () => aba!.click());
}

async function digitar(campo: HTMLInputElement, valor: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const botao = (texto: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === texto) as
    | HTMLButtonElement
    | undefined;

async function clicar(texto: string) {
  await act(async () => botao(texto)!.click());
}

const campo = (id: string) => container.querySelector(`#${id}`) as HTMLInputElement;
const patches = () => chamadas.filter((c) => c.metodo === "PATCH");

describe("editor: o preço de compra digitado como na nota chega inteiro ao banco", () => {
  it.each([
    ["75.154,40", 75154.4, CAPTUR],
    ["75.154", 75154, CAPTUR],
    ["75154,40", 75154.4, CAPTUR],
    ["113.000", 113000, CITY],
  ])("%s → PATCH com %d", async (digitado, esperado, carro) => {
    await abrirEditor(carro);
    await digitar(campo("f-compra"), digitado);
    await clicar("Salvar");
    expect(patches()).toHaveLength(1);
    expect(patches()[0].corpo?.preco_compra).toBe(esperado);
  });
});

describe("editor: custo que não dá para confiar não sai da tela", () => {
  it("menos de 10% do anunciado: Salvar travado, motivo na tela, nenhum PATCH", async () => {
    await abrirEditor(CAPTUR);
    await digitar(campo("f-compra"), "75,15");
    expect(botao("Salvar")!.disabled).toBe(true);
    expect(container.textContent).toMatch(/10%/);
    await clicar("Salvar");
    expect(patches()).toHaveLength(0);
  });

  it("valor que não dá para ler: Salvar travado e a forma certa na tela", async () => {
    // Primeiro um valor que ela lê, depois um que não: o número lido fica
    // guardado, e sem a trava o Salvar mandaria 75154 com "75.15440" na tela.
    await abrirEditor(CAPTUR);
    await digitar(campo("f-compra"), "75.154");
    await digitar(campo("f-compra"), "75.15440");
    expect(botao("Salvar")!.disabled).toBe(true);
    expect(container.textContent).toContain("75.154,40");
    await clicar("Salvar");
    expect(patches()).toHaveLength(0);
  });

  it("o custo errado que já está no banco aparece em pt-BR, é apontado, e não trava o resto", async () => {
    // O Captur de hoje. Quem abre para mexer na etiqueta não sabe o custo
    // certo — a tela avisa, e o resto do trabalho segue.
    await abrirEditor({ ...CAPTUR, preco_compra: "75.15" });
    expect(campo("f-compra").value).toBe("75,15");
    expect(container.textContent).toMatch(/10%/);
    await digitar(campo("f-tag"), "Oferta");
    await clicar("Salvar");
    expect(patches()).toHaveLength(1);
    expect(patches()[0].corpo?.status_tag).toBe("Oferta");
  });

  it("Descartar devolve o campo ao valor salvo", async () => {
    await abrirEditor({ ...CITY, preco_compra: 113000 });
    expect(campo("f-compra").value).toBe("113.000");
    await digitar(campo("f-compra"), "11.300");
    await clicar("Descartar");
    expect(campo("f-compra").value).toBe("113.000");
  });
});

describe("editor: preço anunciado e promoção do carro nativo", () => {
  it("118.900 e 109.900 chegam como 118900 e 109900", async () => {
    await abrirEditor(NATIVO);
    await digitar(campo("f-preco"), "118.900");
    await digitar(campo("f-promo"), "109.900");
    await clicar("Salvar");
    expect(patches()).toHaveLength(1);
    expect(patches()[0].corpo).toMatchObject({
      preco_original: 118900,
      preco: 118900,
      preco_promocional: 109900,
    });
  });

  it("promoção apagada volta a ser zero — o 'sem promoção' do banco", async () => {
    await abrirEditor({ ...NATIVO, preco: 109900, preco_original: 118900, preco_promocional: 109900 });
    expect(campo("f-promo").value).toBe("109.900");
    await digitar(campo("f-promo"), "");
    await clicar("Salvar");
    expect(patches()[0].corpo?.preco_promocional).toBe(0);
  });
});

describe("cadastro: os três campos de dinheiro", () => {
  async function abrirCadastro() {
    await act(async () => {
      root.render(createElement(CadastroDeVeiculo as never, { perfil: ["admin"] as never }));
    });
  }

  async function preencherObrigatorios() {
    await digitar(campo("c-marca"), "Honda");
    await digitar(campo("c-modelo"), "City");
    await digitar(campo("c-ano"), "2023");
    await digitar(campo("c-km"), "40000");
    await digitar(campo("c-chassi"), "9BWZZZ377VT004251");
  }

  const posts = () => chamadas.filter((c) => c.metodo === "POST");

  it("119.900, 115.900 e 113.000 chegam inteiros ao POST", async () => {
    await abrirCadastro();
    await preencherObrigatorios();
    await digitar(campo("c-preco"), "119.900");
    await digitar(campo("c-promo"), "115.900");
    await digitar(campo("c-compra"), "113.000");
    await clicar("Cadastrar veículo");
    expect(posts()).toHaveLength(1);
    expect(posts()[0].corpo).toMatchObject({
      preco: 119900,
      preco_promocional: 115900,
      preco_compra: 113000,
    });
  });

  it("custo implausível não cadastra e aponta o campo", async () => {
    await abrirCadastro();
    await preencherObrigatorios();
    await digitar(campo("c-preco"), "119.900");
    await digitar(campo("c-compra"), "113");
    await clicar("Cadastrar veículo");
    expect(posts()).toHaveLength(0);
    expect(container.textContent).toMatch(/10%/);
  });
});
