import { Suspense } from "react";
import ConfiguracoesClientWrapper from "../../../components/ConfiguracoesClientWrapper";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Configurações do Site — Motors Showcase",
  description: "Gerencie o estoque, temas, integrações e popups.",
};

export default function AdminConfiguracoesPage() {
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
