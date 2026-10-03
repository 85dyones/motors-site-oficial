import { NextResponse } from "next/server";
import { recortesDoEstoque } from "../../../../lib/hubsDeEstoque";
import { destinoDeModeloDoCatalogoAntigo } from "../../../../lib/enderecoAntigo";
import { urlDoSite } from "../../../../lib/site";

/**
 * `/multipla/modelo-marca/<MODELO>`, o catálogo por modelo do site antigo.
 *
 * É rota e não regra do `next.config.ts` porque o destino depende do estoque:
 * o endereço antigo traz só o modelo, em maiúsculas, e a marca sai do banco.
 * A regra genérica de `/multipla` exclui este prefixo para o pedido chegar aqui.
 * Ver `lib/enderecoAntigo.ts`.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ modelo: string }> }) {
  const { modelo } = await params;
  const { historico, disponiveis } = await recortesDoEstoque();
  const destino = destinoDeModeloDoCatalogoAntigo(modelo, historico, disponiveis);
  return NextResponse.redirect(urlDoSite(destino), 308);
}
