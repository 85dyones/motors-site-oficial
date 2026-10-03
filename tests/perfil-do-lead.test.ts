import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CANAL_DO_PROFILER,
  ROTULO_DO_LUGAR,
  ROTULO_DO_MODO,
  TETO_DOS_NUMEROS_DO_PERFIL,
  colunaDoPerfilAusente,
  lerPerfilDoLead,
  montarPerfilDoLead,
} from "../src/lib/perfilDoLead";
import BlocoDoPerfil from "../src/components/admin/BlocoDoPerfil";

/**
 * O perfil do Profiler mora no lead (migração 20260925200000).
 *
 * Até 25/09/2026 `/api/leads` gravava do Garagem Match Profiler só o
 * `interesse` — a mensagem do WhatsApp. As respostas do questionário, os
 * filtros que o cliente tirou e os carros que o site mostrou iam só para o
 * n8n, e o card do kanban não tinha nada disso. Este arquivo trava, no molde
 * de `avaliacao-no-lead.test.ts`:
 *   - a lib: o perfil que se grava (só do Profiler, com teto e lista fechada
 *     em cada campo) e a leitura defensiva que o painel faz;
 *   - o bloco do card, desenhado com o perfil bom e com lixo;
 *   - a rota EXECUTADA: o perfil vai no insert do Profiler e em nenhum outro,
 *     e sem a migração — ou com a montagem lançando — o lead é gravado mesmo
 *     assim;
 *   - o PATCH do painel EXECUTADO: um `perfil` no corpo não é gravado.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Dublês — declarados antes de tudo porque `vi.mock` sobe para o topo
// ─────────────────────────────────────────────────────────────────────────────

const inserts: Record<string, unknown>[] = [];
let errosDoInsert: ({ code: string; message: string } | null)[] = [];
const n8n: Record<string, unknown>[] = [];
const avisos: string[] = [];
/** A montagem do perfil lançando — o caso que o `try` próprio dela cobre. */
let montagemLanca = false;

/** O que o PATCH do painel gravou. */
let gravacoesDoPainel: Record<string, unknown>[] = [];

vi.mock("../src/lib/turnstile", () => ({
  verificarTurnstile: async () => ({ ok: true, hostname: "x", action: "lead" }),
  ACOES_DE_LEADS: ["lead"],
  ipDoVisitante: () => "127.0.0.1",
}));
vi.mock("../src/lib/supabase-server", () => ({
  createAdminSupabaseClient: () => ({
    from: (tabela: string) => {
      if (tabela !== "leads") throw new Error(`tabela inesperada: ${tabela}`);
      return {
        // A rota lê o id do lead gravado (`.select("id").maybeSingle()`, a
        // lista do repasse guarda o elo), então o dublê responde nos dois
        // jeitos: aguardado direto ou pela cadeia. Um insert, um resultado.
        insert: (linha: Record<string, unknown>) => {
          inserts.push(linha);
          const resultado = { data: null, error: errosDoInsert.shift() ?? null };
          return {
            select: () => ({ maybeSingle: async () => resultado }),
            then: (ok: (r: typeof resultado) => unknown, falha?: (e: unknown) => unknown) =>
              Promise.resolve(resultado).then(ok, falha),
          };
        },
      };
    },
  }),
  // O do painel, para o PATCH de `/api/leads/gerenciar` — mesmo dublê de
  // `leads-gerenciar-valores-da-avaliacao.test.ts`, reduzido.
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: async () => ({ error: null }),
    from: (tabela: string) => {
      if (tabela === "profiles") {
        const q = {
          select: () => q,
          eq: () => q,
          single: async () => ({
            data: { role: "comercial", papeis: ["comercial"], full_name: "Ana" },
            error: null,
          }),
        };
        return q;
      }
      if (tabela === "leads") {
        // O vendedor só mexe no lead dele (`escopoDeLeads`, 03/10/2026): antes
        // de gravar, a rota lê o responsável do lead. Este é da Ana.
        const alvo = {
          eq: () => alvo,
          maybeSingle: async () => ({ data: { responsavel: "Ana" }, error: null }),
        };
        return {
          select: () => alvo,
          update: (campos: Record<string, unknown>) => {
            gravacoesDoPainel.push(campos);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
  }),
}));
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ webhooks: { webhookUrl: "https://n8n.teste/webhook/lead" }, companySettings: {} }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../src/lib/telemetry", () => ({ logLeadCaptured: () => {}, META_CONTENT_TYPE: "product" }));
vi.mock("../src/lib/meta-capi", () => ({ sendCapiEvent: async () => {} }));
// A única dublagem da lib: a montagem que LANÇA, para provar que o lead sai
// mesmo assim. Fora desse caso é a função de verdade — os testes da lib abaixo
// passam por ela.
vi.mock("../src/lib/perfilDoLead", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/perfilDoLead")>();
  return {
    ...real,
    montarPerfilDoLead: (corpo: Record<string, unknown>) => {
      if (montagemLanca) throw new Error("montagem quebrada");
      return real.montarPerfilDoLead(corpo);
    },
  };
});

