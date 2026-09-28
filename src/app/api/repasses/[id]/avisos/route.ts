import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../../lib/auditoria";
import {
  COLUNAS_DO_INSCRITO,
  decidirAviso,
  inscritoDaLinha,
  type InscritoDoRepasse,
} from "../../../../../lib/avisosDoRepasse";
import { ehIdDeRepasse } from "../../../../../lib/repasse";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Marca que alguém da lista foi avisado deste carro. O aviso em si é manual,
 * pelo Chatwoot (dono, 24/09); isto só evita avisar duas vezes. Idempotente:
 * marcar de novo não duplica (`unique (repasse_id, inscrito_id)`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const admin = createAdminSupabaseClient();
    const lido = await lerRepasseParaEscrita(admin, id);
    if (!lido.ok) return lido.resposta;

    const corpo = (await request.json().catch(() => null)) as { inscritoId?: unknown } | null;
    const inscritoId = typeof corpo?.inscritoId === "string" ? corpo.inscritoId : "";
    let inscrito: InscritoDoRepasse | null = null;
    if (ehIdDeRepasse(inscritoId)) {
      const { data, error } = await admin.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).eq("id", inscritoId).maybeSingle();
      if (error) return falhaDoBanco(error);
      inscrito = data ? inscritoDaLinha(data as Record<string, unknown>) : null;
    }
    const decisao = decidirAviso({ repasse: lido.repasse, inscrito, perfis: sessao.perfis });
    if (!decisao.ok) return recusar(decisao);

    const { error } = await admin
      .from("repasse_avisos")
      .upsert(
        { repasse_id: id, inscrito_id: inscritoId, avisado_por: sessao.autor.id },
        { onConflict: "repasse_id,inscrito_id", ignoreDuplicates: true },
      );
    if (error) return falhaDoBanco(error);
    // Sem nome nem WhatsApp: se a pessoa sair da lista, o log não a guarda.
    await registrarAcaoSensivel(admin, "repasse.avisar", `${id} → inscrito ${inscritoId}`, sessao.autor);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao marcar o aviso." }, { status: 500 });
  }
}
