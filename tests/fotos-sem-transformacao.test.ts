import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { ler, semComentarios } from "./fonte";
import {
  LARGURA_DA_VERSAO_WEB,
  LARGURA_DA_VERSAO_ZAP,
  caminhoDaFoto,
  caminhoDaFotoDoRepasse,
  urlDaVersaoGravada,
  versaoWebDaFoto,
} from "../src/lib/fotosDoVeiculo";
import { LADO_DA_VARIANTE } from "../src/lib/imageProcessor";

/**
 * A foto nossa sem transformação do Supabase — 09/10/2026.
 *
 * De 29/09 a 09/10 o card e a galeria da ficha pediam cada largura ao
 * redimensionamento do Storage (`/storage/v1/render/image/…`). Ele cobra por
 * foto de ORIGEM distinta no ciclo, com 100 incluídas no Pro. Medido nos logs
 * do projeto em 09/10: 187 origens em 24 h, 174 delas da galeria. A cota do mês
 * acabava no primeiro dia.
 *
 * O envio já grava duas larguras de cada foto (`web` 1280 px, `zap` 1600 px);
 * a escada responsiva sai delas, de graça.
 */

const ORIGEM = "https://zwbqmzgnagfeqinqkolp.supabase.co";
const PUBLICO = `${ORIGEM}/storage/v1/object/public/veiculos/`;
const ZAP = `${PUBLICO}8213942/c57-e33f87fb7626-zap.jpg`;
const WEB = `${PUBLICO}8213942/c57-e33f87fb7626-web.webp`;

describe("versaoWebDaFoto", () => {
  it("a `zap` aponta para a `web` do mesmo lote", () => {
    expect(versaoWebDaFoto(ZAP)).toBe(WEB);
  });

  it("o par é o que `caminhoDaFoto` grava — no estoque e no repasse", () => {
    for (const caminho of [
      (v: "zap" | "web") => caminhoDaFoto(8213942, "mfx1k2-ab12cd", v),
      (v: "zap" | "web") => caminhoDaFotoDoRepasse("0b6f1e0a-5d0e-4c55-9a43-1f2b3c4d5e6f", "mfx1k2-ab12cd", v),
    ]) {
      expect(versaoWebDaFoto(PUBLICO + caminho("zap"))).toBe(PUBLICO + caminho("web"));
    }
  });

  it("tolera espaço nas pontas e descarta query antiga", () => {
    expect(versaoWebDaFoto(`  ${ZAP}?v=2 `)).toBe(WEB);
  });

  it("`null` para o que não é `zap` nossa", () => {
    expect(versaoWebDaFoto(WEB)).toBeNull();
    expect(versaoWebDaFoto("https://s3.carro57.com.br/FC/9037/foto-zap.jpg")).toBeNull();
    expect(versaoWebDaFoto(`${ORIGEM}/storage/v1/object/public/branding/uploads/logo-zap.jpg`)).toBeNull();
    expect(versaoWebDaFoto("")).toBeNull();
    expect(versaoWebDaFoto(null)).toBeNull();
  });
});

describe("urlDaVersaoGravada", () => {
  it("as larguras são as que o tratamento grava", () => {
    expect(LARGURA_DA_VERSAO_WEB).toBe(LADO_DA_VARIANTE.web);
    expect(LARGURA_DA_VERSAO_ZAP).toBe(LADO_DA_VARIANTE.zap);
  });

  it("até 1280 px serve a `web`; acima, a `zap`", () => {
    expect(urlDaVersaoGravada(ZAP, 256)).toBe(WEB);
    expect(urlDaVersaoGravada(ZAP, 1200)).toBe(WEB);
    expect(urlDaVersaoGravada(ZAP, LARGURA_DA_VERSAO_WEB)).toBe(WEB);
    expect(urlDaVersaoGravada(ZAP, 1920)).toBe(ZAP);
    expect(urlDaVersaoGravada(ZAP, 3840)).toBe(ZAP);
  });

  it("a `web` nunca sobe para a `zap`", () => {
    expect(urlDaVersaoGravada(WEB, 3840)).toBe(WEB);
  });

  it("foto de fora do bucket volta como veio (o carro57 segue pela Vercel)", () => {
    const carro57 = "https://s3.carro57.com.br/FC/9037/foto.jpg";
    expect(urlDaVersaoGravada(carro57, 640)).toBe(carro57);
  });

  it("nunca monta URL de transformação", () => {
    for (const largura of [16, 640, 1080, 1920, 3840]) {
      const url = urlDaVersaoGravada(ZAP, largura);
      expect(url).toContain("/storage/v1/object/public/");
      expect(url).not.toContain("?");
    }
  });
});

