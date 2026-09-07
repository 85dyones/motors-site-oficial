import { cache } from "react";
import { supabase } from "./supabase";
import { ehTabelaOuColunaAusente } from "./erroDeSchema";
import { RESUMO_DA_SECAO, TITULO_SEO_DA_SECAO } from "./guias";

/**
 * O cabeçalho editável de `/guias` — o `<title>` da aba e o parágrafo.
 *
 * Pedido do dono em 07/09, apontando o parágrafo sob o `<h1>`: *"preciso ser
 * capaz de editar o texto geral no painel, além de editar e escrever novos
 * guias"*. Ele escolheu o escopo: estes DOIS. O nome da seção
 * (`NOME_DA_SECAO`) fica no código, porque alimenta seis superfícies — `<h1>`,
 * trilha visível, `BreadcrumbList`, `CollectionPage.name`, rodapé e menu do
 * cabeçalho — travadas por teste que compara a saída renderizada de cada uma.
 * Um campo de painel tiraria essa trava do caminho.
 *
 * ---------------------------------------------------------------------------
 * Aqui o banco é OVERRIDE — o oposto de `guiasDoBanco.ts`
 * ---------------------------------------------------------------------------
 * A distinção decide o tratamento de erro, e as duas metades do mesmo módulo
 * ficaram em lados opostos dela:
 *
 *   · **Guia** é FONTE. Sem linha a página não existe, então falha de leitura
 *     ESTOURA — devolver "não há guias" viraria 404 em conteúdo indexado.
 *   · **Cabeçalho** é override. A página existe de qualquer jeito, e o texto do
 *     código é o padrão. Falha de leitura cai no padrão e ninguém percebe, que
 *     é o comportamento certo: derrubar `/guias` porque um parágrafo opcional
 *     não carregou seria trocar um texto por uma página fora do ar.
 *
 * Mesmo raciocínio de `textoEditadoDoHub.ts`, e é por isso que este arquivo
 * engole o erro em vez de ter um `Error` próprio.
 *
 * ---------------------------------------------------------------------------
 * Vazio é ausente, e quem garante isso é o banco
 * ---------------------------------------------------------------------------
 * A tela grava `""` quando o operador limpa o campo, e limpar tem de significar
 * "volte ao automático". O gatilho `carimbar_cabecalho_dos_guias` normaliza
 * `''` e `'   '` para NULO na gravação — então existe UM estado ausente para
 * testar aqui, e não três. A coalescência abaixo continua tratando string vazia
 * por segurança: linha gravada antes do gatilho, ou por outro caminho, não pode
 * servir título em branco na aba.
 */

/** O que está GRAVADO. Nulo em cada campo significa "usa o do código". */
export interface CabecalhoGravado {
  tituloSeo: string | null;
  resumo: string | null;
}

/** O que a página SERVE — sempre com texto, nunca vazio. */
export interface CabecalhoServido {
  tituloSeo: string;
  resumo: string;
}

/** O padrão do código, num lugar só, para a tela poder mostrá-lo como sugestão. */
export const CABECALHO_PADRAO: CabecalhoServido = {
  tituloSeo: TITULO_SEO_DA_SECAO,
  resumo: RESUMO_DA_SECAO,
};

const VAZIO: CabecalhoGravado = { tituloSeo: null, resumo: null };

/** Trata `null`, `""` e `"   "` como o mesmo estado: ausente. */
function ouNulo(bruto: unknown): string | null {
  return typeof bruto === "string" && bruto.trim() ? bruto.trim() : null;
}

export function normalizarCabecalho(linha: {
  titulo_seo?: string | null;
  resumo?: string | null;
} | null | undefined): CabecalhoGravado {
  if (!linha) return VAZIO;
  return { tituloSeo: ouNulo(linha.titulo_seo), resumo: ouNulo(linha.resumo) };
}

/** O que gravaram, campo a campo — para a TELA, que precisa distinguir vazio. */
export async function lerCabecalhoGravado(): Promise<CabecalhoGravado> {
  if (!supabase) return VAZIO;

  const { data, error } = await supabase
    .from("cabecalho_dos_guias")
    .select("titulo_seo, resumo")
    .eq("secao", "guias")
    .maybeSingle();

  if (error) {
    // Tabela ausente é ambiente atrasado, não defeito — e qualquer outro
    // tropeço (RLS, rede) também cai no padrão, porque este texto é override.
    if (!ehTabelaOuColunaAusente(error)) {
      console.warn("[Guias] Não deu para ler o cabeçalho da seção:", error.message);
    }
    return VAZIO;
  }
  return normalizarCabecalho(data);
}

/**
 * O cabeçalho resolvido — o que a página mostra.
 *
 * Campo por campo, e não a linha inteira: quem edita só o parágrafo continua
 * com o `<title>` do código, em vez de perder um ao mexer no outro.
 */
export function resolverCabecalho(gravado: CabecalhoGravado): CabecalhoServido {
  return {
    tituloSeo: gravado.tituloSeo ?? CABECALHO_PADRAO.tituloSeo,
    resumo: gravado.resumo ?? CABECALHO_PADRAO.resumo,
  };
}

/**
 * Atalho para as rotas públicas: lê e resolve.
 *
 * `cache()` porque `/guias` chama isto DUAS vezes por render — uma em
 * `generateMetadata`, para o `<title>` e a description, e outra no corpo, para
 * o parágrafo. Sem ele são duas idas ao banco para a mesma linha, na mesma
 * requisição. Fora de uma requisição (a rota de API, um teste) o `cache` não
 * deduplica nada e a função se comporta como antes.
 */
export const cabecalhoDosGuias = cache(async (): Promise<CabecalhoServido> => {
  return resolverCabecalho(await lerCabecalhoGravado());
});
