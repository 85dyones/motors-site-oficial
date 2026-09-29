// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { execSync } from "node:child_process";
import { lerCodigo } from "./fonte";

/**
 * A ficha do veículo no sistema Modernist — Fase 2 da revisão de UI de
 * 29/09/2026 (tarefas 2.2 a 2.4 do plano de ação).
 *
 * Até ali a ficha era meio a meio: galeria, preço e botões no sistema; logo
 * abaixo, a descrição, os opcionais, o laudo e a troca em caixas do tema
 * antigo (`bg-brand-card`, título vermelho com ícone), com um escudo verde, um
 * botão `green-700`, ícones que acendiam nas cores do WhatsApp e do Facebook e
 * uma tela cheia de vidro fosco. E duas listas de especificações com as mesmas
 * linhas.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ARQUIVOS_DA_FICHA = [
  "src/components/PDPClientWrapper.tsx",
  "src/components/BlocoLaudoPendente.tsx",
  "src/components/PonteDoGuiaDoLaudo.tsx",
  "src/components/ficha/SecaoDaFicha.tsx",
  "src/components/ficha/LaudoAprovado.tsx",
  "src/components/ficha/TrocaOuTestDrive.tsx",
  "src/components/ficha/CompartilharFicha.tsx",
  "src/components/ficha/GaleriaEmTelaCheia.tsx",
  "src/components/ficha/FotoDaFicha.tsx",
];

describe("nada do tema antigo na ficha", () => {
  // Classe de cor do tema antigo ou de fora da paleta, com ou sem variante
  // (`hover:`, `lg:`…) e com ou sem opacidade (`/40`).
  const COR_DE_FORA =
    /(?:^|[\s"'`])(?:[a-z0-9-]+:)*(?:bg|text|border|from|via|to|decoration|ring|divide)-(?:brand|emerald|green|zinc|red|blue|amber|pink|purple)\b/;

  it.each(ARQUIVOS_DA_FICHA)("%s", (arquivo) => {
    const codigo = lerCodigo(arquivo);
    expect(codigo).not.toMatch(COR_DE_FORA);
    // O sistema não desfoca nem arredonda.
    expect(codigo).not.toMatch(/backdrop-blur/);
    expect(codigo).not.toMatch(/(?:^|[\s"'`])rounded\b|rounded-/);
  });

  it("a raiz da ficha usa a fonte e as cores do sistema, como a home", () => {
    const codigo = lerCodigo("src/components/PDPClientWrapper.tsx");
    const raiz = codigo.slice(codigo.indexOf('id="pdp-vehicle-root"'));
    const classe = raiz.match(/className="([^"]*)"/)?.[1] ?? "";
    expect(classe).toContain("font-modernist");
    expect(classe).toContain("bg-mt-bg");
    expect(classe).toContain("text-mt-ink");
  });
});

describe("o laudo aprovado só existe dentro da guarda", () => {
  // "Histórico livre de sinistros e leilão" mora em `LaudoAprovado` desde
  // 29/09, num componente que não olha o veículo. A guarda de
  // `coerencia-da-pericia` confere que a condição existe na PDP; esta confere
  // que o componente só é montado ali, uma vez, logo depois dela.
  it("montado uma vez, na PDP, depois da condição de laudo publicado e aprovado", () => {
    const pdp = lerCodigo("src/components/PDPClientWrapper.tsx");
    const montagens = pdp.split("<LaudoAprovado").length - 1;
    expect(montagens).toBe(1);
    const guarda = pdp.indexOf('{veiculo.laudo_pericia && veiculo.pericia === "PERÍCIA APROVADA" && (');
    const montagem = pdp.indexOf("<LaudoAprovado");
    expect(guarda).toBeGreaterThan(-1);
    expect(montagem).toBeGreaterThan(guarda);
    // Nada entre a guarda e a montagem fecha o condicional.
    expect(pdp.slice(guarda, montagem)).not.toMatch(/\)\}/);
  });

  it("nenhum outro arquivo importa LaudoAprovado", () => {
    const quem = execSync("grep -rl 'ficha/LaudoAprovado' src || true", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(quem).toEqual(["src/components/PDPClientWrapper.tsx"]);
  });
});

describe("títulos das peças da ficha", () => {
  const niveis = (codigo: string) => [...codigo.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));

  it("toda seção é h2 — e é a casca que escreve o título, uma vez", () => {
    expect(niveis(lerCodigo("src/components/ficha/SecaoDaFicha.tsx"))).toEqual([2]);
  });

  it("o laudo aprovado, dentro da seção, é h3", () => {
    expect(niveis(lerCodigo("src/components/ficha/LaudoAprovado.tsx"))).toEqual([3]);
  });

  it("as outras peças não inventam título próprio", () => {
    for (const arquivo of [
      "src/components/ficha/TrocaOuTestDrive.tsx",
      "src/components/ficha/CompartilharFicha.tsx",
      "src/components/ficha/GaleriaEmTelaCheia.tsx",
      "src/components/BlocoLaudoPendente.tsx",
    ]) {
      expect(niveis(lerCodigo(arquivo)), arquivo).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Montado de verdade.
// ---------------------------------------------------------------------------

const imagens: Record<string, unknown>[] = [];
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    imagens.push(props);
    const { fill: _f, sizes: _s, priority: _p, unoptimized: _u, fetchPriority: _fp, loader: _l, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

let container: HTMLDivElement | undefined;
let root: Root | undefined;

async function montar(elemento: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  const alvo = document.createElement("div");
  document.body.appendChild(alvo);
  container = alvo;
  const raiz = createRoot(alvo);
  root = raiz;
  await act(async () => raiz.render(elemento));
  return alvo;
}

afterEach(async () => {
  imagens.length = 0;
  if (!root || !container) return;
  const raiz = root;
  await act(async () => raiz.unmount());
  container.remove();
  root = undefined;
  container = undefined;
});

describe("a seção que abre e fecha", () => {
  it("o botão fica no h2, diz se está aberto e aponta para o corpo", async () => {
    const { default: SecaoDaFicha } = await import("../src/components/ficha/SecaoDaFicha");
    const aoAlternar = vi.fn();
    const tela = await montar(
      createElement(
        SecaoDaFicha,
        { titulo: "Opcionais e acessórios", recolhivel: { aberto: false, aoAlternar, idDoCorpo: "corpo-x" } },
        createElement("p", null, "Teto solar"),
      ),
    );
    const botao = tela.querySelector("h2 > button")!;
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(botao.getAttribute("aria-controls")).toBe("corpo-x");
    expect(tela.querySelector("#corpo-x")!.hasAttribute("hidden")).toBe(true);

    await act(async () => (botao as HTMLButtonElement).click());
    expect(aoAlternar).toHaveBeenCalledTimes(1);
  });

  it("sem `recolhivel`, o título é texto e o corpo está sempre à mostra", async () => {
    const { default: SecaoDaFicha } = await import("../src/components/ficha/SecaoDaFicha");
    const tela = await montar(createElement(SecaoDaFicha, { titulo: "Laudo cautelar" }, "corpo"));
    expect(tela.querySelector("h2")!.textContent).toBe("Laudo cautelar");
    expect(tela.querySelector("button")).toBeNull();
    expect(tela.querySelector("[hidden]")).toBeNull();
  });
});

describe("as fotos da ficha não passam pelo otimizador quando são nossas", () => {
  const NOSSA = "https://zwbqmzgnagfeqinqkolp.supabase.co/storage/v1/object/public/veiculos/123/a-web.webp";
  const DO_CARRO57 = "https://s3.carro57.com.br/FC/9037/foto.jpg";

  it("a nossa vai com o loader do Storage; a do carro57, sem", async () => {
    const { default: FotoDaFicha } = await import("../src/components/ficha/FotoDaFicha");
    await montar(
      createElement("div", null, [
        createElement(FotoDaFicha, { key: "a", src: NOSSA, alt: "a", fill: true }),
        createElement(FotoDaFicha, { key: "b", src: DO_CARRO57, alt: "b", fill: true }),
      ]),
    );
    const nossa = imagens.find((p) => p.src === NOSSA)!;
    const deFora = imagens.find((p) => p.src === DO_CARRO57)!;
    expect(typeof nossa.loader).toBe("function");
    expect((nossa.loader as (a: object) => string)({ src: NOSSA, width: 640 })).toContain(
      "/storage/v1/render/image/public/",
    );
    expect(deFora.loader).toBeUndefined();
  });

  it("a galeria pede até 1600 px, a largura da versão `zap` — não o teto de 1280 do card", async () => {
    const { default: FotoDaFicha } = await import("../src/components/ficha/FotoDaFicha");
    const { LARGURA_DA_VERSAO_ZAP } = await import("../src/lib/fotosDoVeiculo");
    const { LADO_DA_VARIANTE } = await import("../src/lib/imageProcessor");
    expect(LARGURA_DA_VERSAO_ZAP).toBe(LADO_DA_VARIANTE.zap);
    const zap = NOSSA.replace("-web.webp", "-zap.jpg");
    await montar(createElement(FotoDaFicha, { src: zap, alt: "z", fill: true }));
    const carregar = imagens.find((p) => p.src === zap)!.loader as (a: object) => string;
    expect(carregar({ src: zap, width: 3840 })).toContain("width=1600&");
    expect(carregar({ src: zap, width: 828 })).toContain("width=828&");
  });

  it("a galeria, as miniaturas e a tela cheia usam FotoDaFicha — nenhum next/image direto", () => {
    expect(lerCodigo("src/components/PDPClientWrapper.tsx")).not.toMatch(/<Image\b|from "next\/image"/);
    expect(lerCodigo("src/components/ficha/GaleriaEmTelaCheia.tsx")).not.toMatch(/<Image\b|from "next\/image"/);
  });
});

describe("a tela cheia", () => {
  const FOTOS = ["https://s3.carro57.com.br/FC/9037/1.jpg", "https://s3.carro57.com.br/FC/9037/2.jpg"];

  it("é um diálogo, trava a rolagem enquanto aberta e devolve ao fechar", async () => {
    const { default: GaleriaEmTelaCheia } = await import("../src/components/ficha/GaleriaEmTelaCheia");
    const tela = await montar(
      createElement(GaleriaEmTelaCheia, {
        imagens: FOTOS,
        indice: 0,
        aoMudar: () => {},
        aoFechar: () => {},
        nome: "Jeep Renegade",
      }),
    );
    const dialogo = tela.querySelector('[role="dialog"]')!;
    expect(dialogo.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    // O foco entra no diálogo, no botão de fechar.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Fechar visualização em tela cheia");

    const raiz = root!;
    await act(async () => raiz.unmount());
    root = undefined;
    expect(document.body.style.overflow).toBe("");
  });

  it("ao fechar, o foco volta para quem abriu", async () => {
    const { default: GaleriaEmTelaCheia } = await import("../src/components/ficha/GaleriaEmTelaCheia");
    const gatilho = document.createElement("button");
    document.body.appendChild(gatilho);
    gatilho.focus();
    await montar(
      createElement(GaleriaEmTelaCheia, { imagens: FOTOS, indice: 0, aoMudar: () => {}, aoFechar: () => {}, nome: "X" }),
    );
    expect(document.activeElement).not.toBe(gatilho);
    const raiz = root!;
    await act(async () => raiz.unmount());
    root = undefined;
    expect(document.activeElement).toBe(gatilho);
    gatilho.remove();
  });

  it("o Tab dá a volta dentro do diálogo", async () => {
    const { default: GaleriaEmTelaCheia } = await import("../src/components/ficha/GaleriaEmTelaCheia");
    const tela = await montar(
      createElement(GaleriaEmTelaCheia, { imagens: FOTOS, indice: 0, aoMudar: () => {}, aoFechar: () => {}, nome: "X" }),
    );
    const botoes = [...tela.querySelectorAll("button")];
    botoes[botoes.length - 1].focus();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    });
    expect(document.activeElement).toBe(botoes[0]);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    });
    expect(document.activeElement).toBe(botoes[botoes.length - 1]);
  });

  it("Esc fecha e as setas do teclado trocam a foto, dando a volta", async () => {
    const { default: GaleriaEmTelaCheia } = await import("../src/components/ficha/GaleriaEmTelaCheia");
    const aoMudar = vi.fn();
    const aoFechar = vi.fn();
    await montar(
      createElement(GaleriaEmTelaCheia, { imagens: FOTOS, indice: 0, aoMudar, aoFechar, nome: "Jeep Renegade" }),
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(aoMudar.mock.calls).toEqual([[1], [1]]);
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe("troca e test-drive", () => {
  it("cada botão chama o seu fluxo", async () => {
    const { default: TrocaOuTestDrive } = await import("../src/components/ficha/TrocaOuTestDrive");
    const aoAvaliar = vi.fn();
    const aoAgendar = vi.fn();
    const tela = await montar(createElement(TrocaOuTestDrive, { aoAvaliar, aoAgendar }));
    const [troca, visita] = [...tela.querySelectorAll("button")];
    expect(troca.textContent).toContain("TROCA");
    expect(troca.className).toContain("mt-btn-tinta");
    expect(visita.className).toContain("mt-btn-contorno");
    await act(async () => troca.click());
    await act(async () => visita.click());
    expect(aoAvaliar).toHaveBeenCalledTimes(1);
    expect(aoAgendar).toHaveBeenCalledTimes(1);
  });
});
