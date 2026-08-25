import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../lib/webhook-dispatcher";
import {
  ehAgendamento,
  podeDecidirAprovacao,
  podeExcluirLancamento,
} from "../../../../../lib/alcada";
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

    // A aprovação vale na edição também, senão editar seria a porta de
    // evasão: registrar como paga (passa direto) e reabrir como agendamento
    // depois. São duas regras, e elas alcançam gente diferente.
    let voltouParaAprovacao = false;
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    const { data: atual } = await supabase
      .from("contas")
      .select("status, tipo")
      .eq("id", id)
      .single();

    // -----------------------------------------------------------------
    // 1. Conta parada na fila não muda de status por edição
    // -----------------------------------------------------------------
    // A decisão é de `/contas/[id]/aprovar`, que grava quem decidiu e quando.
    //
    // A exceção é DESISTIR. Cancelar é o botão que a tela oferece a uma conta
    // na fila (`ContasList`: some só quando a conta está paga ou já
    // cancelada), e cancelar não é aprovar — é retirar o pedido antes de
    // alguém decidir. Aqui a rota fazia `delete updateData.status`: o UPDATE
    // gravava só o `updated_at`, voltava 200, a tela dizia "Lançamento
    // cancelado — o registro fica no histórico" e o refresh mostrava a conta
    // ainda aguardando aprovação. Escrita que reporta sucesso sem escrever é
    // exatamente o defeito que o código ao redor documenta em três lugares.
    //
    // O que não é cancelar agora recebe 409 dizendo por quê, em vez de um 200
    // que mente.
    if (atual?.status === "aguardando_aprovacao" && !podeDecidirAprovacao(perfisDe(perfil))) {
      const novoStatus = updateData.status;
      const mudaDeStatus = novoStatus !== undefined && novoStatus !== atual.status;

      if (mudaDeStatus && novoStatus !== "cancelado") {
        return NextResponse.json(
          {
            error:
              "Esta conta está aguardando aprovação: o status é decidido em Aprovações, não pela edição. Para desistir do lançamento, cancele-o.",
          },
          { status: 409 },
        );
      }
    }

    // -----------------------------------------------------------------
    // 2. Edição que TRANSFORMA um registro liquidado em agendamento
    // -----------------------------------------------------------------
    // Volta para a fila — de quem quer que seja. Editar descrição ou
    // vencimento de um agendamento que já estava aprovado não mexe em nada:
    // ele já passou pelo Gestor.
    //
    // Esta regra morava dentro de `if (!podeDecidirAprovacao(...))`, que é a
    // régua que `precisaDeAprovacao` abandonou em 2026-08-24 — *"o dono é
    // admin, admin aprova, então TODO lançamento dele pulava a fila"*. Aqui o
    // efeito era pior do que pular a fila: o admin lançava `pago`
    // (escrituração, passa direto), depois fazia PUT `{status:'pendente'}`, e
    // a conta virava pagamento agendado ATIVO com `aprovacao_decidida_por` e
    // `aprovacao_decidida_em` nulos — indistinguível, no razão, de um que
    // ninguém revisou. É a porta de evasão que este bloco existe para fechar.
    if (
      atual &&
      !ehAgendamento(atual.tipo, atual.status) &&
      ehAgendamento(updateData.tipo ?? atual.tipo, updateData.status ?? atual.status)
    ) {
      updateData.status = "aguardando_aprovacao";
      voltouParaAprovacao = true;
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

    // Se a edição transformou o registro em agendamento, o evento certo é o
    // do briefing ("conta subiu pra aprovação"), não o de edição comum.
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

    // Separação de funções (2026-08-21): quem aprova agendamento não apaga a
    // prova do que aprovou. Os demais cancelam — `status = 'cancelado'`
    // preserva a linha e o rastro. A RLS também recusa (20260821210000); esta
    // checagem existe para o erro sair legível em vez de "0 linhas afetadas".
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    if (!podeExcluirLancamento(perfisDe(perfil))) {
      return NextResponse.json(
        { error: "Apenas o administrador exclui lançamento — cancele a conta para manter o registro." },
        { status: 403 }
      );
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
