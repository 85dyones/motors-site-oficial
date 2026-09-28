import { describe, it, expect } from "vitest";
import { ESTOQUE_DE_25_09 } from "./estoque-de-25-09";
import { PARAMETROS_DE_FABRICA } from "../src/lib/finance-calculator";
import {
  carrosNaFaixa,
  criteriosDoPerfil,
  elegivel,
  faixasDoPatio,
  recomendar,
  type PerfilDoQuiz,
} from "../src/lib/motorDoMatch";
import { ehAutomatico, precoDoCarro } from "../src/lib/fichaDoMotor";
import {
  antesDe,
  cambioUnicoDe,
  carrosDoLead,
  comItemAlternado,
  comJeitoAlternado,
  comLeva,
  depoisDe,
  idsDasRespostas,
  perfilDe,
  quantosSobram,
  RESPOSTAS_EM_BRANCO,
  sequenciaDe,
  textoDaContagem,
  type RespostasDoQuiz,
} from "../src/lib/perguntasDoProfiler";

/**
 * O caminho do quiz do Garagem Profiler (fase 2), no pátio de 25/09.
 *
 * Pular pergunta erra em silêncio: a tela só mostra a pergunta seguinte, e
 * ninguém nota que uma resposta escondida continuou cortando carro. Cada `it`
 * abaixo é uma dessas armadilhas.
 */

const CARROS = ESTOQUE_DE_25_09.filter(elegivel);
const FAIXAS = faixasDoPatio(CARROS.map(precoDoCarro));
const faixa = (titulo: string) => {
  const f = FAIXAS.find((x) => x.titulo === titulo);
  if (!f) throw new Error(`faixa ${titulo} sumiu do fixture: ${FAIXAS.map((x) => x.titulo).join(", ")}`);
  return f;
};

/** As respostas de quem escolheu esta faixa e mais o que vier em `resto`. */
const naFaixa = (titulo: string, resto: Partial<RespostasDoQuiz> = {}): RespostasDoQuiz => {
  const f = faixa(titulo);
  return { ...RESPOSTAS_EM_BRANCO, budgetMin: f.min, budgetMax: f.max ?? Number.MAX_SAFE_INTEGER, ...resto };
};

describe("quem leva carga não vê a pergunta do jeito", () => {
  it("a 03 sai da sequência e a 02 avança direto", () => {
    const a = naFaixa("R$ 75mil a R$ 115mil", { leva: "carga" });
    expect(sequenciaDe(a, CARROS)).not.toContain("q3");
    expect(depoisDe("q2", a, CARROS)).not.toBe("q3");
  });

  it("e o jeito marcado antes, escondido, não corta nada", () => {
    // Marcou Hatch, voltou e trocou para carga: a picape não pode sumir por
    // causa de um Hatch que a tela já não mostra.
    const a = naFaixa("R$ 75mil a R$ 115mil", { leva: "carga", jeitos: ["Hatch"] });
    expect(perfilDe(a, CARROS).jeitos).toEqual([]);
    expect(carrosNaFaixa(CARROS, criteriosDoPerfil(perfilDe(a, CARROS))).length).toBeGreaterThan(0);
  });
});

describe("a pergunta do câmbio some quando não há o que separar", () => {
  it("de R$ 115 mil a R$ 175 mil tudo é automático, e a 04 não aparece", () => {
    const a = naFaixa("R$ 115mil a R$ 175mil");
    expect(cambioUnicoDe(a, CARROS)).toBe("automatico");
    expect(sequenciaDe(a, CARROS)).toEqual(["q1", "q2", "q3", "q5"]);
  });

  it("hatch de R$ 50 mil a R$ 75 mil: todos manuais", () => {
    const a = naFaixa("R$ 50mil a R$ 75mil", { leva: "eu", jeitos: ["Hatch"] });
    expect(cambioUnicoDe(a, CARROS)).toBe("manual");
    expect(depoisDe("q3", a, CARROS)).toBe("q5");
  });

  it("com câmbio misturado, a pergunta fica", () => {
    // Até R$ 50 mil há uma Spin automática entre os manuais.
    const a = naFaixa("Até R$ 50mil");
    const sobram = carrosNaFaixa(CARROS, criteriosDoPerfil(perfilDe(a, CARROS)));
    expect(new Set(sobram.map((v) => ehAutomatico(v))).size).toBeGreaterThan(1);
    expect(cambioUnicoDe(a, CARROS)).toBeNull();
    expect(sequenciaDe(a, CARROS)).toContain("q4");
  });

  it("a resposta escondida não zera o resultado", () => {
    // Respondeu "Só automático", voltou e marcou só Hatch numa faixa em que
    // os hatches são todos manuais. A 04 some — e a resposta dela junto.
    const a = naFaixa("R$ 50mil a R$ 75mil", { leva: "eu", jeitos: ["Hatch"], cambio: "so_automatico" });
    const perfil = perfilDe(a, CARROS);
    expect(perfil.cambio).toBeNull();
    expect(carrosNaFaixa(CARROS, criteriosDoPerfil(perfil)).length).toBeGreaterThan(0);
  });

  it("sem carro nenhum, a pergunta não some por falta de prova", () => {
    // Zero carros não "têm todos o mesmo câmbio": a pessoa responde, e o
    // resultado oferece o "e se".
    const a = naFaixa("Acima de R$ 175mil", { leva: "carga" });
    expect(carrosNaFaixa(CARROS, criteriosDoPerfil(perfilDe(a, CARROS)))).toHaveLength(0);
    expect(cambioUnicoDe(a, CARROS)).toBeNull();
  });
});

