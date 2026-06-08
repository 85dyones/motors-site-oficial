import type { Metadata } from "next";
import ConfiguracoesClientWrapper from "../../components/ConfiguracoesClientWrapper";

export const metadata: Metadata = {
  title: "Configurações do Site | Motors Store Admin",
  description: "Painel de controle administrativo da Motors Store. Personalização de categorias de veículos (estoque), parametrização de webhooks de integração e paletas de cores.",
};

export default function ConfiguracoesPage() {
  return (
    <ConfiguracoesClientWrapper />
  );
}
