"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Esconde a moldura do site (cabeçalho, rodapé, popup de lead e aviso de
 * cookies) nas rotas que não são a loja.
 *
 * `/vitrine` roda na TV do showroom e no tablet de balcão: são telas de
 * exposição, sem navegação e sem ninguém para fechar um popup. O aviso de
 * cookies também não faz sentido ali — o aparelho é da loja, não do cliente,
 * e a vitrine não dispara tracking.
 *
 * `/admin` tem casca própria — trilho lateral, barra de topo e o botão "Ver o
 * site". Até 2026-08-08 o painel abria com o cabeçalho do CLIENTE por cima do
 * seu: duas barras empilhadas, o botão de WhatsApp da loja, o rodapé com
 * "marcas disponíveis" embaixo da tabela de estoque, e o pop-up de captura de
 * lead disparando em cima de quem está trabalhando. O design doc do admin não
 * desenha nada disso.
 *
 * `/login` continua com a moldura: é rota pública, e quem chega ali pode ter
 * vindo do site e querer voltar.
 *
 * Isso vive num componente só, e não numa checagem repetida dentro de cada
 * peça da moldura, para que a regra tenha um lugar único quando outra tela
 * fora da loja aparecer.
 */
const ROTAS_SEM_MOLDURA = ["/vitrine", "/admin"];

export default function MolduraDoSite({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (ROTAS_SEM_MOLDURA.some((rota) => pathname?.startsWith(rota))) return null;
  return <>{children}</>;
}
