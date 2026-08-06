import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda de veracidade da matriz de especificações da ficha do veículo.
 *
 * Por que este teste existe:
 *
 * A régua de especificações da PDP é lida pelo cliente como ficha técnica do
 * carro. Até 2026-08-06 duas das suas linhas não vinham de dado nenhum: eram
 * inferidas do NOME DO MODELO por uma cadeia de `includes()`.
 *
 *   TRAÇÃO   "Integral (4x4 / AWD)" para sete modelos, "Traseira (RWD)" para a
 *            família 911, e "Dianteira (FWD)" para TODO O RESTO — Amarok, S10 e
 *            Compass 4x4 anunciados como tração dianteira.
 *   LUGARES  mesmo desenho, com "5 Lugares" de fallback.
 *
 * Medido contra produção no mesmo dia: `estoque_motors` tem 28 colunas em 88
 * veículos e nenhuma de tração, lugares, portas ou assentos; o sync do n8n
 * consome 21 campos do XML do RevendaMais e nenhum traz essa informação. Sem
 * fonte, as linhas saíram da régua — é a mesma decisão do commit fdd9785, que
 * tirou os defaults inventados de `opcionais`, `laudo_pericia` e `combustivel`.
 *
 * O teste é de varredura de fonte, não de render: a suíte roda em `environment:
 * "node"` e o projeto ainda não tem jsdom (vitest.config.ts:14). Isso cobre o
 * jeito como o bug nasceu — alguém acrescentar uma linha à matriz com valor
 * literal ou derivado do modelo — e não todo caminho possível até a tela.
 */

const FICHA = join(
  __dirname,
  "..",
  "src",
  "components",
  "PDPClientWrapper.tsx"
);

/**
 * Fonte sem as linhas de comentário.
 *
 * O comentário que documenta a remoção cita os valores inventados textualmente
 * — é o registro do que não pode voltar. Varrer o arquivo cru faria a própria
 * explicação disparar o teste que ela explica. Só linhas inteiras de comentário
 * são descartadas: recortar `//` no meio da linha comeria o `http://www.w3.org`
 * dos SVGs inline.
 */
const fonte = readFileSync(FICHA, "utf8")
  .split("\n")
  .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
  .join("\n");

/** Corpo do literal `const quickSpecs = [ ... ];`. */
function matrizDeEspecificacoes(): string {
  const inicio = fonte.indexOf("const quickSpecs = [");
  if (inicio < 0) throw new Error("`quickSpecs` não encontrado na ficha.");
  const corpo = fonte.slice(inicio);
  const fim = corpo.search(/^\s*\];/m);
  if (fim < 0) throw new Error("Fim de `quickSpecs` não encontrado.");
  return corpo.slice(0, fim);
}

/** Rótulos das linhas da régua, na ordem em que aparecem. */
function rotulos(): string[] {
  return [...matrizDeEspecificacoes().matchAll(/label:\s*"([^"]+)"/g)].map(
    (m) => m[1]
  );
}

describe("matriz de especificações da ficha do veículo", () => {
  it("o parser achou a matriz — a varredura não passa por vacuidade", () => {
    // Contraprova: renomear `quickSpecs` ou quebrar a regex faria todos os
    // testes abaixo passarem em silêncio, sobre uma lista vazia.
    expect(rotulos().length).toBeGreaterThan(3);
  });

  it("não anuncia TRAÇÃO nem LUGARES — o feed não traz esse dado", () => {
    const inventados = rotulos().filter(
      (r) => r.includes("TRAÇÃO") || r.includes("LUGARES")
    );

    expect(
      inventados,
      "A régua voltou a exibir tração ou número de lugares.\n" +
        "`estoque_motors` não tem coluna para nenhum dos dois (verificado em\n" +
        "produção, 2026-08-06), então o valor só pode estar sendo adivinhado a\n" +
        "partir do modelo. Se o feed passou a trazer o dado, a linha volta\n" +
        "lendo `veiculo.*` e sai da régua quando vier vazia — e este teste é\n" +
        "atualizado junto, com a coluna nomeada."
    ).toEqual([]);
  });

  it("nenhum palpite de tração ou lugares sobrou no arquivo", () => {
    // As funções saíram, mas o texto poderia reaparecer em outro ponto da
    // ficha (schema.org, meta description, aba de detalhes).
    const PALPITES = [
      "Dianteira (FWD)",
      "Traseira (RWD)",
      "Integral (4x4",
      "5 Lugares",
      "2 ou 4 Lugares",
      "5 a 7 Lugares",
    ];

    const presentes = PALPITES.filter((p) => fonte.includes(p));
    expect(
      presentes,
      `Valor de ficha técnica inferido do nome do modelo de volta na PDP: ${presentes.join(", ")}`
    ).toEqual([]);
  });

  it("a régua continua exibindo os campos que vêm do feed", () => {
    // Contraprova do teste acima: esvaziar a matriz inteira "resolveria" o
    // problema de veracidade e destruiria a ficha dos carros com dado real.
    const rotulosAtuais = rotulos();
    for (const esperado of ["CÂMBIO", "QUILOMETRAGEM", "COMBUSTÍVEL", "COR EXTERNA"]) {
      expect(rotulosAtuais, `A régua perdeu a linha ${esperado}`).toContain(esperado);
    }
  });

  it("os valores da régua saem do objeto do veículo, não de `includes()` no modelo", () => {
    // A inferência antiga tinha uma assinatura reconhecível: cadeia de
    // `modelo.includes("hilux") || ...` devolvendo string de ficha técnica.
    const matriz = matrizDeEspecificacoes();
    expect(matriz).not.toMatch(/modelo[\s\S]{0,40}\.includes\(/);
    expect(matriz.includes("veiculo.")).toBe(true);
  });
});
