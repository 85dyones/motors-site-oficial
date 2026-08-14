import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SITE_URL, SITE_HOST, urlDoSite } from "../src/lib/site";

/**
 * O endereço do site mora num lugar só.
 *
 * Até 2026-08-14 ele estava escrito à mão em 15 pontos — canonical, sitemap,
 * robots, JSON-LD de quatro páginas, breadcrumb da ficha e `metadataBase`.
 * O domínio da loja será `motorsstore.com.br`, e trocar caçando string é
 * como se perde um: a página responde 200 e aponta o canonical para um
 * endereço que não é mais o do site — erro de SEO que ninguém vê.
 */

const raiz = join(__dirname, "..");
const DOMINIO_ANTIGO = "motors-site-oficial.vercel.app";

/** Todos os .ts/.tsx sob src/, menos o módulo que legitimamente o contém. */
function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivosDeCodigo(caminho, achados);
    } else if (/\.tsx?$/.test(nome)) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe("o endereço do site", () => {
  it("normaliza com ou sem protocolo e sem barra no fim", () => {
    expect(SITE_URL).toMatch(/^https?:\/\//);
    expect(SITE_URL.endsWith("/")).toBe(false);
    expect(SITE_HOST).not.toMatch(/^https?:\/\//);
  });

  it("monta caminho sem barra dupla", () => {
    expect(urlDoSite("/estoque")).toBe(`${SITE_URL}/estoque`);
    expect(urlDoSite("estoque")).toBe(`${SITE_URL}/estoque`);
    expect(urlDoSite()).toBe(SITE_URL);
  });

  it("nenhum arquivo de src/ escreve o domínio à mão", () => {
    // `lib/site.ts` é o único que pode: é onde mora o padrão.
    const permitidos = [join(raiz, "src", "lib", "site.ts")];
    const infratores = arquivosDeCodigo(join(raiz, "src"))
      .filter((f) => !permitidos.includes(f))
      .filter((f) => readFileSync(f, "utf-8").includes(DOMINIO_ANTIGO))
      .map((f) => f.replace(raiz, ""));

    expect(
      infratores,
      `domínio escrito à mão — importe SITE_URL de lib/site:\n${infratores.join("\n")}`,
    ).toEqual([]);
  });

  it("as superfícies de SEO leem do módulo", () => {
    for (const arquivo of [
      ["src", "app", "robots.ts"],
      ["src", "app", "sitemap.ts"],
      ["src", "app", "layout.tsx"],
    ] as const) {
      const fonte = readFileSync(join(raiz, ...arquivo), "utf-8");
      expect(fonte, `${arquivo.join("/")} não importa SITE_URL`).toMatch(
        /import \{[^}]*SITE_URL[^}]*\} from ".*lib\/site"/,
      );
    }
  });
});
