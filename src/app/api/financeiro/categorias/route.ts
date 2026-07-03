import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Auth & role check (handled by middleware, but good as fallback)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: categories, error } = await supabase
      .from("categorias_financeiras")
      .select("*")
      .eq("ativa", true)
      .order("nome", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories });
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
    const { nome, tipo, cor, icone } = body;

    if (!nome || !tipo) {
      return NextResponse.json({ error: "Nome e Tipo são obrigatórios" }, { status: 400 });
    }

    const { data: category, error } = await supabase
      .from("categorias_financeiras")
      .insert({ nome, tipo, cor, icone })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ category });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
