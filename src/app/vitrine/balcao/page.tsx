import type { Metadata } from "next";
import VitrineBalcao from "../../../components/modernist/VitrineBalcao";
import { getEstoque } from "../../../lib/supabase";
import { getCachedSettings } from "../../../lib/settings";
import DEFAULT_COMPANY_SETTINGS from "../../../lib/companySettings.json";
import { linkWhatsApp } from "../../../lib/whatsapp";

/**
 * Tela 08 B do design doc — o tablet de balcão.
 *
 * Mesmo estoque da vitrine da TV, mas com toque: o cliente filtra por faixa,
 * pagina e abre a ficha do veículo. Fora do índice pelo mesmo motivo da TV.
 */
export const metadata: Metadata = {
  title: "Vitrine — tablet de balcão",
  robots: { index: false, follow: false },
};

export const revalidate = 60;

export default async function VitrineBalcaoPage() {
  const [estoque, settings] = await Promise.all([getEstoque(), getCachedSettings()]);
  const empresa = settings.companySettings ?? DEFAULT_COMPANY_SETTINGS;

  // O estoque inteiro, não uma seleção: no balcão o cliente pagina até o fim.
  const disponiveis = estoque.filter((v) => !v.vendido);

  const whatsappHref = linkWhatsApp(empresa);

  return (
    <VitrineBalcao
      veiculos={disponiveis}
      nomeLoja={empresa.name}
      whatsappHref={whatsappHref}
    />
  );
}
