import { NextResponse } from "next/server";
import { ehVeiculosIndisponivel, montarRankingDeInteresse } from "../../../../lib/veiculosDeInteresse";
import { respostaDoErroDeVeiculos, sessaoDaEquipe } from "../../../../lib/veiculosDeInteresse-servidor";

export const dynamic = "force-dynamic";

/**
 * O ranking de interesse por veículo (05/10/2026): uma linha por carro do
 * estoque, com ou sem interesse, mais os que já saíram e têm histórico, do
 * mais considerado ao menos. Contrato em `docs/GESTAO_DO_LEAD.md`.
 *
 * Sai de `interesse_por_veiculo()`, com a sessão de quem abriu a tela (a
 * função exige equipe ativa e recusa a chave de serviço). Só agregados.
 *
 * Antes da migração: `200` com `veiculos_disponivel: false` e lista vazia.
 */
export async function GET() {
  try {
    const { supabase, recusa } = await sessaoDaEquipe();
    if (recusa) return recusa;

    const { data, error } = await supabase.rpc("interesse_por_veiculo");
    if (error) {
      if (ehVeiculosIndisponivel(error)) return NextResponse.json({ veiculos_disponivel: false, veiculos: [] });
      return respostaDoErroDeVeiculos(error);
    }
    return NextResponse.json({ veiculos_disponivel: true, veiculos: montarRankingDeInteresse(data) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
