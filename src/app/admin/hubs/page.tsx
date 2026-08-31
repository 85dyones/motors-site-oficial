import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../lib/papelPadrao";
import TextosDosHubs from "../../../components/admin/TextosDosHubs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Texto das páginas — Motors Store",
  description: "O texto das páginas de marca, modelo, carroceria, perfil e faixa de preço.",
};

/**
 * Texto das páginas de hub — a tela que o dono pediu em 2026-08-31.
 *
 * *"Precisamos que o painel permita editar o texto, hoje ele é criado
 * automaticamente e não tem muito sentido"*, olhando
 * `/carros/volkswagen/saveiro`.
 *
 * Quem abre: quem escreve anúncio — Admin, Marketing e Comercial, que é a
 * mesma linha da A17 que já governa `descricao_seo`. Quem não escreve não vê
 * a tela, e chegando pela URL volta ao painel em vez de tomar 403 depois de
 * digitar dois parágrafos.
 *
 * Que decisão sai daqui: "esta página está falando errado / repetido — o que
 * ela devia dizer é isto". Sai em minutos, e vale para a página inteira.
 */
export default async function TextoDosHubsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();

  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");

  const perfil = perfisDe(origem);
  if (podeFazer(perfil, "Editar opcionais e destaques rápidos") !== "faz") {
    redirect("/admin");
  }

  return <TextosDosHubs />;
}
