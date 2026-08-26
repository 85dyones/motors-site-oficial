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

/**
 * Normaliza o que o atendente digitou na busca por referência.
 *
 * O que o cliente lê na mensagem é `(Ref: 0DCB1CDC)`, mas o que chega no
 * campo pode ser qualquer coisa: com o "Ref:" junto, com parênteses, em
 * minúsculas, ou o UUID inteiro colado da nota do Chatwoot. Os quatro têm de
 * levar ao mesmo lead.
 *
 * A régua tem dois passos, e a ordem entre eles importa:
 *
 * 1. **Tira o rótulo "Ref" do começo.** Precisa vir antes, porque o `e` de
 *    "Ref" é dígito hexadecimal válido — filtrar hex primeiro transformaria
 *    `Ref:0DCB1CDC` em `E0DCB1CD` e a busca não acharia nada, sem dizer por
 *    quê. `R` e `f` sairiam sozinhos; o `e` é a armadilha.
 * 2. **Joga fora o que não é hex** — hífens, espaços, parênteses —, sobe para
 *    caixa alta e fica com os 8 primeiros.
 *
 * Devolve `""` quando não sobram 8 caracteres. Quem chama trata isso como
 * "busca incompleta" e diz ao atendente o que falta, em vez de procurar um
 * prefixo curto e devolver meia dúzia de leads sem relação entre si.
 */
export function normalizarRef(entrada: string): string {
  const semRotulo = (entrada || "").replace(/^\s*\(?\s*ref\s*:?\s*/i, "");
  const hex = semRotulo.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return hex.length >= 8 ? hex.slice(0, 8) : "";
}
