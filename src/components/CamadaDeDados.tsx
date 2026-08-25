"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { pushCamadaGlobal, tipoDaPagina } from "../lib/dataLayer";

/**
 * Publica a camada global do `dataLayer` a cada página.
 *
 * Fica ao lado do `IntegrationsTracker` no layout raiz, e antes dele na ordem
 * de montagem: o contexto da página precisa estar no array quando o GTM
 * carregar, porque é ele que o container lê para decidir gatilho e variável.
 * Como o GTM processa a fila já existente ao inicializar, publicar aqui — sem
 * esperar o aceite de cookies — não perde nem antecipa envio nenhum.
 *
 * `usePathname` e não `window.location`: numa navegação client-side do Next a
 * URL muda sem recarregar a página, e sem este efeito toda navegação depois da
 * primeira herdaria o `page_type` da página anterior.
 */
export default function CamadaDeDados() {
  const pathname = usePathname();
  const ultimoCaminho = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || ultimoCaminho.current === pathname) return;
    ultimoCaminho.current = pathname;

    pushCamadaGlobal({ page_type: tipoDaPagina(pathname) });
  }, [pathname]);

  return null;
}
