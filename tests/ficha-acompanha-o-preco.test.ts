import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A ficha do veículo se refaz no mesmo relógio que a vitrine.
 *
 * 24/09: o sync baixou o preço da Saveiro `8358193` (R$ 55.900 → R$ 51.900).
 * O hub do modelo, com `revalidate = 60`, já mostrava o preço novo; a ficha,
 * com `revalidate = 3600`, seguiu uma hora anunciando o velho — no título, no
 * texto da prévia do WhatsApp e no preço da página. O preço muda direto no
 * banco pelo n8n, e o `revalidate` é o único jeito de a ficha perceber.
 */

const raiz = join(__dirname, "..");
const revalidateDe = (...caminho: string[]) => {
  const fonte = readFileSync(join(raiz, ...caminho), "utf-8");
  const achado = fonte.match(/^export const revalidate = (\d+);/m);
  expect(achado, `${caminho.join("/")} não declara revalidate`).not.toBeNull();
  return Number(achado![1]);
};

describe("a ficha acompanha a mudança de preço", () => {
  it("não fica mais velha que o hub do modelo nem que /estoque", () => {
    const ficha = revalidateDe("src", "app", "[categoria]", "[marca]", "[modelo]", "[ficha]", "page.tsx");
    const hub = revalidateDe("src", "app", "[categoria]", "[marca]", "[modelo]", "page.tsx");
    const estoque = revalidateDe("src", "app", "estoque", "page.tsx");

    expect(ficha).toBeLessThanOrEqual(hub);
    expect(ficha).toBeLessThanOrEqual(estoque);
  });
});