describe("o que não pode faltar", () => {
  it("diesel só vale para quem leva carga", () => {
    const familia = naFaixa("R$ 75mil a R$ 115mil", { leva: "familia", naoPodeFaltar: ["diesel", "camera"] });
    expect(perfilDe(familia, CARROS).naoPodeFaltar).toEqual(["camera"]);
    const carga = naFaixa("R$ 75mil a R$ 115mil", { leva: "carga", naoPodeFaltar: ["diesel"] });
    expect(perfilDe(carga, CARROS).naoPodeFaltar).toEqual(["diesel"]);
  });

  it("'a responder' e 'Nada disso' chegam iguais ao motor", () => {
    const aResponder = naFaixa("Até R$ 50mil", { naoPodeFaltar: null });
    const nadaDisso = naFaixa("Até R$ 50mil", { naoPodeFaltar: [] });
    expect(perfilDe(aResponder, CARROS)).toEqual(perfilDe(nadaDisso, CARROS));
  });
});

describe("andar e voltar", () => {
  it("a 05 leva ao resultado", () => {
    expect(depoisDe("q5", naFaixa("Até R$ 50mil"), CARROS)).toBe("loading");
  });

  it("VOLTAR pula o que a pessoa não viu", () => {
    // Carga na faixa de cima: a 03 e a 04 somem, e da 05 volta-se à 02.
    const a = naFaixa("R$ 115mil a R$ 175mil", { leva: "carga" });
    expect(sequenciaDe(a, CARROS)).toEqual(["q1", "q2", "q5"]);
    expect(antesDe("q5", a, CARROS)).toBe("q2");
    expect(antesDe("q2", a, CARROS)).toBe("q1");
    expect(antesDe("q1", a, CARROS)).toBe("intro");
  });

  it("marcar carga na 02 não trava a navegação na pergunta que sumiu", () => {
    // A conta do próximo é pela ordem fixa: a 02 continua sabendo seguir
    // mesmo quando a resposta dela muda a sequência inteira.
    const a = naFaixa("R$ 115mil a R$ 175mil", { leva: "carga" });
    expect(depoisDe("q2", a, CARROS)).toBe("q5");
    expect(depoisDe("q3", a, CARROS)).toBe("q5");
  });
});

describe("o número antes do toque é o do resultado", () => {
  it("em toda faixa, para cada resposta da 02", () => {
    // A tela conta no navegador; o resultado conta no servidor. Se as duas
    // contas divergirem, a opção promete "7 carros" e o resultado diz 6.
    for (const f of FAIXAS) {
      for (const leva of ["eu", "familia", "carga"] as const) {
        const perfil = perfilDe(naFaixa(f.titulo, { leva }), CARROS);
        const contagem = carrosNaFaixa(CARROS, criteriosDoPerfil(perfil)).length;
        expect(contagem, `${f.titulo} · ${leva}`).toBe(recomendar(ESTOQUE_DE_25_09, criteriosDoPerfil(perfil)).naFaixa);
      }
    }
  });

  it("zero se escreve como zero na faixa, e não some", () => {
    expect(textoDaContagem(0)).toBe("0 nessa faixa");
    expect(textoDaContagem(1)).toBe("1 carro");
    expect(textoDaContagem(7)).toBe("7 carros");
  });
});

