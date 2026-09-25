import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  REGRA_DA_RECOMENDACAO,
  colunaDaAvaliacaoAusente,
  estadoPorExtenso,
  lerAvaliacaoDoLead,
  lerValorDaAvaliacao,
  montarAvaliacaoDoLead,
} from "../src/lib/avaliacaoDoLead";
import { recomendarAvaliacao } from "../src/lib/avaliacaoRecomendacao";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BlocoDaAvaliacao from "../src/components/admin/BlocoDaAvaliacao";

/**
 * A avaliação mora no lead (migração 20260924190000).
 *
 * Até 24/09/2026 `/api/avaliacao` gravava do pedido só o `interesse`: km,
 * estado, FIPE, observações e a faixa sugerida iam só para o n8n, e o card do
 * kanban não tinha nada disso. Este arquivo trava as duas pontas:
 *   - a lib: o retrato que se grava e a leitura defensiva que o painel faz;
 *   - a rota EXECUTADA: o retrato vai no insert, a recomendação é a do
 *     servidor (nunca a do corpo), e sem a migração o lead é gravado mesmo
 *     assim — perder o retrato é ruim, perder o lead é o bug de 11/08.
 */

const recomendacao = recomendarAvaliacao({
  estadoMecanico: "bom",
  estadoConservacao: "riscos",
  quilometragem: 55000,
  fipeValor: "R$ 68.000,00",
});

describe("montarAvaliacaoDoLead", () => {
  it("guarda os fatos do formulário, a FIPE em número e a régua", () => {
    const a = montarAvaliacaoDoLead(
      {
        tipo_veiculo: "carros",
        marca: " Fiat ",
        modelo: "Argo Drive 1.0",
        ano: 2021,
        quilometragem: 55000,
        estado_mecanico: "bom",
        estado_conservacao: "riscos",
        observacoes: "único dono",
        fipe_valor: "R$ 68.000,00",
        fipe_codigo: "001234-5",
        fipe_mes_referencia: "setembro de 2026",
      },
      recomendacao,
    );
    expect(a).toMatchObject({
      versao: 1,
      tipo_veiculo: "carros",
      marca: "Fiat",
      modelo: "Argo Drive 1.0",
      ano: 2021,
      veiculo_digitado: false,
      quilometragem: 55000,
      estado_mecanico: "bom",
      estado_conservacao: "riscos",
      observacoes: "único dono",
      fipe: { valor: 68000, codigo: "001234-5", mes_referencia: "setembro de 2026" },
      regra: REGRA_DA_RECOMENDACAO,
    });
    expect(a.recomendacao).toBe(recomendacao);
  });

  it("o que o formulário público manda torto não vira dado", () => {
    const a = montarAvaliacaoDoLead(
      {
        tipo_veiculo: "avioes",
        marca: "x".repeat(500),
        modelo: 42,
        ano: "dois mil",
        quilometragem: "55000",
        estado_mecanico: "perfeito",
        estado_conservacao: "<script>",
        observacoes: "y".repeat(5000),
        fipe_valor: "",
        veiculo_digitado: "true",
      },
      recomendacao,
    );
    expect(a.tipo_veiculo).toBe("carros");
    expect(a.marca).toHaveLength(60);
    expect(a.modelo).toBe("42");
    expect(a.ano).toBeNull();
    expect(a.quilometragem, "km só como número, igual à rota").toBeNull();
    expect(a.estado_mecanico).toBeNull();
    expect(a.estado_conservacao).toBeNull();
    expect(a.observacoes).toHaveLength(1000);
    expect(a.fipe, "sem FIPE é null, nunca zero").toBeNull();
    expect(a.veiculo_digitado, "só o booleano true liga a marca").toBe(false);
  });

  it("chave do protótipo não passa por estado — o card mostraria o código de uma função", () => {
    const a = montarAvaliacaoDoLead(
      { marca: "Fiat", modelo: "Argo", estado_mecanico: "constructor", estado_conservacao: "toString" },
      recomendacao,
    );
    expect(a.estado_mecanico).toBeNull();
    expect(a.estado_conservacao).toBeNull();
  });

  it("FIPE e km absurdos não viram dado — o teto tira o que só pode ser erro ou fraude", () => {
    const a = montarAvaliacaoDoLead(
      { marca: "Fiat", modelo: "Argo", fipe_valor: "R$ 999.999.999.999,00", quilometragem: 9_999_999 },
      recomendacao,
    );
    expect(a.fipe).toBeNull();
    expect(a.quilometragem).toBeNull();
    const plausivel = montarAvaliacaoDoLead(
      { marca: "Fiat", modelo: "Argo", fipe_valor: "R$ 4.500.000,00", quilometragem: 1_200_000 },
      recomendacao,
    );
    expect(plausivel.fipe?.valor).toBe(4_500_000);
    expect(plausivel.quilometragem).toBe(1_200_000);
  });
});

