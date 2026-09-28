/**
 * As portas do repasse fora do `/repasse` (spec 2026-09-24 §10): a faixa
 * escura depois da grade do `/estoque` e a faixa clara da home. Aqui mora a
 * REGRA — com que carros cada uma sai; o desenho mora em
 * `src/components/repasse/` e o texto em `paginaDoRepasse.ts`.
 *
 * As duas faixas aparecem SEMPRE, com qualquer número de carros abertos a
 * todos, inclusive zero (ordem do dono, 28/09: "faça aparecer independente do
 * número, já usamos a página para capturar interessados"). Com zero carros a
 * faixa do `/estoque` fica só com o texto e o botão, e a da home só com o
 * texto e o botão, sem cards. A única saída é o interruptor da área na tela A3
 * do painel (`areasDoSite.ts`).
 *
 * As duas páginas são as mais visitadas do site e rodam com
 * `revalidate = 60`: a leitura do repasse nunca pode derrubá-las. Por isso
 * `lerRepassesDasPortas` troca a pane por lista vazia — a faixa sai sem carros,
 * a página fica. É o oposto do `/repasse`, que deixa a pane subir porque lá
 * "nenhum repasse aberto" seria afirmar o que não se sabe; aqui, a faixa sem
 * carros não afirma nada: não diz quantos carros há (o `/estoque` cala a frase
 * da contagem e a home não desenha cards) e o botão só leva à página.
 */
import { lerRepassesPublicos } from "./leituraDosRepasses";
import { resumoDoLote } from "./loteDoRepasse";
import { registrarFalha } from "./observabilidade";
import type { Repasse } from "./repasse";

/** A faixa da home mostra no máximo este número de carros, os abertos a todos mais recentes (spec §10). */
export const MAXIMO_DE_CARROS_NA_FAIXA_DA_HOME = 3;

/** As duas páginas que leem o repasse para as portas — é o `rota` do registro de falha. */
export type RotaDasPortas = "/" | "/estoque";

export interface FaixaNoEstoque {
  /**
   * Carros abertos a todos agora: o N de "Hoje são N carros abertos". Zero é
   * faixa sem a frase da contagem, nunca "Hoje são 0".
   */
  abertos: number;
}

export interface FaixaNaHome {
  /** Até três abertos a todos mais recentes, na ordem do lote; vazio sem carro aberto. */
  carros: Repasse[];
  /**
   * O lote inteiro (publicado aberto, só-lojistas e reservado): o N de "VER OS
   * N CARROS", o mesmo do CTA do herói do `/repasse`, que o link abre. Só
   * vira CTA com carros na faixa; sem eles o botão é o do `/estoque`.
   */
  totalNoLote: number;
}

/** Só-lojistas, reservado e vendido não contam: a faixa convida quem pode comprar hoje. */
export function faixaNoEstoque(visiveis: readonly Repasse[], agora: Date): FaixaNoEstoque {
  const { abertos } = resumoDoLote(visiveis, agora);
  return { abertos: abertos.length };
}

/**
 * Os cards são só dos ABERTOS, não do lote: com um só-lojistas no lote a faixa
 * mostraria um card que o público não pode comprar. Já o `totalNoLote` é o
 * lote inteiro, o número que o `/repasse` mostra.
 */
export function faixaNaHome(visiveis: readonly Repasse[], agora: Date): FaixaNaHome {
  const { lote, abertos } = resumoDoLote(visiveis, agora);
  return { carros: abertos.slice(0, MAXIMO_DE_CARROS_NA_FAIXA_DA_HOME), totalNoLote: lote.length };
}

/**
 * A leitura pública do repasse, com a pane trocada por lista vazia — o molde
 * do sitemap (`src/app/sitemap.ts`, "Falha ao ler os repasses").
 *
 * Registra como `quebra`, e não só no `console`: sem isso a faixa ficaria sem
 * carros nas duas páginas mais vistas, sem ninguém saber — com a leitura em
 * pane a faixa sai como se não houvesse carro aberto. A enxurrada não vem, e quem a
 * segura é a cadência do ISR: com `revalidate = 60` há no máximo uma
 * regeneração por minuto por página, cerca de 2 linhas por minuto, todas num
 * grupo só da triagem (mesmo assunto, mesma mensagem). A carência de 10 s de
 * `observabilidade.ts` é por hash e por instância, então não junta duas
 * regenerações da mesma página, que ficam a 60 s uma da outra; o disjuntor de
 * 60 s cala a gravação quando o próprio banco está fora. A gravação é
 * esperada: tem teto de 2 s, nunca lança, e esperar garante que a linha saia
 * antes de a função congelar.
 *
 * O `catch` não pode lançar, senão a pane volta a derrubar a página. Por isso
 * nada ali supõe que a rejeição seja um `Error`: com `undefined`,
 * `erro.message` lançaria `TypeError`, e com um objeto sem protótipo até
 * `String(erro)` lançaria. O valor vai cru ao `console.error`, que formata
 * qualquer coisa, e cru ao `registrarFalha`, que nunca lança.
 */
export async function lerRepassesDasPortas(agora: Date, rota: RotaDasPortas): Promise<Repasse[]> {
  try {
    return await lerRepassesPublicos(agora, rota);
  } catch (erro: unknown) {
    console.error(`[Portas do repasse] Falha ao ler os repasses em ${rota}:`, erro instanceof Error ? erro.message : erro);
    await registrarFalha("quebra", "repasse-leitura-das-portas", erro, { rota, origem: "servidor" });
    return [];
  }
}
