import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    if (!nome) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }

    const { data: investidor, error } = await supabase
      .from("investidores")
      .update({
        nome,
        documento: body.documento || null,
        telefone: body.telefone || null,
        email: body.email || null,
        observacoes: body.observacoes || null,
        // O jeito certo de "remover" investidor que tem histórico: desativar.
        ativo: body.ativo !== false,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ investidor });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const { error } = await supabase.from("investidores").delete().eq("id", id);

    if (error) {
      // 23503 = FK: tem movimentação. A migração garante que o rastro do
      // dinheiro sobrevive ao cadastro — aqui só se traduz o erro.
      if (error.code === "23503") {
        return NextResponse.json(
          { error: "Investidor com movimentações não pode ser excluído — desative-o." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
