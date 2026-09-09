import { formatPericia } from "../supabase";

/**
 * A frase padrão do campo "Laudo cautelar" — determinística, nunca gerada
 * pela IA.
 *
 * Desde 09/09/2026 o texto do anúncio (`descricao` e `descricao_seo`) está
 * proibido de mencionar perícia (ver `MENCIONA_PERICIA` em `validacao.ts`).
 * O assunto não desaparece: ele passa a viver aqui, num campo próprio, com
 * frase fixa em vez de texto gerado — não há mais afirmação de aprovação
 * para uma régua de validação tentar (e vazar) detectar.
 *
 * Módulo puro de propósito: o teste importa `LAUDO_APROVADO_PADRAO` em vez
 * de garimpar a frase na fonte, e o painel do editor consome a mesma
 * constante que o teste prova.
 */

/**
 * Redação canônica, fixada pelo dono em 09/09/2026. Não reescrever —
 * "empresa independente, credenciada junto ao Detran" é a formulação
 * aprovada, não uma paráfrase equivalente.
 */
export const LAUDO_APROVADO_PADRAO =
  "Perícia cautelar aprovada — estrutura, chassi e histórico de sinistro auditados por empresa independente, credenciada junto ao Detran.";

/**
 * A frase para este veículo, ou string vazia quando a perícia não aprovou.
 *
 * Perícia NÃO aprovada não tem frase alternativa — o campo fica vazio de
 * propósito. Preencher aqui sem a aprovação foi o que produziu 44 fichas
 * afirmando laudo completo num carro com exame em análise; o site já trata
 * o caso vazio sozinho (não liga selo, e diz ao cliente que o laudo pode ser
 * pedido ao vendedor).
 *
 * A régua é a MESMA que acende o selo do site — `formatPericia`, de
 * `lib/supabase.ts` — nunca uma comparação paralela com a coluna crua.
 */
export function laudoPadraoDe(pericia: string | null | undefined): string {
  return formatPericia(pericia ?? "") === "PERÍCIA APROVADA" ? LAUDO_APROVADO_PADRAO : "";
}
