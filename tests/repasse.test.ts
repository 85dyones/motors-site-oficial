import { describe, it, expect } from "vitest";
import {
  contaDoRepasse,
  etiquetaDoRepasse,
  passaNoFiltro,
  soParaLojistas,
  aparecePublicamente,
  slugDoRepasse,
  faixaDoPreco,
  temLaudo,
} from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

const AGORA = new Date("2026-09-24T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000).toISOString();

describe("contaDoRepasse", () => {
  it("soma só os orçamentos e compara com a FIPE (a conta do Kwid das pranchas)", () => {
    expect(contaDoRepasse(repasseDeTeste())).toEqual({
      preco: 36900,
      reparoOrcado: 2020,
      voceGasta: 38920,
      fipe: 42100,
      abaixoDaFipe: 3180,
    });
  });

  it("sem FIPE, a diferença é null — nunca zero", () => {
    expect(contaDoRepasse(repasseDeTeste({ fipe_valor: null })).abaixoDaFipe).toBeNull();
  });

  it("acima da tabela, a diferença fica negativa (quem mostra decide o que fazer)", () => {
    const r = repasseDeTeste({ preco: 50000, fipe_valor: 48000, itens_de_estado: [] });
    expect(contaDoRepasse(r).abaixoDaFipe).toBe(-2000);
  });
});

describe("etiquetaDoRepasse", () => {
  it("reparo orçado vence o laudo", () => {
    expect(etiquetaDoRepasse(repasseDeTeste())).toBe("REPARO ORÇADO");
  });

  it("aprovado com apontamento é COM LAUDO", () => {
    const r = repasseDeTeste({ laudo: "aprovado_com_apontamento", laudo_apontamento: "Repintura", itens_de_estado: [] });
    expect(etiquetaDoRepasse(r)).toBe("COM LAUDO");
  });

  it("laudo não feito ou ainda não escolhido é SEM LAUDO", () => {
    expect(etiquetaDoRepasse(repasseDeTeste({ laudo: "nao_feito", itens_de_estado: [] }))).toBe("SEM LAUDO");
    expect(etiquetaDoRepasse(repasseDeTeste({ laudo: null, itens_de_estado: [] }))).toBe("SEM LAUDO");
  });
});

describe("passaNoFiltro — os filtros não são exclusivos", () => {
  it("carro com laudo e reparo entra em 'com laudo' e em 'reparo orçado'", () => {
    const kwid = repasseDeTeste();
    expect(temLaudo(kwid)).toBe(true);
    expect(passaNoFiltro(kwid, "com-laudo")).toBe(true);
    expect(passaNoFiltro(kwid, "reparo-orcado")).toBe(true);
    expect(passaNoFiltro(kwid, "sem-laudo")).toBe(false);
    expect(passaNoFiltro(kwid, "todos")).toBe(true);
  });

  it("sem reparo não entra em 'reparo orçado'", () => {
    expect(passaNoFiltro(repasseDeTeste({ itens_de_estado: [] }), "reparo-orcado")).toBe(false);
  });
});

describe("soParaLojistas", () => {
  it("publicado sem o switch é só para lojistas", () => {
    expect(soParaLojistas(repasseDeTeste({ situacao: "publicado", aberto_ao_publico_em: null }))).toBe(true);
  });
  it("depois do switch, é para todos", () => {
    expect(soParaLojistas(repasseDeTeste({ situacao: "publicado", aberto_ao_publico_em: diasAtras(1) }))).toBe(false);
  });
  it("reservado nunca mostra a camada de lojista", () => {
    expect(soParaLojistas(repasseDeTeste({ situacao: "reservado", aberto_ao_publico_em: null }))).toBe(false);
  });
});

describe("aparecePublicamente", () => {
  it("rascunho, em validação e arquivado não aparecem", () => {
    for (const situacao of ["rascunho", "em_validacao", "arquivado"] as const) {
      expect(aparecePublicamente(repasseDeTeste({ situacao }), AGORA)).toBe(false);
    }
  });
  it("publicado e reservado aparecem", () => {
    expect(aparecePublicamente(repasseDeTeste({ situacao: "publicado" }), AGORA)).toBe(true);
    expect(aparecePublicamente(repasseDeTeste({ situacao: "reservado" }), AGORA)).toBe(true);
  });
  it("vendido aparece dentro da carência do estoque e some depois", () => {
    expect(aparecePublicamente(repasseDeTeste({ situacao: "vendido", vendido_em: diasAtras(10) }), AGORA)).toBe(true);
    expect(aparecePublicamente(repasseDeTeste({ situacao: "vendido", vendido_em: diasAtras(91) }), AGORA)).toBe(false);
    expect(aparecePublicamente(repasseDeTeste({ situacao: "vendido", vendido_em: null }), AGORA)).toBe(false);
  });
});

describe("slugDoRepasse", () => {
  it("marca, modelo, versão, ano e os 6 primeiros do id", () => {
    expect(slugDoRepasse(repasseDeTeste())).toBe("renault-kwid-zen-1-0-2021-3f9a1c");
  });
  it("sem versão, não sobra hífen duplo", () => {
    const r = repasseDeTeste({ marca: "Fiat", modelo: "Argo", versao: null, ano_modelo: 2019, id: "abcdef12-0000-4000-8000-000000000000" });
    expect(slugDoRepasse(r)).toBe("fiat-argo-2019-abcdef");
  });
});

describe("faixaDoPreco", () => {
  it("o mínimo entra na faixa, o teto já é a próxima", () => {
    expect(faixaDoPreco(29999)).toBe("ate-30");
    expect(faixaDoPreco(30000)).toBe("30-50");
    expect(faixaDoPreco(49999.99)).toBe("30-50");
    expect(faixaDoPreco(50000)).toBe("50-80");
    expect(faixaDoPreco(80000)).toBe("acima-80");
    expect(faixaDoPreco(250000)).toBe("acima-80");
  });
});
