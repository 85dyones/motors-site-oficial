import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../../lib/webhook-dispatcher";
import { podeDecidirAprovacao } from "../../../../../../lib/alcada";
import { perfisDe } from "../../../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * Decide o cadastro de uma despesa recorrente — POST { decisao, motivo? }.
 *
 * Gêmea de `/contas/[id]/aprovar`, com uma diferença que importa: recusar aqui
 * não cancela nada, porque não há conta gerada ainda. A recorrente fica
 * `recusada` E `ativa = false` — os dois, porque `aprovacao_status` sozinho
 * não impediria alguém de "reativar" e a régua da geração exige as duas
 * condições. Desligar junto deixa o estado óbvio na lista.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: perfil } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    if (!podeDecidirAprovacao(perfisDe(perfil))) {
      return NextResponse.json(
        { error: "Apenas administrador ou gestor decide despesa recorrente" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const decisao = body.decisao;
    const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";

    if (decisao !== "aprovar" && decisao !== "recusar") {
      return NextResponse.json({ error: "Decisão deve ser 'aprovar' ou 'recusar'" }, { status: 400 });
    }
    if (decisao === "recusar" && !motivo) {
      return NextResponse.json({ error: "Recusa exige motivo" }, { status: 400 });
    }

    const aprovando = decisao === "aprovar";
    const { data: recorrente, error } = await supabase
      .from("despesas_recorrentes")
      .update({
        aprovacao_status: aprovando ? "aprovada" : "recusada",
        // Recusada sai do ar: a régua da geração exige `ativa` E `aprovada`,
        // e deixar `ativa = true` numa recusada seria um estado que só confunde
        // quem olha a lista.
        ...(aprovando ? {} : { ativa: false }),
        aprovacao_decidida_por: user.id,
        aprovacao_decidida_em: new Date().toISOString(),
        aprovacao_motivo: motivo || null,
      })
      .eq("id", id)
      // Só decide o que está esperando — decidir de novo sobrescreveria a
      // trilha da primeira decisão.
      .eq("aprovacao_status", "aguardando")
      .select(`*, categoria:categorias_financeiras (nome, icone)`)
      .single();

    // A corrida de duas pessoas na tela de Aprovações: a primeira decide, a
    // segunda clica na mesma linha e o `.eq('aprovacao_status','aguardando')`
    // casa ZERO linhas.
    //
    // Zero linhas com `.single()` não é `data: null` no supabase-js — é ERRO
    // `PGRST116` ("JSON object requested, multiple (or no) rows returned").
    // Então o `if (error)` genérico disparava primeiro e devolvia 500 com a
    // mensagem crua do PostgREST, e o 409 explicativo logo abaixo nunca
    // executava. A segunda pessoa via uma falha do sistema onde a resposta
    // certa era "alguém já decidiu esta".
    const naoEstavaAguardando = error?.code === "PGRST116";

    if (error && !naoEstavaAguardando) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (naoEstavaAguardando || !recorrente) {
      return NextResponse.json(
        { error: "Esta despesa recorrente não está aguardando aprovação" },
        { status: 409 },
      );
    }

    await dispatchAdminWebhook(
      aprovando ? "recorrente_aprovada" : "recorrente_recusada",
      recorrente,
    ).catch((err) =>
      console.error("[WebhookDispatch] Failed to dispatch recurring decision:", err.message),
    );

    return NextResponse.json({ recorrente, decisao });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
