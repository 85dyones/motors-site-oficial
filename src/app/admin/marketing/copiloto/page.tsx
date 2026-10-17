import { redirect } from "next/navigation";
import CopilotoDeMidia from "../../../../components/marketing/copiloto/CopilotoDeMidia";
import { MIGRACAO_DO_COPILOTO, ehPlataformaDoCopiloto } from "../../../../lib/copilotoDeMidia";
import { autorizarCopiloto, lerCopiloto } from "../../../../lib/copilotoDeMidia-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Copiloto de Mídia — Painel",
  description: "Diagnóstico diário do Google Ads e do Meta e as mudanças propostas nas contas, para aprovar ou recusar.",
};

/**
 * `/admin/marketing/copiloto` — o Copiloto de Mídia (14/10/2026).
 *
 * Página fina: autoriza pela matriz ("Aprovar mudanças do Copiloto de Mídia":
 * Administrador e Marketing), lê com a SESSÃO de quem abriu — a RLS das
 * quatro tabelas repete a mesma régua — e entrega. Nenhuma chave de serviço
 * aqui: o painel não precisa de nada que a pessoa não possa ler.
 *
 * A aba vem da URL (`?plataforma=meta`; sem ela, o Google). A tela só fica
 * sabendo SE o token de gestão do Meta existe — nunca o valor.
 */
export default async function CopilotoDeMidiaPage({ searchParams }: { searchParams: Promise<{ plataforma?: string }> }) {
  const porta = await autorizarCopiloto();
  if (!porta.ok) redirect(porta.status === 401 ? "/login" : "/admin");

  const { plataforma: pedida } = await searchParams;
  const plataforma = ehPlataformaDoCopiloto(pedida) ? pedida : "google";
  const leitura = await lerCopiloto(porta.supabase, new Date(), plataforma);
  return (
    <CopilotoDeMidia
      leitura={leitura}
      migracao={MIGRACAO_DO_COPILOTO}
      plataforma={plataforma}
      metaConfigurado={Boolean(process.env.META_ADS_MANAGEMENT_TOKEN?.trim())}
    />
  );
}
