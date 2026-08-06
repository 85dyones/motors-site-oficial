import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda de "rótulo sem valor" nos blocos de especificação.
 *
 * Por que este teste existe:
 *
 * Desde 2026-08-06 o mapper não inventa mais default (commit fdd9785): quando
 * o feed do RevendaMais não traz o campo, `cambio`, `combustivel` e `cor`
 * chegam à UI como string vazia. Isso é deliberado — o default anterior
 * afirmava "Flex" sobre veículo elétrico. Mas transfere para cada ponto de
 * exibição a obrigação de não renderizar a célula.
 *
 * Três blocos exibem esses campos hoje: a matriz de especificações e a régua
 * de especificações rápidas, ambas na ficha do veículo, e a régua da vitrine
 * da TV. O commit que removeu os defaults acertou a matriz e esqueceu a régua
 * da ficha — e o esquecimento não quebra build, não quebra lint e não aparece
 * em teste: vira um rótulo "COMBUSTÍVEL" sobre espaço em branco em 19 dos 88
 * veículos, visível só para quem abrir a PDP de um desses. Corrigido em
 * 2026-08-06.
 *
 * Alcance, sem exagero: este teste varre o código-fonte, não renderiza React.
 * O runner roda em ambiente `node` sem jsdom (ver vitest.config.ts), e os três
 * blocos vivem dentro de componentes clientes grandes cujo render exigiria
 * jsdom, plugin React e um `Veiculo` completo. O que ele prova é que o filtro
 * continua no código, escrito sobre o campo certo — não o pixel na tela. Se um
 * quarto bloco de especificações nascer, ele não entra aqui sozinho.
 */

const RAIZ_SRC = join(__dirname, "..", "src");
const PDP = join(RAIZ_SRC, "components", "PDPClientWrapper.tsx");
const VITRINE_TV = join(RAIZ_SRC, "components", "modernist", "VitrineTV.tsx");
const SUPABASE = join(RAIZ_SRC, "lib", "supabase.ts");

const pdp = readFileSync(PDP, "utf8");
const vitrineTV = readFileSync(VITRINE_TV, "utf8");
const supabase = readFileSync(SUPABASE, "utf8");

/** Campos que o mapper pode devolver vazios — a premissa de tudo aqui. */
const CAMPOS_SEM_DEFAULT = ["cambio", "combustivel", "cor"] as const;

/**
 * Corpo do array `quickSpecs` e o que vem encadeado depois dele.
 *
 * O array fecha em `]` na indentação de dentro do componente (dois espaços);
 * nenhuma linha do corpo fecha nessa coluna, e não há `;` dentro dele.
 */
function reguaDaFicha(): { corpo: string; encadeado: string } {
  const inicio = pdp.indexOf("const quickSpecs = [");
  if (inicio < 0) throw new Error("Array `quickSpecs` não encontrado na PDP.");

  const fecha = pdp.indexOf("\n  ]", inicio);
  if (fecha < 0) throw new Error("Fim do array `quickSpecs` não encontrado.");

  const pontoEVirgula = pdp.indexOf(";", fecha);
  return {
    corpo: pdp.slice(inicio, fecha),
    encadeado: pdp.slice(fecha, pontoEVirgula),
  };
}

describe("blocos de especificação não exibem rótulo sem valor", () => {
  const regua = reguaDaFicha();

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
