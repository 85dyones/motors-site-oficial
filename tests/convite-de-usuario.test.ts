import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O convite de usuário — 2026-08-21.
 *
 * Até esta data a tela A17 pedia uma "Senha Provisória" ao admin e criava a
 * conta com ela (`createUser` + `email_confirm: true`). O efeito colateral não
 * era pequeno: nenhum e-mail saía do Supabase, a senha do funcionário viajava
 * por WhatsApp, não havia troca obrigatória na primeira entrada e quem cuidava
 * do painel conhecia a senha de todo mundo.
 *
 * O que este arquivo trava é o desenho que substituiu aquilo:
 *
 *   1. Quem cria o acesso NÃO escolhe a senha — o convite vai por e-mail e a
 *      senha nasce no navegador de quem vai usá-la.
 *   2. O papel entra em DOIS passos, porque o convite só grava user_metadata
 *      e `handle_new_user` lê app_metadata: sem o segundo, todo convidado
 *      nasce `cliente`.
 *   3. O link do convite é verificado no servidor por `token_hash`, como o do
 *      link mágico — convite não suporta PKCE, e por um motivo ainda mais
 *      forte: quem convida quase nunca está no navegador que aceita.
 *   4. Convite e recuperação terminam em `/definir-senha`, não no painel.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

/**
 * O banimento é sobre o que o código FAZ — a mesma régua de `garagem.test.ts`.
 * Comentário explicando por que uma chamada não existe mais precisa poder
 * citá-la pelo nome, senão o arquivo perde justamente a memória do motivo.
 */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const template = ler("supabase", "templates", "invite-user.html");
const magicLink = ler("supabase", "templates", "magic-link.html");
const rotaUsuarios = ler("src", "app", "api", "users", "route.ts");
const rotaConfirm = ler("src", "app", "api", "auth", "confirm", "route.ts");
const telaA17 = ler("src", "components", "admin", "UserManagement.tsx");
const paginaSenha = ler("src", "app", "definir-senha", "page.tsx");
const formSenha = ler("src", "components", "DefinirSenhaForm.tsx");
const robots = ler("src", "app", "robots.ts");

describe("o template do convite", () => {
  it("verifica por token_hash com type=invite, nunca por ConfirmationURL", () => {
    // Mesmo motivo do link mágico, agravado: a doc do próprio SDK diz que
    // `inviteUserByEmail` não suporta PKCE porque "o navegador que inicia o
    // convite costuma ser diferente do que aceita".
    expect(template).not.toContain("{{ .ConfirmationURL }}");
    const ocorrencias = template.match(/api\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=invite/g);
    expect(ocorrencias, "o link precisa aparecer no botão E no texto de apoio").toHaveLength(2);
  });

  it("é e-mail de cliente de e-mail: tabela, estilo inline, sem webfont", () => {
    expect(template).not.toContain("<style");
    expect(template).not.toContain("<link");
    expect(template).not.toContain("@import");
    expect(template).toContain('role="presentation"');
  });

  it("veste a mesma moldura do link mágico — só o texto muda", () => {
    // A identidade não é decorativa: e-mail de acesso que não se parece com
    // os outros é o que o cliente trata como golpe.
    for (const marca of [
      "MOTORS STORE",
      "background-color:#c8412f",
      "Archivo,Helvetica,Arial,sans-serif",
      "Rua Ernesto Piazzetta, 98",
    ]) {
      expect(magicLink).toContain(marca);
      expect(template, `o convite perdeu a marca: ${marca}`).toContain(marca);
    }
  });

  it("não promete prazo que o painel não garante", () => {
    // O magic-link promete 1 hora porque o §4 do doc fixa isso. A validade do
    // convite é outra configuração, e prometer número errado gera chamado.
    expect(template).not.toMatch(/vale por \d+ hora/);
    expect(template).toContain("só pode ser usado uma vez");
  });
});

