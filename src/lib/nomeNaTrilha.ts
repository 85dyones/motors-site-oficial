/**
 * O último pedaço da trilha do topo (`PAINEL / GERAL / LEADS / {NOME}`).
 *
 * A trilha é derivada da ROTA em `AdminLayoutClientWrapper`, e a rota do
 * detalhe do lead só tem o id. O nome chega depois, com os dados, a um
 * componente que está abaixo da casca. Este módulo é a ponte: quem sabe o nome
 * o publica, e a trilha o lê com `useSyncExternalStore`. Um armazém de uma
 * frase só, em vez de um contexto em volta do painel inteiro.
 */

let nome: string | null = null;
const ouvintes = new Set<() => void>();

/** Publica o nome (ou o retira, com `null`: ao sair da tela). */
export function definirNomeNaTrilha(novo: string | null): void {
  const limpo = novo && novo.trim() ? novo.trim() : null;
  if (limpo === nome) return;
  nome = limpo;
  for (const ouvinte of ouvintes) ouvinte();
}

export function assinarNomeNaTrilha(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function lerNomeNaTrilha(): string | null {
  return nome;
}
