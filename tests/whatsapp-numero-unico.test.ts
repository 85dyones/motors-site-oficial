import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { linkWhatsApp, numeroDaLoja, normalizarNumero } from "../src/lib/whatsapp";

/**
 * A loja atende num número só.
 *
 * Havia dois caminhos para o WhatsApp da loja: sete telas montavam o link a
 * partir de `companySettings.whatsappRaw`, e o pop-up de lead tinha campo
 * próprio no painel, escolhendo o número por comparação contra dois valores
 * mágicos ("554198089550" e "5511999999999"). Bastava digitar qualquer coisa
 * naquele campo para a loja passar a atender em dois lugares, sem aviso.
 *
 * Decisão do dono em 2026-08-10: um número só, num ponto só de configuração.
 * Estes testes existem porque a regressão é invisível — um `wa.me/` montado à
 * mão numa tela nova não quebra build, teste nem lint, e ninguém percebe até
 * um cliente ligar para o número errado.
 */

const raiz = join(__dirname, "..", "src");

/** Todo .ts/.tsx de src, menos a página de teste e o próprio helper. */
function fontes(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      // `app/test` é uma página de laboratório, fora do site público.
      if (nome === "test") continue;
      fontes(caminho, acc);
    } else if (/\.tsx?$/.test(nome) && nome !== "whatsapp.ts") {
      acc.push(caminho);
    }
  }
  return acc;
}

const arquivos = fontes(raiz).map((f) => ({ caminho: f, texto: readFileSync(f, "utf-8") }));

describe("ponto único de montagem", () => {
  it("ninguém monta wa.me à mão com o número da loja", () => {
    const infratores = arquivos
      .filter(({ texto }) => texto.includes("wa.me/"))
      // O Kanban de leads monta `wa.me/${l.telefone}` — é o número do
      // cliente, não o da loja. Esse é o uso legítimo.
      .filter(({ texto }) => !/wa\.me\/\$\{l\.telefone\}/.test(texto))
      .map(({ caminho }) => caminho);
    expect(infratores).toEqual([]);
  });

  it("nenhum número da loja ficou hardcoded no código", () => {
    const infratores = arquivos
      .filter(({ texto }) =>
        // Os dois antigos e qualquer coisa com cara de número brasileiro
        // completo dentro de aspas.
        /["'`]55\d{10,11}["'`]/.test(texto)
      )
      .map(({ caminho }) => caminho);
    expect(infratores).toEqual([]);
  });

  it("o pop-up não tem mais número próprio", () => {
    const popup = readFileSync(join(raiz, "components", "LeadPopup.tsx"), "utf-8");
    expect(popup).toContain("linkWhatsApp(companySettings");
    expect(popup).not.toContain("whatsappNumber");
  });
});

describe("linkWhatsApp", () => {
  it("usa o número da concessionária", () => {
    expect(linkWhatsApp({ whatsappRaw: "5541999990000", whatsapp: "" })).toBe(
      "https://wa.me/5541999990000"
    );
  });

  it("limpa máscara vinda do painel", () => {
    expect(numeroDaLoja({ whatsappRaw: "(41) 99999-0000", whatsapp: "" })).toBe(
      "41999990000"
    );
    expect(normalizarNumero("+55 (41) 99999-0000")).toBe("5541999990000");
  });

  it("cai no campo formatado quando o cru está vazio", () => {
    // Instalação antiga, anterior ao `whatsappRaw`.
    expect(numeroDaLoja({ whatsappRaw: "", whatsapp: "(41) 99999-0000" })).toBe(
      "41999990000"
    );
  });

  it("codifica a mensagem", () => {
    const url = linkWhatsApp({ whatsappRaw: "5541999990000", whatsapp: "" }, "Olá, tudo bem?");
    expect(url).toBe("https://wa.me/5541999990000?text=Ol%C3%A1%2C%20tudo%20bem%3F");
  });

  it("devolve vazio sem número, em vez de um link quebrado", () => {
    // `wa.me/` sem número abre o WhatsApp numa tela de erro — pior do que
    // não oferecer o botão. Quem chama decide esconder.
    expect(linkWhatsApp({ whatsappRaw: "", whatsapp: "" })).toBe("");
    expect(linkWhatsApp(null)).toBe("");
    expect(linkWhatsApp(undefined, "mensagem")).toBe("");
  });

  it("não gera ?text= vazio quando a mensagem é só espaço", () => {
    expect(linkWhatsApp({ whatsappRaw: "5541999990000", whatsapp: "" }, "   ")).toBe(
      "https://wa.me/5541999990000"
    );
  });
});
