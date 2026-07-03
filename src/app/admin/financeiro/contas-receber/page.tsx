import ContasList from "../../../../components/financeiro/ContasList";

export const metadata = {
  title: "Contas a Receber — Motors Showcase",
  description: "Gerenciamento de receitas, financiamentos, vendas de veículos e compromissos financeiros a receber.",
};

export default function ContasReceberPage() {
  return <ContasList tipo="receber" />;
}
