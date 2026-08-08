import { ehTabelaOuColunaAusente } from "./erroDeSchema";

/**
 * Escrita no estoque — o caminho único por onde o painel altera veículo.
 *
 * Existia só dentro de `/api/estoque/[id]`, para o editor da tela A15. A
 * tabela A6 precisa da mesma operação em lote, e duplicar a rotina significaria
 * duas versões da regra de histórico: uma registrando quem mexeu no preço,
 * outra esquecendo. Está aqui para que haja uma só.
 *
 * A escrita é sempre por rota autenticada, nunca pelo cliente com a anon key
 * como faz o painel antigo (`AUDITORIA.md §3.4`).
 */

/** Campos que o painel controla. O sync do RevendaMais não conhece nenhum
 *  deles — é o contrato da migração 20260807160000. */
export const CAMPOS_NOSSOS = [
  "placa",
  "motor",
  "cor_interna",
  "donos_anteriores",
  "garantia_fabrica",
  "preco_compra",
  "descricao",
  "laudo_pericia",
  "opcionais",
  "status_tag",
  "status_tag_color",
  "vendido",
  "tipo",
  "perfil_uso",
] as const;

export type CampoNosso = (typeof CAMPOS_NOSSOS)[number];

/**
 * Só o que o painel pode escrever passa; o resto do corpo é descartado.
 *
 * Corpo que não é objeto vira lista vazia em vez de exceção: `"campo" in
 * "texto"` é TypeError, e um POST com `campos: "vendido"` derrubava a rota com
 * 500 no lugar do 400 que a entrada malformada merece.
 */
export function extrairCamposNossos(corpo: unknown): Record<string, unknown> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return {};
  const fonte = corpo as Record<string, unknown>;
  const atualizacao: Record<string, unknown> = {};
  for (const campo of CAMPOS_NOSSOS) {
    if (campo in fonte) atualizacao[campo] = fonte[campo];
  }
  return atualizacao;
}

/** O id chega como string na URL e no JSON, mas é bigint no banco. */
export function normalizarId(id: string | number): string | number {
  const texto = String(id);
  return /^\d+$/.test(texto) ? Number(texto) : texto;
}

export interface ResultadoDaEscrita {
  erro?: string;
  status?: number;
  camposSalvos: string[];
  mudancasRegistradas: number;
}

/**
 * Aplica a mesma atualização a um ou mais veículos, registrando no histórico
 * apenas o que de fato mudou.
 *
 * Salvar sem alterar nada não pode poluir a trilha — senão "quem mexeu no
 * preço?" vira uma lista de cliques em Salvar.
 */
export async function aplicarNosVeiculos(
  supabase: any,
  ids: Array<string | number>,
  atualizacao: Record<string, unknown>,
  autor: { id: string; nome: string | null },
): Promise<ResultadoDaEscrita> {
  const campos = Object.keys(atualizacao);
  if (campos.length === 0) {
    return { erro: "Nada para atualizar", status: 400, camposSalvos: [], mudancasRegistradas: 0 };
  }
  if (ids.length === 0) {
    return { erro: "Nenhum veículo informado", status: 400, camposSalvos: [], mudancasRegistradas: 0 };
  }

  const alvos = ids.map(normalizarId);

  // Estado anterior, lido ANTES do update: é o "NO AR HOJE" que a tela A16
  // compara com o proposto. Reconstruir isso depois exigiria refazer a cadeia
  // inteira de trás para frente.
  const { data: antes } = await supabase
    .from("estoque_motors")
    .select(["id", ...CAMPOS_NOSSOS].join(","))
    .in("id", alvos);

  const { error } = await supabase.from("estoque_motors").update(atualizacao).in("id", alvos);

  if (error) {
    if (ehTabelaOuColunaAusente(error)) {
      return {
        erro:
          "Campo da ficha própria ainda não existe no banco. Aplique a migração " +
          "20260807160000_ficha_propria_do_painel.sql.",
        status: 500,
        camposSalvos: [],
        mudancasRegistradas: 0,
      };
    }
    return { erro: error.message, status: 500, camposSalvos: [], mudancasRegistradas: 0 };
  }

  // Comparação frouxa de propósito: o formulário devolve "" onde o banco tem
  // null, e number onde tem string numérica.
  const norm = (x: unknown) => (x === null || x === undefined || x === "" ? "" : String(x));

  const mudancas: Array<Record<string, unknown>> = [];
  for (const linha of (antes ?? []) as Array<Record<string, unknown>>) {
    for (const [campo, novo] of Object.entries(atualizacao)) {
      if (norm(linha[campo]) === norm(novo)) continue;
      mudancas.push({
        veiculo_id: Number(linha.id),
        campo,
        valor_anterior: linha[campo] === null || linha[campo] === undefined ? null : String(linha[campo]),
        valor_novo: novo === null || novo === undefined ? null : String(novo),
        autor_id: autor.id,
        autor_nome: autor.nome,
      });
    }
  }

  if (mudancas.length > 0) {
    // Nunca derruba o salvamento: a alteração já está no banco, e perder o
    // registro é menos grave que devolver erro para uma gravação que deu
    // certo. Mesma regra de `registrarAcaoSensivel`.
    const { error: erroHistorico } = await supabase.from("historico_veiculo").insert(mudancas);
    if (erroHistorico) {
      console.warn("[Estoque] Falha ao registrar histórico:", erroHistorico.message);
    }
  }

  return { camposSalvos: campos, mudancasRegistradas: mudancas.length };
}
