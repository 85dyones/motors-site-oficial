import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import PainelDeCompletude from "../../../../components/admin/PainelDeCompletude";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Completude do registro — Motors Ciclo",
  description: "Quanto do registro de cada venda foi de fato preenchido, por vendedor.",
};

/** Mesmo gate da rota: "Fechar venda do Ciclo" — Admin e Comercial. */
export default async function CompletudePage() {
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
  if (podeFazer(normalizarPerfil(role), "Fechar venda do Ciclo") !== "faz") {
    redirect("/admin");
  }

  return <PainelDeCompletude />;
}
