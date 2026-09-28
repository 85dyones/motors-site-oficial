import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANO_MAIS_ANTIGO_FINANCIADO,
  BANCOS_PARCEIROS,
  calculateFinancing,
  financiavel,
  PARAMETROS_DE_FABRICA,
  taxaVariaMais,
  type ParametrosDoFinanciamento,
} from "../src/lib/finance-calculator";
import {
  lerLinhaDoFinanciamento,
  normalizarBancos,
  parametrosDaVigencia,
  validarVigenciaNova,
  vigenciaDosParametros,
} from "../src/lib/parametrosDoFinanciamento";
import {
  lerParametrosDoFinanciamento,
  type ClienteDeLeitura,
} from "../src/lib/parametrosDoFinanciamento-servidor";
import {
  AVISO_DA_SIMULACAO,
  avisoDeCredito,
  textoDosBancos,
  textoSemEstimativa,
} from "../src/lib/textoDaParcela";
import {
  carrosNaFaixa,
  criteriosDoPerfil,
  parcelaDoPedido,
  recomendar,
  simularParcela,
  type Ocupacao,
} from "../src/lib/motorDoMatch";
import { ESTOQUE_DE_25_09 } from "./estoque-de-25-09";

/**
 * As condições do simulador como dado (dono, 28/09/2026).
 *
 *   1. "temos bancos parceiros que parcelam carros até 2009, abaixo disso
 *      muito difícil" → carro anterior a 2009 não recebe estimativa;
 *   2. o aviso do dono, "Simulação, não é oferta de crédito. Sujeito a
 *      aprovação mediante validação de cadastro.", com os bancos parceiros;
 *   3. "sim, gostaria muito de ter isso disponível" → as taxas saem do código
 *      para `parametros_financiamento`, com vigência, editável no painel.
 */

const LINHA_DO_SEED = {
  id: "11111111-1111-1111-1111-111111111111",
  taxa_excelente_am: "1.79",
  taxa_regular_am: "1.95",
  taxa_risco_am: "2.70",
  ano_de_referencia: 2026,
  ano_mais_antigo: 2009,
  bancos_parceiros: [...BANCOS_PARCEIROS],
  fonte_das_taxas: "média de 18 instituições, Banco Central, jul–set/2026",
  vigencia_desde: "2026-09-28",
  vigencia_ate: null,
};

describe("1 · a régua da vigência nova — a mesma dos CHECKs da migração", () => {
  const valida = {
    taxaExcelenteAm: 1.79,
    taxaRegularAm: 1.95,
    taxaRiscoAm: 2.7,
    anoDeReferencia: 2026,
    anoMaisAntigo: 2009,
    bancosParceiros: ["Sicredi", "Safra"],
    fonteDasTaxas: "média de mercado",
    descricao: "",
  };

  it("aceita a vigência do seed", () => {
    const r = validarVigenciaNova(valida);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valores.descricao).toBeNull();
  });

  it("recusa taxa zero, negativa, acima de 10% e fora de ordem — e diz todas de uma vez", () => {
    const r = validarVigenciaNova({ ...valida, taxaExcelenteAm: 0, taxaRegularAm: 11, taxaRiscoAm: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros).toHaveLength(3);

    const fora = validarVigenciaNova({ ...valida, taxaExcelenteAm: 2.5, taxaRegularAm: 1.9 });
    expect(fora.ok).toBe(false);
    if (!fora.ok) expect(fora.erros.join(" ")).toContain("em ordem");
  });

  it("recusa ano mais antigo depois do ano de referência, e ano quebrado", () => {
    expect(validarVigenciaNova({ ...valida, anoMaisAntigo: 2027 }).ok).toBe(false);
    expect(validarVigenciaNova({ ...valida, anoMaisAntigo: 2009.5 }).ok).toBe(false);
    expect(validarVigenciaNova({ ...valida, anoDeReferencia: 2019 }).ok).toBe(false);
  });

  it("sem banco parceiro não grava: o aviso de crédito nomeia com quem a loja trabalha", () => {
    expect(validarVigenciaNova({ ...valida, bancosParceiros: [" ", ""] }).ok).toBe(false);
    expect(validarVigenciaNova({ ...valida, fonteDasTaxas: "   " }).ok).toBe(false);
  });

  it("os bancos chegam limpos: sem espaço sobrando, sem repetido, na ordem do dono", () => {
    expect(normalizarBancos([" Sicredi ", "safra", "Safra", "", "Banco  Pan", 7])).toEqual([
      "Sicredi",
      "safra",
      "Banco Pan",
    ]);
    // O formulário manda uma caixa de texto, um por linha.
    const r = validarVigenciaNova({ ...valida, bancosParceiros: "Sicredi\nSafra, Itaú;Banco C6\n" });
    expect(r.ok && r.valores.bancosParceiros).toEqual(["Sicredi", "Safra", "Itaú", "Banco C6"]);
  });

  it("as taxas ficam com as duas casas que o banco guarda", () => {
    const r = validarVigenciaNova({ ...valida, taxaExcelenteAm: 1.789, taxaRegularAm: "1.951" });
    expect(r.ok && [r.valores.taxaExcelenteAm, r.valores.taxaRegularAm]).toEqual([1.79, 1.95]);
  });
});

