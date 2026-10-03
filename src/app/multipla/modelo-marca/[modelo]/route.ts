import { NextResponse } from "next/server";
import { marcasConhecidasOuNada } from "../../../../lib/hubsDeEstoque";
import { destinoDeModeloDoCatalogoAntigo } from "../../../../lib/enderecoAntigo";

/**
 * `/multipla/modelo-marca/<MODELO>`, o catálogo por modelo do site antigo.
 *
 * É rota e não regra do `next.config.ts` porque o destino depende do estoque:
 * o endereço antigo traz só o modelo, em maiúsculas, e a marca sai do índice
 * guardado (uma leitura por hora, ver `lib/enderecoAntigo.ts`). A regra
 * genérica de `/multipla` exclui este endereço para o pedido chegar aqui.
 *
 * O destino é relativo ao pedido, como em `app/og/foto/route.ts`: num preview
 * o salto fica no preview, e a query string acompanha. Na pane do estoque o
 * destino é a vitrine, que é para onde este endereço ia antes.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ modelo: string }> }) {
  const { modelo } = await params;
  const marcas = await marcasConhecidasOuNada();
  const destino = new URL(marcas ? destinoDeModeloDoCatalogoAntigo(modelo, marcas) : "/estoque", request.url);
  destino.search = new URL(request.url).search;
  return NextResponse.redirect(destino, 308);
}
