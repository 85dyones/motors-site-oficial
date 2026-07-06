export const metadata = {
  title: "Financeiro — Motors Showcase",
};

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Module Title */}
      <div className="flex flex-col select-none">
        <h1 className="text-xl font-extrabold tracking-tight uppercase">
          Administrativo Financeiro
        </h1>
        <p className="text-xs text-brand-text/50">
          Controle de fluxo de caixa, contas a pagar, receber, despesas recorrentes e compras.
        </p>
      </div>

      {/* Page Content */}
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
