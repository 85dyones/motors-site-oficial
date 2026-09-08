import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { lerCodigo } from "./fonte";

/**
 * SVG servido pelo otimizador de imagem é XML com script no nosso domínio.
 *
 * `images.remotePatterns` inclui `*.supabase.co`, que é o bucket de upload das
 * fotos — conteúdo que o painel grava, não conteúdo que este repositório
 * revisa. Com `dangerouslyAllowSVG`, um arquivo `.svg` enviado por ali passa
 * pelo `/_next/image` e é servido a partir do domínio do site: `<script>`
 * dentro de SVG executa com a origem da página, o que é XSS de mesma origem.
 *
 * Medido em 2026-09-08, antes de mexer: **zero** `.svg` em `public/` e em
 * `src/`, e **zero** entre as 3.186 URLs de foto do estoque (2136 jpeg, 525
 * jpg, 525 webp). A flag não estava habilitando nada — só o risco.
 *
 * A trava não proíbe a flag para sempre: proíbe que ela volte DESACOMPANHADA.
 * Se um dia um ícone precisar passar pelo otimizador, ela pode voltar junto do
 * `contentSecurityPolicy` com `sandbox` e do `contentDispositionType`, que são
 * o que neutraliza o vetor. Proibir a grafia barraria a mudança legítima; o
 * que se afirma aqui é a condição inteira.
 */

const CONFIG = "next.config.ts";

/** Todo arquivo sob um diretório, recursivamente. */
function arquivos(raiz: string): string[] {
  let achados: string[] = [];
  for (const nome of readdirSync(raiz)) {
    if (nome === "node_modules" || nome === ".next" || nome === ".git") continue;
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) achados = achados.concat(arquivos(caminho));
    else achados.push(caminho);
  }
  return achados;
}

describe("o otimizador de imagem não serve SVG sem defesa", () => {
  const config = lerCodigo(CONFIG);
  const ligado = /dangerouslyAllowSVG:\s*true/.test(config);

  it("hoje a flag está desligada", () => {
    expect(ligado, "`dangerouslyAllowSVG: true` voltou ao next.config.ts").toBe(false);
  });

  it("se um dia voltar, volta com a CSP de sandbox e o Content-Disposition", () => {
    // Este caso é o que dá à trava acima uma saída honesta. Ele passa por
    // vacuidade enquanto a flag estiver desligada, e vira a régua no dia em
    // que alguém precisar ligá-la.
    if (!ligado) return;

    expect(config, "flag ligada sem contentSecurityPolicy").toMatch(/contentSecurityPolicy:/);
    expect(config, "a CSP precisa isolar o SVG").toMatch(/sandbox/);
    expect(config, "a CSP precisa barrar script no SVG").toMatch(/script-src\s+'none'/);
    expect(config, "flag ligada sem contentDispositionType").toMatch(
      /contentDispositionType:\s*"attachment"/,
    );
  });

  it("nenhum SVG é servido pelo site", () => {
    // A premissa que sustenta a remoção. No dia em que alguém adicionar um
    // `.svg` em `public/`, este caso falha e obriga a decisão consciente: ou
    // ele não passa pelo `next/image` (um `<img>` comum serve SVG sem a flag),
    // ou a flag volta com a CSP do caso acima.
    const svgs = [...arquivos("public"), ...arquivos("src")].filter((f) => f.endsWith(".svg"));

    expect(svgs, `SVGs no repositório: ${svgs.join(", ")}`).toHaveLength(0);
  });
});
