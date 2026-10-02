import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scriptDaRecargaDoPainel } from "../src/lib/recargaDoPainel";

/**
 * Recarregar qualquer tela do painel leva à Visão geral (pedido do dono em
 * 02/10/2026). Abrir um endereço direto, voltar e avançar não mudam.
 */

function rodar(tipo: string | undefined, caminho: string, descartada = false): string | null {
  let destino: string | null = null;
  const performance = { getEntriesByType: () => (tipo ? [{ type: tipo }] : []) };
  const location = { pathname: caminho, replace: (para: string) => (destino = para) };
  const document = { wasDiscarded: descartada };
  new Function("performance", "location", "document", scriptDaRecargaDoPainel())(performance, location, document);
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

  it("aba descartada e recarregada pelo navegador fica onde estava", () => {
    expect(rodar("reload", "/admin/leads", true)).toBeNull();
  });

  it("nenhuma mensagem do painel manda recarregar a página", () => {
    const achados = execSync(
      `grep -rIlE "Recarregue|e recarregue" src/app/api src/app/admin src/components/admin src/lib || true`,
      { cwd: join(__dirname, ".."), encoding: "utf8" },
    ).trim();
    expect(achados).toBe("");
  });

  it("navegador sem a API não quebra nem desvia", () => {
    expect(rodar(undefined, "/admin/estoque")).toBeNull();
    const semApi = new Function("performance", "location", "document", scriptDaRecargaDoPainel());
    expect(() => semApi(undefined, { pathname: "/admin/estoque", replace: () => {} }, {})).not.toThrow();
  });

  it("o layout do painel carrega o script, e só ele", () => {
    const ler = (...c: string[]) => readFileSync(join(__dirname, "..", ...c), "utf8");
    expect(ler("src", "app", "admin", "layout.tsx")).toContain("scriptDaRecargaDoPainel()");
    expect(ler("src", "app", "layout.tsx")).not.toContain("scriptDaRecargaDoPainel");
  });
});
