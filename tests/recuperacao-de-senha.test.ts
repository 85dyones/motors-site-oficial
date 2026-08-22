import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "Esqueci minha senha" — 2026-08-21.
 *
 * Até aqui não existia recuperação: quem esquecia a senha dependia de um admin
 * digitar outra por ele — e, antes do convite, o admin já digitava a primeira.
 * Este arquivo trava o que faz o fluxo novo não repetir os erros conhecidos:
 *
 *   1. A tela responde NEUTRO. Diferenciar e-mail cadastrado de desconhecido
 *      transformaria o formulário num verificador de quem trabalha na Motors —
 *      a mesma regra da entrada da Garagem, com outro público.
 *   2. O link é verificado no servidor por `token_hash`, não por
 *      `{{ .ConfirmationURL }}`, que quebra fora do PKCE.
 *   3. A senha nova nasce em `/definir-senha`, a mesma tela do convite — e
 *      por isso ela não pode falar em "primeiro acesso".
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

/** Mede o que o código FAZ — a mesma régua de `garagem.test.ts`. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const template = ler("supabase", "templates", "reset-password.html");
const magicLink = ler("supabase", "templates", "magic-link.html");
const formRecuperar = ler("src", "components", "RecuperarSenhaForm.tsx");
const paginaRecuperar = ler("src", "app", "recuperar-senha", "page.tsx");
const loginForm = ler("src", "components", "LoginForm.tsx");
const rotaConfirm = ler("src", "app", "api", "auth", "confirm", "route.ts");
const paginaSenha = ler("src", "app", "definir-senha", "page.tsx");
const robots = ler("src", "app", "robots.ts");

describe("o template da troca de senha", () => {
  it("verifica por token_hash com type=recovery, nunca por ConfirmationURL", () => {
    expect(template).not.toContain("{{ .ConfirmationURL }}");
    const ocorrencias = template.match(/api\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=recovery/g);
    expect(ocorrencias, "o link precisa aparecer no botão E no texto de apoio").toHaveLength(2);
  });

  it("é e-mail de cliente de e-mail e veste a moldura da marca", () => {
    expect(template).not.toContain("<style");
    expect(template).not.toContain("<link");
    expect(template).not.toContain("@import");
    for (const marca of ["MOTORS STORE", "background-color:#c8412f", "Rua Ernesto Piazzetta, 98"]) {
      expect(template, `perdeu a marca: ${marca}`).toContain(marca);
    }
  });

  it("promete a mesma validade do link mágico — sai da mesma configuração", () => {
    // "Email OTP expiration" governa os dois. Se mudar no painel, os dois
    // textos mudam juntos — é o que o §4 do doc manda conferir.
    const promessa = "O link vale por 1 hora e só pode ser usado uma vez.";
    expect(magicLink).toContain(promessa);
    expect(template).toContain(promessa);
  });

  it("diz que a senha atual continua valendo até a troca", () => {
    // Sem isso, quem clica sem querer acha que ficou trancado para fora.
    expect(template).toContain("continua valendo");
    expect(template).toContain("sua senha continua a mesma");
  });
});

describe("o pedido do link", () => {
  it("responde NEUTRO — não conta a estranhos quem trabalha na Motors", () => {
    const codigo = semComentarios(formRecuperar);
    expect(codigo).toContain("estiver");
    expect(codigo).toContain("cadastrado");
    // Nenhum ramo que diferencie e-mail desconhecido de e-mail cadastrado.
    expect(codigo).not.toMatch(/não encontrado|nao encontrado|não cadastrado|não existe/i);
    // O retorno nem é lido: ler `error` seria o começo de diferenciar.
    expect(codigo).not.toContain("error");
  });

  it("pede o link pelo Supabase e nunca vê senha", () => {
    expect(formRecuperar).toContain("resetPasswordForEmail");
    expect(semComentarios(formRecuperar)).not.toContain("password");
    expect(semComentarios(paginaRecuperar)).not.toContain("password");
  });

  it("o login tem a saída — senão o fluxo existe e ninguém acha", () => {
    expect(loginForm).toContain("Esqueci minha senha");
    expect(loginForm).toContain('href="/recuperar-senha"');
  });

  it("a tela está fora de busca, como as outras portas de acesso", () => {
    const disallows = robots.match(/disallow: \[[^\]]*\]/gi) ?? [];
    expect(disallows.length).toBeGreaterThanOrEqual(2);
    for (const linha of disallows) {
      expect(linha).toContain('"/recuperar-senha"');
    }
    expect(paginaRecuperar).toContain("index: false");
  });
});

describe("a chegada do link de troca", () => {
  it("recovery termina em /definir-senha, como o convite", () => {
    expect(rotaConfirm).toContain('type === "recovery"');
    expect(rotaConfirm).toContain("`${origin}/definir-senha`");
  });

  it("a tela de senha serve os dois casos — não fala em primeiro acesso", () => {
    // A mesma tela recebe convidado e quem trocou a senha depois de anos.
    expect(paginaSenha).not.toContain("PRIMEIRO ACESSO");
    expect(paginaSenha).toContain("Escolha sua senha");
  });
});
