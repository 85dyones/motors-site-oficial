import ConciliacaoBancaria from "../../../../components/financeiro/ConciliacaoBancaria";

export const metadata = {
  title: "Conciliação Bancária — Motors Showcase",
  description: "Extrato do banco × caixa do sistema: o que casou, o que falta lançar e o que não compensou.",
};

export default function ConciliacaoPage() {
  return <ConciliacaoBancaria />;
}
