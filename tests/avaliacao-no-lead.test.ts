import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  REGRA_TRES_FAIXAS,
  SEM_REGUA,
  colunaDaAvaliacaoAusente,
  estadoPorExtenso,
  lerAvaliacaoDoLead,
  lerValorDaAvaliacao,
  montarAvaliacaoDoLead,
} from "../src/lib/avaliacaoDoLead";
import { REGRA_DA_CURVA, lerParametrosDaCurva, recomendarAvaliacao } from "../src/lib/avaliacaoRecomendacao";
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

/** A linha vigente de `parametros_avaliacao`, como o PostgREST a devolve. */
const LINHA_DA_REGUA = {
  id: "69838e3c-0ec2-4092-94c7-fda9bdd26727",
  base_pp: "20.00",
  estado_excepcional_pp: "-5.00",
  piso_pct: "15.00",
  teto_pct: "40.00",
  km_por_ano: 15000,
  degraus_km: [
    { pp: 0, desvio_km_ate: 5000 },
    { pp: 2, desvio_km_ate: 15000 },
    { pp: 4, desvio_km_ate: 30000 },
    { pp: 7, desvio_km_ate: 50000 },
    { pp: 10, desvio_km_ate: null },
  ],
  avaria_leve_pp: "[2,4]",
  avaria_seria_pp: "[8,12]",
  pendencia_pp: "[3,5]",
  vigencia_desde: "2026-08-30",
  vigencia_ate: null,
};

/** "Hoje" fixo: a idade do carro — e o degrau de km — dependem dele. */
const HOJE = new Date(Date.UTC(2026, 8, 24, 15));

