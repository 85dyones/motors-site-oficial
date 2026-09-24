/**
 * Piso e teto de ANO — sanidade de digitação, não regra de negócio.
 *
 * O teto é o ano que vem porque o ano-MODELO legitimamente se adianta ao
 * calendário (um 2027 vendido em 2026). O piso existe para pegar o dedo que
 * digitou 202 ou 20222, não para dizer que a loja não vende carro antigo.
 *
 * Módulo puro desde 24/09: o checklist do repasse roda no navegador e não
 * pode puxar `cadastroDeVeiculo.ts`, que importa a escrita do estoque.
 * `cadastroDeVeiculo.ts` reexporta os dois nomes, e quem já os importa de lá
 * não muda.
 */
export const ANO_MINIMO = 1900;
export const anoMaximo = (hoje: Date = new Date()) => hoje.getFullYear() + 1;
