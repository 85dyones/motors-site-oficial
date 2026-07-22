import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { sanitizeTextEncoding } from "@/lib/encodingUtils";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();

    // Check Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Fetch all accounts to audit and fix corruptions
    const { data: contas, error: fetchErr } = await supabase
      .from("contas")
      .select("id, descricao, fornecedor, cliente, observacoes");

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    let updatedCount = 0;

    for (const c of (contas || [])) {
      const newDesc = sanitizeTextEncoding(c.descricao);
      const newForn = sanitizeTextEncoding(c.fornecedor);
      const newClie = sanitizeTextEncoding(c.cliente);
      const newObs = sanitizeTextEncoding(c.observacoes);

      const hasChanged =
        newDesc !== (c.descricao || "") ||
        newForn !== (c.fornecedor || "") ||
        newClie !== (c.cliente || "") ||
        newObs !== (c.observacoes || "");

      if (hasChanged) {
        await supabase
          .from("contas")
          .update({
            descricao: newDesc,
            fornecedor: c.fornecedor ? newForn : null,
            cliente: c.cliente ? newClie : null,
            observacoes: c.observacoes ? newObs : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", c.id);

        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      totalChecked: (contas || []).length,
      message: `Correção de encoding concluída! ${updatedCount} lançamentos corrigidos no banco.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro ao corrigir caracteres no banco de dados." }, { status: 500 });
  }
}
