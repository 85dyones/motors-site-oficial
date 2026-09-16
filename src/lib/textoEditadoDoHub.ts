import { supabase } from "./supabase";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";

/**
 * O texto que a loja escreveu para uma página de hub — quando escreveu.
 *
 * Decisão do dono em 2026-08-31, olhando `/carros/volkswagen/saveiro`: *"o
 * painel precisa permitir editar o texto, hoje ele é criado automaticamente e
 * não tem muito sentido"*.
 *
 * ---------------------------------------------------------------------------
 * Override, não substituição
 * ---------------------------------------------------------------------------
 * São **103 hubs** em 2026-08-31 (20 de marca, 65 de modelo, 18 recortes de
 * `/estoque`). Ninguém escreve cópia para 103 páginas, e é por isso que o
 * texto gerado continua sendo o padrão: linha ausente, campo nulo ou array
 * vazio significam "use o que o sistema escreve".
 *
 * Mesmo idioma de `modelo_override` e `descricao_seo` — o painel corrige o
 * caso que merece atenção, o gerador responde pelo resto.
 *
 * ---------------------------------------------------------------------------
 * Falha aqui não derruba a página
 * ---------------------------------------------------------------------------
 * Tabela ausente (ambiente atrasado), RLS, rede: qualquer tropeço devolve
 * `null` e a página cai no texto gerado. Uma página de hub sem texto editado é
 * o estado normal de 98 delas; uma página de hub que não carrega é um erro
 * para o visitante e para o robô de busca.
 */

export interface TextoEditadoDoHub {
  /** Substitui o `<h1>`. Nulo/vazio = o gerado. */
  titulo: string | null;
  /** Substitui o corpo inteiro, na ordem. Vazio = os gerados. */
  paragrafos: string[];
}

/** Normaliza o que veio do banco: string vazia e array vazio contam como ausente. */
export function normalizarTextoDoHub(linha: {
  titulo?: string | null;
  paragrafos?: string[] | null;
} | null | undefined): TextoEditadoDoHub | null {
  if (!linha) return null;
  const titulo = (linha.titulo ?? "").trim();
  const paragrafos = (linha.paragrafos ?? [])
    .map((p) => (p ?? "").trim())
    .filter((p) => p !== "");
  // Nada preenchido é o mesmo que não ter linha — evita que um registro criado
  // e depois esvaziado apague o texto da página em vez de devolver o padrão.
  if (!titulo && paragrafos.length === 0) return null;
  return { titulo: titulo || null, paragrafos };
}

/**
 * O que vale para esta página: o editado, quando existe, senão o gerado.
 *
 * Recebe os parágrafos gerados prontos em vez de gerá-los aqui, porque cada
 * tipo de hub tem a sua função em `textoDosHubs.ts` e este módulo não precisa
 * conhecer nenhuma delas.
 */
export function resolverTextoDoHub(
  editado: TextoEditadoDoHub | null,
  gerado: { titulo: string; paragrafos: string[] },
): { titulo: string; paragrafos: string[]; editado: boolean } {
  if (!editado) return { ...gerado, editado: false };
  return {
    titulo: editado.titulo ?? gerado.titulo,
    // Parágrafo por parágrafo não: quem edita escreve o corpo INTEIRO. Mesclar
    // deixaria a página com metade da voz da loja e metade do robô, e o
    // operador não teria como prever o resultado do que digitou.
    paragrafos: editado.paragrafos.length > 0 ? editado.paragrafos : gerado.paragrafos,
    editado: true,
  };
}

/** Busca o texto editado de um caminho. `null` quando não há, ou quando falha. */
export async function buscarTextoDoHub(caminho: string): Promise<TextoEditadoDoHub | null> {
  if (!supabase || !caminho) return null;
  try {
    const { data, error } = await supabase
      .from("textos_de_hub")
      .select("titulo, paragrafos")
      .eq("caminho", caminho)
      .maybeSingle();

    if (error) {
      // Tabela ausente é ambiente atrasado, não defeito: silencia. Qualquer
      // outro erro merece uma linha no log, mas nunca derruba a página.
      if (!ehTabelaOuColunaAusente(error)) {
        console.warn(`[Hub] Sem texto editado para ${caminho}:`, error.message);
      }
      return null;
    }
    return normalizarTextoDoHub(data);
  } catch (e) {
    console.warn(`[Hub] Falha ao buscar texto de ${caminho}:`, (e as Error).message);
    return null;
  }
}
