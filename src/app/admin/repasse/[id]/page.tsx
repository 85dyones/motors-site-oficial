import VisaoDoRepasse from "../../../../components/admin/repasse/VisaoDoRepasse";
import { abrirCarroNoPainel, lerLeadsDoCarro, lerQuemAvisar } from "../../../../lib/paginaDoCarroNoPainel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Carro de repasse — Motors Store",
};

/**
 * O carro de repasse no painel: a VISÃO, só leitura (pedido do dono em
 * 28/09, "visão primeiro, editar num botão"). O editor mora em `editar/`.
 *
 * Lê com a SESSÃO, com as portas de sempre (`abrirCarroNoPainel`): a RLS dá o
 * carro e os leads a qualquer perfil da equipe, e a lista do repasse só a
 * quem valida, que é o único a quem a página a pede.
 */
export default async function RepassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfis, repasse, urlDaFicha } = await abrirCarroNoPainel(id);
  const [{ pedidos, contatos }, { inscritos, avisados }] = await Promise.all([
    lerLeadsDoCarro(supabase, repasse.id),
    lerQuemAvisar(supabase, repasse, perfis),
  ]);

  return (
    <VisaoDoRepasse
      repasse={repasse}
      perfis={perfis}
      urlDaFicha={urlDaFicha}
      agora={new Date()}
      pedidos={pedidos}
      contatos={contatos}
      inscritos={inscritos}
      avisados={avisados}
    />
  );
}
