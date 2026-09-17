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
 * ⚠️ **Meça isto no HTML SERVIDO, nunca no `src/`.** Uma versão anterior deste
 * comentário afirmava que "laudo cautelar" não disparava em página nenhuma, com
 * números e tudo. Era falso: a expressão é o texto da ÚNICA âncora de
 * `/garantia` em `/estoque/ate-60-mil` — verificado no HTML do build,
 * `href="/garantia">laudo cautelar<`.
 *
 * O erro tem uma causa que se repete neste repositório: os parágrafos de hub
 * têm override por caminho na tabela `textos_de_hub` (semeada em
 * `20260901130000`), e é o override que a página serve. Contar ocorrências em
 * `textoDosHubs.ts` mede o GERADOR, não o publicado — e o texto "…é aí que o
 * laudo cautelar deixa de ser detalhe" não existe em `src/` nenhum.
 *
 * As quatro entradas trabalham.
 *
 * ---------------------------------------------------------------------------
 * 17/09/2026 — as oito peças da Onda 1 entram como destino
 * ---------------------------------------------------------------------------
 * Com a Onda 1 publicada, as peças passaram a se citar PELO TÍTULO, em texto
 * puro: o corpo do guia não aceita link escrito, e quem decide onde há link é
 * esta lista. Medido no que está publicado (banco, 17/09): 13 citações de uma
 * peça dentro de outra, nenhuma linkando. Cada título entra aqui, e a citação
 * vira a âncora — que é exatamente o que a R7 do pacote pede, âncora que
 * descreve o destino.
 *
 * Os quatro termos temáticos que entram junto — "chassi remarcado",
 * "vistoria de transferência", "passagem por leilão" e "perícia cautelar em
 * Curitiba" — são os que aparecem FORA dos guias: 7, 14, 20 e 5 vezes no
 * corpo dos guias, e "chassi remarcado" também no texto do hub
 * `/estoque/ate-60-mil`. Eles levam o leitor do hub para a peça.
 *
 * **Duas regras que a implementação impõe, e que não são de estilo:**
 *
 * 1. O casamento é `\b…\b`. Termo que comece ou termine em pontuação NUNCA
 *    casa: o título "Meu carro reprovou no laudo cautelar. E agora?" entra
 *    cortado no ponto, e é por isso que o termo é a parte sem a pergunta.
 * 2. Só entra destino que EXISTE. Link para peça de onda futura é link
 *    quebrado, e o pacote proíbe (README do pacote, "Links para peças que
 *    ainda não existem"). "vício oculto", "correia dentada" e "dupla
 *    embreagem" ficam de fora até a Onda 2 subir.
 *
 * "laudo cautelar" e "perícia cautelar" continuam apontando para `/garantia`,
 * a página comercial: o limite é de um link por DESTINO por página, então a
 * peça citada ganha o seu link sem tirar o da garantia.
 */
export const TERMOS_COM_DESTINO: DestinoNoTexto[] = [
  { termo: "Avaliação Express", href: "/avaliacao" },
  { termo: "perícia cautelar", href: "/garantia" },
  { termo: "laudo cautelar", href: "/garantia" },
  { termo: "financiamento", href: "/financiamento" },

  // ---- Onda 1: o título de cada peça, como as outras a citam --------------
  { termo: "Laudo cautelar: o que verifica e o que não verifica", href: "/guias/laudo-cautelar-carro-usado" },
  { termo: "Laudo cautelar: aprovado, com apontamento ou reprovado", href: "/guias/resultados-laudo-cautelar" },
  { termo: "Perícia cautelar em Curitiba: onde fazer e quanto custa", href: "/guias/pericia-cautelar-curitiba" },
  { termo: "Como saber se um carro passou por leilão", href: "/guias/consultar-carro-leilao-sinistro" },
  { termo: "Chassi remarcado: quando é legal e quando é crime", href: "/guias/chassi-remarcado" },
  { termo: "Laudo cautelar x vistoria de transferência", href: "/guias/cautelar-x-vistoria-transferencia" },
  { termo: "Meu carro reprovou no laudo cautelar", href: "/guias/carro-reprovado-cautelar-como-vender" },
  { termo: "O que reprova um carro na perícia cautelar", href: "/guias/o-que-reprova-pericia-cautelar" },

  // ---- Onda 1: o assunto, para quem chega pelo hub ------------------------
  { termo: "chassi remarcado", href: "/guias/chassi-remarcado" },
  { termo: "vistoria de transferência", href: "/guias/cautelar-x-vistoria-transferencia" },
  { termo: "passagem por leilão", href: "/guias/consultar-carro-leilao-sinistro" },
  { termo: "perícia cautelar em Curitiba", href: "/guias/pericia-cautelar-curitiba" },
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
  /* Destinos já reivindicados NESTA chamada.
     `jaLinkados` cuida da página; este cuida da string, e são coisas
     diferentes: dois TERMOS distintos podem apontar para o mesmo lugar.
     "A perícia cautelar é independente e o laudo cautelar fica publicado"
     saía com duas âncoras para `/garantia` no mesmo parágrafo, porque o filtro
     de `jaLinkados` roda uma vez, antes do laço, e nenhum dos dois termos
     estava lá quando ele rodou. */
  const destinosDaChamada = new Set<string>();

  for (const destino of candidatos) {
    if (destinosDaChamada.has(destino.href)) continue;

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
    destinosDaChamada.add(destino.href);
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
 * `segmentarComLinks` sozinha limita a uma ocorrência por termo POR STRING, e a
 * revisão da F1 mediu o que isso vira numa página real: `/estoque/ate-60-mil`
 * saía com **três** âncoras para `/garantia` — uma na abertura, duas no FAQ —,
 * porque "perícia cautelar" e "laudo cautelar" apontam para o mesmo lugar e
 * aparecem espalhados pelo texto do hub. Três links iguais na mesma página é o
 * campo minado que a regra 1 diz querer evitar; a régua estava na unidade
 * errada. (Uma versão anterior desta nota dizia "quatro, duas e duas" — quatro
 * era o total de âncoras, contando a de `/avaliacao`.)
 *
 * Quem monta a página cria um linkador e usa o MESMO em todos os blocos. O
 * primeiro link de cada destino fica onde o leitor chega primeiro — a
 * introdução, antes do FAQ — e os demais viram texto comum.
 *
 * ---------------------------------------------------------------------------
 * O invariante que mantém isso seguro
 * ---------------------------------------------------------------------------
 * **O linkador nasce DENTRO do corpo do componente, a cada render.** É só isso.
 * Enquanto essa linha for verdade, o `Set` morre com o render que o criou e não
 * há vazamento entre requisições nem entre páginas — verificado num único
 * processo de build, em que `/estoque`, as três faixas e as páginas de bairro
 * saíram todas com link (se o `Set` atravessasse renders, da segunda página em
 * diante o resultado seria vazio). O que cada uma recebe varia com o texto que
 * publica: `/seminovos-curitiba` sai com dois, `/seminovos-bacacheri` com um —
 * o texto dela não escreve "perícia cautelar" nem "laudo cautelar" por extenso.
 * A prova do não-vazamento é a página seguinte não sair VAZIA, não um número
 * fixo de links por página.
 *
 * O que NÃO sustenta a segurança, apesar de parecer: "é server component" e
 * "renderiza uma vez por requisição". Uma versão anterior deste bloco dizia
 * isso, e ainda advertia que num client component o StrictMode comeria links —
 * também falso, porque o StrictMode reinvoca o corpo do componente e portanto
 * cria um `Set` novo. O perigo real, no servidor ou no cliente, é um só: mover
 * `criarLinkador()` para escopo de módulo, ou memoizar o resultado dele.
 */
export function criarLinkador(caminhoAtual?: string) {
  const jaLinkados = new Set<string>();
  return (texto: string): SegmentoDeTexto[] =>
    segmentarComLinks(texto, caminhoAtual, jaLinkados);
}
