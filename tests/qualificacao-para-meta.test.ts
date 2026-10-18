import { describe, it, expect, vi, beforeEach } from "vitest";
import { ETAPAS_PADRAO, type MotivoDoFunil } from "../src/lib/funil";
import { lerCodigo } from "./fonte";
import type { ClienteDeLeads } from "../src/lib/qualificacaoParaMeta-servidor";
import {
  AVISO_DE_GANHO_SEM_VALOR,
  COLUNAS_PARA_O_META,
  ETAPAS_QUALIFICADAS,
  PERMANENCIA_MINIMA_MS,
  SEM_CORRESPONDENCIA,
  SEM_VALOR,
  colunasDaCapi,
  correspondenciaDoLead,
  ehEtapaQualificada,
  eventosDevidos,
  lerRegistros,
  quandoQualificou,
  registroDaEntrega,
  registroPulado,
  resumirResposta,
  statusDaCapi,
  ultimoEnvio,
  valorGravado,
  type LeadParaOMeta,
  type PassagemDeEtapa,
  type RegistrosDaCapi,
  type ResultadoDaCapi,
} from "../src/lib/qualificacaoParaMeta";

/**
 * A qualificação de volta para o Meta (16/10/2026).
 *
 * Decisão do dono: *"as etapas de VISITA AGENDADA e NEGOCIANDO são a métrica
 * de lead qualificado; sim, envie o Purchase com o valor real"*.
 *
 * Três camadas, cada uma com a prova que só ela consegue dar:
 *
 *   1. As regras puras (`lib/qualificacaoParaMeta`), CHAMADAS: quais etapas
 *      qualificam, uma vez por lead, sem valor não há Purchase, o que vai no
 *      evento (e o que NÃO vai: IP e User-Agent do vendedor).
 *   2. O módulo de servidor, executado com dublês: lê a linha, manda pelo
 *      `sendCapiEvent`, grava `capi_meta_*`, e nunca lança.
 *   3. O PATCH de `/api/leads/gerenciar`, executado: a qualificação acontece
 *      DEPOIS do `update`, e só quando ele alcançou o lead. Para os outros
 *      dois pontos de entrada (o "Chegou na loja" e o `Lead` da captura) a
 *      trava lê o código, porque executá-los pede o dublê inteiro da gestão
 *      do lead.
 */

// ---------------------------------------------------------------------------
// Os dublês. `vi.mock` é içado; os módulos sob teste entram por `await import`
// depois, quando as variáveis já existem.
// ---------------------------------------------------------------------------

type Linha = Record<string, unknown>;

const capi = {
  chamadas: [] as Array<Record<string, unknown>>,
  resposta: undefined as { ok: boolean; status: number; corpo?: unknown } | undefined,
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

const settings = { pixel: "px-1" as string | null, lanca: false };
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => {
    if (settings.lanca) throw new Error("Invariant: incrementalCache missing in unstable_cache");
    return { companySettings: { metaPixelId: settings.pixel } };
  },
}));

/** O lead como a linha o guarda: tem tudo por onde o Meta o reconhece. */
const LEAD_COMPLETO: LeadParaOMeta = {
  id: "lead-1",
  email: "ana@exemplo.com",
  telefone: "41999990000",
  telefone_normalizado: null,
  fbp: "fb.1.1.2",
  fbc: "fb.1.1.abc",
  ag_uid: "ag-1",
  veiculo_id: 123,
  desfecho_valor: null,
  capi_meta_response: null,
};

const etapa = (chave: string) => {
  const e = ETAPAS_PADRAO.find((x) => x.chave === chave);
  if (!e) throw new Error(`etapa desconhecida no teste: ${chave}`);
  return { chave: e.chave, tipo: e.tipo };
};

/** Um registro de `LeadQualificado` já na linha, com o resultado pedido. */
const registro = (resultado: ResultadoDaCapi, em = "2026-10-16T10:00:00.000Z") => ({
  evento: "LeadQualificado",
  resultado,
  em,
});

// ---------------------------------------------------------------------------
// 1. As regras puras
// ---------------------------------------------------------------------------

describe("quais etapas qualificam", () => {
  it("visita agendada e negociação, pelas chaves PROTEGIDAS do funil", () => {
    expect([...ETAPAS_QUALIFICADAS]).toEqual(["visita", "negociacao"]);
    for (const chave of ETAPAS_QUALIFICADAS) {
      expect(ETAPAS_PADRAO.find((e) => e.chave === chave)?.protegida, chave).toBe(true);
      expect(ehEtapaQualificada(etapa(chave), null), chave).toBe(true);
    }
  });

  it("as etapas em andamento antes delas, e os dois desfechos ruins, não", () => {
    for (const chave of ["novo", "em_contato", "proposta", "perdido", "descartado"]) {
      expect(ehEtapaQualificada(etapa(chave), null), chave).toBe(false);
    }
    expect(ehEtapaQualificada(etapa("perdido"), "perdido")).toBe(false);
    expect(ehEtapaQualificada(etapa("descartado"), "descartado")).toBe(false);
  });

  it("o ganho qualifica por três caminhos: a etapa de tipo ganho, o desfecho gravado, e os dois", () => {
    expect(ehEtapaQualificada(etapa("fechado"), null)).toBe(true);
    expect(ehEtapaQualificada({ chave: "venda", tipo: "ganho" }, null)).toBe(true);
    // Funil sem a tabela (migração pendente): só o desfecho diz que foi ganho.
    expect(ehEtapaQualificada(null, "ganho")).toBe(true);
    expect(ehEtapaQualificada({ chave: "qualquer", tipo: null }, "ganho")).toBe(true);
    expect(ehEtapaQualificada(null, null)).toBe(false);
  });
});

