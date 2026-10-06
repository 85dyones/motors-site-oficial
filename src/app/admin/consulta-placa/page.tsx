import { redirect } from "next/navigation";
import ConsultaDePlaca from "../../../components/admin/consulta/ConsultaDePlaca";
import { configuracaoDaApiBrasil } from "../../../lib/apiBrasil";
import { autorizarConsultaDePlaca, lerConsultasRecentes } from "../../../lib/consultaDePlaca-servidor";
import { lerParametrosVigentes, type ClienteDeLeitura } from "../../../lib/parametrosDaAvaliacao";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consulta de placa — Motors Store",
  description: "O retrato do carro oferecido à loja: impeditivos, FIPE e faixa de compra.",
};

/**
 * `/admin/consulta-placa` — o retrato de um carro pela placa (pedido do dono
 * em 06/10/2026).
 *
 * Página fina, como as vizinhas: autoriza, lê e entrega. Tudo com o cliente
 * de SESSÃO: a RLS de `consultas_de_placa` dá leitura aos três papéis da
 * matriz, e a de `parametros_avaliacao`, à equipe.
 *
 * A curva de deságio vigente vai junto porque a faixa de compra é recalculada
 * AO VIVO na tela, conforme o avaliador informa km e estado. É a mesma curva e
 * a mesma conta de `/api/avaliacao` (`recomendarAvaliacao`); sem curva
 * legível, a tela mostra o retrato sem faixa, e não uma régua inventada.
 */
export default async function ConsultaDePlacaPage() {
  const porta = await autorizarConsultaDePlaca();
  if (!porta.ok) redirect(porta.status === 401 ? "/login" : "/admin");

  const [recentes, curva] = await Promise.all([
    lerConsultasRecentes(porta.supabase),
    lerParametrosVigentes(porta.supabase as unknown as ClienteDeLeitura),
  ]);
  const { token, homologacao } = configuracaoDaApiBrasil();

  return <ConsultaDePlaca recentes={recentes} curva={curva} temToken={token !== null} homologacao={homologacao} />;
}
