import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import MonitorDaCampanhaDeSms from "../../../../../components/marketing/sms/MonitorDaCampanhaDeSms";
import { autorizarCampanhasDeSms, lerCampanhaDeSms } from "../../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Campanha de SMS — Motors Store",
  description: "O envio e o funil de uma campanha de SMS: enviados, na operadora, cliques, respostas e pedidos de saída.",
};

/**
 * `/admin/marketing/sms/[id]` — o envio e o monitoramento de uma campanha.
 *
 * `podeAbrirLead` vai `false` por ora: a tela é de Administrador e Marketing,
 * e o Marketing não abre ficha de lead. Quando a porta disser o papel de quem
 * entrou, o Administrador ganha o link — a prop já existe para isso.
 */
export default async function CampanhaDeSmsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok && porta.status !== 503) redirect(porta.status === 401 ? "/login" : "/admin");

  if (!porta.ok) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <span className="mt-rotulo">MARKETING</span>
        <h1 className="mt-titulo m-0 text-3xl">Campanha de SMS</h1>
        <p role="alert" className="m-0 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3 text-sm text-mt-ink">
          <strong>Configuração:</strong> falta a variável <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> no servidor, e a campanha
          não pôde ser lida. {porta.motivo}
        </p>
        <Link href="/admin/marketing/sms" className="mt-foco self-start text-sm text-mt-ink underline underline-offset-2">
          Voltar para as campanhas
        </Link>
      </div>
    );
  }

  const campanha = await lerCampanhaDeSms(porta.admin, id);
  if (!campanha) notFound();

  return <MonitorDaCampanhaDeSms campanha={campanha} podeAbrirLead={false} />;
}
