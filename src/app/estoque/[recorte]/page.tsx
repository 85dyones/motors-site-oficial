import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import PaginaDeEstoque from "../../../components/modernist/PaginaDeEstoque";
import ContagemDeEstoque from "../../../components/ContagemDeEstoque";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import {
  acharHubDeCambio,
  acharHubDeCarroceria,
  acharHubDeFaixa,
  acharHubDePerfil,
  FAIXAS_DE_PRECO,
  hubsDeCambio,
  hubsDeCarroceria,
  hubsDeMarca,
  RECORTES_APOSENTADOS,
  RECORTES_DE_CAMBIO,
  recortesDoEstoque,
} from "../../../lib/hubsDeEstoque";
import {
  blocoJsonLd,
  schemaDeListagem,
  schemaDePerguntas,
  schemaDeTrilha,
} from "../../../lib/schemaListagem";
import { schemaDaLoja, schemaDoSite } from "../../../lib/schemaLoja";
import {
  perguntasDeCategoria,
  textoDeCambio,
  textoDeCarroceria,
  textoDeFaixaDePreco,
  textoDePerfil,
} from "../../../lib/textoDosHubs";
import { avaliados, seminovo, type Genero } from "../../../lib/generoDoVeiculo";
import { buscarTextoDoHub, resolverTextoDoHub } from "../../../lib/textoEditadoDoHub";
import type { Veiculo } from "../../../types";
import { linkWhatsApp } from "../../../lib/whatsapp";

/**
 * Recortes do estoque — `/estoque/suv`, `/estoque/ate-60-mil`.
 *
 * Uma rota, duas famílias de recorte, porque para o visitante e para o Google
 * elas são a mesma coisa: uma vitrine filtrada com endereço próprio. Ambas
 * cobrem clusters do §1.6 que o catálogo com `?carroceria=` nunca poderia
 * ranquear — filtro é `noindex` por regra, e com razão.
 *
 * O segmento é resolvido contra duas listas **fechadas**: as carrocerias do
 * vocabulário (`CARROCERIAS_COM_HUB`) e as faixas de preço (`FAIXAS_DE_PRECO`).
 * Qualquer outra coisa é 404. Sem isso, `tipo` — que o painel edita à mão —
 * transformaria um erro de digitação em URL indexável.
 *
 * A diferença entre as duas: carroceria só existe se a loja já teve alguma
 * (histórico), faixa existe sempre. A lista de faixas é fechada e pequena, não
 * há espaço de URL infinito a proteger.
 *
 * Desde 05/10/2026 são quatro famílias: carroceria, perfil de uso, faixa de
 * preço e câmbio (`/estoque/automatico`, lista fechada em
 * `lib/recortesDeCambio.ts`). O câmbio se comporta como a faixa: existe sempre.
 */

/**
 * 60 s, o mesmo relógio de `/estoque`, da home e das geográficas — desde
 * 2026-09-21. Com 3600 esta página mostrava no `<h1>` uma contagem até uma
 * hora mais velha que a de `/estoque`: o n8n marca o carro vendido e
 * `/estoque` tira em um minuto, enquanto o hub seguia listando e contando o
 * carro por até sessenta. A leitura é a mesma que `/estoque` já faz a cada
 * minuto (`recortesDoEstoque`), e só roda quando alguém visita.
 */
export const revalidate = 60;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ recorte: string }>;
}

interface RecorteResolvido {
  /** Título e `<h1>`: "SUVs seminovos em Curitiba", "Seminovos até R$ 60 mil…". */
  titulo: string;
  /** Como entra no `<title>`, mais curto. */
  tituloSeo: string;
  descricao: string;
  /** Rótulo da trilha e do card de compartilhamento. */
  rotulo: string;
  veiculos: Veiculo[];
  introducao: string[];
  /** Rótulo no plural para as perguntas: "SUVs", "carros até R$ 60 mil". */
  rotuloNasPerguntas: string;
  /** Concorda com `rotuloNasPerguntas`: "As picapes", "Os SUVs". */
  genero: Genero;
}

