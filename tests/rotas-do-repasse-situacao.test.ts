import { describe, it, expect, vi, beforeEach } from "vitest";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";

let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));

const transicao = (await import("../src/app/api/repasses/[id]/transicao/route")).POST;
const avisar = (await import("../src/app/api/repasses/[id]/avisos/route")).POST;
const inscritos = await import("../src/app/api/repasse-inscritos/[id]/route");

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const INSCRITO = "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const ISO = "2026-09-24T12:00:00Z";
const pedido = (corpo: unknown, method = "POST") =>
  new Request("http://teste/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const comId = (id = ID) => ({ params: Promise.resolve({ id }) });

const LINHA_DO_LOJISTA = {
  id: INSCRITO,
  trilha: "lojista",
  nome: "Auto Bom Ltda",
  whatsapp: "41999990000",
  faixa: null,
  carrocerias: [],
  cnpj: "12345678000190",
  loja_cidade: "Auto Bom, Curitiba",
  cnpj_conferido_em: null,
  created_at: ISO,
};

function entrarComo(papeis: string[]) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis);
}
beforeEach(() => entrarComo(["comercial"]));

describe("POST /api/repasses/[id]/transicao", () => {
  it("comercial publica só para lojistas: grava quem validou, preso à situação lida, com auditoria", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "em_validacao" }), error: null };
    const res = await transicao(pedido({ ato: "publicar_lojistas" }), comId());
    expect(res.status).toBe(200);
    const [update] = banco.escritasEm("repasses");
    expect(update.valores).toMatchObject({ situacao: "publicado", validado_por: "u-1", aberto_ao_publico_em: null });
    expect(update.filtros).toEqual([
      ["id", ID],
      ["situacao", "em_validacao"],
    ]);
    expect((await res.json()).repasse.situacao).toBe("publicado");
    expect(banco.auditoria()[0]).toMatchObject({ acao: "repasse.publicar_lojistas" });
  });

  it("marketing não publica: 403 e nada escrito", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "em_validacao" }), error: null };
    expect((await transicao(pedido({ ato: "publicar_todos" }), comId())).status).toBe(403);
    expect(banco.escritasEm("repasses")).toEqual([]);
  });

  it("ato desconhecido: 400", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    expect((await transicao(pedido({ ato: "publicar" }), comId())).status).toBe(400);
  });

  it("incompleto: 422 com a lista do que falta", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ resumo: null }), error: null };
    const res = await transicao(pedido({ ato: "enviar" }), comId());
    expect(res.status).toBe(422);
    expect((await res.json()).problemas).toContain("Escreva a linha do card.");
  });

  it("corrida: 409 e nenhuma auditoria", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "em_validacao" }), error: null };
    banco.responderEscrita(() => ({ data: null, error: null }));
    expect((await transicao(pedido({ ato: "publicar_lojistas" }), comId())).status).toBe(409);
    expect(banco.auditoria()).toEqual([]);
  });
});

describe("POST /api/repasses/[id]/avisos", () => {
  const PUBLICADO = linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: ISO });

  it("comercial marca o aviso: upsert idempotente, auditoria sem nome nem WhatsApp", async () => {
    banco.leituras.repasses = { data: PUBLICADO, error: null };
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    const res = await avisar(pedido({ inscritoId: INSCRITO }), comId());
    expect(res.status).toBe(200);
    const [upsert] = banco.escritasEm("repasse_avisos");
    expect(upsert.operacao).toBe("upsert");
    expect(upsert.valores).toEqual({ repasse_id: ID, inscrito_id: INSCRITO, avisado_por: "u-1" });
    expect(upsert.opcoes).toMatchObject({ onConflict: "repasse_id,inscrito_id", ignoreDuplicates: true });
    const { detalhe } = banco.auditoria()[0];
    expect(detalhe).not.toContain("Auto Bom");
    expect(detalhe).not.toContain("41999990000");
  });

  it("marketing: 403", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: PUBLICADO, error: null };
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    expect((await avisar(pedido({ inscritoId: INSCRITO }), comId())).status).toBe(403);
    expect(banco.escritasEm("repasse_avisos")).toEqual([]);
  });

  it("carro em rascunho: 409", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    expect((await avisar(pedido({ inscritoId: INSCRITO }), comId())).status).toBe(409);
  });

  it("inscrito que saiu da lista: 404", async () => {
    banco.leituras.repasses = { data: PUBLICADO, error: null };
    banco.leituras.repasse_inscritos = { data: null, error: null };
    expect((await avisar(pedido({ inscritoId: INSCRITO }), comId())).status).toBe(404);
  });
});

describe("/api/repasse-inscritos/[id]", () => {
  it("comercial confere o CNPJ do lojista", async () => {
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    const res = await inscritos.PATCH(pedido({ cnpj_conferido: true }, "PATCH"), comId(INSCRITO));
    expect(res.status).toBe(200);
    expect(banco.escritasEm("repasse_inscritos")[0].valores).toMatchObject({ cnpj_conferido_por: "u-1" });
  });

  it("consumidor não tem CNPJ: 409", async () => {
    banco.leituras.repasse_inscritos = { data: { ...LINHA_DO_LOJISTA, trilha: "consumidor", cnpj: null, faixa: "30-50" }, error: null };
    expect((await inscritos.PATCH(pedido({ cnpj_conferido: true }, "PATCH"), comId(INSCRITO))).status).toBe(409);
  });

  it("inscrito saiu da lista no meio do PATCH: 404 e nenhuma auditoria", async () => {
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    banco.responderEscrita(() => ({ data: null, error: null }));
    const res = await inscritos.PATCH(pedido({ cnpj_conferido: true }, "PATCH"), comId(INSCRITO));
    expect(res.status).toBe(404);
    expect(banco.auditoria()).toEqual([]);
  });

  it("marketing não mexe na lista", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasse_inscritos = { data: LINHA_DO_LOJISTA, error: null };
    expect((await inscritos.PATCH(pedido({ cnpj_conferido: true }, "PATCH"), comId(INSCRITO))).status).toBe(403);
    expect((await inscritos.DELETE(pedido(null, "DELETE"), comId(INSCRITO))).status).toBe(403);
    expect(banco.escritasEm("repasse_inscritos")).toEqual([]);
  });

  it("tirar da lista apaga a linha, e a auditoria não guarda quem era", async () => {
    banco.responderEscrita((e) => (e.operacao === "delete" ? { data: [{ id: INSCRITO }], error: null } : { data: null, error: null }));
    const res = await inscritos.DELETE(pedido(null, "DELETE"), comId(INSCRITO));
    expect(res.status).toBe(200);
    const [apagar] = banco.escritasEm("repasse_inscritos");
    expect(apagar.operacao).toBe("delete");
    expect(apagar.filtros).toEqual([["id", INSCRITO]]);
    // `registrarAcaoSensivel` grava também autor_id e autor_nome — por isso
    // toMatchObject; o que importa é o detalhe ser só o id.
    expect(banco.auditoria()[0]).toMatchObject({ acao: "repasse.inscrito.remover", detalhe: INSCRITO });
  });

  it("apagar quem já não está: 404", async () => {
    banco.responderEscrita(() => ({ data: [], error: null }));
    expect((await inscritos.DELETE(pedido(null, "DELETE"), comId(INSCRITO))).status).toBe(404);
  });
});