describe("o que é devido depois de um movimento", () => {
  it("entrar na visita manda UM LeadQualificado, gerado pelo sistema, sem IP nem User-Agent", () => {
    const devidos = eventosDevidos(LEAD_COMPLETO, { etapa: etapa("visita"), desfecho: null });
    expect(devidos).toHaveLength(1);
    const [d] = devidos;
    expect(d.chave).toBe("qualificado");
    expect(d.evento).toMatchObject({
      eventName: "LeadQualificado",
      eventId: "lead-1:qualificado",
      actionSource: "system_generated",
      userData: {
        email: "ana@exemplo.com",
        phone: "41999990000",
        fbp: "fb.1.1.2",
        fbc: "fb.1.1.abc",
        externalId: "ag-1",
      },
      customData: { content_ids: ["123"], content_type: "product", etapa: "visita" },
    });
    // IP e User-Agent seriam os do VENDEDOR no painel, não os do cliente.
    expect(d.evento?.userData).not.toHaveProperty("clientIpAddress");
    expect(d.evento?.userData).not.toHaveProperty("clientUserAgent");
    expect(d.evento?.eventSourceUrl).toBeUndefined();
    if (d.evento) expect(d.extra).toEqual({ etapa: "visita" });
  });

  it("negociação manda o mesmo evento; em contato, proposta e perdido não mandam nada", () => {
    expect(eventosDevidos(LEAD_COMPLETO, { etapa: etapa("negociacao"), desfecho: null })).toHaveLength(1);
    for (const chave of ["novo", "em_contato", "proposta"]) {
      expect(eventosDevidos(LEAD_COMPLETO, { etapa: etapa(chave), desfecho: null }), chave).toEqual([]);
    }
    expect(eventosDevidos(LEAD_COMPLETO, { etapa: etapa("perdido"), desfecho: "perdido" })).toEqual([]);
    expect(eventosDevidos(LEAD_COMPLETO, { etapa: etapa("descartado"), desfecho: "descartado" })).toEqual([]);
  });

  it("o ganho com valor manda LeadQualificado E Purchase, com o valor real em BRL", () => {
    const devidos = eventosDevidos(
      { ...LEAD_COMPLETO, desfecho_valor: 55000.5 },
      { etapa: etapa("fechado"), desfecho: "ganho" },
    );
    expect(devidos.map((d) => d.chave)).toEqual(["qualificado", "purchase"]);
    const purchase = devidos[1];
    expect(purchase.evento).toMatchObject({
      eventName: "Purchase",
      eventId: "lead-1:purchase",
      actionSource: "system_generated",
      customData: { value: 55000.5, currency: "BRL", content_ids: ["123"], content_type: "product" },
    });
    if (purchase.evento) expect(purchase.extra).toEqual({ valor: 55000.5 });
  });

  it("o ganho SEM valor não manda Purchase — fica pulado, com o motivo, para ir quando o valor chegar", () => {
    const devidos = eventosDevidos(LEAD_COMPLETO, { etapa: etapa("fechado"), desfecho: "ganho" });
    expect(devidos.map((d) => d.chave)).toEqual(["qualificado", "purchase"]);
    expect(devidos[1]).toEqual({ chave: "purchase", evento: null, motivo: SEM_VALOR });

    // O valor chegou depois, num PATCH com o motivo de novo: agora vai.
    const comValor = eventosDevidos(
      {
        ...LEAD_COMPLETO,
        desfecho_valor: 48000,
        capi_meta_response: {
          qualificado: registro("enviado"),
          purchase: { evento: "Purchase", resultado: "pulado", motivo: SEM_VALOR, em: "2026-10-16T10:00:00.000Z" },
        },
      },
      { etapa: etapa("fechado"), desfecho: "ganho" },
    );
    expect(comValor.map((d) => d.chave)).toEqual(["purchase"]);
    expect(comValor[0].evento?.customData).toMatchObject({ value: 48000, currency: "BRL" });
  });

  it("uma vez por lead: o que já foi ENVIADO não vai de novo; recusa e rede voltam a tentar", () => {
    const com = (resultado: "enviado" | "recusado" | "sem_rede") => ({
      ...LEAD_COMPLETO,
      capi_meta_response: { qualificado: registro(resultado) },
    });
    // Visita → negociação, já qualificado: nada.
    expect(eventosDevidos(com("enviado"), { etapa: etapa("negociacao"), desfecho: null })).toEqual([]);
    // Reaberto e levado à visita de novo: continua nada.
    expect(eventosDevidos(com("enviado"), { etapa: etapa("visita"), desfecho: null })).toEqual([]);
    // O Meta recusou da outra vez, ou a rede caiu: tenta de novo, com o MESMO event_id.
    for (const resultado of ["recusado", "sem_rede"] as const) {
      const devidos = eventosDevidos(com(resultado), { etapa: etapa("negociacao"), desfecho: null });
      expect(devidos, resultado).toHaveLength(1);
      expect(devidos[0].evento?.eventId).toBe("lead-1:qualificado");
    }
  });

  it("ganho de quem já era qualificado manda só o Purchase", () => {
    const devidos = eventosDevidos(
      { ...LEAD_COMPLETO, desfecho_valor: 60000, capi_meta_response: { qualificado: registro("enviado") } },
      { etapa: etapa("fechado"), desfecho: "ganho" },
    );
    expect(devidos.map((d) => d.chave)).toEqual(["purchase"]);
  });

  it("lead sem nada por onde o Meta o reconheça: pulado, com o motivo, e nunca um evento anônimo", () => {
    const anonimo: LeadParaOMeta = { id: "lead-2", desfecho_valor: 1000 };
    expect(correspondenciaDoLead(anonimo)).toBeNull();
    const devidos = eventosDevidos(anonimo, { etapa: etapa("fechado"), desfecho: "ganho" });
    expect(devidos).toEqual([
      { chave: "qualificado", evento: null, motivo: SEM_CORRESPONDENCIA },
      { chave: "purchase", evento: null, motivo: SEM_CORRESPONDENCIA },
    ]);
    // Só espaços também é nada.
    expect(correspondenciaDoLead({ id: "x", telefone: "  ", email: "" })).toBeNull();
  });

  it("o telefone normalizado ganha do digitado quando existe; sem carro, sem content_ids", () => {
    const d = eventosDevidos(
      { id: "lead-3", telefone: "(41) 99999-0000", telefone_normalizado: "5541999990000", veiculo_id: null },
      { etapa: etapa("visita"), desfecho: null },
    )[0];
    expect(d.evento?.userData).toEqual({ email: null, phone: "5541999990000", fbp: null, fbc: null, externalId: null });
    expect(d.evento?.customData).toEqual({ etapa: "visita" });
  });
});

