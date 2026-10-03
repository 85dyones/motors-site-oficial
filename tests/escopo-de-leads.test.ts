import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { comEscopoDeLeads, escopoDeLeads, leadNoEscopo } from "../src/lib/escopoDeLeads";
import { podeFazer } from "../src/lib/permissoes";

/**
 * Quem enxerga quais leads (regra do dono, 03/10/2026): Admin, todos; Gestor e
 * SDR, os que já têm responsável; Comercial, só os dele; a busca por
 * referência obedece à mesma regra.
 */

const ler = (...c: string[]) => readFileSync(join(__dirname, "..", ...c), "utf8");

/** Uma consulta de mentira que anota os filtros que recebeu. */
function consulta() {
  const filtros: string[] = [];
  const q = {
    filtros,
    eq: (c: string, v: string) => (filtros.push(`${c} = ${v}`), q),
    neq: (c: string, v: string) => (filtros.push(`${c} <> '${v}'`), q),
    not: (c: string, op: string, v: null) => (filtros.push(`${c} not ${op} ${v}`), q),
  };
  return q;
}

describe("o escopo por perfil", () => {
  it("cada perfil, e a soma quando há mais de um", () => {
    expect(escopoDeLeads(["admin"])).toBe("todos");
    expect(escopoDeLeads(["gestor"])).toBe("designados");
    expect(escopoDeLeads(["sdr"])).toBe("designados");
    expect(escopoDeLeads(["comercial"])).toBe("meus");
    expect(escopoDeLeads(["marketing"])).toBe("nenhum");
    expect(escopoDeLeads(["financeiro"])).toBe("nenhum");
    expect(escopoDeLeads([])).toBe("nenhum");
    // Multi-papel soma acesso.
    expect(escopoDeLeads(["comercial", "sdr"])).toBe("designados");
    expect(escopoDeLeads(["comercial", "admin"])).toBe("todos");
  });

  it("o Gestor passou a abrir o quadro; Marketing e Financeiro seguem de fora", () => {
    expect(podeFazer(["gestor"], "Ver e mover leads no kanban")).toBe("faz");
    expect(podeFazer(["marketing"], "Ver e mover leads no kanban")).not.toBe("faz");
    expect(podeFazer(["financeiro"], "Ver e mover leads no kanban")).not.toBe("faz");
  });
});

describe("um lead está à vista?", () => {
  it("Admin vê tudo, inclusive o novo sem responsável", () => {
    const admin = { escopo: "todos" as const, meuNome: "Dono" };
    expect(leadNoEscopo(admin, null)).toBe(true);
    expect(leadNoEscopo(admin, "Ana")).toBe(true);
  });

  it("Gestor e SDR veem o que tem responsável, e não o novo", () => {
    const sdr = { escopo: "designados" as const, meuNome: "Bia" };
    expect(leadNoEscopo(sdr, "Ana")).toBe(true);
    expect(leadNoEscopo(sdr, null)).toBe(false);
    expect(leadNoEscopo(sdr, "")).toBe(false);
    expect(leadNoEscopo(sdr, "   ")).toBe(false);
  });

  it("o vendedor vê só os dele, e sem nome no perfil não vê nenhum", () => {
    const ana = { escopo: "meus" as const, meuNome: "Ana" };
    expect(leadNoEscopo(ana, "Ana")).toBe(true);
    expect(leadNoEscopo(ana, "Rodrigo")).toBe(false);
    expect(leadNoEscopo(ana, null)).toBe(false);
    expect(leadNoEscopo({ escopo: "meus", meuNome: null }, null)).toBe(false);
    expect(leadNoEscopo({ escopo: "meus", meuNome: "" }, "")).toBe(false);
  });

  it("quem não vê lead não vê nenhum", () => {
    expect(leadNoEscopo({ escopo: "nenhum", meuNome: "Ana" }, "Ana")).toBe(false);
  });
});

