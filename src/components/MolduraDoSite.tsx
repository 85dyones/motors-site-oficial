"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ehRotaDeCampanha } from "../lib/campanhas";

/**
 * Esconde a moldura do site nas rotas que não são a loja.
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

function foraDaLoja(pathname: string | null): boolean {
  return ROTAS_SEM_MOLDURA.some((rota) => pathname?.startsWith(rota));
}

/**
 * A moldura de NAVEGAÇÃO — cabeçalho, rodapé e o pop-up de captura.
 *
 * Some fora da loja e também nas landing pages de campanha. Na campanha o
 * motivo é outro: a página tem CTA próprio, e um pop-up de lead competindo com
 * ele rouba a conversão que a verba do anúncio pagou.
 */
export default function MolduraDoSite({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (foraDaLoja(pathname)) return null;
  if (ehRotaDeCampanha(pathname)) return null;
  return <>{children}</>;
}

/**
 * O aviso LEGAL — hoje, o banner de cookies.
 *
 * Separado da navegação porque as duas regras não são a mesma. `/vitrine` e
 * `/admin` seguem sem ele, pelo motivo já dito: são aparelhos da loja, não do
 * cliente. A landing page de campanha, ao contrário, é página pública aberta
 * por cliente vindo de anúncio — largar o cabeçalho ali é escolha de design,
 * largar o aviso de cookies seria perda de conformidade.
 *
 * Até 2026-09-08 os quatro saíam no mesmo pacote, e a primeira LP teria levado
 * o aviso junto sem ninguém notar.
 */
export function AvisoLegalDoSite({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (foraDaLoja(pathname)) return null;
  return <>{children}</>;
}
