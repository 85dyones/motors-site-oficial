import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validarSaida } from "../src/lib/ciclo/saida";

const raiz = join(__dirname, "..");
const rota = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "veiculos", "[id]", "saida", "route.ts"),
  "utf-8",
);

describe("marcar a saída da Garagem", () => {
  it("exige data", () => {
    expect(validarSaida({ saiu_em: "", motivo_saida: "revendido" })
      .some((p) => p.campo === "saiu_em")).toBe(true);
  });

  it("exige motivo — é o que o CHECK do banco cobra", () => {
    expect(validarSaida({ saiu_em: "2026-08-20", motivo_saida: "  " })
      .some((p) => p.campo === "motivo_saida")).toBe(true);
  });

  it("recusa data no futuro: saída é registro do que aconteceu", () => {
    expect(validarSaida({ saiu_em: "2099-01-01", motivo_saida: "revendido" })
      .some((p) => p.campo === "saiu_em")).toBe(true);
  });

  it("aceita o caso completo", () => {
    expect(validarSaida({ saiu_em: "2026-08-20", motivo_saida: "revendido" })).toEqual([]);
  });
});

describe("a rota é de staff e não apaga nada", () => {
  it("exige staff e o gate da fila de verificação", () => {
    expect(rota).toContain("ehStaff(profile)");
    expect(rota).toContain('podeFazer(perfisDe(profile), "Verificar revisão do diário de bordo")');
  });

  it("só escreve saiu_em e motivo_saida — o histórico não é apagado", () => {
    expect(rota).not.toContain(".delete(");
    expect(rota).toContain('.from("veiculos_vendidos")');
    expect(rota).toContain(".update(");
  });
});