describe("o valor como o banco o devolve", () => {
  it("número, ou texto com ponto DECIMAL — e nunca a régua do que se digita", () => {
    expect(valorGravado(55000)).toBe(55000);
    expect(valorGravado("55000.5")).toBe(55000.5);
    expect(valorGravado("48000")).toBe(48000);
  });
  it("zero, negativo, vazio, lixo e nulo são 'sem valor'", () => {
    for (const v of [0, -1, "", "  ", "abc", null, undefined, NaN, Infinity]) {
      expect(valorGravado(v), String(v)).toBeNull();
    }
  });
});

describe("o registro na linha do lead", () => {
  it("lê o jsonb com tolerância: só entra o que tem a forma; o resto é ignorado, não derruba", () => {
    expect(lerRegistros(null)).toEqual({});
    expect(lerRegistros("texto")).toEqual({});
    expect(lerRegistros([1, 2])).toEqual({});
    const lido = lerRegistros({
      lead: { evento: "Lead", resultado: "enviado", em: "2026-10-16T09:00:00.000Z", http: 200 },
      qualificado: { evento: "LeadQualificado", resultado: "inventado", em: "x" },
      purchase: "não é objeto",
      outra: { evento: "X", resultado: "enviado", em: "x" },
    });
    expect(Object.keys(lido)).toEqual(["lead"]);
  });

  it("a entrega aceita vira 'enviado' com o http e o resumo do Graph; a recusa, 'recusado' com o erro; sem rede, 'sem_rede' sem http", () => {
    const agora = Date.parse("2026-10-16T12:00:00.000Z");
    const ok = registroDaEntrega(
      "LeadQualificado",
      "lead-1:qualificado",
      { ok: true, status: 200, corpo: { events_received: 1, fbtrace_id: "tr-1", messages: [] } },
      { etapa: "visita" },
      agora,
    );
    expect(ok).toEqual({
      evento: "LeadQualificado",
      event_id: "lead-1:qualificado",
      resultado: "enviado",
      em: "2026-10-16T12:00:00.000Z",
      http: 200,
      resposta: { events_received: 1, fbtrace_id: "tr-1" },
      etapa: "visita",
    });

    const recusa = registroDaEntrega(
      "Purchase",
      "lead-1:purchase",
      { ok: false, status: 400, corpo: { error: { message: "Invalid parameter", code: 100, error_subcode: 2804003, fbtrace_id: "tr-2", type: "OAuthException" } } },
      { valor: 1 },
      agora,
    );
    expect(recusa).toMatchObject({
      resultado: "recusado",
      http: 400,
      resposta: { error: { message: "Invalid parameter", code: 100, error_subcode: 2804003, fbtrace_id: "tr-2" } },
    });

    const semRede = registroDaEntrega("Purchase", "lead-1:purchase", { ok: false, status: 0 }, {}, agora);
    expect(semRede.resultado).toBe("sem_rede");
    expect(semRede).not.toHaveProperty("http");
    expect(semRede).not.toHaveProperty("resposta");
  });

  it("o resumo não guarda corpo arbitrário: texto é cortado em 300, e objeto sem nada conhecido vira nada", () => {
    expect(resumirResposta("x".repeat(1000))).toHaveLength(300);
    expect(resumirResposta({ qualquer: "coisa" })).toBeUndefined();
    expect(resumirResposta(undefined)).toBeUndefined();
  });

  it("o status é o registro MAIS RECENTE, e o sent_at é a última entrega aceita", () => {
    const registros: RegistrosDaCapi = {
      lead: { evento: "Lead", resultado: "enviado", em: "2026-10-01T10:00:00.000Z" },
      qualificado: { evento: "LeadQualificado", resultado: "enviado", em: "2026-10-10T10:00:00.000Z" },
      purchase: { evento: "Purchase", resultado: "pulado", motivo: SEM_VALOR, em: "2026-10-16T10:00:00.000Z" },
    };
    expect(statusDaCapi(registros)).toBe("Purchase:pulado");
    expect(ultimoEnvio(registros)).toBe("2026-10-10T10:00:00.000Z");
    expect(colunasDaCapi(registros)).toEqual({
      capi_meta_status: "Purchase:pulado",
      capi_meta_response: registros,
      capi_meta_sent_at: "2026-10-10T10:00:00.000Z",
    });
    expect(statusDaCapi({})).toBeNull();
    expect(ultimoEnvio({ purchase: registros.purchase })).toBeNull();
    expect(registroPulado("Purchase", null, SEM_VALOR, 0)).toEqual({
      evento: "Purchase",
      resultado: "pulado",
      motivo: SEM_VALOR,
      em: "1970-01-01T00:00:00.000Z",
    });
  });
});

