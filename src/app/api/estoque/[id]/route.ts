import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";

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
 */

/** Campos que o painel controla. O sync do RevendaMais não conhece nenhum
 *  deles — é o contrato da migração 20260807160000. */
const CAMPOS_NOSSOS = [
  "placa",
  "motor",
  "cor_interna",
  "donos_anteriores",
  "garantia_fabrica",
  "preco_compra",
  "descricao",
  "laudo_pericia",
  "opcionais",
  "status_tag",
  "status_tag_color",
  "vendido",
  "tipo",
  "perfil_uso",
] as const;

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
    const alvo = /^\d+$/.test(id) ? Number(id) : id;
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
    const perfil = normalizarPerfil(profile?.role);

    const body = await request.json();

    const atualizacao: Record<string, unknown> = {};
    for (const campo of CAMPOS_NOSSOS) {
      if (campo in body) atualizacao[campo] = body[campo];
    }

    if (Object.keys(atualizacao).length === 0) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    // Matriz A17: Marketing edita foto, texto e destaque, mas não mexe em
    // preço. Aqui `preco_compra` é custo de aquisição — cai na linha "ver
    // custo de aquisição e margem", que Marketing e Comercial não veem.
    if ("preco_compra" in atualizacao && podeFazer(perfil, "Ver custo de aquisição e margem") !== "faz") {
      return NextResponse.json(
        { error: "Seu perfil não altera custo de aquisição" },
        { status: 403 },
      );
    }

    const alvo = /^\d+$/.test(id) ? Number(id) : id;

    // Estado anterior, lido ANTES do update: é o "NO AR HOJE" que a tela A16
    // compara com o proposto. Reconstruir isso depois exigiria refazer a
    // cadeia inteira de trás para frente.
    const { data: antes } = await supabase
      .from("estoque_motors")
      .select(CAMPOS_NOSSOS.join(","))
      .eq("id", alvo)
      .maybeSingle();

    const { error } = await supabase
      .from("estoque_motors")
      .update(atualizacao)
      .eq("id", alvo);

    if (error) {
      if (ehTabelaOuColunaAusente(error)) {
        return NextResponse.json(
          {
            error:
              "Campo da ficha própria ainda não existe no banco. Aplique a migração " +
              "20260807160000_ficha_propria_do_painel.sql.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Histórico: uma linha por campo que REALMENTE mudou. Salvar sem alterar
    // nada não pode poluir a trilha — senão "quem mexeu no preço?" vira uma
    // lista de cliques em Salvar.
    const anterior = (antes ?? {}) as Record<string, unknown>;
    const mudancas = Object.entries(atualizacao)
      .filter(([campo, novo]) => {
        const velho = anterior[campo];
        // Comparação frouxa de propósito: o formulário devolve "" onde o
        // banco tem null, e number onde tem string numérica.
        const norm = (x: unknown) => (x === null || x === undefined || x === "" ? "" : String(x));
        return norm(velho) !== norm(novo);
      })
      .map(([campo, novo]) => ({
        veiculo_id: typeof alvo === "number" ? alvo : Number(alvo),
        campo,
        valor_anterior: anterior[campo] === null || anterior[campo] === undefined
          ? null
          : String(anterior[campo]),
        valor_novo: novo === null || novo === undefined ? null : String(novo),
        autor_id: user.id,
        autor_nome: profile?.full_name ?? user.email ?? null,
      }));

    if (mudancas.length > 0) {
      // Nunca derruba o salvamento: a alteração já está no banco, e perder o
      // registro é menos grave que devolver erro para uma gravação que deu
      // certo. Mesma regra de `registrarAcaoSensivel`.
      const { error: erroHistorico } = await supabase
        .from("historico_veiculo")
        .insert(mudancas);
      if (erroHistorico) {
        console.warn("[Estoque] Falha ao registrar histórico:", erroHistorico.message);
      }
    }

    return NextResponse.json({
      ok: true,
      camposSalvos: Object.keys(atualizacao),
      mudancasRegistradas: mudancas.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
