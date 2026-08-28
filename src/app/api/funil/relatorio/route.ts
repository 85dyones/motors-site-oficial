import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import {
  agruparPorMotivo,
  contarPorEtapa,
  ordenarEtapas,
  taxaDeConversao,
  type EtapaDoFunil,
  type LeadDoFunil,
  type MotivoDoFunil,
} from "../../../../lib/funil";

export const dynamic = "force-dynamic";

/**
 * Ganhos e perdidos — o relatório que o motivo obrigatório torna possível.
 *
 * 2026-08-28: *"uma opção de dar o negócio como ganho ou perdido, selecionando
 * opções para mensurar em relatórios depois"*. Este é o "depois".
 *
 * **Sem PII.** A resposta é contagem, soma e percentual: nenhum nome de lead,
 * nenhum telefone. É o que permite abrir o relatório para quem a matriz A17
 * mantém longe do contato individual — Marketing vê por que a loja perde
 * venda sem ver de quem era o telefone. A única coisa que ele NÃO recebe é o
 * recorte por vendedor: desempenho de pessoa é assunto de quem responde pela
 * equipe, e a mesma matriz diz que Marketing vê volume, não pessoas.
 *
 * **A janela é sobre o DESFECHO, não sobre a entrada.** "Agosto" quer dizer
 * "o que foi ganho ou perdido em agosto", e não "o que entrou em agosto e já
 * fechou" — o segundo recorte esconde a venda demorada, que é justamente a
 * que interessa entender.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, papeis")
      .eq("id", user.id)
      .single();
    if (!ehStaff(profile)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfis = perfisDe(profile);
    const vePessoas = podeFazer(perfis, "Ver e mover leads no kanban") === "faz";
    const veGerencial = podeFazer(perfis, "Ver relatórios gerenciais e DRE") === "faz";

    const p = request.nextUrl.searchParams;
    const de = janela(p.get("de"), -90);
    const ate = janela(p.get("ate"), 1);

    const [fechados, abertos, config, motivosBanco] = await Promise.all([
      supabase
        .from("leads")
        .select("id, nome, situacao, responsavel, created_at, desfecho, desfecho_motivo, desfecho_valor, desfecho_nota, desfecho_em")
        .not("desfecho", "is", null)
        .gte("desfecho_em", de)
        .lt("desfecho_em", ate)
        .limit(5000),
      supabase.from("leads").select("situacao, responsavel").is("desfecho", null).limit(5000),
      supabase.from("funil_etapas").select("*").order("ordem"),
      supabase.from("funil_motivos").select("*").order("ordem"),
    ]);

    if (fechados.error) {
      if (ehTabelaOuColunaAusente(fechados.error)) {
        return NextResponse.json({ migracaoPendente: true });
      }
      return NextResponse.json({ error: fechados.error.message }, { status: 500 });
    }

    const leads = (fechados.data ?? []) as LeadDoFunil[];
    const motivos = (motivosBanco.data ?? []) as MotivoDoFunil[];
    const etapas = ordenarEtapas((config.data ?? []) as EtapaDoFunil[]);

    const ganhos = leads.filter((l) => l.desfecho === "ganho");
    const perdidos = leads.filter((l) => l.desfecho === "perdido");
    const valorGanho = ganhos.reduce((s, l) => s + (Number(l.desfecho_valor ?? 0) || 0), 0);

    // Dias entre a entrada do lead e o desfecho. A média com mediana ao lado
    // porque uma venda de 180 dias puxa a média sozinha e faz a loja parecer
    // mais lenta do que é no caso típico.
    const ciclos = ganhos
      .map((l) => dias(l.created_at, l.desfecho_em))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    const resposta: Record<string, unknown> = {
      periodo: { de, ate },
      total: leads.length,
      ganhos: ganhos.length,
      perdidos: perdidos.length,
      valor_ganho: valorGanho,
      ticket_medio: ganhos.length > 0 ? valorGanho / ganhos.length : 0,
      taxa_conversao: taxaDeConversao(ganhos.length, perdidos.length),
      ciclo_medio_dias: ciclos.length > 0 ? ciclos.reduce((s, n) => s + n, 0) / ciclos.length : null,
      ciclo_mediano_dias: ciclos.length > 0 ? ciclos[Math.floor(ciclos.length / 2)] : null,
      por_motivo_perdido: agruparPorMotivo(leads, motivos, "perdido"),
      por_motivo_ganho: agruparPorMotivo(leads, motivos, "ganho"),
      // O funil de hoje, ao lado do resultado do período: o relatório de agosto
      // sem o funil de agora responde "como foi" e não "como está".
      funil_atual: etapas
        .filter((e) => e.tipo === "aberta")
        .map((e) => ({
          chave: e.chave,
          rotulo: e.rotulo,
          quantidade: contarPorEtapa((abertos.data ?? []) as { situacao: string }[])[e.chave] ?? 0,
        })),
    };

    if (vePessoas || veGerencial) {
      // As observações que os vendedores escreveram ao fechar (2026-08-28,
      // pedido do dono: *"deixe um campo de observação adicional além dos
      // motivos padrão"*). O número diz o quê; a frase diz o porquê que a
      // lista de motivos não previu — *"queria prata, só tinha branco"*.
      //
      // Fica atrás do mesmo gate do recorte por vendedor, e não junto dos
      // gráficos: é texto livre, e texto livre escrito por gente cita nome de
      // gente. Abri-lo a quem a matriz A17 mantém longe do contato individual
      // devolveria, pela porta lateral, exatamente o que o resto do relatório
      // toma o cuidado de não mostrar.
      resposta.observacoes = leads
        .filter((l) => (l.desfecho_nota ?? "").trim())
        .sort(
          (a, b) =>
            new Date(b.desfecho_em ?? 0).getTime() - new Date(a.desfecho_em ?? 0).getTime(),
        )
        .slice(0, 50)
        .map((l) => ({
          desfecho: l.desfecho,
          motivo: l.desfecho_motivo
            ? motivos.find((m) => m.chave === l.desfecho_motivo)?.rotulo ?? l.desfecho_motivo
            : null,
          nota: (l.desfecho_nota ?? "").trim(),
          responsavel: l.responsavel ?? null,
          quando: l.desfecho_em ?? null,
        }));

      const porVendedor = new Map<string, { ganhos: number; perdidos: number; valor: number }>();
      for (const l of leads) {
        const quem = l.responsavel?.trim() || "Sem responsável";
        const atual = porVendedor.get(quem) ?? { ganhos: 0, perdidos: 0, valor: 0 };
        if (l.desfecho === "ganho") {
          atual.ganhos += 1;
          atual.valor += Number(l.desfecho_valor ?? 0) || 0;
        } else {
          atual.perdidos += 1;
        }
        porVendedor.set(quem, atual);
      }
      resposta.por_vendedor = [...porVendedor.entries()]
        .map(([nome, v]) => ({
          nome,
          ...v,
          taxa_conversao: taxaDeConversao(v.ganhos, v.perdidos),
          abertos: ((abertos.data ?? []) as { responsavel: string | null }[]).filter(
            (a) => (a.responsavel?.trim() || "Sem responsável") === nome,
          ).length,
        }))
        .sort((a, b) => b.ganhos - a.ganhos || a.nome.localeCompare(b.nome, "pt-BR"));
    }

    return NextResponse.json(resposta);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Data ISO recebida, ou o padrão em dias a partir de hoje. */
function janela(valor: string | null, padraoEmDias: number): string {
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${valor}T00:00:00.000Z`;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + padraoEmDias);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function dias(de?: string | null, ate?: string | null): number | null {
  if (!de || !ate) return null;
  const n = (new Date(ate).getTime() - new Date(de).getTime()) / 86_400_000;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
