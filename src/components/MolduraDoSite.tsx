"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Esconde a moldura do site (cabeçalho, rodapé, popup de lead e aviso de
 * cookies) nas rotas de vitrine.
 *
 * `/vitrine` roda na TV do showroom e no tablet de balcão: são telas de
 * exposição, sem navegação e sem ninguém para fechar um popup. O aviso de
 * cookies também não faz sentido ali — o aparelho é da loja, não do cliente,
 * e a vitrine não dispara tracking.
 *
 * Isso vive num componente só, e não numa checagem repetida dentro de cada
 * peça da moldura, para que a regra tenha um lugar único quando outra tela de
 * exposição aparecer.
 */
export default function MolduraDoSite({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/vitrine")) return null;
  return <>{children}</>;
}
