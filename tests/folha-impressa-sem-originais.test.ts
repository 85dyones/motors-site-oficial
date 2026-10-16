// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FichaImpressa from "../src/components/modernist/FichaImpressa";
import { acordarFotosDaFolha, prepararFotosParaImpressao, SELETOR_DAS_FOTOS_DA_FOLHA } from "../src/lib/imprimirFicha";
import { lerCodigo } from "./fonte";
import type { CompanySettings, Veiculo } from "../src/types";

/**
 * A folha de impressão não baixa os originais na tela — 16/10/2026.
 *
 * Medido na produção: a ficha mandava quatro `<img>` crus apontando para o
 * `_O_` do carro57 (1920 px, ~430 KB cada) dentro da folha escondida, mais
 * quatro `<link rel="preload">` que o React emite para toda `<img>` que não
 * é preguiçosa. 1,6 MB por visita, na página onde os anúncios aterrissam,
 * para um papel que quase ninguém pede.
 */

const foto = (n: number, token = "O") => `https://s3.carro57.com.br/FC/9037/8171616_${n}_${token}_14126e9e3b.jpeg`;

const VEICULO = {
  id: "8171616",
  marca: "Fiat",
  modelo: "Titano",
  versao: "Volcano 2.2 16V 4x4",
  ano: 2025,
  quilometragem: 42000,
  cambio: "Automático",
  combustivel: "Diesel",
  cor: "Vermelho",
  tipo: "Picape",
  fipe: "",
  preco_original: 184900,
  preco_promocional: 170900,
  pericia: "PERÍCIA APROVADA",
  whatsapp_images: [foto(1), foto(2), foto(3), foto(4), foto(5)],
  web_full_images: [],
  opcionais: "",
  laudo_pericia: "",
} as unknown as Veiculo;

const EMPRESA = {
  name: "Motors Store",
  phone: "(41) 99737-2165",
  whatsapp: "(41) 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 — Bacacheri, Curitiba/PR",
  hours: "Seg a Sex 08h30 às 18h30",
  instagram: "",
  facebook: "",
  cnpj: "51.007.666/0001-02",
} as unknown as CompanySettings;

function folha(fotos: string[]) {
  return renderToStaticMarkup(
    createElement(FichaImpressa, {
      veiculo: VEICULO,
      empresa: EMPRESA,
      fotos,
      qr: null,
      modeloExibido: "Titano",
      versaoExibida: "Volcano 2.2 16V 4x4",
      codigo: "8171616",
    }),
  );
}

describe("as fotos da folha", () => {
  const html = folha(VEICULO.whatsapp_images);
  const imgs = html.match(/<img\b[^>]*>/g) ?? [];

  it("são quatro: a capa e três miniaturas", () => {
    expect(imgs).toHaveLength(4);
  });

  it("nenhuma aponta para o original `_O_`: a capa é a `_W_`, as miniaturas a `_G_`", () => {
    expect(html).not.toContain("_O_");
    expect(imgs[0]).toContain("_W_");
    for (const mini of imgs.slice(1)) expect(mini).toContain("_G_");
  });

  it("todas são preguiçosas: escondidas, não são baixadas", () => {
    for (const img of imgs) {
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('decoding="async"');
    }
  });

  it("a foto nossa vai pela versão `web` gravada no envio, não pela `zap`", () => {
    const zap = "https://zwbqmzgnagfeqinqkolp.supabase.co/storage/v1/object/public/veiculos/8171616/abc-zap.jpg";
    const html = folha([zap]);
    expect(html).toContain("abc-web.webp");
    expect(html).not.toContain("abc-zap.jpg");
  });
});

describe("na hora de imprimir, as fotos acordam", () => {
  const montar = () => {
    document.body.innerHTML = `<section id="ficha-impressa"><img loading="lazy" src="a.jpg"><img loading="lazy" src="b.jpg"></section><img loading="lazy" src="fora.jpg">`;
    return Array.from(document.querySelectorAll<HTMLImageElement>("img"));
  };

  it("só as da folha viram `eager`; a do resto da página fica como está", () => {
    const [a, b, fora] = montar();
    const acordadas = acordarFotosDaFolha(document);
    expect(acordadas).toHaveLength(2);
    expect(a.getAttribute("loading")).toBe("eager");
    expect(b.getAttribute("loading")).toBe("eager");
    expect(fora.getAttribute("loading")).toBe("lazy");
    expect(document.querySelectorAll(SELETOR_DAS_FOTOS_DA_FOLHA)).toHaveLength(0);
  });

  it("espera a decodificação, com prazo — uma foto que falha não prende a impressão", async () => {
    const [a] = montar();
    Object.defineProperty(a, "complete", { value: false, configurable: true });
    (a as unknown as { decode: () => Promise<void> }).decode = vi.fn(() => Promise.reject(new Error("falhou")));
    await expect(prepararFotosParaImpressao(document, 50)).resolves.toBeUndefined();
  });

  it("o botão da ficha passa por `imprimirFicha`, e não chama `window.print` direto", () => {
    const fonte = lerCodigo("src/components/ficha/CompartilharFicha.tsx");
    expect(fonte).toContain("imprimirFicha()");
    expect(fonte).not.toMatch(/onClick=\{\(\) => window\.print\(\)\}/);
  });

  it("o Ctrl+P cai no `beforeprint`, que a folha escuta", () => {
    const fonte = lerCodigo("src/components/modernist/FichaImpressa.tsx");
    expect(fonte).toContain('addEventListener("beforeprint"');
  });
});
