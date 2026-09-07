/**
 * O salvamento do cabeçalho da seção, fora do componente.
 *
 * A revisão de 07/09 mostrou que o bloco inteiro do painel podia sair da
 * árvore com a suíte verde, e que trocar `onClick={aoSalvarCabecalho}` por um
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
  | {
      ok: false;
      texto: string;
      /**
       * Gravou, mas não deu para confirmar O QUÊ. A tela tem de travar até
       * reler — ver o docblock de `salvarCabecalho`.
       */
      exigeRecarga?: true;
    };

/** Campo vazio significa "volte ao automático" — em toda a cadeia. */
export const SEM_CABECALHO: CabecalhoNaTela = { tituloSeo: "", resumo: "" };

/** A régua da meta description. Aviso, nunca trava: quem decide o texto é quem escreve. */
export const REGUA_DESCRIPTION = 155;

/** O teto do banco. A tela corta antes para o Postgres não recusar na cara de quem digita. */
export const TETO_DO_CAMPO = 300;

/**
 * A tela pode gravar o cabeçalho agora?
 *
 * Função, e não expressão solta no `disabled`, porque a revisão mediu: apagar
 * as duas guardas de `cabecalhoLido` do JSX deixava a suíte inteira verde, e
 * essas guardas SÃO a correção do defeito que apagava o texto do dono. `onClick`
 * e `disabled` não aparecem em markup estático; a decisão, aqui, aparece.
 *
 * `cabecalhoLido` é o que separa "o campo está em branco porque a seção está no
 * automático" de "o campo está em branco porque eu não consegui ler". No
 * segundo caso o PUT — que substitui a linha inteira — apagaria o que está no
 * ar.
 */
export function podeSalvarCabecalho(estado: {
  salvando: boolean;
  carregando: boolean;
  cabecalhoLido: boolean;
}): boolean {
  return !estado.salvando && !estado.carregando && estado.cabecalhoLido;
}

/**
 * E pode LIMPAR os campos, para depois salvar o padrão?
 *
 * O botão não grava nada sozinho — ele só esvazia a tela, e quem grava é o
 * Salvar em seguida. (A primeira versão deste docblock dizia "grava pela mesma
 * rota", e era falso: a revisão pegou.)
 *
 * Mesmo assim ele herda a trava de `podeSalvarCabecalho`, e a razão é de
 * interface: limpar um campo cujo conteúdo real eu não consegui ler faz a tela
 * afirmar "está no automático" sobre uma seção que pode ter texto. É a mesma
 * confusão entre "vazio" e "não sei" que o resto deste módulo existe para
 * desfazer. Acrescenta só que não faz sentido limpar o que já está limpo.
 */
export function podeVoltarAoPadrao(estado: {
  salvando: boolean;
  carregando: boolean;
  cabecalhoLido: boolean;
  cabecalho: CabecalhoNaTela;
}): boolean {
  if (!podeSalvarCabecalho(estado)) return false;
  return Boolean(estado.cabecalho.tituloSeo || estado.cabecalho.resumo);
}

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
