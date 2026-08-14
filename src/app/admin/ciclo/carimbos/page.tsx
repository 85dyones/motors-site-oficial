import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import FilaDeCarimbos from "../../../../components/admin/FilaDeCarimbos";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fila de carimbos — Motors Ciclo",
  description: "Registros da caderneta aguardando confirmação da loja.",
};

/** Tela A21. Mesmo gate da rota: quem não carimba não vê a fila. */
export default async function CarimbosPage() {
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
  if (podeFazer(normalizarPerfil(role), "Confirmar revisão da caderneta") !== "faz") {
    redirect("/admin");
  }

  return <FilaDeCarimbos />;
}
