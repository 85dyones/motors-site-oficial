import { NextRequest, NextResponse } from "next/server";
import { ehCodigoDeSms } from "../../../lib/smsCampanhas";
import { registrarClique } from "../../../lib/smsCampanhas-servidor";
import { urlDoSite } from "../../../lib/site";
import { createAdminSupabaseClient } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * `GET /s/<código>` — o link curto de um SMS de campanha.
 *
 * Conta o clique daquele destinatário e leva à ficha do carro, com
 * `utm_campaign=sms-<campanha>`: é por essa marca que um lead novo vindo do
 * SMS aparece na campanha. Código desconhecido, ou o banco fora do ar, leva
 * ao estoque: quem tocou no link nunca vê erro.
 *
 * O endereço é curto de propósito (um SMS tem 160 caracteres) e não diz nada
 * sobre a pessoa: o código é sorteado, e só o servidor sabe de quem é.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  let destino: string | null = null;
  if (ehCodigoDeSms(codigo)) {
    try {
      destino = await registrarClique(createAdminSupabaseClient(), codigo);
    } catch {
      destino = null;
    }
  }
  const resposta = NextResponse.redirect(urlDoSite(destino ?? "/estoque"), 302);
  // Robô de pré-visualização de mensagem não deve guardar nem indexar o atalho.
  resposta.headers.set("Cache-Control", "no-store");
  resposta.headers.set("X-Robots-Tag", "noindex, nofollow");
  return resposta;
}

/**
 * `HEAD` não conta clique: é o que antivírus e pré-visualização de mensagem
 * mandam para "espiar" o endereço. Sem este export o Next atenderia o HEAD
 * rodando o GET, e cada espiada viraria uma pessoa que clicou.
 */
export async function HEAD() {
  return new NextResponse(null, { status: 302, headers: { Location: urlDoSite("/estoque"), "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
