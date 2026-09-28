/**
 * As portas do repasse fora do `/repasse` (spec 2026-09-24 §10): a faixa
 * escura depois da grade do `/estoque` e a faixa clara da home. Aqui mora a
 * REGRA — quando cada uma aparece e com que carros; o desenho mora em
 * `src/components/repasse/` e o texto em `paginaDoRepasse.ts`.
 *
 * As duas páginas são as mais visitadas do site e rodam com
 * `revalidate = 60`: a leitura do repasse nunca pode derrubá-las. Por isso
 * `lerRepassesDasPortas` troca a pane por lista vazia — a faixa some, a página
 * fica. É o oposto do `/repasse`, que deixa a pane subir porque lá "nenhum
 * repasse aberto" seria afirmar o que não se sabe; aqui, faixa ausente não
 * afirma nada (nem a spec desenha estado vazio para as portas).
 */
import { lerRepassesPublicos } from "./leituraDosRepasses";
import { resumoDoLote } from "./loteDoRepasse";
import { registrarFalha } from "./observabilidade";
import type { Repasse } from "./repasse";

/** A faixa do `/estoque` aparece com pelo menos este número de carros abertos a todos (spec §10). */
export const PISO_DA_FAIXA_NO_ESTOQUE = 1;

/** A faixa da home mostra exatamente este número de carros, e só aparece com ele (spec §10). */
export const CARROS_NA_FAIXA_DA_HOME = 3;

/** As duas páginas que leem o repasse para as portas — é o `rota` do registro de falha. */
export type RotaDasPortas = "/" | "/estoque";

export interface FaixaNoEstoque {
  /** Carros abertos a todos agora: o N de "Hoje são N carros abertos". */
  abertos: number;
}

export interface FaixaNaHome {
  /** Os três abertos a todos mais recentes, na ordem do lote. */
  carros: Repasse[];
  /**
   * O lote inteiro (publicado aberto, só-lojistas e reservado): o N de "VER OS
   * N CARROS", o mesmo do CTA do herói do `/repasse`, que o link abre.
   */
  totalNoLote: number;
}

/** `null` = sem faixa. Só-lojistas, reservado e vendido não contam: a faixa convida quem pode comprar hoje. */
export function faixaNoEstoque(visiveis: readonly Repasse[], agora: Date): FaixaNoEstoque | null {
  const { abertos } = resumoDoLote(visiveis, agora);
  return abertos.length >= PISO_DA_FAIXA_NO_ESTOQUE ? { abertos: abertos.length } : null;
}

/**
 * `null` = a área inteira some. O piso é sobre os ABERTOS, não sobre o lote:
 * com dois abertos e um só-lojistas a faixa mostraria um card que o público
 * não pode comprar.
 */
export function faixaNaHome(visiveis: readonly Repasse[], agora: Date): FaixaNaHome | null {
  const { lote, abertos } = resumoDoLote(visiveis, agora);
  if (abertos.length < CARROS_NA_FAIXA_DA_HOME) return null;
  return { carros: abertos.slice(0, CARROS_NA_FAIXA_DA_HOME), totalNoLote: lote.length };
}

/**
 * A leitura pública do repasse, com a pane trocada por lista vazia — o molde
 * do sitemap (`src/app/sitemap.ts`, "Falha ao ler os repasses").
 *
 * Registra como `quebra`, e não só no `console`: sem isso a faixa sumiria das
 * duas páginas mais vistas sem ninguém saber. A enxurrada não vem, e quem a
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
