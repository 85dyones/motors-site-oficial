import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regra do dono, 21/09/2026: a garantia que a Chevrolet dá à correia banhada
 * em óleo (modelos da marca a partir de 2023, 15 anos ou 240 mil quilômetros)
 * não é assunto dos guias. "Não temos por que fazer propaganda disso fora do
 * hub da marca ou dos modelos em que a garantia atua." O guia da correia
 * chegou a dizer que a cobertura da correia era a da montadora; saiu.
 *
 * A trava lê frase por frase: "Chevrolet" e "garantia" na mesma frase de um
 * guia é o sinal de que a garantia da marca voltou a aparecer fora do hub.
 *
 * E o outro lado, pedido do dono no mesmo dia: a garantia aparece no hub da
 * marca e no do Onix (e, desde 03/10, no da Tracker), com as condições na
 * mesma frase. A adesão é paga, a
 * garantia começa depois de inspeção e revisão, e só continua valendo com todas
 * as revisões seguintes feitas na concessionária. Prazo sem condição vira
 * promessa que a loja não pode cumprir, porque a garantia é da montadora.
 */
const PASTA = join(__dirname, "..", "conteudo-seo");

function textosDosGuias(): { onde: string; texto: string }[] {
  const saida: { onde: string; texto: string }[] = [];
  for (const arquivo of readdirSync(PASTA).filter((a) => /^guias?-.*\.json$/.test(a))) {
    const bruto = JSON.parse(readFileSync(join(PASTA, arquivo), "utf8"));
    const guias = Array.isArray(bruto) ? bruto : bruto.guias ?? [bruto];
    for (const g of guias) {
      const partes: string[] = [g.descricao ?? ""];
      for (const s of g.corpo ?? []) partes.push(s.titulo ?? "", ...(s.paragrafos ?? []));
      for (const f of g.faq ?? []) partes.push(f.pergunta ?? "", f.resposta ?? "");
      partes.push(g.saida?.apoio ?? "");
      for (const p of partes) saida.push({ onde: `${arquivo} › ${g.slug}`, texto: p });
    }
  }
  return saida;
}

function frasesComGarantiaDaChevrolet(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+/)
    .filter((frase) => /Chevrolet/.test(frase) && /garantia/i.test(frase));
}

describe("garantia da Chevrolet para a correia fica fora dos guias", () => {
  it("nenhuma frase de guia junta Chevrolet e garantia", () => {
    const achados = textosDosGuias().flatMap(({ onde, texto }) =>
      frasesComGarantiaDaChevrolet(texto).map((f) => `${onde}: ${f}`),
    );
    expect(achados).toEqual([]);
  });

  it("a régua pega a frase que saiu", () => {
    expect(
      frasesComGarantiaDaChevrolet(
        "Na garantia da loja, a correia é manutenção. Nos três-cilindros da Chevrolet, a cobertura da correia é a da própria marca, na campanha de garantia estendida descrita acima.",
      ),
    ).toHaveLength(1);
  });
});

describe("garantia da Chevrolet para a correia, nos hubs da marca", () => {
  // Os lotes de procura entram na mesma leitura desde 03/10/2026, quando o
  // dono decidiu que a garantia vale também no hub da Tracker.
  const hubs: { caminho: string; paragrafos: string[] }[] = [
    "textos-de-hub-humanizados.json",
    "textos-de-hub-lote-procura.json",
    "textos-de-hub-lote-procura-2.json",
    "textos-de-hub-lote-procura-3.json",
  ].flatMap((arquivo) => JSON.parse(readFileSync(join(PASTA, arquivo), "utf8")).textos);
  const frasesDoPrazo = (h: { paragrafos: string[] }) =>
    h.paragrafos
      .join(" ")
      .split(/(?<=[.!?])\s+/)
      .filter((f) => /240 mil quilômetros/.test(f));

  it("aparece no hub da marca, no do Onix e no da Tracker, e em nenhum outro", () => {
    const com = hubs.filter((h) => frasesDoPrazo(h).length > 0).map((h) => h.caminho);
    expect(com.sort()).toEqual(["/carros/chevrolet", "/carros/chevrolet/onix", "/carros/chevrolet/tracker"]);
  });

  it("a frase do prazo traz a montadora, o ano e as condições", () => {
    for (const h of hubs) {
      for (const f of frasesDoPrazo(h)) {
        expect(f, h.caminho).toMatch(/15 anos ou 240 mil quilômetros/);
        expect(f, h.caminho).toMatch(/própria Chevrolet/);
        expect(f, h.caminho).toMatch(/a partir de 2023/);
        expect(f, h.caminho).toMatch(/adesão, que é paga/);
        expect(f, h.caminho).toMatch(/inspeção/);
        expect(f, h.caminho).toMatch(/revisões seguintes forem feitas na concessionária/);
      }
    }
  });
});
