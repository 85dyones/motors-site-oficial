/**
 * Os termos do FAQ que já são páginas — e viravam texto morto.
 *
 * O relatório de linkagem interna de 2026-09-05 achou o maior vazamento de
 * link equity do site num lugar que ninguém olha: as respostas do FAQ. O mesmo
 * bloco de perguntas é renderizado em ~50 páginas (marca, modelo, carroceria,
 * faixa, bairro, `/garantia`, `/financiamento`), e nele "Avaliação Express" e
 * "perícia cautelar" aparecem escritos por extenso, sem link.
 *
 * O ganho medido, sem arredondar para cima: `/garantia` e `/avaliacao` passam a
 * receber link contextual em ~50 páginas. `/financiamento` ganha UMA — a palavra
 * só aparece fora de auto-link no hub `/estoque/primeiro-carro`. A primeira
 * versão deste bloco dizia que as três recebiam entrada "só do rodapé", o que
 * era falso: `/avaliacao` está no cabeçalho de toda página.
 *
 * ---------------------------------------------------------------------------
 * Por que segmentar em vez de reescrever a string
 * ---------------------------------------------------------------------------
 * A tentação é pôr `<a>` no texto de `textoDosHubs.ts` e acabar. Não dá: as
 * MESMAS strings alimentam o `FAQPage` do JSON-LD (`schemaDePerguntas`), e a
 * exigência do Google para `FAQPage` é que o texto marcado seja idêntico ao
 * texto visível. Markup dentro da string ou envenena o JSON-LD ou faz os dois
 * divergirem — e divergência entre markup e página é o caminho mais curto para
 * uma ação manual no Search Console. O docblock de `schemaDePerguntas` já
 * avisava disso.
 *
 * Então a string continua sendo string. Quem decide onde há link é o RENDER, e
 * o invariante que mantém os dois honestos é `segmentos.join("") === texto`.
 * Há um teste só para ele.
 */

export interface DestinoNoTexto {
  /** Como o termo aparece escrito. O casamento ignora caixa. */
  termo: string;
  href: string;
}

/**
 * A lista é curta de propósito.
 *
 * Cada termo aqui vira link em ~50 páginas de uma vez; a régua para entrar é
 * ser uma página que responde à pergunta que o termo levanta, não ser uma
 * palavra-chave bonita. "Seminovo", "Curitiba" e "FIPE" ficam de fora: as duas
 * primeiras já são o assunto da própria página em que o FAQ aparece, e a
 * terceira não é nossa.
 *
 * Ordem importa quando um termo é sufixo do outro — por isso a segmentação
 * ordena por comprimento antes de casar, e não confia nesta ordem.
 *
 * **"laudo cautelar" não dispara em nenhuma página hoje**, e isso está medido:
 * zero ocorrências nos 45 pares de FAQ e nos 54 parágrafos de introdução
 * publicados. A expressão aparece só numa PERGUNTA gerada por `textoDosHubs`, e
 * pergunta não é segmentada. Fica registrado aqui em vez de removido porque o
 * cluster de guias sobre perícia (a fase seguinte do plano) usa esse exato
 * termo — mas ninguém deve olhar esta lista e supor que as quatro entradas
 * estão trabalhando. Três estão.
 */
export const TERMOS_COM_DESTINO: DestinoNoTexto[] = [
  { termo: "Avaliação Express", href: "/avaliacao" },
  { termo: "perícia cautelar", href: "/garantia" },
  // Sem uso no texto publicado hoje — ver a nota acima.
  { termo: "laudo cautelar", href: "/garantia" },
  { termo: "financiamento", href: "/financiamento" },
];

export interface SegmentoDeTexto {
  texto: string;
  /** Ausente = texto comum. Presente = o mesmo texto, dentro de um link. */
  href?: string;
}

