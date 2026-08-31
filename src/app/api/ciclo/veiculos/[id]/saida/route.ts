import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { ehStaff, perfisDe, podeFazer } from "../../../../../../lib/permissoes";
import { validarSaida } from "../../../../../../lib/ciclo/saida";
import { registrarAcaoSensivel } from "../../../../../../lib/auditoria";

export const dynamic = "force-dynamic";

/**
 * Marca que o carro deixou de ser do cliente — o fim do vitalício da Garagem.
 *
 * Não apaga nada: o diário de bordo continua legível para o cliente, porque o
 * dado é dele e o §6.3 não prevê apagá-lo porque o carro trocou de mãos. O que
 * a saída desliga é o futuro — gerador de janelas, gatilhos e escrita nova.
 *
 * Mesmo gate da fila de verificação (Admin e Comercial): é a tela onde o
 * controle vive, e a matriz A17 é decisão do dono, não coisa a se acrescentar
 * de passagem.
 */
async function autorizar() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { erro: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, papeis, full_name")
    .eq("id", user.id)
    .single();
  if (!ehStaff(profile)) {
    return { erro: NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 }) };
  }
  if (podeFazer(perfisDe(profile), "Verificar revisão do diário de bordo") !== "faz") {
    return {
      erro: NextResponse.json(
        { error: "Seu perfil não opera o diário de bordo" },
        { status: 403 },
      ),
    };
  }
  return { supabase, user, profile };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await autorizar();
  if ("erro" in auth) return auth.erro;
  const { supabase, user, profile } = auth;

  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const dados = {
    saiu_em: String((corpo as Record<string, unknown>).saiu_em ?? "").trim(),
    motivo_saida: String((corpo as Record<string, unknown>).motivo_saida ?? "").trim(),
  };

  const problemas = validarSaida(dados);
  if (problemas.length > 0) {
    return NextResponse.json({ error: problemas[0].mensagem, problemas }, { status: 422 });
  }

  // `.select("id")` não é enfeite: sem ele, um update que casa ZERO linhas —
  // id inexistente, ou a RLS barrando em silêncio — devolve `error: null`, e a
  // tela anuncia "Saída registrada" sem que nada tenha acontecido. Mesmo
  // padrão do vínculo da venda (`api/ciclo/vendas/route.ts`, achado #7).
  const { data: marcados, error } = await supabase
    .from("veiculos_vendidos")
    .update({ saiu_em: dados.saiu_em, motivo_saida: dados.motivo_saida })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[Ciclo/Saída] Falha ao marcar a saída:", error.message);
    return NextResponse.json({ error: "Não foi possível marcar a saída." }, { status: 502 });
  }

  if ((marcados ?? []).length === 0) {
    console.error("[Ciclo/Saída] Nenhuma linha casou com o veículo", id);
    return NextResponse.json(
      { error: "Veículo não encontrado — a saída não foi registrada." },
      { status: 404 },
    );
  }

  // Marcar saída silencia o programa inteiro de um cliente: sem gerador de
  // janelas, sem os quatro gatilhos, sem escrita nova no diário. Ação assim
  // precisa de dono e de data — a rota irmã da mesma tela (verificar) já
  // registra, e a assimetria não era intencional.
  await registrarAcaoSensivel(
    supabase,
    "Marcar saída da Garagem",
    `Saída do veículo ${id} em ${dados.saiu_em} — motivo: ${dados.motivo_saida}`,
    { id: user.id, nome: profile?.full_name ?? user.email },
  );

  return NextResponse.json({ ok: true });
}
