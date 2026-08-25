import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaGeoView from "../../components/PaginaGeoView";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { acharPaginaGeo } from "../../lib/paginasGeo";

/** Conteúdo, rota de acesso e perguntas desta página vivem em `lib/paginasGeo.ts`. */
const SLUG = "seminovos-curitiba" as const;

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const pagina = acharPaginaGeo(SLUG);
  if (!pagina) return {};

  const { companySettings } = await getCachedSettings();
  const caminho = `/${pagina.slug}`;

  return {
    title: pagina.tituloSeo,
    description: pagina.descricao,
    alternates: { canonical: caminho },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      rotulo: pagina.nome,
      tituloPadrao: pagina.titulo,
      descricaoPadrao: pagina.descricao,
      caminho,
    }),
  };
}

export default async function Page() {
  const pagina = acharPaginaGeo(SLUG);
  if (!pagina) notFound();
  return <PaginaGeoView pagina={pagina} />;
}
