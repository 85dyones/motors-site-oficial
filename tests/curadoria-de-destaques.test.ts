// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import CuradoriaDeDestaques from "../src/components/admin/CuradoriaDeDestaques";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * Fiação da curadoria de destaques — no molde de
 * `tests/painel-de-guias-fiacao.test.ts`, o único precedente real deste
 * repositório para testar componente cliente de verdade.
 *
 * Não é `@testing-library/react`: a lib não é dependência do projeto (não está
 * em `package.json`) e instalá-la quebraria "nenhuma biblioteca nova". E não é
 * JSX: esbuild e `tsc` só aceitam `<Tag />` em `.tsx`, e o nome do arquivo é
 * `.ts`. `createElement` no lugar da tag, `createRoot`+`act` no lugar de
 * `render`, e consulta ao DOM cru (`textContent`, `querySelectorAll`) no
 * lugar de `screen`/`fireEvent`. As nove asserções são as mesmas; muda só
 * como se monta e se lê a tela.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({ id, marca: "Fiat", modelo: "Toro", versao: "", preco: 100000, estado: "publicado", ...over }) as unknown as LinhaDeEstoque;

const padrao = {
  bannerInicial: ["a", "b"],
  gradeInicial: [] as string[],
  tvInicial: ["a"],
  linhas: [linha("a"), linha("b")],
};

let container: HTMLDivElement;
let root: Root;

async function montar(props: Parameters<typeof CuradoriaDeDestaques>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(CuradoriaDeDestaques, props));
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/**
 * Um botão pelo texto OU pelo `aria-label` — cobre tanto "Limpar os N" (sem
 * label, só texto) quanto ▲/▼/✕ (label sem texto legível).
 */
function botao(regex: RegExp): HTMLButtonElement {
  const achado = [...container.querySelectorAll("button")].find(
    (b) => regex.test(b.textContent ?? "") || regex.test(b.getAttribute("aria-label") ?? ""),
  );
  expect(achado, `a tela precisa ter um botão que combine com ${regex}`).toBeDefined();
  return achado as HTMLButtonElement;
}

/** Todos os botões cujo `aria-label` combina — equivalente a `getAllByLabelText`. */
function botoesComRotulo(regex: RegExp): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")].filter((b) =>
    regex.test(b.getAttribute("aria-label") ?? ""),
  );
}

describe("a tela mostra as três listas separadas", () => {
  it("nomeia os três destinos", async () => {
    await montar(padrao);
    expect(container.textContent).toMatch(/banner da home/i);
    expect(container.textContent).toMatch(/grade da semana/i);
    expect(container.textContent).toMatch(/TV do showroom/i);
  });

  it("a grade vazia diz que está sendo sorteada, em vez de ficar em branco", async () => {
    await montar(padrao);
    expect(container.textContent).toMatch(/sendo sorteadas/i);
  });
});

describe("a linha de corte", () => {
  it("aparece quando há mais vivos do que vagas no banner", async () => {
    await montar({
      ...padrao,
      bannerInicial: ["a", "b", "c", "d", "e"],
      linhas: ["a", "b", "c", "d", "e"].map((i) => linha(i)),
    });
    expect(container.textContent).toMatch(/NÃO aparece no banner/i);
  });

  it("não aparece quando tudo cabe", async () => {
    await montar(padrao);
    expect(container.textContent).not.toMatch(/NÃO aparece no banner/i);
  });

  it("a TV não tem linha de corte — tem tempo de volta", async () => {
    await montar(padrao);
    expect(container.textContent).toMatch(/volta completa/i);
  });
});

describe("os mortos", () => {
  it("são listados com o motivo e uma ação de limpeza", async () => {
    await montar({
      ...padrao,
      bannerInicial: ["a", "morto"],
      linhas: [linha("a"), linha("morto", { estado: "arquivado" })],
    });
    expect(container.textContent).toMatch(/sa(iu|íram) do estoque/i);
    expect(botao(/limpar/i)).toBeTruthy();
  });

  it("a tela diz que limpar não muda o que está no ar", async () => {
    await montar({
      ...padrao,
      bannerInicial: ["a", "morto"],
      linhas: [linha("a"), linha("morto", { estado: "arquivado" })],
    });
    expect(container.textContent).toMatch(/não muda nada do que está no ar/i);
  });
});

describe("ordenar", () => {
  it("subir o segundo o põe em primeiro, e marca a tela como não publicada", async () => {
    await montar(padrao);
    const setasDeSubir = botoesComRotulo(/mover .* para cima/i);
    await act(async () => {
      setasDeSubir[1].click();
    });
    expect(container.textContent).toMatch(/não publicada/i);
  });

  it("começa sem nada pendente", async () => {
    await montar(padrao);
    expect(container.textContent).not.toMatch(/não publicada/i);
  });

  // Achado da revisão: com um morto entre dois vivos, a primeira versão
  // trocava o vivo clicado com o morto invisível — a tela não mudava nada e
  // "Alteração não publicada" acendia do mesmo jeito. `a` e `b` têm
  // marca/modelo diferentes de propósito, para a ordem visível ser
  // distinguível por texto, e não só por posição.
  it("com um morto no meio, subir o vivo de baixo troca de verdade a ordem dos vivos na tela", async () => {
    await montar({
      ...padrao,
      bannerInicial: ["a", "morto", "b"],
      linhas: [
        linha("a", { marca: "Fiat", modelo: "Toro" }),
        linha("morto", { estado: "arquivado" }),
        linha("b", { marca: "Renault", modelo: "Kwid" }),
      ],
    });

    const antes = [...container.querySelectorAll("ol li")].map((li) => li.textContent ?? "");
    expect(antes[0]).toMatch(/Fiat Toro/);
    expect(antes[1]).toMatch(/Renault Kwid/);

    await act(async () => {
      botao(/Mover Renault Kwid para cima/i).click();
    });

    const depois = [...container.querySelectorAll("ol li")].map((li) => li.textContent ?? "");
    expect(depois[0]).toMatch(/Renault Kwid/);
    expect(depois[1]).toMatch(/Fiat Toro/);
  });
});
