import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../../lib/auditoria";
import { repasseDoPainelDaLinha } from "../../../../../lib/repasseDoPainel";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../../lib/supabase-server";
import { decidirTransicao } from "../../../../../lib/transicoesDoRepasse";

export const dynamic = "force-dynamic";

/**
 * Muda a situação de um carro de repasse (spec §5). Quem pode, de onde para
 * onde e o que se grava é `decidirTransicao`; aqui só a fiação — ler, decidir,
 * gravar preso à situação lida, auditar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const admin = createAdminSupabaseClient();
    const lido = await lerRepasseParaEscrita(admin, id);
    if (!lido.ok) return lido.resposta;

    const corpo: unknown = await request.json().catch(() => null);
    const pedido = corpo && typeof corpo === "object" ? (corpo as { ato?: unknown; nota?: unknown }) : {};
    const decisao = decidirTransicao({
      repasse: lido.repasse,
      ato: pedido.ato,
      nota: pedido.nota,
      perfis: sessao.perfis,
      autorId: sessao.autor.id,
      agora: new Date(),
    });
    if (!decisao.ok) return recusar(decisao);

    const { data, error } = await admin
      .from("repasses")
      .update(decisao.colunas)
      .eq("id", id)
      .eq("situacao", lido.repasse.situacao)
      .select("*")
      .maybeSingle();
    if (error) return falhaDoBanco(error);
    const repasse = data ? repasseDoPainelDaLinha(data as Record<string, unknown>) : null;
    if (!repasse) {
      return NextResponse.json(
        { error: "O carro mudou de situação enquanto você decidia. Recarregue a página." },
        { status: 409 },
      );
    }
    const { marca, modelo, situacao } = lido.repasse;
    // A nota da devolução some do carro no reenvio (`enviar` zera
    // `devolvido_com`); a auditoria é a única trilha do que o validador pediu.
    // É texto da equipe, não dado da lista, então pode ir para o log.
    const nota = decisao.ato === "devolver" && decisao.colunas.devolvido_com ? ` · nota: ${decisao.colunas.devolvido_com}` : "";
    await registrarAcaoSensivel(
      admin,
      `repasse.${decisao.ato}`,
      `${marca} ${modelo} (${id}): ${situacao} → ${decisao.colunas.situacao}${nota}`,
      sessao.autor,
    );
    return NextResponse.json({ ok: true, repasse });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao mudar a situação." }, { status: 500 });
  }
}
