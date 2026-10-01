import VisaoDoVeiculo from "../../../../components/admin/VisaoDoVeiculo";
import { visitasDaPagina } from "../../../../lib/analytics";
import { abrirVeiculoNoPainel, lerHistoricoDoVeiculo } from "../../../../lib/veiculoNoPainel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Veículo — Motors Store",
};

/**
 * O veículo no painel: a VISÃO, só leitura (pedido do dono em 01/10: "não
 * temos a visualização apenas do cadastro dos veículos, estão em lista ou
 * podem ser editados"). É o arranjo do repasse desde 28/09: abrir mostra o
 * carro, e editar é um botão. O editor mora em `editar/`.
 */
export default async function VeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, veiculo, perfis } = await abrirVeiculoNoPainel(id);
  const [visitas, historico] = await Promise.all([
    visitasDaPagina(String(veiculo.id), 30),
    lerHistoricoDoVeiculo(supabase, veiculo.id, perfis),
  ]);

  return <VisaoDoVeiculo veiculo={veiculo} perfis={perfis} visitas30Dias={visitas} historico={historico} agora={new Date()} />;
}
