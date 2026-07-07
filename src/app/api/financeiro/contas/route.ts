import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../lib/webhook-dispatcher";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const tipo = searchParams.get("tipo"); // pagar | receber
    const status = searchParams.get("status"); // pendente | pago | vencido | cancelado
    const categoriaId = searchParams.get("categoria_id");
    const veiculoId = searchParams.get("veiculo_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const search = searchParams.get("search");

    let query = supabase
      .from("contas")
      .select(`
        *,
        categoria:categorias_financeiras (nome, cor, icone)
      `);

    // Apply filters
    if (tipo) query = query.eq("tipo", tipo);
    if (status) query = query.eq("status", status);
    if (categoriaId) query = query.eq("categoria_id", categoriaId);
    if (veiculoId) query = query.eq("veiculo_id", veiculoId);
    if (startDate) query = query.gte("data_vencimento", startDate);
    if (endDate) query = query.lte("data_vencimento", endDate);
    if (search) {
      query = query.or(`descricao.ilike.%${search}%,fornecedor.ilike.%${search}%,cliente.ilike.%${search}%`);
    }

    // Order by date
    const { data: contas, error } = await query.order("data_vencimento", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ contas });
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
      tipo,
      descricao,
      valor,
      data_vencimento,
      status,
      categoria_id,
      veiculo_id,
      fornecedor,
      cliente,
      forma_pagamento,
      total_parcelas,
      observacoes,
      recorrencia_id
    } = body;

    if (!tipo || !descricao || !valor || !data_vencimento) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const numInstallments = parseInt(total_parcelas) || 1;
    const groupUuid = crypto.randomUUID();
    const accountsToInsert = [];

    const baseDate = new Date(data_vencimento + "T12:00:00"); // Avoid timezone shift

    for (let i = 1; i <= numInstallments; i++) {
      const vencimentoDate = new Date(baseDate);
      vencimentoDate.setMonth(vencimentoDate.getMonth() + (i - 1));

      accountsToInsert.push({
        tipo,
        descricao: numInstallments > 1 ? `${descricao} (${i}/${numInstallments})` : descricao,
        valor: parseFloat((valor / numInstallments).toFixed(2)),
        data_emissao: new Date().toISOString().split("T")[0],
        data_vencimento: vencimentoDate.toISOString().split("T")[0],
        status: status || "pendente",
        categoria_id: categoria_id || null,
        veiculo_id: veiculo_id || null,
        fornecedor: fornecedor || null,
        cliente: cliente || null,
        forma_pagamento: forma_pagamento || null,
        parcela_atual: i,
        total_parcelas: numInstallments,
        grupo_parcela: numInstallments > 1 ? groupUuid : null,
        recorrencia_id: recorrencia_id || null,
        observacoes: observacoes || null,
        created_by: user.id
      });
    }

    const { data: inserted, error } = await supabase
      .from("contas")
      .insert(accountsToInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Dispatch admin webhook for newly created accounts (non-blocking)
    if (inserted && inserted.length > 0) {
      inserted.forEach((c) => {
        dispatchAdminWebhook("conta_criada", c).catch((err) =>
          console.error("[WebhookDispatch] Failed to dispatch account created event:", err.message)
        );
      });
    }

    return NextResponse.json({ contas: inserted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