async function resolver(slug: string) {
  const { historico, disponiveis } = await recortesDoEstoque();

  const carroceria = acharHubDeCarroceria(historico, disponiveis, slug);
  if (carroceria) {
    // O plural e o gênero vêm do hub. Aqui estavam cravados no FEMININO
    // ("seminovas", "de cada dez avaliadas"), e o plural era `nome + "s"`: só
    // Picape acertava, e a sigla de SUV virava "suvs" no `<h1>` e no `<title>`.
    const { plural, genero } = carroceria;
    const novas = seminovo(genero, true);
    const Novas = novas.charAt(0).toUpperCase() + novas.slice(1);
    const recorte: RecorteResolvido = {
      titulo: `${plural} ${novas} em Curitiba`,
      // Sem a contagem no `<title>` desde 2026-09-21, pela regra de `/estoque`:
      // o Google guarda o título do dia do rastreamento, e o número envelhece.
      // Com a carroceria vazia, ainda por cima, saía "— 0 no estoque".
      tituloSeo: `${plural} ${Novas} em Curitiba | Motors Store`,
      descricao:
        `${plural} ${novas} em Curitiba com perícia cautelar independente: de cada dez ` +
        `${avaliados(genero)}, três entram. Troca, financiamento e loja no Bacacheri.`,
      rotulo: carroceria.nome,
      veiculos: carroceria.veiculos,
      introducao: textoDeCarroceria(carroceria.nome, carroceria.veiculos, plural, genero),
      rotuloNasPerguntas: plural,
      genero,
    };
    return { recorte, historico, disponiveis };
  }

  // Perfil antes da faixa e depois da carroceria: os três dividem o mesmo
  // espaço de URL, e `tests/perfis-de-uso.test.ts` prende que nenhum slug
  // colide. A ordem só importa se um dia colidirem — e aí o teste falha antes.
  const perfil = acharHubDePerfil(disponiveis, slug);
  if (perfil) {
    const recorte: RecorteResolvido = {
      titulo: `${perfil.titulo} em Curitiba`,
      tituloSeo: `${perfil.titulo} em Curitiba | Motors Store`,
      descricao:
        `${perfil.titulo} em Curitiba, escolhidos por quem atende: veículos que resolvem ` +
        `${perfil.frase}. Perícia cautelar independente, troca e financiamento no Bacacheri.`,
      rotulo: perfil.nome,
      veiculos: perfil.veiculos,
      introducao: textoDePerfil(perfil, perfil.veiculos),
      // "carros" é o substantivo desta página, como nas faixas de preço: o
      // perfil qualifica o carro, não substitui o substantivo. Nada de
      // concordar com "Família" ou "Performance".
      rotuloNasPerguntas: perfil.titulo.toLowerCase(),
      genero: "m",
    };
    return { recorte, historico, disponiveis };
  }

  const faixa = acharHubDeFaixa(disponiveis, slug);
  if (faixa) {
    // "usados" entrou nos três textos em 05/10/2026: o Planejador de
    // Palavras-chave (`conteudo-seo/palavras-chave.md`) mediu "carros usados
    // curitiba" em 2.900 buscas por mês contra 1.600 de "seminovos curitiba",
    // e a faixa de preço é a página de quem procura pelo orçamento. O `<title>`
    // fica só com "Usados" para não estourar a largura do resultado na faixa
    // do meio ("de R$ 60 mil a R$ 100 mil").
    const recorte: RecorteResolvido = {
      titulo: `Carros usados e seminovos ${faixa.nome} em Curitiba`,
      tituloSeo: `Carros Usados ${faixa.nome} em Curitiba | Motors Store`,
      descricao:
        `Carros usados e seminovos ${faixa.nome} em Curitiba, com perícia cautelar independente e ` +
        "laudo disponível com o vendedor. Troca e financiamento. Loja no Bacacheri.",
      rotulo: faixa.nome,
      veiculos: faixa.veiculos,
      introducao: textoDeFaixaDePreco(faixa.nome, faixa.veiculos),
      rotuloNasPerguntas: `carros ${faixa.nome}`,
      // "carros" é o substantivo desta página, e é masculino em qualquer faixa.
      genero: "m",
    };
    return { recorte, historico, disponiveis };
  }

  // Câmbio por último (05/10/2026). A ordem não decide nada: os quatro dividem
  // o mesmo espaço de URL e `tests/perfis-de-uso.test.ts` prende que nenhum
  // slug colide. Como a faixa, o recorte existe sempre, mesmo com a grade
  // vazia: a lista é fechada e hoje tem uma entrada só, `automatico`.
  //
  // Os textos estão escritos para ESSA entrada, e não montados a partir do
  // nome: "Carros automáticos usados" não sai de `Carros ${nome}s usados` sem
  // repetir o erro dos plurais de carroceria. Uma segunda entrada na lista
  // precisa de textos próprios aqui, e o `if` abaixo a deixa em 404 até lá.
  const cambio = acharHubDeCambio(disponiveis, slug);
  if (cambio && cambio.slug === "automatico") {
    const recorte: RecorteResolvido = {
      titulo: "Carros automáticos usados e seminovos em Curitiba",
      tituloSeo: "Carros Automáticos Usados em Curitiba | Motors Store",
      descricao:
        "Carros automáticos usados e seminovos em Curitiba, com perícia cautelar independente e " +
        "laudo disponível com o vendedor. Troca e financiamento. Loja no Bacacheri.",
      rotulo: cambio.nome,
      veiculos: cambio.veiculos,
      introducao: textoDeCambio("automático", "automáticos", cambio.veiculos),
      rotuloNasPerguntas: "carros automáticos",
      // "carros" é o substantivo desta página, como nas faixas de preço.
      genero: "m",
    };
    return { recorte, historico, disponiveis };
  }

  return null;
}

