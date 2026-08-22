import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O multi-papel vale nos GATES — 2026-08-22.
 *
 * A migração 20260819150000 ensinou o banco a somar papéis, e `podeFazer`
 * promete "quem tem mais de um perfil faz o que qualquer um deles faz". Mas
 * várias portas continuavam lendo só o primário (`profiles.role`): o proxy, o
 * trilho do painel, as rotas de usuários/auditoria, o DELETE de leads e o
 * editor de veículo. Na prática: quem era `{comercial, financeiro}` não via o
 * menu financeiro nem o custo de aquisição; quem era admin em segundo lugar
 * não convidava ninguém.
 *
 * Junto veio a mentira da A17 sobre papel fora do vocabulário:
 * `normalizarPerfil` devolve "comercial" para qualquer papel desconhecido,
 * então um convidado que nasceu `cliente` (convite feito fora da tela — caso
 * real de 2026-08-22: "criado como investidor") aparecia na lista com o badge
 * COMERCIAL, escondendo exatamente o que precisava ser corrigido.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

/** Comentário pode citar a forma antiga pelo nome; o código, não. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const proxy = ler("src", "proxy.ts");
const layout = ler("src", "app", "admin", "layout.tsx");
const trilho = ler("src", "components", "admin", "SidebarNav.tsx");
const telaA17 = ler("src", "components", "admin", "UserManagement.tsx");
const rotaUsuarios = ler("src", "app", "api", "users", "route.ts");
const rotaUsuario = ler("src", "app", "api", "users", "[id]", "route.ts");
const rotaAuditoria = ler("src", "app", "api", "auditoria", "route.ts");
const rotaLeads = ler("src", "app", "api", "leads", "gerenciar", "route.ts");
const paginaEditor = ler("src", "app", "admin", "estoque", "[id]", "page.tsx");

describe("os gates somam os papéis", () => {
  it("admin em segundo lugar é admin nas rotas restritas", () => {
    for (const [nome, fonte] of [
      ["users", rotaUsuarios],
      ["users/[id]", rotaUsuario],
      ["auditoria", rotaAuditoria],
      ["leads/gerenciar", rotaLeads],
    ] as const) {
      expect(fonte, nome).toContain('perfisDe(profile).includes("admin")');
      expect(semComentarios(fonte), nome).not.toContain('role !== "admin"');
    }
  });

  it("o proxy libera a área financeira para quem TEM o papel, não só para o primário", () => {
    expect(proxy).toContain('perfis.includes("financeiro")');
    const codigo = semComentarios(proxy);
    expect(codigo).not.toContain('role !== "admin"');
    expect(codigo).not.toContain('role !== "financeiro"');
  });

  it("o trilho mostra a união dos grupos", () => {
    expect(trilho).toContain("perfis: string[]");
    expect(trilho).toContain("group.roles.some((r) => perfis.includes(r))");
    expect(layout).toContain("SidebarNav perfis={perfis}");
  });

  it("o editor de veículo recebe todos os papéis — o segundo papel também grava", () => {
    expect(paginaEditor).toContain("perfil={perfisDe(profile)}");
    expect(semComentarios(paginaEditor)).not.toContain("normalizarPerfil");
  });
});

describe("a A17 não mente sobre papel", () => {
  it("o badge mostra o papel real — normalizarPerfil saiu da tela", () => {
    // Papel desconhecido virava "Comercial" no badge. Agora papel de painel
    // usa o rótulo da matriz; `cliente` e o resto aparecem como são.
    expect(semComentarios(telaA17)).not.toContain("normalizarPerfil");
    expect(telaA17).toContain("ehPapelDePainel");
    expect(telaA17).toContain("rotuloDoPapel");
  });

  it("papel fora do painel tem cara própria, tracejada", () => {
    expect(telaA17).toContain("border-dashed");
  });

  it("ao marcar perfis, papel de painel vai para a frente — cliente nunca é primário", () => {
    // `papeis[1]` espelha `role`, e `role` é o que os gates antigos leem: um
    // staff com primário `cliente` seria barrado do painel inteiro. Desde
    // 2026-08-22 a lista tem dois grupos (painel e área própria) e a ordenação
    // acontece sobre a seleção inteira, mas a regra é a mesma.
    expect(telaA17).toContain("...novosBrutos.filter((x) => ehPapelDePainel(x)),");
    expect(telaA17).toContain("...novosBrutos.filter((x) => !ehPapelDePainel(x)),");
  });

  it("a rota PUT garante a mesma ordem para qualquer cliente da API", () => {
    expect(rotaUsuario).toContain("papeis = [...papeis].sort(");
  });
});
