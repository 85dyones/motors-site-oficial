import { describe, it, expect, vi, beforeEach } from "vitest";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { fotoDeTeste, linhaDoBancoDeTeste } from "./repasseDeTeste";

/**
 * As rotas que criam e editam um carro de repasse, EXECUTADAS contra um
 * dublê do banco. Provam a fiação que só a rota tem: que o portão puro roda
 * antes de qualquer escrita, que a escrita é com a chave de serviço e presa à
 * situação lida (corrida vira 409), e que toda escrita deixa auditoria.
 */
let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));

const { POST } = await import("../src/app/api/repasses/route");
const { PATCH } = await import("../src/app/api/repasses/[id]/route");

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const MINIMO = { marca: "Renault", modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021, quilometragem: 71200, preco: 36900 };
const pedido = (corpo: unknown, method = "POST") =>
  new Request("http://teste/api/repasses", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const comId = (id = ID) => ({ params: Promise.resolve({ id }) });

function entrarComo(papeis: string[] | null, usuario?: { id: string; email: string } | null) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis, usuario);
}

beforeEach(() => entrarComo(["comercial"]));

describe("POST /api/repasses", () => {
  it("sem login: 401 e nada escrito", async () => {
    entrarComo(["comercial"], null);
    const res = await POST(pedido(MINIMO));
    expect(res.status).toBe(401);
    expect(banco.escritas).toEqual([]);
  });

  it("quem não é da equipe: 403", async () => {
    entrarComo(["cliente"]);
    expect((await POST(pedido(MINIMO))).status).toBe(403);
    expect(banco.escritas).toEqual([]);
  });

  it("marketing cria o rascunho, com dono, slug e auditoria", async () => {
    entrarComo(["marketing"]);
    const res = await POST(pedido(MINIMO));
    expect(res.status).toBe(201);
    const corpo = await res.json();
    const [insert] = banco.escritasEm("repasses");
    expect(insert.operacao).toBe("insert");
    expect(insert.valores).toMatchObject({ situacao: "rascunho", criado_por: "u-1", preco: 36900, id: corpo.id, slug: corpo.slug });
    expect(corpo.slug).toMatch(/^renault-kwid-zen-1-0-2021-[0-9a-f]{6}$/);
    expect(banco.auditoria()[0].acao).toBe("repasse.criar");
  });

  it("a situação não entra pela criação", async () => {
    const res = await POST(pedido({ ...MINIMO, situacao: "publicado" }));
    expect(res.status).toBe(400);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("tabela que não existe: 503 com o nome da migração", async () => {
    banco.responderEscrita(() => ({ data: null, error: { message: "sem tabela", code: "PGRST205" } }));
    const res = await POST(pedido(MINIMO));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("20260924180000_repasse_fundacao.sql");
  });
});

describe("PATCH /api/repasses/[id]", () => {
  it("id que não é uuid: 404 sem ir ao banco de repasses", async () => {
    const res = await PATCH(pedido({ preco: 1 }, "PATCH"), comId("123"));
    expect(res.status).toBe(404);
    expect(banco.lidas).not.toContain("repasses");
  });

  it("carro que não existe: 404", async () => {
    banco.leituras.repasses = { data: null, error: null };
    expect((await PATCH(pedido({ preco: 1 }, "PATCH"), comId())).status).toBe(404);
  });

  it("marketing edita o rascunho: update preso ao id e à situação, com auditoria", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    const res = await PATCH(pedido({ preco: 35000 }, "PATCH"), comId());
    expect(res.status).toBe(200);
    const [update] = banco.escritasEm("repasses");
    expect(update.valores).toEqual({ preco: 35000 });
    expect(update.filtros).toEqual([
      ["id", ID],
      ["situacao", "rascunho"],
    ]);
    expect((await res.json()).repasse.preco).toBe(35000);
    expect(banco.auditoria()[0].acao).toBe("repasse.editar");
  });

  it("marketing não edita o publicado", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" }), error: null };
    expect((await PATCH(pedido({ preco: 35000 }, "PATCH"), comId())).status).toBe(403);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("o publicado não fica incompleto: 422", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-24T12:00:00Z" }), error: null };
    const res = await PATCH(pedido({ resumo: "" }, "PATCH"), comId());
    expect(res.status).toBe(422);
    expect((await res.json()).problemas).toContain("Escreva a linha do card.");
  });

  it("corrida: a situação mudou entre ler e gravar → 409", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    banco.responderEscrita((e) => (e.tabela === "repasses" ? { data: null, error: null } : { data: null, error: null }));
    expect((await PATCH(pedido({ preco: 35000 }, "PATCH"), comId())).status).toBe(409);
    expect(banco.auditoria()).toEqual([]);
  });

  it("a galeria grava as fotos e o url_imagem fica de fora", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    const web = ["a", "b", "c", "d"].map((l) => fotoDeTeste(l));
    const zap = ["a", "b", "c", "d"].map((l) => fotoDeTeste(l, "zap"));
    const res = await PATCH(pedido({ web_full_images: web, whatsapp_images: zap, url_imagem: zap[0] }, "PATCH"), comId());
    expect(res.status).toBe(200);
    expect(banco.escritasEm("repasses")[0].valores).toEqual({ web_full_images: web, whatsapp_images: zap });
  });

  it("corpo sem mudança: 200 sem escrever", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    expect((await PATCH(pedido({}, "PATCH"), comId())).status).toBe(200);
    expect(banco.escritas).toEqual([]);
  });
});
