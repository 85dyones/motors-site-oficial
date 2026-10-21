import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { classificarFotosDoEstoque } from "../../../../lib/atendimento-servidor";
import { autorizarMotorDoAtendimento } from "../../../../lib/autorizacaoDoAtendimento";
import { ETIQUETA_DAS_FOTOS } from "../../../../lib/baseDoAtendimento-servidor";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A rodada das fotos (2026-10-20): o n8n chama junto com a rodada do
 * atendimento, a cada 15 minutos.
 *
 * Classifica, até o fim do orçamento de tempo, as fotos do estoque que o
 * modelo de visão ainda não viu — primeiro os carros sem NENHUMA foto
 * classificada. O que não coube fica para a próxima; o carro que o cliente
 * pedir antes disso é classificado na hora, pela própria conversa.
 *
 * Classificou algo novo: revalida a etiqueta das fotos, e o catálogo do
 * prompt passa a dizer o que cada carro tem na mensagem seguinte.
 *
 * `ok: false` (falta a chave) ou `falhas` > 0 é o sinal para o nó do n8n
 * terminar vermelho.
 */
export async function POST(request: Request) {
  const auth = await autorizarMotorDoAtendimento(request);
  if (auth.erro) return auth.erro;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    return NextResponse.json({ error: "Atendimento indisponível: credencial de serviço não configurada." }, { status: 503 });
  }

  try {
    const resultado = await classificarFotosDoEstoque(supabase);
    if (resultado.fotos_classificadas > 0) revalidateTag(ETIQUETA_DAS_FOTOS, { expire: 0 });
    return NextResponse.json(resultado);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error("[Atendimento] Rodada das fotos falhou:", motivo);
    return NextResponse.json({ ok: false, motivo, falhas: 1 }, { status: 500 });
  }
}
