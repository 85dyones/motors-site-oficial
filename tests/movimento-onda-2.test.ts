// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { PainelReputacao } from "../src/lib/avaliacoesGoogle";
import AoAparecer from "../src/components/modernist/AoAparecer";
import TresEmDez from "../src/components/modernist/TresEmDez";
import TextoQueAcende from "../src/components/modernist/TextoQueAcende";
import { ler, lerCodigo } from "./fonte";

/**
 * Onda 2 do plano de movimento (10/10/2026): o carimbo do laudo, o "3 em 10"
 * da home, a frase de fechamento que acende, a régua de posição da galeria,
 * as estrelas da nota no Google e a régua dos passos nos funis.
 *
 * As travas são as da Onda 1 (`movimento-com-funcao.test.ts`): todo movimento
 * mora num bloco que o desliga com menos movimento, só mexe em `transform` e
 * opacidade, e não muda o texto da página. Mais uma, nova: o que fica abaixo
 * da dobra sai do servidor pronto, e só volta ao quadro zero no cliente se
 * estiver fora da tela (`AoAparecer`).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const css = ler("src/app/modernist.css");
// Só a seção da Onda 2: o Piloto e a onda cinética vêm depois, com testes próprios.
const onda2 = css.slice(
  css.indexOf("/* — movimento com função, Onda 2"),
  css.indexOf("/* — movimento com função, Piloto"),
);

/** O conteúdo entre as chaves do primeiro bloco que começa em `abertura`. */
function bloco(texto: string, abertura: string): string {
  const inicio = texto.indexOf(abertura);
  if (inicio < 0) return "";
  const chave = texto.indexOf("{", inicio);
  let nivel = 0;
  for (let i = chave; i < texto.length; i++) {
    if (texto[i] === "{") nivel++;
    if (texto[i] === "}" && --nivel === 0) return texto.slice(chave + 1, i);
  }
  return "";
}

