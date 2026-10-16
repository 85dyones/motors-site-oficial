/**
 * A folha de impressão da ficha fica no DOM da tela, escondida, com as fotos
 * em `loading="lazy"` (16/10/2026). Escondida, a foto preguiçosa nunca é
 * baixada: medido na produção em 16/10, antes disto a ficha baixava os
 * quatro originais `_O_` do carro57 (~1,6 MB) só para a folha que ninguém
 * via, na página onde os anúncios aterrissam.
 *
 * O preço disso é que, na hora de imprimir, as fotos precisam existir. O
 * Chromium carrega sozinho toda imagem preguiçosa ao abrir a impressão; os
 * outros navegadores não prometem o mesmo. Então quem imprime pelo botão da
 * ficha passa por aqui: as fotos viram `eager`, a decodificação é esperada
 * (com prazo, para a impressão nunca ficar presa numa foto que falhou) e só
 * então o diálogo abre. O atalho do teclado (Ctrl+P) cai no `beforeprint`,
 * que a folha escuta para fazer o mesmo — sem a espera, que ali não existe.
 */
export const SELETOR_DAS_FOTOS_DA_FOLHA = '#ficha-impressa img[loading="lazy"]';

export function acordarFotosDaFolha(doc: Document = document): HTMLImageElement[] {
  const fotos = Array.from(doc.querySelectorAll<HTMLImageElement>(SELETOR_DAS_FOTOS_DA_FOLHA));
  // `setAttribute`, e não `foto.loading`: o atributo é o que o seletor acima
  // lê, e é o que o navegador consulta ao decidir buscar a imagem.
  for (const foto of fotos) foto.setAttribute("loading", "eager");
  return fotos;
}

export async function prepararFotosParaImpressao(doc: Document = document, prazoMs = 4000): Promise<void> {
  const pendentes = acordarFotosDaFolha(doc)
    .filter((foto) => !foto.complete && typeof foto.decode === "function")
    .map((foto) => foto.decode().catch(() => undefined));
  if (pendentes.length === 0) return;
  await Promise.race([Promise.all(pendentes), new Promise((resolve) => setTimeout(resolve, prazoMs))]);
}

export async function imprimirFicha(): Promise<void> {
  if (typeof window === "undefined") return;
  await prepararFotosParaImpressao();
  window.print();
}
