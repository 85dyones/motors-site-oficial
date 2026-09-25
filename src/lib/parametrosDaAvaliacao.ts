/**
 * A linha vigente de `parametros_avaliacao` — a curva de deságio da spec 11.
 *
 * Só servidor: a tabela é legível por staff (RLS da f0f) e pela chave de
 * serviço, e o formulário público não tem nenhum dos dois. Quem chama é
 * `/api/avaliacao`, com o cliente admin.
 *
 * "Vigente" é a linha sem `vigencia_ate` e com `vigencia_desde` já alcançado:
 * a mesma leitura que o aceite da f0f faz, e o índice
 * `parametros_avaliacao_um_vigente` (f0j) garante que é uma só.
 *
 * Qualquer falha — tabela ilegível, linha ausente, campo torto, coluna nova
 * (`km_por_ano`) ainda não aplicada — devolve `null`, e a avaliação segue sem
 * sugestão. Nunca uma régua inventada no lugar da do banco.
 */
import { lerParametrosDaCurva, type ParametrosDaCurva } from "./avaliacaoRecomendacao";

/** O pedaço do cliente do Supabase que esta leitura usa. */
export interface ClienteDeLeitura {
  from: (tabela: string) => {
    select: (colunas: string) => {
      is: (coluna: string, valor: null) => {
        lte: (coluna: string, valor: string) => {
          order: (coluna: string, opcoes: { ascending: boolean }) => {
            limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
}

export async function lerParametrosVigentes(
  cliente: ClienteDeLeitura,
  hoje: Date = new Date(),
): Promise<ParametrosDaCurva | null> {
  try {
    const dia = hoje.toISOString().slice(0, 10);
    const { data, error } = await cliente
      .from("parametros_avaliacao")
      .select("*")
      .is("vigencia_ate", null)
      .lte("vigencia_desde", dia)
      .order("vigencia_desde", { ascending: false })
      .limit(1);
    if (error) {
      console.warn("[Avaliação] parametros_avaliacao ilegível — avaliação sem sugestão:", error.message);
      return null;
    }
    const parametros = lerParametrosDaCurva(data?.[0]);
    if (!parametros) {
      console.warn("[Avaliação] Nenhuma curva vigente legível em parametros_avaliacao — avaliação sem sugestão.");
    }
    return parametros;
  } catch (erro) {
    console.warn("[Avaliação] Falha ao ler parametros_avaliacao — avaliação sem sugestão:", (erro as Error)?.message);
    return null;
  }
}
