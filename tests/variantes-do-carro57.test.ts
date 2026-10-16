import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  carregadorDoCarro57,
  ehFotoDoCarro57,
  LADO_DO_CARD,
  varianteDoCarro57,
  VARIANTES_DO_CARRO57,
} from "../src/lib/fotosDoCarro57";

/**
 * As variantes do RevendaMais no lugar do otimizador — 16/10/2026.
 *
 * O diagnóstico de agosto (`docs/DIAGNOSTICO_IMAGENS.md`, "A descoberta que
 * decide") mediu que o S3 do carro57 já serve a escada responsiva inteira,
 * de graça: bastava trocar o token da URL. Ficou escrito como "opção A" e
 * nunca entrou. Enquanto isso o card pagava a cota da Vercel para gerar o que
 * a `_G_` de 48 KB já é.
 */

const W = "https://s3.carro57.com.br/FC/9037/8171616_23_W_14126e9e3b.jpeg";
const O = "https://s3.carro57.com.br/FC/9037/8171616_23_O_14126e9e3b.jpeg";
const variante = (token: string) => `https://s3.carro57.com.br/FC/9037/8171616_23_${token}_14126e9e3b.jpeg`;

describe("a escada de variantes é a que o S3 serve", () => {
  it("S, M, G, W e O, do menor para o maior — e sem a P, que borra", () => {
    expect(VARIANTES_DO_CARRO57.map((v) => v.token)).toEqual(["S", "M", "G", "W", "O"]);
    for (let i = 1; i < VARIANTES_DO_CARRO57.length; i++) {
      expect(VARIANTES_DO_CARRO57[i].lado).toBeGreaterThan(VARIANTES_DO_CARRO57[i - 1].lado);
    }
  });

  it("escolhe a mais leve que ainda cobre a largura pedida", () => {
    expect(varianteDoCarro57(W, 200)).toBe(variante("S"));
    expect(varianteDoCarro57(W, 260)).toBe(variante("S"));
    expect(varianteDoCarro57(W, 384)).toBe(variante("M"));
    expect(varianteDoCarro57(W, 640)).toBe(variante("G"));
    expect(varianteDoCarro57(W, 1080)).toBe(variante("W"));
    expect(varianteDoCarro57(W, 1920)).toBe(variante("O"));
  });

  it("acima da maior, fica na maior — nunca inventa uma variante", () => {
    expect(varianteDoCarro57(W, 3840)).toBe(variante("O"));
  });

  it("o teto segura a escada: o card nunca passa da G", () => {
    const card = carregadorDoCarro57(LADO_DO_CARD);
    expect(card({ src: W, width: 1080 })).toBe(variante("G"));
    expect(card({ src: W, width: 1920 })).toBe(variante("G"));
    expect(card({ src: W, width: 384 })).toBe(variante("M"));
    expect(LADO_DO_CARD).toBe(640);
  });

  it("a W do `web_full_images` e a O do `whatsapp_images` viram o MESMO endereço", () => {
    expect(varianteDoCarro57(W, 640)).toBe(varianteDoCarro57(O, 640));
  });

  it("descarta query e espaço nas pontas", () => {
    expect(varianteDoCarro57(`  ${O}?v=2 `, 640)).toBe(variante("G"));
  });
});

describe("fora do padrão, nada muda", () => {
  it.each([
    "https://zwbqmzgnagfeqinqkolp.supabase.co/storage/v1/object/public/veiculos/1/abc-web.webp",
    "https://s3.carro57.com.br/FC/9037/foto-zap.jpg",
    "https://images.unsplash.com/photo-1",
    "",
  ])("%s volta como veio", (url) => {
    expect(ehFotoDoCarro57(url)).toBe(false);
    expect(varianteDoCarro57(url, 640)).toBe(url);
  });

  it("reconhece a foto do carro57 em qualquer variante, inclusive a P", () => {
    for (const token of ["P", "S", "M", "G", "W", "O"]) expect(ehFotoDoCarro57(variante(token))).toBe(true);
  });
});

describe("o card do carro57 sai da cota da Vercel", () => {
  it("o srcset aponta para as variantes, e nunca para /_next/image", async () => {
    const { default: FotoOtimizadaDoCard } = await import("../src/components/modernist/FotoOtimizadaDoCard");
    const html = renderToStaticMarkup(
      createElement(FotoOtimizadaDoCard, {
        src: W,
        alt: "x",
        fill: true,
        sizes: "(max-width: 640px) 100vw, 33vw",
      }),
    );
    expect(html).not.toContain("/_next/image");
    expect(html).toContain("_G_");
    expect(html).not.toContain("_W_");
    expect(html).not.toContain("_O_");
  });

  it("foto que não é do carro57 continua pelo otimizador, como sempre foi", async () => {
    const { default: FotoOtimizadaDoCard } = await import("../src/components/modernist/FotoOtimizadaDoCard");
    const html = renderToStaticMarkup(
      createElement(FotoOtimizadaDoCard, {
        src: "https://images.unsplash.com/photo-1",
        alt: "x",
        fill: true,
        sizes: "100vw",
      }),
    );
    expect(html).toContain("/_next/image");
  });
});

describe("a galeria da ficha: a capa pelo otimizador, o resto pelas variantes", () => {
  it("a capa (prioritária) segue pelo otimizador — é o LCP, e o WebP dele pesa um terço da W", async () => {
    const { default: FotoDaFicha } = await import("../src/components/ficha/FotoDaFicha");
    const html = renderToStaticMarkup(createElement(FotoDaFicha, { src: O, alt: "x", fill: true, priority: true, sizes: "100vw" }));
    expect(html).toContain("/_next/image");
  });

  it("slide, miniatura e tela cheia vão às variantes, sem cota", async () => {
    const { default: FotoDaFicha } = await import("../src/components/ficha/FotoDaFicha");
    const html = renderToStaticMarkup(
      createElement(FotoDaFicha, { src: O, alt: "x", fill: true, sizes: "(max-width: 640px) 33vw, 240px" }),
    );
    expect(html).not.toContain("/_next/image");
    expect(html).toMatch(/_[SMGW]_/);
  });
});
