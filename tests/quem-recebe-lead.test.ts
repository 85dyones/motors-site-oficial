import { describe, it, expect } from "vitest";
import { PERFIS, ehStaff, podeFazer, recebeLead, ROTULO_DO_PERFIL } from "../src/lib/permissoes";

/**
 * Quem recebe lead — ordem do dono em 2026-09-23: *"nenhum destes que não
 * sejam comercial, na atividade principal ou secundária, podem estar no
 * fluxo"*. Medido no mesmo dia: o Igor (admin + marketing) estava no rodízio
 * porque a régua era "comercial OU admin".
 */
describe("quem recebe lead — só o Comercial (23/09)", () => {
  it("comercial principal ou secundário recebe", () => {
    expect(recebeLead({ papeis: ["comercial"], is_active: true })).toBe(true);
    expect(recebeLead({ papeis: ["admin", "comercial", "gestor"], is_active: true })).toBe(true);
  });

  it("admin sem comercial NÃO recebe — era o Igor no rodízio", () => {
    expect(recebeLead({ papeis: ["admin", "marketing"], is_active: true })).toBe(false);
  });

  it("sdr não recebe", () => {
    expect(recebeLead({ papeis: ["sdr"], is_active: true })).toBe(false);
  });

  it("inativo não recebe, mesmo comercial", () => {
    expect(recebeLead({ papeis: ["comercial"], is_active: false })).toBe(false);
  });

  it("sem papeis, cai no role singular", () => {
    expect(recebeLead({ role: "comercial", is_active: true })).toBe(true);
    expect(recebeLead(null)).toBe(false);
  });
});

describe("o papel sdr", () => {
  it("é de painel, com rótulo", () => {
    expect(PERFIS).toContain("sdr");
    expect(ehStaff(["sdr"])).toBe(true);
    expect(ROTULO_DO_PERFIL.sdr).toBe("SDR");
  });

  it("move lead e não vê o resto", () => {
    expect(podeFazer("sdr", "Ver e mover leads no kanban")).toBe("faz");
    expect(podeFazer("sdr", "Alterar preço até 5%")).toBe("nao_ve");
    expect(podeFazer("sdr", "Gerenciar clientes e fornecedores")).toBe("nao_ve");
    expect(podeFazer("sdr", "Convidar usuário e trocar perfil")).toBe("nao_ve");
  });
});
