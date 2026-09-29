import { describe, it, expect } from "vitest";
import { LARGURA_DA_VERSAO_WEB, urlDaFotoNaLargura } from "../src/lib/fotosDoVeiculo";

/**
 * A capa do card na largura em que a tela a desenha — tarefa 1.9 da revisão de
 * UI de 29/09. O card servia a versão `web` inteira (1280 px, ~126 KB) num
 * espaço de 308 px; pelo redimensionamento do Storage, a 640 px são ~31 KB.
 */

const ORIGEM = "https://zwbqmzgnagfeqinqkolp.supabase.co";
const FOTO = `${ORIGEM}/storage/v1/object/public/veiculos/8213942/c57-e33f87fb7626-web.webp`;

describe("urlDaFotoNaLargura", () => {
  it("troca object por render/image e pede a largura", () => {
    expect(urlDaFotoNaLargura(FOTO, 640)).toBe(
      `${ORIGEM}/storage/v1/render/image/public/veiculos/8213942/c57-e33f87fb7626-web.webp?width=640&resize=contain&quality=75`,
    );
  });

  it("nunca pede mais que a versão gravada", () => {
    expect(urlDaFotoNaLargura(FOTO, 3840)).toContain(`width=${LARGURA_DA_VERSAO_WEB}&`);
    expect(LARGURA_DA_VERSAO_WEB).toBe(1280);
  });

  it("pede resize=contain — sem ele o Storage corta a capa num retrato", () => {
    // Medido em 29/09: `?width=640` sozinho devolvia 640×853 (altura original,
    // centro cortado). Com `contain`, 640×427, a proporção da foto.
    expect(urlDaFotoNaLargura(FOTO, 640)).toContain("resize=contain");
  });

  it("respeita a qualidade pedida e arredonda a largura", () => {
    expect(urlDaFotoNaLargura(FOTO, 639.6, 60)).toMatch(/width=640&resize=contain&quality=60$/);
  });

  it("descarta query antiga da URL guardada", () => {
    expect(urlDaFotoNaLargura(`${FOTO}?v=2`, 640)).not.toContain("v=2");
  });

  it("foto de fora do bucket volta como veio (o carro57 segue pela Vercel)", () => {
    const carro57 = "https://s3.carro57.com.br/FC/9037/foto.jpg";
    expect(urlDaFotoNaLargura(carro57, 640)).toBe(carro57);
    const outroBucket = `${ORIGEM}/storage/v1/object/public/branding/uploads/logo.webp`;
    expect(urlDaFotoNaLargura(outroBucket, 640)).toBe(outroBucket);
  });
});
