import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import nextConfig from "../next.config";
import type { MarcaConhecida } from "../src/lib/fichaPerdida";
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

const MARCAS: MarcaConhecida[] = [
  {
    slug: "volkswagen",
    nome: "Volkswagen",
    segmento: "carros",
    total: 2,
    modelos: [
      { slug: "up", nome: "Up", total: 1 },
      { slug: "voyage", nome: "Voyage", total: 1 },
    ],
  },
  { slug: "ford", nome: "Ford", segmento: "carros", total: 1, modelos: [{ slug: "ka", nome: "Ka", total: 1 }] },
  { slug: "land-rover", nome: "Land Rover", segmento: "carros", total: 0, modelos: [] },
];

describe("marca e modelo em maiúsculas", () => {
  it("vão para o mesmo caminho em minúsculas", () => {
    expect(caminhoEmMinusculas(["carros", "VOLKSWAGEN"])).toBe("/carros/volkswagen");
    expect(caminhoEmMinusculas(["carros", "Ford", "Ka"])).toBe("/carros/ford/ka");
  });

  it("caminho já em minúsculas não redireciona (seria laço)", () => {
    expect(caminhoEmMinusculas(["carros", "volkswagen"])).toBeNull();
    expect(caminhoEmMinusculas(["carros", "mercedes-benz", "classe-a"])).toBeNull();
    // `×` está na faixa das maiúsculas acentuadas e não tem minúscula: com a
    // regex de faixa, `/carros/×` redirecionava para si mesmo, sem fim.
    expect(caminhoEmMinusculas(["carros", "×"])).toBeNull();
    expect(caminhoEmMinusculas(["carros", "%C3%97"])).toBeNull();
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
    expect(destinoDeFichaAntiga("carros", "Volkswagen", "Voyage", MARCAS)).toBe(
      "/carros/volkswagen/voyage",
    );
  });

  it("sem hub do modelo, vai para o da marca", () => {
    // `/carros/Ford/Jeep//Ford-Jeep-1971-…-4846154.html`: a loja não tem hub
    // "ford/jeep", mas tem o da Ford.
    expect(destinoDeFichaAntiga("carros", "Ford", "Jeep", MARCAS)).toBe("/carros/ford");
    expect(destinoDeFichaAntiga("carros", "Volkswagen", "Taos", MARCAS)).toBe("/carros/volkswagen");
  });

  it("a marca passa pelo mesmo slug do site novo (espaço e acento)", () => {
    expect(destinoDeFichaAntiga("carros", "Land%20Rover", "Defender", MARCAS)).toBe("/carros/land-rover");
  });

  it("marca que a loja nunca teve cai na vitrine, e nunca na home", () => {
    expect(destinoDeFichaAntiga("carros", "Lada", "Niva", MARCAS)).toBe("/estoque");
    expect(destinoDeFichaAntiga("blog", "Ford", "Ka", MARCAS)).toBe("/estoque");
  });

  it("as duas rotas de ficha usam a regra só para endereço antigo", () => {
    for (const arquivo of [
      "src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx",
      "src/app/[categoria]/[marca]/[modelo]/[ficha]/[legado]/page.tsx",
    ]) {
      const fonte = readFileSync(join(__dirname, "..", arquivo), "utf8");
      expect(fonte, arquivo).toMatch(
        /ehFichaDoSiteAntigo\((slug|legado)\) \? await marcasConhecidasOuNada\(\) : null;[\s\S]{0,200}destinoDeFichaAntiga\(/,
      );
      // O ramo de não encontrado não lê o estoque inteiro (decisão de 13/09).
      const ramo = fonte.slice(fonte.indexOf("ehFichaDoSiteAntigo("), fonte.indexOf("ehFichaDoSiteAntigo(") + 500);
      expect(ramo, arquivo).not.toContain("recortesDoEstoque(");
    }
  });
});

describe("/multipla/modelo-marca/<MODELO>", () => {
  it("a rota não lê o estoque inteiro e redireciona relativo ao pedido", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "src", "app", "multipla", "modelo-marca", "[modelo]", "route.ts"),
      "utf8",
    );
    expect(fonte).toContain("marcasConhecidasOuNada()");
    expect(fonte).not.toContain("recortesDoEstoque");
    expect(fonte).toContain("request.url");
  });

  it("acha a marca no estoque e manda para o hub do modelo", () => {
    expect(destinoDeModeloDoCatalogoAntigo("UP", MARCAS)).toBe("/carros/volkswagen/up");
    expect(destinoDeModeloDoCatalogoAntigo("VOYAGE", MARCAS)).toBe("/carros/volkswagen/voyage");
  });

  it("modelo desconhecido (ou 'MOTO', que não é modelo) fica na vitrine", () => {
    expect(destinoDeModeloDoCatalogoAntigo("MOTO", MARCAS)).toBe("/estoque");
    expect(destinoDeModeloDoCatalogoAntigo("TAOS", MARCAS)).toBe("/estoque");
  });

  it("a regra genérica de /multipla deixa o pedido chegar na rota", async () => {
    const require_ = createRequire(import.meta.url);
    const ptr = require_("next/dist/compiled/path-to-regexp");
    const match = ptr.match ?? ptr.default?.match;
    const regras = await nextConfig.redirects!();
    const casa = (caminho: string) =>
      regras.filter((r) => !r.has).find((r) => match(r.source, { decode: decodeURIComponent })(caminho));
    expect(casa("/multipla/modelo-marca/UP")).toBeUndefined();
    // Mais fundo que o modelo não é endereço do catálogo antigo: vitrine.
    expect(casa("/multipla/modelo-marca/UP/x")?.destination).toBe("/estoque");
    expect(casa("/multipla/modelo-marca")?.destination).toBe("/estoque");
    expect(casa("/multipla")?.destination).toBe("/estoque");
    expect(casa("/multipla/modelo/onix")?.destination).toBe("/estoque");
    expect(casa("/multipla/marca/VOLKSWAGEN")?.destination).toBe("/carros/:marca");
  });
});
