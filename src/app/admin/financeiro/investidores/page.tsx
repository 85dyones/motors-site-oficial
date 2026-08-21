import InvestidoresPainel from "../../../../components/financeiro/InvestidoresPainel";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { podeExcluirLancamento } from "../../../../lib/alcada";
import { perfisDe } from "../../../../lib/permissoes";

export const metadata = {
  title: "Investidores — Motors Showcase",
  description: "Aportes, retiradas e saldo por investidor, incluindo retiradas em veículo de repasse.",
};

export default async function InvestidoresPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  let podeExcluir = false;
  if (user) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    // Só o Admin apaga registro de capital de sócio (A17, 2026-08-21).
    podeExcluir = podeExcluirLancamento(perfisDe(perfil));
  }
  return <InvestidoresPainel podeExcluir={podeExcluir} />;
}
