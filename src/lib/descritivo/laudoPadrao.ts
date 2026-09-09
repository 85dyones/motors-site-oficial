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
 * A frase SUGERIDA para o botão "Usar este texto" — vazia quando a perícia
 * não aprovou, porque esse ramo não oferece botão de preencher (ver
 * `SugestaoDeLaudoPadrao.tsx`).
 *
 * Isto descreve a SUGESTÃO, não o valor que já mora no banco: desde a
 * migração `20260901120000_laudo_cautelar_texto_padrao` (01/09/2026),
 * `laudo_pericia` está preenchido DE PROPÓSITO em toda linha que estava
 * vazia — perícia aprovada ou não. Preencher não é exibir: `PDPClientWrapper`
 * só abre o bloco do laudo na ficha quando há texto E a perícia do feed lê
 * como aprovada, então o campo preenchido de um carro "Em análise" não
 * afirma nada ao cliente — o bloco simplesmente não acende até a perícia
 * aprovar. `LAUDO_APROVADO_PADRAO` é a redação fixada em 09/09/2026 para o
 * caso em que a perícia aprova.
 *
 * A régua é a MESMA que acende o selo do site — `formatPericia`, de
 * `lib/supabase.ts` — nunca uma comparação paralela com a coluna crua.
 */
export function laudoPadraoDe(pericia: string | null | undefined): string {
  return formatPericia(pericia ?? "") === "PERÍCIA APROVADA" ? LAUDO_APROVADO_PADRAO : "";
}
