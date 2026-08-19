import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { registrarAcaoSensivel } from "../../../lib/auditoria";
import { ehTabelaOuColunaAusente } from "../../../lib/erroDeSchema";

export const dynamic = "force-dynamic";

/**
 * Trilha de ações sensíveis (tela A17).
 *
 * GET é restrito a Admin: o registro expõe e-mails e movimentos da equipe.
 * POST aceita qualquer usuário logado — é como o cliente registra ações que
 * acontecem fora de uma rota de API (a troca de paleta em A2, por exemplo).
 * O vocabulário de `acao` é validado aqui para o registro não virar log
 * genérico de aplicação.
 */
const ACOES_VALIDAS = new Set([
  "paleta_alterada",
  "usuario_criado",
  "perfil_alterado",
  "usuario_excluido",
  "texto_legal_alterado",
]);

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("auditoria_admin")
      .select("*")
      .order("registrado_em", { ascending: false })
      .limit(100);

    if (error) {
      // Migração ainda não aplicada — ver lib/erroDeSchema.ts.
      if (ehTabelaOuColunaAusente(error)) {
        return NextResponse.json(
          {
            error:
              "A tabela de auditoria ainda não existe no banco. Aplique a migração " +
              "20260807120000_midia_paga_e_auditoria.sql com `supabase db push`.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ registros: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const acao = String(body.acao ?? "");
    const detalhe = String(body.detalhe ?? "").slice(0, 500);

    if (!ACOES_VALIDAS.has(acao)) {
      return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    await registrarAcaoSensivel(supabase, acao, detalhe, {
      id: user.id,
      nome: profile?.full_name ?? user.email,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
