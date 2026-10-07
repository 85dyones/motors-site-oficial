import { NextRequest, NextResponse } from "next/server";
import { autorizarConsultaDePlaca } from "../../../../lib/consultaDePlaca-servidor";
import { lerPedidoDeModelo } from "../../../../lib/mercadoPorModelo";
import { bancoDoHistorico, consultarMercado } from "../../../../lib/mercadoPorModelo-servidor";

export const dynamic = "force-dynamic";
// A primeira consulta de um modelo são umas trinta chamadas à FIPE, cinco por vez.
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/consulta-placa/modelo` — o mercado de um modelo, sem custo.
 *
 * Corpo: `{ tipo, marca, modelo, ano, anos }`, com os códigos da FIPE que a
 * cascata de seleção devolve. `anos` é a lista de anos do modelo, para a
 * comparação lado a lado.
 *
 * Não chama nenhuma API paga: só a FIPE pública, pelo token gratuito da loja,
 * e `fipe_historico`. A porta é a da consulta de placa porque o teto diário
 * desse token é o mesmo da `/avaliacao` do site: quem consulta é quem avalia
 * carro. O miolo está em `lib/mercadoPorModelo-servidor.ts`.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarConsultaDePlaca();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const pedido = lerPedidoDeModelo(await request.json().catch(() => null));
  if (!pedido) {
    return NextResponse.json(
      { error: "Escolha marca, modelo e ano.", codigo: "pedido_invalido" },
      { status: 400, headers: SEM_CACHE },
    );
  }

  const resultado = await consultarMercado(pedido, {
    buscar: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    token: process.env.FIPE_API_TOKEN,
    banco: bancoDoHistorico(porta.supabase),
  });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: resultado.status, headers: SEM_CACHE });
  }
  return NextResponse.json({ mercado: resultado.mercado, avisos: resultado.avisos }, { headers: SEM_CACHE });
}
