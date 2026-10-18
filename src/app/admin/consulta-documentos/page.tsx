import { redirect } from "next/navigation";
import ConsultaDeDocumentos from "../../../components/admin/documentos/ConsultaDeDocumentos";
import { configuracaoDaApiBrasil } from "../../../lib/apiBrasil";
import { autorizarConsultaDeDocumento, lerHistoricoDeDocumentos } from "../../../lib/consultaDeDocumento-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Consulta de CPF e CNPJ — Motors Store",
  description: "Cadastro, compliance e crédito de quem compra, vende ou financia com a loja, em níveis, com relatório em PDF, link para enviar e histórico.",
  robots: { index: false, follow: false },
};

/**
 * `/admin/consulta-documentos` — a consulta de CPF e CNPJ (dono, 18/10/2026).
 *
 * Página fina: autoriza (Administrador, Gestor, Comercial, Financeiro), lê o
 * histórico com o cliente de SESSÃO (a RLS repete os quatro papéis) e entrega.
 */
export default async function ConsultaDeDocumentosPage() {
  const porta = await autorizarConsultaDeDocumento();
  if (!porta.ok) redirect(porta.status === 401 ? "/login" : "/admin");
  const historico = await lerHistoricoDeDocumentos(porta.supabase, { termo: null, tipo: null, limite: 40 });
  const { token, homologacao } = configuracaoDaApiBrasil();
  return <ConsultaDeDocumentos historico={historico} temToken={token !== null} homologacao={homologacao} />;
}
