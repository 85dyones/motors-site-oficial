import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { schemaDaLoja, schemaDoSite } from "../src/lib/schemaLoja";
import type { CompanySettings } from "../src/types";

/**
 * O que acontece quando `companySettings` chega `null`.
 *
 * Não é hipótese: `getCachedSettings` nunca rejeita — engole a falha e segue —,
 * mas devolve `companySettings: null` quando `site_settings` tem linhas e
 * nenhuma com `id='company'`. Nesse caminho o fallback do JSON local é pulado,
 * porque a leitura do banco "deu certo".
 *
 * A revisão da F2 renderizou `/carro-perfeito` nessa condição e recebeu
 * `TypeError: Cannot read properties of null (reading 'name')` — vindo de
 * `schemaDaLoja`. O que caía não era o schema: era a rota. E a F2 tinha
 * acabado de espalhar o risco de duas rotas públicas para seis, ao levar o nó
 * para `/sobre`, `/contato`, `/carro-perfeito` e `/destaques/[tag]`.
 *
 * A guarda mora nas duas funções, não em cada chamador — é uma linha que fecha
 * para todas as rotas, presentes e futuras.
 */

const NULA = null as unknown as CompanySettings;

describe("os nós sobrevivem a settings nula", () => {
  it("schemaDaLoja não estoura, e continua sendo um AutoDealer", () => {
    const loja = schemaDaLoja(NULA) as Record<string, unknown>;

    expect(loja["@type"]).toBe("AutoDealer");
    expect(loja["@id"]).toBeTruthy();
  });

  it("schemaDoSite não estoura, e continua sendo um WebSite", () => {
    const site = schemaDoSite(NULA) as Record<string, unknown>;

    expect(site["@type"]).toBe("WebSite");
    expect(site.publisher).toBeTruthy();
  });

  it("campo sem dado sai AUSENTE, não vazio nem inventado", () => {
    const loja = JSON.parse(JSON.stringify(schemaDaLoja(NULA)));

    // `JSON.stringify` descarta `undefined`: o nó sai menor, e nunca com
    // `"name": ""` ou um endereço truncado — endereço parcial é pior que
    // endereço nenhum (ver `enderecoDoSchema`).
    expect(loja).not.toHaveProperty("name");
    expect(loja).not.toHaveProperty("address");
    expect(loja).not.toHaveProperty("telephone");
  });

  it("o que não depende do painel continua saindo", () => {
    const loja = JSON.parse(JSON.stringify(schemaDaLoja(NULA)));

    expect(loja.areaServed).toHaveLength(6);
    expect(loja.sameAs).toContain("https://www.google.com/maps?cid=6312740048961397930");
  });

  it("settings sem os campos, mas não nula, também passa", () => {
    expect(() => schemaDaLoja({} as CompanySettings)).not.toThrow();
    expect(() => schemaDoSite({} as CompanySettings)).not.toThrow();
  });
});

describe("as rotas que emitem o grafo não caem", () => {
  vi.mock("../src/lib/settings", () => ({
    // O caso exato: a leitura "deu certo" e devolveu nulo.
    getCachedSettings: async () => ({ companySettings: null }),
  }));
  vi.mock("../src/lib/supabase", () => ({ getEstoque: async () => [] }));
  vi.mock("../src/components/CarMatch", () => ({ default: () => null }));
  vi.mock("../src/components/SobreClientWrapper", () => ({ default: () => null }));
  vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));
  // `/contato` monta componentes de cliente que consomem o tema; o assunto aqui
  // é o grafo sobreviver, não o ThemeProvider.
  vi.mock("../src/app/ThemeContext", () => ({
    useTheme: () => ({ companySettings: {} }),
  }));

  it("/carro-perfeito renderiza — foi a rota que a revisão derrubou", async () => {
    const { default: Pagina } = await import("../src/app/carro-perfeito/page");
    await expect(
      (async () => renderToStaticMarkup(await Pagina()))(),
    ).resolves.toContain("application/ld+json");
  });

  it("/sobre renderiza", async () => {
    const { default: Pagina } = await import("../src/app/sobre/page");
    await expect(
      (async () => renderToStaticMarkup(await Pagina()))(),
    ).resolves.toContain("application/ld+json");
  });

  it("/contato renderiza", async () => {
    const { default: Pagina } = await import("../src/app/contato/page");
    await expect(
      (async () => renderToStaticMarkup(await Pagina()))(),
    ).resolves.toContain("application/ld+json");
  });
});
