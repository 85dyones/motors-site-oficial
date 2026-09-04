import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { lerCodigo, semComentarios } from "./fonte";
import {
  PERGUNTAS_DE_FINANCIAMENTO,
  PERGUNTAS_DE_GARANTIA,
  TEXTO_DE_FINANCIAMENTO,
} from "../src/lib/paginasInstitucionais";
import { PAGINAS_GEO } from "../src/lib/paginasGeo";

/**
 * O que o site promete em nome da loja.
 *
 * ---------------------------------------------------------------------------
 * Por que uma varredura, e não uma lista
 * ---------------------------------------------------------------------------
 * A primeira versão desta trava, em 04/09/2026, era uma lista de cinco
 * arquivos. Ela passava verde enquanto a MESMA promessa seguia em sete outras
 * superfícies públicas — e cinco delas são pares pergunta/resposta emitidos
 * como `FAQPage` no structured data, que é o formato que o Google publica no
 * resultado e o que um assistente ingere melhor. A auditoria tinha corrigido a
 * prosa e deixado o FAQ.
 *
 * Uma trava que protege a lista em vez do invariante não protege nada: basta
 * escrever a frase proibida no sexto arquivo. Por isso aqui se varre `src/`
 * inteiro, e a regra vale para todo `.ts`/`.tsx` sem exceção — hoje não há
 * nenhuma isenção, e acrescentar uma exige escrever por que ela existe.
 *
 * ---------------------------------------------------------------------------
 * O que conta como infração
 * ---------------------------------------------------------------------------
 * Não é o número: é o número **afirmado sem medição**. "Proposta em menos de
 * 10 minutos" esteve em cinco lugares e nada no sistema media esse tempo.
 * Numa página há contexto ao redor que relativiza; repetida no privado para
 * quem acabou de mandar o carro — que é o que um assistente de WhatsApp faz —
 * a frase vira compromisso cobrável.
 *
 * As regras são ancoradas no SUJEITO da promessa, não no número solto. É o que
 * separa "a avaliação leva cerca de dez minutos" (promessa da loja) de "a
 * Avenida Erasto Gaertner chega em poucos minutos" (distância, e verdade), que
 * convivem no mesmo arquivo.
 */

const raiz = join(__dirname, "..");

/** Todo `.ts`/`.tsx` sob `src/`. */
function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/** Caminho relativo com barra normal — `sep` é `\` no Windows. */
const comoNoRepo = (caminho: string) => relative(raiz, caminho).split(sep).join("/");

const QUANTO = String.raw`(\d+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|dez|quinze|vinte|poucos|poucas)`;
const LIGA = String.raw`\b(em|dentro de|leva|levam|demora|demoram|dura|duram)\s+(menos de\s+|cerca de\s+|at[ée]\s+|apenas\s+)?`;

const REGRAS: [string, RegExp][] = [
  [
    // O sujeito e o prazo na MESMA frase — `[^.;!?]` não atravessa pontuação.
    "prazo de resposta cravado",
    new RegExp(
      String.raw`(propost|respost|respond|retorn|contat|avali|an[áa]lis|analis|aprova|atend|or[çc]ament|simula|ligamos|chamamos)` +
        String.raw`[^.;!?]{0,70}` + LIGA + QUANTO + String.raw`\s+(minutos?|horas?)`,
      "i",
    ),
  ],
  [
    // Frete e prazo de entrega são "combinados caso a caso" por decisão de
    // 04/09/2026. Anexar um prazo à frase do Brasil é a forma mais provável de
    // a promessa voltar, e a guarda positiva sozinha não pega: ela casa por
    // substring e continua casando depois do acréscimo.
    "prazo de entrega cravado",
    new RegExp(
      String.raw`(entreg|frete|transport)[^.;!?]{0,60}` + LIGA + QUANTO + String.raw`\s+(minutos?|horas?|dias?|semanas?)`,
      "i",
    ),
  ],
  [
    // A mesma promessa em forma de estatística — foi por onde ela sobreviveu à
    // primeira leitura, porque não é uma frase. Casa o número RENDERIZADO
    // (`>10 min<`); `\b\d+ ?min\b` casaria também com `py-10 min-h-[...]` de
    // qualquer classe do Tailwind, e o teste morreria de causa alheia.
    "prazo renderizado como estatística",
    new RegExp(String.raw`>\s*\d+\s*(min|minutos?|h|horas?|dias?)\s*<`, "i"),
  ],
  [
    // Quem decide o prazo da análise é o banco. Ancorado em crédito para não
    // pegar "venha ver os dois no mesmo dia", que é convite ao leitor.
    "análise de crédito no mesmo dia",
    /(an[áa]lise|aprova[çc][ãa]o|cr[ée]dito)[^.;!?]{0,60}no mesmo dia|no mesmo dia[^.;!?]{0,60}(an[áa]lise|aprova[çc][ãa]o|cr[ée]dito)/i,
  ],
  [
    // Proibido pela regulação de publicidade de crédito (§1.4b do plano).
    "aprovação prometida",
    /aprova[çc][ãa]o\s+(garantid|cert[ao]|imediat|na hora)|cr[ée]dito\s+garantid/i,
  ],
  ["superlativo sobre o que a loja não controla", /melhores?\s+(taxas?|condi[çc][õo]es|pre[çc]os?)/i],
  ["promessa absoluta de processo", /sem\s+burocracia/i],
  [
    // O posicionamento fala de SELEÇÃO, não de faixa de preço — e a vitrine
    // desmente a frase sozinha: vai de R$ 23.900 a R$ 318.900.
    "faixa de preço como posicionamento",
    /alt[íi]ssimo\s+padr[ãa]o|alto\s*[- ]?\s*padr[ãa]o|\bde\s+luxo\b/i,
  ],
];

