"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pushContagemDeEstoque } from "../lib/dataLayer";

/**
 * Publica no `dataLayer` quantos veículos esta página lista.
 *
 * O `CamadaDeDados` do layout raiz não pode saber a contagem: ele roda em toda
 * rota, inclusive no painel, e buscar o estoque ali colocaria uma consulta ao
 * banco em cada visita só para preencher um número. Quem já tem o número é a
 * página de listagem — e é ela que o publica.
 *
 * Roda DEPOIS do `CamadaDeDados` (efeito de irmão anterior na árvore), que
 * acabou de limpar o `stock_count` da página anterior. A ordem importa: ao
 * contrário, a página listaria e o número seria zerado em seguida.
 */
export default function ContagemDeEstoque({ total }: { total: number }) {
  const pathname = usePathname();

  useEffect(() => {
    pushContagemDeEstoque(total);
    // `pathname` na lista: numa navegação entre duas listagens o total pode
    // repetir (dois hubs com 3 carros), e sem ele o efeito não roda de novo.
  }, [pathname, total]);

  return null;
}
