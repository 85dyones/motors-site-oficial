import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Quem entra no painel cai na Visão geral.
 *
 * Antes, todo caminho de entrada levava a /admin/configuracoes: o formulário
 * de login, a sessão já ativa, o callback de autenticação e os desvios de
 * acesso negado do middleware. Configurações é uma tela de ajuste, não a
 * porta do painel — e para o perfil Financeiro era pior que isso, porque a
 * regra do middleware o expulsa de lá logo em seguida, causando um quique.
 *
 * A Visão geral é a única tela sem restrição de perfil, então serve para
 * todos. O teste existe porque um redirecionamento errado não quebra nada:
 * a pessoa só chega no lugar errado, e ninguém abre chamado por isso.
 */

const raiz = join(__dirname, "..", "src");
const arquivos = {
  "login/page.tsx": readFileSync(join(raiz, "app", "login", "page.tsx"), "utf-8"),
  "LoginForm.tsx": readFileSync(join(raiz, "components", "LoginForm.tsx"), "utf-8"),
  "auth/callback": readFileSync(join(raiz, "app", "api", "auth", "callback", "route.ts"), "utf-8"),
  "proxy.ts": readFileSync(join(raiz, "proxy.ts"), "utf-8"),
};

describe("destino de entrada no painel", () => {
  it("o formulário de login leva à Visão geral", () => {
    expect(arquivos["LoginForm.tsx"]).toContain('window.location.href = "/admin"');
  });

  it("sessão já ativa também", () => {
    expect(arquivos["login/page.tsx"]).toContain('redirect("/admin")');
  });

  it("o callback de autenticação usa a Visão geral como padrão", () => {
    expect(arquivos["auth/callback"]).toContain(': "/admin"');
  });

  it("o callback só redireciona para caminho interno", () => {
    // `//host` e `/\host` são normalizados pelo browser para origem externa —
    // aceitar qualquer `?next=` era o padrão clássico de open redirect.
    expect(arquivos["auth/callback"]).toContain('rawNext.startsWith("/")');
    expect(arquivos["auth/callback"]).toContain('!rawNext.startsWith("//")');
    expect(arquivos["auth/callback"]).toContain('!rawNext.startsWith("/\\\\")');
  });

  it("o desvio de acesso negado não joga ninguém em Configurações", () => {
    // Financeiro não pode ver Configurações: mandá-lo para lá gera um
    // segundo redirecionamento até /admin/financeiro. Desde o multi-papel nos
    // gates (2026-08-22), a âncora do bloco é a soma dos papéis, não `role`.
    const trecho = arquivos["proxy.ts"].slice(
      arquivos["proxy.ts"].indexOf('if (!perfis.includes("admin"))'),
      arquivos["proxy.ts"].indexOf("Config page restricted")
    );
    expect(trecho).not.toContain('url.pathname = "/admin/configuracoes"');
    expect(trecho.match(/url\.pathname = "\/admin"/g) ?? []).toHaveLength(2);
  });

  it("a regra que expulsa o Financeiro de Configurações continua de pé", () => {
    // Não é o destino que muda a permissão — ela precisa sobreviver. `every`
    // porque a regra vale para quem é SÓ financeiro: quem também tem outro
    // papel de painel entra em Configurações por esse outro papel.
    expect(arquivos["proxy.ts"]).toContain(
      'path.startsWith("/admin/configuracoes") && perfis.every((p) => p === "financeiro")'
    );
    expect(arquivos["proxy.ts"]).toContain('url.pathname = "/admin/financeiro"');
  });
});
