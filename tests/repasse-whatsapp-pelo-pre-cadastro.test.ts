import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { lerCodigo } from "./fonte";

/**
 * Todo WhatsApp do repasse passa pelo pré-cadastro (pedido do dono em 28/09):
 * "ao clicar no botão 'quero este repasse', o mecanismo precisa funcionar
 * exatamente como o 'falar com o consultor'".
 *
 * O `wa.me` direto é o defeito que isto trava: um `<a href>` para o WhatsApp
 * troca captura com contexto por link genérico — sem lead gravado, sem
 * Turnstile e sem o Lead no Pixel e na CAPI. É o que o `BotaoWhatsApp` faz, e
 * é por isso que ele não pode voltar a nenhum arquivo do repasse.
 *
 * Varre os dois diretórios inteiros, como `repasse-sem-view-item`: uma trava
 * por lista protege a lista, e o próximo componente do repasse nasceria sem
 * cobertura. O único arquivo que monta o link é o porteiro, e só no envio.
 *
 * A prova de comportamento (o clique abre o modal, o envio grava e abre o
 * WhatsApp) mora em `whatsapp-do-repasse-fiacao`; esta é a da fonte.
 */
const raiz = join(__dirname, "..");
const DIRETORIOS = [join(raiz, "src", "app", "repasse"), join(raiz, "src", "components", "repasse")];
const PORTEIRO = "src/components/repasse/WhatsAppDoRepasse.tsx";

function arquivosDe(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDe(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(relative(raiz, caminho).split(sep).join("/"));
  }
  return achados;
}

const ARQUIVOS = DIRETORIOS.flatMap((dir) => arquivosDe(dir));
const OS_OUTROS = ARQUIVOS.filter((a) => a !== PORTEIRO);

describe("o WhatsApp do repasse só sai pelo pré-cadastro", () => {
  it("a varredura acha os arquivos de verdade, com o porteiro e os quatro pontos do pedido", () => {
    // Sem isto, um caminho errado deixaria a lista vazia e o `it.each` abaixo
    // passaria sem ler nada.
    expect(ARQUIVOS.length).toBeGreaterThanOrEqual(10);
    for (const arquivo of [
      PORTEIRO,
      "src/app/repasse/[carro]/page.tsx",
      "src/app/repasse/page.tsx",
      "src/components/repasse/CardDoRepasse.tsx",
      "src/components/repasse/SecoesDoRepasse.tsx",
    ]) {
      expect(ARQUIVOS, arquivo).toContain(arquivo);
    }
  });

  it.each(OS_OUTROS)("%s não desenha link de WhatsApp", (arquivo) => {
    const codigo = lerCodigo(arquivo);
    expect(codigo, "usa o BotaoWhatsApp, que é um <a href> para o wa.me").not.toMatch(/\bBotaoWhatsApp\b/);
    expect(codigo, "monta o link do WhatsApp fora do porteiro").not.toMatch(/\blinkWhatsApp\b/);
    expect(codigo, "escreve wa.me à mão").not.toContain("wa.me");
  });

  it("os quatro pontos do pedido usam o porteiro", () => {
    const usos = (arquivo: string) => (lerCodigo(arquivo).match(/<WhatsAppDoRepasse[\s>]/g) ?? []).length;
    // Ficha: QUERO ESTE REPASSE, a barra QUERO ESTE e o PERGUNTAR NO WHATSAPP
    // do reservado e do vendido.
    expect(usos("src/app/repasse/[carro]/page.tsx")).toBe(3);
    expect(usos("src/components/repasse/CardDoRepasse.tsx")).toBe(1);
    expect(usos("src/components/repasse/SecoesDoRepasse.tsx")).toBe(1);
  });

  it("o porteiro monta o link só no envio, pelo window.open, e nunca como href", () => {
    const codigo = lerCodigo(PORTEIRO);
    expect(codigo.match(/\blinkWhatsApp\(/g) ?? []).toHaveLength(1);
    expect(codigo).toMatch(/window\.open\(\s*linkWhatsApp\(/);
    expect(codigo).not.toMatch(/href=/);
    // O botão é um <button>, e o que ele faz é abrir o modal.
    expect(codigo).toMatch(/<button[^>]*type="button"[^>]*onClick=\{abrir\}/);
    expect(codigo).toMatch(/<LeadCaptureModal[\s>]/);
  });
});
