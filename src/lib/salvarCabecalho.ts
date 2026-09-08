/**
 * O salvamento do cabeçalho da seção, fora do componente.
 *
 * A revisão de 07/09 mostrou que o bloco inteiro do painel podia sair da
 * árvore com a suíte verde, e que trocar `onClick={aoSalvarCabecalho}` por um
 * `() => {}` também passava.
 *
 * A lógica saiu para cá — a chamada, o tratamento de erro e a escolha da
 * mensagem viram função pura de entrada e saída, com teste próprio. Isso
 * resolve metade: prova a função, não prova que alguém a usa. A revisão cobrou
 * essa distinção quatro vezes, e ela é o assunto de
 * `tests/painel-de-guias-fiacao.test.ts`, que monta a tela em `jsdom` e clica
 * de verdade. As duas metades têm mutante.
 */

export interface CabecalhoNaTela {
  tituloSeo: string;
  resumo: string;
}

export type ResultadoDoSalvamento =
  | { ok: true; cabecalho: CabecalhoNaTela; texto: string; avisos?: string[] }
  | {
      ok: false;
      texto: string;
      /**
       * Gravou, mas não deu para confirmar O QUÊ. A tela tem de travar até
       * reler — ver o docblock de `salvarCabecalho`.
       */
      exigeRecarga?: true;
    };

/**
 * O par vazio: nenhum override.
 *
 * É o que a tela mostra antes de carregar, quando o banco não tem texto, e
 * depois de apagar. Campo em branco NÃO significa sozinho “volte ao padrão” —
 * o que devolve uma coluna ao texto do código é esvaziá-la e salvar, ou o
 * DELETE. Ver `camposAlterados`.
 */
export const SEM_CABECALHO: CabecalhoNaTela = { tituloSeo: "", resumo: "" };

/** A régua da meta description. Aviso, nunca trava: quem decide o texto é quem escreve. */
export const REGUA_DESCRIPTION = 155;

/** O teto do banco. A tela corta antes para o Postgres não recusar na cara de quem digita. */
export const TETO_DO_CAMPO = 300;

/**
 * O que MUDOU entre o que foi lido e o que está na tela.
 *
 * É a peça central do desenho novo, e a que tornou o defeito INEXPRESSÁVEL em
 * vez de apenas bloqueado. Só os campos alterados viajam, e chave ausente no
 * corpo significa "não mexa nesta coluna".
 *
 * O efeito: um formulário em branco POR FALHA DE LEITURA produz `{}` — o
 * carregado também está vazio, então não há diferença — e `{}` não muda nada.
 * Antes, aquele mesmo formulário produzia `{tituloSeo:"", resumo:""}`, que o
 * servidor lia como "apague os dois". Cinco rodadas de revisão acharam cinco
 * caminhos até esse estado, e cada um exigiu uma trava nova na interface. Este
 * `diff` os fecha de uma vez, porque **só dá para apagar o que dava para ver**.
 *
 * `""` continua sendo alteração legítima: se o carregado tinha texto e a pessoa
 * esvaziou o campo, isso é edição de verdade, e vai.
 */
export function camposAlterados(
  atual: CabecalhoNaTela,
  carregado: CabecalhoNaTela,
): Partial<CabecalhoNaTela> {
  const mudou: Partial<CabecalhoNaTela> = {};
  if (atual.tituloSeo !== carregado.tituloSeo) mudou.tituloSeo = atual.tituloSeo;
  if (atual.resumo !== carregado.resumo) mudou.resumo = atual.resumo;
  return mudou;
}

/**
 * A tela pode gravar agora?
 *
 * Deixou de ser trava de SEGURANÇA e virou o que sempre deveria ter sido: um
 * sinal de "há algo para salvar". A segurança mora na FORMA da requisição —
 * ver `camposAlterados`.
 *
 * `salvando` e `carregando` continuam porque clicar duas vezes não deve mandar
 * duas requisições.
 */
export function podeSalvarCabecalho(estado: {
  salvando: boolean;
  carregando: boolean;
  alteracoes: Partial<CabecalhoNaTela>;
}): boolean {
  return !estado.salvando && !estado.carregando && Object.keys(estado.alteracoes).length > 0;
}

/**
 * E pode devolver a seção ao texto do código?
 *
 * Virou ação com nome próprio — um DELETE, pedido com confirmação — em vez de
 * ser o efeito colateral de salvar campos vazios. Só faz sentido quando existe
 * override GRAVADO: sem linha no banco, a seção já está no automático.
 *
 * O `cabecalhoLido` continua aqui, e só aqui: oferecer "apagar" sobre um estado
 * que não se conseguiu ler é o mesmo erro de sempre, com outro nome.
 */
