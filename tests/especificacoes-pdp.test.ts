import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardas dos blocos de especificação da ficha do veículo.
 *
 * Duas regras diferentes vivem aqui porque incidem sobre o mesmo literal
 * (`quickSpecs`, a régua da barra lateral da PDP) e quebrariam uma à outra se
 * fossem varridas por parsers independentes:
 *
 *   1. VERACIDADE — nenhuma linha da régua pode ser adivinhada. Até 2026-08-06
 *      TRAÇÃO e LUGARES eram inferidas do NOME DO MODELO por cadeia de
 *      `includes()` e exibidas ao cliente como ficha técnica: "Dianteira (FWD)"
 *      para TODO O RESTO da lista — Amarok, S10 e Compass 4x4 anunciados como
 *      tração dianteira. `estoque_motors` tem 28 colunas em 88 veículos e
 *      nenhuma de tração, lugares, portas ou assentos; o sync do n8n consome 21
 *      campos do XML do RevendaMais e nenhum traz essa informação. Sem fonte, a
 *      linha sai da régua. Afirmar tração errada sobre um veículo é afirmação
 *      falsa sobre o produto — CDC art. 37.
 *
 *   2. RÓTULO SEM VALOR — nenhuma célula pode aparecer com o rótulo sobre um
 *      espaço em branco. Desde o commit fdd9785 o mapper não inventa mais
 *      default: `cambio`, `combustivel` e `cor` chegam à UI como string vazia
 *      quando o feed não traz o campo. Isso é deliberado — o default anterior
 *      afirmava "Flex" sobre veículo elétrico — mas transfere para cada ponto
 *      de exibição a obrigação de não renderizar a célula. `combustivel` está
 *      ausente em 19 dos 88 veículos em produção.
 *
 * As duas são a mesma decisão vista de dois lados: o site não afirma o que não
 * sabe. Três blocos exibem esses campos hoje — a matriz de especificações e a
 * régua rápida, ambas na ficha, e a régua da vitrine da TV.
 *
 * Alcance, sem exagero: isto varre código-fonte, não renderiza React. O runner
 * roda em `environment: "node"` sem jsdom (vitest.config.ts), e os blocos vivem
 * dentro de componentes clientes grandes cujo render exigiria jsdom, plugin
 * React e um `Veiculo` completo. O que se prova é que as guardas continuam no
 * código, escritas sobre o campo certo — não o pixel na tela. Se um quarto
 * bloco de especificações nascer, ele não entra aqui sozinho.
 */

const RAIZ_SRC = join(__dirname, "..", "src");
const PDP = join(RAIZ_SRC, "components", "PDPClientWrapper.tsx");
const VITRINE_TV = join(RAIZ_SRC, "components", "modernist", "VitrineTV.tsx");
const SUPABASE = join(RAIZ_SRC, "lib", "supabase.ts");

const pdp = readFileSync(PDP, "utf8");
const vitrineTV = readFileSync(VITRINE_TV, "utf8");
const supabase = readFileSync(SUPABASE, "utf8");

/**
 * A ficha sem as linhas inteiras de comentário.
 *
 * O comentário que documenta a remoção de TRAÇÃO e LUGARES cita os valores
 * inventados textualmente — é o registro do que não pode voltar. Varrer o
 * arquivo cru faria a própria explicação disparar o teste que ela explica. Só
 * linhas inteiras de comentário são descartadas: recortar `//` no meio da linha
 * comeria o `http://www.w3.org` dos SVGs inline.
 */
const pdpSemComentarios = pdp
  .split("\n")
  .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
  .join("\n");

/** Campos que o mapper pode devolver vazios — a premissa da regra 2. */
const CAMPOS_SEM_DEFAULT = ["cambio", "combustivel", "cor"] as const;

/**
 * Recorta o literal `const quickSpecs = [ ... ].filter(...);` em duas partes.
 *
 * O array fecha em `]` na indentação de dentro do componente (dois espaços);
 * nenhuma linha do corpo fecha nessa coluna, e não há `;` dentro dele. O que
 * vem entre esse `]` e o `;` é o `encadeado` — hoje o `.filter()` da regra 2.
 *
 * Recebe a fonte como parâmetro porque a regra 1 precisa varrer a versão sem
 * comentários e a regra 2 precisa da versão crua (o comentário do filtro fica
 * dentro do próprio literal).
 */
function reguaDaFicha(fonte: string): { corpo: string; encadeado: string } {
  const inicio = fonte.indexOf("const quickSpecs = [");
  if (inicio < 0) throw new Error("Array `quickSpecs` não encontrado na PDP.");

  const fecha = fonte.indexOf("\n  ]", inicio);
  if (fecha < 0) throw new Error("Fim do array `quickSpecs` não encontrado.");

  const pontoEVirgula = fonte.indexOf(";", fecha);
  return {
    corpo: fonte.slice(inicio, fecha),
    encadeado: fonte.slice(fecha, pontoEVirgula),
  };
}

