import { NextResponse, type NextRequest } from "next/server";
import { comEscopoDeLeads, leadNoEscopo } from "../../../../lib/escopoDeLeads";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import { lerConversasDoQuadro } from "../../../../lib/conversaNoCard-servidor";
import { sessaoDeLeads } from "../../../../lib/gestaoDoLead-servidor";

export const dynamic = "force-dynamic";

/**
 * O que mudou no quadro desde a última olhada (21/10/2026).
 *
 * Pedido do dono: *"temos que ter uma visualização clara sobre leads que
 * estão com o Ney, assim como as mensagens, para não precisar abrir cada
 * um"*. O quadro fica aberto o dia inteiro no balcão e só relia os leads ao
 * abrir ou no Atualizar — o selo de cliente esperando e o do Ney ficariam
 * velhos em minutos. O quadro pergunta aqui a cada minuto, sem relê-lo
 * inteiro:
 *
 *   - `conversas`: a conversa de cada lead que teve mensagem na última
 *     semana — quem falou por último e desde quando o cliente espera
 *     (`lib/conversaNoCard`). O lead que não está aqui não espera ninguém.
 *   - `leads`: o estado dos leads que mudaram desde `desde` — a etapa, o
 *     dono, o desfecho e o que o Ney está fazendo. Só colunas de estado: nome,
 *     telefone e o resto do card vêm da fila.
 *   - `agora`: o relógio do servidor, que o quadro devolve como `desde` na
 *     próxima pergunta.
 *
 * A porta é a da gestão do lead (`sessaoDeLeads`), e cada leitura obedece ao
 * escopo: a dos leads pelo filtro de `escopoDeLeads`, a das mensagens pela
 * política da tabela, que pergunta a `leads`.
 */

/** O estado que o card mostra e o Ney muda. */
const COLUNAS_DO_ESTADO =
  "id, situacao, responsavel, desfecho, assistente_fase, cadencia, cadencia_passo, cadencia_proximo_em, temperatura, aquecimento, optout_em, atualizado_em";
/** `desde` mais velho que isto é recortado: quem ficou fora tanto tempo relê a fila. */
const RECUO_MAXIMO_MS = 30 * 60 * 1000;
/** Sem `desde`, os últimos cinco minutos. */
const RECUO_PADRAO_MS = 5 * 60 * 1000;
const TETO_DE_LEADS = 200;

export async function GET(request: NextRequest) {
  try {
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const agora = new Date();
    const pedido = Date.parse(new URL(request.url).searchParams.get("desde") ?? "");
    const desde = new Date(
      Number.isFinite(pedido)
        ? Math.min(agora.getTime(), Math.max(pedido, agora.getTime() - RECUO_MAXIMO_MS))
        : agora.getTime() - RECUO_PADRAO_MS,
    );

    const [conversas, mudados] = await Promise.all([
      lerConversasDoQuadro(supabase, agora),
      comEscopoDeLeads(
        supabase
          .from("leads")
          .select(COLUNAS_DO_ESTADO)
          .gte("atualizado_em", desde.toISOString())
          .order("atualizado_em", { ascending: false })
          .limit(TETO_DE_LEADS),
        visao,
      ),
    ]);

    const avisos = [...conversas.avisos];
    let leads: Array<Record<string, unknown>> = [];
    if (mudados.error) {
      if (!ehTabelaOuColunaAusente(mudados.error)) {
        console.warn("[Leads] Novidades dos leads ilegíveis:", mudados.error.message);
        avisos.push("Não deu para ler o que mudou nos leads: o quadro se acerta no próximo Atualizar.");
      }
    } else {
      leads = ((mudados.data ?? []) as unknown as Array<Record<string, unknown>>).filter((l) =>
        leadNoEscopo(visao, l.responsavel as string | null),
      );
    }

    return NextResponse.json({
      agora: agora.toISOString(),
      conversas: Object.fromEntries(conversas.porLead),
      leads,
      avisos,
    });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
