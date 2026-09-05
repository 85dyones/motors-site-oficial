import type { CompanySettings, Veiculo } from "../types";
import { schemaDaLoja, schemaDoSite } from "./schemaLoja";
import { schemaDeTrilha, type DegrauDaTrilha } from "./schemaListagem";
import { schemaDoVeiculo } from "./schemaVeiculo";

/**
 * Os quatro nós que a ficha do veículo publica — montados aqui, não no JSX.
 *
 * Existe por causa de um defeito que este repositório cometeu três vezes em
 * 2026, sempre igual: montar o array de nós direto no `<script>` da rota deixa
 * a MONTAGEM sem teste. Tirar um nó do array não quebra tipo, não quebra render
 * e não quebra teste nenhum — a página segue publicando JSON-LD válido, só que
 * mudo. Foi assim que a `Offer` de cada ficha passou duas semanas apontando
 * `seller: { "@id": ".../#dealer" }` para um nó que a própria ficha não emitia.
 *
 * Com a montagem numa função, remover um nó exige editar código coberto.
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