describe("2 · a linha do banco vira parâmetro — e linha torta não vira taxa", () => {
  it("o seed lido é igual aos valores de fábrica", () => {
    const p = lerLinhaDoFinanciamento(LINHA_DO_SEED);
    expect(p).not.toBeNull();
    expect(p!.taxas.excelente).toBeCloseTo(PARAMETROS_DE_FABRICA.taxas.excelente, 10);
    expect(p!.taxas.regular).toBeCloseTo(PARAMETROS_DE_FABRICA.taxas.regular, 10);
    expect(p!.taxas.risco).toBeCloseTo(PARAMETROS_DE_FABRICA.taxas.risco, 10);
    expect({ ...p!, id: null, vigenciaDesde: null, taxas: PARAMETROS_DE_FABRICA.taxas }).toEqual(PARAMETROS_DE_FABRICA);
    expect(p!.id).toBe(LINHA_DO_SEED.id);
    expect(p!.vigenciaDesde).toBe("2026-09-28");
  });

  it("campo torto ou ausente devolve null", () => {
    expect(lerLinhaDoFinanciamento(null)).toBeNull();
    expect(lerLinhaDoFinanciamento({ ...LINHA_DO_SEED, taxa_regular_am: null })).toBeNull();
    expect(lerLinhaDoFinanciamento({ ...LINHA_DO_SEED, bancos_parceiros: "Sicredi" })).toBeNull();
    expect(lerLinhaDoFinanciamento({ ...LINHA_DO_SEED, taxa_risco_am: "1.00" })).toBeNull();
  });

  it("o formulário parte da vigência e volta a ela sem perder nada", () => {
    const ida = vigenciaDosParametros(PARAMETROS_DE_FABRICA);
    expect(ida).toMatchObject({ taxaExcelenteAm: 1.79, taxaRegularAm: 1.95, taxaRiscoAm: 2.7, anoMaisAntigo: 2009 });
    const volta = parametrosDaVigencia(ida);
    expect(volta.taxas.regular).toBeCloseTo(PARAMETROS_DE_FABRICA.taxas.regular, 10);
    expect(volta.bancosParceiros).toEqual(PARAMETROS_DE_FABRICA.bancosParceiros);
  });
});

describe("3 · a leitura do servidor: falha vira os valores de fábrica, nunca parcela sumida", () => {
  const cliente = (resposta: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>) =>
    ({
      from: () => ({
        select: () => ({
          is: () => ({ lte: () => ({ order: () => ({ limit: () => resposta() }) }) }),
        }),
      }),
    }) as unknown as ClienteDeLeitura;

  it("a linha vigente vale", async () => {
    const outra = { ...LINHA_DO_SEED, taxa_regular_am: 2.1, taxa_risco_am: 3, ano_mais_antigo: 2011 };
    const p = await lerParametrosDoFinanciamento(cliente(async () => ({ data: [outra], error: null })));
    expect(p.taxas.regular).toBeCloseTo(0.021, 10);
    expect(p.anoMaisAntigo).toBe(2011);
  });

  it("erro, vazio, linha torta e exceção caem nos de fábrica", async () => {
    const casos = [
      async () => ({ data: null, error: { message: 'relation "parametros_financiamento" does not exist' } }),
      async () => ({ data: [], error: null }),
      async () => ({ data: [{ ...LINHA_DO_SEED, fonte_das_taxas: "" }], error: null }),
      async () => {
        throw new Error("rede caiu");
      },
    ];
    for (const caso of casos) {
      expect(await lerParametrosDoFinanciamento(cliente(caso))).toBe(PARAMETROS_DE_FABRICA);
    }
  });
});

