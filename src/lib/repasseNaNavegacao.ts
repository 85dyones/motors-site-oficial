/**
 * O repasse no cabeçalho e no rodapé (spec 2026-09-24 §10; prancha "Portas
 * de entrada", seção 1).
 *
 * Todo texto da seção de repasse mora em `paginaDoRepasse.ts` (spec §7.3), e
 * este também — por reexportação. Ele NASCE aqui, num módulo sem import, por
 * causa do pacote do navegador: `Header.tsx` e `Footer.tsx` são client
 * components montados pelo layout em TODA página, e `paginaDoRepasse.ts` já é
 * importado por cinco ilhas cliente do `/repasse` (`ExameNoPatio`,
 * `GaleriaDoRepasse`, `ListaDoRepasse`, `LoteDoRepasse`, `TrilhaDoHeroi`). O
 * webpack mantém um módulo por compilação, com a UNIÃO das exportações que
 * alguém usa: o menu que importasse `paginaDoRepasse.ts` levaria o texto
 * dessas ilhas para o pacote da home, do `/estoque` e de toda ficha.
 *
 * `paginaDoRepasse.ts` reexporta as duas constantes, e é por lá que as travas
 * de texto as leem (`tests/textoDoRepasse.ts` recolhe tudo o que ele exporta).
 * Sem travessão em nenhuma string, como lá.
 */
export const CAMINHO_DO_REPASSE = "/repasse";

export const REPASSE_NA_NAVEGACAO = {
  /** O item da barra do desktop e do menu do celular. */
  menu: "REPASSE",
  /** À direita do item, SÓ no menu do celular (decisão 1 do plano do PR 4). */
  apoioNoCelular: "abaixo da FIPE, à vista",
  /** Coluna INSTITUCIONAL do rodapé (decisão 5 do plano do PR 4). */
  rodape: "Repasse",
} as const;
