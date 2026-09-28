import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";

/**
 * O lead do exame no pátio aparece no editor do carro (spec §4.4). O plano
 * do PR 2 empurrou isto para o PR 3, junto com o formulário que cria o lead.
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
// O editor tem teste próprio (`editor-do-repasse`); aqui o assunto é o bloco novo.
vi.mock("../src/components/admin/repasse/EditorDeRepasse", () => ({ default: () => null }));

const RepassePage = (await import("../src/app/admin/repasse/[id]/page")).default;
const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const PEDIDO =
  "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico.";

beforeEach(() => {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, ["marketing"]);
  banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z" }), error: null };
});

const pagina = async () =>
  renderToStaticMarkup(await RepassePage({ params: Promise.resolve({ id: ID }) })).replace(/\s+/g, " ");

describe("os pedidos de exame no editor do carro", () => {
  it("o pedido aparece, lido pelo carro", async () => {
    banco.leituras.leads = {
      data: [{ id: "l-1", nome: "Ana Souza", telefone: "5541997372165", interesse: PEDIDO, created_at: "2026-09-24T15:00:00Z" }],
      error: null,
    };
    const html = await pagina();
    expect(html).toContain("Pedidos de exame no pátio");
    expect(html).toContain("Ana Souza");
    expect(html).toContain("Sáb 26/09, tarde");
    expect(banco.consultas.find((c) => c.tabela === "leads")?.filtros).toEqual([
      ["repasse_id", ID],
      ["canal", "repasse-exame"],
    ]);
  });

  // Desde 28/09 o contato pelo WhatsApp com o carro no ar também grava
  // `leads.repasse_id`. Sem o filtro do canal, cada "quero este repasse"
  // apareceria aqui como pedido de horário no pátio. O dublê devolve a linha
  // que lhe dão, com ou sem filtro: quem prova é o filtro da consulta.
  it("só o canal do exame: o contato pelo WhatsApp não vira pedido de exame", async () => {
    banco.leituras.leads = { data: [], error: null };
    await pagina();
    const filtros = banco.consultas.find((c) => c.tabela === "leads")?.filtros ?? [];
    expect(filtros).toContainEqual(["canal", "repasse-exame"]);
    expect(filtros).not.toContainEqual(["canal", "repasse-whatsapp"]);
  });

  it("sem pedido, diz que não há", async () => {
    banco.leituras.leads = { data: [], error: null };
    expect(await pagina()).toContain("Nenhum pedido de exame para este carro ainda.");
  });

  it("linha sem nome não vira pedido", async () => {
    banco.leituras.leads = { data: [{ id: "l-2", nome: "", created_at: "2026-09-24T15:00:00Z" }], error: null };
    expect(await pagina()).toContain("Nenhum pedido de exame para este carro ainda.");
  });
});
