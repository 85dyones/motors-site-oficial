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
 * superfícies públicas — cinco delas pares pergunta/resposta emitidos como
 * `FAQPage` no structured data, que é o formato que o Google publica no
 * resultado e o que um assistente ingere melhor. A auditoria tinha corrigido a
 * prosa e deixado o FAQ.
 *
 * A segunda versão varria `src/` e dizia, no comentário, "sem nenhuma
 * isenção". Tinha uma, não declarada: filtrava `.tsx?`. Os dois `.json` de
 * `src/lib` são o maior depósito de prosa pública do diretório, e um deles
 * publicava duas das frases que este arquivo proíbe.
 *
 * A lição, as duas vezes, é a mesma: uma trava que protege a LISTA em vez do
 * invariante não protege nada — basta escrever a frase no arquivo seguinte.
 *
 * ---------------------------------------------------------------------------
 * O que conta como infração
 * ---------------------------------------------------------------------------
 * Não é o número: é o número **afirmado sem medição**. "Proposta em menos de
 * 10 minutos" esteve em doze lugares e nada no sistema media esse tempo. Numa
 * página há contexto ao redor que relativiza; repetida no privado para quem
 * acabou de mandar o carro — que é o que um assistente de WhatsApp faz — a
 * frase vira compromisso cobrável.
 *
 * As regras são ancoradas no SUJEITO da promessa, não no número solto. É o que
 * separa "a avaliação leva cerca de dez minutos" (promessa da loja) de "a
 * Avenida Erasto Gaertner chega em poucos minutos" (distância, e verdade), que
 * convivem no mesmo arquivo.
 */

const raiz = join(__dirname, "..");

/**
 * O que é texto de cliente e o que é ferramenta de quem trabalha aqui.
 *
 * Um seletor de período do relatório do funil ("30 dias") e um prazo de etapa
 * em minutos são decisão de projeto, não promessa — e ficariam vermelhos num
 * teste chamado "nenhuma superfície pública promete prazo". `src/lib/ciclo`
 * IMPLEMENTA a recompra, que a regra 5 proíbe COMUNICAR.
 *
 * A isenção é por natureza da superfície, não por conveniência: nada aqui é
 * servido a cliente. Se um dia for, sai da lista.
 */
const INTERNOS = [
  "src/app/admin/",
  "src/components/admin/",
  "src/app/api/",
  "src/lib/ciclo/",
];

