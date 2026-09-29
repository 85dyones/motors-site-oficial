/**
 * Km discrepante — o alerta que acompanha o km vindo do RevendaMais.
 *
 * Decisão do dono em 2026-09-29, quando o sync passou a trazer a ficha técnica
 * do RevendaMais (migração 20260929200000): "traga o número que estiver lá,
 * deixe um alerta em casos discrepantes, mas publique". O caso que motivou foi
 * a Spin 8446229, de 2014, que o RevendaMais manda com km = 1.
 *
 * Então o site PUBLICA o km do feed, qualquer que seja, e o painel avisa. Este
 * módulo é só a régua do aviso — puro, sem banco, para o teste exercê-lo.
 *
 * Duas regras, e nenhuma delas é "o km parece alto" ou "parece baixo" num
 * sentido de mercado — isso seria número de negócio, e não é o que o dono
 * pediu. São as duas que só acontecem por erro de digitação:
 *
 *   1. O ODÔMETRO VOLTOU. A troca de km MAIS RECENTE que o histórico
 *      (`historico_veiculo`, assinado "RevendaMais (sync)") registrou foi para
 *      MENOS. Odômetro de carro usado não diminui; se diminuiu no anúncio,
 *      alguém digitou errado — antes ou agora. Só a mais recente conta: quando
 *      o dono corrige no RevendaMais e o km volta a subir, o alerta se apaga no
 *      mesmo ciclo, em vez de acusar por 30 dias um erro já desfeito.
 *   2. KM QUASE ZERO EM CARRO QUE NÃO É NOVO. Menos de `KM_MINIMO_PLAUSIVEL`
 *      num carro de modelo com `IDADE_MINIMA_EM_ANOS` ou mais. É o caso da
 *      Spin: 1 km num carro de 12 anos.
 *
 * O alerta só olha carro DO FEED: é o único cujo km vem do RevendaMais, e a
 * instrução dele ("corrija lá") só serve para esse.
 *
 * A regra 2 também desliga o que o site AFIRMA sobre o km — o selo "BAIXA KM"
 * (`mapVeiculoDbToVeiculo`) e as curadorias por km (`regrasEstoque`). O número
 * é publicado como o dono decidiu; anunciar "baixa quilometragem" em cima de
 * um erro de digitação seria afirmação falsa ao comprador.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Abaixo disto, num carro que não é novo, o km é erro de digitação. */
export const KM_MINIMO_PLAUSIVEL = 1000;

/** A partir de quantos anos de modelo o km quase zero deixa de ser plausível. */
export const IDADE_MINIMA_EM_ANOS = 2;

/** Janela do histórico que o painel olha para a queda de km. */
export const JANELA_DA_QUEDA_EM_DIAS = 30;

/** Teto da leitura do histórico: bem acima de um mês de trocas de ~45 carros. */
const TETO_DA_LEITURA = 500;

/** Uma troca de km registrada pelo sync — uma linha do `historico_veiculo`. */
export interface TrocaDeKm {
  veiculo_id: string | number;
  valor_anterior: string | null;
  valor_novo: string | null;
}

export interface VeiculoParaKm {
  id: string;
  marca: string;
  modelo: string;
  ano: number;
  quilometragem: number;
  origem?: "sync" | "painel";
}

/** O km é implausível para a idade do carro — a regra 2, sozinha. */
export function kmImplausivelParaAIdade(
  km: number,
  ano: number,
  hoje: Date = new Date(),
): boolean {
  const idade = hoje.getFullYear() - ano;
  return (
    Number.isFinite(km) &&
    km < KM_MINIMO_PLAUSIVEL &&
    Number.isFinite(idade) &&
    idade >= IDADE_MINIMA_EM_ANOS
  );
}

const inteiro = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

const km = (n: number) => `${n.toLocaleString("pt-BR")} km`;

/**
 * Por que o km deste carro está discrepante, ou `null` se não está.
 *
 * `trocas` são as do próprio carro (o chamador filtra), na ordem em que
 * aconteceram. Só a ÚLTIMA decide a regra 1 — ver o cabeçalho.
 */
export function motivoDeKmDiscrepante(
  v: VeiculoParaKm,
  trocas: TrocaDeKm[] = [],
  hoje: Date = new Date(),
): string | null {
  const ultima = trocas[trocas.length - 1];
  if (ultima) {
    const antes = inteiro(ultima.valor_anterior);
    const depois = inteiro(ultima.valor_novo);
    if (antes !== null && depois !== null && depois < antes) {
      return `o km diminuiu no RevendaMais: ${km(antes)} → ${km(depois)}`;
    }
  }

  if (kmImplausivelParaAIdade(v.quilometragem, v.ano, hoje)) {
    return `${km(v.quilometragem)} num carro de ${v.ano}`;
  }

  return null;
}

/** Os carros com km discrepante, cada um com o motivo pronto para a tela. */
export function kmDiscrepantes(
  veiculos: VeiculoParaKm[],
  trocas: TrocaDeKm[] = [],
  hoje: Date = new Date(),
): Array<{ veiculo: VeiculoParaKm; motivo: string }> {
  const porCarro = new Map<string, TrocaDeKm[]>();
  for (const t of trocas) {
    const chave = String(t.veiculo_id);
    const doCarro = porCarro.get(chave);
    if (doCarro) doCarro.push(t);
    else porCarro.set(chave, [t]);
  }
  const achados: Array<{ veiculo: VeiculoParaKm; motivo: string }> = [];
  for (const v of veiculos) {
    if (v.origem === "painel") continue;
    const motivo = motivoDeKmDiscrepante(v, porCarro.get(String(v.id)) ?? [], hoje);
    if (motivo) achados.push({ veiculo: v, motivo });
  }
  return achados;
}

/**
 * As trocas de km que o sync registrou na janela — a leitura que o painel faz.
 *
 * Mora aqui, e não na página, pelo mesmo motivo de `resumoDeVisitas`: a data de
 * corte depende do relógio, e o componente do painel não pode chamar função
 * impura durante a renderização. Erro de leitura vira lista vazia — sem o
 * histórico, a regra da idade continua valendo — mas AVISA no log: a regra da
 * queda desligada em silêncio é o tipo de falha que ninguém vê.
 *
 * Lê do mais recente para o mais antigo, com teto, e devolve em ordem
 * cronológica: se o teto cortar, corta o mais antigo, nunca o que decide.
 */
export async function trocasDeKmRecentes(
  supabase: SupabaseClient,
  agora: Date = new Date(),
): Promise<TrocaDeKm[]> {
  const desde = new Date(agora.getTime() - JANELA_DA_QUEDA_EM_DIAS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("historico_veiculo")
    .select("veiculo_id, valor_anterior, valor_novo")
    .eq("campo", "quilometragem")
    .eq("autor_nome", "RevendaMais (sync)")
    .gte("registrado_em", desde)
    .order("registrado_em", { ascending: false })
    .limit(TETO_DA_LEITURA);
  if (error) {
    console.warn(`[kmDiscrepante] histórico de km ilegível — a regra da queda fica desligada: ${error.message}`);
    return [];
  }
  return ((data ?? []) as TrocaDeKm[]).reverse();
}
