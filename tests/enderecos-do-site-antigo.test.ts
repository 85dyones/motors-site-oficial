import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import nextConfig from "../next.config";
import type { Veiculo } from "../src/types";
import {
  caminhoEmMinusculas,
  destinoDeFichaAntiga,
  destinoDeModeloDoCatalogoAntigo,
  ehFichaDoSiteAntigo,
} from "../src/lib/enderecoAntigo";

/**
 * Os endereços do site antigo que a virada de 20/09 deixou em 404 ou mandou
 * para a vitrine genérica (medição de 03/10/2026, em `lib/enderecoAntigo.ts`).
 *
 * As URLs abaixo são as que o Search Console da propriedade antiga mostrava
 * com impressões nos 90 dias anteriores.
 */

function veiculo(parcial: Partial<Veiculo> & Pick<Veiculo, "id" | "marca" | "modelo">): Veiculo {
  return {
    versao: "",
    ano: 2022,
    quilometragem: 40000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Prata",
    fipe: "",
    preco_original: 50000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

const UP = veiculo({ id: "1", marca: "Volkswagen", modelo: "Up", versao: "Take 1.0", tipo: "Hatch" });
const VOYAGE = veiculo({ id: "2", marca: "Volkswagen", modelo: "Voyage", versao: "1.6", tipo: "Sedan" });
const KA = veiculo({ id: "3", marca: "Ford", modelo: "Ka", versao: "SE 1.0", tipo: "Hatch" });
const ESTOQUE = [UP, VOYAGE, KA];

describe("marca e modelo em maiúsculas", () => {
  it("vão para o mesmo caminho em minúsculas", () => {
    expect(caminhoEmMinusculas(["carros", "VOLKSWAGEN"])).toBe("/carros/volkswagen");
    expect(caminhoEmMinusculas(["carros", "Ford", "Ka"])).toBe("/carros/ford/ka");
  });

  it("caminho já em minúsculas não redireciona (seria laço)", () => {
    expect(caminhoEmMinusculas(["carros", "volkswagen"])).toBeNull();
    expect(caminhoEmMinusculas(["carros", "mercedes-benz", "classe-a"])).toBeNull();
  });

  it("os dois hubs chamam a correção antes do 404", () => {
    for (const arquivo of [
      "src/app/[categoria]/[marca]/page.tsx",
      "src/app/[categoria]/[marca]/[modelo]/page.tsx",
    ]) {
      const fonte = readFileSync(join(__dirname, "..", arquivo), "utf8");
      const corpo = fonte.slice(fonte.indexOf("export default async function"));
      const iRedirect = corpo.indexOf("permanentRedirect(emMinusculas)");
      expect(iRedirect, arquivo).toBeGreaterThan(-1);
      expect(iRedirect, arquivo).toBeLessThan(corpo.indexOf("notFound()"));
    }
  });
});

describe("ficha antiga de anúncio que o banco não conhece", () => {
  it("só endereço com .html no fim conta como ficha do site antigo", () => {
    expect(ehFichaDoSiteAntigo("Volkswagen-Taos-Comfortline-2022-Curitiba-Parana-7927166.html")).toBe(true);
    expect(ehFichaDoSiteAntigo("comfortline-1-4-250-tsi-7927166")).toBe(false);
  });

  it("vai para o hub do modelo quando ele existe", () => {
    expect(destinoDeFichaAntiga("carros", "Volkswagen", "Voyage", ESTOQUE, ESTOQUE)).toBe(
      "/carros/volkswagen/voyage",
    );
  });

  it("sem hub do modelo, vai para o da marca", () => {
    // `/carros/Ford/Jeep//Ford-Jeep-1971-…-4846154.html`: a loja não tem hub
    // "ford/jeep", mas tem o da Ford.
    expect(destinoDeFichaAntiga("carros", "Ford", "Jeep", ESTOQUE, ESTOQUE)).toBe("/carros/ford");
    expect(destinoDeFichaAntiga("carros", "Volkswagen", "Taos", ESTOQUE, ESTOQUE)).toBe("/carros/volkswagen");
  });

  it("marca que a loja nunca teve cai na vitrine, e nunca na home", () => {
    expect(destinoDeFichaAntiga("carros", "Lada", "Niva", ESTOQUE, ESTOQUE)).toBe("/estoque");
    expect(destinoDeFichaAntiga("blog", "Ford", "Ka", ESTOQUE, ESTOQUE)).toBe("/estoque");
  });

  it("as duas rotas de ficha usam a regra só para endereço antigo", () => {
    for (const arquivo of [
      "src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx",
      "src/app/[categoria]/[marca]/[modelo]/[ficha]/[legado]/page.tsx",
    ]) {
      const fonte = readFileSync(join(__dirname, "..", arquivo), "utf8");
      expect(fonte, arquivo).toMatch(/if \(ehFichaDoSiteAntigo\((slug|legado)\)\) \{[\s\S]{0,400}destinoDeFichaAntiga\(/);
    }
  });
});

describe("/multipla/modelo-marca/<MODELO>", () => {
  it("acha a marca no estoque e manda para o hub do modelo", () => {
    expect(destinoDeModeloDoCatalogoAntigo("UP", ESTOQUE, ESTOQUE)).toBe("/carros/volkswagen/up");
    expect(destinoDeModeloDoCatalogoAntigo("VOYAGE", ESTOQUE, ESTOQUE)).toBe("/carros/volkswagen/voyage");
  });

  it("modelo desconhecido (ou 'MOTO', que não é modelo) fica na vitrine", () => {
    expect(destinoDeModeloDoCatalogoAntigo("MOTO", ESTOQUE, ESTOQUE)).toBe("/estoque");
    expect(destinoDeModeloDoCatalogoAntigo("TAOS", ESTOQUE, ESTOQUE)).toBe("/estoque");
  });

  it("a regra genérica de /multipla deixa o pedido chegar na rota", async () => {
    const require_ = createRequire(import.meta.url);
    const ptr = require_("next/dist/compiled/path-to-regexp");
    const match = ptr.match ?? ptr.default?.match;
    const regras = await nextConfig.redirects!();
    const casa = (caminho: string) =>
      regras.filter((r) => !r.has).find((r) => match(r.source, { decode: decodeURIComponent })(caminho));
    expect(casa("/multipla/modelo-marca/UP")).toBeUndefined();
    expect(casa("/multipla")?.destination).toBe("/estoque");
    expect(casa("/multipla/modelo/onix")?.destination).toBe("/estoque");
    expect(casa("/multipla/marca/VOLKSWAGEN")?.destination).toBe("/carros/:marca");
  });
});
