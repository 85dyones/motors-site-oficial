// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EXTENSAO_DA_VARIANTE,
  LARGURA_DA_VERSAO_CARD,
  LARGURA_DA_VERSAO_WEB,
  versaoCardDaFoto,
  versaoWebDaFoto,
} from "../src/lib/fotosDoVeiculo";
import { LADO_DA_VARIANTE, MIME_DA_VARIANTE, QUALIDADE_DA_VARIANTE } from "../src/lib/imageProcessor";
import { LADO_DO_CARD } from "../src/lib/fotosDoCarro57";
import { ler, lerCodigo } from "./fonte";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A versão `card` da foto nossa — 16/10/2026.
 *
 * O card baixava a `web` de 1280 px inteira (~90 a 200 KB; medido na home
 * em 16/10: 200 KB, a maior imagem da página). A foto do carro57 já sai pela
 * `_G_` de 640 px; a `card` é a mesma medida para a foto nossa, gravada no
 * envio — sem transformação de ninguém (decisão de 09/10).
 */

const ORIGEM = "https://zwbqmzgnagfeqinqkolp.supabase.co/storage/v1/object/public/veiculos";
const ZAP = `${ORIGEM}/8171616/m1abc-x9y8z7-zap.jpg`;
const WEB = `${ORIGEM}/8171616/m1abc-x9y8z7-web.webp`;
const CARD = `${ORIGEM}/8171616/m1abc-x9y8z7-card.webp`;

describe("a terceira versão, no mesmo desenho das outras duas", () => {
  it("640 px, WebP, abaixo da web e igual ao teto do card do carro57", () => {
    expect(LADO_DA_VARIANTE.card).toBe(640);
    expect(LADO_DA_VARIANTE.card).toBe(LADO_DO_CARD);
    expect(LADO_DA_VARIANTE.card).toBeLessThan(LADO_DA_VARIANTE.web);
    expect(LARGURA_DA_VERSAO_CARD).toBe(LADO_DA_VARIANTE.card);
    expect(LARGURA_DA_VERSAO_WEB).toBe(LADO_DA_VARIANTE.web);
    expect(MIME_DA_VARIANTE.card).toBe("image/webp");
    expect(EXTENSAO_DA_VARIANTE.card).toBe("webp");
    expect(QUALIDADE_DA_VARIANTE.card).toBeGreaterThan(0.7);
  });

  it("o processador gera as três no envio", () => {
    const fonte = lerCodigo("src/lib/imageProcessor.ts");
    expect(fonte).toContain('["web", "zap", "card"] as const');
  });

  it("sai do nome, a partir da zap ou da web", () => {
    expect(versaoCardDaFoto(ZAP)).toBe(CARD);
    expect(versaoCardDaFoto(WEB)).toBe(CARD);
    expect(versaoCardDaFoto(`  ${WEB}?v=1 `)).toBe(CARD);
  });

  it("`null` para o que não é foto nossa com par", () => {
    expect(versaoCardDaFoto("https://s3.carro57.com.br/FC/9037/8171616_23_W_14126e9e3b.jpeg")).toBeNull();
    expect(versaoCardDaFoto(`${ORIGEM}/8171616/solta.jpg`)).toBeNull();
    expect(versaoCardDaFoto(CARD)).toBeNull();
    expect(versaoCardDaFoto("")).toBeNull();
    expect(versaoCardDaFoto(null)).toBeNull();
  });

  it("a galeria da ficha continua no par web/zap — a card é só do card", () => {
    expect(versaoWebDaFoto(ZAP)).toBe(WEB);
    const ficha = lerCodigo("src/components/ficha/FotoDaFicha.tsx");
    expect(ficha).not.toContain("versaoCardDaFoto");
  });
});

describe("FotoPropriaDoCard pede a card e cai na web", () => {
  let palco: HTMLDivElement | null = null;
  let raiz: Root | null = null;
  async function montar(props: Record<string, unknown>) {
    const { default: FotoPropriaDoCard } = await import("../src/components/modernist/FotoPropriaDoCard");
    palco = document.createElement("div");
    document.body.appendChild(palco);
    raiz = createRoot(palco);
    await act(async () => raiz!.render(createElement(FotoPropriaDoCard, { alt: "x", fill: true, ...props } as never)));
    return palco.querySelector("img")!;
  }
  const falhar = async (img: HTMLImageElement) => {
    await act(async () => {
      img.dispatchEvent(new Event("error"));
    });
  };

  it("o HTML do servidor já aponta para a card", async () => {
    const { default: FotoPropriaDoCard } = await import("../src/components/modernist/FotoPropriaDoCard");
    const html = renderToStaticMarkup(createElement(FotoPropriaDoCard, { src: ZAP, alt: "x", fill: true }));
    expect(html).toContain("m1abc-x9y8z7-card.webp");
    expect(html).not.toContain("/_next/image");
  });

  it("card que não existe (404) vira a web, sem avisar quem usa", async () => {
    const aoFalhar = vi.fn();
    const img = await montar({ src: ZAP, onError: aoFalhar });
    expect(img.getAttribute("src")).toBe(CARD);
    await falhar(img);
    expect(palco!.querySelector("img")!.getAttribute("src")).toBe(WEB);
    expect(aoFalhar).not.toHaveBeenCalled();
  });

  it("se a web também falhar, aí sim quem usa fica sabendo", async () => {
    const aoFalhar = vi.fn();
    const img = await montar({ src: WEB, onError: aoFalhar });
    await falhar(img);
    await falhar(palco!.querySelector("img")!);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
  });

  it("foto nossa sem par (sem `-zap`/`-web` no nome) vai como veio", async () => {
    const solta = `${ORIGEM}/8171616/solta.jpg`;
    const img = await montar({ src: solta });
    expect(img.getAttribute("src")).toBe(solta);
  });
});

describe("quem grava e quem apaga", () => {
  it("o painel sobe a card por último, sem derrubar a foto se ela falhar, e a apaga junto", () => {
    const galeria = lerCodigo("src/components/admin/GaleriaDeFotos.tsx");
    expect(galeria).toContain('card: alvo.caminho(lote, "card")');
    expect(galeria).toMatch(/upload\(caminhos\.card, versoes\.card, \{[\s\S]*?cacheControl: "31536000"/);
    expect(galeria).toMatch(/if \(error\) console\.warn\("\[Fotos\] a versão card não subiu/);
    expect(galeria).toContain("caminhoDaUrlPublica(versaoCardDaFoto(f.web))");
  });

  it("os cards do repasse usam o mesmo componente para a foto nossa", () => {
    for (const arquivo of ["src/components/repasse/CardDoRepasse.tsx", "src/components/repasse/CardDaFaixa.tsx"]) {
      const fonte = lerCodigo(arquivo);
      expect(fonte).toContain("<FotoPropriaDoCard");
      expect(fonte).not.toContain("unoptimized={ehFotoPropria(foto)}");
    }
  });

  it("o script de manutenção gera o que falta, com cache longo e sem sobrescrever", () => {
    const script = ler("supabase/manutencao/gerar-card-das-fotos.js");
    expect(script).toContain("LADO_DA_VARIANTE.card");
    expect(script).toContain('cacheControl: "31536000"');
    expect(script).toContain("upsert: false");
    expect(script).toContain('argv.includes("--gravar")');
    expect(script).not.toMatch(/render\/image|transform:\s*\{/);
  });
});
