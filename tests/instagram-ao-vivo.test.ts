import { describe, it, expect } from "vitest";
import { montarPublicacoes, PUBLICACOES_AO_VIVO } from "../src/lib/instagramAoVivo";
import { lerCodigo } from "./fonte";

/**
 * A faixa do Instagram automática (30/09/2026): o que entra na grade a partir
 * da resposta da Graph API, e a ordem das fontes na home.
 */

const img = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  media_type: "IMAGE",
  media_product_type: "FEED",
  media_url: `https://cdn.exemplo/${id}.jpg`,
  permalink: `https://www.instagram.com/p/${id}/`,
  ...extra,
});

describe("montarPublicacoes", () => {
  it("Reels entram pela capa, não pelo mp4", () => {
    const [p] = montarPublicacoes({
      data: [img("r1", { media_type: "VIDEO", media_product_type: "REELS", media_url: "https://cdn/r1.mp4", thumbnail_url: "https://cdn/r1.jpg" })],
    });
    expect(p.imagemUrl).toBe("https://cdn/r1.jpg");
  });

  it("carrossel entra pela primeira foto", () => {
    const [p] = montarPublicacoes({ data: [img("c1", { media_type: "CAROUSEL_ALBUM" })] });
    expect(p.imagemUrl).toBe("https://cdn.exemplo/c1.jpg");
  });

  it("nunca leva a legenda para o site", () => {
    const [p] = montarPublicacoes({ data: [img("a", { caption: "Parcelas de apenas R$ 890! Rua Canadá, 1250" })] });
    expect(p.legenda).toBeNull();
  });

  it("descarta story, vídeo sem capa, item sem link e endereço que não é https", () => {
    const lista = montarPublicacoes({
      data: [
        img("s", { media_product_type: "STORY" }),
        img("v", { media_type: "VIDEO", thumbnail_url: undefined }),
        img("l", { permalink: undefined }),
        img("h", { media_url: "http://cdn/h.jpg" }),
        img("ok"),
      ],
    });
    expect(lista.map((p) => p.id)).toEqual(["ok"]);
  });

  it("corta em seis, na ordem da API (mais recente primeiro)", () => {
    const lista = montarPublicacoes({ data: Array.from({ length: 10 }, (_, i) => img(`p${i}`)) });
    expect(lista).toHaveLength(PUBLICACOES_AO_VIVO);
    expect(lista[0].id).toBe("p0");
  });

  it("resposta sem `data` não derruba a home", () => {
    expect(montarPublicacoes(null)).toEqual([]);
    expect(montarPublicacoes({ error: { message: "x" } })).toEqual([]);
  });
});

describe("a home", () => {
  const home = lerCodigo("src/app/page.tsx");

  it("usa o Instagram ao vivo e cai na curadoria do painel quando ele não vem", () => {
    expect(home).toContain("getInstagramAoVivo()");
    expect(home).toMatch(/instagramAoVivo \?\? normalizarCuradoria\(settings\.instagramCuradoria\)/);
  });

  it("o token fica no servidor e fora da URL", () => {
    const lib = lerCodigo("src/lib/instagramAoVivo.ts");
    expect(lib).toMatch(/Authorization: `Bearer \$\{token\}`/);
    expect(lib).not.toMatch(/access_token=/);
    expect(lib).not.toMatch(/NEXT_PUBLIC_INSTAGRAM/);
  });
});