// ---------------------------------------------------------------------------
// 2. O módulo de servidor, executado
// ---------------------------------------------------------------------------

/** A linha que o `select` devolve, e o que o `update` recebeu. */
let linha: Linha | null;
let erroDaLeitura: { message: string } | null;
let erroDaGravacao: { message: string } | null;
let gravacoes: Array<{ campos: Linha; filtros: Array<[string, unknown]> }>;
let colunasLidas: string[];

/** O cliente do painel, reduzido ao que o módulo usa: `select` e `update` em `leads`. */
const CLIENTE = {
  from: (tabela: string) => {
    if (tabela !== "leads") throw new Error(`tabela inesperada: ${tabela}`);
    return {
      select: (colunas: string) => {
        colunasLidas.push(colunas);
        const q = {
          eq: () => q,
          maybeSingle: async () => (erroDaLeitura ? { data: null, error: erroDaLeitura } : { data: linha, error: null }),
        };
        return q;
      },
      update: (campos: Linha) => {
        const filtros: Array<[string, unknown]> = [];
        gravacoes.push({ campos, filtros });
        const q = {
          eq: (coluna: string, valor: unknown) => (filtros.push([coluna, valor]), q),
          then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: erroDaGravacao }).then(ok, falha),
        };
        return q;
      },
    };
  },
} as unknown as ClienteDeLeads;

const servidor = await import("../src/lib/qualificacaoParaMeta-servidor");
const pixel = { lerPixelId: async () => settings.pixel };

beforeEach(() => {
  capi.chamadas = [];
  capi.resposta = { ok: true, status: 200, corpo: { events_received: 1, fbtrace_id: "tr-1" } };
  falhas.length = 0;
  settings.pixel = "px-1";
  settings.lanca = false;
  linha = { ...LEAD_COMPLETO };
  erroDaLeitura = null;
  erroDaGravacao = null;
  gravacoes = [];
  colunasLidas = [];
});

