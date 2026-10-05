import { redirect } from "next/navigation";
import AgendaDePessoas from "../../../components/admin/AgendaDePessoas";
import { quemAbreAAgenda } from "../../../lib/agenda-servidor";
import { createServerSupabaseClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Clientes e fornecedores — Motors Showcase",
  description:
    "Clientes, fornecedores, prestadores da rede e investidores num cadastro só.",
};

/**
 * A agenda de pessoas. Toda a equipe ativa abre (decisão do dono, 05/10/2026:
 * *"A agenda precisa ser vista por todos, o lead não"*); perfil desativado e
 * quem não é da equipe voltam para a Visão geral, de onde o layout e o proxy
 * os levam ao lugar deles.
 *
 * A página diz à tela duas coisas que ela não tem como saber sozinha:
 *
 *  - `podeGerenciar`: Marketing e SDR leem. Para eles a tela não oferece
 *    cadastrar, editar, desativar nem excluir, e as rotas recusam do mesmo jeito.
 *  - `escopoDeLeads`: decide se a pessoa que veio de um lead ganha o link para
 *    ele (`ligacaoDoLead`).
 */
export default async function ClientesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, papeis, full_name, is_active")
    .eq("id", user.id)
    .single();

  const quem = quemAbreAAgenda(perfil);
  if (!quem) redirect("/admin");

  return <AgendaDePessoas podeGerenciar={quem.podeGerenciar} escopoDeLeads={quem.visao.escopo} />;
}
