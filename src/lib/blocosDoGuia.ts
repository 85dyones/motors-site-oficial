/**
 * O parágrafo do guia em blocos de leitura (30/09/2026).
 *
 * Os guias eram só `<h2>` e parágrafo corrido, 14px numa coluna de 680px:
 * o rastreador lia tudo, e quem lê desistia no terceiro bloco. O dono pediu
 * texto escaneável sem perder o que os buscadores e as IAs leem.
 *
 * A saída é uma convenção mínima DENTRO da string, que o painel já preserva
 * (ele separa parágrafos por linha em branco e mantém a quebra simples):
 *
 *   · linhas que começam com "- " viram lista (`<ul>`); as linhas antes da
 *     primeira viram a frase que abre a lista;
 *   · um parágrafo que começa com "### " vira subtítulo (`<h3>`); se o texto
 *     seguir na linha de baixo, sem linha em branco, ele vira parágrafo;
 *   · um parágrafo "---" fecha o último subtítulo: o que vem depois volta a
 *     ser da seção inteira (a conclusão não fica pendurada no último h3).
 *
 * Nada além disso: sem negrito, sem link escrito à mão. O link continua
 * saindo do linkador, sobre o texto de cada bloco.
 *
 * O corpo do guia só é lido pela página. O JSON-LD não publica `articleBody`
 * e o `llms-full.txt` não inclui os guias, então as marcas não vazam.
 */

export type BlocoDoGuia =
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "separador" };

const ITEM = /^\s*-\s+/;
const SUBTITULO = /^###\s+/;
const SEPARADOR = /^-{3,}$/;

export function blocosDoParagrafo(paragrafo: string): BlocoDoGuia[] {
  const bruto = (paragrafo ?? "").trim();
  if (!bruto) return [];

  if (SEPARADOR.test(bruto)) return [{ tipo: "separador" }];

  const blocos: BlocoDoGuia[] = [];
  let resto = bruto;
  if (SUBTITULO.test(bruto)) {
    // Quem escreve pelo painel pode colar o texto logo abaixo do subtítulo,
    // sem a linha em branco. A primeira linha é o subtítulo; o resto segue.
    const quebra = bruto.indexOf("\n");
    const primeira = quebra === -1 ? bruto : bruto.slice(0, quebra);
    blocos.push({ tipo: "subtitulo", texto: primeira.replace(SUBTITULO, "").trim() });
    if (quebra === -1) return blocos;
    resto = bruto.slice(quebra + 1);
  }

  let corrido: string[] = [];
  let itens: string[] = [];

  const fecharCorrido = () => {
    if (corrido.length) blocos.push({ tipo: "paragrafo", texto: corrido.join(" ") });
    corrido = [];
  };
  const fecharLista = () => {
    if (itens.length) blocos.push({ tipo: "lista", itens });
    itens = [];
  };

  for (const linha of resto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa) continue;
    if (ITEM.test(linha)) {
      fecharCorrido();
      itens.push(limpa.replace(ITEM, "").trim());
    } else {
      fecharLista();
      corrido.push(limpa);
    }
  }
  fecharCorrido();
  fecharLista();
  return blocos;
}

/**
 * Os blocos de uma seção inteira. Duas listas vizinhas viram uma: quem separa
 * os itens com linha em branco no painel ganharia uma lista por item.
 */
export function blocosDaSecao(paragrafos: string[]): BlocoDoGuia[] {
  const saida: BlocoDoGuia[] = [];
  for (const bloco of paragrafos.flatMap(blocosDoParagrafo)) {
    const anterior = saida.at(-1);
    if (bloco.tipo === "lista" && anterior?.tipo === "lista") anterior.itens.push(...bloco.itens);
    else saida.push(bloco.tipo === "lista" ? { tipo: "lista", itens: [...bloco.itens] } : bloco);
  }
  return saida;
}

/** O texto do parágrafo sem as marcas: o que se lê, para testes e contagens. */
export function textoSemMarcas(paragrafo: string): string {
  return blocosDoParagrafo(paragrafo)
    .map((b) => (b.tipo === "lista" ? b.itens.join(" ") : b.tipo === "separador" ? "" : b.texto))
    .filter(Boolean)
    .join(" ");
}

/**
 * A âncora de uma seção: o título em minúsculas, sem acento, com hífen.
 * Repetida, ganha o número da vez ("-2"), para o índice nunca apontar duas
 * seções para o mesmo lugar.
 */
export function ancorasDasSecoes(titulos: string[]): string[] {
  const vistas = new Map<string, number>();
  return titulos.map((titulo) => {
    const base =
      titulo
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "secao";
    const vez = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, vez);
    return vez === 1 ? base : `${base}-${vez}`;
  });
}
