import InvestidoresPainel from "../../../../components/financeiro/InvestidoresPainel";
import InvestidoresGestao from "../../../../components/financeiro/InvestidoresGestao";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { podeExcluirLancamento } from "../../../../lib/alcada";
import { perfisDe } from "../../../../lib/permissoes";

export const metadata = {
  title: "Investidores — Motors Store",
  description:
    "Cadastro, aportes, retiradas e saldo por investidor — incluindo retirada em veículo de repasse — e a participação de cada um nos carros.",
};

/**
 * A tela de investidores, com as duas metades que dois trabalhos paralelos
 * construíram e que respondem perguntas diferentes:
 *
 * - **Quanto o Fabiano tem no negócio?** É o cadastro e o razão de aportes e
 *   retiradas (`InvestidoresPainel`). Vale para investidor que ainda não tem
 *   login — o cadastro nasce aqui e a conta vem depois, ou nunca.
 * - **Em quais carros ele entrou?** É a participação por veículo
 *   (`InvestidoresGestao`), que amarra o capital ao estoque.
 *
 * Nenhuma das duas responde a pergunta da outra, e é por isso que as duas
 * ficaram. Empilhadas, e não em abas: quem abre esta tela está conferindo
 * dinheiro de sócio, e esconder metade atrás de um clique é como o controle
 * "um pouco bagunçado" do briefing começa de novo.
 */
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
  return (
    <div className="flex flex-col gap-10">
      <InvestidoresPainel podeExcluir={podeExcluir} />
      <InvestidoresGestao />
    </div>
  );
}
