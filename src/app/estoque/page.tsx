import type { Metadata } from "next";
import { Suspense } from "react";
import Catalogo from "../../components/modernist/Catalogo";
import { getEstoque } from "../../lib/supabase";
import { getCachedSettings, recortePublicoDeSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import {
  DESTAQUES_PADRAO,
  normalizarQuickTags,
  normalizarStockOverrides,
} from "../../lib/destaquesRapidos";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const [estoque, { companySettings }] = await Promise.all([
    getEstoque(),
    getCachedSettings(),
  ]);
  const total = estoque.filter((v) => !v.vendido).length;

  return {
    title: `Estoque — ${total} veículos seminovos em Curitiba | Motors Store`,
    description:
      `${total} veículos premium selecionados com laudo cautelar, procedência auditada e garantia. ` +
      "Filtre por marca, carroceria, câmbio e faixa de preço.",
    alternates: { canonical: "/estoque" },
    // O card contava o estoque no título e não tinha imagem — herdava o logo
    // esticado do layout. A contagem fica: é o que dá vontade de abrir.
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      tituloPadrao: `${total} veículos premium em Curitiba`,
      caminho: "/estoque",
    }),
  };
}

export default async function EstoquePage() {
  const [estoque, settings] = await Promise.all([getEstoque(), getCachedSettings()]);

  const disponiveis = estoque.filter((v) => !v.vendido);
  const quickTags = normalizarQuickTags(settings.quickTags);
  // `Catalogo` é client component: esta prop inteira vira payload público da
  // página. As settings daqui vêm da chave de serviço, então o blob de
  // overrides carrega `preco_compra` — o recorte público (o mesmo que o GET
  // /api/settings aplica) fica entre os dois. Foi por faltar esta linha que o
  // custo de aquisição de um veículo apareceu no HTML de /estoque (2026-08-16).
  const stockOverrides = normalizarStockOverrides(
    recortePublicoDeSettings(settings).stockOverrides,
  );

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
