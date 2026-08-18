import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { getCachedSettings } from "../../../../../lib/settings";
import { tokenConfere } from "../../../../../lib/comparacaoConstante";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. Load webhook settings from database to check for apiSecretToken
    //
    // Via `getCachedSettings` (chave de serviço), não com o cliente da
    // requisição. Quem chama esta rota é o n8n, com `Authorization: Bearer`
    // e SEM cookie de sessão — papel `anon`. Desde
    // `20260812120000_rls_leitura_de_site_settings.sql` o anônimo não lê a
    // linha `webhooks`, e o efeito de continuar lendo por aqui seria o pior
    // possível: `dbSecretToken` viria undefined, cairia no fallback de env e,
    // com `N8N_SECRET_TOKEN` vazio, o `if` abaixo simplesmente não roda —
    // fechar a RLS teria ABERTO a ficha de margem para qualquer um.
    const { webhooks, stockOverrides: overridesSalvos } = await getCachedSettings();

    const dbSecretToken = webhooks?.apiSecretToken;
    const secretToken = (dbSecretToken || process.env.N8N_SECRET_TOKEN || "").trim();

    const authHeader = request.headers.get("Authorization");

    // O token é OBRIGATÓRIO aqui — não "validado quando existe".
    //
    // Até 2026-08-12 a regra era `if (secretToken) { valide }`: com o token
    // vazio dos dois lados, a rota respondia a qualquer um. O que segurava o
    // dado não era esta checagem, era a RLS — `contas` e `compras_produtos`
    // exigem `has_finance_access(auth.uid())` e voltavam vazias para quem não
    // tem sessão. Agora que a consulta usa a chave de serviço (passo 3), essa
    // rede sumiu: sem token, isto seria o balanço da loja aberto na internet.
    //
    // Falha fechada, e com 503 em vez de 401: o problema não é de quem chamou,
    // é de configuração nossa. 401 mandaria o n8n tentar outro token para
    // sempre.
    if (!secretToken) {
      console.error(
        "[Margens/Consulta] Nenhum token configurado (site_settings.webhooks.apiSecretToken " +
          "nem N8N_SECRET_TOKEN). Rota indisponível até configurar."
      );
      return NextResponse.json(
        { error: "Consulta de margem indisponível: token de integração não configurado." },
        { status: 503 }
      );
    }

    // Em tempo constante: `!==` desiste no primeiro caractere diferente e
    // vira oráculo de timing. Ver `lib/comparacaoConstante.ts`.
    if (!tokenConfere(authHeader, `Bearer ${secretToken}`)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Chave de serviço, e só DEPOIS do token conferido.
    //
    // `contas` e `compras_produtos` têm RLS `has_finance_access(auth.uid())`.
    // Quem chama esta rota é o n8n, sem cookie de sessão: `auth.uid()` é nulo,
    // a função devolve false e as duas consultas voltavam VAZIAS — com o
    // `error` descartado, viravam "zero despesas". O resultado é que a ficha
    // de margem no WhatsApp mostrava custo total = preço de compra e margem
    // otimista, discordando em silêncio do painel. Confirmado pelo dono em
    // 2026-08-12.
    let supabase;
    try {
      supabase = createAdminSupabaseClient();
    } catch {
      // Sem chave de serviço a rota voltaria a somar zero em silêncio. Mesma
      // regra do token: indisponível é melhor que errado.
      console.error("[Margens/Consulta] SUPABASE_SERVICE_ROLE_KEY ausente — rota indisponível.");
      return NextResponse.json(
        { error: "Consulta de margem indisponível: credencial de serviço não configurada." },
        { status: 503 }
      );
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

    // 2b. Merge manual overrides from site_settings over the raw row.
    // `preco_compra` is not a column of `estoque_motors`: it is typed in the
    // admin panel and stored in `site_settings.stock_overrides`. Without this
    // merge the entry price below is always undefined and the margin sheet
    // silently falls back to the transaction sum, disagreeing with the panel.
    // Same merge as /api/financeiro/margens (both branches).
    //
    // Lido lá em cima junto com `webhooks`: `stock_overrides` também saiu do
    // alcance do anônimo — é exatamente a linha onde `preco_compra` mora.
    const stockOverrides = overridesSalvos?.overrides || {};
    veiculo = { ...veiculo, ...(stockOverrides[veiculo.id] || {}) };

    // 3. Fetch all accounts (excluding cancelled ones) linked to the vehicle
    const { data: contas, error: erroContas } = await supabase
      .from("contas")
      .select("*, categoria:categorias_financeiras(*)")
      .eq("veiculo_id", String(veiculo.id))
      .neq("status", "cancelado");

    // 4. Fetch all purchases (excluding cancelled ones) linked to the vehicle
    const { data: compras, error: erroCompras } = await supabase
      .from("compras_produtos")
      .select("*")
      .eq("veiculo_id", String(veiculo.id))
      .neq("status", "cancelado");

    // Erro aqui NÃO pode virar lista vazia.
    //
    // Era exatamente assim que a rota mentia: consulta barrada pela RLS,
    // `error` descartado, `contas || []` devolvendo `[]`, e a ficha saindo com
    // "Gastos de Preparação: R$ 0,00" como se fosse fato apurado. Melhor
    // recusar a responder do que mandar um número errado para o WhatsApp de
    // quem decide preço.
    if (erroContas || erroCompras) {
      console.error(
        "[Margens/Consulta] Falha ao ler lançamentos do veículo:",
        erroContas?.message || erroCompras?.message
      );
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "⚠️ Não foi possível ler os lançamentos financeiros deste veículo. " +
            "A margem não foi calculada para não sair errada.",
        },
        { status: 502 }
      );
    }

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
