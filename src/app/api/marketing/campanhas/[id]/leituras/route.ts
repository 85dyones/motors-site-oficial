import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * "Aplicar leitura" da tela A14: grava um lote de snapshots cumulativos —
 * uma linha por anúncio digitado e uma linha da campanha (anuncio_id null)
 * com o alcance total, que não é a soma dos alcances por anúncio.
 *
 * Corpo esperado:
 * {
 *   "linhas": [{ "anuncio_id": "…", "investido": 4.46, "impressoes": 350,
 *                "alcance": 246, "cliques": 18, "conversas": 2 }, …],
 *   "campanha": { "alcance": 277 }            // opcional
 * }
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
      .select("role")
      .eq("id", user.id)
      .single();

    if (!ehStaff(profile?.role)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = normalizarPerfil(profile?.role);
    if (podeFazer(perfil, "Gerenciar campanhas de mídia paga") !== "faz") {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const body = await request.json();
    const linhas: any[] = Array.isArray(body.linhas) ? body.linhas : [];
    if (linhas.length === 0 && !body.campanha) {
      return NextResponse.json({ error: "Leitura vazia" }, { status: 400 });
    }

    // Números vêm de digitação: vírgula decimal é esperada, negativo não.
    const num = (v: unknown): number => {
      const n = typeof v === "string" ? parseFloat(v.replace(/\./g, "").replace(",", ".")) : Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const int = (v: unknown): number => Math.round(num(v));

    const inserir = linhas.map((l) => ({
      campanha_id: id,
      anuncio_id: l.anuncio_id ?? null,
      investido: num(l.investido),
      impressoes: int(l.impressoes),
      alcance: int(l.alcance),
      cliques: int(l.cliques),
      conversas: int(l.conversas),
    }));

    if (body.campanha) {
      inserir.push({
        campanha_id: id,
        anuncio_id: null,
        investido: num(body.campanha.investido),
        impressoes: int(body.campanha.impressoes),
        alcance: int(body.campanha.alcance),
        cliques: int(body.campanha.cliques),
        conversas: int(body.campanha.conversas),
      });
    }

    const { error } = await supabase.from("midia_leituras").insert(inserir);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ inseridas: inserir.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
