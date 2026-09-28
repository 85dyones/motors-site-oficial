import { NextResponse } from "next/server";
import { registrarAcaoSensivel } from "../../../../lib/auditoria";
import { COLUNAS_DO_INSCRITO, decidirMarcacaoDeInscrito, inscritoDaLinha } from "../../../../lib/avisosDoRepasse";
import { validaRepasse } from "../../../../lib/edicaoDoRepasse";
import { ehIdDeRepasse } from "../../../../lib/repasse";
import { falhaDoBanco, recusar, sessaoDoRepasse } from "../../../../lib/rotaDoRepasse";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

const naoEncontrado = () => NextResponse.json({ error: "Inscrito não encontrado." }, { status: 404 });

/** Marca ou desmarca o CNPJ do lojista como conferido. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await params;
    if (!ehIdDeRepasse(id)) return naoEncontrado();
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("repasse_inscritos").select(COLUNAS_DO_INSCRITO).eq("id", id).maybeSingle();
    if (error) return falhaDoBanco(error);
    const inscrito = data ? inscritoDaLinha(data as Record<string, unknown>) : null;
    if (!inscrito) return naoEncontrado();

    const corpo: unknown = await request.json().catch(() => null);
    const decisao = decidirMarcacaoDeInscrito({ inscrito, corpo, perfis: sessao.perfis, autorId: sessao.autor.id, agora: new Date() });
    if (!decisao.ok) return recusar(decisao);

    const gravado = await admin
      .from("repasse_inscritos")
      .update(decisao.colunas)
      .eq("id", id)
      .select(COLUNAS_DO_INSCRITO)
      .maybeSingle();
    if (gravado.error) return falhaDoBanco(gravado.error);
    const novo = gravado.data ? inscritoDaLinha(gravado.data as Record<string, unknown>) : null;
    if (!novo) {
      // Alguém apagou a linha entre a leitura e esta escrita: zero linhas
      // atualizadas não é erro de banco, mas também não é sucesso — sem isto,
      // a rota gravava auditoria falsa e devolvia 200 com dado obsoleto.
      return NextResponse.json(
        { error: "Inscrito não encontrado. A pessoa pode ter saído da lista." },
        { status: 404 },
      );
    }
    await registrarAcaoSensivel(
      admin,
      "repasse.inscrito.conferir",
      `${id}: CNPJ ${decisao.colunas.cnpj_conferido_em ? "conferido" : "desmarcado"}`,
      sessao.autor,
    );
    return NextResponse.json({ ok: true, inscrito: novo });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gravar." }, { status: 500 });
  }
}

/**
 * Tira a pessoa da lista APAGANDO a linha — é o que a /privacidade promete
 * (spec §4.2 e §7.4). Os avisos dela vão junto (`on delete cascade`). A
 * auditoria guarda só o id: nome e WhatsApp não sobrevivem à saída.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await sessaoDoRepasse();
    if (!sessao.ok) return sessao.resposta;
    if (!validaRepasse(sessao.perfis)) {
      return NextResponse.json({ error: "Só quem valida mexe na lista do repasse." }, { status: 403 });
    }
    const { id } = await params;
    if (!ehIdDeRepasse(id)) return naoEncontrado();
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("repasse_inscritos").delete().eq("id", id).select("id");
    if (error) return falhaDoBanco(error);
    if (!Array.isArray(data) || data.length === 0) return naoEncontrado();
    await registrarAcaoSensivel(admin, "repasse.inscrito.remover", id, sessao.autor);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao tirar da lista." }, { status: 500 });
  }
}
