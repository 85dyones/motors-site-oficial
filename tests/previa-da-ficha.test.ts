import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { lerCodigo } from "./fonte";
import {
  ALTURA_CARD,
  LARGURA_CARD,
  montarCompartilhamento,
  previaDaFicha,
  versaoDaPreviaDaFicha,
  type VeiculoDaPrevia,
} from "../src/lib/compartilhamento";

/**
 * A prévia da ficha no WhatsApp, montada (30/09/2026): foto, marca, modelo,
 * versão, ano, km, selo de perícia e logo. Sem preço, porque o WhatsApp
 * guarda a prévia por dias e o preço muda (ver `previaDaFicha`).
 */

const FOTO = "https://s3.carro57.com.br/FC/9037/8453942_2_O_cb58bbb97c.jpeg";

const carro = (over: Partial<VeiculoDaPrevia> = {}): VeiculoDaPrevia => ({
  id: "8453942",
  marca: "BMW",
  modelo: "X1",
  versao: "sDrive20i GP",
  ano: 2021,
  quilometragem: 45000,
  pericia: "PERÍCIA APROVADA",
  whatsapp_images: [FOTO],
  web_full_images: [],
  ...over,
});

describe("a URL da prévia", () => {
  it("foto do nosso recorte vira a peça montada, com 1200×630 declarado", () => {
    const previa = previaDaFicha(carro());
    expect(previa.url).toBe(`/og/ficha/8453942?v=${versaoDaPreviaDaFicha(carro())}`);
    expect(previa.semDimensao).toBe(false);

    const meta = montarCompartilhamento({
      empresa: null,
      pagina: "pdp",
      tituloPadrao: "BMW X1 sDrive20i GP",
      imagemPreferida: previa.url,
      imagemPreferidaSemDimensao: previa.semDimensao,
    });
    const imagem = (meta.openGraph!.images as Array<{ url: string; width?: number; height?: number }>)[0];
    expect(imagem.url.startsWith("/og/ficha/8453942?v=")).toBe(true);
    expect(imagem.width).toBe(LARGURA_CARD);
    expect(imagem.height).toBe(ALTURA_CARD);
  });

  it("foto de fora do recorte segue como antes, sem dimensão", () => {
    expect(previaDaFicha(carro({ whatsapp_images: ["https://cdn.exemplo/f.jpg"] }))).toEqual({
      url: "https://cdn.exemplo/f.jpg",
      semDimensao: true,
    });
  });

  it("a versão muda com o que a imagem mostra, e só com isso", () => {
    const base = versaoDaPreviaDaFicha(carro());
    expect(versaoDaPreviaDaFicha(carro({ quilometragem: 46000 }))).not.toBe(base);
    expect(versaoDaPreviaDaFicha(carro({ pericia: "" }))).not.toBe(base);
    expect(versaoDaPreviaDaFicha(carro({ whatsapp_images: [FOTO.replace("_2_", "_3_")] }))).not.toBe(base);
    // Preço não está na imagem: mudar o preço não pode mudar a URL.
    expect(versaoDaPreviaDaFicha({ ...carro(), preco_original: 1, preco_promocional: 2 } as VeiculoDaPrevia)).toBe(base);
  });

  it("a ficha usa a prévia montada", () => {
    const pdp = lerCodigo("src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx");
    expect(pdp).toContain("const previa = previaDaFicha(veiculo);");
    expect(pdp).toContain("imagemPreferida: previa.url");
  });
});

describe("a rota /og/ficha/[id]", () => {
  const estado = vi.hoisted(() => ({ veiculo: null as unknown, fotoOk: true }));

  vi.mock("../src/lib/supabase", () => ({
    getVeiculoById: async () => estado.veiculo,
  }));
  vi.mock("../src/lib/settings", () => ({
    getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }),
  }));
  // Sem rede no teste: a fonte cai na padrão, como a rota já prevê.
  vi.mock("../src/app/og/recursos", async (original) => ({
    ...(await original<Record<string, unknown>>()),
    carregarArchivo: async () => null,
  }));

  const fetchOriginal = globalThis.fetch;
  beforeEach(async () => {
    estado.veiculo = carro();
    estado.fotoOk = true;
    const fotoFalsa = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 90, g: 110, b: 130 } },
    })
      .jpeg()
      .toBuffer();
    // Só a foto do carro é dublê. O rasterizador do `next/og` também usa o
    // `fetch` (para os próprios arquivos wasm), e esse segue o original.
    globalThis.fetch = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) !== FOTO) return fetchOriginal(entrada, init);
      return estado.fotoOk ? new Response(new Uint8Array(fotoFalsa), { status: 200 }) : new Response("", { status: 404 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  const pedir = async (id: string, v?: string) => {
    const { GET } = await import("../src/app/og/ficha/[id]/route");
    const url = `https://www.motorsstore.com.br/og/ficha/${id}${v !== undefined ? `?v=${v}` : ""}`;
    return GET(new Request(url), { params: Promise.resolve({ id }) });
  };

  it("desenha o carro do banco: JPEG 1200×630 abaixo do teto do WhatsApp Web", async () => {
    const r = await pedir("8453942", versaoDaPreviaDaFicha(carro()));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toContain("immutable");
    const bytes = Buffer.from(await r.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect([meta.width, meta.height]).toEqual([LARGURA_CARD, ALTURA_CARD]);
    expect(bytes.length).toBeLessThan(300 * 1024);
  }, 30_000);

  it("`v` que não confere vai para a certa, sem desenhar", async () => {
    const r = await pedir("8453942", "outra");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(
      `https://www.motorsstore.com.br/og/ficha/8453942?v=${versaoDaPreviaDaFicha(carro())}`,
    );
    expect(globalThis.fetch).not.toHaveBeenCalledWith(FOTO, expect.anything());
  });

  it("id que não é número, ou carro que não existe, cai no card gerado", async () => {
    expect((await pedir("abc")).headers.get("location")).toBe("https://www.motorsstore.com.br/og");
    estado.veiculo = null;
    expect((await pedir("123", "x")).headers.get("location")).toBe("https://www.motorsstore.com.br/og");
  });

  it("foto que não baixa: vai a foto sozinha, como antes de 30/09", async () => {
    estado.fotoOk = false;
    const r = await pedir("8453942", versaoDaPreviaDaFicha(carro()));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain("/og/foto?u=");
  });

  it("a rota não aceita texto de fora e não fala de preço", () => {
    const rota = lerCodigo("src/app/og/ficha/[id]/route.tsx");
    const lidos = [...rota.matchAll(/searchParams\.get\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(lidos).toEqual(["v"]);
    expect(rota).not.toMatch(/preco|price|R\$/i);
  });
});
