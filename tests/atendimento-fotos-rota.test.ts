import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoDeTeste, LOJA_DE_TESTE, transporteDeTeste, type BancoDeTeste } from "./bancoDoAtendimentoDeTeste";

/**
 * A rota da aba Fotos do Atendimento IA (2026-10-20): Admin e Gestor veem
 * como as fotos do estoque foram separadas, corrigem à mão e mandam
 * classificar agora.
 */

let perfil: Record<string, unknown> | null;
let banco: BancoDeTeste;
const etiquetas: string[] = [];

const ONIX = "7950008";
const HB20 = "7950009";
const url = (carro: string, n: number) => `https://fotos.teste/${carro}/${n}.jpg`;
const BASE = {
  nomeDaLoja: "Loja",
  loja: "",
  catalogo: "",
  totalDoCatalogo: 2,
  geradoEm: "agora",
  fotos: {
    [ONIX]: { nome: "Onix LT 2020", urls: [url("onix", 1), url("onix", 2), url("onix", 3)] },
    [HB20]: { nome: "HB20 Sense 2021", urls: [url("hb20", 1)] },
  },
};

vi.mock("../src/lib/observabilidade", () => ({ registrarFalha: async () => undefined }));
vi.mock("next/cache", () => ({ revalidateTag: (t: string) => etiquetas.push(t), unstable_cache: (f: unknown) => f }));
vi.mock("../src/lib/baseDoAtendimento-servidor", () => ({ baseDaLoja: async () => BASE, ETIQUETA_DAS_FOTOS: "atendimento-fotos" }));
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: perfil ? { id: "u1" } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: perfil }) }) }) }),
  }),
  createAdminSupabaseClient: () => banco.cliente,
}));

