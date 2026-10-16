import type { Veiculo } from "../types";

/**
 * O veículo que vai para um componente de CLIENTE — 16/10/2026.
 *
 * Tudo que um Server Component passa de prop a um componente `"use client"`
 * é serializado no HTML da página (o payload do React). Medido na produção
 * em 16/10: a home e o /estoque respondiam ~490 KB, dos quais 358 KB eram os
 * 43 veículos inteiros — as duas listas de fotos (95 KB), `descricao`
 * (20 KB), `descricao_seo` (10 KB), o laudo — serializados para a barra de
 * busca e para o catálogo, que lêem só o que cabe num card. O /financiamento
 * fazia o mesmo para o simulador (410 KB).
 *
 * O que fica é o que o card, o filtro, a busca (`CAMPOS_DA_BUSCA` em
 * `lib/vitrine.ts`), a ordenação e o simulador lêem. O que sai:
 *
 * - as fotos além da primeira, que só a ficha mostra — o card desenha a capa
 *   e escreve a contagem, que vem em `total_de_fotos`;
 * - `descricao` e `descricao_seo`, que a busca não varre e o card não mostra;
 * - `laudo_pericia`, que só a ficha lê (o selo do card olha `pericia`).
 *
 * O tipo continua `Veiculo`, de propósito: nenhum componente muda de
 * assinatura, e quem precisar da ficha inteira continua recebendo a ficha
 * inteira (a própria PDP recebe `veiculo` sem passar por aqui).
 */
export function aliviarParaOCliente(veiculo: Veiculo): Veiculo {
  const { descricao: _descricao, descricao_seo: _seo, ...resto } = veiculo;
  const web = veiculo.web_full_images ?? [];
  const zap = veiculo.whatsapp_images ?? [];
  return {
    ...resto,
    laudo_pericia: "",
    web_full_images: web.slice(0, 1),
    whatsapp_images: zap.slice(0, 1),
    total_de_fotos: Math.max(web.length, zap.length),
  };
}

export function aliviarListaParaOCliente(veiculos: Veiculo[]): Veiculo[] {
  return veiculos.map(aliviarParaOCliente);
}

/** Quantas fotos o veículo tem — na lista aliviada ou na ficha inteira. */
export function totalDeFotos(veiculo: Veiculo): number {
  return veiculo.total_de_fotos ?? Math.max(veiculo.web_full_images?.length ?? 0, veiculo.whatsapp_images?.length ?? 0);
}
