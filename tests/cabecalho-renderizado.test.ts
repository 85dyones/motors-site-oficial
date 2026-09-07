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

/**
 * O caminho da vez. Mutável de propósito.
 *
 * Enquanto era a constante `"/"`, o ramo ATIVO do componente nunca renderizava
 * — e a única asserção possível era "não existe `aria-current`", que só detecta
 * marcação a MAIS. A revisão mediu o buraco: apagar o `aria-current` dos dois
 * `NAV.map`, ou trocar as classes de ativo e inativo entre si, deixava a suíte
 * inteira verde. O cabeçalho podia perder a marcação de página atual em todo o
 * site, para quem usa leitor de tela, sem um vermelho.
 */
let caminho = "/";

vi.mock("next/navigation", () => ({ usePathname: () => caminho }));

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
    // Que a classe vira regra de CSS é outra pergunta, e quem respondeu foi o
    // `next build` com `.next` APAGADO: `.\32 xl\:block{display:block}` dentro
    // de `@media (min-width:96rem)`, e o navegador confirmando `display:none`
    // em 1535 e `display:block` em 1536.
    //
    // Sobre o build com cache a regra não aparecia. Eu escrevi que "o build
    // reusa o CSS"; a revisão mostrou que a explicação não fecha — rodando o
    // Tailwind avulso sobre o mesmo `globals.css` a regra também não saiu,
    // mesmo com o scanner tendo lido este arquivo. O comportamento está
    // provado; o mecanismo, não.
    const html = await cabecalho();
    const link = html.match(/<a[^>]*href="\/contato"[^>]*>/);

    expect(link, "o cabeçalho precisa linkar /contato").not.toBeNull();
    expect(link![0]).toContain("2xl:block");
    expect(link![0]).not.toContain("desktop:block");
  });

  it("fora do menu, nenhum item é a página atual", async () => {
    // `usePathname()` em "/" — a home não está no NAV. Esta metade só detecta
    // marcação a MAIS, e sozinha ela é teatro: era o teste inteiro até a
    // revisão de 07/09 mostrar que apagar o `aria-current` dos dois `NAV.map`
    // passava verde. A metade que guarda é a de baixo.
    caminho = "/";
    expect(await cabecalho()).not.toContain('aria-current="page"');
  });

  it("dentro do menu, o item ativo é marcado — e só ele", async () => {
    caminho = "/guias";
    const html = await cabecalho();

    // UM `aria-current` por render do cabeçalho. O menu mobile não existe no
    // HTML de servidor (`mobileMenuOpen` nasce falso), então um é o número
    // certo aqui — se ele virar dois, é porque o mobile passou a renderizar e
    // este teste precisa ser relido, não silenciado.
    const marcados = [...html.matchAll(/<a[^>]*aria-current="page"[^>]*href="([^"]*)"|<a[^>]*href="([^"]*)"[^>]*aria-current="page"/g)]
      .map((m) => m[1] ?? m[2]);

    expect(marcados).toEqual(["/guias"]);
  });

  it("o item ativo também é marcado visualmente", async () => {
    // `aria-current` serve o leitor de tela; a borda serve quem enxerga. Sem
    // esta asserção, trocar as classes de ativo e inativo entre si passava
    // verde — o menu inteiro apontaria a página errada, para todo mundo.
    caminho = "/guias";
    const html = await cabecalho();
    const ativo = html.match(/<a[^>]*href="\/guias"[^>]*>/);
    const inativo = html.match(/<a[^>]*href="\/estoque"[^>]*>/);

    expect(ativo, "o link ativo precisa existir").not.toBeNull();
    expect(inativo, "o link inativo precisa existir").not.toBeNull();
    expect(ativo![0]).toContain("border-mt-accent");
    expect(inativo![0]).toContain("border-transparent");
  });

  it("a ficha de um guia mantém a seção marcada no menu", async () => {
    // `ativo()` casa por prefixo: quem está lendo um guia continua vendo a
    // seção acesa. É o comportamento que o componente já tinha — aqui ele passa
    // a ter testemunha.
    caminho = "/guias/o-que-a-pericia-cautelar-nao-verifica";
    const html = await cabecalho();
    const link = html.match(/<a[^>]*href="\/guias"[^>]*>/);

    expect(link![0]).toContain('aria-current="page"');
  });
});
