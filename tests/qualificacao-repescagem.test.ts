import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClienteDeLeads } from "../src/lib/qualificacaoParaMeta-servidor";

/**
 * A repescagem do LeadQualificado (17/10/2026): o lead que qualificou nos
 * últimos 7 dias e ainda não tem o evento aceito pelo Meta vai agora, com
 * `event_time` = quando qualificou. O cartão só arrastado pela coluna não vai,
 * "Não é oportunidade" não vai, o que já foi não vai de novo, e o que passou
 * dos 7 dias o Meta recusaria — não vai.
 */

const capi = {
  chamadas: [] as Array<Record<string, unknown>>,
  resposta: { ok: true, status: 200, corpo: { events_received: 1 } } as { ok: boolean; status: number; corpo?: unknown },
};
vi.mock("../src/lib/meta-capi", () => ({
  sendCapiEvent: async (evento: Record<string, unknown>) => {
    capi.chamadas.push(evento);
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

const { repescarQualificacoes, REPESCAGEM_POR_RODADA } = await import("../src/lib/qualificacaoParaMeta-servidor");

const AGORA = new Date("2026-10-17T20:00:00Z");
const PIXEL = { lerPixelId: async () => "px-1" };

type Evento = { lead_id: string; tipo: string; para: string; criado_em: string };
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
  ...extra,
});
const ev = (lead_id: string, para: string, criado_em: string): Evento => ({ lead_id, tipo: "etapa", para, criado_em });

/** Um banco de mentira que aplica os filtros que a repescagem usa. */
function bancoFalso(leads: Lead[], eventos: Evento[]) {
  const gravacoes: Array<{ id: unknown; campos: Record<string, unknown> }> = [];
  const from = (tabela: string) => {
    const filtros: Array<(l: Record<string, unknown>) => boolean> = [];
    let ordem: string | null = null;
    let campos: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q);
    q.in = (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q);
    q.gte = (c: string, v: string) => (filtros.push((l) => typeof l[c] === "string" && (l[c] as string) >= v), q);
    q.order = (c: string) => ((ordem = c), q);
    q.limit = () => q;
    q.update = (c: Record<string, unknown>) => ((campos = c), q);
    q.then = (ok: (r: unknown) => unknown) => {
      if (campos) {
        const alvo = filtros.length ? leads.find((l) => filtros.every((f) => f(l))) : undefined;
        gravacoes.push({ id: alvo?.id, campos });
        if (alvo) Object.assign(alvo, campos);
        return Promise.resolve({ data: null, error: null }).then(ok);
      }
      const base = (tabela === "leads" ? leads : eventos) as Array<Record<string, unknown>>;
      let linhas = base.filter((l) => filtros.every((f) => f(l)));
      if (ordem) linhas = [...linhas].sort((a, b) => String(a[ordem as string]).localeCompare(String(b[ordem as string])));
      return Promise.resolve({ data: linhas, error: null }).then(ok);
    };
    return q;
  };
  return { cliente: { from } as unknown as ClienteDeLeads, gravacoes };
}

beforeEach(() => {
  capi.chamadas = [];
  capi.resposta = { ok: true, status: 200, corpo: { events_received: 1 } };
  falhas.length = 0;
});

describe("repescarQualificacoes", () => {
  it("manda o LeadQualificado de quem qualificou antes do envio existir, com o horário de quando qualificou", async () => {
    const { cliente, gravacoes } = bancoFalso(
      [lead("a", { situacao: "visita" })],
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
    const registro = (gravacoes[0].campos.capi_meta_response as Record<string, Record<string, unknown>>).qualificado;
    expect(registro).toMatchObject({ evento: "LeadQualificado", resultado: "enviado", etapa: "visita", repescado: true });
    expect(gravacoes[0].campos.capi_meta_status).toBe("LeadQualificado:enviado");
  });

  it("quem visitou e depois foi perdido também vai; o cartão só arrastado e o 'Não é oportunidade' não", async () => {
    const { cliente } = bancoFalso(
      [
        lead("perdido", { situacao: "perdido", desfecho: "perdido" }),
        lead("arrastado", { situacao: "proposta" }),
        lead("descartado", { situacao: "descartado", desfecho: "descartado" }),
      ],
      [
        ev("perdido", "visita", "2026-10-14T15:39:52Z"),
        ev("perdido", "perdido", "2026-10-16T12:42:29Z"),
        ev("arrastado", "visita", "2026-10-15T10:00:00Z"),
        ev("arrastado", "negociacao", "2026-10-15T10:00:02Z"),
        ev("arrastado", "proposta", "2026-10-15T10:00:30Z"),
        ev("descartado", "negociacao", "2026-10-13T18:56:55Z"),
        ev("descartado", "descartado", "2026-10-14T15:46:13Z"),
      ],
    );
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas.map((c) => c.eventId)).toEqual(["perdido:qualificado"]);
    expect(r).toMatchObject({ pendentes: 1, enviados: 1 });
  });

  it("o que o Meta já aceitou não vai de novo; o que foi recusado, sim", async () => {
    const enviado = { qualificado: { evento: "LeadQualificado", resultado: "enviado", em: "2026-10-16T17:20:03Z" } };
    const recusado = { qualificado: { evento: "LeadQualificado", resultado: "recusado", em: "2026-10-16T17:20:03Z" } };
    const { cliente } = bancoFalso(
      [lead("ja", { situacao: "visita", capi_meta_response: enviado }), lead("de-novo", { situacao: "visita", capi_meta_response: recusado })],
      [ev("ja", "visita", "2026-10-16T17:20:00Z"), ev("de-novo", "visita", "2026-10-16T17:20:00Z")],
    );
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas.map((c) => c.eventId)).toEqual(["de-novo:qualificado"]);
  });

  it("qualificou há mais de 7 dias: o Meta recusaria, não vai", async () => {
    const { cliente } = bancoFalso(
      [lead("velho", { situacao: "negociacao" })],
      // Entrou em Negociação há 8 dias; o evento novo é de outra etapa, depois.
      [ev("velho", "negociacao", "2026-10-09T14:35:19Z"), ev("velho", "visita", "2026-10-16T10:00:00Z")],
    );
    expect(await repescarQualificacoes(cliente, PIXEL, AGORA)).toEqual({ pendentes: 0, enviados: 0, naoAceitos: 0 });
    expect(capi.chamadas).toEqual([]);
  });

  it("lead sem nada por onde o Meta o reconheça não é tentado nem registrado", async () => {
    const semNada = lead("anonimo", { situacao: "visita", email: null, telefone: null, fbp: null, fbc: null, ag_uid: null });
    const { cliente, gravacoes } = bancoFalso([semNada], [ev("anonimo", "visita", "2026-10-16T10:00:00Z")]);
    await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas).toEqual([]);
    expect(gravacoes).toEqual([]);
  });

  it("recusa do Meta fica registrada e volta na próxima rodada", async () => {
    capi.resposta = { ok: false, status: 400, corpo: { error: { message: "Invalid parameter", code: 100 } } };
    const { cliente, gravacoes } = bancoFalso([lead("a", { situacao: "visita" })], [ev("a", "visita", "2026-10-16T10:00:00Z")]);
    expect(await repescarQualificacoes(cliente, PIXEL, AGORA)).toEqual({ pendentes: 1, enviados: 0, naoAceitos: 1 });
    expect((gravacoes[0].campos.capi_meta_response as Record<string, Record<string, unknown>>).qualificado).toMatchObject({ resultado: "recusado", repescado: true });
  });

  it(`no máximo ${REPESCAGEM_POR_RODADA} envios por rodada; o resto fica para a próxima`, async () => {
    const ids = Array.from({ length: REPESCAGEM_POR_RODADA + 2 }, (_, i) => `l${i}`);
    const { cliente } = bancoFalso(
      ids.map((id) => lead(id, { situacao: "visita" })),
      ids.map((id) => ev(id, "visita", "2026-10-16T10:00:00Z")),
    );
    const r = await repescarQualificacoes(cliente, PIXEL, AGORA);
    expect(capi.chamadas).toHaveLength(REPESCAGEM_POR_RODADA);
    expect(r).toEqual({ pendentes: REPESCAGEM_POR_RODADA + 2, enviados: REPESCAGEM_POR_RODADA, naoAceitos: 0 });
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
        for (const m of ["select", "eq", "in", "gte", "order", "limit"]) q[m] = () => q;
        q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "boom" } }).then(ok);
        return q;
      },
    } as unknown as ClienteDeLeads;
    expect(await repescarQualificacoes(quebrado, PIXEL, AGORA)).toEqual({ pendentes: 0, enviados: 0, naoAceitos: 0 });
    expect(falhas[0]?.[1]).toBe("meta-capi-repescagem");
  });
});
