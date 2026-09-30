import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import type { PainelReputacao } from "../src/lib/avaliacoesGoogle";

/**
 * A nota do Google e algumas avaliações, ao vivo, no `/sobre` (pedido do dono
 * em 30/09/2026). Mesma leitura da home (`getReputacaoGoogle`, cache de 24 h),
 * três avaliações, e nenhuma seção quando não há dado.
 */

const EMPRESA = { name: "Motors Store" } as CompanySettings;

const estado = vi.hoisted(() => ({ painel: null as PainelReputacao | null }));

vi.mock("../src/lib/settings", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));
vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getEstoque: async () => [],
}));
vi.mock("../src/lib/avaliacoesGoogle", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getReputacaoGoogle: async () => estado.painel,
}));
// O wrapper é client e lê o painel; aqui ele devolve só os blocos que a rota
// monta no servidor, na ordem em que o wrapper os põe.
vi.mock("../src/components/SobreClientWrapper", () => ({
  default: ({ autor, reputacao }: { autor?: ReactNode; reputacao?: ReactNode }) =>
    createElement(Fragment, null, reputacao, autor),
}));

function avaliacao(id: string, dias: number, comentario = `Comentário ${id}`) {
  return {
    id,
    autorNome: `Cliente ${id}`,
    autorFotoUrl: null,
    autorUrl: `https://www.google.com/maps/contrib/${id}`,
    nota: 5,
    comentario,
    publicadaEm: new Date(Date.now() - dias * 86_400_000).toISOString(),
    respostaTexto: null,
  };
}

async function pagina(): Promise<string> {
  const { default: SobrePage } = await import("../src/app/sobre/page");
  return renderToStaticMarkup(await SobrePage());
}

beforeEach(() => {
  estado.painel = null;
});

describe("avaliações do Google no /sobre", () => {
  it("com dado: nota, total, link para o Google e as três mais recentes com texto", async () => {
    estado.painel = {
      reputacao: { notaMedia: 4.8, totalAvaliacoes: 173, urlPerfil: "https://maps.google.com/?cid=1" },
      avaliacoes: [
        avaliacao("a", 40),
        avaliacao("b", 2),
        avaliacao("c", 10),
        avaliacao("d", 1, ""),
        avaliacao("e", 5),
      ] as PainelReputacao["avaliacoes"],
    };
    const html = await pagina();
    expect(html).toContain('id="avaliacoes"');
    expect(html).toContain("O que dizem os clientes");
    expect(html).toContain("4,8");
    expect(html).toContain("173");
    expect(html).toContain('href="https://maps.google.com/?cid=1"');
    // Três, as mais recentes com texto: b (2 dias), e (5), c (10). A "d" não
    // tem texto e a "a" é a mais antiga.
    const nomes = [...html.matchAll(/Cliente ([a-e])/g)].map((m) => m[1]);
    expect(nomes).toEqual(["b", "e", "c"]);
  });

  it("atribuição das políticas do Places API: \"Google Maps\" e o autor com link para o perfil", async () => {
    estado.painel = {
      reputacao: { notaMedia: 4.8, totalAvaliacoes: 173, urlPerfil: null },
      avaliacoes: [avaliacao("b", 2)] as PainelReputacao["avaliacoes"],
    };
    const html = await pagina();
    expect(html).toMatch(/<p[^>]*translate="no"[^>]*>Google Maps<\/p>/);
    expect(html).toMatch(/<a href="https:\/\/www\.google\.com\/maps\/contrib\/b"[^>]*rel="noopener noreferrer"[^>]*>Cliente b<\/a>/);
  });

  it("a linha de três é escolha do /sobre, não da quantidade que a API devolveu", async () => {
    const { default: GoogleReviewsFeed } = await import("../src/components/GoogleReviewsFeed");
    const painel = {
      reputacao: { notaMedia: 4.8, totalAvaliacoes: 3, urlPerfil: null },
      avaliacoes: [avaliacao("a", 1), avaliacao("b", 2), avaliacao("c", 3)] as PainelReputacao["avaliacoes"],
    };
    const padrao = renderToStaticMarkup(createElement(GoogleReviewsFeed, { painel }));
    expect(padrao).toContain("md:grid-cols-2");
    expect(padrao).not.toContain("lg:grid-cols-3");
    const doSobre = renderToStaticMarkup(createElement(GoogleReviewsFeed, { painel, grade: "linha-de-tres" }));
    expect(doSobre).toContain("lg:grid-cols-3");
  });

  it("sem dado (variáveis ausentes, API fora), nenhuma seção", async () => {
    const html = await pagina();
    expect(html).not.toContain('id="avaliacoes"');
    expect(html).not.toContain("O que dizem os clientes");
  });
});
