import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentarios } from "./fonte";

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
  "auth/confirm": readFileSync(join(raiz, "app", "api", "auth", "confirm", "route.ts"), "utf-8"),
  "proxy.ts": readFileSync(join(raiz, "proxy.ts"), "utf-8"),
};

describe("destino de entrada no painel", () => {
  it("o formulário de login leva à Visão geral", () => {
    expect(arquivos["LoginForm.tsx"]).toContain('window.location.href = "/admin"');
  });

  it("sessão já ativa também", () => {
    expect(arquivos["login/page.tsx"]).toContain('redirect("/admin")');
  });

  it("o callback manda para a Visão geral, e o destino não é calculado", () => {
    // Era `?next= ?? "/admin"`. Virou constante em 2026-09-01, por decisão do
    // dono: *"sempre que logar na área administrativa, sempre, a primeira
    // visualização deve ser a Visão Geral"*.
    const codigo = semComentarios(arquivos["auth/callback"]);
    expect(codigo).toContain('const destino = "/admin"');
    expect(codigo).toContain("${origin}${destino}");
  });

  it("o confirm manda o STAFF para a Visão geral", () => {
    // Esta rota é a do link mágico, e decide pelo PAPEL. O staff não tinha
    // trava nenhuma até 01/09 — o teste antigo cobria só o callback.
    const codigo = semComentarios(arquivos["auth/confirm"]);
    const i = codigo.indexOf("ehStaff(profile)");
    expect(i).toBeGreaterThan(-1);
    // A crase de fechamento faz parte da asserção, e não é detalhe: sem ela
    // `${origin}/admin/configuracoes` passava, porque CONTÉM `${origin}/admin`.
    // Foi o que uma mutação encontrou — a trava dizia "vai para o painel"
    // quando queria dizer "vai para a Visão geral".
    expect(codigo.slice(i, i + 160)).toContain("`${origin}/admin`");
  });

  it("NENHUMA rota de autenticação lê `next` — a fresta foi fechada", () => {
    // A versão anterior deste bloco travava a SANITIZAÇÃO do `?next=`
    // (`//host`, `/\host`), o que é a defesa certa para um parâmetro que se
    // usa. Só que ele era honrado por duas rotas e ESCRITO por nenhuma:
    // nenhum template de e-mail, nenhum link do painel, nenhuma rota. Era
    // desvio possível sem uso — e um open redirect a ser contido de graça.
    //
    // Não ler é mais forte que sanitizar: some a regra E some o que ela
    // protegia. Se alguém reintroduzir o parâmetro, esta trava falha antes de
    // a sanitização voltar a fazer falta.
    for (const rota of ["auth/callback", "auth/confirm"] as const) {
      const codigo = semComentarios(arquivos[rota]);
      expect(codigo, rota).not.toContain('searchParams.get("next")');
      expect(codigo, rota).not.toContain("rawNext");
    }
  });

  it("o desvio de acesso negado não joga ninguém em Configurações", () => {
    // Financeiro não pode ver Configurações: mandá-lo para lá geraria um
    // segundo redirecionamento.
    // Os âncoras mudaram em 2026-08-21, quando o proxy passou a ler TODOS os
    // papéis (`perfisDe`) em vez do primário — a intenção do teste é a
    // mesma: o desvio leva à Visão geral, nunca a Configurações.
    const trecho = arquivos["proxy.ts"].slice(
      arquivos["proxy.ts"].indexOf('if (!perfis.includes("admin"))'),
      arquivos["proxy.ts"].indexOf("// Configurações: Admin, Comercial e Marketing")
    );
    expect(trecho).not.toContain('url.pathname = "/admin/configuracoes"');

    // A asserção olha TODOS os destinos do bloco, não a quantidade deles.
    // Ela travava o número em 2 e quebrou em 2026-08-24, quando a agenda de
    // pessoas virou o terceiro portão — mas o número nunca foi a regra, e a
    // versão antiga tinha um buraco: um desvio para "/admin/estoque" passava
    // batido, porque só "/admin/configuracoes" era nomeado. Assim cobre os
    // dois casos e não precisa ser mexida a cada portão novo.
    const destinos = trecho.match(/url\.pathname = "[^"]*"/g) ?? [];
    expect(destinos.length).toBeGreaterThanOrEqual(2);
    for (const destino of destinos) {
      expect(destino).toBe('url.pathname = "/admin"');
    }
  });

  it("a regra que expulsa o Financeiro de Configurações continua de pé", () => {
    // Não é o destino que muda a permissão — ela precisa sobreviver. Desde
    // 2026-08-21 a regra é escrita pelo lado de quem PODE entrar (Comercial e
    // Marketing), e não pelo nome de quem não pode: assim o `gestor`, que
    // também não tem conteúdo de site na A17, já nasce barrado sem que
    // ninguém precise lembrar de acrescentá-lo aqui.
    //
    // O destino do desvio mudou em 2026-08-28: era /admin/financeiro, que
    // deixou de existir com a aposentadoria do módulo de caixa — agora todo
    // desvio leva à Visão geral, e o endereço antigo não pode reaparecer.
    expect(arquivos["proxy.ts"]).toContain('path.startsWith("/admin/configuracoes")');
    expect(arquivos["proxy.ts"]).toContain('!perfis.includes("comercial")');
    expect(arquivos["proxy.ts"]).toContain('!perfis.includes("marketing")');
    expect(arquivos["proxy.ts"]).not.toContain('url.pathname = "/admin/financeiro"');
  });
});
