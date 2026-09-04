import type { Veiculo } from "../types";
import { nomeComAno } from "./nomeDoVeiculo";
import { getVeiculoPdpUrl } from "./supabase";

/**
 * As duas decisões da vitrine que não podiam ficar só na marcação.
 *
 * Ambas são regra de projeto, não estilo — e as duas já foram quebradas por
 * uma edição de JSX que parecia inofensiva. Estão aqui porque função pura se
 * testa por comportamento; `grep` na marcação passa mesmo depois de a regra
 * virar o contrário dela.
 *
 * ---------------------------------------------------------------------------
 * 1. Toda ficha à venda precisa de um `<a>` no HTML servido
 * ---------------------------------------------------------------------------
 * `/estoque` renderiza a grade dentro de um `<Suspense>`, e o fallback mostra
 * a primeira leva — 9 cards. Medido contra a produção em 2026-09-04: o HTML
 * servido trazia **9** links de ficha e **34** URLs no `ItemList`. As outras
 * 25 existiam só no JSON-LD.
 *
 * `ItemList` informa, mas não é link de navegação: não passa autoridade e não
 * dá caminho a quem lê a página sem executar JavaScript. Na prática a regra 6
 * do projeto — "vitrine ordena, nunca esconde" — valia para quem roda JS e não
 * valia para o resto.
 *
 * `indiceDaVitrine` é a lista que o servidor publica como link de verdade.
 * Cobre o estoque disponível INTEIRO de propósito: recortá-la é exatamente o
 * defeito que ela existe para impedir, e é o que o teste vigia.
 *
 * ---------------------------------------------------------------------------
 * 2. Recolher no mobile não pode recolher no desktop
 * ---------------------------------------------------------------------------
 * O `<aside>` dos filtros vem ANTES da grade num `flex flex-col lg:flex-row`:
 * no desktop vira a coluna da esquerda, no celular vira um bloco inteiro
 * empilhado em cima do primeiro carro. O pedido do dono em 2026-09-04 foi o
 * estoque aparecendo de cara no celular, com os filtros atrás de um botão.
 *
 * A tentação é remover o `<aside>` da árvore quando está recolhido. Não dá:
 * decidir isso exige medir a janela no cliente, o que dá divergência de
 * hidratação e um piscar de campos na primeira pintura — a mesma armadilha
 * que `BuscaRegua.tsx` documenta no `soDesktop`. Some por CSS, e o estado dos
 * filtros marcados sobrevive ao recolher.
 *
 * `painelDeFiltro` guarda o par que não pode se separar: esconder no mobile e
 * continuar visível no desktop.
 */

/** Uma ficha no índice servido: o link e o texto que o rastreador lê. */
export interface FichaNoIndice {
  id: string;
  /** Caminho da ficha, o mesmo que a grade e o `ItemList` usam. */
  href: string;
  /** O nome sem a versão repetida — `nomeComAno`, a fonte única do projeto. */
  rotulo: string;
}

/**
 * O índice de fichas que o HTML de `/estoque` precisa publicar.
 *
 * Um item por veículo disponível, na ordem em que a vitrine os recebe. Estoque
 * vazio devolve lista vazia — o bloco de navegação some junto, porque
 * cabeçalho seguido de nada é ruído para quem lê e landmark vazio para quem
 * usa leitor de tela.
 */
export function indiceDaVitrine(disponiveis: Veiculo[]): FichaNoIndice[] {
  return disponiveis.map((veiculo) => ({
    id: String(veiculo.id),
    href: getVeiculoPdpUrl(veiculo),
    rotulo: nomeComAno(veiculo),
  }));
}

/** Como o painel de filtro se apresenta agora. */
export interface PainelDeFiltro {
  /** Classes de visibilidade do `<aside>`. */
  classe: string;
  /** O que o botão do mobile diz. */
  rotulo: string;
}

/**
 * A visibilidade do painel de filtro, dado o que o cliente escolheu.
 *
 * `lg:block` aparece nos DOIS estados de propósito: no desktop o filtro é a
 * coluna da esquerda e não recolhe nunca. O botão que alterna isto só existe
 * abaixo do `lg`.
 */
export function painelDeFiltro(aberto: boolean): PainelDeFiltro {
  return {
    classe: aberto ? "lg:block" : "hidden lg:block",
    rotulo: aberto ? "FECHAR FILTROS" : "FILTROS",
  };
}
