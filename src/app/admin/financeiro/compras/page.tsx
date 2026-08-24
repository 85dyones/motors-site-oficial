import ComprasList from "../../../../components/financeiro/ComprasList";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { podeExcluirLancamento } from "../../../../lib/alcada";
import { perfisDe } from "../../../../lib/permissoes";

export const metadata = {
  title: "Compras de Produtos — Motors Showcase",
  description: "Gerenciamento de compras de peças, acessórios, materiais e ferramentas para a concessionária.",
};

export default async function ComprasPage() {
  return <ComprasList podeExcluir={await podeExcluir()} />;
}

/** Só o Admin apaga registro de dinheiro (A17, 2026-08-21). */
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