describe("qualificarNoMeta — no movimento, só o Purchase do ganho: lê a linha, manda, grava o resultado", () => {
  const GANHO = { etapa: etapa("fechado"), desfecho: "ganho" as const };
  const comValor = () => (linha = { ...LEAD_COMPLETO, desfecho_valor: 55000 });

  it("Visita e Negociação não mandam nada daqui nem custam a leitura da linha: o LeadQualificado vai de hora em hora", async () => {
    for (const chave of ["visita", "negociacao", "em_contato"]) {
      const r = await servidor.qualificarNoMeta(CLIENTE, "lead-1", { etapa: etapa(chave), desfecho: null }, pixel);
      expect(r).toEqual({ enviados: [], aviso: null });
    }
    expect(colunasLidas).toEqual([]);
    expect(capi.chamadas).toEqual([]);
    expect(gravacoes).toEqual([]);
  });

  it("ganho com valor: lê as colunas do Meta, manda SÓ o Purchase com o pixel das settings e grava as três colunas", async () => {
    comValor();
    const r = await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, pixel);

    expect(colunasLidas).toEqual([COLUNAS_PARA_O_META]);
    expect(capi.chamadas.map((c) => c.eventName)).toEqual(["Purchase"]);
    expect(capi.chamadas[0]).toMatchObject({ eventId: "lead-1:purchase", pixelId: "px-1", customData: { value: 55000, currency: "BRL" } });

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].filtros).toEqual([["id", "lead-1"]]);
    const { campos } = gravacoes[0];
    expect(campos.capi_meta_status).toBe("Purchase:enviado");
    expect(campos.capi_meta_response).toMatchObject({
      purchase: { evento: "Purchase", event_id: "lead-1:purchase", resultado: "enviado", http: 200, valor: 55000, resposta: { events_received: 1, fbtrace_id: "tr-1" } },
    });
    expect(campos.capi_meta_response).not.toHaveProperty("qualificado");
    expect(typeof campos.capi_meta_sent_at).toBe("string");
    expect(r).toEqual({ enviados: ["Purchase"], aviso: null });
  });

  it("junta ao que a linha já tinha: o Lead da captura e o LeadQualificado ficam, e o status passa a ser o mais recente", async () => {
    linha = {
      ...LEAD_COMPLETO,
      desfecho_valor: 55000,
      capi_meta_response: {
        lead: { evento: "Lead", event_id: "evt-1", resultado: "enviado", em: "2026-10-01T10:00:00.000Z", http: 200 },
        qualificado: registro("enviado"),
      },
    };
    await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, pixel);
    const { campos } = gravacoes[0];
    expect(Object.keys(campos.capi_meta_response as object)).toEqual(["lead", "qualificado", "purchase"]);
    expect(campos.capi_meta_status).toBe("Purchase:enviado");
  });

  it("ganho sem valor: nada vai, o Purchase fica pulado na linha, e a tela recebe o aviso", async () => {
    const r = await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, pixel);
    expect(capi.chamadas).toEqual([]);
    const { campos } = gravacoes[0];
    expect(campos.capi_meta_response).toEqual({ purchase: expect.objectContaining({ evento: "Purchase", resultado: "pulado", motivo: SEM_VALOR }) });
    expect(campos.capi_meta_status).toBe("Purchase:pulado");
    expect(r).toEqual({ enviados: [], aviso: AVISO_DE_GANHO_SEM_VALOR });
  });

  it("o Meta recusou: fica 'recusado' com o erro resumido, e nada conta como enviado", async () => {
    comValor();
    capi.resposta = { ok: false, status: 400, corpo: { error: { message: "Invalid parameter", code: 100 } } };
    const r = await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, pixel);
    expect(gravacoes[0].campos.capi_meta_status).toBe("Purchase:recusado");
    expect(gravacoes[0].campos.capi_meta_sent_at).toBeNull();
    expect(gravacoes[0].campos.capi_meta_response).toMatchObject({
      purchase: { resultado: "recusado", http: 400, resposta: { error: { message: "Invalid parameter", code: 100 } } },
    });
    expect(r.enviados).toEqual([]);
  });

  it("sem pixel a CAPI está desligada: nada vai, nada se grava — e o pixel só é lido quando há o que mandar", async () => {
    comValor();
    settings.pixel = null;
    let lido = 0;
    const fontes = { lerPixelId: async () => (lido += 1, settings.pixel) };
    await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, fontes);
    expect(lido).toBe(1);
    expect(capi.chamadas).toEqual([]);
    expect(gravacoes).toEqual([]);

    // Purchase já aceito: nada devido, e o pixel nem é lido.
    linha = { ...LEAD_COMPLETO, desfecho_valor: 55000, capi_meta_response: { purchase: { evento: "Purchase", resultado: "enviado", em: "2026-10-16T10:00:00.000Z" } } };
    await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, fontes);
    expect(lido).toBe(1);
  });

  it("a leitura do pixel que LANÇA (o unstable_cache fora de requisição) é engolida: nada vai, nada lança", async () => {
    comValor();
    const fontes = { lerPixelId: async () => { throw new Error("Invariant: incrementalCache missing"); } };
    const calado = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, fontes);
    calado.mockRestore();
    expect(r).toEqual({ enviados: [], aviso: null });
    expect(capi.chamadas).toEqual([]);
    expect(gravacoes).toEqual([]);
  });

  it("linha ilegível ou ausente: nada vai, nada lança", async () => {
    erroDaLeitura = { message: "permission denied" };
    const calado = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, pixel)).toEqual({ enviados: [], aviso: null });
    erroDaLeitura = null;
    linha = null;
    expect(await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, pixel)).toEqual({ enviados: [], aviso: null });
    calado.mockRestore();
    expect(capi.chamadas).toEqual([]);
  });

  it("a gravação que falha vai para a triagem, e o evento que já foi continua contando como enviado", async () => {
    comValor();
    erroDaGravacao = { message: "permission denied for table leads" };
    const calado = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await servidor.qualificarNoMeta(CLIENTE, "lead-1", GANHO, pixel);
    calado.mockRestore();
    expect(r.enviados).toEqual(["Purchase"]);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].slice(0, 3)).toEqual(["quebra", "meta-capi-registro", "permission denied for table leads"]);
  });

  it("o cliente que LANÇA (dublê sem update, banco fora) também não derruba quem chamou", async () => {
    const quebrado = { from: () => { throw new Error("rede caiu"); } };
    const calado = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await servidor.qualificarNoMeta(quebrado as never, "lead-1", GANHO, pixel);
    calado.mockRestore();
    expect(r).toEqual({ enviados: [], aviso: null });
    expect(falhas[0]?.slice(0, 2)).toEqual(["quebra", "meta-capi-qualificacao"]);
  });

  it("registrarLeadNaLinha grava o Lead da captura como a primeira entrada", async () => {
    await servidor.registrarLeadNaLinha(
      CLIENTE,
      "lead-9",
      registroDaEntrega("Lead", "evt-1", { ok: true, status: 200, corpo: { events_received: 1 } }, {}, 0),
    );
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].filtros).toEqual([["id", "lead-9"]]);
    expect(gravacoes[0].campos).toEqual({
      capi_meta_status: "Lead:enviado",
      capi_meta_response: {
        lead: { evento: "Lead", event_id: "evt-1", resultado: "enviado", em: "1970-01-01T00:00:00.000Z", http: 200, resposta: { events_received: 1 } },
      },
      capi_meta_sent_at: "1970-01-01T00:00:00.000Z",
    });
  });

  it("pixelIdDasSettings lê o pixel de companySettings, aparado, e nulo quando vazio", async () => {
    settings.pixel = " 1410450786690090 ";
    expect(await servidor.pixelIdDasSettings()).toBe("1410450786690090");
    settings.pixel = "";
    expect(await servidor.pixelIdDasSettings()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. O PATCH de `/api/leads/gerenciar`, executado
// ---------------------------------------------------------------------------

const MOTIVOS: MotivoDoFunil[] = [
  { chave: "a_vista", rotulo: "Pagou à vista", tipo: "ganho", ordem: 1, ativo: true, escopo: "ambos" },
  { chave: "caro", rotulo: "Achou caro", tipo: "perdido", ordem: 2, ativo: true, escopo: "ambos" },
];

/** O lead no banco do painel: a Ana atende; o `update` aplica os campos nele. */
let leadNoBanco: Linha;
/** O que a rota mandou gravar em `leads`, na ordem. */
let gravacoesDoPainel: Linha[];
/** Se o `update` da etapa alcança o lead (escopo). */
let alcanca: boolean;

/** Uma consulta genérica: encadeia o que for, e resolve com `dados` (ou o erro). */
function consulta(dados: unknown, erro: { message: string; code?: string } | null = null) {
  const resposta = () => (erro ? { data: null, error: erro } : { data: dados, error: null });
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "not", "in", "is", "order", "limit", "or", "ilike"]) q[m] = () => q;
  q.single = async () => resposta();
  q.maybeSingle = async () => {
    const r = resposta();
    return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data };
  };
  q.then = (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, falha);
  return q;
}