/** Todo `.ts`, `.tsx` e `.json` sob `src/`. O `.json` faltava até 04/09. */
function arquivosDeTexto(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeTexto(caminho, achados);
    else if (/\.(tsx?|json)$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/** Caminho relativo com barra normal — `sep` é `\` no Windows. */
const comoNoRepo = (caminho: string) => relative(raiz, caminho).split(sep).join("/");

/**
 * O texto como o leitor o recebe.
 *
 * Desconta comentários e **junta literais concatenados**. A segunda parte não
 * é cosmética: quase todo texto longo deste repositório é escrito como
 * `"…" +` ⏎ `"…"`, e o ponto de quebra é onde a linha enche — ninguém o
 * escolhe. Sem juntar, `"…proposta em " + "10 minutos"` evade toda regra que
 * precise ver o número ao lado da unidade, e o teste de comprimento de meta
 * mede só o primeiro pedaço.
 */
function comoOLeitorRecebe(caminho: string): string {
  const bruto = readFileSync(caminho, "utf8");
  const semNota = caminho.endsWith(".json") ? bruto : semComentarios(bruto);
  return semNota.replace(/"\s*\+\s*(\r?\n)?\s*"/g, "").replace(/'\s*\+\s*(\r?\n)?\s*'/g, "");
}

// ── vocabulário das regras ─────────────────────────────────────────────────
// `\$?\{…\}` cobre o número que chega por interpolação — `Proposta em ${x}
// minutos` e `{prazo} minutos` no JSX. Sem isso a promessa volta escrita como
// template literal, que é o formato mais natural de todos num componente.
const QUANTO = String.raw`(~?\d+|\$?\{[^}]{0,24}\}|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta|poucos|poucas|meia)`;
const UNIDADE = String.raw`(minutos?|min|horas?|h)\b`;
const LIGA = String.raw`\b(em|dentro de|leva|levam|demora|demoram|dura|duram|no prazo de)\s+(menos de\s+|cerca de\s+|at[ée]\s+|apenas\s+|em m[ée]dia,?\s+|m[ée]dia de\s+)?`;
const SUJEITO = String.raw`(propost|respost|respond|retorn|contat|avali|an[áa]lis|analis|aprova|atend|or[çc]ament|simula|ligamos|chamamos)`;
const PERTO = String.raw`[^.;!?]{0,70}`;

/** Uma regra devolve o trecho infrator, ou `null`. */
interface Regra {
  nome: string;
  /** `true` = só vale para superfície de cliente. */
  soPublico: boolean;
  acha(texto: string): string | null;
}

const porRegex = (nome: string, re: RegExp, soPublico = true): Regra => ({
  nome,
  soPublico,
  acha: (texto) => texto.match(re)?.[0] ?? null,
});

const REGRAS: Regra[] = [
  // O sujeito e o prazo na MESMA frase — `[^.;!?]` não atravessa pontuação.
  // O número é OPCIONAL: "retorna em minutos" é a forma mais natural de todas
  // e não tem número nenhum.
  porRegex(
    "prazo de resposta cravado",
    new RegExp(SUJEITO + PERTO + LIGA + "(" + QUANTO + String.raw`\s*)?` + UNIDADE, "i"),
  ),

  // "na hora", "no ato", "imediato" — prazo sem unidade de tempo.
  //
  // As duas primeiras precisam de guarda: "na hora DE escolher" e "no ato DA
  // entrega" são locuções temporais comuns, não promessa. A varredura achou
  // exatamente isso em `paginasGeo.ts` — "a parte do negócio que ninguém
  // avalia na hora de escolher", onde `avalia` é julgar e não avaliar carro.
  //
  // "agora mesmo" ficou de fora de propósito: aparece em chamada para ação
  // ("simule agora mesmo"), que é convite ao leitor, e é raro como promessa —
  // "respondemos agora mesmo" ninguém escreve.
  porRegex(
    "resposta prometida como imediata",
    new RegExp(
      SUJEITO + PERTO + String.raw`\b(na hora\b(?!\s+d[eoa]\b)|no ato\b(?!\s+d[oa]\b)|imediat[ao]s?|imediatamente|ainda hoje)\b`,
      "i",
    ),
  ),

  // Frete e prazo de entrega são "combinados caso a caso" por decisão de
  // 04/09/2026. Anexar um prazo à frase do Brasil é a forma mais provável de a
  // promessa voltar, e a guarda positiva sozinha não pega: ela casa por
  // substring e continua casando depois do acréscimo.
  porRegex(
    "prazo de entrega cravado",
    new RegExp(
      String.raw`(entreg|frete|transport)[^.;!?]{0,60}` + LIGA + "(" + QUANTO + String.raw`\s*)?` +
        String.raw`(minutos?|min|horas?|h|dias?|semanas?)\b`,
      "i",
    ),
  ),

  // A mesma promessa em forma de estatística. Duas formas: renderizada no JSX
  // (`>10 min<`) e como propriedade de objeto — que é como `EstatisticasRegua`
  // recebe os itens, e por onde ela voltaria sem passar por nenhuma das duas.
  porRegex("prazo renderizado como estatística", new RegExp(String.raw`>\s*\d+\s*(min|minutos?|h|horas?|dias?)\s*<`, "i")),
  porRegex(
    "prazo como item de estatística",
    new RegExp(String.raw`(valor|rotulo|label|titulo)\s*:\s*["'\`][^"'\`]{0,24}\b\d+\s*(min|minutos?|h|horas?|dias?)\b`, "i"),
  ),

  // Quem decide o prazo da análise é o banco. Ancorado em crédito para não
  // pegar "venha ver os dois no mesmo dia", que é convite ao leitor.
  porRegex(
    "análise de crédito no mesmo dia",
    /(an[áa]lise|aprova[çc][ãa]o|cr[ée]dito)[^.;!?]{0,60}no mesmo dia|no mesmo dia[^.;!?]{0,60}(an[áa]lise|aprova[çc][ãa]o|cr[ée]dito)/i,
  ),

  // Proibido pela regulação de publicidade de crédito (§1.4b do plano).
  porRegex("aprovação prometida", /aprova[çc][ãa]o\s+(garantid|cert[ao]|imediat|na hora)|cr[ée]dito\s+garantid/i, false),
  porRegex("superlativo sobre o que a loja não controla", /melhores?\s+(taxas?|condi[çc][õo]es|pre[çc]os?)/i, false),
  porRegex("promessa absoluta de processo", /sem\s+burocracia/i, false),

  // O posicionamento fala de SELEÇÃO, não de faixa de preço — e a vitrine
  // desmente a frase sozinha: vai de R$ 23.900 a R$ 318.900. A NEGAÇÃO é
  // legítima e é a voz do POSICIONAMENTO.md ("aqui não é loja de luxo"), por
  // isso a regra olha o que vem antes.
  {
    nome: "faixa de preço como posicionamento",
    soPublico: false,
    acha(texto) {
      // `premium` já era barrado pela coluna "Evitar" de
      // `genero-e-concordancia`, mas só numa lista de nove arquivos — os hubs
      // de modelo, que são a maior superfície de texto do site, ficavam fora.
      //
      // Aqui ela precisa do substantivo que qualifica. A palavra solta é dado,
      // não copy, e aparece três vezes de forma legítima: rótulo de segmento
      // no tracking (`ticket: "PREMIUM"`), chave de perfil vinda do
      // RevendaMais (`"performance / premium"`) e NOME DE VERSÃO de veículo
      // (`GS EV Premium`, `Linha Premium`) — que o feed traz e ninguém aqui
      // escolhe.
      const re =
        /alt[íi]ssimo\s+padr[ãa]o|alto\s*[- ]?\s*padr[ãa]o|\bde\s+luxo\b|(curadoria|sele[çc][ãa]o|atendimento|experi[êe]ncia|loja|revenda|seminovos?|carros?|ve[íi]culos?)\s+premium|premium\s+(seminovos?|carros?|ve[íi]culos?)/gi;
      for (const achado of texto.matchAll(re)) {
        const antes = texto.slice(Math.max(0, (achado.index ?? 0) - 30), achado.index);
        if (!/\bn[ãa]o\b[^.;!?]{0,24}$/i.test(antes)) return achado[0];
      }
      return null;
    },
  },

  // CLAUDE.md regra 4 — "o cliente NUNCA vê valor de compra no site". A régua
  // do /sobre é o ponto exato: basta um item a mais no array. Filtro de preço
  // ("Até R$ 300 mil") é o que o cliente PAGA e é legítimo; o que não pode é
  // valor que a LOJA paga.
  //
  // `preço de pátio` entra pelo mesmo motivo: a campanha do popup dizia que a
  // ferramenta de avaliação devolve "preço de pátio". Ela devolve a FIPE — o
  // valor de compra sai da vistoria e quem o informa é o consultor.
  porRegex(
    "valor de compra exibido ao cliente",
    /(rotulo|label|titulo|valor)\s*:\s*["'`][^"'`]*\b(pagamos|compramos|de compra|pela troca|damos)|(\bpagamos|\bcompramos|\bdamos)\s+(at[ée]\s+)?R\$|(m[ée]dia|valor)\s+que\s+pagamos|pre[çc]o de p[áa]tio/i,
  ),

  // CLAUDE.md regra 5 — desenvolver a recompra é permitido; COMUNICÁ-la em
  // superfície pública, não, até parecer jurídico e provisionamento. Ancorada
  // em FIPE/contrato/percentual para não acusar a palavra solta num rótulo de
  // permissão interna.
  porRegex(
    "recompra em comunicação pública",
    /(recompra|recompramos|readquir\w*)[^.;!?]{0,70}(FIPE|contrato|garantid|\d+\s*%)|(\d+\s*%|FIPE)[^.;!?]{0,70}(recompramos|recompra garantid)/i,
  ),
];

const TODOS = arquivosDeTexto(join(raiz, "src"));
const ehInterno = (caminho: string) => INTERNOS.some((p) => comoNoRepo(caminho).startsWith(p));

describe("nenhuma superfície de cliente promete o que ninguém mede", () => {
  it("a varredura está de fato lendo o repositório", () => {
    // Varredura que não acha arquivo passa em tudo, calada. Foi o modo de
    // falha de `fonte.ts` com `accept="image/*"`, e vale igual aqui.
    const nomes = TODOS.map(comoNoRepo);

    expect(TODOS.length).toBeGreaterThan(150);
    expect(nomes).toContain("src/lib/paginasGeo.ts");
    expect(nomes).toContain("src/app/page.tsx");
    // O `.json` é a isenção não declarada que a versão anterior tinha.
    expect(nomes).toContain("src/lib/aboutSettings.json");
    expect(nomes).toContain("src/lib/companySettings.json");
    // E a isenção declarada de fato exclui alguém — se não excluir, ela mente.
    expect(TODOS.filter(ehInterno).length).toBeGreaterThan(50);
  });

  it("junta literais concatenados antes de ler", () => {
    // Sem isto, `"…proposta em " + "10 minutos"` evade toda regra que precise
    // ver o número ao lado da unidade. Duas das três posições de quebra
    // possíveis evadiam, e o ponto de quebra é onde a linha enche.
    const junto = `const t = "A proposta sai em " +\n  "10 minutos.";`
      .replace(/"\s*\+\s*(\r?\n)?\s*"/g, "");

    expect(junto).toContain("em 10 minutos");
    expect(REGRAS[0].acha(junto)).not.toBeNull();
  });

  it.each(REGRAS.map((r) => [r.nome, r] as const))("nenhum arquivo tem %s", (_nome, regra) => {
    const alvos = regra.soPublico ? TODOS.filter((c) => !ehInterno(c)) : TODOS;
    const infratores: string[] = [];

    for (const caminho of alvos) {
      const texto = comoOLeitorRecebe(caminho);
      const achado = regra.acha(texto);
      if (achado) infratores.push(`${comoNoRepo(caminho)} — ${achado.trim().slice(0, 90)}`);
    }

    expect(infratores).toEqual([]);
  });
});

describe("o que entrou no lugar da promessa", () => {
  /**
   * Guardas positivas. Apagar a promessa e não pôr nada no lugar deixa a
   * seção sem próximo passo, e só as regras acima passariam igual — foi assim
   * que uma mutação sobreviveu à rodada da vitrine.
   */
  it("as quatro superfícies da avaliação dizem por onde a proposta chega", () => {
    for (const arquivo of [
      "src/app/page.tsx",
      "src/app/avaliacao/page.tsx",
      "src/components/AutoAvaliacao.tsx",
      "src/lib/compartilhamento.ts",
    ]) {
      expect(lerCodigo(arquivo)).toMatch(/consultor retorna no WhatsApp/);
    }
  });

  it("a estatística da home é número, com sujeito, e é um número que a loja tem", () => {
    // `WHATSAPP / POR ONDE RESPONDEMOS` cabia e quebrava o desenho: medido no
    // woff2 do build, o rótulo ia a duas linhas entre 383 e 393px (iPhone
    // 12-15 = 390, Pixel = 393) e abaixo de 382 a palavra indivisível travava
    // o min-content e tirava a régua central do meio. `3 EM 10 / DOS
    // AVALIADOS` mede 100,5 e 100 px e sobrevive até ~256px de viewport.
    //
    // E o rótulo precisa do sujeito: "APROVADOS" sozinho, num bloco de venda e
    // troca ao lado de FIPE e logo acima de AVALIAR MEU CARRO, lê como "3 em
    // 10 clientes têm o crédito aprovado" — a leitura errada é justamente a
    // palavra que esta entrega tirou das promessas de crédito.
    const home = lerCodigo("src/app/page.tsx");

    expect(home).toMatch(/>3 EM 10</);
    expect(home).toMatch(/DOS AVALIADOS/);
    expect(home).not.toMatch(/>WHATSAPP</);
  });

  it("a FIPE aparece como referência, nunca como valor de compra", () => {
    // `BASE DE AVALIAÇÃO` ao lado de um número lê como proposta. A regra 4 do
    // CLAUDE.md é que o cliente NUNCA vê valor de compra no site — quem
    // informa é o consultor, depois da vistoria.
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

  it("o fallback do /sobre não promete taxa nem ausência de burocracia", () => {
    // `aboutSettings.json` é o que o SERVIDOR renderiza antes de
    // `/api/settings` responder, e é a fonte que `paginasInstitucionais.ts`
    // cita para a prosa de /financiamento. Até 04/09/2026 ele dizia "sem
    // burocracia" e "garantindo as melhores taxas" — a rodada anterior tinha
    // corrigido o derivado e deixado a origem.
    const sobre = JSON.parse(readFileSync(join(raiz, "src/lib/aboutSettings.json"), "utf8"));

    expect(sobre.card2Desc).toMatch(/saem da análise de cada banco/);
    expect(sobre.card2Desc).not.toMatch(/melhores taxas|sem burocracia/i);
  });
});

describe("os dois FAQ dão a mesma resposta sobre alcance", () => {
  /**
   * "Atende quem é de fora?" é feita em dois lugares públicos: no FAQ da
   * garantia e no FAQ das páginas geo. Até 04/09/2026 elas discordavam — uma
   * dizia "fora do estado", a outra limitava à Região Metropolitana com Paraná
   * e Santa Catarina só "para veículos de ticket mais alto".
   *
   * O alcance real, decidido pelo dono em 04/09/2026: entrega para todo o
   * Brasil. O que é regional é a MÍDIA, não o serviço.
   *
   * ---------------------------------------------------------------------------
   * O que este bloco NÃO cobre, e por quê
   * ---------------------------------------------------------------------------
   * `estoque_motors.descricao_seo` — a meta description de cada ficha — tem 28
   * textos em produção que fecham com "entregamos em todo o Paraná e no
   * litoral catarinense até Balneário Camboriú". Não é falso (entregamos lá),
   * mas lido isolado soa como teto. Reescrever 51 meta descriptions é decisão
   * de conteúdo e de SEO do dono, não deste PR, e a fonte versionada
   * (`conteudo-seo/rascunhos*.json`) só tem 3 das 28. O plano de ingestão
   * aprovado exclui ficha de veículo e hub de modelo justamente por isso.
   */
  const ALCANCE = /entregamos para todo o Brasil/i;

  it("o FAQ da garantia diz o alcance real", () => {
    const resposta = PERGUNTAS_DE_GARANTIA.find((p) => /outra cidade/i.test(p.pergunta))?.resposta;

    expect(resposta).toMatch(ALCANCE);
    // E continua nomeando a Região Metropolitana: quem mora em Pinhais não se
    // reconhece em "de fora".
    expect(resposta).toMatch(/Região Metropolitana/);
  });

  it("o FAQ das páginas geo dá a MESMA resposta", () => {
    const deFora = PAGINAS_GEO.flatMap((p) => p.faq).filter((p) => /fora de Curitiba/i.test(p.pergunta));

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
   *
   * A leitura passa por `comoOLeitorRecebe`: sem juntar as concatenações, uma
   * meta escrita em duas linhas — que é o estilo dominante do repo — seria
   * medida só pelo primeiro pedaço, e o teste se desligaria sozinho.
   */
  const LIMITE = 155;

  function meta(arquivo: string, regra: RegExp): string {
    const achado = comoOLeitorRecebe(join(raiz, arquivo)).match(regra);
    expect(achado, `não achei a meta em ${arquivo}`).not.toBeNull();
    return achado![1];
  }

  it.each([
    ["src/app/sobre/page.tsx", /const DESCRICAO =\s*\r?\n?\s*"([^"]+)"/],
    ["src/app/avaliacao/page.tsx", /const DESCRICAO =\s*\r?\n?\s*"([^"]+)"/],
    ["src/app/financiamento/page.tsx", /description:\s*\r?\n?\s*"([^"]+)"/],
  ] as const)("%s", (arquivo, regra) => {
    expect(meta(arquivo, regra).length).toBeLessThanOrEqual(LIMITE);
  });

  it("mede a meta inteira, não o primeiro pedaço da concatenação", () => {
    // Guarda da própria guarda: a de /financiamento é escrita em duas linhas.
    // Se a junção parar de funcionar, esta medida despenca e o teste de cima
    // passa a aprovar qualquer coisa.
    expect(meta("src/app/financiamento/page.tsx", /description:\s*\r?\n?\s*"([^"]+)"/).length).toBeGreaterThan(120);
  });

  it("a prosa de /financiamento continua dizendo que não promete aprovação", () => {
    // Guarda positiva do par: encurtar a meta não pode custar o aviso que a
    // regulação exige, que vive na prosa.
    expect(TEXTO_DE_FINANCIAMENTO.join(" ")).toMatch(/não faz é prometer aprovação/i);
    expect(PERGUNTAS_DE_FINANCIAMENTO.map((p) => p.resposta).join(" ")).toMatch(/depende do banco/i);
  });
});
