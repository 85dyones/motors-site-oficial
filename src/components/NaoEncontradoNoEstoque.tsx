import type { ReactNode } from "react";
import PaginaDeEstoque from "./modernist/PaginaDeEstoque";
import type { MarcaConhecida } from "../lib/fichaPerdida";
import {
  FAIXAS_DE_PRECO,
  recorteDoNaoEncontrado,
  type RecorteDoNaoEncontrado,
} from "../lib/hubsDeEstoque";
import { EstoqueIndisponivelError } from "../lib/supabase";

/**
 * O corpo das páginas de não encontrado do estoque — ficha, modelo e marca.
 *
 * ---------------------------------------------------------------------------
 * Por que um componente, e o que fica em cada página
 * ---------------------------------------------------------------------------
 * `not-found.tsx` não recebe params: cada página só sabe quem ela é — o título,
 * o texto e o bloco de encomenda. Tudo o que vem do estoque (a amostra do
 * pátio, as faixas, as carrocerias, as marcas) e o tratamento da pane são
 * iguais nas três, e moram aqui. A primeira versão, só da ficha, é a do #70; a
 * extração não mudou o que a ficha renderiza, e a prova é
 * `tests/ficha-sem-veiculo.test.ts` sem uma linha alterada.
 *
 * ---------------------------------------------------------------------------
 * Componente nenhum novo na tela
 * ---------------------------------------------------------------------------
 * `PaginaDeEstoque` com a grade VAZIA é exatamente o desenho do hub sem carro
 * — formulário de encomenda, alternativas com card e preço, e o catálogo
 * inteiro. Foi desenhado em 01/09 para o mesmo problema destas páginas ("quem
 * procurou uma coisa específica e não achou"), já tem teste, e reusá-lo custa
 * uma prop. Tudo o que segura a R5 (título, texto, grade do pátio, recortes,
 * "ver todo o estoque") é server component e não depende do caminho; só o
 * bloco de encomenda lê o caminho, no cliente. Nada disso está no HTML servido
 * de um `notFound()`: a resposta é a casca de erro do Next, e o navegador
 * desenha a página pelo payload — a nota longa está no docblock de
 * `not-found.tsx` da ficha.
 *
 * ---------------------------------------------------------------------------
 * A encomenda chega como função
 * ---------------------------------------------------------------------------
 * O bloco da ficha e o do modelo precisam do índice de marcas, e o índice nasce
 * dentro da leitura com cache, que acontece aqui: a página não tem como montar
 * o elemento antes. A função roda no servidor e nunca atravessa para o
 * cliente; o que atravessa é o elemento que ela devolve, com props
 * serializáveis.
 *
 * Na pane a função não é chamada: sem índice não há o que personalizar, e o
 * formulário grava em `leads` — o mesmo banco que acabou de falhar.
 *
 * ---------------------------------------------------------------------------
 * A leitura e a pane (2026-09-13)
 * ---------------------------------------------------------------------------
 * A leitura é `recorteDoNaoEncontrado`: o recorte pronto, guardado por uma
 * hora, e não o estoque — caminho falso é ilimitado, e a decisão do dono foi
 * cache só no não encontrado. O porquê e o tamanho medido estão lá. O cache
 * pesa mais do que o docblock de lá conta: esta leitura roda também em toda
 * ficha e todo hub que respondem 200 (ver a seção abaixo). Tirá-lo põe a
 * leitura do estoque em cada uma dessas páginas.
 *
 * Na pane do Supabase a leitura estoura `EstoqueIndisponivelError`, e não há
 * `error.tsx` em `src/app` (decisão de 13/09). O componente captura SÓ esse
 * erro e responde com título, `texto` e "ver todo o estoque" — sem amostra,
 * sem blocos e sem `textoDaAmostra`, que anuncia a amostra que a pane não
 * mostra (T3). Qualquer outra exceção sobe. A exceção não entra no cache, e a
 * requisição seguinte tenta de novo.
 *
 * ---------------------------------------------------------------------------
 * O custo nas páginas que existem (medido em 2026-09-14)
 * ---------------------------------------------------------------------------
 * `not-found.tsx` não roda só no 404. O Next monta o elemento do not-found de
 * cada segmento em todo render (`create-component-tree.js:310-316`, em
 * `next/dist/server/app-render/`) e o entrega ao LayoutRouter dos filhos
 * (`:336`). Como este componente é assíncrono, o corpo inteiro — leitura,
 * amostra, blocos, índice e formulário — roda e entra no payload RSC de toda
 * página da subárvore, inclusive das que respondem 200. A ficha carrega três
 * corpos (ficha, modelo e marca), o hub de modelo carrega dois e o de marca,
 * um.
 *
 * Medido no Toyota Corolla Cross, tudo 200, contra a produção sem nenhum
 * not-found — comprimido, e entre parênteses sem compressão:
 *
 *   ficha          22,3 KB → 26,4 KB   (147 KB → 241 KB)
 *   hub de modelo  11,9 KB → 15,3 KB   ( 72 KB → 134 KB)
 *   hub de marca   12,2 KB → 15,3 KB   ( 76 KB → 108 KB)
 *
 * Os corpos repetidos quase somem na compressão: o primeiro custa 3 a 4 KB, e o
 * #70 sozinho já somava 3,7 KB em toda ficha. A ficha também passou a carregar
 * um chunk de JavaScript a mais, de 6,5 KB sem compressão. A decisão do dono
 * (14/09) foi aceitar o custo e deixá-lo escrito aqui.
 *
 * O risco que vem junto: `lerRecorte` relança toda exceção que não seja
 * `EstoqueIndisponivelError`, e agora isso acontece dentro do render de toda
 * ficha e todo hub. No build e na revalidação do ISR o Next prerenderiza a
 * página (`app-render.js:1402-1404`) e falha a geração quando o render teve
 * erro inesperado (`:1421-1430`). Um defeito de programação aqui derruba a
 * geração da página que existe, e não só o 404. Antes de pôr mais peso ou outra
 * leitura neste componente — ou um quarto `not-found.tsx` —, conte com isso.
 *
 * ---------------------------------------------------------------------------
 * Chamado como função pelas páginas
 * ---------------------------------------------------------------------------
 * As páginas fazem `return NaoEncontradoNoEstoque({ … })`, e não
 * `<NaoEncontradoNoEstoque />`. No servidor as duas formas dão o mesmo HTML; a
 * diferença é que a página devolve a árvore já resolvida, que é o que
 * `renderToStaticMarkup(await Pagina())` consegue desenhar nos testes —
 * componente assíncrono dentro da árvore, não.
 */

