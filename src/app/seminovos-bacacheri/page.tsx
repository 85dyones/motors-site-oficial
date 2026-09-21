import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaGeoView from "../../components/PaginaGeoView";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { acharPaginaGeo } from "../../lib/paginasGeo";

/** Conteúdo, rota de acesso e perguntas desta página vivem em `lib/paginasGeo.ts`. */
const SLUG = "seminovos-bacacheri" as const;

/**
 * 60 s, o mesmo de `/estoque` e da home — desde 2026-09-21.
 *
 * Com 3600 a página contava pelo MESMO caminho (`disponiveisDe(getEstoque())`)
 * mas renderizava até uma hora depois: a auditoria de 20/09 viu 38 veículos
 * aqui e 36 em `/estoque` no mesmo minuto, e leu como canibalização. Era
 * cache. A leitura custa o mesmo que `/estoque` já faz a cada minuto.
 */
export const revalidate = 60;

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
