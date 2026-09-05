import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import { PERFIL_NO_GOOGLE } from "../src/lib/schemaLoja";

/**
 * O rodapé, renderizado de verdade.
 *
 * Nasceu de um achado da revisão de 2026-09-04. As guardas do rodapé eram
 * todas de fonte, e cobriam o VALOR do `href` sem cobrir o CAMINHO até ele:
 * trocar `item.href ? (` por `item.href && item.contato ? (` deixava só
 * telefone e WhatsApp como `<Link>`; os seis links institucionais, o Instagram
 * e o endereço com o Perfil da Empresa viravam `<span>`. O rodapé inteiro
 * deixava de ser navegável, e os 1867 testes continuavam verdes porque o
 * `<Link href={item.href}>` seguia intacto no arquivo — a mutação mexia no
 * portão, não no link.
 *
 * Eu tinha descartado renderizar por causa do `ThemeProvider`, que tem 707
 * linhas e busca settings por efeito. A revisão apontou o caminho barato: o
 * componente só consome `useTheme()`, e um `vi.mock` do módulo resolve. O
 * `ThemeProvider` inteiro nunca é carregado.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ companySettings: EMPRESA }),
}));

// `trackContactClick` só roda no clique, mas o módulo toca `window` ao ser
// importado em alguns caminhos. O rodapé não é o lugar de testar telemetria.
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));

async function rodape(): Promise<string> {
  const { default: Footer } = await import("../src/components/Footer");
  return renderToStaticMarkup(createElement(Footer, {}));
}

/** Os `href` de fato renderizados como âncora. */
async function ancoras(): Promise<string[]> {
  const html = await rodape();
  return [...html.matchAll(/<a[^>]*href="([^"]*)"/g)].map((m) => m[1]);
}

describe("o rodapé entrega links, não parágrafos", () => {
  it("todo item com destino vira âncora — não só os de contato", () => {
    // A mutação que passava: `item.href && item.contato ? (`. Seis links
    // institucionais, o Instagram e o endereço viravam texto.
    return ancoras().then((hrefs) => {
      for (const destino of [
        "/sobre",
        "/carro-perfeito",
        "/avaliacao",
        "/financiamento",
        "/garantia",
        "/privacidade",
      ]) {
        expect(hrefs).toContain(destino);
      }
    });
  });

  it("o endereço abre o Perfil da Empresa no Google", async () => {
    expect(await ancoras()).toContain(PERFIL_NO_GOOGLE);
  });

  it("nenhuma âncora aponta para `#` ou para lugar nenhum", async () => {
    const hrefs = await ancoras();
    expect(hrefs.length).toBeGreaterThan(8);
    for (const href of hrefs) {
      expect(href).not.toBe("#");
      expect(href).not.toBe("");
    }
  });

  it("o telefone e o WhatsApp saem discáveis, com o número canônico", async () => {
    const hrefs = await ancoras();
    // `tel:` sai do campo `phone` sem o país — comportamento anterior a esta
    // entrega, registrado aqui porque agora está medido em vez de suposto.
    expect(hrefs).toContain("tel:41997372165");
    expect(hrefs).toContain("https://wa.me/5541997372165");
  });

  it("são onze âncoras, e nenhuma se perdeu no caminho", async () => {
    // SETE institucionais + telefone + WhatsApp + endereço + Instagram. O
    // número exato é a trava: um item que deixa de virar link some daqui.
    //
    // Eram seis institucionais até 2026-09-05, quando `/contato` entrou na
    // coluna. A página existia, estava no sitemap e recebia UM link em todo o
    // site — de `/sobre`.
    expect(await ancoras()).toHaveLength(11);
  });

  it("o contato está entre os institucionais", async () => {
    expect(await ancoras()).toContain("/contato");
  });

  it("o link do endereço se anuncia para quem não vê a coluna", async () => {
    const html = await rodape();

    // Amarrado à âncora CERTA, não a "existe um aria-label com Google Maps em
    // algum lugar do rodapé": mover o rótulo para outro elemento passaria.
    const ancora = html.match(
      new RegExp(`<a[^>]*href="${PERFIL_NO_GOOGLE.replace(/[?]/g, "\\?")}"[^>]*>`),
    );
    expect(ancora).not.toBeNull();
    expect(ancora?.[0]).toMatch(/aria-label="[^"]*Google Maps[^"]*"/);
    // WCAG 2.5.3: o nome acessível precisa conter o texto visível.
    expect(ancora?.[0]).toContain("Rua Ernesto Piazzetta");
  });

  it("o Instagram é o décimo link, e é o Instagram", async () => {
    // A contagem sozinha não o distingue: trocá-lo pelo Facebook passava.
    expect(await ancoras()).toContain(EMPRESA.instagram);
  });
});
