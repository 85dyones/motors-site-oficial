import { NextResponse, type NextRequest } from "next/server";
import { comEscopoDeLeads, leadNoEscopo, podeRemoverResponsavel } from "../../../../lib/escopoDeLeads";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import { limparEtiquetas } from "../../../../lib/etiquetas";
import { maisRecentePrimeiro } from "../../../../lib/etiquetasDoLead";
import { configDoChatwoot } from "../../../../lib/etiquetasDoChatwoot";
import { atendentesDoFluxo, type PerfilDoFluxo } from "../../../../lib/responsavelDoLead";
import { nomeComAno } from "../../../../lib/nomeDoVeiculo";
import {
  ETAPAS_PADRAO,
  minutosParado,
  nivelDeEstagnacao,
  ordenarEtapas,
  paradoDesde,
  type EtapaDoFunil,
  type LeadDoFunil,
  type MotivoDoFunil,
} from "../../../../lib/funil";
import {
  montarHistorico,
  refDoLead,
  rotuloDoPasso,
  situacaoDoPasso,
  sugestoesDeProximoPasso,
  leadEstaAberto,
  type EventoDoLead,
  type InteracaoDoLead,
} from "../../../../lib/gestaoDoLead";
import { lerLeadNoEscopo, sessaoDeLeads } from "../../../../lib/gestaoDoLead-servidor";
import { lerOpcoesDoLead, montarVeiculosDoLead } from "../../../../lib/veiculosDeInteresse-servidor";

export const dynamic = "force-dynamic";

