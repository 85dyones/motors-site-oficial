import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { campoNegadoAoPerfil, ehStaff, normalizarPerfil } from "../../../../lib/permissoes";
import { aplicarNosVeiculos, extrairCamposNossos, normalizarId } from "../../../../lib/estoqueEscrita";

export const dynamic = "force-dynamic";

/**
 * Um veículo, para o editor da tela A15.
 *
 * Escrita por rota autenticada, e não pelo client com a anon key como o
 * painel antigo faz (`supabase.from("estoque_motors").update()` dentro do
 * componente). `AUDITORIA.md §3.4` registra essa escrita direta como risco
 * conhecido — a policy de UPDATE é `USING (true)`, então qualquer um com a
 * chave pública, que vai no bundle, pode alterar preço. A tela nova não
 * amplia essa superfície.
 *
 * A gravação em si mora em `lib/estoqueEscrita.ts`, compartilhada com a rota
 * de lote da tela A6 — uma regra de histórico só.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // O id é bigint no banco, mas chega como string na URL.
    const alvo = normalizarId(id);
    const { data, error } = await supabase
      .from("estoque_motors")
      .select("*")
      .eq("id", alvo)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ veiculo: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();
    // Cliente da Caderneta é authenticated sem ser staff; normalizar sem
    // barrar o promoveria a "comercial".
    if (!ehStaff(profile?.role)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = normalizarPerfil(profile?.role);

    const body = await request.json();
    const atualizacao = extrairCamposNossos(body);

    // Matriz A17, campo a campo. `preco_compra` é custo de aquisição, que
    // Marketing e Comercial não veem; `placa` é a ficha travada, só de Admin.
    // O mapa vive em `lib/permissoes.ts`, compartilhado com a rota de lote —
    // até 2026-08-08 esta rota checava só o custo, e a placa passava por
    // qualquer perfil autenticado.
    const negado = campoNegadoAoPerfil(perfil, Object.keys(atualizacao));
    if (negado) {
      return NextResponse.json(
        { error: `Seu perfil não altera "${negado.campo}" (${negado.acao})` },
        { status: 403 },
      );
    }

    const resultado = await aplicarNosVeiculos(supabase, [id], atualizacao, {
      id: user.id,
      nome: profile?.full_name ?? user.email ?? null,
    });

    if (resultado.erro) {
      return NextResponse.json({ error: resultado.erro }, { status: resultado.status ?? 500 });
    }

    return NextResponse.json({
      ok: true,
      camposSalvos: resultado.camposSalvos,
      mudancasRegistradas: resultado.mudancasRegistradas,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
