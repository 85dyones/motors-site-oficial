import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getVeiculoPdpUrl } from "../src/lib/supabase";

/**
 * O `llms.txt` ensina a MONTAR a URL da ficha. Ele estava ensinando errado.
 *
 * Até 2026-09-08 o arquivo descrevia a PDP como cinco segmentos terminados em
 * `.html`:
 *
 *   /carros/[marca]/[modelo]/[versao]/[slug_completo_com_id]
 *   … com o exemplo `/carros/fiat/titano/volcano-22-16v-4x4-tb-die-aut/8171616.html`
 *
 * Esse endereço foi real e hoje responde **308** para o canônico de quatro
 * segmentos (`.../volcano-…-8171616`). Um documento que existe para ser lido
 * por modelo de linguagem é pior que inútil quando descreve o formato antigo:
 * o modelo não erra um link, ele CITA um padrão errado para quem perguntar.
 *
 * A trava compara com a fonte de verdade — a própria `getVeiculoPdpUrl`, que é
 * quem escreve as URLs do site — em vez de com uma regex copiada à mão. Uma
 * regex copiada envelhece igualzinho ao arquivo que ela deveria proteger.
 */

const CAMINHO = join(process.cwd(), "public", "llms.txt");
const texto = readFileSync(CAMINHO, "utf8");

/** O mesmo Titano que o arquivo usa de exemplo. */
const TITANO = {
  id: "8171616",
  marca: "Fiat",
  modelo: "Fiat Titano",
  versao: "Volcano 2.2 16V 4x4 Turbo Diesel Automático",
  tipo: "Picape",
};

describe("o llms.txt descreve a URL da ficha que o site realmente serve", () => {
  it("nenhum CAMINHO citado no arquivo termina em extensão de página", () => {
    /*
     * A condição é sobre ROTA, não sobre a grafia ".html" em qualquer lugar do
     * texto. Uma frase em prosa dizendo que o formato antigo redireciona é
     * informação útil para o modelo; o que não pode existir é um endereço
     * citado como se ainda respondesse.
     *
     * A primeira versão desta trava proibia a substring, e ela reprovou
     * exatamente a redação correta — o arquivo teve de ser escrito torto para
     * passar. Proibir a grafia deixa passar a variante e barra a mudança
     * legítima; o que vale é afirmar a condição inteira.
     */
    const caminhos = [...texto.matchAll(/`(\/[^`\s]*)`/g)].map((m) => m[1]);

    expect(caminhos.length, "o arquivo não cita nenhuma rota").toBeGreaterThan(0);
    for (const caminho of caminhos) {
      expect(caminho, `rota com extensão: ${caminho}`).not.toMatch(/\.html?$/i);
    }
  });

  it("o exemplo de PDP é exatamente o que getVeiculoPdpUrl produz", () => {
    const canonica = getVeiculoPdpUrl(TITANO);

    expect(texto).toContain(canonica);
  });

  it("o padrão da FICHA tem quatro segmentos, como a rota", () => {
    /*
     * `/carros/[marca]/[modelo]/[versao-e-id]`. O quinto segmento do formato
     * antigo repetia os três anteriores; quem resolve a ficha é o id colado no
     * fim do quarto. Ver a rota `[categoria]/[marca]/[modelo]/[ficha]`.
     *
     * Só os padrões que descrevem a FICHA entram aqui — os de marca e modelo
     * (`/carros/[marca]`, `/carros/[marca]/[modelo]`) têm 2 e 3 segmentos e
     * estão certos assim. O que os separa é o placeholder da versão.
     */
    const daFicha = (texto.match(/`\/(?:carros|motos)\/\[[^`]*`/g) ?? []).filter((p) =>
      p.includes("[versao"),
    );

    expect(daFicha.length, "o arquivo não descreve mais o padrão da ficha").toBeGreaterThan(0);
    for (const padrao of daFicha) {
      const segmentos = padrao.replace(/`/g, "").split("/").filter(Boolean);
      expect(segmentos, `padrão com ${segmentos.length} segmentos: ${padrao}`).toHaveLength(4);
    }
  });

  it("o exemplo bate com o padrão: quatro segmentos e sem extensão", () => {
    const canonica = getVeiculoPdpUrl(TITANO);

    expect(canonica.split("/").filter(Boolean)).toHaveLength(4);
    expect(canonica).not.toMatch(/\.\w+$/);
  });

  it("há uma seção própria com o que só a Motors Store afirma", () => {
    // As três frases precisam morar num bloco NOMEADO, não diluídas na
    // descrição. O arquivo é lido para ser citado de volta: um modelo que
    // procura "o que diferencia esta loja" acha uma seção, não um adjetivo
    // perdido no meio de uma frase sobre rotas.
    const secao = /##\s*O que só a Motors Store afirma\s*\n([\s\S]*?)(?=\n##\s|\s*$)/.exec(texto);

    expect(secao, "não há seção `## O que só a Motors Store afirma`").not.toBeNull();

    const corpo = secao![1];
    expect(corpo, "falta a seleção — 3 de cada 10").toMatch(/de cada dez|3 de cada 10/i);
    expect(corpo, "falta que a perícia é paga pela loja").toMatch(/perícia cautelar/i);
    expect(corpo, "falta que quem paga a perícia é a loja").toMatch(/paga pela loja/i);
    expect(corpo, "falta o laudo publicado na ficha").toMatch(/laudo/i);
  });

  it("o arquivo não usa o vocabulário que o posicionamento proíbe", () => {
    // Coluna *Evitar* de `conteudo-seo/POSICIONAMENTO.md`. "Premium" aplicado
    // a um estoque de mediana R$ 62.900 é mentira pequena, e num arquivo feito
    // para ser citado ela sai da boca do modelo como se fosse da loja.
    for (const proibido of [/\bpremium\b/i, /\bexclusivo\b/i, /melhores condições/i]) {
      expect(texto, `o llms.txt usa ${proibido}`).not.toMatch(proibido);
    }
  });
});