/** Todos os blocos `@media (prefers-reduced-motion: no-preference)` da onda. */
function liberados(texto: string): string {
  const partes: string[] = [];
  let resto = texto;
  const abertura = "@media (prefers-reduced-motion: no-preference)";
  while (resto.includes(abertura)) {
    const corpo = bloco(resto, abertura);
    partes.push(corpo);
    resto = resto.slice(resto.indexOf(abertura) + abertura.length + corpo.length);
  }
  return partes.join("\n");
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    const raiz = root;
    await act(async () => raiz.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

describe("AoAparecer: pronto no servidor, armado fora da tela, toca ao aparecer", () => {
  type Retorno = (entradas: { intersectionRatio: number }[]) => void;
  let avisar: Retorno = () => {};
  let desligou = false;

  function simular(reduzido = false) {
    desligou = false;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: Retorno) {
          avisar = cb;
        }
        observe() {}
        disconnect() {
          desligou = true;
        }
      },
    );
    window.matchMedia = ((q: string) => ({ matches: reduzido, media: q })) as unknown as typeof window.matchMedia;
  }

  async function montar() {
    container = document.createElement("div");
    document.body.appendChild(container);
    const raiz = createRoot(container);
    root = raiz;
    await act(async () => raiz.render(createElement(AoAparecer, null, "conteúdo")));
    return container.firstElementChild as HTMLElement;
  }

  it("o servidor manda o bloco sem estado: o desenho final", () => {
    expect(renderToStaticMarkup(createElement(AoAparecer, null, "x"))).toBe("<div>x</div>");
    // Dentro de um título, `span` (div em h1 não é HTML válido).
    expect(renderToStaticMarkup(createElement(AoAparecer, { como: "span" } as Parameters<typeof AoAparecer>[0], "x"))).toBe("<span>x</span>");
  });

  it("fora da tela, arma; quando metade aparece, toca", async () => {
    simular();
    const el = await montar();
    await act(async () => avisar([{ intersectionRatio: 0 }]));
    expect(el.getAttribute("data-aparece")).toBe("armado");
    await act(async () => avisar([{ intersectionRatio: 0.6 }]));
    expect(el.getAttribute("data-aparece")).toBe("rodando");
  });

  it("saiu inteiro da tela e voltou: rearma e toca de novo, quantas vezes for (pedido do dono, 10/10)", async () => {
    simular();
    const el = await montar();
    await act(async () => avisar([{ intersectionRatio: 0 }]));
    await act(async () => avisar([{ intersectionRatio: 0.6 }]));
    // Meio fora não rearma: só sair INTEIRO. A folga evita tocar sem parar
    // na beirada da tela.
    await act(async () => avisar([{ intersectionRatio: 0.2 }]));
    expect(el.getAttribute("data-aparece")).toBe("rodando");
    for (let volta = 0; volta < 2; volta++) {
      await act(async () => avisar([{ intersectionRatio: 0 }]));
      expect(el.getAttribute("data-aparece")).toBe("armado");
      await act(async () => avisar([{ intersectionRatio: 0.6 }]));
      expect(el.getAttribute("data-aparece")).toBe("rodando");
    }
    expect(desligou).toBe(false);
  });

  it("já na tela quando a página carrega, fica como está; ao sair e voltar, toca", async () => {
    simular();
    const el = await montar();
    await act(async () => avisar([{ intersectionRatio: 0.3 }]));
    expect(el.hasAttribute("data-aparece")).toBe(false);
    await act(async () => avisar([{ intersectionRatio: 0 }]));
    expect(el.getAttribute("data-aparece")).toBe("armado");
    await act(async () => avisar([{ intersectionRatio: 0.6 }]));
    expect(el.getAttribute("data-aparece")).toBe("rodando");
  });

  it("rearmar volta as animações CSS de dentro ao zero e para; tocar as solta. Rolagem e transição ficam de fora", async () => {
    simular();
    const el = await montar();
    const registro: string[] = [];
    const animacao = (nome: string, extra: object) => ({
      ...extra,
      pause: () => registro.push(`${nome}:pause`),
      play: () => registro.push(`${nome}:play`),
      set currentTime(t: number) {
        registro.push(`${nome}:zero=${t}`);
      },
    });
    (el as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [
      animacao("entrada", { animationName: "mt-cinetico-sobe", timeline: document.timeline }),
      animacao("rolagem", { animationName: "mt-acende-palavra", timeline: {} }),
      animacao("transicao", { transitionProperty: "transform", timeline: document.timeline }),
    ];
    await act(async () => avisar([{ intersectionRatio: 0 }]));
    expect(registro).toEqual(["entrada:pause", "entrada:zero=0"]);
    registro.length = 0;
    await act(async () => avisar([{ intersectionRatio: 0.6 }]));
    expect(registro).toEqual(["entrada:play"]);
  });

  it("para de observar só quando sai da página", async () => {
    simular();
    await montar();
    expect(desligou).toBe(false);
    await act(async () => root!.unmount());
    root = undefined;
    expect(desligou).toBe(true);
  });

  it("com movimento reduzido, nem observa", async () => {
    simular(true);
    avisar = () => {
      throw new Error("não devia observar");
    };
    const el = await montar();
    expect(el.hasAttribute("data-aparece")).toBe(false);
  });

  it("armado pausa tudo dentro, pseudo-elementos inclusive", () => {
    expect(onda2).toMatch(
      /\[data-aparece="armado"\] \*,\s*\[data-aparece="armado"\] \*::before,\s*\[data-aparece="armado"\] \*::after \{[^}]*animation-play-state: paused !important/,
    );
  });
});

