import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import FilaDeVerificacao from "../../../../components/admin/FilaDeVerificacao";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fila de verificação — Motors Ciclo",
  description: "Lançamentos do diário de bordo aguardando verificação da loja.",
};

/** Tela A21. Mesmo gate da rota: quem não verifica não vê a fila. */
export default async function VerificacaoPage() {
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
  if (podeFazer(normalizarPerfil(role), "Verificar revisão do diário de bordo") !== "faz") {
    redirect("/admin");
  }

  return <FilaDeVerificacao />;
}