describe("o número da opção é o SOBRAM depois do toque", () => {
  // A primeira versão contava encaixando a opção no perfil de ANTES do toque,
  // com as regras de pulo do caminho antigo. A revisão de 25/09 achou 367
  // opções prometendo um número e entregando outro. Os dois casos abaixo são
  // os que ela reproduziu; `quantosSobram` sobre a transição do toque é a
  // conta que a tela usa agora.
  /** A conta da primeira versão: a opção encaixada no perfil de antes do toque. */
  const doJeitoAntigo = (a: RespostasDoQuiz, mudanca: Partial<PerfilDoQuiz>) =>
    carrosNaFaixa(CARROS, criteriosDoPerfil({ ...perfilDe(a, CARROS), ...mudanca })).length;

  it("'automático até 50 mil' e depois Hatch: o hatch não é '0 nessa faixa'", () => {
    // DESCREVER pré-marcou "Só automático". Até R$ 50 mil os hatches são
    // todos manuais: marcar Hatch faz a 04 sumir, e a resposta dela junto.
    const a = naFaixa("Até R$ 50mil", { leva: "eu", cambio: "so_automatico" });
    expect(doJeitoAntigo(a, { jeitos: ["Hatch"] }), "a conta antiga").toBe(0);
    const antes = quantosSobram({ ...a, jeitos: ["Hatch"] }, CARROS);
    const depois = quantosSobram(comJeitoAlternado({ ...a, jeitos: null }, "Hatch"), CARROS);
    expect(antes).toBeGreaterThan(0);
    expect(antes).toBe(depois);
  });

  it("sair de carga devolve o jeito escondido — e o número já conta com ele", () => {
    // Guardado: carga, e um Sedã marcado antes. "Eu e mais um" prometia 7 e
    // entregava 0: não há sedã até R$ 50 mil.
    const a = naFaixa("Até R$ 50mil", { leva: "carga", jeitos: ["Sedan"] });
    const depois = comLeva(a, "eu");
    expect(quantosSobram(depois, CARROS)).toBe(0);
    expect(doJeitoAntigo(a, { leva: "eu" }), "a conta antiga").toBe(7);
  });

  it("em toda faixa e resposta guardada, a 02 promete o que o toque grava", () => {
    // `comLeva` é o que o toque grava e o que a opção conta; aqui se prova
    // que a transição carrega as regras (diesel, jeitos escondidos, câmbio).
    for (const f of FAIXAS) {
      for (const guardada of [
        {},
        { leva: "carga" as const, jeitos: ["Sedan" as const], naoPodeFaltar: ["diesel" as const] },
        { jeitos: ["Hatch" as const], cambio: "so_automatico" as const },
      ]) {
        const a = naFaixa(f.titulo, guardada);
        for (const leva of ["eu", "familia", "carga"] as const) {
          const novas = comLeva(a, leva);
          const perfil = perfilDe(novas, CARROS);
          expect(quantosSobram(novas, CARROS), `${f.titulo} · ${leva}`).toBe(
            recomendar(ESTOQUE_DE_25_09, criteriosDoPerfil(perfil)).naFaixa,
          );
          if (leva !== "carga") expect(novas.naoPodeFaltar ?? []).not.toContain("diesel");
        }
      }
    }
  });
});

describe("os toques de várias respostas", () => {
  it("desmarcar o último jeito não vira 'Tanto faz'", () => {
    const a = naFaixa("Até R$ 50mil", { jeitos: ["SUV"] });
    expect(comJeitoAlternado(a, "SUV").jeitos).toBeNull();
    expect(comJeitoAlternado(a, "Hatch").jeitos).toEqual(["SUV", "Hatch"]);
  });

  it("o quarto item não entra; desmarcar libera a vaga", () => {
    const a = naFaixa("Até R$ 50mil", { naoPodeFaltar: ["camera", "sensor", "turbo"] });
    expect(comItemAlternado(a, "4x4").naoPodeFaltar).toEqual(["camera", "sensor", "turbo"]);
    expect(comItemAlternado(a, "sensor").naoPodeFaltar).toEqual(["camera", "turbo"]);
  });
});

