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
 *   · um parágrafo que começa com "### " vira subtítulo (`<h3>`).
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
  | { tipo: "subtitulo"; texto: string };

const ITEM = /^\s*-\s+/;
const SUBTITULO = /^###\s+/;

export function blocosDoParagrafo(paragrafo: string): BlocoDoGuia[] {
  const bruto = (paragrafo ?? "").trim();
  if (!bruto) return [];

  if (SUBTITULO.test(bruto) && !bruto.includes("\n")) {
    return [{ tipo: "subtitulo", texto: bruto.replace(SUBTITULO, "").trim() }];
  }

  const blocos: BlocoDoGuia[] = [];
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

  for (const linha of bruto.split("\n")) {
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

/** O texto do parágrafo sem as marcas: o que se lê, para testes e contagens. */
export function textoSemMarcas(paragrafo: string): string {
  return blocosDoParagrafo(paragrafo)
    .map((b) => (b.tipo === "lista" ? b.itens.join(" ") : b.texto))
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
