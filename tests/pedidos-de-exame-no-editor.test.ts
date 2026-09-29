import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";

/**
 * Os pedidos de exame no pátio (spec §4.4) e os contatos pelo WhatsApp NÃO
 * moram no editor. Até 28/09 o editor os mostrava abaixo do formulário; desde
 * a visão do carro, eles aparecem lá, com o desfecho de cada lead
 * (`visao-do-repasse`, `leads-do-carro-no-painel`). Decisão do dono em 29/09:
 * o editor fica só com o que se edita, e volta para a visão por "VER O CARRO".
 */
let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
// O editor tem teste próprio (`editor-do-repasse`); aqui o assunto é o que a
// PÁGINA põe em volta dele.
vi.mock("../src/components/admin/repasse/EditorDeRepasse", () => ({ default: () => null }));

const RepassePage = (await import("../src/app/admin/repasse/[id]/editar/page")).default;
const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const PEDIDO =
  "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.";

beforeEach(() => {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, ["comercial"]);
  banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z" }), error: null };
  banco.leituras.leads = {
    data: [
      { id: "l-1", nome: "Ana Souza", telefone: "5541997372165", interesse: PEDIDO, created_at: "2026-09-24T15:00:00Z", canal: "repasse-exame" },
      { id: "w-1", nome: "Bruno Zap", telefone: "5541997372165", interesse: null, created_at: "2026-09-24T15:00:00Z", canal: "repasse-whatsapp" },
    ],
    error: null,
  };
});

const pagina = async () =>
  renderToStaticMarkup(await RepassePage({ params: Promise.resolve({ id: ID }) })).replace(/\s+/g, " ");

describe("o editor não tem lista de leads", () => {
  it("nem os pedidos de exame, nem os contatos pelo WhatsApp", async () => {
    const html = await pagina();
    expect(html).not.toContain("Pedidos de exame no pátio");
    expect(html).not.toContain("Contatos pelo WhatsApp");
    expect(html).not.toContain("Ana Souza");
    expect(html).not.toContain("Bruno Zap");
    expect(html).not.toContain("Sáb 26/09, tarde");
  });

  it("e nem lê os leads ou o funil: o que não aparece não viaja", async () => {
    await pagina();
    expect(banco.lidas).not.toContain("leads");
    expect(banco.lidas).not.toContain("funil_etapas");
    expect(banco.lidas).not.toContain("funil_motivos");
  });
});