const SESSAO = {
  auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  rpc: async () => ({ error: null }),
  from: (tabela: string) => {
    if (tabela === "profiles") {
      // Com `eq("id")` é quem chama; sem filtro, a equipe.
      const q = consulta([{ full_name: "Ana", role: "comercial", papeis: ["comercial"], is_active: true }]);
      q.single = async () => ({ data: { role: "comercial", papeis: ["comercial"], full_name: "Ana", is_active: true }, error: null });
      return q;
    }
    if (tabela === "funil_etapas") {
      let chave: unknown;
      const q = consulta(null);
      q.eq = (_c: string, v: unknown) => ((chave = v), q);
      q.maybeSingle = async () => ({ data: ETAPAS_PADRAO.find((e) => e.chave === chave) ?? null, error: null });
      return q;
    }
    if (tabela === "funil_motivos") return consulta(MOTIVOS);
    if (tabela === "leads") {
      return {
        select: () => consulta(leadNoBanco),
        update: (campos: Linha) => {
          gravacoesDoPainel.push(campos);
          if (alcanca) Object.assign(leadNoBanco, campos);
          const q = consulta(alcanca ? [{ id: leadNoBanco.id }] : []);
          return q;
        },
      };
    }
    // O que vem depois do desfecho (veículos de interesse, Chatwoot): tabela
    // ausente, que as duas metades tratam como "não há".
    return consulta(null, { message: `relation "${tabela}" does not exist`, code: "PGRST205" });
  },
};
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => SESSAO,
  createAdminSupabaseClient: () => SESSAO,
}));

const { PATCH } = await import("../src/app/api/leads/gerenciar/route");

const mover = (corpo: Record<string, unknown>) =>
  PATCH(
    new Request("http://x/api/leads/gerenciar", {
      method: "PATCH",
      body: JSON.stringify({ id: "lead-1", ...corpo }),
      headers: { "content-type": "application/json" },
    }) as never,
  );

beforeEach(() => {
  leadNoBanco = { ...LEAD_COMPLETO, situacao: "proposta", canal: "Formulário Contato", responsavel: "Ana" };
  gravacoesDoPainel = [];
  alcanca = true;
});

