import { describe, it, expect } from "vitest";
import {
  recomendarAvaliacao,
  fipeParaNumero,
  LIMITE_KM_ALTO,
} from "../src/lib/avaliacaoRecomendacao";

/**
 * Testes da regra de precificação de compra.
 *
 * Esta regra decide o número que o consultor vê ao abrir o lead, então ela
 * merece trava: um erro aqui não quebra a build nem aparece na tela — vira
 * proposta errada para um cliente real.
 *
 * A regra, definida pelo dono em 2026-08-06:
 *   ótimo estado ........... 10% abaixo da FIPE
 *   reparos leves .......... entre 15% e 20% abaixo
 *   km alto + avarias ...... pelo menos 30% abaixo
 */

const FIPE = "R$ 100.000,00"; // números redondos deixam a conta óbvia

function avaliar(
  mecanica: string,
  conservacao: string,
  km: number | null = 50000,
  fipe: string | null = FIPE,
) {
  return recomendarAvaliacao({
    estadoMecanico: mecanica,
    estadoConservacao: conservacao,
    quilometragem: km,
    fipeValor: fipe,
  });
}

describe("fipeParaNumero", () => {
  it("lê o formato que a API da FIPE devolve", () => {
    expect(fipeParaNumero("R$ 67.142,00")).toBe(67142);
    expect(fipeParaNumero("R$ 100.000,00")).toBe(100000);
  });

  it("devolve null quando não dá para ler, em vez de chutar", () => {
    expect(fipeParaNumero("")).toBeNull();
    expect(fipeParaNumero(null)).toBeNull();
    expect(fipeParaNumero(undefined)).toBeNull();
    expect(fipeParaNumero("consulte")).toBeNull();
  });
});

describe("faixa de ótimo estado (10%)", () => {
  it("exige mecânica excelente ou boa E funilaria impecável", () => {
    for (const mecanica of ["excelente", "bom"]) {
      const r = avaliar(mecanica, "impecavel");
      expect(r.faixa).toBe("otimo");
      expect(r.desconto_min).toBe(10);
      expect(r.desconto_max).toBe(10);
      expect(r.valor_sugerido_max).toBe(90000);
    }
  });

  it("qualquer risco na lataria já tira dos 10%", () => {
    expect(avaliar("excelente", "riscos").faixa).toBe("reparos_leves");
  });

  it("mecânica requerendo atenção já tira dos 10%", () => {
    expect(avaliar("atencao", "impecavel").faixa).toBe("reparos_leves");
  });
});

describe("faixa de reparos leves (15% a 20%)", () => {
  it("devolve os dois extremos da faixa", () => {
    const r = avaliar("atencao", "riscos");
    expect(r.faixa).toBe("reparos_leves");
    expect(r.desconto_min).toBe(15);
    expect(r.desconto_max).toBe(20);
  });

  it("maior desconto produz o menor valor", () => {
    const r = avaliar("atencao", "reparos");
    expect(r.valor_sugerido_min).toBe(80000); // -20%
    expect(r.valor_sugerido_max).toBe(85000); // -15%
    expect(r.valor_sugerido_min!).toBeLessThan(r.valor_sugerido_max!);
  });
});

describe("faixa de avarias maiores (pelo menos 30%)", () => {
  it("mecânica ruim sozinha aciona a faixa", () => {
    const r = avaliar("ruim", "impecavel");
    expect(r.faixa).toBe("avarias_maiores");
    expect(r.desconto_min).toBe(30);
  });

  it("funilaria avariada sozinha aciona a faixa", () => {
    expect(avaliar("excelente", "avariado").faixa).toBe("avarias_maiores");
  });

  it("não tem teto: desconto_max é null, e o valor vira um limite superior", () => {
    const r = avaliar("ruim", "avariado");
    expect(r.desconto_max).toBeNull();
    expect(r.valor_sugerido_min).toBeNull();
    expect(r.valor_sugerido_max).toBe(70000);
    expect(r.resumo).toContain("teto");
  });
});

describe("quilometragem", () => {
  it("acima do limite, junto com avarias, é o caso previsto na regra", () => {
    const r = avaliar("ruim", "avariado", LIMITE_KM_ALTO + 1);
    expect(r.km_acima_do_limite).toBe(true);
    expect(r.faixa).toBe("avarias_maiores");
    expect(r.sinais.some((s) => s.includes("previsto na regra"))).toBe(true);
  });

  it("acima do limite sem avarias NÃO rebaixa a faixa sozinha — só alerta", () => {
    const r = avaliar("excelente", "impecavel", 200000);
    expect(r.km_acima_do_limite).toBe(true);
    expect(r.faixa).toBe("otimo");
    expect(r.desconto_min).toBe(10);
    expect(r.sinais.some((s) => s.includes("atenção"))).toBe(true);
  });

  it("exatamente no limite ainda não conta como km alto", () => {
    expect(avaliar("bom", "impecavel", LIMITE_KM_ALTO).km_acima_do_limite).toBe(false);
  });

  it("km ausente não inventa alerta", () => {
    const r = avaliar("bom", "impecavel", null);
    expect(r.km_acima_do_limite).toBe(false);
    expect(r.sinais.some((s) => s.includes("km"))).toBe(false);
  });
});

describe("nenhuma combinação chega na FIPE cheia", () => {
  /**
   * A loja compra abaixo da FIPE, sempre. Nenhum estado de conservação, por
   * melhor que seja, pode produzir um valor igual ou acima da tabela — nem
   * no JSON do consultor, nem em qualquer texto que a tela venha a exibir.
   */
  const MECANICAS = ["excelente", "bom", "atencao", "ruim"];
  const CONSERVACOES = ["impecavel", "riscos", "reparos", "avariado"];
  const FIPE_NUMERICA = 100000;

  it("o teto sugerido fica no máximo 10% abaixo da FIPE", () => {
    for (const mecanica of MECANICAS) {
      for (const conservacao of CONSERVACOES) {
        for (const km of [0, 50000, LIMITE_KM_ALTO + 1, 400000]) {
          const r = avaliar(mecanica, conservacao, km);
          expect(r.desconto_min).toBeGreaterThanOrEqual(10);
          expect(r.valor_sugerido_max).not.toBeNull();
          expect(r.valor_sugerido_max!).toBeLessThanOrEqual(FIPE_NUMERICA * 0.9);
        }
      }
    }
  });

  it("o rótulo de toda faixa diz 'abaixo da FIPE'", () => {
    for (const mecanica of MECANICAS) {
      for (const conservacao of CONSERVACOES) {
        expect(avaliar(mecanica, conservacao).faixa_label).toContain("abaixo da FIPE");
      }
    }
  });
});

describe("sem FIPE legível", () => {
  it("mantém a faixa mas omite os valores em reais", () => {
    const r = avaliar("bom", "impecavel", 50000, null);
    expect(r.faixa).toBe("otimo");
    expect(r.valor_sugerido_min).toBeNull();
    expect(r.valor_sugerido_max).toBeNull();
    expect(r.resumo).toBe(r.faixa_label);
  });
});
