import { describe, it, expect } from "vitest";
import {
  derivarMetricas,
  avaliarInstrumentos,
  portoesAprendizagem,
  leituraImatura,
  diagnosticar,
  consolidarTotais,
  FAIXAS_SAUDAVEIS,
  type LeituraTotais,
  type AnuncioComTotais,
} from "../src/lib/midiaPaga";

/**
 * Testes das métricas de mídia paga (telas A13/A14).
 *
 * O vetor de referência é o exemplo TRABALHADO no design doc — a campanha
 * "Carros até 85K" com R$ 6,21 investidos, 417 impressões, alcance 277,
 * 20 cliques e 2 conversas. O doc imprime os resultados na tela (CPM
 * R$ 14,89 · CTR 4,80% · CPC R$ 0,31 · R$ 3,11/conversa · 10,0% ·
 * frequência 1,51); se as fórmulas daqui divergirem disso, o painel mostra
 * um número diferente do que o gerenciador do Meta mostra ao dono.
 */

const CAMPANHA_DO_DOC: LeituraTotais = {
  investido: 6.21,
  impressoes: 417,
  alcance: 277,
  cliques: 20,
  conversas: 2,
};

describe("derivarMetricas", () => {
  it("reproduz o exemplo trabalhado do design doc", () => {
    const m = derivarMetricas(CAMPANHA_DO_DOC);
    expect(m.cpm).toBeCloseTo(14.89, 1);
    expect(m.ctr).toBeCloseTo(0.048, 3);
    expect(m.cpc).toBeCloseTo(0.31, 2);
    expect(m.custoPorConversa).toBeCloseTo(3.11, 2);
    expect(m.cliqueParaConversa).toBeCloseTo(0.1, 3);
    expect(m.frequencia).toBeCloseTo(1.51, 2);
  });

  it("devolve null nas divisões por zero, em vez de NaN ou Infinity", () => {
    const m = derivarMetricas({
      investido: 10,
      impressoes: 0,
      alcance: 0,
      cliques: 0,
      conversas: 0,
    });
    expect(m.cpm).toBeNull();
    expect(m.ctr).toBeNull();
    expect(m.cpc).toBeNull();
    expect(m.custoPorConversa).toBeNull();
    expect(m.cliqueParaConversa).toBeNull();
    expect(m.frequencia).toBeNull();
  });
});

describe("avaliarInstrumentos", () => {
  it("a campanha do doc fica saudável em todos os instrumentos com leitura", () => {
    const inst = avaliarInstrumentos(derivarMetricas(CAMPANHA_DO_DOC));
    // CPM 14,89 ≤ 18 · CTR 4,8% ≥ 2% · CPC 0,31 ≤ 0,80 · R$ 3,11 ≤ 15 ·
    // 10% ≥ 8% · frequência 1,51 ≤ 1,8
    for (const i of inst) {
      expect(i.estado).toBe("saudavel");
    }
  });

  it("marca fora da faixa acima/abaixo dos limites do doc", () => {
    const inst = avaliarInstrumentos(
      derivarMetricas({
        investido: 100, // CPM 200 (fora), CPC 10 (fora)
        impressoes: 500, // CTR 2% cravado (dentro — o limite é inclusivo)
        alcance: 100, // frequência 5 (fora)
        cliques: 10,
        conversas: 0, // sem conversa → sem leitura de custo/conversão
      }),
    );
    const porChave = Object.fromEntries(inst.map((i) => [i.chave, i]));
    expect(porChave.cpm.estado).toBe("fora");
    expect(porChave.ctr.estado).toBe("saudavel");
    expect(porChave.cpc.estado).toBe("fora");
    expect(porChave.frequencia.estado).toBe("fora");
    expect(porChave.custoPorConversa.estado).toBe("sem_leitura");
    // Houve clique e nenhuma conversa: 0% é leitura válida — e fora da faixa.
    expect(porChave.cliqueParaConversa.estado).toBe("fora");
  });
});

describe("portoesAprendizagem", () => {
  it("a campanha do doc não passa em nenhum portão (2/50 · 26/72 h · 6,21/150)", () => {
    const portoes = portoesAprendizagem(CAMPANHA_DO_DOC, 26, 30);
    expect(portoes).toHaveLength(3);
    expect(portoes[0].fracao).toBeCloseTo(2 / 50, 3);
    expect(portoes[1].fracao).toBeCloseTo(26 / 72, 3);
    expect(portoes[2].alvo).toBe(150); // 5× R$ 30
    expect(leituraImatura(portoes)).toBe(true);
  });

  it("fecha os portões quando os três limites são atingidos", () => {
    const portoes = portoesAprendizagem(
      { investido: 200, impressoes: 9000, alcance: 5000, cliques: 300, conversas: 55 },
      100,
      30,
    );
    expect(leituraImatura(portoes)).toBe(false);
  });

  it("omite portões sem base de cálculo em vez de inventar alvo", () => {
    const portoes = portoesAprendizagem(CAMPANHA_DO_DOC, null, null);
    expect(portoes).toHaveLength(1);
    expect(portoes[0].rotulo).toBe("Conversas iniciadas");
  });
});