describe("PATCH /api/leads/gerenciar — o Purchase vai depois do update, e só se ele alcançou o lead; o LeadQualificado, de hora em hora", () => {
  it("mover para a visita só grava a etapa: o LeadQualificado vai pela rodada de hora em hora", async () => {
    const r = await mover({ situacao: "visita" });
    expect(r.status).toBe(200);
    expect(capi.chamadas).toEqual([]);
    expect(gravacoesDoPainel).toHaveLength(1);
    expect(gravacoesDoPainel[0]).toMatchObject({ situacao: "visita" });
    expect(gravacoesDoPainel[0]).not.toHaveProperty("capi_meta_status");
  });

  it("mover entre etapas em andamento, ou para a negociação, não manda nada e grava uma vez só", async () => {
    for (const situacao of ["em_contato", "negociacao"]) {
      gravacoesDoPainel = [];
      const r = await mover({ situacao });
      expect(r.status).toBe(200);
      expect(gravacoesDoPainel).toHaveLength(1);
    }
    expect(capi.chamadas).toEqual([]);
  });

  it("o update que não alcançou o lead não manda evento nenhum", async () => {
    alcanca = false;
    await mover({ situacao: "fechado", desfecho_motivo: "a_vista", desfecho_valor: "55.000,50" });
    expect(capi.chamadas).toEqual([]);
    expect(gravacoesDoPainel).toHaveLength(1);
  });

  it("fechar como ganho com valor manda o Purchase com o valor que a rota acabou de gravar, DEPOIS do update", async () => {
    const r = await mover({ situacao: "fechado", desfecho_motivo: "a_vista", desfecho_valor: "55.000,50" });
    expect(r.status).toBe(200);
    expect(capi.chamadas.map((c) => c.eventName)).toEqual(["Purchase"]);
    expect(capi.chamadas[0]).toMatchObject({
      eventId: "lead-1:purchase",
      actionSource: "system_generated",
      pixelId: "px-1",
      userData: { phone: "41999990000", email: "ana@exemplo.com", externalId: "ag-1" },
      customData: { value: 55000.5, currency: "BRL", content_ids: ["123"], content_type: "product" },
    });
    // Duas gravações, nesta ordem: a etapa, depois o resultado da CAPI.
    expect(gravacoesDoPainel).toHaveLength(2);
    expect(gravacoesDoPainel[0]).toMatchObject({ situacao: "fechado" });
    expect(gravacoesDoPainel[0]).not.toHaveProperty("capi_meta_status");
    const corpo = await r.json();
    expect(corpo.ok).toBe(true);
    expect(String(corpo.aviso ?? "")).not.toContain(AVISO_DE_GANHO_SEM_VALOR);
    expect(leadNoBanco.capi_meta_status).toBe("Purchase:enviado");
  });

  it("fechar como ganho SEM valor: o Purchase não vai, fica pulado na linha, e a resposta avisa a tela", async () => {
    const r = await mover({ situacao: "fechado", desfecho_motivo: "a_vista" });
    expect(r.status).toBe(200);
    expect(capi.chamadas).toEqual([]);
    const corpo = await r.json();
    expect(corpo.aviso).toContain(AVISO_DE_GANHO_SEM_VALOR);
    expect(leadNoBanco.capi_meta_status).toBe("Purchase:pulado");

    // O vendedor volta e informa o valor, com o motivo de novo: agora o Purchase vai.
    const depois = await mover({ situacao: "fechado", desfecho_motivo: "a_vista", desfecho_valor: "48000" });
    expect(depois.status).toBe(200);
    expect(capi.chamadas.map((c) => c.eventName)).toEqual(["Purchase"]);
    expect(capi.chamadas[0]).toMatchObject({ customData: { value: 48000 } });
    expect(leadNoBanco.capi_meta_status).toBe("Purchase:enviado");
  });

  it("perder não manda nada", async () => {
    const r = await mover({ situacao: "perdido", desfecho_motivo: "caro" });
    expect(r.status).toBe(200);
    expect(capi.chamadas).toEqual([]);
  });

  it("a CAPI dublada que devolve NADA não derruba o movimento", async () => {
    capi.resposta = undefined;
    const calado = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await mover({ situacao: "fechado", desfecho_motivo: "a_vista", desfecho_valor: "48000" });
    calado.mockRestore();
    expect(r.status).toBe(200);
    expect(gravacoesDoPainel[0]).toMatchObject({ situacao: "fechado" });
  });
});

// ---------------------------------------------------------------------------
// 4. Os outros dois pontos de entrada, pelo código
// ---------------------------------------------------------------------------

describe("os outros caminhos para a etapa qualificada e para a linha", () => {
  it("o 'Chegou na loja' move para a visita e não manda nada: o LeadQualificado vai de hora em hora", () => {
    const rota = lerCodigo("src/app/api/leads/[id]/chegou/route.ts");
    expect(rota).toContain("update({ situacao: visita.chave");
    expect(rota, "a visita pelo pátio voltou a mandar na hora").not.toContain("qualificarNoMeta(");
  });

  it("a rodada agendada do Meta é quem manda o LeadQualificado", () => {
    const rota = lerCodigo("src/app/api/marketing/sincronizar/meta/route.ts");
    expect(rota).toContain("repescarQualificacoes(admin");
  });

  it("o PATCH do quadro diz em que etapa o lead FICOU e qual desfecho gravou, depois de alcançar o lead", () => {
    const rota = lerCodigo("src/app/api/leads/gerenciar/route.ts");
    expect(rota).toContain("if (alcancouOLead && situacao !== undefined) {");
    expect(rota).toContain("{ etapa: { chave: String(situacao), tipo: tipoDaEtapaGravada }, desfecho: desfechoGravado }");
  });

  it("a captura grava na linha o que o Meta respondeu ao Lead — e o Lead sem event_id fica dito", () => {
    const rota = lerCodigo("src/app/api/leads/route.ts");
    const envio = rota.indexOf('eventName: "Lead"');
    const registro = rota.indexOf('registroDaEntrega("Lead", String(body.eventId), entrega)');
    expect(envio).toBeGreaterThan(-1);
    expect(registro, "o resultado do Lead não fica na linha").toBeGreaterThan(envio);
    expect(rota).toContain("const entrega = await sendCapiEvent({");
    expect(rota).toContain('registroPulado("Lead", null, SEM_EVENT_ID)');
    // Só com a linha gravada e com uma entrega de verdade.
    expect(rota).toContain("if (idDoLead && entrega) {");
  });

  it("sendCapiEvent conhece os dois eventos do painel e a origem `system_generated`, e devolve o corpo do Graph", () => {
    const lib = lerCodigo("src/lib/meta-capi.ts");
    expect(lib).toContain('| "LeadQualificado"');
    expect(lib).toContain('| "Purchase"');
    expect(lib).toContain('actionSource?: "website" | "system_generated";');
    // O padrão continua `website`: nada do que o navegador espelha muda.
    expect(lib).toContain('action_source: event.actionSource ?? "website"');
    expect(lib).toContain("return { ok: res.ok, status: res.status, corpo: lerCorpo(corpo) };");
  });
});

