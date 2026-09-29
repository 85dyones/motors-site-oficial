import EditorDeRepasse from "../../../../../components/admin/repasse/EditorDeRepasse";
import { abrirCarroNoPainel, lerQuemAvisar } from "../../../../../lib/paginaDoCarroNoPainel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Editar carro de repasse — Motors Store",
};

/**
 * O editor de um carro de repasse. Até 28/09 era o que abria ao clicar no
 * carro; agora abrir mostra a visão (`../page.tsx`) e o editor é o botão
 * "Editar" dela. As portas são as de antes: toda a equipe abre (quem não pode
 * editar vê os campos travados, como sempre) e a lista do repasse só é lida
 * para quem valida.
 *
 * Os leads do carro (pedidos de exame e contatos pelo WhatsApp) moram só na
 * visão, decisão do dono em 29/09: o editor fica com o que se edita, volta à
 * visão por "VER O CARRO" e nem lê a tabela de leads.
 */
export default async function EditarRepassePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfis, repasse, urlDaFicha } = await abrirCarroNoPainel(id);
  const { inscritos, avisados } = await lerQuemAvisar(supabase, repasse, perfis);

  return <EditorDeRepasse repasse={repasse} perfis={perfis} inscritos={inscritos} avisados={avisados} urlDaFicha={urlDaFicha} />;
}
