import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import { NOME_DA_SECAO } from "../src/lib/guias";

/**
 * O cabeçalho, renderizado de verdade.
 *
 * Irmão de `rodape-renderizado.test.ts`, e nasceu do mesmo defeito — desta vez
 * invertido. Lá o teste lia a FONTE e não o valor; aqui as travas liam o DADO
 * (`MENU_DO_CABECALHO`) e nunca o USO. A revisão de 07/09 provou o buraco com
 * uma linha:
 *
 *     const NAV = MENU_DO_CABECALHO.filter((i) => i.href !== "/guias");
 *
 * Isso apaga `/guias` do cabeçalho no desktop e no mobile, e a suíte inteira
 * (2216 testes) ficava VERDE — porque nada ligava a lista ao componente. Pior
 * num repositório onde o `main` anda durante o PR: uma resolução de conflito em
 * `Header.tsx` que fique com o array inline de cinco itens apaga a entrega e
 * passa em todo o CI.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo NÃO prova
 * ---------------------------------------------------------------------------
 * O menu mobile só existe depois do clique (`mobileMenuOpen`), então o HTML de
 * servidor traz apenas a barra do desktop. Uma mutação que filtrasse SÓ o
 * `NAV.map` do mobile escaparia daqui. Fica dito em vez de sugerido: a trava
 * cobre a barra, e a barra é onde a lista chega primeiro.
 *
 * E o rótulo é comparado com `NOME_DA_SECAO.toUpperCase()`, o que prova que o
 * texto servido é o certo — não que ele foi LIDO da constante. Escrever
 * `"GUIAS MOTORS"` à mão passa verde hoje; o que fica coberto é o dia em que a
 * constante mudar e o literal ficar para trás, que é o cenário do PR #55. A
 * mensagem do commit anterior afirmou mais do que isso, e estava errada.
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

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// Mesma razão do rodapé: telemetria só roda no clique, e o cabeçalho não é o
// lugar de testá-la.
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));

async function cabecalho(): Promise<string> {
  const { default: Header } = await import("../src/components/Header");
  return renderToStaticMarkup(createElement(Header, {}));
}

/** Só os destinos internos do menu, na ordem em que o HTML os serve. */
async function menuServido(): Promise<string[]> {
  const html = await cabecalho();
  const nav = html.match(/<nav[\s\S]*?<\/nav>/);
  expect(nav, "o cabeçalho precisa renderizar um <nav>").not.toBeNull();
  return [...nav![0].matchAll(/<a[^>]*href="([^"]*)"/g)].map((m) => m[1]);
}

describe("o menu chega ao HTML servido", () => {
  it("os seis destinos, na ordem", async () => {
    expect(await menuServido()).toEqual([
      "/estoque",
      "/carro-perfeito",
      "/avaliacao",
      "/guias",
      "/sobre",
      "/contato",
    ]);
  });

  it("o link dos guias leva o nome da seção", async () => {
    const html = await cabecalho();
    const link = html.match(/<a[^>]*href="\/guias"[^>]*>([\s\S]*?)<\/a>/);

    expect(link, "o cabeçalho precisa linkar /guias").not.toBeNull();
    expect(link![1].replace(/<[^>]+>/g, "").trim()).toBe(NOME_DA_SECAO.toUpperCase());
  });

  it("o CONTATO só aparece a partir de 2xl, e não do degrau desktop", async () => {
    // A troca de 07/09: com seis itens a barra ficava NEGATIVA entre 1281 e
    // 1289px e o telefone partia em duas linhas. O `CONTATO` é o item que o
    // design já elegeu como descartável — o destino dele está no rodapé e no
    // botão de WhatsApp ao lado. Decisão do dono.
    //
    // Este teste afirma a CLASSE SERVIDA, que é o que decide o comportamento.
    // Que a classe vira regra de CSS é outra pergunta, e ela foi respondida
    // pelo build: `.\32 xl\:block{display:block}` dentro de
    // `@media (min-width:96rem)`. Precisou de `.next` limpo para aparecer — o
    // build reusa o CSS em cache, e a primeira leitura dizia que a regra não
    // existia.
    const html = await cabecalho();
    const link = html.match(/<a[^>]*href="\/contato"[^>]*>/);

    expect(link, "o cabeçalho precisa linkar /contato").not.toBeNull();
    expect(link![0]).toContain("2xl:block");
    expect(link![0]).not.toContain("desktop:block");
  });

  it("o item ativo é marcado, e só ele", async () => {
    // `aria-current="page"` é o que diz ao leitor de tela onde a pessoa está.
    // Com `usePathname()` em "/", nenhum item do menu é a página atual.
    const html = await cabecalho();
    expect(html).not.toContain('aria-current="page"');
  });
});
