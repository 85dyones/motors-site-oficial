import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Trilha de ações sensíveis (tela A17): permissões, paleta, texto legal.
 *
 * O registro nunca pode DERRUBAR a ação que o gerou — auditoria que falha
 * fechada viraria uma forma de travar o painel inteiro (ex.: tabela ainda
 * sem migração aplicada). Por isso o insert engole o erro e só o loga; a
 * imutabilidade de quem JÁ foi gravado fica por conta do RLS (sem policy de
 * UPDATE/DELETE).
 */
export async function registrarAcaoSensivel(
  supabase: SupabaseClient,
  acao: string,
  detalhe: string,
  autor: { id?: string | null; nome?: string | null },
): Promise<void> {
  try {
    const { error } = await supabase.from("auditoria_admin").insert({
      acao,
      detalhe,
      autor_id: autor.id ?? null,
      autor_nome: autor.nome ?? null,
    });
    if (error) {
      console.warn("[Auditoria] Falha ao registrar ação sensível:", error.message);
    }
  } catch (err: any) {
    console.warn("[Auditoria] Falha ao registrar ação sensível:", err?.message);
  }
}