describe("a regra da Onda 2 no CSS", () => {
  it("cada movimento só existe com movimento liberado (ou ligado ao gesto da pessoa)", () => {
    const comMovimento = liberados(onda2);
    for (const seletor of [
      "[data-aparece] .mt-carimbo {",
      "[data-aparece] .mt-tres-em-dez-sai {",
      "[data-aparece] .mt-tres-em-dez-fica::before {",
      "[data-aparece] .mt-estrelas-acendem > svg {",
      ".mt-passo-entra {",
      ".mt-acende-palavra {",
    ]) {
      expect(comMovimento, seletor).toContain(seletor);
    }
    // A frase só acende onde a rolagem dirige a animação.
    expect(bloco(onda2, "@supports (animation-timeline: view())")).toContain(".mt-acende-palavra {");
    // As réguas dos funis param de deslizar com menos movimento.
    expect(onda2).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mt-passo-regua,\s*\.mt-passo-progresso \{\s*transition: none/,
    );
  });

  it("a régua da galeria só aparece onde a rolagem a move", () => {
    expect(onda2).toMatch(/\.mt-galeria-posicao \{\s*display: none;\s*\}/);
    const comSuporte = bloco(onda2, "@supports (animation-timeline: scroll()) and (timeline-scope: none)");
    expect(comSuporte).toMatch(/\.mt-galeria-posicao \{\s*display: block/);
    expect(comSuporte).toMatch(/animation-timeline: --mt-galeria/);
  });

  it("as animações novas só mexem em transform e opacidade", () => {
    const nomes = [...onda2.matchAll(/@keyframes ([a-z-]+) \{/g)].map((m) => m[1]);
    expect(nomes.length).toBeGreaterThanOrEqual(9);
    for (const nome of nomes) {
      const propriedades = [...bloco(onda2, `@keyframes ${nome} {`).matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of propriedades) expect(["transform", "opacity"], `${nome}: ${p}`).toContain(p);
    }
  });

  it("o painel do funil não segura nada depois de entrar (sem fill-mode)", () => {
    expect(onda2).toMatch(/\.mt-passo-entra \{\s*animation: mt-passo-entra 0\.28s cubic-bezier\([^)]*\);\s*\}/);
  });
});

describe("06 · o carimbo do laudo", () => {
  it("o selo continua sendo o h3 do laudo, com o mesmo texto, dentro de AoAparecer", async () => {
    const { default: LaudoAprovado } = await import("../src/components/ficha/LaudoAprovado");
    const html = renderToStaticMarkup(createElement(LaudoAprovado, { laudo: "Perícia aprovada." }));
    const h3 = html.match(/<div><h3 class="([^"]*)">([\s\S]*?)<\/h3><\/div>/);
    expect(h3?.[1]).toContain("mt-carimbo");
    expect(h3?.[2].replace(/<[^>]+>/g, "")).toBe("LAUDO TÉCNICO APROVADO");
  });
});

describe("07 · três em dez", () => {
  it("dez casas: três ficam, nas posições 2, 5 e 9; sete saem, cada grupo com a sua ordem", () => {
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(createElement(TresEmDez));
    const casas = [...div.querySelectorAll<HTMLElement>(".mt-tres-em-dez > span")];
    expect(casas).toHaveLength(10);
    expect(div.querySelector(".mt-tres-em-dez")!.getAttribute("aria-hidden")).toBe("true");
    const ficam = casas.map((c, i) => (c.className === "mt-tres-em-dez-fica" ? i + 1 : 0)).filter(Boolean);
    expect(ficam).toEqual([2, 5, 9]);
    expect(casas.filter((c) => c.className === "mt-tres-em-dez-sai").map((c) => c.style.getPropertyValue("--mt-casa"))).toEqual(
      ["0", "1", "2", "3", "4", "5", "6"],
    );
  });

  it("mora ao lado do \"3 EM 10\" da Avaliação Express, na home", () => {
    const home = lerCodigo("src/app/page.tsx");
    const bloco = home.slice(home.indexOf(">3 EM 10<"), home.indexOf("AVALIAR MEU CARRO"));
    expect(bloco).toContain("<TresEmDez");
  });
});

describe("08 · a frase que acende", () => {
  it("o texto da página é a frase inteira; cada palavra leva o seu índice", () => {
    const frase = "Estoque selecionado a dedo para quem não aceita qualquer escolha.";
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(createElement(TextoQueAcende, { texto: frase }));
    expect(div.textContent).toBe(frase);
    const palavras = [...div.querySelectorAll<HTMLElement>(".mt-acende-palavra")];
    expect(palavras).toHaveLength(10);
    expect(palavras.map((p) => p.style.getPropertyValue("--mt-palavra"))).toEqual(palavras.map((_, i) => String(i)));
  });

  it("nas faixas vermelhas da home e do /sobre", () => {
    expect(lerCodigo("src/app/page.tsx")).toContain(
      '<TextoQueAcende texto="Estoque selecionado a dedo para quem não aceita qualquer escolha." />',
    );
    expect(lerCodigo("src/components/SobreClientWrapper.tsx")).toContain("<TextoQueAcende texto={aboutSettings.ctaTitle} />");
  });
});

