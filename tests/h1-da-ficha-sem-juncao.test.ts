import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * O `<h1>` da ficha separa modelo e versão no `textContent` (2026-09-21).
 *
 * O heading tem dois `<span className="block">` — "Volkswagen Virtus" e
 * "highline 200 tsi… · 2025 · Curitiba". Visualmente são duas linhas; no
 * `textContent` eram uma palavra só, "Virtushighline", porque o JSX não deixava
 * nó de texto entre os dois. É o mesmo defeito do `<h1>` da home.
 *
 * Trava de fonte, e não de render: o `PDPClientWrapper` é cliente, cheio de
 * efeito e de contexto, e renderizá-lo inteiro aqui custaria mais que o
 * defeito. O que se prende é a peça que resolve: o espaço entre os blocos.
 */
describe("o h1 da ficha", () => {
  const codigo = lerCodigo("src/components/PDPClientWrapper.tsx");
  const inicio = codigo.indexOf("<HeadingTag");
  const fim = codigo.indexOf("</HeadingTag>", inicio);
  const heading = codigo.slice(inicio, fim);

  it("tem espaço de verdade entre o modelo e o complemento", () => {
    expect(inicio).toBeGreaterThan(-1);
    const primeiroBloco = heading.indexOf("</span>");
    const complemento = heading.indexOf("{complementoDoTitulo && (");
    const entre = heading.slice(primeiroBloco, complemento);
    expect(entre).toContain('{complementoDoTitulo && " "}');
  });

  it("não esconde texto para resolver", () => {
    expect(heading).not.toContain("sr-only");
  });
});
