import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { podeExcluirLancamento } from "../../../../../lib/alcada";
import { perfisDe } from "../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Corrigir lançamento errado é apagar e lançar de novo — não há PUT de
 * propósito: editar valor de movimentação em silêncio é como o controle
 * "bagunçado" do briefing nasceu. O DELETE existe para o erro de digitação
 * do próprio dia; o saldo é derivado, então some junto.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Separação de funções (2026-08-21): extrato de investidor é registro de
    // capital de sócio, e quem opera o financeiro no dia a dia não o apaga.
    // Aqui não há "cancelar" — o lançamento errado é corrigido pelo Admin. A
    // RLS também recusa (20260821210000); esta checagem existe para o erro
    // sair legível em vez de "0 linhas afetadas".
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    if (!podeExcluirLancamento(perfisDe(perfil))) {
      return NextResponse.json(
        { error: "Apenas o administrador exclui movimentação de investidor." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { error } = await supabase
      .from("movimentacoes_investidor")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
