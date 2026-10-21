import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { comEscopoDeLeads, leadNoEscopo, visaoDeLeads, type VisaoDeLeads } from "../../../../lib/escopoDeLeads";
import { editarEtiquetasDoLead, etiquetasConhecidas } from "../../../../lib/etiquetasDoLead";

export const dynamic = "force-dynamic";

/**
 * As etiquetas do lead no card do kanban (2026-09-25).
 *
 * Pedido do dono: *"ele [o SDR] tem que ter acesso às etiquetas"*; decisão
 * dele: ver e editar no card. Desde 20/10/2026 as etiquetas moram no próprio
 * lead (`leads.etiquetas`; o Chatwoot saiu de cena) — esta rota grava lá e
 * deixa no rastro do lead quem mudou o quê. A lógica mora em
 * `lib/etiquetasDoLead.ts`; aqui só a porta.
 *
 * A porta é a mesma do kanban: "Ver e mover leads no kanban" — Admin, Gestor,
 * Comercial e SDR, cada um nos leads do seu escopo (`lib/escopoDeLeads.ts`). Quem move o lead também o etiqueta.
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

/** Quantos leads etiquetados a lista de sugestões lê, no máximo. */
const TETO_DE_LEADS_ETIQUETADOS = 2000;

/**
 * O que o card oferece para pôr: as etiquetas que já estão nos leads que a
 * sessão enxerga (`comEscopoDeLeads`, a mesma régua da fila), menos as duas
 * da passagem.
 *
 * Lidas à parte, e não no GET da fila: a fila lê só os leads dela, e a
 * etiqueta criada num lead que saiu da fila tem de continuar oferecida.
 * Falhou, o card fica com as etiquetas que já viu na fila.
 *
 * `daConta` e `faltamNaConta` ficam na resposta pelo formato de antes (eram a
 * lista da conta do Chatwoot): sem Chatwoot, a lista é sempre a do banco, e
 * nenhuma etiqueta falta em lugar nenhum.
 */
export async function GET() {
  try {
    const { supabase, visao, recusa } = await sessaoQueMoveLead();
    if (recusa) return recusa;

    const consulta = supabase
      .from("leads")
      .select("etiquetas, responsavel")
      .neq("etiquetas", "{}")
      .limit(TETO_DE_LEADS_ETIQUETADOS);
    const { data, error } = await comEscopoDeLeads(consulta, visao);
    if (error) return NextResponse.json({ etiquetas: etiquetasConhecidas(), daConta: false, aviso: error.message });
    // `leadNoEscopo` de novo, como a fila: o banco não sabe que responsável
    // só com espaços é "sem responsável".
    const listas = (data ?? [])
      .filter((l: { responsavel?: string | null }) => leadNoEscopo(visao, l.responsavel))
      .map((l: { etiquetas?: unknown }) => (Array.isArray(l.etiquetas) ? l.etiquetas : []));
    return NextResponse.json({ etiquetas: etiquetasConhecidas(...listas), daConta: true, faltamNaConta: [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}

/**
 * Muda as etiquetas do lead: `{ id, incluir?, retirar? }`.
 *
 * Mudança, e não a lista inteira — ver `editarEtiquetasDoLead`. A resposta
 * traz a lista que ficou no lead, que é a que o card passa a mostrar.
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

    const r = await editarEtiquetasDoLead(supabase, id, body);
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json({ ok: true, etiquetas: r.etiquetas, ...(r.aviso ? { aviso: r.aviso } : {}) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
