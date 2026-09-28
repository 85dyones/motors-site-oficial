/**
 * O lote do repasse, em lib pura (spec §7.1, decisões 3 e 8 do PR 3): a
 * ordem da grade, a contagem de cada filtro e o resumo que a página desenha
 * — o que está no lote, o que já saiu, quando o lote mudou e qual carro
 * vira exemplo nos dois quadros "como ler".
 *
 * Recebe o que `lerRepassesPublicos` já filtrou (publicado, reservado e
 * vendido na carência).
 */
import { ddmmEmCuritiba, ehHojeEmCuritiba } from "./horarioDaLoja";
import {
  FILTROS_DO_REPASSE,
  contaDoRepasse,
  estadoDoRepasse,
  passaNoFiltro,
  type FiltroDoRepasse,
  type Repasse,
} from "./repasse";

export const ORDENS_DO_LOTE = ["recentes", "diferenca", "preco"] as const;
export type OrdemDoLote = (typeof ORDENS_DO_LOTE)[number];

export const QUANTOS_JA_SAIRAM = 3;

/** O que o card precisa do `companySettings` — e só isso vai para a ilha cliente. */
export type WhatsappDaLoja = { whatsappRaw: string; whatsapp: string };

const instante = (valor: string | null): number => {
  const t = valor ? new Date(valor).getTime() : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** Quando o carro entrou na vitrine: o switch, senão a publicação para lojistas, senão a criação. */
export function publicadoEm(r: Pick<Repasse, "aberto_ao_publico_em" | "lojistas_desde" | "created_at">): string {
  return r.aberto_ao_publico_em ?? r.lojistas_desde ?? r.created_at;
}

export function ordenarLote(lote: readonly Repasse[], ordem: OrdemDoLote): Repasse[] {
  const recentes = (a: Repasse, b: Repasse) =>
    instante(publicadoEm(b)) - instante(publicadoEm(a)) || a.id.localeCompare(b.id);
  const copia = [...lote];
  if (ordem === "diferenca") {
    const abaixo = (r: Repasse) => contaDoRepasse(r).abaixoDaFipe ?? Number.NEGATIVE_INFINITY;
    return copia.sort((a, b) => abaixo(b) - abaixo(a) || recentes(a, b));
  }
  if (ordem === "preco") return copia.sort((a, b) => a.preco - b.preco || recentes(a, b));
  return copia.sort(recentes);
}

export function contagemPorFiltro(lote: readonly Repasse[]): Record<FiltroDoRepasse, number> {
  const contagem = {} as Record<FiltroDoRepasse, number>;
  for (const filtro of FILTROS_DO_REPASSE) contagem[filtro] = lote.filter((r) => passaNoFiltro(r, filtro)).length;
  return contagem;
}

export interface ResumoDoLote {
  /** Publicado (aberto ou só-lojistas) e reservado, mais recentes primeiro. */
  lote: Repasse[];
  /** Publicado e aberto a todos. */
  abertos: Repasse[];
  soLojistas: number;
  /** Vendidos na carência, até três, venda mais recente primeiro. */
  sairam: Repasse[];
  /** "dd/mm" da venda mais recente; null sem venda na carência. */
  ultimaSaida: string | null;
  /** A publicação mais recente do lote; null com o lote vazio. */
  atualizacao: { hoje: boolean; dia: string } | null;
  /** "Como ler um repasse" (herói): um aberto com reparo, senão o primeiro aberto. */
  exemploDoHeroi: Repasse | null;
  /** "EXEMPLO" da conta aberta: um aberto com sinistro declarado, senão com reparo, senão o primeiro. */
  exemploDaConta: Repasse | null;
}

export function resumoDoLote(visiveis: readonly Repasse[], agora: Date): ResumoDoLote {
  const lote = ordenarLote(
    visiveis.filter((r) => r.situacao === "publicado" || r.situacao === "reservado"),
    "recentes",
  );
  const abertos = lote.filter((r) => estadoDoRepasse(r) === "aberto");
  const vendidos = visiveis
    .filter((r) => r.situacao === "vendido")
    .sort((a, b) => instante(b.vendido_em) - instante(a.vendido_em));
  const maisRecente = lote.length > 0 ? publicadoEm(lote[0]) : null;
  const dia = ddmmEmCuritiba(maisRecente);
  const comReparo = (r: Repasse) => contaDoRepasse(r).reparoOrcado > 0;
  return {
    lote,
    abertos,
    soLojistas: lote.filter((r) => estadoDoRepasse(r) === "lojistas").length,
    sairam: vendidos.slice(0, QUANTOS_JA_SAIRAM),
    ultimaSaida: ddmmEmCuritiba(vendidos.length > 0 ? vendidos[0].vendido_em : null),
    atualizacao: dia ? { hoje: ehHojeEmCuritiba(maisRecente, agora), dia } : null,
    exemploDoHeroi: abertos.find(comReparo) ?? abertos[0] ?? null,
    exemploDaConta:
      abertos.find((r) => r.sinistro_consta === true && r.sinistro_detalhe) ??
      abertos.find(comReparo) ??
      abertos[0] ??
      null,
  };
}
