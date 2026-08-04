import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // 1. Load webhook settings from database to check for apiSecretToken
    const { data: webhooksRow } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", "webhooks")
      .maybeSingle();

    const dbSecretToken = webhooksRow?.data?.apiSecretToken;
    const secretToken = dbSecretToken || process.env.N8N_SECRET_TOKEN;

    const authHeader = request.headers.get("Authorization");

    // Only validate if a secret token is actually registered in database or process.env
    if (secretToken && secretToken.trim() !== "") {
      if (authHeader !== `Bearer ${secretToken.trim()}`) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");

    if (!query) {
      return NextResponse.json({ error: "O parâmetro 'query' é obrigatório." }, { status: 400 });
    }

    // 2. Search for the vehicle in the database
    //
    // NÃO existe busca por placa. A coluna `placa` não existe em
    // `estoque_motors` (baseline verificado contra produção, 2026-08-03) e o
    // sync do RevendaMais não tem de onde populá-la — não há campo de placa no
    // XML. A tentativa anterior (`.ilike("placa", ...)` como busca primária)
    // falhava com "column estoque_motors.placa does not exist", tinha o `error`
    // descartado, e caía neste mesmo fallback por ID. Ou seja: a busca por
    // placa nunca funcionou; só custava um round-trip inútil por consulta.
    // Decisão do dono em 2026-08-03: remover a busca em vez de criar a coluna.

    // Search by exact ID
    const isNumeric = /^\d+$/.test(query.trim());
    let idQuery = supabase.from("estoque_motors").select("*");
    if (isNumeric) {
      idQuery = idQuery.eq("id", parseInt(query.trim(), 10));
    } else {
      idQuery = idQuery.eq("id", query.trim());
    }
    let { data: veiculo } = await idQuery.limit(1).maybeSingle();

    // Fallback: search by model or brand similarity
    if (!veiculo) {
      const { data: likeData } = await supabase
        .from("estoque_motors")
        .select("*")
        .or(`modelo.ilike.%${query.trim()}%,marca.ilike.%${query.trim()}%`)
        .limit(1)
        .maybeSingle();
      veiculo = likeData;
    }

    if (!veiculo) {
      return NextResponse.json({
        sucesso: false,
        mensagem: `❌ Veículo não encontrado para a busca: "${query}"`
      }, { status: 404 });
    }

    // 3. Fetch all accounts (excluding cancelled ones) linked to the vehicle
    const { data: contas } = await supabase
      .from("contas")
      .select("*, categoria:categorias_financeiras(*)")
      .eq("veiculo_id", String(veiculo.id))
      .neq("status", "cancelado");

    // 4. Fetch all purchases (excluding cancelled ones) linked to the vehicle
    const { data: compras } = await supabase
      .from("compras_produtos")
      .select("*")
      .eq("veiculo_id", String(veiculo.id))
      .neq("status", "cancelado");

    // 5. Perform Margin Calculations
    const contasIds = new Set((contas || []).map((c) => c.id));
    const comprasSemConta = (compras || []).filter((cp) => !cp.conta_id || !contasIds.has(cp.conta_id));

    // Identify entry price (Compra de Veículo (Estoque))
    const comprasDeVeiculoContas = (contas || []).filter(
      (c) =>
        c.tipo === "pagar" &&
        (c.categoria?.nome === "Compra de Veículo (Estoque)" || c.categoria?.icone === "🔑")
    );
    const comprasDeVeiculoProd = comprasSemConta.filter(
      (cp) =>
        cp.categoria === "compra_veiculo" ||
        cp.descricao?.toLowerCase().includes("compra de veiculo") ||
        cp.descricao?.toLowerCase().includes("compra de veículo")
    );

    const sumContasCompra = comprasDeVeiculoContas.reduce((sum, c) => sum + parseFloat(c.valor), 0);
    const sumProdCompra = comprasDeVeiculoProd.reduce((sum, cp) => sum + parseFloat(cp.valor_total), 0);
    
    // Explicit manual input overrides transaction records if set
    const precoEntrada = veiculo.preco_compra > 0 
      ? Number(veiculo.preco_compra)
      : (sumContasCompra + sumProdCompra);

    if (precoEntrada <= 0) {
      const warningMessage = `⚠️ *Atenção:* O veículo *${veiculo.marca.toUpperCase()} ${veiculo.modelo.toUpperCase()}* (ID ${veiculo.id}) não possui um valor de entrada (preço de compra) cadastrado.\n\nPara obter a margem correta, acesse o painel administrativo em Configurações e ajuste o valor de entrada deste veículo.`;
      return NextResponse.json({
        sucesso: false,
        veiculo: {
          id: veiculo.id,
          marca: veiculo.marca,
          modelo: veiculo.modelo
        },
        mensagem: warningMessage
      });
    }

    // Identify preparation expenses (all other despesas excluding the purchase of the vehicle itself)
    const prepContas = (contas || []).filter(
      (c) =>
        c.tipo === "pagar" &&
        c.categoria?.nome !== "Compra de Veículo (Estoque)" &&
        c.categoria?.icone !== "🔑"
    );
    const prepProd = comprasSemConta.filter(
      (cp) =>
        cp.categoria !== "compra_veiculo" &&
        !cp.descricao?.toLowerCase().includes("compra de veiculo") &&
        !cp.descricao?.toLowerCase().includes("compra de veículo")
    );

    const despesasPreparacao = 
      prepContas.reduce((sum, c) => sum + parseFloat(c.valor), 0) +
      prepProd.reduce((sum, cp) => sum + parseFloat(cp.valor_total), 0);

    // Total accumulated expenses
    const totalDespesas = precoEntrada + despesasPreparacao;

    // Revenue faturada
    const receitasRealizadas = (contas || [])
      .filter((c) => c.tipo === "receber")
      .reduce((sum, c) => sum + parseFloat(c.valor), 0);

    // Determine current sale price: promo price if active, otherwise original price
    const precoVendaEstoque =
      veiculo.preco_promocional > 0
        ? veiculo.preco_promocional
        : (veiculo.preco_original || veiculo.preco || 0);

    // Sold status
    const isVendido =
      !!veiculo.vendido ||
      (contas || []).some(
        (c) =>
          c.tipo === "receber" &&
          (c.categoria?.nome === "Venda de Veículo" || c.categoria?.icone === "🚗")
      );

    const precoVendaFinal = isVendido && receitasRealizadas > 0 ? receitasRealizadas : precoVendaEstoque;

    const lucro = precoVendaFinal - totalDespesas;
    const margemPercentual = precoVendaFinal > 0 ? (lucro / precoVendaFinal) * 100 : 0;

    // 6. Build the formatted WhatsApp message
    const statusStr = isVendido ? "🔴 VENDIDO" : "🟢 DISPONÍVEL NO ESTOQUE";
    const formatCurrency = (val: number) =>
      val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const msgLines = [
      `📊 *FICHA DE MARGEM COMERCIAL*`,
      `━━━━━━━━━━━━━━━━━━`,
      `🚗 *Veículo:* ${veiculo.marca.toUpperCase()} ${veiculo.modelo.toUpperCase()}`,
      `⚙️ *Versão:* ${veiculo.versao || "Padrão"}`,
      `📅 *Ano:* ${veiculo.ano} | 🏷️ *ID:* ${veiculo.id}`,
      `📌 *Status:* ${statusStr}`,
      `━━━━━━━━━━━━━━━━━━`,
      `💰 *Preço de Entrada:* ${precoEntrada > 0 ? formatCurrency(precoEntrada) : "_Não cadastrado_"}`,
      `🔧 *Gastos de Preparação:* ${formatCurrency(despesasPreparacao)}`,
      `💸 *Custo Total Acumulado:* ${formatCurrency(totalDespesas)}`,
      `━━━━━━━━━━━━━━━━━━`,
      isVendido
        ? `🤝 *Valor de Venda Realizada:* ${formatCurrency(precoVendaFinal)}`
        : `💵 *Preço de Venda (Patio):* ${formatCurrency(precoVendaFinal)}`,
      `━━━━━━━━━━━━━━━━━━`,
      `📈 *Resultado Comercial:*`,
      `*Lucro ${isVendido ? "Real" : "Projetado"}:* ${formatCurrency(lucro)}`,
      `*Margem ${isVendido ? "Real" : "Estimada"}:* ${margemPercentual.toFixed(2)}%`,
    ];

    const mensagem = msgLines.join("\n");

    return NextResponse.json({
      sucesso: true,
      veiculo: {
        id: veiculo.id,
        marca: veiculo.marca,
        modelo: veiculo.modelo,
        versao: veiculo.versao,
        ano: veiculo.ano,
        vendido: isVendido
      },
      financeiro: {
        preco_entrada: precoEntrada,
        despesas_preparacao: despesasPreparacao,
        despesas_totais: totalDespesas,
        preco_venda_considerado: precoVendaFinal,
        lucro,
        margem_percentual: margemPercentual
      },
      mensagem
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
