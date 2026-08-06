import type { Metadata } from "next";
import AutoAvaliacao from "../../components/AutoAvaliacao";

export const metadata: Metadata = {
  title: "Avaliação Express — quanto vale o seu carro | Motors Store",
  description:
    "Dados oficiais da Tabela FIPE cruzados com o giro real do nosso estoque. Proposta no WhatsApp em menos de 10 minutos.",
  alternates: { canonical: "/avaliacao" },
};

/**
 * Tela 05 — Avaliação Express.
 *
 * A rota não põe moldura: as duas colunas do design doc (formulário à
 * esquerda, prévia do resultado na faixa escura à direita) vivem dentro do
 * `AutoAvaliacao`, porque a prévia depende do valor que a consulta FIPE
 * devolve enquanto o usuário preenche. O `<h1>` vai junto.
 *
 * O formulário e a cascata FIPE continuam sendo o componente de produção,
 * com webhook, Turnstile e tracking inclusos.
 */
export default function AvaliacaoPage() {
  return <AutoAvaliacao />;
}
