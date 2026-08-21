import ContasList from "../../../../components/financeiro/ContasList";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { podeExcluirLancamento } from "../../../../lib/alcada";
import { perfisDe } from "../../../../lib/permissoes";


export const metadata = {
  title: "Contas a Receber — Motors Showcase",
  description: "Gerenciamento de receitas, financiamentos, vendas de veículos e compromissos financeiros a receber.",
};

/**
 * Server component para ler os papéis do banco AQUI: só o Admin apaga
 * lançamento (A17, 2026-08-21) e a lista recebe o veredito pronto, sem
 * inventar régua própria no cliente.
 */
async function podeExcluir(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();
  return podeExcluirLancamento(perfisDe(perfil));
}

export default async function ContasReceberPage() {
  return <ContasList tipo="receber" podeExcluir={await podeExcluir()} />;
}