describe("diagnosticar", () => {
  // Os 7 anúncios da campanha do doc, com os números da tabela de entrada.
  const anuncios: AnuncioComTotais[] = [
    { nome: "Uno Mille", totais: { investido: 4.46, impressoes: 350, alcance: 246, cliques: 18, conversas: 2 } },
    { nome: "SPIN", totais: { investido: 0.69, impressoes: 31, alcance: 23, cliques: 1, conversas: 0 } },
    { nome: "Saveiro", totais: { investido: 0.27, impressoes: 8, alcance: 6, cliques: 0, conversas: 0 } },
    { nome: "UP! MOVE", totais: { investido: 0.22, impressoes: 8, alcance: 7, cliques: 1, conversas: 0 } },
    { nome: "i30", totais: { investido: 0.21, impressoes: 5, alcance: 5, cliques: 0, conversas: 0 } },
    { nome: "March Rio", totais: { investido: 0.2, impressoes: 9, alcance: 8, cliques: 0, conversas: 0 } },
    { nome: "Onix Plus", totais: { investido: 0.16, impressoes: 6, alcance: 6, cliques: 0, conversas: 0 } },
  ];

  it("reproduz os quatro cartões do doc para a campanha de exemplo", () => {
    const metricas = derivarMetricas(CAMPANHA_DO_DOC);
    const portoes = portoesAprendizagem(CAMPANHA_DO_DOC, 26, 30);
    const d = diagnosticar(anuncios, CAMPANHA_DO_DOC, metricas, portoes, 26, 30);

    const niveis = d.map((x) => x.nivel);
    expect(niveis).toContain("ESPERAR"); // leitura imatura
    expect(niveis).toContain("ATENÇÃO"); // concentração + frios
    expect(niveis).toContain("BOM"); // CTR 4,8%

    // Concentração: Uno Mille leva 4,46/6,21 = 72% do orçamento.
    const concentracao = d.find((x) => x.titulo.includes("Uno Mille"));
    expect(concentracao?.titulo).toContain("72%");

    // Frios: 6 dos 7 anúncios têm menos de 100 impressões.
    const frios = d.find((x) => x.titulo.includes("sem entrega"));
    expect(frios?.titulo).toContain("6");
    // Sugestão de diário para ler todos: 15 × 7 = R$ 105, como no doc.
    expect(frios?.ajuste).toContain("105");
  });

  it("sem imaturidade e sem concentração, só resta o cartão de CTR", () => {
    const totais: LeituraTotais = {
      investido: 300,
      impressoes: 20000,
      alcance: 12000,
      cliques: 500,
      conversas: 60,
    };
    const tresIguais: AnuncioComTotais[] = [
      { nome: "A", totais: { investido: 100, impressoes: 7000, alcance: 4000, cliques: 170, conversas: 20 } },
      { nome: "B", totais: { investido: 100, impressoes: 7000, alcance: 4000, cliques: 170, conversas: 20 } },
      { nome: "C", totais: { investido: 100, impressoes: 6000, alcance: 4000, cliques: 160, conversas: 20 } },
    ];
    const metricas = derivarMetricas(totais);
    const portoes = portoesAprendizagem(totais, 100, 30);
    const d = diagnosticar(tresIguais, totais, metricas, portoes, 100, 30);
    expect(d.map((x) => x.nivel)).toEqual(["BOM"]);
  });
});

describe("consolidarTotais", () => {
  it("soma dos anúncios, mas alcance vem da linha da campanha", () => {
    const t = consolidarTotais(
      [
        { investido: 4.46, impressoes: 350, alcance: 246, cliques: 18, conversas: 2 },
        { investido: 0.69, impressoes: 31, alcance: 23, cliques: 1, conversas: 0 },
        null, // anúncio ainda sem leitura não zera a soma
      ],
      { investido: 0, impressoes: 0, alcance: 277, cliques: 0, conversas: 0 },
    );
    expect(t.investido).toBeCloseTo(5.15, 2);
    expect(t.impressoes).toBe(381);
    // 246 + 23 = 269 estaria ERRADO: quem viu os dois anúncios contaria duas
    // vezes. O alcance certo é o da campanha.
    expect(t.alcance).toBe(277);
  });

  it("sem leitura por anúncio, a linha da campanha responde por tudo", () => {
    const t = consolidarTotais([], {
      investido: 6.21,
      impressoes: 417,
      alcance: 277,
      cliques: 20,
      conversas: 2,
    });
    expect(t.investido).toBeCloseTo(6.21, 2);
    expect(t.impressoes).toBe(417);
  });
});

describe("faixas do doc", () => {
  it("continuam as que o design doc imprime na tela", () => {
    // Se alguém "ajustar" uma faixa aqui sem mudar o doc, o painel passa a
    // discordar da régua que o dono calibrou.
    expect(FAIXAS_SAUDAVEIS.cpmMax).toBe(18);
    expect(FAIXAS_SAUDAVEIS.ctrMin).toBe(0.02);
    expect(FAIXAS_SAUDAVEIS.cpcMax).toBe(0.8);
    expect(FAIXAS_SAUDAVEIS.custoPorConversaMax).toBe(15);
    expect(FAIXAS_SAUDAVEIS.cliqueParaConversaMin).toBe(0.08);
    expect(FAIXAS_SAUDAVEIS.frequenciaMax).toBe(1.8);
    expect(FAIXAS_SAUDAVEIS.custoPorLeadMax).toBe(180);
  });
});