describe("4 · a conta usa a vigência, e não a constante", () => {
  const pedido = { vehiclePrice: 60000, vehicleYear: 2020, downPaymentValue: 20000, installments: 48, occupation: "clt" as const };

  it("taxa maior na vigência, parcela maior na tela", () => {
    const caro: ParametrosDoFinanciamento = {
      ...PARAMETROS_DE_FABRICA,
      taxas: { excelente: 0.025, regular: 0.028, risco: 0.035 },
    };
    const deFabrica = calculateFinancing(pedido);
    const daVigencia = calculateFinancing(pedido, caro);
    // 2020 contra 2026 são 6 anos, fora do degrau de idade: CLT com 33% de
    // entrada soma 40 pontos, perfil de risco — a taxa de risco da vigência.
    expect(daVigencia.taxa_aplicada_mes_pct).toBeCloseTo(3.5, 10);
    expect(daVigencia.parcela_mensal).toBeGreaterThan(deFabrica.parcela_mensal);
  });

  it("a idade do carro conta do ano de referência da vigência — nunca do relógio", () => {
    // Um 2020 contra 2026 tem 6 anos (fora do degrau de idade); contra 2024,
    // 4 (dentro). Com entrada de 20% e CLT, isso é o que separa regular de risco.
    const em2024 = calculateFinancing(pedido, { ...PARAMETROS_DE_FABRICA, anoDeReferencia: 2024 });
    const em2026 = calculateFinancing(pedido, PARAMETROS_DE_FABRICA);
    expect(em2024.taxa_aplicada_mes_pct).toBeLessThan(em2026.taxa_aplicada_mes_pct);
    expect(taxaVariaMais(2020, PARAMETROS_DE_FABRICA)).toBe(true);
    expect(taxaVariaMais(2020, { ...PARAMETROS_DE_FABRICA, anoDeReferencia: 2024 })).toBe(false);
  });
});

describe("5 · carro anterior a 2009: sem estimativa (dono, 28/09/2026)", () => {
  it("2009 financia; 2008 e o Fusca 1976 não", () => {
    expect(ANO_MAIS_ANTIGO_FINANCIADO).toBe(2009);
    expect(financiavel(2009, PARAMETROS_DE_FABRICA)).toBe(true);
    expect(financiavel(2008, PARAMETROS_DE_FABRICA)).toBe(false);
    expect(financiavel(1976, PARAMETROS_DE_FABRICA)).toBe(false);
    expect(financiavel(Number.NaN, PARAMETROS_DE_FABRICA)).toBe(false);
    expect(financiavel(2011, { ...PARAMETROS_DE_FABRICA, anoMaisAntigo: 2012 })).toBe(false);
  });

  const fusca = ESTOQUE_DE_25_09.find((v) => v.ano === 1976);

  it("o fixture tem o carro que motivou a regra", () => {
    // O PR #158 registrava: "hoje um Fusca 1976 recebe parcela".
    expect(fusca, "o Fusca 1976 do pátio de 25/09").toBeTruthy();
  });

  it("no POR MÊS ele some da busca, dos cartões, da carta e da lista — a não ser que a entrada o cubra", () => {
    const ocupacoes: Ocupacao[] = ["clt", "publico", "autonomo"];
    for (const ocupacao of ocupacoes) {
      for (const max of [800, 1500, 3000, 5000]) {
        for (const entrada of [0, 20000]) {
          const c = criteriosDoPerfil({ orcamento: { min: 0, max: null }, parcela: { max, entrada, prazo: 48, ocupacao } });
          const r = recomendar(ESTOQUE_DE_25_09, c);
          const vistos = [...r.cartoes.map((x) => x.veiculo), ...r.outros, ...(r.coringa ? [r.coringa.veiculo] : [])];
          const velhos = vistos.filter((v) => v.ano < 2009);
          expect(velhos.map((v) => `${v.modelo} ${v.ano}`), `${ocupacao} R$ ${max} entrada ${entrada}`).toEqual([]);
          expect(carrosNaFaixa(ESTOQUE_DE_25_09, c).some((v) => v.ano < 2009)).toBe(false);
        }
      }
    }
    // Com entrada que paga o carro não há financiamento: não há o que o banco recusar.
    const cobre = criteriosDoPerfil({
      orcamento: { min: 0, max: null },
      parcela: { max: 500, entrada: 40000, prazo: 48, ocupacao: "clt" },
    });
    expect(simularParcela(fusca!, cobre.parcela!)?.parcela_mensal).toBe(0);
  });

  it("a parcela do cartão diz 'sem estimativa' em vez de inventar uma", () => {
    const c = criteriosDoPerfil({
      orcamento: { min: 0, max: null },
      parcela: { max: 1500, entrada: 0, prazo: 48, ocupacao: "clt" },
    });
    expect(simularParcela(fusca!, c.parcela!)).toBeNull();
    expect(parcelaDoPedido(fusca!, c.parcela!)).toBeNull();
    expect(textoSemEstimativa(2009)).toBe(
      "Sem estimativa de parcela: os bancos parceiros financiam carros de 2009 em diante.",
    );
  });

  it("fora do POR MÊS o carro continua no resultado — a regra é da parcela, não do pátio", () => {
    const c = criteriosDoPerfil({ orcamento: { min: 0, max: 35000 } });
    expect(carrosNaFaixa(ESTOQUE_DE_25_09, c).some((v) => v.ano === 1976)).toBe(true);
  });

  it("a vigência manda: com o ano mais antigo em 2015, os de 2013 e 2014 também saem", () => {
    const parametros = { ...PARAMETROS_DE_FABRICA, anoMaisAntigo: 2015 };
    const c = criteriosDoPerfil({
      orcamento: { min: 0, max: null },
      parcela: { max: 5000, entrada: 0, prazo: 60, ocupacao: "publico", parametros },
    });
    expect(c.parcela!.parametros).toBe(parametros);
    const passam = carrosNaFaixa(ESTOQUE_DE_25_09, c);
    expect(passam.length).toBeGreaterThan(0);
    expect(passam.every((v) => v.ano >= 2015)).toBe(true);
  });
});