describe("lerAvaliacaoDoLead — o painel não cai por um retrato torto", () => {
  it("devolve o retrato bom", () => {
    const a = montarAvaliacaoDoLead({ marca: "Fiat", modelo: "Argo" }, recomendacao);
    expect(lerAvaliacaoDoLead(JSON.parse(JSON.stringify(a)))).toMatchObject({ marca: "Fiat" });
  });

  it("normaliza cada campo que o card lê — um retrato torto não derruba o painel", () => {
    // As formas que fizeram o card lançar na revisão de 24/09, e mais algumas.
    const tortos: unknown[] = [
      { marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r" } },
      { marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r", sinais: "não é lista" }, fipe: 5 },
      { marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r", sinais: [1, null, "ok"] }, fipe: { valor: "68000" } },
      { marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r" }, quilometragem: "abc", ano: {}, observacoes: 3 },
      { marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r" }, estado_mecanico: "constructor", regra: 7 },
    ];
    for (const bruto of tortos) {
      const a = lerAvaliacaoDoLead(bruto);
      expect(a, JSON.stringify(bruto)).not.toBeNull();
      expect(Array.isArray(a!.recomendacao.sinais)).toBe(true);
      expect(a!.fipe === null || typeof a!.fipe.valor === "number").toBe(true);
      expect(a!.quilometragem === null || typeof a!.quilometragem === "number").toBe(true);
      const html = renderToStaticMarkup(
        createElement(BlocoDaAvaliacao, {
          nome: "Ana",
          avaliacao: bruto,
          valorOfertado: "não é número",
          valorPago: null,
          onSalvar: () => {},
        }),
      );
      expect(html).toContain("Avaliação do site");
      expect(html).not.toContain("function");
    }
    expect(lerAvaliacaoDoLead(tortos[2])!.recomendacao.sinais).toEqual(["ok"]);
  });

  it("devolve null para ausente, lista, texto e forma incompleta", () => {
    for (const bruto of [null, undefined, [], "x", 3, {}, { marca: "Fiat", modelo: "Argo" }, { marca: 1, modelo: "x", recomendacao: { resumo: "r" } }]) {
      expect(lerAvaliacaoDoLead(bruto), JSON.stringify(bruto)).toBeNull();
    }
  });

  it("estado por extenso usa os rótulos da régua", () => {
    expect(estadoPorExtenso({ estado_mecanico: "atencao", estado_conservacao: "reparos" })).toBe(
      "mecânica requer atenção · amassados leves",
    );
    expect(estadoPorExtenso({ estado_mecanico: null, estado_conservacao: null })).toBe("");
  });
});

describe("lerValorDaAvaliacao — ofertado e pago digitados no card", () => {
  it("lê como se digita em português", () => {
    expect(lerValorDaAvaliacao("55.000")).toEqual({ ok: true, valor: 55000 });
    expect(lerValorDaAvaliacao("55.000,50")).toEqual({ ok: true, valor: 55000.5 });
    expect(lerValorDaAvaliacao("R$ 55.000")).toEqual({ ok: true, valor: 55000 });
    expect(lerValorDaAvaliacao(55000)).toEqual({ ok: true, valor: 55000 });
  });

  it("vazio limpa", () => {
    for (const v of ["", "  ", null]) expect(lerValorDaAvaliacao(v)).toEqual({ ok: true, valor: null });
  });

  it("ilegível, zero, negativo e acima do teto RECUSAM — não apagam o que estava", () => {
    for (const v of ["abc", "0", "-100", 0, -1, 100_000_000, "100.000.000"]) {
      expect(lerValorDaAvaliacao(v), String(v)).toEqual({ ok: false });
    }
  });

  it("o ambíguo também recusa, em vez de chutar um número", () => {
    // O leitor do "Valor da venda" tirava todo ponto: "55000.50" virava
    // 5.500.050 e "55,000" virava 55 (revisão de 24/09).
    for (const v of ["55000.50", "55,000", "55.00", "1e5", "5.5000", true, {}, NaN, Infinity]) {
      expect(lerValorDaAvaliacao(v), String(v)).toEqual({ ok: false });
    }
    expect(lerValorDaAvaliacao("55000,5")).toEqual({ ok: true, valor: 55000.5 });
    expect(lerValorDaAvaliacao("1.234.567,89")).toEqual({ ok: true, valor: 1234567.89 });
  });
});

describe("colunaDaAvaliacaoAusente", () => {
  it("reconhece a coluna nova ausente, pelo PostgREST e pelo Postgres", () => {
    expect(
      colunaDaAvaliacaoAusente({ code: "PGRST204", message: "Could not find the 'avaliacao' column of 'leads' in the schema cache" }),
    ).toBe(true);
    expect(colunaDaAvaliacaoAusente({ code: "42703", message: 'column "avaliacao" of relation "leads" does not exist' })).toBe(true);
  });

  it("não confunde com outro erro — esse não pode virar um segundo insert", () => {
    expect(colunaDaAvaliacaoAusente({ code: "PGRST204", message: "Could not find the 'outra' column" })).toBe(false);
    expect(colunaDaAvaliacaoAusente({ code: "23505", message: "duplicate key avaliacao" })).toBe(false);
    expect(colunaDaAvaliacaoAusente(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A rota, executada
// ─────────────────────────────────────────────────────────────────────────────

const inserts: Record<string, unknown>[] = [];
let errosDoInsert: ({ code: string; message: string } | null)[] = [];
const n8n: Record<string, unknown>[] = [];

vi.mock("../src/lib/turnstile", () => ({
  verificarTurnstile: async () => ({ ok: true, hostname: "x", action: "avaliacao" }),
  ACOES_DE_AVALIACAO: ["avaliacao"],
  ipDoVisitante: () => "127.0.0.1",
}));
vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: (tabela: string) => {
      if (tabela !== "leads") throw new Error(`tabela inesperada: ${tabela}`);
      return {
        insert: async (linha: Record<string, unknown>) => {
          inserts.push(linha);
          return { error: errosDoInsert.shift() ?? null };
        },
      };
    },
  }),
}));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ webhooks: { webhookAvaliacaoUrl: "https://n8n.teste/webhook/avaliacao" } }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../src/lib/telemetry", () => ({ logLeadCaptured: () => {}, logApiTelemetry: () => {} }));

const { POST } = await import("../src/app/api/avaliacao/route");

const CORPO = {
  marca: "Fiat",
  modelo: "Argo Drive 1.0",
  ano: 2021,
  estado: "bom / riscos",
  nome: "Cliente de Teste",
  telefone: "(41) 99999-0000",
  tipo_veiculo: "carros",
  fipe_valor: "R$ 68.000,00",
  fipe_codigo: "001234-5",
  fipe_mes_referencia: "setembro de 2026",
  quilometragem: 55000,
  estado_mecanico: "bom",
  estado_conservacao: "riscos",
  observacoes: "único dono",
  // O cliente é público: uma recomendação no corpo é tentativa de ditar preço.
  recomendacao: { faixa: "otimo", desconto_min: 0, desconto_max: 0, resumo: "pague a FIPE cheia" },
  eventId: "ev-1",
  turnstileToken: "tok",
};

const enviar = (corpo: Record<string, unknown>) =>
  POST(
    new NextRequest("http://x/api/avaliacao", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );

beforeEach(() => {
  inserts.length = 0;
  n8n.length = 0;
  errosDoInsert = [];
  globalThis.fetch = (async (_url: string, opcoes?: RequestInit) => {
    n8n.push(JSON.parse(String(opcoes?.body)));
    return { ok: true, status: 200, text: async () => "" };
  }) as never;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/avaliacao grava o retrato no lead", () => {
  it("o insert leva o retrato, com a recomendação do SERVIDOR", async () => {
    const r = await enviar(CORPO);
    expect(r.status).toBe(200);
    expect(inserts).toHaveLength(1);
    const linha = inserts[0];
    expect(linha).toMatchObject({ canal: "Avaliação", interesse: "Fiat Argo Drive 1.0 2021" });
    const avaliacao = lerAvaliacaoDoLead(linha.avaliacao);
    expect(avaliacao, "o retrato precisa ter a forma que o painel lê").not.toBeNull();
    expect(avaliacao).toMatchObject({
      quilometragem: 55000,
      estado_mecanico: "bom",
      estado_conservacao: "riscos",
      fipe: { valor: 68000 },
      observacoes: "único dono",
    });
    expect(avaliacao!.recomendacao).toEqual(recomendacao);
    expect(avaliacao!.recomendacao.resumo).not.toContain("FIPE cheia");
  });

  it("carro digitado (FIPE fora) vai marcado no retrato e no n8n", async () => {
    await enviar({ ...CORPO, fipe_valor: "", fipe_codigo: "", fipe_mes_referencia: "", veiculo_digitado: true });
    const avaliacao = lerAvaliacaoDoLead(inserts[0].avaliacao)!;
    expect(avaliacao.veiculo_digitado).toBe(true);
    expect(avaliacao.fipe).toBeNull();
    expect(n8n[0]).toMatchObject({ veiculo_digitado: true, recomendacao: { valor_sugerido_max: null } });
  });

  it("sem a migração, o lead é gravado de novo sem o retrato", async () => {
    errosDoInsert = [{ code: "PGRST204", message: "Could not find the 'avaliacao' column of 'leads' in the schema cache" }];
    const r = await enviar(CORPO);
    expect(r.status).toBe(200);
    expect(inserts).toHaveLength(2);
    expect(inserts[1]).not.toHaveProperty("avaliacao");
    expect(inserts[1]).toMatchObject({ canal: "Avaliação", nome: "Cliente de Teste", event_id: "ev-1" });
  });

  it("FIPE absurda do corpo não vira faixa sugerida de bilhões", async () => {
    await enviar({ ...CORPO, fipe_valor: "R$ 999.999.999.999,00" });
    const avaliacao = lerAvaliacaoDoLead(inserts[0].avaliacao)!;
    expect(avaliacao.fipe).toBeNull();
    expect(avaliacao.recomendacao.valor_sugerido_max).toBeNull();
    expect(n8n[0]).toMatchObject({ recomendacao: { valor_sugerido_max: null } });
  });

  it("outro erro de gravação não vira segundo insert, e não segura o cliente", async () => {
    errosDoInsert = [{ code: "23505", message: "duplicate key value" }];
    const r = await enviar(CORPO);
    expect(r.status).toBe(200);
    expect(inserts).toHaveLength(1);
    expect(n8n, "o n8n recebe mesmo assim").toHaveLength(1);
  });
});
