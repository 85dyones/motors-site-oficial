"use client";

import type { ReactNode } from "react";
import { trackContactClick } from "../../lib/telemetry";
import { IconeWhatsApp } from "./primitivos";

/**
 * CTA de WhatsApp com telemetria.
 *
 * Existe porque as telas novas (home e catálogo) são server components e não
 * podem chamar `trackContactClick` direto. Antes do redesign quem disparava o
 * evento `Contact` na home era o `HeroSection`; ao reescrever a home o evento
 * ficou órfão. Todo CTA de WhatsApp das telas Modernist passa por aqui para
 * que a regra 7 do CLAUDE.md continue valendo: evento existente não some.
 *
 * O disparo é best-effort — `trackContactClick` já tem try/catch interno e
 * nunca pode travar a navegação do usuário (regra 1 do TRACKING_SPEC).
 */
export default function BotaoWhatsApp({
  href,
  rotulo,
  /** Identifica o ponto de origem no relatório — ex.: "Home - Faixa de contato" */
  origem,
  children,
  className = "mt-btn mt-btn-primario mt-foco",
  mostrarIcone = true,
  tamanhoIcone = 17,
}: {
  href: string;
  rotulo?: string;
  origem: string;
  children?: ReactNode;
  className?: string;
  mostrarIcone?: boolean;
  tamanhoIcone?: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackContactClick("whatsapp", origem)}
      className={className}
    >
      {mostrarIcone && <IconeWhatsApp size={tamanhoIcone} />}
      {children ?? rotulo}
    </a>
  );
}