const DONO = { role: "admin", papeis: ["admin"], full_name: "Dono da Loja", is_active: true };
const pedido = (metodo: string, caminho: string, corpo?: unknown) =>
  new Request(`https://loja.teste${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
// O NextRequest tem `nextUrl`; o Request de teste ganha um igual.
const comNextUrl = (r: Request) => Object.assign(r, { nextUrl: new URL(r.url) }) as never;

beforeEach(() => {
  perfil = DONO;
  etiquetas.length = 0;
  banco = bancoDeTeste({
    atendimento_fotos: [
      { id: "f1", org_id: LOJA_DE_TESTE, veiculo_id: 7950009, url: url("hb20", 1), posicao: 0, camada: "externa", aproveitavel: true, descricao: "Frente" },
      { id: "f2", org_id: LOJA_DE_TESTE, veiculo_id: 7950008, url: url("onix", 1), posicao: 0, camada: "externa", aproveitavel: true, descricao: "Frente" },
    ],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a aba Fotos", () => {
  it("só Admin e Gestor: o vendedor recebe 403", async () => {
    perfil = { role: "comercial", papeis: ["comercial"], full_name: "Carla", is_active: true };
    const { GET, PATCH } = await import("../src/app/api/atendimento/fotos/estoque/route");
    expect((await GET(comNextUrl(pedido("GET", "/api/atendimento/fotos/estoque")))).status).toBe(403);
    expect((await PATCH(comNextUrl(pedido("PATCH", "/api/atendimento/fotos/estoque", { veiculo: ONIX, url: url("onix", 1), camada: "outra" })))).status).toBe(403);
    expect(banco.tabelas.atendimento_fotos.find((f) => f.id === "f2")!.camada).toBe("externa");
  });

  it("a lista: os carros com fila primeiro, e o resumo do estoque", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "chave");
    const { GET } = await import("../src/app/api/atendimento/fotos/estoque/route");
    const corpo = await (await GET(comNextUrl(pedido("GET", "/api/atendimento/fotos/estoque")))).json();
    expect(corpo.carros.map((c: { id: string }) => c.id)).toEqual([ONIX, HB20]);
    expect(corpo.carros[0].situacao).toMatchObject({ total: 3, classificadas: 1, pendentes: 2, porCamada: { externa: 1 } });
    expect(corpo.resumo).toEqual({ carros: 2, separados: 1, semFoto: 0, fotosNaFila: 2 });
    expect(corpo.visao).toBe(true);
  });

  it("o carro: a galeria com a camada de cada foto; carro fora do estoque é 404", async () => {
    const { GET } = await import("../src/app/api/atendimento/fotos/estoque/route");
    const corpo = await (await GET(comNextUrl(pedido("GET", `/api/atendimento/fotos/estoque?veiculo=${ONIX}`)))).json();
    expect(corpo.carro).toEqual({ id: ONIX, nome: "Onix LT 2020" });
    expect(corpo.fotos.map((f: { camada: string | null }) => f.camada)).toEqual(["externa", null, null]);
    expect((await GET(comNextUrl(pedido("GET", "/api/atendimento/fotos/estoque?veiculo=123")))).status).toBe(404);
  });

  it("corrigir: grava com o nome de quem corrigiu e revalida o catálogo do assistente", async () => {
    const { PATCH } = await import("../src/app/api/atendimento/fotos/estoque/route");
    const r = await PATCH(comNextUrl(pedido("PATCH", "/api/atendimento/fotos/estoque", { veiculo: ONIX, url: url("onix", 2), camada: "motor", descricao: "Motor 1.0 turbo" })));
    expect(r.status).toBe(200);
    expect(banco.tabelas.atendimento_fotos.find((f) => f.url === url("onix", 2))).toMatchObject({
      camada: "motor",
      descricao: "Motor 1.0 turbo",
      posicao: 1,
      corrigido_por: "Dono da Loja",
      org_id: LOJA_DE_TESTE,
    });
    expect(etiquetas).toEqual(["atendimento-fotos"]);
  });

  it("sem a loja (org_padrao falhou), 503 — nada é lido nem gravado sem o filtro", async () => {
    banco = bancoDeTeste({ atendimento_fotos: [{ id: "x", org_id: "outra-loja", veiculo_id: 7950008, url: url("onix", 1), posicao: 0, camada: "externa", aproveitavel: true }] }, { org_padrao: () => null });
    const { GET, PATCH, POST } = await import("../src/app/api/atendimento/fotos/estoque/route");
    expect((await GET(comNextUrl(pedido("GET", "/api/atendimento/fotos/estoque")))).status).toBe(503);
    expect((await PATCH(comNextUrl(pedido("PATCH", "/api/atendimento/fotos/estoque", { veiculo: ONIX, url: url("onix", 1), camada: "outra" })))).status).toBe(503);
    expect((await POST(comNextUrl(pedido("POST", "/api/atendimento/fotos/estoque", { veiculo: ONIX, refazer: true })))).status).toBe(503);
    expect(banco.tabelas.atendimento_fotos).toEqual([expect.objectContaining({ id: "x", camada: "externa" })]);
  });

  it("corrigir devolve a legenda que ficou: a que tem preço não fica", async () => {
    const { PATCH } = await import("../src/app/api/atendimento/fotos/estoque/route");
    const r = await PATCH(comNextUrl(pedido("PATCH", "/api/atendimento/fotos/estoque", { veiculo: ONIX, url: url("onix", 2), camada: "externa", descricao: "Etiqueta R$ 79.900" })));
    expect(await r.json()).toEqual({ ok: true, descricao: null });
  });

  it("corrigir: camada inventada é 400; foto que saiu da galeria é 404", async () => {
    const { PATCH } = await import("../src/app/api/atendimento/fotos/estoque/route");
    expect((await PATCH(comNextUrl(pedido("PATCH", "/api/atendimento/fotos/estoque", { veiculo: ONIX, url: url("onix", 1), camada: "teto" })))).status).toBe(400);
    expect((await PATCH(comNextUrl(pedido("PATCH", "/api/atendimento/fotos/estoque", { veiculo: ONIX, url: url("onix", 9), camada: "motor" })))).status).toBe(404);
    expect(etiquetas).toEqual([]);
  });

  it("classificar um carro agora: o modelo vê só o que falta", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "chave");
    const t = transporteDeTeste([], {
      visao: (lista) => JSON.stringify({ fotos: lista.map((_, i) => ({ n: i + 1, camada: "interior", descricao: "Bancos", aproveitavel: true })) }),
    });
    vi.stubGlobal("fetch", t.transporte);
    const { POST } = await import("../src/app/api/atendimento/fotos/estoque/route");
    const r = await POST(comNextUrl(pedido("POST", "/api/atendimento/fotos/estoque", { veiculo: ONIX })));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, fotos_classificadas: 2, falhas: 0 });
    expect(t.pedidosDeVisao).toEqual([[url("onix", 2), url("onix", 3)]]);
    expect(etiquetas).toEqual(["atendimento-fotos"]);
  });

  it("sem a chave da DeepSeek, classificar responde 409 com o motivo", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const { POST } = await import("../src/app/api/atendimento/fotos/estoque/route");
    const r = await POST(comNextUrl(pedido("POST", "/api/atendimento/fotos/estoque", {})));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ ok: false, motivo: expect.stringContaining("DEEPSEEK_API_KEY") });
  });
});