function escaparParaRegex(termo: string): string {
  return termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Ocorrencia {
  inicio: number;
  fim: number;
  href: string;
}

/**
 * Quebra o texto nos termos conhecidos, devolvendo os pedaços em ordem.
 *
 * Três regras, todas por um motivo concreto:
 *
 *  1. **Uma ocorrência por termo.** "financiamento" aparece quatro vezes em
 *     algumas respostas; linkar todas transforma parágrafo em campo minado e
 *     dilui o sinal do próprio link. A primeira é a que o leitor encontra.
 *  2. **Nunca linkar para a página atual.** O FAQ de `/financiamento` fala de
 *     financiamento; auto-link é ruído para quem lê e sinal nulo para o
 *     rastreador. Sem `caminhoAtual`, nada é suprimido — a omissão só custa
 *     essa proteção, nunca a correção do texto.
 *  3. **Limite de palavra nas duas pontas.** Sem isso "financiamento" casaria
 *     dentro de "refinanciamento" e o link apareceria no meio da palavra.
 *
 * O texto nunca é alterado: some, junte os segmentos e você tem a entrada de
 * volta, byte a byte.
 */
export function segmentarComLinks(
  texto: string,
  caminhoAtual?: string,
  jaLinkados?: Set<string>,
): SegmentoDeTexto[] {
  const bruto = texto ?? "";
  if (!bruto) return [];

  const candidatos = [...TERMOS_COM_DESTINO]
    .filter((d) => d.href !== caminhoAtual)
    .filter((d) => !jaLinkados?.has(d.href))
    // Mais longo primeiro: se um termo for sufixo de outro, o específico casa
    // antes e o genérico encontra o espaço já ocupado.
    .sort((a, b) => b.termo.length - a.termo.length);

  const ocorrencias: Ocorrencia[] = [];

  for (const destino of candidatos) {
    const padrao = new RegExp(`\\b${escaparParaRegex(destino.termo)}\\b`, "i");
    const achado = padrao.exec(bruto);
    if (!achado) continue;

    const inicio = achado.index;
    const fim = inicio + achado[0].length;

    // Um trecho já reivindicado por um termo mais longo não é reivindicado de
    // novo — é o que impede link dentro de link.
    const colide = ocorrencias.some((o) => inicio < o.fim && fim > o.inicio);
    if (colide) continue;

    ocorrencias.push({ inicio, fim, href: destino.href });
  }

  if (ocorrencias.length === 0) return [{ texto: bruto }];

  ocorrencias.sort((a, b) => a.inicio - b.inicio);

  const segmentos: SegmentoDeTexto[] = [];
  let cursor = 0;

  for (const o of ocorrencias) {
    if (o.inicio > cursor) segmentos.push({ texto: bruto.slice(cursor, o.inicio) });
    // O texto do link sai do texto ORIGINAL, não do termo cadastrado: é assim
    // que "avaliação express" em caixa baixa continua em caixa baixa na tela.
    segmentos.push({ texto: bruto.slice(o.inicio, o.fim), href: o.href });
    jaLinkados?.add(o.href);
    cursor = o.fim;
  }

  if (cursor < bruto.length) segmentos.push({ texto: bruto.slice(cursor) });

  return segmentos;
}

/**
 * Um linkador com memória, para uma página inteira.
 *
 * `segmentarComLinks` sozinha limita a uma ocorrência por termo POR STRING, e
 * a revisão da F1 mediu o que isso vira numa página real: `/estoque/ate-60-mil`
 * saía com **quatro** âncoras idênticas para `/garantia` — duas nos parágrafos
 * de abertura, duas no FAQ —, porque "perícia cautelar" aparece em 21 das 54
 * introduções publicadas. Quatro links iguais na mesma página é o campo minado
 * que a regra 1 diz querer evitar; a régua estava na unidade errada.
 *
 * Quem monta a página cria um linkador e usa o MESMO em todos os blocos. O
 * primeiro link de cada destino fica onde o leitor chega primeiro — a
 * introdução, antes do FAQ — e os demais viram texto comum.
 *
 * Seguro por ser server-side: `PaginaDeEstoque` e `/estoque` são server
 * components e renderizam uma vez por requisição. Num client component o `Set`
 * sobreviveria a uma segunda passada do StrictMode e comeria links da primeira
 * — se algum dia precisar disso no cliente, crie o linkador dentro do render,
 * nunca em módulo.
 */
export function criarLinkador(caminhoAtual?: string) {
  const jaLinkados = new Set<string>();
  return (texto: string): SegmentoDeTexto[] =>
    segmentarComLinks(texto, caminhoAtual, jaLinkados);
}
