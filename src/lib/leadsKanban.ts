/**
 * Regras do kanban de leads que não dependem de React.
 *
 * Vivem aqui, e não dentro do componente, porque são as únicas partes
 * testáveis da tela A8: o resto é arrastar, soltar e pintar. O padrão é o
 * mesmo de `avaliacaoRecomendacao` e `estatisticasEstoque`.
 */

/** Valor sentinela do filtro para "ninguém pegou este lead ainda". */
export const SEM_DONO = " sem-dono";

/** O mínimo que as regras precisam saber de um lead. */
export interface LeadFiltravel {
  responsavel: string | null;
}

/**
 * Iniciais do responsável, para caber nos 20px do rodapé do card.
 *
 * Primeira e última palavra: "João Silva Pereira" vira "JP", não "JS". É o
 * que distingue dois consultores de mesmo primeiro nome, que é o caso que
 * importa numa loja pequena.
 */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Aplica o filtro de responsável.
 *
 * Filtro vazio devolve tudo — inclusive os sem dono. O sentinela `SEM_DONO`
 * começa com espaço de propósito: nome de gente nunca começa com espaço, então
 * ele não colide com um consultor de verdade.
 */
export function filtrarPorResponsavel<T extends LeadFiltravel>(leads: T[], filtro: string): T[] {
  if (!filtro) return leads;
  if (filtro === SEM_DONO) return leads.filter((l) => !l.responsavel);
  return leads.filter((l) => l.responsavel === filtro);
}

/**
 * Nomes que aparecem no seletor: os cadastrados no painel mais os que já
 * estão gravados em algum lead.
 *
 * Os dois, porque `responsavel` é texto e não chave estrangeira (migração
 * 20260807210000): consultor que saiu da empresa some do cadastro, mas o
 * histórico dele continua nos leads antigos. Sem a união, o filtro deixaria
 * de encontrar esses leads e eles sumiriam da tela sem explicação.
 */
export function opcoesDeResponsavel(
  cadastrados: string[],
  leads: LeadFiltravel[],
): string[] {
  const nomes = new Set(cadastrados.filter(Boolean));
  for (const l of leads) if (l.responsavel) nomes.add(l.responsavel);
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
