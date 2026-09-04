"use client";

import { pushComoChegar } from "../lib/dataLayer";
import { PLACE_ID_NO_GOOGLE } from "../lib/schemaLoja";

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
 *
 * `destination_place_id` entrou em 2026-09-04. Sem ele o Maps GEOCODIFICA o
 * endereço em texto a cada clique — e endereço em texto tem homônimo, tem
 * grafia e é editável no painel. Com o `place_id` a rota termina no lugar
 * certo por identificador. O Google pede que os dois venham juntos: o texto
 * continua sendo o que a pessoa lê na caixa de destino.
 *
 * O identificador é o MESMO que `lib/schemaLoja.ts` usa para declarar a ficha
 * em `sameAs`/`hasMap`. As duas URLs do Maps que este repositório monta são
 * diferentes de propósito — aqui é a ROTA até a loja, lá é o LUGAR — mas a
 * loja passou a ser identificada num lugar só.
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
      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&destination_place_id=${PLACE_ID_NO_GOOGLE}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => pushComoChegar(origem)}
      className={className}
    >
      COMO CHEGAR
    </a>
  );
}
