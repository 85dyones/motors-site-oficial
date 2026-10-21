import type { Temperatura } from "../../../lib/aquecimento";

/**
 * Como cada temperatura aparece (2026-10-20): o emoji, as classes do selo e o
 * preenchimento da barra. Pedido do dono no teste do branch: *"a barra
 * amarela ou vermelha no quente, com um emoji de chama, o inverso no frio,
 * emoji de gelado e azul na barra"*. As cores são os tokens `--mt-frio`,
 * `--mt-morno` e o acento (`modernist.css`); o card do quadro, o selo do
 * atendimento e o bloco do aquecimento usam todos daqui.
 */

export const EMOJI_DA_TEMPERATURA: Record<Temperatura, string> = {
  frio: "🧊",
  morno: "🌡️",
  quente: "🔥",
};

export const SELO_DA_TEMPERATURA: Record<Temperatura, string> = {
  frio: "border-mt-frio bg-mt-frio-100 text-mt-frio",
  morno: "border-mt-morno bg-mt-morno-100 text-mt-morno",
  quente: "border-mt-accent bg-mt-accent-100 text-mt-accent-800",
};

/** O texto grande ("QUENTE") ao lado da nota. */
export const TEXTO_DA_TEMPERATURA: Record<Temperatura, string> = {
  frio: "text-mt-frio",
  morno: "text-mt-morno",
  quente: "text-mt-accent-800",
};

/** O preenchimento da régua: azul no frio, âmbar no morno, do âmbar ao vermelho no quente. */
export const BARRA_DA_TEMPERATURA: Record<Temperatura, string> = {
  frio: "var(--mt-frio-vivo)",
  morno: "var(--mt-morno-vivo)",
  quente: "linear-gradient(90deg, var(--mt-morno-vivo), var(--mt-accent))",
};
