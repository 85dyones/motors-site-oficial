import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaDeEstoque from "../../../components/modernist/PaginaDeEstoque";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import {
  acharHubDeCarroceria,
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
import { perguntasDeCategoria, textoDeCarroceria } from "../../../lib/textoDosHubs";

/**
 * Hub de carroceria — `/estoque/suv`, `/estoque/sedan`.
 *
 * Cobre o cluster "categoria + geo" do §1.6 (`suv seminovo curitiba`,
 * `picape usada curitiba`), que o catálogo com filtro `?carroceria=` nunca
 * poderia ranquear: filtro é `noindex` por regra, e com razão.
 *
 * A carroceria aceita vem de `CARROCERIAS_COM_HUB` — lista fechada. É campo que
 * o painel edita à mão; sem a lista, um erro de digitação viraria URL indexável.
 */

export const revalidate = 3600;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ carroceria: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { carroceria } = await params;
  const { historico, disponiveis } = await recortesDoEstoque();
  const hub = acharHubDeCarroceria(historico, disponiveis, carroceria);

  if (!hub) {
    return { title: "Categoria não encontrada | Motors Store", robots: { index: false, follow: true } };
  }

  const { companySettings } = await getCachedSettings();
  const caminho = `/estoque/${hub.slug}`;
  const plural = `${hub.nome}s`;
  const title = `${plural} Seminovas em Curitiba — ${hub.veiculos.length} no estoque`;
  const description =
    `${plural} seminovas em Curitiba com perícia cautelar independente: de cada dez avaliadas, ` +
    "três entram. Troca, financiamento e loja no Bacacheri.";

  return {
    title,
    description,
    alternates: { canonical: caminho },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      rotulo: hub.nome,
      tituloPadrao: `${plural} seminovas em Curitiba`,
      descricaoPadrao: description,
      caminho,
    }),
  };
}

export default async function HubDeCarroceriaPage({ params }: PageProps) {
  const { carroceria } = await params;
  const { historico, disponiveis } = await recortesDoEstoque();
  const hub = acharHubDeCarroceria(historico, disponiveis, carroceria);
  if (!hub) notFound();

  const { companySettings } = await getCachedSettings();
  const caminho = `/estoque/${hub.slug}`;
  const plural = `${hub.nome}s`;
  const titulo = `${plural} seminovas em Curitiba`;
  const perguntas = perguntasDeCategoria(plural.toLowerCase());

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
      { nome: hub.nome, caminho },
    ]),
    schemaDeListagem(titulo, hub.veiculos),
    schemaDePerguntas(perguntas),
    schemaDaLoja(companySettings, { disponiveis }),
  ]);

  return (
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <PaginaDeEstoque
        trilha={[
          { rotulo: "Home", href: "/" },
          { rotulo: "Estoque", href: "/estoque" },
        ]}
        titulo={titulo}
        introducao={textoDeCarroceria(hub.nome, hub.veiculos)}
        veiculos={hub.veiculos}
        blocos={[
          {
            titulo: "Outras carrocerias",
            links: hubsDeCarroceria(historico, disponiveis)
              .filter((c) => c.slug !== hub.slug)
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
