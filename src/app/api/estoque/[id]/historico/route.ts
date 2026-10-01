import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { ehTabelaOuColunaAusente } from "../../../../../lib/erroDeSchema";
import { historicoVisivel } from "../../../../../lib/historicoDoVeiculo";
import { perfisDe, podeGravarCampo } from "../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/** Últimas alterações deste veículo — bloco "histórico" da tela A15. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("historico_veiculo")
      .select("*")
      .eq("veiculo_id", Number(id))
      .order("registrado_em", { ascending: false })
      .limit(50);

    if (error) {
      // Migração ainda não aplicada: a tela mostra a instrução em vez de
      // erro cru, e o editor continua utilizável.
      if (ehTabelaOuColunaAusente(error)) {
        return NextResponse.json({ historico: [], migracaoPendente: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // O preço de compra some da tela de quem não vê custo; a linha dele no
    // histórico contaria o valor do mesmo jeito (01/10).
    const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).single();
    const podeVerCusto = podeGravarCampo(perfisDe(profile), "preco_compra");
    return NextResponse.json({ historico: historicoVisivel(data ?? [], { podeVerCusto }) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
