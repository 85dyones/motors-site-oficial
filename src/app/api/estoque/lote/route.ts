import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { campoNegadoAoPerfil, normalizarPerfil } from "../../../../lib/permissoes";
import { aplicarNosVeiculos, extrairCamposNossos } from "../../../../lib/estoqueEscrita";

export const dynamic = "force-dynamic";

/**
 * Ação em lote sobre o estoque — a barra de seleção da tela A6.
 *
 * O doc desenha "2 SELECIONADOS · Publicar · Marcar como vendido · Destacar na
 * home". Publicar depende do fluxo de revisão (A16), que não existe; o que esta
 * rota faz é o resto: marcar vendido, devolver a disponível e classificar
 * carroceria e perfil de uso de vários carros de uma vez.
 *
 * A alternativa era o cliente disparar N chamadas ao editor. Além do custo, N
 * chamadas falham pela metade: metade dos carros marcados, metade não, e nada
 * dizendo quais. Aqui é um update só.
 */

/** Teto por chamada. Marcar o estoque inteiro de uma vez é erro de operação
 *  mais provável que intenção — e um lote enorme trava a rota. */
const MAXIMO_POR_LOTE = 200;

export async function POST(request: NextRequest) {
  try {
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
    const perfil = normalizarPerfil(profile?.role);

    const body = await request.json();
    const ids: unknown = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Selecione ao menos um veículo" }, { status: 400 });
    }
    if (ids.length > MAXIMO_POR_LOTE) {
      return NextResponse.json(
        { error: `Lote acima do limite de ${MAXIMO_POR_LOTE} veículos` },
        { status: 400 },
      );
    }
    // Id que não é texto nem número vira "[object Object]" no `.in()` e volta
    // como erro cru do Postgres. Recusa na porta, com o motivo legível.
    if (!ids.every((id) => typeof id === "string" || typeof id === "number")) {
      return NextResponse.json({ error: "Lista de veículos malformada" }, { status: 400 });
    }

    const atualizacao = extrairCamposNossos(body?.campos ?? {});

    // Custo de aquisição não é operação de lote: o valor é de um carro só.
    // Barrado aqui em vez de silenciosamente ignorado — mesma linha da matriz
    // A17 que a rota do editor aplica.
    if ("preco_compra" in atualizacao) {
      return NextResponse.json(
        { error: "Custo de aquisição se altera no editor do veículo, um a um" },
        { status: 400 },
      );
    }

    // Matriz A17, campo a campo — o gate é por campo, não por rota. Marketing
    // classifica carroceria e perfil, mas não tira carro da vitrine; só Admin
    // mexe em placa; Financeiro não edita conteúdo de anúncio.
    const negado = campoNegadoAoPerfil(perfil, Object.keys(atualizacao));
    if (negado) {
      return NextResponse.json(
        { error: `Seu perfil não altera "${negado.campo}" (${negado.acao})` },
        { status: 403 },
      );
    }

    const resultado = await aplicarNosVeiculos(supabase, ids as Array<string | number>, atualizacao, {
      id: user.id,
      nome: profile?.full_name ?? user.email ?? null,
    });

    if (resultado.erro) {
      return NextResponse.json({ error: resultado.erro }, { status: resultado.status ?? 500 });
    }

    return NextResponse.json({
      ok: true,
      veiculos: ids.length,
      camposSalvos: resultado.camposSalvos,
      mudancasRegistradas: resultado.mudancasRegistradas,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
