import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { leadNoEscopo, visaoDeLeads, type VisaoDeLeads } from "../../../../lib/escopoDeLeads";
import { configDoChatwoot, lerEtiquetasDaConta } from "../../../../lib/etiquetasDoChatwoot";
import { ETIQUETAS_DA_PASSAGEM, mesmaEtiqueta } from "../../../../lib/etiquetas";
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
 * A porta é a mesma do kanban: "Ver e mover leads no kanban" — Admin, Gestor,
 * Comercial e SDR, cada um nos leads do seu escopo (`lib/escopoDeLeads.ts`). Quem move o lead também etiqueta a conversa dele.
 */

async function sessaoQueMoveLead() {
  const supabase = await createServerSupabaseClient();
  const semVisao: VisaoDeLeads = { escopo: "nenhum", meuNome: null };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, visao: semVisao, recusa: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, full_name, is_active")
    .eq("id", user.id)
    .single();
  // Perfil desativado não lê nem grava etiqueta (03/10/2026): a sessão de quem
  // saiu da loja pode seguir viva, e `ehStaff` não olha `is_active`. A mesma
  // régua de `sessaoDeLeads`.
  if (!ehStaff(profile) || profile?.is_active !== true) {
    return { supabase, visao: semVisao, recusa: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  if (podeFazer(perfisDe(profile), "Ver e mover leads no kanban") !== "faz") {
    return { supabase, visao: semVisao, recusa: NextResponse.json({ error: "Seu perfil não mexe em leads" }, { status: 403 }) };
  }
  const visao = visaoDeLeads(perfisDe(profile), profile?.full_name);
  return { supabase, visao, recusa: null };
}

/**
 * As etiquetas criadas na conta do Chatwoot — o que o card oferece para pôr.
 *
 * Lidas à parte, e não no GET da fila: a fila não pode esperar o Chatwoot
 * responder para aparecer. Falhou, o card fica com as etiquetas que já viu nas
 * conversas e as duas da passagem.
 *
 * `faltamNaConta`: das duas da passagem, as que ninguém criou na conta. A
 * conversa aceita a etiqueta mesmo assim, mas a tela do Chatwoot só desenha as
 * criadas — o SDR passaria o lead e ninguém lá veria "reaquecido". O painel
 * avisa em vez de criar sozinho: criar etiqueta na conta é decisão de quem
 * administra o Chatwoot.
 */
export async function GET() {
  try {
    const { recusa } = await sessaoQueMoveLead();
    if (recusa) return recusa;

    const cfg = configDoChatwoot();
    if (!cfg) return NextResponse.json({ etiquetas: etiquetasConhecidas(), daConta: false });
    const r = await lerEtiquetasDaConta(cfg);
    if (!r.ok) return NextResponse.json({ etiquetas: etiquetasConhecidas(), daConta: false, aviso: r.motivo });
    const faltamNaConta = ETIQUETAS_DA_PASSAGEM.filter((p) => !r.valor.some((e) => mesmaEtiqueta(e, p)));
    return NextResponse.json({ etiquetas: etiquetasConhecidas(r.valor), daConta: true, faltamNaConta });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

/**
 * Muda as etiquetas da conversa do lead: `{ id, incluir?, retirar? }`.
 *
 * Mudança, e não a lista inteira — ver `editarEtiquetasDoLead`. A resposta
 * traz a lista que ficou no Chatwoot, que é a que o card passa a mostrar.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, visao, recusa } = await sessaoQueMoveLead();
    if (recusa) return recusa;

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

    // Só se etiqueta o lead que se enxerga (`escopoDeLeads`, 03/10/2026).
    if (visao.escopo !== "todos") {
      const { data: alvo, error: erroDoAlvo } = await supabase
        .from("leads")
        .select("responsavel")
        .eq("id", id)
        .maybeSingle();
      if (erroDoAlvo) return NextResponse.json({ error: erroDoAlvo.message }, { status: 500 });
      if (!alvo || !leadNoEscopo(visao, alvo.responsavel)) {
        return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
      }
    }

    const r = await editarEtiquetasDoLead(supabase, id, body, configDoChatwoot());
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json({ ok: true, etiquetas: r.etiquetas, ...(r.aviso ? { aviso: r.aviso } : {}) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
