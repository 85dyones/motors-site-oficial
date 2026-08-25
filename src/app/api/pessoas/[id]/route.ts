import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { origemConhecida, type OrigemDaAgenda, ORIGENS, rotearEdicao } from "../../../../lib/agenda";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Edição de uma linha da agenda.
 *
 * A agenda é uma vitrine sobre quatro tabelas, então o PATCH precisa de duas
 * informações: QUAL linha (o `id` na URL) e DE ONDE ela veio (`origem`, no
 * corpo). `rotearEdicao` traduz os campos genéricos da vitrine para as colunas
 * da tabela concreta e RECUSA o que não é editável por aqui — em vez de
 * ignorar em silêncio.
 *
 * ---------------------------------------------------------------------------
 * A conferência de linhas afetadas
 * ---------------------------------------------------------------------------
 * Quando a RLS recusa um UPDATE, o PostgREST não devolve erro: devolve
 * sucesso com zero linhas. Este módulo já foi mordido três vezes por essa
 * família de defeito — o DELETE recusado que respondia 200, o rollback que
 * era no-op, a lista que mostrava uma fatia como se fosse tudo. Por isso todo
 * caminho de escrita aqui pede `.select()` de volta e CONTA: zero linha vira
 * 403 com o motivo escrito, nunca um "salvo!" que não salvou.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    let destino;
    try {
      destino = rotearEdicao(body.origem, body);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(destino.tabela)
      .update(destino.valores)
      .eq("id", id)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nada foi alterado: ou a linha não existe mais, ou o seu perfil não " +
            `tem permissão de escrita em ${ORIGENS[body.origem as OrigemDaAgenda]?.rotulo ?? body.origem}.`,
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ pessoa: data[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Apagar, e só onde apagar não apaga história.
 *
 * `financeiro` (parceiros) e `rede` (parceiros_ciclo) aceitam DELETE: são
 * cadastros de conveniência, e um fornecedor criado por engano deve poder
 * sumir. As outras duas NÃO:
 *
 *  - `clientes` é destino de FK em seis tabelas do Ciclo e carrega o
 *    consentimento de LGPD. Apagar dali é apagar contrato de 36 meses.
 *  - `investidores` guarda o histórico de aportes. A tabela nasceu com a
 *    regra escrita no próprio comentário: *"desativa, não apaga"*.
 *
 * Para os quatro casos, aliás, DESATIVAR é o gesto certo — fornecedor com
 * conta paga no passado não deve sumir das contas antigas. O DELETE fica
 * para o erro de digitação recém-cometido.
 */
const ORIGENS_QUE_APAGAM: OrigemDaAgenda[] = ["financeiro", "rede"];

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const origem = request.nextUrl.searchParams.get("origem");

    // `origemConhecida`, não `!ORIGENS[origem]`: o objeto é literal e herda
    // `Object.prototype`, então `?origem=constructor` devolvia a função nativa
    // — truthy — e passava por este portão.
    if (!origemConhecida(origem)) {
      return NextResponse.json(
        { error: "Informe de qual cadastro é a linha (origem)" },
        { status: 400 },
      );
    }
    if (!ORIGENS_QUE_APAGAM.includes(origem)) {
      return NextResponse.json(
        {
          error:
            `Registro de ${ORIGENS[origem].rotulo} não se apaga — ele é ` +
            "referência de contrato e de histórico. Desative em vez de excluir.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from(ORIGENS[origem].tabela)
      .delete()
      .eq("id", id)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // O caso que custou caro em 2026-08-22: a RLS recusa e o PostgREST devolve
    // 200 com zero linha. Sem esta conferência a tela diria "excluído" e o
    // registro continuaria lá.
    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nada foi excluído: ou a linha já não existe, ou o seu perfil não " +
            "tem permissão para apagar neste cadastro.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ excluidos: data.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
