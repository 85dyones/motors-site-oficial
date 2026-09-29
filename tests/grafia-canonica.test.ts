import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { grafiaDaMarca, grafiaDaVersao, grafiaDoModelo, grafiaDoToken } from "../src/lib/grafiaCanonica";
import { getVeiculoPdpUrl, mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { slugDeMarca, slugDeModelo, slugificar } from "../src/lib/veiculoUrl";
import { rotuloDoModelo, rotuloLimpo } from "../src/lib/hubsDeEstoque";

/**
 * A grafia canônica de marca, modelo e versão (2026-09-21).
 *
 * Duas famílias de trava, e a segunda é a que importa:
 *
 *   1. o nome sai certo — "HB20", "Citroën", "CB 300F", "TSI", "12V";
 *   2. NENHUMA URL muda. Marca, modelo e versão também montam o endereço da
 *      ficha e do hub. A regra de `grafiaCanonica.ts` é "só a caixa muda" —
 *      mais espaço → hífen nos nomes que a marca hifeniza ("T-Cross"), que o
 *      `slugificar` já tratava igual —, e a prova não é argumento: é o estoque
 *      REAL de 21/09 (119 linhas, à venda e vendidos, em
 *      `tests/fixtures/estoque-2026-09-21.json`) passando pelo gerador de URL
 *      com a grafia antiga e com a nova.
 */

type Linha = [number, string, string, string, string | null, string | null, string];
const ESTOQUE: Linha[] = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "estoque-2026-09-21.json"), "utf8"),
);

/** Minúscula, e espaço e hífen como a mesma coisa — o que `slugificar` enxerga. */
function semHifen(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, " ").trim();
}

/** O que o mapper fazia até 21/09, reproduzido aqui como referência fixa. */
function capitalizeWordsAntigo(str: string): string {
  return str
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
}
function marcaAntiga(brand: string): string {
  const b = brand.trim().toUpperCase();
  if (b === "BMW" || b === "BYD" || b === "GWM" || b === "GM") return b;
  return capitalizeWordsAntigo(brand.trim());
}

function veiculoNovo([id, marca, modelo, versao, mo, vo, tipo]: Linha) {
  return mapVeiculoDbToVeiculo({
    id, marca, modelo, versao, modelo_override: mo, versao_override: vo, tipo,
    preco: 50000, ano: 2020, quilometragem: 1,
  });
}
function veiculoAntigo([id, marca, modelo, versao, mo, vo, tipo]: Linha) {
  return {
    id: String(id),
    marca: marcaAntiga(marca),
    modelo: mo?.trim() || capitalizeWordsAntigo(modelo.trim()),
    versao: vo?.trim() || versao.trim(),
    tipo,
  };
}

describe("nenhuma URL muda com a grafia nova — estoque real de 21/09", () => {
  it("a amostra é o estoque inteiro, não um recorte", () => {
    expect(ESTOQUE.length).toBe(119);
  });

  it.each(ESTOQUE.map((l) => [l[0], l] as const))("ficha %s", (_id, linha) => {
    const novo = veiculoNovo(linha);
    const antigo = veiculoAntigo(linha);
    expect(getVeiculoPdpUrl(novo)).toBe(getVeiculoPdpUrl(antigo));
    expect(slugDeMarca(novo.marca)).toBe(slugDeMarca(antigo.marca));
    expect(slugDeModelo(novo.marca, novo.modelo, novo.versao)).toBe(
      slugDeModelo(antigo.marca, antigo.modelo, antigo.versao),
    );
  });

  it("o recorte do nome do hub cai no mesmo lugar — muda a grafia, não o slug", () => {
    for (const linha of ESTOQUE) {
      const n = veiculoNovo(linha);
      const a = veiculoAntigo(linha);
      const rn = rotuloLimpo(rotuloDoModelo(n.marca, n.modelo, n.versao));
      const ra = rotuloLimpo(rotuloDoModelo(a.marca, a.modelo, a.versao));
      expect(slugificar(rn), String(linha[0])).toBe(slugificar(ra));
      expect(semHifen(rn), String(linha[0])).toBe(semHifen(ra));
    }
  });

  it("T-Cross: o nome ganha o hífen, e a URL — que já tinha — não muda", () => {
    const linha = ESTOQUE.find((l) => l[0] === 8479269)!;
    const tcross = veiculoNovo(linha);
    expect(tcross.modelo).toBe("T-Cross Highline 250 TSI Aut");
    expect(tcross.versao).toBe("T-Cross Highline 250 TSI Aut");
    expect(getVeiculoPdpUrl(tcross)).toBe(
      "/carros/volkswagen/t-cross-highline-250-tsi-aut/t-cross-highline-250-tsi-automatico-8479269",
    );
    expect(getVeiculoPdpUrl(veiculoAntigo(linha))).toBe(getVeiculoPdpUrl(tcross));
  });
});

