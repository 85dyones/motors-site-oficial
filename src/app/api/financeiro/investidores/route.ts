import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { resumoDeInvestidores } from "../../../../lib/investidores";

export const dynamic = "force-dynamic";

/**
 * Investidores — GET lista com saldo, POST cadastra.
 *
 * Briefing 2026-08-21: o controle de quem aporta e retira "está um pouco
 * bagunçado". O saldo NUNCA é gravado — `resumoDeInvestidores` (lib pura)
 * deriva da lista de movimentações a cada leitura, então não há número
 * para dessincronizar. A porta é a RLS de `has_finance_access`, a mesma
 * do resto do módulo.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const [investidores, movimentacoes] = await Promise.all([
      supabase.from("investidores").select("*").order("nome", { ascending: true }),
      supabase
        .from("movimentacoes_investidor")
        .select("*")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    const erro = investidores.error || movimentacoes.error;
    if (erro) {
      return NextResponse.json({ error: erro.message }, { status: 500 });
    }

    const resumo = resumoDeInvestidores(investidores.data ?? [], movimentacoes.data ?? []);

    return NextResponse.json({
      investidores: resumo.investidores,
      consolidado: resumo.consolidado,
      movimentacoes: movimentacoes.data ?? [],
    });
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
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    if (!nome) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
    }

    const { data: investidor, error } = await supabase
      .from("investidores")
      .insert({
        nome,
        documento: body.documento || null,
        telefone: body.telefone || null,
        email: body.email || null,
        observacoes: body.observacoes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ investidor });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