describe("a rota que cria acesso", () => {
  it("convida — não inventa senha para ninguém", () => {
    expect(rotaUsuarios).toContain("inviteUserByEmail");
    // `signUp` era o fallback sem chave de serviço: criava usuário sem
    // app_metadata (ou seja, `cliente`) e é justamente o que o cadastro
    // público desabilitado bloqueia. `email_confirm` era o que matava o
    // envio do e-mail no caminho antigo.
    const codigo = semComentarios(rotaUsuarios);
    for (const proibido of ["password", "signUp", "email_confirm"]) {
      expect(codigo, `a rota voltou a usar ${proibido}`).not.toContain(proibido);
    }
  });

  it("grava o papel nos dois lugares — senão o convidado nasce cliente", () => {
    expect(rotaUsuarios).toContain("app_metadata: { role }");
    expect(rotaUsuarios).toMatch(/from\("profiles"\)\s*\.update\(/);
    // Sem chave de serviço não há convite possível: falhar alto é melhor do
    // que criar usuário quebrado.
    expect(rotaUsuarios).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(rotaUsuarios).toContain("503");
  });

  it("o convidado não some quando o papel falha depois do e-mail", () => {
    // O e-mail já saiu — apagar o usuário por conta própria seria pior. A
    // rota devolve o estado real e a tela recarrega a lista mesmo em erro.
    expect(rotaUsuarios).toContain("Ajuste o perfil na lista");
    const finalDoEnvio = telaA17.slice(telaA17.indexOf("const handleCreateUser"));
    expect(finalDoEnvio.slice(0, finalDoEnvio.indexOf("const handleUpdateUser"))).toContain(
      "fetchUsers();",
    );
  });
});

describe("a tela A17", () => {
  it("não tem campo de senha — quem cuida do painel não conhece senha alheia", () => {
    expect(telaA17).not.toContain("Senha Provisória");
    expect(telaA17).not.toContain("password");
    expect(telaA17).toContain("Enviar convite");
    expect(telaA17).toContain("escolhe a própria senha");
  });
});

describe("a chegada do convite", () => {
  it("invite e recovery vão para /definir-senha, não para o painel", () => {
    // Mandá-los ao painel logaria a sessão e deixaria a conta sem senha
    // própria para a próxima entrada — funciona hoje, não funciona amanhã.
    expect(rotaConfirm).toContain('type === "invite"');
    expect(rotaConfirm).toContain('type === "recovery"');
    expect(rotaConfirm).toContain("`${origin}/definir-senha`");
    // E o desvio acontece ANTES do destino por papel.
    expect(rotaConfirm.indexOf("/definir-senha")).toBeLessThan(rotaConfirm.indexOf("ehStaff(profile)"));
  });

  it("a tela de senha exige sessão e não aceita token por parâmetro", () => {
    expect(paginaSenha).toContain("supabase.auth.getUser()");
    // A verificação do link é da rota; a página só existe para quem já tem
    // sessão. Aceitar token aqui duplicaria a porta — e a cópia seria a fraca.
    const codigo = semComentarios(paginaSenha);
    expect(codigo).not.toContain("token_hash");
    expect(codigo).not.toContain("searchParams");
    // Sem sessão há saída humana, não beco.
    expect(paginaSenha).toContain("Peça um novo");
  });

  it("a senha é gravada pelo navegador de quem escolheu, e o destino é o papel", () => {
    expect(formSenha).toContain("auth.updateUser({ password: senha })");
    // Nenhuma rota do projeto recebe senha em corpo de requisição.
    expect(semComentarios(rotaUsuarios)).not.toContain("senha");
    expect(paginaSenha).toContain("ehStaff(profile)");
    expect(paginaSenha).toContain('"/admin"');
    expect(paginaSenha).toContain('"/garagem"');
  });

  it("/definir-senha está fora de busca, como /garagem e /login", () => {
    const disallows = robots.match(/disallow: \[[^\]]*\]/gi) ?? [];
    expect(disallows.length).toBeGreaterThanOrEqual(2);
    for (const linha of disallows) {
      expect(linha).toContain('"/definir-senha"');
    }
    expect(paginaSenha).toContain("index: false");
  });
});
