import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { validarRevisao } from "../../../../lib/ciclo/revisao";

export const dynamic = "force-dynamic";

/**
 * O cliente lança uma revisão no diário de bordo — manual v1.1 §5.7.
 *
 * O lançamento nasce PENDENTE, sempre: a policy
 * `manutencoes_cliente_registra` obriga `origem_registro = 'cliente'`, sem
 * carimbo, sem `dentro_da_janela` — quem valida é a loja, contra a foto da
 * etiqueta (fila da A21, que o motor de gatilhos avisa todo dia). Registrar
 * não é o ativo; o carimbo é.
 *
 * Igual à rota de KM: cliente da sessão, RLS decide. Sem chave de serviço.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Entre pela sua garagem para registrar." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => ({} as any));

  const dados = {
    veiculo_vendido_id: String(corpo?.veiculo_vendido_id ?? "").trim() || null,
    data_servico: String(corpo?.data_servico ?? "").trim() || null,
    km_registrado: corpo?.km_registrado,
  };

  const problemas = validarRevisao(dados);
  if (problemas.length > 0) {
    return NextResponse.json(
      { error: problemas[0].mensagem, problemas },
      { status: 422 },
    );
  }

  // Data no futuro não entra: revisão é registro do que aconteceu. (A régua
  // da janela quem aplica é o carimbo — aqui é só sanidade de calendário.)
  const hoje = new Date().toISOString().slice(0, 10);
  if (String(dados.data_servico) > hoje) {
    return NextResponse.json(
      { error: "A data do serviço não pode estar no futuro." },
      { status: 422 },
    );
  }

  const observacoes = String(corpo?.observacoes ?? "").trim().slice(0, 500) || null;

  const { data: criada, error } = await supabase
    .from("manutencoes")
    .insert({
      veiculo_vendido_id: dados.veiculo_vendido_id,
      tipo: "revisao_programada",
      data_servico: dados.data_servico,
      km_registrado: Number(dados.km_registrado),
      origem_registro: "cliente",
      observacoes,
    })
    .select("id")
    .single();

  if (error || !criada) {
    if (error?.code === "42501") {
      return NextResponse.json({ error: "Este veículo não está na sua garagem." }, { status: 403 });
    }
    console.error("[Garagem/Revisões] Falha ao lançar:", error?.message);
    return NextResponse.json({ error: "Não deu para lançar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: criada.id }, { status: 201 });
}
