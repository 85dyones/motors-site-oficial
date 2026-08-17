import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * O cliente liga e desliga os canais de comunicação — §6.3-D.
 *
 * Desligar tudo é uma escolha válida e não custa nada ao cliente: o motor de
 * gatilhos simplesmente suprime o envio com o motivo `sem_canal_consentido`.
 * Nenhum componente do Índice, da conformidade ou da elegibilidade olha para
 * este campo (regra 2 do CLAUDE.md — a recusa nunca penaliza).
 *
 * A escrita vai por `atualizar_consentimento_canais`, que é `security definer`
 * de escopo estreito. O motivo está na migração: a tabela `clientes` dá UPDATE
 * em todas as colunas para o papel `authenticated`, então uma policy de UPDATE
 * para o cliente abriria `cpf_cnpj` e `auth_user_id` no mesmo gesto.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Entre pela sua garagem." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => ({} as any));

  // Booleano de verdade, não "truthy": mandar string vazia não pode virar
  // "desligou tudo" por acidente.
  if (typeof corpo?.whatsapp !== "boolean" || typeof corpo?.email !== "boolean") {
    return NextResponse.json(
      { error: "Informe whatsapp e email como verdadeiro ou falso." },
      { status: 422 },
    );
  }

  const { data, error } = await supabase.rpc("atualizar_consentimento_canais", {
    p_whatsapp: corpo.whatsapp,
    p_email: corpo.email,
  });

  if (error) {
    if (error.message?.includes("CLIENTE_NAO_ENCONTRADO")) {
      return NextResponse.json(
        { error: "Não achamos seu cadastro. Fale com a loja." },
        { status: 404 },
      );
    }
    console.error("[Garagem/Consentimento] Falha ao gravar:", error.message);
    return NextResponse.json({ error: "Não deu para salvar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data as object) });
}
