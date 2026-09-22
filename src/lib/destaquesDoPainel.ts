import { VAGAS_NA_GRADE } from "./destaquesDaSemana";
import type { EstadoDoVeiculo, LinhaDeEstoque } from "./estoqueTabela";

/**
 * As três listas de curadoria do painel — e o que cada uma alimenta.
 *
 * ---------------------------------------------------------------------------
 * Por que três, e não uma
 * ---------------------------------------------------------------------------
 * Até 2026-09-22 `carousel_vehicles` servia ao banner da home (teto de 3) E à
 * TV do showroom (sem teto). Curar bem para as duas é impossível: marcar
 * muitos entope o banner, marcar poucos esvazia a TV. Medido em produção em
 * 21/09, o resultado era uma lista de 9 ids em que 5 eram carros arquivados ou
 * vendidos e o carro marcado por último nunca chegava à home.
 *
 * Ver `docs/superpowers/specs/2026-09-21-destaques-e-filtros-do-painel-design.md`.
 */
export type Vitrine = "banner" | "grade" | "tv";

/**
 * Quantas vagas cada vitrine tem. `null` é "sem teto".
 *
 * `grade` IMPORTA `VAGAS_NA_GRADE` em vez de redigitar o seis: dois seis em
 * arquivos diferentes divergem no dia em que um deles mudar, e o sintoma seria
 * a tela desenhando a régua numa vaga e a home cortando noutra.
 *
 * A TV é `null` de propósito, e não um número grande: ela pagina a lista
 * inteira, então o limite dela não é de vagas — é de tempo de volta
 * (`voltaCompletaEmSegundos`).
 */
export const VAGAS: Record<Vitrine, number | null> = {
  banner: 4,
  grade: VAGAS_NA_GRADE,
  tv: null,
};

/** Segundos que a TV gasta em cada carro. Espelha `INTERVALO_MS` de `VitrineTV`. */
const SEGUNDOS_POR_CARRO_NA_TV = 8;

export type DestinoDoDestaque =
  /** Dentro do teto da sua vitrine — ou numa vitrine sem teto. */
  | "no_ar"
  /** Vivo no estoque, mas além da última vaga: marcado e invisível. */
  | "fora_do_teto"
  /** Vendido, arquivado, rascunho, sem foto, ou fora do estoque. */
  | "fora_do_ar";

export interface ItemDestacado {
  id: string;
  rotulo: string;
  preco: number | null;
  /** 1-based na lista gravada, mortos inclusive. */
  posicao: number;
  /**
   * 1-based contando SÓ os vivos — é este que a linha de corte lê.
   *
   * Existe separado de `posicao` porque cortar pela posição crua poria a régua
   * no lugar errado sempre que houvesse um morto acima dela. Na fotografia de
   * 21/09 o Titano é o 4º da lista e o 1º do banner: uma tela que mostrasse
   * "vaga 4" ao lado do primeiro slide estaria mentindo com número.
   */
  posicaoViva: number | null;
  destino: DestinoDoDestaque;
  motivoForaDoAr: string | null;
}

/**
 * Por que este carro não está no ar — no vocabulário do operador.
 *
 * A régua é CONSULTADA, não reescrita: `decidirEstado` já dobrou
 * `estado_cadastro`, `vendido` e a falta de foto num campo só. Recalcular
 * qualquer parte disso aqui criaria uma segunda régua para a mesma pergunta —
 * o defeito que a contagem de fotos da tabela de estoque já documenta.
 */
const MOTIVO_POR_ESTADO: Partial<Record<EstadoDoVeiculo, string>> = {
  vendido: "vendido",
  arquivado: "arquivado",
  rascunho: "rascunho",
  fora_da_vitrine: "sem foto",
};

/** O rótulo da linha, sem repetir a versão que já está no modelo. */
function rotuloDe(linha: LinhaDeEstoque): string {
  return [linha.marca, linha.modelo, linha.versao].filter(Boolean).join(" ").trim();
}

/**
 * Casa a lista gravada com o estoque e decide o destino de cada id.
 *
 * O id que não está mais no estoque NÃO é descartado: ele vira uma entrada
 * `fora_do_ar`, porque a tela precisa mostrá-lo para o operador poder limpá-lo.
 * Era justamente a invisibilidade dele que deixava 5 carros mortos entupindo a
 * lista sem ninguém ver.
 */
export function montarPainelDeDestaques(
  ids: string[],
  linhas: LinhaDeEstoque[],
  vitrine: Vitrine,
): ItemDestacado[] {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const teto = VAGAS[vitrine];

  let vivos = 0;

  return ids.map((id, i) => {
    const linha = porId.get(id);

    if (!linha) {
      return {
        id,
        rotulo: id,
        preco: null,
        posicao: i + 1,
        posicaoViva: null,
        destino: "fora_do_ar" as const,
        motivoForaDoAr: "fora do estoque",
      };
    }

    const motivo = MOTIVO_POR_ESTADO[linha.estado] ?? null;
    if (motivo) {
      return {
        id,
        rotulo: rotuloDe(linha),
        preco: linha.preco,
        posicao: i + 1,
        posicaoViva: null,
        destino: "fora_do_ar" as const,
        motivoForaDoAr: motivo,
      };
    }

    vivos += 1;
    return {
      id,
      rotulo: rotuloDe(linha),
      preco: linha.preco,
      posicao: i + 1,
      posicaoViva: vivos,
      destino: teto === null || vivos <= teto ? ("no_ar" as const) : ("fora_do_teto" as const),
      motivoForaDoAr: null,
    };
  });
}

/**
 * Espelha `moverArea` de `areasDoSite.ts` — mesmo formato, mesma guarda.
 *
 * Fora dos limites devolve a lista INTACTA em vez de estourar: a tela chama
 * isto direto do clique, e um botão de seta no topo é o caso normal, não erro.
 */
export function moverDestaque(
  ids: string[],
  id: string,
  direcao: "cima" | "baixo",
): string[] {
  const proximos = [...ids];
  const i = proximos.indexOf(id);
  if (i < 0) return ids;
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (j < 0 || j >= proximos.length) return ids;
  [proximos[i], proximos[j]] = [proximos[j], proximos[i]];
  return proximos;
}

export function removerDestaque(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/**
 * Tira os ids que não estão vivos. Não mexe na ordem do resto.
 *
 * Limpar NÃO muda nada do que está no ar: a home e a TV já descartam estes ids
 * no `filter(Boolean)`, antes de qualquer corte. É higiene — e a tela precisa
 * dizer isso em texto, senão o botão assusta e ninguém aperta.
 */
export function limparForaDoAr(ids: string[], linhas: LinhaDeEstoque[]): string[] {
  const vivos = new Set(
    linhas.filter((l) => l.estado === "publicado").map((l) => l.id),
  );
  return ids.filter((id) => vivos.has(id));
}

/**
 * Quanto tempo a TV leva para dar uma volta completa.
 *
 * É o limite REAL da lista da TV, no lugar do teto de vagas que ela não tem:
 * rodar o pátio inteiro a 8s por carro daria mais de dez minutos, e quem passa
 * pelo showroom não espera dez minutos para rever um carro.
 */
export function voltaCompletaEmSegundos(itens: number): number {
  return itens * SEGUNDOS_POR_CARRO_NA_TV;
}
