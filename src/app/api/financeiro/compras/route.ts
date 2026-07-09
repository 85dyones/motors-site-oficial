import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../lib/webhook-dispatcher";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: compras, error } = await supabase
      .from("compras_produtos")
      .select("*")
      .order("data_compra", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ compras });
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
      descricao, fornecedor, valor_total, quantidade, valor_unitario,
      data_compra, categoria, veiculo_id, nota_fiscal, status, forma_pagamento
    } = body;

    if (!descricao || !fornecedor || !valor_total) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    // 1. Create a matching account payable first if not cancelled
    let contaId = null;
    if (status !== "cancelado") {
      // Find or default to "Compra de Veículo (Estoque)" or "Outras Despesas" category
      const catNome = veiculo_id ? "Compra de Veículo (Estoque)" : "Outras Despesas";
      const { data: cat } = await supabase
        .from("categorias_financeiras")
        .select("id")
        .eq("nome", catNome)
        .eq("tipo", "despesa")
        .single();

      const { data: conta, error: contaError } = await supabase
        .from("contas")
        .insert({
          tipo: "pagar",
          descricao: `Compra: ${descricao}`,
          valor: parseFloat(valor_total),
          data_vencimento: data_compra || new Date().toISOString().split("T")[0],
          status: "pendente",
          categoria_id: cat?.id || null,
          veiculo_id: veiculo_id || null,
          fornecedor,
          forma_pagamento: forma_pagamento || null,
          created_by: user.id
        })
        .select("id")
        .single();

      if (contaError) {
        console.error("[CompraGen] Failed to generate account payable:", contaError.message);
      } else {
        contaId = conta?.id;
      }
    }

    // 2. Create the purchase record
    const { data: compra, error: compraError } = await supabase
      .from("compras_produtos")
      .insert({
        descricao,
        fornecedor,
        valor_total: parseFloat(valor_total),
        quantidade: quantidade ? parseInt(quantidade) : 1,
        valor_unitario: valor_unitario ? parseFloat(valor_unitario) : parseFloat(valor_total),
        data_compra: data_compra || new Date().toISOString().split("T")[0],
        categoria: categoria || "outro",
        veiculo_id: veiculo_id || null,
        nota_fiscal: nota_fiscal || null,
        status: status || "recebido",
        conta_id: contaId,
        created_by: user.id
      })
      .select()
      .single();

    if (compraError) {
      return NextResponse.json({ error: compraError.message }, { status: 500 });
    }

    // Trigger admin webhook for new purchase
    if (compra) {
      await dispatchAdminWebhook("compra_registrada", compra).catch((err) =>
        console.error("[WebhookDispatch] Failed to dispatch purchase registered event:", err.message)
      );
    }

    return NextResponse.json({ compra });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
