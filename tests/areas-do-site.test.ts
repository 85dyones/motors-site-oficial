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

  it("seção nova do código entra visível, e na ordem do catálogo", () => {
    /* O nome deste caso era "entra no fim, visível" até 2026-09-05, e as
       asserções nunca olharam posição — só tamanho, os dois primeiros ids e
       `ocultas`. Quando `normalizarAreas` deixou de empurrar para o fim, o
       nome passou a mentir e o teste continuou verde.

       A ordem salva NÃO pode ser prefixo do catálogo, e essa foi a segunda
       armadilha: com `["hero","busca"]`, `push` e `splice` produzem o mesmo
       array, e a asserção de posição que eu tinha acabado de acrescentar
       passava verde com o comportamento antigo. `["hero","contato"]` separa os
       dois — `contato` é a ÚLTIMA do catálogo, então tudo que falta precisa
       entrar ANTES dela. */
    const c = normalizarAreas({ ordem: ["hero", "contato"], ocultas: [] });
    expect(c.ordem).toHaveLength(AREAS_DA_HOME.length);
    // A preferência salva continua valendo: `contato` segue logo após `hero`
    // seria o resultado de `push`; aqui as ausentes entram no meio.
    expect(c.ordem[0]).toBe("hero");
    expect(c.ordem[c.ordem.length - 1]).toBe("contato");
    // A seção que não estava na config não pode nascer oculta.
    expect(c.ocultas).toEqual([]);
    // Nenhuma some, nenhuma duplica.
    expect([...c.ordem].sort()).toEqual([...AREAS_DA_HOME.map((a) => a.id)].sort());
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

describe("seção nova entra na vizinhança do catálogo, não no fim", () => {
  /**
   * A ordem REAL de produção, lida de `site_settings.areas_home` na revisão de
   * 2026-09-05. São as nove áreas que existiam quando o dono arrumou a home.
   *
   * É por isso que este bloco existe: `faixas_de_preco` não está aqui, e a
   * versão anterior de `normalizarAreas` fazia `push`, jogando a seção nova
   * para depois de `contato` — a faixa vermelha de fechamento. Medido no HTML
   * do build, não suposto.
   */
  const ORDEM_DE_PRODUCAO = [
    "hero",
    "busca",
    "destaques_rapidos",
    "estoque_selecionado",
    "consultoria",
    "venda_troca",
    "reputacao",
    "instagram",
    "contato",
  ];

  it("as faixas de preço não caem depois da faixa de contato", () => {
    const { ordem } = normalizarAreas({ ordem: ORDEM_DE_PRODUCAO, ocultas: [] });

    expect(ordem.indexOf("faixas_de_preco")).toBeGreaterThan(-1);
    expect(ordem.indexOf("faixas_de_preco")).toBeLessThan(ordem.indexOf("contato"));
  });

  it("entra logo depois da vizinha que a precede no catálogo", () => {
    const { ordem } = normalizarAreas({ ordem: ORDEM_DE_PRODUCAO, ocultas: [] });

    // No catálogo, `faixas_de_preco` vem logo após `estoque_selecionado`.
    expect(ordem[ordem.indexOf("estoque_selecionado") + 1]).toBe("faixas_de_preco");
  });

  it("vale para qualquer seção nova, não só esta", () => {
    // Tira do meio da ordem salva uma área que NÃO é a última do catálogo e
    // confere que ela volta para o lugar dela, e não para o fim.
    const semConsultoria = ORDEM_DE_PRODUCAO.filter((id) => id !== "consultoria");
    const { ordem } = normalizarAreas({ ordem: semConsultoria, ocultas: [] });

    const iConsultoria = ordem.indexOf("consultoria");
    const iContato = ordem.indexOf("contato");
    const iReputacao = ordem.indexOf("reputacao");

    // A guarda vem antes da ordem pelo mesmo motivo da asserção de
    // `faixas_de_preco` logo acima: `indexOf` devolve -1 quando não acha, e -1
    // é menor que qualquer posição válida. Sem ela este teste — que existe
    // justamente para provar que a área tirada do meio VOLTA — passa verde no
    // dia em que ela deixar de voltar.
    expect(iConsultoria, "a área tirada do meio não voltou para a ordem")
      .toBeGreaterThanOrEqual(0);
    expect(iContato, "a área de contato sumiu da ordem").toBeGreaterThanOrEqual(0);
    expect(iReputacao, "a área de reputação sumiu da ordem").toBeGreaterThanOrEqual(0);

    expect(iConsultoria).toBeLessThan(iContato);
    expect(iConsultoria).toBeLessThan(iReputacao);
  });

  it("a ordem que o dono salvou continua sendo respeitada", () => {
    // Invertida de propósito: a preferência dele vence o catálogo.
    const invertida = [...ORDEM_DE_PRODUCAO].reverse();
    const { ordem } = normalizarAreas({ ordem: invertida, ocultas: [] });

    const semNovas = ordem.filter((id) => invertida.includes(id));
    expect(semNovas).toEqual(invertida);
  });

  it("nenhuma área do catálogo se perde no caminho", () => {
    const { ordem } = normalizarAreas({ ordem: ORDEM_DE_PRODUCAO, ocultas: [] });

    expect([...ordem].sort()).toEqual([...AREAS_DA_HOME.map((a) => a.id)].sort());
  });
});
