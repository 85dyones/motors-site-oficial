/**
 * Marcas de texto de IA em português — a régua da skill `humanizer`
 * (github.com/blader/humanizer, MIT), adaptada para o que os textos do site
 * realmente escrevem. Decisão do dono em 2026-09-21: hubs e guias, novos e
 * existentes, passam pelo humanizer.
 *
 * Duas camadas, como a própria skill manda ("um sinal fraco sozinho não
 * justifica a edição"):
 *
 *   · FORTES — reprovam o texto. São as marcas que uma pessoa quase nunca faz
 *     de propósito: travessão como conector universal (§8), o contraste
 *     "não é X, é Y" (§1), a abertura encenada (§4), a frase de efeito (§3),
 *     o vocabulário que só modelo usa em quantidade (§12) e o resíduo de
 *     chat (§22).
 *   · FRACAS — só contam. "X, não Y", "não só... mas também", parágrafo de uma
 *     linha: às vezes é exatamente o que a frase precisa. Servem para a
 *     revisão humana olhar, não para travar o build.
 *
 * O que NÃO entra: hífen de palavra composta ("T-Cross", "ar-condicionado"),
 * travessão dentro de URL ou código, e a palavra dentro de nome próprio.
 */

export interface Marca {
  regra: string;
  trecho: string;
}

/**
 * Fronteira de palavra que entende acento. O `\b` do JavaScript só conhece
 * [A-Za-z0-9_]: "não é" terminando em "é" nunca casava, e o detector deixava
 * passar justamente o contraste mais comum em português.
 */
const I = "(?<![\\p{L}\\p{N}_])";
const F = "(?![\\p{L}\\p{N}_])";
const re = (fonte: string, flags = "giu") => new RegExp(fonte.replaceAll("\\b<", I).replaceAll("\\b>", F), flags);

const VERBO = "(?:é|são|foi|era|está|estão|serve|vale|basta|decide|importa|pesa)";

const FORTES: Array<[string, RegExp]> = [
  ["§8 travessão", re("[—–]|\\s--\\s")],
  ["§1 não é X, é Y", re(`\\b<não ${VERBO}\\b>[^.!?;:\\n]{1,90}[,;]\\s*${VERBO}\\b>`)],
  ["§1 não X, e sim Y", re("\\b<não\\b>[^.!?\\n]{1,90}[,;]?\\s+(?:e|mas) sim\\b>")],
  ["§1 contraste em duas frases", re("\\b<não (?:é|se trata de|significa)\\b>[^.!?\\n]{1,100}[.!?]\\s+(?:É|Significa|Trata-se)\\b>")],
  [
    "§4 abertura encenada",
    re("(?:^|[.!?]\\s+)(?:A verdade é que|O ponto é que|A questão é que|A real é que|Vamos (?:lá|direto ao ponto|entender)|Sem rodeios|Resumindo|Em resumo|Na real|Spoiler)\\b>", "gu"),
  ],
  ["§3 frase de efeito", re("\\b<(?:no fim do dia|e isso muda tudo|a pergunta real|o segredo (?:é|está)|no coração d[aoe]|a chave (?:é|está) (?:em|n[ao]))\\b>")],
  [
    "§12 vocabulário de IA",
    re("\\b<(?:crucia(?:l|is)|vale (?:ressaltar|destacar|frisar)|é importante (?:ressaltar|destacar|notar|frisar)|desempenha(?:m)? um papel|papel (?:fundamental|crucial|chave)|tapeçaria|mergulh(?:ar|o) (?:fundo|profundo)|vibrante|meticulos[ao]s?)\\b>"),
  ],
  ["§22 resíduo de chat", re("\\b<(?:espero que (?:isso|este guia|este texto) (?:ajude|tenha ajudado)|ótima pergunta|boa pergunta|é a pergunta certa)\\b>")],
];

const FRACAS: Array<[string, RegExp]> = [
  ["§1 X, não Y (cauda)", re("[,;]\\s*não (?:o|a|os|as|um|uma|pel[oa]s?|n[oa]s?|d[oa]s?|só|mais|por|com|em|para)\\b>[^.!?,;\\n]{0,50}[.!?]")],
  ["§1 não só... mas", re("\\b<não (?:só|apenas|somente)\\b>[^.!?\\n]{1,100}\\b<(?:mas|como também)\\b>")],
  ["§12 vocabulário fraco", re("\\b<(?:fundamenta(?:l|is)|essencia(?:l|is)|robust[oa]s?|jornada|cenário|além disso|de fato|potencializ\\p{L}+|alavanc\\p{L}+)\\b>")],
  ["§21 aspas curvas", re("[“”]", "gu")],
];

function varrer(texto: string, regras: Array<[string, RegExp]>): Marca[] {
  const achadas: Marca[] = [];
  for (const [regra, padrao] of regras) {
    padrao.lastIndex = 0;
    for (const m of texto.matchAll(padrao)) {
      const ini = Math.max(0, (m.index ?? 0) - 25);
      achadas.push({ regra, trecho: texto.slice(ini, (m.index ?? 0) + m[0].length + 25).replace(/\s+/g, " ") });
    }
  }
  return achadas;
}

/** Marcas que reprovam o texto. Lista vazia = passa. */
export function marcasFortes(texto: string): Marca[] {
  return varrer(texto, FORTES);
}

/** Marcas que só contam, para a revisão humana olhar. */
export function marcasFracas(texto: string): Marca[] {
  return varrer(texto, FRACAS);
}

/**
 * Parágrafo curto que só fecha (§2): até 10 palavras, depois de outro
 * parágrafo. Fraco — um parágrafo curto pode carregar um fato novo.
 */
export function fechosDeUmaLinha(paragrafos: string[]): string[] {
  return paragrafos.slice(1).filter((p) => p.trim().split(/\s+/).length <= 10);
}
