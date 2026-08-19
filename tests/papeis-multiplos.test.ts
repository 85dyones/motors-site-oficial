import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ehStaff, perfisDe, podeFazer, podeGravarCampo } from "../src/lib/permissoes";

/**
 * Um usuário pode ter mais de um papel (2026-08-19).
 *
 * Numa loja deste tamanho a mesma pessoa vende e cuida do financeiro. Com
 * `role` singular, cadastrá-la obrigava a escolher qual metade do trabalho ela
 * poderia fazer no sistema.
 *
 * O risco desta mudança é de segurança nos dois sentidos: papel a mais abre
 * porta que não devia, papel a menos tranca quem precisa trabalhar. Por isso
 * os dois lados estão travados aqui.
 */

const raiz = join(__dirname, "..");
const migracao = readFileSync(
  join(raiz, "supabase", "migrations", "20260819150000_papeis_multiplos.sql"),
  "utf-8",
);

describe("perfisDe — de onde vêm os papéis", () => {
  it("lê o array quando existe", () => {
    expect(perfisDe({ papeis: ["comercial", "financeiro"] })).toEqual(["comercial", "financeiro"]);
  });

  it("cai para `role` quando o array não veio", () => {
    // O banco mantém `role` como espelho de papeis[1], então código que ainda
    // seleciona só a coluna antiga continua funcionando.
    expect(perfisDe({ role: "admin" })).toEqual(["admin"]);
    expect(perfisDe("marketing")).toEqual(["marketing"]);
  });

  it("`cliente` nunca é papel de painel", () => {
    // Regra 2-b do CLAUDE.md. Um funcionário que também comprou carro tem
    // {cliente, comercial}: é comercial aqui, e `cliente` não ADICIONA nada.
    expect(perfisDe(["cliente"])).toEqual([]);
    expect(perfisDe(["cliente", "comercial"])).toEqual(["comercial"]);
    expect(ehStaff(["cliente"])).toBe(false);
    expect(ehStaff(["cliente", "comercial"])).toBe(true);
  });

  it("papel inventado é descartado, não promovido", () => {
    // `normalizarPerfil` devolvia "comercial" para qualquer coisa — é a
    // armadilha que a regra 2-b descreve. Aqui, lixo vira lista vazia.
    expect(perfisDe(["chefe"])).toEqual([]);
    expect(ehStaff(["chefe"])).toBe(false);
    expect(ehStaff(null)).toBe(false);
    expect(ehStaff(undefined)).toBe(false);
  });
});

describe("podeFazer com vários papéis", () => {
  it("vence o mais permissivo — multi-papel não pode ser castigo", () => {
    // Financeiro vê o custo de aquisição; Comercial não. Quem é os dois vê.
    const soComercial = podeFazer(["comercial"], "Ver custo de aquisição e margem");
    const ambos = podeFazer(["comercial", "financeiro"], "Ver custo de aquisição e margem");
    expect(soComercial).not.toBe("faz");
    expect(ambos).toBe("faz");
  });

  it("a soma nunca dá menos que a parte", () => {
    // A alternativa (interseção) daria a quem tem dois papéis MENOS acesso do
    // que com um só — o oposto do que o multi-papel existe para resolver.
    const acao = "Fechar venda do Ciclo";
    expect(podeFazer(["comercial"], acao)).toBe("faz");
    expect(podeFazer(["comercial", "financeiro"], acao)).toBe("faz");
  });

  it("lista vazia nega — não é 'sem restrição'", () => {
    expect(podeFazer([], "Fechar venda do Ciclo")).toBe("nao_ve");
  });

  it("um papel só continua funcionando como antes", () => {
    expect(podeFazer("admin", "Fechar venda do Ciclo")).toBe("faz");
    expect(podeFazer("financeiro", "Fechar venda do Ciclo")).toBe("nao_ve");
  });

  it("campo de veículo também soma os papéis", () => {
    expect(podeGravarCampo(["comercial"], "preco_compra")).toBe(false);
    expect(podeGravarCampo(["comercial", "financeiro"], "preco_compra")).toBe(true);
  });
});

describe("o banco, no mesmo assunto", () => {
  it("`role` sobrevive como espelho de papeis[1]", () => {
    // 70 pontos do código leem `role`. Sem o espelho, o deploy teria uma
    // janela em que o banco mudou e o código não — e nela ninguém entra.
    expect(migracao).toContain("new.role := new.papeis[1]");
  });

  it("gravar só `role` não apaga os outros papéis", () => {
    // Tela antiga gravando `role` deixaria `papeis` para trás em silêncio, e
    // silêncio aqui é alguém perdendo acesso sem nada no log.
    expect(migracao).toContain("new.papeis := array[new.role] || array_remove(old.papeis, new.role)");
  });

  it("is_staff passa a olhar todos os papéis", () => {
    // Sem isto, quem tivesse {cliente, comercial} seria barrado por toda
    // policy interna, porque o primário diria `cliente`.
    expect(migracao).toContain("papeis && array['admin', 'comercial', 'financeiro', 'marketing']");
  });

  it("a régua de conteúdo é constraint, não confiança", () => {
    expect(migracao).toContain("public.papeis_validos(papeis)");
    expect(migracao).toContain("array_length(p, 1) >= 1");
  });

  it("a migração prova as recusas contra o banco", () => {
    expect(migracao).toContain("ACEITE FALHOU: papel inventado foi aceito");
    expect(migracao).toContain("ACEITE FALHOU: papel repetido foi aceito");
    expect(migracao).toContain("ACEITE FALHOU: cliente virou staff — regra 2-b");
  });
});
