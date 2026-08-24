import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../lib/webhook-dispatcher";
import { precisaDeAprovacao } from "../../../../lib/alcada";
import { perfisDe } from "../../../../lib/permissoes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    const tipo = searchParams.get("tipo"); // pagar | receber
    const status = searchParams.get("status"); // pendente | pago | vencido | cancelado
    const categoriaId = searchParams.get("categoria_id");
    const veiculoId = searchParams.get("veiculo_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const search = searchParams.get("search");

    // ------------------------------------------------------------------
    // Paginação e ordem — acrescentadas em 2026-08-24, e é opt-in
    // ------------------------------------------------------------------
    // Uma conta lançada em produção "sumiu": estava na posição 709 de uma
    // lista sem paginação, ordenada do vencimento MAIS ANTIGO para o mais
    // novo. A tela abria em julho e o lançamento de hoje ficava setecentas
    // linhas abaixo. Ninguém rolaria até lá, e a tela não dava pista nenhuma
    // de que havia mais — some por omissão, que é o mesmo modo de falha que
    // o DELETE recusado pela RLS e o rollback que não desfazia.
    //
    // `limite` é OPT-IN de propósito. `FinanceRelatorios` chama esta rota
    // para AGREGAR o balanço; um limite padrão faria o relatório somar em
    // cima de um recorte e apresentar o resultado como se fosse o total —
    // exatamente o defeito que esta mudança existe para eliminar. Quem não
    // pede página continua recebendo tudo.
    //
    // `total` volta SEMPRE, com ou sem paginação: é o que permite a tela
    // dizer "50 de 709" em vez de deixar o usuário adivinhar.
    const ordem = searchParams.get("ordem") === "desc" ? false : true;
    const limiteBruto = parseInt(searchParams.get("limite") ?? "", 10);
    const limite = Number.isFinite(limiteBruto) && limiteBruto > 0
      ? Math.min(limiteBruto, 200)
      : null;
    const paginaBruta = parseInt(searchParams.get("pagina") ?? "", 10);
    const pagina = Number.isFinite(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1;

    let query = supabase
      .from("contas")
      .select(`
        *,
        categoria:categorias_financeiras (nome, cor, icone)
      `, { count: "exact" });

    // Apply filters
    if (tipo) query = query.eq("tipo", tipo);
    // `status` aceita lista separada por vírgula: a tela abre em "em aberto",
    // que são três estados (pendente, vencido, aguardando_aprovacao). Sem
    // isso, "o que eu devo" exigiria três consultas ou nenhum filtro.
    if (status) {
      const estados = status.split(",").map((e) => e.trim()).filter(Boolean);
      query = estados.length > 1 ? query.in("status", estados) : query.eq("status", estados[0]);
    }
    if (categoriaId) query = query.eq("categoria_id", categoriaId);
    if (veiculoId) query = query.eq("veiculo_id", veiculoId);
    if (startDate) query = query.gte("data_vencimento", startDate);
    if (endDate) query = query.lte("data_vencimento", endDate);
    if (search) {
      query = query.or(`descricao.ilike.%${search}%,fornecedor.ilike.%${search}%,cliente.ilike.%${search}%`);
    }

    query = query.order("data_vencimento", { ascending: ordem });
    if (limite !== null) {
      const inicio = (pagina - 1) * limite;
      query = query.range(inicio, inicio + limite - 1);
    }

    const { data: contas, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // `total` é o que a tela usa para dizer "50 de 709". Sem ele, uma lista
    // paginada é indistinguível de uma lista completa — e a pessoa acredita
    // que viu tudo.
    return NextResponse.json({
      contas,
      total: count ?? (contas?.length ?? 0),
      pagina: limite !== null ? pagina : 1,
      limite,
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
    const {
      tipo,
      descricao,
      valor,
      data_vencimento,
      status,
      categoria_id,
      veiculo_id,
      fornecedor,
      cliente,
      forma_pagamento,
      total_parcelas,
      observacoes,
      recorrencia_id
    } = body;

    if (!tipo || !descricao || !valor || !data_vencimento) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    // Aprovação de agendamento (A17, "Aprovar agendamento financeiro"):
    // agendar pagamento é decidir que dinheiro vai sair, e vai ao Gestor;
    // registrar o que já foi pago é escrituração e passa direto. Não há
    // limite em reais desde 2026-08-21 — ver o cabeçalho de `lib/alcada.ts`.
    // Quando sobe, TODAS as parcelas nascem aguardando: o Gestor decide o
    // grupo de uma vez em /contas/[id]/aprovar.
    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    const statusPedido = status || "pendente";
    const sobeParaAprovacao = precisaDeAprovacao({
      tipo,
      status: statusPedido,
      perfis: perfisDe(perfil),
    });
    const statusFinal = sobeParaAprovacao ? "aguardando_aprovacao" : statusPedido;

    const numInstallments = parseInt(total_parcelas) || 1;
    const groupUuid = crypto.randomUUID();
    const accountsToInsert = [];

    const baseDate = new Date(data_vencimento + "T12:00:00"); // Avoid timezone shift

    for (let i = 1; i <= numInstallments; i++) {
      const vencimentoDate = new Date(baseDate);
      vencimentoDate.setMonth(vencimentoDate.getMonth() + (i - 1));

      accountsToInsert.push({
        tipo,
        descricao: numInstallments > 1 ? `${descricao} (${i}/${numInstallments})` : descricao,
        valor: parseFloat((valor / numInstallments).toFixed(2)),
        data_emissao: new Date().toISOString().split("T")[0],
        data_vencimento: vencimentoDate.toISOString().split("T")[0],
        status: statusFinal,
        categoria_id: categoria_id || null,
        veiculo_id: veiculo_id || null,
        fornecedor: fornecedor || null,
        cliente: cliente || null,
        forma_pagamento: forma_pagamento || null,
        parcela_atual: i,
        total_parcelas: numInstallments,
        grupo_parcela: numInstallments > 1 ? groupUuid : null,
        recorrencia_id: recorrencia_id || null,
        observacoes: observacoes || null,
        created_by: user.id
      });
    }

    const { data: inserted, error } = await supabase
      .from("contas")
      .insert(accountsToInsert)
      .select(`
        *,
        categoria:categorias_financeiras (nome, icone)
      `);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Dispatch admin webhook for newly created accounts. Agendamento que sobe
    // emite `conta_aguardando_aprovacao` no lugar de `conta_criada` — é o
    // aviso "conta subiu pra aprovação" do briefing, e dois eventos pela
    // mesma conta virariam ruído no WhatsApp de quem aprova.
    if (inserted && inserted.length > 0) {
      const evento = sobeParaAprovacao ? "conta_aguardando_aprovacao" : "conta_criada";
      await Promise.all(
        inserted.map((c) =>
          dispatchAdminWebhook(evento, c).catch((err) =>
            console.error("[WebhookDispatch] Failed to dispatch account created event:", err.message)
          )
        )
      );
    }

    return NextResponse.json({ contas: inserted, aguardandoAprovacao: sobeParaAprovacao });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
