import { NextRequest, NextResponse } from "next/server";
import { tokenConfere } from "../../../../../lib/comparacaoConstante";
import { lerRetornoDoSms } from "../../../../../lib/smsCampanhas";
import { registrarRetorno, segredosDoSms } from "../../../../../lib/smsCampanhas-servidor";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * `POST /api/marketing/sms/retorno` — onde a APIBrasil avisa o que aconteceu
 * com cada SMS: aceito, na operadora, e a RESPOSTA de quem recebeu. É por
 * aqui que "SAIR" tira a pessoa da lista.
 *
 * Quem chama é o fornecedor, sem sessão. A porta é o `SMS_WEBHOOK_TOKEN`, que
 * vai na URL (`?token=`) porque é o único lugar em que ele aceita segredo;
 * `Authorization: Bearer` também serve. Sem a variável a rota responde 503, e
 * não 401: é configuração faltando, e não tentativa errada.
 *
 * Responde 200 a qualquer corpo legível, mesmo que nenhum aviso ache envio:
 * o fornecedor reenvia o que recebe erro, e aviso de SMS de teste (que não é
 * gravado) chegaria para sempre.
 */
export async function POST(request: NextRequest) {
  const { tokenDoRetorno } = segredosDoSms();
  if (!tokenDoRetorno) return NextResponse.json({ error: "Retorno de SMS não configurado." }, { status: 503 });

  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const recebido = bearer ?? request.nextUrl.searchParams.get("token");
  if (!tokenConfere(recebido, tokenDoRetorno)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const avisos = lerRetornoDoSms(await request.json().catch(() => null));
  if (avisos.length === 0) return NextResponse.json({ recebidos: 0, achados: 0 });

  let admin;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return NextResponse.json({ error: "Servidor sem chave de serviço." }, { status: 503 });
  }
  const achados = await registrarRetorno(admin, avisos);
  return NextResponse.json({ recebidos: avisos.length, achados });
}
