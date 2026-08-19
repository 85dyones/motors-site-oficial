import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";

export const dynamic = "force-dynamic";

/**
 * O painel de completude do registro — manual §3.2, meta §9 (≥ 80%).
 *
 * Duas leituras, uma tela: o ranking por vendedor (`completude_por_vendedor`)
 * e as vendas com pendência (`vw_vendas_incompletas`), para o número ter onde
 * aterrissar. Indicador sem a lista do que o compõe vira placar; com a lista,
 * vira tarefa.
 *
 * Gate: "Fechar venda do Ciclo" — Admin e Comercial. É a mesma população que
 * registra a venda, e o vendedor precisa enxergar a própria completude para
 * poder corrigi-la. Não criei linha nova na matriz: seria inventar uma
 * permissão que o dono não pediu, para o mesmo conjunto de gente.
 */

async function autorizar() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile)) {
    return { erro: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  if (podeFazer(perfisDe(profile), "Fechar venda do Ciclo") !== "faz") {
    return {
      erro: NextResponse.json({ error: "Seu perfil não acompanha o registro de vendas" }, { status: 403 }),
    };
  }
  return { supabase };
}

/** `YYYY-MM-DD` ou nada. Data inválida vira ausência, não erro 500. */
function dataOuNulo(bruto: string | null): string | null {
  if (!bruto) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return null;
  return Number.isNaN(new Date(`${bruto}T12:00:00Z`).getTime()) ? null : bruto;
}

export async function GET(request: NextRequest) {
  const auth = await autorizar();
  if ("erro" in auth) return auth.erro;
  const { supabase } = auth;

  // A janela vem da tela. O banco não crava período nenhum — nem eu aqui:
  // sem parâmetro, é a base inteira.
  const desde = dataOuNulo(request.nextUrl.searchParams.get("desde"));
  const ate = dataOuNulo(request.nextUrl.searchParams.get("ate"));

  const [ranking, vendas] = await Promise.all([
    supabase.rpc("completude_por_vendedor", { p_desde: desde, p_ate: ate }),
    supabase
      .from("vw_vendas_incompletas")
      .select("*")
      .order("data_venda", { ascending: false }),
  ]);

  // Os dois `error` são conferidos. Uma view protegida por `is_staff` devolve
  // VAZIO, não erro, para quem não pode ler — então tratar só a exceção não
  // detecta bloqueio. Aqui o erro que importa é o de verdade.
  if (ranking.error) {
    console.error("[Ciclo/Completude] Falha no ranking:", ranking.error.message);
    return NextResponse.json({ error: "Não foi possível ler o ranking." }, { status: 502 });
  }
  if (vendas.error) {
    console.error("[Ciclo/Completude] Falha ao ler as vendas:", vendas.error.message);
    return NextResponse.json({ error: "Não foi possível ler as vendas." }, { status: 502 });
  }

  const linhas = (vendas.data ?? []) as { pendencias: string[] | null }[];
  const pendentes = linhas.filter((l) => (l.pendencias ?? []).length > 0);

  return NextResponse.json({
    ranking: ranking.data ?? [],
    vendas_pendentes: pendentes,
    total_vendas: linhas.length,
    janela: { desde, ate },
  });
}