const { POST } = await import("../src/app/api/leads/route");
const { PATCH } = await import("../src/app/api/leads/gerenciar/route");

// ─────────────────────────────────────────────────────────────────────────────
// O que o Profiler manda
// ─────────────────────────────────────────────────────────────────────────────

/** `intencao_busca` como o `CarMatch` a monta desde 25/09 (fase 2). */
const INTENCAO = {
  aiQuery: "",
  budgetTab: "presets",
  modo: "carros",
  orcamento: "de R$ 50 mil a R$ 75 mil",
  filtros: ["de R$ 50 mil a R$ 75 mil", "4 portas ou mais", "só automático", "hatch ou SUV"],
  afrouxados: ["km"],
  prazo: "Nas próximas semanas",
  perfil: {
    leva: "Família, criança na cadeirinha",
    jeitos: ["Hatch", "SUV"],
    cambio: "Só automático",
    nao_pode_faltar: ["2020 ou mais novo", "Câmera de ré"],
  },
  na_faixa: 7,
  carros: [
    { id: "101", nome: "Onix Premier 2021", preco: 72900, lugar: "principal", manchete: "O único com câmera de ré na faixa", pesa_contra: null, parcela: null },
    { id: "102", nome: "HB20 Platinum 2020", preco: 68500, lugar: "tambem", manchete: "O de menor km: 41 mil", pesa_contra: "Sem câmera de ré", parcela: null },
    { id: "103", nome: "T-Cross 200 TSI 2020", preco: 74900, lugar: "outro-caminho", manchete: "O único SUV", pesa_contra: null, parcela: null },
    { id: "104", nome: "Tiguan 2.0 TSI 2017", preco: 70900, lugar: "ja-pensou", manchete: "Turbo e 4x4 pelo preço de um compacto", pesa_contra: "2017: mais antigo do que você pediu", parcela: null },
  ],
};

const doProfiler = (intencao_busca: unknown) => ({ canal: CANAL_DO_PROFILER, tipo: "lead_curadoria_especial", intencao_busca });

/** A marcação do bloco, com o espaço não separável do `Intl` ("R$ 72.900") virado espaço comum. */
const html = (perfil: unknown) => renderToStaticMarkup(createElement(BlocoDoPerfil, { perfil })).replace(/ /g, " ");

