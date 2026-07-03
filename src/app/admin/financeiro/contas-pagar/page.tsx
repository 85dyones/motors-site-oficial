import ContasList from "../../../../components/financeiro/ContasList";

export const metadata = {
  title: "Contas a Pagar — Motors Showcase",
  description: "Gerenciamento de despesas, contas de fornecedores e compromissos financeiros a pagar.",
};

export default function ContasPagarPage() {
  return <ContasList tipo="pagar" />;
}
