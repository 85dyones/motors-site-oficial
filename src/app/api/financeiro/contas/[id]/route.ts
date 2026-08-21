import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../lib/webhook-dispatcher";
import { ALCADA_DO_FINANCEIRO, podeDecidirAprovacao } from "../../../../../lib/alcada";
import { perfisDe } from "../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    
    const { data: conta, error } = await supabase
      .from("contas")
      .select(`
        *,
        categoria:categorias_financeiras (nome, cor, icone)
      `)
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ conta });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
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

    const body = await request.json();

    // Whitelist fields to update
    const updateData: any = {};
    const allowedFields = [
      "descricao", "valor", "data_vencimento", "data_pagamento", "status",
      "categoria_id", "veiculo_id", "fornecedor", "cliente", "forma_pagamento",
      "observacoes", "comprovante_url"
    ];

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    updateData.updated_at = new Date().toISOString();

    // A alçada da A17 vale na edição também, senão editar seria a porta de
    // evasão: lançar R$ 1.000 (passa) e subir para R$ 9.000 depois. Para quem
    // não é Admin:
    //   1. conta aguardando aprovação não muda de status por aqui — a decisão
    //      é de /contas/[id]/aprovar, com trilha;
    //   2. AUMENTO de valor que fica acima da alçada volta para aprovação.
    //      Só o aumento: mexer na descrição de uma conta antiga que já era
    //      grande não pode mandá-la de castigo.
    let voltouParaAprovacao = false;
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    if (!podeDecidirAprovacao(perfisDe(perfil))) {
      const { data: atual } = await supabase
        .from("contas")
        .select("status, tipo, valor")
        .eq("id", id)
        .single();

      if (atual?.status === "aguardando_aprovacao") {
        delete updateData.status;
      } else if (
        atual &&
        atual.tipo === "pagar" &&
        ["pendente", "vencido", "parcial"].includes(atual.status) &&
        updateData.valor !== undefined
      ) {
        const valorNovo = parseFloat(updateData.valor);
        const valorAtual = parseFloat(atual.valor);
        if (
          Number.isFinite(valorNovo) &&
          valorNovo > ALCADA_DO_FINANCEIRO &&
          valorNovo > valorAtual
        ) {
          updateData.status = "aguardando_aprovacao";
          voltouParaAprovacao = true;
        }
      }
    }

    const { data: updated, error } = await supabase
      .from("contas")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        categoria:categorias_financeiras (nome, icone)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Se o aumento devolveu a conta para aprovação, o evento certo é o do
    // briefing ("conta subiu pra aprovação"), não o de edição comum.
    const evento = voltouParaAprovacao ? "conta_aguardando_aprovacao" : "conta_atualizada";
    await dispatchAdminWebhook(evento, updated).catch((err) =>
      console.error("[WebhookDispatch] Failed to dispatch account updated event:", err.message)
    );

    return NextResponse.json({ conta: updated, aguardandoAprovacao: voltouParaAprovacao });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
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

    const { error } = await supabase
      .from("contas")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await dispatchAdminWebhook("conta_deletada", { id }).catch((err) =>
      console.error("[WebhookDispatch] Failed to dispatch account deleted event:", err.message)
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