describe("o nome sai como a marca escreve", () => {
  const nomeDoHub = (id: number) => {
    const v = veiculoNovo(ESTOQUE.find((l) => l[0] === id)!);
    return `${v.marca} ${rotuloLimpo(rotuloDoModelo(v.marca, v.modelo, v.versao))}`;
  };

  it.each([
    [8440742, "Hyundai HB20"],
    [7697211, "Citroën C3"],
    [7976382, "Honda CB"],
    [8266577, "Honda NXR"],
    [6170299, "Honda ADV"],
    [8296347, "Hyundai i30"],
    [8358155, "JTZ Chopper"],
    [7447739, "Harley-Davidson Dyna"],
    [8243644, "Honda HR-V"],
  ])("hub da ficha %s → %s", (id, esperado) => {
    expect(nomeDoHub(id)).toBe(esperado);
  });

  it("a versão deixa de ir crua, toda minúscula, para o <h1>", () => {
    const virtus = veiculoNovo(ESTOQUE.find((l) => l[0] === 8402155)!);
    expect(virtus.versao).toBe("Highline 200 TSI 1.0 Flex 12V Aut.");
    const x1 = veiculoNovo(ESTOQUE.find((l) => l[0] === 7803195)!);
    expect(x1.versao).toBe("sDrive 20i M Sport 2.0 TB Flex Aut.");
  });

  it("o override do painel continua acima de tudo", () => {
    const hrv = veiculoNovo(ESTOQUE.find((l) => l[0] === 8243644)!);
    expect(hrv.modelo).toBe("HR-V");
    expect(hrv.versao).toBe("EX 1.8 Flexone 16v 5p Aut");
  });
});

describe("as regras, token a token", () => {
  it.each([
    ["hb20", "HB20"], ["hr-v", "HR-V"], ["gsx-r", "GSX-R"], ["i30", "i30"],
    ["16v", "16V"], ["5p.", "5P."], ["1.0l", "1.0L"], ["1300l", "1300L"],
    ["4x4", "4x4"], ["156cv", "156cv"], ["20i", "20i"], ["m40i", "M40i"],
    ["x25i", "X25i"], ["t270", "T270"], ["t200at", "T200AT"], ["k-2500", "K-2500"],
    ["tsi", "TSI"], ["ltz", "LTZ"], ["aut.", "Aut."], ["m", "M"], ["sdrive", "sDrive"],
    ["hi-torque", "Hi-Torque"], ["econo.flex", "Econo.Flex"], ["up!", "Up!"], ["ka+", "Ka+"],
    ["1,0", "1,0"], ["highline", "Highline"],
  ])("%s → %s", (bruto, esperado) => {
    expect(grafiaDoToken(bruto)).toBe(esperado);
  });

  it.each([
    ["citroen", "Citroën"], ["mercedes-benz", "Mercedes-Benz"], ["harley-davidson", "Harley-Davidson"],
    ["bmw", "BMW"], ["jtz", "JTZ"], ["volkswagen", "Volkswagen"], ["land rover", "Land Rover"],
    // A sigla que o cadastro do repasse recebe ("VW"): sem a entrada, virava "Vw".
    ["VW", "VW"], ["vw", "VW"],
  ])("marca %s → %s", (bruta, esperada) => {
    expect(grafiaDaMarca(bruta)).toBe(esperada);
  });

  it("toda palavra do estoque real só muda de CAIXA (e o trema da Citroën, e o hífen do T-Cross)", () => {
    const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const [, marca, modelo, versao] of ESTOQUE) {
      expect(semAcento(grafiaDaMarca(marca).toLowerCase())).toBe(semAcento(marca.trim().toLowerCase()));
      expect(semHifen(grafiaDoModelo(modelo))).toBe(semHifen(capitalizeWordsAntigo(modelo.trim())));
      expect(semHifen(grafiaDaVersao(versao))).toBe(semHifen(versao.trim()));
    }
  });

  it.each([
    ["t cross highline 250 tsi aut", "T-Cross Highline 250 TSI Aut"],
    ["t-cross 200 tsi", "T-Cross 200 TSI"],
    ["hr v ex 1.8", "HR-V EX 1.8"],
    ["wr  v exl", "WR-V EXL"],
    // Sem o par exato, nada muda: "cross" sozinho e "tcross" colado ficam como estão.
    ["corolla cross xre", "Corolla Cross XRE"],
    ["tcross", "Tcross"],
  ])("modelo %j → %j", (bruto, esperado) => {
    expect(grafiaDoModelo(bruto)).toBe(esperado);
  });

  it("espaço → hífen nunca muda o slug", () => {
    for (const bruto of ["t cross highline", "hr v ex", "cr v exl", "wr v", "br v"]) {
      expect(slugificar(grafiaDoModelo(bruto))).toBe(slugificar(bruto));
    }
  });
});
