import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";
import { lerCodigo } from "./fonte";

/**
 * Títulos sem salto de nível e rótulos que contêm o texto visível (2026-09-25).
 *
 * A auditoria axe de 25/09 no site em produção, 7 páginas × desktop e celular,
 * achou duas regras além do contraste:
 *
 *   - `heading-order` (19): o rodapé abria com `h4` depois do `h2` da página —
 *     em TODA página —; a ficha tinha `h3`, `h4` e `h5` logo abaixo do nome do
 *     carro; o /financiamento, um `h3` ("SIMULADOR") antes do `h2`. Quem navega
 *     por títulos no leitor de tela acha que perdeu uma seção.
 *   - `label-content-name-mismatch` (10): as miniaturas do hero mostram "01" e
 *     se chamavam "Ver Renault Kwid…"; o botão da galeria mostra "+12 VER
 *     GALERIA" e se chamava "Ver todas as fotos do veículo". Quem usa comando
 *     de voz diz o que vê — "clicar 01" — e nada acontece (WCAG 2.5.3).
 *
 * Depois da correção, o axe rodou limpo nas mesmas 14 execuções, contra o
 * build local. Estes testes travam o que a correção mudou: o rodapé, o
 * simulador e o hero renderizados de verdade; a ficha, que depende de dados
 * demais para renderizar aqui, pela ordem dos títulos no código.
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
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));

/** Os níveis dos títulos, na ordem em que aparecem. */
function niveis(html: string): number[] {
  return [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
}

/**
 * A regra do `heading-order`: descer de nível é sempre permitido; subir, só
 * de um em um. `antes` é o nível do último título da página antes do trecho.
 */
function saltos(lista: number[], antes: number): string[] {
  const achados: string[] = [];
  let anterior = antes;
  for (const nivel of lista) {
    if (nivel > anterior + 1) achados.push(`h${anterior} → h${nivel}`);
    anterior = nivel;
  }
  return achados;
}

/** O texto que se vê: sem tags, sem o que é só do leitor de tela. */
function textoVisivel(html: string): string {
  return html
    .replace(/<span class="sr-only">[\s\S]*?<\/span>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function veiculo(id: string, modelo: string): Veiculo {
  return {
    id,
    marca: "Renault",
    modelo,
    versao: "Zen 1.0",
    ano: 2022,
    preco_original: 58000,
    preco_promocional: 0,
    quilometragem: 30000,
    tipo: "Hatch",
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Prata",
    vendido: false,
    whatsapp_images: [],
    web_full_images: [],
  } as unknown as Veiculo;
}

describe("os títulos não pulam nível", () => {
  it("o rodapé abre com h2 — nunca pula, venha depois do que vier", async () => {
    const { default: Footer } = await import("../src/components/Footer");
    const html = renderToStaticMarkup(
      createElement(Footer, {
        navegacao: {
          marcas: [{ rotulo: "Renault", href: "/carros/renault" }],
          modelos: [{ rotulo: "Kwid", href: "/carros/renault/kwid" }],
        },
      }),
    );
    expect(niveis(html)).toEqual([2, 2]);
    // Depois de uma página que só tem o h1 — o pior caso.
    expect(saltos(niveis(html), 1)).toEqual([]);
  });

  it("no simulador, \"SIMULADOR\" é sobretítulo, e o primeiro título é o h2", async () => {
    const { default: CalculadoraFinanciamento } = await import("../src/components/CalculadoraFinanciamento");
    const html = renderToStaticMarkup(
      createElement(CalculadoraFinanciamento, {
        vehiclePrice: 58000,
        vehicleYear: 2022,
        vehicleName: "Renault Kwid",
        onSimulateClick: () => {},
      }),
    );
    expect(html).toContain("SIMULADOR");
    expect(html).not.toMatch(/<h[1-6][^>]*>\s*SIMULADOR/);
    expect(niveis(html)[0]).toBe(2);
    expect(saltos(niveis(html), 1)).toEqual([]);
  });

  it("na ficha, as seções abaixo do nome do carro não passam de h3", () => {
    // Renderizar a ficha pede estoque, fotos e tema; o que se trava aqui é a
    // ordem das tags, lida do código. O nome do carro é `HeadingTag` (h1 no
    // mobile, h2 no desktop) — por isso a conta começa em 1.
    const codigo = lerCodigo("src/components/PDPClientWrapper.tsx");
    const lista = niveis(codigo);
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.filter((n) => n >= 4)).toEqual([]);
    expect(saltos(lista, 1)).toEqual([]);
  });
});

describe("o nome acessível contém o texto visível", () => {
  it("as miniaturas do hero começam pelo número que mostram", async () => {
    const { default: HeroHome } = await import("../src/components/modernist/HeroHome");
    const html = renderToStaticMarkup(
      createElement(HeroHome, {
        slides: [veiculo("1", "Kwid"), veiculo("2", "Sandero")],
        totalEstoque: 41,
        totalMarcas: 17,
      }),
    );
    const botoes = [...html.matchAll(/<button[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)];
    expect(botoes).toHaveLength(2);
    botoes.forEach(([, rotulo, dentro], i) => {
      const visivel = textoVisivel(dentro);
      expect(visivel).toBe(String(i + 1).padStart(2, "0"));
      expect(rotulo.startsWith(visivel), `"${rotulo}" não começa por "${visivel}"`).toBe(true);
      // E continua dizendo qual carro é.
      expect(rotulo).toContain(i === 0 ? "Renault Kwid" : "Renault Sandero");
    });
  });

  it("o botão da galeria tira o nome do que está escrito, sem aria-label por cima", () => {
    const codigo = lerCodigo("src/components/PDPClientWrapper.tsx");
    const inicio = codigo.indexOf("onClick={() => abrirGaleria(0)}");
    expect(inicio).toBeGreaterThan(-1);
    const botao = codigo.slice(codigo.lastIndexOf("<button", inicio), codigo.indexOf("</button>", inicio));
    // Um `aria-label` substitui o conteúdo inteiro — e o "+N" muda com a
    // largura da tela, então nenhum rótulo fixo o conteria.
    expect(botao).not.toMatch(/aria-label=/);
    expect(botao).toContain("VER GALERIA");
    expect(botao).toMatch(/className="sr-only"[\s\S]*fotos do veículo/);
  });
});