describe("o filtro vai para o banco", () => {
  it("Admin: nenhum filtro", () => {
    expect(comEscopoDeLeads(consulta(), { escopo: "todos", meuNome: null }).filtros).toEqual([]);
  });

  it("Gestor e SDR: responsável preenchido", () => {
    expect(comEscopoDeLeads(consulta(), { escopo: "designados", meuNome: "Bia" }).filtros).toEqual([
      "responsavel not is null",
      "responsavel <> ''",
    ]);
  });

  it("vendedor: o nome dele; sem nome, um valor que não casa com ninguém", () => {
    expect(comEscopoDeLeads(consulta(), { escopo: "meus", meuNome: "Ana" }).filtros).toEqual(["responsavel = Ana"]);
    const semNome = comEscopoDeLeads(consulta(), { escopo: "meus", meuNome: null }).filtros;
    expect(semNome).toHaveLength(1);
    expect(semNome[0]).not.toBe("responsavel = null");
    expect(comEscopoDeLeads(consulta(), { escopo: "nenhum", meuNome: "Ana" }).filtros).toEqual(semNome);
  });
});

describe("as rotas aplicam a regra", () => {
  const fila = ler("src", "app", "api", "leads", "gerenciar", "route.ts");
  const etiquetas = ler("src", "app", "api", "leads", "etiquetas", "route.ts");
  const visaoGeral = ler("src", "app", "admin", "page.tsx");

  it("a fila e a busca por referência passam pelo mesmo filtro, depois do filtro da ref", () => {
    const ref = fila.indexOf('consulta.ilike("ag_uid", padraoDaRef(ref))');
    const escopo = fila.indexOf("if (podeVer) consulta = comEscopoDeLeads(consulta, visao);");
    expect(ref).toBeGreaterThan(-1);
    expect(escopo).toBeGreaterThan(ref);
    // E antes de a consulta ir para o banco.
    expect(escopo).toBeLessThan(fila.indexOf("const { data, error } = await consulta;"));
  });

  it("mover, etiquetar e registrar contato só no lead que se enxerga; fora dele, 404", () => {
    const guarda = fila.indexOf("if (!alvo || !leadNoEscopo(visaoDoAutor, alvo.responsavel))");
    expect(guarda).toBeGreaterThan(-1);
    // Antes do registro de contato, que é a primeira escrita da rota.
    expect(guarda).toBeLessThan(fila.indexOf('supabase.rpc("registrar_contato_do_lead"'));
    expect(fila.slice(guarda, guarda + 200)).toContain("status: 404");
    // Banco que não respondeu é 500, e não "lead não encontrado".
    expect(fila).toContain("if (erroDoAlvo) return NextResponse.json({ error: erroDoAlvo.message }, { status: 500 });");
    expect(etiquetas).toContain("if (!alvo || !leadNoEscopo(visao, alvo.responsavel))");
    expect(etiquetas.indexOf("leadNoEscopo(visao, alvo.responsavel)")).toBeLessThan(
      etiquetas.indexOf("editarEtiquetasDoLead(supabase, id, body"),
    );
  });

  it("a Visão geral não mostra lead novo a quem não o enxerga", () => {
    expect(visaoGeral).toMatch(/comEscopoDeLeads\(\s*supabase\.from\("leads"\)/);
  });

  it("a fila passa pela mesma régua da escrita (responsável só com espaços)", () => {
    expect(fila).toContain("(data ?? []).filter((l) => leadNoEscopo(visao, l.responsavel))");
  });

  it("a tela recebe o escopo, e o vendedor não lê o próprio nome em cada card", () => {
    expect(fila).toContain("escopo: visao.escopo,");
    const quadro = ler("src", "components", "admin", "LeadsKanban.tsx");
    expect(quadro).toContain('setSoOsMeus(d.escopo === "meus");');
    expect(quadro).toContain("{!soOsMeus && (");
  });
});
