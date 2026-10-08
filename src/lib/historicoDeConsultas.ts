/**
 * O histórico de consultas da tela "Consulta de veículos" — a parte pura
 * (dono, 08/10/2026: "melhorar o sistema de histórico de consultas e criar uma
 * pesquisa, até mesmo pra poupar").
 *
 * Uma lista só, das três consultas: FIPE grátis (`pontual`), Por modelo paga
 * (`completa`) e Por placa. Abrir um item do histórico NÃO chama ninguém: o
 * modelo abre do que está em `fipe_historico`, a placa do que está em
 * `consultas_de_placa`. Trazer os meses mais novos é um botão à parte
 * ("Atualizar dados"), que busca só o que falta.
 *
 * As linhas vêm de `consultas_de_modelo` (o registro de cada análise, com quem
 * e quanto custou) e de `consultas_de_placa`.
 */

export const MIGRACAO_DO_REGISTRO_DE_MODELOS = "20261008120000_consultas_de_modelo";

export type TipoDoHistorico = "fipe" | "modelo" | "placa";

export const FILTROS_DO_HISTORICO = ["todas", "fipe", "modelo", "placa"] as const;
export type FiltroDoHistorico = (typeof FILTROS_DO_HISTORICO)[number];

export const ROTULO_DO_TIPO: Record<TipoDoHistorico, string> = {
  fipe: "FIPE · grátis",
  modelo: "Por modelo · paga",
  placa: "Por placa · paga",
};

export interface ItemDoHistorico {
  /** Único na lista (prefixo do tipo + id da linha). */
  chave: string;
  tipo: TipoDoHistorico;
  quando: string;
  quem: string | null;
  /** "VW - VolksWagen T-Cross Highline 1.4 TSI 2022", ou a placa. */
  titulo: string;
  /** O resto, curto: "FIPE R$ 126.000 · out/2026 · 24 meses" ou o carro da placa. */
  detalhe: string | null;
  /** Em reais; `null` quando não se sabe, 0 quando não custou. */
  custo: number | null;
  homologacao: boolean;
  /** Como reabrir, sem custo. */
  abrir: { tipo: "modelo"; modo: "pontual" | "completa"; marca: string; modelo: string; ano: string } | { tipo: "placa"; placa: string };
}

export type LeituraDoHistorico =
  | { ok: true; itens: ItemDoHistorico[]; semRegistroDeModelo: boolean }
  | { ok: false; motivo: string };

/** Quantos itens a tela pede de uma vez. */
export const ITENS_DO_HISTORICO = 40;

/**
 * O termo da pesquisa, pronto para `ilike`: sem os curingas do SQL e sem a
 * vírgula e os parênteses que o filtro `or` do PostgREST usa como sintaxe.
 * Vazio vira `null` (sem filtro). Até 60 caracteres.
 */
export function termoDaPesquisa(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto
    .normalize("NFC")
    .replace(/[%_\\,()*:"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return limpo === "" ? null : limpo;
}

export function lerFiltro(bruto: unknown): FiltroDoHistorico {
  return typeof bruto === "string" && (FILTROS_DO_HISTORICO as readonly string[]).includes(bruto) ? (bruto as FiltroDoHistorico) : "todas";
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10-01" → "out/2026". */
export function mesDaReferencia(referencia: string): string {
  const [ano, mes] = referencia.split("-").map(Number);
  return Number.isInteger(ano) && mes >= 1 && mes <= 12 ? `${MESES[mes - 1]}/${ano}` : referencia;
}

/** Junta as listas e corta: do mais novo para o mais antigo. */
export function juntarHistorico(listas: ItemDoHistorico[][], limite = ITENS_DO_HISTORICO): ItemDoHistorico[] {
  return listas
    .flat()
    .sort((a, b) => b.quando.localeCompare(a.quando) || a.chave.localeCompare(b.chave))
    .slice(0, limite);
}