/** Rótulos das células da régua, na ordem em que aparecem. */
function rotulos(): string[] {
  const { corpo } = reguaDaFicha(pdpSemComentarios);
  return [...corpo.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("régua da ficha: nenhuma especificação adivinhada", () => {
  it("o parser achou a régua — a varredura não passa por vacuidade", () => {
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

    const presentes = PALPITES.filter((p) => pdpSemComentarios.includes(p));
    expect(
      presentes,
      `Valor de ficha técnica inferido do nome do modelo de volta na PDP: ${presentes.join(", ")}`
    ).toEqual([]);
  });

  it("os valores saem do objeto do veículo, não de `includes()` no modelo", () => {
    // A inferência antiga tinha uma assinatura reconhecível: cadeia de
    // `modelo.includes("hilux") || ...` devolvendo string de ficha técnica.
    const { corpo } = reguaDaFicha(pdpSemComentarios);
    expect(corpo).not.toMatch(/modelo[\s\S]{0,40}\.includes\(/);
    expect(corpo.includes("veiculo.")).toBe(true);
  });
});

describe("blocos de especificação não exibem rótulo sem valor", () => {
  const regua = reguaDaFicha(pdp);

  it("o mapper de fato devolve vazio nesses campos — a premissa segue válida", () => {
    // Contraprova da razão de existir de todo o resto. Se alguém reintroduzir
    // um default no mapper, este teste falha primeiro e obriga a reler a
    // decisão de fdd9785 (afirmar "Flex" sobre elétrico) antes de concluir
    // que os filtros abaixo viraram supérfluos.
    for (const campo of CAMPOS_SEM_DEFAULT) {
      expect(
        supabase,
        `O mapper deveria devolver "" em \`${campo}\` quando o feed não traz o campo.`
      ).toMatch(new RegExp(`${campo}:\\s*dbItem\\.${campo}[^,]*:\\s*""`));
    }
  });

  it("a varredura encontrou a régua da ficha — não passa por vacuidade", () => {
    // Sanidade: se o recorte do array quebrar, os testes seguintes olhariam
    // string vazia e passariam calados.
    expect(regua.corpo).toContain('label: "CÂMBIO"');
    expect(regua.corpo).toContain('label: "COMBUSTÍVEL"');
    expect(regua.corpo).toContain('label: "COR EXTERNA"');
  });

  it("a régua da ficha filtra célula de valor vazio", () => {
    // O filtro tem que estar encadeado no próprio literal: é o array já
    // filtrado que chega ao `.map()` do render.
    expect(
      regua.encadeado,
      "Sem filtro, veículo sem `combustivel` no feed (19 dos 88 em produção)\n" +
        "exibe o rótulo COMBUSTÍVEL sobre um valor em branco na régua da barra\n" +
        "lateral da PDP."
    ).toMatch(/\]\s*\.filter\(/);

    // E tem que testar o valor, não outra coisa: `.filter(() => true)` ou um
    // filtro sobre o rótulo passariam no teste acima.
    expect(regua.encadeado).toMatch(/(\w+)\.value\s*&&\s*\1\.value\.trim\(\)\s*!==\s*""/);
  });

  it("a régua da ficha renderiza o array filtrado, e não uma cópia crua", () => {
    // O filtro só vale se for esse array que vai para a tela.
    expect(pdp).toMatch(/\{quickSpecs\.map\(/);
    // Um `const quickSpecsBrutos = quickSpecs` reintroduziria o bug com o
    // filtro intacto: só pode existir uma origem para essa régua.
    expect(pdp.match(/const quickSpecs\b/g)).toHaveLength(1);
  });

  it("a matriz de especificações continua ocultando a linha sem dado", () => {
    // A matriz resolve o mesmo problema por outro mecanismo: guarda no JSX,
    // uma por linha. Foi o que fdd9785 acertou; travar aqui impede a volta.
    for (const campo of CAMPOS_SEM_DEFAULT) {
      expect(
        pdp,
        `A linha de \`${campo}\` na matriz precisa da guarda \`{veiculo.${campo} && (\`.`
      ).toContain(`{veiculo.${campo} && (`);
    }
  });

  it("a régua da vitrine da TV continua filtrando coluna vazia", () => {
    // Mesma regra, terceiro bloco. Aqui o valor é `valor` e não `value`.
    expect(vitrineTV).toMatch(/\]\s*\.filter\(/);
    expect(vitrineTV).toMatch(/(\w+)\.valor\s*&&\s*\1\.valor\.trim\(\)\s*!==\s*""/);
  });
});
