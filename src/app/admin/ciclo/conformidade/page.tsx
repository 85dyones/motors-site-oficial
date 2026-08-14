import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import PainelDeConformidade from "../../../../components/admin/PainelDeConformidade";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Conformidade — Motors Ciclo",
  description: "As três condições do gatilho de recompra, e a série diária que as sustenta.",
};

/** Tela A22. Mesmo gate da rota. */
export default async function ConformidadePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(role)) redirect("/");
  if (podeFazer(normalizarPerfil(role), "Acompanhar a conformidade do Ciclo") !== "faz") {
    redirect("/admin");
  }

  return <PainelDeConformidade />;
}