describe("o que chega ao HTML", () => {
  it("o card serve a `web` inteira, sem srcset — e troca a `zap` pela irmã", async () => {
    const { default: FotoPropriaDoCard } = await import("../src/components/modernist/FotoPropriaDoCard");
    for (const src of [WEB, ZAP]) {
      const html = renderToStaticMarkup(createElement(FotoPropriaDoCard, { src, alt: "x", fill: true, sizes: "33vw" }));
      expect(html).toContain(`src="${WEB}"`);
      expect(html).not.toContain("srcSet");
      expect(html).not.toContain("srcset");
    }
  });

  it("a galeria monta o srcset só com as duas versões gravadas", async () => {
    const { default: FotoDaFicha } = await import("../src/components/ficha/FotoDaFicha");
    const html = renderToStaticMarkup(createElement(FotoDaFicha, { src: ZAP, alt: "x", fill: true, sizes: "100vw" }));
    const srcset = html.match(/srcset="([^"]+)"/i)?.[1] ?? "";
    const urls = new Set(srcset.split(", ").map((c) => c.split(" ")[0]));
    expect(urls).toEqual(new Set([WEB, ZAP]));
    expect(srcset).toContain(`${WEB} 1200w`);
    expect(srcset).toContain(`${ZAP} 1920w`);
  });
});

/** Todo arquivo de código sob `src/`. */
function arquivosDe(raiz: string): string[] {
  let achados: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) achados = achados.concat(arquivosDe(caminho));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(nome)) achados.push(caminho.split(sep).join("/"));
  }
  return achados;
}

/** Os arquivos de código da raiz: `next.config.ts` e onde moraria um `loaderFile`. */
function arquivosDaRaiz(): string[] {
  return readdirSync(".").filter((nome) => /\.(ts|js|mjs|cjs)$/.test(nome) && statSync(nome).isFile());
}

describe("nenhum código do site pede transformação ao Storage", () => {
  // A trava vivia só na galeria do painel (`fotos-do-veiculo.test.ts`), e o
  // card e a ficha passaram por fora dela em 29/09. Aqui ela vale para `src/`
  // inteiro e para a raiz — o loader do Supabase que a documentação dele
  // sugere é um `loaderFile` declarado no `next.config`. Comentário pode citar
  // o endereço — é a nota explicando por que ele saiu —, código não.
  const arquivos = [...arquivosDe("src"), ...arquivosDaRaiz()];

  it("a varredura enxerga o código", () => {
    expect(arquivos).toContain("src/lib/fotosDoVeiculo.ts");
    expect(arquivos).toContain("src/components/ficha/FotoDaFicha.tsx");
    expect(arquivos).toContain("next.config.ts");
    // E lê o código, não só o nome: sem comentários, o que sobra ainda tem a
    // função. Uma leitura que apagasse tudo deixaria as travas abaixo verdes.
    expect(semComentarios(ler("src/lib/fotosDoVeiculo.ts"))).toContain("export function urlDaVersaoGravada(");
  });

  it("ninguém monta o endereço de `render/image`", () => {
    const quem = arquivos.filter((a) => semComentarios(ler(a)).includes("render/image"));
    expect(quem).toEqual([]);
  });

  it("ninguém passa `transform` ao SDK do Storage", () => {
    const quem = arquivos.filter((a) => /\btransform:\s*\{/.test(semComentarios(ler(a))));
    expect(quem).toEqual([]);
  });
});
