"use client";

import { pushComoChegar } from "../lib/dataLayer";
import { urlDaRota } from "../lib/rotaAteALoja";

/**
 * "Como chegar" — abre a rota no Google Maps e registra `click_directions`.
 *
 * O site não tinha nenhum link de rota, e é o gesto mais previsível de quem lê
 * uma página de bairro: já decidiu vir, quer saber por onde. Vale como
 * micro-conversão de intenção presencial (§4.4 do plano de aquisição) e é a
 * única fonte possível do evento — sem o link, não há o que medir.
 *
 * A URL sai de `lib/rotaAteALoja.ts`, e não daqui: montada no JSX, a única
 * guarda possível era procurar o NOME do identificador no texto do arquivo, e
 * um apelido de import passava por ela deixando a rota quebrada. O porquê dos
 * dois parâmetros está lá.
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
  const rota = urlDaRota(endereco);
  if (!rota) return null;

  return (
    <a
      href={rota}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => pushComoChegar(origem)}
      className={className}
    >
      COMO CHEGAR
    </a>
  );
}
