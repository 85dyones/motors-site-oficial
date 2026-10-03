import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";
import {
  campanhaDoLead,
  estadoDaSincronizacao,
  janelaDeDias,
  somarDiario,
  type LinhaDiario,
  type Rodada,
} from "../../../../lib/midiaSync";
import { lerLeadsDaLoja, passeDaEquipe } from "../../../../lib/leadsDaLoja";

export const dynamic = "force-dynamic";

/** Os três períodos do filtro da tela. Qualquer outro valor cai no primeiro. */
const PERIODOS = [7, 14, 30] as const;

/**
 * Campanhas de mídia paga (tela A13), agora vindas das plataformas.
 *
 * Desde 2026-09-24 não há cadastro por aqui: o Meta e o Google gravam em
 * `midia_diario` pelas rotas de `/api/marketing/sincronizar`. Esta rota soma
 * a janela pedida (`?dias=7|14|30`, calendário de Curitiba, hoje incluído)
 * por anúncio e por campanha, no mesmo formato de `leitura`/`leituraCampanha`
 * que a tela já consumia — e conta, ao lado, os leads que chegaram em
 * `public.leads` com a `utm_campaign` da campanha. Essa contagem é da LOJA:
 * para a equipe sai da chave de serviço (`leadsDaLoja.ts`, só `utm_campaign`),
 * porque a RLS de `leads` por escopo (20261003130000) zeraria a coluna para o
 * Marketing e o Financeiro. Quem não é da equipe segue na leitura da sessão.
 *
 * Aberta a qualquer usuário logado (Financeiro vê o investido, matriz A17).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Só para decidir de onde sai a contagem de leads; a porta da rota é a de
    // cima e não muda.
    const { data: profile } = await supabase.from("profiles").select("role, papeis").eq("id", user.id).maybeSingle();
    const passe = passeDaEquipe(profile);

    const pedido = Number(request.nextUrl.searchParams.get("dias"));
    const dias = (PERIODOS as readonly number[]).includes(pedido) ? pedido : PERIODOS[0];
    const janela = janelaDeDias(dias);

    const [campRes, anunRes, diarioRes, rodadasRes, leadsRes] = await Promise.all([
      supabase.from("midia_campanhas").select("*").order("criada_em", { ascending: false }),
      supabase.from("midia_anuncios").select("id, campanha_id, nome").order("criado_em", { ascending: true }),
      supabase
        .from("midia_diario")
        .select("campanha_id, anuncio_id, dia, investido, impressoes, cliques, conversoes")
        .gte("dia", janela.de)
        .lte("dia", janela.ate)
        .limit(20000),
      supabase
        .from("midia_sincronizacoes")
        .select("plataforma, iniciada_em, ok, erro")
        .order("iniciada_em", { ascending: false })
        .limit(200),
      // Meia-noite de Curitiba do primeiro dia da janela.
      passe
        ? lerLeadsDaLoja<{ utm_campaign: string | null }>(passe, ["utm_campaign"], (c) =>
            c.not("utm_campaign", "is", null).gte("created_at", `${janela.de}T00:00:00-03:00`).limit(5000),
          )
        : supabase
            .from("leads")
            .select("utm_campaign")
            .not("utm_campaign", "is", null)
            .gte("created_at", `${janela.de}T00:00:00-03:00`)
            .limit(5000),
    ]);

    const erro = campRes.error ?? anunRes.error ?? diarioRes.error ?? rodadasRes.error;
    if (erro) {
      if (ehTabelaOuColunaAusente(erro)) {
        return NextResponse.json(
          {
            error:
              "As tabelas da mídia sincronizada ainda não existem no banco. Aplique a migração " +
              "20260924120000_midia_paga_sincronizada.sql.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: erro.message }, { status: 500 });
    }

    const campanhasBrutas = campRes.data ?? [];
    const totais = somarDiario((diarioRes.data ?? []) as LinhaDiario[]);

    // Leads do banco por campanha. `leadsRes.error` é tolerado: sem a tabela de
    // leads a coluna mostra "—", e o resto da tela continua de pé.
    const referencia = campanhasBrutas.map((c) => ({ id: c.id, idExterno: c.id_externo, nome: c.nome }));
    const leadsPorCampanha = new Map<string, number>();
    let leadsSemCampanha = 0;
    for (const l of leadsRes.error ? [] : leadsRes.data ?? []) {
      const id = campanhaDoLead(l.utm_campaign, referencia);
      if (id) leadsPorCampanha.set(id, (leadsPorCampanha.get(id) ?? 0) + 1);
      else leadsSemCampanha += 1;
    }

    const campanhas = campanhasBrutas.map((c) => ({
      ...c,
      anuncios: (anunRes.data ?? [])
        .filter((a) => a.campanha_id === c.id)
        .map((a) => ({ ...a, leitura: totais.get(`${c.id}:${a.id}`) ?? null })),
      leituraCampanha: totais.get(`${c.id}:campanha`) ?? null,
      leadsBanco: leadsRes.error ? null : leadsPorCampanha.get(c.id) ?? 0,
    }));

    const rodadas = (rodadasRes.data ?? []) as Rodada[];
    return NextResponse.json({
      janela,
      dias,
      campanhas,
      leadsSemCampanha: leadsRes.error ? null : leadsSemCampanha,
      sincronizacao: {
        meta: estadoDaSincronizacao(rodadas, "meta"),
        google: estadoDaSincronizacao(rodadas, "google"),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
