import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../lib/webhook-dispatcher";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const tipo = searchParams.get("tipo"); // 'fornecedor', 'cliente', 'ambos'

    let query = supabase.from("parceiros").select("*").order("nome", { ascending: true });

    if (tipo) {
      if (tipo === "fornecedor" || tipo === "cliente") {
        query = query.or(`tipo.eq.${tipo},tipo.eq.ambos`);
      } else {
        query = query.eq("tipo", tipo);
      }
    }

    const { data: partners, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ partners });
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
    const { nome, tipo, documento, telefone, email } = body;

    if (!nome || !tipo) {
      return NextResponse.json({ error: "Nome e Tipo são obrigatórios" }, { status: 400 });
    }

    const { data: partner, error } = await supabase
      .from("parceiros")
      .insert({
        nome,
        tipo,
        documento,
        telefone,
        email,
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger admin webhook for new supplier/partner (non-blocking)
    if (partner && (partner.tipo === "fornecedor" || partner.tipo === "ambos")) {
      dispatchAdminWebhook("fornecedor_criado", partner).catch((err) =>
        console.error("[WebhookDispatch] Failed to dispatch supplier created event:", err.message)
      );
    }

    return NextResponse.json({ partner });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
