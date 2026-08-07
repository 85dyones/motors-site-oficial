import MusicaShowroom from "../../../../components/admin/MusicaShowroom";
import { getCachedSettings } from "../../../../lib/settings";
import { normalizarGrade } from "../../../../lib/musicaGrade";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Música do Showroom — Motors Showcase",
  description: "Grade por horário, teto de volume e dispositivos da música da loja.",
};

/** Tela A18 do design doc do admin. */
export default async function MusicaShowroomPage() {
  const settings = await getCachedSettings();
  return <MusicaShowroom gradeInicial={normalizarGrade(settings.musicaGrade)} />;
}
