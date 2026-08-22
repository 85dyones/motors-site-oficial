import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../../lib/webhook-dispatcher";

export const dynamic = "force-dynamic";

/**
 * Lança no caixa o que o banco mostrou e o sistema não tinha —
 * POST { categoria_id, descricao?, parceiro?, veiculo_id? }
 *
 * Fecha o ciclo da conciliação. Antes disto, "no banco e fora do sistema" era
 * um achado que a pessoa levava para outra tela e redigitava valor, data e
 * descrição — três chances de errar, e o achado seguia aberto até ela voltar
 * e conciliar à mão.
 *
 * ---------------------------------------------------------------------------
 * O que este gesto cria, e por que nesta ordem
 * ---------------------------------------------------------------------------
 * 1. uma `conta` já **paga** — o dinheiro saiu ou entrou, o extrato é a prova;
 * 2. a `movimentacao` correspondente, que é o caixa de verdade;
 * 3. o vínculo da linha do extrato com essa movimentação.
 *
 * O passo 3 é o que impede o achado de reaparecer amanhã. Se ele falhar, os
 * dois primeiros são desfeitos — meia conciliação deixaria uma conta paga
 * duplicando o que a próxima importação lançaria de novo.
 *
 * ---------------------------------------------------------------------------
 * Categoria é obrigatória aqui, e só aqui
 * ---------------------------------------------------------------------------
 * `contas.categoria_id` é nulo em todo o resto do módulo, e continua sendo.
 * Mas este é o único caminho em que o lançamento nasce de uma EVIDÊNCIA e não
 * da intenção de alguém: valor, data e descrição vêm prontos do banco, e a
 * classificação é a única coisa que uma pessoa acrescenta. Sem ela o gesto
 * produziria uma linha com número e sem significado — exatamente o que faz o
 * DRE virar uma pilha de "Outros", que é o problema que o relatório existe
 * para não ter.
 *
 * ---------------------------------------------------------------------------
 * Não passa por aprovação, e está certo
 * ---------------------------------------------------------------------------
 * É registro retroativo: o dinheiro já se moveu, o banco atesta. Mandar à
 * fila do Gestor pediria que ele aprovasse um fato consumado. É a mesma razão
 * pela qual lançar conta já paga passa direto (ver `lib/alcada.ts`).
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
    const categoriaId = typeof body.categoria_id === "string" ? body.categoria_id.trim() : "";
    if (!categoriaId) {
      return NextResponse.json(
        { error: "Escolha a categoria — é ela que dá significado ao lançamento no DRE." },
        { status: 400 },
      );
    }

    const { data: linha, error: erroLinha } = await supabase
      .from("extrato_bancario")
      .select("*")
      .eq("id", id)
      .single();

    if (erroLinha || !linha) {
      return NextResponse.json(
        { error: erroLinha?.message || "Linha do extrato não encontrada" },
        { status: 404 },
      );
    }
    if (linha.movimentacao_id) {
      return NextResponse.json(
        { error: "Esta linha já está conciliada — não há o que lançar." },
        { status: 409 },
      );
    }

    const ehEntrada = linha.tipo === "entrada";
    const descricao =
      (typeof body.descricao === "string" && body.descricao.trim()) || linha.descricao;
    const parceiro = typeof body.parceiro === "string" ? body.parceiro.trim() : "";
    const veiculoId = typeof body.veiculo_id === "string" && body.veiculo_id.trim()
      ? body.veiculo_id.trim()
      : null;

    // 1. A conta, já liquidada. `data_emissao`, `data_vencimento` e
    // `data_pagamento` são todas a data do extrato: não há o que inventar —
    // o único fato conhecido é o dia em que o dinheiro se moveu.
    const { data: conta, error: erroConta } = await supabase
      .from("contas")
      .insert({
        tipo: ehEntrada ? "receber" : "pagar",
        descricao,
        valor: linha.valor,
        data_emissao: linha.data,
        data_vencimento: linha.data,
        data_pagamento: linha.data,
        status: "pago",
        categoria_id: categoriaId,
        veiculo_id: veiculoId,
        fornecedor: !ehEntrada ? parceiro || null : null,
        cliente: ehEntrada ? parceiro || null : null,
        observacoes: `Lançado a partir do extrato bancário (${linha.conta}) em ${linha.data}.`,
        created_by: user.id,
      })
      .select(`*, categoria:categorias_financeiras (nome, icone)`)
      .single();

    if (erroConta) {
      return NextResponse.json({ error: erroConta.message }, { status: 500 });
    }

    // 2. O caixa. É esta linha que a conciliação enxerga — a `conta` sozinha
    // não aparece em `movimentacoes` e o achado continuaria aberto.
    const { data: movimentacao, error: erroMov } = await supabase
      .from("movimentacoes")
      .insert({
        conta_id: conta.id,
        tipo: linha.tipo,
        valor: linha.valor,
        descricao: `Extrato: ${descricao}`,
        data_movimentacao: linha.data,
        created_by: user.id,
      })
      .select()
      .single();

    if (erroMov) {
      // Sem a movimentação o gesto não serviu para nada: desfaz a conta em
      // vez de deixar meia conciliação de pé.
      await supabase.from("contas").delete().eq("id", conta.id);
      return NextResponse.json({ error: erroMov.message }, { status: 500 });
    }

    // 3. O vínculo — o passo que impede o achado de reaparecer amanhã.
    const { error: erroVinculo } = await supabase
      .from("extrato_bancario")
      .update({
        movimentacao_id: movimentacao.id,
        conciliado_em: new Date().toISOString(),
        conciliado_por: user.id,
        conciliado_como: "manual",
      })
      .eq("id", id)
      .is("movimentacao_id", null);

    if (erroVinculo) {
      await supabase.from("movimentacoes").delete().eq("id", movimentacao.id);
      await supabase.from("contas").delete().eq("id", conta.id);
      return NextResponse.json({ error: erroVinculo.message }, { status: 500 });
    }

    await dispatchAdminWebhook("conta_criada", conta).catch((err) =>
      console.error("[WebhookDispatch] Failed to dispatch account created event:", err.message),
    );

    return NextResponse.json({ conta, movimentacao });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
