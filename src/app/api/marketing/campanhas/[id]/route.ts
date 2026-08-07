import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { normalizarPerfil, podeFazer } from "../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * Uma campanha (tela A14): detalhe com anúncios, histórico de leituras e
 * registro de ajustes. PATCH altera os campos de configuração — cada mexida
 * relevante deveria vir acompanhada de um POST em /ajustes, mas isso é
 * decisão de quem opera; o painel sugere, não força.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const [campRes, anunRes, leitRes, ajusRes] = await Promise.all([
      supabase.from("midia_campanhas").select("*").eq("id", id).single(),
      supabase.from("midia_anuncios").select("*").eq("campanha_id", id).order("criado_em", { ascending: true }),
      supabase
        .from("midia_leituras")
        .select("*")
        .eq("campanha_id", id)
        .order("registrado_em", { ascending: false })
        .limit(1000),
      supabase
        .from("midia_ajustes")
        .select("*")
        .eq("campanha_id", id)
        .order("registrado_em", { ascending: false })
        .limit(100),
    ]);

    if (campRes.error) {
      return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
    }
    const erro = anunRes.error ?? leitRes.error ?? ajusRes.error;
    if (erro) {
      return NextResponse.json({ error: erro.message }, { status: 500 });
    }

    return NextResponse.json({
      campanha: campRes.data,
      anuncios: anunRes.data ?? [],
      leituras: leitRes.data ?? [],
      ajustes: ajusRes.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
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
      .select("role")
      .eq("id", user.id)
      .single();

    const perfil = normalizarPerfil(profile?.role);
    if (podeFazer(perfil, "Gerenciar campanhas de mídia paga") !== "faz") {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const body = await request.json();
    // Só os campos de configuração; leituras e ajustes têm rota própria.
    const atualizacao: Record<string, unknown> = {};
    for (const campo of ["nome", "objetivo", "orcamento_diario", "publico", "atribuicao", "situacao", "no_ar_desde"]) {
      if (campo in body) atualizacao[campo] = body[campo];
    }
    if (Object.keys(atualizacao).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }
    if ("situacao" in atualizacao && !["no_ar", "pausada", "planejada", "encerrada"].includes(String(atualizacao.situacao))) {
      return NextResponse.json({ error: "Situação inválida" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("midia_campanhas")
      .update(atualizacao)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ campanha: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