describe("nenhum arquivo de src/ promete o que ninguém mede", () => {
  const arquivos = arquivosDeCodigo(join(raiz, "src"));

  it("a varredura está de fato lendo o repositório", () => {
    // Uma varredura que não acha arquivo passa em tudo, calada. Foi o modo de
    // falha de `fonte.ts` com `accept="image/*"`, e vale igual aqui.
    expect(arquivos.length).toBeGreaterThan(150);
    expect(arquivos.map(comoNoRepo)).toContain("src/lib/paginasGeo.ts");
    expect(arquivos.map(comoNoRepo)).toContain("src/app/page.tsx");
  });

  it.each(REGRAS)("nenhum arquivo tem %s", (_nome, regra) => {
    const infratores = arquivos
      .map((caminho) => ({ caminho, codigo: semComentarios(readFileSync(caminho, "utf8")) }))
      .filter(({ codigo }) => regra.test(codigo))
      .map(({ caminho, codigo }) => {
        const achado = codigo.match(regra);
        const linha = codigo.slice(0, achado?.index ?? 0).split("\n").length;
        return `${comoNoRepo(caminho)}:${linha} — ${codigo.split("\n")[linha - 1].trim().slice(0, 90)}`;
      });

    expect(infratores).toEqual([]);
  });
});

describe("o que entrou no lugar da promessa", () => {
  /**
   * Guardas positivas. Apagar a promessa e não pôr nada no lugar deixa a
   * seção sem próximo passo, e só as regras acima passariam igual — foi assim
   * que uma mutação sobreviveu à rodada da vitrine.
   */
  it("as três superfícies da avaliação dizem por onde a proposta chega", () => {
    for (const arquivo of [
      "src/app/page.tsx",
      "src/app/avaliacao/page.tsx",
      "src/components/AutoAvaliacao.tsx",
      "src/lib/compartilhamento.ts",
    ]) {
      expect(lerCodigo(arquivo)).toMatch(/consultor retorna no WhatsApp/);
    }
  });

  it("a estatística da home voltou a ser número, e é um número que a loja tem", () => {
    // `WHATSAPP` cabia, mas quebrava o desenho: o rótulo de 20 caracteres
    // passava para duas linhas entre 383 e 393px — onde estão o iPhone 12-15
    // (390) e o Pixel (393) — e abaixo de 382 a palavra indivisível travava o
    // min-content da coluna e tirava a régua central do meio. O slot foi
    // desenhado para número: os irmãos são `100%`, `FIPE` e `3`.
    const home = lerCodigo("src/app/page.tsx");

    expect(home).toMatch(/>3 EM 10</);
    expect(home).toMatch(/APROVADOS/);
    // O número é o mesmo de `aboutSettings.historyP1`, não um inventado aqui.
    expect(home).not.toMatch(/>WHATSAPP</);
  });

  it("a FIPE aparece como referência, nunca como valor de compra", () => {
    // `BASE DE AVALIAÇÃO` ao lado de um número lê como proposta. A regra 4 do
    // CLAUDE.md é que o cliente NUNCA vê valor de compra no site — quem
    // informa é o consultor, depois da vistoria. Esta correção tinha ficado
    // sem teste nenhum na primeira rodada.
    const sobre = lerCodigo("src/components/SobreClientWrapper.tsx");

    expect(sobre).toMatch(/rotulo: "REFERÊNCIA DE MERCADO"/);
    expect(sobre).not.toMatch(/BASE DE AVALIAÇÃO/);
  });

  it("a meta de /sobre fala de seleção, não de faixa de preço", () => {
    for (const arquivo of ["src/app/sobre/page.tsx", "src/lib/compartilhamento.ts"]) {
      expect(lerCodigo(arquivo)).toMatch(/três de cada dez carros avaliados/);
    }
  });

  it("o financiamento diz quem conduz a análise", () => {
    expect(lerCodigo("src/app/financiamento/page.tsx")).toMatch(/conduzida por consultor/);
  });
});

