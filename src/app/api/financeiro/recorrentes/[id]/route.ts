import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../lib/webhook-dispatcher";

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
      "descricao", "valor", "categoria_id", "fornecedor", "frequencia",
      "dia_vencimento", "forma_pagamento", "ativa", "observacoes", "proxima_geracao"
    ];

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    const { data: updated, error } = await supabase
      .from("despesas_recorrentes")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    dispatchAdminWebhook("recorrente_atualizada", updated).catch((err) =>
      console.error("[WebhookDispatcher] Failed to dispatch recorrente_atualizada:", err.message)
    );

    return NextResponse.json({ recurring: updated });
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

    const { error } = await supabase
      .from("despesas_recorrentes")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    dispatchAdminWebhook("recorrente_deletada", { id }).catch((err) =>
      console.error("[WebhookDispatcher] Failed to dispatch recorrente_deletada:", err.message)
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
