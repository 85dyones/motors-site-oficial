import { redirect } from "next/navigation";
import CondicoesDoSimulador from "../../../components/admin/CondicoesDoSimulador";
import { PARAMETROS_DE_FABRICA } from "../../../lib/finance-calculator";
import {
  autorizarEdicaoDoFinanciamento,
  lerHistoricoDoFinanciamento,
} from "../../../lib/parametrosDoFinanciamento-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Condições do simulador — Motors Store",
  description: "Taxas, ano mais antigo financiado e bancos parceiros do simulador de financiamento.",
};

/**
 * `/admin/financiamento` — as condições do simulador (pedido do dono em
 * 28/09/2026: as taxas saem do código para uma tabela com vigência).
 *
 * Página fina, como as vizinhas: autoriza, lê e entrega. A leitura usa o
 * cliente de SESSÃO — a RLS de `parametros_financiamento` dá leitura à
 * equipe —, e o gate é o da matriz A17 (Administrador e Financeiro), o mesmo
 * do trilho: quem não edita não vê o item e, chegando pela URL, volta ao
 * painel em vez de tomar uma tela vazia.
 *
 * "Vigente" aqui é a linha sem `vigencia_ate` — a mesma que o site lê. Sem a
 * tabela (migração ainda não aplicada), a tela mostra os valores de fábrica,
 * que são os que o site está usando, e diz por que não dá para salvar.
 */
export default async function FinanciamentoAdminPage() {
  const porta = await autorizarEdicaoDoFinanciamento();
  if (!porta.ok) redirect(porta.status === 401 ? "/login" : "/admin");

  const historico = await lerHistoricoDoFinanciamento(porta.supabase);
  const vigente =
    (historico.tabela && historico.vigencias.find((v) => v.vigenciaAte === null)?.parametros) ||
    PARAMETROS_DE_FABRICA;

  return <CondicoesDoSimulador vigente={vigente} historico={historico} />;
}
