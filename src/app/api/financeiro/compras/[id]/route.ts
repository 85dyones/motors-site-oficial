import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { podeExcluirLancamento } from "../../../../../lib/alcada";
import { perfisDe } from "../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const updateData: any = {};
    const allowedFields = [
      "descricao", "fornecedor", "valor_total", "quantidade", "valor_unitario",
      "data_compra", "categoria", "veiculo_id", "nota_fiscal", "status", "conta_id"
    ];

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    const { data: updated, error } = await supabase
      .from("compras_produtos")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ compra: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Separação de funções (2026-08-21): quem opera o financeiro não apaga
    // registro de dinheiro. Compra lançada por engano vira `cancelado`, que
    // preserva a linha e o rastro. A RLS também recusa (20260821210000); esta
    // checagem existe para o erro sair legível em vez de "0 linhas afetadas".
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    if (!podeExcluirLancamento(perfisDe(perfil))) {
      return NextResponse.json(
        { error: "Apenas o administrador exclui compra lançada — cancele a compra para manter o registro." },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("compras_produtos")
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