export function podeVoltarAoPadrao(estado: {
  salvando: boolean;
  carregando: boolean;
  cabecalhoLido: boolean;
  carregado: CabecalhoNaTela;
}): boolean {
  if (estado.salvando || estado.carregando || !estado.cabecalhoLido) return false;
  return Boolean(estado.carregado.tituloSeo || estado.carregado.resumo);
}

export async function salvarCabecalho(
  alteracoes: Partial<CabecalhoNaTela>,
): Promise<ResultadoDoSalvamento> {
  try {
    // Só o que mudou. Chave ausente = "não mexa nesta coluna" — ver
    // `camposAlterados`. É isto que torna o apagamento acidental impossível de
    // exprimir, em vez de apenas bloqueado por trava de interface.
    const r = await fetch("/api/guias/secao", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alteracoes),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, texto: dados.error || "Falha ao salvar o cabeçalho" };
    }

    // 200 SEM `cabecalho` no corpo — HTML de borda da CDN, proxy cortando, JSON
    // ilegível. A revisão achou aqui a última porta de apagamento, e ela é a
    // mesma forma do B9: campo ausente virando afirmação definitiva.
    //
    // O que acontecia: o PUT GRAVOU (foi 200), mas `dados.cabecalho` é
    // `undefined`, os dois campos caíam para `""`, a tela dizia "de volta ao
    // texto padrão" — mentira sobre o que aconteceu — e o botão continuava
    // habilitado com os campos em branco. Ou seja, o estado exato que o
    // `cabecalhoLido` existe para tornar impossível, alcançado pelo caminho de
    // escrita. O clique seguinte apagaria o texto de verdade.
    //
    // Sem saber o que ficou gravado, o único desfecho honesto é travar até
    // reler. Os campos NÃO são limpos: o que a pessoa digitou continua na tela.
    if (!dados.cabecalho || typeof dados.cabecalho !== "object") {
      return {
        ok: false,
        exigeRecarga: true,
        texto:
          "Enviei o texto e o servidor aceitou, mas não consegui confirmar o que ficou gravado. " +
          "Recarregue a página antes de editar de novo — o que está no ar pode ser o texto novo.",
      };
    }

    const salvo: CabecalhoNaTela = {
      tituloSeo: dados.cabecalho?.titulo_seo ?? "",
      resumo: dados.cabecalho?.resumo ?? "",
    };

    // A mensagem distingue os dois desfechos porque eles são decisões
    // diferentes: "salvei o seu texto" e "a seção está no automático". Um
    // "salvo" genérico depois de esvaziar os campos deixaria a dúvida de sempre.
    const noAutomatico = !salvo.tituloSeo && !salvo.resumo;

    return {
      ok: true,
      cabecalho: salvo,
      texto: noAutomatico
        ? "Salvo. A seção está no texto padrão, e /guias já mostra a alteração."
        : "Cabeçalho salvo. /guias já mostra a alteração.",
      avisos: dados.avisos?.length ? dados.avisos : undefined,
    };
  } catch (e) {
    // Rede caída, JSON quebrado, aba fechando. A tela precisa de uma frase, e
    // não de uma exceção que suba e a deixe em branco no meio de uma edição.
    return { ok: false, texto: (e as Error).message || "Falha ao salvar o cabeçalho" };
  }
}

/**
 * Devolve a seção ao texto do código — a ação de apagar, com nome próprio.
 *
 * Verbo separado de propósito. Enquanto isto era "salvar dois campos vazios",
 * era alcançável por acidente toda vez que a tela não conseguia ler o que
 * estava no ar. Agora é preciso pedir, e a tela pede com confirmação.
 */
export async function voltarAoPadrao(): Promise<ResultadoDoSalvamento> {
  try {
    const r = await fetch("/api/guias/secao", { method: "DELETE" });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, texto: dados.error || "Falha ao voltar ao texto padrão" };
    }

    // O servidor diz SE apagou, e não só que rodou — pelo caderno do projeto,
    // RLS não devolve erro, devolve vazio. Só o botão que enxerga override
    // liberado chega aqui, então "não apaguei nada" é anomalia: ou outra pessoa
    // já apagou, ou a gravação foi recusada. Nos dois casos a tela está velha, e
    // anunciar "voltou ao padrão" seria a mentira que o `.select()` da rota
    // existe para impedir.
    if (dados.apagou !== true) {
      return {
        ok: false,
        texto:
          "Não apaguei nada — a seção pode já estar no texto padrão, ou a gravação foi recusada. Recarregue para ver o que está no ar.",
        exigeRecarga: true,
      };
    }

    return {
      ok: true,
      cabecalho: SEM_CABECALHO,
      texto: "Pronto. A seção voltou ao texto padrão, e /guias já mostra a alteração.",
    };
  } catch (e) {
    return { ok: false, texto: (e as Error).message || "Falha ao voltar ao texto padrão" };
  }
}
