import { redirect } from "next/navigation";
import CopilotoDeMidia from "../../../../components/marketing/copiloto/CopilotoDeMidia";
import { MIGRACAO_DO_COPILOTO } from "../../../../lib/copilotoDeMidia";
import { autorizarCopiloto, lerCopiloto } from "../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Copiloto de Mídia — Painel",
  description: "Diagnóstico diário do Google Ads e as mudanças propostas na conta, para aprovar ou recusar.",
};

/**
 * `/admin/marketing/copiloto` — o Copiloto de Mídia (14/10/2026).
 *
 * Página fina: autoriza pela matriz ("Aprovar mudanças do Copiloto de Mídia":
 * Administrador e Marketing), lê com a SESSÃO de quem abriu — a RLS das
 * quatro tabelas repete a mesma régua — e entrega. Nenhuma chave de serviço
 * aqui: o painel não precisa de nada que a pessoa não possa ler.
 */
export default async function CopilotoDeMidiaPage() {
  const porta = await autorizarCopiloto();
  if (!porta.ok) redirect(porta.status === 401 ? "/login" : "/admin");

  const leitura = await lerCopiloto(porta.supabase);
  return <CopilotoDeMidia leitura={leitura} migracao={MIGRACAO_DO_COPILOTO} />;
}
