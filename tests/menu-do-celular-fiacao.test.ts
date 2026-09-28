// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CompanySettings } from "../src/types";
import { REPASSE_NA_NAVEGACAO } from "../src/lib/repasseNaNavegacao";

/**
 * O menu do celular, aberto de verdade (jsdom + clique).
 *
 * `cabecalho-renderizado.test.ts` só enxerga a barra do desktop: o menu do
 * celular nasce com `mobileMenuOpen` falso e não existe no HTML de servidor. A
 * revisão de 07/09 mediu quatro mutações nele que passavam verdes na suíte
 * cheia (ver o docblock de lá). Este arquivo as fecha, e prova o que o PR 4
 * acrescentou: o REPASSE em segundo, com o apoio "abaixo da FIPE, à vista" que
 * a prancha "Portas de entrada" desenha só no celular.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

vi.mock("../src/app/ThemeContext", () => ({
  useTheme: () => ({ theme: "motors-modernist", companySettings: EMPRESA }),
}));

let caminho = "/";
vi.mock("next/navigation", () => ({ usePathname: () => caminho }));
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  caminho = "/";
});

/** Monta o cabeçalho, clica no botão do menu e devolve o painel aberto. */
async function menuAberto(): Promise<HTMLElement> {
  const { default: Header } = await import("../src/components/Header");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Header)));

  const botao = container.querySelector('button[aria-label="Menu principal"]') as HTMLButtonElement | null;
  expect(botao, "o botão do menu do celular").not.toBeNull();
  await act(async () => botao!.click());

  // O painel aberto é o único lugar com o link PAINEL; os itens moram nele.
  const painel = [...container.querySelectorAll("a")].find((a) => a.textContent === "PAINEL");
  expect(painel, "o menu do celular abriu").toBeDefined();
  return painel!.closest(".absolute") as HTMLElement;
}

/** Os itens do menu do celular, sem o PAINEL. */
const itens = (menu: HTMLElement) =>
  [...menu.querySelectorAll("a")].filter((a) => a.getAttribute("href") !== "/configuracoes");

describe("o menu do celular, aberto", () => {
  it("os sete destinos, na ordem, com o REPASSE em segundo", async () => {
    // Pega também duas das mutações de 07/09: filtrar `/guias` fora do map do
    // celular e trocar a lista por `[]`.
    const menu = await menuAberto();
    expect(itens(menu).map((a) => a.getAttribute("href"))).toEqual([
      "/estoque",
      "/repasse",
      "/carro-perfeito",
      "/avaliacao",
      "/guias",
      "/sobre",
      "/contato",
    ]);
  });

  it("o REPASSE leva o apoio da prancha, e só ele", async () => {
    const menu = await menuAberto();
    const repasse = itens(menu).find((a) => a.getAttribute("href") === "/repasse");
    expect(repasse, "o item do repasse").toBeDefined();
    // `:not(.sr-only)` exclui o separador da pausa para o leitor de tela
    // (fix de 25/09, revisão): esta asserção é sobre os DOIS textos visíveis,
    // não sobre o nome acessível do link — esse é o teste logo abaixo.
    expect([...repasse!.querySelectorAll("span:not(.sr-only)")].map((s) => s.textContent)).toEqual([
      REPASSE_NA_NAVEGACAO.menu,
      REPASSE_NA_NAVEGACAO.apoioNoCelular,
    ]);
    for (const outro of itens(menu).filter((a) => a !== repasse)) {
      expect(outro.querySelectorAll("span"), outro.getAttribute("href") ?? "").toHaveLength(1);
    }
  });

  it("o apoio do REPASSE tem uma pausa para o leitor de tela, sem aria-label", async () => {
    // Risco (3) da revisão de 25/09: os dois `<span>` visíveis são irmãos
    // adjacentes sem nó de texto entre eles, e o nome acessível do link virava
    // a concatenação bruta "REPASSEabaixo da FIPE, à vista", sem pausa. Um
    // separador `sr-only` entre os dois resolve sem `aria-label` — que
    // sobrescreveria o texto visível para quem usa controle por voz.
    const menu = await menuAberto();
    const repasse = itens(menu).find((a) => a.getAttribute("href") === "/repasse")!;
    expect(repasse.textContent).toBe(`${REPASSE_NA_NAVEGACAO.menu}, ${REPASSE_NA_NAVEGACAO.apoioNoCelular}`);
    expect(repasse.getAttribute("aria-label")).toBeNull();
  });

  it("a barra do desktop não leva o apoio", async () => {
    await menuAberto();
    const naBarra = container.querySelector('nav a[href="/repasse"]');
    expect(naBarra, "o REPASSE na barra").not.toBeNull();
    expect(naBarra!.textContent).toBe(REPASSE_NA_NAVEGACAO.menu);
  });

  it("o item da página atual é marcado no celular, para o leitor de tela e para o olho", async () => {
    // As outras duas mutações de 07/09: apagar o `aria-current` do map do
    // celular e trocar as classes de ativo e inativo entre si.
    caminho = "/repasse/renault-kwid-zen-1-0-2021-3f9a1c";
    const menu = await menuAberto();
    const ativo = itens(menu).find((a) => a.getAttribute("href") === "/repasse")!;
    const inativo = itens(menu).find((a) => a.getAttribute("href") === "/estoque")!;

    expect(ativo.getAttribute("aria-current")).toBe("page");
    expect(inativo.getAttribute("aria-current")).toBeNull();
    expect(itens(menu).filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(ativo.className).toContain("text-mt-accent");
    expect(inativo.className).toContain("text-mt-inverso-suave");
  });
});