/** O texto que o consultor lê: a marcação sem as tags. */
const lido = (perfil: unknown) => html(perfil).replace(/<[^>]+>/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// A lib
// ─────────────────────────────────────────────────────────────────────────────

describe("montarPerfilDoLead", () => {
  it("guarda o que o Profiler mandou, com os nomes de `intencao_busca`", () => {
    expect(montarPerfilDoLead(doProfiler(INTENCAO))).toEqual({
      versao: 1,
      aiQuery: "",
      budgetTab: "presets",
      modo: "carros",
      orcamento: "de R$ 50 mil a R$ 75 mil",
      filtros: ["de R$ 50 mil a R$ 75 mil", "4 portas ou mais", "só automático", "hatch ou SUV"],
      afrouxados: ["km"],
      prazo: "Nas próximas semanas",
      perfil: {
        leva: "Família, criança na cadeirinha",
        jeitos: ["Hatch", "SUV"],
        cambio: "Só automático",
        nao_pode_faltar: ["2020 ou mais novo", "Câmera de ré"],
      },
      na_faixa: 7,
      carros: INTENCAO.carros,
      por_mes: null,
    });
  });

  it("POR MÊS: a parcela, a entrada que o cliente estimou e a troca vão para o card", () => {
    const p = montarPerfilDoLead(
      doProfiler({
        ...INTENCAO,
        budgetTab: "porMes",
        por_mes: { parcela: 1500, entrada: 20000, prazo: 48, ocupacao: "CLT (carteira assinada)", troca: true },
        carros: [{ ...INTENCAO.carros[0], parcela: 1298.4 }],
      }),
    )!;
    expect(p.budgetTab).toBe("porMes");
    expect(p.por_mes).toEqual({ parcela: 1500, entrada: 20000, prazo: 48, ocupacao: "CLT (carteira assinada)", troca: true });
    expect(p.carros[0].parcela).toBe(1298.4);
  });

  it("POR MÊS forjado não vira parcela", () => {
    for (const por_mes of [
      "1500",
      [1500],
      { parcela: "1500", prazo: 48 },
      { parcela: -1, prazo: 48 },
      { parcela: 0, prazo: 48 },
      { parcela: 1e12, prazo: 48 },
    ]) {
      expect(montarPerfilDoLead(doProfiler({ ...INTENCAO, por_mes }))!.por_mes, JSON.stringify(por_mes)).toBeNull();
    }
    const torto = montarPerfilDoLead(
      doProfiler({ ...INTENCAO, por_mes: { parcela: 1500, prazo: 48.5, entrada: -3, troca: "sim", ocupacao: 7 } }),
    )!.por_mes;
    // `troca` só é verdade quando é `true` — "sim" não é.
    expect(torto).toEqual({ parcela: 1500, prazo: null, entrada: null, ocupacao: "", troca: false });
  });

  it("outro canal não tem perfil — nem com `intencao_busca` na forma do Profiler", () => {
    // Os outros formulários mandam `{}` ou `{ popup_campaign }`; gravar perfil
    // neles faria o card mostrar um bloco oco.
    for (const corpo of [
      { canal: "WhatsApp Proposta", intencao_busca: {} },
      { canal: "Popup Campanha", intencao_busca: { popup_campaign: "black-friday" } },
      { canal: "WhatsApp Dúvidas", intencao_busca: INTENCAO },
      { canal: "garagem match profiler", intencao_busca: INTENCAO },
      { tipo: "lead_curadoria_especial", intencao_busca: INTENCAO },
    ]) {
      expect(montarPerfilDoLead(corpo), JSON.stringify(corpo).slice(0, 60)).toBeNull();
    }
  });

  it("`intencao_busca` que não é objeto simples não vira perfil", () => {
    for (const intencao of [undefined, null, "carros até 75 mil", 42, true, [INTENCAO], new Date(), {}]) {
      expect(montarPerfilDoLead(doProfiler(intencao)), String(intencao)).toBeNull();
    }
    // E o corpo inteiro torto também não lança.
    for (const corpo of [null, [], "x", 3]) {
      expect(montarPerfilDoLead(corpo as never)).toBeNull();
    }
  });

  it("o lead da fase 1 (sem `perfil` nem `na_faixa`) continua virando perfil", () => {
    const faseUm: Record<string, unknown> = { ...INTENCAO };
    delete faseUm.perfil;
    delete faseUm.na_faixa;
    const p = montarPerfilDoLead(doProfiler(faseUm))!;
    expect(p).not.toBeNull();
    expect(p.perfil).toEqual({ leva: "", jeitos: [], cambio: "", nao_pode_faltar: [] });
    expect(p.na_faixa).toBeNull();
    expect(p.orcamento).toBe("de R$ 50 mil a R$ 75 mil");
    expect(p.carros).toHaveLength(4);
  });

  it("texto é aparado e tem teto; o que não é texto não vira rótulo", () => {
    const p = montarPerfilDoLead(
      doProfiler({
        aiQuery: "  " + "q".repeat(5000) + "  ",
        orcamento: "  até R$ 75 mil  ",
        prazo: true,
        perfil: { leva: 5, jeitos: [1, null, " SUV ", {}, "SUV", ["Hatch"]], cambio: { rotulo: "Só automático" }, nao_pode_faltar: "Câmera de ré" },
        filtros: ["x".repeat(400)],
        carros: [{ nome: "Onix", manchete: "m".repeat(1000), pesa_contra: "p".repeat(1000) }],
      }),
    )!;
    expect(p.aiQuery).toHaveLength(500);
    expect(p.orcamento).toBe("até R$ 75 mil");
    expect(p.prazo, "booleano não é prazo").toBe("");
    expect(p.perfil.leva).toBe("");
    expect(p.perfil.jeitos, "só texto, sem repetir").toEqual(["SUV"]);
    expect(p.perfil.cambio).toBe("");
    expect(p.perfil.nao_pode_faltar, "texto solto não é lista").toEqual([]);
    expect(p.filtros[0]).toHaveLength(120);
    expect(p.carros[0].manchete).toHaveLength(300);
    expect(p.carros[0].pesa_contra).toHaveLength(300);
  });

  it("listas enormes param no teto de cada uma", () => {
    const muitos = (n: number, prefixo: string) => Array.from({ length: n }, (_, i) => `${prefixo} ${i}`);
    const p = montarPerfilDoLead(
      doProfiler({
        filtros: muitos(100_000, "filtro"),
        perfil: { jeitos: muitos(50, "jeito"), nao_pode_faltar: muitos(50, "item") },
        carros: Array.from({ length: 50 }, (_, i) => ({ nome: `Carro ${i}`, preco: 50000 })),
        afrouxados: [...Array(10_000).fill("portas"), "km", "ano", "diesel", "carroceria", "automatico"],
      }),
    )!;
    expect(p.filtros).toHaveLength(12);
    expect(p.perfil.jeitos).toHaveLength(4);
    expect(p.perfil.nao_pode_faltar).toHaveLength(3);
    expect(p.carros.map((c) => c.nome)).toEqual(["Carro 0", "Carro 1", "Carro 2", "Carro 3"]);
    expect(p.afrouxados, "sem repetir, e só as seis chaves").toEqual(["portas", "km", "ano", "diesel", "carroceria", "automatico"]);
  });

  it("enum forjado não passa — chave do protótipo incluída", () => {
    // `in` deixaria "constructor" passar como lugar, e o card mostraria o
    // código de uma função (o mesmo caso do estado na avaliação, 24/09).
    const p = montarPerfilDoLead(
      doProfiler({
        modo: "constructor",
        budgetTab: "hasOwnProperty",
        afrouxados: ["constructor", "__proto__", "toString", "preco", "portas"],
        carros: [
          { nome: "Onix", lugar: "constructor" },
          { nome: "HB20", lugar: "__proto__" },
          { nome: "Argo", lugar: "toString" },
          { nome: "Polo", lugar: "PRINCIPAL" },
        ],
      }),
    )!;
    expect(p.modo).toBeNull();
    expect(p.budgetTab).toBeNull();
    expect(p.afrouxados).toEqual(["portas"]);
    expect(p.carros.map((c) => c.lugar)).toEqual([null, null, null, null]);
  });

  it("campo herdado do protótipo não é dado que alguém mandou", () => {
    const proto = Object.prototype as Record<string, unknown>;
    proto.modo = "carros";
    proto.leva = "Família, criança na cadeirinha";
    proto.lugar = "principal";
    try {
      const p = montarPerfilDoLead(doProfiler({ orcamento: "até R$ 75 mil", perfil: {}, carros: [{ nome: "Onix" }] }))!;
      expect(p.modo).toBeNull();
      expect(p.perfil.leva).toBe("");
      expect(p.carros[0].lugar).toBeNull();
    } finally {
      delete proto.modo;
      delete proto.leva;
      delete proto.lugar;
    }
  });

  it("número: finito, de zero ao teto, e só número — preço e contagem", () => {
    const precos = [Number.NaN, -1, 1e12, TETO_DOS_NUMEROS_DO_PERFIL, Infinity, "55000", null, {}];
    const p = montarPerfilDoLead(
      doProfiler({ carros: precos.slice(0, 4).map((preco, i) => ({ nome: `C${i}`, preco })), na_faixa: 2.5 }),
    )!;
    expect(p.carros.map((c) => c.preco)).toEqual([null, null, null, null]);
    expect(p.na_faixa, "contagem quebrada é forjada").toBeNull();

    const resto = montarPerfilDoLead(doProfiler({ carros: precos.slice(4).map((preco, i) => ({ nome: `D${i}`, preco })) }))!;
    expect(resto.carros.map((c) => c.preco)).toEqual([null, null, null, null]);

    for (const naFaixa of [-3, "3", 1e9, Number.NaN]) {
      expect(montarPerfilDoLead(doProfiler({ orcamento: "x", na_faixa: naFaixa }))!.na_faixa, String(naFaixa)).toBeNull();
    }
    expect(montarPerfilDoLead(doProfiler({ orcamento: "x", na_faixa: 0 }))!.na_faixa, "zero na faixa é resposta").toBe(0);
    expect(montarPerfilDoLead(doProfiler({ carros: [{ nome: "Onix", preco: 99_999_999 }] }))!.carros[0].preco).toBe(99_999_999);
  });

  it("carro sem nome cai fora; id em número vira texto, e id torto vira null", () => {
    const p = montarPerfilDoLead(
      doProfiler({
        carros: [null, 3, "Onix", ["Onix"], { nome: 42 }, { nome: "  " }, { id: 12345, nome: "Onix" }, { id: { x: 1 }, nome: "HB20" }, { id: -1, nome: "Argo" }],
      }),
    )!;
    expect(p.carros).toEqual([
      { id: "12345", nome: "Onix", preco: null, lugar: null, manchete: "", pesa_contra: null, parcela: null },
      { id: null, nome: "HB20", preco: null, lugar: null, manchete: "", pesa_contra: null, parcela: null },
      { id: null, nome: "Argo", preco: null, lugar: null, manchete: "", pesa_contra: null, parcela: null },
    ]);
  });
});

describe("lerPerfilDoLead — o painel não cai por um perfil torto", () => {
  it("devolve o perfil bom, igual ao gravado", () => {
    const gravado = montarPerfilDoLead(doProfiler(INTENCAO));
    expect(lerPerfilDoLead(JSON.parse(JSON.stringify(gravado)))).toEqual(gravado);
  });

  it("devolve null para ausente, lista, texto, outra versão e perfil sem nada legível", () => {
    for (const bruto of [
      null,
      undefined,
      [],
      [INTENCAO],
      "perfil",
      3,
      true,
      {},
      // Sem `versao: 1` não é perfil desta forma — nem com o resto certo.
      INTENCAO,
      { ...INTENCAO, versao: 2 },
      { ...INTENCAO, versao: "1" },
      { versao: 1 },
      { versao: 1, carros: "Onix", filtros: 5, perfil: [], orcamento: 7, budgetTab: "presets" },
    ]) {
      expect(lerPerfilDoLead(bruto), JSON.stringify(bruto)?.slice(0, 80)).toBeNull();
      expect(html(bruto), "sem perfil, o card não ganha bloco vazio").toBe("");
    }
  });

  it("normaliza cada campo que o card lê — e o card desenha sem lançar", () => {
    const tortos: unknown[] = [
      { versao: 1, orcamento: "até R$ 75 mil", carros: [null, 3, "x", { nome: 5 }, { nome: "Onix", preco: "55000", lugar: "constructor", pesa_contra: 7 }] },
      { versao: 1, modo: "aviso", perfil: { jeitos: "SUV", nao_pode_faltar: [1, 2], leva: ["Família"] }, afrouxados: { portas: true }, na_faixa: "3" },
      { versao: 1, modo: "ajuda", filtros: [{}, "só automático", null], carros: { 0: { nome: "Onix" } }, perfil: "Família" },
      { versao: 1, aiQuery: "quero um SUV para viajar", perfil: null, carros: [{ nome: "T-Cross", lugar: "toString", manchete: {}, id: [] }] },
      { versao: 1, prazo: "Nas próximas semanas", na_faixa: -1, afrouxados: ["constructor", "km"], budgetTab: "constructor" },
    ];
    for (const bruto of tortos) {
      const p = lerPerfilDoLead(bruto);
      expect(p, JSON.stringify(bruto)).not.toBeNull();
      expect(Array.isArray(p!.carros) && Array.isArray(p!.filtros) && Array.isArray(p!.afrouxados)).toBe(true);
      expect(Array.isArray(p!.perfil.jeitos) && Array.isArray(p!.perfil.nao_pode_faltar)).toBe(true);
      for (const c of p!.carros) {
        expect(typeof c.nome).toBe("string");
        expect(c.preco === null || typeof c.preco === "number").toBe(true);
        expect(c.lugar === null || Object.hasOwn(ROTULO_DO_LUGAR, c.lugar)).toBe(true);
      }
      const desenho = html(bruto);
      expect(desenho).toContain("Perfil do Profiler");
      for (const lixo of ["function", "[object Object]", "undefined", "NaN"]) {
        expect(desenho, `${lixo} em ${JSON.stringify(bruto)}`).not.toContain(lixo);
      }
    }
    expect(lerPerfilDoLead(tortos[0])!.carros).toEqual([
      { id: null, nome: "Onix", preco: null, lugar: null, manchete: "", pesa_contra: null, parcela: null },
    ]);
    expect(lerPerfilDoLead(tortos[1])!.perfil).toEqual({ leva: "", jeitos: [], cambio: "", nao_pode_faltar: [] });
    expect(lerPerfilDoLead(tortos[1])!.na_faixa).toBeNull();
    expect(lerPerfilDoLead(tortos[2])!.filtros).toEqual(["só automático"]);
    expect(lerPerfilDoLead(tortos[2])!.carros, "objeto com chave 0 não é lista").toEqual([]);
    expect(lerPerfilDoLead(tortos[4])!.afrouxados).toEqual(["km"]);
  });
});

describe("colunaDoPerfilAusente", () => {
  it("reconhece a coluna nova ausente, pelo PostgREST e pelo Postgres", () => {
    expect(colunaDoPerfilAusente({ code: "PGRST204", message: "Could not find the 'perfil' column of 'leads' in the schema cache" })).toBe(true);
    expect(colunaDoPerfilAusente({ code: "42703", message: 'column "perfil" of relation "leads" does not exist' })).toBe(true);
  });

  it("não confunde com outro erro — esse não pode virar um segundo insert", () => {
    expect(colunaDoPerfilAusente({ code: "PGRST204", message: "Could not find the 'avaliacao' column" })).toBe(false);
    expect(colunaDoPerfilAusente({ code: "PGRST204", message: "Could not find the 'perfil_curadoria' column" })).toBe(false);
    expect(colunaDoPerfilAusente({ code: "23505", message: "duplicate key perfil" })).toBe(false);
    expect(colunaDoPerfilAusente({ code: "PGRST204", message: 42 })).toBe(false);
    for (const erro of [null, undefined, "PGRST204 perfil", 0]) expect(colunaDoPerfilAusente(erro)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O bloco do card
// ─────────────────────────────────────────────────────────────────────────────

describe("BlocoDoPerfil", () => {
  const perfil = montarPerfilDoLead(doProfiler(INTENCAO));

  it("mostra o que o cliente respondeu e os carros, com o porquê de cada um", () => {
    const d = lido(perfil);
    expect(d).toContain("Perfil do Profiler");
    expect(d, "o resumo fechado").toContain("de R$ 50 mil a R$ 75 mil · 4 carros");
    expect(d).toContain(ROTULO_DO_MODO.carros);
    for (const trecho of [
      "Quem vai",
      "Família, criança na cadeirinha",
      "Hatch, SUV",
      "Só automático",
      "2020 ou mais novo, Câmera de ré",
      "Nas próximas semanas",
      "Aceitou tirar",
      "limite de km",
      "Onix Premier 2021 · R$ 72.900",
      "O mais perto do que pediu",
      "Também atende",
      "Outro caminho",
      "Já pensou neste?",
      "O único com câmera de ré na faixa",
      "Pesa contra: Sem câmera de ré",
      "7 carros passavam em tudo na faixa",
      "O que o cliente respondeu no site",
    ]) {
      expect(d, trecho).toContain(trecho);
    }
    // A faixa é o 1º filtro do motor e já está no orçamento: não se repete.
    expect(d).toContain("4 portas ou mais · só automático · hatch ou SUV");
    expect(d).not.toContain("de R$ 50 mil a R$ 75 mil · 4 portas");
  });

  it("não adivinha: pergunta pulada e jeito 'tanto faz' somem, em vez de virar resposta", () => {
    const d = html(montarPerfilDoLead(doProfiler({ ...INTENCAO, prazo: "", afrouxados: [], perfil: { leva: "", jeitos: [], cambio: "", nao_pode_faltar: [] } })));
    for (const rotulo of ["Quem vai", "Jeito", "Câmbio", "Não pode faltar", "Prazo", "Aceitou tirar"]) {
      expect(d, rotulo).not.toContain(`>${rotulo}</dt>`);
    }
    expect(d).toContain("Orçamento");
  });

  it("a busca que falhou: sem contagem na faixa, com o texto livre entre aspas", () => {
    const d = lido(
      montarPerfilDoLead(doProfiler({ ...INTENCAO, modo: "ajuda", budgetTab: "ai", aiQuery: "SUV até 80 mil para a família", na_faixa: null, carros: [] })),
    );
    expect(d).toContain(ROTULO_DO_MODO.ajuda);
    expect(d).toContain("“SUV até 80 mil para a família”");
    expect(d).not.toContain("passava");
    expect(html(montarPerfilDoLead(doProfiler({ ...INTENCAO, carros: [] }))), "lista vazia não vira lista").not.toContain(
      "Carros que o site mostrou",
    );
  });

  it("singular e zero na contagem", () => {
    expect(lido(montarPerfilDoLead(doProfiler({ orcamento: "x", na_faixa: 1 })))).toContain("1 carro passava em tudo na faixa");
    expect(lido(montarPerfilDoLead(doProfiler({ orcamento: "x", na_faixa: 0 })))).toContain("Nenhum carro passava em tudo na faixa");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A rota, executada
// ─────────────────────────────────────────────────────────────────────────────

const CORPO = {
  ...doProfiler(INTENCAO),
  mensagem: "Olá! Montei meu perfil no Garagem Match do site e quero ver o Onix Premier 2021.",
  cliente: { nome: "Paula Perfil", whatsapp: "(41) 99999-0000" },
  utm: {},
  eventId: "ev-1",
  turnstileToken: "tok",
};

const enviar = (corpo: Record<string, unknown>) =>
  POST(
    new NextRequest("http://x/api/leads", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  );

beforeEach(() => {
  inserts.length = 0;
  n8n.length = 0;
  avisos.length = 0;
  errosDoInsert = [];
  montagemLanca = false;
  gravacoesDoPainel = [];
  globalThis.fetch = (async (_url: string, opcoes?: RequestInit) => {
    n8n.push(JSON.parse(String(opcoes?.body)));
    return { ok: true, status: 200, text: async () => "" };
  }) as never;
  vi.spyOn(console, "warn").mockImplementation((...partes: unknown[]) => {
    avisos.push(partes.map(String).join(" "));
  });
});

describe("POST /api/leads grava o perfil do Profiler no lead", () => {
  it("o insert do Profiler leva o perfil, na forma que o painel lê", async () => {
    const r = await enviar(CORPO);
    expect(r.status).toBe(200);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ canal: CANAL_DO_PROFILER, nome: "Paula Perfil", event_id: "ev-1" });
    expect(inserts[0].perfil).toEqual(montarPerfilDoLead(CORPO));
    expect(lerPerfilDoLead(JSON.parse(JSON.stringify(inserts[0].perfil)))).toEqual(inserts[0].perfil);
  });

  it("o n8n continua recebendo `intencao_busca` como veio, e nenhum campo novo", async () => {
    await enviar(CORPO);
    expect(n8n).toHaveLength(1);
    expect(n8n[0].intencao_busca).toEqual(INTENCAO);
    expect(n8n[0]).not.toHaveProperty("perfil");
  });

  it("o lead de outro canal não ganha a chave `perfil` no insert", async () => {
    for (const intencao_busca of [{}, { popup_campaign: "black-friday" }, INTENCAO]) {
      inserts.length = 0;
      await enviar({ ...CORPO, canal: "WhatsApp Proposta", intencao_busca });
      expect(inserts).toHaveLength(1);
      expect(inserts[0]).not.toHaveProperty("perfil");
    }
  });

  it("valor forjado no corpo chega ao banco já normalizado", async () => {
    await enviar({
      ...CORPO,
      intencao_busca: { ...INTENCAO, modo: "constructor", carros: [{ nome: "Onix", preco: 1e12, lugar: "constructor" }] },
    });
    const perfil = lerPerfilDoLead(inserts[0].perfil)!;
    expect(perfil.modo).toBeNull();
    expect(perfil.carros).toEqual([{ id: null, nome: "Onix", preco: null, lugar: null, manchete: "", pesa_contra: null, parcela: null }]);
  });

  it("sem a migração, o lead é gravado de novo sem o perfil — e o aviso nomeia a migração", async () => {
    errosDoInsert = [{ code: "PGRST204", message: "Could not find the 'perfil' column of 'leads' in the schema cache" }];
    const r = await enviar(CORPO);
    expect(r.status).toBe(200);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toHaveProperty("perfil");
    expect(inserts[1]).not.toHaveProperty("perfil");
    expect(inserts[1]).toMatchObject({ canal: CANAL_DO_PROFILER, nome: "Paula Perfil", event_id: "ev-1" });
    expect(avisos.some((a) => a.includes("20260925200000_perfil_no_lead.sql"))).toBe(true);
  });

  it("outro erro de gravação não vira segundo insert, e não segura o cliente", async () => {
    errosDoInsert = [{ code: "23505", message: "duplicate key value" }];
    const r = await enviar(CORPO);
    expect(r.status).toBe(200);
    expect(inserts).toHaveLength(1);
    expect(n8n, "o n8n recebe mesmo assim").toHaveLength(1);
  });

  it("a montagem do perfil lançando não custa o lead", async () => {
    montagemLanca = true;
    const r = await enviar(CORPO);
    expect(r.status).toBe(200);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).not.toHaveProperty("perfil");
    expect(inserts[0]).toMatchObject({ canal: CANAL_DO_PROFILER, nome: "Paula Perfil" });
    expect(avisos.some((a) => a.includes("Perfil do Profiler não montado"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O PATCH do painel, executado
// ─────────────────────────────────────────────────────────────────────────────

const patch = (corpo: Record<string, unknown>) =>
  PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id: "lead-1", ...corpo }),
      headers: { "content-type": "application/json" },
    }) as never,
  );

describe("PATCH /api/leads/gerenciar — o perfil não é editável pelo painel", () => {
  it("um `perfil` no corpo não é gravado, sozinho ou junto de outro campo", async () => {
    const forjado = { versao: 1, orcamento: "até R$ 1 milhão", modo: "carros" };

    let r = await patch({ perfil: forjado, observacoes: "ligar à tarde" });
    expect(r.status).toBe(200);
    expect(gravacoesDoPainel).toHaveLength(1);
    expect(gravacoesDoPainel[0]).toMatchObject({ observacoes: "ligar à tarde" });
    expect(gravacoesDoPainel[0]).not.toHaveProperty("perfil");

    gravacoesDoPainel = [];
    r = await patch({ perfil: forjado });
    expect(r.status).toBe(200);
    for (const gravacao of gravacoesDoPainel) expect(gravacao).not.toHaveProperty("perfil");
  });
});
