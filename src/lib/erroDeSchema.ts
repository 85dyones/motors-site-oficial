/**
 * Detecção de "a migração ainda não foi aplicada".
 *
 * Havia um engano nas rotas novas de 2026-08-07: elas testavam `42P01`, o
 * SQLSTATE do Postgres para relação inexistente. Mas quem responde ao app é
 * o **PostgREST**, e ele nem chega a executar a query — devolve `PGRST205`
 * ("Could not find the table ... in the schema cache") a partir do cache de
 * schema dele. O `42P01` só aparece quando a tabela existe e a COLUNA não.
 *
 * Resultado do engano: o tratamento amigável nunca disparava, e a tela
 * mostrava a mensagem crua do PostgREST em vez da instrução de aplicar a
 * migração. Verificado na tela A15, antes de `historico_veiculo` existir.
 *
 * Os dois códigos ficam aqui juntos porque as duas situações têm a mesma
 * causa prática — falta rodar `supabase db push` — e a mesma saída para quem
 * usa o painel.
 */
export function ehTabelaOuColunaAusente(erro: unknown): boolean {
  const código = (erro as { code?: string } | null)?.code;
  return código === "PGRST205" || código === "42P01" || código === "42703";
}

/** Mensagem única, citando o arquivo que precisa ser aplicado. */
export function mensagemDeMigracaoPendente(arquivo: string): string {
  return (
    `Estrutura ainda não existe no banco. Aplique a migração ${arquivo} ` +
    "(supabase/migrations) e recarregue."
  );
}
