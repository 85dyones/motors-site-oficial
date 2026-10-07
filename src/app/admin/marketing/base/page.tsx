import { redirect } from "next/navigation";
import BaseDeContatos from "../../../../components/marketing/base/BaseDeContatos";
import { lerBaseDeMarketing } from "../../../../lib/baseDeMarketing-servidor";
import { MIGRACAO_DAS_CAMPANHAS_DE_SMS, autorizarCampanhasDeSms } from "../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Base de contatos — Motors Store",
  description: "A base de pessoas das campanhas: resumo, importação de planilha e histórico das importações.",
};

/**
 * `/admin/marketing/base` — a base de contatos das campanhas e a importação
 * dela (pedido do dono em 07/10/2026).
 *
 * Página fina: autoriza, lê e entrega. A porta é a MESMA das campanhas de SMS
 * (`autorizarCampanhasDeSms`): quem monta campanha é quem cuida da base. As
 * tabelas da base nascem na mesma migração das campanhas, e é ela que o aviso
 * cita.
 *
 * O 503 da porta é "falta SUPABASE_SERVICE_ROLE_KEY": a pessoa TEM o papel, e
 * a tela abre com o aviso em vez de mandá-la de volta ao painel.
 */
export default async function BaseDeContatosPage() {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok && porta.status !== 503) redirect(porta.status === 401 ? "/login" : "/admin");

  if (!porta.ok) {
    return <BaseDeContatos leitura={{ ok: false, faltaMigracao: false, motivo: porta.motivo }} migracao={MIGRACAO_DAS_CAMPANHAS_DE_SMS} semChaveDeServico />;
  }

  const leitura = await lerBaseDeMarketing(porta.admin);
  return <BaseDeContatos leitura={leitura} migracao={MIGRACAO_DAS_CAMPANHAS_DE_SMS} />;
}
