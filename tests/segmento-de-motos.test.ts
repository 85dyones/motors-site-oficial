import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEGMENTOS_DE_PDP,
  segmentoDoVeiculo,
  ehCaminhoDePdp,
  ehSegmentoDePdp,
} from "../src/lib/veiculoUrl";
import { getVeiculoPdpUrl } from "../src/lib/supabase";

/**
 * P6 da `RECOMENDACAO_SEO.md` — moto deixa de morar em `/carros/`.
 *
 * Feito com 4 motocicletas no estoque, que é o momento mais barato: cada moto
 * vendida com a URL antiga indexada encarece a troca.
 *
 * O risco desta mudança não é a URL em si — é o que decidia pelo prefixo
 * `/carros/` sem ninguém lembrar: o popup de lead e a classificação de página
 * do tracking. Moto sem popup e moto fora do relatório são falhas silenciosas,
 * do tipo que aparece num número estranho meses depois.
 */

const raiz = join(__dirname, "..");
const leadPopup = readFileSync(join(raiz, "src", "components", "LeadPopup.tsx"), "utf-8");
const analytics = readFileSync(join(raiz, "src", "lib", "analytics.ts"), "utf-8");
const pdp = readFileSync(
  join(raiz, "src", "app", "[categoria]", "[marca]", "[modelo]", "[ficha]", "page.tsx"),
  "utf-8",
);

const veiculo = (tipo?: string) => ({
  id: "123",
  marca: "Honda",
  modelo: "CB 500F",
  versao: "ABS",
  tipo,
});

describe("a régua do segmento", () => {
  it("motocicleta vai para /motos, o resto para /carros", () => {
    expect(segmentoDoVeiculo({ tipo: "Motocicleta" })).toBe("motos");
    expect(segmentoDoVeiculo({ tipo: "Hatch" })).toBe("carros");
    expect(segmentoDoVeiculo({ tipo: "SUV" })).toBe("carros");
    expect(segmentoDoVeiculo({ tipo: "Picape" })).toBe("carros");
  });

  it("aceita a caixa que o feed mandar", () => {
    // O RevendaMais já mandou "MOTOCICLETA" e "motocicleta" no mesmo ciclo.
    for (const t of ["MOTOCICLETA", "motocicleta", " Motocicleta ", "Moto"]) {
      expect(segmentoDoVeiculo({ tipo: t }), t).toBe("motos");
    }
  });

  it("sem carroceria, cai em carros — o comportamento de antes", () => {
    expect(segmentoDoVeiculo({})).toBe("carros");
    expect(segmentoDoVeiculo({ tipo: null })).toBe("carros");
    expect(segmentoDoVeiculo({ tipo: "" })).toBe("carros");
  });

  it("a URL inteira acompanha o segmento", () => {
    expect(getVeiculoPdpUrl(veiculo("Motocicleta"))).toMatch(/^\/motos\//);
    expect(getVeiculoPdpUrl(veiculo("Hatch"))).toMatch(/^\/carros\//);
    // O resto do caminho não muda com o segmento.
    const moto = getVeiculoPdpUrl(veiculo("Motocicleta")).split("/").slice(2);
    const carro = getVeiculoPdpUrl(veiculo("Hatch")).split("/").slice(2);
    expect(moto).toEqual(carro);
  });
});

describe("quem decidia pelo prefixo /carros/", () => {
  it("o popup de lead reconhece as duas fichas", () => {
    expect(ehCaminhoDePdp("/carros/honda/civic/exl/honda-civic-exl-1")).toBe(true);
    expect(ehCaminhoDePdp("/motos/honda/cb-500f/abs/honda-cb-500f-abs-2")).toBe(true);
    expect(ehCaminhoDePdp("/estoque")).toBe(false);
    expect(ehCaminhoDePdp("/")).toBe(false);
    // Prefixo, não pedaço: uma futura /motospeed não é ficha de veículo.
    expect(ehCaminhoDePdp("/motospeed/a/b/c/d")).toBe(false);
  });

  it("o LeadPopup usa a régua, não o literal", () => {
    expect(leadPopup).toContain("ehCaminhoDePdp(path)");
    expect(leadPopup).not.toContain('path.startsWith("/carros/")');
  });

  it("o relatório de páginas de veículo cobre os dois segmentos", () => {
    // Um CONTAINS fixo em "/carros/" deixaria as motos fora do relatório sem
    // erro nenhum — o número simplesmente viria menor.
    expect(analytics).toContain("caminhoRegex");
    expect(analytics).not.toContain('caminhoContem: "/carros/"');
    expect(analytics).toContain("PARTIAL_REGEXP");
  });
});

describe("a rota", () => {
  it("recusa segmento que não é de veículo", () => {
    expect(ehSegmentoDePdp("carros")).toBe(true);
    expect(ehSegmentoDePdp("motos")).toBe(true);
    expect(ehSegmentoDePdp("qualquercoisa")).toBe(false);
    // A rota é dinâmica no primeiro nível; sem esta checagem ela serviria
    // qualquer caminho de cinco segmentos como ficha de veículo.
    expect(pdp).toContain("ehSegmentoDePdp(resolvedParams.categoria)");
  });

  it("segmento errado redireciona em vez de servir os dois", () => {
    // As 4 motos já estavam indexadas sob /carros/. Sem o desvio elas
    // responderiam 200 nos dois endereços — o conteúdo duplicado que a
    // mudança existe para evitar.
    expect(pdp).toContain("permanentRedirect(pdpUrl)");
    expect(pdp).toContain("segmentoDoVeiculo(veiculo)");
  });

  it("os dois segmentos são gerados estaticamente pela mesma fonte", () => {
    // `parts[1]` sai de `getVeiculoPdpUrl`, então a lista de rotas geradas
    // nunca diverge do que os links apontam.
    expect(pdp).toContain("categoria: parts[1]");
  });

  it("a lista de segmentos tem um dono só", () => {
    expect(SEGMENTOS_DE_PDP).toEqual(["carros", "motos"]);
  });
});
