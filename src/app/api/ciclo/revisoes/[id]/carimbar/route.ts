import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../../../lib/permissoes";
import { registrarAcaoSensivel } from "../../../../../../lib/auditoria";

export const dynamic = "force-dynamic";

/**
 * O carimbo — aceitar ou recusar um registro da caderneta.
 *
 * Quem decide é a função `carimbar_revisao` no banco, em transação: confere a
 * etiqueta, casa com a janela do plano, calcula `dentro_da_janela` e grava o
 * KM verificado. Aqui só se traduz a decisão para a tela — e se registra na
 * auditoria, porque recusar carimbo tem consequência contratual para o
 * cliente.
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
      .select("role, full_name")
      .eq("id", user.id)
      .single();
    if (!ehStaff(profile?.role)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    if (podeFazer(normalizarPerfil(profile?.role), "Confirmar revisão da caderneta") !== "faz") {
      return NextResponse.json({ error: "Seu perfil não carimba revisão" }, { status: 403 });
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
          { error: "Este registro já foi carimbado — a caderneta não se reescreve." },
          { status: 409 },
        );
      }
      if (msg.includes("CARIMBO_SEM_ETIQUETA")) {
        return NextResponse.json(
          { error: "Sem a foto da etiqueta nova não há carimbo. Peça a foto ao cliente ou recuse com motivo." },
          { status: 422 },
        );
      }
      if (msg.includes("RECUSA_SEM_MOTIVO")) {
        return NextResponse.json(
          { error: "Recusa exige motivo — ele fica no rastro do registro." },
          { status: 422 },
        );
      }
      console.error("[Ciclo/Carimbo] Falha:", msg);
      return NextResponse.json({ error: "Não foi possível processar o carimbo." }, { status: 500 });
    }

    await registrarAcaoSensivel(
      supabase,
      "Confirmar revisão da caderneta",
      aceitar
        ? `Carimbo aceito — registro ${id}`
        : `Carimbo RECUSADO — registro ${id}: ${motivo}`,
      { id: user.id, nome: profile?.full_name ?? user.email },
    );

    return NextResponse.json({ ok: true, ...(data ?? {}) });
  } catch (err: any) {
    console.error("[Ciclo/Carimbo] Erro inesperado:", err?.message);
    return NextResponse.json({ error: "Erro ao processar o carimbo." }, { status: 500 });
  }
}
