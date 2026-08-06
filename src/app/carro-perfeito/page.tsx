import type { Metadata } from "next";
import CarMatch from "../../components/CarMatch";

export const metadata: Metadata = {
  title: "Garagem Profiler — encontre o carro certo | Motors Store",
  description:
    "Cinco perguntas, trinta segundos. Traçamos seu perfil de uso e um consultor envia três sugestões reais do estoque no WhatsApp.",
  alternates: { canonical: "/carro-perfeito" },
};

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
