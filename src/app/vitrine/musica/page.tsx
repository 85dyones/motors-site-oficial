import type { Metadata } from "next";
import ControleMusica from "../../../components/modernist/ControleMusica";
import { getCachedSettings } from "../../../lib/settings";
import DEFAULT_COMPANY_SETTINGS from "../../../lib/companySettings.json";

/**
 * Tela 08 C do design doc — o controle de música do balcão.
 *
 * Mesma família de `/vitrine` e `/vitrine/balcao`: peça de loja, não página de
 * site. Fora do índice e sem a moldura, que `MolduraDoSite` já suprime em tudo
 * que começa com `/vitrine`.
 *
 * O comando exige sessão (ver `src/app/api/musica/route.ts`): o tablet do
 * balcão loga uma vez e a sessão do Supabase persiste no navegador. O
 * abaixamento disparado pelo CHAMAR CONSULTOR da 08 B é a única exceção, e
 * está documentada lá.
 */
export const metadata: Metadata = {
  title: "Música — balcão do showroom",
  robots: { index: false, follow: false },
};

export default async function MusicaPage() {
  const settings = await getCachedSettings();
  const empresa = settings.companySettings ?? DEFAULT_COMPANY_SETTINGS;

  return <ControleMusica nomeLoja={empresa.name} />;
}
