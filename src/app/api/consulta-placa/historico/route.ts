import { NextRequest, NextResponse } from "next/server";
import { autorizarConsultaDePlaca } from "../../../../lib/consultaDePlaca-servidor";
import { lerFiltro, termoDaPesquisa } from "../../../../lib/historicoDeConsultas";
import { lerHistoricoDeConsultas } from "../../../../lib/historicoDeConsultas-servidor";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * `GET /api/consulta-placa/historico?q=&tipo=` — a pesquisa no histórico de
 * consultas (dono, 08/10/2026). Só leitura do banco: nenhuma consulta é feita
 * nem cobrada. `tipo`: todas | fipe | modelo | placa.
 *
 * A porta é a da consulta de placa (Administrador, Gestor, Comercial), a mesma
 * RLS das três tabelas lidas.
 */
export async function GET(request: NextRequest) {
  const porta = await autorizarConsultaDePlaca();
  if (!porta.ok) return NextResponse.json({ error: porta.motivo }, { status: porta.status, headers: SEM_CACHE });
  const parametros = request.nextUrl.searchParams;
  const leitura = await lerHistoricoDeConsultas(porta.supabase, { termo: termoDaPesquisa(parametros.get("q")), filtro: lerFiltro(parametros.get("tipo")) });
  if (!leitura.ok) return NextResponse.json({ error: leitura.motivo }, { status: 502, headers: SEM_CACHE });
  return NextResponse.json(leitura, { headers: SEM_CACHE });
}
