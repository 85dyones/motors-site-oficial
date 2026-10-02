import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scriptDaRecargaDoPainel } from "../src/lib/recargaDoPainel";

/**
 * Recarregar qualquer tela do painel leva à Visão geral (pedido do dono em
 * 02/10/2026). Abrir um endereço direto, voltar e avançar não mudam.
 */

function rodar(tipo: string | undefined, caminho: string): string | null {
  let destino: string | null = null;
  const performance = { getEntriesByType: () => (tipo ? [{ type: tipo }] : []) };
  const location = { pathname: caminho, replace: (para: string) => (destino = para) };
  new Function("performance", "location", scriptDaRecargaDoPainel())(performance, location);
  return destino;
}

describe("a recarga do painel", () => {
  it("recarga de uma tela interna vai para a Visão geral", () => {
    expect(rodar("reload", "/admin/estoque")).toBe("/admin");
    expect(rodar("reload", "/admin/estoque/8511475/editar")).toBe("/admin");
  });

  it("recarga da própria Visão geral fica onde está (sem laço)", () => {
    expect(rodar("reload", "/admin")).toBeNull();
    expect(rodar("reload", "/admin/")).toBeNull();
  });

  it("abrir um endereço direto, voltar e avançar não desviam", () => {
    expect(rodar("navigate", "/admin/leads")).toBeNull();
    expect(rodar("back_forward", "/admin/leads")).toBeNull();
  });

  it("navegador sem a API não quebra nem desvia", () => {
    expect(rodar(undefined, "/admin/estoque")).toBeNull();
    const semApi = new Function("performance", "location", scriptDaRecargaDoPainel());
    expect(() => semApi(undefined, { pathname: "/admin/estoque", replace: () => {} })).not.toThrow();
  });

  it("o layout do painel carrega o script, e só ele", () => {
    const ler = (...c: string[]) => readFileSync(join(__dirname, "..", ...c), "utf8");
    expect(ler("src", "app", "admin", "layout.tsx")).toContain("scriptDaRecargaDoPainel()");
    expect(ler("src", "app", "layout.tsx")).not.toContain("scriptDaRecargaDoPainel");
  });
});
