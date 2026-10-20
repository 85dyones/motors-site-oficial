import { NextResponse, type NextRequest } from "next/server";
import { MIGRACAO_DO_ATENDIMENTO } from "../../../../lib/configDoAtendimento";
import { ehTabelaOuColunaAusente, mensagemDeMigracaoPendente } from "../../../../lib/erroDeSchema";
import { leadNoEscopo } from "../../../../lib/escopoDeLeads";
import { sessaoDeLeads } from "../../../../lib/gestaoDoLead-servidor";
import {
  montarRelatorio,
  type ContatoDoRelatorio,
  type LeadDoRelatorio,
  type MensagemDoRelatorio,
  type UsoDoRelatorio,
} from "../../../../lib/relatorioDoAtendimento";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90] as const;
const TETO = 5000;

/**
 * O relatório do atendimento por IA (2026-10-20): origem, equipe, assistente
 * e cadências, em 7, 30 ou 90 dias.
 *
 * Lê com a chave de serviço (agregado, como `leadsDaLoja.ts`) e filtra pelo
 * escopo de QUEM PEDE antes de agregar: o administrador vê a loja; gestor e
 * SDR, os leads com responsável; o vendedor, os dele — a mesma régua de
 * `escopoDeLeads`. Assim o Comercial vê o próprio desempenho e não o dos
 * colegas, como no relatório do funil.
 *
 * Os tetos (5.000 linhas por leitura) são ditos na resposta quando batem: um
 * relatório que corta calado parece um mês fraco.
 */
export async function GET(request: NextRequest) {
  try {
    const { visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;
    const pedido = Number(request.nextUrl.searchParams.get("dias"));
    const dias = (PERIODOS as readonly number[]).includes(pedido) ? pedido : 30;
    const agora = new Date();
    const desde = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
    const admin = createAdminSupabaseClient();

    const colunas =
      "id, created_at, canal, utm_source, utm_campaign, origem_conversa, responsavel, desfecho, temperatura, " +
      "assistente_fase, entregue_em, entregue_motivo, aviso_de_entrega_em, aviso_de_entrega_para, " +
      "entrega_confirmada_em, optout_em";
    const [criados, entregues, cadencias] = await Promise.all([
      admin.from("leads").select(colunas).gte("created_at", desde).limit(TETO),
      admin.from("leads").select(colunas).gte("entregue_em", desde).limit(TETO),
      admin
        .from("leads")
        .select("id, responsavel")
        .not("cadencia_proximo_em", "is", null)
        .is("desfecho", null)
        .limit(TETO),
    ]);
    const erroLeads = criados.error ?? entregues.error ?? cadencias.error;
    if (erroLeads) {
      if (ehTabelaOuColunaAusente(erroLeads)) {
        return NextResponse.json({ migracaoPendente: true, aviso: mensagemDeMigracaoPendente(MIGRACAO_DO_ATENDIMENTO) });
      }
      return NextResponse.json({ error: erroLeads.message }, { status: 500 });
    }

    // Um lead entra uma vez, e só se quem pede o enxerga.
    const porId = new Map<string, LeadDoRelatorio>();
    for (const l of [...(criados.data ?? []), ...(entregues.data ?? [])] as unknown as LeadDoRelatorio[]) {
      if (leadNoEscopo(visao, l.responsavel)) porId.set(l.id, l);
    }
    const leads = [...porId.values()];
    const ids = leads.map((l) => l.id);

    let mensagens: MensagemDoRelatorio[] = [];
    let usos: UsoDoRelatorio[] = [];
    let contatos: ContatoDoRelatorio[] = [];
    const avisos: string[] = [];
    if ((criados.data ?? []).length >= TETO || (entregues.data ?? []).length >= TETO) {
      avisos.push(`O período tem mais de ${TETO} leads: o relatório mostra os primeiros ${TETO}.`);
    }

    // Em fatias: cada uuid pesa ~37 bytes na URL do PostgREST.
    for (let i = 0; i < ids.length; i += 100) {
      const fatia = ids.slice(i, i + 100);
      const [m, u, c] = await Promise.all([
        admin
          .from("atendimento_mensagens")
          .select("lead_id, direcao, autor, gatilho, criado_em")
          .in("lead_id", fatia)
          .gte("criado_em", desde)
          .limit(TETO),
        admin
          .from("atendimento_qualificacoes")
          .select("tokens_entrada, tokens_cache, tokens_saida")
          .in("lead_id", fatia)
          .gte("criado_em", desde)
          .limit(TETO),
        admin
          .from("leads_eventos")
          .select("lead_id, criado_em")
          .in("lead_id", fatia)
          .eq("tipo", "contato")
          .gte("criado_em", desde)
          .limit(TETO),
      ]);
      const erro = m.error ?? u.error ?? c.error;
      if (erro) {
        if (ehTabelaOuColunaAusente(erro)) {
          return NextResponse.json({ migracaoPendente: true, aviso: mensagemDeMigracaoPendente(MIGRACAO_DO_ATENDIMENTO) });
        }
        return NextResponse.json({ error: erro.message }, { status: 500 });
      }
      mensagens = mensagens.concat((m.data ?? []) as MensagemDoRelatorio[]);
      usos = usos.concat((u.data ?? []) as UsoDoRelatorio[]);
      contatos = contatos.concat((c.data ?? []) as ContatoDoRelatorio[]);
      if ([m, u, c].some((r) => (r.data ?? []).length >= TETO)) {
        avisos.push("Uma das leituras bateu no teto: alguns números do período podem estar abaixo do real.");
      }
    }

    // A classificação das fotos é custo da LOJA, não de um lead: entra no
    // custo só para quem vê a loja inteira. Em páginas — no começo, o estoque
    // inteiro é classificado de uma vez e passa das mil linhas do PostgREST.
    if (visao.escopo === "todos") {
      const { data: loja } = await admin.rpc("org_padrao");
      for (let pagina = 0; pagina < 20; pagina += 1) {
        let consulta = admin.from("atendimento_fotos").select("tokens_entrada, tokens_saida").gte("classificado_em", desde);
        if (typeof loja === "string") consulta = consulta.eq("org_id", loja);
        const { data, error } = await consulta.order("id", { ascending: true }).range(pagina * 1000, pagina * 1000 + 999);
        if (error) break;
        const linhas = (data ?? []) as { tokens_entrada: number; tokens_saida: number }[];
        usos = usos.concat(linhas.map((l) => ({ tokens_entrada: l.tokens_entrada, tokens_cache: 0, tokens_saida: l.tokens_saida })));
        if (linhas.length < 1000) break;
      }
    }

    const relatorio = montarRelatorio({
      dias,
      agora,
      leads,
      mensagens,
      usos,
      contatos,
      cadenciasEmAndamento: ((cadencias.data ?? []) as { responsavel: string | null }[]).filter((l) =>
        leadNoEscopo(visao, l.responsavel),
      ).length,
    });
    return NextResponse.json({ ...relatorio, veAEquipe: visao.escopo !== "meus", avisos: [...new Set(avisos)] });
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : "Erro inesperado" }, { status: 500 });
  }
}
