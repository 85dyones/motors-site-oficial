import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { papelPadraoPorEmail } from "../../../../lib/papelPadrao";
import CadastroDeVeiculo from "../../../../components/admin/CadastroDeVeiculo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Novo veículo — Motors Store",
  description: "Cadastro do carro que não veio do feed do RevendaMais.",
};

/**
 * Cadastro nativo de veículo — a porta que a tabela A6 nunca teve.
 *
 * O gate aqui é o MESMO da rota `POST /api/estoque`, e é assim de propósito:
 * "tudo que for negado some da interface, não fica cinza" (A17). Quem não
 * publica veículo não vê o formulário — e se chegar pela URL, volta para o
 * painel em vez de preencher trinta campos para tomar 403 no fim.
 *
 * Segunda razão para a página existir separada do componente: o perfil é lido
 * no servidor. Campo que este perfil não grava não é RENDERIZADO — e, por não
 * existir no HTML, também não vaza (foi assim que `preco_compra` apareceu no
 * `/estoque` público, em prop de client component).
 */
export default async function NovoVeiculoPage() {
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

  // Sem linha em `profiles`, vale o padrão por e-mail — mesma regra do layout.
  const origem = profile ?? papelPadraoPorEmail(user.email);
  if (!ehStaff(origem)) redirect("/");

  // Todos os papéis, nunca `normalizarPerfil(role)`: o primário sozinho
  // esconderia campo que o segundo papel grava, e normalizar papel fora do
  // vocabulário o promoveria a "comercial" (regra 2-b).
  const perfil = perfisDe(origem);
  if (podeFazer(perfil, "Publicar ou despublicar veículo") !== "faz") {
    redirect("/admin/estoque");
  }

  return <CadastroDeVeiculo perfil={perfil} />;
}
