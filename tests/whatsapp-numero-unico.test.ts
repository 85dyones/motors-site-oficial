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

const arquivos = fontes(raiz).map((f) => ({
  // Separador POSIX sempre. `join` devolve `\` no Windows, e as isenções
  // abaixo são escritas com `/`: comparar cru faz o arquivo ISENTO ser
  // acusado de infrator — num teste que passa no CI (Linux) e falha só na
  // máquina de quem está editando o código.
  caminho: f.replace(/\\/g, "/"),
  texto: readFileSync(f, "utf-8"),
}));

describe("ponto único de montagem", () => {
  it("ninguém monta wa.me à mão com o número da loja", () => {
    // Há DOIS destinos possíveis num link de WhatsApp, e só um deles é o da
    // loja. Cada um tem uma função e um arquivo:
    //
    //   lib/whatsapp.ts ... `linkWhatsApp()` — o número DA LOJA, que o
    //                       visitante aciona. É o que este teste protege.
    //   lib/funil.ts ...... `linkDeConversa()` — o número DO CLIENTE, que o
    //                       vendedor aciona pelo card do kanban (2026-08-28).
    //
    // Até 2026-08-28 o kanban montava `wa.me/${l.telefone}` na mão e a
    // exceção aqui era escrita nesse formato exato — o que deixava passar
    // qualquer outra tela que montasse o link do cliente à mão com outro nome
    // de variável. Agora a exceção é por ARQUIVO, e o arquivo isento é
    // verificado logo abaixo: ele não pode alcançar as configurações da loja.
    const ISENTOS = ["lib/funil.ts"];
    const infratores = arquivos
      .filter(({ texto }) => texto.includes("wa.me/"))
      .filter(({ caminho }) => !ISENTOS.some((i) => caminho.endsWith(i)))
      .map(({ caminho }) => caminho);
    expect(infratores).toEqual([]);
  });

  it("o link do cliente não tem como virar o link da loja", () => {
    // A isenção acima só é segura enquanto `lib/funil.ts` não souber quem é a
    // loja. Se um dia ele importar as configurações, o link do card pode
    // passar a apontar para o próprio número da revenda — e a loja mandaria
    // mensagem para si mesma sem ninguém perceber.
    const funil = readFileSync(join(raiz, "lib", "funil.ts"), "utf-8");
    expect(funil).not.toMatch(/companySettings|whatsappRaw|numeroDaLoja|getCachedSettings/);
  });

  it("o kanban usa o montador único em vez de escrever o link à mão", () => {
    const kanban = readFileSync(
      join(raiz, "components", "admin", "LeadsKanban.tsx"),
      "utf-8",
    );
    expect(kanban).toContain("linkDeConversa");
    expect(kanban).not.toContain("wa.me/");
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
