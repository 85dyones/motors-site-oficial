import { Suspense } from "react";
import { redirect } from "next/navigation";
import ConfiguracoesClientWrapper from "../../../components/ConfiguracoesClientWrapper";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Configurações do Site — Motors Store",
  description: "Gerencie temas, integrações e popups.",
};

export default async function AdminConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // A aba de cards do estoque virou a tela A6 em 2026-08-08. O link antigo
  // ainda circula em favorito e em histórico de navegador — redireciona em vez
  // de cair numa aba que não existe mais.
  const { tab } = await searchParams;
  if (tab === "estoque") {
    redirect("/admin/estoque");
  }

  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-mt-bg text-mt-neutral-700 gap-3">
        <span className="h-8 w-8 border-2 border-mt-accent-300 border-t-mt-accent rounded-full animate-spin" />
        <span className="text-xs uppercase tracking-wider font-bold">Carregando painel...</span>
      </div>
    }>
      <ConfiguracoesClientWrapper />
    </Suspense>
  );
}
