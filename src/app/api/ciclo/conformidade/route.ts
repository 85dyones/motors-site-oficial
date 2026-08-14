import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import {
  estadoDoGatilho,
  estadoDaSerie,
  type DiaDaSerie,
} from "../../../../lib/ciclo/gatilho";

export const dynamic = "force-dynamic";

/**
 * O painel de conformidade — tela A22, manual v1.1 §1.4 e §5.7.
 *
 * GET devolve a série inteira e o estado das três condições do gatilho.
 * POST dispara `calcular_conformidade_diaria` — enquanto não houver
 * agendamento, é o botão do painel que mantém a série viva (o mesmo arranjo
 * do aviso de vencimento do financeiro).
 */

async function autorizar() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile?.role)) {
    return { erro: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  if (podeFazer(normalizarPerfil(profile?.role), "Acompanhar a conformidade do Ciclo") !== "faz") {
    return {
      erro: NextResponse.json({ error: "Seu perfil não acompanha a conformidade" }, { status: 403 }),
    };
  }
  return { supabase };
}

const hojeIso = () => new Date().toISOString().slice(0, 10);

export async function GET() {
  const auth = await autorizar();
  if ("erro" in auth) return auth.erro;
  const { supabase } = auth;
  const hoje = hojeIso();

  const { data: serie, error: erroSerie } = await supabase
    .from("conformidade_diaria")
    .select("dia, veiculos_ciclo_ativo, veiculos_com_revisao_devida, veiculos_em_dia, pct, retroativa")
    .order("dia", { ascending: true });

  if (erroSerie) {
    console.error("[Ciclo/Conformidade] Falha ao ler a série:", erroSerie.message);
    return NextResponse.json({ error: "Não foi possível ler a série." }, { status: 502 });
  }

  // ---- veiculos_monitorados (§1.4 emendado): Ciclo ativo E caderneta viva —
  // ao menos uma revisão confirmada nos últimos 12 meses, ou a janela da
  // primeira revisão ainda aberta (carro recém-vendido não é penalizado por
  // ainda não ter chegado à primeira revisão).
  const umAnoAtras = new Date();
  umAnoAtras.setUTCFullYear(umAnoAtras.getUTCFullYear() - 1);
  const corte = umAnoAtras.toISOString().slice(0, 10);

  const [ativos, vivas, primeirasAbertas] = await Promise.all([
    // "Ciclo ativo" é ter contrato — elegibilidade em risco ainda é ativo;
    // `perdida` sai da conta, porque o §1.2 a lista como fim da elegibilidade.
    supabase
      .from("contratos_ciclo")
      .select("veiculo_vendido_id, status_elegibilidade")
      .neq("status_elegibilidade", "perdida"),
    supabase
      .from("manutencoes")
      .select("veiculo_vendido_id")
      .not("confirmada_em", "is", null)
      .gte("data_servico", corte),
    supabase
      .from("plano_revisoes")
      .select("veiculo_vendido_id")
      .eq("numero_revisao", 1)
      .gte("janela_fim", hoje),
  ]);

  for (const r of [ativos, vivas, primeirasAbertas]) {
    if (r.error) {
      console.error("[Ciclo/Conformidade] Falha ao apurar monitorados:", r.error.message);
      return NextResponse.json({ error: "Não foi possível apurar os monitorados." }, { status: 502 });
    }
  }

  const comCadernetaViva = new Set([
    ...(vivas.data ?? []).map((m) => m.veiculo_vendido_id),
    ...(primeirasAbertas.data ?? []).map((p) => p.veiculo_vendido_id),
  ]);
  const monitorados = (ativos.data ?? []).filter((c) =>
    comCadernetaViva.has(c.veiculo_vendido_id),
  ).length;

  const dias = (serie ?? []) as DiaDaSerie[];

  return NextResponse.json({
    serie: dias,
    gatilho: estadoDoGatilho(dias, monitorados, hoje),
    estado_da_serie: estadoDaSerie(dias, hoje),
    monitorados,
    ciclo_ativos: (ativos.data ?? []).length,
  });
}

export async function POST() {
  const auth = await autorizar();
  if ("erro" in auth) return auth.erro;
  const { supabase } = auth;

  const { data, error } = await supabase.rpc("calcular_conformidade_diaria");
  if (error) {
    console.error("[Ciclo/Conformidade] Falha ao calcular:", error.message);
    return NextResponse.json({ error: "Não foi possível calcular a série." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data ?? {}) });
}
