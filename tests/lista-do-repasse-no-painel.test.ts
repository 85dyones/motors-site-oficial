import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";
import { abaDaUrl, abaInicial, contarPorSituacao } from "../src/lib/painelDoRepasse";

let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/repasse",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const { ConfirmProvider } = await import("../src/components/admin/ConfirmDialog");
const PaginaDaLista = (await import("../src/app/admin/repasse/page")).default;
const PaginaDosInscritos = (await import("../src/app/admin/repasse/inscritos/page")).default;
const SidebarNav = (await import("../src/components/admin/SidebarNav")).default;

const ISO = "2026-09-24T12:00:00Z";
const texto = (el: ReactElement) =>
  renderToStaticMarkup(createElement(ConfirmProvider, null, el)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function entrarComo(papeis: string[]) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis);
}
beforeEach(() => entrarComo(["comercial"]));

describe("abas", () => {
  it("quem valida começa pelo que aguarda validação, se houver", () => {
    const contagem = contarPorSituacao([{ situacao: "em_validacao" }, { situacao: "rascunho" }]);
    expect(contagem.em_validacao).toBe(1);
    expect(abaInicial(contagem, true)).toBe("em_validacao");
    expect(abaInicial(contarPorSituacao([]), true)).toBe("publicado");
    expect(abaInicial(contagem, false)).toBe("rascunho");
  });

  it("aba da URL só vale se for situação", () => {
    expect(abaDaUrl("vendido", "rascunho")).toBe("vendido");
    expect(abaDaUrl("qualquer", "rascunho")).toBe("rascunho");
    expect(abaDaUrl(undefined, "publicado")).toBe("publicado");
  });
});

describe("/admin/repasse", () => {
  const LINHAS = [
    linhaDoBancoDeTeste({ id: "a1111111-1111-4111-8111-111111111111", situacao: "em_validacao", modelo: "Kwid" }),
    linhaDoBancoDeTeste({ id: "b2222222-2222-4222-8222-222222222222", situacao: "publicado", modelo: "Argo", lojistas_desde: ISO }),
  ];

  it("comercial abre na validação, com a contagem e o link da lista", async () => {
    banco.leituras.repasses = { data: LINHAS, error: null };
    const html = texto(await PaginaDaLista({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Aguardando validação");
    expect(html).toContain("Kwid");
    expect(html).not.toContain("Argo");
    expect(html).toContain("Lista do repasse");
  });

  it("a aba da URL troca a lista", async () => {
    banco.leituras.repasses = { data: LINHAS, error: null };
    const html = texto(await PaginaDaLista({ searchParams: Promise.resolve({ aba: "publicado" }) }));
    expect(html).toContain("Argo");
    expect(html).toContain("Só para lojistas");
  });

  it("marketing não vê o link da lista de inscritos", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: LINHAS, error: null };
    expect(texto(await PaginaDaLista({ searchParams: Promise.resolve({}) }))).not.toContain("Lista do repasse");
  });

  it("antes da migração, avisa em vez de quebrar", async () => {
    banco.leituras.repasses = { data: null, error: { message: "x", code: "PGRST205" } };
    expect(texto(await PaginaDaLista({ searchParams: Promise.resolve({}) }))).toContain("20260924180000_repasse_fundacao.sql");
  });
});

describe("/admin/repasse/inscritos", () => {
  it("quem não valida volta para a lista de carros", async () => {
    entrarComo(["marketing"]);
    await expect(PaginaDosInscritos()).rejects.toThrow("NEXT_REDIRECT:/admin/repasse");
    expect(banco.lidas).not.toContain("repasse_inscritos");
  });

  it("comercial vê a lista, o CNPJ a conferir e a saída que apaga", async () => {
    banco.leituras.repasse_inscritos = {
      data: [
        { id: "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f", trilha: "lojista", nome: "Auto Bom Ltda", whatsapp: "41999990000", faixa: null, carrocerias: [], cnpj: "12345678000190", loja_cidade: "Auto Bom, Curitiba", cnpj_conferido_em: null, created_at: ISO },
        { id: "8c2f3e4d-5b6c-4d7e-9f0a-1b2c3d4e5f60", trilha: "consumidor", nome: "Ana Souza", whatsapp: "41988880000", faixa: "30-50", carrocerias: ["hatch"], cnpj: null, loja_cidade: null, cnpj_conferido_em: null, created_at: ISO },
      ],
      error: null,
    };
    const html = texto(await PaginaDosInscritos());
    expect(html).toContain("Auto Bom Ltda");
    expect(html).toContain("Marcar CNPJ conferido");
    expect(html).toContain("De R$ 30 mil a R$ 50 mil");
    expect(html).toContain("Tirar da lista");
  });
});

describe("o menu", () => {
  const menu = (perfis: string[]) => texto(createElement(SidebarNav, { perfis }));

  it("todo perfil vê os carros de repasse", () => {
    for (const perfil of ["admin", "gestor", "marketing", "comercial", "financeiro"]) {
      expect(menu([perfil]), perfil).toContain("Carros de repasse");
    }
  });

  it("só quem valida vê a lista do repasse", () => {
    expect(menu(["comercial"])).toContain("Lista do repasse");
    expect(menu(["gestor"])).toContain("Lista do repasse");
    expect(menu(["marketing"])).not.toContain("Lista do repasse");
    expect(menu(["financeiro"])).not.toContain("Lista do repasse");
  });
});
