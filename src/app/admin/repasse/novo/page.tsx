import { redirect } from "next/navigation";
import NovoRepasse from "../../../../components/admin/repasse/NovoRepasse";
import { cadastraRepasse } from "../../../../lib/edicaoDoRepasse";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import { ehStaff, perfisDe } from "../../../../lib/permissoes";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Novo carro de repasse — Motors Store",
};

/** O gate é o mesmo da rota `POST /api/repasses`: quem cadastra (todo perfil). */
export default async function NovoRepassePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");
  if (!cadastraRepasse(perfisDe(origem))) redirect("/admin/repasse");
  return <NovoRepasse />;
}