/**
 * O detalhe de UM lead (gaveta e página `/admin/leads/[id]`, 03/10/2026).
 *
 * Contrato em `docs/GESTAO_DO_LEAD.md`. A resposta traz o lead como a fila o
 * traz (a linha inteira, com a conversa do Chatwoot e as etiquetas anexadas),
 * mais o que só o detalhe precisa: o histórico unificado, as sugestões de
 * próximo passo, a estagnação já calculada, o carro de interesse e os vizinhos
 * da coluna.
 *
 * A ordem das leituras é a regra: o LEAD primeiro, com a guarda do escopo
 * (`lerLeadNoEscopo`), e só então o histórico. `leads_interacoes` e
 * `leads_eventos` são legíveis por toda a equipe no banco; lidas antes da
 * guarda, entregariam as anotações de um lead a quem não o enxerga.
 *
 * Os veículos de interesse (05/10/2026) vêm em `veiculos`: as opções de
 * `leads_veiculos`, lidas DEPOIS da guarda como o histórico. Antes da migração
 * `20261005120000` a tabela não existe: a resposta é a de sempre, com o carro
 * único como uma opção e `veiculos_disponivel: false`. `veiculo` (o principal)
 * continua onde estava.
 *
 * Leitura que falha depois da guarda não derruba o detalhe: o lead vem, e a
 * falha vem em `avisos`, com a frase para a tela mostrar. Histórico vazio por
 * erro e histórico vazio de verdade não podem ser a mesma resposta.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, visao, recusa } = await sessaoDeLeads();
    if (recusa) return recusa;

    const guarda = await lerLeadNoEscopo(supabase, visao, id, "*");
    if (guarda.recusa) return guarda.recusa;
    const lead = guarda.lead;
    const agora = Date.now();
    const avisos: string[] = [];
    const aberto = leadEstaAberto(lead as { desfecho?: string | null });

    // Os vizinhos da coluna: os leads abertos da mesma etapa que quem pede
    // enxerga, na ordem em que o quadro os desenha (mais novo primeiro, as
    // mesmas 500 linhas da fila). Lead fechado não está em coluna nenhuma.
    const vizinhanca = aberto
      ? comEscopoDeLeads(
          supabase
            .from("leads")
            .select("id, responsavel")
            .eq("situacao", String(lead.situacao))
            .is("desfecho", null)
            .order("created_at", { ascending: false })
            .limit(500),
          visao,
        )
      : Promise.resolve({ data: [], error: null });

    const veiculoId = lead.veiculo_id as number | string | null | undefined;
    const leituraDoVeiculo =
      veiculoId === null || veiculoId === undefined
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("estoque_motors")
            .select("id, marca, modelo, versao, ano, quilometragem, preco, vendido")
            .eq("id", veiculoId)
            .maybeSingle();

    const [interacoes, eventos, atendimentos, etapasBanco, motivosBanco, perfis, vizinhos, veiculoLido, opcoesLidas] =
      await Promise.all([
        supabase
          .from("leads_interacoes")
          .select("id, lead_id, tipo, resultado, texto, autor, passo_texto, passo_vence_em, importada, criado_em")
          .eq("lead_id", id)
          .order("criado_em", { ascending: false }),
        supabase
          .from("leads_eventos")
          .select("id, tipo, de, para, autor, automatico, detalhe, criado_em")
          .eq("lead_id", id)
          .order("criado_em", { ascending: false }),
        supabase
          .from("atendimentos")
          .select("lead_id, chatwoot_conversation_id, com_assistente, humano_assumiu_em, iniciado_em, created_at, tags")
          .eq("lead_id", id),
        supabase.from("funil_etapas").select("*").order("ordem"),
        // Todos, e não só os ativos: o histórico precisa do nome do motivo que
        // foi desativado depois de o lead fechar com ele.
        supabase.from("funil_motivos").select("*").order("ordem"),
        supabase.from("profiles").select("full_name, role, papeis, is_active"),
        vizinhanca,
        leituraDoVeiculo,
        lerOpcoesDoLead(supabase, id),
      ]);

    // O funil: sem a tabela (migração pendente), o funil fixo de sempre.
    const funilPendente = Boolean(etapasBanco.error && ehTabelaOuColunaAusente(etapasBanco.error));
    if (etapasBanco.error && !funilPendente) avisos.push(`Não deu para ler as etapas do funil: ${etapasBanco.error.message}`);
    const etapas = ordenarEtapas(
      etapasBanco.error ? ETAPAS_PADRAO : ((etapasBanco.data ?? []) as EtapaDoFunil[]),
    );
    const todosOsMotivos = (motivosBanco.data ?? []) as MotivoDoFunil[];
    const etapa = etapas.find((e) => e.chave === lead.situacao) ?? null;

    // A conversa mais recente, como a fila a escolhe (`maisRecentePrimeiro`).
    if (atendimentos.error) {
      console.warn("[Leads] Sem atendimento do Chatwoot:", atendimentos.error.message);
      avisos.push("Não deu para ler a conversa do Chatwoot deste lead. O botão cai no WhatsApp.");
    }
    const atendimento = maisRecentePrimeiro(atendimentos.data ?? [])[0] as Record<string, unknown> | undefined;
    lead.chatwoot_conversation_id = atendimento?.chatwoot_conversation_id
      ? Number(atendimento.chatwoot_conversation_id)
      : null;
    lead.com_assistente = atendimento?.com_assistente === true;
    lead.humano_assumiu_em = atendimento?.humano_assumiu_em ?? null;
    lead.etiquetas = limparEtiquetas(atendimento?.tags);
    lead.ref = refDoLead(lead.ag_uid as string | null);
    lead.transferencias = Number(lead.transferencias ?? 0) || 0;

    if (interacoes.error) avisos.push(`Não deu para ler os registros deste lead: ${interacoes.error.message}`);
    if (eventos.error) avisos.push(`Não deu para ler o rastro deste lead: ${eventos.error.message}`);
    const historico = montarHistorico(
      (interacoes.data ?? []) as InteracaoDoLead[],
      (eventos.data ?? []) as EventoDoLead[],
      { etapas, motivos: todosOsMotivos },
    );

    // A estagnação, pela MESMA régua do card (`lib/funil`).
    const doFunil = lead as unknown as LeadDoFunil;
    const estagnacao = {
      nivel: nivelDeEstagnacao(doFunil, etapa ?? undefined, agora),
      minutos_parado: minutosParado(doFunil, agora),
      parado_desde: new Date(paradoDesde(doFunil)).toISOString(),
    };

    const vence = (lead.proximo_passo_vence_em as string | null) ?? null;
    const passo = lead.proximo_passo
      ? {
          texto: String(lead.proximo_passo),
          vence_em: vence,
          definido_em: (lead.proximo_passo_definido_em as string | null) ?? null,
          definido_por: (lead.proximo_passo_definido_por as string | null) ?? null,
          situacao: situacaoDoPasso(vence, agora),
          rotulo: rotuloDoPasso(vence, agora, "card"),
        }
      : null;

    let veiculo: Record<string, unknown> | null = null;
    if (veiculoLido.error) {
      avisos.push(`Não deu para ler o carro de interesse: ${veiculoLido.error.message}`);
    } else if (veiculoLido.data) {
      const v = veiculoLido.data as Record<string, unknown>;
      veiculo = {
        id: v.id,
        nome: nomeComAno({
          marca: String(v.marca ?? ""),
          modelo: String(v.modelo ?? ""),
          versao: v.versao as string | null,
          ano: v.ano as number | string | null,
        }),
        km: v.quilometragem ?? null,
        preco: v.preco ?? null,
        vendido: v.vendido === true,
      };
    }

    // As opções do lead. `undefined` no carro principal: a leitura dele falhou,
    // e a opção não afirma se ele está no estoque.
    const dosVeiculos = await montarVeiculosDoLead(supabase, lead, opcoesLidas, veiculoLido.error ? undefined : veiculo);
    avisos.push(...dosVeiculos.avisos);

    if (vizinhos.error) avisos.push(`Não deu para ler os vizinhos da coluna: ${vizinhos.error.message}`);
    const daColuna = ((vizinhos.data ?? []) as Array<{ id: string; responsavel: string | null }>)
      .filter((l) => leadNoEscopo(visao, l.responsavel))
      .map((l) => l.id);
    const posicao = daColuna.indexOf(id);

    return NextResponse.json({
      lead,
      etapa: etapa ? { chave: etapa.chave, rotulo: etapa.rotulo, tipo: etapa.tipo } : null,
      aberto,
      estagnacao,
      passo,
      veiculo,
      veiculos: dosVeiculos.veiculos,
      veiculos_disponivel: dosVeiculos.veiculos_disponivel,
      // As opções ainda em avaliação: o que a tela oferece resolver ao fechar.
      pendencias_de_veiculo: dosVeiculos.pendencias_de_veiculo,
      historico,
      // Só para lead aberto: fechado não pede próximo passo.
      sugestoes: aberto ? sugestoesDeProximoPasso(String(lead.situacao), agora) : [],
      vizinhos: {
        anterior: posicao > 0 ? daColuna[posicao - 1] : null,
        proximo: posicao >= 0 && posicao < daColuna.length - 1 ? daColuna[posicao + 1] : null,
      },
      // O que o cabeçalho do detalhe precisa para mover, atribuir e fechar, na
      // mesma resposta: a página `/admin/leads/[id]` abre sem a fila.
      etapas,
      motivos: todosOsMotivos.filter((m) => m.ativo),
      atendentes: perfis.data ? atendentesDoFluxo(perfis.data as PerfilDoFluxo[]) : [],
      escopo: visao.escopo,
      podeRemoverResponsavel: podeRemoverResponsavel(visao),
      etiquetasEditaveis: configDoChatwoot() !== null,
      funilPendente,
      avisos,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro" }, { status: 500 });
  }
}
