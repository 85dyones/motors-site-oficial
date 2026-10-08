import { NextRequest, NextResponse } from "next/server";
import { lerOperadora } from "../../../../../lib/apiBrasilSms";
import { autorizarCampanhasDeSms, enviarTeste } from "../../../../../lib/smsCampanhas-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `POST /api/marketing/sms/teste` — UM SMS para o número de quem monta a
 * campanha, com a mensagem como ela chega. Custa um SMS e não grava nada.
 */
export async function POST(request: NextRequest) {
  const porta = await autorizarCampanhasDeSms();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });

  const corpo = (await request.json().catch(() => null)) as { telefone?: unknown; veiculoId?: unknown; mensagem?: unknown; destino?: unknown; operadora?: unknown } | null;
  const telefone = typeof corpo?.telefone === "string" ? corpo.telefone : "";
  const mensagem = typeof corpo?.mensagem === "string" ? corpo.mensagem.trim() : "";
  // Campanha por perfil pode não ter carro: aí o link do teste leva ao estoque.
  const semCarro = corpo?.veiculoId === null || corpo?.veiculoId === undefined;
  const veiculoId = semCarro ? null : Number(corpo?.veiculoId);
  if ((veiculoId !== null && (!Number.isInteger(veiculoId) || veiculoId <= 0)) || mensagem === "") {
    return NextResponse.json({ error: "Escreva a mensagem antes do teste." }, { status: 400, headers: SEM_CACHE });
  }

  const destino = corpo?.destino === "avaliacao" ? "avaliacao" : "estoque";
  const r = await enviarTeste(porta.admin, { telefone, veiculoId, mensagem, destino, operadora: lerOperadora(corpo?.operadora) });
  if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: r.status, headers: SEM_CACHE });
  return NextResponse.json({ ok: true, texto: r.texto, fornecedor: r.fornecedor, custo: r.custo }, { headers: SEM_CACHE });
}
