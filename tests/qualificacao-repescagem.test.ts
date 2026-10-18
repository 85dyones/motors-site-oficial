import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClienteDeLeads } from "../src/lib/qualificacaoParaMeta-servidor";

/**
 * O envio do LeadQualificado, de hora em hora (17/10/2026; o único desde
 * 18/10): o lead que qualificou nos últimos 7 dias e ainda não tem o evento
 * aceito pelo Meta vai agora, com `event_time` = quando qualificou — se já
 * ficou 10 min na etapa. O cartão só arrastado pela coluna não vai,
 * "Não é oportunidade" não vai, o que já foi não vai de novo, e o que passou
 * dos 7 dias o Meta recusaria — não vai. Rastro longo é lido inteiro, e o que
 * o painel grava no meio da rodada não é apagado.
 */

const capi = {
  chamadas: [] as Array<Record<string, unknown>>,
  resposta: { ok: true, status: 200, corpo: { events_received: 1 } } as { ok: boolean; status: number; corpo?: unknown },
  /** O que acontece no banco enquanto o Meta responde. */
  durante: undefined as undefined | (() => void),
};
vi.mock("../src/lib/meta-capi", () => ({
  sendCapiEvent: async (evento: Record<string, unknown>) => {
    capi.chamadas.push(evento);
    capi.durante?.();
    return capi.resposta;
  },
}));
const falhas: unknown[][] = [];
vi.mock("../src/lib/observabilidade", () => ({
  registrarFalha: async (...args: unknown[]) => {
    falhas.push(args);
  },
}));
vi.mock("../src/lib/settings", () => ({ getCachedSettings: async () => ({ companySettings: { metaPixelId: "px-1" } }) }));

const { repescarQualificacoes, REPESCAGEM_POR_RODADA, ESPERA_DEPOIS_DE_RECUSA_MS } = await import("../src/lib/qualificacaoParaMeta-servidor");

const AGORA = new Date("2026-10-17T20:00:00Z");
const PIXEL = { lerPixelId: async () => "px-1" };

type Evento = { id: number; lead_id: string; tipo: string; para: string; criado_em: string };
type Lead = Record<string, unknown> & { id: string };

const lead = (id: string, extra: Record<string, unknown> = {}): Lead => ({
  id,
  email: `${id}@exemplo.com`,
  telefone: "41999990000",
  telefone_normalizado: null,
  fbp: "fb.1.1.2",
  fbc: "fb.1.1.abc",
  ag_uid: `ag-${id}`,
  veiculo_id: null,
  desfecho_valor: null,
  capi_meta_response: null,
  situacao: "em_contato",
  desfecho: null,
  desfecho_em: null,
  ...extra,
});
let proximoId = 1;
/** O `id` cresce na ordem de criação, como o do banco. */
const ev = (lead_id: string, para: string, criado_em: string): Evento => ({ id: proximoId++, lead_id, tipo: "etapa", para, criado_em });

/** O PostgREST devolve no máximo isto por resposta, peça o que pedir. */
const MAX_ROWS = 1000;

/**
 * Um banco de mentira que aplica os filtros que a repescagem usa, devolve só
 * as colunas do `select`, corta em 1000 linhas como o PostgREST e deixa o
 * teste mexer no banco no meio da rodada (`aoReler`): é o painel gravando.
 */
