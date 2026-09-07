import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import { NOME_DA_SECAO } from "../src/lib/guias";
import { MENU_DO_CABECALHO } from "../src/lib/menuDoCabecalho";

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
 * servidor traz apenas a barra do desktop. **Nada do mobile é provado aqui** —
 * e o buraco é maior do que "uma mutação que filtrasse o `NAV.map`", que era
 * como esta seção o descrevia. A revisão mediu quatro, todas VERDES na suíte
 * cheia: apagar o `aria-current` do map do mobile, trocar as classes de ativo e
 * inativo dele, filtrar `/guias` fora, e — a pior — trocar a lista por `[]`,
 * deixando o menu do celular VAZIO.
 *
 * Fechar isso exige `jsdom` + testing-library, que o `vitest.config.ts` adia
 * explicitamente ("adicionar quando chegarem"), ou forçar `mobileMenuOpen`
 * mockando o `useState` do React. Nenhum dos dois cabe num PR de menu, e por
 * isso fica ESCRITO — o que não pode é a próxima pessoa ler "a trava cobre a
 * barra" e supor que cobre o resto.
 *
 * A outra lacuna é de acoplamento, não de superfície: os rótulos são comparados
 * com `MENU_DO_CABECALHO`, e o de `/guias` com `NOME_DA_SECAO.toUpperCase()`.
 * Isso prova que o texto SERVIDO é o certo, não que ele foi LIDO da constante —
 * escrever `"GUIAS MOTORS"` à mão passa verde hoje. O que fica coberto é o dia
 * em que a constante mudar e o literal ficar para trás, que é o cenário do
 * PR #55.
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

  it("o que a barra serve como rótulo é o `rotulo` do dado, na ordem", async () => {
    // O que este teste prova, e o que NÃO prova.
    //
    // Ele compara o render com a MESMA constante que alimenta o render, então
    // é tautológico para o VALOR: trocar "ESTOQUE" por "XXXXX" no dado muda os
    // dois lados e passa verde — medido. A revisão sugeriu esta comparação
    // justamente para pegar aquilo, e ela não pega.
    //
    // O que ele pega é o acoplamento: trocar `{item.rotulo}` por uma string
    // fixa no componente derruba 2. Ou seja, guarda que a barra serve o campo
    // `rotulo`, na ordem da lista — não que os textos sejam estes.
    //
    // Travar os valores exigiria repetir os seis literais aqui, e aí renomear
    // um item legítimo ficaria vermelho sem invariante nenhuma ter mudado. O
    // `main` também não cobria rótulo de cabeçalho, então não há regressão.
    const html = await cabecalho();
    const nav = html.match(/<nav[\s\S]*?<\/nav>/)![0];
    const rotulos = [...nav.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").trim(),
    );

    expect(rotulos).toEqual(MENU_DO_CABECALHO.map((i) => i.rotulo));
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
    // Que a classe vira regra de CSS é outra pergunta, e ela está respondida:
    //
    //     @media (min-width:96rem){.\32 xl\:block{display:block}}
    //
    // no bundle do `next build`, com o navegador confirmando `display:none` em
    // 1535 e `display:block` em 1536 — e o `@tailwindcss/postcss` avulso emite
    // a mesma regra, bastando o `Header.tsx` guardar a string. O mecanismo é
    // trivial: o scanner lê este arquivo.
    //
    // Eu afirmei duas vezes o contrário aqui — primeiro que a regra não existia,
    // depois que existia por motivo desconhecido. As duas leituras negativas
    // eram artefato de BUSCA: seletor não pode começar com dígito, então a
    // classe sai escapada como `.\32 xl\:block`, e procurar por `2xl` — ou por
    // `xl:block` sem contar a contrabarra — não acha nada num arquivo que a
    // contém.
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
