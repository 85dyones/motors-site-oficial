import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Confirma ou desfaz a conciliação de UMA linha do extrato —
 * POST { movimentacao_id } | { desfazer: true }
 *
 * É o gesto humano que o motor deliberadamente não faz sozinho: escolher
 * entre dois pagamentos do mesmo valor. Por isso o vínculo criado aqui é
 * marcado `manual` — casamento confirmado por gente tem dono, e a auditoria
 * consegue separar o que a máquina decidiu do que uma pessoa decidiu.
 *
 * Desfazer existe porque conciliação errada acontece, e a alternativa (apagar
 * a linha e reimportar) é pior: apagar prova de banco é do admin, e nem ele
 * deveria precisar fazer isso por um clique errado.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.desfazer === true) {
      const { data: linha, error } = await supabase
        .from("extrato_bancario")
        .update({
          movimentacao_id: null,
          conciliado_em: null,
          conciliado_por: null,
          conciliado_como: null,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ linha });
    }

    const movimentacaoId =
      typeof body.movimentacao_id === "string" ? body.movimentacao_id.trim() : "";
    if (!movimentacaoId) {
      return NextResponse.json(
        { error: "Informe a movimentação a conciliar, ou `desfazer: true`" },
        { status: 400 },
      );
    }

    const { data: linha, error } = await supabase
      .from("extrato_bancario")
      .update({
        movimentacao_id: movimentacaoId,
        conciliado_em: new Date().toISOString(),
        conciliado_por: user.id,
        conciliado_como: "manual",
      })
      .eq("id", id)
      // Um para um também aqui: conciliar por cima de um vínculo existente
      // seria trocar de par sem desfazer o anterior.
      .is("movimentacao_id", null)
      .select()
      .single();

    if (error) {
      // 23505 = o índice único de `movimentacao_id`: essa movimentação já
      // está conciliada com outra linha. A régua do motor, aplicada no banco.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Esta movimentação já está conciliada com outra linha do extrato." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!linha) {
      return NextResponse.json(
        { error: "Esta linha do extrato já está conciliada — desfaça antes de trocar o par." },
        { status: 409 },
      );
    }

    return NextResponse.json({ linha });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
