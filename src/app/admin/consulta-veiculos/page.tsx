import { redirect } from "next/navigation";
import AbasDaConsulta from "../../../components/admin/consulta/AbasDaConsulta";
import { configuracaoDaApiBrasil } from "../../../lib/apiBrasil";
import { autorizarConsultaDePlaca, lerConsultasRecentes } from "../../../lib/consultaDePlaca-servidor";
import { lerHistoricoDeConsultas } from "../../../lib/historicoDeConsultas-servidor";
import { lerModelosRecentes } from "../../../lib/mercadoPorModelo-servidor";
import { lerParametrosVigentes, type ClienteDeLeitura } from "../../../lib/parametrosDaAvaliacao";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consulta de veículos — Motors Store",
  description: "A FIPE de hoje, grátis; a tendência do modelo em 24 meses; e o retrato do carro pela placa: impeditivos, FIPE e faixa de compra.",
};

/**
 * `/admin/consulta-veiculos` — três abas (dono, 06 e 08/10/2026): a FIPE de
 * hoje, grátis; o mercado de um MODELO em 24 meses, pago por mês de tabela; e
 * o retrato de um carro pela PLACA, pago por consulta. O endereço antigo,
 * `/admin/consulta-placa`, redireciona para cá.
 *
 * Página fina, como as vizinhas: autoriza, lê e entrega. Tudo com o cliente
 * de SESSÃO: a RLS de `consultas_de_placa` dá leitura aos três papéis da
 * matriz, a de `fipe_historico` também, e a de `parametros_avaliacao`, à
 * equipe.
 *
 * A curva de deságio vigente vai junto porque a faixa de compra é recalculada
 * AO VIVO na tela, conforme o avaliador informa km e estado. É a mesma curva e
 * a mesma conta de `/api/avaliacao` (`recomendarAvaliacao`); sem curva
 * legível, a tela mostra o retrato sem faixa, e não uma régua inventada.
 */
export default async function ConsultaDeVeiculosPage() {
  const porta = await autorizarConsultaDePlaca();
  if (!porta.ok) redirect(porta.status === 401 ? "/login" : "/admin");

  const [recentes, modelos, curva, historico] = await Promise.all([
    lerConsultasRecentes(porta.supabase),
    lerModelosRecentes(porta.supabase),
    lerParametrosVigentes(porta.supabase as unknown as ClienteDeLeitura),
    lerHistoricoDeConsultas(porta.supabase, { termo: null, filtro: "todas" }),
  ]);
  const { token, homologacao } = configuracaoDaApiBrasil();

  return (
    <AbasDaConsulta recentes={recentes} modelos={modelos} curva={curva} temToken={token !== null} homologacao={homologacao} historico={historico} />
  );
}
