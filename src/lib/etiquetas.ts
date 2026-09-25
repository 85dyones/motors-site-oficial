/**
 * As regras puras das etiquetas do lead (2026-09-25) — sem rede, sem segredo.
 *
 * Moram à parte de `etiquetasDoChatwoot.ts` para o card (componente de
 * cliente) importar daqui sem arrastar o cliente da API para o navegador.
 *
 * ---------------------------------------------------------------------------
 * Duas réguas, e não uma
 * ---------------------------------------------------------------------------
 * - O que o SITE PÕE numa conversa passa por `normalizarEtiqueta`: minúsculas,
 *   letras, números, hífen e sublinhado — o formato das etiquetas criadas na
 *   conta do Chatwoot. "Quer Comprar" não entra.
 * - O que a conversa JÁ TEM passa por `limparEtiquetas`, que só tira lixo
 *   (não-texto, vazio, repetido). A conversa aceita qualquer título pela API,
 *   e o POST do Chatwoot substitui a lista inteira: se a leitura normalizasse,
 *   "Lead Quente" sumiria da conversa na primeira gravação, calada — e o
 *   rastro nem mostraria a perda. Achado da revisão de 25/09.
 */

/** O que a passagem do SDR para o Comercial garante na conversa. */
export const ETIQUETAS_DA_PASSAGEM = ["resgate", "reaquecido"] as const;

/** Quantas etiquetas um pedido do card pode incluir, e quantas retirar. */
export const MAXIMO_POR_PEDIDO = 20;

/** O maior título que se aceita ler ou retirar — o limite da coluna no Chatwoot. */
const MAIOR_TITULO = 255;

/** O que o card pede: pôr umas, tirar outras. Nunca a lista inteira. */
export interface MudancaDeEtiquetas {
  incluir?: readonly string[];
  retirar?: readonly string[];
}

/**
 * Uma etiqueta que o site pode PÔR, ou `null` se não for uma.
 *
 * Recusar aqui, e não deixar a API recusar, dá à tela uma mensagem que ela
 * sabe mostrar.
 */
export function normalizarEtiqueta(bruta: unknown): string | null {
  if (typeof bruta !== "string") return null;
  const etiqueta = bruta.trim().toLowerCase();
  if (!etiqueta || etiqueta.length > 50) return null;
  return /^[\p{L}\p{N}_-]+$/u.test(etiqueta) ? etiqueta : null;
}

/** Só as que o site pode pôr, sem repetir, na ordem em que vieram. */
export function normalizarEtiquetas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<string>();
  for (const bruta of lista) {
    const etiqueta = normalizarEtiqueta(bruta);
    if (etiqueta) vistas.add(etiqueta);
  }
  return [...vistas];
}

/** A mesma etiqueta? O Chatwoot não distingue caixa no título. */
export function mesmaEtiqueta(a: string, b: string): boolean {
  return a.toLocaleLowerCase("pt-BR") === b.toLocaleLowerCase("pt-BR");
}

/**
 * O que a conversa TEM, como ela tem: sem não-texto, sem vazio, sem repetido
 * (a primeira grafia ganha). Nenhum título válido é trocado nem descartado.
 */
export function limparEtiquetas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const limpas: string[] = [];
  for (const bruta of lista) {
    if (typeof bruta !== "string") continue;
    const etiqueta = bruta.trim();
    if (!etiqueta || etiqueta.length > MAIOR_TITULO) continue;
    if (!limpas.some((e) => mesmaEtiqueta(e, etiqueta))) limpas.push(etiqueta);
  }
  return limpas;
}

/**
 * A lista que fica: as atuais, menos as retiradas, mais as incluídas que
 * faltam. As atuais que ninguém citou ficam como estão, na mesma ordem.
 */
export function aplicarMudanca(atuais: readonly string[], mudanca: MudancaDeEtiquetas): string[] {
  const retirar = mudanca.retirar ?? [];
  const ficam = limparEtiquetas(atuais).filter((e) => !retirar.some((r) => mesmaEtiqueta(e, r)));
  return limparEtiquetas([...ficam, ...(mudanca.incluir ?? [])]);
}

/** As duas listas têm as mesmas etiquetas, em qualquer ordem? */
export function mesmasEtiquetas(a: readonly string[], b: readonly string[]): boolean {
  return (
    a.length === b.length &&
    a.every((x) => b.some((y) => mesmaEtiqueta(x, y))) &&
    b.every((y) => a.some((x) => mesmaEtiqueta(x, y)))
  );
}

/** Esta é uma das duas que medem o trabalho do SDR? */
export function ehEtiquetaDaPassagem(etiqueta: string): boolean {
  return ETIQUETAS_DA_PASSAGEM.some((p) => mesmaEtiqueta(p, etiqueta));
}

/**
 * O pedido do card, validado. `incluir` tem de estar no formato das
 * etiquetas da conta; `retirar` só precisa ser texto — é para tirar o que a
 * conversa já tem, na grafia que ela tem.
 */
export function lerMudanca(
  corpo: unknown,
): { ok: true; mudanca: Required<MudancaDeEtiquetas> } | { ok: false; erro: string } {
  const c = (corpo ?? {}) as { incluir?: unknown; retirar?: unknown };
  const incluirBruto = c.incluir ?? [];
  const retirarBruto = c.retirar ?? [];
  if (!Array.isArray(incluirBruto) || !Array.isArray(retirarBruto)) {
    return { ok: false, erro: "incluir e retirar devem ser listas" };
  }
  if (incluirBruto.length > MAXIMO_POR_PEDIDO || retirarBruto.length > MAXIMO_POR_PEDIDO) {
    return { ok: false, erro: `No máximo ${MAXIMO_POR_PEDIDO} etiquetas por pedido.` };
  }
  const invalida = incluirBruto.find((e) => normalizarEtiqueta(e) === null);
  if (invalida !== undefined) {
    return {
      ok: false,
      erro: `Etiqueta inválida: "${String(invalida)}". Use letras minúsculas, números, hífen ou sublinhado.`,
    };
  }
  if (retirarBruto.some((e) => typeof e !== "string" || !e.trim() || e.trim().length > MAIOR_TITULO)) {
    return { ok: false, erro: "retirar só aceita o título da etiqueta" };
  }
  const retirar = limparEtiquetas(retirarBruto);
  const incluir = normalizarEtiquetas(incluirBruto);
  if (incluir.length === 0 && retirar.length === 0) {
    return { ok: false, erro: "Diga o que incluir ou retirar." };
  }
  return { ok: true, mudanca: { incluir, retirar } };
}
