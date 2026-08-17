import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * KM declarado pelo cliente — manual v1.1 §5.2, decisão D4 (opt-in).
 *
 * Toda a autorização é da RLS, com o cliente DA SESSÃO: a policy
 * `leituras_odometro_cliente_registra` só aceita INSERT em veículo do próprio
 * cliente (`e_veiculo_do_cliente`) e com `origem = 'cliente'`. Não há chave
 * de serviço aqui de propósito — se a policy não deixa, a rota não grava.
 *
 * O que a rota NÃO faz, por regra: comparar com a leitura anterior e recusar
 * KM "estranho". Declarado é declarado — quem verifica é a etiqueta no
 * carimbo (§5.2), e a projeção (`km_estimado`) já ignora regressão sem
 * penalizar ninguém.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Entre pela sua garagem para registrar." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => ({} as any));
  const veiculo = String(corpo?.veiculo_vendido_id ?? "").trim();
  const km = Number(corpo?.km);

  if (!veiculo) {
    return NextResponse.json({ error: "Escolha o veículo." }, { status: 422 });
  }
  if (!Number.isFinite(km) || !Number.isInteger(km) || km < 0 || km > 2_000_000) {
    return NextResponse.json({ error: "KM inválido." }, { status: 422 });
  }

  const { error } = await supabase.from("leituras_odometro").insert({
    veiculo_vendido_id: veiculo,
    km,
    origem: "cliente",
  });

  if (error) {
    // 42501 = a RLS recusou: o veículo não é deste cliente.
    if (error.code === "42501") {
      return NextResponse.json({ error: "Este veículo não está na sua garagem." }, { status: 403 });
    }
    console.error("[Garagem/KM] Falha ao registrar:", error.message);
    return NextResponse.json({ error: "Não deu para anotar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
