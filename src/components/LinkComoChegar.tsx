"use client";

import { pushComoChegar } from "../lib/dataLayer";

/**
 * "Como chegar" — abre a rota no Google Maps e registra `click_directions`.
 *
 * O site não tinha nenhum link de rota, e é o gesto mais previsível de quem lê
 * uma página de bairro: já decidiu vir, quer saber por onde. Vale como
 * micro-conversão de intenção presencial (§4.4 do plano de aquisição) e é a
 * única fonte possível do evento — sem o link, não há o que medir.
 *
 * `dir/?api=1&destination=` é a forma documentada e estável do Maps; abre o
 * app no celular e o site no desktop, sem depender de chave de API.
 */
export default function LinkComoChegar({
  endereco,
  origem,
  className = "mt-btn mt-btn-contorno mt-foco",
}: {
  endereco: string;
  /** Onde o clique aconteceu, para o relatório. */
  origem: string;
  className?: string;
}) {
  const destino = (endereco || "").trim();
  if (!destino) return null;

  return (
    <a
      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => pushComoChegar(origem)}
      className={className}
    >
      COMO CHEGAR
    </a>
  );
}
