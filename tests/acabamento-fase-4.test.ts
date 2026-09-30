import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { ler, lerCodigo } from "./fonte";

/**
 * Fase 4 da revisão de UI (30/09/2026), tarefas 4.1 a 4.6: o acabamento que
 * a nova passada da ui-ux-pro-max achou no site já redesenhado. Cada bloco
 * trava um defeito medido no navegador — alvo de toque, letra miúda,
 * contraste, rolagem sem teclado, `h1` duplicado — para ele não voltar.
 */

const css = ler("src/app/modernist.css");

describe("4.1 · o aviso de cookies no celular é uma barra no pé da tela", () => {
  const aviso = lerCodigo("src/components/CookieConsentBanner.tsx");

  it("colado à borda de baixo no celular; o cartão no canto só do md para cima", () => {
    const raiz = /<div\s+className="(mt-aviso-cookies [^"]*)"/.exec(aviso)?.[1] ?? "";
    for (const c of ["fixed", "inset-x-0", "bottom-0", "md:inset-x-auto", "md:bottom-4", "md:max-w-md", "md:flex-col"]) {
      expect(raiz.split(/\s+/)).toContain(c);
    }
    // O cartão de antes: `bottom-4 left-4 right-4` sem prefixo, no meio da tela.
    expect(raiz).not.toMatch(/(^|\s)left-4(\s|$)/);
  });

  it("no celular, o botão tem 44 px de altura e o texto é uma frase só", () => {
    expect(aviso).toMatch(/className="mt-btn mt-btn-primario mt-foco min-h-11[^"]*md:hidden"/);
    expect(aviso).toContain("Usamos cookies para medir o site e os anúncios.");
  });

  it("enquanto a barra existe, o foco não para atrás dela", () => {
    expect(css).toMatch(/html:has\(\.mt-aviso-cookies\)\s*\{\s*scroll-padding-bottom:\s*104px/);
  });
});

describe("4.2 · alvos de toque", () => {
  it("`.mt-alvo` cresce por dentro até 44 px, e só o que falta", () => {
    expect(css).toMatch(/inset-block:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\)/);
    expect(css).toMatch(/inset-inline:\s*min\(0px, calc\(\(100% - 44px\) \/ 2\)\)/);
  });

  it("vale para a migalha de todas as páginas, pela regra do CSS", () => {
    expect(css).toMatch(/nav\[aria-label="Trilha"\] a::after/);
  });

  it.each([
    ["src/components/modernist/Catalogo.tsx", "ordenação do estoque"],
    ["src/components/ficha/SecaoDaFicha.tsx", "cabeçalho das seções da ficha"],
    ["src/components/CalculadoraFinanciamento.tsx", "\"Como a simulação é feita\""],
  ])("%s usa `.mt-alvo` (%s)", (arquivo) => {
    expect(lerCodigo(arquivo)).toMatch(/className=\{?[`"]mt-foco mt-alvo /);
  });

  it("os filtros da capa têm 44 px (eram 21)", () => {
    expect(lerCodigo("src/components/modernist/BuscaRegua.tsx")).toContain("mt-campo mt-foco min-h-11");
  });

  it("links do rodapé com área de toque no celular, sem mudar o desktop", () => {
    const rodape = lerCodigo("src/components/Footer.tsx");
    expect(rodape).toContain("py-2.5 text-mt-inverso-suave no-underline hover:text-mt-inverso md:py-0");
    expect(rodape).toContain("mt-foco py-2 font-medium uppercase tracking-wider");
  });
});

describe("4.3 · nenhum texto abaixo de 11 px no site público", () => {
  // O painel, a área do investidor e o login ficam de fora: não são o site que
  // o cliente vê. `AutoAvaliacao` é o funil de `/avaliacao`, que nenhuma
  // tarefa do plano toca.
  const fora = [
    /^src\/components\/admin\//,
    /^src\/app\/admin\//,
    /^src\/components\/(marketing|investidores)\//,
    /^src\/app\/(test|investidor)\//,
    /^src\/components\/(LoginForm|RecuperarSenhaForm|DefinirSenhaForm|ConfiguracoesClientWrapper|AutoAvaliacao)\.tsx$/,
  ];

  it("nas classes do Tailwind", () => {
    const achados = execSync(
      "grep -rlE 'text-\\[(9|10|9\\.5|10\\.5)px\\]' src --include=*.tsx || true",
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => !fora.some((r) => r.test(f)));
    expect(achados).toEqual([]);
  });

  it("nas classes do sistema", () => {
    expect(css).not.toMatch(/font-size:\s*(9|10)(\.5)?px/);
  });
});

describe("4.4 · contraste", () => {
  it("no repasse, o rótulo sobre o grafite é cobre da marca, não ferrugem", () => {
    const repasse = lerCodigo("src/app/repasse/page.tsx");
    expect(repasse).toMatch(/text-mt-cobre-marca">\{HEROI_DO_REPASSE\.rotulo\}/);
  });

  it("no Profiler, \"a responder\" sai em cinza 600 (o 500 dava 2,6:1 no papel)", () => {
    expect(lerCodigo("src/components/CarMatch.tsx")).toContain('r.valor ? "text-mt-accent" : "text-mt-neutral-600"');
  });
});

describe("4.5 · o que rola de lado também rola pelo teclado", () => {
  it.each([
    "src/components/PDPClientWrapper.tsx",
    "src/components/repasse/SecoesDoRepasse.tsx",
    "src/app/repasse/[carro]/page.tsx",
  ])("%s", (arquivo) => {
    const codigo = lerCodigo(arquivo);
    const rolaveis = codigo.match(/<div[^>]*overflow-x-auto[^>]*>/g) ?? [];
    expect(rolaveis.length).toBeGreaterThan(0);
    for (const tag of rolaveis) {
      expect(tag).toContain("tabIndex={0}");
      expect(tag).toContain('role="region"');
      expect(tag).toMatch(/aria-label=/);
    }
  });
});

describe("4.6 · um h1 por página", () => {
  it("a ficha impressa, escondida no HTML da ficha, não tem h1 próprio", () => {
    expect(lerCodigo("src/components/modernist/FichaImpressa.tsx")).not.toMatch(/<h1[\s>]/);
  });
});
