import type { CompanySettings, Veiculo } from "../types";
import { schemaDaLoja, schemaDoSite } from "./schemaLoja";
import { schemaDeTrilha, type DegrauDaTrilha } from "./schemaListagem";
import { schemaDoVeiculo } from "./schemaVeiculo";

/**
 * Os quatro nós que a ficha do veículo publica — montados aqui, não no JSX.
 *
 * Existe por causa de um defeito concreto: montar o array de nós direto no
 * `<script>` da rota deixa a MONTAGEM sem teste. Tirar um nó não quebra tipo,
 * não quebra render e não quebra teste — a página segue publicando JSON-LD
 * válido, só que mudo. Foi assim que a `Offer` de cada ficha passou **11 dias**
 * (25/08 a 05/09/2026) apontando `seller: { "@id": ".../#dealer" }` para um nó
 * que a própria ficha não emitia.
 *
 * ⚠️ **Extrair a montagem não basta**, e a revisão da F2 provou: com esta
 * função pronta e coberta por 5 casos, trocar o ponto de publicação por
 * `blocoJsonLd(grafo.slice(0, 1))` na rota deixava a suíte INTEIRA verde. Quem
 * guarda o resultado é `tests/ficha-publica-o-grafo.test.ts`, que renderiza a
 * ficha e conta os nós servidos. Esta função organiza; o teste é que protege.
 *
 * ---------------------------------------------------------------------------
 * O que TEM rede, e o que não tem
 * ---------------------------------------------------------------------------
 * Sem contagem, de propósito: número agregado apodrece a cada rota nova e vira
 * mentira sozinho — foi o que aconteceu com as três versões anteriores deste
 * parágrafo. Nome de rota não apodrece. Para a lista viva,
 * `grep -rln schemaDoSite src/`.
 *
 * **Têm** teste que renderiza a página e CONTA os nós servidos:
 *   · esta ficha            → `tests/ficha-publica-o-grafo.test.ts`
 *   · `/sobre`, `/contato`
 *     e `/estoque`          → `tests/paginas-de-entidade.test.ts`
 *
 * **Não têm**: a home · `/avaliacao` (o teste dela confere `AutoDealer` e
 * `BreadcrumbList`, não o `WebSite`) · `/carro-perfeito` · `/privacidade` ·
 * `/destaques/[tag]` · `PaginaGeoView`, que serve `/seminovos-curitiba` e
 * `/seminovos-bacacheri` · `/garantia` · `/financiamento` ·
 * `/estoque/[recorte]` · `/[categoria]/[marca]` · `/[categoria]/[marca]/[modelo]`.
 *
 * A revisão provou o custo disso: removendo `schemaDoSite` de todas as
 * descobertas de uma vez, a suíte fica verde.
 *
 * O critério de onde investir foi tráfego e custo do mock. A ficha e `/estoque`
 * são as que mais recebem; `/sobre` e `/contato` são as de entidade. O preço
 * não é baixo e está à vista nos próprios arquivos: `ficha-publica-o-grafo`
 * abre com seis `vi.mock`, `paginas-de-entidade` com cinco para as três rotas
 * dele. A home custaria mais ainda — puxa reputação do Google e curadoria do
 * Instagram além do estoque —, e mock demais transforma prova em ficção.
 *
 * (A primeira versão desta nota dizia "três vezes em 2026" e "duas semanas".
 * Nenhum dos dois se sustentou na verificação — o defeito documentado é um, e
 * são 11 dias.)
 *
 * ---------------------------------------------------------------------------
 * Por que os quatro, e nessa ordem
 * ---------------------------------------------------------------------------
 * `Car` é o assunto da página. `BreadcrumbList` é o único dos quatro que rende
 * resultado rico de verdade (a trilha `Estoque › Jeep › Renegade`). `AutoDealer`
 * é quem a oferta referencia — sem ele o `@id` fica órfão dentro do documento.
 * `WebSite` fecha o grafo dizendo de quem é o domínio.
 *
 * JSON-LD é grafo, não lista: a ordem não muda o significado. Ela existe para
 * quem lê o HTML servido — e aí o assunto da página vem primeiro.
 */
export function grafoDaFicha(opcoes: {
  veiculo: Veiculo;
  /** Caminho da ficha, como `getVeiculoPdpUrl` devolve. */
  caminho: string;
  /** Veio de `decidirPublicacao`: fora do feed conta como fora de estoque. */
  indisponivel: boolean;
  trilha: DegrauDaTrilha[];
  empresa: CompanySettings;
  /** Só para a faixa de preço do `AutoDealer`. */
  disponiveis: Veiculo[];
}): unknown[] {
  return [
    schemaDoVeiculo(opcoes.veiculo, {
      caminho: opcoes.caminho,
      indisponivel: opcoes.indisponivel,
    }),
    schemaDeTrilha(opcoes.trilha),
    schemaDaLoja(opcoes.empresa, { disponiveis: opcoes.disponiveis }),
    schemaDoSite(opcoes.empresa),
  ];
}
