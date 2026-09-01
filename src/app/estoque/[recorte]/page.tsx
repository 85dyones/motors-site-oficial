import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaDeEstoque from "../../../components/modernist/PaginaDeEstoque";
import ContagemDeEstoque from "../../../components/ContagemDeEstoque";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import {
  acharHubDeCarroceria,
  acharHubDeFaixa,
  acharHubDePerfil,
  FAIXAS_DE_PRECO,
  hubsDeCarroceria,
  hubsDeMarca,
  recortesDoEstoque,
} from "../../../lib/hubsDeEstoque";
import {
  blocoJsonLd,
  schemaDeListagem,
  schemaDePerguntas,
  schemaDeTrilha,
} from "../../../lib/schemaListagem";
import { schemaDaLoja } from "../../../lib/schemaLoja";
import {
  perguntasDeCategoria,
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
 */

export const revalidate = 3600;
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
      tituloSeo: `${plural} ${Novas} em Curitiba — ${carroceria.veiculos.length} no estoque`,
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
      tituloSeo: `${perfil.titulo} em Curitiba — ${perfil.veiculos.length} no estoque`,
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
    const recorte: RecorteResolvido = {
      titulo: `Seminovos ${faixa.nome} em Curitiba`,
      tituloSeo: `Carros Seminovos ${faixa.nome} em Curitiba | Motors Store`,
      descricao:
        `Carros seminovos ${faixa.nome} em Curitiba, com perícia cautelar independente e ` +
        "laudo na ficha de cada veículo. Troca e financiamento. Loja no Bacacheri.",
      rotulo: faixa.nome,
      veiculos: faixa.veiculos,
      introducao: textoDeFaixaDePreco(faixa.nome, faixa.veiculos),
      rotuloNasPerguntas: `carros ${faixa.nome}`,
      // "carros" é o substantivo desta página, e é masculino em qualquer faixa.
      genero: "m",
    };
    return { recorte, historico, disponiveis };
  }

  return null;
}

export async function generateStaticParams() {
  // Só as faixas: a lista é fechada e não depende do banco. As carrocerias
  // continuam sob demanda (`dynamicParams`), como os hubs de marca.
  return FAIXAS_DE_PRECO.map((f) => ({ recorte: f.slug }));
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
