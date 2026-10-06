import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../lib/auditoria";
import { decidirEdicao } from "../../../../lib/edicaoDoRepasse";
import { repasseDoPainelDaLinha } from "../../../../lib/repasseDoPainel";
import { falhaDoBanco, lerRepasseParaEscrita, recusar, sessaoDoRepasse } from "../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * O carro como está gravado AGORA, para a tela que ficou em dúvida (06/10): a
 * importação do feed pode gravar e a resposta se perder no caminho, e a
 * galeria relê a lista antes de gravar por cima dela. Mesma porta e mesmo
 * formato do editor: toda a equipe abre o carro (`/admin/repasse/[id]/editar`)
 * e recebe esta mesma linha.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const lido = await lerRepasseParaEscrita(createAdminSupabaseClient(), id);
    if (!lido.ok) return lido.resposta;
    return NextResponse.json({ ok: true, repasse: lido.repasse }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler o carro." }, { status: 500 });
  }
}

/**
 * Edita um carro de repasse. O portão (`decidirEdicao`) decide quem edita em
 * que situação e quais campos entram; a escrita é presa à situação LIDA —
 * se alguém publicou ou devolveu o carro no meio, o update não acha a linha
 * e a resposta é 409, em vez de gravar por cima de uma decisão que já mudou.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    const admin = createAdminSupabaseClient();
    const lido = await lerRepasseParaEscrita(admin, id);
    if (!lido.ok) return lido.resposta;

    const corpo: unknown = await request.json().catch(() => null);
    const decisao = decidirEdicao({ repasse: lido.repasse, corpo, perfis: sessao.perfis, agora: new Date() });
    if (!decisao.ok) return recusar(decisao);
    const campos = Object.keys(decisao.colunas);
    if (campos.length === 0) return NextResponse.json({ ok: true, repasse: lido.repasse });

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
        { error: "O carro mudou de situação enquanto você editava. Abra esta tela de novo." },
        { status: 409 },
      );
    }
    await registrarAcaoSensivel(admin, "repasse.editar", `${id}: ${campos.join(", ")}`, sessao.autor);
    return NextResponse.json({ ok: true, repasse });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao salvar." }, { status: 500 });
  }
}
