import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../../../lib/papelPadrao";
import FechamentoDeVenda from "../../../../../components/admin/FechamentoDeVenda";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Registrar venda — Motors Ciclo",
  description: "Fechamento da venda com o registro completo do par cliente-veículo.",
};

/**
 * Tela A19. O gate aqui é o mesmo da rota: "o que for negado some da
 * interface, não fica cinza" — quem não fecha venda não vê o formulário.
 */
export default async function NovaVendaPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(profile?.papeis ?? role)) redirect("/");
  if (podeFazer(perfisDe(profile?.papeis ?? role), "Fechar venda do Ciclo") !== "faz") {
    redirect("/admin");
  }

  return <FechamentoDeVenda />;
}
