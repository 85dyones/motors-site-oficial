import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../../lib/supabase-server";
import { campanhaDoLead, somarDiario, type LinhaDiario } from "../../../../../lib/midiaSync";
import { lerLeadsDaLoja, passeDaEquipe } from "../../../../../lib/leadsDaLoja";

export const dynamic = "force-dynamic";

/**
 * Uma campanha (tela A14), da vida inteira: os portões de aprendizagem
 * (50 leads, 72 h, 5× o orçamento) medem a campanha desde que entrou no ar,
 * não uma janela. Devolve os totais por anúncio, a linha da campanha (com o
 * alcance total que o Meta informa), a série por dia para o gráfico e o
 * registro de ajustes.
 *
 * Não há mais PATCH: nome, orçamento e situação vêm da plataforma a cada
 * sincronização e sobrescreveriam o que fosse editado aqui.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const [campRes, anunRes, diarioRes, ajusRes] = await Promise.all([
      supabase.from("midia_campanhas").select("*").eq("id", id).single(),
      supabase.from("midia_anuncios").select("id, nome").eq("campanha_id", id).order("criado_em", { ascending: true }),
      supabase
        .from("midia_diario")
        .select("campanha_id, anuncio_id, dia, investido, impressoes, cliques, conversoes")
        .eq("campanha_id", id)
        .order("dia", { ascending: true })
        .limit(10000),
      supabase
        .from("midia_ajustes")
        .select("*")
        .eq("campanha_id", id)
        .order("registrado_em", { ascending: false })
        .limit(100),
    ]);

    if (campRes.error) {
      return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
    }
    const erro = anunRes.error ?? diarioRes.error ?? ajusRes.error;
    if (erro) {
      return NextResponse.json({ error: erro.message }, { status: 500 });
    }

    const campanha = campRes.data;
    const linhas = (diarioRes.data ?? []) as LinhaDiario[];
    const totais = somarDiario(linhas);

    // Série por dia, somando os anúncios: é o gráfico de investimento.
    const porDia = somarDiario(linhas.map((l) => ({ ...l, campanha_id: l.dia, anuncio_id: null })));
    const diario = [...porDia.entries()].map(([chave, t]) => ({
      dia: chave.split(":")[0],
      investido: t.investido,
      conversas: t.conversas,
    }));

    const linhaCampanha = totais.get(`${id}:campanha`) ?? null;
    const leituraCampanha =
      linhaCampanha || campanha.alcance_total
        ? {
            ...(linhaCampanha ?? { investido: 0, impressoes: 0, cliques: 0, conversas: 0 }),
            alcance: Number(campanha.alcance_total ?? 0),
          }
        : null;

    // Leads do banco na vida da campanha. Erro tolerado (coluna mostra "—").
    // É número da LOJA: para a equipe sai da chave de serviço, só a coluna
    // `utm_campaign` (a RLS de `leads` por escopo, 20261003130000, zeraria a
    // conta para o Marketing). Quem não é da equipe segue na leitura da sessão.
    const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).maybeSingle();
    const passe = passeDaEquipe(profile);
    const leadsRes = passe
      ? await lerLeadsDaLoja<{ utm_campaign: string | null }>(passe, ["utm_campaign"], (c) =>
          c.not("utm_campaign", "is", null).limit(5000),
        )
      : await supabase.from("leads").select("utm_campaign").not("utm_campaign", "is", null).limit(5000);
    const ref = [{ id, idExterno: campanha.id_externo, nome: campanha.nome }];
    const leadsBanco = leadsRes.error
      ? null
      : (leadsRes.data ?? []).filter((l) => campanhaDoLead(l.utm_campaign, ref) === id).length;

    return NextResponse.json({
      campanha,
      anuncios: (anunRes.data ?? []).map((a) => ({ ...a, totais: totais.get(`${id}:${a.id}`) ?? null })),
      leituraCampanha,
      diario,
      leadsBanco,
      ajustes: ajusRes.data ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
