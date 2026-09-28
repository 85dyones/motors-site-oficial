import EditorDeRepasse from "../../../../../components/admin/repasse/EditorDeRepasse";
import LeadsDoCarro from "../../../../../components/admin/repasse/LeadsDoCarro";
import { abrirCarroNoPainel, lerLeadsDoCarro, lerQuemAvisar } from "../../../../../lib/paginaDoCarroNoPainel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Editar carro de repasse — Motors Store",
};

/**
 * O editor de um carro de repasse. Até 28/09 era o que abria ao clicar no
 * carro; agora abrir mostra a visão (`../page.tsx`) e o editor é o botão
 * "Editar" dela. Portas, leituras e comportamento são os de antes: toda a
 * equipe abre (quem não pode editar vê os campos travados, como sempre) e a
 * lista do repasse só é lida para quem valida.
 */
export default async function EditarRepassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfis, repasse, urlDaFicha } = await abrirCarroNoPainel(id);
  const [{ pedidos, contatos }, { inscritos, avisados }] = await Promise.all([
    lerLeadsDoCarro(supabase, repasse.id),
    lerQuemAvisar(supabase, repasse, perfis),
  ]);

  return (
    <>
      <EditorDeRepasse repasse={repasse} perfis={perfis} inscritos={inscritos} avisados={avisados} urlDaFicha={urlDaFicha} />
      <LeadsDoCarro pedidos={pedidos} contatos={contatos} />
    </>
  );
}