describe("09 · a régua de posição da galeria", () => {
  it("a moldura e o carrossel levam a linha do tempo; a marca tem o tamanho de uma foto em N", () => {
    const pdp = lerCodigo("src/components/PDPClientWrapper.tsx");
    expect(pdp).toContain('className="mt-galeria-moldura relative');
    expect(pdp).toMatch(/className="peer flex w-full h-full overflow-x-auto mt-galeria-trilho/);
    expect(pdp).toMatch(
      /\{displayImages\.length > 1 && \(\s*<div\s+aria-hidden="true"\s+className="mt-galeria-posicao[^"]*"\s+style=\{\{ "--mt-galeria-fotos": displayImages\.length \}/,
    );
  });
});

describe("10 · as estrelas da nota no Google", () => {
  it("só as estrelas do cabeçalho acendem; as de cada avaliação ficam paradas", async () => {
    const { default: GoogleReviewsFeed } = await import("../src/components/GoogleReviewsFeed");
    const avaliacao = (id: string) => ({
      id,
      autorNome: `Cliente ${id}`,
      autorFotoUrl: null,
      autorUrl: null,
      nota: 5,
      comentario: `Comentário ${id}`,
      publicadaEm: new Date().toISOString(),
      respostaTexto: null,
    });
    const painel = {
      reputacao: { notaMedia: 4.8, totalAvaliacoes: 175, urlPerfil: null },
      avaliacoes: [avaliacao("a"), avaliacao("b")],
    } as unknown as PainelReputacao;
    const div = document.createElement("div");
    div.innerHTML = renderToStaticMarkup(createElement(GoogleReviewsFeed, { painel }));
    const acendem = div.querySelectorAll(".mt-estrelas-acendem");
    expect(acendem).toHaveLength(1);
    expect([...acendem[0].querySelectorAll("svg")].map((s) => s.style.getPropertyValue("--mt-estrela"))).toEqual(["0", "1", "2", "3", "4"]);
    // A nota em número continua lá, parada.
    expect(div.textContent).toContain("4,8");
  });
});

describe("11 · os funis", () => {
  it("avaliação: três colunas iguais e a régua do passo ativo desliza um terço por passo", () => {
    const funil = lerCodigo("src/components/AutoAvaliacao.tsx");
    expect(funil).toContain('className="relative mt-9 grid grid-cols-3 border-t-2 border-mt-regua lg:mt-10"');
    expect(funil).toMatch(/className="mt-passo-regua [^"]*w-1\/3[^"]*"\s+style=\{\{ transform: `translateX\(\$\{\(step - 1\) \* 100\}%\)` \}\}/);
  });

  it("avaliação: o painel do passo só entra animado depois de um clique", () => {
    const funil = lerCodigo("src/components/AutoAvaliacao.tsx");
    expect(funil).toContain('useState<"frente" | "tras" | null>(null)');
    expect(funil).toContain('const painelDoPasso = entrada ? "mt-passo-entra" : undefined;');
    expect(funil.match(/<div className=\{painelDoPasso\} data-entrada=\{entrada \?\? undefined\}>/g)).toHaveLength(3);
  });

  it("carro perfeito: a régua anda com scaleX e cada pergunta entra de lado", () => {
    const quiz = lerCodigo("src/components/CarMatch.tsx");
    const regua = quiz.slice(quiz.indexOf("function ReguaProgresso("), quiz.indexOf("export default function CarMatch("));
    expect(regua).toContain("style={{ transform: `scaleX(${percentual / 100})` }}");
    expect(regua).not.toContain("transition-[width]");
    expect(quiz.match(/className="mt-passo-entra flex flex-1 flex-col"/g)).toHaveLength(2);
  });
});
