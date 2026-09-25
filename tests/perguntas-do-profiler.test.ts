import { describe, it, expect } from "vitest";
import { ESTOQUE_DE_25_09 } from "./estoque-de-25-09";
import { carrosNaFaixa, criteriosDoPerfil, elegivel, faixasDoPatio, recomendar } from "../src/lib/motorDoMatch";
import { ehAutomatico, precoDoCarro } from "../src/lib/fichaDoMotor";
import {
  antesDe,
  cambioUnicoDe,
  depoisDe,
  perfilDe,
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
