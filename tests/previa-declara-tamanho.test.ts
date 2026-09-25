import { describe, it, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import { GET as cardGerado } from "../src/app/og/route";
import { GET as fotoDoVeiculo } from "../src/app/og/foto/route";

/**
 * A imagem da prévia declara o próprio tamanho.
 *
 * 25/09: no WhatsApp de PC nem a home nem a ficha mostravam imagem. As duas
 * rotas respondiam em `Transfer-Encoding: chunked`, sem `Content-Length` —
 * a única diferença para a foto original do Supabase, que declara o tamanho.
 * Ver `lib/respostaDeImagem.ts`.
 */

async function jpegDeTeste() {
  return sharp({
    create: { width: 1600, height: 1067, channels: 3, background: "#a33" },
  })
    .jpeg()
    .toBuffer();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function conferirTamanho(resposta: Response, tipo: string) {
  expect(resposta.status).toBe(200);
  expect(resposta.headers.get("content-type")).toBe(tipo);
  const declarado = resposta.headers.get("content-length");
  expect(declarado, "a imagem saiu sem Content-Length").not.toBeNull();
  const corpo = await resposta.arrayBuffer();
  expect(Number(declarado)).toBe(corpo.byteLength);
  expect(corpo.byteLength).toBeGreaterThan(0);
}

describe("a prévia declara o tamanho da imagem", () => {
  it("/og/foto", async () => {
    const original = await jpegDeTeste();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(original))),
    );

    const foto = "https://s3.carro57.com.br/FC/9037/8453942_2_O_cb58bbb97c.jpeg";
    const resposta = await fotoDoVeiculo(
      new Request(`https://motorsstore.com.br/og/foto?u=${encodeURIComponent(foto)}`),
    );

    await conferirTamanho(resposta, "image/jpeg");
  });

  it("/og", async () => {
    // Sem rede: a fonte e o logo remotos caem no fallback local.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sem rede no teste");
      }),
    );

    const resposta = await cardGerado(
      new Request("https://motorsstore.com.br/og?titulo=Motors+Store"),
    );

    await conferirTamanho(resposta, "image/png");
  }, 30000);
});
