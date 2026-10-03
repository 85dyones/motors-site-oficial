import { NextResponse, type NextRequest } from "next/server";
import { comEscopoDeLeads } from "../../../../../lib/escopoDeLeads";
import { ehTabelaOuColunaAusente } from "../../../../../lib/erroDeSchema";
import { ETAPAS_PADRAO, type EtapaDoFunil } from "../../../../../lib/funil";
import {
  ETAPA_DE_VISITA,
  PASSO_DE_QUEM_CHEGOU,
  TEXTO_DE_QUEM_CHEGOU,
  decidirInteracao,
  leadEstaAberto,
} from "../../../../../lib/gestaoDoLead";
import {
  lerLeadNoEscopo,
  relerDepoisDeRegistrar,
  respostaDoErroDaFuncao,
  sessaoDeLeads,
} from "../../../../../lib/gestaoDoLead-servidor";

export const dynamic = "force-dynamic";

/**
 * "Chegou na loja" (03/10/2026). Contrato em `docs/GESTAO_DO_LEAD.md`.
 *
 * Faz três coisas, e só elas:
 *
 *  1. registra uma interação `visita`;
 *  2. define o próximo passo "Atender na loja", vencendo agora (as duas pela
 *     mesma chamada a `registrar_interacao_do_lead`, numa transação só);
 *  3. move o lead para a etapa de visita, pelo mesmo `update` com escopo que o
 *     PATCH de `/api/leads/gerenciar` usa para mover de etapa. Quem escreve a
 *     linha "Movido para ..." do rastro é o gatilho do banco, como em qualquer
 *     movimento.
 *
 * ---------------------------------------------------------------------------
 * O que esta rota NÃO faz, e por isso não afirma
 * ---------------------------------------------------------------------------
 * O desenho pede o responsável avisado no WhatsApp. Não há hoje por onde
 * enfileirar esse aviso sem mudar o banco: `/api/funil/alertas` só entrega o
 * que `montar_fila_do_funil` calcula pela régua de estagnação, e não existe
 * fila de aviso avulso. Então nada aqui diz "avisado": a resposta traz
 * `responsavel_avisado: false`, e o histórico mostra só o que aconteceu.
 *
 * ---------------------------------------------------------------------------
 * Duas escritas, e não uma transação
 * ---------------------------------------------------------------------------
 * A interação e o movimento são dois comandos: juntá-los pede uma função nova
 * no banco. A visita vai primeiro, porque é o fato (o cliente está na loja);
 * se o movimento falhar depois, a resposta é 500 com
 * `codigo: "movimento_falhou"` e diz que a visita ficou registrada.
 *
 * O lead só é movido para FRENTE: quem já está na visita ou adiante
 * (negociação) não volta de etapa por ter vindo à loja. E lead fechado é
 * recusado (409): mover um lead fechado o reabriria e apagaria o motivo do
 * desfecho, o que tem de ser decisão de quem reabre, no quadro.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel, situacao, desfecho");
    if (guarda.recusa) return guarda.recusa;
    const lead = guarda.lead as { situacao: string; desfecho?: string | null };

    if (!leadEstaAberto(lead)) {
      return NextResponse.json(
        {
          error: "Este lead está fechado. Reabra-o no quadro antes de registrar a chegada.",
          codigo: "lead_fechado",
        },
        { status: 409 },
      );
    }

    // A etapa de visita tem de existir, estar ativa e ser coluna do quadro.
    // O funil é editável: se o dono a desativou, mover para lá esconderia o
    // lead numa coluna arquivada.
    const { data: etapasBanco, error: erroEtapas } = await supabase
      .from("funil_etapas")
      .select("chave, rotulo, tipo, ordem, ativa");
    if (erroEtapas && !ehTabelaOuColunaAusente(erroEtapas)) {
      return NextResponse.json({ error: erroEtapas.message }, { status: 500 });
    }
    const etapas = (erroEtapas ? ETAPAS_PADRAO : (etapasBanco ?? [])) as Pick<
      EtapaDoFunil,
      "chave" | "rotulo" | "tipo" | "ordem" | "ativa"
    >[];
    const visita = etapas.find((e) => e.chave === ETAPA_DE_VISITA);
    if (!visita || !visita.ativa || visita.tipo !== "aberta") {
      return NextResponse.json(
        {
          error: `O funil não tem a etapa de visita ("${ETAPA_DE_VISITA}") ativa. Reative-a em Configurar funil.`,
          codigo: "etapa_de_visita_ausente",
        },
        { status: 422 },
      );
    }

    // O texto é opcional: sem ele, o registro diz só que o cliente chegou.
    const corpo = (await request.json().catch(() => null)) as { texto?: unknown } | null;
    const agora = new Date().toISOString();
    const decisao = decidirInteracao(
      {
        tipo: "visita",
        texto: typeof corpo?.texto === "string" && corpo.texto.trim() ? corpo.texto : TEXTO_DE_QUEM_CHEGOU,
        proximo_passo: PASSO_DE_QUEM_CHEGOU,
        proximo_passo_vence_em: agora,
      },
      { aberto: true },
    );
    if (!decisao.ok) {
      return NextResponse.json({ error: decisao.erro, codigo: decisao.codigo }, { status: decisao.status });
    }

    const { data: interacaoId, error } = await supabase.rpc("registrar_interacao_do_lead", {
      p_lead: id,
      ...decisao.args,
    });
    if (error) return respostaDoErroDaFuncao(error);

    // Só para frente. Etapa atual que o funil não conhece (arquivada e
    // apagada da lista) conta como "antes".
    const atual = etapas.find((e) => e.chave === lead.situacao);
    const mover = !atual || atual.ordem < visita.ordem;
    if (mover) {
      const { data: movidos, error: erroAoMover } = await comEscopoDeLeads(
        supabase.from("leads").update({ situacao: visita.chave, atualizado_em: agora }).eq("id", id),
        visao,
      ).select("id");
      if (erroAoMover || (movidos ?? []).length === 0) {
        return NextResponse.json(
          {
            error:
              `A visita foi registrada, mas não deu para mover o lead para "${visita.rotulo}"` +
              `${erroAoMover ? `: ${erroAoMover.message}` : "."} Mova o card pelo quadro.`,
            codigo: "movimento_falhou",
            interacao_id: interacaoId,
          },
          { status: 500 },
        );
      }
    }

    const relido = await relerDepoisDeRegistrar(supabase, id, String(interacaoId));
    return NextResponse.json({
      ok: true,
      interacao_id: interacaoId,
      movido: mover,
      // A etapa em que o lead ficou: a de visita, ou a que ele já tinha.
      situacao: mover ? visita.chave : lead.situacao,
      // Não há aviso ao responsável: ver o cabeçalho desta rota.
      responsavel_avisado: false,
      lead: relido.lead,
      item: relido.item,
      ...(relido.aviso ? { aviso: relido.aviso } : {}),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
