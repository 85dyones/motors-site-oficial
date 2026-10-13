import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * Cada tela que imprime cuida só do próprio papel.
 *
 * Em 08/10 a impressão do relatório da Consulta de veículos entrou com
 * `@media print { body * { visibility: hidden } }` — solto, valendo para o
 * site inteiro. Só o `[data-relatorio]` voltava a aparecer, e a página que não
 * o tem saía em branco: a ficha do veículo (o "Imprimir ficha" da PDP) e a
 * garagem do cliente. Ninguém notou por cinco dias porque nenhuma das telas
 * afetadas era a que estava sendo mexida. Medido em 13/10 imprimindo a ficha de
 * produção em PDF: zero caracteres de texto.
 *
 * Na mesma conferência apareceu o segundo defeito, mais antigo: com a folha
 * visível, ela caía na página padrão (1,5 cm de margem) e não na `ficha`
 * (margem zero). O Chromium ignora `page` num elemento com
 * `container-type: size`, e a folha precisa dele para medir em `cqw`. Os
 * 210 mm vazavam pela direita e o rodapé ia para uma segunda folha.
 *
 * As duas travas leem o CSS: o vitest roda em `node`, sem motor de impressão.
 * A prova no navegador foi feita à parte, em PDF, nas fichas de produção.
 */

const ARQUIVOS = ["src/app/globals.css", "src/app/modernist.css"];

type Regra = { arquivo: string; seletor: string; corpo: string };

/** As regras de estilo dentro de cada `@media print`, com o casamento de chaves. */
function regrasDeImpressao(arquivo: string): Regra[] {
  const css = lerCodigo(arquivo);
  const regras: Regra[] = [];
  // `only print` e `print and (...)` também abrem bloco de impressão.
  const abertura = /@media\s+(?:only\s+)?print\b[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = abertura.exec(css))) {
    let i = m.index + m[0].length;
    let inicioDoSeletor = i;
    while (i < css.length) {
      const c = css[i];
      if (c === "}") break; // fim do @media
      if (c === "{") {
        const seletor = css.slice(inicioDoSeletor, i).trim();
        let profundidade = 1;
        const inicioDoCorpo = i + 1;
        while (profundidade > 0 && ++i < css.length) {
          if (css[i] === "{") profundidade++;
          else if (css[i] === "}") profundidade--;
        }
        regras.push({ arquivo, seletor, corpo: css.slice(inicioDoCorpo, i) });
        inicioDoSeletor = i + 1;
      }
      i++;
    }
  }
  return regras;
}

const REGRAS = ARQUIVOS.flatMap(regrasDeImpressao);

/** O seletor sem os `:not(...)`, com os parênteses aninhados. */
function semNegacao(seletor: string): string {
  let saida = seletor;
  let i: number;
  while ((i = saida.indexOf(":not(")) >= 0) {
    let fim = i + ":not(".length;
    for (let profundidade = 1; fim < saida.length && profundidade > 0; fim++) {
      if (saida[fim] === "(") profundidade++;
      else if (saida[fim] === ")") profundidade--;
    }
    saida = saida.slice(0, i) + saida.slice(fim);
  }
  return saida;
}
const esconde = (corpo: string) => /visibility\s*:\s*hidden|display\s*:\s*none/.test(corpo);

describe("a impressão de uma tela não apaga a das outras", () => {
  it("a leitura enxerga as regras de impressão dos dois arquivos", () => {
    // Sem isto, um parser que parasse de achar o `@media print` deixaria as
    // travas abaixo verdes sem ler nada.
    for (const arquivo of ARQUIVOS) {
      expect(REGRAS.filter((r) => r.arquivo === arquivo).length, arquivo).toBeGreaterThan(3);
    }
    expect(REGRAS.some((r) => r.seletor.includes("#ficha-impressa"))).toBe(true);
    expect(REGRAS.some((r) => r.seletor.includes("[data-relatorio]"))).toBe(true);
  });

  it("nenhum 'esconde tudo' vale para o site inteiro", () => {
    // Um seletor que pega todo descendente (`*`) e o esconde precisa dizer em
    // que página vale — `:has(...)` da raiz que só aquela tela tem. O `:has`
    // conta antes do `*`, fora de negação (`body:not(:has(#x)) *` vale para
    // todas as outras páginas), e com id ou atributo dentro (`:root:has(body)`
    // vale para qualquer uma).
    const soltas = REGRAS.filter(
      (r) =>
        esconde(r.corpo) &&
        r.seletor.split(",").some((s) => {
          const universal = s.trim().search(/(^|[\s>])\*($|[\s:])/);
          if (universal < 0) return false;
          const escopo = semNegacao(s.trim().slice(0, universal + 1));
          return !/:has\(\s*[#[]/.test(escopo);
        }),
    );
    expect(soltas.map((r) => `${r.arquivo}: ${r.seletor}`)).toEqual([]);
  });

  it("o relatório se esconde só na página dele, sem apagar a si mesmo", () => {
    const regra = REGRAS.find(
      (r) => r.seletor.includes(":has([data-relatorio])") && /visibility\s*:\s*hidden/.test(r.corpo),
    );
    expect(regra, "a regra que esconde o resto da página do relatório sumiu").toBeDefined();
    // `:where()` zera a especificidade do `:has([data-relatorio])`. Sem ele o
    // seletor soma a do atributo (0,1,1) e vence o `[data-relatorio] *` (0,1,0)
    // que devolve o relatório: o PDF da Consulta sairia em branco.
    expect(regra!.seletor).toMatch(/:where\(\s*:has\(\[data-relatorio\]\)\s*\)/);
  });
});

describe("a folha do veículo cai na página dela", () => {
  it("a página `ficha` tem margem zero — a margem está desenhada na folha", () => {
    const css = lerCodigo("src/app/globals.css");
    expect(css).toMatch(/@page\s+ficha\s*\{[^}]*margin:\s*0\s*;/);
  });

  it("o nome da página é pedido no body, não na folha", () => {
    const naFolha = REGRAS.filter(
      (r) => r.seletor.split(",").some((s) => s.trim() === "#ficha-impressa") && /(^|[;\s])page\s*:/.test(r.corpo),
    );
    expect(naFolha, "`page` na folha: o Chromium o ignora por causa do `container-type: size`").toEqual([]);

    const noBody = REGRAS.filter(
      (r) => /(^|,)\s*body:has\(#ficha-impressa\)\s*($|,)/.test(r.seletor) && /page\s*:\s*ficha/.test(r.corpo),
    );
    expect(noBody.length).toBe(1);
  });

  it("e a folha continua sendo o contêiner das medidas em cqw", () => {
    // É ESTA a razão de o nome estar no body. Se um dia a folha deixar de ser
    // contêiner de tamanho, a trava de cima pode ser revista.
    expect(lerCodigo("src/components/modernist/FichaImpressa.tsx")).toMatch(/containerType:\s*"size"/);
  });
});
