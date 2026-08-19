import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../../../lib/permissoes";
import { registrarAcaoSensivel } from "../../../../../../lib/auditoria";

export const dynamic = "force-dynamic";

/**
 * A verificação — aceitar ou recusar um lançamento do diário de bordo.
 *
 * Quem decide é a função `carimbar_revisao` no banco, em transação: confere a
 * etiqueta, casa com a janela do plano, calcula `dentro_da_janela` e grava o
 * KM verificado. Aqui só se traduz a decisão para a tela — e se registra na
 * auditoria, porque recusar tem consequência contratual para o cliente.
 *
 * O nome da função de banco é de quando o programa se chamava "caderneta"
 * (renomeado em 2026-08-14). Migração aplicada é registro histórico e não se
 * reescreve; nenhum usuário lê o nome da função.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis, full_name")
      .eq("id", user.id)
      .single();
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    if (podeFazer(perfisDe(profile), "Verificar revisão do diário de bordo") !== "faz") {
      return NextResponse.json({ error: "Seu perfil não verifica revisão" }, { status: 403 });
    }

    const corpo = await request.json().catch(() => ({}));
    const aceitar = corpo?.aceitar === true;
    const motivo = typeof corpo?.motivo === "string" ? corpo.motivo.trim() : "";

    const { data, error } = await supabase.rpc("carimbar_revisao", {
      p_manutencao: id,
      p_aceitar: aceitar,
      p_motivo: motivo || null,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("REVISAO_NAO_ENCONTRADA")) {
        return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
      }
      if (msg.includes("REVISAO_JA_CARIMBADA")) {
        return NextResponse.json(
          { error: "Este lançamento já foi verificado — o diário de bordo não se reescreve." },
          { status: 409 },
        );
      }
      if (msg.includes("CARIMBO_SEM_ETIQUETA")) {
        return NextResponse.json(
          { error: "Sem a foto da etiqueta nova não há verificação. Peça a foto ao cliente ou recuse com motivo." },
          { status: 422 },
        );
      }
      if (msg.includes("RECUSA_SEM_MOTIVO")) {
        return NextResponse.json(
          { error: "Recusa exige motivo — ele fica no rastro do registro." },
          { status: 422 },
        );
      }
      console.error("[Ciclo/Verificação] Falha:", msg);
      return NextResponse.json({ error: "Não foi possível processar o carimbo." }, { status: 500 });
    }

    await registrarAcaoSensivel(
      supabase,
      "Verificar revisão do diário de bordo",
      aceitar
        ? `Verificação ACEITA — lançamento ${id}`
        : `Verificação RECUSADA — lançamento ${id}: ${motivo}`,
      { id: user.id, nome: profile?.full_name ?? user.email },
    );

    return NextResponse.json({ ok: true, ...(data ?? {}) });
  } catch (err: any) {
    console.error("[Ciclo/Verificação] Erro inesperado:", err?.message);
    return NextResponse.json({ error: "Erro ao processar o carimbo." }, { status: 500 });
  }
}
