import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { ehStaff, normalizarPerfil, podeFazer } from "../../../../lib/permissoes";
import { registrarAcaoSensivel } from "../../../../lib/auditoria";
import {
  validarFechamentoDeVenda,
  type DadosDaVenda,
} from "../../../../lib/ciclo/vendaFechamento";

export const dynamic = "force-dynamic";

/**
 * Fechamento de venda do Ciclo — tela A19, manual v1.1 §3.
 *
 * A rota valida duas vezes de propósito, e nenhuma das duas é a autoridade:
 *
 *   1. `validarFechamentoDeVenda` roda aqui para devolver a lista inteira do
 *      que falta, com mensagem em português. É o que a tela mostra.
 *   2. `fechar_venda_ciclo` no banco valida de novo e é quem manda — porque é
 *      a única camada que grava em transação. Se a lista daqui um dia divergir
 *      da de lá, o banco recusa e a rota traduz a recusa.
 *
 * Escrever em seis tabelas por aqui, com o cliente JS, não teria transação: a
 * falha na quarta escrita deixaria as três primeiras, e o resultado seria a
 * venda registrada pela metade que o §0 do manual proíbe.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (!ehStaff(profile?.role)) {
      return NextResponse.json({ error: "Acesso restrito à equipe" }, { status: 403 });
    }
    const perfil = normalizarPerfil(profile?.role);
    if (podeFazer(perfil, "Fechar venda do Ciclo") !== "faz") {
      return NextResponse.json(
        { error: "Seu perfil não fecha venda do Ciclo" },
        { status: 403 },
      );
    }

    const dados = (await request.json()) as DadosDaVenda;

    const problemas = validarFechamentoDeVenda(dados);
    if (problemas.length > 0) {
      return NextResponse.json(
        { error: "A venda não pode ser fechada com campo obrigatório vazio.", problemas },
        { status: 422 },
      );
    }

    const { data, error } = await supabase.rpc("fechar_venda_ciclo", { dados });

    if (error) {
      const msg = error.message ?? "";

      // O banco recusou por campo faltando — traduz de volta para a lista que
      // a tela sabe destacar.
      if (msg.includes("VENDA_INCOMPLETA")) {
        const campos = msg.split("VENDA_INCOMPLETA:")[1]?.trim().split(",") ?? [];
        return NextResponse.json(
          {
            error: "A venda não pode ser fechada com campo obrigatório vazio.",
            problemas: campos.map((campo) => ({
              campo: campo.trim(),
              mensagem: "Obrigatório pelo manual §3.1.",
            })),
          },
          { status: 422 },
        );
      }

      if (msg.includes("CHASSI_JA_REGISTRADO")) {
        return NextResponse.json(
          {
            error: "Este chassi já tem venda registrada.",
            problemas: [{ campo: "chassi", mensagem: "Já existe uma venda com este chassi." }],
          },
          { status: 409 },
        );
      }

      if (msg.includes("VENDA_INVALIDA")) {
        const campo = msg.split("VENDA_INVALIDA:")[1]?.trim() ?? "";
        return NextResponse.json(
          { error: "Valor inválido.", problemas: [{ campo, mensagem: "Valor inválido." }] },
          { status: 422 },
        );
      }

      console.error("[Ciclo/Vendas] Falha ao fechar venda:", msg);
      return NextResponse.json({ error: "Não foi possível fechar a venda." }, { status: 500 });
    }

    await registrarAcaoSensivel(
      supabase,
      "Fechar venda do Ciclo",
      `Chassi ${String(dados.chassi ?? "").toUpperCase()} · placa ${String(dados.placa ?? "").toUpperCase()} · cliente ${dados.nome}`,
      { id: user.id, nome: profile?.full_name ?? user.email },
    );

    return NextResponse.json({ ok: true, ...(data ?? {}) }, { status: 201 });
  } catch (err: any) {
    console.error("[Ciclo/Vendas] Erro inesperado:", err?.message);
    return NextResponse.json({ error: "Erro ao processar a venda." }, { status: 500 });
  }
}
