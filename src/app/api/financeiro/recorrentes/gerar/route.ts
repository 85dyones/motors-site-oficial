import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const todayStr = new Date().toISOString().split("T")[0];

    // Fetch recurring items due for billing generation
    const { data: items, error: fetchError } = await supabase
      .from("despesas_recorrentes")
      .select("*")
      .eq("ativa", true)
      .lte("proxima_geracao", todayStr);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let generatedCount = 0;

    if (items && items.length > 0) {
      for (const item of items) {
        // 1. Insert new account payable
        const { error: insertError } = await supabase
          .from("contas")
          .insert({
            tipo: "pagar",
            descricao: item.descricao,
            valor: item.valor,
            data_vencimento: item.proxima_geracao,
            status: "pendente",
            categoria_id: item.categoria_id,
            fornecedor: item.fornecedor,
            forma_pagamento: item.forma_pagamento,
            recorrencia_id: item.id,
            created_by: user.id
          });

        if (insertError) {
          console.error(`[RecorrentesGen] Failed to generate bill for ${item.descricao}:`, insertError.message);
          continue;
        }

        // 2. Calculate next generation date
        const currentGenDate = new Date(item.proxima_geracao + "T12:00:00");
        const nextGenDate = new Date(currentGenDate);

        switch (item.frequencia) {
          case "semanal":
            nextGenDate.setDate(nextGenDate.getDate() + 7);
            break;
          case "quinzenal":
            nextGenDate.setDate(nextGenDate.getDate() + 15);
            break;
          case "mensal":
            nextGenDate.setMonth(nextGenDate.getMonth() + 1);
            break;
          case "bimestral":
            nextGenDate.setMonth(nextGenDate.getMonth() + 2);
            break;
          case "trimestral":
            nextGenDate.setMonth(nextGenDate.getMonth() + 3);
            break;
          case "semestral":
            nextGenDate.setMonth(nextGenDate.getMonth() + 6);
            break;
          case "anual":
            nextGenDate.setFullYear(nextGenDate.getFullYear() + 1);
            break;
        }

        // 3. Update proxima_geracao date
        const { error: updateError } = await supabase
          .from("despesas_recorrentes")
          .update({
            proxima_geracao: nextGenDate.toISOString().split("T")[0]
          })
          .eq("id", item.id);

        if (updateError) {
          console.error(`[RecorrentesGen] Failed to update proxima_geracao for ${item.descricao}:`, updateError.message);
        } else {
          generatedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, generatedCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
