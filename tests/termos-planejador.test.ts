import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Testes da geração de termos do Planejador de Palavras-Chave.
 *
 * Por que isto merece trava: a lista de termos é a ÚNICA parte da automação
 * que carrega decisão nossa — o resto é transporte HTTP. E ela é montada a
 * partir de um campo do RevendaMais que vem sujo (`modelo` com a versão
 * embutida), então um erro aqui não quebra nada visível: só faz a loja medir
 * "bmw x4 m40i 3.0 m sport edit v6 turbo aut usado curitiba", que ninguém
 * busca, e concluir que não há demanda.
 *
 * Roda sem credencial, sem token de desenvolvedor e sem rede — de propósito,
 * porque é esse o estado enquanto o token do Google Ads não sai.
 */

const require_ = createRequire(import.meta.url);
const {
  CLUSTERS_FIXOS,
  nomeDoModelo,
  modelosDoEstoque,
  montarTermos,
  sementesDeDescoberta,
} = require_("../conteudo-seo/termos.js");

const RAIZ = join(__dirname, "..");
const PLANO = join(RAIZ, "PlanoMotorsStoreSEOGoogleAdsGA4Curitiba.md");

describe("nomeDoModelo — tirar a versão colada no modelo", () => {
  it("corta a versão quando ela é sufixo do modelo", () => {
    expect(nomeDoModelo({ modelo: "x4 m40i 3.0 m sport edit v6 turbo aut", versao: "m40i 3.0 m sport edit v6 turbo aut" })).toBe("x4");
    expect(nomeDoModelo({ modelo: "renegade s t270 1.3 tb 4x4 flex aut", versao: "s t270 1.3 tb 4x4 flex aut" })).toBe("renegade");
    expect(nomeDoModelo({ modelo: "corolla gr-sport 2.0 flex aut.", versao: "gr-sport 2.0 flex aut." })).toBe("corolla");
  });

  it("cai na primeira palavra quando a versão É o modelo inteiro", () => {
    // Caso real do Honda HR-V: os dois campos vêm idênticos. Cortar o sufixo
    // devolveria string vazia — e um termo "honda  usado curitiba".
    const v = { modelo: "hr-v ex 1.8 flexone 16v 5p aut", versao: "hr-v ex 1.8 flexone 16v 5p aut" };
    expect(nomeDoModelo(v)).toBe("hr-v");
  });

  it("não corta quando a versão não é sufixo, e aguenta campo faltando", () => {
    expect(nomeDoModelo({ modelo: "gol cl 1.6 2p", versao: "outra coisa" })).toBe("gol cl 1.6 2p");
    expect(nomeDoModelo({ modelo: "duster", versao: "" })).toBe("duster");
    expect(nomeDoModelo({ modelo: "", versao: "" })).toBe("");
  });
});

describe("modelosDoEstoque", () => {
  const estoque = [
    { marca: "jeep", modelo: "renegade s t270", versao: "s t270", tipo: "SUV" },
    { marca: "jeep", modelo: "renegade longitude 1.8", versao: "longitude 1.8", tipo: "SUV" },
    { marca: "honda", modelo: "cb 300f twister flex", versao: "300f twister flex", tipo: "Motocicleta" },
    { marca: "fiat", modelo: "uno mille fire", versao: "mille fire", tipo: "Hatch", vendido: true },
  ];

  it("agrupa por marca+modelo e conta as unidades", () => {
    const m = modelosDoEstoque(estoque);
    const renegade = m.find((x: { nome: string }) => x.nome === "renegade");
    expect(renegade.quantidade).toBe(2);
    expect(renegade.marca).toBe("jeep");
  });

  it("tira o vendido por padrão e o traz quando pedido", () => {
    expect(modelosDoEstoque(estoque).some((x: { nome: string }) => x.nome === "uno")).toBe(false);
    expect(modelosDoEstoque(estoque, { incluirVendidos: true }).some((x: { nome: string }) => x.nome === "uno")).toBe(true);
  });

  it("marca moto pelo tipo", () => {
    const cb = modelosDoEstoque(estoque).find((x: { nome: string }) => x.nome === "cb");
    expect(cb.moto).toBe(true);
    expect(modelosDoEstoque(estoque).find((x: { nome: string }) => x.nome === "renegade").moto).toBe(false);
  });

  it("ordena por quantidade — o que a loja mais tem é medido primeiro", () => {
    const m = modelosDoEstoque(estoque);
    const posRenegade = m.findIndex((x: { nome: string }) => x.nome === "renegade");
    const posCb = m.findIndex((x: { nome: string }) => x.nome === "cb");
    // Sem estas guardas, um `indexOf` que devolve -1 passaria como "ordem ok".
    expect(posRenegade).toBeGreaterThanOrEqual(0);
    expect(posCb).toBeGreaterThanOrEqual(0);
    expect(posRenegade).toBeLessThan(posCb);
  });
});

