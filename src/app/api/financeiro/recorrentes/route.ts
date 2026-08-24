import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../lib/webhook-dispatcher";
import { recorrenteNovaPrecisaDeAprovacao } from "../../../../lib/alcada";
import { perfisDe } from "../../../../lib/permissoes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: recurring, error } = await supabase
      .from("despesas_recorrentes")
      .select(`
        *,
        categoria:categorias_financeiras (nome, cor, icone)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recurring });
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
    const {
      descricao, valor, categoria_id, fornecedor, frequencia,
      dia_vencimento, forma_pagamento, observacoes
    } = body;

    if (!descricao || !valor || !frequencia || !dia_vencimento) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    // Calculate initial next generation date
    const today = new Date();
    let nextGen = new Date(today.getFullYear(), today.getMonth(), dia_vencimento);
    if (nextGen < today) {
      nextGen.setMonth(nextGen.getMonth() + 1); // Set for next month if already passed
    }

    // Cadastro de recorrente é decisão de gasto — a mais pesada do módulo,
    // porque compromete caixa todo mês sem nenhuma conta existir ainda. Vai
    // ao Gestor pela mesma régua do agendamento. A GERAÇÃO mensal segue
    // passando direto: o compromisso já foi assumido aqui.
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    const sobeParaAprovacao = recorrenteNovaPrecisaDeAprovacao(perfisDe(perfil));

    const { data: inserted, error } = await supabase
      .from("despesas_recorrentes")
      .insert({
        aprovacao_status: sobeParaAprovacao ? "aguardando" : "aprovada",
        descricao,
        valor: parseFloat(valor),
        categoria_id: categoria_id || null,
        fornecedor: fornecedor || null,
        frequencia,
        dia_vencimento: parseInt(dia_vencimento),
        forma_pagamento: forma_pagamento || null,
        proxima_geracao: nextGen.toISOString().split("T")[0],
        observacoes: observacoes || null,
        created_by: user.id
      })
      .select(`
        *,
        categoria:categorias_financeiras (nome, icone)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Um evento OU o outro, nunca os dois: dois avisos pela mesma recorrente
    // viram ruído no WhatsApp de quem aprova.
    const evento = sobeParaAprovacao ? "recorrente_aguardando_aprovacao" : "recorrente_criada";
    await dispatchAdminWebhook(evento, inserted).catch((err) =>
      console.error(`[WebhookDispatcher] Failed to dispatch ${evento}:`, err.message)
    );

    return NextResponse.json({ recurring: inserted, aguardandoAprovacao: sobeParaAprovacao });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