describe("quandoQualificou — se o lead CHEGOU a qualificar, pelo rastro", () => {
  const p = (para: string, em: string): PassagemDeEtapa => ({ para, em: `2026-10-${em}Z` });
  const NAO = { qualificou: false, desde: null, ultima: null };

  it("o cartão arrastado coluna a coluna não qualifica (os casos do rastro de produção)", () => {
    // Recontato → Visita → Negociação em segundos, de volta a Recontato em segundos.
    const relampago = [p("em_contato", "13T18:56:50"), p("proposta", "13T18:56:51"), p("visita", "13T18:56:54"), p("negociacao", "13T18:56:55"), p("proposta", "13T18:57:30")];
    expect(quandoQualificou(relampago, { situacao: "proposta", desfecho: null })).toEqual(NAO);
    expect(PERMANENCIA_MINIMA_MS).toBe(10 * 60 * 1000);
  });

  it("a passagem rápida por Visita até Negociação, que ficou, conta desde a Visita", () => {
    const r = [p("em_contato", "09T14:25:08"), p("proposta", "09T14:35:12"), p("visita", "09T14:35:16"), p("negociacao", "09T14:35:19"), p("proposta", "15T14:49:24")];
    expect(quandoQualificou(r, { situacao: "proposta", desfecho: null })).toEqual({ qualificou: true, desde: "2026-10-09T14:35:16Z", ultima: "2026-10-09T14:35:16Z" });
  });

  it("visitou e depois foi perdido: qualificou", () => {
    const r = [p("em_contato", "12T12:27:54"), p("proposta", "12T12:58:22"), p("visita", "14T15:39:52"), p("perdido", "16T12:42:29")];
    expect(quandoQualificou(r, { situacao: "perdido", desfecho: "perdido" })).toMatchObject({ qualificou: true, desde: "2026-10-14T15:39:52Z" });
  });

  it("'Não é oportunidade' nunca qualifica, mesmo depois de 21 horas em Negociação", () => {
    const r = [p("em_contato", "13T18:56:50"), p("visita", "13T18:56:54"), p("negociacao", "13T18:56:55"), p("descartado", "14T15:46:13")];
    expect(quandoQualificou(r, { situacao: "descartado", desfecho: "descartado" })).toEqual(NAO);
  });

  it("ainda em Visita: conta desde a entrada, dure o que durar", () => {
    const r = [p("em_contato", "17T12:31:16"), p("proposta", "17T12:43:58"), p("visita", "17T12:43:59")];
    expect(quandoQualificou(r, { situacao: "visita", desfecho: null })).toMatchObject({ qualificou: true, desde: "2026-10-17T12:43:59Z" });
  });

  it("voltou à Visita: `desde` é a primeira vez, `ultima` a volta; o arrasto no meio não conta", () => {
    const r = [
      p("visita", "06T21:16:04"),
      p("negociacao", "06T21:16:05"),
      p("proposta", "12T13:14:58"),
      p("visita", "13T10:00:00"),
      p("proposta", "13T10:00:20"),
      p("visita", "14T15:40:01"),
    ];
    expect(quandoQualificou(r, { situacao: "visita", desfecho: null })).toEqual({ qualificou: true, desde: "2026-10-06T21:16:04Z", ultima: "2026-10-14T15:40:01Z" });
  });

  it("ganho qualifica sempre: desde a primeira Visita/Negociação, ou desde a entrada no ganho; `ultima` é o ganho", () => {
    expect(quandoQualificou([p("em_contato", "01T18:12:10"), p("fechado", "09T16:04:26")], { situacao: "fechado", desfecho: "ganho" })).toEqual({
      qualificou: true,
      desde: "2026-10-09T16:04:26Z",
      ultima: "2026-10-09T16:04:26Z",
    });
    const visitouAntes = [p("visita", "05T10:00:00"), p("proposta", "05T10:00:05"), p("fechado", "09T16:04:26")];
    expect(quandoQualificou(visitouAntes, { situacao: "fechado", desfecho: "ganho", desfechoEm: "2026-10-09T16:04:27Z" })).toEqual({
      qualificou: true,
      desde: "2026-10-05T10:00:00Z",
      ultima: "2026-10-09T16:04:27Z",
    });
    // Ganho sem rastro: o horário do desfecho serve para os dois.
    expect(quandoQualificou([], { situacao: "fechado", desfecho: "ganho", desfechoEm: "2026-10-09T16:04:27Z" })).toEqual({
      qualificou: true,
      desde: "2026-10-09T16:04:27Z",
      ultima: "2026-10-09T16:04:27Z",
    });
  });

  it("sem rastro (lead de antes dele): vale a etapa de agora, sem data", () => {
    expect(quandoQualificou([], { situacao: "negociacao", desfecho: null })).toEqual({ qualificou: true, desde: null, ultima: null });
    expect(quandoQualificou([], { situacao: "em_contato", desfecho: null })).toEqual(NAO);
  });

  it("a ordem de chegada do rastro não importa", () => {
    const r = [p("perdido", "16T12:42:29"), p("visita", "14T15:39:52"), p("em_contato", "12T12:27:54")];
    expect(quandoQualificou(r, { situacao: "perdido", desfecho: "perdido" }).desde).toBe("2026-10-14T15:39:52Z");
  });
});
