import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaDeEstoque from "../../../components/modernist/PaginaDeEstoque";
import ContagemDeEstoque from "../../../components/ContagemDeEstoque";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import {
  acharHubDeCarroceria,
  acharHubDeFaixa,
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
} from "../../../lib/textoDosHubs";
import type { Veiculo } from "../../../types";

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
  /** Título e `<h1>`: "SUVs seminovas em Curitiba", "Seminovos até R$ 60 mil…". */
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
}

async function resolver(slug: string) {
  const { historico, disponiveis } = await recortesDoEstoque();

  const carroceria = acharHubDeCarroceria(historico, disponiveis, slug);
  if (carroceria) {
    const plural = `${carroceria.nome}s`;
    const recorte: RecorteResolvido = {
      titulo: `${plural} seminovas em Curitiba`,
      tituloSeo: `${plural} Seminovas em Curitiba — ${carroceria.veiculos.length} no estoque`,
      descricao:
        `${plural} seminovas em Curitiba com perícia cautelar independente: de cada dez ` +
        "avaliadas, três entram. Troca, financiamento e loja no Bacacheri.",
      rotulo: carroceria.nome,
      veiculos: carroceria.veiculos,
      introducao: textoDeCarroceria(carroceria.nome, carroceria.veiculos),
      rotuloNasPerguntas: plural.toLowerCase(),
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
  const perguntas = perguntasDeCategoria(recorte.rotuloNasPerguntas);

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
      { nome: recorte.rotulo, caminho },
    ]),
    schemaDeListagem(recorte.titulo, recorte.veiculos),
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
        titulo={recorte.titulo}
        introducao={recorte.introducao}
        veiculos={recorte.veiculos}
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
