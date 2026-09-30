import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("o carro que deixa de estar à venda ganha URL nova", () => {
    const base = versaoDaPreviaDaFicha(carro());
    expect(versaoDaPreviaDaFicha(carro(), "VENDIDO")).not.toBe(base);
    expect(versaoDaPreviaDaFicha(carro(), "INDISPONÍVEL")).not.toBe(versaoDaPreviaDaFicha(carro(), "VENDIDO"));
    expect(previaDaFicha(carro(), "VENDIDO").url).toContain(`?v=${versaoDaPreviaDaFicha(carro(), "VENDIDO")}`);
  });

  it("id fora da régua não ganha a peça", () => {
    expect(previaDaFicha(carro({ id: "0845" })).url.startsWith("/og/foto?")).toBe(true);
    expect(previaDaFicha(carro({ id: "1234567890" })).url.startsWith("/og/foto?")).toBe(true);
  });

  it("a ficha usa a prévia montada, com o selo de quem não está à venda", () => {
    const pdp = lerCodigo("src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx");
    expect(pdp).toContain("const previa = previaDaFicha(veiculo, publicacao.indisponivel ? publicacao.rotulo : null);");
    expect(pdp).toContain("imagemPreferida: previa.url");
  });
});

describe("a rota /og/ficha/[id]", () => {
  const estado = vi.hoisted(() => ({
    veiculo: null as unknown,
    fotoOk: true,
    publicacao: { indisponivel: false, rotulo: null, noindex: false, arquivar: false } as {
      indisponivel: boolean;
      rotulo: "VENDIDO" | "INDISPONÍVEL" | null;
      noindex: boolean;
      arquivar: boolean;
    },
    fontes: null as unknown,
  }));

  vi.mock("../src/lib/supabase", () => ({
    getVeiculoById: async () => estado.veiculo,
  }));
  vi.mock("../src/lib/publicacaoDaFicha", () => ({
    publicacaoDoVeiculo: async () => estado.publicacao,
  }));
  vi.mock("../src/lib/settings", () => ({
    getCachedSettings: async () => ({ companySettings: { name: "Motors Store" } }),
  }));
  // Sem rede no teste: a fonte cai na padrão, como a rota já prevê.
  vi.mock("../src/app/og/recursos", async (original) => ({
    ...(await original<Record<string, unknown>>()),
    carregarArchivo: async () => estado.fontes,
  }));

  const fetchOriginal = globalThis.fetch;
  beforeEach(async () => {
    estado.veiculo = carro();
    estado.fotoOk = true;
    estado.publicacao = { indisponivel: false, rotulo: null, noindex: false, arquivar: false };
    // A fonte que o próprio `next/og` embute faz as vezes da Archivo: sem
    // rede no teste, e a rota só precisa saber que a fonte chegou.
    const geist = readFileSync(join(__dirname, "../node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"));
    estado.fontes = [{ name: "Archivo", data: geist.buffer.slice(geist.byteOffset, geist.byteOffset + geist.byteLength), weight: 600 }];
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

  it("sem a fonte (rede fora), a peça sai, mas fica só cinco minutos na borda", async () => {
    estado.fontes = null;
    const r = await pedir("8453942", versaoDaPreviaDaFicha(carro()));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
  }, 30_000);

  it("só o endereço canônico é desenhado: parâmetro a mais e zero à esquerda vão para ele", async () => {
    const certo = `https://www.motorsstore.com.br/og/ficha/8453942?v=${versaoDaPreviaDaFicha(carro())}`;
    const { GET } = await import("../src/app/og/ficha/[id]/route");
    const extra = await GET(new Request(`${certo}&x=1`), { params: Promise.resolve({ id: "8453942" }) });
    expect(extra.status).toBe(302);
    expect(extra.headers.get("location")).toBe(certo);
    expect(extra.headers.get("cache-control")).toBeNull();
    const zeros = await pedir("0008453942", versaoDaPreviaDaFicha(carro()));
    expect(zeros.headers.get("location")).toBe("https://www.motorsstore.com.br/og");
    // Além da faixa do INTEGER: nem chega ao banco.
    const grande = await pedir("99999999999", "x");
    expect(grande.headers.get("location")).toBe("https://www.motorsstore.com.br/og");
    expect(globalThis.fetch).not.toHaveBeenCalledWith(FOTO, expect.anything());
  });

  it("carro arquivado não ganha peça; o vendido na carência ganha, com o selo na URL", async () => {
    estado.publicacao = { indisponivel: true, rotulo: "VENDIDO", noindex: true, arquivar: true };
    expect((await pedir("8453942", "x")).headers.get("location")).toBe("https://www.motorsstore.com.br/og");

    estado.publicacao = { indisponivel: true, rotulo: "VENDIDO", noindex: true, arquivar: false };
    const semSelo = await pedir("8453942", versaoDaPreviaDaFicha(carro()));
    expect(semSelo.headers.get("location")).toContain(`?v=${versaoDaPreviaDaFicha(carro(), "VENDIDO")}`);
    const comSelo = await pedir("8453942", versaoDaPreviaDaFicha(carro(), "VENDIDO"));
    expect(comSelo.status).toBe(200);
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
    // Nada da query vira texto na peça: a URL só é comparada com a canônica.
    expect(rota).not.toMatch(/searchParams/);
    expect(rota).toContain("`${pedido.pathname}${pedido.search}` !== canonico");
    expect(rota).not.toMatch(/preco|price|R\$/i);
  });
});
