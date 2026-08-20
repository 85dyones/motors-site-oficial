import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * O widget do Turnstile não pode ser recriado a cada tecla.
 *
 * O componente monta o desafio dentro de um `useEffect`, e o cleanup desse
 * efeito chama `turnstile.remove()`. Enquanto os callbacks (`onSuccess`,
 * `onError`, `onExpire`) estiveram no array de dependências, todo consumidor
 * que passava arrow inline — e todos passam — fazia o efeito rodar de novo a
 * cada render. Como os formulários têm input controlado, "a cada render"
 * quer dizer "a cada tecla".
 *
 * Medido em 2026-08-20 no LeadCaptureModal, em `next dev` e também na build
 * de produção: digitar um nome de 16 letras gerava 16 `remove` + 16 `render`
 * e nenhum token; o token só aparecia ~1,6 s depois da última tecla. Como o
 * modal trava o envio sem token (`disabled={... || !turnstileToken}`) e os
 * canais do modal exigem captcha no servidor, esse intervalo cai bem em cima
 * da hora de enviar.
 *
 * A estabilidade mora no próprio Turnstile, não no consumidor: assim o
 * consumidor continua escrevendo arrow inline sem quebrar nada.
 */

const raiz = join(__dirname, "..");
const CAMINHO = join(raiz, "src", "components", "Turnstile.tsx");
const fonte = readFileSync(CAMINHO, "utf8");
/** Mesmo código, com espaços em branco normalizados. */
const normalizada = fonte.replace(/\s+/g, " ");

const CALLBACKS = ["onSuccess", "onError", "onExpire"];

/** Todo array de dependências de `useEffect` do arquivo. */
function arraysDeDependencia(codigo: string): string[] {
  const achados: string[] = [];
  const re = /\}\s*,\s*\[([^\]]*)\]\s*\)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) achados.push(m[1]);
  return achados;
}

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

describe("estabilidade do widget Turnstile", () => {
  it("nenhum efeito depende da identidade dos callbacks", () => {
    const deps = arraysDeDependencia(fonte);
    expect(deps.length).toBeGreaterThan(0);

    for (const dep of deps) {
      const nomes = dep.split(",").map((n) => n.trim()).filter(Boolean);
      for (const callback of CALLBACKS) {
        expect(
          nomes,
          `"${callback}" no array de dependências recria o widget a cada render`
        ).not.toContain(callback);
      }
    }
  });

  it("os callbacks são lidos por ref, não capturados pelo closure", () => {
    // Com dependências vazias, chamar a prop direto congelaria o callback do
    // primeiro render — o token chegaria para uma função velha.
    const opcoes = normalizada.slice(normalizada.indexOf("window.turnstile.render("));
    expect(opcoes.length).toBeGreaterThan(0);

    for (const callback of CALLBACKS) {
      expect(
        opcoes.includes(`${callback}Ref.current`),
        `"${callback}" precisa ser lido por ref dentro do render`
      ).toBe(true);
      expect(
        opcoes.includes(`${callback}(`),
        `"${callback}" é chamado direto dentro do render; use ${callback}Ref.current`
      ).toBe(false);
    }
  });

  it("as refs acompanham o valor mais recente da prop", () => {
    // Sem esse efeito de sincronização a ref guardaria o primeiro valor.
    for (const callback of CALLBACKS) {
      expect(
        normalizada.includes(`${callback}Ref.current = ${callback};`),
        `falta sincronizar ${callback}Ref a cada render`
      ).toBe(true);
    }
  });

  it("é este arquivo que os formulários importam", () => {
    // Guarda contra o teste ficar verde vigiando um arquivo que ninguém usa.
    const consumidores = arquivosDeCodigo(join(raiz, "src")).filter((caminho) =>
      /from\s+["'][^"']*\/Turnstile["']/.test(readFileSync(caminho, "utf8"))
    );
    expect(consumidores.length).toBeGreaterThan(0);
  });
});
