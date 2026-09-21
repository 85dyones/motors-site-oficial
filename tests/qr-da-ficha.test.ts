import { describe, it, expect } from "vitest";
import qrcode from "qrcode-generator";
import { qrDaFicha } from "../src/lib/qrDaFicha";

/**
 * O QR da ficha impressa erra em silêncio.
 *
 * Um código mal formado não quebra build, não quebra tipo e não quebra
 * render: ele desenha um quadrado preto e branco de aparência perfeita que
 * simplesmente não lê no celular — e só se descobre com a folha na mão, no
 * balcão. Por isso a conferência aqui é aritmética, não visual.
 *
 * O ponto de risco é a fusão horizontal: `qrDaFicha` junta módulos escuros
 * vizinhos num comando só do `<path>` para encurtar o traçado. Se a fusão
 * errar um módulo de borda, o código continua bonito e para de ler.
 */

const URL_DA_FICHA =
  "https://motors-site-oficial.vercel.app/carros/fiat/titano/volcano-2-2-16v-4x4-turbo-diesel-automatico-8171616";

const ZONA_DE_SILENCIO = 4;

/** Remonta a matriz a partir do traçado que o componente vai desenhar. */
function matrizDoTracado(d: string, lado: number): boolean[][] {
  const matriz = Array.from({ length: lado }, () => new Array<boolean>(lado).fill(false));
  for (const [, x, y, largura] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(largura); i++) matriz[Number(y)][Number(x) + i] = true;
  }
  return matriz;
}

describe("o QR da ficha impressa", () => {
  it("devolve `null` quando não há endereço para apontar", () => {
    expect(qrDaFicha("")).toBeNull();
    expect(qrDaFicha("   ")).toBeNull();
  });

  it("o traçado remonta a mesma matriz que o codificador produziu", () => {
    const qr = qrDaFicha(URL_DA_FICHA);
    expect(qr).not.toBeNull();

    // O mesmo texto pelo codificador cru, para comparar módulo a módulo.
    const referencia = qrcode(0, "M");
    referencia.addData(URL_DA_FICHA);
    referencia.make();
    const modulos = referencia.getModuleCount();

    expect(qr!.lado).toBe(modulos + ZONA_DE_SILENCIO * 2);

    const remontada = matrizDoTracado(qr!.d, qr!.lado);
    const divergencias: string[] = [];
    for (let linha = 0; linha < modulos; linha++) {
      for (let coluna = 0; coluna < modulos; coluna++) {
        const esperado = referencia.isDark(linha, coluna);
        const obtido = remontada[linha + ZONA_DE_SILENCIO][coluna + ZONA_DE_SILENCIO];
        if (esperado !== obtido) divergencias.push(`${linha},${coluna}`);
      }
    }
    expect(divergencias).toEqual([]);
  });

  it("a zona de silêncio fica limpa — sem ela o leitor não acha a borda", () => {
    const qr = qrDaFicha(URL_DA_FICHA)!;
    const matriz = matrizDoTracado(qr.d, qr.lado);
    const modulos = qr.lado - ZONA_DE_SILENCIO * 2;

    const sujeira: string[] = [];
    for (let y = 0; y < qr.lado; y++) {
      for (let x = 0; x < qr.lado; x++) {
        const dentro =
          y >= ZONA_DE_SILENCIO &&
          y < ZONA_DE_SILENCIO + modulos &&
          x >= ZONA_DE_SILENCIO &&
          x < ZONA_DE_SILENCIO + modulos;
        if (!dentro && matriz[y][x]) sujeira.push(`${y},${x}`);
      }
    }
    expect(sujeira).toEqual([]);
  });

  it("endereços diferentes dão traçados diferentes", () => {
    // Trava contra o pior defeito possível: um QR que desenha sempre o mesmo
    // código e manda todo mundo para o mesmo carro.
    const a = qrDaFicha(URL_DA_FICHA)!;
    const b = qrDaFicha(URL_DA_FICHA.replace("8171616", "7947766"))!;
    expect(a.d).not.toBe(b.d);
  });

  it("o mesmo endereço dá sempre o mesmo traçado", () => {
    expect(qrDaFicha(URL_DA_FICHA)!.d).toBe(qrDaFicha(URL_DA_FICHA)!.d);
  });

  it("o traçado só tem comandos que o `<path>` entende", () => {
    const qr = qrDaFicha(URL_DA_FICHA)!;
    expect(qr.d.length).toBeGreaterThan(0);
    expect(qr.d.replace(/M\d+ \d+h\d+v1h-\d+z/g, "")).toBe("");
  });
});
