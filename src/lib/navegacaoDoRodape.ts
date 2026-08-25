import { unstable_cache } from "next/cache";
import { hubsDeMarca, recortesDoEstoque } from "./hubsDeEstoque";
import { truncateString } from "./supabase";
import type { Veiculo } from "../types";

/**
 * Os links de marca e modelo do rodapé — resolvidos no servidor.
 *
 * ---------------------------------------------------------------------------
 * Dois defeitos num bloco só
 * ---------------------------------------------------------------------------
 * O rodapé lista "MARCAS DISPONÍVEIS" e "MODELOS EM DESTAQUE" em toda página do
 * site: é o link interno mais repetido que existe aqui. Até 2026-08-25 ele
 * tinha dois problemas que se somavam.
 *
 * **Apontava para o lugar errado.** As marcas linkavam `/estoque?marca=X` — uma
 * URL de filtro, que desde a criação dos hubs COMPETE com `/carros/{marca}` em
 * vez de alimentá-lo. E os modelos linkavam fichas individuais, com um
 * comentário no código explicando o porquê: "o feed não tem um campo de nome de
 * modelo limpo". Tinha razão na época; `rotuloDoModelo` e `slugDeModelo`
 * (`lib/hubsDeEstoque.ts`) resolveram isso.
 *
 * **E era invisível.** O `Footer` é client component e buscava o estoque pelo
 * navegador, num `useEffect`. Medido na produção em 2026-08-25: **zero** desses
 * links apareciam no HTML servido. O bloco existia como SEO e não entregava
 * rastreio nenhum.
 *
 * ---------------------------------------------------------------------------
 * Por que passa por cache
 * ---------------------------------------------------------------------------
 * O rodapé é do layout raiz: roda em TODA rota, inclusive nas do painel. Sem o
 * cache, cada visita a `/admin/financeiro` pagaria duas consultas ao Supabase
 * só para montar um bloco de links que aquela tela nem mostra. Uma hora é a
 * mesma cadência do ISR das outras páginas e folgada para o sync de estoque,
 * que roda de 6 em 6 horas — mesma escolha de `getDatasDeVenda`.
 */

const MAX_MARCAS = 8;
const MAX_MODELOS = 5;

export interface LinkDoRodape {
  rotulo: string;
  href: string;
}

export interface NavegacaoDoRodape {
  marcas: LinkDoRodape[];
  modelos: LinkDoRodape[];
}

/**
 * A regra, separada da leitura do banco para poder ser testada sem Supabase.
 *
 * `historico` decide quais hubs existem, `disponiveis` ordena por estoque vivo —
 * a mesma dupla que todas as páginas perenes usam.
 */
export function montarNavegacaoDoRodape(
  historico: Veiculo[],
  disponiveis: Veiculo[],
): NavegacaoDoRodape {
  const hubs = hubsDeMarca(historico, disponiveis, "carros");

  // Marca com carro à venda primeiro — `hubsDeMarca` já ordena assim. O rodapé
  // não lista hub vazio: ele é vitrine, não índice. Quem quer o mapa completo
  // acha em /estoque, que lista todos.
  const marcas = hubs
    .filter((h) => h.veiculos.length > 0)
    .slice(0, MAX_MARCAS)
    .map((h) => ({ rotulo: h.nome, href: `/carros/${h.slug}` }));

  // Modelos: os de mais unidades no estoque, achatando as marcas. Antes eram os
  // cinco carros mais caros, linkando a ficha de cada um — o que fazia o rodapé
  // apontar para URLs que morrem na venda.
  const modelos = hubs
    .flatMap((h) => h.modelos)
    .filter((m) => m.veiculos.length > 0)
    .sort((a, b) => b.veiculos.length - a.veiculos.length || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, MAX_MODELOS)
    .map((m) => ({
      // `m.nome` já vem sem a versão embutida, de `rotuloDoModelo`. Havia aqui
      // uma passagem por `modeloEVersaoParaExibir(m.nome, "")` — que com versão
      // vazia devolve o texto intacto (`estoqueTabela.ts:142`). Chamada morta
      // que fingia um recorte, e quem lesse depois suporia que ele acontece.
      // O truncate fica: nome de modelo longo estoura a régua do rodapé.
      rotulo: truncateString(`${m.marca} ${m.nome}`.trim(), 26),
      href: `/carros/${m.slugMarca}/${m.slug}`,
    }));

  return { marcas, modelos };
}

export const getNavegacaoDoRodape = unstable_cache(
  async (): Promise<NavegacaoDoRodape> => {
    try {
      const { historico, disponiveis } = await recortesDoEstoque();
      return montarNavegacaoDoRodape(historico, disponiveis);
    } catch (erro) {
      // Rodapé sem os links é feio; rodapé que derruba a página inteira é pior.
      console.warn("[Rodapé] Falha ao resolver marcas e modelos:", erro);
      return { marcas: [], modelos: [] };
    }
  },
  ["navegacao-do-rodape"],
  { revalidate: 3600, tags: ["navegacao-do-rodape"] },
);
