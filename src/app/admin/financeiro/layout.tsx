export const metadata = {
  title: "Financeiro — Motors Showcase",
};

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-5">
      {/* Cabeçalho do módulo, na anatomia das telas A10–A12 do design doc */}
      <div className="flex flex-col gap-1.5 border-b-2 border-mt-regua pb-5 select-none">
        <div className="mt-rotulo mt-rotulo-accent">Financeiro</div>
        <h1 className="mt-titulo text-3xl md:text-4xl">Caixa e operação</h1>
        <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
          Fluxo de caixa, contas a pagar e receber, despesas recorrentes, compras e margem
          por veículo.
        </p>
      </div>

      {/* Page Content */}
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
