import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import { validarRevisao, type DadosDaRevisao } from "../../../../lib/ciclo/revisao";

export const dynamic = "force-dynamic";

/**
 * A caderneta, do lado da loja — fila de carimbos (tela A21) e registro de
 * revisão pela equipe.
 *
 * O gate é a linha "Confirmar revisão da caderneta" da matriz A17: Admin e
 * Comercial (decisão do dono, 2026-08-13 — o Comercial é o dono da fila).
 */

async function autorizar() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile?.role)) {
    return { erro: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  if (podeFazer(normalizarPerfil(profile?.role), "Confirmar revisão da caderneta") !== "faz") {
    return {
      erro: NextResponse.json({ error: "Seu perfil não opera a caderneta" }, { status: 403 }),
    };
  }
  return { supabase, user, nome: profile?.full_name ?? user.email };
}

export async function GET() {
  const auth = await autorizar();
  if ("erro" in auth) return auth.erro;
  const { supabase } = auth;

  const selecaoDeRevisao = `
    id, tipo, numero_revisao, data_servico, km_registrado, origem_registro,
    confirmada_em, dentro_da_janela, url_etiqueta_anterior, url_etiqueta_atual,
    url_nota_servico, observacoes, criada_em,
    veiculo:veiculos_vendidos ( id, placa, marca, modelo, km_na_venda,
      cliente:clientes ( nome ) )
  `;

  // A fila: o que foi registrado e ninguém validou. Mais antigo primeiro —
  // fila é fila.
  const { data: pendentes, error: erroPendentes } = await supabase
    .from("manutencoes")
    .select(selecaoDeRevisao)
    .is("confirmada_em", null)
    .order("criada_em", { ascending: true })
    .limit(100);

  if (erroPendentes) {
    console.error("[Ciclo/Revisões] Falha ao ler a fila:", erroPendentes.message);
    return NextResponse.json({ error: "Não foi possível ler a fila." }, { status: 502 });
  }

  const { data: recentes, error: erroRecentes } = await supabase
    .from("manutencoes")
    .select(selecaoDeRevisao)
    .not("confirmada_em", "is", null)
    .order("confirmada_em", { ascending: false })
    .limit(20);

  if (erroRecentes) {
    console.error("[Ciclo/Revisões] Falha ao ler carimbos recentes:", erroRecentes.message);
    return NextResponse.json({ error: "Não foi possível ler os carimbos." }, { status: 502 });
  }

  // Para o formulário de registro: os veículos do programa.
  const { data: veiculos, error: erroVeiculos } = await supabase
    .from("veiculos_vendidos")
    .select("id, placa, marca, modelo, km_na_venda, cliente:clientes ( nome )")
    .order("created_at", { ascending: false })
    .limit(300);

  if (erroVeiculos) {
    console.error("[Ciclo/Revisões] Falha ao listar veículos:", erroVeiculos.message);
    return NextResponse.json({ error: "Não foi possível listar os veículos." }, { status: 502 });
  }

  return NextResponse.json({
    pendentes: pendentes ?? [],
    recentes: recentes ?? [],
    veiculos: veiculos ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await autorizar();
  if ("erro" in auth) return auth.erro;
  const { supabase } = auth;

  try {
    const dados = (await request.json()) as DadosDaRevisao;

    const problemas = validarRevisao(dados);
    if (problemas.length > 0) {
      return NextResponse.json(
        { error: "A revisão não pode ser registrada assim.", problemas },
        { status: 422 },
      );
    }

    // A equipe registra como loja ou parceiro. `cliente` é do cliente, pelo
    // app dele — registrar em nome do cliente mascararia a origem do dado.
    const origem = dados.origem_registro === "parceiro" ? "parceiro" : "loja";

    const { data: criada, error } = await supabase
      .from("manutencoes")
      .insert({
        veiculo_vendido_id: dados.veiculo_vendido_id,
        tipo: "revisao_programada",
        numero_revisao: dados.numero_revisao ? Number(dados.numero_revisao) : null,
        data_servico: dados.data_servico,
        km_registrado: Number(dados.km_registrado),
        origem_registro: origem,
        parceiro_id: dados.parceiro_id || null,
        valor_servico: dados.valor_servico ? Number(dados.valor_servico) : null,
        url_etiqueta_anterior: dados.url_etiqueta_anterior || null,
        url_etiqueta_atual: dados.url_etiqueta_atual || null,
        observacoes: dados.observacoes || null,
      })
      .select("id")
      .single();

    if (error || !criada) {
      console.error("[Ciclo/Revisões] Falha ao registrar:", error?.message);
      return NextResponse.json({ error: "Não foi possível registrar a revisão." }, { status: 500 });
    }

    // Registrar e carimbar no mesmo gesto: o caminho comum quando a própria
    // loja fez o serviço e está com as etiquetas na mão.
    if (dados.confirmar) {
      const { data: carimbo, error: erroCarimbo } = await supabase.rpc("carimbar_revisao", {
        p_manutencao: criada.id,
        p_aceitar: true,
      });
      if (erroCarimbo) {
        // O registro ficou — na fila, como pendente. Melhor que desfazer:
        // o dado existe e a fila é o lugar de resolver.
        return NextResponse.json(
          {
            ok: true,
            id: criada.id,
            carimbo: null,
            aviso: "Registrada, mas o carimbo falhou — está na fila como pendente.",
          },
          { status: 201 },
        );
      }
      return NextResponse.json({ ok: true, id: criada.id, carimbo }, { status: 201 });
    }

    return NextResponse.json({ ok: true, id: criada.id, carimbo: null }, { status: 201 });
  } catch (err: any) {
    console.error("[Ciclo/Revisões] Erro inesperado:", err?.message);
    return NextResponse.json({ error: "Erro ao processar a revisão." }, { status: 500 });
  }
}