describe("uma pergunta, uma resposta", () => {
  /**
   * "Atende quem é de fora?" é feita em dois lugares públicos: no FAQ da
   * garantia e no FAQ das páginas de bairro. Até 04/09/2026 elas discordavam —
   * uma dizia "fora do estado", a outra limitava à Região Metropolitana com
   * Paraná e Santa Catarina só "para veículos de ticket mais alto". Duas
   * respostas públicas para a mesma pergunta é como o cliente descobre no
   * balcão que uma delas não vale.
   *
   * O alcance real, decidido pelo dono em 04/09/2026: entrega para todo o
   * Brasil. O que é regional é a MÍDIA, não o serviço.
   */
  const ALCANCE = /entregamos para todo o Brasil/i;

  it("o FAQ da garantia diz o alcance real", () => {
    const resposta = PERGUNTAS_DE_GARANTIA.find((p) => /outra cidade/i.test(p.pergunta))?.resposta;
    expect(resposta).toMatch(ALCANCE);
    // E continua nomeando a Região Metropolitana: quem mora em Pinhais não se
    // reconhece em "de fora".
    expect(resposta).toMatch(/Região Metropolitana/);
  });

  it("o FAQ das páginas de bairro dá a MESMA resposta", () => {
    const perguntas = PAGINAS_GEO.flatMap((p) => p.faq);
    const deFora = perguntas.filter((p) => /fora de Curitiba/i.test(p.pergunta));

    expect(deFora.length).toBeGreaterThan(0);
    for (const p of deFora) {
      expect(p.resposta).toMatch(ALCANCE);
      // O que sumiu: o alcance condicionado ao preço do carro.
      expect(p.resposta).not.toMatch(/ticket mais alto/i);
    }
  });

  it("nenhuma das duas promete prazo de entrega", () => {
    // A logística é "combinada caso a caso" — é o que sustenta a promessa de
    // alcance sem virar promessa de frete.
    const tudo = [
      ...PERGUNTAS_DE_GARANTIA.map((p) => p.resposta),
      ...PAGINAS_GEO.flatMap((p) => p.faq.map((q) => q.resposta)),
    ].join(" ");

    expect(tudo).toMatch(/combinada caso a caso/i);
    expect(tudo).not.toMatch(/em at[ée] \d+ dias?/i);
  });
});

describe("a meta description cabe nos 155 que a casa documenta", () => {
  /**
   * A régua está em `conteudo-seo/rascunhos.json` (campo `_leia`) e em
   * `tests/descricao-seo.test.ts`. Nenhum teste cobria o comprimento das metas
   * das páginas institucionais, e a reescrita de 04/09 empurrou a de /sobre
   * para 163 — o corte caía no meio de "avaliados", justamente onde estava o
   * diferencial.
   */
  const LIMITE = 155;

  const metas: [string, RegExp][] = [
    ["src/app/sobre/page.tsx", /const DESCRICAO =\s*\r?\n?\s*"([^"]+)"/],
    ["src/app/avaliacao/page.tsx", /const DESCRICAO =\s*\r?\n?\s*"([^"]+)"/],
  ];

  it.each(metas)("%s", (arquivo, regra) => {
    const achado = lerCodigo(arquivo).match(regra);
    expect(achado).not.toBeNull();
    expect(achado![1].length).toBeLessThanOrEqual(LIMITE);
  });

  it("src/app/financiamento/page.tsx", () => {
    const achado = lerCodigo("src/app/financiamento/page.tsx").match(
      /description:\s*\r?\n?\s*"([^"]+)"\s*\+\s*\r?\n?\s*"([^"]+)"/,
    );
    expect(achado).not.toBeNull();
    expect((achado![1] + achado![2]).length).toBeLessThanOrEqual(LIMITE);
  });

  it("a prosa de /financiamento continua dizendo que não promete aprovação", () => {
    // Guarda positiva do par: encurtar a meta não pode custar o aviso que a
    // regulação exige, que vive na prosa.
    expect(TEXTO_DE_FINANCIAMENTO.join(" ")).toMatch(/não faz é prometer aprovação/i);
    expect(PERGUNTAS_DE_FINANCIAMENTO.map((p) => p.resposta).join(" ")).toMatch(/depende do banco/i);
  });
});
