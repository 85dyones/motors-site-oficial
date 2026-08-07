import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { getEstoque } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Lista de veículos para os seletores do painel.
 *
 * A rota não existia — e três telas do financeiro a chamavam desde sempre:
 * `CompraForm`, `ContaForm` e `FinanceMargens` (`fetch("/api/estoque")`).
 * Todas tratavam o 404 com um `console.error` e seguiam com a lista vazia,
 * então a falha nunca apareceu na interface: o seletor "veículo" dos
 * formulários simplesmente vinha sem opções.
 *
 * A consequência ia além do formulário. O design doc (A11) diz que a margem
 * real se forma sozinha porque "quando é despesa de veículo, o lançamento
 * carrega o código do carro" — sem seletor, nenhuma despesa era vinculada, e
 * a tela de margem por veículo exibia "nenhuma movimentação vinculada" para
 * sempre. O módulo inteiro dependia de uma rota ausente.
 *
 * `incluirForaDoFeed: true` como no painel de configurações: um veículo que
 * saiu do feed continua tendo custo a lançar e margem a fechar — escondê-lo
 * aqui deixaria a despesa órfã.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Dado de operação interna (inclui veículos fora do feed): exige sessão.
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const veiculos = await getEstoque({ incluirForaDoFeed: true });

    // Só o que os seletores precisam. `getEstoque` já não expõe
    // `preco_compra` (ver o "SECURITY FIX" no mapper), e devolver a linha
    // inteira mandaria as duas listas de imagens de 88 veículos para o
    // browser a cada abertura de formulário.
    return NextResponse.json({
      veiculos: veiculos.map((v) => ({
        id: v.id,
        marca: v.marca,
        modelo: v.modelo,
        versao: v.versao,
        ano: v.ano,
        quilometragem: v.quilometragem,
        preco_original: v.preco_original,
        vendido: v.vendido,
        placa: v.placa ?? "",
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
