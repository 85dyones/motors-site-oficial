/**
 * Vocabulário de classificação do estoque — carroceria e perfil de uso.
 *
 * As duas listas precisam falar o mesmo vocabulário do feed, porque desde
 * 2026-08-06 o site exibe `tipo` e `perfil_uso` como vêm do banco em vez de
 * adivinhá-los. Escolher aqui um rótulo de outra taxonomia sobrescreve o dado
 * real do veículo por um que o resto do estoque não usa.
 *
 * Vocabulário medido em produção em 2026-08-06, sobre os 88 veículos:
 *   tipo         Hatch, SUV, Sedan, Motocicleta, Picape
 *   perfil_uso   Família / Conforto, Econômico / Diário, Uso Diário,
 *                Performance / Premium, Agilidade / Economia,
 *                Trabalho / Robustez
 *
 * "Premium" não está em `CARROCERIAS`: não é carroceria, era o default
 * inventado que o mapper devolvia quando não sabia — deixá-lo no dropdown
 * permitiria reintroduzir à mão a string que acabou de sair do código.
 *
 * Os quatro rótulos antigos de perfil seguem na lista, ao final: dois veículos
 * carregam "LINHAGEM ESPORTIVA" gravada à mão em stock_overrides, e remover a
 * opção tiraria do dono a chance de reescolher o próprio valor.
 *
 * Estavam declaradas dentro de `ConfiguracoesClientWrapper`, na aba de cards
 * que a tabela A6 substituiu. Vivem aqui para que a tabela e o editor de
 * veículo (A15) ofereçam as mesmas opções.
 */

export const CARROCERIAS = [
  "SUV",
  "Sedan",
  "Picape",
  "Hatch",
  "Motocicleta",
  "Esportivo",
  "Conversível",
  "Coupe",
  "Wagon",
] as const;

export const PERFIS_DE_USO = [
  "Família / Conforto",
  "Econômico / Diário",
  "Uso Diário",
  "Performance / Premium",
  "Agilidade / Economia",
  "Trabalho / Robustez",
  "URBANO & EFICIENTE",
  "FORÇA & OFF-ROAD",
  "LINHAGEM ESPORTIVA",
  "CURADORIA EXCLUSIVA",
] as const;