export interface NaoEncontradoNoEstoqueProps {
  /** O `<h1>`. */
  titulo: string;
  /** A frase que sai sempre, inclusive na pane. */
  texto: string;
  /** A frase que só é verdade quando a amostra e as trilhas aparecem abaixo. */
  textoDaAmostra?: string;
  trilha: { rotulo: string; href?: string }[];
  /** O bloco de encomenda, montado com o índice que a leitura devolve. */
  encomenda: (marcas: MarcaConhecida[]) => ReactNode;
}

/** O recorte guardado, ou `null` na pane do estoque — e só nela. */
async function lerRecorte(): Promise<RecorteDoNaoEncontrado | null> {
  try {
    return await recorteDoNaoEncontrado();
  } catch (erro) {
    if (erro instanceof EstoqueIndisponivelError) return null;
    throw erro;
  }
}

export default async function NaoEncontradoNoEstoque({
  titulo,
  texto,
  textoDaAmostra,
  trilha,
  encomenda,
}: NaoEncontradoNoEstoqueProps) {
  const recorte = await lerRecorte();

  if (!recorte) {
    return (
      <PaginaDeEstoque trilha={trilha} titulo={titulo} veiculos={[]} textoSemEstoque={texto} />
    );
  }

  return (
    <PaginaDeEstoque
      trilha={trilha}
      titulo={titulo}
      veiculos={[]}
      textoSemEstoque={textoDaAmostra ? `${texto} ${textoDaAmostra}` : texto}
      encomenda={encomenda(recorte.marcas)}
      alternativos={recorte.patio}
      rotuloAlternativos="Do pátio de hoje, em todas as faixas"
      blocos={[
        {
          titulo: "Por faixa de preço",
          links: FAIXAS_DE_PRECO.map((f) => ({ rotulo: f.nome, href: `/estoque/${f.slug}` })),
        },
        { titulo: "Por carroceria", links: recorte.carrocerias },
        { titulo: "Marcas em estoque", links: recorte.marcasComEstoque },
      ]}
    />
  );
}
