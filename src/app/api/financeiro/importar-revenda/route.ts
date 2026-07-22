import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { searchPlanoDeContas } from "@/lib/planoContasData";
import { sanitizeTextEncoding } from "@/lib/encodingUtils";

export const dynamic = "force-dynamic";

interface ImportItem {
  descricao: string;
  valor: number;
  tipo: "pagar" | "receber";
  data_vencimento: string;
  fornecedor_cliente?: string;
  categoria_codigo?: string;
  veiculo_id?: string;
  observacoes?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    // Check Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const items: ImportItem[] = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Nenhum item válido enviado para importação." }, { status: 400 });
    }

    // Fetch existing categories to map codes to UUIDs if present
    const { data: categories } = await supabase.from("categorias_financeiras").select("id, nome");
    const categoryMap: Record<string, string> = {};
    (categories || []).forEach(cat => {
      categoryMap[cat.nome.toLowerCase()] = cat.id;
    });

    let insertedCount = 0;
    const errors: string[] = [];

    for (const item of items) {
      if (!item.descricao || !item.valor || !item.data_vencimento) {
        errors.push(`Item ignorado (campos obrigatórios ausentes): ${item.descricao || 'Sem descrição'}`);
        continue;
      }

      const cleanDesc = sanitizeTextEncoding(item.descricao);
      const cleanPartner = sanitizeTextEncoding(item.fornecedor_cliente);
      const cleanObs = sanitizeTextEncoding(item.observacoes);

      // Try to correlate category code
      let matchedCategoryId: string | null = null;
      if (item.categoria_codigo) {
        const plano = searchPlanoDeContas(item.categoria_codigo);
        if (plano.length > 0) {
          const matchedName = plano[0].nome.toLowerCase();
          matchedCategoryId = categoryMap[matchedName] || null;
        }
      }

      const accountPayload = {
        tipo: item.tipo || "pagar",
        descricao: cleanDesc,
        valor: Math.abs(item.valor),
        data_vencimento: item.data_vencimento,
        status: "pendente",
        fornecedor: item.tipo === "pagar" ? (cleanPartner || "Importado RevendaMais") : null,
        cliente: item.tipo === "receber" ? (cleanPartner || "Cliente RevendaMais") : null,
        categoria_id: matchedCategoryId,
        veiculo_id: item.veiculo_id || null,
        observacoes: cleanObs ? `${cleanObs} (Origem: RevendaMais)` : "Importado via Lote do RevendaMais",
        created_by: user.id,
      };

      const { error: insertErr } = await supabase.from("contas").insert(accountPayload);
      if (insertErr) {
        errors.push(`Erro ao inserir '${item.descricao}': ${insertErr.message}`);
      } else {
        insertedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      insertedCount,
      totalReceived: items.length,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro ao importar dados do RevendaMais." }, { status: 500 });
  }
}
