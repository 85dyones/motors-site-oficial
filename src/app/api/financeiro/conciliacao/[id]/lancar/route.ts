import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { dispatchAdminWebhook } from "../../../../../../lib/webhook-dispatcher";

export const dynamic = "force-dynamic";

/**
 * Lança no caixa o que o banco mostrou e o sistema não tinha —
 * POST { categoria_id, descricao?, parceiro?, veiculo_id? }
 *
 * Fecha o ciclo da conciliação. Antes disto, "no banco e fora do sistema" era
 * um achado que a pessoa levava para outra tela e redigitava valor, data e
 * descrição — três chances de errar, e o achado seguia aberto até ela voltar
 * e conciliar à mão.
 *
 * ---------------------------------------------------------------------------
 * Por que isto é UMA chamada e não três
 * ---------------------------------------------------------------------------
 * O gesto cria três coisas — conta paga, movimentação e o vínculo da linha —
 * e as três só fazem sentido juntas. A primeira versão desta rota fazia as
 * três escritas em sequência e, se uma falhasse, desfazia as anteriores com
 * `.delete()`.
 *
 * Estava errado, e de um jeito que só aparecia para quem usa a tela: DELETE
 * nessas tabelas é do Admin e mais ninguém (20260821210000), e **RLS que
 * recusa DELETE não levanta erro** — apaga zero linhas e devolve sucesso. O
 * rollback era um no-op silencioso para a adm/financeira, e o que sobrava era
 * uma conta paga órfã que a próxima importação do OFX lançaria de novo: o
 * oposto do que a conciliação existe para fazer.
 *
 * A correção não foi abrir permissão de apagar — isso desfaria "quem aprova
 * não apaga a prova" para consertar um detalhe de implementação. Foi tirar a
 * necessidade de desfazer: `lancar_do_extrato()` (20260822180000) faz os três
 * passos numa transação e o Postgres reverte tudo sozinho se qualquer um
 * falhar. Não existe "meio lançado".
 *
 * ---------------------------------------------------------------------------
 * Categoria é obrigatória aqui, e só aqui
 * ---------------------------------------------------------------------------
 * `contas.categoria_id` é nulo em todo o resto do módulo, e continua sendo.
 * Mas este é o único caminho em que o lançamento nasce de uma EVIDÊNCIA e não
 * da intenção de alguém: valor, data e descrição vêm prontos do banco, e a
 * classificação é a única coisa que uma pessoa acrescenta. Sem ela o gesto
 * produziria uma linha com número e sem significado — exatamente o que faz o
 * DRE virar uma pilha de "Outros", que é o problema que o relatório existe
 * para não ter.
 *
 * ---------------------------------------------------------------------------
 * Não passa por aprovação, e está certo
 * ---------------------------------------------------------------------------
 * É registro retroativo: o dinheiro já se moveu, o banco atesta. Mandar à
 * fila do Gestor pediria que ele aprovasse um fato consumado. É a mesma razão
 * pela qual lançar conta já paga passa direto (ver `lib/alcada.ts`).
 */

/**
 * Os SQLSTATE que a função usa para dizer o que houve. Traduzir aqui mantém
 * a mensagem no idioma da tela sem a rota ter que reimplementar as regras.
 */
const STATUS_DO_ERRO: Record<string, number> = {
  "42501": 403, // sem acesso ao financeiro
  "22023": 400, // categoria faltando
  P0002: 404, // linha do extrato não existe
  "23505": 409, // linha já conciliada
  "40001": 409, // outra pessoa conciliou agora há pouco
};

export async function POST(
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

    const body = await request.json().catch(() => ({}));
    const categoriaId = typeof body.categoria_id === "string" ? body.categoria_id.trim() : "";
    if (!categoriaId) {
      return NextResponse.json(
        { error: "Escolha a categoria — é ela que dá significado ao lançamento no DRE." },
        { status: 400 },
      );
    }

    const { data: resultado, error } = await supabase.rpc("lancar_do_extrato", {
      p_extrato_id: id,
      p_categoria_id: categoriaId,
      p_descricao: typeof body.descricao === "string" ? body.descricao : null,
      p_parceiro: typeof body.parceiro === "string" ? body.parceiro : null,
      p_veiculo_id: typeof body.veiculo_id === "string" ? body.veiculo_id : null,
    });

    if (error) {
      // A função devolve mensagem pronta para a tela; o SQLSTATE só escolhe
      // o status HTTP. Erro desconhecido vira 500, não 400 — chute otimista
      // aqui esconderia defeito nosso atrás de "dados inválidos".
      return NextResponse.json(
        { error: error.message },
        { status: STATUS_DO_ERRO[error.code ?? ""] ?? 500 },
      );
    }

    // Só depois de a transação ter fechado é que a conta existe para ser lida
    // e anunciada — antes disso não havia fato nenhum a avisar.
    const { data: conta } = await supabase
      .from("contas")
      .select(`*, categoria:categorias_financeiras (nome, icone)`)
      .eq("id", resultado.conta_id)
      .single();

    if (conta) {
      await dispatchAdminWebhook("conta_criada", conta).catch((err) =>
        console.error("[WebhookDispatch] Failed to dispatch account created event:", err.message),
      );
    }

    return NextResponse.json({ conta, movimentacao_id: resultado.movimentacao_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
