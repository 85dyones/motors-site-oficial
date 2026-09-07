import type { CompanySettings } from "../types";
import type { Guia } from "./guias";
import { REFERENCIA_DA_LOJA, schemaDaLoja, schemaDoSite } from "./schemaLoja";
import { schemaDePerguntas, schemaDeTrilha } from "./schemaListagem";
import { urlDoCardGerado } from "./compartilhamento";
import { SITE_URL } from "./site";

/**
 * O grafo de um guia: `Article` + trilha + FAQ + loja + site.
 *
 * Montado numa função, e não no JSX da rota, pelo mesmo motivo de
 * `grafoDaFicha`: array de nós escrito no `<script>` é montagem sem teste —
 * remover um nó não quebra tipo, render nem teste, e a página segue publicando
 * JSON-LD válido, só que mudo. Foi assim que a `Offer` de cada ficha passou 11
 * dias apontando para um `#dealer` que a própria ficha não emitia.
 *
 * E, como lá, a função organiza mas não protege: quem guarda o resultado é o
 * teste que renderiza a rota e conta os nós servidos
 * (`tests/guias-publicam-o-grafo.test.ts`).
 *
 * ---------------------------------------------------------------------------
 * `author` é a loja, e isso é o teto de hoje
 * ---------------------------------------------------------------------------
 * O `Article` aponta `author` para o `#dealer`. Funciona e é honesto — quem
 * escreve é a loja —, mas autor PESSOA é sinal de E-E-A-T mais forte que autor
 * organização. Quando um consultor assinar o texto, `author` vira
 * `{"@type":"Person", name, jobTitle, worksFor: REFERENCIA_DA_LOJA}` e o
 * `#dealer` continua no `publisher`. É troca de uma linha; o que falta é a
 * decisão de quem assina.
 */
export function grafoDoGuia(opcoes: {
  guia: Guia;
  empresa: CompanySettings;
}): unknown[] {
  const { guia, empresa } = opcoes;
  const url = `${SITE_URL}/guias/${guia.slug}`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "@id": `${url}#article`,
      headline: guia.titulo,
      description: guia.descricao,
      inLanguage: "pt-BR",
      datePublished: guia.publicadoEm,
      dateModified: guia.atualizadoEm,
      author: REFERENCIA_DA_LOJA,
      publisher: REFERENCIA_DA_LOJA,
      mainEntityOfPage: url,
      url,
      /**
       * A imagem sai da MESMA função que monta o card de compartilhamento.
       *
       * A primeira versão montava a URL à mão com `encodeURIComponent` e
       * afirmava que "schema e compartilhamento nunca divergem". Divergiam já
       * no caso base, e a revisão mediu: `URLSearchParams` codifica espaço como
       * `+` e a mão codificava como `%20`, e o card carrega `&rotulo=Guia` que
       * a versão à mão não tinha.
       *
       * Com `urlDoCardGerado` as duas batem enquanto o painel não tiver arte
       * própria. Se a loja subir uma, o `og:image` passa a ser a arte e este
       * campo continua o card gerado — o que é aceitável (o `Article.image`
       * não precisa ser idêntico ao `og`), e é por isso que a frase "nunca
       * divergem" não voltou.
       *
       * O `SITE_URL` na frente NÃO é redundante: `urlDoCardGerado` devolve
       * caminho relativo, que serve ao `next/metadata` (ele absolutiza pelo
       * `metadataBase`) e não serve ao JSON-LD — `image` de schema.org precisa
       * ser URL absoluta. Sem esta linha o campo saía `/og?titulo=…`, medido no
       * HTML construído.
       */
      image: `${SITE_URL}${urlDoCardGerado(guia.titulo, "Guia")}`,
      about: guia.sobre.map((name) => ({ "@type": "Thing", name })),
    },
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Guias", caminho: "/guias" },
      { nome: guia.titulo, caminho: `/guias/${guia.slug}` },
    ]),
    // O `FAQPage` do guia carrega as MESMAS perguntas que a página renderiza —
    // a exigência do Google é que o texto marcado seja idêntico ao visível, e
    // é por isso que a lista é uma só: a coluna `faq` da linha do guia, que a
    // rota e este nó leem do mesmo objeto.
    schemaDePerguntas(guia.faq),
    schemaDaLoja(empresa),
    schemaDoSite(empresa),
  ];
}

/**
 * O grafo do índice `/guias`: uma `CollectionPage` que lista os artigos.
 *
 * `ItemList` com URL e posição, sem repetir título nem descrição de cada guia:
 * esses dados já estão no `Article` de cada um, e duplicá-los aqui cria duas
 * fontes que envelhecem em ritmos diferentes. Mesma disciplina de
 * `schemaDeListagem`.
 */
export function grafoDoIndiceDeGuias(opcoes: {
  guias: Guia[];
  empresa: CompanySettings;
}): unknown[] {
  const { guias, empresa } = opcoes;

  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/guias#page`,
      url: `${SITE_URL}/guias`,
      name: "Guias sobre procedência de seminovos",
      inLanguage: "pt-BR",
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: guias.length,
        itemListElement: guias.map((g, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE_URL}/guias/${g.slug}`,
        })),
      },
    },
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Guias", caminho: "/guias" },
    ]),
    schemaDaLoja(empresa),
    schemaDoSite(empresa),
  ];
}
