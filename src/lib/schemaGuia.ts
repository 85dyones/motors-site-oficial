import type { CompanySettings } from "../types";
import type { Guia } from "./guias";
import { NOME_DA_SECAO } from "./guias";
import { REFERENCIA_DA_LOJA, schemaDaLoja, schemaDoSite } from "./schemaLoja";
import { schemaDePerguntas, schemaDeTrilha } from "./schemaListagem";
import { urlDoCardGerado } from "./compartilhamento";
import { SITE_URL } from "./site";
import { AUTOR_DOS_GUIAS } from "./assinaturaDoGuia";

/** O `@id` da pessoa que assina os guias — estável, para outro nó poder citá-la. */
export const ID_DO_AUTOR_DOS_GUIAS = `${SITE_URL}/#autor-dyones-oliveira`;

/** Onde o site apresenta o autor: o bloco `#autor` de `/sobre`. O caminho
 *  relativo é o do link visível no guia; a URL absoluta, a do schema. */
export const CAMINHO_DO_AUTOR_DOS_GUIAS = "/sobre#autor";
export const URL_DO_AUTOR_DOS_GUIAS = `${SITE_URL}${CAMINHO_DO_AUTOR_DOS_GUIAS}`;

/** O autor dos guias como `Person`, trabalhando para a loja. */
export function schemaDoAutorDosGuias() {
  return {
    "@type": "Person",
    "@id": ID_DO_AUTOR_DOS_GUIAS,
    name: AUTOR_DOS_GUIAS.nome,
    // Apresentação e página desde 29/09/2026 (auditoria de visibilidade em
    // IA): com só o nome, o nó não dizia por que essa pessoa entende do
    // assunto. A página é o bloco `#autor` de `/sobre`, que diz a mesma coisa
    // em texto. Sem `jobTitle`: até 30/09 dizia "Fundador", e ele não é.
    description: `${AUTOR_DOS_GUIAS.nome}, ${AUTOR_DOS_GUIAS.apresentacao}.`,
    url: URL_DO_AUTOR_DOS_GUIAS,
    worksFor: REFERENCIA_DA_LOJA,
  };
}

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
 * `author` é uma pessoa; a loja é `publisher`
 * ---------------------------------------------------------------------------
 * Até 2026-09-21 o `Article` apontava `author` para o `#dealer`. Honesto, mas
 * autor PESSOA é sinal de E-E-A-T mais forte que autor organização, e o que
 * faltava era a decisão de quem assina. O dono decidiu: os guias são dele
 * (`AUTOR_DOS_GUIAS`). O nó da pessoa diz `worksFor` a loja, e o `#dealer`
 * segue como `publisher`. A assinatura visível da página lê a MESMA constante.
 *
 * Sem `jobTitle` e sem `sameAs` de propósito: cargo e perfil pessoal são dados
 * que o dono ainda não deu, e o schema não inventa.
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
      author: schemaDoAutorDosGuias(),
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
      image: `${SITE_URL}${urlDoCardGerado("guias")}`,
      about: guia.sobre.map((name) => ({ "@type": "Thing", name })),
    },
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      // Bate com a trilha VISÍVEL das duas páginas. O Google compara o
      // `BreadcrumbList` com o que está na tela, e um degrau que diverge é pior
      // que degrau nenhum.
      { nome: NOME_DA_SECAO, caminho: "/guias" },
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
      // O `name` da coleção é o NOME DA PÁGINA — a mesma string do `<h1>`, e
      // por isso a mesma constante. Os termos buscáveis ficam no `<title>`,
      // que é onde eles trabalham.
      name: NOME_DA_SECAO,
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
      // Bate com a trilha VISÍVEL das duas páginas. O Google compara o
      // `BreadcrumbList` com o que está na tela, e um degrau que diverge é pior
      // que degrau nenhum.
      { nome: NOME_DA_SECAO, caminho: "/guias" },
    ]),
    schemaDaLoja(empresa),
    schemaDoSite(empresa),
  ];
}
