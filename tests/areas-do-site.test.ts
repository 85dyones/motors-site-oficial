import { describe, it, expect } from "vitest";
import {
  AREAS_DA_HOME,
  CONFIG_PADRAO,
  normalizarAreas,
  areasVisiveis,
  moverArea,
  alternarArea,
} from "../src/lib/areasDoSite";

/**
 * Testes das áreas da home (tela A3).
 *
 * O que esta camada controla é o que o visitante VÊ na página inicial. Um
 * erro aqui não aparece no painel — aparece no site, como seção sumida. Por
 * isso a normalização é conservadora, e é ela que estes testes travam:
 * config estranha nunca pode apagar seção, e seção fixa nunca pode ser
 * desligada.
 */

describe("catálogo", () => {
  it("todo id é único e estável", () => {
    const ids = AREAS_DA_HOME.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a config padrão contém todas as seções e nenhuma oculta", () => {
    expect(CONFIG_PADRAO.ordem).toHaveLength(AREAS_DA_HOME.length);
    expect(CONFIG_PADRAO.ocultas).toEqual([]);
  });

  it("busca e hero são fixas — sem elas o visitante não chega a veículo", () => {
    const fixas = AREAS_DA_HOME.filter((a) => a.fixa).map((a) => a.id);
    expect(fixas).toContain("busca");
    expect(fixas).toContain("hero");
  });
});

describe("normalizarAreas", () => {
  it("sem nada salvo, devolve a ordem de fábrica", () => {
    expect(normalizarAreas(null)).toEqual(CONFIG_PADRAO);
    expect(normalizarAreas(undefined)).toEqual(CONFIG_PADRAO);
    expect(normalizarAreas({})).toEqual(CONFIG_PADRAO);
  });

  it("descarta id desconhecido em vez de renderizar seção fantasma", () => {
    const c = normalizarAreas({ ordem: ["instagram", "secao_que_nao_existe", "hero"], ocultas: [] });
    expect(c.ordem).not.toContain("secao_que_nao_existe");
    expect(c.ordem[0]).toBe("instagram");
  });

  it("seção nova do código entra no fim, visível", () => {
    // Config antiga, salva quando o catálogo tinha menos seções.
    const c = normalizarAreas({ ordem: ["hero", "busca"], ocultas: [] });
    expect(c.ordem).toHaveLength(AREAS_DA_HOME.length);
    expect(c.ordem.slice(0, 2)).toEqual(["hero", "busca"]);
    // A seção que não estava na config não pode nascer oculta.
    expect(c.ocultas).toEqual([]);
  });

  it("ignora pedido de ocultar seção fixa", () => {
    const c = normalizarAreas({ ordem: CONFIG_PADRAO.ordem, ocultas: ["busca", "instagram"] });
    expect(c.ocultas).not.toContain("busca");
    expect(c.ocultas).toContain("instagram");
  });

  it("remove duplicatas na ordem e nas ocultas", () => {
    const c = normalizarAreas({
      ordem: ["hero", "hero", "busca"],
      ocultas: ["instagram", "instagram"],
    });
    expect(c.ordem.filter((i) => i === "hero")).toHaveLength(1);
    expect(c.ocultas).toEqual(["instagram"]);
  });

  it("aguenta lixo sem lançar", () => {
    expect(() => normalizarAreas({ ordem: "nao é array", ocultas: 42 })).not.toThrow();
    expect(normalizarAreas({ ordem: [1, 2, null], ocultas: [{}] })).toEqual(CONFIG_PADRAO);
  });
});

describe("areasVisiveis", () => {
  it("respeita ordem e esconde as ocultas", () => {
    const c = normalizarAreas({
      ordem: ["instagram", "hero", "busca", "reputacao"],
      ocultas: ["reputacao"],
    });
    const ids = areasVisiveis(c).map((a) => a.id);
    expect(ids[0]).toBe("instagram");
    expect(ids).not.toContain("reputacao");
  });

  it("com a config padrão, devolve a home inteira", () => {
    expect(areasVisiveis(CONFIG_PADRAO)).toHaveLength(AREAS_DA_HOME.length);
  });
});

describe("moverArea", () => {
  it("troca com o vizinho", () => {
    const c = moverArea(CONFIG_PADRAO, CONFIG_PADRAO.ordem[2], "cima");
    expect(c.ordem[1]).toBe(CONFIG_PADRAO.ordem[2]);
    expect(c.ordem[2]).toBe(CONFIG_PADRAO.ordem[1]);
  });

  it("nas pontas não faz nada — nem estoura o array", () => {
    const primeiro = CONFIG_PADRAO.ordem[0];
    const ultimo = CONFIG_PADRAO.ordem[CONFIG_PADRAO.ordem.length - 1];
    expect(moverArea(CONFIG_PADRAO, primeiro, "cima").ordem).toEqual(CONFIG_PADRAO.ordem);
    expect(moverArea(CONFIG_PADRAO, ultimo, "baixo").ordem).toEqual(CONFIG_PADRAO.ordem);
  });

  it("id desconhecido é no-op", () => {
    expect(moverArea(CONFIG_PADRAO, "nao_existe", "cima")).toEqual(CONFIG_PADRAO);
  });
});

describe("alternarArea", () => {
  it("liga e desliga uma seção comum", () => {
    const desligada = alternarArea(CONFIG_PADRAO, "instagram");
    expect(desligada.ocultas).toContain("instagram");
    const religada = alternarArea(desligada, "instagram");
    expect(religada.ocultas).not.toContain("instagram");
  });

  it("não desliga seção fixa", () => {
    expect(alternarArea(CONFIG_PADRAO, "busca").ocultas).toEqual([]);
    expect(alternarArea(CONFIG_PADRAO, "hero").ocultas).toEqual([]);
  });
});
