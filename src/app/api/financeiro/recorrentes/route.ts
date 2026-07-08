import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../lib/webhook-dispatcher";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: recurring, error } = await supabase
      .from("despesas_recorrentes")
      .select(`
        *,
        categoria:categorias_financeiras (nome, cor, icone)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recurring });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const {
      descricao, valor, categoria_id, fornecedor, frequencia,
      dia_vencimento, forma_pagamento, observacoes
    } = body;

    if (!descricao || !valor || !frequencia || !dia_vencimento) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    // Calculate initial next generation date
    const today = new Date();
    let nextGen = new Date(today.getFullYear(), today.getMonth(), dia_vencimento);
    if (nextGen < today) {
      nextGen.setMonth(nextGen.getMonth() + 1); // Set for next month if already passed
    }

    const { data: inserted, error } = await supabase
      .from("despesas_recorrentes")
      .insert({
        descricao,
        valor: parseFloat(valor),
        categoria_id: categoria_id || null,
        fornecedor: fornecedor || null,
        frequencia,
        dia_vencimento: parseInt(dia_vencimento),
        forma_pagamento: forma_pagamento || null,
        proxima_geracao: nextGen.toISOString().split("T")[0],
        observacoes: observacoes || null,
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Dispatch webhook event in the background
    dispatchAdminWebhook("recorrente_criada", inserted).catch((err) =>
      console.error("[WebhookDispatcher] Failed to dispatch recorrente_criada:", err.message)
    );

    return NextResponse.json({ recurring: inserted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
