import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * "Registrar ajuste" da tela A14 — a marca na linha do tempo que permite
 * dizer depois o que causou uma variação ("subiu o diário de 20 para 30",
 * "trocou a capa do SPIN").
 */
export async function POST(
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis, full_name")
      .eq("id", user.id)
      .single();

    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = perfisDe(profile);
    if (podeFazer(perfil, "Gerenciar campanhas de mídia paga") !== "faz") {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const body = await request.json();
    const descricao = String(body.descricao ?? "").trim();
    if (!descricao) {
      return NextResponse.json({ error: "Descreva o ajuste" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("midia_ajustes")
      .insert({
        campanha_id: id,
        descricao,
        autor_nome: profile?.full_name ?? user.email ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ajuste: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
