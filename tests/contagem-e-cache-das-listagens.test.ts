import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * Duas travas pequenas do mesmo assunto: o número de carros que cada página
 * declara (2026-09-21).
 *
 *   · a home mostrava 38 no hero e publicava `stock_count: null` no dataLayer,
 *     porque era a única listagem sem `<ContagemDeEstoque>`;
 *   · `/seminovos-curitiba` e `/seminovos-bacacheri` revalidavam em 3600 s e
 *     `/estoque` em 60 s. Contam pelo mesmo caminho e renderizavam em horas
 *     diferentes: a auditoria viu 38 × 36 no mesmo minuto e leu como
 *     canibalização. Era cache.
 */

function revalidateDe(arquivo: string): number {
  const m = lerCodigo(arquivo).match(/export const revalidate = (\d+);/);
  expect(m, `${arquivo} sem revalidate`).not.toBeNull();
  return Number(m![1]);
}

describe("a home publica a contagem que mostra", () => {
  const home = lerCodigo("src/app/page.tsx");

  it("monta <ContagemDeEstoque> com o mesmo total do hero", () => {
    expect(home).toContain("<ContagemDeEstoque total={total} />");
    expect(home).toContain("totalEstoque={total}");
  });

  it("fora dos blocos do painel — desligar uma área não desliga a medição", () => {
    const blocos = home.slice(home.indexOf("const blocos"), home.indexOf("return ("));
    expect(blocos).not.toContain("ContagemDeEstoque");
  });
});

describe("as listagens de estoque revalidam juntas", () => {
  it("as geográficas acompanham /estoque", () => {
    const estoque = revalidateDe("src/app/estoque/page.tsx");
    expect(revalidateDe("src/app/seminovos-curitiba/page.tsx")).toBe(estoque);
    expect(revalidateDe("src/app/seminovos-bacacheri/page.tsx")).toBe(estoque);
    expect(revalidateDe("src/app/seminovos-boa-vista/page.tsx")).toBe(estoque);
    expect(revalidateDe("src/app/seminovos-colombo/page.tsx")).toBe(estoque);
    expect(revalidateDe("src/app/seminovos-pinhais/page.tsx")).toBe(estoque);
    expect(revalidateDe("src/app/seminovos-almirante-tamandare/page.tsx")).toBe(estoque);
    expect(revalidateDe("src/app/page.tsx")).toBe(estoque);
  });

  it("os hubs de marca, de modelo e de recorte também — eles têm contagem no <h1>", () => {
    // Com 3600, o carro que o sync marcava vendido saía de /estoque em um
    // minuto e seguia contado e listado no hub por até uma hora.
    const estoque = revalidateDe("src/app/estoque/page.tsx");
    expect(revalidateDe("src/app/[categoria]/[marca]/page.tsx")).toBe(estoque);
    expect(revalidateDe("src/app/[categoria]/[marca]/[modelo]/page.tsx")).toBe(estoque);
    expect(revalidateDe("src/app/estoque/[recorte]/page.tsx")).toBe(estoque);
  });
});
