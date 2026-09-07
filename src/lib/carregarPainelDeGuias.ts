import { SEM_CABECALHO, type CabecalhoNaTela } from "./salvarCabecalho";

/**
 * A leitura da tela de guias, fora do componente.
 *
 * Irmã de `salvarCabecalho.ts`, e pelo mesmo motivo — com um agravante. A
 * revisão de 07/09 mostrou que o caminho de LEITURA era o que apagava texto:
 *
 *   `carregar()` estourava antes de preencher o cabeçalho quando o GET falhava;
 *   os campos ficavam vazios, a tela liberava, e o botão Salvar continuava
 *   habilitado. Como o PUT substitui a linha inteira, um clique depois de uma
 *   falha de leitura apagava o cabeçalho que estava no ar — e a tela não tinha
 *   como distinguir "está vazio" de "não consegui ler".
 *
 * O conserto tem duas peças: o componente trava o salvamento enquanto a leitura
 * não deu certo, e a leitura em si vira função pura, testável, que diz
 * EXPLICITAMENTE se deu certo em vez de comunicar isso por exceção — e isso
 * vale para as DUAS metades: o HTTP e a leitura do cabeçalho, que a revisão
 * mostrou serem falhas independentes, com clientes diferentes.
 */

export interface GuiaDoPainel {
  slug: string;
  titulo: string;
  titulo_seo: string | null;
  descricao: string;
  corpo: { titulo: string; paragrafos: string[] }[];
  faq: { pergunta: string; resposta: string }[];
  saida: { rotulo: string; href: string; apoio: string } | null;
  sobre: string[] | null;
  estado: "rascunho" | "publicado";
  publicado_em: string | null;
  atualizado_em: string;
}

export type ResultadoDaCarga =
  | {
      ok: true;
      guias: GuiaDoPainel[];
      regua: string[];
      cabecalho: CabecalhoNaTela;
      padrao: CabecalhoNaTela;
      /**
       * O CABEÇALHO foi lido, ou só a listagem?
       *
       * A resposta tem duas metades com clientes diferentes, e uma pode cair
       * sozinha. `ok: true` com `cabecalhoLido: false` é exatamente esse caso:
       * a tela funciona, a lista aparece, e o salvamento do cabeçalho fica
       * travado — porque os campos em branco ali não significam "não há
       * texto", significam "não sei o que tem".
       */
      cabecalhoLido: boolean;
      /** A rota devolve 200 com aviso quando a tabela ainda não existe. */
      aviso?: string;
    }
  | { ok: false; texto: string };

/** `null`, `undefined` e ausência viram string vazia — o estado "automático". */
function texto(bruto: unknown): string {
  return typeof bruto === "string" ? bruto : "";
}

function comoCabecalho(bruto: unknown): CabecalhoNaTela {
  const d = (bruto ?? {}) as Record<string, unknown>;
  return { tituloSeo: texto(d.tituloSeo), resumo: texto(d.resumo) };
}

export async function carregarPainel(): Promise<ResultadoDaCarga> {
  try {
    const r = await fetch("/api/guias", { cache: "no-store" });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, texto: dados.error || "Falha ao carregar" };
    }

    return {
      ok: true,
      guias: dados.guias ?? [],
      regua: dados.regua ?? [],
      cabecalho: comoCabecalho(dados.cabecalho),
      // Sem `padrao` a tela mostra campo em branco sem sugestão, e quem edita
      // não tem como saber qual é o texto que o site publica hoje.
      padrao: dados.padrao ? comoCabecalho(dados.padrao) : SEM_CABECALHO,
      // `=== true` e não coerção: uma resposta ANTIGA, de um servidor sem este
      // campo, chega como `undefined` — e `undefined` tem de significar "não
      // sei se li", que trava o salvamento. Coagir para `true` no otimismo é
      // exatamente o erro que este campo existe para desfazer.
      cabecalhoLido: dados.cabecalhoLido === true,
      aviso: typeof dados.error === "string" ? dados.error : undefined,
    };
  } catch (e) {
    return { ok: false, texto: (e as Error).message || "Falha ao carregar" };
  }
}
