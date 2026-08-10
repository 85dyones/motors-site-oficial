import type { Metadata } from "next";
import CarMatch from "../../components/CarMatch";
import { getCachedSettings } from "../../lib/settings";
import { montarCompartilhamento } from "../../lib/compartilhamento";

const DESCRICAO =
  "Cinco perguntas, trinta segundos. Traçamos seu perfil de uso e um consultor envia três sugestões reais do estoque no WhatsApp.";

// Mesma correção da /avaliacao: sem card próprio, o quiz era compartilhado com
// o texto da home.
export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();

  return {
    title: "Garagem Profiler — encontre o carro certo | Motors Store",
    description: DESCRICAO,
    alternates: { canonical: "/carro-perfeito" },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "carroPerfeito",
      caminho: "/carro-perfeito",
    }),
  };
}

/**
 * Tela 04 — Garagem Profiler.
 *
 * A rota não põe moldura nenhuma: no design doc a tela 04 é o próprio fluxo
 * ocupando a largura toda, com a barra "GARAGEM PROFILER · SAIR" no alto e o
 * perfil se formando ao lado. Quem desenha isso é o `CarMatch` — inclusive o
 * `<h1>`, que vive na abertura do quiz.
 *
 * O quiz em si (perguntas, pontuação, envio do lead e tracking) continua
 * sendo o `CarMatch` de produção; o header e o rodapé apontam para cá em vez
 * do antigo âncora `/#match-garagem`.
 */
export default function CarroPerfeitoPage() {
  return <CarMatch />;
}