function bancoFalso(
  leads: Lead[],
  eventos: Evento[],
  ganchos: { aoReler?: (leadId: string, vez: number) => void; releituraFalha?: (leadId: string) => boolean } = {},
) {
  const gravacoes: Array<{ id: unknown; campos: Record<string, unknown> }> = [];
  const relidas = new Map<string, number>();
  const from = (tabela: string) => {
    const filtros: Array<(l: Record<string, unknown>) => boolean> = [];
    let colunas: string[] | null = null;
    let ordem: string | null = null;
    let faixa: [number, number] | null = null;
    let umSo = false;
    let campos: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    q.select = (c: string) => ((colunas = c.split(",").map((x) => x.trim())), q);
    q.eq = (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q);
    q.in = (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q);
    q.gte = (c: string, v: string) => (filtros.push((l) => typeof l[c] === "string" && (l[c] as string) >= v), q);
    q.order = (c: string) => ((ordem = c), q);
    q.limit = () => q;
    q.range = (de: number, ate: number) => ((faixa = [de, ate]), q);
    q.maybeSingle = () => ((umSo = true), q);
    q.update = (c: Record<string, unknown>) => ((campos = c), q);
    q.then = (ok: (r: unknown) => unknown) => {
      if (campos) {
        const alvo = leads.find((l) => filtros.every((f) => f(l)));
        gravacoes.push({ id: alvo?.id, campos });
        if (alvo) Object.assign(alvo, campos);
        return Promise.resolve({ data: null, error: null }).then(ok);
      }
      const base = (tabela === "leads" ? leads : eventos) as Array<Record<string, unknown>>;
      let linhas = base.filter((l) => filtros.every((f) => f(l)));
      if (umSo && tabela === "leads" && colunas?.join() === "capi_meta_response" && typeof linhas[0]?.id === "string") {
        const id = linhas[0].id as string;
        const vez = (relidas.get(id) ?? 0) + 1;
        relidas.set(id, vez);
        ganchos.aoReler?.(id, vez);
        if (ganchos.releituraFalha?.(id)) return Promise.resolve({ data: null, error: { message: "timeout" } }).then(ok);
      }
      if (ordem) {
        const o = ordem;
        linhas = [...linhas].sort((a, b) => (typeof a[o] === "number" ? (a[o] as number) - (b[o] as number) : String(a[o]).localeCompare(String(b[o]))));
      }
      if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1);
      linhas = linhas.slice(0, MAX_ROWS);
      const so = colunas;
      const projetadas = so ? linhas.map((l) => Object.fromEntries(so.map((c) => [c, l[c]]))) : linhas;
      return Promise.resolve({ data: umSo ? (projetadas[0] ?? null) : projetadas, error: null }).then(ok);
    };
    return q;
  };
  return { cliente: { from } as unknown as ClienteDeLeads, gravacoes };
}

const registroDe = (l: Lead) => l.capi_meta_response as Record<string, Record<string, unknown>>;

beforeEach(() => {
  capi.chamadas = [];
  capi.resposta = { ok: true, status: 200, corpo: { events_received: 1 } };
  capi.durante = undefined;
  falhas.length = 0;
  proximoId = 1;
});