describe("montarTermos", () => {
  const estoque = [
    { marca: "jeep", modelo: "renegade s t270", versao: "s t270", tipo: "SUV" },
    { marca: "honda", modelo: "cb 300f twister flex", versao: "300f twister flex", tipo: "Motocicleta" },
  ];

  it("gera as três formas de busca por modelo de carro", () => {
    const { termos } = montarTermos({ veiculos: estoque });
    const so = termos.map((t: { termo: string }) => t.termo);
    expect(so).toContain("jeep renegade usado curitiba");
    expect(so).toContain("jeep renegade seminovo curitiba");
    expect(so).toContain("comprar jeep renegade curitiba");
  });

  it("moto concorda no feminino e não vira termo de carro", () => {
    const { termos } = montarTermos({ veiculos: estoque });
    const so = termos.map((t: { termo: string }) => t.termo);
    expect(so).toContain("honda cb usada curitiba");
    expect(so).toContain("honda cb seminova curitiba");
    // A condição inteira: nenhuma variante masculina para a moto, e não só
    // a grafia exata que eu pensei em proibir.
    expect(so.filter((t: string) => /^honda cb (usado|seminovo)\b/.test(t))).toEqual([]);
  });

  it("não repete termo entre clusters — a primeira ocorrência vence", () => {
    const { termos } = montarTermos({
      veiculos: estoque,
      extras: ["seminovos curitiba", "  SEMINOVOS   CURITIBA  ", "termo novo curitiba"],
    });
    const so = termos.map((t: { termo: string }) => t.termo);
    expect(so.filter((t: string) => t === "seminovos curitiba")).toHaveLength(1);
    // e continua no cluster de origem, não no de sementes
    expect(termos.find((t: { termo: string }) => t.termo === "seminovos curitiba").cluster).toBe("geo-comercial");
    expect(termos.find((t: { termo: string }) => t.termo === "termo novo curitiba").cluster).toBe("sementes");
  });

  it("normaliza espaço e caixa", () => {
    const { termos } = montarTermos({ veiculos: [], extras: ["  Carro   USADO Curitiba "] });
    expect(termos.map((t: { termo: string }) => t.termo)).toContain("carro usado curitiba");
  });

  it("sem estoque, ainda entrega os clusters fixos", () => {
    const { termos, porCluster } = montarTermos({ veiculos: [] });
    expect(termos.length).toBeGreaterThan(0);
    expect(porCluster["modelo-geo"]).toBeUndefined();
    expect(porCluster["geo-comercial"]).toContain("seminovos curitiba");
  });
});

describe("sementesDeDescoberta", () => {
  it("respeita o teto de 20 que a API impõe", () => {
    const muitas = Array.from({ length: 50 }, (_, i) => `termo ${i} curitiba`);
    expect(sementesDeDescoberta({ extras: muitas })).toHaveLength(20);
  });

  it("não repete semente", () => {
    const s = sementesDeDescoberta({ extras: ["seminovos curitiba"] });
    expect(new Set(s).size).toBe(s.length);
  });
});

describe("contra o estoque real do repositório", () => {
  const { veiculos } = require_("../conteudo-seo/estoque.json");

  it("nenhum termo carrega cilindrada, câmbio ou sufixo de versão", () => {
    const { termos } = montarTermos({ veiculos });
    // Se a limpeza do `modelo` falhar, é aqui que aparece: os termos passam a
    // conter "1.0", "16v", "flex", "aut" — vocabulário de ficha, não de busca.
    const sujos = termos
      .map((t: { termo: string }) => t.termo)
      .filter((t: string) => /\b(\d+\.\d+|\d+v|flex|aut\.?|turbo|4x4|mi|tb)\b/.test(t));
    expect(sujos).toEqual([]);
  });

  it("todo termo é minúsculo, sem espaço duplo e sem sobra nas pontas", () => {
    const { termos } = montarTermos({ veiculos });
    for (const { termo } of termos) {
      expect(termo).toBe(termo.trim().toLowerCase().replace(/\s+/g, " "));
      expect(termo.length).toBeGreaterThan(0);
    }
  });

  it("gera termo para todo modelo distinto do pátio", () => {
    const { termos, modelos } = montarTermos({ veiculos });
    const doModelo = termos.filter((t: { cluster: string }) =>
      t.cluster === "modelo-geo" || t.cluster === "moto-geo",
    );
    // 3 formas por modelo, mais os 2 termos genéricos de moto quando há moto.
    const genericosDeMoto = modelos.some((m: { moto: boolean }) => m.moto) ? 2 : 0;
    expect(doModelo).toHaveLength(modelos.length * 3 + genericosDeMoto);
  });
});

describe("correspondência com o §1.6 do plano", () => {
  // O plano ainda não está versionado; quando não estiver na máquina, não há
  // o que comparar. O nome do teste diz isso em voz alta em vez de passar
  // calado — um verde silencioso aqui seria pior que um pulo visível.
  it.skipIf(!existsSync(PLANO))("todo termo fixo do código aparece no plano", () => {
    // O checkout pode entregar CRLF; ancorar em "\n" quebraria a busca.
    const plano = readFileSync(PLANO, "utf8").split(/\r?\n/).join("\n").toLowerCase();
    const ausentes: string[] = [];
    for (const lista of Object.values(CLUSTERS_FIXOS) as string[][]) {
      for (const termo of lista) if (!plano.includes(termo)) ausentes.push(termo);
    }
    expect(ausentes).toEqual([]);
  });
});
