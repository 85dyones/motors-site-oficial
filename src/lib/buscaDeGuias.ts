/**
 * A busca do índice de guias (pedido do dono em 02/10/2026): o cliente filtra
 * por tema ou digita a dúvida, e a lista se reduz ao que responde.
 *
 * Roda no navegador, sobre um índice pequeno montado no servidor: título,
 * descrição, assuntos, títulos das seções e as perguntas do FAQ de cada guia.
 * O corpo inteiro não vai: pesaria a página, e quem digita uma dúvida escreve
 * as palavras da pergunta, que estão nos títulos e no FAQ.
 *
 * A dúvida vem em frase ("como saber se o carro foi batido"). Por isso as
 * palavras de ligação são ignoradas e o guia entra com pelo menos metade das
 * palavras que sobram, e não só com todas: exigir todas esvaziava a lista por
 * causa de um "saber" que nenhum título usa. "Carro" e "veículo" entram
 * nas palavras ignoradas porque estão em quase todo guia e não separam nada.
 */

export interface GuiaNaBusca {
  slug: string;
  titulo: string;
  descricao: string;
  /** Texto de apoio já normalizado (assuntos, seções, perguntas do FAQ). */
  apoio: string;
}

export interface GrupoNaBusca {
  titulo: string;
  resumo?: string;
  guias: GuiaNaBusca[];
}

export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PALAVRAS_DE_LIGACAO = new Set(
  "a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem e ou que se como qual quais quando onde eu me meu minha meus minhas seu sua seus suas ele ela isso isto esse essa este esta foi ser tem ter ha vai vou posso pode devo deve preciso quero sobre mais muito ja nao sim ao aos pelo pela carro carros veiculo veiculos automovel".split(
    " ",
  ),
);

/**
 * Tira o plural, para "laudos" achar "laudo" e "leilões" achar "leilão" (o
 * texto já chega sem acento: "leiloes").
 */
export function radical(palavra: string): string {
  if (palavra.length <= 3) return palavra;
  if (/(oes|aes)$/.test(palavra)) return `${palavra.slice(0, -3)}ao`;
  if (palavra.length > 4 && palavra.endsWith("ais")) return `${palavra.slice(0, -3)}al`;
  if (palavra.length > 4 && palavra.endsWith("eis")) return `${palavra.slice(0, -3)}el`;
  if (palavra.length > 5 && (palavra.endsWith("res") || palavra.endsWith("zes"))) return palavra.slice(0, -2);
  return palavra.endsWith("s") ? palavra.slice(0, -1) : palavra;
}

/**
 * A palavra digitada bate com a palavra do guia? Por palavra inteira, e não
 * por pedaço de texto: "moto" não pode achar "motor", nem "lei" achar
 * "leilão" (revisão de 02/10). Palavras parentes entram quando dividem um
 * começo longo: "financiamento" acha "financiado", "consignar" acha
 * "consignação". O começo comum precisa ter cinco letras e cobrir a palavra
 * menor quase inteira.
 */
export function palavrasBatem(digitada: string, doGuia: string): boolean {
  if (digitada === doGuia) return true;
  const menor = Math.min(digitada.length, doGuia.length);
  let comum = 0;
  while (comum < menor && digitada[comum] === doGuia[comum]) comum += 1;
  return comum >= Math.max(5, menor - 3);
}

/**
 * As palavras da dúvida que contam: sem ligação, sem repetição, já no
 * radical. Só palavra de ligação ("como", "carro") não é dúvida ainda: a
 * lista devolvida é vazia, e o índice segue inteiro enquanto a pessoa digita.
 */
export function termosDaConsulta(consulta: string): string[] {
  const palavras = normalizarParaBusca(consulta).split(" ").filter(Boolean);
  return [...new Set(palavras.filter((p) => p.length > 1 && !PALAVRAS_DE_LIGACAO.has(p)).map(radical))];
}

/** O texto de apoio de um guia, para o servidor montar uma vez. */
export function apoioDaBusca(guia: {
  sobre?: readonly string[];
  corpo?: ReadonlyArray<{ titulo?: string }>;
  faq?: ReadonlyArray<{ pergunta: string }>;
}): string {
  return normalizarParaBusca(
    [...(guia.sobre ?? []), ...(guia.corpo ?? []).map((s) => s.titulo ?? ""), ...(guia.faq ?? []).map((f) => f.pergunta)].join(" "),
  );
}

const palavrasDe = (texto: string) => normalizarParaBusca(texto).split(" ").filter(Boolean).map(radical);

/**
 * Quanto um guia responde à dúvida: 0 = fica de fora. Palavra no título vale
 * três, na descrição dois, no apoio um, para o guia que trata do assunto vir
 * antes do que só o cita. Entra o guia que tem pelo menos metade das palavras
 * da dúvida: com duas palavras, uma basta ("câmbio automático" acha o guia do
 * câmbio).
 */
export function pontosDoGuia(guia: GuiaNaBusca, termos: string[]): number {
  if (termos.length === 0) return 0;
  const titulo = palavrasDe(guia.titulo);
  const descricao = palavrasDe(guia.descricao);
  const apoio = palavrasDe(guia.apoio);
  const tem = (palavras: string[], termo: string) => palavras.some((p) => palavrasBatem(termo, p));
  let achadas = 0;
  let pontos = 0;
  for (const termo of termos) {
    const peso = tem(titulo, termo) ? 3 : tem(descricao, termo) ? 2 : tem(apoio, termo) ? 1 : 0;
    if (peso > 0) achadas += 1;
    pontos += peso;
  }
  // Quem tem todas as palavras vem antes de quem tem só parte.
  return achadas >= Math.ceil(termos.length / 2) ? pontos + achadas * 10 : 0;
}

/**
 * O que a lista mostra. Sem dúvida digitada, os grupos como o índice os
 * arruma (só o do tema, se houver um escolhido). Com dúvida, uma lista só, do
 * guia que mais responde para o que menos responde.
 */
export function filtrarGuias(
  grupos: readonly GrupoNaBusca[],
  { consulta, tema }: { consulta: string; tema: string | null },
): { grupos: GrupoNaBusca[]; resultados: GuiaNaBusca[] | null; total: number } {
  const doTema = tema ? grupos.filter((g) => g.titulo === tema) : [...grupos];
  const termos = termosDaConsulta(consulta);
  if (termos.length === 0) {
    return { grupos: doTema, resultados: null, total: doTema.reduce((n, g) => n + g.guias.length, 0) };
  }
  const resultados = doTema
    .flatMap((g) => g.guias)
    .map((guia, ordem) => ({ guia, ordem, pontos: pontosDoGuia(guia, termos) }))
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .map((r) => r.guia);
  return { grupos: [], resultados, total: resultados.length };
}
