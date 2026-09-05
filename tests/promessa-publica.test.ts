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
 * teste chamado "nenhuma superfície pública promete prazo".
 *
 * A isenção é por natureza da superfície, não por conveniência: nada aqui é
 * servido a cliente. Se um dia for, sai da lista.
 *
 * ---------------------------------------------------------------------------
 * Duas isenções que existiram e estavam ERRADAS
 * ---------------------------------------------------------------------------
 * Na primeira versão desta lista, em 04/09/2026, `src/lib/ciclo/` inteiro e
 * `src/app/api/` inteiro estavam isentos. Os dois abrigam texto de cliente:
 *
 * - `src/lib/ciclo/motor.ts` É a mensagem que sai no WhatsApp — o cabeçalho
 *   dele diz "o texto nasce no site e não no nó do n8n". É literalmente o pior
 *   caso que o comentário acima descreve, e estava isento por engano meu.
 * - `src/app/api/feed/xml/route.ts` monta a `<g:description>` do catálogo:
 *   copy de anúncio pago. `llms-full.txt/route.ts` é a superfície de ingestão
 *   por assistente. `avaliacao/route.ts` é onde a recomendação de compra
 *   existe — o ponto exato em que a regra 4 quebraria com uma linha.
 *
 * Isenção por PREFIXO de pasta erra assim: leva junto o que a pasta não
 * prometeu. Por isso agora ela é por arquivo, e cada um traz o motivo.
 */
const INTERNOS = [
  "src/app/admin/",
  "src/components/admin/",
];

/** Arquivos isentos um a um, com o motivo escrito ao lado. */
const ARQUIVOS_INTERNOS: Record<string, string> = {
  // Implementa o gatilho da recompra — a regra 5 proíbe COMUNICAR, não calcular.
  "src/lib/ciclo/gatilho.ts": "implementa o gatilho de recompra",
  // Catálogo de permissões do painel: os rótulos descrevem o que cada papel
  // enxerga, e um deles nomeia o indicador da recompra. Ninguém de fora lê.
  "src/lib/permissoes.ts": "rótulos de permissão do painel",
};

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
 *
 * Duas correções sobre a primeira versão, de 04/09/2026:
 *
 * 1. **Aspas mistas.** Ela só juntava aspas IGUAIS, e
 *    `"…em " + '10 minutos' + "…"` passava inteiro. Agora as três formas
 *    (aspa dupla, simples e crase) se juntam entre si, que é o que o
 *    `QUANTO` já pressupunha ao prever template literal.
 * 2. **Literal que É o operador.** `{cond ? "+" : "−"}` casava o `"+"`
 *    inteiro e o apagava, deixando `{cond ?  : "−"}`. Inofensivo — o que
 *    sobra é sintaxe, não prosa — mas um `.join(" + ")` colaria os vizinhos.
 *    Na mesma linha a junção agora OLHA o conteúdo do literal da esquerda e
 *    desiste quando ele é só um sinal de mais.
 */
