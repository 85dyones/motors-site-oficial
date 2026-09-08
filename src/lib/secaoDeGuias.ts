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
 * (`NOME_DA_SECAO`) fica no código, porque alimenta seis superfícies públicas —
 * o `<h1>` do índice, a trilha do índice, a trilha da ficha, os degraus do
 * `BreadcrumbList`, o `CollectionPage.name` e o rótulo do rodapé —, mais o
 * `<h1>` do painel e o nome em `PAGINAS_COMPARTILHAVEIS`. Todas travadas por
 * teste que compara a saída renderizada. Um campo de painel tiraria essa trava
 * do caminho.
 *
 * (A primeira versão desta lista citava "o menu do cabeçalho". Ele não existe
 * neste branch — o item de menu é de `seo/guias-no-menu`, e o link que existe
 * aqui é o do RODAPÉ. A contagem fechava porque a enumeração trocava a trilha
 * da ficha, que é real, por uma superfície que não estava no código.)
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

/**
 * A leitura, com os dois desfechos SEPARADOS.
 *
 * `lido: false` significa "não consegui ler", e é diferente de "não há
 * override" — que é `lido: true` com os dois campos nulos. Enquanto os dois
 * colapsavam em `VAZIO`, existia um caminho de PERDA que a primeira correção
 * não fechou, e a revisão o reproduziu:
 *
 *   O GET do painel monta a resposta com DUAS metades e clientes diferentes —
 *   os guias pelo cliente da sessão, o cabeçalho pelo `anon` daqui. Um timeout
 *   só nesta metade devolvia 200, sem erro, com o cabeçalho indistinguível de
 *   "sem override". A tela concluía que tinha lido, liberava o Salvar, e o
 *   clique gravava `""` nos dois campos — apagando o texto do dono, e indo ao
 *   ar no mesmo request por causa do `revalidarCluster`.
 *
 * Tabela ausente NÃO é falha de leitura: é o estado do ambiente antes da
 * migração, e ali "não há override" é a verdade. Só o resto vira `lido: false`.
 */
export type LeituraDoCabecalho =
  | { lido: true; cabecalho: CabecalhoGravado }
  | { lido: false; motivo: string };

export async function lerCabecalhoGravado(): Promise<LeituraDoCabecalho> {
  if (!supabase) {
    // Sem cliente configurado o site inteiro roda em fixtures; a página cai no
    // padrão e o painel não existe. Não é falha de leitura desta tabela.
    return { lido: true, cabecalho: VAZIO };
  }

  const { data, error } = await supabase
    .from("cabecalho_dos_guias")
    .select("titulo_seo, resumo")
    .eq("secao", "guias")
    .maybeSingle();

  if (error) {
    if (ehTabelaOuColunaAusente(error)) return { lido: true, cabecalho: VAZIO };
    console.warn("[Guias] Não deu para ler o cabeçalho da seção:", error.message);
    return { lido: false, motivo: error.message };
  }
  return { lido: true, cabecalho: normalizarCabecalho(data) };
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
  const leitura = await lerCabecalhoGravado();
  // A PÁGINA PÚBLICA engole a falha de propósito — aqui o banco é override, e
  // derrubar `/guias` por um parágrafo opcional seria trocar um texto por uma
  // página fora do ar. Quem NÃO pode engolir é o painel, porque lá a mesma
  // ausência vira um clique que apaga. Ver `LeituraDoCabecalho`.
  return resolverCabecalho(leitura.lido ? leitura.cabecalho : VAZIO);
});
