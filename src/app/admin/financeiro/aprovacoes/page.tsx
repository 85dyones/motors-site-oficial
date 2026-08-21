import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { podeDecidirAprovacao } from "../../../../lib/alcada";
import { perfisDe } from "../../../../lib/permissoes";
import AprovacoesPendentes from "../../../../components/financeiro/AprovacoesPendentes";

export const metadata = {
  title: "Aprovações — Motors Showcase",
  description: "Lançamentos acima da alçada de R$ 1.500 aguardando decisão do administrador.",
};

/**
 * A página é server component de propósito: os papéis vêm do banco AQUI e o
 * painel recebe só o veredito. O Financeiro vê a fila (o lançamento é dele);
 * os botões de decidir são do Admin — "o que for negado some da interface".
 */
export default async function AprovacoesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let podeDecidir = false;
  if (user) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    podeDecidir = podeDecidirAprovacao(perfisDe(perfil));
  }

  return <AprovacoesPendentes podeDecidir={podeDecidir} />;
}
