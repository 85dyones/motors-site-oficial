import EditorDeVeiculo from "../../../../../components/admin/EditorDeVeiculo";
import { visitasDaPagina } from "../../../../../lib/analytics";
import { abrirVeiculoNoPainel } from "../../../../../lib/veiculoNoPainel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Editar veículo — Motors Store",
  description: "Fotos, ficha técnica, opcionais e checklist de publicação.",
};

/**
 * O editor de um veículo. Até 01/10 era o que abria ao clicar no carro; agora
 * abrir mostra a visão (`../page.tsx`), e o editor é o botão "Editar" dela —
 * o mesmo arranjo do repasse desde 28/09.
 */
export default async function EditorDeVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { veiculo, perfis } = await abrirVeiculoNoPainel(id);

  // As URLs de veículo terminam com o id (ver getVeiculoPdpUrl), então o id
  // é o filtro certo — e não depende do slug, que muda quando o título muda.
  // `null` quando o GA4 não está configurado: a tela mostra "—", não zero.
  const visitas = await visitasDaPagina(String(veiculo.id), 30);

  // O perfil decide o que a tela desenha: campo que este perfil não grava não
  // é renderizado — e, por não existir no HTML, também não vaza valor (foi o
  // caso do preço de compra). O layout do admin já garantiu a sessão.
  return <EditorDeVeiculo inicial={veiculo} visitas30Dias={visitas} perfil={perfis} />;
}
