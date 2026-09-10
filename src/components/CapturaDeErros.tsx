"use client";

import { useEffect } from "react";
import { configurar } from "../lib/observabilidade-cliente";

/**
 * Liga a captura de erro do navegador.
 *
 * Fica ao lado do `CamadaDeDados` e do `IntegrationsTracker` no layout raiz,
 * e **depois** deles na ordem: o rastreamento é o que traz o lead, e nada
 * aqui pode chegar antes dele na fila de montagem.
 *
 * ---------------------------------------------------------------------------
 * Por que o interruptor vem por prop, e não de `NEXT_PUBLIC_`
 * ---------------------------------------------------------------------------
 * `NEXT_PUBLIC_*` é *inlined* no build e vira texto do bundle. Uma env de
 * servidor lida no `RootLayout` (Server Component) e passada por prop mantém a
 * decisão do lado de cá, com uma variável só — `OBSERVABILIDADE` — servindo
 * também a `/api/erros` e ao ramo de gravação da costura. Uma verdade, três
 * lugares.
 *
 * Desligar continua exigindo um Redeploy, porque **qualquer** env da Vercel só
 * vale a partir do próximo deploy. O que este desenho garante é que desligar
 * não exige mudar código. O interruptor instantâneo, se fizer falta, é uma
 * flag em `site_settings` — e aí é outro PR.
 *
 * O aviso de PARADA (WhatsApp) **não** passa por aqui e não depende disto:
 * desligar a triagem não pode desligar o que faz a loja saber que a CAPI parou.
 */
export default function CapturaDeErros({
  ativo,
  release,
}: {
  ativo: boolean;
  release: string | null;
}) {
  useEffect(() => {
    // `configurar` devolve o desarme; sem ele, uma remontagem em
    // desenvolvimento deixaria dois capturadores ouvindo e relatando em dobro.
    return configurar({ ativo, release });
  }, [ativo, release]);

  return null;
}
