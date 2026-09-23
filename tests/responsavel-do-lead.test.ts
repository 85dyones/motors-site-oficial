import { describe, it, expect } from "vitest";
import { atendentesDoFluxo, recusaDeResponsavel } from "../src/lib/responsavelDoLead";

/**
 * A lista de responsáveis do card e a recusa do PATCH — a mesma régua de
 * `recebeLead` (2026-09-23). A equipe abaixo é a medida em produção no dia,
 * com o Felipe já como SDR.
 */
const equipe = [
  { full_name: "Dyones Oliveira", role: "admin", papeis: ["admin", "comercial", "gestor"], is_active: true },
  { full_name: "Rodrigo Naumowicz", role: "comercial", papeis: ["comercial"], is_active: true },
  { full_name: "Igor Alves", role: "admin", papeis: ["admin", "marketing"], is_active: true },
  { full_name: "Felipe Custódio", role: "sdr", papeis: ["sdr"], is_active: true },
  { full_name: "Ex Vendedor", role: "comercial", papeis: ["comercial"], is_active: false },
];

describe("a lista do card", () => {
  it("só o comercial ativo, inclusive quem tem comercial como papel secundário", () => {
    expect(atendentesDoFluxo(equipe).map((a) => a.nome)).toEqual([
      "Dyones Oliveira",
      "Rodrigo Naumowicz",
    ]);
  });
});

describe("o PATCH", () => {
  it("aceita comercial e aceita 'sem responsável'", () => {
    expect(recusaDeResponsavel("Rodrigo Naumowicz", equipe)).toBeNull();
    expect(recusaDeResponsavel(null, equipe)).toBeNull();
    expect(recusaDeResponsavel("", equipe)).toBeNull();
  });

  it("recusa quem não é do comercial, inativo e nome desconhecido", () => {
    expect(recusaDeResponsavel("Igor Alves", equipe)).toMatch(/comercial/i);
    expect(recusaDeResponsavel("Felipe Custódio", equipe)).toMatch(/comercial/i);
    expect(recusaDeResponsavel("Ex Vendedor", equipe)).toMatch(/comercial/i);
    expect(recusaDeResponsavel("Dyo Paulino", equipe)).toMatch(/comercial/i);
  });
});
