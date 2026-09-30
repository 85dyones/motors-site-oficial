import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * Correção do dono em 30/09/2026: Dyones Oliveira, que assina os guias, NÃO é
 * o fundador da Motors Store. É profissional com mais de dez anos de mercado.
 * O site dizia "fundador" no `/sobre`, no `jobTitle` do schema e no
 * `llms.txt`. Este teste impede que a afirmação volte por qualquer desses
 * caminhos.
 */
describe("quem assina os guias", () => {
  it("a apresentação é a que o dono deu, sem cargo inventado", async () => {
    const { AUTOR_DOS_GUIAS } = await import("../src/lib/assinaturaDoGuia");
    expect(AUTOR_DOS_GUIAS.apresentacao).toBe("profissional com mais de dez anos de mercado");
    expect(AUTOR_DOS_GUIAS).not.toHaveProperty("cargo");
  });

  it("o nó Person do schema não diz fundador nem tem jobTitle", async () => {
    const { schemaDoAutorDosGuias } = await import("../src/lib/schemaGuia");
    const no = schemaDoAutorDosGuias() as Record<string, unknown>;
    expect(no).not.toHaveProperty("jobTitle");
    expect(JSON.stringify(no)).not.toMatch(/fundador/i);
    expect(no.description).toBe("Dyones Oliveira, profissional com mais de dez anos de mercado.");
  });

  it.each(["src/app/sobre/page.tsx", "public/llms.txt"])("%s não chama o autor de fundador", (arquivo) => {
    const texto = arquivo.endsWith(".txt") ? ler(arquivo) : lerCodigo(arquivo);
    expect(texto).not.toMatch(/fundador/i);
  });
});
