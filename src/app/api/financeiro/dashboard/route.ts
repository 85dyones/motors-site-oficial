import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    // 1. Fetch current month bills
    const { data: currentMonthBills } = await supabase
      .from("contas")
      .select("tipo, valor, status, data_vencimento")
      .gte("data_vencimento", startOfMonth)
      .lte("data_vencimento", endOfMonth);

    let aPagarMes = 0;
    let aReceberMes = 0;

    currentMonthBills?.forEach((b) => {
      const val = parseFloat(b.valor);
      if (b.status === "pendente" || b.status === "vencido") {
        if (b.tipo === "pagar") aPagarMes += val;
        else if (b.tipo === "receber") aReceberMes += val;
      }
    });

    // 2. Count overdue accounts
    const { count: overdueCount } = await supabase
      .from("contas")
      .select("id", { count: "exact", head: true })
      .or("status.eq.vencido,and(status.eq.pendente,data_vencimento.lt." + todayStr + ")");

    // 3. Fetch active fixed costs
    const { data: recurringCosts } = await supabase
      .from("despesas_recorrentes")
      .select("valor")
      .eq("ativa", true);

    const custoFixoMensal = recurringCosts?.reduce((acc, curr) => acc + parseFloat(curr.valor), 0) || 0;

    // 4. Fetch upcoming bills (next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split("T")[0];

    const { data: upcomingBills } = await supabase
      .from("contas")
      .select(`
        *,
        categoria:categorias_financeiras (nome, cor, icone)
      `)
      .eq("status", "pendente")
      .gte("data_vencimento", todayStr)
      .lte("data_vencimento", sevenDaysStr)
      .order("data_vencimento", { ascending: true })
      .limit(5);

    // 5. Fetch overdue bills list
    const { data: overdueBills } = await supabase
      .from("contas")
      .select(`
        *,
        categoria:categorias_financeiras (nome, cor, icone)
      `)
      .or("status.eq.vencido,and(status.eq.pendente,data_vencimento.lt." + todayStr + ")")
      .order("data_vencimento", { ascending: true });

    // 6. Graph data: last 6 months movements aggregation
    const monthlyMovements = [];
    for (let i = 5; i >= 0; i--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(mDate.getFullYear(), mDate.getMonth(), 1).toISOString().split("T")[0];
      const mEnd = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0).toISOString().split("T")[0];
      const monthLabel = mDate.toLocaleString("pt-BR", { month: "short" }).toUpperCase();

      const { data: moves } = await supabase
        .from("movimentacoes")
        .select("tipo, valor")
        .gte("data_movimentacao", mStart)
        .lte("data_movimentacao", mEnd);

      let totalEntradas = 0;
      let totalSaidas = 0;

      moves?.forEach((m) => {
        const val = parseFloat(m.valor);
        if (m.tipo === "entrada") totalEntradas += val;
        else if (m.tipo === "saida") totalSaidas += val;
      });

      monthlyMovements.push({
        label: monthLabel,
        entradas: totalEntradas,
        saidas: totalSaidas,
      });
    }

    return NextResponse.json({
      kpis: {
        aPagarMes,
        aReceberMes,
        saldoProjetado: aReceberMes - aPagarMes,
        overdueCount: overdueCount || 0,
        custoFixoMensal,
      },
      upcomingBills: upcomingBills || [],
      overdueBills: overdueBills || [],
      chartData: monthlyMovements,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
