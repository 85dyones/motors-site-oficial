import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { campanhaPorSlug, campanhaEstaViva } from "../src/lib/campanhas";
import { lerCodigo } from "./fonte";

const SLUG = "pole-position-2026";
const PAGINA = `src/app/(campanha)/${SLUG}/page.tsx`;

describe("a campanha está registrada", () => {
  it("existe, com as datas do folder", () => {
    const c = campanhaPorSlug(SLUG);
    expect(c).toBeDefined();
    expect(c!.nome).toBe("Pole Position");
    expect(c!.inicio).toBe("2026-09-12");
    expect(c!.fim).toBe("2026-09-20");
  });

  it("vive de 12 a 20 e morre em 21", () => {
    const c = campanhaPorSlug(SLUG)!;
    expect(campanhaEstaViva(c, new Date("2026-09-12T08:00:00-03:00"))).toBe(true);
    expect(campanhaEstaViva(c, new Date("2026-09-20T22:00:00-03:00"))).toBe(true);
    expect(campanhaEstaViva(c, new Date("2026-09-21T08:00:00-03:00"))).toBe(false);
  });
});

describe("a página", () => {
  const codigo = () => lerCodigo(PAGINA);

  it("declara canonical próprio — senão herda o do layout raiz, que não tem", () => {
    expect(codigo()).toMatch(/canonical/);
  });

  it("declara card de compartilhamento com arte própria", () => {
    expect(codigo()).toMatch(/montarCompartilhamento/);
    expect(codigo()).toMatch(/imagemPreferida/);
  });

  /*
   * `robots.ts` bloqueia `/api/`. Um og:image servido dali responde 200 no
   * navegador e chega SEM IMAGEM no WhatsApp — que é justamente por onde a
   * campanha circula.
   */
  it("a imagem do card não fica sob /api/", () => {
    const caminhos = codigo().match(/["'](\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi) ?? [];
    expect(caminhos.length).toBeGreaterThan(0);
    for (const caminho of caminhos) {
      expect(caminho).not.toMatch(/\/api\//);
    }
  });

  it("as artes que ela referencia existem mesmo em public/", () => {
    const caminhos = [...codigo().matchAll(/["'](\/campanhas\/[^"']+)["']/g)].map((m) => m[1]);
    expect(caminhos.length).toBeGreaterThan(0);
    for (const rel of caminhos) {
      const arquivo = path.join(process.cwd(), "public", ...rel.split("/").filter(Boolean));
      expect(fs.existsSync(arquivo), `arte ausente: ${rel}`).toBe(true);
    }
  });

  it("redireciona quando a data vence, e SÓ então", () => {
    expect(codigo()).toMatch(/permanentRedirect/);
    /*
     * `campanhaAcabou`, e não `!campanhaEstaViva`: a segunda forma mandava 308
     * PERMANENTE também antes do início, e o navegador guarda 308 para sempre
     * — quem abrisse o link na véspera não veria a LP nem durante o feirão.
     */
    expect(codigo()).toMatch(/campanhaAcabou/);
    expect(codigo()).not.toMatch(/!campanhaEstaViva/);
  });

  it("revalida rápido — o 308 só entra na revalidação", () => {
    expect(codigo()).toMatch(/export const revalidate = 300/);
  });

  it("usa o CTA de campanha, e não um link solto para o WhatsApp", () => {
    expect(codigo()).toMatch(/CtaDeCampanha/);
    expect(codigo()).not.toMatch(/href=["']https:\/\/(wa\.me|api\.whatsapp)/);
  });

  /*
   * O script anti-flicker do layout raiz troca os tokens `--brand-*` conforme
   * o tema salvo no navegador. A LP tem paleta própria, amostrada da arte do
   * folder — usar token faria a campanha aparecer em dourado para quem tem
   * `stealth-dark` salvo.
   */
  it("não usa os tokens de tema, que o visitante controla", () => {
    expect(codigo()).not.toMatch(/--brand-|bg-brand-|text-brand-/);
  });

  it("o endereço vem das configurações, e não escrito na página", () => {
    expect(codigo()).toMatch(/getCachedSettings/);
    expect(codigo()).not.toMatch(/Piazzetta/);
  });
});

describe("o conteúdo é o do folder, com as ressalvas", () => {
  const codigo = () => lerCodigo(PAGINA);

  it("traz a chamada", () => {
    expect(codigo()).toMatch(/largada para grandes oportunidades/i);
  });

  /*
   * Cobra a AFIRMAÇÃO de cada um dos seis, não a grafia do título. O item 3
   * teve o título reescrito para tirar o prazo de um campo `titulo` — exigido
   * pela trava `promessa-publica` —, e um teste preso à grafia reprovaria essa
   * mudança legítima enquanto deixaria passar a perda do argumento inteiro.
   */
  it("traz os seis argumentos do folder", () => {
    const texto = codigo();
    for (const [rotulo, marca] of [
      ["lives", /ofertas rel[âa]mpago/i],
      ["seleção", /escolhido e avaliado criteriosamente/i],
      ["120 dias", /at[ée] 120 dias para come[çc]ar a pagar/i],
      ["transferência", /transfer[êe]ncia fica por nossa conta/i],
      ["garantia", /garantia\s+["+\s]*Motors Store/i],
      ["perícia", /per[íi]cia cautelar independente/i],
    ] as const) {
      expect(marca.test(texto), `faltou o argumento: ${rotulo}`).toBe(true);
    }
  });

  /*
   * `coerencia-da-pericia` já varre `src/` inteiro e pegaria isto — mas só na
   * suíte cheia. Aqui a falha aparece já ao rodar o teste da própria LP.
   */
  it("promete o laudo COM a condição de aprovação", () => {
    const texto = codigo();
    expect(texto).toMatch(/laudo/i);
    expect(texto).toMatch(/assim que aprovada/i);
  });

  it("não põe prazo em campo de título — quem decide o prazo é o banco", () => {
    expect(codigo()).not.toMatch(/titulo:\s*["'][^"']{0,24}\b\d+\s*(min|minutos?|horas?|dias?)\b/i);
  });

  it("o bônus vem com o 'podem chegar a', e não como promessa", () => {
    const texto = codigo();
    expect(texto).toMatch(/R\$ 10 mil/);
    expect(texto).toMatch(/podem chegar a/i);
  });

  it("os 120 dias vêm com a condicional do financiamento", () => {
    expect(codigo()).toMatch(/conforme as condições de financiamento/i);
  });

  it("transferência e tanque vêm com 'em veículos selecionados'", () => {
    expect(codigo()).toMatch(/[Ee]m veículos selecionados/);
  });

  /*
   * Regra 5 do CLAUDE.md: comunicação pública de recompra é proibida antes de
   * parecer jurídico e provisionamento. O folder não menciona; a LP também não.
   */
  it("não menciona recompra nem percentual de FIPE", () => {
    expect(codigo().toLowerCase()).not.toMatch(/recompra|fipe/);
  });

  /*
   * POSICIONAMENTO.md: 90 dias é o mínimo legal de PJ e não se vende como
   * diferencial. A garantia é afirmada; o diferencial fica na perícia.
   */
  it("não vende o prazo de garantia como diferencial", () => {
    const texto = codigo().toLowerCase();
    expect(texto).not.toMatch(/(3|três|90)\s*(meses|dias)\s*de\s*garantia/);
    expect(texto).not.toMatch(/garantia\s+exclusiva/);
  });

  it("não promete preço nem desconto que a loja não fixou", () => {
    expect(codigo().toLowerCase()).not.toMatch(/abaixo da tabela|menor preço|imperdível/);
  });
});
