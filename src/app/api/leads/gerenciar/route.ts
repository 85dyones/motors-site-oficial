import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";

export const dynamic = "force-dynamic";

/**
 * Leitura e gestão da fila de leads (telas A1 e A8).
 *
 * Rota separada de `/api/leads` de propósito: aquela é **pública** — recebe o
 * formulário de qualquer visitante — e esta lê PII. Misturar as duas num
 * arquivo é como um GET público nasce por engano no meio de um refactor.
 *
 * A matriz A17 diz que Marketing "vê só o volume agregado" no kanban. Aqui
 * isso é aplicado: quem não pode ver leads recebe apenas a CONTAGEM por
 * etapa, sem nome nem telefone.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    // Cliente da Caderneta é authenticated sem ser staff; normalizar sem
    // barrar o promoveria a "comercial".
    if (!ehStaff(profile?.role)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = normalizarPerfil(profile?.role);
    const podeVer = podeFazer(perfil, "Ver e mover leads no kanban") === "faz";

    // `created_at`, não `criado_em`: a tabela `leads` é preexistente e já
    // trazia esse nome. Renomear quebraria consumidor externo — ver a nota na
    // migração 20260807210000.
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      if (ehTabelaOuColunaAusente(error)) {
        return NextResponse.json({ leads: [], migracaoPendente: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const leads = data ?? [];

    // Marketing enxerga volume, não pessoas — regra da matriz A17.
    if (!podeVer) {
      const porSituacao: Record<string, number> = {};
      for (const l of leads) porSituacao[l.situacao] = (porSituacao[l.situacao] ?? 0) + 1;
      return NextResponse.json({
        somenteAgregado: true,
        total: leads.length,
        porSituacao,
      });
    }

    // Quem pode receber um lead. Vem junto na mesma resposta em vez de uma
    // rota nova porque `/api/users` exige Admin — e quem atende lead é
    // Comercial, que precisa escolher o responsável e não pode listar
    // usuários. Aqui a permissão já foi checada acima.
    //
    // `responsavel` na tabela é TEXTO, não FK (ver migração 20260807210000):
    // o consultor pode sair da empresa e o histórico do lead continua legível.
    // Esta lista serve para escolher sem erro de digitação, não para virar
    // chave estrangeira.
    let atendentes: { nome: string }[] = [];
    const { data: perfis } = await supabase
      .from("profiles")
      .select("full_name, role")
      .in("role", ["admin", "comercial"])
      .order("full_name");
    if (perfis) {
      atendentes = perfis
        .map((p) => ({ nome: (p.full_name || "").trim() }))
        .filter((p) => p.nome);
    }

    return NextResponse.json({ leads, atendentes });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Move o lead no kanban ou atribui responsável. */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!ehStaff(profile?.role)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    if (podeFazer(normalizarPerfil(profile?.role), "Ver e mover leads no kanban") !== "faz") {
      return NextResponse.json({ error: "Seu perfil não move leads" }, { status: 403 });
    }

    const body = await request.json();
    const { id, situacao, responsavel, observacoes } = body;
    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    const atualizacao: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (situacao !== undefined) atualizacao.situacao = situacao;
    if (responsavel !== undefined) atualizacao.responsavel = responsavel;
    if (observacoes !== undefined) atualizacao.observacoes = observacoes;

    const { error } = await supabase.from("leads").update(atualizacao).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Eliminação a pedido do titular — LGPD art. 18, VI.
 *
 * Existe porque a retenção é indeterminada (decisão do dono em 2026-08-07):
 * sem expurgo automático, apagar precisa ser possível à mão. Restrito a
 * Admin, e não a quem apenas atende o lead: apagar dado de titular é ato de
 * controlador, não de operação diária.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!ehStaff(profile?.role) || normalizarPerfil(profile?.role) !== "admin") {
      return NextResponse.json(
        { error: "Só o Administrador exclui lead (pedido de titular)" },
        { status: 403 },
      );
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }

    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
