import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../lib/papelPadrao";
import EditorDeGuias from "../../../components/admin/EditorDeGuias";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Guias — Motors Store",
  description: "Criar e editar os guias de procedência publicados em /guias.",
};

/**
 * Guias — a tela que o dono pediu em 2026-09-06.
 *
 * *"Preciso ser capaz de gerar novos guias e editar os criados no painel, como
 * já acontece com o texto das páginas."*
 *
 * Quem abre: a mesma régua de `/admin/hubs` e de `descricao_seo` — a linha
 * "Editar opcionais e destaques rápidos" da A17, que é Admin, Marketing e
 * Comercial. Escrever cópia de site é trabalho de quem escreve anúncio.
 *
 * Que decisão sai daqui: "este assunto merece uma página nossa" e "este texto
 * está pronto para o ar". A segunda é um clique separado — guia nasce rascunho
 * e só vai ao ar quando alguém publica, porque texto longo se escreve em várias
 * sessões e meio guia indexado é pior que nenhum.
 *
 * A diferença para `/admin/hubs`: lá o painel SOBRESCREVE o texto de uma página
 * que já existe. Aqui ele CRIA a página. Sem linha na tabela, não há URL.
 */
export default async function GuiasNoPainelPage() {
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

  return <EditorDeGuias />;
}
