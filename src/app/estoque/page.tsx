import type { Metadata } from "next";
import { Suspense } from "react";
import Catalogo from "../../components/modernist/Catalogo";
import { getEstoque } from "../../lib/supabase";
import { getCachedSettings } from "../../lib/settings";
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
} from "../../lib/destaquesRapidos";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const estoque = await getEstoque();
  const total = estoque.filter((v) => !v.vendido).length;

  return {
    title: `Estoque — ${total} veículos seminovos em Curitiba | Motors Store`,
    description:
      `${total} veículos premium selecionados com laudo cautelar, procedência auditada e garantia. ` +
      "Filtre por marca, carroceria, câmbio e faixa de preço.",
    alternates: { canonical: "/estoque" },
    openGraph: {
      title: `Estoque — ${total} veículos | Motors Store`,
      description:
        "Veículos premium selecionados com laudo cautelar, procedência auditada e garantia.",
    },
  };
}

export default async function EstoquePage() {
  const [estoque, settings] = await Promise.all([getEstoque(), getCachedSettings()]);

  const disponiveis = estoque.filter((v) => !v.vendido);
  const quickTags = normalizarQuickTags(settings.quickTags);
  const stockOverrides = normalizarStockOverrides(settings.stockOverrides);

  return (
    // `<div>`, não `<main>`: o layout raiz já abre um `<main>`.
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <Catalogo
          estoque={disponiveis}
          quickTags={quickTags.length > 0 ? quickTags : DESTAQUES_PADRAO}
          stockOverrides={stockOverrides}
        />
      </Suspense>
    </div>
  );
}