describe("repescarQualificacoes", () => {
  it("manda o LeadQualificado de quem qualificou antes do envio existir, com o horário de quando qualificou", async () => {
    const a = lead("a", { situacao: "visita" });
    const { cliente } = bancoFalso(
      [a],
      [ev("a", "em_contato", "2026-10-12T12:28:56Z"), ev("a", "proposta", "2026-10-12T13:01:32Z"), ev("a", "visita", "2026-10-14T15:39:54Z")],
    );
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(r).toEqual({ pendentes: 1, enviados: 1, naoAceitos: 0 });
    expect(capi.chamadas).toHaveLength(1);
    expect(capi.chamadas[0]).toMatchObject({
      eventName: "LeadQualificado",
      eventId: "a:qualificado",
      actionSource: "system_generated",
      pixelId: "px-1",
      eventTime: Math.floor(Date.parse("2026-10-14T15:39:54Z") / 1000),
      customData: { etapa: "visita" },
    });
    expect(registroDe(a).qualificado).toMatchObject({ evento: "LeadQualificado", resultado: "enviado", etapa: "visita", repescado: true });
    expect(a.capi_meta_status).toBe("LeadQualificado:enviado");
  });

  it("é o único envio do LeadQualificado: quem entrou na Visita há menos de 10 min espera a próxima rodada", async () => {
    const { cliente } = bancoFalso(
      [lead("agora-ha-pouco", { situacao: "visita" }), lead("ha-15-min", { situacao: "negociacao" })],
      [ev("agora-ha-pouco", "visita", "2026-10-17T19:55:00Z"), ev("ha-15-min", "negociacao", "2026-10-17T19:45:00Z")],
    );
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas.map((c) => c.eventId)).toEqual(["ha-15-min:qualificado"]);
    expect(capi.chamadas[0]).toMatchObject({ eventTime: Math.floor(Date.parse("2026-10-17T19:45:00Z") / 1000), customData: { etapa: "negociacao" } });
    // O de 5 min ainda não é pendente: a próxima rodada decide se ele ficou.
    expect(r).toEqual({ pendentes: 1, enviados: 1, naoAceitos: 0 });
  });

  it("quem visitou e depois foi perdido também vai; o cartão só arrastado e o 'Não é oportunidade' não", async () => {
    const { cliente } = bancoFalso(
      [
        lead("perdido", { situacao: "perdido", desfecho: "perdido" }),
        lead("arrastado", { situacao: "proposta" }),
        lead("descartado", { situacao: "descartado", desfecho: "descartado" }),
      ],
      [
        ev("descartado", "negociacao", "2026-10-13T18:56:55Z"),
        ev("perdido", "visita", "2026-10-14T15:39:52Z"),
        ev("descartado", "descartado", "2026-10-14T15:46:13Z"),
        ev("arrastado", "visita", "2026-10-15T10:00:00Z"),
        ev("arrastado", "negociacao", "2026-10-15T10:00:02Z"),
        ev("arrastado", "proposta", "2026-10-15T10:00:30Z"),
        ev("perdido", "perdido", "2026-10-16T12:42:29Z"),
      ],
    );
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas.map((c) => c.eventId)).toEqual(["perdido:qualificado"]);
    expect(r).toMatchObject({ pendentes: 1, enviados: 1 });
  });

  it("o que o Meta já aceitou não vai de novo; o que não chegou (rede, 5xx), sim", async () => {
    const enviado = { qualificado: { evento: "LeadQualificado", resultado: "enviado", em: "2026-10-16T17:20:03Z" } };
    const semRede = { qualificado: { evento: "LeadQualificado", resultado: "sem_rede", em: "2026-10-17T19:00:00Z" } };
    const falhaDoMeta = { qualificado: { evento: "LeadQualificado", resultado: "recusado", http: 503, em: "2026-10-17T19:00:00Z" } };
    const { cliente } = bancoFalso(
      [
        lead("ja", { situacao: "visita", capi_meta_response: enviado }),
        lead("rede", { situacao: "visita", capi_meta_response: semRede }),
        lead("meta-fora", { situacao: "visita", capi_meta_response: falhaDoMeta }),
      ],
      [ev("ja", "visita", "2026-10-16T17:20:00Z"), ev("rede", "visita", "2026-10-16T17:20:00Z"), ev("meta-fora", "visita", "2026-10-16T17:21:00Z")],
    );
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas.map((c) => c.eventId)).toEqual(["rede:qualificado", "meta-fora:qualificado"]);
  });

  it("evento recusado por inválido (code 100) espera um dia antes de voltar: é o evento, não a hora", async () => {
    const recusa = (horasAtras: number, code: number) => ({
      qualificado: {
        evento: "LeadQualificado",
        resultado: "recusado",
        http: 400,
        em: new Date(AGORA.getTime() - horasAtras * 3600_000).toISOString(),
        resposta: { error: { message: "x", code } },
      },
    });
    const { cliente } = bancoFalso(
      [
        lead("recente", { situacao: "visita", capi_meta_response: recusa(2, 100) }),
        lead("antiga", { situacao: "visita", capi_meta_response: recusa(25, 100) }),
        // Token expirado (190) e limite de chamadas (17) não são o evento: voltam já.
        lead("token", { situacao: "visita", capi_meta_response: recusa(1, 190) }),
        lead("limite", { situacao: "visita", capi_meta_response: recusa(1, 17) }),
      ],
      ["recente", "antiga", "token", "limite"].map((id) => ev(id, "visita", "2026-10-16T10:00:00Z")),
    );
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(ESPERA_DEPOIS_DE_RECUSA_MS).toBe(24 * 3600_000);
    expect(capi.chamadas.map((c) => c.eventId).sort()).toEqual(["antiga:qualificado", "limite:qualificado", "token:qualificado"]);
    // A que espera continua pendente.
    expect(r).toEqual({ pendentes: 4, enviados: 3, naoAceitos: 0 });
  });

  it("qualificou há mais de 7 dias e não voltou: o Meta recusaria, não vai", async () => {
    const { cliente } = bancoFalso(
      [lead("velho", { situacao: "proposta" })],
      // Negociação há 8 dias, por dias; o arrasto de ontem pela Visita não conta.
      [ev("velho", "negociacao", "2026-10-09T14:35:19Z"), ev("velho", "proposta", "2026-10-12T10:00:00Z"), ev("velho", "visita", "2026-10-16T10:00:00Z"), ev("velho", "proposta", "2026-10-16T10:00:10Z")],
    );
    expect(await repescarQualificacoes(cliente, PIXEL, AGORA)).toEqual({ pendentes: 0, enviados: 0, naoAceitos: 0 });
    expect(capi.chamadas).toEqual([]);
  });

  it("qualificou há mais de 7 dias e VOLTOU à Visita na janela: vai, com o horário da volta", async () => {
    const { cliente } = bancoFalso(
      [lead("voltou", { situacao: "visita" })],
      [ev("voltou", "visita", "2026-10-08T21:16:04Z"), ev("voltou", "proposta", "2026-10-12T13:14:58Z"), ev("voltou", "visita", "2026-10-14T15:40:01Z")],
    );
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas).toHaveLength(1);
    expect(capi.chamadas[0]).toMatchObject({ eventTime: Math.floor(Date.parse("2026-10-14T15:40:01Z") / 1000), customData: { etapa: "visita" } });
  });

  it("ganho de ontem com a Visita há 10 dias: vai, com o horário do ganho", async () => {
    const { cliente } = bancoFalso(
      [lead("g", { situacao: "fechado", desfecho: "ganho", desfecho_em: "2026-10-16T18:00:01Z" })],
      [ev("g", "visita", "2026-10-07T10:00:00Z"), ev("g", "fechado", "2026-10-16T18:00:00Z")],
    );
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas).toHaveLength(1);
    expect(capi.chamadas[0]).toMatchObject({ eventName: "LeadQualificado", eventTime: Math.floor(Date.parse("2026-10-16T18:00:01Z") / 1000) });
  });

  it("ganho fechado na janela vai como qualificado, desde a primeira Visita", async () => {
    const { cliente } = bancoFalso(
      [lead("g", { situacao: "fechado", desfecho: "ganho", desfecho_em: "2026-10-16T18:00:00Z" })],
      [ev("g", "visita", "2026-10-15T10:00:00Z"), ev("g", "fechado", "2026-10-16T18:00:00Z")],
    );
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas).toHaveLength(1);
    expect(capi.chamadas[0]).toMatchObject({ eventName: "LeadQualificado", eventTime: Math.floor(Date.parse("2026-10-15T10:00:00Z") / 1000) });
  });

  it("lead sem nada por onde o Meta o reconheça não é tentado nem registrado", async () => {
    const semNada = lead("anonimo", { situacao: "visita", email: null, telefone: null, fbp: null, fbc: null, ag_uid: null });
    const { cliente, gravacoes } = bancoFalso([semNada], [ev("anonimo", "visita", "2026-10-16T10:00:00Z")]);
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas).toEqual([]);
    expect(gravacoes).toEqual([]);
  });

  it("recusa do Meta fica registrada, com a marca da repescagem", async () => {
    capi.resposta = { ok: false, status: 400, corpo: { error: { message: "Invalid parameter", code: 100 } } };
    const a = lead("a", { situacao: "visita" });
    const { cliente } = bancoFalso([a], [ev("a", "visita", "2026-10-16T10:00:00Z")]);
    expect(await repescarQualificacoes(cliente, PIXEL, AGORA)).toEqual({ pendentes: 1, enviados: 0, naoAceitos: 1 });
    expect(registroDe(a).qualificado).toMatchObject({ resultado: "recusado", http: 400, repescado: true, em: AGORA.toISOString() });
  });

  it(`no máximo ${REPESCAGEM_POR_RODADA} envios por rodada: primeiro quem nunca foi tentado, depois quem sai dos 7 dias antes`, async () => {
    const tentado = { qualificado: { evento: "LeadQualificado", resultado: "sem_rede", em: "2026-10-17T19:00:00Z" } };
    const leads = [
      lead("tentado-velho", { situacao: "visita", capi_meta_response: tentado }),
      ...["d16", "d11", "d15", "d12", "d14", "d13"].map((id) => lead(id, { situacao: "visita" })),
    ];
    const { cliente } = bancoFalso(leads, [
      ev("tentado-velho", "visita", "2026-10-11T09:00:00Z"),
      ...["d16", "d11", "d15", "d12", "d14", "d13"].map((id) => ev(id, "visita", `2026-10-${id.slice(1)}T10:00:00Z`)),
    ]);
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas.map((c) => c.eventId)).toEqual(["d11", "d12", "d13", "d14", "d15"].map((id) => `${id}:qualificado`));
    expect(r).toEqual({ pendentes: 7, enviados: REPESCAGEM_POR_RODADA, naoAceitos: 0 });
  });

  it("não apaga o que o painel gravou enquanto o Meta respondia (o Purchase do ganho)", async () => {
    const leadDaCaptura = { evento: "Lead", resultado: "enviado", em: "2026-10-14T12:00:00Z" };
    const a = lead("a", { situacao: "visita", capi_meta_response: { lead: leadDaCaptura } });
    const { cliente } = bancoFalso([a], [ev("a", "visita", "2026-10-16T10:00:00Z")]);
    capi.durante = () => {
      a.capi_meta_response = { lead: leadDaCaptura, purchase: { evento: "Purchase", resultado: "enviado", em: "2026-10-17T20:00:01Z", valor: 50000 } };
    };
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(Object.keys(registroDe(a)).sort()).toEqual(["lead", "purchase", "qualificado"]);
    expect(registroDe(a).purchase).toMatchObject({ resultado: "enviado", valor: 50000 });
    expect(registroDe(a).qualificado).toMatchObject({ resultado: "enviado", repescado: true });
  });

  it("se o painel mandou o LeadQualificado no meio, a falha da repescagem não grava por cima", async () => {
    capi.resposta = { ok: false, status: 0 };
    const a = lead("a", { situacao: "visita" });
    const { cliente, gravacoes } = bancoFalso([a], [ev("a", "visita", "2026-10-16T10:00:00Z")]);
    capi.durante = () => {
      a.capi_meta_response = { qualificado: { evento: "LeadQualificado", resultado: "enviado", em: "2026-10-17T20:00:01Z" } };
    };
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(gravacoes).toEqual([]);
    expect(registroDe(a).qualificado.resultado).toBe("enviado");
  });

  it("se o painel já mandou entre a leitura e o envio, não manda de novo, não conta e não gasta vaga", async () => {
    const ids = ["d10", "d11", "d12", "d13", "d14", "d15"];
    const leads = ids.map((id) => lead(id, { situacao: "visita" }));
    const { cliente } = bancoFalso(
      leads,
      ids.map((id) => ev(id, "visita", `2026-10-${id.slice(1)}T21:00:00Z`)),
      {
        aoReler: (id, vez) => {
          if (id === "d10" && vez === 1) leads[0].capi_meta_response = { qualificado: { evento: "LeadQualificado", resultado: "enviado", em: "2026-10-17T20:00:00Z" } };
        },
      },
    );
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas.map((c) => c.eventId)).toEqual(["d11", "d12", "d13", "d14", "d15"].map((id) => `${id}:qualificado`));
    expect(r).toEqual({ pendentes: 5, enviados: 5, naoAceitos: 0 });
  });

  it("a linha que não deu para reler fica para a próxima rodada, com a falha registrada", async () => {
    const { cliente, gravacoes } = bancoFalso([lead("a", { situacao: "visita" })], [ev("a", "visita", "2026-10-16T10:00:00Z")], {
      releituraFalha: () => true,
    });
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas).toEqual([]);
    expect(gravacoes).toEqual([]);
    expect(falhas[0]).toEqual(["quebra", "meta-capi-repescagem", "timeout", { extra: { lead_id: "a" } }]);
  });

  it("rastro com mais de 1000 linhas é lido inteiro: a saída da Visita no fim não se perde", async () => {
    // 99 leads em Visita e um arrastado; o rastro antigo de cada um enche as páginas.
    const ids = Array.from({ length: 100 }, (_, i) => `l${String(i).padStart(2, "0")}`);
    const eventos: Evento[] = [];
    for (const id of ids) for (let k = 0; k < 10; k++) eventos.push(ev(id, k % 2 ? "proposta" : "em_contato", `2026-10-01T10:${String(k).padStart(2, "0")}:00Z`));
    for (const id of ids) eventos.push(ev(id, "visita", "2026-10-16T10:00:00Z"));
    eventos.push(ev("l99", "proposta", "2026-10-16T10:00:30Z"));
    const { cliente } = bancoFalso(
      ids.map((id) => lead(id, { situacao: id === "l99" ? "proposta" : "visita" })),
      eventos,
    );
    expect(eventos.length).toBeGreaterThan(1000);
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(r.pendentes).toBe(99);
    expect(capi.chamadas.map((c) => c.eventId)).not.toContain("l99:qualificado");
  });

  it("mais de 1000 entradas em Visita na janela: nenhuma fica de fora da conta", async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `v${i}`);
    const { cliente } = bancoFalso(
      ids.map((id) => lead(id, { situacao: "visita" })),
      ids.map((id) => ev(id, "visita", "2026-10-16T10:00:00Z")),
    );
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(r.pendentes).toBe(1001);
  });

  it("passado o prazo da rota, para e deixa o resto para a próxima hora", async () => {
    const { cliente } = bancoFalso([lead("a", { situacao: "visita" })], [ev("a", "visita", "2026-10-16T10:00:00Z")]);
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA, Date.now() - 1);
    expect(capi.chamadas).toEqual([]);
    expect(r).toEqual({ pendentes: 1, enviados: 0, naoAceitos: 0 });
  });

  it("sem pixel configurado, nada vai e nada é registrado", async () => {
    const { cliente, gravacoes } = bancoFalso([lead("a", { situacao: "visita" })], [ev("a", "visita", "2026-10-16T10:00:00Z")]);
    await repescarQualificacoes(cliente, { lerPixelId: async () => null }, AGORA);
    expect(capi.chamadas).toEqual([]);
    expect(gravacoes).toEqual([]);
  });

  it("erro do banco não lança: vira registro de falha", async () => {
    const quebrado = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "gte", "order", "limit", "range"]) q[m] = () => q;
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "boom" } }).then(ok);
        return q;
      },
    } as unknown as ClienteDeLeads;
    expect(await repescarQualificacoes(quebrado, PIXEL, AGORA)).toEqual({ pendentes: 0, enviados: 0, naoAceitos: 0 });
    expect(falhas[0]?.[1]).toBe("meta-capi-repescagem");
  });
});
