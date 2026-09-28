// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import TabelaDeEstoque from "../src/components/admin/TabelaDeEstoque";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * O carro em preparação na tabela de /admin/estoque — spec
 * 2026-09-28-em-preparacao-design, seção "Painel". A previsão vencida é AVISO,
 * não estado: o carro segue "Publicado" (decisão do dono, 28/09).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Uma linha plausível — o mesmo elenco de `painel-de-filtros-fiacao.test.ts`. */
const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({
    id,
    marca: "Fiat",
    modelo: "Argo",
    versao: "",
    placa: "",
    tipo: "Hatch",
    ano: 2025,
    quilometragem: 9000,
    preco: 79900,
    estado: "publicado",
    estadoCadastro: "publicado",
    vendido: false,
    fotos: 1,
    leads: 0,
    visitas: 0,
    diasEmEstoque: 2,
    diasForaDoFeed: null,
    destacado: false,
    naSemana: false,
    naTv: false,
    bloqueios: [],
    quickTags: [],
    perfisUso: [],
    divergente: false,
    foto: "",
    ...over,
  }) as unknown as LinhaDeEstoque;

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

const textoDaLinha = (id: string) =>
  ([...container.querySelectorAll("tbody tr")].find((tr) => (tr.textContent ?? "").includes(id))?.textContent ?? "")
    .replace(/\s+/g, " ");

describe("o carro em preparação na tabela", () => {
  it("leva o selo, e continua Publicado", async () => {
    await montar([linha("8497421", { emPreparacao: true, previsaoVencidaHaDias: null })]);
    const texto = textoDaLinha("8497421");
    expect(texto).toContain("em preparação");
    expect(texto).not.toContain("previsão vencida");
    expect(texto).toMatch(/Publicado/i);
  });

  it("previsão vencida há 2 dias: o aviso, no plural", async () => {
    await montar([linha("8497421", { emPreparacao: true, previsaoVencidaHaDias: 2 })]);
    expect(textoDaLinha("8497421")).toContain("previsão vencida há 2 dias");
  });

  it("vencida hoje e há 1 dia", async () => {
    // Ids de 7 dígitos, como no resto do arquivo — não "1" e "2": o resto da
    // linha (ano 2025, "02 dias" de `diasEmEstoque`) também contém esses
    // dígitos, e `textoDaLinha("2")` acertaria a linha errada por coincidência.
    await montar([
      linha("9911001", { emPreparacao: true, previsaoVencidaHaDias: 0 }),
      linha("9911002", { emPreparacao: true, previsaoVencidaHaDias: 1 }),
    ]);
    expect(textoDaLinha("9911001")).toContain("previsão vencida hoje");
    // `toContain("... 1 dia")` não bastava: "1 dias" (o plural errado) também
    // contém essa substring, e a trava não reprovava o defeito real (achado no
    // passo 5). O lookahead nega especificamente o "s" do plural.
    expect(textoDaLinha("9911002")).toMatch(/previsão vencida há 1 dia(?!s)/);
  });

  it("carro comum: nem selo nem aviso", async () => {
    await montar([linha("8335204")]);
    const texto = textoDaLinha("8335204");
    expect(texto).not.toContain("em preparação");
    expect(texto).not.toContain("previsão vencida");
  });
});
