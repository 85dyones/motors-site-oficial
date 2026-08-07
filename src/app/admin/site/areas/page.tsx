import AreasDoSite from "../../../../components/admin/AreasDoSite";
import { getCachedSettings } from "../../../../lib/settings";
import { normalizarAreas } from "../../../../lib/areasDoSite";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Áreas do Site — Motors Showcase",
  description: "Ordem e visibilidade das seções da home.",
};

export default async function AreasDoSitePage() {
  const settings = await getCachedSettings();
  return <AreasDoSite configInicial={normalizarAreas(settings.areasHome)} />;
}
