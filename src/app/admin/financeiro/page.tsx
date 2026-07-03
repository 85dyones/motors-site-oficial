import DashboardFinanceiro from "../../../components/financeiro/DashboardFinanceiro";

export const metadata = {
  title: "Resumo Financeiro — Motors Showcase",
  description: "Indicadores de desempenho financeiro, fluxo de caixa e contas vencidas.",
};

export default function AdminFinanceiroPage() {
  return <DashboardFinanceiro />;
}
