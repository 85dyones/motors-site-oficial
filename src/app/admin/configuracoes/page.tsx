import { Suspense } from "react";
import ConfiguracoesClientWrapper from "../../../components/ConfiguracoesClientWrapper";

export const metadata = {
  title: "Configurações do Site — Motors Showcase",
  description: "Gerencie o estoque, temas, integrações e popups.",
};

export default function AdminConfiguracoesPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-brand-bg text-brand-text/60 gap-3">
        <span className="h-8 w-8 border-2 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin" />
        <span className="text-xs uppercase tracking-wider font-bold">Carregando painel...</span>
      </div>
    }>
      <ConfiguracoesClientWrapper />
    </Suspense>
  );
}
