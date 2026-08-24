import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../../lib/webhook-dispatcher";
import { podeDecidirAprovacao } from "../../../../../../lib/alcada";
import { perfisDe } from "../../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * Decide um agendamento financeiro parado na fila — POST { decisao, motivo? }.
 *
 * Quem decide é quem a matriz A17 diz na linha "Aprovar agendamento
 * financeiro": Admin e Gestor. A decisão vale para o LANÇAMENTO inteiro — se
 * a conta nasceu parcelada, todas as parcelas do `grupo_parcela` mudam juntas;
 * aprovar a parcela 1 e deixar as outras aguardando não é um estado que exista
 * no mundo.
 *
 * Aprovar → `pendente` (a conta entra no fluxo normal e no dia). Recusar →
 * `cancelado`, com motivo obrigatório: recusa sem motivo é conversa de
 * corredor, e a trilha existe para o gerente saber o porquê sem perguntar.
 * Quem carimba o instante é o trigger da migração; o QUEM vem daqui.
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

    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    if (!podeDecidirAprovacao(perfisDe(perfil))) {
      return NextResponse.json(
        { error: "Apenas administrador ou gestor decide agendamento financeiro" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const decisao = body.decisao;
    const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";

    if (decisao !== "aprovar" && decisao !== "recusar") {
      return NextResponse.json({ error: "Decisão deve ser 'aprovar' ou 'recusar'" }, { status: 400 });
    }
    if (decisao === "recusar" && !motivo) {
      return NextResponse.json({ error: "Recusa exige motivo" }, { status: 400 });
    }

    const { data: conta, error: fetchError } = await supabase
      .from("contas")
      .select("id, status, grupo_parcela")
      .eq("id", id)
      .single();

    if (fetchError || !conta) {
      return NextResponse.json({ error: fetchError?.message || "Conta não encontrada" }, { status: 404 });
    }
    if (conta.status !== "aguardando_aprovacao") {
      return NextResponse.json(
        { error: "Este lançamento não está aguardando aprovação" },
        { status: 409 }
      );
    }

    let query = supabase
      .from("contas")
      .update({
        status: decisao === "aprovar" ? "pendente" : "cancelado",
        aprovacao_decidida_por: user.id,
        aprovacao_decidida_em: new Date().toISOString(),
        aprovacao_motivo: motivo || null,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "aguardando_aprovacao");

    query = conta.grupo_parcela
      ? query.eq("grupo_parcela", conta.grupo_parcela)
      : query.eq("id", id);

    const { data: decididas, error } = await query.select(`
      *,
      categoria:categorias_financeiras (nome, icone)
    `);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const evento = decisao === "aprovar" ? "conta_aprovada" : "conta_recusada";
    await Promise.all(
      (decididas ?? []).map((c) =>
        dispatchAdminWebhook(evento, c).catch((err) =>
          console.error("[WebhookDispatch] Failed to dispatch approval decision event:", err.message)
        )
      )
    );

    return NextResponse.json({ contas: decididas, decisao });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
