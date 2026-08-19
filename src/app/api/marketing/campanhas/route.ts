import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../lib/permissoes";
import { ehTabelaOuColunaAusente } from "../../../../lib/erroDeSchema";

export const dynamic = "force-dynamic";

/**
 * Campanhas de mídia paga (telas A13/A14).
 *
 * GET devolve cada campanha com seus anúncios e a leitura mais recente por
 * anúncio (mais a linha da campanha, que carrega o alcance total) — é tudo
 * que o consolidado A13 precisa para derivar KPI, tabela e funil no cliente.
 *
 * A leitura é aberta a qualquer usuário logado (Financeiro vê o total
 * investido, pela matriz A17); criar campanha segue a linha "Gerenciar
 * campanhas de mídia paga" da matriz: Admin e Marketing.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const [campRes, anunRes, leitRes] = await Promise.all([
      supabase.from("midia_campanhas").select("*").order("criada_em", { ascending: false }),
      supabase.from("midia_anuncios").select("*").order("criado_em", { ascending: true }),
      // Snapshots mais novos primeiro: o reduce abaixo fica com o primeiro
      // que vê de cada par (campanha, anúncio). O teto de 2.000 linhas cobre
      // anos de digitação manual; quando o sync de API entrar, esta leitura
      // vira janela por período.
      supabase
        .from("midia_leituras")
        .select("*")
        .order("registrado_em", { ascending: false })
        .limit(2000),
    ]);

    const erro = campRes.error ?? anunRes.error ?? leitRes.error;
    if (erro) {
      // Migração ainda não aplicada — ver lib/erroDeSchema.ts sobre por que
      // testar `42P01` sozinho não funcionava.
      if (ehTabelaOuColunaAusente(erro)) {
        return NextResponse.json(
          {
            error:
              "As tabelas de mídia paga ainda não existem no banco. Aplique a migração " +
              "20260807120000_midia_paga_e_auditoria.sql com `supabase db push`.",
          },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: erro.message }, { status: 500 });
    }

    const ultimaLeitura = new Map<string, any>();
    for (const l of leitRes.data ?? []) {
      const chave = `${l.campanha_id}:${l.anuncio_id ?? "campanha"}`;
      if (!ultimaLeitura.has(chave)) ultimaLeitura.set(chave, l);
    }

    const campanhas = (campRes.data ?? []).map((c) => {
      const anuncios = (anunRes.data ?? [])
        .filter((a) => a.campanha_id === c.id)
        .map((a) => ({
          ...a,
          leitura: ultimaLeitura.get(`${c.id}:${a.id}`) ?? null,
        }));
      return {
        ...c,
        anuncios,
        leituraCampanha: ultimaLeitura.get(`${c.id}:campanha`) ?? null,
      };
    });

    return NextResponse.json({ campanhas });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    const perfil = perfisDe(profile);
    if (podeFazer(perfil, "Gerenciar campanhas de mídia paga") !== "faz") {
      return NextResponse.json({ error: "Acesso proibido" }, { status: 403 });
    }

    const body = await request.json();
    const { nome, plataforma, objetivo, orcamento_diario, publico, atribuicao, situacao, no_ar_desde, anuncios } = body;

    if (!nome || !plataforma) {
      return NextResponse.json({ error: "Campos obrigatórios faltando: nome e plataforma" }, { status: 400 });
    }
    if (!["meta", "google"].includes(plataforma)) {
      return NextResponse.json({ error: "Plataforma deve ser meta ou google" }, { status: 400 });
    }

    const { data: campanha, error } = await supabase
      .from("midia_campanhas")
      .insert({
        nome,
        plataforma,
        objetivo: objetivo || null,
        orcamento_diario: orcamento_diario ?? null,
        publico: publico || null,
        atribuicao: atribuicao || null,
        situacao: situacao || "no_ar",
        no_ar_desde: no_ar_desde || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Anúncios vêm como lista de nomes; linhas vazias são ignoradas.
    const nomesAnuncios: string[] = Array.isArray(anuncios)
      ? anuncios.map((a: unknown) => String(a).trim()).filter(Boolean)
      : [];

    if (nomesAnuncios.length > 0) {
      const { error: erroAnuncios } = await supabase
        .from("midia_anuncios")
        .insert(nomesAnuncios.map((n) => ({ campanha_id: campanha.id, nome: n })));
      if (erroAnuncios) {
        return NextResponse.json({ error: erroAnuncios.message }, { status: 500 });
      }
    }

    return NextResponse.json({ campanha });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
