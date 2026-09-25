import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { configDoChatwoot, lerEtiquetasDaConta } from "../../../../lib/etiquetasDoChatwoot";
import { editarEtiquetasDoLead, etiquetasConhecidas } from "../../../../lib/etiquetasDoLead";

export const dynamic = "force-dynamic";

/**
 * As etiquetas do lead no card do kanban (2026-09-25).
 *
 * Pedido do dono: *"ele [o SDR] tem que ter acesso às etiquetas"*; decisão
 * dele: ver e editar no card. As etiquetas moram na conversa do Chatwoot — esta
 * rota grava LÁ, pela API, e deixa no rastro do lead quem mudou o quê. A
 * lógica mora em `lib/etiquetasDoLead.ts`; aqui só a porta.
 *
 * A porta é a mesma do kanban: "Ver e mover leads no kanban" — Admin,
 * Comercial e SDR. Quem move o lead também etiqueta a conversa dele.
 */

async function sessaoQueMoveLead() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, recusa: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile)) {
    return { supabase, recusa: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  if (podeFazer(perfisDe(profile), "Ver e mover leads no kanban") !== "faz") {
    return { supabase, recusa: NextResponse.json({ error: "Seu perfil não mexe em leads" }, { status: 403 }) };
  }
  return { supabase, recusa: null };
}

/**
 * As etiquetas criadas na conta do Chatwoot — o que o card oferece para pôr.
 *
 * Lidas à parte, e não no GET da fila: a fila não pode esperar o Chatwoot
 * responder para aparecer. Falhou, o card fica com as etiquetas que já viu nas
 * conversas e as duas da passagem.
 */
export async function GET() {
  try {
    const { recusa } = await sessaoQueMoveLead();
    if (recusa) return recusa;

    const cfg = configDoChatwoot();
    if (!cfg) return NextResponse.json({ etiquetas: etiquetasConhecidas(), daConta: false });
    const r = await lerEtiquetasDaConta(cfg);
    if (!r.ok) return NextResponse.json({ etiquetas: etiquetasConhecidas(), daConta: false, aviso: r.motivo });
    return NextResponse.json({ etiquetas: etiquetasConhecidas(r.valor), daConta: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

/** Grava a lista inteira de etiquetas da conversa do lead: `{ id, etiquetas }`. */
export async function POST(request: NextRequest) {
  try {
    const { supabase, recusa } = await sessaoQueMoveLead();
    if (recusa) return recusa;

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    const r = await editarEtiquetasDoLead(supabase, id, body?.etiquetas, configDoChatwoot());
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json({ ok: true, etiquetas: r.etiquetas, ...(r.aviso ? { aviso: r.aviso } : {}) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
