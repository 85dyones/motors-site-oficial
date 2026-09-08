import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CAMPANHAS,
  campanhaPorSlug,
  campanhaEstaViva,
  campanhasVivas,
  caminhoDaCampanha,
  ehRotaDeCampanha,
  type Campanha,
} from "../src/lib/campanhas";
import { lerCodigo } from "./fonte";

function campanha(parcial: Partial<Campanha> = {}): Campanha {
  return {
    slug: "teste-2026",
    nome: "Teste",
    inicio: "2026-09-12",
    fim: "2026-09-20",
    destinoAposFim: "/estoque",
    descricao: "Uma campanha de teste.",
    fraseDoCliente: "Olá, vi sobre o Teste e quero saber as condições",
    ...parcial,
  };
}

describe("a vigência respeita o fuso de Curitiba", () => {
  /*
   * `new Date("2026-09-20")` é MEIA-NOITE UTC — 21h do dia 19 em Curitiba.
   * Comparar assim mataria a campanha 27 horas antes da hora, no meio do
   * último dia de feirão. O último dia é inclusive, e termina 23:59:59 em -03.
   */
  it("está viva na manhã do primeiro dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-12T09:00:00-03:00"))).toBe(true);
  });

  it("está viva às 23h do ÚLTIMO dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-20T23:00:00-03:00"))).toBe(true);
  });

  it("morreu na madrugada seguinte ao último dia", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-21T00:30:00-03:00"))).toBe(false);
  });

  it("ainda não vive na véspera", () => {
    expect(campanhaEstaViva(campanha(), new Date("2026-09-11T23:00:00-03:00"))).toBe(false);
  });
});

describe("o caminho e a resolução", () => {
  it("o caminho é a raiz mais o slug — sem prefixo de pasta", () => {
    expect(caminhoDaCampanha(campanha({ slug: "pole-position-2026" }))).toBe("/pole-position-2026");
  });

  it("reconhece rota de campanha pelo pathname", () => {
    for (const c of CAMPANHAS) {
      expect(ehRotaDeCampanha(caminhoDaCampanha(c))).toBe(true);
    }
    expect(ehRotaDeCampanha("/estoque")).toBe(false);
    expect(ehRotaDeCampanha("/")).toBe(false);
    expect(ehRotaDeCampanha(null)).toBe(false);
  });

  it("campanhasVivas devolve só as vigentes na data dada", () => {
    const instante = new Date("2026-09-15T12:00:00-03:00");
    for (const c of campanhasVivas(instante)) {
      expect(campanhaEstaViva(c, instante)).toBe(true);
    }
  });
});

describe("o registro se mantém honesto", () => {
  it("todo campo obrigatório está preenchido, e fim vem depois de inicio", () => {
    for (const c of CAMPANHAS) {
      expect(c.slug.trim()).not.toBe("");
      expect(c.nome.trim()).not.toBe("");
      expect(c.descricao.trim()).not.toBe("");
      expect(c.fraseDoCliente.trim()).not.toBe("");
      expect(c.destinoAposFim.startsWith("/")).toBe(true);
      expect(new Date(c.fim).getTime()).toBeGreaterThanOrEqual(new Date(c.inicio).getTime());
    }
  });

  it("nenhum slug se repete — o 308 fica em cache eterno no navegador", () => {
    const slugs = CAMPANHAS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("o slug carrega o ano, e por isso nunca se reusa", () => {
    for (const c of CAMPANHAS) {
      expect(c.slug).toMatch(/-20\d{2}$/);
    }
  });

  /*
   * A AMARRA. Pasta em (campanha)/ que não estiver no registro nasce sem
   * sitemap, sem card de compartilhamento e sem plano de morte — e nada disso
   * quebra a tela, então só um teste pega.
   *
   * Caminhos montados com path.join: comparar com endsWith("/algo") falha no
   * Windows e deixa a asserção verde sem nunca casar.
   */
  it("toda pasta em (campanha)/ está no registro", () => {
    const raiz = path.join(process.cwd(), "src", "app", "(campanha)");
    if (!fs.existsSync(raiz)) return;
    const pastas = fs
      .readdirSync(raiz, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const pasta of pastas) {
      expect(campanhaPorSlug(pasta), `a pasta ${pasta} não está em CAMPANHAS`).toBeDefined();
    }
  });

  it("toda campanha do registro tem pasta", () => {
    const raiz = path.join(process.cwd(), "src", "app", "(campanha)");
    for (const c of CAMPANHAS) {
      expect(fs.existsSync(path.join(raiz, c.slug)), `falta a pasta de ${c.slug}`).toBe(true);
    }
  });
});

describe("a moldura sabe o que é campanha", () => {
  it("MolduraDoSite consulta o registro", () => {
    expect(lerCodigo("src/components/MolduraDoSite.tsx")).toMatch(/ehRotaDeCampanha/);
  });

  /*
   * O aviso de cookies NÃO some junto com o header. Antes desta mudança os
   * quatro (header, rodapé, popup e cookies) saíam no mesmo pacote; numa LP
   * pública isso é perda de conformidade, não de estilo.
   */
  it("o aviso de cookies sai do pacote da moldura no layout raiz", () => {
    const layout = lerCodigo("src/app/layout.tsx");
    expect(layout).toMatch(/AvisoLegalDoSite/);
    expect(layout).toMatch(
      /<AvisoLegalDoSite>[\s\S]*?<CookieConsentBanner \/>[\s\S]*?<\/AvisoLegalDoSite>/,
    );
  });
});
