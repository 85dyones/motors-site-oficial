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
 *   1. O ODÔMETRO VOLTOU. O histórico (`historico_veiculo`, assinado
 *      "RevendaMais (sync)") registrou uma troca de km para MENOS. Odômetro de
 *      carro usado não diminui; se diminuiu no anúncio, alguém digitou errado
 *      — antes ou agora.
 *   2. KM QUASE ZERO EM CARRO QUE NÃO É NOVO. Menos de `KM_MINIMO_PLAUSIVEL`
 *      num carro de modelo com `IDADE_MINIMA_EM_ANOS` ou mais. É o caso da
 *      Spin: 1 km num carro de 12 anos.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Abaixo disto, num carro que não é novo, o km é erro de digitação. */
export const KM_MINIMO_PLAUSIVEL = 1000;

/** A partir de quantos anos de modelo o km quase zero deixa de ser plausível. */
export const IDADE_MINIMA_EM_ANOS = 2;

/** Janela do histórico que o painel olha para a queda de km. */
export const JANELA_DA_QUEDA_EM_DIAS = 30;

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
 * aconteceram; basta UMA queda para acusar.
 */
export function motivoDeKmDiscrepante(
  v: VeiculoParaKm,
  trocas: TrocaDeKm[] = [],
  hoje: Date = new Date(),
): string | null {
  const queda = trocas.find((t) => {
    const antes = inteiro(t.valor_anterior);
    const depois = inteiro(t.valor_novo);
    return antes !== null && depois !== null && depois < antes;
  });
  if (queda) {
    return `o km diminuiu no RevendaMais: ${km(inteiro(queda.valor_anterior)!)} → ${km(inteiro(queda.valor_novo)!)}`;
  }

  const idade = hoje.getFullYear() - v.ano;
  if (
    Number.isFinite(v.quilometragem) &&
    v.quilometragem < KM_MINIMO_PLAUSIVEL &&
    Number.isFinite(idade) &&
    idade >= IDADE_MINIMA_EM_ANOS
  ) {
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
    porCarro.set(chave, [...(porCarro.get(chave) ?? []), t]);
  }
  const achados: Array<{ veiculo: VeiculoParaKm; motivo: string }> = [];
  for (const v of veiculos) {
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
 * histórico, a regra da idade continua valendo.
 */
export async function trocasDeKmRecentes(
  supabase: SupabaseClient,
  agora: Date = new Date(),
): Promise<TrocaDeKm[]> {
  const desde = new Date(agora.getTime() - JANELA_DA_QUEDA_EM_DIAS * 86_400_000).toISOString();
  const { data } = await supabase
    .from("historico_veiculo")
    .select("veiculo_id, valor_anterior, valor_novo")
    .eq("campo", "quilometragem")
    .eq("autor_nome", "RevendaMais (sync)")
    .gte("registrado_em", desde)
    .order("registrado_em", { ascending: true });
  return (data ?? []) as TrocaDeKm[];
}
