// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import TabelaDeEstoque from "../src/components/admin/TabelaDeEstoque";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * A FIAÇÃO do segundo nível de filtros — o teste que faltava.
 *
 * ---------------------------------------------------------------------------
 * Por que este arquivo existe
 * ---------------------------------------------------------------------------
 * `tests/painel-de-filtros.test.ts` casa identificadores no texto-fonte e
 * `tests/estoque-filtros.test.ts` chama `filtrarLinhas` direto. Os dois eram
 * verdes, e entre eles cabia um buraco do tamanho da entrega: apagando o
 * `...extras` do `filtrarLinhas(linhas, { estado: filtro, busca, ...extras })`,
 * as oito asserções do primeiro continuavam passando (os identificadores vivem
 * nos handlers dos controles, que seguem lá) e as do segundo também (ele nunca
 * passa pelo componente). Resultado possível: todo controle do painel mexendo
 * no estado, nenhum filtrando nada, e a suíte inteira verde.
 *
 * A prova que este arquivo dá é de ponta a ponta, e é a única que fecha o
 * buraco: monta a tabela, aciona um controle do painel e exige que a lista
 * RENDERIZADA encolha. Apagar `...extras` põe este bloco em vermelho — foi essa
 * a pergunta usada para aceitá-lo.
 *
 * Molde de `tests/curadoria-de-destaques.test.ts`: `createElement` no lugar de
 * JSX (o arquivo é `.ts`), `createRoot` + `act` no lugar de `render`, DOM cru
 * no lugar de `screen`. Nenhuma biblioteca nova.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Uma linha plausível. O elenco de campos é maior do que o que estes testes
 * checam de propósito: linha incompleta faria a tabela quebrar por falta de
 * dado, e o vermelho falaria do fixture em vez de falar do filtro.
 */
const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({
    id,
    marca: "Fiat",
    modelo: "Toro",
    versao: "",
    placa: "",
    tipo: "Picape",
    ano: 2022,
    km: 40000,
    preco: 100000,
    estado: "publicado",
    fotos: 8,
    leads: 0,
    visitas: 0,
    diasEmEstoque: 30,
    diasForaDoFeed: null,
    destacado: false,
    naSemana: false,
    naTv: false,
    bloqueios: [],
    quickTags: [],
    foto: "",
    ...over,
  }) as unknown as LinhaDeEstoque;

/**
 * O elenco de props é fechado e sem interesse para estes testes — só a lista
 * importa. O molde vem do componente (`Parameters<...>`), então acrescentar uma
 * prop obrigatória lá em cima quebra aqui em vez de passar em silêncio.
 */
const props = (linhas: LinhaDeEstoque[]): Parameters<typeof TabelaDeEstoque>[0] =>
  ({
    linhas,
    quickTagsDisponiveis: [],
    destacadosIniciais: [],
    naSemanaIniciais: [],
    naTvIniciais: [],
    overridesIniciais: {},
    visitasDisponiveis: true,
    podeCriar: true,
    podePublicar: true,
    migracaoDoEstadoPendente: false,
  }) as unknown as Parameters<typeof TabelaDeEstoque>[0];

let container: HTMLDivElement;
let root: Root;

async function montar(linhas: LinhaDeEstoque[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(TabelaDeEstoque, props(linhas)));
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/**
 * Quantas linhas de VEÍCULO a tabela está desenhando neste instante.
 *
 * Contadas pela caixa de seleção de cada linha, e não por `tbody tr`: o corpo
 * também desenha uma linha única de "Nenhum veículo para este filtro", e contar
 * `tr` daria 1 para uma tela vazia. A caixa existe uma vez por veículo.
 */
function linhasNaTela(): number {
  return container.querySelectorAll(
    'tbody tr input[type="checkbox"][aria-label^="Selecionar"]',
  ).length;
}

function botao(regex: RegExp): HTMLButtonElement {
  const achado = [...container.querySelectorAll("button")].find(
    (b) => regex.test(b.textContent ?? "") || regex.test(b.getAttribute("aria-label") ?? ""),
  );
  expect(achado, `a tela precisa ter um botão que combine com ${regex}`).toBeDefined();
  return achado as HTMLButtonElement;
}

/** O controle de um `<label>` achado pelo texto — é assim que o painel rotula. */
function controle(regex: RegExp): HTMLInputElement | HTMLSelectElement {
  const rotulo = [...container.querySelectorAll("label")].find((l) =>
    regex.test(l.textContent ?? ""),
  );
  expect(rotulo, `o painel precisa ter um controle rotulado ${regex}`).toBeDefined();
  const campo = rotulo?.querySelector("input, select");
  expect(campo, `o rótulo ${regex} precisa embrulhar um controle`).toBeTruthy();
  return campo as HTMLInputElement | HTMLSelectElement;
}

async function clicar(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

/**
 * Troca o valor de um `<select>` pelo SETTER NATIVO, e não por `el.value = x`.
 *
 * React mantém um "value tracker" por campo controlado e ignora o evento quando
 * o valor que ele anotou não mudou. Atribuir direto engana o tracker e o
 * `onChange` nunca dispara — o teste ficaria verde por não ter acionado nada,
 * que é o oposto do que este arquivo existe para provar.
 */
async function escolher(select: HTMLSelectElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, valor);
  await act(async () => {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const elenco = [
  linha("a", { modelo: "Toro", marca: "Fiat", leads: 0, preco: 100000 }),
  linha("b", { modelo: "Cronos", marca: "Fiat", leads: 3, preco: 90000 }),
  linha("c", { modelo: "Onix", marca: "Chevrolet", leads: 5, preco: 70000 }),
];

describe("o painel de filtros chega em filtrarLinhas", () => {
  it("a tabela abre com o estoque inteiro", async () => {
    await montar(elenco);
    expect(linhasNaTela()).toBe(3);
  });

  it("marcar 'Sem lead' encolhe a lista renderizada", async () => {
    await montar(elenco);
    expect(linhasNaTela()).toBe(3);

    await clicar(botao(/Mais filtros/));
    await clicar(controle(/Sem lead/) as HTMLInputElement);

    // 3 -> 1: só o "a" tem zero lead. Se `...extras` não chegar a
    // `filtrarLinhas`, o estado muda, o checkbox marca, e este número continua 3.
    expect(linhasNaTela()).toBe(1);
    expect(container.textContent).toMatch(/Toro/);
    expect(container.textContent).not.toMatch(/Cronos/);
    // O contador do rodapé do painel sai do MESMO `filtradas` que alimenta a
    // tabela: se ele disser "3 de 3" com uma linha na tela, o recorte não é o
    // que a tela mostra.
    expect(container.textContent).toMatch(/1 de 3 veículos/);
  });

  it("escolher uma marca encolhe a lista renderizada", async () => {
    await montar(elenco);

    await clicar(botao(/Mais filtros/));
    await escolher(controle(/^Marca/) as HTMLSelectElement, "Chevrolet");

    expect(linhasNaTela()).toBe(1);
    expect(container.textContent).toMatch(/Onix/);
    expect(container.textContent).not.toMatch(/Toro/);
  });

  it("limpar filtros devolve o estoque inteiro", async () => {
    await montar(elenco);

    await clicar(botao(/Mais filtros/));
    await clicar(controle(/Sem lead/) as HTMLInputElement);
    expect(linhasNaTela()).toBe(1);

    await clicar(botao(/Limpar filtros/));
    expect(linhasNaTela()).toBe(3);
  });
});
