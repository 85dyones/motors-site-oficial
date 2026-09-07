/**
 * O salvamento do cabeçalho da seção, fora do componente.
 *
 * A revisão de 07/09 mostrou que o bloco inteiro do painel podia sair da
 * árvore com a suíte verde, e que trocar `onClick={salvarCabecalho}` por um
 * `() => {}` também passava. A primeira metade se resolve renderizando a tela
 * em teste; a segunda, não — `renderToStaticMarkup` produz texto, e `onClick`
 * não aparece em texto. Provar aquilo exigiria um harness de interação que o
 * projeto não tem.
 *
 * Então o que dá para tirar do escuro sai daqui: a chamada, o tratamento de
 * erro e a escolha da mensagem viram função pura de entrada e saída, com teste
 * próprio. O que sobra descoberto no componente é um identificador, e não um
 * comportamento — e essa é a diferença entre uma lacuna que se declara e uma
 * que se descobre em produção.
 */

export interface CabecalhoNaTela {
  tituloSeo: string;
  resumo: string;
}

export type ResultadoDoSalvamento =
  | { ok: true; cabecalho: CabecalhoNaTela; texto: string; avisos?: string[] }
  | { ok: false; texto: string };

/** Campo vazio significa "volte ao automático" — em toda a cadeia. */
export const SEM_CABECALHO: CabecalhoNaTela = { tituloSeo: "", resumo: "" };

/** A régua da meta description. Aviso, nunca trava: quem decide o texto é quem escreve. */
export const REGUA_DESCRIPTION = 155;

/** O teto do banco. A tela corta antes para o Postgres não recusar na cara de quem digita. */
export const TETO_DO_CAMPO = 300;

export async function salvarCabecalho(
  cabecalho: CabecalhoNaTela,
): Promise<ResultadoDoSalvamento> {
  try {
    const r = await fetch("/api/guias/secao", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cabecalho),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, texto: dados.error || "Falha ao salvar o cabeçalho" };
    }

    const salvo: CabecalhoNaTela = {
      tituloSeo: dados.cabecalho?.titulo_seo ?? "",
      resumo: dados.cabecalho?.resumo ?? "",
    };

    // A mensagem distingue os dois desfechos porque eles são decisões
    // diferentes: "salvei o seu texto" e "devolvi a seção ao automático". Um
    // "salvo" genérico depois de limpar os campos deixaria a dúvida de sempre —
    // apaguei o texto do site ou voltei ao padrão?
    const voltouAoPadrao = !salvo.tituloSeo && !salvo.resumo;

    return {
      ok: true,
      cabecalho: salvo,
      texto: voltouAoPadrao
        ? "Cabeçalho de volta ao texto padrão. /guias já mostra a alteração."
        : "Cabeçalho salvo. /guias já mostra a alteração.",
      avisos: dados.avisos?.length ? dados.avisos : undefined,
    };
  } catch (e) {
    // Rede caída, JSON quebrado, aba fechando. A tela precisa de uma frase, e
    // não de uma exceção que suba e a deixe em branco no meio de uma edição.
    return { ok: false, texto: (e as Error).message || "Falha ao salvar o cabeçalho" };
  }
}
