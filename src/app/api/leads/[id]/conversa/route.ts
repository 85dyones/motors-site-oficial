import { NextResponse, type NextRequest } from "next/server";
import { enviarDoPainel, lerConfigDoAtendimento } from "../../../../../lib/atendimento-servidor";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../../../lib/erroDeSchema";
import { MIGRACAO_DO_ATENDIMENTO } from "../../../../../lib/configDoAtendimento";
import { configDaEvolution } from "../../../../../lib/evolution";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../../lib/gestaoDoLead-servidor";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/** O estado do assistente no lead — as colunas que a aba lê. */
const COLUNAS_DO_ATENDIMENTO =
  "aquecimento, temperatura, qualificacao, resumo_ia, resumo_ia_em, assistente_fase, entregue_em, " +
  "entregue_motivo, aviso_de_entrega_em, aviso_de_entrega_para, entrega_confirmada_em, cadencia, " +
  "cadencia_passo, cadencia_proximo_em, optout_em, origem_conversa";

const MENSAGENS_NA_TELA = 200;

/**
 * A conversa do lead no painel (2026-10-20): GET lê, POST responde.
 *
 * A porta é a da gestão do lead (`sessaoDeLeads` + `lerLeadNoEscopo`): quem
 * não vê o lead recebe 404. A LEITURA vai pela sessão — a RLS da conversa
 * herda o escopo de `leads` —, e a ESCRITA pela chave de serviço, porque
 * mandar WhatsApp e gravar a mensagem é do servidor (`enviarDoPainel`).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;
    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel, desfecho");
    if (guarda.recusa) return guarda.recusa;

    const [estado, mensagens, retratos, config] = await Promise.all([
      supabase.from("leads").select(COLUNAS_DO_ATENDIMENTO).eq("id", id).maybeSingle(),
      supabase
        .from("atendimento_mensagens")
        .select("id, direcao, autor, autor_nome, conteudo, texto, situacao, gatilho, erro, criado_em")
        .eq("lead_id", id)
        .order("criado_em", { ascending: false })
        .limit(MENSAGENS_NA_TELA),
      supabase
        .from("atendimento_qualificacoes")
        .select("aquecimento, temperatura, origem, criado_em")
        .eq("lead_id", id)
        .order("criado_em", { ascending: false })
        .limit(30),
      lerConfigDoAtendimento(supabase),
    ]);

    const ausente = [estado.error, mensagens.error, retratos.error].find((e) => e && ehTabelaOuColunaAusente(e));
    if (ausente) {
      return NextResponse.json({ migracaoPendente: true, aviso: mensagemDeMigracaoPendente(MIGRACAO_DO_ATENDIMENTO) });
    }
    const erro = estado.error ?? mensagens.error ?? retratos.error;
    if (erro) return NextResponse.json({ error: erro.message }, { status: 500 });

    return NextResponse.json({
      atendimento: estado.data ?? null,
      mensagens: [...(mensagens.data ?? [])].reverse(),
      retratos: [...(retratos.data ?? [])].reverse(),
      assistente: {
        ativo: config.config.ativo,
        nome: config.config.nome_do_assistente,
        limiares: config.config.limiares,
        whatsapp_ligado: configDaEvolution() !== null,
        passos: Object.fromEntries(
          Object.entries(config.config.cadencias).map(([nome, c]) => [nome, c.passos.length]),
        ),
      },
    });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;
    const guarda = await lerLeadNoEscopo(supabase, visao, id, "id, responsavel, desfecho");
    if (guarda.recusa) return guarda.recusa;

    const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const texto = typeof corpo?.texto === "string" ? corpo.texto : "";

    const r = await enviarDoPainel(createAdminSupabaseClient(), {
      leadId: id,
      texto,
      autor: visao.meuNome?.trim() || "Equipe",
    });
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    return NextResponse.json({ ok: true, ...(r.aviso ? { aviso: r.aviso } : {}) });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