export async function generateStaticParams() {
  // Só as faixas e o câmbio: as duas listas são fechadas e não dependem do
  // banco. As carrocerias continuam sob demanda (`dynamicParams`), como os
  // hubs de marca.
  return [...FAIXAS_DE_PRECO, ...RECORTES_DE_CAMBIO].map((r) => ({ recorte: r.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { recorte: slug } = await params;
  const dados = await resolver(slug);

  if (!dados) {
    return { title: "Categoria não encontrada | Motors Store", robots: { index: false, follow: true } };
  }

  const { recorte } = dados;
  const { companySettings } = await getCachedSettings();
  const caminho = `/estoque/${slug}`;

  return {
    title: recorte.tituloSeo,
    description: recorte.descricao,
    alternates: { canonical: caminho },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      rotulo: recorte.rotulo,
      tituloPadrao: recorte.titulo,
      descricaoPadrao: recorte.descricao,
      caminho,
    }),
  };
}

export default async function RecorteDoEstoquePage({ params }: PageProps) {
  const { recorte: slug } = await params;

  // Recorte aposentado responde 308, não 404 — a URL já foi indexada, e o 404
  // jogaria fora o sinal dela. Vem ANTES de `resolver`: depois de o valor sair
  // de `CARROCERIAS`, o hub não existe mais e a página cairia em `notFound`.
  const destino = RECORTES_APOSENTADOS[slug];
  if (destino) permanentRedirect(`/estoque/${destino}`);

  const dados = await resolver(slug);
  if (!dados) notFound();

  const { recorte, historico, disponiveis } = dados;
  const { companySettings } = await getCachedSettings();
  const caminho = `/estoque/${slug}`;
  const perguntas = perguntasDeCategoria(recorte.rotuloNasPerguntas, recorte.genero, caminho);

  // O texto que a loja escreveu vence o gerado.
  //
  // Esta rota ficou de FORA na entrega de 31/08, e o defeito era mudo: o painel
  // oferecia as 103 páginas para editar, o texto era gravado, e só os 65 hubs
  // de MODELO o exibiam. Os 20 de marca e os 18 recortes daqui ignoravam em
  // silêncio — o operador salvava, ia ver a página e encontrava o texto
  // automático de sempre. Foi assim que `/estoque/picape` foi reportado como
  // "não salva": estava salvo no banco, sem ninguém para ler.
  const { titulo, paragrafos: introducao } = resolverTextoDoHub(
    await buscarTextoDoHub(caminho),
    { titulo: recorte.titulo, paragrafos: recorte.introducao },
  );


  /* Saída do recorte sem carro (2026-09-01, relatório dos hubs). Aqui o que
     esvaziou a página foi o PRÓPRIO filtro — carroceria, perfil ou faixa —,
     então a alternativa honesta é o estoque sem ele, com card e preço em vez
     de um link que devolve o trabalho de filtrar a quem já filtrou. */
  const noEstoqueHoje = disponiveis.slice(0, 3);
  const avisarHref = linkWhatsApp(
    companySettings,
    `Olá! Vi a página ${recorte.titulo} no site e quero ser avisado quando entrar algo assim.`,
  );

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
      { nome: recorte.rotulo, caminho },
    ]),
    schemaDeListagem(titulo, recorte.veiculos),
    schemaDePerguntas(perguntas),
    schemaDaLoja(companySettings, { disponiveis }),
    schemaDoSite(companySettings),
  ]);

  return (
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <ContagemDeEstoque total={recorte.veiculos.length} />
      <PaginaDeEstoque
        trilha={[
          { rotulo: "Home", href: "/" },
          { rotulo: "Estoque", href: "/estoque" },
        ]}
        titulo={titulo}
        introducao={introducao}
        veiculos={recorte.veiculos}
        alternativos={noEstoqueHoje}
        rotuloAlternativos="Enquanto isso, no estoque de hoje"
        avisarHref={avisarHref}
        blocos={[
          {
            titulo: "Por faixa de preço",
            links: FAIXAS_DE_PRECO.filter((f) => f.slug !== slug).map((f) => ({
              rotulo: f.nome,
              href: `/estoque/${f.slug}`,
            })),
          },
          // O câmbio tem bloco próprio, e não um chip a mais em "Por faixa de
          // preço": o título do bloco é texto público e "Automáticos" não é
          // faixa. É por aqui que as carrocerias, os perfis e as faixas levam a
          // `/estoque/automatico`; na própria página o bloco fica sem link e a
          // `PaginaDeEstoque` não o desenha.
          {
            titulo: "Por câmbio",
            links: hubsDeCambio(disponiveis)
              .filter((c) => c.slug !== slug)
              .map((c) => ({ rotulo: c.plural, href: `/estoque/${c.slug}`, total: c.veiculos.length })),
          },
          {
            titulo: "Por carroceria",
            links: hubsDeCarroceria(historico, disponiveis)
              .filter((c) => c.slug !== slug)
              .map((c) => ({ rotulo: c.nome, href: `/estoque/${c.slug}`, total: c.veiculos.length })),
          },
          {
            titulo: "Marcas em estoque",
            links: hubsDeMarca(historico, disponiveis, "carros")
              .filter((m) => m.veiculos.length > 0)
              .map((m) => ({ rotulo: m.nome, href: `/carros/${m.slug}`, total: m.veiculos.length })),
          },
        ]}
        faq={perguntas}
      />
    </div>
  );
}