describe("o que sai do quiz", () => {
  it("a busca que vai ao GA4, ao Pixel e à CAPI leva só ids", () => {
    // Nada de orçamento ("R$", dígitos de preço) nem rótulo com espaço.
    // Hatch e perua até R$ 50 mil: câmbio misturado, a 04 fica e vai junto.
    const a = naFaixa("Até R$ 50mil", {
      leva: "familia",
      jeitos: ["Hatch", "Perua"],
      cambio: "prefiro_automatico",
      naoPodeFaltar: ["2020-ou-mais-novo", "camera"],
    });
    const ids = idsDasRespostas(perfilDe(a, CARROS));
    expect(ids).toEqual(["familia", "Hatch", "Perua", "prefiro_automatico", "2020-ou-mais-novo", "camera"]);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ids.join(" ")).not.toMatch(/50|R\$/);
    // E a resposta de pergunta pulada não vai: família SUV de R$ 75 a 115 mil
    // é tudo automático, e a 04 some.
    const pulada = naFaixa("R$ 75mil a R$ 115mil", { leva: "familia", jeitos: ["SUV"], cambio: "prefiro_manual" });
    expect(idsDasRespostas(perfilDe(pulada, CARROS))).toEqual(["familia", "SUV"]);
  });

  describe("os carros do lead", () => {
    const r = recomendar(
      ESTOQUE_DE_25_09,
      criteriosDoPerfil({
        orcamento: { min: 91000, max: 130000 },
        leva: "eu",
        jeitos: ["Hatch", "Sedan", "SUV"],
        cambio: "prefiro_automatico",
        naoPodeFaltar: ["turbo"],
      }),
    );
    const coringa = r.coringa!;
    const ids = (lista: { veiculo: { id: string } }[]) => lista.map((c) => c.veiculo.id);

    it("o cenário tem carta", () => {
      expect(coringa).not.toBeNull();
    });

    it("sem nada marcado: os três cartões, e a carta não", () => {
      expect(ids(carrosDoLead(r, [], "carros"))).toEqual(ids(r.cartoes));
    });

    it("a carta só entra com FAZ SENTIDO, e marcada como 'ja-pensou'", () => {
      const lead = carrosDoLead(r, [coringa.veiculo.id], "carros");
      expect(lead).toHaveLength(1);
      expect(lead[0].lugar).toBe("ja-pensou");
      expect(lead[0].pesaContra).toMatch(/^O que muda: /);
    });

    it("com um cartão e a carta marcados, vão os dois", () => {
      const lead = carrosDoLead(r, [r.cartoes[1].veiculo.id, coringa.veiculo.id], "carros");
      expect(ids(lead)).toEqual([r.cartoes[1].veiculo.id, coringa.veiculo.id]);
    });

    it("'me avise' e pedido de ajuda não levam carro", () => {
      expect(carrosDoLead(r, [coringa.veiculo.id], "aviso")).toEqual([]);
      expect(carrosDoLead(null, [], "ajuda")).toEqual([]);
    });
  });
});

describe("POR MÊS", () => {
  const porMes = {
    parcela: 1500,
    entrada: 20000,
    prazo: 48,
    ocupacao: "clt" as const,
    troca: true,
    parametros: PARAMETROS_DE_FABRICA,
  };

  it("a parcela vira a faixa, e o orçamento em preço deixa de valer", () => {
    // A tela zera o orçamento em preço ao confirmar o POR MÊS; mesmo que um
    // valor antigo sobrasse, a faixa é a parcela.
    const a = naFaixa("R$ 75mil a R$ 115mil", { leva: "familia", porMes });
    const c = criteriosDoPerfil(perfilDe(a, CARROS));
    expect(c.parcela).toMatchObject({ max: 1500, min: 1050, entrada: 20000, prazo: 48 });
    expect(c.teto).toBeNull();
    expect(c.piso).toBe(0);
    expect(quantosSobram(a, CARROS)).toBe(recomendar(ESTOQUE_DE_25_09, c).naFaixa);
  });

  it("a busca marca que foi por mês — e não leva parcela, entrada nem troca", () => {
    const ids = idsDasRespostas(perfilDe({ ...RESPOSTAS_EM_BRANCO, leva: "familia", porMes }, CARROS));
    expect(ids).toEqual(["por-mes", "familia"]);
    expect(ids.join(" ")).not.toMatch(/\d/);
  });

  it("o lead leva a parcela de cada carro escolhido", () => {
    const r = recomendar(
      ESTOQUE_DE_25_09,
      criteriosDoPerfil(perfilDe({ ...RESPOSTAS_EM_BRANCO, leva: "familia", porMes }, CARROS)),
    );
    const lead = carrosDoLead(r, [], "carros");
    expect(lead.length).toBeGreaterThan(0);
    for (const c of lead) {
      expect(c.parcela).not.toBeNull();
      expect(c.parcela!).toBeLessThanOrEqual(1500);
    }
  });
});
