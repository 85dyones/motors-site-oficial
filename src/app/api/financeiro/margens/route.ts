import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const veiculoId = searchParams.get("veiculo_id");

    if (veiculoId) {
      // Fetch specific vehicle details
      const { data: veiculo } = await supabase
        .from("veiculos")
        .select("*")
        .eq("id", veiculoId)
        .single();

      // Fetch all accounts linked to this vehicle
      const { data: contas, error: contasError } = await supabase
        .from("contas")
        .select("*, categoria:categorias_financeiras(*)")
        .eq("veiculo_id", veiculoId)
        .neq("status", "cancelado");

      // Fetch all purchases linked to this vehicle
      const { data: compras, error: comprasError } = await supabase
        .from("compras_produtos")
        .select("*")
        .eq("veiculo_id", veiculoId)
        .neq("status", "cancelado");

      if (contasError || comprasError) {
        return NextResponse.json({ error: "Erro ao buscar dados financeiros." }, { status: 500 });
      }

      return NextResponse.json({
        veiculo,
        contas: contas || [],
        compras: compras || []
      });
    } else {
      // Fetch all vehicles with transactions
      // 1. Fetch all vehicles to map details
      const { data: veiculos } = await supabase
        .from("veiculos")
        .select("id, marca, modelo, versao, ano, preco");

      // 2. Fetch all accounts linked to any vehicle
      const { data: contas } = await supabase
        .from("contas")
        .select("*, categoria:categorias_financeiras(*)")
        .not("veiculo_id", "is", null)
        .neq("status", "cancelado");

      // 3. Fetch all purchases linked to any vehicle
      const { data: compras } = await supabase
        .from("compras_produtos")
        .select("*")
        .not("veiculo_id", "is", null)
        .neq("status", "cancelado");

      const mapVehicles = new Map<string, any>();
      (veiculos || []).forEach(v => {
        mapVehicles.set(v.id, v);
      });

      // Group by vehicle_id
      const vehicleSummaries: Record<string, {
        veiculo_id: string;
        marca: string;
        modelo: string;
        versao: string;
        ano: number;
        receitas: number;
        despesas: number;
        lucro: number;
        margem: number;
        transacoesCount: number;
      }> = {};

      const getOrCreate = (vid: string) => {
        if (!vehicleSummaries[vid]) {
          const v = mapVehicles.get(vid);
          vehicleSummaries[vid] = {
            veiculo_id: vid,
            marca: v?.marca || "Desconhecido",
            modelo: v?.modelo || `Ref: ${vid}`,
            versao: v?.versao || "",
            ano: v?.ano || 0,
            receitas: 0,
            despesas: 0,
            lucro: 0,
            margem: 0,
            transacoesCount: 0
          };
        }
        return vehicleSummaries[vid];
      };

      // Add contas transactions
      (contas || []).forEach(c => {
        if (!c.veiculo_id) return;
        const summary = getOrCreate(c.veiculo_id);
        const val = parseFloat(c.valor);
        if (c.tipo === "receber") {
          summary.receitas += val;
        } else {
          summary.despesas += val;
        }
        summary.transacoesCount++;
      });

      // Add compras transactions (avoiding double-counting)
      const contasIds = new Set((contas || []).map(c => c.id));
      (compras || []).forEach(cp => {
        if (!cp.veiculo_id) return;
        const summary = getOrCreate(cp.veiculo_id);
        const val = parseFloat(cp.valor_total);
        
        if (!cp.conta_id || !contasIds.has(cp.conta_id)) {
          summary.despesas += val;
          summary.transacoesCount++;
        }
      });

      // Calculate lucro and margem
      const resultList = Object.values(vehicleSummaries).map(s => {
        s.lucro = s.receitas - s.despesas;
        s.margem = s.receitas > 0 ? (s.lucro / s.receitas) * 100 : 0;
        return s;
      });

      return NextResponse.json({ vehicles: resultList });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
