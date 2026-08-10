import type { Metadata } from "next";
import AutoAvaliacao from "../../components/AutoAvaliacao";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";

const DESCRICAO =
  "Dados oficiais da Tabela FIPE cruzados com o giro real do nosso estoque. Proposta no WhatsApp em menos de 10 minutos.";

// Sem `openGraph` próprio esta rota herdava o do layout raiz — compartilhar a
// avaliação mostrava o título e a descrição da home, como se fosse ela.
export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Avaliação Express — quanto vale o seu carro | Motors Store",
    description: DESCRICAO,
    alternates: { canonical: "/avaliacao" },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "avaliacao",
      caminho: "/avaliacao",
    }),
  };
}

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
