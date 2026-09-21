import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import { razaoSocialAparte } from "../src/lib/identidadeLegal";
import { schemaDaLoja } from "../src/lib/schemaLoja";
import { ler } from "./fonte";

/**
 * Razão social ao lado do CNPJ (2026-09-21).
 *
 * O rodapé publicava a marca e o número, sem o nome empresarial a que o número
 * pertence. O dono pediu o campo. Este arquivo prende os quatro lugares em que
 * a identidade legal aparece — rodapé, política de privacidade, ficha impressa
 * e `AutoDealer` — e a regra de não repetir o nome quando a razão social é a
 * própria marca.
 *
 * A razão social dos testes é inventada de propósito: a real vem do painel.
 */

const RAZAO = "Exemplo Comércio de Veículos Ltda";
const CNPJ = "12.345.678/0001-99";

const BASE: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: CNPJ,
};

const atual = vi.hoisted(() => ({ empresa: null as unknown }));

vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ companySettings: atual.empresa }),
}));
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: atual.empresa }),
}));
vi.mock("../src/components/ControleDeRastreamento", () => ({ default: () => null }));

beforeEach(() => {
  atual.empresa = { ...BASE, razaoSocial: RAZAO };
});

// O ano sai vazio no servidor (`AnoAtual` só o preenche no cliente, para não
// congelar o ano do build no HTML) — por isso o `(?:\d{4} )?` nas linhas.
async function rodape(): Promise<string> {
  const { default: Footer } = await import("../src/components/Footer");
  return renderToStaticMarkup(createElement(Footer, {}));
}

function texto(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

describe("quando a razão social acrescenta alguma coisa", () => {
  it.each([
    [{ name: "Motors Store", razaoSocial: RAZAO }, RAZAO],
    [{ name: "Motors Store", razaoSocial: "  Exemplo   Comércio de Veículos Ltda " }, RAZAO],
    [{ name: "Motors Store", razaoSocial: "" }, ""],
    [{ name: "Motors Store" }, ""],
    [{ name: "Motors Store", razaoSocial: "MOTORS STORE" }, ""],
    [{ name: "Citroën Centro", razaoSocial: "citroen  centro" }, ""],
  ])("%o → %j", (empresa, esperado) => {
    expect(razaoSocialAparte(empresa)).toBe(esperado);
  });

  it("settings nula não derruba", () => {
    expect(razaoSocialAparte(null)).toBe("");
  });
});

describe("o rodapé", () => {
  it("marca · razão social · CNPJ, na mesma linha", async () => {
    expect(texto(await rodape())).toMatch(
      /© (?:\d{4} )?MOTORS STORE · EXEMPLO COMÉRCIO DE VEÍCULOS LTDA · CNPJ 12\.345\.678\/0001-99/,
    );
  });

  it("razão social em branco: a linha fica como era", async () => {
    atual.empresa = { ...BASE, razaoSocial: "" };
    expect(texto(await rodape())).toMatch(/© (?:\d{4} )?MOTORS STORE · CNPJ 12\.345\.678\/0001-99/);
  });

  it("razão social igual à marca não se repete", async () => {
    atual.empresa = { ...BASE, razaoSocial: "Motors Store" };
    const linha = texto(await rodape());
    expect(linha).toMatch(/© (?:\d{4} )?MOTORS STORE · CNPJ/);
    expect(linha).not.toMatch(/MOTORS STORE · MOTORS STORE/);
  });
});

describe("a política de privacidade nomeia a pessoa jurídica", () => {
  async function politica(): Promise<string> {
    const { default: PrivacidadePage } = await import("../src/app/privacidade/page");
    return texto(renderToStaticMarkup(await PrivacidadePage()));
  }

  it("o controlador é a razão social, com a marca ao lado", async () => {
    expect(await politica()).toContain(
      `é a ${RAZAO} (nome fantasia Motors Store), inscrita no CNPJ sob o nº ${CNPJ}`,
    );
  });

  it("sem razão social, continua nomeando a marca", async () => {
    atual.empresa = { ...BASE, razaoSocial: "" };
    const t = await politica();
    expect(t).toContain(`é a Motors Store, inscrita no CNPJ sob o nº ${CNPJ}`);
    expect(t).not.toContain("nome fantasia");
  });
});

describe("o AutoDealer declara legalName e taxID", () => {
  it("com os dois preenchidos", () => {
    const loja = schemaDaLoja({ ...BASE, razaoSocial: ` ${RAZAO} ` });
    expect(loja.name).toBe("Motors Store");
    expect(loja.legalName).toBe(RAZAO);
    expect(loja.taxID).toBe(CNPJ);
  });

  it("em branco, a propriedade some do JSON — nunca string vazia", () => {
    const publicado = JSON.parse(JSON.stringify(schemaDaLoja({ ...BASE, cnpj: " ", razaoSocial: "" })));
    expect(publicado).not.toHaveProperty("legalName");
    expect(publicado).not.toHaveProperty("taxID");
  });
});

describe("o painel e a ficha impressa", () => {
  it("o painel tem o campo, ligado a `razaoSocial`", () => {
    const painel = ler("src/components/ConfiguracoesClientWrapper.tsx");
    expect(painel).toContain('value={companyForm.razaoSocial ?? ""}');
    expect(painel).toContain("setCompanyForm({ ...companyForm, razaoSocial: e.target.value })");
  });

  it("o rodapé da ficha impressa mostra a razão social acima do endereço", () => {
    // O rodape migrou para a folha A4 quando o redesenho trocou os blocos
    // print-only do PDP por ela.
    const ficha = ler("src/components/modernist/FichaImpressa.tsx");
    const i = ficha.indexOf("razaoSocialAparte(empresa) && <span");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(ficha.indexOf("{empresa.address}"));
  });
});