function juntarLiterais(fonte: string): string {
  // Quebra de linha: o estilo dominante do repo, e o único caso em que o
  // ponto de corte não foi escolhido por ninguém.
  const multilinha = fonte.replace(/(["'`])[ \t]*\+[ \t]*\r?\n[ \t]*(["'`])/g, "");

  // Mesma linha: só quando o literal da esquerda tem conteúdo de texto.
  return multilinha.replace(
    /(["'`])([^"'`\n]*)\1[ \t]*\+[ \t]*(["'`])/g,
    (todo, aspa, conteudo) => (/^\s*\+?\s*$/.test(conteudo) ? todo : `${aspa}${conteudo}`),
  );
}

function comoOLeitorRecebe(caminho: string): string {
  const bruto = readFileSync(caminho, "utf8");
  const semNota = caminho.endsWith(".json") ? bruto : semComentarios(bruto);
  return juntarLiterais(semNota);
}

// ── vocabulário das regras ─────────────────────────────────────────────────
// `\$?\{…\}` cobre o número que chega por interpolação — `Proposta em ${x}
// minutos` e `{prazo} minutos` no JSX. Sem isso a promessa volta escrita como
// template literal, que é o formato mais natural de todos num componente.
// A dezena composta ("quarenta e cinco minutos") entra pelo prefixo opcional.
const QUANTO = String.raw`(~?\d+|\$?\{[^}]{0,24}\}|(?:vinte|trinta|quarenta|cinquenta|sessenta)\s+e\s+\w+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta|poucos|poucas|meia)`;
const UNIDADE = String.raw`(minutos?|min|horas?|h)\b`;
const LIGA = String.raw`\b(em|dentro de|leva|levam|demora|demoram|dura|duram|no prazo de|entre)\s+(menos de\s+|cerca de\s+|at[ée]\s+|apenas\s+|em m[ée]dia,?\s+|m[ée]dia de\s+)?`;
const SUJEITO = String.raw`(propost|respost|respond|retorn|contat|avali|an[áa]lis|analis|aprova|atend|or[çc]ament|simula|ligamos|chamamos)`;
const PERTO = String.raw`[^.;!?]{0,70}`;

/**
 * As formas de NEGAR uma promessa.
 *
 * Sem isto a trava reprova o registro que esta própria entrega adotou — "o que
 * a simulação não faz é prometer aprovação" ficaria vermelho pela regra que
 * proíbe prometer aprovação. Medido em 04/09/2026 numa bateria de 15 textos
 * legítimos: 14 eram reprovados, e todos por falta desta guarda.
 *
 * Uma trava que fica vermelha por causa alheia é desligada na terceira vez.
 */
const NEGADORES = /\b(n[ãa]o|nunca|jamais|nada de|sem prometer|nem sempre|desconfie|deixamos de|deixe de)\b/i;

/** Uma regra devolve o trecho infrator, ou `null`. */
interface Regra {
  nome: string;
  /** `true` = só vale para superfície de cliente. */
  soPublico: boolean;
  acha(texto: string): string | null;
}

/**
 * Procura todas as ocorrências e descarta as que estão dentro de uma negação.
 *
 * A janela é a frase: volta até a pontuação anterior, no máximo 90 caracteres.
 * Frase é a unidade certa porque é onde a negação de fato opera — "não" num
 * período anterior não nega o seguinte.
 */
function acharSemNegacao(texto: string, re: RegExp): string | null {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const achado of texto.matchAll(global)) {
    const inicio = achado.index ?? 0;
    const janela = texto.slice(Math.max(0, inicio - 90), inicio);
    const frase = janela.slice(janela.search(/[^.;!?]*$/));
    if (!NEGADORES.test(frase)) return achado[0];
  }
  return null;
}

const porRegex = (nome: string, re: RegExp, soPublico = true): Regra => ({
  nome,
  soPublico,
  acha: (texto) => texto.match(re)?.[0] ?? null,
});

/** Como `porRegex`, mas a negação da promessa não é a promessa. */
const porRegexNegavel = (nome: string, re: RegExp, soPublico = true): Regra => ({
  nome,
  soPublico,
  acha: (texto) => acharSemNegacao(texto, re),
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
  //
  // O `h` sozinho saiu das duas: "9h às 19h" é HORÁRIO DA LOJA, não prazo, e
  // `companySettings.hours` já carrega "das 08h30 às 18h30". Uma régua de
  // horário de atendimento não pode ficar vermelha aqui. `24h` continua pego
  // pela regra de prazo de resposta, que exige a ligação temporal ("em até").
  porRegex("prazo renderizado como estatística", new RegExp(String.raw`>\s*\d+\s*(min|minutos?|horas?|dias?)\s*<`, "i")),
  porRegex(
    "prazo como item de estatística",
    new RegExp(String.raw`(valor|rotulo|label|titulo)\s*:\s*["'\`][^"'\`]{0,24}\b\d+\s*(min|minutos?|horas?|dias?)\b`, "i"),
  ),

  // Quem decide o prazo é o banco — e, para a proposta, a vistoria.
  //
  // A âncora era só `análise|aprovação|crédito`, e "Proposta no mesmo dia" —
  // a mesma promessa que este PR removeu, reescrita — passava por fora dela.
  porRegexNegavel(
    "resposta prometida no mesmo dia",
    /(an[áa]lise|aprova[çc][ãa]o|cr[ée]dito|propost|respost|retorn|contat|avalia|entrega)[^.;!?]{0,60}no mesmo dia|no mesmo dia[^.;!?]{0,60}(an[áa]lise|aprova[çc][ãa]o|cr[ée]dito|propost|respost|retorn|contat|avalia|entrega)/i,
  ),

  // Proibido pela regulação de publicidade de crédito (§1.4b do plano).
  porRegexNegavel(
    "aprovação prometida",
    /aprova[çc][ãa]o\s+(garantid|cert[ao]|imediat|facilitad|na hora)|cr[ée]dito\s+(garantid|f[áa]cil|na hora)/i,
    false,
  ),
  // `melhores?` se lia `melhore` + `s?`: casava "melhores" e não casava
  // **"melhor"**, que é a forma mais comum ("a melhor taxa do mercado"). A
  // regra cobria exatamente a frase que eu tinha removido e mais nada.
  porRegexNegavel(
    "superlativo sobre o que a loja não controla",
    /melhor(es)?\s+(taxas?|condi[çc][õo]es|pre[çc]os?)/i,
    false,
  ),
  porRegexNegavel("promessa absoluta de processo", /(sem|zero)\s+burocracia/i, false),

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
      // A guarda de negação era local e só conhecia `não`, numa janela de 30
      // caracteres: "NUNCA fomos uma revenda premium" — a frase do
      // POSICIONAMENTO.md — ficava vermelha. Passou a usar a mesma
      // `acharSemNegacao` das outras, que conhece nunca, jamais, desconfie.
      return acharSemNegacao(texto, re);
    },
  },

  // CLAUDE.md regra 4 — "o cliente NUNCA vê valor de compra no site". A régua
  // do /sobre é o ponto exato: basta um item a mais no array. Filtro de preço
  // ("Até R$ 300 mil") é o que o cliente PAGA e é legítimo; o que não pode é
  // valor que a LOJA paga.
  //
  // `preço de pátio` entra pelo mesmo motivo: a campanha do popup dizia que a
  // ferramenta de avaliação devolve "preço de pátio". Ela devolve a FIPE.
  //
  // A primeira versão listava seis expressões e por isso não sustentava o
  // invariante que este comentário invoca: "Oferecemos R$ 42.000 pelo seu
  // usado" passava inteiro. O verbo agora é aberto, e o alvo é a construção —
  // dinheiro perto de "pelo seu carro", que é a forma que a frase toma.
  //
  // A EXPRESSÃO "valor de compra" não é a infração — é o vocabulário com que o
  // projeto fala da regra. Ela aparece exatamente nos avisos que dizem que o
  // valor não sai ali: "a FIPE é referência de mercado, não proposta de
  // compra" (`AutoAvaliacao.tsx`), "DATA DE COMPRA" na Garagem do próprio
  // cliente, "abaixo do preço de compra" na alçada do painel. Uma regra que
  // proíbe a palavra proíbe a ressalva junto.
  //
  // O que a regra persegue é DINHEIRO apresentado como o que a loja paga.
  porRegexNegavel(
    "valor de compra exibido ao cliente",
    /(rotulo|label|titulo|valor)\s*:\s*["'`][^"'`]*\b(pagamos|compramos|pela troca|damos)|(pagamos|compramos|damos|oferecemos|oferec\w+|garantimos)[^.;!?]{0,40}R\$|R\$[^.;!?]{0,40}(pelo seu|pela sua|pelo teu|no seu)\s+(carro|usado|ve[íi]culo|moto|seminovo)|(m[ée]dia|valor)\s+que\s+pagamos|pre[çc]o de p[áa]tio/i,
  ),

  // CLAUDE.md regra 5 — desenvolver a recompra é permitido; COMUNICÁ-la em
  // superfície pública, não, até parecer jurídico, provisionamento e seeds
  // validados (manual §1.4 v1.2).
  //
  // Era ancorada em FIPE/contrato/percentual, e por isso NÃO sustentava o
  // invariante: "No fim do programa, a Motors recompra o seu carro" — a frase
  // mais simples possível, e a mais provável — passava. Agora é a palavra, em
  // superfície de cliente, com guarda de negação (a loja PODE dizer que não
  // trabalha com recompra). Quem calcula o gatilho está isento por arquivo,
  // com o motivo escrito ao lado.
  porRegexNegavel(
    "recompra em comunicação pública",
    /\b(recompra|recompramos|recompraremos|readquir\w*)\b/i,
  ),
];

const TODOS = arquivosDeTexto(join(raiz, "src"));
const ehInterno = (caminho: string) => {
  const rel = comoNoRepo(caminho);
  return INTERNOS.some((p) => rel.startsWith(p)) || rel in ARQUIVOS_INTERNOS;
};

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
    expect(TODOS.filter(ehInterno).length).toBeGreaterThan(20);
    // Os arquivos isentos um a um existem: nome errado isenta ninguém e a
    // linha vira um comentário que parece uma regra.
    for (const arquivo of Object.keys(ARQUIVOS_INTERNOS)) {
      expect(TODOS.map(comoNoRepo), arquivo).toContain(arquivo);
    }
    // E as superfícies que já estiveram isentas por engano estão de volta.
    const publicos = TODOS.filter((c) => !ehInterno(c)).map(comoNoRepo);
    expect(publicos).toContain("src/lib/ciclo/motor.ts");
    expect(publicos).toContain("src/app/api/feed/xml/route.ts");
    expect(publicos).toContain("src/app/api/avaliacao/route.ts");
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
    expect(home).toMatch(/VIRAM ESTOQUE/);
    // E o rótulo tem VERBO, que é a convenção da régua: `100% / PASSAM PELA
    // CAUTELAR`, `3 MESES / GARANTIA MOTOR E CÂMBIO`. `DOS AVALIADOS`, a
    // primeira tentativa, era fragmento sem verbo — e no bloco de venda e
    // troca a leitura disponível virava «3 em 10 recebem proposta», que é
    // pior do que a verdade: todo mundo recebe resposta.
    expect(home).not.toMatch(/DOS AVALIADOS/);
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
   * textos em produção que afirmam alcance regional ("entregamos em todo o
   * Paraná e no litoral catarinense até Balneário Camboriú" e paráfrases). Não
   * é falso — entregamos lá —, mas lido isolado soa como teto.
   *
   * A fonte versionada tem **18 dessas 41 fichas** em
   * `conteudo-seo/rascunhos*.json`. A primeira versão desta nota dizia "3 das
   * 28", contando a frase EXATA em vez da afirmação — o mesmo erro que esta
   * trava inteira existe para corrigir, cometido dentro dela. As outras 15
   * dizem a mesma coisa com outras palavras ("com entrega para todo o Paraná").
   *
   * Com o número certo, a razão do adiamento muda: não é que mexer na fonte
   * versionada não resolva — resolve a maior parte, e `aplicar-rascunhos.js`
   * grava. É que reescrever 41 meta descriptions de produção é decisão de
   * conteúdo e de SEO do dono, e ele não foi consultado. Fica registrado como
   * pendência, não como impossibilidade.
   *
   * O plano de ingestão aprovado exclui ficha de veículo e hub de modelo, então
   * o assistente não vê essa contradição — quem vê é o leitor e o Google.
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
