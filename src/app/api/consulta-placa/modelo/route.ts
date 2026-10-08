import { NextRequest, NextResponse } from "next/server";
import { configuracaoDaApiBrasil } from "../../../../lib/apiBrasil";
import { lerMesNaTabelaPaga, precoDaTabelaPaga } from "../../../../lib/apiBrasilFipe";
import { autorizarConsultaDePlaca } from "../../../../lib/consultaDePlaca-servidor";
import { lerPedidoDeModelo } from "../../../../lib/mercadoPorModelo";
import {
  bancoDoHistorico,
  consultarMercado,
  estimarConsultaCompleta,
  type LeitorPago,
  type ModoDaAnalise,
} from "../../../../lib/mercadoPorModelo-servidor";

export const dynamic = "force-dynamic";
// A primeira consulta completa de um modelo são umas trinta chamadas, três por vez.
export const maxDuration = 60;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/consulta-placa/modelo` — a análise de um modelo, em dois modos
 * (dono, 08/10/2026; o miolo está em `lib/mercadoPorModelo-servidor.ts`):
 *
 *  - `modo: "pontual"` (padrão): grátis. O valor de hoje do ano escolhido e
 *    dos vizinhos, pela FIPE pública e o token gratuito da loja.
 *  - `modo: "completa"`: paga. A série de 24 meses; os meses que a FIPE
 *    gratuita corta vêm da Tabela FIPE da APIBrasil (R$ 0,06 por mês).
 *    Com `estimar: true` só devolve quantos meses PODEM ser cobrados, para a
 *    tela pedir confirmação antes; nada é cobrado nessa chamada.
 *
 * Corpo: `{ tipo, marca, modelo, ano, anos, modo?, estimar? }`, com os códigos
 * da FIPE que a cascata de seleção devolve.
 *
 * A porta é a da consulta de placa (Administrador, Gestor, Comercial): a
 * linha "Consultar placa de veículo (consulta paga)" da matriz cobre as duas
 * consultas pagas, e o teto do token gratuito é o mesmo da `/avaliacao`.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarConsultaDePlaca();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const pedido = lerPedidoDeModelo(corpo);
  if (!pedido) {
    return NextResponse.json(
      { error: "Escolha marca, modelo e ano.", codigo: "pedido_invalido" },
      { status: 400, headers: SEM_CACHE },
    );
  }
  const modo: ModoDaAnalise = corpo?.modo === "completa" ? "completa" : "pontual";

  const buscar = (url: string, init: RequestInit) => fetch(url, { ...init, cache: "no-store" });
  const token = process.env.FIPE_API_TOKEN;
  const banco = bancoDoHistorico(porta.supabase);
  const apiBrasil = configuracaoDaApiBrasil();
  const preco = precoDaTabelaPaga();

  if (modo === "completa" && corpo?.estimar === true) {
    const estimativa = await estimarConsultaCompleta(pedido, { buscar, token, banco });
    if (!estimativa.ok) return NextResponse.json({ error: estimativa.motivo }, { status: estimativa.status, headers: SEM_CACHE });
    return NextResponse.json(
      {
        mesesPagosNoMaximo: estimativa.mesesPagosNoMaximo,
        precoPorMes: preco,
        temToken: apiBrasil.token !== null,
        homologacao: apiBrasil.homologacao,
      },
      { headers: SEM_CACHE },
    );
  }

  const pago: LeitorPago | null =
    modo === "completa" && apiBrasil.token
      ? {
          homologacao: apiBrasil.homologacao,
          ler: (busca) =>
            lerMesNaTabelaPaga(
              { tipo: pedido.tipo, marca: pedido.marca, modelo: pedido.modelo, ano: busca.ano, referencia: busca.referencia.codigo },
              { token: apiBrasil.token!, homologacao: apiBrasil.homologacao },
            ),
        }
      : null;

  const resultado = await consultarMercado(pedido, { buscar, token, banco, modo, pago });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: resultado.status, headers: SEM_CACHE });
  }
  return NextResponse.json(
    {
      mercado: resultado.mercado,
      avisos: resultado.avisos,
      modo,
      chamadasPagas: resultado.chamadasPagas,
      // Em homologação nada é cobrado: o custo mostrado é zero.
      custo: apiBrasil.homologacao ? 0 : preco === null ? null : Math.round(resultado.chamadasPagas * preco * 100) / 100,
    },
    { headers: SEM_CACHE },
  );
}
