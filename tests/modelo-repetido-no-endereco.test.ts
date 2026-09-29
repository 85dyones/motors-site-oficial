import { describe, it, expect, vi } from "vitest";
import type { Veiculo } from "../src/types";

/**
 * Modelo e versão iguais no feed (29/09/2026).
 *
 * O Search Console mostrava `/carros/volkswagen/t-cross-highline-250-tsi-aut`
 * como "detectada, não indexada", e `/carros/volkswagen/t-cross` respondia 404.
 * A causa: o feed manda o nome inteiro nos dois campos, e o corte da versão
 * apagava o modelo. Agora o modelo é a primeira palavra; os endereços velhos
 * redirecionam (hub no `next.config.ts`, ficha na própria rota).
 */

const VEICULO = {
  id: "8171616",
  marca: "Fiat",
  modelo: "Titano",
  versao: "Volcano 2.2",
  ano: 2025,
  preco_original: 189900,
  preco_promocional: 0,
  quilometragem: 12000,
  tipo: "Picape",
  vendido: false,
  web_full_images: [],
  whatsapp_images: [],
} as unknown as Veiculo;

vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getVeiculoById: async () => VEICULO,
  getEstoque: async () => [VEICULO],
  getSinaisDeEstoque: async () => ({ foraDoFeed: false, ultimaPresenca: null }),
}));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: { name: "Motors Store" }, procedencia: null }),
}));
vi.mock("../src/lib/parametrosDoFinanciamento-servidor", async () => ({
  parametrosDoFinanciamento: async () => (await import("../src/lib/finance-calculator")).PARAMETROS_DE_FABRICA,
}));
vi.mock("../src/lib/hubsDeEstoque", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  recortesDoEstoque: async () => ({ historico: [VEICULO], disponiveis: [VEICULO] }),
}));
vi.mock("../src/lib/publicacao", () => ({
  getDatasDeVenda: async () => ({}),
  decidirPublicacao: () => ({ indisponivel: false, rotulo: "", noindex: false }),
}));
vi.mock("../src/components/PDPClientWrapper", () => ({ default: () => null }));
vi.mock("../src/components/modernist/FaixaProcedencia", () => ({ default: () => null }));

describe("a regra do nome repetido", () => {
  it("devolve a primeira palavra só quando modelo e versão são iguais", async () => {
    const { modeloDeNomeRepetido } = await import("../src/lib/veiculoUrl");
    expect(modeloDeNomeRepetido("T-Cross Highline 250 TSI Aut", "t-cross highline 250 tsi aut")).toBe("T-Cross");
    expect(modeloDeNomeRepetido("F-250 XLT", "F-250 XLT")).toBe("F-250");
    // Campos diferentes: o corte de sempre continua valendo.
    expect(modeloDeNomeRepetido("Ka Sedan SE 1.5 12v", "Sedan SE 1.5 12v")).toBeNull();
    // Primeira palavra sem dígito nem hífen não é nome de modelo sozinha:
    // "Novo Voyage" iria para /novo e misturaria Voyage e Polo no mesmo hub,
    // e o C-180 que o dono chamou de "Classe C" ganharia um segundo hub.
    expect(modeloDeNomeRepetido("Novo Voyage 1.0", "novo voyage 1.0")).toBeNull();
    expect(modeloDeNomeRepetido("Grand Siena 1.4", "Grand Siena 1.4")).toBeNull();
    expect(modeloDeNomeRepetido("Range Rover Evoque", "Range Rover Evoque")).toBeNull();
        // Uma palavra só: não há o que separar.
    expect(modeloDeNomeRepetido("Kwid", "Kwid")).toBeNull();
    expect(modeloDeNomeRepetido("", "")).toBeNull();
  });

  it("os casos que o dono corrigiu à mão não mudam sem o override", async () => {
    const { slugDeModelo } = await import("../src/lib/veiculoUrl");
    // Sem override, o comportamento de antes de 29/09 (nome inteiro).
    expect(slugDeModelo("Volkswagen", "Novo Voyage 1.0", "Novo Voyage 1.0")).toBe("novo-voyage-1-0");
  });

  it("os quatro veículos medidos em 29/09 ganham o endereço do modelo", async () => {
    const { getVeiculoPdpUrl } = await import("../src/lib/supabase");
    const casos: Array<[Partial<Veiculo>, string]> = [
      [{ id: "8479269", marca: "Volkswagen", modelo: "T-Cross Highline 250 TSI Aut", versao: "T-Cross Highline 250 TSI Aut", tipo: "SUV" }, "/carros/volkswagen/t-cross/highline-250-tsi-automatico-8479269"],
      [{ id: "8491439", marca: "Ford", modelo: "F-250 XLT", versao: "F-250 XLT", tipo: "Picape" }, "/carros/ford/f-250/xlt-8491439"],
      [{ id: "8497421", marca: "Mercedes-Benz", modelo: "A250 Turbo Sport", versao: "A250 Turbo Sport", tipo: "Hatch" }, "/carros/mercedes-benz/a250/turbo-sport-8497421"],
      [{ id: "8197237", marca: "Suzuki", modelo: "GSX-R 750 W SRAD", versao: "GSX-R 750 W SRAD", tipo: "Motocicleta" }, "/motos/suzuki/gsx-r/750-w-srad-8197237"],
    ];
    for (const [v, url] of casos) {
      expect(getVeiculoPdpUrl(v as Parameters<typeof getVeiculoPdpUrl>[0])).toBe(url);
    }
  });
});

describe("os endereços velhos não viram 404", () => {
  it("cada hub velho tem 301 exato para o novo", async () => {
    const { default: config } = await import("../next.config");
    const regras = await config.redirects!();
    const par = (de: string) => regras.find((r) => r.source === de);
    expect(par("/carros/volkswagen/t-cross-highline-250-tsi-aut")?.destination).toBe("/carros/volkswagen/t-cross");
    expect(par("/carros/ford/f-250-xlt")?.destination).toBe("/carros/ford/f-250");
    expect(par("/carros/mercedes-benz/a250-turbo-sport")?.destination).toBe("/carros/mercedes-benz/a250");
    expect(par("/motos/suzuki/gsx-r-750-w-srad")?.destination).toBe("/motos/suzuki/gsx-r");
    for (const de of ["/carros/volkswagen/t-cross-highline-250-tsi-aut", "/carros/ford/f-250-xlt"]) {
      expect(par(de)?.permanent).toBe(true);
    }
  });

  async function abrir(marca: string, modelo: string, ficha: string) {
    const { default: CarDetailsPage } = await import(
      "../src/app/[categoria]/[marca]/[modelo]/[ficha]/page"
    );
    return CarDetailsPage({ params: Promise.resolve({ categoria: "carros", marca, modelo, ficha }) });
  }

  it("a ficha pedida com modelo velho redireciona para o endereço canônico", async () => {
    await expect(abrir("fiat", "titano-volcano-22", "volcano-2-2-8171616")).rejects.toMatchObject({
      digest: expect.stringContaining("/carros/fiat/titano/volcano-2-2-8171616"),
    });
    await expect(abrir("FIAT", "titano", "volcano-2-2-8171616")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("a ficha pedida no endereço canônico abre, sem redirecionar", async () => {
    await expect(abrir("fiat", "titano", "volcano-2-2-8171616")).resolves.toBeTruthy();
  });
});
