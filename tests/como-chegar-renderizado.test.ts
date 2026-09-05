import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { urlDaRota } from "../src/lib/rotaAteALoja";

/**
 * O botão "COMO CHEGAR" das páginas de bairro, renderizado.
 *
 * Nasceu de um buraco que a própria correção anterior abriu. Ao tirar a URL do
 * JSX para `lib/rotaAteALoja.ts` — certo, e pelo motivo certo — as duas
 * asserções de fonte que existiam sobre este componente foram embora com ela, e
 * a função pura ficou com bateria de testes enquanto a FIAÇÃO ficou sem
 * ninguém. `grep LinkComoChegar tests/` não devolvia nada.
 *
 * Três mutações passavam com `tsc` limpo e os 1876 verdes:
 *
 *  - `href={rota}` → `href="#"`: o botão de toda página de bairro deixa de
 *    levar a lugar nenhum, e `urlDaRota()` é calculada e jogada fora;
 *  - o `onClick` virando no-op: `click_directions` para de disparar. É
 *    conversão secundária declarada em `TRACKING_SPEC.md`, e o docblock do
 *    componente diz que este link é "a única fonte possível do evento" — um
 *    evento que já estava em produção morre em silêncio, contra a regra 7 do
 *    CLAUDE.md. É a pior das três, porque não quebra a entrega: quebra o que
 *    existia antes dela;
 *  - `const rota = endereco`: o `href` vira a string crua do endereço, que o
 *    navegador resolve como caminho relativo — 404 dentro do site — e
 *    `urlDaRota()` vira código morto com todos os testes dela verdes. É o
 *    padrão que a memória do projeto já registra: teste verde guardando código
 *    que ninguém chama.
 *
 * O componente não usa `useTheme()` — recebe tudo por prop —, então nem
 * precisa do mock de contexto que o rodapé precisou. Só o `dataLayer`, para
 * capturar o empurrão do evento.
 */

const pushComoChegar = vi.fn();
vi.mock("../src/lib/dataLayer", () => ({
  pushComoChegar: (origem: string) => pushComoChegar(origem),
}));

const ENDERECO = "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350";

/**
 * O elemento que o componente devolve.
 *
 * Chamado direto, sem React: ele não tem hook nenhum, e assim dá para ler
 * `props.href` e chamar `props.onClick` sem DOM. `renderToStaticMarkup` não
 * dispara evento — e o evento é metade do que este arquivo guarda.
 */
async function elemento(props: { endereco: string; origem: string }) {
  const { default: LinkComoChegar } = await import("../src/components/LinkComoChegar");
  return LinkComoChegar(props) as { props: Record<string, unknown> } | null;
}

describe("o `COMO CHEGAR` leva à rota e conta o clique", () => {
  it("o `href` é a rota montada pela função pura, não o endereço cru", async () => {
    const el = await elemento({ endereco: ENDERECO, origem: "bairro" });

    expect(el?.props.href).toBe(urlDaRota(ENDERECO));
    expect(el?.props.href).toContain("destination_place_id=ChIJv0CqvV3n3JQRquS50aBbm1c");
    // O endereço cru viraria caminho relativo: 404 dentro do site.
    expect(el?.props.href).not.toBe(ENDERECO);
    expect(String(el?.props.href)).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
  });

  it("o clique dispara `click_directions` com a origem", async () => {
    pushComoChegar.mockClear();
    const el = await elemento({ endereco: ENDERECO, origem: "seminovos-bacacheri" });

    (el?.props.onClick as () => void)();

    expect(pushComoChegar).toHaveBeenCalledTimes(1);
    expect(pushComoChegar).toHaveBeenCalledWith("seminovos-bacacheri");
  });

  it("abre em aba nova, sem entregar a janela de origem", async () => {
    const el = await elemento({ endereco: ENDERECO, origem: "bairro" });

    expect(el?.props.target).toBe("_blank");
    expect(String(el?.props.rel)).toContain("noopener");
  });

  it("sem endereço não renderiza botão nenhum", async () => {
    // Melhor não existir do que existir levando a lugar nenhum.
    expect(await elemento({ endereco: "", origem: "bairro" })).toBeNull();
    expect(await elemento({ endereco: "   ", origem: "bairro" })).toBeNull();
  });

  it("o que sai no HTML é uma âncora com a rota", async () => {
    const { default: LinkComoChegar } = await import("../src/components/LinkComoChegar");
    const html = renderToStaticMarkup(
      createElement(LinkComoChegar, { endereco: ENDERECO, origem: "bairro" }),
    );

    expect(html).toMatch(/^<a /);
    expect(html).toContain("COMO CHEGAR");
    expect(html).toContain("destination_place_id=ChIJv0CqvV3n3JQRquS50aBbm1c");
  });
});
