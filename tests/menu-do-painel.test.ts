import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ABAS_DO_SITE, ehAbaDoSite } from "../src/lib/abasDeConfiguracao";

/**
 * O menu do painel com grupos que abrem e fecham (aprovado pelo dono em
 * 03/10/2026): Visão geral fixa no topo, só o grupo da tela atual aberto, e
 * as seis configurações do site numa entrada só.
 */

let caminho = "/admin/leads";
let aba: string | null = null;
vi.mock("next/navigation", () => ({
  usePathname: () => caminho,
  useSearchParams: () => ({ get: (k: string) => (k === "tab" ? aba : null) }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

async function menu(perfis: string[], em = "/admin/leads", comAba: string | null = null) {
  caminho = em;
  aba = comAba;
  const { default: SidebarNav } = await import("../src/components/admin/SidebarNav");
  return renderToStaticMarkup(createElement(SidebarNav, { perfis }));
}
const grupo = (html: string, id: string) => html.match(new RegExp(`<div id="grupo-${id}"[^>]*>`))?.[0] ?? "";

describe("o menu do painel", () => {
  it("Visão geral fica fora dos grupos, no topo", async () => {
    const html = await menu(["admin"]);
    expect(html.indexOf(">Visão geral<")).toBeGreaterThan(-1);
    expect(html.indexOf(">Visão geral<")).toBeLessThan(html.indexOf("<button"));
  });

  it("só o grupo da tela atual abre; os outros ficam no HTML, escondidos", async () => {
    const html = await menu(["admin"], "/admin/leads");
    expect(grupo(html, "geral")).not.toContain("hidden");
    expect(grupo(html, "estoque")).toContain("hidden");
    expect(grupo(html, "site")).toContain("hidden");
    // Escondido não é ausente: o item continua lá para quem abrir o grupo.
    expect(html).toContain('href="/admin/estoque"');
    expect(html).toMatch(/aria-expanded="true"[^>]*aria-controls="grupo-geral"/);
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-controls="grupo-estoque"/);
  });

  it("as seis configurações do site são uma entrada só, acesa em qualquer aba", async () => {
    const html = await menu(["admin"], "/admin/configuracoes", "instagram");
    expect(html).toContain("Configurações do site");
    for (const antigo of ["Destaques rápidos", "Aparência e cores", "Faixa do Instagram"]) {
      expect(html, antigo).not.toContain(antigo);
    }
    expect(html).toMatch(/aria-current="page"[^>]*>Configurações do site</);
    expect(grupo(html, "site")).not.toContain("hidden");
  });

  it("aba do Sistema acende o item do Sistema, e não a entrada do Site", async () => {
    const html = await menu(["admin"], "/admin/configuracoes", "empresa");
    expect(html).toMatch(/aria-current="page"[^>]*>Dados da concessionária</);
    expect(html).not.toMatch(/aria-current="page"[^>]*>Configurações do site</);
  });

  it("Usuários e permissões mora em Sistema e continua só de Admin", async () => {
    expect(await menu(["admin"])).toContain("Usuários e permissões");
    expect(await menu(["comercial"])).not.toContain("Usuários e permissões");
    expect(await menu(["admin"])).not.toContain("Administrativo");
  });

  it("a lista de abas do site é a mesma para o menu e para a tela", () => {
    expect(ABAS_DO_SITE.map((a) => a.id)).toEqual(["destaques", "aparencia", "sobre", "compartilhamento", "procedencia", "instagram"]);
    expect(ehAbaDoSite("aparencia")).toBe(true);
    expect(ehAbaDoSite("empresa")).toBe(false);
    expect(ehAbaDoSite(null)).toBe(false);
  });
});