describe("6 · o aviso do dono, sempre com os bancos parceiros", () => {
  it("é o texto do dono, palavra por palavra", () => {
    expect(AVISO_DA_SIMULACAO).toBe(
      "Simulação, não é oferta de crédito. Sujeito a aprovação mediante validação de cadastro.",
    );
  });

  it("os bancos vêm nomeados, com o 'entre outros' do dono", () => {
    expect(textoDosBancos(BANCOS_PARCEIROS)).toBe(
      "Bancos parceiros: Sicredi, Safra, Banco Pan, Santander, Bradesco, Itaú, BV Financeira, Banco C6, Mercado Pago, Banco BBC, entre outros.",
    );
    expect(avisoDeCredito(BANCOS_PARCEIROS)).toBe(`${AVISO_DA_SIMULACAO} ${textoDosBancos(BANCOS_PARCEIROS)}`);
    // Lista vazia não vira "Bancos parceiros: , entre outros."
    expect(textoDosBancos([" "])).toBe("");
    expect(avisoDeCredito([])).toBe(AVISO_DA_SIMULACAO);
  });
});

describe("7 · os valores de fábrica são o seed da migração — nenhuma parcela muda na troca", () => {
  // Quando a leitura do banco falha, o site simula com os de fábrica. Se eles
  // divergirem do seed, a mesma ficha mostraria duas parcelas conforme o
  // banco respondesse ou não.
  const sql = readFileSync(
    join(__dirname, "..", "supabase", "migrations", "20260928120000_parametros_financiamento.sql"),
    "utf8",
  );
  const seed = sql.slice(sql.indexOf("-- 6. A semente"), sql.indexOf("where not exists (select 1 from public.parametros_financiamento)"));

  it("taxas, anos, bancos e fonte", () => {
    const f = PARAMETROS_DE_FABRICA;
    const pct = (x: number) => (Math.round(x * 10000) / 100).toFixed(2);
    expect(seed).toContain(`${pct(f.taxas.excelente)}, ${pct(f.taxas.regular)}, ${pct(f.taxas.risco)},`);
    expect(seed).toContain(`${f.anoDeReferencia}, ${f.anoMaisAntigo},`);
    const bancos = [...seed.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(bancos.slice(0, f.bancosParceiros.length)).toEqual([...f.bancosParceiros]);
    expect(seed).toContain(`'${f.fonteDasTaxas}'`);
  });
});

describe("8 · a calculadora da ficha desenha a regra", () => {
  const desenhar = async (ano: number, parametros = PARAMETROS_DE_FABRICA) => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { default: CalculadoraFinanciamento } = await import("../src/components/CalculadoraFinanciamento");
    return renderToStaticMarkup(
      createElement(CalculadoraFinanciamento, {
        vehicleId: "1",
        vehiclePrice: 30900,
        vehicleYear: ano,
        vehicleName: "Volkswagen Fusca 1300L",
        parametros,
        onSimulateClick: () => {},
      }),
    ).replace(/&quot;/g, '"');
  };

  it("carro anterior a 2009: 'sem estimativa', e nenhuma parcela na tela", async () => {
    const html = await desenhar(1976);
    expect(html).toContain(textoSemEstimativa(2009));
    expect(html).not.toContain("PARCELA ESTIMADA");
    expect(html).not.toContain("CET");
    expect(html).toContain("FALAR COM UM CONSULTOR");
  });

  it("carro de 2009 em diante: a parcela vem com o aviso do dono e os bancos", async () => {
    const html = await desenhar(2020);
    expect(html).toContain("PARCELA ESTIMADA");
    expect(html).toContain(AVISO_DA_SIMULACAO);
    expect(html).toContain("Bancos parceiros: Sicredi, Safra, Banco Pan");
    expect(html).toContain(`Taxas estimadas pela ${PARAMETROS_DE_FABRICA.fonteDasTaxas}`);
  });

  it("a vigência manda também aqui: ano mais antigo em 2021 tira o 2020", async () => {
    const html = await desenhar(2020, { ...PARAMETROS_DE_FABRICA, anoMaisAntigo: 2021 });
    expect(html).toContain(textoSemEstimativa(2021));
  });
});