const recomendacao = recomendarAvaliacao({
  estadoMecanico: "bom",
  estadoConservacao: "riscos",
  quilometragem: 55000,
  anoModelo: 2021,
  fipeValor: "R$ 68.000,00",
  parametros: lerParametrosDaCurva(LINHA_DA_REGUA),
  hoje: HOJE,
})!;

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
      regra: REGRA_DA_CURVA,
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
      { versao: 1, marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r" } },
      { versao: 1, marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r", sinais: "não é lista" }, fipe: 5 },
      { versao: 1, marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r", sinais: [1, null, "ok"] }, fipe: { valor: "68000" } },
      { versao: 1, marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r" }, quilometragem: "abc", ano: {}, observacoes: 3 },
      { versao: 1, marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r" }, estado_mecanico: "constructor", regra: 7 },
      // Componentes tortos da curva: o que não tem nome e números cai fora.
      { versao: 1, marca: "Fiat", modelo: "Argo", recomendacao: { resumo: "r", componentes: [{ nome: "km" }, 3, { nome: "base", pp_min: 20, pp_max: 20 }] } },
      // Régua indisponível no envio: sem recomendação, o retrato continua de pé.
      { versao: 1, marca: "Fiat", modelo: "Argo", recomendacao: null, regra: "sem_regua" },
      // Curva com `parametros_desde` torto: a revisão de 25/09 derrubou o card
      // com a lista (o regex aprovava `String(["2026-08-30"])` e o `split` lançava).
      { versao: 1, marca: "Fiat", modelo: "Argo", regra: REGRA_DA_CURVA, recomendacao: { resumo: "r", parametros_desde: ["2026-08-30"] } },
      { versao: 1, marca: "Fiat", modelo: "Argo", regra: REGRA_DA_CURVA, recomendacao: { resumo: "r", parametros_desde: 20260830, desconto_min: "20", valor_sugerido_max: {} } },
    ];
    for (const bruto of tortos) {
      const a = lerAvaliacaoDoLead(bruto);
      expect(a, JSON.stringify(bruto)).not.toBeNull();
      expect(a!.recomendacao === null || Array.isArray(a!.recomendacao.sinais)).toBe(true);
      expect(a!.recomendacao === null || Array.isArray(a!.recomendacao.componentes)).toBe(true);
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
    expect(lerAvaliacaoDoLead(tortos[2])!.recomendacao!.sinais).toEqual(["ok"]);
    expect(lerAvaliacaoDoLead(tortos[5])!.recomendacao!.componentes).toEqual([
      { nome: "base", pp_min: 20, pp_max: 20, motivo: "" },
    ]);
    const semRegua = renderToStaticMarkup(
      createElement(BlocoDaAvaliacao, { nome: "Ana", avaliacao: tortos[6], valorOfertado: null, valorPago: null, onSalvar: () => {} }),
    );
    expect(semRegua).toContain("sem sugestão");
    expect(semRegua).toContain("Sem régua legível no envio");
    const desdeTorto = lerAvaliacaoDoLead(tortos[7])!.recomendacao!;
    expect(desdeTorto.parametros_desde).toBeNull();
    const numerosTortos = lerAvaliacaoDoLead(tortos[8])!.recomendacao!;
    expect([numerosTortos.parametros_desde, numerosTortos.desconto_min, numerosTortos.valor_sugerido_max]).toEqual([null, null, null]);
  });

  it("o retrato da régua de 3 faixas continua legível no card", () => {
    // Gravado entre 24/09 e a troca: sem componentes, e com sinais que em parte
    // só repetiam estado e km — o card mostra apenas os avisos de "acima de".
    const legado = {
      versao: 1,
      marca: "VW",
      modelo: "Gol 1.0",
      ano: 2011,
      quilometragem: 250000,
      regra: REGRA_TRES_FAIXAS,
      recomendacao: {
        faixa: "bom",
        resumo: "Deságio de 15% a 20% sobre a FIPE",
        sinais: ["mecânica boa", "km acima de 150 mil: conferir revisões"],
        desconto_min: 15,
        desconto_max: 20,
      },
    };
    const a = lerAvaliacaoDoLead(legado)!;
    expect(a.regra).toBe(REGRA_TRES_FAIXAS);
    expect(a.recomendacao!.componentes).toEqual([]);
    expect(a.recomendacao!.parametros_desde).toBeNull();
    const html = renderToStaticMarkup(
      createElement(BlocoDaAvaliacao, { nome: "Ana", avaliacao: legado, valorOfertado: null, valorPago: null, onSalvar: () => {} }),
    );
    expect(html).toContain("Régua de 3 faixas (06/08)");
    expect(html).toContain("Deságio de 15% a 20% sobre a FIPE");
    expect(html).toContain("km acima de 150 mil");
    expect(html).not.toContain("mecânica boa</p>");
    expect(html).not.toContain("Conta do deságio");
  });

  it("devolve null para ausente, lista, texto e forma incompleta", () => {
    for (const bruto of [
      null,
      undefined,
      [],
      "x",
      3,
      {},
      // Sem `versao: 1` não é retrato desta forma.
      { marca: "Fiat", modelo: "Argo" },
      { versao: 1, marca: 1, modelo: "x", recomendacao: { resumo: "r" } },
    ]) {
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
/** O que o banco dublado responde à leitura da régua. */
let respostaDaRegua: { data: unknown[] | null; error: { message: string } | null };
/** Os filtros com que a rota leu a régua. */
let filtrosDaRegua: string[] = [];
/** O cliente do Supabase lançando em vez de devolver `{ error }`. */
let reguaLanca: "nao" | "na_consulta" | "no_from" = "nao";

vi.mock("../src/lib/turnstile", () => ({
  verificarTurnstile: async () => ({ ok: true, hostname: "x", action: "avaliacao" }),
  ACOES_DE_AVALIACAO: ["avaliacao"],
  ipDoVisitante: () => "127.0.0.1",
}));
vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: (tabela: string) => {
      if (tabela === "parametros_avaliacao") {
        if (reguaLanca === "no_from") throw new Error("cliente sem configuração");
        const q = {
          select: (c: string) => (filtrosDaRegua.push(`select ${c}`), q),
          is: (c: string, v: unknown) => (filtrosDaRegua.push(`is ${c} ${v}`), q),
          lte: (c: string, v: unknown) => (filtrosDaRegua.push(`lte ${c} ${v}`), q),
          order: (c: string) => (filtrosDaRegua.push(`order ${c}`), q),
          limit: async () => {
            if (reguaLanca === "na_consulta") throw new Error("fetch failed");
            return respostaDaRegua;
          },
        };
        return q;
      }
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
  respostaDaRegua = { data: [LINHA_DA_REGUA], error: null };
  filtrosDaRegua = [];
  reguaLanca = "nao";
  // Só o relógio é falso: a idade do carro sai do mesmo "hoje" do esperado.
  vi.useFakeTimers({ toFake: ["Date"], now: HOJE });
  globalThis.fetch = (async (_url: string, opcoes?: RequestInit) => {
    n8n.push(JSON.parse(String(opcoes?.body)));
    return { ok: true, status: 200, text: async () => "" };
  }) as never;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(avaliacao!.recomendacao!.resumo).not.toContain("FIPE cheia");
    expect(avaliacao!.regra).toBe(REGRA_DA_CURVA);
    // A linha VIGENTE: sem fim de vigência e com início já alcançado.
    expect(filtrosDaRegua).toEqual(["select *", "is vigencia_ate null", "lte vigencia_desde 2026-09-24", "order vigencia_desde"]);
  });

  it("régua ilegível: o lead sai com o retrato e SEM sugestão — nunca uma régua inventada", async () => {
    for (const resposta of [
      { data: null, error: { message: "permission denied" } },
      { data: [], error: null },
      // A coluna `km_por_ano` ainda não aplicada: a linha vem sem ela.
      { data: [{ ...LINHA_DA_REGUA, km_por_ano: undefined }], error: null },
    ]) {
      inserts.length = 0;
      n8n.length = 0;
      respostaDaRegua = resposta;
      const r = await enviar(CORPO);
      expect(r.status).toBe(200);
      expect(inserts).toHaveLength(1);
      const avaliacao = lerAvaliacaoDoLead(inserts[0].avaliacao)!;
      expect(avaliacao.recomendacao).toBeNull();
      expect(avaliacao.regra).toBe(SEM_REGUA);
      expect(avaliacao.quilometragem).toBe(55000);
      expect(n8n[0]).toMatchObject({ recomendacao: null });
    }
  });

  it("cliente do Supabase que LANÇA (rede, configuração) também vira avaliação sem sugestão", async () => {
    for (const modo of ["na_consulta", "no_from"] as const) {
      inserts.length = 0;
      n8n.length = 0;
      reguaLanca = modo;
      const r = await enviar(CORPO);
      expect(r.status, modo).toBe(200);
      expect(inserts, modo).toHaveLength(1);
      const avaliacao = lerAvaliacaoDoLead(inserts[0].avaliacao)!;
      expect(avaliacao.recomendacao, modo).toBeNull();
      expect(avaliacao.regra, modo).toBe(SEM_REGUA);
      expect(n8n[0], modo).toMatchObject({ recomendacao: null });
    }
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
    expect(avaliacao.recomendacao!.valor_sugerido_max).toBeNull();
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
